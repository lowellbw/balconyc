# -*- coding: utf-8 -*-
"""Three white, NYC-municipal-inflected home pages built on the real block map."""
from citymap import mono, boroughs, count

COLS = 112
NBLOCKS = f"{count(COLS):,}"

HELV = "'Helvetica Neue', Helvetica, Arial, sans-serif"
DM   = "'DM Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif"
NAVY, NAVY_D, RULE, G = "#10406C", "#0A2F50", "#D5DBE2", "#E3E7EC"
BARS = [49, 60, 72, 81, 92, 98, 100, 90, 77, 64, 49, 45]   # real monthly curve

HEAD = """<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,900&display=swap">
  <style>
    body { margin: 0; font-family: __BODYFONT__; color: __INK__; line-height: 1.5; -webkit-font-smoothing: antialiased; background: #FFFFFF; }
    a { color: __INK__; } a:hover { color: #7F1D1D; }
  </style>
</helmet>
"""
TAIL = """</x-dc>
<script data-dc-script data-props='{"$preview":{"width":1280,"height":1060}}'>
class Component extends DCLogic {}
</script>
</body>
</html>
"""

def page(body, font, ink):
    return HEAD.replace("__BODYFONT__", font).replace("__INK__", ink) + body + TAIL

def fact(label, value, note, ink="#14171A", sub="#7C8794", top=RULE):
    return f"""<div style="border-top: 3px solid {top}; padding-top: 13px">
        <div style="font-size: 1.6rem; font-weight: 700; letter-spacing: -0.025em; color: {ink}; line-height: 1.1">{value}</div>
        <div style="font-family: {HELV}; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: {sub}; margin: 5px 0 6px">{label}</div>
        <div style="font-size: 0.83rem; color: #4A5462; line-height: 1.45">{note}</div>
      </div>"""


# ─────────────────────────────────────────────────── GOV A · Public Record
gov_a = f"""
<div style="width: 1280px; height: 1060px; background: #FFFFFF; display: flex; flex-direction: column">

  <div style="background: {NAVY_D}; color: rgba(255,255,255,0.82); font-family: {HELV}; font-size: 0.72rem; padding: 7px 44px; flex-shrink: 0">
    An independent public tool. <strong style="color: #fff; font-weight: 700">Not affiliated with</strong> the City of New York, Con Edison, NYSERDA or NREL.
  </div>

  <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 44px; flex-shrink: 0">
    <img src="balco-logo.png" alt="balco.nyc" style="height: 56px; width: auto">
    <div style="display: flex; align-items: center; gap: 28px; font-family: {HELV}; font-size: 0.86rem; font-weight: 700">
      <a href="#" style="text-decoration: none; color: {NAVY}">About</a>
      <a href="#" style="text-decoration: none; color: {NAVY}">Methodology</a>
      <a href="#" style="text-decoration: none; color: {NAVY}">Data sources</a>
      <a href="#" style="text-decoration: none; color: {NAVY}">FAQ</a>
    </div>
  </div>
  <div style="height: 5px; background: {NAVY}; flex-shrink: 0"></div>

  <div style="display: grid; grid-template-columns: 1fr 512px; gap: 48px; padding: 34px 44px 0; flex-shrink: 0">
    <div style="min-width: 0">
      <div style="font-family: {HELV}; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: {NAVY}; margin-bottom: 15px">Balcony solar &middot; five boroughs</div>
      <h1 style="font-size: 3.05rem; font-weight: 700; line-height: 1.04; letter-spacing: -0.03em; margin: 0 0 15px; color: #14171A; text-wrap: balance">What could a solar panel on your balcony produce?</h1>
      <p style="font-size: 1.04rem; color: #4A5462; margin: 0 0 24px; max-width: 52ch">Enter any address in the city. We model your building from public records, trace a year of shadows across your block, and price the result at Con Edison&rsquo;s residential rate.</p>

      <div style="display: flex; gap: 8px; margin-bottom: 12px">
        <div style="flex: 1; min-width: 0; border: 2px solid {NAVY}; padding: 15px 16px; font-size: 1rem; color: #7C8794">Street address, borough</div>
        <div style="padding: 15px 26px; background: #7F1D1D; color: #fff; font-family: {HELV}; font-size: 0.95rem; font-weight: 700; white-space: nowrap">Calculate</div>
      </div>
      <div style="font-family: {HELV}; font-size: 0.78rem; color: #7C8794; margin-bottom: 26px">Addresses resolve against city building records. Nothing is stored against your name.</div>

      <div style="border: 1px solid {RULE}; border-left: 5px solid #7F1D1D; padding: 16px 20px">
        <div style="font-family: {HELV}; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #7F1D1D; margin-bottom: 7px">Notice &middot; current legal status</div>
        <p style="margin: 0; font-size: 0.92rem; color: #4A5462; line-height: 1.5">Plug-in solar is <strong style="color: #14171A">not yet lawful</strong> for residential use in New York. The SUNNY Act (S8512 / A9111) passed the Senate in April 2026 and the Assembly on 28 May 2026, and awaits the Governor&rsquo;s signature, taking effect 90 days after. Estimates here describe conditions from <strong style="color: #14171A">early 2027</strong>.</p>
      </div>
    </div>

    <div style="min-width: 0">
      <div style="height: 600px">{mono(NAVY, COLS)}</div>
      <div style="border-top: 1px solid {RULE}; margin-top: 8px; padding-top: 11px; font-family: {HELV}; font-size: 0.75rem; color: #7C8794; line-height: 1.5">
        {NBLOCKS} blocks across the five boroughs, drawn from the city&rsquo;s published boundary files. Every NYC address resolves to one of them.
      </div>
    </div>
  </div>

  <div style="margin-top: auto; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 30px; padding: 0 44px 26px">
    {fact("Typical annual output", "400&ndash;900 kWh", "From an 800W railing-mounted system, depending on floor and facing.")}
    {fact("Con Edison, 2026", "$0.34 / kWh", "About 56% above the US average, so a kWh saved is worth more here.")}
    {fact("Best against worst", "3&times;", "A high south-facing balcony against a low north-facing one.")}
    {fact("Modelled uncertainty", "&plusmn;15%", "A modelled band, not a measured one. No NYC installation has been metered against it.")}
  </div>

  <div style="border-top: 1px solid {RULE}; padding: 13px 44px; font-family: {HELV}; font-size: 0.74rem; color: #7C8794; display: flex; justify-content: space-between; flex-shrink: 0">
    <span>Sources: NREL PVWatts V8 &middot; NYC PLUTO &middot; Con Edison SC-1 &middot; EPA eGRID</span>
    <span>Open source. Estimates are modelled, not metered.</span>
  </div>
</div>
"""

# ─────────────────────────────────────────── GOV B · Standards Manual
gov_b = f"""
<div style="width: 1280px; height: 1060px; background: #FFFFFF; display: flex; flex-direction: column">

  <div style="display: flex; justify-content: space-between; align-items: flex-end; padding: 26px 52px 14px; flex-shrink: 0">
    <img src="balco-logo.png" alt="balco.nyc" style="height: 52px; width: auto">
    <div style="display: flex; gap: 30px; font-size: 0.82rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase">
      <a href="#" style="text-decoration: none">About</a>
      <a href="#" style="text-decoration: none">Method</a>
      <a href="#" style="text-decoration: none">Sources</a>
    </div>
  </div>
  <div style="height: 7px; background: #000000; margin: 0 52px; flex-shrink: 0"></div>

  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 46px; padding: 28px 52px 0; flex-grow: 1; min-height: 0">

    <div style="display: flex; flex-direction: column; min-width: 0">
      <h1 style="font-size: 4rem; font-weight: 700; line-height: 0.96; letter-spacing: -0.045em; margin: 0 0 18px">Every balcony<br>in New York,<br>modelled.</h1>
      <p style="font-size: 1.02rem; line-height: 1.5; margin: 0 0 26px; max-width: 40ch">A free, open estimate of what an 800W plug-in panel would produce on any balcony in the five boroughs.</p>

      <div style="display: flex; border: 2px solid #000; margin-bottom: 10px">
        <div style="flex: 1; min-width: 0; padding: 16px; font-size: 1rem; color: #808080">Street address, borough</div>
        <div style="padding: 16px 26px; background: #000; color: #fff; font-size: 0.95rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap">Calculate</div>
      </div>

      <div style="display: flex; align-items: flex-start; gap: 10px; margin-bottom: 24px">
        <span style="width: 11px; height: 11px; background: #7F1D1D; flex-shrink: 0; margin-top: 5px"></span>
        <span style="font-size: 0.84rem; font-weight: 700; line-height: 1.45">Not lawful in New York until the SUNNY Act is signed. Expected early 2027.</span>
      </div>

      <p style="font-size: 0.9rem; line-height: 1.55; margin: 0; max-width: 46ch; color: #333">Each estimate runs 8,760 hours of a typical meteorological year against your building&rsquo;s real height and footprint, then subtracts what every neighbouring building within 200 metres takes away. The result is priced at Con Edison&rsquo;s residential tariff.</p>

      <div style="margin-top: auto; padding-bottom: 4px">
        <div style="height: 2px; background: #000"></div>
        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #000; font-size: 0.87rem"><span>Annual output, typical 800W system</span><strong>400&ndash;900 kWh</strong></div>
        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #000; font-size: 0.87rem"><span>Con Edison residential rate, 2026</span><strong>$0.34 / kWh</strong></div>
        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #000; font-size: 0.87rem"><span>Above the US average by</span><strong>56%</strong></div>
        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #000; font-size: 0.87rem"><span>High south-facing against low north-facing</span><strong>3&times;</strong></div>
        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #000; font-size: 0.87rem"><span>Modelled uncertainty, not metered</span><strong>&plusmn;15%</strong></div>
      </div>
    </div>

    <div style="display: flex; flex-direction: column; min-width: 0">
      <div style="height: 566px">{mono("#000000", COLS)}</div>
      <div style="font-size: 0.78rem; line-height: 1.5; padding-top: 12px; border-top: 1px solid #000; margin-top: 10px">One square, one block. {NBLOCKS} of them, rasterised from the city&rsquo;s own borough boundary files.</div>
    </div>
  </div>

  <div style="padding: 14px 52px 20px; flex-shrink: 0">
    <div style="height: 2px; background: #000; margin-bottom: 10px"></div>
    <div style="display: flex; justify-content: space-between; font-size: 0.74rem">
      <span>Independent. Not affiliated with the City of New York, Con Edison, NYSERDA or NREL.</span>
      <span>NREL PVWatts V8 &middot; NYC PLUTO &middot; EPA eGRID</span>
    </div>
  </div>
</div>
"""

# ─────────────────────────────────────────────────── GOV C · Open Data
chart = "".join(
    f'<div style="flex: 1; height: {h}%; background: #10406C"></div>' for h in BARS)

gov_c = f"""
<div style="width: 1280px; height: 1060px; background: #FFFFFF; display: flex; flex-direction: column">

  <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 40px; border-bottom: 1px solid {G}; flex-shrink: 0">
    <img src="balco-logo.png" alt="balco.nyc" style="height: 52px; width: auto">
    <div style="display: flex; align-items: center; gap: 12px">
      <div style="display: flex; border: 1px solid #B9C2CC; width: 400px">
        <div style="flex: 1; min-width: 0; padding: 11px 14px; font-size: 0.92rem; color: #7C8794">Street address, borough</div>
        <div style="padding: 11px 20px; background: #7F1D1D; color: #fff; font-family: {HELV}; font-size: 0.86rem; font-weight: 700">Calculate</div>
      </div>
      <a href="#" style="text-decoration: none; font-family: {HELV}; font-size: 0.84rem; font-weight: 700; color: {NAVY}; padding-left: 12px">Methodology</a>
    </div>
  </div>

  <div style="display: grid; grid-template-columns: 1fr 430px; flex-grow: 1; min-height: 0">

    <div style="display: flex; flex-direction: column; padding: 24px 30px 20px; min-width: 0; border-right: 1px solid {G}">
      <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px">
        <h1 style="font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; margin: 0">New York City, block by block</h1>
        <span style="font-family: {HELV}; font-size: 0.76rem; color: #7C8794">{NBLOCKS} blocks &middot; published borough boundaries</span>
      </div>
      <div style="flex-grow: 1; min-height: 0; display: flex; align-items: center; justify-content: center">{boroughs(COLS)}</div>
      <div style="display: flex; gap: 20px; padding-top: 13px; border-top: 1px solid {G}; font-family: {HELV}; font-size: 0.78rem; flex-wrap: wrap">
        <span style="display: flex; align-items: center; gap: 7px"><span style="width: 11px; height: 11px; background: #3B72C4"></span>Manhattan</span>
        <span style="display: flex; align-items: center; gap: 7px"><span style="width: 11px; height: 11px; background: #C4552F"></span>Brooklyn</span>
        <span style="display: flex; align-items: center; gap: 7px"><span style="width: 11px; height: 11px; background: #1E8A66"></span>Queens</span>
        <span style="display: flex; align-items: center; gap: 7px"><span style="width: 11px; height: 11px; background: #9455C7"></span>Bronx</span>
        <span style="display: flex; align-items: center; gap: 7px"><span style="width: 11px; height: 11px; background: #A2790E"></span>Staten Island</span>
      </div>
    </div>

    <div style="padding: 24px 30px 22px; display: flex; flex-direction: column; min-width: 0; overflow: hidden">
      <div style="font-family: {HELV}; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #7C8794; margin-bottom: 12px">A worked estimate</div>
      <div style="font-size: 0.86rem; color: #4A5462; margin-bottom: 14px">Mid-height, south-facing, 800W on the railing, mid-tier kit.</div>

      <div style="display: flex; align-items: baseline; gap: 9px; margin-bottom: 3px">
        <span style="font-size: 2.7rem; font-weight: 700; letter-spacing: -0.035em; line-height: 1">780</span>
        <span style="font-size: 1rem; color: #4A5462">kWh a year</span>
      </div>
      <div style="font-size: 0.84rem; color: #7C8794; margin-bottom: 18px">663 to 897 at the modelled &plusmn;15%</div>

      <div style="display: flex; justify-content: space-between; padding: 10px 0; border-top: 1px solid {G}; font-size: 0.9rem"><span style="color: #4A5462">Off the Con Ed bill</span><strong>$265 / yr</strong></div>
      <div style="display: flex; justify-content: space-between; padding: 10px 0; border-top: 1px solid {G}; font-size: 0.9rem"><span style="color: #4A5462">Pays for itself in</span><strong>4.3 years</strong></div>
      <div style="display: flex; justify-content: space-between; padding: 10px 0; border-top: 1px solid {G}; font-size: 0.9rem"><span style="color: #4A5462">Share of a typical bill</span><strong>18%</strong></div>
      <div style="display: flex; justify-content: space-between; padding: 10px 0; border-top: 1px solid {G}; border-bottom: 1px solid {G}; font-size: 0.9rem"><span style="color: #4A5462">CO<sub style="font-size: 0.75em">2</sub> avoided</span><strong>694 lb / yr</strong></div>

      <div style="margin-top: 20px">
        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 9px">
          <span style="font-family: {HELV}; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.13em; text-transform: uppercase; color: #7C8794">Across the year</span>
          <span style="font-size: 0.75rem; color: #7C8794">peaks at 89 kWh in July</span>
        </div>
        <div style="display: flex; align-items: flex-end; gap: 4px; height: 62px">{chart}</div>
        <div style="display: flex; justify-content: space-between; font-size: 0.68rem; color: #7C8794; margin-top: 6px"><span>Jan</span><span>Jul</span><span>Dec</span></div>
      </div>

      <div style="margin-top: auto; background: #F5F7F9; border: 1px solid {G}; padding: 14px 16px">
        <div style="font-family: {HELV}; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.13em; text-transform: uppercase; color: #7C8794; margin-bottom: 7px">Not on this map yet</div>
        <p style="margin: 0; font-size: 0.82rem; color: #4A5462; line-height: 1.5">The blocks carry no output figures. Shading each one by its own modelled kWh needs building heights for every lot, run once across the city &mdash; <strong style="color: #14171A">[NOT BUILT]</strong>. Until then the map locates you; the number is computed for your address alone.</p>
      </div>

      <div style="margin-top: 18px; padding-top: 16px; border-top: 1px solid {G}; font-family: {HELV}; font-size: 0.73rem; color: #7C8794; line-height: 1.5">
        Independent, non-commercial, open source. Not affiliated with the City of New York, Con Edison, NYSERDA or NREL.
      </div>
    </div>
  </div>
</div>
"""

for name, body, font, ink in (
        ("GovPublicRecord.dc.html",    gov_a, DM,   "#14171A"),
        ("GovStandardsManual.dc.html", gov_b, HELV, "#000000"),
        ("GovOpenData.dc.html",        gov_c, DM,   "#14171A")):
    out = page(body, font, ink)
    open(name, "w").write(out)
    print(f"{name}  {len(out)/1024:.0f}KB")
