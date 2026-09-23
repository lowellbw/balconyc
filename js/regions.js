// ============================================================
// balco.nyc — Regions
// ============================================================
// Decides which model an address gets, and what it pays for a kWh.
//
//   New York City   -> PLUTO + building footprints + 3D shade model,
//                      Con Edison's all-in marginal rate.
//   Anywhere else   -> PVWatts for the location, shading from the visitor's
//   in the US          description of what stands opposite, the state's
//                      average residential price from EIA, and the state's
//                      plug-in solar law from data/state-status.json.
//
// Pure functions plus one cached data loader, so the harness can test them.
// Depends on: js/config.js (SolarConfig)
// ============================================================

const Regions = {
  // Routing is by county, not by a bounding box. The old rectangle around
  // the five boroughs also contained Jersey City, Hoboken and Newark, which
  // then went down the NYC path, failed PLUTO, and were billed at Con Ed rates.
  NYC_COUNTIES: ['New York County', 'Kings County', 'Queens County', 'Bronx County', 'Richmond County'],
  NYC_BOROUGHS: ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'The Bronx', 'Staten Island'],

  DATA_URLS: {
    status: '/data/state-status.json',
    energy: '/data/state-energy.json',
    grid: '/data/grid-emissions.json',
  },

  // What the visitor can say stands across from the balcony, and how far.
  // Heights are ~3 m a storey plus a parapet, taken at the middle of each band.
  ACROSS: {
    none:  { label: 'Nothing, an open view', heightM: 0 },
    low:   { label: '1 to 2 floors, or trees', heightM: 7 },
    mid:   { label: '3 to 5 floors', heightM: 13 },
    tall:  { label: '6 to 10 floors', heightM: 25 },
    tower: { label: '11 floors or more', heightM: 43 },
  },
  DISTANCE: {
    alley:  { label: 'Very close: an alley, courtyard or light well', distanceM: 8 },
    street: { label: 'Across a street', distanceM: 20 },
    wide:   { label: 'Across a wide road or parking lot', distanceM: 40 },
    far:    { label: 'Far away', distanceM: 80 },
  },

  STATE_NAMES: {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
    CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'the District of Columbia',
    FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
    IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
    ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
    MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
    NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
    NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
    PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
    TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
    WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  },

  _component(components, type, useShort) {
    const c = (components || []).find(x => (x.types || []).includes(type));
    return c ? (useShort ? c.short_name : c.long_name) : null;
  },

  stateCode(components) {
    const s = this._component(components, 'administrative_area_level_1', true);
    return s && this.STATE_NAMES[s] ? s : null;
  },

  zip(components) {
    const z = this._component(components, 'postal_code', true);
    return z && /^\d{5}/.test(z) ? z.slice(0, 5) : null;
  },

  isNYC(components) {
    if (this.stateCode(components) !== 'NY') return false;
    const county = this._component(components, 'administrative_area_level_2', false);
    if (county && this.NYC_COUNTIES.includes(county)) return true;
    const borough = this._component(components, 'sublocality_level_1', false)
      || this._component(components, 'sublocality', false);
    return !!borough && this.NYC_BOROUGHS.includes(borough);
  },

  /** Height of a balcony floor above the street, in metres. */
  balconyHeightM(floor) {
    const f = Math.max(1, Number(floor) || 1);
    return (f - 1) * 3.05 + 1.0;
  },

  /** Region profile for the five boroughs: exactly the numbers NYC always used. */
  nycProfile() {
    return {
      mode: 'nyc',
      stateCode: 'NY',
      stateName: 'New York',
      electricityRate: SolarConfig.ELECTRICITY_RATE,
      monthlyCustomerCharge: SolarConfig.MONTHLY_CUSTOMER_CHARGE,
      rateSource: 'coned_marginal',
      rateLabel: 'Con Edison SC-1 all-in marginal rate',
      co2Factor: SolarConfig.CO2_FACTOR,
      co2Label: 'EPA eGRID2023, NYC/Westchester (NYCW)',
      defaultMonthlyBill: null,
      legal: null,
    };
  },

  /**
   * Region profile for a US address outside NYC.
   * @returns {object|null} null when the state has no rate data
   */
  usProfile(state, zip, data) {
    if (!data || !data.energy || !data.energy.states) return null;
    const energy = data.energy.states[state];
    if (!energy || !Number.isFinite(energy.cents)) return null;

    const rate = energy.cents / 100;
    let co2Factor = null, co2Label = null;
    const grid = data.grid || {};
    // Hawaii and Alaska need the full ZIP: one prefix spans separate grids.
    const sub = !zip ? null
      : (grid.zip5 && grid.zip5[zip]) || (grid.zip3 && grid.zip3[zip.slice(0, 3)]) || null;
    const subData = sub && grid.subregions ? grid.subregions[sub] : null;
    if (subData && Number.isFinite(subData.co2_lb_per_mwh)) {
      co2Factor = subData.co2_lb_per_mwh / 1000;
      co2Label = 'EPA eGRID2023, ' + subData.name + ' (' + sub + ')';
    }

    return {
      mode: 'us',
      stateCode: state,
      stateName: this.STATE_NAMES[state],
      electricityRate: rate,
      // An average price already spreads the fixed charges over every kWh,
      // so subtracting a customer charge as well would count it twice.
      monthlyCustomerCharge: 0,
      rateSource: 'eia_state_avg',
      rateLabel: this.STATE_NAMES[state].replace(/^the /, '') + ' average residential price (EIA, ' +
        (data.energy.period_label || 'latest 12 months') + ')',
      co2Factor,
      co2Label,
      defaultMonthlyBill: Number.isFinite(energy.avg_monthly_kwh)
        ? Math.round(energy.avg_monthly_kwh * rate / 5) * 5
        : null,
      legal: data.status && data.status.states ? (data.status.states[state] || null) : null,
    };
  },

  /**
   * One sentence on whether plug-in solar is allowed where the visitor lives.
   * The only place a legal status becomes words, so the calculator and the
   * state pages cannot drift apart. Unknown never reads as permission.
   */
  legalCopy(entry, stateName) {
    const where = stateName || 'your state';
    const status = entry && entry.status;
    const bills = entry && entry.bills && entry.bills.length
      ? entry.bills.map(b => b.id).join(' / ') : null;
    switch (status) {
      case 'in_force':
        return where.charAt(0).toUpperCase() + where.slice(1) + ' has a plug-in solar law in effect' +
          (bills ? ' (' + bills + ')' : '') + '. Check its size limit and equipment rules, and your lease or building rules, before you buy.';
      case 'enacted_not_yet_effective':
        return where.charAt(0).toUpperCase() + where.slice(1) + ' has signed a plug-in solar law' +
          (bills ? ' (' + bills + ')' : '') + ' that is not in effect yet' +
          (entry.effective_date ? '; it takes effect ' + entry.effective_date : '') + '.';
      case 'passed_awaiting_signature':
        return 'A plug-in solar bill' + (bills ? ' (' + bills + ')' : '') + ' has passed ' + where +
          '’s legislature and awaits the Governor’s signature. Until it is signed, your utility’s approval is still required.';
      case 'pending':
        return 'A plug-in solar bill' + (bills ? ' (' + bills + ')' : '') + ' is pending in ' + where +
          '. Until one passes, your utility’s interconnection rules apply, which usually means approval is required.';
      case 'failed_or_vetoed':
        return 'A plug-in solar bill in ' + where + ' did not become law. Your utility’s interconnection rules apply, which usually means approval is required.';
      case 'no_specific_law':
        return where.charAt(0).toUpperCase() + where.slice(1) + ' has no plug-in solar law we know of. Your utility’s interconnection rules apply, which usually means approval is required.';
      default:
        return 'We have not reviewed ' + where + '’s rules yet. Check with your utility before plugging anything in.';
    }
  },

  /**
   * Monthly kWh for a state's reference city when PVWatts cannot be reached,
   * scaled from the published state runs (data/solar-fallback.json). Exact
   * runs exist for a vertical panel in eight directions and a south panel at
   * 35, 60 and 70 degrees; any other tilt is scaled from the vertical run in
   * that direction by the south tilt ratio.
   * @returns {{monthly: number[], city: string}|null} kWh for systemWatts, before railing loss
   */
  fallbackMonthly(entry, tilt, azimuth, systemWatts, baseWatts) {
    if (!entry || !entry.monthly) return null;
    const m = entry.monthly;
    const scale = (systemWatts || 800) / (baseWatts || 800);
    let series = m[tilt + '_' + azimuth];
    if (!series && m['90_' + azimuth] && m[tilt + '_180'] && m['90_180']) {
      const vertical = m['90_' + azimuth];
      series = vertical.map((v, i) => m['90_180'][i] > 0 ? v * m[tilt + '_180'][i] / m['90_180'][i] : v);
    }
    return series ? { monthly: series.map(v => v * scale), city: entry.city } : null;
  },

  _fallbackPromise: null,

  loadFallback() {
    if (!this._fallbackPromise) {
      this._fallbackPromise = fetch('/data/solar-fallback.json')
        .then(r => { if (!r.ok) throw new Error('solar-fallback.json ' + r.status); return r.json(); })
        .catch(err => { this._fallbackPromise = null; throw err; });
    }
    return this._fallbackPromise;
  },

  _dataPromise: null,

  /** Fetch the region data files once per page load. */
  loadData() {
    if (!this._dataPromise) {
      const get = url => fetch(url).then(r => {
        if (!r.ok) throw new Error(url + ' returned ' + r.status);
        return r.json();
      });
      this._dataPromise = Promise.all([
        get(this.DATA_URLS.status), get(this.DATA_URLS.energy), get(this.DATA_URLS.grid),
      ]).then(([status, energy, grid]) => ({ status, energy, grid }))
        .catch(err => { this._dataPromise = null; throw err; });
    }
    return this._dataPromise;
  },
};

// Node/test harness support — harmless in the browser.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Regions };
}
