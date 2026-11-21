/* ============================================================================
   rates.js — the rate equations: how the inversion and the photons in the
   cavity change with time, for four-level media, three-level ruby and the
   two-level atom that never lases.

   PART OF THE LASER ENGINE (js/laser/engine/): plain numbers in and out, SI
   units, nothing on the page. Needs check.js and constants.js to be loaded
   first.

   Physics: docs/laser-physics.md §4.1, §4.2, §11.2, §11.3. The equations
   are integrated in dimensionless form (§11.2), t′ = t/τ, s = ln p,
   ε = τ_c/τ:
     four levels   y = N/N_c, p = Bτ·φ, x = R_p/R_c
                   dy/dt′ = x − y − y·p
                   ds/dt′ = ((y − 1) + β·y·e^(−s)) / ε
     three levels  y = ΔN/N_c, p = 2Bτ·φ, w = W_p·τ, n_t = N_t/N_c
                   dy/dt′ = w(n_t − y) − (n_t + y) − y·p
                   ds/dt′ = ((y − 1) + β·(n_t + y)·e^(−s)) / ε
     two levels    as three, but the pump drives both ways:
                   dy/dt′ = −2w·y − (n_t + y) − y·p
   For three and two levels y runs from −n_t (all ions down) to n_t, and
   the seed of spontaneous emission comes from the ions that are up,
   N₂ = (N_t + ΔN)/2, so n_t + y: ΔN itself is negative until half the ions
   are up. p is twice the four-level one because one emission changes ΔN
   by 2. The pump (x or w) may be a number or a function of t′ (a flash).

   s = ln p lets the photon number go from one photon to 10¹⁸ (or, with
   no seed, down to e^(−1600)) without overflow. The seed counts the upper
   level as max(upper, 0) + a floor (10⁻¹² for four levels, 10⁻⁷·n_t for
   three and two; Y_FLOOR and ION_FLOOR below), so with the pump off the
   photons settle at the floor's seed instead of following the atoms down.

   But ln p is stiff when the photons are far below what the seed alone
   feeds in: ds/dt′ then grows like β·upper/(εp), and the solver gives up
   ("the step size fell below"). That happens when β is turned on after
   a run with β = 0 (s may be −300 then). liftToSeed starts the photons at
   the seed level instead; the bench calls it before every solver call.

     LaserEngine.rates.fourLevel.scales({ sigma, tau, nu, l_g, area, L_e,
                                          refl1, refl2, alpha_i })
         the numbers that turn the state into physics:
         N = y·N_c, φ = p·phiPerP, P_out = p·powerPerP, t = t′·τ;
         start from one photon, s = sOnePhoton
     LaserEngine.rates.fourLevel.derivatives({ x, eps, beta })
         returns f(tPrime, [y, s]) for the solvers of LaserEngine.ode
     LaserEngine.rates.fourLevel.steadyState({ x, beta })    -> { y, p }
     LaserEngine.rates.fourLevel.relaxation({ x, tau, tau_c })
         -> { omegaR, omegaDamped, t_damp }   (rad/s, rad/s, s)
     LaserEngine.rates.fourLevel.liftToSeed({ state, beta })  -> a new [y, s]
         s raised to at least ln(β·y): the photons one photon lifetime of
         seed gives

     LaserEngine.rates.threeLevel.scales({ ...the same, N_t })
         the same numbers with p = 2Bτ·φ (no R_c), plus n_t and
         wThreshold = (n_t + 1)/(n_t − 1), null if n_t ≤ 1 (no threshold)
     LaserEngine.rates.threeLevel.derivatives({ w, n_t, eps, beta })
     LaserEngine.rates.threeLevel.steadyState({ w, n_t, beta })   -> { y, p }
     LaserEngine.rates.threeLevel.relaxation({ w, n_t, tau, tau_c })
     LaserEngine.rates.threeLevel.liftToSeed({ state, n_t, beta })
         s raised to at least ln(β·(n_t + y + 10⁻⁷·n_t)/(1 + n_t))
     LaserEngine.rates.twoLevel.derivatives({ w, n_t, eps, beta })
     LaserEngine.rates.twoLevel.steadyState({ w, n_t, beta })     -> { y, p }
         the two-level atom uses the three-level scales and liftToSeed

   Every function takes one object of named values (see check.js) and
   throws an error naming itself for a missing, impossible or unknown input.

   Tests: tests/laser/rates.test.js, tests/laser/three-level.test.js
   ========================================================================== */
(function (root) {
  "use strict";

  var E = root.LaserEngine = root.LaserEngine || {};
  if (!E.check || !E.constants) {
    throw new Error("rates.js needs js/laser/engine/check.js and constants.js to be loaded first.");
  }

  var check = E.check;
  var c = E.constants.c;
  var h = E.constants.h;

  // The name errors start with: the function the caller called.
  function at(scheme, functionName) {
    return "LaserEngine.rates." + scheme + "." + functionName;
  }

  // What the seed adds to the upper level, in f and in liftToSeed: it
  // counts max(upper, 0) + 10⁻¹², so the photons with the pump off (the
  // upper level below 10⁻¹² after about 28τ) are kept at 10⁻¹² of the seed
  // at threshold. When the pump comes back, the solver must follow the
  // photons up from that level; measured for ε from 10⁻⁶ to 2×10⁻⁴ and x
  // from 1.01 to 50, it can from 10⁻²⁰ but not from 10⁻³⁰, so 10⁻¹² leaves
  // a wide margin.
  // Added, not max(y, 10⁻¹²): the implicit solver differentiates f, and
  // without a floor the seed's slope β·e^(−s) just above y = 0 grew past
  // 10³³ with the pump off and stopped it; max(y, 10⁻¹²) moved that corner
  // to y = 10⁻¹², where the Jacobian's difference in y (4.7×10⁻¹¹) reaches
  // across it, and a pump-off frame cost up to 580 steps (stage 7a review).
  // The corner of max(y, 0) is at y = 0, which a decaying y never crosses.
  var Y_FLOOR = 1e-12;

  // The same floor for three and two levels, as a share of n_t: the seed
  // counts the upper level as max(n_t + y, 0) + 10⁻⁷·n_t. Not 10⁻¹²: there
  // the upper level is n_t + y, and as the ions all fall back down
  // (y → −n_t) it is known only to the rounding of n_t, 2×10⁻¹⁶·n_t. Next
  // to a floor of 10⁻¹² that rounding was noise of 10⁻³ in the seed, and
  // the implicit solver, which differentiates f, took 10⁵ steps per 10τ
  // (ruby, 30τ after the pump stopped; stage 7b). Next to 10⁻⁷·n_t it is
  // 2×10⁻⁹, below the solver's tolerance, whatever n_t is, and the same
  // decay takes under 10 steps. The photons with the pump off then settle
  // at β·10⁻⁷·n_t/(1 + n_t), for ruby a hundredth of a photon.
  var ION_FLOOR = 1e-7;

  var CAVITY_NAMES = ["sigma", "tau", "nu", "l_g", "area", "L_e", "refl1", "refl2", "alpha_i"];

  /* ---------- shared by every scheme ---------- */

  // The cavity's numbers (§3.2, §4.1), from the nine inputs both schemes'
  // scales take. The caller has checked the names.
  function cavityNumbers(where, params) {
    var sigma = check.positive(where, "sigma", params.sigma);
    var tau = check.positive(where, "tau", params.tau);
    var nu = check.positive(where, "nu", params.nu);
    var l_g = check.positive(where, "l_g", params.l_g);
    var area = check.positive(where, "area", params.area);
    var L_e = check.positive(where, "L_e", params.L_e);
    var refl1 = check.reflectivity(where, "refl1", params.refl1);
    var refl2 = check.reflectivity(where, "refl2", params.refl2);
    var alpha_i = check.atLeast(where, "alpha_i", params.alpha_i, 0);
    // L_e = L + (n_g − 1)·l is never shorter than l. The 1e-9 lets a medium
    // that fills the cavity through after float rounding (0.7 − 0.4 < 0.3).
    if (l_g > L_e * (1 + 1e-9)) {
      check.fail(where, "l_g (" + l_g + " m) cannot be longer than L_e (" + L_e + " m).");
    }

    // Single-pass loss γ = αl − ½(ln R₁ + ln R₂), as in cavity.js (§3.2).
    var gamma = alpha_i * l_g - 0.5 * (Math.log(refl1) + Math.log(refl2));
    var tau_c = L_e / (c * gamma);           // photon lifetime (§3.2)
    // No loss at all gives γ = 0; a loss too small to divide by (γ = 10⁻³²⁰)
    // gives an infinite τ_c, or an infinite ε below. Both are refused.
    if (!isFinite(tau_c / tau)) {
      check.fail(where, "this cavity has no loss at all (or too little to compute with), " +
        "so the photon lifetime would be infinite.");
    }
    var V = area * L_e;                      // mode volume
    // γ₂ = −ln R₂, the output coupler's share of the loss. Math.abs so a
    // perfect mirror gives +0 (−ln 1 would be −0, shown as "−0 W").
    var gammaOut = Math.abs(Math.log(refl2));
    // Photons leave through mirror 2 at the rate cγ₂/(2L_e) (§4.1).
    var outputRate = c * gammaOut / (2 * L_e);

    return {
      tau: tau,
      gamma: gamma,
      tau_c: tau_c,
      N_c: gamma / (sigma * l_g),            // threshold inversion, = ΔN_th (§4.1)
      V: V,
      V_a: area * l_g,                       // active volume
      B: sigma * c / V,                      // s⁻¹ (§4.1)
      eps: tau_c / tau,
      powerPerPhoton: h * nu * outputRate    // W out per photon in the mode
    };
  }

  // The scales' answer for p = pOnePhoton·φ.
  function scalesFor(numbers, pOnePhoton) {
    return {
      gamma: numbers.gamma,
      tau_c: numbers.tau_c,
      N_c: numbers.N_c,
      V: numbers.V,
      V_a: numbers.V_a,
      B: numbers.B,
      eps: numbers.eps,
      pOnePhoton: pOnePhoton,
      sOnePhoton: Math.log(pOnePhoton),
      phiPerP: 1 / pOnePhoton,                          // photons per unit of p
      powerPerP: numbers.powerPerPhoton / pOnePhoton    // W per unit of p
    };
  }

  // The pump of derivatives: a number of at least 0, or a function of t′
  // (a flash), whose values the caller makes sure are numbers of at least 0.
  function pumpInput(where, name, value) {
    if (typeof value === "function") return value;
    if (typeof value !== "number" || !isFinite(value) || value < 0) {
      check.fail(where, name + " must be a finite number of at least 0 or a function of t′, got " +
        check.describe(value) + ".");
    }
    return value;
  }

  // The positive root of p² − a·p − c = 0 (c ≥ 0), the photons of a
  // steady state. For a < 0 (below threshold) a + √(a² + 4c) subtracts two
  // nearly equal numbers; the same value written as 2c/(√(a² + 4c) − a)
  // does not.
  function steadyPhotons(a, cTerm) {
    var squareRoot = Math.sqrt(a * a + 4 * cTerm);
    return a >= 0 ? (a + squareRoot) / 2 : 2 * cTerm / (squareRoot - a);
  }

  // Checks state = [y, s].
  function readState(where, value) {
    var state = check.finiteArray(where, "state", value);
    if (state.length !== 2) {
      check.fail(where, "state must be [y, s], got " + check.describe(state) + ".");
    }
    return state;
  }

  /* ---------- four levels ---------- */

  // The numbers that link the dimensionless state to physics (§4.1, §11.2).
  // scales({ sigma, tau, nu, l_g, area, L_e, refl1, refl2, alpha_i })
  function scales(params) {
    var where = at("fourLevel", "scales");
    check.params(where, params, CAVITY_NAMES);
    var numbers = cavityNumbers(where, params);
    var result = scalesFor(numbers, numbers.B * numbers.tau);   // p = Bτ·φ
    result.R_c = numbers.N_c / numbers.tau;                     // pump rate at threshold, m⁻³ s⁻¹
    return result;
  }

  // The right-hand side of §11.2 with s = ln p (§11.3), for the solvers.
  // derivatives({ x, eps, beta })  ->  f(tPrime, [y, s]) -> [dy/dt′, ds/dt′]
  // The inputs are checked here, once; f itself checks nothing, because
  // the solver calls it about 10⁵ times per frame.
  function derivatives(params) {
    var where = at("fourLevel", "derivatives");
    check.params(where, params, ["x", "eps", "beta"]);
    var x = pumpInput(where, "x", params.x);
    var eps = check.positive(where, "eps", params.eps);
    var beta = check.between(where, "beta", params.beta, 0, 1);
    var logBeta = Math.log(beta);            // used only when β > 0
    var pumpAt = typeof x === "function" ? x : null;

    return function (tPrime, state) {
      var y = state[0];
      var s = state[1];
      var pump = pumpAt === null ? x : pumpAt(tPrime);
      // The seed βy/p = βy·e^(−s), computed as one exponential,
      // e^(ln β + ln y − s) (§11.3). Written as β·y·e^(−s), the factor
      // e^(−s) overflows once s < −709 even when the product is about 1,
      // and with β = 0 the product would be 0·Infinity = NaN. No seed with
      // β = 0. The seed counts y as max(y, 0) + 10⁻¹² (Y_FLOOR), as
      // liftToSeed does; max(y, 0) for a solver trial a hair below 0.
      var seed = 0;
      if (beta > 0) {
        seed = Math.exp(logBeta + Math.log(Math.max(y, 0) + Y_FLOOR) - s);
      }
      return [pump - y - y * Math.exp(s), ((y - 1) + seed) / eps];
    };
  }

  // The steady state of f, seed floor included: from dy/dt′ = 0 and
  // ds/dt′ = 0 with the seed β·(y + δ), δ = 10⁻¹² (Y_FLOOR),
  //   p² − a·p − c = 0,  a = x − 1 + βδ,  c = β(x + δ),
  //   p = (a + √(a² + 4c)) / 2,   y = x/(1 + p).
  // Above threshold p ≈ x − 1 and y ≈ 1; below it p ≈ β(x + δ)/(1 − x),
  // the seed level, and y ≈ x; with the pump off p = βδ/(1 − βδ) ≈ βδ.
  // steadyState({ x, beta })  ->  { y, p }
  function steadyState(params) {
    var where = at("fourLevel", "steadyState");
    check.params(where, params, ["x", "beta"]);
    var x = check.atLeast(where, "x", params.x, 0);
    var beta = check.between(where, "beta", params.beta, 0, 1);
    var p = steadyPhotons(x - 1 + beta * Y_FLOOR, beta * (x + Y_FLOOR));
    return { y: x / (1 + p), p: p };
  }

  // Relaxation oscillations around the steady state (§4.2), from the
  // linearized equations: λ² + (x/τ)λ + ω_R² = 0.
  //   omegaR       √((x − 1)/(τ τ_c)), the doc's formula (small ε)
  //   omegaDamped  √(ω_R² − (x/2τ)²), the exact frequency; 0 if overdamped
  //   t_damp       2τ/x, the time the oscillation takes to fall by e
  // Only above threshold: below it there is no laser light to oscillate.
  // relaxation({ x, tau, tau_c })
  function relaxation(params) {
    var where = at("fourLevel", "relaxation");
    check.params(where, params, ["x", "tau", "tau_c"]);
    var x = check.finite(where, "x", params.x);
    if (x <= 1) {
      check.fail(where, "x must be above 1: below threshold there is no laser light to oscillate, got " + x + ".");
    }
    var tau = check.positive(where, "tau", params.tau);
    var tau_c = check.positive(where, "tau_c", params.tau_c);
    return oscillation((x - 1) / (tau * tau_c), x / (2 * tau));
  }

  // ω_R², the damping rate -> { omegaR, omegaDamped, t_damp }
  function oscillation(omegaSquared, dampingRate) {
    var squared = omegaSquared - dampingRate * dampingRate;
    return {
      omegaR: Math.sqrt(omegaSquared),
      omegaDamped: squared > 0 ? Math.sqrt(squared) : 0,
      t_damp: 1 / dampingRate
    };
  }

  // Raises the photons to at least the seed level, p ≥ β·(max(y, 0) + 10⁻¹²):
  // the photons one photon lifetime of spontaneous emission feeds in, which
  // is where the real photon number gets within about τ_c anyway. Call it
  // before every solver call: a state at or above that level (a laser that
  // runs, the below-threshold steady state, the one-photon start, any state
  // with β = 0) comes back unchanged, and a state below it (β just turned
  // on after a run with β = 0) would otherwise stop the solver. y is never
  // changed.
  // liftToSeed({ state, beta })  ->  a new [y, s]
  function liftToSeed(params) {
    var where = at("fourLevel", "liftToSeed");
    check.params(where, params, ["state", "beta"]);
    var state = readState(where, params.state);
    var beta = check.between(where, "beta", params.beta, 0, 1);
    var y = state[0];
    var s = state[1];
    if (beta === 0) return [y, s];
    var seedLevel = Math.log(beta) + Math.log(Math.max(y, 0) + Y_FLOOR);
    return [y, Math.max(s, seedLevel)];
  }

  /* ---------- three and two levels ---------- */

  // scales({ sigma, tau, nu, l_g, area, L_e, refl1, refl2, alpha_i, N_t })
  function threeScales(params) {
    var where = at("threeLevel", "scales");
    check.params(where, params, CAVITY_NAMES.concat(["N_t"]));
    var numbers = cavityNumbers(where, params);
    var N_t = check.positive(where, "N_t", params.N_t);
    // p = 2Bτ·φ: one emission changes ΔN by 2 (§4.1), so the photons of
    // §11.2's equations count twice.
    var result = scalesFor(numbers, 2 * numbers.B * numbers.tau);
    var n_t = N_t / numbers.N_c;
    result.n_t = n_t;
    // Without light y settles at n_t(w − 1)/(w + 1), which reaches 1 at
    // w = (n_t + 1)/(n_t − 1). With n_t ≤ 1 even every ion up is not enough.
    result.wThreshold = n_t > 1 ? (n_t + 1) / (n_t - 1) : null;
    return result;
  }

  // The right-hand side for three levels (twoLevel false) or two (true).
  function ionDerivatives(params, twoLevel) {
    var where = at(twoLevel ? "twoLevel" : "threeLevel", "derivatives");
    check.params(where, params, ["w", "n_t", "eps", "beta"]);
    var w = pumpInput(where, "w", params.w);
    var n_t = check.positive(where, "n_t", params.n_t);
    var eps = check.positive(where, "eps", params.eps);
    var beta = check.between(where, "beta", params.beta, 0, 1);
    var logBeta = Math.log(beta);            // used only when β > 0
    var floor = ION_FLOOR * n_t;
    var pumpAt = typeof w === "function" ? w : null;

    return function (tPrime, state) {
      var y = state[0];
      var s = state[1];
      var pump = pumpAt === null ? w : pumpAt(tPrime);
      // The pump lifts the ions that are down, N₁ ∝ n_t − y. With two levels
      // its light also drives the ions that are up back down: −2w·y.
      var pumped = twoLevel ? -2 * pump * y : pump * (n_t - y);
      // The seed comes from the ions that are up, N₂ ∝ n_t + y (see the
      // four-level f for why it is one exponential), with ION_FLOOR's floor.
      var seed = 0;
      if (beta > 0) {
        seed = Math.exp(logBeta + Math.log(Math.max(n_t + y, 0) + floor) - s);
      }
      return [pumped - (n_t + y) - y * Math.exp(s), ((y - 1) + seed) / eps];
    };
  }

  // The steady state of f, seed floor included, from dy/dt′ = 0 and
  // ds/dt′ = 0 with the seed β·(n_t + y + δ), δ = 10⁻⁷·n_t: again
  // p² − a·p − c = 0, with
  //   three levels  y = n_t(w − 1)/(1 + w + p),
  //                 a = (n_t − 1)w − (n_t + 1) + β(n_t + δ),  c = β(2n_t·w + δ(1 + w))
  //   two levels    y = −n_t/(1 + 2w + p),
  //                 a = −(n_t + 1 + 2w) + β(n_t + δ),        c = β(2n_t·w + δ(1 + 2w))
  // With β = 0 and no light, three levels give §2.2's y = n_t(w − 1)/(w + 1).
  function ionSteadyState(params, twoLevel) {
    var where = at(twoLevel ? "twoLevel" : "threeLevel", "steadyState");
    check.params(where, params, ["w", "n_t", "beta"]);
    var w = check.atLeast(where, "w", params.w, 0);
    var n_t = check.positive(where, "n_t", params.n_t);
    var beta = check.between(where, "beta", params.beta, 0, 1);
    var floor = ION_FLOOR * n_t;
    var seedShift = beta * (n_t + floor);
    var p;
    if (twoLevel) {
      p = steadyPhotons(-(n_t + 1 + 2 * w) + seedShift, beta * (2 * n_t * w + floor * (1 + 2 * w)));
      return { y: -n_t / (1 + 2 * w + p), p: p };
    }
    p = steadyPhotons((n_t - 1) * w - (n_t + 1) + seedShift, beta * (2 * n_t * w + floor * (1 + w)));
    return { y: n_t * (w - 1) / (1 + w + p), p: p };
  }

  // Relaxation oscillations of three levels, from the linearized equations
  // about y = 1, p = p₀ = (n_t − 1)w − (n_t + 1) = (n_t + 1)(x − 1):
  //   λ² + n_t(w − 1)·λ + p₀/ε = 0   (in t′)
  // so ω_R² = p₀/(ττ_c) and the damping rate is n_t(w − 1)/(2τ), far
  // faster than four levels' x/(2τ) for ruby (§4.2).
  // relaxation({ w, n_t, tau, tau_c }) -> { omegaR, omegaDamped, t_damp }
  function threeRelaxation(params) {
    var where = at("threeLevel", "relaxation");
    check.params(where, params, ["w", "n_t", "tau", "tau_c"]);
    var w = check.finite(where, "w", params.w);
    var n_t = check.positive(where, "n_t", params.n_t);
    var tau = check.positive(where, "tau", params.tau);
    var tau_c = check.positive(where, "tau_c", params.tau_c);
    if (n_t <= 1) {
      check.fail(where, "n_t must be above 1: with no more ions than the threshold inversion there is no " +
        "threshold, so no laser light to oscillate, got " + n_t + ".");
    }
    var p0 = (n_t - 1) * w - (n_t + 1);
    if (p0 <= 0) {
      check.fail(where, "w must be above the threshold (n_t + 1)/(n_t − 1) = " + (n_t + 1) / (n_t - 1) +
        ": below it there is no laser light to oscillate, got " + w + ".");
    }
    return oscillation(p0 / (tau * tau_c), n_t * (w - 1) / (2 * tau));
  }

  // Raises the photons to at least β·(max(n_t + y, 0) + 10⁻⁷·n_t)/(1 + n_t).
  // The level below threshold is β(n_t + y)/(1 − y), and 1 − y is at most
  // 1 + n_t, so this never raises a steady state; without the 1/(1 + n_t)
  // it would raise ruby's all-down level 12 times. As for four levels, the
  // one-photon start, a running laser and β = 0 come back unchanged, and y
  // is never changed. Two levels use this one too.
  // liftToSeed({ state, n_t, beta })  ->  a new [y, s]
  function threeLiftToSeed(params) {
    var where = at("threeLevel", "liftToSeed");
    check.params(where, params, ["state", "n_t", "beta"]);
    var state = readState(where, params.state);
    var n_t = check.positive(where, "n_t", params.n_t);
    var beta = check.between(where, "beta", params.beta, 0, 1);
    var y = state[0];
    var s = state[1];
    if (beta === 0) return [y, s];
    var seedLevel = Math.log(beta) + Math.log(Math.max(n_t + y, 0) + ION_FLOOR * n_t) - Math.log(1 + n_t);
    return [y, Math.max(s, seedLevel)];
  }

  E.rates = Object.freeze({
    fourLevel: Object.freeze({
      scales: scales,
      derivatives: derivatives,
      steadyState: steadyState,
      relaxation: relaxation,
      liftToSeed: liftToSeed
    }),
    threeLevel: Object.freeze({
      scales: threeScales,
      derivatives: function (params) { return ionDerivatives(params, false); },
      steadyState: function (params) { return ionSteadyState(params, false); },
      relaxation: threeRelaxation,
      liftToSeed: threeLiftToSeed
    }),
    twoLevel: Object.freeze({
      derivatives: function (params) { return ionDerivatives(params, true); },
      steadyState: function (params) { return ionSteadyState(params, true); }
    })
  });
})(this);
