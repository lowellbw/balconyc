# Hero responsiveness

Why the hero copy becomes unreadable at some window sizes, and what fixes it.

Canvas: https://claude.ai/code/artifact/30790e06-8cd1-414a-8868-cc670c683907

## The two faults

**1. Tall windows push the map under the copy.** `.hero-city` is sized from
the hero's *height* — `height: 82%` with `aspect-ratio: 1 / 1` — so its width
is driven by the viewport's height, not its width. A tall window grows the map
sideways into the copy column. At 1440×1440 the map's left edge lands at x=230
while the headline runs to x=688. This is why it only happens *sometimes*: it
tracks window height, and the scrim's fixed 16%/54% stops know nothing about
where the copy actually ends.

**2. Narrow screens put the sun over the address field.** The sun rides about
38px above the map's top edge, and the narrow-screen layout leaves only 14px of
clearance below the copy. The worst pixel behind the copy at 390×844 is
`#E0603A` — the sun, not a block.

## Measuring it

Geometry cannot answer this: a scrim changes what is *painted* without moving
anything. `measure.py` hides the copy, photographs what is behind it, and
reports the worst contrast ratio that background makes against the grey
subhead (`--text-sub`, `#596580`). WCAG AA for body text is 4.5:1.

```
python3 measure.py            # index.html as it stands, 19 window sizes
```

It exits non-zero if any size drops below AA. **Run it after touching the
hero.** Before the fix, 10 of 17 sizes failed.

## The options

| | holds at | trade |
|---|---|---|
| **A · own column** | 17/17 | overlap impossible by construction; loses the bleed under the input |
| **B · scrim to the copy edge** | 17/17 | keeps the composition; map still full-size behind the copy, just covered |
| **C · fade the map** | 12/17 — fails | a mask thins blocks, it does not remove them |

The sun fix is orthogonal and belongs in whichever option wins:
`padding-bottom: calc(min(58vw, 520px) + 62px)`.

## Phone and tablet

The map-below-the-copy layout reads, but it is a heavy slab under the form.
Three replacements, all measured over seven sizes from 360 to 1024:

| | holds at | trade |
|---|---|---|
| **N1 · wash** | 7/7 | the whole city behind the copy — but only at 9% opacity; at 18% the subhead fails |
| **N2 · motif** | 7/7 | a mark above the copy, `clamp(120px, 26vw, 240px)`; loses the scale, gains ~90px of height back |
| **N3 · band** | 7/7 | a horizon strip along the bottom; cropped, so it reads as texture |

Independent of the desktop choice — any pairs with A or B.

Two values here were set by measurement, not by eye: N1's opacity (0.18
failed at every size) and N2's `padding-top` (the motif clipped the copy by
8px at 768).

## What shipped

Desktop **B**, narrow **N1 wash**, plus a lighter sun: eight hairline rays on
a smaller disc instead of twelve alternating ones.

## The canvas

The 28 `.dc.html` artboards here are the record of that decision, and were
measurements rather than drawings — every position came from Chromium
rendering the real page at that size. Re-seed with
`seed-canvas.mjs --artboard <each> --canvas canvas.json`.

They show the map as it was at 36 columns. It has since been rebuilt at 72
(`design/home-directions/build_city_hero.py`) so Manhattan reads as itself
instead of merging into the Bronx and Queens, and the halo behind the sun is
gone — so treat the artboards as the record of the layout decision, not as
the current look.

The generator that produced them (`variants.py`, `extract.py`,
`build_canvas.py`) built the alternatives by patching the pre-fix
`index.html`. Those anchors no longer exist in the page, so rather than leave
scripts that crash, they are retired — they are in git history at `137f02b`
if the comparison ever needs redoing.
