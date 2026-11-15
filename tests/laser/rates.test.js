/* ============================================================================
   rates.test.js — js/laser/engine/rates.js, the four-level rate equations
   (docs/laser-physics.md §4.1, §4.2, §11.2, §11.3) and their link to the
   static cavity of stage 2.

   The dynamics run on the real solver (ode.js). The bounds were measured
   during the stage-4 audit (docs/laser-plan.md, stage 4 scope card).
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine, deepFreeze, assertClose, plain } = require("./helpers.js");

const { constants: C, media: M, cavity: K, ode, rates } = loadEngine();
const R = rates.fourLevel;

// Every call goes through deep-frozen inputs, so rates.js cannot change them.
function call(name, params) {
  return R[name](deepFreeze(Object.assign({}, params)));
}

// A small Nd:YAG laser: 1 mm² mode, 5 cm rod in a 0.3 m cavity, 95 % output
// mirror. L_e = 0.3 + (1.82 − 1)·0.05 = 0.341 m.
const YAG = M.get("nd-yag");
const L_E = K.effectiveLength({ L: 0.3, l_g: 0.05, nGroup: YAG.nGroup });
const YAG_CAVITY = {
  sigma: YAG.sigma, tau: YAG.tau, nu: YAG.nu,
  l_g: 0.05, area: 1e-6, L_e: L_E, refl1: 1, refl2: 0.95, alpha_i: 0
};
const YAG_SCALES = call("scales", YAG_CAVITY);

/* ---------- scales: the link between the state and physics ---------- */

test("scales: N_c·σ·l = γ, and γ, τ_c and N_c are the ones cavity.js gives", () => {
  // One loss at a time, then all three: each term of γ is pinned on its own.
  for (const loss of [
    { refl1: 1, refl2: 0.95, alpha_i: 0, l_g: 0.05 },
    { refl1: 0.9, refl2: 1, alpha_i: 0, l_g: 0.05 },
    { refl1: 1, refl2: 1, alpha_i: 0.5, l_g: 0.05 },
    { refl1: 0.99, refl2: 0.9, alpha_i: 0.5, l_g: 0.05 }
  ]) {
    const sc = call("scales", Object.assign({}, YAG_CAVITY, loss));
    assertClose(sc.N_c * YAG.sigma * loss.l_g, sc.gamma, 1e-12, "N_c·σ·l = γ");
    assertClose(sc.gamma, K.singlePassLoss(loss), 1e-12, "γ");
    assertClose(sc.tau_c, K.photonLifetime({ L_e: L_E, gamma: sc.gamma }), 1e-12, "τ_c");
    assertClose(sc.N_c, K.thresholdInversion({ gth: K.thresholdGain(loss), sigma: YAG.sigma }), 1e-12, "N_c = ΔN_th");
  }
});

test("scales: the other numbers follow their definitions (§4.1, §11.2)", () => {
  const sc = YAG_SCALES;
  assertClose(sc.V, 1e-6 * L_E, 1e-12, "V = A·L_e");
  assertClose(sc.V_a, 1e-6 * 0.05, 1e-12, "V_a = A·l");
  assertClose(sc.B, YAG.sigma * C.c / sc.V, 1e-12, "B = σc/V");
  assertClose(sc.eps, sc.tau_c / YAG.tau, 1e-12, "ε = τ_c/τ");
  assertClose(sc.R_c, sc.N_c / YAG.tau, 1e-12, "R_c = N_c/τ");
  assertClose(sc.pOnePhoton, sc.B * YAG.tau, 1e-12, "one photon: p = Bτ");
  assertClose(sc.sOnePhoton, Math.log(sc.B * YAG.tau), 1e-12, "s = ln(Bτ)");
  assertClose(sc.phiPerP * sc.pOnePhoton, 1, 1e-12, "φ = p·phiPerP");
  // the threshold of §4.1 written the other way: N_c = 1/(V_a·B·τ_c)
  assertClose(sc.N_c, 1 / (sc.V_a * sc.B * sc.tau_c), 1e-12, "N_c = 1/(V_a B τ_c)");
});

test("scales: P_out per unit of p is (γ₂/2)·A·I_sat, with I_sat from the media table", () => {
  assertClose(YAG_SCALES.powerPerP, 0.5 * -Math.log(0.95) * 1e-6 * YAG.I_sat, 1e-12, "powerPerP");
  // a perfect output mirror lets nothing out: +0, not −0 (which would show as "−0 W")
  const closed = call("scales", Object.assign({}, YAG_CAVITY, { refl1: 0.95, refl2: 1 }));
  assert.ok(Object.is(closed.powerPerP, 0), "powerPerP = " + closed.powerPerP);
});

test("§4.1: at p = x − 1, P_out is (cγ₂/2L_e)·hν·φ₀ with φ₀ = τ_c·V_a·(R_p − R_c)", () => {
  const sc = YAG_SCALES;
  const x = 2.5;
  const R_p = x * sc.R_c;
  const phi0 = sc.tau_c * sc.V_a * (R_p - sc.R_c);
  const expected = C.c * -Math.log(0.95) / (2 * L_E) * C.h * YAG.nu * phi0;
  assertClose((x - 1) * sc.powerPerP, expected, 1e-12, "P_out");
});

test("the small Nd:YAG laser: ε ≈ 1.928×10⁻⁴, one photon p ≈ 5.66×10⁻¹², N_c ≈ 1.83×10¹⁶ cm⁻³, 0.7435 W at x = 2", () => {
  const sc = YAG_SCALES;
  assertClose(sc.eps, 1.928e-4, 0.0005 / 1.928, "ε");                    // 1.92830e-4
  assertClose(sc.pOnePhoton, 5.66e-12, 0.005 / 5.66, "Bτ");              // 5.6618e-12
  assertClose(sc.N_c * 1e-6, 1.83e16, 0.005 / 1.83, "N_c, cm⁻³");        // 1.8319e16
  assertClose(sc.powerPerP * (2 - 1), 0.7435, 0.00005 / 0.7435, "P_out, W"); // 0.743498
});

test("steady power agrees with the low-gain Rigrod formula to first order in T (§3.6, §4.1)", () => {
  // R₁ = 1, L_i = 0, the same x. Derived in the audit: Rigrod is higher by
  // a relative T/(2(x − 1)), because it uses γ ≈ T/2 where the rate
  // equations use γ = −½·ln(1 − T).
  const x = 2;
  for (const T of [1e-3, 1e-4]) {
    const sc = call("scales", Object.assign({}, YAG_CAVITY, { refl2: 1 - T }));
    const g0 = x * sc.gamma / 0.05;
    const fromRates = (x - 1) * sc.powerPerP;
    const fromRigrod = K.rigrodLowGain({ g0, l_g: 0.05, T_oc: T, L_i: 0, I_sat: YAG.I_sat, area: 1e-6 });
    assertClose((fromRigrod - fromRates) / fromRates, T / (2 * (x - 1)), 0.02, "relative difference at T = " + T);
  }
});

/* ---------- the right-hand side ---------- */

test("derivatives: dy/dt′ = x − y − y·p and ds/dt′ = ((y − 1) + βy·e^(−s))/ε (§11.2, §11.3)", () => {
  const f = call("derivatives", { x: 1.7, eps: 1e-3, beta: 1e-6 });
  const [dy, ds] = f(0, deepFreeze([0.8, -3]));
  assertClose(dy, 1.7 - 0.8 - 0.8 * Math.exp(-3), 1e-14, "dy/dt′");
  assertClose(ds, ((0.8 - 1) + 1e-6 * 0.8 * Math.exp(3)) / 1e-3, 1e-14, "ds/dt′");
});

test("derivatives: the seed stays finite where e^(−s) alone overflows (β = 10⁻³¹⁰, s ≈ −714)", () => {
  // s = ln(βy), so the seed β(y + 10⁻¹²)·e^(−s) is 1 + 2×10⁻¹²; e^(−s) on
  // its own is Infinity.
  const beta = 1e-310;
  const s = Math.log(beta) + Math.log(0.5);
  const [dy, ds] = call("derivatives", { x: 0.5, eps: 1e-3, beta })(0, [0.5, s]);
  assertClose(ds, (0.5 - 1 + (0.5 + 1e-12) / 0.5) / 1e-3, 1e-12, "ds/dt′");
  assertClose(dy, 0, 0, "dy/dt′ = x − y − y·p with p ≈ 0", 1e-300);
});

test("derivatives: the seed counts max(y, 0) + 10⁻¹², as liftToSeed does, and f stays finite and smooth", () => {
  // y = 0 is the pump off for long; y a hair below 0 a solver trial. The
  // implicit solver differentiates f: with no seed at y ≤ 0 the slope
  // across y = 0 grew past 10³³ with the pump off and stopped it.
  const f = call("derivatives", { x: 0, eps: 1e-3, beta: 1e-8 });
  const seedAt = (y) => 1e-8 * (Math.max(y, 0) + 1e-12) * Math.exp(50);
  for (const y of [0, -1e-12, 1e-13, 1e-12, 1e-6]) {
    const [dy, ds] = f(0, [y, -50]);
    assertClose(ds, (y - 1 + seedAt(y)) / 1e-3, 1e-14, "ds/dt′ at y = " + y);
    assertClose(dy, -y * (1 + Math.exp(-50)), 1e-15, "dy/dt′ at y = " + y, 1e-300);
  }
  // No corner above y = 0: the seed's slope in y is the same across
  // 10⁻¹² as above it. With max(y, 10⁻¹²) it was 0 below 10⁻¹², and the
  // solver's difference in y (4.7×10⁻¹¹) reached across that corner.
  const slope = (a, b) => (f(0, [b, -50])[1] - f(0, [a, -50])[1]) / (b - a);
  assertClose(slope(5e-13, 1.5e-12), slope(1e-11, 2e-11), 1e-3, "slope across 10⁻¹²");
});

test("with β = 0 the seed term is left out: f stays finite at s = −800, where e^(−s) overflows", () => {
  const f = call("derivatives", { x: 2, eps: 1e-3, beta: 0 });
  const [dy, ds] = f(0, [0.5, -800]);
  assertClose(dy, 2 - 0.5, 1e-15, "dy/dt′ (p underflows to 0)");
  assertClose(ds, (0.5 - 1) / 1e-3, 1e-15, "ds/dt′");
});

/* ---------- steady state ---------- */

test("§12: steady state at x = 2 is y → 1, p → 1", () => {
  const ss = call("steadyState", { x: 2, beta: 1e-12 });
  assertClose(ss.y, 1, 1e-10, "y");
  assertClose(ss.p, 1, 1e-10, "p");
});

test("steadyState without the seed is y = min(x, 1), p = max(x − 1, 0)", () => {
  for (const x of [0, 0.3, 1, 2.5]) {
    const ss = call("steadyState", { x, beta: 0 });
    assertClose(ss.y, Math.min(x, 1), 0, "y at x = " + x, 1e-15);
    assertClose(ss.p, Math.max(x - 1, 0), 0, "p at x = " + x, 1e-15);
  }
});

test("steadyState with the seed makes f zero, on both sides of threshold and at it", () => {
  for (const beta of [1e-12, 1e-8, 1e-4]) {
    // x = 0 and 10⁻¹⁴: the pump off, where the seed floor sets p ≈ β·10⁻¹².
    for (const x of [0, 1e-14, 0.1, 0.5, 0.99, 1, 1.01, 2, 10]) {
      const ss = call("steadyState", { x, beta });
      const [dy, ds] = R.derivatives({ x, eps: 1, beta })(0, [ss.y, Math.log(ss.p)]);
      const label = " at x = " + x + ", β = " + beta;
      assertClose(dy, 0, 0, "dy/dt′" + label, 1e-12 * Math.max(1, x));
      assertClose(ds, 0, 0, "ds/dt′" + label, 1e-12);
    }
  }
  // exactly at threshold the photons sit at √β
  assertClose(call("steadyState", { x: 1, beta: 1e-8 }).p, 1e-4, 1e-12, "p(x = 1) = √β");
  // with the pump off, at the floor's seed level
  assertClose(call("steadyState", { x: 0, beta: 1e-8 }).p, 1e-20, 1e-12, "p(x = 0) = β·10⁻¹²");
});

test("steadyState below threshold keeps full precision for a tiny seed (no cancellation)", () => {
  // p ≈ β(x + 10⁻¹²)/(1 − x) ≈ 10⁻¹⁵. The form (a + √(…))/2 subtracts two
  // numbers that agree in 15 digits and would be off by a few percent.
  assertClose(call("steadyState", { x: 0.5, beta: 1e-15 }).p, 1e-15 * (0.5 + 1e-12) / 0.5, 1e-12, "p");
});

/* ---------- dynamics on the solver ---------- */

// One run on the solver, which must reach t1 within maxSteps. Each caller
// gives about 1.5× the steps it was measured to need, because maxSteps is
// the only thing that bounds the work: node:test cannot stop a synchronous
// test, so a { timeout } would not turn a slow broken solver into a failure.
function integrate(params, state0, t1, maxSteps, tolerances) {
  const tol = tolerances || { rtol: 1e-9, atol: 1e-12 };
  const run = ode.dopri5({ f: R.derivatives(params), t0: 0, state0, t1, rtol: tol.rtol, atol: tol.atol, maxSteps });
  assert.ok(run.reachedEnd, "the run stopped at t′ = " + run.t + " of " + t1 + ": " + maxSteps + " steps were not enough");
  return run;
}

test("§12: x = 2 from one photon settles at y = 1, p = 1", () => {
  const params = { x: 2, eps: YAG_SCALES.eps, beta: 1e-8 };
  const run = integrate(params, [0, YAG_SCALES.sOnePhoton], 20, 24000);    // needs 16 143
  const ss = R.steadyState({ x: 2, beta: 1e-8 });
  assertClose(run.state[0], ss.y, 1e-6, "y");                  // measured 1e-8
  assertClose(Math.exp(run.state[1]), ss.p, 1e-6, "p");        // measured 1e-8
  assertClose(Math.exp(run.state[1]), 1, 1e-6, "p ≈ 1");
});

test("below threshold (x = 0.5) the photons stay at the seed level and y → x", () => {
  const params = { x: 0.5, eps: YAG_SCALES.eps, beta: 1e-8 };
  const run = integrate(params, [0, YAG_SCALES.sOnePhoton], 20, 30000);    // needs 19 790
  const ss = R.steadyState({ x: 0.5, beta: 1e-8 });
  assertClose(run.state[0], 0.5, 1e-6, "y → x");
  assertClose(Math.exp(run.state[1]), ss.p, 1e-6, "p at the seed level");
  assertClose(ss.p, 1e-8, 1e-6, "seed level ≈ β·x/(1 − x)");
});

test("with β = 0 one photon decays to e^(−1600) below threshold, and the laser still starts", () => {
  // Only ln p can hold e^(−1600): p itself is 0 in floating point there.
  const params = { x: 2, eps: YAG_SCALES.eps, beta: 0 };
  const atThreshold = integrate(params, [0, YAG_SCALES.sOnePhoton], Math.log(2), 100); // y = 1 at t′ = ln 2; needs 20
  assert.ok(atThreshold.state[1] < -1000, "s = " + atThreshold.state[1]);
  const run = integrate(params, [0, YAG_SCALES.sOnePhoton], 20, 23000);    // needs 14 960
  assertClose(Math.exp(run.state[1]), 1, 1e-5, "p → 1");            // measured 6e-7
});

/* ---------- liftToSeed: photons far below the seed ---------- */

test("liftToSeed leaves a laser that runs, the below-threshold level, the one-photon start and β = 0 alone", () => {
  const below = R.steadyState({ x: 0.5, beta: 1e-8 });
  const cases = [
    { state: [1, 0], beta: 1e-8 },                                   // lasing at x = 2
    { state: [below.y, Math.log(below.p)], beta: 1e-8 },             // the seed level below threshold
    { state: [0, YAG_SCALES.sOnePhoton], beta: 1e-4 },               // the start: one photon, y = 0
    { state: [0.8, -1e6], beta: 0 }                                  // no seed: nothing to lift to
  ];
  for (const c of cases) {
    assert.deepEqual(plain(call("liftToSeed", c)), c.state, JSON.stringify(c));
  }
});

test("liftToSeed raises s to ln(β·(max(y, 0) + 10⁻¹²))", () => {
  const lifted = call("liftToSeed", { state: [0.8, -300], beta: 1e-8 });
  assert.equal(lifted[0], 0.8, "y is never changed");
  assertClose(lifted[1], Math.log(1e-8 * (0.8 + 1e-12)), 1e-15, "s = ln(β(y + 10⁻¹²))");
  for (const y of [1e-300, 0, -1e-15]) {
    const low = call("liftToSeed", { state: [y, -1e6], beta: 1e-8 });
    assert.equal(low[0], y, "y is never changed");
    assertClose(low[1], Math.log(1e-8 * 1e-12), 1e-15, "s at y = " + y);
  }
});

test("β turned on after a run with β = 0: the solver gives up, unless the state goes through liftToSeed", () => {
  // x = 2, ε = 10⁻³: with no seed, s falls to about −313 by t′ = 0.5.
  const noSeed = integrate({ x: 2, eps: 1e-3, beta: 0 }, [0, YAG_SCALES.sOnePhoton], 0.5, 100);   // needs 16
  assert.ok(noSeed.state[1] < -300, "s = " + noSeed.state[1]);
  const withSeed = { x: 2, eps: 1e-3, beta: 1e-8 };
  assert.throws(() => integrate(withSeed, noSeed.state, 20, 10000), /step size fell below/);
  const run = integrate(withSeed, call("liftToSeed", { state: noSeed.state, beta: 1e-8 }), 20, 10000); // needs 6554
  const ss = R.steadyState({ x: 2, beta: 1e-8 });
  assertClose(run.state[0], ss.y, 1e-6, "y");
  assertClose(Math.exp(run.state[1]), ss.p, 1e-6, "p");
});

test("pump off for 720τ: y falls past 10⁻³⁰⁰ while s stops at the seed of y = 10⁻¹²; back on, the laser starts again", () => {
  // ε = 0.1 keeps the run short; the seed works the same for any ε. The
  // seed counts y as y + 10⁻¹² (Y_FLOOR), so s settles at
  // ln(β·(y + 10⁻¹²)/(1 − y)) instead of following ln(βy) down past −709,
  // and the photons need not climb hundreds of e-folds when the pump comes
  // back.
  const loose = { rtol: 1e-6, atol: 1e-9 };
  const off = integrate({ x: 0, eps: 0.1, beta: 1e-8 }, [1, 0], 720, 4000, loose);      // measured: 2629
  const [y, s] = off.state;
  assert.ok(y > 0 && y < 1e-300, "y = " + y);
  assertClose(s, Math.log(1e-8 * 1e-12), 1e-6, "s at the floor's seed level");
  // At that level within the solver's tolerance (measured: 1.5×10⁻⁵ below
  // it), so liftToSeed has nearly nothing to add.
  const lifted = call("liftToSeed", { state: off.state, beta: 1e-8 });
  assert.equal(lifted[0], y, "y is never changed");
  assert.ok(Math.abs(lifted[1] - s) < 1e-4, "s lifted by " + (lifted[1] - s));
  const run = integrate({ x: 2, eps: 0.1, beta: 1e-8 }, off.state, 20, 400, loose);     // measured: 251
  assertClose(run.state[0], 1, 1e-6, "y");
  assertClose(Math.exp(run.state[1]), 1, 1e-6, "p");
});

// Kicks the steady state by δy, follows y for `cycles` periods in short
// calls (200 per period, carrying hNext, each limited to 200 steps), and returns the times y − 1
// crosses 0 upwards (linear interpolation) and the peaks of y − 1
// (parabola through three samples).
function smallOscillation(x, eps, kick, cycles) {
  const f = R.derivatives({ x, eps, beta: 0 });
  const period = 2 * Math.PI / Math.sqrt((x - 1) / eps - x * x / 4);
  const dt = period / 200;
  let t = 0;
  let state = [1 + kick, Math.log(x - 1)];
  let h;
  const samples = [];
  for (let i = 0; i < cycles * 200; i++) {
    // A call this short takes a few steps; the limit keeps a broken solver
    // from spending 100 000 steps on each of the 1200 calls.
    const run = ode.dopri5({ f, t0: t, state0: state, t1: t + dt, h0: h, rtol: 1e-10, atol: 1e-13, maxSteps: 200 });
    assert.ok(run.reachedEnd, "a short call finished within 200 steps");
    h = run.hNext;
    t = run.t;
    state = run.state;
    samples.push([t, state[0] - 1]);
  }
  const crossings = [];
  const peaks = [];
  for (let i = 1; i < samples.length - 1; i++) {
    const [ta, a] = samples[i - 1];
    const [tb, b] = samples[i];
    const c = samples[i + 1][1];
    if (a < 0 && b >= 0) crossings.push(ta + (tb - ta) * (-a) / (b - a));
    if (b > a && b >= c) {
      const shift = (a - c) / (2 * (a - 2 * b + c));
      peaks.push([tb + shift * dt, b - (a - c) * shift / 4]);
    }
  }
  return { crossings, peaks };
}

test("§4.2: ruby's small oscillation has the period 2π/ω = 17.2 µs (doc: ≈ 17 µs)", () => {
  // τ = 3 ms, τ_c = 5 ns, x = 3. Small means δy ≪ √(ε(x − 1)) ≈ 1.8×10⁻³;
  // a 1 % kick is full spiking, with a period twice as long.
  const tau = 3e-3;
  const tau_c = 5e-9;
  const x = 3;
  const eps = tau_c / tau;
  const { crossings } = smallOscillation(x, eps, 1e-3 * Math.sqrt(eps * (x - 1)), 6);
  const spacings = crossings.slice(1).map((time, i) => time - crossings[i]);
  assert.ok(spacings.length >= 4, spacings.length + " periods");
  const periodSeconds = tau * spacings.reduce((sum, v) => sum + v) / spacings.length;
  const theory = call("relaxation", { x, tau, tau_c });
  assertClose(periodSeconds, 2 * Math.PI / theory.omegaDamped, 1e-4, "vs exact linear theory");   // measured 1e-6
  assertClose(periodSeconds, 2 * Math.PI / theory.omegaR, 0.05, "vs the doc's ω_R");
  assertClose(periodSeconds * 1e6, 17, 0.5 / 17, "doc: ≈ 17 µs");
});

test("§4.2: small oscillations die out at the rate x/2τ (t_damp = 2τ/x)", () => {
  const x = 2;
  const eps = 1e-3;
  const { peaks } = smallOscillation(x, eps, 1e-3 * Math.sqrt(eps * (x - 1)), 6);
  assert.ok(peaks.length >= 5, peaks.length + " peaks");
  const first = peaks[0];
  const last = peaks[peaks.length - 1];
  const rate = Math.log(first[1] / last[1]) / (last[0] - first[0]);     // per τ
  assertClose(rate, x / 2, 0.01, "decay rate");                           // measured 1 + 1e-4
});

test("§4.2, D3: He-Ne (ε ≈ 0.66, x = 2) follows the linear solution: one swing, then e^8.8 smaller per period", () => {
  // The solution of the linearized equations about (y, s) = (1, ln(x − 1)),
  // kicked by δy = k: with a = τ/t_damp and ω = ω·τ from relaxation(),
  //   δy = k·e^(−at′)·(cos ωt′ − (x/2)·sin(ωt′)/ω),   δs = k·e^(−at′)·sin(ωt′)/(εω).
  // A step in f that matters only at large ε would show up here: every
  // other dynamics test has ε ≤ 10⁻³.
  const gamma = K.singlePassLoss({ refl1: 0.99, refl2: 0.98, alpha_i: 0, l_g: 0.3 });
  const tau_c = K.photonLifetime({ L_e: 0.3, gamma });
  const tau = M.get("he-ne").tau;
  const x = 2;
  const eps = tau_c / tau;
  const r = call("relaxation", { x, tau, tau_c });
  const a = tau / r.t_damp;
  const w = r.omegaDamped * tau;
  const k = 1e-6;
  const f = R.derivatives({ x, eps, beta: 0 });
  let state = [1 + k, Math.log(x - 1)];
  let t = 0;
  let h;
  for (let i = 1; i <= 18; i++) {                 // to t′ = 9, one period (8.8)
    const run = ode.dopri5({ f, t0: t, state0: state, t1: i * 0.5, h0: h, rtol: 1e-13, atol: 1e-15, maxSteps: 100 });
    assert.ok(run.reachedEnd, "a short call finished within 100 steps");      // 99 steps in all
    h = run.hNext;
    t = run.t;
    state = run.state;
    const envelope = k * Math.exp(-a * t);
    const dy = envelope * (Math.cos(w * t) - (x / 2) * Math.sin(w * t) / w);
    const ds = envelope * Math.sin(w * t) / (eps * w);
    // measured: within 4×10⁻⁶ of the envelope
    assertClose(state[0] - 1, dy, 0, "δy at t′ = " + t, 1e-4 * envelope);
    assertClose(state[1] - Math.log(x - 1), ds, 0, "δs at t′ = " + t, 1e-4 * envelope);
  }
});

/* ---------- relaxation ---------- */

test("relaxation: the doc's ruby numbers, 17.2 µs, 2 ms, and 116 oscillations while the amplitude falls by e", () => {
  const r = call("relaxation", { x: 3, tau: 3e-3, tau_c: 5e-9 });
  assertClose(2 * Math.PI / r.omegaR, 17.21e-6, 0.005 / 17.21, "period");     // 17.2072 µs
  assertClose(r.t_damp, 2e-3, 1e-12, "t_damp = 2τ/x");
  assertClose(r.omegaDamped * r.t_damp, 730.3, 0.05 / 730.3, "radians per damping time");
  assertClose(r.omegaDamped * r.t_damp / (2 * Math.PI), 116, 0.5 / 116, "oscillations per damping time");   // 116.2
  // to 1 % takes ln 100 = 4.6 damping times: about 535 oscillations
  assertClose(Math.log(100) * r.omegaDamped * r.t_damp / (2 * Math.PI), 535, 0.5 / 535, "oscillations to 1 %");
});

test("relaxation: He-Ne (x = 2) falls by e within 0.715 rad, by e^8.8 ≈ 6500 per period, so no oscillation shows (D3)", () => {
  const gamma = K.singlePassLoss({ refl1: 0.99, refl2: 0.98, alpha_i: 0, l_g: 0.3 });
  const tau_c = K.photonLifetime({ L_e: 0.3, gamma });       // 66.15 ns
  const r = call("relaxation", { x: 2, tau: M.get("he-ne").tau, tau_c });
  assertClose(r.omegaDamped * r.t_damp, 0.715, 0.0005 / 0.715, "radians per damping time");
  const perPeriod = 2 * Math.PI / (r.omegaDamped * r.t_damp);                 // 8.784
  assertClose(perPeriod, 8.8, 0.05 / 8.8, "doc: e^8.8 per period");
  assertClose(Math.exp(perPeriod), 6500, 50 / 6500, "doc: ≈ 6500");           // 6522
  // exactly, ω² = ω_R² − (x/2τ)²; here the two differ a lot
  assertClose(r.omegaDamped ** 2, r.omegaR ** 2 - (1 / r.t_damp) ** 2, 1e-12, "ω²");
});

test("relaxation: an overdamped laser has no oscillation (0), and below threshold there is none to ask about", () => {
  const r = call("relaxation", { x: 2, tau: 1, tau_c: 2 });     // ω_R² = 0.5 < (x/2τ)² = 1
  assert.equal(r.omegaDamped, 0);
  for (const x of [1, 0.5]) {
    assert.throws(() => call("relaxation", { x, tau: 1e-3, tau_c: 1e-9 }), /x must be above 1/);
  }
});

/* ---------- inputs ---------- */

test("every input is checked, and every error names the function that was called", () => {
  const bad = (name, good, change, pattern) => {
    const params = Object.assign({}, good, change);
    assert.throws(() => call(name, params), pattern, name + " " + JSON.stringify(change));
    assert.throws(() => call(name, params), new RegExp("^Error: LaserEngine\\.rates\\.fourLevel\\." + name + ": "));
  };
  bad("scales", YAG_CAVITY, { sigma: 0 }, /sigma must be a positive/);
  bad("scales", YAG_CAVITY, { tau: -1 }, /tau must be a positive/);
  bad("scales", YAG_CAVITY, { nu: NaN }, /nu must be a positive/);
  bad("scales", YAG_CAVITY, { area: 0 }, /area must be a positive/);
  bad("scales", YAG_CAVITY, { refl2: 1.1 }, /refl2 must be a finite number above 0 and at most 1/);
  bad("scales", YAG_CAVITY, { alpha_i: -0.1 }, /alpha_i must be a finite number of at least 0/);
  bad("scales", YAG_CAVITY, { l_g: 0.5 }, /l_g .* longer than L_e/);
  bad("scales", YAG_CAVITY, { refl1: 1, refl2: 1 }, /no loss at all/);
  bad("scales", YAG_CAVITY, { refl1: 1, refl2: 1, alpha_i: 1e-320 }, /no loss at all/);  // γ too small to divide by
  bad("scales", YAG_CAVITY, { gamma: 0.02 }, /gamma is not one of its inputs/);
  bad("derivatives", { x: 2, eps: 1e-3, beta: 1e-8 }, { x: -1 }, /x must be a finite number of at least 0/);
  bad("derivatives", { x: 2, eps: 1e-3, beta: 1e-8 }, { eps: 0 }, /eps must be a positive/);
  bad("derivatives", { x: 2, eps: 1e-3, beta: 1e-8 }, { beta: 2 }, /beta must be a finite number from 0 to 1/);
  bad("derivatives", { x: 2, eps: 1e-3, beta: 1e-8 }, { beta: undefined }, /beta must be/);
  bad("steadyState", { x: 2, beta: 1e-8 }, { x: -0.5 }, /x must be a finite number of at least 0/);
  bad("steadyState", { x: 2, beta: 1e-8 }, { beta: -1e-9 }, /beta must be a finite number from 0 to 1/);
  bad("relaxation", { x: 3, tau: 3e-3, tau_c: 5e-9 }, { tau_c: 0 }, /tau_c must be a positive/);
  bad("relaxation", { x: 3, tau: 3e-3, tau_c: 5e-9 }, { x: NaN }, /x must be a finite number/);
  const lift = { state: [0.5, -20], beta: 1e-8 };
  bad("liftToSeed", lift, { state: 0.5 }, /state must be an array of finite numbers/);
  bad("liftToSeed", lift, { state: [0.5, -20, 1] }, /state must be \[y, s\], got an array of length 3/);
  bad("liftToSeed", lift, { state: [0.5, NaN] }, /state\[1\] must be a finite number/);
  bad("liftToSeed", lift, { beta: 2 }, /beta must be a finite number from 0 to 1/);
  // A name a function does not use is refused, not ignored.
  bad("derivatives", { x: 2, eps: 1e-3, beta: 1e-8 }, { gamma_t: 0.1 }, /gamma_t is not one of its inputs/);
  bad("steadyState", { x: 2, beta: 1e-8 }, { eps: 1e-3 }, /eps is not one of its inputs/);
  bad("relaxation", { x: 3, tau: 3e-3, tau_c: 5e-9 }, { beta: 1e-8 }, /beta is not one of its inputs/);
  bad("liftToSeed", lift, { x: 2 }, /x is not one of its inputs/);
});

test("every function refuses plain numbers instead of one object of named values", () => {
  for (const name of ["scales", "derivatives", "steadyState", "relaxation", "liftToSeed"]) {
    assert.throws(() => R[name](2), new RegExp("^Error: LaserEngine\\.rates\\.fourLevel\\." + name +
      ": needs one object of named values"), name);
  }
});

test("a medium filling the cavity is allowed, even after float rounding", () => {
  // l_g = L_e = 0.7 − 0.4 (0.29999999999999993) against 0.3
  const sc = call("scales", Object.assign({}, YAG_CAVITY, { l_g: 0.3, L_e: 0.7 - 0.4 }));
  assertClose(sc.V_a, sc.V, 1e-9, "V_a = V");
});

test("the rates objects cannot be changed by accident", () => {
  assert.ok(Object.isFrozen(rates));
  assert.ok(Object.isFrozen(R));
});
