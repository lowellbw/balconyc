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
const scene3D = read('js/3d-scene.js');
const shadowModel = read('js/3d-shadow-model.js');
// methodology.html is the single canonical methodology document. A duplicate
// METHODOLOGY.md used to sit alongside it and the two drifted; the page is now
// the only copy, reached at /methodology (and via a redirect from the old path).
const methodologyHtml = read('methodology.html');
const costPage = read('balcony-solar-cost.html');
const costSpec = read('content/balcony-solar-cost.json');
const llms = read('llms.txt');
const robots = read('robots.txt');
const { SolarConfig } = loadModules();

function normalizeVisibleCopy(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&rsquo;|&#x27;|&#39;/g, "'")
    .replace(/&ldquo;|&rdquo;|&quot;/g, '"')
    .replace(/&cent;/g, '¢')
    .replace(/&mdash;/g, '—')
    .replace(/&rarr;/g, '→')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s*—\s*/g, '—')
    .replace(/\s+/g, ' ')
    .trim();
}

const visibleFaqMarkup = (index.match(/<section class="faq"[\s\S]*?<\/section>/) || [''])[0];
const footerMarkup = (index.match(/<footer>[\s\S]*?<\/footer>/) || [''])[0];
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
    assert(/modeled uncertainty range of about 15%/.test(visibleFaqMarkup),
      'visible FAQ should state about 15%');
  });

  it('states the same figure in the FAQPage schema', () => {
    const ld = JSON.parse(index.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    const faq = ld['@graph'].find(n => n['@type'] === 'FAQPage');
    const accuracy = faq.mainEntity.find(q => /accurate/i.test(q.name));
    assert(/modeled uncertainty range of about 15%/i.test(accuracy.acceptedAnswer.text),
      `schema accuracy answer drifted from the visible FAQ: ${accuracy.acceptedAnswer.text.slice(0, 80)}`);
  });

  it('states the same figure in the footer and llms.txt', () => {
    assert(/modeled uncertainty range of about 15%/.test(footerMarkup), 'footer should state about 15%');
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

describe('Homepage copy stays concrete and safe', () => {
  it('does not overpromise the electrical installation', () => {
    assert(!/Plugs into any outlet|No electrician required|cord runs from the panel through a window/i.test(index),
      'the homepage should not imply that any outlet or an improvised cable route is safe');
    assert(/properly rated, weather-protected outlet/i.test(index) && /licensed electrician/i.test(index),
      'the homepage should state the real outlet and electrician constraints');
  });

  it('keeps retired brochure language out of the lower page', () => {
    for (const phrase of ['No roof, no rights', 'Less than it used to', 'The questions behind the number']) {
      assert(!index.includes(phrase), `retired homepage phrase returned: ${phrase}`);
    }
    assert(/cannot ship (?:the|these) kit(?:s)? to New York/i.test(index),
      'current kit copy should disclose the New York certification constraint');
  });

  it('labels the fire-escape image as an illustration, not an installation example', () => {
    assert(/Never mount panels on a fire escape or block another exit route/i.test(index),
      'the homepage should not imply that a required egress route is a usable solar mount');
  });

  it('does not present an unavailable kit as a current New York purchase', () => {
    for (const [name, text] of [
      ['homepage', index],
      ['cost guide', costPage],
      ['cost guide source', costSpec],
      ['methodology', methodologyHtml],
      ['llms.txt', llms],
    ]) {
      assert(/cannot ship (?:the|these) kit(?:s)? to New York/i.test(text),
        name + ' should disclose the current New York shipping constraint');
      assert(/whole-system certification/i.test(text),
        name + ' should explain why the kit is not available in New York');
    }
  });

  it('keeps structured FAQ copy aligned with the questions visitors see', () => {
    const visible = [...visibleFaqMarkup.matchAll(
      /<details class="faq-item"><summary>([\s\S]*?)<span class="faq-toggle">[\s\S]*?<\/span><\/summary><p>([\s\S]*?)<\/p><\/details>/g
    )].map(match => ({
      question: normalizeVisibleCopy(match[1]),
      answer: normalizeVisibleCopy(match[2]),
    }));
    const ld = JSON.parse(index.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    const structured = ld['@graph'].find(node => node['@type'] === 'FAQPage').mainEntity;

    assert(visible.length === structured.length, 'visible and structured FAQs should have the same count');
    structured.forEach((item, position) => {
      assert(visible[position].question === item.name,
        `FAQ question ${position + 1} differs between the page and JSON-LD`);
      assert(visible[position].answer.startsWith(normalizeVisibleCopy(item.acceptedAnswer.text)),
        `FAQ answer ${position + 1} differs between the page and JSON-LD`);
    });
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

describe('Content pages and crawl surface', () => {
  const specs = fs.readdirSync(path.join(ROOT, 'content'))
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(read(path.join('content', f))));
  const sitemap = read('sitemap.xml');
  const DAY = 24 * 60 * 60 * 1000;
  // How long a page's claims may go unchecked. The legal page tracks a live
  // bill, so it gets a short leash; the rest describe a model that moves slowly.
  const REVIEW_WINDOW_DAYS = { 'sunny-act': 90 };
  const DEFAULT_WINDOW_DAYS = 180;

  it('builds every content page from its spec', () => {
    for (const spec of specs) {
      assert(fs.existsSync(path.join(ROOT, `${spec.slug}.html`)),
        `content/${spec.slug}.json has no built page; run tools/build_content_page.py`);
    }
  });

  it('lists every page in the sitemap', () => {
    for (const spec of specs) {
      assert(sitemap.includes(`<loc>https://balco.nyc/${spec.slug}</loc>`),
        `${spec.slug} is missing from sitemap.xml; run tools/build_sitemap.py`);
    }
    assert(sitemap.includes('<loc>https://balco.nyc/</loc>'), 'homepage missing from sitemap');
    assert(sitemap.includes('<loc>https://balco.nyc/methodology</loc>'), 'methodology missing from sitemap');
  });

  it('states one review date per page, not three that can drift', () => {
    // The date appears on the page, in the JSON-LD, and in the sitemap. If a
    // page can claim to be fresher in one surface than another, it will.
    for (const spec of specs) {
      const page = read(`${spec.slug}.html`);
      assert(page.includes(`"dateModified": "${spec.reviewed}"`),
        `${spec.slug}.html JSON-LD dateModified does not match spec.reviewed (${spec.reviewed})`);
      assert(page.includes(`datetime="${spec.reviewed}"`),
        `${spec.slug}.html visible review date does not match spec.reviewed`);
      const row = sitemap.split('<url>').find(u => u.includes(`/${spec.slug}<`));
      assert(row && row.includes(`<lastmod>${spec.reviewed}</lastmod>`),
        `sitemap lastmod for ${spec.slug} does not match spec.reviewed`);
    }
  });

  it('has not let a page go stale past its review window', () => {
    // This test is a calendar, not a bug. When it fails, re-check the page's
    // claims against its sources and bump `reviewed` in content/<slug>.json.
    const now = Date.now();
    for (const spec of specs) {
      const window = REVIEW_WINDOW_DAYS[spec.slug] ?? DEFAULT_WINDOW_DAYS;
      const age = Math.floor((now - Date.parse(spec.reviewed)) / DAY);
      assert(age <= window,
        `${spec.slug} was last reviewed ${age} days ago (limit ${window}). ` +
        `Re-check its claims, then update "reviewed" in content/${spec.slug}.json.`);
    }
  });

  it('serves valid JSON-LD on every page', () => {
    for (const f of ['index.html', 'methodology.html', ...specs.map(s => `${s.slug}.html`)]) {
      const blocks = read(f).match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
      assert(blocks.length > 0, `${f} carries no JSON-LD`);
      for (const b of blocks) {
        const json = b.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
        try { JSON.parse(json); } catch (e) { assert(false, `${f} has unparsable JSON-LD: ${e.message}`); }
      }
    }
  });

  it('leaves host canonicalisation to the Vercel domain settings', () => {
    // The www -> apex hop is configured on the project's domains in Vercel
    // (balco.nyc primary, www.balco.nyc redirecting to it). A host-matched
    // redirect here fights that config: on 2026-09-04 the two disagreed and
    // every request bounced between the hosts until nothing was reachable.
    const vercel = JSON.parse(read('vercel.json'));
    const hostRules = vercel.redirects.filter(x => JSON.stringify(x.has || '').includes('"host"'));
    assert(hostRules.length === 0, `vercel.json must not redirect by host; found ${JSON.stringify(hostRules)}`);
  });

  it('keeps every content page reachable from the homepage', () => {
    // An orphan page is a page search engines discover late and users never do.
    for (const spec of specs) {
      assert(index.includes(`/${spec.slug}"`) || index.includes(`/${spec.slug}#`),
        `nothing on the homepage links to /${spec.slug}`);
    }
  });
});

describe('Analytics', () => {
  const analytics = read('js/analytics.js');
  const keyMatch = analytics.match(/var PROJECT_KEY = '([^']*)'/);

  it('does nothing at all until a real project key is set', () => {
    // A placeholder key looks installed and collects nothing. An empty one is
    // honest: the file returns before fetching anything or setting a cookie.
    assert(keyMatch, 'js/analytics.js has no PROJECT_KEY declaration');
    const key = keyMatch[1];
    assert(key === '' || /^phc_[A-Za-z0-9]+$/.test(key),
      `PROJECT_KEY must be empty or a real phc_ key, got ${key}`);
    assert(/if \(!\/\^phc_/.test(analytics),
      'analytics.js must bail out before loading anything when unconfigured');
  });

  it('honours Do Not Track', () => {
    assert(/doNotTrack/.test(analytics), 'analytics.js ignores the Do Not Track signal');
    assert(/respect_dnt:\s*true/.test(analytics), 'PostHog must also be told to respect DNT');
  });

  it('never records what people type', () => {
    // Visitors type their home address into this site. Session replay would
    // capture that keystroke by keystroke on PostHog's defaults.
    assert(/maskAllInputs:\s*true/.test(analytics),
      'session replay must mask all inputs — people type their address here');
    assert(/mask_all_element_attributes:\s*true/.test(analytics),
      'autocapture must not report element attribute values');
    assert(/person_profiles:\s*'identified_only'/.test(analytics),
      'person profiles should only be created for identified users');
  });

  it('excludes the address field from capture and replay', () => {
    const input = index.match(/<input[^>]*id="addressInput"[^>]*>/);
    assert(input, 'the address input was not found in index.html');
    assert(input[0].includes('ph-no-capture'),
      'the address input must carry ph-no-capture');
    assert(input[0].includes('data-private'),
      'the address input must carry data-private, which the replay mask selector targets');
    assert(/maskTextSelector:\s*'\[data-private\]'/.test(analytics),
      'the replay mask selector must target [data-private]');
  });

  it('never sends an address or coordinates to analytics', () => {
    const call = index.match(/balcoTrack\(([\s\S]*?)\}\s*\);/);
    assert(call, 'no balcoTrack call found in index.html');
    for (const banned of ['address', 'lat', 'lon', 'SolarState.address']) {
      assert(!call[1].includes(banned),
        `the analytics event payload includes "${banned}" — it must carry no location data`);
    }
  });

  it('puts the masking options where PostHog actually reads them', () => {
    // mask_all_element_attributes and mask_all_text are top-level PostHogConfig
    // keys. AutocaptureConfig holds only allowlists and ignorelists, so nesting
    // them under `autocapture` drops them silently — no error, no warning, and
    // both fall back to false. That shipped once; this stops it shipping twice.
    const init = analytics.slice(analytics.indexOf('posthog.init('));
    const nested = init.match(/autocapture:\s*\{[\s\S]*?\}/);
    assert(!nested || !/mask_all_/.test(nested[0]),
      'mask_all_* is nested under autocapture, where PostHog ignores it');
    for (const key of ['mask_all_element_attributes: true', 'mask_all_text: false']) {
      assert(new RegExp('^\\s{6}' + key.replace(/[:]/g, '[:]'), 'm').test(init),
        `${key} must sit at the top level of init(), not inside another block`);
    }
  });

  it('reports its own state so a silent failure is findable', () => {
    // Analytics fails quietly: no error, no broken layout, just no data three
    // weeks later. Every exit path has to leave a word behind in
    // window.__balcoAnalytics, or the only way to debug it is to guess.
    for (const state of ['off', 'loading', 'blocked', 'ready']) {
      assert(analytics.includes(`status('${state}')`),
        `analytics.js never reports the '${state}' state`);
    }
    assert(/s\.onerror\s*=/.test(analytics),
      'a blocked script must be detected, not ignored — most ad blockers stop PostHog');
    assert(analytics.indexOf("status('off')") < analytics.indexOf('var PROJECT_KEY'),
      "the default must be 'off', set before any early return can skip it");
  });

  it('loads analytics on every page', () => {
    const specs = fs.readdirSync(path.join(ROOT, 'content'))
      .filter(f => f.endsWith('.json'))
      .map(f => JSON.parse(read(path.join('content', f))).slug);
    for (const f of ['index.html', 'methodology.html', ...specs.map(s => `${s}.html`)]) {
      assert(read(f).includes('js/analytics.js'), `${f} does not load analytics`);
    }
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

  it('keeps the map source in the repo so the hero can be rebuilt', () => {
    // build_city_hero.py reads these borough boundaries. The file was once
    // gitignored, which meant the generator only ran on the machine that had
    // downloaded it — a clean checkout could not rebuild the map at all.
    const src = path.join(ROOT, 'design/home-directions/nyc.geojson');
    assert(fs.existsSync(src), 'nyc.geojson is missing; the hero map cannot be regenerated');
    const boroughs = JSON.parse(fs.readFileSync(src, 'utf8'))
      .features.map(f => f.properties.BoroName).sort().join(', ');
    assert(boroughs === 'Bronx, Brooklyn, Manhattan, Queens, Staten Island',
      `expected the five boroughs, got ${boroughs}`);
  });

  it('busts the hero map cache when the map changes', () => {
    // js/ is cached for 10 minutes and city-hero.js never changes name, while
    // the HTML is max-age=0. Without a fingerprint, for ten minutes after a
    // deploy a browser pairs the new page with the previous map — which looks
    // exactly like the deploy not having happened. Stamped by
    // design/home-directions/build_city_hero.py; re-run it if this fails.
    const crypto = require('crypto');
    const m = read('index.html').match(/src="js\/city-hero\.js\?v=([0-9a-f]+)"/);
    assert(m, 'index.html does not load city-hero.js with a ?v= fingerprint');
    const want = crypto.createHash('sha256')
      .update(read('js/city-hero.js'), 'utf8').digest('hex').slice(0, m[1].length);
    assert(m[1] === want, `city-hero.js fingerprint is stale: ${m[1]} but file hashes to ${want}`);
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

  it('explains the spin-then-pin interaction and keeps the target building red', () => {
    assert(index.includes('Spin the block, then pin your balcony'),
      'the balcony selection prompt should explain the interaction sequence');
    assert(index.includes('Select the red building at your floor'),
      'the prompt should identify the selectable building and height cue');
    assert(/color:\s*0x7F1D1D/.test(scene3D),
      'the initial target-building material should use the brand red');
    assert(/target:\s*0x7F1D1D/.test(shadowModel),
      'the target building should stay brand red during the shadow trace');
  });

  it('keeps the WebGL canvas sized to the responsive scene frame', () => {
    assert(/height:\s*clamp\(580px, calc\(100vh - 180px\), 800px\)/.test(index),
      'the wide-screen scene should grow with the viewport and remain capped');
    assert(/new ResizeObserver/.test(scene3D),
      'the renderer should follow its animated container rather than only window resize events');
  });

  it('keeps the pin flow recoverable and keyboard accessible', () => {
    assert(index.includes('id="manualPinBtn"'),
      'the pointer-based 3D picker should offer a manual keyboard path');
    assert(index.includes('sceneRunToken += 1') && index.includes('estimateRunToken += 1'),
      'reset and dialog dismissal should invalidate in-flight calculations');
    assert(index.includes('runToken !== sceneRunToken') && index.includes('runToken !== estimateRunToken'),
      'stale animation and API continuations should stop before updating the UI');
    assert(index.includes("sceneCanvas.onmouseleave = null"),
      'reset should remove the per-scene pointer exit handler');
  });

  it('does not turn missing building metadata into a fictional floor count', () => {
    assert(!index.includes('SolarState.numfloors || 20'),
      'unknown PLUTO data must not silently become a 20-floor building');
    assert(index.includes('SolarAPI.floorFromHeightRatio(ratio, totalFloors)'),
      'the canvas picker should use the tested floor-band mapping');
    assert(index.includes("We could not confirm this building\\'s floor count"),
      'an unresolved count should ask the visitor rather than guess');
  });

  it('keeps address lookups single-flight while shared building state is loading', () => {
    assert(index.includes('if (addressLookupInFlight && !lookupReserved) return'),
      'a second autocomplete selection should not overlap the active lookup');
    assert(index.includes('setAddressLookupLocked(true)') && index.includes('setAddressLookupLocked(false)'),
      'the address controls should lock during lookup and recover on failure or reset');
    assert(index.includes('SolarState.reset();') && index.includes('SolarState.address = place.formatted_address'),
      'each accepted place should start with a clean building-data envelope');
  });
});

describe('Result summary and full breakdown', () => {
  it('keeps the pre-result card out of the accessibility tree and tab order', () => {
    const card = (index.match(/<section[^>]*id="floatingCard"[^>]*>/) || [''])[0];
    assert(/\bhidden\b/.test(card), 'the empty result card should start hidden');
    assert(/\binert\b/.test(card), 'the empty result CTA should start inert');
    assert(/aria-hidden="true"/.test(card), 'the empty result card should start aria-hidden');
    assert(index.includes("card.removeAttribute('inert')") && index.includes("card.setAttribute('inert', '')"),
      'showing and resetting results should update the card keyboard state');
  });

  it('shows the exact pin and model quality on both result surfaces', () => {
    for (const id of ['rcContext', 'breakdownAddress', 'breakdownContext', 'rcQuality']) {
      assert(index.includes(`id="${id}"`), `${id} markup missing`);
    }
    assert(/function resultContext\(inputs, r\)/.test(index), 'shared result context formatter missing');
    assert(index.includes("'Floor ' + inputs.floor + ' of ' + inputs.totalFloors"),
      'result context should state the selected and total floor counts');
    assert(index.includes('resultDirectionLabel(inputs.azimuth)'),
      'result context should state the pinned wall direction');
    assert(index.includes("r.systemWatts + 'W system'"),
      'result context should state the modeled system size');
    assert(index.includes("quality.textContent = detailed ? '3D + PVWatts' : 'Approximate estimate'"),
      'the compact result should disclose estimate quality');
  });

  it('uses a scene-synchronised sun study instead of a generic loading spinner', () => {
    const loader = (index.match(/<div class="modelling-card"[\s\S]*?<\/div>\s*<\/div>\s*<!-- Info panels -->/) || [''])[0];
    const pinStatus = (index.match(/<div class="prompt-title" id="pinPromptTitle"[^>]*>/) || [''])[0];
    assert(/role="status"/.test(pinStatus) && /aria-live="polite"/.test(pinStatus) &&
      index.includes("'-facing \\u00b7 Studying daylight'"),
      'one existing live status should announce both the pin and the daylight study');
    assert(loader.includes('id="modellingContext"') && loader.includes('id="sunStudyTime"'),
      'the study strip should identify the pinned floor and follow the displayed sun time');
    assert(!index.includes('sun-spinner') && !loader.includes('8,760 hours'),
      'the retired spinner and inaccurate every-hour claim should stay removed');
    assert(index.includes("modellingOverlay.style.setProperty('--study-progress', (progress * 100).toFixed(1) + '%')") &&
      index.includes('studyTime.textContent = formattedTime'),
      'the study ruler and clock should follow the real scene animation');
    assert(index.includes("scene3dCanvas').setAttribute('aria-busy', 'true')") &&
      index.includes("scene3dCanvas').removeAttribute('aria-busy')"),
      'the canvas should expose and clear its busy state without suppressing the sibling live status');
    assert(index.includes("matchMedia('(prefers-reduced-motion: reduce)').matches") &&
      index.includes('var animPromise = reduceMotion ? Promise.resolve()') &&
      index.includes("setProperty('--study-progress', '46.4%')"),
      'reduced-motion visitors should not be made to sit through the six-second sweep');
    assert(index.includes('runSunAnimation(runToken).catch(function(error)') &&
      index.includes('failedRunToken !== sceneRunToken') &&
      index.includes('We could not finish the sun study. Try Calculate again.'),
      'an unexpected model failure should clear the study and offer a recoverable retry');
  });

  it('gives the post-study sun controls names, values, and selected states', () => {
    assert(/id="playBtn"[^>]*aria-label="Play sun path"[^>]*aria-pressed="false"/.test(index),
      'the icon-only play control needs an accessible action and state');
    assert(/id="timeSlider"[^>]*aria-label="Time of day"[^>]*aria-valuetext="12:30 PM"/.test(index) &&
      index.includes("this.setAttribute('aria-valuetext', formattedTime)"),
      'the time scrubber should expose its formatted time');
    assert(/class="scene3d-month-btns"[^>]*role="group"[^>]*aria-label="Sun-study month"/.test(index) &&
      /data-month="5"[^>]*aria-pressed="true"/.test(index),
      'the month choices should expose their group and selected state');
  });

  it('keeps the estimate visually structured as a report rather than nested dashboard cards', () => {
    const heroRule = (index.match(/\.bd-hero\s*\{[^}]*\}/) || [''])[0];
    const financialRule = (index.match(/\.bd-financial-card\s*\{[^}]*\}/) || [''])[0];
    assert(heroRule.includes('background: #FCFBF7') && !heroRule.includes('linear-gradient'),
      'the report header should remain plain paper rather than a gradient hero');
    assert(financialRule.includes('border-top: 1px') && !financialRule.includes('border-radius'),
      'financial values should remain ledger rows rather than rounded tiles');
    assert(/\.results-card\s*\{[^}]*border-left:\s*4px solid var\(--accent\)/.test(index),
      'the compact result should retain the report-slip treatment');
    assert(!index.includes('id="offsetCircle"') && !index.includes('class="bd-done"'),
      'the percentage ring and redundant Done button should stay removed');
  });

  it('gives the long modal a visible title and isolates it from the page', () => {
    const dialog = (index.match(/<div[^>]*class="breakdown-modal"[^>]*>/) || [''])[0];
    assert(/role="dialog"/.test(dialog) && /aria-modal="true"/.test(dialog),
      'breakdown dialog semantics missing');
    assert(/aria-labelledby="breakdownTitle"/.test(dialog),
      'the dialog should reference its visible title');
    assert(/<h2[^>]*id="breakdownTitle"[^>]*>/.test(index),
      'the breakdown needs a visible h2');
    assert(index.includes("document.body.classList.add('breakdown-open')"),
      'opening the breakdown should lock background scrolling');
    assert(index.includes('setBreakdownBackgroundInert(true)') && index.includes('setBreakdownBackgroundInert(false)'),
      'the page behind the modal should become inert and be restored');
  });

  it('makes every adjustable segmented control programmatically understandable', () => {
    const groups = [...index.matchAll(/<div class="bd-cust-segments"[^>]*>/g)].map(match => match[0]);
    assert(groups.length === 5, `expected five segmented groups, found ${groups.length}`);
    assert(groups.every(tag => /role="group"/.test(tag) && /aria-labelledby=/.test(tag)),
      'each segmented control needs an accessible group name');
    const choices = [...index.matchAll(/<button[^>]*data-val="[^"]+"[^>]*>/g)].map(match => match[0]);
    assert(choices.length > 0 && choices.every(tag => /aria-pressed="(?:true|false)"/.test(tag)),
      'each segmented choice should expose its selected state');
    assert(index.includes("setAttribute('aria-pressed', String(selected))"),
      'button selection changes should update aria-pressed');
    assert(/<label[^>]*for="custMonthlyBill"/.test(index),
      'the electric-bill label should be associated with its input');
  });

  it('does not offer a shading control that a 3D result ignores', () => {
    assert(index.includes("getElementById('custShadingField').hidden = r.shadeFactorFrom3D"),
      '3D results should hide the generic shading selector');
    assert(index.includes('Modeled from your pinned block'),
      '3D results should explain where their shading comes from');
    assert(index.includes('bill >= 20 && bill <= 800'),
      'custom bill validation should enforce the visible bounds');
    assert(index.includes('We could not update the estimate.'),
      'recalculation failures should be visible rather than console-only');
  });

  it('labels chart values and respects responsive accessibility preferences', () => {
    const chart = (index.match(/<div[^>]*id="monthlyChart"[^>]*>/) || [''])[0];
    assert(/role="list"/.test(chart) && /aria-label=/.test(chart),
      'the monthly chart needs initial accessible semantics');
    assert(index.includes("w.setAttribute('role', 'listitem')") &&
      index.includes("w.setAttribute('aria-label', monthNames[i]"),
      'each rendered month should expose its value and unit');
    assert(/\.breakdown-modal \.bd-close\s*\{[^}]*width:\s*44px;\s*height:\s*44px/.test(index),
      'the close button should meet the 44px touch-target minimum');
    assert(index.includes('.rc-cta:focus-visible') && index.includes('.bd-close:focus-visible') &&
      index.includes('.bd-cust-segments button:focus-visible'),
      'result actions need visible keyboard focus');
    assert(index.includes('100dvh'), 'mobile result surfaces should use the dynamic viewport height');
    assert(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.results-card[\s\S]*\.breakdown-modal[\s\S]*\.chart-bar/.test(index),
      'result and chart motion should respect reduced-motion preferences');
  });
});
