"""Measure whether the hero copy is actually readable, at every window size.

Not geometry: geometry says nothing about a scrim or a mask. This hides the
copy, photographs what is painted behind it, and reports the worst contrast
ratio any pixel of that background makes against the grey subhead. WCAG AA
for body text is 4.5:1.

Two faults it found in the shipping page:
  - tall desktop windows put map blocks under the headline and subhead,
    because the map is sized from the hero's HEIGHT (82% + aspect-ratio 1/1)
  - narrow screens put the SUN over the bottom-right of the address field
"""
import io as _io, pathlib, sys
from playwright.sync_api import sync_playwright
from PIL import Image

CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
BUILD  = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path("build")
SUBHEAD = (0x59, 0x65, 0x80)   # --text-sub
AA = 4.5

SIZES = [(390,844),(430,932),(768,1024),(834,1194),(1024,1366),(1280,800),
         (1280,1024),(1366,768),(1440,900),(1440,1200),(1440,1440),(1512,982),
         (1680,1050),(1728,1117),(1920,1080),(1920,1440),(2560,1440)]
BUILDS = [("CUR","today"),("A","A column"),("B","B scrim"),("C","C fade")]

# The narrow-screen directions only differ below 1024px, so they get their own
# sweep. N1's opacity and N2's motif clearance were both set by this pass, not
# by eye: N1 at 0.18 and N2 with less headroom each failed here.
NARROW_SIZES = [(360,780),(390,844),(430,932),(600,900),(768,1024),(834,1194),(1024,1366)]
NARROW_BUILDS = [("B","B below"),("N1","N1 wash"),("N2","N2 motif"),("N3","N3 band")]

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

# .hero-content carries `transition: all 0.7s`, which animates visibility too —
# so the transition has to go first or the copy is still painted in the capture.
HIDE = """() => { const el = document.getElementById('heroContent');
  el.style.transition = 'none'; el.style.visibility = 'hidden';
  return getComputedStyle(el).visibility; }"""


def sweep(ctx, builds, sizes, heading):
    fails = {k: [] for k, _ in builds}
    head = f"{'size':>11} | " + " | ".join(f"{n:>13}" for _, n in builds)
    print(f"\n{heading}\n"); print(head); print("-" * len(head))
    for w, h in sizes:
        row = []
        for key, _ in builds:
            pg = ctx.new_page(); pg.set_viewport_size({"width": w, "height": h})
            pg.goto(f"file://{BUILD.resolve()}/{key}.html"); pg.wait_for_timeout(600)
            box = pg.evaluate(BOX)
            assert pg.evaluate(HIDE) == "hidden", "copy still visible"
            pg.wait_for_timeout(100)
            im = Image.open(_io.BytesIO(pg.screenshot(clip=box))).convert("RGB")
            pg.close()
            worst = min(contrast(c) for c in im.getdata())
            if worst < AA: fails[key].append(f"{w}x{h}")
            row.append(f"{worst:4.1f} {'FAIL' if worst < AA else 'ok  '}")
        print(f"{w}x{h:<6} | " + " | ".join(f"{c:>13}" for c in row))
    print()
    for key, name in builds:
        bad = fails[key]
        print(f"{name:>10}: {len(bad)}/{len(sizes)} failing" + (f"  -> {', '.join(bad)}" if bad else "  -> none"))
    return fails


def main():
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path=CHROME,
                               args=["--use-gl=swiftshader", "--allow-file-access-from-files"])
        ctx = b.new_context()
        ctx.route("**google*.com**", lambda r: r.abort())   # no egress for fonts here
        print(f"worst contrast of the hero copy against what is behind it (AA = {AA}:1)")
        wide = sweep(ctx, BUILDS, SIZES, "DESKTOP — the map/copy overlap")
        narrow = sweep(ctx, NARROW_BUILDS, NARROW_SIZES, "PHONE & TABLET — the narrow directions")
        b.close()
    bad = ([k for k in ("A", "B") if wide[k]]
           + [k for k in ("N1", "N2", "N3") if narrow[k]])
    if bad:
        print(f"\nREGRESSION: {', '.join(bad)} no longer hold")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
