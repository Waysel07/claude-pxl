# pxl reference

Art files are plain JavaScript (or TypeScript) evaluated with the DSL as globals. Nothing draws
at definition time: `sprite`, `scene`, ... record definitions; everything renders at build time,
so assets may reference each other in any order.

Coordinates are 0-based from the top-left. Sizes are `w, h`. Colors are a single palette key
(`"k"`), a hex string (`"#1b1630"`, `"#rgb"`, `"#rrggbbaa"`), `"."` (skip: leave the pixel) or
`"_"` (erase to transparent).

## Palette

| Call | Effect |
|---|---|
| `use("pico8")` | Built-in palette: `pico8` (default), `sweetie16`, `db16`, `endesga32`, `gray8`. Keys are index chars `0-9a-z`. |
| `use(["#000", "#fff", ...])` | Custom list, keys `0-9a-zA-Z` by index. |
| `pal({ k: "#1b1630", g: 11, h: "k" })` | Add/override single-char keys: hex, palette index, or copy of another key. `. _ # space` are reserved. |
| `ramp("dDgGh", "#5aa64b", { at?, shift = 1, contrast = 1 })` | **Builds a hue-shifted ramp for you**: defines these keys as shades around the color (dark → light; **the color you give is the middle key** (index `floor(n/2)`), or index `at` — use `at` near the top for pale colors like white/cream and at 0–1 for near-blacks). Keys must be new and registers the ramp. Shadows drift toward blue/violet, highlights toward yellow, with even lightness steps. `shift: 0` = plain darker/lighter, `contrast` spreads the steps. Returns the hex list. |
| `ramps("kDdu", "kTtq")` | Light ramps, dark → light. `shade` steps a color left, `light` steps right. When a key is in several ramps, the first ramp wins. |

Every asset keeps the palette that was active where it was defined, so files with different
palettes can be included and stamped together.

## Assets

```js
sprite(name, opts?, ...items)
scene(name, { w, h, bg?, ... }, ...items)
layer(name, layerOpts?, ...items)      // only as an item of a sprite or scene
group(name, ["a", "b", "rock_*", ...])  // random pick per placement; repeat a name to weight it
sheet(name, ["slime*", "heart", groupName], { cols?, pad? })
include("other.px.js")                  // path relative to the current file
```

Names starting with `_` are **parts**: usable everywhere but not exported, and not matched by
sheet globs.

### Items (run in order)

- **Grid string**: one char per pixel, drawn at 0,0. Rows are trimmed, blank edge rows dropped,
  short rows padded. `.`/space keep, `_` erases. Use template literals for multi-line grids.
- **Op**: `rect(...)`, `stamp(...)`, ... (below).
- **Function**: `(c) => { ... }` gets the canvas; call ops as methods (`c.rect(...)`), plus
  `c.w`, `c.h`, `c.is(x, y, "ab")` (pixel is one of these keys; `"*"` opaque, `"."` transparent),
  `c.key(x, y)`, `c.get(x, y)` (packed color), `c.rng(seed)` (deterministic, follows reseed).
- **Layer**: drawn on its own image, then blended in at its place in the list.

### Sprite / scene options

| Option | Meaning |
|---|---|
| `w, h` | Canvas size. Sprites infer it from grid strings (including grids inside layers) when omitted; scenes require it. |
| `base: "name"` | Start from a copy of another asset (variant). Overlay coordinates are the base's final coordinates (outline included). |
| `bg` | Scene background color. |
| `mx: true` | Mirror the left half onto the right after all items. Inferred width doubles (write half a row). `mx: "c"`: odd width, shared center column. `my` likewise vertically. |
| `swap: { g: "r" }` | Recolor after drawing. |
| `flip: "x" \| "y" \| "xy"`, `rot: 90 \| 180 \| 270` | Transform. |
| `form: true \| { ... }` | Form shading (see `form` under Texture and tone) over the whole sprite, after mirroring/flipping, so an `mx` sprite is still lit from one side. |
| `outline: "k"` | 1px outline around opaque pixels; **grows the canvas 1px on every side**. `outline8` also fills diagonals. |
| `selout: true \| n` | Selective outline (needs `outline`): each outline pixel takes the color it touches, stepped `n` shades down its ramp (true = 2), never lighter than the ramp's second-darkest. Colors off the ramps or too dark to step keep the plain outline color. Softer, more finished than one flat dark line. |
| `crop: true` | Trim to opaque bounds. |
| `layers: true` | Also export each layer as `out/<sprites\|scenes>/<name>/<layer>.png`. |

Post-processing order: mirror → swap → flip → rot → form → outline (+ selout) → crop.

### Layer options

| Option | Meaning |
|---|---|
| `x, y` | Offset of every op in the layer. |
| `hidden: true` | Skip when compositing (still exported with `layers: true`). |
| `shade: true \| n \| { m: "M" }` | Blend layer: not drawn. Wherever it is opaque, what's below steps darker along the ramps (`n` steps, or the given map). |
| `light: ...` | Same, lighter. Cast shadows, light spills, glows. |
| `density: 0..1` | Ordered-dither the layer (soft edges). Stack a low-density big shape and a full small one for falloff. |

## Ops

`?` marks optional arguments.

### Shapes
| Op | Notes |
|---|---|
| `px(x, y, c)` | |
| `rect(x, y, w, h, c)` · `box(x, y, w, h, c)` | filled · 1px border |
| `line(x0, y0, x1, y1, c, width?)` | width > 1 = round brush (tubes, poles, thick strokes) |
| `hline(x, y, len, c)` · `vline(x, y, len, c)` | |
| `circ(cx, cy, r, c)` · `ring(cx, cy, r, c)` | pixel-art circles; ring is a clean 1px border |
| `ellipse(cx, cy, rx, ry, c, ring?)` | |
| `poly([x0, y0, x1, y1, ...], c)` | filled; vertices on pixel corners (`[0,0, 4,0, 4,4, 0,4]` = `rect(0,0,4,4)`) |
| `curve([x0, y0, x1, y1, ...], c, width?)` | smooth pixel-perfect stroke through the points (no doubled corner pixels): tails, tentacles, smiles, ropes. Repeat a point for a sharp corner |
| `blob([x0, y0, x1, y1, ...], c)` | filled closed smooth shape through the points: bodies, heads, leaves, clouds, puddles. Like `poly` with rounded corners; repeat a point for a sharp one |
| `fill(x, y, c)` | 4-connected flood fill |
| `wire(x0, y0, x1, y1, sag, c, { hang?, every = 6, start?, ...placement })` | sagging cable; `hang` stamps an asset/group under it every `every` px (string lights) |
| `text(x, y, "str", c, { scale = 1, gap = 1, lead = 1, align: "l"\|"c"\|"r", shadow? })` | built-in 3×5 font: A-Z 0-9 and common punctuation, `\n` for lines |

### Wheels and reflections
| Op | Notes |
|---|---|
| `wheel(cx, cy, r, { tire, lip, spoke?, gap?, barrel?, hub?, rx?, tilt?, depth?, wall?, lipW?, dish?, spokes = 5, spokeW?, angle? })` | car wheel: tire ring, rim lip, spokes over dark gaps, hub. `rx` < r turns it away (3/4 views), `tilt` = camber, `depth` = visible tread toward +x, `dish` = spoke face set back inside the rim (shows the `barrel`), `angle` in degrees spins it (animate with `c.phase * 360`). |
| `reflect(y, { h?, squash = 1, shade = 1, density = 1, fade?, ripple?, phase?, on?, skip?, span? })` | mirror what is above line `y` below it, stepped `shade` ramp steps darker: wet roads, water, polished floors. `fade` = density at the bottom, `skip` = keys that don't reflect (sky, road), `span: [x, w]` limits it, `ripple` px + `phase` animate it. |

`include("pxl:cars")` loads the built-in car kit (`car(name, { body, paint, glass, trim, metal, ... })`):
see [cars.md](cars.md).

### Texture and tone
| Op | Notes |
|---|---|
| `dither(x, y, w, h, c1, c2, density = 0.5)` | Bayer 4×4; c2 covers `density` |
| `grad(x, y, w, h, "abc", dir = "v", soft = 0.5)` | bands with dithered seams; `"h"` horizontal; soft 0 = hard bands |
| `noise(x, y, w, h, "ab", density = 0.1, seed = 1, on?)` | deterministic speckle; `on: "g"` only touches those keys (`"*"` any opaque) |
| `shade(where?, steps = 1, density = 1)` · `light(...)` | step colors along ramps inside a region |
| `recolor({ a: "b" }, where?, density = 1)` | swap colors inside a region |
| `form({ from = "tl", hi = 1, lo = 1, shape = "dome", on = "*", where, depth = 1, bias = 0, soft = 0, w = 2 })` | **volume shading, in palette**: see below |

**`form`** reads the pixels drawn so far (those of `on` keys, inside `where`) as solid forms lit from
`from` (`"tl" "t" "tr" "l" "r" "bl" "b" "br"` or `[dx, dy]`), and steps each pixel along its own
ramp in clean bands: up to `hi` shades lighter facing the light, up to `lo` darker on the far side
(`lo: 2` adds a core shadow). Draw flat base colors, then call it once:

```js
ramp("12345", "#5aa64b")
sprite("ball", { w: 24, h: 24, outline: "k", selout: true }, circ(12, 12, 11, "3"), form({ lo: 2 }))
```

- `shape: "dome"` rounds every connected blob like a ball; `"bevel"` keeps a flat top and slopes
  the edges over `w` px (crates, bricks, buttons, gems).
- Each connected blob of the mask is its own form. Shade parts separately by putting them in their
  own `layer`, by calling `form({ on: "..." })` per material, or by drawing a part after the call.
- `bias` −1..1 moves the bands toward shadow/light, `depth` scales the relief (wider bands),
  `soft` 0..1 dithers the band edges (default: crisp).
- In a sprite the canvas border counts as an edge of the form; in a scene it doesn't, so hills
  and ground that run off the picture shade only along their real silhouette (`bleed: true/false`
  overrides either way, e.g. `bleed: true` for seamless tiles).
- Colors that are in no ramp don't change. It needs ramps with room: a base color with shades on
  both sides (`ramp()` leaves room by default).

**Regions** (`where`, `clip`): `undefined` = everywhere, `[cx, cy, r]` circle, `[x, y, w, h]`
rect, `[x0, y0, x1, y1, x2, y2, ...]` polygon, or `(x, y) => boolean`.

### Placing assets
| Op | Notes |
|---|---|
| `stamp(name, x, y, opts?)` | |
| `tile(name, x, y, cols, rows, opts?)` | grid of copies (each cell picks separately for groups) |
| `pattern(name, x, y, w, h, opts?)` | fill an area with copies; edges cut to fit |
| `tilemap("gg\nd.", { map: { g: "grass", d: "dirt" }, size?, w?, h?, x?, y?, ...placement })` | character map; `.` empty |
| `scatter(name, x, y, w, h, count, { on?, clip?, below?, ...placement })` | brush: `count` picks centered at random points; `on` = center must land on these keys; `clip` = paint only onto them; `below` = masks read the composite under this layer |
| `clip(region, ...items)` | run items with drawing restricted to the region (half domes, roof slopes, masked textures) |

Any `name` may be a sprite, scene, group, or glob (`"tree_*"`). **Placement opts**: `flip`, `rot`,
`swap`, `rflip: "x"|"y"|"xy"` (random flips), `rswap: [{ g: "r" }, {}]` (random recolor; `{}` =
none), `seed`, `reseed: true | n` (rebuild the placed asset with its own random choices; `true`
derives it from the position, so `tile("house", 0, 0, 4, 1, { reseed: true })` gives four
different houses from one definition).

Randomness is seeded from the placement position + `seed`, so builds are reproducible and moving
one placement doesn't reshuffle the others. Change `seed` to reroll.

## Lighting

`lamp(x, y, { r, color, power })`, `lighting({ cell, sky, ambient, emit, ... })`, and the layer flags
`solid`, `wall`, `unlit`: see [lighting.md](lighting.md). The same file covers normal maps:
`bump("dome"|"bevel"|"luma", { w, depth, on, where })` and the numpad grid `normals(x, y, grid)`.

## Glow

`glow(keys, { where, r = 6, strength = 0.5, color, bands, ramp })` goes directly in a sprite or
scene body (like `lighting`) and works on everything drawn before it: every pixel whose color is
one of `keys` spills a halo onto the opaque pixels within `r`, falling off with distance. The
glowing pixels themselves are left as they are, and transparent pixels stay empty.

| Option | Meaning |
|---|---|
| `where` | Region: only pixels inside it glow (the halo may spread past it). |
| `r` | Halo radius in px. |
| `strength` | How strongly the halo brightens (screen blend in the glowing color; 0..1+). |
| `color` | One tint for the whole halo instead of each pixel's own color. |
| `bands` | Quantize the falloff into this many rings: crisp, pixel-art halos. |
| `ramp` | Palette mode: step neighbours up to `ramp` shades lighter along the ramps, dithering between steps. Stays in the palette; ignores `strength`/`color`. Use it before `lighting()`. |

Color mode leaves the palette (like lighting). Several `glow`s can stack, each with its own keys
and radius. After `lighting()`, pixels still glow by their palette key even though the light has
changed their colors.

## Animation

```js
anim(name, { fps = 8, frames, loop = true, base, w, h, outline, mx, ... }, ...items)
frame({ ms, hold }?, ...items)          // only inside an anim (top level or in its layers)
```

An anim is a sprite with frames. Its items run in order on every frame, except `frame(...)` items:
the k-th `frame()` only runs on frame k, so frames are **patches** over the shared items (or over
`base`). Post-processing (mirror, outline, ...) runs on each frame. A frame lasts `1000 / fps` ms,
or `ms`, or `hold` × that. `loop: false` plays once and holds the last frame.

```js
anim("candle", { outline: "k", fps: 5 }, `
  .l.
  lLl
  xxx`,
  frame(), frame(grid(0, 0, "l_.\n_Ll")), frame(grid(0, 0, "._l\nlL_")))   // "_" erases
anim("frog", { base: "frog_idle" }, frame({ ms: 2200 }), frame({ ms: 200 }, grid(1, 1, "ff")))
```

**Procedural**: without `frame()` items, `frames: n` sets the count and functions draw from
`c.frame` (0..n-1), `c.frames` and `c.phase` (`frame / frames`, 0..<1). Use `phase` with `sin`
for loops that wrap seamlessly:

```js
anim("fire", { w: 22, h: 23, frames: 6, fps: 10 }, (c) => {
  const k = c.phase * Math.PI * 2
  c.poly([2, 21, 10, 21 - Math.round(16 + Math.sin(k) * 2), 19, 21], "h")
})
```

**Placing anims animates the placer.** A sprite or scene that stamps (tiles, scatters, ...) an anim,
directly or through other assets, is animated too: it loops over the least common multiple of
what it contains (capped at 60s), sampled at their common step. Keep durations on a shared grid
(e.g. multiples of 100ms) so loops stay short. Placement options:

| Option | Meaning |
|---|---|
| `frame: n` | Freeze on frame n (the placer doesn't animate from it). |
| `delay: ms` | Start later, snapped to the anim's step: desync copies. |
| `rdelay: true` | Random start per placement (seeded, reproducible). |

**Output**: anims go to `anims/<name>.png` (horizontal strip), `anims/<name>.json` (per-frame
`duration` + `meta.frameTags`, Aseprite style: Phaser, Godot, ... read it) and `anims/<name>.gif`.
Animated sprites and scenes get `<name>.gif` next to their PNG (which shows frame 0). Previews:
`_preview/<name>.png` shows an anim's frames side by side; anything animated also gets
`_preview/<name>.gif`. Sheets expand anims into `name_0`, `name_1`, ... with durations and tags.
`pxl ascii` prints every frame of an anim. The live viewer loops animated assets after the
painting replay ends ("animate" toggle).

## CLI

```
node <pxl>/bin/pxl.js build <file> [--out DIR] [--only a,b] [--scale N] [--no-preview] [--no-hints]
node <pxl>/bin/pxl.js review <file> <name> [name...] [--scale N] [--ref image.png]
node <pxl>/bin/pxl.js ref <image.png> [--colors N] [--scale N] [--ascii] [--out DIR]
node <pxl>/bin/pxl.js serve <file> [--port 4321] [--out DIR | --no-out] [--no-preview]
node <pxl>/bin/pxl.js ascii <file> <name>
node <pxl>/bin/pxl.js list  <file>
```

`ref` studies a reference picture (PNG, any upscale): it detects the native pixel size, removes a
flat background, reduces busy images to `--colors` main colors (default 32), and prints a
`pal()`/`ramps()` block plus a style brief (outline, light, dithering, hue shift, contrast, size).
It writes `out/_ref/<name>.png` (native) and `<name>.preview.png`. `review --ref` adds
`_preview/<name>.vs.png` (art beside the reference) and `ok`/`differs` lines per trait.

Outputs go to `<file dir>/out`: `sprites/<n>.png`, `scenes/<n>.png`, `<sheet>.png` + `<sheet>.json`
(TexturePacker hash format: Phaser, Godot importers, ...), `_preview/<n>.png` (upscaled to
~768px, checkerboard behind transparency, pixel grid at scale ≥ 6 with every 8th line darker).

`build` prints craft **hints** under a sprite when it finds stray single pixels, colors too close to
tell apart, a large flat unshaded area, or ramps that are out of order, too close, or have no hue
shift. They are suggestions, not errors (`--no-hints` silences them).

`review` writes `_preview/<name>.review.png`: the asset without the grid on a dark and a light
backdrop, in grayscale (do the values separate?), as a silhouette (is the shape readable?), at
true 1× and 2× size, and its colors by use. It also prints the color counts and hints.

`serve` opens a live viewer that rebuilds on save, follows the asset you edited and replays its
painting steps (each top-level op, layer and post-processing step, with its file:line). It also
writes the same outputs as `build`.

## Library

```ts
import { loadProject, loadSource, writeOutputs, serve, ascii, preview } from "pxl-pixelart";
const p = loadProject("art.px.js");
const img = p.image("slime");          // Img { w, h, data: Uint32Array of 0xRRGGBBAA }
```

`pxl-pixelart/core` exports the platform-independent engine (no Node APIs).
