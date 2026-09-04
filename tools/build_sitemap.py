"""Generate sitemap.xml from what is actually on disk.

It used to be hand-written, and its lastmod said 31 August while the homepage
had changed several times since. Dates now come from one of two places and
never from a keyboard: a content page's `reviewed` date in its spec, and
git's last-commit date for everything else.

    python3 tools/build_sitemap.py
"""
import json, pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]

# Pages that are not built from a content spec, with their crawl hints.
CORE = [
    ("index.html", "https://balco.nyc/", "weekly", "1.0"),
    ("methodology.html", "https://balco.nyc/methodology", "monthly", "0.8"),
]
CONTENT_PRIORITY = "0.8"
CONTENT_CHANGEFREQ = "monthly"
# The legal status page moves whenever the bill does.
FREQ_OVERRIDE = {"sunny-act": ("weekly", "0.9")}


def git_date(path):
    r = subprocess.run(["git", "log", "-1", "--format=%cs", "--", path],
                       cwd=ROOT, capture_output=True, text=True)
    return r.stdout.strip() or None


def entries():
    out = []
    for f, url, freq, pri in CORE:
        d = git_date(f)
        if not d:
            sys.exit(f"{f} has no git history; commit it before building the sitemap")
        out.append((url, d, freq, pri))
    for spec_path in sorted((ROOT / "content").glob("*.json")):
        spec = json.loads(spec_path.read_text(encoding="utf-8"))
        slug = spec["slug"]
        freq, pri = FREQ_OVERRIDE.get(slug, (CONTENT_CHANGEFREQ, CONTENT_PRIORITY))
        # the reviewed date is the honest lastmod: it is when a person last
        # checked the claims, not when a byte moved
        out.append((f"https://balco.nyc/{slug}", spec["reviewed"], freq, pri))
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
