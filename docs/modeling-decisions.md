# Modelling decisions

**What this is.** The public page `/methodology` describes *what* the calculator computes. This document records *why*: for each modelling choice, the alternatives that were considered, the reason the current choice stands, the error it is known to introduce, and what would make us revisit it. It does not restate the model; read the two together. It was written from the September 2026 audit (`docs/methodology-audit-2026-09.md`), the commit history (notably the 10 May and 31 August 2026 model rewrites), and the code as it stands on `main`.

**Status labels.** *Settled*: the choice is sound and the audit found no reason to change it. *Settled, fix pending*: the choice is right but the implementation has a defect. *Provisional*: defensible today, a better option is identified and costed. *Under review*: the audit recommends changing it.

**House rules for changing a decision.** Add a failing test first (`npm test` runs the shipped modules). Update `/methodology` in the same change. Record the new reasoning here. Re-run the PVWatts grid in `docs/data/` whenever a PVWatts parameter changes.

---

## Part 1. Energy engine

### D1. Production engine: NREL/NLR PVWatts V8 API
**Status:** Settled, fix pending (the API host moved).

**Decision.** Call PVWatts V8 with the panel's real tilt and azimuth at the address's coordinates, `timeframe=monthly`, and apply near-field shading as a post-multiplier.

**Alternatives.** (a) PVGIS (EU JRC): free, no key, ERA5 or SARAH weather, hourly output, horizon input; gives 970 kWh/kW for NYC vertical south vs PVWatts 883 without soiling, a 10% spread that reflects the weather database rather than the model. (b) A client-side transposition model (pvlib-style Perez plus a temperature model) driven by NSRDB TMY data shipped with the site: full control, no runtime dependency, but we would own the physics and the weather file. (c) HTW Berlin's Stecker-Solar-Simulator approach (regressions fitted to one-minute German data): not transferable to NYC. (d) A cached PVWatts table for the whole city (see D7): exact for NYC, no runtime call.

**Why PVWatts.** It is the US reference model, uses the NSRDB satellite TMY for the actual 4 km cell, models the CEC module, cell temperature and inverter, is free, and needs no build step. Its outputs are what NYSERDA and every US installer quote against.

**Known error.** The host `developer.nrel.gov` stopped resolving when NREL became the National Laboratory of the Rockies; the identical API is at `developer.nlr.gov`. Until the hostname change ships, every estimate silently uses the fallback (D7). PVWatts has no near-field shading, so the shade factor must be a separate multiplier (D10). One TMY cell for the city (borough spread a few percent). TMY3 (a station 8 km away) differs by 1.5%.

**Revisit when.** NLR changes the API again; or when a proxy with caching (P3 in the audit) makes hourly output cheap enough to drive the shade sweep (D13).

### D2. Weather dataset: `dataset=nsrdb`
**Status:** Settled.

**Decision.** NSRDB PSM V3 TMY (1998 to 2020 typical year), 4 km satellite grid.

**Alternatives.** `tmy3` (Central Park or LaGuardia station archive, 1991 to 2005): older, one point, −1.5%. Multi-year actuals: PVWatts does not expose them; PVGIS does (ERA5 2005 to 2023).

**Why.** Consistent gridded data for the exact location; the typical year is what a 25-year projection needs.

**Known error.** A typical year is not any particular year; year-to-year NYC irradiance varies about ±5 to 8%. This is the floor of any accuracy claim (D31).

### D3. Module and mounting: `module_type 1`, `array_type 0`
**Status:** Settled, fix pending (`gcr`).

**Decision.** "Premium" module (V8: 21% STC, −0.35 %/°C, anti-reflective glass, CEC single-diode model) on a fixed open rack (NOCT 45 °C).

**Alternatives.** `module_type 0` (+0.9%) or 2 (+0.6%): immaterial. `array_type 1` (roof mount, NOCT 49 °C, no row self-shading): the right thermal model for a panel flush against a wall, −0.5% thermally.

**Why.** Balcony kits use 20 to 23% mono-PERC or TOPCon modules with −0.29 to −0.34 %/°C, closest to Premium. A rail-hung panel has air on both faces, which is the open-rack assumption.

**Known error.** `array_type 0` also applies PVWatts' row-to-row self-shading for a field two modules high at the default ground coverage ratio 0.4. A single balcony panel has no row in front of it. Passing `gcr=0.01` removes the phantom row: +1.96% for vertical south. The methodology's "19% efficiency" is the V5 figure; V8 Premium is 21%.

**Revisit when.** A mount-type question (D16) exists; then wall-mounted panels should use `array_type 1`.

### D4. System losses: `losses 14` plus a monthly soiling array
**Status:** Under review.

**Decision.** A 14% flat DC derate (documented as mismatch 3, wiring 4, connections 0.5, LID 1.5, nameplate 1, availability 3, snow 1) plus a separate monthly soiling array of 3 to 7%.

**Alternatives.** (a) PVWatts' 14.08% default as-is, which already contains soiling 2% and shading 3%: double counts both, since we model soiling and shading separately. (b) A kit-specific bundle: mismatch 0.5 (one or two modules on their own MPPT), wiring 1 (a 5 to 15 m cord), connections 0.5, LID 1.5, nameplate 1, availability 3 (plug-in devices get unplugged, GFCI trips, no monitoring), snow 1: 8.2% compounded, round to 9. (c) 12.3% (the default minus soiling) keeping the 3% "shading" as a proxy for awnings, AC units and trees the footprints cannot see.

**Why the current value was chosen.** Conservatism, and to keep the documented decomposition close to PVWatts' default. The audit's live check shows `losses` and `soiling` are applied independently, so the 14% double counts about 2% of soiling and carries 3% of far-horizon shading that the 3D model also removes.

**Recommendation.** Option (b), `losses 9`: +5.8% for vertical south. If the 3D model is judged optimistic for micro-obstructions, keep 2 to 3% of "unmodelled shading" explicitly and say so, rather than hiding it in a rooftop bundle. The soiling array should also fall to about 1 to 3% for vertical panels (D5).

**Known error today.** About −6% (losses) and −3% (soiling) for vertical panels.

**Revisit when.** Trees and the balcony slab are modelled (D17, D18); then no shading allowance belongs in `losses`.

### D5. Soiling: a monthly array, not folded into losses
**Status:** Provisional.

**Decision.** `soiling = 3|3|4|5|6|7|7|7|6|5|4|3` (pipe-delimited, 12 values), retried as bracketed JSON, then folded into `losses 18.3` if rejected.

**Alternatives.** (a) Tilt-dependent arrays: vertical panels shed dust and are rain-cleaned; field studies give 0.05 %/day at 90° vs 1.21 %/day at 0°, and the Northeast is a low-soiling region (<1 to 2%/yr). Proposed: tilt 90 `1|1|2|3|3|2|2|2|2|1|1|1` (about 1.8% energy-weighted), tilt 35 to 70 `2|2|3|4|4|3|3|3|3|2|2|2`. (b) A flat 2% inside `losses`: simplest, loses the pollen season.

**Why the array.** Seasonality (pollen in April to June) is real and visible in the monthly chart, and PVWatts applies the array to irradiance before the module model, which is the physically right place.

**Known error.** The bracketed variant can never succeed (the API returns HTTP 422 for anything but a 12-value pipe list), so the retry chain has one dead step. The cited NREL soiling reference (`fy18osti/72589`) is a dead link that could not be identified; the values should be re-sourced. Effective soiling of the current array is 4.7% on a vertical panel, likely 2 to 3× too high.

**Revisit when.** Any NYC balcony soiling measurement exists.

### D6. Ground reflection and bifaciality: `albedo 0.20`, `bifaciality 0`
**Status:** Settled, docs fix pending.

**Decision.** Monofacial panel; ground albedo nominally 0.20.

**Alternatives.** Force our own albedo (`use_wf_albedo=0`): 0.20 gives +4.7%, 0.30 gives +10.2% for a vertical panel; PVWatts bifaciality 0.7: +14.3%.

**Why.** For a vertical panel the ground component is 8% of plane-of-array irradiance, so the choice matters. PVWatts V8 defaults to the NSRDB weather-file albedo (`use_wf_albedo=1`, NYC mean 0.128, up to 0.87 with snow), so the app's 0.20 is silently ignored and the output is identical for 0.20 and 0.30. That default is the better physics for a balcony: the panel's lower hemisphere sees asphalt, cars and lower facades (0.12 to 0.20), not the balcony floor, and snow days are credited. Bifaciality stays 0 because PVWatts' rear model sees half the sky behind a free-standing row; a wall-backed railing panel gains 3 to 5% in field tests, not 14%.

**Recommendation.** Make `use_wf_albedo=1` explicit, and describe the weather-file albedo in the methodology instead of "concrete balcony floor 0.20". Offer an optional +3 to 5% post-hoc credit for bifacial kits with a light wall behind.

### D7. Fallback yield model when PVWatts is unavailable
**Status:** Under review.

**Decision.** `1,300 kWh/kW × kW × tilt_factor × azimuth_factor × 0.95 soiling × railing × shade`, with separable factor tables (tilt 1.00 / 0.85 / 0.78 / 0.60 at 35 / 60 / 70 / 90°; azimuth 1.00 / 0.92 / 0.72 / 0.45 / 0.32 for S / SE,SW / E,W / NE,NW / N) and a GHI-shaped monthly curve.

**Alternatives.** (a) Keep separable factors but recalibrate them (best possible separable fit still has 27% worst-case error). (b) Ship the 4 × 8 PVWatts table and 32 monthly shapes for the NYC cell (`docs/data/pvwatts-v8-nyc-grid-2026-09-02.csv`): exact for NYC, 32 × 13 numbers, regenerated whenever a PVWatts parameter changes. (c) A client-side transposition model (D1b).

**Why the separable factors were chosen.** They were calibrated by eye against PVWatts vertical NYC and HTW Berlin in May 2026, before the live grid existed, and they are easy to explain.

**Known error (measured against 32 live PVWatts runs).** Vertical panels −12% (0.60 vs 0.650); tilt 35 north −35%, tilt 70 north +25%; mean absolute error 9.2%, RMS 11.9%. The extra ×0.95 soiling is double-applied (the 1,300 baseline already matches PVWatts with the soiling array: 1,295). The monthly curve is inverted for vertical panels (June 11.2% vs the real 4.9%; January 5.6% vs 11.4%). Because the API host is down (D1), this fallback is what every visitor currently sees.

**Recommendation.** Option (b), and re-anchor the §9 validation text at PVWatts (673 kWh for 800 W vertical south unshaded) rather than the scaled HTW figure.

### D8. Monthly distribution on the fallback path
**Status:** Under review (resolved by D7b).

**Decision.** NREL Solar Resource monthly GHI if available, else a hardcoded NYC GHI curve.

**Why it is wrong.** Production follows plane-of-array irradiance, not GHI. A vertical south panel is winter-peaked; the GHI curve is summer-peaked. Also, `fetchSolarResource` normalises daily means without weighting by days in month (February +8.8%).

**Recommendation.** Per-orientation shapes from the PVWatts grid (D7b). Keep Solar Resource only as a cross-check.

### D9. DC to AC ratio and inverter efficiency: `dc_ac_ratio 1.1`, `inv_eff 96.5`
**Status:** Settled, refinement identified.

**Decision.** A microinverter matched to one or two modules.

**Alternatives.** 1.0 or 1.2: −0.14% and −0.06%, immaterial for a vertical panel, which spends 16 hours a year at the inverter cap. Deriving the ratio from the actual kit: `max(1.0, panel W / inverter W AC)`.

**Why.** Real kits: EcoFlow STREAM 1,200 W AC, Hoymiles HiFlow Pro 360 W per two modules, APsystems EZ1 up to 900 VA, Enphase IQ8 per-panel 1.2 to 1.47. Efficiency 96.5% sits between Enphase IQ8 (97.0 CEC) and budget units (96 to 96.5).

**Known error.** The UI allows 400 to 1,600 W of panels against what is usually an 800 W (SUNNY Act maximum 1,200 W) inverter. A 1.6 kW array on 800 W AC clips 7.9% (vertical) to 12.8% (tilt 35), which a constant 1.1 cannot see.

**Recommendation.** Derive the ratio from system watts and an inverter size input (default 800 W, option 1,200 W).

---

## Part 2. Shading

### D10. Beam shading: a horizon profile at a point
**Status:** Settled, fixes pending (D15, D19a).

**Decision.** Project every neighbouring footprint onto a 360-bin skyline of maximum obstruction altitude as seen from the balcony point; the beam is lost when the sun is below the skyline in its azimuth bin.

**Alternatives.** (a) Ray casting from a grid of points across the module (3 × 3): captures shadow edges crossing the panel at 9× the cost. (b) GPU shadow maps from the Three.js scene: display-grade, not energy-grade. (c) LiDAR digital surface models (Project Sunroof, Mapdwell): far heavier infrastructure. (d) A user-declared "light / medium / strong" cutoff (HTW Berlin: direct sun ignored below 25 / 35 / 45°): crude.

**Why.** It is the PVsyst far-shading and pvlib horizon pattern: O(bins) per sun position, tilt-independent (built once per address), handles concave footprints and the north seam, and needs only footprints and heights, which NYC publishes for every building. The 31 August 2026 rewrite replaced a per-building angular-span model that could block sunlight through an L-shaped building's notch and that double-counted orientation (an unobstructed east balcony scored 0.54).

**Known error.** The point approximation is fine for obstructions beyond about 10× the panel size and wrong for the railing, the slab above, neighbouring balconies and AC units (D16). Shadow edges take 15 to 20 minutes to cross a module; with bypass diodes the loss during a transition is non-linear, so a linear model is 1 to 3% optimistic on beam. The target's own footprint is excluded, so tilted panels see open sky where their own wall stands (−5 to −8% at 35°); courtyard-facing balconies see none of their own building's wings.

**Revisit when.** Trees (D18) are added; the same skyline can carry a transmittance mask.

### D11. Diffuse shading: isotropic sky-view integral
**Status:** Settled.

**Decision.** Integrate `cos θ × cos(alt)` over the visible hemisphere above the skyline, divided by the same integral over the open hemisphere; multiply the diffuse component by that fraction.

**Alternatives.** (a) A constant diffuse fraction (the pre-August model used 0.30): penalised orientation twice. (b) Perez anisotropic sky (circumsolar plus horizon brightening): on a vertical south panel the Perez sky is 1.18× isotropic annually, 1.5 to 1.9× in winter; treating it as isotropically blocked changes the factor by 0.003 to 0.005, and blocking circumsolar with the beam by 0.01 to 0.03. (c) 145-patch anisotropic sky (UMEP SEBE).

**Why.** SAM, PVsyst and pvlib do the same; the kernel is exact (it reproduces π(1 + cos β)/2 to four decimals); the residual is at most 0.03.

**Known error.** The azimuth loop steps 2° over 1° bins so odd bins are never read (≤0.01). Fix by stepping 1°.

### D12. Ground-reflected irradiance
**Status:** Under review.

**Decision.** Not treated separately: the shade factor computed from beam and sky is applied to the whole PVWatts output, which derates the ground-reflected component at the blend rate.

**Alternatives.** (a) Leave it un-derated (buildings do not hide the street): an upper bound, +0.07 to +0.19 on the annual factor in canyons. (b) Derate it by the street's own horizontal openness from the same profile evaluated at y = 1 m (0.3 to 0.9): +0.02 (south) to +0.06 (north) vs today. (c) Explicit facade reflection with an albedo per surface: most physical, more sweeps and assumptions.

**Why it matters.** Ground-reflected light is 8 to 13% of a vertical panel's plane-of-array irradiance, 31% for a north-facing one, and it is what keeps a deep canyon from going to zero in winter.

**Recommendation.** Option (b), together with lowering the clamp floor from 0.10 to 0.02 (D14).

### D13. Irradiance weighting of the sun sweep
**Status:** Under review.

**Decision.** A clear-sky proxy `ghi = sin(alt)^0.75`, split 0.60 beam / 0.40 diffuse, with `beam = 0.60 × ghi × cos θ`.

**Alternatives.** (a) A 12 × 24 table of NYC mean DNI and DHI from the NSRDB TMY, with `beam = DNI × cos θ`: cheap, weather-weighted. (b) PVWatts hourly output (`timeframe=hourly`: `dn`, `df`, `poa`, `alb` for 8,760 hours, about 400 kB) as the weights: the real TMY, per-hour beam and diffuse, and the sweep becomes 8,760 hours (T10 in the old ticket plan). (c) A proper clear-sky model (Haurwitz GHI, Meinel or Ineichen DNI): better than the proxy, still not weather.

**Why the proxy was chosen.** No weather data was available client-side and only the ratio of received to assumed irradiance matters for a multiplier.

**Known error.** The proxy is beam-horizontal, not DNI, so low sun is under-weighted about 1.8× below 25° altitude, exactly the light buildings block; and the fixed split describes the horizontal, not a vertical plane (measured vertical-south POA: 62.7% beam, 29.9% sky, 7.6% ground; the proxy implies 54.7% beam, no ground). Against a full-year hourly reference through the same skyline: optimistic by 0.03 to 0.05 on side-street floors 1 to 4, by 0.06 to 0.08 (30 to 35% relative) in a 30 m avenue canyon, pessimistic by 0.045 for low-sun-only shading; monthly errors up to 0.25.

**Recommendation.** Option (a) now (a static table in the repo), option (b) once PVWatts is proxied and cached.

### D14. Temporal sampling, weights and clamp
**Status:** Provisional.

**Decision.** Twelve representative days (the 15th), 10-minute steps between sunrise and sunset, monthly factors clamped to [0.10, 1.00], annual factor weighted by the hardcoded GHI curve.

**Alternatives.** Two days per month; all 365 days at a 20-minute step (still instant in Node); energy-weighted annual (Σ received / Σ assumed over the sweep); 8,760-hour sweep (D13b).

**Why.** Speed and simplicity; the sweep runs in the browser on every tilt change.

**Known error.** Annual factor within 0.005 of a 365-day sweep on every skyline tested; monthly factors err by up to 0.03 to 0.04 on simple bands and up to 0.115 on a side-street floor whose opposite roofline crosses the 15th's noon altitude mid-month. Two sample days per month roughly halve the monthly error. The GHI weights over-weight summer for a vertical panel (June 0.112 vs 0.045 to 0.072 of vertical-south POA), shifting the annual by +0.01 to +0.02. The 0.10 floor hides real winter values of 0.02 to 0.03 in deep canyons (their annual reads 0.06 to 0.08 too high). 10-minute steps are fine (≤0.017 monthly, ≤0.0012 annual vs 1-minute), and the sun-position algorithm itself contributes under 0.002 annually (D20). A 365-day sweep costs about 90 ms in Node, so cost is not a reason to keep 12 days.

**Recommendation.** Energy-weighted annual, two days per month, clamp floor 0.02 once D12 is in.

### D15. Balcony point placement
**Status:** Under review.

**Decision.** Height `floor / totalFloors × building height`, at the midpoint of the facade edge whose outward normal best matches the chosen direction, 2 m outside it.

**Alternatives.** `(floor − 1) × storey + 0.6 m` with `storey = clamp(height / floors, 2.7, 4.5)` (the `height_roof` field includes bulkheads, which inflates storey height on small buildings); the click's own position along the facade; the click's own height with the floor derived only for the label.

**Why the current rule.** Simplicity, and the same fraction is used to derive the floor from a click, so the two are consistent with each other.

**Known error.** One storey too high: the top floor sits at the roofline, where the model sees no obstruction at all (1.00 vs 0.90 to 0.95 corrected). On an 18 m side street the corrected placement lowers factors by 0.04 to 0.10 (5 to 10% of output) at every floor and orientation. In the click path a click at the true balcony height derives floor f − 1, so the modelled height is roughly right and the floor label, the logged floor and the static-fallback input are one too low; the manual path carries the full bias. Placing every balcony at the facade midpoint ignores which end of a long facade the visitor clicked.

**Recommendation.** The storey-based rule above, at the click position.

### D16. Railing and the balcony slab above
**Status:** Provisional.

**Decision.** A fixed tilt-dependent factor: 0.95 at 90°, 0.97 at 70°, 0.98 at 60°, 0.99 at 35°, applied on both paths, described as railing, hardware and the balcony floor above.

**Alternatives.** A geometric ceiling band: a slab with underside h above the panel centre whose edge projects d beyond the panel plane blocks every direction with `alt > atan(h × cos Δaz / d)`; d from a mount-type question (hangs outside the railing d ≈ 0, stands on the balcony floor d ≈ 0.5, wall-mounted under a deep slab d ≈ 1.5 m).

**Why the fixed factor.** Footprints cannot see the balcony, and 5% is the conservative end of field reports for rail-hung vertical panels.

**Known error.** The slab is not a fixed 5%: for a vertical panel it costs 0 / 7 / 15 / 26% at d = 0 / 0.8 / 1.2 / 1.8 m (May to August up to 45%), and a 35° top-mount loses 14% even at d ≈ 0 because it looks up into the slab. The current factor is a fair stand-in for the railing itself, not for the slab.

**Recommendation.** Keep the railing factor; add the ceiling band from a one-question mount type.

### D17. Neighbour radius and count: 200 m, up to 500 footprints
**Status:** Under review (also a query-semantics defect).

**Decision.** `within_circle(the_geom, lat, lon, 200)` with `$limit 500`.

**Alternatives.** A 350 to 500 m circle with a higher limit; a two-tier query (everything within 200 m, plus `height_roof > 150` within 800 m and `> 300` within 1,500 m); an adaptive rule (include any building with `(height − balcony height) / distance > tan 10°`).

**Why 200 m.** Scene size and request weight for the 3D view.

**Known error.** Two defects and one limitation. (1) Socrata's `within_circle` on polygon geometry is a containment test, so footprints that cross the circle are dropped, and the largest footprints are the tallest buildings: Midtown returns 97 features by containment and 131 by intersection (51 vs 76 over 100 ft); the Empire State Building is dropped from 150 m away. The BIN-less target lookup (`within_circle` 50 m, `$limit 1`) returns nothing for any building larger than the circle. Fix: `intersects(the_geom, <circle polygon>)` and `intersects(the_geom, 'POINT(lon lat)')`. (2) The limit truncates silently and unordered: the 200 m circle holds 549 footprints in Woodhaven, 449 in East Flatbush, 428 in Middle Village. (3) A 100 m building at 250 m costs 3.6% of annual output, a 250 m tower at 400 m costs 4.2%; half of a south panel's winter beam arrives below 25° altitude (below 20° for east and west).

**Recommendation.** `intersects`, the two-tier radius, a `$limit` well above the count (Socrata allows 50,000), and a check that `features.length < $limit`.

### D18. Trees and other objects not in the footprint data
**Status:** Provisional (not modelled).

**Decision.** Not modelled; disclosed as a limitation.

**Alternatives.** (a) Forestry Tree Points (`hn5i-inap`, 1.12 million points with location, DBH, structure) with DBH allometry (crown top ≈ min(22, 4 + 0.55 × DBH_in) m, radius ≈ min(8, 1.2 + 0.30 × DBH_in) m, base 3 m) and seasonal transmittance (0.2 in leaf May to October, 0.6 bare), applied as a 2D sky mask that buildings, the slab band and trees all write into. (b) A user toggle "tree in front" with a canonical tree. (c) LiDAR canopy.

**Why not yet.** Data and design effort; the 1D max-altitude skyline cannot carry a partial transmittance.

**Known error.** Large for floors 1 to 4 on tree-lined blocks: a 12 m street tree in front cuts a side-street south balcony from 0.53 to 0.28 on floors 1 to 3 and from 0.72 to 0.37 on floor 4. Treating the tree as an opaque footprint overstates the loss by about 40%.

**Recommendation.** Option (a) as a P2 item; option (b) as a stopgap.

### D19. Shade fallback when no 3D model is available
**Status:** Under review.

**Decision.** A static factor `min + (0.5 + 0.5 tanh(3 (floor/N − 0.45))) × (max − min)` with four environment bands (open 0.85 to 0.97, some 0.65 to 0.94, dense 0.45 to 0.87, wide avenue 0.70 to 0.96).

**Alternatives.** (a) Run the real horizon model headless: it reads only footprints, heights and a balcony point; Three.js is touched only by the marker and a `Vector3`. Footprints are already fetched regardless of WebGL. About 40 to 60 lines. (b) Recalibrate the bands as an implied canyon (street width, opposite height) → horizon angle → convex curve `1 − 0.72 (φ/60°)^1.6` with orientation multipliers (0.95 east/west, 0.85 north on the shaded part), which reproduces the 3D model within ±0.05 on canonical geometries. (c) Keep the bands.

**Why the bands.** They replaced a 4 × 4 step table in May 2026 to remove cliffs between adjacent floors, and they are what the manual path and screen-reader users get.

**Known error.** Compared with the 3D model on canonical geometries: 0.2 to 0.5 too optimistic in avenue canyons (3D 0.19 / 0.25 / 0.34 vs "wide avenue" 0.73 / 0.78 / 0.85 for floors 2 / 6 / 10 of 20), 0.1 too pessimistic for open waterfront (0.98 vs 0.86 to 0.97), within 0.03 for rowhouse streets and within 0.06 for low side-street floors; orientation-blind while north and east differ from south by up to 0.16. The "Surrounding shading" control is also shown active on the 3D path, where it is ignored.

**Recommendation.** (a) whenever footprints exist; (b) for the no-footprint case; disable the control on the 3D path.

---

## Part 3. Sun position and site data

### D20. Solar position algorithm
**Status:** Settled.

**Decision.** A simplified NOAA algorithm (`js/sun-position.js`): mean anomaly and equation of centre from the Julian century, fixed obliquity 23.4393°, a Spencer-type equation of time, hour angle from local clock time with a DST rule keyed on day of year, `atan2` azimuth with no post-rotation; the 15th of each month as the representative day; the year read from the clock.

**Alternatives.** The full NOAA spreadsheet algorithm (nutation, refraction, exact Julian day); Michalsky 1988; the NREL SPA (arc-second grade, far more code); a day-of-year API so the shade sweep can use any date.

**Why.** Small, dependency-free, and accurate to well under a degree for energy purposes; the 31 August 2026 fix removed a 180° azimuth rotation that had inverted every azimuth while leaving altitude (and therefore sunrise, sunset and day length) correct, and the regression suite now pins the convention.

**Known error.** Against a full NOAA reference on the 12 representative days of 2026: altitude within 0.146° (RMS 0.066°), azimuth within 0.327° (RMS 0.146°), solar noon within 0.83 minutes, sunrise and sunset within 0.85 minutes. The largest term is the simplified equation of time; the approximate Julian day (0.29 days late in 2026, drifting 0.25 days a year until a leap year resets it) and the omitted perihelion precession (0.456° in 2026) happen to cancel this year and will slowly diverge; the fixed obliquity is immaterial; refraction is ignored (up to 0.55° at the horizon, 0.28° above 5°). Through the shade sweep the algorithm moves an annual factor by at most 0.02 points and a monthly factor by at most 1.1 points, which is below the error of the representative-day sampling (D14). The DST rule is right for every representative 15th from 2025 to 2030; in leap years the day-of-year table is one day early from March onward (under 0.4° of declination).

**Also found here.** The rendering path mirrors every building mesh north-south (`_createBuildingMesh` builds the shape with `moveTo(x, z)` and the `rotateX(−π/2)` extrusion maps it to world −z; verified against three.js r128). The model reads local coordinates and is unaffected; the picture, its shadows and the heatmap placement are wrong until `moveTo(x, -z)` / `lineTo(x, -z)` is applied. Recorded here because the audit of axis conventions is where it surfaced.

**Revisit when.** The shade sweep moves to all days or to hourly TMY weights (D13b, D14), which needs a day-of-year interface; at that point Michalsky 1988 (0.01°, and faster than the shipped code because it needs no `new Date()` per call) is the natural replacement.

### D21. Facade orientation from the footprint
**Status:** Settled.

**Decision.** Project the exterior ring to local metres (longitude scaled by cos latitude), take the longest edge's two perpendiculars as the primary facades, snap to 45°, rank by solar potential; confidence "high" when the longest edge exceeds 1.3× the longest edge at least 30° off it.

**Alternatives.** Minimum bounding rectangle orientation; Geoclient street frontage; Street View analysis.

**Why.** Reads the actual polygon, so the Manhattan grid's 29° rotation comes out of the data; the cos-latitude projection (added 31 August 2026) removed up to 7° of bearing skew that could snap a grid facade to the wrong compass point.

**Known error.** Snapping to 45° is needed only for the fallback factor table; PVWatts and the shade model accept any azimuth, yet the click path snaps before calling them (a 209° facade becomes 225°). The pre-fill is used only in the manual panel.

### D22. Address resolution and building attributes
**Status:** Settled, fixes pending.

**Decision.** Google Places for coordinates, NYC Geoclient for BBL and BIN, PLUTO for floors (and year, class, units, which are fetched but not shown), Building Footprints by BIN for polygon, `height_roof` and `ground_elevation`.

**Known errors.** PLUTO `numfloors` is truncated by `parseInt` (2.5 → 2) and missing values silently become 20; the target's default height is 60 ft while neighbours default to 40 ft; the BIN-less footprint lookup uses containment semantics (D17); `height_roof` is the footprint's maximum, so a tower on a full-lot podium is extruded to tower height across the whole lot, over-blocking the street wall.

---

## Part 4. Financial model

### D23. Electricity rate: one all-in marginal SC-1 rate
**Status:** Settled, constants due for update.

**Decision.** $0.34/kWh (supply + delivery + GRT + sales tax, excluding the fixed customer charge), the same rate for every kWh; the customer charge ($20) is stripped from the bill before inferring consumption.

**Alternatives.** Separate supply and delivery components with the summer block (June to September delivery is $0.16402 for the first 250 kWh and $0.18858 above); time-of-use (Con Ed's default SC-1 is flat, TOU is voluntary); the average bill divided by kWh (includes the customer charge, which solar cannot offset).

**Why.** Marginal is right for an offset; a single number is explainable; the 2025 average (33.83¢ at 300 kWh, excluding the customer charge, grossed up for taxes) is Con Ed's own figure.

**Known error.** For 2026 the central value is closer to 35¢ (PSC-approved +3.5%, supply up further); the customer charge is $21.00 from 1 February 2026; users above 250 kWh in summer face a marginal rate about 2.5¢ higher. Both cited source URLs have moved.

### D24. Self-consumption: 100% of production offsets purchases
**Status:** Under review (the largest financial correction identified).

**Decision.** `annual_savings = annual_kWh × rate`.

**Why it was chosen.** Annual production (500 to 650 kWh for 800 W vertical) is far below annual consumption (about 4,200 kWh at the default bill), so exports looked negligible.

**Why that reasoning fails.** Export happens whenever instantaneous PV output exceeds the apartment's instantaneous load, which at midday on a weekday is often a refrigerator and standby (100 to 300 W) against 400 to 600 W of AC output. Under the SUNNY Act exported energy is uncompensated unless the owner voluntarily enters a net-metering agreement, and Con Ed's AMI meters record delivered and received energy separately, so exports are neither billed nor credited. Every exported kWh is therefore worth zero.

**Alternatives.** (a) A static self-consumption fraction. (b) A curve of self-consumption against the ratio of annual production to annual consumption, with tilt (vertical panels have flatter daily output) and a "someone is usually home in the day" toggle. (c) An hourly overlap of PVWatts hourly output with a standard residential load profile scaled to the bill. (d) A battery option (1 to 2 kWh, about $300 to $800, 85 to 90% round trip).

**Recommendation and numbers.** [To be filled from the self-consumption audit: simulated fractions by size, tilt, azimuth, consumption and battery; the literature range from HTW Berlin and German field data; the effect on the default estimate.]

### D25. Escalation, degradation, horizon, discounting
**Status:** Provisional.

**Decision.** Nominal dollars; 25 years; escalation presets 2 / 3 / 4% (default 3); degradation 0.4 / 0.5 / 0.7%/yr by tier; no discount rate; no inverter replacement; payback interpolated within the crossover year.

**Alternatives.** Project Sunroof: 20 years, 2.2% escalation, 4% discount, 0.5% degradation, no value for exports. SAM: 25 years, 2.5% inflation, a real discount rate. EnergySage: simple payback. HTW Berlin: constant prices, 0.3% degradation, 15-year horizon (20 maximum), inverter replaced at year 15, savings only on self-consumed energy.

**Why.** Nominal figures are what a household compares to a bill; the escalation band brackets the long-run record (US 1990 to 2025 2.3%/yr, 2015 to 2025 3.2%, NY 2004 to 2024 2.6%, Con Ed 2023 to 2025 7.1%); degradation tiers follow module-level medians (0.35 to 0.55%/yr).

**Known error.** The degradation citation in the methodology points at a community-solar report; the intended references are NREL/TP-5K00-88769 (Deline et al. 2024, fleet median 0.5 to 0.75%/yr) and Jordan et al. 2022 (median 0.75, P90 1.9). Kit inverters carry 10 to 12 year warranties, so a 25-year total with no replacement is optimistic. At 3% escalation the nominal total is about 40% above a today's-dollars total.

**Recommendation.** Keep the nominal headline; add an inverter replacement at year 12 to 15 (about 30% of kit cost) or a 20-year horizon; show a today's-dollars total; cite the right papers; consider 0.4 / 0.6 / 0.9 for system-level degradation.

### D26. Kit cost: three tiers, linear in watts
**Status:** Provisional.

**Decision.** $850 / $1,200 / $1,600 for 800 W, scaled by `watts / 800`.

**Known error.** The named anchors do not hold for New York: Bright Saver cannot ship to NY until a kit is listed as a complete plug-in system (none is); Craftstrom's 800 W kit lists at $2,031 to $2,229; EcoFlow PowerStream and Anker SOLIX RS40P are EU products. Cost is not linear in watts (a 400 W kit is not half the price of 800 W). Kit prices are quoted pre-tax; NYC sales tax is 8.875%.

**Recommendation.** Keep tiers as forward estimates but re-anchor on US 120 V kits (APsystems EZ1 plus panels, EcoFlow STREAM plus panels, Bright Saver once shippable) and say that no NY-legal kit exists yet.

### D27. Incentives: none
**Status:** Settled.

**Decision.** Gross cost; no federal credit (§25D ended for expenditures after 31 December 2025 under P.L. 119-21 §70506), no NY credit (IT-255 requires a net-metering agreement and utility connection), no NYC abatement or NY-Sun (both require interconnection).

### D28. Inferring consumption from the bill
**Status:** Settled, constant due for update.

**Decision.** `(bill − customer charge) / rate × 12`, clamped to at least 1 kWh, offset capped at 100%.

**Known error.** The $140 default implies about 350 kWh/month; Con Ed's NYC typical is 280 kWh ($112.75 in 2025); $140 is the New York statewide average bill. The modal's "of typical apartment usage" wording describes the visitor's own bill.

---

## Part 5. Environmental model

### D29. CO2 factor: eGRID NYCW average output emission rate
**Status:** Settled, constant due for update.

**Decision.** 0.89 lb/kWh, labelled eGRID2023.

**Alternatives.** Non-baseload (EPA's own equivalencies calculator uses it for avoided emissions): eGRID2023 976.9 lb/MWh; hourly marginal (NYISO zonal implied marginal emission rates, WattTime); long-run marginal trajectories (NREL Cambium, recommended by DOE's Building Technologies Office for measure impacts).

**Why.** Average is conservative and standard for consumer calculators. NYCW is 98.2% gas, so average and non-baseload differ by only 13%.

**Known error.** 0.89 is the eGRID2022 value (885.2 lb/MWh). eGRID2023 Rev 2 gives 864.5 average and 976.9 non-baseload. A constant factor multiplied over 25 years ignores grid decarbonisation.

**Recommendation.** 0.86 (average) or 0.98 labelled as EPA's avoided-emissions method; present it as a year-one figure.

### D30. Equivalencies
**Status:** Settled, attributions due for correction.

**Decision.** Trees at 48 lb CO2 per tree-year; miles at 0.89 lb/mile; smartphone charges at 12 Wh.

**Known error.** 48 lb is Arbor Day Foundation / USDA, not EPA (EPA: 0.060 t per urban tree-year, about 133 lb). EPA's vehicle factor is 0.866 (calculator) to 0.882 (typical-vehicle page) lb/mile, and because 0.89 equals the CO2 factor the "miles" figure always equals annual kWh. EPA moved to 19 Wh per smartphone charge in October 2024.

---

## Part 6. Communicating uncertainty and testing

### D31. The accuracy claim: about ±15% (±20% on the fallback), modelled not measured
**Status:** Under review.

**Decision.** A single band, disclosed as a considered estimate rather than a validated tolerance.

**Why it cannot stand as written.** Production is currently on the fallback path (D1), and even with PVWatts restored the audit found systematic (not random) biases: balcony placement 5 to 10%, irradiance weighting 3 to 8 points of shade factor in canyons, dropped neighbours, and 100% self-consumption in the savings figure.

**Recommendation.** Replace the band with a short uncertainty budget (weather year ±5 to 8%; orientation snapping ±3%; shading geometry ±5 to 15% by density; kit losses ±3%; self-consumption as the dominant term for savings), re-stated after the P1 fixes; and plan field validation once the Act takes effect.

### D32. Testing strategy
**Status:** Settled, gap identified.

**Decision.** A dependency-free Node suite (`npm test`) that loads the shipped browser modules and pins invariants (open sky scores 1.00 at every orientation, solar noon is south, financial and environmental arithmetic, content consistency across the page, schema, footer and `llms.txt`).

**Known gap.** The harness's `fetch` throws, so every model test runs the fallback path; the PVWatts path (parameter construction aside) is untested. Recorded PVWatts fixtures (`docs/data/pvwatts-v8-nyc-grid-2026-09-02.csv` is a start) would cover it. There is no test that the configured API hosts resolve, which is how D1's outage went unnoticed.

### D33. What the page discloses when the pipeline degrades
**Status:** Under review.

**Decision.** A banner inside the breakdown modal for two conditions: PVWatts unreachable, no 3D shade profile.

**Known error.** Silent: a failed neighbour query (which yields 1.00), the soiling-folded PVWatts variant, PLUTO floors missing, a footprint chosen by proximity, neighbour truncation, a hardcoded monthly curve. The floating card and the personalised headline carry no qualifier; the loading overlay claims an hourly simulation on every path; the derived floor and facing are never shown.

**Recommendation.** A per-run "what this estimate used" line from `result.dataSources` plus new `neighborCount` and `pvwattsVariant` fields, shown on the card and in the modal; the overlay text made conditional.
