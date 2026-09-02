# Methodology audit, September 2026

**Date:** 2026-09-02. **Code audited:** `main` at `b69809e` (branch `claude/balcony-solar-methodology-2ymsuh`). **Tests at start:** `npm test` 112/112.

**Two questions were asked.** Does the shipped code do what the public methodology page (`/methodology`), `llms.txt` and the calculator copy say it does? And is what it does the right way to model a plug-in panel on an NYC balcony? This document answers both, ranks what it found, and proposes what to change. The companion document `docs/modeling-decisions.md` records, for every modelling choice, the alternatives and why the current choice stands or should change.

The audit was run as seven parallel reviews (documentation conformance, PVWatts parameters against the live API, shading physics with Node experiments on the shipped model, financial and environmental fact-checking against primary sources, sun-position accuracy against a full NOAA reference, calculator wiring and copy, and self-consumption economics). The lead reviewer independently re-verified every High-severity finding; section 6 says which.

---

## 1. Headline findings

Ranked by consequence for the number a visitor sees.

1. **Production is running on the fallback formula, not PVWatts.** NREL was renamed the National Laboratory of the Rockies, and the `nrel.gov` domain is no longer delegated in the `.gov` zone (confirmed via Google and Cloudflare public resolvers and from this environment). `developer.nrel.gov` does not resolve; the same API answers at `developer.nlr.gov` (PVWatts v8.5.0, Solar Resource v1.1.0). Every estimate therefore fails three PVWatts fetches and falls to the client-side formula. The breakdown modal does show the "PVWatts was unreachable" notice, but the loading overlay still says "Simulating 8,760 hours", the hero headline and result card carry no qualifier, and the accuracy claim (about 15% with PVWatts and the 3D model) does not describe what is shipping. **Fix: change two hostnames in `js/config.js`** (done on this branch, see section 7).
2. **The fallback formula is biased in ways that matter now that it is the only model.** Measured against 32 live PVWatts runs for NYC: vertical panels are under-estimated by 12% (tilt factor 0.60 vs PVWatts 0.650), a 35° south-facing panel by 5%, and the separable tilt × azimuth product fails badly off-south (a 35° north-facing panel is under-estimated by 35%, a 70° north-facing one over-estimated by 25%). The fallback also applies a second 5% soiling derate although the 1,300 kWh/kW baseline already matches PVWatts with the soiling array included. Its monthly shape is a global-horizontal curve: a vertical south panel actually produces 11.4% of its year in January and 4.9% in June, the fallback says 5.6% and 11.2%. A 4 × 8 PVWatts lookup table with 32 monthly shapes (appendix A) reproduces PVWatts exactly and should replace the factor tables.
3. **The neighbour query silently drops the tall buildings that shade.** Socrata's `within_circle` on polygon geometry is a containment test. Verified live: 200 m around Midtown returns 97 footprints by `within_circle` and 131 by `intersects`; 51 vs 76 buildings over 100 ft; the Empire State Building is not returned from 150 m away with a 200 m radius, and is returned by `intersects`. The same semantics make the BIN-less target lookup (`within_circle` 50 m, `$limit 1`) return nothing for any building larger than the circle. One-line fix.
4. **A failed or empty neighbour query yields a fully open sky with no notice.** `runBuildingLookup` fires the neighbour request in the background and `onPlaceSelected` immediately issues it a second time (a duplicate request on every address). If it fails, `SolarState.neighborBuildings` stays `null`, the scene is built with `[]`, the horizon is empty, the shade factor is 1.00, `shadeFactorFrom3D` is true and the banner stays hidden. The methodology promises "static shade factor used, notice shown". A first-floor north balcony scores 1.00 where the static band gives 0.68 and a real 3D canyon gives 0.11.
5. **The balcony point is one storey too high.** `floor / totalFloors × height` places a top-floor panel at the roofline, where the model sees no obstruction at all (1.00 vs 0.90 to 0.95 corrected). On an 18 m side street the corrected placement lowers factors by 0.04 to 0.10 (5 to 10% of output) at every floor. In the click path a second, opposite error hides it (a click at the true balcony height derives floor f − 1, so the modelled height is roughly right and the floor label is wrong); the manual path carries the full bias.
6. **The shade sweep's irradiance weighting misallocates energy.** `0.6 × sin(alt)^0.75` is used as if it were direct-normal irradiance, so sky diffuse becomes 45% of a vertical panel's assumed plane-of-array irradiance (measured 30% from both PVGIS and PVWatts hourly data) and beam below 25° altitude is under-weighted about 1.8×, which is exactly the light that buildings block. Against a full-year hourly NSRDB reference run through the same horizon profile, shipped factors are optimistic by 0.03 to 0.05 on side-street floors 1 to 4, by 0.06 to 0.08 (30 to 35% relative) in a 30 m avenue canyon, and pessimistic by 0.045 when shading is confined to low sun. Monthly factors err by up to 0.25.
7. **Savings assume 100% self-consumption.** The methodology's "production is well below consumption so there is no excess export" conflates annual totals with instantaneous power. The SUNNY Act makes exports uncompensated unless the owner voluntarily net-meters. [Quantified in section 4.4 once the self-consumption simulation reports.]
8. **Several public constants are mis-sourced or stale.** The CO2 factor 0.89 lb/kWh is eGRID2022 (885.2 lb/MWh), not eGRID2023 as labelled (864.5 average, 976.9 non-baseload; verified in EPA's Rev 2 tables). The degradation citation `fy24osti/87524.pdf` is a community-solar report, not a degradation review (verified from the PDF title page; the intended references are NREL/TP-5K00-88769 and Jordan et al. 2022). The "48 lb CO2 per tree" figure is Arbor Day/USDA, not EPA (EPA: 0.060 t per urban tree-year, about 133 lb). The vehicle factor description ("0.906 lbs/mile rounded" to 0.89) is wrong on both ends (EPA: 0.866 to 0.882 lb/mile), and because 0.89 equals the CO2 factor, "miles not driven" always equals annual kWh. Con Ed's SC-1 customer charge is $21.00 from 1 February 2026, not $20. "56% above the U.S. average" is New York State vs US; Con Ed at 34¢ is roughly double the 2025 US average of 17.3¢.
9. **Kit anchors do not hold for New York.** Bright Saver's prices are verified but it cannot ship to New York (the SUNNY Act requires listing as a complete plug-in system, which no kit has yet). Craftstrom's 800 W kit lists at $2,031 to $2,229, not $1,327 to $1,600. EcoFlow PowerStream and Anker SOLIX RS40P are EU products; the US EcoFlow STREAM is Utah-only. The mid-tier $1,200 is still plausible as a forward estimate but the named anchors are not.
10. **Documented behaviour that is not implemented.** The "hours of direct sun" figure (methodology §2.1) is computed by `ShadowModel.directSunHours` but never displayed; the building info panel that would show it, along with the derived floor and facing, is hidden by `#bldgInfoPanel { display: none !important; }`. The manual entry panel is described as the keyboard route to a result but only opens when the 3D path fails. Geocoding failures are console-only.
11. **The public formulas omit the railing factor.** §1.2 and §2.4 state the fallback and final-energy formulas without the 0.95 (at 90°) railing derate that the code applies on every path, and §2.4 says the shade factor is the only post-PVWatts multiplier. Every default-mount number is 5% below the documented formula, and the §9 anchor ("~625 kWh unshaded vertical south, reproduced within ±5%") is false: the shipped fallback gives 563 kWh (−9.9%).
12. **Visitors log their home address.** Every completed estimate inserts the formatted address, full-precision coordinates, floor and facing into Supabase with no disclosure on the page. Address plus floor plus facing identifies a dwelling. The insert-only grant is written correctly in the 31 August migration, but that migration's header records the live project had no `estimates` table at the time, so live permissions should be verified.

Lower-severity findings are in sections 2 to 4. Overall: the public page is a faithful description of the code in most of its claims (about 85% of 140 extracted claims match), the shade model's structure (horizon profile, isotropic sky-view integral, tilt-aware incidence) is the same pattern PVsyst, SAM and pvlib use, and the regression suite pins the right invariants. The problems are concentrated in the data pipeline, the irradiance weighting, the fallback tables, and the financial model's self-consumption assumption.

---

## 2. Code versus stated methodology

Method: every concrete claim in `methodology.html`, `llms.txt`, `README-api-keys.md` and the calculator copy (FAQ, JSON-LD, modal, banners) was extracted and checked against the code, with numeric claims recomputed by running the shipped modules through `tests/harness.js`. Verdicts: MATCHES, MISMATCH, PARTIAL, NOT IMPLEMENTED, UNDOCUMENTED.

### 2.1 High severity (a user-visible number or promise is wrong)

| ID | Claim (where) | What the code does | Verdict |
|---|---|---|---|
| M1 | §1.2 fallback formula; §2.4 "the shade factor is the only post-PVWatts multiplier" | `calculateEstimate` multiplies both paths by `RAILING_OBSTRUCTION_BY_TILT[tilt]` (0.95 at 90°), `js/solar-api.js:791,801,806,827` | MISMATCH |
| M2 | §9 anchor: fallback reproduces ~625 kWh unshaded vertical south "within ±5%" | 1300 × 0.8 × 0.60 × 1.00 × 0.95 × 0.95 = 563.2 kWh (−9.9%); 592.8 without railing (−5.2%); 624 only with both soiling and railing removed | MISMATCH |
| M3 | §7.6 / §2.3 "neighbour query fails → static shade factor, notice shown" | Scene built with `[]` neighbours, shade factor 1.00, banner suppressed (`index.html:1465-1467, 1632, 1965, 1980`) | MISMATCH |
| M4 | §2.1 "hours of direct sun in the info panel derive from the same horizon profile" | `directSunHours` has no caller outside tests; the panel is force-hidden (`index.html:222`) and its shadow label uses the ×1.8 display score | NOT IMPLEMENTED |
| M5 | §7.6 "manual entry panel is the keyboard- and screen-reader-accessible route" | Opened only when footprints or WebGL are missing (`index.html:1503-1509`); with a working scene, keyboard users get an unlabelled canvas | PARTIAL |
| M6 | §7.6 row 1: "manual entry panel if geocoding also fails" | Geocoder missing, geocode failure and out-of-NYC all end in `console.warn` and a refocused input (`index.html:1397-1447`) | NOT IMPLEMENTED |
| M7 | §1 / FAQ / JSON-LD / overlay: "8,760-hour PVWatts simulation" | True only when PVWatts answers; today it never does (headline finding 1); the overlay text is unconditional | PARTIAL |

### 2.2 Medium severity (misleading or incomplete)

| ID | Claim | Finding |
|---|---|---|
| M8 | §7.6 "every degraded path tells the visitor" | The banner covers two conditions (no PVWatts, no 3D). Silent: soiling folded into losses, PLUTO floors missing (default 20), footprint chosen by 50 m proximity, 500-row neighbour truncation, zero neighbours, hardcoded monthly curve when Solar Resource fails. The banner lives only inside the modal; the card and personalised H1 carry no qualifier. `result.dataSources` is logged but never rendered. |
| M9 | §1.2 / §9: 1,300 kWh/kW is "the PVWatts reference" | `config.js:90-92` documents it as a midpoint between NYSERDA's 1,238 and the calculator's earlier 1,400. It happens to be right (PVWatts gives 1,295 at tilt 35 with the soiling array), but the provenance stated is not the real one. |
| M10 | §7.2(d) neighbour query "background, non-blocking" | Fired in the background, then re-issued and awaited (duplicate request; the UI blocks on it). |
| M11 | §7.3 pre-fill: "year built, building class" in the info card; "direction picker ← orientation algorithm" | Year built and class are fetched and never rendered. The direction pre-fill exists only in the manual panel; in the 3D view the direction comes from the wall clicked, snapped to 45°. |
| M12 | §7.4 "Surrounding shading" listed as an input | Ignored whenever a 3D shade profile exists (`solar-api.js:765-767`), yet the control stays active and its value is logged. |
| M13 | §1.1 "the variant that succeeded is recorded on the result" | Recorded on `SolarState.pvwattsVariant` only; absent from the result object, never shown or logged. |
| M14 | JSON-LD `dateModified` 2026-05-17 vs `article:modified_time` and visible date 2026-08-31 | Three dates on one page; the file last changed 2026-09-01. |
| M15 | §6 miles: "EPA 2024 average passenger-car emission rate (0.906 lbs/mile rounded)" to 0.89 | 0.906 does not round to 0.89; EPA's figure is 0.866 to 0.882; the constant equals `CO2_FACTOR`, so miles == kWh. |
| M16 | §6 trees "EPA's averaged-across-all-trees figure" of 48 lb/yr | EPA uses 0.060 t CO2 per urban tree-year (about 133 lb); 48 lb is Arbor Day Foundation / USDA. |
| M17 | Undocumented: Supabase estimate logging of address, lat/lon, inputs and results (`index.html:1353-1372`) | Not mentioned in the methodology or on the page. |
| M18 | README: Google "$200/month free credit"; `js/config.js.example` carries 0.22/1.03/0.65/1400 and says config.js is gitignored | Stale on both counts (Google moved to per-SKU free tiers in March 2025; config.js is committed by design). |
| M19 | llms.txt "400 to 900 kWh per year" for 800 W | Vertical mounts on the static grid span 87 to 544 kWh (563 unshaded, 673 with PVWatts); 900 needs a tilted mount. |
| M20 | FAQ / JSON-LD "3×" high-floor-south vs low-floor-north | The model gives 3.1× for orientation alone, 4.3 to 6.2× for the stated comparison on the fallback path, and about 27× in a 3D canyon. Understated rather than wrong. |
| M21 | FAQ "56% above the U.S. average" | Unsourced; implies a 21.8¢ base. EIA 2025 US residential average is 17.3¢, so Con Ed is about 97% above (87% above the 2026 year-to-date 18.2¢). |

### 2.3 Low severity (wording, arithmetic, links)

- §1.1 losses decomposition sums to 14% additively but compounds to 13.2%, and includes "snow 1%" while §9 says snow is not captured.
- §1.1 "35° ≈ optimal" vs the baseline defined at "~40°" in the same section and in `config.js`.
- §4.4 degradation "90.5% / 88.7% / 84.3% at year 25": exponent 24 gives 90.8 / 88.7 / 84.5, exponent 25 gives 90.5 / 88.2 / 83.9; the three figures mix conventions.
- §5 "DOY 67 to 304 (Mar 8 to Nov 1)": 304 is 31 October; DST ends 1 November (DOY 305). The code is right, the prose is off by a day. And because only the 15th of each month is ever evaluated, the day-of-year rule is equivalent to a month rule.
- §2.1 "the nearest sampled point in a direction wins": the highest obstruction altitude wins (`3d-shadow-model.js:353-355`).
- §2.1 annual weights "the same array used in §1.2": a separate hard-coded copy of the same values; the location-specific Solar Resource distribution is never used here.
- §2.2 "mobile path": there is no mobile-specific path; mobile runs the same pipeline full-screen.
- §7.6 "Sliders keep defaults": there are no sliders; total floors defaults to 20.
- Footprints dataset linked as `nqwf-w8eh` in five places; the code queries `5zhs-2jue` (the README has the right one).
- Six `nrel.gov` document links are dead (domain rename); the same documents are served from `docs.nlr.gov`.
- JSON-LD `browserRequirements: "Requires JavaScript and WebGL"` contradicts the manual path.
- "from an 400W balcony system" grammar; monthly chart has no unit; the payback bar shows an integer where the timeline shows one decimal.

### 2.4 Behaviour the code has that the docs never mention

Estimate logging (M17); `null` (failed) and `[]` (empty) neighbour results treated alike; 10 s fetch timeout with one retry on HTTP 429; PLUTO `$limit 5` and first-row selection, and a `LIKE '%street%'` fallback on the first comma-separated address segment; footprint fallback by `within_circle(…, 50)` with `$limit 1` and no ordering; MultiPolygon first ring only (both `solar-api.js` and `3d-scene.js`); borough default `'manhattan'` when neither sublocality nor ZIP resolves; unknown-input defaults (tilt factor 0.60, azimuth 0.72, railing 0.97, shading 'some'); balcony point at `floor/N × height`, 2 m outside the facade midpoint, with the target's own footprint excluded from the horizon; building height defaults of 60 ft (target, `index.html`) vs 40 ft (neighbours and `ShadowModel.init`); click → `floor = round(ratio × N)` and azimuth snapped to 45° before it reaches both the shade model and PVWatts (neither needs snapping; a 209° Manhattan-grid facade becomes 225°); the 3D profile is recomputed only when tilt changes (floor and azimuth cannot change in the Customize panel); uninitialised `ShadowModel` returns a flat 0.80; `capacityFactor` is computed and never displayed; `npvPayback` survives as an alias; the reveal animation is fixed to June and the slider tops out at 19:30 while June sunset is 20:21; typed bills are not clamped to the documented $20 to $800; `api/geoclient.js` allows any origin with no rate limit; `api/visualize-v3.js` is deployed but unwired.

### 2.5 Exact documentation edits proposed

These are wording fixes for `methodology.html` that make the page true of the code as it stands. Where a code change is recommended instead, it is marked.

- **§1.2 formula:** append `× railing_factor` and a bullet: "railing_factor: the tilt-dependent railing derate from §2.1 (0.95 / 0.97 / 0.98 / 0.99), applied on both paths."
- **§2.4:** `final_kwh = pvwatts_ac_annual × shade_factor × railing_factor` and `Σ(ac_monthly[i] × monthly_shade[i]) × railing_factor`; replace "the only post-PVWatts multiplier" with "the shade factor and the tilt-dependent railing factor are the only post-PVWatts multipliers."
- **§9 anchor:** "The fallback's pre-derate yield (1,300 × 0.8 × 0.60 = 624 kWh) is within 1% of this anchor; after the 0.95 soiling and 0.95 railing derates the shipped fallback returns about 563 kWh, roughly 10% below, as expected for a clean, unobstructed module." (Or, better, adopt the PVWatts table in appendix A and re-anchor at 673 kWh.)
- **§2.1 direct sun hours:** either wire `directSunHours` into a visible panel (code) or state that it is computed and tested but not currently displayed.
- **§7.6 rows:** neighbour failure (state the true behaviour, or fix the code); geocode failure ("the address field is re-focused and no estimate is produced"); the accessibility sentence ("when the 3D path is unavailable, the manual entry panel is the keyboard route; when the scene loads, balcony selection currently requires a pointer").
- **§7.6 lead sentence:** "Two degraded paths are announced above the breakdown: PVWatts unreachable and no 3D shade profile. Other substitutions are currently silent." (Or extend the banner, code.)
- **§7.3:** "Direction picker (manual entry panel) ← orientation algorithm; in the 3D view the direction comes from the wall you click, snapped to 45°" and drop "year built, building class".
- **§7.2(d):** "Fired in the background during the lookup; the page then waits for it before opening the 3D scene."
- **§1.2 / §9 baseline:** "1,300 kWh/kW/yr, chosen midway between NYSERDA's 1,238 and the calculator's earlier 1,400; PVWatts V8 with the calculator's parameters gives 1,295 at tilt 35."
- **§6:** trees "48 lb per mature tree per year (Arbor Day Foundation / USDA); EPA's urban-tree figure is about 133 lb"; vehicles "EPA's typical passenger vehicle emits about 400 g CO2 per mile (0.88 lb); we use 0.89" (or change the code to 0.88); phones "EPA now uses 19 Wh per charge (2024); we use 12 Wh".
- **§6 CO2:** "0.89 lb/kWh is the eGRID2022 NYCW output emission rate (885.2 lb/MWh). eGRID2023 (released 2025) gives 864.5 average and 976.9 non-baseload." (Or update the constant, code and `tests/model.test.js:201`.)
- **§4.1:** replace both 404 URLs (Con Ed historical rates now under `save-energy-money/using-private-generation/`; DPS supplement dated 23 January 2026); add "at 300 kWh/month"; note the summer block (first 250 kWh $0.16402, above $0.18858 delivery, June to September) and the $21.00 customer charge from 1 February 2026.
- **§4.4:** cite NREL/TP-5K00-88769 (Deline et al. 2024) and Jordan et al. 2022 (NREL/CP-5K00-81314) instead of 87524; state median fleet degradation 0.5 to 0.75%/yr and module-level 0.35 to 0.55%/yr.
- **§4.5:** Bright Saver cannot ship to New York until a whole-system listing exists; Craftstrom 800 W is $2,031 to $2,229; replace the EU product names with US ones (EcoFlow STREAM $369 inverter, Utah-only; APsystems EZ1 $325 with UL 3700 listing).
- **§4.6:** add "exported energy earns nothing under the Act unless the owner voluntarily enters a net-metering agreement" and "a device must be listed by a nationally recognised testing laboratory as a complete plug-in photovoltaic system; no kit had that listing as of September 2026."
- **§5:** "DOY 67 to 304 inclusive (8 March to 31 October in 2026; DST ends 1 November)".
- **Dates:** make JSON-LD `dateModified`, `article:modified_time` and the visible date identical.
- **Links:** `nqwf-w8eh` → `5zhs-2jue`; `nrel.gov/docs/…` → `docs.nlr.gov/docs/…`; `developer.nrel.gov` → `developer.nlr.gov`.
- **New §7.7 "Estimate logging":** one paragraph describing what is logged and why, plus a privacy note on the page.
- **`llms.txt`:** "roughly 150 to 600 kWh per year for a vertical railing mount depending on floor, direction and shading; a 35° tilted mount can reach about 950 kWh"; "roughly double the U.S. average".

---

## 3. Methodology versus best practice

### 3.1 Energy engine and PVWatts parameters

Method: 57 live PVWatts V8 calls (via `developer.nlr.gov`, using the repo's public key; raw responses were archived) at 40.7128 N, 73.9960 W with the app's exact parameters, plus two hourly runs, one Solar Resource call, three PVGIS v5.3 cross-checks, and a reading of the V8 documentation and the `pvwattsv8` source.

**What is right.** The 1,300 kWh/kW baseline (PVWatts: 1,295 at tilt 35, 1,286 at tilt 40, with the soiling array). `module_type 1` (V8 "Premium" is 21% STC, −0.35 %/°C; the "19%" in the methodology is V5 text, and the choice changes output by under 1%). `inv_eff 96.5`. `dc_ac_ratio 1.1` for matched kits (1.0 / 1.1 / 1.2 differ by 0.1%; a vertical panel spends 16 h/yr at the inverter cap). `dataset nsrdb` (PSM V3 TMY 2020, 4 km cell 2.3 km from the point; TMY3 differs by −1.5%). The 0.60 / 0.40 beam / diffuse split as a description of NYC global horizontal irradiance (NSRDB: 61.5% beam).

**What is wrong or double-counted.**

| Parameter | Current | Finding | Recommended | Effect (vertical south) |
|---|---|---|---|---|
| API host | `developer.nrel.gov` | No DNS | `developer.nlr.gov` | restores PVWatts (+13% vs fallback for vertical S; +55% for tilt 35 north) |
| `losses` | 14 | The 14.08% PVWatts default already contains 2% soiling and 3% far-horizon shading; the app adds a soiling array and a shade factor on top. The app's own stated decomposition compounds to 13.2%. For a 1 to 2 module microinverter kit, mismatch and wiring are far below rooftop-string values. | 9 (mismatch 0.5, wiring 1, connections 0.5, LID 1.5, nameplate 1, availability 3, snow 1 ≈ 8.2%) | +5.8% |
| `soiling` | 3 to 7%/month (4.7% energy-weighted) | Vertical panels soil far less (0.05 %/day at 90° vs 1.21 at 0° in field studies); the Northeast is rain-cleaned (<1 to 2%/yr). The cited NREL soiling reference is a dead link and could not be identified. | tilt 90: `1\|1\|2\|3\|3\|2\|2\|2\|2\|1\|1\|1`; tilt 35 to 70: `2\|2\|3\|4\|4\|3\|3\|3\|3\|2\|2\|2` | +3.0% |
| soiling encoding | pipe → bracket → losses 18.3 | Bracketed and scalar forms return HTTP 422, so the second variant can never succeed; `losses 18.3` reproduces the array within −0.4% | drop the bracket variant | one fewer wasted request |
| `array_type` / `gcr` | 0, gcr default 0.4 | Open rack applies row-to-row self-shading for a multi-row field two modules high to a single panel | `array_type 0` with `gcr 0.01` (or `array_type 1` if flush on a wall: NOCT 49 °C, −0.5%) | +2.0% |
| `albedo` | 0.20 | Ignored: V8 defaults `use_wf_albedo=1` and uses NSRDB albedo (mean 0.128, up to 0.87 with snow). 0.20 and 0.30 give byte-identical output. With `use_wf_albedo=0`, 0.20 is +4.7% and 0.30 is +10.2%. | keep the weather-file albedo, make `use_wf_albedo=1` explicit, fix the methodology | 0% |
| `bifaciality` | 0 | PVWatts 0.7 gives +14.3% because its rear model sees half the sky behind a free-standing row; a wall-backed railing panel does not (field: 3 to 5%) | keep 0; optional post-hoc +3 to 5% for bifacial kits | 0% |
| `dc_ac_ratio` | 1.1 constant | Irrelevant for matched kits, but the UI allows 400 to 1,600 W against real 800 W AC inverters (SUNNY Act cap 1,200 W): a 1.6 kW array on 800 W AC clips 7.9% (vertical) to 12.8% (tilt 35) | `max(1.0, systemWatts / inverterWattsAC)` with 800 W default | 0% matched; avoids 8 to 13% missed clipping |
| fallback tables | separable tilt × azimuth | Mean absolute error 9.2%, RMS 11.9%, worst −35%; the best possible separable fit still has 27% worst-case error | 4 × 8 PVWatts table (appendix A) | worst error 35% → 0% |
| fallback monthly shape | GHI curve | Inverted for vertical panels (June −6.3 pp, JJA/DJF 0.53 vs 1.88) | per-orientation 32 × 12 shapes (appendix A) | correct seasonality |
| fallback soiling | × 0.95 | Double-applied: the 1,300 baseline already includes the soiling array | drop | +5.3% |
| Solar Resource normalisation | daily means summed | Not weighted by days in month (February +8.8%) | day-weight | small |

Combined first-order effect of the physics changes (gcr, losses 9, vertical soiling): ×1.11, vertical south 841 → about 935 kWh/kW. Cross-check: PVGIS v5.3 (ERA5) gives 970 kWh/kW vertical south with 14% losses and no soiling; PVWatts without soiling gives 883.

**Shade-sweep irradiance split.** PVWatts hourly output puts vertical-south plane-of-array irradiance at 62.7% beam / 29.9% sky diffuse / 7.6% ground-reflected (66.6 / 32.6 / 0.9 at tilt 35). The app's `0.6 × sin^0.75` proxy implies 54.7% beam for a vertical panel, 8 points low, and no ground component. 12.8% of vertical-south AC energy is produced below 200 W/m², where the CEC module model's low-light behaviour matters; that is another reason to weight the sweep with hourly TMY data rather than a clear-sky proxy.

### 3.2 Shading

Method: the shipped `ShadowModel` was driven in Node through `tests/harness.js` on synthetic and canonical NYC geometries (avenue canyon 30 m wide with 60 to 100 m opposite rows; side street 18 m with 20 to 24 m walk-ups; rowhouse street 18 m with 12 m houses; open waterfront), compared against a full-year hourly reference built from PVWatts and PVGIS hourly data run through the same horizon profile, and against live Socrata queries.

**Structure is sound.** Horizon profile for beam on/off, isotropic sky-view integral for diffuse, tilt-aware incidence: this is the PVsyst far-shading and pvlib pattern, better than HTW Berlin's fixed 25/35/45° cutoff and better than PVWatts (no near shading at all, a 3% default). The view-factor kernel `cos θ · cos(alt) dalt daz` is exact (reproduces π(1 + cos β)/2 to four decimals). Coordinate projection error is 0.5 m at 200 m. Only 3 of 1,083,026 footprints lack `height_roof`. Anisotropic (Perez) sky would change factors by at most 0.03; keeping isotropic is the right call.

**What departs from practice, with size.**

| Item | Finding | Recommended change | Effect |
|---|---|---|---|
| Neighbour query semantics | `within_circle` = containment; drops large footprints at the boundary (Midtown: 97 vs 131 features, 51 vs 76 over 100 ft; Park Slope 313 vs 390); BIN-less target fallback returns nothing for large buildings | `intersects(the_geom, <32-gon circle WKT>)`; `intersects(the_geom, 'POINT(lon lat)')` for the target; check `features.length` against `$limit` | recovers 25 to 46% of features and about 30% of tall buildings near the boundary |
| Radius 200 m, `$limit 500` | A 100 m tower at 250 m costs 3.6% annual; a 250 m tower at 400 m costs 4.2%; both outside the circle. Half of a south panel's winter beam arrives below 25° altitude (east/west: below 20°). The 200 m circle holds 549 footprints in Woodhaven, 449 in East Flatbush, 428 in Middle Village (limit 500, truncation silent and unordered). | two-tier: everything within 200 m by intersection, plus `height_roof > 150` within 800 m (and `> 300` within 1,500 m); higher `$limit` (Socrata allows 50,000) | 0 to −0.10 near towers; no silent truncation |
| Balcony placement | `floor/N × H` at the facade midpoint (top floor at the roofline); click floor = `round(ratio × N)` | `storey = clamp(H/N, 2.7, 4.5)`; `floor = floor(clickY/storey) + 1`; `y = (floor − 1) × storey + 0.6 m`; place at the click position along the facade | −0.02 to −0.10 (manual path); correct floor label (click path) |
| Irradiance weighting | `0.6 × sin^0.75` as DNI; fixed 60/40 | table of NYC monthly × hourly mean DNI and DHI (or PVWatts hourly `dn`/`df` when available); `beam = DNI × cos θ` | ±0.05 annual, up to 0.25 monthly |
| Ground-reflected | derated at the beam+sky blend rate | per-component: beam × visible, sky × skyOpen, reflected (`0.2 × GHI × (1 − cos β)/2`) × street-level openness from the same profile at y = 1 m | +0.02 (south) to +0.06 (north); gives deep canyons a physical winter floor |
| Balcony slab above | not modelled; the 0.95 railing factor is a stand-in for the railing only | mount-type question (hangs outside the railing / stands on the floor / wall-mounted) → slab edge depth d ∈ {0, 0.5, 1.5} m as a per-bin upper altitude limit | vertical: 0 / −7 / −15 / −26% at d = 0 / 0.8 / 1.2 / 1.8 m (May to August up to −45%); a 35° top-mount loses 14% even at d ≈ 0 |
| Own facade | target excluded from the horizon | add the target's non-balcony edges when tilt < 90° | −5 to −8% at 35°, −1 to −2% at 60° |
| Temporal sampling | 12 representative days × 10 min, annual weighted by a GHI curve | energy-weighted annual (Σ received / Σ assumed); two days per month | annual error ≤0.005 already; monthly error 0.115 → about 0.05; GHI weights bias annual +0.01 to +0.02 for vertical panels |
| Clamp | [0.10, 1.00] | 0.02 floor once ground-reflected is modelled | deep-canyon winter 0.10 → 0.02 to 0.03 |
| Sky-openness grid | azimuth stepped 2° over 1° bins, odd bins never read | step 1° | ≤0.01 |
| Static fallback bands | 0.2 to 0.5 too optimistic in avenue canyons (3D 0.19 / 0.25 / 0.34 vs "wide avenue" 0.73 / 0.78 / 0.85 for floors 2 / 6 / 10 of 20); 0.1 too pessimistic for open waterfront (3D 0.98 vs 0.86 to 0.97); fine for rowhouse ("some" ±0.03) and low side-street floors ("dense" ±0.06); orientation-blind (north and east differ from south by up to 0.16) | run the real horizon model headless whenever footprints exist (the physics needs only footprints and heights, not WebGL; about 40 to 60 lines); recalibrate the bands as an implied canyon → horizon angle → convex curve with orientation multipliers for the no-footprint case | 0.1 to 0.5 in canyons |
| Trees | not modelled | Forestry Tree Points (`hn5i-inap`: location, DBH, `tpstructure='Full'`) with DBH allometry (crown top ≈ min(22, 4 + 0.55 × DBH_in) m) and seasonal transmittance 0.2 in leaf / 0.6 bare as a 2D sky mask | a 12 m street tree in front cuts side-street floors 1 to 3 from 0.53 to 0.28 and floor 4 from 0.72 to 0.37 |
| Setback towers | `height_roof` is the footprint maximum, so podium-and-tower lots are extruded to tower height across the lot | flag results with a neighbour taller than 3× the local median | up to 20 to 40° of horizon on affected bins, pessimistic |
| Partial shading | point-and-plane, linear | keep linear; document 1 to 3% optimism from bypass-diode behaviour during shadow-edge transitions | text |

Canonical results (vertical panel, corrected model) for calibration: avenue canyon 30 m / 60 m opposite, 20 floors: south 0.19 (floor 2), 0.34 (10), 0.56 (15), 0.90 (20); side street 18 m / 24 m, 6 floors: south 0.45 (1), 0.56 (3), 0.70 (5), 0.84 (6); rowhouse 18 m / 12 m: 0.70 (1), 0.90 (3), 0.95 (4); open waterfront 0.98 south, 0.95 east, 0.86 north.

### 3.3 Sun position and temporal sampling

[Pending: to be completed from the sun-position audit. The shipped algorithm passes the regression suite (June and December noon in the south, peak altitudes within 1.5°, day lengths within tolerance). The shading review found that the twelve representative days give an annual error under 0.005 and monthly errors up to 0.115, and that 10-minute steps are adequate (≤0.017 vs 1-minute).]

### 3.4 Financial model

Method: primary sources (Con Ed tariff leaves and historical rate PDF, PSC rate-case materials, EIA tables, IRS and CRS on §25D, bill text of S8512/A9111, vendor pages), plus comparison with how Project Sunroof, SAM, EnergySage and HTW Berlin report savings.

**Verified.** The 2025 NYC SC-1 average of 33.83¢/kWh (Con Ed's own table, which excludes the customer charge and is grossed up for GRT and sales tax, at 300 kWh/month). The PSC approval on 22 January 2026 of +3.5% / +3.2% / +3.1% for 2026 to 2028. §25D ended for expenditures after 31 December 2025 (P.L. 119-21 §70506). Escalation presets of 2 / 3 / 4% bracket the long-run record (US 1990 to 2025: 2.3%/yr; 2015 to 2025: 3.2%; NY 2004 to 2024: 2.6%; Con Ed 2023 to 2025: 7.1%). The SUNNY Act passed the Senate 62-0 on 21 April 2026 and the Assembly on 28 May 2026 (Senate concurrence 59-1); as of 2 September 2026 it had not been delivered to the Governor; it takes effect 90 days after becoming law; cap 1,200 W AC; it grants no right to install.

**Contradicted or stale.** Customer charge $21.00 from 1 February 2026 (not $20). "56% above the US average" (see M21). Kit anchors (headline finding 9). The 34¢ rate is slightly low for 2026 (Con Ed projected +5.7% for summer 2026 on supply; statewide residential prices were +12.7% year-on-year in the first half of 2026): 35¢ is the better central value, and the summer delivery block above 250 kWh adds about 2.5¢ to the marginal rate for larger users in June to September.

**Not modelled, and material.**

- **Self-consumption.** [Pending quantification from the self-consumption audit; see section 4.4.] The Act makes exports uncompensated unless the owner voluntarily enters a net-metering agreement, so every kWh exported is worth zero. Con Ed AMI meters register delivered and received energy on separate channels, so exports are not billed as consumption, but they are not credited either.
- **Inverter replacement.** Plug-in kit inverters carry 10 to 12 year warranties (Hoymiles HiFlow Pro 12, APsystems EZ1 12, EcoFlow STREAM 10, Craftstrom 10); only Enphase IQ8 and APsystems DS3/QT2 carry 25 years, and they are not plug-in products. HTW Berlin replaces the inverter at year 15 and uses a 15-year horizon (20 maximum); Project Sunroof uses 20 years. A 25-year total with no replacement is optimistic.
- **Discounting.** Nominal, undiscounted 25-year totals are disclosed as such (good). Project Sunroof uses a 4% discount rate and 2.2% escalation over 20 years; SAM uses 2.5% inflation and a real discount rate; HTW uses constant prices. At 3% escalation the year-25 price is double today's and the nominal total is about 40% above a today's-dollars total. Recommend keeping the nominal headline but adding a today's-dollars figure.
- **Degradation.** Tiers of 0.4 / 0.5 / 0.7%/yr are defensible for modules (NREL module medians 0.35 to 0.55%/yr) but optimistic for systems (fleet median 0.5 to 0.75%/yr; Jordan 2022 median 0.75, P90 1.9). Cite the right papers; consider 0.4 / 0.6 / 0.9.
- **Consumption default.** $140/month implies about 350 kWh; Con Ed's NYC typical is 280 kWh ($112.75 in 2025). $140 is the New York statewide average bill (EIA 2024: 571 kWh, $139.53). Either lower the default to about $115 or state the assumption.
- **Sales tax.** Kit prices are quoted pre-tax; NYC sales tax is 8.875%. [Pending confirmation of whether solar equipment is exempt in NY.]

### 3.5 Environmental model

- **CO2 factor.** 0.89 lb/kWh is eGRID2022 NYCW (885.2 lb/MWh). eGRID2023 Rev 2 (June 2025, current; eGRID2024 not yet released): 864.5 average, 976.9 non-baseload. NYCW is 98.2% gas, so the two methods differ by only 13%. EPA's own equivalencies calculator uses the non-baseload rate for "electricity reductions"; DOE's Building Technologies Office recommends long-run marginal rates (Cambium) for measure impacts; recent work (Bistline and Watten, Nature Climate Change, November 2025) shows average-factor approaches overstate rooftop solar benefits increasingly over time. Recommendation: label the figure as year-one avoided emissions at 0.98 (EPA avoided-emissions method) or 0.86 (average), and never multiply a constant factor over 25 years.
- **Equivalencies.** Trees: 48 lb is Arbor Day/USDA, EPA is about 133 lb per urban tree-year. Vehicles: EPA 0.866 (calculator) to 0.882 (typical-vehicle page) lb/mile; the app's 0.89 makes miles equal kWh. Phones: EPA moved to 19 Wh per charge in October 2024; the app uses 12 Wh.

### 3.6 Data pipeline and site geometry

Beyond the Socrata semantics (3.2): PLUTO `numfloors` is truncated by `parseInt` (2.5 → 2) and "0" or missing falls to a 20-floor default with no notice; the target height defaults to 60 ft while neighbours default to 40 ft; the manual panel is pre-filled with 20 floors and floor 10 with no hint that they are defaults; the orientation detection is correct (cos-latitude projection, confidence rule) and well tested; the borough ZIP atlas is correct. `height_roof` is the footprint's maximum height and includes bulkheads, which inflates storey height on small buildings; the DoITT 3D building model has setbacks but is not a queryable API.

### 3.7 Communicating uncertainty

The "about ±15% / ±20%" band is labelled as modelled rather than measured, which is honest. But it cannot be supported today: production is on the fallback path (headline 1), and even with PVWatts restored the audit found systematic biases (balcony placement 5 to 10%, irradiance weighting 3 to 8 points of shade factor in canyons, dropped neighbours, 100% self-consumption in the savings figure) that are not random and not within ±15%. Recommendation: replace the single band with a short uncertainty budget (weather year ±5 to 8%; orientation snapping ±3%; shading geometry ±5 to 15% depending on density; kit losses ±3%; self-consumption for savings: the dominant term), and re-state it after the P1 fixes land. Field validation (metered kits after the Act takes effect) remains the only way to a measured band.

---

## 4. Recommendations, prioritised

Effort: S under a day, M a few days, L a week or more.

### P0: correctness and honesty, do now

| # | Change | Files | Effort | Effect |
|---|---|---|---|---|
| 1 | API host → `developer.nlr.gov` (both endpoints); fix `nrel.gov` document links | `js/config.js`, `js/config.js.example`, `README-api-keys.md`, `methodology.html` | S | restores the primary model. **Done on this branch.** |
| 2 | `intersects(...)` for the neighbour and target queries; detect `features.length === $limit` | `js/solar-api.js` | S | recovers the tall buildings that shade |
| 3 | Treat a failed neighbour query as degraded: static factor plus notice, per the methodology (and `null` vs `[]`) | `index.html` | S | removes silent 1.00 factors |
| 4 | Await the background neighbour promise instead of re-issuing the request | `js/solar-api.js`, `index.html` | S | halves Socrata load |
| 5 | Public-copy corrections listed in 2.5 (formulas, anchor, attributions, eGRID vintage, customer charge, kit anchors, "56%", dates, links, logging disclosure) | `methodology.html`, `index.html`, `llms.txt`, `README-api-keys.md`, `js/config.js.example` | S | page is true of the code |
| 6 | Show what the estimate used (PVWatts variant, 3D with N neighbours or static, PLUTO floors or default) on the card and in the modal; make the overlay text conditional | `index.html`, `js/solar-api.js` (return `pvwattsVariant`, `neighborCount`) | S | honest degradation |
| 7 | Privacy: one-line disclosure near the address field; log BBL/BIN or 3-decimal coordinates instead of the address; verify live table grants | `index.html`, `supabase/` | S | personal-data hygiene |

### P1: model accuracy, next

| # | Change | Effort | Effect |
|---|---|---|---|
| 8 | Self-consumption factor on savings (see 4.4) with a "someone home in the day" toggle and an optional battery | M | [pending: likely the largest single correction to savings and payback] |
| 9 | Replace the separable fallback with the 4 × 8 PVWatts table and 32 monthly shapes (appendix A); drop the extra 0.95 | S | fallback worst error 35% → 0%; correct vertical seasonality |
| 10 | Balcony placement: `(floor − 1) × storey + 0.6 m`, click floor from storey height, place at click position | S | −0.02 to −0.10 on the manual path; correct floor label |
| 11 | Sweep weights from a monthly × hourly NYC DNI/DHI table (or PVWatts hourly), beam = DNI × cos θ; per-component ground-reflected; energy-weighted annual; two days per month; 1° azimuth step; clamp 0.02 | M | ±0.05 annual, up to 0.25 monthly; physical canyon floors |
| 12 | PVWatts parameters: `gcr 0.01`, `losses 9`, tilt-dependent soiling, explicit `use_wf_albedo=1`, `dc_ac_ratio` from inverter size, drop the bracket variant | S | ×1.11 for vertical south; correct clipping for oversized arrays |
| 13 | Two-tier neighbour radius (200 m all, 800 m over 150 ft, 1,500 m over 300 ft) | S | 0 to −0.10 near towers |
| 14 | Constants: rate 0.35, customer charge 21, CO2 0.86 (average) or 0.98 (non-baseload, labelled), equivalency factors, degradation citations, kit anchors | S | current, sourced numbers |
| 15 | Headless horizon model for the manual / no-WebGL / screen-reader path | M | replaces bands that are 0.2 to 0.5 off |
| 16 | Wire `directSunHours`, the derived floor and facing, and a floor/direction correction into the UI; keyboard route to the manual panel when the scene loads | M | matches the methodology; recoverable mis-clicks |

### P2: model completeness

| # | Change | Effort | Effect |
|---|---|---|---|
| 17 | Mount-type question → balcony slab overhang band | M | 0 to −26% for vertical panels under deep slabs; −14 to −43% for top-mounts |
| 18 | Street trees from Forestry Tree Points with seasonal transmittance (2D sky mask) | M to L | −0.25 to −0.45 for floors 1 to 4 on tree-lined blocks |
| 19 | Own-facade edges for tilted panels; setback-tower flag | S | −5 to −8% at 35°; fewer false canyons |
| 20 | Inverter replacement at year 12 to 15 (about 30% of kit cost) or a 20-year horizon; a today's-dollars total | S | more defensible lifetime figures |
| 21 | Recalibrate the static bands for the no-footprint case; update `tests/model.test.js` bands | S | see 3.2 |
| 22 | Record PVWatts fixtures so the PVWatts path is tested (today every model test runs the fallback) | S | coverage of the primary path |

### P3: architecture

| # | Change | Effort | Effect |
|---|---|---|---|
| 23 | Route PVWatts through a `/api/pvwatts` proxy with caching by rounded location and orientation | M | hides the key, cuts rate exposure, enables hourly data |
| 24 | Use PVWatts hourly output as the shade-sweep weights (8,760 h with the real TMY) | M | the natural end state of item 11 |
| 25 | Uncertainty budget in the methodology; field-validation plan | S / L | a defensible accuracy statement |

### 4.4 Self-consumption: the recommended model change

[Pending: to be completed from the self-consumption audit: the simulated self-consumption fractions by system size, tilt, azimuth, household consumption and battery; the literature range; the exact formula or table; and the effect on the default estimate's savings and payback.]

---

## 5. Alternatives considered

Recorded in `docs/modeling-decisions.md`, one entry per modelling choice, with the option chosen and the reasons.

---

## 6. Verification status

**Independently re-verified by the lead reviewer** (beyond the audit that raised it): the `nrel.gov` DNS state and the working `nlr.gov` endpoints (DoH queries, curl, a DEMO_KEY PVWatts and Solar Resource call); the neighbour-failure and duplicate-request paths (`index.html:1462-1467, 1632`); the force-hidden info panel and uncalled `directSunHours`; the fallback arithmetic behind the false ±5% anchor; the eGRID2023 NYCW row (864.5 / 976.9) from EPA's Rev 2 tables; the titles of NREL/TP-6A20-87524 and NREL/TP-5K00-88769 from the PDFs; the Socrata `within_circle` vs `intersects` counts (97 vs 131; 51 vs 76 over 100 ft; Empire State Building dropped at 150 m).

**Reported by one audit with cited primary sources, not re-run here:** PVWatts sweep numbers (raw responses were archived by the PVWatts audit; the grid is in appendix A); the shading experiments (scripts run against the shipped model); Con Ed tariff leaf values ($21.00; summer block); EIA averages; kit prices and shipping restrictions; SUNNY Act bill text details; EPA equivalency factors; degradation medians.

**Not verified:** any comparison against metered NYC balcony installations (none exist). Whether `developer.nrel.gov` is reachable from residential networks with cached DNS (it should not be; the zone is undelegated).

---

## Appendix A. PVWatts V8 grid for NYC (2026-09-02)

Source: `docs/data/pvwatts-v8-nyc-grid-2026-09-02.csv`. 1 kW DC at 40.7128 N, 73.9960 W, `module_type 1`, `array_type 0`, `losses 14`, `dc_ac_ratio 1.1`, `inv_eff 96.5`, `dataset nsrdb` (PSM V3 TMY 2020, station 1245973 at 40.73 N, 73.98 W), weather-file albedo, `bifaciality 0`, soiling `3|3|4|5|6|7|7|7|6|5|4|3`. Annual kWh per kW DC (the fallback table these should replace, in parentheses):

| tilt \ azimuth | N 0 | NE 45 | E 90 | SE 135 | S 180 | SW 225 | W 270 | NW 315 |
|---|---|---|---|---|---|---|---|---|
| 35° | 612 (395) | 736 (556) | 991 (889) | 1199 (1136) | 1295 (1235) | 1197 (1136) | 968 (889) | 717 (556) |
| 60° | 321 (336) | 502 (472) | 811 (756) | 1047 (966) | 1166 (1050) | 1051 (966) | 778 (756) | 473 (472) |
| 70° | 247 (308) | 432 (433) | 731 (694) | 953 (886) | 1067 (963) | 960 (886) | 697 (694) | 405 (433) |
| 90° | 219 (237) | 353 (333) | 602 (534) | 774 (682) | 841 (741) | 782 (682) | 574 (534) | 332 (333) |

Monthly shares (%) for the orientations that matter most:

| orientation | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 90° south | 11.4 | 10.3 | 10.1 | 6.3 | 5.9 | 4.9 | 5.5 | 6.2 | 8.4 | 10.4 | 11.3 | 9.3 |
| 90° east | 6.7 | 6.9 | 9.5 | 8.6 | 9.9 | 10.9 | 11.2 | 9.8 | 9.0 | 7.4 | 6.0 | 4.1 |
| 90° west | 6.4 | 6.3 | 9.1 | 9.0 | 11.5 | 10.6 | 11.8 | 10.2 | 7.9 | 7.4 | 5.3 | 4.4 |
| 60° south | 8.4 | 8.7 | 9.3 | 7.6 | 8.2 | 7.6 | 8.2 | 8.2 | 8.7 | 9.1 | 9.0 | 7.2 |
| 35° south | 6.9 | 7.6 | 8.9 | 8.3 | 9.6 | 9.3 | 9.8 | 9.2 | 8.7 | 8.2 | 7.5 | 5.9 |
| app fallback (GHI) | 5.6 | 6.8 | 8.2 | 9.2 | 10.5 | 11.2 | 11.4 | 10.3 | 8.8 | 7.3 | 5.6 | 5.1 |

Sensitivities at 90° south (1 kW, 841.3 kWh reference): albedo 0.30 with weather-file albedo 0.00%; albedo 0.20 with `use_wf_albedo=0` +4.72%; albedo 0.30 with `use_wf_albedo=0` +10.15%; `module_type 0` +0.94%; `module_type 2` +0.61%; `array_type 1` +1.46%; `gcr 0.01` +1.96%; `dc_ac_ratio 1.0` −0.14%; `dc_ac_ratio 1.2` −0.06%; `dataset tmy3` −1.51%; `bifaciality 0.7` +14.27%; no soiling array +4.9%; `losses 18.3` instead of the array −0.36%.

Plane-of-array composition from hourly output: 90° south 62.7% beam / 29.9% sky diffuse / 7.6% ground-reflected, 12.8% of AC energy below 200 W/m²; 35° south 66.6 / 32.6 / 0.9, 7.2% below 200 W/m². NSRDB NYC GHI: 1,489 kWh/m²/yr, 61.5% beam.

## Appendix B. Reproduction

- `npm test` runs the shipped modules in Node. The numbers in section 2 come from `tests/harness.js` (`loadModules()`), for example `SolarAPI.calculateEstimate({azimuth:180, tilt:90, systemWatts:800, floor:8, totalFloors:15, shading:'some', monthlyBill:140})`.
- PVWatts grid: one GET per cell to `https://developer.nlr.gov/api/pvwatts/v8.json` with the parameters in appendix A; `timeframe=hourly` for the composition analysis.
- Socrata check: `$select=count(*)&$where=within_circle(the_geom, 40.7484, -73.9857, 200)` vs `intersects(the_geom, 'POLYGON((...))')` against `https://data.cityofnewyork.us/resource/5zhs-2jue.json`.
- eGRID: EPA eGRID2023 Summary Tables Rev 2, Table 1, row NYCW.
- DNS: `https://dns.google/resolve?name=nrel.gov&type=NS` returns only the `gov.` SOA; `name=nlr.gov&type=NS` returns name servers.
