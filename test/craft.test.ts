import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deltaE, parseHex, toOklch, fromOklch } from "../src/core/color.ts";
import { lintImage, lintPalette } from "../src/core/lint.ts";
import { makeRamp } from "../src/core/ramp.ts";
import { review } from "../src/core/render.ts";
import { loadSource } from "../src/node/load.ts";
import { writeOutputs } from "../src/node/output.ts";
import { PAL, art, failure } from "./helpers.ts";

const eq = (a: unknown, b: unknown, msg?: string) => assert.equal(a, b, msg);
const RAMP = 'pal({ k: "#1b1630" }); ramp("12345", "#5aa64b"); ';

test("oklch round-trips and stays in gamut", () => {
  for (const hex of ["#5aa64b", "#d9483b", "#000000", "#ffffff", "#3b7dd8"]) {
    const c = parseHex(hex)!, [L, C, h] = toOklch(c);
    assert.ok(deltaE(c, fromOklch(L, C, h)) < 0.005, hex);
  }
  assert.ok(toOklch(fromOklch(0.6, 0.9, 140))[1] < 0.35); // impossible chroma is pulled in
});

test("ramp: even dark -> light steps, base kept, hue shifts cool in shadow and warm in light", () => {
  const base = parseHex("#5aa64b")!, r = makeRamp(base, 5);
  eq(r[2], base);
  const lch = r.map(toOklch);
  for (let i = 1; i < 5; i++) assert.ok(lch[i][0] - lch[i - 1][0] >= 0.045, `step ${i}`);
  assert.ok(lch[0][2] > lch[2][2] && lch[4][2] < lch[2][2]); // green: shadows toward teal, lights toward yellow
  const flat = makeRamp(base, 5, { shift: 0 }).map(toOklch);
  assert.ok(Math.abs(flat[0][2] - flat[4][2]) < 3);
  eq(makeRamp(base, 4, { at: 0 })[0], base);
  eq(lintPalette(loadSource(RAMP + 'ramp("abcd", "#f2c230"); ramp("vwxyz", "#888")').pal).length, 0);
});

test("ramp() defines keys, registers the ramp and validates", () => {
  eq(art(RAMP + 'sprite("a", "333", shade([0, 0, 1, 1]), light([2, 0, 1, 1]))', "a"), "234");
  assert.match(failure(RAMP + 'ramp("aa", "#fff")').message, /distinct keys/);
  assert.match(failure(RAMP + 'ramp("jk", "#fff")').message, /'k' already defined/);
  // The base is always the middle key; a light base still gets distinct highlights.
  eq(loadSource('ramp("abcde", "#e9b83a")').pal.table().c, "#e9b83a");
  eq(lintPalette(loadSource('ramp("abcde", "#e9b83a")').pal).length, 0);
  assert.match(failure(RAMP + 'ramp("ab", "#fff", { shft: 1 })').message, /did you mean 'shift'/);
});

test("form shades a disc in bands: light toward the source, dark away, in palette", () => {
  const rows = art(RAMP + 'sprite("a", { w: 15, h: 15 }, circ(7, 7, 7, "3"), form({ lo: 2 }))', "a").split("\n");
  const all = rows.join("");
  assert.ok(!all.includes("?"));
  for (const k of "1234") assert.ok(all.includes(k), `band ${k}`);
  eq(rows[7][7], "3");                       // facing the viewer: base color
  eq(rows[4][4], "4");                       // toward the top-left light
  eq(rows[12][12], "1");                     // far side: core shadow
  const flipped = art(RAMP + 'sprite("a", { w: 15, h: 15 }, circ(7, 7, 7, "3"), form({ from: "br", lo: 2 }))', "a").split("\n");
  eq(flipped[10][10], "4");
  eq(flipped[2][2], "1");
});

test("form: keys, bevel, asset option after mirroring", () => {
  const a = art(RAMP + 'sprite("a", { w: 12, h: 12 }, rect(0, 0, 12, 12, "k"), rect(1, 1, 10, 10, "3"), form({ on: "3", shape: "bevel", w: 2 }))', "a").split("\n");
  eq(a[0], "kkkkkkkkkkkk");
  eq(a[1][5], "4");
  eq(a[10][5], "2");
  eq(a[5][5], "3");
  // As an asset option the light is applied after mx, so the two halves differ.
  const m = art(RAMP + 'sprite("a", { w: 14, h: 14, mx: true, form: true }, circ(7, 7, 6, "3"))', "a").split("\n");
  assert.notEqual(m[4].slice(0, 7), [...m[4].slice(7)].reverse().join(""));
  assert.match(failure(RAMP + 'sprite("a", { w: 4, h: 4, form: { frm: "tl" } }, rect(0, 0, 4, 4, "3"))').message, /did you mean 'from'/);
  assert.match(failure(RAMP + 'sprite("a", { w: 4, h: 4 }, rect(0, 0, 4, 4, "3"), form({ from: "up" }))', "a").message, /form from must be/);
});

test("form: shapes running off a scene are not shaded along the canvas border", () => {
  const src = (kind: string, extra = "") => RAMP + `${kind}("a", { w: 24, h: 12 }, blob([0, 12, 0, 6, 12, 2, 24, 6, 24, 12], "3"), form({ from: "t"${extra} }))`;
  const scene = art(src("scene"), "a").split("\n"), sprite = art(src("sprite"), "a").split("\n");
  assert.ok(sprite[11].includes("2") && !scene[11].includes("2"));
  eq(art(src("sprite", ", bleed: true"), "a"), scene.join("\n"));
});

test("selout tints the outline from the color it touches", () => {
  eq(art(RAMP + 'sprite("a", { outline: "k", selout: true }, "35")', "a"), ".12.\n1352\n.12."); // highlights: capped at the 2nd-darkest
  eq(art(RAMP + 'sprite("a", { outline: "k", selout: 1 }, "31")', "a"), ".2k.\n231k\n.2k."); // darkest shade keeps the outline color
  assert.match(failure(RAMP + 'sprite("a", { selout: true }, "3")').message, /needs an outline/);
});

test("curve is pixel-perfect and passes through its points", () => {
  const rows = art(PAL + 'sprite("a", { w: 12, h: 8 }, curve([0, 7, 5, 0, 11, 7], "r"))', "a").split("\n");
  eq(rows[7][0], "r"); eq(rows[0][5], "r"); eq(rows[7][11], "r");
  // No pixel has both a horizontal and a vertical neighbour on the stroke (no "L" corners).
  const on = (x: number, y: number) => rows[y]?.[x] === "r";
  for (let y = 0; y < 8; y++) for (let x = 0; x < 12; x++)
    if (on(x, y)) assert.ok(!((on(x - 1, y) || on(x + 1, y)) && (on(x, y - 1) || on(x, y + 1)) && !(on(x - 1, y) && on(x + 1, y)) && !(on(x, y - 1) && on(x, y + 1))), `L at ${x},${y}`);
  eq(art(PAL + 'sprite("a", { w: 4, h: 1 }, curve([0, 0, 3, 0], "r"))', "a"), "rrrr");
});

test("blob fills a smooth closed shape", () => {
  const rows = art(PAL + 'sprite("a", { w: 12, h: 12 }, blob([1, 6, 6, 1, 11, 6, 6, 11], "r"))', "a").split("\n");
  eq(rows[6][6], "r");
  eq(rows[0][0], ".");
  const n = rows.join("").split("r").length - 1;
  assert.ok(n > 50 && n < 100, `area ${n}`); // rounder than the 50px diamond through the same points
  assert.match(failure(PAL + 'sprite("a", { w: 4, h: 4 }, blob([0, 0, 1, 1], "r"))', "a").message, /at least 3 points/);
});

test("lint: stray pixels, twin colors, flat areas; clean art stays quiet", () => {
  const img = (src: string) => { const p = loadSource(src); return lintImage(p.image("a"), p.assets.get("a")!.pal); };
  eq(img(RAMP + 'sprite("a", { w: 20, h: 20 }, circ(10, 10, 9, "3"), form())').length, 0);
  assert.match(img(RAMP + 'sprite("a", { w: 20, h: 20 }, circ(10, 10, 9, "3"))')[0], /'3' is flat/);
  assert.match(img(RAMP + 'sprite("a", { w: 16, h: 16 }, rect(0, 0, 16, 16, "3"), form(), noise(0, 0, 16, 16, "k", 0.08, 2))').join(), /stray single pixels/);
  assert.match(img('pal({ a: "#5aa64b", b: "#5ba74c" }); sprite("a", "aabb\\naabb")').join(), /nearly identical/);
  assert.match(lintPalette(loadSource('pal({ a: "#205020", b: "#40a040", c: "#80ff80" }); ramps("abc")').pal).join(), /no hue shift/);
  assert.match(lintPalette(loadSource('pal({ a: "#40a040", b: "#205020" }); ramps("ab")').pal).join(), /darker than/);
});

test("review sheet and build hints", () => {
  const p = loadSource(RAMP + 'sprite("a", { w: 20, h: 20 }, circ(10, 10, 9, "3"))');
  const r = review(p.image("a"));
  assert.ok(r.w > 20 * 4 && r.h > 20);
  const out = mkdtempSync(join(tmpdir(), "pxl-"));
  const res = writeOutputs(p, out);
  assert.ok(res.lines.some((l) => l.startsWith("  hint: '3' is flat")));
  assert.ok(!writeOutputs(p, out, { hints: false }).lines.some((l) => l.includes("hint")));
  assert.ok(existsSync(join(out, "sprites", "a.png")));
});
