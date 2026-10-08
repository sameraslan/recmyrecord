# Favicon brief: recmyrecord, Trifid theme

## The product

recmyrecord is a music site. You start from an album you like and get the most similar albums, by sound and by mood. Its centrepiece is a map of 10,000+ albums drawn as a nebula: a near-black sky, clouds of softly swirling coloured gas, and each album a small star inside the gas. The theme is named after the Trifid Nebula (a real nebula famous for a glowing cloud cut into three lobes by dark dust lanes).

The owner's taste, in his words: "this very continuous thing, and there's this swirling of the colors", "it should just be a vibe", "making it aesthetic, making it fun, and keeping it simple". He disliked things that look "artificial" or "a bit cheap". Beauty first; nothing that needs explaining.

## Look at these first (Read them as images)

All under `ref/` next to this file:

- `chosen-whole.jpg`: the whole map. THE reference for colour and gas texture. Ignore the region names written on it; they were removed.
- `chosen-home.jpg`: the home page (the nebula behind a serif headline).
- `chosen-overview.jpg`, `chosen-album.jpg`, `02-trifid-overview.jpg`: closer views.
- `favicon-sizes.png` and `current-icon.svg`, `current-icon-16.svg`, `current-apple-icon.svg`: the favicon today. A grey mark of three stars joined by lines on a dark rounded square. It is tidy but has none of the theme's colour or life. We want something cooler. You may evolve it or drop it.

## Palette (sRGB)

- Sky (background): `#060609` (the icon tile today uses `#07060a`, edge `#24222c`)
- Gas, "Ember" palette, five families:
  - fierce red-orange `#e8603c`
  - warm gold `#f4be78`
  - quiet pale teal `#96c8d6` (in the brightest gas it reads as a vivid cyan-teal, see the image)
  - dark deep blue `#426ebe`
  - urban periwinkle `#788cdc`
- Neutral gas `#8a8a92`
- Star white `#fffaf4`, off-white accent `#f1ece4`, dust grey `#c4beb6`, ash `#aaa49d`

You may use tints, shades and blends of these (as gradients do in the gas), but no hue from outside this family. The wordmark font is a serif italic (Cormorant-like); body is a plain sans.

## What a favicon has to survive

- 16 x 16 px in a browser tab, on BOTH a light tab bar (about `#dee1e6` or white) and a dark one (about `#202124` or `#35363a`). This is the size most people see. Fine texture vanishes; at 16 px you have room for roughly one shape and one or two colour areas.
- 32 px (retina tabs, bookmarks), 48 px, and 180 px (phone home screen; opaque, iOS rounds the corners itself, keep the mark inside the middle ~70%).
- It should be recognisable as a silhouette, and distinct from the many dark-circle icons in a tab row.

## What to deliver

Work only inside the directory you are given. For EACH concept, in `<concept-slug>/`:

- `icon.svg`: viewBox `0 0 32 32`, the master for 32 px and up in tabs.
- `icon-16.svg`: viewBox `0 0 16 16`, redrawn and simplified for the pixel grid (not just the master scaled).
- `apple-icon.svg`: viewBox `0 0 180 180`, opaque full-bleed background, room to be richer.
- `NOTES.md`: name, the idea in two sentences, what happens at 16 px, known weaknesses.

SVG rules: self-contained, no external files, fonts, `<image>` or scripts. Gradients, masks, clip paths and simple blur filters are fine. `feTurbulence` is allowed in the 180 px icon only, and only if it truly looks good; do not depend on it at 16 or 32. Keep `icon.svg` under about 4 KB. Decide per concept whether the mark sits on a dark rounded tile or floats on transparency, and check that choice on both light and dark tab bars.

## Check your own work (required)

Render and LOOK before you finish. Tools on this machine: `rsvg-convert` and Python 3 with PIL.

```bash
rsvg-convert -w 16 -h 16 icon-16.svg -o r16.png
rsvg-convert -w 32 -h 32 icon.svg -o r32.png
rsvg-convert -w 180 -h 180 apple-icon.svg -o r180.png
```

Then with PIL build one `sheet.png` per concept: the 16 px and 32 px renders pasted at true size AND enlarged with nearest-neighbour (x12 and x6), each on a light (`#dee1e6`) and a dark (`#202124`) strip, plus the 180 px. Read `sheet.png` as an image and judge it honestly at true size. Iterate at least twice: the first draft of a favicon is almost always too detailed or too dim at 16 px. Commands are light; run them one at a time, do not start browsers or dev servers.

## Report back

For each concept: slug, one-line idea, your honest verdict at 16 px, and which of your concepts you would pick and why. Keep it under 300 words. Do not touch git or any file outside your directory.
