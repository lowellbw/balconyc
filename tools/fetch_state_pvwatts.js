#!/usr/bin/env node
// Run PVWatts once per state, with exactly the calculator's parameters.
//
//   NREL_API_KEY=... \
//     node tools/fetch_state_pvwatts.js            # fetch what is missing
//   node tools/fetch_state_pvwatts.js --refresh     # fetch everything again
//
// For the largest city in each state (data/state-reference-cities.json) it
// asks PVWatts for an 800 W system on a vertical railing facing each of the
// eight compass points, and facing south at 35, 60 and 70 degrees. The calls
// go through the calculator's own SolarAPI.fetchPVWatts via the test harness,
// so the state pages quote the same model a visitor gets, parameter for
// parameter. params_hash records those parameters; tests fail if the
// calculator's change and this file was not refreshed.
//
// Output: data/state-pvwatts.json. Results are cached in the file, so an
// interrupted run resumes. Calls are spaced out to stay far inside the
// key's hourly limit.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadModules } = require('../tests/harness');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data/state-pvwatts.json');
const CITIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/state-reference-cities.json'), 'utf8'));
const RUNS = [
  ...[0, 45, 90, 135, 180, 225, 270, 315].map(azimuth => ({ tilt: 90, azimuth })),
  { tilt: 35, azimuth: 180 }, { tilt: 60, azimuth: 180 }, { tilt: 70, azimuth: 180 },
];
const SPACING_MS = 1500;

function paramsHash(g) {
  // Everything the calculator sends except the key and the location.
  g.SolarState.lat = 0; g.SolarState.lon = 0;
  const p = g.SolarAPI._pvwattsBaseParams({ systemCapacity: 0.8, tilt: 90, azimuth: 180 });
  delete p.api_key; delete p.lat; delete p.lon; delete p.tilt; delete p.azimuth;
  const stable = JSON.stringify(Object.keys(p).sort().map(k => [k, p[k]]).concat([['soiling', g.SolarAPI.SOILING_MONTHLY]]));
  return crypto.createHash('sha256').update(stable).digest('hex').slice(0, 12);
}

async function main() {
  const refresh = process.argv.includes('--refresh');
  const g = loadModules({ fetch: (url, opts) => fetch(url, opts) });
  if (process.env.NREL_API_KEY) g.SolarConfig.NREL_API_KEY = process.env.NREL_API_KEY;
  if (process.env.PVWATTS_URL) g.SolarConfig.PVWATTS_URL = process.env.PVWATTS_URL;
  const hash = paramsHash(g);

  const prior = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
  const out = prior && prior.params_hash === hash && !refresh ? prior : {
    source: 'NREL PVWatts V8, called through js/solar-api.js with the calculator’s parameters',
    system_watts: 800, params_hash: hash, states: {},
  };
  out.retrieved = new Date().toISOString().slice(0, 10);

  let calls = 0;
  for (const [code, city] of Object.entries(CITIES.states)) {
    const entry = out.states[code] || { city: city.city, lat: city.lat, lon: city.lon, runs: {} };
    for (const run of RUNS) {
      const key = `${run.tilt}_${run.azimuth}`;
      if (entry.runs[key]) continue;
      g.SolarState.lat = city.lat; g.SolarState.lon = city.lon;
      g.SolarAPI._pvwattsCache.clear();
      const data = await g.SolarAPI.fetchPVWatts({ systemCapacity: 0.8, tilt: run.tilt, azimuth: run.azimuth });
      calls++;
      if (!data || !data.outputs) {
        console.warn(`  ${code} ${key}: no answer; will retry on the next run`);
      } else {
        entry.runs[key] = {
          ac_annual: Math.round(data.outputs.ac_annual * 10) / 10,
          ac_monthly: data.outputs.ac_monthly.map(v => Math.round(v * 10) / 10),
        };
        if (data.station_info) {
          entry.station = { distance_m: data.station_info.distance, lat: data.station_info.lat, lon: data.station_info.lon };
        }
      }
      out.states[code] = entry;
      fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
      await new Promise(r => setTimeout(r, SPACING_MS));
    }
    process.stdout.write(`${code} `);
  }
  console.log(`\n${calls} PVWatts calls; data/state-pvwatts.json`);
}

main().catch(err => { console.error(err); process.exit(1); });
