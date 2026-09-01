# -*- coding: utf-8 -*-
"""The red direction, built out: a whole home page and the whole flow.

Every figure on these pages is either published (see the repo's llms.txt and
methodology) or computed by the model in js/solar-api.js. The block map is the
same one the Sun variants use.
"""
import build_sunwhite as B

V = dict(B.VARIANTS[2][1])          # Brand red
SHADES = V["shades"]
INK, SUB, GROUND, HAIR = V["ink"], V["sub"], V["ground"], V["hair"]
RED, DEEP = "#7F1D1D", "#5C1212"
TINT = "#FCF5F3"

CX, CY, CW, CH = B.CX, B.CY, B.CW, B.CH
VW, VH, PITCH, BLOCK = B.VW, B.VH, B.PITCH, B.BLOCK

HELMET = f"""<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,900&display=swap">
  <style>
    body {{ margin: 0; font-family: 'DM Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif; color: {INK}; line-height: 1.55; -webkit-font-smoothing: antialiased; background: {GROUND}; }}
    a {{ color: {INK}; }} a:hover {{ color: {RED}; }}
    button {{ font-family: inherit; cursor: pointer; }}
    .rays {{ transform-origin: 50% 50%; animation: sunturn 120s linear infinite; }}
    @keyframes sunturn {{ to {{ transform: rotate(360deg); }} }}
  </style>
</helmet>"""

def eyebrow(t, c=RED):
    return (f'<span style="display: block; font-size: 0.78rem; font-weight: 700; '
            f'letter-spacing: 0.15em; text-transform: uppercase; color: {c}; '
            f'margin-bottom: 16px">{t}</span>')

def nav(dark=False):
    col = "rgba(255,255,255,0.8)" if dark else SUB
    filt = "filter: brightness(0) invert(1); " if dark else ""
    links = "".join(
        f'<a href="#" style="text-decoration: none; font-weight: 700; font-size: 0.92rem; '
        f'color: {col}; pointer-events: auto">{t}</a>' for t in ("About", "Methodology", "FAQ"))
    return (f'<div style="display: flex; justify-content: space-between; align-items: center; '
            f'padding: 12px 56px 0; pointer-events: none">'
            f'<img src="balco-logo.png" alt="balco.nyc" style="height: 56px; width: auto; {filt}">'
            f'<div style="display: flex; align-items: center; gap: 26px">{links}</div></div>')

def city_map():
    return B.city_svg(V)

def sun():
    return B.sun_svg(V)

SUN_JS = B.script_for(V)

# ── the home page ──────────────────────────────────────────────────────────
STEPS = [
    ("A panel on your railing",
     "One or two panels, 400 to 800 watts in total, clamped to the outside of a balcony "
     "railing or stood on a frame. No roof, no scaffolding, no roof rights."),
    ("Plugs into an ordinary outlet",
     "A micro-inverter turns the panel's DC into standard 120V AC and feeds it back through "
     "a normal socket. NYC balconies rarely have one outside, so in practice the cord runs "
     "in through a window."),
    ("Comes off your bill as it goes",
     "Every watt the panel makes is a watt Con Edison does not sell you. Whatever is running "
     "at that moment — the fridge, the AC, a laptop — draws from the panel first."),
]

MODEL = [
    ("Your building, from city records",
     "PLUTO gives the footprint, the height and the number of floors. That alone is enough "
     "for a first estimate, in about a second."),
    ("A year of shadows on your block",
     "Every building within 200 metres is traced against the sun's path through 8,760 hours "
     "of a typical meteorological year."),
    ("NREL PVWatts, parameterised for a railing",
     "Vertical mount, open rack, urban soiling at roughly 5%, and the panel's own tilt and "
     "orientation priced by PVWatts rather than guessed."),
    ("Con Edison's actual tariff",
     "SC-1 residential at about $0.34/kWh, with the rate escalation and kit price you choose."),
]

FAQ = [
    ("Is plug-in solar legal in NYC?", True,
     "Not yet, but it is close. New York requires utility approval for any device that pushes "
     "power back into a household circuit. The SUNNY Act (S8512 / A9111) removes that. It "
     "passed the State Senate unanimously in April 2026 and the Assembly on 28 May 2026, and "
     "now awaits the Governor's signature, taking effect 90 days after. One thing to know: it "
     "lifts the <em>utility</em> barrier only. It grants no right to install, so renters and "
     "co-op residents may still need a landlord or board to agree."),
    ("How accurate is this estimate?", True,
     "Within about 15% of real-world production for a typical NYC apartment. We model the "
     "major shadows on your block but cannot see micro-shading — a neighbour's AC unit, a "
     "corner tree — or know your exact panel orientation. That band is modelled, not measured: "
     "no NYC installation has been metered against it, so treat it as a considered estimate "
     "rather than a validated tolerance."),
    ("Does it work for any apartment?", False,
     "Any NYC address with sun on at least one side. A high south-facing balcony can produce "
     "three times what a low north-facing one does."),
    ("What does a kit cost?", False,
     "Less than it used to. Since Bright Saver, a nonprofit, began selling complete kits at "
     "cost in July 2026, a 360W kit runs about $414 for members and $699 otherwise. For a "
     "typical 800W NYC setup, budget roughly $850 at the wholesale end, $1,200 mid-range and "
     "$1,600 for premium hardware."),
    ("What rate is used to compute savings?", False,
     "Con Edison's residential rate, roughly 34&cent;/kWh in 2026, about 56% above the US "
     "average. You can adjust your monthly bill and the long-term escalation assumption."),
    ("How does it actually plug in?", False,
     "The panel connects to a micro-inverter with a cord ending in a standard 120V plug. "
     "Secure the cord to the railing so it cannot catch on anyone, and do not daisy-chain it "
     "through an extension lead."),
]

CO2_LABEL = 'CO<sub style="font-size:0.7em">2</sub> avoided'

def stat(v, l, note):
    return (f'<div><div style="font-size: 2.1rem; font-weight: 700; letter-spacing: -0.03em; '
            f'line-height: 1.05; color: {RED}">{v}</div>'
            f'<div style="font-size: 0.76rem; font-weight: 700; letter-spacing: 0.1em; '
            f'text-transform: uppercase; color: {SUB}; margin: 7px 0 6px">{l}</div>'
            f'<div style="font-size: 0.85rem; color: {SUB}; line-height: 1.5">{note}</div></div>')

home_sections = f"""
  <!-- WORKED EXAMPLE -->
  <div style="background: {TINT}; border-top: 1px solid {HAIR}; border-bottom: 1px solid {HAIR}; padding: 44px 56px">
    <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 26px">
      <h2 style="font-size: 1.45rem; font-weight: 700; letter-spacing: -0.022em; margin: 0">What one balcony looks like</h2>
      <span style="font-size: 0.85rem; color: {SUB}">A mid-height, south-facing railing in Queens &middot; 800W, mid-tier kit</span>
    </div>
    <div style="display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 34px">
      {stat("780 kWh", "A year", "663 to 897 across the modelled &plusmn;15% band. Peaks at 89 kWh in July.")}
      {stat("$265", "Off the bill", "At Con Edison's 2026 residential rate of about $0.34/kWh.")}
      {stat("4.3 yrs", "To pay for itself", "On a $1,200 kit, with rates rising 3% a year. Nominal, not discounted.")}
      {stat("18%", "Of a typical bill", "Against the roughly 350 kWh a month an average NYC apartment uses.")}
      {stat('694 lb', CO2_LABEL, 'Per year, at the EPA eGRID factor for this grid region.')}
    </div>
  </div>

  <!-- WHAT IS BALCONY SOLAR -->
  <div style="padding: 76px 56px 0">
    {eyebrow("About")}
    <h2 style="font-size: 2.7rem; font-weight: 700; letter-spacing: -0.032em; line-height: 1.06; margin: 0 0 44px; max-width: 20ch">What balcony solar actually is</h2>
    <div style="display: grid; grid-template-columns: 470px 1fr; gap: 60px; align-items: start">
      <div style="border-radius: 16px; overflow: hidden; background: {TINT}">
        <img src="balcony-panel.jpg" alt="A solar panel clamped to an apartment balcony railing" style="width: 100%; height: 400px; object-fit: cover; display: block">
      </div>
      <div>
        {"".join(f'''<div style="display: grid; grid-template-columns: 42px 1fr; column-gap: 22px; padding: 24px 0; border-top: 1px solid {HAIR}; align-items: start">
          <div style="width: 36px; height: 36px; border-radius: 50%; background: {RED}; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 0.95rem; font-weight: 700">{n + 1}</div>
          <div><h3 style="font-size: 1.18rem; font-weight: 700; letter-spacing: -0.018em; margin: 0 0 7px">{t}</h3>
          <p style="margin: 0; font-size: 0.98rem; color: {SUB}; line-height: 1.55">{d}</p></div>
        </div>''' for n, (t, d) in enumerate(STEPS))}
      </div>
    </div>
  </div>

  <!-- HOW THE NUMBER IS WORKED OUT -->
  <div style="padding: 76px 56px 0">
    {eyebrow("Method")}
    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 36px">
      <h2 style="font-size: 2.7rem; font-weight: 700; letter-spacing: -0.032em; line-height: 1.06; margin: 0; max-width: 22ch">Where the number comes from</h2>
      <a href="#" style="font-size: 0.92rem; font-weight: 700; text-decoration: underline; text-underline-offset: 4px; white-space: nowrap">Read the full methodology &rarr;</a>
    </div>
    <div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 28px">
      {"".join(f'''<div style="border-top: 3px solid {RED}; padding-top: 16px">
        <div style="font-size: 0.74rem; font-weight: 700; letter-spacing: 0.1em; color: {RED}; margin-bottom: 9px">0{n + 1}</div>
        <h3 style="font-size: 1.06rem; font-weight: 700; letter-spacing: -0.015em; margin: 0 0 8px; line-height: 1.3">{t}</h3>
        <p style="margin: 0; font-size: 0.88rem; color: {SUB}; line-height: 1.55">{d}</p></div>''' for n, (t, d) in enumerate(MODEL))}
    </div>
    <p style="margin: 30px 0 0; font-size: 0.86rem; color: {SUB}">Sources: NREL PVWatts V8 &middot; NYC PLUTO and building footprints &middot; Con Edison SC-1 &middot; EPA eGRID &middot; HTW Berlin. Open source, and the whole model is readable.</p>
  </div>

  <!-- THE BILL -->
  <div style="margin: 76px 0 0; background: #171717; padding: 56px">
    <div style="display: grid; grid-template-columns: 1fr 520px; gap: 64px; align-items: start">
      <div>
        {eyebrow("The SUNNY Act &middot; S8512 / A9111", "#E4785C")}
        <h2 style="font-size: 2.6rem; font-weight: 700; letter-spacing: -0.032em; line-height: 1.06; margin: 0 0 16px; color: #F6F1EF; max-width: 17ch">Passed. Passed. Awaiting one signature.</h2>
        <p style="margin: 0 0 26px; font-size: 1.02rem; color: rgba(246,241,239,0.7); line-height: 1.55; max-width: 52ch">Balcony solar is ordinary in Germany and unlawful in New York for one reason: the state still requires utility approval for any device that pushes power into a household circuit. One bill removes that.</p>
        <p style="margin: 0; font-size: 0.9rem; color: rgba(246,241,239,0.5); line-height: 1.55; max-width: 56ch">It lifts the utility barrier only. It grants no right to install, so renters and co-op residents may still need a landlord or a board to say yes.</p>
      </div>
      <div>
        {"".join(f'''<div style="display: flex; justify-content: space-between; align-items: center; padding: 17px 0; border-bottom: 1px solid rgba(246,241,239,0.16)">
          <div><div style="font-size: 1.1rem; font-weight: 700; color: #F6F1EF">{stage}</div>
          <div style="font-size: 0.85rem; color: rgba(246,241,239,0.55); margin-top: 2px">{when}</div></div>
          <span style="font-size: 0.7rem; font-weight: 700; letter-spacing: 0.11em; text-transform: uppercase; color: {col}; border: 1px solid {col}; border-radius: 20px; padding: 5px 12px; white-space: nowrap">{state}</span>
        </div>''' for stage, when, state, col in [
            ("State Senate", "April 2026, unanimous", "Passed", "#7FD4A8"),
            ("State Assembly", "28 May 2026", "Passed", "#7FD4A8"),
            ("Governor's signature", "Not yet signed", "Pending", "#E4785C"),
            ("In effect", "90 days after signing &middot; realistically early 2027", "Waiting", "rgba(246,241,239,0.45)")])}
      </div>
    </div>
  </div>

  <!-- FAQ -->
  <div style="padding: 76px 56px 0">
    {eyebrow("FAQ")}
    <div style="display: grid; grid-template-columns: 380px 1fr; gap: 64px; align-items: start">
      <h2 style="font-size: 2.7rem; font-weight: 700; letter-spacing: -0.032em; line-height: 1.06; margin: 0">Common questions</h2>
      <div>
        {"".join(f'''<div style="border-top: 1px solid {HAIR}; padding: 22px 0">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 18px">
            <span style="font-size: 1.08rem; font-weight: 600; letter-spacing: -0.012em">{q}</span>
            <span style="font-size: 1.3rem; font-weight: 300; color: {SUB}; flex-shrink: 0">{"&times;" if op else "+"}</span>
          </div>
          {f'<p style="margin: 12px 0 0; font-size: 0.96rem; color: {SUB}; line-height: 1.6; max-width: 76ch">{a}</p>' if op else ""}
        </div>''' for q, op, a in FAQ)}
      </div>
    </div>
  </div>

  <!-- FOOTER -->
  <div style="margin-top: 76px; border-top: 1px solid {HAIR}; padding: 44px 56px 52px">
    <div style="display: grid; grid-template-columns: 1fr 380px; gap: 60px; align-items: start">
      <div>
        <img src="balco-logo.png" alt="balco.nyc" style="height: 52px; width: auto; margin-bottom: 16px">
        <p style="margin: 0 0 12px; font-size: 0.9rem; color: {SUB}; line-height: 1.6; max-width: 74ch">balco.nyc is an independent, non-commercial, open-source tool for estimating balcony solar potential in New York City. It is <strong style="color: {INK}">not affiliated with</strong> the City of New York, Con Edison, NYSERDA or NREL, and it sells nothing.</p>
        <p style="margin: 0; font-size: 0.86rem; color: {SUB}; line-height: 1.6; max-width: 74ch">Estimates are modelled, not metered, and may differ from real production by about 15%. Plug-in solar is not yet lawful for residential use in New York. Verify current regulations before installing anything.</p>
      </div>
      <div style="display: flex; flex-direction: column; gap: 11px; font-size: 0.9rem">
        {"".join(f'<a href="#" style="text-decoration: none; font-weight: 600">{t}</a>' for t in ("Methodology", "Data sources", "FAQ", "Track the SUNNY Act", "Source code"))}
        <span style="font-size: 0.82rem; color: {SUB}; margin-top: 10px">&copy; 2026 balco.nyc</span>
      </div>
    </div>
  </div>
"""

HOME_H = 4180

home = f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
{HELMET}

<div data-sun-root ref="{{{{bind}}}}" style="position: relative; width: 1280px; background: {GROUND}; overflow: hidden">

  <!-- HERO -->
  <div style="position: relative; height: 1060px; overflow: hidden">
    <div style="position: absolute; left: {CX}px; top: {CY}px; width: {CW}px; height: {CH}px; pointer-events: none">{city_map()}</div>
    <div data-sun-halo style="position: absolute; left: {B.sx:.0f}px; top: {B.sy:.0f}px; width: 1180px; height: 1180px; margin: -590px 0 0 -590px; pointer-events: none; background: radial-gradient(circle closest-side, {V['halo']} 0%, rgba(255,255,255,0) 60%)"></div>
    <div style="position: absolute; inset: 0; pointer-events: none; background: linear-gradient(90deg, {GROUND} 0%, {GROUND} 17%, rgba(255,255,255,0) 52%)"></div>
    <div style="position: absolute; inset: 0; pointer-events: none; background: linear-gradient(0deg, {GROUND} 0%, rgba(255,255,255,0) 13%)"></div>

    <div data-sun style="position: absolute; left: {B.sx:.0f}px; top: {B.sy:.0f}px; width: 100px; margin: -50px 0 0 -50px; pointer-events: none; text-align: center">
      {sun()}
      <div style="margin-top: 3px; display: flex; justify-content: center"><span data-sun-clock style="display: inline-block; background: rgba(255,255,255,0.92); border: 1px solid {HAIR}; border-radius: 999px; padding: 3px 10px; font-size: 0.72rem; font-weight: 700; color: {RED}; white-space: nowrap">11:02 AM</span></div>
    </div>

    <div style="position: relative; z-index: 3">{nav()}</div>

    <div style="position: relative; z-index: 3; padding: 116px 56px 0; max-width: 546px; pointer-events: none">
      {eyebrow("Every block in New York")}
      <h1 style="font-size: 3.25rem; font-weight: 700; line-height: 1.03; letter-spacing: -0.034em; margin: 0 0 16px; text-wrap: balance">Find the sun on your block.</h1>
      <p style="font-size: 1.04rem; color: {SUB}; line-height: 1.55; margin: 0 0 30px; max-width: 44ch">We traced a year of shadows across all five boroughs. Enter your address and see what an 800W panel on your balcony would make, in kWh, dollars and CO<sub style="font-size: 0.7em">2</sub>.</p>
      <div style="display: flex; align-items: center; gap: 10px; pointer-events: auto">
        <div style="flex: 1; min-width: 0; border: 1.5px solid {HAIR}; border-radius: 999px; padding: 16px 24px; font-size: 1rem; color: {SUB}; background: #fff; box-shadow: 0 1px 3px rgba(20,20,20,0.05)">Enter an NYC address</div>
        <div style="display: inline-flex; align-items: center; gap: 9px; padding: 16px 26px; background: {RED}; color: #fff; border-radius: 999px; font-size: 0.97rem; font-weight: 700; white-space: nowrap; box-shadow: 0 2px 12px rgba(20,20,20,0.12)">Calculate
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13"></path><path d="M12 5l7 7-7 7"></path></svg>
        </div>
      </div>
      <p style="margin: 18px 0 0; max-width: 43ch; font-size: 0.79rem; color: {SUB}; line-height: 1.5">Every square is a block of the five boroughs. Its shading is where the sun is standing, not what that block produces.</p>
    </div>

    <div style="position: absolute; z-index: 3; left: 0; right: 0; bottom: 0; border-top: 1px solid {HAIR}; background: rgba(255,255,255,0.94); padding: 20px 56px; display: flex; align-items: center; gap: 22px; pointer-events: none">
      <div style="display: flex; align-items: center; gap: 9px; flex-shrink: 0">
        <span style="width: 11px; height: 11px; background: {RED}"></span>
        <span style="font-size: 0.71rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: {RED}; white-space: nowrap">Not legal yet</span>
      </div>
      <p style="margin: 0; font-size: 0.89rem; color: {SUB}; line-height: 1.5">The SUNNY Act removes the utility barrier for plug-in solar up to 1,200W. It passed the Senate in April 2026 and the Assembly on 28 May, and awaits the Governor&rsquo;s signature, taking effect 90 days later. Realistic opening: <strong style="color: {INK}; font-weight: 700">early 2027</strong>.</p>
      <a href="#" style="flex-shrink: 0; font-size: 0.86rem; font-weight: 700; text-decoration: underline; text-underline-offset: 3px; white-space: nowrap; pointer-events: auto">Track the bill &rarr;</a>
    </div>
  </div>

{home_sections}
</div>
</x-dc>
<script data-dc-script data-props='{{"$preview":{{"width":1280,"height":{HOME_H}}}}}'>
{SUN_JS}
</script>
</body>
</html>
"""

open("RedHome.dc.html", "w").write(home)
print(f"RedHome.dc.html  {len(home)/1024:.0f}KB")


# ── the flow, clickable end to end ─────────────────────────────────────────
FLOW_JS = """
class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = { step: 0, facing: 'S', floor: 14, scene: false, touched: false };
  }

  metrics(kwh) {
    var RATE = 0.34, ESC = 0.03, DEG = 0.005, COST = 1200;
    var annual = ((140 - 20) / RATE) * 12, cum = 0, pb = 25, life = 0;
    for (var i = 0; i < 25; i++) {
      var y = kwh * Math.pow(1 - DEG, i) * RATE * Math.pow(1 + ESC, i);
      var prev = cum; cum += y; life += y;
      if (cum >= COST && pb === 25) pb = i + (COST - prev) / y;
    }
    return {
      dollars: Math.round(kwh * RATE),
      monthly: Math.round(kwh * RATE / 12),
      payback: pb < 25 ? pb.toFixed(1) + ' yrs' : '25+ yrs',
      offset: Math.round((kwh / annual) * 100) + '%',
      life: '$' + Math.round(life).toLocaleString(),
      co2: Math.round(kwh * 0.89).toLocaleString()
    };
  }

  renderVals() {
    var self = this, st = this.state;
    var FACING = { N: 0.40, NE: 0.50, E: 0.66, SE: 0.88, S: 1.00, SW: 0.88, W: 0.66, NW: 0.50 };
    var ORDER = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    var DIST = [0.056, 0.068, 0.082, 0.092, 0.105, 0.112, 0.114, 0.103, 0.088, 0.073, 0.056, 0.051];
    var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    var kwh = Math.round(892 * FACING[st.facing] * (0.70 + 0.35 * (st.floor / 28)));
    var m = this.metrics(kwh);
    var monthly = DIST.map(function (p) { return kwh * p; });
    var peak = Math.max.apply(null, monthly);
    var bars = monthly.map(function (v) { return { h: Math.round((v / peak) * 100) + '%' }; });

    var facings = ORDER.map(function (k) {
      var on = k === st.facing;
      return { key: k, bg: on ? '#7F1D1D' : '#FFFFFF', fg: on ? '#FFFFFF' : '#6B6360',
               bd: on ? '#7F1D1D' : '#EADFDD',
               pick: function () { self.setState({ facing: k, touched: true, step: Math.max(2, st.step) }); } };
    });

    var rail = ['#C9BEBB', '#C9BEBB', '#C9BEBB', '#C9BEBB'];
    for (var i = 0; i <= st.step; i++) rail[i] = '#171717';

    return {
      isLand: st.step === 0, isRough: st.step === 1, isRefine: st.step === 2,
      isResult: st.step === 3, isWorking: st.step === 1 || st.step === 2,
      r1: rail[0], r2: rail[1], r3: rail[2], r4: rail[3],
      facings: facings, floor: st.floor,
      floorPct: Math.round((st.floor / 28) * 100) + '%',
      badge: st.touched ? 'Your estimate' : 'Rough · block median facing',
      badgeBg: st.touched ? '#171717' : '#F6E9E6',
      badgeFg: st.touched ? '#FFFFFF' : '#7F1D1D',
      context: 'Floor ' + st.floor + ' of 28, facing ' + st.facing + ', 800W on the railing',
      helper: st.touched
        ? 'That is your number. Keep adjusting and it keeps up, or open the shadow model to see what your block does to it.'
        : 'Your number is already worked out from city records at the median facing for your building. Two taps make it exact.',
      kwh: kwh.toLocaleString(), dollars: '$' + m.dollars, monthlyDollars: '$' + m.monthly,
      payback: m.payback, offset: m.offset, life: m.life, co2: m.co2 + ' lb',
      band: 'Modelled range ' + Math.round(kwh * 0.85).toLocaleString() + ' to ' + Math.round(kwh * 1.15).toLocaleString() + ' kWh, about ±15%',
      peakLine: 'peaks at ' + Math.round(peak) + ' kWh in ' + MONTHS[monthly.indexOf(peak)],
      bars: bars,
      calculate: function () { self.setState({ step: 1 }); },
      toRefine: function () { self.setState({ step: 2 }); },
      toResult: function () { self.setState({ step: 3 }); },
      backToRefine: function () { self.setState({ step: 2 }); },
      reset: function () { self.setState({ step: 0, facing: 'S', floor: 14, scene: false, touched: false }); },
      floorUp: function () { self.setState({ floor: Math.min(28, st.floor + 1), touched: true, step: Math.max(2, st.step) }); },
      floorDown: function () { self.setState({ floor: Math.max(1, st.floor - 1), touched: true, step: Math.max(2, st.step) }); },
      toggleScene: function () { self.setState({ scene: !st.scene }); },
      scene: st.scene, sceneLabel: st.scene ? 'Hide the shadow model' : 'Show me the shadows'
    };
  }
}
"""

def card(inner, pad="24px 26px"):
    return (f'<div style="border: 1px solid {HAIR}; border-radius: 16px; padding: {pad}; '
            f'background: #fff; box-shadow: 0 4px 20px rgba(23,23,23,0.05)">{inner}</div>')

flow = f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
{HELMET}

<div style="position: relative; width: 1280px; height: 1060px; background: {GROUND}; overflow: hidden; display: flex; flex-direction: column">

  <!-- header -->
  <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 44px; border-bottom: 1px solid {HAIR}; flex-shrink: 0">
    <img src="balco-logo.png" alt="balco.nyc" style="height: 50px; width: auto">
    <div style="display: flex; align-items: center; gap: 9px; font-size: 0.79rem; font-weight: 700">
      <span style="color: {{{{r1}}}}">1 &middot; Address</span>
      <span style="width: 20px; height: 1px; background: {HAIR}"></span>
      <span style="color: {{{{r2}}}}">2 &middot; Rough number</span>
      <span style="width: 20px; height: 1px; background: {HAIR}"></span>
      <span style="color: {{{{r3}}}}">3 &middot; Make it yours</span>
      <span style="width: 20px; height: 1px; background: {HAIR}"></span>
      <span style="color: {{{{r4}}}}">4 &middot; Result</span>
    </div>
  </div>

  <div style="flex-grow: 1; min-height: 0; position: relative">

    <!-- STEP 1 · LAND -->
    <sc-if value="{{{{isLand}}}}" hint-placeholder-val="{{{{ true }}}}">
      <div style="position: absolute; inset: 0; overflow: hidden">
        <div style="position: absolute; left: 500px; top: 40px; width: 700px; height: 700px; pointer-events: none">{city_map()}</div>
        <div style="position: absolute; inset: 0; background: linear-gradient(90deg, {GROUND} 0%, {GROUND} 24%, rgba(255,255,255,0) 58%)"></div>
        <div style="position: relative; padding: 76px 44px 0; max-width: 540px">
          {eyebrow("Every block in New York")}
          <h1 style="font-size: 2.9rem; font-weight: 700; line-height: 1.04; letter-spacing: -0.033em; margin: 0 0 15px; text-wrap: balance">Find the sun on your block.</h1>
          <p style="font-size: 1.02rem; color: {SUB}; line-height: 1.55; margin: 0 0 28px; max-width: 44ch">Enter your address and see what an 800W panel on your balcony would make, in kWh, dollars and CO<sub style="font-size: 0.7em">2</sub>.</p>
          <div style="display: flex; align-items: center; gap: 10px">
            <div style="flex: 1; min-width: 0; border: 1.5px solid {HAIR}; border-radius: 999px; padding: 15px 22px; font-size: 0.98rem; color: {SUB}; background: #fff">247 Vernon Blvd, Queens</div>
            <button onClick="{{{{calculate}}}}" style="display: inline-flex; align-items: center; gap: 9px; min-height: 50px; padding: 15px 24px; background: {RED}; color: #fff; border: none; border-radius: 999px; font-size: 0.95rem; font-weight: 700; white-space: nowrap">Calculate
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13"></path><path d="M12 5l7 7-7 7"></path></svg>
            </button>
          </div>
          <p style="margin: 16px 0 0; font-size: 0.8rem; color: {SUB}">Sample address, pre-filled for this walkthrough. Press Calculate.</p>
        </div>
      </div>
    </sc-if>

    <!-- STEPS 2 & 3 · ROUGH, THEN REFINE -->
    <sc-if value="{{{{isWorking}}}}" hint-placeholder-val="{{{{ true }}}}">
      <div style="display: grid; grid-template-columns: 1fr 430px; gap: 40px; padding: 30px 44px; height: 100%; box-sizing: border-box; align-items: start">
        <div style="min-width: 0">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px">
            <div>
              <div style="font-size: 1.3rem; font-weight: 700; letter-spacing: -0.02em">247 Vernon Blvd, Queens</div>
              <div style="font-size: 0.86rem; color: {SUB}; margin-top: 2px">28 floors &middot; 289 ft &middot; from NYC PLUTO, in about a second. No 3D needed.</div>
            </div>
            <button onClick="{{{{reset}}}}" style="background: none; border: none; color: {SUB}; font-size: 0.83rem; text-decoration: underline; text-underline-offset: 3px; padding: 6px 0">Start over</button>
          </div>
          <p style="margin: 0 0 22px; font-size: 0.96rem; color: {SUB}; max-width: 54ch">{{{{helper}}}}</p>

          <div style="margin-bottom: 22px">
            <div style="font-size: 0.7rem; font-weight: 700; letter-spacing: 0.11em; text-transform: uppercase; color: {SUB}; margin-bottom: 10px">Which way does your balcony face?</div>
            <div style="display: flex; gap: 7px">
              <sc-for list="{{{{facings}}}}" as="f" hint-placeholder-count="8">
                <button onClick="{{{{f.pick}}}}" style="flex: 1; min-height: 46px; border-radius: 10px; font-size: 0.9rem; font-weight: 700; background: {{{{f.bg}}}}; color: {{{{f.fg}}}}; border: 1px solid {{{{f.bd}}}}">{{{{f.key}}}}</button>
              </sc-for>
            </div>
            <div style="font-size: 0.77rem; color: {SUB}; margin-top: 8px">Eight positions, because the model resolves facing to 45&deg;.</div>
          </div>

          <div style="margin-bottom: 22px">
            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px">
              <span style="font-size: 0.7rem; font-weight: 700; letter-spacing: 0.11em; text-transform: uppercase; color: {SUB}">How high up are you?</span>
              <span style="font-size: 0.93rem; font-weight: 700">Floor {{{{floor}}}} of 28</span>
            </div>
            <div style="display: flex; align-items: center; gap: 12px">
              <button onClick="{{{{floorDown}}}}" style="width: 46px; height: 46px; border-radius: 10px; border: 1px solid {HAIR}; background: #fff; font-size: 1.2rem; font-weight: 700">&minus;</button>
              <div style="flex: 1; height: 8px; background: {HAIR}; border-radius: 4px; position: relative">
                <div style="position: absolute; left: 0; top: 0; bottom: 0; width: {{{{floorPct}}}}; background: {RED}; border-radius: 4px"></div>
              </div>
              <button onClick="{{{{floorUp}}}}" style="width: 46px; height: 46px; border-radius: 10px; border: 1px solid {HAIR}; background: #fff; font-size: 1.2rem; font-weight: 700">+</button>
            </div>
          </div>

          <div style="border-top: 1px solid {HAIR}; padding-top: 18px">
            <button onClick="{{{{toggleScene}}}}" style="display: inline-flex; align-items: center; gap: 9px; min-height: 46px; padding: 11px 18px; border-radius: 999px; border: 1px solid {HAIR}; background: #fff; font-size: 0.9rem; font-weight: 700">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="{RED}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"></path><path d="M12 12l8-4.5"></path><path d="M12 12v9"></path><path d="M12 12L4 7.5"></path></svg>
              {{{{sceneLabel}}}}
            </button>
            <span style="font-size: 0.8rem; color: {SUB}; margin-left: 12px">Optional. Everything above works without it.</span>
            <sc-if value="{{{{scene}}}}" hint-placeholder-val="{{{{ true }}}}">
              <div style="margin-top: 14px; height: 168px; border-radius: 14px; background: #1c1816; position: relative; overflow: hidden">
                <div style="position: absolute; inset: 0; background: linear-gradient(160deg, rgba(228,103,64,0.24) 0%, rgba(28,24,22,0) 55%)"></div>
                <div style="position: absolute; left: 20px; bottom: 20px; display: flex; align-items: flex-end; gap: 7px">
                  <div style="width: 32px; height: 58px; background: #2C2724; border-radius: 2px"></div>
                  <div style="width: 42px; height: 104px; background: {RED}; border-radius: 2px"></div>
                  <div style="width: 28px; height: 44px; background: #2C2724; border-radius: 2px"></div>
                  <div style="width: 36px; height: 78px; background: #35302C; border-radius: 2px"></div>
                </div>
                <div style="position: absolute; right: 18px; top: 18px; background: #fff; border-radius: 9px; padding: 8px 12px">
                  <div style="font-size: 0.58rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: {SUB}">Shade factor</div>
                  <div style="font-size: 1.05rem; font-weight: 700">0.86</div>
                  <div style="font-size: 0.68rem; color: {SUB}">31 buildings within 200m</div>
                </div>
              </div>
            </sc-if>
          </div>
        </div>

        <!-- the number, present the whole way -->
        {card(f'''
          <div style="display: inline-block; background: {{{{badgeBg}}}}; color: {{{{badgeFg}}}}; padding: 5px 12px; border-radius: 20px; font-size: 0.63rem; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; margin-bottom: 14px">{{{{badge}}}}</div>
          <div style="font-size: 0.79rem; color: {SUB}; margin-bottom: 12px">{{{{context}}}}</div>
          <div style="display: flex; align-items: baseline; gap: 9px">
            <div style="font-size: 2.9rem; font-weight: 900; letter-spacing: -0.035em; line-height: 1">{{{{dollars}}}}</div>
            <div style="font-size: 0.96rem; font-weight: 600; color: {SUB}">a year</div>
          </div>
          <div style="font-size: 0.83rem; color: {SUB}; margin-top: 5px">{{{{kwh}}}} kWh &middot; {{{{band}}}}</div>
          <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 18px; padding-top: 16px; border-top: 1px solid {HAIR}">
            <div><div style="font-size: 1.08rem; font-weight: 700">{{{{payback}}}}</div><div style="font-size: 0.7rem; color: {SUB}">Payback</div></div>
            <div><div style="font-size: 1.08rem; font-weight: 700">{{{{offset}}}}</div><div style="font-size: 0.7rem; color: {SUB}">Bill offset</div></div>
            <div><div style="font-size: 1.08rem; font-weight: 700">{{{{co2}}}}</div><div style="font-size: 0.7rem; color: {SUB}">CO<sub style="font-size: 0.75em">2</sub>/yr</div></div>
          </div>
          <button onClick="{{{{toResult}}}}" style="width: 100%; margin-top: 20px; min-height: 48px; padding: 14px; background: {RED}; color: #fff; border: none; border-radius: 999px; font-size: 0.93rem; font-weight: 700">See the full breakdown &rarr;</button>
        ''')}
      </div>
    </sc-if>

    <!-- STEP 4 · RESULT -->
    <sc-if value="{{{{isResult}}}}" hint-placeholder-val="{{{{ true }}}}">
      <div style="padding: 26px 44px; height: 100%; box-sizing: border-box; overflow: hidden">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px">
          <button onClick="{{{{backToRefine}}}}" style="background: none; border: none; color: {SUB}; font-size: 0.85rem; padding: 6px 0">&larr; Change the details</button>
          <div style="display: flex; align-items: center; gap: 9px">
            <span style="font-size: 0.82rem; color: {SUB}">balco.nyc/e/vernon-14{{{{floor}}}}s</span>
            <span style="padding: 9px 16px; background: #171717; color: #fff; border-radius: 999px; font-size: 0.82rem; font-weight: 700">Copy link</span>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1.15fr 1fr; gap: 34px; align-items: start">
          <div>
            <div style="font-size: 0.72rem; font-weight: 700; letter-spacing: 0.13em; text-transform: uppercase; color: {RED}; margin-bottom: 10px">Your estimate</div>
            <div style="font-size: 1.15rem; font-weight: 700; margin-bottom: 3px">247 Vernon Blvd, Queens</div>
            <div style="font-size: 0.87rem; color: {SUB}; margin-bottom: 20px">{{{{context}}}}</div>
            <div style="display: flex; align-items: baseline; gap: 12px">
              <div style="font-size: 3.9rem; font-weight: 900; letter-spacing: -0.04em; line-height: 1">{{{{dollars}}}}</div>
              <div style="font-size: 1.05rem; font-weight: 600; color: {SUB}">a year off your Con Ed bill</div>
            </div>
            <div style="font-size: 0.9rem; color: {SUB}; margin-top: 7px">{{{{kwh}}}} kWh a year &middot; {{{{band}}}}</div>

            <div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px; margin-top: 26px; padding-top: 20px; border-top: 1px solid {HAIR}">
              <div><div style="font-size: 1.3rem; font-weight: 700; letter-spacing: -0.02em">{{{{monthlyDollars}}}}</div><div style="font-size: 0.73rem; color: {SUB}; margin-top: 2px">A month</div></div>
              <div><div style="font-size: 1.3rem; font-weight: 700; letter-spacing: -0.02em">{{{{payback}}}}</div><div style="font-size: 0.73rem; color: {SUB}; margin-top: 2px">Pays for itself</div></div>
              <div><div style="font-size: 1.3rem; font-weight: 700; letter-spacing: -0.02em">{{{{life}}}}</div><div style="font-size: 0.73rem; color: {SUB}; margin-top: 2px">Over 25 years</div></div>
              <div><div style="font-size: 1.3rem; font-weight: 700; letter-spacing: -0.02em">{{{{offset}}}}</div><div style="font-size: 0.73rem; color: {SUB}; margin-top: 2px">Of a typical bill</div></div>
            </div>

            <div style="margin-top: 24px">
              <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px">
                <span style="font-size: 0.7rem; font-weight: 700; letter-spacing: 0.11em; text-transform: uppercase; color: {SUB}">Across the year</span>
                <span style="font-size: 0.78rem; color: {SUB}">{{{{peakLine}}}}</span>
              </div>
              <div style="display: flex; align-items: flex-end; gap: 5px; height: 84px">
                <sc-for list="{{{{bars}}}}" as="bar" hint-placeholder-count="12">
                  <div style="flex: 1; height: {{{{bar.h}}}}; background: {RED}; border-radius: 4px 4px 0 0"></div>
                </sc-for>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 0.68rem; color: {SUB}; margin-top: 6px"><span>Jan</span><span>Jul</span><span>Dec</span></div>
            </div>
          </div>

          <div>
            {card(f'''
              <div style="font-size: 0.7rem; font-weight: 700; letter-spacing: 0.11em; text-transform: uppercase; color: {SUB}; margin-bottom: 14px">What we assumed</div>
              <div style="display: flex; justify-content: space-between; padding: 9px 0; border-bottom: 1px solid {HAIR}; font-size: 0.88rem"><span style="color: {SUB}">Building</span><strong>28 floors &middot; 289 ft</strong></div>
              <div style="display: flex; justify-content: space-between; padding: 9px 0; border-bottom: 1px solid {HAIR}; font-size: 0.88rem"><span style="color: {SUB}">Neighbouring shade</span><strong>0.86 &middot; 31 buildings</strong></div>
              <div style="display: flex; justify-content: space-between; padding: 9px 0; border-bottom: 1px solid {HAIR}; font-size: 0.88rem"><span style="color: {SUB}">System</span><strong>800W at 90&deg;</strong></div>
              <div style="display: flex; justify-content: space-between; padding: 9px 0; border-bottom: 1px solid {HAIR}; font-size: 0.88rem"><span style="color: {SUB}">Kit cost</span><strong>$1,200 mid-tier</strong></div>
              <div style="display: flex; justify-content: space-between; padding: 9px 0; font-size: 0.88rem"><span style="color: {SUB}">Rate</span><strong>$0.34/kWh, +3%/yr</strong></div>
              <div style="margin-top: 14px; font-size: 0.8rem; color: {SUB}; line-height: 1.5">Every line is editable, and the estimate recomputes. Modelled with NREL PVWatts V8 over 8,760 hours.</div>
            ''', "20px 22px")}

            <div style="margin-top: 16px; background: {TINT}; border: 1px solid {HAIR}; border-radius: 16px; padding: 18px 22px">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px">
                <span style="width: 10px; height: 10px; background: {RED}"></span>
                <span style="font-size: 0.68rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: {RED}">You cannot install this yet</span>
              </div>
              <p style="margin: 0; font-size: 0.85rem; color: {SUB}; line-height: 1.55">The SUNNY Act awaits the Governor&rsquo;s signature and takes effect 90 days after. This describes what would be true from early 2027 &mdash; and it lifts the utility barrier only, so a landlord or board may still need to agree.</p>
            </div>
          </div>
        </div>
      </div>
    </sc-if>
  </div>

  <!-- footer -->
  <div style="flex-shrink: 0; border-top: 1px solid {HAIR}; padding: 13px 44px; display: flex; justify-content: space-between; font-size: 0.76rem; color: {SUB}">
    <span>Independent and open source. Not affiliated with the City of New York, Con Edison, NYSERDA or NREL.</span>
    <span>Modelled, not metered &middot; about &plusmn;15%</span>
  </div>
</div>
</x-dc>
<script data-dc-script data-props='{{"$preview":{{"width":1280,"height":1060}}}}'>
{FLOW_JS}
</script>
</body>
</html>
"""

open("RedFlow.dc.html", "w").write(flow)
print(f"RedFlow.dc.html  {len(flow)/1024:.0f}KB")
