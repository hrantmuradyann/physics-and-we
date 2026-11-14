/* ============================================================================
   page.test.js — js/laser/page.js, which builds the laser page, and the
   router behaviour it depends on.

   The router (js/router.js) fires "section:ready" for the laser page more
   often than it is opened: once when it quietly builds every page in the
   background (the page is hidden then), and again on every language
   switch. page.js must take the previous build down each time, do nothing
   heavy while hidden, and ignore every other page (docs/laser-plan.md,
   "Site trap"). Since stage 6 it also wires the controls: sliders, Play,
   Reset, the readouts, and the simulation that runs in the loop. Runs the
   real files, with the real data/laser.json, in the fake browser of
   fake-browser.js.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { ROOT, ENGINE_FILES, UI_FILES, assertClose } = require("./helpers.js");
const { createBrowser, fakeCanvas, fakeContainer, fakeElement } = require("./fake-browser.js");

const WORDS = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "laser.json"), "utf8"));
const PARTS = ["backMirror", "outputMirror", "medium", "pump"];
const CONTROLS = ["pump", "coupler", "slowMotion"];
const READOUTS = ["pumpThreshold", "x", "gth", "tau_c", "P_out", "powerNow", "T_best", "period", "time"];
const UI_WORDS = { labPlay: "Play", labPause: "Pause", labReset: "Reset" };
const NB = " ";
const FRAME = 1000 / 60;      // ms

// A fake browser with the site's content.js, the laser engine, UI and
// page.js loaded, in the given language.
function setup(lang, options) {
  const browser = createBrowser(options);
  browser.load("js/content.js");
  for (const file of ENGINE_FILES) browser.load("js/laser/engine/" + file);
  for (const file of UI_FILES) browser.load("js/laser/ui/" + file);
  browser.window.Site = {
    lang: lang || "en",
    word: function (key) { return UI_WORDS[key] || ""; }
  };
  const before = browser.addedGlobals();
  browser.load("js/laser/page.js");
  return { browser: browser, globalsBeforePage: before };
}

// A laser section as the router builds it, with everything the layout
// has. The boxes have width 0 by default: the router builds pages while
// they are hidden.
function laserSection(boxWidth) {
  const width = boxWidth === undefined ? 0 : boxWidth;
  const by = {};
  const section = { canvases: {}, recorders: {}, boxes: {}, controls: {}, values: {}, readouts: {} };
  for (const name of ["bench", "levels", "plots"]) {
    const parts = fakeCanvas(width);
    by['[data-laser-canvas="' + name + '"]'] = parts.canvas;
    section.canvases[name] = parts.canvas;
    section.recorders[name] = parts.recorder;
    section.boxes[name] = parts.box;
  }
  for (const name of CONTROLS) {
    section.controls[name] = fakeElement("input");
    section.values[name] = fakeElement("output");
    by['[data-laser-control="' + name + '"]'] = section.controls[name];
    by['[data-laser-value="' + name + '"]'] = section.values[name];
  }
  for (const name of READOUTS) {
    section.readouts[name] = fakeElement("span");
    by['[data-laser-readout="' + name + '"]'] = section.readouts[name];
  }
  section.play = fakeElement("button");
  section.reset = fakeElement("button");
  section.note = fakeElement("p");
  section.note.hidden = true;
  by['[data-laser-action="play"]'] = section.play;
  by['[data-laser-action="reset"]'] = section.reset;
  by['[data-laser-note="behind"]'] = section.note;
  section.container = fakeContainer(by);
  section.canvas = section.canvases.bench;      // the stage-5 name
  section.recorder = section.recorders.bench;
  return section;
}

// The stage-5 layout: only the bench canvas. A page whose controls failed
// to come must still build what it can.
function benchOnlySection(boxWidth) {
  const parts = fakeCanvas(boxWidth === undefined ? 0 : boxWidth);
  const by = {};
  by['[data-laser-canvas="bench"]'] = parts.canvas;
  return Object.assign({ container: fakeContainer(by) }, parts);
}

function sectionReady(browser, route, container, data) {
  browser.window.dispatchEvent(new browser.window.CustomEvent("section:ready", {
    detail: { route: route, id: null, container: container, data: data }
  }));
}

function texts(recorder) {
  return recorder.calls.filter((c) => c.name === "fillText").map((c) => c.args[0]);
}

// A theme switch makes every live loop draw its pictures again, so it
// shows which builds are still alive.
function switchTheme(browser) {
  browser.window.dispatchEvent(new browser.window.CustomEvent("theme:changed", { detail: { theme: "light" } }));
}

// Builds a laser page on screen. With `watch: true` in the options, page.seen
// records what page.js hands on: the steps of every advance() call
// (seen.steps) and every picture given to the levels and plots drawings
// (seen.levels, seen.plots). `prepare(browser)` runs just before the build.
function built(lang, options) {
  const { browser } = setup(lang, options);
  const seen = options && options.watch ? watch(browser) : null;
  if (options && options.prepare) options.prepare(browser);
  const section = laserSection(600);
  sectionReady(browser, "laser", section.container, WORDS);
  for (const name of ["bench", "levels", "plots"]) browser.setOnScreen(section.canvases[name], true);
  return { browser: browser, section: section, clock: 0, seen: seen };
}

// Puts recorders around LaserEngine.bench.advance and the two panels'
// draw(), before page.js builds (it takes LaserEngine.bench at build time).
// The engine's and UI's own objects are frozen, so the globals get copies.
function watch(browser) {
  const seen = { steps: [], levels: [], plots: [] };
  const engineNow = browser.window.LaserEngine;
  const advance = engineNow.bench.advance;
  browser.window.LaserEngine = Object.assign({}, engineNow, {
    bench: Object.assign({}, engineNow.bench, {
      advance: function (params) {
        const run = advance(params);
        seen.steps.push(run.steps);
        return run;
      }
    })
  });
  const UI = browser.window.LaserUI;
  for (const name of ["levels", "plots"]) {
    const draw = UI[name].draw;
    UI[name] = Object.assign({}, UI[name], {
      draw: function (view, picture) {
        seen[name].push(picture);
        return draw(view, picture);
      }
    });
  }
  return seen;
}

function sum(numbers) {
  let total = 0;
  for (const n of numbers) total += n;
  return total;
}

function runFrames(page, count) {
  for (let i = 0; i < count; i++) {
    page.clock += FRAME;
    page.browser.runFrame(page.clock);
  }
}

function slide(section, name, position) {
  section.controls[name].value = String(position);
  section.controls[name].fire("input");
}

function engine(browser) {
  return browser.window.LaserEngine;
}

// The alpha of the beam between the mirrors in the bench's latest picture
// (0 when no beam was drawn). The bench box is 600 px wide (built()).
function beamAlpha(page) {
  const bench = page.browser.window.LaserUI.bench;
  const h = Math.max(bench.SIZE.minHeight, Math.min(600 / bench.SIZE.aspect, bench.SIZE.maxHeight));
  const L = bench.layout(600, h);
  const log = page.section.recorders.bench.log;
  let start = 0;                                      // each picture starts with clearRect
  for (let i = 0; i < log.length; i++) {
    if (log[i].call === "clearRect") start = i;
  }
  let alpha = 1;
  for (let i = start; i < log.length; i++) {
    if (log[i].set === "globalAlpha") alpha = log[i].value;
    if (log[i].call === "fillRect" && Math.abs(log[i].args[0] - (L.backMirror.x + L.backMirror.w)) < 1e-9) return alpha;
  }
  return 0;
}

/* ---------- building ---------- */

test("page.js adds no global, and listens to section:ready once", () => {
  const { browser, globalsBeforePage } = setup();
  assert.deepEqual(browser.addedGlobals(), globalsBeforePage);
  assert.equal(browser.listenerCount("section:ready"), 1);
});

test("the words page.js needs are in data/laser.json, in both languages", () => {
  for (const lang of ["hy", "en"]) {
    for (const key of ["bench.alt", "levels.alt", "plots.alt"]) {
      const [group, name] = key.split(".");
      assert.ok(WORDS[group][name][lang].trim(), key + "." + lang);
    }
    for (const part of PARTS) assert.ok(WORDS.bench.parts[part][lang].trim(), part + "." + lang);
    for (const name of ["pumpBand", "upper", "lower", "ground", "gain", "loss"]) {
      assert.ok(WORDS.levels.words[name][lang].trim(), "levels.words." + name + "." + lang);
    }
    for (const name of ["power", "inversion", "threshold", "time"]) {
      assert.ok(WORDS.plots.words[name][lang].trim(), "plots.words." + name + "." + lang);
    }
  }
});

test("built while hidden: one loop, no frame asked for, nothing drawn, the canvases described", () => {
  const { browser } = setup("en");
  const section = laserSection();
  sectionReady(browser, "laser", section.container, WORDS);
  assert.equal(browser.window.LaserUI.loop.liveCount(), 1);
  assert.equal(browser.pendingFrames(), 0);
  for (const name of ["bench", "levels", "plots"]) {
    assert.equal(section.canvases[name].getAttribute("data-running"), "false");
    assert.equal(section.canvases[name].getAttribute("aria-label"), WORDS[name].alt.en, name);
    assert.deepEqual(section.recorders[name].calls, [], "nothing drawn into a hidden canvas: " + name);
  }
});

test("on screen: the bench is drawn with the page's words, and the simulation runs", () => {
  for (const lang of ["hy", "en"]) {
    const page = built(lang);
    const { browser, section } = page;
    assert.equal(section.canvas.getAttribute("aria-label"), WORDS.bench.alt[lang]);
    assert.equal(browser.pendingFrames(), 1, lang);
    for (const name of ["bench", "levels", "plots"]) {
      assert.equal(section.canvases[name].getAttribute("data-running"), "true", name);
    }
    assert.deepEqual(texts(section.recorder).sort(),
      // Array.from: PARTS is an array of the sandbox, which deepEqual
      // would call different from a Node array (helpers.js, plain()).
      Array.from(browser.window.LaserUI.bench.PARTS, (part) => WORDS.bench.parts[part][lang]).sort(), lang);
    const SIZE = browser.window.LaserUI.bench.SIZE;
    const expected = Math.max(SIZE.minHeight, Math.min(600 / SIZE.aspect, SIZE.maxHeight));
    assert.equal(section.canvas.style.height, expected + "px");
    assert.ok(texts(section.recorders.levels).includes(WORDS.levels.words.upper[lang]));
    assert.ok(texts(section.recorders.plots).includes(WORDS.plots.words.power[lang]));
  }
});

test("a visitor who asked for less motion: it starts paused, and the button says Play", () => {
  const page = built("en", { reducedMotion: true });
  assert.equal(page.browser.pendingFrames(), 0);
  assert.equal(page.section.play.textContent, "Play");
  page.section.play.fire("click");
  assert.equal(page.browser.pendingFrames(), 1);
  assert.equal(page.section.play.textContent, "Pause");
});

/* ---------- controls and readouts ---------- */

test("the controls start at the default bench and show their values", () => {
  const { browser, section } = built("en");
  const F = browser.window.LaserUI.format;
  const R = engine(browser).bench.RANGES;
  for (const name of CONTROLS) {
    const input = section.controls[name];
    assert.equal(input.min, "0");
    assert.equal(input.max, "1000");
    assert.equal(input.step, "1");
  }
  assert.equal(section.controls.pump.value, String(Math.round(1000 * F.toSlider(R.pumpPower, 5))));
  assert.equal(section.controls.coupler.value, String(Math.round(1000 * F.toSlider(R.T_oc, 0.05))));
  assert.equal(section.controls.slowMotion.value, "333");
  assert.equal(section.values.pump.textContent, "5.00" + NB + "W");
  assert.equal(section.values.coupler.textContent, "5.00" + NB + "%");
  assert.equal(section.values.slowMotion.textContent, "1" + NB + "s = 100" + NB + "µs");
  for (const name of CONTROLS) {
    assert.equal(section.controls[name].getAttribute("aria-valuetext"), section.values[name].textContent, name);
  }
  assert.equal(section.play.textContent, "Pause");
});

test("the readouts show derive()'s numbers for the bench, formatted", () => {
  const { browser, section } = built("en");
  const F = browser.window.LaserUI.format;
  const d = engine(browser).bench.derive(engine(browser).bench.defaultConfig());
  const r = section.readouts;
  assert.equal(r.pumpThreshold.textContent, F.si(d.pumpThreshold, "W"));
  assert.equal(r.x.textContent, F.number(d.x));
  // The threshold gain is cavity.js's g_th (stage 2), in m⁻¹.
  assert.equal(r.gth.textContent, F.number(d.gth) + NB + "m⁻¹");
  assert.equal(r.gth.textContent, "0.713" + NB + "m⁻¹");
  assert.equal(r.tau_c.textContent, F.si(d.tau_c, "s"));
  assert.equal(r.P_out.textContent, F.si(d.P_out, "W"));
  assert.equal(r.T_best.textContent, F.number(100 * d.T_best) + NB + "%");
  assert.equal(r.period.textContent, F.si(d.period, "s"));
  assert.equal(r.time.textContent, "0" + NB + "s");
});

test("moving a slider while paused also rewrites the output now (it depends on the mirror)", () => {
  const { browser, section } = built("en", { reducedMotion: true });
  const B = engine(browser).bench;
  const F = browser.window.LaserUI.format;
  // One photon at the start: the output now is the power of one photon,
  // which the output mirror sets.
  slide(section, "coupler", 1000);
  const d = B.derive(Object.assign(B.defaultConfig(), { refl2: 0.7 }));
  assert.equal(section.readouts.powerNow.textContent, F.si(d.powerPerPhoton, "W"));
});

test("moving a slider changes the bench at once, even paused: below threshold there is no output", () => {
  const { browser, section } = built("en", { reducedMotion: true });
  slide(section, "pump", 50);                      // 1 W, below the 1.5 W threshold
  const F = browser.window.LaserUI.format;
  assert.equal(section.values.pump.textContent, "1.00" + NB + "W");
  assert.equal(section.readouts.P_out.textContent, "0" + NB + "W");
  assert.equal(section.readouts.period.textContent, "—");
  assert.equal(section.readouts.x.textContent, F.number(1 / 1.5120135480795136));
  // The coupler: 30 % at the top of its slider.
  slide(section, "coupler", 1000);
  assert.equal(section.values.coupler.textContent, "30.0" + NB + "%");
  const d = engine(browser).bench.derive(Object.assign(engine(browser).bench.defaultConfig(), { pumpPower: 1, refl2: 0.7 }));
  assert.equal(section.readouts.pumpThreshold.textContent, F.si(d.pumpThreshold, "W"));
  // With no pump the gain cannot beat even the internal loss: no output
  // mirror is best, and the readout says so with a dash, not "0 %".
  slide(section, "pump", 0);
  assert.equal(section.readouts.T_best.textContent, "—");
  // Paused, the pictures were drawn again with the new numbers.
  assert.equal(browser.pendingFrames(), 0);
  assert.ok(section.recorders.levels.calls.length > 0);
});

test("frames move the simulation by dt / slow motion; the first frame (dt = 0) only draws", () => {
  const page = built("en");
  const { browser, section } = page;
  page.clock = 1000;
  browser.runFrame(page.clock);                       // dt = 0
  assert.equal(section.readouts.time.textContent, "0" + NB + "s");
  // 32 frames: the readouts were last written by the throttle at frame 30
  // (or 28), so only Pause can show the time of frame 32.
  runFrames(page, 32);                                // 0.53 s at 1 s = 100 µs
  section.play.fire("click");                         // pausing writes the readouts at once
  const F = browser.window.LaserUI.format;
  assert.equal(section.readouts.time.textContent, F.si(32 * FRAME / 1000 / 1e4, "s"));
  // Slower: 1 s = 1 µs.
  slide(section, "slowMotion", 1000);
  assert.equal(section.values.slowMotion.textContent, "1" + NB + "s = 1.00" + NB + "µs");
});

test("the readouts are written at most 10 times a second, the derived ones at once on a change", () => {
  const page = built("en");
  const { section } = page;
  page.clock = 1000;
  page.browser.runFrame(page.clock);
  runFrames(page, 3);                                 // 50 ms: not yet
  assert.equal(section.readouts.time.textContent, "0" + NB + "s");
  runFrames(page, 4);                                 // 117 ms: written
  assert.notEqual(section.readouts.time.textContent, "0" + NB + "s");
});

test("the laser lases: after enough frames the live output matches the steady output, and the pictures show it", () => {
  const page = built("en", { watch: true });
  const { browser, section, seen } = page;
  page.clock = 1000;
  browser.runFrame(page.clock);
  // One photon at the start: no beam to be seen yet.
  assert.ok(beamAlpha(page) < 0.01, "no beam at the start: " + beamAlpha(page));
  // 10 frames at 1 s = 100 µs: the inversion builds up, the light has not
  // come yet (the first spike is about 170 µs in), so no stimulated emission.
  runFrames(page, 10);
  const early = seen.levels[seen.levels.length - 1];
  assert.ok(early.y > 0.1, "the inversion is building up: " + early.y);
  assert.ok(early.stim < 1e-6, "no stimulated emission before the light: " + early.stim);

  slide(section, "slowMotion", 0);                    // 1 s = 1 ms
  runFrames(page, 300);                               // 5 s on screen = 5 ms simulated
  const d = engine(browser).bench.derive(engine(browser).bench.defaultConfig());
  const shown = section.readouts.powerNow.textContent;
  assert.equal(shown, browser.window.LaserUI.format.si(d.P_out, "W"), shown);
  assert.equal(section.note.hidden, true, "it kept up");
  // The beam follows the output: P_out = 2.3 × powerPerP, full strength.
  assert.equal(beamAlpha(page), 1);
  // The levels: the gain clamped at the loss (y = 1), the laser transition
  // as strong as the pump above threshold (y·p = x − 1, §4.1).
  const late = seen.levels[seen.levels.length - 1];
  assert.equal(late.x, d.x);
  assertClose(late.y, 1, 0.01, "y");
  assertClose(late.stim, d.x - 1, 0.01, "stimulated emission");
});

test("Play / Pause and Reset", () => {
  const page = built("en", { watch: true });
  const { browser, section } = page;
  page.clock = 1000;
  browser.runFrame(page.clock);
  runFrames(page, 12);
  section.play.fire("click");
  assert.equal(section.play.textContent, "Play");
  assert.equal(browser.pendingFrames(), 0);
  assert.equal(section.canvases.plots.getAttribute("data-running"), "false");
  section.play.fire("click");
  assert.equal(section.play.textContent, "Pause");
  assert.equal(browser.pendingFrames(), 1);
  section.reset.fire("click");
  assert.equal(section.readouts.time.textContent, "0" + NB + "s");
  // The plot starts again (drawn on the next frames: a running loop draws
  // only then, and the first frame after Play has dt = 0): the new start
  // first, nothing from the old run.
  runFrames(page, 2);
  const plot = page.seen.plots[page.seen.plots.length - 1];
  assert.ok(plot.tNow > 0 && plot.tNow < 1e-5, "one frame since Reset: " + plot.tNow);
  assert.equal(plot.points[0].t, 0);
  for (const point of plot.points) assert.ok(point.t <= plot.tNow, "a point from the old run: " + point.t);
  assert.equal(section.readouts.powerNow.textContent, browser.window.LaserUI.format.si(
    engine(browser).bench.derive(engine(browser).bench.defaultConfig()).powerPerPhoton, "W"), "one photon again");
});

test("a frame never runs more than its step budget: the simulation falls behind and says so", () => {
  const page = built("en", { watch: true });
  const { browser, section } = page;
  slide(section, "slowMotion", 0);                    // 1 s = 1 ms
  page.clock = 1000;
  browser.runFrame(page.clock);
  runFrames(page, 20);                                // 333 µs: lasing
  assert.equal(section.note.hidden, true, "it keeps up while lasing");
  // The dearest corner (scope card): an inversion left over, pump off,
  // 30 % coupler, the slowest slow motion. With no inversion at all there
  // is no seed and nothing is stiff, so the run above comes first.
  slide(section, "pump", 0);
  slide(section, "coupler", 1000);
  page.seen.steps.length = 0;
  page.clock += 50;                                   // one long frame: dt 0.05 s = 50 µs
  browser.runFrame(page.clock);
  // Several pieces ran (each about 320 steps here), and together they kept
  // to the frame's 1500 steps.
  assert.ok(page.seen.steps.length > 2, "pieces run: " + page.seen.steps.length);
  assert.ok(sum(page.seen.steps) <= 1500, "steps in the frame: " + sum(page.seen.steps));
  // The note is judged over a second of frames: not yet after one frame,
  // shown after a second of frames that all fell behind.
  assert.equal(section.note.hidden, true, "one frame is not enough for the note");
  for (let i = 0; i < 21; i++) {
    page.clock += 50;
    browser.runFrame(page.clock);
  }
  assert.equal(section.note.hidden, false, "the note is shown");
  section.play.fire("click");
  const F = browser.window.LaserUI.format;
  const asked = 20 * FRAME / 1000 / 1e3 + 22 * 50e-6;
  assert.notEqual(section.readouts.time.textContent, F.si(asked, "s"), "less than asked for");
  assert.equal(section.note.hidden, true, "paused, nothing is behind");
  // Again, and then a slider moved: the new setting is judged afresh.
  section.play.fire("click");
  for (let i = 0; i < 22; i++) {
    page.clock += 50;
    browser.runFrame(page.clock);
  }
  assert.equal(section.note.hidden, false, "shown again");
  slide(section, "coupler", 999);
  assert.equal(section.note.hidden, true, "a slider moved");
});

test("a dropped frame now and then does not make the note blink", () => {
  const page = built("en");
  const { browser, section } = page;
  slide(section, "slowMotion", 0);
  page.clock = 1000;
  browser.runFrame(page.clock);
  runFrames(page, 20);                                // lasing, as above
  slide(section, "pump", 0);
  slide(section, "coupler", 1000);
  // At 60 Hz this corner needs about 860 of the 1500 steps a frame; one
  // frame in 8 is dropped (dt 50 ms) and falls behind. 1.17 s of frames.
  for (let cycle = 0; cycle < 7; cycle++) {
    page.clock += 50;
    browser.runFrame(page.clock);
    assert.equal(section.note.hidden, true, "after a dropped frame, cycle " + cycle);
    for (let i = 0; i < 7; i++) {
      page.clock += FRAME;
      browser.runFrame(page.clock);
      assert.equal(section.note.hidden, true, "cycle " + cycle + ", frame " + i);
    }
  }
});

// Runs a page at `rate` frames a second for a bit more than the plot's 5 s
// and returns where the power curve starts and the width of one plot point.
function plotStartAt(rate) {
  const page = built("en");
  const { browser, section } = page;
  // The plot off screen until the last frame: the fake context records
  // every call, and thousands of frames of a long plot take seconds. The
  // bench stays on screen (the loop runs only while a canvas is), with its
  // record cleared now and then.
  browser.setOnScreen(section.canvases.plots, false);
  browser.setOnScreen(section.canvases.levels, false);
  page.clock = 1000;
  browser.runFrame(page.clock);
  for (let i = 0; i < 5.2 * rate; i++) {
    page.clock += 1000 / rate;
    browser.runFrame(page.clock);
    if (i % 200 === 0) {
      section.recorders.bench.calls.length = 0;
      section.recorders.bench.log.length = 0;
    }
  }
  const recorder = section.recorders.plots;
  browser.setOnScreen(section.canvases.plots, true);
  recorder.calls.length = 0;
  page.clock += 1000 / rate;
  browser.runFrame(page.clock);
  const box = browser.window.LaserUI.plots.layout(600, Number.parseFloat(section.canvases.plots.style.height)).power;
  const start = recorder.calls.find((c) => c.name === "moveTo" && c.args[1] >= box.top && c.args[1] <= box.bottom);
  assert.ok(start, "the power curve is drawn at " + rate + " Hz");
  // About 480 points a second of screen time, at least one a frame.
  const perFrame = Math.max(1, Math.round(480 / rate));
  return { start: start.args[0], left: box.left, onePoint: (box.right - box.left) / (5 * rate * perFrame) };
}

test("the plot keeps 5 s of screen time on 240 Hz and 1000 Hz screens (cut short on a 120 Hz Mac once)", () => {
  for (const rate of [240, 1000]) {
    const plot = plotStartAt(rate);
    assert.ok(plot.start <= plot.left + 2 * plot.onePoint + 1e-9,
      rate + " Hz: the curve starts at the left edge, not at " + plot.start);
  }
});

test("pump off from the start at the strongest coupler: the output falls below 1 fW and the page keeps running", () => {
  // About 10⁻¹⁷⁰ W here: formatting it once threw and stopped the page
  // (stage-6 review).
  const page = built("en");
  const { browser, section } = page;
  slide(section, "pump", 0);
  slide(section, "coupler", 1000);
  slide(section, "slowMotion", 0);
  page.clock = 1000;
  browser.runFrame(page.clock);
  runFrames(page, 12);                                // 0.2 s: the readouts written
  assert.equal(browser.pendingFrames(), 1, "still running");
  section.play.fire("click");
  assert.equal(section.readouts.powerNow.textContent, "<" + NB + "1" + NB + "fW");
});

/* ---------- errors ---------- */

test("an error in a drawing pauses the page: the button says Play, and Play tries again", () => {
  const page = built("en");
  const { browser, section } = page;
  const UI = browser.window.LaserUI;
  const levels = UI.levels;
  UI.levels = Object.assign({}, levels, { draw: function () { throw new Error("bad drawing"); } });
  page.clock = 1000;
  assert.throws(() => browser.runFrame(page.clock), /bad drawing/);
  assert.equal(browser.pendingFrames(), 0, "paused");
  assert.equal(section.play.textContent, "Play");
  UI.levels = levels;
  section.play.fire("click");
  assert.equal(section.play.textContent, "Pause");
  assert.equal(browser.pendingFrames(), 1, "running again");
});

test("an error in the simulation pauses the page the same way", () => {
  let failing = false;
  const page = built("en", {
    prepare: function (browser) {
      const real = browser.window.LaserEngine;
      const advance = real.bench.advance;
      browser.window.LaserEngine = Object.assign({}, real, {
        bench: Object.assign({}, real.bench, {
          advance: function (params) {
            if (failing) throw new Error("solver gave up");
            return advance(params);
          }
        })
      });
    }
  });
  const { browser, section } = page;
  page.clock = 1000;
  browser.runFrame(page.clock);
  failing = true;
  page.clock += FRAME;
  assert.throws(() => browser.runFrame(page.clock), /solver gave up/);
  assert.equal(browser.pendingFrames(), 0);
  assert.equal(section.play.textContent, "Play");
});

test("a build that fails part-way leaves no loop and no listener behind", () => {
  const { browser } = setup("en");
  const UI = browser.window.LaserUI;
  const listenersBefore = { resize: browser.listenerCount("resize"), theme: browser.listenerCount("theme:changed") };
  // The Play button's word fails: only page.js asks for it, after the loop,
  // the sliders' and the buttons' listeners were all set up. (A failure in
  // a drawing would come earlier, inside loop.create, which leaves nothing
  // behind by itself.)
  const word = browser.window.Site.word;
  browser.window.Site.word = function () { throw new Error("no words"); };
  const section = laserSection(600);
  assert.throws(() => sectionReady(browser, "laser", section.container, WORDS), /no words/);
  assert.equal(UI.loop.liveCount(), 0);
  assert.equal(browser.listenerCount("resize"), listenersBefore.resize);
  assert.equal(browser.listenerCount("theme:changed"), listenersBefore.theme);
  for (const name of CONTROLS) assert.equal(section.controls[name].listenerCount("input"), 0, name);
  assert.equal(section.play.listenerCount("click"), 0);
  assert.equal(section.reset.listenerCount("click"), 0);
  // The next build (a language switch) works and is the only one.
  browser.window.Site.word = word;
  sectionReady(browser, "laser", laserSection(600).container, WORDS);
  assert.equal(UI.loop.liveCount(), 1);
});

/* ---------- rebuilds ---------- */

test("language switch, twice: rebuilt each time, one loop and one set of listeners; the experiment goes on", () => {
  const page = built("en");
  const { browser } = page;
  const first = page.section;
  slide(first, "pump", 500);                          // 10 W
  page.clock = 1000;
  browser.runFrame(page.clock);
  runFrames(page, 12);
  first.play.fire("click");                           // paused: the readouts are exact
  const timeBefore = first.readouts.time.textContent;
  assert.notEqual(timeBefore, "0" + NB + "s");
  const resizeListeners = browser.listenerCount("resize");
  const themeListeners = browser.listenerCount("theme:changed");

  browser.window.Site.lang = "hy";
  const second = laserSection(600);
  sectionReady(browser, "laser", second.container, WORDS);
  browser.window.Site.lang = "en";
  const third = laserSection(600);
  sectionReady(browser, "laser", third.container, WORDS);

  assert.equal(browser.window.LaserUI.loop.liveCount(), 1);
  assert.equal(browser.listenerCount("resize"), resizeListeners);
  assert.equal(browser.listenerCount("theme:changed"), themeListeners);
  assert.equal(first.canvas.getAttribute("data-running"), "false");
  for (const old of [first, second]) {
    for (const name of CONTROLS) assert.equal(old.controls[name].listenerCount("input"), 0, "old slider " + name);
    assert.equal(old.play.listenerCount("click"), 0);
    assert.equal(old.reset.listenerCount("click"), 0);
  }
  // The new page shows the same bench and the same moment.
  assert.equal(third.controls.pump.value, "500");
  assert.equal(third.values.pump.textContent, "10.0" + NB + "W");
  assert.equal(third.readouts.time.textContent, timeBefore);
  assert.equal(third.play.textContent, "Play", "still paused");
  // Only the newest build still draws.
  for (const old of [first, second, third]) old.recorder.calls.length = 0;
  switchTheme(browser);
  assert.deepEqual(first.recorder.calls, [], "the first build is gone");
  assert.deepEqual(second.recorder.calls, [], "the second build is gone");
  assert.ok(texts(third.recorder).includes(WORDS.bench.parts.medium.en));
  browser.setOnScreen(first.canvas, true);
  assert.deepEqual(first.recorder.calls, [], "the old canvases' observers hear nothing");
});

test("other pages are ignored: nothing built, the laser page left alive", () => {
  const { browser } = setup("en");
  const section = laserSection(600);
  sectionReady(browser, "laser", section.container, WORDS);
  for (const route of ["lab", "labs", "home", "post"]) {
    sectionReady(browser, route, laserSection(600).container, {});
  }
  assert.equal(browser.window.LaserUI.loop.liveCount(), 1);
  section.recorder.calls.length = 0;
  switchTheme(browser);
  assert.ok(texts(section.recorder).length > 0, "the laser loop was not taken down");
});

test("a laser section without its canvases (a page that failed to load): the old build goes, nothing breaks", () => {
  const { browser } = setup("en");
  const section = laserSection(600);
  sectionReady(browser, "laser", section.container, WORDS);
  browser.setOnScreen(section.canvas, true);
  sectionReady(browser, "laser", fakeContainer({}), WORDS);
  assert.equal(browser.window.LaserUI.loop.liveCount(), 0);
  assert.equal(browser.pendingFrames(), 0);
  assert.equal(browser.listenerCount("resize"), 0);
  assert.equal(browser.listenerCount("theme:changed"), 0);
  for (const name of CONTROLS) assert.equal(section.controls[name].listenerCount("input"), 0);
});

test("only the bench canvas (no controls): the page still builds and draws what it has", () => {
  const { browser } = setup("en");
  const section = benchOnlySection(600);
  sectionReady(browser, "laser", section.container, WORDS);
  assert.equal(browser.window.LaserUI.loop.liveCount(), 1);
  browser.setOnScreen(section.canvas, true);
  browser.runFrame(1000);
  browser.runFrame(1000 + FRAME);
  assert.ok(texts(section.recorder).includes(WORDS.bench.parts.medium.en));
});

test("the pictures' names: their description, else the page title, else hidden from screen readers", () => {
  const { browser } = setup("en");
  const noAlt = JSON.parse(JSON.stringify(WORDS));
  delete noAlt.bench.alt;
  const titled = laserSection(600);
  sectionReady(browser, "laser", titled.container, noAlt);
  assert.equal(titled.canvas.getAttribute("aria-label"), WORDS.page.title.en);
  assert.equal(titled.canvas.getAttribute("aria-hidden"), null);

  const bare = laserSection(600);
  bare.canvas.setAttribute("aria-label", "left over");
  sectionReady(browser, "laser", bare.container, {});
  for (const name of ["bench", "levels", "plots"]) {
    assert.equal(bare.canvases[name].getAttribute("aria-label"), null, "no empty name: " + name);
    assert.equal(bare.canvases[name].getAttribute("aria-hidden"), "true", name);
  }

  const named = laserSection(600);
  named.canvas.setAttribute("aria-hidden", "true");
  sectionReady(browser, "laser", named.container, WORDS);
  assert.equal(named.canvas.getAttribute("aria-hidden"), null, "a named picture is not hidden");
});

test("words missing from the data: the page still builds and runs, with no 'undefined' anywhere", () => {
  const page = (function () {
    const { browser } = setup("en");
    const section = laserSection(600);
    sectionReady(browser, "laser", section.container, {});
    for (const name of ["bench", "levels", "plots"]) browser.setOnScreen(section.canvases[name], true);
    return { browser: browser, section: section, clock: 1000 };
  })();
  page.browser.runFrame(page.clock);
  runFrames(page, 10);
  assert.equal(page.browser.window.LaserUI.loop.liveCount(), 1);
  assert.deepEqual(texts(page.section.recorder), [], "no labels to write");
  for (const recorder of Object.values(page.section.recorders)) {
    for (const text of texts(recorder)) assert.ok(!/undefined|NaN/.test(text), text);
  }
});

// ---------------------------------------------------------------------------
// js/router.js loads before page.js and the other page scripts (index.html).
// While a later script is still downloading, the browser can already finish
// the router's fetches; a page built then fires "section:ready" before
// page.js listens, and the bench is never drawn (found in the browser in
// stage 5, when the laser files were downloaded fresh). So the router must
// wait for DOMContentLoaded, which fires only after every <script> at the
// end of <body> has run.

// Runs js/router.js in a sandbox with just enough of a browser to start.
// Its first step, once it starts, is to look for #app; it finds none here,
// so it stops there and `looked` shows whether and when it started.
function startRouter(readyState) {
  const documentListeners = {};
  const looked = [];
  const sandbox = {
    Site: { ready: Promise.resolve({ nav: [] }) },
    document: {
      readyState: readyState,
      addEventListener(type, listener) {
        if (!documentListeners[type]) documentListeners[type] = [];
        documentListeners[type].push(listener);
      },
      getElementById(id) {
        looked.push(id);
        return null;
      }
    },
    addEventListener() {}
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  const file = path.join(ROOT, "js", "router.js");
  vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file });
  return { documentListeners: documentListeners, looked: looked };
}

// Lets every promise callback that is ready run.
function settle() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("the router builds the first page only after every script on the page has run", async () => {
  const { documentListeners, looked } = startRouter("loading");
  await settle();
  assert.deepEqual(looked, [], "nothing built while index.html is still being read");
  const listeners = documentListeners.DOMContentLoaded || [];
  assert.equal(listeners.length, 1);
  listeners[0]();
  await settle();
  assert.deepEqual(looked, ["app"]);
});

test("the router starts at once if the page has already been read", async () => {
  const { looked } = startRouter("interactive");
  await settle();
  assert.deepEqual(looked, ["app"]);
});
