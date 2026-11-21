/* ============================================================================
   page-doubler.test.js — the doubling crystal on the page (docs/laser-plan.md,
   stage 13b): its On/Off on the 1.06 µm lasers only, the green light's
   readout, what the bench drawing is given, and that the laser runs on.

   Runs the real files, with the real data/laser.json, in the fake browser
   of fake-browser.js; the helpers are in page-helpers.js. The physics is
   tested in harmonic.test.js, the drawing in draw-bench.test.js.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { WORDS, built, last, runFrames, engine, choose, shownRows, type } = require("./page-helpers.js");

function configNow(page) {
  return last(page.seen.configs);
}

function on(section) {
  return section.doubler.getAttribute("aria-checked") === "true";
}

test("the doubling crystal's On/Off shows on Nd:YAG and Nd:glass only, and starts off", () => {
  const page = built("en", { reducedMotion: true, watch: true });
  const { section } = page;
  assert.equal(section.doublerRow.hidden, false, "the diode Nd:YAG");
  assert.equal(on(section), false);
  assert.equal(section.doublerWord.textContent, WORDS.choose.off.en);
  for (const [medium, pump] of [["nd-yag", "flashlamp"], ["nd-glass", "flashlamp"], ["nd-glass", "diode"]]) {
    choose(section, medium, pump);
    assert.equal(section.doublerRow.hidden, false, medium + " " + pump);
  }
  for (const [medium, pump] of [["ruby", "flashlamp"], ["he-ne", "discharge"], ["ti-sapphire", "laser"], ["dye-r6g", "laser"]]) {
    choose(section, medium, pump);
    assert.equal(section.doublerRow.hidden, true, medium + " " + pump);
  }
});

test("on: the drawing gets the crystal, a row gives the green power now; off again: neither; the laser is not changed", () => {
  const page = built("en", { watch: true });
  const { section, seen } = page;
  runFrames(page, 20);
  assert.equal(last(seen.bench).light.doubler, null, "off: no crystal drawn");
  assert.ok(!shownRows(section).includes("harmonic"), "off: no green row");
  const before = JSON.stringify(configNow(page));
  section.doubler.fire("click");
  assert.equal(on(section), true);
  assert.equal(section.doublerWord.textContent, WORDS.choose.on.en);
  assert.ok(shownRows(section).includes("harmonic"), "on: the green row");
  assert.equal(JSON.stringify(configNow(page)), before, "the laser itself is not changed");
  runFrames(page, 20);
  const d = last(seen.bench).light.doubler;
  assert.ok(d.share > 0 && d.share < 1e-5, "a steady few watts: almost no green, " + d.share);
  // The readout is harmonic.doubling of the output now: for weak light the
  // share is k·P (k the share at 1 W), so the green power is share²/k.
  const E = engine(page.browser);
  const c = configNow(page);
  const k = E.harmonic.doubling({ power: 1, area: c.area, length: E.harmonic.KDP.length, lam: 1064e-9 }).share;
  assert.equal(section.readouts.harmonic.textContent, page.browser.window.LaserUI.format.si(d.share * d.share / k, "W"));
  section.doubler.fire("click");
  assert.equal(on(section), false);
  runFrames(page, 2);
  assert.equal(last(seen.bench).light.doubler, null, "off again");
  assert.ok(!shownRows(section).includes("harmonic"));
});

test("the crystal stays in across benches that have it, and through a language switch; a hidden switch ignores a click", () => {
  const page = built("en", { reducedMotion: true, watch: true });
  const { section } = page;
  section.doubler.fire("click");
  choose(section, "nd-glass", "flashlamp");
  assert.equal(on(section), true, "kept on Nd:glass");
  for (const pump of ["flashlamp", "diode"]) {
    choose(section, "nd-glass", pump);
    assert.ok(shownRows(section).includes("harmonic"), "Nd:glass " + pump);
    assert.match(section.readouts.harmonic.textContent, /W$/, "Nd:glass " + pump + ": its green readout");
  }
  choose(section, "ruby", "flashlamp");
  assert.equal(section.doublerRow.hidden, true);
  assert.ok(!shownRows(section).includes("harmonic"), "no green row on ruby");
  section.doubler.fire("click");                        // a stray click on the hidden switch
  choose(section, "nd-yag", "diode");
  assert.equal(on(section), true, "back on, as it was");
});

test("a Q-switched pulse shorter than a frame still lights the drawn green: at the frame's highest output, far above the steady beam's", () => {
  const page = built("en", { watch: true });
  const { section, seen } = page;
  section.doubler.fire("click");
  runFrames(page, 100);
  const steady = last(seen.bench).light.doubler.green;
  assert.ok(steady < 1e-3, "the steady beam's green cannot be seen: " + steady);
  choose(section, "nd-yag", "diode", "absorber");
  const E = engine(page.browser);
  let most = 0;
  let checked = 0;
  for (let k = 0; k < 300; k++) {
    const from = seen.peaks.length;
    runFrames(page, 1);
    const green = last(seen.bench).light.doubler.green;
    most = Math.max(most, green);
    // Each frame's green is the green at the highest of its runs' peaks.
    const peaks = seen.peaks.slice(from);
    if (peaks.length === 0) continue;
    const c = configNow(page);
    const top = Math.max(...peaks.map((p) => p.power));
    const expected = E.harmonic.doubling({ power: top, area: c.area, length: E.harmonic.KDP.length, lam: 1064e-9 }).power /
      E.bench.derive(c).powerAtTwiceThreshold;
    assert.ok(Math.abs(green - expected) <= 1e-9 * expected + 1e-300, "frame " + k + ": " + green + " against " + expected);
    checked += 1;
  }
  assert.ok(checked > 200, "frames checked: " + checked);
  assert.ok(most > 0.5, "a pulse's green, in the beam's units: " + most);
  assert.ok(most > 1e4 * steady);
});

test("paused, or after Reset, the drawn green is the light at this moment, not the last frame's pulse", () => {
  const page = built("en", { watch: true });
  const { section, seen } = page;
  section.doubler.fire("click");
  choose(section, "nd-yag", "diode", "absorber");
  const E = engine(page.browser);
  const greenOf = (sim) => {
    const c = configNow(page);
    const d = E.bench.derive(c);
    const power = d.powerPerPhoton * Math.exp(sim.lnPhi);
    return E.harmonic.doubling({ power: power, area: c.area, length: E.harmonic.KDP.length, lam: 1064e-9 }).power / d.powerAtTwiceThreshold;
  };
  runFrames(page, 1);
  let k = 0;
  while (last(seen.bench).light.doubler.green < 0.5 && k < 400) {
    runFrames(page, 1);
    k += 1;
  }
  assert.ok(k < 400, "a pulse came");
  section.play.fire("click");                           // pause
  section.doubler.fire("click");                        // off and on again: two paused redraws
  section.doubler.fire("click");
  const paused = last(seen.bench).light.doubler.green;
  const now = greenOf(last(seen.after));
  assert.ok(Math.abs(paused - now) <= 1e-9 * now + 1e-300, "paused: " + paused + " against " + now);
  section.reset.fire("click");
  assert.ok(last(seen.bench).light.doubler.green < 1e-20, "after Reset: " + last(seen.bench).light.doubler.green);
});

test("Reset while running, right after a pulse: the next picture has no green from the old run", () => {
  const page = built("en", { watch: true });
  const { section, seen } = page;
  section.doubler.fire("click");
  choose(section, "nd-yag", "diode", "absorber");
  runFrames(page, 1);
  let k = 0;
  while (last(seen.bench).light.doubler.green < 0.5 && k < 400) {
    runFrames(page, 1);
    k += 1;
  }
  assert.ok(k < 400, "a pulse came");
  section.reset.fire("click");
  // The loop runs: the next frame first draws the new run (dt 0 after a restart).
  runFrames(page, 1);
  assert.ok(last(seen.bench).light.doubler.green < 1e-20, "after Reset: " + last(seen.bench).light.doubler.green);
});
