// ============================================================
// balco.nyc — red fork. Drives the site's real 3D scene, shadow
// trace and energy model against a sample block.
// ============================================================

// No keys here: the fork never calls Google, Geoclient or PVWatts, so the
// estimate takes solar-api.js's own client-side fallback path.
SolarConfig.GOOGLE_API_KEY = '';
SolarConfig.NREL_API_KEY = '';

const MONTHS = ['Jan', 'Mar', 'Jun', 'Sep', 'Dec'];
const MONTH_IDX = [0, 2, 5, 8, 11];
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const COMPASS = { 0: 'north', 45: 'north-east', 90: 'east', 135: 'south-east',
  180: 'south', 225: 'south-west', 270: 'west', 315: 'north-west' };

const S = {
  address: null, floor: null, azimuth: null, totalFloors: 28,
  tilt: 90, watts: 800, shadeProfile: null, result: null,
  selected: false, sceneReady: false,
};

// ---------- the sun over the block map in the hero ----------
(function heroSun() {
  const root = document.getElementById('hero');
  const sun = document.getElementById('sun');
  const halo = document.getElementById('halo');
  const clock = document.getElementById('sunClock');
  const grads = document.querySelectorAll('#cityWrap [data-city] rect');
  if (!root || !grads.length) return;

  const X0 = 600, X1 = 1180, YBASE = 132, RISE = 80;
  const CX = 306, CY = 50, CW = 946, CH = 946, VW = CITY_VW, VH = CITY_VH;
  const blocks = [];
  grads.forEach(function (el) {
    blocks.push({
      el: el, band: -1,
      x: parseFloat(el.getAttribute('x')) + CITY_BLOCK / 2,
      y: parseFloat(el.getAttribute('y')) + CITY_BLOCK / 2,
      r: CITY_RADII[parseInt(el.getAttribute('data-t'), 10)],
    });
  });

  let t = 0.46, target = 0.46, phase = Math.asin((0.46 - 0.5) / 0.46);
  let idle = true, lastMove = 0;
  root.addEventListener('mousemove', function (e) {
    const r = root.getBoundingClientRect();
    if (!r.width) return;
    target = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    idle = false; lastMove = Date.now();
  });
  root.addEventListener('mouseleave', function () { lastMove = Date.now(); });

  (function tick() {
    requestAnimationFrame(tick);
    if (!idle && Date.now() - lastMove > 2400) idle = true;
    if (idle) { phase += 0.0021; target = 0.5 + 0.46 * Math.sin(phase); }
    t += (target - t) * 0.09;

    const x = X0 + t * (X1 - X0);
    const y = YBASE - RISE * Math.sqrt(Math.max(0, 1 - Math.pow(2 * t - 1, 2)));
    const sx = ((x - CX) * VW) / CW, sy = ((y - CY) * VH) / CH;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const d = Math.sqrt((b.x - sx) * (b.x - sx) + (b.y - sy) * (b.y - sy)) / b.r;
      let band = 0;
      while (band < CITY_BOUNDS.length && d >= CITY_BOUNDS[band]) band++;
      if (band !== b.band) { b.band = band; b.el.setAttribute('fill', CITY_SHADES[band]); }
    }
    sun.style.left = x + 'px'; sun.style.top = y + 'px';
    halo.style.left = x + 'px'; halo.style.top = y + 'px';
    const mins = Math.round((18 - t * 12) * 60);
    const h = Math.floor(mins / 60), m = mins % 60, ap = h >= 12 ? 'PM' : 'AM';
    clock.textContent = (h % 12 || 12) + ':' + (m < 10 ? '0' + m : m) + ' ' + ap;
  })();
})();

// ---------- address pickers ----------
const pickers = document.getElementById('pickers');
BLOCK.addresses.forEach(function (a, i) {
  const b = document.createElement('button');
  b.className = 'pick';
  b.textContent = a.label;
  b.onclick = function () { chooseAddress(i); };
  pickers.appendChild(b);
});

function chooseAddress(i) {
  const a = BLOCK.addresses[i];
  Array.from(pickers.children).forEach(function (el, k) { el.classList.toggle('on', k === i); });
  S.address = a;
  S.totalFloors = a.floors;
  S.selected = false;
  S.shadeProfile = null;
  S.result = null;

  const target = BLOCK.features.find(function (f) { return f.properties.bin === a.bin; });
  const neighbours = BLOCK.features.filter(function (f) { return f.properties.bin !== a.bin; });

  // the shape solar-api.js and the scene both read from
  SolarState.lat = BLOCK.meta.lat;
  SolarState.lon = BLOCK.meta.lon;
  SolarState.address = a.label;
  SolarState.bin = a.bin;
  SolarState.heightroof = a.heightroof;
  SolarState.numfloors = a.floors;
  SolarState.groundelev = BLOCK.meta.groundelev;
  SolarState.footprintCoords = target.geometry.coordinates[0];
  SolarState.neighborBuildings = neighbours;

  document.getElementById('stAddr').textContent = a.label;
  document.getElementById('stMeta').textContent =
    a.floors + ' floors · ' + a.heightroof + ' ft · ' + neighbours.length +
    ' neighbouring buildings inside 200m';
  document.getElementById('stage').classList.add('on');
  document.getElementById('result').classList.remove('on');
  resetCard();
  document.getElementById('stage').scrollIntoView({ behavior: 'smooth', block: 'start' });

  buildScene(target, neighbours);
}

function resetCard() {
  document.getElementById('badge').textContent = 'Waiting for a balcony';
  document.getElementById('ctx').textContent =
    'Put your balcony on the building. Where you click up the wall is your floor; which wall you click is the way it faces.';
  ['dollars', 'kwh', 'payback', 'offset', 'shade'].forEach(function (id) {
    document.getElementById(id).textContent = '—';
  });
  document.getElementById('band').textContent = '—';
  const b = document.getElementById('seeFull');
  b.disabled = true; b.textContent = 'Place your balcony to continue';
  document.getElementById('prompt').style.display = '';
  const mv = document.getElementById('moveBalcony');
  if (mv) mv.style.display = 'none';
  document.getElementById('sunInfo').style.display = 'none';
}

// ---------- the real scene ----------
function buildScene(target, neighbours) {
  const canvas = document.getElementById('sceneCanvas');
  if (S.sceneReady) {
    Scene3D.addBuildings(target, neighbours, { neighborMaterial: ghostMaterial() });
    Scene3D.updateSunArc();
    Scene3D._onResize();
    canvas.classList.add('pointing');
    return;
  }

  Scene3D.init('sceneCanvas', {
    cameraDistance: 0.92,
    onSunUpdate: function (sunPos, month, minutes) {
      if (S.selected) {
        ShadowModel.updateColors(sunPos, month, minutes);
        ShadowModel.updateInfoPanels(sunPos, month, minutes);
      }
      const h = Math.floor(minutes / 60), m = minutes % 60;
      document.getElementById('timeLabel').textContent =
        (h % 12 || 12) + ':' + (m < 10 ? '0' + m : m) + ' ' + (h >= 12 ? 'PM' : 'AM');
      document.getElementById('timeSlider').value = minutes;
    },
    onBuildingHover: function (entry) {
      canvas.classList.toggle('pointing', !S.selected && !!(entry && entry.isTarget));
    },
  });
  S.sceneReady = true;
  Scene3D.addBuildings(target, neighbours, { neighborMaterial: ghostMaterial() });
  Scene3D.updateSunArc();
  Scene3D._onResize();
  setTimeout(function () { Scene3D._onResize(); }, 400);
  wireCanvas(canvas);
  wireControls();
}

function ghostMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x8a7868, transparent: true, opacity: 0.32, depthWrite: false, roughness: 0.9,
  });
}

// click, not drag — the same threshold the site uses
function wireCanvas(canvas) {
  let down = null, downAt = 0, moved = false;
  canvas.addEventListener('pointerdown', function (e) {
    down = { x: e.clientX, y: e.clientY }; downAt = Date.now(); moved = false;
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (dx * dx + dy * dy > 16) moved = true;
  });
  canvas.addEventListener('pointerup', function (e) {
    if (moved || !down || Date.now() - downAt > 300) { down = null; return; }
    down = null;
    onPick(e);
  });
}

function onPick(event) {
  if (S.selected || !Scene3D.targetBuilding) return;
  const rect = Scene3D.canvas.getBoundingClientRect();
  Scene3D.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  Scene3D.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  Scene3D.raycaster.setFromCamera(Scene3D.mouse, Scene3D.camera);
  const hits = Scene3D.raycaster.intersectObject(Scene3D.targetBuilding.mesh);
  if (!hits.length) return;
  const hit = hits[0];

  const nm = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
  const normal = hit.face.normal.clone().applyMatrix3(nm).normalize();
  if (normal.y > 0.5 || normal.y < -0.5) return;      // roof or underside

  let az = ((Math.atan2(normal.x, -normal.z) * 180 / Math.PI) + 360) % 360;
  az = Math.round(az / 45) * 45; if (az === 360) az = 0;

  const entry = Scene3D.targetBuilding;
  const clickY = hit.point.y - (entry.elevOffset || 0);
  const ratio = Math.max(0, Math.min(1, clickY / entry.heightMeters));
  const floor = Math.max(1, Math.min(S.totalFloors, Math.round(ratio * S.totalFloors)));

  S.azimuth = az; S.floor = floor; S.selected = true;
  Scene3D.canvas.classList.remove('pointing');
  placePanel(hit.point, normal);

  ShadowModel.init(entry, floor, S.totalFloors, SolarState.heightroof, az);
  document.getElementById('prompt').style.display = 'none';
  document.getElementById('sunInfo').style.display = '';
  runTrace();
}

function placePanel(point, normal) {
  const g = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = 128; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = '#1e293b'; x.fillRect(0, 0, 128, 96);
  x.strokeStyle = '#475569'; x.lineWidth = 1;
  for (let i = 0; i < 128; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 96); x.stroke(); }
  for (let i = 0; i < 96; i += 32) { x.beginPath(); x.moveTo(0, i); x.lineTo(128, i); x.stroke(); }
  x.fillStyle = 'rgba(100,160,255,0.15)'; x.fillRect(0, 0, 128, 96);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(4, 3),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), side: THREE.DoubleSide }));
  const frame = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 3.4),
    new THREE.MeshBasicMaterial({ color: 0x94a3b8, side: THREE.DoubleSide }));
  frame.position.z = -0.05;
  g.add(frame); g.add(panel);
  g.position.copy(point).addScaledVector(normal, 0.3);
  g.lookAt(g.position.clone().add(normal));
  Scene3D.scene.add(g);
  S.panel = g;
}

// ---------- the trace, then the model ----------
async function runTrace() {
  document.getElementById('modelling').classList.add('on');
  Scene3D.setTimeAndMonth(330, 5);                 // sunrise in June

  // the site's own 3D shade computation, for the tilt currently chosen
  const profile = ShadowModel.computeAnnualShadeProfile(S.tilt);
  S.shadeProfile = profile;

  const inputs = {
    azimuth: S.azimuth, floor: S.floor, totalFloors: S.totalFloors,
    tilt: S.tilt, systemWatts: S.watts, costTier: 'mid', shading: 'some',
    monthlyBill: 140, escalationPreset: 'mid', shadeProfile: profile,
  };
  const calc = SolarAPI.calculateEstimate(inputs);

  // walk the sun across the day while it computes
  await new Promise(function (done) {
    const t0 = performance.now(), DUR = 2600;
    (function step(now) {
      const p = Math.min(1, (now - t0) / DUR);
      Scene3D.setTimeAndMonth(Math.round(330 + p * (1170 - 330)), undefined);
      if (p < 1) requestAnimationFrame(step); else done();
    })(performance.now());
  });
  Scene3D.setTimeAndMonth(750, 5);

  const r = await calc;
  S.result = r;
  document.getElementById('modelling').classList.remove('on');
  document.getElementById('controls').classList.add('on');
  showLive(r, profile);
}

function money(n) { return '$' + Math.round(n).toLocaleString(); }

function showLive(r, profile) {
  document.getElementById('badge').textContent = 'Traced in 3D';
  document.getElementById('ctx').textContent =
    'Floor ' + S.floor + ' of ' + S.totalFloors + ', facing ' + COMPASS[S.azimuth] +
    ', ' + S.watts + 'W at ' + S.tilt + '°';
  document.getElementById('dollars').textContent = money(r.annualSavings);
  document.getElementById('band').textContent =
    Math.round(r.annualKwh * 0.85).toLocaleString() + ' to ' +
    Math.round(r.annualKwh * 1.15).toLocaleString() + ' kWh across the modelled ±15%';
  document.getElementById('kwh').textContent = Math.round(r.annualKwh).toLocaleString() + ' kWh';
  document.getElementById('payback').textContent =
    r.escalatedPayback < 25 ? r.escalatedPayback.toFixed(1) + ' yrs' : '25+ yrs';
  document.getElementById('offset').textContent = Math.round(r.billOffsetPct) + '%';
  document.getElementById('shade').textContent = profile.annualShadeFactor.toFixed(3);
  const b = document.getElementById('seeFull');
  b.disabled = false; b.textContent = 'See the full breakdown →';
  document.getElementById('moveBalcony').style.display = '';
}

// put it somewhere else on the building
function moveBalcony() {
  if (S.panel) { Scene3D.scene.remove(S.panel); S.panel = null; }
  if (typeof ShadowModel !== 'undefined' && ShadowModel.clear) ShadowModel.clear();
  S.selected = false; S.shadeProfile = null; S.result = null;
  document.getElementById('moveBalcony').style.display = 'none';
  document.getElementById('result').classList.remove('on');
  Scene3D.canvas.classList.add('pointing');
  resetCard();
}

// ---------- controls ----------
function wireControls() {
  const months = document.getElementById('months');
  MONTHS.forEach(function (label, i) {
    const b = document.createElement('button');
    b.textContent = label;
    if (MONTH_IDX[i] === 5) b.classList.add('on');
    b.onclick = function () {
      Array.from(months.children).forEach(function (el) { el.classList.remove('on'); });
      b.classList.add('on');
      Scene3D.setTimeAndMonth(undefined, MONTH_IDX[i]);
    };
    months.appendChild(b);
  });

  document.getElementById('timeSlider').addEventListener('input', function () {
    Scene3D.setTimeAndMonth(parseInt(this.value, 10), undefined);
  });
  document.getElementById('playBtn').addEventListener('click', function () {
    if (Scene3D.isPlaying) { Scene3D.stopAnimation(); this.innerHTML = '&#9654;'; }
    else { Scene3D.startAnimation(); this.innerHTML = '&#10073;&#10073;'; }
  });

  segments('tiltGrid', [[90, '90°'], [70, '70°'], [60, '60°'], [35, '35°']], S.tilt,
    function (v) { S.tilt = v; });
  segments('wattGrid', [[400, '400W'], [800, '800W'], [1200, '1200W'], [1600, '1600W']], S.watts,
    function (v) { S.watts = v; });

  document.getElementById('recalc').addEventListener('click', function () {
    if (!S.selected) return;
    runTrace();
  });
  document.getElementById('seeFull').addEventListener('click', showResult);
  document.getElementById('moveBalcony').addEventListener('click', moveBalcony);
  document.getElementById('backToScene').addEventListener('click', function () {
    document.getElementById('result').classList.remove('on');
    document.getElementById('stage').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  document.getElementById('startOver').addEventListener('click', function () {
    document.getElementById('stage').classList.remove('on');
    document.getElementById('result').classList.remove('on');
    Array.from(pickers.children).forEach(function (el) { el.classList.remove('on'); });
    S.selected = false;
    if (S.panel) { Scene3D.scene.remove(S.panel); S.panel = null; }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function segments(id, opts, current, onPick) {
  const grid = document.getElementById(id);
  grid.innerHTML = '';
  opts.forEach(function (o) {
    const b = document.createElement('button');
    b.textContent = o[1];
    if (o[0] === current) b.classList.add('on');
    b.onclick = function () {
      Array.from(grid.children).forEach(function (el) { el.classList.remove('on'); });
      b.classList.add('on');
      onPick(o[0]);
    };
    grid.appendChild(b);
  });
}

// ---------- result ----------
function showResult() {
  const r = S.result;
  if (!r) return;
  document.getElementById('result').classList.add('on');
  document.getElementById('rAddr').textContent = S.address.label;
  const ctx = 'Floor ' + S.floor + ' of ' + S.totalFloors + ', facing ' + COMPASS[S.azimuth] +
    ', ' + S.watts + 'W on the railing at ' + S.tilt + '°';
  document.getElementById('rCtx').textContent = ctx;
  document.getElementById('rDollars').textContent = money(r.annualSavings);
  document.getElementById('rBand').textContent =
    Math.round(r.annualKwh).toLocaleString() + ' kWh a year · ' +
    Math.round(r.annualKwh * 0.85).toLocaleString() + ' to ' +
    Math.round(r.annualKwh * 1.15).toLocaleString() + ' at the modelled ±15%';
  document.getElementById('rMonthly').textContent = money(r.monthlySavings);
  document.getElementById('rPayback').textContent =
    r.escalatedPayback < 25 ? r.escalatedPayback.toFixed(1) + ' yrs' : '25+ yrs';
  document.getElementById('rLife').textContent = money(r.lifetimeSavings);
  document.getElementById('rCo2').textContent = Math.round(r.co2Lbs).toLocaleString() + ' lb';

  const peak = Math.max.apply(null, r.monthlyKwh);
  document.getElementById('rPeak').textContent =
    'peaks at ' + Math.round(peak) + ' kWh in ' + MONTH_FULL[r.monthlyKwh.indexOf(peak)];
  const bars = document.getElementById('rBars');
  bars.innerHTML = '';
  r.monthlyKwh.forEach(function (v) {
    const d = document.createElement('div');
    d.style.height = Math.round((v / peak) * 100) + '%';
    bars.appendChild(d);
  });

  document.getElementById('aBuilding').textContent =
    S.totalFloors + ' floors · ' + SolarState.heightroof + ' ft';
  document.getElementById('aBalcony').textContent =
    'Floor ' + S.floor + ', facing ' + COMPASS[S.azimuth];
  document.getElementById('aShade').textContent =
    S.shadeProfile.annualShadeFactor.toFixed(3) + ' · ' +
    SolarState.neighborBuildings.length + ' buildings';
  document.getElementById('aSystem').textContent = S.watts + 'W at ' + S.tilt + '°';
  document.getElementById('aPath').textContent = r.usedPVWatts
    ? 'Computed with NREL PVWatts V8 over 8,760 hours, then shaded per month by the 3D trace.'
    : 'No PVWatts key in this fork, so the estimate took solar-api.js’s client-side fallback: ' +
      'NYC baseline yield scaled by tilt, azimuth, soiling and railing losses, then shaded per ' +
      'month by the 3D trace above. Roughly ±20% rather than ±15%.';
  document.getElementById('shareUrl').textContent =
    'balco.nyc/e/' + S.address.bin + '-' + S.floor + COMPASS[S.azimuth][0];
  document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
