// Site-wide tests: every generated page, not just the homepage.
//
// As the site grows past a handful of pages, the failure modes change: a
// guide nobody links to, a link to a page that was renamed, a figure that is
// right on the page it was written for and stale on the ten that repeat it.
// These tests walk every built page.

const fs = require('fs');
const path = require('path');
const { loadModules, describe, it, assert } = require('./harness');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const readJson = f => JSON.parse(read(f));
const { SolarConfig } = loadModules();

const site = readJson('content/_config/site.json');
const facts = readJson('content/_config/facts.json');
const specs = fs.readdirSync(path.join(ROOT, 'content')).filter(f => f.endsWith('.json'))
  .map(f => readJson(path.join('content', f)));
const statePages = fs.existsSync(path.join(ROOT, 'data/state-pages.json')) ? readJson('data/state-pages.json') : [];
const HUBS = ['guides', 'states', 'nyc', 'about'].filter(h => fs.existsSync(path.join(ROOT, `${h}.html`)));

// URL path -> file on disk, as Vercel's cleanUrls serves them.
const fileFor = url => {
  const p = url.split('#')[0].split('?')[0].replace(/\/$/, '');
  if (p === '') return 'index.html';
  const rel = p.replace(/^\//, '');
  if (fs.existsSync(path.join(ROOT, rel + '.html'))) return rel + '.html';
  if (fs.existsSync(path.join(ROOT, rel)) && fs.statSync(path.join(ROOT, rel)).isFile()) return rel;
  return null;
};

const generated = [
  ...specs.map(s => ({ url: `/${s.slug}`, file: `${s.slug}.html`, indexable: !s.noindex })),
  ...HUBS.map(h => ({ url: `/${h}`, file: `${h}.html`, indexable: true })),
  ...statePages.map(p => ({ url: p.url_path, file: p.file, indexable: p.indexable !== false })),
];
const allPages = [{ url: '/', file: 'index.html', indexable: true },
  { url: '/methodology', file: 'methodology.html', indexable: true }, ...generated];
const links = file => [...read(file).matchAll(/href="(\/[^"]*)"/g)].map(m => m[1]);

describe('Every page can be found', () => {
  it('links only to pages and files that exist', () => {
    for (const page of allPages) {
      for (const href of links(page.file)) {
        if (href === '/') continue;
        assert(fileFor(href), `${page.file} links to ${href}, which does not exist`);
      }
    }
  });

  it('puts every indexable page within two clicks of the homepage', () => {
    const depth = { 'index.html': 0 };
    let frontier = ['index.html'];
    for (let d = 1; d <= 2; d++) {
      const next = [];
      for (const f of frontier) {
        for (const href of links(f)) {
          const target = fileFor(href);
          if (target && target.endsWith('.html') && depth[target] === undefined) {
            depth[target] = d;
            next.push(target);
          }
        }
      }
      frontier = next;
    }
    for (const page of allPages.filter(p => p.indexable)) {
      assert(depth[page.file] !== undefined, `${page.url} is more than two clicks from the homepage`);
    }
  });

  it('links to every indexable page from at least two other pages', () => {
    const inbound = {};
    for (const page of allPages) {
      for (const target of new Set(links(page.file).map(fileFor).filter(Boolean))) {
        if (target !== page.file) inbound[target] = (inbound[target] || 0) + 1;
      }
    }
    for (const page of generated.filter(p => p.indexable)) {
      assert((inbound[page.file] || 0) >= 2, `${page.url} has ${inbound[page.file] || 0} inbound links; an orphan is found late`);
    }
  });

  it('keeps the homepage linking to every hub', () => {
    const home = read('index.html');
    for (const h of HUBS.filter(h => h !== 'about')) {
      assert(home.includes(`href="/${h}"`), `index.html should link to /${h}`);
    }
  });
});

describe('Every page says who it is from', () => {
  it('carries the one-line description of balco.nyc on every generated page', () => {
    // Search engines and language models learn what an entity is from the
    // sentence that recurs next to its name. It is the same sentence everywhere.
    const line = site.entity_line.replace(/'/g, '&#x27;');
    for (const page of generated) {
      assert(read(page.file).includes(line), `${page.file} does not carry the entity line`);
    }
  });

  it('writes the name as balco.nyc, never "Balco"', () => {
    for (const page of generated) {
      const text = read(page.file).replace(/<[^>]+>/g, ' ');
      assert(!/\bBalco\b(?!\.nyc)/.test(text) && !/\bBalco\.nyc\b/.test(text),
        `${page.file} spells the name differently from balco.nyc`);
    }
  });
});

describe('Repeated figures agree everywhere', () => {
  it('keeps facts.json equal to the calculator configuration', () => {
    assert(facts.coned.rate_cents === Math.round(SolarConfig.ELECTRICITY_RATE * 100), 'Con Ed rate');
    assert(facts.coned.customer_charge === SolarConfig.MONTHLY_CUSTOMER_CHARGE, 'customer charge');
    assert(Math.abs(facts.co2.nycw_lb_per_kwh - SolarConfig.CO2_FACTOR) < 1e-9, 'NYC grid factor');
    for (const tier of ['budget', 'mid', 'premium']) {
      assert(facts.kits[tier] === SolarConfig.SYSTEM_COST_BY_TIER[tier], `kit tier ${tier}`);
    }
    for (const [tilt, f] of Object.entries(facts.model.railing_factor)) {
      assert(SolarConfig.RAILING_OBSTRUCTION_BY_TILT[tilt] === f, `railing factor at ${tilt} degrees`);
    }
    assert(facts.model.degradation_mid === SolarConfig.PANEL_DEGRADATION_BY_TIER.mid, 'mid-tier degradation');
    assert(facts.model.escalation_mid === SolarConfig.RATE_ESCALATION_PRESETS.mid, 'mid rate escalation');
  });

  it('leaves no unfilled {{token}} on any page', () => {
    for (const page of allPages) {
      assert(!/\{\{\s*[a-z0-9_.]+\s*\}\}/.test(read(page.file)), `${page.file} has an unfilled {{token}}`);
    }
  });

  it('never carries a retired figure or an unsafe claim', () => {
    const banned = [
      [/\$0\.22\b/, 'the retired $0.22/kWh rate'],
      [/\b31\s*(&cent;|¢|cents)/i, 'the retired 31c rate'],
      [/0\.89 lbs? CO/, 'the eGRID2022 grid factor'],
      [/±12[–-]18%|12 to 18%/, 'the old accuracy band'],
      [/\$1,200 (to|and) \$1,800/, 'the pre-July-2026 price range'],
      [/awaiting Assembly action/i, 'the pre-May-2026 SUNNY status'],
      [/plugs? into any outlet|no electrician required/i, 'unsafe installation advice'],
      [/qualif\w+ for (the )?(30% )?federal (solar )?(tax )?credit/i, 'the expired federal credit'],
      [/UL 3700[- ]certified (kit|system)/i, 'a certified complete system (none exists)'],
      [/best balcony solar kits?/i, 'product rankings (not a vendor, not a reviewer)'],
      [/[?&](ref|tag|aff)=|amzn\.to/i, 'affiliate links'],
      [/legal in all 50 states/i, 'a false national legality claim'],
      [/400\s*(to|&ndash;|–|-)\s*900\s*(&nbsp;|\s)*kWh|\$136 to (roughly )?\$306/i, 'the retired 400-900 kWh NYC band (the model tops out near 604 kWh on a railing)'],
    ];
    for (const page of [...allPages, { file: 'llms.txt' }]) {
      const text = read(page.file);
      for (const [re, what] of banned) {
        assert(!re.test(text), `${page.file} carries ${what}`);
      }
    }
  });

  it('states the current SUNNY Act status wherever the Act is named', () => {
    for (const page of generated) {
      const text = read(page.file).replace(/&rsquo;|&#x27;/g, "'");
      if (/SUNNY Act/.test(text)) {
        assert(/Governor/.test(text), `${page.file} names the SUNNY Act without its signature status`);
      }
    }
  });
});

describe('Every guide shows its sources', () => {
  const PRIMARY = /\.gov$|\.gov\.|nlr\.gov|nrel\.gov|legislature|legis|coned\.com|\.ul\.com$|ulse\.org|bundesnetzagentur\.de|nyserda|sandia/;

  it('cites at least five sources, one of them primary, on every article', () => {
    for (const spec of specs.filter(s => (s.kind || 'article') === 'article')) {
      const hosts = spec.sources.map(s => s.url.split('/')[2]);
      assert(hosts.length >= 5, `${spec.slug} cites ${hosts.length} sources (minimum 5)`);
      assert(hosts.some(h => PRIMARY.test(h)), `${spec.slug} cites no primary source`);
      assert(new Set(spec.sources.map(s => s.url)).size === spec.sources.length, `${spec.slug} repeats a source`);
    }
  });
});
