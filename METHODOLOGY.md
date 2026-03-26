# Solar Calculator Methodology — balco.nyc

Technical documentation of the energy modeling, financial analysis, and data pipeline behind the balco.nyc balcony solar calculator.

---

## 1. Energy Production Model

### 1.1 Primary Model: NREL PVWatts V8

The core engine is the US Department of Energy's **PVWatts V8 API**, maintained by the National Renewable Energy Laboratory (NREL). PVWatts is the industry standard — every commercial solar installer uses it or a derivative.

**What it does:** Given a location, panel configuration, and system size, PVWatts simulates all 8,760 hours of a typical meteorological year using the 2020 National Solar Radiation Database (NSRDB) with hourly satellite-derived weather data. It returns monthly and annual AC energy output in kWh.

**API endpoint:** `https://developer.nrel.gov/api/pvwatts/v8.json`

**Parameters we pass (balcony-specific):**

| Parameter | Value | Why |
|---|---|---|
| `system_capacity` | 0.4–1.6 kW | From user's railing width (1-4 panels × 400W) |
| `module_type` | 1 (Premium) | 19% efficiency, better temperature coefficient |
| `array_type` | 0 (Fixed Open Rack) | Only option for balcony mount |
| `tilt` | 90° or 70° | 90° = vertical railing mount, 70° = angled mount |
| `azimuth` | 0–315° | User's balcony direction (8 compass points) |
| `losses` | 22% | Higher than 14% rooftop default — accounts for balcony wiring, partial shading, non-optimal conditions |
| `dc_ac_ratio` | 1.2 | Standard for small systems with micro-inverters |
| `inv_eff` | 96.5% | Micro-inverter efficiency (Enphase IQ8 ~97%, budget ~96%) |
| `dataset` | nsrdb | 2020 satellite-derived TMY data, best for US locations |
| `soiling` | [12,11,12,14,16,17,17,16,14,11,11,11] | Monthly soiling % — NYC urban profile (dust, pollen, pigeon residue). Higher in summer. |
| `albedo` | 0.20 | Ground reflectance for concrete balcony floor (light-colored: ~0.30) |
| `bifaciality` | 0 | Monofacial panels (set to 0.75 for bifacial) |
| `timeframe` | monthly | Returns 12-month production array |

**PVWatts output used:**
- `ac_monthly` — 12 values of monthly AC energy (kWh), used directly for the production chart
- `ac_annual` — total annual AC output (kWh), used as the base for all financial calculations
- `station_info` — weather station metadata, displayed in system details

### 1.2 Fallback Model (No API Available)

When PVWatts is unavailable (no API key, network failure, no address entered), the calculator uses a client-side formula:

```
annual_kwh = BASELINE × system_kw × tilt_factor × azimuth_factor
             × loss_adjustment × soiling_factor × shade_factor × thermal_bonus
```

Where:
- **BASELINE** = 1,400 kWh/kW/year (PVWatts reference for NYC at optimal ~40° tilt, 14% standard losses)
- **tilt_factor**: 0.72 (vertical 90°) or 0.83 (angled 70°) — ratio of production vs optimal tilt
- **azimuth_factor**: S=1.00, SE/SW=0.92, E/W=0.72, NE/NW=0.45, N=0.32
- **loss_adjustment**: (1-0.22)/(1-0.14) = 0.907 — adjusts from 14% baseline losses to 22% balcony losses
- **soiling_factor**: 0.90 — 10% average NYC urban soiling loss
- **shade_factor**: 0.60–0.96 (see Section 2)
- **thermal_bonus**: 1.03 (3% gain from better balcony airflow vs roof)

**Monthly distribution** uses either NREL Solar Resource API data (location-specific GHI) or a hardcoded NYC seasonal curve:
```
Jan: 5.6%, Feb: 6.8%, Mar: 8.2%, Apr: 9.2%, May: 10.5%, Jun: 11.2%
Jul: 11.4%, Aug: 10.3%, Sep: 8.8%, Oct: 7.3%, Nov: 5.6%, Dec: 5.1%
```

---

## 2. Shadow Derating Model

PVWatts assumes an unobstructed installation. NYC balconies face building-level shading that PVWatts cannot model. We apply a **post-PVWatts shadow multiplier** based on the user's floor position and surrounding density.

### 2.1 Shade Factor Lookup Table

The shade factor (0.0 = fully shaded, 1.0 = no shading) is determined by two inputs:

**Floor tier** (user's floor / total building floors):
- **Top** (≥85th percentile): penthouse, minimal obstruction
- **High** (≥55th percentile): upper third, some taller neighbors possible
- **Mid** (≥25th percentile): middle of building, typical NYC shadow exposure
- **Low** (<25th percentile): ground-level, significant shadow in dense areas

**Shading environment** (user-selected):
- **Wide open**: no tall buildings nearby, unobstructed sky
- **Some buildings**: typical NYC block, a few taller buildings
- **Dense urban canyon**: Midtown/FiDi, tall buildings on all sides
- **Wide avenue**: low floor but on a wide street (Broadway, Park Ave)

| | Open | Some Buildings | Dense Canyon | Wide Avenue |
|---|---|---|---|---|
| **Top floor** | 0.96 | 0.93 | 0.85 | 0.95 |
| **High floor** | 0.93 | 0.88 | 0.78 | 0.90 |
| **Mid floor** | 0.88 | 0.82 | 0.72 | 0.84 |
| **Low floor** | 0.78 | 0.68 | 0.60 | 0.75 |

**Source:** Derived from NYC CEQR shadow analysis standards. At NYC latitude (40.7°N), the winter sun at noon is ~27° elevation — a 200-foot building casts a shadow ~430 feet. The lookup table approximates the irradiance-weighted annual shadow fraction for each scenario.

### 2.2 Neighbor Building Enhancement

When address data is available, we query NYC Building Footprints within a 200-meter radius and count buildings taller than the user's estimated floor height. This provides validation context ("We found X buildings taller than your floor within 200m") but does not yet override the lookup table.

### 2.3 Thermal Bonus

Balcony panels benefit from better airflow compared to roof-mounted systems. Cooler cells = higher efficiency at ~0.35%/°C. We apply a flat **1.03× multiplier** (3% gain), which is the conservative end of the 3-5% range documented in balcony solar literature.

### 2.4 Final Energy Formula

```
final_kwh = pvwatts_ac_annual × shade_factor × thermal_bonus(1.03)
```

The shade factor and thermal bonus are the ONLY post-PVWatts multipliers. All other derating (soiling, losses, inverter efficiency, tilt, azimuth) is handled inside the PVWatts API call via its parameters.

---

## 3. Building Orientation Detection

When the user enters an address, we query the NYC Building Footprints dataset to get the building's polygon geometry. From the polygon, we detect which direction the facades face.

### Algorithm (from spec Section 2.4):

1. Extract exterior ring coordinates from the building footprint polygon
2. Compute edge vectors (dx, dy) between consecutive vertices
3. Calculate each edge's compass bearing: `atan2(dx, dy)` converted to degrees
4. Compute perpendicular facade directions: `edge_bearing ± 90°`
5. Sort edges by length (longest edge = primary facade)
6. Map facade directions to nearest 45° compass increment
7. Rank by solar potential: S > SE/SW > E/W > NE/NW > N
8. Return the best solar-facing direction as the suggestion

**Confidence:** "High" if the longest edge is >1.3× the second-longest (building has a clear primary axis). "Medium" otherwise.

**Manhattan grid note:** Manhattan's street grid runs ~29° east of true north. A building that "faces the avenue" actually faces ~209° (SSW) or ~29° (NE). The algorithm detects this from the actual polygon geometry, not assumptions about the grid.

---

## 4. Financial Model

### 4.1 Electricity Rate

**Con Edison SC-1 residential rate:** $0.22/kWh all-in (supply + delivery). This is the 2026 baseline rate for NYC residential customers.

### 4.2 Annual Savings

```
annual_savings = annual_kwh × $0.22
monthly_savings = annual_savings / 12
bill_offset_% = annual_kwh / (monthly_bill / $0.22 × 12) × 100
```

### 4.3 Payback Period

**Simple payback:**
```
simple_payback = system_cost / annual_savings
```

**NPV payback** (accounts for rate escalation):
```
Solve for N where: Σ(annual_savings × 1.03^i, i=0..N) = system_cost
```

We interpolate within the year for a precise fractional result.

### 4.4 25-Year Lifetime Value

```
lifetime_savings = Σ(annual_kwh × $0.22 × 1.03^i × 0.995^i, i=0..24)
```

Where:
- `1.03^i` = 3% annual electricity rate escalation
- `0.995^i` = 0.5% annual panel degradation (industry standard for mono-Si panels)

### 4.5 System Cost Scaling

The user selects a cost tier (budget/mid/premium) calibrated to an 800W system. For other system sizes, cost scales linearly:
```
adjusted_cost = selected_cost × (system_watts / 800)
```

**Reference costs (800W complete kit):**
- Budget: ~$1,200 (generic panels + micro-inverter + hardware)
- Mid-range: ~$2,200 (quality panels, good inverter)
- Premium: ~$3,000 (branded kit: EcoFlow, Anker SOLIX)

---

## 5. Environmental Impact

### CO₂ Offset
```
co2_lbs = annual_kwh × 0.65
```
NYC's grid emission factor is ~0.65 lbs CO₂/kWh (source: EPA eGRID, NPCC/NYC subregion).

### Equivalencies
- **Trees planted:** co2_lbs / 120 (one mature tree absorbs ~120 lbs CO₂/year)
- **Driving miles offset:** co2_lbs / 0.89 (average car emits ~0.89 lbs CO₂/mile)
- **Smartphone charges:** annual_kwh × 1000 / 12 (~12 Wh per full phone charge)

---

## 6. Data Pipeline

### 6.1 Address Resolution

1. **Google Places Autocomplete** — user types address, gets type-ahead suggestions bounded to NYC (40.48°N–40.92°N, 74.26°W–73.70°W)
2. On selection → extract lat/lon, formatted address, address components

### 6.2 Building Data Lookup (Parallel)

Three queries fire concurrently via `Promise.allSettled()`:

**a) NYC Geoclient → PLUTO**
- Parse address into houseNumber, street, borough
- Call NYC Geoclient API (via server proxy for CORS) → get BBL, BIN
- Query PLUTO by BBL → get numfloors, yearbuilt, bldgclass, unitsres

**b) NYC Building Footprints**
- Query by BIN → get polygon, heightroof, groundelev
- Run orientation detection algorithm → suggest balcony direction

**c) NREL Solar Resource**
- Query by lat/lon → get monthly GHI distribution
- Normalize into production distribution array

### 6.3 Form Pre-fill

Auto-populated from building data:
- Total floors slider ← PLUTO `numfloors`
- Direction picker ← footprint orientation algorithm
- Building info card ← address, floors, year built, building class, height

### 6.4 Energy Calculation

1. Map form inputs to PVWatts parameters
2. Call PVWatts V8 API (or use fallback formula)
3. Apply shadow derating × thermal bonus
4. Run financial model
5. Compute environmental impact

### 6.5 Graceful Degradation

Every API has a fallback. The calculator works in full manual mode with zero API calls — identical to a static client-side calculator. APIs enhance precision but aren't required.

| API Failure | Fallback Behavior |
|---|---|
| Google Places unavailable | "Skip" link → manual entry |
| Geoclient fails | Query PLUTO by address string |
| PLUTO fails | Sliders keep defaults |
| Footprints fail | User picks direction manually |
| PVWatts fails | Client-side formula (yellow banner shown) |
| Solar Resource fails | Hardcoded NYC monthly distribution |
| Neighbor query fails | No impact on calculation |

---

## 7. Data Sources

| Source | Endpoint | Data Used |
|---|---|---|
| NREL PVWatts V8 | developer.nrel.gov/api/pvwatts/v8.json | Hourly-simulated energy production |
| NREL Solar Resource | developer.nrel.gov/api/solar/solar_resource/v1.json | Monthly GHI irradiance |
| NYC PLUTO | data.cityofnewyork.us/resource/64uk-42ks.json | Building floors, class, year, units |
| NYC Building Footprints | data.cityofnewyork.us/resource/5zhs-2jue.geojson | Building polygon, height, elevation |
| NYC Geoclient | api.nyc.gov/geoclient/v2/address.json | BBL, BIN from address |
| Google Places | Maps JavaScript API | Address autocomplete + geocoding |
| EPA eGRID | Published grid emission factors | NYC CO₂/kWh factor (0.65 lbs) |

---

## 8. Accuracy & Limitations

**Expected accuracy:** ±15% with PVWatts API data, ±20% with fallback model.

**What the model captures well:**
- Latitude-specific solar resource and seasonal variation
- Vertical/near-vertical tilt production loss
- Azimuth-dependent production across all 8 compass directions
- NYC urban soiling (dust, pollen) via monthly soiling array
- Floor-level shadow estimation
- Rate escalation and panel degradation in financial projections

**What the model does NOT capture (Phase 3 planned):**
- Hour-by-hour building shadow analysis using 3D geometry
- Irradiance-weighted shadow factors (noon shadow costs more than sunset shadow)
- Balcony self-shading (upper floor overhang)
- Tree canopy effects
- Exact micro-climate variations block-by-block
- Snow coverage in winter months

**Validation approach:** Compare estimates against Shadowmap.org's 3D Solar Analytics for spot-checks. Their facade-level irradiance tool uses 50km building radius and 20-year weather data.
