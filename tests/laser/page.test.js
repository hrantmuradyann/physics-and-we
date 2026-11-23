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
   hands the four pictures what they draw (stages 6 and 6b), here on the
   default bench, Nd:YAG with diodes. Choosing another bench (stage 7c) is
   tested in page-choose.test.js. Runs the real files, with the real
   data/laser.json, in the fake browser of fake-browser.js; the helpers
   are in page-helpers.js.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { ROOT, assertClose } = require("./helpers.js");
const { fakeCanvas, fakeContainer } = require("./fake-browser.js");
const {
  WORDS, PARTS, CANVASES, CONTROLS, NB, FRAME, setup, laserSection, benchOnlySection, sectionReady, texts,
  switchTheme, built, last, dearer, sum, runFrames, slide, type, engine, assertNoListeners, shownRows
} = require("./page-helpers.js");

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
    for (const name of ["title", "steady"]) assert.ok(WORDS.power.words[name][lang].trim(), "power.words." + name + "." + lang);
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
    // The bench: the four names (the pump's is the chosen pump's, the
    // diodes), and the output mirror's transmission with its number.
    const expected = ["backMirror", "outputMirror", "medium"].map((part) => WORDS.bench.parts[part][lang]);
    expected.push(WORDS.bench.pumps.diode[lang]);
    expected.push(WORDS.bench.parts.transmission[lang] + " 5.00" + NB + "%");
    // The mirrors (stage 10b): the concave output mirror's F, 50 cm in front
    // of it, off the 30 cm cavity's picture, and how much wider the widths
    // are drawn.
    expected.push(WORDS.bench.parts.focus[lang] + "₂ 500" + NB + "×" + NB + "10⁻³" + NB + "m");
    const widths = texts(section.recorder).find((text) => text.indexOf(WORDS.bench.parts.widths[lang] + " ") === 0);
    assert.ok(widths && /× \d+$/.test(widths), "the widths' scale: " + widths);
    expected.push(widths);
    // Nd:YAG's 1064 nm and its diodes' 808 nm cannot be seen: the drawing
    // says so (stages 10c1, 10c2).
    expected.push("808" + NB + "×" + NB + "10⁻⁹" + NB + "m, 1.06" + NB + "×" + NB + "10⁻⁶" + NB + "m · " + WORDS.bench.parts.infrared[lang]);
    assert.deepEqual(texts(section.recorder).sort(), expected.sort(), lang);
    // Each canvas has the height its drawing asks for.
    const sizes = { bench: UI.bench.SIZE, power: UI.plots.SIZE, photons: UI.photons.SIZE, atoms: UI.atoms.SIZE, stability: UI.stability.SIZE };
    for (const name of CANVASES) {
      const size = sizes[name];
      const height = Math.max(size.minHeight, Math.min(600 / size.aspect, size.maxHeight));
      assert.equal(section.canvases[name].style.height, height + "px", name);
    }
    assert.ok(texts(section.recorders.power).includes(WORDS.power.words.title[lang]));
    assert.ok(texts(section.recorders.power).includes(WORDS.power.words.steady[lang]));
    for (const name of UI.photons.WORDS) {
      assert.ok(texts(section.recorders.photons).includes(WORDS.photons.words[name][lang]), "photons: " + name);
    }
    // Inside one atom: Nd:YAG's four levels, named, with its 1064 nm step
    // and its diodes' 808 nm.
    const atomTexts = texts(section.recorders.atoms);
    assert.ok(atomTexts.includes(WORDS.atoms.words.title[lang]), "atoms: the title");
    assert.ok(atomTexts.includes(WORDS.media["nd-yag"][lang] + " · " + WORDS.atoms.words.four[lang]), "atoms: Nd:YAG, four levels");
    assert.ok(atomTexts.includes(WORDS.atoms.words.pump[lang]), "atoms: the pump");
    for (const [name, energy] of [["ground", "0"], ["lower", "0.260"], ["upper", "1.43"], ["band", "1.53"]]) {
      assert.ok(atomTexts.includes(WORDS.atoms.words[name][lang] + " · " + energy + NB + "eV"), "atoms: " + name);
    }
    // The text under the levels may be wrapped: read it as one.
    const allText = atomTexts.join(" ");
    assert.ok(allText.includes(WORDS.atoms.words.noteFour[lang]), "atoms: the note");
    assert.ok(atomTexts.some((text) => text.endsWith(" · " + WORDS.atoms.words.heat[lang] + " 0.260" + NB + "eV")), "atoms: the lower level's heat");
    assert.ok(atomTexts.includes("1.06" + NB + "×" + NB + "10⁻⁶" + NB + "m"), "atoms: the laser step's wavelength, written as the bench writes it");
    assert.ok(atomTexts.includes("1.17" + NB + "eV"), "atoms: the laser photon's energy, from the engine");
    assert.ok(atomTexts.includes("808" + NB + "×" + NB + "10⁻⁹" + NB + "m"), "atoms: the pump's wavelength");
    assert.ok(atomTexts.includes("+1.53" + NB + "eV"), "atoms: the pump photon's energy");
    // The upper level's lifetime is the engine's 230 µs.
    assert.ok(atomTexts.some((text) => text.endsWith(WORDS.atoms.words.stays[lang].replace("{t}", "230" + NB + "×" + NB + "10⁻⁶" + NB + "s"))), "atoms: the upper level's lifetime");
    assert.ok(allText.includes("76" + NB + "%"), "atoms: the budget's share");
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
  const R = engine(browser).bench.controls(engine(browser).bench.defaultConfig());
  for (const name of CONTROLS) {
    const slider = section.controls[name];
    assert.equal(slider.min, "0");
    assert.equal(slider.max, "1000");
    assert.equal(slider.step, "1");
  }
  assert.equal(section.controls.pump.value, "250", "5 of 20 W");
  assert.equal(section.controls.coupler.value, String(Math.round(1000 * F.toSlider(R.coupler, 0.05))));
  assert.equal(section.controls.coupler.value, "481", "5 % between 0.5 % and 60 %, by equal factors");
  // Slow motion from 10³ to 10⁹ by equal factors: 10⁴ is a sixth of the way.
  assert.equal(section.controls.slowMotion.value, "167");
  // The pump slider is named for this bench's pump.
  assert.equal(section.pumpName.textContent, WORDS.controls.pump.diode.en);
  // The number boxes: the same values, the output mirror in %.
  assert.equal(section.inputs.pump.value, "5");
  assert.equal(section.inputs.coupler.value, "5");
  assert.equal(section.inputs.slowMotion.value, "10000");
  assert.equal(section.units.pump.textContent, "W");
  assert.equal(section.units.coupler.textContent, "%");
  assert.equal(section.units.slowMotion.textContent, "×");
  assert.equal(section.hint.textContent, "1" + NB + "s = 100" + NB + "×" + NB + "10⁻⁶" + NB + "s");
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
  // Only the numbers of a bench with steady light are shown (each bench's
  // are tested in page-choose.test.js).
  assert.deepEqual(shownRows(section),
    ["pumpThreshold", "x", "gth", "tau_c", "stability", "waist", "mirrorLoss", "thermalLens", "P_out", "powerNow", "T_best", "period", "time"]);
});

test("moving a slider while paused also rewrites the output now (it depends on the mirror)", () => {
  const { browser, section } = built("en", { reducedMotion: true });
  const B = engine(browser).bench;
  const F = browser.window.LaserUI.format;
  // One photon at the start: the output now is the power of one photon,
  // which the output mirror sets.
  slide(section, "coupler", 1000);                    // 60 %
  const d = B.derive(Object.assign(B.defaultConfig(), { refl2: 0.4 }));
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
  // The coupler: 60 % at the top of its slider.
  slide(section, "coupler", 1000);
  assert.equal(section.inputs.coupler.value, "60");
  const d = engine(browser).bench.derive(Object.assign(engine(browser).bench.defaultConfig(), { pumpPower: 1, refl2: 0.4 }));
  assert.equal(section.readouts.pumpThreshold.textContent, F.si(d.pumpThreshold, "W"));
  // With no pump the gain cannot beat even the internal loss: no output
  // mirror is best, and the readout says so with a dash, not "0 %".
  slide(section, "pump", 0);
  assert.equal(section.readouts.T_best.textContent, "—");
  // Paused, the pictures were drawn again with the new numbers.
  assert.equal(browser.pendingFrames(), 0);
  assert.ok(section.recorders.photons.calls.length > 0);
  assert.ok(texts(section.recorder).includes(WORDS.bench.parts.transmission.en + " 60.0" + NB + "%"), "the bench shows the new mirror");
});

test("a slider gives round values, which the number box shows exactly", () => {
  const page = built("en", { reducedMotion: true, watch: true });
  const { section, seen } = page;
  slide(section, "pump", 673);                        // 13.46 W
  assert.equal(last(seen.configs).pumpPower, 13.46);
  assert.equal(section.inputs.pump.value, "13.46");
  // The output mirror moves by equal factors: position 300 of 1000 is
  // 0.5 % × 120^0.3 = 2.1024… %, used as 2.102 %.
  slide(section, "coupler", 300);
  assertClose(1 - last(seen.configs).refl2, 0.02102, 1e-12, "T");
  assert.equal(section.inputs.coupler.value, "2.102");
  slide(section, "slowMotion", 250);                  // 10^4.5 = 31 622.8, used as 31 620
  assert.equal(section.inputs.slowMotion.value, "31620");
  assert.equal(section.hint.textContent, "1" + NB + "s = 31.6" + NB + "×" + NB + "10⁻⁶" + NB + "s");
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
  assert.equal(section.controls.coupler.value, "672", "12.5 % between 0.5 % and 60 %");
  const d2 = B.derive(Object.assign(B.defaultConfig(), { pumpPower: 7.25, refl2: 0.875 }));
  assert.equal(section.readouts.pumpThreshold.textContent, F.si(d2.pumpThreshold, "W"));

  // The slow motion is typed as its factor.
  type(section, "slowMotion", "50000");
  assert.equal(section.hint.textContent, "1" + NB + "s = 20.0" + NB + "×" + NB + "10⁻⁶" + NB + "s");
  assert.equal(section.controls.slowMotion.value, String(Math.round(1000 * Math.log(50) / Math.log(1e6))));
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
  assert.equal(section.inputs.coupler.value, "60");

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
  // The slowest: 1 s = 1 ns.
  slide(section, "slowMotion", 1000);
  assert.equal(section.hint.textContent, "1" + NB + "s = 1.00" + NB + "×" + NB + "10⁻⁹" + NB + "s");
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
  // The pump glows as the cartoon's pump: x/4, full from 4 × threshold.
  assertClose(last(seen.bench).light.pump, 3.3068 / 4, 1e-4, "the pump's glow");
  // 10 frames at 1 s = 100 µs: the inversion builds up, the light has not
  // come yet (the first spike is about 170 µs in), so no stimulated emission.
  runFrames(page, 10);
  const start = engine(browser).bench.derive(engine(browser).bench.defaultConfig());
  const y = last(seen.after).N / start.N_c;
  assert.ok(y > 0.1, "the inversion is building up: " + y);
  assert.ok(last(seen.bench).light.beam < 1e-6, "no light yet: " + last(seen.bench).light.beam);

  slide(section, "slowMotion", 0);                    // 1 s = 1 ms
  runFrames(page, 300);                               // 5 s on screen = 5 ms simulated
  const d = engine(browser).bench.derive(engine(browser).bench.defaultConfig());
  const shown = section.readouts.powerNow.textContent;
  assert.equal(shown, browser.window.LaserUI.format.si(d.P_out, "W"), shown);
  assert.equal(section.note.hidden, true, "it kept up");
  // The beam follows the output: P_out = 2.3 × powerPerP (x − 1).
  assertClose(last(seen.bench).light.beam, d.x - 1, 0.01, "beam");
  // The gain clamped at the loss: y = 1 (§4.1).
  assertClose(last(seen.after).N / d.N_c, 1, 0.01, "y");
});

test("the chart: the output power with its steady line, up to now, from the history", () => {
  const page = built("en", { watch: true });
  const { browser, section, seen } = page;
  page.clock = 1000;
  browser.runFrame(page.clock);
  runFrames(page, 30);
  const d = engine(browser).bench.derive(engine(browser).bench.defaultConfig());
  const power = seen.chart.P;
  assert.equal(power.key, "P");
  assert.equal(power.unit, "W");
  assert.equal(power.color, "accent");
  assert.equal(power.title, WORDS.power.words.title.en);
  assert.equal(power.floor, d.powerPerP, "at least the output at twice threshold on the axis");
  assert.equal(power.floor, d.powerAtTwiceThreshold);
  assert.equal(power.shownTime, 5 / 1e4, "5 s of screen time at 1 s = 100 µs");
  assert.equal(power.lines.length, 1);
  assert.equal(power.lines[0].value, d.P_out);
  assert.equal(power.lines[0].word, WORDS.power.words.steady.en);
  assert.equal(power.cursor, null);
  section.play.fire("click");
  assert.equal(section.readouts.time.textContent, browser.window.LaserUI.format.si(power.tNow, "s"));
  // The points are the history: time in order, the latest at now.
  assert.equal(last(power.points).t, power.tNow);
  for (let i = 1; i < power.points.length; i++) assert.ok(power.points[i].t >= power.points[i - 1].t);
  // The history keeps the time and the power only (the inversion chart is
  // gone since stage 7c; the level picture shows the inversion).
  assert.deepEqual(Object.keys(last(power.points)).sort(), ["P", "t"]);
  // Below threshold the steady output is 0: no line is drawn for it.
  slide(section, "pump", 50);
  assert.equal(engine(browser).bench.derive(last(seen.configs)).P_out, 0);
  assert.deepEqual(Array.from(seen.chart.P.lines), [], "no line at 0");
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
  const chart = page.seen.chart.P;
  assert.ok(chart.tNow > 0 && chart.tNow < 1e-5, "one frame since Reset: " + chart.tNow);
  assert.equal(chart.points[0].t, 0);
  for (const point of chart.points) assert.ok(point.t <= chart.tNow, "a point from the old run: " + point.t);
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
  slide(section, "coupler", 1000);                    // 60 %
  section.reset.fire("click");
  const expected = B.derive(Object.assign(B.defaultConfig(), { refl2: 0.4 })).powerPerPhoton;
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

test("the cartoon's and the atom picture's light is the bench's ray strength, from the same function", () => {
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
    const atom = last(seen.atomDrives).drive;
    assert.equal(atom.light, UI.bench.rayAlpha(light.beam), "the atom, frame " + i);
    assert.equal(atom.medium, "nd-yag", "the atom's medium: the default bench's");
    assert.equal(atom.excited, last(seen.drives).drive.excited, "the atom's share up is the cartoon's");
  }
  assert.ok(last(seen.atomDrives).drive.light > 0.5, "the laser runs: the atom sees light");
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
    // In chunks, checking that no chart is drawn while off screen: with
    // that broken, this test drew 5000 long charts (27 s, which made the
    // mutation check time out instead of fail).
    const drawnBefore = seen.charts;
    const frames = Math.round(5.2 * rate);
    for (let done = 0; done < frames; done += 100) {
      runFrames(page, Math.min(100, frames - done), 1000 / rate);
      assert.equal(seen.charts, drawnBefore, rate + " Hz: a chart drawn while off screen");
    }
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
  assert.equal(section.readouts.powerNow.textContent, "<" + NB + "10⁻¹⁵" + NB + "W");
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
  section.canvases.power.fire("pointerdown", { offsetX: 50, pointerType: "mouse" });
  assert.equal(seen.chart.P.cursor, 50);
  section.canvases.power.fire("pointerleave", { pointerType: "mouse" });
  assert.equal(seen.chart.P.cursor, null);
});

test("the pointer over a paused chart draws that chart again, not the other pictures", () => {
  const page = built("en", { reducedMotion: true });
  const { section } = page;
  for (const recorder of Object.values(section.recorders)) recorder.calls.length = 0;
  section.canvases.power.fire("pointermove", { offsetX: 200 });
  assert.ok(section.recorders.power.calls.length > 0, "the chart under the pointer");
  for (const name of ["bench", "photons"]) {
    assert.equal(section.recorders[name].calls.length, 0, name + " is not drawn again");
  }
});

test("the pointer over the chart: its crosshair follows; leaving takes it away; the other pictures do not listen", () => {
  const page = built("en", { reducedMotion: true, watch: true });
  const { browser, section, seen } = page;
  assert.equal(seen.chart.P.cursor, null);
  const drawn = seen.charts;
  section.canvases.power.fire("pointermove", { offsetX: 200 });
  // Paused: drawn again at once.
  assert.ok(seen.charts > drawn, "drawn again");
  assert.equal(seen.chart.P.cursor, 200);
  section.canvases.power.fire("pointermove", { offsetX: 77 });
  assert.equal(seen.chart.P.cursor, 77);
  section.canvases.power.fire("pointerleave");
  assert.equal(seen.chart.P.cursor, null);
  // The other pictures do not listen for the pointer.
  for (const name of ["bench", "photons"]) {
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
  const photons = UI.photons;
  UI.photons = Object.assign({}, photons, { draw: function () { throw new Error("bad drawing"); } });
  page.clock = 1000;
  assert.throws(() => browser.runFrame(page.clock), /bad drawing/);
  assert.equal(browser.pendingFrames(), 0, "paused");
  assert.equal(section.play.textContent, "Play");
  UI.photons = photons;
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

/* ---------- rebuilds ---------- */

test("a built page has one listener on each control, dropdown and button, so a teardown has something to remove", () => {
  const { section } = built("en");
  for (const name of CONTROLS) {
    assert.equal(section.controls[name].listenerCount("input"), 1, name);
    assert.equal(section.inputs[name].listenerCount("change"), 1, name);
  }
  for (const name of ["play", "reset", "fire"]) assert.equal(section[name].listenerCount("click"), 1, name);
  for (const mirror of ["mirror1", "mirror2"]) {
    for (const shape of ["flat", "concave", "convex"]) {
      assert.equal(section.shapes[mirror][shape].listenerCount("click"), 1, mirror + " " + shape);
    }
  }
  for (const name of ["medium", "pump"]) assert.equal(section.choose[name].listenerCount("change"), 1, name);
  for (const type of ["pointerdown", "pointermove", "pointerleave"]) {
    assert.equal(section.canvases.power.listenerCount(type), 1, type);
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
  // Any one of the four is enough to build.
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
  // The bench has no names to write, only the mirror's number and the
  // distance to the output mirror's F (off the picture).
  assert.ok(texts(page.section.recorder).every((text) => text === "5.00" + NB + "%" || text === "500" + NB + "×" + NB + "10⁻³" + NB + "m"),
    texts(page.section.recorder).join(" | "));
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
