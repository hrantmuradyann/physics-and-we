/* ============================================================================
   bench-pumps.test.js — js/laser/engine/bench.js with every medium and pump
   it can run (docs/laser-plan.md, stage 7b scope card): the setups
   (pumpsFor, configFor, controls), the flashlamp (fire, flashThreshold),
   the gas discharge, three-level ruby and the two-level atom.

   The pump rate per ion is set for the unpumped medium, as a lamp sets it:
     four-level            R_p = η·P/(hν_p·V_a),         x = R_p/R_c
     three- and two-level  W_p = η·P/(hν_p·N_t·V_a),     w = W_p·τ
     discharge             x = g₀(I)·l/γ
   with P the absorbed power: for a flash, share × the lamp's power
   (E/t_p)(t/t_p)e^(−t/t_p) after it is fired.

   The bench of stage 6 (Nd:YAG with diodes) is tested in bench.test.js.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine, deepFreeze, assertClose, plain } = require("./helpers.js");

const E = loadEngine();
const B = E.bench;
const C = E.constants;

function configFor(medium, pump, changes) {
  return deepFreeze(Object.assign(B.configFor({ medium, pump }), changes || {}));
}

// A new simulation of this bench with a flash fired at t = 0.
function fired(cfg) {
  return B.fire({ sim: B.start(cfg), config: cfg });
}

function advance(sim, cfg, seconds, maxSteps) {
  return B.advance(deepFreeze({ sim: plain(sim), config: cfg, seconds, maxSteps }));
}

// The output power the simulation shows: W per photon × the photon count.
function powerOf(sim, derived) {
  return derived.powerPerPhoton * Math.exp(sim.lnPhi);
}

// Runs `seconds` in `count` equal pieces, each within `bound` steps, and
// returns the samples { t, N, P } after each piece and the costliest piece.
function follow(sim, cfg, seconds, count, bound) {
  const d = B.derive(cfg);
  const samples = [];
  let worst = 0;
  for (let i = 0; i < count; i++) {
    const run = advance(sim, cfg, seconds / count, bound);
    assert.equal(run.reachedEnd, true, cfg.medium + ": piece " + i + " needed more than " + bound + " steps");
    worst = Math.max(worst, run.steps);
    sim = run.sim;
    samples.push({ t: sim.t, N: sim.N, P: powerOf(sim, d) });
  }
  return { sim, samples, worst };
}

// Every pair the bench runs, in the order of the media list.
const PAIRS = [
  ["ruby", "flashlamp"],
  ["nd-glass", "flashlamp"],
  ["nd-yag", "diode"],
  ["nd-yag", "flashlamp"],
  ["he-ne", "discharge"],
  ["ar-ion", "discharge"],
  ["co2", "discharge"],
  ["dye-r6g", "laser"],
  ["ti-sapphire", "laser"],
  ["two-level", "laser"],
  ["two-level", "flashlamp"]
];

const COMMON = ["medium", "pump", "l_g", "area", "L", "refl1", "refl2", "alpha_i", "beta"];
const BY_KIND = {
  diode: ["pumpPower", "pumpLam", "eta"],
  laser: ["pumpPower", "pumpLam", "eta"],
  flashlamp: ["flashEnergy", "flashShare", "flashTime", "pumpLam", "eta"],
  discharge: ["current", "currentPeak", "gainPeak"]
};

/* ---------- the setups ---------- */

test("pumpsFor: the pumps the bench runs each medium with, in the dropdown's order", () => {
  const expected = {
    "ruby": ["flashlamp"], "nd-glass": ["flashlamp"], "nd-yag": ["diode", "flashlamp"],
    "caf2-dy": [], "he-ne": ["discharge"], "ar-ion": ["discharge"], "co2": ["discharge"],
    "diode": [], "dye-r6g": ["laser"], "ti-sapphire": ["laser"], "two-level": ["laser", "flashlamp"]
  };
  assert.deepEqual(plain(E.media.list()).sort(), Object.keys(expected).sort(), "every medium is listed");
  for (const id of E.media.list()) {
    assert.deepEqual(plain(B.pumpsFor(id)), expected[id], id);
    // Only pumps the media table says the medium can use.
    for (const pump of B.pumpsFor(id)) assert.ok(E.media.get(id).pumps.includes(pump), id + ": " + pump);
  }
  const pairs = [];
  for (const id of E.media.list()) for (const pump of B.pumpsFor(id)) pairs.push([id, pump]);
  assert.deepEqual(pairs, PAIRS, "PAIRS in this file is the whole list");
  assert.throws(() => B.pumpsFor("unobtainium"), /^Error: LaserEngine\.bench\.pumpsFor: .*unobtainium/);
});

test("configFor: a new config with the fields of its pump kind, which derive accepts", () => {
  for (const [medium, pump] of PAIRS) {
    const c = B.configFor(deepFreeze({ medium, pump }));
    assert.equal(c.medium, medium);
    assert.equal(c.pump, pump);
    assert.deepEqual(Object.keys(c).sort(), COMMON.concat(BY_KIND[pump]).sort(), medium + " + " + pump);
    assert.doesNotThrow(() => B.derive(deepFreeze(plain(c))), medium + " + " + pump);
    c.l_g = 99;
    assert.notEqual(B.configFor({ medium, pump }).l_g, 99, "each call gives a new object");
  }
  assert.deepEqual(plain(B.defaultConfig()), plain(B.configFor({ medium: "nd-yag", pump: "diode" })), "the default bench");
  assert.throws(() => B.configFor({ medium: "ruby", pump: "diode" }), /^Error: LaserEngine\.bench\.configFor: pump must be one of flashlamp/);
  assert.throws(() => B.configFor({ medium: "caf2-dy", pump: "lamp" }), /^Error: LaserEngine\.bench\.configFor: .*cannot be simulated yet/);
  assert.throws(() => B.configFor({ medium: "ruby", pump: "flashlamp", pumpPower: 5 }), /pumpPower is not one of its inputs/);
});

test("controls: the field the pump slider sets and both sliders' ranges, with the defaults inside them", () => {
  const expected = {
    "ruby flashlamp": ["flashEnergy", 3000],
    "nd-glass flashlamp": ["flashEnergy", 300],
    "nd-yag diode": ["pumpPower", 20],
    "nd-yag flashlamp": ["flashEnergy", 50],
    "he-ne discharge": ["current", 0.015],
    "ar-ion discharge": ["current", 40],
    "co2 discharge": ["current", 0.06],
    "dye-r6g laser": ["pumpPower", 10],
    "ti-sapphire laser": ["pumpPower", 10],
    "two-level laser": ["pumpPower", 1000],
    "two-level flashlamp": ["flashEnergy", 10]
  };
  for (const [medium, pump] of PAIRS) {
    const c = configFor(medium, pump);
    const controls = B.controls(c);
    const control = controls.pump;
    const [name, max] = expected[medium + " " + pump];
    assert.equal(control.name, name, medium + " " + pump);
    assert.equal(control.min, 0);
    assertClose(control.max, max, 1e-12, medium + " " + pump + " max");
    assert.equal(control.log, false);
    assert.ok(c[name] > control.min && c[name] < control.max, medium + " " + pump + ": default " + c[name]);
    if (pump === "discharge") {
      const law = medium === "ar-ion" ? "square" : "optimum";
      assertClose(control.max, E.pumps.dischargeMax({ law, currentPeak: c.currentPeak }), 1e-12, "the law's highest current");
    }
    // The coupler, T = 1 − R₂: one log range for every bench, with every
    // default inside it (ruby's is 50 %, §3.1).
    assert.deepEqual(plain(controls.coupler), { min: 0.005, max: 0.6, log: true }, medium + " " + pump + " coupler");
    const T = 1 - c.refl2;
    assert.ok(T >= controls.coupler.min && T <= controls.coupler.max, medium + " " + pump + ": default coupler " + T);
    // Every corner of the two sliders derives.
    for (const end of [control.min, control.max]) {
      for (const coupler of [controls.coupler.min, controls.coupler.max]) {
        assert.doesNotThrow(() => B.derive(configFor(medium, pump, { [name]: end, refl2: 1 - coupler })),
          medium + " " + pump + " at " + end + ", T = " + coupler);
      }
    }
  }
  // A discharge's top follows the config's own peak current: He-Ne at 4 mA ends at 12 mA, which derives.
  const smaller = configFor("he-ne", "discharge", { currentPeak: 4e-3, current: 4e-3 });
  assertClose(B.controls(smaller).pump.max, 12e-3, 1e-12, "the top for a 4 mA peak");
  assert.doesNotThrow(() => B.derive(configFor("he-ne", "discharge", { currentPeak: 4e-3, current: B.controls(smaller).pump.max })));
  // The stage-6 bench: 0–20 W of diode light, 0.5–60 % (RANGES, which the
  // stage-6 page used, is gone since stage 7c).
  assert.deepEqual(plain(B.controls(configFor("nd-yag", "diode"))), {
    pump: { name: "pumpPower", min: 0, max: 20, log: false },
    coupler: { min: 0.005, max: 0.6, log: true }
  });
  assert.equal(B.RANGES, undefined);
  assert.throws(() => B.controls(Object.assign({}, B.configFor({ medium: "he-ne", pump: "discharge" }), { pump: "laser" })),
    /^Error: LaserEngine\.bench\.controls: pump must be one of discharge/);
});

/* ---------- the numbers of each setup (audit) ---------- */

test("the setups' numbers (audit, 5 digits; the scope card's prototype gave the first 3)", () => {
  const expected = {
    "he-ne discharge": { tau_c: 117.38e-9, gth: 0.028418, x: 5.0672, P_out: 0.42773e-3, currentThreshold: 0.36139e-3 },
    "ar-ion discharge": { tau_c: 93.575e-9, gth: 0.035647, x: 36.294, P_out: 0.25162, currentThreshold: 4.9797 },
    "co2 discharge": { tau_c: 23.090e-9, gth: 0.14446, x: 7.6143, P_out: 8.2319, currentThreshold: 0.93073e-3 },
    "dye-r6g laser": { pumpThreshold: 0.042420, x: 47.148, P_out: 1.6288, eps: 20.556 },
    "ti-sapphire laser": { pumpThreshold: 0.14853, x: 33.664, P_out: 2.7713 }
  };
  for (const key of Object.keys(expected)) {
    const [medium, pump] = key.split(" ");
    const d = B.derive(configFor(medium, pump));
    for (const name of Object.keys(expected[key])) {
      assertClose(d[name], expected[key][name], 1e-4, key + " " + name);
    }
  }
  // Ar⁺ at its rated current, 40 A (the default is 30 A): x = 64.5, 0.453 W.
  const ar = B.derive(configFor("ar-ion", "discharge", { current: 40 }));
  assertClose(ar.x, 64.522, 1e-4, "Ar⁺ x");
  assertClose(ar.P_out, 0.45288, 1e-4, "Ar⁺ P_out");
});

test("§3.1's ruby on the bench: n_t = 11.54, ε = 1.848×10⁻⁶, threshold about 639 J of lamp energy", () => {
  const c = configFor("ruby", "flashlamp");
  const d = B.derive(c);
  assert.equal(d.scheme, "three-level");
  assertClose(d.n_t, 11.54, 0.005 / 11.54, "n_t");
  assertClose(d.eps, 1.848e-6, 0.0005 / 1.848, "ε");
  assertClose(d.wThreshold, 1.190, 0.0005 / 1.19, "w_th");
  assertClose(d.N_t, 1.6e25, 1e-12, "N_t, m⁻³");
  // The prototype gave 639 J, 1.29 J and 29.0 J; these are 5 digits of the engine's.
  assertClose(B.flashThreshold(c), 638.68, 1e-4, "E_th, J");
  assertClose(B.flashThreshold(configFor("nd-yag", "flashlamp")), 1.2932, 1e-4, "Nd:YAG E_th, J");
  assertClose(B.flashThreshold(configFor("nd-glass", "flashlamp")), 28.969, 1e-4, "Nd:glass E_th, J");
  // The pump at the flash's peak, in units of threshold, at the default energies.
  assertClose(d.xPeak, 5.7229, 1e-4, "ruby at 1000 J");
  assertClose(B.derive(configFor("nd-yag", "flashlamp")).xPeak, 9.6939, 1e-4, "Nd:YAG at 10 J");
  assertClose(B.derive(configFor("nd-glass", "flashlamp")).xPeak, 4.6917, 1e-4, "Nd:glass at 100 J");
});

/* ---------- derive, by pump kind ---------- */

test("derive with a discharge: x = g₀(I)·l/γ, the threshold current, and no pump power", () => {
  for (const [medium, law] of [["he-ne", "optimum"], ["co2", "optimum"], ["ar-ion", "square"]]) {
    const c = configFor(medium, "discharge");
    const d = B.derive(c);
    const g0 = E.pumps.dischargeGain({ law, current: c.current, currentPeak: c.currentPeak, gainPeak: c.gainPeak });
    assertClose(d.g0, g0, 1e-12, medium + " g₀");
    assertClose(d.x, g0 * c.l_g / d.gamma, 1e-12, medium + " x");
    assertClose(d.P_out, d.powerPerP * (d.x - 1), 1e-12, medium + " P_out");
    const I_th = E.pumps.dischargeThreshold({ law, currentPeak: c.currentPeak, gainPeak: c.gainPeak, gth: d.gth });
    assertClose(d.currentThreshold, I_th, 1e-12, medium + " threshold current");
    assertClose(B.derive(configFor(medium, "discharge", { current: I_th })).x, 1, 1e-9, medium + ": x = 1 at the threshold current");
    assert.equal(d.pumpThreshold, null);
    assert.equal(d.slope, null);
    assert.equal(d.R_p, null);
    assert.equal(d.flashPeak, null);
    const below = B.derive(configFor(medium, "discharge", { current: 0.5 * I_th }));
    assert.equal(below.P_out, 0, medium + ": no output below the threshold current");
  }
  // He-Ne has internal loss, so a best coupler, from its own g₀.
  const he = B.derive(configFor("he-ne", "discharge"));
  assertClose(he.T_opt, E.cavity.optimumCoupler({ g0: he.g0, l_g: 0.3, L_i: 2 * 0.01 * 0.3 }), 1e-12, "He-Ne T_opt");
  // Past the zero-gain current nothing lases, and the tube gives no threshold if it never reaches g_th.
  const end = B.derive(configFor("he-ne", "discharge", { current: 0.015 }));
  assert.ok(end.x >= 0 && end.x < 1e-12, "no gain at 3·I_peak: x = " + end.x);
  assert.equal(end.P_out, 0);
  assert.equal(B.derive(configFor("he-ne", "discharge", { gainPeak: 0.01 })).currentThreshold, null);
});

test("derive with a flashlamp: the flash's peak and the pump at the peak, no steady numbers", () => {
  for (const [medium] of PAIRS.filter(([, pump]) => pump === "flashlamp")) {
    const c = configFor(medium, "flashlamp");
    const d = B.derive(c);
    const label = medium + ": ";
    assertClose(d.flashPeak, c.flashEnergy / (Math.E * c.flashTime), 1e-12, label + "lamp peak, W");
    const hnuP = E.units.photonEnergy(c.pumpLam);
    const V_a = c.area * c.l_g;
    const absorbedPeak = c.eta * c.flashShare * d.flashPeak;
    if (d.scheme === "four-level") {
      assertClose(d.xPeak, absorbedPeak / (hnuP * V_a) / d.R_c, 1e-12, label + "x at the peak");
    } else if (d.scheme === "three-level") {
      assertClose(d.xPeak, absorbedPeak * d.tau / (hnuP * d.N_t * V_a) / d.wThreshold, 1e-12, label + "w/w_th at the peak");
    } else {
      assert.equal(d.xPeak, null, label + "two levels have no threshold");
    }
    for (const name of ["x", "P_out", "pumpThreshold", "slope", "T_opt", "T_best", "period", "t_damp", "ySteady", "currentThreshold"]) {
      assert.equal(d[name], null, label + name);
    }
  }
});

test("derive with the two-level atom: no threshold, no x, a negative steady inversion and no output", () => {
  const c = configFor("two-level", "laser");
  const d = B.derive(c);
  assert.equal(d.scheme, "two-level");
  assert.equal(d.x, null, "there is no threshold to measure the pump by");
  assert.equal(d.P_out, 0);
  assert.equal(d.wThreshold, null);
  assert.equal(d.pumpThreshold, null);
  const hnu = E.units.photonEnergy(c.pumpLam);
  assertClose(d.w, c.eta * c.pumpPower * d.tau / (hnu * d.N_t * c.area * c.l_g), 1e-12, "w = W_p·τ");
  const ss = E.rates.twoLevel.steadyState({ w: d.w, n_t: d.n_t, beta: c.beta });
  assertClose(d.ySteady, ss.y, 1e-12, "ySteady");
  assert.ok(d.ySteady < 0, "never inverted: " + d.ySteady);
  // The pump at the line itself, since there is no other level to absorb into.
  assertClose(c.pumpLam, E.media.get("two-level").lam, 1e-12, "pumpLam = λ");
  // Ten times the pump: closer to 0, still below.
  const strong = B.derive(configFor("two-level", "laser", { pumpPower: 10 * c.pumpPower }));
  assertClose(strong.w, 10 * d.w, 1e-12, "w grows with the pump");
  assert.ok(strong.ySteady > d.ySteady && strong.ySteady < 0, "10× the pump: " + strong.ySteady);
  assert.equal(B.flashThreshold(configFor("two-level", "flashlamp")), null, "no flash ever makes it lase");
});

test("derive with continuous light reports the steady inversion: y of rates.fourLevel.steadyState", () => {
  for (const [medium, pump] of [["nd-yag", "diode"], ["dye-r6g", "laser"], ["ti-sapphire", "laser"]]) {
    const d = B.derive(configFor(medium, pump));
    assertClose(d.ySteady, E.rates.fourLevel.steadyState({ x: d.x, beta: 1e-8 }).y, 1e-12, medium);
    assert.equal(d.scheme, "four-level");
    assert.equal(d.n_t, null);
  }
});

test("powerAtTwiceThreshold is the steady output at twice threshold, for four and three levels (not powerPerP for ruby)", () => {
  // Four levels: the diode bench pumped at twice its threshold power.
  const yag = B.derive(configFor("nd-yag", "diode"));
  const twice = B.derive(configFor("nd-yag", "diode", { pumpPower: 2 * yag.pumpThreshold }));
  assertClose(twice.x, 2, 1e-12, "x");
  assertClose(yag.powerAtTwiceThreshold, twice.P_out, 1e-12, "Nd:YAG");
  assertClose(yag.powerAtTwiceThreshold, yag.powerPerP, 1e-12, "four levels: p = 1");
  // Three levels: ruby's steady photons at w = 2·w_th, without the seed.
  const ruby = B.derive(configFor("ruby", "flashlamp"));
  const steady = E.rates.threeLevel.steadyState({ w: 2 * ruby.wThreshold, n_t: ruby.n_t, beta: 0 });
  assertClose(ruby.powerAtTwiceThreshold, steady.p * ruby.powerPerP, 1e-12, "ruby");
  assertClose(ruby.powerAtTwiceThreshold / ruby.powerPerP, ruby.n_t + 1, 1e-12, "p = n_t + 1 = 12.5");
  // Two levels, with no threshold, use the three-level value for the same ions.
  const two = B.derive(configFor("two-level", "laser"));
  assertClose(two.powerAtTwiceThreshold, two.powerPerP * (two.n_t + 1), 1e-12, "two levels");
});

/* ---------- the simulation: start, fire, flash ---------- */

test("start(config): no inversion for four levels, every ion down for three and two; one photon; no flash yet", () => {
  for (const [medium, pump] of PAIRS) {
    const c = configFor(medium, pump);
    const d = B.derive(c);
    const sim = B.start(c);
    const N = d.scheme === "four-level" ? 0 : -d.N_t;
    assert.deepEqual(plain(sim), { t: 0, N, lnPhi: 0, flash: null }, medium + " + " + pump);
  }
  assert.throws(() => B.start(configFor("ruby", "flashlamp", { flashTime: 0 })), /^Error: LaserEngine\.bench\.start: flashTime/);
});

test("fire({ sim, config }): a copy that remembers when the flash went off and what it was; a second flash replaces the first", () => {
  const c = configFor("ruby", "flashlamp");
  const sim = deepFreeze({ t: 2e-3, N: -1e25, lnPhi: 3, flash: null });
  const fired = B.fire(deepFreeze({ sim, config: c }));
  assert.deepEqual(plain(fired), { t: 2e-3, N: -1e25, lnPhi: 3, flash: { at: 2e-3, flashEnergy: 1000, flashTime: 0.3e-3 } });
  const stronger = configFor("ruby", "flashlamp", { flashEnergy: 2000 });
  const again = B.fire(deepFreeze({ sim: Object.assign({}, fired, { t: 3e-3 }), config: stronger }));
  assert.deepEqual(plain(again.flash), { at: 3e-3, flashEnergy: 2000, flashTime: 0.3e-3 });
  assert.throws(() => B.fire({ sim: { t: -1, N: 0, lnPhi: 0, flash: null }, config: c }), /^Error: LaserEngine\.bench\.fire: sim\.t/);
  assert.throws(() => B.fire({ sim, config: configFor("nd-yag", "diode") }), /^Error: LaserEngine\.bench\.fire: needs a config with pump: "flashlamp"/);
  assert.throws(() => B.fire(sim), /^Error: LaserEngine\.bench\.fire: t is not one of its inputs/);
  // advance carries the flash on, a copy of it. Called directly: the
  // advance() helper of this file hands the engine a copy of the sim.
  const first = deepFreeze(B.fire({ sim: B.start(c), config: c }));
  const run = B.advance({ sim: first, config: c, seconds: 1e-6, maxSteps: 660 });   // measured: 439 steps
  assert.equal(run.reachedEnd, true);
  assert.deepEqual(plain(run.sim.flash), plain(first.flash));
  assert.notEqual(run.sim.flash, first.flash, "a new object");
  const none = B.advance({ sim: first, config: c, seconds: 0, maxSteps: 1 });
  assert.deepEqual(plain(none.sim.flash), plain(first.flash));
  assert.notEqual(none.sim.flash, first.flash, "a new object for 0 s too");
});

test("a flash keeps the energy and t_p it was fired with: moving the sliders after Fire changes only the next flash", () => {
  // Ruby fired at 1000 J; after 0.2 ms the energy slider goes to 0 and the
  // flash time is doubled. The flash that runs must not notice.
  const c = configFor("ruby", "flashlamp");
  const changed = configFor("ruby", "flashlamp", { flashEnergy: 0, flashTime: 0.6e-3 });
  let kept = B.fire({ sim: B.start(c), config: c });
  let moved = kept;
  for (const [i, seconds] of [[0, 0.2e-3], [1, 0.1e-3], [2, 0.1e-3]]) {
    const a = advance(kept, c, seconds, 2300);                     // measured: ≤ 1523
    const b = advance(moved, i === 0 ? c : changed, seconds, 2300);
    assert.ok(a.reachedEnd && b.reachedEnd, "piece " + i);
    kept = a.sim;
    moved = b.sim;
  }
  assertClose(moved.N, kept.N, 1e-9, "the inversion 0.4 ms after Fire");
  assertClose(moved.lnPhi, kept.lnPhi, 1e-9, "the photons", 1e-9);
});

// The photon-free inversion of a flash, integrated here with fixed RK4
// steps from the physics, not from bench.js: four-level dy/dt′ = x(t′) − y,
// three-level dy/dt′ = w(t′)(n_t − y) − (n_t + y), with the pump of the
// unpumped medium. Returns y at the given times (in s after the flash).
function photonFreeInversion(c, times) {
  const m = E.media.get(c.medium);
  const gamma = E.cavity.singlePassLoss({ refl1: c.refl1, refl2: c.refl2, alpha_i: c.alpha_i, l_g: c.l_g });
  const N_c = gamma / (m.sigma * c.l_g);
  const hnuP = C.h * C.c / c.pumpLam;
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

test("the flash pumps as the physics says: the inversion of a weak flash follows the photon-free equation", () => {
  // Half the threshold energy: no light to speak of, so the inversion is
  // the pump's alone. This pins the flash's shape and size, the absorbed
  // share, η, hν_p, V_a, N_t and τ in the pump rate.
  for (const [medium] of [["ruby"], ["nd-yag"], ["nd-glass"]]) {
    const base = configFor(medium, "flashlamp");
    const c = configFor(medium, "flashlamp", { flashEnergy: 0.5 * B.flashThreshold(base) });
    const d = B.derive(c);
    const times = [0.1e-3, 0.3e-3, 0.6e-3, 1.2e-3];
    const expected = photonFreeInversion(c, times);
    let sim = fired(c);
    let last = 0;
    times.forEach((time, i) => {
      const run = advance(sim, c, time - last, 2000);                     // measured: ≤ 1316
      assert.equal(run.reachedEnd, true, medium + ": within 2000 steps");
      sim = run.sim;
      last = time;
      assertClose(sim.N / d.N_c, expected[i], 1e-4, medium + " y at " + time * 1e3 + " ms", 1e-6 * (d.n_t || 1));
    });
  }
});

test("flashThreshold: the energy whose photon-free inversion just reaches threshold (bisection here, RK4)", () => {
  for (const medium of ["ruby", "nd-yag", "nd-glass"]) {
    const c = configFor(medium, "flashlamp");
    const E_th = B.flashThreshold(c);
    // y peaks within 6 t_p for these media; sampled every t_p/100.
    const peak = (energy) => {
      const times = [];
      for (let i = 1; i <= 600; i++) times.push(i * c.flashTime / 100);
      return Math.max(...photonFreeInversion(Object.assign({}, c, { flashEnergy: energy }), times));
    };
    assert.ok(peak(0.999 * E_th) < 1 && peak(1.001 * E_th) > 1, medium + ": y_max crosses 1 within 0.1 % of " + E_th + " J");
    assertClose(peak(E_th), 1, 2e-4, medium + ": y_max(E_th)");
  }
  assert.throws(() => B.flashThreshold(configFor("nd-yag", "diode")), /^Error: LaserEngine\.bench\.flashThreshold: .*flashlamp/);
});

test("ruby: a flash 5 % under the threshold gives no laser light, 5 % over gives a spike", () => {
  const base = configFor("ruby", "flashlamp");
  const E_th = B.flashThreshold(base);
  const results = {};
  for (const share of [0.95, 1.05]) {
    const c = configFor("ruby", "flashlamp", { flashEnergy: share * E_th });
    const run = follow(fired(c), c, 1.5e-3, 300, 1100);        // measured: ≤ 725 a piece
    results[share] = Math.max(...run.samples.map((sample) => sample.P));
  }
  // Under: spontaneous light only, amplified near threshold (measured: 0.16 mW).
  assert.ok(results[0.95] < 1, "0.95 E_th: " + results[0.95] + " W");
  // Over: a laser spike (measured: 31 kW, sampled every 5 µs).
  assert.ok(results[1.05] > 1e3, "1.05 E_th: " + results[1.05] + " W");
});

test("ruby at 1000 J: first light after a delay of 0.2–0.8 ms, then spikes 1–50 µs apart (§12)", () => {
  const c = configFor("ruby", "flashlamp");
  // 1 µs pieces: a spike lasts about 0.1 µs, so the samples see each one
  // by its tail; the spacing comes from the samples' maxima.
  // Measured: first light at 0.47 ms, spikes 5–7 µs apart, ≤ 439 steps a piece.
  const run = follow(fired(c), c, 1.2e-3, 1200, 660);
  const samples = run.samples;
  const first = samples.find((sample) => sample.P > 1);
  assert.ok(first, "the laser fires");
  assert.ok(first.t >= 0.2e-3 && first.t <= 0.8e-3, "first light at " + first.t * 1e3 + " ms");
  const peaks = [];
  for (let i = 1; i < samples.length - 1; i++) {
    const [a, b, c2] = [samples[i - 1].P, samples[i].P, samples[i + 1].P];
    if (b > a && b >= c2 && b > 1e3) peaks.push(samples[i].t);
  }
  assert.ok(peaks.length >= 3, peaks.length + " spikes");
  const gaps = peaks.slice(1, 5).map((time, i) => time - peaks[i]);
  for (const gap of gaps) assert.ok(gap >= 1e-6 && gap <= 50e-6, "spike spacing " + gap * 1e6 + " µs");
  // The inversion stays clamped near threshold while it spikes, above −N_t.
  assert.ok(samples.every((sample) => sample.N >= -B.derive(c).N_t), "N ≥ −N_t");
});

test("He-Ne switched on rises to its steady output without overshooting (D3: no visible oscillation)", () => {
  // At 5 mA (x = 5.07) He-Ne is overdamped: derive gives no period. From
  // one photon the light takes about 6τ to build up, then rises
  // monotonically: within 1 % by 11τ (measured), 10⁻⁵ by 20τ.
  const c = configFor("he-ne", "discharge");
  const d = B.derive(c);
  assert.equal(d.period, null, "overdamped");
  const run = follow(B.start(c), c, 20 * d.tau, 40, 75);            // measured: ≤ 50 a piece
  const powers = run.samples.map((sample) => sample.P);
  assertClose(powers[23], d.P_out, 0.01, "P_out after 12τ");
  assertClose(powers[39], d.P_out, 1e-4, "P_out after 20τ");
  for (let i = 1; i < powers.length; i++) {
    assert.ok(powers[i] >= powers[i - 1] * (1 - 1e-9), "falls at " + run.samples[i].t + " s");
  }
  assert.ok(Math.max(...powers) <= d.P_out * (1 + 1e-4), "no overshoot: " + Math.max(...powers) / d.P_out);
});

test("the two-level atom on the bench: never inverted, by the strongest laser or flash", () => {
  for (const [pump, changes] of [["laser", { pumpPower: 1000 }], ["flashlamp", { flashEnergy: 10 }]]) {
    const c = configFor("two-level", pump, changes);
    const d = B.derive(c);
    const start = pump === "flashlamp" ? fired(c) : B.start(c);
    const run = follow(start, c, 3e-3, 60, 1930);                     // measured: ≤ 1284 a piece
    for (const sample of run.samples) {
      assert.ok(sample.N < 0, pump + ": N = " + sample.N + " at " + sample.t);
      assert.ok(sample.N >= -d.N_t, pump + ": N ≥ −N_t");
    }
    assert.ok(Math.max(...run.samples.map((sample) => sample.P)) < 1e-3, pump + ": no laser light");
  }
});

test("a solver answer a hair below all-ions-down is passed on as −N_t, so the next call accepts it", () => {
  const loaded = loadEngine();
  const ode = loaded.ode;
  const c = deepFreeze(loaded.bench.configFor({ medium: "ruby", pump: "flashlamp" }));
  const d = loaded.bench.derive(c);
  loaded.ode = {
    rosenbrock: function (params) {
      const run = ode.rosenbrock(params);
      return Object.assign({}, run, { state: [-d.n_t * (1 + 1e-9), run.state[1]] });
    }
  };
  const first = loaded.bench.advance({ sim: loaded.bench.start(c), config: c, seconds: 1e-9, maxSteps: 20 });   // measured: 11
  assert.equal(first.reachedEnd, true);
  assert.equal(first.sim.N, -d.N_t);
  loaded.ode = ode;
  const next = loaded.bench.advance({ sim: first.sim, config: c, seconds: 1e-9, maxSteps: 20 });
  assert.equal(next.reachedEnd, true);
});

test("every setup runs 1 ms of its default (flash fired at the start) within a bound of steps", () => {
  // Measured per pair (stage 7b); the bounds are 1.5× that.
  const bounds = {
    "ruby flashlamp": 22500, "nd-glass flashlamp": 24500, "nd-yag diode": 16200, "nd-yag flashlamp": 19000,
    "he-ne discharge": 520, "ar-ion discharge": 1080, "co2 discharge": 14200,
    "dye-r6g laser": 1340, "ti-sapphire laser": 740, "two-level laser": 1550, "two-level flashlamp": 2500
  };
  for (const [medium, pump] of PAIRS) {
    const c = configFor(medium, pump);
    const start = pump === "flashlamp" ? fired(c) : B.start(c);
    const bound = bounds[medium + " " + pump];
    const run = advance(start, c, 1e-3, bound);
    assert.equal(run.reachedEnd, true, medium + " + " + pump + " needed more than " + bound + " steps");
    for (const value of [run.sim.N, run.sim.lnPhi]) assert.ok(Number.isFinite(value), medium + " + " + pump);
  }
});

// Runs `count` frames of 60 Hz as page.js does: each frame moves the
// simulation (1/60 s) ÷ slowMotion on, in 8 pieces that share the frame's
// steps, here at most `bound`.
function pageFrames(sim, cfg, slowMotion, count, bound) {
  const piece = (1 / 60) / slowMotion / 8;
  let worst = 0;
  for (let frame = 0; frame < count; frame++) {
    let used = 0;
    for (let i = 0; i < 8; i++) {
      const run = B.advance(deepFreeze({ sim, config: cfg, seconds: piece, maxSteps: Math.max(1, bound - used) }));
      used += run.steps;
      assert.equal(run.reachedEnd, true, "frame " + frame + " needed more than " + bound + " steps");
      sim = run.sim;
    }
    worst = Math.max(worst, used);
  }
  return { sim, worst };
}

test("a ruby flash on the page (slow motion 10⁴, 60 Hz) fits a frame's 1500 steps", () => {
  // 1.2 ms of simulated time: the flash, the build-up and the spikes, 720
  // frames. Measured: at most 588 steps a frame (33 on average); the bound
  // is 1.5× that, inside the page's 1500.
  const c = configFor("ruby", "flashlamp");
  const frames = Math.ceil(1.2e-3 / ((1 / 60) / 1e4));
  const run = pageFrames(fired(c), c, 1e4, frames, 880);
  assert.ok(run.worst > 300, "the spikes cost something: " + run.worst + " steps");
});

/* ---------- the pump now ---------- */

// A simulation state written out, flash and all (pumpNow reads only t and
// the flash; N and lnPhi are any allowed values).
function simAt(cfg, t, flash) {
  return deepFreeze({ t, N: B.start(cfg).N, lnPhi: 0, flash: flash || null });
}

function pumpNow(sim, cfg) {
  return B.pumpNow(deepFreeze({ sim, config: cfg }));
}

test("pumpNow with a steady pump: derive's x, and the small-signal gain g₀/g_th = x; the two-level atom's w", () => {
  for (const [medium, pump] of [["nd-yag", "diode"], ["dye-r6g", "laser"], ["ti-sapphire", "laser"],
    ["he-ne", "discharge"], ["ar-ion", "discharge"], ["co2", "discharge"]]) {
    const c = configFor(medium, pump);
    const d = B.derive(c);
    const now = pumpNow(simAt(c, 2e-6), c);
    assert.deepEqual(Object.keys(now).sort(), ["smallSignal", "w", "x"], medium);
    assert.equal(now.x, d.x, medium + ": x");
    assert.equal(now.w, null, medium + ": four levels have no w");
    assert.equal(now.smallSignal, d.x, medium + ": four levels hold y = x with no light");
  }
  // A stronger setting, the same way.
  const strong = configFor("nd-yag", "diode", { pumpPower: 12 });
  assertClose(pumpNow(simAt(strong, 0), strong).x, B.derive(strong).x, 1e-12, "12 W");
  // The two-level atom has no threshold: no x, its w = W_p·τ, and with no
  // light y = −n_t/(1 + 2w) (dy/dt′ = −2w·y − (n_t + y) = 0): below 0
  // however hard it is pumped.
  const atom = configFor("two-level", "laser");
  const a = B.derive(atom);
  const now = pumpNow(simAt(atom, 1e-3), atom);
  assert.equal(now.x, null);
  assert.equal(now.w, a.w);
  assert.ok(now.w > 6, "pumped hard: w = " + now.w);
  assertClose(now.smallSignal, -a.n_t / (1 + 2 * a.w), 1e-12, "two levels without light");
  assert.ok(now.smallSignal < 0, "it absorbs");
});

test("pumpNow with a flashlamp: nothing before Fire; at the flash's peak, derive's xPeak; three levels' small-signal gain", () => {
  // Before Fire: no pump. Four levels hold y = 0; three and two levels
  // have every ion down, y = −n_t.
  for (const medium of ["ruby", "nd-glass", "nd-yag", "two-level"]) {
    const c = configFor(medium, "flashlamp");
    const d = B.derive(c);
    const nothing = d.scheme === "four-level" ? { x: 0, w: null, smallSignal: 0 }
      : d.scheme === "three-level" ? { x: 0, w: 0, smallSignal: -d.n_t }
      : { x: null, w: 0, smallSignal: -d.n_t };
    assert.deepEqual(plain(pumpNow(simAt(c, 0), c)), nothing, medium + " before Fire");
    assert.deepEqual(plain(pumpNow(simAt(c, 5e-3), c)), nothing, medium + " later, still no flash");
  }
  // At t_p after Fire the lamp is at its peak, E/(e·t_p): derive's xPeak
  // (four levels: x; three levels: w over its threshold w_th).
  for (const medium of ["ruby", "nd-glass", "nd-yag"]) {
    const c = configFor(medium, "flashlamp");
    const d = B.derive(c);
    const flash = { at: 1e-3, flashEnergy: c.flashEnergy, flashTime: c.flashTime };
    const now = pumpNow(simAt(c, 1e-3 + c.flashTime, flash), c);
    assertClose(now.x, d.xPeak, 1e-12, medium + ": the pump at the peak");
  }
  // Ruby by hand: w at the peak = η·share·P/(hν_p·N_t·V_a)·τ, over w_th =
  // (n_t + 1)/(n_t − 1); with no light it would hold y = n_t(w − 1)/(w + 1)
  // (§2.2), more than its x: g₀/g_th is not w/w_th for three levels.
  const ruby = configFor("ruby", "flashlamp");
  const d = B.derive(ruby);
  const medium = E.media.get("ruby");
  const lampPeak = 1000 / (Math.E * 0.3e-3);
  const w = 0.7 * 0.12 * lampPeak / (E.units.photonEnergy(550e-9) * medium.N_t * ruby.area * ruby.l_g) * medium.tau;
  const wTh = (d.n_t + 1) / (d.n_t - 1);
  const peak = pumpNow(simAt(ruby, 0.3e-3, { at: 0, flashEnergy: 1000, flashTime: 0.3e-3 }), ruby);
  assertClose(peak.w, w, 1e-12, "ruby's w at the peak, by hand");
  assertClose(peak.x, w / wTh, 1e-12, "ruby's pump at the peak, by hand");
  assertClose(peak.x, 5.7229, 1e-4, "about 5.72 times threshold (the audit's xPeak)");
  assertClose(peak.smallSignal, d.n_t * (w - 1) / (w + 1), 1e-12, "ruby's small-signal gain at the peak");
  assertClose(peak.smallSignal, 8.5855, 1e-4, "about 8.59 times the loss");
  // The two-level atom: w itself, and no gain whatever the flash.
  const atom = configFor("two-level", "flashlamp");
  const a = B.derive(atom);
  const atomPeak = pumpNow(simAt(atom, 0.3e-3, { at: 0, flashEnergy: 2, flashTime: 0.3e-3 }), atom);
  const wAtom = 0.12 * (2 / (Math.E * 0.3e-3)) / (E.units.photonEnergy(atom.pumpLam) * a.N_t * atom.area * atom.l_g) * a.tau;
  assert.equal(atomPeak.x, null, "two levels: no threshold");
  assertClose(atomPeak.w, wAtom, 1e-12, "two levels: w at the peak");
  assertClose(atomPeak.smallSignal, -a.n_t / (1 + 2 * wAtom), 1e-12, "two levels: below 0");
});

test("pumpNow follows the flash's shape, with the energy and t_p it was fired with, not the sliders'", () => {
  const c = configFor("ruby", "flashlamp");
  const flash = { at: 2e-3, flashEnergy: 1000, flashTime: 0.3e-3 };
  const atPeak = pumpNow(simAt(c, 2.3e-3, flash), c);
  // The flash just fired: no pump yet. The lamp goes as (t/t_p)·e^(−t/t_p),
  // so two t_p on it is 2/e of its peak, and the pump with it.
  assert.equal(pumpNow(simAt(c, 2e-3, flash), c).x, 0, "at the moment of Fire");
  const later = pumpNow(simAt(c, 2.6e-3, flash), c);
  assertClose(later.x / atPeak.x, 2 / Math.E, 1e-12, "x follows the lamp: 2/e of the peak at 2 t_p");
  assertClose(later.w / atPeak.w, 2 / Math.E, 1e-12, "and so does w");
  // Sliders moved after Fire: the flash that runs is unchanged.
  const moved = configFor("ruby", "flashlamp", { flashEnergy: 2500 });
  assertClose(pumpNow(simAt(moved, 2.3e-3, flash), moved).x, atPeak.x, 1e-12, "the fired energy");
  // A flash fired with twice the t_p peaks at twice the time, half as high.
  const longer = { at: 2e-3, flashEnergy: 1000, flashTime: 0.6e-3 };
  assertClose(pumpNow(simAt(c, 2.6e-3, longer), c).x, atPeak.x / 2, 1e-12, "the fired t_p");
  // The output mirror changes the threshold, so x, but not w (the lamp).
  const lossy = configFor("ruby", "flashlamp", { refl2: 0.3 });
  const lossyNow = pumpNow(simAt(lossy, 2.3e-3, flash), lossy);
  assert.ok(lossyNow.x < atPeak.x, "a lossier cavity is further from threshold");
  assertClose(lossyNow.w, atPeak.w, 1e-12, "the same lamp, the same pump per ion");
});

test("pumpNow agrees with the pump advance runs: from y = 0 with no light, y rises at x per τ (§4.1)", () => {
  // Four levels with no light: dy/dt′ = x − y. Just after the peak, over a
  // step of τ/10⁴, y rises by about x·Δt′.
  const c = configFor("nd-yag", "flashlamp", { flashEnergy: 0.5 });
  const flash = { at: 0, flashEnergy: 0.5, flashTime: c.flashTime };
  const sim = { t: c.flashTime, N: 0, lnPhi: 0, flash };
  const d = B.derive(c);
  const dt = d.tau * 1e-4;
  const run = B.advance(deepFreeze({ sim, config: c, seconds: dt, maxSteps: 50 }));
  assert.equal(run.reachedEnd, true);
  assertClose(run.sim.N / d.N_c / 1e-4, pumpNow(simAt(c, c.flashTime, flash), c).x, 1e-4, "dy/dt′ = x at y = 0");
});

test("pumpNow checks its inputs and names itself", () => {
  const yag = configFor("nd-yag", "diode");
  const ruby = configFor("ruby", "flashlamp");
  const flash = { at: 0, flashEnergy: 1, flashTime: 3e-4 };
  const bad = [
    [{ sim: { t: 0, N: 0, lnPhi: 0, flash }, config: yag }, /sim\.flash is a flash .* no flashlamp/],
    [{ sim: { t: 0, N: 0, lnPhi: 0, flash: null }, config: Object.assign({}, yag, { pumpPower: -1 }) }, /pumpPower/],
    [{ sim: { t: -1, N: 0, lnPhi: 0, flash: null }, config: yag }, /sim\.t/],
    [{ sim: { t: 1e-3, N: 0, lnPhi: 0, flash: { at: 2e-3, flashEnergy: 1, flashTime: 3e-4 } }, config: ruby }, /later than sim\.t/],
    [{ sim: { t: 0, N: 0, lnPhi: 0, flash: null } }, /needs one object of named values, like \{ medium, pump/],
    [{ sim: { t: 0, N: 0, lnPhi: 0, flash: null }, config: yag, seconds: 1 }, /seconds is not one of its inputs/]
  ];
  for (const [params, pattern] of bad) {
    assert.throws(() => B.pumpNow(deepFreeze(params)), (error) =>
      error.message.startsWith("LaserEngine.bench.pumpNow:") && pattern.test(error.message), JSON.stringify(params));
  }
  assert.throws(() => B.pumpNow(B.start(yag), yag), /^Error: LaserEngine\.bench\.pumpNow: /);
  assert.throws(() => B.pumpNow(), /^Error: LaserEngine\.bench\.pumpNow: /);
});

/* ---------- inputs ---------- */

test("every new input is checked, and every error names the function that was called", () => {
  const bad = [
    [["ruby", "flashlamp"], { pump: "diode" }, /pump must be one of flashlamp/],
    [["ruby", "flashlamp"], { pump: 3 }, /pump must be one of flashlamp/],
    [["ruby", "flashlamp"], { pumpPower: 5 }, /pumpPower is not one of its inputs/],
    [["ruby", "flashlamp"], { flashEnergy: -1 }, /flashEnergy/],
    [["ruby", "flashlamp"], { flashShare: 0 }, /flashShare/],
    [["ruby", "flashlamp"], { flashShare: 1.5 }, /flashShare/],
    [["ruby", "flashlamp"], { flashTime: 0 }, /flashTime/],
    [["ruby", "flashlamp"], { pumpLam: 700e-9 }, /pumpLam|pump photon/],
    [["ruby", "flashlamp"], { eta: 0 }, /eta/],
    [["two-level", "laser"], { pumpLam: 550e-9 }, /pumpLam .* line itself/],
    [["he-ne", "discharge"], { current: -1e-3 }, /current/],
    [["he-ne", "discharge"], { current: 0.016 }, /current .* at most 0\.015/],
    [["ar-ion", "discharge"], { current: 41 }, /current .* at most 40/],
    [["he-ne", "discharge"], { currentPeak: 0 }, /currentPeak/],
    [["he-ne", "discharge"], { gainPeak: 0 }, /gainPeak/],
    [["he-ne", "discharge"], { pumpLam: 500e-9 }, /pumpLam is not one of its inputs/]
  ];
  // A medium the bench cannot run yet, with the config of another.
  bad.push([["ruby", "flashlamp"], { medium: "caf2-dy" }, /medium caf2-dy cannot be simulated yet/]);
  bad.push([["ruby", "flashlamp"], { medium: "diode" }, /medium diode cannot be simulated yet/]);
  for (const [[medium, pump], changes, pattern] of bad) {
    const c = Object.assign(B.configFor({ medium, pump }), changes);
    const label = medium + " " + JSON.stringify(changes);
    for (const name of ["derive", "start", "controls", "flashThreshold"]) {
      if (name === "flashThreshold" && pump !== "flashlamp") continue;
      assert.throws(() => B[name](deepFreeze(plain(c))), (error) =>
        error.message.startsWith("LaserEngine.bench." + name + ":") && pattern.test(error.message), name + " " + label);
    }
    const good = B.configFor({ medium, pump });
    assert.throws(() => advance(B.start(good), deepFreeze(plain(c)), 1e-6, 10), (error) =>
      error.message.startsWith("LaserEngine.bench.advance:") && pattern.test(error.message), "advance " + label);
  }
  const ruby = configFor("ruby", "flashlamp");
  const yag = configFor("nd-yag", "diode");
  const badRuns = [
    [ruby, { t: 0, N: -1.7e25, lnPhi: 0, flash: null }, /sim\.N/],
    [yag, { t: 0, N: -1, lnPhi: 0, flash: null }, /sim\.N/],
    [ruby, { t: 1e-3, N: 0, lnPhi: 0, flash: { at: 2e-3, flashEnergy: 1000, flashTime: 3e-4 } }, /sim\.flash\.at .* later than sim\.t/],
    [ruby, { t: 1e-3, N: 0, lnPhi: 0, flash: { at: -1, flashEnergy: 1000, flashTime: 3e-4 } }, /sim\.flash\.at/],
    [ruby, { t: 1e-3, N: 0, lnPhi: 0, flash: { at: 0, flashEnergy: -1, flashTime: 3e-4 } }, /sim\.flash\.flashEnergy/],
    [ruby, { t: 1e-3, N: 0, lnPhi: 0, flash: { at: 0, flashEnergy: 1000, flashTime: 0 } }, /sim\.flash\.flashTime/],
    [ruby, { t: 1e-3, N: 0, lnPhi: 0, flash: { at: 0, flashEnergy: 1000 } }, /sim\.flash\.flashTime/],
    [ruby, { t: 1e-3, N: 0, lnPhi: 0, flash: { at: 0, flashEnergy: 1000, flashTime: 3e-4, when: 0 } }, /when is not one of its inputs/],
    [ruby, { t: 1e-3, N: 0, lnPhi: 0, flash: 0 }, /sim\.flash must be null .* got 0/],
    [ruby, { t: 1e-3, N: 0, lnPhi: 0, flash: [0, 1000, 3e-4] }, /sim\.flash must be null/],
    [ruby, { t: 1e-3, N: 0, lnPhi: 0 }, /sim\.flash must be null/]
  ];
  for (const [cfg, sim, pattern] of badRuns) {
    assert.throws(() => B.advance(deepFreeze({ sim, config: cfg, seconds: 1e-6, maxSteps: 10 })), (error) =>
      error.message.startsWith("LaserEngine.bench.advance:") && pattern.test(error.message), JSON.stringify(sim));
  }
  // A flash fired on a bench without a lamp is refused, not ignored.
  const yagFlash = { at: 0, flashEnergy: 1, flashTime: 3e-4 };
  assert.throws(() => B.advance(deepFreeze({ sim: { t: 0, N: 0, lnPhi: 0, flash: yagFlash }, config: yag, seconds: 1e-6, maxSteps: 10 })),
    /^Error: LaserEngine\.bench\.advance: .*flashlamp/);
  for (const name of ["pumpsFor", "configFor", "controls", "start", "fire", "pumpNow", "flashThreshold"]) {
    assert.throws(() => B[name](), new RegExp("^Error: LaserEngine\\.bench\\." + name + ": "), name);
  }
});
