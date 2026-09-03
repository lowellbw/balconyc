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
// The shade model touches Three.js only to draw the balcony marker, and only
// when a Scene3D.scene exists. Tests never inspect the marker.
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
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

// The model files, in dependency order. This list is the contract for
// index.html's script tags too: keep them in step.
const MODEL_FILES = [
  'js/config.js',
  'js/pvwatts-nyc-table.js',
  'js/irradiance-nyc.js',
  'js/self-consumption-table.js',
  'js/sun-position.js',
  'js/shade-geometry.js',
  'js/self-consumption.js',
  'js/3d-shadow-model.js',
  'js/solar-api.js',
];

/**
 * Load the calculator's browser modules into one shared sandbox.
 * @param {object} [opts]
 * @param {object[]} [opts.buildingMeshes] - Scene3D.buildingMeshes contents (display code only)
 * @param {function} [opts.fetch] - a fetch stub, e.g. to replay a recorded PVWatts response
 * @returns {object} the loaded globals
 */
function loadModules(opts = {}) {
  const Scene3D = {
    scene: null,
    buildingMeshes: opts.buildingMeshes || [],
    targetBuilding: null,
  };

  const src = MODEL_FILES.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');

  const ctx = {
    THREE,
    Scene3D,
    console: { log() {}, warn() {}, error() {} },
    document: { getElementById: () => null },
    performance: { now: () => 0 },
    fetch: opts.fetch || (async () => { throw new Error('network disabled in tests'); }),
    AbortController,
    setTimeout,
    clearTimeout,
    module: undefined,
  };

  const exported = `
    return {
      SolarConfig, PVWattsTableNYC, IrradianceNYC, SelfConsumptionTable,
      SunPosition, ShadeGeometry, SelfConsumption, ShadowModel, SolarAPI,
      SolarState, getBoroughFromZip, soqlEscape, circleWkt, directionLabel,
    };`;

  const fn = new Function(...Object.keys(ctx), src + exported);
  const globals = fn(...Object.values(ctx));
  globals.Scene3D = Scene3D;
  globals.THREE = THREE;
  globals.MODEL_FILES = MODEL_FILES;
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
    console.log(`  \x1b[32mPASS\x1b[0m ${name}`);
  } catch (err) {
    state.failed++;
    console.log(`  \x1b[31mFAIL\x1b[0m ${name}`);
    console.log(`       ${err.message}`);
  }
}

/** Async variant: the runner awaits the promise before reporting. */
const pending = [];
function itAsync(name, fn) {
  const suite = state.current;
  const p = Promise.resolve().then(fn).then(() => {
    state.passed++;
    console.log(`  \x1b[32mPASS\x1b[0m ${name}`);
  }, err => {
    state.failed++;
    console.log(`  \x1b[31mFAIL\x1b[0m ${name}  (${suite})`);
    console.log(`       ${err.message}`);
  });
  pending.push(p);
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

async function report() {
  await Promise.all(pending);
  console.log(`\n${'-'.repeat(52)}`);
  console.log(`${state.passed} passed, ${state.failed} failed`);
  if (state.failed > 0) process.exitCode = 1;
  return state.failed === 0;
}

/**
 * Build a rectangular building entry centred on (cx, cz) in the local frame
 * (x east, z south, north = -z). Width runs along x, depth along z.
 */
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
    centroid: { x: cx, y: heightMeters / 2 + elevOffset, z: cz },
    bin: '',
  };
}

module.exports = { loadModules, describe, it, itAsync, assert, near, between, angleDiffDeg, report, box, THREE, MODEL_FILES };
