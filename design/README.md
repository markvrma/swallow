# Design canvas

Source for the "quiet UI" direction: drab warm-grey palette, zero corner radius,
hairline borders, one saturated colour in the whole product (the Random button),
and a red deliberation timer top-right on every screen.

| File | Artboard |
| --- | --- |
| `Landing.dc.html` | Signed-out landing |
| `Main.dc.html` | Home |
| `Episode.dc.html` | The episode you were handed |
| `Controlled.dc.html` | Controlled-random builder |
| `System.dc.html` | Palette, button states, timer |
| `AltDark.dc.html` | Alternate: same system, dark ground |
| `canvas.json` | Layout, sticky notes, launch view |

The seeded `swallow-quiet-ui.html` is a build output (~2.5 MB) and is gitignored.
Regenerate it with the `/design` skill's helper:

```bash
node "<skill dir>/seed-canvas.mjs" \
  --template "<skill dir>/payload.template.html" \
  --out swallow-quiet-ui.html --title "Swallow Quiet UI" \
  --artboard Main.dc.html --artboard Landing.dc.html --artboard Episode.dc.html \
  --artboard Controlled.dc.html --artboard System.dc.html --artboard AltDark.dc.html \
  --canvas canvas.json
```

## Palette

| Token | Light | Dark |
| --- | --- | --- |
| ground | `#E4E2DC` | `#1B1B18` |
| bar | `#DEDBD3` | `#201F1C` |
| raised | `#EDEBE6` | `#232320` |
| line | `#C3BFB4` | `#33322C` |
| muted | `#8A877D` | `#6E6B62` |
| ink | `#26251F` | `#D8D5CC` |
| ink-2 | `#4A483F` | `#9A968B` |
| **Random** | `#2050C8` | `#3D6FE8` |
| **timer** | `#B33124` | `#D9584A` |

Type: IBM Plex Sans (UI), IBM Plex Mono (anything numeric).
Hover: one step darker over 110ms — no lift, shadow or scale.
