/* ============================================================================
   three-level.test.js — js/laser/engine/rates.js, the three-level rate
   equations (ruby) and the two-level atom that never lases
   (docs/laser-physics.md §2.2, §4.1, §4.2, §11.2; docs/laser-plan.md,
   stage 7b scope card).

   In dimensionless form (§11.2), with y = ΔN/N_c, p = 2Bτ·φ, w = W_pτ,
   n_t = N_t/N_c and t′ = t/τ:
     three-level  dy/dt′ = w(n_t − y) − (n_t + y) − y·p
     two-level    dy/dt′ = −2w·y − (n_t + y) − y·p
     both         ε·ds/dt′ = (y − 1) + β·(max(n_t + y, 0) + 10⁻⁷·n_t)·e^(−s)
   The seed comes from the upper level, N₂ = (N_t + ΔN)/2, not from ΔN,
   which is negative until half the ions are up.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine, deepFreeze, assertClose, plain } = require("./helpers.js");

const { constants: C, media: M, cavity: K, ode, rates } = loadEngine();
const R3 = rates.threeLevel;
const R2 = rates.twoLevel;
// The seed floor of three and two levels is 10⁻⁷·n_t (rates.js,
// ION_FLOOR); most tests below use n_t = 11.5.
const FLOOR = 1e-7 * 11.5;

function call(group, name, params) {
  return group[name](deepFreeze(Object.assign({}, params)));
}

// §3.1's ruby: rod 10 cm, 1 cm across, mirrors 0.5 m apart, R₂ = 0.5, no
// internal loss, N_t = 1.6×10¹⁹ cm⁻³.
const RUBY = M.get("ruby");
const RUBY_LE = K.effectiveLength({ L: 0.5, l_g: 0.1, nGroup: RUBY.nGroup });
const RUBY_CAVITY = {
  sigma: RUBY.sigma, tau: RUBY.tau, nu: RUBY.nu, l_g: 0.1, area: Math.PI * 0.005 * 0.005,
  L_e: RUBY_LE, refl1: 1, refl2: 0.5, alpha_i: 0, N_t: 1.6e19 / 1e-6
};
const RUBY_SCALES = call(R3, "scales", RUBY_CAVITY);

/* ---------- scales ---------- */

test("§3.1's ruby: N_c = 1.39×10¹⁸ cm⁻³, n_t = 11.54, ε = 1.848×10⁻⁶, τ_c = 5.54 ns, w_th = 1.190", () => {
  const sc = RUBY_SCALES;
  assertClose(sc.N_c * 1e-6, 1.39e18, 0.005 / 1.39, "N_c, cm⁻³");       // 1.38629e18
  assertClose(sc.n_t, 11.54, 0.005 / 11.54, "n_t");                       // 11.5416
  assertClose(sc.eps, 1.848e-6, 0.0005 / 1.848, "ε");                    // 1.84793e-6
  assertClose(sc.tau_c * 1e9, 5.54, 0.005 / 5.54, "τ_c, ns");            // 5.54378
  assertClose(sc.wThreshold, 1.190, 0.0005 / 1.19, "w_th");              // 1.18973
  // §2.2: 9 % of the ions must be inverted, ΔN_th/N_t = 1/n_t.
  assertClose(1 / sc.n_t, 0.0866, 0.00005 / 0.0866, "ΔN_th/N_t");
});

test("scales: the cavity numbers are the four-level ones; n_t and w_th follow their definitions", () => {
  const four = Object.assign({}, RUBY_CAVITY);
  delete four.N_t;
  const sc4 = rates.fourLevel.scales(deepFreeze(four));
  for (const name of ["gamma", "tau_c", "N_c", "V", "V_a", "B", "eps"]) {
    assertClose(RUBY_SCALES[name], sc4[name], 1e-12, name);
  }
  assertClose(RUBY_SCALES.n_t, RUBY_CAVITY.N_t / RUBY_SCALES.N_c, 1e-12, "n_t = N_t/N_c");
  const nt = RUBY_SCALES.n_t;
  assertClose(RUBY_SCALES.wThreshold, (nt + 1) / (nt - 1), 1e-12, "w_th = (n_t + 1)/(n_t − 1)");
  assert.equal(RUBY_SCALES.R_c, undefined, "no four-level pump rate R_c");
});

test("scales: p = 2Bτ·φ (one emission changes ΔN by 2), so P_out per unit of p is (γ₂/2)·A·I_sat with ruby's I_sat", () => {
  const sc = RUBY_SCALES;
  assertClose(sc.pOnePhoton, 2 * sc.B * RUBY.tau, 1e-12, "one photon: p = 2Bτ");
  assertClose(sc.sOnePhoton, Math.log(2 * sc.B * RUBY.tau), 1e-12, "s");
  assertClose(sc.phiPerP * sc.pOnePhoton, 1, 1e-12, "φ = p·phiPerP");
  const area = RUBY_CAVITY.area;
  // media.js gives ruby I_sat = hν/(2στ), with the same factor 2.
  assertClose(sc.powerPerP, 0.5 * -Math.log(0.5) * area * RUBY.I_sat, 1e-12, "powerPerP");
  // W per photon does not depend on how p is scaled: hν·cγ₂/(2L_e).
  assertClose(sc.powerPerP * sc.pOnePhoton, C.h * RUBY.nu * C.c * -Math.log(0.5) / (2 * RUBY_LE), 1e-12, "W per photon");
});

test("scales: with fewer ions than the threshold inversion there is no threshold (w_th null)", () => {
  for (const share of [0.5, 1]) {
    const sc = call(R3, "scales", Object.assign({}, RUBY_CAVITY, { N_t: share * RUBY_SCALES.N_c }));
    assertClose(sc.n_t, share, 1e-12, "n_t");
    assert.equal(sc.wThreshold, null, "n_t = " + share);
  }
});

/* ---------- the right-hand side ---------- */

test("threeLevel.derivatives: dy/dt′ = w(n_t − y) − (n_t + y) − y·p, ε·ds/dt′ = (y − 1) + β(n_t + y + 10⁻⁷·n_t)e^(−s)", () => {
  const params = { w: 2.5, n_t: 11.5, eps: 1e-3, beta: 1e-6 };
  const f = call(R3, "derivatives", params);
  for (const [y, s] of [[0.8, -3], [-5, -20], [3, 1]]) {
    const [dy, ds] = f(0, deepFreeze([y, s]));
    assertClose(dy, 2.5 * (11.5 - y) - (11.5 + y) - y * Math.exp(s), 1e-14, "dy/dt′ at y = " + y);
    assertClose(ds, ((y - 1) + 1e-6 * (11.5 + y + FLOOR) * Math.exp(-s)) / 1e-3, 1e-14, "ds/dt′ at y = " + y);
  }
});

test("the seed comes from the upper level N₂, not from ΔN: it is the floor's at y = −n_t and positive while ΔN < 0", () => {
  const f = call(R3, "derivatives", { w: 0, n_t: 11.5, eps: 1e-3, beta: 1e-8 });
  // All ions down: N₂ = 0, so only the floor's 10⁻⁷·n_t is left.
  const [, atBottom] = f(0, [-11.5, -40]);
  assertClose(atBottom, (-12.5 + 1e-8 * FLOOR * Math.exp(40)) / 1e-3, 1e-14, "at y = −n_t");
  // ΔN = 0 (half up): the seed is β·n_t·e^(−s), not the floor's alone.
  const [, atZero] = f(0, [0, -40]);
  assertClose(atZero, (-1 + 1e-8 * (11.5 + FLOOR) * Math.exp(40)) / 1e-3, 1e-14, "at y = 0");
  // Below half (ΔN < 0): still a positive seed, from N₂ = (N_t + ΔN)/2.
  const [, belowHalf] = f(0, [-6, -40]);
  assertClose(belowHalf, (-7 + 1e-8 * (5.5 + FLOOR) * Math.exp(40)) / 1e-3, 1e-14, "at y = −6");
  // A solver trial a hair below −n_t: the floor, not a negative seed.
  const [, under] = f(0, [-11.5 - 1e-13, -40]);
  assertClose(under, (-12.5 - 1e-13 + 1e-8 * FLOOR * Math.exp(40)) / 1e-3, 1e-14, "just under −n_t");
});

test("the seed stays finite where e^(−s) alone overflows, and with β = 0 it is left out", () => {
  // s = ln(β·n_t/2), so the seed β(n_t + floor)·e^(−s) is 2(1 + 10⁻⁷);
  // e^(−s) on its own is Infinity.
  const beta = 1e-310;
  const s = Math.log(beta) + Math.log(11.5 / 2);        // ≈ −712.1
  const [, ds] = call(R3, "derivatives", { w: 0, n_t: 11.5, eps: 1e-3, beta })(0, [0, s]);
  assertClose(ds, (-1 + 2 * (11.5 + FLOOR) / 11.5) / 1e-3, 1e-12, "ds/dt′");
  const [dy0, ds0] = call(R3, "derivatives", { w: 1, n_t: 11.5, eps: 1e-3, beta: 0 })(0, [0.5, -800]);
  assertClose(dy0, (11.5 - 0.5) - (11.5 + 0.5), 1e-14, "dy/dt′ with p = 0");
  assertClose(ds0, (0.5 - 1) / 1e-3, 1e-15, "ds/dt′ without a seed");
});

test("the pump may be a function of t′ (a flash): f uses its value at each time", () => {
  const pump = (tPrime) => 3 * tPrime;
  const fn = call(R3, "derivatives", { w: pump, n_t: 11.5, eps: 1e-3, beta: 1e-8 });
  for (const t of [0, 0.25, 2]) {
    const fixed = call(R3, "derivatives", { w: 3 * t, n_t: 11.5, eps: 1e-3, beta: 1e-8 });
    assert.deepEqual(plain(fn(t, [-4, -10])), plain(fixed(t, [-4, -10])), "t′ = " + t);
  }
  const fn2 = call(R2, "derivatives", { w: pump, n_t: 11.5, eps: 1e-3, beta: 1e-8 });
  const fixed2 = call(R2, "derivatives", { w: 6, n_t: 11.5, eps: 1e-3, beta: 1e-8 });
  assert.deepEqual(plain(fn2(2, [-4, -10])), plain(fixed2(2, [-4, -10])), "two-level");
});

test("twoLevel.derivatives: dy/dt′ = −2w·y − (n_t + y) − y·p, and the same photon equation", () => {
  const f = call(R2, "derivatives", { w: 2.5, n_t: 11.5, eps: 1e-3, beta: 1e-6 });
  for (const [y, s] of [[0.8, -3], [-5, -20], [-11.5, 1]]) {
    const [dy, ds] = f(0, deepFreeze([y, s]));
    assertClose(dy, -2 * 2.5 * y - (11.5 + y) - y * Math.exp(s), 1e-14, "dy/dt′ at y = " + y);
    assertClose(ds, ((y - 1) + 1e-6 * (Math.max(11.5 + y, 0) + FLOOR) * Math.exp(-s)) / 1e-3, 1e-14, "ds/dt′ at y = " + y);
  }
});

test("two levels: at ΔN ≥ 0 the inversion always falls, however hard the pump and whatever the light", () => {
  for (const w of [0, 1, 1e3, 1e6]) {
    const f = call(R2, "derivatives", { w, n_t: 11.5, eps: 1e-3, beta: 1e-8 });
    for (const y of [0, 1e-9, 1, 11.5]) {
      for (const s of [-50, 0, 10]) {
        assert.ok(f(0, [y, s])[0] < 0, "dy/dt′ at w = " + w + ", y = " + y + ", s = " + s);
      }
    }
  }
});

/* ---------- steady states ---------- */

test("§2.2: without light the three-level inversion is n_t(w − 1)/(w + 1): negative below W_pτ = 1, positive above", () => {
  for (const w of [0, 0.5, 0.999, 1, 1.001, 1.1]) {
    const ss = call(R3, "steadyState", { w, n_t: 11.5, beta: 0 });
    assert.equal(ss.p, 0, "no light below threshold at w = " + w);
    assertClose(ss.y, 11.5 * (w - 1) / (w + 1), 1e-12, "y at w = " + w, 1e-15);
  }
  assert.ok(call(R3, "steadyState", { w: 0.999, n_t: 11.5, beta: 0 }).y < 0);
  assert.ok(call(R3, "steadyState", { w: 1.001, n_t: 11.5, beta: 0 }).y > 0);
  assertClose(call(R3, "steadyState", { w: 0, n_t: 11.5, beta: 0 }).y, -11.5, 1e-15, "all ions down");
});

test("above threshold the three-level laser clamps y at 1 with p = (n_t + 1)(x − 1), x = w/w_th", () => {
  const nt = 11.5;
  const wth = (nt + 1) / (nt - 1);
  for (const x of [1.5, 3, 10]) {
    const ss = call(R3, "steadyState", { w: x * wth, n_t: nt, beta: 0 });
    assertClose(ss.y, 1, 1e-12, "y at x = " + x);
    assertClose(ss.p, (nt + 1) * (x - 1), 1e-12, "p at x = " + x);
  }
});

test("steadyState makes f zero, three and two levels, below and above threshold, with the seed", () => {
  // From w = 0.01 up: with no pump n_t + y is far below the rounding of
  // y ≈ −n_t, so f cannot be evaluated there to 10⁻¹² (the next test).
  for (const beta of [1e-12, 1e-8, 1e-4]) {
    for (const nt of [0.5, 2, 11.5]) {
      for (const w of [0.01, 0.3, 1, 1.25, 3, 50]) {
        const label = " at w = " + w + ", n_t = " + nt + ", β = " + beta;
        const ss3 = call(R3, "steadyState", { w, n_t: nt, beta });
        const [dy3, ds3] = R3.derivatives({ w, n_t: nt, eps: 1, beta })(0, [ss3.y, Math.log(ss3.p)]);
        assertClose(dy3, 0, 0, "three-level dy/dt′" + label, 1e-12 * Math.max(1, w * nt));
        assertClose(ds3, 0, 0, "three-level ds/dt′" + label, 1e-12);
        const ss2 = call(R2, "steadyState", { w, n_t: nt, beta });
        const [dy2, ds2] = R2.derivatives({ w, n_t: nt, eps: 1, beta })(0, [ss2.y, Math.log(ss2.p)]);
        assertClose(dy2, 0, 0, "two-level dy/dt′" + label, 1e-12 * Math.max(1, w * nt));
        assertClose(ds2, 0, 0, "two-level ds/dt′" + label, 1e-12);
        assert.ok(ss2.y < 0, "two levels never invert" + label);
      }
    }
  }
});

test("steadyState with no pump: nearly every ion down, the photons at the floor's seed (both schemes)", () => {
  // y = −n_t/(1 + p), so the upper level is n_t·p/(1 + p), and the photon
  // equation (y − 1)·p + β(n_t·p/(1 + p) + 10⁻⁷·n_t) = 0, written with the
  // upper level as it is and not as n_t + y.
  for (const group of [R3, R2]) {
    for (const beta of [1e-12, 1e-8, 1e-4]) {
      for (const nt of [0.5, 2, 11.5]) {
        const { y, p } = call(group, "steadyState", { w: 0, n_t: nt, beta });
        const label = " at n_t = " + nt + ", β = " + beta;
        assertClose(y, -nt / (1 + p), 1e-15, "y" + label);
        const upper = nt * p / (1 + p);
        assertClose((y - 1) + beta * (upper + 1e-7 * nt) / p, 0, 0, "the photon equation" + label, 1e-12);
        assertClose(p, beta * 1e-7 * nt / (nt + 1), 1e-3, "the floor's seed level" + label);
      }
    }
  }
});

test("twoLevel.steadyState: y = −n_t/(1 + 2w + p), which only approaches 0 as the pump grows", () => {
  for (const w of [0, 1, 10, 1e3, 1e6]) {
    const ss = call(R2, "steadyState", { w, n_t: 11.5, beta: 1e-8 });
    assertClose(ss.y, -11.5 / (1 + 2 * w + ss.p), 1e-12, "y at w = " + w);
    assert.ok(ss.y < 0 && ss.p < 1e-6, "no light at w = " + w + ": p = " + ss.p);
  }
  assertClose(call(R2, "steadyState", { w: 1e6, n_t: 11.5, beta: 0 }).y, -11.5 / 2000001, 1e-12, "w = 10⁶");
});

test("steadyState keeps full precision for a tiny seed below threshold (no cancellation)", () => {
  // p ≈ c/|a| with c = β(2n_t·w + 10⁻¹²(1 + w)), a = (n_t − 1)w − (n_t + 1) + β(n_t + 10⁻¹²).
  const ss = call(R3, "steadyState", { w: 0.5, n_t: 11.5, beta: 1e-15 });
  const a = 10.5 * 0.5 - 12.5;
  const c = 1e-15 * (2 * 11.5 * 0.5 + FLOOR * 1.5);
  assertClose(ss.p, c / -a, 1e-9, "p");
});

/* ---------- relaxation (three levels) ---------- */

test("relaxation: ruby at x = 3 oscillates with a period of 5.12 µs and dies out in 0.202 ms (not §4.2's four-level 17 µs and 2 ms)", () => {
  const nt = RUBY_SCALES.n_t;
  const w = 3 * RUBY_SCALES.wThreshold;
  const r = call(R3, "relaxation", { w, n_t: nt, tau: RUBY.tau, tau_c: RUBY_SCALES.tau_c });
  assertClose(2 * Math.PI / r.omegaDamped * 1e6, 5.116, 0.0005 / 5.116, "period, µs");     // 5.11630
  assertClose(r.t_damp * 1e3, 0.2023, 0.00005 / 0.2023, "t_damp, ms");                    // 0.202345
  // The formulas: ω_R² = p₀/(ττ_c), p₀ = (n_t − 1)w − (n_t + 1) = (n_t + 1)(x − 1);
  // the damping rate n_t(w − 1)/(2τ).
  const p0 = (nt - 1) * w - (nt + 1);
  assertClose(p0, (nt + 1) * 2, 1e-12, "p₀");
  assertClose(r.omegaR, Math.sqrt(p0 / (RUBY.tau * RUBY_SCALES.tau_c)), 1e-12, "ω_R");
  assertClose(r.t_damp, 2 * RUBY.tau / (nt * (w - 1)), 1e-12, "t_damp");
  assertClose(r.omegaDamped ** 2, r.omegaR ** 2 - (1 / r.t_damp) ** 2, 1e-12, "ω²");
});

test("relaxation: none at or below threshold, none without a threshold, and 0 when overdamped", () => {
  // n_t = 11.5: w_th = 12.5/10.5 = 1.1905
  for (const w of [1.19, 1, 0.3]) {
    assert.throws(() => call(R3, "relaxation", { w, n_t: 11.5, tau: 3e-3, tau_c: 5e-9 }), /w must be above the threshold/);
  }
  assert.throws(() => call(R3, "relaxation", { w: 1e6, n_t: 1, tau: 3e-3, tau_c: 5e-9 }), /no threshold/);
  const r = call(R3, "relaxation", { w: 3, n_t: 11.5, tau: 1, tau_c: 100 });
  assert.equal(r.omegaDamped, 0, "ω_R² = 0.19 against a damping rate of 11.5");
});

test("relaxation against a kicked ruby: period within 2 %, damping time within 10 %", () => {
  // Ruby's ε and n_t at x = 3, kicked by δy = 10⁻⁵ (≪ √(ε·p₀) ≈ 7×10⁻³:
  // a small oscillation), followed for 8 periods in 200 short calls each.
  const nt = RUBY_SCALES.n_t;
  const eps = RUBY_SCALES.eps;
  const w = 3 * RUBY_SCALES.wThreshold;
  const r = call(R3, "relaxation", { w, n_t: nt, tau: RUBY.tau, tau_c: RUBY_SCALES.tau_c });
  const f = R3.derivatives({ w, n_t: nt, eps, beta: 0 });
  const period = 2 * Math.PI / r.omegaDamped / RUBY.tau;          // in τ
  const dt = period / 200;
  let state = [1 + 1e-5, Math.log((nt - 1) * w - (nt + 1))];
  let t = 0;
  let h;
  const ups = [];
  const peaks = [];
  let before = null;
  let prev = state[0] - 1;
  for (let i = 0; i < 200 * 8; i++) {
    const run = ode.dopri5({ f, t0: t, state0: state, t1: t + dt, h0: h, rtol: 1e-11, atol: 1e-14, maxSteps: 60 });
    assert.ok(run.reachedEnd, "a short call finished within 60 steps");
    h = run.hNext;
    t = run.t;
    state = run.state;
    const now = state[0] - 1;
    if (prev < 0 && now >= 0) ups.push(t - dt * now / (now - prev));
    if (before !== null && prev > before && prev >= now) peaks.push([t - dt, prev]);
    before = prev;
    prev = now;
  }
  assert.ok(ups.length >= 6 && peaks.length >= 6, ups.length + " crossings, " + peaks.length + " peaks");
  const measuredPeriod = (ups[ups.length - 1] - ups[0]) / (ups.length - 1) * RUBY.tau;
  assertClose(measuredPeriod, 2 * Math.PI / r.omegaDamped, 0.02, "period");
  const first = peaks[0];
  const last = peaks[peaks.length - 1];
  const tDamp = (last[0] - first[0]) * RUBY.tau / Math.log(first[1] / last[1]);
  assertClose(tDamp, r.t_damp, 0.1, "damping time");
});

/* ---------- liftToSeed (three and two levels) ---------- */

test("liftToSeed leaves the one-photon start, a running laser, the below-threshold level and β = 0 alone", () => {
  const nt = RUBY_SCALES.n_t;
  const below = R3.steadyState({ w: 0.5, n_t: nt, beta: 1e-8 });
  const belowTwo = R2.steadyState({ w: 5, n_t: nt, beta: 1e-8 });
  const cases = [
    { state: [-nt, RUBY_SCALES.sOnePhoton], n_t: nt, beta: 1e-8 },        // all ions down, one photon
    { state: [1, Math.log(25)], n_t: nt, beta: 1e-8 },                    // lasing
    { state: [below.y, Math.log(below.p)], n_t: nt, beta: 1e-8 },         // three-level, below threshold
    { state: [belowTwo.y, Math.log(belowTwo.p)], n_t: nt, beta: 1e-8 },   // the two-level atom, pumped
    { state: [0.5, -1e6], n_t: nt, beta: 0 }                              // no seed: nothing to lift to
  ];
  for (const c of cases) {
    assert.deepEqual(plain(call(R3, "liftToSeed", c)), c.state, JSON.stringify(c));
  }
});

test("liftToSeed raises s to ln(β·(max(n_t + y, 0) + 10⁻⁷·n_t)/(1 + n_t)), never above the level below threshold", () => {
  const nt = 11.5;
  const lifted = call(R3, "liftToSeed", { state: [-3, -300], n_t: nt, beta: 1e-8 });
  assert.equal(lifted[0], -3, "y is never changed");
  assertClose(lifted[1], Math.log(1e-8 * (8.5 + FLOOR) / 12.5), 1e-15, "s");
  for (const y of [-nt, -nt - 1e-13]) {
    const low = call(R3, "liftToSeed", { state: [y, -1e6], n_t: nt, beta: 1e-8 });
    assertClose(low[1], Math.log(1e-8 * FLOOR / 12.5), 1e-15, "s at y = " + y);
  }
  // The level below threshold, β(n_t + y)/(1 − y), is never lower: a
  // steady state is never raised.
  for (let y = -nt; y < 1; y += 0.25) {
    const level = call(R3, "liftToSeed", { state: [y, -1e6], n_t: nt, beta: 1e-8 })[1];
    const steady = Math.log(1e-8 * (Math.max(nt + y, 0) + FLOOR) / (1 - y));
    assert.ok(level <= steady + 1e-12, "y = " + y + ": " + level + " > " + steady);
  }
});

test("β turned on after a run with β = 0: the solver gives up, unless the state goes through liftToSeed", () => {
  // The three-level below threshold (w = 0.5), ε = 10⁻³: with no seed, s
  // falls from one photon (−30) to about −278 by t′ = 0.02.
  const nt = 11.5;
  const noSeed = ode.rosenbrock({ f: R3.derivatives({ w: 0.5, n_t: nt, eps: 1e-3, beta: 0 }),
    t0: 0, state0: [-nt, Math.log(1e-13)], t1: 0.02, maxSteps: 20 });             // measured: 6
  assert.ok(noSeed.reachedEnd, "steps " + noSeed.accepted);
  assert.ok(noSeed.state[1] < -250, "s = " + noSeed.state[1]);
  const f = R3.derivatives({ w: 0.5, n_t: nt, eps: 1e-3, beta: 1e-8 });
  assert.throws(() => ode.rosenbrock({ f, t0: 0, state0: noSeed.state, t1: 5, maxSteps: 2000 }), /step size fell below/);
  const lifted = call(R3, "liftToSeed", { state: noSeed.state, n_t: nt, beta: 1e-8 });
  const run = ode.rosenbrock({ f, t0: 0, state0: lifted, t1: 20, maxSteps: 650 });   // measured: 418
  assert.ok(run.reachedEnd, "steps " + run.accepted);
  const ss = R3.steadyState({ w: 0.5, n_t: nt, beta: 1e-8 });
  assertClose(run.state[0], ss.y, 1e-6, "y");
  assertClose(Math.exp(run.state[1]), ss.p, 1e-5, "p");
});

/* ---------- dynamics: the two-level atom never inverts ---------- */

test("the two-level atom never inverts: from all down, and from an inverted start, for every pump up to w = 10⁶", () => {
  // ε = 10⁻³. The inverted start (y = 0.9·n_t) is above threshold: it
  // gives a burst of light first, which empties it faster still.
  const nt = 11.5;
  for (const w of [0, 1, 10, 1e3, 1e6]) {
    const f = R2.derivatives({ w, n_t: nt, eps: 1e-3, beta: 1e-8 });
    for (const y0 of [-nt, 0.9 * nt]) {
      const label = "w = " + w + ", y0 = " + y0;
      let state = [y0, Math.log(1e-13)];
      let t = 0;
      let crossed = y0 < 0;
      // 0.05τ pieces up to 2τ: once below 0, every sample stays below.
      for (let i = 1; i <= 40; i++) {
        const run = ode.rosenbrock({ f, t0: t, state0: state, t1: i * 0.05, maxSteps: 1000 });  // measured: ≤ 633
        assert.ok(run.reachedEnd, label + ": a piece within 1000 steps");
        t = run.t;
        state = run.state;
        if (crossed) assert.ok(state[0] < 0, label + ": y = " + state[0] + " at t′ = " + t);
        if (state[0] < 0) crossed = true;
      }
      assert.ok(crossed, label + ": the inverted start relaxes below 0");
      const settled = ode.rosenbrock({ f, t0: t, state0: state, t1: 40, maxSteps: 2200 });   // measured: ≤ 1474
      assert.ok(settled.reachedEnd, label + ": settles within 2200 steps");
      const ss = R2.steadyState({ w, n_t: nt, beta: 1e-8 });
      assertClose(settled.state[0], ss.y, 1e-5, label + ": the steady state");
    }
  }
});

/* ---------- inputs ---------- */

test("every input is checked, and every error names the function that was called", () => {
  const bad = (group, groupName, name, good, change, pattern) => {
    const params = Object.assign({}, good, change);
    const label = groupName + "." + name + " " + JSON.stringify(change);
    assert.throws(() => call(group, name, params), pattern, label);
    assert.throws(() => call(group, name, params),
      new RegExp("^Error: LaserEngine\\.rates\\." + groupName + "\\." + name + ": "), label);
  };
  bad(R3, "threeLevel", "scales", RUBY_CAVITY, { N_t: 0 }, /N_t must be a positive/);
  bad(R3, "threeLevel", "scales", RUBY_CAVITY, { N_t: undefined }, /N_t must be a positive/);
  bad(R3, "threeLevel", "scales", RUBY_CAVITY, { sigma: -1 }, /sigma must be a positive/);
  bad(R3, "threeLevel", "scales", RUBY_CAVITY, { l_g: 1 }, /l_g .* longer than L_e/);
  bad(R3, "threeLevel", "scales", RUBY_CAVITY, { refl2: 1, refl1: 1 }, /no loss at all/);
  bad(R3, "threeLevel", "scales", RUBY_CAVITY, { x: 2 }, /x is not one of its inputs/);
  const d = { w: 2, n_t: 11.5, eps: 1e-3, beta: 1e-8 };
  for (const [group, groupName] of [[R3, "threeLevel"], [R2, "twoLevel"]]) {
    bad(group, groupName, "derivatives", d, { w: -1 }, /w must be a finite number of at least 0 or a function/);
    bad(group, groupName, "derivatives", d, { w: "2" }, /w must be a finite number of at least 0 or a function/);
    bad(group, groupName, "derivatives", d, { n_t: 0 }, /n_t must be a positive/);
    bad(group, groupName, "derivatives", d, { eps: 0 }, /eps must be a positive/);
    bad(group, groupName, "derivatives", d, { beta: 2 }, /beta must be a finite number from 0 to 1/);
    bad(group, groupName, "derivatives", d, { x: 2 }, /x is not one of its inputs/);
    bad(group, groupName, "steadyState", { w: 2, n_t: 11.5, beta: 1e-8 }, { w: () => 1 }, /w must be a finite number of at least 0/);
    bad(group, groupName, "steadyState", { w: 2, n_t: 11.5, beta: 1e-8 }, { n_t: -1 }, /n_t must be a positive/);
    bad(group, groupName, "steadyState", { w: 2, n_t: 11.5, beta: 1e-8 }, { eps: 1 }, /eps is not one of its inputs/);
  }
  const r = { w: 3, n_t: 11.5, tau: 3e-3, tau_c: 5e-9 };
  bad(R3, "threeLevel", "relaxation", r, { tau_c: 0 }, /tau_c must be a positive/);
  bad(R3, "threeLevel", "relaxation", r, { w: NaN }, /w must be a finite number/);
  bad(R3, "threeLevel", "relaxation", r, { x: 3 }, /x is not one of its inputs/);
  const lift = { state: [0.5, -20], n_t: 11.5, beta: 1e-8 };
  bad(R3, "threeLevel", "liftToSeed", lift, { state: [0.5] }, /state must be \[y, s\], got an array of length 1/);
  bad(R3, "threeLevel", "liftToSeed", lift, { state: [NaN, 0] }, /state\[0\] must be a finite number/);
  bad(R3, "threeLevel", "liftToSeed", lift, { n_t: 0 }, /n_t must be a positive/);
  bad(R3, "threeLevel", "liftToSeed", lift, { beta: -1 }, /beta must be a finite number from 0 to 1/);
});

test("every function refuses plain numbers instead of one object of named values", () => {
  for (const name of ["scales", "derivatives", "steadyState", "relaxation", "liftToSeed"]) {
    assert.throws(() => R3[name](2), new RegExp("^Error: LaserEngine\\.rates\\.threeLevel\\." + name + ": needs one object"), name);
  }
  for (const name of ["derivatives", "steadyState"]) {
    assert.throws(() => R2[name](2), new RegExp("^Error: LaserEngine\\.rates\\.twoLevel\\." + name + ": needs one object"), name);
  }
  assert.deepEqual(Object.keys(R2).sort(), ["derivatives", "steadyState"], "two levels use the three-level scales and liftToSeed");
});

test("the three- and two-level objects cannot be changed by accident", () => {
  assert.ok(Object.isFrozen(R3));
  assert.ok(Object.isFrozen(R2));
});
