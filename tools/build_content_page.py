"""Build an article page from its spec.

    python3 tools/build_content_page.py                  # every content/*.json
    python3 tools/build_content_page.py content/x.json   # one page

A spec holds the words; tools/sitelib.py holds everything shared (stylesheet,
nav, footer, entity line, repeated figures). Figures that appear on more
than one page are written as {{tokens}} — {{coned.rate_cents}},
{{sunny.phrase}} — and filled from content/_config/facts.json, so a change
such as the SUNNY Act being signed is one edit, not a hunt through pages.

Each spec carries a `reviewed` date. It appears on the page, in the JSON-LD
as dateModified, and in the sitemap — one date, three places, so a page
cannot claim to be fresher in one surface than another.

Spec fields: slug, title, og_title, breadcrumb, description, eyebrow, h1,
lede, reviewed, published, reading_time, tags, sections[{id,toc,html}],
faq[[q,a]], sources[{url,title,note}]; optional cluster, pillar, card,
card_title, related[slug], about_legislation, date_label, disclaimer, noindex.
"""
import datetime, json, pathlib, sys

import sitelib as S

ROOT = S.ROOT


def human_date(iso):
    d = datetime.date.fromisoformat(iso)
    return f"{d.strftime('%B')} {d.day}, {d.year}"


def toc_html(sections):
    items = "\n".join(f'          <li><a href="#{s["id"]}">{s["toc"]}</a></li>' for s in sections)
    return f'        <ol>\n{items}\n        </ol>'


def faq_html(faq):
    return "\n".join(
        f'        <details>\n          <summary>{q}</summary>\n'
        f'          <p>{a}</p>\n        </details>' for q, a in faq)


def sources_html(sources):
    li = []
    for s in sources:
        if not s["url"].startswith("https://"):
            raise SystemExit(f'source url must be absolute https, got {s["url"]!r} ({s["title"]!r})')
        host = s["url"].split("/")[2].replace("www.", "")
        li.append(f'            <li><a href="{s["url"]}" target="_blank" rel="noopener">'
                  f'{s["title"]}</a> <span class="src-host">{host}</span> &mdash; {s["note"]}</li>')
    return "<ul>\n" + "\n".join(li) + "\n          </ul>"


def related_links(spec, pages):
    """The spec's own picks, then same-cluster pages, then pillars; four at most."""
    here = f'/{spec["slug"]}'
    by_path = {p["url_path"]: p for p in pages if p.get("indexable", True)}
    chosen = [by_path[f"/{s}"] for s in spec.get("related", []) if f"/{s}" in by_path]
    pool = ([p for p in pages if p.get("cluster") and p.get("cluster") == spec.get("cluster")] +
            [p for p in pages if p.get("pillar")] + list(pages))
    for p in pool:
        if len(chosen) >= 4:
            break
        if (p["url_path"] != here and p not in chosen and p.get("indexable", True)
                and p.get("kind", "article") == "article"):
            chosen.append(p)
    return chosen[:4]


def build(spec_path, pages=None):
    site, facts = S.load_site(), S.load_facts()
    raw = json.loads(pathlib.Path(spec_path).read_text(encoding="utf-8"))
    spec = S.tokens_deep(raw, facts)
    pages = pages if pages is not None else S.manifest()
    slug = spec["slug"]
    url_path = f"/{slug}"
    url = site["host"] + url_path

    description = S.plain(spec["description"])
    if len(description) > S.MAX_DESCRIPTION:
        raise SystemExit(f"{slug}: description is {len(description)} chars; "
                         f"search results cut it at about {S.MAX_DESCRIPTION}")
    faq = [(q, a) for q, a in spec["faq"]]
    crumbs = [("balco.nyc", "/")]
    if S.hubs()["guides"]:
        crumbs.append(("Guides", "/guides"))
    crumbs.append((S.plain(spec["breadcrumb"]), url_path))

    article = {
        "@type": "Article",
        "@id": f"{url}#article",
        "headline": S.plain(spec["og_title"]),
        "description": description,
        "url": url,
        "mainEntityOfPage": url,
        "inLanguage": "en-US",
        "datePublished": spec["published"],
        "dateModified": spec["reviewed"],
        "image": {"@type": "ImageObject", "url": site["og_image"],
                  "width": site["og_image_width"], "height": site["og_image_height"]},
        "author": {"@id": site["host"] + "/#org"},
        "publisher": {"@id": site["host"] + "/#org"},
        "isPartOf": {"@id": site["host"] + "/#app"},
    }
    if spec.get("about_legislation"):
        article["about"] = [{
            "@type": "Legislation",
            "name": "Solar Up Now New York (SUNNY) Act",
            "legislationIdentifier": "S8512C / A9111C",
            "legislationJurisdiction": "New York State",
            "legislationLegalForce": "NotInForce",
        }]
    article["citation"] = [{"@type": "CreativeWork", "name": S.plain(s["title"]), "url": s["url"]}
                           for s in spec["sources"]]
    graph = {"@context": "https://schema.org", "@graph": [
        article,
        {"@type": "FAQPage", "@id": f"{url}#faq", "dateModified": spec["reviewed"], "inLanguage": "en-US",
         "mainEntity": [{"@type": "Question", "name": S.plain(q),
                         "acceptedAnswer": {"@type": "Answer", "text": S.plain(a)}} for q, a in faq]},
        S.org_node(),
        S.breadcrumb_ld(crumbs),
    ]}

    sections = [s["html"] for s in spec["sections"]]
    # The calculator call-to-action sits after the second section: late
    # enough that the page has answered the question, early enough to be seen.
    if len(sections) >= 2:
        sections.insert(2, "        " + S.cta(spec.get("cta")))
    body = "\n\n".join(sections)
    tags = "\n".join(f'          <span class="doc-tag">{t}</span>' for t in spec["tags"])
    toc = spec["sections"] + [{"id": "questions", "toc": "Common questions"}, {"id": "sources", "toc": "Sources"}]
    robots = '\n  <meta name="robots" content="noindex, follow">' if spec.get("noindex") else ""
    disclaimer = spec.get("disclaimer") or (
        f'This page is maintained by <a href="/">balco.nyc</a>. {S.esc(site["entity_line"])} '
        'It is not legal or financial advice.')

    page = f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="{S.attr(spec["description"])}">
  <title>{spec["title"]}</title>{robots}
  <link rel="icon" type="image/webp" href="{site["logo"]}">
  <link rel="canonical" href="{url}">
  <meta name="theme-color" content="#7F1D1D">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="balco.nyc">
  <meta property="og:url" content="{url}">
  <meta property="og:title" content="{S.attr(spec["og_title"])}">
  <meta property="og:description" content="{S.attr(spec["description"])}">
  <meta property="og:image" content="{site["og_image"]}">
  <meta property="article:modified_time" content="{spec["reviewed"]}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{S.attr(spec["og_title"])}">
  <meta name="twitter:description" content="{S.attr(spec["description"])}">
  <meta name="twitter:image" content="{site["og_image"]}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,700;0,9..40,900;1,9..40,400&display=swap" rel="stylesheet">
  <script type="application/ld+json">
{S.jsonld(graph)}
  </script>
{S.css()}
</head>
<body>

{S.nav()}

<main>
  <div class="container">
    {S.breadcrumbs(crumbs)}
    <header class="doc-header">
      <div class="doc-eyebrow"><span class="dot"></span> {spec["eyebrow"]}</div>
      <h1>{spec["h1"]}</h1>
      <p class="lede">{spec["lede"]}</p>
      <div class="doc-meta-row">
        <div><strong>{spec.get("date_label", "Last reviewed")}:</strong> <time datetime="{spec["reviewed"]}">{human_date(spec["reviewed"])}</time></div>
        <div><strong>Reading time:</strong> {spec["reading_time"]}</div>
        <div class="doc-tags">
{tags}
        </div>
      </div>
    </header>

    <div class="doc-layout">
      <aside class="doc-toc" aria-label="Table of contents">
        <h2>Contents</h2>
{toc_html(toc)}
      </aside>

      <article class="doc-content">

{body}

        <section id="questions">
          <h2><span class="sec-num">{len(spec["sections"]) + 1}</span>Common questions</h2>
{faq_html(faq)}
        </section>

        <section id="sources">
          <h2><span class="sec-num">{len(spec["sections"]) + 2}</span>Sources</h2>
          {sources_html(spec["sources"])}
          <p>{disclaimer}</p>
        </section>

        {S.related(related_links(spec, pages))}

      </article>
    </div>
  </div>
</main>

{S.footer(pages)}

{S.tail()}'''

    out = ROOT / f"{slug}.html"
    out.write_text(page, encoding="utf-8")
    return out, len(page)


if __name__ == "__main__":
    specs = sys.argv[1:] or sorted(str(x) for x in (ROOT / "content").glob("*.json"))
    if not specs:
        sys.exit("no specs found in content/")
    pages = S.manifest()
    for sp in specs:
        out, n = build(sp, pages)
        print(f"  {out.name:<40} {n/1024:>5.0f}KB  from {pathlib.Path(sp).name}")
