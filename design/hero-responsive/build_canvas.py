"""Turn the measured hero geometry into design-canvas artboards.

Every number in every artboard came out of Chromium rendering the real
page at that size, so these are measurements, not drawings.
"""
import json, pathlib, html

HERE = pathlib.Path(__file__).parent
GEO  = json.loads((HERE / "hero-geometry.json").read_text(encoding="utf-8"))

SIZES = [(390,844,"Phone"), (768,1024,"Tablet"), (1280,800,"Laptop"),
         (1440,1440,"Tall desktop"), (1920,1080,"Wide desktop")]

BUILDS = [
  ("today", "Today",  "Today",  "#B91C1C"),
  ("A",     "AColumn","Option A","#7F1D1D"),
  ("B",     "BScrim", "Option B","#7F1D1D"),
  ("C",     "CFade",  "Option C","#7F1D1D"),
]

FONTS = ('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
         'family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700;9..40,900&display=swap">')

def esc(s):
    return html.escape(s, quote=True)

def artboard(build_key, w, h, label, verdict, verdict_note):
    g = GEO[f"{build_key}-{w}x{h}"]
    H = g["hero"]["h"]
    parts = []

    # the city of blocks
    c = g["city"]
    mask = f' -webkit-mask-image: {c["mask"]}; mask-image: {c["mask"]};' if c["mask"] else ""
    parts.append(
      f'<div style="position: absolute; left: {c["l"]}px; top: {c["t"]}px; '
      f'width: {c["w"]}px; height: {c["h"]}px; pointer-events: none;{mask}">{c["svg"]}</div>')

    # the warm halo around the sun
    ha = g["halo"]
    if ha["shown"]:
        parts.append(
          f'<div style="position: absolute; left: {ha["l"]}px; top: {ha["t"]}px; '
          f'width: {ha["w"]}px; height: {ha["h"]}px; pointer-events: none; '
          f'background: {ha["bg"]};"></div>')

    # the scrim that is supposed to keep the copy readable
    sc = g["scrim"]
    parts.append(
      f'<div style="position: absolute; left: 0px; top: 0px; width: {sc["w"]}px; '
      f'height: {sc["h"]}px; pointer-events: none; background: {sc["bg"]};"></div>')

    # the sun and its clock
    s = g["sun"]
    sun_svg = s["svg"].replace('class="hero-sun-rays"', "")
    parts.append(
      f'<div style="position: absolute; left: {s["l"]}px; top: {s["t"]}px; '
      f'width: {s["w"]}px; text-align: center; pointer-events: none;">{sun_svg}'
      f'<span style="display: inline-block; margin-top: 2px; padding: 3px 10px; '
      f'border-radius: 999px; background: rgba(255,255,255,0.92); border: 1px solid #E2E8F0; '
      f'font-size: 0.72rem; font-weight: 700; color: #7F1D1D; white-space: nowrap;">'
      f'{esc(s["clock"])}</span></div>')

    # nav
    parts.append(
      '<div style="position: absolute; left: 0px; top: 0px; width: 100%; '
      'display: flex; justify-content: space-between; align-items: center; '
      f'padding: 6px {40 if w > 768 else 20}px;">'
      '<img src="balco-logo.webp" alt="balco.nyc" style="height: '
      f'{72 if w > 768 else 56}px; width: auto;">'
      '<div style="display: flex; align-items: center; gap: 24px;">'
      '<a href="#" style="text-decoration: none; font-weight: 700; font-size: 0.95rem;">About</a>'
      '<a href="#" style="text-decoration: none; font-weight: 700; font-size: 0.95rem;">FAQ</a>'
      '</div></div>')

    # the copy: headline, subhead, address field
    t = g["h1"]["t_"]
    parts.append(
      f'<div style="position: absolute; left: {g["h1"]["l"]}px; top: {g["h1"]["t"]}px; '
      f'width: {g["h1"]["w"]}px; font-size: {t["fs"]}; font-weight: {t["fw"]}; '
      f'line-height: {t["lh"]}; letter-spacing: {t["ls"]}; color: {t["color"]}; '
      f'text-wrap: balance;">{esc(g["h1"]["text"])}</div>')

    t = g["p"]["t_"]
    parts.append(
      f'<div style="position: absolute; left: {g["p"]["l"]}px; top: {g["p"]["t"]}px; '
      f'width: {g["p"]["w"]}px; font-size: {t["fs"]}; font-weight: {t["fw"]}; '
      f'line-height: {t["lh"]}; color: {t["color"]};">{g["p"]["html"]}</div>')

    wr, ip, bt = g["wrap"], g["inp"], g["btn"]
    parts.append(
      f'<div style="position: absolute; left: {wr["l"]}px; top: {wr["t"]}px; '
      f'width: {wr["w"]}px; height: {wr["h"]}px; display: flex; align-items: center; '
      f'gap: 6px; padding: 6px 6px 6px 4px; background: {wr["bg"]}; border: {wr["bd"]}; '
      f'border-radius: {wr["br"]}; box-shadow: {wr["sh"]};">'
      f'<div style="flex-grow: 1; padding: 0 14px; font-size: {ip["t_"]["fs"]}; '
      f'color: #8896AB;">{esc(ip["ph"])}</div>'
      f'<div style="padding: 12px 18px; background: {bt["bg"]}; color: #FFFFFF; '
      f'border-radius: {bt["br"]}; font-size: {bt["t_"]["fs"]}; font-weight: 700; '
      f'white-space: nowrap;">{esc(bt["text"])}</div></div>')

    # the verdict badge, so each frame says what it measured
    ok = verdict == "ok"
    parts.append(
      f'<div style="position: absolute; left: {40 if w > 768 else 20}px; '
      f'bottom: 20px; display: flex; align-items: center; gap: 8px; padding: 7px 13px; '
      f'border-radius: 999px; background: {"#ECFDF5" if ok else "#FEF2F2"}; '
      f'border: 1px solid {"#A7F3D0" if ok else "#FECACA"};">'
      f'<span style="font-size: 0.7rem; font-weight: 700; letter-spacing: 0.06em; '
      f'text-transform: uppercase; color: {"#065F46" if ok else "#991B1B"};">'
      f'{esc(verdict_note)}</span></div>')

    body = "\n  ".join(parts)
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  {FONTS}
  <style>
    body {{ margin: 0; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
           color: #171717; line-height: 1.6; -webkit-font-smoothing: antialiased; }}
    a {{ color: #171717; }} a:hover {{ color: #7F1D1D; }}
    sub {{ font-size: 0.7em; }}
  </style>
</helmet>
<div style="position: relative; width: {w}px; height: {H}px; background: #FFFFFF; overflow: hidden;">
  {body}
</div>
</x-dc>
<script data-dc-script data-props='{{"$preview":{{"width":{w},"height":{int(H)}}}}}'>
class Component extends DCLogic {{}}
</script>
</body>
</html>
"""

# Which sizes each build fails at, from the 17-size contrast sweep.
FAILS = {
  "today": {(390,844), (768,1024), (1280,800), (1440,1440)},
  "A": set(), "B": set(),
  "C": {(1280,800), (1440,1440)},
}
NOTE = {
  ("today",(390,844)):      "sun clips the address field",
  ("today",(768,1024)):     "sun clips the address field",
  ("today",(1280,800)):     "blocks under the copy",
  ("today",(1440,1440)):    "blocks under the headline",
  ("C",(1280,800)):         "faded blocks still under the copy",
  ("C",(1440,1440)):        "faded blocks still under the headline",
}

def main():
    files, boards = {}, []
    PAGES = [("page-1","Today"),("page-2","A · Its own column"),
             ("page-3","B · Scrim to the copy edge"),("page-4","C · Fade the map")]
    GAP_X, x_run = 120, None
    for pi,(bkey,prefix,plabel,_) in enumerate(BUILDS):
        x = 0
        for (w,h,sname) in SIZES:
            failed = (w,h) in FAILS[bkey]
            note = NOTE.get((bkey,(w,h)), "text sits on clean ground")
            if failed: note = NOTE[(bkey,(w,h))]
            # Option B's tall-desktop frame is the leading candidate -> Main
            is_main = (bkey == "B" and (w,h) == (1440,1440))
            name = "Main" if is_main else f"{prefix}{sname.replace(' ','')}"
            src = artboard(bkey, w, h, sname, "fail" if failed else "ok", note)
            files[f"{name}.dc.html"] = src
            H = int(GEO[f"{bkey}-{w}x{h}"]["hero"]["h"])
            boards.append({"file": f"{name}.dc.html", "x": x, "y": 0, "w": w, "h": H,
                           "title": f"{sname} · {w}×{h}", "page": PAGES[pi][0]})
            x += w + GAP_X
    for name, src in files.items():
        (HERE / name).write_text(src, encoding="utf-8")
    return files, boards, PAGES

if __name__ == "__main__":
    files, boards, PAGES = main()
    print(f"wrote {len(files)} artboards")
