// ============================================================
// balco.nyc Solar Calculator — API Configuration
// ============================================================
// API keys and endpoint URLs for all external services.
//
// The Google and NREL keys below are CLIENT-SIDE BY DESIGN: this is a
// static site with no build step, so they ship to the browser and are
// public. That is safe only because of how they are restricted:
//   - Google: locked to the balco.nyc HTTP referrer in Cloud Console,
//     and limited to Maps JavaScript + Places. Verify before rotating.
//   - NREL: free tier, rate-limited, no billing attached.
// Anything that is genuinely secret (Geoclient, Gemini) lives in Vercel
// environment variables and is reached through /api/* proxies instead.
//
// Every modelling constant here is explained, with the alternatives that
// were rejected, in docs/modeling-decisions.md. Change a constant there
// first (or at least in the same commit), and add a failing test before
// changing a number the public methodology quotes.
// ============================================================

const SolarConfig = {
  // Google Maps JavaScript API — domain-restricted in Google Cloud Console
  // Used for: Places Autocomplete, Geocoding
  GOOGLE_API_KEY: 'AIzaSyD98VWa0RmHcZjcSUsT7SP5XvD-qvSLh-I',

  // NREL/NLR API key: free, client-safe, get from https://developer.nlr.gov/signup/
  // Rate limit: 1,000 requests/hour
  NREL_API_KEY: '0qnbmiSy2vzn6k9dxl57JK1XQZqTa4khtUBgQd1r',

  // NYC Socrata app token — optional, increases rate limits
  // Without token: throttled. With token: 1,000 req/hour
  // Get from: https://data.cityofnewyork.us/profile/edit/developer_settings
  SOCRATA_APP_TOKEN: '',

  // Endpoints. NREL became the National Laboratory of the Rockies in 2025 and
  // the nrel.gov zone was withdrawn from DNS; the API lives on nlr.gov.
  GEOCLIENT_PROXY_URL: '/api/geoclient',
  PVWATTS_URL: 'https://developer.nlr.gov/api/pvwatts/v8.json',
  PLUTO_URL: 'https://data.cityofnewyork.us/resource/64uk-42ks.json',
  FOOTPRINTS_URL: 'https://data.cityofnewyork.us/resource/5zhs-2jue.geojson',
  // NYC Parks Forestry Tree Points (live street-tree inventory: location, DBH)
  TREES_URL: 'https://data.cityofnewyork.us/resource/hn5i-inap.json',

  // NYC bounds for autocomplete biasing
  NYC_BOUNDS: {
    south: 40.4774,
    west: -74.2591,
    north: 40.9176,
    east: -73.7004,
  },

  // ---- PVWatts V8 parameters (single source of truth; also read by
  // scripts/build-pvwatts-table.mjs so the offline table matches) ----
  PVWATTS_PARAMS: {
    module_type: 1,        // V8 "Premium": 21% STC, -0.35 %/degC, AR glass (closest to kit modules)
    array_type: 0,         // fixed open rack: a rail-hung panel has air on both faces (NOCT 45 C)
    gcr: 0.01,             // one panel, no row in front of it: disables PVWatts' row self-shading
    losses: 9,             // kit bundle: mismatch 0.5, wiring 1, connections 0.5, LID 1.5,
                           // nameplate 1, availability 3, snow 1 (compounds to 8.2%). Soiling
                           // and shading are modelled separately, so they are NOT in here.
    inv_eff: 96.5,         // micro-inverter CEC efficiency (Enphase IQ8 97.0, budget units 96 to 96.5)
    dataset: 'nsrdb',      // NSRDB PSM V3 typical year, 4 km cell
    use_wf_albedo: 1,      // ground reflectance from the weather file (NYC mean 0.13, snow to 0.87)
    albedo: 0.2,           // only used if the weather file lacks a value
    bifaciality: 0,        // monofacial; PVWatts' rear model does not fit a wall-backed panel
    // Monthly soiling loss (%), Jan..Dec. Vertical panels are rain-cleaned and
    // shed dust (field studies: 0.05 %/day at 90 deg vs 1.21 %/day flat); the
    // Northeast is a low-soiling region. Pollen peaks April to June.
    soiling_vertical: [1, 1, 2, 3, 3, 2, 2, 2, 2, 1, 1, 1],
    soiling_tilted: [2, 2, 3, 4, 4, 3, 3, 3, 3, 2, 2, 2],
  },
  // AC output limit of the kit's inverter. The SUNNY Act caps plug-in devices
  // at 1,200 W AC; most US kits are 800 W. dc_ac_ratio is derived from this.
  INVERTER_AC_WATTS_DEFAULT: 800,
  INVERTER_AC_OPTIONS: [800, 1200],

  // ---- Economics ----
  // Reviewed 2026-09-03. Re-check the rate each January against Con Ed's
  // published SC-1 bill history and the standing rate-case settlement.

  // Con Edison SC-1 residential all-in marginal rate (supply + delivery +
  // GRT + sales tax, excluding the customer charge), 2026 central estimate.
  // Con Ed's own NYC SC-1 table gives 33.83 c/kWh for 2025 (at 300 kWh,
  // grossed up for taxes); the PSC approved +3.5% delivery for 2026 and Con
  // Ed projected +5.7% for summer 2026 on supply, hence 35 c.
  ELECTRICITY_RATE: 0.35,
  // EIA 2025 US residential average, for the "how does Con Ed compare" copy.
  US_AVG_RESIDENTIAL_RATE: 0.173,

  // Fixed monthly Customer Charge (SC-1 Rate I leaf effective 2026-02-01),
  // excluded from the marginal rate because solar cannot offset it.
  MONTHLY_CUSTOMER_CHARGE: 21,

  RATE_ESCALATION: 0.03,
  RATE_ESCALATION_PRESETS: { low: 0.02, mid: 0.03, high: 0.04 },

  // System-level degradation per year. Module medians are 0.35 to 0.55 %/yr
  // (NREL PV Lifetime 2024); fleet systems 0.5 to 0.75 %/yr median with a
  // P90 of 1.9 (Deline et al. 2024, NREL/TP-5K00-88769; Jordan et al. 2022).
  PANEL_DEGRADATION: 0.006,
  PANEL_DEGRADATION_BY_TIER: { budget: 0.009, mid: 0.006, premium: 0.004 },

  // 2026 retail for an 800W kit; scaled linearly by system size.
  // (Kit prices were deliberately left out of the September 2026 fix round.)
  SYSTEM_COST_BY_TIER: { budget: 850, mid: 1200, premium: 1600 },

  // Plug-in kit inverters carry 10 to 12 year warranties, so a 25-year
  // projection budgets one replacement at about 30% of the kit price.
  ANALYSIS_YEARS: 25,
  INVERTER_REPLACEMENT: { year: 12, fraction: 0.30 },
  // General inflation used to restate the nominal 25-year total in today's dollars.
  INFLATION_FOR_REAL_TERMS: 0.025,

  // PVWatts models cell temperature via TMY weather. Kept at 1.0 (neutral).
  THERMAL_BONUS: 1.0,

  // Railing and mounting hardware clip the bottom edge of a rail-hung panel.
  // Footprints cannot see this and PVWatts assumes an unobstructed module.
  // The balcony slab above is modelled geometrically (MOUNT_TYPES), not here.
  RAILING_OBSTRUCTION_BY_TILT: { 90: 0.95, 70: 0.97, 60: 0.98, 35: 0.99 },

  // Where the panel sits relative to the balcony slab above it. overhangM is
  // how far the slab edge projects beyond the panel plane; it becomes an upper
  // altitude limit on the sky the panel can see.
  MOUNT_TYPES: {
    rail:  { label: 'Hangs outside the railing', overhangM: 0.0 },
    floor: { label: 'Stands on the balcony floor', overhangM: 0.6 },
    wall:  { label: 'Mounted on the back wall', overhangM: 1.5 },
  },
  MOUNT_TYPE_DEFAULT: 'rail',

  // Vertical geometry of the balcony. Storey height comes from the building
  // (roof height / floors) clamped to a plausible range, because height_roof
  // includes bulkheads and parapets; the panel centre sits about 0.8 m above
  // the slab of its floor; the slab above is one storey up.
  STOREY_M: { default: 3.0, min: 2.7, max: 4.5 },
  PANEL_CENTRE_ABOVE_SLAB_M: 0.8,
  DEFAULT_BUILDING_HEIGHT_FT: 40,
  DEFAULT_TOTAL_FLOORS: 20,
  FT_PER_FLOOR_ESTIMATE: 10,

  // Which neighbouring footprints feed the horizon profile. Everything close
  // by, plus only the tall buildings further out (a 100 m building matters to
  // about 500 m, a 250 m tower to 1.4 km). Queries use intersects(), not
  // within_circle(), because containment drops the large footprints that are
  // exactly the tall buildings.
  NEIGHBOR_QUERIES: [
    { radiusM: 200,  minHeightFt: 0,   limit: 1500 },
    { radiusM: 500,  minHeightFt: 150, limit: 1500 },
    { radiusM: 1500, minHeightFt: 350, limit: 1500 },
  ],
  // Only footprints within this radius are drawn in the 3D scene; the rest
  // are shade-only.
  SCENE_RADIUS_M: 200,

  // Street trees (NYC Parks Forestry Tree Points). Crown size from trunk
  // diameter (DBH, inches): top = min(topMaxM, topA + topB*DBH), radius =
  // min(radiusMaxM, radiusA + radiusB*DBH), base 3 m. Leaves block about 80%
  // of light in season, bare branches about 40%.
  TREE_QUERY: { radiusM: 80, limit: 400 },
  TREE_MODEL: {
    crownBaseM: 3, crownTopA: 4, crownTopB: 0.55, crownTopMaxM: 22,
    radiusA: 1.2, radiusB: 0.30, radiusMaxM: 8,
    transmittanceLeaf: 0.2, transmittanceBare: 0.6,
    leafMonths: [4, 5, 6, 7, 8, 9],   // May to October (0-based)
  },

  // Static shade fallback for addresses with no footprint data: the visitor's
  // description of the block is mapped to a canonical street canyon (street
  // width, opposite-row height) and the real horizon model is run on it.
  CANONICAL_CANYONS: {
    open:        null,
    some:        { streetM: 18, oppositeM: 24 },
    dense:       { streetM: 18, oppositeM: 45 },
    wide_avenue: { streetM: 30, oppositeM: 30 },
  },

  // ---- Environmental ----
  // EPA eGRID2023 (Rev 2, June 2025) NYCW subregion output emission rate,
  // 864.5 lb CO2/MWh. This is the average-grid figure; EPA's own avoided-
  // emissions method would use the non-baseload rate (976.9 lb/MWh = 0.98).
  // Presented as a year-one figure; the grid decarbonises over 25 years.
  CO2_FACTOR: 0.86,
  CO2_FACTOR_NONBASELOAD: 0.98,
  // EPA Greenhouse Gas Equivalencies Calculator (2024 revision):
  // 0.060 t CO2 per urban tree per year (132 lb); 400 g CO2 per mile for a
  // typical passenger vehicle (0.88 lb); 0.019 kWh per smartphone charge.
  CO2_PER_TREE_LB: 132,
  CAR_LB_PER_MILE: 0.88,
  PHONE_CHARGE_KWH: 0.019,
};
