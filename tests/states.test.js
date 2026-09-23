// State pages: fifty-one pages built from data, held to three promises.
//
// 1. Their numbers are the calculator's numbers. A state page that says
//    "about 690 kWh and $120 a year" must be what the calculator itself would
//    say for an unshaded south-facing railing in that city, or the two
//    surfaces contradict each other in front of the same reader.
// 2. A page is only indexable when it carries prose found nowhere else on
//    the site. Otherwise it ships with noindex and stays out of the sitemap.
// 3. Indexable pages are not near-duplicates of each other.

const fs = require('fs');
const path = require('path');
const { loadModules, describe, it, assert } = require('./harness');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const exists = f => fs.existsSync(path.join(ROOT, f));

if (exists('data/state-pages.json')) {
  const pages = JSON.parse(read('data/state-pages.json'));
  const pvw = JSON.parse(read('data/state-pvwatts.json'));
  const energy = JSON.parse(read('data/state-energy.json'));
  const grid = JSON.parse(read('data/grid-emissions.json'));
  const status = JSON.parse(read('data/state-status.json'));
  const cities = JSON.parse(read('data/state-reference-cities.json'));
  const sitemap = read('sitemap.xml');
  // Quoted-field CSV: a field may contain commas inside double quotes.
  const parseLine = l => [...l.matchAll(/("(?:[^"]|"")*"|[^,]*)(,|$)/g)]
    .slice(0, -1).map(m => m[1].startsWith('"') ? m[1].slice(1, -1).replace(/""/g, '"') : m[1]);
  const csv = read('data/states.csv').trim().split('\n').map(parseLine);
  const header = csv[0];
  const col = name => header.indexOf(name);
  const byCode = Object.fromEntries(csv.slice(1).map(r => [r[col('code')], r]));

  describe('State pages agree with the calculator', () => {
    it('publishes a page and a CSV row for all 50 states and DC', () => {
      assert(pages.length === 51, `expected 51 state pages, found ${pages.length}`);
      assert(Object.keys(byCode).length === 51, 'states.csv should have 51 rows');
      for (const p of pages) assert(exists(p.file), `${p.file} is missing`);
    });

    it('matches calculateEstimate for an unshaded south railing in every state', async () => {
      for (const [code, row] of Object.entries(byCode)) {
        const runs = pvw.states[code].runs;
        const g = loadModules({ fetch: async () => ({ ok: true, status: 200,
          json: async () => ({ outputs: { ac_annual: runs['90_180'].ac_annual, ac_monthly: runs['90_180'].ac_monthly } }) }) });
        const city = cities.states[code];
        g.SolarState.lat = city.lat; g.SolarState.lon = city.lon;
        const region = g.Regions.usProfile(code, city.zip, { energy, grid, status });
        g.SunPosition.setLocation({ lat: city.lat, lon: city.lon });
        g.ShadowModel.initSynthetic({ azimuthDeg: 180, balconyHeightM: 10,
          horizonProfile: g.ShadowModel.synthesizeStreetCanyon({ facadeAzimuthDeg: 180, balconyHeightM: 10, obstructionHeightM: 0, distanceM: 20 }) });
        const shade = g.ShadowModel.computeAnnualShadeProfile(90);
        const r = await g.SolarAPI.calculateEstimate({
          azimuth: 180, tilt: 90, systemWatts: 800, floor: 4, totalFloors: null, shading: 'open',
          monthlyBill: 100, costTier: 'mid', escalationPreset: 'mid', shadeProfile: shade, region,
        });
        const kwh = Number(row[col('kwh_yr_south_vertical')]);
        const savings = Number(row[col('savings_yr_south')]);
        const payback = Number(row[col('payback_yrs_mid_kit_south')]);
        assert(Math.abs(r.annualKwh - kwh) <= 2, `${code}: page says ${kwh} kWh, calculator ${r.annualKwh.toFixed(1)}`);
        assert(Math.abs(r.annualSavings - savings) <= 2, `${code}: page says $${savings}, calculator $${r.annualSavings.toFixed(0)}`);
        if (payback) {
          assert(Math.abs(r.escalatedPayback - payback) <= 0.15,
            `${code}: page says ${payback} yrs payback, calculator ${r.escalatedPayback.toFixed(2)}`);
        }
      }
    });

    it('was computed with the parameters the calculator sends to PVWatts today', () => {
      // tools/fetch_state_pvwatts.js stamps a hash of the PVWatts parameters.
      // If the calculator's parameters change, the state pages are stale.
      const crypto = require('crypto');
      const g = loadModules();
      g.SolarState.lat = 0; g.SolarState.lon = 0;
      const p = g.SolarAPI._pvwattsBaseParams({ systemCapacity: 0.8, tilt: 90, azimuth: 180 });
      for (const k of ['api_key', 'lat', 'lon', 'tilt', 'azimuth']) delete p[k];
      const stable = JSON.stringify(Object.keys(p).sort().map(k => [k, p[k]]).concat([['soiling', g.SolarAPI.SOILING_MONTHLY]]));
      const hash = crypto.createHash('sha256').update(stable).digest('hex').slice(0, 12);
      assert(pvw.params_hash === hash, `data/state-pvwatts.json was fetched with parameters ${pvw.params_hash}, calculator now uses ${hash}; re-run tools/fetch_state_pvwatts.js --refresh`);
    });
  });

  describe('State pages earn their place in the index', () => {
    const text = f => read(f)
      .replace(/<!--shared:start-->[\s\S]*?<!--shared:end-->/g, ' ')
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<footer[\s\S]*?<\/footer>|<nav[\s\S]*?<\/nav>/g, ' ')
      .replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ')
      .toLowerCase().replace(/\d[\d,.]*/g, '#').replace(/\s+/g, ' ');
    const shingles = t => {
      const w = t.split(' ');
      const s = new Set();
      for (let i = 0; i + 5 <= w.length; i++) s.add(w.slice(i, i + 5).join(' '));
      return s;
    };
    const jaccard = (a, b) => {
      let inter = 0;
      for (const x of a) if (b.has(x)) inter++;
      return inter / (a.size + b.size - inter);
    };

    it('indexes only pages with at least 150 words of their own prose', () => {
      for (const p of pages) {
        const html = read(p.file);
        const noindex = /<meta name="robots" content="noindex/.test(html);
        if (p.indexable) {
          assert(p.unique_words >= 150, `${p.url_path} is indexable with ${p.unique_words} words of its own`);
          assert(!noindex, `${p.url_path} is marked indexable but carries noindex`);
          assert(sitemap.includes(`<loc>https://balco.nyc${p.url_path}</loc>`), `${p.url_path} is missing from the sitemap`);
        } else {
          assert(noindex, `${p.url_path} has too little of its own prose and must carry noindex`);
          assert(!sitemap.includes(`<loc>https://balco.nyc${p.url_path}</loc>`), `${p.url_path} is noindex but in the sitemap`);
        }
      }
    });

    it('keeps indexable state pages from being near-duplicates of each other', () => {
      const idx = pages.filter(p => p.indexable).map(p => ({ p, s: shingles(text(p.file)) }));
      let worst = { v: 0 };
      for (let i = 0; i < idx.length; i++) {
        for (let j = i + 1; j < idx.length; j++) {
          const v = jaccard(idx[i].s, idx[j].s);
          if (v > worst.v) worst = { v, a: idx[i].p.url_path, b: idx[j].p.url_path };
        }
      }
      assert(worst.v <= 0.6, `${worst.a} and ${worst.b} share ${(worst.v * 100).toFixed(0)}% of their five-word phrases`);
    });
  });
}
