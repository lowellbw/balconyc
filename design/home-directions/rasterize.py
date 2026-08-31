import json, math

COLS = 168

def build(cols=COLS):
    """Rasterise NYC into a square block grid, tagging each block with its borough.
    Square ground cells: a rectangular cell would imply a street orientation that
    is only correct in part of Manhattan."""
    d = json.load(open("nyc.geojson"))
    feats = []
    for f in d["features"]:
        rings = [[(p[0], p[1]) for p in ring]
                 for poly in f["geometry"]["coordinates"] for ring in poly]
        feats.append((f["properties"]["BoroName"], rings))

    allpts = [p for _, rs in feats for r in rs for p in r]
    lon0, lon1 = min(p[0] for p in allpts), max(p[0] for p in allpts)
    lat0, lat1 = min(p[1] for p in allpts), max(p[1] for p in allpts)
    k = math.cos(math.radians((lat0 + lat1) / 2))
    step = (lon1 - lon0) * k / cols
    rows = int(round((lat1 - lat0) / step))

    cells = {}
    for boro, rings in feats:
        edges = []
        for r in rings:
            pts = [((lon - lon0) * k / step, (lat1 - lat) / step) for lon, lat in r]
            edges += [(pts[i], pts[i + 1]) for i in range(len(pts) - 1)]
        for j in range(rows):
            yc = j + 0.5
            xs = sorted(x1 + (yc - y1) * (x2 - x1) / (y2 - y1)
                        for (x1, y1), (x2, y2) in edges
                        if (y1 <= yc < y2) or (y2 <= yc < y1))
            for a, b in zip(xs[0::2], xs[1::2]):
                for i in range(max(0, int(math.ceil(a - 0.5))), min(cols, int(b + 0.5))):
                    cells[(i, j)] = boro
    return cells, cols, rows

if __name__ == "__main__":
    cells, cols, rows = build()
    from collections import Counter
    print(f"grid {cols}x{rows}, {len(cells)} blocks")
    for b, n in Counter(cells.values()).most_common():
        print(f"  {b:<14} {n:>5}")
