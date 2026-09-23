"""Tell Bing (and every IndexNow engine) which pages changed since the last ping.

Bing's index feeds ChatGPT search and Copilot, so a page it has not recrawled
is a page those answers cannot cite. IndexNow lets a site announce changed
URLs instead of waiting for a crawl.

Run it by hand after a deploy has gone live, never before: the engines fetch
the URLs straight away and would see the old page.

    python3 tools/indexnow.py            # ping URLs whose lastmod changed
    python3 tools/indexnow.py --dry-run  # show what would be sent
    python3 tools/indexnow.py --all      # ping every URL in the sitemap

The key is a public verification token, not a secret: the engines check that
https://balco.nyc/<key>.txt contains it, which proves the site sent the ping.
What was last sent is remembered in tools/indexnow-state.json.
"""
import json, pathlib, re, sys, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
HOST = "balco.nyc"
STATE = ROOT / "tools" / "indexnow-state.json"
ENDPOINT = "https://api.indexnow.org/IndexNow"


def key():
    found = [p for p in ROOT.glob("*.txt")
             if re.fullmatch(r"[0-9a-f]{32}", p.stem) and p.read_text().strip() == p.stem]
    if len(found) != 1:
        sys.exit(f"expected exactly one IndexNow key file at the repo root, found {len(found)}")
    return found[0].stem


def sitemap():
    xml = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
    return dict(re.findall(r"<loc>([^<]+)</loc>\s*<lastmod>([^<]+)</lastmod>", xml))


def main(argv):
    current = sitemap()
    sent = json.loads(STATE.read_text()) if STATE.exists() else {}
    urls = sorted(current if "--all" in argv
                  else [u for u, d in current.items() if sent.get(u) != d])
    if not urls:
        print("nothing changed since the last ping")
        return
    print("\n".join(f"  {u}" for u in urls))
    if "--dry-run" in argv:
        print(f"{len(urls)} url(s) would be sent")
        return

    k = key()
    body = json.dumps({"host": HOST, "key": k,
                       "keyLocation": f"https://{HOST}/{k}.txt",
                       "urlList": urls}).encode()
    req = urllib.request.Request(ENDPOINT, data=body, method="POST",
                                 headers={"Content-Type": "application/json; charset=utf-8"})
    with urllib.request.urlopen(req, timeout=30) as r:
        # 200 = accepted, 202 = accepted pending key check. Anything else raises.
        print(f"IndexNow answered {r.status} for {len(urls)} url(s)")
    sent.update({u: current[u] for u in urls})
    STATE.write_text(json.dumps(sent, indent=2, sort_keys=True) + "\n")


if __name__ == "__main__":
    main(sys.argv[1:])
