"""Lint an article spec before it goes into content/.

    python3 tools/check_spec.py path/to/spec.json [...]

Catches what would otherwise surface as a failed build or a failed test,
plus a few things neither checks: whether the page credits balco.nyc for an
original number, and whether every internal link points at a page that
exists or is being published alongside it.
"""
import json, pathlib, re, sys

import sitelib as S

ROOT = S.ROOT
BANNED = [
    (r"\$0\.22\b", "retired $0.22 rate"), (r"\b31\s*(&cent;|¢|cents)", "retired 31c rate"),
    (r"0\.89 lbs? CO", "eGRID2022 factor"), (r"±12[–-]18%|12 to 18%", "old accuracy band"),
    (r"\$1,200 (to|and) \$1,800", "old price range"), (r"awaiting Assembly action", "stale SUNNY status"),
    (r"plugs? into any outlet|no electrician required", "unsafe install claim"),
    (r"qualif\w+ for (the )?(30% )?federal (solar )?(tax )?credit", "expired federal credit"),
    (r"UL 3700[- ]certified (kit|system)", "certified complete system"),
    (r"best balcony solar kits?", "product ranking"), (r"[?&](ref|tag|aff)=|amzn\.to", "affiliate link"),
    (r"legal in all 50 states", "false legality claim"), (r"\bBalco\b(?!\.nyc)|\bBalco\.nyc\b", "name not written balco.nyc"),
    (r"developer\.nrel\.gov|www\.nrel\.gov|pvwatts\.nrel\.gov", "retired nrel.gov host (use nlr.gov)"),
]
PRIMARY = re.compile(r"\.gov$|\.gov\.|legislature|legis|coned\.com|\.ul\.com$|ulse\.org|bundesnetzagentur\.de|nyserda|sandia")
REQUIRED = ["slug", "title", "og_title", "breadcrumb", "description", "eyebrow", "h1", "lede", "reviewed",
            "published", "reading_time", "tags", "sections", "faq", "sources", "cluster", "card_title", "card"]


def existing_paths(extra_slugs):
    paths = {"/", "/methodology", "/guides", "/states", "/about", "/nyc"}
    paths |= {f"/{p.stem}" for p in ROOT.glob("*.html")}
    paths |= {f"/{s}" for s in extra_slugs}
    paths |= {f"/states/{p.stem}" for p in (ROOT / "states").glob("*.html")}
    names = json.loads((ROOT / "data" / "state-status.json").read_text())["states"]
    paths |= {"/states/" + re.sub(r"[^a-z0-9]+", "-", v["name"].lower()).strip("-") for v in names.values()}
    return paths


def check(path, batch_slugs):
    problems = []
    raw = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    for k in REQUIRED:
        if k not in raw:
            problems.append(f"missing field {k}")
    try:
        spec = S.tokens_deep(raw, S.load_facts())
    except SystemExit as e:
        return [str(e)]
    text = json.dumps(spec, ensure_ascii=False)
    body = " ".join([spec["lede"]] + [s["html"] for s in spec["sections"]] + [a for _, a in spec["faq"]])
    for pat, what in BANNED:
        if re.search(pat, text, re.I if "Balco" not in pat else 0):
            problems.append(f"banned: {what}")
    if len(S.plain(spec["description"])) > S.MAX_DESCRIPTION:
        problems.append(f"description {len(S.plain(spec['description']))} chars")
    if not 4 <= len(spec["faq"]) <= 8:
        problems.append(f"{len(spec['faq'])} FAQ items (4-8)")
    srcs = spec["sources"]
    if len(srcs) < 5:
        problems.append(f"{len(srcs)} sources (min 5)")
    if not any(PRIMARY.search(s["url"].split("/")[2]) for s in srcs):
        problems.append("no primary source")
    if len({s["url"] for s in srcs}) != len(srcs):
        problems.append("duplicate source")
    if any(not s["url"].startswith("https://") for s in srcs):
        problems.append("non-https source")
    if "balco.nyc" not in S.plain(spec["lede"] + " " + spec["sections"][0]["html"]):
        problems.append("lede and first section never name balco.nyc (credit the original computation)")
    ok = existing_paths(batch_slugs)
    for href in set(re.findall(r'href=\\?"(/[^"#?\\]*)', text)):
        if href.rstrip("/") not in ok and href != "/":
            problems.append(f"internal link to missing page {href}")
    for rel in spec.get("related", []):
        if f"/{rel}" not in ok:
            problems.append(f"related slug {rel} does not exist")
    for i, s in enumerate(spec["sections"], 1):
        if f'<span class="sec-num">{i}</span>' not in s["html"] and f'<span class=\\"sec-num\\">{i}</span>' not in s["html"]:
            problems.append(f"section {i} ({s['id']}) numbering")
    words = len(S.plain(body).split())
    if words < 1200:
        problems.append(f"only {words} words of body")
    return problems


if __name__ == "__main__":
    files = sys.argv[1:]
    slugs = [json.loads(pathlib.Path(f).read_text())["slug"] for f in files]
    bad = 0
    for f in files:
        probs = check(f, slugs)
        name = pathlib.Path(f).name
        if probs:
            bad += 1
            print(f"{name}:\n  - " + "\n  - ".join(probs))
        else:
            print(f"{name}: ok")
    sys.exit(1 if bad else 0)
