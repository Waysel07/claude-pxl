// Hue-shifted color ramps: the pixel-art way of shading. Shadows drift toward blue/purple and
// keep their saturation; highlights drift toward yellow and wash out. Built in OKLCH so the
// lightness steps look even.
import { type Color, fromOklch, toOklch } from "./color.ts";
import { PxError } from "./errors.ts";

export interface RampOpts {
  /** Index (0 = darkest) the given color sits at; default the middle. */
  at?: number;
  /** Hue shift strength: 0 = none (plain darker/lighter), 1 = default, 2 = strong. */
  shift?: number;
  /** Lightness spread: 1 = default, lower = closer shades, higher = punchier. */
  contrast?: number;
}

const WARM = 100, COOL = 280;

/** `n` shades around `base`, dark -> light. */
export function makeRamp(base: Color, n: number, o: RampOpts = {}): Color[] {
  if (!(n >= 2 && n <= 12)) throw new PxError(`ramp needs 2..12 keys, got ${n}`);
  const at = o.at ?? Math.floor(n / 2);
  if (!(Number.isInteger(at) && at >= 0 && at < n)) throw new PxError(`ramp at must be 0..${n - 1}, got ${o.at}`);
  const shift = o.shift ?? 1, contrast = o.contrast ?? 1;
  const [L0, C0, h0] = toOklch(base);
  const grey = C0 < 0.025;
  const out: Color[] = new Array(n);
  out[at] = base;

  // Shadows: away from yellow toward blue-violet; each step closes part of the gap to a dark floor.
  let L = L0, C = C0, h = h0;
  for (let i = at - 1; i >= 0; i--) {
    L = Math.max(0.05, L - Math.max((L - 0.1) * Math.min(0.6, 0.3 * contrast), 0.05 * contrast));
    if (grey) { h = COOL; C = Math.min(0.03, C + 0.012 * shift); }
    else {
      h = toward(h, COOL, 11 * shift, true);
      C *= at - i === 1 ? 1.04 : 0.93;
    }
    out[i] = fromOklch(L, C, h);
  }
  // Highlights: toward yellow, losing saturation as they approach white.
  L = L0; C = C0; h = h0;
  for (let i = at + 1; i < n; i++) {
    L = Math.min(0.99, L + Math.max((0.97 - L) * Math.min(0.7, 0.36 * contrast), 0.05 * contrast));
    if (grey) { h = WARM; C = Math.min(0.03, C + 0.01 * shift); }
    else {
      h = toward(h, WARM, 9 * shift, false);
      C *= 0.86;
    }
    out[i] = fromOklch(L, C, h);
  }
  return out;
}

/**
 * Move hue `h` toward `target` by at most `step` degrees. Shadows (`away`) travel the long way
 * round when that avoids crossing yellow: yellow darkens through orange, green through teal.
 */
function toward(h: number, target: number, step: number, away: boolean): number {
  let d = ((target - h + 540) % 360) - 180; // shortest signed distance
  if (away) {
    const fromWarm = ((h - WARM + 540) % 360) - 180; // which side of yellow we're on
    if (fromWarm !== 0 && Math.sign(d) !== Math.sign(fromWarm)) d += 360 * Math.sign(fromWarm);
  }
  const m = Math.min(Math.abs(d), step);
  return (h + Math.sign(d) * m + 360) % 360;
}
