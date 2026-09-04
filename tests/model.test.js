// Energy, financial and data-pipeline regression tests.
//
// calculateEstimate is exercised on the client-side fallback path (no
// network in tests), which is the branch a real visitor hits whenever
// PVWatts is unavailable — so it is worth pinning precisely.

const { loadModules, describe, it, assert, near, between } = require('./harness');

const g = loadModules();
const { SolarConfig, SolarAPI, getShadeFactor, getBoroughFromZip, TILT_FACTORS, AZIMUTH_FACTORS } = g;

const BASE = {
  azimuth: 180, tilt: 90, systemWatts: 800,
  floor: 8, totalFloors: 15, shading: 'some',
  monthlyBill: 140, costTier: 'mid', escalationPreset: 'mid',
};

function estimate(overrides = {}) {
  // calculateEstimate is async but the fallback path never awaits a network
  // call, so the promise resolves synchronously enough to unwrap in a test.
  let out = null;
  SolarAPI.calculateEstimate(Object.assign({}, BASE, overrides)).then(r => { out = r; });
  return new Promise(resolve => setImmediate(() => resolve(out)));
}

describe('Config constants match the documented methodology', () => {
  it('uses the 2026 Con Edison marginal rate', () => {
    near(SolarConfig.ELECTRICITY_RATE, 0.34, 0.001, 'electricity rate');
  });
  it('uses the eGRID2023 NYCW CO2 factor', () => {
    near(SolarConfig.CO2_FACTOR, 0.89, 0.001, 'CO2 factor');
  });
  it('keeps the thermal bonus neutral so PVWatts is not double-counted', () => {
    near(SolarConfig.THERMAL_BONUS, 1.0, 0.0001, 'thermal bonus');
  });
  it('derates vertical mounts hardest for railing obstruction', () => {
    const r = SolarConfig.RAILING_OBSTRUCTION_BY_TILT;
    assert(r[90] < r[70] && r[70] < r[60] && r[60] < r[35],
      'railing obstruction should ease as the panel tilts away from the rail');
    between(r[90], 0.92, 0.96, 'vertical railing factor');
  });
  it('prices kits against post-July-2026 retail', () => {
    const c = SolarConfig.SYSTEM_COST_BY_TIER;
    assert(c.budget < c.mid && c.mid < c.premium, 'tiers must be ordered');
    between(c.budget, 600, 1000, 'budget 800W kit');
    between(c.premium, 1400, 1800, 'premium 800W kit');
  });
});

describe('Fallback energy model', () => {
  it('produces a plausible annual yield for a mid-floor south balcony', async () => {
    const r = await estimate();
    between(r.annualKwh, 300, 600, 'annual kWh');
    assert(!r.usedPVWatts, 'tests run on the fallback path');
  });

  it('ranks orientations south > southeast > east > north', async () => {
    const south = (await estimate({ azimuth: 180 })).annualKwh;
    const southeast = (await estimate({ azimuth: 135 })).annualKwh;
    const east = (await estimate({ azimuth: 90 })).annualKwh;
    const north = (await estimate({ azimuth: 0 })).annualKwh;
    assert(south > southeast, 'south beats southeast');
    assert(southeast > east, 'southeast beats east');
    assert(east > north, 'east beats north');
  });

  it('ranks tilts 35 > 60 > 70 > 90 for NYC', async () => {
    const yields = [];
    for (const tilt of [35, 60, 70, 90]) yields.push((await estimate({ tilt })).annualKwh);
    for (let i = 1; i < yields.length; i++) {
      assert(yields[i] < yields[i - 1], `tilt ordering broken at index ${i}`);
    }
  });

  it('scales linearly with system size', async () => {
    const small = (await estimate({ systemWatts: 400 })).annualKwh;
    const large = (await estimate({ systemWatts: 1600 })).annualKwh;
    near(large / small, 4, 0.01, 'yield should scale with capacity');
  });

  it('returns twelve monthly values that sum to the annual total', async () => {
    const r = await estimate();
    assert(r.monthlyKwh.length === 12, 'expected 12 monthly values');
    near(r.monthlyKwh.reduce((s, v) => s + v, 0), r.annualKwh, 0.5, 'monthly sum');
  });

  it('peaks in summer and troughs in winter', async () => {
    const r = await estimate();
    const max = r.monthlyKwh.indexOf(Math.max(...r.monthlyKwh));
    const min = r.monthlyKwh.indexOf(Math.min(...r.monthlyKwh));
    assert(max >= 4 && max <= 7, `expected a summer peak, got month index ${max}`);
    assert(min === 11 || min === 0 || min === 10, `expected a winter trough, got month index ${min}`);
  });

  it('applies the railing derate and reports it', async () => {
    const r = await estimate({ tilt: 90 });
    near(r.railingFactor, SolarConfig.RAILING_OBSTRUCTION_BY_TILT[90], 0.0001, 'railing factor');
  });
});

describe('Static shade factor', () => {
  it('increases monotonically with floor height', () => {
    let prev = -1;
    for (let floor = 1; floor <= 20; floor++) {
      const f = getShadeFactor(floor, 20, 'some');
      assert(f > prev, `shade factor should rise with floor; broke at floor ${floor}`);
      prev = f;
    }
  });

  it('ranks environments open > wide avenue > some > dense', () => {
    const at = s => getShadeFactor(10, 20, s);
    assert(at('open') > at('wide_avenue'), 'open beats wide avenue');
    assert(at('wide_avenue') > at('some'), 'wide avenue beats some');
    assert(at('some') > at('dense'), 'some beats dense');
  });

  it('stays inside each environment band', () => {
    const bands = {
      open: [0.85, 0.97], some: [0.65, 0.94],
      dense: [0.45, 0.87], wide_avenue: [0.70, 0.96],
    };
    for (const [env, [lo, hi]] of Object.entries(bands)) {
      for (let floor = 1; floor <= 40; floor++) {
        between(getShadeFactor(floor, 40, env), lo, hi, `${env} floor ${floor}`);
      }
    }
  });

  it('has no step discontinuities between adjacent floors', () => {
    for (let floor = 1; floor < 40; floor++) {
      const jump = Math.abs(getShadeFactor(floor + 1, 40, 'dense') - getShadeFactor(floor, 40, 'dense'));
      assert(jump < 0.04, `floor ${floor}->${floor + 1} jumped ${jump.toFixed(3)}; the old 4x4 table cliffed here`);
    }
  });

  it('falls back to the "some" band for an unknown environment', () => {
    near(getShadeFactor(10, 20, 'nonsense'), getShadeFactor(10, 20, 'some'), 0.0001, 'unknown env');
  });
});

describe('Financial model', () => {
  it('values savings at the marginal rate', async () => {
    const r = await estimate();
    near(r.annualSavings, r.annualKwh * SolarConfig.ELECTRICITY_RATE, 0.01, 'annual savings');
    near(r.monthlySavings, r.annualSavings / 12, 0.01, 'monthly savings');
  });

  it('excludes the fixed customer charge from inferred consumption', async () => {
    const r = await estimate({ monthlyBill: 140 });
    const billable = 140 - SolarConfig.MONTHLY_CUSTOMER_CHARGE;
    const expectedConsumption = (billable / SolarConfig.ELECTRICITY_RATE) * 12;
    near(r.billOffsetPct, (r.annualKwh / expectedConsumption) * 100, 0.1, 'bill offset');
  });

  it('clamps bill offset to 100% and survives a zero bill', async () => {
    const r = await estimate({ monthlyBill: 0 });
    assert(Number.isFinite(r.billOffsetPct), 'offset must be finite at a $0 bill');
    between(r.billOffsetPct, 0, 100, 'offset percentage');
  });

  it('pays back sooner with escalation than a flat simple payback', async () => {
    const r = await estimate();
    assert(r.escalatedPayback <= r.simplePayback + 0.001,
      `escalated payback (${r.escalatedPayback.toFixed(2)}) should not exceed simple (${r.simplePayback.toFixed(2)})`);
  });

  it('keeps npvPayback as an alias of escalatedPayback', async () => {
    const r = await estimate();
    near(r.npvPayback, r.escalatedPayback, 0.0001, 'alias');
  });

  it('grows lifetime value with the escalation preset', async () => {
    const low = (await estimate({ escalationPreset: 'low' })).lifetimeSavings;
    const mid = (await estimate({ escalationPreset: 'mid' })).lifetimeSavings;
    const high = (await estimate({ escalationPreset: 'high' })).lifetimeSavings;
    assert(low < mid && mid < high, 'lifetime value should rise with escalation');
  });

  it('degrades budget panels fastest', async () => {
    const budget = (await estimate({ costTier: 'budget' })).panelDegradation;
    const premium = (await estimate({ costTier: 'premium' })).panelDegradation;
    assert(budget > premium, 'budget panels degrade faster');
  });

  it('scales cost linearly from the 800W reference', async () => {
    const r = await estimate({ systemWatts: 1600, costTier: 'mid' });
    near(r.adjustedCost, SolarConfig.SYSTEM_COST_BY_TIER.mid * 2, 0.01, 'adjusted cost');
  });

  it('produces a lifetime total above the up-front cost for a viable case', async () => {
    const r = await estimate({ azimuth: 180, floor: 14, totalFloors: 15, shading: 'open' });
    assert(r.lifetimeSavings > r.adjustedCost,
      'a top-floor south balcony should beat its cost over 25 years');
  });
});

describe('Environmental model', () => {
  it('uses the eGRID factor and EPA equivalences', async () => {
    const r = await estimate();
    near(r.co2Lbs, r.annualKwh * 0.89, 0.01, 'CO2 lbs');
    near(r.treesEquiv, r.co2Lbs / 48, 0.01, 'tree equivalent');
    near(r.milesOffset, r.co2Lbs / 0.89, 0.01, 'miles offset');
  });
});

describe('Borough ZIP mapping', () => {
  it('maps 104xx to the Bronx, not Staten Island', () => {
    assert(getBoroughFromZip('10451') === 'bronx', '104xx is the Bronx');
  });
  it('maps the other borough prefixes correctly', () => {
    assert(getBoroughFromZip('10001') === 'manhattan', '100xx Manhattan');
    assert(getBoroughFromZip('10301') === 'staten island', '103xx Staten Island');
    assert(getBoroughFromZip('11201') === 'brooklyn', '112xx Brooklyn');
    assert(getBoroughFromZip('11101') === 'queens', '111xx Queens');
  });
  it('rejects Long Island 110xx, which is not a borough', () => {
    assert(getBoroughFromZip('11001') === null, '110xx must not resolve to a borough');
  });
  it('returns null for junk input', () => {
    assert(getBoroughFromZip('') === null && getBoroughFromZip(null) === null, 'null-safe');
  });
});

describe('Orientation detection', () => {
  // A rectangle 100m east-west by 30m north-south at NYC latitude. In raw
  // degrees the longitude side looks shorter than it is; the model must
  // scale by cos(lat) before comparing edges or computing bearings.
  const LAT = 40.7128;
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos(LAT * Math.PI / 180);

  function rect(widthM, depthM, rotationDeg = 0) {
    const pts = [[-widthM / 2, -depthM / 2], [widthM / 2, -depthM / 2],
                 [widthM / 2, depthM / 2], [-widthM / 2, depthM / 2]];
    const rot = rotationDeg * Math.PI / 180;
    return pts.concat([pts[0]]).map(([x, y]) => {
      const rx = x * Math.cos(rot) - y * Math.sin(rot);
      const ry = x * Math.sin(rot) + y * Math.cos(rot);
      return [-73.996 + rx / mPerDegLon, LAT + ry / mPerDegLat];
    });
  }

  it('reads north/south primary facades off an east-west building', () => {
    const o = SolarAPI.detectOrientation(rect(100, 30));
    assert(o.primaryDirections.includes(180) && o.primaryDirections.includes(0),
      `expected N/S primary facades, got ${JSON.stringify(o.primaryDirections)}`);
    assert(o.bestDirection === 180, `should prefer the south facade, got ${o.bestDirection}`);
  });

  it('does not mistake a north-south building for an east-west one', () => {
    // 100m north-south by 30m east-west: the long walls face east and west.
    // Unscaled longitude deltas made this building look east-west instead.
    const o = SolarAPI.detectOrientation(rect(30, 100));
    assert(o.primaryDirections.includes(90) && o.primaryDirections.includes(270),
      `expected E/W primary facades, got ${JSON.stringify(o.primaryDirections)} — this is the cos(lat) bug`);
  });

  it('measures edge length in metres, not raw degrees', () => {
    // A square in metres must not read as elongated after projection.
    const o = SolarAPI.detectOrientation(rect(60, 60));
    assert(o.confidence === 'medium', `a true square should be medium confidence, got ${o.confidence}`);
  });

  it('reads the Manhattan grid rotation off the polygon', () => {
    // Manhattan's grid runs ~29 degrees east of north.
    const o = SolarAPI.detectOrientation(rect(100, 30, 29));
    assert(o.allDirections.includes(225) || o.allDirections.includes(45),
      `expected the rotated facades to snap to SW/NE, got ${JSON.stringify(o.allDirections)}`);
  });

  it('reports high confidence for a clearly elongated building', () => {
    const o = SolarAPI.detectOrientation(rect(120, 25));
    assert(o.confidence === 'high', `a 120x25 building should be high confidence, got ${o.confidence}`);
  });

  it('reports medium confidence for a near-square building', () => {
    const o = SolarAPI.detectOrientation(rect(50, 48));
    assert(o.confidence === 'medium', `a near-square building should be medium, got ${o.confidence}`);
  });

  it('returns null for degenerate input', () => {
    assert(SolarAPI.detectOrientation(null) === null, 'null input');
    assert(SolarAPI.detectOrientation([[0, 0], [1, 1]]) === null, 'too few vertices');
  });
});

describe('SoQL escaping', () => {
  it('escapes apostrophes so addresses like "O\'Neill St" cannot break the query', () => {
    assert(g.soqlEscape("O'NEILL ST") === "O''NEILL ST", 'single quote must be doubled');
  });
  it('leaves ordinary values untouched', () => {
    assert(g.soqlEscape('1000480001') === '1000480001', 'plain BBL unchanged');
  });
});

describe('NYC building lookup disambiguation', () => {
  it('normalizes the reported 222 N 7th St address to PLUTO spelling', () => {
    assert(SolarAPI.normalizePLUTOAddress('222 N 7th St, Brooklyn, NY 11211') === '222 NORTH 7 STREET',
      'Google abbreviations and ordinal suffixes should match PLUTO');
    assert(SolarAPI.normalizePLUTOAddress('123 St Marks Pl') === '123 ST MARKS PLACE',
      'a saint name must not be rewritten as a street type');
    assert(SolarAPI.normalizePLUTOAddress('1307 Ave N') === '1307 AVENUE N',
      'a lettered avenue must not be rewritten as a compass direction');
    assert(SolarAPI.normalizePLUTOAddress('100 W 42nd St') === '100 WEST 42 STREET',
      'a direction immediately after the house number should still expand');
  });

  it('chooses the closest tax lot when an address has multiple records', () => {
    const records = [
      {
        address: '222 NORTH 7 STREET', bbl: '3023230011.00000000', numfloors: '11.0000000',
        latitude: '40.71820', longitude: '-73.95100',
      },
      {
        address: '222 NORTH 7 STREET', bbl: '3023290012.00000000', numfloors: '3.0000000',
        latitude: '40.7166514', longitude: '-73.9561887',
      },
    ];
    const selected = SolarAPI.selectPLUTORecord(
      records, 40.71665, -73.95619, '222 NORTH 7 STREET'
    );
    assert(selected.bbl.startsWith('3023290012'),
      `expected the three-floor tax lot, got ${selected.bbl}`);
    assert(SolarAPI.normalizeBBL(selected.bbl) === '3023290012',
      'PLUTO decimal BBLs should match ten-digit footprint BBLs');
  });

  it('selects the footprint containing the geocoded point, not the first radius result', () => {
    const far = {
      properties: { bin: 'wrong' },
      geometry: { type: 'Polygon', coordinates: [[
        [-73.9570, 40.7170], [-73.9569, 40.7170],
        [-73.9569, 40.7171], [-73.9570, 40.7171], [-73.9570, 40.7170],
      ]] },
    };
    const target = {
      properties: { bin: '3062111', mappluto_bbl: '3023290012' },
      geometry: { type: 'MultiPolygon', coordinates: [
        [[
          [-73.9580, 40.7180], [-73.9579, 40.7180],
          [-73.9579, 40.7181], [-73.9580, 40.7181], [-73.9580, 40.7180],
        ]],
        [[
          [-73.95625, 40.71660], [-73.95610, 40.71660],
          [-73.95610, 40.71672], [-73.95625, 40.71672], [-73.95625, 40.71660],
        ]],
      ] },
    };
    const selected = SolarAPI.selectFootprint([far, target], 40.7166514, -73.9561887);
    assert(selected.properties.bin === '3062111', 'the containing footprint should win');
    assert(SolarAPI.footprintContainsPoint(selected, 40.7166514, -73.9561887),
      'the selected footprint should be recognized as an authoritative containment match');
    const selectedRing = SolarAPI.selectFootprintRing(selected, 40.7166514, -73.9561887);
    assert(selectedRing[0][0] === -73.95625,
      'a later matching MultiPolygon part should be rendered instead of part one');
  });

  it('treats courtyard holes and polygon boundaries consistently', () => {
    const enclosing = {
      properties: { bin: 'courtyard-shell' },
      geometry: { type: 'Polygon', coordinates: [
        [[-0.001, -0.001], [0.001, -0.001], [0.001, 0.001], [-0.001, 0.001], [-0.001, -0.001]],
        [[-0.0002, -0.0002], [0.0002, -0.0002], [0.0002, 0.0002], [-0.0002, 0.0002], [-0.0002, -0.0002]],
      ] },
    };
    const courtyardBuilding = {
      properties: { bin: 'inside-courtyard' },
      geometry: { type: 'Polygon', coordinates: [[
        [-0.0001, -0.0001], [0.0001, -0.0001],
        [0.0001, 0.0001], [-0.0001, 0.0001], [-0.0001, -0.0001],
      ]] },
    };
    assert(!SolarAPI.footprintContainsPoint(enclosing, 0, 0),
      'a point inside an interior hole is not inside the enclosing footprint');
    const selected = SolarAPI.selectFootprint([enclosing, courtyardBuilding], 0, 0);
    assert(selected.properties.bin === 'inside-courtyard',
      'a building inside the courtyard should win over the surrounding shell');
    assert(SolarAPI.footprintContainsPoint(enclosing, 0, 0.001),
      'a point exactly on the exterior boundary should count consistently');
    assert(SolarAPI.footprintContainsPoint(enclosing, 0, 0.0002),
      'a point exactly on a hole boundary should count consistently');
  });

  it('keeps a balcony floor within a coherent building count', () => {
    assert(SolarAPI.resolveFloorCount(3, 37.59) === 3, 'preserve the coherent PLUTO count');
    assert(SolarAPI.resolveFloorCount(11, 37.59) === 3,
      'reject eleven floors inside a 37.59-foot footprint');
    assert(SolarAPI.resolveFloorCount(null, 37.59) === 3,
      'roof height provides a safe fallback when PLUTO is unavailable');
    assert(SolarAPI.resolveMatchedFloorCount(10, 24, '3000000001', '3000000002', false) === 10,
      'an untrusted neighboring footprint must not override a valid PLUTO count');
    assert(SolarAPI.resolveMatchedFloorCount(11, 37.59, '3023290012', '3023290012', false) === 3,
      'a matching footprint may reject a physically impossible PLUTO count');
    assert(SolarAPI.floorFromHeightRatio(1 / 6, 3) === 1, 'lower third maps to floor one');
    assert(SolarAPI.floorFromHeightRatio(1 / 2, 3) === 2, 'middle third maps to floor two');
    assert(SolarAPI.floorFromHeightRatio(5 / 6, 3) === 3, 'upper third maps to floor three');
    assert(SolarAPI.floorFromHeightRatio(1, 3) === 3, 'roof line clamps to the top floor');
  });
});

describe('PVWatts request construction', () => {
  it('offers a soiling-format fallback chain so one bad param cannot kill the call', () => {
    assert(Array.isArray(SolarAPI.SOILING_MONTHLY) && SolarAPI.SOILING_MONTHLY.length === 12,
      'twelve monthly soiling values');
    const mean = SolarAPI.SOILING_MONTHLY.reduce((s, v) => s + v, 0) / 12;
    between(mean, 3, 7, 'mean soiling percent should match the documented urban range');
  });

  it('folds soiling into losses consistently when the array cannot be sent', () => {
    const mean = SolarAPI.SOILING_MONTHLY.reduce((s, v) => s + v, 0) / 12 / 100;
    const combined = (1 - (1 - 0.14) * (1 - mean)) * 100;
    near(parseFloat(SolarAPI.LOSSES_WITH_SOILING), combined, 0.5, 'combined loss');
  });

  it('uses a micro-inverter-appropriate DC:AC ratio', () => {
    g.SolarState.lat = 40.7; g.SolarState.lon = -74.0;
    const p = SolarAPI._pvwattsBaseParams({ systemCapacity: 0.8, tilt: 90, azimuth: 180 });
    between(parseFloat(p.dc_ac_ratio), 1.0, 1.15, 'dc_ac_ratio for a 1-2 module system');
    assert(p.array_type === '0', 'open rack pairs with THERMAL_BONUS 1.0');
  });
});
