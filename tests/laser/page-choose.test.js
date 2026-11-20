/* ============================================================================
   page-choose.test.js — choosing the laser on the page (docs/laser-plan.md,
   stage 7c scope card): the medium and pump dropdowns, the controls of
   each bench (the pump slider's field, range and unit; the coupler; the
   slow motion each bench starts at), Fire, the readouts each kind of pump
   shows, and what each bench costs a frame.

   Runs the real files, with the real data/laser.json, in the fake browser
   of fake-browser.js; the helpers are in page-helpers.js. The default
   bench (Nd:YAG with diodes) is tested in page.test.js.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { assertClose, plain, loadEngine } = require("./helpers.js");
const {
  WORDS, READOUTS, NB, setup, laserSection, sectionReady, built, last, sum, runFrames, slide, drag, type, engine,
  assertNoListeners, choose, chooseAfresh, optionsOf, shownRows
} = require("./page-helpers.js");

// Every bench, in the dropdowns' order, with the slow motion it starts at
// (the scope card's table: one second on screen shows the part of the run
// worth watching).
const BENCHES = [
  ["ruby", "flashlamp", 1e4],
  ["nd-glass", "flashlamp", 1e4],
  ["nd-yag", "diode", 1e4],
  ["nd-yag", "flashlamp", 1e4],
  ["he-ne", "discharge", 1e6],
  ["ar-ion", "discharge", 1e7],
  ["co2", "discharge", 1e4],
  ["dye-r6g", "laser", 1e7],
  ["ti-sapphire", "laser", 1e6],
  ["two-level", "laser", 1e3],
  ["two-level", "flashlamp", 1e4]
];

// The numbers each kind of bench shows, in the layout's order.
const STEADY_ROWS = ["pumpThreshold", "x", "gth", "tau_c", "stability", "waist", "mirrorLoss", "P_out", "powerNow", "T_best", "period", "time"];
const DISCHARGE_ROWS = ["currentThreshold", "x", "gth", "tau_c", "stability", "waist", "mirrorLoss", "P_out", "powerNow", "T_best", "period", "time"];
const FLASH_ROWS = ["flashThreshold", "x", "gth", "tau_c", "stability", "waist", "mirrorLoss", "peak", "powerNow", "time"];
const TWO_LEVEL_LIGHT_ROWS = ["pumpThreshold", "gth", "tau_c", "stability", "waist", "mirrorLoss", "P_out", "powerNow", "time"];
const TWO_LEVEL_FLASH_ROWS = ["flashThreshold", "gth", "tau_c", "stability", "waist", "mirrorLoss", "peak", "powerNow", "time"];
const PUMP_KINDS = ["diode", "laser", "flashlamp", "discharge"];

function F(page) {
  return page.browser.window.LaserUI.format;
}

/* ---------- the words ---------- */

test("the words of the dropdowns, the pump sliders, Fire and the new readouts are in data/laser.json, in both languages", () => {
  const { browser } = setup("en");
  for (const lang of ["hy", "en"]) {
    for (const id of browser.window.LaserEngine.media.list()) {
      assert.ok(WORDS.media[id][lang].trim(), "media." + id + "." + lang);
    }
    for (const kind of PUMP_KINDS) {
      assert.ok(WORDS.pumps[kind][lang].trim(), "pumps." + kind + "." + lang);
      assert.ok(WORDS.controls.pump[kind][lang].trim(), "controls.pump." + kind + "." + lang);
    }
    for (const name of ["medium", "pump", "later"]) assert.ok(WORDS.choose[name][lang].trim(), "choose." + name + "." + lang);
    for (const name of READOUTS.concat(["never"])) assert.ok(WORDS.readouts[name][lang].trim(), "readouts." + name + "." + lang);
    assert.ok(WORDS.buttons.fire[lang].trim(), "buttons.fire." + lang);
  }
  // The inversion chart is gone (stage 7c), and its words with it.
  assert.equal(WORDS.inversion, undefined);
});

/* ---------- the dropdowns ---------- */

test("the medium dropdown: every medium in the engine's order, named in the visitor's language; those not built yet are 'coming later'", () => {
  for (const lang of ["hy", "en"]) {
    const page = built(lang, { reducedMotion: true });
    const B = engine(page.browser).bench;
    const ids = Array.from(engine(page.browser).media.list());
    assert.deepEqual(ids, ["ruby", "nd-glass", "nd-yag", "caf2-dy", "he-ne", "ar-ion", "co2", "diode", "dye-r6g",
      "ti-sapphire", "two-level"]);
    const expected = ids.map((id) => {
      const later = B.pumpsFor(id).length === 0;
      return {
        value: id,
        text: WORDS.media[id][lang] + (later ? " (" + WORDS.choose.later[lang] + ")" : ""),
        disabled: later
      };
    });
    assert.deepEqual(optionsOf(page.section.choose.medium), expected, lang);
    assert.deepEqual(expected.filter((option) => option.disabled).map((option) => option.value), ["caf2-dy", "diode"]);
    assert.equal(page.section.choose.medium.value, "nd-yag", "the default bench");
  }
});

test("the pump dropdown: the chosen medium's pumps, named; it follows the medium", () => {
  const page = built("en", { reducedMotion: true });
  const { section } = page;
  const names = (kinds) => kinds.map((kind) => ({ value: kind, text: WORDS.pumps[kind].en, disabled: false }));
  assert.deepEqual(optionsOf(section.choose.pump), names(["diode", "flashlamp"]));
  assert.equal(section.choose.pump.value, "diode");
  choose(section, "ruby");
  assert.deepEqual(optionsOf(section.choose.pump), names(["flashlamp"]));
  assert.equal(section.choose.pump.value, "flashlamp");
  choose(section, "he-ne");
  assert.deepEqual(optionsOf(section.choose.pump), names(["discharge"]));
  choose(section, "two-level");
  assert.deepEqual(optionsOf(section.choose.pump), names(["laser", "flashlamp"]));
  assert.equal(section.choose.pump.value, "laser");
  // The options are made again, not added to the old ones.
  choose(section, "nd-yag");
  assert.equal(section.choose.pump.children.length, 2);
});

test("choosing a medium gives its setup: a new config, a fresh simulation, an empty chart, a new cartoon; Play/Pause is kept", () => {
  const page = built("en", { watch: true });
  const { browser, section, seen } = page;
  const B = engine(browser).bench;
  page.clock = 1000;
  browser.runFrame(page.clock);
  runFrames(page, 30);
  const oldCartoon = last(seen.cartoons);
  choose(section, "ruby");
  // The config is configFor's: the next simulated piece runs on it.
  assert.equal(section.play.textContent, "Pause", "still running");
  runFrames(page, 2);
  const config = B.configFor({ medium: "ruby", pump: "flashlamp" });
  assert.deepEqual(plain(last(seen.configs)), plain(config));
  assert.equal(last(seen.sims).flash, null, "no flash on a new bench");
  assert.equal(last(seen.sims).N, -engine(browser).media.get("ruby").N_t, "every ion down");
  // A new simulation: its time started again, and the chart holds nothing
  // from the old run.
  const chart = seen.chart.P;
  assert.ok(chart.tNow > 0 && chart.tNow < 2 * (1 / 60) / 1e4 * 1.01, "two frames since the choice: " + chart.tNow);
  assert.equal(chart.points[0].t, 0);
  assert.notEqual(last(seen.cartoons), oldCartoon, "a new cartoon");
  // Paused stays paused.
  section.play.fire("click");
  choose(section, "co2");
  assert.equal(section.play.textContent, "Play");
  assert.equal(browser.pendingFrames(), 0);
  assert.equal(section.readouts.time.textContent, "0" + NB + "s");
});

test("choosing a medium keeps the pump if the new medium has it, else takes its first", () => {
  const page = built("en", { reducedMotion: true, watch: true });
  const { section, seen } = page;
  choose(section, "nd-yag", "flashlamp");
  choose(section, "two-level");
  assert.equal(section.choose.pump.value, "flashlamp", "the two-level atom has a flashlamp too");
  assert.equal(last(seen.configs).pump, "flashlamp");
  choose(section, "dye-r6g");
  assert.equal(section.choose.pump.value, "laser");
  choose(section, "two-level");
  assert.equal(section.choose.pump.value, "laser");
  assert.equal(last(seen.configs).medium, "two-level");
  assert.equal(last(seen.configs).pump, "laser");
});

test("choosing a pump gives that setup of the medium", () => {
  const page = built("en", { reducedMotion: true, watch: true });
  const { browser, section, seen } = page;
  choose(section, "nd-yag", "flashlamp");
  assert.deepEqual(plain(last(seen.configs)), plain(engine(browser).bench.configFor({ medium: "nd-yag", pump: "flashlamp" })));
  assert.equal(section.choose.medium.value, "nd-yag");
  assert.equal(section.inputs.pump.value, "10");
  assert.equal(section.units.pump.textContent, "J");
  choose(section, "nd-yag", "diode");
  assert.deepEqual(plain(last(seen.configs)), plain(engine(browser).bench.defaultConfig()));
});

test("a medium the bench cannot run yet, or no medium at all, is refused: the dropdown goes back, the bench stays", () => {
  // Some browsers let the keyboard reach a disabled option.
  const page = built("en", { reducedMotion: true, watch: true });
  const { section, seen } = page;
  choose(section, "co2");
  const derives = seen.configs.length;
  for (const value of ["caf2-dy", "diode", "unobtainium", ""]) {
    choose(section, value);
    assert.equal(section.choose.medium.value, "co2", JSON.stringify(value));
    assert.equal(seen.configs.length, derives, JSON.stringify(value) + " changes nothing");
  }
  section.choose.pump.value = "flashlamp";              // not one of CO₂'s pumps
  section.choose.pump.fire("change");
  assert.equal(section.choose.pump.value, "discharge");
  assert.equal(seen.configs.length, derives);
});

/* ---------- the controls of each bench ---------- */

test("each bench starts at its own slow motion", () => {
  const page = built("en", { reducedMotion: true });
  const { section } = page;
  const listed = [];
  for (const medium of engine(page.browser).media.list()) {
    for (const pump of engine(page.browser).bench.pumpsFor(medium)) listed.push(medium + " " + pump);
  }
  assert.deepEqual(BENCHES.map(([medium, pump]) => medium + " " + pump), listed, "every bench is in the table");
  for (const [medium, pump, slowMotion] of BENCHES) {
    // From another bench, slowed to 10⁹ (no bench starts there), so the
    // change shows.
    choose(section, medium === "he-ne" ? "co2" : "he-ne");
    slide(section, "slowMotion", 1000);
    choose(section, medium, pump);
    assert.equal(section.inputs.slowMotion.value, String(slowMotion), medium + " " + pump);
    assert.equal(section.controls.slowMotion.value, String(Math.round(1000 * Math.log10(slowMotion / 1e3) / 6)));
  }
});

test("the slow motion runs from 10³ to 10⁹", () => {
  const page = built("en", { reducedMotion: true });
  const { section } = page;
  slide(section, "slowMotion", 0);
  assert.equal(section.inputs.slowMotion.value, "1000");
  assert.equal(section.hint.textContent, "1" + NB + "s = 1.00" + NB + "ms");
  slide(section, "slowMotion", 1000);
  assert.equal(section.inputs.slowMotion.value, "1000000000");
  assert.equal(section.hint.textContent, "1" + NB + "s = 1.00" + NB + "ns");
  type(section, "slowMotion", "5e9");
  assert.equal(section.inputs.slowMotion.value, "1000000000", "held at its end");
});

test("the pump slider sets its bench's field, in its unit: W of light, J of flash, A or mA of current", () => {
  const page = built("en", { reducedMotion: true, watch: true });
  const { section, seen } = page;
  const cases = [
    // medium, pump, field, box, unit, slider, a typed value and what it sets
    ["nd-yag", "diode", "pumpPower", "5", "W", "250", "7.5", 7.5],
    ["dye-r6g", "laser", "pumpPower", "2", "W", "200", "3", 3],
    ["ruby", "flashlamp", "flashEnergy", "1000", "J", "333", "1500", 1500],
    ["ar-ion", "discharge", "current", "30", "A", "750", "35", 35],
    // Under 1 A the current is shown and typed in mA.
    ["he-ne", "discharge", "current", "5", "mA", "333", "7.5", 0.0075],
    ["co2", "discharge", "current", "20", "mA", "333", "45", 0.045]
  ];
  for (const [medium, pump, field, box, unit, slider, typed, value] of cases) {
    const label = medium + " " + pump;
    choose(section, medium, pump);
    assert.equal(section.inputs.pump.value, box, label);
    assert.equal(section.units.pump.textContent, unit, label);
    assert.equal(section.controls.pump.value, slider, label);
    assert.equal(section.pumpName.textContent, WORDS.controls.pump[pump].en, label);
    type(section, "pump", typed);
    assertClose(last(seen.configs)[field], value, 1e-12, label + ": " + field);
    assert.equal(section.inputs.pump.value, typed, label);
  }
  // What a screen reader hears: the value with its unit.
  assert.equal(section.controls.pump.getAttribute("aria-valuetext"), "45.0" + NB + "mA");
  choose(section, "ruby");
  assert.equal(section.controls.pump.getAttribute("aria-valuetext"), "1.00" + NB + "kJ");
  // The ends of each slider are its bench's.
  slide(section, "pump", 1000);
  assert.equal(last(seen.configs).flashEnergy, 3000);
  type(section, "pump", "9999");
  assert.equal(section.inputs.pump.value, "3000", "held at the top");
  choose(section, "he-ne");
  slide(section, "pump", 1000);
  assertClose(last(seen.configs).current, 0.015, 1e-12, "He-Ne's top: 3 × its 5 mA");
  assert.equal(section.inputs.pump.value, "15");
});

test("the output mirror runs from 0.5 % to 60 % on every bench, and each starts with its own", () => {
  const page = built("en", { reducedMotion: true, watch: true });
  const { browser, section, seen } = page;
  for (const [medium, pump] of BENCHES) {
    choose(section, medium, pump);
    const config = engine(browser).bench.configFor({ medium, pump });
    assert.equal(section.inputs.coupler.value, F(page).plain(100 * (1 - config.refl2), 6), medium);
    slide(section, "coupler", 1000);
    assertClose(1 - last(seen.configs).refl2, 0.6, 1e-12, medium + " at the top");
    slide(section, "coupler", 0);
    assertClose(1 - last(seen.configs).refl2, 0.005, 1e-12, medium + " at the bottom");
  }
  choose(section, "ruby");
  assert.equal(section.inputs.coupler.value, "50", "§3.1's ruby lets out half");
});

/* ---------- Fire ---------- */

test("Fire is shown only on a bench with a flashlamp", () => {
  const page = built("en", { reducedMotion: true });
  const { section } = page;
  assert.equal(section.fire.hidden, true, "diodes");
  for (const [medium, pump] of BENCHES) {
    choose(section, medium, pump);
    assert.equal(section.fire.hidden, pump !== "flashlamp", medium + " " + pump);
  }
});

test("Fire fires a flash at the moment the simulation has reached, of the slider's energy; a paused page starts playing", () => {
  const page = built("en", { reducedMotion: true, watch: true });
  const { browser, section, seen } = page;
  choose(section, "ruby");
  section.fire.fire("click");
  assert.equal(section.play.textContent, "Pause", "Fire plays a paused page");
  assert.equal(browser.pendingFrames(), 1);
  page.clock = 1000;
  browser.runFrame(page.clock);
  runFrames(page, 3);
  assert.deepEqual(plain(seen.sims[0].flash), { at: 0, flashEnergy: 1000, flashTime: 0.3e-3 });
  // Later, with another energy: fired at the time reached, of the new energy.
  slide(section, "pump", 500);                          // 1500 J
  const t = last(seen.after).t;
  section.fire.fire("click");
  const before = seen.sims.length;
  runFrames(page, 1);
  const flash = seen.sims[before].flash;                // the first piece of the frame
  assert.equal(flash.at, t);
  assert.equal(flash.flashEnergy, 1500);
  // A slider moved after Fire changes the next flash, not this one.
  slide(section, "pump", 100);
  runFrames(page, 1);
  assert.equal(last(seen.sims).flash.flashEnergy, 1500);
  assert.equal(last(seen.sims).flash.at, t);
});

test("a new bench never keeps the old bench's flash, and Reset puts the flash away", () => {
  const page = built("en", { watch: true });
  const { browser, section, seen } = page;
  choose(section, "ruby");
  section.fire.fire("click");
  page.clock = 1000;
  browser.runFrame(page.clock);
  runFrames(page, 5);
  assert.notEqual(last(seen.sims).flash, null);
  choose(section, "nd-glass");                          // a lamp too, but a new bench
  runFrames(page, 2);
  assert.equal(last(seen.sims).flash, null);
  section.fire.fire("click");
  runFrames(page, 2);
  assert.notEqual(last(seen.sims).flash, null);
  section.reset.fire("click");
  runFrames(page, 2);
  assert.equal(last(seen.sims).flash, null);
  section.fire.fire("click");
  runFrames(page, 2);
  choose(section, "he-ne");                             // advance refuses a flash on a bench without a lamp
  runFrames(page, 2);
  assert.equal(last(seen.sims).flash, null);
  assert.equal(section.play.textContent, "Pause", "nothing went wrong");
});

/* ---------- the readouts ---------- */

test("each kind of bench shows its own numbers, and hides the others", () => {
  const page = built("en", { reducedMotion: true });
  const { section } = page;
  const expected = {
    "nd-yag diode": STEADY_ROWS, "dye-r6g laser": STEADY_ROWS, "ti-sapphire laser": STEADY_ROWS,
    "he-ne discharge": DISCHARGE_ROWS, "ar-ion discharge": DISCHARGE_ROWS, "co2 discharge": DISCHARGE_ROWS,
    "ruby flashlamp": FLASH_ROWS, "nd-glass flashlamp": FLASH_ROWS, "nd-yag flashlamp": FLASH_ROWS,
    "two-level laser": TWO_LEVEL_LIGHT_ROWS, "two-level flashlamp": TWO_LEVEL_FLASH_ROWS
  };
  for (const [medium, pump] of BENCHES) {
    choose(section, medium, pump);
    assert.deepEqual(shownRows(section), expected[medium + " " + pump], medium + " " + pump);
  }
});

test("the readouts of a discharge, a flashlamp and the two-level atom", () => {
  const page = built("en", { reducedMotion: true });
  const { browser, section } = page;
  const B = engine(browser).bench;
  const r = section.readouts;
  // He-Ne: the threshold current, 365 µA (361 µA before stage 10a's mirrors).
  choose(section, "he-ne");
  const heNe = B.derive(B.configFor({ medium: "he-ne", pump: "discharge" }));
  assert.equal(r.currentThreshold.textContent, F(page).si(heNe.currentThreshold, "A"));
  assert.equal(r.currentThreshold.textContent, "365" + NB + "µA");
  assert.equal(r.x.textContent, F(page).number(heNe.x));
  assert.equal(r.P_out.textContent, F(page).si(heNe.P_out, "W"));
  // A mirror letting out 60 %: the tube never reaches threshold.
  slide(section, "coupler", 1000);
  assert.equal(r.currentThreshold.textContent, WORDS.readouts.never.en);
  // Ruby: the threshold flash, 639 J; no pump and no highest output before Fire.
  choose(section, "ruby");
  assert.equal(r.flashThreshold.textContent, "639" + NB + "J");
  assert.equal(r.x.textContent, "0");
  assert.equal(r.peak.textContent, "—");
  // The two-level atom never reaches threshold, whatever it is pumped with.
  choose(section, "two-level", "laser");
  assert.equal(r.pumpThreshold.textContent, WORDS.readouts.never.en);
  assert.equal(r.P_out.textContent, "0" + NB + "W");
  choose(section, "two-level", "flashlamp");
  assert.equal(r.flashThreshold.textContent, WORDS.readouts.never.en);
});

test("the threshold flash is found once per bench and per output mirror: not per frame, pump slider, Fire or language switch", () => {
  const page = built("en", { watch: true });
  const { browser, section, seen } = page;
  assert.equal(seen.thresholds.length, 0, "diodes have none");
  // Nd:YAG with a flashlamp: its threshold takes one run (ruby's a search).
  choose(section, "nd-yag", "flashlamp");
  assert.equal(seen.thresholds.length, 1);
  slide(section, "pump", 600);
  type(section, "pump", "20");
  section.fire.fire("click");
  page.clock = 1000;
  browser.runFrame(page.clock);
  runFrames(page, 20);
  section.reset.fire("click");
  slide(section, "slowMotion", 400);
  assert.equal(seen.thresholds.length, 1, "nothing it depends on changed");
  slide(section, "coupler", 900);
  assert.equal(seen.thresholds.length, 2, "a new output mirror");
  // (Worked out on an engine of its own: the page's is counted.)
  const own = loadEngine().bench;
  assert.equal(section.readouts.flashThreshold.textContent, F(page).si(own.flashThreshold(plain(last(seen.thresholds))), "J"));
  type(section, "coupler", "30");
  assert.equal(seen.thresholds.length, 3);
  // A language switch builds the page again with the same experiment.
  browser.window.Site.lang = "hy";
  const again = laserSection(600);
  sectionReady(browser, "laser", again.container, WORDS);
  assert.equal(seen.thresholds.length, 3, "a rebuild is not a new bench");
  assert.equal(again.readouts.flashThreshold.textContent, section.readouts.flashThreshold.textContent);
  choose(again, "nd-glass");
  assert.equal(seen.thresholds.length, 4);
  choose(again, "he-ne");
  assert.equal(seen.thresholds.length, 4, "a discharge has none");
});

test("the highest output since Fire: the top of the runs' peaks since the flash, which the chart reaches; Reset clears it", () => {
  // A whole ruby flash on the page at its own slow motion: 1.2 ms, 720
  // frames. Only the bench on screen (a chart of 720 frames takes long to
  // record).
  const page = built("en", { watch: true, show: ["bench"] });
  const { browser, section, seen } = page;
  choose(section, "ruby");
  section.fire.fire("click");
  page.clock = 1000;
  browser.runFrame(page.clock);
  let worst = 0;
  for (let frame = 0; frame < 720; frame++) {
    const before = seen.steps.length;
    runFrames(page, 1);
    worst = Math.max(worst, sum(seen.steps.slice(before)));
  }
  // The steps of a frame: measured at most 588 (bench-pumps.test.js).
  assert.ok(worst <= 880, "a frame took " + worst + " steps");
  assert.equal(section.note.hidden, true, "it kept up");
  const d = engine(browser).bench.derive(engine(browser).bench.configFor({ medium: "ruby", pump: "flashlamp" }));
  // The highest output of every run (bench.advance's peak, stage 8b): a
  // spike's top falls between the chart's ends of the runs.
  let top = 0;
  for (const peak of seen.peaks) top = Math.max(top, peak.power);
  let ends = 0;
  for (const sim of seen.after) ends = Math.max(ends, d.powerPerPhoton * Math.exp(sim.lnPhi));
  assert.ok(top > d.powerAtTwiceThreshold, "the ruby lased: " + top + " W");
  assert.ok(top > ends, "above every run's end: " + top + " W against " + ends + " W");
  section.play.fire("click");
  assert.equal(section.readouts.peak.textContent, F(page).si(top, "W"));
  // The bench drew its beam.
  assert.ok(seen.bench.some((entry) => entry.light.beam > 0.5), "a beam was drawn");
  section.reset.fire("click");
  assert.equal(section.readouts.peak.textContent, "—");
  // A new flash starts from the output it is fired at.
  section.fire.fire("click");
  section.play.fire("click");
  assert.equal(section.readouts.peak.textContent, F(page).si(d.powerPerPhoton, "W"), "one photon");
});

/* ---------- the pictures ---------- */

test("the pump now drives the cartoon and the pump's glow on the bench", () => {
  const page = built("en", { watch: true });
  const { browser, section, seen } = page;
  const B = engine(browser).bench;
  choose(section, "nd-yag", "flashlamp");
  const config = B.configFor({ medium: "nd-yag", pump: "flashlamp" });
  page.clock = 1000;
  browser.runFrame(page.clock);
  runFrames(page, 3);
  // No flash yet: no pump.
  assert.equal(last(seen.drives).drive.pump, 0);
  assert.equal(last(seen.bench).light.pump, 0);
  section.fire.fire("click");
  // 240 frames at 1 s = 100 µs: 0.4 ms, past the flash's peak at t_p = 0.3 ms.
  let highest = 0;
  for (let frame = 0; frame < 240; frame++) {
    runFrames(page, 1);
    const x = B.pumpNow({ sim: last(seen.after), config }).x;
    highest = Math.max(highest, x);
    assert.equal(last(seen.drives).drive.pump, Math.min(1, x / 4), "frame " + frame);
    assert.equal(last(seen.bench).light.pump, Math.min(1, x / 4), "frame " + frame);
  }
  // The flash rose to its peak, 9.7 × threshold at 10 J.
  assert.ok(highest > 9.6 && highest < 9.7, "the flash's peak: " + highest);
  assert.ok(B.pumpNow({ sim: last(seen.after), config }).x < highest, "and is past it");
});

test("three and two levels in the cartoon: the share of ions up, N₂/N_t; the two-level atom never half up", () => {
  const page = built("en", { watch: true });
  const { browser, section, seen } = page;
  const E = engine(browser);
  const B = E.bench;
  choose(section, "ruby");
  page.clock = 1000;
  browser.runFrame(page.clock);
  runFrames(page, 2);
  const config = B.configFor({ medium: "ruby", pump: "flashlamp" });
  // Before Fire every ion is down: no excited atom in the cartoon.
  assert.equal(last(seen.drives).drive.excited, 0, "no excited atom in the cartoon");
  // At the flash's peak the cartoon's share is N₂/N_t, and the pump's
  // level is the engine's x.
  section.fire.fire("click");
  runFrames(page, 200);                                 // 0.33 ms: the flash at its peak
  const sim = last(seen.after);
  const pump = B.pumpNow({ sim: sim, config: config });
  const N_t = E.media.get("ruby").N_t;
  assertClose(last(seen.drives).drive.excited, (N_t + sim.N) / (2 * N_t), 1e-12, "N₂/N_t");
  assert.equal(last(seen.drives).drive.pump, Math.min(1, pump.x / 4));
  // The two-level atom: always more down than up; no threshold, so its
  // pump is drawn by W_pτ.
  choose(section, "two-level", "laser");
  runFrames(page, 60);
  const two = B.derive(B.configFor({ medium: "two-level", pump: "laser" }));
  assert.equal(last(seen.bench).light.pump, Math.min(1, two.w / 4));
  for (const entry of seen.drives.slice(-60)) assert.ok(entry.drive.excited < 0.5, "two levels: " + entry.drive.excited);
});

test("the bench is drawn with the chosen pump, medium and wavelength", () => {
  const page = built("en", { watch: true });
  const { browser, section, seen } = page;
  page.clock = 1000;
  browser.runFrame(page.clock);
  assert.equal(last(seen.bench).light.pumpKind, "diode");
  assert.equal(last(seen.bench).light.medium, "nd-yag");
  const kinds = new Set();
  const E = engine(browser);
  for (const id of E.media.list()) {
    for (const pump of E.bench.pumpsFor(id)) {
      choose(section, id, pump);
      runFrames(page, 1);
      assert.equal(last(seen.bench).light.pumpKind, pump, id + " with " + pump);
      // Stage 10c1: the medium's look and the beam's colour.
      assert.equal(last(seen.bench).light.medium, id);
      assert.equal(last(seen.bench).light.lam, E.media.get(id).lam, id + ": its own wavelength");
      // Stage 10c2: the pump's own wavelength (none for a discharge).
      assert.equal(last(seen.bench).light.pumpLam, E.bench.configFor({ medium: id, pump: pump }).pumpLam, id + " with " + pump);
      kinds.add(pump);
    }
  }
  // The drawing knows every pump the engine runs.
  for (const kind of kinds) assert.ok(Array.from(browser.window.LaserUI.bench.KINDS).includes(kind), kind);
});

test("a discharge is drawn with its current, not its gain: the tube is brightest at the top of the slider", () => {
  const page = built("en", { watch: true });
  const { browser, section, seen } = page;
  page.clock = 1000;
  browser.runFrame(page.clock);
  const B = engine(browser).bench;
  for (const medium of ["he-ne", "co2", "ar-ion"]) {
    choose(section, medium);
    const top = B.controls(B.configFor({ medium, pump: "discharge" })).pump.max;
    for (const position of [0, 100, 500, 1000]) {
      slide(section, "pump", position);
      runFrames(page, 1);
      const config = last(seen.configs);
      assertClose(last(seen.bench).light.pump, config.current / top, 1e-12, medium + " at " + position);
      // The cartoon's pump still goes by the gain: at the top of the
      // "optimum" law it is 0 while the most current flows.
      const x = B.derive(config).x;
      assert.equal(last(seen.drives).drive.pump, Math.min(1, x / 4), medium + " cartoon at " + position);
    }
    assert.equal(last(seen.bench).light.pump, 1, medium + ": full current, full glow");
  }
  // He-Ne at the top of its law: no gain, yet the tube glows and its wires
  // carry the current.
  choose(section, "he-ne");
  slide(section, "pump", 1000);
  runFrames(page, 1);
  assert.equal(B.derive(last(seen.configs)).x, 0);
  assert.equal(last(seen.bench).light.pump, 1);
});

test("the drawing names the chosen pump, in the visitor's language", () => {
  const page = built("en", { watch: true });
  const { browser, section, seen } = page;
  page.clock = 1000;
  browser.runFrame(page.clock);
  assert.equal(last(seen.bench).labels.pump, WORDS.bench.pumps.diode.en);
  for (const [medium, pump] of [["ruby", "flashlamp"], ["he-ne", "discharge"], ["dye-r6g", "laser"], ["nd-yag", "diode"]]) {
    choose(section, medium, pump);
    runFrames(page, 1);                                 // a running loop draws on its next frame
    assert.equal(last(seen.bench).labels.pump, WORDS.bench.pumps[pump].en, pump);
  }
  choose(section, "co2");
  browser.window.Site.lang = "hy";
  const again = laserSection(600);
  sectionReady(browser, "laser", again.container, WORDS);
  browser.setOnScreen(again.canvases.bench, true);
  runFrames(page, 1);
  assert.equal(last(seen.bench).labels.pump, WORDS.bench.pumps.discharge.hy);
  // Words missing from the data: the drawing's own word for a pump.
  const bare = JSON.parse(JSON.stringify(WORDS));
  delete bare.bench.pumps;
  const other = laserSection(600);
  sectionReady(browser, "laser", other.container, bare);
  browser.setOnScreen(other.canvases.bench, true);
  runFrames(page, 1);
  assert.equal(last(seen.bench).labels.pump, WORDS.bench.parts.pump.hy);
});

test("dragging the output mirror waits for the threshold flash until the slider is let go", () => {
  const page = built("en", { reducedMotion: true, watch: true });
  const { section, seen } = page;
  choose(section, "ruby");
  const searches = seen.thresholds.length;
  const before = section.readouts.flashThreshold.textContent;
  // A drag: every step moves the mirror (its numbers follow) but searches nothing.
  for (const position of [700, 750, 800, 850]) drag(section, "coupler", position);
  assert.equal(seen.thresholds.length, searches, "no search while the slider is held");
  // 850 of 1000 on the log scale from 0.5 % to 60 %: 0.5 % × 120^0.85.
  assertClose(1 - last(seen.configs).refl2, 0.005 * Math.pow(120, 0.85), 1e-3, "the mirror moved");
  assert.equal(section.readouts.flashThreshold.textContent, "…", "the old mirror's threshold is not shown");
  // Let go: one search, for the mirror where it stopped.
  section.controls.coupler.fire("change");
  assert.equal(seen.thresholds.length, searches + 1);
  assertClose(1 - last(seen.thresholds).refl2, 1 - last(seen.configs).refl2, 1e-12, "for the mirror it stopped at");
  assert.notEqual(section.readouts.flashThreshold.textContent, "…");
  assert.notEqual(section.readouts.flashThreshold.textContent, before, "a lossier mirror needs a bigger flash");
  // A typed value is final at once; so is a new bench.
  drag(section, "coupler", 500);
  type(section, "coupler", "40");
  assert.equal(seen.thresholds.length, searches + 2);
  assert.notEqual(section.readouts.flashThreshold.textContent, "…");
  drag(section, "coupler", 600);
  choose(section, "nd-glass");
  assert.notEqual(section.readouts.flashThreshold.textContent, "…");
});

test("a choice or an output mirror whose threshold search fails leaves the bench as it was", () => {
  // A stand-in search that fails for Nd:glass, and for a ruby mirror
  // letting out more than 55 %.
  function failing(browser) {
    const engineNow = browser.window.LaserEngine;
    const real = engineNow.bench.flashThreshold;
    browser.window.LaserEngine = Object.assign({}, engineNow, {
      bench: Object.assign({}, engineNow.bench, {
        flashThreshold: function (config) {
          if (config.medium === "nd-glass" || config.refl2 < 0.45) throw new Error("the search failed");
          return real(config);
        }
      })
    });
  }
  const page = built("en", { reducedMotion: true, watch: true, prepare: failing });
  const { browser, section, seen } = page;
  const rows = shownRows(section);
  const threshold = section.readouts.pumpThreshold.textContent;
  assert.throws(() => choose(section, "nd-glass"), /the search failed/);
  // Still the diode-pumped Nd:YAG: the next slider move changes its config.
  slide(section, "pump", 300);
  assert.equal(last(seen.configs).medium, "nd-yag");
  assert.equal(last(seen.configs).pump, "diode");
  type(section, "pump", "5");
  // Its rows, numbers and unit, and it runs.
  section.reset.fire("click");
  assert.deepEqual(shownRows(section), rows);
  assert.equal(section.readouts.pumpThreshold.textContent, threshold);
  assert.equal(section.units.pump.textContent, "W");
  assert.equal(section.fire.hidden, true);
  section.play.fire("click");
  page.clock = 1000;
  browser.runFrame(page.clock);
  runFrames(page, 5);
  // A typed mirror the search fails for: ruby keeps its 50 % and threshold.
  choose(section, "ruby");
  const gain = section.readouts.gth.textContent;
  const flash = section.readouts.flashThreshold.textContent;
  assert.throws(() => type(section, "coupler", "60"), /the search failed/);
  slide(section, "pump", 300);
  assert.equal(last(seen.configs).refl2, 0.5, "the mirror the bench had");
  type(section, "pump", "1000");
  section.reset.fire("click");
  assert.equal(section.readouts.gth.textContent, gain, "the old mirror's threshold gain");
  assert.equal(section.readouts.flashThreshold.textContent, flash);
  section.fire.fire("click");
  runFrames(page, 5);
});

test("the pump now is asked of the engine about once a frame, not by every picture", () => {
  const page = built("en", { watch: true });
  const { browser, seen } = page;
  page.clock = 1000;
  browser.runFrame(page.clock);
  const before = seen.pumpCalls;
  runFrames(page, 30);
  // The cartoon, the bench's glow, the level picture and the readout all
  // use it each frame; it is worked out once per new simulation moment.
  assert.ok(seen.pumpCalls - before <= 32, (seen.pumpCalls - before) + " calls in 30 frames");
  assert.ok(seen.pumpCalls - before >= 30, "and again each frame, as the simulation moves");
});


test("the power chart of each bench: its unit of light as the floor, a steady line only where there is a steady output", () => {
  const page = built("en", { reducedMotion: true, watch: true });
  const { browser, section, seen } = page;
  const B = engine(browser).bench;
  for (const [medium, pump] of BENCHES) {
    choose(section, medium, pump);
    const d = B.derive(B.configFor({ medium, pump }));
    const chart = seen.chart.P;
    assert.equal(chart.floor, d.powerAtTwiceThreshold, medium);
    // A line at the steady output, if there is one above 0: none for a
    // flash, nor for the two-level atom (P_out = 0).
    if (pump === "flashlamp" || medium === "two-level") {
      assert.deepEqual(Array.from(chart.lines), [], medium + " " + pump + ": no steady output");
    } else {
      assert.equal(chart.lines.length, 1, medium);
      assert.equal(chart.lines[0].value, d.P_out, medium);
    }
    assert.equal(chart.shownTime, 5 / Number(section.inputs.slowMotion.value), medium);
  }
});

/* ---------- rebuilds ---------- */

test("a language switch keeps the chosen bench: the same choice, sliders and moment, in the new words", () => {
  const page = built("en", { watch: true });
  const { browser, section } = page;
  choose(section, "he-ne");
  type(section, "pump", "7.5");
  page.clock = 1000;
  browser.runFrame(page.clock);
  runFrames(page, 10);
  section.play.fire("click");
  const time = section.readouts.time.textContent;
  browser.window.Site.lang = "hy";
  const again = laserSection(600);
  sectionReady(browser, "laser", again.container, WORDS);
  assertNoListeners(section, "the English build");
  assert.equal(again.choose.medium.value, "he-ne");
  assert.equal(again.choose.pump.value, "discharge");
  assert.equal(optionsOf(again.choose.medium)[0].text, WORDS.media.ruby.hy);
  assert.deepEqual(optionsOf(again.choose.pump), [{ value: "discharge", text: WORDS.pumps.discharge.hy, disabled: false }]);
  assert.equal(again.pumpName.textContent, WORDS.controls.pump.discharge.hy);
  assert.equal(again.inputs.pump.value, "7.5");
  assert.equal(again.units.pump.textContent, "mA");
  assert.equal(again.inputs.slowMotion.value, "1000000");
  assert.equal(again.readouts.time.textContent, time);
  assert.deepEqual(shownRows(again), DISCHARGE_ROWS);
  assert.equal(again.fire.hidden, true);
});

test("words missing from the data: each option is named by its id, and the page still runs", () => {
  const { browser } = setup("en");
  const section = laserSection(600);
  sectionReady(browser, "laser", section.container, {});
  const options = optionsOf(section.choose.medium);
  assert.deepEqual(options.map((option) => option.text), options.map((option) => option.value));
  assert.deepEqual(optionsOf(section.choose.pump).map((option) => option.text), ["diode", "flashlamp"]);
  choose(section, "ruby");
  assert.equal(section.readouts.flashThreshold.textContent, "639" + NB + "J");
  assert.equal(section.pumpName.textContent, "");
});

/* ---------- what each bench costs a frame ---------- */

// The most solver steps a frame took, over `count` frames.
function worstFrame(page, count) {
  let worst = 0;
  for (let i = 0; i < count; i++) {
    const before = page.seen.steps.length;
    runFrames(page, 1);
    worst = Math.max(worst, sum(page.seen.steps.slice(before)));
  }
  return worst;
}

test("every bench keeps up at its starting slow motion, at the ends of its sliders, at 60 Hz", () => {
  // Measured on the page, at each corner, over 0.5 s and over 10 s of
  // screen time, and as long again after the pump went off: the most steps
  // a 60 Hz frame took, which is in its first frames except where the cost
  // is flat (He-Ne 64, Ti:sapphire 48). The costliest: the two-level atom
  // (739, its first frame), ruby's flash (647), the dye laser's first
  // frame with the pump off (414). The bounds are 1.5× that, inside the
  // frame's 1500, so nothing falls behind; a frame over its bound fails at
  // once.
  const bounds = {
    "ruby flashlamp": 980, "nd-glass flashlamp": 660, "nd-yag flashlamp": 750, "nd-yag diode": 510,
    "co2 discharge": 420, "two-level laser": 1110, "two-level flashlamp": 1090, "he-ne discharge": 100,
    "ti-sapphire laser": 75, "ar-ion discharge": 500, "dye-r6g laser": 625
  };
  const page = built("en", { watch: true, show: ["bench"] });
  const { browser, section } = page;
  page.clock = 1000;
  browser.runFrame(page.clock);
  for (const [medium, pump] of BENCHES) {
    const name = medium + " " + pump;
    let worst = 0;
    for (const couplerAt of [null, 0, 1000]) {
      for (const pumpAt of [null, 1000]) {
        chooseAfresh(section, medium, pump);            // the bench's own settings again
        // The coupler first: a flash bench then searches the threshold
        // flash of a config the test of the output mirror's range has
        // already searched (setup() keeps them).
        if (couplerAt !== null) slide(section, "coupler", couplerAt);
        if (pumpAt !== null) slide(section, "pump", pumpAt);
        section.reset.fire("click");
        if (pump === "flashlamp") section.fire.fire("click");
        const corner = name + ", pump " + pumpAt + ", coupler " + couplerAt;
        const on = worstFrame(page, 30);
        assert.ok(on <= bounds[name], corner + ": " + on + " steps in a frame");
        worst = Math.max(worst, on);
        if (pump !== "flashlamp") {
          slide(section, "pump", 0);
          const off = worstFrame(page, 10);
          assert.ok(off <= bounds[name], corner + ", pump off: " + off + " steps in a frame");
        }
      }
    }
    assert.ok(worst > 0, name + " ran");
  }
  assert.equal(section.note.hidden, true, "never behind");
});
