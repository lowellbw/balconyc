"""Build the hub pages: /guides and /about.

    python3 tools/build_hubs.py

/guides lists every indexable article, grouped by topic, pillars first. It is
what keeps every guide within two clicks of the homepage as the site grows
past what the homepage can list. /about says who publishes balco.nyc, what
it is and is not, and where its numbers come from.

The /states hub has its own builder (tools/build_state_pages.py) because it
is built from the state data files.
"""
import datetime

import sitelib as S

ROOT = S.ROOT
TODAY = datetime.date.today().isoformat()


def shell(*, url_path, title, description, og_title, h1, eyebrow, lede, body, graph_nodes,
          crumbs, reviewed, pages):
    site = S.load_site()
    url = site["host"] + url_path
    if len(S.plain(description)) > S.MAX_DESCRIPTION:
        raise SystemExit(f"{url_path}: description over {S.MAX_DESCRIPTION} characters")
    graph = {"@context": "https://schema.org",
             "@graph": graph_nodes + [S.org_node(), S.breadcrumb_ld(crumbs)]}
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="{S.attr(description)}">
  <title>{title}</title>
  <link rel="icon" type="image/webp" href="{site["logo"]}">
  <link rel="canonical" href="{url}">
  <meta name="theme-color" content="#7F1D1D">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="balco.nyc">
  <meta property="og:url" content="{url}">
  <meta property="og:title" content="{S.attr(og_title)}">
  <meta property="og:description" content="{S.attr(description)}">
  <meta property="og:image" content="{site["og_image"]}">
  <meta property="article:modified_time" content="{reviewed}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{S.attr(og_title)}">
  <meta name="twitter:description" content="{S.attr(description)}">
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
      <div class="doc-eyebrow"><span class="dot"></span> {eyebrow}</div>
      <h1>{h1}</h1>
      <p class="lede">{lede}</p>
      <div class="doc-meta-row">
        <div><strong>Last updated:</strong> <time datetime="{reviewed}">{datetime.date.fromisoformat(reviewed).strftime("%B %-d, %Y")}</time></div>
      </div>
    </header>
    <article class="doc-content hub-content">
{body}
    </article>
  </div>
</main>

{S.footer(pages)}

{S.tail()}'''


def guides(pages):
    site = S.load_site()
    articles = [p for p in pages if p["kind"] == "article" and p.get("indexable", True)]
    reviewed = max(p["reviewed"] for p in articles)
    groups, items, n = [], [], 0
    for key, label in S.CLUSTERS:
        members = sorted((p for p in articles if p.get("cluster") == key),
                         key=lambda p: (not p.get("pillar"), p["card_title"]))
        if not members:
            continue
        li = "\n".join(
            f'          <li><a href="{p["url_path"]}">{S.esc(p["card_title"])}</a>'
            f'<span>{S.esc(p["card"])}</span></li>' for p in members)
        groups.append(f'''      <section id="{key}">
        <h2>{label}</h2>
        <ul class="hub-list">
{li}
        </ul>
      </section>''')
        for p in members:
            n += 1
            items.append({"@type": "ListItem", "position": n, "url": site["host"] + p["url_path"],
                          "name": p["card_title"]})
    places = []
    if S.hubs()["states"]:
        places.append('<li><a href="/states">Plug-in solar rules and savings in every state</a></li>')
    if S.hubs()["nyc"]:
        places.append('<li><a href="/nyc">Balcony solar in New York City</a></li>')
    if places:
        groups.append('      <section id="places">\n        <h2>By place</h2>\n        <ul class="hub-list">\n          '
                      + "\n          ".join(places) + "\n        </ul>\n      </section>")
    body = "\n\n".join(groups)
    node = {"@type": "CollectionPage", "@id": site["host"] + "/guides#page", "url": site["host"] + "/guides",
            "name": "Balcony solar guides", "description": "Every balco.nyc guide to balcony solar, grouped by topic.",
            "isPartOf": {"@id": site["host"] + "/#app"}, "inLanguage": "en-US", "dateModified": reviewed,
            "mainEntity": {"@type": "ItemList", "numberOfItems": len(items), "itemListElement": items}}
    return shell(
        url_path="/guides", title="Balcony solar guides &middot; balco.nyc",
        description="Every balco.nyc guide to balcony solar: estimating output, savings and payback, plug-in solar law, New York City, and comparisons.",
        og_title="Balcony solar guides", h1="Balcony solar guides", eyebrow="Guides",
        lede=("Plain, sourced answers about plug-in balcony solar. Every guide is written from the same "
              "model and data as the <a href=\"/\">balco.nyc calculator</a>, carries its sources, and shows "
              "the date its claims were last checked."),
        body=body, graph_nodes=[node], crumbs=[("balco.nyc", "/"), ("Guides", "/guides")],
        reviewed=reviewed, pages=pages)


def about(pages):
    site, facts = S.load_site(), S.load_facts()
    reviewed = TODAY
    body = f'''      <section id="what">
        <h2>What balco.nyc is</h2>
        <p>{S.esc(site["entity_line"])} It runs NREL&rsquo;s PVWatts simulation for the exact address, values the output at the local price of electricity, and reports the result as a planning estimate with its assumptions shown. In New York City it also builds a 3D model of the surrounding block from city building data, so the shade cast by the buildings opposite is measured rather than guessed.</p>
        <p>It is free, carries no advertising and no affiliate links, and does not sell, install, rank or recommend any product. The code is open source on <a href="{site["github"]}" target="_blank" rel="noopener">GitHub</a>.</p>
      </section>

      <section id="not">
        <h2>What it is not</h2>
        <ul>
          <li>Not a vendor or installer, and not paid by one. {S.esc(site["not_affiliated"])}</li>
          <li>Not legal advice. The rules for plug-in solar differ by state and by building, and the site says when a state has not been reviewed.</li>
          <li>Not a guarantee. NYC estimates carry a {facts["accuracy"]["nyc_phrase"]}; estimates elsewhere rest on a description of the view and a state-average price, so their range is wider.</li>
        </ul>
      </section>

      <section id="how">
        <h2>How the numbers are made</h2>
        <p>Every figure on the site comes from a public source that is named where it is used: NREL PVWatts for solar output, the U.S. Energy Information Administration for state electricity prices, EPA eGRID for grid emissions, NYC PLUTO and building footprints for New York buildings, Con Edison&rsquo;s tariff for the New York rate, and state legislatures&rsquo; own bill pages for plug-in solar law. The <a href="/methodology">methodology</a> documents every formula and assumption, and the test suite in the repository checks that the numbers stated on the site agree with the code.</p>
        <p>Each guide shows the date its claims were last checked, and the site fails its own build when a page goes too long without a review.</p>
      </section>

      <section id="cite">
        <h2>Citing balco.nyc</h2>
        <p>Please attribute as &ldquo;{S.esc(site["citation"])}&rdquo; with a link to <a href="/">https://balco.nyc/</a>. A machine-readable summary for AI assistants is at <a href="/llms.txt">/llms.txt</a>.</p>
      </section>

      <section id="contact">
        <h2>Corrections</h2>
        <p>If a figure is wrong or out of date, please open an issue on <a href="{site["github"]}/issues" target="_blank" rel="noopener">GitHub</a>. Corrections are made in the source and noted in the page&rsquo;s review date.</p>
      </section>'''
    node = {"@type": "AboutPage", "@id": site["host"] + "/about#page", "url": site["host"] + "/about",
            "name": "About balco.nyc", "about": {"@id": site["host"] + "/#org"}, "inLanguage": "en-US",
            "dateModified": reviewed}
    return shell(
        url_path="/about", title="About balco.nyc",
        description="Who publishes balco.nyc, what the balcony solar calculator is and is not, and where every number on the site comes from.",
        og_title="About balco.nyc", h1="About balco.nyc", eyebrow="About",
        lede="An independent, free calculator for plug-in balcony solar, built from public data and open-source code.",
        body=body, graph_nodes=[node], crumbs=[("balco.nyc", "/"), ("About", "/about")],
        reviewed=reviewed, pages=pages)


def nyc(pages):
    site, facts = S.load_site(), S.load_facts()
    nyc_pages = [p for p in pages if p.get("cluster") == "nyc" and p.get("indexable", True)]
    also = [p for p in pages if p["url_path"] in ("/sunny-act", "/electricity-rate", "/install-balcony-solar")]
    reviewed = max(p["reviewed"] for p in nyc_pages + also)
    li = "\n".join(f'          <li><a href="{p["url_path"]}">{S.esc(p["card_title"])}</a><span>{S.esc(p["card"])}</span></li>'
                   for p in also + sorted(nyc_pages, key=lambda p: p["card_title"]))
    rate = facts["coned"]["rate_cents"]
    body = f'''      <section id="short">
        <h2>The short answer</h2>
        <p>Plug-in solar is not yet legal in New York: the SUNNY Act has passed both chambers and {S.esc(facts["sunny"]["phrase"])}, and even once signed it gives no right to install, so a renter still needs the landlord and a co-op or condo owner the board. What a panel would make depends mostly on the building across the street. With an open view, an 800&nbsp;W panel on a south-facing railing makes about 604&nbsp;kWh a year in balco.nyc&rsquo;s PVWatts model, worth about $205 at Con&nbsp;Edison&rsquo;s {rate}&cent; marginal rate; facing a six-to-ten-story building across a 20&nbsp;m street from the third floor, about 227&nbsp;kWh. <a href="/">The calculator</a> builds a 3D model of your block from city building data and gives the figure for your floor and wall.</p>
      </section>

      <section id="numbers">
        <h2>New York City in numbers</h2>
        <div class="table-wrap"><table><tbody>
          <tr><th>Homes in co-ops or owner-held condos, where a board must approve</th><td>19.4% (724,425)</td></tr>
          <tr><th>Homes in a historic district or individual landmark (LPC)</th><td>6.8% (253,715)</td></tr>
          <tr><th>Homes in buildings over six stories, under facade inspection</th><td>30.8% (1,150,311)</td></tr>
          <tr><th>Rent-stabilized households that pay their own electricity</th><td>84.5%</td></tr>
          <tr><th>Public-housing households that pay their own electricity</th><td>10.5%</td></tr>
          <tr><th>Con Edison all-in marginal rate used for savings</th><td>{rate}&cent;/kWh</td></tr>
          <tr><th>NYC rank for south-facing railing output among the 51 largest state cities</th><td>43rd</td></tr>
        </tbody></table></div>
        <p>Each figure is balco.nyc&rsquo;s own count from NYC PLUTO, the Landmarks Preservation Commission&rsquo;s records, the Department of Buildings&rsquo; filings and the 2023 Housing and Vacancy Survey, explained with its method in the guides below.</p>
      </section>

      <section id="guides">
        <h2>Guides for New York City</h2>
        <ul class="hub-list">
{li}
        </ul>
        <p>For the rest of New York State, see <a href="/states/new-york">balcony solar in New York</a>.</p>
      </section>'''
    node = {"@type": "CollectionPage", "@id": site["host"] + "/nyc#page", "url": site["host"] + "/nyc",
            "name": "Balcony solar in New York City", "inLanguage": "en-US", "dateModified": reviewed,
            "about": {"@type": "City", "name": "New York City"},
            "mainEntity": {"@type": "ItemList", "numberOfItems": len(also) + len(nyc_pages),
                           "itemListElement": [{"@type": "ListItem", "position": i + 1, "url": site["host"] + p["url_path"],
                                                "name": p["card_title"]} for i, p in enumerate(also + nyc_pages)]}}
    return shell(
        url_path="/nyc", title="Balcony solar in New York City: rules, boards and savings &middot; balco.nyc",
        description="Balcony solar in New York City: the SUNNY Act, co-op boards, landmarks, rent stabilization, fire escapes, Con Edison, and what a panel would save.",
        og_title="Balcony solar in New York City", h1="Balcony solar in New York City", eyebrow="New York City",
        lede=("What a plug-in panel on a New York City balcony would make and save, and who has to say yes first. "
              "balco.nyc started here: for a city address the <a href=\"/\">calculator</a> models your block in 3D."),
        body=body, graph_nodes=[node], crumbs=[("balco.nyc", "/"), ("NYC", "/nyc")], reviewed=reviewed, pages=pages)


def main():
    pages = S.manifest()
    # Two passes: the nav and footer link only to hubs that exist, so the
    # second pass sees the hubs the first one created.
    for _ in range(2):
        (ROOT / "guides.html").write_text(guides(pages), encoding="utf-8")
        (ROOT / "about.html").write_text(about(pages), encoding="utf-8")
        (ROOT / "nyc.html").write_text(nyc(pages), encoding="utf-8")
    print("guides.html, about.html, nyc.html")


if __name__ == "__main__":
    main()
