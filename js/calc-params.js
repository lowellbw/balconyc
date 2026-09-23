// ============================================================
// balco.nyc — Calculator link parameters
// ============================================================
// Lets anyone, including an AI assistant answering "how much would a solar
// panel on my balcony make?", hand a person a link that opens straight onto
// their estimate:
//
//   https://balco.nyc/?address=1600+Pennsylvania+Ave+NW,+Washington,+DC
//                     &floor=3&facing=south&across=mid&distance=street
//
// Every value is validated here and anything unknown is dropped, so a link
// can prefill the calculator but never inject markup or odd state. The
// page strips the parameters from the address bar once read, so an address
// does not linger in history or reach analytics.
// ============================================================

const CalcParams = {
  // The contract llms.txt publishes. A test holds the two in step.
  KEYS: ['address', 'floor', 'facing', 'across', 'distance', 'tilt', 'watts', 'bill', 'rate'],

  FACING: {
    n: 0, north: 0, ne: 45, northeast: 45, e: 90, east: 90, se: 135, southeast: 135,
    s: 180, south: 180, sw: 225, southwest: 225, w: 270, west: 270, nw: 315, northwest: 315,
  },
  ACROSS: ['none', 'low', 'mid', 'tall', 'tower'],
  DISTANCE: ['alley', 'street', 'wide', 'far'],
  TILTS: [90, 70, 60, 35],
  WATTS: [400, 800, 1200, 1600],

  _int(v, lo, hi) {
    if (v == null || !/^\d+$/.test(String(v).trim())) return null;
    const n = parseInt(v, 10);
    return n >= lo && n <= hi ? n : null;
  },

  _num(v, lo, hi) {
    if (v == null || !/^\d+(\.\d+)?$/.test(String(v).trim())) return null;
    const n = parseFloat(v);
    return n >= lo && n <= hi ? n : null;
  },

  _facing(v) {
    if (v == null) return null;
    const t = String(v).trim().toLowerCase().replace(/[\s_-]/g, '');
    if (Object.prototype.hasOwnProperty.call(this.FACING, t)) return this.FACING[t];
    const deg = this._int(t, 0, 360);
    if (deg == null) return null;
    return (Math.round(deg / 45) * 45) % 360;   // snap to the eight compass points
  },

  /**
   * Parse a query string (or URLSearchParams) into validated calculator inputs.
   * @returns {object} only the keys that were present and valid
   */
  parse(search) {
    const q = typeof search === 'string'
      ? new URLSearchParams(search.charAt(0) === '?' ? search.slice(1) : search)
      : search;
    const out = {};
    const address = q.get('address');
    if (address) {
      const clean = address.replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim();
      if (clean.length >= 5 && clean.length <= 200) out.address = clean;
    }
    const floor = this._int(q.get('floor'), 1, 120);
    if (floor != null) out.floor = floor;
    const facing = this._facing(q.get('facing'));
    if (facing != null) out.facing = facing;
    const across = (q.get('across') || '').toLowerCase();
    if (this.ACROSS.includes(across)) out.across = across;
    const distance = (q.get('distance') || '').toLowerCase();
    if (this.DISTANCE.includes(distance)) out.distance = distance;
    const tilt = this._int(q.get('tilt'), 0, 90);
    if (tilt != null && this.TILTS.includes(tilt)) out.tilt = tilt;
    const watts = this._int(q.get('watts'), 0, 5000);
    if (watts != null && this.WATTS.includes(watts)) out.watts = watts;
    const bill = this._num(q.get('bill'), 20, 800);
    if (bill != null) out.bill = bill;
    const rate = this._num(q.get('rate'), 5, 100);
    if (rate != null) out.rate = rate;
    return out;
  },

  /**
   * True when the parsed inputs are enough to run without asking anything.
   * What stands opposite changes the answer too much to default silently, so
   * a link without `across` opens the form prefilled and waits for a click.
   */
  isComplete(p) {
    return !!(p && p.address && p.floor != null && p.facing != null && p.across);
  },

  /** Build a query string from calculator inputs, in the published key order. */
  toQuery(state) {
    const parts = [];
    for (const k of this.KEYS) {
      let v = state[k];
      if (v == null || v === '') continue;
      if (k === 'facing') {
        const names = { 0: 'north', 45: 'northeast', 90: 'east', 135: 'southeast',
          180: 'south', 225: 'southwest', 270: 'west', 315: 'northwest' };
        v = names[v] || v;
      }
      parts.push(k + '=' + encodeURIComponent(String(v)).replace(/%20/g, '+'));
    }
    return parts.join('&');
  },
};

// Node/test harness support — harmless in the browser.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CalcParams };
}
