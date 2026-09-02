# -*- coding: utf-8 -*-
"""A sample Long Island City block for the fork to render.

NYC Open Data is unreachable from this environment, so real building footprints
could not be fetched. These lots are SYNTHETIC: a rotated street grid with
plausible NYC massing. The shadow trace, the sun positions and the energy model
that run against them are the site's own code, unchanged.
"""
import json, math

LAT0, LON0 = 40.74470, -73.94850          # Long Island City
THETA = math.radians(29.0)                 # the grid's rotation
MPD_LAT = 111320.0
MPD_LON = 111320.0 * math.cos(math.radians(LAT0))

def ll(u, v):
    """local metres (u east-ish, v north-ish, pre-rotation) -> [lon, lat]"""
    x = u * math.cos(THETA) - v * math.sin(THETA)
    y = u * math.sin(THETA) + v * math.cos(THETA)
    return [round(LON0 + x / MPD_LON, 7), round(LAT0 + y / MPD_LAT, 7)]

def lot(cu, cv, w, d):
    return [ll(cu - w/2, cv - d/2), ll(cu + w/2, cv - d/2),
            ll(cu + w/2, cv + d/2), ll(cu - w/2, cv + d/2), ll(cu - w/2, cv - d/2)]

def feature(ring, bin_, ft, elev=12):
    return {"type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [ring]},
            "properties": {"bin": str(bin_), "height_roof": ft, "ground_elevation": elev}}

BLOCK_U, BLOCK_V = 190.0, 78.0             # block footprint
STREET_U, STREET_V = 26.0, 20.0            # street widths
LOTS_U, LOTS_V = 5, 2

feats, n = [], 4000000
target = None
for bi in range(-2, 3):
    for bj in range(-3, 4):
        bu = bi * (BLOCK_U + STREET_U)
        bv = bj * (BLOCK_V + STREET_V)
        lw, ld = BLOCK_U / LOTS_U, BLOCK_V / LOTS_V
        for li in range(LOTS_U):
            for lj in range(LOTS_V):
                cu = bu - BLOCK_U/2 + lw * (li + 0.5)
                cv = bv - BLOCK_V/2 + ld * (lj + 0.5)
                if math.hypot(cu, cv) > 230:            # the model's 200m neighbourhood
                    continue
                # massing: taller to the south and west, low-rise to the north-east
                base = 42 + 34 * math.sin(li * 1.7 + lj * 2.3 + bi * 0.9 + bj * 1.4) ** 2
                grade = max(0.0, (-cv + 120) / 320)
                ft = round(base + 250 * grade * (0.35 + 0.65 * abs(math.sin(bi * 2.1 + lj * 1.3))))
                ft = max(28, min(430, ft))
                n += 1
                f = feature(lot(cu, cv, lw - 7, ld - 7), n, ft)
                f["properties"]["_d"] = round(math.hypot(cu, cv))
                feats.append(f)

# three buildings to stand in for address search: a tower, a mid-rise and a walk-up,
# all near the middle of the block so the neighbourhood around them is dense
near = sorted(feats, key=lambda f: f["properties"]["_d"])[:26]
tall = max(near, key=lambda f: f["properties"]["height_roof"])
low  = min(near, key=lambda f: f["properties"]["height_roof"])
mids = sorted(near, key=lambda f: abs(f["properties"]["height_roof"] - 150))
mid  = next(f for f in mids if f is not tall and f is not low)
tall["properties"]["height_roof"] = 289

def addr(label, f, floors):
    return {"label": label, "bin": f["properties"]["bin"],
            "floors": floors, "heightroof": f["properties"]["height_roof"]}

out = {
  "features": feats,
  "addresses": [
    addr("A tower on Vernon Blvd", tall, 28),
    addr("A mid-rise on Jackson Ave", mid, round(mid["properties"]["height_roof"] / 10.5)),
    addr("A walk-up on 44th Drive", low, max(3, round(low["properties"]["height_roof"] / 10.5))),
  ],
  "meta": {"lat": LAT0, "lon": LON0, "groundelev": 12},
}
json.dump(out, open("block.json", "w"))
hs = sorted(f["properties"]["height_roof"] for f in feats)
print(f"{len(feats)} buildings · heights {hs[0]}-{hs[-1]} ft "
      f"(median {hs[len(hs)//2]}) · {len(json.dumps(out))/1024:.0f}KB")
