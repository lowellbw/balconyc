from build_city import CITY_SVG

TPL = """<!doctype html>
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
    body { margin: 0; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif; color: #F2EDE4; line-height: 1.55; -webkit-font-smoothing: antialiased; background: #14120F; }
    a { color: #F5A00B; } a:hover { color: #FFC04A; }
  </style>
</helmet>

<div style="position: relative; width: 1280px; height: 1060px; background: #14120F; overflow: hidden">

  <!-- the city itself: every block of the five boroughs, from NYC borough boundaries -->
  <div style="position: absolute; left: 300px; top: 40px; width: 900px; height: 900px">__CITY__</div>

  <!-- low sun raking in from the east -->
  <div style="position: absolute; inset: 0; background: radial-gradient(circle 760px at 90% 4%, rgba(245,160,11,0.17) 0%, rgba(245,160,11,0.06) 42%, rgba(245,160,11,0) 70%)"></div>

  <!-- scrim, so the copy has ground to stand on -->
  <div style="position: absolute; inset: 0; background: linear-gradient(90deg, #14120F 0%, rgba(20,18,15,0.94) 22%, rgba(20,18,15,0.6) 44%, rgba(20,18,15,0) 62%)"></div>

  <!-- nav -->
  <div style="position: relative; z-index: 3; display: flex; justify-content: space-between; align-items: center; padding: 10px 56px 0">
    <img src="balco-logo.png" alt="balco.nyc" style="height: 62px; width: auto; filter: brightness(0) invert(1)">
    <div style="display: flex; align-items: center; gap: 26px">
      <a href="#" style="text-decoration: none; font-weight: 700; font-size: 0.95rem; color: rgba(242,237,228,0.82)">About</a>
      <a href="#" style="text-decoration: none; font-weight: 700; font-size: 0.95rem; color: rgba(242,237,228,0.82)">FAQ</a>
      <a href="#" style="text-decoration: none; font-weight: 700; font-size: 0.95rem; color: rgba(242,237,228,0.82)">Methodology</a>
    </div>
  </div>

  <!-- hero copy, sitting in the harbour west of Manhattan -->
  <div style="position: relative; z-index: 3; padding: 74px 56px 0; max-width: 596px">
    <span style="display: block; font-size: 0.8rem; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: #F5A00B; margin-bottom: 18px">Every block in New York</span>
    <h1 style="font-size: 3.1rem; font-weight: 700; line-height: 1.04; letter-spacing: -0.032em; margin: 0 0 16px; color: #F2EDE4; text-wrap: balance">Find the sun on your block.</h1>
    <p style="font-size: 1.05rem; color: rgba(242,237,228,0.66); line-height: 1.55; margin: 0 0 28px">We traced a year of shadows across all five boroughs. Enter your address and see what an 800W panel on your balcony would make, in kWh, dollars and CO<sub style="font-size: 0.7em">2</sub>.</p>

    <div style="display: flex; align-items: center; gap: 6px; padding: 6px 6px 6px 4px; background: rgba(242,237,228,0.06); border: 1px solid rgba(242,237,228,0.2); border-radius: 16px">
      <div style="flex: 1; min-width: 0; padding: 15px 17px; font-size: 1.02rem; color: rgba(242,237,228,0.45)">Enter an NYC address</div>
      <div style="padding: 14px 22px; background: #F5A00B; color: #14120F; border-radius: 12px; font-size: 0.96rem; font-weight: 700; white-space: nowrap">Calculate &rarr;</div>
    </div>
  </div>

  <!-- legend -->
  <div style="position: absolute; z-index: 3; left: 56px; bottom: 176px; width: 348px; background: rgba(20,18,15,0.74); border: 1px solid rgba(242,237,228,0.12); border-radius: 14px; padding: 18px 20px">
    <div style="font-size: 0.66rem; font-weight: 700; letter-spacing: 0.11em; text-transform: uppercase; color: rgba(242,237,228,0.5); margin-bottom: 11px">Sun reaching a balcony</div>
    <div style="display: flex; gap: 2px">
      <div style="flex: 1; height: 11px; background: #37312A; border-radius: 3px 0 0 3px"></div>
      <div style="flex: 1; height: 11px; background: #473E33"></div>
      <div style="flex: 1; height: 11px; background: #5E4E3A"></div>
      <div style="flex: 1; height: 11px; background: #8E6E2E"></div>
      <div style="flex: 1; height: 11px; background: #C4911E"></div>
      <div style="flex: 1; height: 11px; background: #F5A00B; border-radius: 0 3px 3px 0"></div>
    </div>
    <div style="display: flex; justify-content: space-between; margin-top: 7px; font-size: 0.73rem; color: rgba(242,237,228,0.55)">
      <span>hemmed in</span><span>open sky</span>
    </div>
    <p style="margin: 13px 0 0; font-size: 0.76rem; color: rgba(242,237,228,0.42); line-height: 1.5">Shading here is drawn from how open each block&rsquo;s sky is. Real per-block output needs a citywide run of the model &mdash; <strong style="color: rgba(242,237,228,0.6); font-weight: 600">[NOT YET COMPUTED]</strong>.</p>
  </div>

  <!-- the legal position, said once, up front -->
  <div style="position: absolute; z-index: 3; left: 0; right: 0; bottom: 0; background: rgba(10,9,7,0.92); border-top: 1px solid rgba(242,237,228,0.1); padding: 22px 56px; display: flex; align-items: center; gap: 24px">
    <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F5A00B" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 8v5"></path><path d="M12 16.2v.1"></path></svg>
      <span style="font-size: 0.72rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #F5A00B; white-space: nowrap">Not legal yet</span>
    </div>
    <p style="margin: 0; font-size: 0.92rem; color: rgba(242,237,228,0.7); line-height: 1.5">The SUNNY Act removes the utility barrier for plug-in solar up to 1,200W. It passed the Senate in April 2026 and the Assembly on 28 May, and awaits the Governor&rsquo;s signature, taking effect 90 days later. Realistic opening: <strong style="color: #F2EDE4; font-weight: 700">early 2027</strong>.</p>
    <a href="#" style="flex-shrink: 0; font-size: 0.88rem; font-weight: 700; text-decoration: underline; text-underline-offset: 3px; white-space: nowrap">Track the bill &rarr;</a>
  </div>

</div>
</x-dc>
<script data-dc-script data-props='{"$preview":{"width":1280,"height":1060}}'>
class Component extends DCLogic {}
</script>
</body>
</html>
"""

out = TPL.replace("__CITY__", CITY_SVG)
open("BlockCity.dc.html", "w").write(out)
print("BlockCity.dc.html  %.0fKB" % (len(out) / 1024))
