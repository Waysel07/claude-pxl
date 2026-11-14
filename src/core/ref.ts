// Reference analysis: read someone else's pixel art and turn its style into things an art file
// can use: the native pixel size, a keyed palette with ramps, and a brief of how it is drawn
// (outline, light direction, shading, contrast). The same measurements compare art to a reference.
import { type Color, TRANSPARENT, channels, deltaE, toHex, toOklab, toOklch } from "./color.ts";
import { Img } from "./image.ts";
import { Palette } from "./palette.ts";

export interface RefOpts {
  /** Most colors to keep (default 32); busier images are reduced to their main colors. */
  colors?: number;
  /** Size of one art pixel in image pixels; detected when omitted. */
  scale?: number;
}

export interface RefColor { key: string; color: Color; count: number }

export interface Style {
  /** Opaque bounds of the subject, native pixels. */
  w: number; h: number;
  colors: number;
  /** "dark": dark line all round; "selective": dark on part of the edge; "none". */
  outline: "dark" | "selective" | "none" | "scene";
  /** Share of silhouette edge pixels that are dark (0..1). */
  outlineShare: number;
  /** Where the light comes from ("tl", "t", ... as form() takes it), or "flat". */
  light: string;
  /** Share of pixels sitting in checker patterns (0..1). */
  dither: number;
  /** Average shades per ramp. */
  shades: number;
  /** Ramps drift in hue from shadow to light. */
  hueShift: boolean;
  /** Lightness range of the fills (0..1) and average chroma. */
  contrast: number;
  chroma: number;
}

export interface RefResult {
  /** Detected size of one art pixel in the source image. */
  scale: number;
  /** The art at native size, background removed, reduced to the kept colors. */
  img: Img;
  /** Background color that was removed, if the image had no transparency. */
  bg?: Color;
  /** Distinct colors before reducing. */
  unique: number;
  colors: RefColor[];
  ramps: string[];
  pal: Palette;
  style: Style;
  /** Ready-to-paste pal()/ramps() lines. */
  code: string;
  /** How the reference is drawn, one instruction per line. */
  brief: string[];
}

const close = (a: Color, b: Color, tol = 14): boolean => {
  if (a === b) return true;
  if (a === TRANSPARENT || b === TRANSPARENT) return false;
  const p = channels(a), q = channels(b);
  return Math.abs(p[0] - q[0]) <= tol && Math.abs(p[1] - q[1]) <= tol && Math.abs(p[2] - q[2]) <= tol;
};

/** Largest block size s such that the image is made of uniform s x s blocks (1 = already native). */
export function detectScale(img: Img): number {
  const { w, h, data } = img;
  for (let s = Math.min(64, w, h); s >= 2; s--) {
    if (w % s || h % s) continue;
    let ok = true;
    for (let by = 0; by < h && ok; by += s)
      for (let bx = 0; bx < w && ok; bx += s) {
        const c = data[by * w + bx];
        for (let y = 0; y < s && ok; y++)
          for (let x = 0; x < s; x++) if (!close(data[(by + y) * w + bx + x], c)) { ok = false; break; }
      }
    if (ok) return s;
  }
  return 1;
}

function downscale(img: Img, s: number): Img {
  if (s === 1) return img.copy();
  const o = new Img(Math.floor(img.w / s), Math.floor(img.h / s)), m = Math.floor(s / 2);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.data[y * o.w + x] = img.data[(y * s + m) * img.w + x * s + m];
  return o;
}

/** If the image is fully opaque with a uniform border color, flood that color away from the border. */
function dropBackground(img: Img): Color | undefined {
  const { w, h, data } = img;
  if (data.some((c) => c === TRANSPARENT)) return undefined;
  const count = new Map<Color, number>();
  let n = 0;
  const edge = (c: Color) => { count.set(c, (count.get(c) ?? 0) + 1); n++; };
  for (let x = 0; x < w; x++) { edge(data[x]); edge(data[(h - 1) * w + x]); }
  for (let y = 1; y < h - 1; y++) { edge(data[y * w]); edge(data[y * w + w - 1]); }
  let bg: Color = 0, best = 0;
  for (const [c, k] of count) if (k > best) { bg = c; best = k; }
  let near = 0;
  for (const [c, k] of count) if (close(c, bg)) near += k;
  if (near < n * 0.7) return undefined;
  const stack: number[] = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const i = stack.pop()!;
    if (data[i] === TRANSPARENT || !close(data[i], bg)) continue;
    data[i] = TRANSPARENT;
    const x = i % w;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (i >= w) stack.push(i - w);
    if (i < w * (h - 1)) stack.push(i + w);
  }
  return bg;
}

/** Reduce to at most `max` colors by folding each rarest-nearest color into its closest kept one. */
function reduce(img: Img, max: number): number {
  let count = new Map<Color, number>();
  for (const c of img.data) if (c !== TRANSPARENT) count.set(c, (count.get(c) ?? 0) + 1);
  const unique = count.size;
  const map = new Map<Color, Color>();
  if (count.size > 512) {
    // Photos and blurry upscales: bucket to 5 bits per channel first, keeping each bucket's commonest color.
    const bucket = new Map<number, [Color, number]>();
    for (const [c, n] of count) {
      const [r, g, b] = channels(c), k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3), cur = bucket.get(k);
      if (!cur || n > cur[1]) bucket.set(k, [c, n]);
    }
    const next = new Map<Color, number>();
    for (const [c, n] of count) {
      const [r, g, b] = channels(c), to = bucket.get(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3))![0];
      map.set(c, to);
      next.set(to, (next.get(to) ?? 0) + n);
    }
    count = next;
  }
  const cols = [...count.keys()], lab = new Map(cols.map((c) => [c, toOklab(c)]));
  const d = (a: Color, b: Color) => { const p = lab.get(a)!, q = lab.get(b)!; return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
  const alive = new Set(cols);
  while (alive.size > max) {
    let ba: Color = 0, bb: Color = 0, best = Infinity;
    const list = [...alive];
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const v = d(list[i], list[j]);
        if (v < best) { best = v; ba = list[i]; bb = list[j]; }
      }
    const [keep, drop] = count.get(ba)! >= count.get(bb)! ? [ba, bb] : [bb, ba];
    count.set(keep, count.get(keep)! + count.get(drop)!);
    alive.delete(drop);
    map.set(drop, keep);
  }
  const final = (c: Color): Color => { let t = c; while (map.has(t)) t = map.get(t)!; return t; };
  for (let i = 0; i < img.data.length; i++) if (img.data[i] !== TRANSPARENT) img.data[i] = final(img.data[i]);
  return unique;
}

const HUES: [number, string][] = [[20, "pink"], [45, "red"], [75, "orange"], [115, "yellow"], [165, "green"], [215, "teal"], [275, "blue"], [330, "purple"], [361, "pink"]];
const hueName = (h: number) => HUES.find(([lim]) => h < lim)![1];
const hueGap = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

/**
 * Split colors into ramps, each dark -> light. A ramp is grown from its darkest color: the next
 * shade is clearly lighter and close in hue (hue may drift a little per step, as shifted ramps
 * do). Colors of the same lightness never share a ramp: they are different materials.
 */
function groupRamps(cols: Color[]): Color[][] {
  const lch = new Map(cols.map((c) => [c, toOklch(c)]));
  const isGrey = (c: Color) => lch.get(c)![1] < 0.035;
  const left = new Set([...cols].sort((a, b) => lch.get(a)![0] - lch.get(b)![0]));
  const groups: Color[][] = [];
  while (left.size) {
    const start = left.values().next().value as Color;
    left.delete(start);
    const ramp = [start];
    for (;;) {
      const cur = ramp[ramp.length - 1], [L, , h] = lch.get(cur)!, grey = isGrey(cur);
      let best: Color | undefined, cost = Infinity;
      for (const c of left) {
        const [l2, , h2] = lch.get(c)!, dl = l2 - L;
        if (dl < 0.04 || dl > 0.32 || isGrey(c) !== grey) continue;
        const dh = grey ? 0 : hueGap(h, h2);
        if (dh > 32) continue;
        const v = dh / 32 + Math.abs(dl - 0.1) * 3;
        if (v < cost) { cost = v; best = c; }
      }
      if (best === undefined || ramp.length >= 7) break;
      ramp.push(best);
      left.delete(best);
    }
    groups.push(ramp);
  }
  return groups.sort((a, b) => b.length - a.length);
}

const KEYS = "abcdefghijlmnopqrstuvwxyzABCDEFGHIJLMNOPQRSTUVWXYZ0123456789";

/** Measure how an image is drawn. `dark` is its outline color, if it has one. */
export function measureStyle(img: Img, ramps: Color[][], dark?: Color): Style {
  const { w, h, data } = img;
  // Shade of each pixel within its own ramp (-0.5 darkest .. 0.5 lightest): where the light falls,
  // independent of each material's own color.
  const pos = new Map<Color, number>();
  for (const r of ramps) if (r.length > 1) r.forEach((c, i) => pos.set(c, i / (r.length - 1) - 0.5));
  const L = new Float32Array(w * h);
  let opaque = 0, hasHole = false;
  const count = new Set<Color>();
  for (let i = 0; i < data.length; i++) {
    if (data[i] === TRANSPARENT) { hasHole = true; continue; }
    opaque++; count.add(data[i]); L[i] = toOklab(data[i])[0];
  }
  const b = img.bounds() ?? { x: 0, y: 0, w, h };
  const isDark = (c: Color) => c === dark || toOklab(c)[0] < 0.3;
  let edge = 0, edgeDark = 0, dith = 0, inner = 0;
  let sx = 0, sy = 0, sl = 0, cx = 0, cy = 0, lmin = 1, lmax = 0, csum = 0;
  const fill: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x, c = data[i];
      if (c === TRANSPARENT) continue;
      const nb = [img.get(x - 1, y), img.get(x + 1, y), img.get(x, y - 1), img.get(x, y + 1)];
      const onEdge = hasHole && nb.some((n) => n === TRANSPARENT);
      if (onEdge) { edge++; if (isDark(c)) edgeDark++; }
      if (!onEdge && nb.every((n) => n !== TRANSPARENT)) {
        inner++;
        const dg = [img.get(x - 1, y - 1), img.get(x + 1, y - 1), img.get(x - 1, y + 1), img.get(x + 1, y + 1)];
        if (nb.every((n) => n !== c) && dg.filter((n) => n === c).length >= 2) dith++;
      }
      if (!isDark(c)) { fill.push(i); cx += x; cy += y; sl += L[i]; lmin = Math.min(lmin, L[i]); lmax = Math.max(lmax, L[i]); csum += toOklch(c)[1]; }
    }
  const n = fill.length || 1;
  cx /= n; cy /= n; sl /= n;
  let shaded = 0;
  for (const i of fill) {
    const v = pos.get(data[i]);
    if (v === undefined) continue;
    const x = i % w, y = (i - x) / w;
    sx += v * (x - cx); sy += v * (y - cy); shaded++;
  }
  // Normalised by subject size: a form lit from one side scores around 0.03 or more.
  const mag = Math.hypot(sx, sy) / (Math.max(1, shaded) * Math.max(b.w, b.h));
  let light = "flat";
  if (mag > 0.015) {
    const a = Math.atan2(sy, sx), k = Math.round(a / (Math.PI / 4));
    light = ["r", "br", "b", "bl", "l", "tl", "t", "tr"][((k % 8) + 8) % 8];
  }
  const share = edge ? edgeDark / edge : 0;
  const multi = ramps.filter((r) => r.length > 1);
  const shift = multi.filter((r) => { const a = toOklch(r[0]), z = toOklch(r[r.length - 1]); return a[1] > 0.03 && z[1] > 0.03 && hueGap(a[2], z[2]) > 12; });
  return {
    w: b.w, h: b.h, colors: count.size,
    outline: !hasHole ? "scene" : share >= 0.75 ? "dark" : share >= 0.25 ? "selective" : "none",
    outlineShare: share, light, dither: inner ? dith / inner : 0,
    shades: multi.length ? multi.reduce((s, r) => s + r.length, 0) / multi.length : 1,
    hueShift: multi.length > 0 && shift.length >= multi.length / 2,
    contrast: fill.length ? lmax - lmin : 0, chroma: csum / n,
  };
}

/** Analyse a reference image (as decoded, any upscale) into palette, ramps and a style brief. */
export function analyzeRef(src: Img, o: RefOpts = {}): RefResult {
  const scale = o.scale ?? detectScale(src);
  if (!(Number.isInteger(scale) && scale >= 1)) throw new Error(`scale must be a whole number >= 1, got ${o.scale}`);
  const img = downscale(src, scale);
  const bg = dropBackground(img);
  const unique = reduce(img, Math.max(2, Math.floor(o.colors ?? 32)));

  const count = new Map<Color, number>();
  for (const c of img.data) if (c !== TRANSPARENT) count.set(c, (count.get(c) ?? 0) + 1);
  if (!count.size) throw new Error("reference image is empty");
  const all = [...count.keys()];
  // Outline color: the darkest color, when it is really dark.
  const darkest = all.reduce((a, c) => (toOklab(c)[0] < toOklab(a)[0] ? c : a));
  const dark = toOklab(darkest)[0] < 0.3 ? darkest : undefined;
  const groups = groupRamps(all.filter((c) => c !== dark));

  const colors: RefColor[] = [];
  const keyOf = new Map<Color, string>();
  let next = 0;
  if (dark !== undefined) { keyOf.set(dark, "k"); colors.push({ key: "k", color: dark, count: count.get(dark)! }); }
  const ramps: string[] = [];
  for (const g of groups) {
    let r = "";
    for (const c of g) {
      const key = KEYS[next++];
      if (!key) break;
      keyOf.set(c, key); r += key;
      colors.push({ key, color: c, count: count.get(c)! });
    }
    if (r.length > 1) ramps.push(r);
  }
  // Colors past the key alphabet fold into their nearest keyed color.
  const keyed = [...keyOf.keys()];
  for (let i = 0; i < img.data.length; i++) {
    const c = img.data[i];
    if (c === TRANSPARENT || keyOf.has(c)) continue;
    img.data[i] = keyed.reduce((a, k) => (deltaE(k, c) < deltaE(a, c) ? k : a));
  }
  const def: Record<string, string> = {};
  for (const c of colors) def[c.key] = toHex(c.color);
  const pal = Palette.fromColors([]).extend(def).withRamps(ramps);
  const style = measureStyle(img, groups, dark);

  const lines: string[] = [];
  const group = (keys: string) => [...keys].map((k) => `${k}: "${def[k]}"`).join(", ");
  lines.push("pal({");
  if (dark !== undefined) lines.push(`  ${group("k")},${" ".repeat(20)}// outline / darkest`);
  const singles = colors.filter((c) => c.key !== "k" && !ramps.some((r) => r.includes(c.key))).map((c) => c.key).join("");
  for (const r of ramps) lines.push(`  ${group(r)},   // ${hueName(toOklch(pal.keys.get(r[Math.floor(r.length / 2)])!)[2])}${toOklch(pal.keys.get(r[Math.floor(r.length / 2)])!)[1] < 0.035 ? " / grey" : ""}, dark -> light`);
  if (singles) lines.push(`  ${group(singles)},   // accents`);
  lines.push("})");
  if (ramps.length) lines.push(`ramps(${ramps.map((r) => `"${r}"`).join(", ")})`);

  return { scale, img, bg, unique, colors, ramps, pal, style, code: lines.join("\n"), brief: describe(style, unique, colors.length, dark !== undefined), };
}

/** The style as instructions for drawing something new the same way. */
export function describe(s: Style, unique: number, kept: number, hasDark: boolean): string[] {
  const out: string[] = [];
  out.push(`size: subject is ${s.w}x${s.h} px at native scale: draw new art of the same kind at about this size`);
  out.push(unique > kept
    ? `colors: ${unique} in the image, reduced to its ${kept} main ones${unique > 64 ? " (not clean pixel art, or anti-aliased)" : ""}: stay within these`
    : `colors: ${kept}, about ${s.shades.toFixed(1)} shades per material: use only this palette, no extra shades`);
  if (s.outline === "dark") out.push(`outline: dark line all round (${Math.round(s.outlineShare * 100)}% of the edge): use outline: "k"${hasDark ? "" : " with the darkest key"}, no selout`);
  else if (s.outline === "selective") out.push(`outline: selective (${Math.round(s.outlineShare * 100)}% of the edge is dark, the rest takes the fill's own shade): use outline: "k", selout: true`);
  else if (s.outline === "none") out.push("outline: none: shapes end in their own colors; do not add outline, separate shapes by value contrast");
  else out.push("outline: full scene (no transparent background); look at the preview for how objects are edged");
  out.push(s.light === "flat"
    ? "light: no clear direction (flat or front-lit): keep shading minimal and symmetric, form({ hi: 0, lo: 1 }) at most"
    : `light: looks like it comes from the ${({ tl: "top-left", t: "top", tr: "top-right", l: "left", r: "right", bl: "bottom-left", b: "bottom", br: "bottom-right" } as Record<string, string>)[s.light]} (an estimate: confirm in the preview): form({ from: "${s.light}" }), every asset lit the same way`);
  out.push(s.dither > 0.04
    ? `shading: dithered (${Math.round(s.dither * 100)}% of pixels in checker patterns): use dither()/grad() or form({ soft: 0.5 }) on larger areas`
    : "shading: clean flat bands, no dithering: form() without soft, hand-placed clusters");
  out.push(s.hueShift
    ? "ramps: hue-shifted (shadows and highlights change hue, not just brightness): the ramps above already carry it"
    : "ramps: straight (shades differ mostly in brightness): do not add hue shift; use the ramps above as they are");
  out.push(`contrast: ${s.contrast > 0.6 ? "high" : s.contrast > 0.35 ? "medium" : "low"} (lightness range ${s.contrast.toFixed(2)}), ${s.chroma > 0.12 ? "vivid" : s.chroma > 0.06 ? "moderate" : "muted"} colors`);
  return out;
}

/** How closely `art` follows the reference: one line per trait, each starting with "ok" or "differs". */
export function compareStyle(art: Img, ref: RefResult): string[] {
  const refCols = new Set(ref.colors.map((c) => c.color));
  let opaque = 0, off = 0;
  const offCols = new Set<Color>(), used = new Set<Color>();
  for (const c of art.data) {
    if (c === TRANSPARENT) continue;
    opaque++; used.add(c);
    if (!refCols.has(c)) { off++; offCols.add(c); }
  }
  const all = [...used];
  const darkest = all.length ? all.reduce((a, c) => (toOklab(c)[0] < toOklab(a)[0] ? c : a)) : undefined;
  const dark = darkest !== undefined && toOklab(darkest)[0] < 0.3 ? darkest : undefined;
  const st = measureStyle(art, groupRamps(all.filter((c) => c !== dark)), dark), rs = ref.style;
  const out: string[] = [];
  const line = (ok: boolean, text: string) => out.push(`${ok ? "ok     " : "differs"} ${text}`);
  line(off === 0, off === 0 ? `palette: every color is from the reference (${used.size} of its ${refCols.size} used)`
    : `palette: ${offCols.size} colors not in the reference cover ${Math.round((off / Math.max(1, opaque)) * 100)}% of the art (${[...offCols].slice(0, 4).map(toHex).join(" ")}${offCols.size > 4 ? " …" : ""})`);
  line(st.outline === rs.outline, `outline: art ${st.outline} (${Math.round(st.outlineShare * 100)}% dark edge), reference ${rs.outline} (${Math.round(rs.outlineShare * 100)}%)`);
  line(st.light === rs.light, `light: art ${st.light}, reference ${rs.light}`);
  line(st.dither > 0.04 === rs.dither > 0.04, `dithering: art ${Math.round(st.dither * 100)}%, reference ${Math.round(rs.dither * 100)}%`);
  line(Math.abs(st.contrast - rs.contrast) < 0.15, `contrast: art ${st.contrast.toFixed(2)}, reference ${rs.contrast.toFixed(2)}`);
  const ratio = Math.max(st.w, st.h) / Math.max(1, Math.max(rs.w, rs.h));
  line(ratio > 0.6 && ratio < 1.7, `size: art ${st.w}x${st.h}, reference ${rs.w}x${rs.h}`);
  return out;
}
