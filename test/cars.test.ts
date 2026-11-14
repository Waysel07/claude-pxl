import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeGif, encodeGif } from "../src/node/gif.ts";
import { loadSource } from "../src/node/load.ts";
import { art, failure } from "./helpers.ts";

const PALS = 'pal({ k: "#020304", t: "#050606", T: "#1b1d1f", u: "#34383a", m: "#5b5e62", M: "#959fa8", n: "#dfe5ea", g: "#101314", G: "#262b30", h: "#465052", H: "#73808c" }); '
  + 'ramp("123456", "#8c9aa8", { at: 3 }); ramps("tTu", "mMn", "gGhH"); ';
const KIT = 'include("pxl:cars"); ' + PALS + 'const kit = { paint: "123456", glass: "gGhH", trim: "tTu", metal: "mMn" }; ';

test("wheel: tire ring, lip, spokes; squashed and spun versions differ", () => {
  const w = art(PALS + 'sprite("w", { w: 13, h: 13 }, wheel(6, 6, 6, { tire: "t", lip: "n", spoke: "M", gap: "T", hub: "m" }))', "w").split("\n");
  assert.equal(w[0].trim().replace(/\./g, "")[0], "t");           // tire on the outside
  assert.ok(w.join("").includes("n") && w.join("").includes("M") && w.join("").includes("T"));
  assert.equal(w[6][6], "m");                                      // hub in the middle
  const p = loadSource(PALS + 'sprite("a", { w: 13, h: 13 }, wheel(6, 6, 6, { tire: "t", lip: "n", spoke: "M", gap: "T" })); '
    + 'sprite("b", { w: 13, h: 13 }, wheel(6, 6, 6, { tire: "t", lip: "n", spoke: "M", gap: "T", angle: 36 })); '
    + 'sprite("c", { w: 13, h: 13 }, wheel(6, 6, 6, { rx: 3, tire: "t", lip: "n", spoke: "M", gap: "T" }))');
  assert.notEqual(p.image("a").hash(), p.image("b").hash());
  const cols = (n: string) => { const b = p.image(n).bounds()!; return b.w; };
  assert.ok(cols("c") < cols("a"));
  assert.match(failure(PALS + 'sprite("x", { w: 9, h: 9 }, wheel(4, 4, 4, {}))', "x").message, /wheel needs colors/);
});

test("reflect: mirrors below the line, darker along the ramps, skipping keys", () => {
  const src = PALS + 'sprite("r", { w: 3, h: 6 }, rect(0, 0, 3, 6, "t"), "MnM\\nnMn\\nuuu", reflect(3, { skip: "t" }))';
  assert.equal(art(src, "r"), "MnM\nnMn\nuuu\nTTT\nMmM\nmMm");
  const half = art(PALS + 'sprite("r", { w: 2, h: 6 }, "nn\\nMM\\nnn\\nMM", reflect(4, { squash: 0.5, shade: 0 }))', "r");
  assert.equal(half, "nn\nMM\nnn\nMM\nMM\nMM");
});

test("car kit: every body builds front, rear and side, in the given palette", () => {
  const bodies = ["coupe", "hatch", "sedan", "wagon", "wedge", "kei"];
  const p = loadSource(KIT + bodies.map((b) => `car("${b}_f", { ...kit, body: "${b}" }); car("${b}_r", { ...kit, body: "${b}", view: "rear" }); car("${b}_s", { ...kit, body: "${b}", yaw: 0 });`).join(" "));
  const allowed = new Set([...p.pal.keys.values()]);
  for (const b of bodies)
    for (const v of ["f", "r", "s"]) {
      const img = p.image(`${b}_${v}`);
      assert.ok(img.w > 60 && img.h > 25, `${b}_${v} ${img.w}x${img.h}`);
      for (const c of img.data) if (c) assert.ok(allowed.has(c), `${b}_${v} left the palette`);
    }
  assert.ok(p.image("coupe_s").w < p.image("coupe_f").w + 40);
  assert.notEqual(p.image("coupe_f").hash(), p.image("coupe_r").hash());
});

test("car kit: options, custom bodies and clear errors", () => {
  const p = loadSource(KIT + 'car("a", kit); car("b", { ...kit, facing: "left", scale: 0.5, camber: 2 }); '
    + 'car("c", { ...kit, body: { roof: [[0.33, 0.62], [0.415, 1], [0.86, 0.98], [0.97, 0.63]] } })');
  assert.ok(p.image("b").w < p.image("a").w * 0.7);
  assert.notEqual(p.image("a").hash(), p.image("c").hash());
  assert.match(failure(KIT + 'car("x", { ...kit, body: "boat" })').message, /unknown body 'boat'/);
  assert.match(failure(KIT + 'car("x", { ...kit, paint: "12" })').message, /paint must be 6 keys/);
  assert.match(failure('include("pxl:planes")').message, /unknown kit "pxl:planes" \(have: pxl:cars\)/);
});

test("gif: decode reads back what encode wrote", () => {
  const p = loadSource(PALS + 'anim("a", { w: 6, h: 4, frames: 3, fps: 10 }, (c) => c.rect(c.frame, 0, 2, 4, "n"), rect(0, 3, 6, 1, "M"))');
  const frames = p.frames("a"), back = decodeGif(encodeGif(frames));
  assert.equal(back.length, 3);
  back.forEach((f, i) => { assert.equal(f.ms, frames[i].ms); assert.deepEqual([...f.img.data], [...frames[i].img.data]); });
  assert.throws(() => decodeGif(Buffer.from("nope")), /not a GIF/);
});
