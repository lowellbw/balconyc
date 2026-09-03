#!/usr/bin/env node
// Regenerate js/pvwatts-nyc-table.js and docs/data/pvwatts-v8-nyc-grid-<date>.csv
// from live PVWatts V8 calls (32 tilt/azimuth cells at the NYC reference point).
//
// Run this whenever a PVWatts parameter in js/config.js changes:
//   node scripts/build-pvwatts-table.mjs
// It reads NREL_API_KEY, PVWATTS_URL and PVWATTS_PARAMS from js/config.js so the
// table is always built with the parameters the app sends. 32 requests.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfgSrc = fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8');
const SolarConfig = new Function(cfgSrc + '\nreturn SolarConfig;')();

const LAT = 40.7128, LON = -73.9960;           // NYC reference point (SunPosition.LAT/LON)
const TILTS = [35, 60, 70, 90];
const AZIMUTHS = [0, 45, 90, 135, 180, 225, 270, 315];
const P = SolarConfig.PVWATTS_PARAMS;

function soilingFor(tilt) {
  return (tilt >= 85 ? P.soiling_vertical : P.soiling_tilted).join('|');
}

async function cell(tilt, azimuth) {
  const q = new URLSearchParams({
    api_key: SolarConfig.NREL_API_KEY,
    system_capacity: '1', module_type: String(P.module_type), array_type: String(P.array_type),
    losses: String(P.losses), gcr: String(P.gcr), tilt: String(tilt), azimuth: String(azimuth),
    lat: String(LAT), lon: String(LON), dc_ac_ratio: '1.0', inv_eff: String(P.inv_eff),
    dataset: P.dataset, timeframe: 'monthly', use_wf_albedo: String(P.use_wf_albedo),
    albedo: String(P.albedo), bifaciality: String(P.bifaciality), soiling: soilingFor(tilt),
  });
  const res = await fetch(`${SolarConfig.PVWATTS_URL}?${q}`);
  const data = await res.json();
  if (!res.ok || (data.errors && data.errors.length)) {
    throw new Error(`PVWatts ${tilt}/${azimuth}: HTTP ${res.status} ${JSON.stringify(data.errors)}`);
  }
  return data;
}

const kwhPerKw = {}, monthlyShare = {}, rows = [];
let station = null, version = null;
for (const tilt of TILTS) {
  kwhPerKw[tilt] = {}; monthlyShare[tilt] = {};
  for (const az of AZIMUTHS) {
    const d = await cell(tilt, az);
    station = station || d.station_info; version = version || d.version;
    const annual = d.outputs.ac_annual;
    const share = d.outputs.ac_monthly.map(v => +(v / annual).toFixed(5));
    kwhPerKw[tilt][az] = +annual.toFixed(1);
    monthlyShare[tilt][az] = share;
    rows.push([tilt, az, ...d.outputs.ac_monthly.map(v => v.toFixed(2)), annual.toFixed(2),
      d.outputs.solrad_annual.toFixed(3), d.outputs.capacity_factor.toFixed(2)].join(','));
    process.stderr.write(`tilt ${tilt} az ${az}: ${annual.toFixed(1)} kWh/kW\n`);
  }
}

const date = new Date().toISOString().slice(0, 10);
const csv = ['tilt,azimuth,Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec,ac_annual,solrad_annual_kWh_m2_day,capacity_factor', ...rows].join('\n') + '\n';
fs.writeFileSync(path.join(ROOT, `docs/data/pvwatts-v8-nyc-grid-${date}.csv`), csv);

const table = {
  generated: date, version, lat: LAT, lon: LON,
  station: { lat: station.lat, lon: station.lon, elev: station.elev, distanceM: station.distance, weather: station.weather_data_source },
  params: { ...P, dc_ac_ratio: 1.0, system_capacity: 1 },
  tilts: TILTS, azimuths: AZIMUTHS, kwhPerKw, monthlyShare,
};
const js = `// ============================================================
// balco.nyc: PVWatts V8 reference table for NYC (GENERATED)
// ============================================================
// Annual AC yield (kWh per kW DC) and monthly production shares for every
// tilt/azimuth the calculator offers, computed by NREL/NLR PVWatts V8 at the
// NYC reference point with exactly the parameters in js/config.js
// PVWATTS_PARAMS (dc_ac_ratio 1.0, 1 kW). Used by the client-side fallback
// when the live API is unreachable, and as the seasonal shape of production.
//
// Generated ${date} by scripts/build-pvwatts-table.mjs. Do not edit by hand;
// re-run the script whenever a PVWatts parameter changes.
// ============================================================

const PVWattsTableNYC = ${JSON.stringify(table, null, 2)};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PVWattsTableNYC };
}
`;
fs.writeFileSync(path.join(ROOT, 'js/pvwatts-nyc-table.js'), js);
console.log(`wrote js/pvwatts-nyc-table.js and docs/data/pvwatts-v8-nyc-grid-${date}.csv (${rows.length} cells, PVWatts ${version})`);
