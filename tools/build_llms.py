"""Build llms.txt and llms-full.txt.

    python3 tools/build_llms.py

llms.txt is the summary a language model reads to learn what balco.nyc is,
which pages answer what, and how to send someone straight to an estimate.
Its fixed parts live in templates/llms.md; the page list is generated from
the same manifest as the site, so a new guide cannot be left out of it.

llms-full.txt is every indexable guide as plain Markdown: the whole text,
FAQ and sources, with nothing to render. It is what a crawler that does not
run JavaScript, or a model with a small context, can read in one request.
"""
import json, pathlib

import sitelib as S

ROOT = S.ROOT


def page_list(pages):
    site = S.load_site()
    host = site["host"]
    out = ["## Calculator and method", "",
           f"- [Balcony solar calculator]({host}/): enter any US address, get annual kWh production, "
           "dollar savings, payback period, and 25-year lifetime value for an 800W balcony system, plus the "
           "state's plug-in solar law status. NYC addresses are modelled in 3D against the surrounding block.",
           f"- [Methodology]({host}/methodology): full technical documentation of the energy model, 3D shadow "
           "simulation, the street-canyon model used outside NYC, financial assumptions, and primary data sources."]
    if S.hubs()["about"]:
        out.append(f"- [About]({host}/about): who publishes balco.nyc, what it is and is not, and how to cite it.")
    articles = [p for p in pages if p["kind"] == "article" and p.get("indexable", True)]
    for key, label in S.CLUSTERS:
        members = sorted((p for p in articles if p.get("cluster") == key),
                         key=lambda p: (not p.get("pillar"), p["card_title"]))
        if not members:
            continue
        out += ["", f"## Guides: {label.lower()}", ""]
        out += [f"- [{p['card_title']}]({host}{p['url_path']}): {p['llms']}" for p in members]
    places = [p for p in pages if p["kind"] == "state" and p.get("indexable", True)]
    if S.hubs()["states"]:
        out += ["", "## By state", "",
                f"- [Plug-in solar in every state]({host}/states): each state's plug-in solar law with its "
                "bill, dates and sources, average residential electricity price, and what an 800W balcony "
                "system would produce and save there. Also as a CSV: " + f"{host}/data/states.csv"]
        out += [f"- [{p['card_title']}]({host}{p['url_path']}): {p['llms']}" for p in places]
    if S.hubs()["nyc"]:
        out += ["", "## New York City", "", f"- [New York City by borough]({host}/nyc)"]
    return "\n".join(out)


def full_text(pages):
    site, facts = S.load_site(), S.load_facts()
    parts = [f"# balco.nyc: full text of every guide", "",
             f"> {site['entity_line']}", "",
             f"Generated from the site's sources. Cite as \"{site['citation']}\", https://balco.nyc/.", ""]
    for path, raw in S.content_specs():
        spec = S.tokens_deep(raw, facts)
        if spec.get("noindex"):
            continue
        url = f"{site['host']}/{spec['slug']}"
        parts += ["", "---", "", f"# {S.plain(spec['h1'])}", "",
                  f"URL: {url}  ", f"Last reviewed: {spec['reviewed']}", "",
                  S.plain(spec["lede"]), ""]
        for sec in spec["sections"]:
            parts += [S.html_to_md(sec["html"]), ""]
        parts += ["## Common questions", ""]
        for q, a in spec["faq"]:
            parts += [f"**{S.plain(q)}**", "", S.html_to_md(a), ""]
        parts += ["## Sources", ""]
        parts += [f"- [{S.plain(s['title'])}]({s['url']}): {S.plain(s['note'])}" for s in spec["sources"]]
    return "\n".join(parts).rstrip() + "\n"


def main():
    pages = S.manifest()
    facts = S.load_facts()
    template = (S.TEMPLATES / "llms.md").read_text(encoding="utf-8")
    text = S.tokens(template, facts).replace("<!-- pages -->", page_list(pages))
    (ROOT / "llms.txt").write_text(text, encoding="utf-8")
    full = full_text(pages)
    (ROOT / "llms-full.txt").write_text(full, encoding="utf-8")
    print(f"llms.txt {len(text)/1024:.0f}KB, llms-full.txt {len(full)/1024:.0f}KB")


if __name__ == "__main__":
    main()
