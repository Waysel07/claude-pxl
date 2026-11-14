// Colors are packed 0xRRGGBBAA unsigned integers. 0 is fully transparent.
export type Color = number;

export const TRANSPARENT: Color = 0;

export function pack(r: number, g: number, b: number, a = 255): Color {
  return (((r & 255) << 24) | ((g & 255) << 16) | ((b & 255) << 8) | (a & 255)) >>> 0;
}

export function channels(c: Color): [number, number, number, number] {
  return [(c >>> 24) & 255, (c >>> 16) & 255, (c >>> 8) & 255, c & 255];
}

/** "#rgb", "#rgba", "#rrggbb", "#rrggbbaa" (leading # optional). */
export function parseHex(s: string): Color | undefined {
  let h = s.startsWith("#") ? s.slice(1) : s;
  if (!/^[0-9a-fA-F]+$/.test(h)) return undefined;
  if (h.length === 3 || h.length === 4) h = h.replace(/./g, (d) => d + d);
  if (h.length === 6) h += "ff";
  if (h.length !== 8) return undefined;
  const c = parseInt(h, 16) >>> 0;
  return (c & 255) === 0 ? TRANSPARENT : c;
}

export function toHex(c: Color): string {
  const [r, g, b, a] = channels(c);
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return "#" + h(r) + h(g) + h(b) + (a === 255 ? "" : h(a));
}

/** Darken toward black by k (0..1); result is opaque. */
export function darken(c: Color, k: number): Color {
  const [r, g, b] = channels(c);
  return pack(r * (1 - k), g * (1 - k), b * (1 - k));
}

// ---------------------------------------------------------------- perceptual color (OKLab)

const lin = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const gam = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

/** Color -> OKLab [L 0..1, a, b]: distances and lightness steps match what the eye sees. */
export function toOklab(c: Color): [number, number, number] {
  const [r8, g8, b8] = channels(c);
  const r = lin(r8), g = lin(g8), b = lin(b8);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Color -> [lightness 0..1, chroma 0..~0.4, hue in degrees 0..360). */
export function toOklch(c: Color): [number, number, number] {
  const [L, a, b] = toOklab(c);
  return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
}

function oklabToLinear(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** OKLCH -> opaque color; chroma is reduced until the color fits sRGB (hue and lightness kept). */
export function fromOklch(L: number, C: number, h: number): Color {
  L = Math.min(1, Math.max(0, L));
  const rad = (h * Math.PI) / 180, ca = Math.cos(rad), sa = Math.sin(rad);
  const fits = (c: number) => oklabToLinear(L, c * ca, c * sa).every((v) => v >= -1e-4 && v <= 1 + 1e-4);
  let c = Math.max(0, C);
  if (!fits(c)) {
    let lo = 0, hi = c;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid; else hi = mid;
    }
    c = lo;
  }
  const [r, g, b] = oklabToLinear(L, c * ca, c * sa);
  const q = (v: number) => Math.round(Math.min(1, Math.max(0, gam(Math.min(1, Math.max(0, v))))) * 255);
  return pack(q(r), q(g), q(b));
}

/** Perceptual distance between two colors (OKLab; ~0.02 is barely visible). */
export function deltaE(a: Color, b: Color): number {
  const x = toOklab(a), y = toOklab(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}
