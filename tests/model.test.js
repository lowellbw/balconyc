// Energy, financial and data-pipeline regression tests.
//
// calculateEstimate is exercised without a network, which puts it on the
// offline PVWatts table plus the canonical-canyon shade path: exactly what a
// visitor gets when the live API is unreachable, so it is worth pinning.

const { loadModules, describe, it, itAsync, assert, near, between } = require('./harness');

const g = loadModules();
const { SolarConfig, SolarAPI, getBoroughFromZip, PVWattsTableNYC } = g;

const BASE = {
  azimuth: 180, tilt: 90, systemWatts: 800, inverterWatts: 800,
  floor: 8, totalFloors: 15, shading: 'some', mountType: 'rail', occupancy: 'base',
  monthlyBill: 140, costTier: 'mid', escalationPreset: 'mid',
};

function estimate(overrides = {}) {
  return SolarAPI.calculateEstimate(Object.assign({}, BASE, overrides));
}

describe('Config constants match the documented methodology', () => {
  it('uses the 2026 Con Edison marginal rate and customer charge', () => {
    near(SolarConfig.ELECTRICITY_RATE, 0.35, 0.001, 'electricity rate');
    near(SolarConfig.MONTHLY_CUSTOMER_CHARGE, 21, 0.001, 'customer charge');
  });
  it('uses the eGRID2023 NYCW CO2 factor and the EPA 2024 equivalencies', () => {
    near(SolarConfig.CO2_FACTOR, 0.86, 0.001, 'CO2 factor');
    near(SolarConfig.CO2_PER_TREE_LB, 132, 1, 'lb CO2 per urban tree-year');
    near(SolarConfig.CAR_LB_PER_MILE, 0.88, 0.01, 'lb CO2 per mile');
    near(SolarConfig.PHONE_CHARGE_KWH, 0.019, 0.0001, 'kWh per phone charge');
  });
  it('sends kit-appropriate PVWatts parameters', () => {
    const P = SolarConfig.PVWATTS_PARAMS;
    near(P.losses, 9, 0.001, 'losses bundle without soiling or shading');
    near(P.gcr, 0.01, 0.0001, 'no phantom row in front of a single panel');
    assert(P.use_wf_albedo === 1, 'weather-file albedo');
    assert(P.array_type === 0 && P.module_type === 1, 'open rack, premium module');
    const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
    between(mean(P.soiling_vertical), 1, 3, 'vertical soiling mean %');
    between(mean(P.soiling_tilted), 2, 4, 'tilted soiling mean %');
    assert(mean(P.soiling_vertical) < mean(P.soiling_tilted), 'vertical panels soil less');
  });
  it('derates vertical mounts hardest for railing obstruction', () => {
    const r = SolarConfig.RAILING_OBSTRUCTION_BY_TILT;
    assert(r[90] < r[70] && r[70] < r[60] && r[60] < r[35], 'railing obstruction should ease as the panel tilts away from the rail');
    between(r[90], 0.92, 0.96, 'vertical railing factor');
  });
  it('orders the cost and degradation tiers', () => {
    const c = SolarConfig.SYSTEM_COST_BY_TIER;
    assert(c.budget < c.mid && c.mid < c.premium, 'cost tiers must be ordered');
    const d = SolarConfig.PANEL_DEGRADATION_BY_TIER;
    assert(d.premium < d.mid && d.mid < d.budget, 'budget panels degrade fastest');
    between(d.mid, 0.005, 0.0075, 'mid-tier system degradation within the fleet median range');
  });
  it('budgets an inverter replacement inside the 25-year horizon', () => {
    const r = SolarConfig.INVERTER_REPLACEMENT;
    between(r.year, 10, 15, 'replacement year matches kit inverter warranties');
    between(r.fraction, 0.2, 0.4, 'replacement cost share');
  });
});

describe('Offline PVWatts table', () => {
  it('was generated with the parameters the app sends', () => {
    const T = PVWattsTableNYC;
    near(T.params.losses, SolarConfig.PVWATTS_PARAMS.losses, 0.001, 'losses');
    near(T.params.gcr, SolarConfig.PVWATTS_PARAMS.gcr, 0.0001, 'gcr');
    assert(T.tilts.length === 4 && T.azimuths.length === 8, '4 x 8 grid');
    for (const t of T.tilts) for (const a of T.azimuths) {
      const s = T.monthlyShare[t][a];
      near(s.reduce((x, y) => x + y, 0), 1, 0.002, `shares sum to 1 at ${t}/${a}`);
    }
  });
  it('ranks south above the other azimuths and shallow above steep tilts', () => {
    const T = PVWattsTableNYC;
    for (const t of T.tilts) {
      assert(T.kwhPerKw[t][180] >= Math.max(...T.azimuths.map(a => T.kwhPerKw[t][a])), `south best at tilt ${t}`);
    }
    assert(T.kwhPerKw[35][180] > T.kwhPerKw[60][180] && T.kwhPerKw[60][180] > T.kwhPerKw[70][180] && T.kwhPerKw[70][180] > T.kwhPerKw[90][180], 'tilt ordering');
    between(T.kwhPerKw[35][180], 1300, 1550, 'NYC optimal-tilt yield with kit losses');
    between(T.kwhPerKw[90][180], 850, 1000, 'NYC vertical south yield with kit losses');
  });
  it('gives a vertical south panel a winter-heavy year and a tilted one a summer peak', () => {
    const T = PVWattsTableNYC;
    const v = T.monthlyShare[90][180], t = T.monthlyShare[35][180];
    assert(v[0] > v[5] * 1.8, 'vertical south: January well above June');
    assert(t[6] > t[0], 'tilted south: July above January');
  });
  it('interpolates between the 45-degree azimuths', () => {
    const s = SolarAPI.tableYield(90, 180), sw = SolarAPI.tableYield(90, 225), mid = SolarAPI.tableYield(90, 202.5);
    near(mid.kwhPerKw, (s.kwhPerKw + sw.kwhPerKw) / 2, 0.01, 'midpoint yield');
    near(mid.monthlyShare.reduce((a, b) => a + b, 0), 1, 1e-6, 'interpolated shares normalised');
    assert(SolarAPI.tableYield(90, 359).kwhPerKw < SolarAPI.tableYield(90, 350).kwhPerKw + 5, 'wraps through north');
  });
  it('models inverter clipping only for arrays larger than their inverter', () => {
    near(SolarAPI.dcAcRatio(800, 800), 1.0, 1e-9, 'matched');
    near(SolarAPI.dcAcRatio(400, 800), 1.0, 1e-9, 'never below 1');
    near(SolarAPI.dcAcRatio(1600, 800), 2.0, 1e-9, 'oversized');
    near(SolarAPI.clippingLoss(1.0, 90), 0, 1e-9, 'no clipping when matched');
    between(SolarAPI.clippingLoss(2.0, 90), 0.07, 0.09, '1.6 kW on 800 W, vertical');
    between(SolarAPI.clippingLoss(2.0, 35), 0.12, 0.14, '1.6 kW on 800 W, tilted');
  });
});

describe('Fallback energy model', () => {
  itAsync('produces a plausible annual yield for a mid-floor south balcony on a side street', async () => {
    const r = await estimate();
    between(r.annualKwh, 500, 800, 'annual kWh');
    assert(!r.usedPVWatts, 'tests run on the offline path');
    assert(r.shadeSource === 'canonical', `shade should come from the canonical canyon, got ${r.shadeSource}`);
  });

  itAsync('ranks orientations south > southeast > east > north', async () => {
    const south = (await estimate({ azimuth: 180 })).annualKwh;
    const southeast = (await estimate({ azimuth: 135 })).annualKwh;
    const east = (await estimate({ azimuth: 90 })).annualKwh;
    const north = (await estimate({ azimuth: 0 })).annualKwh;
    assert(south > southeast && southeast > east && east > north, `S ${south.toFixed(0)} > SE ${southeast.toFixed(0)} > E ${east.toFixed(0)} > N ${north.toFixed(0)}`);
  });

  itAsync('accepts an unsnapped facade azimuth', async () => {
    const grid = (await estimate({ azimuth: 209 })).annualKwh;
    const s = (await estimate({ azimuth: 180 })).annualKwh, sw = (await estimate({ azimuth: 225 })).annualKwh;
    assert(grid < s && grid > sw, `209 deg (${grid.toFixed(0)}) lies between south (${s.toFixed(0)}) and south-west (${sw.toFixed(0)})`);
  });

  itAsync('ranks tilts 35 > 60 > 70 > 90 on an open site', async () => {
    const yields = [];
    for (const tilt of [35, 60, 70, 90]) yields.push((await estimate({ tilt, shading: 'open', floor: 15 })).annualKwh);
    for (let i = 1; i < yields.length; i++) assert(yields[i] < yields[i - 1], `tilt ordering broken at index ${i}: ${yields.map(y => y.toFixed(0)).join(' ')}`);
  });

  itAsync('scales production linearly with system size when the inverter keeps up', async () => {
    const small = (await estimate({ systemWatts: 400 })).annualKwh;
    const large = (await estimate({ systemWatts: 1600, inverterWatts: 1600 })).annualKwh;
    near(large / small, 4, 0.01, 'yield should scale with capacity');
  });

  itAsync('clips an oversized array on an 800 W inverter', async () => {
    const matched = (await estimate({ systemWatts: 1600, inverterWatts: 1600 })).annualKwh;
    const clipped = (await estimate({ systemWatts: 1600, inverterWatts: 800 })).annualKwh;
    between(clipped / matched, 0.90, 0.95, '1.6 kW vertical on 800 W AC');
  });

  itAsync('returns twelve monthly values that sum to the annual total', async () => {
    const r = await estimate();
    assert(r.monthlyKwh.length === 12, 'expected 12 monthly values');
    near(r.monthlyKwh.reduce((s, v) => s + v, 0), r.annualKwh, 0.5, 'monthly sum');
  });

  itAsync('gives a vertical south panel its real winter-heavy year, and a tilted one a summer peak', async () => {
    const v = (await estimate({ shading: 'open', floor: 15 })).monthlyKwh;
    const maxV = v.indexOf(Math.max(...v));
    assert([0, 1, 2, 9, 10, 11].includes(maxV), `vertical south should peak in a cool month, got index ${maxV}`);
    const t = (await estimate({ shading: 'open', floor: 15, tilt: 35 })).monthlyKwh;
    const maxT = t.indexOf(Math.max(...t));
    assert(maxT >= 4 && maxT <= 7, `35 deg should peak in summer, got index ${maxT}`);
  });

  itAsync('applies the railing derate and reports it', async () => {
    const r = await estimate({ tilt: 90 });
    near(r.railingFactor, SolarConfig.RAILING_OBSTRUCTION_BY_TILT[90], 0.0001, 'railing factor');
  });
});

describe('Canonical-canyon shade fallback', () => {
  const p = (o = {}) => SolarAPI.canonicalShadeProfile(Object.assign({ azimuth: 180, tilt: 90, floor: 3, totalFloors: 6, shading: 'some', mountType: 'rail' }, o));

  it('rises with floor height and never exceeds 1', () => {
    let prev = -1;
    for (let floor = 1; floor <= 6; floor++) {
      const f = p({ floor }).annualShadeFactor;
      assert(f >= prev, `shade factor should not fall with floor; broke at floor ${floor}`);
      between(f, 0.02, 1, `floor ${floor}`);
      prev = f;
    }
  });

  it('ranks environments open > wide avenue > some > dense', () => {
    const at = s => p({ shading: s }).annualShadeFactor;
    assert(at('open') > at('wide_avenue'), 'open beats wide avenue');
    assert(at('wide_avenue') > at('some'), 'wide avenue beats some');
    assert(at('some') > at('dense'), 'some beats dense');
    between(at('open'), 0.99, 1.0, 'an open site is unshaded for a vertical panel');
  });

  it('is orientation-aware and reports direct-sun hours', () => {
    const s = p({ azimuth: 180 }), n = p({ azimuth: 0 });
    assert(Math.abs(s.annualShadeFactor - n.annualShadeFactor) > 0.02, 'north and south canyons differ');
    assert(s.directSunHours && s.directSunHours.jun >= 0 && s.directSunHours.dec >= 0, 'direct sun hours reported');
    assert(s.source === 'canonical', 'labelled canonical');
  });

  it('returns null for an unknown environment so the caller can disclose it', () => {
    assert(p({ shading: 'nonsense' }) === null, 'unknown environment');
  });
});

describe('Self-consumption in the estimate', () => {
  itAsync('values savings only on the electricity used at home', async () => {
    const r = await estimate();
    between(r.selfConsumption, 0.85, 1.0, 'default self-consumption');
    near(r.selfConsumedKwh + r.exportedKwh, r.annualKwh, 0.01, 'split adds up');
    near(r.annualSavings, r.selfConsumedKwh * SolarConfig.ELECTRICITY_RATE, 0.01, 'annual savings');
    near(r.monthlySavings, r.annualSavings / 12, 0.01, 'monthly savings');
  });

  itAsync('saves less when nobody is home on weekdays, and more with someone home', async () => {
    const base = await estimate();
    const away = await estimate({ occupancy: 'away' });
    const wfh = await estimate({ occupancy: 'wfh' });
    assert(away.annualSavings < base.annualSavings - 20, `away (${away.annualSavings.toFixed(0)}) < base (${base.annualSavings.toFixed(0)})`);
    assert(wfh.annualSavings >= base.annualSavings - 0.01, 'someone home saves at least the base');
    near(away.annualKwh, base.annualKwh, 0.01, 'occupancy does not change production');
  });

  itAsync('uses a smaller share of a larger system', async () => {
    const small = await estimate({ systemWatts: 800 });
    const big = await estimate({ systemWatts: 1600, inverterWatts: 1600 });
    assert(big.selfConsumption < small.selfConsumption - 0.1, 'bigger array exports more');
    between(big.battery1kWhExtraKwh, 20, 400, 'battery gain reported');
  });
});

describe('Financial model', () => {
  itAsync('excludes the fixed customer charge from inferred consumption and offsets only what is used', async () => {
    const r = await estimate({ monthlyBill: 140 });
    const expectedConsumption = ((140 - SolarConfig.MONTHLY_CUSTOMER_CHARGE) / SolarConfig.ELECTRICITY_RATE) * 12;
    near(r.annualConsumption, expectedConsumption, 0.1, 'inferred consumption');
    near(r.billOffsetPct, (r.selfConsumedKwh / expectedConsumption) * 100, 0.1, 'bill offset');
  });

  itAsync('clamps bill offset to 100% and survives a zero bill', async () => {
    const r = await estimate({ monthlyBill: 0 });
    assert(Number.isFinite(r.billOffsetPct), 'offset must be finite at a $0 bill');
    between(r.billOffsetPct, 0, 100, 'offset percentage');
  });

  itAsync('reports a finite payback that reflects escalation and the inverter replacement', async () => {
    const r = await estimate();
    assert(Number.isFinite(r.simplePayback) && r.simplePayback > 0, 'simple payback');
    between(r.escalatedPayback, 1, 25, 'escalated payback within the horizon');
    near(r.replacementCost, r.adjustedCost * SolarConfig.INVERTER_REPLACEMENT.fraction, 0.01, 'replacement cost');
    near(r.lifetimeNet, r.lifetimeSavings - r.replacementCost, 0.01, 'net of the replacement');
    assert(r.lifetimeNetReal < r.lifetimeNet, 'today\'s dollars are fewer than nominal dollars');
  });

  itAsync('grows lifetime value with the escalation preset', async () => {
    const low = (await estimate({ escalationPreset: 'low' })).lifetimeSavings;
    const mid = (await estimate({ escalationPreset: 'mid' })).lifetimeSavings;
    const high = (await estimate({ escalationPreset: 'high' })).lifetimeSavings;
    assert(low < mid && mid < high, 'lifetime value should rise with escalation');
  });

  itAsync('degrades budget panels fastest', async () => {
    const budget = (await estimate({ costTier: 'budget' })).panelDegradation;
    const premium = (await estimate({ costTier: 'premium' })).panelDegradation;
    assert(budget > premium, 'budget panels degrade faster');
  });

  itAsync('scales cost linearly from the 800W reference', async () => {
    const r = await estimate({ systemWatts: 1600, inverterWatts: 1600, costTier: 'mid' });
    near(r.adjustedCost, SolarConfig.SYSTEM_COST_BY_TIER.mid * 2, 0.01, 'adjusted cost');
  });

  itAsync('produces a lifetime total above the up-front cost for a viable case', async () => {
    const r = await estimate({ azimuth: 180, floor: 14, totalFloors: 15, shading: 'open' });
    assert(r.lifetimeNet > r.adjustedCost, 'a top-floor south balcony should beat its cost over 25 years');
  });
});

describe('Environmental model', () => {
  itAsync('uses the eGRID factor and EPA equivalences on all production', async () => {
    const r = await estimate();
    near(r.co2Lbs, r.annualKwh * SolarConfig.CO2_FACTOR, 0.01, 'CO2 lbs');
    near(r.treesEquiv, r.co2Lbs / SolarConfig.CO2_PER_TREE_LB, 0.01, 'tree equivalent');
    near(r.milesOffset, r.co2Lbs / SolarConfig.CAR_LB_PER_MILE, 0.01, 'miles offset');
    near(r.phonesCharged, r.annualKwh / SolarConfig.PHONE_CHARGE_KWH, 0.5, 'phone charges');
    assert(Math.abs(r.milesOffset - r.annualKwh) > 1, 'miles are no longer an alias of kWh');
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

describe('Building attributes', () => {
  it('rounds fractional PLUTO floor counts and falls back to height, then the default', () => {
    const { SolarState, SolarAPI: api } = loadModules();
    SolarState.numfloors = null; SolarState.heightroof = null;
    assert(api.resolveTotalFloors().source === 'default' && api.resolveTotalFloors().totalFloors === 20, 'default');
    SolarState.heightroof = 63;
    const h = api.resolveTotalFloors();
    assert(h.source === 'height' && h.totalFloors === 6, `63 ft -> 6 floors, got ${h.totalFloors}`);
    SolarState.numfloors = 3;
    assert(api.resolveTotalFloors().source === 'pluto', 'PLUTO wins when present');
  });
});

describe('Orientation detection', () => {
  const LAT = 40.7128;
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos(LAT * Math.PI / 180);

  function rect(widthM, depthM, rotationDeg = 0) {
    const pts = [[-widthM / 2, -depthM / 2], [widthM / 2, -depthM / 2], [widthM / 2, depthM / 2], [-widthM / 2, depthM / 2]];
    const rot = rotationDeg * Math.PI / 180;
    return pts.concat([pts[0]]).map(([x, y]) => {
      const rx = x * Math.cos(rot) - y * Math.sin(rot);
      const ry = x * Math.sin(rot) + y * Math.cos(rot);
      return [-73.996 + rx / mPerDegLon, LAT + ry / mPerDegLat];
    });
  }

  it('reads north/south primary facades off an east-west building', () => {
    const o = SolarAPI.detectOrientation(rect(100, 30));
    assert(o.primaryDirections.includes(180) && o.primaryDirections.includes(0), `expected N/S primary facades, got ${JSON.stringify(o.primaryDirections)}`);
    assert(o.bestDirection === 180, `should prefer the south facade, got ${o.bestDirection}`);
    near(o.bestDirectionExact, 180, 0.5, 'exact bearing of the best facade');
  });

  it('does not mistake a north-south building for an east-west one', () => {
    const o = SolarAPI.detectOrientation(rect(30, 100));
    assert(o.primaryDirections.includes(90) && o.primaryDirections.includes(270), `expected E/W primary facades, got ${JSON.stringify(o.primaryDirections)}`);
  });

  it('reads the Manhattan grid rotation off the polygon, exactly', () => {
    const o = SolarAPI.detectOrientation(rect(100, 30, 29));
    assert(o.allDirections.includes(225) || o.allDirections.includes(45), `expected the rotated facades to snap to SW/NE, got ${JSON.stringify(o.allDirections)}`);
    const exact = ((o.bestDirectionExact % 360) + 360) % 360;
    assert(Math.abs(exact - 209) < 1.5 || Math.abs(exact - 151) < 1.5, `exact facade bearing should be about 209 or 151, got ${exact}`);
  });

  it('reports confidence from the perpendicular edge', () => {
    assert(SolarAPI.detectOrientation(rect(120, 25)).confidence === 'high', 'elongated -> high');
    assert(SolarAPI.detectOrientation(rect(50, 48)).confidence === 'medium', 'near-square -> medium');
    assert(SolarAPI.detectOrientation(rect(60, 60)).confidence === 'medium', 'square -> medium');
  });

  it('returns null for degenerate input', () => {
    assert(SolarAPI.detectOrientation(null) === null, 'null input');
    assert(SolarAPI.detectOrientation([[0, 0], [1, 1]]) === null, 'too few vertices');
  });
});

describe('SoQL helpers', () => {
  it('escapes apostrophes so addresses like "O\'Neill St" cannot break the query', () => {
    assert(g.soqlEscape("O'NEILL ST") === "O''NEILL ST", 'single quote must be doubled');
    assert(g.soqlEscape('1000480001') === '1000480001', 'plain BBL unchanged');
  });
});

describe('PVWatts request construction', () => {
  it('sends the kit parameters, the exact azimuth and an inverter-derived DC:AC ratio', () => {
    g.SolarState.lat = 40.7; g.SolarState.lon = -74.0;
    const p = SolarAPI._pvwattsBaseParams({ systemCapacity: 0.8, tilt: 90, azimuth: 209.3, inverterWatts: 800 });
    assert(p.gcr === '0.01' && p.use_wf_albedo === '1' && p.array_type === '0' && p.module_type === '1', 'kit parameters');
    assert(p.azimuth === '209.3', `azimuth should not be snapped, got ${p.azimuth}`);
    assert(p.dc_ac_ratio === '1', `matched kit -> 1, got ${p.dc_ac_ratio}`);
    const big = SolarAPI._pvwattsBaseParams({ systemCapacity: 1.6, tilt: 35, azimuth: 180, inverterWatts: 800 });
    assert(big.dc_ac_ratio === '2', `1.6 kW on 800 W -> 2, got ${big.dc_ac_ratio}`);
    assert(!('losses' in p) && !('soiling' in p), 'losses and soiling are added per variant');
  });

  it('folds soiling into losses consistently when the array cannot be sent', () => {
    const soil = SolarAPI.soilingFor(90);
    const mean = soil.reduce((s, v) => s + v, 0) / 12 / 100;
    const combined = (1 - (1 - SolarConfig.PVWATTS_PARAMS.losses / 100) * (1 - mean)) * 100;
    near(parseFloat(SolarAPI.lossesWithSoilingFor(90)), combined, 0.06, 'combined loss, vertical');
    assert(parseFloat(SolarAPI.lossesWithSoilingFor(35)) > parseFloat(SolarAPI.lossesWithSoilingFor(90)), 'tilted panels soil more');
  });
});
