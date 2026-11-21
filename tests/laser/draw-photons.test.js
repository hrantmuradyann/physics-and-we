/* ============================================================================
   draw-photons.test.js — js/laser/ui/draw-photons.js: the cartoon of atoms
   and photons inside the gain medium (docs/laser-plan.md, stage 6b).

   The cartoon is random, so the tests give it their own random source: a
   seeded one (the same run every time), a constant, or a script of
   values. What they pin is what the picture must teach: a photon passing
   an excited atom makes a second photon that flies with it and leaves the
   atom in the ground state; an atom in the ground state gives nothing; an
   atom emitting by itself sends its photon anywhere; and the picture
   follows the simulation's inversion without ever growing without bound.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { assertClose } = require("./helpers.js");
const { createBrowser } = require("./fake-browser.js");
const { WIDTHS, heightFor, makeView, commonDrawingTests } = require("./draw-helpers.js");

const browser = createBrowser();
for (const file of ["loop.js", "draw-photons.js"]) browser.load("js/laser/ui/" + file);
const UI = browser.window.LaserUI;
const PH = UI.photons;
const LIMITS = PH.LIMITS;
const FRAME = 1 / 60;

// A small repeatable random source (a linear congruential generator).
function seeded(seed) {
  let state = seed >>> 0;
  return function () {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// Gives the listed values in turn, then `rest` for ever.
function scripted(values, rest) {
  let i = 0;
  return function () {
    return i < values.length ? values[i++] : rest;
  };
}

function model(random, cols, rows) {
  return PH.create({ cols: cols || 12, rows: rows || 5, random: random });
}

function excitedCount(m) {
  return m.atoms.filter((atom) => atom.excited).length;
}

function run(m, seconds, drive) {
  for (let i = 0; i < Math.round(seconds / FRAME); i++) m.step(FRAME, drive);
}

// A drive that leaves the atoms as they are: no lifting, no dropping.
function hold(m, light) {
  return { excited: excitedCount(m) / m.atoms.length, light: light || 0, pump: 0 };
}

const WORDS = { title: "Inside the gain medium", excited: "excited atom", ground: "atom at rest", photon: "laser photon", stray: "stray photon" };

/* ---------- the cartoon's state ---------- */

test("loads frozen; a new cartoon is a grid of atoms at rest, with no photons", () => {
  assert.ok(Object.isFrozen(PH) && Object.isFrozen(PH.SIZE) && Object.isFrozen(PH.LIMITS) && Object.isFrozen(PH.WORDS));
  const m = model(seeded(1), 4, 3);
  assert.equal(m.atoms.length, 12);
  assert.equal(m.photons.length, 0);
  m.atoms.forEach((atom, i) => {
    assert.equal(atom.col, i % 4);
    assert.equal(atom.row, Math.floor(i / 4));
    assertClose(atom.x, (atom.col + 0.5) / 4, 1e-12, "x");
    assertClose(atom.y, (atom.row + 0.5) / 3, 1e-12, "y");
    assert.equal(atom.excited, false);
  });
  assert.deepEqual(Object.assign({}, m.tally), { entered: 0, stimulated: 0, spontaneous: 0, lifted: 0 });
});

test("create and step refuse what they cannot use, naming themselves", () => {
  for (const options of [undefined, {}, { cols: 0, rows: 5, random: Math.random }, { cols: 12, rows: 2.5, random: Math.random },
    { cols: 12, rows: 5 }, { cols: "12", rows: 5, random: Math.random }]) {
    assert.throws(() => PH.create(options), /^Error: LaserUI\.photons\.create: /, JSON.stringify(options));
  }
  const m = model(seeded(1));
  const drive = { excited: 0.5, light: 0.5, pump: 0.5 };
  for (const dt of [-0.1, NaN, Infinity, "0.1", undefined]) {
    assert.throws(() => m.step(dt, drive), /^Error: LaserUI\.photons\.step: /, String(dt));
  }
  for (const bad of [undefined, null, 5, { excited: 0.5, light: 0.5 }, { excited: NaN, light: 0, pump: 0 }, { excited: "1", light: 0, pump: 0 }]) {
    assert.throws(() => m.step(FRAME, bad), /^Error: LaserUI\.photons\.step: /, JSON.stringify(bad));
  }
  assert.throws(() => m.send(5, 1), /^Error: LaserUI\.photons\.send: /);
  assert.throws(() => m.send(0, 0), /^Error: LaserUI\.photons\.send: /);
});

test("the same random source gives the same cartoon; another gives another", () => {
  function after(seed) {
    const m = model(seeded(seed));
    run(m, 6, { excited: 0.6, light: 0.8, pump: 0.7 });
    return JSON.stringify({ atoms: m.atoms, photons: m.photons, tally: m.tally });
  }
  assert.equal(after(7), after(7));
  assert.notEqual(after(7), after(8));
});

test("a photon passing an excited atom: the atom falls, and a second photon flies along with the first", () => {
  // random = 0.3 for ever: below the chance to emit for a passing photon
  // (0.45), far above the chance to emit alone in one step.
  const m = model(() => 0.3);
  const atom = m.atoms[2 * 12 + 0];                  // the first atom of the middle row, at x = 1/24
  atom.excited = true;
  m.send(2, 1);
  assert.equal(m.photons.length, 1);
  const first = m.photons[0];
  assert.equal(first.x, 0);
  assert.equal(first.y, atom.y);

  // 0.1 s: the photon moves 0.042, past the atom at 0.0417.
  m.step(0.1, hold(m));
  assert.equal(atom.excited, false, "the atom gave its energy");
  assert.equal(atom.flash > 0.5, true, "and is marked for a moment");
  assert.equal(m.photons.length, 2);
  assert.equal(m.tally.stimulated, 1);
  const twin = m.photons[1];
  assert.equal(twin.dx, first.dx, "the same direction");
  assert.equal(twin.dy, 0);
  assert.equal(twin.row, first.row);
  assert.equal(twin.x, first.x, "side by side with the first");
  assert.ok(twin.y !== first.y && Math.abs(twin.y - atom.y) <= 0.36 / 5 + 1e-12, "beside it, inside the row");
  assert.equal(twin.fresh, 1);

  // The two fly on together.
  m.step(0.1, hold(m));
  assert.equal(m.photons.length, 2);
  assert.equal(m.photons[0].x, m.photons[1].x);
  assertClose(m.photons[0].x, 2 * 0.1 * LIMITS.speed, 1e-12, "at the photon's speed");
});

test("the chance of it is LIMITS.chance: a random number just above it gives nothing", () => {
  for (const [value, emits] of [[LIMITS.chance - 0.01, true], [LIMITS.chance + 0.01, false]]) {
    const m = model(() => value);
    m.atoms[0].excited = true;
    m.send(0, 1);
    m.step(0.1, hold(m));
    assert.equal(m.photons.length, emits ? 2 : 1, String(value));
    assert.equal(m.atoms[0].excited, !emits, String(value));
  }
});

test("a photon passing atoms at rest gets nothing from them, and a photon from the right works the same", () => {
  const m = model(() => 0.3);
  m.send(1, 1);
  run(m, 1, hold(m));
  assert.equal(m.photons.length, 1, "no atom was excited");
  assert.equal(m.tally.stimulated, 0);

  // From the right, past an excited atom at the right end of row 3.
  const right = model(() => 0.3);
  const atom = right.atoms[3 * 12 + 11];
  atom.excited = true;
  right.send(3, -1);
  assert.equal(right.photons[0].x, 1);
  right.step(0.1, hold(right));
  assert.equal(right.photons.length, 2);
  assert.equal(right.photons[1].dx, -1);
  assert.equal(atom.excited, false);
});

test("a photon in one row leaves the atoms of the other rows alone", () => {
  const m = model(() => 0.3);
  m.atoms.forEach((atom) => { atom.excited = atom.row !== 2; });
  m.send(2, 1);
  run(m, 2, hold(m));
  assert.equal(m.tally.stimulated, 0);
  assert.equal(excitedCount(m), 48);
});

test("photons fly out of the picture and are forgotten", () => {
  const m = model(() => 0.9);
  m.send(0, 1);
  m.send(4, -1);
  run(m, 1 / LIMITS.speed + 0.3, hold(m));
  assert.equal(m.photons.length, 0);
});

test("an atom emitting by itself: any direction; only along the axis does the photon join the laser light", () => {
  // The script: the first excited atom's turn comes up 0 (it emits), and
  // its direction is a quarter turn (straight down): a stray photon.
  const down = model(scripted([0, 0.25], 0.9));
  down.atoms[30].excited = true;
  down.step(FRAME, hold(down));
  assert.equal(down.atoms[30].excited, false);
  assert.equal(down.tally.spontaneous, 1);
  assert.equal(down.photons.length, 1);
  assert.equal(down.photons[0].row, -1, "a stray photon");
  assertClose(down.photons[0].dy, 1, 1e-12, "straight down");
  assertClose(down.photons[0].dx, 0, 0, "not along the axis", 1e-12);

  // Nearly along the axis (0.02 of a turn = 7°, inside the 0.2 rad cone):
  // it flies along its row as laser light.
  const along = model(scripted([0, 0.02], 0.9));
  along.atoms[30].excited = true;
  along.step(FRAME, hold(along));
  assert.equal(along.photons[0].row, 2);
  assert.equal(along.photons[0].dx, 1);
  assert.equal(along.photons[0].dy, 0);

  // Just outside the cone (0.04 of a turn = 14°): a stray.
  const outside = model(scripted([0, 0.04], 0.9));
  outside.atoms[30].excited = true;
  outside.step(FRAME, hold(outside));
  assert.equal(outside.photons[0].row, -1);

  // A stray photon passes excited atoms without effect.
  const m = model(scripted([0, 0.125], 0.3));         // 45° down to the right
  m.atoms.forEach((atom) => { atom.excited = true; });
  m.step(FRAME, { excited: 1, light: 0, pump: 0 });
  // After the script every random number is 0.3: more atoms would emit
  // for a laser photon, none does for the stray.
  run(m, 1, { excited: 59 / 60, light: 0, pump: 0 });
  assert.equal(m.tally.stimulated, 0);
});

test("spontaneous emission is rare: about LIMITS.self per excited atom a second", () => {
  const m = model(seeded(3));
  m.atoms.forEach((atom) => { atom.excited = true; });
  // 20 s with the pump holding every atom up and no laser light.
  run(m, 20, { excited: 1, light: 0, pump: 1 });
  const expected = LIMITS.self * 60 * 20;              // 48
  assert.ok(m.tally.spontaneous > 0.6 * expected && m.tally.spontaneous < 1.5 * expected,
    m.tally.spontaneous + " emissions, expected about " + expected);
});

test("the pump lifts atoms towards the share asked for, no faster than LIMITS.lift a second", () => {
  const m = model(seeded(5));
  run(m, 1, { excited: 0.5, light: 0, pump: 1 });
  assert.ok(excitedCount(m) <= LIMITS.lift + 1, "after 1 s: " + excitedCount(m));
  assert.ok(excitedCount(m) >= LIMITS.lift - 3, "the pump is working: " + excitedCount(m));
  run(m, 3, { excited: 0.5, light: 0, pump: 1 });
  assert.ok(Math.abs(excitedCount(m) - 30) <= 2, "half of 60: " + excitedCount(m));
  assert.ok(m.tally.lifted >= 30);
  // A weak pump lifts more slowly.
  const weak = model(seeded(5));
  run(weak, 1, { excited: 0.5, light: 0, pump: 0 });
  assert.ok(excitedCount(weak) < excitedCount(m) / 2 && excitedCount(weak) >= 2, "weak pump: " + excitedCount(weak));
  // A lifted atom is marked for a moment.
  const fresh = model(seeded(5));
  fresh.step(0.2, { excited: 1, light: 0, pump: 1 });
  assert.ok(fresh.atoms.some((atom) => atom.excited && atom.lifted === 1));
});

test("when the inversion falls: with laser light the atoms feed it, without it they emit by themselves", () => {
  // random = 0.6 for ever: no passing photon makes an atom emit (0.6 is
  // above the chance) and no atom emits alone in a step, so only the
  // falling inversion acts. A lone emission then goes off at 216°, a stray.
  for (const [light, laser] of [[1, true], [0, false]]) {
    const m = model(() => 0.6);
    m.atoms.forEach((atom) => { atom.excited = true; });
    run(m, 0.5, { excited: 0, light: light, pump: 0 });
    const fallen = 60 - excitedCount(m);
    assert.ok(fallen >= 7 && fallen <= LIMITS.drop / 2 + 1, "no faster than LIMITS.drop a second: " + fallen);
    if (laser) {
      assert.equal(m.tally.stimulated, fallen, "they fed the laser light");
      assert.equal(m.tally.spontaneous, 0);
      // Their photons fly along the rows; light = 1 also sent some in.
      assert.ok(m.photons.every((p) => p.row >= 0));
      assert.ok(m.atoms.some((atom) => atom.flash > 0), "marked as having emitted for the light");
    } else {
      assert.equal(m.tally.spontaneous, fallen, "they emitted by themselves");
      assert.equal(m.tally.stimulated, 0);
      // One photon each (a photon from the top row may have left already).
      assert.ok(m.photons.length >= fallen - 2 && m.photons.length <= fallen, m.photons.length + " photons");
      assert.ok(m.photons.every((p) => p.row === -1), "stray photons");
    }
  }
  // With no light, in the end no atom is left excited.
  const dark = model(seeded(11));
  dark.atoms.forEach((atom) => { atom.excited = true; });
  run(dark, 6, { excited: 0, light: 0, pump: 0 });
  assert.equal(excitedCount(dark), 0);
});

test("light is amplified in an excited medium, and not in one at rest", () => {
  const excited = model(seeded(21));
  run(excited, 20, { excited: 0.6, light: 1, pump: 1 });
  assert.ok(excited.tally.entered >= 40, "light came in: " + excited.tally.entered);
  assert.ok(excited.tally.stimulated > 2 * excited.tally.entered,
    "each photon that came in made more than two: " + excited.tally.stimulated + " from " + excited.tally.entered);

  const atRest = model(seeded(21));
  run(atRest, 20, { excited: 0, light: 1, pump: 1 });
  assert.ok(atRest.tally.entered >= 40);
  assert.equal(atRest.tally.stimulated, 0);
});

test("with no laser light none enters; with full light about LIMITS.enter photons a second", () => {
  const dark = model(seeded(2));
  run(dark, 5, { excited: 0, light: 0, pump: 0 });
  assert.equal(dark.tally.entered, 0);
  const bright = model(seeded(2));
  run(bright, 10, { excited: 0, light: 1, pump: 0 });
  assertClose(bright.tally.entered, 10 * LIMITS.enter, 0.1, "entered");
  // From both sides.
  const m = model(seeded(2));
  run(m, 3, { excited: 0, light: 1, pump: 0 });
  assert.ok(m.photons.some((p) => p.dx === 1) && m.photons.some((p) => p.dx === -1));
});

test("a full picture lets no more laser light in", () => {
  const m = model(seeded(4));
  // Fill it: LIMITS.most photons at the edges, flying inwards (they stay
  // inside for more than a second).
  for (let i = 0; i < LIMITS.most; i++) m.send(i % m.rows, i % 2 === 0 ? 1 : -1);
  assert.equal(m.photons.length, LIMITS.most);
  run(m, 1, { excited: 0, light: 1, pump: 0 });
  assert.equal(m.photons.length, LIMITS.most, "no photon came in");
  assert.equal(m.tally.entered, LIMITS.most, "only the ones sent by hand");
});

test("the picture never grows without bound: at most LIMITS.most photons, the same atoms, whatever is asked", () => {
  for (const seed of [1, 2, 3]) {
    const m = model(seeded(seed));
    const atoms = m.atoms;
    const photons = m.photons;
    let most = 0;
    for (let i = 0; i < 60 * 40; i++) {
      // The harshest driving: everything on, the inversion jumping about.
      m.step(FRAME, { excited: i % 120 < 60 ? 1 : 0.2, light: 1, pump: 1 });
      most = Math.max(most, m.photons.length);
      assert.ok(m.photons.length <= LIMITS.most, "photons: " + m.photons.length);
    }
    assert.ok(most > 20, "a lively picture: " + most);
    assert.equal(m.atoms, atoms, "the same list of atoms");
    assert.equal(m.photons, photons, "the same list of photons");
    assert.equal(m.atoms.length, 60);
    for (const photon of m.photons) {
      for (const value of [photon.x, photon.y, photon.dx, photon.dy, photon.fresh]) assert.ok(Number.isFinite(value));
      assert.ok(photon.x >= -0.03 && photon.x <= 1.03 && photon.y >= -0.03 && photon.y <= 1.03, "inside the picture");
    }
  }
});

test("a step of no time changes nothing; values outside 0 to 1 are held at the ends", () => {
  const m = model(seeded(4));
  run(m, 2, { excited: 0.5, light: 1, pump: 1 });
  const before = JSON.stringify({ atoms: m.atoms, photons: m.photons, tally: m.tally });
  m.step(0, { excited: 1, light: 1, pump: 1 });
  assert.equal(JSON.stringify({ atoms: m.atoms, photons: m.photons, tally: m.tally }), before);
  // 5 means 1: every atom ends up excited, none more.
  const over = model(seeded(4));
  run(over, 8, { excited: 5, light: -3, pump: 7 });
  assert.equal(excitedCount(over), 60);
  assert.equal(over.tally.entered, 0, "light below 0 is no light");
});

test("the marks fade: an atom's flash, a lifted atom's stroke and a new photon's weight", () => {
  const m = model(() => 0.3);
  m.atoms[0].excited = true;
  m.send(0, 1);
  m.step(0.1, hold(m));
  assert.equal(m.atoms[0].flash, 1);
  m.step(LIMITS.flash / 2, hold(m));
  assertClose(m.atoms[0].flash, 0.5, 1e-9, "half way");
  m.step(LIMITS.flash, hold(m));
  assert.equal(m.atoms[0].flash, 0);
  assert.equal(m.photons[1].fresh, 0, "the new photon is an old one now");
});

/* ---------- the picture ---------- */

// A cartoon in full swing, the same every time.
function busy() {
  const m = model(seeded(9));
  run(m, 8, { excited: 0.6, light: 1, pump: 1 });
  return m;
}

const BUSY = busy();
commonDrawingTests("photons", UI, PH.SIZE, [
  (view) => PH.draw(view, BUSY, WORDS),
  (view) => PH.draw(view, model(seeded(1)), WORDS),
  (view) => PH.draw(view, BUSY, {}),
  (view) => PH.draw(view, BUSY, undefined)
], { inside: false });                               // photons are drawn with translate()

test("layout: the box of atoms inside the canvas, the title above it, the legend under it", () => {
  for (const w of WIDTHS) {
    const h = heightFor(PH.SIZE, w);
    const L = PH.layout(w, h);
    const B = L.box;
    const where = "w = " + w;
    assert.ok(L.fontSize >= 11 && L.fontSize <= 14, where);
    assert.ok(B.left >= 10 && B.right <= w - 10 && B.left < B.right, where);
    assert.ok(B.top > L.titleY && B.bottom > B.top + 0.5 * h, where + ": the box takes most of the height");
    assert.ok(L.titleY >= L.fontSize, where + ": the title inside the canvas");
    for (const name of ["excited", "ground", "photon", "stray"]) {
      const spot = L.legend[name];
      assert.ok(spot.y - L.fontSize > B.bottom, where + ": " + name + " under the box");
      assert.ok(spot.y <= h - 0.3 * L.fontSize, where + ": " + name + " inside the canvas");
      assert.ok(spot.x + L.legendMark + L.legendWidth <= (name === "excited" || name === "photon" ? w / 2 : w), where + ": " + name + " keeps to its half");
      assert.ok(L.legendWidth >= 50, where + ": room for a word: " + L.legendWidth);
    }
    assert.ok(L.legend.photon.y - L.legend.excited.y >= 1.3 * L.fontSize, where + ": two rows apart");
  }
});

test("draw: every atom at its place in the box; the excited ones filled, the others rings", () => {
  const m = model(seeded(1), 4, 3);
  m.atoms[5].excited = true;
  const { recorder, view } = makeView(UI, PH.SIZE, 600);
  PH.draw(view, m, {});
  const L = PH.layout(view.w, view.h);
  const B = L.box;
  const arcs = recorder.calls.filter((c) => c.name === "arc");
  for (const atom of m.atoms) {
    const x = B.left + atom.x * (B.right - B.left);
    const y = B.top + atom.y * (B.bottom - B.top);
    const mine = arcs.filter((c) => Math.abs(c.args[0] - x) < 1e-9 && Math.abs(c.args[1] - y) < 1e-9);
    // An excited atom is a disc and a glow around it; one at rest is a ring.
    assert.equal(mine.length, atom.excited ? 2 : 1, "atom " + atom.col + "," + atom.row);
    assert.ok(mine[0].args[2] > 3 && mine[0].args[2] < 0.5 * (B.right - B.left) / 4, "a sensible radius");
  }
  assert.equal(recorder.calls.filter((c) => c.name === "fill").length, 1, "one atom is filled");
  // The atoms never touch: the radius is well under half a cell.
  const radius = arcs[0].args[2];
  assert.ok(2 * radius < 0.6 * Math.min((B.right - B.left) / 4, (B.bottom - B.top) / 3));
});

test("draw: every photon at its place, turned the way it flies, clipped to the box", () => {
  const m = model(seeded(1));
  m.send(1, 1);
  m.send(3, -1);
  m.photons.push({ x: 0.5, y: 0.5, dx: 0, dy: 1, row: -1, fresh: 0 });      // a stray, straight down
  m.photons[0].x = 0.25;
  m.photons[1].x = 0.75;
  const { recorder, view } = makeView(UI, PH.SIZE, 600);
  PH.draw(view, m, {});
  const B = PH.layout(view.w, view.h).box;
  const moves = recorder.calls.filter((c) => c.name === "translate");
  const turns = recorder.calls.filter((c) => c.name === "rotate");
  assert.equal(moves.length, 3);
  m.photons.forEach((photon, i) => {
    assertClose(moves[i].args[0], B.left + photon.x * (B.right - B.left), 1e-9, "x of photon " + i);
    assertClose(moves[i].args[1], B.top + photon.y * (B.bottom - B.top), 1e-9, "y of photon " + i);
    assertClose(turns[i].args[0], Math.atan2(photon.dy, photon.dx), 0, "direction of photon " + i, 1e-12);
  });
  // The box is the clip, set before any atom or photon is drawn.
  const clipAt = recorder.calls.findIndex((c) => c.name === "clip");
  const rect = recorder.calls[clipAt - 1];
  assert.equal(rect.name, "rect");
  assert.deepEqual(rect.args, [B.left, B.top, B.right - B.left, B.bottom - B.top]);
  assert.ok(clipAt < recorder.calls.findIndex((c) => c.name === "arc"));
  // Laser photons in one colour, the stray in another.
  let stroke = null;
  const tones = [];
  for (const entry of recorder.log) {
    if (entry.set === "strokeStyle") stroke = entry.value;
    if (entry.call === "translate") tones.push(stroke);
  }
  assert.equal(tones[0], view.colors.accent2);
  assert.equal(tones[1], view.colors.accent2);
  assert.equal(tones[2], view.colors.muted);
});

test("draw: an atom that just emitted has a ring, one just lifted a stroke; both fade with their mark", () => {
  function extraCalls(change) {
    const plain = model(seeded(1), 1, 1);
    const marked = model(seeded(1), 1, 1);
    change(marked.atoms[0]);
    const a = makeView(UI, PH.SIZE, 600);
    const b = makeView(UI, PH.SIZE, 600);
    PH.draw(a.view, plain, {});
    PH.draw(b.view, marked, {});
    return { plain: a.recorder, marked: b.recorder };
  }
  const flash = extraCalls((atom) => { atom.flash = 0.5; });
  assert.equal(flash.marked.calls.filter((c) => c.name === "arc").length,
    flash.plain.calls.filter((c) => c.name === "arc").length + 1, "one more ring");
  assert.ok(flash.marked.sets.some((s) => s.name === "globalAlpha" && s.value === 0.5), "as faint as the mark");
  const lifted = extraCalls((atom) => { atom.lifted = 0.25; });
  assert.equal(lifted.marked.calls.filter((c) => c.name === "lineTo").length,
    lifted.plain.calls.filter((c) => c.name === "lineTo").length + 1, "one more stroke");
  assert.ok(lifted.marked.sets.some((s) => s.name === "globalAlpha" && s.value === 0.25));
});

test("draw: the title and the four legend words where the layout puts them; a missing word is left out", () => {
  const { recorder, view } = makeView(UI, PH.SIZE, 600);
  PH.draw(view, BUSY, WORDS);
  const L = PH.layout(view.w, view.h);
  const texts = recorder.calls.filter((c) => c.name === "fillText");
  assert.deepEqual(texts.map((c) => c.args[0]).sort(), Object.values(WORDS).sort());
  const title = texts.find((c) => c.args[0] === WORDS.title);
  assert.deepEqual(title.args.slice(1), [L.box.left, L.titleY, L.titleWidth]);
  for (const name of ["excited", "ground", "photon", "stray"]) {
    const call = texts.find((c) => c.args[0] === WORDS[name]);
    assert.deepEqual(call.args.slice(1), [L.legend[name].x + L.legendMark, L.legend[name].y, L.legendWidth], name);
  }
  assert.deepEqual(Array.from(PH.WORDS).sort(), Object.keys(WORDS).sort(), "WORDS names the words draw() writes");

  const some = makeView(UI, PH.SIZE, 600);
  PH.draw(some.view, BUSY, { title: "Only a title", stray: 5 });
  assert.deepEqual(some.recorder.calls.filter((c) => c.name === "fillText").map((c) => c.args[0]), ["Only a title"]);
});

test("draw: a stray photon's wave is dashed, a laser photon's solid, both with a solid arrowhead; the legend shows the same", () => {
  const m = model(seeded(1));
  m.send(1, 1);
  m.photons.push({ x: 0.5, y: 0.5, dx: 0, dy: 1, row: -1, fresh: 0 });      // a stray
  const { recorder, view } = makeView(UI, PH.SIZE, 600);
  PH.draw(view, m, WORDS);
  // The dash pattern in force at each stroke and fill drawn after a
  // photon's translate (the cartoon's two photons, then the legend's two).
  const marks = [];
  let dash = [];
  let current = null;
  for (const entry of recorder.log) {
    if (entry.call === "setLineDash") dash = Array.from(entry.args[0]);      // from the sandbox
    if (entry.call === "translate") {
      current = { wave: null, head: null };
      marks.push(current);
    }
    if (current && entry.call === "stroke" && current.wave === null) current.wave = dash.slice();
    if (current && entry.call === "fill" && current.head === null) current.head = dash.slice();
  }
  assert.equal(marks.length, 4, "two photons and two legend marks");
  const [laser, stray, legendLaser, legendStray] = marks;
  assert.deepEqual(laser.wave, [], "a laser photon's wave is solid");
  assert.ok(stray.wave.length > 0, "a stray photon's wave is dashed");
  assert.deepEqual(legendLaser.wave, []);
  assert.deepEqual(legendStray.wave, stray.wave, "the legend's stray is dashed alike");
  for (const mark of marks) assert.deepEqual(mark.head, [], "arrowheads solid");
  // Nothing after them is left dashed.
  assert.deepEqual(dash, []);
});
