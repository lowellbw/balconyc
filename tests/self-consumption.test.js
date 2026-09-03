// Self-consumption lookup: the share of production used on site.

const { loadModules, describe, it, assert, near, between } = require('./harness');
const { SelfConsumption, SelfConsumptionTable } = loadModules();

describe('Self-consumption table', () => {
  it('covers every orientation class and occupancy, with monotone points', () => {
    for (const cls of ['t90_s', 't35_s', 't60_s', 't90_sw', 't90_e', 't90_w']) {
      for (const occ of ['base', 'wfh', 'away']) {
        const pts = SelfConsumptionTable.scf[cls][occ];
        assert(Array.isArray(pts) && pts.length >= 8, `${cls}/${occ} has points`);
        for (let i = 1; i < pts.length; i++) {
          assert(pts[i][0] > pts[i - 1][0], `${cls}/${occ} sorted by ratio`);
          assert(pts[i][1] <= pts[i - 1][1] + 1e-9, `${cls}/${occ} non-increasing`);
        }
      }
      assert(SelfConsumptionTable.esfBattery[cls]['1'] && SelfConsumptionTable.esfBattery[cls]['2'], `${cls} battery tables`);
    }
  });
});

describe('SelfConsumption.fraction', () => {
  const base = { tiltDeg: 90, azimuthDeg: 180, annualConsumptionKwh: 4235, occupancy: 'base' };

  it('reproduces the simulated default case (800 W vertical south, $140 bill): about 92%', () => {
    const r = SelfConsumption.fraction({ ...base, annualKwh: 673 });
    between(r.fraction, 0.90, 0.94, 'default self-consumption');
    assert(r.orientationClass === 't90_s', 'class');
  });

  it('falls as the system grows relative to consumption', () => {
    const small = SelfConsumption.fraction({ ...base, annualKwh: 340 }).fraction;
    const big = SelfConsumption.fraction({ ...base, annualKwh: 1350 }).fraction;
    assert(small > 0.99, `400 W is fully used (${small.toFixed(3)})`);
    between(big, 0.6, 0.75, '1,600 W vertical south at the default bill');
    assert(big < small, 'monotone in size');
  });

  it('depends on who is home in the day', () => {
    const wfh = SelfConsumption.fraction({ ...base, annualKwh: 673, occupancy: 'wfh' }).fraction;
    const away = SelfConsumption.fraction({ ...base, annualKwh: 673, occupancy: 'away' }).fraction;
    const b = SelfConsumption.fraction({ ...base, annualKwh: 673 }).fraction;
    assert(wfh >= b && away < b - 0.15, `home (${wfh.toFixed(2)}) >= base (${b.toFixed(2)}) > away (${away.toFixed(2)})`);
  });

  it('maps orientations onto the simulated classes', () => {
    assert(SelfConsumption.orientationClass(90, 90) === 't90_e', 'east vertical');
    assert(SelfConsumption.orientationClass(90, 270) === 't90_w', 'west vertical');
    assert(SelfConsumption.orientationClass(90, 225) === 't90_sw', 'south-west vertical');
    assert(SelfConsumption.orientationClass(90, 209) === 't90_sw', 'Manhattan-grid avenue facade');
    assert(SelfConsumption.orientationClass(35, 180) === 't35_s', 'tilted south');
    assert(SelfConsumption.orientationClass(60, 160) === 't60_s', 'tilted south-ish');
    assert(SelfConsumption.orientationClass(35, 90) === 't90_e', 'tilted east approximated by vertical east');
    assert(SelfConsumption.orientationClass(90, 0) === 't90_e', 'north uses the morning-skewed class');
  });

  it('never exceeds 100% and never drops below the daytime floor', () => {
    const tiny = SelfConsumption.fraction({ ...base, annualKwh: 10 }).fraction;
    const huge = SelfConsumption.fraction({ ...base, annualKwh: 20000 }).fraction;
    between(tiny, 0.99, 1.0, 'tiny system');
    between(huge, 0.15, 0.4, 'huge system');
  });

  it('values a 1 kWh battery at a few dozen kWh a year for an 800 W kit', () => {
    const g = SelfConsumption.batteryGain({ ...base, annualKwh: 673 }, 1);
    between(g.extraKwh, 20, 80, 'battery gain kWh/yr');
    const g2 = SelfConsumption.batteryGain({ ...base, annualKwh: 673 }, 2);
    assert(g2.extraKwh >= g.extraKwh, 'a bigger battery recovers at least as much');
  });
});
