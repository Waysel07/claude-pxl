import { crc32, deflateSync, inflateSync } from "node:zlib";
import { TRANSPARENT } from "../core/color.ts";
import { Img } from "../core/image.ts";

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

/** PNG bytes: indexed (with tRNS) when the image has <= 256 colors, RGBA otherwise. */
export function encodePng(img: Img): Buffer {
  const { w, h, data } = img;
  const index = new Map<number, number>();
  for (let i = 0; i < data.length && index.size <= 256; i++) if (!index.has(data[i])) index.set(data[i], index.size);
  const indexed = index.size <= 256;

  const rowLen = indexed ? w + 1 : w * 4 + 1;
  const raw = Buffer.alloc(rowLen * h);
  for (let y = 0; y < h; y++) {
    let o = y * rowLen + 1; // filter byte 0
    for (let x = 0; x < w; x++) {
      const c = data[y * w + x];
      if (indexed) raw[o++] = index.get(c)!;
      else { raw[o++] = c >>> 24; raw[o++] = (c >>> 16) & 255; raw[o++] = (c >>> 8) & 255; raw[o++] = c & 255; }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = indexed ? 3 : 6;
  const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr)];
  if (indexed) {
    const colors = [...index.keys()];
    const plte = Buffer.alloc(colors.length * 3), trns = Buffer.alloc(colors.length);
    let lastAlpha = -1;
    colors.forEach((c, i) => {
      plte[i * 3] = c >>> 24; plte[i * 3 + 1] = (c >>> 16) & 255; plte[i * 3 + 2] = (c >>> 8) & 255;
      trns[i] = c === TRANSPARENT ? 0 : c & 255;
      if (trns[i] !== 255) lastAlpha = i;
    });
    parts.push(chunk("PLTE", plte));
    if (lastAlpha >= 0) parts.push(chunk("tRNS", trns.subarray(0, lastAlpha + 1)));
  }
  parts.push(chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(parts);
}

/**
 * Decode a PNG into an Img (8/16-bit gray, RGB, palette, with or without alpha; not interlaced).
 * Pixels with alpha below 128 become transparent, the rest opaque: pixel art has no soft edges.
 */
export function decodePng(buf: Buffer): Img {
  const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  if (buf.length < 8 || SIG.some((b, i) => buf[i] !== b)) throw new Error("not a PNG file (reference images must be .png)");
  let w = 0, h = 0, depth = 8, type = 6, interlace = 0;
  let plte: Buffer | undefined, trns: Buffer | undefined;
  const idat: Buffer[] = [];
  for (let p = 8; p + 8 <= buf.length;) {
    const len = buf.readUInt32BE(p), name = buf.toString("ascii", p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (name === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    else if (name === "PLTE") plte = data;
    else if (name === "tRNS") trns = data;
    else if (name === "IDAT") idat.push(data);
    else if (name === "IEND") break;
    p += 12 + len;
  }
  if (!w || !h) throw new Error("PNG has no size");
  if (interlace) throw new Error("interlaced PNGs are not supported: re-save the image without interlacing");
  const ch = type === 0 ? 1 : type === 2 ? 3 : type === 3 ? 1 : type === 4 ? 2 : type === 6 ? 4 : 0;
  if (!ch) throw new Error(`unsupported PNG color type ${type}`);
  const bpp = Math.max(1, (ch * depth) >> 3), rowLen = Math.ceil((w * ch * depth) / 8);
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length < (rowLen + 1) * h) throw new Error("PNG data is truncated");
  const img = new Img(w, h), cur = Buffer.alloc(rowLen);
  let prev = Buffer.alloc(rowLen);
  const sample = (row: Buffer, i: number): number => {
    if (depth === 8) return row[i];
    if (depth === 16) return row[i * 2];
    const per = 8 / depth, v = (row[Math.floor(i / per)] >> (8 - depth * ((i % per) + 1))) & ((1 << depth) - 1);
    return type === 3 ? v : Math.round((v * 255) / ((1 << depth) - 1));
  };
  for (let y = 0; y < h; y++) {
    const o = y * (rowLen + 1), f = raw[o];
    for (let i = 0; i < rowLen; i++) {
      const x = raw[o + 1 + i], a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = x;
      if (f === 1) v = x + a;
      else if (f === 2) v = x + b;
      else if (f === 3) v = x + ((a + b) >> 1);
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, al = 255;
      if (type === 3) {
        const k = sample(cur, x);
        if (!plte || k * 3 + 2 >= plte.length) throw new Error("PNG palette index out of range");
        r = plte[k * 3]; g = plte[k * 3 + 1]; b = plte[k * 3 + 2];
        if (trns && k < trns.length) al = trns[k];
      } else if (type === 0 || type === 4) {
        r = g = b = sample(cur, x * ch);
        if (type === 4) al = sample(cur, x * ch + 1);
        else if (trns && trns.length >= 2 && depth === 8 && trns[1] === r) al = 0;
      } else {
        r = sample(cur, x * ch); g = sample(cur, x * ch + 1); b = sample(cur, x * ch + 2);
        if (type === 6) al = sample(cur, x * ch + 3);
        else if (trns && trns.length >= 6 && depth === 8 && trns[1] === r && trns[3] === g && trns[5] === b) al = 0;
      }
      img.data[y * w + x] = al < 128 ? TRANSPARENT : ((r << 24) | (g << 16) | (b << 8) | 255) >>> 0;
    }
    prev = Buffer.from(cur);
  }
  return img;
}
