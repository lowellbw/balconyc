// Data-file tests: the numbers the calculator shows outside New York City.
//
// Three files in data/ are published with the site and read by the browser:
// the state electricity prices, the grid emission rates, and the plug-in
// solar law of every state. They are built by tools/refresh_region_data.py
// and by hand-checked research, and every figure in them reaches a visitor.
// These tests hold their shape, their freshness, and the few facts that must
// agree with the rest of the site.

const fs = require('fs');
const path = require('path');
const { loadModules, describe, it, assert, between } = require('./harness');

const ROOT = path.join(__dirname, '..');
const readJson = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const energy = readJson('data/state-energy.json');
const grid = readJson('data/grid-emissions.json');
const status = readJson('data/state-status.json');
const { SolarConfig, Regions } = loadModules();

const CODES = Object.keys(Regions.STATE_NAMES).sort();
const DAY = 24 * 60 * 60 * 1000;
const ageDays = d => Math.floor((Date.now() - Date.parse(d)) / DAY);

describe('State electricity prices (data/state-energy.json)', () => {
  it('covers the 50 states and DC, and nothing else', () => {
    assert(JSON.stringify(Object.keys(energy.states).sort()) === JSON.stringify(CODES),
      'state-energy.json should have exactly the 50 states and DC');
  });

  it('holds plausible prices and household use for every state', () => {
    for (const [code, s] of Object.entries(energy.states)) {
      between(s.cents, 5, 70, `${code} price (cents/kWh)`);
      between(s.avg_monthly_kwh, 200, 2000, `${code} average monthly use (kWh)`);
    }
    between(energy.us_cents, 10, 30, 'US average price');
  });

  it('says which twelve months the prices cover', () => {
    assert(/^\d{4}-\d{2}$/.test(energy.period_start) && /^\d{4}-\d{2}$/.test(energy.period_end),
      'period_start and period_end should be YYYY-MM');
    assert(/^12 months to [A-Z][a-z]+ \d{4}$/.test(energy.period_label), `period label: ${energy.period_label}`);
    assert(/^https:\/\/www\.eia\.gov\//.test(energy.source_url), 'prices should cite the EIA');
  });

  it('has been refreshed recently enough to quote', () => {
    // EIA publishes monthly. A price window ending more than eight months ago
    // means tools/refresh_region_data.py has not been run for a while.
    const end = Date.parse(energy.period_end + '-01');
    const months = (Date.now() - end) / (30.4 * DAY);
    assert(months <= 8, `prices end ${energy.period_end}; run tools/refresh_region_data.py`);
  });
});

describe('Grid emissions (data/grid-emissions.json)', () => {
  it('agrees with the NYC factor the calculator uses', () => {
    const nycw = grid.subregions.NYCW;
    assert(nycw, 'NYCW subregion missing');
    assert(Math.abs(nycw.co2_lb_per_mwh / 1000 - SolarConfig.CO2_FACTOR) < 0.001,
      `NYCW is ${nycw.co2_lb_per_mwh} lb/MWh but SolarConfig.CO2_FACTOR is ${SolarConfig.CO2_FACTOR}`);
  });

  it('maps every ZIP prefix to a subregion that exists', () => {
    for (const [z, sub] of Object.entries(grid.zip3)) {
      assert(/^\d{3}$/.test(z) && grid.subregions[sub], `ZIP3 ${z} -> ${sub}`);
    }
    for (const [z, sub] of Object.entries(grid.zip5 || {})) {
      assert(/^\d{5}$/.test(z) && grid.subregions[sub], `ZIP5 ${z} -> ${sub}`);
    }
    assert(Object.keys(grid.zip3).length > 850, 'expected ~900 ZIP3 prefixes');
  });

  it('routes the ZIPs that are easy to get wrong', () => {
    const at = zip => (grid.zip5 && grid.zip5[zip]) || grid.zip3[zip.slice(0, 3)];
    assert(at('10001') === 'NYCW', 'Manhattan');
    assert(at('11201') === 'NYCW', 'Brooklyn');
    assert(at('11501') === 'NYLI', 'Nassau County is Long Island');
    assert(at('96813') === 'HIOA', 'Honolulu is Oahu, not the neighbour islands');
    assert(at('96720') === 'HIMS', 'Hilo is the neighbour islands');
    assert(at('60614') === 'RFCW', 'Chicago');
    assert(at('94110') === 'CAMX', 'San Francisco');
  });

  it('holds plausible emission rates', () => {
    for (const [code, s] of Object.entries(grid.subregions)) {
      between(s.co2_lb_per_mwh, 100, 2000, `${code} CO2 lb/MWh`);
    }
  });
});

describe('Plug-in solar law by state (data/state-status.json)', () => {
  const ENUM = status.status_enum;
  const today = new Date().toISOString().slice(0, 10);

  it('covers the 50 states and DC with a known status', () => {
    assert(JSON.stringify(Object.keys(status.states).sort()) === JSON.stringify(CODES),
      'state-status.json should have exactly the 50 states and DC');
    for (const [code, s] of Object.entries(status.states)) {
      assert(ENUM.includes(s.status), `${code} has status ${s.status}`);
    }
  });

  it('never reports a state without saying where it came from and when', () => {
    for (const [code, s] of Object.entries(status.states)) {
      if (s.status === 'unknown') continue;
      assert(s.sources && s.sources.length > 0, `${code} is "${s.status}" with no source`);
      assert(s.sources.every(x => /^https:\/\//.test(x.url)), `${code} has a non-https source`);
      assert(/^\d{4}-\d{2}-\d{2}$/.test(s.reviewed || ''), `${code} has no review date`);
      assert(s.summary && s.summary.length <= 200, `${code} summary missing or over 200 characters`);
    }
  });

  it('backs every enacted or passed law with a primary source', () => {
    for (const [code, s] of Object.entries(status.states)) {
      if (!['in_force', 'enacted_not_yet_effective', 'passed_awaiting_signature'].includes(s.status)) continue;
      assert(s.sources.some(x => x.primary), `${code} (${s.status}) needs a legislature or government source`);
      assert(s.bills && s.bills.length > 0, `${code} (${s.status}) names no bill`);
    }
  });

  it('keeps effective dates consistent with the status', () => {
    for (const [code, s] of Object.entries(status.states)) {
      if (s.status === 'in_force') {
        assert(s.effective_date && s.effective_date <= today,
          `${code} is in force but takes effect ${s.effective_date}; it should be enacted_not_yet_effective`);
      }
      if (s.status === 'enacted_not_yet_effective') {
        assert(s.effective_date && s.effective_date > today,
          `${code} took effect ${s.effective_date}; move it to in_force`);
      }
    }
  });

  it('has been re-checked recently, faster where a bill is moving', () => {
    // A calendar, not a bug. Bills awaiting signature or still pending can
    // change any week; settled law changes rarely.
    for (const [code, s] of Object.entries(status.states)) {
      if (s.status === 'unknown') continue;
      const moving = ['passed_awaiting_signature', 'pending', 'enacted_not_yet_effective'].includes(s.status);
      const limit = moving ? 45 : 120;
      assert(ageDays(s.reviewed) <= limit,
        `${code} was checked ${ageDays(s.reviewed)} days ago (limit ${limit}); re-check it and update "reviewed"`);
    }
  });

  it('names every state with a signed law wherever the guides list them', () => {
    // The guides list the states with plug-in solar laws in prose. When a
    // governor signs one, this fails until the prose catches up.
    const signed = Object.values(status.states)
      .filter(s => s.status === 'in_force' || s.status === 'enacted_not_yet_effective').map(s => s.name);
    for (const slug of ['sunny-act', 'what-is-balcony-solar']) {
      const text = fs.readFileSync(path.join(ROOT, `content/${slug}.json`), 'utf8');
      for (const name of signed) {
        assert(text.includes(name), `content/${slug}.json does not mention ${name}, which has signed a law`);
      }
    }
  });

  it('agrees with what the site says about New York', () => {
    const ny = status.states.NY;
    const sunny = fs.readFileSync(path.join(ROOT, 'content/sunny-act.json'), 'utf8');
    if (/await(?:s|ing) the Governor/i.test(sunny)) {
      assert(ny.status === 'passed_awaiting_signature',
        `the SUNNY Act page says it awaits signature but state-status.json says ${ny.status}`);
    }
  });
});
