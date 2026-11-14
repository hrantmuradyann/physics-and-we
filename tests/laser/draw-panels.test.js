/* ============================================================================
   draw-panels.test.js — the two pictures under the bench (stage 6):
     js/laser/ui/draw-levels.js  the four levels of Nd:YAG with the upper
                                 level's population bar, and the gain/loss
                                 gauge (docs/laser-physics.md §11.6, 1–2)
     js/laser/ui/draw-plots.js   output power and inversion against time
                                 (§11.6, 5)
   Both only draw what they are given: numbers in units of the threshold
   (y = N/N_c, x = pump/threshold), powers in W, times in simulated s.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { deepFreeze, assertClose } = require("./helpers.js");
const { createBrowser, fakeContext, themeVariables } = require("./fake-browser.js");

const browser = createBrowser();
for (const file of ["loop.js", "format.js", "draw-levels.js", "draw-plots.js"]) {
  browser.load("js/laser/ui/" + file);
}
const UI = browser.window.LaserUI;
const LEVELS = UI.levels;
const PLOTS = UI.plots;

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
  gain: "Gain", loss: "Loss"
};
const PLOT_WORDS = { power: "Output power", inversion: "Inversion / threshold", threshold: "Threshold", time: "Last" };

function levelPicture(changes) {
  return Object.assign({ x: 3.3, y: 1, stim: 2.3, words: LEVEL_WORDS }, changes || {});
}

function spikyPoints(tNow, window) {
  const points = [];
  for (let i = 0; i <= 400; i++) {
    const t = tNow - window * 1.2 + (i / 400) * window * 1.2;   // some older than the window
    const spike = (t - tNow + 0.6 * window) / (0.02 * window);
    const P = 1.7 * (1 + 4 * Math.exp(-spike * spike));
    points.push({ t: t, P: P, y: 1 + 0.3 * Math.sin(i) });
  }
  return points;
}

function plotPicture(changes) {
  return Object.assign({
    points: spikyPoints(5e-4, 4e-4), tNow: 5e-4, window: 4e-4, Pfloor: 0.74, x: 3.3, words: PLOT_WORDS
  }, changes || {});
}

const LEVEL_CASES = [
  levelPicture(),
  levelPicture({ x: 0, y: 0, stim: 0 }),
  levelPicture({ x: 0.5, y: 3, stim: 0 }),
  levelPicture({ x: 40, y: 1, stim: 39 }),
  levelPicture({ x: 2, y: 1.7, stim: 1e6 })
];
const PLOT_CASES = [
  plotPicture(),
  plotPicture({ points: [] }),
  plotPicture({ points: [{ t: 5e-4, P: 0, y: 0 }] }),
  plotPicture({ points: spikyPoints(5e-4, 4e-4).map((p) => ({ t: p.t, P: 1e-8, y: 0.4 })), x: 0.4 }),
  plotPicture({ x: 0 })
];

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

for (const [name, drawing, cases] of [["levels", LEVELS, LEVEL_CASES], ["plots", PLOTS, PLOT_CASES]]) {
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
    const picture = name === "levels" ? levelPicture({ words: {} }) : plotPicture({ words: {} });
    const { recorder } = drawWith(drawing, 800, picture);
    for (const call of recorder.calls.filter((c) => c.name === "fillText")) {
      assert.ok(!Object.values(name === "levels" ? LEVEL_WORDS : PLOT_WORDS).includes(call.args[0]));
    }
  });
}

/* ---------- the level diagram and the gauge ---------- */

test("levels: the gauge's scale holds the gain, the loss and the small-signal gain, with room above", () => {
  assert.equal(LEVELS.scaleMax({ x: 3, y: 1 }), 3 * 1.15);
  assert.equal(LEVELS.scaleMax({ x: 0.5, y: 0.4 }), 1.15, "the loss line always fits");
  assert.equal(LEVELS.scaleMax({ x: 0.5, y: 2 }), 2 * 1.15, "a high inversion left from a stronger pump");
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

test("levels: the dashed small-signal line is the gain with no light, x on the gauge's scale", () => {
  const w = 800;
  for (const picture of [levelPicture(), levelPicture({ x: 0.6, y: 0.5, stim: 0 }), levelPicture({ x: 2, y: 1.7, stim: 0.3 })]) {
    const { recorder, view } = drawWith(LEVELS, w, picture);
    const g = LEVELS.layout(w, view.h).gauge;
    const smallY = g.bottom - (g.bottom - g.top) * picture.x / LEVELS.scaleMax(picture);
    assert.ok(lineAt(recorder, g.gainX, smallY), "a line across the gain bar at x = " + picture.x);
  }
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

/* ---------- the plots ---------- */

test("plots: the power axis is at least the floor (so spontaneous emission lies on the axis)", () => {
  assertClose(PLOTS.powerMax([{ t: 0, P: 1e-8, y: 0.4 }], 0.74), 0.74 * 1.1, 1e-12, "floor");
  assertClose(PLOTS.powerMax([{ t: 0, P: 8, y: 1 }], 0.74), 8 * 1.1, 1e-12, "a spike");
  assertClose(PLOTS.powerMax([], 0.74), 0.74 * 1.1, 1e-12, "empty");
  assertClose(PLOTS.inversionMax([{ t: 0, P: 0, y: 0.4 }], 0.5), 1.1, 1e-12, "threshold always shown");
  assertClose(PLOTS.inversionMax([{ t: 0, P: 0, y: 2.5 }], 0.5), 2.5 * 1.1, 1e-12);
  assertClose(PLOTS.inversionMax([], 4), 4 * 1.1, 1e-12, "the pump level");
});

test("plots: time runs right to left from now; points older than the window are left out", () => {
  const w = 800;
  const tNow = 1e-3;
  const window = 2e-4;
  const points = [
    { t: tNow - 3e-4, P: 1, y: 1 },     // older than the window
    { t: tNow - window, P: 1, y: 1 },
    { t: tNow - window / 2, P: 1, y: 1 },
    { t: tNow, P: 1, y: 1 }
  ];
  const { recorder, view } = drawWith(PLOTS, w, plotPicture({ points: points, tNow: tNow, window: window }));
  const box = PLOTS.layout(w, view.h).power;
  const xs = recorder.calls.filter((c) => c.name === "moveTo" || c.name === "lineTo").map((c) => c.args[0]);
  assert.ok(xs.some((x) => Math.abs(x - box.right) < 1e-9), "now at the right edge");
  assert.ok(xs.some((x) => Math.abs(x - box.left) < 1e-9), "a window ago at the left edge");
  assert.ok(xs.some((x) => Math.abs(x - (box.left + box.right) / 2) < 1e-9), "half way");
  assert.ok(xs.every((x) => x >= box.left - 1e-9 && x <= box.right + 1e-9), "nothing outside the plot's sides");
});

test("plots: the threshold line of the inversion plot sits at y = 1", () => {
  const w = 800;
  const picture = plotPicture();
  const { recorder, view } = drawWith(PLOTS, w, picture);
  const box = PLOTS.layout(w, view.h).inversion;
  const top = PLOTS.inversionMax(picture.points.filter((p) => p.t >= picture.tNow - picture.window), picture.x);
  const yLine = box.bottom - (box.bottom - box.top) / top;
  const found = recorder.calls.some((c, i) => c.name === "moveTo" && Math.abs(c.args[1] - yLine) < 1e-9 &&
    c.args[0] === box.left && recorder.calls[i + 1].name === "lineTo" && recorder.calls[i + 1].args[0] === box.right);
  assert.ok(found, "a full-width line at y = 1");
});

test("plots: the threshold word stays inside the inversion box, clear of its title, at every width and pump", () => {
  // With the pump off the axis ends at 1.1, so the threshold line is near
  // the top of the box; the word once sat on the box's title there.
  for (const w of WIDTHS) {
    for (const picture of PLOT_CASES.concat([plotPicture({ x: 0, points: [{ t: 5e-4, P: 0, y: 0 }] }), plotPicture({ x: 1, points: [] })])) {
      const { recorder, view } = drawWith(PLOTS, w, picture);
      const L = PLOTS.layout(w, view.h);
      const call = recorder.calls.find((c) => c.name === "fillText" && c.args[0] === PLOT_WORDS.threshold);
      assert.ok(call, "the threshold word is written at " + w);
      const baseline = call.args[2];
      assert.ok(baseline - L.fontSize >= L.inversion.top - 1e-9 && baseline <= L.inversion.bottom + 1e-9,
        w + " px, x = " + picture.x + ": the word at " + baseline + ", the box " + L.inversion.top + "–" + L.inversion.bottom);
    }
  }
});

test("plots: the axes are labelled with the scale (power at the top, the window's length)", () => {
  const picture = plotPicture();
  const { recorder } = drawWith(PLOTS, 800, picture);
  const texts = recorder.calls.filter((c) => c.name === "fillText").map((c) => c.args[0]);
  const shown = picture.points.filter((p) => p.t >= picture.tNow - picture.window);
  assert.ok(texts.includes(UI.format.si(PLOTS.powerMax(shown, picture.Pfloor), "W", 2)), texts.join(" | "));
  assert.ok(texts.some((t) => t.includes(UI.format.si(picture.window, "s", 2))), texts.join(" | "));
  assert.ok(texts.includes("Output power") && texts.includes("Inversion / threshold"));
});
