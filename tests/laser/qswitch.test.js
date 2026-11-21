/* ============================================================================
   qswitch.test.js — js/laser/engine/qswitch.js: the giant pulse's formulas
   (§4.3), the shutters' losses (§9.3, §9.5), and the shutters and the
   bleachable filter in the rate equations (§9.4, §11.2).
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine, deepFreeze, assertClose, plain } = require("./helpers.js");

const E = loadEngine();
const Q = E.qswitch;

function call(name, params) {
  return Q[name](deepFreeze(Object.assign({}, params)));
}

/* ---------- the energy used, η_E (§4.3) ---------- */

test("energyUse solves x·η = −ln(1 − η): §12's x = 3 gives 0.9405", () => {
  // §4.3 and §12: η_E ≈ 0.94 at x = 3; worked to 6 digits, 0.940480.
  assertClose(Q.energyUse(3), 0.94047979, 1e-7, "x = 3");
  for (const x of [1.001, 1.1, 1.5, 2, 3, 5, 10, 30]) {
    const eta = Q.energyUse(x);
    assert.ok(eta > 0 && eta < 1, "x = " + x + ": " + eta);
    // The equation itself, in u = x·η: x(1 − e^(−u)) = u.
    const u = x * eta;
    assertClose(x * -Math.expm1(-u), u, 1e-12, "x = " + x);
  }
});

test("energyUse: near threshold η ≈ 2(x − 1), far above it 1 − e^(−x); it grows with x", () => {
  // Near 1: u ≈ 2(x − 1) to first order.
  assertClose(Q.energyUse(1.0001), 2 * 0.0001, 1e-3, "x = 1.0001");
  // Far above: η = 1 − e^(−xη) ≈ 1 − e^(−x). At x = 40, 1 − η = 4×10⁻¹⁸,
  // which rounds to 0 in η: the answer must still be a number, not NaN.
  assertClose(Q.energyUse(10), 1 - Math.exp(-10 * Q.energyUse(10)), 1e-12, "x = 10");
  assert.equal(Q.energyUse(40), 1);
  let last = 0;
  for (let x = 1.01; x < 20; x *= 1.3) {
    const eta = Q.energyUse(x);
    assert.ok(eta > last, "x = " + x);
    last = eta;
  }
});

test("energyUse refuses x ≤ 1 (no pulse below threshold) and anything not a number", () => {
  for (const bad of [1, 0.5, 0, -2, NaN, Infinity, "3", null, undefined]) {
    assert.throws(() => Q.energyUse(bad), /^Error: LaserEngine\.qswitch\.energyUse: x must/, String(bad));
  }
});

/* ---------- the giant pulse (§4.3) ---------- */

const PULSE = {
  x: 3, N_p: 1e24, V_a: 1e-6, nu: 4.3e14, tau_c: 5e-9, gamma: 0.35, gammaOut: Math.log(2), scheme: "four-level"
};

test("giantPulse: §4.3's energy, peak power and width; §12's x = 3, τ_c = 5 ns gives 15.65 ns", () => {
  const pulse = call("giantPulse", PULSE);
  const h = E.constants.h;
  const eta = Q.energyUse(3);
  const share = Math.log(2) / (2 * 0.35);
  assertClose(pulse.eta_E, eta, 1e-15);
  assertClose(pulse.energy, share * eta * 3 * 1e24 * 1e-6 * h * 4.3e14, 1e-12, "E_out");
  assertClose(pulse.peakPower, share * h * 4.3e14 * 1e-6 * 1e24 / 5e-9 * (3 - 1 - Math.log(3)), 1e-12, "P_peak");
  // Δτ_p = τ_c·xη/(x − 1 − ln x) = 3.13011 τ_c: 15.6505 ns (§12: ≈ 16 ns).
  assertClose(pulse.width, 15.6505316e-9, 1e-7, "Δτ_p");
  assertClose(pulse.width, pulse.energy / pulse.peakPower, 1e-12);
});

test("giantPulse: three levels give half the energy and half the peak, the same width", () => {
  const four = call("giantPulse", PULSE);
  const three = call("giantPulse", Object.assign({}, PULSE, { scheme: "three-level" }));
  assertClose(three.energy, four.energy / 2, 1e-12);
  assertClose(three.peakPower, four.peakPower / 2, 1e-12);
  assertClose(three.width, four.width, 1e-12);
  assert.equal(three.eta_E, four.eta_E);
});

test("giantPulse: the energy out goes with the output mirror's share of the loss, γ₂/(2γ)", () => {
  const half = call("giantPulse", Object.assign({}, PULSE, { gammaOut: 0.35 }));
  const full = call("giantPulse", Object.assign({}, PULSE, { gammaOut: 0.7 }));
  assertClose(full.energy, 2 * half.energy, 1e-12);
  // All the loss through the output mirror (γ₂ = 2γ: the round trip loses
  // nothing else): every photon made leaves, η_E·N_i·V_a of them.
  assertClose(full.energy, Q.energyUse(3) * 3 * 1e24 * 1e-6 * E.constants.h * 4.3e14, 1e-12);
});

test("giantPulse checks its inputs and names itself", () => {
  const bad = [
    [{ x: 1 }, /x must be above 1/],
    [{ N_p: 0 }, /N_p/],
    [{ V_a: -1 }, /V_a/],
    [{ nu: NaN }, /nu/],
    [{ tau_c: 0 }, /tau_c/],
    [{ gamma: 0 }, /gamma/],
    [{ gammaOut: -0.1 }, /gammaOut/],
    [{ gammaOut: 0.71 }, /gammaOut .* cannot be more than the round trip's whole loss/],
    [{ scheme: "two-level" }, /scheme must be/],
    [{ y: 2 }, /y is not one of its inputs/]
  ];
  for (const [change, pattern] of bad) {
    assert.throws(() => call("giantPulse", Object.assign({}, PULSE, change)),
      (err) => /^LaserEngine\.qswitch\.giantPulse: /.test(err.message) && pattern.test(err.message), JSON.stringify(change));
  }
});

/* ---------- the shutters (§9.3, §9.5) ---------- */

const CELL = { leak: 1e-4, switchTime: 5e-9 };

test("cellLoss: closed, the round trip keeps the leak; open, nothing is lost; cos²Γ between", () => {
  const closed = -0.5 * Math.log(1e-4);                     // 4.605 per pass
  assertClose(call("cellLoss", Object.assign({ since: -1 }, CELL)), closed, 1e-12, "before the voltage falls");
  assertClose(call("cellLoss", Object.assign({ since: 0 }, CELL)), closed, 1e-12, "as it starts to fall");
  assert.equal(call("cellLoss", Object.assign({ since: 5e-9 }, CELL)), 0, "open");
  assert.equal(call("cellLoss", Object.assign({ since: 1 }, CELL)), 0, "and stays open");
  // Half way: Γ = π/4, cos²Γ = 1/2.
  assertClose(call("cellLoss", Object.assign({ since: 2.5e-9 }, CELL)), -0.5 * Math.log(1e-4 + (1 - 1e-4) * 0.5), 1e-12);
  // The loss falls all the way.
  let last = Infinity;
  for (let t = 0; t <= 5e-9; t += 0.5e-9) {
    const loss = call("cellLoss", Object.assign({ since: t }, CELL));
    assert.ok(loss <= last, "t = " + t);
    last = loss;
  }
});

const PRISM = { leak: 1e-4, rotation: 500, angleTolerance: 1e-3 };

test("prismLoss: aligned, no loss; e^(−(θ/θ_tol)²) near it; the leak when turned away; again each turn", () => {
  assert.equal(call("prismLoss", Object.assign({ since: 0 }, PRISM)), 0);
  // θ = θ_tol at t = θ_tol/Ω = 1e-3/(2π·500) = 0.318 µs: R = ℓ + (1 − ℓ)/e.
  const t1 = 1e-3 / (2 * Math.PI * 500);
  assertClose(call("prismLoss", Object.assign({ since: t1 }, PRISM)), -0.5 * Math.log(1e-4 + (1 - 1e-4) / Math.E), 1e-9);
  assertClose(call("prismLoss", Object.assign({ since: -t1 }, PRISM)), call("prismLoss", Object.assign({ since: t1 }, PRISM)), 1e-12, "symmetric");
  // A quarter turn away: only the leak.
  assertClose(call("prismLoss", Object.assign({ since: 0.5e-3 }, PRISM)), -0.5 * Math.log(1e-4), 1e-12, "turned away");
  // One whole turn later (2 ms at 500 rev/s), aligned again.
  assertClose(call("prismLoss", Object.assign({ since: 2e-3 }, PRISM)), 0, 0, "the next turn", 1e-9);
  assertClose(call("prismLoss", Object.assign({ since: 2e-3 + t1 }, PRISM)), call("prismLoss", Object.assign({ since: t1 }, PRISM)), 1e-9);
});

test("the shutters check their inputs and name themselves", () => {
  for (const [name, base] of [["cellLoss", Object.assign({ since: 0 }, CELL)], ["prismLoss", Object.assign({ since: 0 }, PRISM)]]) {
    const where = new RegExp("^LaserEngine\\.qswitch\\." + name + ": ");
    for (const change of [{ leak: 0 }, { leak: 1.5 }, { leak: NaN }, { since: NaN }, { extra: 1 }]) {
      assert.throws(() => call(name, Object.assign({}, base, change)), (err) => where.test(err.message), name + " " + JSON.stringify(change));
    }
  }
  assert.throws(() => call("cellLoss", Object.assign({ since: 0 }, CELL, { switchTime: 0 })), /switchTime/);
  assert.throws(() => call("prismLoss", Object.assign({ since: 0 }, PRISM, { rotation: 0 })), /rotation/);
  assert.throws(() => call("prismLoss", Object.assign({ since: 0 }, PRISM, { angleTolerance: -1 })), /angleTolerance/);
});

/* ---------- in the rate equations (§11.2, §9.4) ---------- */

const RATE = { x: 2, eps: 1e-3, beta: 1e-8 };

test("withLoss adds −loss(t′)/ε to ds/dt′ and leaves dy/dt′ as it is", () => {
  const f = E.rates.fourLevel.derivatives(RATE);
  const g = call("withLoss", { f, eps: 1e-3, loss: (tPrime) => 0.5 + tPrime });
  const state = deepFreeze([1.2, -3]);
  const plainRates = f(0.25, [1.2, -3]);
  const rates = g(0.25, state);
  assert.equal(rates[0], plainRates[0]);
  assertClose(rates[1], plainRates[1] - 0.75 / 1e-3, 1e-12);
  // A loss of q over γ raises the threshold to y = 1 + q: there ds/dt′ is
  // only the seed's.
  const held = call("withLoss", { f, eps: 1e-3, loss: () => 2 });
  const atThreshold = held(0, [3, 0]);
  const seedOnly = f(0, [1, 0]);
  // (2/ε − 2/ε cancels: compared to rounding of the 2000s, 10⁻⁹.)
  assertClose(atThreshold[1], seedOnly[1] + (3 * 1e-8 - 1e-8) * Math.exp(0) / 1e-3, 1e-9, "y = 1 + q", 1e-9);
});

test("withAbsorber: a third entry, its loss depth·a, and da/dt′ = recovery·(1 − a) − bleach·a·p", () => {
  const f = E.rates.fourLevel.derivatives(RATE);
  const params = { f, eps: 1e-3, depth: 1.5, recovery: 40, bleach: 3 };
  const g = call("withAbsorber", params);
  const state = deepFreeze([2.5, Math.log(0.2), 0.6]);
  const rates = g(0.1, state);
  const medium = f(0.1, [2.5, Math.log(0.2)]);
  assert.equal(rates.length, 3);
  assert.equal(rates[0], medium[0]);
  assertClose(rates[1], medium[1] - 1.5 * 0.6 / 1e-3, 1e-12, "the filter's loss");
  assertClose(rates[2], 40 * 0.4 - 3 * 0.6 * 0.2, 1e-12, "the filter's ground share");
  // Recovered with no light: nothing changes. Fully bleached: no loss.
  assertClose(g(0, [0.5, -40, 1])[2], 0, 0, "recovered", 1e-15);
  assert.equal(g(0, [0.5, -3, 0])[1], f(0, [0.5, -3])[1]);
  // A filter of no depth is allowed (T₀ = 1).
  call("withAbsorber", Object.assign({}, params, { depth: 0 }));
});

test("withLoss and withAbsorber check their inputs and name themselves", () => {
  const f = E.rates.fourLevel.derivatives(RATE);
  const loss = { f, eps: 1e-3, loss: () => 1 };
  const filter = { f, eps: 1e-3, depth: 1, recovery: 1, bleach: 1 };
  const cases = [
    ["withLoss", loss, { f: 3 }], ["withLoss", loss, { eps: 0 }], ["withLoss", loss, { loss: 2 }], ["withLoss", loss, { q: 1 }],
    ["withAbsorber", filter, { depth: -1 }], ["withAbsorber", filter, { recovery: 0 }], ["withAbsorber", filter, { bleach: NaN }],
    ["withAbsorber", filter, { eps: -1 }], ["withAbsorber", filter, { f: null }], ["withAbsorber", filter, { loss: () => 1 }]
  ];
  for (const [name, base, change] of cases) {
    assert.throws(() => call(name, Object.assign({}, base, change)),
      (err) => err.message.startsWith("LaserEngine.qswitch." + name + ": "), name + " " + Object.keys(change)[0]);
  }
});

/* ---------- the filters ---------- */

test("ABSORBERS: each filter's σ_a and τ_a in SI, and each saturates far more easily than the medium it is used with", () => {
  const ids = Object.keys(Q.ABSORBERS).sort();
  assert.deepEqual(ids, ["cr-yag", "cryptocyanine"]);
  // Cr⁴⁺:YAG: σ_a ~ 4×10⁻¹⁸ cm², τ_a a few µs; cryptocyanine: σ_a ~ 10⁻¹⁵
  // cm², τ_a tens of ps (§9.4; not verified against printed sources).
  const cr = Q.ABSORBERS["cr-yag"];
  assert.ok(cr.sigma > 1e-22 && cr.sigma < 1e-21, "Cr:YAG σ_a in m²: " + cr.sigma);
  assert.ok(cr.tau > 1e-6 && cr.tau < 1e-5, "Cr:YAG τ_a in s: " + cr.tau);
  const dye = Q.ABSORBERS.cryptocyanine;
  assert.ok(dye.sigma > 1e-20 && dye.sigma < 1e-18, "cryptocyanine σ_a in m²: " + dye.sigma);
  assert.ok(dye.tau > 1e-12 && dye.tau < 1e-10, "cryptocyanine τ_a in s: " + dye.tau);
  // §9.4's condition, σ_a/A_a ≫ σ/A, with the filter's beam as wide as the
  // mode (A_a = A): σ_a at least 10 times the medium's σ.
  for (const [filter, medium] of [["cr-yag", "nd-yag"], ["cr-yag", "nd-glass"], ["cryptocyanine", "ruby"]]) {
    const ratio = Q.ABSORBERS[filter].sigma / E.media.get(medium).sigma;
    assert.ok(ratio > 10, filter + " with " + medium + ": σ_a/σ = " + ratio);
  }
});

test("qswitch is frozen, and so is every filter", () => {
  assert.ok(Object.isFrozen(Q));
  assert.ok(Object.isFrozen(Q.ABSORBERS));
  for (const id of Object.keys(Q.ABSORBERS)) assert.ok(Object.isFrozen(Q.ABSORBERS[id]), id);
});

test("giantPulse with no output mirror (γ₂ = 0): no energy out, no peak out, but the pulse inside keeps its width", () => {
  const closed = call("giantPulse", Object.assign({}, PULSE, { gammaOut: 0 }));
  const open = call("giantPulse", PULSE);
  assert.equal(closed.energy, 0);
  assert.equal(closed.peakPower, 0);
  assert.ok(Number.isFinite(closed.width), "not NaN: " + closed.width);
  assertClose(closed.width, open.width, 1e-12);
  // The width is §4.3's τ_c·xη_E/(x − 1 − ln x), whatever the mirrors.
  assertClose(open.width, 5e-9 * 3 * Q.energyUse(3) / (2 - Math.log(3)), 1e-12);
});

test("closedLoss: a closed shutter's −½ ln ℓ, the cell's loss before it switches; it checks ℓ and names itself", () => {
  assertClose(Q.closedLoss(1e-4), -0.5 * Math.log(1e-4), 1e-12);
  assert.equal(Q.closedLoss(1e-4), call("cellLoss", Object.assign({ since: -1 }, CELL)));
  assert.equal(Q.closedLoss(1), 0);
  for (const bad of [0, 1.5, -1e-4, NaN, "1e-4", undefined]) {
    assert.throws(() => Q.closedLoss(bad), /^Error: LaserEngine\.qswitch\.closedLoss: leak/, String(bad));
  }
});

test("cellLossFunction and prismLossFunction: the same losses as a function of `since`, checked once", () => {
  const cell = call("cellLossFunction", CELL);
  const prism = call("prismLossFunction", PRISM);
  for (const since of [-1, 0, 1e-9, 2.5e-9, 5e-9, 1e-4, 0.3e-6, 0.5e-3, 2e-3, 2e-3 + 0.2e-6]) {
    assert.equal(cell(since), call("cellLoss", Object.assign({ since }, CELL)), "cell at " + since);
    assert.equal(prism(since), call("prismLoss", Object.assign({ since }, PRISM)), "prism at " + since);
  }
  const cases = [
    ["cellLossFunction", CELL, { leak: 0 }], ["cellLossFunction", CELL, { switchTime: -1 }], ["cellLossFunction", CELL, { since: 0 }],
    ["prismLossFunction", PRISM, { leak: 2 }], ["prismLossFunction", PRISM, { rotation: 0 }],
    ["prismLossFunction", PRISM, { angleTolerance: NaN }], ["prismLossFunction", PRISM, { since: 0 }]
  ];
  for (const [name, base, change] of cases) {
    assert.throws(() => call(name, Object.assign({}, base, change)),
      (err) => err.message.startsWith("LaserEngine.qswitch." + name + ": "), name + " " + Object.keys(change)[0]);
  }
});
