/* ============================================================================
   draw-bench.test.js — js/laser/ui/draw-bench.js, the drawing of the bench.

   layout(w, h) is plain arithmetic, so it is checked for every canvas width
   the page can have: parts inside the canvas, in order along the axis, and
   labels that do not run into each other. draw(view, labels, light) is run
   on a recording context: it may only use the theme's colours, it must
   write exactly the labels it was given, each squeezed into its own slot,
   and its rays must run from mirror face to mirror face, with as many
   leaving as the output mirror lets through (docs/laser-plan.md, stage 6b).
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { deepFreeze, assertClose } = require("./helpers.js");
const { createBrowser, fakeContext, themeVariables } = require("./fake-browser.js");

function load() {
  const browser = createBrowser();
  browser.load("js/laser/ui/loop.js");
  browser.load("js/laser/ui/format.js");
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
  pump: "Pump diodes",
  transmission: "Transmission"
});
const NB = "\u00a0";

const LASING = deepFreeze({ beam: 1, pump: 0.25, transmission: 0.05 });

function drawAt(w, labels, theme, light) {
  const recorder = fakeContext();
  const view = {
    g: recorder.context, w: w, h: heightFor(w), dpr: 1,
    colors: deepFreeze(palette(theme || "dark")), font: "Test Sans", t: 0, dt: 0
  };
  bench.draw(view, labels || LABELS, light === undefined ? undefined : deepFreeze(light));
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

// The straight lines a drawing strokes: [{ x1, y1, x2, y2, alpha, lineWidth,
// strokeStyle }], one for every moveTo directly followed by a lineTo and a
// stroke.
function strokedLines(recorder) {
  const lines = [];
  const state = { globalAlpha: 1, lineWidth: 1, strokeStyle: null };
  const log = recorder.log;
  for (let i = 0; i < log.length; i++) {
    const entry = log[i];
    if (entry.set && entry.set in state) state[entry.set] = entry.value;
    if (entry.call === "moveTo" && log[i + 1] && log[i + 1].call === "lineTo" && log[i + 2] && log[i + 2].call === "stroke") {
      lines.push({
        x1: entry.args[0], y1: entry.args[1], x2: log[i + 1].args[0], y2: log[i + 1].args[1],
        alpha: state.globalAlpha, lineWidth: state.lineWidth, strokeStyle: state.strokeStyle
      });
    }
  }
  return lines;
}

// The rays between the mirrors: horizontal lines from the back mirror's
// face to the output mirror's.
function raysInside(recorder, L) {
  return strokedLines(recorder).filter((line) => line.y1 === line.y2 &&
    Math.abs(line.x1 - bench.faceX(L, "back", line.y1)) < 1e-9 &&
    Math.abs(line.x2 - bench.faceX(L, "output", line.y1)) < 1e-9);
}

// The rays that leave: from the output mirror's back to the edge of the canvas.
function raysLeaving(recorder, L, view) {
  const from = L.outputMirror.x + L.outputMirror.w;
  return strokedLines(recorder).filter((line) => line.y1 === line.y2 &&
    Math.abs(line.x1 - from) < 1e-9 && Math.abs(line.x2 - view.w) < 1e-9);
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

test("layout: every part inside the canvas, in order along the axis, standing on the bench", () => {
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
      assert.ok(Math.abs(mirror.y + mirror.h / 2 - L.axis.y) < 1e-9, where + ": mirror centred on the axis");
    }
    // The axis runs from one mirror's inner edge to the other's.
    assert.equal(L.axis.x1, L.backMirror.x + L.backMirror.w, where);
    assert.equal(L.axis.x2, L.outputMirror.x, where);
    // The lamp lies under the rod, not touching it, and no longer than it.
    assert.ok(L.lamp.y > L.rod.y + L.rod.h + 10, where + ": room for the pump light between rod and lamp");
    assert.ok(L.lamp.x >= L.rod.x && L.lamp.x + L.lamp.w <= L.rod.x + L.rod.w, where + ": lamp under the rod");
    // Everything stands above the bench, with room for a row of words under it.
    assert.ok(L.railY > L.lamp.y + L.lamp.h && L.railY > L.backMirror.y + L.backMirror.h + 3, where + ": parts above the bench");
    assert.ok(L.railY < h - 1.5 * L.fontSize, where + ": words fit under the bench");
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
    // Room right of the output mirror for the rays that leave.
    assert.ok(w - (L.outputMirror.x + L.outputMirror.w) >= 30, where + ": room for the rays that leave");
  }
});

test("layout: an odd number of rays, 5 px apart or more, inside the rod, the middle one on the axis", () => {
  let most = 0;
  for (const w of WIDTHS) {
    const L = bench.layout(w, heightFor(w));
    const rays = Array.from(L.rays);
    const where = "w = " + w;
    assert.ok(rays.length % 2 === 1 && rays.length >= 3 && rays.length <= 21, where + ": " + rays.length + " rays");
    assertClose(rays[(rays.length - 1) / 2], L.axis.y, 1e-12, where + ": the middle ray on the axis");
    for (let i = 1; i < rays.length; i++) {
      assert.ok(rays[i] - rays[i - 1] >= 5 - 1e-9, where + ": rays " + (rays[i] - rays[i - 1]) + " px apart");
      assertClose(rays[i] - rays[i - 1], rays[1] - rays[0], 1e-9, where + ": evenly spaced");
    }
    assert.ok(rays[0] > L.rod.y + 2 && rays[rays.length - 1] < L.rod.y + L.rod.h - 2, where + ": inside the rod");
    most = Math.max(most, rays.length);
  }
  assert.ok(most >= 13, "a wide bench shows many rays: " + most);
  // As many as fit: one more pair would be closer than 5 px.
  const L = bench.layout(900, heightFor(900));
  const spread = L.rays[L.rays.length - 1] - L.rays[0];
  assert.ok(spread / (L.rays.length + 1) < 5, "no room for two more rays");
});

test("faceX: a mirror's face is at its inner edge at the top and bottom, and curved away from the rod between", () => {
  const L = bench.layout(900, heightFor(900));
  const back = L.backMirror;
  const output = L.outputMirror;
  assert.equal(bench.faceX(L, "back", back.y), back.x + back.w);
  assert.equal(bench.faceX(L, "back", back.y + back.h), back.x + back.w);
  assertClose(bench.faceX(L, "back", L.axis.y), back.x + back.w - L.sag, 1e-12, "deepest on the axis");
  assert.equal(bench.faceX(L, "output", output.y), output.x);
  assertClose(bench.faceX(L, "output", L.axis.y), output.x + L.sag, 1e-12, "the output mirror, mirrored");
  assert.ok(L.sag > 0 && L.sag < back.w, "the curve stays inside the glass");
  // The two faces mirror each other at every height.
  for (const y of L.rays) {
    assertClose(bench.faceX(L, "back", y) - back.x, output.x + output.w - bench.faceX(L, "output", y), 1e-9, "at " + y);
  }
});

test("raysOut: the share of the rays the output mirror lets through, at least one", () => {
  assert.equal(bench.raysOut(15, 0.05), 1);         // 0.75 of a ray
  assert.equal(bench.raysOut(15, 0.1), 2);          // 1.5 rounds to 2
  assert.equal(bench.raysOut(15, 0.3), 5);          // 4.5 rounds to 5
  assert.equal(bench.raysOut(21, 0.3), 6);
  assert.equal(bench.raysOut(15, 0.005), 1, "the one ray still leaves");
  assert.equal(bench.raysOut(15, 1), 15);
  assert.equal(bench.raysOut(15, 2), 15, "never more than there are");
  assert.equal(bench.raysOut(15, undefined), 1);
  assert.equal(bench.raysOut(15, NaN), 1);
});

test("layout: labels inside the canvas, readable, and never on top of each other or a part", () => {
  for (const w of WIDTHS) {
    const h = heightFor(w);
    const L = bench.layout(w, h);
    const fs = L.fontSize;
    const where = "w = " + w;
    assert.ok(fs >= 11 && fs <= 16, where + ": font size " + fs);
    const box = {};
    for (const name of bench.PARTS) {
      const label = L.labels[name];
      assert.ok(["left", "center", "right"].includes(label.align), where + ": " + name);
      assert.ok(label.maxWidth >= 60, where + ": " + name + " has room for a word, got " + label.maxWidth);
      box[name] = labelBox(label, fs);
      const b = box[name];
      assert.ok(b.left >= 0 && b.right <= w && b.top >= 0 && b.bottom <= h,
        where + ": " + name + " inside the canvas " + JSON.stringify(b));
    }
    // The mirror labels sit above their mirrors, side by side with a gap.
    assert.ok(box.backMirror.bottom < L.backMirror.y - 3, where + ": back label above its mirror's holder");
    assert.ok(box.outputMirror.bottom < L.outputMirror.y - 3, where + ": output label above its mirror's holder");
    assert.ok(box.backMirror.right < box.outputMirror.left, where + ": the two mirror labels apart");
    // The medium label: below the mirror labels, above the rod, between the mirrors.
    assert.ok(box.medium.top > Math.max(box.backMirror.bottom, box.outputMirror.bottom), where + ": medium row below");
    assert.ok(box.medium.bottom < L.rod.y, where + ": medium label above the rod");
    assert.ok(box.medium.left > L.backMirror.x + L.backMirror.w &&
              box.medium.right < L.outputMirror.x, where + ": medium label between the mirrors");
    // Under the bench: the pump's name in the middle.
    assert.ok(box.pump.top > L.railY, where + ": pump label under the bench");
    // The transmission: right under the output mirror's name, right above
    // the output mirror, aligned with the name, with the whole row to
    // itself: room for "Թափանցելիություն 5.00 %" (23 letters) even on a
    // phone (squeezed to 40 % under the bench; stage 6b review).
    const T = L.labels.transmission;
    assert.equal(T.align, "right", where);
    assert.equal(T.x, L.labels.outputMirror.x, where + ": under the output mirror's name");
    assert.ok(box.transmission.top >= box.outputMirror.bottom - 1e-9, where + ": below the mirror names");
    assert.ok(box.transmission.bottom < L.outputMirror.y - 3, where + ": above the output mirror's holder");
    assert.ok(box.transmission.bottom < box.medium.top, where + ": above the medium's name");
    assert.ok(T.maxWidth >= 23 * 0.62 * fs, where + ": room for the transmission, got " + T.maxWidth);
  }
});

test("draw: every colour it uses is a theme colour, in both themes", () => {
  for (const theme of ["dark", "light"]) {
    const allowed = Object.values(palette(theme));
    for (const w of [327, 960]) {
      for (const light of [undefined, LASING]) {
        const { recorder } = drawAt(w, LABELS, theme, light);
        const colours = recorder.sets.filter((s) => /Style$|Color$/.test(s.name));
        assert.ok(colours.length >= 4, "it sets some colours");
        for (const set of colours) {
          assert.ok(allowed.includes(set.value), theme + ": " + set.name + " = " + set.value + " is not a theme colour");
        }
      }
    }
  }
});

test("draw: clears the canvas first and leaves the context as it found it", () => {
  for (const light of [undefined, LASING]) {
    const { recorder, view } = drawAt(600, LABELS, "dark", light);
    assert.deepEqual(recorder.calls[0], { name: "clearRect", args: [0, 0, view.w, view.h] });
    const saves = recorder.calls.filter((c) => c.name === "save").length;
    const restores = recorder.calls.filter((c) => c.name === "restore").length;
    assert.ok(saves >= 1);
    assert.equal(saves, restores, "every save has its restore");
    // Everything that changes the context's settings is inside a
    // save/restore, so nothing leaks into the next picture; and the alpha
    // is back to 1 before the words are written.
    let depth = 0;
    let alpha = 1;
    for (const entry of recorder.log) {
      if (entry.call === "save") depth += 1;
      if (entry.call === "restore") depth -= 1;
      if (entry.set) assert.ok(depth > 0, entry.set + " set outside save/restore");
      if (entry.set === "globalAlpha") alpha = entry.value;
      if (entry.call === "fillText") assert.equal(alpha, 1, "a word written see-through: " + entry.args[0]);
    }
  }
});

test("draw: everything it draws is inside the canvas, at every width", () => {
  for (const w of WIDTHS) {
    for (const light of [undefined, LASING, { beam: 4, pump: 1, transmission: 0.3 }]) {
      const { recorder, view } = drawAt(w, LABELS, "dark", light);
      for (const call of recorder.calls) {
        if (!["moveTo", "lineTo", "fillRect", "strokeRect", "quadraticCurveTo", "fillText"].includes(call.name)) continue;
        let points = [call.args.slice(0, 2)];
        if (call.name === "fillText") points = [call.args.slice(1, 3)];
        if (call.name === "quadraticCurveTo") points = [call.args.slice(2, 4)];
        if (call.name === "fillRect" || call.name === "strokeRect") {
          points = [[call.args[0], call.args[1]], [call.args[0] + call.args[2], call.args[1] + call.args[3]]];
        }
        for (const [x, y] of points) {
          assert.ok(Number.isFinite(x) && Number.isFinite(y), call.name + " " + call.args);
          assert.ok(x >= -0.5 && x <= view.w + 0.5 && y >= -0.5 && y <= view.h + 0.5,
            "w = " + w + ": " + call.name + "(" + call.args.join(", ") + ") outside " + view.w + "×" + view.h);
        }
      }
    }
  }
});

test("draw: writes the five labels where the layout puts them, squeezed into their slots", () => {
  const written5 = Object.assign({}, LABELS, { transmission: "Transmission 5.00" + NB + "%" });
  for (const w of [327, 600, 1100]) {
    const { recorder, view } = drawAt(w, LABELS, "dark", LASING);
    const L = bench.layout(view.w, view.h);
    let align = null;
    let font = null;
    const written = {};
    for (const entry of recorder.log) {
      if (entry.set === "textAlign") align = entry.value;
      if (entry.set === "font") font = entry.value;
      if (entry.call === "fillText") {
        const name = Object.keys(written5).find((key) => written5[key] === entry.args[0]);
        assert.ok(name, "wrote a label it was given: " + entry.args[0]);
        const spot = L.labels[name];
        assert.deepEqual(entry.args, [written5[name], spot.x, spot.y, spot.maxWidth], name);
        assert.equal(align, spot.align, name + " alignment");
        assert.equal(font, "600 " + L.fontSize + "px Test Sans", name + " font");
        written[name] = (written[name] || 0) + 1;
      }
    }
    assert.deepEqual(written, { backMirror: 1, outputMirror: 1, medium: 1, pump: 1, transmission: 1 }, "w = " + w);
  }
});

test("draw: an empty label is left out, not written as an empty string", () => {
  function written(labels, light) {
    const { recorder } = drawAt(600, deepFreeze(labels), "dark", light);
    return recorder.calls.filter((c) => c.name === "fillText").map((c) => c.args[0]).sort();
  }
  const labels = Object.assign({}, LABELS, { pump: "", transmission: "" });
  assert.deepEqual(written(labels), ["Back mirror", "Gain medium", "Output mirror"]);
  // The transmission's number is written even without its word, and not
  // without a transmission to write.
  assert.deepEqual(written(labels, LASING), ["5.00" + NB + "%", "Back mirror", "Gain medium", "Output mirror"]);
  assert.ok(!written(LABELS).some((text) => text.startsWith("Transmission")), "no light, no transmission");
  assert.ok(!written(LABELS, { beam: 1, pump: 0.25, transmission: NaN }).some((text) => text.startsWith("Transmission")));
  // The number follows the mirror.
  assert.ok(written(LABELS, { beam: 1, pump: 0.25, transmission: 0.3 }).includes("Transmission 30.0" + NB + "%"));
  assert.ok(written(LABELS, { beam: 1, pump: 0.25, transmission: 0.0475 }).includes("Transmission 4.75" + NB + "%"));
});

test("draw: the rod, the pump and the bench they stand on", () => {
  const { recorder, view } = drawAt(600);
  const L = bench.layout(view.w, view.h);
  const filled = recorder.calls.filter((c) => c.name === "fillRect").map((c) => c.args.join(","));
  for (const name of ["rod", "lamp"]) {
    const r = L[name];
    assert.ok(filled.includes([r.x, r.y, r.w, r.h].join(",")), name + " is filled");
  }
  const rail = strokedLines(recorder).find((line) => line.y1 === L.railY && line.y2 === L.railY);
  assert.ok(rail, "the bench is a line under the parts");
  assert.ok(rail.x1 < L.backMirror.x && rail.x2 > L.outputMirror.x + L.outputMirror.w, "under both mirrors");
  // Posts reach from the parts down to the bench.
  const posts = recorder.calls.filter((c) => c.name === "fillRect" && c.args[2] === 4 &&
    Math.abs(c.args[1] + c.args[3] - L.railY) < 1e-9);
  assert.equal(posts.length, 4, "two mirrors and the two ends of the rod");
});

test("draw: each mirror is a piece of glass with a curved face, the back mirror's coating the stronger", () => {
  const { recorder, view } = drawAt(900);
  const L = bench.layout(view.w, view.h);
  // The glass (a filled, closed path) and the coating (a stroked curve)
  // both follow the face: a curve from the inner edge at the top to the
  // inner edge at the bottom, passing `sag` deep on the axis.
  const curves = recorder.calls.filter((c) => c.name === "quadraticCurveTo");
  assert.equal(curves.length, 4, "glass and coating for two mirrors");
  for (const [which, mirror, inner] of [["back", L.backMirror, L.backMirror.x + L.backMirror.w], ["output", L.outputMirror, L.outputMirror.x]]) {
    const mine = curves.filter((c) => Math.abs(c.args[2] - inner) < 1e-9);
    assert.equal(mine.length, 2, which);
    for (const curve of mine) {
      const [controlX, controlY, endX, endY] = curve.args;
      assert.equal(endY, mirror.y + mirror.h, which + ": ends at the bottom");
      assertClose(controlY, L.axis.y, 1e-12, which + ": bends on the axis");
      // A quadratic curve passes half-way between its ends' line and its control point.
      assertClose((inner + controlX) / 2, bench.faceX(L, which, L.axis.y), 1e-9, which + ": the curve is faceX");
      assert.equal(endX, inner);
    }
  }
  // The coatings: the back mirror's is wider and more opaque.
  let alpha = 1;
  let width = 1;
  const coatings = [];
  const log = recorder.log;
  for (let i = 0; i < log.length; i++) {
    if (log[i].set === "globalAlpha") alpha = log[i].value;
    if (log[i].set === "lineWidth") width = log[i].value;
    // A coating is a curve that is stroked without being closed first.
    if (log[i].call === "quadraticCurveTo" && log[i + 1] && log[i + 1].call !== "lineTo") {
      const stroke = log.slice(i).find((entry) => entry.call === "stroke");
      const at = log.indexOf(stroke);
      let a = alpha;
      let lw = width;
      for (let j = i; j < at; j++) {
        if (log[j].set === "globalAlpha") a = log[j].value;
        if (log[j].set === "lineWidth") lw = log[j].value;
      }
      coatings.push({ alpha: a, width: lw });
    }
  }
  assert.equal(coatings.length, 2);
  assert.ok(coatings[0].width > coatings[1].width, "the back mirror's coating is thicker");
  assert.ok(coatings[0].alpha > coatings[1].alpha, "and more solid: the output mirror lets light through");
});

test("draw: no light, no rays; with light, a ray from face to face at every height of the layout", () => {
  const still = drawAt(600);
  const L600 = bench.layout(600, still.view.h);
  assert.equal(raysInside(still.recorder, L600).length, 0);
  assert.equal(raysLeaving(still.recorder, L600, still.view).length, 0);
  // No light and no pump is the still picture (with no transmission to
  // write, the transmission label is left out of both).
  assert.deepEqual(drawAt(600, LABELS, "dark", { beam: 0, pump: 0 }).recorder.calls,
    still.recorder.calls, "no light: the still picture");

  for (const w of WIDTHS) {
    const { recorder, view } = drawAt(w, LABELS, "dark", LASING);
    const L = bench.layout(view.w, view.h);
    const rays = raysInside(recorder, L);
    assert.deepEqual(rays.map((ray) => ray.y1), Array.from(L.rays), "w = " + w + ": one ray at each height");
    for (const ray of rays) {
      assert.equal(ray.strokeStyle, view.colors.accent2);
      assert.ok(ray.x1 < L.rod.x && ray.x2 > L.rod.x + L.rod.w, "through the whole rod");
    }
  }
});

test("draw: arrowheads point right on every second ray and left on the others", () => {
  const { recorder, view } = drawAt(900, LABELS, "dark", LASING);
  const L = bench.layout(view.w, view.h);
  // An arrowhead is a filled triangle: moveTo(tip), lineTo, lineTo, closePath, fill.
  const heads = [];
  const calls = recorder.calls;
  for (let i = 0; i + 4 < calls.length; i++) {
    if (calls[i].name === "moveTo" && calls[i + 1].name === "lineTo" && calls[i + 2].name === "lineTo" &&
        calls[i + 3].name === "closePath" && calls[i + 4].name === "fill") {
      const tip = calls[i].args;
      const base = calls[i + 1].args;
      if (Math.abs(base[1] - tip[1]) < Math.abs(base[0] - tip[0])) {      // a horizontal arrow
        heads.push({ x: tip[0], y: tip[1], direction: tip[0] > base[0] ? 1 : -1 });
      }
    }
  }
  const insideHeads = heads.filter((head) => head.x > L.backMirror.x && head.x < L.outputMirror.x);
  assert.equal(insideHeads.length, L.rays.length, "one arrowhead on each ray");
  Array.from(L.rays).forEach((y, i) => {
    const head = insideHeads.find((h) => Math.abs(h.y - y) < 1e-9);
    assert.ok(head, "an arrowhead on ray " + i);
    assert.equal(head.direction, i % 2 === 0 ? 1 : -1, "ray " + i);
    // In the gap between the rod and a mirror, where it can be seen.
    if (head.direction === 1) assert.ok(head.x > L.rod.x + L.rod.w && head.x < bench.faceX(L, "output", y));
    else assert.ok(head.x < L.rod.x && head.x > bench.faceX(L, "back", y));
  });
  // The rays that leave point right, near the edge.
  const outHeads = heads.filter((head) => head.x > L.outputMirror.x + L.outputMirror.w);
  assert.ok(outHeads.length >= 1);
  for (const head of outHeads) assert.equal(head.direction, 1);
});

test("draw: as many rays leave as the output mirror lets through, the ones nearest the axis", () => {
  for (const w of [327, 600, 900, 1300]) {
    for (const transmission of [0.005, 0.05, 0.1, 0.2, 0.3]) {
      const { recorder, view } = drawAt(w, LABELS, "dark", { beam: 1, pump: 0.25, transmission: transmission });
      const L = bench.layout(view.w, view.h);
      const leaving = raysLeaving(recorder, L, view);
      const expected = bench.raysOut(L.rays.length, transmission);
      assert.equal(leaving.length, expected, "w = " + w + ", T = " + transmission);
      // Each continues a ray of the cavity, and no ray further from the
      // axis leaves while a nearer one stays.
      const heights = Array.from(L.rays);
      const furthest = Math.max(...leaving.map((ray) => Math.abs(ray.y1 - L.axis.y)));
      for (const ray of leaving) assert.ok(heights.some((y) => Math.abs(y - ray.y1) < 1e-9));
      const nearer = heights.filter((y) => Math.abs(y - L.axis.y) < furthest - 1e-9);
      for (const y of nearer) assert.ok(leaving.some((ray) => Math.abs(ray.y1 - y) < 1e-9), "the ray at " + y + " leaves too");
    }
  }
});

test("rayAlpha: the square root of the light, at most 1, 0 for no light", () => {
  assert.equal(bench.rayAlpha(1), 1);
  assert.equal(bench.rayAlpha(4), 1);
  assertClose(bench.rayAlpha(0.25), 0.5, 1e-12, "√0.25");
  assertClose(bench.rayAlpha(1e-8), 1e-4, 1e-9, "spontaneous emission");
  for (const none of [0, -1, NaN, undefined]) assert.equal(bench.rayAlpha(none), 0, String(none));
});

test("draw: the rays' strength follows the light; spontaneous emission is not a beam", () => {
  // The alpha the rays between the mirrors are drawn with.
  function strength(light) {
    const { recorder, view } = drawAt(600, LABELS, "dark", light);
    const rays = raysInside(recorder, bench.layout(view.w, view.h));
    return rays.length ? rays[0].alpha : 0;
  }
  assert.ok(strength({ beam: 0.1, transmission: 0.05 }) < strength({ beam: 1, transmission: 0.05 }), "weaker light, fainter rays");
  for (const beam of [0.003, 0.1, 0.64, 1, 3]) {
    assertClose(strength({ beam: beam, transmission: 0.05 }), bench.rayAlpha(beam), 1e-12, "drawn with rayAlpha at " + beam);
  }
  assert.equal(strength({ beam: 1, transmission: 0.05 }), 1);
  assert.ok(strength({ beam: 5, transmission: 0.05 }) <= 1, "alpha never above 1");
  // Below threshold the page passes the spontaneous emission into the
  // mode, about 10⁻⁸ of the scale: that must not look like a beam.
  assert.ok(strength({ beam: 1e-8, transmission: 0.05 }) < 0.01, "spontaneous emission: no visible beam");
  assert.ok(strength({ beam: 0.01, transmission: 0.05 }) >= 0.1, "1 % of the scale already shows");
  // The rays that leave are as strong as the ones inside.
  const { recorder, view } = drawAt(600, LABELS, "dark", { beam: 0.25, transmission: 0.3 });
  const L = bench.layout(view.w, view.h);
  assert.equal(raysLeaving(recorder, L, view)[0].alpha, raysInside(recorder, L)[0].alpha);
});

test("draw: pump light goes up from the pump into the rod, stronger with more pump, none with the pump off", () => {
  // The upright lines between the lamp and the rod.
  function pumpLines(light) {
    const { recorder, view } = drawAt(600, LABELS, "dark", light);
    const L = bench.layout(view.w, view.h);
    return strokedLines(recorder).filter((line) => line.x1 === line.x2 &&
      line.y1 <= L.lamp.y && line.y1 > L.rod.y + L.rod.h && line.y2 >= L.rod.y + L.rod.h && line.y2 < L.lamp.y &&
      line.x1 >= L.lamp.x && line.x1 <= L.lamp.x + L.lamp.w);
  }
  assert.equal(pumpLines(undefined).length, 0);
  assert.equal(pumpLines({ beam: 1, pump: 0, transmission: 0.05 }).length, 0, "pump off");
  const weak = pumpLines({ beam: 0, pump: 0.1, transmission: 0.05 });
  const strong = pumpLines({ beam: 0, pump: 1, transmission: 0.05 });
  assert.equal(weak.length, 7);
  assert.equal(strong.length, 7);
  assert.ok(weak[0].alpha < strong[0].alpha, "more pump, stronger pump light");
  assert.ok(weak[0].alpha >= 0.3, "a weak pump still shows");
  assert.equal(pumpLines({ beam: 0, pump: 5, transmission: 0.05 })[0].alpha, 1, "alpha never above 1");
});
