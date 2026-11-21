/* ============================================================================
   bench-qswitch.test.js — the Q-switch on the bench (js/laser/engine/bench.js,
   docs/laser-plan.md, stage 8a scope card): which setups have one
   (qSwitchesFor, withQSwitch), its fields in the config, the shutter's
   opening time and the filter's state in the simulation, the cavity's loss
   (lossNow), §4.3's giant pulse (giantPulse), and the runs themselves: a
   closed shutter holds the light back, an opened cell gives §4.3's pulse,
   a slow prism several weak ones, the filter a train of equal pulses.

   qswitch.js on its own is tested in qswitch.test.js.

   Every number a run is checked against was measured in stage 8a; every
   solver call gets a step bound about 1.5× what it needs.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine, deepFreeze, assertClose, plain, alphaWithMirrors } = require("./helpers.js");

const E = loadEngine();
const B = E.bench;
const Q = E.qswitch;

// A frozen config of that setup with that Q-switch, and changes.
function bench(medium, pump, qSwitch, changes) {
  const config = B.withQSwitch({ config: B.configFor({ medium, pump }), qSwitch });
  return deepFreeze(Object.assign(config, changes || {}));
}

// A new simulation of a flashlamp bench with the flash fired at t = 0.
function fired(cfg) {
  return B.fire({ sim: B.start(cfg), config: cfg });
}

function advance(sim, cfg, seconds, maxSteps) {
  return B.advance(deepFreeze({ sim: plain(sim), config: cfg, seconds, maxSteps }));
}

// advance that must reach its end within maxSteps (CLAUDE.md: a broken
// solver must make the test fail, not carry on from the wrong place).
function reach(sim, cfg, seconds, maxSteps) {
  const run = advance(sim, cfg, seconds, maxSteps);
  assert.equal(run.reachedEnd, true, cfg.medium + " " + cfg.qSwitch + ": " + seconds + " s needed more than " + maxSteps + " steps");
  return run;
}

// The simulation of `cfg` at time t, with some fields changed.
function simAt(cfg, t, fields) {
  return Object.assign(B.start(cfg), { t }, fields || {});
}

// Runs `seconds` in calls of `piece` seconds, each within `bound` steps,
// and gives what the page would see: the peak of every call (advance's
// peak), the energy out (the trapezoid rule on the output at the calls'
// ends), the costliest call and the filter's lowest share.
function follow(sim, cfg, seconds, piece, bound) {
  const d = B.derive(cfg);
  const peaks = [];
  let energy = 0;
  let worst = 0;
  let steps = 0;
  let lowestFilter = 1;
  let before = d.powerPerPhoton * Math.exp(sim.lnPhi);
  const count = Math.round(seconds / piece);
  for (let i = 0; i < count; i++) {
    const run = advance(sim, cfg, piece, bound);
    assert.equal(run.reachedEnd, true, cfg.medium + " " + cfg.qSwitch + ": call " + i + " needed more than " + bound + " steps");
    worst = Math.max(worst, run.steps);
    steps += run.steps;
    sim = run.sim;
    const after = d.powerPerPhoton * Math.exp(sim.lnPhi);
    energy += 0.5 * (before + after) * piece;
    before = after;
    peaks.push(run.peak);
    if (sim.absorber !== null) lowestFilter = Math.min(lowestFilter, sim.absorber);
  }
  return { sim, peaks, energy, worst, steps, lowestFilter };
}

function highest(peaks) {
  let best = peaks[0];
  for (const peak of peaks) {
    if (peak.power > best.power) best = peak;
  }
  return best;
}

// The pulses in a run: each time the calls' peaks rise past `share` of the
// run's highest, from below it. Returns their highest points, in order.
function pulsesOf(peaks, share) {
  const line = share * highest(peaks).power;
  const pulses = [];
  let inside = false;
  for (const peak of peaks) {
    if (peak.power > line) {
      if (!inside) pulses.push(peak);
      else if (peak.power > pulses[pulses.length - 1].power) pulses[pulses.length - 1] = peak;
      inside = true;
    } else {
      inside = false;
    }
  }
  return pulses;
}

// The photon-free inversion of a flash, integrated with fixed RK4 steps
// from the physics, not from bench.js (as in bench-pumps.test.js):
// four-level dy/dt′ = x(t′) − y, three-level dy/dt′ = w(t′)(n_t − y) −
// (n_t + y), with the pump of the unpumped medium. Returns y at the given
// times (in s after the flash).
function photonFreeInversion(c, times) {
  const m = E.media.get(c.medium);
  const gamma = E.cavity.singlePassLoss({ refl1: c.refl1, refl2: c.refl2, alpha_i: alphaWithMirrors(E, c), l_g: c.l_g });
  const N_c = gamma / (m.sigma * c.l_g);
  const hnuP = E.constants.h * E.constants.c / c.pumpLam;
  const V_a = c.area * c.l_g;
  const lamp = (t) => (t <= 0 ? 0 : (c.flashEnergy / c.flashTime) * (t / c.flashTime) * Math.exp(-t / c.flashTime));
  let rate;
  let y;
  if (m.scheme === "four-level") {
    const R_c = N_c / m.tau;
    rate = (tPrime, value) => c.eta * c.flashShare * lamp(tPrime * m.tau) / (hnuP * V_a) / R_c - value;
    y = 0;
  } else {
    const n_t = m.N_t / N_c;
    rate = (tPrime, value) => {
      const w = c.eta * c.flashShare * lamp(tPrime * m.tau) * m.tau / (hnuP * m.N_t * V_a);
      return w * (n_t - value) - (n_t + value);
    };
    y = -n_t;
  }
  const h = c.flashTime / m.tau / 2000;
  const out = [];
  let t = 0;
  for (const target of times.map((time) => time / m.tau)) {
    while (t < target - 1e-12) {
      const step = Math.min(h, target - t);
      const k1 = rate(t, y);
      const k2 = rate(t + step / 2, y + step / 2 * k1);
      const k3 = rate(t + step / 2, y + step / 2 * k2);
      const k4 = rate(t + step, y + step * k3);
      y += step / 6 * (k1 + 2 * k2 + 2 * k3 + k4);
      t += step;
    }
    out.push(y);
  }
  return out;
}

const FLASH_BENCHES = ["ruby", "nd-glass", "nd-yag"];

/* ---------- which setups have a Q-switch, and its fields ---------- */

test("qSwitchesFor: \"none\" for every setup; the flashlamp rods have all three; the two diode benches a filter", () => {
  const expected = {
    "ruby flashlamp": ["none", "cell", "prism", "absorber"],
    "nd-glass flashlamp": ["none", "cell", "prism", "absorber"],
    "nd-yag flashlamp": ["none", "cell", "prism", "absorber"],
    "nd-yag diode": ["none", "absorber"],
    "nd-glass diode": ["none", "absorber"]
  };
  for (const medium of E.media.list()) {
    for (const pump of B.pumpsFor(medium)) {
      const list = Array.from(B.qSwitchesFor(deepFreeze({ medium, pump })));
      assert.deepEqual(list, expected[medium + " " + pump] || ["none"], medium + " " + pump);
    }
  }
  // A new array each time: changing one changes nothing else.
  const first = B.qSwitchesFor({ medium: "ruby", pump: "flashlamp" });
  first.push("laser beam");
  assert.equal(B.qSwitchesFor({ medium: "ruby", pump: "flashlamp" }).length, 4);
  assert.throws(() => B.qSwitchesFor({ medium: "ruby", pump: "diode" }), /^Error: LaserEngine\.bench\.qSwitchesFor: /);
  assert.throws(() => B.qSwitchesFor({ medium: "ruby" }), /^Error: LaserEngine\.bench\.qSwitchesFor: /);
});

test("configFor has no Q-switch; withQSwitch adds the switch's fields with their starting values", () => {
  assert.equal(B.configFor({ medium: "ruby", pump: "flashlamp" }).qSwitch, "none");
  const delays = { ruby: 1e-3, "nd-glass": 0.6e-3, "nd-yag": 0.55e-3 };
  const filters = { ruby: ["cryptocyanine", 0.5], "nd-glass": ["cr-yag", 0.8], "nd-yag": ["cr-yag", 0.5] };
  for (const medium of FLASH_BENCHES) {
    const plainBench = deepFreeze(Object.assign(B.configFor({ medium, pump: "flashlamp" }), { flashEnergy: 7 }));
    const cell = B.withQSwitch(deepFreeze({ config: plainBench, qSwitch: "cell" }));
    assert.equal(cell.qSwitch, "cell");
    assertClose(cell.qDelay, delays[medium], 1e-12, medium + " qDelay");
    assert.equal(cell.leak, 1e-4);
    assertClose(cell.switchTime, 5e-9, 1e-12);
    // The bench's own fields are kept, a slider's value too.
    assert.equal(cell.flashEnergy, 7);
    assert.equal(cell.l_g, plainBench.l_g);
    const prism = B.withQSwitch({ config: cell, qSwitch: "prism" });
    assert.equal(prism.rotation, 500);
    assert.equal(prism.angleTolerance, 1e-3);
    assert.equal(prism.leak, 1e-4);
    assert.equal("switchTime" in prism, false, "the cell's field goes with it");
    const filter = B.withQSwitch({ config: prism, qSwitch: "absorber" });
    assert.deepEqual([filter.absorber, filter.absorberT0], filters[medium], medium);
    assert.equal("qDelay" in filter, false);
    assert.equal("rotation" in filter, false);
    const none = B.withQSwitch({ config: filter, qSwitch: "none" });
    assert.deepEqual(Object.keys(none).sort(), Object.keys(plainBench).sort());
    assert.equal(none.flashEnergy, 7);
    // derive takes each.
    for (const cfg of [cell, prism, filter, none]) B.derive(cfg);
  }
  const diode = B.withQSwitch({ config: B.configFor({ medium: "nd-yag", pump: "diode" }), qSwitch: "absorber" });
  assert.deepEqual([diode.absorber, diode.absorberT0], ["cr-yag", 0.95]);
});

test("withQSwitch refuses a Q-switch the setup does not have, and names itself", () => {
  const where = /^Error: LaserEngine\.bench\.withQSwitch: qSwitch must be one of /;
  assert.throws(() => B.withQSwitch({ config: B.configFor({ medium: "he-ne", pump: "discharge" }), qSwitch: "cell" }), where);
  assert.throws(() => B.withQSwitch({ config: B.configFor({ medium: "nd-yag", pump: "diode" }), qSwitch: "prism" }), where);
  assert.throws(() => B.withQSwitch({ config: B.configFor({ medium: "ruby", pump: "flashlamp" }), qSwitch: "mirror" }), where);
  assert.throws(() => B.withQSwitch({ config: B.configFor({ medium: "ruby", pump: "flashlamp" }) }), /^Error: LaserEngine\.bench\.withQSwitch: /);
});

test("derive: lossClosed is 1 + the closed switch's loss over γ; none without a Q-switch", () => {
  for (const medium of FLASH_BENCHES) {
    const none = B.derive(bench(medium, "flashlamp", "none"));
    assert.equal(none.qSwitch, "none");
    assert.equal(none.lossClosed, null);
    for (const kind of ["cell", "prism"]) {
      const d = B.derive(bench(medium, "flashlamp", kind));
      assert.equal(d.qSwitch, kind);
      // A round trip keeps 10⁻⁴: 4.605 per pass.
      assertClose(d.lossClosed, 1 + -0.5 * Math.log(1e-4) / d.gamma, 1e-12, medium + " " + kind);
      assertClose(d.gamma, none.gamma, 1e-12, "γ is the open cavity's");
    }
    const cfg = bench(medium, "flashlamp", "absorber");
    const d = B.derive(cfg);
    assertClose(d.lossClosed, 1 + -Math.log(cfg.absorberT0) / d.gamma, 1e-12, medium + " filter");
  }
  // §3.1's ruby: γ = 0.3466 (0.3470 with its flat mirrors' 4.1×10⁻⁴, §7.7),
  // so the closed cell's loss is 14.3 times it (14.288 with ideal mirrors).
  assertClose(B.derive(bench("ruby", "flashlamp", "cell")).lossClosed, 14.272, 1e-4);
});

test("the Q-switch's fields are checked, and every error names the function that was called", () => {
  const cell = bench("ruby", "flashlamp", "cell");
  const prism = bench("ruby", "flashlamp", "prism");
  const filter = bench("ruby", "flashlamp", "absorber");
  const bad = [
    [cell, { qDelay: -1e-3 }, /qDelay/],
    [cell, { qDelay: NaN }, /qDelay/],
    [cell, { leak: 0 }, /leak must be above 0/],
    [cell, { leak: 1.5 }, /leak/],
    [cell, { switchTime: 0 }, /switchTime/],
    [cell, { rotation: 500 }, /rotation is not one of its inputs/],
    [prism, { rotation: 0 }, /rotation/],
    [prism, { angleTolerance: -1e-3 }, /angleTolerance/],
    [prism, { rotation: 2e5 }, /rotation must be at most 100000 rev\/s/],
    [prism, { switchTime: 5e-9 }, /switchTime is not one of its inputs/],
    [filter, { absorber: "ink" }, /absorber must be one of cr-yag, cryptocyanine/],
    [filter, { absorberT0: 0 }, /absorberT0 must be above 0/],
    [filter, { absorberT0: 1.2 }, /absorberT0/],
    [filter, { qDelay: 1e-3 }, /qDelay is not one of its inputs/],
    [filter, { qSwitch: "cell" }, /qDelay/],
    [cell, { qSwitch: "fast" }, /qSwitch must be one of none, cell, prism, absorber for ruby with flashlamp/]
  ];
  for (const [base, change, pattern] of bad) {
    const cfg = Object.assign({}, base, change);
    for (const [name, call] of [
      ["derive", () => B.derive(cfg)],
      ["start", () => B.start(cfg)],
      ["advance", () => B.advance({ sim: B.start(filter), config: cfg, seconds: 1e-6, maxSteps: 10 })],
      ["lossNow", () => B.lossNow({ sim: B.start(filter), config: cfg })]
    ]) {
      assert.throws(call, (err) => err.message.startsWith("LaserEngine.bench." + name + ": ") && pattern.test(err.message),
        name + " " + JSON.stringify(change));
    }
  }
  // A Q-switch's fields on a bench without one: refused as unknown names.
  const noSwitch = Object.assign(B.configFor({ medium: "ruby", pump: "flashlamp" }), { qDelay: 1e-3 });
  assert.throws(() => B.derive(noSwitch), /^Error: LaserEngine\.bench\.derive: .*qDelay is not one of its inputs/);
});

test("flashThreshold: the open cavity's with a cell or a prism; behind a filter, the flash whose inversion reaches lossClosed", () => {
  for (const medium of FLASH_BENCHES) {
    const open = B.flashThreshold(bench(medium, "flashlamp", "none"));
    for (const kind of ["cell", "prism"]) {
      assert.equal(B.flashThreshold(bench(medium, "flashlamp", kind)), open, medium + " " + kind);
    }
  }
  // Four levels: y is proportional to the energy, so the filter's
  // threshold is the open one times lossClosed (Nd:glass with T₀ = 0.5:
  // 6.27 times 29.0 J, 182 J, above the default 100 J flash, which never
  // lased behind that filter; with the default T₀ = 0.8, 78.1 J).
  for (const [medium, T0] of [["nd-glass", 0.5], ["nd-glass", 0.8], ["nd-yag", 0.5]]) {
    const cfg = bench(medium, "flashlamp", "absorber", { absorberT0: T0 });
    const open = B.flashThreshold(bench(medium, "flashlamp", "none"));
    assertClose(B.flashThreshold(cfg), open * B.derive(cfg).lossClosed, 1e-9, medium + " T₀ = " + T0);
  }
  // Three levels, by bisection: ruby with its dye (lossClosed = 3) needs
  // 834 J, against 639 J for the open cavity. The photon-free peak of that
  // flash is lossClosed (sampled every t_p/100, as bench-pumps.test.js
  // checks the open one).
  const ruby = bench("ruby", "flashlamp", "absorber");
  const energy = B.flashThreshold(ruby);
  assertClose(energy, 834.10, 1e-4, "ruby behind its dye, J (833.97 with ideal mirrors)");
  const times = [];
  for (let i = 1; i <= 600; i++) times.push(i * ruby.flashTime / 100);
  const peak = Math.max(...photonFreeInversion(Object.assign({}, ruby, { flashEnergy: energy }), times));
  assertClose(peak, B.derive(ruby).lossClosed, 2e-4, "the peak at the threshold energy");
  // A filter so dark that even every ion up (y = n_t = 11.5) is short of
  // it: never (T₀ = 0.02, lossClosed = 12.3).
  assert.equal(B.flashThreshold(bench("ruby", "flashlamp", "absorber", { absorberT0: 0.02 })), null);
});

/* ---------- the simulation: the shutter's opening, the filter ---------- */

test("start and fire: a shutter opens qDelay after Fire, a second Fire sets it again; the filter starts recovered", () => {
  for (const kind of ["cell", "prism"]) {
    const cfg = bench("nd-yag", "flashlamp", kind, { qDelay: 0.3e-3 });
    const started = B.start(cfg);
    assert.equal(started.opensAt, null, "closed until Fire");
    assert.equal(started.absorber, null);
    const once = B.fire(deepFreeze({ sim: started, config: cfg }));
    assert.equal(once.opensAt, 0.3e-3);
    const later = Object.assign(plain(once), { t: 0.1e-3 });
    const again = B.fire(deepFreeze({ sim: later, config: Object.assign({}, cfg, { qDelay: 0.2e-3 }) }));
    assertClose(again.opensAt, 0.3e-3, 1e-12, "this flash's time + this config's qDelay");
    assert.equal(again.flash.at, 0.1e-3);
  }
  const filter = bench("nd-yag", "flashlamp", "absorber");
  assert.equal(B.start(filter).absorber, 1);
  assert.equal(B.fire({ sim: B.start(filter), config: filter }).opensAt, null);
  assert.equal(B.fire({ sim: B.start(filter), config: filter }).absorber, 1);
  const diode = bench("nd-yag", "diode", "absorber");
  assert.equal(B.start(diode).absorber, 1);
  assert.equal(B.start(diode).opensAt, null);
  const none = bench("nd-yag", "flashlamp", "none");
  assert.equal(B.fire({ sim: B.start(none), config: none }).opensAt, null);
});

test("a simulation that does not fit its bench's Q-switch is refused, and so is a strange one", () => {
  const cell = bench("ruby", "flashlamp", "cell");
  const filter = bench("ruby", "flashlamp", "absorber");
  const none = bench("ruby", "flashlamp", "none");
  const cases = [
    [none, { opensAt: 1e-3 }, /no shutter/],
    [filter, { opensAt: 1e-3 }, /no shutter/],
    [filter, { absorber: null }, /a filter's state is a number exactly when there is a filter/],
    [cell, { absorber: 1 }, /a filter's state is a number exactly when there is a filter/],
    [filter, { absorber: 1.5 }, /sim\.absorber/],
    [filter, { absorber: NaN }, /sim\.absorber/],
    [cell, { opensAt: -1 }, /sim\.opensAt/],
    [cell, { opensAt: "soon" }, /sim\.opensAt/]
  ];
  for (const [cfg, fields, pattern] of cases) {
    const sim = Object.assign(B.start(cfg), fields);
    for (const [name, call] of [
      ["advance", () => B.advance({ sim, config: cfg, seconds: 1e-6, maxSteps: 50 })],
      ["fire", () => B.fire({ sim, config: cfg })],
      ["pumpNow", () => B.pumpNow({ sim, config: cfg })],
      ["lossNow", () => B.lossNow({ sim, config: cfg })],
      ["giantPulse", () => B.giantPulse({ sim, config: cfg })]
    ]) {
      assert.throws(call, (err) => err.message.startsWith("LaserEngine.bench." + name + ": ") && pattern.test(err.message),
        name + " " + JSON.stringify(fields));
    }
  }
  // A simulation of the old bench without the stage-8a fields.
  const old = { t: 0, N: -1e25, lnPhi: 0, flash: null };
  assert.throws(() => B.advance({ sim: old, config: none, seconds: 1e-6, maxSteps: 50 }), /^Error: LaserEngine\.bench\.advance: .*opensAt/);
});

/* ---------- the cavity's loss now ---------- */

test("lossNow, the cell: closed before Fire and until the voltage falls, cos²Γ while it falls, open after", () => {
  const cfg = bench("ruby", "flashlamp", "cell");
  const d = B.derive(cfg);
  const loss = (t, opensAt) => B.lossNow(deepFreeze({ sim: simAt(cfg, t, { opensAt }), config: cfg }));
  assertClose(loss(0.5e-3, null), d.lossClosed, 1e-12, "not fired");
  assertClose(loss(0.5e-3, 1e-3), d.lossClosed, 1e-12, "fired, not yet open");
  // Half way through the switching: Γ = π/4, cos²Γ = 1/2.
  assertClose(loss(1e-3 + 2.5e-9, 1e-3), 1 + -0.5 * Math.log(1e-4 + (1 - 1e-4) / 2) / d.gamma, 1e-9, "half way");
  assert.equal(loss(1e-3 + 5e-9, 1e-3), 1, "open");
  assert.equal(loss(5e-3, 1e-3), 1, "and stays open");
  const none = bench("ruby", "flashlamp", "none");
  assert.equal(B.lossNow({ sim: B.start(none), config: none }), 1);
});

test("lossNow, the prism: lined up at opensAt and again every turn, turned away in between", () => {
  const cfg = bench("nd-yag", "flashlamp", "prism");
  const d = B.derive(cfg);
  const opensAt = 0.55e-3;
  const loss = (t) => B.lossNow({ sim: simAt(cfg, t, { opensAt }), config: cfg });
  assertClose(loss(opensAt), 1, 1e-12, "lined up");
  // θ = θ_tol 0.318 µs either side: the round trip keeps ℓ + (1 − ℓ)/e.
  const window = 1e-3 / (2 * Math.PI * 500);
  const edge = 1 + -0.5 * Math.log(1e-4 + (1 - 1e-4) / Math.E) / d.gamma;
  assertClose(loss(opensAt + window), edge, 1e-6, "after");
  assertClose(loss(opensAt - window), edge, 1e-6, "before: the prism turns into line too");
  assertClose(loss(opensAt + 0.5e-3), d.lossClosed, 1e-9, "a quarter turn on");
  assertClose(loss(opensAt + 2e-3), 1, 1e-9, "the next turn");
  assertClose(B.lossNow({ sim: simAt(cfg, 1e-3, { opensAt: null }), config: cfg }), d.lossClosed, 1e-12, "not fired");
});

test("lossNow, the filter: its depth times the share still unbleached", () => {
  const cfg = bench("nd-yag", "diode", "absorber");
  const d = B.derive(cfg);
  const depth = -Math.log(0.95) / d.gamma;
  assertClose(B.lossNow({ sim: B.start(cfg), config: cfg }), 1 + depth, 1e-12);
  assertClose(d.lossClosed, 1 + depth, 1e-12);
  assertClose(B.lossNow({ sim: simAt(cfg, 0, { absorber: 0.25 }), config: cfg }), 1 + 0.25 * depth, 1e-12);
  assert.equal(B.lossNow({ sim: simAt(cfg, 0, { absorber: 0 }), config: cfg }), 1);
});

/* ---------- the page's view of the switch (stage 8b) ---------- */

test("controls: the filter's transmission, 20–99 %, for a filter; null for every other switch and none", () => {
  for (const [medium, pump] of [["ruby", "flashlamp"], ["nd-glass", "flashlamp"], ["nd-yag", "flashlamp"], ["nd-yag", "diode"]]) {
    for (const qSwitch of B.qSwitchesFor({ medium, pump })) {
      const cfg = bench(medium, pump, qSwitch);
      const controls = B.controls(cfg);
      const label = medium + " " + pump + " " + qSwitch;
      assert.deepEqual(Object.keys(controls), ["pump", "coupler", "absorberT0", "Rc1", "Rc2"], label);
      if (qSwitch !== "absorber") {
        assert.equal(controls.absorberT0, null, label);
        continue;
      }
      assert.equal(JSON.stringify(controls.absorberT0), JSON.stringify({ name: "absorberT0", min: 0.2, max: 0.99, log: false }), label);
      // The starting value is inside the slider, and both ends derive.
      assert.ok(cfg.absorberT0 >= 0.2 && cfg.absorberT0 <= 0.99, label + ": starts at " + cfg.absorberT0);
      for (const end of [0.2, 0.99]) assert.doesNotThrow(() => B.derive(bench(medium, pump, qSwitch, { absorberT0: end })), label + " " + end);
    }
  }
  assert.equal(B.controls(B.configFor({ medium: "he-ne", pump: "discharge" })).absorberT0, null);
});

test("controls: the diode Nd:glass's filter from 0.9, where it still lases under the pump slider's top (stage 13g review)", () => {
  const cfg = bench("nd-glass", "diode", "absorber");
  const controls = B.controls(cfg);
  assert.equal(JSON.stringify(controls.absorberT0), JSON.stringify({ name: "absorberT0", min: 0.9, max: 0.99, log: false }));
  for (const end of [0.9, 0.99]) {
    const threshold = B.derive(bench("nd-glass", "diode", "absorber", { absorberT0: end })).pumpThreshold;
    assert.ok(threshold < controls.pump.max, end + ": " + threshold + " W under " + controls.pump.max + " W");
  }
  assert.ok(B.derive(bench("nd-glass", "diode", "absorber", { absorberT0: 0.85 })).pumpThreshold > controls.pump.max, "0.85 would never lase");
});

test("switchNow: null without a Q-switch; the cell's loss and how open it is, before Fire, while it switches and after", () => {
  const none = bench("ruby", "flashlamp", "none");
  assert.equal(B.switchNow(deepFreeze({ sim: B.start(none), config: none })), null);
  const cfg = bench("ruby", "flashlamp", "cell");
  const d = B.derive(cfg);
  const now = (t, opensAt) => B.switchNow(deepFreeze({ sim: simAt(cfg, t, { opensAt }), config: cfg }));
  const closed = now(0.5e-3, null);
  assertClose(closed.loss, d.lossClosed, 1e-12, "not fired");
  assert.equal(closed.open, 0, "closed");
  assert.deepEqual(Object.keys(closed), ["loss", "open"]);
  assert.equal(now(0.5e-3, 1e-3).open, 0, "fired, not yet open");
  // Half way through the switching the loss is lossNow's, and open is
  // how far it has come down from the closed loss to the open one.
  const half = now(1e-3 + 2.5e-9, 1e-3);
  const loss = B.lossNow({ sim: simAt(cfg, 1e-3 + 2.5e-9, { opensAt: 1e-3 }), config: cfg });
  assertClose(half.loss, loss, 1e-12, "the loss is lossNow's");
  assertClose(half.open, (d.lossClosed - loss) / (d.lossClosed - 1), 1e-12, "half way");
  assert.ok(half.open > 0.9 && half.open < 1, "cos²Γ = 1/2 already takes most of the loss away: " + half.open);
  const open = now(1e-3 + 5e-9, 1e-3);
  assert.equal(open.loss, 1);
  assert.equal(open.open, 1, "open");
});

test("switchNow: the filter is as open as it is bleached; one that holds nothing back is open", () => {
  const filter = bench("nd-yag", "diode", "absorber");
  const d = B.derive(filter);
  const recovered = B.switchNow({ sim: B.start(filter), config: filter });
  assert.equal(recovered.open, 0, "recovered: closed");
  assertClose(recovered.loss, d.lossClosed, 1e-12);
  const quarter = B.switchNow({ sim: simAt(filter, 0, { absorber: 0.25 }), config: filter });
  assertClose(quarter.open, 0.75, 1e-12, "a quarter unbleached");
  assertClose(quarter.loss, 1 + 0.25 * (d.lossClosed - 1), 1e-12);
  assert.equal(B.switchNow({ sim: simAt(filter, 0, { absorber: 0 }), config: filter }).open, 1, "bleached");
  // A filter that lets everything through holds nothing back: open, not 0/0.
  const clear = bench("nd-yag", "diode", "absorber", { absorberT0: 1 });
  assert.equal(JSON.stringify(B.switchNow({ sim: B.start(clear), config: clear })), JSON.stringify({ loss: 1, open: 1 }));
  const prism = bench("nd-yag", "flashlamp", "prism");
  assert.throws(() => B.switchNow({ sim: B.start(filter), config: prism }), /^Error: LaserEngine\.bench\.switchNow: /);
});

test("a steady pump behind the filter pulses: no steady numbers, and its threshold is the closed filter's", () => {
  const open = B.derive(bench("nd-yag", "diode", "none"));
  const cfg = bench("nd-yag", "diode", "absorber");
  const d = B.derive(deepFreeze(cfg));
  for (const name of ["ySteady", "P_out", "slope", "T_opt", "T_best", "period", "t_damp"]) {
    assert.equal(d[name], null, name);
    assert.notEqual(open[name], null, name + " without the filter");
  }
  // The inversion without light, x, must reach the closed loss first.
  assertClose(d.pumpThreshold, open.pumpThreshold * d.lossClosed, 1e-12, "lossClosed times the open cavity's");
  assertClose(d.x, open.x, 1e-12, "the rate equations' pump is the same");
  // Checked against a run: just under that threshold no pulse in 4 ms,
  // just over it one (the review's case: 1.8 × 1.51 W showed x = 1.8 and
  // never lased).
  function topIn(pumpPower, seconds) {
    const c = bench("nd-yag", "diode", "absorber", { pumpPower });
    let sim = B.start(c);
    let top = 0;
    for (let i = 0; i < 40; i++) {
      const run = B.advance({ sim, config: c, seconds: seconds / 40, maxSteps: 4000 });
      assert.ok(run.reachedEnd, "within its steps");
      sim = run.sim;
      top = Math.max(top, run.peak.power);
    }
    return top;
  }
  assert.ok(topIn(0.95 * d.pumpThreshold, 4e-3) < 1e-3, "under the threshold: no light");
  assert.ok(topIn(1.1 * d.pumpThreshold, 4e-3) > 100, "over it: a pulse");
  // The cell and the prism on a flash bench keep their steady numbers null
  // anyway (a flash has none), and the open cavity's x.
  const flash = B.derive(bench("ruby", "flashlamp", "cell"));
  assert.equal(flash.P_out, null);
});

test("pumpNow's overThreshold: the pump over the pump that starts the laser, the closed filter's behind one", () => {
  const filter = bench("nd-yag", "diode", "absorber");
  const d = B.derive(filter);
  const now = B.pumpNow(deepFreeze({ sim: B.start(filter), config: filter }));
  assertClose(now.overThreshold, now.x / d.lossClosed, 1e-12, "four levels: x/L");
  assertClose(now.overThreshold, filter.pumpPower / d.pumpThreshold, 1e-12, "the readouts agree");
  const plainBench = bench("nd-yag", "diode", "none");
  const free = B.pumpNow({ sim: B.start(plainBench), config: plainBench });
  assert.equal(free.overThreshold, free.x, "no filter: x");
  // Three levels behind a filter: w over the w that holds y = L without
  // light, (n_t + L)/(n_t − L).
  const ruby = bench("ruby", "flashlamp", "absorber");
  const r = B.derive(ruby);
  const fired = B.advance({ sim: B.fire({ sim: B.start(ruby), config: ruby }), config: ruby, seconds: 0.3e-3, maxSteps: 3000 });
  assert.ok(fired.reachedEnd);
  const flash = B.pumpNow({ sim: fired.sim, config: ruby });
  const startW = (r.n_t + r.lossClosed) / (r.n_t - r.lossClosed);
  assertClose(flash.overThreshold, flash.w / startW, 1e-12, "three levels");
  assert.ok(flash.overThreshold < flash.x, "the filter asks for more pump");
  // A cell or a prism: the open cavity's (Fire opens them).
  const cell = bench("ruby", "flashlamp", "cell");
  const c = B.pumpNow({ sim: fired.sim.absorber === null ? fired.sim : Object.assign({}, fired.sim, { absorber: null }), config: cell });
  assertClose(c.overThreshold, c.x, 1e-12, "a cell: x");
  // A filter even every ion up cannot overcome: null.
  const dark = bench("ruby", "flashlamp", "absorber", { absorberT0: 1e-9 });
  assert.equal(B.pumpNow({ sim: B.start(dark), config: dark }).overThreshold, null);
  // The two-level atom: none.
  const two = B.configFor({ medium: "two-level", pump: "laser" });
  assert.equal(B.pumpNow({ sim: B.start(two), config: two }).overThreshold, null);
});

test("carryOver: the run goes on with another Q-switch; a filter turned on is dark, a shutter closed until Fire", () => {
  const none = bench("ruby", "flashlamp", "none");
  let sim = B.fire({ sim: B.start(none), config: none });
  const run = B.advance({ sim, config: none, seconds: 0.4e-3, maxSteps: 4000 });
  assert.ok(run.reachedEnd);
  sim = run.sim;
  const filter = bench("ruby", "flashlamp", "absorber");
  const on = B.carryOver(deepFreeze({ sim, config: filter }));
  assert.equal(JSON.stringify(on), JSON.stringify(Object.assign({}, sim, { opensAt: null, absorber: 1 })),
    "the same atoms, photons, flash and time; the filter dark");
  assert.doesNotThrow(() => B.advance({ sim: on, config: filter, seconds: 1e-6, maxSteps: 2000 }), "it runs on");
  const cell = bench("ruby", "flashlamp", "cell");
  const fired = B.fire({ sim: on, config: filter });
  const shut = B.carryOver({ sim: Object.assign({}, fired, { absorber: 1 }), config: cell });
  assert.equal(shut.opensAt, null, "closed until the next Fire");
  assert.equal(shut.absorber, null);
  const off = B.carryOver({ sim: on, config: none });
  assert.equal(JSON.stringify(off), JSON.stringify(sim), "off: as it was");
  // A cell fired, then switched off: its opening time goes with it.
  const cellFired = B.fire({ sim: B.carryOver({ sim, config: cell }), config: cell });
  assert.notEqual(cellFired.opensAt, null, "fired: it opens");
  assert.equal(B.carryOver({ sim: cellFired, config: none }).opensAt, null, "off: no opening");
  // A flash cannot be carried to a bench without a lamp.
  const diode = bench("nd-yag", "diode", "none");
  assert.throws(() => B.carryOver({ sim, config: diode }), /^Error: LaserEngine\.bench\.carryOver: sim\.flash/);
  assert.throws(() => B.carryOver({ sim, config: diode, extra: 1 }), /^Error: LaserEngine\.bench\.carryOver: /);
  // Nor an inversion the medium cannot have: ruby's, every ion down, to
  // Nd:YAG (four levels start at 0), or more ions up than ruby has.
  const filtered = bench("nd-yag", "diode", "absorber");
  const rubyStart = B.start(none);
  assert.throws(() => B.carryOver({ sim: rubyStart, config: filtered }),
    /^Error: LaserEngine\.bench\.carryOver: sim\.N/);
  const N_t = E.media.get("ruby").N_t;
  assert.throws(() => B.carryOver({ sim: Object.assign({}, rubyStart, { N: 1.01 * N_t }), config: filter }),
    /^Error: LaserEngine\.bench\.carryOver: sim\.N/);
  for (const N of [-N_t, 0, N_t]) {
    assert.doesNotThrow(() => B.carryOver({ sim: Object.assign({}, rubyStart, { N }), config: filter }), "ruby N = " + N);
  }
  assert.doesNotThrow(() => B.carryOver({ sim: B.start(filtered), config: filtered }), "Nd:YAG N = 0");
});

/* ---------- §4.3's prediction ---------- */

test("giantPulse({ sim, config }): §4.3 with the inversion of sim; null at or below threshold and for two levels", () => {
  for (const [medium, scheme] of [["nd-yag", "four-level"], ["ruby", "three-level"]]) {
    const cfg = bench(medium, "flashlamp", "cell");
    const d = B.derive(cfg);
    const m = E.media.get(medium);
    assert.equal(B.giantPulse({ sim: B.fire({ sim: B.start(cfg), config: cfg }), config: cfg }), null, "no inversion");
    assert.equal(B.giantPulse({ sim: simAt(cfg, 0, { N: d.N_c }), config: cfg }), null, "at threshold");
    const pulse = B.giantPulse(deepFreeze({ sim: simAt(cfg, 0, { N: 3 * d.N_c }), config: cfg }));
    const expected = Q.giantPulse({
      x: 3, N_p: d.N_c, V_a: cfg.area * cfg.l_g, nu: m.nu, tau_c: d.tau_c,
      gamma: d.gamma, gammaOut: -Math.log(cfg.refl2), scheme
    });
    for (const key of ["eta_E", "energy", "peakPower", "width"]) {
      assertClose(pulse[key], expected[key], 1e-12, medium + " " + key);
    }
    assertClose(pulse.eta_E, 0.94047979, 1e-7, "§12: x = 3");
  }
  // The same prediction without a Q-switch (what a shutter would give).
  const none = bench("nd-yag", "flashlamp", "none");
  const d = B.derive(none);
  assert.ok(B.giantPulse({ sim: simAt(none, 0, { N: 2 * d.N_c }), config: none }).energy > 0);
  const two = bench("two-level", "flashlamp", "none");
  assert.equal(B.giantPulse({ sim: simAt(two, 0, { N: 0 }), config: two }), null);
});

test("giantPulse predicts a pulse only from 1 % over threshold: just above it §4.3's pulse is nothing and lasts for ever", () => {
  for (const medium of ["nd-yag", "ruby"]) {
    const cfg = bench(medium, "flashlamp", "cell");
    const d = B.derive(cfg);
    const at = (x) => B.giantPulse({ sim: simAt(cfg, 0, { N: x * d.N_c }), config: cfg });
    // At x = 1 + 10⁻⁷ the formula's "pulse" (Δτ_p ∝ η_E·x/(x − 1 − ln x),
    // about 4/(x − 1)) would be about 10⁷ times longer than at x = 3.
    assert.equal(at(1 + 1e-7), null, medium + " just above threshold");
    assert.equal(at(1.005), null, medium + " half a percent over");
    assert.equal(at(1.0099), null, medium + " just under 1 %");
    for (const x of [1.0101, 1.02]) {
      const pulse = at(x);
      assert.ok(pulse !== null && pulse.energy > 0, medium + " x = " + x);
    }
  }
});

/* ---------- the runs ---------- */

test("a closed shutter holds the light back: the inversion rises as if there were no light at all", () => {
  // qDelay 10 ms: the shutter stays closed for the whole millisecond.
  // Measured: 1727 and 1903 steps.
  for (const [medium, bound] of [["ruby", 2600], ["nd-yag", 2900]]) {
    const cfg = bench(medium, "flashlamp", "cell", { qDelay: 10e-3 });
    const d = B.derive(cfg);
    const run = advance(fired(cfg), cfg, 1e-3, bound);
    assert.equal(run.reachedEnd, true, medium + ": " + run.steps + " steps");
    // The inversion with no light at all, from the physics (measured:
    // within 2×10⁻⁵ for ruby, the seed's few photons take a little).
    const y = photonFreeInversion(cfg, [1e-3])[0];
    assertClose(run.sim.N / d.N_c, y, 1e-4, medium + ": the inversion behind the shutter");
    assert.ok(run.sim.N / d.N_c > 4, medium + ": far above the open cavity's threshold, y = " + run.sim.N / d.N_c);
    // Measured: about 10⁻⁵ W the whole time.
    assert.ok(run.peak.power < 1e-3, medium + ": " + run.peak.power + " W behind the shutter");
    // The open cavity lases in the same millisecond.
    const open = bench(medium, "flashlamp", "none");
    assert.ok(reach(fired(open), open, 1e-3, 23000).peak.power > 1e3, medium + " without the shutter");
  }
});

test("a cell opened at the inversion's peak gives §4.3's giant pulse: energy, peak and width within 1 %", () => {
  // Measured: 0.01–0.02 % from §4.3 for all three (5 ns switching), the
  // peak 43–170 ns after the voltage starts to fall.
  for (const medium of FLASH_BENCHES) {
    const cfg = bench(medium, "flashlamp", "cell");
    const opening = advance(fired(cfg), cfg, cfg.qDelay, 2800);
    assert.equal(opening.reachedEnd, true);
    const predicted = B.giantPulse({ sim: opening.sim, config: cfg });
    assert.ok(predicted.energy > 0.1, medium + ": a pulse of " + predicted.energy + " J");
    const run = follow(opening.sim, cfg, 1e-6, 0.25e-9, 20);
    const top = highest(run.peaks);
    assertClose(run.energy, predicted.energy, 0.01, medium + " energy");
    assertClose(top.power, predicted.peakPower, 0.01, medium + " peak power");
    assertClose(run.energy / top.power, predicted.width, 0.01, medium + " width");
    const delay = top.t - cfg.qDelay;
    assert.ok(delay > 20e-9 && delay < 500e-9, medium + ": the peak " + delay * 1e9 + " ns after the opening");
    assert.equal(pulsesOf(run.peaks, 0.1).length, 1, medium);
  }
});

test("§12's Q-switched ruby, rod 20 × 1.5 cm: a pulse of about 10⁻⁸ s, but several times the book's 1–2 J (D7)", () => {
  // The book (§121, item 9; §12): "10⁻⁸ s pulse, 1–2 J, 10–200 MW". Its
  // lamp energy and mirrors are not given; assumed here: a 60 cm cavity,
  // a 50 % output mirror, a flash of 1.2 times the threshold (3225 J),
  // the cell opened at the inversion's peak, 1.05 ms (measured). Measured:
  // 12.7 J, 685 MW, 18.6 ns. The width agrees; the energy is 6–13 times
  // the book's, because the model pumps the whole rod evenly and puts all
  // of it in the mode (docs/laser-plan.md, stage 8a). Not tuned to agree.
  const base = Object.assign(B.configFor({ medium: "ruby", pump: "flashlamp" }), {
    l_g: 20e-2, area: Math.PI * 0.75e-2 * 0.75e-2, L: 60e-2
  });
  const threshold = B.flashThreshold(deepFreeze(Object.assign({}, base)));
  assertClose(threshold, 2688, 0.001, "the flash threshold, J");
  const cfg = deepFreeze(Object.assign(B.withQSwitch({ config: base, qSwitch: "cell" }), {
    flashEnergy: 1.2 * threshold, qDelay: 1.05e-3
  }));
  const opening = advance(fired(cfg), cfg, cfg.qDelay, 2800);
  assert.equal(opening.reachedEnd, true);
  const run = follow(opening.sim, cfg, 1e-6, 0.25e-9, 20);
  const top = highest(run.peaks);
  const width = run.energy / top.power;
  assert.ok(width > 3e-9 && width < 30e-9, "the width, about 10⁻⁸ s: " + width * 1e9 + " ns");
  assert.ok(run.energy > 1 && run.energy < 20, "the energy, within the book's order of magnitude and above it: " + run.energy + " J");
  assert.ok(top.power > 10e6 && top.power < 2e9, top.power / 1e6 + " MW");
});

test("advance's peak: one long call across the cell's opening finds the pulse's top, between the call's ends", () => {
  // The call starts 100 µs before the opening, where the solver's steps
  // behind the closed cell are long. Measured: 645 steps for Nd:YAG and
  // 462 for ruby, the top within 0.02 % of §4.3.
  for (const [medium, bound] of [["nd-yag", 950], ["ruby", 650]]) {
    const cfg = bench(medium, "flashlamp", "cell");
    const d = B.derive(cfg);
    const before = reach(fired(cfg), cfg, cfg.qDelay - 100e-6, 2800).sim;
    const opening = reach(before, cfg, 100e-6, 30).sim;              // measured: ≤ 17
    const predicted = B.giantPulse({ sim: opening, config: cfg });
    const run = advance(before, cfg, 102e-6, bound);
    assert.equal(run.reachedEnd, true, medium + ": " + run.steps + " steps");
    assertClose(run.peak.power, predicted.peakPower, 0.01, medium + ": the top");
    assert.ok(run.peak.t > cfg.qDelay && run.peak.t < cfg.qDelay + 1e-6, medium + ": at " + run.peak.t);
    assert.ok(d.powerPerPhoton * Math.exp(run.sim.lnPhi) < 1e-3 * run.peak.power, medium + ": the pulse is over at the end");
    assert.ok(d.powerPerPhoton * Math.exp(before.lnPhi) < 1e-3 * run.peak.power, medium + ": and not begun at the start");
  }
});

test("advance's peak: the top of one short call across the giant pulse", () => {
  const cfg = bench("nd-yag", "flashlamp", "cell");
  const d = B.derive(cfg);
  const before = reach(fired(cfg), cfg, cfg.qDelay - 1e-6, 2800).sim;
  const predicted = B.giantPulse({ sim: before, config: cfg });
  const run = advance(before, cfg, 2e-6, 900);
  assert.equal(run.reachedEnd, true, run.steps + " steps");
  // The solver's steps are short at the top, so its points find it
  // (measured: within 0.1 % of §4.3).
  assertClose(run.peak.power, predicted.peakPower, 0.01, "the top");
  assert.ok(run.peak.t > cfg.qDelay && run.peak.t < cfg.qDelay + 1e-6, "at " + run.peak.t);
  assert.ok(d.powerPerPhoton * Math.exp(run.sim.lnPhi) < 1e-3 * run.peak.power, "the pulse is over at the end");
  assert.ok(d.powerPerPhoton * Math.exp(before.lnPhi) < 1e-3 * run.peak.power, "and not begun at the start");
});

test("the prism at 500 rev/s gives one pulse; turning 100 times slower, several weak ones (§9.5)", () => {
  // Measured on ruby: one pulse of 120 MW (the opening is slower than the
  // cell's, so less than the cell's 522 MW); at 5 rev/s 15 pulses, the
  // largest 0.93 MW.
  const fast = bench("ruby", "flashlamp", "prism");
  // 2 µs before it lines up the prism is 6.3 mrad away: still closed.
  const fastStart = reach(fired(fast), fast, 1e-3 - 2e-6, 2800).sim;
  const fastRun = follow(fastStart, fast, 4e-6, 2e-9, 40);
  const fastPulses = pulsesOf(fastRun.peaks, 0.1);
  assert.equal(fastPulses.length, 1);
  const cellPrediction = B.giantPulse({ sim: fastStart, config: fast }).peakPower;
  assert.ok(fastPulses[0].power > 0.1 * cellPrediction && fastPulses[0].power < cellPrediction,
    fastPulses[0].power / 1e6 + " MW against the cell's " + cellPrediction / 1e6);

  const slow = bench("ruby", "flashlamp", "prism", { rotation: 5 });
  // The window: 6 θ_tol either side, 191 µs at 5 rev/s.
  const slowStart = reach(fired(slow), slow, 1e-3 - 200e-6, 2800).sim;
  const slowRun = follow(slowStart, slow, 400e-6, 0.5e-6, 150);
  const slowPulses = pulsesOf(slowRun.peaks, 0.1);
  assert.ok(slowPulses.length >= 5, slowPulses.length + " pulses");
  assert.ok(highest(slowRun.peaks).power < 0.05 * fastPulses[0].power, highest(slowRun.peaks).power / 1e6 + " MW");
});

test("one long call across the prism's lining-up finds the pulse that short calls find; it comes before the prism lines up", () => {
  // The call starts 100 µs before the prism lines up, where the solver's
  // steps behind the closed prism are long. advance starts a new call
  // where the prism's window opens (6 θ_tol before it lines up), so the
  // call cannot step over it. Measured: ruby 1095 steps, the top 325 ns
  // before lining up; Nd:YAG 1356 steps, 283 ns before; the same top as
  // 2 ns calls to 10⁻⁴. Without the cut: 12 steps, and no pulse.
  for (const [medium, bound] of [["ruby", 1650], ["nd-yag", 2050]]) {
    const cfg = bench(medium, "flashlamp", "prism");
    const start = reach(fired(cfg), cfg, cfg.qDelay - 100e-6, 2800).sim;
    const one = advance(start, cfg, 200e-6, bound);
    assert.equal(one.reachedEnd, true, medium + ": " + one.steps + " steps");
    // The same 200 µs with 2 ns calls around the lining-up.
    const near = advance(start, cfg, 98e-6, 30);                       // measured: ≤ 17
    assert.equal(near.reachedEnd, true);
    const short = follow(near.sim, cfg, 4e-6, 2e-9, 40);
    const after = advance(short.sim, cfg, 98e-6, 260);                 // measured: ≤ 168
    assert.equal(after.reachedEnd, true);
    assertClose(one.peak.power, highest(short.peaks).power, 0.002, medium + ": the top");
    assertClose(one.sim.N, after.sim.N, 1e-3, medium + ": the inversion left");
    // Out of steps just where the window opens, the call stops there, at
    // the cut's own time, and the next call carries on to the same end.
    const cut = cfg.qDelay - 6 * cfg.angleTolerance / (2 * Math.PI * cfg.rotation);
    const toCut = reach(start, cfg, cut - start.t, 30).steps;
    const stopped = advance(start, cfg, 200e-6, toCut);
    assert.equal(stopped.reachedEnd, false, medium + ": out of steps at the cut");
    assert.equal(stopped.steps, toCut);
    assert.equal(stopped.sim.t, cut, medium + ": stopped at the cut");
    const rest = advance(stopped.sim, cfg, start.t + 200e-6 - cut, bound);
    assert.equal(rest.reachedEnd, true);
    assertClose(rest.sim.N, one.sim.N, 1e-3, medium + ": carried on to the same inversion");
    const early = cfg.qDelay - one.peak.t;
    assert.ok(early > 100e-9 && early < 600e-9, medium + ": the top " + early * 1e9 + " ns before lining up");
  }
});

test("advance's peak over a call that spans two of the prism's lining-ups is the higher pulse, the first", () => {
  // Nd:YAG with the prism at 5000 rev/s (a turn every 200 µs). It keeps
  // turning, so it also lines up 0.15 and 0.35 ms after the flash: the run
  // to 50 µs before qDelay takes 2957 steps. Measured: 0.259 MW just after
  // the lining-up at qDelay, 0.125 MW at the next; one call over both,
  // 1140 steps.
  const cfg = bench("nd-yag", "flashlamp", "prism", { rotation: 5000 });
  const opening = advance(fired(cfg), cfg, cfg.qDelay - 50e-6, 4400);
  assert.equal(opening.reachedEnd, true);
  const start = opening.sim;
  const first = advance(start, cfg, 100e-6, 900);
  const second = advance(first.sim, cfg, 200e-6, 900);
  assert.ok(first.reachedEnd && second.reachedEnd);
  assert.ok(second.peak.power < 0.7 * first.peak.power, "the second pulse is weaker");
  assert.ok(second.peak.t > cfg.qDelay + 190e-6, "and comes a turn later");
  const both = advance(start, cfg, 300e-6, 1700);
  assert.equal(both.reachedEnd, true, both.steps + " steps");
  assertClose(both.peak.power, first.peak.power, 1e-3, "the first pulse's top");
  assertClose(both.peak.t, first.peak.t, 1e-6, "at its time");
});

test("an hour-long call on the fastest prism (10⁵ rev/s, 3.6×10⁸ windows) stops within its steps at once", () => {
  // advance makes at most maxSteps cuts, each needing a step.
  const cfg = bench("nd-yag", "flashlamp", "prism", { rotation: 1e5 });
  const sim = B.fire({ sim: B.start(cfg), config: cfg });
  const started = Date.now();
  const run = advance(sim, cfg, 3600, 10);
  assert.ok(Date.now() - started < 2000, "took " + (Date.now() - started) + " ms");
  assert.equal(run.reachedEnd, false);
  assert.ok(run.steps <= 10 && run.sim.t < 1e-3, run.steps + " steps, to " + run.sim.t + " s");
});

test("the filter on ruby: held back, then one giant pulse that bleaches it; recovered after", () => {
  // Measured: the pulse at 631 µs, 210 MW; the filter falls to 2 %.
  const cfg = bench("ruby", "flashlamp", "absorber");
  const run = follow(fired(cfg), cfg, 1.5e-3, 1e-6, 3700);
  const pulses = pulsesOf(run.peaks, 0.01);
  assert.equal(pulses.length, 1, pulses.map((p) => p.t * 1e6 + " µs").join(", "));
  assert.ok(pulses[0].t > 400e-6 && pulses[0].t < 900e-6, "at " + pulses[0].t * 1e6 + " µs");
  assert.ok(pulses[0].power > 50e6, pulses[0].power / 1e6 + " MW");
  assert.ok(run.sim.absorber > 0.999, "recovered: " + run.sim.absorber);
  // The dye recovers in 22 ps, so it is bleached only while the ~20 ns
  // pulse lasts: follow those microseconds in 2 ns pieces (a 1 µs piece
  // ends wherever it ends; at stage 8a's, by chance, in the pulse's tail).
  const before = reach(fired(cfg), cfg, pulses[0].t - 2e-6, 3700).sim;
  const close = follow(before, cfg, 4e-6, 2e-9, 3700);
  assert.ok(close.lowestFilter < 0.5, "bleached to " + close.lowestFilter);
  // Without the filter ruby's first light comes earlier, as spikes.
  const open = bench("ruby", "flashlamp", "none");
  const openRun = follow(fired(open), open, 0.6e-3, 10e-6, 3000);
  const first = openRun.peaks.find((peak) => peak.power > 1e3);
  assert.ok(first && first.t < pulses[0].t, "the open cavity's first light");
});

test("the filter on the diode-pumped Nd:YAG: a train of equal pulses at a steady rate (§9.4)", () => {
  // Measured: one pulse every 299.9 µs, 2.57 kW each.
  const cfg = bench("nd-yag", "diode", "absorber");
  const run = follow(B.start(cfg), cfg, 2.2e-3, 1e-6, 750);   // measured: at most 494 a call
  const pulses = pulsesOf(run.peaks, 0.1);
  assert.ok(pulses.length >= 6, pulses.length + " pulses");
  // The first one starts from no inversion at all; the others from what
  // the last one left, so they are all alike.
  const later = pulses.slice(1);
  const gap = (later[later.length - 1].t - later[0].t) / (later.length - 1);
  assert.ok(gap > 100e-6 && gap < 1e-3, "every " + gap * 1e6 + " µs");
  for (let i = 1; i < later.length; i++) {
    assertClose(later[i].t - later[i - 1].t, gap, 0.01, "gap " + i);
    assertClose(later[i].power, later[0].power, 0.02, "pulse " + i);
  }
  // Each pulse is far above the laser without the filter (1.7 W).
  const steady = B.derive(bench("nd-yag", "diode", "none")).P_out;
  assert.ok(later[0].power > 100 * steady, later[0].power + " W against " + steady + " W");
});

/* ---------- the page's frames ---------- */

test("a page frame (8 calls, slow motion 10⁴, 60 Hz) stays within its steps around every Q-switch's pulse", () => {
  // Measured with no limit, 60 frames from 5 µs before each pulse: the
  // worst frame of each (the most of 9 runs that start a little earlier
  // or later), and 30 frames half way to it, behind the closed switch.
  // Only ruby's dye filter goes past the page's 1500 steps (its molecules
  // recover in 22 ps: its pulse costs about 3000 steps), for 1 or 2
  // frames, so the page falls that far behind there and the note does
  // not show. (Stage 10a: the flat mirrors of ruby and Nd:glass lose a
  // little light, §7.7. Ruby's worst frame of 5 starts measured 3290, stage
  // 8a's 2567; Nd:glass's filter pulse moved from 355.8 to 356.7 µs.)
  const piece = (1 / 60) / 1e4 / 8;
  const PULSE_AT = { ruby: 631e-6, "nd-glass": 356.7e-6, "nd-yag": 352.8e-6, "nd-yag diode": 322.7e-6 };
  const WORST = {
    "ruby cell": 427, "ruby prism": 650, "ruby absorber": 3290,
    "nd-glass cell": 418, "nd-glass prism": 461, "nd-glass absorber": 564,
    "nd-yag cell": 592, "nd-yag prism": 689, "nd-yag absorber": 718,
    "nd-yag diode absorber": 406
  };
  for (const name of Object.keys(WORST)) {
    const words = name.split(" ");
    const diode = words.length === 3;
    const kind = words[words.length - 1];
    const cfg = bench(words[0], diode ? "diode" : "flashlamp", kind);
    let sim = diode ? B.start(cfg) : fired(cfg);
    const event = kind === "absorber" ? PULSE_AT[diode ? "nd-yag diode" : words[0]] : cfg.qDelay;
    sim = reach(sim, cfg, event / 2, 2800).sim;
    let worst = 0;
    let over = 0;
    const frames = (count) => {
      for (let f = 0; f < count; f++) {
        let steps = 0;
        for (let i = 0; i < 8; i++) {
          // Ruby's dye pulse can fall in one call: measured up to 3067 steps.
          const run = advance(sim, cfg, piece, 4600);
          assert.equal(run.reachedEnd, true, name);
          sim = run.sim;
          steps += run.steps;
        }
        worst = Math.max(worst, steps);
        if (steps > 1500) over++;
      }
    };
    frames(30);
    assert.ok(worst <= 30, name + ": " + worst + " steps a frame behind the closed switch (measured at most 17)");
    sim = reach(sim, cfg, event - 5e-6 - sim.t, 2800).sim;
    frames(60);
    assert.ok(worst <= 1.5 * WORST[name], name + ": " + worst + " steps in a frame, measured " + WORST[name]);
    assert.ok(over <= 3, name + ": " + over + " frames over 1500 steps");
  }
});
