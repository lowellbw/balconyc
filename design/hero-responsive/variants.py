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


# The narrow-screen block as it ships (after the sun fix), and three
# replacements for it. These are independent of the desktop choice above:
# each is applied on top of B.
NARROW = """    @media (max-width: 1024px) {
      .hero:not(.has-scene) {
        align-items: flex-start;
        min-height: auto;
        padding-top: 120px;
        padding-bottom: calc(min(58vw, 520px) + 62px);
      }
      .hero-city {
        right: -8%; left: auto; top: auto; bottom: 0;
        width: min(58vw, 520px); height: min(58vw, 520px);
        aspect-ratio: auto;
      }"""
NARROW_SCRIM = """      .hero-scrim { background:
        linear-gradient(180deg, var(--bg) 0%, var(--bg) 26%, rgba(255,255,255,0) 56%),
        linear-gradient(0deg, var(--bg) 0%, rgba(255,255,255,0) 8%); }"""
NO_SCRIM = """      .hero-scrim { background: none; }"""

NARROW_VARIANTS = {
    # N1 — the whole city fully behind the copy, contained and pale. 0.09 is
    #      not a taste call: at 0.18 the grey subhead drops under 4.5:1.
    "N1": """    @media (max-width: 1024px) {
      .hero:not(.has-scene) { align-items: center; min-height: 86vh; padding: 130px 0 56px; }
      .hero-city {
        left: 0; right: 0; top: 104px; bottom: 24px;
        width: 100%; height: auto; aspect-ratio: auto; opacity: 0.09;
      }
      .hero-sun { opacity: 0.5; }
      .hero-clock { display: none; }""",
    # N2 — the city shrinks to a mark above the copy. padding-top has to clear
    #      the whole motif; at 0.86 of it the frame clipped the copy at 768.
    "N2": """    @media (max-width: 1024px) {
      .hero:not(.has-scene) {
        align-items: flex-start; min-height: auto;
        --motif: clamp(120px, 26vw, 240px);
        padding-top: calc(100px + var(--motif) + 36px);
        padding-bottom: 64px;
      }
      .hero-city {
        right: clamp(20px, 5vw, 48px); left: auto; top: 100px; bottom: auto;
        width: var(--motif, 160px); height: var(--motif, 160px);
        aspect-ratio: auto;
      }
      .hero-sun { transform: scale(0.5); transform-origin: 50% 24%; }
      .hero-clock { display: none; }""",
    # N3 — the city crops to a horizon band along the bottom.
    "N3": """    @media (max-width: 1024px) {
      .hero:not(.has-scene) {
        align-items: flex-start; min-height: auto;
        padding-top: 120px; padding-bottom: calc(clamp(150px, 30vw, 260px) + 40px);
      }
      .hero-city {
        left: 0; right: 0; top: auto; bottom: 0;
        width: 100%; height: clamp(150px, 30vw, 260px);
        aspect-ratio: auto; overflow: hidden;
      }
      .hero-city svg { position: absolute; left: 50%; bottom: -4%;
        width: 116%; height: auto; transform: translateX(-50%); }
      .hero-clock { display: none; }""",
}


def build():
    src = io.open(ROOT / "index.html", encoding="utf-8").read()
    for rule in (CITY, SCRIM, GAP_OLD):
        assert rule in src, f"index.html no longer contains:\n{rule}"
    OUT.mkdir(parents=True, exist_ok=True)
    # a <base> so the variants under build/ still resolve the site's own assets
    base = f'<meta charset="UTF-8">\n  <base href="file://{ROOT}/">'
    (OUT / "CUR.html").write_text(src.replace('<meta charset="UTF-8">', base, 1), encoding="utf-8")
    built = {}
    for key, (city, scrim) in VARIANTS.items():
        s = src.replace(CITY, city, 1).replace(SCRIM, scrim, 1).replace(GAP_OLD, GAP_NEW, 1)
        built[key] = s
        (OUT / f"{key}.html").write_text(s.replace('<meta charset="UTF-8">', base, 1), encoding="utf-8")

    # the narrow directions ride on top of B, whose desktop rules they leave alone
    for rule in (NARROW, NARROW_SCRIM):
        assert rule in built["B"], f"B no longer contains:\n{rule}"
    for key, block in NARROW_VARIANTS.items():
        s = built["B"].replace(NARROW, block, 1).replace(NARROW_SCRIM, NO_SCRIM, 1)
        (OUT / f"{key}.html").write_text(s.replace('<meta charset="UTF-8">', base, 1), encoding="utf-8")

    print(f"built CUR, {', '.join(VARIANTS)}, {', '.join(NARROW_VARIANTS)} in {OUT}")


if __name__ == "__main__":
    build()
