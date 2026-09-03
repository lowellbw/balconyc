// Content-consistency tests.
//
// The site states the same handful of facts in five places: the visible FAQ,
// the JSON-LD FAQPage schema, the footer, llms.txt, and the methodology
// page. They drifted apart before: the FAQ said one accuracy figure
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
    const dollars = SolarConfig.ELECTRICITY_RATE.toFixed(2);
    const rate = new RegExp(`\\$${dollars.replace('.', '\\.')}|\\b${cents}\\s*(¢|&cent;|c\\b|cents)`);
    for (const [name, text] of Object.entries(ALL_PUBLIC)) {
      assert(rate.test(text), `${name} should quote the ${cents}c rate as a price`);
    }
  });

  it('carries no superseded rate figures', () => {
    for (const [name, text] of Object.entries(ALL_PUBLIC)) {
      assert(!text.includes('$0.22'), `${name} still quotes the retired $0.22/kWh rate`);
      assert(!/\b31\s*(&cent;|¢|cents)/i.test(text), `${name} still quotes the retired 31c rate`);
      assert(!/\$0\.34\b|\b34\s*(&cent;|¢|cents)/i.test(text), `${name} still quotes the retired 34c rate`);
      assert(!/56% above/.test(text), `${name} still compares Con Ed to the US average with the state-level 56% figure`);
    }
  });
});

describe('CO2 factor is stated consistently', () => {
  it('carries no superseded CO2 factor', () => {
    for (const [name, text] of Object.entries(ALL_PUBLIC)) {
      assert(!text.includes('0.65 lbs'), `${name} still quotes the retired 0.65 lbs/kWh factor`);
    }
    for (const [name, text] of Object.entries(ALL_PUBLIC)) {
      assert(!/0\.89 ?lb/.test(text), `${name} still quotes the eGRID2022 factor 0.89 as current`);
    }
    assert(methodologyHtml.includes(`× ${SolarConfig.CO2_FACTOR}`),
      'methodology.html should state the configured eGRID2023 factor in the CO2 formula');
    assert(/864\.5/.test(methodologyHtml), 'methodology.html should cite the eGRID2023 NYCW rate in lb/MWh');
  });

  it('uses the EPA equivalency factors from config', () => {
    assert(methodologyHtml.includes(`/ ${SolarConfig.CO2_PER_TREE_LB}`), 'tree factor drifted from config');
    assert(methodologyHtml.includes(`/ ${SolarConfig.CAR_LB_PER_MILE}`), 'vehicle factor drifted from config');
    assert(methodologyHtml.includes(`/ ${SolarConfig.PHONE_CHARGE_KWH}`), 'phone factor drifted from config');
    assert(!/co2_lbs \/ 48\b/.test(methodologyHtml), 'the Arbor Day 48 lb tree figure is back');
  });
});

describe('Accuracy claim agrees across surfaces', () => {
  // The visible FAQ answer and its JSON-LD twin must say the same thing.
  it('states 15 to 25% in the visible FAQ', () => {
    assert(/within 15 to 25% of real-world production/.test(index), 'visible FAQ should state 15 to 25%');
  });

  it('states the same figure in the FAQPage schema', () => {
    const ld = JSON.parse(index.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    const faq = ld['@graph'].find(n => n['@type'] === 'FAQPage');
    const accuracy = faq.mainEntity.find(q => /accurate/i.test(q.name));
    assert(/within 15 to 25%/i.test(accuracy.acceptedAnswer.text),
      `schema accuracy answer drifted from the visible FAQ: ${accuracy.acceptedAnswer.text.slice(0, 80)}`);
  });

  it('states the same figure in the footer, llms.txt and the methodology page', () => {
    assert(/by about 15 to 25%/.test(index), 'footer should state about 15 to 25%');
    assert(/about 15 to 25%/.test(llms), 'llms.txt should state about 15 to 25%');
    assert(/within about 15 to 25%/.test(methodologyHtml), 'methodology.html should state about 15 to 25%');
    for (const [name, text] of Object.entries(ALL_PUBLIC)) {
      assert(!/about (±)?15% (of|from) real-world/.test(text) && !/Within about 15%/.test(text),
        `${name} still quotes the retired single 15% band`);
    }
  });

  it('says savings depend on self-consumption everywhere production accuracy is claimed', () => {
    for (const [name, text] of Object.entries(ALL_PUBLIC)) {
      assert(/self-consumption|used at home|use[sd]? as it is produced/i.test(text),
        `${name} should say savings depend on how much is used at home`);
    }
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

  it('points at the decision record, which explains choices without restating the model', () => {
    // docs/modeling-decisions.md records why each modelling choice was made
    // and what was rejected. It is not a second description of the model, so
    // it may coexist with the page; the page must link to it so it is found.
    assert(fs.existsSync(path.join(ROOT, 'docs', 'modeling-decisions.md')),
      'docs/modeling-decisions.md is missing');
    assert(/docs\/modeling-decisions\.md/.test(methodologyHtml),
      'methodology.html should point readers at docs/modeling-decisions.md');
  });

  it('calls the payback nominal rather than NPV', () => {
    for (const [name, text] of [['methodology.html', methodologyHtml]]) {
      assert(/no discount rate/i.test(text), `${name} should say no discount rate is applied`);
    }
    assert(!/NPV payback<\/strong> runs/.test(methodologyHtml), 'methodology.html still labels it NPV payback');
  });

  it('documents the dc_ac_ratio actually sent to PVWatts', () => {
    assert(/array watts ÷ inverter watts/.test(methodologyHtml),
      'methodology.html should document dc_ac_ratio as array watts over inverter watts');
    assert(!/<code>dc_ac_ratio<\/code><\/td><td>1\.1<\/td>/.test(methodologyHtml),
      'methodology.html still documents the fixed dc_ac_ratio 1.1');
  });

  it('documents the PVWatts parameters that config sends', () => {
    const P = SolarConfig.PVWATTS_PARAMS;
    assert(new RegExp(`<code>losses</code></td><td>${P.losses}%`).test(methodologyHtml), 'losses drifted from config');
    assert(new RegExp(`<code>gcr</code></td><td>${P.gcr}`).test(methodologyHtml), 'gcr drifted from config');
    assert(methodologyHtml.includes(P.soiling_vertical.join('|')), 'vertical soiling array drifted from config');
    assert(methodologyHtml.includes(P.soiling_tilted.join('|')), 'tilted soiling array drifted from config');
    assert(!/\[3,3,4,5,6,7,7,7,6,5,4,3\]/.test(methodologyHtml), 'the retired rooftop soiling profile is still documented as current');
  });

  it('describes the offline PVWatts table rather than the retired fallback formula', () => {
    assert(/Offline PVWatts table/.test(methodologyHtml), 'methodology.html should describe the offline table');
    assert(!/BASELINE<\/strong> = 1,300/.test(methodologyHtml), 'the retired 1,300 kWh/kW baseline is still documented as current');
    assert(!/Solar Resource/.test(methodologyHtml), 'the retired Solar Resource API is still documented');
    assert(!/Solar Resource/.test(llms), 'llms.txt still mentions the retired Solar Resource API');
    // The table quoted on the page must be the generated one.
    const { PVWattsTableNYC } = loadModules();
    const s = Math.round(PVWattsTableNYC.kwhPerKw[90][180]).toLocaleString('en-US');
    const t = Math.round(PVWattsTableNYC.kwhPerKw[35][180]).toLocaleString('en-US');
    assert(methodologyHtml.includes(`<td>90°</td>`) && methodologyHtml.includes(`<td>${s}</td>`),
      `methodology.html should quote the generated vertical-south yield ${s}`);
    assert(methodologyHtml.includes(`<td>${t}</td>`), `methodology.html should quote the generated 35° south yield ${t}`);
  });

  it('describes the shade model that ships: trees, slab, canonical canyons, weather weights', () => {
    assert(/Forestry Tree Points/.test(methodologyHtml), 'methodology.html should name the tree dataset');
    assert(/canonical/i.test(methodologyHtml), 'methodology.html should describe the canonical canyons');
    assert(!/base_exposure = 0\.5 \+ 0\.5/.test(methodologyHtml), 'the retired tanh band formula is still documented as current');
    assert(/irradiance-nyc\.js/.test(methodologyHtml), 'methodology.html should describe the NSRDB weight table');
    assert(!/sin\(altitude\)\^0\.75<\/code>, which keeps/.test(methodologyHtml), 'the retired clear-sky proxy is still documented as current');
    assert(/mount type/i.test(methodologyHtml), 'methodology.html should describe the slab-above mount types');
    assert(/intersects/.test(methodologyHtml), 'methodology.html should describe the intersects neighbour query');
    for (const tier of SolarConfig.NEIGHBOR_QUERIES) {
      assert(methodologyHtml.includes(`${tier.radiusM.toLocaleString('en-US')} m`), `neighbour tier ${tier.radiusM} m is not documented`);
    }
    for (const [kind, c] of Object.entries(SolarConfig.CANONICAL_CANYONS)) {
      if (c) assert(methodologyHtml.includes(`${c.streetM} m</td><td>${c.oppositeM} m`), `canonical canyon ${kind} drifted from config`);
    }
  });

  it('describes the self-consumption model and the financial constants that ship', () => {
    assert(/id="self-consumption"/.test(methodologyHtml), 'methodology.html needs the self-consumption section');
    assert(!/offset household consumption 1:1/.test(methodologyHtml), 'the retired 1:1 offset assumption is still documented');
    assert(methodologyHtml.includes(`monthly_bill − ${SolarConfig.MONTHLY_CUSTOMER_CHARGE}`), 'customer charge drifted from config');
    const R = SolarConfig.INVERTER_REPLACEMENT;
    assert(methodologyHtml.includes(`${Math.round(R.fraction * 100)}% of the kit cost`) && methodologyHtml.includes(`year ${R.year}`),
      'inverter replacement drifted from config');
    const D = SolarConfig.PANEL_DEGRADATION_BY_TIER;
    for (const [tier, rate] of Object.entries(D)) {
      assert(methodologyHtml.includes(`${tier} ${(rate * 100).toFixed(1)}%/yr`), `${tier} degradation drifted from config`);
    }
    assert(/88769/.test(methodologyHtml) && /81314/.test(methodologyHtml), 'degradation citations missing');
    assert(!/87524/.test(methodologyHtml), 'the mis-cited community-solar report is still referenced');
  });

  it('links the live open-data resources', () => {
    assert(/5zhs-2jue/.test(methodologyHtml), 'methodology.html should link the Building Footprints dataset 5zhs-2jue');
    assert(/hn5i-inap/.test(methodologyHtml), 'methodology.html should link the Forestry Tree Points dataset');
    assert(!/nqwf-w8eh/.test(methodologyHtml), 'methodology.html still links the retired footprint dataset id');
  });

  it('carries one modification date across the meta tag, the schema and the visible text', () => {
    const meta = methodologyHtml.match(/article:modified_time" content="([0-9-]+)"/)[1];
    const ld = JSON.parse(methodologyHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    const visible = methodologyHtml.match(/Last reviewed against the code:<\/strong> <time datetime="([0-9-]+)"/)[1];
    assert(meta === ld.dateModified && meta === visible,
      `modification dates disagree: meta ${meta}, schema ${ld.dateModified}, visible ${visible}`);
  });

  it('describes the estimate logging and matches the privacy note on the page', () => {
    assert(/Estimate logging/.test(methodologyHtml), 'methodology.html should have the estimate logging section');
    assert(/street address is not stored/i.test(methodologyHtml), 'methodology.html should say the address is not stored');
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

describe('External API hosts', () => {
  // NREL became the National Laboratory of the Rockies and the nrel.gov zone
  // was withdrawn from DNS. The same API answers at developer.nlr.gov. With
  // the old host every PVWatts call failed and every estimate silently used
  // the fallback formula while the page still claimed an hourly simulation.
  it('calls PVWatts on the live nlr.gov host', () => {
    assert(/^https:\/\/developer\.nlr\.gov\/api\/pvwatts\/v8\.json$/.test(SolarConfig.PVWATTS_URL),
      `PVWATTS_URL points somewhere unexpected: ${SolarConfig.PVWATTS_URL}`);
  });

  it('carries no links to the retired nrel.gov hosts', () => {
    const surfaces = Object.assign({}, ALL_PUBLIC, {
      'README-api-keys.md': read('README-api-keys.md'),
      'js/config.js.example': read('js/config.js.example'),
    });
    for (const [name, text] of Object.entries(surfaces)) {
      assert(!/https?:\/\/[a-z.]*nrel\.gov\//.test(text), `${name} still links to a nrel.gov host`);
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
    assert(/What this estimate used/.test(index), 'the notice should always say what the estimate used');
    assert(/neighborsFailed/.test(index), 'a failed neighbour query must be tracked so it is not scored as open sky');
  });

  it('feeds the shade model every fetched footprint and shows direct sun hours', () => {
    assert(/ShadowModel\.setBuildings\(/.test(index), 'the shade model is never given the fetched footprints');
    assert(/directSunHours/.test(index), 'direct sun hours are computed but never shown');
    assert(/ShadowModel\.floorFromHeight/.test(index), 'the clicked floor should come from the storey height');
  });

  it('discloses the estimate logging next to the address box and logs no street address', () => {
    assert(/class="hero-privacy"/.test(index), 'privacy note missing under the address box');
    assert(/Your street address is not stored/.test(index), 'privacy note should say the address is not stored');
    const insert = index.match(/\.insert\(\{([\s\S]*?)\}\)\.then\(/)[1];
    assert(!/address:/.test(insert), 'the estimates insert still logs the formatted address');
    assert(/bbl:/.test(insert) && /round3\(SolarState\.lat\)/.test(insert), 'the insert should log BBL and rounded coordinates instead');
  });

  it('queries footprints by intersection, not containment', () => {
    const api = read('js/solar-api.js');
    assert(/intersects\(the_geom/.test(api), 'solar-api.js should use intersects() for footprint queries');
    assert(!/within_circle\(the_geom, \$\{lat\}, \$\{lon\}, 200\)/.test(api), 'the containment-only 200 m neighbour query is back');
  });

  it('defers the 3D stack until an address resolves', () => {
    assert(!/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/three@/.test(index),
      'Three.js should not be a blocking script tag');
    assert(/loadSceneStack/.test(index), 'no on-demand scene loader');
  });
});
