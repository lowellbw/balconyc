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
  floorCountEstimated: false,

  // From Building Footprints
  heightroof: null,
  groundelev: null,
  footprintBbl: null,
  footprintContainsPin: false,
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
    this.floorCountEstimated = false;
    this.heightroof = null;
    this.groundelev = null;
    this.footprintBbl = null;
    this.footprintContainsPin = false;
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
// Calibrated against PVWatts vertical NYC + HTW Berlin Stecker-Solar reference.
const TILT_FACTORS = {
  90: 0.60,  // Vertical railing mount
  70: 0.78,  // Angled mount
  60: 0.85,  // Angled (shallower)
  35: 1.00,  // Top-mount, near optimal for NYC
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


// --- SHADE FACTOR MODEL ---

function getShadeFactor(floor, totalFloors, shading) {
  const ratio = (totalFloors > 0) ? floor / totalFloors : 0.5;
  // tanh sigmoid: smooth transition centred near mid-floor
  const baseExposure = 0.5 + 0.5 * Math.tanh(3 * (ratio - 0.45));
  const range = {
    open:        { min: 0.85, max: 0.97 },
    some:        { min: 0.65, max: 0.94 },
    dense:       { min: 0.45, max: 0.87 },
    wide_avenue: { min: 0.70, max: 0.96 },
  }[shading] || { min: 0.65, max: 0.94 };
  return range.min + baseExposure * (range.max - range.min);
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
 * Convert a Google-style street address to the spelling used by PLUTO.
 * Examples: "222 N 7th St" -> "222 NORTH 7 STREET" and
 * "30-15 31st Ave" -> "30-15 31 AVENUE".
 *
 * PLUTO does not consistently understand Google's abbreviations, so using the
 * formatted address verbatim can return no record (and used to make the UI
 * silently fall back to a fictional 20-floor building).
 */
function normalizePLUTOAddress(value) {
  let normalized = String(value || '')
    .split(',')[0]
    .toUpperCase()
    .replace(/[.]/g, ' ')
    .replace(/\b(\d+)(ST|ND|RD|TH)\b/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  // Lettered Brooklyn avenues are names ("Avenue N"), not compass
  // directions. Expand the avenue token before handling a leading direction.
  normalized = normalized.replace(/\b(?:AV|AVE)\s+([A-Z])$/, 'AVENUE $1');

  const directions = {
    N: 'NORTH', S: 'SOUTH', E: 'EAST', W: 'WEST',
    NE: 'NORTHEAST', NW: 'NORTHWEST', SE: 'SOUTHEAST', SW: 'SOUTHWEST',
  };
  // In NYC a compass abbreviation belongs immediately after the house
  // number ("100 W 42nd St"). A terminal letter in "Avenue N" must survive.
  normalized = normalized.replace(
    /^(\S+\s+)(NE|NW|SE|SW|N|S|E|W)\b/,
    (match, houseNumber, direction) => houseNumber + directions[direction]
  );

  const replacements = [
    // Street-type abbreviations are suffix-only: the leading "St" in
    // "St Marks Pl" is a name, not an abbreviation for Street.
    [/\b(?:ST|STR)$/g, 'STREET'],
    [/\b(?:AV|AVE)$/g, 'AVENUE'],
    [/\bBLVD$/g, 'BOULEVARD'], [/\bRD$/g, 'ROAD'],
    [/\bDR$/g, 'DRIVE'], [/\bLN$/g, 'LANE'],
    [/\bPL$/g, 'PLACE'], [/\bCT$/g, 'COURT'],
    [/\bTER$/g, 'TERRACE'], [/\bPKWY$/g, 'PARKWAY'],
  ];
  replacements.forEach(([pattern, replacement]) => {
    normalized = normalized.replace(pattern, replacement);
  });
  return normalized.replace(/\s+/g, ' ').trim();
}

function getPLUTOLookupAddress(address, components) {
  if (Array.isArray(components)) {
    const streetNumber = components.find(c => c.types && c.types.includes('street_number'));
    const route = components.find(c => c.types && c.types.includes('route'));
    if (streetNumber && route) {
      return normalizePLUTOAddress(`${streetNumber.long_name} ${route.long_name}`);
    }
  }
  return normalizePLUTOAddress(address);
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const values = [lat1, lon1, lat2, lon2].map(Number);
  if (!values.every(Number.isFinite)) return Infinity;
  const [aLat, aLon, bLat, bLon] = values;
  const toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad;
  const dLon = (bLon - aLon) * toRad;
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * sinLon * sinLon;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function normalizeBBL(value) {
  if (value == null || value === '') return null;
  const integerPart = String(value).trim().split('.')[0];
  return /^\d+$/.test(integerPart) ? integerPart.padStart(10, '0') : null;
}

function geometryFromFeature(feature) {
  if (!feature) return null;
  let geometry = feature.geometry || feature.the_geom ||
    (feature.properties && feature.properties.the_geom) || null;
  if (typeof geometry === 'string') {
    try { geometry = JSON.parse(geometry); } catch (err) { return null; }
  }
  return geometry && geometry.coordinates ? geometry : null;
}

function polygonParts(geometry) {
  if (!geometry || !geometry.coordinates) return [];
  const toPart = polygon => {
    if (!Array.isArray(polygon) || !Array.isArray(polygon[0])) return null;
    return {
      outer: polygon[0],
      holes: polygon.slice(1).filter(ring => Array.isArray(ring) && ring.length >= 3),
    };
  };
  if (geometry.type === 'Polygon') {
    const part = toPart(geometry.coordinates);
    return part ? [part] : [];
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.map(toPart).filter(Boolean);
  }
  return [];
}

function pointInRingInterior(point, ring) {
  if (!ring || ring.length < 3) return false;
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointToRingBoundaryDistanceMeters(point, ring) {
  if (!ring || ring.length < 2) return Infinity;
  const [lon, lat] = point;
  const lonScale = Math.cos(lat * Math.PI / 180);
  let minimum = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const ax = (a[0] - lon) * 111320 * lonScale;
    const ay = (a[1] - lat) * 111320;
    const bx = (b[0] - lon) * 111320 * lonScale;
    const by = (b[1] - lat) * 111320;
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSq)) : 0;
    minimum = Math.min(minimum, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return minimum;
}

function pointOnRingBoundary(point, ring) {
  // Five centimetres absorbs floating-point noise while remaining far below
  // the precision of the source footprints and Google geocodes.
  return pointToRingBoundaryDistanceMeters(point, ring) <= 0.05;
}

function pointInPolygonPart(point, part) {
  if (!part || !part.outer) return false;
  if (pointOnRingBoundary(point, part.outer)) return true;
  if (!pointInRingInterior(point, part.outer)) return false;

  for (const hole of part.holes) {
    // A hole edge is still part of the building polygon's boundary.
    if (pointOnRingBoundary(point, hole)) return true;
    if (pointInRingInterior(point, hole)) return false;
  }
  return true;
}

function pointToPolygonPartDistanceMeters(point, part) {
  if (pointInPolygonPart(point, part)) return 0;
  return [part.outer, ...part.holes].reduce(
    (minimum, ring) => Math.min(minimum, pointToRingBoundaryDistanceMeters(point, ring)),
    Infinity
  );
}

/**
 * Use roof height only as a guard/fallback. A reported 11 floors inside a
 * 30-foot footprint is physically impossible, while a legitimate tall lobby
 * or warehouse floor should not override an otherwise coherent PLUTO count.
 */
function resolveFloorCount(reportedFloors, heightFeet) {
  const parsedFloors = Math.round(Number(reportedFloors));
  const reported = Number.isFinite(parsedFloors) && parsedFloors > 0 ? parsedFloors : null;
  const height = Number(heightFeet);
  const inferred = Number.isFinite(height) && height >= 8
    ? Math.max(1, Math.min(100, Math.round(height / 12)))
    : null;

  if (!reported) return inferred;
  if (inferred && height / reported < 6) return inferred;
  return reported;
}

function resolveMatchedFloorCount(reportedFloors, heightFeet, plutoBbl, footprintBbl, footprintIsAuthoritative) {
  const hasReportedCount = Number.isFinite(Number(reportedFloors)) && Number(reportedFloors) > 0;
  const normalizedPlutoBbl = normalizeBBL(plutoBbl);
  const normalizedFootprintBbl = normalizeBBL(footprintBbl);
  const heightMatchesTaxLot = !!normalizedPlutoBbl && normalizedPlutoBbl === normalizedFootprintBbl;
  const canValidateWithHeight = !hasReportedCount || heightMatchesTaxLot || !!footprintIsAuthoritative;
  return resolveFloorCount(reportedFloors, canValidateWithHeight ? heightFeet : null);
}

function floorFromHeightRatio(ratio, totalFloors) {
  const count = Math.max(1, Math.round(Number(totalFloors) || 1));
  const heightRatio = Math.max(0, Math.min(1, Number(ratio) || 0));
  return Math.max(1, Math.min(count, Math.ceil(heightRatio * count)));
}


// --- API METHODS ---

const SolarAPI = {

  // Exposed as methods so the address/building matching rules can be covered
  // by the same no-build test harness as the energy model.
  normalizePLUTOAddress,
  normalizeBBL,
  resolveFloorCount,
  resolveMatchedFloorCount,
  floorFromHeightRatio,

  selectPLUTORecord(records, targetLat, targetLon, targetAddress) {
    if (!Array.isArray(records) || records.length === 0) return null;
    const normalizedTarget = normalizePLUTOAddress(targetAddress);
    const exactMatches = normalizedTarget
      ? records.filter(record => normalizePLUTOAddress(record.address) === normalizedTarget)
      : [];
    const candidates = exactMatches.length ? exactMatches : records;

    let closest = null;
    let closestDistance = Infinity;
    candidates.forEach(record => {
      const distance = distanceMeters(targetLat, targetLon, record.latitude, record.longitude);
      if (distance < closestDistance) {
        closest = record;
        closestDistance = distance;
      }
    });
    return closest || candidates[0];
  },

  selectFootprint(features, targetLat, targetLon) {
    if (!Array.isArray(features) || features.length === 0) return null;
    if (![targetLat, targetLon].map(Number).every(Number.isFinite)) return features[0];

    const point = [Number(targetLon), Number(targetLat)];
    let closest = null;
    let closestDistance = Infinity;
    features.forEach(feature => {
      const part = this.selectFootprintPart(feature, targetLat, targetLon);
      const distance = part ? pointToPolygonPartDistanceMeters(point, part) : Infinity;
      if (distance < closestDistance) {
        closest = feature;
        closestDistance = distance;
      }
    });
    return closest || features[0];
  },

  selectFootprintPart(feature, targetLat, targetLon) {
    const parts = polygonParts(geometryFromFeature(feature));
    if (parts.length === 0) return null;
    if (![targetLat, targetLon].map(Number).every(Number.isFinite)) return parts[0];

    const point = [Number(targetLon), Number(targetLat)];
    let closestPart = parts[0];
    let closestDistance = pointToPolygonPartDistanceMeters(point, closestPart);
    for (let i = 1; i < parts.length; i++) {
      const distance = pointToPolygonPartDistanceMeters(point, parts[i]);
      if (distance < closestDistance) {
        closestPart = parts[i];
        closestDistance = distance;
      }
    }
    return closestPart;
  },

  selectFootprintRing(feature, targetLat, targetLon) {
    const part = this.selectFootprintPart(feature, targetLat, targetLon);
    return part ? part.outer : null;
  },

  footprintContainsPoint(feature, targetLat, targetLon) {
    if (![targetLat, targetLon].map(Number).every(Number.isFinite)) return false;
    const point = [Number(targetLon), Number(targetLat)];
    return polygonParts(geometryFromFeature(feature)).some(part => pointInPolygonPart(point, part));
  },

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
      const fields = 'address,bldgclass,numfloors,unitsres,yearbuilt,bldgarea,zonedist1,bbl,latitude,longitude';
      const request = async (where, limit) => {
        const params = new URLSearchParams({
          '$where': where,
          '$select': fields,
          '$limit': String(limit),
        });
        if (SolarConfig.SOCRATA_APP_TOKEN) {
          params.set('$$app_token', SolarConfig.SOCRATA_APP_TOKEN);
        }
        const response = await fetchWithTimeout(`${SolarConfig.PLUTO_URL}?${params}`);
        const rows = await response.json();
        return Array.isArray(rows) ? rows : [];
      };

      let data = [];
      const normalizedBbl = normalizeBBL(SolarState.bbl);
      const lookupAddress = getPLUTOLookupAddress(SolarState.address, SolarState.addressComponents);

      console.log('[SolarAPI] Querying PLUTO...');
      if (normalizedBbl) {
        data = await request(`bbl='${soqlEscape(normalizedBbl)}'`, 5);
      } else if (lookupAddress) {
        const clauses = [`upper(address)='${soqlEscape(lookupAddress)}'`];
        if (Array.isArray(SolarState.addressComponents)) {
          const boroughCodes = {
            manhattan: '1', bronx: '2', brooklyn: '3', queens: '4', 'staten island': '5',
          };
          const boroughCode = boroughCodes[getBoroughFromComponents(SolarState.addressComponents)];
          if (boroughCode) clauses.push(`borocode=${boroughCode}`);
        }
        data = await request(clauses.join(' AND '), 25);

        // A range-interpolated Google pin or unusual PLUTO spelling can still
        // miss the canonical address. Search a small local box and choose the
        // nearest tax-lot point instead of inventing a 20-floor building.
        if (data.length === 0 && Number.isFinite(Number(SolarState.lat)) && Number.isFinite(Number(SolarState.lon))) {
          const lat = Number(SolarState.lat);
          const lon = Number(SolarState.lon);
          const latDelta = 0.001;
          const lonDelta = 0.0014;
          const where = [
            `latitude between ${lat - latDelta} and ${lat + latDelta}`,
            `longitude between ${lon - lonDelta} and ${lon + lonDelta}`,
          ].join(' AND ');
          data = await request(where, 200);
        }
      } else {
        return null;
      }

      console.log(`[SolarAPI] PLUTO responded in ${(performance.now() - startTime).toFixed(0)}ms, ${data.length} results`);

      if (data.length === 0) return null;

      const bldg = this.selectPLUTORecord(data, SolarState.lat, SolarState.lon, lookupAddress);
      SolarState.numfloors = bldg.numfloors ? parseInt(bldg.numfloors) : null;
      SolarState.yearbuilt = bldg.yearbuilt ? parseInt(bldg.yearbuilt) : null;
      SolarState.bldgclass = bldg.bldgclass || null;
      SolarState.unitsres = bldg.unitsres ? parseInt(bldg.unitsres) : null;
      SolarState.bldgarea = bldg.bldgarea ? parseInt(bldg.bldgarea) : null;
      SolarState.zonedist1 = bldg.zonedist1 || null;
      if (bldg.bbl) SolarState.bbl = normalizeBBL(bldg.bbl);
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
          '$where': `bin='${soqlEscape(SolarState.bin)}'`,
          '$select': 'bin,height_roof,ground_elevation,mappluto_bbl,base_bbl,the_geom',
          '$limit': '1',
        });
        url = `${SolarConfig.FOOTPRINTS_URL}?${params}`;
      } else if (SolarState.lat && SolarState.lon) {
        // The API does not promise distance order. Fetch the local candidates
        // and choose the polygon containing (or nearest to) Google's pin.
        const params = new URLSearchParams({
          '$where': `within_circle(the_geom, ${SolarState.lat}, ${SolarState.lon}, 50)`,
          '$select': 'bin,height_roof,ground_elevation,mappluto_bbl,base_bbl,the_geom',
          '$limit': '50',
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

      const feature = SolarState.bin
        ? features[0]
        : this.selectFootprint(features, SolarState.lat, SolarState.lon);
      const props = feature.properties || feature;

      SolarState.heightroof = (props.height_roof || props.heightroof) ? parseFloat(props.height_roof || props.heightroof) : null;
      SolarState.groundelev = (props.ground_elevation || props.groundelev) ? parseFloat(props.ground_elevation || props.groundelev) : null;
      if (!SolarState.bin && props.bin) SolarState.bin = props.bin;
      SolarState.footprintBbl = normalizeBBL(props.mappluto_bbl || props.base_bbl);
      SolarState.footprintContainsPin = this.footprintContainsPoint(feature, SolarState.lat, SolarState.lon);

      // Keep the same polygon part used to select the feature. A MultiPolygon
      // may have a detached wing; blindly rendering its first part can show a
      // different building from the one whose BBL and height were accepted.
      SolarState.footprintCoords = this.selectFootprintRing(feature, SolarState.lat, SolarState.lon);

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

    // Longitude degrees are shorter than latitude degrees away from the
    // equator. At NYC's ~40.7N a degree of longitude is only ~76% of a degree
    // of latitude, so raw degree deltas stretch east-west edges by ~1.3x and
    // skew every bearing by up to ~7 degrees — enough to snap a Manhattan-grid
    // facade to the wrong compass point. Project to local metres first.
    const meanLat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
    const lonScale = Math.cos(meanLat * Math.PI / 180);

    // Compute edge lengths and perpendicular facade directions
    const edges = [];
    for (let i = 0; i < coords.length - 1; i++) {
      const p1 = coords[i];
      const p2 = coords[i + 1];
      const dx = (p2[0] - p1[0]) * lonScale; // longitude (east-west), scaled
      const dy = p2[1] - p1[1];              // latitude (north-south)
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length === 0) continue;

      // Edge direction (compass bearing)
      // atan2(dx, dy) gives angle from north, clockwise
      const edgeAngle = ((Math.atan2(dx, dy) * 180 / Math.PI) + 360) % 360;

      // Facades face perpendicular to the edge
      const facade1 = (edgeAngle + 90) % 360;
      const facade2 = (edgeAngle + 270) % 360;

      edges.push({ length, edgeAngle, facadeAngles: [facade1, facade2] });
    }

    if (edges.length === 0) return null;

    // Sort by edge length descending
    edges.sort((a, b) => b.length - a.length);

    // Primary facades from the longest edge
    const primaryFacades = edges[0].facadeAngles;

    // The runner-up for confidence must be a genuinely different wall. In any
    // rectangle the two longest edges are the parallel long walls and are
    // near-identical in length, so comparing against edges[1] made "high"
    // confidence effectively unreachable. Compare against the longest edge
    // that runs at least 30 degrees off the primary instead.
    const crossEdge = edges.find(e => {
      let diff = Math.abs(e.edgeAngle - edges[0].edgeAngle) % 180;
      if (diff > 90) diff = 180 - diff;
      return diff >= 30;
    });

    // Map each facade angle to nearest 45° compass direction
    const allFacades = [...primaryFacades];
    if (crossEdge) allFacades.push(...crossEdge.facadeAngles);

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

    const snap = angle => {
      let bestDir = 180, bestDiff = 360;
      for (const dir of compassOptions) {
        let diff = Math.abs(angle - dir);
        if (diff > 180) diff = 360 - diff;
        if (diff < bestDiff) { bestDiff = diff; bestDir = dir; }
      }
      return bestDir;
    };

    return {
      // Best solar-facing wall anywhere on the building.
      bestDirection: mapped[0],
      allDirections: [...new Set(mapped)],
      // The two walls of the longest edge — where most units actually face.
      primaryDirections: [...new Set(primaryFacades.map(snap))],
      confidence: (!crossEdge || edges[0].length > 1.3 * crossEdge.length) ? 'high' : 'medium',
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

  // NYC urban soiling profile, calibrated to urban-PV literature (3-7% monthly).
  // Kept out of `losses` so it isn't double-counted there.
  SOILING_MONTHLY: [3, 3, 4, 5, 6, 7, 7, 7, 6, 5, 4, 3],

  // Combined loss when the soiling array cannot be sent: 14% base compounded
  // with the array's ~5% annual mean => 1 - (1 - 0.14)(1 - 0.05) = 18.3%.
  LOSSES_WITH_SOILING: '18.3',

  _pvwattsBaseParams(params) {
    return {
      api_key: SolarConfig.NREL_API_KEY,
      system_capacity: params.systemCapacity.toString(),
      module_type: '1',       // Premium (19% efficiency, better temp coeff)
      array_type: '0',        // Fixed open rack (only option for balcony)
      tilt: params.tilt.toString(),
      azimuth: params.azimuth.toString(),
      lat: SolarState.lat.toString(),
      lon: SolarState.lon.toString(),
      dc_ac_ratio: '1.1',     // Micro-inverter matched to 1-2 modules; 1.2 over-clips
      inv_eff: '96.5',        // Micro-inverter efficiency (Enphase IQ8 ~97%, budget ~96%)
      dataset: 'nsrdb',
      timeframe: 'monthly',
      // Concrete balcony ground reflectance (light-colored: ~0.30)
      albedo: '0.20',
      // Monofacial panels (set to 0.75 if selling bifacial panels)
      bifaciality: '0',
    };
  },

  /**
   * Call PVWatts, trying progressively simpler soiling encodings.
   *
   * NREL documents array parameters as pipe-delimited, but has accepted a
   * bracketed JSON list historically. If the parameter is rejected the whole
   * request fails, which would silently drop every estimate onto the
   * client-side fallback while the UI still claimed an hourly simulation.
   * So we degrade explicitly: pipe -> bracket -> fold soiling into `losses`.
   */
  async fetchPVWatts(params) {
    if (!SolarState.lat || !SolarState.lon) return null;
    if (!SolarConfig.NREL_API_KEY) {
      console.warn('[SolarAPI] No NREL API key, skipping PVWatts');
      return null;
    }

    const soiling = this.SOILING_MONTHLY;
    const variants = [
      { label: 'pipe-delimited soiling', extra: { losses: '14', soiling: soiling.join('|') } },
      { label: 'bracketed soiling', extra: { losses: '14', soiling: `[${soiling.join(',')}]` } },
      { label: 'soiling folded into losses', extra: { losses: this.LOSSES_WITH_SOILING } },
    ];

    for (const variant of variants) {
      try {
        const startTime = performance.now();
        const queryParams = new URLSearchParams(
          Object.assign(this._pvwattsBaseParams(params), variant.extra)
        );
        const url = `${SolarConfig.PVWATTS_URL}?${queryParams}`;

        const response = await fetchWithTimeout(url);
        const data = await response.json();

        if (data.errors && data.errors.length > 0) {
          console.warn(`[SolarAPI] PVWatts rejected ${variant.label}:`, data.errors);
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
        // A transport failure will hit every variant; don't hammer the API.
        if (err.name === 'AbortError') break;
      }
    }

    console.warn('[SolarAPI] PVWatts unavailable; using client-side fallback');
    return null;
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

    let plutoResult = results[0].status === 'fulfilled' ? results[0].value : null;
    const footprintResult = results[1].status === 'fulfilled' ? results[1].value : null;
    const footprintBbl = normalizeBBL(SolarState.footprintBbl);
    const initialPlutoBbl = normalizeBBL(plutoResult && plutoResult.bbl);

    // The footprint dataset carries the tax-lot ID even when the Geoclient
    // proxy is unavailable. It is more specific than an address string, so
    // retry PLUTO whenever it can repair a miss or a mismatched address hit.
    const footprintIsAuthoritative = SolarState.dataSources.geoclient ||
      SolarState.footprintContainsPin || !plutoResult;
    if (footprintBbl && footprintBbl !== initialPlutoBbl && footprintIsAuthoritative) {
      SolarState.bbl = footprintBbl;
      SolarState.numfloors = null;
      SolarState.yearbuilt = null;
      SolarState.bldgclass = null;
      SolarState.unitsres = null;
      SolarState.bldgarea = null;
      SolarState.zonedist1 = null;
      SolarState.dataSources.pluto = false;
      plutoResult = await this.fetchPLUTO();
    }

    const reportedFloors = SolarState.numfloors;
    const resolvedPlutoBbl = normalizeBBL(plutoResult && plutoResult.bbl);
    const resolvedFloors = resolveMatchedFloorCount(
      reportedFloors,
      SolarState.heightroof,
      resolvedPlutoBbl,
      footprintBbl,
      SolarState.dataSources.geoclient || SolarState.footprintContainsPin
    );
    SolarState.floorCountEstimated = !!resolvedFloors && resolvedFloors !== reportedFloors;
    SolarState.numfloors = resolvedFloors;

    if (onProgress) {
      onProgress('pluto', plutoResult ? 'done' : 'failed');
      onProgress('footprints', footprintResult ? 'done' : 'failed');
      onProgress('solarResource', results[2].status === 'fulfilled' && results[2].value ? 'done' : 'failed');
    }

    // Step 3: Fire neighbor query in background (non-blocking)
    this.fetchNeighborBuildings();

    return {
      pluto: plutoResult,
      footprints: footprintResult,
      solarResource: results[2].status === 'fulfilled' ? results[2].value : null,
    };
  },

  // ---- Full Calculation (with API or fallback) ----
  async calculateEstimate(formInputs) {
    const {
      azimuth, tilt, systemWatts, floor, totalFloors,
      shading, monthlyBill, systemCost, shadeProfile,
      costTier, escalationPreset,
    } = formInputs;

    const systemKw = systemWatts / 1000;
    // Resolve tier-aware system cost when no explicit override provided
    const tier = costTier || 'mid';
    const baseCost = (systemCost != null)
      ? systemCost
      : (SolarConfig.SYSTEM_COST_BY_TIER[tier] || SolarConfig.SYSTEM_COST_BY_TIER.mid);
    const adjustedCost = baseCost * (systemWatts / 800);

    // Resolve tier-aware degradation + escalation
    const panelDegradation = (SolarConfig.PANEL_DEGRADATION_BY_TIER || {})[tier]
      || SolarConfig.PANEL_DEGRADATION;
    const rateEscalation = (SolarConfig.RATE_ESCALATION_PRESETS || {})[escalationPreset]
      || SolarConfig.RATE_ESCALATION;

    // Use 3D-derived shade profile if available, otherwise fall back to static lookup
    const has3DShade = shadeProfile && shadeProfile.monthlyShadeFactors;
    const shadeFactor = has3DShade ? shadeProfile.annualShadeFactor : getShadeFactor(floor, totalFloors, shading);
    const monthlyShadeFactors = has3DShade ? shadeProfile.monthlyShadeFactors : null;

    if (has3DShade) {
      console.log(`[SolarAPI] Using 3D shade profile (annual: ${shadeFactor.toFixed(3)})`);
    } else {
      console.log(`[SolarAPI] Using static shade factor: ${shadeFactor.toFixed(3)}`);
    }

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

    // Railing / mounting-hardware obstruction. Not visible to building
    // footprints and not modelled by PVWatts, so it is applied to both paths.
    const railingFactor = (SolarConfig.RAILING_OBSTRUCTION_BY_TILT || {})[tilt] ?? 0.97;

    if (pvwattsData && pvwattsData.outputs) {
      // Use real PVWatts data
      const outputs = pvwattsData.outputs;
      const rawAnnual = outputs.ac_annual;

      if (monthlyShadeFactors) {
        // Apply per-month 3D shade factors to PVWatts monthly output
        monthlyKwh = outputs.ac_monthly.map((v, i) =>
          v * monthlyShadeFactors[i] * SolarConfig.THERMAL_BONUS * railingFactor
        );
        annualKwh = monthlyKwh.reduce((s, v) => s + v, 0);
      } else {
        // Uniform shade factor across all months
        const scale = shadeFactor * SolarConfig.THERMAL_BONUS * railingFactor;
        annualKwh = rawAnnual * scale;
        monthlyKwh = outputs.ac_monthly.map(v => v * scale);
      }
      usedPVWatts = true;

      console.log(`[SolarAPI] PVWatts: raw=${rawAnnual.toFixed(0)} kWh, after shade+railing=${annualKwh.toFixed(0)} kWh`);
    } else {
      // Fallback: client-side formula (used when PVWatts API unavailable)
      const tiltFactor = TILT_FACTORS[tilt] || 0.60;
      const azimuthFactor = AZIMUTH_FACTORS[azimuth] || 0.72;

      // Urban soiling derating, ~5% avg (matches PVWatts soiling[] array average).
      const URBAN_SOILING_FACTOR = 0.95;

      const baseKwh = SolarConfig.PVWATTS_NYC_KWH_PER_KW_OPTIMAL
        * systemKw
        * tiltFactor
        * azimuthFactor
        * URBAN_SOILING_FACTOR
        * SolarConfig.THERMAL_BONUS
        * railingFactor;

      const distribution = SolarState.monthlyDistribution || DEFAULT_MONTHLY_DISTRIBUTION;

      if (monthlyShadeFactors) {
        // Apply per-month 3D shade factors
        monthlyKwh = distribution.map((pct, i) => baseKwh * pct * monthlyShadeFactors[i]);
        annualKwh = monthlyKwh.reduce((s, v) => s + v, 0);
      } else {
        annualKwh = baseKwh * shadeFactor;
        monthlyKwh = distribution.map(pct => annualKwh * pct);
      }

      console.log(`[SolarAPI] Fallback model: ${annualKwh.toFixed(0)} kWh`);
    }

    // Financial model
    const annualSavings = annualKwh * SolarConfig.ELECTRICITY_RATE;
    const monthlySavings = annualSavings / 12;

    // Infer consumption from the bill at the MARGINAL rate, after removing the
    // fixed Customer Charge. The charge is part of what the user pays but is
    // not part of what a kWh costs, so leaving it in would inflate their
    // implied usage and understate the offset percentage.
    const billableAmount = Math.max(0, monthlyBill - SolarConfig.MONTHLY_CUSTOMER_CHARGE);
    const monthlyConsumption = billableAmount / SolarConfig.ELECTRICITY_RATE;
    const annualConsumption = Math.max(1, monthlyConsumption * 12);
    const billOffsetPct = Math.min(100, (annualKwh / annualConsumption) * 100);

    const simplePayback = adjustedCost / annualSavings;

    // Payback and 25-year total, in nominal dollars (single loop).
    // Both compound the rate escalation and the panel's degradation. Neither
    // is discounted to present value, so these are nominal figures, not NPV.
    let cumSavings = 0;
    let lifetimeSavings = 0;
    let escalatedPayback = 25;
    for (let i = 0; i < 25; i++) {
      const yearSavings = annualKwh
        * Math.pow(1 - panelDegradation, i)
        * SolarConfig.ELECTRICITY_RATE
        * Math.pow(1 + rateEscalation, i);
      lifetimeSavings += yearSavings;
      cumSavings += yearSavings;
      if (cumSavings >= adjustedCost && escalatedPayback === 25) {
        const prevCum = cumSavings - yearSavings;
        escalatedPayback = i + (adjustedCost - prevCum) / yearSavings;
      }
    }

    // Environmental impact
    const co2Lbs = annualKwh * SolarConfig.CO2_FACTOR;
    const treesEquiv = co2Lbs / 48; // EPA average lb CO2/yr per mature tree
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
      escalatedPayback,
      // Back-compat alias for older call sites. Nominal, not discounted.
      npvPayback: escalatedPayback,
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
      railingFactor,
      costTier: tier,
      escalationPreset: escalationPreset || 'mid',
      panelDegradation,
      rateEscalation,

      // Data quality
      dataSources: { ...SolarState.dataSources },
    };
  },
};
