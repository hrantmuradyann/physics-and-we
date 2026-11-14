/* ============================================================================
   draw-bench.test.js — js/laser/ui/draw-bench.js, the drawing of the bench.

   layout(w, h) is plain arithmetic, so it is checked for every canvas width
   the page can have: parts inside the canvas, in order along the axis, and
   labels that do not run into each other. draw(view, labels) is run on a
   recording context: it may only use the theme's colours, and it must write
   exactly the labels it was given, each squeezed into its own slot.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { deepFreeze } = require("./helpers.js");
const { createBrowser, fakeContext, themeVariables } = require("./fake-browser.js");

function load() {
  const browser = createBrowser();
  browser.load("js/laser/ui/loop.js");
  browser.load("js/laser/ui/draw-bench.js");
  return browser.window.LaserUI;
}

const UI = load();
const bench = UI.bench;
const SIZE = bench.SIZE;

// The height the loop gives a canvas of width w (loop.test.js checks the loop).
function heightFor(w) {
  return Math.max(SIZE.minHeight, Math.min(w / SIZE.aspect, SIZE.maxHeight));
}

// Every width from a small phone (280 px) to a wide window, plus 327 px:
// a 375 px phone minus the page's side padding.
const WIDTHS = [327];
for (let w = 280; w <= 1400; w += 20) WIDTHS.push(w);

// The palette the loop hands to draw(), in one theme.
function palette(theme) {
  const variables = themeVariables()[theme];
  const colors = {};
  for (const name of Object.keys(UI.loop.PALETTE)) colors[name] = variables[UI.loop.PALETTE[name]];
  return colors;
}

const LABELS = deepFreeze({
  backMirror: "Back mirror",
  outputMirror: "Output mirror",
  medium: "Gain medium",
  pump: "Pump lamp"
});

function drawAt(w, labels, theme) {
  const recorder = fakeContext();
  const view = {
    g: recorder.context, w: w, h: heightFor(w), dpr: 1,
    colors: deepFreeze(palette(theme || "dark")), font: "Test Sans", t: 0, dt: 0
  };
  bench.draw(view, labels || LABELS);
  return { recorder: recorder, view: view };
}

function inside(rect, w, h) {
  return rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= w && rect.y + rect.h <= h;
}

// The box a label's letters take: from one font size above the baseline to
// 0.3 of it below (letters such as Armenian ք and ր go below the line).
function labelBox(label, fontSize) {
  let left = label.x;
  if (label.align === "center") left = label.x - label.maxWidth / 2;
  if (label.align === "right") left = label.x - label.maxWidth;
  return { left: left, right: left + label.maxWidth, top: label.y - fontSize, bottom: label.y + 0.3 * fontSize };
}

test("loads as LaserUI.bench, frozen, with the canvas size the page uses", () => {
  assert.ok(Object.isFrozen(bench));
  assert.ok(Object.isFrozen(SIZE));
  assert.ok(Object.isFrozen(bench.PARTS));
  // PARTS names exactly the labels draw() writes (page.js fills them in).
  assert.deepEqual(Array.from(bench.PARTS).sort(), Object.keys(LABELS).sort());
  assert.ok(SIZE.aspect > 1, "a bench is wider than it is high");
  assert.ok(SIZE.minHeight > 0 && SIZE.minHeight <= SIZE.maxHeight);
});

test("layout: every part inside the canvas, in order along the axis", () => {
  for (const w of WIDTHS) {
    const h = heightFor(w);
    const L = bench.layout(w, h);
    const where = "w = " + w;
    for (const name of ["backMirror", "outputMirror", "rod", "lamp"]) {
      assert.ok(inside(L[name], w, h), where + ": " + name + " " + JSON.stringify(L[name]));
      assert.ok(L[name].w > 0 && L[name].h > 0, where + ": " + name + " has a size");
    }
    assert.ok(L.backMirror.x + L.backMirror.w < L.rod.x, where + ": back mirror, then the rod");
    assert.ok(L.rod.x + L.rod.w < L.outputMirror.x, where + ": the rod, then the output mirror");
    // The rod sits on the axis, and the mirrors are taller than the rod,
    // so light along the rod meets both mirrors.
    assert.ok(Math.abs(L.rod.y + L.rod.h / 2 - L.axis.y) < 1e-9, where + ": rod on the axis");
    for (const mirror of [L.backMirror, L.outputMirror]) {
      assert.ok(mirror.y < L.rod.y && mirror.y + mirror.h > L.rod.y + L.rod.h, where + ": mirror covers the rod");
    }
    // The axis runs from one mirror's face to the other's.
    assert.equal(L.axis.x1, L.backMirror.x + L.backMirror.w, where);
    assert.equal(L.axis.x2, L.outputMirror.x, where);
    // The lamp lies under the rod, not touching it, and no longer than it.
    assert.ok(L.lamp.y > L.rod.y + L.rod.h, where + ": a gap between rod and lamp");
    assert.ok(L.lamp.x >= L.rod.x && L.lamp.x + L.lamp.w <= L.rod.x + L.rod.w, where + ": lamp under the rod");
    // The two mirrors look alike: same size, same height on the page.
    assert.equal(L.backMirror.h, L.outputMirror.h, where);
    assert.equal(L.backMirror.w, L.outputMirror.w, where);
    assert.equal(L.backMirror.y, L.outputMirror.y, where);
    // The picture is symmetric: the same margin outside each mirror, and
    // the rod, the lamp and the middle labels centred on the canvas.
    const tiny = 1e-9 * w;
    assert.ok(Math.abs((w - (L.outputMirror.x + L.outputMirror.w)) - L.backMirror.x) < tiny, where + ": same margins");
    assert.ok(Math.abs(L.rod.x + L.rod.w / 2 - w / 2) < tiny, where + ": rod centred");
    assert.ok(Math.abs(L.lamp.x + L.lamp.w / 2 - w / 2) < tiny, where + ": lamp centred");
    assert.equal(L.labels.medium.x, w / 2, where);
    assert.equal(L.labels.pump.x, w / 2, where);
  }
});

test("layout: labels inside the canvas, readable, and never on top of each other or a part", () => {
  for (const w of WIDTHS) {
    const h = heightFor(w);
    const L = bench.layout(w, h);
    const fs = L.fontSize;
    const where = "w = " + w;
    assert.ok(fs >= 11 && fs <= 16, where + ": font size " + fs);
    const box = {};
    for (const name of ["backMirror", "outputMirror", "medium", "pump"]) {
      const label = L.labels[name];
      assert.ok(["left", "center", "right"].includes(label.align), where + ": " + name);
      assert.ok(label.maxWidth >= 60, where + ": " + name + " has room for a word, got " + label.maxWidth);
      box[name] = labelBox(label, fs);
      const b = box[name];
      assert.ok(b.left >= 0 && b.right <= w && b.top >= 0 && b.bottom <= h,
        where + ": " + name + " inside the canvas " + JSON.stringify(b));
    }
    // The mirror labels sit above their mirrors, side by side with a gap.
    assert.ok(box.backMirror.bottom < L.backMirror.y, where + ": back label above its mirror");
    assert.ok(box.outputMirror.bottom < L.outputMirror.y, where + ": output label above its mirror");
    assert.ok(box.backMirror.right < box.outputMirror.left, where + ": the two mirror labels apart");
    // The medium label: below the mirror labels, above the rod, between the mirrors.
    assert.ok(box.medium.top > Math.max(box.backMirror.bottom, box.outputMirror.bottom), where + ": medium row below");
    assert.ok(box.medium.bottom < L.rod.y, where + ": medium label above the rod");
    assert.ok(box.medium.left > L.backMirror.x + L.backMirror.w &&
              box.medium.right < L.outputMirror.x, where + ": medium label between the mirrors");
    // The pump label: under the lamp.
    assert.ok(box.pump.top > L.lamp.y + L.lamp.h, where + ": pump label under the lamp");
  }
});

test("draw: every colour it uses is a theme colour, in both themes", () => {
  for (const theme of ["dark", "light"]) {
    const allowed = Object.values(palette(theme));
    for (const w of [327, 960]) {
      const { recorder } = drawAt(w, LABELS, theme);
      const colours = recorder.sets.filter((s) => /Style$|Color$/.test(s.name));
      assert.ok(colours.length >= 4, "it sets some colours");
      for (const set of colours) {
        assert.ok(allowed.includes(set.value), theme + ": " + set.name + " = " + set.value + " is not a theme colour");
      }
    }
  }
});

test("draw: clears the canvas first and leaves the context as it found it", () => {
  const { recorder, view } = drawAt(600);
  assert.deepEqual(recorder.calls[0], { name: "clearRect", args: [0, 0, view.w, view.h] });
  const saves = recorder.calls.filter((c) => c.name === "save").length;
  const restores = recorder.calls.filter((c) => c.name === "restore").length;
  assert.ok(saves >= 1);
  assert.equal(saves, restores, "every save has its restore");
  // Everything that changes the context's settings is inside a save/restore,
  // so the next drawing (stage 6 draws more on the same canvas) starts clean.
  let depth = 0;
  for (const entry of recorder.log) {
    if (entry.call === "save") depth += 1;
    if (entry.call === "restore") depth -= 1;
    if (entry.set) assert.ok(depth > 0, entry.set + " set outside save/restore");
    if (entry.call === "setLineDash") assert.ok(depth > 0, "setLineDash outside save/restore");
  }
});

test("draw: writes the four labels where the layout puts them, squeezed into their slots", () => {
  for (const w of [327, 600, 1100]) {
    const { recorder, view } = drawAt(w);
    const L = bench.layout(view.w, view.h);
    let align = null;
    let font = null;
    const written = {};
    for (const entry of recorder.log) {
      if (entry.set === "textAlign") align = entry.value;
      if (entry.set === "font") font = entry.value;
      if (entry.call === "fillText") {
        const name = Object.keys(LABELS).find((key) => LABELS[key] === entry.args[0]);
        assert.ok(name, "wrote a label it was given: " + entry.args[0]);
        const spot = L.labels[name];
        assert.deepEqual(entry.args, [LABELS[name], spot.x, spot.y, spot.maxWidth], name);
        assert.equal(align, spot.align, name + " alignment");
        assert.equal(font, "600 " + L.fontSize + "px Test Sans", name + " font");
        written[name] = (written[name] || 0) + 1;
      }
    }
    assert.deepEqual(written, { backMirror: 1, outputMirror: 1, medium: 1, pump: 1 }, "w = " + w);
  }
});

test("draw: an empty label is left out, not written as an empty string", () => {
  const labels = deepFreeze(Object.assign({}, LABELS, { pump: "" }));
  const { recorder } = drawAt(600, labels);
  const texts = recorder.calls.filter((c) => c.name === "fillText").map((c) => c.args[0]);
  assert.deepEqual(texts.sort(), ["Back mirror", "Gain medium", "Output mirror"]);
});

test("draw: draws all four parts", () => {
  const { recorder, view } = drawAt(600);
  const L = bench.layout(view.w, view.h);
  const filled = recorder.calls.filter((c) => c.name === "fillRect").map((c) => c.args.join(","));
  for (const name of ["backMirror", "outputMirror", "rod", "lamp"]) {
    const r = L[name];
    assert.ok(filled.includes([r.x, r.y, r.w, r.h].join(",")), name + " is filled");
  }
  // The axis is a dashed line from mirror to mirror.
  const moves = recorder.calls.filter((c) => c.name === "moveTo" || c.name === "lineTo").map((c) => c.args);
  assert.deepEqual(moves, [[L.axis.x1, L.axis.y], [L.axis.x2, L.axis.y]]);
  assert.ok(recorder.calls.some((c) => c.name === "setLineDash" && c.args[0].length > 0));
});
