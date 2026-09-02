"""Generate js/city-hero.js — the block map behind the home page hero.

Rasterises the five boroughs from their published boundaries into a square
grid, assigns each block a "catch" tier (how far from the sun it stays lit),
and writes the whole thing out as one self-contained script.

Resolution is a legibility decision. Coarse grids close the Harlem and East
Rivers, fusing Manhattan to the Bronx and Queens so the map reads as one
blob; fine grids open them but shrink the blocks until the thing stops
looking like blocks. Rather than trade one off against the other, the
shoreline is carved (see `island` below) so Manhattan separates at a
resolution coarse enough to keep the squares chunky.

    python3 build_city_hero.py        # rewrites ../../js/city-hero.js

Input is nyc.geojson beside this file: the five borough boundaries as
MultiPolygons in CRS84, from NYC Open Data's Borough Boundaries dataset
(Department of City Planning — BoroCode / BoroName / Shape_Leng /
Shape_Area). It is committed rather than fetched, so the map stays
rebuildable from a clean checkout; it was previously gitignored, which
left the generator runnable only on the machine that had downloaded it.
"""
import hashlib, math, pathlib, re
from citymap import grid

COLS = 48
PITCH, GAP = 10.0, 0.14                     # flat square tiles, 14% gutter
SHADES = ["#E46740", "#C2452A", "#A85643", "#C8A9A1", "#D2C3BF"]
BOUNDS = [0.24, 0.43, 0.64, 0.90]           # hard bands: light is banded, not smooth
SHARE  = [0.13, 0.19, 0.24, 0.22, 0.15, 0.07]
# as fractions of the city's own width, so the light behaves the same at any
# block size
RADIUS_RATIOS = [0.52, 0.75, 1.02, 1.32, 1.71, 2.17]

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "js" / "city-hero.js"
PAGE = ROOT / "index.html"


def island(cells, boro="Manhattan"):
    """Open the water around Manhattan, at the neighbours' expense.

    Manhattan really is an island, but at this grid the Harlem and East
    Rivers are narrower than one block, so the rasteriser fuses it to the
    Bronx and Queens. The channel has to come from somewhere, and it must
    not come from Manhattan: it averages three cells wide, so taking a cell
    off each shore costs a third of its width and both its tips. An earlier
    version did exactly that, and Manhattan read as a sliver.

    So only the neighbouring borough gives ground. Manhattan keeps every
    block the boundaries put there — about 3 wide by 21 tall, against a real
    3.7km by 21km, so the proportions stay honest.

    The blocks this drops are real city the map no longer draws. It is a
    decorative map — the shading is the sun's position, not data — so the
    trade is fair. It would not be if anything were measured off it.
    """
    out = {}
    for (i, j), b in cells.items():
        if b != boro:
            abuts = any(cells.get((i + di, j + dj)) == boro
                        for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            if abuts:
                continue
        out[(i, j)] = b
    return out


def rough(i, j):
    """Smooth noise, so tiers vary block to block without looking random."""
    return (0.60 * math.sin(i * 2.13 + j * 1.71)
            + 0.44 * math.sin(i * 1.29 - j * 2.44)
            + 0.30 * math.sin(i * 0.37 + j * 0.53)
            + 0.22 * math.sin(i * 3.71 - j * 0.91))


def build():
    cells, C, R = grid(COLS)
    cells = island(cells)
    block = round(PITCH * (1 - GAP), 2)
    vw, vh = C * PITCH, R * PITCH
    radii = [round(vw * r) for r in RADIUS_RATIOS]

    order = sorted(cells, key=lambda k: rough(*k))
    tier, at, k = {}, 0.0, 0
    for idx, key in enumerate(order):
        while k < len(SHARE) - 1 and idx >= at + SHARE[k] * len(order):
            at += SHARE[k] * len(order); k += 1
        tier[key] = k

    packed = ",".join(f"[{i},{j},{tier[(i, j)]}]" for (i, j) in sorted(cells))
    src = TEMPLATE.format(
        cols=C, rows=R, pitch=int(PITCH), block=block, vw=int(vw), vh=int(vh),
        shades=str(SHADES).replace("'", '"'), radii=radii, bounds=BOUNDS,
        cells=packed, n=len(cells))
    OUT.write_text(src, encoding="utf-8")
    stamp = fingerprint(src)
    print(f"wrote {OUT.relative_to(OUT.parents[1])}: "
          f"{len(cells)} blocks, grid {C}x{R}, {len(src)/1024:.0f}KB, ?v={stamp}")


def fingerprint(src):
    """Stamp the script's content hash into the page's <script src>.

    js/ is cached for 10 minutes and the file name never changes, while the
    HTML is max-age=0. So for ten minutes after a deploy the browser pairs a
    fresh page with the previous map — which looks exactly like the deploy
    not having happened. The hash in the query makes each build its own URL.
    """
    stamp = hashlib.sha256(src.encode("utf-8")).hexdigest()[:8]
    page = PAGE.read_text(encoding="utf-8")
    new, n = re.subn(r'src="js/city-hero\.js(?:\?v=[0-9a-f]+)?"',
                     f'src="js/city-hero.js?v={stamp}"', page)
    assert n == 1, f"expected one city-hero.js script tag, found {n}"
    if new != page:
        PAGE.write_text(new, encoding="utf-8")
    return stamp


TEMPLATE = '''// ============================================================
// balco.nyc — the city-of-blocks hero.
//
// Every square is a block of the five boroughs, rasterised from the city's
// published borough boundaries. Each takes one of five shades of the brand
// red depending on how far it sits from the sun, and the sun follows the
// cursor across the sky. The map is north-up, so the right side is east and
// morning, the left is west and evening.
//
// The shading is light, not data: it is the sun's position, not any block's
// modelled output.
//
// The Harlem and East Rivers are narrower than one block at this grid, so
// the blocks on the FAR shore are dropped to open them — Manhattan itself
// keeps every block it has. A deliberate liberty; the map is decorative and
// nothing is measured off it.
//
// Generated by design/home-directions/build_city_hero.py — {n} blocks at
// {cols} columns. Do not hand-edit; change the generator and re-run it.
// ============================================================
(function () {{
  var COLS = {cols}, ROWS = {rows}, PITCH = {pitch}, BLOCK = {block};
  var VW = {vw}, VH = {vh};
  var SHADES = {shades};
  var RADII = {radii};
  var BOUNDS = {bounds};
  var CELLS = [{cells}];

  var host = document.getElementById('heroCity');
  if (!host) return;

  var NS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + VW + ' ' + VH);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('aria-hidden', 'true');

  var blocks = [];
  for (var n = 0; n < CELLS.length; n++) {{
    var c = CELLS[n];
    var r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', c[0] * PITCH);
    r.setAttribute('y', c[1] * PITCH);
    r.setAttribute('width', BLOCK);
    r.setAttribute('height', BLOCK);
    r.setAttribute('fill', SHADES[SHADES.length - 1]);
    svg.appendChild(r);
    blocks.push({{ el: r, band: -1,
      x: c[0] * PITCH + BLOCK / 2, y: c[1] * PITCH + BLOCK / 2, r: RADII[c[2]] }});
  }}
  host.appendChild(svg);

  var sun = document.getElementById('heroSun');
  var clock = document.getElementById('heroClock');
  var hero = document.getElementById('heroSection');
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var t = 0.46, target = 0.46, phase = Math.asin((0.46 - 0.5) / 0.46);
  var idle = true, lastMove = 0, frame = null;

  if (hero) {{
    hero.addEventListener('mousemove', function (e) {{
      var box = hero.getBoundingClientRect();
      if (!box.width) return;
      target = Math.max(0, Math.min(1, (e.clientX - box.left) / box.width));
      idle = false; lastMove = Date.now();
    }});
    hero.addEventListener('mouseleave', function () {{ lastMove = Date.now(); }});
  }}

  function paint() {{
    var box = host.getBoundingClientRect();
    if (!box.width) return;
    // The sun rides a shallow arc across the top of the map, in the map's own
    // coordinates. It sits far enough down that it clears the nav even when
    // the map is tall, and stays above the city.
    var ax = 0.30 + t * 0.58;
    var ay = 0.050 + 0.062 * (1 - Math.sqrt(Math.max(0, 1 - Math.pow(2 * t - 1, 2))));
    var sx = ax * VW, sy = ay * VH;
    for (var i = 0; i < blocks.length; i++) {{
      var b = blocks[i];
      var dx = b.x - sx, dy = b.y - sy;
      var d = Math.sqrt(dx * dx + dy * dy) / b.r;
      var band = 0;
      while (band < BOUNDS.length && d >= BOUNDS[band]) band++;
      if (band !== b.band) {{ b.band = band; b.el.setAttribute('fill', SHADES[band]); }}
    }}
    if (sun) {{
      var px = box.left + ax * box.width, py = box.top + ay * box.height;
      var hostBox = host.offsetParent ? host.offsetParent.getBoundingClientRect() : box;
      sun.style.left = (px - hostBox.left) + 'px';
      sun.style.top = (py - hostBox.top) + 'px';
    }}
    if (clock) {{
      var mins = Math.round((18 - t * 12) * 60);
      var h = Math.floor(mins / 60), m = mins % 60;
      clock.textContent = (h % 12 || 12) + ':' + (m < 10 ? '0' + m : m) + ' ' + (h >= 12 ? 'PM' : 'AM');
    }}
  }}

  function tick() {{
    frame = requestAnimationFrame(tick);
    if (!idle && Date.now() - lastMove > 2400) idle = true;
    if (idle && !reduced) {{ phase += 0.0021; target = 0.5 + 0.46 * Math.sin(phase); }}
    t += (target - t) * 0.09;
    paint();
  }}

  paint();
  if (!reduced) tick(); else paint();

  // the scene takes over once an address resolves; stop burning frames then
  window.addEventListener('balco:sceneopen', function () {{
    if (frame) {{ cancelAnimationFrame(frame); frame = null; }}
  }});
  window.addEventListener('balco:scenereset', function () {{
    if (!frame && !reduced) tick();
  }});
}})();
'''

if __name__ == "__main__":
    build()
