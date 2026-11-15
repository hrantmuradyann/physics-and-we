/* ============================================================================
   page.test.js — js/laser/page.js, which builds the laser page, and the
   router behaviour it depends on.

   The router (js/router.js) fires "section:ready" for the laser page more
   often than it is opened: once when it quietly builds every page in the
   background (the page is hidden then), and again on every language
   switch. page.js must take the previous build down each time, do nothing
   heavy while hidden, and ignore every other page (docs/laser-plan.md,
   "Site trap"). It also wires the controls (sliders with their number
   boxes, Play, Reset, the readouts), runs the simulation in the loop and
   hands the five pictures what they draw (stages 6 and 6b). Runs the real
   files, with the real data/laser.json, in the fake browser of
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
const PARTS = ["backMirror", "outputMirror", "medium", "pump", "transmission"];
const CANVASES = ["bench", "power", "photons", "levels", "inversion"];
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
  const section = { canvases: {}, recorders: {}, boxes: {}, controls: {}, inputs: {}, units: {}, readouts: {} };
  for (const name of CANVASES) {
    const parts = fakeCanvas(width);
    by['[data-laser-canvas="' + name + '"]'] = parts.canvas;
    section.canvases[name] = parts.canvas;
    section.recorders[name] = parts.recorder;
    section.boxes[name] = parts.box;
  }
  for (const name of CONTROLS) {
    section.controls[name] = fakeElement("input");      // the slider
    section.inputs[name] = fakeElement("input");        // its number box
    section.units[name] = fakeElement("span");
    by['[data-laser-control="' + name + '"]'] = section.controls[name];
    by['[data-laser-input="' + name + '"]'] = section.inputs[name];
    by['[data-laser-unit="' + name + '"]'] = section.units[name];
  }
  section.hint = fakeElement("p");                      // "1 s = 100 µs"
  by['[data-laser-value="slowMotion"]'] = section.hint;
  for (const name of READOUTS) {
    section.readouts[name] = fakeElement("span");
    by['[data-laser-readout="' + name + '"]'] = section.readouts[name];
  }
  section.play = fakeElement("button");
  section.reset = fakeElement("button");
  section.learn = fakeElement("button");
  section.theory = fakeElement("section");
  section.note = fakeElement("p");
  section.note.hidden = true;
  by['[data-laser-action="play"]'] = section.play;
  by['[data-laser-action="reset"]'] = section.reset;
  by['[data-laser-action="learn"]'] = section.learn;
  by["[data-laser-learn]"] = section.theory;
  by['[data-laser-note="behind"]'] = section.note;
  section.by = by;
  section.container = fakeContainer(by);
  section.canvas = section.canvases.bench;
  section.recorder = section.recorders.bench;
  return section;
}

// Only the bench canvas. A page whose controls failed to come must still
// build what it can.
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

// Builds a laser page on screen.
//   options.watch    true: page.seen records what page.js hands on (watch())
//   options.prepare  function (browser), run just before the build
//   options.show     the canvases to put on screen (default: all five)
function built(lang, options) {
  const { browser } = setup(lang, options);
  const seen = options && options.watch ? watch(browser) : null;
  if (options && options.prepare) options.prepare(browser);
  const section = laserSection(600);
  sectionReady(browser, "laser", section.container, WORDS);
  for (const name of (options && options.show) || CANVASES) browser.setOnScreen(section.canvases[name], true);
  return { browser: browser, section: section, clock: 0, seen: seen };
}

// Puts recorders around what page.js calls, before it builds (it takes
// LaserEngine.bench at build time). The engine's and UI's own objects are
// frozen, so the globals get copies.
//   seen.steps     the solver steps of every advance() call
//   seen.configs   the config of every derive() call (a slider moved)
//   seen.levels    every picture given to the level diagram
//   seen.bench     every { labels, light } given to the bench drawing
//   seen.chart     the latest chart given to draw-plots, by its key: { P, y }
//   seen.charts    how many charts were drawn
//   seen.drives    every { dt, drive } the photon cartoon was stepped with
//   seen.cartoons  every cartoon given to the photon drawing
function watch(browser) {
  const seen = { steps: [], configs: [], levels: [], bench: [], chart: {}, charts: 0, drives: [], cartoons: [] };
  const engineNow = browser.window.LaserEngine;
  const advance = engineNow.bench.advance;
  const derive = engineNow.bench.derive;
  browser.window.LaserEngine = Object.assign({}, engineNow, {
    bench: Object.assign({}, engineNow.bench, {
      advance: function (params) {
        const run = advance(params);
        seen.steps.push(run.steps);
        return run;
      },
      derive: function (config) {
        seen.configs.push(Object.assign({}, config));
        return derive(config);
      }
    })
  });
  const UI = browser.window.LaserUI;
  const levels = UI.levels.draw;
  UI.levels = Object.assign({}, UI.levels, {
    draw: function (view, picture) {
      seen.levels.push(picture);
      return levels(view, picture);
    }
  });
  const plots = UI.plots.draw;
  UI.plots = Object.assign({}, UI.plots, {
    draw: function (view, chart) {
      seen.chart[chart.key] = chart;
      seen.charts += 1;
      return plots(view, chart);
    }
  });
  const bench = UI.bench.draw;
  UI.bench = Object.assign({}, UI.bench, {
    draw: function (view, labels, light) {
      seen.bench.push({ labels: Object.assign({}, labels), light: light });
      return bench(view, labels, light);
    }
  });
  const photons = UI.photons;
  UI.photons = Object.assign({}, photons, {
    create: function (options) {
      const model = photons.create(options);
      const step = model.step;
      model.step = function (dt, drive) {
        seen.drives.push({ dt: dt, drive: drive });
        return step(dt, drive);
      };
      return model;
    },
    draw: function (view, model, words) {
      seen.cartoons.push(model);
      return photons.draw(view, model, words);
    }
  });
  return seen;
}

function last(list) {
  return list[list.length - 1];
}

// Makes the solver cost `price.perSecond` steps per second of simulated
// time (0, the start, passes the real solver through): a call that would
// cost more than its maxSteps runs only that share of its time and
// reports reachedEnd false, as a solver out of steps does. price.charged
// lists what page.js was charged, call by call. The tests of the frame
// budget use it: since stage 7a's implicit solver no corner of the Nd:YAG
// bench needs more than about 700 steps in a 60 Hz frame at the slowest
// slow motion, and a settled laser costs one to a few steps per plot
// point however long the frame is, so nothing falls behind on its own
// (stage 7c's ruby flash will).
function dearer(browser) {
  const price = { perSecond: 0, charged: [] };
  const engineNow = browser.window.LaserEngine;
  const advance = engineNow.bench.advance;
  browser.window.LaserEngine = Object.assign({}, engineNow, {
    bench: Object.assign({}, engineNow.bench, {
      advance: function (params) {
        if (price.perSecond === 0) {
          const real = advance(params);
          price.charged.push(real.steps);
          return real;
        }
        const cost = Math.ceil(params.seconds * price.perSecond);
        if (cost <= params.maxSteps) {
          const whole = advance(params);
          price.charged.push(cost);
          return Object.assign({}, whole, { steps: cost });
        }
        const part = advance(Object.assign({}, params, { seconds: params.seconds * params.maxSteps / cost }));
        price.charged.push(params.maxSteps);
        return Object.assign({}, part, { steps: params.maxSteps, reachedEnd: false });
      }
    })
  });
  return price;
}

function sum(numbers) {
  let total = 0;
  for (const n of numbers) total += n;
  return total;
}

// Runs `count` frames, FRAME ms apart. The recording contexts keep every
// call, and a chart is thousands of calls a frame: a record that has grown
// long is emptied before the next frame, so the latest picture is always
// whole.
function runFrames(page, count, gap) {
  for (let i = 0; i < count; i++) {
    for (const recorder of Object.values(page.section.recorders)) {
      if (recorder.calls.length > 20000) {
        recorder.calls.length = 0;
        recorder.sets.length = 0;
        recorder.log.length = 0;
      }
    }
    page.clock += gap || FRAME;
    page.browser.runFrame(page.clock);
  }
}

function slide(section, name, position) {
  section.controls[name].value = String(position);
  section.controls[name].fire("input");
}

// Types into a number box and leaves it.
function type(section, name, text) {
  section.inputs[name].value = text;
  section.inputs[name].fire("change");
}

function engine(browser) {
  return browser.window.LaserEngine;
}

/* ---------- building ---------- */

test("page.js adds no global, and listens to section:ready once", () => {
  const { browser, globalsBeforePage } = setup();
  assert.deepEqual(browser.addedGlobals(), globalsBeforePage);
  assert.equal(browser.listenerCount("section:ready"), 1);
});

test("the words page.js needs are in data/laser.json, in both languages", () => {
  const { browser } = setup();
  const UI = browser.window.LaserUI;
  assert.deepEqual(Array.from(UI.bench.PARTS), PARTS);
  for (const lang of ["hy", "en"]) {
    for (const name of CANVASES) assert.ok(WORDS[name].alt[lang].trim(), name + ".alt." + lang);
    for (const part of PARTS) assert.ok(WORDS.bench.parts[part][lang].trim(), part + "." + lang);
    for (const name of ["pumpBand", "upper", "lower", "ground", "gain", "loss"]) {
      assert.ok(WORDS.levels.words[name][lang].trim(), "levels.words." + name + "." + lang);
    }
    for (const name of ["title", "steady"]) assert.ok(WORDS.power.words[name][lang].trim(), "power.words." + name + "." + lang);
    for (const name of ["title", "threshold"]) assert.ok(WORDS.inversion.words[name][lang].trim(), "inversion.words." + name + "." + lang);
    for (const name of UI.photons.WORDS) assert.ok(WORDS.photons.words[name][lang].trim(), "photons.words." + name + "." + lang);
  }
});

test("built while hidden: one loop, no frame asked for, nothing drawn, the canvases described", () => {
  const { browser } = setup("en");
  const section = laserSection();
  sectionReady(browser, "laser", section.container, WORDS);
  assert.equal(browser.window.LaserUI.loop.liveCount(), 1);
  assert.equal(browser.pendingFrames(), 0);
  for (const name of CANVASES) {
    assert.equal(section.canvases[name].getAttribute("data-running"), "false");
    assert.equal(section.canvases[name].getAttribute("aria-label"), WORDS[name].alt.en, name);
    assert.deepEqual(section.recorders[name].calls, [], "nothing drawn into a hidden canvas: " + name);
  }
});

test("on screen: every picture is drawn with the page's words, and the simulation runs", () => {
  for (const lang of ["hy", "en"]) {
    const page = built(lang);
    const { browser, section } = page;
    const UI = browser.window.LaserUI;
    assert.equal(browser.pendingFrames(), 1, lang);
    for (const name of CANVASES) {
      assert.equal(section.canvases[name].getAttribute("data-running"), "true", name);
      assert.equal(section.canvases[name].getAttribute("aria-label"), WORDS[name].alt[lang], name);
    }
    // The bench: the four names, and the output mirror's transmission
    // with its number.
    const expected = ["backMirror", "outputMirror", "medium", "pump"].map((part) => WORDS.bench.parts[part][lang]);
    expected.push(WORDS.bench.parts.transmission[lang] + " 5.00" + NB + "%");
    assert.deepEqual(texts(section.recorder).sort(), expected.sort(), lang);
    // Each canvas has the height its drawing asks for.
    const sizes = { bench: UI.bench.SIZE, power: UI.plots.SIZE, photons: UI.photons.SIZE, levels: UI.levels.SIZE, inversion: UI.plots.SIZE_SMALL };
    for (const name of CANVASES) {
      const size = sizes[name];
      const height = Math.max(size.minHeight, Math.min(600 / size.aspect, size.maxHeight));
      assert.equal(section.canvases[name].style.height, height + "px", name);
    }
    assert.ok(texts(section.recorders.levels).includes(WORDS.levels.words.upper[lang]));
    assert.ok(texts(section.recorders.power).includes(WORDS.power.words.title[lang]));
    assert.ok(texts(section.recorders.power).includes(WORDS.power.words.steady[lang]));
    assert.ok(texts(section.recorders.inversion).includes(WORDS.inversion.words.title[lang]));
    assert.ok(texts(section.recorders.inversion).includes(WORDS.inversion.words.threshold[lang]));
    for (const name of UI.photons.WORDS) {
      assert.ok(texts(section.recorders.photons).includes(WORDS.photons.words[name][lang]), "photons: " + name);
    }
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

test("the controls start at the default bench: sliders, number boxes with their units, the slow-motion line", () => {
  const { browser, section } = built("en");
  const F = browser.window.LaserUI.format;
  const R = engine(browser).bench.RANGES;
  for (const name of CONTROLS) {
    const slider = section.controls[name];
    assert.equal(slider.min, "0");
    assert.equal(slider.max, "1000");
    assert.equal(slider.step, "1");
  }
  assert.equal(section.controls.pump.value, String(Math.round(1000 * F.toSlider(R.pumpPower, 5))));
  assert.equal(section.controls.coupler.value, String(Math.round(1000 * F.toSlider(R.T_oc, 0.05))));
  assert.equal(section.controls.slowMotion.value, "333");
  // The number boxes: the same values, the output mirror in %.
  assert.equal(section.inputs.pump.value, "5");
  assert.equal(section.inputs.coupler.value, "5");
  assert.equal(section.inputs.slowMotion.value, "10000");
  assert.equal(section.units.pump.textContent, "W");
  assert.equal(section.units.coupler.textContent, "%");
  assert.equal(section.units.slowMotion.textContent, "×");
  assert.equal(section.hint.textContent, "1" + NB + "s = 100" + NB + "µs");
  // What a screen reader hears on the sliders.
  assert.equal(section.controls.pump.getAttribute("aria-valuetext"), "5.00" + NB + "W");
  assert.equal(section.controls.coupler.getAttribute("aria-valuetext"), "5.00" + NB + "%");
  assert.equal(section.controls.slowMotion.getAttribute("aria-valuetext"), section.hint.textContent);
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
  assert.equal(section.inputs.pump.value, "1");
  assert.equal(section.controls.pump.getAttribute("aria-valuetext"), "1.00" + NB + "W");
  assert.equal(section.readouts.P_out.textContent, "0" + NB + "W");
  assert.equal(section.readouts.period.textContent, "—");
  assert.equal(section.readouts.x.textContent, F.number(1 / 1.5120135480795136));
  // The coupler: 30 % at the top of its slider.
  slide(section, "coupler", 1000);
  assert.equal(section.inputs.coupler.value, "30");
  const d = engine(browser).bench.derive(Object.assign(engine(browser).bench.defaultConfig(), { pumpPower: 1, refl2: 0.7 }));
  assert.equal(section.readouts.pumpThreshold.textContent, F.si(d.pumpThreshold, "W"));
  // With no pump the gain cannot beat even the internal loss: no output
  // mirror is best, and the readout says so with a dash, not "0 %".
  slide(section, "pump", 0);
  assert.equal(section.readouts.T_best.textContent, "—");
  // Paused, the pictures were drawn again with the new numbers.
  assert.equal(browser.pendingFrames(), 0);
  assert.ok(section.recorders.levels.calls.length > 0);
  assert.ok(texts(section.recorder).includes(WORDS.bench.parts.transmission.en + " 30.0" + NB + "%"), "the bench shows the new mirror");
});

test("a slider gives round values, which the number box shows exactly", () => {
  const page = built("en", { reducedMotion: true, watch: true });
  const { section, seen } = page;
  slide(section, "pump", 673);                        // 13.46 W
  assert.equal(last(seen.configs).pumpPower, 13.46);
  assert.equal(section.inputs.pump.value, "13.46");
  // The output mirror moves by equal factors: position 300 of 1000 is
  // 0.5 % × 60^0.3 = 1.7078… %, used as 1.708 %.
  slide(section, "coupler", 300);
  assertClose(1 - last(seen.configs).refl2, 0.01708, 1e-12, "T");
  assert.equal(section.inputs.coupler.value, "1.708");
  slide(section, "slowMotion", 500);                  // 10^4.5 = 31 622.8, used as 31 620
  assert.equal(section.inputs.slowMotion.value, "31620");
  assert.equal(section.hint.textContent, "1" + NB + "s = 31.6" + NB + "µs");
  // The ends of a slider are the ends of its range, exactly.
  slide(section, "coupler", 0);
  assertClose(1 - last(seen.configs).refl2, 0.005, 1e-12, "the least mirror");
  assert.equal(section.inputs.coupler.value, "0.5");
  slide(section, "pump", 1000);
  assert.equal(last(seen.configs).pumpPower, 20);
});

test("a number typed into a box sets the bench, the slider and the readouts", () => {
  const page = built("en", { reducedMotion: true, watch: true });
  const { browser, section, seen } = page;
  const F = browser.window.LaserUI.format;
  const B = engine(browser).bench;
  type(section, "pump", "7.25");
  assert.equal(last(seen.configs).pumpPower, 7.25);
  assert.equal(section.controls.pump.value, "363", "the slider follows: 7.25 of 20 W");
  assert.equal(section.controls.pump.getAttribute("aria-valuetext"), "7.25" + NB + "W");
  assert.equal(section.inputs.pump.value, "7.25");
  const d = B.derive(Object.assign(B.defaultConfig(), { pumpPower: 7.25 }));
  assert.equal(section.readouts.x.textContent, F.number(d.x));
  assert.equal(section.readouts.P_out.textContent, F.si(d.P_out, "W"));

  // The output mirror is typed in per cent.
  type(section, "coupler", "12.5");
  assertClose(1 - last(seen.configs).refl2, 0.125, 1e-12, "T");
  assert.equal(section.inputs.coupler.value, "12.5");
  assert.equal(section.controls.coupler.value, String(Math.round(1000 * F.toSlider(B.RANGES.T_oc, 0.125))));
  const d2 = B.derive(Object.assign(B.defaultConfig(), { pumpPower: 7.25, refl2: 0.875 }));
  assert.equal(section.readouts.pumpThreshold.textContent, F.si(d2.pumpThreshold, "W"));

  // The slow motion is typed as its factor.
  type(section, "slowMotion", "50000");
  assert.equal(section.hint.textContent, "1" + NB + "s = 20.0" + NB + "µs");
  assert.equal(section.controls.slowMotion.value, String(Math.round(1000 * Math.log(50) / Math.log(1000))));
  // Paused, the pictures were drawn again.
  assert.ok(texts(section.recorder).includes(WORDS.bench.parts.transmission.en + " 12.5" + NB + "%"));
});

test("a typed number outside the range is held at its end; text that is no number puts the old value back", () => {
  const page = built("en", { reducedMotion: true, watch: true });
  const { section, seen } = page;
  type(section, "pump", "50");
  assert.equal(last(seen.configs).pumpPower, 20);
  assert.equal(section.inputs.pump.value, "20");
  assert.equal(section.controls.pump.value, "1000");
  type(section, "pump", "-3");
  assert.equal(last(seen.configs).pumpPower, 0);
  assert.equal(section.inputs.pump.value, "0");
  type(section, "coupler", "0.1");
  assertClose(1 - last(seen.configs).refl2, 0.005, 1e-12, "held at 0.5 %");
  assert.equal(section.inputs.coupler.value, "0.5");
  type(section, "coupler", "95");
  assert.equal(section.inputs.coupler.value, "30");

  type(section, "pump", "6");
  const derives = seen.configs.length;
  for (const text of ["", "   ", "abc", "1e999", "NaN"]) {
    type(section, "pump", text);
    assert.equal(section.inputs.pump.value, "6", JSON.stringify(text) + " puts the 6 back");
    assert.equal(seen.configs.length, derives, JSON.stringify(text) + " changes nothing");
  }
  // An exponent is a number: 1.2e1 = 12.
  type(section, "pump", "1.2e1");
  assert.equal(last(seen.configs).pumpPower, 12);
  assert.equal(section.inputs.pump.value, "12");
});

test("a decimal comma and spaces between digits are read as a number; a typed value is used as the box shows it", () => {
  const page = built("hy", { reducedMotion: true, watch: true });
  const { section, seen } = page;
  // Armenian writes 13,5.
  type(section, "pump", "13,5");
  assert.equal(last(seen.configs).pumpPower, 13.5);
  assert.equal(section.inputs.pump.value, "13.5");
  type(section, "coupler", " 2,25 ");
  assertClose(1 - last(seen.configs).refl2, 0.0225, 1e-12, "T");
  type(section, "slowMotion", "20" + NB + "000");
  assert.equal(section.inputs.slowMotion.value, "20000");
  type(section, "slowMotion", "30 000");
  assert.equal(section.inputs.slowMotion.value, "30000");
  // Two separators are no number: the old value comes back.
  const derives = seen.configs.length;
  for (const text of ["1,2,3", "1.234,5", ","]) {
    type(section, "pump", text);
    assert.equal(section.inputs.pump.value, "13.5", JSON.stringify(text));
  }
  assert.equal(seen.configs.length, derives);
  // More digits than the box shows: used rounded to what it shows, so the
  // box and the simulation agree.
  type(section, "pump", "13.1234567");
  assert.equal(last(seen.configs).pumpPower, 13.1235);
  assert.equal(section.inputs.pump.value, "13.1235");
  type(section, "coupler", "4.123456789");
  assertClose(1 - last(seen.configs).refl2, 0.0412346, 1e-12, "T rounded in %");
  assert.equal(section.inputs.coupler.value, "4.12346");
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
  assert.equal(section.hint.textContent, "1" + NB + "s = 1.00" + NB + "µs");
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
  // One photon at the start: the bench is told of no light worth drawing.
  assert.ok(last(seen.bench).light.beam < 1e-8, "no beam at the start: " + last(seen.bench).light.beam);
  assert.equal(last(seen.bench).light.transmission, 1 - 0.95);
  assert.equal(last(seen.bench).light.pump, 5 / 20, "the pump over its strongest setting");
  // 10 frames at 1 s = 100 µs: the inversion builds up, the light has not
  // come yet (the first spike is about 170 µs in), so no stimulated emission.
  runFrames(page, 10);
  const early = last(seen.levels);
  assert.ok(early.y > 0.1, "the inversion is building up: " + early.y);
  assert.ok(early.stim < 1e-6, "no stimulated emission before the light: " + early.stim);

  slide(section, "slowMotion", 0);                    // 1 s = 1 ms
  runFrames(page, 300);                               // 5 s on screen = 5 ms simulated
  const d = engine(browser).bench.derive(engine(browser).bench.defaultConfig());
  const shown = section.readouts.powerNow.textContent;
  assert.equal(shown, browser.window.LaserUI.format.si(d.P_out, "W"), shown);
  assert.equal(section.note.hidden, true, "it kept up");
  // The beam follows the output: P_out = 2.3 × powerPerP (x − 1).
  assertClose(last(seen.bench).light.beam, d.x - 1, 0.01, "beam");
  // The levels: the gain clamped at the loss (y = 1), the laser transition
  // as strong as the pump above threshold (y·p = x − 1, §4.1).
  const late = last(seen.levels);
  assert.equal(late.x, d.x);
  assertClose(late.y, 1, 0.01, "y");
  assertClose(late.stim, d.x - 1, 0.01, "stimulated emission");
});

test("the charts: the output power with its steady line, the inversion with its threshold and pump level", () => {
  const page = built("en", { watch: true });
  const { browser, section, seen } = page;
  page.clock = 1000;
  browser.runFrame(page.clock);
  runFrames(page, 30);
  const d = engine(browser).bench.derive(engine(browser).bench.defaultConfig());
  const power = seen.chart.P;
  assert.equal(power.unit, "W");
  assert.equal(power.color, "accent");
  assert.equal(power.title, WORDS.power.words.title.en);
  assert.equal(power.floor, d.powerPerP, "at least the output at twice threshold on the axis");
  assert.equal(power.shownTime, 5 / 1e4, "5 s of screen time at 1 s = 100 µs");
  assert.equal(power.lines.length, 1);
  assert.equal(power.lines[0].value, d.P_out);
  assert.equal(power.lines[0].word, WORDS.power.words.steady.en);
  assert.equal(power.cursor, null);
  const inversion = seen.chart.y;
  assert.equal(inversion.unit, "");
  assert.equal(inversion.color, "accent2");
  assert.equal(inversion.title, WORDS.inversion.words.title.en);
  assert.equal(inversion.floor, 1);
  assert.deepEqual(Array.from(inversion.lines, (line) => [line.value, line.word]),
    [[1, WORDS.inversion.words.threshold.en], [d.x, WORDS.inversion.words.pump.en]]);
  // The threshold stretches the axis; the pump level does not (at a strong
  // pump it would press the curve near 1 flat on the bottom).
  assert.equal(inversion.lines[0].stretch, undefined);
  assert.equal(inversion.lines[1].stretch, false);
  // Both show the same stretch of time, up to now, from one list of points.
  assert.equal(inversion.tNow, power.tNow);
  assert.equal(inversion.shownTime, power.shownTime);
  assert.equal(inversion.points, power.points, "the two charts share the points of the frame");
  section.play.fire("click");
  assert.equal(section.readouts.time.textContent, browser.window.LaserUI.format.si(power.tNow, "s"));
  // The points are the history: time in order, the latest at now.
  assert.equal(last(power.points).t, power.tNow);
  for (let i = 1; i < power.points.length; i++) assert.ok(power.points[i].t >= power.points[i - 1].t);
  // Below threshold there is no steady line to draw (its value is 0).
  slide(section, "pump", 50);
  assert.equal(seen.chart.P.lines[0].value, 0);
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
  assert.equal(section.canvases.power.getAttribute("data-running"), "false");
  section.play.fire("click");
  assert.equal(section.play.textContent, "Pause");
  assert.equal(browser.pendingFrames(), 1);
  section.reset.fire("click");
  assert.equal(section.readouts.time.textContent, "0" + NB + "s");
  // The charts start again (drawn on the next frames: a running loop draws
  // only then, and the first frame after Play has dt = 0): the new start
  // first, nothing from the old run.
  runFrames(page, 2);
  for (const key of ["P", "y"]) {
    const chart = page.seen.chart[key];
    assert.ok(chart.tNow > 0 && chart.tNow < 1e-5, "one frame since Reset: " + chart.tNow);
    assert.equal(chart.points[0].t, 0);
    for (const point of chart.points) assert.ok(point.t <= chart.tNow, "a point from the old run: " + point.t);
  }
  assert.equal(section.readouts.powerNow.textContent, browser.window.LaserUI.format.si(
    engine(browser).bench.derive(engine(browser).bench.defaultConfig()).powerPerPhoton, "W"), "one photon again");
});

test("a paused change of slow motion shows the new stretch of time at once", () => {
  const page = built("en", { watch: true });
  const { browser, section, seen } = page;
  page.clock = 1000;
  browser.runFrame(page.clock);
  runFrames(page, 130, 50);                           // 6.5 s of screen time at 1 s = 100 µs
  const before = seen.chart.P;
  assert.ok(before.points[0].t > 0, "the window has moved on from the start: " + before.points[0].t);
  section.play.fire("click");
  slide(section, "slowMotion", 0);                    // 1 s = 1 ms: the window is 10 times longer
  const after = seen.chart.P;
  assert.equal(after.shownTime, 5e-3);
  assert.equal(after.points[0].t, 0, "the whole run fits now");
  assert.ok(after.points.length > before.points.length);
  assert.equal(seen.chart.y.points, after.points);
});

test("the charts' points are taken again after every new point, even one at the same time (Reset twice)", () => {
  // Paused at t = 0 after a Reset, the output mirror moved, Reset again:
  // the chart's window has not moved (t is 0 both times), but its one
  // point is new (one photon now carries another power).
  const page = built("en", { reducedMotion: true, watch: true });
  const { browser, section, seen } = page;
  const B = engine(browser).bench;
  section.reset.fire("click");
  assert.equal(seen.chart.P.points.length, 1);
  const before = seen.chart.P.points[0].P;
  slide(section, "coupler", 1000);                    // 30 %
  section.reset.fire("click");
  const expected = B.derive(Object.assign(B.defaultConfig(), { refl2: 0.7 })).powerPerPhoton;
  assert.equal(seen.chart.P.points.length, 1);
  assertClose(seen.chart.P.points[0].P, expected, 1e-12, "the new start point");
  assert.ok(Math.abs(seen.chart.P.points[0].P - before) > 0.1 * before, "and not the old one");
});

test("Reset also starts the photon cartoon afresh: no excited atoms or light left from the old run", () => {
  const page = built("en", { watch: true });
  const { browser, section, seen } = page;
  slide(section, "slowMotion", 0);                    // lasing within a few frames
  page.clock = 1000;
  browser.runFrame(page.clock);
  runFrames(page, 120);
  const old = last(seen.cartoons);
  assert.ok(old.photons.length > 0 && old.atoms.some((atom) => atom.excited), "the old run is lively");
  // Paused, then Reset: the pictures are drawn at once, with a new cartoon.
  section.play.fire("click");
  section.reset.fire("click");
  const fresh = last(seen.cartoons);
  assert.notEqual(fresh, old, "a new cartoon");
  assert.equal(fresh.photons.length, 0);
  assert.ok(fresh.atoms.every((atom) => !atom.excited), "no atom excited");
  assert.equal(fresh.tally.stimulated, 0);
  // It is the one that goes on, and survives a language switch.
  section.play.fire("click");
  runFrames(page, 3);
  assert.equal(last(seen.cartoons), fresh);
});

test("the cartoon's light is the bench's ray strength, from the same function", () => {
  const page = built("en", { watch: true });
  const { browser, section, seen } = page;
  const UI = browser.window.LaserUI;
  slide(section, "slowMotion", 0);
  page.clock = 1000;
  browser.runFrame(page.clock);
  for (let i = 0; i < 40; i++) {
    runFrames(page, 1);
    const light = last(seen.bench).light;
    assert.equal(last(seen.drives).drive.light, UI.bench.rayAlpha(light.beam), "frame " + i);
  }
  // The bench is handed the words alone: it writes the transmission's
  // number itself.
  assert.equal(last(seen.bench).labels.transmission, WORDS.bench.parts.transmission.en);
});

test("a frame never runs more than its step budget: the simulation falls behind and says so", () => {
  let price = null;
  const page = built("en", { show: ["bench"], prepare: (browser) => { price = dearer(browser); } });
  const { browser, section } = page;
  slide(section, "slowMotion", 0);                    // 1 s = 1 ms
  page.clock = 1000;
  browser.runFrame(page.clock);
  runFrames(page, 20);                                // 333 µs: lasing
  // From now on a µs of simulated time costs 52 steps: a 60 Hz frame
  // (16.7 µs at this slow motion) about 870 of its 1500, a 50 ms frame
  // (50 µs) 2600.
  price.perSecond = 52e6;
  runFrames(page, 60);
  assert.equal(section.note.hidden, true, "it keeps up at 60 Hz");
  price.charged.length = 0;
  runFrames(page, 1, 50);
  // Several pieces ran, and together they kept to the frame's 1500 steps.
  assert.ok(price.charged.length > 2, "pieces run: " + price.charged.length);
  assert.ok(sum(price.charged) <= 1500, "steps in the frame: " + sum(price.charged));
  // The note is judged over a second of frames: not yet after one frame,
  // shown after a second of frames that all fell behind.
  assert.equal(section.note.hidden, true, "one frame is not enough for the note");
  runFrames(page, 21, 50);
  assert.equal(section.note.hidden, false, "the note is shown");
  section.play.fire("click");
  const F = browser.window.LaserUI.format;
  const asked = 80 * FRAME / 1000 / 1e3 + 22 * 50e-6;
  assert.notEqual(section.readouts.time.textContent, F.si(asked, "s"), "less than asked for");
  assert.equal(section.note.hidden, true, "paused, nothing is behind");
  // Again, and then a slider moved: the new setting is judged afresh.
  section.play.fire("click");
  runFrames(page, 22, 50);
  assert.equal(section.note.hidden, false, "shown again");
  slide(section, "coupler", 400);
  assert.equal(section.note.hidden, true, "a slider moved");
  // And a typed number does the same.
  runFrames(page, 23, 50);
  assert.equal(section.note.hidden, false, "shown once more");
  type(section, "coupler", "5");
  assert.equal(section.note.hidden, true, "a number typed");
});

test("a dropped frame now and then does not make the note blink", () => {
  let price = null;
  const page = built("en", { show: ["bench"], prepare: (browser) => { price = dearer(browser); } });
  const { section } = page;
  slide(section, "slowMotion", 0);
  page.clock = 1000;
  page.browser.runFrame(page.clock);
  runFrames(page, 20);                                // lasing, as above
  price.perSecond = 52e6;
  // About 870 of the 1500 steps a 60 Hz frame; one frame in 8 is dropped
  // (dt 50 ms, 2600) and falls behind. 1.17 s of frames.
  let behindFrames = 0;
  for (let cycle = 0; cycle < 7; cycle++) {
    const before = price.charged.length;
    runFrames(page, 1, 50);
    if (sum(price.charged.slice(before)) === 1500) behindFrames += 1;
    assert.equal(section.note.hidden, true, "after a dropped frame, cycle " + cycle);
    for (let i = 0; i < 7; i++) {
      runFrames(page, 1);
      assert.equal(section.note.hidden, true, "cycle " + cycle + ", frame " + i);
    }
  }
  assert.equal(behindFrames, 7, "every dropped frame used its whole budget");
});

test("the charts keep 5 s of screen time on 240 Hz and 1000 Hz screens (cut short on a 120 Hz Mac once)", () => {
  for (const rate of [240, 1000]) {
    // Only the bench on screen until the last frame: thousands of frames
    // of a long chart take seconds to record.
    const page = built("en", { watch: true, show: ["bench"] });
    const { browser, section, seen } = page;
    page.clock = 1000;
    browser.runFrame(page.clock);
    runFrames(page, Math.round(5.2 * rate), 1000 / rate);
    browser.setOnScreen(section.canvases.power, true);
    runFrames(page, 1, 1000 / rate);
    const chart = seen.chart.P;
    // About 480 points a second of screen time, at least one a frame.
    const perFrame = Math.max(1, Math.round(480 / rate));
    const onePoint = chart.shownTime / (5 * rate * perFrame);
    const from = chart.tNow - chart.shownTime;
    assert.ok(chart.points[0].t <= from + 2 * onePoint,
      rate + " Hz: the curve starts " + (chart.points[0].t - from) / onePoint + " points into the chart");
    assert.ok(chart.points.length >= 0.95 * 5 * rate * perFrame, rate + " Hz: " + chart.points.length + " points");
  }
});

test("pump off from the start at the strongest coupler: the output falls below 1 fW and the page keeps running", () => {
  // About 5×10⁻²⁰ W here, the seed floor's level (stage 7a). Before the
  // floor it was 10⁻¹⁷⁰ W, and formatting that threw and stopped the page
  // (stage-6 review); format.test.js tries every power of ten down to
  // 10⁻³²³, which is what guards that.
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

/* ---------- the pointer, the theory button, the cartoon ---------- */

test("on a touch screen the crosshair goes where the finger comes down, and stays after the finger leaves", () => {
  const page = built("en", { reducedMotion: true, watch: true });
  const { section, seen } = page;
  section.canvases.power.fire("pointerdown", { offsetX: 120, pointerType: "touch" });
  assert.equal(seen.chart.P.cursor, 120, "a tap sends no pointermove");
  section.canvases.power.fire("pointerleave", { pointerType: "touch" });
  assert.equal(seen.chart.P.cursor, 120, "the finger left after the tap: the reading stays");
  section.canvases.power.fire("pointermove", { offsetX: 140, pointerType: "touch" });
  assert.equal(seen.chart.P.cursor, 140, "a sideways drag moves it");
  // A mouse that comes down and leaves takes it away.
  section.canvases.inversion.fire("pointerdown", { offsetX: 50, pointerType: "mouse" });
  assert.equal(seen.chart.y.cursor, 50);
  section.canvases.inversion.fire("pointerleave", { pointerType: "mouse" });
  assert.equal(seen.chart.y.cursor, null);
});

test("the pointer over a paused chart draws that chart again, not the other pictures", () => {
  const page = built("en", { reducedMotion: true });
  const { section } = page;
  for (const recorder of Object.values(section.recorders)) recorder.calls.length = 0;
  section.canvases.power.fire("pointermove", { offsetX: 200 });
  assert.ok(section.recorders.power.calls.length > 0, "the chart under the pointer");
  for (const name of ["bench", "photons", "levels", "inversion"]) {
    assert.equal(section.recorders[name].calls.length, 0, name + " is not drawn again");
  }
});

test("the pointer over a chart: its crosshair follows, on that chart only; leaving takes it away", () => {
  const page = built("en", { reducedMotion: true, watch: true });
  const { browser, section, seen } = page;
  assert.equal(seen.chart.P.cursor, null);
  const drawn = seen.charts;
  section.canvases.power.fire("pointermove", { offsetX: 200 });
  // Paused: drawn again at once.
  assert.ok(seen.charts > drawn, "drawn again");
  assert.equal(seen.chart.P.cursor, 200);
  assert.equal(seen.chart.y.cursor, null, "the other chart has its own pointer");
  section.canvases.inversion.fire("pointermove", { offsetX: 77 });
  assert.equal(seen.chart.y.cursor, 77);
  assert.equal(seen.chart.P.cursor, 200);
  section.canvases.power.fire("pointerleave");
  assert.equal(seen.chart.P.cursor, null);
  assert.equal(seen.chart.y.cursor, 77);
  // The other pictures do not listen for the pointer.
  for (const name of ["bench", "photons", "levels"]) {
    assert.equal(section.canvases[name].listenerCount("pointermove"), 0, name);
  }
  assert.equal(browser.pendingFrames(), 0, "still paused");

  // Running: the crosshair is drawn on the next frame.
  const running = built("en", { watch: true });
  running.clock = 1000;
  running.browser.runFrame(running.clock);
  running.section.canvases.power.fire("pointermove", { offsetX: 150 });
  assert.equal(running.seen.chart.P.cursor, null, "not drawn outside a frame");
  runFrames(running, 1);
  assert.equal(running.seen.chart.P.cursor, 150);
});

test("the 'dig deeper' button scrolls to the theory, smoothly unless the visitor asked for less motion", () => {
  const page = built("en");
  page.section.learn.fire("click");
  // (The options come from the sandbox, so they are compared as text.)
  assert.equal(JSON.stringify(page.section.theory.scrolledTo), JSON.stringify([{ behavior: "smooth", block: "start" }]));
  const calm = built("en", { reducedMotion: true });
  calm.section.learn.fire("click");
  assert.equal(JSON.stringify(calm.section.theory.scrolledTo), JSON.stringify([{ behavior: "auto", block: "start" }]));
  // A page without the theory (it failed to load): the button does nothing.
  const { browser } = setup("en");
  const section = laserSection(600);
  delete section.by["[data-laser-learn]"];
  sectionReady(browser, "laser", section.container, WORDS);
  assert.equal(section.learn.listenerCount("click"), 0);
  section.learn.fire("click");
});

test("the photon cartoon is stepped once a frame in screen time, with the simulation's numbers", () => {
  const page = built("en", { watch: true });
  const { browser, section, seen } = page;
  page.clock = 1000;
  browser.runFrame(page.clock);                       // dt = 0: only drawn
  assert.equal(seen.drives.length, 0);
  runFrames(page, 10);
  assert.equal(seen.drives.length, 10);
  for (const entry of seen.drives) assertClose(entry.dt, FRAME / 1000, 1e-9, "screen time, whatever the slow motion");
  // At the start: no light, atoms being lifted (y still under threshold).
  const early = last(seen.drives).drive;
  assert.ok(early.light < 1e-3, "no light yet: " + early.light);
  assert.ok(early.excited > 0.05 && early.excited < 0.5, "under half excited: " + early.excited);
  assertClose(early.pump, 3.3068 / 4, 1e-4, "the pump over 4 × threshold");

  slide(section, "slowMotion", 0);
  runFrames(page, 300);
  const late = last(seen.drives).drive;
  // Lasing steadily: y = 1, so half the atoms excited; full light.
  assertClose(late.excited, 0.5, 0.01, "half excited at threshold");
  assert.equal(late.light, 1);
  // A strong pump is held at 1.
  slide(section, "pump", 1000);
  runFrames(page, 1);
  assert.equal(last(seen.drives).drive.pump, 1);

  // The same cartoon is drawn every frame, and not stepped while paused.
  assert.equal(new Set(seen.cartoons).size, 1);
  const steps = seen.drives.length;
  section.play.fire("click");
  slide(section, "pump", 500);                        // redraws, does not step
  assert.equal(seen.drives.length, steps);
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
  // the sliders', the boxes', the buttons' and the pointer's listeners
  // were all set up. (A failure in a drawing would come earlier, inside
  // loop.create, which leaves nothing behind by itself.)
  const word = browser.window.Site.word;
  browser.window.Site.word = function () { throw new Error("no words"); };
  const section = laserSection(600);
  assert.throws(() => sectionReady(browser, "laser", section.container, WORDS), /no words/);
  assert.equal(UI.loop.liveCount(), 0);
  assert.equal(browser.listenerCount("resize"), listenersBefore.resize);
  assert.equal(browser.listenerCount("theme:changed"), listenersBefore.theme);
  assertNoListeners(section, "the failed build");
  // The next build (a language switch) works and is the only one.
  browser.window.Site.word = word;
  sectionReady(browser, "laser", laserSection(600).container, WORDS);
  assert.equal(UI.loop.liveCount(), 1);
});

// Every listener page.js adds to a section's own elements is gone.
function assertNoListeners(section, label) {
  for (const name of CONTROLS) {
    assert.equal(section.controls[name].listenerCount("input"), 0, label + ": slider " + name);
    assert.equal(section.inputs[name].listenerCount("change"), 0, label + ": number box " + name);
  }
  assert.equal(section.play.listenerCount("click"), 0, label + ": Play");
  assert.equal(section.reset.listenerCount("click"), 0, label + ": Reset");
  assert.equal(section.learn.listenerCount("click"), 0, label + ": the theory button");
  for (const name of ["power", "inversion"]) {
    assert.equal(section.canvases[name].listenerCount("pointermove"), 0, label + ": pointer over " + name);
    assert.equal(section.canvases[name].listenerCount("pointerleave"), 0, label + ": pointer leaving " + name);
  }
}

/* ---------- rebuilds ---------- */

test("a built page has one listener on each control, so a teardown has something to remove", () => {
  const { section } = built("en");
  for (const name of CONTROLS) {
    assert.equal(section.controls[name].listenerCount("input"), 1, name);
    assert.equal(section.inputs[name].listenerCount("change"), 1, name);
  }
  for (const button of [section.play, section.reset, section.learn]) assert.equal(button.listenerCount("click"), 1);
  for (const name of ["power", "inversion"]) {
    assert.equal(section.canvases[name].listenerCount("pointermove"), 1, name);
    assert.equal(section.canvases[name].listenerCount("pointerleave"), 1, name);
  }
});

test("language switch, twice: rebuilt each time, one loop and one set of listeners; the experiment goes on", () => {
  const page = built("en", { watch: true });
  const { browser, seen } = page;
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
  const cartoon = last(seen.cartoons);

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
  assertNoListeners(first, "the first build");
  assertNoListeners(second, "the second build");
  // The new page shows the same bench and the same moment.
  assert.equal(third.controls.pump.value, "500");
  assert.equal(third.inputs.pump.value, "10");
  assert.equal(third.readouts.time.textContent, timeBefore);
  assert.equal(third.play.textContent, "Play", "still paused");
  // Only the newest build still draws, the same cartoon as before.
  for (const old of [first, second, third]) old.recorder.calls.length = 0;
  switchTheme(browser);
  assert.deepEqual(first.recorder.calls, [], "the first build is gone");
  assert.deepEqual(second.recorder.calls, [], "the second build is gone");
  assert.ok(texts(third.recorder).includes(WORDS.bench.parts.medium.en));
  assert.equal(last(seen.cartoons), cartoon, "the cartoon went on, not a new one");
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
  assertNoListeners(section, "the old build");
});

test("only one canvas (the rest failed to come): the page still builds and draws what it has", () => {
  const { browser } = setup("en");
  const section = benchOnlySection(600);
  sectionReady(browser, "laser", section.container, WORDS);
  assert.equal(browser.window.LaserUI.loop.liveCount(), 1);
  browser.setOnScreen(section.canvas, true);
  browser.runFrame(1000);
  browser.runFrame(1000 + FRAME);
  assert.ok(texts(section.recorder).includes(WORDS.bench.parts.medium.en));
  // Any one of the five is enough to build.
  for (const name of CANVASES) {
    const one = setup("en");
    const parts = fakeCanvas(600);
    const by = {};
    by['[data-laser-canvas="' + name + '"]'] = parts.canvas;
    sectionReady(one.browser, "laser", fakeContainer(by), WORDS);
    assert.equal(one.browser.window.LaserUI.loop.liveCount(), 1, name + " alone");
    one.browser.setOnScreen(parts.canvas, true);
    one.browser.runFrame(1000);
    one.browser.runFrame(1000 + FRAME);
    assert.ok(parts.recorder.calls.length > 0, name + " is drawn");
  }
});

test("the pictures' names: their description, else the page title, else hidden from screen readers", () => {
  const { browser } = setup("en");
  const noAlt = JSON.parse(JSON.stringify(WORDS));
  delete noAlt.bench.alt;
  delete noAlt.photons.alt;
  const titled = laserSection(600);
  sectionReady(browser, "laser", titled.container, noAlt);
  for (const name of ["bench", "photons"]) {
    assert.equal(titled.canvases[name].getAttribute("aria-label"), WORDS.page.title.en, name);
    assert.equal(titled.canvases[name].getAttribute("aria-hidden"), null, name);
  }
  assert.equal(titled.canvases.power.getAttribute("aria-label"), WORDS.power.alt.en);

  const bare = laserSection(600);
  bare.canvas.setAttribute("aria-label", "left over");
  sectionReady(browser, "laser", bare.container, {});
  for (const name of CANVASES) {
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
    for (const name of CANVASES) browser.setOnScreen(section.canvases[name], true);
    return { browser: browser, section: section, clock: 1000 };
  })();
  page.browser.runFrame(page.clock);
  runFrames(page, 10);
  assert.equal(page.browser.window.LaserUI.loop.liveCount(), 1);
  // The bench has no names to write, only the mirror's number.
  assert.ok(texts(page.section.recorder).every((text) => text === "5.00" + NB + "%"), texts(page.section.recorder).join(" | "));
  assert.deepEqual(texts(page.section.recorders.photons), [], "no legend to write");
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
