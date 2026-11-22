/* ============================================================================
   draw-helpers.js — what the tests of the drawings share (draw-plots.test.js,
   draw-photons.test.js): a view on a recording context, and the checks every
   drawing must pass whatever it draws.

   Not a test file itself.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { deepFreeze } = require("./helpers.js");
const { fakeContext, THEMES, themeVariables } = require("./fake-browser.js");

// Every width from a small phone to a wide window, plus 327 px: a 375 px
// phone minus the page's side padding.
const WIDTHS = [327];
for (let w = 280; w <= 1400; w += 40) WIDTHS.push(w);

// The height the loop gives a canvas of width w (loop.test.js checks the loop).
function heightFor(size, w) {
  return Math.max(size.minHeight, Math.min(w / size.aspect, size.maxHeight));
}

// The palette the loop hands to a draw function, in one theme.
function palette(UI, theme) {
  const variables = themeVariables()[theme];
  const colors = {};
  for (const name of Object.keys(UI.loop.PALETTE)) colors[name] = variables[UI.loop.PALETTE[name]];
  return colors;
}

// A view as loop.js makes it, on a recording context.
//   options: { theme: a name in THEMES (fake-browser.js), t: seconds the loop has run }
function makeView(UI, size, w, options) {
  const opts = options || {};
  const recorder = fakeContext();
  const view = {
    g: recorder.context, w: w, h: heightFor(size, w), dpr: 1,
    colors: deepFreeze(palette(UI, opts.theme || "site")), font: "Test Sans", t: opts.t || 0, dt: 0
  };
  return { recorder: recorder, view: view };
}

const POSITION_CALLS = ["moveTo", "lineTo", "fillRect", "strokeRect", "rect", "clearRect", "arc", "fillText"];

// Every coordinate a drawing passes to the canvas is a number inside it.
// (Not for drawings that move the origin with translate().)
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

// The checks every drawing must pass.
//   cases: [function (view) { ...draws one picture into view... }]
//   options.inside: false for a drawing that uses translate()
function commonDrawingTests(name, UI, size, cases, options) {
  const opts = options || {};

  if (opts.inside !== false) {
    test(name + ": every line, box and word inside the canvas, at every width and for every picture", () => {
      for (const w of WIDTHS) {
        cases.forEach((drawCase, index) => {
          const { recorder, view } = makeView(UI, size, w);
          drawCase(view);
          assertAllInside(recorder, view.w, view.h, name + " w=" + w + " case " + index);
        });
      }
    });
  }

  test(name + ": colours only from the theme", () => {
    for (const theme of THEMES) {
      const allowed = Object.values(palette(UI, theme));
      for (const drawCase of cases) {
        const { recorder, view } = makeView(UI, size, 800, { theme: theme });
        drawCase(view);
        for (const set of recorder.sets) {
          if (set.name === "fillStyle" || set.name === "strokeStyle" || set.name === "shadowColor") {
            assert.ok(allowed.includes(set.value), theme + ": " + set.name + " = " + set.value);
          }
        }
      }
    }
  });

  test(name + ": clears first, leaves the context as it found it", () => {
    for (const drawCase of cases) {
      const { recorder, view } = makeView(UI, size, 600);
      drawCase(view);
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
      for (const drawCase of cases) {
        const { recorder, view } = makeView(UI, size, w);
        drawCase(view);
        for (const call of recorder.calls.filter((c) => c.name === "fillText")) {
          assert.equal(call.args.length, 4, "fillText without maxWidth: " + call.args[0]);
          assert.ok(call.args[3] > 0, "a slot of width " + call.args[3]);
          assert.ok(typeof call.args[0] === "string" && call.args[0].length > 0);
          assert.ok(!/undefined|NaN|Infinity|null/.test(call.args[0]), call.args[0]);
        }
      }
    }
  });
}

module.exports = { WIDTHS, heightFor, palette, makeView, assertAllInside, commonDrawingTests };
