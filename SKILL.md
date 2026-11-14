---
name: pxl-pixel-art
description: Create pixel art (game sprites, characters, items, tiles, tilesets, icons, scenes, sprite sheets) with pxl, a compact JavaScript DSL that renders PNGs and lets the user watch the painting live in a browser. Use when asked to draw, design or iterate on pixel art or game assets.
---

# pxl: pixel art as code

You write a small `.px.js` file; pxl renders PNGs and upscaled previews you can look at. The DSL
is built to avoid writing pixels twice: mirroring, auto-outline, palette-swap variants, reusable
parts, primitives, brushes and tilemaps. Needs Node ≥ 22.18. No install step.

`PXL` below means `node <this skill's directory>/bin/pxl.js`.

## Workflow

1. Write `art.px.js` (start from the template below; examples in `examples/`).
2. Build only what you're working on: `PXL build art.px.js --only slime,heart`
3. **Look at it**: read `out/_preview/<name>.png` (upscaled, checkerboard = transparent, grid every
   pixel, darker every 8). For exact pixel fixes use `PXL ascii art.px.js <name>` (keys + x/y rulers);
   it's cheaper than an image.
   The build also prints `hint:` lines (stray pixels, flat unshaded areas, weak ramps): act on them.
4. Fix with small edits (a `grid(x, y, ...)` patch, one op) and rebuild. Repeat.
   Given a reference picture to imitate: see "Drawing in the style of a reference picture" first.
5. **Before calling a sprite done**: `PXL review art.px.js <name>` and read
   `out/_preview/<name>.review.png`. It shows the art without the grid on dark and light
   backdrops, in grayscale, as a silhouette and at true 1×/2× size: judge it there, not in the
   gridded preview.
6. If the user wants to watch: start `PXL serve art.px.js` in the background and give them the URL.
   It rebuilds on every save and replays the edited asset's painting steps; it also writes the same
   `out/` files, so keep reading previews as usual.

Errors name the file:line:col, the asset/layer/op path, and suggest fixes ("did you mean 'r'?").
One broken asset doesn't stop the others from building.

## Template

```js
pal({ k: "#1b1630", g: "#8ccf63", G: "#4c8a44", t: "#2a5560", w: "#fff6e0", r: "#e2585e", R: "#a63a4c" })
ramps("ktGg", "kRr")                   // hand-picked ramps, dark -> light: drive shade()/light()
ramp("12345", "#4a86d8")               // or: 5 hue-shifted shades from one color; "3" (middle) is that color

// Symmetric: write the left half, mirror it, outline it.
sprite("slime", { mx: true, outline: "k" }, `
  ....ggg
  ..ggGGg
  .ggGwGg
  gggkwgg
  gggkkgg
  tgggggg
  .tttttt`)
sprite("slime_red", { base: "slime", swap: { g: "r", G: "R" } })   // variant: 1 line

// Flat shape -> volume -> tinted outline: the default recipe for anything rounded.
sprite("orb", { w: 20, h: 20, outline: "k", selout: true }, circ(10, 10, 9, "3"), form({ lo: 2 }))
sprite("fish", { w: 30, h: 16, outline: "k", selout: true },
  blob([22, 8, 29, 2, 27, 8, 29, 14], "2"), blob([1, 8, 6, 3, 15, 1, 22, 5, 25, 8, 22, 12, 15, 15, 6, 13], "3"),
  form({ lo: 2 }), rect(5, 6, 2, 2, "k"), curve([10, 4, 12, 8, 10, 12], "2"))

sprite("_eye", "wk\nkk")                                            // "_" = part, not exported
sprite("chest", { w: 16, h: 12, outline: "k" },
  rect(0, 3, 16, 9, "R"), rect(0, 0, 16, 4, "r"), stamp("_eye", 7, 4), shade([0, 9, 16, 3]))

scene("meadow", { w: 160, h: 96, bg: "w" },
  layer("ground", { y: 64 }, rect(0, 0, 160, 32, "G"), noise(0, 0, 160, 32, "g", 0.1, 3)),
  layer("props", stamp("slime", 40, 54), stamp("slime_red", 70, 54, { flip: "x" })),
  layer("shadow", { shade: true }, poly([38, 64, 88, 64, 92, 67, 34, 67], "k")))   // cast shadow

sheet("chars", ["slime*", "chest"], { pad: 1 })
```

## Essentials

- **Colors**: one-char keys from `pal`, `"#hex"`, `"."` skip, `"_"` erase. Default palette is pico8
  (`0-f`); `use("sweetie16" | "db16" | "endesga32" | "gray8")` for others.
- **Items run in order**: grid strings (drawn at 0,0), ops, `(c) => { c.rect(...) }` functions,
  `layer(...)`s. Then mirror → swap → flip → rot → outline (grows 1px each side) → crop.
- **Shapes**: `px rect box line(…, width) hline vline circ ring ellipse poly fill wire text`;
  organic: `blob(points, c)` (smooth filled shape) and `curve(points, c, width?)` (pixel-perfect stroke).
- **Volume**: `ramp("dDmlL", "#hex")` makes a hue-shifted ramp (the middle key is your color; keys
  must be new). `form({ from: "tl", lo: 2 })` then shades everything drawn so far as rounded forms
  along the ramps, in clean bands (`shape: "bevel"` for boxes, `on: "abc"` per material; as a
  sprite option `form: true` it runs after `mx`). `selout: true` next to `outline` tints the
  outline from the colors it touches.
- **Tone**: `dither grad noise`, `shade/light(region, steps, density)`, `recolor`, and
  `shade:`/`light:` layers for cast shadows and glows. Regions: `[cx,cy,r]`, `[x,y,w,h]`,
  polygon, or a function. `clip(region, ...items)` restricts any items (half shapes, slopes).
- **Reuse**: `stamp tile pattern tilemap scatter`. Names can be groups or globs
  (`group("rocks", ["rock_a", "rock_a", "rock_b"])`, `"tree_*"`). Each placement picks randomly but
  reproducibly. Use `rflip`, `rswap`, `seed`, and `reseed: true` for per-copy variety.
- **Brushes**: `scatter("_leaf*", x, y, w, h, 30, { on: "g", clip: true, rflip: "xy" })` paints
  texture with tiny part sprites, only on the given colors.
- **Animation**: `anim("cat", { outline: "k", fps: 10 }, grid, frame(), frame(grid(23, 0, "_K")))`:
  frames are patches over shared items or a `base`; or `frames: 6` + `(c) => ... c.phase ...` for
  procedural loops. Stamping an anim animates the scene (`rdelay: true` desyncs copies, `frame: n`
  freezes one). Check `_preview/<name>.png` (all frames side by side) or `pxl ascii` per frame.
- **Glow**: `glow("zgQ", { r: 6, strength: 0.5 })` directly in a sprite/scene body gives every pixel
  of those keys a halo (flames, potions, moons, neon); `ramp: 2` instead stays in the palette.
  Give glowing things their own keys so nothing else lights up, or limit it with `where`.

Full API with every option: [reference.md](reference.md).
Dynamic lighting (lamps, light blocked by solid layers, sky light, Terraria-style): read
[lighting.md](lighting.md) only when a scene needs lights.

## Drawing in the style of a reference picture

When the user shows a picture and wants art "like this", study it before drawing:

1. `PXL ref picture.png` (PNG only; any upscale). It prints the picture's native pixel size, a
   ready-to-paste `pal({...})` + `ramps(...)` block with its colors grouped into ramps, and a style
   brief: outline kind, light direction, dithering or clean bands, hue shift, contrast, subject size.
2. Read `out/_ref/<name>.preview.png` to see it yourself: proportions, how big heads/eyes are, how
   much detail per area, how shapes are simplified. The brief measures; it does not see taste.
   `--ascii` prints the exact pixels as keys when you need to study a detail.
3. Paste the palette block and follow the brief literally: same outline rule, same light, same
   number of shades, similar size. Use only those keys; do not add `ramp()` colors of your own.
4. `PXL review art.px.js <name> --ref picture.png` writes `<name>.vs.png` (your art beside the
   reference) and prints one `ok` / `differs` line per trait (palette, outline, light, dithering,
   contrast, size). Fix every `differs` unless the user asked for that difference, then look at
   the side-by-side: it should pass as part of the same set.

Mimic the style, not the picture: new subject, new shapes. Don't trace or reproduce the reference.
Several references of one style: run `ref` on each and take the palette from the cleanest.

## Craft: what makes it read as good pixel art

Work in this order; each step is cheap to check in the preview before the next.

1. **Silhouette first.** Block the whole subject in one flat color and look: it must be recognizable
   as a black shape. Exaggerate what identifies it (ears, tail, hat, weapon); give limbs and props
   gaps of at least 1px of background so they don't merge. Organic bodies: `blob`/`curve`, not
   straight-edged `poly`. Pick the size by what must be readable: 16px icons hold one idea, a
   face needs ~24px, a character with an expression 32px+. Don't draw big and hope.
2. **Few colors, real ramps.** 3–5 shades per material, 8–16 colors per sprite, shared across the
   set. Build each material with `ramp("dDmlL", "#hex")` so shadows shift toward blue/purple and highlights toward
   yellow; never darken by adding black or lighten by adding white. Neighbouring shades must be
   clearly different (if you can't see the step at 1x, drop a shade).
3. **One light, top-left**, the same for every asset in a set. Shade forms, not edges: shadow sits
   on the side away from the light and under overhangs (chin, brim, belly), highlight is a small
   cluster inside the lit side. `form()` does this for round forms; flat faces get one shade each.
   Never ring a shape with darker bands that follow its outline ("pillow shading").
4. **Clusters, not specks.** Every pixel belongs to a group of its color big enough to read (2+
   px). Single stray pixels are noise; the exceptions are deliberate: eye glints, stars, rivets.
   No 1px checker/dither inside small sprites; dither only on large, smooth areas.
5. **Clean lines.** Curves step in runs that grow or shrink steadily (5,3,2,1,1,2,3,5), never
   3,1,4,1. Lines are 1px with no doubled corners (`curve` guarantees both).
6. **Outline with intent.** Dark outline for game sprites that must pop on any background;
   `selout: true` tints it by the neighbouring color so it's softer on the lit side. Inside the sprite,
   separate parts with a darker shade of their own color, not black lines.
7. **Check at 1x.** `PXL review art.px.js <name>` shows the sprite at game size on dark and light backgrounds and as a
   silhouette. If the idea doesn't read there, fix shapes and contrast, not details.

Animation: move the silhouette, not just interior pixels; 2–4 frames of squash/bob beat 8 frames
of jitter; keep feet/baselines fixed unless the motion says otherwise.

Sprite recipe (see `examples/showcase.px.js`): `ramp` per material → flat silhouettes with `blob`,
`circ`, `rect` in each ramp's base key → one `form({ lo: 2 })` for the whole figure (or
`form({ on: "abc" })` per part) → small details on top (eyes, glints, seams) → `outline: "k",
selout: true`. Whites and creams need their own short ramp or they stay flat. Every ramp needs
fresh keys (reusing one, such as the outline key, is an error).

## Habits that save tokens and give better art

- Write half of anything symmetric (`mx`) and let `outline` draw outlines. Never hand-draw either.
- Recolors are `base` + `swap`; repeated details are `_parts` + `stamp`; families are a `group` or a
  loop: `for (let i = 1; i <= 3; i++) sprite("tree_" + i, ...)`.
- Large areas: primitives, `grad`, `noise`, `pattern`, `tilemap`. Never big hand grids.
- Organic texture (leaves, grass, stones, rust): 2–3 tiny brush parts + `scatter` with `on`/`clip`.
- **No filler noise.** Don't sprinkle `noise` speckle over walls, floors or plaster to make them
  "less flat": it reads as random dots, not material. Every mark on a surface needs a cause you
  could name, and it should sit where that cause would put it:
  - built structure: siding/plank lines, brick or stone courses with offset joints, tile seams;
  - weathering: rain-stain streaks under ledges and sills, splash-back grime fading up from the
    ground, rust runs under metal brackets, paint flaking off boards (following the board lines);
  - clutter that tells the story: posters, pipes, vents, cracks from a corner.
  Flat color is fine; a clean wall beats a dotted one. `noise` is OK only where the material itself
  is granular (gravel, sand, asphalt, tar roofs, rough stone), and keep it sparse. On faces drawn
  at an angle (3/4 views), make the marks follow the face's slant.
- Shading: `ramp()` + `form()` first; then `light`/`shade` regions for what form can't know (cast
  shadows, under-brim darkness); stack a `density: 0.5` pass for soft edges on big areas only.
  Use `shade: true` layers with a `poly` for cast shadows across many objects.
- Use mnemonic keys (`g`/`G` light/dark green). Keep 2–4 shades per material for a clean pixel-art look.
- Build with `--only` while iterating; a full build also writes every preview.
