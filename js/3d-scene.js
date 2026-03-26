// ============================================================
// balco.nyc — 3D Scene Core (Shared by Version A & B)
// ============================================================
// Depends on: Three.js (global), OrbitControls (global),
//             js/sun-position.js (SunPosition)
// ============================================================

const Scene3D = {
  // Three.js objects
  renderer: null,
  scene: null,
  camera: null,
  controls: null,
  sunLight: null,
  ambientLight: null,
  sunSphere: null,
  sunArc: null,
  groundPlane: null,

  // Building data
  buildingMeshes: [],    // [{ mesh, feature, isTarget, heightMeters, centroid, bin }]
  targetBuilding: null,  // reference to the target entry in buildingMeshes
  raycaster: null,
  mouse: null,
  skyDome: null,
  sunGlow: null,
  arcLabels: [],         // sprite labels on sun arc

  // Coordinate system
  originLat: null,
  originLon: null,
  targetGroundElev: 0,
  M_PER_DEG_LAT: 111320,
  M_PER_DEG_LON: 84400, // approximate for NYC, recomputed in init

  // Time state
  currentMonth: 5,           // 0-11, default June
  currentTimeMinutes: 750,   // 12:30 PM default
  isPlaying: false,
  lastFrameTime: 0,
  animationId: null,
  sunNeedsUpdate: true,

  // Callbacks (set by version-specific modules)
  onSunUpdate: null,     // called when sun position changes
  onBuildingHover: null,  // called when building is hovered

  // Container element
  container: null,
  canvas: null,

  /**
   * Initialize the 3D scene.
   * @param {string} canvasId - ID of the canvas element
   * @param {object} options - { containerHeight, onSunUpdate, onBuildingHover }
   */
  init(canvasId, options = {}) {
    this.canvas = document.getElementById(canvasId);
    this.container = this.canvas.parentElement;

    if (options.onSunUpdate) this.onSunUpdate = options.onSunUpdate;
    if (options.onBuildingHover) this.onBuildingHover = options.onBuildingHover;
    this.cameraDistance = options.cameraDistance || 1.0; // multiplier for default camera distance

    const width = this.container.clientWidth;
    const height = options.containerHeight || 560;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.setClearColor(0x1a1a2e);

    // Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x1a1a2e, 0.0015);

    // Camera
    this.camera = new THREE.PerspectiveCamera(50, width / height, 1, 2000);
    this.camera.position.set(120, 160, 180);
    this.camera.lookAt(0, 30, 0);

    // Controls
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 50;
    this.controls.maxDistance = 500;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05; // prevent going below ground
    this.controls.target.set(0, 20, 0);
    this.controls.update();

    // Ambient light
    this.ambientLight = new THREE.AmbientLight(0x8899bb, 0.5);
    this.scene.add(this.ambientLight);

    // Hemisphere light for subtle sky/ground color
    const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x444444, 0.3);
    this.scene.add(hemiLight);

    // Sun directional light with shadows
    this.sunLight = new THREE.DirectionalLight(0xfff5e6, 1.5);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 800;
    this.sunLight.shadow.camera.left = -300;
    this.sunLight.shadow.camera.right = 300;
    this.sunLight.shadow.camera.top = 300;
    this.sunLight.shadow.camera.bottom = -300;
    this.sunLight.shadow.normalBias = 0.5;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Sun sphere (visual indicator)
    const sunGeo = new THREE.SphereGeometry(6, 16, 16);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffdd44 });
    this.sunSphere = new THREE.Mesh(sunGeo, sunMat);
    this.scene.add(this.sunSphere);

    // Sun glow sprite
    this._createSunGlow();

    // Sky dome
    this._createSkyDome();

    // Ground plane with radial gradient
    const groundGeo = new THREE.PlaneGeometry(800, 800);
    const groundMat = new THREE.ShaderMaterial({
      uniforms: {
        centerColor: { value: new THREE.Color(0x243344) },
        edgeColor: { value: new THREE.Color(0x111820) },
        radius: { value: 350.0 },
      },
      vertexShader: [
        'varying vec2 vUv;',
        'void main() {',
        '  vUv = uv;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}',
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 centerColor;',
        'uniform vec3 edgeColor;',
        'uniform float radius;',
        'varying vec2 vUv;',
        'void main() {',
        '  float dist = distance(vUv, vec2(0.5)) * 2.0;',
        '  float t = smoothstep(0.0, 1.0, dist);',
        '  gl_FragColor = vec4(mix(centerColor, edgeColor, t), 1.0);',
        '}',
      ].join('\n'),
    });
    this.groundPlane = new THREE.Mesh(groundGeo, groundMat);
    this.groundPlane.rotation.x = -Math.PI / 2;
    this.groundPlane.position.y = -0.1;
    this.groundPlane.receiveShadow = true;
    this.scene.add(this.groundPlane);

    // Shadow-receiving overlay (separate mesh so shader ground still gets shadows)
    const shadowGeo = new THREE.PlaneGeometry(800, 800);
    const shadowMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.08,
      roughness: 1.0,
    });
    const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.05;
    shadowPlane.receiveShadow = true;
    this.scene.add(shadowPlane);

    // Street grid lines on ground
    this._addStreetGrid();

    // Raycaster for hover
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Event listeners
    this._boundOnResize = this._onResize.bind(this);
    this._boundOnMouseMove = this._onMouseMove.bind(this);
    window.addEventListener('resize', this._boundOnResize);
    this.canvas.addEventListener('mousemove', this._boundOnMouseMove);

    // Initial sun update
    this._updateSunPosition();

    // Start render loop
    this._animate();
  },

  /**
   * Add buildings to the scene from GeoJSON feature data.
   * @param {object} targetFeature - GeoJSON feature for user's building
   * @param {Array} neighborFeatures - array of GeoJSON features for neighbors
   * @param {object} options - { material, neighborMaterial } for version-specific materials
   */
  addBuildings(targetFeature, neighborFeatures, options = {}) {
    // Clear existing
    this.buildingMeshes.forEach(entry => {
      this.scene.remove(entry.mesh);
      entry.mesh.geometry.dispose();
      if (entry.mesh.material.dispose) entry.mesh.material.dispose();
    });
    this.buildingMeshes = [];
    this.targetBuilding = null;

    // Set origin from target building centroid
    const targetCoords = this._extractCoords(targetFeature);
    if (!targetCoords || targetCoords.length < 3) {
      console.warn('[Scene3D] Target building has no valid coordinates');
      return;
    }
    const centroid = this._computeCentroid(targetCoords);
    this.originLat = centroid.lat;
    this.originLon = centroid.lon;
    this.M_PER_DEG_LON = 111320 * Math.cos(this.originLat * Math.PI / 180);

    const targetProps = targetFeature.properties || targetFeature;
    this.targetGroundElev = parseFloat(targetProps.ground_elevation || targetProps.groundelev || 0);

    // Create target building mesh
    const targetMesh = this._createBuildingMesh(targetFeature, true, options.targetMaterial);
    if (targetMesh) {
      this.scene.add(targetMesh.mesh);
      this.buildingMeshes.push(targetMesh);
      this.targetBuilding = targetMesh;
    }

    // Create neighbor meshes
    const targetBin = (targetProps.bin || '').toString();
    let count = 0;
    if (neighborFeatures && neighborFeatures.length) {
      for (const feature of neighborFeatures) {
        const props = feature.properties || feature;
        const bin = (props.bin || '').toString();
        // Skip the target building itself
        if (targetBin && bin === targetBin) continue;

        const entry = this._createBuildingMesh(feature, false, options.neighborMaterial);
        if (entry) {
          this.scene.add(entry.mesh);
          this.buildingMeshes.push(entry);
          count++;
        }
      }
    }

    console.log(`[Scene3D] Added ${count} neighbor buildings + target`);

    // Center camera on target
    if (this.targetBuilding) {
      const h = this.targetBuilding.heightMeters;
      const d = this.cameraDistance;
      this.controls.target.set(0, h * 0.4, 0);
      this.camera.position.set(120 * d, h + 60 * d, 180 * d);
      this.controls.update();
    }

    this.sunNeedsUpdate = true;
  },

  /**
   * Create a Three.js mesh from a GeoJSON building feature.
   * @returns {{ mesh, feature, isTarget, heightMeters, centroid, bin }} or null
   */
  _createBuildingMesh(feature, isTarget, customMaterial) {
    const coords = this._extractCoords(feature);
    if (!coords || coords.length < 3) return null;

    const props = feature.properties || feature;
    const heightFt = parseFloat(props.height_roof || props.heightroof || 40);
    const groundElevFt = parseFloat(props.ground_elevation || props.groundelev || 0);
    const heightMeters = heightFt * 0.3048;
    const elevOffset = (groundElevFt - this.targetGroundElev) * 0.3048;

    // Create Shape from coordinates
    const shape = new THREE.Shape();
    const localCoords = [];
    for (let i = 0; i < coords.length; i++) {
      const [lon, lat] = coords[i];
      const x = (lon - this.originLon) * this.M_PER_DEG_LON;
      const z = -(lat - this.originLat) * this.M_PER_DEG_LAT;
      localCoords.push({ x, z });
      if (i === 0) shape.moveTo(x, z);
      else shape.lineTo(x, z);
    }

    // Extrude
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: heightMeters,
      bevelEnabled: false,
    });
    // Rotate so extrusion goes up (Y) instead of forward (Z)
    geometry.rotateX(-Math.PI / 2);

    // Material
    let material;
    if (customMaterial) {
      material = customMaterial.clone();
    } else if (isTarget) {
      material = new THREE.MeshStandardMaterial({
        color: 0x3399ff,
        roughness: 0.6,
        metalness: 0.1,
        emissive: 0x112244,
        emissiveIntensity: 0.15,
      });
    } else {
      material = new THREE.MeshStandardMaterial({
        color: 0x556677,
        roughness: 0.85,
        metalness: 0.05,
      });
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = elevOffset;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Compute centroid in world space
    const cent = this._computeCentroid(coords);
    const cx = (cent.lon - this.originLon) * this.M_PER_DEG_LON;
    const cz = -(cent.lat - this.originLat) * this.M_PER_DEG_LAT;
    const centroid3D = new THREE.Vector3(cx, heightMeters / 2 + elevOffset, cz);

    return {
      mesh,
      feature,
      isTarget,
      heightMeters,
      elevOffset,
      centroid: centroid3D,
      localCoords,
      bin: (props.bin || '').toString(),
      heightFt,
    };
  },

  // --- Coordinate helpers ---

  _extractCoords(feature) {
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

  _computeCentroid(coords) {
    let latSum = 0, lonSum = 0;
    for (const [lon, lat] of coords) {
      latSum += lat;
      lonSum += lon;
    }
    return { lat: latSum / coords.length, lon: lonSum / coords.length };
  },

  // --- Sun position ---

  _updateSunPosition() {
    const sun = SunPosition.calculate(this.currentMonth, this.currentTimeMinutes);
    const pos = SunPosition.toWorldPosition(sun.altitude, sun.azimuth, 350);

    this.sunLight.position.set(pos.x, pos.y, pos.z);
    this.sunLight.target.position.set(0, 0, 0);

    this.sunSphere.position.set(pos.x, pos.y, pos.z);

    // Dim light when sun is low or below horizon
    if (sun.altitude <= 0) {
      this.sunLight.intensity = 0;
      this.sunSphere.visible = false;
      if (this.sunGlow) this.sunGlow.visible = false;
      this.ambientLight.intensity = 0.15;
      this._updateSkyDome(0, 0);
    } else {
      const factor = Math.min(1, sun.altitude / (15 * Math.PI / 180)); // ramp up over first 15°
      this.sunLight.intensity = 1.5 * factor;
      this.sunSphere.visible = true;
      this.ambientLight.intensity = 0.3 + 0.2 * factor;

      // Sun glow tracks sun position
      if (this.sunGlow) {
        this.sunGlow.visible = true;
        this.sunGlow.position.copy(this.sunSphere.position);
        // Brighter at low angles (sunrise/sunset drama)
        this.sunGlow.material.opacity = 0.3 + (1 - factor) * 0.5;
        this.sunGlow.scale.setScalar(30 + (1 - factor) * 20);
      }

      // Warm color at sunrise/sunset, white at noon
      const warmth = 1 - factor;
      const r = 1.0;
      const g = 0.96 - warmth * 0.15;
      const b = 0.90 - warmth * 0.35;
      this.sunLight.color.setRGB(r, g, b);

      // Update sky dome
      this._updateSkyDome(factor, warmth);
    }

    // Trigger shadow map update
    this.renderer.shadowMap.needsUpdate = true;

    // Callback for version-specific updates
    if (this.onSunUpdate) {
      this.onSunUpdate(sun, this.currentMonth, this.currentTimeMinutes);
    }
  },

  setTimeAndMonth(minutes, month) {
    if (minutes !== undefined) this.currentTimeMinutes = minutes;
    if (month !== undefined) this.currentMonth = month;
    this.sunNeedsUpdate = true;
  },

  // --- Animation ---

  _animate() {
    this.animationId = requestAnimationFrame(() => this._animate());

    const now = performance.now();
    const delta = this.lastFrameTime ? (now - this.lastFrameTime) / 1000 : 0;
    this.lastFrameTime = now;

    // Auto-play: advance time
    if (this.isPlaying && delta > 0 && delta < 0.1) {
      // 840 minutes (5:30AM to 7:30PM) in 8 seconds
      const minutesPerSecond = 840 / 8;
      this.currentTimeMinutes += minutesPerSecond * delta;
      if (this.currentTimeMinutes > 1170) {
        this.currentTimeMinutes = 330;
      }
      this.sunNeedsUpdate = true;

      // Update slider if it exists
      const slider = document.getElementById('timeSlider');
      if (slider) slider.value = Math.round(this.currentTimeMinutes);
      const label = document.getElementById('timeLabel');
      if (label) label.textContent = SunPosition.formatTime(this.currentTimeMinutes);
    }

    if (this.sunNeedsUpdate) {
      this._updateSunPosition();
      this.sunNeedsUpdate = false;
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  },

  startAnimation() {
    this.isPlaying = true;
  },

  stopAnimation() {
    this.isPlaying = false;
  },

  // --- Interaction ---

  _onMouseMove(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const meshes = this.buildingMeshes.map(e => e.mesh);
    const intersects = this.raycaster.intersectObjects(meshes);

    let hoveredEntry = null;
    if (intersects.length > 0) {
      const hitMesh = intersects[0].object;
      hoveredEntry = this.buildingMeshes.find(e => e.mesh === hitMesh);
    }

    if (this.onBuildingHover) {
      this.onBuildingHover(hoveredEntry, event.clientX, event.clientY);
    }
  },

  // --- Resize ---

  _onResize() {
    if (!this.container || !this.renderer) return;
    const width = this.container.clientWidth;
    const height = this.canvas.clientHeight || 560;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  },

  // --- Sky Dome ---

  _createSkyDome() {
    const skyGeo = new THREE.SphereGeometry(900, 32, 15);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x0d1b2a) },
        horizonColor: { value: new THREE.Color(0x1a2a4a) },
        bottomColor: { value: new THREE.Color(0x0a0a15) },
      },
      vertexShader: [
        'varying vec3 vWorldPosition;',
        'void main() {',
        '  vec4 worldPos = modelMatrix * vec4(position, 1.0);',
        '  vWorldPosition = worldPos.xyz;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}',
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 topColor;',
        'uniform vec3 horizonColor;',
        'uniform vec3 bottomColor;',
        'varying vec3 vWorldPosition;',
        'void main() {',
        '  float h = normalize(vWorldPosition).y;',
        '  vec3 color;',
        '  if (h > 0.0) {',
        '    float t = pow(h, 0.6);',
        '    color = mix(horizonColor, topColor, t);',
        '  } else {',
        '    color = bottomColor;',
        '  }',
        '  gl_FragColor = vec4(color, 1.0);',
        '}',
      ].join('\n'),
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyDome);
  },

  _updateSkyDome(factor, warmth) {
    if (!this.skyDome) return;
    const u = this.skyDome.material.uniforms;

    if (factor === 0) {
      // Night
      u.topColor.value.setRGB(0.02, 0.03, 0.08);
      u.horizonColor.value.setRGB(0.05, 0.05, 0.12);
      u.bottomColor.value.setRGB(0.02, 0.02, 0.05);
    } else if (warmth > 0.4) {
      // Sunrise/sunset — warm horizon
      u.topColor.value.setRGB(0.08 + factor * 0.15, 0.10 + factor * 0.18, 0.25 + factor * 0.15);
      u.horizonColor.value.setRGB(0.6 * warmth, 0.25 * warmth, 0.12 * warmth);
      u.bottomColor.value.setRGB(0.04, 0.04, 0.08);
    } else {
      // Daytime — blue sky
      u.topColor.value.setRGB(0.12 + factor * 0.08, 0.18 + factor * 0.22, 0.45 + factor * 0.15);
      u.horizonColor.value.setRGB(0.45 + factor * 0.2, 0.55 + factor * 0.15, 0.7 + factor * 0.1);
      u.bottomColor.value.setRGB(0.04, 0.04, 0.08);
    }

    // Also update fog color to match horizon
    this.scene.fog.color.copy(u.horizonColor.value);
  },

  // --- Sun Glow ---

  _createSunGlow() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255, 220, 80, 0.8)');
    gradient.addColorStop(0.2, 'rgba(255, 180, 50, 0.4)');
    gradient.addColorStop(0.5, 'rgba(255, 140, 30, 0.1)');
    gradient.addColorStop(1, 'rgba(255, 100, 20, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.5,
    });
    this.sunGlow = new THREE.Sprite(spriteMat);
    this.sunGlow.scale.set(40, 40, 1);
    this.scene.add(this.sunGlow);
  },

  // --- Grid ---

  _addStreetGrid() {
    const gridMaterial = new THREE.LineBasicMaterial({
      color: 0x2a3a4a,
      transparent: true,
      opacity: 0.3,
    });

    const points = [];
    for (let i = -400; i <= 400; i += 80) {
      points.push(new THREE.Vector3(i, 0.01, -400));
      points.push(new THREE.Vector3(i, 0.01, 400));
      points.push(new THREE.Vector3(-400, 0.01, i));
      points.push(new THREE.Vector3(400, 0.01, i));
    }

    const gridGeo = new THREE.BufferGeometry().setFromPoints(points);
    const grid = new THREE.LineSegments(gridGeo, gridMaterial);
    this.scene.add(grid);
  },

  // --- Cleanup ---

  dispose() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    window.removeEventListener('resize', this._boundOnResize);
    if (this.canvas) this.canvas.removeEventListener('mousemove', this._boundOnMouseMove);

    this.buildingMeshes.forEach(entry => {
      entry.mesh.geometry.dispose();
      if (entry.mesh.material.dispose) entry.mesh.material.dispose();
    });
    this.buildingMeshes = [];

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
    this.scene = null;
    this.camera = null;
    this.controls = null;
  },

  /**
   * Utility: get the sun arc points for visual arc line.
   * @param {number} month
   * @returns {THREE.Vector3[]}
   */
  getSunArcPoints(month) {
    const points = [];
    for (let m = 300; m <= 1200; m += 10) {
      const sun = SunPosition.calculate(month, m);
      if (sun.altitude > -0.05) {
        const pos = SunPosition.toWorldPosition(sun.altitude, sun.azimuth, 350);
        points.push(new THREE.Vector3(pos.x, Math.max(0, pos.y), pos.z));
      }
    }
    return points;
  },

  /**
   * Draw or update the sun arc line for the current month.
   */
  updateSunArc() {
    // Clean up previous arc and labels
    if (this.sunArc) {
      this.scene.remove(this.sunArc);
      this.sunArc.geometry.dispose();
      this.sunArc.material.dispose();
    }
    this.arcLabels.forEach(s => {
      this.scene.remove(s);
      s.material.map.dispose();
      s.material.dispose();
    });
    this.arcLabels = [];

    const points = this.getSunArcPoints(this.currentMonth);
    if (points.length < 2) return;

    // Arc line with vertex colors (bright near midday, fading at ends)
    const arcGeo = new THREE.BufferGeometry().setFromPoints(points);
    const colors = [];
    for (let i = 0; i < points.length; i++) {
      const t = i / (points.length - 1);
      const brightness = 1 - Math.abs(t - 0.5) * 1.6;
      const b = Math.max(0.15, brightness);
      colors.push(1.0 * b, 0.7 * b, 0.2 * b);
    }
    arcGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const arcMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
    });
    this.sunArc = new THREE.Line(arcGeo, arcMat);
    this.scene.add(this.sunArc);

    // Add time labels at key hours
    const labelHours = [480, 600, 720, 840, 960, 1080]; // 8am, 10am, 12pm, 2pm, 4pm, 6pm
    for (const minutes of labelHours) {
      const sun = SunPosition.calculate(this.currentMonth, minutes);
      if (sun.altitude <= 0) continue;
      const pos = SunPosition.toWorldPosition(sun.altitude, sun.azimuth, 350);

      const label = this._createTextSprite(SunPosition.formatTime(minutes), 0.5);
      label.position.set(pos.x, Math.max(5, pos.y) + 12, pos.z);
      this.scene.add(label);
      this.arcLabels.push(label);
    }
  },

  /**
   * Create a text sprite from a canvas-rendered string.
   */
  _createTextSprite(text, opacity) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 48;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255, 200, 100, ' + (opacity || 0.6) + ')';
    ctx.fillText(text, 64, 24);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(24, 9, 1);
    return sprite;
  },
};
