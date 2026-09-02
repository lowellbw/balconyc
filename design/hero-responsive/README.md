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

Geometry cannot answer this: a scrim or a mask changes what is *painted*
without moving anything. `measure.py` hides the copy, photographs what is
behind it, and reports the worst contrast ratio that background makes against
the grey subhead (`--text-sub`, `#596580`). WCAG AA for body text is 4.5:1.

```
python3 variants.py build     # the real index.html, one CSS rule swapped per variant
python3 measure.py build      # 17 window sizes x 4 builds
```

Result on the page as it ships: **10 of 17 sizes fail.**

## The options

| | holds at | trade |
|---|---|---|
| **A · own column** | 17/17 | overlap impossible by construction; loses the bleed under the input |
| **B · scrim to the copy edge** | 17/17 | keeps the composition; map still full-size behind the copy, just covered |
| **C · fade the map** | 12/17 — fails | a mask thins blocks, it does not remove them |

The sun fix is orthogonal and belongs in whichever option wins:
`padding-bottom: calc(min(58vw, 520px) + 62px)`.

## Rebuilding the canvas

```
python3 extract.py            # read rendered geometry out of Chromium -> hero-geometry.json
python3 build_canvas.py       # geometry -> 20 .dc.html artboards
```

The artboards are measurements, not drawings: every position came from the
browser rendering the real page at that size.
