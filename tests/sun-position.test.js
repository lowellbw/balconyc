// Solar position regression tests.
//
// Reference values are from the NOAA Solar Calculator for New York City
// (40.7128 N, 73.9960 W) on the 15th of each month, which is the
// representative day the model uses. Tolerances are wide enough to absorb
// the simplified equation of time but tight enough to catch a convention
// flip — the class of bug that shipped a 180-degree azimuth error.

const { loadModules, describe, it, near, between, angleDiffDeg, assert } = require('./harness');
const { SunPosition } = loadModules();

describe('SunPosition.calculate — azimuth convention', () => {
  it('places the June solar-noon sun in the south, not the north', () => {
    // 1:00 PM EDT is within ~5 min of solar noon in mid-June in NYC.
    const p = SunPosition.calculate(5, 780);
    assert(angleDiffDeg(p.azimuthDeg, 180) < 15,
      `expected azimuth near 180 (south), got ${p.azimuthDeg.toFixed(1)}`);
  });

  it('places the December solar-noon sun in the south', () => {
    const p = SunPosition.calculate(11, 720);
    assert(angleDiffDeg(p.azimuthDeg, 180) < 15,
      `expected azimuth near 180 (south), got ${p.azimuthDeg.toFixed(1)}`);
  });

  it('puts the morning sun in the east and the afternoon sun in the west', () => {
    const morning = SunPosition.calculate(5, 540);   // 9:00 AM
    const evening = SunPosition.calculate(5, 1020);  // 5:00 PM
    between(morning.azimuthDeg, 45, 135, 'June 9am azimuth');
    between(evening.azimuthDeg, 225, 315, 'June 5pm azimuth');
  });

  it('sweeps azimuth monotonically eastward through the day', () => {
    let prev = SunPosition.calculate(5, 420).azimuthDeg;
    for (let m = 450; m <= 1140; m += 30) {
      const az = SunPosition.calculate(5, m).azimuthDeg;
      assert(az > prev, `azimuth should increase through the day; ${az} followed ${prev} at minute ${m}`);
      prev = az;
    }
  });
});

describe('SunPosition.calculate — altitude', () => {
  // Peak altitude at solar noon = 90 - latitude + declination.
  it('reaches ~72.7 degrees at June solar noon', () => {
    let max = -90;
    for (let m = 600; m <= 900; m += 5) max = Math.max(max, SunPosition.calculate(5, m).altitudeDeg);
    near(max, 72.7, 1.5, 'June peak altitude');
  });

  it('reaches ~25.9 degrees at December solar noon', () => {
    let max = -90;
    for (let m = 600; m <= 840; m += 5) max = Math.max(max, SunPosition.calculate(11, m).altitudeDeg);
    near(max, 25.9, 1.5, 'December peak altitude');
  });

  it('reaches ~49.3 degrees at the equinox', () => {
    let max = -90;
    for (let m = 600; m <= 900; m += 5) max = Math.max(max, SunPosition.calculate(2, m).altitudeDeg);
    near(max, 49.3, 2.5, 'March peak altitude');
  });

  it('is below the horizon at midnight in every month', () => {
    for (let month = 0; month < 12; month++) {
      assert(SunPosition.calculate(month, 0).altitudeDeg < 0, `month ${month} midnight sun is up`);
    }
  });
});

describe('SunPosition.getDayBounds', () => {
  it('gives a long June day and a short December day', () => {
    const june = SunPosition.getDayBounds(5);
    const dec = SunPosition.getDayBounds(11);
    const juneHours = (june.sunset - june.sunrise) / 60;
    const decHours = (dec.sunset - dec.sunrise) / 60;
    between(juneHours, 14.5, 15.5, 'June daylight hours');
    between(decHours, 9.0, 9.8, 'December daylight hours');
  });

  it('brackets only daylight', () => {
    for (let month = 0; month < 12; month++) {
      const b = SunPosition.getDayBounds(month);
      assert(SunPosition.calculate(month, b.sunrise).altitudeDeg > -1, `month ${month} sunrise below horizon`);
      assert(SunPosition.calculate(month, b.sunset).altitudeDeg > -1, `month ${month} sunset below horizon`);
    }
  });
});

describe('SunPosition.toWorldPosition', () => {
  it('maps compass azimuth onto the Three.js axes (north = -Z, east = +X)', () => {
    const D = Math.PI / 180;
    const north = SunPosition.toWorldPosition(0, 0, 100);
    near(north.z, -100, 0.01, 'north Z');
    const east = SunPosition.toWorldPosition(0, 90 * D, 100);
    near(east.x, 100, 0.01, 'east X');
    const south = SunPosition.toWorldPosition(0, 180 * D, 100);
    near(south.z, 100, 0.01, 'south Z');
  });
});

describe('SunPosition — DST handling', () => {
  it('uses EDT for summer months and EST for winter months', () => {
    // Solar noon lands near 13:00 local under EDT and near 12:00 under EST.
    const summerPeak = peakMinute(5);
    const winterPeak = peakMinute(11);
    between(summerPeak, 760, 800, 'June solar-noon clock time');
    between(winterPeak, 700, 740, 'December solar-noon clock time');
  });

  function peakMinute(month) {
    let best = -90, bestM = 0;
    for (let m = 600; m <= 900; m += 1) {
      const a = SunPosition.calculate(month, m).altitudeDeg;
      if (a > best) { best = a; bestM = m; }
    }
    return bestM;
  }
});

describe('SunPosition: day-of-year interface', () => {
  it('matches the month interface on the 15th', () => {
    const a = SunPosition.calculate(5, 780), b = SunPosition.calculateDoy(166, 780);
    near(a.altitudeDeg, b.altitudeDeg, 1e-9, 'altitude');
    near(a.azimuthDeg, b.azimuthDeg, 1e-9, 'azimuth');
  });

  it('computes the US daylight-saving range for the model year', () => {
    const saved = SunPosition._year;
    SunPosition.setYear(2026);
    const r26 = SunPosition._dstRange();
    assert(r26.start === 67 && r26.end === 305, `2026: 8 March to 1 November, got ${r26.start}..${r26.end}`);
    assert(SunPosition.tzOffsetForDoy(66) === -5 && SunPosition.tzOffsetForDoy(67) === -4, 'switch on 8 March 2026');
    assert(SunPosition.tzOffsetForDoy(304) === -4 && SunPosition.tzOffsetForDoy(305) === -5, 'switch back on 1 November 2026');
    SunPosition.setYear(2027);
    const r27 = SunPosition._dstRange();
    assert(r27.start === 73 && r27.end === 311, `2027: 14 March to 7 November, got ${r27.start}..${r27.end}`);
    SunPosition.setYear(saved);
  });

  it('gives longer days near the June solstice than the December one', () => {
    const j = SunPosition.getDayBoundsDoy(172), d = SunPosition.getDayBoundsDoy(355);
    assert(j.sunset - j.sunrise > d.sunset - d.sunrise + 300, 'June day is 5+ hours longer');
  });
});
