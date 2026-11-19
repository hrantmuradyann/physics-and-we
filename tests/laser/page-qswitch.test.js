/* ============================================================================
   page-qswitch.test.js — the Q-switch on the page (docs/laser-plan.md,
   stage 8b scope card): the row under the drawing with Fire and the
   filter's On/Off, the filter's slider, its readouts, the highest output
   and the chart's points from the runs' peaks, and what the level picture
   and the bench drawing are given. The page offers one Q-switch, the
   bleachable filter (the engine's "absorber"; the owner's choice).

   Runs the real files, with the real data/laser.json, in the fake browser
   of fake-browser.js; the helpers are in page-helpers.js. The engine's
   Q-switch is tested in bench-qswitch.test.js.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { assertClose } = require("./helpers.js");
const {
  WORDS, Q_CONTROLS, NB, laserSection, sectionReady, built, last, sum, runFrames, slide, drag, type, engine,
  choose, chooseAfresh, shownRows, switchOn
} = require("./page-helpers.js");

function F(page) {
  return page.browser.window.LaserUI.format;
}

function B(page) {
  return engine(page.browser).bench;
}

// The config the page runs now: the last one it derived.
function configNow(page) {
  return last(page.seen.configs);
}

// The bench's config as the engine makes it, with the filter.
function filteredConfig(page, medium, pump) {
  return B(page).withQSwitch({ config: B(page).configFor({ medium, pump }), qSwitch: "absorber" });
}

// A config written with its fields in one order, to compare two configs
// whatever order their fields were set in.
function sorted(config) {
  return JSON.stringify(Object.keys(config).sort().map((name) => [name, config[name]]));
}

// The filter's slider row, if shown now.
function slidersShown(section) {
  return Q_CONTROLS.filter((name) => !section.sliders[name].hidden);
}

/* ---------- the words ---------- */

test("the Q-switch's words are in data/laser.json, in both languages; the cell's and the prism's are gone", () => {
  for (const lang of ["hy", "en"]) {
    for (const name of ["qSwitch", "on", "off"]) assert.ok(WORDS.choose[name][lang].trim(), "choose." + name + "." + lang);
    assert.ok(WORDS.bench.parts.qSwitch[lang].trim(), "bench.parts.qSwitch." + lang);
    assert.ok(WORDS.controls.absorberT0[lang].trim(), "controls.absorberT0." + lang);
    for (const name of ["lossNow", "giant", "peakStart"]) assert.ok(WORDS.readouts[name][lang].trim(), "readouts." + name + "." + lang);
    assert.ok(WORDS.buttons.fire[lang].trim(), "buttons.fire." + lang);
  }
  // The page offers only the filter: no words for a dropdown of kinds, or
  // for the cell's and the prism's sliders and readouts.
  assert.equal(WORDS.qSwitches, undefined);
  assert.equal(WORDS.bench.qSwitches, undefined);
  assert.equal(WORDS.controls.qDelay, undefined);
  assert.equal(WORDS.controls.rotation, undefined);
  assert.equal(WORDS.readouts.opensAt, undefined);
});

/* ---------- under the drawing: Fire and the On/Off switch ---------- */

test("under the drawing: Fire on a flashlamp bench, the filter's On/Off on a bench that can have it; no row with neither", () => {
  const page = built("en", { watch: true });
  const { section } = page;
  // The default bench, Nd:YAG with diodes: the switch, no Fire.
  assert.equal(section.under.hidden, false, "the row");
  assert.equal(section.switchRow.hidden, false, "the switch");
  assert.equal(section.fire.hidden, true, "no flash to fire");
  assert.equal(switchOn(section), false, "off");
  assert.equal(section.switchWord.textContent, WORDS.choose.off.en);
  section.toggle.fire("click");
  assert.equal(switchOn(section), true, "on");
  assert.equal(section.switchWord.textContent, WORDS.choose.on.en);
  assert.equal(configNow(page).qSwitch, "absorber", "the filter");
  section.toggle.fire("click");
  assert.equal(switchOn(section), false, "off again");
  assert.equal(section.switchWord.textContent, WORDS.choose.off.en);
  assert.equal(configNow(page).qSwitch, "none");
  // Ruby: Fire and the switch side by side. On is the filter, not the
  // engine's first switch for ruby (its Pockels cell).
  choose(section, "ruby");
  assert.deepEqual([section.under.hidden, section.fire.hidden, section.switchRow.hidden], [false, false, false], "ruby");
  section.toggle.fire("click");
  assert.equal(configNow(page).qSwitch, "absorber", "ruby's filter");
  // The two-level atom with a flashlamp: Fire, and no switch.
  choose(section, "two-level", "flashlamp");
  assert.deepEqual([section.under.hidden, section.fire.hidden, section.switchRow.hidden], [false, false, true], "two levels");
  assert.equal(configNow(page).qSwitch, "none");
  // Neither: no row at all, and a stray click on the hidden switch changes nothing.
  for (const [medium, pump] of [["he-ne", "discharge"], ["dye-r6g", "laser"], ["two-level", "laser"]]) {
    choose(section, medium, pump);
    assert.equal(section.under.hidden, true, medium + " " + pump + ": no row");
    assert.equal(section.switchRow.hidden, true, medium + ": no switch");
    section.toggle.fire("click");
    assert.equal(configNow(page).qSwitch, "none", medium + ": a click");
    assert.equal(switchOn(section), false, medium + ": still off");
  }
  // In Armenian.
  const hy = built("hy");
  assert.equal(hy.section.switchWord.textContent, WORDS.choose.off.hy);
  hy.section.toggle.fire("click");
  assert.equal(hy.section.switchWord.textContent, WORDS.choose.on.hy);
});

test("Fire, under the drawing, fires the flash", () => {
  const page = built("en", { watch: true });
  const { section, seen } = page;
  choose(section, "ruby");
  section.play.fire("click");                         // paused: Fire plays
  assert.equal(section.play.textContent, "Play");
  section.fire.fire("click");
  assert.equal(section.play.textContent, "Pause", "a paused page plays");
  runFrames(page, 3);
  assert.ok(seen.sims.length > 0, "it runs");
  assert.notEqual(last(seen.sims).flash, null, "the flash runs");
});

test("Fire asks to be pressed while the lamp is dark: before the first flash, and again once the flash has faded", () => {
  const page = built("en", { watch: true, show: ["bench"] });
  const { section, seen, browser } = page;
  const ready = () => section.fire.getAttribute("data-ready");
  assert.equal(ready(), "false", "the diode bench has no lamp");
  choose(section, "ruby", "flashlamp");
  assert.equal(ready(), "true", "a dark lamp, before the first flash");
  // A flash under threshold (no laser: few solver steps), at the fastest
  // slow motion, 1 s = 1 ms.
  type(section, "pump", "100");
  type(section, "slowMotion", "1000");
  // Written only when it changes, not on every readout.
  let writes = 0;
  const setAttribute = section.fire.setAttribute;
  section.fire.setAttribute = function (name, value) {
    if (name === "data-ready") writes += 1;
    return setAttribute.call(this, name, value);
  };
  section.fire.fire("click");
  assert.equal(ready(), "false", "fired: it waits, though the lamp has not lit yet");
  page.clock = 1000;
  browser.runFrame(page.clock);
  const config = configNow(page);
  const tp = config.flashTime;
  let readyAt = null;
  for (let frame = 0; frame < 600 && readyAt === null; frame++) {
    runFrames(page, 1);
    const sim = last(seen.after);
    if (ready() === "true") readyAt = sim;
    else assert.equal(ready(), "false");
  }
  assert.ok(readyAt !== null, "ready again within 10 ms of simulated time");
  // It waited through the flash's peak, and until the lamp was drawn off.
  const fired = readyAt.flash;
  assert.ok(readyAt.t > fired.at + tp, "past the flash's peak");
  const level = B(page).pumpNow({ sim: readyAt, config }).x;
  const glow = Math.min(1, level / 4);
  assert.ok(glow < browser.window.LaserUI.bench.PUMP_OFF, "the lamp drawn off: " + glow);
  // Readouts are written every 0.1 s, so it turned within one of them.
  const before = B(page).pumpNow({ sim: Object.assign({}, readyAt, { t: readyAt.t - 0.1e-3 }), config }).x;
  assert.ok(Math.min(1, before / 4) >= browser.window.LaserUI.bench.PUMP_OFF * 0.5, "not long after it went dark");
  assert.equal(writes, 2, "false at Fire, true at the end");
  // Not on another bench: a gas laser has no lamp.
  choose(section, "he-ne", "discharge");
  assert.equal(ready(), "false");
});

test("turning the filter on or off keeps the run: the chart, the moment, the flash, the highest output, the settings", () => {
  const page = built("en", { watch: true });
  const { section, seen, browser } = page;
  choose(section, "ruby");
  slide(section, "pump", 500);                       // 1500 J
  slide(section, "coupler", 300);
  slide(section, "slowMotion", 400);
  const before = Object.assign({}, configNow(page));
  page.clock = 1000;
  browser.runFrame(page.clock);
  section.fire.fire("click");
  runFrames(page, 20);
  section.play.fire("click");                        // paused
  const sim = last(seen.after);
  const points = seen.chart.P.points.length;
  const peak = section.readouts.peak.textContent;
  const thresholds = seen.thresholds.length;
  section.toggle.fire("click");                      // on
  const config = configNow(page);
  assert.equal(sorted(config), sorted(B(page).withQSwitch({ config: before, qSwitch: "absorber" })),
    "the same bench with the filter");
  assert.equal(section.controls.slowMotion.value, "400", "the slow motion kept");
  assert.equal(section.play.textContent, "Play", "still paused");
  assert.equal(section.readouts.peak.textContent, peak, "the highest output kept");
  // The threshold flash is found again: the filter moves it.
  assert.equal(seen.thresholds.length, thresholds + 1, "the threshold flash, again");
  assert.equal(last(seen.thresholds).qSwitch, "absorber");
  const behind = B(page).flashThreshold(config);
  assert.ok(behind > B(page).flashThreshold(before), "a filter needs a bigger flash");
  // The run goes on from the same moment, its flash kept; the filter dark.
  const runs = seen.sims.length;
  section.play.fire("click");
  runFrames(page, 2);
  const going = seen.sims[runs];
  assert.equal(going.t, sim.t, "from the same moment");
  assert.equal(going.N, sim.N);
  assert.equal(going.lnPhi, sim.lnPhi);
  assert.deepEqual(going.flash, sim.flash, "the flash goes on");
  assert.equal(going.absorber, 1, "a filter turned on is dark");
  assert.ok(seen.chart.P.points.length > points, "the chart goes on, not emptied");
  assert.equal(seen.chart.P.points[0].t, 0, "from the start of the run");
  // Off: the bench's own config without the filter, and still the same run.
  const t = last(seen.after).t;
  section.toggle.fire("click");
  assert.equal(sorted(configNow(page)), sorted(before));
  const offRuns = seen.sims.length;
  runFrames(page, 1);
  assert.equal(seen.sims[offRuns].t, t, "the run goes on");
  assert.equal(seen.sims[offRuns].absorber, null);
  assert.equal(seen.chart.P.points[0].t, 0, "the same chart");
});

test("a new medium or pump keeps the filter on if the new bench can have it, else turns it off", () => {
  const page = built("en", { watch: true });
  const { section } = page;
  choose(section, "ruby", "flashlamp", "absorber");
  choose(section, "nd-glass");
  assert.equal(configNow(page).qSwitch, "absorber", "Nd:glass has a filter too");
  assert.equal(sorted(configNow(page)), sorted(filteredConfig(page, "nd-glass", "flashlamp")),
    "with Nd:glass's own setup (its own filter)");
  assert.equal(switchOn(section), true);
  choose(section, "nd-yag", "flashlamp");
  assert.equal(configNow(page).qSwitch, "absorber");
  choose(section, "nd-yag", "diode");
  assert.equal(configNow(page).qSwitch, "absorber", "the diodes too");
  choose(section, "he-ne");
  assert.equal(configNow(page).qSwitch, "none");
  assert.equal(switchOn(section), false, "off");
  choose(section, "ruby");
  assert.equal(configNow(page).qSwitch, "none", "off stays off");
});

/* ---------- the filter's slider ---------- */

test("the filter's slider: shown only while the filter is on, ranged by the engine, in %", () => {
  const page = built("en", { watch: true });
  const { section } = page;
  assert.deepEqual(slidersShown(section), [], "off: no slider");
  for (const [medium, pump] of [["ruby", "flashlamp"], ["nd-yag", "diode"]]) {
    choose(section, medium, pump, "absorber");
    assert.deepEqual(slidersShown(section), ["absorberT0"], medium);
    const config = configNow(page);
    const range = B(page).controls(config).absorberT0;
    assert.equal(section.units.absorberT0.textContent, "%");
    const position = Math.round(1000 * F(page).toSlider(range, config.absorberT0));
    assert.equal(section.controls.absorberT0.value, String(position), medium);
    assert.equal(section.inputs.absorberT0.value, F(page).plain(100 * config.absorberT0, 6), medium + "'s box");
    choose(section, medium, pump, "none");
    assert.deepEqual(slidersShown(section), [], medium + " off");
  }
  choose(section, "nd-yag", "diode", "absorber");
  assert.equal(section.inputs.absorberT0.value, "95");
});

test("the filter's slider and box set its transmission", () => {
  const page = built("en", { watch: true });
  const { section } = page;
  choose(section, "ruby", "flashlamp", "absorber");
  type(section, "absorberT0", "70");                  // in %
  assertClose(configNow(page).absorberT0, 0.7, 1e-12);
  type(section, "absorberT0", "72,5");                // a decimal comma
  assertClose(configNow(page).absorberT0, 0.725, 1e-12);
  slide(section, "absorberT0", 0);
  assertClose(configNow(page).absorberT0, 0.2, 1e-12);
  type(section, "absorberT0", "abc");                 // no number: the old value back
  assert.equal(section.inputs.absorberT0.value, "20");
  type(section, "absorberT0", "150");                 // held inside the range
  assertClose(configNow(page).absorberT0, 0.99, 1e-12);
  // Off, a stray event on the hidden slider changes nothing.
  choose(section, "ruby", "flashlamp", "none");
  const config = JSON.stringify(configNow(page));
  slide(section, "absorberT0", 500);
  type(section, "absorberT0", "50");
  assert.equal(JSON.stringify(configNow(page)), config);
});

test("the filter's transmission is kept on each bench: off and on again, or to another laser and back", () => {
  const page = built("en", { watch: true });
  const { section } = page;
  choose(section, "nd-yag", "diode", "absorber");
  type(section, "absorberT0", "70");
  assertClose(configNow(page).absorberT0, 0.7, 1e-12);
  const threshold = section.readouts.pumpThreshold.textContent;
  const d = B(page).derive(configNow(page));
  assert.ok(d.pumpThreshold < B(page).controls(configNow(page)).pump.max, "within the slider's reach");
  assert.equal(threshold, F(page).si(d.pumpThreshold, "W"));
  choose(section, "nd-yag", "diode", "none");
  choose(section, "nd-yag", "diode", "absorber");
  assertClose(configNow(page).absorberT0, 0.7, 1e-12, "off and on again");
  assert.equal(section.inputs.absorberT0.value, "70");
  assert.equal(section.readouts.pumpThreshold.textContent, threshold, "the threshold of the filter kept");
  // Another laser with the filter (it stays on) has its own; back on the
  // diodes, theirs.
  choose(section, "ruby", "flashlamp");
  assert.equal(configNow(page).qSwitch, "absorber");
  assert.equal(configNow(page).absorberT0, filteredConfig(page, "ruby", "flashlamp").absorberT0, "ruby's own");
  type(section, "absorberT0", "60");
  choose(section, "nd-yag", "diode");
  assertClose(configNow(page).absorberT0, 0.7, 1e-12, "back on the diodes");
  choose(section, "ruby", "flashlamp");
  assertClose(configNow(page).absorberT0, 0.6, 1e-12, "back on ruby");
  // A bench whose filter was never set has the engine's.
  choose(section, "nd-glass", "flashlamp");
  assert.equal(configNow(page).absorberT0, filteredConfig(page, "nd-glass", "flashlamp").absorberT0);
});

test("dragging the filter's transmission waits for the threshold flash until the slider is let go", () => {
  const page = built("en", { watch: true });
  const { section, seen } = page;
  choose(section, "ruby", "flashlamp", "absorber");
  const searches = seen.thresholds.length;
  drag(section, "absorberT0", 900);
  drag(section, "absorberT0", 950);
  assert.equal(seen.thresholds.length, searches, "not during the drag");
  assert.equal(section.readouts.flashThreshold.textContent, "…");
  slide(section, "absorberT0", 950);
  assert.equal(seen.thresholds.length, searches + 1, "once, when let go");
  assert.equal(section.readouts.flashThreshold.textContent, F(page).si(B(page).flashThreshold(configNow(page)), "J"));
  // The flash's energy does not move it (the line above asked once more).
  const asked = seen.thresholds.length;
  slide(section, "pump", 300);
  assert.equal(seen.thresholds.length, asked);
});

/* ---------- the readouts ---------- */

const FLASH_ROWS = ["flashThreshold", "x", "gth", "tau_c", "peak", "powerNow", "time"];

test("the readouts with the filter: the loss now and §4.3's pulse; on the diode bench it pulses", () => {
  const page = built("en");
  const { section } = page;
  const order = (names) => shownRows(section).filter((name) => names.includes(name));
  choose(section, "ruby", "flashlamp", "absorber");
  assert.deepEqual(shownRows(section), order(FLASH_ROWS.concat(["lossNow", "giant"])), "ruby");
  assert.equal(section.peakName.textContent, WORDS.readouts.peak.en);
  choose(section, "ruby", "flashlamp", "none");
  assert.deepEqual(shownRows(section), order(FLASH_ROWS), "off");
  choose(section, "nd-yag", "diode", "absorber");
  assert.deepEqual(shownRows(section), ["pumpThreshold", "x", "gth", "tau_c", "lossNow", "giant", "peak", "powerNow", "time"],
    "the filter's train: no steady numbers, the highest output instead");
  assert.equal(section.peakName.textContent, WORDS.readouts.peakStart.en, "since the start");
  choose(section, "nd-yag", "diode", "none");
  assert.deepEqual(shownRows(section), ["pumpThreshold", "x", "gth", "tau_c", "P_out", "powerNow", "T_best", "period", "time"]);
  choose(section, "nd-yag", "flashlamp");
  assert.equal(section.peakName.textContent, WORDS.readouts.peak.en, "a flash bench names it after the flash");
});

test("a threshold past the pump slider's top, a flash or a pump power, reads as never reached", () => {
  const page = built("en", { watch: true });
  const { section } = page;
  choose(section, "nd-glass", "flashlamp", "absorber");
  slide(section, "absorberT0", 0);                    // 20 %: the darkest filter
  const config = configNow(page);
  const behind = B(page).flashThreshold(config);
  assert.ok(behind > B(page).controls(config).pump.max, "383 J against a 300 J slider: " + behind);
  assert.equal(section.readouts.flashThreshold.textContent, WORDS.readouts.never.en);
  slide(section, "absorberT0", 1000);                 // 99 %: within reach again
  assert.equal(section.readouts.flashThreshold.textContent, F(page).si(B(page).flashThreshold(configNow(page)), "J"));
  // The diodes behind the darkest filter: 69.8 W on a 20 W slider.
  choose(section, "nd-yag", "diode", "absorber");
  slide(section, "absorberT0", 0);
  const dark = configNow(page);
  assert.ok(B(page).derive(dark).pumpThreshold > B(page).controls(dark).pump.max, "past the slider");
  assert.equal(section.readouts.pumpThreshold.textContent, WORDS.readouts.never.en);
  slide(section, "absorberT0", 1000);
  const light = configNow(page);
  assert.ok(B(page).derive(light).pumpThreshold < B(page).controls(light).pump.max);
  assert.equal(section.readouts.pumpThreshold.textContent, F(page).si(B(page).derive(light).pumpThreshold, "W"));
});

test("the threshold and the pump over it are the closed filter's on the diode bench", () => {
  const page = built("en", { watch: true });
  const { section, seen } = page;
  choose(section, "nd-yag", "diode", "absorber");
  const d = B(page).derive(configNow(page));
  assert.equal(section.readouts.pumpThreshold.textContent, F(page).si(d.pumpThreshold, "W"), "the closed filter's");
  runFrames(page, 2);
  section.play.fire("click");
  const now = B(page).pumpNow({ sim: last(seen.after), config: configNow(page) });
  assert.equal(section.readouts.x.textContent, F(page).number(now.overThreshold));
  assertClose(now.overThreshold, configNow(page).pumpPower / d.pumpThreshold, 1e-12);
});

test("the loss now and §4.3's pulse, as the filter holds the light back and bleaches", () => {
  const page = built("en", { watch: true, show: ["bench"] });
  const { section, browser, seen } = page;
  choose(section, "nd-yag", "diode", "absorber");
  const config = configNow(page);
  const d = B(page).derive(config);
  assert.equal(section.readouts.lossNow.textContent, F(page).number(d.lossClosed) + NB + "×", "dark");
  assert.equal(section.readouts.giant.textContent, "—", "no inversion yet");
  page.clock = 1000;
  browser.runFrame(page.clock);
  runFrames(page, 2);
  // Over the open cavity's threshold, under the dark filter's: the
  // prediction is written as the run goes.
  while (last(seen.after).t < 100e-6) runFrames(page, 10);
  assert.notEqual(section.readouts.giant.textContent, "—", "the prediction, live");
  section.play.fire("click");                         // paused: every readout written
  const sim = last(seen.after);
  const pulse = B(page).giantPulse({ sim, config });
  assert.ok(pulse !== null, "above the open threshold behind the dark filter");
  assert.equal(section.readouts.giant.textContent,
    F(page).si(pulse.energy, "J") + " · " + F(page).si(pulse.peakPower, "W") + " · " + F(page).si(pulse.width, "s"));
  assert.equal(section.readouts.lossNow.textContent, F(page).number(B(page).switchNow({ sim, config }).loss) + NB + "×");
  // On through the first pulse: the filter bleaches, drawn lighter.
  section.play.fire("click");
  while (last(seen.after).t < 400e-6) runFrames(page, 10);
  const drawn = seen.bench.filter((entry) => entry.light.qSwitch !== null);
  assert.ok(drawn.length > 0, "the filter drawn");
  const opened = Math.max(...drawn.map((entry) => entry.light.qSwitch.open));
  assert.ok(opened > 0.5, "bleached in the pulse: " + opened);
  const top = Math.max(...seen.peaks.map((peak) => peak.power));
  assert.ok(top > 1000, "a giant pulse: " + top + " W");
});

test("§4.3's pulse is shown only from 1 % over the open threshold, where the engine gives one: just above it, the formula's pulse lasts for ever", () => {
  // The run is made to end at a chosen inversion (N), so the readout can
  // be checked on either side of the cutoff.
  let forced = null;
  let ended = null;
  const page = built("en", {
    watch: true,
    prepare(browser) {
      const real = browser.window.LaserEngine;
      const advance = real.bench.advance;
      browser.window.LaserEngine = Object.assign({}, real, {
        bench: Object.assign({}, real.bench, {
          advance(params) {
            const run = advance(params);
            if (forced === null) return run;
            ended = Object.assign({}, run.sim, { N: forced });
            return Object.assign({}, run, { sim: ended });
          }
        })
      });
    }
  });
  const { section } = page;
  choose(section, "nd-yag", "diode", "absorber");
  const config = configNow(page);
  const N_c = B(page).derive(config).N_c;
  for (const [x, shown] of [[1.005, false], [1.02, true], [1.0000001, false], [3, true]]) {
    forced = x * N_c;
    runFrames(page, 3);
    section.play.fire("click");                       // paused: every readout written
    // The engine predicts no pulse below 1 % over threshold (bench.js,
    // PULSE_FROM), and the page shows its "—".
    const pulse = B(page).giantPulse({ sim: ended, config });
    assert.equal(pulse !== null, shown, "the engine's pulse at x = " + x);
    const text = shown
      ? F(page).si(pulse.energy, "J") + " · " + F(page).si(pulse.peakPower, "W") + " · " + F(page).si(pulse.width, "s")
      : "—";
    assert.equal(section.readouts.giant.textContent, text, "x = " + x);
    section.play.fire("click");
  }
});

/* ---------- the highest output and the chart ---------- */

test("the chart adds each run's peak that lies inside it, so a pulse between two points shows at its top", () => {
  const page = built("en", { watch: true, show: ["power"] });
  const { section, browser, seen } = page;
  choose(section, "nd-yag", "diode", "absorber");    // a train of pulses, 300 µs apart
  page.clock = 1000;
  browser.runFrame(page.clock);
  // A train of pulses has no steady output to draw a line at.
  assert.deepEqual(Array.from(seen.chart.P.lines), [], "no steady line");
  const firstRun = seen.sims.length;
  runFrames(page, 360);                               // 6 s of screen time at 10⁴: 600 µs
  const points = seen.chart.P.points;
  // In order, and no time twice: a peak at a run's start or end is a point already.
  for (let i = 1; i < points.length; i++) assert.ok(points[i].t > points[i - 1].t, "times in order, each once");
  const ends = new Set(seen.after.map((sim) => sim.t));
  let inside = 0;
  for (let i = firstRun; i < seen.sims.length; i++) {
    const peak = seen.peaks[i];
    const strictly = peak.t > seen.sims[i].t && peak.t < seen.after[i].t;
    const there = points.some((p) => p.t === peak.t && p.P === peak.power);
    if (strictly && points[0].t <= peak.t) {
      assert.ok(there, "run " + i + ": its peak inside it is a point");
      inside += 1;
    }
  }
  assert.ok(inside > 0, "some peaks fell inside the runs");
  // Every point is a run's end or a peak inside a run.
  const peaks = new Set(seen.peaks.map((peak) => peak.t));
  for (const p of points) {
    if (p.t > 0) assert.ok(ends.has(p.t) || peaks.has(p.t), "a point at " + p.t);     // t = 0: the start
  }
  // The pulse's top is on the chart: the highest point is the highest peak.
  const shown = points.filter((p) => p.t >= points[0].t);
  const top = Math.max(...shown.map((p) => p.P));
  const peakTop = Math.max(...seen.peaks.slice(firstRun).filter((peak) => peak.t >= points[0].t).map((peak) => peak.power));
  assert.equal(top, peakTop);
  assert.ok(top > 1000, "a pulse of kilowatts: " + top + " W");
  // The highest output since the start is the runs' top.
  section.play.fire("click");
  assert.equal(section.readouts.peak.textContent, F(page).si(Math.max(...seen.peaks.slice(firstRun).map((p) => p.power)), "W"));
  // Reset starts it again from the output now.
  section.reset.fire("click");
  const d = B(page).derive(configNow(page));
  assert.equal(section.readouts.peak.textContent, F(page).si(d.powerPerPhoton, "W"), "one photon");
});

/* ---------- the pictures ---------- */

test("the level picture gets the loss now; without a switch it is 1", () => {
  const page = built("en", { watch: true });
  const { section, seen } = page;
  runFrames(page, 2);
  assert.equal(last(seen.levels).loss, 1);
  choose(section, "nd-yag", "diode", "absorber");
  runFrames(page, 2);
  const config = configNow(page);
  const picture = last(seen.levels);
  assert.equal(picture.lossTop, undefined, "the closed switch's loss is not on the scale");
  const sim = last(seen.after);
  assertClose(picture.loss, B(page).switchNow({ sim, config }).loss, 1e-12, "the loss now");
});

test("the bench gets the filter now and its name, in the visitor's language", () => {
  for (const lang of ["en", "hy"]) {
    const page = built(lang, { watch: true });
    const { section, seen } = page;
    runFrames(page, 1);
    assert.equal(last(seen.bench).light.qSwitch, null, "no switch");
    choose(section, "nd-yag", "flashlamp", "absorber");
    runFrames(page, 1);
    const entry = last(seen.bench);
    const now = B(page).switchNow({ sim: last(seen.after), config: configNow(page) });
    assert.equal(JSON.stringify(entry.light.qSwitch), JSON.stringify({ kind: "absorber", open: now.open }), lang);
    assert.equal(entry.labels.qSwitch, WORDS.bench.parts.qSwitch[lang], lang + ": its name");
    choose(section, "nd-yag", "flashlamp", "none");
    runFrames(page, 1);
    assert.equal(last(seen.bench).light.qSwitch, null, lang + ": off");
  }
});

test("the filter now is asked of the engine about once a frame, not by every picture", () => {
  const page = built("en", { watch: true });
  const { section, seen } = page;
  choose(section, "ruby", "flashlamp", "absorber");
  section.fire.fire("click");
  const before = seen.switchCalls;
  runFrames(page, 30);
  assert.ok(seen.switchCalls - before <= 32, "30 frames: " + (seen.switchCalls - before) + " calls");
  // The first frame after a (re)start only draws (dt = 0): the filter
  // Fire's readouts asked about is still the same.
  assert.ok(seen.switchCalls - before >= 29, "but every frame that moved: " + (seen.switchCalls - before));
});

test("a language switch keeps the filter, its slider and the moment", () => {
  const page = built("en", { watch: true });
  const { browser, section, seen } = page;
  choose(section, "ruby", "flashlamp", "absorber");
  slide(section, "absorberT0", 200);
  section.fire.fire("click");
  runFrames(page, 10);
  const config = JSON.stringify(configNow(page));
  const t = last(seen.after).t;
  browser.window.Site.lang = "hy";
  const again = laserSection(600);
  sectionReady(browser, "laser", again.container, WORDS);
  assert.equal(switchOn(again), true, "still on");
  assert.equal(again.switchWord.textContent, WORDS.choose.on.hy);
  assert.equal(again.controls.absorberT0.value, "200");
  assert.deepEqual(slidersShown(again), ["absorberT0"]);
  assert.equal(again.fire.hidden, false, "Fire");
  assert.equal(again.under.hidden, false);
  assert.equal(JSON.stringify(configNow(page)), config);
  assert.equal(again.readouts.time.textContent, F(page).si(t, "s"), "the same moment");
});

/* ---------- the cost ---------- */

test("every bench with the filter through a whole flash (or 600 µs of its diodes) within its frame's steps; never behind", () => {
  // At the starting slow motion (10⁴), only the bench on screen: 720
  // frames (1.2 ms) after Fire, 360 frames (600 µs) for the diodes. The
  // most steps a 60 Hz frame took (measured in stage 8b) and the pulse's
  // top, which is stage 8a's measured pulse (bench-qswitch.test.js): the
  // page's highest output is the engine's. The bounds are 1.5× the worst
  // frame, at most the frame's 1500. Ruby's dye filter (22 ps recovery)
  // runs out of steps in 2 frames of its pulse: too few for the note,
  // which needs a quarter of a second's frames. (Stage 10a: Nd:glass's
  // flat mirrors lose 7.9×10⁻⁴ per pass, §7.7; its pulse was 2.825×10⁷ W.)
  const cases = [
    ["ruby", "flashlamp", 1500, 2.097e8], ["nd-glass", "flashlamp", 955, 2.816e7],
    ["nd-yag", "flashlamp", 871, 7.275e6], ["nd-yag", "diode", 562, 2.573e3]
  ];
  const page = built("en", { watch: true, show: ["bench"] });
  const { browser, section, seen } = page;
  page.clock = 1000;
  browser.runFrame(page.clock);
  for (const [medium, pump, measured, pulse] of cases) {
    chooseAfresh(section, medium, pump, "absorber");
    if (pump === "flashlamp") section.fire.fire("click");
    const first = seen.steps.length;
    let worst = 0;
    const frames = pump === "flashlamp" ? 720 : 360;
    for (let frame = 0; frame < frames; frame++) {
      const before = seen.steps.length;
      runFrames(page, 1);
      worst = Math.max(worst, sum(seen.steps.slice(before)));
    }
    const name = medium + " " + pump;
    assert.ok(worst <= Math.min(1500, Math.ceil(1.5 * measured)), name + ": " + worst + " steps in a frame");
    assert.equal(section.note.hidden, true, name + ": never behind");
    const top = Math.max(...seen.peaks.slice(first).map((peak) => peak.power));
    assertClose(top, pulse, 1e-3, name + ": the pulse's top");
    section.play.fire("click");
    assert.equal(section.readouts.peak.textContent, F(page).si(top, "W"), name + ": the highest output");
    section.play.fire("click");
  }
});
