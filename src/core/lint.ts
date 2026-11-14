// Craft hints: cheap checks for the things that make pixel art read as noisy or flat. They are
// suggestions printed next to a build, never errors: the artist (or agent) decides.
import { type Color, TRANSPARENT, deltaE, toOklch } from "./color.ts";
import type { Img } from "./image.ts";
import type { Palette } from "./palette.ts";

/** Hints for one built sprite. Images that left the palette (lighting, colour glow) are skipped. */
export function lintImage(img: Img, pal: Palette): string[] {
  const { w, h, data } = img, out: string[] = [];
  const rev = pal.reverse();
  const count = new Map<Color, number>();
  let opaque = 0;
  for (const c of data) {
    if (c === TRANSPARENT) continue;
    opaque++;
    count.set(c, (count.get(c) ?? 0) + 1);
  }
  if (!opaque || count.size > 48) return out;
  const name = (c: Color) => rev.get(c) ?? "#";

  // Stray pixels: a pixel with no same-colored neighbour is noise unless it's a deliberate glint.
  const stray: string[] = [];
  let strays = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = data[y * w + x];
      if (c === TRANSPARENT) continue;
      let alone = true;
      for (let dy = -1; dy <= 1 && alone; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if ((dx || dy) && img.get(x + dx, y + dy) === c) { alone = false; break; }
      if (alone) { strays++; if (stray.length < 6) stray.push(`${x},${y}`); }
    }
  if (strays >= Math.max(6, Math.ceil(opaque * 0.03)))
    out.push(`${strays} stray single pixels (${stray.join(" ")}${strays > stray.length ? " …" : ""}): merge them into clusters or remove them`);

  // Colors too close to tell apart only add noise.
  const used = [...count.keys()];
  const twins: string[] = [];
  for (let i = 0; i < used.length; i++)
    for (let j = i + 1; j < used.length; j++)
      if (deltaE(used[i], used[j]) < 0.03 && twins.length < 3) twins.push(`${name(used[i])}/${name(used[j])}`);
  if (twins.length) out.push(`colors ${twins.join(", ")} are nearly identical: use one, or push them apart`);
  if (used.length > 20 && opaque < 3000) out.push(`${used.length} colors: fewer, clearer shades usually read better (2-4 per material)`);

  // A big sprite where one ramp color fills most of the shape, with none of its shades used.
  if (opaque >= 150 && pal.ramps.length) {
    for (const r of pal.ramps) {
      const cols = [...r].map((k) => pal.keys.get(k)!);
      const present = cols.filter((c) => count.has(c));
      // The darkest key is usually the shared outline color, not a material.
      if (present.length !== 1 || cols.length < 2 || present[0] === cols[0]) continue;
      const n = count.get(present[0])!;
      if (n >= opaque * 0.35 && n >= 100) {
        out.push(`'${name(present[0])}' is flat over ${n}px: give it volume (form(), or shade()/light() regions)`);
        break;
      }
    }
  }
  return out;
}

/** Hints about the palette's ramps (once per file). */
export function lintPalette(pal: Palette): string[] {
  const out: string[] = [];
  for (const r of pal.ramps) {
    const ks = [...r], lch = ks.map((k) => toOklch(pal.keys.get(k)!));
    for (let i = 1; i < ks.length; i++) {
      const d = lch[i][0] - lch[i - 1][0];
      if (d < -0.01) { out.push(`ramp "${r}": '${ks[i]}' is darker than '${ks[i - 1]}' (ramps go dark -> light)`); break; }
      if (d < 0.045) { out.push(`ramp "${r}": '${ks[i - 1]}' and '${ks[i]}' are too close in lightness to read as two shades`); break; }
    }
    const chroma = lch.filter((c) => c[1] > 0.04);
    if (chroma.length >= 3) {
      let span = 0;
      for (const a of chroma) for (const b of chroma) span = Math.max(span, Math.abs(((a[2] - b[2] + 540) % 360) - 180));
      if (span < 5) out.push(`ramp "${r}" has no hue shift (flat, plastic shading): ramp("${r}", "<mid color>") builds a shifted one`);
    }
  }
  return out;
}
