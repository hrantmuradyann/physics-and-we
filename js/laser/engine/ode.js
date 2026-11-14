/* ============================================================================
   ode.js — a general solver for ordinary differential equations
   d(state)/dt = f(t, state): Dormand–Prince 5(4) with an adaptive step,
   the method often called "RK45".

   PART OF THE LASER ENGINE (js/laser/engine/): plain numbers in and out,
   nothing on the page. Needs check.js to be loaded first. It knows nothing
   about lasers: t is in whatever unit f uses (the laser equations of
   docs/laser-physics.md §11.2 use t′ = t/τ).

     LaserEngine.ode.dopri5({ f, t0, state0, t1 })
       f(t, state)  returns the derivatives: an array with one number per
                    entry of state
       t0, t1       start and end, t0 < t1
       state0       the state at t0: a non-empty array of finite numbers
     optional:
       rtol, atol   relative and absolute tolerance of each step
                    (default 1e-6 and 1e-9)
       h0           the first step (default: a guess, see firstStep)
       hMax         the longest step allowed (leave it out for no limit)
       maxSteps     the most steps to try, accepted or rejected, each costing
                    6 calls of f. The default, 100 000, is only a safety
                    limit: that many steps take tens of milliseconds, several
                    animation frames, so a page passes its own per-frame budget.
     returns { t, state, reachedEnd, hNext, accepted, rejected, evaluations }
       reachedEnd true:   t is exactly t1.
       reachedEnd false:  maxSteps ran out first; t and state are the last
                          accepted point, a correct partial result.
       hNext:             the step to pass as h0 to carry on from t. A
                          short call (a frame shorter than the step) does
                          not shrink it. Carrying on repeats the steps one
                          long call would take, except right after a rejected
                          step: one long call would not let the next step
                          grow, a new call does. Either way every step
                          meets the tolerance.
       evaluations:       how many times f was called.

   How it works (E. Hairer, S. P. Nørsett, G. Wanner, Solving Ordinary
   Differential Equations I, 2nd ed., §II.4 and §II.5; the coefficients are
   from J. R. Dormand and P. J. Prince, J. Comput. Appl. Math. 6 (1980) 19):
   - A step computes 7 stages. The weights b give a 5th-order new state; the
     weights b* give a 4th-order one, and the difference of the two
     estimates the error of the step.
   - The step is accepted when the error norm err ≤ 1. The next step is
     h·0.9·err^(−1/5), between 0.2× and 5× of this one, and never longer
     right after a rejected step. A rejected step is tried again, shorter.
     A step whose new state is not finite (NaN, or an overflow to
     Infinity) is rejected the same way.
   - The 7th stage is evaluated at the new state itself, so it is also the
     1st stage of the next step ("first same as last"): 6 calls of f a step.
   - It is an explicit method: on a stiff problem the step stays below about
     3.3/|λ| for the fastest decay rate λ, however smooth the answer
     (docs/laser-physics.md §11.3).
   - f is never called outside [t0, t1], so an f that changes at t1 (a pump
     switched off, a Q-switch opening) only ever sees its own side.

   It throws, naming LaserEngine.ode.dopri5, for bad inputs; for f giving
   something other than one number per entry; for f not finite at the
   start; and when the step has to shrink below what the arithmetic can
   resolve: the solution blows up, f is not finite there, or the
   tolerances are too tight.

   Tests: tests/laser/ode.test.js
   ========================================================================== */
(function (root) {
  "use strict";

  var E = root.LaserEngine = root.LaserEngine || {};
  if (!E.check) {
    throw new Error("ode.js needs js/laser/engine/check.js to be loaded first.");
  }

  var check = E.check;
  var WHERE = "LaserEngine.ode.dopri5";

  var DEFAULT_RTOL = 1e-6;
  var DEFAULT_ATOL = 1e-9;
  var DEFAULT_MAX_STEPS = 100000;

  // Step control (Hairer §II.4).
  var SAFETY = 0.9;              // aim a little inside the tolerance, so few steps are rejected
  var MIN_FACTOR = 0.2;          // a step shrinks at most 5× at once
  var MAX_FACTOR = 5;            // and grows at most 5×
  var ERROR_EXPONENT = 1 / 5;    // the error estimate of a step of length h goes as h⁵

  function freezeAll(value) {
    if (value !== null && typeof value === "object") {
      Object.keys(value).forEach(function (key) { freezeAll(value[key]); });
      Object.freeze(value);
    }
    return value;
  }

  // The Dormand–Prince 5(4) table (Hairer §II.5). Stage i is f evaluated at
  // time t + c[i]·h and state + h·Σ_j a[i][j]·k_j, where k_j are the
  // earlier stages. The loops below read these very arrays, so the tests of
  // the table test the numbers the solver uses.
  var TABLEAU = freezeAll({
    c: [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1],
    a: [
      [],
      [1 / 5],
      [3 / 40, 9 / 40],
      [44 / 45, -56 / 15, 32 / 9],
      [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
      [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
      [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84]
    ],
    // 5th order: the new state. The same numbers as the last row of a.
    b: [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0],
    // 4th order: used only to estimate the error.
    bStar: [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40]
  });

  // b − b*, the weights of the error estimate.
  var ERROR_WEIGHTS = TABLEAU.b.map(function (weight, j) {
    return weight - TABLEAU.bStar[j];
  });

  // Calls f and checks the shape of its answer. f gets its own copy of the
  // state, and its answer is copied, so an f that changes its input or
  // returns the same array every time cannot change the solver's numbers.
  // The numbers may still be NaN or infinite: what that means depends on
  // where f was called (see dopri5).
  function callF(f, t, state) {
    var n = state.length;
    var result = f(t, state.slice());
    var problem = null;
    if (!Array.isArray(result) || result.length !== n) {
      problem = "got " + check.describe(result);
    } else {
      for (var i = 0; i < n && problem === null; i++) {
        if (typeof result[i] !== "number") problem = "entry " + i + " is " + check.describe(result[i]);
      }
    }
    if (problem !== null) {
      check.fail(WHERE, "f must return an array of " + n + " numbers, one per entry of the state; " +
        problem + " (at t = " + t + ").");
    }
    return result.slice();
  }

  // √(mean((v_i/scale_i)²)): the size of v measured in tolerances.
  function scaledSize(v, scale) {
    var sumOfSquares = 0;
    for (var i = 0; i < v.length; i++) {
      var x = v[i] / scale[i];
      sumOfSquares += x * x;
    }
    return Math.sqrt(sumOfSquares / v.length);
  }

  // The smallest step that still moves t by a few units in its last digit.
  // It uses |t1| too: at t = 0 a floor of 16·ε·|t| alone would be 0.
  function smallestStep(t, t1) {
    return 16 * Number.EPSILON * Math.max(Math.abs(t), Math.abs(t1));
  }

  // A first step from how big the state is and how fast it changes
  // (Hairer §II.4, "starting step size"). Costs one call of f.
  function firstStep(derivatives, t0, t1, state0, f0, rtol, atol) {
    var scale = state0.map(function (y) { return atol + rtol * Math.abs(y); });
    var d0 = scaledSize(state0, scale);
    var d1 = scaledSize(f0, scale);
    var h = (d0 < 1e-5 || d1 < 1e-5) ? 1e-6 : 0.01 * d0 / d1;
    // One Euler step of that length shows how fast the derivatives change.
    // Its time is kept inside [t0, t1], so f is never called outside it.
    var probe = state0.map(function (y, i) { return y + h * f0[i]; });
    var f1 = derivatives(Math.min(t0 + h, t1), probe);
    var change = f1.map(function (value, i) { return value - f0[i]; });
    var d2 = scaledSize(change, scale) / h;
    var guess = h;    // if f is not finite there, keep it: the step control will shrink it
    if (isFinite(d2)) {
      var fastest = Math.max(d1, d2);
      var h1 = fastest <= 1e-15 ? Math.max(1e-6, h * 1e-3) : Math.pow(0.01 / fastest, ERROR_EXPONENT);
      guess = Math.min(100 * h, h1);
    }
    // The guesses above are absolute (1e-6); far from t = 0 that can be
    // less than t can resolve, and a smooth problem would throw at once.
    return Math.max(guess, smallestStep(t0, t1));
  }

  // One step of length h from (t, state), with k1 = f(t, state) already
  // known. Returns the 5th-order new state, f there (the next step's k1),
  // and the error norm err: √(mean((e_i/sk_i)²)) with e the error estimate
  // and sk_i = atol + rtol·max(|old_i|, |new_i|). err ≤ 1 means accepted.
  // Anything not finite makes err Infinity: a new state that is not finite
  // (checked first, because its error scale would be Infinity and hide it),
  // or a NaN from f anywhere in the step.
  function tryStep(derivatives, t, t1, state, k1, h, rtol, atol) {
    var n = state.length;
    var k = [k1];
    var stageState = state;
    var m, j;
    for (var i = 1; i < TABLEAU.c.length; i++) {
      var row = TABLEAU.a[i];
      stageState = [];
      for (m = 0; m < n; m++) {
        var sum = 0;
        for (j = 0; j < i; j++) sum += row[j] * k[j][m];
        stageState.push(state[m] + h * sum);
      }
      // On the last step t + h can round one unit past t1.
      var stageTime = Math.min(t + TABLEAU.c[i] * h, t1);
      k.push(derivatives(stageTime, stageState));
    }
    // The last stage's row of a is b, so its state is the new state.
    var newState = stageState;
    var sumOfSquares = 0;
    for (m = 0; m < n; m++) {
      if (!isFinite(newState[m])) {
        return { state: newState, kLast: k[k.length - 1], err: Infinity };
      }
      var estimate = 0;
      for (j = 0; j < k.length; j++) estimate += ERROR_WEIGHTS[j] * k[j][m];
      estimate *= h;
      var scale = atol + rtol * Math.max(Math.abs(state[m]), Math.abs(newState[m]));
      sumOfSquares += (estimate / scale) * (estimate / scale);
    }
    var err = Math.sqrt(sumOfSquares / n);
    if (isNaN(err)) err = Infinity;
    return { state: newState, kLast: k[k.length - 1], err: err };
  }

  // How much to change the step after one with error norm err, so that the
  // next comes out at err ≈ 0.9⁵ ≈ 0.6: a little inside the tolerance.
  // err = 0 gives the 5× limit, err = Infinity (a step with a value that is
  // not finite) the 0.2× limit.
  function stepFactor(err) {
    var factor = SAFETY * Math.pow(err, -ERROR_EXPONENT);
    return Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, factor));
  }

  function dopri5(params) {
    check.params(WHERE, params, ["f", "t0", "state0", "t1", "rtol", "atol", "h0", "hMax", "maxSteps"]);
    var f = check.func(WHERE, "f", params.f);
    var t0 = check.finite(WHERE, "t0", params.t0);
    var t1 = check.finite(WHERE, "t1", params.t1);
    if (t1 <= t0) check.fail(WHERE, "t1 must be later than t0, got t0 = " + t0 + " and t1 = " + t1 + ".");
    var state0 = check.finiteArray(WHERE, "state0", params.state0);
    var rtol = params.rtol === undefined ? DEFAULT_RTOL : check.between(WHERE, "rtol", params.rtol, 0, 1);
    var atol = params.atol === undefined ? DEFAULT_ATOL : check.positive(WHERE, "atol", params.atol);
    var hMax = params.hMax === undefined ? Infinity : check.positive(WHERE, "hMax", params.hMax);
    var maxSteps = params.maxSteps === undefined ? DEFAULT_MAX_STEPS :
      check.integerAtLeast(WHERE, "maxSteps", params.maxSteps, 1);
    var h0 = params.h0 === undefined ? undefined : check.positive(WHERE, "h0", params.h0);

    var evaluations = 0;
    function derivatives(t, state) {
      evaluations++;
      return callF(f, t, state);
    }

    var t = t0;
    var state = state0.slice();
    var k1 = derivatives(t, state);
    // No shorter step can fix the starting point, so this throws at once.
    check.finiteArray(WHERE, "f(t0, state0)", k1);
    var h = h0 === undefined ? firstStep(derivatives, t0, t1, state, k1, rtol, atol) : h0;
    h = Math.min(h, hMax);           // a given h0 or the guess, never past hMax

    var accepted = 0;
    var rejected = 0;
    var justRejected = false;
    var reachedEnd = false;

    while (accepted + rejected < maxSteps) {
      var hMin = smallestStep(t, t1);
      if (h < hMin) {
        check.fail(WHERE, "the step size fell below " + hMin.toPrecision(2) + " at t = " + t +
          "; the solution may blow up there, f may not be finite there, or rtol and atol may be " +
          "tighter than the arithmetic allows.");
      }

      // The last step is cut short to land exactly on t1.
      var lastStep = t + h >= t1;
      var hTry = lastStep ? t1 - t : h;
      var step = tryStep(derivatives, t, t1, state, k1, hTry, rtol, atol);

      if (step.err <= 1) {           // err is a number or Infinity, never NaN
        accepted++;
        var factor = stepFactor(step.err);
        if (justRejected) factor = Math.min(factor, 1);
        var hProposed = Math.min(hTry * factor, hMax);
        // A last step cut short to land on t1 (a frame shorter than the
        // step) would shrink the step passed on through its 5× growth limit,
        // so the planned step is passed on instead. Its own error is no
        // guide either: on a very short step it is mostly rounding.
        h = hTry < h ? Math.max(h, hProposed) : hProposed;
        justRejected = false;
        state = step.state;
        k1 = step.kLast;             // first same as last
        if (lastStep) {
          t = t1;
          reachedEnd = true;
          break;
        }
        t = t + hTry;
      } else {
        // The state and k1 stay those of the last accepted point.
        rejected++;
        justRejected = true;
        h = hTry * stepFactor(step.err);
      }
    }

    return {
      t: t,
      state: state,
      reachedEnd: reachedEnd,
      hNext: h,
      accepted: accepted,
      rejected: rejected,
      evaluations: evaluations
    };
  }

  E.ode = Object.freeze({
    dopri5: dopri5,
    tableau: TABLEAU
  });
})(this);
