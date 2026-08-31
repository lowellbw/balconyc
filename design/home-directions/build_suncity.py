# -*- coding: utf-8 -*-
"""Sun City: the block map as the page's background, lit by a sun that follows you.

The blocks are painted from ONE radial gradient in the SVG's own coordinate
space, so relighting the whole city is two attribute writes per frame rather
than a repaint of five thousand elements.

The tint is a lighting effect and says so. It makes no per-block data claim.
"""
from citymap import grid, PITCH, BLOCK

COLS = 120
CELLS, C, R = grid(COLS)
VW, VH = C * PITCH, R * PITCH

CX, CY, CW, CH = 320, 96, 850, 850        # city box inside the 1280x1060 frame
X0, X1 = 210, 1250                          # the sun's arc across the sky
YBASE, RISE = 132, 80
T0 = 0.62                                  # resting position, before any pointer

d = "".join(f"M{i*PITCH} {j*PITCH}h{BLOCK}v{BLOCK}h-{BLOCK}z" for (i, j) in CELLS)

sx = X0 + T0 * (X1 - X0)
sy = YBASE - RISE * (1 - (2 * T0 - 1) ** 2) ** 0.5
gx, gy = (sx - CX) * VW / CW, (sy - CY) * VH / CH

CITY = f"""<svg viewBox="0 0 {VW} {VH}" width="100%" height="100%" aria-hidden="true">
      <defs>
        <radialGradient id="sunlight" data-sun-grad gradientUnits="userSpaceOnUse" cx="{gx:.0f}" cy="{gy:.0f}" r="1600">
          <stop offset="0" stop-color="#FFE9B8"/>
          <stop offset="0.08" stop-color="#F9B622"/>
          <stop offset="0.20" stop-color="#D5941F"/>
          <stop offset="0.36" stop-color="#9E7930"/>
          <stop offset="0.56" stop-color="#6E5A38"/>
          <stop offset="0.78" stop-color="#4E4434"/>
          <stop offset="1" stop-color="#3D372E"/>
        </radialGradient>
      </defs>
      <path fill="url(#sunlight)" d="{d}"/>
    </svg>"""

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
    var root = this.root || document.getElementById('sun-root');
    if (!root) return;
    this.grad  = root.querySelector('[data-sun-grad]');
    this.disc  = root.querySelector('[data-sun-disc]');
    this.halo  = root.querySelector('[data-sun-halo]');
    this.clock = root.querySelector('[data-sun-clock]');
    if (!this.grad) return;

    this.move = function (e) {{
      var r = root.getBoundingClientRect();
      if (!r.width) return;
      self.target = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      self.idle = false;
      self.lastMove = Date.now();
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
    this.grad.setAttribute('cx', (((x - {CX}) * {VW}) / {CW}).toFixed(1));
    this.grad.setAttribute('cy', (((y - {CY}) * {VH}) / {CH}).toFixed(1));
    if (this.disc) {{ this.disc.style.left = x + 'px'; this.disc.style.top = y + 'px'; }}
    if (this.halo) {{ this.halo.style.left = x + 'px'; this.halo.style.top = y + 'px'; }}
    if (this.clock) {{
      var mins = Math.round((18 - t * 12) * 60);
      var h = Math.floor(mins / 60), m = mins % 60;
      var ap = h >= 12 ? 'PM' : 'AM';
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

PAGE = f"""<!doctype html>
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
    body {{ margin: 0; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif; color: #F2EDE4; line-height: 1.55; -webkit-font-smoothing: antialiased; background: #14120F; }}
    a {{ color: #F5A00B; }} a:hover {{ color: #FFC85A; }}
  </style>
</helmet>

<div id="sun-root" ref="{{{{bind}}}}" style="position: relative; width: 1280px; height: 1060px; background: #14120F; overflow: hidden">

  <div data-sun-halo style="position: absolute; left: {sx:.0f}px; top: {sy:.0f}px; width: 1500px; height: 1500px; margin: -750px 0 0 -750px; pointer-events: none; background: radial-gradient(circle closest-side, rgba(248,176,28,0.20) 0%, rgba(248,176,28,0.07) 34%, rgba(248,176,28,0) 66%)"></div>

  <div style="position: absolute; left: {CX}px; top: {CY}px; width: {CW}px; height: {CH}px; pointer-events: none">
    {CITY}
  </div>

  <div data-sun-disc style="position: absolute; left: {sx:.0f}px; top: {sy:.0f}px; width: 98px; height: 98px; margin: -49px 0 0 -49px; pointer-events: none; border-radius: 50%; background: radial-gradient(circle closest-side, #FFF6E0 0%, #FFD576 26%, rgba(248,176,28,0.55) 46%, rgba(248,176,28,0) 72%)"></div>

  <div style="position: relative; z-index: 3; display: flex; justify-content: space-between; align-items: center; padding: 10px 56px 0; pointer-events: none">
    <img src="balco-logo.png" alt="balco.nyc" style="height: 62px; width: auto; filter: brightness(0) invert(1)">
    <div style="display: flex; align-items: center; gap: 26px">
      <a href="#" style="text-decoration: none; font-weight: 700; font-size: 0.95rem; color: rgba(242,237,228,0.82); pointer-events: auto">About</a>
      <a href="#" style="text-decoration: none; font-weight: 700; font-size: 0.95rem; color: rgba(242,237,228,0.82); pointer-events: auto">FAQ</a>
      <a href="#" style="text-decoration: none; font-weight: 700; font-size: 0.95rem; color: rgba(242,237,228,0.82); pointer-events: auto">Methodology</a>
    </div>
  </div>

  <div style="position: relative; z-index: 3; padding: 104px 56px 0; max-width: 600px; pointer-events: none">
    <span style="display: block; font-size: 0.8rem; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: #F8B01C; margin-bottom: 18px">Every block in New York</span>
    <h1 style="font-size: 3.15rem; font-weight: 700; line-height: 1.04; letter-spacing: -0.032em; margin: 0 0 16px; color: #F5F1E9; text-wrap: balance">Find the sun on your block.</h1>
    <p style="font-size: 1.05rem; color: rgba(242,237,228,0.64); line-height: 1.55; margin: 0 0 28px">We traced a year of shadows across all five boroughs. Enter your address and see what an 800W panel on your balcony would make, in kWh, dollars and CO<sub style="font-size: 0.7em">2</sub>.</p>

    <div style="display: flex; align-items: center; gap: 6px; padding: 6px 6px 6px 4px; background: rgba(242,237,228,0.06); border: 1px solid rgba(242,237,228,0.2); border-radius: 16px; pointer-events: auto">
      <div style="flex: 1; min-width: 0; padding: 15px 17px; font-size: 1.02rem; color: rgba(242,237,228,0.45)">Enter an NYC address</div>
      <div style="padding: 14px 22px; background: #F8B01C; color: #14120F; border-radius: 12px; font-size: 0.96rem; font-weight: 700; white-space: nowrap">Calculate &rarr;</div>
    </div>
  </div>

  <div style="position: absolute; z-index: 3; left: 56px; bottom: 168px; width: 372px; background: rgba(20,18,15,0.78); border: 1px solid rgba(242,237,228,0.14); border-radius: 14px; padding: 18px 20px; pointer-events: none">
    <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px">
      <span style="font-size: 0.66rem; font-weight: 700; letter-spacing: 0.11em; text-transform: uppercase; color: rgba(242,237,228,0.52)">Move your cursor</span>
      <span data-sun-clock style="font-size: 0.86rem; font-weight: 700; color: #F8B01C">10:34 AM</span>
    </div>
    <p style="margin: 0; font-size: 0.84rem; color: rgba(242,237,228,0.6); line-height: 1.5">Walk the sun across the sky and watch the city catch it. The map is north-up, so the right side is east and morning, the left is west and evening. This is light, not data &mdash; the blocks are real, but their shading is the sun&rsquo;s position, not each block&rsquo;s output. Your own number comes from your address.</p>
  </div>

  <div style="position: absolute; z-index: 3; left: 0; right: 0; bottom: 0; background: rgba(9,8,7,0.94); border-top: 1px solid rgba(242,237,228,0.1); padding: 22px 56px; display: flex; align-items: center; gap: 24px; pointer-events: none">
    <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F8B01C" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 8v5"></path><path d="M12 16.2v.1"></path></svg>
      <span style="font-size: 0.72rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #F8B01C; white-space: nowrap">Not legal yet</span>
    </div>
    <p style="margin: 0; font-size: 0.92rem; color: rgba(242,237,228,0.7); line-height: 1.5">The SUNNY Act removes the utility barrier for plug-in solar up to 1,200W. It passed the Senate in April 2026 and the Assembly on 28 May, and awaits the Governor&rsquo;s signature, taking effect 90 days later. Realistic opening: <strong style="color: #F5F1E9; font-weight: 700">early 2027</strong>.</p>
    <a href="#" style="flex-shrink: 0; font-size: 0.88rem; font-weight: 700; text-decoration: underline; text-underline-offset: 3px; white-space: nowrap; pointer-events: auto">Track the bill &rarr;</a>
  </div>

</div>
</x-dc>
<script data-dc-script data-props='{{"$preview":{{"width":1280,"height":1060}}}}'>
{SCRIPT}
</script>
</body>
</html>
"""

open("SunCity.dc.html", "w").write(PAGE)
print(f"SunCity.dc.html  {len(PAGE)/1024:.0f}KB · {len(CELLS)} blocks · sun rests at ({sx:.0f}, {sy:.0f})")
