#!/usr/bin/env node
// Build js/self-consumption-table.js from the hourly self-consumption
// simulation grid in docs/data/self-consumption-sim-*.csv (see
// docs/methodology-audit-2026-09.md section 4.4 for the method).
//
// For each orientation class, occupancy variant and battery size the script
// emits the (production/consumption ratio, fraction) points sorted by ratio and
// made monotone, which js/self-consumption.js interpolates at run time.
//   node scripts/build-self-consumption-table.mjs [csv]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const csvPath = process.argv[2] || fs.readdirSync(path.join(ROOT, 'docs/data'))
  .filter(f => f.startsWith('self-consumption-sim-')).sort().map(f => path.join(ROOT, 'docs/data', f)).pop();
const lines = fs.readFileSync(csvPath, 'utf8').trim().split('\n');
const hdr = lines[0].split(',');
const col = n => hdr.indexOf(n);
const rows = lines.slice(1).map(l => l.split(','));

const groups = {};
for (const r of rows) {
  const key = `${r[col('orientation')]}|${r[col('occupancy')]}|${r[col('battery_kwh')]}`;
  (groups[key] = groups[key] || []).push({
    r: +r[col('pv_over_cons')],
    scf: +r[col('self_consumption_fraction')],
    esf: +r[col('effective_savings_fraction')],
  });
}

// Sort by ratio and enforce a non-increasing fraction (pool adjacent violators).
function monotone(points, field) {
  const pts = points.slice().sort((a, b) => a.r - b.r).map(p => ({ r: p.r, v: p[field], w: 1 }));
  const out = [];
  for (const p of pts) {
    out.push({ ...p });
    while (out.length > 1 && out[out.length - 2].v < out[out.length - 1].v) {
      const b = out.pop(), a = out.pop();
      const w = a.w + b.w;
      out.push({ r: (a.r * a.w + b.r * b.w) / w, v: (a.v * a.w + b.v * b.w) / w, w });
    }
  }
  // Merge points that land on the same ratio (400 W at 1,700 kWh and 800 W at
  // 3,400 kWh are the same case), so the run-time interpolation sees a
  // strictly increasing ratio axis.
  const merged = [];
  for (const p of out) {
    const q = merged[merged.length - 1];
    if (q && Math.abs(q.r - p.r) < 5e-4) { const w = q.w + p.w; q.v = (q.v * q.w + p.v * p.w) / w; q.w = w; }
    else merged.push({ ...p });
  }
  return merged.map(p => [+p.r.toFixed(4), +p.v.toFixed(4)]);
}

const table = { generated: new Date().toISOString().slice(0, 10), source: path.basename(csvPath), scf: {}, esfBattery: {} };
for (const key of Object.keys(groups)) {
  const [orient, occ, bat] = key.split('|');
  if (bat === '0') {
    table.scf[orient] = table.scf[orient] || {};
    table.scf[orient][occ] = monotone(groups[key], 'scf');
  } else if (occ === 'base') {
    table.esfBattery[orient] = table.esfBattery[orient] || {};
    table.esfBattery[orient][bat] = monotone(groups[key], 'esf');
  }
}

const js = `// ============================================================
// balco.nyc: self-consumption lookup table (GENERATED)
// ============================================================
// Share of a balcony system's annual production that is used on site, as a
// function of the ratio r = annual production / annual consumption, from an
// hourly simulation of the DOE residential load profile for New York Central
// Park (apartment archetype) against PVWatts hourly output. Keys: orientation
// class (t90_s vertical south-ish, t35_s and t60_s tilted south-ish, t90_sw,
// t90_e, t90_w) and occupancy (base; wfh = someone home on weekdays;
// away = nobody home on weekdays). esfBattery: effective savings fraction
// with a 1 or 2 kWh battery (base occupancy). Points are [r, fraction],
// sorted by r, monotone. Generated ${table.generated} by
// scripts/build-self-consumption-table.mjs from ${table.source}.
// ============================================================

const SelfConsumptionTable = ${JSON.stringify(table)};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SelfConsumptionTable };
}
`;
fs.writeFileSync(path.join(ROOT, 'js/self-consumption-table.js'), js);
console.log(`wrote js/self-consumption-table.js from ${path.basename(csvPath)}: ${Object.keys(table.scf).length} orientations`);
