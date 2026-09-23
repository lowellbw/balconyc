"""Shared pieces for every generated page on balco.nyc.

Content pages, state pages, hubs and llms.txt are all built from this one
module, so the nav, the footer, the entity line and every repeated number
come from a single place and cannot drift between pages.

  content/_config/site.json   who the site is (entity line, citation, logo)
  content/_config/facts.json  every figure pages repeat, used as {{tokens}}
  templates/doc.css           the stylesheet, inlined into each page

Nothing here writes files; the build_* tools do.
"""
import hashlib, html, json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parents[1]
TEMPLATES = ROOT / "templates"
CONFIG = ROOT / "content" / "_config"

MAX_DESCRIPTION = 160
CLUSTERS = [
    ("calculate", "Estimating output"),
    ("economics", "Savings and cost"),
    ("legal", "Rules and permission"),
    ("nyc", "New York City"),
    ("compare", "Comparisons"),
    ("basics", "Basics"),
]


# --- text -------------------------------------------------------------------

def plain(t):
    """HTML fragment -> plain text, for meta tags and structured data."""
    t = re.sub(r"<[^>]+>", "", t or "")
    return re.sub(r"\s+", " ", html.unescape(t)).strip()


def attr(t):
    return html.escape(plain(t), quote=True)


def esc(t):
    return html.escape(t or "", quote=True)


def jsonld(graph, indent="  "):
    # json.dumps escapes quotes and backslashes; "</" is escaped so no string
    # can close the <script> element early.
    body = json.dumps(graph, ensure_ascii=False, indent=2).replace("</", "<\\/")
    return "\n".join(indent + line for line in body.splitlines())


# --- config and facts ---------------------------------------------------------

def load_site():
    return json.loads((CONFIG / "site.json").read_text(encoding="utf-8"))


def load_facts():
    return json.loads((CONFIG / "facts.json").read_text(encoding="utf-8"))


TOKEN = re.compile(r"\{\{\s*([a-z0-9_]+(?:\.[a-z0-9_]+)+)\s*\}\}")


def fact(facts, key):
    node = facts
    for part in key.split("."):
        if not isinstance(node, dict) or part not in node:
            raise SystemExit(f"unknown fact {{{{{key}}}}}; add it to content/_config/facts.json")
        node = node[part]
    if isinstance(node, (dict, list)):
        raise SystemExit(f"fact {{{{{key}}}}} is not a single value")
    if isinstance(node, int) and not isinstance(node, bool) and abs(node) >= 1000:
        return f"{node:,}"
    return str(node)


def tokens(text, facts):
    """Replace {{a.b}} with facts['a']['b']. Unknown keys stop the build."""
    return TOKEN.sub(lambda m: fact(facts, m.group(1)), text)


def tokens_deep(obj, facts):
    if isinstance(obj, str):
        return tokens(obj, facts)
    if isinstance(obj, list):
        return [tokens_deep(x, facts) for x in obj]
    if isinstance(obj, dict):
        return {k: tokens_deep(v, facts) for k, v in obj.items()}
    return obj


# --- assets -----------------------------------------------------------------

def stamp(name):
    """Content hash for /js/<name>, matching tools/stamp_scripts.py."""
    return hashlib.sha256((ROOT / "js" / name).read_bytes()).hexdigest()[:8]


def css():
    return "  <style>\n" + (TEMPLATES / "doc.css").read_text(encoding="utf-8").rstrip() + "\n  </style>"


def hubs():
    """Hub pages that exist, so the nav never links to a page not yet built."""
    return {name: (ROOT / f"{name}.html").exists() for name in ("guides", "states", "nyc", "about")}


# --- shared blocks ------------------------------------------------------------

def nav():
    h = hubs()
    links = [('/', 'Calculator')]
    if h["guides"]:
        links.append(("/guides", "Guides"))
    if h["states"]:
        links.append(("/states", "States"))
    if h["nyc"]:
        links.append(("/nyc", "NYC"))
    links.append(("/methodology", "Methodology"))
    if h["about"]:
        links.append(("/about", "About"))
    site = load_site()
    items = "\n".join(f'      <a href="{u}">{t}</a>' for u, t in links)
    return f'''<nav class="doc-nav">
  <div class="container">
    <a href="/" class="logo"><img src="{site["logo"]}" alt="balco.nyc" width="400" height="218" decoding="async"></a>
    <div class="nav-links">
{items}
    </div>
  </div>
</nav>'''


def footer(manifest=None):
    site, facts, h = load_site(), load_facts(), hubs()
    pillars = [p for p in (manifest or []) if p.get("pillar") and p.get("indexable", True)]
    guide_links = "\n".join(f'        <a href="{p["url_path"]}">{esc(p["card_title"])}</a>' for p in pillars[:6])
    if h["guides"]:
        guide_links += '\n        <a href="/guides">All guides</a>'
    place_links = []
    if h["states"]:
        place_links.append('<a href="/states">Plug-in solar by state</a>')
    if h["nyc"]:
        place_links.append('<a href="/nyc">New York City</a>')
    place_links.append('<a href="/sunny-act">New York&rsquo;s SUNNY Act</a>')
    about = ['<a href="/methodology">Methodology</a>']
    if h["about"]:
        about.insert(0, '<a href="/about">About balco.nyc</a>')
    about.append('<a href="/llms.txt">llms.txt</a>')
    col = lambda title, links: (f'      <div>\n        <h2>{title}</h2>\n' +
                                "\n".join(f"        {l}" for l in links) + "\n      </div>")
    columns = [
        col("Calculator", ['<a href="/">Estimate your balcony</a>']),
        f'      <div>\n        <h2>Guides</h2>\n{guide_links}\n      </div>' if guide_links.strip() else "",
        col("By place", place_links),
        col("About", about),
    ]
    columns = "\n".join(c for c in columns if c)
    return f'''<footer>
  <div class="container">
    <a href="/" class="footer-logo"><img src="{site["logo"]}" alt="balco" width="400" height="218" loading="lazy" decoding="async"></a>
    <nav class="footer-links" aria-label="Site">
{columns}
    </nav>
    <p class="footer-disclaimer">{esc(site["entity_line"])} {esc(site["not_affiliated"])} NYC results carry a {facts["accuracy"]["nyc_phrase"]}. Plug-in solar rules vary by state; in New York the <a href="/sunny-act">SUNNY Act</a> has passed both chambers and {esc(facts["sunny"]["phrase"])}.</p>
    <p class="footer-meta">&copy; 2026</p>
  </div>
</footer>'''


def tail():
    return f'''<script src="/js/analytics.js?v={stamp("analytics.js")}"></script>

<script>
  // Highlight the TOC entry corresponding to the visible section.
  (function () {{
    var links = Array.prototype.slice.call(document.querySelectorAll('.doc-toc a'));
    var sections = links.map(function (a) {{
      return document.getElementById(a.getAttribute('href').slice(1));
    }}).filter(Boolean);

    if (!('IntersectionObserver' in window)) return;

    var observer = new IntersectionObserver(function (entries) {{
      entries.forEach(function (entry) {{
        if (entry.isIntersecting) {{
          var id = entry.target.id;
          links.forEach(function (a) {{
            a.classList.toggle('active', a.getAttribute('href') === '#' + id);
          }});
        }}
      }});
    }}, {{ rootMargin: '-30% 0px -60% 0px', threshold: 0 }});

    sections.forEach(function (s) {{ observer.observe(s); }});
  }}());
</script>

</body>
</html>'''


def breadcrumbs(items):
    """items: [(name, url_path)], home first. Visible trail; JSON-LD built separately."""
    li = []
    for i, (name, url) in enumerate(items):
        last = i == len(items) - 1
        li.append(f'<li><a href="{url}"{" aria-current=\"page\"" if last else ""}>{esc(name)}</a></li>')
    return ('<!--shared:start-->\n    <nav class="crumbs" aria-label="Breadcrumb"><ol>'
            + "".join(li) + '</ol></nav>\n    <!--shared:end-->')


def breadcrumb_ld(items):
    host = load_site()["host"]
    return {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": name, "item": host + url}
        for i, (name, url) in enumerate(items)]}


def related(links):
    """links: [{'url_path','card_title','card'}]"""
    if not links:
        return ""
    items = "\n".join(
        f'          <li><a href="{l["url_path"]}">{esc(l["card_title"])}</a><span>{esc(l.get("card", ""))}</span></li>'
        for l in links)
    return f'''<!--shared:start-->
        <aside class="related" aria-labelledby="relatedHeading">
          <h2 id="relatedHeading">Related guides</h2>
          <ul>
{items}
          </ul>
        </aside>
        <!--shared:end-->'''


def cta(text=None, href="/"):
    text = text or "Enter any US address to see what a panel on your balcony would produce and save, month by month."
    return f'''<!--shared:start-->
        <aside class="cta-block">
          <p><strong>Estimate your own balcony.</strong> {text}</p>
          <a class="cta-button" href="{href}">Open the calculator &rarr;</a>
        </aside>
        <!--shared:end-->'''


def org_node():
    site = load_site()
    return {"@type": "Organization", "@id": site["host"] + "/#org", "name": site["name"],
            "url": site["host"] + "/", "logo": site["host"] + site["logo"],
            "description": site["entity_line"], "sameAs": [site["github"]]}


# --- manifest -----------------------------------------------------------------

def content_specs():
    for path in sorted((ROOT / "content").glob("*.json")):
        yield path, json.loads(path.read_text(encoding="utf-8"))


def manifest():
    """Every generated page: url, title, cluster, card line, review date."""
    pages = []
    facts = load_facts()
    for _, raw in content_specs():
        spec = tokens_deep(raw, facts)
        pages.append({
            "url_path": f'/{spec["slug"]}',
            "file": f'{spec["slug"]}.html',
            "kind": spec.get("kind", "article"),
            "cluster": spec.get("cluster"),
            "pillar": bool(spec.get("pillar")),
            "card_title": plain(spec.get("card_title") or spec["og_title"]),
            "card": plain(spec.get("card", "")),
            "llms": plain(spec.get("llms") or spec.get("card", "")),
            "reviewed": spec["reviewed"],
            "indexable": not spec.get("noindex"),
            "related": spec.get("related", []),
        })
    states_dir = ROOT / "states"
    if states_dir.exists():
        index = ROOT / "data" / "state-pages.json"
        if index.exists():
            pages.extend(json.loads(index.read_text(encoding="utf-8")))
    return pages


# --- HTML to Markdown, for llms-full.txt ----------------------------------------

def html_to_md(fragment):
    """Just enough HTML -> Markdown for the site's own article markup."""
    t = fragment
    t = re.sub(r'<span class="sec-num">.*?</span>', "", t, flags=re.S)
    t = re.sub(r"<!--.*?-->", "", t, flags=re.S)

    def table(m):
        rows = re.findall(r"<tr>(.*?)</tr>", m.group(0), flags=re.S)
        out = []
        for i, row in enumerate(rows):
            cells = [plain(c) for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", row, flags=re.S)]
            out.append("| " + " | ".join(cells) + " |")
            if i == 0:
                out.append("|" + "---|" * len(cells))
        return "\n\n" + "\n".join(out) + "\n\n"
    t = re.sub(r"<table.*?</table>", table, t, flags=re.S)
    t = re.sub(r"<h2[^>]*>(.*?)</h2>", lambda m: "\n\n## " + plain(m.group(1)) + "\n\n", t, flags=re.S)
    t = re.sub(r"<h3[^>]*>(.*?)</h3>", lambda m: "\n\n### " + plain(m.group(1)) + "\n\n", t, flags=re.S)
    t = re.sub(r'<a [^>]*href="([^"]+)"[^>]*>(.*?)</a>',
               lambda m: f"[{plain(m.group(2))}]({m.group(1) if m.group(1).startswith('http') else 'https://balco.nyc' + m.group(1)})",
               t, flags=re.S)
    t = re.sub(r"<(strong|b)>(.*?)</\1>", r"**\2**", t, flags=re.S)
    t = re.sub(r"<(em|i)>(.*?)</\1>", r"*\2*", t, flags=re.S)
    t = re.sub(r"<li[^>]*>(.*?)</li>", lambda m: "\n- " + m.group(1).strip(), t, flags=re.S)
    t = re.sub(r'<div class="callout">(.*?)</div>', lambda m: "\n\n> " + plain(m.group(1)) + "\n\n", t, flags=re.S)
    t = re.sub(r"<pre><code>(.*?)</code></pre>", lambda m: "\n\n```\n" + html.unescape(m.group(1)) + "\n```\n\n", t, flags=re.S)
    t = re.sub(r"</p>|<br\s*/?>", "\n\n", t)
    t = re.sub(r"<[^>]+>", "", t)
    t = html.unescape(t)
    lines, fenced = [], False
    for line in t.split("\n"):
        if line.strip().startswith("```"):
            fenced = not fenced
        lines.append(line.rstrip() if fenced else line.strip())
    t = re.sub(r"\n{3,}", "\n\n", "\n".join(lines))
    return t.strip()
