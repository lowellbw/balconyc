// ============================================================
// balco.nyc — test harness
// ============================================================
// Loads the browser-global modules in js/ into a Node sandbox so the
// shipped source can be exercised directly. No build step, no deps.
// ============================================================

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// --- Minimal THREE stub -------------------------------------------------
// The model files touch only Vector3 plus a handful of constructors used for
// scene decoration, which the tests never inspect.
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
}
const noop = class { constructor() { this.position = new Vector3(); this.rotation = { x: 0, y: 0, z: 0 }; } };
const THREE = {
  Vector3,
  SphereGeometry: noop,
  RingGeometry: noop,
  MeshBasicMaterial: noop,
  Mesh: noop,
  DoubleSide: 2,
};

/**
 * Load the calculator's browser modules into one shared sandbox.
 * @param {object} [opts]
 * @param {object[]} [opts.buildingMeshes] - Scene3D.buildingMeshes contents
 * @returns {object} the loaded globals
 */
function loadModules(opts = {}) {
  const Scene3D = {
    scene: { add() {} },
    buildingMeshes: opts.buildingMeshes || [],
    targetBuilding: null,
  };

  const files = [
    'js/config.js',
    'js/sun-position.js',
    'js/3d-shadow-model.js',
    'js/solar-api.js',
  ];
  const src = files.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');

  const ctx = {
    THREE,
    Scene3D,
    console: { log() {}, warn() {}, error() {} },
    document: { getElementById: () => null },
    performance: { now: () => 0 },
    fetch: async () => { throw new Error('network disabled in tests'); },
    AbortController,
    setTimeout,
    clearTimeout,
    module: undefined,
  };

  // solar-api.js declares its own `SolarState`, so export that one rather than
  // the placeholder above — tests must see the object the module actually uses.
  const exported = `
    return {
      SolarConfig, SunPosition, ShadowModel, SolarAPI,
      TILT_FACTORS, AZIMUTH_FACTORS, DEFAULT_MONTHLY_DISTRIBUTION,
      getShadeFactor, getBoroughFromZip, soqlEscape,
      SolarState,
    };`;

  const fn = new Function(...Object.keys(ctx), src + exported);
  const globals = fn(...Object.values(ctx));
  globals.Scene3D = Scene3D;
  globals.THREE = THREE;
  return globals;
}

// --- Tiny assertion runner ---------------------------------------------
const state = { passed: 0, failed: 0, current: '' };

function describe(name, fn) {
  state.current = name;
  console.log(`\n${name}`);
  fn();
}

function it(name, fn) {
  try {
    fn();
    state.passed++;
    console.log(`  [32mPASS[0m ${name}`);
  } catch (err) {
    state.failed++;
    console.log(`  [31mFAIL[0m ${name}`);
    console.log(`       ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function near(actual, expected, tolerance, label) {
  if (!Number.isFinite(actual)) throw new Error(`${label || ''} got non-finite ${actual}`);
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label || ''} expected ${expected} +/- ${tolerance}, got ${actual.toFixed(4)}`);
  }
}

function between(actual, lo, hi, label) {
  if (!(actual >= lo && actual <= hi)) {
    throw new Error(`${label || ''} expected within [${lo}, ${hi}], got ${Number(actual).toFixed(4)}`);
  }
}

/** Angular difference in degrees, wrapped to [0, 180]. */
function angleDiffDeg(a, b) {
  let d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function report() {
  console.log(`\n${'-'.repeat(52)}`);
  console.log(`${state.passed} passed, ${state.failed} failed`);
  if (state.failed > 0) process.exitCode = 1;
  return state.failed === 0;
}

/** Build a rectangular building footprint centred on (cx, cz). */
function box(cx, cz, width, depth, heightMeters, elevOffset = 0) {
  const w = width / 2, d = depth / 2;
  return {
    isTarget: false,
    heightMeters,
    elevOffset,
    localCoords: [
      { x: cx - w, z: cz - d },
      { x: cx + w, z: cz - d },
      { x: cx + w, z: cz + d },
      { x: cx - w, z: cz + d },
    ],
  };
}

module.exports = { loadModules, describe, it, assert, near, between, angleDiffDeg, report, box, THREE };
