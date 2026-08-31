import json, math

COLS = 116                      # blocks across the whole city
def build(cols=COLS):
    d = json.load(open("nyc.geojson"))
    rings = []
    for f in d["features"]:
        for poly in f["geometry"]["coordinates"]:
            for ring in poly:
                rings.append([(p[0], p[1]) for p in ring])

    lons = [p[0] for r in rings for p in r]; lats = [p[1] for r in rings for p in r]
    lon0, lon1, lat0, lat1 = min(lons), max(lons), min(lats), max(lats)
    k = math.cos(math.radians((lat0 + lat1) / 2))          # longitude compression

    W = (lon1 - lon0) * k
    H = (lat1 - lat0)
    step = W / cols
    rows = int(round(H / step))

    def px(lon, lat):
        return ((lon - lon0) * k / step, (lat1 - lat) / step)   # y flipped: north up

    edges = []
    for r in rings:
        pts = [px(*p) for p in r]
        for i in range(len(pts) - 1):
            edges.append((pts[i], pts[i + 1]))

    # scanline fill at each row's centre, even-odd rule
    land = [[False] * cols for _ in range(rows)]
    for j in range(rows):
        yc = j + 0.5
        xs = []
        for (x1, y1), (x2, y2) in edges:
            if (y1 <= yc < y2) or (y2 <= yc < y1):
                xs.append(x1 + (yc - y1) * (x2 - x1) / (y2 - y1))
        xs.sort()
        for a, b in zip(xs[0::2], xs[1::2]):
            for i in range(max(0, int(math.ceil(a - 0.5))), min(cols, int(b + 0.5))):
                land[j][i] = True
    return land, cols, rows

if __name__ == "__main__":
    land, cols, rows = build()
    n = sum(sum(r) for r in land)
    print(f"grid {cols}x{rows}, land cells {n} ({100*n/(cols*rows):.0f}%)")
    # coarse ASCII preview
    for j in range(0, rows, 2):
        print("".join("#" if land[j][i] else "." for i in range(0, cols, 1))[:120])
