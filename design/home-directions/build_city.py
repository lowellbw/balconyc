import math
from rasterize import build

land, cols, rows = build()

# openness: share of the sky around a block that is not more city.
# Derived from the real coastline, so waterfront blocks come out brighter.
R = 5
disc = [(dx, dy) for dy in range(-R, R + 1) for dx in range(-R, R + 1)
        if dx * dx + dy * dy <= R * R]
raw = {}
for j in range(rows):
    for i in range(cols):
        if not land[j][i]:
            continue
        n = sum(1 for dx, dy in disc
                if not (0 <= i + dx < cols and 0 <= j + dy < rows and land[j + dy][i + dx]))
        raw[(i, j)] = (n / len(disc)
                       + 0.085 * math.sin(i * 0.31 + j * 0.19)
                       + 0.065 * math.sin(i * 0.13 - j * 0.41)
                       + 0.04 * math.sin(i * 0.77 + j * 0.61))

SHARE = [0.29, 0.23, 0.18, 0.14, 0.10, 0.06]     # shadow-heavy, sun on the edges
RAMP  = ["#37312A", "#473E33", "#5E4E3A", "#8E6E2E", "#C4911E", "#F5A00B"]

order = sorted(raw.items(), key=lambda kv: kv[1])
cells, at, k = {}, 0.0, 0
for idx, ((i, j), _) in enumerate(order):
    while k < len(SHARE) - 1 and idx >= at + SHARE[k] * len(order):
        at += SHARE[k] * len(order); k += 1
    cells[(i, j)] = k

PITCH, BLOCK = 10, 8
groups = "".join(
    '<path fill="%s" d="%s"/>' % (RAMP[l], "".join(
        f"M{i*PITCH} {j*PITCH}h{BLOCK}v{BLOCK}h-{BLOCK}z"
        for (i, j), ll in cells.items() if ll == l))
    for l in range(len(RAMP)))
CITY_SVG = (f'<svg viewBox="0 0 {cols*PITCH} {rows*PITCH}" width="100%" height="100%" '
            f'preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges" '
            f'aria-hidden="true">{groups}</svg>')

if __name__ == "__main__":
    open("city.svg.frag", "w").write(CITY_SVG)
    print(f"{len(cells)} blocks, {len(CITY_SVG)/1024:.0f}KB")
