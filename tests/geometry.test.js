// Geometry tests: the projection shared by the 3D scene and the headless
// shade model, footprint parsing, and the canonical canyons.

const { loadModules, describe, it, assert, near, between } = require('./harness');
const { ShadeGeometry, circleWkt, directionLabel } = loadModules();

const LAT = 40.7128, LON = -73.996;
const feature = (coords, props) => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: props || {} });
const ring = (cLat, cLon, wM, dM) => {
  const dLat = dM / 2 / 111320, dLon = wM / 2 / (111320 * Math.cos(cLat * Math.PI / 180));
  return [[cLon - dLon, cLat - dLat], [cLon + dLon, cLat - dLat], [cLon + dLon, cLat + dLat], [cLon - dLon, cLat + dLat], [cLon - dLon, cLat - dLat]];
};

describe('ShadeGeometry projection', () => {
  it('puts north at -z and east at +x, in metres', () => {
    const o = ShadeGeometry.makeOrigin(LAT, LON, 0);
    const n = ShadeGeometry.toLocal(o, LON, LAT + 100 / 111320);
    const e = ShadeGeometry.toLocal(o, LON + 100 / (111320 * Math.cos(LAT * Math.PI / 180)), LAT);
    near(n.z, -100, 0.01, 'north z'); near(n.x, 0, 0.01, 'north x');
    near(e.x, 100, 0.01, 'east x'); near(e.z, 0, 0.01, 'east z');
  });

  it('converts heights from feet and elevations relative to the target', () => {
    const target = feature(ring(LAT, LON, 30, 30), { bin: '1', height_roof: '100', ground_elevation: '20' });
    const nb = feature(ring(LAT + 60 / 111320, LON, 20, 20), { bin: '2', height_roof: '50', ground_elevation: '30' });
    const built = ShadeGeometry.buildEntries(target, [nb], { defaultHeightFt: 40 });
    near(built.target.heightMeters, 30.48, 0.01, 'target height m');
    near(built.neighbors[0].heightMeters, 15.24, 0.01, 'neighbour height m');
    near(built.neighbors[0].elevOffset, 3.048, 0.01, 'neighbour stands 10 ft higher');
    near(built.neighbors[0].centroid.z, -60, 0.5, 'neighbour 60 m north');
    assert(built.target.isTarget && !built.neighbors[0].isTarget, 'target flag');
  });

  it('drops the closing vertex, the target itself and duplicate BINs', () => {
    const target = feature(ring(LAT, LON, 30, 30), { bin: '1', height_roof: '100' });
    const dupe = feature(ring(LAT, LON, 30, 30), { bin: '1', height_roof: '100' });
    const nb = feature(ring(LAT, LON + 0.001, 20, 20), { bin: '2', height_roof: '50' });
    const built = ShadeGeometry.buildEntries(target, [dupe, nb, nb], { defaultHeightFt: 40 });
    assert(built.target.localCoords.length === 4, `closed ring should give 4 vertices, got ${built.target.localCoords.length}`);
    assert(built.neighbors.length === 1, `expected one distinct neighbour, got ${built.neighbors.length}`);
  });

  it('applies the default height only when the footprint has none', () => {
    const target = feature(ring(LAT, LON, 30, 30), { bin: '1', height_roof: '100' });
    const nb = feature(ring(LAT, LON + 0.001, 20, 20), { bin: '2' });
    const built = ShadeGeometry.buildEntries(target, [nb], { defaultHeightFt: 40 });
    near(built.neighbors[0].heightFt, 40, 0.001, 'default height');
  });

  it('reads Socrata rows with a the_geom string as well as GeoJSON features', () => {
    const row = { bin: '3', height_roof: '60', the_geom: JSON.stringify({ type: 'MultiPolygon', coordinates: [[ring(LAT, LON, 10, 10)]] }) };
    const coords = ShadeGeometry.extractCoords(row);
    assert(coords && coords.length === 5, 'the_geom string parsed');
  });

  it('sizes street-tree crowns from trunk diameter', () => {
    const o = ShadeGeometry.makeOrigin(LAT, LON, 0);
    const model = { crownBaseM: 3, crownTopA: 4, crownTopB: 0.55, crownTopMaxM: 22, radiusA: 1.2, radiusB: 0.3, radiusMaxM: 8 };
    const trees = ShadeGeometry.projectTrees([
      { location: { coordinates: [LON, LAT - 20 / 111320] }, dbh: '10' },
      { location: { coordinates: [LON, LAT] }, dbh: '60' },
    ], o, model);
    near(trees[0].z, 20, 0.1, 'tree 20 m south');
    near(trees[0].crownTop, 9.5, 0.01, 'crown top for 10 in DBH');
    near(trees[0].radius, 4.2, 0.01, 'crown radius for 10 in DBH');
    near(trees[1].crownTop, 22, 0.01, 'crown top capped');
    near(trees[1].radius, 8, 0.01, 'radius capped');
  });
});

describe('Canonical canyons', () => {
  it('puts the opposite row across the street in the facing direction', () => {
    const c = ShadeGeometry.canonicalCanyon('some', { streetM: 18, oppositeM: 24 }, { azimuthDeg: 180, totalFloors: 6, storeyM: 3 });
    near(c.target.heightMeters, 18, 0.01, 'own height from floors');
    assert(c.neighbors.length === 1, 'one opposite row');
    assert(c.neighbors[0].centroid.z > 20, 'south-facing balcony: opposite row is to the south (+z)');
    const nearestZ = Math.min(...c.neighbors[0].localCoords.map(p => p.z));
    near(nearestZ - 8, 18, 0.01, 'street width between the facades');
    near(c.neighbors[0].heightMeters, 24, 0.01, 'opposite height');
  });

  it('rotates with the facing direction and has no neighbours for an open site', () => {
    const e = ShadeGeometry.canonicalCanyon('some', { streetM: 18, oppositeM: 24 }, { azimuthDeg: 90, totalFloors: 6 });
    assert(e.neighbors[0].centroid.x > 20 && Math.abs(e.neighbors[0].centroid.z) < 0.01, 'east-facing: opposite row is to the east');
    const open = ShadeGeometry.canonicalCanyon('open', null, { azimuthDeg: 180, totalFloors: 6 });
    assert(open.neighbors.length === 0, 'open site has no opposite row');
  });
});

describe('Socrata helpers', () => {
  it('builds a closed WKT polygon about 200 m across for intersects()', () => {
    const wkt = circleWkt(LAT, LON, 200);
    assert(/^POLYGON\(\(/.test(wkt) && /\)\)$/.test(wkt), 'WKT polygon syntax');
    const pts = wkt.slice(9, -2).split(',').map(p => p.trim().split(' ').map(Number));
    assert(pts.length === 33 && pts[0][0] === pts[32][0] && pts[0][1] === pts[32][1], 'closed 32-gon');
    const north = pts[0];
    near((north[1] - LAT) * 111320, 200, 1, 'radius 200 m');
  });

  it('labels any azimuth with the nearest compass point', () => {
    assert(directionLabel(209) === 'Southwest', '209 -> Southwest');
    assert(directionLabel(29) === 'Northeast', '29 -> Northeast');
    assert(directionLabel(359) === 'North', '359 -> North');
  });
});
