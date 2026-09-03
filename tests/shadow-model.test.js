// Shade model regression tests.
//
// The shade factor multiplies PVWatts output, which already prices the
// panel's tilt and azimuth. So the factor must measure ONLY what
// obstructions take away. The load-bearing invariant is that a balcony with
// nothing around it scores 1.0 at EVERY orientation; a model that penalises
// a north-facing balcony for facing north double-counts orientation.

const { loadModules, describe, it, assert, near, between, box } = require('./harness');

/**
 * Run a shade profile against a synthetic skyline. With no `target` the
 * balcony floats at (0, balconyY, 0) with nothing behind it (a pure open-sky
 * test); with one, the panel hangs on the facade facing azimuthDeg.
 */
function profileFor({ target = null, neighbors = [], trees = [], azimuthDeg = 180, tilt = 90, balconyY = 20, floor = 3, totalFloors = 6, mountType = 'rail', model }) {
  const g = loadModules();
  const { ShadowModel } = g;
  ShadowModel.reset();
  const entries = target ? [Object.assign({}, target, { isTarget: true }), ...neighbors] : neighbors;
  ShadowModel.setBuildings(entries);
  if (trees.length) ShadowModel.setTrees(trees);
  if (target) {
    ShadowModel.init({ floor, totalFloors, azimuthDeg, mountType });
  } else {
    // No building: place the panel directly.
    ShadowModel.floor = floor; ShadowModel.totalFloors = totalFloors; ShadowModel.storeyM = 3;
    ShadowModel.mountType = mountType;
    ShadowModel.balconyAzimuth = azimuthDeg * Math.PI / 180;
    ShadowModel.balconyPoint = { x: 0, y: balconyY, z: 0 };
    ShadowModel._invalidate();
    ShadowModel.initialized = true;
  }
  const r = ShadowModel.computeAnnualShadeProfile(tilt);
  r.model = ShadowModel;
  return r;
}

const DIRECTIONS = [['north', 0], ['east', 90], ['south', 180], ['west', 270]];
// A 6-storey, 40 m x 16 m building centred at the origin, facade at z = +8 (south).
const TARGET = box(0, 0, 40, 16, 18);

describe('Shade factor, nothing around: must not penalise orientation', () => {
  for (const [name, az] of DIRECTIONS) {
    it(`returns 1.00 for a floating ${name}-facing panel with no obstructions`, () => {
      const r = profileFor({ azimuthDeg: az });
      near(r.annualShadeFactor, 1.0, 1e-9, `${name} annual shade factor`);
      r.monthlyShadeFactors.forEach((f, i) => near(f, 1.0, 1e-9, `${name} month ${i}`));
    });
  }

  it('keeps beam and sky intact when every building is shorter than the balcony', () => {
    // Low buildings cannot block the sun or the sky, but they do shade the
    // street the panel looks down on, so the ground-reflected share dips.
    const shorter = [box(0, -60, 20, 20, 5), box(60, 0, 20, 20, 8)];
    const r = profileFor({ neighbors: shorter, azimuthDeg: 90, balconyY: 30 });
    near(r.skyOpenFraction, 1.0, 1e-9, 'sky view untouched');
    between(r.annualShadeFactor, 0.98, 1.0, 'east-facing with low neighbours');
    assert(r.groundOpenFraction < 1, 'the street is a little shaded');
  });

  it('returns 1.00 for a vertical panel on a real facade with an open street', () => {
    // The wall the panel hangs on is behind it; a vertical panel never sees it.
    for (const [name, az] of DIRECTIONS) {
      const r = profileFor({ target: TARGET, azimuthDeg: az, floor: 3 });
      between(r.annualShadeFactor, 0.995, 1.0, `${name}-facing vertical panel on its own facade`);
    }
  });

  it('charges a tilted panel for the wall it hangs on, a little', () => {
    // A 35-degree panel looks up and back into its own building's facade.
    const r = profileFor({ target: TARGET, azimuthDeg: 180, tilt: 35, floor: 3 });
    between(r.annualShadeFactor, 0.90, 0.99, '35 deg panel below the top floor');
    const top = profileFor({ target: TARGET, azimuthDeg: 180, tilt: 35, floor: 6 });
    assert(top.annualShadeFactor > r.annualShadeFactor, 'less wall above the top floor');
  });
});

describe('Shade factor — obstructions reduce it', () => {
  it('penalises a tall building directly in front of the panel', () => {
    const blocker = [box(0, -30, 60, 30, 80)];  // tall, close, due north
    const open = profileFor({ azimuthDeg: 0 });
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

  it('scales with distance and with height', () => {
    const close = profileFor({ neighbors: [box(0, 25, 60, 20, 90)], azimuthDeg: 180 });
    const far = profileFor({ neighbors: [box(0, 150, 60, 20, 90)], azimuthDeg: 180 });
    assert(close.annualShadeFactor < far.annualShadeFactor, `close (${close.annualShadeFactor.toFixed(3)}) should block more than far (${far.annualShadeFactor.toFixed(3)})`);
    const tall = profileFor({ neighbors: [box(0, 40, 60, 20, 120)], azimuthDeg: 180 });
    const low = profileFor({ neighbors: [box(0, 40, 60, 20, 30)], azimuthDeg: 180 });
    assert(tall.annualShadeFactor < low.annualShadeFactor, `tall (${tall.annualShadeFactor.toFixed(3)}) should block more than low (${low.annualShadeFactor.toFixed(3)})`);
  });

  it('lets a deep canyon fall below the old 0.10 floor in winter but never to zero', () => {
    const ring = [
      box(0, 20, 200, 20, 200), box(0, -20, 200, 20, 200),
      box(20, 0, 20, 200, 200), box(-20, 0, 20, 200, 200),
    ];
    const r = profileFor({ neighbors: ring, azimuthDeg: 180, balconyY: 5 });
    between(r.annualShadeFactor, 0.02, 0.2, 'fully enclosed shade factor');
    r.monthlyShadeFactors.forEach((f, i) => between(f, 0.02, 1.0, `month ${i}`));
  });

  it('produces a shade factor in [0.02, 1] for every month in every direction', () => {
    for (const [, az] of DIRECTIONS) {
      const r = profileFor({ neighbors: [box(0, 45, 80, 25, 70), box(50, -40, 40, 40, 60)], azimuthDeg: az });
      r.monthlyShadeFactors.forEach((f, i) => between(f, 0.02, 1.0, `az ${az} month ${i}`));
      between(r.annualShadeFactor, 0.02, 1.0, `az ${az} annual`);
    }
  });

  it('weights the year by the panel\'s own energy, not a GHI curve', () => {
    // A south wall that blocks only low winter sun costs a vertical south
    // panel (winter-heavy) more than a GHI weighting would admit.
    const band = [box(0, 60, 400, 10, 30)];      // ~26 deg horizon due south from y=1
    const r = profileFor({ neighbors: band, azimuthDeg: 180, balconyY: 1 });
    const winter = (r.monthlyShadeFactors[11] + r.monthlyShadeFactors[0]) / 2;
    const summer = (r.monthlyShadeFactors[5] + r.monthlyShadeFactors[6]) / 2;
    assert(winter < summer - 0.2, `winter (${winter.toFixed(2)}) should be far below summer (${summer.toFixed(2)})`);
    // The retired model weighted months by a GHI curve (summer-heavy). A
    // vertical south panel makes most of its energy in the cool months, so
    // the energy-weighted annual must sit below the GHI-weighted mean.
    const ghi = [0.056, 0.068, 0.082, 0.092, 0.105, 0.112, 0.114, 0.103, 0.088, 0.073, 0.056, 0.051];
    const ghiWeighted = r.monthlyShadeFactors.reduce((s, f, i) => s + f * ghi[i], 0);
    assert(r.annualShadeFactor < ghiWeighted - 0.02,
      `annual (${r.annualShadeFactor.toFixed(3)}) should be below the GHI-weighted mean (${ghiWeighted.toFixed(3)})`);
  });
});

describe('Horizon profile — geometry edge cases', () => {
  it('sees a wide neighbour across its whole span, not just its centroid', () => {
    const wall = [box(0, -40, 400, 15, 90)];
    const r = profileFor({ neighbors: wall, azimuthDeg: 0, balconyY: 10 });
    assert(r.skyOpenFraction < 0.6, `a 400m wall 40m away should cut sky openness well below 0.6, got ${r.skyOpenFraction.toFixed(3)}`);
  });

  it('resolves a concave (L-shaped) neighbour without blocking through the notch', () => {
    const { ShadowModel } = loadModules();
    ShadowModel.reset();
    const L = {
      isTarget: false, heightMeters: 80, elevOffset: 0,
      localCoords: [
        { x: 20, z: 20 }, { x: 120, z: 20 }, { x: 120, z: 50 },
        { x: 50, z: 50 }, { x: 50, z: 120 }, { x: 20, z: 120 },
      ],
    };
    ShadowModel.setBuildings([L]);
    ShadowModel.balconyPoint = { x: 0, y: 10, z: 0 };
    const profile = ShadowModel.buildHorizonProfile(ShadowModel.balconyPoint);
    assert(profile[ShadowModel._binOf(135 * Math.PI / 180)] > 0.1, 'the L arms should register as obstruction');
    assert(profile[ShadowModel._binOf(0)] < 0, 'open sky behind the viewer must stay unobstructed');
  });

  it('handles a neighbour straddling due north without wrapping errors', () => {
    const r = profileFor({ neighbors: [box(0, -50, 120, 20, 90)], azimuthDeg: 0, balconyY: 10 });
    assert(r.skyOpenFraction < 0.85, 'a building due north should reduce a north-facing panel sky view');
    between(r.annualShadeFactor, 0.02, 1.0, 'factor stays in range across the seam');
  });

  it('includes the target building\'s own wings (courtyard balconies see them)', () => {
    // A U-shaped target: the balcony faces into the courtyard between two wings.
    const U = {
      isTarget: true, heightMeters: 30, elevOffset: 0,
      localCoords: [
        { x: -30, z: -20 }, { x: 30, z: -20 }, { x: 30, z: 20 }, { x: 15, z: 20 },
        { x: 15, z: -5 }, { x: -15, z: -5 }, { x: -15, z: 20 }, { x: -30, z: 20 },
      ],
    };
    const g = loadModules();
    g.ShadowModel.reset();
    g.ShadowModel.setBuildings([U]);
    g.ShadowModel.balconyPoint = { x: 0, y: 4, z: -3 };
    g.ShadowModel.balconyAzimuth = Math.PI;
    g.ShadowModel._invalidate();
    g.ShadowModel.initialized = true;
    const r = g.ShadowModel.computeAnnualShadeProfile(90);
    assert(r.annualShadeFactor < 0.9, `wings should shade a courtyard balcony, got ${r.annualShadeFactor.toFixed(3)}`);
  });
});

describe('Balcony placement', () => {
  it('derives storey height from the building and clamps it to plausible values', () => {
    const { ShadowModel } = loadModules();
    near(ShadowModel.storeyHeight(30, 10), 3.0, 1e-9, '30 m / 10 floors');
    near(ShadowModel.storeyHeight(60, 10), 4.5, 1e-9, 'bulkheads inflate: clamp high');
    near(ShadowModel.storeyHeight(20, 10), 2.7, 1e-9, 'clamp low');
    near(ShadowModel.storeyHeight(0, 10), 3.0, 1e-9, 'unknown height: default');
  });

  it('puts the panel just above the slab of its floor, not at the ceiling', () => {
    const r = profileFor({ target: TARGET, azimuthDeg: 180, floor: 1 });
    near(r.model.balconyPoint.y, 0.8, 1e-9, 'floor 1 panel height');
    const top = profileFor({ target: TARGET, azimuthDeg: 180, floor: 6 });
    near(top.model.balconyPoint.y, 15.8, 1e-9, 'top floor is one storey below the roof');
    assert(top.model.balconyPoint.z > 8, 'south-facing panel sits outside the south facade');
  });

  it('maps a click height to the floor whose slab is below it', () => {
    const { ShadowModel } = loadModules();
    assert(ShadowModel.floorFromHeight(0.5, 18, 6) === 1, 'ground floor');
    assert(ShadowModel.floorFromHeight(4.3, 18, 6) === 2, 'a click 1.3 m above the second slab is floor 2');
    assert(ShadowModel.floorFromHeight(17.9, 18, 6) === 6, 'just under the roof is the top floor');
    assert(ShadowModel.floorFromHeight(50, 18, 6) === 6, 'clamped to the building');
  });

  it('places the panel along the facade where the visitor clicked', () => {
    const g = loadModules();
    g.ShadowModel.reset();
    g.ShadowModel.setBuildings([Object.assign({}, TARGET, { isTarget: true })]);
    g.ShadowModel.init({ floor: 2, totalFloors: 6, azimuthDeg: 180, clickPoint: { x: 15, z: 8 } });
    near(g.ShadowModel.balconyPoint.x, 15, 0.01, 'x follows the click');
    g.ShadowModel.init({ floor: 2, totalFloors: 6, azimuthDeg: 180, clickPoint: { x: 60, z: 8 } });
    between(g.ShadowModel.balconyPoint.x, 15, 19.5, 'a click past the corner stays on the facade');
  });

  it('a lower placement sees more of the opposite roofline', () => {
    const opposite = [box(0, 8 + 18 + 10, 120, 20, 24)];
    const low = profileFor({ target: TARGET, neighbors: opposite, azimuthDeg: 180, floor: 2 });
    const high = profileFor({ target: TARGET, neighbors: opposite, azimuthDeg: 180, floor: 5 });
    assert(low.annualShadeFactor < high.annualShadeFactor - 0.05, 'higher floors are less shaded');
  });
});

describe('Shade factor, tilt awareness and the slab above', () => {
  it('uses the panel tilt, and a tilted panel sees more sky than a vertical one', () => {
    const neighbors = [box(0, 35, 80, 20, 70)];
    const vertical = profileFor({ neighbors, azimuthDeg: 180, tilt: 90 });
    const tilted = profileFor({ neighbors, azimuthDeg: 180, tilt: 35 });
    assert(Math.abs(vertical.annualShadeFactor - tilted.annualShadeFactor) > 0.005, 'tilt changes the factor');
    assert(tilted.skyOpenFraction > vertical.skyOpenFraction, 'a 35deg panel sees more open sky');
  });

  it('keeps a floating open-sky panel at 1.00 for every tilt', () => {
    for (const tilt of [35, 60, 70, 90]) {
      near(profileFor({ azimuthDeg: 180, tilt }).annualShadeFactor, 1.0, 1e-9, `tilt ${tilt}`);
    }
  });

  it('charges nothing for the slab when the panel hangs outside the railing', () => {
    const rail = profileFor({ target: TARGET, azimuthDeg: 180, floor: 3, mountType: 'rail' });
    assert(rail.model.ceilingProfile === null, 'no ceiling band for a rail-hung panel');
  });

  it('charges a slab overhang, more for a tilted panel and in summer', () => {
    const rail = profileFor({ target: TARGET, azimuthDeg: 180, floor: 3, mountType: 'rail' });
    const wall = profileFor({ target: TARGET, azimuthDeg: 180, floor: 3, mountType: 'wall' });
    assert(wall.annualShadeFactor < rail.annualShadeFactor - 0.05, `wall-mounted (${wall.annualShadeFactor.toFixed(3)}) should lose to rail-hung (${rail.annualShadeFactor.toFixed(3)})`);
    assert(wall.monthlyShadeFactors[5] < wall.monthlyShadeFactors[11], 'the slab bites hardest in summer when the sun is high');
    const wallTilted = profileFor({ target: TARGET, azimuthDeg: 180, floor: 3, mountType: 'wall', tilt: 35 });
    assert(wallTilted.annualShadeFactor < wall.annualShadeFactor, 'a tilted panel looks up into the slab');
  });

  it('has no slab above the top floor', () => {
    const top = profileFor({ target: TARGET, azimuthDeg: 180, floor: 6, mountType: 'wall' });
    assert(top.model.ceilingProfile === null, 'top floor has no ceiling band');
  });
});

describe('Street trees', () => {
  const tree = { x: 0, z: 22, crownBase: 3, crownTop: 12, radius: 4 };   // 14 m in front of a south facade at z = 8
  it('reduce the factor for a low floor in every season', () => {
    // In summer the high sun clears the crown, so a bare winter crown (60%
    // transmittance) in front of the low winter sun can cost a south-facing
    // panel more than the summer leaves do.
    const clear = profileFor({ target: TARGET, azimuthDeg: 180, floor: 1 });
    const shaded = profileFor({ target: TARGET, azimuthDeg: 180, floor: 1, trees: [tree] });
    assert(shaded.annualShadeFactor < clear.annualShadeFactor - 0.05, `a tree in front (${shaded.annualShadeFactor.toFixed(3)}) should shade floor 1 (${clear.annualShadeFactor.toFixed(3)})`);
    assert(shaded.monthlyShadeFactors[0] < clear.monthlyShadeFactors[0] - 0.05, 'bare crown costs the winter sun');
    assert(shaded.monthlyShadeFactors[6] < clear.monthlyShadeFactors[6] - 0.02, 'leaves cost some summer sky');
    assert(shaded.treeCount === 1, 'tree counted');
  });

  it('barely touch a high floor above the crown', () => {
    const clear = profileFor({ target: TARGET, azimuthDeg: 180, floor: 6 });
    const shaded = profileFor({ target: TARGET, azimuthDeg: 180, floor: 6, trees: [tree] });
    assert(clear.annualShadeFactor - shaded.annualShadeFactor < 0.03, 'the top floor looks over the crown');
  });

  it('are partly transparent, never opaque', () => {
    const { ShadowModel } = loadModules();
    ShadowModel.reset();
    ShadowModel.setTrees([tree]);
    ShadowModel.balconyPoint = { x: 0, y: 2, z: 8 };
    const m = ShadowModel.buildTreeMasks(ShadowModel.balconyPoint);
    const mn = Math.min(...m.leaf), mb = Math.min(...m.bare);
    near(mn, 0.2, 1e-6, 'leaf transmittance');
    near(mb, 0.6, 1e-6, 'bare transmittance');
  });
});

describe('Display scoring stays out of the energy path', () => {
  it('amplifies the display score but never the physics score', () => {
    const { ShadowModel } = loadModules();
    ShadowModel.reset();
    ShadowModel.balconyPoint = { x: 0, y: 5, z: 0 };
    ShadowModel.balconyAzimuth = Math.PI;
    const entry = box(0, 30, 40, 20, 60);
    const score = ShadowModel._scoreShadowImpact(entry, { altitude: 0.2, azimuth: Math.PI });
    assert(score.display >= score.physics, 'display score amplifies physics');
    between(score.physics, 0, 1, 'physics score');
    between(score.display, 0, 1, 'display score');
  });
});

describe('directSunHours', () => {
  it('reports more direct sun in June than December for a south balcony, and none when enclosed', () => {
    const r = profileFor({ target: TARGET, azimuthDeg: 180, floor: 3 });
    const june = r.model.directSunHours(5, 90), dec = r.model.directSunHours(11, 90);
    between(june, 6, 15, 'June direct sun hours');
    between(dec, 5, 10, 'December direct sun hours');
    const ring = [box(0, 12, 300, 10, 300), box(0, -12, 300, 10, 300), box(12, 0, 10, 300, 300), box(-12, 0, 10, 300, 300)];
    const enclosed = profileFor({ neighbors: ring, azimuthDeg: 180, balconyY: 2 });
    near(enclosed.model.directSunHours(5, 90), 0, 0.5, 'enclosed June direct sun');
  });
});
