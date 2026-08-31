# -*- coding: utf-8 -*-
"""Sun City on white: a moving sun, and blocks that catch it unevenly.

Every block gets one of six "catch" tiers. A tier is one <path> filled from its
own radial gradient; tiers differ only in gradient RADIUS, so a high tier stays
lit far from the sun while a low tier only flares when the sun is on top of it.
All six centres move together, so relighting the city is six attribute writes a
frame and the light lands speckled rather than as a smooth wash.

Which tier a block sits in is texture, not data.
"""
import math
from citymap import grid, PITCH, BLOCK

COLS = 96
CELLS, C, R = grid(COLS)
VW, VH = C * PITCH, R * PITCH

CX, CY, CW, CH = 306, 50, 946, 946        # the city, filling most of the frame
X0, X1 = 600, 1180                        # the sun's arc, clear of the copy
YBASE, RISE = 148, 64
T0 = 0.46

def rough(i, j):
    return (0.60 * math.sin(i * 2.13 + j * 1.71)
            + 0.44 * math.sin(i * 1.29 - j * 2.44)
            + 0.30 * math.sin(i * 0.37 + j * 0.53)
            + 0.22 * math.sin(i * 3.71 - j * 0.91))

SHARE = [0.13, 0.19, 0.24, 0.22, 0.15, 0.07]
RADII = [620, 900, 1220, 1580, 2050, 2600]

order = sorted(CELLS, key=lambda k: rough(*k))
tier, at, k = {}, 0.0, 0
for idx, key in enumerate(order):
    while k < len(SHARE) - 1 and idx >= at + SHARE[k] * len(order):
        at += SHARE[k] * len(order); k += 1
    tier[key] = k

sx = X0 + T0 * (X1 - X0)
sy = YBASE - RISE * math.sqrt(max(0.0, 1 - (2 * T0 - 1) ** 2))
gx, gy = (sx - CX) * VW / CW, (sy - CY) * VH / CH

VARIANTS = [
  ("Solar yellow", dict(
    ink="#1A1710", sub="#6B6552", ground="#FFFEFA", hair="#E8E3D2",
    accent="#F2C200", btnink="#1A1710", disc="#FFD400", halo="rgba(255,206,0,0.30)",
    stops=[(0.00,"#FFF48C"),(0.07,"#FFD400"),(0.20,"#EDBE00"),
           (0.40,"#D9D08C"),(0.62,"#D4D0B4"),(1.00,"#CFCBB2")])),
  ("Sun and shade", dict(
    ink="#16171A", sub="#697079", ground="#FDFDFC", hair="#E1E4E7",
    accent="#C87F12", btnink="#FFFFFF", disc="#FFC53D", halo="rgba(232,160,20,0.24)",
    stops=[(0.00,"#FFD062"),(0.07,"#EDA015"),(0.20,"#C88E2A"),
           (0.38,"#A8A79E"),(0.58,"#B4BFCB"),(1.00,"#AEB9C6")])),
  ("Brand red", dict(
    ink="#171717", sub="#6B6360", ground="#FFFCFC", hair="#EADFDD",
    accent="#7F1D1D", btnink="#FFFFFF", disc="#E0603A", halo="rgba(191,60,32,0.22)",
    stops=[(0.00,"#F49472"),(0.07,"#C2452A"),(0.20,"#9E2C1E"),
           (0.40,"#BE9A92"),(0.62,"#CDBDB9"),(1.00,"#C9B9B5")])),
  ("Civic navy", dict(
    ink="#14171A", sub="#66707C", ground="#FCFDFF", hair="#DCE3EA",
    accent="#10406C", btnink="#FFFFFF", disc="#5AA0E0", halo="rgba(29,96,160,0.22)",
    stops=[(0.00,"#93CAF7"),(0.07,"#2E7ABF"),(0.20,"#1A5490"),
           (0.40,"#93A6B8"),(0.62,"#B4C0CC"),(1.00,"#B0BDC9")])),
  ("Dusk violet", dict(
    ink="#17141C", sub="#6C6579", ground="#FDFCFE", hair="#E3DEEA",
    accent="#6D3A9C", btnink="#FFFFFF", disc="#C77DE8", halo="rgba(140,74,190,0.22)",
    stops=[(0.00,"#E7B4F2"),(0.07,"#A855C9"),(0.20,"#7E3AA6"),
           (0.40,"#A99AC0"),(0.62,"#C3BCD2"),(1.00,"#BEB6CE")])),
]

# One pattern cell carries the sheen for every block: a curved highlight across
# the top and a faint shade at the foot. Drawing it once and tiling it costs a
# single extra path instead of three more shapes per block.
GLOSS = (f'<pattern id="gloss" x="0" y="0" width="{PITCH}" height="{PITCH}" '
         f'patternUnits="userSpaceOnUse">'
         f'<path d="M0 0H{BLOCK}V2.5C{BLOCK*0.72} 4.5 {BLOCK*0.36} 5.3 0 5.5Z" fill="#FFFFFF" opacity="0.42"/>'
         f'<path d="M0 0H{BLOCK}V0.9H0Z" fill="#FFFFFF" opacity="0.34"/>'
         f'<path d="M{BLOCK} {BLOCK}H0V6.6C{BLOCK*0.4} 6.4 {BLOCK*0.75} 5.6 {BLOCK} 3.9Z" fill="#0B0B0B" opacity="0.07"/>'
         f'</pattern>')

ALL_BLOCKS = "".join(f"M{i*PITCH} {j*PITCH}h{BLOCK}v{BLOCK}h-{BLOCK}z" for (i, j) in CELLS)

def city_svg(v):
    defs = "".join(
        f'<radialGradient id="sun{k}" data-sun-grad gradientUnits="userSpaceOnUse" '
        f'cx="{gx:.0f}" cy="{gy:.0f}" r="{RADII[k]}">'
        + "".join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in v["stops"])
        + "</radialGradient>" for k in range(len(RADII)))
    paths = "".join(
        f'<path fill="url(#sun{k})" d="'
        + "".join(f"M{i*PITCH} {j*PITCH}h{BLOCK}v{BLOCK}h-{BLOCK}z"
                  for (i, j), t in tier.items() if t == k)
        + '"/>' for k in range(len(RADII)))
    return (f'<svg viewBox="0 0 {VW} {VH}" width="100%" height="100%" '
            f'aria-hidden="true"><defs>{defs}{GLOSS}</defs>{paths}'
            f'<path fill="url(#gloss)" d="{ALL_BLOCKS}"/></svg>')

def sun_svg(v):
    rays = "".join(
        f'<rect x="48.3" y="{16 if a % 60 == 0 else 20}" width="3.4" '
        f'height="{13 if a % 60 == 0 else 9}" rx="1.7" fill="{v["disc"]}" '
        f'transform="rotate({a} 50 50)"/>' for a in range(0, 360, 30))
    return (f'<svg viewBox="0 0 100 100" width="100" height="100" aria-hidden="true">'
            f'<g class="rays">{rays}</g>'
            f'<circle cx="50" cy="50" r="15.5" fill="{v["disc"]}"/></svg>')

SCRIPT = f"""
class Component extends DCLogic {{
  constructor(props) {{
    super(props);
    this.t = {T0}; this.target = {T0};
    this.phase = Math.asin(({T0} - 0.5) / 0.46);
    this.idle = true; this.lastMove = 0;
  }}
  renderVals() {{ return {{ bind: this.bind.bind(this) }}; }}
  bind(el) {{ if (el) this.root = el; }}
  componentDidMount() {{
    var self = this;
    var root = this.root || document.querySelector('[data-sun-root]');
    if (!root) return;
    this.grads = root.querySelectorAll('[data-sun-grad]');
    this.sun   = root.querySelector('[data-sun]');
    this.halo  = root.querySelector('[data-sun-halo]');
    this.clock = root.querySelector('[data-sun-clock]');
    if (!this.grads.length) return;
    this.move = function (e) {{
      var r = root.getBoundingClientRect();
      if (!r.width) return;
      self.target = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      self.idle = false; self.lastMove = Date.now();
    }};
    this.leave = function () {{ self.lastMove = Date.now(); }};
    root.addEventListener('mousemove', this.move);
    root.addEventListener('mouseleave', this.leave);
    this.rootEl = root;
    var tick = function () {{
      self.frame = requestAnimationFrame(tick);
      if (!self.idle && Date.now() - self.lastMove > 2400) self.idle = true;
      if (self.idle) {{
        self.phase += 0.0021;
        self.target = 0.5 + 0.46 * Math.sin(self.phase);
      }}
      self.t += (self.target - self.t) * 0.09;
      self.paint();
    }};
    tick();
  }}
  paint() {{
    var t = this.t;
    var x = {X0} + t * ({X1} - {X0});
    var y = {YBASE} - {RISE} * Math.sqrt(Math.max(0, 1 - Math.pow(2 * t - 1, 2)));
    var cx = (((x - {CX}) * {VW}) / {CW}).toFixed(1);
    var cy = (((y - {CY}) * {VH}) / {CH}).toFixed(1);
    for (var i = 0; i < this.grads.length; i++) {{
      this.grads[i].setAttribute('cx', cx);
      this.grads[i].setAttribute('cy', cy);
    }}
    if (this.sun)  {{ this.sun.style.left  = x + 'px'; this.sun.style.top  = y + 'px'; }}
    if (this.halo) {{ this.halo.style.left = x + 'px'; this.halo.style.top = y + 'px'; }}
    if (this.clock) {{
      var mins = Math.round((18 - t * 12) * 60);
      var h = Math.floor(mins / 60), m = mins % 60, ap = h >= 12 ? 'PM' : 'AM';
      var h12 = h % 12; if (h12 === 0) h12 = 12;
      this.clock.textContent = h12 + ':' + (m < 10 ? '0' + m : m) + ' ' + ap;
    }}
  }}
  componentWillUnmount() {{
    if (this.frame) cancelAnimationFrame(this.frame);
    if (this.rootEl) {{
      this.rootEl.removeEventListener('mousemove', this.move);
      this.rootEl.removeEventListener('mouseleave', this.leave);
    }}
  }}
}}
"""

def page(v):
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap">
  <style>
    body {{ margin: 0; font-family: 'DM Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif; color: {v['ink']}; line-height: 1.55; -webkit-font-smoothing: antialiased; background: {v['ground']}; }}
    a {{ color: {v['ink']}; }} a:hover {{ color: {v['accent']}; }}
    .rays {{ transform-origin: 50% 50%; animation: sunturn 120s linear infinite; }}
    @keyframes sunturn {{ to {{ transform: rotate(360deg); }} }}
  </style>
</helmet>

<div data-sun-root ref="{{{{bind}}}}" style="position: relative; width: 1280px; height: 1060px; background: {v['ground']}; overflow: hidden">

  <div style="position: absolute; left: {CX}px; top: {CY}px; width: {CW}px; height: {CH}px; pointer-events: none">
    {city_svg(v)}
  </div>

  <div data-sun-halo style="position: absolute; left: {sx:.0f}px; top: {sy:.0f}px; width: 1180px; height: 1180px; margin: -590px 0 0 -590px; pointer-events: none; background: radial-gradient(circle closest-side, {v['halo']} 0%, rgba(255,255,255,0) 60%)"></div>

  <!-- the copy sits on the ground, the city fades in behind it -->
  <div style="position: absolute; inset: 0; pointer-events: none; background: linear-gradient(90deg, {v['ground']} 0%, {v['ground']} 17%, rgba(255,255,255,0) 52%)"></div>
  <div style="position: absolute; inset: 0; pointer-events: none; background: linear-gradient(0deg, {v['ground']} 0%, rgba(255,255,255,0) 13%)"></div>

  <div data-sun style="position: absolute; left: {sx:.0f}px; top: {sy:.0f}px; width: 100px; margin: -50px 0 0 -50px; pointer-events: none; text-align: center">
    {sun_svg(v)}
    <div style="margin-top: 3px; display: flex; justify-content: center"><span data-sun-clock style="display: inline-block; background: rgba(255,255,255,0.92); border: 1px solid {v['hair']}; border-radius: 999px; padding: 3px 10px; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.03em; color: {v['accent']}; white-space: nowrap">11:02 AM</span></div>
  </div>

  <div style="position: relative; z-index: 3; display: flex; justify-content: space-between; align-items: center; padding: 12px 56px 0; pointer-events: none">
    <img src="balco-logo.png" alt="balco.nyc" style="height: 56px; width: auto">
    <div style="display: flex; align-items: center; gap: 26px">
      <a href="#" style="text-decoration: none; font-weight: 700; font-size: 0.92rem; color: {v['sub']}; pointer-events: auto">About</a>
      <a href="#" style="text-decoration: none; font-weight: 700; font-size: 0.92rem; color: {v['sub']}; pointer-events: auto">Methodology</a>
      <a href="#" style="text-decoration: none; font-weight: 700; font-size: 0.92rem; color: {v['sub']}; pointer-events: auto">FAQ</a>
    </div>
  </div>

  <div style="position: relative; z-index: 3; padding: 116px 56px 0; max-width: 546px; pointer-events: none">
    <span style="display: block; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: {v['accent']}; margin-bottom: 16px">Every block in New York</span>
    <h1 style="font-size: 3.25rem; font-weight: 700; line-height: 1.03; letter-spacing: -0.034em; margin: 0 0 16px; text-wrap: balance">Find the sun on your block.</h1>
    <p style="font-size: 1.04rem; color: {v['sub']}; line-height: 1.55; margin: 0 0 30px; max-width: 44ch">We traced a year of shadows across all five boroughs. Enter your address and see what an 800W panel on your balcony would make, in kWh, dollars and CO<sub style="font-size: 0.7em">2</sub>.</p>

    <div style="display: flex; align-items: center; gap: 10px; pointer-events: auto">
      <div style="flex: 1; min-width: 0; border: 1.5px solid {v['hair']}; border-radius: 999px; padding: 16px 24px; font-size: 1rem; color: {v['sub']}; background: #fff; box-shadow: 0 1px 3px rgba(20,20,20,0.05)">Enter an NYC address</div>
      <div style="display: inline-flex; align-items: center; gap: 9px; padding: 16px 26px; background: {v['accent']}; color: {v['btnink']}; border-radius: 999px; font-size: 0.97rem; font-weight: 700; white-space: nowrap; box-shadow: 0 2px 12px rgba(20,20,20,0.12)">
        Calculate
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="{v['btnink']}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13"></path><path d="M12 5l7 7-7 7"></path></svg>
      </div>
    </div>

    <p style="margin: 18px 0 0; max-width: 43ch; font-size: 0.79rem; color: {v['sub']}; line-height: 1.5">Every square is a block of the five boroughs. Its shading is where the sun is standing, not what that block produces.</p>
  </div>

  <div style="position: absolute; z-index: 3; left: 0; right: 0; bottom: 0; border-top: 1px solid {v['hair']}; background: rgba(255,255,255,0.94); padding: 20px 56px; display: flex; align-items: center; gap: 22px; pointer-events: none">
    <div style="display: flex; align-items: center; gap: 9px; flex-shrink: 0">
      <span style="width: 11px; height: 11px; background: {v['accent']}; flex-shrink: 0"></span>
      <span style="font-size: 0.71rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: {v['accent']}; white-space: nowrap">Not legal yet</span>
    </div>
    <p style="margin: 0; font-size: 0.89rem; color: {v['sub']}; line-height: 1.5">The SUNNY Act removes the utility barrier for plug-in solar up to 1,200W. It passed the Senate in April 2026 and the Assembly on 28 May, and awaits the Governor&rsquo;s signature, taking effect 90 days later. Realistic opening: <strong style="color: {v['ink']}; font-weight: 700">early 2027</strong>.</p>
    <a href="#" style="flex-shrink: 0; font-size: 0.86rem; font-weight: 700; text-decoration: underline; text-underline-offset: 3px; white-space: nowrap; pointer-events: auto">Track the bill &rarr;</a>
  </div>

</div>
</x-dc>
<script data-dc-script data-props='{{"$preview":{{"width":1280,"height":1060}}}}'>
{SCRIPT}
</script>
</body>
</html>
"""

FILES = {"Solar yellow": "SunYellow", "Sun and shade": "SunDuo", "Brand red": "SunRed",
         "Civic navy": "SunNavy", "Dusk violet": "SunViolet"}
for name, v in VARIANTS:
    fn = FILES[name] + ".dc.html"
    out = page(v)
    open(fn, "w").write(out)
    print(f"{fn:20} {len(out)/1024:.0f}KB   {name}")
