import re, base64, pathlib, sys
from playwright.sync_api import sync_playwright

def plain(path):
    s = pathlib.Path(path).read_text()
    style = re.search(r"<helmet>(.*?)</helmet>", s, re.S).group(1)
    body  = re.search(r"</helmet>(.*?)</x-dc>", s, re.S).group(1).replace('ref="{{bind}}"', "")
    logic = re.search(r"<script data-dc-script[^>]*>(.*?)</script>", s, re.S).group(1)
    logo = base64.b64encode(pathlib.Path("balco-logo.png").read_bytes()).decode()
    body = body.replace('src="balco-logo.png"', f'src="data:image/png;base64,{logo}"')
    return f"""<!doctype html><html><head><meta charset='utf-8'>{style}</head><body>{body}
<script>class DCLogic {{ constructor(p) {{ this.props = p || {{}}; }} }}
{logic}
new Component({{}}).componentDidMount();</script></body></html>"""

files = sys.argv[1:]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
    pg = b.new_page(viewport={"width": 1280, "height": 1060})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    for f in files:
        stem = pathlib.Path(f).stem.replace(".dc", "")
        pathlib.Path(f"/tmp/_{stem}.html").write_text(plain(f))
        pg.goto(f"file:///tmp/_{stem}.html"); pg.wait_for_timeout(700)
        for _ in range(45):
            pg.mouse.move(940, 500); pg.wait_for_timeout(16)
        pg.wait_for_timeout(300)
        pg.screenshot(path=f"shot-{stem}.png")
        print(f"shot-{stem}.png", pg.evaluate("document.querySelector('[data-sun-clock]').textContent"))
    print("errors:", errs or "none")
    b.close()
