// pxl car kit: include("pxl:cars"), then car("name", { ... }) defines a sprite of a car seen from
// the side or turned toward its rear (3/4 view), built from a side profile like a real body:
// near side, rear face, glass, wheels, seams, lights. Everything is drawn with the keys you pass,
// so it stays in your palette. See cars.md for the options and how to design your own body.

/** Body shapes. u runs nose (0) -> tail (1) along the car, z is height from the ground (0..1 = roof). */
const CAR_BODIES = {
  // Low notchback coupe, long hood (Silvia / 240SX, E30 coupe, AE86 notch).
  coupe: {
    len: 110, width: 68, height: 38,
    belt: [[0, 0.47], [0.33, 0.62], [0.8, 0.63], [0.97, 0.62], [1, 0.56]],
    roof: [[0.33, 0.62], [0.415, 1], [0.6, 1], [0.8, 0.63]],
    axles: [0.18, 0.84], wheel: 9, sill: 0.32, bPillar: 0.66,
  },
  // Hatchback: short tail, roof runs far back and drops steeply (Golf, Civic, AE86 hatch).
  hatch: {
    len: 124, width: 54, height: 40,
    belt: [[0, 0.52], [0.04, 0.58], [0.28, 0.62], [1, 0.64]],
    roof: [[0.2, 0.62], [0.36, 1], [0.8, 0.98], [0.97, 0.64]],
    axles: [0.18, 0.8], wheel: 9, sill: 0.28, bPillar: 0.56,
  },
  // Three-box sedan: upright glass, trunk as long as the hood is short (Cressida, 190E, Volvo 240).
  sedan: {
    len: 150, width: 56, height: 42,
    belt: [[0, 0.5], [0.03, 0.58], [0.28, 0.62], [0.78, 0.63], [1, 0.6]],
    roof: [[0.24, 0.62], [0.36, 1], [0.68, 1], [0.8, 0.63]],
    axles: [0.17, 0.8], wheel: 9, sill: 0.26, bPillar: 0.52, doors: 4,
  },
  // Wagon / estate: the roof carries to the tail.
  wagon: {
    len: 150, width: 56, height: 43,
    belt: [[0, 0.5], [0.03, 0.58], [0.28, 0.62], [1, 0.63]],
    roof: [[0.24, 0.62], [0.36, 1], [0.94, 0.98], [1, 0.63]],
    axles: [0.17, 0.79], wheel: 9, sill: 0.26, bPillar: 0.52, doors: 4,
  },
  // Wedge supercar: cab forward, very low, wide (Countach, NSX, Testarossa).
  wedge: {
    len: 146, width: 64, height: 31,
    belt: [[0, 0.36], [0.05, 0.46], [0.3, 0.62], [0.72, 0.7], [1, 0.72]],
    roof: [[0.2, 0.56], [0.42, 1], [0.6, 1], [0.78, 0.7]],
    axles: [0.19, 0.8], wheel: 10, sill: 0.26, bPillar: 0.62,
  },
  // Tiny boxy kei car / city car.
  kei: {
    len: 100, width: 46, height: 46,
    belt: [[0, 0.46], [0.03, 0.54], [0.2, 0.56], [1, 0.56]],
    roof: [[0.14, 0.56], [0.26, 1], [0.94, 1], [1, 0.56]],
    axles: [0.18, 0.82], wheel: 7, sill: 0.22, bPillar: 0.54, doors: 4,
  },
};

/**
 * car(name, opts): define sprite `name`.
 *   body:  a CAR_BODIES name or your own { len, width, height, belt, roof, axles, wheel, sill, bPillar }
 *   paint: 6 keys dark -> light (a ramp)      glass: 4 keys dark -> light
 *   trim:  3 keys dark -> light (tires, plastics, shadow)   metal: 3 keys dark -> light (rims, chrome)
 *   head, tail: 2 keys dark -> light each for head and tail lights (default: from metal)   k: outline key (optional)
 *   view:  "front" (default) or "rear": which end is turned toward the viewer
 *   yaw:   0 = pure side view ... 60 = mostly the end (default 42)
 *   pitch: looking down on the car, in px (default 0 = eye level; 3-5 shows more roof and deck)
 *   scale: size factor (default 1 = about 130 px long)
 *   tyre: sidewall height as a share of the wheel radius (default 0.14 = low profile; 0.3 = stock)
 *   camber: wheel tilt in px   rim: wheel() options ({ spokes, dish, ... })   spin: wheel angle in degrees
 *   plate: two characters for the number plate (drawn from scale 1.5 up)   facing: "right" (default: visible end on the right) | "left"
 *   spoiler: true   mirror: false   stripe: key (side stripe)   popups: true (raised headlights)
 */
function car(name, o = {}) {
  const B = typeof o.body === "object" ? { ...CAR_BODIES.coupe, ...o.body } : CAR_BODIES[o.body ?? "coupe"];
  if (!B) throw new Error(`car: unknown body '${o.body}' (have: ${Object.keys(CAR_BODIES).join(", ")})`);
  for (const [k, n] of [["paint", 6], ["glass", 4], ["trim", 3], ["metal", 3]])
    if (typeof o[k] !== "string" || [...o[k]].length !== n) throw new Error(`car: ${k} must be ${n} keys dark -> light, e.g. ramp("${"abcdef".slice(0, n)}", "#hex") then ${k}: "${"abcdef".slice(0, n)}"`);
  const P = [...o.paint], G = [...o.glass], T = [...o.trim], M = [...o.metal], front = (o.view ?? "front") !== "rear";
  const L = [...((front ? o.head : o.tail) ?? o.metal.slice(1))], L2 = [...((front ? o.tail : o.head) ?? o.metal.slice(1))];
  const s = o.scale ?? 1, yaw = ((o.yaw ?? 42) * Math.PI) / 180, lift = Math.round((o.pitch ?? 0) * s), tumble = B.tumble ?? 0.66;
  const len = B.len * s, wid = B.width * s, H = Math.round(B.height * s);
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const R = Math.max(3, Math.round(B.wheel * s)), rx = Math.max(1.5, R * cs);
  const pad = 2, side = len * cs, back = Math.round(wid * sn);
  const W = Math.ceil(side + back) + pad * 2 + 2, base = H + pad + lift;    // base = ground line (y)
  // t runs from the hidden end (0) to the end turned toward the viewer (1); u is nose (0) -> tail (1).
  const U = (t) => (front ? 1 - t : t);
  const rev = (pts) => (front ? pts.map(([u, z]) => [1 - u, z]).reverse() : pts);
  const belt = rev(B.belt), roof = rev(B.roof), sill = B.sill, low = B.low ?? 0.05;
  const at = (pts, t) => {
    for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) { const [a, b] = [pts[i - 1], pts[i]]; return a[1] + ((b[1] - a[1]) * (t - a[0])) / (b[0] - a[0] || 1); }
    return pts[pts.length - 1][1];
  };
  const zb = (t) => at(belt, t);
  const X = (t, f = 0) => pad + t * side + f * back;                        // f: 0 near side, 1 far side
  const Y = (z, f = 0) => base - z * H - f * lift;
  const N = (t, z) => [X(t), Y(z)];
  const F = (t, z) => { const f = z >= 0.99 ? tumble : 1; return [X(t, f), Y(z, 1)]; };   // the cabin narrows toward the roof
  const E = (f, z) => [X(1, f), Y(z, f)];                                   // a point on the end face
  const q = (...pts) => pts.flat().map(Math.round);
  const axles = B.axles.map(U).sort((a, b) => a - b);
  const bp = U(B.bPillar), roofA = roof[0], roofB = roof[roof.length - 1];  // greenhouse base: hidden end, visible end
  const endZ = zb(1);

  const draw = (c) => {
    const yBelt = Y(zb(0.5)), ySill = Y(sill), yLow = Y(low), hBody = ySill - yBelt;

    // --- top surfaces, swept from the near edge to the far edge (seen because of the pitch)
    if (back >= 3) {
      // roof, then the glass facing the visible end, then hood or boot lid
      const r1 = roof[roof.length - 2];
      c.poly(q(N(...roof[1]), F(...roof[1]), F(...r1), N(...r1)), P[4]);
      c.line(...q(F(...roof[1]), F(...r1)), P[5]);
      const g = q(N(...r1), F(...r1), F(...roofB), N(...roofB));
      c.poly(g, G[0]);
      c.clip(g, () => {
        const top = g[1], bot = g[7], hh = bot - top;
        // sky streaks running down the glass, parallel to the pillars; brightest at the top edge
        const at2 = (k, v) => [g[0] + (g[2] - g[0]) * k + (g[6] - g[0]) * v, top + hh * v];
        c.poly(q(at2(0.34, 0), at2(0.62, 0), at2(0.66, 1), at2(0.38, 1)), G[1]);
        c.poly(q(at2(0.74, 0), at2(1, 0), at2(1, 0.75), at2(0.86, 1), at2(0.78, 1)), G[1]);
        c.poly(q(at2(0.42, 0), at2(0.54, 0), at2(0.56, 0.55), at2(0.44, 0.55)), G[2]);
        c.poly(q(at2(0.82, 0), at2(1, 0), at2(1, 0.3), at2(0.84, 0.42)), G[2]);
        c.poly(q(at2(0.9, 0), at2(1, 0), at2(1, 0.14)), G[3]);
        c.line(...q(N(...roofB), F(...roofB)), T[0]);                      // wiper / cowl line
      });
      c.line(...q(N(...r1), N(...roofB)), P[4]);                            // near pillar
      c.line(...q(F(...r1), F(...roofB)), P[2]);                            // far pillar
      const deck = belt.filter(([t]) => t > roofB[0]);
      let prev = [roofB[0], zb(roofB[0])];
      for (const pt of deck) {
        c.poly(q(N(...prev), F(...prev), F(...pt), N(...pt)), P[4]);
        prev = pt;
      }
      const c0 = [roofB[0], zb(roofB[0])], mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
      c.poly(q(mix(N(...c0), F(...c0), 0.6), F(...c0), F(1, endZ), mix(N(1, endZ), F(1, endZ), 0.72)), P[3]);   // far half turns from the sky
      c.line(...q(mix(N(...c0), F(...c0), 0.12), mix(N(1, endZ), F(1, endZ), 0.1)), P[5]);                        // light along the near wing
      c.line(...q(N(roofB[0], zb(roofB[0])), F(roofB[0], zb(roofB[0]))), P[2]);            // cowl: where the glass meets the hood / lid
    }

    // --- the end turned toward the viewer: nose or tail
    if (back >= 3) {
      const row = (z0, z1, key) => c.poly(q(E(0, z0), E(1, z0), E(1, z1), E(0, z1)), key);
      const span = endZ - low, zf = (k) => endZ - span * k;                 // k: 0 top edge .. 1 bottom
      row(zf(0), zf(1), T[1]);                                              // bumper and valance in shade
      row(zf(0), zf(0.1), P[4]);                                            // leading edge of the hood / lid
      const lz0 = zf(0.1), lz1 = zf(0.3);
      row(lz0, lz1, T[0]);                                                  // light bar
      const lh = Math.max(2, Math.round((lz0 - lz1) * H));
      for (let i = 1; i < back - 2; i += 3) {
        const [x, y] = E(i / back, lz0).map(Math.round);
        const lampHere = front ? i < back * 0.34 || i > back * 0.72 : true; // headlights at the corners, grille between
        if (lampHere) { c.rect(x, y, 2, lh, L[0]); c.px(x, y, L[1]); c.px(x + 1, y, L[1]); }
        else c.px(x, y + (lh >> 1), T[2]);
      }
      if (front && o.popups) for (const f of [0.06, 0.74]) { const [x, y] = E(f, zf(0)).map(Math.round), w = Math.round(back * 0.2); c.rect(x, y - 4, w, 4, P[3]); c.rect(x + 1, y - 3, w - 2, 3, L[1]); c.hline(x, y - 4, w, P[5]); }
      row(zf(0.3), zf(0.36), P[3]);
      row(zf(0.36), zf(0.4), T[0]);
      row(zf(0.62), zf(0.66), T[2]);
      row(zf(0.8), zf(0.84), T[2]);
      row(zf(0.94), zf(1), T[0]);
      const pw = Math.min(12, Math.max(5, Math.round(back * 0.26))), ph = o.plate && back >= 34 ? 7 : Math.max(3, Math.min(5, Math.round(span * H * 0.22)));
      const [px0, py0] = E(0.62, zf(0.42)).map(Math.round);
      c.rect(px0 - (pw >> 1), py0, pw, ph, M[2]); c.box(px0 - (pw >> 1), py0, pw, ph, T[0]);
      if (o.plate && pw >= 11 && ph >= 7 && s >= 1.5) c.text(px0 - (pw >> 1) + 2, py0 + 1, String(o.plate).slice(0, 2), T[0]);
      else c.rect(px0 - (pw >> 1) + 2, py0 + (ph >> 1), pw - 4, 1, T[2]);
      if (!front) { const [ex, ey] = E(0.2, zf(0.7)).map(Math.round); c.rect(ex, ey, 4, 2, M[1]); c.rect(ex + 1, ey, 2, 1, T[0]); }
      if (o.spoiler && !front) { c.poly(q(E(0, endZ + 0.1), E(1, endZ + 0.1), E(1, endZ + 0.06), E(0, endZ + 0.06)), P[4]); c.vline(...q(E(0.1, endZ + 0.06)), 2, P[2]); c.vline(...q(E(0.9, endZ + 0.06)), 2, P[2]); }
    }

    // --- near side: body, then greenhouse with inset glass
    c.poly(q(...belt.map((p) => N(...p)), N(1, low), N(0.012, low)), P[3]);
    c.poly(q(...roof.map((p) => N(...p))), P[4]);
    const inset = Math.max(1, Math.round(1.2 * s)), last = roof.length - 1;
    const gl = roof.map(([t, z], i) => {
      const [x, y] = N(t, z);
      return i === 0 ? [x + inset * 2.5, y - 0.5] : i === last ? [x - inset * 2.5, y - 0.5] : [x + (i === 1 ? inset * 1.5 : -inset * 1.5), y + inset + 0.5];
    });
    const glassPoly = q(...gl);
    c.poly(glassPoly, G[0]);
    c.clip(glassPoly, () => {
      const x0 = Math.min(...gl.map((p) => p[0])), x1 = Math.max(...gl.map((p) => p[0])), yt = Y(1), w = x1 - x0, hh = yBelt - yt;
      c.rect(x0, yt + hh * 0.5, w, hh * 0.55, G[1]);                        // far windows, seen through the car
      for (const k of front ? [0.3, 0.62] : [0.38, 0.7]) c.ellipse(Math.round(x0 + w * k), Math.round(yBelt - hh * 0.18), Math.max(1, Math.round(w * 0.06)), Math.max(2, Math.round(hh * 0.3)), G[0]);   // seats
      c.poly(q([x0 + w * 0.16, yBelt], [x0 + w * 0.34, yt], [x0 + w * 0.46, yt], [x0 + w * 0.28, yBelt]), G[2]);
      c.poly(q([x0 + w * 0.6, yBelt], [x0 + w * 0.78, yt], [x0 + w * 0.83, yt], [x0 + w * 0.65, yBelt]), G[3]);
      c.rect(Math.round(X(bp)), yt, Math.max(1, Math.round(1.5 * s)), hh + 1, P[2]);   // B pillar
      if (B.doors === 4) c.rect(Math.round(X(bp + (front ? -0.17 : 0.17))), yt, 1, hh + 1, T[0]);
    });
    c.line(...q(N(...roof[1]), N(...roof[last - 1])), P[5]);                // roof edge highlight
    c.line(...q([N(...roof[1])[0] - 1, N(...roof[1])[1] + 1], [N(...roof[last - 1])[0] + 1, N(...roof[last - 1])[1] + 1]), P[4]);
    c.hline(Math.round(X(roofA[0])), Math.round(yBelt), Math.round(X(roofB[0]) - X(roofA[0])), T[0]);

    // --- body tones: sky on the shoulder, body colour, ground shade below the crease
    const band = (from, to, y0, y1) => c.recolor({ [from]: to }, [0, Math.round(y0), Math.round(X(1)), Math.max(1, Math.round(y1) - Math.round(y0))]);
    band(P[3], P[5], Y(zb(0)) - 1, yBelt + 1);
    band(P[3], P[4], yBelt + 1, yBelt + Math.max(2, hBody * 0.32));
    band(P[3], P[2], yBelt + hBody * 0.66, ySill + 1);
    band(P[2], P[4], yBelt + hBody * 0.66, yBelt + hBody * 0.66 + 1);       // crease line
    // --- sill, skirts and underside: dark, with one lighter lip
    c.poly(q(N(0, sill), N(1, sill), N(1, low), N(0.012, low)), T[1]);
    c.hline(Math.round(X(0)), Math.round(ySill), Math.round(side), P[2]);
    c.hline(Math.round(X(0.012)), Math.round((ySill + yLow) / 2), Math.round(side * 0.988), T[2]);
    c.rect(Math.round(X(0.012)), Math.round(yLow) - 2, Math.round(side * 0.988), 2, T[0]);
    // hidden end: a lamp wrapping round the corner
    c.rect(Math.round(X(0)), Math.round(Y(zb(0)) + 2), 2, Math.max(2, Math.round(hBody * 0.3)), L2[0]);
    c.px(Math.round(X(0)), Math.round(Y(zb(0)) + 2), L2[1]);

    // --- seams: doors, fuel flap, handle, mirror
    const seam = (t) => c.vline(Math.round(X(t)), Math.round(yBelt) + 2, Math.round(ySill - yBelt) - 2, P[2]);
    const lead = front ? roofB[0] - 0.07 : roofA[0] + 0.07;                 // door's leading edge, by the A pillar
    const trail = bp + (front ? -1 : 1) * (B.doors === 4 ? 0.17 : 0.03);
    seam(lead); seam(bp + (front ? -1 : 1) * (B.doors === 4 ? 0.01 : 0.03));
    if (B.doors === 4) seam(trail);
    const hy = Math.round(yBelt + Math.max(3, hBody * 0.3)), hw = Math.max(2, Math.round(3 * s));
    c.rect(Math.round(X(trail + (front ? 0.02 : -0.06))), hy, hw, 1, T[0]);
    if (B.doors === 4) c.rect(Math.round(X(bp + (front ? 0.03 : -0.06))), hy, hw, 1, T[0]);
    const tailAxle = front ? axles[0] : axles[1];
    c.ring(Math.round(X(tailAxle + (front ? -0.1 : 0.1))), Math.round(yBelt + hBody * 0.34), 1, P[2]);   // fuel flap
    if (o.mirror !== false) { const mx = Math.round(X(front ? roofB[0] - 0.05 : roofA[0] + 0.03)), my = Math.round(yBelt) - 2; c.rect(mx, my, 3, 2, P[2]); c.px(mx + (front ? 2 : 0), my, P[5]); }
    if (o.stripe) c.recolor({ [P[2]]: o.stripe, [P[3]]: o.stripe }, [0, Math.round(yBelt + hBody * 0.76), Math.round(X(1)), Math.max(1, Math.round(s * 2))]);

    // --- wheels in their arches
    const cam = o.camber ?? 0, ar = Math.round(rx + 1);
    for (const t of axles) {
      const cx = Math.round(X(t)), cy = base - R;
      c.clip([cx - ar - 1, cy - R - 2, ar * 2 + 3, R + 2], () => c.ellipse(cx, cy, ar, R + 1, T[0]));
      c.rect(cx - Math.round(rx), cy, Math.round(rx) * 2 + 1, R, T[0]);
    }
    for (const t of axles) {
      c.wheel(Math.round(X(t)), base - R, R, {
        rx, tilt: cam, depth: Math.round(Math.max(0, wid * 0.08 * sn)), wall: Math.max(1, Math.round(R * (o.tyre ?? 0.14))),
        dish: yaw > 0.3 ? Math.max(1, Math.round(R * 0.25)) : 0, spokes: 5, spokeW: Math.max(1.2, R * 0.24), angle: o.spin ?? -90,
        tire: T[0], lip: M[2], barrel: T[2], spoke: M[0], gap: T[0], hub: T[2], ...(o.rim ?? {}),
      });
    }
    for (const t of axles) {                                                // arch lip: a light edge over each wheel
      const cx = Math.round(X(t)), cy = base - R;
      for (let x = -ar; x <= ar; x++) {
        const y = cy - Math.round((R + 1) * Math.sqrt(Math.max(0, 1 - (x / (ar + 0.5)) ** 2)));
        if (c.is(cx + x, y - 1, P.join(""))) c.px(cx + x, y - 1, P[4]);
      }
    }
  };

  const opts = { w: W, h: base + 1 };
  if (o.k) opts.outline = o.k;
  if (o.facing === "left") opts.flip = "x";
  sprite(name, opts, draw);
}
