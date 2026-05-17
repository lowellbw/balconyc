# Solar Calculator Methodology — balco.nyc

Technical documentation of the energy modeling, financial analysis, and data pipeline behind the balco.nyc balcony solar calculator. Reflects the implementation in `js/config.js`, `js/solar-api.js`, `js/3d-shadow-model.js`, and `js/sun-position.js`.

---

## 1. Energy Production Model

### 1.1 Primary Model: NREL PVWatts V8

The core engine is the US Department of Energy's **PVWatts V8 API**, maintained by NREL. PVWatts simulates 8,760 hours of a typical meteorological year using the NSRDB satellite weather dataset and returns monthly and annual AC energy output in kWh.

**API endpoint:** `https://developer.nrel.gov/api/pvwatts/v8.json`

**Parameters we pass (balcony-specific):**

| Parameter | Value | Why |
|---|---|---|
| `system_capacity` | 0.4–1.6 kW | From user's railing width (1–4 panels × 400W) |
| `module_type` | 1 (Premium) | 19% efficiency, better temperature coefficient |
| `array_type` | 0 (Fixed Open Rack) | Balcony rails have open airflow; PVWatts already models cell temperature from TMY weather under this setting, so no separate thermal multiplier is applied |
| `tilt` | 35°, 60°, 70°, or 90° | 90° = vertical railing, 70°/60° = angled mounts, 35° ≈ optimal for NYC |
| `azimuth` | 0–315° | User's balcony direction (8 compass points) |
| `losses` | 14% | PVWatts default. Soiling has been moved out of this parameter into the monthly soiling array below to avoid double-counting |
| `dc_ac_ratio` | 1.2 | Standard for small systems with micro-inverters |
| `inv_eff` | 96.5% | Micro-inverter efficiency (Enphase IQ8 ~97%, budget ~96%) |
| `dataset` | nsrdb | Satellite-derived TMY data, best for US locations |
| `soiling` | `[3,3,4,5,6,7,7,7,6,5,4,3]` | Monthly soiling % — NYC urban profile calibrated to NREL/Sandia/Fraunhofer urban-PV studies (3–7% range, summer-heavy from pollen) |
| `albedo` | 0.20 | Concrete balcony floor reflectance (light-painted walls would be ~0.30) |
| `bifaciality` | 0 | Monofacial panels (would be 0.75 for bifacial) |
| `timeframe` | monthly | Returns 12-month production array |

**PVWatts output used:**
- `ac_monthly` — 12 values of monthly AC energy (kWh), used for the production chart and for applying per-month 3D shade factors
- `ac_annual` — total annual AC output (kWh), used when the shade model returns only an annual factor

**Losses decomposition.** The 14% bundle approximates: mismatch 3%, wiring 4% (longer DC runs from balcony to junction than rooftop), connections 0.5%, light-induced degradation 1.5%, nameplate 1%, availability 3%, snow 1%. Soiling and shading are modeled separately. There is no rooftop-vs-balcony "balcony loss adder" — the difference shows up in the soiling array and in the shade factor.

### 1.2 Fallback Model (no API available)

When PVWatts is unavailable (no API key, network failure, no address entered), the calculator uses a client-side formula:

```
annual_kwh = BASELINE × system_kw × tilt_factor × azimuth_factor
             × urban_soiling × thermal_bonus × shade_factor
```

Where:
- **BASELINE** = 1,300 kWh/kW/year — NYC PVWatts reference at optimal ~40° tilt with default losses. Aligned with NYSERDA NY Solar Map's 1,238 kWh/kW/yr published assumption.
- **tilt_factor** — production relative to optimal tilt, calibrated against PVWatts vertical NYC and HTW Berlin Stecker-Solar reference:
  - 35° → 1.00 (top-mount, near-optimal for NYC)
  - 60° → 0.85
  - 70° → 0.78
  - 90° → 0.60 (vertical railing)
- **azimuth_factor** — S=1.00, SE/SW=0.92, E/W=0.72, NE/NW=0.45, N=0.32
- **urban_soiling** = 0.95 — matches the annual average of the PVWatts soiling array
- **thermal_bonus** = 1.0 — no double-count; PVWatts (and this fallback for consistency) treats cell-temperature effects as part of the baseline
- **shade_factor** — see Section 2

**Monthly distribution** uses either NREL Solar Resource API data (location-specific GHI) or a hardcoded NYC seasonal curve:
```
Jan: 5.6%, Feb: 6.8%, Mar: 8.2%, Apr: 9.2%, May: 10.5%, Jun: 11.2%
Jul: 11.4%, Aug: 10.3%, Sep: 8.8%, Oct: 7.3%, Nov: 5.6%, Dec: 5.1%
```

---

## 2. Shadow Derating Model

PVWatts assumes an unobstructed installation. NYC balconies face building-level shading PVWatts cannot see. We apply a **post-PVWatts shade multiplier** computed either from a 3D model of the surrounding buildings (when available) or from a static lookup as a fallback.

### 2.1 3D Shadow Model (when 3D scene is loaded)

For addresses with NYC Building Footprints data, we build a local 3D scene of all buildings within 200m and run a per-month, per-half-hour irradiance-weighted shadow simulation against the user's balcony point.

**Per-sample loop (`computeAnnualShadeProfile`, sampling every 30 min from sunrise to sunset for each of 12 representative days):**

1. **Sun position** — compute altitude and azimuth from `SunPosition.calculate(month, minute)` (Section 5).
2. **Irradiance weight** — `sin(altitude)^0.6`. A clear-sky direct-irradiance proxy that gives a noon sample roughly 5× the weight of a dawn sample but doesn't over-spike at solar noon.
3. **Self-shading test** — if the sun is behind the facade (|sun_azimuth − balcony_azimuth| > 90°), the panel only sees diffuse sky. We add a `DIFFUSE_FRACTION = 0.30` contribution weighted by the irradiance weight. This corrects a v1 omission where self-shaded periods contributed zero — a vertical NYC facade still receives ~30% of its energy from diffuse sky.
4. **Direct-sun samples** — when the sun is on the panel's side, weight the sample by `irradiance_weight × cos(altitude) × cos(facade_diff)` (panel-incidence cosine). This shifts shade math toward "what fraction of high-irradiance hours are blocked" rather than "what fraction of daylight."
5. **Neighbor blocking** — for each non-target building, compute its angular span as seen from the balcony point (`_polygonAngularSpan` projects every polygon vertex onto the balcony's view azimuth). If the sun's azimuth falls inside that span and its altitude is below the angle subtended by the building top, the building is blocking. Severity = `min(1, vertical_block × width_factor)`. We take the maximum across all neighbors.
6. **Aggregate** — `unshaded_sum += (1 − max_shadow) × sample_weight`, `total_weight += sample_weight`.

**Per-month shade factor** = `unshaded_sum / total_weight`, clamped to `[0.15, 0.98]`.

**Annual shade factor** = monthly factors weighted by the NYC GHI distribution (the same array used in §1.2).

**Physics-vs-display separation.** The colored shadow heatmap in the 3D scene uses `display_score = min(1, physics_score × 1.8)` for UI contrast only. Only `physics_score` ever feeds back into the energy calculation. This prevents the display amplification from leaking into kWh numbers.

**Polygon-edge angular projection.** Earlier versions of the model approximated each neighbor as "centroid + 10 m." Now the actual polygon footprint is projected to angular extents from the viewer, including correct wrap-around handling when a building straddles the ±π azimuth seam.

### 2.2 Static Shade Factor (fallback)

When the 3D scene isn't loaded (no footprint data, mobile path, or in-page calculator without WebGL), shade is interpolated from a continuous function instead of the legacy 4×4 lookup table:

```
ratio = floor / total_floors
base_exposure = 0.5 + 0.5 × tanh(3 × (ratio − 0.45))
shade_factor = range.min + base_exposure × (range.max − range.min)
```

Per-shading-environment ranges:

| Shading | min (low floors) | max (top floors) |
|---|---|---|
| Open | 0.85 | 0.97 |
| Some buildings | 0.65 | 0.94 |
| Dense canyon | 0.45 | 0.87 |
| Wide avenue | 0.70 | 0.96 |

The tanh sigmoid is centred at the 45th-percentile floor and is steepest in the middle of the building — i.e. the floor-tier transition zones are smooth rather than step-functions.

### 2.3 Neighbor Building Query

When address data is available, we query NYC Building Footprints within a 200-meter radius. These footprints feed the 3D scene and the polygon-edge shadow projection. Without them, the calculator falls back to the static shade factor above.

### 2.4 Final Energy Formula

```
final_kwh = pvwatts_ac_annual × shade_factor       (uniform shade case)
final_kwh = Σ(pvwatts_ac_monthly[i] × monthly_shade_factor[i])   (3D case)
```

THERMAL_BONUS is set to 1.0, so it doesn't appear above. The shade factor is the only post-PVWatts multiplier.

---

## 3. Building Orientation Detection

When the user enters an address, we query NYC Building Footprints for the polygon geometry and detect facade directions.

**Algorithm:**

1. Extract exterior ring coordinates from the building footprint polygon
2. Compute edge vectors (dx, dy) between consecutive vertices
3. Calculate each edge's compass bearing: `atan2(dx, dy)` converted to degrees
4. Compute perpendicular facade directions: `edge_bearing ± 90°`
5. Sort edges by length (longest edge = primary facade)
6. Map facade directions to nearest 45° compass increment
7. Rank by solar potential: S > SE/SW > E/W > NE/NW > N
8. Return the best solar-facing direction as the suggestion

**Confidence:** "high" if the longest edge is >1.3× the second-longest; "medium" otherwise.

**Manhattan grid note:** Manhattan's street grid runs ~29° east of true north. A building that "faces the avenue" actually faces ~209° (SSW) or ~29° (NE). The algorithm reads this from the actual polygon, not from grid assumptions.

---

## 4. Financial Model

### 4.1 Electricity Rate

**Con Edison SC-1 residential rate:** **$0.34/kWh** all-in marginal rate (supply + delivery + GRT + sales tax, excluding the flat customer charge). Source: Con Ed historical bill table 2023–2025, projected forward by the 2026 rate-case settlement (PSC approved January 22, 2026: +3.5% in 2026).

The marginal rate is the right number for solar offset: every kWh produced replaces one extra kWh the household would have bought. The Customer Charge is intentionally excluded because solar can't offset a flat fee.

### 4.2 Annual Savings

```
annual_savings  = annual_kwh × 0.34
monthly_savings = annual_savings / 12
bill_offset_%   = annual_kwh / (monthly_bill / 0.34 × 12) × 100
```

Bill offset is clamped to a max of 100% and guarded against a $0 monthly bill (the consumption denominator is clamped to ≥1 kWh).

### 4.3 Payback Period

**Simple payback:**
```
simple_payback = adjusted_cost / annual_savings
```

**NPV payback** runs inside the same 25-year loop as lifetime savings (below), interpolating within the crossover year for a fractional result.

### 4.4 25-Year Lifetime Value

```
lifetime_savings = Σ(annual_kwh × (1 − degradation)^i × 0.34 × (1 + escalation)^i,  i=0..24)
```

Where:
- **degradation** is tier-aware (default mid-tier 0.5%/yr):
  - Premium: 0.4%/yr  → 90.5% of original output at year 25
  - Mid:     0.5%/yr  → 88.7%
  - Budget:  0.7%/yr  → 84.3%
  Source: NREL 2024 PV degradation review.
- **escalation** is user-selectable, default 3%/yr (mid), with low (2%) / high (4%) presets exposed in the Customize panel. Long-run national EIA data tracks ~2–2.5%/yr; recent Con Ed history is closer to 7%/yr but skewed by one-off settlements. 3% is a reasonable central estimate; the band conveys honest uncertainty.

### 4.5 System Cost Scaling

The user selects a cost tier (budget / mid / premium) calibrated to an 800W kit. For other system sizes, cost scales linearly:
```
adjusted_cost = tier_cost × (system_watts / 800)
```

**Reference costs (800W complete kit, 2026 US retail):**

| Tier | Cost | Notes |
|---|---|---|
| Budget | $1,200 | No-name panel + cheap micro-inverter |
| Mid | $1,500 | EcoFlow PowerStream, Anker SOLIX entry |
| Premium | $1,800 | Anker SOLIX RS40P, Bright Saver complete kit |

### 4.6 Net Metering / SUNNY Act

For typical balcony users, production is well below household consumption, so excess export is rare and the calculator assumes 1:1 offset at the marginal retail rate.

The NY **SUNNY Act (S8512 Krueger / A9111 Gallagher)** passed the State Senate unanimously on April 21, 2026 and is awaiting Assembly action as of this writing. If enacted, it would exempt small plug-in solar (up to 800W) from interconnection and net-metering requirements outright. The calculator's savings figures assume this regime; until the bill is enacted, plug-in solar in NY technically requires Con Ed interconnection like any distributed generator.

---

## 5. Sun Position (NOAA simplified algorithm)

`js/sun-position.js` implements a simplified NOAA solar-position algorithm tuned for NYC.

- **Day of year** uses the 15th of each month (`DOY_TABLE`) as the representative day.
- **Year** is read dynamically from `new Date().getFullYear()` so the Julian-day base advances with time instead of drifting.
- **DST switch** is keyed off day-of-year, not month: EDT (UTC−4) for DOY 67–304 (Mar 8 – Nov 1 in 2026), EST (UTC−5) otherwise. This avoids the off-by-week errors that month-based switching produced in early March and late October.
- **Azimuth** is computed via `atan2(sin_az, cos_az)` — robust at all altitudes, with no separate `acos` branch.

`getDayBounds(month)` searches for sunrise / sunset by scanning altitude crossings, used by the 3D shade simulation to bound its sampling loop.

---

## 6. Environmental Impact

### CO₂ Offset
```
co2_lbs = annual_kwh × 0.89
```
0.89 lbs CO₂/kWh — EPA **eGRID2023** output emission rate for the **NYCW subregion** (released 2025, latest available). This is the "average grid" number, conservative relative to the eGRID non-baseload rate (~0.97 lbs/kWh).

### Equivalencies
- **Trees:** `co2_lbs / 48` — EPA's averaged-across-all-trees figure for annual sequestration.
- **Driving miles offset:** `co2_lbs / 0.89` — EPA 2024 average passenger-car emission rate (0.906 lbs/mile rounded).
- **Smartphone charges:** `annual_kwh × 1000 / 12` — ~12 Wh per full smartphone charge.

---

## 7. Data Pipeline

### 7.1 Address Resolution

1. **Google Places Autocomplete** — user types address, gets type-ahead suggestions bounded to NYC (40.48°N–40.92°N, 74.26°W–73.70°W)
2. On selection → extract lat/lon, formatted address, address components

### 7.2 Building Data Lookup

Geoclient runs first (its output BBL/BIN feeds the other queries), then three queries fire concurrently via `Promise.allSettled()`:

**a) NYC Geoclient → PLUTO**
- Parse address into houseNumber, street, borough (with a corrected USPS ZIP atlas: prefix `104` → Bronx; Long Island `110` is intentionally excluded as it isn't NYC)
- Call NYC Geoclient (via server proxy for CORS) → get BBL, BIN
- Query PLUTO by BBL → numfloors, yearbuilt, bldgclass, unitsres, bldgarea, zonedist1

**b) NYC Building Footprints**
- Query by BIN → polygon, heightroof, groundelev
- Run orientation detection (Section 3) → suggest balcony direction

**c) NREL Solar Resource**
- Query by lat/lon → monthly GHI
- Normalize into a per-month distribution

**d) Neighbor query (background, non-blocking)**
- 200m radius, up to 500 buildings — feeds the 3D scene and shadow model

### 7.3 Form Pre-fill

Auto-populated from building data:
- Total floors ← PLUTO `numfloors`
- Direction picker ← footprint orientation algorithm
- Building info card ← address, floors, year built, building class, height

### 7.4 User-Adjustable Inputs (Customize panel)

The breakdown modal exposes the previously-hardcoded modeling assumptions:

| Input | Options | Default |
|---|---|---|
| Mount tilt | 35° / 60° / 70° / 90° | 90° |
| System size | 400W / 800W / 1200W / 1600W | 800W |
| Equipment tier | Budget / Mid / Premium | Mid |
| Surrounding shading | Open / Some / Dense / Wide avenue | Some |
| Monthly electric bill | $20–$800 | $200 |
| Rate escalation | Low (2%) / Mid (3%) / High (4%) | Mid |

### 7.5 Energy Calculation

1. Map form inputs to PVWatts parameters
2. Call PVWatts V8 API (or use fallback formula)
3. If a 3D scene is initialized, apply per-month shade factors; otherwise apply the static shade factor
4. Run the financial model with the selected tier and escalation preset
5. Compute environmental impact

### 7.6 Graceful Degradation

Every API has a fallback. The calculator works in full manual mode with zero API calls.

| API Failure | Fallback Behavior |
|---|---|
| Google Places unavailable | "Skip" link → manual entry |
| Geoclient fails | Query PLUTO by address string |
| PLUTO fails | Sliders keep defaults |
| Footprints fail | User picks direction manually; no 3D shade |
| PVWatts fails | Client-side fallback formula (Section 1.2), yellow banner shown |
| Solar Resource fails | Hardcoded NYC monthly distribution |
| Neighbor query fails | No 3D shade; static shade factor used |

---

## 8. Data Sources

| Source | URL | Used for |
|---|---|---|
| NREL PVWatts V8 | developer.nrel.gov/api/pvwatts/v8.json | Hourly-simulated production |
| NREL Solar Resource | developer.nrel.gov/api/solar/solar_resource/v1.json | Monthly GHI irradiance |
| NYSERDA NY Solar Map | nysolarmap.com/about/map-assumptions | Yield baseline cross-check (1,238 kWh/kW/yr) |
| NYC PLUTO | data.cityofnewyork.us/resource/64uk-42ks.json | Building floors, class, year, units |
| NYC Building Footprints | data.cityofnewyork.us/resource/5zhs-2jue.geojson | Polygon, height, elevation, neighbor query |
| NYC Geoclient | api.nyc.gov/geoclient/v2/address.json | BBL, BIN from address |
| Google Places | Maps JavaScript API | Address autocomplete + geocoding |
| Con Edison SC-1 historical bills | coned.com (historical-average-full-service-electric-rates.pdf) | Electricity rate |
| Con Edison 2026–2028 rate case | dps.ny.gov (con-edison-rate-case-visual-supplement) | Rate escalation |
| EPA eGRID2023 | epa.gov/egrid/summary-data | CO₂ factor (NYCW subregion) |
| HTW Berlin Stecker-Solar-Simulator | solar.htw-berlin.de | Vertical-mount yield calibration |
| NY SUNNY Act (S8512/A9111) | nysenate.gov/legislation/bills/2025/S8512 | Plug-in solar regulatory status |
| NREL 2024 PV Degradation Review | nrel.gov/docs/fy24osti/87524.pdf | Degradation rates by tier |

---

## 9. Accuracy & Limitations

**Expected accuracy:**
- **±12%** on annual production with PVWatts V8 and the 3D shadow model active
- **±18%** with the client-side fallback (no PVWatts, no 3D)

**What the model captures:**
- Latitude-specific solar resource and seasonal variation (PVWatts NSRDB)
- Vertical / near-vertical tilt production loss, calibrated against PVWatts and HTW Berlin
- Azimuth-dependent production across all 8 compass directions
- NYC urban soiling, in the right ballpark (3–7% monthly) rather than the older 11–17% over-derate
- Floor-level shadow estimation with a smooth tanh response, plus full polygon-edge 3D shadowing when neighbor footprints are available
- Diffuse-sky contribution to self-shaded periods (~30% of clear-sky)
- Irradiance-weighted shadow sampling (a noon shadow costs more than a dawn shadow)
- Tier-aware degradation and rate-escalation bands in the 25-year financial projection

**What the model still does NOT capture:**
- Micro-shading from things not in the building footprint dataset — trees, awnings, AC units, signage
- Snow coverage in winter months (vertical sheds quickly but not instantly)
- Future electricity-rate trajectory — the single largest swing factor in lifetime savings (2% vs 4% escalation = roughly ±15% on lifetime $)
- Bifacial panels and light-painted walls (`albedo` and `bifaciality` are currently fixed)

**Validation anchors:**
- HTW Berlin Stecker-Solar-Simulator: 800W vertical south at 52.5°N → ~500 kWh/yr; scaled to NYC's 40.7°N latitude (~+25% irradiance) → ~625 kWh/yr unshaded vertical south, which the fallback model now reproduces within ±5%.
- NYSERDA NY Solar Map baseline: 1,238 kWh/kW/yr at optimal tilt; PVWatts with the calculator's parameters produces ~1,300 kWh/kW/yr for premium fixed-tilt NYC — within bounds.
