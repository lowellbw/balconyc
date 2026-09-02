"""Read the real rendered hero out of Chromium at each size, for each fix,
so the canvas artboards are measurements rather than drawings."""
from playwright.sync_api import sync_playwright
import json, pathlib
CHROME="/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
V=str(pathlib.Path(__file__).with_name("build"))
SIZES=[(390,844),(768,1024),(1280,800),(1440,1440),(1920,1080)]
BUILDS=[("CUR","today"),("A","A"),("B","B"),("C","C")]
# the narrow-screen directions, only at the sizes they change
NARROW_SIZES=[(390,844),(768,1024)]
NARROW_BUILDS=[("N1","N1"),("N2","N2"),("N3","N3")]

JS = r"""() => {
  const hero = document.getElementById('heroSection');
  const hb = hero.getBoundingClientRect();
  const rel = el => { const r = el.getBoundingClientRect();
    return {l:+(r.left-hb.left).toFixed(1), t:+(r.top-hb.top).toFixed(1),
            w:+r.width.toFixed(1), h:+r.height.toFixed(1)}; };
  const type = el => { const s = getComputedStyle(el);
    return {fs:s.fontSize, fw:s.fontWeight, lh:s.lineHeight, color:s.color,
            ls:s.letterSpacing, ff:s.fontFamily}; };
  const city = document.getElementById('heroCity');
  const sun  = document.getElementById('heroSun');
  const scrim= document.querySelector('.hero-scrim');
  const halo = document.getElementById('heroHalo');
  const h1   = document.getElementById('heroH1');
  const p    = document.querySelector('#heroContent > p');
  const wrap = document.querySelector('.hero-input-wrap');
  const inp  = document.querySelector('.hero-input');
  const btn  = document.getElementById('heroSubmit');
  const cs = getComputedStyle(city);
  return {
    hero: {w:+hb.width.toFixed(1), h:+hb.height.toFixed(1)},
    city: Object.assign(rel(city), {svg: city.innerHTML,
      mask: cs.maskImage && cs.maskImage !== 'none' ? cs.maskImage : null,
      opacity: cs.opacity, overflow: cs.overflow,
      // where the SVG actually lands inside its box (N3 crops it)
      inner: (() => { const g = city.querySelector('svg');
        if (!g) return null; const r = g.getBoundingClientRect(); const cb = city.getBoundingClientRect();
        return {l: +(r.left-cb.left).toFixed(1), t: +(r.top-cb.top).toFixed(1),
                w: +r.width.toFixed(1), h: +r.height.toFixed(1)}; })()}),
    sun:  Object.assign(rel(sun), {svg: sun.querySelector('svg').outerHTML,
      clock: document.getElementById('heroClock').textContent,
      opacity: getComputedStyle(sun).opacity,
      clockShown: getComputedStyle(document.getElementById('heroClock')).display !== 'none',
      // the rendered size of the sun glyph, after any scale
      glyph: (() => { const g = sun.querySelector('svg'); const r = g.getBoundingClientRect();
        const sb = sun.getBoundingClientRect();
        return {l: +(r.left-sb.left).toFixed(1), t: +(r.top-sb.top).toFixed(1),
                w: +r.width.toFixed(1), h: +r.height.toFixed(1)}; })()}),
    scrim: Object.assign(rel(scrim), {bg: getComputedStyle(scrim).backgroundImage}),
    halo:  Object.assign(rel(halo), {bg: getComputedStyle(halo).backgroundImage,
      shown: getComputedStyle(halo).display !== 'none'}),
    h1:   Object.assign(rel(h1),   {t_: type(h1),   text: h1.textContent}),
    p:    Object.assign(rel(p),    {t_: type(p),    html: p.innerHTML}),
    wrap: Object.assign(rel(wrap), {bg: getComputedStyle(wrap).backgroundColor,
      bd: getComputedStyle(wrap).border, br: getComputedStyle(wrap).borderRadius,
      sh: getComputedStyle(wrap).boxShadow}),
    inp:  Object.assign(rel(inp),  {t_: type(inp), ph: inp.placeholder,
      phColor: '#8896AB'}),
    btn:  Object.assign(rel(btn),  {t_: type(btn), text: btn.textContent,
      bg: getComputedStyle(btn).backgroundColor, br: getComputedStyle(btn).borderRadius}),
  };
}"""

out = {}
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME, args=["--use-gl=swiftshader","--allow-file-access-from-files"])
    ctx = b.new_context(); ctx.route("**google*.com**", lambda r: r.abort())
    jobs = [(k, l, w, h) for k, l in BUILDS for w, h in SIZES]
    jobs += [(k, l, w, h) for k, l in NARROW_BUILDS for w, h in NARROW_SIZES]
    for key, label, w, h in jobs:
        if True:
            pg = ctx.new_page(); pg.set_viewport_size({"width":w,"height":h})
            pg.goto(f"file://{V}/{key}.html"); pg.wait_for_timeout(700)
            # Park the sun at a fixed point on its arc. It idles on a sine when
            # untouched, so without this every capture lands somewhere new and
            # each rebuild churns all 28 artboards. A mousemove pins the target
            # for 2.4s; t eases toward it at 0.09/frame, so ~1.6s converges.
            pg.mouse.move(w * 0.46, h * 0.5)
            pg.wait_for_timeout(1600)
            out[f"{label}-{w}x{h}"] = pg.evaluate(JS)
            pg.close()
            print("captured", label, w, h)
    b.close()
pathlib.Path("hero-geometry.json").write_text(json.dumps(out), encoding="utf-8")
print("wrote hero-geometry.json", len(out), "captures")
