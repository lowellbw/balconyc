// ============================================================
// balco.nyc Solar Calculator — API Integration & Energy Model
// ============================================================
// Depends on: js/config.js (loaded first)
// ============================================================

// --- GLOBAL STATE ---
// Holds all data gathered through the address → lookup → calculate pipeline
const SolarState = {
  // From geocoding
  lat: null,
  lon: null,
  address: null,
  addressComponents: null,

  // From NYC Geoclient
  bbl: null,
  bin: null,

  // From PLUTO
  numfloors: null,
  yearbuilt: null,
  bldgclass: null,
  unitsres: null,
  bldgarea: null,
  zonedist1: null,

  // From Building Footprints
  heightroof: null,
  groundelev: null,
  footprintCoords: null,
  orientationSuggestion: null,

  // From NREL Solar Resource
  solarResource: null,
  monthlyDistribution: null, // normalized GHI distribution from API

  // From PVWatts
  pvwattsResult: null,

  // From neighbor buildings query
  neighborBuildings: null,

  // Tracking which APIs succeeded
  dataSources: {
    googlePlaces: false,
    geoclient: false,
    pluto: false,
    footprints: false,
    solarResource: false,
    pvwatts: false,
    neighbors: false,
  },

  // Reset state for a new address
  reset() {
    this.lat = null;
    this.lon = null;
    this.address = null;
    this.addressComponents = null;
    this.bbl = null;
    this.bin = null;
    this.numfloors = null;
    this.yearbuilt = null;
    this.bldgclass = null;
    this.unitsres = null;
    this.bldgarea = null;
    this.zonedist1 = null;
    this.heightroof = null;
    this.groundelev = null;
    this.footprintCoords = null;
    this.orientationSuggestion = null;
    this.solarResource = null;
    this.monthlyDistribution = null;
    this.pvwattsResult = null;
    this.neighborBuildings = null;
    Object.keys(this.dataSources).forEach(k => this.dataSources[k] = false);
  },
};


// --- CONSTANTS ---

// Tilt factor: production relative to optimal ~40° tilt
const TILT_FACTORS = {
  90: 0.72,  // Vertical railing mount
  70: 0.83,  // Angled mount
};

// Azimuth production factors relative to south-facing (180°)
const AZIMUTH_FACTORS = {
  0:   0.32, // North
  45:  0.45, // NE
  90:  0.72, // East
  135: 0.92, // SE
  180: 1.00, // South
  225: 0.92, // SW
  270: 0.72, // West
  315: 0.45, // NW
};

// Default monthly production distribution for NYC (from NREL solar resource data)
const DEFAULT_MONTHLY_DISTRIBUTION = [
  0.056, 0.068, 0.082, 0.092, 0.105, 0.112,
  0.114, 0.103, 0.088, 0.073, 0.056, 0.051,
];

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const DIRECTION_LABELS = {
  0: 'North', 45: 'Northeast', 90: 'East', 135: 'Southeast',
  180: 'South', 225: 'Southwest', 270: 'West', 315: 'Northwest',
};

// Borough zip code mapping for Geoclient
const BOROUGH_FROM_ZIP = {};
// Manhattan
['100','101','102','103','104','105','106','107','108','109','110','111','112','113','114','115','116','117','118','119','120','121','122','123','124','125','126','127','128','129','130'].forEach(z => BOROUGH_FROM_ZIP['10' + z.slice(1)] = 'manhattan');
// Fix: use actual NYC zip prefixes
const BOROUGH_ZIP_RANGES = [
  { prefix: '100', borough: 'manhattan' },
  { prefix: '101', borough: 'manhattan' },
  { prefix: '102', borough: 'manhattan' },
  { prefix: '103', borough: 'staten island' },
  { prefix: '104', borough: 'staten island' },
  { prefix: '110', borough: 'bronx' },
  { prefix: '111', borough: 'queens' },
  { prefix: '112', borough: 'brooklyn' },
  { prefix: '113', borough: 'queens' },
  { prefix: '114', borough: 'queens' },
  { prefix: '116', borough: 'queens' },
];

function getBoroughFromZip(zip) {
  if (!zip) return null;
  const z = zip.toString().substring(0, 3);
  const match = BOROUGH_ZIP_RANGES.find(r => r.prefix === z);
  return match ? match.borough : null;
}

function getBoroughFromComponents(components) {
  // Try sublocality first (e.g., "Manhattan", "Brooklyn")
  const sublocality = components.find(c =>
    c.types.includes('sublocality') || c.types.includes('sublocality_level_1')
  );
  if (sublocality) {
    const name = sublocality.long_name.toLowerCase();
    if (['manhattan', 'brooklyn', 'queens', 'bronx', 'staten island'].includes(name)) {
      return name;
    }
    // Handle "New York" meaning Manhattan
    if (name === 'new york') return 'manhattan';
  }

  // Try zip code
  const postal = components.find(c => c.types.includes('postal_code'));
  if (postal) {
    return getBoroughFromZip(postal.long_name);
  }

  return 'manhattan'; // default fallback
}


// --- SHADE FACTOR MODEL ---

function getShadeFactor(floor, totalFloors, shading) {
  const floorRatio = floor / totalFloors;

  let floorTier;
  if (floorRatio >= 0.85) floorTier = 'top';
  else if (floorRatio >= 0.55) floorTier = 'high';
  else if (floorRatio >= 0.25) floorTier = 'mid';
  else floorTier = 'low';

  const matrix = {
    top:  { open: 0.96, some: 0.93, dense: 0.85, wide_avenue: 0.95 },
    high: { open: 0.93, some: 0.88, dense: 0.78, wide_avenue: 0.90 },
    mid:  { open: 0.88, some: 0.82, dense: 0.72, wide_avenue: 0.84 },
    low:  { open: 0.78, some: 0.68, dense: 0.60, wide_avenue: 0.75 },
  };

  return matrix[floorTier][shading] || 0.80;
}


// --- API HELPERS ---

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) {
      // One retry on 429 (rate limit)
      if (response.status === 429) {
        await new Promise(r => setTimeout(r, 1000));
        const retry = await fetch(url, options);
        if (!retry.ok) throw new Error(`HTTP ${retry.status}`);
        return retry;
      }
      throw new Error(`HTTP ${response.status}`);
    }
    return response;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}


// --- API METHODS ---

const SolarAPI = {

  // ---- Google Places Autocomplete ----
  autocompleteInstance: null,

  initAutocomplete(inputElement, onPlaceSelected) {
    if (typeof google === 'undefined' || !google.maps || !google.maps.places) {
      console.warn('[SolarAPI] Google Maps API not loaded, skipping autocomplete');
      return false;
    }

    const bounds = new google.maps.LatLngBounds(
      new google.maps.LatLng(SolarConfig.NYC_BOUNDS.south, SolarConfig.NYC_BOUNDS.west),
      new google.maps.LatLng(SolarConfig.NYC_BOUNDS.north, SolarConfig.NYC_BOUNDS.east)
    );

    this.autocompleteInstance = new google.maps.places.Autocomplete(inputElement, {
      bounds: bounds,
      strictBounds: true,
      componentRestrictions: { country: 'us' },
      types: ['address'],
      fields: ['geometry', 'formatted_address', 'address_components'],
    });

    this.autocompleteInstance.addListener('place_changed', () => {
      const place = this.autocompleteInstance.getPlace();
      if (!place.geometry) {
        console.warn('[SolarAPI] Place has no geometry');
        return;
      }

      SolarState.lat = place.geometry.location.lat();
      SolarState.lon = place.geometry.location.lng();
      SolarState.address = place.formatted_address;
      SolarState.addressComponents = place.address_components;
      SolarState.dataSources.googlePlaces = true;

      console.log(`[SolarAPI] Address selected: ${SolarState.address} (${SolarState.lat}, ${SolarState.lon})`);

      if (onPlaceSelected) onPlaceSelected(place);
    });

    return true;
  },

  // ---- NYC Geoclient (via proxy) ----
  async fetchGeoclient(addressComponents) {
    try {
      const streetNumber = addressComponents.find(c => c.types.includes('street_number'));
      const route = addressComponents.find(c => c.types.includes('route'));

      if (!streetNumber || !route) {
        console.warn('[SolarAPI] Cannot parse address for Geoclient');
        return null;
      }

      const houseNumber = streetNumber.long_name;
      const street = route.long_name;
      const borough = getBoroughFromComponents(addressComponents);

      const params = new URLSearchParams({ houseNumber, street, borough });
      const url = `${SolarConfig.GEOCLIENT_PROXY_URL}?${params}`;

      console.log(`[SolarAPI] Geoclient: ${houseNumber} ${street}, ${borough}`);
      const startTime = performance.now();

      const response = await fetchWithTimeout(url);
      const data = await response.json();

      console.log(`[SolarAPI] Geoclient responded in ${(performance.now() - startTime).toFixed(0)}ms`);

      if (data.error) {
        console.warn('[SolarAPI] Geoclient error:', data.error);
        return null;
      }

      // Extract from Geoclient response structure
      const result = data.address || data.result || data;
      SolarState.bbl = result.bbl || result.borough_block_lot || null;
      SolarState.bin = result.buildingIdentificationNumber || result.bin || null;
      SolarState.dataSources.geoclient = true;

      console.log(`[SolarAPI] Geoclient: BBL=${SolarState.bbl}, BIN=${SolarState.bin}`);
      return { bbl: SolarState.bbl, bin: SolarState.bin };
    } catch (err) {
      console.warn('[SolarAPI] Geoclient failed:', err.message);
      return null;
    }
  },

  // ---- NYC PLUTO ----
  async fetchPLUTO() {
    try {
      const startTime = performance.now();
      let url;

      if (SolarState.bbl) {
        const params = new URLSearchParams({
          '$where': `bbl='${SolarState.bbl}'`,
          '$select': 'address,bldgclass,numfloors,unitsres,yearbuilt,bldgarea,zonedist1,bbl',
          '$limit': '5',
        });
        url = `${SolarConfig.PLUTO_URL}?${params}`;
      } else if (SolarState.address) {
        // Fallback: search by address string
        const street = SolarState.address.split(',')[0].toUpperCase();
        const params = new URLSearchParams({
          '$where': `upper(address) LIKE '%${street}%'`,
          '$select': 'address,bldgclass,numfloors,unitsres,yearbuilt,bldgarea,zonedist1,bbl',
          '$limit': '5',
        });
        url = `${SolarConfig.PLUTO_URL}?${params}`;
      } else {
        return null;
      }

      if (SolarConfig.SOCRATA_APP_TOKEN) {
        url += `&$$app_token=${SolarConfig.SOCRATA_APP_TOKEN}`;
      }

      console.log('[SolarAPI] Querying PLUTO...');
      const response = await fetchWithTimeout(url);
      const data = await response.json();

      console.log(`[SolarAPI] PLUTO responded in ${(performance.now() - startTime).toFixed(0)}ms, ${data.length} results`);

      if (data.length === 0) return null;

      const bldg = data[0];
      SolarState.numfloors = bldg.numfloors ? parseInt(bldg.numfloors) : null;
      SolarState.yearbuilt = bldg.yearbuilt ? parseInt(bldg.yearbuilt) : null;
      SolarState.bldgclass = bldg.bldgclass || null;
      SolarState.unitsres = bldg.unitsres ? parseInt(bldg.unitsres) : null;
      SolarState.bldgarea = bldg.bldgarea ? parseInt(bldg.bldgarea) : null;
      SolarState.zonedist1 = bldg.zonedist1 || null;
      if (!SolarState.bbl && bldg.bbl) SolarState.bbl = bldg.bbl;
      SolarState.dataSources.pluto = true;

      console.log(`[SolarAPI] PLUTO: ${SolarState.numfloors} floors, built ${SolarState.yearbuilt}, class ${SolarState.bldgclass}`);
      return bldg;
    } catch (err) {
      console.warn('[SolarAPI] PLUTO failed:', err.message);
      return null;
    }
  },

  // ---- NYC Building Footprints + Orientation ----
  async fetchFootprints() {
    try {
      const startTime = performance.now();
      let url;

      if (SolarState.bin) {
        const params = new URLSearchParams({
          '$where': `bin='${SolarState.bin}'`,
          '$select': 'bin,height_roof,ground_elevation,the_geom',
          '$limit': '1',
        });
        url = `${SolarConfig.FOOTPRINTS_URL}?${params}`;
      } else if (SolarState.lat && SolarState.lon) {
        // Fallback: nearest building by location
        const params = new URLSearchParams({
          '$where': `within_circle(the_geom, ${SolarState.lat}, ${SolarState.lon}, 50)`,
          '$select': 'bin,height_roof,ground_elevation,the_geom',
          '$limit': '1',
        });
        url = `${SolarConfig.FOOTPRINTS_URL}?${params}`;
      } else {
        return null;
      }

      if (SolarConfig.SOCRATA_APP_TOKEN) {
        url += `&$$app_token=${SolarConfig.SOCRATA_APP_TOKEN}`;
      }

      console.log('[SolarAPI] Querying Building Footprints...');
      const response = await fetchWithTimeout(url);
      const data = await response.json();

      console.log(`[SolarAPI] Footprints responded in ${(performance.now() - startTime).toFixed(0)}ms`);

      // Handle both GeoJSON FeatureCollection and plain array responses
      const features = data.features || data;
      if (!features || features.length === 0) return null;

      const feature = features[0];
      const props = feature.properties || feature;
      const geom = feature.geometry || (feature.the_geom ? JSON.parse(feature.the_geom) : null);

      SolarState.heightroof = (props.height_roof || props.heightroof) ? parseFloat(props.height_roof || props.heightroof) : null;
      SolarState.groundelev = (props.ground_elevation || props.groundelev) ? parseFloat(props.ground_elevation || props.groundelev) : null;
      if (!SolarState.bin && props.bin) SolarState.bin = props.bin;

      // Extract polygon coordinates for orientation detection
      if (geom && geom.coordinates) {
        // MultiPolygon → take first polygon's exterior ring
        if (geom.type === 'MultiPolygon') {
          SolarState.footprintCoords = geom.coordinates[0][0];
        } else if (geom.type === 'Polygon') {
          SolarState.footprintCoords = geom.coordinates[0];
        }
      }

      // Run orientation detection
      if (SolarState.footprintCoords) {
        SolarState.orientationSuggestion = this.detectOrientation(SolarState.footprintCoords);
      }

      SolarState.dataSources.footprints = true;
      console.log(`[SolarAPI] Footprints: height=${SolarState.heightroof}ft, orientation=${JSON.stringify(SolarState.orientationSuggestion)}`);
      return feature;
    } catch (err) {
      console.warn('[SolarAPI] Footprints failed:', err.message);
      return null;
    }
  },

  // ---- Orientation Algorithm (spec Section 2.4) ----
  detectOrientation(coords) {
    if (!coords || coords.length < 3) return null;

    // Compute edge lengths and perpendicular facade directions
    const edges = [];
    for (let i = 0; i < coords.length - 1; i++) {
      const p1 = coords[i];
      const p2 = coords[i + 1];
      const dx = p2[0] - p1[0]; // longitude (east-west)
      const dy = p2[1] - p1[1]; // latitude (north-south)
      const length = Math.sqrt(dx * dx + dy * dy);

      // Edge direction (compass bearing)
      // atan2(dx, dy) gives angle from north, clockwise
      const edgeAngle = ((Math.atan2(dx, dy) * 180 / Math.PI) + 360) % 360;

      // Facades face perpendicular to the edge
      const facade1 = (edgeAngle + 90) % 360;
      const facade2 = (edgeAngle + 270) % 360;

      edges.push({ length, facadeAngles: [facade1, facade2] });
    }

    // Sort by edge length descending
    edges.sort((a, b) => b.length - a.length);

    if (edges.length === 0) return null;

    // Primary facades from the longest edge
    const primaryFacades = edges[0].facadeAngles;
    const secondaryFacades = edges.length > 1 ? edges[1].facadeAngles : null;

    // Map each facade angle to nearest 45° compass direction
    const allFacades = [...primaryFacades];
    if (secondaryFacades) allFacades.push(...secondaryFacades);

    const compassOptions = [0, 45, 90, 135, 180, 225, 270, 315];

    const mapped = allFacades.map(angle => {
      let bestDir = 180;
      let bestDiff = 360;
      for (const dir of compassOptions) {
        let diff = Math.abs(angle - dir);
        if (diff > 180) diff = 360 - diff;
        if (diff < bestDiff) {
          bestDiff = diff;
          bestDir = dir;
        }
      }
      return bestDir;
    });

    // Prefer south-ish directions for solar (rank by solar potential)
    const solarRank = { 180: 1, 135: 2, 225: 2, 90: 3, 270: 3, 45: 4, 315: 4, 0: 5 };
    mapped.sort((a, b) => (solarRank[a] || 5) - (solarRank[b] || 5));

    return {
      bestDirection: mapped[0],
      allDirections: [...new Set(mapped)],
      confidence: edges[0].length > 1.3 * (edges[1]?.length || 0) ? 'high' : 'medium',
    };
  },

  // ---- NREL Solar Resource ----
  async fetchSolarResource() {
    if (!SolarState.lat || !SolarState.lon) return null;
    if (!SolarConfig.NREL_API_KEY) {
      console.warn('[SolarAPI] No NREL API key, skipping Solar Resource');
      return null;
    }

    try {
      const startTime = performance.now();
      const params = new URLSearchParams({
        api_key: SolarConfig.NREL_API_KEY,
        lat: SolarState.lat.toString(),
        lon: SolarState.lon.toString(),
      });

      const url = `${SolarConfig.SOLAR_RESOURCE_URL}?${params}`;
      console.log('[SolarAPI] Fetching NREL Solar Resource...');

      const response = await fetchWithTimeout(url);
      const data = await response.json();

      console.log(`[SolarAPI] Solar Resource responded in ${(performance.now() - startTime).toFixed(0)}ms`);

      if (data.errors && data.errors.length > 0) {
        console.warn('[SolarAPI] Solar Resource errors:', data.errors);
        return null;
      }

      const outputs = data.outputs;
      SolarState.solarResource = outputs;

      // Normalize monthly GHI into a distribution array
      if (outputs && outputs.avg_ghi && outputs.avg_ghi.monthly) {
        const monthly = outputs.avg_ghi.monthly;
        const monthKeys = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
        const values = monthKeys.map(k => monthly[k] || 0);
        const total = values.reduce((s, v) => s + v, 0);
        if (total > 0) {
          SolarState.monthlyDistribution = values.map(v => v / total);
        }
      }

      SolarState.dataSources.solarResource = true;
      console.log(`[SolarAPI] Solar Resource: annual GHI = ${outputs?.avg_ghi?.annual} kWh/m²/day`);
      return outputs;
    } catch (err) {
      console.warn('[SolarAPI] Solar Resource failed:', err.message);
      return null;
    }
  },

  // ---- NREL PVWatts V8 ----
  async fetchPVWatts(params) {
    if (!SolarState.lat || !SolarState.lon) return null;
    if (!SolarConfig.NREL_API_KEY) {
      console.warn('[SolarAPI] No NREL API key, skipping PVWatts');
      return null;
    }

    try {
      const startTime = performance.now();
      const queryParams = new URLSearchParams({
        api_key: SolarConfig.NREL_API_KEY,
        system_capacity: params.systemCapacity.toString(),
        module_type: '1',       // Premium (19% efficiency, better temp coeff)
        array_type: '0',        // Fixed open rack (only option for balcony)
        tilt: params.tilt.toString(),
        azimuth: params.azimuth.toString(),
        lat: SolarState.lat.toString(),
        lon: SolarState.lon.toString(),
        losses: '22',           // Balcony-specific: higher than 14% rooftop default
        dc_ac_ratio: '1.2',
        inv_eff: '96.5',        // Micro-inverter efficiency (Enphase IQ8 ~97%, budget ~96%)
        dataset: 'nsrdb',
        timeframe: 'monthly',
        // NYC urban soiling profile — dustier than suburban, higher in summer (pollen)
        soiling: '[12,11,12,14,16,17,17,16,14,11,11,11]',
        // Concrete balcony ground reflectance (light-colored: ~0.30)
        albedo: '0.20',
        // Monofacial panels (set to 0.75 if selling bifacial panels)
        bifaciality: '0',
      });

      const url = `${SolarConfig.PVWATTS_URL}?${queryParams}`;
      console.log('[SolarAPI] Calling PVWatts V8...');

      const response = await fetchWithTimeout(url);
      const data = await response.json();

      console.log(`[SolarAPI] PVWatts responded in ${(performance.now() - startTime).toFixed(0)}ms`);

      if (data.errors && data.errors.length > 0) {
        console.warn('[SolarAPI] PVWatts errors:', data.errors);
        return null;
      }

      SolarState.pvwattsResult = data;
      SolarState.dataSources.pvwatts = true;

      console.log(`[SolarAPI] PVWatts: ac_annual=${data.outputs?.ac_annual} kWh, capacity_factor=${data.outputs?.capacity_factor}%`);
      return data;
    } catch (err) {
      console.warn('[SolarAPI] PVWatts failed:', err.message);
      return null;
    }
  },

  // ---- Neighboring Buildings (Phase 3 prep) ----
  async fetchNeighborBuildings() {
    if (!SolarState.lat || !SolarState.lon) return null;

    try {
      const startTime = performance.now();
      const params = new URLSearchParams({
        '$where': `within_circle(the_geom, ${SolarState.lat}, ${SolarState.lon}, 200)`,
        '$select': 'bin,height_roof,ground_elevation,the_geom',
        '$limit': '500',
      });
      let url = `${SolarConfig.FOOTPRINTS_URL}?${params}`;

      if (SolarConfig.SOCRATA_APP_TOKEN) {
        url += `&$$app_token=${SolarConfig.SOCRATA_APP_TOKEN}`;
      }

      console.log('[SolarAPI] Querying neighbor buildings (200m radius)...');
      const response = await fetchWithTimeout(url);
      const data = await response.json();

      const features = data.features || data;
      SolarState.neighborBuildings = features;
      SolarState.dataSources.neighbors = true;

      console.log(`[SolarAPI] Neighbors: ${features.length} buildings in ${(performance.now() - startTime).toFixed(0)}ms`);
      return features;
    } catch (err) {
      console.warn('[SolarAPI] Neighbor buildings failed:', err.message);
      return null;
    }
  },

  // ---- Parallel Building Data Pipeline (Ticket 5) ----
  async runBuildingLookup(onProgress) {
    // Step 1: Geoclient (needs to run first for BBL/BIN)
    if (SolarState.addressComponents) {
      if (onProgress) onProgress('geoclient', 'loading');
      await this.fetchGeoclient(SolarState.addressComponents);
      if (onProgress) onProgress('geoclient', SolarState.dataSources.geoclient ? 'done' : 'failed');
    }

    // Step 2: Parallel queries (PLUTO + Footprints + Solar Resource)
    if (onProgress) {
      onProgress('pluto', 'loading');
      onProgress('footprints', 'loading');
      onProgress('solarResource', 'loading');
    }

    const results = await Promise.allSettled([
      this.fetchPLUTO(),
      this.fetchFootprints(),
      this.fetchSolarResource(),
    ]);

    if (onProgress) {
      onProgress('pluto', results[0].status === 'fulfilled' && results[0].value ? 'done' : 'failed');
      onProgress('footprints', results[1].status === 'fulfilled' && results[1].value ? 'done' : 'failed');
      onProgress('solarResource', results[2].status === 'fulfilled' && results[2].value ? 'done' : 'failed');
    }

    // Step 3: Fire neighbor query in background (non-blocking)
    this.fetchNeighborBuildings();

    return {
      pluto: results[0].status === 'fulfilled' ? results[0].value : null,
      footprints: results[1].status === 'fulfilled' ? results[1].value : null,
      solarResource: results[2].status === 'fulfilled' ? results[2].value : null,
    };
  },

  // ---- Full Calculation (with API or fallback) ----
  async calculateEstimate(formInputs) {
    const {
      azimuth, tilt, systemWatts, floor, totalFloors,
      shading, monthlyBill, systemCost,
    } = formInputs;

    const systemKw = systemWatts / 1000;
    const adjustedCost = systemCost * (systemWatts / 800);
    const shadeFactor = getShadeFactor(floor, totalFloors, shading);

    let annualKwh;
    let monthlyKwh;
    let usedPVWatts = false;
    let pvwattsData = null;

    // Try PVWatts API if we have coordinates
    if (SolarState.lat && SolarState.lon && SolarConfig.NREL_API_KEY) {
      pvwattsData = await this.fetchPVWatts({
        systemCapacity: systemKw,
        tilt: tilt,
        azimuth: azimuth,
      });
    }

    if (pvwattsData && pvwattsData.outputs) {
      // Use real PVWatts data
      const outputs = pvwattsData.outputs;
      const rawAnnual = outputs.ac_annual;

      // Apply post-PVWatts multipliers (shade + thermal)
      // PVWatts already handles tilt, azimuth, and base losses
      // We only add shadow derating (building-level, not modeled by PVWatts)
      annualKwh = rawAnnual * shadeFactor * SolarConfig.THERMAL_BONUS;

      // Monthly values from PVWatts, scaled by shade + thermal
      const scale = shadeFactor * SolarConfig.THERMAL_BONUS;
      monthlyKwh = outputs.ac_monthly.map(v => v * scale);
      usedPVWatts = true;

      console.log(`[SolarAPI] Using PVWatts data: raw=${rawAnnual.toFixed(0)} kWh, after derating=${annualKwh.toFixed(0)} kWh`);
    } else {
      // Fallback: client-side formula (used when PVWatts API unavailable)
      const tiltFactor = TILT_FACTORS[tilt] || 0.72;
      const azimuthFactor = AZIMUTH_FACTORS[azimuth] || 0.72;

      // The baseline (1400 kWh/kW) assumes PVWatts default 14% losses.
      // Balconies use 22% losses. This factor adjusts: (1-0.22)/(1-0.14) = 0.907
      // DO NOT REMOVE — this is intentional, not a duplicate of the PVWatts losses param.
      const balconyLossAdj = (1 - 0.22) / (1 - 0.14);

      // Urban soiling derating (~10% avg for NYC, not included in shade factor table)
      // PVWatts handles this via the soiling[] array param; fallback must apply manually
      const URBAN_SOILING_FACTOR = 0.90;

      annualKwh = SolarConfig.PVWATTS_NYC_KWH_PER_KW_OPTIMAL
        * systemKw
        * tiltFactor
        * azimuthFactor
        * balconyLossAdj
        * URBAN_SOILING_FACTOR
        * shadeFactor
        * SolarConfig.THERMAL_BONUS;

      const distribution = SolarState.monthlyDistribution || DEFAULT_MONTHLY_DISTRIBUTION;
      monthlyKwh = distribution.map(pct => annualKwh * pct);

      console.log(`[SolarAPI] Using fallback model: ${annualKwh.toFixed(0)} kWh`);
    }

    // Financial model
    const annualSavings = annualKwh * SolarConfig.ELECTRICITY_RATE;
    const monthlySavings = annualSavings / 12;

    const monthlyConsumption = monthlyBill / SolarConfig.ELECTRICITY_RATE;
    const annualConsumption = monthlyConsumption * 12;
    const billOffsetPct = (annualKwh / annualConsumption) * 100;

    const simplePayback = adjustedCost / annualSavings;

    // NPV payback with rate escalation
    let cumSavings = 0;
    let npvPayback = 25;
    for (let i = 0; i < 25; i++) {
      const yearSavings = annualKwh
        * Math.pow(1 - SolarConfig.PANEL_DEGRADATION, i)
        * SolarConfig.ELECTRICITY_RATE
        * Math.pow(1 + SolarConfig.RATE_ESCALATION, i);
      cumSavings += yearSavings;
      if (cumSavings >= adjustedCost && npvPayback === 25) {
        const prevCum = cumSavings - yearSavings;
        npvPayback = i + (adjustedCost - prevCum) / yearSavings;
      }
    }

    // 25-year lifetime savings
    let lifetimeSavings = 0;
    for (let i = 0; i < 25; i++) {
      lifetimeSavings += annualKwh
        * Math.pow(1 - SolarConfig.PANEL_DEGRADATION, i)
        * SolarConfig.ELECTRICITY_RATE
        * Math.pow(1 + SolarConfig.RATE_ESCALATION, i);
    }

    // Environmental impact
    const co2Lbs = annualKwh * SolarConfig.CO2_FACTOR;
    const treesEquiv = co2Lbs / 120;
    const milesOffset = co2Lbs / 0.89;
    const phonesCharged = annualKwh * 1000 / 12;

    const capacityFactor = (annualKwh / (systemKw * 8760)) * 100;

    return {
      // Energy
      annualKwh,
      monthlyKwh,
      capacityFactor,
      usedPVWatts,
      pvwattsData,

      // Financial
      annualSavings,
      monthlySavings,
      billOffsetPct,
      simplePayback,
      npvPayback,
      lifetimeSavings,
      adjustedCost,

      // Environmental
      co2Lbs,
      treesEquiv,
      milesOffset,
      phonesCharged,

      // System config
      systemWatts,
      systemKw,
      azimuth,
      tilt,
      shadeFactor,

      // Data quality
      dataSources: { ...SolarState.dataSources },
    };
  },
};
