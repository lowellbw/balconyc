# -*- coding: utf-8 -*-
"""Assemble the red fork: a runnable page in the repo, and a standalone copy."""
import json, re, sys, base64, pathlib
sys.path.insert(0, str(pathlib.Path("../home-directions").resolve()))
import build_sunwhite as B
import build_red_site as R

HD = pathlib.Path("../home-directions")
JS = pathlib.Path("../../js")
V = dict(B.VARIANTS[2][1])

block = json.load(open("block.json"))
tpl = pathlib.Path("template.html").read_text()

CONSTS = (f"const CITY_VW={B.VW}, CITY_VH={B.VH}, CITY_BLOCK={B.BLOCK};\n"
          f"const CITY_RADII={B.RADII};\n"
          f"const CITY_BOUNDS={B.BOUNDS};\n"
          f"const CITY_SHADES={json.dumps(V['shades'])};\n"
          f"const BLOCK={json.dumps(block)};\n")

page = (tpl
        .replace("__CITY_SVG__", B.city_svg(V))
        .replace("__SUN_SVG__", B.sun_svg(V))
        .replace("__SECTIONS__",
                 '<div style="max-width:1280px;margin:0 auto">' + R.home_sections + "</div>"))

MODULES = ["config.js", "solar-api.js", "sun-position.js", "3d-scene.js", "3d-shadow-model.js"]

def strip_keys(src):
    """Never carry the site's live API keys into a published copy."""
    src = re.sub(r"(GOOGLE_API_KEY:\s*)'[^']*'", r"\1''", src)
    src = re.sub(r"(NREL_API_KEY:\s*)'[^']*'", r"\1''", src)
    return src

# --- repo version: loads the real modules by path, runs on a local server ---
repo_scripts = ("".join(f'<script src="../../js/{m}"></script>\n' for m in MODULES)
                + f"<script>\n{CONSTS}</script>\n"
                + '<script src="app.js"></script>')
repo = (page.replace("__THREE__",
            '<script src="vendor/three.min.js"></script>\n'
            '<script src="vendor/OrbitControls.js"></script>')
        .replace("__APP_SCRIPTS__", repo_scripts).replace("__LOGO__", "../home-directions/balco-logo.png"))
pathlib.Path("index.html").write_text(repo)

# --- standalone: everything inlined, keys removed, for publishing ---
inline = []
for m in MODULES:
    src = JS.joinpath(m).read_text()
    if m == "config.js":
        src = strip_keys(src)
    inline.append(f"/* ---- js/{m} ---- */\n{src}")
inline.append(CONSTS)
inline.append(pathlib.Path("app.js").read_text())
logo = base64.b64encode(HD.joinpath("balco-logo.png").read_bytes()).decode()
photo = base64.b64encode(HD.joinpath("balcony-panel.jpg").read_bytes()).decode()

three_inline = ("<script>" + pathlib.Path("vendor/three.min.js").read_text()
                + "</script>\n<script>" + pathlib.Path("vendor/OrbitControls.js").read_text()
                + "</script>")
alone = (page.replace("__THREE__", three_inline).replace("__APP_SCRIPTS__", "<script>\n" + "\n\n".join(inline) + "\n</script>")
             .replace("__LOGO__", f"data:image/png;base64,{logo}")
             .replace('src="balco-logo.png"', f'src="data:image/png;base64,{logo}"')
             .replace('src="balcony-panel.jpg"', f'src="data:image/jpeg;base64,{photo}"'))
assert "AIzaSy" not in alone and "0qnbmiSy" not in alone, "API key leaked into the standalone build"
pathlib.Path("balco-red-fork.html").write_text(alone)

# --- artifact build: the same page, unwrapped for the Artifact skeleton ---
import re as _re
art = alone
art = art[art.index("<title>"):]
head_end = art.index("</head>")
head, rest = art[:head_end], art[head_end + len("</head>"):]
rest = rest[rest.index(">") + 1:]                       # drop <body ...>
rest = rest[:rest.rindex("</body>")]
head = head.replace('<title>balco.nyc \u2014 red fork, with the real 3D</title>',
                    "<title>Find the Sun on Your Block</title>")
artifact = head + rest
assert "<!doctype" not in artifact.lower() and "<html" not in artifact.lower()
assert "AIzaSy" not in artifact and "0qnbmiSy" not in artifact
pathlib.Path("find-the-sun-on-your-block.html").write_text(artifact)
print(f"find-the-sun-on-your-block.html {len(artifact)/1024:.0f}KB  (artifact build)")

print(f"index.html            {len(repo)/1024:.0f}KB  (loads ../../js modules)")
print(f"balco-red-fork.html   {len(alone)/1024:.0f}KB  (self-contained, keys stripped)")
