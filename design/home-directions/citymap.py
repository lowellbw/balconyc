"""NYC as blocks, from the real borough boundaries, as one inline SVG.

Resolution is a display decision: each block needs ~5 rendered pixels or the
gaps alias into stripes, so pick `cols` to suit the size the map is drawn at.
"""
from functools import lru_cache
from rasterize import build

PITCH, BLOCK = 10, 8

# validated with the dataviz palette checker on a light surface: six of six pass
BOROUGH_COLORS = {
    "Manhattan":     "#3B72C4",
    "Brooklyn":      "#C4552F",
    "Queens":        "#1E8A66",
    "Bronx":         "#9455C7",
    "Staten Island": "#A2790E",
}

@lru_cache(maxsize=None)
def grid(cols):
    return build(cols)

def _svg(cols, color_of):
    cells, C, R = grid(cols)
    by = {}
    for (i, j), boro in cells.items():
        by.setdefault(color_of(boro), []).append(
            f"M{i*PITCH} {j*PITCH}h{BLOCK}v{BLOCK}h-{BLOCK}z")
    paths = "".join(f'<path fill="{c}" d="{"".join(d)}"/>' for c, d in by.items())
    return (f'<svg viewBox="0 0 {C*PITCH} {R*PITCH}" width="100%" height="100%" '
            f'preserveAspectRatio="xMidYMid meet" aria-hidden="true">{paths}</svg>')

def mono(color, cols=112):
    return _svg(cols, lambda b: color)

def boroughs(cols=112):
    return _svg(cols, lambda b: BOROUGH_COLORS[b])

def count(cols=112):
    return len(grid(cols)[0])

if __name__ == "__main__":
    for c in (100, 112, 128, 168):
        print(f"cols={c}: {count(c)} blocks, mono {len(mono('#000', c))/1024:.0f}KB")
