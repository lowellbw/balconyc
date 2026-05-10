// ============================================================
// balco.nyc Solar Calculator — API Configuration
// ============================================================
// API keys and endpoint URLs for all external services.
// For local dev, override keys here. For production, use
// domain-restricted keys (Google) or env vars (Geoclient).
// ============================================================

const SolarConfig = {
  // Google Maps JavaScript API — domain-restricted in Google Cloud Console
  // Used for: Places Autocomplete, Geocoding
  GOOGLE_API_KEY: 'AIzaSyD98VWa0RmHcZjcSUsT7SP5XvD-qvSLh-I',

  // NREL API key — free, client-safe, get from https://developer.nrel.gov/signup/
  // Rate limit: 1,000 requests/hour
  NREL_API_KEY: '0qnbmiSy2vzn6k9dxl57JK1XQZqTa4khtUBgQd1r',

  // NYC Socrata app token — optional, increases rate limits
  // Without token: throttled. With token: 1,000 req/hour
  // Get from: https://data.cityofnewyork.us/profile/edit/developer_settings
  SOCRATA_APP_TOKEN: '',

  // Endpoints
  GEOCLIENT_PROXY_URL: '/api/geoclient',
  PVWATTS_URL: 'https://developer.nrel.gov/api/pvwatts/v8.json',
  SOLAR_RESOURCE_URL: 'https://developer.nrel.gov/api/solar/solar_resource/v1.json',
  PLUTO_URL: 'https://data.cityofnewyork.us/resource/64uk-42ks.json',
  FOOTPRINTS_URL: 'https://data.cityofnewyork.us/resource/5zhs-2jue.geojson',
  VISUALIZE_URL: '/api/visualize',
  VISUALIZE_V3_URL: '/api/visualize-v3',

  // NYC bounds for autocomplete biasing
  NYC_BOUNDS: {
    south: 40.4774,
    west: -74.2591,
    north: 40.9176,
    east: -73.7004,
  },

  // Con Edison SC-1 residential all-in rate (supply + delivery), 2026 marginal
  // Source: Con Ed historical bill table 2023-2025 + 2026 rate case settlement (+3.5%)
  ELECTRICITY_RATE: 0.34,
  RATE_ESCALATION: 0.03,
  RATE_ESCALATION_PRESETS: { low: 0.02, mid: 0.03, high: 0.04 },

  // Mid-tier degradation (default). Tier-aware override below.
  PANEL_DEGRADATION: 0.005,
  PANEL_DEGRADATION_BY_TIER: { budget: 0.007, mid: 0.005, premium: 0.004 },

  // 2026 retail for an 800W kit; scaled linearly by system size
  SYSTEM_COST_BY_TIER: { budget: 1200, mid: 1500, premium: 1800 },

  // PVWatts already models cell temperature via TMY weather (array_type: 0).
  // Keep at 1.0 to avoid double-counting.
  THERMAL_BONUS: 1.0,

  // EPA eGRID2023 NYCW subregion output emission rate
  CO2_FACTOR: 0.89, // lbs CO2 per kWh (NYC grid)

  // PVWatts reference: annual kWh per kW DC for NYC at optimal tilt (~40°)
  // Aligned with NYSERDA NY Solar Map (1,238) split with calc's prior 1,400.
  PVWATTS_NYC_KWH_PER_KW_OPTIMAL: 1300,
};
