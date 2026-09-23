"""Build /states and one page per state (/states/<name>).

    python3 tools/build_state_pages.py

Every number on these pages is computed here from four data files, with the
calculator's own assumptions, so a state page and the calculator agree:

  data/state-status.json      plug-in solar law, researched and dated
  data/state-energy.json      EIA average residential price and household use
  data/grid-emissions.json    EPA eGRID2023 subregion CO2 rates
  data/state-pvwatts.json     PVWatts for the state's largest city, 800 W,
                              eight directions on a railing and three tilts

A state page is only indexable when it carries prose that exists nowhere
else on the site: the researched notes on its law, or a written introduction
in content/states/<slug>.json. The numbers alone make a useful page for a
visitor who arrives from the calculator, but fifty pages that differ only in
their figures are exactly what search engines call thin, so those pages ship
with noindex until someone writes for them.

Also writes data/state-pages.json (the manifest the rest of the build reads)
and data/states.csv (the table, for anyone who wants to reuse it).
"""
import csv, datetime, io, json, math, re

import sitelib as S

ROOT = S.ROOT
DIRS = [(180, "South"), (135, "Southeast"), (225, "Southwest"), (90, "East"),
        (270, "West"), (45, "Northeast"), (315, "Northwest"), (0, "North")]
STATUS_LABEL = {
    "in_force": "Law in effect",
    "enacted_not_yet_effective": "Signed, not yet in effect",
    "passed_awaiting_signature": "Passed, awaiting signature",
    "pending": "Bill pending",
    "no_specific_law": "No plug-in solar law",
    "failed_or_vetoed": "Bill did not pass",
    "unknown": "Not yet reviewed",
}
STATUS_ORDER = list(STATUS_LABEL)
MIN_UNIQUE_WORDS = 150


def load(name):
    return json.loads((ROOT / "data" / name).read_text(encoding="utf-8"))


def slugify(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def payback(kwh, rate, cost, degradation, escalation):
    """Nominal payback, the calculator's loop (js/solar-api.js calculateEstimate)."""
    cum = 0.0
    for i in range(25):
        year = kwh * (1 - degradation) ** i * rate * (1 + escalation) ** i
        if cum + year >= cost:
            return i + (cost - cum) / year
        cum += year
    return None


def ordinal(n):
    return f"{n}{'th' if 11 <= n % 100 <= 13 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def fmt_date(iso):
    if not iso:
        return None
    d = datetime.date.fromisoformat(iso)
    return f"{d.day} {d.strftime('%B')} {d.year}"


def money(x):
    return f"${x:,.0f}"


def compute():
    facts = S.load_facts()
    status, energy, grid, pvw, cities = (load("state-status.json"), load("state-energy.json"),
                                         load("grid-emissions.json"), load("state-pvwatts.json"),
                                         load("state-reference-cities.json"))
    rail = {int(k): v for k, v in facts["model"]["railing_factor"].items()}
    deg, esc = facts["model"]["degradation_mid"], facts["model"]["escalation_mid"]
    kits = facts["kits"]
    rows = {}
    for code, st in status["states"].items():
        runs = pvw["states"].get(code, {}).get("runs", {})
        if any(f"90_{a}" not in runs for a, _ in DIRS) or any(f"{t}_180" not in runs for t in (35, 60, 70)):
            raise SystemExit(f"{code}: PVWatts runs missing; run tools/fetch_state_pvwatts.js")
        city = cities["states"][code]
        rate = energy["states"][code]["cents"] / 100
        use = energy["states"][code]["avg_monthly_kwh"] * 12
        zip5 = city["zip"]
        sub = grid["zip5"].get(zip5) or grid["zip3"].get(zip5[:3])
        co2_rate = grid["subregions"][sub]["co2_lb_per_mwh"] / 1000
        kwh = {a: runs[f"90_{a}"]["ac_annual"] * rail[90] for a, _ in DIRS}
        tilt = {t: runs[f"{t}_180"]["ac_annual"] * rail[t] for t in (35, 60, 70)}
        monthly_s = [v * rail[90] for v in runs["90_180"]["ac_monthly"]]
        rows[code] = {
            "code": code, "name": st["name"], "slug": slugify(st["name"]), "status": st,
            "city": city["city"], "rate": rate, "use_kwh": use, "subregion": sub,
            "subregion_name": grid["subregions"][sub]["name"], "co2_rate": co2_rate,
            "kwh": kwh, "tilt": tilt, "monthly_s": monthly_s,
            "savings_s": kwh[180] * rate,
            "payback": {tier: payback(kwh[180], rate, kits[tier], deg, esc) for tier in ("budget", "mid", "premium")},
            "payback_ew": payback((kwh[90] + kwh[270]) / 2, rate, kits["mid"], deg, esc),
            "payback_n": payback(kwh[0], rate, kits["mid"], deg, esc),
            "coverage": kwh[180] / use,
            "winter_summer": sum(monthly_s[i] for i in (11, 0, 1)) / sum(monthly_s[i] for i in (5, 6, 7)),
        }
    # national ranks
    def rank(key, reverse):
        order = sorted(rows, key=lambda c: key(rows[c]), reverse=reverse)
        return {c: i + 1 for i, c in enumerate(order)}
    ranks = {"rate": rank(lambda r: r["rate"], True), "kwh": rank(lambda r: r["kwh"][180], True),
             "savings": rank(lambda r: r["savings_s"], True),
             "payback": rank(lambda r: r["payback"]["mid"] or 99, False)}
    for c, r in rows.items():
        r["rank"] = {k: v[c] for k, v in ranks.items()}
    return rows, energy, status


def share_of_variance(rows):
    """r^2 of log(payback) against log(rate) and against log(output), across states."""
    xs_rate = [math.log(r["rate"]) for r in rows.values()]
    xs_kwh = [math.log(r["kwh"][180]) for r in rows.values()]
    ys = [math.log(r["payback"]["mid"] or 25) for r in rows.values()]

    def r2(xs):
        n = len(xs)
        mx, my = sum(xs) / n, sum(ys) / n
        sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
        sxx = sum((x - mx) ** 2 for x in xs)
        syy = sum((y - my) ** 2 for y in ys)
        return (sxy * sxy) / (sxx * syy)
    return r2(xs_rate), r2(xs_kwh)


# --- wording --------------------------------------------------------------------

def law_sentence(r):
    st, name = r["status"], r["name"]
    bills = " / ".join(b["id"] for b in st.get("bills") or [])
    s = st["status"]
    if s == "in_force":
        return (f"{name} has a plug-in solar law in effect ({bills}), in force since {fmt_date(st['effective_date'])}. "
                f"Small plug-in systems no longer need the utility&rsquo;s interconnection approval there, "
                f"within the limits below.")
    if s == "enacted_not_yet_effective":
        return (f"{name} has signed a plug-in solar law ({bills}) that takes effect on {fmt_date(st['effective_date'])}. "
                f"Until then, the utility&rsquo;s interconnection rules still apply.")
    if s == "passed_awaiting_signature":
        return (f"A plug-in solar bill ({bills}) has passed {name}&rsquo;s legislature and awaits the Governor&rsquo;s "
                f"signature. Until it is signed and takes effect, the utility&rsquo;s approval is still required.")
    if s == "pending":
        return (f"A plug-in solar bill ({bills}) is pending in {name}. Until one passes, the utility&rsquo;s "
                f"interconnection rules apply, which usually means approval is required.")
    if s == "failed_or_vetoed":
        return (f"A plug-in solar bill in {name} ({bills}) did not become law. The utility&rsquo;s interconnection "
                f"rules apply, which usually means approval is required.")
    if s == "no_specific_law":
        return (f"{name} has no plug-in solar law that we could find. The utility&rsquo;s interconnection rules "
                f"apply, which usually means approval is required before anything that feeds power into a home "
                f"circuit is connected.")
    return (f"We have not yet reviewed {name}&rsquo;s rules. Check with your utility before plugging anything in.")


EXPORT = {"none": "Surplus power earns nothing: the law excludes these devices from net metering.",
          "credited": "Surplus power can earn a credit under the state&rsquo;s rules.",
          "unknown": "The law does not say whether surplus power is credited, so the estimates here assume it is not."}
EXPORT_BILL = {"none": "Surplus power would earn nothing: the bill excludes these devices from net metering.",
               "credited": "Surplus power would earn a credit under the bill.",
               "unknown": "The bill does not say whether surplus power would be credited, so the estimates here assume it would not."}


def export_text(st):
    table = EXPORT_BILL if st["status"] == "passed_awaiting_signature" else EXPORT
    return table.get(st.get("export_compensation") or "unknown")


def rights_sentence(st, has_intro=False):
    if st["status"] not in ("in_force", "enacted_not_yet_effective", "passed_awaiting_signature"):
        if has_intro:
            return ("No plug-in solar law gives a right to install one. The state&rsquo;s general solar-access rules, "
                    "where they exist, were mostly written for roofs; the notes above say what they cover. Otherwise a "
                    "renter needs the landlord&rsquo;s permission and a condo or co-op resident the board&rsquo;s.")
        return ("No plug-in solar law gives a right to install one, so a renter needs the landlord&rsquo;s permission "
                "and a condo or co-op resident the board&rsquo;s, unless a general solar-access law covers the balcony.")
    g = st.get("grants_right_to_install")
    if g is True:
        return "Yes, in part: the law limits a landlord&rsquo;s or association&rsquo;s power to refuse. The details are in the notes above."
    if g is False:
        return "The law gives no right to install. A renter still needs the landlord&rsquo;s permission, and a condo or co-op resident the board&rsquo;s."
    return "There is no state law giving a right to install, so a renter needs the landlord&rsquo;s permission and a condo or co-op resident the board&rsquo;s."


# --- pages ----------------------------------------------------------------------

def state_page(r, rows, energy, extra, pages):
    site, facts = S.load_site(), S.load_facts()
    st = r["status"]
    name, city, cents = r["name"], r["city"], r["rate"] * 100
    url_path = f"/states/{r['slug']}"
    url = site["host"] + url_path
    us = energy["us_cents"]
    kwh_s, sav_s = r["kwh"][180], r["savings_s"]
    pb = r["payback"]["mid"]
    pb_text = f"{pb:.1f} years" if pb else "more than 25 years"
    rate_cmp = "above" if cents > us else "below"

    lede = (f"{law_sentence(r)} An 800&nbsp;W balcony system on a south-facing railing in {city} would produce about "
            f"<strong>{kwh_s:,.0f}&nbsp;kWh a year</strong> in balco.nyc&rsquo;s PVWatts model, worth about "
            f"<strong>{money(sav_s)}</strong> at {name}&rsquo;s average residential price of {cents:.1f}&cent;/kWh "
            f"({ordinal(r['rank']['rate'])} highest of 51), which pays back a $1,200 kit in about {pb_text}.")

    # law table
    bills = "<br>".join(f'<a href="{b["url"]}" target="_blank" rel="noopener">{S.esc(b["id"])}</a>'
                        + (f" ({S.esc(b.get('session') or '')})" if b.get("session") else "")
                        for b in st.get("bills") or []) or "None found"
    law_rows = [("Status", STATUS_LABEL[st["status"]]), ("Bill", bills)]
    if st.get("signed_date"):
        law_rows.append(("Signed", fmt_date(st["signed_date"])))
    if st.get("effective_date"):
        law_rows.append(("In effect from", fmt_date(st["effective_date"])))
    # Size, equipment and export terms describe a law only once one exists.
    # For a bill that is pending or died they are what was proposed.
    enacted = st["status"] in ("in_force", "enacted_not_yet_effective", "passed_awaiting_signature")
    proposed = "" if enacted else " (as proposed)"
    if st.get("ac_limit_watts") and st["status"] not in ("no_specific_law", "unknown"):
        law_rows.append((f"Size limit{proposed}", f"{st['ac_limit_watts']:,}&nbsp;W"))
    if st.get("certification") and st["status"] not in ("no_specific_law", "unknown"):
        law_rows.append((f"Equipment{proposed}", S.esc(st["certification"])))
    if enacted:
        law_rows.append(("Surplus power", export_text(st)))
    law_rows.append(("Checked", fmt_date(st.get("reviewed")) or "Not yet reviewed"))
    law_table = "\n".join(f"    <tr><th>{k}</th><td>{v}</td></tr>" for k, v in law_rows)
    notes = f"  <p>{S.esc(st['notes'])}</p>\n" if st.get("notes") else ""
    intro = extra.get("intro_html", "")

    # output table
    out_rows = "\n".join(
        f"    <tr><td>{label}</td><td>{r['kwh'][a]:,.0f}</td><td>{money(r['kwh'][a] * r['rate'])}</td></tr>"
        for a, label in DIRS)
    tilt_rows = "\n".join(
        f"    <tr><td>South, tilted {t}&deg;</td><td>{r['tilt'][t]:,.0f}</td><td>{money(r['tilt'][t] * r['rate'])}</td></tr>"
        for t in (70, 60, 35))
    ew = (r["kwh"][90] + r["kwh"][270]) / 2
    pay_rows = "\n".join(
        f"    <tr><td>{tier.capitalize()} (${facts['kits'][tier]:,})</td>"
        f"<td>{(f'{p:.1f} yrs' if p else '25+ yrs')}</td></tr>"
        for tier, p in r["payback"].items())
    co2 = kwh_s * r["co2_rate"]
    ny_note = ""
    if r["code"] == "NY":
        coned = facts["coned"]["rate_cents"]
        ny_note = (f"\n  <p>In New York City the calculator values a kWh differently: at Con&nbsp;Edison&rsquo;s all-in "
                   f"<em>marginal</em> rate of about {coned}&cent;, which excludes the fixed monthly charge a panel cannot "
                   f"reduce. At that rate the same south-facing panel would save about "
                   f"{money(kwh_s * coned / 100)} a year. <a href=\"/electricity-rate\">Why the two numbers differ</a>; "
                   f"<a href=\"/sunny-act\">where the SUNNY Act stands</a>.</p>")

    sections = [
        ("law", f"Is plug-in solar legal in {name}?", f'''  <p>{law_sentence(r)}</p>
{intro}{notes}  <div class="table-wrap"><table><tbody>
{law_table}
  </tbody></table></div>
  <p class="table-note">Plug-in solar law is changing quickly. This entry was checked against {name}&rsquo;s own legislature pages where they could be reached; it is not legal advice. <a href="/states">Every state&rsquo;s status</a>.</p>'''),
        ("output", f"What a balcony panel would produce in {city}", f'''  <p>These figures are NREL PVWatts runs for {city}&rsquo;s city hall with the calculator&rsquo;s parameters: an 800&nbsp;W system, premium modules on an open rack, a micro-inverter, an urban soiling profile, and a {int((1 - S.load_facts()["model"]["railing_factor"]["90"]) * 100)}% loss for the railing and mounting hardware on a vertical panel. They assume nothing across the street casts a shadow, so they are a ceiling for an unshaded balcony, not an expectation.</p>
  <div class="table-wrap"><table>
    <thead><tr><th>Balcony faces</th><th>kWh a year</th><th>Worth a year at {cents:.1f}&cent;</th></tr></thead>
    <tbody>
{out_rows}
{tilt_rows}
    </tbody>
  </table></div>
  <p>An east- or west-facing railing makes {ew / kwh_s:.0%} of what a south-facing one does here, and a north-facing one {r['kwh'][0] / kwh_s:.0%}. A vertical south panel in {city} makes {r['winter_summer']:.2f} times as much in December to February as in June to August{" &mdash; more in winter than summer, because a railing faces the low winter sun almost head-on" if r['winter_summer'] > 1 else ""}. {city} ranks {ordinal(r['rank']['kwh'])} of 51 for south-facing output.</p>'''),
        ("savings", "What it would save, and when it pays back", f'''  <p>{name}&rsquo;s average residential price over the {energy["period_label"].replace("12 months to", "twelve months to")} was <strong>{cents:.1f}&cent;/kWh</strong>, {rate_cmp} the US average of {us:.1f}&cent;, according to the U.S. Energy Information Administration. That is an average: it spreads fixed monthly charges across every kWh, so it can differ from what a kWh you no longer buy actually saves. The calculator lets you enter the rate from your own bill instead.</p>{ny_note}
  <div class="table-wrap"><table>
    <thead><tr><th>Kit (hardware only)</th><th>Payback, south-facing</th></tr></thead>
    <tbody>
{pay_rows}
    </tbody>
  </table></div>
  <p>Payback assumes every kWh is used at home, a 3% annual rise in the electricity price and 0.5% a year of panel degradation, with no discounting. With the $1,200 mid-range kit an east- or west-facing balcony pays back in {(f"{r['payback_ew']:.1f} years" if r['payback_ew'] else "more than 25 years")} and a north-facing one in {(f"{r['payback_n']:.1f} years" if r['payback_n'] else "more than 25 years")}. A household using {name}&rsquo;s average of {r['use_kwh'] / 12:,.0f}&nbsp;kWh a month would cover about <strong>{r['coverage']:.0%}</strong> of its electricity with a south-facing panel.</p>'''),
        ("emissions", "Emissions", f'''  <p>{city} is on EPA&rsquo;s {S.esc(r["subregion_name"])} grid subregion ({r["subregion"]}), which emitted {r["co2_rate"]:.3f}&nbsp;lb of CO&#8322; per kWh generated in 2023 (eGRID2023). A south-facing panel producing {kwh_s:,.0f}&nbsp;kWh a year would avoid about <strong>{co2:,.0f}&nbsp;lb</strong> of CO&#8322;.</p>'''),
    ]
    faq = [
        (f"Is balcony solar legal in {name}?", law_sentence(r) + (" " + S.esc(st["summary"]) if st.get("summary") else "")),
        (f"How much would a balcony solar panel produce in {name}?",
         f"About {kwh_s:,.0f} kWh a year for an unshaded 800 W system on a south-facing railing in {city}, "
         f"{ew:,.0f} kWh facing east or west, and {r['kwh'][0]:,.0f} kWh facing north, in balco.nyc&rsquo;s PVWatts model. "
         f"Shade from buildings or trees opposite lowers it; the calculator models that for your address."),
        (f"How much would balcony solar save in {name}?",
         f"About {money(sav_s)} a year for a south-facing panel at {name}&rsquo;s average residential price of "
         f"{cents:.1f}&cent;/kWh, with a payback of about {pb_text} on a $1,200 kit. Savings assume all the power is used at home."),
        (f"Does {name} pay for surplus balcony solar power?",
         export_text(st)
         if st["status"] in ("in_force", "enacted_not_yet_effective", "passed_awaiting_signature") else
         f"{name} has no plug-in solar law, so there is no rule for it; connecting a device that exports "
         f"power normally needs the utility&rsquo;s approval first. The estimates here assume surplus power earns nothing."),
        (f"Do renters in {name} need permission to install balcony solar?", rights_sentence(st, bool(intro))),
    ]
    sources = [{"url": s["url"], "title": S.esc(s["title"]), "note": "Plug-in solar law (primary source)." if s.get("primary") else "Reporting on the law."}
               for s in (st.get("sources") or [])]
    have = {x["url"] for x in sources}
    sources += [x for x in extra.get("sources", []) if x["url"] not in have]
    faq += [tuple(x) for x in extra.get("faq", [])]
    sources += [
        {"url": energy["source_url"], "title": "U.S. EIA, Form EIA-861M monthly sales and revenue by state",
         "note": f"Average residential price, {energy['period_label']}."},
        {"url": "https://www.eia.gov/electricity/sales_revenue_price/", "title": "U.S. EIA, Table 5A: average monthly residential consumption",
         "note": "Average household electricity use by state."},
        {"url": "https://developer.nlr.gov/docs/solar/pvwatts/v8/", "title": "NREL PVWatts V8",
         "note": f"Solar production model, run for {city} with the calculator's parameters."},
        {"url": "https://www.epa.gov/egrid/summary-data", "title": "EPA eGRID2023 summary data",
         "note": f"CO2 output emission rate for the {r['subregion']} subregion."},
    ]
    unique_text = S.plain(intro + " " + (st.get("notes") or ""))
    unique_words = len(unique_text.split())
    indexable = unique_words >= MIN_UNIQUE_WORDS and st["status"] != "unknown"
    reviewed = max(filter(None, [st.get("reviewed"), energy["retrieved"]]))

    crumbs = [("balco.nyc", "/"), ("States", "/states"), (name, url_path)]
    description = (f"Is balcony solar legal in {name}, and what would an 800 W panel make? "
                   f"{STATUS_LABEL[st['status']]}; about {kwh_s:,.0f} kWh and {money(sav_s)} a year in {city}.")
    if len(description) > S.MAX_DESCRIPTION:
        description = f"Is balcony solar legal in {name}? {STATUS_LABEL[st['status']]}. An 800 W panel makes about {kwh_s:,.0f} kWh a year in {city}."
    graph = {"@context": "https://schema.org", "@graph": [
        {"@type": "Article", "@id": f"{url}#article", "headline": f"Balcony solar in {name}: rules, output and savings",
         "description": S.plain(description), "url": url, "mainEntityOfPage": url, "inLanguage": "en-US",
         "datePublished": "2026-09-23", "dateModified": reviewed,
         "image": {"@type": "ImageObject", "url": site["og_image"], "width": site["og_image_width"], "height": site["og_image_height"]},
         "author": {"@id": site["host"] + "/#org"}, "publisher": {"@id": site["host"] + "/#org"},
         "isPartOf": {"@id": site["host"] + "/#app"},
         "about": {"@type": "State", "name": name, "containedInPlace": {"@type": "Country", "name": "United States"}},
         "citation": [{"@type": "CreativeWork", "name": S.plain(s["title"]), "url": s["url"]} for s in sources]},
        {"@type": "FAQPage", "@id": f"{url}#faq", "dateModified": reviewed, "inLanguage": "en-US",
         "mainEntity": [{"@type": "Question", "name": S.plain(q), "acceptedAnswer": {"@type": "Answer", "text": S.plain(a)}} for q, a in faq]},
        S.org_node(), S.breadcrumb_ld(crumbs),
    ]}
    body = []
    for i, (sid, title, html_) in enumerate(sections, 1):
        body.append(f'        <section id="{sid}">\n  <h2><span class="sec-num">{i}</span>{title}</h2>\n{html_}\n</section>')
        if i == 2:
            body.append("        " + S.cta(f"Enter any address in {name} to see what a panel on your balcony would make, with the building across the street taken into account."))
    n = len(sections)
    toc = "\n".join(f'          <li><a href="#{sid}">{t}</a></li>' for sid, t, _ in sections)
    faq_html = "\n".join(f"        <details>\n          <summary>{q}</summary>\n          <p>{a}</p>\n        </details>" for q, a in faq)
    src_html = "\n".join(
        f'            <li><a href="{s["url"]}" target="_blank" rel="noopener">{s["title"]}</a> '
        f'<span class="src-host">{s["url"].split("/")[2].replace("www.", "")}</span> &mdash; {s["note"]}</li>' for s in sources)
    neighbours = sorted((x for x in rows.values() if x["code"] != r["code"]),
                        key=lambda x: abs(x["rate"] - r["rate"]))[:3]
    related = [{"url_path": f"/states/{x['slug']}", "card_title": f"Balcony solar in {x['name']}",
                "card": f"{x['rate'] * 100:.1f}¢/kWh; {STATUS_LABEL[x['status']['status']].lower()}."} for x in neighbours]
    related.append({"url_path": "/sunny-act", "card_title": "Is plug-in solar legal in New York?",
                    "card": "The SUNNY Act and what it would and would not change."})
    robots = "" if indexable else '\n  <meta name="robots" content="noindex, follow">'
    page = f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="{S.attr(description)}">
  <title>Balcony solar in {name}: rules, output and savings &middot; balco.nyc</title>{robots}
  <link rel="icon" type="image/webp" href="{site["logo"]}">
  <link rel="canonical" href="{url}">
  <meta name="theme-color" content="#7F1D1D">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="balco.nyc">
  <meta property="og:url" content="{url}">
  <meta property="og:title" content="Balcony solar in {name}: rules, output and savings">
  <meta property="og:description" content="{S.attr(description)}">
  <meta property="og:image" content="{site["og_image"]}">
  <meta property="article:modified_time" content="{reviewed}">
  <meta name="twitter:card" content="summary_large_image">
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
      <div class="doc-eyebrow"><span class="dot"></span> {STATUS_LABEL[st["status"]]}</div>
      <h1>Balcony solar in {name}</h1>
      <p class="lede">{lede}</p>
      <div class="doc-meta-row">
        <div><strong>Last checked:</strong> <time datetime="{reviewed}">{fmt_date(reviewed)}</time></div>
        <div class="doc-tags">
          <span class="doc-tag">{kwh_s:,.0f}&nbsp;kWh/yr south</span>
          <span class="doc-tag">{cents:.1f}&cent;/kWh</span>
          <span class="doc-tag">{STATUS_LABEL[st["status"]]}</span>
        </div>
      </div>
    </header>

    <div class="doc-layout">
      <aside class="doc-toc" aria-label="Table of contents">
        <h2>Contents</h2>
        <ol>
{toc}
          <li><a href="#questions">Common questions</a></li>
          <li><a href="#sources">Sources</a></li>
        </ol>
      </aside>

      <article class="doc-content">

{chr(10).join(body)}

        <section id="questions">
          <h2><span class="sec-num">{n + 1}</span>Common questions</h2>
{faq_html}
        </section>

        <section id="sources">
          <h2><span class="sec-num">{n + 2}</span>Sources</h2>
          <ul>
{src_html}
          </ul>
          <p>This page is maintained by <a href="/">balco.nyc</a>. {S.esc(site["entity_line"])} It is not legal or financial advice.</p>
        </section>

        {S.related(related)}

      </article>
    </div>
  </div>
</main>

{S.footer(pages)}

{S.tail()}'''
    manifest_entry = {
        "url_path": url_path, "file": f"states/{r['slug']}.html", "kind": "state", "cluster": None,
        "pillar": False, "card_title": f"Balcony solar in {name}",
        "card": f"{STATUS_LABEL[st['status']]}; about {kwh_s:,.0f} kWh and {money(sav_s)} a year for a south-facing 800 W panel in {city}.",
        "llms": (f"{STATUS_LABEL[st['status']].lower()}; an 800 W south-facing balcony panel in {city} makes about "
                 f"{kwh_s:,.0f} kWh and saves about {money(sav_s)} a year at {cents:.1f}¢/kWh."),
        "reviewed": reviewed, "indexable": indexable, "related": [], "unique_words": unique_words,
    }
    return page, manifest_entry


def hub(rows, energy, status, pages):
    site = S.load_site()
    r2_rate, r2_kwh = share_of_variance(rows)
    counts = {s: sum(1 for r in rows.values() if r["status"]["status"] == s) for s in STATUS_ORDER}
    signed = [r for r in rows.values() if r["status"]["status"] in ("in_force", "enacted_not_yet_effective")]
    reviewed = max(r["status"].get("reviewed") or "" for r in rows.values())
    def years(p):
        return f"{p:.1f}" if p else "25+"
    table = "\n".join(
        f'      <tr data-status="{r["status"]["status"]}"><td><a href="/states/{r["slug"]}">{r["name"]}</a></td>'
        f'<td>{STATUS_LABEL[r["status"]["status"]]}</td><td>{r["rate"] * 100:.1f}</td>'
        f'<td>{r["kwh"][180]:,.0f}</td><td>{money(r["savings_s"])}</td>'
        f'<td>{years(r["payback"]["mid"])}</td></tr>'
        for r in sorted(rows.values(), key=lambda r: r["name"]))
    tiles = "\n".join(
        f'      <a class="tile s-{r["status"]["status"]}" href="/states/{r["slug"]}" title="{r["name"]}: {STATUS_LABEL[r["status"]["status"]]}">{r["code"]}</a>'
        for r in sorted(rows.values(), key=lambda r: r["code"]))
    legend = "\n".join(f'      <span class="tile-key s-{s}">{STATUS_LABEL[s]} ({counts[s]})</span>'
                       for s in STATUS_ORDER if counts[s])
    best = sorted(rows.values(), key=lambda r: r["payback"]["mid"] or 99)[:5]
    worst = sorted(rows.values(), key=lambda r: r["payback"]["mid"] or 99)[-5:]
    sunniest = max(rows.values(), key=lambda r: r["kwh"][180])
    dullest = min(rows.values(), key=lambda r: r["kwh"][180])
    body = f'''      <section id="summary">
        <h2>The short answer</h2>
        <p>As of {fmt_date(reviewed)}, <strong>{len(signed)} states</strong> have signed a plug-in solar law: {", ".join(sorted(r["name"] for r in signed))}. {counts["in_force"]} of them are already in force. New York&rsquo;s SUNNY Act has passed both chambers and awaits the Governor&rsquo;s signature. Everywhere else, a device that feeds power into a home circuit still needs the utility&rsquo;s approval, and {counts["unknown"]} states have not yet been reviewed for this table.</p>
        <p>What a balcony panel is worth depends far more on the price of electricity than on the sunshine. Across the 51 states and DC, the electricity price explains <strong>{r2_rate:.0%}</strong> of the variation in payback time; how much a south-facing panel produces explains <strong>{r2_kwh:.0%}</strong>. {sunniest["city"]} gets the most from a south-facing railing ({sunniest["kwh"][180]:,.0f}&nbsp;kWh a year) and {dullest["city"]} the least ({dullest["kwh"][180]:,.0f}), but payback is fastest in {", ".join(r["name"] for r in best[:3])}, where electricity is dearest.</p>
      </section>

      <section id="map">
        <h2>Where plug-in solar is allowed</h2>
        <div class="tile-map" aria-label="Plug-in solar law by state">
{tiles}
        </div>
        <div class="tile-legend">
{legend}
        </div>
      </section>

      <section id="table">
        <h2>Every state, side by side</h2>
        <p>An 800&nbsp;W system on an unshaded south-facing railing in each state&rsquo;s largest city, valued at the state&rsquo;s average residential price ({energy["period_label"]}), paying back a $1,200 kit. Select a state for its law, eight directions, three tilts and the sources. The same table is available as <a href="/data/states.csv">a CSV file</a> (CC BY 4.0: please credit balco.nyc).</p>
        <div class="table-wrap"><table class="state-table">
          <thead><tr><th>State</th><th>Plug-in solar law</th><th>&cent;/kWh</th><th>kWh/yr</th><th>Saves/yr</th><th>Payback (yrs)</th></tr></thead>
          <tbody>
{table}
          </tbody>
        </table></div>
      </section>

      <section id="method">
        <h2>How this table is made</h2>
        <p>Law: researched state by state from legislature bill pages and chaptered text where they could be reached, with the sources and review date on each state&rsquo;s page. Price: U.S. EIA average residential revenue divided by sales over twelve months. Output: NREL PVWatts, run with the calculator&rsquo;s own parameters for each largest city&rsquo;s city hall, less a 5% railing loss. Payback: the calculator&rsquo;s arithmetic, with a 3% annual price rise and 0.5% yearly degradation. Output assumes no shading from buildings opposite, so it is a ceiling; <a href="/">the calculator</a> models your actual address. Slowest payback: {", ".join(r["name"] for r in worst[::-1][:3])}.</p>
      </section>'''
    items = [{"@type": "ListItem", "position": i + 1, "url": f'{site["host"]}/states/{r["slug"]}', "name": f"Balcony solar in {r['name']}"}
             for i, r in enumerate(sorted(rows.values(), key=lambda r: r["name"]))]
    dataset = {"@type": "Dataset", "@id": site["host"] + "/states#dataset",
               "name": "Plug-in balcony solar by US state: law, electricity price, output and payback",
               "description": "For the 50 states and DC: plug-in solar law status with sources, EIA average residential electricity price, PVWatts output for an 800 W balcony system in the largest city, savings and payback.",
               "url": site["host"] + "/states", "license": "https://creativecommons.org/licenses/by/4.0/",
               "creator": {"@id": site["host"] + "/#org"}, "dateModified": reviewed, "isAccessibleForFree": True,
               "spatialCoverage": {"@type": "Country", "name": "United States"},
               "distribution": {"@type": "DataDownload", "encodingFormat": "text/csv", "contentUrl": site["host"] + "/data/states.csv"}}
    collection = {"@type": "CollectionPage", "@id": site["host"] + "/states#page", "url": site["host"] + "/states",
                  "name": "Plug-in balcony solar in every US state", "inLanguage": "en-US", "dateModified": reviewed,
                  "mainEntity": {"@type": "ItemList", "numberOfItems": len(items), "itemListElement": items}}
    import build_hubs
    return build_hubs.shell(
        url_path="/states", title="Is balcony solar legal in your state? Laws, prices and payback &middot; balco.nyc",
        description=f"Plug-in balcony solar in all 50 states and DC: which have laws, the electricity price, what an 800 W panel makes and how fast it pays back.",
        og_title="Balcony solar in every US state", h1="Balcony solar, state by state", eyebrow="States",
        lede=("Which states allow plug-in balcony solar, and what a panel on a railing would produce and save in each. "
              "Every figure comes from the same model as the <a href=\"/\">balco.nyc calculator</a>, and every law is sourced and dated."),
        body=body, graph_nodes=[collection, dataset], crumbs=[("balco.nyc", "/"), ("States", "/states")],
        reviewed=reviewed, pages=pages)


def csv_text(rows, energy):
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(["state", "code", "plug_in_solar_law", "bills", "effective_date", "size_limit_w", "law_checked",
                "avg_price_cents_kwh", "price_period", "reference_city", "kwh_yr_south_vertical", "kwh_yr_east",
                "kwh_yr_west", "kwh_yr_north", "savings_yr_south", "payback_yrs_mid_kit_south", "source"])
    for r in sorted(rows.values(), key=lambda r: r["name"]):
        st = r["status"]
        w.writerow([r["name"], r["code"], st["status"], " / ".join(b["id"] for b in st.get("bills") or []),
                    st.get("effective_date") or "", st.get("ac_limit_watts") or "", st.get("reviewed") or "",
                    f"{r['rate'] * 100:.2f}", energy["period_label"], r["city"],
                    round(r["kwh"][180]), round(r["kwh"][90]), round(r["kwh"][270]), round(r["kwh"][0]),
                    round(r["savings_s"]), f"{r['payback']['mid']:.1f}" if r["payback"]["mid"] else "",
                    f"https://balco.nyc/states/{r['slug']}"])
    return buf.getvalue()


def main():
    rows, energy, status = compute()
    (ROOT / "states").mkdir(exist_ok=True)
    extras_dir = ROOT / "content" / "states"
    base_pages = [p for p in S.manifest() if p["kind"] != "state"]
    entries, built = [], {}
    for r in rows.values():
        extra_path = extras_dir / f"{r['slug']}.json"
        extra = S.tokens_deep(json.loads(extra_path.read_text(encoding="utf-8")), S.load_facts()) \
            if extra_path.exists() else {}
        page, entry = state_page(r, rows, energy, extra, base_pages)
        built[r["slug"]] = page
        entries.append(entry)
    entries.sort(key=lambda e: e["url_path"])
    (ROOT / "data" / "state-pages.json").write_text(json.dumps(entries, indent=1) + "\n", encoding="utf-8")
    pages = base_pages + entries
    for slug, page in built.items():
        (ROOT / "states" / f"{slug}.html").write_text(page, encoding="utf-8")
    (ROOT / "states.html").write_text(hub(rows, energy, status, pages), encoding="utf-8")
    (ROOT / "data" / "states.csv").write_text(csv_text(rows, energy), encoding="utf-8")
    # The calculator's fallback outside NYC when PVWatts does not answer: the
    # same runs, monthly, before the railing loss (the calculator applies it).
    pvw = load("state-pvwatts.json")
    fallback = {"note": "PVWatts monthly AC output (kWh) for an 800 W system at each state's largest city, "
                        "by tilt_azimuth, before the railing loss. Used by js/solar-api.js only when PVWatts "
                        "itself is unavailable.",
                "system_watts": 800, "params_hash": pvw["params_hash"],
                "states": {c: {"city": e["city"], "monthly": {k: v["ac_monthly"] for k, v in e["runs"].items()}}
                           for c, e in sorted(pvw["states"].items())}}
    (ROOT / "data" / "solar-fallback.json").write_text(json.dumps(fallback, separators=(",", ":")) + "\n", encoding="utf-8")
    idx = sum(e["indexable"] for e in entries)
    print(f"states.html + {len(entries)} state pages ({idx} indexable, {len(entries) - idx} noindex until written for)")


if __name__ == "__main__":
    main()
