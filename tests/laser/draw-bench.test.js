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
const { deepFreeze, assertClose, loadEngine } = require("./helpers.js");
const { createBrowser, fakeContext, themeVariables } = require("./fake-browser.js");

function load() {
  const browser = createBrowser();
  browser.load("js/laser/ui/loop.js");
  browser.load("js/laser/ui/format.js");
  browser.load("js/laser/ui/materials.js");
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
  transmission: "Transmission",
  qSwitch: "Bleachable filter",
  widths: "Widths ×",
  focus: "F",
  infrared: "infrared, invisible",
  ultraviolet: "ultraviolet, invisible"
});
const NB = "\u00a0";

const LASING = deepFreeze({ beam: 1, pump: 0.25, transmission: 0.05 });

// The engine's pump kinds, each drawn as itself (stage 7d).
const KINDS = ["diode", "laser", "flashlamp", "discharge"];

// The light of a lasing bench with this pump, at this strength.
function lit(kind, pump) {
  return { beam: 1, pump: pump === undefined ? 0.25 : pump, transmission: 0.05, pumpKind: kind };
}

// Every light the shared checks draw: none at all, and for each pump
// off, lasing and at its strongest.
const LIGHTS = [undefined, LASING];
for (const kind of KINDS) LIGHTS.push(lit(kind, 0), lit(kind), { beam: 4, pump: 1, transmission: 0.3, pumpKind: kind });

// The Q-switch (stage 8b): the bleachable filter, `open` 0 closed (dark)
// to 1 open (bleached).
const Q_KINDS = ["absorber"];
function filtered(open, pumpKind) {
  return {
    beam: 1, pump: 0.5, transmission: 0.05, pumpKind: pumpKind || "flashlamp",
    qSwitch: { kind: "absorber", open: open }
  };
}
const SWITCHED = [filtered(0), filtered(0.5), filtered(1), filtered(0.3, "diode"), filtered(1, "laser")];
for (const light of SWITCHED) LIGHTS.push(light);

// Each bench's own medium and beam (stage 10c), as page.js passes them:
// light.medium, the engine's id, and light.lam, its wavelength.
const ENGINE = loadEngine();
const BENCHES = [];
for (const id of ENGINE.media.list()) {
  for (const pump of ENGINE.bench.pumpsFor(id)) {
    BENCHES.push({ medium: id, pump: pump, lam: ENGINE.media.get(id).lam,
      pumpLam: ENGINE.bench.configFor({ medium: id, pump: pump }).pumpLam });
  }
}
function ofBench(b, extra) {
  const light = { beam: 1, pump: 0.5, transmission: 0.05, pumpKind: b.pump, medium: b.medium, lam: b.lam };
  if (b.pumpLam !== undefined) light.pumpLam = b.pumpLam;
  return Object.assign(light, extra || {});
}
for (const b of BENCHES) LIGHTS.push(ofBench(b), ofBench(b, { beam: 0, pump: 0 }));

// The physical colours a drawing may set besides the theme's: materials.js's
// own, and each made readable on the theme's background.
function physical(theme) {
  const M = UI.materials;
  const bg = palette(theme).bg;
  const raw = Object.values(M.MEDIA).map((m) => m.body).concat([M.GLASS, M.MIRROR_GLASS, M.SILVER, M.HIGHLIGHT, M.SHADE, M.INFRARED, M.PUMP_INFRARED,
    palette(theme).flash]);
  for (const b of BENCHES) {
    raw.push(M.beam(b.lam).color);
    if (b.pumpLam) raw.push(M.beam(b.pumpLam).color);
  }
  return raw.concat(raw.map((c) => M.readable(c, bg)));
}

// The mirrors are drawn as real ones whatever the medium: their glass,
// silver coating, glint and shade, the coating and the glass's edge made
// readable on the theme.
function mirrorColours(colors) {
  const M = UI.materials;
  return [M.MIRROR_GLASS, M.SILVER, M.HIGHLIGHT, M.SHADE,
    M.readable(M.MIRROR_GLASS, colors.bg), M.readable(M.SILVER, colors.bg)];
}

// The cavity's numbers (stage 10b), as page.js passes them: a He-Ne-like
// pair, flat and concave (R = 45 cm, F 22.5 cm in front of it) in a 30 cm
// cavity of 0.75 mm aperture, with a mode and two traced rays; and an
// unstable pair, a concave back mirror whose F lies 2.5 m away (off the
// picture) and a convex output mirror, whose rays walk out.
const HENE = deepFreeze({
  length: 0.3, aperture: 0.75e-3,
  shapes: { back: "flat", output: "concave" },
  focus: { back: null, output: 0.225 },
  mode: [0, 0.075, 0.15, 0.225, 0.3].map((z) => ({ z: z, w: 0.2e-3 + 0.5e-3 * z })),
  rays: [
    { y0: 0.2e-3, hits: [{ mirror: 2, y: 0.2e-3, theta: -0.9e-3 }, { mirror: 1, y: -0.07e-3, theta: -0.9e-3 },
      { mirror: 2, y: -0.34e-3, theta: 0.6e-3 }, { mirror: 1, y: -0.16e-3, theta: 0.6e-3 }], escaped: null },
    { y0: -0.1e-3, hits: [{ mirror: 2, y: -0.1e-3, theta: 0.44e-3 }, { mirror: 1, y: 0.03e-3, theta: 0.44e-3 }], escaped: null }
  ]
});
const UNSTABLE = deepFreeze({
  length: 0.5, aperture: 5e-3,
  shapes: { back: "concave", output: "convex" },
  focus: { back: 2.5, output: -2.5 },
  mode: null,
  rays: [
    { y0: 2e-3, hits: [{ mirror: 2, y: 2e-3, theta: 0.8e-3 }, { mirror: 1, y: 2.4e-3, theta: 0.8e-3 },
      { mirror: 2, y: 3.5e-3, theta: 4e-3 }, { mirror: 1, y: 5.5e-3, theta: 4e-3 }], escaped: { mirror: 1, roundTrip: 2 } }
  ]
});
function withCavity(cavity, light) {
  return Object.assign({ beam: 1, pump: 0.25, transmission: 0.05, pumpKind: "discharge" }, light || {}, { cavity: cavity });
}
for (const light of [withCavity(HENE), withCavity(UNSTABLE, { pumpKind: "flashlamp" }), withCavity(HENE, { beam: 0 }),
  withCavity(UNSTABLE, { beam: 0, pumpKind: "diode" })]) LIGHTS.push(light);

// t: the seconds the loop has run (view.t), 0 if not given; still: the
// visitor asked for less motion (view.still).
function drawAt(w, labels, theme, light, t, still) {
  const recorder = fakeContext();
  const view = {
    g: recorder.context, w: w, h: heightFor(w), dpr: 1,
    colors: deepFreeze(palette(theme || "dark")), font: "Test Sans", t: t === undefined ? 0 : t, dt: 0,
    still: still === true
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
  assert.ok(Object.isFrozen(bench.KINDS));
  assert.deepEqual(Array.from(bench.KINDS), KINDS, "every pump kind of the engine");
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

test("faceX: a concave face (the default) is a cup open towards the laser: its rims stand out by sag, its middle on the glass's inner edge", () => {
  const L = bench.layout(900, heightFor(900));
  const back = L.backMirror;
  const output = L.outputMirror;
  assertClose(bench.faceX(L, "back", back.y), back.x + back.w + L.sag, 1e-12, "the top rim");
  assertClose(bench.faceX(L, "back", back.y + back.h), back.x + back.w + L.sag, 1e-12, "the bottom rim");
  assertClose(bench.faceX(L, "back", L.axis.y), back.x + back.w, 1e-12, "the middle, on the glass");
  assertClose(bench.faceX(L, "output", output.y), output.x - L.sag, 1e-12, "the output mirror, mirrored");
  assertClose(bench.faceX(L, "output", L.axis.y), output.x, 1e-12, "its middle on the glass");
  assert.ok(L.sag > 0, "a curve to see");
  // Never into the glass, at any height.
  for (let y = back.y; y <= back.y + back.h; y += 1) {
    assert.ok(bench.faceX(L, "back", y) >= back.x + back.w - 1e-9, "back at " + y);
    assert.ok(bench.faceX(L, "output", y) <= output.x + 1e-9, "output at " + y);
  }
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
    // Every word with a place of its own: each focal point's "F" is
    // written where the point is, so it has none.
    // The two words under an invisible beam share one place, "invisible".
    for (const name of bench.PARTS.filter((part) => part !== "focus" && part !== "infrared" && part !== "ultraviolet")
      .concat(["invisible"])) {
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
    // An invisible beam's note: a row of its own under the pump's name,
    // with room for "1.06 µm · ինֆրակարմիր, անտեսանելի" (33 letters; next
    // to the pump's name it was squeezed to a third: stage 10c1 review).
    assert.ok(box.invisible.top >= box.pump.bottom - 1e-9, where + ": the note under the pump's name");
    assert.ok(L.labels.invisible.maxWidth >= 33 * 0.62 * fs, where + ": room for the note, got " + L.labels.invisible.maxWidth);
  }
});

test("draw: every colour it uses is a theme colour, in both themes", () => {
  for (const theme of ["dark", "light"]) {
    // Since stage 10c a bench's medium and beam have their own colours
    // (materials.js), each tested for contrast in materials.test.js.
    const allowed = Object.values(palette(theme)).concat(physical(theme));
    for (const w of [327, 960]) {
      for (const light of LIGHTS) {
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
  for (const light of LIGHTS) {
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
    for (const light of LIGHTS.concat([{ beam: 4, pump: 1, transmission: 0.3 }])) {
      // At a moment the photons and the atoms are on their way (stage 10c2).
      const { recorder, view } = drawAt(w, LABELS, "dark", light, 0.9);
      for (const call of recorder.calls) {
        if (!["moveTo", "lineTo", "fillRect", "strokeRect", "quadraticCurveTo", "ellipse", "arc", "fillText"].includes(call.name)) continue;
        let points = [call.args.slice(0, 2)];
        if (call.name === "fillText") points = [call.args.slice(1, 3)];
        // A circle (x, y, r, ...), the photons' and atoms' dots: its box.
        if (call.name === "arc") {
          const [x, y, r] = call.args;
          points = [[x - r, y - r], [x + r, y + r]];
        }
        // An ellipse (x, y, rx, ry, ...): its whole box.
        if (call.name === "ellipse") {
          const [x, y, rx, ry] = call.args;
          points = [[x - rx, y - ry], [x + rx, y + ry]];
        }
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
  for (const [w, light] of [[327, LASING], [600, LASING], [1100, LASING]].concat(KINDS.map((kind) => [600, lit(kind)]))) {
    const { recorder, view } = drawAt(w, LABELS, "dark", light);
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
  for (const name of ["rod", "diodeModule"]) {
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
  // both follow the face: a curve from its top rim to its bottom rim
  // (faceX there), passing faceX on the axis.
  const curves = recorder.calls.filter((c) => c.name === "quadraticCurveTo");
  assert.equal(curves.length, 4, "glass and coating for two mirrors");
  for (const [which, mirror] of [["back", L.backMirror], ["output", L.outputMirror]]) {
    const rim = bench.faceX(L, which, mirror.y);
    const mine = curves.filter((c) => Math.abs(c.args[2] - rim) < 1e-9);
    assert.equal(mine.length, 2, which);
    for (const curve of mine) {
      const [controlX, controlY, endX, endY] = curve.args;
      assert.equal(endY, mirror.y + mirror.h, which + ": ends at the bottom");
      assertClose(endX, bench.faceX(L, which, mirror.y + mirror.h), 1e-9, which + ": at the bottom rim");
      assertClose(controlY, L.axis.y, 1e-12, which + ": bends on the axis");
      // A quadratic curve with both ends at one x passes half-way between
      // that x and its control point.
      assertClose((endX + controlX) / 2, bench.faceX(L, which, L.axis.y), 1e-9, which + ": the curve is faceX");
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
  // The glass's edge and the coating are lines, so they are made readable
  // on the lab's near-white (the raw colours are too pale for it; the raw
  // glass colour is only the faint fill).
  const M = UI.materials;
  const strokes = recorder.sets.filter((s) => s.name === "strokeStyle").map((s) => s.value);
  for (const raw of [M.MIRROR_GLASS, M.SILVER]) {
    const shown = M.readable(raw, view.colors.bg);
    assert.notEqual(shown, raw, raw + " needs darkening on the lab's background");
    assert.ok(strokes.includes(shown), raw + ": drawn readable");
    assert.ok(!strokes.includes(raw), raw + ": never as a raw line");
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

test("draw: a flashlamp's light goes up into the rod, stronger with more pump, none with the pump off", () => {
  // The upright lines between the lamp and the rod.
  function pumpLines(light) {
    if (light) light = Object.assign({ pumpKind: "flashlamp" }, light);
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

/* ---------- each pump drawn as itself (stage 7d) ---------- */

// The filled and the outlined rectangles of a drawing, as "x,y,w,h".
function rects(recorder, name) {
  return recorder.calls.filter((c) => c.name === name).map((c) => c.args.join(","));
}
function rectKey(r) {
  return [r.x, r.y, r.w, r.h].join(",");
}

// The rectangles filled, each with the alpha it was filled at.
function filledWithAlpha(recorder) {
  const list = [];
  let alpha = 1;
  for (const entry of recorder.log) {
    if (entry.set === "globalAlpha") alpha = entry.value;
    if (entry.call === "fillRect") list.push({ key: entry.args.join(","), alpha: alpha });
  }
  return list;
}

// The posts: 4 px wide, from a part down to the bench.
function posts(recorder, L) {
  return recorder.calls.filter((c) => c.name === "fillRect" && c.args[2] === 4 &&
    Math.abs(c.args[1] + c.args[3] - L.railY) < 1e-9).map((c) => c.args[0] + 2);
}

// An arrowhead with its tip at (x, y): a moveTo there, then two lineTos
// back from it, then fill. dy is −1 for one pointing up, 1 for down.
function arrowheadAt(recorder, x, y, dy) {
  const log = recorder.log;
  for (let i = 0; i + 4 < log.length; i++) {
    if (log[i].call !== "moveTo" || Math.abs(log[i].args[0] - x) > 1e-9 || Math.abs(log[i].args[1] - y) > 1e-9) continue;
    const a = log[i + 1];
    const b = log[i + 2];
    if (a.call !== "lineTo" || b.call !== "lineTo") continue;
    // The base is behind the tip.
    if (Math.sign(y - a.args[1]) === dy && Math.sign(y - b.args[1]) === dy) return true;
  }
  return false;
}

test("layout: the flashlamp, the gas tube and the pump laser, inside the canvas and in their places, at every width", () => {
  for (const w of WIDTHS) {
    const h = heightFor(w);
    const L = bench.layout(w, h);
    const where = "w = " + w;
    const tiny = 1e-9 * w;
    const rodBottom = L.rod.y + L.rod.h;
    for (const name of ["flashTube", "tube", "supply", "pumpLaser"]) {
      assert.ok(inside(L[name], w, h), where + ": " + name + " " + JSON.stringify(L[name]));
      assert.ok(L[name].w > 0 && L[name].h > 0, where + ": " + name + " has a size");
    }
    // The flashlamp: under the rod where the diodes are, a little thicker,
    // with room for its light between it and the rod, and metal caps.
    assert.equal(L.flashTube.x, L.lamp.x, where);
    assert.equal(L.flashTube.w, L.lamp.w, where);
    assert.ok(L.flashTube.h > L.lamp.h, where + ": a tube, thicker than the diodes' strip");
    assert.ok(L.flashTube.y > rodBottom + 10, where + ": room for its light");
    assert.ok(L.flashTube.y + L.flashTube.h < L.railY, where + ": above the bench");
    assert.ok(L.flashCap > 0 && 2 * L.flashCap < 0.3 * L.flashTube.w, where + ": caps at the ends, the gas between");
    // The gas tube: on the axis, as tall as the rod, longer, centred,
    // between the mirrors' faces, every ray inside its bore.
    const T = L.tube;
    assertClose(T.y + T.h / 2, L.axis.y, 1e-12, where + ": the tube on the axis");
    assert.equal(T.h, L.rod.h, where);
    assert.ok(T.w > 1.5 * L.rod.w, where + ": the tube fills most of the cavity");
    assert.ok(Math.abs(T.x + T.w / 2 - w / 2) < tiny, where + ": centred");
    assert.ok(T.x > L.axis.x1 + 3 && T.x + T.w < L.axis.x2 - 3, where + ": clear of the mirrors");
    const B = L.bore;
    assert.ok(B.x > T.x && B.x + B.w < T.x + T.w && B.y > T.y && B.y + B.h < T.y + T.h, where + ": the bore inside the tube");
    assert.ok(L.rays[0] > B.y + 1 && L.rays[L.rays.length - 1] < B.y + B.h - 1, where + ": every ray inside the bore");
    // The electrodes stick down from the tube near its two ends, alike.
    assert.equal(L.electrodes.length, 2, where);
    const [left, right] = L.electrodes;
    for (const e of L.electrodes) {
      assert.ok(inside(e, w, h) && e.w > 0 && e.h > 0, where + ": electrode " + JSON.stringify(e));
      assert.equal(e.y, T.y + T.h, where + ": from the tube's bottom");
      assert.ok(e.y + e.h < L.wireY, where + ": above the wires' row");
    }
    assert.ok(left.x + left.w < T.x + 0.25 * T.w && right.x > T.x + 0.75 * T.w, where + ": near the ends");
    assert.ok(Math.abs((left.x - T.x) - (T.x + T.w - (right.x + right.w))) < tiny, where + ": mirror images");
    // The supply stands on the bench in the middle, between the electrodes;
    // the wires run at its middle height.
    const S = L.supply;
    assert.ok(Math.abs(S.y + S.h - L.railY) < tiny, where + ": the supply on the bench");
    assert.ok(Math.abs(S.x + S.w / 2 - w / 2) < tiny, where + ": in the middle");
    assert.ok(S.x > left.x + left.w + 10 && S.x + S.w < right.x - 10, where + ": between the electrodes");
    assert.ok(L.wireY > S.y && L.wireY < S.y + S.h, where + ": wires at the supply's height");
    // The tube's posts stand outside the electrodes, so no wire crosses one.
    assert.equal(L.tubePosts.length, 2, where);
    assert.ok(L.tubePosts[0] - 2 > T.x && L.tubePosts[0] + 2 < left.x - 2, where + ": left post outside the left electrode");
    assert.ok(L.tubePosts[1] + 2 < T.x + T.w && L.tubePosts[1] - 2 > right.x + right.w + 2, where + ": and right");
    // The current's arrows: one on each wire, between the electrode and the wires' row.
    assert.equal(L.currentArrows.length, 2, where);
    L.currentArrows.forEach((arrow, i) => {
      const e = L.electrodes[i];
      assertClose(arrow.x, e.x + e.w / 2, 1e-12, where + ": on the electrode's wire");
      assert.ok(arrow.y > e.y + e.h + 4 && arrow.y < L.wireY - 4, where + ": on its upright part");
    });
    assert.equal(L.currentArrows[0].dy, -1, where + ": up into the left electrode");
    assert.equal(L.currentArrows[1].dy, 1, where + ": down out of the right one");
    // The pump laser (stage 10c2, end-pumped): a box standing on the bench
    // under the rod's middle, clear of the rod's posts and their feet; its
    // beam from its middle along the bench to the periscope in the left
    // margin, up to the axis, and into the lens.
    const P = L.pumpLaser;
    assert.ok(Math.abs(P.y + P.h - L.railY) < tiny, where + ": the pump laser on the bench");
    assert.equal(L.rodPosts.length, 2, where);
    const foot = bench.POST_FOOT / 2;
    assert.equal(bench.POST_FOOT, 18);
    assert.ok(P.x >= L.rodPosts[0] + foot + 2 && P.x + P.w <= L.rodPosts[1] - foot - 2, where + ": clear of the rod's posts and their feet");
    assert.ok(P.w >= 10, where + ": a box, not a line (" + P.w + " px)");
    assertClose(L.beamY, P.y + P.h / 2, 1e-12, where + ": the beam from the box's middle");
    assert.ok(P.y > rodBottom + 6, where + ": under the rod");
    const scope = L.periscope;
    assert.equal(scope.low, L.beamY, where);
    assert.equal(scope.high, L.axis.y, where + ": its upper mirror on the axis");
    assert.ok(scope.x - scope.half >= 0 && scope.x + scope.half < L.lens.x - L.lens.rx, where + ": in the margin, before the lens");
    assert.ok(scope.low + scope.half < L.railY, where + ": above the bench");
    assert.ok(scope.half >= 3, where + ": mirrors that can be seen");
  }
});

test("draw: each pump draws its own parts, and a missing or unknown kind is the diodes", () => {
  const w = 900;
  const draws = {};
  for (const kind of KINDS) draws[kind] = drawAt(w, LABELS, "dark", lit(kind));
  const L = bench.layout(w, heightFor(w));
  const filled = (kind) => rects(draws[kind].recorder, "fillRect");
  const outlined = (kind) => rects(draws[kind].recorder, "strokeRect");
  // The rod, for every pump but the discharge, whose tube is the medium.
  for (const kind of ["diode", "laser", "flashlamp"]) {
    assert.ok(filled(kind).includes(rectKey(L.rod)), kind + ": the rod");
    assert.ok(!outlined(kind).includes(rectKey(L.tube)), kind + ": no gas tube");
  }
  assert.ok(!filled("discharge").includes(rectKey(L.rod)) && !outlined("discharge").includes(rectKey(L.rod)), "discharge: no rod");
  assert.ok(outlined("discharge").includes(rectKey(L.tube)), "discharge: the tube");
  // The diodes' module only for diodes (stage 10c2: end-pumped).
  assert.ok(filled("diode").includes(rectKey(L.diodeModule)), "diode: the module");
  for (const kind of ["flashlamp", "discharge"]) assert.ok(!filled(kind).includes(rectKey(L.diodeModule)), kind + ": no diodes");
  // The pump laser stands where the module does, but has no fins and no fibre.
  const finLines = (kind) => strokedLines(draws[kind].recorder).filter((l) => l.x1 === l.x2 && l.y1 === L.diodeModule.y &&
    Math.abs(l.y2 - (L.diodeModule.y - L.finHeight)) < 1e-9);
  assert.equal(finLines("diode").length, L.fins);
  assert.equal(finLines("laser").length, 0, "laser: no fins");
  // The flashlamp: its glass and its two caps.
  const F = L.flashTube;
  assert.ok(outlined("flashlamp").includes(rectKey(F)), "flashlamp: the glass");
  assert.ok(filled("flashlamp").includes([F.x, F.y, L.flashCap, F.h].join(",")), "flashlamp: the left cap");
  assert.ok(filled("flashlamp").includes([F.x + F.w - L.flashCap, F.y, L.flashCap, F.h].join(",")), "flashlamp: the right cap");
  for (const kind of ["diode", "laser", "discharge"]) assert.ok(!outlined(kind).includes(rectKey(F)), kind + ": no flashlamp");
  // The discharge: its electrodes and the supply.
  for (const e of L.electrodes) assert.ok(filled("discharge").includes(rectKey(e)), "discharge: an electrode");
  assert.ok(outlined("discharge").includes(rectKey(L.supply)), "discharge: the supply");
  for (const kind of ["diode", "laser", "flashlamp"]) assert.ok(!outlined(kind).includes(rectKey(L.supply)), kind + ": no supply");
  // The pump laser: its box, the periscope's two mirrors at 45° and the lens.
  assert.ok(outlined("laser").includes(rectKey(L.pumpLaser)), "laser: the pump laser");
  const P = L.periscope;
  const mirrorAt = (x1, y1, x2, y2) => strokedLines(draws.laser.recorder).find((line) =>
    Math.abs(line.x1 - x1) < 1e-9 && Math.abs(line.y1 - y1) < 1e-9 && Math.abs(line.x2 - x2) < 1e-9 && Math.abs(line.y2 - y2) < 1e-9);
  assert.ok(mirrorAt(P.x - P.half, P.low - P.half, P.x + P.half, P.low + P.half), "laser: the lower mirror, turning the beam up");
  assert.ok(mirrorAt(P.x - P.half, P.high + P.half, P.x + P.half, P.high - P.half), "laser: the upper mirror, turning it along the axis");
  assert.ok(draws.laser.recorder.calls.some((c) => c.name === "ellipse" && c.args[0] === L.lens.x), "laser: the lens");
  for (const kind of ["flashlamp", "discharge"]) assert.ok(!outlined(kind).includes(rectKey(L.pumpLaser)), kind + ": no pump laser");
  // The diodes have no periscope.
  assert.ok(!strokedLines(draws.diode.recorder).some((l) => Math.abs(l.x1 - (P.x - P.half)) < 1e-9 && Math.abs(l.y1 - (P.low - P.half)) < 1e-9),
    "diode: no periscope");
  // What stands on the bench: two mirrors and two ends of the medium; the
  // pump laser's periscope on a fifth post.
  const mirrorPosts = [L.backMirror.x + L.backMirror.w / 2, L.outputMirror.x + L.outputMirror.w / 2];
  for (const kind of ["diode", "flashlamp"]) assert.deepEqual(posts(draws[kind].recorder, L), mirrorPosts.concat(Array.from(L.rodPosts)), kind);
  assert.deepEqual(posts(draws.laser.recorder, L), mirrorPosts.concat(Array.from(L.rodPosts), [L.periscope.x]), "laser");
  assert.deepEqual(posts(draws.discharge.recorder, L), mirrorPosts.concat(Array.from(L.tubePosts)), "discharge");
  // No kind, or one the drawing does not know: the diodes.
  const diode = JSON.stringify(draws.diode.recorder.log);
  assert.equal(JSON.stringify(drawAt(w, LABELS, "dark", { beam: 1, pump: 0.25, transmission: 0.05 }).recorder.log), diode);
  assert.equal(JSON.stringify(drawAt(w, LABELS, "dark", lit("steam engine")).recorder.log), diode);
});

test("draw: a pump below PUMP_OFF is drawn off, for every kind (a flash's long tail goes dark)", () => {
  const w = 900;
  assert.equal(bench.PUMP_OFF, 0.01);
  for (const kind of KINDS) {
    const off = JSON.stringify(drawAt(w, LABELS, "dark", lit(kind, 0)).recorder.log);
    // 30 s after ruby's flash peak (at 10⁴) its pump is 2×10⁻³ of full.
    for (const pump of [1e-6, 2e-3, 0.0099]) {
      assert.equal(JSON.stringify(drawAt(w, LABELS, "dark", lit(kind, pump)).recorder.log), off, kind + " at " + pump);
    }
    assert.notEqual(JSON.stringify(drawAt(w, LABELS, "dark", lit(kind, bench.PUMP_OFF)).recorder.log), off, kind + " at PUMP_OFF");
  }
});

// A horizontal arrowhead with its tip at (x, y), pointing dx (1 right, −1 left).
function sideArrowheadAt(recorder, x, y, dx) {
  const log = recorder.log;
  for (let i = 0; i + 2 < log.length; i++) {
    if (log[i].call !== "moveTo" || Math.abs(log[i].args[0] - x) > 1e-9 || Math.abs(log[i].args[1] - y) > 1e-9) continue;
    const a = log[i + 1];
    const b = log[i + 2];
    if (a.call !== "lineTo" || b.call !== "lineTo") continue;
    if (Math.sign(x - a.args[0]) === dx && Math.sign(x - b.args[0]) === dx) return { base: a.args[0] };
  }
  return null;
}

test("draw: the rays' arrowheads sit in the open gaps between the mirrors and the medium, rod or gas tube", () => {
  for (const w of WIDTHS) {
    const L = bench.layout(w, heightFor(w));
    for (const kind of KINDS) {
      const { recorder } = drawAt(w, LABELS, "dark", lit(kind, 0.5));
      const M = kind === "discharge" ? L.tube : L.rod;
      const leftGap = (bench.faceX(L, "back", L.axis.y) + M.x) / 2;
      const rightGap = (M.x + M.w + bench.faceX(L, "output", L.axis.y)) / 2;
      L.rays.forEach((y, i) => {
        const where = "w = " + w + ", " + kind + ", ray " + i;
        if (i % 2 === 0) {
          const head = sideArrowheadAt(recorder, rightGap + 4, y, 1);
          assert.ok(head, where + ": an arrowhead to the right");
          assert.ok(head.base >= M.x + M.w + 1, where + ": clear of the medium");
          assert.ok(rightGap + 4 <= bench.faceX(L, "output", y), where + ": inside the cavity");
        } else {
          const head = sideArrowheadAt(recorder, leftGap - 4, y, -1);
          assert.ok(head, where + ": an arrowhead to the left");
          assert.ok(head.base <= M.x - 1, where + ": clear of the medium");
          assert.ok(leftGap - 4 >= bench.faceX(L, "back", y), where + ": inside the cavity");
        }
      });
    }
  }
});

test("draw: the flashlamp glows as strongly as the flash and lights the rod; dark before it is fired", () => {
  const w = 900;
  const L = bench.layout(w, heightFor(w));
  const F = L.flashTube;
  const gas = [F.x + L.flashCap, F.y, F.w - 2 * L.flashCap, F.h].join(",");
  function glow(pump) {
    const { recorder } = drawAt(w, LABELS, "dark", lit("flashlamp", pump));
    const fill = filledWithAlpha(recorder).find((f) => f.key === gas);
    return fill ? fill.alpha : 0;
  }
  // Its light: upright lines from the tube up to the rod, as the diodes'.
  function light(pump) {
    const { recorder } = drawAt(w, LABELS, "dark", lit("flashlamp", pump));
    return strokedLines(recorder).filter((line) => line.x1 === line.x2 &&
      line.y1 <= F.y && line.y1 > L.rod.y + L.rod.h && line.y2 >= L.rod.y + L.rod.h && line.y2 < F.y &&
      line.x1 >= F.x && line.x1 <= F.x + F.w);
  }
  assert.equal(glow(0), 0, "not fired: the gas is dark");
  assert.equal(light(0).length, 0, "and gives no light");
  assert.ok(glow(0.1) >= 0.2, "a weak flash still shows");
  assert.ok(glow(0.1) < glow(0.5) && glow(0.5) < glow(1), "brighter with a stronger flash");
  assert.equal(glow(1), 1);
  assert.equal(glow(3), 1, "never brighter than fully");
  assert.equal(light(0.5).length, 7);
  assert.ok(light(0.1)[0].alpha < light(1)[0].alpha, "more light with a stronger flash");
});

/* ---------- a lit flashlamp's light (the owner's wish) ---------- */

// What a drawing paints: every fill and stroke with the colour, alpha and
// shadow blur it was made with (save() and restore() kept track of, as a
// canvas does), and for fill() and stroke() the path's calls.
function painted(recorder) {
  const list = [];
  let now = { fillStyle: null, strokeStyle: null, globalAlpha: 1, shadowBlur: 0 };
  const saved = [];
  let path = [];
  for (const entry of recorder.log) {
    if (entry.set) {
      if (entry.set in now) now[entry.set] = entry.value;
      continue;
    }
    const name = entry.call;
    if (name === "save") saved.push(Object.assign({}, now));
    if (name === "restore") now = saved.pop();
    if (name === "beginPath") path = [];
    if (["moveTo", "lineTo", "ellipse", "closePath", "quadraticCurveTo", "arc"].includes(name)) path.push(entry);
    const fills = ["fill", "fillRect", "fillText"].includes(name);
    const strokes = ["stroke", "strokeRect"].includes(name);
    if (fills || strokes) {
      list.push({
        call: name, args: entry.args, path: path.slice(),
        color: fills ? now.fillStyle : now.strokeStyle, alpha: now.globalAlpha, blur: now.shadowBlur
      });
    }
  }
  return list;
}

// The flash's light on a bench of width w: what is painted in the flash
// colour (raw for the glows: the tint, the halo, the beams; made readable
// for the streaks and the burning gas, which must show on the lab's
// near-white), and the streaks among it (stroked lines).
function flashLight(w, light, t, theme) {
  const { recorder } = drawAt(w, LABELS, theme || "dark", light, t);
  const colors = palette(theme || "dark");
  const flashes = [colors.flash, UI.materials.readable(colors.flash, colors.bg)];
  const all = painted(recorder);
  const lit = all.filter((p) => flashes.includes(p.color));
  const streaks = lit.filter((p) => p.call === "stroke").map((p) => {
    const [from, to] = [p.path[0].args, p.path[1].args];
    return { x1: from[0], y1: from[1], x2: to[0], y2: to[1], alpha: p.alpha };
  });
  return { all: all, lit: lit, streaks: streaks };
}

function streakLength(s) {
  return Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
}

test("draw: a lit flashlamp lights the whole bench, a halo round its tube, broad beams and the rod; dark, none of it", () => {
  const w = 900;
  const L = bench.layout(w, heightFor(w));
  const F = L.flashTube;
  const R = L.rod;
  // Dark (not fired, or its tail below PUMP_OFF), and every other pump at
  // its strongest: no flash colour at all.
  assert.equal(flashLight(w, lit("flashlamp", 0)).lit.length, 0, "not fired");
  assert.equal(flashLight(w, lit("flashlamp", 0.005)).lit.length, 0, "a tail below PUMP_OFF");
  for (const kind of ["diode", "laser", "discharge"]) {
    assert.equal(flashLight(w, lit(kind, 1)).lit.length, 0, kind + ": not a flash");
  }
  const { all, lit: light } = flashLight(w, lit("flashlamp", 1));
  // First of all, the whole bench lit, faintly, under every part.
  assert.deepEqual({ call: all[0].call, args: all[0].args, color: all[0].color }, { call: "fillRect", args: [0, 0, w, heightFor(w)], color: palette("dark").flash });
  assert.equal(all[0].alpha, 0.1);
  // A halo: 6 rings round the tube's middle, each wider than the last by
  // haloStep, faint, all inside the canvas.
  const rings = light.filter((p) => p.call === "fill" && p.path.length === 1 && p.path[0].call === "ellipse").map((p) => p.path[0].args);
  assert.equal(rings.length, 6);
  rings.forEach((r, i) => {
    assertClose(r[0], F.x + F.w / 2, 1e-12);
    assertClose(r[1], F.y + F.h / 2, 1e-12);
    assertClose(r[2], F.w / 2 + (i + 1) * L.haloStep, 1e-12);
    assertClose(r[3], F.h / 2 + (i + 1) * L.haloStep, 1e-12);
  });
  // Broad beams: from the tube's lit length (between its caps) up to the
  // rod's whole bottom edge.
  const fan = light.find((p) => p.call === "fill" && p.path.length === 5 && p.path[0].call === "moveTo");
  assert.ok(fan, "the beams");
  assert.deepEqual(fan.path.slice(0, 4).map((c) => c.args), [
    [F.x + L.flashCap, F.y], [F.x + F.w - L.flashCap, F.y], [R.x + R.w, R.y + R.h], [R.x, R.y + R.h]
  ]);
  assert.equal(fan.path[4].call, "closePath");
  // The gas, burning in the flash colour, and the rod lit by it.
  const gas = light.find((p) => p.call === "fillRect" && p.args.join(",") === [F.x + L.flashCap, F.y, F.w - 2 * L.flashCap, F.h].join(","));
  assert.ok(gas, "the gas");
  assert.equal(gas.alpha, 1);
  const rod = light.find((p) => p.call === "fillRect" && p.args.join(",") === rectKey(R));
  assert.ok(rod, "the rod lit");
  assert.equal(rod.alpha, 0.3);
  // The rod is lit over its own glass, which is drawn first.
  const glass = all.findIndex((p) => p.call === "fillRect" && p.args.join(",") === rectKey(R) && p.color === palette("dark").accent);
  assert.ok(glass !== -1 && glass < all.indexOf(rod));
});

test("draw: the flash's light grows with the flash: brighter bench, halo, beams and rod, longer and brighter streaks", () => {
  const w = 900;
  const L = bench.layout(w, heightFor(w));
  function measure(pump) {
    const { lit: light, streaks } = flashLight(w, lit("flashlamp", pump), 0.37);
    const alphaOf = (find) => light.find(find).alpha;
    return {
      bench: alphaOf((p) => p.call === "fillRect" && p.args[0] === 0 && p.args[1] === 0),
      halo: alphaOf((p) => p.call === "fill" && p.path[0].call === "ellipse"),
      fan: alphaOf((p) => p.call === "fill" && p.path[0].call === "moveTo"),
      rod: alphaOf((p) => p.call === "fillRect" && p.args.join(",") === rectKey(L.rod)),
      streaks: streaks.reduce((total, s) => total + streakLength(s), 0),
      streakAlpha: streaks.reduce((total, s) => total + s.alpha, 0)
    };
  }
  const weak = measure(0.25);
  const strong = measure(1);
  for (const name of Object.keys(weak)) {
    assert.ok(weak[name] > 0 && weak[name] < strong[name], name + ": " + weak[name] + " < " + strong[name]);
  }
  assertClose(strong.bench, 0.1, 1e-12);
  assertClose(weak.bench, 0.025, 1e-12);
  assert.deepEqual(measure(3), strong, "never more than fully lit");
});

test("draw: the streaks flicker round the tube in screen time; the same moment draws the same picture", () => {
  for (const w of WIDTHS) {
    const h = heightFor(w);
    const L = bench.layout(w, h);
    const F = L.flashTube;
    const cx = F.x + F.w / 2;
    const cy = F.y + F.h / 2;
    for (const t of [0, 0.13, 0.4, 1.7, 1000.25]) {
      const { streaks } = flashLight(w, lit("flashlamp", 1), t);
      assert.equal(streaks.length, 16, "w = " + w);
      for (const s of streaks) {
        // From just outside the tube, on an ellipse round it, pointing
        // out along the angle it starts at; at most L.streak long, inside
        // the canvas.
        const out = Math.pow((s.x1 - cx) / (F.w / 2), 2) + Math.pow((s.y1 - cy) / (F.h / 2), 2);
        assert.ok(out > 1, "starts outside the tube");
        const dx = (s.x1 - cx) / (F.w / 2 + 3);
        const dy = (s.y1 - cy) / (F.h / 2 + 3);
        assertClose(Math.hypot(dx, dy), 1, 1e-9);
        assertClose(Math.atan2(s.y2 - s.y1, s.x2 - s.x1), Math.atan2(dy, dx), 1e-9);
        assert.ok(streakLength(s) <= L.streak + 1e-9 && streakLength(s) >= 0.4 * L.streak - 1e-9);
        for (const [x, y] of [[s.x1, s.y1], [s.x2, s.y2]]) assert.ok(x >= 0 && x <= w && y >= 0 && y <= L.railY, "w = " + w + ": " + x + ", " + y);
      }
    }
  }
  const w = 900;
  const at = (t) => JSON.stringify(drawAt(w, LABELS, "dark", lit("flashlamp", 0.8), t).recorder.log);
  // The streaks themselves, not only the pump photons (stage 10c2), change.
  const streaksAt = (t) => JSON.stringify(flashLight(w, lit("flashlamp", 0.8), t).streaks);
  assert.notEqual(streaksAt(0.3), streaksAt(0), "it flickers");
  assert.equal(at(0.3), at(0.3), "the same moment, the same picture");
  // No time given (a view without t) draws as the start; so does nonsense.
  assert.equal(at(null), at(0));
  assert.equal(at(NaN), at(0));
  // Each streak flickers at its own phase: at one moment their lengths differ.
  const lengths = flashLight(w, lit("flashlamp", 1), 0.3).streaks.map(streakLength);
  assert.ok(Math.max(...lengths) - Math.min(...lengths) > 0.3 * bench.layout(w, heightFor(w)).streak);
});

test("draw: for a visitor who asked for less motion the streaks stand still, still as strong as the flash", () => {
  const w = 900;
  const still = (t, pump) => JSON.stringify(drawAt(w, LABELS, "dark", lit("flashlamp", pump), t, true).recorder.log);
  for (const t of [0.3, 1.7, 1000.25]) assert.equal(still(t, 0.8), still(0, 0.8), "t = " + t);
  // The picture of the moment t = 0: the streaks keep their different lengths.
  assert.equal(still(0.3, 0.8), JSON.stringify(drawAt(w, LABELS, "dark", lit("flashlamp", 0.8), 0).recorder.log));
  // The flash itself still rises and falls: that is the physics, not decoration.
  assert.notEqual(still(0.3, 0.3), still(0.3, 0.8));
});

test("draw: only the lamp's gas blooms; the bloom is set back before anything else is drawn", () => {
  for (const theme of ["dark", "light"]) {
    for (const pump of [0.1, 0.6, 1]) {
      const w = 900;
      const L = bench.layout(w, heightFor(w));
      const F = L.flashTube;
      const blooming = flashLight(w, lit("flashlamp", pump), 0, theme).all.filter((p) => p.blur > 0);
      assert.equal(blooming.length, 1, theme + " " + pump);
      assert.equal(blooming[0].args.join(","), [F.x + L.flashCap, F.y, F.w - 2 * L.flashCap, F.h].join(","));
      assert.equal(blooming[0].color, UI.materials.readable(palette(theme).flash, palette(theme).bg), "the gas readable on the bench");
      assertClose(blooming[0].blur, L.bloom * pump, 1e-12);
    }
  }
  // Other pumps never bloom.
  for (const kind of ["diode", "laser", "discharge"]) {
    assert.equal(flashLight(900, lit(kind, 1)).all.filter((p) => p.blur > 0).length, 0, kind);
  }
});

test("draw: the gas tube is the medium: the rays run inside it, its gas glows with the current, an arrow on each wire", () => {
  const w = 900;
  const L = bench.layout(w, heightFor(w));
  const bore = rectKey(L.bore);
  function drawn(pump) {
    return drawAt(w, LABELS, "dark", lit("discharge", pump));
  }
  // The rays still run from mirror face to mirror face, through the tube.
  assert.equal(raysInside(drawn(0.5).recorder, L).length, L.rays.length);
  // The gas glows with the current, not at all without it.
  function glow(pump) {
    const fill = filledWithAlpha(drawn(pump).recorder).find((f) => f.key === bore);
    return fill ? fill.alpha : 0;
  }
  assert.equal(glow(0), 0, "no current, no glow");
  assert.ok(glow(0.1) >= 0.15, "a small current still shows");
  assert.ok(glow(0.1) < glow(0.5) && glow(0.5) < glow(1), "brighter with more current");
  assert.ok(glow(1) <= 0.75 && glow(4) === glow(1), "never so bright that the rays vanish in it");
  // Each electrode is wired to the supply: down to the wires' row, then to the supply's side.
  const lines = strokedLines(drawn(0.5).recorder);
  const sides = [L.supply.x, L.supply.x + L.supply.w];
  L.electrodes.forEach((e, i) => {
    const x = e.x + e.w / 2;
    assert.ok(lines.some((l) => l.x1 === x && l.x2 === x && l.y1 === e.y + e.h && l.y2 === L.wireY), "a wire down from electrode " + i);
    assert.ok(lines.some((l) => l.y1 === L.wireY && l.y2 === L.wireY && l.x1 === x && l.x2 === sides[i]), "and on to the supply " + i);
  });
  // The current's arrows only while it flows.
  for (const arrow of L.currentArrows) {
    assert.ok(arrowheadAt(drawn(0.5).recorder, arrow.x, arrow.y, arrow.dy), "a current arrow at " + arrow.x);
    assert.ok(!arrowheadAt(drawn(0).recorder, arrow.x, arrow.y, arrow.dy), "none without a current");
  }
});

test("draw: the pump laser is end-pumped: its beam along the bench to the periscope, up to the axis, into the lens and the rod", () => {
  const w = 900;
  const L = bench.layout(w, heightFor(w));
  const S = L.periscope;
  function beam(pump) {
    const lines = strokedLines(drawAt(w, LABELS, "dark", lit("laser", pump)).recorder);
    const along = lines.find((l) => l.y1 === S.low && l.y2 === S.low && l.x1 === L.pumpLaser.x && l.x2 === S.x);
    const up = lines.find((l) => l.x1 === S.x && l.x2 === S.x && l.y1 === S.low && l.y2 === S.high);
    const into = lines.find((l) => l.y1 === S.high && l.y2 === S.high && l.x1 === S.x && l.x2 === L.lens.x - L.lens.rx);
    return { along: along, up: up, into: into };
  }
  assert.deepEqual(beam(0), { along: undefined, up: undefined, into: undefined }, "pump off: no beam");
  const weak = beam(0.1);
  const strong = beam(1);
  for (const leg of ["along", "up", "into"]) assert.ok(weak[leg] && strong[leg], leg);
  assert.ok(weak.along.alpha === weak.up.alpha && weak.up.alpha === weak.into.alpha, "one beam");
  assert.ok(weak.along.alpha >= 0.3 && weak.along.alpha < strong.along.alpha, "stronger with more pump");
  assert.equal(beam(5).along.alpha, 1, "alpha never above 1");
  // From the lens, the cone into the rod, as the diodes' light: no beam up
  // from under the rod any more.
  const { recorder } = drawAt(w, LABELS, "dark", lit("laser", 0.5));
  assert.ok(recorder.log.some((e) => e.call === "moveTo" && Math.round(L.lens.x) === e.args[0]), "the cone from the lens");
  const rodBottom = L.rod.y + L.rod.h;
  assert.ok(!strokedLines(recorder).some((l) => l.x1 === l.x2 && l.y2 > rodBottom - 1 && l.y2 < rodBottom + 10 && l.y1 > rodBottom + 10 && l.x1 > L.rod.x && l.x1 < L.rod.x + L.rod.w),
    "nothing comes up into the rod from below");
});

/* ---------- the Q-switch (stage 8b) ---------- */

test("layout: the filter in the gap between the back mirror and the rod, around every ray", () => {
  for (const w of WIDTHS) {
    const h = heightFor(w);
    const L = bench.layout(w, h);
    const where = "w = " + w;
    const back = L.backMirror.x + L.backMirror.w;          // the back mirror's inner edge
    const top = L.rays[0];
    const bottom = L.rays[L.rays.length - 1];
    // Between the mirror and the rod, around every ray, with room for the
    // left arrowheads (6 px, 1 px clear of each side).
    const F = L.filter;
    assert.ok(inside(F, w, h), where + ": inside");
    assert.ok(F.x > back + 2, where + ": right of the back mirror");
    assert.ok(F.y < top && F.y + F.h > bottom, where + ": around every ray");
    assertClose(F.y + F.h / 2, L.axis.y, 1e-12, where + ": on the axis");
    assert.ok(L.rod.x - (F.x + F.w) >= 14, where + ": room for the arrowheads after it");
    assert.ok(F.w >= 5, where + ": it can be seen");
  }
});

test("layout: the switch's name on the top row beside the transmission, which keeps most of the row", () => {
  for (const w of WIDTHS) {
    const L = bench.layout(w, heightFor(w));
    const fs = L.fontSize;
    const where = "w = " + w;
    const Q = L.labels.qSwitch;
    const T = L.labels.transmission;
    const S = L.labels.transmissionShared;
    const pad = T.maxWidth === undefined ? 0 : (w - T.maxWidth) / 2;     // the margin: the whole row is w − 2·pad
    const switchLeft = L.filter.x;
    assert.equal(Q.align, "left", where);
    assert.equal(Q.y, T.y, where + ": the top row");
    // From the filter's left, or further left (never past the margin) to
    // keep room for the name.
    assert.ok(Q.x <= switchLeft + 1e-9 && Q.x >= pad - 1e-9, where + ": from " + Q.x);
    // Moved left only for its room: then it has 100 px, or starts at the margin.
    if (Q.x < switchLeft - 1e-9) {
      assert.ok(Math.abs(Q.maxWidth - 100) < 1e-9 || Math.abs(Q.x - pad) < 1e-9, where + ": moved for its room");
    }
    assert.ok(Q.maxWidth >= 90, where + ": room for a word, got " + Q.maxWidth);
    assert.deepEqual([S.x, S.y, S.align], [T.x, T.y, T.align], where + ": the transmission in its own place");
    assertClose(S.maxWidth, 0.6 * (w - 2 * pad - fs), 1e-12, where + ": the transmission's share");
    const q = labelBox(Q, fs);
    const t = labelBox(S, fs);
    assert.ok(q.right + fs <= t.left + 1e-9, where + ": the two apart");
    assert.ok(q.left >= 0 && t.right <= w, where + ": inside");
    // "Թափանցելիություն 5.00 %" needs about 150 px at the smallest font:
    // at 280 px half the row, 128 px, squeezed it (stage 8b review).
    assert.ok(S.maxWidth >= 140, where + ": the transmission still has room, got " + S.maxWidth);
  }
});

test("draw: a filter is a plate in the gap, shaded by its unbleached share", () => {
  const w = 900;
  const L = bench.layout(w, heightFor(w));
  const darkest = (open) => Math.max(...filledWithAlpha(drawAt(w, LABELS, "dark", filtered(open)).recorder)
    .filter((f) => f.key === rectKey(L.filter)).map((f) => f.alpha));
  assert.ok(darkest(0) > darkest(0.5) && darkest(0.5) > darkest(1), "lighter as it bleaches");
  assert.ok(darkest(1) > 0, "a bleached filter is still there");
  assertClose(darkest(0), 0.75, 1e-12, "dark: 0.15 + 0.6");
  assertClose(darkest(1), 0.15, 1e-12, "bleached");
  const { recorder } = drawAt(w, LABELS, "dark", filtered(0));
  assert.ok(rects(recorder, "strokeRect").includes(rectKey(L.filter)), "outlined");
  const standing = posts(recorder, L);
  assert.ok(standing.includes(L.filter.x + L.filter.w / 2), "on a post");
  assert.ok(standing.includes(L.backMirror.x + L.backMirror.w / 2), "the back mirror's post");
  // Without the filter: no plate, no post for it.
  const none = drawAt(w, LABELS, "dark", lit("flashlamp", 0.5)).recorder;
  assert.ok(!rects(none, "fillRect").includes(rectKey(L.filter)), "no plate");
  assert.ok(!posts(none, L).includes(L.filter.x + L.filter.w / 2), "no post");
  // The rays still run from the back mirror's face to the output mirror's.
  const rays = strokedLines(recorder).filter((line) => line.y1 === line.y2 &&
    Math.abs(line.x1 - bench.faceX(L, "back", line.y1)) < 1e-9 && Math.abs(line.x2 - bench.faceX(L, "output", line.y1)) < 1e-9);
  assert.deepEqual(rays.map((ray) => ray.y1), Array.from(L.rays), "every ray, mirror to mirror");
});

test("draw: the left arrowheads move between the filter and the rod", () => {
  for (const w of WIDTHS) {
    const L = bench.layout(w, heightFor(w));
    const { recorder } = drawAt(w, LABELS, "dark", filtered(1));
    const right = L.filter.x + L.filter.w;
    const leftGap = (right + L.rod.x) / 2;
    L.rays.forEach((y, i) => {
      if (i % 2 === 0) return;
      const where = "w = " + w + ", ray " + i;
      const head = sideArrowheadAt(recorder, leftGap - 4, y, -1);
      assert.ok(head, where + ": an arrowhead to the left");
      assert.ok(head.base <= L.rod.x - 1, where + ": clear of the rod");
      assert.ok(leftGap - 4 >= right + 1, where + ": clear of the filter");
    });
  }
});

test("draw: the filter's name, beside the transmission on the top row", () => {
  const w = 600;
  const L = bench.layout(w, heightFor(w));
  function writes(light, labels) {
    const { recorder } = drawAt(w, labels || LABELS, "dark", light);
    return recorder.calls.filter((c) => c.name === "fillText").map((c) => c.args);
  }
  const T = "Transmission 5.00" + NB + "%";
  const texts = writes(filtered(0));
  const Q = L.labels.qSwitch;
  const S = L.labels.transmissionShared;
  const whole = L.labels.transmission;
  assert.deepEqual(texts.find((args) => args[0] === "Bleachable filter"), ["Bleachable filter", Q.x, Q.y, Q.maxWidth]);
  assert.deepEqual(texts.find((args) => args[0] === T), [T, S.x, S.y, S.maxWidth], "the transmission shares the row");
  assert.ok(texts.some((args) => args[0] === "Back mirror"), "the back mirror is still named");
  // Without a name for the filter, the transmission keeps the whole row.
  const nameless = writes(filtered(0), Object.assign({}, LABELS, { qSwitch: "" }));
  assert.deepEqual(nameless.find((args) => args[0] === T), [T, whole.x, whole.y, whole.maxWidth], "no name");
  assert.ok(!nameless.some((args) => args[0] === ""), "nothing empty written");
  // No filter: its name is not written, and the transmission has the row.
  const free = writes(LASING);
  assert.ok(!free.some((args) => args[0] === "Bleachable filter"));
  assert.deepEqual(free.find((args) => args[0] === T), [T, whole.x, whole.y, whole.maxWidth], "no filter");
});

test("draw: a switch the drawing does not know, or one on a gas tube, draws no switch", () => {
  const w = 900;
  const plain = JSON.stringify(drawAt(w, LABELS, "dark", lit("flashlamp", 0.5)).recorder.log);
  // The engine's cell and prism are not drawn: the page offers only the filter.
  for (const kind of ["shutter", "cell", "prism"]) {
    const unknown = Object.assign(lit("flashlamp", 0.5), { qSwitch: { kind: kind, open: 0 } });
    assert.equal(JSON.stringify(drawAt(w, LABELS, "dark", unknown).recorder.log), plain, kind);
  }
  const gas = JSON.stringify(drawAt(w, LABELS, "dark", lit("discharge", 0.5)).recorder.log);
  const gasFilter = Object.assign(lit("discharge", 0.5), { qSwitch: { kind: "absorber", open: 0 } });
  assert.equal(JSON.stringify(drawAt(w, LABELS, "dark", gasFilter).recorder.log), gas, "the tube fills the cavity: no room");
  assert.deepEqual(Array.from(bench.Q_KINDS), Q_KINDS);
  assert.ok(Object.isFrozen(bench.Q_KINDS));
});

/* ---------- stage 10b: the mirrors, the beam's path, F ---------- */

// The scales a cavity is drawn at: metres along the axis and across it.
// The aperture is drawn as the bore's half-height on a discharge (what
// withCavity draws unless told otherwise), the rod's on every other pump.
function scalesOf(L, cavity, kind) {
  const perX = (L.axis.x2 - L.axis.x1) / cavity.length;
  const half = (kind || "discharge") === "discharge" ? L.boreHalf : L.apertureHalf;
  const perY = half / cavity.aperture;
  return { perX, perY };
}

test("the aperture is drawn as the rod's half-height, or the bore's on a discharge: the beam stays inside the medium", () => {
  for (const w of [280, 327, 800, 1400]) {
    const L = bench.layout(w, heightFor(w));
    assertClose(L.apertureHalf, L.rod.h / 2, 1e-12, "w " + w + ": the rod");
    assertClose(L.boreHalf, L.bore.h / 2, 1e-12, "w " + w + ": the bore");
  }
  // A mode as wide as the aperture all along: its outline is the rod's
  // edge on a rod bench, the bore's on a discharge.
  const full = Object.assign({}, HENE, { mode: [0, 0.15, 0.3].map((z) => ({ z: z, w: HENE.aperture })) });
  for (const [kind, edge] of [["diode", "rod"], ["discharge", "bore"]]) {
    const { recorder, view } = drawAt(800, LABELS, "dark", withCavity(full, { pumpKind: kind }));
    const L = bench.layout(800, view.h);
    const top = edge === "rod" ? L.rod.y : L.bore.y;
    assert.ok(recorder.calls.some((c) => c.name === "moveTo" && Math.abs(c.args[1] - top) < 1e-9), kind + ": the outline on the " + edge + "'s edge");
  }
});

test("the mirrors' faces follow their shapes, always standing out of the glass towards the laser: concave rims, a convex middle, flat straight", () => {
  const L = bench.layout(800, heightFor(800));
  const y = L.axis.y;
  const top = L.backMirror.y;
  const backInner = L.backMirror.x + L.backMirror.w;
  const outInner = L.outputMirror.x;
  for (const at of [top, y]) {
    assert.equal(bench.faceX(L, "back", at, "flat"), backInner);
    assert.equal(bench.faceX(L, "output", at, "flat"), outInner);
  }
  assertClose(bench.faceX(L, "back", y, "concave"), backInner, 1e-12, "concave back: the middle on the glass");
  assertClose(bench.faceX(L, "back", top, "concave"), backInner + L.sag, 1e-12, "concave back: the rims out by sag");
  assertClose(bench.faceX(L, "output", y, "concave"), outInner, 1e-12, "concave output");
  assertClose(bench.faceX(L, "output", top, "concave"), outInner - L.sag, 1e-12, "concave output's rims");
  assertClose(bench.faceX(L, "back", y, "convex"), backInner + L.sag, 1e-12, "convex back bulges into the cavity");
  assertClose(bench.faceX(L, "back", top, "convex"), backInner, 1e-12, "convex back's ends on the glass");
  assertClose(bench.faceX(L, "output", y, "convex"), outInner - L.sag, 1e-12, "convex output");
  // Without a shape (no cavity numbers), as before stage 10b: concave.
  assert.equal(bench.faceX(L, "back", y), bench.faceX(L, "back", y, "concave"));
  assert.deepEqual(Array.from(bench.SHAPES), ["flat", "concave", "convex"]);
  // The drawn faces: from rim to rim, with the control point that makes
  // the curve pass faceX on the axis (2·middle − rim).
  const curves = (light) => drawAt(800, LABELS, "dark", light).recorder.calls.filter((c) => c.name === "quadraticCurveTo");
  const flatConcave = curves(withCavity(HENE));
  assert.ok(flatConcave.some((c) => c.args[0] === backInner && c.args[2] === backInner), "the flat back mirror's face is straight");
  assert.ok(flatConcave.some((c) => Math.abs(c.args[0] - (outInner + L.sag)) < 1e-9 && Math.abs(c.args[2] - (outInner - L.sag)) < 1e-9),
    "the concave output mirror: rims out, the middle on the glass");
  const unstable = curves(withCavity(UNSTABLE));
  assert.ok(unstable.some((c) => Math.abs(c.args[0] - (outInner - 2 * L.sag)) < 1e-9 && c.args[2] === outInner), "the convex output mirror bulges");
  assert.ok(unstable.some((c) => Math.abs(c.args[0] - (backInner - L.sag)) < 1e-9 && Math.abs(c.args[2] - (backInner + L.sag)) < 1e-9),
    "the concave back mirror");
});

test("a curved face is drawn deeper the smaller its radius: cavity.curve 0 (the largest radius) gives sagMin, 1 (the smallest) sagMax", () => {
  for (const w of [280, 327, 800, 1400]) {
    const L = bench.layout(w, heightFor(w));
    assert.ok(L.sagMin > 0 && L.sagMin < L.sagMax, "w " + w + ": a range of depths");
    // The deepest face stays clear of the rod and of the gas tube's ends.
    assert.ok(L.backMirror.x + L.backMirror.w + L.sagMax < L.rod.x, "w " + w + ": clear of the rod");
    assert.ok(L.outputMirror.x - L.sagMax > L.rod.x + L.rod.w, "w " + w + ": on both sides");
  }
  const L = bench.layout(800, heightFor(800));
  const backInner = L.backMirror.x + L.backMirror.w;
  const outInner = L.outputMirror.x;
  const faces = (curve) => {
    const cavity = Object.assign({}, UNSTABLE, { curve: curve });
    return drawAt(800, LABELS, "dark", withCavity(cavity)).recorder.calls.filter((c) => c.name === "quadraticCurveTo");
  };
  // Concave back mirror: its rims at sag; convex output: its middle at sag.
  const rimAt = (calls, sag) => calls.some((c) => Math.abs(c.args[2] - (backInner + sag)) < 1e-9);
  const bulgeAt = (calls, sag) => calls.some((c) => Math.abs(c.args[0] - (outInner - 2 * sag)) < 1e-9);
  const flattest = faces({ back: 0, output: 0 });
  assert.ok(rimAt(flattest, L.sagMin) && bulgeAt(flattest, L.sagMin), "the largest radius: sagMin");
  const deepest = faces({ back: 1, output: 1 });
  assert.ok(rimAt(deepest, L.sagMax) && bulgeAt(deepest, L.sagMax), "the smallest radius: sagMax");
  const half = faces({ back: 0.5, output: 0.25 });
  assert.ok(rimAt(half, (L.sagMin + L.sagMax) / 2), "half-way");
  assert.ok(bulgeAt(half, L.sagMin + 0.25 * (L.sagMax - L.sagMin)), "a quarter of the way");
  // Out of range is held at the ends; null, missing or not a number gives sag.
  const held = faces({ back: 7, output: -3 });
  assert.ok(rimAt(held, L.sagMax) && bulgeAt(held, L.sagMin), "held in 0..1");
  for (const curve of [{ back: null, output: NaN }, { back: "1" }, undefined]) {
    const plain = faces(curve);
    assert.ok(rimAt(plain, L.sag) && bulgeAt(plain, L.sag), JSON.stringify(curve) + ": sag");
  }
});

test("the traced rays: straight from mirror face to mirror face, at the heights the engine traced, fainter each round trip", () => {
  for (const w of [327, 800, 1400]) {
    const { recorder, view } = drawAt(w, LABELS, "dark", withCavity(HENE));
    const L = bench.layout(w, view.h);
    const { perY } = scalesOf(L, HENE);
    const lines = strokedLines(recorder);
    const shapes = HENE.shapes;
    const at = (mirror, y) => {
      const Y = L.axis.y - y * perY;
      const which = mirror === 1 ? "back" : "output";
      return { x: bench.faceX(L, which, Y, shapes[which]), y: Y };
    };
    for (const ray of HENE.rays) {
      let from = at(1, ray.y0);
      ray.hits.forEach((hit, k) => {
        const to = at(hit.mirror, hit.y);
        const found = lines.find((l) => Math.abs(l.x1 - from.x) < 1e-9 && Math.abs(l.y1 - from.y) < 1e-9 &&
          Math.abs(l.x2 - to.x) < 1e-9 && Math.abs(l.y2 - to.y) < 1e-9);
        assert.ok(found, "w " + w + ": piece " + k + " of the ray from " + ray.y0);
        // Lasing: full strength on the first round trip, × 0.72 on each next.
        assertClose(found.alpha, Math.pow(0.72, Math.floor(k / 2)), 1e-12, "fade " + k);
        from = to;
      });
    }
  }
  // A dark laser still shows the path, faintly (0.3).
  const dark = strokedLines(drawAt(800, LABELS, "dark", withCavity(HENE, { beam: 0 })).recorder);
  const L = bench.layout(800, heightFor(800));
  const first = dark.find((l) => Math.abs(l.x1 - bench.faceX(L, "back", 0, "flat")) < 1e-9 && l.x2 > l.x1 + 100);
  assert.ok(first, "a path from the back mirror");
  assertClose(first.alpha, 0.3, 1e-12, "a dark laser's path");
});

test("the beam's shape: the mode's width along the cavity, as an hourglass; a band without a mode; nothing when dark", () => {
  const { recorder, view } = drawAt(800, LABELS, "dark", withCavity(HENE));
  const L = bench.layout(800, view.h);
  const { perX, perY } = scalesOf(L, HENE);
  const calls = recorder.calls;
  // The shaded outline: moveTo at the first point, then along the top and back along the bottom.
  const start = calls.findIndex((c) => c.name === "moveTo" &&
    Math.abs(c.args[0] - L.axis.x1) < 1e-9 && Math.abs(c.args[1] - (L.axis.y - HENE.mode[0].w * perY)) < 1e-9);
  assert.ok(start >= 0, "the outline starts at mirror 1, one width above the axis");
  HENE.mode.slice(1).forEach((point, k) => {
    const call = calls[start + 1 + k];
    assert.equal(call.name, "lineTo");
    assertClose(call.args[0], L.axis.x1 + point.z * perX, 1e-12, "x " + k);
    assertClose(call.args[1], L.axis.y - point.w * perY, 1e-12, "top " + k);
  });
  const back = calls[start + HENE.mode.length];
  assertClose(back.args[1], L.axis.y + HENE.mode[HENE.mode.length - 1].w * perY, 1e-12, "and back along the bottom");
  // No mode (unstable): a band half the aperture wide.
  const band = drawAt(800, LABELS, "dark", withCavity(UNSTABLE)).recorder.calls;
  assert.ok(band.some((c) => c.name === "moveTo" && Math.abs(c.args[1] - (L.axis.y - L.boreHalf / 2)) < 1e-9), "a band");
  // Dark: no shaded beam, no light leaving.
  const dark = drawAt(800, LABELS, "dark", withCavity(HENE, { beam: 0 }));
  // (The outline is the one path of more than three lineTo's in a row.)
  const outlines = (calls) => calls.filter((c, i) => c.name === "moveTo" &&
    calls.slice(i + 1, i + 5).every((next) => next.name === "lineTo")).length;
  assert.equal(outlines(calls), 1, "one outline, lasing");
  assert.equal(outlines(dark.recorder.calls), 0, "no shaded beam");
  assert.equal(raysLeaving(dark.recorder, L, dark.view).length, 0, "no light leaves a dark laser");
});

test("the light leaving: round(rays × transmission) of the rays across the beam at the output mirror", () => {
  for (const T of [0.05, 0.3, 1]) {
    const { recorder, view } = drawAt(800, LABELS, "dark", withCavity(HENE, { transmission: T }));
    const L = bench.layout(800, view.h);
    const { perY } = scalesOf(L, HENE);
    const spot = HENE.mode[HENE.mode.length - 1].w * perY;
    const half = Math.min(10, Math.floor(spot / 5));
    const count = 2 * half + 1;
    const leaving = raysLeaving(recorder, L, view);
    assert.equal(leaving.length, bench.raysOut(count, T), "T " + T);
    for (const l of leaving) assert.ok(Math.abs(l.y1 - L.axis.y) <= spot + 1e-9, "inside the spot");
  }
});

test("a ray that walks out goes on past the mirror's edge, straight, for a short run (6 % of the width), never off the picture", () => {
  for (const w of [327, 800, 1400]) {
    const { recorder, view } = drawAt(w, LABELS, "dark", withCavity(UNSTABLE));
    const L = bench.layout(w, view.h);
    const { perX, perY } = scalesOf(L, UNSTABLE);
    const last = UNSTABLE.rays[0].hits[3];               // past the aperture at mirror 1
    const Y = L.axis.y - last.y * perY;
    assert.ok(Y < L.axis.y - L.boreHalf, "it meets mirror 1's plane past the bore");
    const out = strokedLines(recorder).find((l) => Math.abs(l.y1 - Y) < 1e-9 && l.x2 < l.x1);
    assert.ok(out, "w " + w + ": the piece going on to the left");
    // Straight on: θ per metre travelled, leftwards; the picture's slope.
    const slope = (out.y2 - out.y1) / (out.x1 - out.x2);
    assertClose(slope, -last.theta * perY / perX, 1e-9, "its slope");
    // A short run: 6 % of the width across, or less where it meets the
    // picture's edge (the left one or the top).
    const across = out.x1 - out.x2;
    const atEdge = Math.abs(out.x2) < 1e-6 || Math.abs(out.y2) < 1e-6;
    assert.ok(Math.abs(across - 0.06 * w) < 1e-9 || (atEdge && across < 0.06 * w + 1e-9), "w " + w + ": " + across);
    assert.ok(out.x2 >= -1e-9 && out.y2 >= -1e-9, "on the picture");
  }
});

test("F₁, F₂: R/2 from each curved mirror on the drawing's axis scale; solid in front, hollow and dashed behind; off the picture, an arrow at its edge", () => {
  const { recorder, view } = drawAt(800, LABELS, "dark", withCavity(HENE));
  const L = bench.layout(800, view.h);
  const { perX } = scalesOf(L, HENE);
  // The concave output mirror's F, 22.5 cm in front of it.
  const x = L.axis.x2 - 0.225 * perX;
  const arcs = recorder.calls.filter((c) => c.name === "arc" && c.args[1] === L.axis.y);
  assert.equal(arcs.length, 1, "one F: the flat mirror has none");
  assertClose(arcs[0].args[0], x, 1e-12, "F at R/2");
  const words = recorder.calls.filter((c) => c.name === "fillText" && /^F/.test(c.args[0]));
  assert.equal(words.length, 1);
  assert.equal(words[0].args[0], "F₂", "the output mirror's");
  assertClose(words[0].args[1], x, 1e-12, "the word on the point");
  // Solid: filled right after its arc.
  const i = recorder.calls.indexOf(arcs[0]);
  assert.equal(recorder.calls[i + 1].name, "fill");

  // A virtual F behind a convex mirror, on the picture: hollow and dashed.
  const near = withCavity(Object.assign({}, UNSTABLE, { focus: { back: null, output: -0.05 } }));
  const drawn = drawAt(800, LABELS, "dark", near).recorder.calls;
  const arc = drawn.find((c) => c.name === "arc" && c.args[1] === L.axis.y);
  assertClose(arc.args[0], L.axis.x2 + 0.05 * scalesOf(L, UNSTABLE).perX, 1e-12, "behind the mirror");
  const k = drawn.indexOf(arc);
  assert.equal(drawn[k + 1].name, "setLineDash");
  assert.deepEqual(Array.from(drawn[k + 1].args[0]), [2, 2]);
  assert.equal(drawn[k + 2].name, "stroke");

  // 2.5 m away on a 50 cm cavity: off the picture, an arrowhead in the
  // margin and the words just inside the mirror, on each mirror's row
  // (back first), no wider than the gap before the electrode on a
  // discharge, before the rod otherwise (the review: in the margin they
  // ran over the mirror's post).
  for (const [kind, room] of [["discharge", L.focusRoom.discharge], ["flashlamp", L.focusRoom.rod]]) {
    const far = drawAt(800, LABELS, "dark", withCavity(UNSTABLE, { pumpKind: kind }));
    const texts = far.recorder.calls.filter((c) => c.name === "fillText" && /^F. /.test(c.args[0]));
    assert.deepEqual(texts.map((t) => t.args[0]), ["F₁ 2.50" + NB + "m", "F₂ 2.50" + NB + "m"], kind);
    assert.equal(texts[0].args[2], L.focusRows[0], "the back mirror's on the first row");
    assert.equal(texts[1].args[2], L.focusRows[1], "the output mirror's on the second");
    // Both lie to the right (the back mirror's F in front of it, the convex
    // mirror's behind it): right-aligned just inside the output mirror.
    for (const t of texts) {
      // 8 px beyond the deepest a face can stand out (sagMax), so even
      // the smallest radius's face does not run into the words.
      assertClose(t.args[1], L.axis.x2 - 8 - L.sagMax, 1e-12, "inside the output mirror, clear of its face");
      assertClose(t.args[3], Math.max(10, room - L.sagMax), 1e-12, kind + ": its room, less the face");
    }
    assert.ok(room < L.rod.x - L.axis.x1, "never past the rod's start");
    // Arrowheads at the right edge: the real F₁'s filled, the virtual F₂'s
    // outlined.
    const calls = far.recorder.calls;
    const tips = calls.filter((c) => c.name === "moveTo" && c.args[0] === 800 - 2);
    assert.equal(tips.length, 2);
    const after = (tip) => calls.slice(calls.indexOf(tip)).find((c) => c.name === "fill" || c.name === "stroke").name;
    assert.deepEqual(tips.map(after), ["fill", "stroke"], "solid for the real F, hollow for the virtual one");
    assert.equal(calls.filter((c) => c.name === "arc" && c.args[1] === L.axis.y).length, 0, "no dot on the picture");
  }
  // Without a word for F, only the distance.
  const bare = drawAt(800, Object.assign({}, LABELS, { focus: "" }), "dark", withCavity(UNSTABLE)).recorder.calls;
  assert.ok(bare.some((c) => c.name === "fillText" && c.args[0] === "2.50" + NB + "m"));
});

test("'Widths × k': how many times wider than the lengths the widths are drawn, bottom left", () => {
  for (const w of [327, 800]) {
    const { recorder, view } = drawAt(w, LABELS, "dark", withCavity(HENE));
    const L = bench.layout(w, view.h);
    const { perX, perY } = scalesOf(L, HENE);
    const text = recorder.calls.find((c) => c.name === "fillText" && /^Widths × /.test(c.args[0]));
    assert.ok(text, "w " + w);
    assert.equal(text.args[0], "Widths × " + String(Number((perY / perX).toPrecision(2))));
    assert.deepEqual(text.args.slice(1), [L.labels.widths.x, L.labels.widths.y, L.labels.widths.maxWidth]);
    // Left of the pump's name.
    assert.ok(L.labels.widths.x + L.labels.widths.maxWidth < L.labels.pump.x - L.labels.pump.maxWidth / 2, "beside the pump's name");
  }
  // Without the cavity's numbers, not written (the scale means nothing).
  assert.ok(!drawAt(800, LABELS, "dark", LASING).recorder.calls.some((c) => c.name === "fillText" && /^Widths/.test(c.args[0])));
});

test("the traced rays are clipped to a band a quarter of a mirror above and below the mirrors, inside save/restore", () => {
  for (const w of [327, 800, 1400]) {
    const { recorder, view } = drawAt(w, LABELS, "dark", withCavity(UNSTABLE));
    const L = bench.layout(w, view.h);
    const clips = recorder.calls.filter((c) => c.name === "clip");
    assert.equal(clips.length, 1, "w " + w);
    const at = recorder.calls.indexOf(clips[0]);
    const rect = recorder.calls.slice(0, at).filter((c) => c.name === "rect").pop();
    const m = L.backMirror;
    assertClose(rect.args[1], Math.max(0, m.y - 0.25 * m.h), 1e-9, "top");
    assertClose(rect.args[1] + rect.args[3], Math.min(view.h, m.y + 1.25 * m.h), 1e-9, "bottom");
    assert.equal(rect.args[0], 0);
    assert.equal(rect.args[2], w);
    // The clip ends with its restore before the output rays are drawn.
    const saves = recorder.calls.slice(0, at).filter((c) => c.name === "save").length;
    const restores = recorder.calls.slice(0, at).filter((c) => c.name === "restore").length;
    assert.ok(saves - restores >= 2, "inside its own save, within the drawing's");
  }
  // Without a cavity: no clip.
  assert.equal(drawAt(800, LABELS, "dark", LIGHTS[0]).recorder.calls.filter((c) => c.name === "clip").length, 0);
});

/* ---------- stage 10c: each medium's look and its beam's colour ---------- */

test("a crystal rod in its own colour: a highlight along its top, a polished end face at each end, an edge readable on the theme", () => {
  for (const theme of ["dark", "light"]) {
    const { recorder, view } = drawAt(800, LABELS, theme, ofBench({ medium: "ruby", pump: "flashlamp", lam: 694.3e-9 }, { pump: 0 }));
    const L = bench.layout(800, view.h);
    const M = UI.materials;
    const body = M.MEDIA.ruby.body;
    const fills = recorder.log.filter((e) => e.set === "fillStyle").map((e) => e.value);
    assert.ok(fills.includes(body), theme + ": ruby's colour");
    assert.ok(fills.includes(M.HIGHLIGHT), theme + ": the highlight");
    // The highlight is a strip along the rod's top, inside the rod.
    const at = recorder.log.findIndex((e) => e.set === "fillStyle" && e.value === M.HIGHLIGHT);
    const strip = recorder.log.slice(at).find((e) => e.call === "fillRect");
    assert.ok(strip && strip.args[1] > L.rod.y && strip.args[1] + strip.args[3] < L.axis.y, theme + ": a strip in the rod's upper half");
    assert.ok(strip.args[0] > L.rod.x && strip.args[0] + strip.args[2] < L.rod.x + L.rod.w);
    const ends = recorder.calls.filter((c) => c.name === "ellipse");
    assert.deepEqual(ends.map((c) => c.args[0]), [L.rod.x, L.rod.x + L.rod.w], "an end face at each end");
    for (const e of ends) assertClose(e.args[1], L.axis.y, 1e-9);
    const edges = recorder.log.filter((e) => e.set === "strokeStyle").map((e) => e.value);
    assert.ok(edges.includes(M.readable(body, view.colors.bg)), theme + ": the edge readable");
  }
  // A pale rod on the cream theme: its edge darkened to be seen.
  const pale = drawAt(800, LABELS, "light", ofBench({ medium: "nd-yag", pump: "diode", lam: 1064e-9 }));
  const lilac = UI.materials.MEDIA["nd-yag"].body;
  const readableEdge = UI.materials.readable(lilac, pale.view.colors.bg);
  assert.notEqual(readableEdge, lilac, "lilac is too pale on cream as it is");
  const strokes = pale.recorder.log.filter((e) => e.set === "strokeStyle").map((e) => e.value);
  assert.ok(strokes.includes(readableEdge) && !strokes.includes(lilac), "the edge darkened");
  // Nd:YAG lilac, Ti:sapphire pink: each its own.
  for (const id of ["nd-yag", "nd-glass", "ti-sapphire"]) {
    const { recorder } = drawAt(800, LABELS, "dark", ofBench({ medium: id, pump: "laser", lam: 1e-6 }));
    assert.ok(recorder.log.some((e) => e.set === "fillStyle" && e.value === UI.materials.MEDIA[id].body), id);
  }
});

test("the dye in a glass cell, with a pipe in and a pipe out under it", () => {
  const { recorder, view } = drawAt(800, LABELS, "dark", ofBench({ medium: "dye-r6g", pump: "laser", lam: 600e-9 }));
  const L = bench.layout(800, view.h);
  const M = UI.materials;
  const fills = recorder.log.filter((e) => e.set === "fillStyle").map((e) => e.value);
  assert.ok(fills.includes(M.MEDIA["dye-r6g"].body) && fills.includes(M.GLASS));
  assert.equal(recorder.calls.filter((c) => c.name === "ellipse" && (c.args[0] === L.rod.x || c.args[0] === L.rod.x + L.rod.w)).length, 0,
    "no polished rod ends");
  // The glass stays inside the rod's outline: nothing above it, where the
  // medium's name is written.
  for (const c of recorder.calls.filter((c) => c.name === "fillRect" || c.name === "strokeRect")) {
    if (c.args[0] >= L.rod.x - 1e-9 && c.args[0] + c.args[2] <= L.rod.x + L.rod.w + 1e-9) {
      assert.ok(c.args[1] >= L.rod.y - 1e-9, "nothing of the cell above the rod's top: " + c.args.join(", "));
    }
  }
  for (const x of L.cellPipes) {
    const pipe = recorder.calls.find((c) => c.name === "strokeRect" && Math.abs(c.args[0] + c.args[2] / 2 - x) < 1e-9);
    assert.ok(pipe, "a pipe at " + x);
    assertClose(pipe.args[1], L.rod.y + L.rod.h, 1e-9, "from the cell's bottom down");
    assert.ok(pipe.args[1] + pipe.args[3] < L.railY, "above the bench");
  }
  // Clear of the rod's posts.
  for (const x of L.cellPipes) {
    for (const post of L.rodPosts) assert.ok(Math.abs(x - post) > 10, "clear of a post");
  }
});

test("a gas glows in its own colour, inside glass; with the current off it does not glow", () => {
  const M = UI.materials;
  for (const id of ["he-ne", "ar-ion", "co2"]) {
    const on = drawAt(800, LABELS, "dark", ofBench({ medium: id, pump: "discharge", lam: 600e-9 })).recorder;
    const glow = on.log.findIndex((e) => e.set === "fillStyle" && e.value === M.MEDIA[id].body);
    assert.ok(glow > 0, id + ": its glow");
    const L = bench.layout(800, heightFor(800));
    const bore = on.log.slice(glow).find((e) => e.call === "fillRect");
    assert.deepEqual(bore.args, [L.bore.x, L.bore.y, L.bore.w, L.bore.h], id + ": in the bore");
    const off = drawAt(800, LABELS, "dark", ofBench({ medium: id, pump: "discharge", lam: 600e-9 }, { pump: 0 })).recorder;
    assert.ok(!off.calls.some((c) => c.name === "fillRect" && c.args.join(",") === [L.bore.x, L.bore.y, L.bore.w, L.bore.h].join(",")),
      id + ": the bore dark without a current");
    assert.ok(!off.log.some((e) => e.set === "fillStyle" && e.value === M.MEDIA[id].body), id + ": nothing in the glow's colour without a current");
    assert.ok(off.log.some((e) => e.set === "fillStyle" && e.value === M.GLASS), id + ": glass");
  }
});

test("the beam in its wavelength's colour, readable on the theme: every ray, the hourglass, the light leaving", () => {
  const M = UI.materials;
  for (const theme of ["dark", "light"]) {
    for (const [id, lam] of [["he-ne", 632.8e-9], ["ar-ion", 514.5e-9], ["ruby", 694.3e-9]]) {
      const pump = id === "ruby" ? "flashlamp" : "discharge";
      for (const cavity of [undefined, HENE]) {
        const light = ofBench({ medium: id, pump: pump, lam: lam }, cavity ? { cavity: cavity } : {});
        const { recorder, view } = drawAt(800, LABELS, theme, light);
        const colour = M.readable(M.beam(lam).color, view.colors.bg);
        const styles = recorder.log.filter((e) => e.set === "strokeStyle" || e.set === "fillStyle").map((e) => e.value);
        assert.ok(styles.includes(colour), theme + " " + id + (cavity ? " with a cavity" : ""));
        assert.ok(!styles.includes(view.colors.accent2), theme + " " + id + ": not the theme's beam colour");
      }
    }
  }
});

test("an invisible beam: the false colour, and its wavelength written with 'infrared, invisible' at the bottom right", () => {
  const M = UI.materials;
  for (const [id, lam, text] of [["nd-yag", 1064e-9, "1.06" + NB + "µm"], ["co2", 10.6e-6, "10.6" + NB + "µm"]]) {
    const { recorder, view } = drawAt(800, LABELS, "dark", ofBench({ medium: id, pump: id === "co2" ? "discharge" : "diode", lam: lam }));
    const L = bench.layout(800, view.h);
    const styles = recorder.log.filter((e) => e.set === "strokeStyle").map((e) => e.value);
    assert.ok(styles.includes(M.readable(M.INFRARED, view.colors.bg)), id + ": the false colour");
    const note = recorder.calls.find((c) => c.name === "fillText" && /infrared, invisible$/.test(c.args[0]));
    assert.ok(note, id);
    assert.equal(note.args[0], text + " · infrared, invisible");
    assert.deepEqual(note.args.slice(1), [L.labels.invisible.x, L.labels.invisible.y, L.labels.invisible.maxWidth]);
  }
  // A visible beam, the two-level atom, or no word: no note.
  for (const light of [ofBench({ medium: "he-ne", pump: "discharge", lam: 632.8e-9 }),
    ofBench({ medium: "two-level", pump: "laser", lam: 1064e-9 })]) {
    const { recorder } = drawAt(800, LABELS, "dark", light);
    assert.ok(!recorder.calls.some((c) => c.name === "fillText" && /invisible/.test(c.args[0])), light.medium);
  }
  const bare = drawAt(800, Object.assign({}, LABELS, { infrared: "" }), "dark", ofBench({ medium: "nd-yag", pump: "diode", lam: 1064e-9 }));
  assert.ok(!bare.recorder.calls.some((c) => c.name === "fillText" && /µm/.test(c.args[0])));
});

test("the two-level atom, or a light without a medium, keeps the theme's colours (the mirrors and the flash's readable light excepted)", () => {
  for (const light of [ofBench({ medium: "two-level", pump: "flashlamp", lam: 694.3e-9 }), LASING]) {
    for (const theme of ["dark", "light"]) {
      const { recorder, view } = drawAt(800, LABELS, theme, light);
      const allowed = Object.values(view.colors).concat(mirrorColours(view.colors),
        [UI.materials.readable(view.colors.flash, view.colors.bg)]);
      for (const set of recorder.sets.filter((e) => /Style$/.test(e.name))) {
        assert.ok(allowed.includes(set.value), theme + ": " + set.value);
      }
    }
  }
});

test("the glass of a gas tube and of a dye cell is outlined so it shows on the theme, never in the raw pale glass", () => {
  const M = UI.materials;
  for (const theme of ["dark", "light"]) {
    for (const light of [ofBench({ medium: "he-ne", pump: "discharge", lam: 632.8e-9 }), ofBench({ medium: "dye-r6g", pump: "laser", lam: 600e-9 })]) {
      const { recorder, view } = drawAt(800, LABELS, theme, light);
      const strokes = recorder.log.filter((e) => e.set === "strokeStyle").map((e) => e.value);
      const outline = M.readable(M.GLASS, view.colors.bg);
      assert.ok(strokes.includes(outline), theme + " " + light.medium + ": the outline");
      assert.ok(M.contrast(outline, view.colors.bg) >= 3, theme + ": it shows");
      if (theme === "light") assert.ok(!strokes.includes(M.GLASS), light.medium + ": not the pale glass itself");
    }
  }
});

test("a crystal's shade along its bottom is darker on both themes, not more of its colour", () => {
  for (const theme of ["dark", "light"]) {
    const { recorder, view } = drawAt(800, LABELS, theme, ofBench({ medium: "ruby", pump: "flashlamp", lam: 694.3e-9 }, { pump: 0 }));
    const L = bench.layout(800, view.h);
    const at = recorder.log.findIndex((e) => e.set === "fillStyle" && e.value === UI.materials.SHADE);
    assert.ok(at > 0, theme + ": a shade");
    const strip = recorder.log.slice(at).find((e) => e.call === "fillRect");
    assert.ok(strip.args[1] > L.axis.y && strip.args[1] + strip.args[3] <= L.rod.y + L.rod.h + 1e-9, theme + ": in the rod's lower half");
  }
});

test("a coloured ray runs over a thin casing in the background's colour, so it shows over a medium of its own hue", () => {
  for (const cavity of [undefined, HENE]) {
    const light = ofBench({ medium: "he-ne", pump: "discharge", lam: 632.8e-9 }, cavity ? { cavity: cavity } : {});
    const { recorder, view } = drawAt(800, LABELS, "dark", light);
    const colour = UI.materials.readable(UI.materials.beam(632.8e-9).color, view.colors.bg);
    const lines = strokedLines(recorder);
    const rays = lines.filter((l) => l.strokeStyle === colour);
    const casings = lines.filter((l) => l.strokeStyle === view.colors.bg);
    // Every ray between the mirrors (the light leaving, over the
    // background, needs none).
    const M2 = bench.layout(800, view.h).outputMirror;
    const inside = rays.filter((l) => Math.max(l.x1, l.x2) <= M2.x + M2.w + 1e-9);
    assert.ok(inside.length > 0 && casings.length >= inside.length, (cavity ? "cavity" : "parallel") + ": a casing under every ray");
    for (const c of casings) assert.ok(c.lineWidth > rays[0].lineWidth, "wider than the ray");
  }
  // The theme's own beam (no medium) has none.
  const plain = drawAt(800, LABELS, "dark", LASING);
  assert.ok(!strokedLines(plain.recorder).some((l) => l.strokeStyle === plain.view.colors.bg));
});

test("a medium id that is a name on every object ('constructor') is no medium: the theme's colours", () => {
  for (const id of ["constructor", "toString", "__proto__"]) {
    const { recorder, view } = drawAt(800, LABELS, "dark", ofBench({ medium: id, pump: "laser", lam: 1064e-9 }));
    const allowed = Object.values(view.colors).concat(mirrorColours(view.colors));
    for (const set of recorder.sets.filter((e) => /Style$/.test(e.name))) assert.ok(allowed.includes(set.value), id + ": " + set.value);
    assert.ok(!recorder.calls.some((c) => c.name === "fillText" && /invisible/.test(c.args[0])), id);
  }
});

test("ultraviolet light is called ultraviolet, not infrared", () => {
  const { recorder } = drawAt(800, LABELS, "dark", ofBench({ medium: "ruby", pump: "flashlamp", lam: 347.15e-9 }));
  const note = recorder.calls.find((c) => c.name === "fillText" && /invisible$/.test(c.args[0]));
  assert.ok(note && /ultraviolet, invisible$/.test(note.args[0]), note && note.args[0]);
});

/* ---------- stage 10c2: the pump's light ---------- */

const NDYAG = { medium: "nd-yag", pump: "diode", lam: 1064e-9 };
function endPumped(extra) {
  return ofBench(NDYAG, Object.assign({ pumpLam: 808e-9 }, extra || {}));
}
// The dots of a drawing: arcs filled, each with its radius, colour and alpha.
function dots(recorder) {
  const list = [];
  let alpha = 1;
  let fill = null;
  let arc = null;
  for (const e of recorder.log) {
    if (e.set === "globalAlpha") alpha = e.value;
    if (e.set === "fillStyle") fill = e.value;
    if (e.call === "beginPath") arc = null;
    if (e.call === "arc") arc = { x: e.args[0], y: e.args[1], r: e.args[2] };
    if (e.call === "fill" && arc) list.push(Object.assign({ fill: fill, alpha: alpha }, arc));
  }
  return list;
}

test("layout: the end-pumped diodes, inside the canvas at every width: the module on the bench, the lens behind the back mirror", () => {
  for (const w of WIDTHS) {
    const h = heightFor(w);
    const L = bench.layout(w, h);
    const where = "w = " + w;
    const M = L.diodeModule;
    assert.ok(inside(M, w, h), where);
    assertClose(M.y + M.h, L.railY, 1e-9, where + ": on the bench");
    assert.ok(M.y - L.finHeight > L.rod.y + L.rod.h, where + ": its fins under the rod");
    for (const post of L.rodPosts) {
      assert.ok(M.x > post + bench.POST_FOOT / 2 || M.x + M.w < post - bench.POST_FOOT / 2, where + ": clear of a rod post's foot");
    }
    // The fibre goes up the left margin, the lens stands between it and
    // the back mirror, on the axis.
    assert.ok(L.fibre.x > 0 && L.fibre.x < L.lens.x - L.lens.rx, where + ": the fibre left of the lens");
    assert.ok(L.lens.x + L.lens.rx < L.backMirror.x, where + ": the lens behind the back mirror");
    assert.equal(L.lens.y, L.axis.y);
    assert.ok(L.lens.y - L.lens.ry > 0 && L.lens.ry > L.cone.start, where + ": the lens wider than its cone");
    assert.ok(L.fibre.y > M.y && L.fibre.y < M.y + M.h, where + ": the fibre leaves the module");
    assert.ok(L.fibre.corner > 0 && L.fibre.x + L.fibre.corner <= L.lens.x - L.lens.rx + 1e-9, where);
    // The cone narrows to a waist inside the rod.
    assert.ok(L.cone.waistX > L.rod.x && L.cone.waistX < L.rod.x + L.rod.w / 2, where);
    assert.ok(L.cone.waist < L.cone.start && L.cone.waist < L.cone.end && L.cone.end < L.rod.h / 2, where);
    assertClose(L.pumpDepth, bench.PUMP_DEPTH * L.rod.w, 1e-9);
  }
});

test("the diodes: a module with fins, a fibre to the lens, the lens on the axis; no light with the pump off", () => {
  const { recorder, view } = drawAt(900, LABELS, "dark", endPumped({ pump: 0 }));
  const L = bench.layout(900, view.h);
  const M = L.diodeModule;
  assert.ok(rects(recorder, "strokeRect").includes(rectKey(M)), "the module");
  const fins = strokedLines(recorder).filter((l) => l.x1 === l.x2 && l.y1 === M.y && Math.abs(l.y2 - (M.y - L.finHeight)) < 1e-9);
  assert.equal(fins.length, L.fins, "its fins");
  // The fibre: from the module, along the bench, up the margin, to the lens.
  const log = recorder.log;
  const start = log.findIndex((e) => e.call === "moveTo" && e.args[0] === M.x && e.args[1] === L.fibre.y);
  assert.ok(start > 0, "the fibre starts at the module");
  const path = [];
  for (let i = start + 1; log[i].call === "lineTo"; i++) path.push(log[i].args);
  assert.deepEqual(path[path.length - 1], [L.lens.x - L.lens.rx, L.axis.y], "it ends at the lens");
  assert.ok(path.some((p) => p[0] === L.fibre.x), "up the margin");
  const lens = recorder.calls.find((c) => c.name === "ellipse" && c.args[0] === L.lens.x);
  assert.deepEqual(lens.args.slice(0, 4), [L.lens.x, L.axis.y, L.lens.rx, L.lens.ry]);
  // Off: no cone, no photons.
  assert.equal(dots(recorder).filter((d) => d.r === 2.2 || d.r === 3.2).length, 0);
  const dark = drawAt(900, LABELS, "dark", endPumped({ pump: 0, beam: 0 }));
  const pumpColour = UI.materials.readable(UI.materials.PUMP_INFRARED, dark.view.colors.bg);
  assert.ok(!dark.recorder.log.some((e) => e.set === "fillStyle" && e.value === pumpColour), "no cone with the pump off");
});

test("the diodes' cone: through the back mirror into the rod, fading as it is absorbed, stronger with more pump, in 808 nm's false colour", () => {
  function cone(light, theme) {
    const { recorder, view } = drawAt(900, LABELS, theme || "dark", light);
    const colour = light.medium ? UI.materials.readable(UI.materials.PUMP_INFRARED, view.colors.bg) : view.colors.glow;
    // The slices: four-cornered paths filled in the pump's colour.
    const slices = [];
    let alpha = 1;
    let fill = null;
    const log = recorder.log;
    for (let i = 0; i + 5 < log.length; i++) {
      if (log[i].set === "globalAlpha") alpha = log[i].value;
      if (log[i].set === "fillStyle") fill = log[i].value;
      if (log[i].call === "moveTo" && log[i + 1].call === "lineTo" && log[i + 2].call === "lineTo" && log[i + 3].call === "lineTo" &&
        log[i + 4].call === "closePath" && log[i + 5].call === "fill" && fill === colour) {
        slices.push({ x1: log[i].args[0], x2: log[i + 1].args[0], alpha: alpha });
      }
    }
    return { slices: slices, L: bench.layout(900, view.h) };
  }
  const { slices, L } = cone(endPumped({ pump: 0.5 }));
  assert.ok(slices.length >= 10, "in slices");
  // Its slices' edges at whole pixels (at fractions they showed seams).
  for (const sl of slices) assert.ok(Number.isInteger(sl.x1) && Number.isInteger(sl.x2), "whole pixels");
  assertClose(slices[0].x1, L.lens.x, 0.5, "from the lens");
  assertClose(slices[slices.length - 1].x2, L.rod.x + L.rod.w, 0.5, "to the rod's far end");
  // Inside the rod it fades as e^(−z/d).
  const inRod = slices.filter((s) => s.x1 >= L.rod.x);
  for (let i = 1; i < inRod.length; i++) assert.ok(inRod[i].alpha < inRod[i - 1].alpha, "fainter further in");
  const a = inRod[1];
  const b = inRod[inRod.length - 1];
  assertClose(b.alpha / a.alpha, Math.exp(-(((b.x1 + b.x2) - (a.x1 + a.x2)) / 2) / L.pumpDepth), 1e-9, "e^(−z/d)");
  // More pump, stronger.
  assert.ok(cone(endPumped({ pump: 1 })).slices[0].alpha > slices[0].alpha);
  // Without a medium: the theme's glow.
  assert.ok(cone({ beam: 1, pump: 0.5, transmission: 0.05, pumpKind: "diode" }).slices.length >= 10);
  assert.ok(cone(endPumped({ pump: 0.5 }), "light").slices.length >= 10, "on the cream theme too");
  // A pump laser's cone, the same way, green (stage 10c2: end-pumped).
  const green = (theme) => {
    const { recorder, view } = drawAt(900, LABELS, theme, ofBench({ medium: "ti-sapphire", pump: "laser", lam: 800e-9 }, { pumpLam: 532e-9 }));
    const colour = UI.materials.readable(UI.materials.beam(532e-9).color, view.colors.bg);
    let fill = null;
    let count = 0;
    for (const e of recorder.log) {
      if (e.set === "fillStyle") fill = e.value;
      if (e.call === "fill" && fill === colour) count++;
    }
    return count;
  };
  assert.ok(green("dark") >= 10 && green("light") >= 10, "the pump laser's green cone");
});

test("pump photons: as many as the pump is strong, travelling into the medium and absorbed inside it, each lighting an atom", () => {
  const N = bench.PUMP_PHOTONS;
  for (const [name, light] of [
    ["diodes", endPumped()],
    ["pump laser", ofBench({ medium: "ti-sapphire", pump: "laser", lam: 800e-9 }, { pumpLam: 532e-9 })],
    ["flashlamp", ofBench({ medium: "ruby", pump: "flashlamp", lam: 694.3e-9 })]
  ]) {
    for (const pump of [0.05, 0.5, 1]) {
      for (const t of [0, 0.37, 1.9, 12.25]) {
        const { recorder, view } = drawAt(900, LABELS, "dark", Object.assign({}, light, { pump: pump }), t);
        const L = bench.layout(900, view.h);
        const moving = dots(recorder).filter((d) => d.r === 2.2);
        const sparks = dots(recorder).filter((d) => d.r === 3.2);
        const where = name + " at pump " + pump + ", t = " + t;
        assert.equal(moving.length + sparks.length, Math.ceil(N * pump), where);
        for (const s of sparks) {
          assert.equal(s.fill, UI.materials.HIGHLIGHT, where + ": a spark");
          assert.ok(Math.abs(s.alpha) <= 0.9 + 1e-12);
          assert.ok(s.x >= L.rod.x && s.x <= L.rod.x + L.rod.w && s.y >= L.rod.y && s.y <= L.rod.y + L.rod.h, where + ": absorbed in the rod");
        }
        const raw = name === "flashlamp" ? view.colors.flash
          : name === "diodes" ? UI.materials.PUMP_INFRARED : UI.materials.beam(light.pumpLam).color;
        const colour = UI.materials.readable(raw, view.colors.bg);
        for (const m of moving) {
          assert.equal(m.fill, colour, where + ": in the pump's colour");
          // End-pumped (diodes, pump laser): along the axis from the lens;
          // a flashlamp's: up from the tube.
          if (name === "flashlamp") assert.ok(m.y <= L.flashTube.y && m.y >= L.rod.y, where);
          else {
            assert.ok(m.x >= L.lens.x && m.x <= L.rod.x + L.rod.w, where);
            assert.ok(Math.abs(m.y - L.axis.y) <= L.cone.start, where + ": inside the cone, along the axis");
          }
        }
      }
    }
    // They move with screen time, and stand still for less motion.
    const at0 = JSON.stringify(dots(drawAt(900, LABELS, "dark", light, 0).recorder));
    assert.notEqual(JSON.stringify(dots(drawAt(900, LABELS, "dark", light, 0.3).recorder)), at0, name + ": moving");
    assert.equal(JSON.stringify(dots(drawAt(900, LABELS, "dark", light, 0.3, true).recorder)), at0, name + ": still");
    // Off: none.
    assert.equal(dots(drawAt(900, LABELS, "dark", Object.assign({}, light, { pump: 0 }), 0.3).recorder).length, 0, name + ": off");
  }
  // Absorbed at their own depths, spread through the front of the rod: over
  // a whole round, the sparks' mean depth is near d (an exponential's mean).
  const L = bench.layout(900, heightFor(900));
  const depths = [];
  for (let t = 0; t < 1 / 0.6; t += 0.01) {
    for (const s of dots(drawAt(900, LABELS, "dark", endPumped({ pump: 1 }), t).recorder).filter((d) => d.r === 3.2)) depths.push(s.x - L.rod.x);
  }
  const mean = depths.reduce((a, b) => a + b, 0) / depths.length;
  assert.ok(mean > 0.6 * L.pumpDepth && mean < 1.4 * L.pumpDepth, "mean depth " + mean + " against d = " + L.pumpDepth);
});

test("the pump laser's beam in its own colour: 532 nm green, readable on the theme", () => {
  for (const theme of ["dark", "light"]) {
    const { recorder, view } = drawAt(900, LABELS, theme, ofBench({ medium: "dye-r6g", pump: "laser", lam: 600e-9 }, { pumpLam: 532e-9 }));
    const L = bench.layout(900, view.h);
    const green = UI.materials.readable(UI.materials.beam(532e-9).color, view.colors.bg);
    const beam = strokedLines(recorder).find((l) => l.y1 === L.beamY && l.y2 === L.beamY && l.x2 === L.periscope.x);
    assert.equal(beam.strokeStyle, green, theme);
  }
});

test("the gas's atoms drift in the bore, as many lit as the current is strong; still for less motion", () => {
  const N = bench.GAS_ATOMS;
  for (const id of ["he-ne", "ar-ion", "co2"]) {
    for (const pump of [0, 0.3, 1]) {
      for (const t of [0, 0.8, 30]) {
        const { recorder, view } = drawAt(900, LABELS, "dark", ofBench({ medium: id, pump: "discharge", lam: 600e-9 }, { pump: pump }), t);
        const L = bench.layout(900, view.h);
        const atoms = dots(recorder).filter((d) => d.r === 1.8 || d.r === 2.6);
        assert.equal(atoms.length, N, id);
        for (const a of atoms) {
          assert.ok(a.x >= L.bore.x && a.x <= L.bore.x + L.bore.w && a.y >= L.bore.y && a.y <= L.bore.y + L.bore.h, id + ": in the bore");
        }
        const lit = atoms.filter((a) => a.r === 2.6);
        assert.equal(lit.length, Math.round(N * pump), id + " at " + pump);
        for (const a of lit) assert.equal(a.fill, UI.materials.HIGHLIGHT);
        // The gas itself cannot be seen: its unlit atoms in the theme's muted colour.
        for (const a of atoms.filter((x) => x.r === 1.8)) assert.equal(a.fill, view.colors.muted);
      }
    }
    const light = ofBench({ medium: id, pump: "discharge", lam: 600e-9 });
    // Drifting along the bore: their x changes (not only their wobble).
    const xs = (t, still) => dots(drawAt(900, LABELS, "dark", light, t, still).recorder).filter((d) => d.r === 1.8 || d.r === 2.6).map((d) => d.x);
    const moved = xs(0.5).map((x, k) => Math.abs(x - xs(0)[k]));
    assert.ok(Math.min(...moved) > 0.5, id + ": every atom drifts along the bore");
    assert.equal(JSON.stringify(xs(0.5, true)), JSON.stringify(xs(0)), id + ": still");
    const at0 = JSON.stringify(dots(drawAt(900, LABELS, "dark", light, 0).recorder));
    assert.equal(JSON.stringify(dots(drawAt(900, LABELS, "dark", light, 0.5, true).recorder)), at0, id + ": still");
  }
});

test("the note names every invisible light, the pump's first, then the laser's", () => {
  function note(light) {
    const c = drawAt(900, LABELS, "dark", light).recorder.calls.find((x) => x.name === "fillText" && /invisible$/.test(x.args[0]));
    return c ? c.args[0] : null;
  }
  assert.equal(note(endPumped()), "808" + NB + "nm, 1.06" + NB + "µm · infrared, invisible");
  assert.equal(note(endPumped({ pump: 0 })), "808" + NB + "nm, 1.06" + NB + "µm · infrared, invisible", "the diodes are there, lit or not");
  assert.equal(note(ofBench({ medium: "ti-sapphire", pump: "laser", lam: 800e-9 }, { pumpLam: 532e-9 })), "800" + NB + "nm · infrared, invisible", "a green pump can be seen");
  assert.equal(note(ofBench({ medium: "dye-r6g", pump: "laser", lam: 600e-9 }, { pumpLam: 532e-9 })), null, "all of it visible");
  // A flashlamp's light is white: its pumpLam (the band the rod absorbs) is not drawn.
  assert.equal(note(ofBench({ medium: "nd-yag", pump: "flashlamp", lam: 1064e-9 }, { pumpLam: 808e-9 })), "1.06" + NB + "µm · infrared, invisible");
  // An ultraviolet pump, and an infrared laser: each with its own word.
  assert.equal(note(endPumped({ pumpLam: 355e-9 })), "355" + NB + "nm · ultraviolet, invisible; 1.06" + NB + "µm · infrared, invisible");
});

test("every pump photon and gas atom sits on a ring of the background's colour, drawn over the laser's rays", () => {
  for (const light of [endPumped({ pump: 1 }), ofBench({ medium: "ar-ion", pump: "discharge", lam: 514.5e-9 }, { pump: 0.6 })]) {
    for (const theme of ["dark", "light"]) {
      const { recorder, view } = drawAt(900, LABELS, theme, light, 0.4);
      const all = dots(recorder);
      const small = all.filter((d) => [1.8, 2.2, 2.6, 3.2].includes(d.r));
      assert.ok(small.length > 0);
      for (const d of small) {
        const ring = all.find((c) => c.x === d.x && c.y === d.y && Math.abs(c.r - (d.r + 1.2)) < 1e-9);
        assert.ok(ring, theme + ": a ring under the dot");
        // A white spark on cream gets a dark ring (white on cream is 1.2:1).
        if (d.fill === UI.materials.HIGHLIGHT) {
          const wanted = UI.materials.contrast(d.fill, view.colors.bg) >= 3 ? view.colors.bg : view.colors.heading;
          assert.equal(ring.fill, wanted, theme + ": the spark's ring");
          assert.ok(UI.materials.contrast(d.fill, ring.fill) >= 3, theme + ": the spark stands out on its ring");
        } else {
          assert.equal(ring.fill, view.colors.bg, theme);
        }
      }
      // After every ray: the last stroke in the beam's colour comes before the first dot.
      const colour = UI.materials.readable(UI.materials.beam(light.lam).color, view.colors.bg);
      const lastRay = recorder.log.map((e) => e.set === "strokeStyle" && e.value === colour).lastIndexOf(true);
      const firstDot = recorder.log.findIndex((e) => e.call === "arc" && [1.8, 2.2, 2.6, 3.2].map((r) => r + 1.2).includes(e.args[2]));
      assert.ok(lastRay < firstDot, theme + ": over the rays");
    }
  }
});

/* ---------- stage 10c2: the filter on the end-pumped diodes ---------- */

test("layout: on the end-pumped diodes the filter stands beyond the rod, the mirror image of its usual place; its name under the bench", () => {
  for (const w of WIDTHS) {
    const h = heightFor(w);
    const L = bench.layout(w, h);
    const where = "w = " + w;
    const F = L.filterBeyond;
    assert.ok(inside(F, w, h), where);
    assertClose(F.x + F.w, w - L.filter.x, 1e-9, where + ": the mirror image");
    assert.deepEqual([F.y, F.w, F.h], [L.filter.y, L.filter.w, L.filter.h]);
    assert.ok(F.x - (L.rod.x + L.rod.w) >= 14 && F.x + F.w < L.outputMirror.x - 2, where + ": between the rod and the output mirror");
    const fs = L.fontSize;
    const name = labelBox(L.labels.qSwitchBelow, fs);
    const pump = labelBox(L.labels.pump, fs);
    assert.ok(name.left >= pump.right + fs - 1e-9 && name.right <= w, where + ": beside the pump's name");
    assert.ok(L.labels.qSwitchBelow.maxWidth >= 60, where + ": room, got " + L.labels.qSwitchBelow.maxWidth);
  }
});

test("draw: the end-pumped diodes' filter beyond the rod, out of the pump's way; the transmission keeps its row", () => {
  const w = 900;
  const L = bench.layout(w, heightFor(w));
  const light = endPumped({ pump: 1, qSwitch: { kind: "absorber", open: 0 } });
  for (const t of [0, 0.4, 1.1]) {
    const { recorder } = drawAt(w, LABELS, "dark", light, t);
    const plates = rects(recorder, "strokeRect");
    assert.ok(plates.includes(rectKey(L.filterBeyond)) && !plates.includes(rectKey(L.filter)), "the plate beyond the rod");
    const standing = posts(recorder, L);
    assert.ok(standing.includes(L.filterBeyond.x + L.filterBeyond.w / 2) && !standing.includes(L.filter.x + L.filter.w / 2), "its post");
    // No pump photon reaches it.
    for (const d of dots(recorder).filter((x) => x.r === 2.2 || x.r === 3.2)) assert.ok(d.x + d.r < L.filterBeyond.x, "a photon short of the filter");
    // Its name under the bench; the transmission on its whole row.
    const texts = recorder.calls.filter((c) => c.name === "fillText");
    const name = texts.find((c) => c.args[0] === LABELS.qSwitch);
    assert.deepEqual(name.args.slice(1), [L.labels.qSwitchBelow.x, L.labels.qSwitchBelow.y, L.labels.qSwitchBelow.maxWidth]);
    const T = texts.find((c) => /^Transmission/.test(c.args[0]));
    assert.equal(T.args[3], L.labels.transmission.maxWidth);
  }
  // An end-pumped pump laser has it beyond the rod too; a flashlamp bench
  // keeps it before the rod.
  assert.ok(rects(drawAt(w, LABELS, "dark", filtered(0, "laser")).recorder, "strokeRect").includes(rectKey(L.filterBeyond)), "laser");
  assert.ok(rects(drawAt(w, LABELS, "dark", filtered(0, "flashlamp")).recorder, "strokeRect").includes(rectKey(L.filter)), "flashlamp");
  // Parallel rays: the right arrowheads between the rod and the filter.
  const { recorder } = drawAt(w, LABELS, "dark", { beam: 1, pump: 0.5, transmission: 0.05, pumpKind: "diode", qSwitch: { kind: "absorber", open: 1 } });
  const rightGap = (L.rod.x + L.rod.w + L.filterBeyond.x) / 2;
  assert.ok(recorder.log.some((e) => e.call === "moveTo" && Math.abs(e.args[0] - (rightGap + 4)) < 1e-9 && e.args[1] === L.rays[0]),
    "an arrowhead in the gap before the filter");
  assert.ok(rightGap + 4 + 1 < L.filterBeyond.x, "clear of the filter");
});

test("draw: a dark filter holds the light back: beyond it the light is dimmed as much as the plate is shaded; drawn over the rays", () => {
  const w = 900;
  const L = bench.layout(w, heightFor(w));
  function dimming(light) {
    const { recorder, view } = drawAt(w, LABELS, "dark", light);
    return { list: filledWithAlpha(recorder).filter((f) => f.alpha > 0), recorder: recorder, view: view };
  }
  for (const [light, F, from, to] of [
    [filtered(0), L.filter, L.backMirror.x + L.backMirror.w, L.filter.x],
    [filtered(0.3, "diode"), L.filterBeyond, L.filterBeyond.x + L.filterBeyond.w, L.outputMirror.x]
  ]) {
    const open = light.qSwitch.open;
    const { recorder, view } = dimming(light);
    const key = [from, F.y, to - from, F.h].join(",");
    let alpha = 1;
    let fill = null;
    let found = null;
    let at = -1;
    recorder.log.forEach((e, i) => {
      if (e.set === "globalAlpha") alpha = e.value;
      if (e.set === "fillStyle") fill = e.value;
      if (e.call === "fillRect" && e.args.join(",") === key) { found = { alpha: alpha, fill: fill }; at = i; }
    });
    assert.ok(found, light.pumpKind + ": the light beyond is dimmed");
    assert.equal(found.fill, view.colors.bg);
    assertClose(found.alpha, 0.6 * (1 - open), 1e-12, "as the plate is shaded");
    // The plate comes after the rays, over them.
    const plate = recorder.log.findIndex((e) => e.call === "strokeRect" && e.args.join(",") === rectKey(F));
    const lastRay = recorder.log.map((e) => e.set === "strokeStyle" && e.value === view.colors.accent2).lastIndexOf(true);
    assert.ok(lastRay < at && at < plate, light.pumpKind + ": rays, then the dimming, then the plate");
  }
  // Bleached: nothing dimmed.
  const { recorder } = drawAt(w, LABELS, "dark", filtered(1));
  const key = [L.backMirror.x + L.backMirror.w, L.filter.y, L.filter.x - L.backMirror.x - L.backMirror.w, L.filter.h].join(",");
  assert.ok(!recorder.calls.some((c) => c.name === "fillRect" && c.args.join(",") === key), "a bleached filter holds nothing back");
});

test("the invisible pump and the invisible laser are told apart: their colours differ on both themes", () => {
  for (const theme of ["dark", "light"]) {
    const bg = palette(theme).bg;
    const a = UI.materials.readable(UI.materials.INFRARED, bg);
    const b = UI.materials.readable(UI.materials.PUMP_INFRARED, bg);
    const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const d = Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));
    assert.ok(d >= 60, theme + ": " + a + " against " + b + ", " + d);
  }
});

test("pump photons spread evenly over a round at any pump: a steady pump looks steady", () => {
  // At a quarter pump, 3 photons: a third of a round apart, not bunched.
  const L = bench.layout(900, heightFor(900));
  let travelling = 0;
  let samples = 0;
  for (let t = 0; t < 1 / 0.6; t += 0.02) {
    const moving = dots(drawAt(900, LABELS, "dark", endPumped({ pump: 0.25 }), t).recorder).filter((d) => d.r === 2.2);
    travelling = Math.max(travelling, moving.length);
    samples += moving.length === 0 ? 1 : 0;
  }
  assert.equal(samples, 0, "never a moment without a photon on its way");
  assert.ok(L);
});

test("sparks and lit atoms are white over a coloured medium on both themes (on cream, the heading's colour is dark)", () => {
  for (const light of [endPumped({ pump: 1 }), ofBench({ medium: "he-ne", pump: "discharge", lam: 632.8e-9 }, { pump: 1 })]) {
    const all = [];
    for (let t = 0; t < 1 / 0.6; t += 0.05) {
      for (const d of dots(drawAt(900, LABELS, "light", light, t).recorder)) all.push(d);
    }
    const sparks = all.filter((d) => d.r === 3.2 || d.r === 2.6);
    assert.ok(sparks.length > 0, light.medium);
    for (const d of sparks) assert.equal(d.fill, UI.materials.HIGHLIGHT, light.medium);
  }
});

test("a mirror's mount has a hole for the light: its plate never crosses the rays, the beam or the pump's cone, at any width", () => {
  for (let w = 280; w <= 1400; w += 20) {
    const L = bench.layout(w, heightFor(w));
    const hole = bench.mountHole(L);
    for (const m of [L.backMirror, L.outputMirror]) {
      assert.ok(hole.top > m.y && hole.bottom < m.y + m.h, "w " + w + ": the hole inside the mirror");
    }
    for (const y of L.rays) assert.ok(y > hole.top && y < hole.bottom, "w " + w + ": a ray at " + y);
    for (const half of [L.apertureHalf, L.boreHalf, L.cone.start]) {
      assert.ok(L.axis.y - half > hole.top && L.axis.y + half < hole.bottom, "w " + w + ": the light's half-height " + half);
    }
  }
  // The drawn plates (colors.muted, MOUNT_PLATE wide, at each mirror's
  // outer edge) stop at the hole.
  for (const kind of ["diode", "flashlamp", "discharge"]) {
    const { recorder, view } = drawAt(800, LABELS, "dark", lit(kind, 1));
    const L = bench.layout(800, view.h);
    const hole = bench.mountHole(L);
    const plates = recorder.calls.filter((c) => c.name === "fillRect" && c.args[2] === 3 &&
      (c.args[0] === L.backMirror.x - 3 || c.args[0] === L.outputMirror.x + L.outputMirror.w));
    assert.equal(plates.length, 4, kind + ": two pieces for each mirror");
    for (const p of plates) {
      const top = p.args[1];
      const bottom = p.args[1] + p.args[3];
      assert.ok(bottom <= hole.top + 1e-9 || top >= hole.bottom - 1e-9, kind + ": a plate across the hole, " + top + " to " + bottom);
    }
  }
});

test("a lit flash shows on the lab's near-white: its streaks and its burning gas are readable, the raw silver-white only a glow", () => {
  const M = UI.materials;
  for (const theme of ["dark", "light"]) {
    const colors = palette(theme);
    const shown = M.readable(colors.flash, colors.bg);
    assert.ok(M.contrast(shown, colors.bg) >= 3, theme + ": it shows");
    const { lit: light, streaks } = flashLight(900, lit("flashlamp", 1), 0, theme);
    assert.ok(streaks.length > 0);
    for (const p of light.filter((q) => q.call === "stroke")) assert.equal(p.color, shown, theme + ": a streak");
    // The raw colour paints only fills at partial alpha (the tint, the halo, the beams).
    for (const p of light.filter((q) => q.color === colors.flash)) {
      assert.notEqual(p.call, "stroke", theme + ": no raw line");
      assert.ok(p.alpha < 0.6, theme + ": a raw fill is a faint glow, alpha " + p.alpha);
    }
  }
});
