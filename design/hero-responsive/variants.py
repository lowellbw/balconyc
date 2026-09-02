"""Build the three candidate fixes as real edits to the real index.html.

Nothing here is a mock-up: each variant is the shipping page with one CSS
rule swapped, so measure.py is measuring the actual browser result.
"""
import io, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT  = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path("build")

# The two rules as they ship today.
CITY = """    .hero-city { position: absolute; right: 2%; top: 13%; height: 82%; aspect-ratio: 1 / 1; pointer-events: none; }"""
SCRIM = """    .hero-scrim { position: absolute; inset: 0; pointer-events: none;
      background: linear-gradient(90deg, var(--bg) 0%, var(--bg) 16%, rgba(255,255,255,0) 54%), linear-gradient(0deg, var(--bg) 0%, rgba(255,255,255,0) 12%); }"""

# Where the copy column actually ends: the container is centred, max 1360px,
# with a 40px gutter and a 680px content column.
EDGE = "calc(max((100% - 1360px) / 2, 0px) + 40px + 680px)"

# The sun rides ~38px above the map's top edge, so the narrow-screen gap has
# to clear the sun, not just the blocks.
GAP_OLD = "padding-bottom: calc(min(58vw, 520px) + 14px);"
GAP_NEW = "padding-bottom: calc(min(58vw, 520px) + 62px);"

VARIANTS = {
    # A — the map gets its own column. Overlap impossible by construction.
    "A": ("""    .hero-city { position: absolute; left: calc(""" + EDGE + """ + 24px); right: 2%; top: 13%;
      height: auto; aspect-ratio: 1 / 1; max-height: 88%; pointer-events: none; }""", SCRIM),
    # B — map untouched; the scrim stays opaque to where the copy really ends.
    "B": (CITY, """    .hero-scrim { position: absolute; inset: 0; pointer-events: none;
      background: linear-gradient(90deg, var(--bg) 0%, var(--bg) """ + EDGE + """, rgba(255,255,255,0) calc(""" + EDGE + """ + 220px)), linear-gradient(0deg, var(--bg) 0%, rgba(255,255,255,0) 12%); }"""),
    # C — no scrim band; the map dissolves on its own left edge.
    "C": ("""    .hero-city { position: absolute; right: 2%; top: 13%; height: 82%; aspect-ratio: 1 / 1; pointer-events: none;
      -webkit-mask-image: linear-gradient(90deg, transparent 4%, #000 42%);
      mask-image: linear-gradient(90deg, transparent 4%, #000 42%); }""",
          """    .hero-scrim { position: absolute; inset: 0; pointer-events: none;
      background: linear-gradient(0deg, var(--bg) 0%, rgba(255,255,255,0) 12%); }"""),
}


def build():
    src = io.open(ROOT / "index.html", encoding="utf-8").read()
    for rule in (CITY, SCRIM, GAP_OLD):
        assert rule in src, f"index.html no longer contains:\n{rule}"
    OUT.mkdir(parents=True, exist_ok=True)
    # a <base> so the variants under build/ still resolve the site's own assets
    base = f'<meta charset="UTF-8">\n  <base href="file://{ROOT}/">'
    (OUT / "CUR.html").write_text(src.replace('<meta charset="UTF-8">', base, 1), encoding="utf-8")
    for key, (city, scrim) in VARIANTS.items():
        s = src.replace(CITY, city, 1).replace(SCRIM, scrim, 1).replace(GAP_OLD, GAP_NEW, 1)
        (OUT / f"{key}.html").write_text(s.replace('<meta charset="UTF-8">', base, 1), encoding="utf-8")
    print(f"built CUR, {', '.join(VARIANTS)} in {OUT}")


if __name__ == "__main__":
    build()
