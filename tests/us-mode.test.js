// US-mode tests: the calculator outside New York City.
//
// Outside the five boroughs there is no PLUTO and no building footprints,
// so the visitor describes what stands opposite and the model synthesises a
// street canyon. Everything else — sun position, rate, grid factor, legal
// line — comes from the location. These tests pin the pieces that are easy
// to get subtly wrong: routing, the canyon geometry, the sun away from NYC,
// and the money arithmetic when the rate is an average rather than marginal.

const { loadModules, describe, it, assert, near, between, box } = require('./harness');

const g = loadModules();
const { Regions, CalcParams, SunPosition, ShadowModel, SolarConfig } = g;

// Google address_components, trimmed to the fields Regions reads.
function place({ state, county, sublocality, zip }) {
  const c = [];
  if (sublocality) c.push({ long_name: sublocality, short_name: sublocality, types: ['sublocality_level_1', 'sublocality', 'political'] });
  if (county) c.push({ long_name: county, short_name: county, types: ['administrative_area_level_2', 'political'] });
  if (state) c.push({ long_name: state, short_name: state, types: ['administrative_area_level_1', 'political'] });
  if (zip) c.push({ long_name: zip, short_name: zip, types: ['postal_code'] });
  return c;
}

describe('Regions — which model an address gets', () => {
  it('routes all five boroughs to the NYC model', () => {
    for (const county of ['New York County', 'Kings County', 'Queens County', 'Bronx County', 'Richmond County']) {
      assert(Regions.isNYC(place({ state: 'NY', county })), `${county} should be NYC`);
    }
  });

  it('routes Far Rockaway (Queens) to NYC', () => {
    assert(Regions.isNYC(place({ state: 'NY', county: 'Queens County', sublocality: 'Queens', zip: '11691' })));
  });

  it('accepts a borough sublocality when Google omits the county', () => {
    assert(Regions.isNYC(place({ state: 'NY', sublocality: 'Brooklyn', zip: '11215' })));
  });

  it('sends the New Jersey towns inside the old NYC rectangle to US mode', () => {
    // The retired NYC_BOUNDS box contained all three, so they used to be
    // modelled with PLUTO and billed at Con Edison rates.
    for (const county of ['Hudson County', 'Essex County']) {
      assert(!Regions.isNYC(place({ state: 'NJ', county })), `${county}, NJ must not be NYC`);
    }
  });

  it('sends Yonkers and Long Island to US mode', () => {
    assert(!Regions.isNYC(place({ state: 'NY', county: 'Westchester County' })), 'Yonkers');
    assert(!Regions.isNYC(place({ state: 'NY', county: 'Nassau County' })), 'Hempstead');
  });

  it('reads the state code and a five-digit ZIP', () => {
    const c = place({ state: 'IL', county: 'Cook County', zip: '60614-1234' });
    assert(Regions.stateCode(c) === 'IL', 'state code');
    assert(Regions.zip(c) === '60614', 'zip');
    assert(Regions.stateCode(place({ state: 'PR' })) === null, 'territories are not states');
  });
});

describe('Street canyon — described surroundings become a horizon', () => {
  const DEG = Math.PI / 180;
  const canyon = (o) => ShadowModel.synthesizeStreetCanyon(Object.assign(
    { facadeAzimuthDeg: 180, balconyHeightM: 4, obstructionHeightM: 20, distanceM: 20 }, o));

  it('is completely open when nothing opposite is taller than the balcony', () => {
    const p = canyon({ obstructionHeightM: 3 });
    assert(Array.from(p).every(b => b === -Math.PI / 2), 'every bin should be open');
  });

  it('rises to atan(rise / distance) straight ahead', () => {
    const p = canyon({});
    near(p[ShadowModel._binOf(180 * DEG)], Math.atan(16 / 20), 0.01, 'beta at the facade normal');
  });

  it('falls away as cos(phi) toward the ends of the street', () => {
    const p = canyon({});
    near(p[ShadowModel._binOf(240 * DEG)], Math.atan(16 * Math.cos(60 * DEG) / 20), 0.01, 'beta at 60 degrees off-normal');
  });

  it('records nothing behind the facade', () => {
    const p = canyon({});
    assert(p[ShadowModel._binOf(0)] === -Math.PI / 2, 'the view behind the building is not an obstruction');
  });

  it('agrees with the 3D horizon model on an equivalent long building', () => {
    // A 400 m block 20 m away stands in for the canyon's infinite wall. The
    // two code paths must produce the same skyline across the street. The 3D
    // path samples a facade every 2 m, which can skip a 1-degree bin where
    // the wall is closest, so each bin is compared with its neighbours.
    const g3 = loadModules({ buildingMeshes: [{ isTarget: true }, box(0, 30, 400, 20, 20)] });
    g3.ShadowModel.targetBalconyPoint = new g3.THREE.Vector3(0, 4, 0);
    const real = g3.ShadowModel.buildHorizonProfile();
    const synth = canyon({});
    for (const az of [150, 165, 180, 195, 210]) {
      const b = ShadowModel._binOf(az * DEG);
      const seen = Math.max(real[b - 1], real[b], real[b + 1]);
      near(seen, synth[b], 1 * DEG, `horizon at ${az} degrees`);
    }
  });
});

describe('Street canyon — shade factor', () => {
  function shade({ azimuthDeg = 180, floor = 2, across = 'mid', distance = 'street', tilt = 90 } = {}) {
    const m = loadModules().ShadowModel;
    const h = Regions.balconyHeightM(floor);
    const horizon = m.synthesizeStreetCanyon({
      facadeAzimuthDeg: azimuthDeg, balconyHeightM: h,
      obstructionHeightM: Regions.ACROSS[across].heightM,
      distanceM: Regions.DISTANCE[distance].distanceM,
    });
    m.initSynthetic({ azimuthDeg, balconyHeightM: h, horizonProfile: horizon, floor });
    return m.computeAnnualShadeProfile(tilt).annualShadeFactor;
  }

  it('returns ~1.00 for an open view at every orientation and tilt', () => {
    for (const az of [0, 45, 90, 135, 180, 225, 270, 315]) {
      for (const tilt of [90, 70, 60, 35]) {
        between(shade({ azimuthDeg: az, across: 'none', tilt }), 0.99, 1.0, `open, ${az} deg, tilt ${tilt}`);
      }
    }
  });

  it('shades more as the building opposite gets taller', () => {
    const f = ['low', 'mid', 'tall', 'tower'].map(a => shade({ across: a }));
    for (let i = 1; i < f.length; i++) assert(f[i] <= f[i - 1] + 1e-9, `shade should not ease as height rises: ${f}`);
    assert(f[3] < f[0], 'a tower should shade more than a two-storey building');
  });

  it('shades less as the building opposite gets further away', () => {
    const f = ['alley', 'street', 'wide', 'far'].map(d => shade({ across: 'tall', distance: d }));
    for (let i = 1; i < f.length; i++) assert(f[i] >= f[i - 1] - 1e-9, `shade should ease with distance: ${f}`);
  });

  it('shades less the higher the floor', () => {
    const f = [1, 3, 6, 9].map(floor => shade({ across: 'tall', floor }));
    for (let i = 1; i < f.length; i++) assert(f[i] >= f[i - 1] - 1e-9, `shade should ease with floor: ${f}`);
  });
});

describe('Sun position away from New York', () => {
  function noonAltitude(lat, lon, month = 5) {
    SunPosition.setLocation({ lat, lon });
    const alt = SunPosition.calculate(month, 720).altitudeDeg;
    return alt;
  }

  it('puts the June noon sun where the latitude says it should be', () => {
    // 90 - latitude + declination (+23.3 on June 15)
    near(noonAltitude(33.45, -112.07), 90 - 33.45 + 23.3, 1.0, 'Phoenix');
    near(noonAltitude(47.61, -122.33), 90 - 47.61 + 23.3, 1.0, 'Seattle');
    near(noonAltitude(61.22, -149.90), 90 - 61.22 + 23.3, 1.0, 'Anchorage');
  });

  it('has the June noon sun to the north in Honolulu', () => {
    SunPosition.setLocation({ lat: 21.31, lon: -157.86 });
    const az = SunPosition.calculate(5, 720).azimuthDeg;
    assert(az < 30 || az > 330, `Honolulu June noon azimuth should be near north, got ${az.toFixed(1)}`);
  });

  it('covers the whole Anchorage June day', () => {
    SunPosition.setLocation({ lat: 61.22, lon: -149.90 });
    const b = SunPosition.getDayBounds(5);
    assert(b.sunset - b.sunrise > 18 * 60, `Anchorage June daylight should exceed 18 h, got ${(b.sunset - b.sunrise) / 60}`);
  });

  it('restores NYC clock time with null', () => {
    SunPosition.setLocation(null);
    assert(SunPosition.LAT === 40.7128 && !SunPosition.useSolarTime, 'NYC defaults restored');
  });
});

describe('Estimate — money outside New York', () => {
  const REGION = {
    mode: 'us', stateCode: 'IL', electricityRate: 0.18, monthlyCustomerCharge: 0,
    co2Factor: 0.75, rateSource: 'eia_state_avg',
  };
  const PVW = { outputs: { ac_annual: 600, ac_monthly: [30, 35, 45, 55, 65, 70, 72, 65, 55, 45, 33, 30] } };

  function run(inputs, fetchImpl) {
    const m = loadModules({ fetch: fetchImpl || (async () => ({ ok: true, status: 200, json: async () => PVW })) });
    m.SolarState.lat = 41.88; m.SolarState.lon = -87.63;
    return m.SolarAPI.calculateEstimate(Object.assign({
      azimuth: 180, tilt: 90, systemWatts: 800, floor: 3, totalFloors: null,
      shading: 'some', monthlyBill: 90, costTier: 'mid', escalationPreset: 'mid',
      region: REGION,
    }, inputs)).then(r => ({ r, m }));
  }

  it('values savings at the region rate', async () => {
    const { r } = await run({});
    near(r.annualSavings, r.annualKwh * 0.18, 0.01, 'savings = kWh x region rate');
    assert(r.mode === 'us' && r.rateSource === 'eia_state_avg', 'result reports its basis');
  });

  it('lets a rate from the bill override the regional average', async () => {
    const { r } = await run({ rateCents: 25 });
    near(r.annualSavings, r.annualKwh * 0.25, 0.01, 'override rate');
    assert(r.rateSource === 'user', 'result records the override');
  });

  it('infers use from the bill without subtracting a customer charge', async () => {
    const { r } = await run({ monthlyBill: 90 });
    near(r.billOffsetPct, r.annualKwh / (90 / 0.18 * 12) * 100, 0.01, 'offset from bill / average rate');
  });

  it('uses the region grid factor, and the car-mile constant stays 0.89', async () => {
    const { r } = await run({});
    near(r.co2Lbs, r.annualKwh * 0.75, 0.01, 'CO2 from the region factor');
    near(r.milesOffset, r.co2Lbs / 0.89, 0.01, 'car miles');
  });

  it('shows no CO2 figures rather than borrowing New York’s grid', async () => {
    const { r } = await run({ region: Object.assign({}, REGION, { co2Factor: null }) });
    assert(r.co2Lbs === null && r.milesOffset === null, 'CO2 should be null without a grid factor');
  });

  it('refuses to guess when PVWatts is down outside NYC', async () => {
    let err = null;
    await run({}, async () => { throw new Error('offline'); }).catch(e => { err = e; });
    assert(err && err.code === 'PVWATTS_UNAVAILABLE', 'US mode must not fall back to NYC sun constants');
  });

  it('falls back to the state\u2019s published PVWatts run, not NYC constants', async () => {
    const monthly = [30, 35, 45, 55, 65, 70, 72, 65, 55, 45, 33, 30];
    const fallback = { city: 'Chicago', monthly: { '90_180': monthly, '90_90': monthly.map(v => v / 2), '35_180': monthly.map(v => v * 1.5) } };
    const open = { monthlyShadeFactors: new Array(12).fill(1), annualShadeFactor: 1 };
    const offline = async () => { throw new Error('offline'); };
    const { r } = await run({ shadeProfile: open, region: Object.assign({}, REGION, { fallback }) }, offline);
    const rail = 0.95;
    assert(!r.usedPVWatts && r.fallbackCity === 'Chicago', 'result should say it used the state fallback');
    assert(Math.abs(r.annualKwh - monthly.reduce((a, b) => a + b) * rail) < 1e-6, `unshaded south: ${r.annualKwh}`);
    const east = (await run({ azimuth: 90, shadeProfile: open, region: Object.assign({}, REGION, { fallback }) }, offline)).r;
    assert(Math.abs(east.annualKwh - monthly.reduce((a, b) => a + b) / 2 * rail) < 1e-6, 'east uses the east run');
    const tilted = (await run({ azimuth: 90, tilt: 35, shadeProfile: open, region: Object.assign({}, REGION, { fallback }) }, offline)).r;
    assert(tilted.annualKwh > east.annualKwh, 'an east panel at 35 degrees is scaled from the east run by the south tilt ratio');
  });

  it('asks PVWatts once for the same place and panel', async () => {
    let calls = 0;
    const counting = async () => { calls++; return { ok: true, status: 200, json: async () => PVW }; };
    const { m } = await run({}, counting);
    await m.SolarAPI.calculateEstimate({
      azimuth: 180, tilt: 90, systemWatts: 800, floor: 3, shading: 'some',
      monthlyBill: 90, costTier: 'mid', region: REGION,
    });
    assert(calls === 1, `expected one PVWatts call for a repeated estimate, got ${calls}`);
  });
});

describe('Region profiles and legal copy', () => {
  const DATA = {
    energy: { period_label: '12 months to June 2026', states: { IL: { cents: 18.1, avg_monthly_kwh: 700 } } },
    grid: { zip3: { 606: 'RFCW' }, subregions: { RFCW: { name: 'RFC West', co2_lb_per_mwh: 1000 } } },
    status: { states: { IL: { status: 'pending', bills: [{ id: 'HB 1234' }] } } },
  };

  it('keeps the NYC profile identical to the config the model always used', () => {
    const p = Regions.nycProfile();
    assert(p.electricityRate === SolarConfig.ELECTRICITY_RATE, 'rate');
    assert(p.monthlyCustomerCharge === SolarConfig.MONTHLY_CUSTOMER_CHARGE, 'customer charge');
    assert(p.co2Factor === SolarConfig.CO2_FACTOR, 'grid factor');
  });

  it('builds a US profile from state rate, ZIP3 grid and state status', () => {
    const p = Regions.usProfile('IL', '60614', DATA);
    near(p.electricityRate, 0.181, 1e-9, 'rate from cents');
    assert(p.monthlyCustomerCharge === 0, 'no customer charge on an average price');
    near(p.co2Factor, 1.0, 1e-9, 'lb/MWh to lb/kWh');
    assert(p.legal.status === 'pending', 'legal entry attached');
    assert(p.defaultMonthlyBill > 0, 'default bill from average use');
  });

  it('has no profile, rather than a wrong one, for a state without rate data', () => {
    assert(Regions.usProfile('ZZ', null, DATA) === null);
  });

  it('never words an unreviewed state as permission', () => {
    const text = Regions.legalCopy(null, 'Ohio');
    assert(/have not reviewed/i.test(text) && !/legal|allowed|permitted/i.test(text), text);
  });

  it('words every status without claiming more than the status says', () => {
    for (const status of ['in_force', 'enacted_not_yet_effective', 'passed_awaiting_signature', 'pending', 'failed_or_vetoed', 'no_specific_law']) {
      const text = Regions.legalCopy({ status, bills: [{ id: 'X 1' }] }, 'Texas');
      assert(text.length > 30, `${status} copy missing`);
      if (status !== 'in_force' && status !== 'enacted_not_yet_effective') {
        assert(/approval|signature/i.test(text), `${status} should say approval is still needed: ${text}`);
      }
    }
  });
});

describe('Calculator links', () => {
  it('round-trips a complete link', () => {
    const q = 'address=350+5th+Ave,+New+York,+NY&floor=12&facing=south&across=tall&distance=street&tilt=90&watts=800&bill=140&rate=34';
    const p = CalcParams.parse(q);
    assert(p.address === '350 5th Ave, New York, NY', `address parsed as ${p.address}`);
    assert(p.floor === 12 && p.facing === 180 && p.across === 'tall' && p.distance === 'street', JSON.stringify(p));
    assert(CalcParams.isComplete(p), 'complete');
    const again = CalcParams.parse(CalcParams.toQuery(p));
    assert(JSON.stringify(again) === JSON.stringify(p), `round trip changed ${JSON.stringify(again)}`);
  });

  it('waits for a click when the link does not say what stands opposite', () => {
    assert(!CalcParams.isComplete(CalcParams.parse('address=1+Main+St,+Austin,+TX&floor=2&facing=south')),
      'a link without across must not auto-run');
  });

  it('accepts facing as a letter, a word or degrees', () => {
    for (const [v, want] of [['s', 180], ['South', 180], ['180', 180], ['NE', 45], ['north-west', 315], ['100', 90]]) {
      assert(CalcParams.parse('facing=' + encodeURIComponent(v)).facing === want, `facing=${v}`);
    }
  });

  it('drops out-of-range and unknown values', () => {
    const p = CalcParams.parse('floor=0&tilt=45&watts=3&bill=5&rate=500&across=castle&evil=1');
    assert(Object.keys(p).length === 0, `nothing valid should survive: ${JSON.stringify(p)}`);
  });

  it('caps the address and strips markup characters', () => {
    assert(!CalcParams.parse('address=' + 'a'.repeat(201)).address, 'over-long address rejected');
    const p = CalcParams.parse('address=' + encodeURIComponent('<script>1 Main St</script>'));
    assert(p.address && !/[<>]/.test(p.address), `markup survived: ${p.address}`);
  });
});

// Leave the shared sun model where the other suites expect it.
SunPosition.setLocation(null);
