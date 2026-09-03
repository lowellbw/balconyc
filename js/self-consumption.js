// ============================================================
// balco.nyc: Self-consumption model
// ============================================================
// A plug-in panel only saves money on the electricity the apartment uses at
// the moment it is produced. Under the SUNNY Act exported energy is not
// compensated (unless the owner voluntarily enters a net-metering agreement,
// which brings back the interconnection process the Act removes), and Con Ed
// AMI meters record delivered and received energy on separate channels, so
// exports are neither billed nor credited.
//
// The share used on site depends mostly on the ratio of annual production to
// annual consumption, on the panel's daily output shape (orientation) and on
// whether anyone is home in the daytime. The lookup table comes from an
// hourly simulation of the DOE residential load profile for New York Central
// Park (apartment archetype) against PVWatts hourly output; see
// docs/methodology-audit-2026-09.md section 4.4 and D24 in
// docs/modeling-decisions.md. Depends on js/self-consumption-table.js.
// ============================================================

const SelfConsumption = {
  OCCUPANCIES: ['base', 'wfh', 'away'],
  OCCUPANCY_LABELS: {
    base: 'Typical (out most weekdays)',
    wfh: 'Someone is usually home in the day',
    away: 'Nobody home on weekdays',
  },

  _table() {
    if (typeof SelfConsumptionTable !== 'undefined') return SelfConsumptionTable;
    throw new Error('SelfConsumptionTable not loaded');
  },

  /**
   * Map a panel orientation onto the simulated orientation classes.
   * Tilted panels facing broadly south use the tilted-south classes; every
   * other case uses the vertical class of its compass sector (the tilted east
   * and west shapes were not simulated and are approximated by the vertical
   * ones, which have the same morning or afternoon skew).
   */
  orientationClass(tiltDeg, azimuthDeg) {
    const az = ((azimuthDeg % 360) + 360) % 360;
    const southish = az >= 112.5 && az <= 247.5;
    if (tiltDeg < 85 && southish) return tiltDeg <= 50 ? 't35_s' : 't60_s';
    if (az > 202.5 && az <= 247.5) return 't90_sw';
    if (southish) return 't90_s';
    if (az > 247.5 && az < 337.5) return 't90_w';
    return 't90_e'; // east, north-east, north, north-west: morning-skewed or tiny output
  },

  /** Piecewise-linear interpolation on [r, value] points sorted by r. */
  _interp(points, r) {
    if (!points || !points.length) return 1;
    if (r <= points[0][0]) return points[0][1];
    const last = points[points.length - 1];
    if (r >= last[0]) {
      // Extrapolate along the last segment, but never below a floor: even a
      // very oversized array covers the daytime base load.
      const prev = points[Math.max(0, points.length - 2)];
      const slope = last[0] > prev[0] ? (last[1] - prev[1]) / (last[0] - prev[0]) : 0;
      return Math.max(0.15, last[1] + slope * (r - last[0]));
    }
    for (let i = 1; i < points.length; i++) {
      if (r <= points[i][0]) {
        const [r0, v0] = points[i - 1], [r1, v1] = points[i];
        return r1 > r0 ? v0 + (v1 - v0) * (r - r0) / (r1 - r0) : v1;
      }
    }
    return last[1];
  },

  /**
   * Share of annual production used on site.
   * @param {object} p - { tiltDeg, azimuthDeg, annualKwh, annualConsumptionKwh, occupancy }
   * @returns {{ fraction: number, ratio: number, orientationClass: string, occupancy: string }}
   */
  fraction(p) {
    const T = this._table();
    const cls = this.orientationClass(p.tiltDeg, p.azimuthDeg);
    const occ = this.OCCUPANCIES.includes(p.occupancy) ? p.occupancy : 'base';
    const ratio = p.annualKwh / Math.max(1, p.annualConsumptionKwh);
    const points = (T.scf[cls] && (T.scf[cls][occ] || T.scf[cls].base)) || null;
    const fraction = Math.max(0, Math.min(1, this._interp(points, ratio)));
    return { fraction, ratio, orientationClass: cls, occupancy: occ };
  },

  /**
   * What a small battery would add: the extra share of production that ends
   * up displacing purchases, after round-trip losses. Simulated for the base
   * occupancy only, so it is reported relative to the base-occupancy figure.
   * @returns {{ batteryKwh, extraFraction, extraKwh }}
   */
  batteryGain(p, batteryKwh) {
    const T = this._table();
    const cls = this.orientationClass(p.tiltDeg, p.azimuthDeg);
    const ratio = p.annualKwh / Math.max(1, p.annualConsumptionKwh);
    const base = this._interp(T.scf[cls] && T.scf[cls].base, ratio);
    const withBat = this._interp(T.esfBattery[cls] && T.esfBattery[cls][String(batteryKwh)], ratio);
    const extraFraction = Math.max(0, withBat - base);
    return { batteryKwh, extraFraction, extraKwh: extraFraction * p.annualKwh };
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SelfConsumption };
}
