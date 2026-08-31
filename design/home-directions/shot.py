"""Screenshot the static gov artboards: strip the x-dc wrapper into plain HTML."""
import re, sys, base64, pathlib
from playwright.sync_api import sync_playwright

def plain(path):
    s = pathlib.Path(path).read_text()
    style = re.search(r"<helmet>(.*?)</helmet>", s, re.S).group(1)
    body = re.search(r"</helmet>(.*?)</x-dc>", s, re.S).group(1)
    logo = base64.b64encode(pathlib.Path("balco-logo.png").read_bytes()).decode()
    body = body.replace('src="balco-logo.png"', f'src="data:image/png;base64,{logo}"')
    return f"<!doctype html><html><head><meta charset='utf-8'>{style}</head><body>{body}</body></html>"

files = sys.argv[1:]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
    pg = b.new_page(viewport={"width": 1280, "height": 1060}, device_scale_factor=1)
    for f in files:
        tmp = pathlib.Path(f"/tmp/_{pathlib.Path(f).stem}.html")
        tmp.write_text(plain(f))
        pg.goto("file://" + str(tmp)); pg.wait_for_timeout(1400)
        out = f"shot-{pathlib.Path(f).stem}.png"
        pg.screenshot(path=out, full_page=True)
        print(out, pg.evaluate("document.body.scrollHeight"), "px tall")
    b.close()
