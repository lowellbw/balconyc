// ============================================================
// balco.nyc — Solar Position Algorithm (Simplified NOAA)
// ============================================================
// Computes sun altitude and azimuth for NYC at any time/date.
// Used by the 3D visualization to position the DirectionalLight
// and by the shade model's daylight sweep.
//
// Accuracy against the full NOAA algorithm (2026, sun above the horizon):
// altitude within 0.15 deg, azimuth within 0.33 deg, solar noon within a
// minute. Through the shade sweep that is worth at most 0.02 points of
// annual shade factor; see docs/modeling-decisions.md D20.
// ============================================================

const SunPosition = {
  // NYC coordinates (fixed — this is a NYC-only app)
  LAT: 40.7128,
  LON: -73.9960,
  LAT_RAD: 40.7128 * Math.PI / 180,

  // Day-of-year for the 15th of each month: the representative day used by
  // the 3D scene's display and by calculate(month, minute).
  DOY_TABLE: [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349],
  DAYS_IN_MONTH: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],

  // The calendar year the model runs in. Read once (not on every call: the
  // sweep evaluates tens of thousands of positions) and overridable for tests.
  _year: new Date().getFullYear(),
  setYear(y) { this._year = y; this._dst = null; },

  /**
   * US daylight-saving range for the current year as day-of-year bounds
   * [start, end): second Sunday of March to first Sunday of November.
   */
  _dstRange() {
    if (this._dst && this._dst.year === this._year) return this._dst;
    const y = this._year;
    const doyOf = (m, d) => Math.round((Date.UTC(y, m, d) - Date.UTC(y, 0, 1)) / 86400000) + 1;
    const nthSunday = (m, n) => {
      const first = new Date(Date.UTC(y, m, 1)).getUTCDay();   // 0 = Sunday
      return 1 + ((7 - first) % 7) + 7 * (n - 1);
    };
    this._dst = { year: y, start: doyOf(2, nthSunday(2, 2)), end: doyOf(10, nthSunday(10, 1)) };
    return this._dst;
  },

  /** Timezone offset (EST = -5, EDT = -4) for a day of year. */
  tzOffsetForDoy(doy) {
    const r = this._dstRange();
    return (doy >= r.start && doy < r.end) ? -4 : -5;
  },

  _tzOffset(month) {
    return this.tzOffsetForDoy(this.DOY_TABLE[month] ?? 166);
  },

  /**
   * Calculate sun position for a given month and time of day, on the 15th.
   * @param {number} month - 0-11 (Jan=0)
   * @param {number} minuteOfDay - 0-1440 (minutes since midnight, local clock time)
   */
  calculate(month, minuteOfDay) {
    return this.calculateDoy(this.DOY_TABLE[month] ?? 166, minuteOfDay);
  },

  /**
   * Calculate sun position for any day of the year.
   * @param {number} dayOfYear - 1-365
   * @param {number} minuteOfDay - 0-1440 (minutes since midnight, local clock time)
   * @returns {{ altitude: number, azimuth: number, altitudeDeg: number, azimuthDeg: number }}
   *          altitude/azimuth in radians; altitudeDeg/azimuthDeg in degrees
   */
  calculateDoy(dayOfYear, minuteOfDay) {
    const DEG = Math.PI / 180;

    // --- Julian Century from J2000.0 ---
    const jd = 2451545.0 + (this._year - 2000) * 365.25 + dayOfYear;
    const T = (jd - 2451545.0) / 36525.0;

    // --- Solar Mean Anomaly (degrees) ---
    const M = (357.5291 + 35999.0503 * T) % 360;
    const M_rad = M * DEG;

    // --- Equation of Center ---
    const C = 1.9148 * Math.sin(M_rad)
            + 0.0200 * Math.sin(2 * M_rad)
            + 0.0003 * Math.sin(3 * M_rad);

    // --- Ecliptic Longitude ---
    const lambda = ((M + C + 180 + 102.9372) % 360) * DEG;

    // --- Solar Declination ---
    const sinDec = Math.sin(lambda) * Math.sin(23.4393 * DEG);
    const dec = Math.asin(sinDec);
    const cosDec = Math.cos(dec);

    // --- Equation of Time (minutes) ---
    // Simplified approximation (within 0.83 min of NOAA over the year)
    const B = (360 / 365) * (dayOfYear - 81) * DEG;
    const EoT = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.50 * Math.sin(B);

    // --- Solar Time ---
    const tzOffset = this.tzOffsetForDoy(dayOfYear);
    const standardMeridian = tzOffset * 15; // degrees
    const longitudeCorrection = 4 * (this.LON - standardMeridian); // minutes
    const solarTime = minuteOfDay + EoT + longitudeCorrection;

    // --- Hour Angle ---
    const hourAngle = ((solarTime / 4) - 180) * DEG;

    // --- Solar Altitude ---
    const sinLat = Math.sin(this.LAT_RAD);
    const cosLat = Math.cos(this.LAT_RAD);
    const sinAlt = sinLat * Math.sin(dec) + cosLat * cosDec * Math.cos(hourAngle);
    const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

    // --- Solar Azimuth (atan2 form, robust at all altitudes) ---
    const cosAlt = Math.cos(altitude);
    const cosAz = cosAlt === 0
      ? 0
      : Math.max(-1, Math.min(1, (Math.sin(dec) - sinLat * sinAlt) / (cosLat * cosAlt)));
    const sinAz = cosAlt === 0 ? 0 : -cosDec * Math.sin(hourAngle) / cosAlt;
    // With these sin/cos definitions atan2 already returns azimuth measured from
    // north, clockwise. Only wrap it into [0, 2PI) — do not rotate it.
    const azimuth = (Math.atan2(sinAz, cosAz) + 2 * Math.PI) % (2 * Math.PI);

    return {
      altitude,
      azimuth,
      altitudeDeg: altitude / DEG,
      azimuthDeg: azimuth / DEG,
    };
  },

  /**
   * Convert sun altitude/azimuth to a 3D world position for the DirectionalLight.
   * Azimuth: 0=North, 90=East, 180=South, 270=West (clockwise from north)
   * In Three.js: +X=East, -Z=North, +Z=South, +Y=Up
   */
  toWorldPosition(altitude, azimuth, distance) {
    const y = distance * Math.sin(altitude);
    const horizDist = distance * Math.cos(altitude);
    const x = horizDist * Math.sin(azimuth);
    const z = -horizDist * Math.cos(azimuth);
    return { x, y, z };
  },

  /**
   * Sunrise and sunset (geometric centre crossing) for a day of year, found on
   * a 3-minute grid. Minutes since midnight, local clock time.
   */
  getDayBoundsDoy(dayOfYear) {
    let sunrise = 330, sunset = 1170; // defaults: 5:30AM, 7:30PM
    for (let m = 240; m < 720; m += 3) {
      if (this.calculateDoy(dayOfYear, m).altitude > 0) { sunrise = m; break; }
    }
    for (let m = 1260; m > 720; m -= 3) {
      if (this.calculateDoy(dayOfYear, m).altitude > 0) { sunset = m; break; }
    }
    return { sunrise, sunset };
  },

  /** Sunrise and sunset for the 15th of a month. */
  getDayBounds(month) {
    return this.getDayBoundsDoy(this.DOY_TABLE[month] ?? 166);
  },

  /**
   * Format minutes since midnight as "H:MM AM/PM"
   */
  formatTime(minutes) {
    const h24 = Math.floor(minutes / 60);
    const m = Math.floor(minutes % 60);
    const ampm = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 === 0 ? 12 : (h24 > 12 ? h24 - 12 : h24);
    return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SunPosition };
}
