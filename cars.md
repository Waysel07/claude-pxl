# pxl cars

Read this when asked to draw cars or other road vehicles. The built-in kit builds a whole car
from a side profile, the way a body is really shaped: near side, the end turned toward the
viewer (nose or tail), glass with reflections, wheels, seams, lights. You choose the body, the
colors and the view; then add what makes it *that* car on top.

```js
include("pxl:cars")

pal({ k: "#020304" })
ramp("123456", "#8c9aa8", { at: 3, shift: 0.5 })                  // paint: 6 keys, base on the 4th
pal({ g: "#101314", G: "#262b30", h: "#465052", H: "#73808c" })   // glass: 4 keys dark -> light
pal({ t: "#050606", T: "#1b1d1f", u: "#34383a" })                 // tyres + black trim: 3 keys
pal({ m: "#5b5e62", M: "#959fa8", n: "#dfe5ea" })                 // rims + chrome: 3 keys
pal({ Y: "#8f0d22", Z: "#e2283c", 8: "#c9b987", 9: "#fff3c4" })   // tail and head lights: 2 keys each
ramps("gGhH", "tTu", "mMn", "YZ", "89")

const kit = { glass: "gGhH", trim: "tTu", metal: "mMn", tail: "YZ", head: "89" }
car("s13", { ...kit, body: "coupe", paint: "123456", camber: 2 })
car("s13_red", { ...kit, body: "coupe", paint: "abcdef", view: "rear", spoiler: true })
```

Full example with every body and an animated rainy night scene: `examples/cars.px.js`.

## car(name, options)

| Option | Meaning |
|---|---|
| `body` | `"coupe"`, `"hatch"`, `"sedan"`, `"wagon"`, `"wedge"`, `"kei"`, or your own shape (below). |
| `paint` | 6 keys dark → light. Use `ramp("abcdef", "#hex", { at: 3 })` so the 4th key is the car's color. |
| `glass`, `trim`, `metal` | 4, 3 and 3 keys dark → light. Glass needs real spread (near-black to a mid grey-blue) or the reflections vanish. |
| `head`, `tail` | 2 keys each (dark, light) for the lights; default: taken from `metal`. |
| `view` | `"front"` (default) or `"rear"`: which end faces the viewer. |
| `yaw` | 0 = pure side view … 60 = mostly the end. Default 42 (three-quarter). |
| `pitch` | px of looking down on the car (default 0 = eye level; 3–5 shows roof and boot lid). |
| `scale` | Size factor; 1 is about 130 px long. 0.5 gives small traffic cars. |
| `facing` | `"right"` (default: the visible end is on the right) or `"left"`. |
| `camber`, `tyre`, `rim`, `spin` | Stance: wheel tilt in px; sidewall height (0.14 low profile … 0.35 off-road); `wheel()` options such as `{ spokes: 6, dish: 3 }`; wheel angle in degrees. |
| `headStyle`, `tailStyle` | Light shapes: `"bar"` (default: one segmented band), `"blocks"` (rectangular clusters, 70s–90s), `"round"` (round lamps; `quad: true` for four headlights), `"slim"` (modern LED strips). |
| `bumper`, `chrome` | `"black"` (default), `"body"` (painted, modern) or `"chrome"` (classic); `chrome: true` adds bright window trim. |
| `wheels` | `"spoke"` (default five-spoke), `"mesh"` (lattice with a deep lip), `"split"` (thin twin spokes), `"steel"`, `"disc"`. `rim: { ... }` overrides any `wheel()` option. |
| `exhaust`, `shadow: false` | 1 or 2 tailpipes; drop the contact-shadow line under the car. |
| `spoiler`, `popups`, `stripe`, `mirror: false`, `k` | Rear wing, raised pop-up headlights, side stripe key, no mirror; `k: "k"` outlines the car, tinted by the paint it borders. |

Era in three options: classic = `bumper: "chrome", chrome: true, wheels: "steel", tyre: 0.3` with
`"round"` or `"blocks"` lights; 90s tuner = `"bar"` lights, `wheels: "mesh"`, `camber: 2`, low
`tyre`; modern = `"slim"` lights, `bumper: "body"`, `wheels: "split"`, `exhaust: 2`. Draw hero
cars at `scale: 1.5` or more: lights, trim and wheels need the pixels.

## Your own body

A body is a side profile in car units: `u` runs nose (0) → tail (1), `z` is height from the
ground (0) to the roof (1). Pass an object; anything you leave out comes from the coupe.

```js
car("gt", { ...kit, paint: "abcdef", body: {
  len: 118, width: 66, height: 34,                      // px at scale 1: length, width, roof height
  belt: [[0, 0.42], [0.34, 0.6], [0.8, 0.66], [1, 0.6]],  // top of the body: nose, cowl, deck, tail
  roof: [[0.34, 0.6], [0.44, 1], [0.6, 1], [0.86, 0.66]], // A-pillar base, roof front, roof rear, C-pillar base
  axles: [0.18, 0.83], wheel: 9, sill: 0.3, bPillar: 0.64 } })
```

What gives a car its character, in order of effect: **roof line** (where the roof ends and how
steeply it drops: notchback, fastback, hatch, wagon), **hood and deck length** (cowl position in
`belt` and `roof[0]`), **ride height and wheel size** (`wheel`, `tyre`, `camber`), then nose
height (`belt[0]`). Real proportions to start from: wheel diameter ≈ ¼ of the height of a sports
car and ⅕ of a van; wheelbase ≈ 55–65% of the length; the beltline sits at about 60% of the
height; glass is never taller than the body below it on anything sporty.

## Making it that car

The kit gives the stance and the surfaces. Identity comes from a few hand-placed details: draw
them over the kit's sprite with `base`:

```js
sprite("s13_drift", { base: "s13" },
  rect(96, 24, 22, 2, "T"),            // front-mount intercooler slot
  px(60, 13, "Z"), px(61, 13, "Z"))    // sticker on the quarter glass
```

Build first, then find coordinates with `PXL ascii art.px.js s13`. Typical details: light shape
(round twin lamps, a full-width bar, pop-ups), grille or intake openings, stripes and two-tone
paint (`recolor` a band), bumper and skirt shape, roof rack, antenna, exhaust tips, livery.
Given a reference picture of the car, run `PXL ref` on it first and copy its palette and the
proportions you can measure (`--scale`, `--crop`, `--ascii`).

## Scenes with cars

- Ground the car: `reflect(roadY, { h: 22, squash: 0.75, shade: 2, fade: 0.3, skip: "<road and sky keys>", span: [x, w] })`
  for wet asphalt, or a `shade: true` layer with a flat ellipse for a dry-road shadow.
- Night: keep the background within 3–4 very dark shades so the car's highlights carry the image;
  add `glow` on the lamp keys.
- Motion: an `anim` with `spin: c.phase * 360` is not available inside `car()` (it defines a
  sprite); for rolling wheels draw `wheel(..., { angle })` over the kit's wheels in an anim, and
  move the background, not the car.
- Rain, snow, dust: a function with `c.rng(seed)` for fixed columns and `c.phase` for the fall;
  see `night_rain` in the example.

## wheel() on its own

`wheel(cx, cy, r, { tire, lip, spoke, gap, hub, barrel, ... })` draws any wheel: side-on
(`rx` omitted), turned (`rx: r * 0.7`), cambered (`tilt`), deep-dish (`dish`), with tread showing
(`depth`). Use it for bikes, trucks, karts, or to restyle a kit car's rims via `rim: { ... }`.
