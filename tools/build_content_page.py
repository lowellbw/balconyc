"""Assemble a content page from a spec, using methodology.html as the shell.

Content pages (/sunny-act, /what-is-balcony-solar, ...) share their head,
stylesheet, nav and footer with the methodology page. Rather than copy that
shell into each file by hand and let the copies drift, every page is built
from this one template.

    python3 tools/build_content_page.py content/sunny-act.json

Each spec carries a `reviewed` date. It appears on the page, in the JSON-LD
as dateModified, and in the sitemap — one date, three places, so a page
cannot claim to be fresher in one surface than another.
"""
import html, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
SHELL = ROOT / "methodology.html"


def shell_parts():
    s = SHELL.read_text(encoding="utf-8")
    return {
        "style": s[s.index("<style>"):s.index("</style>") + 8],
        "nav":   s[s.index('<nav class="doc-nav">'):s.index("</nav>") + 6],
        "footer": s[s.index("<footer>"):s.index("</footer>") + 9],
        "tail":  s[s.index("</footer>") + 9:],
    }


def esc(t):
    return html.escape(t, quote=True)


def faq_jsonld(faq, indent="          "):
    out = []
    for q, a in faq:
        out.append(
            f'{indent}{{\n{indent}  "@type": "Question",\n'
            f'{indent}  "name": "{esc(q)}",\n'
            f'{indent}  "acceptedAnswer": {{ "@type": "Answer", "text": "{esc(a)}" }}\n'
            f'{indent}}}')
    return ",\n".join(out)


def faq_html(faq):
    return "\n".join(
        f'        <details>\n          <summary>{q}</summary>\n'
        f'          <p>{a}</p>\n        </details>' for q, a in faq)


def toc_html(sections):
    items = "\n".join(f'          <li><a href="#{s["id"]}">{s["toc"]}</a></li>'
                      for s in sections)
    return f'        <ol>\n{items}\n        </ol>'


def sources_html(sources):
    li = []
    for s in sources:
        if not s["url"].startswith("http"):
            raise SystemExit(f'source url must be absolute, got {s["url"]!r} ({s["title"]!r})')
        host = s["url"].split("/")[2].replace("www.", "")
        li.append(f'            <li><a href="{s["url"]}" target="_blank" rel="noopener">'
                  f'{s["title"]}</a> <span class="src-host">{host}</span> &mdash; {s["note"]}</li>')
    return "<ul>\n" + "\n".join(li) + "\n          </ul>"


def build(spec_path):
    spec = json.loads(pathlib.Path(spec_path).read_text(encoding="utf-8"))
    p = shell_parts()
    slug, url = spec["slug"], f'https://balco.nyc/{spec["slug"]}'
    faq = [(q, a) for q, a in spec["faq"]]
    tags = "\n".join(f'          <span class="doc-tag">{t}</span>' for t in spec["tags"])
    body = "\n\n".join(s["html"] for s in spec["sections"])

    extra = ""
    if spec.get("about_legislation"):
        extra = ('\n        "about": [\n          { "@type": "Legislation", '
                 '"name": "Solar Up Now New York (SUNNY) Act", '
                 '"legislationIdentifier": "S8512C / A9111C", '
                 '"legislationJurisdiction": "New York State", '
                 '"legislationLegalForce": "NotInForce" }\n        ],')

    citations = ",\n".join(
        f'          {{ "@type": "CreativeWork", "name": "{esc(s["title"])}", "url": "{s["url"]}" }}'
        for s in spec["sources"][:6])

    page = f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="{esc(spec["description"])}">
  <title>{spec["title"]}</title>
  <link rel="icon" type="image/webp" href="Gemini_Generated_Image_7vmu3f7vmu3f7vmu-removebg-preview.webp">
  <link rel="canonical" href="{url}">
  <meta name="theme-color" content="#7F1D1D">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="balco.nyc">
  <meta property="og:url" content="{url}">
  <meta property="og:title" content="{esc(spec["og_title"])}">
  <meta property="og:description" content="{esc(spec["description"])}">
  <meta property="og:image" content="https://balco.nyc/Gemini_Generated_Image_d2ucutd2ucutd2uc.fallback.jpg">
  <meta property="article:modified_time" content="{spec["reviewed"]}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{esc(spec["og_title"])}">
  <meta name="twitter:description" content="{esc(spec["description"])}">
  <meta name="twitter:image" content="https://balco.nyc/Gemini_Generated_Image_d2ucutd2ucutd2uc.fallback.jpg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,700;0,9..40,900;1,9..40,400&display=swap" rel="stylesheet">
  <script type="application/ld+json">
  {{
    "@context": "https://schema.org",
    "@graph": [
      {{
        "@type": "Article",
        "@id": "{url}#article",
        "headline": "{esc(spec["og_title"])}",
        "description": "{esc(spec["description"])}",
        "url": "{url}",
        "inLanguage": "en-US",
        "datePublished": "{spec["published"]}",
        "dateModified": "{spec["reviewed"]}",
        "publisher": {{ "@id": "https://balco.nyc/#org" }},
        "isPartOf": {{ "@id": "https://balco.nyc/#app" }},{extra}
        "citation": [
{citations}
        ]
      }},
      {{
        "@type": "FAQPage",
        "@id": "{url}#faq",
        "dateModified": "{spec["reviewed"]}",
        "inLanguage": "en-US",
        "mainEntity": [
{faq_jsonld(faq)}
        ]
      }},
      {{
        "@type": "BreadcrumbList",
        "itemListElement": [
          {{ "@type": "ListItem", "position": 1, "name": "balco.nyc", "item": "https://balco.nyc/" }},
          {{ "@type": "ListItem", "position": 2, "name": "{esc(spec["breadcrumb"])}", "item": "{url}" }}
        ]
      }}
    ]
  }}
  </script>
  {p["style"]}
</head>
<body>

{p["nav"]}

<main>
  <div class="container">
    <header class="doc-header">
      <div class="doc-eyebrow"><span class="dot"></span> {spec["eyebrow"]}</div>
      <h1>{spec["h1"]}</h1>
      <p class="lede">{spec["lede"]}</p>
      <div class="doc-meta-row">
        <div><strong>{spec.get("date_label", "Last reviewed")}:</strong> <time datetime="{spec["reviewed"]}">{spec["reviewed_human"]}</time></div>
        <div><strong>Reading time:</strong> {spec["reading_time"]}</div>
        <div class="doc-tags">
{tags}
        </div>
      </div>
    </header>

    <div class="doc-layout">
      <aside class="doc-toc" aria-label="Table of contents">
        <h2>Contents</h2>
{toc_html(spec["sections"] + [{"id": "questions", "toc": "Common questions"}, {"id": "sources", "toc": "Sources"}])}
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
          <p>{spec.get("disclaimer", 'This page is maintained by <a href="/">balco.nyc</a>, an independent balcony-solar calculator. It is not legal or financial advice.')}</p>
        </section>

      </article>
    </div>
  </div>
</main>

{p["footer"]}
{p["tail"]}'''

    out = ROOT / f'{slug}.html'
    out.write_text(page, encoding="utf-8")
    return out, len(page)


if __name__ == "__main__":
    specs = sys.argv[1:] or sorted(str(x) for x in (ROOT / "content").glob("*.json"))
    if not specs:
        sys.exit("no specs found in content/")
    for sp in specs:
        out, n = build(sp)
        print(f"  {out.name:<32} {n/1024:>5.0f}KB  from {pathlib.Path(sp).name}")
