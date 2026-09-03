// ============================================================
// balco.nyc Solar Calculator — API Integration & Energy Model
// ============================================================
// Depends on: js/config.js, js/pvwatts-nyc-table.js, js/self-consumption-table.js,
//             js/self-consumption.js, js/shade-geometry.js, js/3d-shadow-model.js,
//             js/sun-position.js, js/irradiance-nyc.js (all loaded first)
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
  footprintFeature: null,
  footprintSource: null,      // 'bin' | 'point' | 'nearby'
  orientationSuggestion: null,

  // From PVWatts
  pvwattsResult: null,
  pvwattsVariant: null,

  // From the neighbour and tree queries
  neighborBuildings: null,    // array of GeoJSON features, or null when the query failed
  neighborPromise: null,      // the in-flight request, so callers await instead of re-issuing
  neighborQueryFailed: false,
  neighborsTruncated: false,
  neighborTiers: null,        // per-tier counts, for the notice
  trees: null,                // array of tree points, or null when the query failed
  treesPromise: null,

  // Tracking which APIs succeeded
  dataSources: {
    googlePlaces: false,
    geoclient: false,
    pluto: false,
    footprints: false,
    pvwatts: false,
    neighbors: false,
    trees: false,
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
    this.footprintFeature = null;
    this.footprintSource = null;
    this.orientationSuggestion = null;
    this.pvwattsResult = null;
    this.pvwattsVariant = null;
    this.neighborBuildings = null;
    this.neighborPromise = null;
    this.neighborQueryFailed = false;
    this.neighborsTruncated = false;
    this.neighborTiers = null;
    this.trees = null;
    this.treesPromise = null;
    Object.keys(this.dataSources).forEach(k => this.dataSources[k] = false);
  },
};


// --- CONSTANTS ---

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const DIRECTION_LABELS = {
  0: 'North', 45: 'Northeast', 90: 'East', 135: 'Southeast',
  180: 'South', 225: 'Southwest', 270: 'West', 315: 'Northwest',
};

// Borough zip code mapping for Geoclient (USPS NYC ZIP atlas)
const BOROUGH_ZIP_RANGES = [
  { prefix: '100', borough: 'manhattan' },
  { prefix: '101', borough: 'manhattan' },
  { prefix: '102', borough: 'manhattan' },
  { prefix: '103', borough: 'staten island' },
  { prefix: '104', borough: 'bronx' },
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

/** Compass label for any azimuth, snapped to 45 degrees for display only. */
function directionLabel(azimuthDeg) {
  const snapped = Math.round((((azimuthDeg % 360) + 360) % 360) / 45) * 45 % 360;
  return DIRECTION_LABELS[snapped] || 'South';
}


// --- API HELPERS ---

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const attempt = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  let response = await attempt();
  if (!response.ok) {
    // One retry on 429 (rate limit), under its own timeout
    if (response.status === 429) {
      await new Promise(r => setTimeout(r, 1000));
      response = await attempt();
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  }
  return response;
}

/**
 * Escape a value for interpolation into a Socrata SoQL string literal.
 * Without this an apostrophe in an address ("O'Neill St") breaks the query.
 */
function soqlEscape(value) {
  return String(value).replace(/'/g, "''");
}

/**
 * WKT polygon approximating a circle, for Socrata intersects(). within_circle()
 * on polygon geometry is a containment test and drops every footprint that
 * crosses the circle, which in practice means the large, tall buildings.
 */
function circleWkt(lat, lon, radiusM, segments = 32) {
  const mPerDegLat = 111320;
  const mPerDegLon = mPerDegLat * Math.cos(lat * Math.PI / 180);
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const a = 2 * Math.PI * i / segments;
    const plon = lon + radiusM * Math.sin(a) / mPerDegLon;
    const plat = lat + radiusM * Math.cos(a) / mPerDegLat;
    pts.push(`${plon.toFixed(6)} ${plat.toFixed(6)}`);
  }
  return `POLYGON((${pts.join(',')}))`;
}

function withAppToken(url) {
  return SolarConfig.SOCRATA_APP_TOKEN ? `${url}&$$app_token=${SolarConfig.SOCRATA_APP_TOKEN}` : url;
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
          '$where': `bbl='${soqlEscape(SolarState.bbl)}'`,
          '$select': 'address,bldgclass,numfloors,unitsres,yearbuilt,bldgarea,zonedist1,bbl',
          '$limit': '5',
        });
        url = `${SolarConfig.PLUTO_URL}?${params}`;
      } else if (SolarState.address) {
        // Fallback: search by address string
        const street = soqlEscape(SolarState.address.split(',')[0].toUpperCase());
        const params = new URLSearchParams({
          '$where': `upper(address) LIKE '%${street}%'`,
          '$select': 'address,bldgclass,numfloors,unitsres,yearbuilt,bldgarea,zonedist1,bbl',
          '$limit': '5',
        });
        url = `${SolarConfig.PLUTO_URL}?${params}`;
      } else {
        return null;
      }
      url = withAppToken(url);

      console.log('[SolarAPI] Querying PLUTO...');
      const response = await fetchWithTimeout(url);
      const data = await response.json();

      console.log(`[SolarAPI] PLUTO responded in ${(performance.now() - startTime).toFixed(0)}ms, ${data.length} results`);

      if (data.length === 0) return null;

      const bldg = data[0];
      // numfloors can be fractional (2.5 for a house with a half storey); round, never truncate.
      const floors = parseFloat(bldg.numfloors);
      SolarState.numfloors = Number.isFinite(floors) && floors > 0 ? Math.max(1, Math.round(floors)) : null;
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

  /**
   * Total floors for the model, with provenance: PLUTO when it has a value,
   * otherwise estimated from the roof height, otherwise the default.
   */
  resolveTotalFloors() {
    if (SolarState.numfloors) return { totalFloors: SolarState.numfloors, source: 'pluto' };
    if (SolarState.heightroof) {
      return { totalFloors: Math.max(1, Math.round(SolarState.heightroof / SolarConfig.FT_PER_FLOOR_ESTIMATE)), source: 'height' };
    }
    return { totalFloors: SolarConfig.DEFAULT_TOTAL_FLOORS, source: 'default' };
  },

  // ---- NYC Building Footprints + Orientation ----
  _footprintQuery(where, limit) {
    const params = new URLSearchParams({
      '$where': where,
      '$select': 'bin,height_roof,ground_elevation,the_geom',
      '$limit': String(limit),
    });
    return withAppToken(`${SolarConfig.FOOTPRINTS_URL}?${params}`);
  },

  async fetchFootprints() {
    try {
      const startTime = performance.now();
      // By BIN first; else the footprint that contains the geocoded point
      // (intersects, not within_circle: containment fails for any building
      // larger than the circle); else the nearest small building.
      const attempts = [];
      if (SolarState.bin) attempts.push(['bin', `bin='${soqlEscape(SolarState.bin)}'`]);
      if (SolarState.lat && SolarState.lon) {
        attempts.push(['point', `intersects(the_geom, 'POINT(${SolarState.lon} ${SolarState.lat})')`]);
        attempts.push(['nearby', `within_circle(the_geom, ${SolarState.lat}, ${SolarState.lon}, 30)`]);
      }
      if (!attempts.length) return null;

      let feature = null, source = null;
      for (const [label, where] of attempts) {
        console.log(`[SolarAPI] Querying Building Footprints (${label})...`);
        const response = await fetchWithTimeout(this._footprintQuery(where, 1));
        const data = await response.json();
        const features = data.features || data;
        if (features && features.length) { feature = features[0]; source = label; break; }
      }
      console.log(`[SolarAPI] Footprints responded in ${(performance.now() - startTime).toFixed(0)}ms`);
      if (!feature) return null;

      const props = feature.properties || feature;
      const geom = feature.geometry || (feature.the_geom ? JSON.parse(feature.the_geom) : null);

      SolarState.heightroof = (props.height_roof || props.heightroof) ? parseFloat(props.height_roof || props.heightroof) : null;
      SolarState.groundelev = (props.ground_elevation || props.groundelev) ? parseFloat(props.ground_elevation || props.groundelev) : null;
      if (!SolarState.bin && props.bin) SolarState.bin = props.bin;
      SolarState.footprintFeature = feature;
      SolarState.footprintSource = source;

      // Extract polygon coordinates for orientation detection
      if (geom && geom.coordinates) {
        if (geom.type === 'MultiPolygon') {
          SolarState.footprintCoords = geom.coordinates[0][0];
        } else if (geom.type === 'Polygon') {
          SolarState.footprintCoords = geom.coordinates[0];
        }
      }

      if (SolarState.footprintCoords) {
        SolarState.orientationSuggestion = this.detectOrientation(SolarState.footprintCoords);
      }

      SolarState.dataSources.footprints = true;
      console.log(`[SolarAPI] Footprints (${source}): height=${SolarState.heightroof}ft, orientation=${JSON.stringify(SolarState.orientationSuggestion)}`);
      return feature;
    } catch (err) {
      console.warn('[SolarAPI] Footprints failed:', err.message);
      return null;
    }
  },

  // ---- Orientation Algorithm ----
  detectOrientation(coords) {
    if (!coords || coords.length < 3) return null;

    // Longitude degrees are shorter than latitude degrees away from the
    // equator. At NYC's ~40.7N a degree of longitude is only ~76% of a degree
    // of latitude, so raw degree deltas stretch east-west edges by ~1.3x and
    // skew every bearing by up to ~7 degrees. Project to local metres first.
    const meanLat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
    const lonScale = Math.cos(meanLat * Math.PI / 180);

    const edges = [];
    for (let i = 0; i < coords.length - 1; i++) {
      const p1 = coords[i];
      const p2 = coords[i + 1];
      const dx = (p2[0] - p1[0]) * lonScale;
      const dy = p2[1] - p1[1];
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length === 0) continue;

      const edgeAngle = ((Math.atan2(dx, dy) * 180 / Math.PI) + 360) % 360;
      const facade1 = (edgeAngle + 90) % 360;
      const facade2 = (edgeAngle + 270) % 360;
      edges.push({ length, edgeAngle, facadeAngles: [facade1, facade2] });
    }

    if (edges.length === 0) return null;
    edges.sort((a, b) => b.length - a.length);

    const primaryFacades = edges[0].facadeAngles;

    // The runner-up for confidence must be a genuinely different wall (at
    // least 30 degrees off the primary): in any rectangle the two longest
    // edges are the parallel long walls.
    const crossEdge = edges.find(e => {
      let diff = Math.abs(e.edgeAngle - edges[0].edgeAngle) % 180;
      if (diff > 90) diff = 180 - diff;
      return diff >= 30;
    });

    const allFacades = [...primaryFacades];
    if (crossEdge) allFacades.push(...crossEdge.facadeAngles);

    const compassOptions = [0, 45, 90, 135, 180, 225, 270, 315];
    const snap = angle => {
      let bestDir = 180, bestDiff = 360;
      for (const dir of compassOptions) {
        let diff = Math.abs(angle - dir);
        if (diff > 180) diff = 360 - diff;
        if (diff < bestDiff) { bestDiff = diff; bestDir = dir; }
      }
      return bestDir;
    };

    const mapped = allFacades.map(snap);
    const solarRank = { 180: 1, 135: 2, 225: 2, 90: 3, 270: 3, 45: 4, 315: 4, 0: 5 };
    mapped.sort((a, b) => (solarRank[a] || 5) - (solarRank[b] || 5));

    // The exact (unsnapped) bearing of the best solar-facing wall, so the
    // energy model can use the real facade direction.
    const exactBest = allFacades.slice().sort((a, b) => (solarRank[snap(a)] || 5) - (solarRank[snap(b)] || 5))[0];

    return {
      bestDirection: mapped[0],
      bestDirectionExact: Math.round(exactBest * 10) / 10,
      allDirections: [...new Set(mapped)],
      primaryDirections: [...new Set(primaryFacades.map(snap))],
      confidence: (!crossEdge || edges[0].length > 1.3 * crossEdge.length) ? 'high' : 'medium',
    };
  },

  // ---- NREL PVWatts V8 ----

  /** Monthly soiling array (%) for a mount tilt. */
  soilingFor(tilt) {
    const P = SolarConfig.PVWATTS_PARAMS;
    return tilt >= 85 ? P.soiling_vertical : P.soiling_tilted;
  },

  /**
   * Combined loss when the soiling array cannot be sent: the losses bundle
   * compounded with the array's annual mean, as a percentage string.
   */
  lossesWithSoilingFor(tilt) {
    const soil = this.soilingFor(tilt);
    const mean = soil.reduce((s, v) => s + v, 0) / soil.length / 100;
    return ((1 - (1 - SolarConfig.PVWATTS_PARAMS.losses / 100) * (1 - mean)) * 100).toFixed(1);
  },

  /** DC-to-AC ratio implied by the array and the kit's inverter. */
  dcAcRatio(systemWatts, inverterWatts) {
    const inv = inverterWatts || SolarConfig.INVERTER_AC_WATTS_DEFAULT;
    return Math.max(1.0, Math.round((systemWatts / inv) * 1000) / 1000);
  },

  _pvwattsBaseParams(params) {
    const P = SolarConfig.PVWATTS_PARAMS;
    return {
      api_key: SolarConfig.NREL_API_KEY,
      system_capacity: params.systemCapacity.toString(),
      module_type: String(P.module_type),
      array_type: String(P.array_type),
      gcr: String(P.gcr),
      tilt: params.tilt.toString(),
      azimuth: (Math.round(params.azimuth * 10) / 10).toString(),
      lat: SolarState.lat.toString(),
      lon: SolarState.lon.toString(),
      dc_ac_ratio: this.dcAcRatio(params.systemCapacity * 1000, params.inverterWatts).toString(),
      inv_eff: String(P.inv_eff),
      dataset: P.dataset,
      timeframe: 'monthly',
      use_wf_albedo: String(P.use_wf_albedo),
      albedo: String(P.albedo),
      bifaciality: String(P.bifaciality),
    };
  },

  /**
   * Call PVWatts with the monthly soiling array; if the API rejects the
   * array, fold its annual mean into `losses` and retry. (The bracketed JSON
   * form that used to sit between the two is always rejected with HTTP 422.)
   */
  async fetchPVWatts(params) {
    if (!SolarState.lat || !SolarState.lon) return null;
    if (!SolarConfig.NREL_API_KEY) {
      console.warn('[SolarAPI] No NREL API key, skipping PVWatts');
      return null;
    }

    const soiling = this.soilingFor(params.tilt);
    const variants = [
      { label: 'monthly soiling array', extra: { losses: String(SolarConfig.PVWATTS_PARAMS.losses), soiling: soiling.join('|') } },
      { label: 'soiling folded into losses', extra: { losses: this.lossesWithSoilingFor(params.tilt) } },
    ];

    for (const variant of variants) {
      try {
        const startTime = performance.now();
        const queryParams = new URLSearchParams(
          Object.assign(this._pvwattsBaseParams(params), variant.extra)
        );
        const url = `${SolarConfig.PVWATTS_URL}?${queryParams}`;

        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok || (data.errors && data.errors.length > 0)) {
          console.warn(`[SolarAPI] PVWatts rejected ${variant.label}:`, data.errors || response.status);
          if (response.status === 429 || response.status >= 500) break;   // not a parameter problem
          continue;
        }
        if (!data.outputs || typeof data.outputs.ac_annual !== 'number') {
          console.warn(`[SolarAPI] PVWatts returned no outputs for ${variant.label}`);
          continue;
        }

        console.log(`[SolarAPI] PVWatts OK (${variant.label}) in ${(performance.now() - startTime).toFixed(0)}ms`);
        SolarState.pvwattsResult = data;
        SolarState.pvwattsVariant = variant.label;
        SolarState.dataSources.pvwatts = true;
        console.log(`[SolarAPI] PVWatts: ac_annual=${data.outputs.ac_annual} kWh`);
        return data;
      } catch (err) {
        console.warn(`[SolarAPI] PVWatts request failed (${variant.label}):`, err.message);
        break;   // a transport failure will hit every variant; don't hammer the API
      }
    }

    console.warn('[SolarAPI] PVWatts unavailable; using the offline PVWatts table');
    return null;
  },

  // ---- Neighbouring buildings (tiered: everything near, only tall further out) ----
  fetchNeighborBuildings() {
    if (SolarState.neighborPromise) return SolarState.neighborPromise;
    if (!SolarState.lat || !SolarState.lon) return Promise.resolve(null);

    const { lat, lon } = SolarState;
    const tiers = SolarConfig.NEIGHBOR_QUERIES;
    const startTime = performance.now();

    const run = async () => {
      const results = await Promise.allSettled(tiers.map(tier => {
        let where = `intersects(the_geom, '${circleWkt(lat, lon, tier.radiusM)}')`;
        if (tier.minHeightFt > 0) where += ` AND height_roof > ${tier.minHeightFt}`;
        return fetchWithTimeout(this._footprintQuery(where, tier.limit), {}, 15000).then(r => r.json());
      }));

      // The near tier is the one that matters; the tall tiers are a bonus.
      if (results[0].status !== 'fulfilled') {
        SolarState.neighborQueryFailed = true;
        SolarState.neighborBuildings = null;
        console.warn('[SolarAPI] Neighbor buildings failed:', results[0].reason && results[0].reason.message);
        return null;
      }

      const seen = new Set();
      const merged = [];
      const counts = [];
      let truncated = false;
      results.forEach((r, i) => {
        if (r.status !== 'fulfilled') { counts.push(null); return; }
        const features = r.value.features || r.value || [];
        counts.push(features.length);
        if (features.length >= tiers[i].limit) truncated = true;
        for (const f of features) {
          const bin = ((f.properties || f).bin || '').toString();
          if (bin && seen.has(bin)) continue;
          if (bin) seen.add(bin);
          merged.push(f);
        }
      });

      SolarState.neighborBuildings = merged;
      SolarState.neighborTiers = counts;
      SolarState.neighborsTruncated = truncated;
      SolarState.neighborQueryFailed = false;
      SolarState.dataSources.neighbors = true;
      console.log(`[SolarAPI] Neighbors: ${merged.length} buildings (${counts.join('/')}) in ${(performance.now() - startTime).toFixed(0)}ms${truncated ? ' (a tier hit its limit)' : ''}`);
      return merged;
    };

    SolarState.neighborPromise = run().catch(err => {
      SolarState.neighborQueryFailed = true;
      SolarState.neighborBuildings = null;
      console.warn('[SolarAPI] Neighbor buildings failed:', err.message);
      return null;
    });
    return SolarState.neighborPromise;
  },

  // ---- Street trees (NYC Parks Forestry Tree Points) ----
  fetchTrees() {
    if (SolarState.treesPromise) return SolarState.treesPromise;
    if (!SolarState.lat || !SolarState.lon) return Promise.resolve(null);
    const { lat, lon } = SolarState;
    const Q = SolarConfig.TREE_QUERY;
    const params = new URLSearchParams({
      '$where': `within_circle(location, ${lat}, ${lon}, ${Q.radiusM}) AND tpstructure='Full'`,
      '$select': 'location,dbh,genusspecies',
      '$limit': String(Q.limit),
    });
    const url = withAppToken(`${SolarConfig.TREES_URL}?${params}`);
    SolarState.treesPromise = fetchWithTimeout(url).then(r => r.json()).then(rows => {
      SolarState.trees = Array.isArray(rows) ? rows : [];
      SolarState.dataSources.trees = true;
      console.log(`[SolarAPI] Trees: ${SolarState.trees.length} within ${Q.radiusM} m`);
      return SolarState.trees;
    }).catch(err => {
      SolarState.trees = null;
      console.warn('[SolarAPI] Tree query failed:', err.message);
      return null;
    });
    return SolarState.treesPromise;
  },

  // ---- Building Data Pipeline ----
  async runBuildingLookup(onProgress) {
    // Step 1: Geoclient (needs to run first for BBL/BIN)
    if (SolarState.addressComponents) {
      if (onProgress) onProgress('geoclient', 'loading');
      await this.fetchGeoclient(SolarState.addressComponents);
      if (onProgress) onProgress('geoclient', SolarState.dataSources.geoclient ? 'done' : 'failed');
    }

    // Step 2: Parallel queries (PLUTO + Footprints)
    if (onProgress) {
      onProgress('pluto', 'loading');
      onProgress('footprints', 'loading');
    }

    const results = await Promise.allSettled([
      this.fetchPLUTO(),
      this.fetchFootprints(),
    ]);

    if (onProgress) {
      onProgress('pluto', results[0].status === 'fulfilled' && results[0].value ? 'done' : 'failed');
      onProgress('footprints', results[1].status === 'fulfilled' && results[1].value ? 'done' : 'failed');
    }

    // Step 3: neighbours and trees start now; callers await the stored promises.
    this.fetchNeighborBuildings();
    this.fetchTrees();

    return {
      pluto: results[0].status === 'fulfilled' ? results[0].value : null,
      footprints: results[1].status === 'fulfilled' ? results[1].value : null,
    };
  },

  // ---- Offline PVWatts table (fallback) ----

  /**
   * Annual kWh per kW and monthly shares for a tilt/azimuth from the
   * PVWatts table for NYC, interpolating between the 45-degree azimuths.
   */
  tableYield(tilt, azimuth) {
    const T = PVWattsTableNYC;
    const tiltKey = T.tilts.includes(tilt) ? tilt : T.tilts.reduce((a, b) => Math.abs(b - tilt) < Math.abs(a - tilt) ? b : a);
    const az = ((azimuth % 360) + 360) % 360;
    const a0 = Math.floor(az / 45) * 45;
    const a1 = (a0 + 45) % 360;
    const t = (az - a0) / 45;
    const y0 = T.kwhPerKw[tiltKey][a0], y1 = T.kwhPerKw[tiltKey][a1];
    const s0 = T.monthlyShare[tiltKey][a0], s1 = T.monthlyShare[tiltKey][a1];
    const kwhPerKw = y0 * (1 - t) + y1 * t;
    // Blend monthly energy (not shares) so the seasonal shape follows the yield.
    const monthly = s0.map((v, i) => v * y0 * (1 - t) + s1[i] * y1 * t);
    const sum = monthly.reduce((s, v) => s + v, 0);
    return { kwhPerKw, monthlyShare: monthly.map(v => v / sum), tiltKey };
  },

  /**
   * Shade profile for an address without footprint data: the visitor's
   * description of the block becomes a canonical street canyon and the real
   * horizon model runs on it (headless). Uses a private model instance so a
   * live 3D scene is never disturbed.
   */
  canonicalShadeProfile(inputs) {
    if (typeof ShadowModel === 'undefined' || typeof ShadeGeometry === 'undefined') return null;
    const canyon = SolarConfig.CANONICAL_CANYONS[inputs.shading];
    if (canyon === undefined) return null;
    const model = Object.create(ShadowModel);
    model.reset();
    const geom = ShadeGeometry.canonicalCanyon(inputs.shading, canyon, {
      azimuthDeg: inputs.azimuth, totalFloors: inputs.totalFloors, storeyM: SolarConfig.STOREY_M.default,
    });
    model.setBuildings([geom.target, ...geom.neighbors]);
    model._addBalconyMarker = () => {};
    model.init({ floor: inputs.floor, totalFloors: inputs.totalFloors, azimuthDeg: inputs.azimuth, mountType: inputs.mountType });
    const profile = model.computeAnnualShadeProfile(inputs.tilt);
    profile.source = 'canonical';
    profile.directSunHours = { jun: model.directSunHours(5, inputs.tilt), dec: model.directSunHours(11, inputs.tilt) };
    return profile;
  },

  // ---- Full Calculation (with API or fallback) ----
  async calculateEstimate(formInputs) {
    const {
      azimuth, tilt, systemWatts, floor, totalFloors,
      shading, monthlyBill, systemCost, shadeProfile,
      costTier, escalationPreset, occupancy, mountType,
    } = formInputs;
    const inverterWatts = formInputs.inverterWatts || SolarConfig.INVERTER_AC_WATTS_DEFAULT;

    const systemKw = systemWatts / 1000;
    const tier = costTier || 'mid';
    const baseCost = (systemCost != null)
      ? systemCost
      : (SolarConfig.SYSTEM_COST_BY_TIER[tier] || SolarConfig.SYSTEM_COST_BY_TIER.mid);
    const adjustedCost = baseCost * (systemWatts / 800);

    const panelDegradation = (SolarConfig.PANEL_DEGRADATION_BY_TIER || {})[tier]
      || SolarConfig.PANEL_DEGRADATION;
    const rateEscalation = (SolarConfig.RATE_ESCALATION_PRESETS || {})[escalationPreset]
      || SolarConfig.RATE_ESCALATION;

    // --- Shade: the 3D profile when there is one, else the canonical canyon
    // for the visitor's description of the block, else no derate (disclosed).
    let profile = (shadeProfile && shadeProfile.monthlyShadeFactors) ? shadeProfile : null;
    let shadeSource = profile ? (profile.source || '3d') : null;
    if (!profile) {
      profile = this.canonicalShadeProfile({ azimuth, tilt, floor, totalFloors, shading, mountType });
      shadeSource = profile ? 'canonical' : 'none';
    }
    const monthlyShadeFactors = profile ? profile.monthlyShadeFactors : new Array(12).fill(1);
    const shadeFactor = profile ? profile.annualShadeFactor : 1;
    console.log(`[SolarAPI] Shade (${shadeSource}): annual ${shadeFactor.toFixed(3)}`);

    // --- Production
    let pvwattsData = null;
    if (SolarState.lat && SolarState.lon && SolarConfig.NREL_API_KEY) {
      pvwattsData = await this.fetchPVWatts({ systemCapacity: systemKw, tilt, azimuth, inverterWatts });
    }

    // Railing / mounting-hardware obstruction. Not visible to building
    // footprints and not modelled by PVWatts, so it is applied to both paths.
    const railingFactor = (SolarConfig.RAILING_OBSTRUCTION_BY_TILT || {})[tilt] ?? 0.97;

    let monthlyKwh, usedPVWatts = false, unshadedKwh;
    if (pvwattsData && pvwattsData.outputs) {
      const out = pvwattsData.outputs;
      unshadedKwh = out.ac_annual;
      monthlyKwh = out.ac_monthly.map((v, i) => v * monthlyShadeFactors[i] * SolarConfig.THERMAL_BONUS * railingFactor);
      usedPVWatts = true;
    } else {
      // Offline PVWatts table for NYC (same engine, same parameters, no network).
      const y = this.tableYield(tilt, azimuth);
      const dcAc = this.dcAcRatio(systemWatts, inverterWatts);
      // The table assumes a matched inverter; an array larger than its
      // inverter clips. Vertical panels almost never reach the cap, tilted
      // ones do; these are the measured clipping losses for NYC.
      const clip = this.clippingLoss(dcAc, tilt);
      unshadedKwh = y.kwhPerKw * systemKw * (1 - clip);
      monthlyKwh = y.monthlyShare.map((share, i) => unshadedKwh * share * monthlyShadeFactors[i] * SolarConfig.THERMAL_BONUS * railingFactor);
    }
    const annualKwh = monthlyKwh.reduce((s, v) => s + v, 0);

    // --- Consumption and self-consumption
    // Infer consumption from the bill at the MARGINAL rate, after removing the
    // fixed Customer Charge: it is part of what the user pays but not of what
    // a kWh costs.
    const billableAmount = Math.max(0, monthlyBill - SolarConfig.MONTHLY_CUSTOMER_CHARGE);
    const annualConsumption = Math.max(1, (billableAmount / SolarConfig.ELECTRICITY_RATE) * 12);

    const sc = SelfConsumption.fraction({
      tiltDeg: tilt, azimuthDeg: azimuth, annualKwh, annualConsumptionKwh: annualConsumption, occupancy,
    });
    const selfConsumedKwh = annualKwh * sc.fraction;
    const exportedKwh = annualKwh - selfConsumedKwh;
    const battery1 = SelfConsumption.batteryGain({ tiltDeg: tilt, azimuthDeg: azimuth, annualKwh, annualConsumptionKwh: annualConsumption }, 1);

    // --- Financial model (savings only on what is used at home)
    const annualSavings = selfConsumedKwh * SolarConfig.ELECTRICITY_RATE;
    const monthlySavings = annualSavings / 12;
    const billOffsetPct = Math.min(100, (selfConsumedKwh / annualConsumption) * 100);
    const simplePayback = annualSavings > 0 ? adjustedCost / annualSavings : Infinity;

    // Payback and 25-year totals in nominal dollars, compounding the rate
    // escalation and the panel's degradation, with one inverter replacement.
    // Also restated in today's dollars at a general inflation rate.
    const years = SolarConfig.ANALYSIS_YEARS;
    const repl = SolarConfig.INVERTER_REPLACEMENT;
    const replacementCost = adjustedCost * repl.fraction;
    const infl = SolarConfig.INFLATION_FOR_REAL_TERMS;
    let cum = -adjustedCost, lifetimeSavings = 0, lifetimeSavingsReal = 0, escalatedPayback = Infinity;
    for (let i = 0; i < years; i++) {
      const yearSavings = annualSavings * Math.pow(1 - panelDegradation, i) * Math.pow(1 + rateEscalation, i);
      const yearCost = (i === repl.year) ? replacementCost : 0;
      lifetimeSavings += yearSavings;
      lifetimeSavingsReal += yearSavings / Math.pow(1 + infl, i);
      const before = cum;
      cum += yearSavings - yearCost;
      if (!Number.isFinite(escalatedPayback) && cum >= 0 && yearSavings > 0) {
        escalatedPayback = i + Math.min(1, Math.max(0, (-before + yearCost) / yearSavings));
      }
    }
    const lifetimeNet = lifetimeSavings - replacementCost;
    const lifetimeNetReal = lifetimeSavingsReal - replacementCost / Math.pow(1 + infl, repl.year);
    if (!Number.isFinite(escalatedPayback)) escalatedPayback = years;

    // --- Environmental impact (all production displaces grid generation,
    // exported or not; year-one grid factor)
    const co2Lbs = annualKwh * SolarConfig.CO2_FACTOR;
    const treesEquiv = co2Lbs / SolarConfig.CO2_PER_TREE_LB;
    const milesOffset = co2Lbs / SolarConfig.CAR_LB_PER_MILE;
    const phonesCharged = annualKwh / SolarConfig.PHONE_CHARGE_KWH;

    return {
      // Energy
      annualKwh,
      unshadedKwh: unshadedKwh * railingFactor,
      monthlyKwh,
      usedPVWatts,
      pvwattsVariant: usedPVWatts ? SolarState.pvwattsVariant : null,
      pvwattsData,

      // Shade
      shadeFactor,
      shadeSource,
      monthlyShadeFactors,
      skyOpenFraction: profile ? profile.skyOpenFraction : 1,
      treeCount: profile ? (profile.treeCount || 0) : 0,
      directSunHours: profile ? profile.directSunHours || null : null,
      railingFactor,

      // Self-consumption
      selfConsumption: sc.fraction,
      selfConsumptionClass: sc.orientationClass,
      occupancy: sc.occupancy,
      selfConsumedKwh,
      exportedKwh,
      battery1kWhExtraKwh: battery1.extraKwh,
      annualConsumption,

      // Financial
      annualSavings,
      monthlySavings,
      billOffsetPct,
      simplePayback,
      escalatedPayback,
      lifetimeSavings,
      lifetimeNet,
      lifetimeNetReal,
      replacementCost,
      adjustedCost,

      // Environmental
      co2Lbs,
      treesEquiv,
      milesOffset,
      phonesCharged,

      // System config
      systemWatts,
      systemKw,
      inverterWatts,
      dcAcRatio: this.dcAcRatio(systemWatts, inverterWatts),
      azimuth,
      tilt,
      mountType: mountType || SolarConfig.MOUNT_TYPE_DEFAULT,
      costTier: tier,
      escalationPreset: escalationPreset || 'mid',
      panelDegradation,
      rateEscalation,

      // Data quality
      dataSources: { ...SolarState.dataSources },
      neighborCount: SolarState.neighborBuildings ? SolarState.neighborBuildings.length : null,
      neighborsTruncated: SolarState.neighborsTruncated,
    };
  },

  /**
   * Inverter clipping loss for an oversized array, from the PVWatts hourly
   * study in the September 2026 audit (NYC, per tilt). Interpolated on the
   * DC:AC ratio; zero at or below 1.1.
   */
  clippingLoss(dcAc, tilt) {
    const table = tilt >= 85
      ? [[1.1, 0.0007], [1.2, 0.0029], [1.375, 0.0092], [1.5, 0.0177], [2.0, 0.0786]]
      : [[1.1, 0.0], [1.2, 0.0010], [1.375, 0.0092], [1.5, 0.0241], [2.0, 0.1279]];
    if (dcAc <= table[0][0]) return 0;
    for (let i = 1; i < table.length; i++) {
      if (dcAc <= table[i][0]) {
        const [r0, l0] = table[i - 1], [r1, l1] = table[i];
        return l0 + (l1 - l0) * (dcAc - r0) / (r1 - r0);
      }
    }
    return table[table.length - 1][1];
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SolarState, SolarAPI, getBoroughFromZip, soqlEscape, circleWkt, directionLabel };
}
