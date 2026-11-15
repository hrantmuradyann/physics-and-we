/* ============================================================================
   ode.js — two general solvers for ordinary differential equations
   d(state)/dt = f(t, state), both with an adaptive step:
     dopri5      Dormand–Prince 5(4), the explicit method often called
                 "RK45": accurate and cheap while nothing is stiff
     rosenbrock  the implicit Rosenbrock 2(3) pair behind MATLAB's ode23s:
                 for stiff runs (the laser below threshold, §11.3), where
                 an explicit step must stay below 3.3/|λ| of the fastest
                 decay; the bench uses this one
   Both take the same inputs and give the same kind of answer.

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

   LaserEngine.ode.rosenbrock({ f, t0, state0, t1, ... }) takes the same
   inputs and returns the same answer (L. F. Shampine and M. W. Reichelt,
   "The MATLAB ODE Suite", SIAM J. Sci. Comput. 18 (1997) 1, §3; the
   formulas are written out in docs/laser-plan.md, stage 7a):
   - Each step solves three linear systems with W = I − h·d·J, where
     J ≈ ∂f/∂state and T ≈ ∂f/∂t are found by differences once per
     accepted point (n + 1 calls of f) and kept for the retries; a try
     costs 2 calls. New state of order 2, error estimate of order 3, so
     the next step is h·0.9·err^(−1/3), between 0.2× and 5×.
   - It is L-stable: a part of the state that decays far faster than the
     step is damped to its slow value in one step, so the step follows
     the accuracy of the slow parts, not the fastest decay. In smooth,
     non-stiff stretches it takes more steps than dopri5 (order 2, not 5).
   - Everything else is as for dopri5, from the same step loop
     (adaptiveRun): f gets copies and is never called outside [t0, t1]
     (the difference for T is never longer than the step), maxSteps,
     hNext, the not-finite rules and the errors (naming
     LaserEngine.ode.rosenbrock).

   It throws, naming LaserEngine.ode.dopri5 (or .rosenbrock), for bad
   inputs; for f giving something other than one number per entry; for f
   not finite at the start; and when the step has to shrink below what the
   arithmetic can resolve: the solution blows up, f is not finite there,
   or the tolerances are too tight.

   Tests: tests/laser/ode.test.js, tests/laser/rosenbrock.test.js
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
  function callF(where, f, t, state) {
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
      check.fail(where, "f must return an array of " + n + " numbers, one per entry of the state; " +
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
  // (Hairer §II.4, "starting step size"). Costs one call of f. exponent is
  // 1/(order of the error estimate): 1/5 for dopri5, 1/3 for rosenbrock.
  function firstStep(derivatives, t0, t1, state0, f0, rtol, atol, exponent) {
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
      var h1 = fastest <= 1e-15 ? Math.max(1e-6, h * 1e-3) : Math.pow(0.01 / fastest, exponent);
      guess = Math.min(100 * h, h1);
    }
    // The guesses above are absolute (1e-6); far from t = 0 that can be
    // less than t can resolve, and a smooth problem would throw at once.
    return Math.max(guess, smallestStep(t0, t1));
  }

  // One step of length h from (t, state), with k1 = f(t, state) already
  // known. Returns the 5th-order new state, f there (fNew, the next step's k1),
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
        return { state: newState, fNew: k[k.length - 1], err: Infinity };
      }
      var estimate = 0;
      for (j = 0; j < k.length; j++) estimate += ERROR_WEIGHTS[j] * k[j][m];
      estimate *= h;
      var scale = atol + rtol * Math.max(Math.abs(state[m]), Math.abs(newState[m]));
      sumOfSquares += (estimate / scale) * (estimate / scale);
    }
    var err = Math.sqrt(sumOfSquares / n);
    if (isNaN(err)) err = Infinity;
    return { state: newState, fNew: k[k.length - 1], err: err };
  }

  // How much to change the step after one with error norm err, so that the
  // next comes out a little inside the tolerance (err ≈ 0.9⁵ ≈ 0.6 for
  // dopri5, 0.9³ ≈ 0.73 for rosenbrock). err = 0 gives the 5× limit,
  // err = Infinity (a step with a value that is not finite) the 0.2× limit.
  function stepFactor(err, exponent) {
    var factor = SAFETY * Math.pow(err, -exponent);
    return Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, factor));
  }

  // The inputs both solvers take, checked, with the defaults filled in.
  function readInputs(where, params) {
    check.params(where, params, ["f", "t0", "state0", "t1", "rtol", "atol", "h0", "hMax", "maxSteps"]);
    var inputs = {};
    inputs.f = check.func(where, "f", params.f);
    inputs.t0 = check.finite(where, "t0", params.t0);
    inputs.t1 = check.finite(where, "t1", params.t1);
    if (inputs.t1 <= inputs.t0) {
      check.fail(where, "t1 must be later than t0, got t0 = " + inputs.t0 + " and t1 = " + inputs.t1 + ".");
    }
    inputs.state0 = check.finiteArray(where, "state0", params.state0);
    inputs.rtol = params.rtol === undefined ? DEFAULT_RTOL : check.between(where, "rtol", params.rtol, 0, 1);
    inputs.atol = params.atol === undefined ? DEFAULT_ATOL : check.positive(where, "atol", params.atol);
    inputs.hMax = params.hMax === undefined ? Infinity : check.positive(where, "hMax", params.hMax);
    inputs.maxSteps = params.maxSteps === undefined ? DEFAULT_MAX_STEPS :
      check.integerAtLeast(where, "maxSteps", params.maxSteps, 1);
    inputs.h0 = params.h0 === undefined ? undefined : check.positive(where, "h0", params.h0);
    return inputs;
  }

  // The step-size loop both solvers share (Hairer §II.4): try a step from
  // the last accepted point, accept it if its error norm is at most 1,
  // and change the step by stepFactor either way. `tryFrom(derivatives,
  // point, h, inputs)` makes one try of length h from point = { t, state,
  // f } (f = f(t, state); inputs from readInputs) and returns { state,
  // fNew, err }. A new point object
  // is made for every accepted step, so a solver can keep what belongs to
  // the point (rosenbrock's J and T) until the point changes.
  function adaptiveRun(where, params, exponent, tryFrom) {
    var inputs = readInputs(where, params);
    var f = inputs.f;
    var t0 = inputs.t0;
    var t1 = inputs.t1;
    var hMax = inputs.hMax;

    var evaluations = 0;
    function derivatives(t, state) {
      evaluations++;
      return callF(where, f, t, state);
    }

    var point = { t: t0, state: inputs.state0.slice(), f: null };
    point.f = derivatives(t0, point.state);
    // No shorter step can fix the starting point, so this throws at once.
    check.finiteArray(where, "f(t0, state0)", point.f);
    var h = inputs.h0 === undefined ?
      firstStep(derivatives, t0, t1, point.state, point.f, inputs.rtol, inputs.atol, exponent) : inputs.h0;
    h = Math.min(h, hMax);           // a given h0 or the guess, never past hMax

    var accepted = 0;
    var rejected = 0;
    var justRejected = false;
    var reachedEnd = false;

    while (accepted + rejected < inputs.maxSteps) {
      var hMin = smallestStep(point.t, t1);
      if (h < hMin) {
        check.fail(where, "the step size fell below " + hMin.toPrecision(2) + " at t = " + point.t +
          "; the solution may blow up there, f may not be finite there, or rtol and atol may be " +
          "tighter than the arithmetic allows.");
      }

      // The last step is cut short to land exactly on t1.
      var lastStep = point.t + h >= t1;
      var hTry = lastStep ? t1 - point.t : h;
      var step = tryFrom(derivatives, point, hTry, inputs);

      if (step.err <= 1) {           // err is a number or Infinity, never NaN
        accepted++;
        var factor = stepFactor(step.err, exponent);
        if (justRejected) factor = Math.min(factor, 1);
        var hProposed = Math.min(hTry * factor, hMax);
        // A last step cut short to land on t1 (a frame shorter than the
        // step) would shrink the step passed on through its 5× growth limit,
        // so the planned step is passed on instead. Its own error is no
        // guide either: on a very short step it is mostly rounding.
        h = hTry < h ? Math.max(h, hProposed) : hProposed;
        justRejected = false;
        // f at the new state is the next step's first (first same as last).
        point = { t: lastStep ? t1 : point.t + hTry, state: step.state, f: step.fNew };
        if (lastStep) {
          reachedEnd = true;
          break;
        }
      } else {
        // The point stays the last accepted one.
        rejected++;
        justRejected = true;
        h = hTry * stepFactor(step.err, exponent);
      }
    }

    return {
      t: point.t,
      state: point.state,
      reachedEnd: reachedEnd,
      hNext: h,
      accepted: accepted,
      rejected: rejected,
      evaluations: evaluations
    };
  }

  function dopri5(params) {
    return adaptiveRun(WHERE, params, ERROR_EXPONENT, function (derivatives, point, h, inputs) {
      return tryStep(derivatives, point.t, inputs.t1, point.state, point.f, h, inputs.rtol, inputs.atol);
    });
  }

  /* ---------- rosenbrock: the implicit solver for stiff runs ---------- */

  var WHERE_ROSENBROCK = "LaserEngine.ode.rosenbrock";

  // Shampine & Reichelt (1997), §3: the two numbers of the 2(3) pair.
  var ROSENBROCK = Object.freeze({
    d: 1 / (2 + Math.SQRT2),
    e32: 6 + Math.SQRT2
  });
  var ROSENBROCK_EXPONENT = 1 / 3;   // its error estimate goes as h³

  // Gaussian elimination with partial pivoting: at each column the row with
  // the largest entry (in size) is moved to the top, so a small or zero
  // entry on the diagonal is never divided by when another row can be used.
  // Changes `matrix` (an array of n rows of n numbers) into the factors and
  // returns them, with the order the rows ended up in.
  function factorize(matrix) {
    var n = matrix.length;
    var order = [];
    var row, col, i;
    for (i = 0; i < n; i++) order.push(i);
    for (col = 0; col < n; col++) {
      var best = col;
      for (row = col + 1; row < n; row++) {
        if (Math.abs(matrix[row][col]) > Math.abs(matrix[best][col])) best = row;
      }
      if (best !== col) {
        var swapRow = matrix[col];
        matrix[col] = matrix[best];
        matrix[best] = swapRow;
        var swapIndex = order[col];
        order[col] = order[best];
        order[best] = swapIndex;
      }
      for (row = col + 1; row < n; row++) {
        // A column of zeros gives 0/0 = NaN here: the step that needed it
        // is then not finite and is retried shorter.
        var factor = matrix[row][col] / matrix[col][col];
        matrix[row][col] = factor;
        for (i = col + 1; i < n; i++) matrix[row][i] -= factor * matrix[col][i];
      }
    }
    return { lu: matrix, order: order };
  }

  // Solves (the matrix given to factorize)·x = b, with its factors.
  function solveFactored(factors, b) {
    var lu = factors.lu;
    var n = lu.length;
    var x = [];
    var i, j, sum;
    for (i = 0; i < n; i++) {               // L·z = b in the new row order
      sum = b[factors.order[i]];
      for (j = 0; j < i; j++) sum -= lu[i][j] * x[j];
      x.push(sum);
    }
    for (i = n - 1; i >= 0; i--) {          // U·x = z
      sum = x[i];
      for (j = i + 1; j < n; j++) sum -= lu[i][j] * x[j];
      x[i] = sum / lu[i][i];
    }
    return x;
  }

  // J[i][j] = ∂f_i/∂state_j by forward differences, with the step of
  // Hairer and Wanner's codes, √(ε·max(10⁻⁵, |state_j|)). n calls of f.
  function jacobian(derivatives, t, state, f0) {
    var n = state.length;
    var J = [];
    var i, j;
    for (i = 0; i < n; i++) J.push([]);
    for (j = 0; j < n; j++) {
      var step = Math.sqrt(Number.EPSILON * Math.max(1e-5, Math.abs(state[j])));
      // Past |state_j| ≈ 4.5×10¹⁵ that step is lost in rounding (the
      // difference would be 0/0): there it is √ε·|state_j|.
      if (state[j] + step === state[j]) step = Math.sqrt(Number.EPSILON) * Math.abs(state[j]);
      var moved = state.slice();
      moved[j] = state[j] + step;
      var delta = moved[j] - state[j];      // the step as the arithmetic took it
      var fMoved = derivatives(t, moved);
      for (i = 0; i < n; i++) J[i][j] = (fMoved[i] - f0[i]) / delta;
    }
    return J;
  }

  // ∂f/∂t by a forward difference, as MATLAB's ode23s takes it: a step in t
  // of √ε·max(|t|, |t + h|), but never longer than the step h itself, so f
  // is never called past t + h, which is at most t1. (When the difference
  // is the whole last step, t is within a factor 2 of t1, so h = t1 − t is
  // exact and t + h is t1 itself, not one unit past it.) One call of f.
  // dt is never 0: h is at least 16ε·|t| (smallestStep), far more than t's
  // last digit, and at t = 0 the difference is √ε·h.
  function timeDerivative(derivatives, t, h, state, f0) {
    var delta = Math.min(Math.sqrt(Number.EPSILON) * Math.max(Math.abs(t), Math.abs(t + h)), h);
    var other = t + delta;
    var dt = other - t;
    var fOther = derivatives(other, state);
    return fOther.map(function (value, i) {
      return (value - f0[i]) / dt;
    });
  }

  // One step of length h from (t, state), with f0 = f(t, state), J and T
  // known there (Shampine & Reichelt 1997, §3; the formulas are in
  // docs/laser-plan.md, stage 7a). Returns the new state, f there (the next
  // step's f0) and the error norm err, measured as in dopri5's tryStep;
  // anything not finite makes err Infinity. Two calls of f.
  function tryRosenbrockStep(derivatives, t, t1, state, f0, J, T, h, rtol, atol) {
    var n = state.length;
    var hd = h * ROSENBROCK.d;
    var m, j;

    var W = [];                              // W = I − h·d·J
    for (m = 0; m < n; m++) {
      var row = [];
      for (j = 0; j < n; j++) row.push((m === j ? 1 : 0) - hd * J[m][j]);
      W.push(row);
    }
    var factors = factorize(W);

    var rhs = [];
    for (m = 0; m < n; m++) rhs.push(f0[m] + hd * T[m]);
    var k1 = solveFactored(factors, rhs);

    var midState = [];
    for (m = 0; m < n; m++) midState.push(state[m] + 0.5 * h * k1[m]);
    var f1 = derivatives(Math.min(t + 0.5 * h, t1), midState);

    rhs = [];
    for (m = 0; m < n; m++) rhs.push(f1[m] - k1[m]);
    var k2 = solveFactored(factors, rhs);
    for (m = 0; m < n; m++) k2[m] += k1[m];

    var newState = [];
    for (m = 0; m < n; m++) newState.push(state[m] + h * k2[m]);
    // On the last step t + h can round one unit past t1.
    var f2 = derivatives(Math.min(t + h, t1), newState);

    rhs = [];
    for (m = 0; m < n; m++) {
      rhs.push(f2[m] - ROSENBROCK.e32 * (k2[m] - f1[m]) - 2 * (k1[m] - f0[m]) + hd * T[m]);
    }
    var k3 = solveFactored(factors, rhs);

    var estimate = [];
    var scale = [];
    for (m = 0; m < n; m++) {
      if (!isFinite(newState[m])) {
        return { state: newState, fNew: f2, err: Infinity };
      }
      estimate.push(h / 6 * (k1[m] - 2 * k2[m] + k3[m]));
      scale.push(atol + rtol * Math.max(Math.abs(state[m]), Math.abs(newState[m])));
    }
    var err = scaledSize(estimate, scale);
    if (isNaN(err)) err = Infinity;
    return { state: newState, fNew: f2, err: err };
  }

  function rosenbrock(params) {
    // J and T belong to a point: computed when the first step from it is
    // tried, kept for the retries after a rejection (the loop makes a new
    // point object for every accepted step).
    var J = null;
    var T = null;
    var jacobianPoint = null;
    return adaptiveRun(WHERE_ROSENBROCK, params, ROSENBROCK_EXPONENT, function (derivatives, point, h, inputs) {
      if (point !== jacobianPoint) {
        J = jacobian(derivatives, point.t, point.state, point.f);
        T = timeDerivative(derivatives, point.t, h, point.state, point.f);
        jacobianPoint = point;
      }
      return tryRosenbrockStep(derivatives, point.t, inputs.t1, point.state, point.f, J, T, h,
        inputs.rtol, inputs.atol);
    });
  }

  E.ode = Object.freeze({
    dopri5: dopri5,
    tableau: TABLEAU,
    rosenbrock: rosenbrock,
    rosenbrockCoefficients: ROSENBROCK
  });
})(this);
