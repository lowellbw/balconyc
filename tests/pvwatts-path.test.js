// The PVWatts path, exercised against a recorded V8 response so the primary
// model is tested even though the suite never touches the network.

const fs = require('fs');
const path = require('path');
const { loadModules, describe, itAsync, assert, near, between } = require('./harness');

const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'pvwatts-v8-nyc-t90-a180-1kw.json'), 'utf8'));

function withFetch(handler) {
  const calls = [];
  const g = loadModules({
    fetch: async (url) => {
      calls.push(url);
      return handler(url, calls.length);
    },
  });
  g.SolarState.lat = 40.7128; g.SolarState.lon = -73.996;
  return { g, calls };
}
const ok = body => ({ ok: true, status: 200, json: async () => body });
const INPUTS = { azimuth: 180, tilt: 90, systemWatts: 1000, inverterWatts: 1200, floor: 6, totalFloors: 6, shading: 'open', mountType: 'rail', occupancy: 'base', monthlyBill: 140, costTier: 'mid', escalationPreset: 'mid' };

describe('PVWatts path (recorded response)', () => {
  itAsync('uses PVWatts monthly output, derated by shade and railing only', async () => {
    const { g, calls } = withFetch(() => ok(FIXTURE));
    const r = await g.SolarAPI.calculateEstimate(INPUTS);
    assert(r.usedPVWatts, 'PVWatts path taken');
    assert(r.pvwattsVariant === 'monthly soiling array', `first variant should succeed, got ${r.pvwattsVariant}`);
    assert(calls.length === 1, `one request, got ${calls.length}`);
    // Open site, top floor, vertical: the shade factor is 1, so only the railing factor applies.
    near(r.shadeFactor, 1.0, 0.01, 'open-site shade factor');
    near(r.annualKwh, FIXTURE.outputs.ac_annual * g.SolarConfig.RAILING_OBSTRUCTION_BY_TILT[90], 5, 'annual = PVWatts x railing');
    r.monthlyKwh.forEach((v, i) => near(v / FIXTURE.outputs.ac_monthly[i], g.SolarConfig.RAILING_OBSTRUCTION_BY_TILT[90] * r.monthlyShadeFactors[i], 0.001, `month ${i}`));
  });

  itAsync('sends the documented parameters to the live host', async () => {
    const { g, calls } = withFetch(() => ok(FIXTURE));
    await g.SolarAPI.calculateEstimate(INPUTS);
    const u = new URL(calls[0]);
    assert(u.host === 'developer.nlr.gov', `host should be nlr.gov, got ${u.host}`);
    assert(u.searchParams.get('soiling') === g.SolarConfig.PVWATTS_PARAMS.soiling_vertical.join('|'), 'pipe-delimited vertical soiling array');
    assert(u.searchParams.get('losses') === String(g.SolarConfig.PVWATTS_PARAMS.losses), 'kit losses');
    assert(u.searchParams.get('gcr') === '0.01' && u.searchParams.get('use_wf_albedo') === '1', 'gcr and weather-file albedo');
    assert(u.searchParams.get('dc_ac_ratio') === '1', '1 kW on 1.2 kW inverter -> 1');
    assert(u.searchParams.get('timeframe') === 'monthly' && u.searchParams.get('dataset') === 'nsrdb', 'monthly NSRDB');
  });

  itAsync('falls back to folding soiling into losses when the array is rejected, then stops', async () => {
    const { g, calls } = withFetch((url, n) => n === 1
      ? { ok: false, status: 422, json: async () => ({ errors: ["'soiling' must be an array of 12 values between 0 and 100"] }) }
      : ok(FIXTURE));
    const r = await g.SolarAPI.calculateEstimate(INPUTS);
    assert(r.usedPVWatts && r.pvwattsVariant === 'soiling folded into losses', `expected the folded variant, got ${r.pvwattsVariant}`);
    assert(calls.length === 2, `two requests, got ${calls.length}`);
    const u = new URL(calls[1]);
    assert(!u.searchParams.has('soiling'), 'no soiling array on the retry');
    near(parseFloat(u.searchParams.get('losses')), parseFloat(g.SolarAPI.lossesWithSoilingFor(90)), 0.001, 'folded losses');
  });

  itAsync('does not retry on a server error and uses the offline table instead', async () => {
    const { g, calls } = withFetch(() => ({ ok: false, status: 503, json: async () => ({}) }));
    const r = await g.SolarAPI.calculateEstimate(INPUTS);
    assert(!r.usedPVWatts && r.pvwattsVariant === null, 'offline table path');
    assert(calls.length === 1, `should not hammer a failing API, got ${calls.length} requests`);
    between(r.annualKwh, 800, 1000, 'offline table yield for 1 kW vertical south');
  });

  itAsync('reports the PVWatts and offline yields within a few percent of each other', async () => {
    // The recorded response used the pre-audit parameters (losses 14, heavier
    // soiling), so it should sit below the regenerated table, not above it.
    const live = await withFetch(() => ok(FIXTURE)).g.SolarAPI.calculateEstimate(INPUTS);
    const offline = await withFetch(() => { throw new Error('offline'); }).g.SolarAPI.calculateEstimate(INPUTS);
    between(live.annualKwh / offline.annualKwh, 0.85, 1.0, 'old-parameter recording vs new table');
  });
});
