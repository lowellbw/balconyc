"""Bring the hand-written pages' shared parts in line with the templates.

methodology.html is written by hand, but its stylesheet, nav and footer are
the same ones every generated page uses. This rewrites exactly those three
regions from tools/sitelib.py and leaves the rest of the page alone.

index.html keeps its own nav and footer (the calculator page is different
enough to need them). Only its guide list, between
<!-- shell:guides --> and <!-- /shell:guides -->, is written from here.

    python3 tools/sync_shell.py
"""
import re

import sitelib as S

ROOT = S.ROOT


def replace_once(text, pattern, new, label):
    out, n = re.subn(pattern, lambda _m: new, text, count=1, flags=re.S)
    if n != 1:
        raise SystemExit(f"could not find the {label} region")
    return out


def guides_block(pages):
    """The homepage's guide cards: pillars first, then the newest articles."""
    articles = [p for p in pages if p["kind"] == "article" and p.get("indexable", True)]
    articles.sort(key=lambda p: (not p.get("pillar"), p["reviewed"]), reverse=False)
    pillars = [p for p in articles if p.get("pillar")]
    rest = sorted((p for p in articles if not p.get("pillar")), key=lambda p: p["reviewed"], reverse=True)
    picks = (pillars + rest)[:9]
    cards = "\n".join(
        f'      <a class="guide-card" href="{p["url_path"]}">\n'
        f'        <h3>{S.esc(p["card_title"])}</h3>\n'
        f'        <p>{S.esc(p["card"])}</p>\n'
        f'      </a>' for p in picks)
    h = S.hubs()
    more = []
    if h["guides"]:
        more.append('<a href="/guides">All guides &rarr;</a>')
    if h["states"]:
        more.append('<a href="/states">Plug-in solar rules by state &rarr;</a>')
    if h["nyc"]:
        more.append('<a href="/nyc">Balcony solar in New York City &rarr;</a>')
    more_html = f'\n    <p class="guides-more">{" &middot; ".join(more)}</p>' if more else ""
    return (f'<!-- shell:guides -->\n    <div class="guides-grid">\n{cards}\n    </div>{more_html}\n'
            f'    <!-- /shell:guides -->')


def main():
    pages = S.manifest()

    path = ROOT / "methodology.html"
    text = path.read_text(encoding="utf-8")
    text = replace_once(text, r"  <style>.*?</style>", S.css(), "methodology <style>")
    text = replace_once(text, r'<nav class="doc-nav">.*?</nav>', S.nav(), "methodology nav")
    text = replace_once(text, r"<footer>.*?</footer>", S.footer(pages), "methodology footer")
    path.write_text(text, encoding="utf-8")
    print("methodology.html: style, nav, footer")

    path = ROOT / "index.html"
    text = path.read_text(encoding="utf-8")
    if "<!-- shell:guides -->" in text:
        text = replace_once(text, r"<!-- shell:guides -->.*?<!-- /shell:guides -->",
                            guides_block(pages), "index guides")
        path.write_text(text, encoding="utf-8")
        print("index.html: guides")


if __name__ == "__main__":
    main()
