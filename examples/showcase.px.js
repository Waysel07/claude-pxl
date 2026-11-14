// Sprite craft showcase: hue-shifted ramps, blob silhouettes, form() volume, selective outline.
pal({ k: "#1a1626", w: "#fff8ea" })
ramp("gGhHi", "#5fb04e")          // leaf green
ramp("rRsSt", "#d8503f")          // red
ramp("bBcCd", "#4a86d8")          // blue
ramp("yYzZq", "#e9b83a", { at: 3 })  // gold (light base: sit it high in the ramp)
ramp("nNoOp", "#a5653f")          // wood / leather
ramp("mMuUv", "#8d93a6")          // steel
ramp("145", "#f3e6cf", { at: 1 })   // cream

// --- items -----------------------------------------------------------------
sprite("apple", { w: 20, h: 20, outline: "k", selout: true },
  blob([3,9, 6,4, 10,5, 14,4, 17,9, 15,16, 10,18, 5,16], "s"),
  form({ lo: 2 }),
  line(10, 5, 11, 1, "N"), blob([11,2, 14,0, 17,1, 14,4], "h"))

sprite("potion", { w: 18, h: 22, outline: "k", selout: true },
  circ(9, 14, 7, "c"), rect(7, 3, 4, 6, "C"),
  form({ on: "cC", lo: 2 }),
  rect(6, 1, 6, 2, "o"), hline(6, 1, 6, "O"),
  px(6, 11, "w"), px(5, 12, "w"), px(6, 12, "d"))

sprite("coin", { w: 16, h: 16, outline: "k", selout: true },
  circ(8, 8, 6, "Z"), form({ lo: 2 }), ring(8, 8, 4, "Y"), rect(8, 6, 1, 5, "Y"), px(5, 5, "q"), px(6, 4, "q"))

sprite("sword", { w: 24, h: 24, outline: "k", selout: true },
  line(7, 16, 19, 4, "u", 3), line(8, 16, 20, 4, "U"), px(20, 3, "v"), line(7, 15, 18, 4, "M"),
  line(4, 13, 10, 19, "z", 2), line(3, 20, 6, 17, "o", 2), circ(2, 21, 1, "Y"))

sprite("shield", { w: 20, h: 22, outline: "k", selout: true },
  blob([2,2, 10,0, 18,2, 18,11, 10,21, 2,11], "c"),
  form({ lo: 2 }),
  rect(9, 2, 2, 17, "Z"), rect(4, 7, 12, 2, "Z"), vline(10, 3, 15, "z"), hline(5, 8, 10, "z"))

// --- creatures -------------------------------------------------------------
sprite("slime", { w: 26, h: 18, outline: "k", selout: true },
  blob([1,17, 2,9, 7,2, 13,0, 19,2, 24,9, 25,17], "h"),
  form({ lo: 2 }),
  rect(8, 8, 2, 4, "k"), rect(16, 8, 2, 4, "k"), px(8, 8, "w"), px(16, 8, "w"),
  hline(12, 13, 2, "k"), px(11, 12, "k"), px(14, 12, "k"),
  px(5, 6, "i"), px(6, 5, "i"), px(7, 4, "i"))

sprite("fish", { w: 34, h: 20, outline: "k", selout: true },
  blob([26,10, 33,3, 31,10, 33,17], "S"),                       // tail
  blob([12,5, 17,0, 22,5], "S"), blob([13,15, 16,19, 20,15], "S"),  // fins
  blob([1,10, 6,5, 15,3, 24,6, 28,10, 24,14, 15,17, 6,15], "s"),
  form({ on: "sS", lo: 2 }),
  rect(5, 7, 3, 3, "w"), rect(6, 8, 2, 2, "k"), curve([10,6, 12,10, 10,14], "R"))

sprite("mushroom", { w: 22, h: 22, outline: "k", selout: true },
  blob([8,12, 14,12, 15,20, 11,21, 7,20], "4"),
  blob([1,11, 3,4, 11,0, 19,4, 21,11, 11,13], "s"),
  form({ on: "s", lo: 2 }), form({ on: "4", hi: 0 }), hline(8, 13, 6, "1"),
  circ(6, 6, 1, "w"), circ(13, 4, 2, "w"), circ(17, 9, 1, "w"))

// --- character: one light for the whole figure -----------------------------
ramp("eEfF", "#e8b48a", { at: 2 })  // skin
sprite("angler", { w: 28, h: 38, outline: "k", selout: true },
  rect(9, 28, 4, 7, "c"), rect(15, 28, 4, 7, "c"), rect(8, 34, 5, 3, "N"), rect(15, 34, 5, 3, "N"),   // legs, boots
  blob([6,17, 14,15, 22,17, 23,29, 14,30, 5,29], "Z"),                                               // coat
  blob([4,18, 7,17, 8,26, 5,27], "Z"), blob([20,17, 24,18, 23,27, 20,26], "Z"),                       // arms
  blob([8,6, 14,4, 20,6, 21,13, 14,17, 7,13], "f"),                                                   // head
  blob([4,7, 14,5, 24,7, 14,9], "z"), blob([8,6, 10,1, 18,1, 20,6], "Z"),                             // sou'wester
  form({ lo: 2 }),
  circ(5, 28, 1, "f"), circ(23, 28, 1, "f"),
  rect(11, 10, 1, 2, "k"), rect(16, 10, 1, 2, "k"), hline(12, 14, 4, "E"),
  vline(14, 18, 11, "z"), px(13, 20, "q"), px(13, 24, "q"))

sheet("showcase", ["apple", "potion", "coin", "sword", "shield", "slime", "fish", "mushroom", "angler"], { pad: 2, cols: 5 })

// Everything on one backdrop (README gallery).
scene("showcase_sprites", { w: 132, h: 76, bg: "#2b2740" },
  rect(0, 62, 132, 14, "#353050"), hline(0, 62, 132, "#423c62"),
  stamp("apple", 4, 6), stamp("potion", 30, 4), stamp("coin", 55, 8), stamp("sword", 76, 2), stamp("shield", 106, 4),
  stamp("slime", 4, 46), stamp("fish", 36, 36), stamp("mushroom", 74, 42), stamp("angler", 100, 30))
