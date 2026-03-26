// ============================================================
// balco.nyc — 3D Hybrid Street View + 3D (Version B)
// ============================================================
// Ghost materials, Street View texture mapping, facade edge
// detection, balcony highlight, and edge wireframes.
// Depends on: 3d-scene.js (Scene3D), sun-position.js (SunPosition)
// ============================================================

const HybridView = {
  // State
  facadeEdge: null,
  facadeMesh: null,
  balconyBand: null,
  streetViewTexture: null,
  editedTexture: null,
  showingPanels: false,
  initialized: false,
  targetBalconyPoint: null,
  shadowLines: [],
  sunHoursCache: null,
  sunHoursMonth: -1,
  facadeAzimuthRad: 0,
  sliderInitialized: false,

  // Materials
  ghostMaterial: null,
  shadowCasterMaterial: null,
  targetMaterial: null,

  /**
   * Create version-specific materials for Scene3D.addBuildings().
   * Called before addBuildings to provide the materials.
   */
  createMaterials() {
    this.targetMaterial = new THREE.MeshStandardMaterial({
      color: 0xccddee,
      roughness: 0.7,
      metalness: 0.05,
    });

    this.ghostMaterial = new THREE.MeshStandardMaterial({
      color: 0x88aabb,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      roughness: 0.9,
      metalness: 0.0,
    });

    this.shadowCasterMaterial = new THREE.MeshStandardMaterial({
      color: 0x667788,
      transparent: true,
      opacity: 0.55,
      depthWrite: true,
      roughness: 0.85,
      metalness: 0.05,
    });

    return {
      targetMaterial: this.targetMaterial,
      neighborMaterial: this.ghostMaterial,
    };
  },

  /**
   * Initialize the hybrid view after buildings are added to the scene.
   * @param {object} targetEntry - Scene3D.targetBuilding
   * @param {number} lat - building latitude
   * @param {number} lon - building longitude
   * @param {number} azimuthDeg - balcony direction in degrees
   * @param {number} floor - user's floor
   * @param {number} totalFloors - total floors
   */
  async init(targetEntry, lat, lon, azimuthDeg, floor, totalFloors) {
    if (!targetEntry) return;

    const heightMeters = targetEntry.heightMeters;
    const balconyHeight = (floor / totalFloors) * heightMeters;

    // Find facade edge
    this.facadeEdge = this._computeFacadeEdge(targetEntry.localCoords, azimuthDeg);
    this.facadeAzimuthRad = azimuthDeg * Math.PI / 180;

    if (this.facadeEdge) {
      const midX = (this.facadeEdge.p1.x + this.facadeEdge.p2.x) / 2;
      const midZ = (this.facadeEdge.p1.z + this.facadeEdge.p2.z) / 2;
      this.targetBalconyPoint = new THREE.Vector3(
        midX + this.facadeEdge.normal.x * 2,
        balconyHeight + (targetEntry.elevOffset || 0),
        midZ + this.facadeEdge.normal.z * 2
      );
    }

    // Reset sun hours cache
    this.sunHoursCache = null;
    this.sunHoursMonth = -1;

    // Add wireframe edges to all neighbor buildings
    this._addWireframes();

    // Add balcony highlight band
    this._addBalconyHighlight(targetEntry, balconyHeight, this.facadeEdge);

    // Fetch Street View texture
    await this._loadStreetViewTexture(lat, lon, floor, totalFloors, targetEntry);

    this.initialized = true;
  },

  /**
   * Find the polygon edge whose outward normal best matches the azimuth.
   */
  _computeFacadeEdge(localCoords, azimuthDeg) {
    if (!localCoords || localCoords.length < 3) return null;

    const targetAngle = azimuthDeg * Math.PI / 180;
    let bestEdge = null;
    let bestScore = -Infinity;

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

      const n1 = { x: -edgeDz / edgeLen, z: edgeDx / edgeLen };
      const n2 = { x: edgeDz / edgeLen, z: -edgeDx / edgeLen };

      const midX = (p1.x + p2.x) / 2;
      const midZ = (p1.z + p2.z) / 2;
      const toCenterX = cx - midX;
      const toCenterZ = cz - midZ;
      const dot1 = n1.x * toCenterX + n1.z * toCenterZ;
      const normal = dot1 < 0 ? n1 : n2;

      const normalAngle = Math.atan2(normal.x, -normal.z);
      let angleDiff = normalAngle - targetAngle;
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
   * Add edge wireframe outlines to all neighbor buildings.
   */
  _addWireframes() {
    for (const entry of Scene3D.buildingMeshes) {
      if (entry.isTarget) continue;

      const edges = new THREE.EdgesGeometry(entry.mesh.geometry);
      const wireframe = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
        color: 0x556677,
        transparent: true,
        opacity: 0.3,
      }));
      entry.mesh.add(wireframe);
    }
  },

  /**
   * Add a glowing horizontal band at the user's floor level.
   */
  _addBalconyHighlight(targetEntry, balconyHeight, facadeEdge) {
    if (!facadeEdge) return;

    const bandWidth = facadeEdge.edgeLen + 1;
    const bandHeight = 1.2;

    const bandGeo = new THREE.PlaneGeometry(bandWidth, bandHeight);
    const bandMat = new THREE.MeshBasicMaterial({
      color: 0x00ffaa,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });

    this.balconyBand = new THREE.Mesh(bandGeo, bandMat);

    const midX = (facadeEdge.p1.x + facadeEdge.p2.x) / 2;
    const midZ = (facadeEdge.p1.z + facadeEdge.p2.z) / 2;

    // Position on facade, slightly outward
    this.balconyBand.position.set(
      midX + facadeEdge.normal.x * 0.2,
      balconyHeight + (targetEntry.elevOffset || 0),
      midZ + facadeEdge.normal.z * 0.2
    );

    // Rotate to face outward (align with facade edge direction)
    const angle = Math.atan2(
      facadeEdge.p2.x - facadeEdge.p1.x,
      facadeEdge.p2.z - facadeEdge.p1.z
    );
    this.balconyBand.rotation.y = angle;

    Scene3D.scene.add(this.balconyBand);

    // Add a small marker sphere
    const markerGeo = new THREE.SphereGeometry(1.2, 12, 12);
    const markerMat = new THREE.MeshBasicMaterial({
      color: 0x00ffaa,
      transparent: true,
      opacity: 0.7,
    });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.position.copy(this.balconyBand.position);
    Scene3D.scene.add(marker);
  },

  /**
   * Fetch Street View image, map onto facade, and populate comparison panel.
   */
  async _loadStreetViewTexture(lat, lon, floor, totalFloors, targetEntry) {
    const statusEl = document.getElementById('textureStatus');
    const svPanel = document.getElementById('streetViewPanel');
    const svLoading = document.getElementById('svLoading');

    if (svPanel) svPanel.style.display = '';
    if (statusEl) statusEl.textContent = 'Loading Street View...';

    try {
      const url = (typeof SolarConfig !== 'undefined' && SolarConfig.VISUALIZE_URL) || '/api/visualize';
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon, floor, totalFloors }),
      });

      const data = await response.json();
      if (!response.ok || !data.originalImage) {
        console.warn('[HybridView] Street View not available');
        if (statusEl) statusEl.textContent = 'Street View unavailable';
        if (svLoading) svLoading.innerHTML = '<span style="color:#64748b">Street View not available for this address</span>';
        return;
      }

      // Create 3D texture
      const textureLoader = new THREE.TextureLoader();
      this.streetViewTexture = await new Promise((resolve, reject) => {
        textureLoader.load(data.originalImage, resolve, undefined, reject);
      });
      this.streetViewTexture.encoding = THREE.sRGBEncoding;

      // Map texture onto 3D facade
      this._applyFacadeTexture(targetEntry);

      // Populate Street View panel — show original immediately
      const svOriginal = document.getElementById('svOriginal');
      if (svOriginal) svOriginal.src = data.originalImage;

      // Set address
      const svAddress = document.getElementById('svAddress');
      if (svAddress && SolarState.address) {
        svAddress.textContent = SolarState.address.split(',')[0];
      }

      // If AI-edited image available, show comparison
      if (data.editedImage) {
        this.editedTexture = await new Promise((resolve, reject) => {
          textureLoader.load(data.editedImage, resolve, undefined, reject);
        });
        this.editedTexture.encoding = THREE.sRGBEncoding;

        const svEdited = document.getElementById('svEdited');
        if (svEdited) svEdited.src = data.editedImage;

        // Show the comparison slider
        const svComparison = document.getElementById('svComparison');
        if (svComparison) svComparison.style.display = '';
        if (svLoading) svLoading.style.display = 'none';

        this._initComparisonSlider();
      } else {
        // Show just the original
        const svComparison = document.getElementById('svComparison');
        if (svComparison) {
          svComparison.style.display = '';
          // Hide the after clip and handle
          const afterClip = document.getElementById('svAfterClip');
          const handle = document.getElementById('svHandle');
          if (afterClip) afterClip.style.display = 'none';
          if (handle) handle.style.display = 'none';
        }
        if (svLoading) svLoading.style.display = 'none';
      }

      if (statusEl) statusEl.textContent = '';
      console.log('[HybridView] Street View loaded + panel populated');

    } catch (err) {
      console.warn('[HybridView] Street View fetch failed:', err.message);
      if (statusEl) statusEl.textContent = 'Street View unavailable';
      if (svLoading) svLoading.innerHTML = '<span style="color:#64748b">Could not load Street View</span>';
    }
  },

  /**
   * Initialize the before/after comparison slider.
   */
  _initComparisonSlider() {
    if (this.sliderInitialized) return;
    const container = document.getElementById('svComparison');
    const handle = document.getElementById('svHandle');
    const afterClip = document.getElementById('svAfterClip');
    if (!container || !handle || !afterClip) return;

    let isDragging = false;
    const updatePos = (clientX) => {
      const rect = container.getBoundingClientRect();
      let pct = ((clientX - rect.left) / rect.width) * 100;
      pct = Math.max(3, Math.min(97, pct));
      afterClip.style.clipPath = 'inset(0 0 0 ' + pct + '%)';
      handle.style.left = pct + '%';
    };

    afterClip.style.clipPath = 'inset(0 0 0 50%)';
    handle.style.left = '50%';

    handle.addEventListener('mousedown', (e) => { isDragging = true; e.preventDefault(); });
    document.addEventListener('mousemove', (e) => { if (isDragging) updatePos(e.clientX); });
    document.addEventListener('mouseup', () => { isDragging = false; });
    handle.addEventListener('touchstart', (e) => { isDragging = true; e.preventDefault(); });
    document.addEventListener('touchmove', (e) => { if (isDragging) updatePos(e.touches[0].clientX); });
    document.addEventListener('touchend', () => { isDragging = false; });
    container.addEventListener('click', (e) => { if (e.target !== handle) updatePos(e.clientX); });

    this.sliderInitialized = true;
  },

  /**
   * Create a textured plane on the facade edge.
   */
  _applyFacadeTexture(targetEntry) {
    if (!this.facadeEdge || !this.streetViewTexture) return;

    // Remove previous facade mesh
    if (this.facadeMesh) {
      Scene3D.scene.remove(this.facadeMesh);
      this.facadeMesh.geometry.dispose();
      this.facadeMesh.material.dispose();
    }

    const edge = this.facadeEdge;
    const facadeWidth = edge.edgeLen;
    const facadeHeight = targetEntry.heightMeters;

    const geo = new THREE.PlaneGeometry(facadeWidth, facadeHeight);
    const mat = new THREE.MeshStandardMaterial({
      map: this.streetViewTexture,
      roughness: 0.8,
      metalness: 0.05,
      side: THREE.FrontSide,
    });

    this.facadeMesh = new THREE.Mesh(geo, mat);
    this.facadeMesh.receiveShadow = true;

    // Position at edge midpoint, half height up
    const midX = (edge.p1.x + edge.p2.x) / 2;
    const midZ = (edge.p1.z + edge.p2.z) / 2;
    this.facadeMesh.position.set(
      midX,
      facadeHeight / 2 + (targetEntry.elevOffset || 0),
      midZ
    );

    // Rotate to align with edge direction
    const angle = Math.atan2(
      edge.p2.x - edge.p1.x,
      edge.p2.z - edge.p1.z
    );
    this.facadeMesh.rotation.y = angle;

    // Offset slightly outward to prevent z-fighting
    const offsetDist = 0.15;
    this.facadeMesh.position.x += edge.normal.x * offsetDist;
    this.facadeMesh.position.z += edge.normal.z * offsetDist;

    Scene3D.scene.add(this.facadeMesh);
  },

  /**
   * Toggle between original Street View and AI-edited (with panels) texture.
   */
  togglePanels() {
    if (!this.facadeMesh || !this.editedTexture) return;

    this.showingPanels = !this.showingPanels;
    this.facadeMesh.material.map = this.showingPanels
      ? this.editedTexture
      : this.streetViewTexture;
    this.facadeMesh.material.needsUpdate = true;

    const toggleBtn = document.getElementById('panelToggleBtn');
    if (toggleBtn) {
      toggleBtn.textContent = this.showingPanels ? 'Show Original' : 'Show With Panels';
    }
  },

  /**
   * Update neighbor materials based on shadow scores.
   * Called on sun position change.
   */
  updateMaterials(sunPos) {
    if (!this.initialized) return;

    const isNight = sunPos.altitude <= 0;

    for (const entry of Scene3D.buildingMeshes) {
      if (entry.isTarget) continue;

      if (isNight) {
        entry.mesh.material = this.ghostMaterial;
        entry.shadowScore = 0;
        continue;
      }

      // Check if this building casts shadow on our balcony
      const score = this._scoreShadowImpact(entry, sunPos);
      entry.shadowScore = score;

      if (score > 0.1) {
        entry.mesh.material = this.shadowCasterMaterial;
      } else {
        entry.mesh.material = this.ghostMaterial;
      }
    }

    // Update shadow projection lines
    this._updateShadowLines(sunPos);

    // Update Street View sun overlay
    this.updateStreetViewOverlay(sunPos);
  },

  /**
   * Simplified shadow impact scoring (same logic as ShadowModel).
   */
  _scoreShadowImpact(entry, sunPos) {
    if (!this.targetBalconyPoint) return 0;

    const toBldg = new THREE.Vector3().subVectors(entry.centroid, this.targetBalconyPoint);
    const horizontalDist = Math.sqrt(toBldg.x * toBldg.x + toBldg.z * toBldg.z);
    if (horizontalDist < 1) return 0;

    const bldgAzimuth = Math.atan2(toBldg.x, -toBldg.z);
    let azDiff = sunPos.azimuth - bldgAzimuth;
    while (azDiff > Math.PI) azDiff -= 2 * Math.PI;
    while (azDiff < -Math.PI) azDiff += 2 * Math.PI;

    if (Math.abs(azDiff) > Math.PI / 4) return 0;

    const bldgTopY = entry.heightMeters + (entry.elevOffset || 0);
    const heightAboveBalcony = bldgTopY - this.targetBalconyPoint.y;
    if (heightAboveBalcony <= 0) return 0;

    const blockAngle = Math.atan2(heightAboveBalcony, horizontalDist);
    if (sunPos.altitude > blockAngle) return 0;

    const verticalBlock = Math.min(1, (blockAngle - sunPos.altitude) / (blockAngle + 0.01));
    const azimuthFactor = 1 - (Math.abs(azDiff) / (Math.PI / 4));

    return Math.min(1, verticalBlock * azimuthFactor * 1.5);
  },

  /**
   * Update info panels.
   */
  updateInfoPanels(sunPos, month, minuteOfDay, floor, totalFloors) {
    const sunPanel = document.getElementById('sunInfoPanel');
    if (sunPanel) {
      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

      // Check if facade is in direct sun right now
      let inDirectSun = false;
      if (sunPos.altitude > 0 && this.facadeEdge) {
        let azDiff = sunPos.azimuth - this.facadeEdge.normalAngle;
        while (azDiff > Math.PI) azDiff -= 2 * Math.PI;
        while (azDiff < -Math.PI) azDiff += 2 * Math.PI;
        // In sun if facade faces within 90° of sun AND no blocking buildings
        let blocked = false;
        for (const e of Scene3D.buildingMeshes) {
          if (!e.isTarget && e.shadowScore > 0.15) { blocked = true; break; }
        }
        inDirectSun = Math.abs(azDiff) < Math.PI / 2 && !blocked;
      }

      const sunDot = inDirectSun
        ? '<span style="color:#10B981">&#9679; Direct sun on balcony</span>'
        : (sunPos.altitude > 0 ? '<span style="color:#E8B030">&#9679; Balcony in shadow</span>' : '<span style="color:#64748b">&#9679; Night</span>');

      sunPanel.innerHTML =
        '<div class="info-title">SUN POSITION</div>' +
        '<div class="info-value">' + SunPosition.formatTime(minuteOfDay) + '</div>' +
        '<div class="info-detail">' + monthNames[month] + ' 15 &bull; NYC</div>' +
        '<div class="info-detail">Altitude: ' + sunPos.altitudeDeg.toFixed(1) + '&deg;</div>' +
        '<div style="margin-top:6px;font-size:0.75rem">' + sunDot + '</div>' +
        '<div class="sun-hours-bar" id="sunHoursBar"></div>';

      // Render sun hours bar
      this.renderSunHoursBar(month, minuteOfDay);
    }

    const bldgPanel = document.getElementById('bldgInfoPanel');
    if (bldgPanel && Scene3D.targetBuilding) {
      let shadowCount = 0;
      for (const e of Scene3D.buildingMeshes) {
        if (!e.isTarget && e.shadowScore > 0.1) shadowCount++;
      }
      bldgPanel.innerHTML =
        '<div class="info-title">YOUR BUILDING</div>' +
        '<div class="info-detail">' + (SolarState.address ? SolarState.address.split(',')[0] : 'Selected') + '</div>' +
        '<div class="info-detail">Floor ' + floor + '/' + totalFloors + '</div>' +
        '<div class="info-detail" style="color:' + (shadowCount > 0 ? '#E8B030' : '#10B981') + '">' +
        (shadowCount > 0 ? shadowCount + ' building' + (shadowCount > 1 ? 's' : '') + ' casting shadow' : 'Clear of shadows') +
        '</div>';
    }
  },

  /**
   * Update the sun/shadow overlay on the Street View image.
   */
  updateStreetViewOverlay(sunPos) {
    const overlay = document.getElementById('svSunOverlay');
    if (!overlay || !this.facadeEdge) return;

    if (sunPos.altitude <= 0) {
      overlay.style.background = 'rgba(10, 15, 30, 0.3)';
      return;
    }

    // Check if sun is hitting the facade
    const facadeNormalAngle = this.facadeEdge.normalAngle;
    let azDiff = sunPos.azimuth - facadeNormalAngle;
    while (azDiff > Math.PI) azDiff -= 2 * Math.PI;
    while (azDiff < -Math.PI) azDiff += 2 * Math.PI;

    const inSun = Math.abs(azDiff) < Math.PI / 2;

    if (inSun) {
      const intensity = Math.cos(azDiff) * Math.min(1, sunPos.altitude / (0.3));
      const alpha = 0.08 * intensity;
      overlay.style.background = 'rgba(255, 200, 50, ' + alpha.toFixed(3) + ')';
    } else {
      overlay.style.background = 'rgba(10, 20, 40, 0.15)';
    }
  },

  /**
   * Compute sun hours for the current month — samples shadow at 15-min intervals.
   */
  _computeSunHoursBar(month) {
    if (this.sunHoursMonth === month && this.sunHoursCache) return this.sunHoursCache;
    if (!this.targetBalconyPoint) return null;

    const bounds = SunPosition.getDayBounds(month);
    const segments = [];
    let sunMinutes = 0;

    for (let m = bounds.sunrise; m <= bounds.sunset; m += 15) {
      const sun = SunPosition.calculate(month, m);
      if (sun.altitude <= 0) {
        segments.push({ minute: m, inSun: false });
        continue;
      }

      // Check if any building blocks at this time
      let blocked = false;
      for (const entry of Scene3D.buildingMeshes) {
        if (entry.isTarget) continue;
        const score = this._scoreShadowImpact(entry, sun);
        if (score > 0.15) { blocked = true; break; }
      }

      segments.push({ minute: m, inSun: !blocked });
      if (!blocked) sunMinutes += 15;
    }

    this.sunHoursCache = { segments, sunMinutes, sunrise: bounds.sunrise, sunset: bounds.sunset };
    this.sunHoursMonth = month;
    return this.sunHoursCache;
  },

  /**
   * Render the sun hours bar HTML.
   */
  renderSunHoursBar(month, currentMinutes) {
    const container = document.getElementById('sunHoursBar');
    if (!container) return;

    const data = this._computeSunHoursBar(month);
    if (!data || data.segments.length === 0) {
      container.innerHTML = '';
      return;
    }

    const hours = (data.sunMinutes / 60).toFixed(1);
    const totalRange = data.sunset - data.sunrise;

    let segsHtml = '';
    for (const seg of data.segments) {
      const w = (15 / totalRange) * 100;
      segsHtml += '<div class="sun-hours-seg ' + (seg.inSun ? 'sun' : 'shadow') + '" style="width:' + w.toFixed(2) + '%"></div>';
    }

    const markerPct = Math.max(0, Math.min(100, ((currentMinutes - data.sunrise) / totalRange) * 100));

    container.innerHTML =
      '<div class="sun-hours-track">' + segsHtml +
      '<div class="sun-hours-marker" style="left:' + markerPct.toFixed(1) + '%"></div>' +
      '</div>' +
      '<div class="sun-hours-label">' + hours + ' hrs direct sun today</div>';
  },

  /**
   * Draw/update shadow projection lines from blocking buildings to balcony.
   */
  _updateShadowLines(sunPos) {
    // Clear previous lines
    for (const line of this.shadowLines) {
      Scene3D.scene.remove(line);
      line.geometry.dispose();
      line.material.dispose();
    }
    this.shadowLines = [];

    if (!this.targetBalconyPoint || sunPos.altitude <= 0) return;

    for (const entry of Scene3D.buildingMeshes) {
      if (entry.isTarget || !entry.shadowScore || entry.shadowScore < 0.15) continue;

      // Draw line from building top (in sun direction) to balcony
      const buildingTop = new THREE.Vector3(
        entry.centroid.x,
        entry.heightMeters + (entry.elevOffset || 0),
        entry.centroid.z
      );

      const points = [buildingTop, this.targetBalconyPoint.clone()];
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineDashedMaterial({
        color: 0xff4444,
        transparent: true,
        opacity: Math.min(0.5, entry.shadowScore),
        dashSize: 4,
        gapSize: 3,
      });
      const line = new THREE.Line(geo, mat);
      line.computeLineDistances();
      Scene3D.scene.add(line);
      this.shadowLines.push(line);
    }
  },

  /**
   * Update hover tooltip.
   */
  updateTooltip(entry, clientX, clientY) {
    const tooltip = document.getElementById('hoverTooltip');
    if (!tooltip) return;
    if (!entry) { tooltip.style.display = 'none'; return; }

    const height = entry.heightFt.toFixed(0);
    tooltip.innerHTML = `<strong>${entry.isTarget ? 'Your Building' : 'Neighbor'}</strong><br>Height: ${height}ft`;
    tooltip.style.display = 'block';
    const rect = Scene3D.container.getBoundingClientRect();
    tooltip.style.left = (clientX - rect.left + 15) + 'px';
    tooltip.style.top = (clientY - rect.top - 10) + 'px';
  },
};
