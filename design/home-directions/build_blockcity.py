# -*- coding: utf-8 -*-
"""The dark 'Block City' home page: the map as the page's own background.

NOTE ON ITS SHADING: blocks are tinted by how open each block's sky is, computed
from the coastline. That is a real consequence of the geometry but it is NOT
output from the site's model, and the legend says so. The white Gov versions
drop the tint entirely for that reason. Kept for comparison.
"""
import math
from citymap import grid, PITCH, BLOCK

COLS = 116
CELLS, C, R = grid(COLS)

RADIUS = 5
DISC = [(dx, dy) for dy in range(-RADIUS, RADIUS + 1) for dx in range(-RADIUS, RADIUS + 1)
        if dx * dx + dy * dy <= RADIUS * RADIUS]
raw = {}
for (i, j) in CELLS:
    n = sum(1 for dx, dy in DISC if (i + dx, j + dy) not in CELLS)
    raw[(i, j)] = (n / len(DISC)
                   + 0.085 * math.sin(i * 0.31 + j * 0.19)
                   + 0.065 * math.sin(i * 0.13 - j * 0.41)
                   + 0.040 * math.sin(i * 0.77 + j * 0.61))

SHARE = [0.29, 0.23, 0.18, 0.14, 0.10, 0.06]
RAMP  = ["#37312A", "#473E33", "#5E4E3A", "#8E6E2E", "#C4911E", "#F5A00B"]
order = sorted(raw.items(), key=lambda kv: kv[1])
lvl, at, k = {}, 0.0, 0
for idx, (key, _) in enumerate(order):
    while k < len(SHARE) - 1 and idx >= at + SHARE[k] * len(order):
        at += SHARE[k] * len(order); k += 1
    lvl[key] = k

paths = "".join(
    '<path fill="%s" d="%s"/>' % (RAMP[l], "".join(
        f"M{i*PITCH} {j*PITCH}h{BLOCK}v{BLOCK}h-{BLOCK}z"
        for (i, j), ll in lvl.items() if ll == l))
    for l in range(len(RAMP)))
CITY = (f'<svg viewBox="0 0 {C*PITCH} {R*PITCH}" width="100%" height="100%" '
        f'preserveAspectRatio="xMidYMid meet" aria-hidden="true">{paths}</svg>')

TPL = open("BlockCity.template.html").read()
open("BlockCity.dc.html", "w").write(TPL.replace("__CITY__", CITY))
print(f"BlockCity.dc.html rebuilt · {len(CELLS)} blocks")
