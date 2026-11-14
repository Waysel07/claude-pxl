// Animated GIF encoder (GIF89a, looping). One global palette for all frames; more than 256
// colors (lit scenes) are reduced by median cut. Fully transparent pixels become the
// transparent index. Identical consecutive frames are merged.
import { TRANSPARENT } from "../core/color.ts";
import { Img } from "../core/image.ts";

export interface GifFrame {
  img: Img;
  /** Duration in ms (GIF stores centiseconds; minimum 20ms). */
  ms: number;
}

export function encodeGif(frames: GifFrame[]): Buffer {
  if (!frames.length) throw new Error("gif needs at least one frame");
  const w = Math.max(...frames.map((f) => f.img.w)), h = Math.max(...frames.map((f) => f.img.h));
  const merged = mergeRepeats(frames);

  // Palette: every opaque color, reduced if needed; index 0 is transparent when any pixel is.
  const counts = new Map<number, number>();
  let transparent = false;
  for (const { img } of merged) {
    if (img.w < w || img.h < h) transparent = true;
    for (const c of img.data) {
      if (isClear(c)) { transparent = true; continue; }
      const rgb = c >>> 8;
      counts.set(rgb, (counts.get(rgb) ?? 0) + 1);
    }
  }
  const room = transparent ? 255 : 256;
  const pal = counts.size <= room ? [...counts.keys()] : medianCut(counts, room);
  const colors = (transparent ? [0] : []).concat(pal);
  const base = transparent ? 1 : 0;
  let bits = 1;
  while (1 << bits < colors.length) bits++;
  const exact = new Map<number, number>();
  pal.forEach((c, i) => exact.set(c, i + base));
  const indexOf = (rgb: number): number => {
    let i = exact.get(rgb);
    if (i === undefined) {
      i = nearest(pal, rgb) + base;
      exact.set(rgb, i);
    }
    return i;
  };

  const out: number[] = [];
  const u16 = (v: number) => out.push(v & 255, (v >> 8) & 255);
  out.push(...Buffer.from("GIF89a"));
  u16(w); u16(h);
  out.push(0x80 | 0x70 | (bits - 1), 0, 0);
  for (let i = 0; i < 1 << bits; i++) {
    const c = colors[i] ?? 0;
    out.push((c >> 16) & 255, (c >> 8) & 255, c & 255);
  }
  out.push(0x21, 0xff, 11, ...Buffer.from("NETSCAPE2.0"), 3, 1, 0, 0, 0);   // loop forever

  const minSize = Math.max(2, bits);
  for (const { img, ms } of merged) {
    const cs = Math.max(2, Math.round(ms / 10));
    // Restore to background between frames when anything is transparent, so frames don't pile up.
    out.push(0x21, 0xf9, 4, ((transparent ? 2 : 1) << 2) | (transparent ? 1 : 0));
    u16(cs);
    out.push(0, 0);
    out.push(0x2c);
    u16(0); u16(0); u16(w); u16(h);
    out.push(0);
    const idx = new Uint8Array(w * h);
    for (let y = 0; y < img.h; y++)
      for (let x = 0; x < img.w; x++) {
        const c = img.data[y * img.w + x];
        idx[y * w + x] = isClear(c) ? 0 : indexOf(c >>> 8);
      }
    out.push(minSize);
    const data = lzw(idx, minSize);
    for (let i = 0; i < data.length; i += 255) {
      const n = Math.min(255, data.length - i);
      out.push(n);
      for (let j = 0; j < n; j++) out.push(data[i + j]);
    }
    out.push(0);
  }
  out.push(0x3b);
  return Buffer.from(out);
}

function isClear(c: number): boolean {
  return c === TRANSPARENT || (c & 255) === 0;
}

function mergeRepeats(frames: GifFrame[]): GifFrame[] {
  const out: GifFrame[] = [];
  for (const f of frames) {
    const prev = out[out.length - 1];
    if (prev && same(prev.img, f.img)) prev.ms += f.ms;
    else out.push({ img: f.img, ms: f.ms });
  }
  return out;
}

function same(a: Img, b: Img): boolean {
  if (a.w !== b.w || a.h !== b.h) return false;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false;
  return true;
}

/** LZW with variable code size, clearing the table when it fills (4096 codes). */
function lzw(index: Uint8Array, minSize: number): number[] {
  const clear = 1 << minSize, eoi = clear + 1;
  let size = minSize + 1, next = eoi + 1;
  let table = new Map<number, number>();
  const out: number[] = [];
  let cur = 0, shift = 0;
  const emit = (code: number) => {
    cur |= code << shift;
    shift += size;
    while (shift >= 8) {
      out.push(cur & 255);
      cur >>>= 8;
      shift -= 8;
    }
  };
  emit(clear);
  let code = index[0];
  for (let i = 1; i < index.length; i++) {
    const k = index[i], key = (code << 8) | k, hit = table.get(key);
    if (hit !== undefined) {
      code = hit;
      continue;
    }
    emit(code);
    if (next === 4096) {
      emit(clear);
      table = new Map();
      size = minSize + 1;
      next = eoi + 1;
    } else {
      if (next >= 1 << size) size++;
      table.set(key, next++);
    }
    code = k;
  }
  emit(code);
  emit(eoi);
  if (shift > 0) out.push(cur & 255);
  return out;
}

/** Median cut over 0xRRGGBB colors weighted by count. */
function medianCut(counts: Map<number, number>, n: number): number[] {
  type Box = { cs: number[] };
  const ch = (c: number, k: number) => (c >> (16 - 8 * k)) & 255;
  const range = (b: Box) => {
    let best = 0, axis = 0;
    for (let k = 0; k < 3; k++) {
      let lo = 255, hi = 0;
      for (const c of b.cs) { const v = ch(c, k); if (v < lo) lo = v; if (v > hi) hi = v; }
      if (hi - lo > best) { best = hi - lo; axis = k; }
    }
    return { best, axis };
  };
  const boxes: Box[] = [{ cs: [...counts.keys()] }];
  while (boxes.length < n) {
    let pick = -1, score = 0, axis = 0;
    boxes.forEach((b, i) => {
      if (b.cs.length < 2) return;
      const r = range(b);
      let wsum = 0;
      for (const c of b.cs) wsum += counts.get(c)!;
      const s = r.best * Math.sqrt(wsum);
      if (s > score) { score = s; pick = i; axis = r.axis; }
    });
    if (pick < 0) break;
    const b = boxes[pick];
    b.cs.sort((p, q) => ch(p, axis) - ch(q, axis));
    let total = 0;
    for (const c of b.cs) total += counts.get(c)!;
    let acc = 0, cut = 1;
    for (let i = 0; i < b.cs.length - 1; i++) {
      acc += counts.get(b.cs[i])!;
      if (acc >= total / 2) { cut = i + 1; break; }
    }
    boxes.splice(pick, 1, { cs: b.cs.slice(0, cut) }, { cs: b.cs.slice(cut) });
  }
  return boxes.map((b) => {
    let r = 0, g = 0, bl = 0, wsum = 0;
    for (const c of b.cs) {
      const wt = counts.get(c)!;
      r += ch(c, 0) * wt; g += ch(c, 1) * wt; bl += ch(c, 2) * wt; wsum += wt;
    }
    return (Math.round(r / wsum) << 16) | (Math.round(g / wsum) << 8) | Math.round(bl / wsum);
  });
}

function nearest(pal: number[], rgb: number): number {
  const r = (rgb >> 16) & 255, g = (rgb >> 8) & 255, b = rgb & 255;
  let best = 0, bd = Infinity;
  for (let i = 0; i < pal.length; i++) {
    const c = pal[i], dr = ((c >> 16) & 255) - r, dg = ((c >> 8) & 255) - g, db = (c & 255) - b;
    const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/**
 * Decode a GIF into full frames (each composited onto the previous as the format's disposal
 * rules say). Pixels are opaque or fully transparent.
 */
export function decodeGif(buf: Buffer, maxFrames = 600): { img: Img; ms: number }[] {
  const sig = buf.toString("ascii", 0, 6);
  if (sig !== "GIF89a" && sig !== "GIF87a") throw new Error("not a GIF file");
  const W = buf.readUInt16LE(6), H = buf.readUInt16LE(8), flags = buf[10];
  let p = 13;
  const table = (n: number): number[] => {
    const t: number[] = [];
    for (let i = 0; i < n; i++) t.push(((buf[p + i * 3] << 24) | (buf[p + i * 3 + 1] << 16) | (buf[p + i * 3 + 2] << 8) | 255) >>> 0);
    p += n * 3;
    return t;
  };
  const global = flags & 0x80 ? table(2 << (flags & 7)) : undefined;
  const frames: { img: Img; ms: number }[] = [];
  let canvas = new Img(W, H), delay = 100, transp = -1, dispose = 0;
  const blocks = (): Buffer => {
    const parts: Buffer[] = [];
    for (;;) {
      const n = buf[p++];
      if (!n || p > buf.length) break;
      parts.push(buf.subarray(p, p + n));
      p += n;
    }
    return Buffer.concat(parts);
  };
  while (p < buf.length && frames.length < maxFrames) {
    const b = buf[p++];
    if (b === 0x3b) break;
    if (b === 0x21) {
      const label = buf[p++];
      if (label === 0xf9) {
        const f = buf[p + 1];
        dispose = (f >> 2) & 7;
        delay = buf.readUInt16LE(p + 2) * 10 || 100;
        transp = f & 1 ? buf[p + 4] : -1;
      }
      blocks();
      continue;
    }
    if (b !== 0x2c) throw new Error("GIF data is damaged");
    const x0 = buf.readUInt16LE(p), y0 = buf.readUInt16LE(p + 2), w = buf.readUInt16LE(p + 4), h = buf.readUInt16LE(p + 6), lf = buf[p + 8];
    p += 9;
    const pal = lf & 0x80 ? table(2 << (lf & 7)) : global;
    if (!pal) throw new Error("GIF frame has no color table");
    const minCode = buf[p++], data = blocks();
    const idx = unlzw(data, minCode, w * h);
    const before = dispose === 3 ? canvas.copy() : undefined;
    const rows: number[] = [];
    if (lf & 0x40) for (const [start, step] of [[0, 8], [4, 8], [2, 4], [1, 2]]) for (let y = start; y < h; y += step) rows.push(y);
    else for (let y = 0; y < h; y++) rows.push(y);
    rows.forEach((y, r) => {
      for (let x = 0; x < w; x++) {
        const k = idx[r * w + x];
        if (k !== transp && k < pal.length) canvas.set(x0 + x, y0 + y, pal[k]);
      }
    });
    frames.push({ img: canvas.copy(), ms: delay });
    if (dispose === 2) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) canvas.set(x0 + x, y0 + y, 0); }
    else if (before) canvas = before;
    delay = 100; transp = -1; dispose = 0;
  }
  if (!frames.length) throw new Error("GIF has no frames");
  return frames;
}

function unlzw(data: Buffer, minCode: number, n: number): Uint8Array {
  const out = new Uint8Array(n), clear = 1 << minCode, end = clear + 1;
  const prefix = new Int32Array(4096), suffix = new Uint8Array(4096), stack = new Uint8Array(4097);
  let size = minCode + 1, next = end + 1, bits = 0, acc = 0, prev = -1, first = 0, o = 0, i = 0;
  for (let k = 0; k < clear; k++) suffix[k] = k;
  while (o < n) {
    while (bits < size && i < data.length) { acc |= data[i++] << bits; bits += 8; }
    if (bits < size) break;
    let code = acc & ((1 << size) - 1);
    acc >>= size; bits -= size;
    if (code === clear) { size = minCode + 1; next = end + 1; prev = -1; continue; }
    if (code === end) break;
    if (prev < 0) { out[o++] = code; prev = code; first = code; continue; }
    const inCode = code;
    let sp = 0;
    if (code >= next) { stack[sp++] = first; code = prev; }
    while (code >= clear) { stack[sp++] = suffix[code]; code = prefix[code]; }
    first = suffix[code];
    stack[sp++] = first;
    if (next < 4096) { prefix[next] = prev; suffix[next] = first; next++; if (next === 1 << size && size < 12) size++; }
    prev = inCode;
    while (sp && o < n) out[o++] = stack[--sp];
  }
  return out;
}
