"""Stamp every local script reference with a hash of the file it loads.

js/ is served with a ten-minute cache and the file names never change, while
the HTML is revalidated on every request. Without a fingerprint, for ten
minutes after a deploy a browser can pair the new page with the previous
module: a page that calls SunPosition.setLocation() gets a sun-position.js
that does not have it. The hash in the query string makes each version of
a file its own URL, so the pairing cannot happen.

    python3 tools/stamp_scripts.py

Rewrites the ?v= stamps in index.html and methodology.html. Content pages
take their scripts from methodology.html, so rebuild them afterwards with
tools/build_content_page.py. tests/content.test.js fails on a stale stamp.
"""
import hashlib, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parents[1]
PAGES = ["index.html", "methodology.html"]
# "/js/name.js" or '/js/name.js', with or without an existing ?v= stamp
REF = re.compile(r"""(["'])/js/([a-z0-9-]+\.js)(?:\?v=[0-9a-f]+)?\1""")


def stamp(name):
    return hashlib.sha256((ROOT / "js" / name).read_bytes()).hexdigest()[:8]


def main():
    for page in PAGES:
        path = ROOT / page
        text = path.read_text(encoding="utf-8")
        new = REF.sub(lambda m: f"{m.group(1)}/js/{m.group(2)}?v={stamp(m.group(2))}{m.group(1)}", text)
        if new != text:
            path.write_text(new, encoding="utf-8")
        refs = sorted(set(m.group(2) for m in REF.finditer(new)))
        print(f"{page}: {', '.join(refs)}")


if __name__ == "__main__":
    main()
