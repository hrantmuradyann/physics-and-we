/* ============================================================================
   page-helpers.js — what the page tests share (page.test.js,
   page-choose.test.js): a fake browser with the real site files loaded,
   a laser section as the router builds it, and recorders around what
   page.js calls. Not a test file itself.
   ========================================================================== */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, ENGINE_FILES, UI_FILES } = require("./helpers.js");
const { createBrowser, fakeCanvas, fakeContainer, fakeElement } = require("./fake-browser.js");

const WORDS = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "laser.json"), "utf8"));
const PARTS = ["backMirror", "outputMirror", "medium", "pump", "transmission", "qSwitch", "widths", "focus", "infrared", "ultraviolet"];
const CANVASES = ["bench", "power", "photons", "atoms", "stability"];
const CONTROLS = ["pump", "coupler", "Rc1", "Rc2", "slowMotion", "absorberT0"];
// The sliders in rows page.js hides: each curved mirror's radius (stage
// 10b), shown only for a curved mirror.
const MIRROR_CONTROLS = ["Rc1", "Rc2"];
// Each mirror's shape buttons (stage 10b).
const MIRRORS = ["mirror1", "mirror2"];
const SHAPES = ["flat", "concave", "convex"];
// The filter's slider (stage 8b), in a row page.js hides while the
// Q-switch is off.
const Q_CONTROLS = ["absorberT0"];
// Every number the page can show, in the layout's order; each bench shows
// some of them (ROWS in page.js, and page-choose.test.js).
const READOUTS = ["pumpThreshold", "currentThreshold", "flashThreshold", "x", "gth", "tau_c",
  "stability", "waist", "mirrorLoss", "thermalLens", "lossNow", "P_out", "giant", "peak", "powerNow", "T_best", "period", "time"];
const CHOICES = ["medium", "pump"];
const UI_WORDS = { labPlay: "Play", labPause: "Pause", labReset: "Reset" };
const NB = "\u00a0";          // the no-break space between a number and its unit
const FRAME = 1000 / 60;      // ms

// Each bench's threshold flash, worked out once per test file. Ruby's
// takes 60 ms (2 s under some deliberate mistakes of the mutation check,
// which then ran out of time), and the page tests choose ruby again and
// again. The key is the whole config, so a config that differs in
// anything is worked out afresh. watch() still records every call.
const thresholdsDone = new Map();

function rememberThresholds(browser) {
  const engine = browser.window.LaserEngine;
  const flashThreshold = engine.bench.flashThreshold;
  browser.window.LaserEngine = Object.assign({}, engine, {
    bench: Object.assign({}, engine.bench, {
      flashThreshold: function (config) {
        const key = JSON.stringify(config);
        if (!thresholdsDone.has(key)) thresholdsDone.set(key, flashThreshold(config));
        return thresholdsDone.get(key);
      }
    })
  });
}

// A fake browser with the site's content.js, the laser engine, UI and
// page.js loaded, in the given language.
function setup(lang, options) {
  const browser = createBrowser(options);
  browser.load("js/content.js");
  for (const file of ENGINE_FILES) browser.load("js/laser/engine/" + file);
  rememberThresholds(browser);
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
  const section = {
    canvases: {}, recorders: {}, boxes: {}, controls: {}, inputs: {}, units: {}, readouts: {}, rows: {}, choose: {}
  };
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
  section.pumpName = fakeElement("label");              // the pump slider's name
  by['[data-laser-name="pump"]'] = section.pumpName;
  section.peakName = fakeElement("span");               // the highest output's name
  by['[data-laser-name="peak"]'] = section.peakName;
  section.sliders = {};                                 // the filter's slider row
  for (const name of Q_CONTROLS.concat(MIRROR_CONTROLS)) {
    section.sliders[name] = fakeElement("div");
    by['[data-laser-slider="' + name + '"]'] = section.sliders[name];
  }
  // Each mirror's shape buttons: section.shapes.mirror1.concave.
  section.shapes = {};
  for (const mirror of MIRRORS) {
    section.shapes[mirror] = {};
    for (const shape of SHAPES) {
      section.shapes[mirror][shape] = fakeElement("button");
      by['[data-laser-mirror="' + mirror + '"] [data-laser-shape="' + shape + '"]'] = section.shapes[mirror][shape];
    }
  }
  // The row under the drawing: Fire (below) and the Q-switch, its On/Off
  // and the word beside it.
  section.under = fakeElement("div");
  by["[data-laser-under]"] = section.under;
  section.switchRow = fakeElement("div");
  by["[data-laser-switch]"] = section.switchRow;
  section.toggle = fakeElement("button");
  by['[data-laser-action="qSwitch"]'] = section.toggle;
  section.switchWord = fakeElement("span");
  by['[data-laser-name="qSwitchState"]'] = section.switchWord;
  section.hint = fakeElement("p");                      // "1 s = 100 µs"
  by['[data-laser-value="slowMotion"]'] = section.hint;
  for (const name of READOUTS) {
    section.readouts[name] = fakeElement("span");
    section.rows[name] = fakeElement("div");            // the readout with its name
    by['[data-laser-readout="' + name + '"]'] = section.readouts[name];
    by['[data-laser-row="' + name + '"]'] = section.rows[name];
  }
  for (const name of CHOICES) {
    section.choose[name] = fakeElement("select");
    by['[data-laser-choose="' + name + '"]'] = section.choose[name];
  }
  // The "Learn more" beside each dropdown (stage 12c), which page.js points
  // at the chosen medium's and pump's sections of the book.
  section.more = {};
  for (const name of CHOICES) {
    section.more[name] = fakeElement("a");
    by['[data-laser-more="' + name + '"]'] = section.more[name];
  }
  section.play = fakeElement("button");
  section.reset = fakeElement("button");
  section.fire = fakeElement("button");
  section.note = fakeElement("p");
  section.note.hidden = true;
  by['[data-laser-action="play"]'] = section.play;
  by['[data-laser-action="reset"]'] = section.reset;
  by['[data-laser-action="fire"]'] = section.fire;
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
//   options.show     the canvases to put on screen (default: all four)
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
//   seen.sims      the simulation every advance() call was given, and
//                  seen.after the one it gave back
//   seen.configs   the config of every derive() call (a slider moved)
//   seen.thresholds  the config of every flashThreshold() call
//   seen.pumpCalls  how many times pumpNow() was called
//   seen.switchCalls  how many times switchNow() was called
//   seen.peaks     the peak of every advance() call ({ t, power })
//   seen.bench     every { labels, light } given to the bench drawing
//   seen.chart     the latest chart given to draw-plots, by its key: { P }
//   seen.charts    how many charts were drawn
//   seen.drives    every { dt, drive } the photon cartoon was stepped with
//   seen.atomDrives  every { dt, drive } the atom picture was stepped with
//   seen.cartoons  every cartoon given to the photon drawing
//   seen.paths     the params of every beamPath() call (the mirrors' rays)
//   seen.pairs     every { words, pair } given to the stability diagram
function watch(browser) {
  const seen = {
    steps: [], sims: [], after: [], configs: [], thresholds: [], pumpCalls: 0, switchCalls: 0, peaks: [],
    bench: [], chart: {}, charts: 0, drives: [], atomDrives: [], cartoons: [], paths: [], pairs: []
  };
  const engineNow = browser.window.LaserEngine;
  const advance = engineNow.bench.advance;
  const derive = engineNow.bench.derive;
  const flashThreshold = engineNow.bench.flashThreshold;
  const pumpNow = engineNow.bench.pumpNow;
  const switchNow = engineNow.bench.switchNow;
  const beamPath = engineNow.bench.beamPath;
  browser.window.LaserEngine = Object.assign({}, engineNow, {
    bench: Object.assign({}, engineNow.bench, {
      advance: function (params) {
        const run = advance(params);
        seen.steps.push(run.steps);
        seen.sims.push(params.sim);
        seen.after.push(run.sim);
        seen.peaks.push(run.peak);
        return run;
      },
      derive: function (config) {
        seen.configs.push(Object.assign({}, config));
        return derive(config);
      },
      flashThreshold: function (config) {
        seen.thresholds.push(Object.assign({}, config));
        return flashThreshold(config);
      },
      pumpNow: function (params) {
        seen.pumpCalls += 1;
        return pumpNow(params);
      },
      switchNow: function (params) {
        seen.switchCalls += 1;
        return switchNow(params);
      },
      beamPath: function (params) {
        seen.paths.push(Object.assign({}, params));
        return beamPath(params);
      }
    })
  });
  const UI = browser.window.LaserUI;
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
  const stability = UI.stability.draw;
  UI.stability = Object.assign({}, UI.stability, {
    draw: function (view, words, pair) {
      seen.pairs.push({ words: Object.assign({}, words), pair: pair });
      return stability(view, words, pair);
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
  const atoms = UI.atoms;
  UI.atoms = Object.assign({}, atoms, {
    create: function (options) {
      const model = atoms.create(options);
      const step = model.step;
      model.step = function (dt, drive) {
        seen.atomDrives.push({ dt: dt, drive: drive });
        return step(dt, drive);
      };
      return model;
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

// Moves a slider and lets it go: "input", then "change", as a browser
// fires them.
function slide(section, name, position) {
  section.controls[name].value = String(position);
  section.controls[name].fire("input");
  section.controls[name].fire("change");
}

// One step of a drag: "input" only (the slider is still held).
function drag(section, name, position) {
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


// Every listener page.js adds to a section's own elements is gone.
function assertNoListeners(section, label) {
  for (const name of CONTROLS) {
    assert.equal(section.controls[name].listenerCount("input"), 0, label + ": slider " + name);
    assert.equal(section.inputs[name].listenerCount("change"), 0, label + ": number box " + name);
  }
  for (const name of CHOICES) {
    assert.equal(section.choose[name].listenerCount("change"), 0, label + ": the " + name + " dropdown");
  }
  for (const name of ["play", "reset", "fire", "toggle"]) {
    assert.equal(section[name].listenerCount("click"), 0, label + ": the " + name + " button");
  }
  for (const mirror of MIRRORS) {
    for (const shape of SHAPES) {
      assert.equal(section.shapes[mirror][shape].listenerCount("click"), 0, label + ": " + mirror + "'s " + shape + " button");
    }
  }
  for (const type of ["pointerdown", "pointermove", "pointerleave"]) {
    assert.equal(section.canvases.power.listenerCount(type), 0, label + ": " + type + " over the chart");
  }
}

// Is the Q-switch's On/Off on?
function switchOn(section) {
  return section.toggle.getAttribute("aria-checked") === "true";
}

// Chooses a bench as a visitor does: the medium, then (if given) the pump
// with the dropdowns, then (if given) the Q-switch: "none" turns it off,
// "absorber" (the filter, the only one the page offers) on. As in a
// browser, picking the option already chosen fires no change.
function choose(section, medium, pump, qSwitch) {
  if (section.choose.medium.value !== medium) {
    section.choose.medium.value = medium;
    section.choose.medium.fire("change");
  }
  if (pump !== undefined && section.choose.pump.value !== pump) {
    section.choose.pump.value = pump;
    section.choose.pump.fire("change");
  }
  if (qSwitch === undefined) return;
  assert.ok(qSwitch === "none" || qSwitch === "absorber", "the page offers only the filter, not " + qSwitch);
  if (switchOn(section) !== (qSwitch === "absorber")) section.toggle.fire("click");
  // The page ignores a click on a hidden switch: a test that asks for the
  // filter on a laser that cannot have it must not go on without it.
  assert.equal(switchOn(section), qSwitch === "absorber",
    "the filter is " + (qSwitch === "absorber" ? "on" : "off") + " after choosing " + medium + " " + pump);
}

// Chooses a bench afresh, with its own settings, even if it is the one
// chosen now: another medium first, then this one. The other is a gas
// laser, whose bench is quick to set up (a flashlamp's threshold flash is
// a search: 60 ms in Node for ruby), and has no Q-switch.
function chooseAfresh(section, medium, pump, qSwitch) {
  choose(section, medium === "he-ne" ? "co2" : "he-ne");
  choose(section, medium, pump, qSwitch);
}

// A dropdown's options: [{ value, text, disabled }], those inside its
// <optgroup>s (the medium's, stage 12c) in order too.
function optionsOf(select) {
  const options = [];
  for (const child of select.children) {
    if (child.tagName === "OPTGROUP") options.push(...child.children);
    else options.push(child);
  }
  return options.map((option) => ({ value: option.value, text: option.textContent, disabled: option.disabled }));
}

// A dropdown's groups: [{ label, values }]; options outside a group are not counted.
function groupsOf(select) {
  return select.children.filter((child) => child.tagName === "OPTGROUP").map((group) => ({
    label: group.getAttribute("label"),
    values: group.children.map((option) => option.value)
  }));
}

// The readouts a section shows now (their rows not hidden), in order.
function shownRows(section) {
  return READOUTS.filter((name) => !section.rows[name].hidden);
}

module.exports = {
  WORDS, PARTS, CANVASES, CONTROLS, Q_CONTROLS, MIRROR_CONTROLS, MIRRORS, SHAPES, READOUTS, CHOICES, UI_WORDS, NB, FRAME,
  setup, laserSection, benchOnlySection, sectionReady, texts, switchTheme, built, watch, last, dearer, sum,
  runFrames, slide, drag, type, engine, assertNoListeners, choose, chooseAfresh, optionsOf, groupsOf, shownRows, switchOn
};
