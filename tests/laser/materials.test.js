/* ============================================================================
   materials.test.js — js/laser/ui/materials.js: the physical colours of the
   media and the beams (docs/laser-plan.md, stage 10c; docs/laser-physics.md
   §5.10, §11.5), and that each can be seen on both themes.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine } = require("./helpers.js");
const { createBrowser, THEMES, themeVariables } = require("./fake-browser.js");

const browser = createBrowser();
browser.load("js/laser/ui/materials.js");
const M = browser.window.LaserUI.materials;
const engine = loadEngine();
const NM = 1e-9;

// The bench's box is one plain colour, --laser-bg (bg2 kept so the checks below stay as they are).
const VARIABLES = themeVariables();
const BACKGROUNDS = THEMES.map((theme) => ({
  theme: theme, bg: VARIABLES[theme]["--laser-bg"], bg2: VARIABLES[theme]["--laser-bg"]
}));

function hex(color) {
  return /^#[0-9a-f]{6}$/.test(color);
}

test("loads as LaserUI.materials, frozen, every medium's look", () => {
  assert.ok(Object.isFrozen(M) && Object.isFrozen(M.MEDIA));
  for (const [id, medium] of Object.entries(M.MEDIA)) {
    assert.ok(Object.isFrozen(medium), id);
    assert.ok(["rod", "liquid", "gas"].includes(medium.look), id);
    assert.ok(hex(medium.body), id + ": " + medium.body);
  }
  // Every medium the bench can run, except the symbolic two-level atom.
  const runnable = engine.media.list().filter((id) => engine.bench.pumpsFor(id).length > 0);
  for (const id of runnable) {
    if (id === "two-level") assert.equal(M.MEDIA[id], undefined, "symbolic: the theme's colours");
    else assert.ok(M.MEDIA[id], id + " has a look");
  }
  assert.deepEqual(Object.keys(M.MEDIA).map((id) => M.MEDIA[id].look),
    ["rod", "rod", "rod", "rod", "liquid", "gas", "gas", "gas"]);
});

test("visible(λ): Bruton's colours at their corners, dimmed at the ends of sight, null outside 380–780 nm", () => {
  const close = (a, b) => Math.abs(a - b) < 1e-12;
  const at = (nm) => M.visible(nm * NM);
  assert.deepEqual(Object.values(at(440)), [0, 0, 1], "blue");
  assert.deepEqual(Object.values(at(510)), [0, 1, 0], "green");
  assert.deepEqual(Object.values(at(580)), [1, 1, 0], "yellow");
  assert.deepEqual(Object.values(at(645)), [1, 0, 0], "red");
  const ruby = at(694.3);
  assert.ok(close(ruby.r, 1) && ruby.g === 0 && ruby.b === 0, "ruby: deep red");
  const edge = at(760);
  assert.ok(edge.r < 0.6 && edge.r > 0.3, "dimmed near 780 nm: " + edge.r);
  assert.ok(at(390).b < 0.6, "dimmed near 380 nm");
  for (const nm of [379, 781, 1064, 10600, 300]) assert.equal(at(nm), null, nm + " nm");
  // Never NaN, never outside 0..1, anywhere in sight.
  for (let nm = 380; nm <= 780; nm += 0.5) {
    for (const c of Object.values(at(nm))) assert.ok(c >= 0 && c <= 1, nm + " nm: " + c);
  }
});

test("beam(λ): each bench's beam in its colour, or the infrared's false colour, marked invisible", () => {
  const expected = {
    "ruby": true, "he-ne": true, "ar-ion": true, "dye-r6g": true,
    "nd-yag": false, "nd-glass": false, "co2": false, "ti-sapphire": false
  };
  for (const [id, seen] of Object.entries(expected)) {
    const b = M.beam(engine.media.get(id).lam);
    assert.equal(b.visible, seen, id);
    assert.ok(hex(b.color), id + ": " + b.color);
    if (!seen) assert.equal(b.color, M.INFRARED, id);
  }
  assert.equal(M.beam(632.8 * NM).color, "#ff4300", "He-Ne: red with a little orange");
  // Which side of sight: the words under an invisible beam say it.
  assert.equal(M.beam(1064 * NM).band, "infrared");
  assert.equal(M.beam(347 * NM).band, "ultraviolet", "ruby's second harmonic");
  assert.equal(M.beam(500 * NM).band, "visible");
  // The false colour is off the spectrum: more red than blue, with blue in
  // it. No visible wavelength gives that (the review: a violet beam came
  // close to the first false colour).
  const off = (rgb) => rgb.r > rgb.b + 0.15 && rgb.b > 0.3;
  const hexToRgb = (h) => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 });
  assert.ok(off(hexToRgb(M.INFRARED)), "the false colour is off the spectrum");
  for (let nm = 380; nm <= 780; nm += 1) assert.ok(!off(hexToRgb(M.beam(nm * NM).color)), nm + " nm is not like the false colour");
  assert.equal(M.beam(514.5 * NM).color, "#1cff00", "Ar⁺ 514.5 nm: green");
});

test("the intro tour's candle, its amber light and the lens: frozen colours", () => {
  assert.ok(Object.isFrozen(M.CANDLE));
  for (const colour of Object.values(M.CANDLE).concat([M.AMBER, M.LENS_GLASS])) assert.ok(hex(colour), colour);
  // Ordinary light is never the laser's red: its hue is far from ruby's beam.
  assert.notEqual(M.AMBER, M.beam(694.3 * NM).color);
});

test("readable(): every physical colour stands out on both themes' bench, the same hue", () => {
  const colours = Object.values(M.MEDIA).map((m) => m.body).concat([M.GLASS, M.INFRARED, M.AMBER, M.CANDLE.edge, M.CANDLE.base]);
  for (let nm = 380; nm <= 780; nm += 5) colours.push(M.beam(nm * NM).color);
  for (const { theme, bg, bg2 } of BACKGROUNDS) {
    for (const colour of colours) {
      const seen = M.readable(colour, bg);
      assert.ok(hex(seen), seen);
      assert.ok(M.contrast(seen, bg) >= 3, theme + ": " + colour + " → " + seen + " on --bg");
      assert.ok(M.contrast(seen, bg2) >= 3, theme + ": " + colour + " → " + seen + " on --bg-2");
    }
  }
  // A colour that already stands out is left as it is.
  assert.equal(M.readable("#ff4e00", "#070b1a"), "#ff4e00");
  // Darkened on the light theme, lightened on the dark one.
  assert.ok(M.contrast(M.readable("#ffff00", "#ffffff"), "#000000") < M.contrast("#ffff00", "#000000"), "darker on light");
  // A background it cannot read: the colour as it was.
  assert.equal(M.readable("#123456", "var(--bg)"), "#123456");
  // A mid-grey background: towards black, which stands out more there
  // than white (the review: below a luminance of 0.5 it went to white and
  // stopped under the target).
  const grey = M.readable("#b44fd8", "#999999");
  assert.ok(M.contrast(grey, "#999999") >= M.MIN_CONTRAST, grey);
  // The same answer when asked again.
  assert.equal(M.readable("#b44fd8", "#999999"), grey);
});

test("contrast(): WCAG's ratio; the colour forms it reads", () => {
  assert.equal(M.contrast("#000000", "#ffffff"), 21);
  assert.equal(M.contrast("#fff", "rgb(255, 255, 255)"), 1);
  assert.equal(M.contrast("rgba(0, 0, 0, 0.5)", "#ffffff"), 21, "the alpha is ignored");
  assert.equal(M.contrast("teal", "#ffffff"), 1, "a name it does not read");
});

test("the highlight and the shade, drawn over a rod, stand out on every rod's colour", () => {
  for (const [id, m] of Object.entries(M.MEDIA)) {
    if (m.look !== "rod") continue;
    assert.ok(M.contrast(M.HIGHLIGHT, m.body) >= 1.5, id + ": the highlight on " + m.body);
    assert.ok(M.contrast(M.SHADE, m.body) >= 1.5, id + ": the shade on " + m.body);
  }
});
