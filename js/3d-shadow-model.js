// ============================================================
// balco.nyc — 3D Shadow Model
// ============================================================
// Builds a horizon profile of the surrounding buildings as seen
// from the user's balcony, then derates PVWatts output by the
// fraction of plane-of-array irradiance those buildings block.
//
// Depends on: 3d-scene.js (Scene3D), sun-position.js (SunPosition)
// ============================================================

const ShadowModel = {
  // State
  targetBalconyPoint: null,  // THREE.Vector3
  balconyAzimuth: 0,         // radians, clockwise from north
  floor: 1,
  totalFloors: 1,
  initialized: false,

  // Horizon profile: max obstruction altitude (radians) per azimuth bin,
  // as seen from the balcony point. Independent of panel tilt, so it is
  // built once per scene and reused across recalculations.
  horizonProfile: null,
  HORIZON_BINS: 360,

  // --- Irradiance model constants ---
  // Annual split of global horizontal irradiance for NYC (NSRDB/NREL:
  // the Northeast runs ~0.35-0.42 diffuse). Only the ratio matters here.
  BEAM_SHARE: 0.60,
  DIFFUSE_SHARE: 0.40,
  // Sampling step for the daylight sweep, in minutes.
  SAMPLE_STEP_MIN: 10,
  // Edge subdivision when projecting footprints onto the horizon.
  EDGE_SAMPLE_M: 2.0,
  EDGE_SAMPLE_RAD: 0.5 * Math.PI / 180,

  // Color thresholds
  COLORS: {
    target:  0x7F1D1D,  // balco red
    high:    0xB94635,  // deep terracotta
    medium:  0xD06830,  // burnt orange
    low:     0xCCA050,  // warm amber
    none:    0xA99B8D,  // warm grey
    night:   0x463E43,  // dark neutral
  },

  /**
   * Initialize the shadow model with the target building's balcony position.
   * @param {object} targetEntry - from Scene3D.targetBuilding
   * @param {number} floor - user's floor number
   * @param {number} totalFloors - total building floors
   * @param {number} heightroof - building height in feet
   * @param {number} azimuthDeg - balcony direction in degrees (0=N, 90=E, 180=S, 270=W)
   */
  init(targetEntry, floor, totalFloors, heightroof, azimuthDeg) {
    this.floor = floor;
    this.totalFloors = totalFloors;
    this.balconyAzimuth = azimuthDeg * Math.PI / 180;

    const heightMeters = (heightroof || 40) * 0.3048;
    const balconyHeight = (floor / totalFloors) * heightMeters;

    // Find facade edge matching balcony direction
    const coords = targetEntry.localCoords;
    const edge = this._findFacadeEdge(coords, azimuthDeg);

    if (edge) {
      const midX = (edge.p1.x + edge.p2.x) / 2;
      const midZ = (edge.p1.z + edge.p2.z) / 2;
      // Offset slightly outward from facade
      const normalX = edge.normal.x * 2;
      const normalZ = edge.normal.z * 2;
      this.targetBalconyPoint = new THREE.Vector3(
        midX + normalX,
        balconyHeight + (targetEntry.elevOffset || 0),
        midZ + normalZ
      );
    } else {
      // Fallback: use building centroid at balcony height
      this.targetBalconyPoint = new THREE.Vector3(
        targetEntry.centroid.x,
        balconyHeight + (targetEntry.elevOffset || 0),
        targetEntry.centroid.z
      );
    }

    // Add balcony marker
    this._addBalconyMarker(targetEntry, balconyHeight, edge);

    // Horizon profile is tilt-independent — build it once here.
    this.horizonProfile = null;

    this.initialized = true;
  },

  /**
   * Find the polygon edge whose outward normal best matches the given azimuth.
   */
  _findFacadeEdge(localCoords, azimuthDeg) {
    if (!localCoords || localCoords.length < 3) return null;

    const targetAngle = azimuthDeg * Math.PI / 180;
    let bestEdge = null;
    let bestScore = -Infinity;

    // Compute centroid for determining outward normals
    let cx = 0, cz = 0;
    for (const p of localCoords) { cx += p.x; cz += p.z; }
    cx /= localCoords.length;
    cz /= localCoords.length;

    for (let i = 0; i < localCoords.length - 1; i++) {
      const p1 = localCoords[i];
      const p2 = localCoords[(i + 1) % localCoords.length];

      const edgeDx = p2.x - p1.x;
      const edgeDz = p2.z - p1.z;
      const edgeLen = Math.sqrt(edgeDx * edgeDx + edgeDz * edgeDz);
      if (edgeLen < 0.5) continue;

      // Two possible perpendicular normals
      const n1 = { x: -edgeDz / edgeLen, z: edgeDx / edgeLen };
      const n2 = { x: edgeDz / edgeLen, z: -edgeDx / edgeLen };

      // Pick the outward-facing one (pointing away from centroid)
      const midX = (p1.x + p2.x) / 2;
      const midZ = (p1.z + p2.z) / 2;
      const toCenterX = cx - midX;
      const toCenterZ = cz - midZ;
      const dot1 = n1.x * toCenterX + n1.z * toCenterZ;
      const normal = dot1 < 0 ? n1 : n2;

      // Normal angle: Three.js convention — azimuth from north (0=north=-Z, 90=east=+X)
      const normalAngle = Math.atan2(normal.x, -normal.z);

      // Score: alignment with target azimuth, weighted by edge length
      let angleDiff = normalAngle - targetAngle;
      // Normalize to [-PI, PI]
      while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
      while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

      const alignment = Math.cos(angleDiff);
      const score = alignment * edgeLen;

      if (score > bestScore) {
        bestScore = score;
        bestEdge = { p1, p2, edgeLen, normal, normalAngle, index: i };
      }
    }

    return bestEdge;
  },

  /**
   * Add a visual marker at the balcony position.
   */
  _addBalconyMarker(targetEntry, balconyHeight, facadeEdge) {
    // Sun-gold marker at the selected balcony point
    const markerGeo = new THREE.SphereGeometry(1.5, 16, 16);
    const markerMat = new THREE.MeshBasicMaterial({
      color: 0xF59E0B,
      transparent: true,
      opacity: 0.8,
    });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.position.copy(this.targetBalconyPoint);
    Scene3D.scene.add(marker);

    // Horizontal ring at balcony floor level
    if (facadeEdge) {
      const ringGeo = new THREE.RingGeometry(0.3, facadeEdge.edgeLen * 0.6, 4);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xF59E0B,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(
        this.targetBalconyPoint.x,
        this.targetBalconyPoint.y,
        this.targetBalconyPoint.z
      );
      Scene3D.scene.add(ring);
    }
  },

  /**
   * Update building colors based on current sun position.
   * Called by the scene on every sun position change.
   */
  updateColors(sunPos, month, minuteOfDay) {
    if (!this.initialized || !this.targetBalconyPoint) return;

    const isNight = sunPos.altitude <= 0;

    for (const entry of Scene3D.buildingMeshes) {
      if (entry.isTarget) {
        entry.mesh.material.color.setHex(this.COLORS.target);
        entry.shadowScore = 0;
        continue;
      }

      if (isNight) {
        entry.mesh.material.color.setHex(this.COLORS.night);
        entry.shadowScore = 0;
        continue;
      }

      const score = this._scoreShadowImpact(entry, sunPos);
      // Color thresholds use the display score (physics × 1.8 cap-1)
      entry.shadowScore = score.display;
      // Keep physics score around for any downstream debug/inspection
      entry.shadowPhysics = score.physics;

      const d = score.display;
      if (d > 0.5)       entry.mesh.material.color.setHex(this.COLORS.high);
      else if (d > 0.2)  entry.mesh.material.color.setHex(this.COLORS.medium);
      else if (d > 0.05) entry.mesh.material.color.setHex(this.COLORS.low);
      else               entry.mesh.material.color.setHex(this.COLORS.none);
    }
  },

  /**
   * Compute the angular span of a building polygon as seen from the balcony.
   * Returns { minAz, maxAz, span, nearestDist }; null if degenerate.
   * Used for the 3D heatmap colouring only — the energy path uses the
   * horizon profile below, which resolves concave footprints correctly.
   */
  _polygonAngularSpan(polygon, viewerPoint) {
    if (!polygon || polygon.length < 2) return null;
    const azimuths = [];
    let nearestDist = Infinity;
    for (const p of polygon) {
      const dx = p.x - viewerPoint.x;
      const dz = p.z - viewerPoint.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < nearestDist) nearestDist = dist;
      azimuths.push(Math.atan2(dx, -dz));
    }
    azimuths.sort((a, b) => a - b);
    let minAz = azimuths[0];
    let maxAz = azimuths[azimuths.length - 1];
    // Wrap-around handling: if the apparent span is > PI the polygon straddles the
    // -PI/+PI branch cut; the true outside-angle is the largest gap, so re-anchor.
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

  /**
   * Per-building shadow severity at one sun position.
   * DISPLAY ONLY — drives the 3D heatmap and the "N buildings casting
   * shadow" panel. The energy model never reads this.
   */
  _scoreShadowImpact(entry, sunPos) {
    const ZERO = { physics: 0, display: 0 };

    const span = this._polygonAngularSpan(entry.localCoords, this.targetBalconyPoint);
    if (!span || span.nearestDist < 1) return ZERO;

    // Normalize sun azimuth into the same wrap window as the polygon span
    let sunAz = sunPos.azimuth;
    if (sunAz < span.minAz) sunAz += 2 * Math.PI;
    if (sunAz < span.minAz || sunAz > span.maxAz) return ZERO;

    const horizontalDist = span.nearestDist;
    const bldgTopY = entry.heightMeters + (entry.elevOffset || 0);
    const heightAboveBalcony = bldgTopY - this.targetBalconyPoint.y;
    if (heightAboveBalcony <= 0) return ZERO;

    const blockAngle = Math.atan2(heightAboveBalcony, horizontalDist);
    if (sunPos.altitude > blockAngle) return ZERO;

    const verticalBlock = Math.min(1, (blockAngle - sunPos.altitude) / (blockAngle + 0.01));
    const widthFactor = Math.min(1, span.span / 0.1);

    const physics = Math.min(1, verticalBlock * widthFactor);
    const display = Math.min(1, physics * 1.8); // UI contrast only — never fed back to physics
    return { physics, display };
  },

  // ============================================================
  // Horizon profile — the geometric basis of the energy model
  // ============================================================

  _binOf(azimuthRad) {
    const n = this.HORIZON_BINS;
    let b = Math.floor(((azimuthRad % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI) * n);
    if (b >= n) b = n - 1;
    return b;
  },

  /**
   * Project every neighbouring footprint onto an azimuth-binned skyline as
   * seen from the balcony point. Each bin holds the highest obstruction
   * altitude in that direction, so concave and L-shaped footprints — and
   * buildings that wrap past due north — are all handled correctly.
   *
   * @returns {Float64Array} obstruction altitude (radians) per azimuth bin
   */
  buildHorizonProfile() {
    const n = this.HORIZON_BINS;
    const profile = new Float64Array(n).fill(-Math.PI / 2);
    if (!this.targetBalconyPoint) return profile;

    const viewer = this.targetBalconyPoint;
    const neighbors = Scene3D.buildingMeshes.filter(e => !e.isTarget);

    for (const entry of neighbors) {
      const topY = entry.heightMeters + (entry.elevOffset || 0);
      const height = topY - viewer.y;
      if (height <= 0) continue;             // shorter than the balcony: cannot block

      const coords = entry.localCoords;
      if (!coords || coords.length < 2) continue;

      for (let i = 0; i < coords.length; i++) {
        const a = coords[i];
        const b = coords[(i + 1) % coords.length];

        const segLen = Math.hypot(b.x - a.x, b.z - a.z);
        if (segLen < 0.01) continue;

        // Subdivide finely enough that no azimuth bin is skipped, even for a
        // wide facade a few metres away.
        const azA = Math.atan2(a.x - viewer.x, -(a.z - viewer.z));
        const azB = Math.atan2(b.x - viewer.x, -(b.z - viewer.z));
        let dAz = Math.abs(azB - azA);
        if (dAz > Math.PI) dAz = 2 * Math.PI - dAz;
        const steps = Math.max(
          2,
          Math.ceil(segLen / this.EDGE_SAMPLE_M),
          Math.ceil(dAz / this.EDGE_SAMPLE_RAD)
        );

        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const px = a.x + (b.x - a.x) * t;
          const pz = a.z + (b.z - a.z) * t;
          const dx = px - viewer.x;
          const dz = pz - viewer.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 1) continue;

          const beta = Math.atan2(height, dist);
          const bin = this._binOf(Math.atan2(dx, -dz));
          if (beta > profile[bin]) profile[bin] = beta;
        }
      }
    }

    return profile;
  },

  /**
   * Angle-of-incidence cosine of a sky direction on the panel.
   * Standard tilted-surface formula; reduces to cos(alt)·cos(Δazimuth)
   * for a vertical panel (tilt 90°).
   */
  _incidenceCosine(altitude, azimuth, tiltRad, panelAzimuth) {
    return Math.cos(altitude) * Math.sin(tiltRad) * Math.cos(azimuth - panelAzimuth)
         + Math.sin(altitude) * Math.cos(tiltRad);
  },

  /**
   * Fraction of the panel's isotropic sky view that survives the horizon
   * profile. Integrates cos(theta)·cos(altitude) over the visible hemisphere,
   * which is the standard view-factor integral for an isotropic sky.
   *
   * @param {Float64Array} profile
   * @param {number} tiltDeg - panel tilt from horizontal
   * @returns {number} 0-1, where 1 = completely open sky
   */
  computeSkyOpenFraction(profile, tiltDeg) {
    const tiltRad = (tiltDeg || 90) * Math.PI / 180;
    const DEG = Math.PI / 180;
    let total = 0;
    let visible = 0;

    for (let azDeg = 0; azDeg < 360; azDeg += 2) {
      const az = azDeg * DEG;
      const obstruction = profile[this._binOf(az)];
      for (let altDeg = 1; altDeg < 90; altDeg += 2) {
        const alt = altDeg * DEG;
        const cosTheta = this._incidenceCosine(alt, az, tiltRad, this.balconyAzimuth);
        if (cosTheta <= 0) continue;         // behind the panel — not part of its sky view
        const w = cosTheta * Math.cos(alt);  // dOmega = cos(alt) dalt daz
        total += w;
        if (alt > obstruction) visible += w;
      }
    }

    return total > 0 ? visible / total : 1;
  },

  /**
   * Simulate the fraction of plane-of-array irradiance that neighbouring
   * buildings block, per month.
   *
   * The returned factor multiplies PVWatts output, so it must answer only
   * "how much of what PVWatts assumed reaches this balcony". PVWatts already
   * prices the panel's own tilt and azimuth, so hours when the sun is behind
   * the facade are worth little in BOTH the numerator and the denominator —
   * they are not a penalty. Earlier versions charged those hours as shading,
   * which double-counted orientation and could halve an unobstructed
   * east-facing estimate.
   *
   *   received = beam·(sun visible) + diffuse·(sky open)
   *   assumed  = beam + diffuse
   *   factor   = sum(received) / sum(assumed)
   *
   * An unobstructed balcony therefore returns 1.0 at every orientation.
   *
   * @param {number} [tiltDeg=90] - panel tilt from horizontal
   * @returns {{ monthlyShadeFactors: number[], annualShadeFactor: number, skyOpenFraction: number }}
   */
  computeAnnualShadeProfile(tiltDeg) {
    const tilt = tiltDeg || 90;
    const tiltRad = tilt * Math.PI / 180;

    if (!this.initialized || !this.targetBalconyPoint) {
      return { monthlyShadeFactors: new Array(12).fill(0.80), annualShadeFactor: 0.80, skyOpenFraction: 0.80 };
    }

    if (!this.horizonProfile) {
      this.horizonProfile = this.buildHorizonProfile();
    }
    const profile = this.horizonProfile;
    const skyOpen = this.computeSkyOpenFraction(profile, tilt);

    // Isotropic sky view factor of the panel itself. Present in both the
    // numerator and denominator; it sets how much diffuse counts relative
    // to beam for this tilt.
    const panelSkyView = (1 + Math.cos(tiltRad)) / 2;

    const monthlyFactors = [];

    for (let month = 0; month < 12; month++) {
      const bounds = SunPosition.getDayBounds(month);
      let received = 0;
      let assumed = 0;

      for (let minute = bounds.sunrise; minute <= bounds.sunset; minute += this.SAMPLE_STEP_MIN) {
        const sunPos = SunPosition.calculate(month, minute);
        if (sunPos.altitude <= 0) continue;

        // Clear-sky GHI proxy. The exponent flattens the solar-noon spike
        // relative to a raw sine while keeping noon worth several times dawn.
        const ghi = Math.pow(Math.sin(sunPos.altitude), 0.75);

        const cosTheta = this._incidenceCosine(sunPos.altitude, sunPos.azimuth, tiltRad, this.balconyAzimuth);
        const beam = this.BEAM_SHARE * ghi * Math.max(0, cosTheta);
        const diffuse = this.DIFFUSE_SHARE * ghi * panelSkyView;

        const blocked = sunPos.altitude < profile[this._binOf(sunPos.azimuth)];

        received += (blocked ? 0 : beam) + diffuse * skyOpen;
        assumed += beam + diffuse;
      }

      const factor = assumed > 0 ? received / assumed : 0.80;
      monthlyFactors.push(Math.max(0.10, Math.min(1, factor)));
    }

    // Annual = weighted average using the NYC monthly GHI distribution
    const ghiWeights = [0.056, 0.068, 0.082, 0.092, 0.105, 0.112,
                        0.114, 0.103, 0.088, 0.073, 0.056, 0.051];
    let annualFactor = 0;
    for (let i = 0; i < 12; i++) {
      annualFactor += monthlyFactors[i] * ghiWeights[i];
    }

    if (typeof console !== 'undefined' && console.log) {
      console.log('[ShadowModel] Sky openness:', skyOpen.toFixed(3), 'at tilt', tilt);
      console.log('[ShadowModel] Monthly shade:', monthlyFactors.map(f => f.toFixed(2)).join(', '));
      console.log('[ShadowModel] Annual shade factor:', annualFactor.toFixed(3));
    }

    return {
      monthlyShadeFactors: monthlyFactors,
      annualShadeFactor: annualFactor,
      skyOpenFraction: skyOpen,
    };
  },

  /**
   * Hours of direct sun on the balcony for a given month, from the horizon
   * profile. Used by the info panel; shares its geometry with the energy
   * model so the displayed figure and the computed figure always agree.
   */
  directSunHours(month, tiltDeg) {
    if (!this.initialized || !this.targetBalconyPoint) return null;
    if (!this.horizonProfile) this.horizonProfile = this.buildHorizonProfile();
    const tiltRad = (tiltDeg || 90) * Math.PI / 180;
    const bounds = SunPosition.getDayBounds(month);
    let minutes = 0;
    for (let m = bounds.sunrise; m <= bounds.sunset; m += this.SAMPLE_STEP_MIN) {
      const sun = SunPosition.calculate(month, m);
      if (sun.altitude <= 0) continue;
      if (this._incidenceCosine(sun.altitude, sun.azimuth, tiltRad, this.balconyAzimuth) <= 0) continue;
      if (sun.altitude < this.horizonProfile[this._binOf(sun.azimuth)]) continue;
      minutes += this.SAMPLE_STEP_MIN;
    }
    return minutes / 60;
  },

  /**
   * Update info panel DOM elements with current state.
   */
  updateInfoPanels(sunPos, month, minuteOfDay) {
    // Sun info panel
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

    // Building info panel
    const bldgPanel = document.getElementById('bldgInfoPanel');
    if (bldgPanel && this.targetBalconyPoint) {
      // Count shadow casters
      let blockerCount = 0;
      let maxScore = 0;
      for (const e of Scene3D.buildingMeshes) {
        if (!e.isTarget && e.shadowScore > 0.05) blockerCount++;
        if (!e.isTarget && e.shadowScore > maxScore) maxScore = e.shadowScore;
      }

      const shadowLabel = maxScore > 0.5 ? 'Heavy' : maxScore > 0.2 ? 'Moderate' : maxScore > 0.05 ? 'Light' : 'Minimal';
      const shadowColor = maxScore > 0.5 ? '#D03030' : maxScore > 0.2 ? '#E07020' : maxScore > 0.05 ? '#E8B030' : '#10B981';

      bldgPanel.innerHTML = `
        <div class="info-title">YOUR BUILDING</div>
        <div class="info-detail">${SolarState.address ? SolarState.address.split(',')[0] : 'Selected Building'}</div>
        <div class="info-detail">${this.totalFloors} floors &bull; ${Scene3D.targetBuilding ? Scene3D.targetBuilding.heightFt.toFixed(0) : '?'}ft</div>
        <div class="info-detail">Floor ${this.floor}, ${this._azimuthToLabel(this.balconyAzimuth)}-facing</div>
        <div class="info-shadow" style="border-color: ${shadowColor}">
          <span style="color: ${shadowColor}">SHADOW: ${shadowLabel}</span><br>
          <span class="info-detail">${blockerCount} building${blockerCount !== 1 ? 's' : ''} casting shadow</span>
        </div>
      `;
    }
  },

  _azimuthToLabel(azRad) {
    const deg = ((azRad * 180 / Math.PI) + 360) % 360;
    const dirs = ['North', 'NE', 'East', 'SE', 'South', 'SW', 'West', 'NW'];
    return dirs[Math.round(deg / 45) % 8];
  },

  /**
   * Update hover tooltip for a building.
   */
  updateTooltip(entry, clientX, clientY) {
    // Tooltip disabled — keep canvas clean
    const tooltip = document.getElementById('hoverTooltip');
    if (tooltip) tooltip.style.display = 'none';
  },

  /**
   * Reset per-address state so a new lookup does not inherit the old skyline.
   */
  reset() {
    this.initialized = false;
    this.targetBalconyPoint = null;
    this.horizonProfile = null;
    this.balconyAzimuth = 0;
    this.floor = 1;
    this.totalFloors = 1;
  },
};

// Node/test harness support — harmless in the browser.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ShadowModel };
}
