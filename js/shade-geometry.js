// ============================================================
// balco.nyc: Shade geometry (pure, no Three.js)
// ============================================================
// Projects NYC building footprints and street trees into the local metric
// frame the shade model and the 3D scene share: x east, z south (north is
// -z), y up, metres, origin at the target building's centroid. Also builds
// the canonical street canyons used when an address has no footprint data.
//
// Everything here is plain arithmetic so the horizon model can run without
// WebGL (the manual and screen-reader path), and so tests can exercise it.
// ============================================================

const ShadeGeometry = {
  M_PER_DEG_LAT: 111320,
  FT_TO_M: 0.3048,

  /** Exterior ring of the first polygon of a GeoJSON or Socrata feature. */
  extractCoords(feature) {
    if (!feature) return null;
    let geom = feature.geometry;
    if (!geom && feature.the_geom) {
      try {
        geom = typeof feature.the_geom === 'string' ? JSON.parse(feature.the_geom) : feature.the_geom;
      } catch (e) { return null; }
    }
    if (!geom || !geom.coordinates) return null;
    if (geom.type === 'MultiPolygon') return geom.coordinates[0][0];
    if (geom.type === 'Polygon') return geom.coordinates[0];
    return null;
  },

  props(feature) {
    return (feature && feature.properties) || feature || {};
  },

  centroid(coords) {
    let latSum = 0, lonSum = 0, n = 0;
    // A closed ring repeats its first vertex; do not count it twice.
    const last = coords.length > 1 &&
      coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1]
      ? coords.length - 1 : coords.length;
    for (let i = 0; i < last; i++) { lonSum += coords[i][0]; latSum += coords[i][1]; n++; }
    return { lat: latSum / n, lon: lonSum / n };
  },

  /** Local frame anchored on a lat/lon. */
  makeOrigin(lat, lon, groundElevFt) {
    return {
      lat, lon,
      mPerDegLat: this.M_PER_DEG_LAT,
      mPerDegLon: this.M_PER_DEG_LAT * Math.cos(lat * Math.PI / 180),
      groundElevFt: groundElevFt || 0,
    };
  },

  toLocal(origin, lon, lat) {
    return {
      x: (lon - origin.lon) * origin.mPerDegLon,
      z: -(lat - origin.lat) * origin.mPerDegLat,
    };
  },

  /**
   * Project one footprint feature into the local frame.
   * @returns {{ localCoords, heightMeters, heightFt, elevOffset, centroid, bin, isTarget, feature } | null}
   */
  projectFeature(feature, origin, isTarget, defaultHeightFt) {
    const coords = this.extractCoords(feature);
    if (!coords || coords.length < 3) return null;
    const p = this.props(feature);
    const heightFt = parseFloat(p.height_roof || p.heightroof) || defaultHeightFt || 40;
    const groundElevFt = parseFloat(p.ground_elevation || p.groundelev || 0) || 0;
    const heightMeters = heightFt * this.FT_TO_M;
    const elevOffset = (groundElevFt - origin.groundElevFt) * this.FT_TO_M;

    const localCoords = [];
    for (const [lon, lat] of coords) localCoords.push(this.toLocal(origin, lon, lat));
    // Drop the closing vertex; the model treats the ring as implicitly closed.
    if (localCoords.length > 1) {
      const a = localCoords[0], b = localCoords[localCoords.length - 1];
      if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6) localCoords.pop();
    }
    if (localCoords.length < 3) return null;

    const c = this.centroid(coords);
    const cl = this.toLocal(origin, c.lon, c.lat);
    return {
      localCoords,
      heightMeters,
      heightFt,
      elevOffset,
      centroid: { x: cl.x, y: heightMeters / 2 + elevOffset, z: cl.z },
      bin: (p.bin || '').toString(),
      isTarget: !!isTarget,
      feature,
    };
  },

  /**
   * Build the local scene: the target building plus every distinct neighbour.
   * Neighbours sharing the target's BIN, and duplicate BINs across the tiered
   * queries, are dropped.
   */
  buildEntries(targetFeature, neighborFeatures, options = {}) {
    const defaultHeightFt = options.defaultHeightFt || 40;
    const coords = this.extractCoords(targetFeature);
    if (!coords || coords.length < 3) return null;
    const c = this.centroid(coords);
    const tp = this.props(targetFeature);
    const origin = this.makeOrigin(c.lat, c.lon, parseFloat(tp.ground_elevation || tp.groundelev || 0) || 0);

    const target = this.projectFeature(targetFeature, origin, true, defaultHeightFt);
    if (!target) return null;

    const neighbors = [];
    const seen = new Set();
    if (target.bin) seen.add(target.bin);
    for (const f of neighborFeatures || []) {
      const bin = (this.props(f).bin || '').toString();
      if (bin && seen.has(bin)) continue;
      const e = this.projectFeature(f, origin, false, defaultHeightFt);
      if (!e) continue;
      if (bin) seen.add(bin);
      neighbors.push(e);
    }
    return { origin, target, neighbors };
  },

  /** Horizontal distance from the origin to an entry's nearest vertex. */
  nearestDistance(entry) {
    let d = Infinity;
    for (const p of entry.localCoords) d = Math.min(d, Math.hypot(p.x, p.z));
    return d;
  },

  /**
   * Street trees as crown cylinders. DBH in inches from the Forestry Tree
   * Points dataset; crown dimensions from a simple allometry.
   * @param {Array} points - rows with location {coordinates:[lon,lat]} and dbh
   */
  projectTrees(points, origin, model) {
    const out = [];
    for (const t of points || []) {
      const loc = t.location && t.location.coordinates;
      if (!loc) continue;
      const dbh = Math.max(2, parseFloat(t.dbh) || 6);
      const p = this.toLocal(origin, loc[0], loc[1]);
      out.push({
        x: p.x, z: p.z, dbhIn: dbh,
        crownBase: model.crownBaseM,
        crownTop: Math.min(model.crownTopMaxM, model.crownTopA + model.crownTopB * dbh),
        radius: Math.min(model.radiusMaxM, model.radiusA + model.radiusB * dbh),
        species: t.genusspecies || '',
      });
    }
    return out;
  },

  /**
   * A synthetic block for addresses without footprint data: the visitor's
   * building (width 40 m along the facade, 16 m deep) facing azimuthDeg, and a
   * long opposite row across a street of the given width.
   * @returns {{ target, neighbors }} entries in the local frame
   */
  canonicalCanyon(kind, canyon, options) {
    const az = (options.azimuthDeg || 180) * Math.PI / 180;
    const nx = Math.sin(az), nz = -Math.cos(az);          // facade normal (north = -z)
    const tx = -nz, tz = nx;                               // along the facade
    const rect = (cx, cz, halfAlong, halfDeep, height) => ({
      isTarget: false, heightMeters: height, elevOffset: 0, bin: '',
      localCoords: [
        { x: cx + tx * halfAlong - nx * halfDeep, z: cz + tz * halfAlong - nz * halfDeep },
        { x: cx + tx * halfAlong + nx * halfDeep, z: cz + tz * halfAlong + nz * halfDeep },
        { x: cx - tx * halfAlong + nx * halfDeep, z: cz - tz * halfAlong + nz * halfDeep },
        { x: cx - tx * halfAlong - nx * halfDeep, z: cz - tz * halfAlong - nz * halfDeep },
      ],
      centroid: { x: cx, y: height / 2, z: cz },
    });
    const ownHeight = Math.max(3, options.totalFloors * (options.storeyM || 3.0));
    const target = Object.assign(rect(0, 0, 20, 8, ownHeight), { isTarget: true });
    const neighbors = [];
    if (canyon) {
      // Opposite row: its near facade sits streetM beyond our facade (which is 8 m from the centroid).
      const dist = 8 + canyon.streetM + 10;
      neighbors.push(rect(nx * dist, nz * dist, 60, 10, canyon.oppositeM));
    }
    return { target, neighbors, kind };
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ShadeGeometry };
}
