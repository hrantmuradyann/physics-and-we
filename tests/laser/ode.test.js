/* ============================================================================
   ode.test.js — js/laser/engine/ode.js, the Dormand–Prince 5(4) solver
   ("RK45") every time-dependent part of the simulator runs on.

   Sources: Dormand & Prince, J. Comput. Appl. Math. 6 (1980) 19–26;
   Hairer, Nørsett & Wanner, Solving Ordinary Differential Equations I,
   2nd ed., §II.4 (step control) and §II.5 (the coefficient table).
   The bounds below were measured during the stage-3 audit
   (docs/laser-plan.md, stage 3 scope card).
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine, deepFreeze, assertClose, plain } = require("./helpers.js");

const { ode } = loadEngine();

// Every call goes through deep-frozen inputs, so the solver cannot change them.
function solve(params) {
  return ode.dopri5(deepFreeze(Object.assign({}, params)));
}

// Test problems with known answers.
const decay = (t, state) => [-state[0]];                       // y = e^(−t)
const oscillator = (t, state) => [state[1], -state[0]];        // x = cos t, period 2π
const W2 = (2 * Math.PI) ** 2;
const fastOscillator = (t, state) => [state[1], -W2 * state[0]]; // period exactly 1

// Each run of the "huge tolerance" settings below takes a fixed step: the
// error is always tiny, so the step would grow, but hMax holds it.
function fixedStep(h) {
  return { h0: h, hMax: h, rtol: 1, atol: 1e10 };
}

/* ---------- the coefficient table ---------- */

const { c, a, b, bStar } = ode.tableau;
const STAGES = c.length;
const range = (n) => Array.from({ length: n }, (_, i) => i);
// a as a full 7×7 matrix: zero on and above the diagonal (explicit method).
const aij = (i, j) => (j < a[i].length ? a[i][j] : 0);
const times = (u, v) => u.map((x, i) => x * v[i]);
const dot = (w, v) => w.reduce((sum, x, i) => sum + x * v[i], 0);
const matA = (v) => range(STAGES).map((i) => range(STAGES).reduce((sum, j) => sum + aij(i, j) * v[j], 0));
const ones = range(STAGES).map(() => 1);
const c2 = times(c, c);
const c3 = times(c2, c);
const Ac = matA(c);

// The order conditions (Hairer §II.2): a method has order p when its
// weights w satisfy every condition up to p. Written out one per line.
const CONDITIONS = [
  { order: 1, name: "Σ w = 1", value: (w) => dot(w, ones), exact: 1 },
  { order: 2, name: "Σ w c = 1/2", value: (w) => dot(w, c), exact: 1 / 2 },
  { order: 3, name: "Σ w c² = 1/3", value: (w) => dot(w, c2), exact: 1 / 3 },
  { order: 3, name: "Σ w A c = 1/6", value: (w) => dot(w, Ac), exact: 1 / 6 },
  { order: 4, name: "Σ w c³ = 1/4", value: (w) => dot(w, c3), exact: 1 / 4 },
  { order: 4, name: "Σ w c·Ac = 1/8", value: (w) => dot(w, times(c, Ac)), exact: 1 / 8 },
  { order: 4, name: "Σ w A c² = 1/12", value: (w) => dot(w, matA(c2)), exact: 1 / 12 },
  { order: 4, name: "Σ w A A c = 1/24", value: (w) => dot(w, matA(Ac)), exact: 1 / 24 },
  { order: 5, name: "Σ w c⁴ = 1/5", value: (w) => dot(w, times(c3, c)), exact: 1 / 5 },
  { order: 5, name: "Σ w c²·Ac = 1/10", value: (w) => dot(w, times(c2, Ac)), exact: 1 / 10 },
  { order: 5, name: "Σ w (Ac)² = 1/20", value: (w) => dot(w, times(Ac, Ac)), exact: 1 / 20 },
  { order: 5, name: "Σ w c·A c² = 1/15", value: (w) => dot(w, times(c, matA(c2))), exact: 1 / 15 },
  { order: 5, name: "Σ w c·A A c = 1/30", value: (w) => dot(w, times(c, matA(Ac))), exact: 1 / 30 },
  { order: 5, name: "Σ w A c³ = 1/20", value: (w) => dot(w, matA(c3)), exact: 1 / 20 },
  { order: 5, name: "Σ w A (c·Ac) = 1/40", value: (w) => dot(w, matA(times(c, Ac))), exact: 1 / 40 },
  { order: 5, name: "Σ w A A c² = 1/60", value: (w) => dot(w, matA(matA(c2))), exact: 1 / 60 },
  { order: 5, name: "Σ w A A A c = 1/120", value: (w) => dot(w, matA(matA(Ac))), exact: 1 / 120 }
];

test("the table has 7 stages, and row i of a has i entries", () => {
  assert.equal(STAGES, 7);
  assert.equal(b.length, 7);
  assert.equal(bStar.length, 7);
  range(STAGES).forEach((i) => assert.equal(a[i].length, i, "row " + i));
});

test("each stage time c_i is the sum of its row of a", () => {
  assert.equal(c[0], 0);
  for (let i = 1; i < STAGES; i++) {
    assertClose(c[i], a[i].reduce((sum, x) => sum + x, 0), 1e-15, "c[" + i + "]");
  }
});

test("the weights b meet all 17 order conditions up to order 5", () => {
  assert.equal(CONDITIONS.length, 17);
  for (const condition of CONDITIONS) {
    assertClose(condition.value(b), condition.exact, 1e-14, "b: " + condition.name);
  }
});

test("the weights b* meet the 8 conditions up to order 4, but not all of order 5", () => {
  for (const condition of CONDITIONS.filter((x) => x.order <= 4)) {
    assertClose(condition.value(bStar), condition.exact, 1e-14, "b*: " + condition.name);
  }
  // If b* were also of order 5, b − b* would estimate an error of ~0.
  const misses = CONDITIONS.filter((x) => x.order === 5)
    .map((x) => Math.abs(x.value(bStar) - x.exact));
  assert.ok(Math.max(...misses) > 1e-5, "b* is only of order 4; largest miss " + Math.max(...misses));
});

test("the last row of a is b, so the last stage is the new state itself (first same as last)", () => {
  assert.deepEqual(plain(a[6]), plain(b.slice(0, 6)));
  assert.equal(b[6], 0);
  assert.equal(c[6], 1);
});

test("the ode object and its table cannot be changed", () => {
  assert.ok(Object.isFrozen(ode));
  for (const part of [ode.tableau, c, a, b, bStar, ...a]) assert.ok(Object.isFrozen(part));
});

/* ---------- one step, done by hand ---------- */

// One Dormand–Prince step written out from the table, the way Hairer §II.4
// describes it: the stages, the new state from b, the error estimate from
// b − b*, and the error norm √(mean((e_i/sk_i)²)) with
// sk_i = atol + rtol·max(|y_i|, |y_new,i|).
function stepByHand(f, t, state, h, rtol, atol) {
  const k = [];
  for (let i = 0; i < STAGES; i++) {
    const stageState = state.map((y, m) =>
      y + h * a[i].reduce((sum, coefficient, j) => sum + coefficient * k[j][m], 0));
    k.push(f(t + c[i] * h, stageState));
  }
  const next = state.map((y, m) => y + h * b.reduce((sum, weight, j) => sum + weight * k[j][m], 0));
  let sumOfSquares = 0;
  state.forEach((y, m) => {
    const estimate = h * b.reduce((sum, weight, j) => sum + (weight - bStar[j]) * k[j][m], 0);
    const scale = atol + rtol * Math.max(Math.abs(y), Math.abs(next[m]));
    sumOfSquares += (estimate / scale) ** 2;
  });
  return { next, err: Math.sqrt(sumOfSquares / state.length) };
}

// A forced oscillator: two components, depends on t, not linear in the answer.
const forced = (t, state) => [state[1], -Math.sin(state[0]) + 0.5 * Math.cos(t)];
const STEP = { f: forced, t0: 0.3, state0: [1, 0.2], t1: 10, rtol: 1e-6, atol: 1e-6 };

test("an accepted step: the new state and the next step size match the step done by hand", () => {
  const h = 0.25;
  const byHand = stepByHand(forced, STEP.t0, STEP.state0, h, STEP.rtol, STEP.atol);
  // The new step is h·0.9·err^(−1/5); for this test to see the 0.9 and the
  // power, that factor must lie inside its limits 0.2 to 5.
  assert.ok(byHand.err < 1 && 0.9 * byHand.err ** -0.2 < 5, "err " + byHand.err);
  const run = solve(Object.assign({}, STEP, { h0: h, maxSteps: 1 }));
  assert.equal(run.accepted, 1);
  assert.equal(run.rejected, 0);
  assertClose(run.t, STEP.t0 + h, 1e-15, "t");
  byHand.next.forEach((y, m) => assertClose(run.state[m], y, 1e-14, "state[" + m + "]"));
  assertClose(run.hNext, h * 0.9 * byHand.err ** -0.2, 1e-12, "hNext = h·0.9·err^(−1/5)");
});

test("a rejected step: the state stays, and the step shrinks to h·0.9·err^(−1/5)", () => {
  const h = 1;
  const byHand = stepByHand(forced, STEP.t0, STEP.state0, h, STEP.rtol, STEP.atol);
  assert.ok(byHand.err > 1 && 0.9 * byHand.err ** -0.2 > 0.2, "err " + byHand.err);
  const run = solve(Object.assign({}, STEP, { h0: h, maxSteps: 1 }));
  assert.equal(run.accepted, 0);
  assert.equal(run.rejected, 1);
  assert.equal(run.reachedEnd, false);
  assert.equal(run.t, STEP.t0);
  assert.deepEqual(plain(run.state), STEP.state0);
  assertClose(run.hNext, h * 0.9 * byHand.err ** -0.2, 1e-12, "hNext");
});

test("the step size changes at most 5× up and 0.2× down per step", () => {
  // y′ = 0: the error is exactly 0, so the step grows by the full 5×.
  const flat = solve({ f: () => [0], t0: 0, state0: [1], t1: 100, h0: 0.01, maxSteps: 1 });
  assertClose(flat.hNext, 0.05, 1e-15, "growth limited to 5×");
  // A huge first step on a fast problem: shrinks by no more than 0.2×.
  const fast = solve({ f: fastOscillator, t0: 0, state0: [1, 0], t1: 1000, h0: 1000, maxSteps: 1 });
  assert.equal(fast.rejected, 1);
  assertClose(fast.hNext, 200, 1e-15, "shrink limited to 0.2×");
});

test("after a rejected step, the next try starts from the derivative at the same point", () => {
  // Retry with the step a rejected step left behind, and compare with a run
  // that took that step straight away: both are one step from the same
  // point, so they must agree exactly. Reusing the rejected step's last
  // derivative ("first same as last" applied after a rejection) breaks this.
  let firstAccepted = null;
  for (let budget = 1; budget <= 20 && !firstAccepted; budget++) {
    const run = solve({ f: forced, t0: 0, state0: [1, 0.2], t1: 50, h0: 50, maxSteps: budget });
    if (run.accepted === 1) firstAccepted = run;
  }
  assert.ok(firstAccepted, "a step was accepted within 20 tries");
  assert.ok(firstAccepted.rejected >= 1, "the run had at least one rejected step");
  const direct = solve({ f: forced, t0: 0, state0: [1, 0.2], t1: 50, h0: firstAccepted.t, maxSteps: 1 });
  assert.equal(direct.accepted, 1);
  assert.equal(direct.t, firstAccepted.t);
  assert.deepEqual(plain(direct.state), plain(firstAccepted.state));
});

test("right after a rejected step, the step does not grow", () => {
  // The same run as above, stopped after its first accepted step: that step
  // came right after a rejection, so the next one may not be longer.
  let firstAccepted = null;
  for (let budget = 1; budget <= 20 && !firstAccepted; budget++) {
    const run = solve({ f: forced, t0: 0, state0: [1, 0.2], t1: 50, h0: 50, maxSteps: budget });
    if (run.accepted === 1) firstAccepted = run;
  }
  assert.ok(firstAccepted.hNext <= firstAccepted.t, "hNext " + firstAccepted.hNext + " > step " + firstAccepted.t);
});

/* ---------- the first step ---------- */

// Hairer's starting-step guess (§II.4), written out by hand: from the size of
// the state (d0) and of its derivatives (d1), then one Euler step to see how
// fast the derivatives change (d2).
function firstStepByHand(f, t0, state0, t1, rtol, atol) {
  const f0 = f(t0, state0);
  const scale = state0.map((y) => atol + rtol * Math.abs(y));
  const size = (v) => Math.sqrt(v.reduce((sum, x, i) => sum + (x / scale[i]) ** 2, 0) / v.length);
  const d0 = size(state0);
  const d1 = size(f0);
  const h = (d0 < 1e-5 || d1 < 1e-5) ? 1e-6 : 0.01 * d0 / d1;
  const f1 = f(Math.min(t0 + h, t1), state0.map((y, i) => y + h * f0[i]));
  const d2 = size(f1.map((x, i) => x - f0[i])) / h;
  const fastest = Math.max(d1, d2);
  const h1 = fastest <= 1e-15 ? Math.max(1e-6, h * 1e-3) : (0.01 / fastest) ** (1 / 5);
  return Math.min(100 * h, h1);
}

test("the first step is Hairer's starting-step guess (three cases, each limited by a different part)", () => {
  const cases = [
    // h1 = (0.01/max(d1, d2))^(1/5) is the smallest
    { name: "forced", f: forced, state0: [1, 0.2], rtol: 1e-6, atol: 1e-9 },
    // 100·h is the smallest: a tiny state that changes slowly
    { name: "tiny state", f: () => [1e-9], state0: [1e-13], rtol: 1e-6, atol: 1e-9 },
    // the state is 0, so its size says nothing: the fallback h = 1e-6, then 100·h
    { name: "zero state", f: () => [1e-9], state0: [0], rtol: 1e-6, atol: 1e-9 },
    // nothing to measure (state and f both 0): the fallback 1e-6 for h1
    { name: "all zero", f: () => [0], state0: [0], rtol: 1e-6, atol: 1e-9 }
  ];
  for (const { name, f, state0, rtol, atol } of cases) {
    const expected = firstStepByHand(f, 0, state0, 1, rtol, atol);
    const run = solve({ f, t0: 0, state0, t1: 1, rtol, atol, maxSteps: 1 });
    assert.equal(run.accepted, 1, name + ": the first step is accepted");
    assertClose(run.t, expected, 1e-12, name + ": the first step");
  }
});

test("far from t = 0 the guess is never shorter than t can resolve", () => {
  // A guess of 1e-6 at t = 1e11 would not even change t, and the solver
  // would call that a blow-up.
  const run = solve({ f: () => [0], t0: 1e11, state0: [0], t1: 1e11 + 1e3 });
  assert.equal(run.reachedEnd, true);
  assert.ok(run.accepted < 30, run.accepted + " steps");
});

test("hMax holds for a given h0 and for the guess", () => {
  const given = solve({ f: decay, t0: 0, state0: [1], t1: 1, h0: 0.5, hMax: 0.1, rtol: 1e-3, maxSteps: 1 });
  assert.equal(given.accepted, 1);
  assertClose(given.t, 0.1, 1e-15, "first step = hMax");
  const guessed = solve({ f: decay, t0: 0, state0: [1], t1: 1, hMax: 1e-3, maxSteps: 1 });
  assert.equal(guessed.accepted, 1);
  assertClose(guessed.t, 1e-3, 1e-15, "first step = hMax");
});

/* ---------- accuracy ---------- */

test("y′ = t⁴ in a single step is exact: the stages sit at t + c_i·h", () => {
  const run = solve(Object.assign({ f: (t) => [t ** 4], t0: 0, state0: [0], t1: 1 }, fixedStep(1)));
  assert.equal(run.accepted, 1);
  assertClose(run.state[0], 1 / 5, 1e-15, "∫₀¹ t⁴ dt");
});

test("with a fixed step, halving the step makes the error 2⁵ = 32 times smaller (5th order)", () => {
  function errorAfterOnePeriod(steps) {
    const run = solve(Object.assign({ f: fastOscillator, t0: 0, state0: [1, 0], t1: 1 }, fixedStep(1 / steps)));
    assert.equal(run.accepted, steps, "a fixed step of 1/" + steps);
    return Math.hypot(run.state[0] - 1, run.state[1] / (2 * Math.PI));
  }
  const coarse = errorAfterOnePeriod(64);
  const fine = errorAfterOnePeriod(128);
  const ratio = coarse / fine;      // measured 32.1
  assert.ok(ratio >= 30 && ratio <= 34, "error ratio " + ratio + ", expected about 32");
});

test("decay y′ = −y to t = 10: the error follows the tolerance", () => {
  const exact = Math.exp(-10);
  function relativeError(tol) {
    const run = solve({ f: decay, t0: 0, state0: [1], t1: 10, rtol: tol, atol: tol * 1e-3 });
    assert.equal(run.reachedEnd, true);
    return Math.abs(run.state[0] - exact) / exact;
  }
  const loose = relativeError(1e-6);
  const tight = relativeError(1e-10);
  assert.ok(relativeError(1e-8) <= 100 * 1e-8, "within 100 × tol");   // measured 6.6 × tol
  assert.ok(tight <= loose / 1000, "10⁴ × smaller tol → at least 10³ × smaller error: " + loose + " → " + tight);
});

test("oscillator after 10 periods: back at x = 1, v = 0 within 100 × tol, and almost no rejected steps", () => {
  const tight = solve({ f: oscillator, t0: 0, state0: [1, 0], t1: 20 * Math.PI, rtol: 1e-8, atol: 1e-8 });
  assertClose(tight.state[0], 1, 0, "x", 100 * 1e-8);                 // measured 2.6e-7
  assertClose(tight.state[1], 0, 0, "v", 100 * 1e-8);
  // The 0.9 safety factor keeps steps just inside the tolerance, so a
  // smooth problem rejects almost none (measured 0 of 230; without the
  // factor, 654 rejected of 210).
  const run = solve({ f: oscillator, t0: 0, state0: [1, 0], t1: 20 * Math.PI, rtol: 1e-6, atol: 1e-6 });
  assert.ok(run.rejected <= 0.05 * run.accepted, run.rejected + " rejected of " + run.accepted);
});

test("a stiff problem y′ = −10⁴(y − cos t) finishes, accurate, in about 10⁴/3.3 steps", () => {
  // An explicit method stays stable only while |h·λ| ≲ 3.3, so here it needs
  // about k/3.3 steps however smooth the answer is (§11.3: the cost of a
  // stiff laser below threshold). Measured: 3052 accepted, 382 rejected.
  const k = 1e4;
  const run = solve({ f: (t, state) => [-k * (state[0] - Math.cos(t))], t0: 0, state0: [0], t1: 1 });
  const A = k * k / (1 + k * k);
  const B = k / (1 + k * k);
  const exact = A * Math.cos(1) + B * Math.sin(1) - A * Math.exp(-k);
  assert.equal(run.reachedEnd, true);
  assertClose(run.state[0], exact, 1e-5, "y(1)");
  const stabilityLimit = k / 3.3;
  assert.ok(run.accepted >= 0.8 * stabilityLimit, run.accepted + " accepted");
  assert.ok(run.accepted + run.rejected <= 1.5 * stabilityLimit, (run.accepted + run.rejected) + " attempts");
});

test("65 components at once (one per laser mode, later) each match their own answer", () => {
  const rates = range(65).map((i) => (i + 1) / 10);
  const run = solve({
    f: (t, state) => state.map((y, i) => -rates[i] * y),
    t0: 0, state0: rates.map(() => 1), t1: 1, rtol: 1e-9, atol: 1e-12
  });
  assert.equal(run.state.length, 65);
  rates.forEach((rate, i) => assertClose(run.state[i], Math.exp(-rate), 1e-7, "component " + i));
});

/* ---------- ending, budget, continuing ---------- */

test("the last step lands exactly on t1", () => {
  const run = solve({ f: decay, t0: 0.1, state0: [1], t1: 0.7, hMax: 0.07 });
  assert.equal(run.reachedEnd, true);
  assert.ok(run.accepted >= 9, "hMax 0.07 holds on every step: " + run.accepted + " steps for 0.6");
  assert.equal(run.t, 0.7);
  assertClose(run.state[0], Math.exp(-0.6), 1e-6, "y(0.7)");
});

test("out of budget: a correct partial result; continuing from it gives the very same answer", () => {
  const whole = solve({ f: decay, t0: 0, state0: [1], t1: 10 });
  const part = solve({ f: decay, t0: 0, state0: [1], t1: 10, maxSteps: 5 });
  assert.equal(part.reachedEnd, false);
  assert.equal(part.accepted + part.rejected, 5, "maxSteps counts every attempt");
  assert.equal(part.rejected, 0, "no rejected steps, so the two runs take the same steps");
  assert.ok(part.t > 0 && part.t < 10);
  assertClose(part.state[0], Math.exp(-part.t), 1e-6, "state at the partial t");
  const rest = solve({ f: decay, t0: part.t, state0: part.state, t1: 10, h0: part.hNext });
  assert.equal(rest.reachedEnd, true);
  assert.equal(part.accepted + rest.accepted, whole.accepted);
  // The same steps in the same order: equal to the last bit.
  assert.equal(rest.state[0], whole.state[0]);
});

test("a very short call does not shrink the step for the next one", () => {
  const first = solve({ f: decay, t0: 0, state0: [1], t1: 1, rtol: 1e-10, atol: 1e-13 });
  const planned = first.hNext;
  // A frame much shorter than the step: the step taken is cut short, but
  // the step passed on stays the one that was planned. (Taking it from the
  // short step's own error instead would shrink it 1700×: the error of so
  // short a step is mostly rounding. Measured in the stage-3 review.)
  const short = solve({ f: decay, t0: 1, state0: first.state, t1: 1 + planned * 1e-6, h0: planned, rtol: 1e-10, atol: 1e-13 });
  assert.equal(short.reachedEnd, true);
  assert.equal(short.accepted, 1);
  assert.ok(short.hNext >= planned, "hNext " + short.hNext + " < planned " + planned);
});

test("evaluations: 1 at the start, 1 for the first-step guess, 6 per attempt (the 7th is reused)", () => {
  let calls = 0;
  const counted = (t, state) => { calls++; return decay(t, state); };
  const guessed = solve({ f: counted, t0: 0, state0: [1], t1: 10 });
  assert.equal(guessed.evaluations, calls);
  assert.equal(guessed.evaluations, 2 + 6 * (guessed.accepted + guessed.rejected));
  calls = 0;
  const given = solve({ f: (t, state) => { calls++; return forced(t, state); }, t0: 0, state0: [1, 0.2], t1: 50, h0: 50 });
  assert.ok(given.rejected >= 1);
  assert.equal(given.evaluations, calls);
  assert.equal(given.evaluations, 1 + 6 * (given.accepted + given.rejected));
});

/* ---------- f cannot break the solver ---------- */

test("an f that changes its input or returns the same array every time gives the same answer", () => {
  const shared = [0, 0];
  const messy = (t, state) => {
    shared[0] = state[1];
    shared[1] = -state[0];
    state[0] = 999;            // changes its input
    return shared;             // and always returns the same array
  };
  const clean = solve({ f: oscillator, t0: 0, state0: [1, 0], t1: 5 });
  const run = solve({ f: messy, t0: 0, state0: [1, 0], t1: 5 });
  assert.deepEqual(plain(run.state), plain(clean.state));
});

test("the result is a new array, never the input", () => {
  const input = deepFreeze([1, 0.2]);
  const run = ode.dopri5(deepFreeze({ f: forced, t0: 0, state0: input, t1: 50, h0: 50, maxSteps: 1 }));
  assert.equal(run.accepted, 0);
  assert.notEqual(run.state, input);
});

test("f is never called past t1, even where t + h rounds one unit past it", () => {
  // Found in the stage-3 review: with these numbers t0 + (t1 − t0) > t1.
  const t0 = 0.20620668473495785;
  const t1 = 1.4570136102864117;
  assert.ok(t0 + (t1 - t0) > t1, "the rounding this test is about");
  const slow = (t, state) => {
    if (t < t0 || t > t1) throw new Error("f called at t = " + t);
    return [-1e-3 * state[0]];
  };
  // a given first step longer than the interval: the stage at t + 1·h
  assert.equal(solve({ f: slow, t0, state0: [1], t1, h0: 10 }).reachedEnd, true);
  // no first step: the guess probes at t0 + h with h = t1 − t0
  assert.equal(solve({ f: slow, t0, state0: [1], t1 }).reachedEnd, true);
});

test("f is never called outside [t0, t1], not even by the first-step guess", () => {
  // The first-step guess alone would probe at t = 0.01 here.
  const t1 = 1e-3;
  const f = (t, state) => {
    if (t < 0 || t > t1) throw new Error("f called at t = " + t);
    return decay(t, state);
  };
  const run = solve({ f, t0: 0, state0: [1], t1 });
  assert.equal(run.reachedEnd, true);
  assertClose(run.state[0], Math.exp(-t1), 1e-9, "y(t1)");
});

/* ---------- blow-ups and NaN ---------- */

// Reads "t = <number>" from an error message.
function timeIn(message) {
  const match = /at t = (\S+?)[;:,]/.exec(message);
  assert.ok(match, "the message gives t: " + message);
  return Number(match[1]);
}

test("f not finite at the start throws at once", () => {
  let calls = 0;
  assert.throws(() => solve({ f: () => { calls++; return [1, NaN]; }, t0: 0, state0: [1, 1], t1: 1 }),
    /LaserEngine\.ode\.dopri5: f\(t0, state0\)\[1\] must be a finite number, got NaN/);
  assert.equal(calls, 1);
});

test("a solution that blows up (y′ = y², infinite at t = 1) throws quickly, near t = 1", () => {
  let calls = 0;
  const f = (t, state) => { calls++; return [state[0] * state[0]]; };
  let message = "";
  assert.throws(() => solve({ f, t0: 0, state0: [1], t1: 2 }), (err) => {
    message = err.message;
    return /LaserEngine\.ode\.dopri5: the step size fell below/.test(err.message);
  });
  const t = timeIn(message);
  assert.ok(t > 0.999 && t < 1.001, "t = " + t);
  assert.ok(calls < 10000, calls + " evaluations (measured 2468)");
});

test("a state that overflows to Infinity is never accepted", () => {
  // y′ = 10³⁰⁸: y passes the largest float (1.8×10³⁰⁸) at t ≈ 1.8. A step
  // into Infinity has error scale Infinity, so it must be caught by the
  // state itself, not by the error norm.
  let message = "";
  assert.throws(() => solve({ f: () => [1e308], t0: 0, state0: [0], t1: 10, h0: 10 }), (err) => {
    message = err.message;
    return /the step size fell below/.test(err.message);
  });
  const t = timeIn(message);
  assert.ok(t > 1.7 && t < 1.8, "t = " + t);
});

test("a NaN only in the last stage (f at the new state) rejects the step and shrinks it 5×", () => {
  // With h0 given, call 1 is f at the start and calls 2–7 are the 6 stages
  // of the first try; call 7 is f at the new state. Only that one is NaN, so
  // the new state itself is finite.
  let calls = 0;
  const f = (t, state) => {
    calls++;
    return calls === 7 ? [NaN] : [-state[0]];
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
  assert.ok(calls < 2000, calls + " evaluations (measured 452)");
});

test("NaN everywhere after t0 = 0 throws too (the smallest step is not 0 at t = 0)", () => {
  let calls = 0;
  const f = (t, state) => { calls++; return t > 0 ? [NaN] : [0]; };
  assert.throws(() => solve({ f, t0: 0, state0: [1], t1: 2 }), /the step size fell below/);
  assert.ok(calls < 2000, calls + " evaluations");
});

/* ---------- inputs ---------- */

test("every input is checked, and every error names ode.dopri5", () => {
  const good = { f: decay, t0: 0, state0: [1], t1: 1 };
  const bad = (change, pattern) => {
    assert.throws(() => solve(Object.assign({}, good, change)), pattern, JSON.stringify(change));
    assert.throws(() => solve(Object.assign({}, good, change)), /^Error: LaserEngine\.ode\.dopri5: /);
  };
  bad({ f: undefined }, /f must be a function/);
  bad({ f: 1 }, /f must be a function/);
  bad({ t0: NaN }, /t0 must be a finite number/);
  bad({ t1: Infinity }, /t1 must be a finite number/);
  bad({ t1: 0 }, /t1 must be later than t0/);
  bad({ t1: -1 }, /t1 must be later than t0/);
  bad({ state0: [] }, /state0 must not be an empty array/);
  bad({ state0: [1, NaN] }, /state0\[1\] must be a finite number/);
  bad({ state0: 1 }, /state0 must be an array of finite numbers/);
  bad({ rtol: -1e-6 }, /rtol must be a finite number from 0 to 1/);
  bad({ rtol: 2 }, /rtol must be a finite number from 0 to 1/);
  bad({ atol: 0 }, /atol must be a positive finite number/);
  bad({ h0: 0 }, /h0 must be a positive finite number/);
  bad({ hMax: -1 }, /hMax must be a positive finite number/);
  bad({ hMax: Infinity }, /hMax must be a positive finite number/);   // for no limit, leave hMax out
  bad({ maxSteps: 0 }, /maxSteps must be a whole number of at least 1/);
  bad({ maxSteps: 2.5 }, /maxSteps must be a whole number of at least 1/);
  bad({ maxSteps: Infinity }, /maxSteps must be a whole number of at least 1/);
  bad({ rTol: 1e-6 }, /rTol is not one of its inputs/);
  assert.throws(() => ode.dopri5(decay), /needs one object of named values/);
});

test("f must return one number per entry of the state", () => {
  const run = (f) => solve({ f, t0: 0, state0: [1, 2], t1: 1 });
  for (const result of [[1], [1, 2, 3], "12", null, [1, "2"], { 0: 1, 1: 2, length: 2 }]) {
    assert.throws(() => run(() => result),
      /LaserEngine\.ode\.dopri5: f must return an array of 2 numbers, one per entry of the state/,
      JSON.stringify(result));
  }
});

test("rtol = 0 is allowed: then atol alone sets the accuracy", () => {
  const run = solve({ f: decay, t0: 0, state0: [1], t1: 1, rtol: 0, atol: 1e-10 });
  assertClose(run.state[0], Math.exp(-1), 0, "y(1)", 1e-8);
});
