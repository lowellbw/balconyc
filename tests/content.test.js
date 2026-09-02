// Content-consistency tests.
//
// The site states the same handful of facts in five places: the visible FAQ,
// the JSON-LD FAQPage schema, the footer, llms.txt, and the methodology
// documents. They drifted apart before — the FAQ said one accuracy figure
// while the schema and footer said another, and every retired prototype page
// quoted a superseded electricity rate. Structured data that contradicts the
// visible page also violates Google's own guidelines. These tests fail when
// any of those copies fall out of step with js/config.js.

const fs = require('fs');
const path = require('path');
const { loadModules, describe, it, assert } = require('./harness');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const index = read('index.html');
// methodology.html is the single canonical methodology document. A duplicate
// METHODOLOGY.md used to sit alongside it and the two drifted; the page is now
// the only copy, reached at /methodology (and via a redirect from the old path).
const methodologyHtml = read('methodology.html');
const llms = read('llms.txt');
const robots = read('robots.txt');
const { SolarConfig } = loadModules();

const ALL_PUBLIC = { 'index.html': index, 'methodology.html': methodologyHtml, 'llms.txt': llms };

describe('Electricity rate is stated consistently', () => {
  it('quotes the config rate everywhere it appears', () => {
    const cents = Math.round(SolarConfig.ELECTRICITY_RATE * 100);
    for (const [name, text] of Object.entries(ALL_PUBLIC)) {
      assert(text.includes(`${cents}`), `${name} should mention the ${cents}c rate`);
    }
  });

  it('carries no superseded rate figures', () => {
    for (const [name, text] of Object.entries(ALL_PUBLIC)) {
      assert(!text.includes('$0.22'), `${name} still quotes the retired $0.22/kWh rate`);
      assert(!/\b31\s*(&cent;|¢|cents)/i.test(text), `${name} still quotes the retired 31c rate`);
    }
  });
});

describe('CO2 factor is stated consistently', () => {
  it('carries no superseded CO2 factor', () => {
    for (const [name, text] of Object.entries(ALL_PUBLIC)) {
      assert(!text.includes('0.65 lbs'), `${name} still quotes the retired 0.65 lbs/kWh factor`);
    }
    assert(methodologyHtml.includes('0.89'), 'methodology.html should state the eGRID2023 factor');
  });
});

describe('Accuracy claim agrees across surfaces', () => {
  // The visible FAQ answer and its JSON-LD twin must say the same thing.
  it('states about 15% in the visible FAQ', () => {
    assert(/Within about 15%/.test(index), 'visible FAQ should state about 15%');
  });

  it('states the same figure in the FAQPage schema', () => {
    const ld = JSON.parse(index.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    const faq = ld['@graph'].find(n => n['@type'] === 'FAQPage');
    const accuracy = faq.mainEntity.find(q => /accurate/i.test(q.name));
    assert(/within 15%/i.test(accuracy.acceptedAnswer.text),
      `schema accuracy answer drifted from the visible FAQ: ${accuracy.acceptedAnswer.text.slice(0, 80)}`);
  });

  it('states the same figure in the footer and llms.txt', () => {
    assert(/about 15% from real-world/.test(index), 'footer should state about 15%');
    assert(/about 15%/.test(llms), 'llms.txt should state about 15%');
  });

  it('has dropped the old two-tier band from user-facing copy', () => {
    for (const [name, text] of Object.entries(ALL_PUBLIC)) {
      assert(!/±12[–-]18%/.test(text) && !/12 to 18%/.test(text),
        `${name} still quotes the retired +/-12-18% band`);
    }
  });

  it('says plainly that the band is modeled rather than measured', () => {
    assert(/modeled, not measured/i.test(methodologyHtml),
      'methodology.html should flag that the accuracy band is unvalidated');
  });
});

describe('Kit cost agrees with the configured tiers', () => {
  it('quotes the configured tier prices in user-facing copy', () => {
    const { budget, mid, premium } = SolarConfig.SYSTEM_COST_BY_TIER;
    assert(index.includes(`$${budget}`), `index.html should quote the $${budget} budget tier`);
    assert(index.includes(`$${mid.toLocaleString('en-US')}`), `index.html should quote the $${mid} mid tier`);
    assert(index.includes(`$${premium.toLocaleString('en-US')}`), `index.html should quote the $${premium} premium tier`);
  });

  it('no longer quotes the pre-July-2026 price range', () => {
    for (const [name, text] of Object.entries(ALL_PUBLIC)) {
      assert(!/\$1,200 (to|and) \$1,800/.test(text),
        `${name} still quotes the superseded $1,200-1,800 range`);
    }
  });
});

describe('SUNNY Act status is current', () => {
  it('reports that it passed both chambers and awaits signature', () => {
    for (const [name, text] of Object.entries(ALL_PUBLIC)) {
      assert(/Governor/i.test(text), `${name} should mention the Governor's signature`);
      assert(!/awaiting Assembly action/i.test(text),
        `${name} still says the bill awaits Assembly action; it passed on 28 May 2026`);
    }
  });

  it('notes that the Act grants no right to install', () => {
    assert(/no right to install/i.test(index), 'index.html should note the Act grants no right to install');
    assert(/no right to install/i.test(methodologyHtml), 'methodology.html should note the same');
  });
});

describe('Methodology documents match the implementation', () => {
  it('describes the horizon-profile shade model, not the retired self-shading penalty', () => {
    for (const [name, text] of [['methodology.html', methodologyHtml]]) {
      assert(/horizon profile/i.test(text), `${name} should describe the horizon profile`);
      assert(/1\.00 for an unobstructed balcony/i.test(text),
        `${name} should state the unobstructed-balcony invariant`);
      assert(!/DIFFUSE_FRACTION = 0\.30/.test(text),
        `${name} still documents the retired fixed diffuse-fraction penalty`);
    }
  });

  it('documents the railing obstruction factor', () => {
    assert(/[Rr]ailing obstruction/.test(methodologyHtml), 'methodology.html should document railing obstruction');
  });

  it('documents the cos(lat) projection in orientation detection', () => {
    assert(/cos\(latitude\)|cos\(lat\)/.test(methodologyHtml),
      'methodology.html should document the longitude projection');
    assert(/primaryDirections/.test(methodologyHtml),
      'methodology.html should document what orientation detection returns');
  });

  it('records the azimuth convention that the sign error broke', () => {
    assert(/no further rotation is applied/i.test(methodologyHtml),
      'methodology.html should state that no extra rotation is applied to the azimuth');
  });

  it('is the only methodology document in the repo', () => {
    assert(!fs.existsSync(path.join(ROOT, 'METHODOLOGY.md')),
      'a duplicate METHODOLOGY.md is back; the two copies drifted last time');
  });

  it('calls the payback nominal rather than NPV', () => {
    for (const [name, text] of [['methodology.html', methodologyHtml]]) {
      assert(/no discount rate/i.test(text), `${name} should say no discount rate is applied`);
    }
    assert(!/NPV payback<\/strong> runs/.test(methodologyHtml), 'methodology.html still labels it NPV payback');
  });

  it('documents the dc_ac_ratio actually sent to PVWatts', () => {
    for (const [name, text] of [['methodology.html', methodologyHtml]]) {
      assert(/1\.1/.test(text), `${name} should document dc_ac_ratio 1.1`);
    }
  });
});

describe('Retired prototype pages are gone', () => {
  const retired = [
    'calculator.html', 'calculator-2.html', 'calculator-3a.html', 'calculator-3b.html',
    'calculator-3c.html', 'calculator-4.html', 'calculator-6.html',
    'nyc-balcony-solar-technical-spec.html', '3d-visualization-specs.html', 'design-system.html',
  ];

  it('no longer ships any of the superseded calculator pages', () => {
    const present = retired.filter(f => fs.existsSync(path.join(ROOT, f)));
    assert(present.length === 0, `these stale pages are still served: ${present.join(', ')}`);
  });

  it('no longer needs to disallow them in robots.txt', () => {
    for (const f of retired) {
      assert(!robots.includes(f), `robots.txt still references removed page ${f}`);
    }
  });

  it('no longer ships the orphaned admin CMS', () => {
    // It edited a site_content table that no page has ever read, using keys
    // from the deleted calculator-4/-6 landing page.
    assert(!fs.existsSync(path.join(ROOT, 'admin')), 'admin/ is still present');
  });

  it('keeps /admin/ and /api/ disallowed', () => {
    assert(/Disallow: \/admin\//.test(robots), '/admin/ must stay disallowed');
    assert(/Disallow: \/api\//.test(robots), '/api/ must stay disallowed');
  });

  it('leaves /js/ crawlable so search engines can render the calculator', () => {
    assert(!/Disallow: \/js\//.test(robots), '/js/ must stay crawlable for rendering');
  });

  it('keeps the design workbench out of the index', () => {
    // Vercel serves whatever sits in the tree, so design/ mockups and forks
    // are reachable by URL. They are not the site and must not be indexed.
    assert(/Disallow: \/design\//.test(robots), '/design/ must stay disallowed');
  });
});

describe('Deployment configuration', () => {
  const vercel = JSON.parse(read('vercel.json'));

  it('does not cache un-fingerprinted JS immutably for a year', () => {
    // The model files keep stable names, so an immutable year-long cache
    // meant a physics fix could not reach returning visitors.
    const js = vercel.headers.find(h => h.source.includes('/js/'));
    const cc = js.headers.find(x => x.key === 'Cache-Control').value;
    assert(!cc.includes('immutable'), `js is still immutable-cached: ${cc}`);
    assert(/must-revalidate/.test(cc), `js should revalidate: ${cc}`);
  });

  it('does not deploy the design workbench', () => {
    // It is a workbench: mockups, a half-finished fork of the calculator,
    // build scripts. Vercel serves whatever it uploads, and the fork renders
    // broken because its images live in a sibling directory. noindex was not
    // enough — it stopped indexing, not serving. Keep it out of the upload.
    const ignore = read('.vercelignore');
    assert(/^design\/$/m.test(ignore), '.vercelignore must exclude design/');
  });

  it('redirects any /design/ URL that is still reachable', () => {
    // Belt and braces: redirects are evaluated before the filesystem, so this
    // holds even if the upload ever carries design/ again.
    const rules = vercel.redirects.filter(r => r.source.startsWith('/design'));
    assert(rules.length >= 2, `expected /design and /design/(.*) redirects, got ${rules.length}`);
    for (const r of rules) assert(r.destination === '/', `/design must land on /, got ${r.destination}`);
  });

  it('only declares functions that still exist', () => {
    for (const fnPath of Object.keys(vercel.functions || {})) {
      assert(fs.existsSync(path.join(ROOT, fnPath)), `vercel.json references missing function ${fnPath}`);
    }
  });
});

describe('index.html wiring', () => {
  it('actually sends the estimate log rather than building a lazy query', () => {
    // supabase-js v2 builders are lazy; without a .then() nothing is sent.
    assert(/\.insert\(\{[\s\S]*?\}\)\.then\(/.test(index),
      'the estimates insert must be subscribed to with .then() or it never fires');
  });

  it('reveals the scene controls once the reveal animation finishes', () => {
    assert(/getElementById\('sceneControls'\)\.style\.display = ''/.test(index),
      'the time scrubber and month buttons are never shown');
  });

  it('offers a manual path that does not require WebGL', () => {
    assert(/id="manualPanel"/.test(index), 'manual entry panel markup missing');
    assert(/function supportsWebGL/.test(index), 'no WebGL capability check');
    assert(/showManualPanel/.test(index), 'manual panel is never opened');
  });

  it('wires the hero Calculate button to a geocode', () => {
    assert(/heroSubmit'\)\.addEventListener\('click', submitTypedAddress\)/.test(index),
      'the Calculate button must submit the typed address');
    assert(!/id="heroSubmit"[^>]*onclick="document\.getElementById\('addressInput'\)\.focus\(\)"/.test(index),
      'the Calculate button still only refocuses the input');
  });

  it('warns the visitor when the full pipeline was not used', () => {
    assert(/id="estimateBanner"/.test(index), 'fallback banner markup missing');
    assert(/updateEstimateBanner/.test(index), 'fallback banner is never populated');
  });

  it('defers the 3D stack until an address resolves', () => {
    assert(!/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/three@/.test(index),
      'Three.js should not be a blocking script tag');
    assert(/loadSceneStack/.test(index), 'no on-demand scene loader');
  });
});
