// Shadow model regression tests.
//
// The shade factor multiplies PVWatts output, which already prices the
// panel's tilt and azimuth. So the factor must measure ONLY what
// neighbouring buildings take away. The load-bearing invariant is that an
// unobstructed balcony scores ~1.0 at EVERY orientation; a model that
// penalises a north-facing balcony for facing north is double-counting
// orientation and will halve real estimates.

const { loadModules, describe, it, assert, near, between, box } = require('./harness');

/** Run a shade profile against a synthetic skyline. */
function profileFor({ neighbors = [], azimuthDeg = 180, tilt = 90, balconyY = 20 }) {
  const g = loadModules({ buildingMeshes: [{ isTarget: true }, ...neighbors] });
  const { ShadowModel, THREE } = g;
  ShadowModel.initialized = true;
  ShadowModel.targetBalconyPoint = new THREE.Vector3(0, balconyY, 0);
  ShadowModel.balconyAzimuth = azimuthDeg * Math.PI / 180;
  ShadowModel.horizonProfile = null;
  return ShadowModel.computeAnnualShadeProfile(tilt);
}

const OPEN_SKY = [];
const DIRECTIONS = [['north', 0], ['east', 90], ['south', 180], ['west', 270]];

describe('Shade factor — open sky must not penalise orientation', () => {
  for (const [name, az] of DIRECTIONS) {
    it(`returns ~1.00 for an unobstructed ${name}-facing balcony`, () => {
      const r = profileFor({ neighbors: OPEN_SKY, azimuthDeg: az });
      between(r.annualShadeFactor, 0.99, 1.0, `${name} annual shade factor`);
    });
  }

  it('returns ~1.00 with only buildings shorter than the balcony', () => {
    const shorter = [box(0, -60, 20, 20, 5), box(60, 0, 20, 20, 8)];
    const r = profileFor({ neighbors: shorter, azimuthDeg: 90, balconyY: 30 });
    between(r.annualShadeFactor, 0.99, 1.0, 'east-facing with low neighbours');
  });

  it('gives every month ~1.00 under open sky, not just the annual average', () => {
    const r = profileFor({ neighbors: OPEN_SKY, azimuthDeg: 270 });
    r.monthlyShadeFactors.forEach((f, i) => between(f, 0.98, 1.0, `month ${i}`));
  });
});

describe('Shade factor — obstructions reduce it', () => {
  it('penalises a tall building directly in front of the panel', () => {
    const blocker = [box(0, -30, 60, 30, 80)];  // tall, close, due north
    const open = profileFor({ neighbors: OPEN_SKY, azimuthDeg: 0 });
    const blocked = profileFor({ neighbors: blocker, azimuthDeg: 0 });
    assert(blocked.annualShadeFactor < open.annualShadeFactor - 0.2,
      `blocked (${blocked.annualShadeFactor.toFixed(3)}) should be well below open (${open.annualShadeFactor.toFixed(3)})`);
  });

  it('penalises a south-facing balcony more when the blocker is to the south', () => {
    const toSouth = profileFor({ neighbors: [box(0, 30, 60, 30, 80)], azimuthDeg: 180 });
    const toNorth = profileFor({ neighbors: [box(0, -30, 60, 30, 80)], azimuthDeg: 180 });
    assert(toSouth.annualShadeFactor < toNorth.annualShadeFactor,
      `a southern blocker (${toSouth.annualShadeFactor.toFixed(3)}) should cost a south-facing panel more than a northern one (${toNorth.annualShadeFactor.toFixed(3)})`);
  });

  it('scales with distance — a closer building blocks more', () => {
    const close = profileFor({ neighbors: [box(0, 25, 60, 20, 90)], azimuthDeg: 180 });
    const far = profileFor({ neighbors: [box(0, 150, 60, 20, 90)], azimuthDeg: 180 });
    assert(close.annualShadeFactor < far.annualShadeFactor,
      `close (${close.annualShadeFactor.toFixed(3)}) should block more than far (${far.annualShadeFactor.toFixed(3)})`);
  });

  it('scales with height — a taller building blocks more', () => {
    const tall = profileFor({ neighbors: [box(0, 40, 60, 20, 120)], azimuthDeg: 180 });
    const low = profileFor({ neighbors: [box(0, 40, 60, 20, 30)], azimuthDeg: 180 });
    assert(tall.annualShadeFactor < low.annualShadeFactor,
      `tall (${tall.annualShadeFactor.toFixed(3)}) should block more than low (${low.annualShadeFactor.toFixed(3)})`);
  });

  it('stays within the documented clamp under a full enclosure', () => {
    const ring = [
      box(0, 20, 200, 20, 200), box(0, -20, 200, 20, 200),
      box(20, 0, 20, 200, 200), box(-20, 0, 20, 200, 200),
    ];
    const r = profileFor({ neighbors: ring, azimuthDeg: 180, balconyY: 5 });
    between(r.annualShadeFactor, 0.10, 0.35, 'fully enclosed shade factor');
  });

  it('produces a shade factor in [0,1] for every month in every direction', () => {
    for (const [, az] of DIRECTIONS) {
      const r = profileFor({ neighbors: [box(0, 45, 80, 25, 70), box(50, -40, 40, 40, 60)], azimuthDeg: az });
      r.monthlyShadeFactors.forEach((f, i) => between(f, 0.10, 1.0, `az ${az} month ${i}`));
      between(r.annualShadeFactor, 0.10, 1.0, `az ${az} annual`);
    }
  });
});

describe('Horizon profile — geometry edge cases', () => {
  it('sees a wide neighbour across its whole span, not just its centroid', () => {
    // A long wall whose centroid sits far off-axis but which still fills the view.
    const wall = [box(0, -40, 400, 15, 90)];
    const r = profileFor({ neighbors: wall, azimuthDeg: 0, balconyY: 10 });
    assert(r.skyOpenFraction < 0.6,
      `a 400m wall 40m away should cut sky openness well below 0.6, got ${r.skyOpenFraction.toFixed(3)}`);
  });

  it('resolves a concave (L-shaped) neighbour without blocking through the notch', () => {
    const g = loadModules({ buildingMeshes: [{ isTarget: true }] });
    const { ShadowModel, THREE } = g;
    // L-shape: arms along +X and +Z, with the notch facing the viewer at origin.
    const L = {
      isTarget: false, heightMeters: 80, elevOffset: 0,
      localCoords: [
        { x: 20, z: 20 }, { x: 120, z: 20 }, { x: 120, z: 50 },
        { x: 50, z: 50 }, { x: 50, z: 120 }, { x: 20, z: 120 },
      ],
    };
    g.Scene3D.buildingMeshes.push(L);
    ShadowModel.initialized = true;
    ShadowModel.targetBalconyPoint = new THREE.Vector3(0, 10, 0);
    ShadowModel.balconyAzimuth = Math.PI;
    ShadowModel.horizonProfile = null;
    const profile = ShadowModel.buildHorizonProfile();

    // Due south-east of the viewer (~135 deg) the arms are present.
    const blockedBin = ShadowModel._binOf(135 * Math.PI / 180);
    assert(profile[blockedBin] > 0.1, 'the L arms should register as obstruction');

    // Due north (0 deg) is empty space behind the viewer — nothing there.
    const openBin = ShadowModel._binOf(0);
    assert(profile[openBin] < 0, 'open sky behind the viewer must stay unobstructed');
  });

  it('handles a neighbour straddling due north without wrapping errors', () => {
    // Centred on the 0/360 azimuth seam.
    const straddling = [box(0, -50, 120, 20, 90)];
    const r = profileFor({ neighbors: straddling, azimuthDeg: 0, balconyY: 10 });
    const g = loadModules({ buildingMeshes: [{ isTarget: true }, ...straddling] });
    assert(r.skyOpenFraction < 0.85, 'a building due north should reduce a north-facing panel sky view');
    assert(r.annualShadeFactor > 0.10 && r.annualShadeFactor <= 1.0, 'factor stays in range across the seam');
  });
});

describe('Shade factor — tilt awareness', () => {
  it('uses the panel tilt, so a tilted panel scores differently from a vertical one', () => {
    const neighbors = [box(0, 35, 80, 20, 70)];
    const vertical = profileFor({ neighbors, azimuthDeg: 180, tilt: 90 });
    const tilted = profileFor({ neighbors, azimuthDeg: 180, tilt: 35 });
    assert(Math.abs(vertical.annualShadeFactor - tilted.annualShadeFactor) > 0.005,
      'tilt should change the shade factor; it is passed into the incidence model');
  });

  it('gives a tilted panel a larger sky view than a vertical one', () => {
    const neighbors = [box(0, 35, 80, 20, 70)];
    const vertical = profileFor({ neighbors, azimuthDeg: 180, tilt: 90 });
    const tilted = profileFor({ neighbors, azimuthDeg: 180, tilt: 35 });
    assert(tilted.skyOpenFraction > vertical.skyOpenFraction,
      `a 35deg panel (${tilted.skyOpenFraction.toFixed(3)}) sees more open sky than a vertical one (${vertical.skyOpenFraction.toFixed(3)})`);
  });

  it('keeps open sky at ~1.00 for every tilt', () => {
    for (const tilt of [35, 60, 70, 90]) {
      const r = profileFor({ neighbors: OPEN_SKY, azimuthDeg: 180, tilt });
      between(r.annualShadeFactor, 0.99, 1.0, `tilt ${tilt} open-sky factor`);
    }
  });
});

describe('Display scoring stays out of the energy path', () => {
  it('amplifies the display score but never the physics score', () => {
    const g = loadModules({ buildingMeshes: [] });
    const { ShadowModel, THREE } = g;
    ShadowModel.targetBalconyPoint = new THREE.Vector3(0, 5, 0);
    ShadowModel.balconyAzimuth = Math.PI;
    const entry = box(0, 30, 40, 20, 60);
    const sun = { altitude: 0.2, azimuth: Math.PI };
    const score = ShadowModel._scoreShadowImpact(entry, sun);
    assert(score.display >= score.physics, 'display score amplifies physics');
    between(score.physics, 0, 1, 'physics score');
    between(score.display, 0, 1, 'display score');
  });
});

describe('directSunHours', () => {
  it('reports more direct sun in June than December for a south balcony', () => {
    const g = loadModules({ buildingMeshes: [{ isTarget: true }] });
    const { ShadowModel, THREE } = g;
    ShadowModel.initialized = true;
    ShadowModel.targetBalconyPoint = new THREE.Vector3(0, 20, 0);
    ShadowModel.balconyAzimuth = Math.PI;
    ShadowModel.horizonProfile = null;
    const june = ShadowModel.directSunHours(5, 90);
    const dec = ShadowModel.directSunHours(11, 90);
    assert(june > 0 && dec > 0, 'both months should see some sun');
    between(june, 6, 15, 'June direct sun hours');
    between(dec, 5, 10, 'December direct sun hours');
  });

  it('reports zero direct sun when fully enclosed by tall neighbours', () => {
    const ring = [
      box(0, 12, 300, 10, 300), box(0, -12, 300, 10, 300),
      box(12, 0, 10, 300, 300), box(-12, 0, 10, 300, 300),
    ];
    const g = loadModules({ buildingMeshes: [{ isTarget: true }, ...ring] });
    const { ShadowModel, THREE } = g;
    ShadowModel.initialized = true;
    ShadowModel.targetBalconyPoint = new THREE.Vector3(0, 2, 0);
    ShadowModel.balconyAzimuth = Math.PI;
    ShadowModel.horizonProfile = null;
    near(ShadowModel.directSunHours(5, 90), 0, 0.5, 'enclosed June direct sun');
  });
});
