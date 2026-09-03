// ============================================================
// balco.nyc: Shade Model
// ============================================================
// Builds a horizon profile of the surrounding buildings (and street trees)
// as seen from the user's balcony, then derates PVWatts output by the
// fraction of plane-of-array irradiance that those obstructions remove.
//
// The factor multiplies PVWatts output, so it must answer only "how much of
// what PVWatts assumed reaches this balcony". PVWatts already prices the
// panel's own tilt and azimuth, so hours when the sun is behind the facade
// are worth little in BOTH the numerator and the denominator: they are not
// a penalty. An unobstructed balcony returns 1.0 at every orientation.
//
// Three components are derated separately:
//   beam         lost when the sun is below the skyline, above the balcony
//                slab, or behind a tree crown (partly);
//   sky diffuse  scaled by the panel's sky-view fraction through the same
//                skyline, slab and crowns;
//   ground light scaled by how open the street in front of the panel is,
//                since buildings shade the street but do not hide it.
// Each is weighted by the NSRDB typical-year irradiance for NYC at that
// month and hour (js/irradiance-nyc.js) rather than a clear-sky proxy.
//
// Pure arithmetic: needs SunPosition, IrradianceNYC, SolarConfig and the
// entries produced by ShadeGeometry. Three.js is touched only to draw the
// balcony marker when a scene exists, so the same code runs headless for
// the manual-entry and screen-reader path.
// ============================================================

const ShadowModel = {
  // --- State ---
  buildings: [],             // entries {isTarget, localCoords, heightMeters, elevOffset, ...}
  target: null,
  trees: [],                 // {x, z, crownBase, crownTop, radius}
  balconyPoint: null,        // {x, y, z} in the local frame (north = -z)
  balconyAzimuth: 0,         // radians, clockwise from north
  floor: 1,
  totalFloors: 1,
  storeyM: 3.0,
  mountType: 'rail',
  facadeEdge: null,
  initialized: false,

  // Derived, cached per init()
  horizonProfile: null,      // Float64Array(360): max obstruction altitude (rad) per azimuth bin
  ceilingProfile: null,      // Float64Array(360) or null: slab-above limit (rad) per bin
  groundOpenFraction: null,  // horizontal sky view of the street in front
  treeMaskLeaf: null,        // Float32Array(360*90) transmittance or null
  treeMaskBare: null,

  // --- Model constants ---
  HORIZON_BINS: 360,
  ALT_BINS: 90,
  SAMPLE_STEP_MIN: 10,       // daylight sweep step
  SAMPLE_DAYS: [8, 23],      // two representative days per month
  EDGE_SAMPLE_M: 2.0,        // footprint edge subdivision
  EDGE_SAMPLE_RAD: 0.5 * Math.PI / 180,
  BALCONY_DEPTH_M: 1.5,      // panel plane sits this far outside the facade line
  GROUND_VIEW_OFFSET_M: 6,   // where the panel's downward view lands on the street
  MIN_FACTOR: 0.02,
  MONTH_DAYS: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
  MONTH_START_DOY: [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334],

  // Heatmap colours (display only)
  COLORS: {
    target:  0x3399FF,
    high:    0xCC3322,
    medium:  0xD06830,
    low:     0xCCA050,
    none:    0x544840,
    night:   0x2a2420,
  },

  // ------------------------------------------------------------
  // Inputs
  // ------------------------------------------------------------

  /** Provide the projected footprints (target included). Invalidates caches. */
  setBuildings(entries) {
    this.buildings = (entries || []).filter(e => e && e.localCoords && e.localCoords.length >= 3);
    this.target = this.buildings.find(e => e.isTarget) || null;
    this._invalidate();
  },

  /** Provide projected street trees. Invalidates caches. */
  setTrees(trees) {
    this.trees = trees || [];
    this._invalidate();
  },

  _invalidate() {
    this.horizonProfile = null;
    this.ceilingProfile = null;
    this.groundOpenFraction = null;
    this.treeMaskLeaf = null;
    this.treeMaskBare = null;
  },

  /** Storey height from the building's own geometry, kept plausible. */
  storeyHeight(heightMeters, totalFloors) {
    const S = SolarConfig.STOREY_M;
    if (!heightMeters || !totalFloors) return S.default;
    return Math.max(S.min, Math.min(S.max, heightMeters / totalFloors));
  },

  /** Floor number implied by a height above the building's ground level. */
  floorFromHeight(yAboveGround, heightMeters, totalFloors) {
    const storey = this.storeyHeight(heightMeters, totalFloors);
    return Math.max(1, Math.min(totalFloors, Math.floor(yAboveGround / storey) + 1));
  },

  /**
   * Place the panel and prepare the geometry.
   * @param {object} opts
   *   floor, totalFloors, azimuthDeg   required
   *   clickPoint {x, z}                optional: where on the facade the visitor clicked
   *   mountType                        'rail' | 'floor' | 'wall' (SolarConfig.MOUNT_TYPES)
   */
  init(opts) {
    const target = this.target;
    this.floor = Math.max(1, Math.round(opts.floor || 1));
    this.totalFloors = Math.max(this.floor, Math.round(opts.totalFloors || 1));
    this.balconyAzimuth = ((opts.azimuthDeg % 360) + 360) % 360 * Math.PI / 180;
    this.mountType = SolarConfig.MOUNT_TYPES[opts.mountType] ? opts.mountType : SolarConfig.MOUNT_TYPE_DEFAULT;

    const heightM = target ? target.heightMeters : this.totalFloors * SolarConfig.STOREY_M.default;
    const elev = target ? (target.elevOffset || 0) : 0;
    this.storeyM = this.storeyHeight(heightM, this.totalFloors);
    const y = elev + (this.floor - 1) * this.storeyM + SolarConfig.PANEL_CENTRE_ABOVE_SLAB_M;

    // Horizontal position: on the facade whose outward normal best matches the
    // chosen direction, at the click if we have one, else at the facade midpoint,
    // pushed out to the panel plane.
    const coords = target ? target.localCoords : null;
    const edge = coords ? this._findFacadeEdge(coords, opts.azimuthDeg) : null;
    this.facadeEdge = edge;
    let x = 0, z = 0;
    if (edge) {
      let px = (edge.p1.x + edge.p2.x) / 2, pz = (edge.p1.z + edge.p2.z) / 2;
      if (opts.clickPoint) {
        const proj = this._projectOntoSegment(opts.clickPoint, edge.p1, edge.p2);
        px = proj.x; pz = proj.z;
      }
      x = px + edge.normal.x * this.BALCONY_DEPTH_M;
      z = pz + edge.normal.z * this.BALCONY_DEPTH_M;
    } else if (target) {
      x = target.centroid.x; z = target.centroid.z;
    }
    this.balconyPoint = { x, y, z };

    this._invalidate();
    this._addBalconyMarker(edge);
    this.initialized = true;
  },

  _projectOntoSegment(p, a, b) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    if (len2 === 0) return { x: a.x, z: a.z };
    let t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2;
    t = Math.max(0.05, Math.min(0.95, t));   // stay off the corners
    return { x: a.x + dx * t, z: a.z + dz * t };
  },

  /** The polygon edge whose outward normal best matches the given azimuth. */
  _findFacadeEdge(localCoords, azimuthDeg) {
    if (!localCoords || localCoords.length < 3) return null;
    const targetAngle = azimuthDeg * Math.PI / 180;
    let bestEdge = null, bestScore = -Infinity;

    let cx = 0, cz = 0;
    for (const p of localCoords) { cx += p.x; cz += p.z; }
    cx /= localCoords.length; cz /= localCoords.length;

    const n = localCoords.length;
    for (let i = 0; i < n; i++) {
      const p1 = localCoords[i], p2 = localCoords[(i + 1) % n];
      const edgeDx = p2.x - p1.x, edgeDz = p2.z - p1.z;
      const edgeLen = Math.sqrt(edgeDx * edgeDx + edgeDz * edgeDz);
      if (edgeLen < 0.5) continue;

      const n1 = { x: -edgeDz / edgeLen, z: edgeDx / edgeLen };
      const n2 = { x: edgeDz / edgeLen, z: -edgeDx / edgeLen };
      const midX = (p1.x + p2.x) / 2, midZ = (p1.z + p2.z) / 2;
      const dot1 = n1.x * (cx - midX) + n1.z * (cz - midZ);
      const normal = dot1 < 0 ? n1 : n2;                 // outward = away from centroid
      const normalAngle = Math.atan2(normal.x, -normal.z); // 0 = north (-z), 90 = east

      let angleDiff = normalAngle - targetAngle;
      while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
      while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
      const score = Math.cos(angleDiff) * edgeLen;
      if (score > bestScore) {
        bestScore = score;
        bestEdge = { p1, p2, edgeLen, normal, normalAngle, index: i };
      }
    }
    return bestEdge;
  },

  _addBalconyMarker(facadeEdge) {
    if (typeof THREE === 'undefined' || typeof Scene3D === 'undefined' || !Scene3D.scene) return;
    if (this._marker) { Scene3D.scene.remove(this._marker); this._marker = null; }
    if (this._ring) { Scene3D.scene.remove(this._ring); this._ring = null; }
    const markerGeo = new THREE.SphereGeometry(1.5, 16, 16);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0x00ffaa, transparent: true, opacity: 0.8 });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.position.set(this.balconyPoint.x, this.balconyPoint.y, this.balconyPoint.z);
    Scene3D.scene.add(marker);
    this._marker = marker;
    if (facadeEdge) {
      const ringGeo = new THREE.RingGeometry(0.3, Math.min(6, facadeEdge.edgeLen * 0.6), 4);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffaa, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(this.balconyPoint.x, this.balconyPoint.y, this.balconyPoint.z);
      Scene3D.scene.add(ring);
      this._ring = ring;
    }
  },

  // ------------------------------------------------------------
  // Geometry: horizon, slab ceiling, trees, street openness
  // ------------------------------------------------------------

  _binOf(azimuthRad) {
    const n = this.HORIZON_BINS;
    let b = Math.floor((((azimuthRad % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * n);
    if (b >= n) b = n - 1;
    return b;
  },

  /**
   * Project every footprint (the visitor's own building included, so wings
   * and courtyards count) onto an azimuth-binned skyline of maximum
   * obstruction altitude as seen from `viewer`.
   */
  buildHorizonProfile(viewer) {
    const n = this.HORIZON_BINS;
    const profile = new Float64Array(n).fill(-Math.PI / 2);
    if (!viewer) return profile;

    for (const entry of this.buildings) {
      const topY = entry.heightMeters + (entry.elevOffset || 0);
      const height = topY - viewer.y;
      if (height <= 0) continue;                       // not above the viewer: cannot block
      const coords = entry.localCoords;
      const m = coords.length;
      for (let i = 0; i < m; i++) {
        const a = coords[i], b = coords[(i + 1) % m];
        const segLen = Math.hypot(b.x - a.x, b.z - a.z);
        if (segLen < 0.01) continue;
        const azA = Math.atan2(a.x - viewer.x, -(a.z - viewer.z));
        const azB = Math.atan2(b.x - viewer.x, -(b.z - viewer.z));
        let dAz = Math.abs(azB - azA);
        if (dAz > Math.PI) dAz = 2 * Math.PI - dAz;
        const steps = Math.max(2, Math.ceil(segLen / this.EDGE_SAMPLE_M), Math.ceil(dAz / this.EDGE_SAMPLE_RAD));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const dx = a.x + (b.x - a.x) * t - viewer.x;
          const dz = a.z + (b.z - a.z) * t - viewer.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 1) continue;                      // the wall the panel hangs on
          const beta = Math.atan2(height, dist);
          const bin = this._binOf(Math.atan2(dx, -dz));
          if (beta > profile[bin]) profile[bin] = beta;
        }
      }
    }
    return profile;
  },

  /**
   * The balcony slab above the panel as an upper altitude limit per azimuth
   * bin. A slab whose edge projects d beyond the panel plane, with its
   * underside h above the panel centre, hides everything above
   * atan(h * cos(dAz) / d) in front of the panel. Null when there is no slab
   * (top floor) or no overhang (panel hangs outside the railing).
   */
  buildCeilingProfile() {
    const d = (SolarConfig.MOUNT_TYPES[this.mountType] || {}).overhangM || 0;
    if (d < 0.05 || this.floor >= this.totalFloors) return null;
    const h = Math.max(0.5, this.storeyM - SolarConfig.PANEL_CENTRE_ABOVE_SLAB_M);
    const n = this.HORIZON_BINS;
    const ceiling = new Float64Array(n).fill(Math.PI / 2);
    for (let b = 0; b < n; b++) {
      const az = (b + 0.5) / n * 2 * Math.PI;
      let dAz = az - this.balconyAzimuth;
      while (dAz > Math.PI) dAz -= 2 * Math.PI;
      while (dAz < -Math.PI) dAz += 2 * Math.PI;
      const c = Math.cos(dAz);
      ceiling[b] = c <= 0 ? 0 : Math.atan2(h * c, d);
    }
    return ceiling;
  },

  /**
   * Street trees as transmittance masks over (azimuth bin, altitude degree):
   * one for the leaf season, one for bare branches. 1 = clear.
   */
  buildTreeMasks(viewer) {
    if (!this.trees.length) return { leaf: null, bare: null };
    const M = SolarConfig.TREE_MODEL;
    const n = this.HORIZON_BINS, na = this.ALT_BINS;
    const leaf = new Float32Array(n * na).fill(1);
    const bare = new Float32Array(n * na).fill(1);
    const groundY = this.target ? (this.target.elevOffset || 0) : 0;
    for (const t of this.trees) {
      const dx = t.x - viewer.x, dz = t.z - viewer.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.5) continue;
      const centerAz = Math.atan2(dx, -dz);
      const halfSpan = Math.asin(Math.min(1, t.radius / dist));
      const altLo = Math.atan2(groundY + t.crownBase - viewer.y, dist);
      const altHi = Math.atan2(groundY + t.crownTop - viewer.y, dist);
      if (altHi <= 0) continue;                        // whole crown below the panel's horizon
      const loDeg = Math.max(0, Math.floor(altLo * 180 / Math.PI));
      const hiDeg = Math.min(na - 1, Math.ceil(altHi * 180 / Math.PI));
      const binSpan = Math.ceil(halfSpan / (2 * Math.PI) * n);
      const centerBin = this._binOf(centerAz);
      for (let db = -binSpan; db <= binSpan; db++) {
        const b = (centerBin + db + n) % n;
        for (let a = loDeg; a <= hiDeg; a++) {
          leaf[b * na + a] *= M.transmittanceLeaf;
          bare[b * na + a] *= M.transmittanceBare;
        }
      }
    }
    return { leaf, bare };
  },

  _isLeafMonth(month) {
    return SolarConfig.TREE_MODEL.leafMonths.includes(month);
  },

  /** Transmittance of a sky direction for the beam: 0 blocked, 1 clear, in between behind a crown. */
  _beamTransmittance(azimuth, altitude, month) {
    const bin = this._binOf(azimuth);
    if (altitude < this.horizonProfile[bin]) return 0;
    if (this.ceilingProfile && altitude > this.ceilingProfile[bin]) return 0;
    const mask = this._isLeafMonth(month) ? this.treeMaskLeaf : this.treeMaskBare;
    if (!mask) return 1;
    const a = Math.min(this.ALT_BINS - 1, Math.max(0, Math.floor(altitude * 180 / Math.PI)));
    return mask[bin * this.ALT_BINS + a];
  },

  /** Angle-of-incidence cosine of a sky direction on the panel. */
  _incidenceCosine(altitude, azimuth, tiltRad, panelAzimuth) {
    return Math.cos(altitude) * Math.sin(tiltRad) * Math.cos(azimuth - panelAzimuth)
         + Math.sin(altitude) * Math.cos(tiltRad);
  },

  /**
   * Fraction of the panel's isotropic sky view that survives the skyline, the
   * slab and (optionally) the tree crowns. Integrates cos(theta) cos(alt)
   * dalt daz over the visible hemisphere, sampled at 1 degree.
   */
  computeSkyOpenFraction(profile, tiltDeg, options = {}) {
    const tiltRad = (tiltDeg || 90) * Math.PI / 180;
    const DEG = Math.PI / 180;
    const panelAz = options.panelAzimuth !== undefined ? options.panelAzimuth : this.balconyAzimuth;
    const ceiling = options.ceiling || null;
    const mask = options.mask || null;
    const na = this.ALT_BINS;
    let total = 0, visible = 0;
    for (let azDeg = 0; azDeg < 360; azDeg += 1) {
      const az = (azDeg + 0.5) * DEG;
      const bin = this._binOf(az);
      const obstruction = profile[bin];
      const ceil = ceiling ? ceiling[bin] : Math.PI / 2;
      for (let altDeg = 0; altDeg < 90; altDeg += 1) {
        const alt = (altDeg + 0.5) * DEG;
        const cosTheta = this._incidenceCosine(alt, az, tiltRad, panelAz);
        if (cosTheta <= 0) continue;
        const w = cosTheta * Math.cos(alt);
        total += w;
        if (alt <= obstruction || alt > ceil) continue;
        visible += w * (mask ? mask[bin * na + altDeg] : 1);
      }
    }
    return total > 0 ? visible / total : 1;
  },

  /**
   * How open the street in front of the panel is: the sky-view fraction of a
   * horizontal surface at street level a few metres out from the facade,
   * through the same footprints. Scales the ground-reflected component.
   */
  computeGroundOpenFraction() {
    if (!this.balconyPoint) return 1;
    const groundY = (this.target ? (this.target.elevOffset || 0) : 0) + 1.0;
    const viewer = {
      x: this.balconyPoint.x + Math.sin(this.balconyAzimuth) * this.GROUND_VIEW_OFFSET_M,
      y: groundY,
      z: this.balconyPoint.z - Math.cos(this.balconyAzimuth) * this.GROUND_VIEW_OFFSET_M,
    };
    const profile = this.buildHorizonProfile(viewer);
    return this.computeSkyOpenFraction(profile, 0, { panelAzimuth: this.balconyAzimuth });
  },

  _prepare() {
    if (!this.horizonProfile) this.horizonProfile = this.buildHorizonProfile(this.balconyPoint);
    if (this.ceilingProfile === null) this.ceilingProfile = this.buildCeilingProfile();
    if (this.groundOpenFraction === null) this.groundOpenFraction = this.computeGroundOpenFraction();
    if (this.treeMaskLeaf === null && this.trees.length) {
      const m = this.buildTreeMasks(this.balconyPoint);
      this.treeMaskLeaf = m.leaf; this.treeMaskBare = m.bare;
    }
  },

  // ------------------------------------------------------------
  // Energy
  // ------------------------------------------------------------

  /**
   * Fraction of plane-of-array irradiance that obstructions remove, per month.
   *
   *   received = beam * T_beam + sky * skyOpen + ground * groundOpen
   *   assumed  = beam + sky + ground
   *   factor   = sum(received) / sum(assumed)
   *
   * summed over two representative days per month, every 10 minutes from
   * sunrise to sunset, with beam = DNI cos(theta), sky = DHI (1 + cos b)/2 and
   * ground = albedo GHI (1 - cos b)/2 from the NSRDB typical year. Annual =
   * the same ratio over the whole year (days-in-month weighted).
   *
   * @param {number} [tiltDeg=90]
   * @returns {{ monthlyShadeFactors, annualShadeFactor, skyOpenFraction, groundOpenFraction, treeCount }}
   */
  computeAnnualShadeProfile(tiltDeg) {
    const tilt = tiltDeg || 90;
    const tiltRad = tilt * Math.PI / 180;

    if (!this.initialized || !this.balconyPoint) {
      return { monthlyShadeFactors: new Array(12).fill(0.80), annualShadeFactor: 0.80, skyOpenFraction: 0.80, groundOpenFraction: 0.80, treeCount: 0 };
    }
    this._prepare();
    const I = IrradianceNYC;
    const cosTilt = Math.cos(tiltRad);
    const skyViewPanel = (1 + cosTilt) / 2;
    const groundViewPanel = (1 - cosTilt) / 2;

    const skyOpenClear = this.computeSkyOpenFraction(this.horizonProfile, tilt, { ceiling: this.ceilingProfile });
    const skyOpenLeaf = this.treeMaskLeaf
      ? this.computeSkyOpenFraction(this.horizonProfile, tilt, { ceiling: this.ceilingProfile, mask: this.treeMaskLeaf })
      : skyOpenClear;
    const skyOpenBare = this.treeMaskBare
      ? this.computeSkyOpenFraction(this.horizonProfile, tilt, { ceiling: this.ceilingProfile, mask: this.treeMaskBare })
      : skyOpenClear;
    const groundOpen = this.groundOpenFraction;

    const monthly = [];
    let yearReceived = 0, yearAssumed = 0;
    for (let month = 0; month < 12; month++) {
      const skyOpen = this._isLeafMonth(month) ? skyOpenLeaf : skyOpenBare;
      const alb = I.albedo[month] || 0.15;
      let received = 0, assumed = 0;
      for (const day of this.SAMPLE_DAYS) {
        const doy = this.MONTH_START_DOY[month] + day;
        const bounds = SunPosition.getDayBoundsDoy(doy);
        const tzShift = SunPosition.tzOffsetForDoy(doy) === -4 ? -60 : 0;  // clock -> standard time
        for (let minute = bounds.sunrise; minute <= bounds.sunset; minute += this.SAMPLE_STEP_MIN) {
          const sun = SunPosition.calculateDoy(doy, minute);
          if (sun.altitude <= 0) continue;
          const hour = Math.max(0, Math.min(23, Math.floor((minute + tzShift) / 60)));
          const dni = I.dni[month][hour], dhi = I.dhi[month][hour];
          if (dni <= 0 && dhi <= 0) continue;
          const ghi = dni * Math.sin(sun.altitude) + dhi;
          const cosTheta = this._incidenceCosine(sun.altitude, sun.azimuth, tiltRad, this.balconyAzimuth);
          const beam = dni * Math.max(0, cosTheta);
          const sky = dhi * skyViewPanel;
          const ground = alb * ghi * groundViewPanel;
          received += beam * this._beamTransmittance(sun.azimuth, sun.altitude, month) + sky * skyOpen + ground * groundOpen;
          assumed += beam + sky + ground;
        }
      }
      const w = this.MONTH_DAYS[month] / this.SAMPLE_DAYS.length;
      yearReceived += received * w;
      yearAssumed += assumed * w;
      const f = assumed > 0 ? received / assumed : 1;
      monthly.push(Math.max(this.MIN_FACTOR, Math.min(1, f)));
    }
    const annual = yearAssumed > 0 ? Math.max(this.MIN_FACTOR, Math.min(1, yearReceived / yearAssumed)) : 1;

    return {
      monthlyShadeFactors: monthly,
      annualShadeFactor: annual,
      skyOpenFraction: skyOpenClear,
      groundOpenFraction: groundOpen,
      treeCount: this.trees.length,
    };
  },

  /**
   * Hours of direct sun on the panel for the 15th of a month: the beam reaches
   * the panel face (at least half of it through any tree crown).
   */
  directSunHours(month, tiltDeg) {
    if (!this.initialized || !this.balconyPoint) return null;
    this._prepare();
    const tiltRad = (tiltDeg || 90) * Math.PI / 180;
    const bounds = SunPosition.getDayBounds(month);
    let minutes = 0;
    for (let m = bounds.sunrise; m <= bounds.sunset; m += this.SAMPLE_STEP_MIN) {
      const sun = SunPosition.calculate(month, m);
      if (sun.altitude <= 0) continue;
      if (this._incidenceCosine(sun.altitude, sun.azimuth, tiltRad, this.balconyAzimuth) <= 0) continue;
      if (this._beamTransmittance(sun.azimuth, sun.altitude, month) < 0.5) continue;
      minutes += this.SAMPLE_STEP_MIN;
    }
    return minutes / 60;
  },

  /** Neighbours modelled at a roof height far above the local norm (setback towers over-block). */
  tallOutliers() {
    const hs = this.buildings.filter(e => !e.isTarget).map(e => e.heightMeters).sort((a, b) => a - b);
    if (hs.length < 5) return 0;
    const median = hs[Math.floor(hs.length / 2)];
    return hs.filter(h => h > 3 * median && h > 60).length;
  },

  // ------------------------------------------------------------
  // Display (heatmap and info panel). Never read by the energy path.
  // ------------------------------------------------------------

  updateColors(sunPos) {
    if (!this.initialized || !this.balconyPoint || typeof Scene3D === 'undefined') return;
    const isNight = sunPos.altitude <= 0;
    for (const entry of Scene3D.buildingMeshes) {
      if (!entry.mesh) continue;
      if (entry.isTarget) { entry.mesh.material.color.setHex(this.COLORS.target); entry.shadowScore = 0; continue; }
      if (isNight) { entry.mesh.material.color.setHex(this.COLORS.night); entry.shadowScore = 0; continue; }
      const score = this._scoreShadowImpact(entry, sunPos);
      entry.shadowScore = score.display;
      entry.shadowPhysics = score.physics;
      const d = score.display;
      if (d > 0.5)       entry.mesh.material.color.setHex(this.COLORS.high);
      else if (d > 0.2)  entry.mesh.material.color.setHex(this.COLORS.medium);
      else if (d > 0.05) entry.mesh.material.color.setHex(this.COLORS.low);
      else               entry.mesh.material.color.setHex(this.COLORS.none);
    }
  },

  _polygonAngularSpan(polygon, viewerPoint) {
    if (!polygon || polygon.length < 2) return null;
    const azimuths = [];
    let nearestDist = Infinity;
    for (const p of polygon) {
      const dx = p.x - viewerPoint.x, dz = p.z - viewerPoint.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < nearestDist) nearestDist = dist;
      azimuths.push(Math.atan2(dx, -dz));
    }
    azimuths.sort((a, b) => a - b);
    let minAz = azimuths[0], maxAz = azimuths[azimuths.length - 1];
    if (maxAz - minAz > Math.PI) {
      let bestGap = 0, bestIdx = 0;
      for (let i = 0; i < azimuths.length - 1; i++) {
        const gap = azimuths[i + 1] - azimuths[i];
        if (gap > bestGap) { bestGap = gap; bestIdx = i; }
      }
      minAz = azimuths[bestIdx + 1];
      maxAz = azimuths[bestIdx] + 2 * Math.PI;
    }
    return { minAz, maxAz, span: maxAz - minAz, nearestDist };
  },

  /** Per-building shadow severity at one sun position. DISPLAY ONLY. */
  _scoreShadowImpact(entry, sunPos) {
    const ZERO = { physics: 0, display: 0 };
    const span = this._polygonAngularSpan(entry.localCoords, this.balconyPoint);
    if (!span || span.nearestDist < 1) return ZERO;
    let sunAz = sunPos.azimuth;
    if (sunAz < span.minAz) sunAz += 2 * Math.PI;
    if (sunAz < span.minAz || sunAz > span.maxAz) return ZERO;
    const heightAboveBalcony = entry.heightMeters + (entry.elevOffset || 0) - this.balconyPoint.y;
    if (heightAboveBalcony <= 0) return ZERO;
    const blockAngle = Math.atan2(heightAboveBalcony, span.nearestDist);
    if (sunPos.altitude > blockAngle) return ZERO;
    const verticalBlock = Math.min(1, (blockAngle - sunPos.altitude) / (blockAngle + 0.01));
    const widthFactor = Math.min(1, span.span / 0.1);
    const physics = Math.min(1, verticalBlock * widthFactor);
    return { physics, display: Math.min(1, physics * 1.8) };
  },

  updateInfoPanels(sunPos, month, minuteOfDay) {
    if (typeof document === 'undefined') return;
    const sunPanel = document.getElementById('sunInfoPanel');
    if (sunPanel) {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      sunPanel.innerHTML = `
        <div class="info-title">SUN POSITION</div>
        <div class="info-value">${SunPosition.formatTime(minuteOfDay)}</div>
        <div class="info-detail">${monthNames[month]} 15 &bull; NYC</div>
        <div class="info-detail">Altitude: ${sunPos.altitudeDeg.toFixed(1)}&deg;</div>
        <div class="info-detail">Azimuth: ${sunPos.azimuthDeg.toFixed(1)}&deg;</div>
      `;
    }
  },

  _azimuthToLabel(azRad) {
    const deg = ((azRad * 180 / Math.PI) + 360) % 360;
    const dirs = ['North', 'NE', 'East', 'SE', 'South', 'SW', 'West', 'NW'];
    return dirs[Math.round(deg / 45) % 8];
  },

  updateTooltip() {
    if (typeof document === 'undefined') return;
    const tooltip = document.getElementById('hoverTooltip');
    if (tooltip) tooltip.style.display = 'none';
  },

  /** Reset per-address state so a new lookup does not inherit the old skyline. */
  reset() {
    this.initialized = false;
    this.buildings = [];
    this.target = null;
    this.trees = [];
    this.balconyPoint = null;
    this.balconyAzimuth = 0;
    this.floor = 1;
    this.totalFloors = 1;
    this.facadeEdge = null;
    this._marker = null;
    this._ring = null;
    this._invalidate();
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ShadowModel };
}
