/* ============================================================================
   page-mirrors.test.js — the mirrors on the page (docs/laser-plan.md,
   stage 10b): each mirror's shape buttons, a curved mirror's radius slider,
   the readouts of the pair, what the bench drawing and the stability
   diagram are given, and a laser that stops when its mirrors are bent too
   far.

   Runs the real files, with the real data/laser.json, in the fake browser
   of fake-browser.js; the helpers are in page-helpers.js. The engine's
   mirrors are tested in optics.test.js and bench-mirrors.test.js, their
   drawing in draw-bench.test.js and draw-stability.test.js.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { assertClose } = require("./helpers.js");
const {
  WORDS, NB, MIRRORS, SHAPES, laserSection, sectionReady, built, last, runFrames, slide, drag, type, engine, choose
} = require("./page-helpers.js");

function B(page) {
  return engine(page.browser).bench;
}

function F(page) {
  return page.browser.window.LaserUI.format;
}

// The config the page runs now: the last one it derived.
function configNow(page) {
  return last(page.seen.configs);
}

// The shape lit for each mirror: { mirror1: "flat", mirror2: "concave" }.
function pressed(section) {
  const lit = {};
  for (const mirror of MIRRORS) {
    const on = SHAPES.filter((shape) => section.shapes[mirror][shape].getAttribute("aria-pressed") === "true");
    assert.equal(on.length, 1, mirror + ": one shape lit, got " + on.join(", "));
    lit[mirror] = on[0];
  }
  return lit;
}

test("each mirror's shape is lit, and a curved mirror shows its radius slider, for every bench", () => {
  const page = built("en", { watch: true });
  const { section } = page;
  const E = engine(page.browser);
  for (const id of E.media.list()) {
    if (id === "two-level") continue;                   // not offered (stage 12c)
    for (const pump of E.bench.pumpsFor(id)) {
      choose(section, id, pump);
      const config = E.bench.configFor({ medium: id, pump: pump });
      assert.deepEqual(pressed(section), { mirror1: config.mirror1, mirror2: config.mirror2 }, id + " " + pump);
      for (const [mirror, name] of [["mirror1", "Rc1"], ["mirror2", "Rc2"]]) {
        const curved = config[mirror] !== "flat";
        assert.equal(section.sliders[name].hidden, !curved, id + " " + pump + ": " + name + "'s row");
        if (!curved) continue;
        assert.equal(section.inputs[name].value, F(page).plain(config[name], 6), id + " " + pump + ": " + name + "'s box");
        assert.equal(section.units[name].textContent, "m");
        assert.equal(section.controls[name].getAttribute("aria-valuetext"), F(page).si(config[name], "m"));
      }
    }
  }
});

test("a shape clicked: the bench's mirror changes, the run goes on, the radius slider shows at the radius kept", () => {
  const page = built("en", { watch: true });
  const { section, seen } = page;
  choose(section, "ruby", "flashlamp");
  page.clock = 1000;
  page.browser.runFrame(page.clock);
  section.fire.fire("click");
  runFrames(page, 30);
  const before = last(seen.after);
  assert.ok(before.t > 0);
  const thresholds = seen.thresholds.length;
  // Ruby's flat output mirror bent concave: R₂ = 1 m, kept unused until now.
  section.shapes.mirror2.concave.fire("click");
  const config = configNow(page);
  assert.equal(config.mirror2, "concave");
  assert.equal(config.Rc2, 1);
  assert.deepEqual(pressed(section), { mirror1: "flat", mirror2: "concave" });
  assert.equal(section.sliders.Rc2.hidden, false, "its radius slider");
  assert.equal(section.sliders.Rc1.hidden, true);
  assert.equal(section.inputs.Rc2.value, "1");
  // The run goes on: same time, same atoms; the flash is kept.
  runFrames(page, 1);
  assert.equal(seen.sims[seen.sims.length - 1 - 7].t, before.t, "the next frame starts where the run was");
  assert.notEqual(last(seen.after).flash, null, "the flash goes on");
  // The threshold flash is found again for the new mirrors (they lose light).
  assert.equal(seen.thresholds.length, thresholds + 1);
  assert.equal(last(seen.thresholds).mirror2, "concave");
  // Clicking the shape already lit changes nothing.
  const configs = seen.configs.length;
  section.shapes.mirror2.concave.fire("click");
  assert.equal(seen.configs.length, configs);
  // Back to flat: the slider hides.
  section.shapes.mirror2.flat.fire("click");
  assert.equal(section.sliders.Rc2.hidden, true);
  assert.equal(configNow(page).Rc2, 1, "the radius is kept for the next bend");
});

test("the radius slider sets the radius; the threshold flash waits until it is let go", () => {
  const page = built("en", { reducedMotion: true, watch: true });
  const { section, seen } = page;
  choose(section, "ruby", "flashlamp");
  section.shapes.mirror2.concave.fire("click");
  const thresholds = seen.thresholds.length;
  drag(section, "Rc2", 300);
  const range = B(page).controls(configNow(page)).Rc2;
  const expected = Number(F(page).fromSlider(range, 0.3).toPrecision(4));
  assertClose(configNow(page).Rc2, expected, 1e-12, "the radius at 30 % of the log slider");
  assert.equal(seen.thresholds.length, thresholds, "no search during a drag");
  assert.equal(section.readouts.flashThreshold.textContent, "…");
  section.controls.Rc2.fire("change");
  assert.equal(seen.thresholds.length, thresholds + 1, "found when let go");
  assert.notEqual(section.readouts.flashThreshold.textContent, "…");
  // A typed radius, in metres.
  type(section, "Rc2", "0,6");
  assert.equal(configNow(page).Rc2, 0.6);
  assert.equal(section.inputs.Rc2.value, "0.6");
});

test("the readouts of the pair: stable or not, the beam's narrowest radius, the light the mirrors lose", () => {
  const page = built("en", { reducedMotion: true, watch: true });
  const { section } = page;
  // The diode bench: flat and 1 m, stable.
  let d = B(page).derive(configNow(page));
  assert.equal(section.readouts.stability.textContent, WORDS.readouts.stable.en);
  assert.equal(section.readouts.waist.textContent, F(page).si(d.resonator.w0, "m"));
  // The narrowest radius, w₀, not the beam on a mirror (on the flat back
  // mirror it is the same, so bend that one concave: the waist moves inside).
  section.shapes.mirror1.concave.fire("click");
  d = B(page).derive(configNow(page));
  assert.ok(d.resonator.w0 < 0.99 * d.resonator.w1, "the waist inside the cavity: " + d.resonator.w0 + " < " + d.resonator.w1);
  assert.equal(section.readouts.waist.textContent, F(page).si(d.resonator.w0, "m"));
  // A convex back mirror puts the waist 36 cm behind it, outside the
  // cavity: the beam is narrowest inside on mirror 1 (the review).
  section.shapes.mirror1.convex.fire("click");
  d = B(page).derive(configNow(page));
  assert.ok(d.resonator.stable && d.resonator.waistAt < 0, "a virtual waist: " + d.resonator.waistAt);
  assert.equal(section.readouts.waist.textContent, F(page).si(Math.min(d.resonator.w1, d.resonator.w2), "m"));
  assert.notEqual(section.readouts.waist.textContent, F(page).si(d.resonator.w0, "m"));
  section.shapes.mirror1.flat.fire("click");
  assert.equal(section.readouts.mirrorLoss.textContent, "<" + NB + "0.01" + NB + "%", "it loses 10⁻¹⁰");
  // Under 10⁻⁴ is "< 0.01 %", from 10⁻⁴ the number: a loss of 5 × 10⁻⁶
  // would read "0.0091 %" otherwise. He-Ne's 0.75 mm bore clips its
  // beam least, 9 × 10⁻⁵ a round trip, with its output mirror at 60 cm.
  choose(section, "he-ne", "discharge");
  type(section, "Rc2", "0.6");
  d = B(page).derive(configNow(page));
  assert.ok(d.resonator.loss > 1e-5 && d.resonator.loss < 1e-4, "a loss under 0.01 %: " + d.resonator.loss);
  assert.equal(section.readouts.mirrorLoss.textContent, "<" + NB + "0.01" + NB + "%");
  // Ruby's two flat mirrors: on the edge, no waist, 0.08 % a round trip.
  choose(section, "ruby", "flashlamp");
  d = B(page).derive(configNow(page));
  assert.equal(section.readouts.stability.textContent, WORDS.readouts.edge.en);
  assert.equal(section.readouts.waist.textContent, "—");
  assert.equal(section.readouts.mirrorLoss.textContent, F(page).number(100 * d.resonator.loss) + NB + "%");
  // A convex output mirror: unstable.
  section.shapes.mirror2.convex.fire("click");
  type(section, "Rc2", "5");
  d = B(page).derive(configNow(page));
  assert.equal(section.readouts.stability.textContent, WORDS.readouts.unstable.en);
  assert.ok(d.resonator.loss > 0.6, "M = 1.8 loses most of the light: " + d.resonator.loss);
  assert.equal(section.readouts.mirrorLoss.textContent, F(page).number(100 * d.resonator.loss) + NB + "%");
  // Every bench shows the three rows.
  for (const name of ["stability", "waist", "mirrorLoss"]) assert.equal(section.rows[name].hidden, false, name);
  // In Armenian too.
  page.browser.window.Site.lang = "hy";
  const again = laserSection(600);
  sectionReady(page.browser, "laser", again.container, WORDS);
  assert.equal(again.readouts.stability.textContent, WORDS.readouts.unstable.hy);
});

test("the bench drawing gets the cavity: its mirrors, F, the mode and the rays, from the engine; worked out only on a change", () => {
  const page = built("en", { watch: true });
  const { section, seen } = page;
  page.clock = 1000;
  page.browser.runFrame(page.clock);
  const config = configNow(page);
  const d = B(page).derive(config);
  const cavity = last(seen.bench).light.cavity;
  assert.equal(cavity.length, config.L);
  assert.equal(cavity.aperture, config.aperture);
  assert.deepEqual(JSON.parse(JSON.stringify(cavity.shapes)), { back: "flat", output: "concave" });
  assert.deepEqual(JSON.parse(JSON.stringify(cavity.focus)), { back: null, output: d.resonator.focus2 });
  // The rays start at 0.9, 0.45, −0.45 and −0.9 of the mode's width on mirror 1.
  const path = last(seen.paths);
  const starts = [0.9, 0.45, -0.45, -0.9].map((share) => share * d.resonator.w1);
  starts.forEach((y, i) => assertClose(path.starts[i], y, 1e-12, "start " + i));
  assert.equal(path.roundTrips, 4);
  assert.equal(path.points, 40);
  const expected = B(page).beamPath({ config: config, starts: path.starts, roundTrips: 4, points: 40 });
  assert.equal(JSON.stringify(cavity.mode), JSON.stringify(expected.mode));
  cavity.rays.forEach((ray, i) => {
    assert.equal(ray.y0, path.starts[i]);
    assert.equal(JSON.stringify(ray.hits), JSON.stringify(expected.rays[i].hits));
    assert.equal(ray.escaped, expected.rays[i].escaped);
  });
  // Frames do not trace again: only a change does.
  const traced = seen.paths.length;
  runFrames(page, 20);
  assert.equal(seen.paths.length, traced, "no tracing in a frame");
  drag(section, "pump", 400);
  drag(section, "coupler", 400);
  assert.equal(seen.paths.length, traced, "the pump and the coupler keep the cavity");
  // How curved each face is drawn: null for the flat mirror; for a curved
  // one its radius's place on the slider's log scale, 0 at the largest
  // radius, 1 at the smallest.
  const range = B(page).controls(config).Rc2;
  const share = Math.log(range.max / config.Rc2) / Math.log(range.max / range.min);
  assert.equal(cavity.curve.back, null, "the flat back mirror");
  assertClose(cavity.curve.output, share, 1e-12, "the output mirror's radius on its slider");
  drag(section, "Rc2", 400);
  assert.equal(seen.paths.length, traced + 1, "a radius moved: traced once");
  type(section, "Rc2", String(range.min));
  runFrames(page, 1);
  assertClose(last(seen.bench).light.cavity.curve.output, 1, 1e-9, "the smallest radius: the deepest face");
  type(section, "Rc2", String(range.max));
  runFrames(page, 1);
  assertClose(last(seen.bench).light.cavity.curve.output, 0, 1e-9, "the largest: the flattest");
  // Without a mode (ruby's flat pair): rays from half the aperture's half.
  choose(section, "ruby", "flashlamp");
  const ruby = last(seen.paths);
  assertClose(ruby.starts[0], 0.9 * configNow(page).aperture / 2, 1e-12);
});

test("the stability diagram gets the pair's g₁, g₂ and whether it is stable, and its words", () => {
  const page = built("en", { watch: true });
  const { section, seen } = page;
  page.clock = 1000;
  page.browser.runFrame(page.clock);
  let r = B(page).derive(configNow(page)).resonator;
  let drawn = last(seen.pairs);
  assert.deepEqual(JSON.parse(JSON.stringify(drawn.pair)), { g1: r.g1, g2: r.g2, stable: true });
  for (const name of ["title", "stable", "g1", "g2"]) assert.equal(drawn.words[name], WORDS.stability.words[name].en, name);
  // Bending a mirror moves the dot.
  section.shapes.mirror1.convex.fire("click");
  runFrames(page, 1);
  r = B(page).derive(configNow(page)).resonator;
  drawn = last(seen.pairs);
  assert.equal(drawn.pair.g1, r.g1);
  assert.ok(drawn.pair.g1 > 1, "a convex back mirror: g₁ > 1");
});

test("He-Ne bent too far stops: its output mirror at R = 29 cm in its 30 cm tube, the light walks out and the beam dies", () => {
  const page = built("en", { watch: true });
  const { section, seen } = page;
  choose(section, "he-ne", "discharge");
  page.clock = 1000;
  page.browser.runFrame(page.clock);
  runFrames(page, 120);
  assert.ok(last(seen.bench).light.beam > 0.5, "He-Ne lases: " + last(seen.bench).light.beam);
  type(section, "Rc2", "0.29");
  assert.equal(section.readouts.stability.textContent, WORDS.readouts.unstable.en);
  assert.equal(section.readouts.currentThreshold.textContent, WORDS.readouts.never.en);
  runFrames(page, 120);
  // A traced ray walks out within the four round trips drawn.
  assert.ok(last(seen.bench).light.cavity.rays.some((ray) => ray.escaped !== null), "a ray walks out");
  assert.ok(last(seen.bench).light.beam < 1e-3, "the beam dies: " + last(seen.bench).light.beam);
});

test("a language switch keeps the mirrors as they were set", () => {
  const page = built("en", { watch: true });
  const { section, seen } = page;
  choose(section, "nd-yag", "flashlamp");
  section.shapes.mirror2.concave.fire("click");
  type(section, "Rc2", "2");
  page.browser.window.Site.lang = "hy";
  const again = laserSection(600);
  sectionReady(page.browser, "laser", again.container, WORDS);
  assert.deepEqual(pressed(again), { mirror1: "concave", mirror2: "concave" });
  assert.equal(again.inputs.Rc2.value, "2");
  assert.equal(again.sliders.Rc2.hidden, false);
  assert.equal(last(seen.configs).Rc2, 2);
});
