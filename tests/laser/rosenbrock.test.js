/* ============================================================================
   rosenbrock.test.js — js/laser/engine/ode.js, the implicit solver
   ode.rosenbrock: the Rosenbrock 2(3) pair behind MATLAB's ode23s, for the
   stiff runs of the laser (below threshold the photons sit at their seed
   level, where an explicit step must stay below 3.3ε/(1 − y); §11.3).

   Source: L. F. Shampine and M. W. Reichelt, "The MATLAB ODE Suite",
   SIAM J. Sci. Comput. 18 (1997) 1–22, §3. The formulas and the bounds
   below are in docs/laser-plan.md, stage 7a; the numbers were measured
   with the real file.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine, deepFreeze, assertClose, plain } = require("./helpers.js");

const { ode, rates } = loadEngine();

// Every call goes through deep-frozen inputs, so the solver cannot change them.
function solve(params) {
  return ode.rosenbrock(deepFreeze(Object.assign({}, params)));
}

const decay = (t, state) => [-state[0]];                        // y = e^(−t)
const oscillator = (t, state) => [state[1], -state[0]];         // x = cos t
// A smooth nonlinear problem that depends on t (a driven pendulum).
const forced = (t, state) => [state[1], -Math.sin(state[0]) + 0.5 * Math.cos(t)];

// A fixed step: the tolerances are so loose that every step is accepted
// and would grow, but hMax holds it.
function fixedStep(h) {
  return { h0: h, hMax: h, rtol: 1, atol: 1e10 };
}

const range = (n) => Array.from({ length: n }, (_, i) => i);

/* ---------- the method ---------- */

test("the two numbers of the method are Shampine and Reichelt's, and cannot be changed", () => {
  const { d, e32 } = ode.rosenbrockCoefficients;
  assert.equal(d, 1 / (2 + Math.SQRT2));
  assert.equal(e32, 6 + Math.SQRT2);
  assert.equal(Object.isFrozen(ode.rosenbrockCoefficients), true);
  assert.equal(Object.isFrozen(ode), true);
  assert.equal(typeof ode.rosenbrock, "function");
});

// The step of docs/laser-plan.md (stage 7a), written out from the paper,
// for a linear 2-component problem: f(t, y) = A·y + g·t, so J = A and T = g
// exactly. The solver finds J and T by differences, good to about 10⁻⁸.
const A = [[-2, 1], [1, -3]];
const g = [1, 0.5];
const linear = (t, y) => [A[0][0] * y[0] + A[0][1] * y[1] + g[0] * t, A[1][0] * y[0] + A[1][1] * y[1] + g[1] * t];

function solve2(W, b) {
  const det = W[0][0] * W[1][1] - W[0][1] * W[1][0];
  return [(W[1][1] * b[0] - W[0][1] * b[1]) / det, (W[0][0] * b[1] - W[1][0] * b[0]) / det];
}

function stepByHand(f, J, T, t, y, h, rtol, atol) {
  const { d, e32 } = { d: 1 / (2 + Math.SQRT2), e32: 6 + Math.SQRT2 };
  const hd = h * d;
  const W = [[1 - hd * J[0][0], -hd * J[0][1]], [-hd * J[1][0], 1 - hd * J[1][1]]];
  const F0 = f(t, y);
  const k1 = solve2(W, [F0[0] + hd * T[0], F0[1] + hd * T[1]]);
  const F1 = f(t + h / 2, [y[0] + h / 2 * k1[0], y[1] + h / 2 * k1[1]]);
  const k2a = solve2(W, [F1[0] - k1[0], F1[1] - k1[1]]);
  const k2 = [k2a[0] + k1[0], k2a[1] + k1[1]];
  const yNew = [y[0] + h * k2[0], y[1] + h * k2[1]];
  const F2 = f(t + h, yNew);
  const k3 = solve2(W, [0, 1].map((m) => F2[m] - e32 * (k2[m] - F1[m]) - 2 * (k1[m] - F0[m]) + hd * T[m]));
  let sum = 0;
  for (const m of [0, 1]) {
    const estimate = h / 6 * (k1[m] - 2 * k2[m] + k3[m]);
    const scale = atol + rtol * Math.max(Math.abs(y[m]), Math.abs(yNew[m]));
    sum += (estimate / scale) ** 2;
  }
  return { yNew, err: Math.sqrt(sum / 2) };
}

test("an accepted step: the new state and the next step size match the step done by hand", () => {
  const t0 = 0.3;
  const y0 = [1, -0.5];
  const h = 0.02;
  const rtol = 1e-4;
  const atol = 1e-6;
  const hand = stepByHand(linear, A, g, t0, y0, h, rtol, atol);
  assert.ok(hand.err > 0.01 && hand.err < 1, "a step well inside the tolerance: err " + hand.err);
  const run = solve({ f: linear, t0, state0: y0, t1: 10, h0: h, rtol, atol, maxSteps: 1 });
  assert.equal(run.accepted, 1);
  assertClose(run.t, t0 + h, 1e-15, "t");
  assertClose(run.state[0], hand.yNew[0], 1e-9, "y₀");
  assertClose(run.state[1], hand.yNew[1], 1e-9, "y₁");
  // The next step is h·0.9·err^(−1/3) (order 3 of the error estimate).
  assertClose(run.hNext, h * 0.9 * Math.pow(hand.err, -1 / 3), 1e-6, "hNext");
});

test("the error is measured against the larger of the old and the new state (a state growing from 0)", () => {
  // From y = 0 the old state alone would give the scale atol, 600 times
  // smaller than atol + rtol·|new state|: the photons at a first spike
  // grow like this. The step done by hand uses the larger of the two.
  const t0 = 0.3;
  const y0 = [0, 0];
  const h = 0.02;
  const rtol = 1e-4;
  const atol = 1e-9;
  const hand = stepByHand(linear, A, g, t0, y0, h, rtol, atol);
  assert.ok(hand.err > 0.01 && hand.err < 1, "a step inside the tolerance: err " + hand.err);
  const run = solve({ f: linear, t0, state0: y0, t1: 10, h0: h, rtol, atol, maxSteps: 1 });
  assert.equal(run.accepted, 1, "accepted");
  assertClose(run.hNext, h * 0.9 * Math.pow(hand.err, -1 / 3), 1e-6, "hNext");
});

test("a rejected step: the state stays, and the step shrinks to h·0.9·err^(−1/3)", () => {
  const h = 2;
  const rtol = 1e-8;
  const atol = 1e-10;
  const hand = stepByHand(linear, A, g, 0.3, [1, -0.5], h, rtol, atol);
  assert.ok(hand.err > 1, "too long a step: err " + hand.err);
  const run = solve({ f: linear, t0: 0.3, state0: [1, -0.5], t1: 10, h0: h, rtol, atol, maxSteps: 1 });
  assert.equal(run.rejected, 1);
  assert.equal(run.t, 0.3);
  assert.deepEqual(plain(run.state), [1, -0.5]);
  assertClose(run.hNext, h * Math.max(0.2, 0.9 * Math.pow(hand.err, -1 / 3)), 1e-6, "hNext");
});

test("the step size changes at most 5× up and 0.2× down per step", () => {
  // A huge error: the 0.2× floor.
  const shrunk = solve({ f: forced, t0: 0, state0: [1, 0.2], t1: 50, h0: 50, rtol: 1e-12, atol: 1e-14, maxSteps: 1 });
  assert.equal(shrunk.rejected, 1);
  assertClose(shrunk.hNext, 10, 1e-15, "0.2 × 50");
  // A tiny error: the 5× ceiling.
  const grown = solve({ f: decay, t0: 0, state0: [1], t1: 10, h0: 1e-6, maxSteps: 1 });
  assert.equal(grown.accepted, 1);
  assertClose(grown.hNext, 5e-6, 1e-15, "5 × 1e-6");
});

test("right after a rejected step, the step does not grow", () => {
  // A first step of 50 is rejected until it is short enough; the first
  // accepted step's own error would let the next one grow, but right after
  // a rejection it is held. (Measured: 4 rejections, then 0.351 accepted.)
  let run = null;
  for (let maxSteps = 1; maxSteps < 20; maxSteps++) {
    run = solve({ f: forced, t0: 0, state0: [1, 0.2], t1: 50, h0: 50, rtol: 1e-3, atol: 1e-3, maxSteps });
    if (run.accepted === 1) break;
  }
  assert.equal(run.accepted, 1);
  assert.ok(run.rejected >= 1);
  assert.ok(run.hNext <= run.t + 1e-15, "hNext " + run.hNext + " grew past the accepted step of " + run.t);
});

test("with fixed steps, halving the step makes the error 4 times smaller (order 2)", () => {
  const reference = ode.dopri5({ f: forced, t0: 0, state0: [1, 0.2], t1: 2, rtol: 1e-13, atol: 1e-13 }).state;
  function errorWith(steps) {
    const run = solve(Object.assign({ f: forced, t0: 0, state0: [1, 0.2], t1: 2 }, fixedStep(2 / steps)));
    assert.equal(run.accepted, steps, "a fixed step of 2/" + steps);
    return Math.hypot(run.state[0] - reference[0], run.state[1] - reference[1]);
  }
  const e32 = errorWith(32);
  const e64 = errorWith(64);
  const e128 = errorWith(128);
  for (const ratio of [e32 / e64, e64 / e128]) {      // measured 3.98, 3.99
    assert.ok(ratio >= 3.6 && ratio <= 4.4, "error ratio " + ratio + ", expected about 4");
  }
});

test("the error estimate of one step goes as h³ (order 3), which the step control is built on", () => {
  // The step factor of an accepted step is 0.9·err^(−1/3), so
  // err = (0.9·h/hNext)³, read from hNext (below the 5× limit).
  function estimate(h) {
    const run = solve({ f: forced, t0: 0.5, state0: [1, 0.2], t1: 10, h0: h, rtol: 1e-3, atol: 1e-3, maxSteps: 1 });
    assert.equal(run.accepted, 1);
    const factor = run.hNext / h;
    assert.ok(factor < 5, "inside the growth limit");
    return Math.pow(0.9 / factor, 3);
  }
  const ratio = estimate(0.2) / estimate(0.1);
  assert.ok(ratio >= 7 && ratio <= 9, "estimate ratio " + ratio + ", expected about 8");
});

test("decay y′ = −y to t = 10 and an oscillator for 10 periods: the error follows the tolerance", () => {
  // The tolerance holds for each step's error; an order-2 method whose new
  // state is the less accurate of its pair adds them up, so after hundreds
  // of steps the error is hundreds of times the tolerance (dopri5: 7×).
  // Measured: decay 2.4e-3, 5.2e-4, 2.4e-5 at rtol 1e-5, 1e-6, 1e-8; the
  // oscillator's v 6e-4 at rtol 1e-7.
  const exact = Math.exp(-10);
  function relativeError(tol) {
    const run = solve({ f: decay, t0: 0, state0: [1], t1: 10, rtol: tol, atol: tol * 1e-3 });
    assert.equal(run.reachedEnd, true);
    return Math.abs(run.state[0] - exact) / exact;
  }
  const loose = relativeError(1e-5);
  const tight = relativeError(1e-8);
  assert.ok(relativeError(1e-6) <= 1000 * 1e-6, "within 1000 × tol");
  assert.ok(tight <= loose / 50, "10³ × smaller tol → at least 50 × smaller error: " + loose + " → " + tight);
  const ring = solve({ f: oscillator, t0: 0, state0: [1, 0], t1: 20 * Math.PI, rtol: 1e-7, atol: 1e-7 });
  assertClose(ring.state[0], 1, 0, "x", 1e-3);
  assertClose(ring.state[1], 0, 0, "v", 1e-3);
  assert.ok(ring.rejected <= 0.05 * ring.accepted, ring.rejected + " rejected of " + ring.accepted);
});

/* ---------- stiffness: what it is for ---------- */

// y′ = −λ(y − cos t), y(0) = 0: after a jump of length 1/λ, y follows cos t.
function stiffRun(lambda, extra) {
  const run = solve(Object.assign({ f: (t, state) => [-lambda * (state[0] - Math.cos(t))], t0: 0, state0: [0], t1: 1 }, extra));
  const a = lambda * lambda / (1 + lambda * lambda);
  const b = lambda / (1 + lambda * lambda);
  const exact = a * Math.cos(1) + b * Math.sin(1) - a * Math.exp(-lambda);
  return { run, exact };
}

test("a stiff problem costs about the same for λ = 10⁴ and λ = 10⁸ (dopri5 needs λ/3.3 steps)", () => {
  const mild = stiffRun(1e4);
  const harsh = stiffRun(1e8);
  for (const { run, exact } of [mild, harsh]) {
    assert.equal(run.reachedEnd, true);
    assertClose(run.state[0], exact, 1e-5, "y(1)");
  }
  const steps = (run) => run.accepted + run.rejected;
  // Measured: 725 and 802 attempts. dopri5 needs about 3000 and 3×10⁷.
  assert.ok(steps(mild.run) <= 1000, steps(mild.run) + " attempts for λ = 10⁴");
  assert.ok(steps(harsh.run) <= 1000, steps(harsh.run) + " attempts for λ = 10⁸");
  assert.ok(steps(harsh.run) <= 1.5 * steps(mild.run), "10⁴ times stiffer, about the same cost");
});

test("a stiff problem that changes with t needs ∂f/∂t: it follows cos t accurately at a loose tolerance", () => {
  // At rtol 10⁻³ the step is long against 1/λ; without the h·d·T terms
  // the stiff part is driven by f alone and lags behind cos t.
  const { run, exact } = stiffRun(1e6, { rtol: 1e-3, atol: 1e-6 });
  assert.equal(run.reachedEnd, true);
  assertClose(run.state[0], exact, 1e-3, "y(1)");
  assert.ok(run.accepted + run.rejected <= 100, (run.accepted + run.rejected) + " attempts");
});

test("a part that decays far faster than the step is damped at once (L-stable)", () => {
  // Two independent parts: y₀′ = −y₀ (slow) and y₁′ = −10¹⁰·y₁ (stiff).
  // One step of 0.1 must leave the stiff part at almost 0, not ringing.
  const run = solve({ f: (t, y) => [-y[0], -1e10 * y[1]], t0: 0, state0: [1, 1], t1: 1, h0: 0.1, rtol: 1, atol: 1e10, maxSteps: 1 });
  assert.equal(run.accepted, 1);
  assert.ok(Math.abs(run.state[1]) < 1e-8, "stiff part after one step: " + run.state[1]);
  assertClose(run.state[0], Math.exp(-0.1), 1e-3, "slow part");
});

test("the laser at its seed level (ε = 10⁻⁶, x = 0.5, 3τ) takes about 10³ steps, not 7×10⁵, and matches the answer", () => {
  // §11.3: below threshold ∂ṡ/∂s = −(1 − y)/ε, so dopri5's step stays
  // below 3.3ε/(1 − y). Measured: 1233 attempts here; dopri5 692 964, too
  // many to run as a reference in a test, so the reference is the answer
  // itself, good to about 10⁻⁶ here (p ≈ 10⁻⁸ barely slows y, and s lags
  // its seed level by about ε).
  const f = rates.fourLevel.derivatives({ x: 0.5, eps: 1e-6, beta: 1e-8 });
  const state0 = [0, Math.log(1e-8 * 1e-12)];
  const run = solve({ f, t0: 0, state0, t1: 3, maxSteps: 2000 });
  assert.equal(run.reachedEnd, true, "out of steps at t′ = " + run.t);
  // Measured: y off by 1.1×10⁻⁵ (relative), s by 2.1×10⁻⁵.
  const exactY = 0.5 * (1 - Math.exp(-3));                // y′ = x − y while p ≈ 0
  assertClose(run.state[0], exactY, 5e-5, "y(3) = x(1 − e^(−3))");
  // The seed level itself: (y − 1)p + β(y + 10⁻¹²) = 0.
  const seed = Math.log(1e-8 * (exactY + 1e-12) / (1 - exactY));
  assert.ok(Math.abs(run.state[1] - seed) < 5e-5, "s at the seed level: off by " + (run.state[1] - seed));
});

test("a coupled 3-component stiff system matches its exact answer", () => {
  // z′ = D·z with D = [[−1, 2, 0], [−2, −1, 0], [0, 0, −10⁶]] has the exact
  // answer e^(−t)(cos 2t, −sin 2t)·… and e^(−10⁶t). Mixed by the
  // reflection P = I − (2/3)·ones (P = P⁻¹), y = P·z couples all three.
  const P = [[1 / 3, -2 / 3, -2 / 3], [-2 / 3, 1 / 3, -2 / 3], [-2 / 3, -2 / 3, 1 / 3]];
  const D = [[-1, 2, 0], [-2, -1, 0], [0, 0, -1e6]];
  const times = (M, v) => M.map((row) => row.reduce((sum, x, j) => sum + x * v[j], 0));
  const f = (t, y) => times(P, times(D, times(P, y)));
  const z0 = [1, 0.5, 2];
  const run = solve({ f, t0: 0, state0: times(P, z0), t1: 2, rtol: 1e-8, atol: 1e-10, maxSteps: 5000 });
  assert.equal(run.reachedEnd, true);
  const t = 2;
  const zt = [
    Math.exp(-t) * (z0[0] * Math.cos(2 * t) + z0[1] * Math.sin(2 * t)),
    Math.exp(-t) * (-z0[0] * Math.sin(2 * t) + z0[1] * Math.cos(2 * t)),
    0
  ];
  const yt = times(P, zt);
  yt.forEach((value, i) => assertClose(run.state[i], value, 0, "y" + i, 1e-6));
});

test("a step whose matrix has 0 where the first pivot would be is solved by swapping rows", () => {
  // f = [4·y₀ + y₁ + t, y₀] from y = [0, 0] at t = 0: the differences give
  // J = [[4, 1], [1, 0]] and T = [1, 0] exactly. With h·d = 1/4,
  // W = I − h·d·J has W₀₀ = 0: elimination without swapping rows divides
  // by 0 and the step would come out NaN and be rejected.
  const f = (t, y) => [4 * y[0] + y[1] + t, y[0]];
  const d = ode.rosenbrockCoefficients.d;
  let h = 0.25 / d;
  for (let tries = 0; h * d !== 0.25 && tries < 100; tries++) h += (0.25 - h * d) / d || Number.EPSILON;
  assert.equal(h * d, 0.25, "a step with h·d = 1/4 exactly");
  const run = solve({ f, t0: 0, state0: [0, 0], t1: 10, h0: h, rtol: 1, atol: 1e10, maxSteps: 1 });
  assert.equal(run.accepted, 1, "accepted at the first try");
  const hand = stepByHand(f, [[4, 1], [1, 0]], [1, 0], 0, [0, 0], h, 1, 1e10);
  assertClose(run.state[0], hand.yNew[0], 1e-9, "y₀");
  assertClose(run.state[1], hand.yNew[1], 1e-9, "y₁");
});

test("65 components at once (one per laser mode, later) each match their own answer", () => {
  const rateOf = range(65).map((i) => (i + 1) / 10);
  const run = solve({
    f: (t, state) => state.map((y, i) => -rateOf[i] * y),
    t0: 0, state0: rateOf.map(() => 1), t1: 1, rtol: 1e-6, atol: 1e-9,
    // About 1.5× what it needs: each step costs 66 calls of f and a 65 × 65
    // solve, so a broken solver with the default 100 000 ran for 70 s.
    maxSteps: 270
  });
  // Measured: 3.6e-4 at most, in 178 steps (each solves a 65 × 65 system).
  assert.equal(run.reachedEnd, true, "finished within its step budget");
  assert.equal(run.state.length, 65);
  rateOf.forEach((rate, i) => assertClose(run.state[i], Math.exp(-rate), 1e-3, "component " + i));
});

/* ---------- ending, budget, continuing ---------- */

test("the last step lands exactly on t1", () => {
  const run = solve({ f: decay, t0: 0.1, state0: [1], t1: 0.7, hMax: 0.07 });
  assert.equal(run.reachedEnd, true);
  assert.ok(run.accepted >= 9, "hMax 0.07 holds on every step: " + run.accepted + " steps for 0.6");
  assert.equal(run.t, 0.7);
  assertClose(run.state[0], Math.exp(-0.6), 1e-4, "y(0.7)");                 // measured 1.7e-5
});

test("out of budget: a correct partial result; continuing from it gives the very same answer", () => {
  const whole = solve({ f: decay, t0: 0, state0: [1], t1: 10 });
  const part = solve({ f: decay, t0: 0, state0: [1], t1: 10, maxSteps: 5 });
  assert.equal(part.reachedEnd, false);
  assert.equal(part.accepted + part.rejected, 5, "maxSteps counts every attempt");
  assert.equal(part.rejected, 0, "no rejected steps, so the two runs take the same steps");
  assert.ok(part.t > 0 && part.t < 10);
  assertClose(part.state[0], Math.exp(-part.t), 1e-5, "state at the partial t");
  const rest = solve({ f: decay, t0: part.t, state0: part.state, t1: 10, h0: part.hNext });
  assert.equal(rest.reachedEnd, true);
  assert.equal(part.accepted + rest.accepted, whole.accepted);
  assert.equal(rest.state[0], whole.state[0]);
});

test("a very short call does not shrink the step for the next one", () => {
  const first = solve({ f: decay, t0: 0, state0: [1], t1: 1, rtol: 1e-10, atol: 1e-13 });
  const planned = first.hNext;
  const short = solve({ f: decay, t0: 1, state0: first.state, t1: 1 + planned * 1e-6, h0: planned, rtol: 1e-10, atol: 1e-13 });
  assert.equal(short.reachedEnd, true);
  assert.equal(short.accepted, 1);
  assert.ok(short.hNext >= planned, "hNext " + short.hNext + " < planned " + planned);
});

test("evaluations: 1 at the start, 1 for the first-step guess, n + 1 per new point (J and T), 2 per attempt", () => {
  let calls = 0;
  const counted = (t, state) => { calls++; return forced(t, state); };
  const run = solve({ f: counted, t0: 0, state0: [1, 0.2], t1: 10 });
  assert.equal(run.evaluations, calls);
  assert.ok(run.rejected >= 1, "some steps rejected: " + run.rejected);
  // A rejected step is retried from the same point with the same J and T.
  assert.equal(run.evaluations, 2 + 3 * run.accepted + 2 * (run.accepted + run.rejected));
});

test("J and T belong to the point: a retried step uses the same ones, a new point gets new ones", () => {
  // Record where f is called. After a rejection the retry calls f only at
  // t + h/2 and t + h; the n + 1 extra calls happen once per point.
  const at = [];
  const f = (t, state) => { at.push(t); return forced(t, state); };
  const run = solve({ f, t0: 0, state0: [1, 0.2], t1: 50, h0: 50, rtol: 1e-6, atol: 1e-6, maxSteps: 3 });
  assert.ok(run.rejected >= 2, "two retries from t = 0: " + run.rejected + " rejected");
  // f(t0) + J (2 calls at t0) + T (1 call just after t0), then 2 per try.
  const atStart = at.filter((t) => t === 0).length;
  assert.equal(atStart, 3, "f at t0 once for f0 and twice for J, never again");
});

/* ---------- f cannot break the solver ---------- */

test("an f that changes its input or returns the same array every time gives the same answer", () => {
  const shared = [0, 0];
  const messy = (t, state) => {
    shared[0] = state[1];
    shared[1] = -state[0];
    state[0] = 999;
    return shared;
  };
  const clean = solve({ f: oscillator, t0: 0, state0: [1, 0], t1: 5 });
  const run = solve({ f: messy, t0: 0, state0: [1, 0], t1: 5 });
  assert.deepEqual(plain(run.state), plain(clean.state));
});

test("the result is a new array, never the input", () => {
  const input = deepFreeze([1, 0.2]);
  const run = ode.rosenbrock(deepFreeze({ f: forced, t0: 0, state0: input, t1: 50, h0: 50, maxSteps: 1, rtol: 1e-12, atol: 1e-14 }));
  assert.equal(run.accepted, 0);
  assert.notEqual(run.state, input);
});

test("f is never called past t1, even where t + h rounds one unit past it, nor for ∂f/∂t", () => {
  const t0 = 0.20620668473495785;
  const t1 = 1.4570136102864117;
  assert.ok(t0 + (t1 - t0) > t1, "the rounding this test is about");
  const slow = (t, state) => {
    if (t < t0 || t > t1) throw new Error("f called at t = " + t);
    return [-1e-3 * state[0] + Math.sin(t)];
  };
  assert.equal(solve({ f: slow, t0, state0: [1], t1, h0: 10 }).reachedEnd, true);
  assert.equal(solve({ f: slow, t0, state0: [1], t1 }).reachedEnd, true);
});

test("f is never called outside [t0, t1], even in a call shorter than the difference for ∂f/∂t", () => {
  // ∂f/∂t is a difference of √ε·max(|t|, h): about 1.5×10⁻⁴ at t = 10⁴.
  // A call of 10⁻⁶ there has no room for it on either side.
  for (const [t0, t1] of [[0, 1e-3], [1e4, 1e4 + 1e-6], [5, 5 + 1e-9]]) {
    const f = (t, state) => {
      if (t < t0 || t > t1) throw new Error("f called at t = " + t + " outside [" + t0 + ", " + t1 + "]");
      return [-state[0] + Math.cos(t)];
    };
    const run = solve({ f, t0, state0: [1], t1 });
    assert.equal(run.reachedEnd, true, "[" + t0 + ", " + t1 + "]");
    assert.ok(run.state.every(Number.isFinite));
  }
});

test("∂f/∂t is right on a stiff step, also on one shorter than its usual difference", () => {
  // y′ = −λ(y − t²) from y = t0², one step of h with λh = 100: a stiff
  // step that is right only with the right T. ∂f/∂t is a difference of
  // √ε·|t| = 1.5×10⁻⁸ in t, never longer than the step: with h = 10⁻⁷ it
  // fits inside, with h = 10⁻⁹ it is the whole step (and lands on t1).
  [1e-7, 1e-9].forEach((h) => {
    const lambda = 100 / h;
    const f = (t, y) => [-lambda * (y[0] - t * t)];
    const t0 = 1;
    const t1 = t0 + h;
    const run = solve({ f, t0, state0: [t0 * t0], t1, h0: h, rtol: 1e-9, atol: 1e-12, maxSteps: 50 });
    assert.equal(run.reachedEnd, true);
    // y follows t² − 2t/λ + 2/λ² (lagging behind by the time 1/λ).
    const follow = (t) => t * t - 2 * t / lambda + 2 / (lambda * lambda);
    const exact = follow(t1) + (t0 * t0 - follow(t0)) * Math.exp(-lambda * (t1 - t0));
    assertClose(run.state[0], exact, 1e-12, "y(t1) with h = " + h);
  });
});

/* ---------- blow-ups and NaN ---------- */

function timeIn(message) {
  const match = /at t = (\S+?)[;:,]/.exec(message);
  assert.ok(match, "the message gives t: " + message);
  return Number(match[1]);
}

test("f not finite at the start throws at once", () => {
  let calls = 0;
  assert.throws(() => solve({ f: () => { calls++; return [1, NaN]; }, t0: 0, state0: [1, 1], t1: 1 }),
    /LaserEngine\.ode\.rosenbrock: f\(t0, state0\)\[1\] must be a finite number, got NaN/);
  assert.equal(calls, 1);
});

test("a solution that blows up (y′ = y², infinite at t = 1) throws quickly, near t = 1", () => {
  let calls = 0;
  const f = (t, state) => { calls++; return [state[0] * state[0]]; };
  let message = "";
  assert.throws(() => solve({ f, t0: 0, state0: [1], t1: 2 }), (err) => {
    message = err.message;
    return /LaserEngine\.ode\.rosenbrock: the step size fell below/.test(err.message);
  });
  const t = timeIn(message);
  assert.ok(t > 0.99 && t < 1.001, "t = " + t);
  assert.ok(calls < 20000, calls + " evaluations");
});

test("a state that overflows to Infinity is never accepted", () => {
  // y′ = 10³⁰⁷: y passes the largest float (1.8×10³⁰⁸) at t ≈ 18. (With
  // 10³⁰⁸, as in dopri5's test, k₁ − 2k₂ overflows inside the error
  // estimate itself, so every step fails from t = 0.)
  let message = "";
  assert.throws(() => solve({ f: () => [1e307], t0: 0, state0: [0], t1: 100, h0: 100 }), (err) => {
    message = err.message;
    return /the step size fell below/.test(err.message);
  });
  const t = timeIn(message);
  assert.ok(t > 17 && t < 18, "t = " + t);
});

test("a state far from 1 still gets its Jacobian (the difference step is not lost in rounding)", () => {
  // y′ = −10⁶(y − 10²⁰): stiff, so it needs J. At |y| = 10²⁰ a step of
  // √(ε·|y|) ≈ 1.5×10² is below y's last digit, and J would be 0/0.
  const run = solve({ f: (t, y) => [-1e6 * (y[0] - 1e20)], t0: 0, state0: [1e20 * 0.5], t1: 1, maxSteps: 500 });
  assert.equal(run.reachedEnd, true);
  assertClose(run.state[0], 1e20, 1e-6, "y(1)");
});

test("a NaN only in f at the new state rejects the step and shrinks it 5×", () => {
  // With h0 given and one component: call 1 is f at the start, call 2 the
  // Jacobian, call 3 ∂f/∂t, call 4 f at t + h/2, call 5 f at the new state.
  let calls = 0;
  const f = (t, state) => {
    calls++;
    return calls === 5 ? [NaN] : [-state[0]];
  };
  const run = solve({ f, t0: 0, state0: [1], t1: 1, h0: 0.1, maxSteps: 1 });
  assert.equal(run.rejected, 1);
  assertClose(run.hNext, 0.02, 1e-15, "0.2 × the step");
});

test("NaN partway through throws quickly, at the time it starts", () => {
  let calls = 0;
  const f = (t, state) => { calls++; return t > 0.5 ? [NaN] : [-state[0]]; };
  let message = "";
  assert.throws(() => solve({ f, t0: 0, state0: [1], t1: 2 }), (err) => {
    message = err.message;
    return /the step size fell below/.test(err.message);
  });
  const t = timeIn(message);
  assert.ok(t > 0.49 && t <= 0.5, "t = " + t);
  assert.ok(calls < 2000, calls + " evaluations");
});

test("NaN in the Jacobian (f not finite just beside the state) makes the steps fail, not pass", () => {
  // f is fine at the state but NaN a hair above it, where the Jacobian looks.
  let calls = 0;
  const f = (t, state) => { calls++; return state[0] > 1 ? [NaN] : [-state[0]]; };
  assert.throws(() => solve({ f, t0: 0, state0: [1], t1: 1 }), /LaserEngine\.ode\.rosenbrock: the step size fell below/);
  assert.ok(calls < 2000, calls + " evaluations");
});

/* ---------- inputs ---------- */

test("every input is checked, and every error names ode.rosenbrock", () => {
  const good = { f: decay, t0: 0, state0: [1], t1: 1 };
  const bad = (change, pattern) => {
    assert.throws(() => solve(Object.assign({}, good, change)), pattern, JSON.stringify(change));
    assert.throws(() => solve(Object.assign({}, good, change)), /^Error: LaserEngine\.ode\.rosenbrock: /);
  };
  bad({ f: undefined }, /f must be a function/);
  bad({ t0: NaN }, /t0 must be a finite number/);
  bad({ t1: 0 }, /t1 must be later than t0/);
  bad({ state0: [] }, /state0 must not be an empty array/);
  bad({ state0: [1, NaN] }, /state0\[1\] must be a finite number/);
  bad({ rtol: 2 }, /rtol must be a finite number from 0 to 1/);
  bad({ atol: 0 }, /atol must be a positive finite number/);
  bad({ h0: 0 }, /h0 must be a positive finite number/);
  bad({ hMax: Infinity }, /hMax must be a positive finite number/);
  bad({ maxSteps: 2.5 }, /maxSteps must be a whole number of at least 1/);
  bad({ rTol: 1e-6 }, /rTol is not one of its inputs/);
  assert.throws(() => ode.rosenbrock(decay), /LaserEngine\.ode\.rosenbrock: .*needs one object of named values/);
});

test("f must return one number per entry of the state", () => {
  const run = (f) => solve({ f, t0: 0, state0: [1, 2], t1: 1 });
  for (const result of [[1], [1, 2, 3], "12", null, [1, "2"]]) {
    assert.throws(() => run(() => result),
      /LaserEngine\.ode\.rosenbrock: f must return an array of 2 numbers, one per entry of the state/,
      JSON.stringify(result));
  }
});

test("rtol = 0 is allowed: then atol alone sets the accuracy", () => {
  const run = solve({ f: decay, t0: 0, state0: [1], t1: 1, rtol: 0, atol: 1e-10 });
  assertClose(run.state[0], Math.exp(-1), 0, "y(1)", 1e-7);
});

test("hMax holds for a given h0 and for the guess", () => {
  const given = solve({ f: decay, t0: 0, state0: [1], t1: 1, h0: 0.5, hMax: 0.01, maxSteps: 1 });
  assert.equal(given.accepted, 1);
  assertClose(given.t, 0.01, 1e-15, "the first step is hMax");
  const guessed = solve({ f: decay, t0: 0, state0: [1], t1: 1, hMax: 1e-4, maxSteps: 3 });
  assert.ok(guessed.t <= 3e-4 + 1e-15, "t = " + guessed.t);
});
