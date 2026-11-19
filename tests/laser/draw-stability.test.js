/* ============================================================================
   draw-stability.test.js — js/laser/ui/draw-stability.js: the stability
   diagram of the two mirrors (docs/laser-physics.md §7.1; docs/laser-plan.md,
   stage 10b).
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { deepFreeze, assertClose } = require("./helpers.js");
const { createBrowser } = require("./fake-browser.js");
const { WIDTHS, heightFor, makeView, commonDrawingTests } = require("./draw-helpers.js");

const browser = createBrowser();
for (const file of ["loop.js", "format.js", "draw-stability.js"]) browser.load("js/laser/ui/" + file);
const UI = browser.window.LaserUI;
const ST = UI.stability;

const WORDS = deepFreeze({ title: "Stability of the mirrors", stable: "stable", g1: "g₁ back mirror", g2: "g₂ output mirror" });

// Every pair the shared checks draw: none, inside, on the edges, outside
// and past the axes' ends.
const PAIRS = [null, { g1: 1, g2: 0.33, stable: true }, { g1: 1, g2: 1, stable: false }, { g1: 0, g2: 0, stable: true },
  { g1: -0.67, g2: -0.67, stable: true }, { g1: 1.8, g2: -0.4, stable: false }, { g1: 5, g2: -9, stable: false },
  { g1: -40, g2: 0.5, stable: false }];

commonDrawingTests("stability", UI, ST.SIZE, PAIRS.map((pair) => (view) => ST.draw(view, WORDS, pair === null ? null : deepFreeze(pair))));

function drawn(pair, w) {
  const made = makeView(UI, ST.SIZE, w || 600);
  ST.draw(made.view, WORDS, pair === null ? null : deepFreeze(pair));
  return made;
}

test("loads as LaserUI.stability, frozen; the axes run from −2 to 2", () => {
  assert.ok(Object.isFrozen(ST));
  assert.ok(Object.isFrozen(ST.SIZE) && Object.isFrozen(ST.WORDS));
  assert.deepEqual(Array.from(ST.WORDS), ["title", "stable", "g1", "g2"]);
  assert.equal(ST.RANGE, 2);
});

test("layout: a square plot inside the canvas, axes crossing in its middle, every word inside the canvas", () => {
  for (const w of WIDTHS) {
    const h = heightFor(ST.SIZE, w);
    const P = ST.layout(w, h);
    assert.ok(P.plot.size > 100, "w " + w + ": a plot of " + P.plot.size);
    assert.ok(P.plot.x >= 0 && P.plot.y >= 0 && P.plot.x + P.plot.size <= w && P.plot.y + P.plot.size <= h, "w " + w);
    assertClose(P.center.x, P.plot.x + P.plot.size / 2, 1e-12);
    assertClose(P.perUnit * 2 * ST.RANGE, P.plot.size, 1e-12);
    // The title above the plot.
    assert.ok(P.labels.title.y < P.plot.y, "w " + w + ": the title above the plot");
    for (const name of ST.WORDS) assert.ok(P.labels[name].maxWidth >= 20, "w " + w + ": room for " + name);
    // g₁ just above the axis, clear of the tick numbers under it (the
    // review: under it, "g₁ հետին" covered the "1" on a phone).
    assert.ok(P.labels.g1.y < P.center.y, "w " + w + ": g₁ above the axis");
    assert.ok(P.labels.g1.y > P.center.y - 0.5 * P.perUnit, "w " + w + ": under the hyperbola's end (g₂ = 0.5)");
  }
});

test("the pair's dot at (g₁, g₂): right for g₁, up for g₂; solid in the accent when stable", () => {
  const { recorder, view } = drawn({ g1: 1, g2: 0.33, stable: true });
  const P = ST.layout(view.w, view.h);
  const arc = recorder.calls.filter((c) => c.name === "arc").pop();
  assertClose(arc.args[0], P.center.x + 1 * P.perUnit, 1e-12, "x");
  assertClose(arc.args[1], P.center.y - 0.33 * P.perUnit, 1e-12, "y");
  const after = recorder.log.slice(recorder.log.findIndex((e) => e.call === "arc" && e.args[0] === arc.args[0]));
  const fillAt = after.findIndex((e) => e.call === "fill");
  assert.ok(fillAt > 0, "filled");
  const fillStyle = after.slice(0, fillAt).filter((e) => e.set === "fillStyle").pop();
  assert.equal(fillStyle.value, view.colors.accent2, "the stable colour");
  // Unstable: filled, but muted.
  const out = drawn({ g1: 1.8, g2: -0.4, stable: false });
  const log = out.recorder.log;
  const at = log.findIndex((e) => e.call === "arc");
  const style = log.slice(at).filter((e) => e.set === "fillStyle")[0];
  assert.equal(style.value, out.view.colors.muted);
});

test("a pair past the axes' ends: a hollow dot on the edge, in its direction", () => {
  const { recorder, view } = drawn({ g1: 5, g2: -9, stable: false });
  const P = ST.layout(view.w, view.h);
  const arcs = recorder.calls.filter((c) => c.name === "arc");
  const dot = arcs[arcs.length - 1];
  assertClose(dot.args[0], P.center.x + 2 * P.perUnit, 1e-12, "at g₁ = 2");
  assertClose(dot.args[1], P.center.y + 2 * P.perUnit, 1e-12, "at g₂ = −2");
  const i = recorder.calls.indexOf(dot);
  const rest = recorder.calls.slice(i + 1).map((c) => c.name);
  assert.ok(!rest.includes("fill"), "hollow");
  assert.ok(rest.includes("stroke"));
  // No pair: no dot.
  assert.equal(drawn(null).recorder.calls.filter((c) => c.name === "arc").length, 0);
});

test("the shaded region is 0 < g₁g₂ < 1: its edge runs along g₁g₂ = 1 in the first and third quadrants", () => {
  const { recorder, view } = drawn(null);
  const P = ST.layout(view.w, view.h);
  // Every lineTo of the two shaded regions and the two curves lies on an
  // axis or on the hyperbola.
  const points = recorder.calls.filter((c) => c.name === "lineTo").map((c) => ({
    g1: (c.args[0] - P.center.x) / P.perUnit,
    g2: (P.center.y - c.args[1]) / P.perUnit
  }));
  const onHyperbola = points.filter((p) => Math.abs(p.g1 * p.g2 - 1) < 1e-9);
  assert.ok(onHyperbola.some((p) => p.g1 > 0) && onHyperbola.some((p) => p.g1 < 0), "both branches");
  assert.ok(onHyperbola.length >= 4 * 40, "the shaded edges and the curves: " + onHyperbola.length);
  // (0.5, 2) to (2, 0.5): the branch inside the plot.
  for (const p of onHyperbola) assert.ok(Math.abs(p.g1) >= 0.5 - 1e-9 && Math.abs(p.g1) <= 2 + 1e-9, "inside the axes");
  // The word "stable" lies inside the region: 0 < g₁g₂ < 1 at its spot.
  const spot = P.labels.stable;
  const g1 = (spot.x - P.center.x) / P.perUnit;
  const g2 = (P.center.y - spot.y) / P.perUnit;
  assert.ok(g1 * g2 > 0 && g1 * g2 < 1, "the word in the region: " + g1 * g2);
  assert.ok(recorder.calls.some((c) => c.name === "fillText" && c.args[0] === "stable"));
});

test("every word, in the visitor's language; an empty one left out", () => {
  const { recorder } = drawn({ g1: 0, g2: 0, stable: true });
  const texts = recorder.calls.filter((c) => c.name === "fillText").map((c) => c.args[0]);
  for (const name of ST.WORDS) assert.ok(texts.includes(WORDS[name]), name);
  const made = makeView(UI, ST.SIZE, 600);
  ST.draw(made.view, deepFreeze({ title: "", stable: "", g1: "g₁", g2: "" }), null);
  const fewer = made.recorder.calls.filter((c) => c.name === "fillText").map((c) => c.args[0]);
  assert.ok(fewer.includes("g₁") && !fewer.includes(""));
  assert.ok(!fewer.includes("stable"));
});
