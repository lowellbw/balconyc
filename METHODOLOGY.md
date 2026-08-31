# Solar Calculator Methodology — balco.nyc

Technical documentation of the energy modeling, financial analysis, and data pipeline behind the balco.nyc balcony solar calculator. Reflects the implementation in `js/config.js`, `js/solar-api.js`, `js/3d-shadow-model.js`, and `js/sun-position.js`.

**Last reviewed against the code: 31 August 2026.** Every constant and formula below was verified against the working tree on that date, and the behaviours described are covered by the regression suite in `tests/`.

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
| `dc_ac_ratio` | 1.1 | A micro-inverter matched to one or two modules; the previous 1.2 modelled more clipping than actually occurs |
| `inv_eff` | 96.5% | Micro-inverter efficiency (Enphase IQ8 ~97%, budget ~96%) |
| `dataset` | nsrdb | Satellite-derived TMY data, best for US locations |
| `soiling` | `3\|3\|4\|5\|6\|7\|7\|7\|6\|5\|4\|3` | Monthly soiling % — NYC urban profile calibrated to NREL/Sandia/Fraunhofer urban-PV studies (3–7% range, summer-heavy from pollen). Sent pipe-delimited, with a bracketed-JSON retry and a final fallback that folds soiling into `losses: 18.3` (see below) |
| `albedo` | 0.20 | Concrete balcony floor reflectance (light-painted walls would be ~0.30) |
| `bifaciality` | 0 | Monofacial panels (would be 0.75 for bifacial) |
| `timeframe` | monthly | Returns 12-month production array |

**Soiling parameter robustness.** NREL documents array parameters as pipe-delimited. If the parameter is rejected the entire request fails, which would silently drop every estimate onto the client-side fallback while the interface still claimed an hourly simulation. The client therefore degrades explicitly: pipe-delimited, then bracketed JSON, then no soiling array at all with `losses` raised to 18.3% (14% compounded with the array's ~5% annual mean). Whichever variant succeeded is recorded on the result.

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

For addresses with NYC Building Footprints data, we build a local 3D scene of all buildings within 200m and compute how much of the balcony's plane-of-array irradiance those buildings block.

**What this factor must and must not measure.** PVWatts is given the panel's real tilt and azimuth, so it already prices orientation: it knows a north-facing vertical panel yields a fraction of a south-facing one. The shade factor is a *second* multiplier on that output, so it must answer only "how much of what PVWatts assumed actually reaches this balcony". Anything else is counted twice. An earlier version charged every hour when the sun sat behind the facade as shading, crediting those hours only a fixed 30% diffuse share. That penalised orientation a second time: an entirely unobstructed east-facing balcony scored 0.54, and a north-facing one 0.32, with no neighbouring building present at all. **The current model returns 1.00 for an unobstructed balcony at every orientation**, and this is asserted directly in the test suite.

**Step 1 — horizon profile.** Every neighbouring footprint is projected onto a 360-bin azimuth skyline as seen from the balcony point. Each polygon edge is subdivided finely enough that no bin is skipped (every ~2m, and at least every 0.5° of angular extent), and each bin keeps the highest obstruction altitude found in that direction. Because the nearest sampled point in a direction wins, concave and L-shaped footprints resolve correctly, buildings that straddle due north wrap without seams, and buildings shorter than the balcony drop out entirely. This replaces the earlier per-sample loop over polygon spans, which paired a polygon's full angular span with its single nearest vertex and so could block sunlight through an L-shaped building's notch.

**Step 2 — sky openness.** The fraction of the panel's sky view that survives the horizon, computed by integrating `cos(theta) x cos(altitude)` over the visible hemisphere — the standard view-factor integral for an isotropic sky. `theta` is the angle of incidence on the panel, so this is tilt-aware: a 35° panel sees more sky than a vertical one, and loses a different share of it.

**Step 3 — daylight sweep.** Sampling every 10 minutes from sunrise to sunset for each of 12 representative days:

1. **Sun position** — altitude and azimuth from `SunPosition.calculate(month, minute)` (Section 5).
2. **Clear-sky proxy** — `ghi = sin(altitude)^0.75`, which keeps solar noon worth several times dawn without over-spiking.
3. **Beam component** — `BEAM_SHARE x ghi x max(0, cos(theta))`, where `cos(theta)` uses the full tilted-surface incidence formula and the panel's actual tilt. This reduces to `cos(altitude) x cos(azimuth difference)` for a vertical panel.
4. **Diffuse component** — `DIFFUSE_SHARE x ghi x (1 + cos(tilt)) / 2`, the isotropic sky view factor of the panel itself.
5. **Blocking** — the beam is lost when the sun's altitude falls below the horizon profile in its azimuth bin. The diffuse component is scaled by sky openness.

**Aggregation.**

```
received = beam x (sun visible) + diffuse x sky_openness
assumed  = beam + diffuse
shade_factor = sum(received) / sum(assumed)
```

Hours when the sun is behind the facade contribute near-zero beam to *both* sums, so they neither reward nor penalise — which is exactly right, because PVWatts has already accounted for them.

**Constants.** `BEAM_SHARE = 0.60` / `DIFFUSE_SHARE = 0.40`, matching the NSRDB annual diffuse fraction of GHI for the Northeast (~0.35–0.42). Only their ratio matters.

**Per-month shade factor** = `received / assumed`, clamped to `[0.10, 1.00]`.

**Annual shade factor** = monthly factors weighted by the NYC GHI distribution (the same array used in §1.2).

**Physics-vs-display separation.** The colored shadow heatmap in the 3D scene uses `display_score = min(1, physics_score x 1.8)` for UI contrast only, and `_scoreShadowImpact` now serves the heatmap alone. The energy path reads the horizon profile, never the display score.

**Direct sun hours.** The "hours of direct sun" figure in the info panel is derived from the same horizon profile as the energy model, so the number shown and the number used can no longer disagree.

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
final_kwh = pvwatts_ac_annual × shade_factor × railing_factor            (uniform shade case)
final_kwh = Σ(pvwatts_ac_monthly[i] × monthly_shade_factor[i]) × railing_factor   (3D case)
```

THERMAL_BONUS is set to 1.0, so it doesn't appear above.

**Railing obstruction.** The railing itself, the mounting hardware and the balcony floor above clip the bottom edge of a rail-mounted panel. Building footprints cannot see any of it and PVWatts assumes an unobstructed module, so it is applied as a separate tilt-dependent factor: 0.95 at 90°, 0.97 at 70°, 0.98 at 60°, 0.99 at 35°. Field reports for vertical balcony mounts put the loss at 5–8%; we take the conservative end. It applies to the fallback model too.

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
billable        = max(0, monthly_bill − 20)          # strip the fixed Customer Charge
bill_offset_%   = annual_kwh / (billable / 0.34 × 12) × 100
```

The Customer Charge (~$20/month) is removed before inferring consumption. It is part of what the household pays but not part of what a kWh costs, so leaving it in inflated implied usage and understated the offset. Bill offset is clamped to a max of 100% and guarded against a $0 monthly bill (the consumption denominator is clamped to ≥1 kWh).

### 4.3 Payback Period

**Simple payback:**
```
simple_payback = adjusted_cost / annual_savings
```

**Escalated payback** runs inside the same 25-year loop as lifetime savings (below), interpolating within the crossover year for a fractional result. It compounds the rate escalation and panel degradation but applies **no discount rate**, so it is a nominal figure, not a net present value. It was previously labelled "NPV payback", which overstated its rigour.

### 4.4 25-Year Lifetime Value

```
lifetime_savings = Σ(annual_kwh × (1 − degradation)^i × 0.34 × (1 + escalation)^i,  i=0..24)
```

Reported in **nominal dollars**. No discount rate is applied, so a dollar in year 25 is counted the same as a dollar today.

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

**Reference costs (800W complete kit, August 2026 US retail):**

| Tier | Cost | Notes |
|---|---|---|
| Budget | $850 | Nonprofit/wholesale kits (Bright Saver member pricing, ~$1.15/W) |
| Mid | $1,200 | EcoFlow PowerStream, Anker SOLIX entry, Bright Saver retail |
| Premium | $1,600 | Anker SOLIX RS40P, Craftstrom complete kit |

These were revised down on 2026-08-31. Bright Saver, a California nonprofit, began selling complete kits nationwide at published zero markup on 13 July 2026 — $414 for a 360W kit to members ($29/yr), $699 otherwise. The previous $1,200/$1,500/$1,800 tiers pre-dated that move and made payback look roughly 40% longer than the cheapest real path.

Federal Residential Clean Energy Credit (§25D) expired for expenditures after Dec 31, 2025 under P.L. 119-21. Cost figures are gross — no federal credit is netted out.

### 4.6 Offset Assumption

Production is assumed to offset household consumption 1:1 at the marginal retail rate. For typical balcony users, production is well below consumption so there is no excess export to model.

**Regulatory status (as of 31 August 2026).** NY's SUNNY Act (S8512/A9111) exempts compliant plug-in devices up to 1,200W AC from interconnection and net-metering requirements. It passed the Senate unanimously in April 2026 and the Assembly on 28 May 2026, and awaits the Governor's signature; it takes effect 90 days after signing, so the realistic opening is early 2027. Two consequences for this model: the 1:1 offset assumption is forward-looking rather than current, and the Act grants **no right to install** — it removes the utility barrier only, so a landlord or co-op board can still refuse. The payback figures are conditional on a permission the model does not represent.

---

## 5. Sun Position (NOAA simplified algorithm)

`js/sun-position.js` implements a simplified NOAA solar-position algorithm tuned for NYC.

- **Day of year** uses the 15th of each month (`DOY_TABLE`) as the representative day.
- **Year** is read dynamically from `new Date().getFullYear()` so the Julian-day base advances with time instead of drifting.
- **DST switch** is keyed off day-of-year, not month: EDT (UTC−4) for DOY 67–304 (Mar 8 – Nov 1 in 2026), EST (UTC−5) otherwise. This avoids the off-by-week errors that month-based switching produced in early March and late October.
- **Azimuth** is computed via `atan2(sin_az, cos_az)` — robust at all altitudes, with no separate `acos` branch. With the sine/cosine terms as defined, this returns azimuth measured clockwise from north directly; no further rotation is applied. An earlier version added a further 180°, which flipped every azimuth (June solar noon read as due north) and fed the 3D scene, the sun arc and the shade model alike. Regression tests now pin June and December solar noon to the south and assert the azimuth sweeps monotonically eastward through the day.

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
| Equipment tier | Budget ($850) / Mid ($1,200) / Premium ($1,600) | Mid |
| Surrounding shading | Open / Some / Dense / Wide avenue | Some |
| Monthly electric bill | $20–$800 | $140 |
| Rate escalation | Low (2%) / Mid (3%) / High (4%) | Mid |

### 7.5 Energy Calculation

1. Map form inputs to PVWatts parameters
2. Call PVWatts V8 API (or use fallback formula)
3. If a 3D scene is initialized, apply per-month shade factors; otherwise apply the static shade factor
4. Run the financial model with the selected tier and escalation preset
5. Compute environmental impact

### 7.6 Graceful Degradation

Every API has a fallback, and every degraded path tells the visitor. When the estimate did not use the full pipeline, a notice above the breakdown names what was missing and what was substituted.

The manual entry panel is also the keyboard- and screen-reader-accessible route to a result: selecting a balcony in the 3D scene requires clicking a WebGL mesh, which is not operable without a pointer.

| API Failure | Fallback Behavior |
|---|---|
| Google Places unavailable | Typed address is geocoded on submit; manual entry panel if that also fails |
| Geoclient fails | Query PLUTO by address string |
| PLUTO fails | Sliders keep defaults |
| Footprints fail | Manual entry panel (floor, direction, shading); static shade factor |
| PVWatts soiling param rejected | Retry bracketed, then fold soiling into `losses: 18.3` |
| PVWatts fails entirely | Client-side fallback formula (Section 1.2), notice shown above the breakdown |
| Solar Resource fails | Hardcoded NYC monthly distribution |
| Neighbor query fails | No 3D shade; static shade factor used, notice shown |
| No WebGL support | Manual entry panel; static shade factor |

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
| Bright Saver (nonprofit at-cost kits) | brightsaver.org/balcony-solar-kits | August 2026 kit cost calibration |
| NREL 2024 PV Degradation Review | nrel.gov/docs/fy24osti/87524.pdf | Degradation rates by tier |

---

## 9. Accuracy & Limitations

**Expected accuracy:**
- **About ±15%** on annual production with PVWatts V8 and the 3D shadow model active
- **About ±20%** with the client-side fallback (no PVWatts, no 3D)

**This band is modeled, not measured.** It is derived from the uncertainty of the inputs, not from comparing predictions against metered NYC installations. No such comparison has been run. Treat it as a considered estimate of our own uncertainty rather than a validated tolerance, and read the calibration anchors below as consistency checks against other models rather than against reality.

**What the model captures:**
- Latitude-specific solar resource and seasonal variation (PVWatts NSRDB)
- Vertical / near-vertical tilt production loss, calibrated against PVWatts and HTW Berlin
- Azimuth-dependent production across all 8 compass directions
- NYC urban soiling, in the right ballpark (3–7% monthly) rather than the older 11–17% over-derate
- Floor-level shadow estimation with a smooth tanh response, plus a full horizon-profile 3D model when neighbor footprints are available
- Tilt-aware angle of incidence in both the energy and shade models
- Isotropic diffuse sky, reduced by the actual sky openness of the balcony rather than a fixed constant
- Concave and L-shaped neighbouring footprints, and buildings straddling due north
- Railing and mounting-hardware obstruction of the panel's lower edge
- Tier-aware degradation and rate-escalation bands in the 25-year financial projection

**What the model still does NOT capture:**
- Micro-shading from things not in the building footprint dataset — trees, awnings, AC units, signage
- The overhang of the balcony directly above, which can sweep across a panel within an hour
- Snow coverage in winter months (vertical sheds quickly but not instantly)
- Time-of-use rate structure — a vertical panel shifts output toward winter and the shoulders of the day
- Future electricity-rate trajectory — the single largest swing factor in lifetime savings (2% vs 4% escalation = roughly ±15% on lifetime $)
- Bifacial panels and light-painted walls (`albedo` and `bifaciality` are currently fixed)
- Ground-reflected irradiance is derated at the same rate as beam and sky, rather than modelled separately

**Validation anchors:**
- HTW Berlin Stecker-Solar-Simulator: 800W vertical south at 52.5°N → ~500 kWh/yr; scaled to NYC's 40.7°N latitude (~+25% irradiance) → ~625 kWh/yr unshaded vertical south, which the fallback model reproduces within ±5%.
- NYSERDA NY Solar Map baseline: 1,238 kWh/kW/yr at optimal tilt; PVWatts with the calculator's parameters produces ~1,300 kWh/kW/yr for premium fixed-tilt NYC — within bounds.

**Regression suite.** `tests/` exercises the shipped model files directly under Node (`npm test`, no dependencies). It pins solar position against NOAA reference values, asserts the invariant that an unobstructed balcony scores 1.00 at every orientation, checks horizon-profile geometry against concave and seam-straddling footprints, and locks the financial and environmental arithmetic. Both defects fixed on 2026-08-31 — the azimuth flip and the self-shading double-count — were invisible to inspection and are now covered by failing-first tests.
