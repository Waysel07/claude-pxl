// Form shading: gives flat shapes volume without leaving the palette. The masked pixels are read
// as one rounded (or bevelled) solid, lit from a direction, and each pixel steps lighter or darker
// along its own ramp in clean bands: cel shading the way a pixel artist blocks it in.
import { type Color, TRANSPARENT } from "./color.ts";
import { PxError } from "./errors.ts";
import { Img } from "./image.ts";
import type { FormOpts } from "./model.ts";
import { heightField } from "./normals.ts";
import type { Palette } from "./palette.ts";
import { bayer } from "./util.ts";

const DIRS: Record<string, [number, number]> = {
  tl: [-1, -1], t: [0, -1], tr: [1, -1], l: [-1, 0], r: [1, 0], bl: [-1, 1], b: [0, 1], br: [1, 1],
};

/** Shade `mask` pixels of `img` in place. */
export function applyForm(img: Img, mask0: Uint8Array, pal: Palette, o: FormOpts = {}): void {
  // bleed: the form carries on past the canvas border, so the border is not a shaded edge.
  // Done by working on a copy padded with the border pixels repeated outward.
  const P = o.bleed ? Math.min(64, Math.max(img.w, img.h)) : 0;
  const w = img.w + 2 * P, h = img.h + 2 * P, n = w * h;
  let mask = mask0;
  if (P) {
    mask = new Uint8Array(n);
    for (let y = 0; y < h; y++) {
      const sy = Math.min(img.h - 1, Math.max(0, y - P));
      for (let x = 0; x < w; x++) mask[y * w + x] = mask0[sy * img.w + Math.min(img.w - 1, Math.max(0, x - P))];
    }
  }
  const from = typeof o.from === "string" ? DIRS[o.from] : o.from ?? DIRS.tl;
  if (!Array.isArray(from) || from.length !== 2 || !(Math.hypot(from[0], from[1]) > 0))
    throw new PxError(`form from must be one of ${Object.keys(DIRS).join(" ")} or [dx, dy], got ${JSON.stringify(o.from)}`);
  const hi = Math.max(0, Math.floor(o.hi ?? 1)), lo = Math.max(0, Math.floor(o.lo ?? 1));
  const shape = o.shape ?? "dome";
  if (shape !== "dome" && shape !== "bevel") throw new PxError(`form shape must be "dome" or "bevel", got '${shape}'`);
  const depth = o.depth ?? 1, bias = o.bias ?? 0, soft = o.soft ?? 0;

  const ht = heightField(new Img(w, h), mask, shape, o.w ?? 2);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h || !mask[y * w + x] ? 0 : ht[y * w + x]);

  // The light leans toward the viewer, so the highlight sits inside the form instead of on its
  // rim, and surfaces facing the viewer keep the base color.
  const fl = Math.hypot(from[0], from[1]), ll = Math.hypot(1, 1.3);
  const lx = from[0] / fl / ll, ly = from[1] / fl / ll, lz = 1.3 / ll;

  // How much each pixel faces the light (1 = straight at it, < 0 = turned away).
  let f = new Float32Array(n);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      const gx = ((at(x + 1, y) - at(x - 1, y)) / 2) * depth, gy = ((at(x, y + 1) - at(x, y - 1)) / 2) * depth;
      // Surface normal is (-gx, -gy, 1); the light vector points from the surface to the light.
      f[i] = (-gx * lx - gy * ly + lz) / Math.hypot(gx, gy, 1);
    }
  // Smooth inside the mask: a distance field has ridges, and band edges should be clean curves.
  for (let pass = 0; pass < (shape === "dome" ? 2 : 0); pass++) {
    const nf = new Float32Array(n);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!mask[i]) continue;
        let s = f[i] * 2, c = 2;
        for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w])
          if (j >= 0 && j < n && mask[j]) { s += f[j]; c++; }
        nf[i] = s / c;
      }
    f = nf;
  }

  // Band edges, relative to a surface facing the viewer (f = lz), which keeps the base color.
  const hiAt = (k: number) => lz + (1 - lz) * (0.3 + (0.6 * (k - 1)) / Math.max(1, hi)) - bias * 0.2;
  const loAt = (k: number) => lz - 0.3 - (0.75 * (k - 1)) / Math.max(1, lo) - bias * 0.2;
  const delta = new Int8Array(n);
  for (let i = 0; i < n; i++) {
    if (!mask[i]) continue;
    const x = i % w, y = (i - x) / w;
    const v = f[i] + (soft ? (bayer(x - P, y - P) - 0.5) * 0.16 * soft : 0);
    let d = 0;
    for (let k = 1; k <= hi && v >= hiAt(k); k++) d = k;
    for (let k = 1; k <= lo && v <= loAt(k); k++) d = -k;
    delta[i] = d;
  }

  // Tidy the bands: a pixel that disagrees with all its neighbours takes their majority.
  if (!soft)
    for (let pass = 0; pass < 2; pass++)
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (!mask[i]) continue;
          const nb: number[] = [];
          for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (j >= 0 && j < n && mask[j]) nb.push(delta[j]);
          if (!nb.length || nb.includes(delta[i])) continue;
          nb.sort((a, b) => nb.filter((v) => v === b).length - nb.filter((v) => v === a).length);
          delta[i] = nb[0];
        }

  const up = hi ? pal.stepMap(1) : undefined, down = lo ? pal.stepMap(-1) : undefined;
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      const i = y * img.w + x, d = delta[(y + P) * w + x + P];
      let c: Color = img.data[i];
      if (!mask0[i] || c === TRANSPARENT || !d) continue;
      const m = d > 0 ? up! : down!;
      for (let k = Math.abs(d); k > 0; k--) c = m.get(c) ?? c;
      img.data[i] = c;
    }
}
