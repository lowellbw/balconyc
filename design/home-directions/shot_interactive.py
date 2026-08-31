"""Render SunCity standalone (DCLogic shimmed) and drive the mouse across it."""
import re, base64, pathlib
from playwright.sync_api import sync_playwright

s = pathlib.Path("SunCity.dc.html").read_text()
style = re.search(r"<helmet>(.*?)</helmet>", s, re.S).group(1)
body  = re.search(r"</helmet>(.*?)</x-dc>", s, re.S).group(1)
logic = re.search(r"<script data-dc-script[^>]*>(.*?)</script>", s, re.S).group(1)

body = body.replace('ref="{{bind}}"', "")           # exercise the getElementById fallback
logo = base64.b64encode(pathlib.Path("balco-logo.png").read_bytes()).decode()
body = body.replace('src="balco-logo.png"', f'src="data:image/png;base64,{logo}"')

html = f"""<!doctype html><html><head><meta charset='utf-8'>{style}</head><body>{body}
<script>
class DCLogic {{ constructor(p) {{ this.props = p || {{}}; }} }}
{logic}
window.__c = new Component({{}});
window.__c.componentDidMount();
</script></body></html>"""
pathlib.Path("/tmp/_suncity.html").write_text(html)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
    pg = b.new_page(viewport={"width": 1280, "height": 1060})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto("file:///tmp/_suncity.html")
    pg.wait_for_timeout(900)
    for tag, x in (("dawn", 90), ("noon", 640), ("dusk", 1200)):
        for _ in range(40):                      # let the easing settle
            pg.mouse.move(x, 500); pg.wait_for_timeout(16)
        pg.wait_for_timeout(400)
        pg.screenshot(path=f"shot-sun-{tag}.png")
        cx = pg.evaluate("document.querySelector('[data-sun-grad]').getAttribute('cx')")
        cy = pg.evaluate("document.querySelector('[data-sun-grad]').getAttribute('cy')")
        clock = pg.evaluate("document.querySelector('[data-sun-clock]').textContent")
        print(f"{tag:5} mouse x={x:<5} gradient=({cx}, {cy})  clock={clock}")
    print("JS errors:", errs or "none")
    b.close()
