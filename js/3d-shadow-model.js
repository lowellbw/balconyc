// ============================================================
// balco.nyc — 3D Shadow Model (Version A)
// ============================================================
// Shadow impact scoring, color coding, and info panel updates.
// Depends on: 3d-scene.js (Scene3D), sun-position.js (SunPosition)
// ============================================================

const ShadowModel = {
  // State
  targetBalconyPoint: null,  // THREE.Vector3
  balconyAzimuth: 0,         // radians (user's balcony direction)
  floor: 1,
  totalFloors: 1,
  initialized: false,

  // Color thresholds
  COLORS: {
    target:  0x3399FF,  // blue
    high:    0xCC3322,  // deep red
    medium:  0xD06830,  // burnt orange
    low:     0xCCA050,  // warm amber
    none:    0x544840,  // warm grey
    night:   0x2a2420,  // dark warm
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
    // Glowing sphere at balcony point
    const markerGeo = new THREE.SphereGeometry(1.5, 16, 16);
    const markerMat = new THREE.MeshBasicMaterial({
      color: 0x00ffaa,
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
        color: 0x00ffaa,
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
      entry.shadowScore = score;

      if (score > 0.5)       entry.mesh.material.color.setHex(this.COLORS.high);
      else if (score > 0.2)  entry.mesh.material.color.setHex(this.COLORS.medium);
      else if (score > 0.05) entry.mesh.material.color.setHex(this.COLORS.low);
      else                   entry.mesh.material.color.setHex(this.COLORS.none);
    }
  },

  /**
   * Score how much shadow a building casts on the target balcony at the current sun position.
   * @returns {number} 0-1 (0 = no shadow, 1 = fully blocking)
   */
  _scoreShadowImpact(entry, sunPos) {
    // Direction from balcony to building centroid
    const toBldg = new THREE.Vector3().subVectors(entry.centroid, this.targetBalconyPoint);
    const horizontalDist = Math.sqrt(toBldg.x * toBldg.x + toBldg.z * toBldg.z);

    if (horizontalDist < 1) return 0;

    // Building azimuth from balcony point (from north, clockwise)
    const bldgAzimuth = Math.atan2(toBldg.x, -toBldg.z);

    // Angular difference between sun azimuth and building direction
    let azDiff = sunPos.azimuth - bldgAzimuth;
    while (azDiff > Math.PI) azDiff -= 2 * Math.PI;
    while (azDiff < -Math.PI) azDiff += 2 * Math.PI;

    // If building is not roughly between us and the sun, no shadow
    // Sun must be approximately behind the building (from our perspective)
    if (Math.abs(azDiff) > Math.PI / 4) return 0; // >45° off sun direction

    // Building top height relative to balcony
    const bldgTopY = entry.heightMeters + (entry.elevOffset || 0);
    const heightAboveBalcony = bldgTopY - this.targetBalconyPoint.y;
    if (heightAboveBalcony <= 0) return 0; // shorter than our balcony

    // Angular height of the building top as seen from balcony
    const blockAngle = Math.atan2(heightAboveBalcony, horizontalDist);

    // If sun is higher than the building top, no shadow
    if (sunPos.altitude > blockAngle) return 0;

    // Score: how much the building blocks the sun
    const verticalBlock = Math.min(1, (blockAngle - sunPos.altitude) / (blockAngle + 0.01));
    const azimuthFactor = 1 - (Math.abs(azDiff) / (Math.PI / 4));

    // Angular width of building (approximate)
    const angularWidth = Math.atan2(10, horizontalDist); // rough approximation
    const widthFactor = Math.min(1, angularWidth / 0.1);

    return Math.min(1, verticalBlock * azimuthFactor * widthFactor * 1.8);
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
    return;
    tooltip.style.top = (clientY - rect.top - 10) + 'px';
  },
};
