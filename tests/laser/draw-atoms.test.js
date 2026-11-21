/* ============================================================================
   draw-atoms.test.js — js/laser/ui/draw-atoms.js: inside one atom, the
   energy levels of the chosen gain medium with a row of atoms acting the
   simulation out.

   What the tests pin is what the picture must teach: each medium that the
   bench runs has its own scheme, the engine's (ruby three levels, the
   two-level atom two, the rest four); the pump lifts atoms and they drop
   to the upper laser level; a step down with light sends a laser photon,
   without light a stray one; four levels then empty the lower level, three
   levels end on the ground; two levels are knocked down by the pump's own
   light; and the picture follows the simulation's share of atoms up.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine } = require("./helpers.js");
const { createBrowser } = require("./fake-browser.js");
const { makeView, commonDrawingTests } = require("./draw-helpers.js");

const browser = createBrowser();
for (const file of ["loop.js", "format.js", "materials.js", "draw-atoms.js"]) browser.load("js/laser/ui/" + file);
const UI = browser.window.LaserUI;
const A = UI.atoms;
const engine = loadEngine();
const FRAME = 1 / 60;
const NB = " ";

const WORDS = {
  title: "Inside one atom", two: "two levels", three: "three levels", four: "four levels",
  ground: "ground level", lower: "lower laser level", upper: "upper laser level", band: "pump band",
  pump: "pump", electrons: "electrons", heat: "heat", transfer: "collision",
  noteTwo: "note two", noteThree: "note three", noteFour: "note four"
};

// A small repeatable random source (a linear congruential generator).
function seeded(seed) {
  let state = seed >>> 0;
  return function () {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function model(medium, seed) {
  const m = A.create({ random: seeded(seed || 7) });
  m.use(medium);
  return m;
}

function run(m, seconds, drive) {
  for (let i = 0; i < Math.round(seconds / FRAME); i++) m.step(FRAME, drive);
}

function upCount(m) {
  return m.atoms.filter((atom) => atom.legs.length === 0 && atom.level === "upper").length;
}

// Every move the atoms make, recorded frame by frame: "from>to:kind".
function movesDuring(m, seconds, drive) {
  const seen = new Set();
  for (let i = 0; i < Math.round(seconds / FRAME); i++) {
    m.step(FRAME, drive);
    for (const atom of m.atoms) for (const leg of atom.legs) seen.add(leg.from + ">" + leg.to + ":" + leg.kind);
  }
  return seen;
}

function texts(recorder) {
  return recorder.calls.filter((c) => c.name === "fillText").map((c) => c.args[0]);
}

test("loads as LaserUI.atoms, frozen; every medium the bench runs has a scheme, the engine's own", () => {
  assert.ok(Object.isFrozen(A));
  assert.ok(Object.isFrozen(A.SCHEMES));
  const kinds = { "two-level": "two", "three-level": "three", "four-level": "four" };
  for (const id of engine.media.list()) {
    if (engine.bench.pumpsFor(id).length === 0) continue;
    const scheme = A.SCHEMES[id];
    assert.ok(scheme, id + " has levels to show");
    assert.equal(scheme.kind, kinds[engine.media.get(id).scheme], id);
    const levels = scheme.levels;
    // Every scheme has a ground and an upper laser level; four levels a
    // lower one between them; the levels rise in that order.
    assert.equal(levels.ground.y, 0, id);
    assert.ok(levels.upper.y > 0 && levels.upper.y <= 1, id);
    assert.equal(Boolean(levels.lower), scheme.kind === "four", id + ": a lower laser level for four levels only");
    if (levels.lower) assert.ok(levels.lower.y > 0 && levels.lower.y < levels.upper.y, id);
    if (levels.band) assert.ok(levels.band.y > levels.upper.y && levels.band.y <= 1, id + ": the band above the upper level");
    // Pumped straight from the ground: the two-level atom, and a gas that
    // gets its energy from a partner; every other has a band to pump into.
    assert.equal(Boolean(levels.band), scheme.kind !== "two" && !scheme.partner, id);
  }
  assert.equal(A.SCHEMES["he-ne"].partner.name, "He");
  assert.equal(A.SCHEMES["co2"].partner.name, "N₂");
});

test("create and step refuse what they cannot use, naming themselves", () => {
  assert.throws(() => A.create({}), /^Error: LaserUI\.atoms\.create: /);
  const m = model("ruby");
  assert.throws(() => m.step(-1, { medium: "ruby", excited: 0, light: 0, pump: 0 }), /^Error: LaserUI\.atoms\.step: /);
  assert.throws(() => m.step(FRAME, null), /^Error: LaserUI\.atoms\.step: /);
  assert.throws(() => m.step(FRAME, { medium: "ruby", excited: NaN, light: 0, pump: 0 }), /drive\.excited/);
});

test("a medium with no scheme (or none at all) shows no levels and moves nothing", () => {
  for (const medium of ["diode", "caf2-dy", "constructor", undefined]) {
    const m = A.create({ random: seeded(1) });
    run(m, 2, { medium: medium, excited: 0.8, light: 1, pump: 1 });
    assert.equal(m.scheme, null, String(medium));
    assert.ok(m.atoms.every((atom) => atom.level === "ground" && atom.legs.length === 0));
    assert.equal(m.photons.length, 0);
  }
});

test("the atoms follow the share the simulation asks for, up and back down", () => {
  for (const medium of ["ruby", "nd-yag", "he-ne", "dye-r6g"]) {
    const m = model(medium);
    run(m, 4, { medium: medium, excited: 0.75, light: 0, pump: 1 });
    assert.ok(Math.abs(upCount(m) - 0.75 * A.ATOMS) <= 1, medium + ": up " + upCount(m));
    run(m, 4, { medium: medium, excited: 0, light: 0, pump: 0 });
    assert.equal(upCount(m), 0, medium + ": all down again");
    assert.ok(m.atoms.every((atom) => atom.level === "ground" || atom.legs.length > 0), medium + ": back on the ground");
  }
});

test("the pump's path: up to the band and down into heat; a partner gas straight up; two levels straight up", () => {
  const up = { excited: 1, light: 0, pump: 1 };
  assert.ok(movesDuring(model("ruby"), 1, Object.assign({ medium: "ruby" }, up)).has("ground>band:pump"));
  assert.ok(movesDuring(model("ruby"), 2, Object.assign({ medium: "ruby" }, up)).has("band>upper:heat"));
  assert.ok(movesDuring(model("he-ne"), 1, Object.assign({ medium: "he-ne" }, up)).has("ground>upper:transfer"));
  assert.ok(movesDuring(model("two-level"), 1, Object.assign({ medium: "two-level" }, up)).has("ground>upper:pump"));
});

test("a step down: with light a laser photon along the axis; four levels then empty the lower level, three end on the ground", () => {
  const four = model("nd-yag", 3);
  run(four, 3, { medium: "nd-yag", excited: 0.5, light: 0, pump: 1 });
  const fourMoves = movesDuring(four, 3, { medium: "nd-yag", excited: 0.5, light: 1, pump: 1 });
  assert.ok(fourMoves.has("upper>lower:laser"), "four levels: down to the lower laser level");
  assert.ok(fourMoves.has("lower>ground:heat"), "which empties at once");
  assert.ok(![...fourMoves].some((move) => move.startsWith("upper>ground")), "never straight to the ground");
  assert.ok(four.tally.laser > 0);

  const three = model("ruby", 3);
  run(three, 3, { medium: "ruby", excited: 0.75, light: 0, pump: 1 });
  const threeMoves = movesDuring(three, 3, { medium: "ruby", excited: 0.75, light: 1, pump: 1 });
  assert.ok(threeMoves.has("upper>ground:laser"), "three levels: down to the ground itself");
  // Laser photons fly along the axis, to the right.
  const m = model("ruby", 5);
  run(m, 3, { medium: "ruby", excited: 0.75, light: 0, pump: 1 });
  run(m, 1, { medium: "ruby", excited: 0.75, light: 1, pump: 1 });
  const laser = m.photons.filter((p) => p.kind === "laser");
  assert.ok(laser.length > 0);
  for (const p of laser) assert.deepEqual([p.dx, p.dy], [1, 0]);
});

test("no light: the atoms up emit by themselves (stray photons), never laser photons", () => {
  const m = model("nd-yag", 11);
  run(m, 3, { medium: "nd-yag", excited: 0.5, light: 0, pump: 1 });
  run(m, 3, { medium: "nd-yag", excited: 0, light: 0, pump: 0 });
  assert.equal(m.tally.laser, 0);
  assert.ok(m.tally.stray > 0);
});

test("two levels: the pump's own light knocks the atoms down as it lifts them", () => {
  const m = model("two-level", 2);
  run(m, 3, { medium: "two-level", excited: 0.4, light: 0, pump: 1 });
  const moves = movesDuring(m, 3, { medium: "two-level", excited: 0.4, light: 0, pump: 1 });
  assert.ok(moves.has("upper>ground:push"), "knocked down by the pump");
  assert.ok(moves.has("ground>upper:pump"), "and lifted again");
  assert.equal(m.tally.laser, 0, "never a laser photon");
});

test("another medium puts every atom back on the ground; the same one keeps them", () => {
  const m = model("ruby");
  run(m, 3, { medium: "ruby", excited: 0.75, light: 1, pump: 1 });
  m.use("ruby");
  assert.ok(upCount(m) > 0, "the same medium keeps them");
  m.use("nd-yag");
  assert.ok(m.atoms.every((atom) => atom.level === "ground" && atom.legs.length === 0));
  assert.equal(m.photons.length, 0);
  assert.equal(m.scheme, A.SCHEMES["nd-yag"]);
});

test("the photons stay few: a minute of full light and pump", () => {
  const m = model("nd-yag", 9);
  let most = 0;
  for (let i = 0; i < 3600; i++) {
    m.step(FRAME, { medium: "nd-yag", excited: 0.5, light: 1, pump: 1 });
    most = Math.max(most, m.photons.length);
    for (const p of m.photons) assert.ok(p.x >= 0 && p.x <= 1);
  }
  assert.ok(most <= 12, "at most " + most);
});

// The pictures the shared checks run on: every scheme, at rest and busy
// (theme colours: the two-level atom, and media drawn without a medium).
function busy(medium, seconds) {
  const m = model(medium, 4);
  run(m, seconds, { medium: medium, excited: 0.6, light: 1, pump: 1 });
  return m;
}
const CASES = [];
for (const medium of Object.keys(A.SCHEMES)) {
  for (const seconds of [0, 1.3]) {
    const m = busy(medium, seconds);
    CASES.push((view) => A.draw(view, m, WORDS, { name: "Medium", light: 1, pump: 1 }));
  }
}
CASES.push((view) => A.draw(view, busy("two-level", 2), WORDS, { name: "Two", medium: "two-level", lam: 694.3e-9, pumpKind: "laser", light: 0, pump: 1 }));
CASES.push((view) => A.draw(view, A.create({ random: seeded(1) }), WORDS, {}));
CASES.push((view) => A.draw(view, busy("ruby", 1), {}, {}));
commonDrawingTests("atoms", UI, A.SIZE, CASES);

test("draw: each level's name and role, the scheme in the title, the wavelengths, the scheme's note", () => {
  const { recorder, view } = makeView(UI, A.SIZE, 800);
  A.draw(view, busy("nd-yag", 1), WORDS, { name: "Nd:YAG", medium: "nd-yag", lam: 1064e-9, pumpLam: 808e-9, pumpKind: "diode", light: 1, pump: 1 });
  const words = texts(recorder);
  for (const expected of ["Inside one atom", "Nd:YAG · four levels", "⁴I₉/₂", "⁴I₁₁/₂", "⁴F₃/₂", "⁴F₅/₂",
    "ground level", "lower laser level", "upper laser level", "pump band", "heat", "1.06" + NB + "µm", "pump 808" + NB + "nm", "note four"]) {
    assert.ok(words.includes(expected), expected + " in " + JSON.stringify(words));
  }
  // Ruby: three levels, its note; a flashlamp's pump has no wavelength.
  const ruby = makeView(UI, A.SIZE, 800);
  A.draw(ruby.view, busy("ruby", 1), WORDS, { name: "Ruby", medium: "ruby", lam: 694.3e-9, pumpKind: "flashlamp", light: 1, pump: 1 });
  const rubyWords = texts(ruby.recorder);
  for (const expected of ["Ruby · three levels", "²E", "⁴A₂", "694" + NB + "nm", "pump", "note three"]) {
    assert.ok(rubyWords.includes(expected), expected + " in " + JSON.stringify(rubyWords));
  }
  assert.ok(!rubyWords.includes("lower laser level"));
  // A gas: its partner, the collision, the electrons; CO₂'s 10.6 µm.
  const co2 = makeView(UI, A.SIZE, 800);
  A.draw(co2.view, busy("co2", 1), WORDS, { name: "CO₂", medium: "co2", lam: 10.6e-6, pumpKind: "discharge", light: 1, pump: 1 });
  const co2Words = texts(co2.recorder);
  for (const expected of ["N₂ v = 1", "collision", "electrons", "10.6" + NB + "µm"]) {
    assert.ok(co2Words.includes(expected), expected + " in " + JSON.stringify(co2Words));
  }
});

test("draw: the laser step and its photons in the beam's own colour, the pump's in the pump light's, readable on the theme", () => {
  const M = UI.materials;
  for (const theme of ["dark", "light"]) {
    const { recorder, view } = makeView(UI, A.SIZE, 800, { theme: theme });
    A.draw(view, busy("ruby", 2), WORDS, { name: "Ruby", medium: "ruby", lam: 694.3e-9, pumpKind: "flashlamp", light: 1, pump: 1 });
    const used = recorder.sets.filter((s) => s.name === "strokeStyle" || s.name === "fillStyle").map((s) => s.value);
    assert.ok(used.includes(M.readable(M.beam(694.3e-9).color, view.colors.bg)), theme + ": ruby's red");
    assert.ok(used.includes(M.readable(view.colors.flash, view.colors.bg)), theme + ": the flash's light");
    const green = makeView(UI, A.SIZE, 800, { theme: theme });
    A.draw(green.view, busy("ti-sapphire", 1), WORDS, { name: "Ti", medium: "ti-sapphire", lam: 800e-9, pumpLam: 532e-9, pumpKind: "laser", light: 1, pump: 1 });
    const greenUsed = green.recorder.sets.map((s) => s.value);
    assert.ok(greenUsed.includes(M.readable(M.beam(532e-9).color, green.view.colors.bg)), theme + ": the pump laser's green");
    // Argon's green is too pale for the near-white lab as it is: only the
    // readable one is drawn (ruby's red is readable already, so it cannot
    // tell the two apart).
    const argon = makeView(UI, A.SIZE, 800, { theme: theme });
    A.draw(argon.view, busy("ar-ion", 1), WORDS, { name: "Ar", medium: "ar-ion", lam: 514.5e-9, pumpKind: "discharge", light: 1, pump: 1 });
    const raw = M.beam(514.5e-9).color;
    const shown = M.readable(raw, argon.view.colors.bg);
    assert.notEqual(shown, raw, theme + ": the raw green needs darkening");
    const argonUsed = argon.recorder.sets.map((s) => s.value);
    assert.ok(argonUsed.includes(shown), theme + ": argon's step in its readable green");
    assert.ok(!argonUsed.includes(raw), theme + ": never the raw green");
  }
});

test("draw: an atom glows while it is up or on its way up or down from there, not while it drops from the lower level to the ground as heat", () => {
  const m = A.create({ random: () => 0.5 });
  m.use("nd-yag");
  const picture = { name: "Nd:YAG", medium: "nd-yag", lam: 1064e-9, pumpLam: 808e-9, pumpKind: "diode", light: 1, pump: 1 };
  // How many atoms are drawn excited: each one a disc filled in the accent.
  const glowing = () => {
    const { recorder, view } = makeView(UI, A.SIZE, 800);
    A.draw(view, m, WORDS, picture);
    let fill = null;
    let count = 0;
    for (const entry of recorder.log) {
      if (entry.set === "fillStyle") fill = entry.value;
      if (entry.call === "fill" && fill === view.colors.accent) count += 1;
    }
    return count;
  };
  const rest = () => m.atoms.forEach((atom) => { atom.level = "ground"; atom.legs = []; atom.t = 0; });
  rest();
  const none = glowing();
  const moving = (level, leg) => {
    rest();
    m.atoms[0].level = level;
    m.atoms[0].legs = leg ? [leg] : [];
    m.atoms[0].t = 0.5;
    return glowing() - none;
  };
  assert.equal(moving("lower", { from: "lower", to: "ground", kind: "heat" }), 0, "the heat drop to the ground");
  assert.equal(moving("lower", null), 0, "resting on the lower level");
  assert.equal(moving("upper", { from: "upper", to: "lower", kind: "laser" }), 1, "the laser step down from the upper level");
  assert.equal(moving("ground", { from: "ground", to: "band", kind: "pump" }), 1, "pumped up to the band");
  assert.equal(moving("band", { from: "band", to: "upper", kind: "heat" }), 1, "from the band down to the upper level");
  assert.equal(moving("upper", null), 1, "resting up");
});
