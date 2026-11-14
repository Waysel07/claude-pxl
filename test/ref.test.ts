import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeRef, compareStyle, detectScale } from "../src/core/ref.ts";
import { toHex } from "../src/core/color.ts";
import { decodePng, encodePng } from "../src/node/png.ts";
import { loadSource } from "../src/node/load.ts";

const ART = 'pal({ k: "#1b1630", w: "#fff8ea" }); ramp("12345", "#5aa64b"); ramp("abcde", "#d8503f"); '
  + 'sprite("orb", { w: 24, h: 24, outline: "k" }, circ(12, 12, 10, "3"), form({ lo: 2 }), rect(9, 9, 2, 2, "w")); '
  + 'sprite("soft", { w: 24, h: 24, outline: "k", selout: true }, circ(12, 12, 10, "c"), form({ lo: 2 })); ';
const built = (name: string) => loadSource(ART).image(name);

test("png: decode round-trips what encode writes (indexed and RGBA)", () => {
  const img = built("orb"), back = decodePng(encodePng(img));
  assert.deepEqual([back.w, back.h], [img.w, img.h]);
  assert.deepEqual([...back.data], [...img.data]);
  const big = img.scale(1);
  for (let i = 0; i < 300; i++) big.data[i] = ((i * 2654435761) | 255) >>> 0; // > 256 colors forces RGBA
  assert.deepEqual([...decodePng(encodePng(big)).data], [...big.data]);
  assert.throws(() => decodePng(Buffer.from("not a png")), /not a PNG/);
});

test("ref: finds the native scale of an upscaled image and removes a flat background", () => {
  const img = built("orb");
  assert.equal(detectScale(img.scale(6)), 6);
  assert.equal(detectScale(img), 1);
  const onBg = img.scale(4);
  for (let i = 0; i < onBg.data.length; i++) if (!onBg.data[i]) onBg.data[i] = 0xc9b6eeff;
  const r = analyzeRef(onBg);
  assert.equal(r.scale, 4);
  assert.equal(toHex(r.bg!), "#c9b6ee");
  assert.deepEqual([r.img.w, r.img.h], [img.w, img.h]);
  assert.deepEqual([...r.img.data], [...img.data]);
});

test("ref: palette comes back keyed, with the outline as k and shades grouped into dark -> light ramps", () => {
  const r = analyzeRef(built("orb"));
  assert.equal(toHex(r.pal.keys.get("k")!), "#1b1630");
  assert.equal(r.ramps.length, 1);
  assert.ok(r.ramps[0].length >= 3);
  assert.match(r.code, /^pal\(\{/);
  assert.match(r.code, /ramps\("/);
  // The emitted code is a valid art-file prelude.
  loadSource(r.code + '\nsprite("x", "k")').image("x");
});

test("ref: style brief reads outline, light direction and shading", () => {
  const dark = analyzeRef(built("orb")), sel = analyzeRef(built("soft"));
  assert.equal(dark.style.outline, "dark");
  assert.equal(sel.style.outline, "selective");
  assert.equal(dark.style.light, "tl");
  assert.ok(dark.style.dither < 0.02);
  assert.ok(dark.brief.some((l) => /outline: "k", no selout/.test(l)));
  assert.ok(sel.brief.some((l) => /selout: true/.test(l)));
  assert.ok(dark.brief.some((l) => /from: "tl"/.test(l)));
});

test("ref: busy images are reduced to their main colors", () => {
  const img = built("orb").scale(1);
  for (let i = 0; i < img.data.length; i++) if (img.data[i]) img.data[i] = (img.data[i] ^ ((i % 3) << 9)) >>> 0; // jpeg-like noise
  const r = analyzeRef(img, { colors: 8 });
  assert.ok(r.unique > 8);
  assert.ok(r.colors.length <= 8);
  assert.ok(r.brief.some((l) => /reduced to its/.test(l)));
});

test("ref: compareStyle says what matches and what differs", () => {
  const ref = analyzeRef(built("orb"));
  const same = compareStyle(built("orb"), ref);
  assert.ok(same.every((l) => l.startsWith("ok")), same.join("\n"));
  const other = compareStyle(built("soft"), ref);
  assert.ok(other.some((l) => /^differs palette/.test(l)));
  assert.ok(other.some((l) => /^differs outline/.test(l)));
});
