"""Check the shipped hero copy is readable at every window size.

Geometry cannot answer this: the scrim changes what is PAINTED without
moving anything. So hide the copy, photograph what is behind it, and report
the worst contrast that background makes against the grey subhead
(--text-sub, #596580). WCAG AA for body text is 4.5:1.

This measures index.html as it stands. Run it after touching the hero.
Exits non-zero if any size drops below AA.

It is how both original faults were found, and neither was visible by eye:
  - tall desktop windows put map blocks under the headline, because the map
    is sized from the hero's HEIGHT (82% + aspect-ratio 1/1)
  - narrow screens put the SUN over the bottom-right of the address field
and how two values in the fix were set: the wash's 0.09 opacity (0.18
failed everywhere) and the desktop scrim's --copy-edge.

The option comparison that chose them is in design/hero-responsive/ as a
canvas, and in git history at 137f02b.
"""
import io as _io, pathlib, sys, tempfile
from playwright.sync_api import sync_playwright
from PIL import Image

CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
ROOT = pathlib.Path(__file__).resolve().parents[2]
AA = 4.5
SUBHEAD = (0x59, 0x65, 0x80)

SIZES = [(360,780),(390,844),(430,932),(600,900),(768,1024),(834,1194),(1024,1366),
         (1280,800),(1280,1024),(1366,768),(1440,900),(1440,1200),(1440,1440),
         (1512,982),(1680,1050),(1728,1117),(1920,1080),(1920,1440),(2560,1440)]

def _lum(c):
    f = lambda v: (v/255/12.92) if v/255 <= 0.03928 else (((v/255+0.055)/1.055)**2.4)
    return 0.2126*f(c[0]) + 0.7152*f(c[1]) + 0.0722*f(c[2])

_TL = _lum(SUBHEAD)

def contrast(bg):
    bl = _lum(bg); hi, lo = max(_TL, bl), min(_TL, bl)
    return (hi + 0.05) / (lo + 0.05)

BOX = """() => { const r = document.getElementById('heroContent').getBoundingClientRect();
  return {x: Math.floor(r.left), y: Math.floor(r.top),
          width: Math.ceil(r.width), height: Math.ceil(r.height)}; }"""

# .hero-content carries `transition: all 0.7s`, which animates visibility too,
# so the transition has to go first or the copy is still painted in the capture.
HIDE = """() => { const el = document.getElementById('heroContent');
  el.style.transition = 'none'; el.style.visibility = 'hidden';
  return getComputedStyle(el).visibility; }"""


def page_url(tmp):
    """index.html with a <base>, so it resolves its own assets from anywhere."""
    src = (ROOT / "index.html").read_text(encoding="utf-8")
    assert '<meta charset="UTF-8">' in src
    out = pathlib.Path(tmp) / "index.html"
    out.write_text(src.replace('<meta charset="UTF-8">',
                   f'<meta charset="UTF-8">\n  <base href="file://{ROOT}/">', 1), encoding="utf-8")
    return f"file://{out}"


def main():
    fails = []
    with tempfile.TemporaryDirectory() as tmp:
        url = page_url(tmp)
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path=CHROME,
                                   args=["--use-gl=swiftshader", "--allow-file-access-from-files"])
            ctx = b.new_context()
            ctx.route("**google*.com**", lambda r: r.abort())   # no egress for fonts here
            print(f"worst contrast of the hero copy against what is behind it (AA = {AA}:1)\n")
            for w, h in SIZES:
                pg = ctx.new_page(); pg.set_viewport_size({"width": w, "height": h})
                pg.goto(url); pg.wait_for_timeout(600)
                box = pg.evaluate(BOX)
                assert pg.evaluate(HIDE) == "hidden", "copy still visible"
                pg.wait_for_timeout(100)
                im = Image.open(_io.BytesIO(pg.screenshot(clip=box))).convert("RGB")
                pg.close()
                worst = min(contrast(c) for c in im.getdata())
                if worst < AA: fails.append(f"{w}x{h}")
                print(f"  {w}x{h:<6} {worst:4.1f}  {'FAIL' if worst < AA else 'ok'}")
            b.close()
    print()
    if fails:
        print(f"FAILED at {len(fails)}/{len(SIZES)}: {', '.join(fails)}")
        return 1
    print(f"all {len(SIZES)} sizes clear {AA}:1")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
