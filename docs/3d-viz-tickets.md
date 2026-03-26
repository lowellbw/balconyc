# 3D Visualization — Ticket Plan

Reference doc for the two new 3D calculator pages (Version A: Shadow Model, Version B: Hybrid Street View).

---

## Completed Tickets

### T1: Sun Position Algorithm
**File**: `js/sun-position.js`
**Status**: Done
**Scope**: Standalone NOAA-simplified solar position calculator for NYC. Computes sun altitude/azimuth for any month + time of day. Includes `toWorldPosition()` for Three.js DirectionalLight placement, `getDayBounds()` for sunrise/sunset, and `formatTime()` utility. Hardcoded for NYC lat/lon with EST/EDT handling.

### T2: Shared 3D Scene Core
**File**: `js/3d-scene.js`
**Status**: Done
**Scope**: `Scene3D` global object — Three.js renderer, camera, OrbitControls (constrained), shadow-mapped DirectionalLight, ground plane with grid, building geometry from GeoJSON (ExtrudeGeometry from real polygon coordinates), sun animation loop, raycasting for hover, time/month control integration, sun arc visualization. Coordinate conversion: lat/lon to local meters.

### T3: Shadow Model Module (Version A)
**File**: `js/3d-shadow-model.js`
**Status**: Done
**Scope**: `ShadowModel` object — geometric shadow impact scoring per building (direction-to-building vs sun azimuth, height blocking angle vs sun altitude), real-time color coding (red/orange/yellow/gray/blue), facade edge detection for balcony point placement, balcony marker, info panel DOM updates (sun position, building info, shadow status), hover tooltips.

### T4: Calculator Page 3A
**File**: `calculator-3a.html`
**Status**: Done
**Scope**: Full calculator page with left-column form (address, direction, mount, size, floor, shading, bill, cost) and right-column 3D viewport + results. 3D viewport includes: overlay info panels (sun position top-left, building info top-right), color legend (bottom-left), time controls (play/pause, slider 5:30AM-7:30PM, month buttons Jan/Mar/Jun/Sep/Dec). Results section identical to calculator.html (hero card, stats grid, monthly chart, environmental impact, system details, data sources).

### T5: Hybrid View Module (Version B)
**File**: `js/3d-hybrid-view.js`
**Status**: Done
**Scope**: `HybridView` object — ghost materials for neighbors (opacity 0.35, shadow casters 0.55), edge wireframes on all neighbors, facade edge detection, Street View texture mapping (fetches via existing `/api/visualize`, maps base64 image onto PlaneGeometry on correct facade), balcony floor highlight band, before/after toggle for AI-generated panels, shadow scoring for material switching.

### T6: Calculator Page 3B
**File**: `calculator-3b.html`
**Status**: Done
**Scope**: Same calculator structure as 3A but uses `HybridView` module. Different version tag (pink "VERSION B"), different title/description, different legend (neighbors/shadow casters/balcony instead of color scale), panel toggle button, texture status indicator.

---

## Follow-up Tickets (Future)

### T7: Sun Arc Visual Polish
Render the dashed sun path arc line properly using `Line` with `LineDashedMaterial`. Currently uses `LineSegments` which may not render dashes correctly. Consider adding sun sphere glow effect.

### T8: Mobile Optimization
- Reduce shadow map to 1024x1024 on mobile
- Reduce Street View texture to 512x512
- Hide month buttons on small screens (done via CSS)
- Touch-friendly time slider
- Consider reducing neighbor building limit to 200 on mobile

### T9: Tab Toggle (A/B on Same Page)
Per spec, both views should be available as tabs on the same results page with shared camera state. Currently they're separate pages for evaluation. Future: merge into single page with tab switcher.

### T10: Precise Shadow Algorithm
Replace the geometric ray-based scoring with backend-computed 8,760-hour shadow algorithm. The current client-side scoring is approximate; a backend endpoint could pre-compute monthly shade factors from actual sun path geometry.

### T11: Performance Profiling
Profile with 400+ buildings on various devices. Consider `InstancedMesh` or geometry merging for non-target buildings if frame rate drops below 30fps on mobile.

### T12: Building Hover Details
Add building address lookup (from Geoclient/PLUTO) to hover tooltips. Currently shows BIN and height only.

### T13: Before/After Comparison Mode
Add a comparison mode for Version B where user can toggle panels on/off and orbit the 3D view to see the AI-generated panels from different angles.
