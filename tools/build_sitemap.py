"""Generate sitemap.xml from what is actually on disk.

It used to be hand-written, and its lastmod said 31 August while the homepage
had changed several times since. Dates now come from one of three places and
never from a keyboard: a content page's `reviewed` date in its spec, the
methodology page's own review date, and git's last-commit date for the
homepage.

    python3 tools/build_sitemap.py
"""
import json, pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]

# Pages that are not built from a content spec, with their crawl hints.
CORE = [
    ("index.html", "https://balco.nyc/", "weekly", "1.0"),
    ("methodology.html", "https://balco.nyc/methodology", "monthly", "0.8"),
    ("guides.html", "https://balco.nyc/guides", "weekly", "0.8"),
    ("states.html", "https://balco.nyc/states", "weekly", "0.9"),
    ("nyc.html", "https://balco.nyc/nyc", "monthly", "0.8"),
    ("about.html", "https://balco.nyc/about", "monthly", "0.5"),
]
CONTENT_PRIORITY = "0.8"
CONTENT_CHANGEFREQ = "monthly"
# The legal status page moves whenever the bill does.
FREQ_OVERRIDE = {"sunny-act": ("weekly", "0.9")}


def page_reviewed(path):
    # The methodology page states when it was last checked against the code.
    # A commit that only adds a link is not a review, so git's date would
    # overstate its freshness; the page's own article:modified_time is used.
    m = re.search(r'<meta property="article:modified_time" content="([0-9-]+)">',
                  (ROOT / path).read_text(encoding="utf-8"))
    return m.group(1) if m else None


def git_date(path):
    r = subprocess.run(["git", "log", "-1", "--format=%cs", "--", path],
                       cwd=ROOT, capture_output=True, text=True)
    return r.stdout.strip() or None


def entries():
    out = []
    for f, url, freq, pri in CORE:
        if not (ROOT / f).exists():
            continue                       # a hub that has not been built yet
        d = page_reviewed(f) or git_date(f)
        if not d:
            sys.exit(f"{f} has no git history; commit it before building the sitemap")
        out.append((url, d, freq, pri))
    for spec_path in sorted((ROOT / "content").glob("*.json")):
        spec = json.loads(spec_path.read_text(encoding="utf-8"))
        if spec.get("noindex"):
            continue
        slug = spec["slug"]
        freq, pri = FREQ_OVERRIDE.get(slug, (CONTENT_CHANGEFREQ, CONTENT_PRIORITY))
        # the reviewed date is the honest lastmod: it is when a person last
        # checked the claims, not when a byte moved
        out.append((f"https://balco.nyc/{slug}", spec["reviewed"], freq, pri))
    # Generated state pages list themselves (and their review dates) in
    # data/state-pages.json; noindexed ones are left out.
    index = ROOT / "data" / "state-pages.json"
    if index.exists():
        for page in json.loads(index.read_text(encoding="utf-8")):
            if page.get("indexable", True):
                out.append(("https://balco.nyc" + page["url_path"], page["reviewed"], "monthly", "0.7"))
    return out


def build():
    rows = "\n".join(
        f"  <url>\n    <loc>{u}</loc>\n    <lastmod>{d}</lastmod>\n"
        f"    <changefreq>{f}</changefreq>\n    <priority>{p}</priority>\n  </url>"
        for u, d, f, p in entries())
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n'
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
           f"{rows}\n</urlset>\n")
    (ROOT / "sitemap.xml").write_text(xml, encoding="utf-8")
    return len(entries())


if __name__ == "__main__":
    print(f"sitemap.xml: {build()} urls")
