// ============================================================
// balco.nyc — Solar Position Algorithm (Simplified NOAA)
// ============================================================
// Computes sun altitude and azimuth for NYC at any time/date.
// Used by the 3D visualization to position the DirectionalLight
// and animate shadows through the day.
// ============================================================

const SunPosition = {
  // NYC coordinates (fixed — this is a NYC-only app)
  LAT: 40.7128,
  LON: -73.9960,
  LAT_RAD: 40.7128 * Math.PI / 180,

  // Day-of-year for the 15th of each month (matches calculate's representative day)
  DOY_TABLE: [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349],

  // Timezone offset (EST = -5, EDT = -4) by day-of-year.
  // 2026 DST: starts Mar 8 (DOY 67), ends Nov 1 (DOY 305). Using the 15th-of-month
  // representative day gives correct offsets for Mar/Nov without the off-by-week errors
  // from a pure month-based switch.
  _tzOffset(month) {
    const doy = this.DOY_TABLE[month] ?? 166;
    return (doy >= 67 && doy < 305) ? -4 : -5;
  },

  /**
   * Calculate sun position for a given month and time of day.
   * @param {number} month - 0-11 (Jan=0)
   * @param {number} minuteOfDay - 0-1440 (minutes since midnight, local time)
   * @returns {{ altitude: number, azimuth: number, altitudeDeg: number, azimuthDeg: number }}
   *          altitude/azimuth in radians; altitudeDeg/azimuthDeg in degrees
   */
  calculate(month, minuteOfDay) {
    const DEG = Math.PI / 180;

    // Use the 15th of the given month as representative day
    const dayOfYear = this.DOY_TABLE[month] ?? 166; // default June 15

    // --- Julian Century from J2000.0 ---
    const year = new Date().getFullYear();
    const jd = 2451545.0 + (year - 2000) * 365.25 + dayOfYear;
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
    // Simplified approximation
    const B = (360 / 365) * (dayOfYear - 81) * DEG;
    const EoT = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.50 * Math.sin(B);

    // --- Solar Time ---
    const tzOffset = this._tzOffset(month);
    const standardMeridian = tzOffset * 15; // degrees
    const longitudeCorrection = 4 * (this.LON - standardMeridian); // minutes
    const solarTime = minuteOfDay + EoT + longitudeCorrection;

    // --- Hour Angle ---
    const hourAngle = ((solarTime / 4) - 180) * DEG; // degrees to radians

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
    let azimuth = (Math.atan2(sinAz, cosAz) + 2 * Math.PI) % (2 * Math.PI);

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
   * In Three.js: +X=East, +Z=South (negated), +Y=Up
   * @param {number} altitude - radians
   * @param {number} azimuth - radians (from north, clockwise)
   * @param {number} distance - distance from origin
   * @returns {{ x: number, y: number, z: number }}
   */
  toWorldPosition(altitude, azimuth, distance) {
    const y = distance * Math.sin(altitude);
    const horizDist = distance * Math.cos(altitude);
    // Azimuth from north clockwise: 0=north(-Z), 90=east(+X), 180=south(+Z), 270=west(-X)
    const x = horizDist * Math.sin(azimuth);
    const z = -horizDist * Math.cos(azimuth);
    return { x, y, z };
  },

  /**
   * Get sunrise and sunset times (approximate) for a given month.
   * @param {number} month - 0-11
   * @returns {{ sunrise: number, sunset: number }} minutes since midnight
   */
  getDayBounds(month) {
    // Search for altitude crossing zero
    let sunrise = 330, sunset = 1170; // defaults: 5:30AM, 7:30PM
    for (let m = 240; m < 720; m += 3) {
      const pos = this.calculate(month, m);
      if (pos.altitude > 0) { sunrise = m; break; }
    }
    for (let m = 1260; m > 720; m -= 3) {
      const pos = this.calculate(month, m);
      if (pos.altitude > 0) { sunset = m; break; }
    }
    return { sunrise, sunset };
  },

  /**
   * Format minutes since midnight as "H:MM AM/PM"
   * @param {number} minutes
   * @returns {string}
   */
  formatTime(minutes) {
    const h24 = Math.floor(minutes / 60);
    const m = Math.floor(minutes % 60);
    const ampm = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 === 0 ? 12 : (h24 > 12 ? h24 - 12 : h24);
    return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
  },
};
