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
// ============================================================

const SolarConfig = {
  // Google Maps JavaScript API — domain-restricted in Google Cloud Console
  // Used for: Places Autocomplete, Geocoding
  GOOGLE_API_KEY: 'AIzaSyD98VWa0RmHcZjcSUsT7SP5XvD-qvSLh-I',

  // NREL API key — free, client-safe, get from https://developer.nlr.gov/signup/
  // Rate limit: 1,000 requests/hour
  NREL_API_KEY: '0qnbmiSy2vzn6k9dxl57JK1XQZqTa4khtUBgQd1r',

  // NYC Socrata app token — optional, increases rate limits
  // Without token: throttled. With token: 1,000 req/hour
  // Get from: https://data.cityofnewyork.us/profile/edit/developer_settings
  SOCRATA_APP_TOKEN: '',

  // Endpoints
  GEOCLIENT_PROXY_URL: '/api/geoclient',
  PVWATTS_URL: 'https://developer.nlr.gov/api/pvwatts/v8.json',
  SOLAR_RESOURCE_URL: 'https://developer.nlr.gov/api/solar/solar_resource/v1.json',
  PLUTO_URL: 'https://data.cityofnewyork.us/resource/64uk-42ks.json',
  FOOTPRINTS_URL: 'https://data.cityofnewyork.us/resource/5zhs-2jue.geojson',
  VISUALIZE_V3_URL: '/api/visualize-v3',

  // NYC bounds for autocomplete biasing
  NYC_BOUNDS: {
    south: 40.4774,
    west: -74.2591,
    north: 40.9176,
    east: -73.7004,
  },

  // ---- Economics ----
  // Reviewed 2026-08-31. Re-check the rate each January against Con Ed's
  // published SC-1 bill history and the standing rate-case settlement.

  // Con Edison SC-1 residential all-in marginal rate (supply + delivery +
  // GRT + sales tax), 2026. Source: Con Ed historical bill table 2023-2025
  // (2025 avg 33.83 c/kWh) + 2026 rate case settlement approved 2026-01-22 (+3.5%).
  ELECTRICITY_RATE: 0.34,

  // Fixed monthly Customer Charge, excluded from the marginal rate above
  // because solar cannot offset it. Subtracted from the user's stated bill
  // before inferring their consumption.
  MONTHLY_CUSTOMER_CHARGE: 20,

  RATE_ESCALATION: 0.03,
  RATE_ESCALATION_PRESETS: { low: 0.02, mid: 0.03, high: 0.04 },

  // Mid-tier degradation (default). Tier-aware override below.
  // Source: NREL 2024 PV degradation review.
  PANEL_DEGRADATION: 0.005,
  PANEL_DEGRADATION_BY_TIER: { budget: 0.007, mid: 0.005, premium: 0.004 },

  // 2026 retail for an 800W kit; scaled linearly by system size.
  // Reviewed 2026-08-31 against the July 2026 price move: Bright Saver
  // (nonprofit, zero markup) sells 360W at $414 to members / $699 retail,
  // i.e. roughly $1.15-1.94/W, and Craftstrom's 800W sits at $1,327-1,600.
  // The previous $1,200/1,500/1,800 tiers pre-dated that shift and made
  // payback look roughly 40% longer than the cheapest real path.
  SYSTEM_COST_BY_TIER: { budget: 850, mid: 1200, premium: 1600 },

  // PVWatts already models cell temperature via TMY weather (array_type: 0).
  // Keep at 1.0 to avoid double-counting.
  THERMAL_BONUS: 1.0,

  // Railing, mounting hardware and the balcony floor above clip the bottom
  // edge of a railing-mounted panel. Building footprints cannot see this, and
  // PVWatts assumes an unobstructed module, so it is applied separately.
  // Vertical rail mounts lose the most; a top-mounted tilted panel clears it.
  // Field reports for vertical balcony mounts put the loss at 5-8%.
  RAILING_OBSTRUCTION_BY_TILT: { 90: 0.95, 70: 0.97, 60: 0.98, 35: 0.99 },

  // EPA eGRID2023 NYCW subregion output emission rate (released 2025)
  CO2_FACTOR: 0.89, // lbs CO2 per kWh (NYC grid)

  // PVWatts reference: annual kWh per kW DC for NYC at optimal tilt (~40°)
  // Aligned with NYSERDA NY Solar Map (1,238) split with calc's prior 1,400.
  PVWATTS_NYC_KWH_PER_KW_OPTIMAL: 1300,
};
