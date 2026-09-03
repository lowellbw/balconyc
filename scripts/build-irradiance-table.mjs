#!/usr/bin/env node
// Build js/irradiance-nyc.js: month x hour mean direct-normal (DNI), diffuse
// horizontal (DHI) irradiance and albedo for the NYC NSRDB typical year, from a
// PVWatts V8 hourly response (outputs.dn, outputs.df, outputs.alb; local
// standard time, hour-beginning). Irradiance does not depend on system
// parameters, so any hourly PVWatts call for the NYC point will do.
//
//   node scripts/build-irradiance-table.mjs [path/to/hourly.json]
// Without a path it fetches one hourly response from the live API (1 request).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfgSrc = fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8');
const SolarConfig = new Function(cfgSrc + '\nreturn SolarConfig;')();

let data;
if (process.argv[2]) {
  data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
} else {
  const q = new URLSearchParams({
    api_key: SolarConfig.NREL_API_KEY, system_capacity: '1', module_type: '1', array_type: '0',
    losses: '9', tilt: '90', azimuth: '180', lat: '40.7128', lon: '-73.9960', dataset: 'nsrdb', timeframe: 'hourly',
  });
  const res = await fetch(`${SolarConfig.PVWATTS_URL}?${q}`);
  data = await res.json();
  if (!res.ok || (data.errors && data.errors.length)) throw new Error(JSON.stringify(data.errors));
}
const { dn, df, alb } = data.outputs;
if (dn.length !== 8760) throw new Error('expected 8760 hourly values');
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const dni = [], dhi = [], albedo = [];
let h = 0;
for (let m = 0; m < 12; m++) {
  const sDn = new Array(24).fill(0), sDf = new Array(24).fill(0); let sAlb = 0, nAlb = 0;
  for (let d = 0; d < DAYS[m]; d++) {
    for (let hr = 0; hr < 24; hr++, h++) {
      sDn[hr] += dn[h]; sDf[hr] += df[h];
      if (alb && Number.isFinite(alb[h]) && alb[h] > 0) { sAlb += alb[h]; nAlb++; }
    }
  }
  dni.push(sDn.map(v => +(v / DAYS[m]).toFixed(1)));
  dhi.push(sDf.map(v => +(v / DAYS[m]).toFixed(1)));
  albedo.push(nAlb ? +(sAlb / nAlb).toFixed(3) : 0.15);
}
const annualGhi = dn.reduce((s, v, i) => s + v * 0 + df[i], 0); // placeholder to keep linter quiet
const out = {
  generated: new Date().toISOString().slice(0, 10),
  source: `${data.station_info.weather_data_source}, station ${data.station_info.lat}, ${data.station_info.lon}; PVWatts ${data.version} hourly output (dn, df, alb)`,
  timeBasis: 'local standard time (UTC-5), hour-beginning; index [month][hour]',
  units: 'W/m2 mean over the days of the month; albedo dimensionless',
  dni, dhi, albedo,
};
void annualGhi;
const js = `// ============================================================
// balco.nyc: NYC typical-year irradiance table (GENERATED)
// ============================================================
// Month x hour means of direct-normal and diffuse-horizontal irradiance and
// of ground albedo, from the NSRDB typical meteorological year that PVWatts
// uses for NYC. The shade model weights its sun sweep with these instead of a
// clear-sky proxy, so a blocked hour costs what that hour is actually worth
// in the NYC climate. Generated ${out.generated} by
// scripts/build-irradiance-table.mjs. Do not edit by hand.
// ============================================================

const IrradianceNYC = ${JSON.stringify(out)};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { IrradianceNYC };
}
`;
fs.writeFileSync(path.join(ROOT, 'js/irradiance-nyc.js'), js);
const ghiAnnual = dn.reduce((s, v, i) => s + df[i], 0) / 1000;
console.log(`wrote js/irradiance-nyc.js (annual DHI ${ghiAnnual.toFixed(0)} kWh/m2, mean albedo ${(albedo.reduce((a, b) => a + b, 0) / 12).toFixed(3)})`);
