// Derived views of built images: previews for eyes, ASCII for exact checks, sheet packing.
import { type Color, TRANSPARENT, darken, pack, toOklab } from "./color.ts";
import { Img } from "./image.ts";
import type { Palette } from "./palette.ts";

const LIGHT = pack(0xe4, 0xe4, 0xe4), DARK = pack(0xc8, 0xc8, 0xc8);

/** Auto preview scale: longest side ~768px, clamped to 1..16. */
export function previewScale(img: Img, max = 768): number {
  return Math.max(1, Math.min(16, Math.floor(max / Math.max(img.w, img.h))));
}

/**
 * Upscaled preview: checkerboard behind transparency (one check per source pixel) and,
 * at scale >= 6, a pixel grid with every 8th line darker for reading coordinates.
 */
export function preview(img: Img, scale = previewScale(img)): Img {
  const s = scale;
  const o = new Img(img.w * s, img.h * s);
  for (let y = 0; y < o.h; y++) {
    const sy = Math.floor(y / s);
    for (let x = 0; x < o.w; x++) {
      const sx = Math.floor(x / s);
      let c: Color = img.data[sy * img.w + sx];
      if (c === TRANSPARENT || (c & 255) === 0) c = (sx + sy) % 2 === 0 ? LIGHT : DARK;
      if (s >= 6 && (x % s === 0 || y % s === 0)) {
        const major = (x % s === 0 && sx % 8 === 0) || (y % s === 0 && sy % 8 === 0);
        c = darken(c, major ? 0.45 : 0.18);
      }
      o.data[y * o.w + x] = c;
    }
  }
  return o;
}

/** Text dump with x/y rulers; colors shown as palette keys ("." transparent, "?" unknown). */
export function ascii(img: Img, pal: Palette): string {
  const rev = pal.reverse();
  const tens = "    " + Array.from({ length: img.w }, (_, x) => (x % 10 === 0 ? String(Math.floor(x / 10) % 10) : " ")).join("");
  const ones = "    " + Array.from({ length: img.w }, (_, x) => String(x % 10)).join("");
  const lines = img.w > 10 ? [tens, ones] : [ones];
  for (let y = 0; y < img.h; y++) {
    let row = String(y).padStart(3) + " ";
    for (let x = 0; x < img.w; x++) {
      const c = img.data[y * img.w + x];
      row += c === TRANSPARENT ? "." : rev.get(c) ?? "?";
    }
    lines.push(row);
  }
  return lines.join("\n");
}

export interface SheetFrame {
  name: string;
  img: Img;
  x: number;
  y: number;
  /** Animation frames: duration in ms. */
  ms?: number;
}

/** A named run of animation frames in a sheet (Aseprite "frameTags"). */
export interface FrameTag {
  name: string;
  from: number;
  to: number;
}

/** Shelf packing: `cols` frames per row, `pad` px between them. */
export function packSheet(items: { name: string; img: Img; ms?: number }[], cols?: number, pad = 0): { sheet: Img; frames: SheetFrame[] } {
  if (!items.length) throw new Error("sheet is empty");
  const perRow = cols ?? Math.ceil(Math.sqrt(items.length));
  const frames: SheetFrame[] = [];
  let x = 0, y = 0, rowH = 0, W = 0;
  items.forEach((it, i) => {
    if (i > 0 && i % perRow === 0) { x = 0; y += rowH + pad; rowH = 0; }
    frames.push({ ...it, x, y });
    W = Math.max(W, x + it.img.w);
    x += it.img.w + pad;
    rowH = Math.max(rowH, it.img.h);
  });
  const sheet = new Img(W, y + rowH);
  for (const f of frames) sheet.blit(f.img, f.x, f.y);
  return { sheet, frames };
}

/**
 * TexturePacker "hash" JSON (read by Phaser, Godot importers, etc.). Animation frames add a
 * `duration` (ms) and `meta.frameTags`, as Aseprite exports them.
 */
export function sheetJson(image: string, sheet: Img, frames: SheetFrame[], tags: FrameTag[] = []): string {
  const out: Record<string, unknown> = {};
  for (const f of frames) {
    const { w, h } = f.img;
    out[f.name] = {
      frame: { x: f.x, y: f.y, w, h }, rotated: false, trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w, h }, sourceSize: { w, h },
      ...(f.ms !== undefined ? { duration: f.ms } : {}),
    };
  }
  const meta: Record<string, unknown> = { app: "pxl", image, format: "RGBA8888", size: { w: sheet.w, h: sheet.h }, scale: "1" };
  if (tags.length) meta.frameTags = tags.map((t) => ({ ...t, direction: "forward" }));
  return JSON.stringify({ frames: out, meta }, null, 1) + "\n";
}

/**
 * Review sheet for judging a sprite the way it will be seen, without the editing grid:
 * the art on a dark and a light backdrop, its values (grayscale), its silhouette, then
 * true-size 1x / 2x copies and the colors it uses (most used first).
 */
export function review(img: Img, scale = Math.max(1, Math.min(10, Math.floor(224 / Math.max(img.w, img.h))))): Img {
  const big = img.scale(scale), pad = 8;
  const backs = [pack(0x24, 0x22, 0x2e), pack(0xe9, 0xe4, 0xd8), pack(0x80, 0x80, 0x80), pack(0xf4, 0xf4, 0xf4)];
  const grey = new Img(big.w, big.h), sil = new Img(big.w, big.h);
  for (let i = 0; i < big.data.length; i++) {
    const c = big.data[i];
    if (c === TRANSPARENT) continue;
    const v = Math.round(toOklab(c)[0] * 255);
    grey.data[i] = pack(v, v, v);
    sil.data[i] = pack(0x18, 0x18, 0x20);
  }
  const panels = [big, big, grey, sil];
  const count = new Map<Color, number>();
  for (const c of img.data) if (c !== TRANSPARENT) count.set(c, (count.get(c) ?? 0) + 1);
  const cols = [...count.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]).slice(0, 48);
  const sw = 12, stripH = Math.max(img.h * 2, sw) + pad;
  const W = pad + panels.length * (big.w + pad), H = pad + big.h + pad + stripH + pad;
  const o = new Img(Math.max(W, pad * 2 + img.w * 3 + pad * 2 + cols.length * sw), H).fill(pack(0x50, 0x50, 0x58));
  panels.forEach((p, k) => {
    const x0 = pad + k * (big.w + pad);
    for (let y = 0; y < big.h; y++) for (let x = 0; x < big.w; x++) o.set(x0 + x, pad + y, backs[k]);
    o.blit(p, x0, pad);
  });
  const y1 = pad + big.h + pad;
  o.blit(img, pad, y1);
  o.blit(img.scale(2), pad + img.w + pad, y1);
  cols.forEach((c, k) => {
    const x0 = pad + img.w * 3 + pad * 2 + k * sw;
    for (let y = 0; y < sw; y++) for (let x = 0; x < sw; x++) o.set(x0 + x, y1 + y, c);
  });
  return o;
}

/** Art next to a reference, each at a whole-number scale of similar height, on dark and light backdrops. */
export function versus(art: Img, ref: Img, target = 224): Img {
  const sc = (i: Img) => Math.max(1, Math.round(target / Math.max(i.w, i.h)));
  const a = art.scale(sc(art)), r = ref.scale(sc(ref)), pad = 8;
  const backs = [pack(0x24, 0x22, 0x2e), pack(0xe9, 0xe4, 0xd8)];
  const rowH = Math.max(a.h, r.h), W = pad * 3 + a.w + r.w, H = pad + backs.length * (rowH + pad);
  const o = new Img(W, H).fill(pack(0x50, 0x50, 0x58));
  backs.forEach((bk, k) => {
    const y0 = pad + k * (rowH + pad);
    for (const [im, x0] of [[a, pad], [r, pad * 2 + a.w]] as [Img, number][]) {
      for (let y = 0; y < rowH; y++) for (let x = 0; x < im.w; x++) o.set(x0 + x, y0 + y, bk);
      o.blit(im, x0, y0 + Math.floor((rowH - im.h) / 2));
    }
  });
  return o;
}
