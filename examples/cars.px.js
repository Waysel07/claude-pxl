// Cars with the built-in kit: include("pxl:cars"), one ramp per material, car(name, { ... }).
// The last asset is a rainy night banner: forest, wet road, reflection, falling rain.
include("pxl:cars")

pal({ k: "#020304" })
ramp("123456", "#8c9aa8", { at: 3, shift: 0.5 })   // silver paint
ramp("abcdef", "#c63d2f", { at: 3 })               // red paint
ramp("ABCDEF", "#2f6fc8", { at: 3 })               // blue paint
ramp("pqrsvw", "#e0b23a", { at: 3 })               // yellow paint
ramp("PQRSVW", "#3d8a5a", { at: 3 })               // green paint
ramp("ijlxyz", "#e6e3da", { at: 4 })               // white paint
pal({ g: "#101314", G: "#262b30", h: "#465052", H: "#73808c" })   // glass, dark -> light
pal({ t: "#050606", T: "#1b1d1f", u: "#34383a" })                 // tyres and black trim
pal({ m: "#5b5e62", M: "#959fa8", n: "#dfe5ea" })                 // rims and chrome
pal({ Y: "#8f0d22", Z: "#e2283c", 8: "#c9b987", 9: "#fff3c4" })   // tail lights, head lights
ramps("gGhH", "tTu", "mMn", "YZ", "89")

const kit = { glass: "gGhH", trim: "tTu", metal: "mMn", tail: "YZ", head: "89" }
car("s13", { ...kit, body: "coupe", paint: "123456", camber: 2 })
car("s13_rear", { ...kit, body: "coupe", paint: "abcdef", view: "rear", spoiler: true })
car("hatch", { ...kit, body: "hatch", paint: "ABCDEF" })
car("hatch_rear", { ...kit, body: "hatch", paint: "pqrsvw", view: "rear" })
car("sedan", { ...kit, body: "sedan", paint: "PQRSVW", tyre: 0.26 })
car("wagon", { ...kit, body: "wagon", paint: "ijlxyz", view: "rear", tyre: 0.26 })
car("wedge", { ...kit, body: "wedge", paint: "abcdef", popups: true })
car("kei", { ...kit, body: "kei", paint: "pqrsvw", tyre: 0.3 })
car("coupe_side", { ...kit, body: "coupe", paint: "123456", yaw: 0 })
// Your own body: start from a preset and change what makes the car that car.
car("shooting_brake", { ...kit, paint: "PQRSVW", camber: 1,
  body: { roof: [[0.33, 0.62], [0.415, 1], [0.86, 0.98], [0.97, 0.63]], bPillar: 0.64 } })

sheet("garage", ["s13", "s13_rear", "hatch", "hatch_rear", "sedan", "wagon", "wedge", "kei", "coupe_side", "shooting_brake"], { cols: 2, pad: 6 })

// The same cars lined up on a dark floor, for the gallery.
scene("car_lineup", { w: 340, h: 250, bg: "u" },
  (c) => {
    const names = ["s13", "s13_rear", "hatch", "hatch_rear", "sedan", "wagon", "wedge", "kei", "coupe_side", "shooting_brake"]
    names.forEach((n, i) => { const x = 8 + (i % 2) * 170, y = 6 + Math.floor(i / 2) * 49; c.rect(x - 4, y + 38, 162, 6, "T"); c.stamp(n, x, y + (n === "kei" ? -6 : 0)) })
  })

// --- rainy night banner ------------------------------------------------------
pal({ 0: "#07100c", "(": "#0c1a13", ")": "#12261b", "[": "#1a3626", "]": "#2a5540", "{": "#0d1512", "}": "#16201c", "~": "#22302b", "^": "#7f9d8d", "!": "#c8d8d0" })
ramps("0()[]", "0{}~")

const W = 260, H = 112, ROAD = 84
anim("night_rain", { w: W, h: H, frames: 8, fps: 12 },
  rect(0, 0, W, H, "0"), grad(0, 20, W, 50, "0(", "v", 0.9),
  // two rows of pines: far ones dim and small, near ones darker and taller
  (c) => {
    const r = c.rng(7)
    const pine = (x, top, h, key) => { for (let i = 0; i < h; i++) { const w = 1 + Math.floor((i % 9) * 0.7 + i * 0.22); c.hline(x - w, top + i, w * 2 + 1, key) } }
    for (let x = 4; x < W; x += 13 + Math.floor(r() * 8)) pine(x, 30 + Math.floor(r() * 14), 60, ")")
    for (let x = -4; x < W + 10; x += 22 + Math.floor(r() * 14)) pine(x, 12 + Math.floor(r() * 16), 80, "(")
  },
  // wet road, a brighter kerb line, the car and its reflection
  rect(0, ROAD, W, H - ROAD, "{"), rect(0, ROAD, W, 2, "["), hline(0, ROAD + 2, W, ")"),
  (c) => { for (let y = ROAD + 5; y < H; y += 4) c.dither(0, y, W, 1, "{", "}", 0.5) },
  stamp("s13", 62, ROAD - 40),
  (c) => c.reflect(ROAD + 2, { h: 22, squash: 0.75, shade: 2, density: 1, fade: 0.3, ripple: 1, phase: c.phase, skip: "0()[]{}", span: [56, 150] }),
  // rain: streaks falling on fixed columns, wrapping every loop
  (c) => {
    const r = c.rng(3)
    for (let i = 0; i < 70; i++) {
      const x = Math.floor(r() * W), speed = 2 + Math.floor(r() * 2), y0 = Math.floor(r() * H)
      const y = (y0 + Math.round(c.phase * H * speed)) % H
      c.vline(x, y, 2, r() < 0.3 ? "^" : "]")
      if (y > ROAD + 3 && r() < 0.5) c.hline(x - 1, y + 2, 3, "]")   // splash on the road
    }
  },
  text(W / 2, 6, "NIGHT RUN", "!", { scale: 2, align: "c", gap: 2, shadow: ")" }),
  text(W / 2, 20, "PXL CAR KIT", "^", { align: "c", gap: 1 }))
