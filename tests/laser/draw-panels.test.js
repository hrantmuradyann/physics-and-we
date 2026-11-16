/* ============================================================================
   draw-panels.test.js — js/laser/ui/draw-levels.js: the four levels of
   Nd:YAG with the upper level's population bar, and the gain/loss gauge
   (docs/laser-physics.md §11.6, 1–2). It only draws what it is given:
   numbers in units of the threshold (y = N/N_c, x = pump/threshold).

   (The charts that used to be tested here have their own file now,
   draw-plots.test.js.)
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { deepFreeze, assertClose } = require("./helpers.js");
const { createBrowser, fakeContext, themeVariables } = require("./fake-browser.js");

const browser = createBrowser();
for (const file of ["loop.js", "format.js", "draw-levels.js"]) {
  browser.load("js/laser/ui/" + file);
}
const UI = browser.window.LaserUI;
const LEVELS = UI.levels;

const WIDTHS = [327];
for (let w = 280; w <= 1400; w += 40) WIDTHS.push(w);

function heightFor(size, w) {
  return Math.max(size.minHeight, Math.min(w / size.aspect, size.maxHeight));
}

function palette(theme) {
  const variables = themeVariables()[theme];
  const colors = {};
  for (const name of Object.keys(UI.loop.PALETTE)) colors[name] = variables[UI.loop.PALETTE[name]];
  return colors;
}

function drawWith(drawing, w, picture, theme) {
  const recorder = fakeContext();
  const view = {
    g: recorder.context, w: w, h: heightFor(drawing.SIZE, w), dpr: 1,
    colors: deepFreeze(palette(theme || "dark")), font: "Test Sans", t: 0, dt: 0
  };
  drawing.draw(view, deepFreeze(picture));
  return { recorder: recorder, view: view };
}

const LEVEL_WORDS = {
  pumpBand: "Pump band", upper: "Upper laser level", lower: "Lower laser level", ground: "Ground level",
  groundLower: "Ground (lower level)", gain: "Gain", loss: "Loss", transparent: "Transparent"
};

function levelPicture(changes) {
  const picture = Object.assign({ x: 3.3, y: 1, stim: 2.3, words: LEVEL_WORDS }, changes || {});
  // Four levels hold y = x with no light: the small-signal gain is x.
  if (picture.smallSignal === undefined) picture.smallSignal = picture.x;
  return picture;
}

// Ruby (n_t = N_t/N_c = 11.54): before Fire every ion is down, y = −n_t,
// and with no pump the small-signal gain is −n_t too; at the flash's peak
// x = 5.72 and g₀/g_th = n_t(w − 1)/(w + 1) = 8.59 (bench.pumpNow).
const RUBY_NT = 11.54;
const RUBY_BEFORE = levelPicture({ scheme: "three-level", n_t: RUBY_NT, x: 0, smallSignal: -RUBY_NT, y: -RUBY_NT, stim: 0 });
const RUBY_PEAK = levelPicture({ scheme: "three-level", n_t: RUBY_NT, x: 5.72, smallSignal: 8.59, y: 1, stim: 4.72 });
const RUBY_HALF = levelPicture({ scheme: "three-level", n_t: RUBY_NT, x: 0.9, smallSignal: 0.6, y: 0, stim: 0 });
// The two-level atom pumped by its laser: w = 6.55, n_t = 7.59, so with no
// light y = −n_t/(1 + 2w) = −0.538, always below zero.
const TWO_NT = 7.59;
const TWO_LEVEL = levelPicture({ scheme: "two-level", n_t: TWO_NT, x: 6.55, smallSignal: -0.538, y: -0.538, stim: 0 });
const TWO_OFF = levelPicture({ scheme: "two-level", n_t: TWO_NT, x: 0, smallSignal: -TWO_NT, y: -TWO_NT, stim: 0 });
const TWO_STRONG = levelPicture({ scheme: "two-level", n_t: TWO_NT, x: 60, smallSignal: -0.063, y: -0.063, stim: 0 });

// With a Q-switch (stage 8b): the loss now, over the open cavity's loss.
// Nd:YAG behind its closed cell (37 times the open loss, the inversion at
// 7.7) and after its pulse (the gain held at the open loss), ruby behind
// its closed cell and just after it opened, ruby behind its unbleached
// filter.
const YAG_CLOSED = levelPicture({ x: 7.7, smallSignal: 7.7, y: 7.7, stim: 0, loss: 37 });
const YAG_AFTER = levelPicture({ x: 2, smallSignal: 2, y: 1, stim: 1, loss: 1 });
const RUBY_CLOSED = levelPicture({ scheme: "three-level", n_t: RUBY_NT, x: 5.72, smallSignal: 8.59, y: 4.3, stim: 0, loss: 14.1 });
const RUBY_OPENED = levelPicture({ scheme: "three-level", n_t: RUBY_NT, x: 5.72, smallSignal: 8.59, y: 4.3, stim: 0, loss: 1 });
const RUBY_FILTER = levelPicture({ scheme: "three-level", n_t: RUBY_NT, x: 5.72, smallSignal: 8.59, y: 2.5, stim: 0, loss: 2.98 });
const SWITCHED = [YAG_CLOSED, YAG_AFTER, RUBY_CLOSED, RUBY_OPENED, RUBY_FILTER];

const LEVEL_CASES = [
  levelPicture(),
  levelPicture({ x: 0, y: 0, stim: 0 }),
  levelPicture({ x: 0.5, y: 3, stim: 0 }),
  levelPicture({ x: 40, y: 1, stim: 39 }),
  levelPicture({ x: 2, y: 1.7, stim: 1e6 }),
  RUBY_BEFORE, RUBY_PEAK, RUBY_HALF, TWO_LEVEL, TWO_OFF, TWO_STRONG
].concat(SWITCHED);
const POSITION_CALLS = ["moveTo", "lineTo", "fillRect", "strokeRect", "rect", "clearRect", "arc", "fillText"];

// Every coordinate a drawing passes to the canvas is a number inside it.
function assertAllInside(recorder, w, h, label) {
  for (const call of recorder.calls) {
    if (!POSITION_CALLS.includes(call.name)) continue;
    const at = call.name === "fillText" ? call.args.slice(1, 3) : call.args.slice(0, 2);
    for (const value of at) assert.ok(Number.isFinite(value), label + " " + call.name + " " + call.args);
    assert.ok(at[0] >= -0.5 && at[0] <= w + 0.5 && at[1] >= -0.5 && at[1] <= h + 0.5,
      label + ": " + call.name + "(" + call.args.join(", ") + ") outside " + w + "×" + h);
    if (call.name === "fillRect" || call.name === "strokeRect" || call.name === "rect") {
      const [x, y, rw, rh] = call.args;
      assert.ok(Number.isFinite(rw) && Number.isFinite(rh) && rw >= 0 && rh >= 0, label + " size " + call.args);
      assert.ok(x + rw <= w + 0.5 && y + rh <= h + 0.5, label + ": " + call.name + " runs off the canvas " + call.args);
    }
  }
}

for (const [name, drawing, cases] of [["levels", LEVELS, LEVEL_CASES]]) {
  test(name + ": loads frozen, with a canvas size", () => {
    assert.ok(Object.isFrozen(drawing));
    const s = drawing.SIZE;
    assert.ok(s.aspect > 0 && s.minHeight > 0 && s.minHeight <= s.maxHeight);
  });

  test(name + ": every line, box and word inside the canvas, at every width and for every picture", () => {
    for (const w of WIDTHS) {
      for (const picture of cases) {
        const { recorder, view } = drawWith(drawing, w, picture);
        assertAllInside(recorder, view.w, view.h, name + " w=" + w);
      }
    }
  });

  test(name + ": colours only from the theme, in both themes", () => {
    for (const theme of ["dark", "light"]) {
      const allowed = Object.values(palette(theme));
      for (const picture of cases) {
        const { recorder } = drawWith(drawing, 800, picture, theme);
        for (const set of recorder.sets) {
          if (set.name === "fillStyle" || set.name === "strokeStyle" || set.name === "shadowColor") {
            assert.ok(allowed.includes(set.value), theme + ": " + set.name + " = " + set.value);
          }
        }
      }
    }
  });

  test(name + ": clears first, leaves the context as it found it", () => {
    for (const picture of cases) {
      const { recorder, view } = drawWith(drawing, 600, picture);
      const first = recorder.calls[0];
      assert.equal(first.name, "clearRect");
      assert.deepEqual(first.args, [0, 0, view.w, view.h]);
      const saves = recorder.calls.filter((c) => c.name === "save").length;
      const restores = recorder.calls.filter((c) => c.name === "restore").length;
      assert.ok(saves >= 1 && saves === restores, "save " + saves + ", restore " + restores);
      assert.equal(recorder.calls[recorder.calls.length - 1].name, "restore");
    }
  });

  test(name + ": every word squeezed into its slot, never empty, never 'undefined' or 'NaN'", () => {
    for (const w of [280, 800]) {
      for (const picture of cases) {
        const { recorder } = drawWith(drawing, w, picture);
        const texts = recorder.calls.filter((c) => c.name === "fillText");
        assert.ok(texts.length > 0);
        for (const call of texts) {
          assert.equal(call.args.length, 4, "fillText without maxWidth: " + call.args[0]);
          assert.ok(call.args[3] > 0, "a slot of width " + call.args[3]);
          assert.ok(typeof call.args[0] === "string" && call.args[0].length > 0);
          assert.ok(!/undefined|NaN|Infinity|null/.test(call.args[0]), call.args[0]);
        }
      }
    }
  });

  test(name + ": a word missing from the data is left out, not written", () => {
    for (const picture of [levelPicture({ words: {} }), Object.assign({}, RUBY_BEFORE, { words: {} }),
      Object.assign({}, TWO_LEVEL, { words: {} })]) {
      const { recorder } = drawWith(drawing, 800, picture);
      assert.equal(recorder.calls.filter((c) => c.name === "fillText").length, 0);
    }
  });
}

/* ---------- the level diagram and the gauge ---------- */

test("levels: the gauge's scale holds the gain, the loss and the small-signal gain, with room above", () => {
  assert.equal(LEVELS.scaleMax({ x: 3, smallSignal: 3, y: 1 }), 3 * 1.15);
  assert.equal(LEVELS.scaleMax({ x: 0.5, smallSignal: 0.5, y: 0.4 }), 1.15, "the loss line always fits");
  assert.equal(LEVELS.scaleMax({ x: 0.5, smallSignal: 0.5, y: 2 }), 2 * 1.15, "a high inversion left from a stronger pump");
  assert.equal(LEVELS.scaleMax({ x: 5.72, smallSignal: 8.59, y: 1 }), 8.59 * 1.15, "ruby at its flash's peak: g₀/g_th > x");
  assert.equal(LEVELS.scaleMax({ x: 40, smallSignal: 2, y: 1 }), 2 * 1.15, "the pump x is not on the gauge");
  // Four levels start at zero; three and two at every ion down, −n_t.
  assert.equal(LEVELS.scaleMin(levelPicture()), 0);
  assert.equal(LEVELS.scaleMin({ x: 3, smallSignal: 3, y: 1 }), 0, "no scheme: four levels");
  assert.equal(LEVELS.scaleMin(RUBY_BEFORE), -RUBY_NT * 1.15);
  assert.equal(LEVELS.scaleMin(TWO_LEVEL), -TWO_NT * 1.15);
  // Above zero at least a quarter of the depth below it, so the loss line
  // and its word fit even when every ion is down.
  assert.equal(LEVELS.scaleMax(RUBY_BEFORE), 0.25 * RUBY_NT);
  assert.equal(LEVELS.scaleMax(TWO_LEVEL), 0.25 * TWO_NT);
  assert.equal(LEVELS.scaleMax(RUBY_PEAK), 8.59 * 1.15, "ruby at its peak: the small-signal gain");
});

test("levels: the gain bar is y on the gauge's scale, the loss line is 1 (gain = loss at threshold)", () => {
  const w = 800;
  for (const picture of [levelPicture(), levelPicture({ x: 0.6, y: 0.5, stim: 0 })]) {
    const { recorder, view } = drawWith(LEVELS, w, picture);
    const layout = LEVELS.layout(w, view.h);
    const g = layout.gauge;
    const span = g.bottom - g.top;
    const scale = LEVELS.scaleMax(picture);
    const bar = recorder.calls.find((c) => c.name === "fillRect" && c.args[0] === g.gainX);
    assert.ok(bar, "the gain bar is drawn at gauge.gainX");
    assertClose(bar.args[3], span * picture.y / scale, 1e-9, "gain bar height");
    assertClose(bar.args[1] + bar.args[3], g.bottom, 1e-9, "standing on the bottom");
    const lossY = g.bottom - span / scale;
    const lossLine = recorder.calls.find((c, i) => c.name === "moveTo" && Math.abs(c.args[1] - lossY) < 1e-9 &&
      recorder.calls[i + 1].name === "lineTo" && Math.abs(recorder.calls[i + 1].args[1] - lossY) < 1e-9);
    assert.ok(lossLine, "a level line at the loss");
  }
});

// A horizontal line at height y starting at x0 (a moveTo followed by a
// lineTo at the same height), or undefined.
function lineAt(recorder, x0, y) {
  return recorder.calls.find((c, i) => c.name === "moveTo" && Math.abs(c.args[0] - x0) < 1e-9 &&
    Math.abs(c.args[1] - y) < 1e-9 && recorder.calls[i + 1] && recorder.calls[i + 1].name === "lineTo" &&
    Math.abs(recorder.calls[i + 1].args[1] - y) < 1e-9);
}

test("levels: the dashed small-signal line is the gain with no light, g₀/g_th on the gauge's scale", () => {
  const w = 800;
  // Ruby at its flash's peak: x = 5.72, but with no light it would hold
  // y = n_t(w − 1)/(w + 1) = 8.59 (bench.pumpNow).
  const ruby = levelPicture({ x: 5.72, smallSignal: 8.59, y: 1, stim: 4.7 });
  for (const picture of [levelPicture(), levelPicture({ x: 0.6, y: 0.5, stim: 0 }),
    levelPicture({ x: 2, y: 1.7, stim: 0.3 }), ruby]) {
    const { recorder, view } = drawWith(LEVELS, w, picture);
    const g = LEVELS.layout(w, view.h).gauge;
    const smallY = g.bottom - (g.bottom - g.top) * picture.smallSignal / LEVELS.scaleMax(picture);
    assert.ok(lineAt(recorder, g.gainX, smallY), "a line across the gain bar at " + picture.smallSignal);
  }
  const { recorder, view } = drawWith(LEVELS, w, ruby);
  const g = LEVELS.layout(w, view.h).gauge;
  const atX = g.bottom - (g.bottom - g.top) * ruby.x / LEVELS.scaleMax(ruby);
  assert.equal(lineAt(recorder, g.gainX, atX), undefined, "not at the pump's x");
});

test("levels: the laser arrow only with stimulated emission, as wide as it", () => {
  const w = 800;
  const h = heightFor(LEVELS.SIZE, w);
  const L = LEVELS.layout(w, h);
  // The width of the line drawn down from the upper level at the laser
  // arrow's place, or 0 when there is none.
  function laserArrow(picture) {
    const { recorder } = drawWith(LEVELS, w, picture);
    let width = 1;
    for (const entry of recorder.log) {
      if (entry.set === "lineWidth") width = entry.value;
      if (entry.call === "moveTo" && Math.abs(entry.args[0] - L.arrows.laser) < 1e-9 &&
          Math.abs(entry.args[1] - L.upper) < 1e-9) return width;
    }
    return 0;
  }
  // A strong pump with no light yet (the build-up before the first spike).
  assert.equal(laserArrow(levelPicture({ x: 3.3, y: 2, stim: 0 })), 0, "no light, no laser arrow");
  assert.ok(laserArrow(levelPicture({ x: 3.3, y: 1, stim: 0.5 })) > 0);
  assert.ok(laserArrow(levelPicture({ x: 3.3, y: 1, stim: 2.3 })) > laserArrow(levelPicture({ x: 3.3, y: 1, stim: 0.5 })),
    "more stimulated emission, a wider arrow");
});

test("levels: the upper-level bar grows with the inversion", () => {
  const w = 800;
  const h = heightFor(LEVELS.SIZE, w);
  const layout = LEVELS.layout(w, h);
  function barHeight(y) {
    const { recorder } = drawWith(LEVELS, w, levelPicture({ y: y }));
    const bar = recorder.calls.find((c) => c.name === "fillRect" && c.args[0] === layout.bar.x);
    return bar ? bar.args[3] : 0;
  }
  assert.equal(barHeight(0), 0);
  assert.ok(barHeight(0.5) > 0);
  assert.ok(barHeight(1) > barHeight(0.5));
  assertClose(barHeight(1), 2 * barHeight(0.5), 1e-9, "in proportion");
  assert.ok(barHeight(10) <= layout.bar.bottom - layout.bar.top + 1e-9, "never taller than its slot");
});

test("levels: the four levels from the ground up, inside the canvas", () => {
  for (const w of WIDTHS) {
    const h = heightFor(LEVELS.SIZE, w);
    const L = LEVELS.layout(w, h);
    assert.ok(L.ground > L.lower && L.lower > L.upper && L.upper > L.pumpBand, "order at " + w);
    assert.ok(L.pumpBand > 0 && L.ground < h);
    assert.ok(L.gauge.top < L.gauge.bottom && L.bar.top < L.bar.bottom);
  }
});

/* ---------- three and two levels (stage 7d) ---------- */

// The heights a scheme draws level lines at (lines across from lineLeft
// to lineRight).
function levelLines(recorder, L) {
  const heights = [];
  const calls = recorder.calls;
  for (let i = 0; i + 1 < calls.length; i++) {
    if (calls[i].name === "moveTo" && calls[i + 1].name === "lineTo" &&
        Math.abs(calls[i].args[0] - L.lineLeft) < 1e-9 && Math.abs(calls[i + 1].args[0] - L.lineRight) < 1e-9 &&
        calls[i].args[1] === calls[i + 1].args[1]) heights.push(calls[i].args[1]);
  }
  return heights;
}

// The words written, with where.
function writtenWords(recorder) {
  return recorder.calls.filter((c) => c.name === "fillText").map((c) => ({ text: c.args[0], x: c.args[1], y: c.args[2] }));
}

// Where the gauge puts value v: the same formula the drawing must use.
function gaugeY(G, picture, v) {
  const low = LEVELS.scaleMin(picture);
  const high = LEVELS.scaleMax(picture);
  return G.bottom - (G.bottom - G.top) * (v - low) / (high - low);
}

// The width of a vertical arrow drawn from (x, y1), or 0 when none is.
function arrowFrom(recorder, x, y1) {
  let width = 1;
  for (const entry of recorder.log) {
    if (entry.set === "lineWidth") width = entry.value;
    if (entry.call === "moveTo" && Math.abs(entry.args[0] - x) < 1e-9 && Math.abs(entry.args[1] - y1) < 1e-9) return width;
  }
  return 0;
}

// The dashed lines (fast relaxations): each moveTo/lineTo pair drawn while
// a line dash is set.
function dashedSegments(recorder) {
  const list = [];
  let dashed = false;
  const log = recorder.log;
  for (let i = 0; i + 1 < log.length; i++) {
    if (log[i].call === "setLineDash") dashed = log[i].args[0].length > 0;
    if (dashed && log[i].call === "moveTo" && log[i + 1].call === "lineTo") {
      list.push({ x1: log[i].args[0], y1: log[i].args[1], x2: log[i + 1].args[0], y2: log[i + 1].args[1] });
    }
  }
  return list;
}

test("levels: each scheme draws its own levels, named, and its own fast relaxations", () => {
  const w = 800;
  const L = LEVELS.layout(w, heightFor(LEVELS.SIZE, w));
  const four = drawWith(LEVELS, w, levelPicture()).recorder;
  const three = drawWith(LEVELS, w, RUBY_PEAK).recorder;
  const two = drawWith(LEVELS, w, TWO_LEVEL).recorder;
  assert.deepEqual(levelLines(four, L), [L.pumpBand, L.upper, L.lower, L.ground]);
  assert.deepEqual(levelLines(three, L), [L.pumpBand, L.upper, L.ground], "three levels: no lower level");
  assert.deepEqual(levelLines(two, L), [L.upper, L.ground], "two levels: no pump band");
  // The names: for three levels the ground is also the lower laser level.
  const named = (recorder) => writtenWords(recorder).filter((t) => t.x === L.labelLeft).map((t) => t.text);
  assert.deepEqual(named(four), ["Pump band", "Upper laser level", "Lower laser level", "Ground level"]);
  assert.deepEqual(named(three), ["Pump band", "Upper laser level", "Ground (lower level)"]);
  assert.deepEqual(named(two), ["Upper laser level", "Ground level"]);
  const words = Object.assign({}, LEVEL_WORDS);
  delete words.groundLower;
  assert.deepEqual(named(drawWith(LEVELS, w, Object.assign({}, RUBY_PEAK, { words: words })).recorder),
    ["Pump band", "Upper laser level", "Ground level"], "without its own word, the ground's");
  // The dashed relaxations: band to upper level, lower level to ground (four);
  // band to upper level only (three); none (two).
  const relax = (recorder) => dashedSegments(recorder).filter((d) => d.x1 === d.x2).map((d) => [d.x1, d.y1, d.y2]);
  assert.deepEqual(relax(four), [[L.arrows.relaxTop, L.pumpBand, L.upper], [L.arrows.relaxBottom, L.lower, L.ground]]);
  assert.deepEqual(relax(three), [[L.arrows.relaxTop, L.pumpBand, L.upper]]);
  assert.deepEqual(relax(two), []);
});

test("levels: three levels lase down to the ground; four levels to the lower level", () => {
  const w = 800;
  const L = LEVELS.layout(w, heightFor(LEVELS.SIZE, w));
  // Where the laser arrow's line goes: the lineTo after its moveTo.
  function laserEnd(picture) {
    const calls = drawWith(LEVELS, w, picture).recorder.calls;
    const at = calls.findIndex((c) => c.name === "moveTo" && Math.abs(c.args[0] - L.arrows.laser) < 1e-9 &&
      Math.abs(c.args[1] - L.upper) < 1e-9);
    return at === -1 ? null : calls[at + 1].args[1];
  }
  assert.ok(laserEnd(RUBY_PEAK) > L.lower, "ruby: past where a lower level would be, to the ground");
  assert.ok(laserEnd(RUBY_PEAK) < L.ground);
  assert.ok(laserEnd(levelPicture()) < L.lower, "four levels: to the lower level");
  assert.equal(laserEnd(RUBY_BEFORE), null, "no light, no laser arrow");
  // The pump arrow goes from the ground to the pump band for three levels too.
  assert.ok(arrowFrom(drawWith(LEVELS, w, RUBY_PEAK).recorder, L.arrows.pump, L.ground) > 1);
  assert.equal(arrowFrom(drawWith(LEVELS, w, RUBY_BEFORE).recorder, L.arrows.pump, L.ground), 0, "no pump before Fire");
});

test("levels: the two-level atom's pump is drawn up and down, equally wide: its light takes atoms down as fast as up", () => {
  const w = 800;
  const L = LEVELS.layout(w, heightFor(LEVELS.SIZE, w));
  assert.ok(L.arrows.pumpDown > L.arrows.pump && L.arrows.pumpDown < L.arrows.laser, "beside the pump arrow");
  const { recorder } = drawWith(LEVELS, w, TWO_LEVEL);
  const up = arrowFrom(recorder, L.arrows.pump, L.ground);
  const down = arrowFrom(recorder, L.arrows.pumpDown, L.upper);
  assert.ok(up > 1, "up from the ground");
  assert.equal(down, up, "and down from the upper level, as wide");
  // Up to the upper level: there is no pump band.
  const calls = recorder.calls;
  const at = calls.findIndex((c) => c.name === "moveTo" && Math.abs(c.args[0] - L.arrows.pump) < 1e-9 && Math.abs(c.args[1] - L.ground) < 1e-9);
  assert.ok(calls[at + 1].args[1] > L.upper && calls[at + 1].args[1] < L.lower, "the pump's head at the upper level");
  const off = drawWith(LEVELS, w, TWO_OFF).recorder;
  assert.equal(arrowFrom(off, L.arrows.pump, L.ground), 0);
  assert.equal(arrowFrom(off, L.arrows.pumpDown, L.upper), 0, "pump off: neither");
  // Three and four levels have no downward pump.
  for (const picture of [levelPicture(), RUBY_PEAK]) {
    assert.equal(arrowFrom(drawWith(LEVELS, w, picture).recorder, L.arrows.pumpDown, L.upper), 0);
  }
});

test("levels: three and two levels show the share of ions up and down, with a mark at threshold", () => {
  const w = 800;
  const L = LEVELS.layout(w, heightFor(LEVELS.SIZE, w));
  const slot = L.bar.bottom - L.bar.top;
  assert.equal(L.groundBar.x, L.bar.x);
  assert.equal(L.groundBar.w, L.bar.w);
  assert.equal(L.groundBar.bottom, L.ground, "standing on the ground level");
  assertClose(L.groundBar.bottom - L.groundBar.top, slot, 1e-12, "as tall as the upper one");
  function bars(picture) {
    const { recorder } = drawWith(LEVELS, w, picture);
    const fills = recorder.calls.filter((c) => c.name === "fillRect" && c.args[0] === L.bar.x);
    const upper = fills.find((c) => Math.abs(c.args[1] + c.args[3] - L.bar.bottom) < 1e-9);
    const ground = fills.find((c) => Math.abs(c.args[1] + c.args[3] - L.groundBar.bottom) < 1e-9);
    return { upper: upper ? upper.args[3] : 0, ground: ground ? ground.args[3] : 0, recorder: recorder };
  }
  // Ruby before Fire: every ion down. Half up at y = 0. At threshold, y = 1.
  for (const [picture, up] of [[RUBY_BEFORE, 0], [RUBY_HALF, 0.5], [RUBY_PEAK, (1 + 1 / RUBY_NT) / 2], [TWO_LEVEL, (TWO_NT - 0.538) / (2 * TWO_NT)]]) {
    const b = bars(picture);
    assertClose(b.upper, up * slot, 1e-9, picture.scheme + " y = " + picture.y + ": the share up");
    assertClose(b.ground, (1 - up) * slot, 1e-9, picture.scheme + " y = " + picture.y + ": the share down");
  }
  // The threshold mark: (1 + 1/n_t)/2 of the slot, 54 % for ruby.
  for (const [picture, n_t] of [[RUBY_PEAK, RUBY_NT], [TWO_LEVEL, TWO_NT]]) {
    const markY = L.bar.bottom - slot * (1 + 1 / n_t) / 2;
    assert.ok(lineAt(bars(picture).recorder, L.bar.x - 3, markY), "the threshold mark at " + (1 + 1 / n_t) / 2);
  }
  // Four levels keep their one bar, the inversion over threshold.
  assert.equal(bars(levelPicture()).ground, 0, "four levels: no bar on the ground");
  // With n_t ≤ 1 even every ion up is short of threshold ((1 + 1/n_t)/2 ≥ 1):
  // no mark, rather than one above the bar (the two-level atom at a 60 %
  // coupler, n_t = 0.87).
  for (const n_t of [0.873, 1]) {
    const picture = levelPicture({ scheme: "two-level", n_t: n_t, x: 6.55, smallSignal: -0.1, y: -0.1, stim: 0 });
    const marks = bars(picture).recorder.calls.filter((c, i, all) => c.name === "moveTo" &&
      Math.abs(c.args[0] - (L.bar.x - 3)) < 1e-9 && all[i + 1] && all[i + 1].name === "lineTo" &&
      Math.abs(all[i + 1].args[0] - (L.bar.x + L.bar.w + 3)) < 1e-9);
    assert.equal(marks.length, 0, "n_t = " + n_t + ": no threshold mark");
  }
});

test("levels: the loss word stays inside the gauge, above its line or under it when the top is too near", () => {
  for (const w of WIDTHS) {
    const h = heightFor(LEVELS.SIZE, w);
    const L = LEVELS.layout(w, h);
    const G = L.gauge;
    // Every scheme, and the two-level atom over the couplers' range of n_t
    // (n_t ≈ 4.9 at 15 % put the loss line 5.8 px under the top at 220 px).
    const pictures = [levelPicture(), levelPicture({ x: 0.2, smallSignal: 0.2, y: 0.2, stim: 0 }), RUBY_BEFORE, RUBY_PEAK, RUBY_HALF].concat(SWITCHED);
    for (const n_t of [0.9, 1.5, 2, 3, 4.9, 7, 12, 40]) {
      pictures.push(levelPicture({ scheme: "two-level", n_t: n_t, x: 5, smallSignal: -n_t / 11, y: -n_t / 11, stim: 0 }));
      pictures.push(levelPicture({ scheme: "three-level", n_t: n_t, x: 0, smallSignal: -n_t, y: -n_t, stim: 0 }));
    }
    for (const picture of pictures) {
      const words = writtenWords(drawWith(LEVELS, w, picture).recorder);
      const loss = words.find((t) => t.text === LEVEL_WORDS.loss);
      const where = "w = " + w + ", " + (picture.scheme || "four-level") + " n_t = " + picture.n_t + ", y = " + picture.y;
      assert.ok(loss, where);
      assert.ok(loss.y - L.fontSize >= G.top - 1e-9, where + ": the word's top inside the gauge (" + (loss.y - L.fontSize) + " < " + G.top + ")");
      assert.ok(loss.y <= G.bottom + 1e-9, where + ": and its foot");
      const lossY = gaugeY(G, picture, picture.loss === undefined ? 1 : picture.loss);
      assert.ok(Math.abs(loss.y - (lossY - 4)) < 1e-9 || Math.abs(loss.y - (lossY + L.fontSize + 2)) < 1e-9, where + ": right by the loss line");
    }
  }
});

test("levels: three and two levels' gauge goes below zero, where the medium absorbs", () => {
  const w = 800;
  const h = heightFor(LEVELS.SIZE, w);
  const G = LEVELS.layout(w, h).gauge;
  function gauge(picture) {
    const { recorder } = drawWith(LEVELS, w, picture);
    const bars = filled(recorder).filter((f) => f.args[0] === G.gainX);
    return { recorder: recorder, bar: bars[0] };
  }
  // The rectangles filled, with their alpha.
  function filled(recorder) {
    const list = [];
    let alpha = 1;
    for (const entry of recorder.log) {
      if (entry.set === "globalAlpha") alpha = entry.value;
      if (entry.call === "fillRect") list.push({ args: entry.args, alpha: alpha });
    }
    return list;
  }
  // Ruby before Fire: the gain −n_t, a bar from zero down, paler.
  const before = gauge(RUBY_BEFORE);
  const zeroY = gaugeY(G, RUBY_BEFORE, 0);
  assertClose(before.bar.args[1], zeroY, 1e-9, "from the zero line");
  assertClose(before.bar.args[1] + before.bar.args[3], gaugeY(G, RUBY_BEFORE, -RUBY_NT), 1e-9, "down to −n_t");
  assert.ok(before.bar.alpha < 1, "paler: the medium absorbs");
  // At the peak: the gain clamped at the loss, a bar from zero up, solid.
  const peak = gauge(RUBY_PEAK);
  assertClose(peak.bar.args[1], gaugeY(G, RUBY_PEAK, 1), 1e-9, "up to the loss");
  assertClose(peak.bar.args[1] + peak.bar.args[3], gaugeY(G, RUBY_PEAK, 0), 1e-9, "from zero");
  assert.equal(peak.bar.alpha, 1);
  // Half the ions up: no gain, no bar.
  assert.equal(gauge(RUBY_HALF).bar, undefined);
  // The zero line across the gauge, with its word under it; the loss line
  // at 1 and the dashed line at the small-signal gain, wherever they are.
  for (const picture of [RUBY_BEFORE, RUBY_PEAK, TWO_LEVEL, TWO_OFF, TWO_STRONG]) {
    const { recorder } = gauge(picture);
    const y0 = gaugeY(G, picture, 0);
    assert.ok(lineAt(recorder, G.left, y0), "a zero line");
    const word = writtenWords(recorder).find((t) => t.text === "Transparent");
    assert.ok(word && word.y > y0 && word.y < G.bottom + 0.5, "its word under it: " + JSON.stringify(word));
    assert.ok(lineAt(recorder, G.left, gaugeY(G, picture, 1)), "the loss line at 1");
    assert.ok(lineAt(recorder, G.gainX, gaugeY(G, picture, picture.smallSignal)), "the dashed line at " + picture.smallSignal);
  }
  // The two-level atom: its gain and its dashed line just under zero.
  const two = gauge(TWO_LEVEL);
  assert.ok(two.bar.args[1] >= gaugeY(G, TWO_LEVEL, 0) - 1e-9, "never above zero");
  // Four levels: no zero line and no word for it, even when the word is given.
  const { recorder } = gauge(levelPicture());
  assert.equal(writtenWords(recorder).find((t) => t.text === "Transparent"), undefined);
});

/* ---------- the Q-switch's loss (stage 8b) ---------- */

test("levels: the scale holds the loss now, and comes down with it when the switch opens", () => {
  assert.equal(LEVELS.scaleMax(YAG_CLOSED), 37 * 1.15);
  assert.equal(LEVELS.scaleMax(RUBY_CLOSED), 14.1 * 1.15);
  // Opened: the scale is the gain's again, so the gain held at the loss
  // is not pressed into the bottom of the gauge (stage 8b review: kept at
  // the closed loss, Nd:YAG's held gain was the bottom fortieth).
  assert.equal(LEVELS.scaleMax(RUBY_OPENED), 8.59 * 1.15, "opened");
  assert.equal(LEVELS.scaleMax(YAG_AFTER), 2 * 1.15, "after the pulse");
  assert.equal(LEVELS.scaleMax(levelPicture({ x: 2, smallSignal: 2, y: 1, loss: 5 })), 5 * 1.15);
  // Without a loss, as before.
  assert.equal(LEVELS.scaleMax(levelPicture({ x: 3, smallSignal: 3, y: 1 })), 3 * 1.15);
});

test("levels: the loss line and its word are at the loss now; none given is 1", () => {
  const w = 800;
  for (const picture of SWITCHED.concat([levelPicture(), RUBY_PEAK])) {
    const { recorder, view } = drawWith(LEVELS, w, picture);
    const L = LEVELS.layout(w, view.h);
    const G = L.gauge;
    const loss = picture.loss === undefined ? 1 : picture.loss;
    const where = (picture.scheme || "four-level") + ", loss " + loss;
    assert.ok(lineAt(recorder, G.left, gaugeY(G, picture, loss)), where + ": the loss line");
    if (loss !== 1) assert.ok(!lineAt(recorder, G.left, gaugeY(G, picture, 1)), where + ": none at the open cavity's");
  }
});

test("levels: the threshold mark on the bars follows the loss: the inversion where the gain reaches it", () => {
  const w = 800;
  const L = LEVELS.layout(w, heightFor(LEVELS.SIZE, w));
  const slot = L.bar.bottom - L.bar.top;
  const mark = (picture, share) => lineAt(drawWith(LEVELS, w, picture).recorder, L.bar.x - 3, L.bar.bottom - slot * share);
  // Four levels: y = loss on the gauge's scale.
  assert.ok(mark(YAG_CLOSED, 37 / LEVELS.scaleMax(YAG_CLOSED)), "four levels behind the closed cell");
  assert.ok(!mark(YAG_CLOSED, 1 / LEVELS.scaleMax(YAG_CLOSED)), "not at the open cavity's threshold");
  // Three levels: the share of ions up at y = loss, (1 + loss/n_t)/2.
  assert.ok(mark(RUBY_FILTER, (1 + 2.98 / RUBY_NT) / 2), "ruby behind its filter");
  assert.ok(mark(RUBY_OPENED, (1 + 1 / RUBY_NT) / 2), "ruby opened: at threshold");
  // A loss no inversion can reach (loss ≥ n_t): no mark.
  const marks = drawWith(LEVELS, w, RUBY_CLOSED).recorder.calls.filter((c, i, all) => c.name === "moveTo" &&
    Math.abs(c.args[0] - (L.bar.x - 3)) < 1e-9 && all[i + 1] && all[i + 1].name === "lineTo" &&
    Math.abs(all[i + 1].args[0] - (L.bar.x + L.bar.w + 3)) < 1e-9);
  assert.equal(marks.length, 0, "ruby behind its closed cell, 14.1 > n_t: no mark");
});
