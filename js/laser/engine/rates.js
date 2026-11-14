/* ============================================================================
   rates.js — the rate equations: how the inversion and the photons in the
   cavity change with time. Four-level media for now; three levels (ruby)
   come in build stage 7.

   PART OF THE LASER ENGINE (js/laser/engine/): plain numbers in and out, SI
   units, nothing on the page. Needs check.js and constants.js to be loaded
   first.

   Physics: docs/laser-physics.md §4.1, §4.2, §11.2, §11.3. The equations
   are integrated in dimensionless form (§11.2):
     t′ = t/τ,  y = N/N_c,  p = Bτ·φ,  s = ln p,  x = R_p/R_c,  ε = τ_c/τ
     dy/dt′ = x − y − y·p
     ds/dt′ = ((y − 1) + β·y·e^(−s)) / ε
   s = ln p lets the photon number go from one photon to 10¹⁸ (or, with
   no seed, down to e^(−1600)) without overflow.

   But ln p is stiff when the photons are far below what the seed alone
   feeds in, p ≪ βy: ds/dt′ then grows like βy/(εp), and the solver gives
   up ("the step size fell below"). That happens after a run with β = 0
   when β is turned on, and when the pump comes back after being off for
   long. liftToSeed starts the photons at the seed level instead; the bench
   calls it before every solver call.

     LaserEngine.rates.fourLevel.scales({ sigma, tau, nu, l_g, area, L_e,
                                          refl1, refl2, alpha_i })
         the numbers that turn the state into physics:
         N = y·N_c, φ = p·phiPerP, P_out = p·powerPerP, t = t′·τ;
         start from one photon, s = sOnePhoton
     LaserEngine.rates.fourLevel.derivatives({ x, eps, beta })
         returns f(tPrime, [y, s]) for LaserEngine.ode.dopri5
     LaserEngine.rates.fourLevel.steadyState({ x, beta })    -> { y, p }
     LaserEngine.rates.fourLevel.relaxation({ x, tau, tau_c })
         -> { omegaR, omegaDamped, t_damp }   (rad/s, rad/s, s)
     LaserEngine.rates.fourLevel.liftToSeed({ state, beta })  -> a new [y, s]
         s raised to at least ln(β·y): the photons one photon lifetime of
         seed gives

   Every function takes one object of named values (see check.js) and
   throws an error naming itself for a missing, impossible or unknown input.

   Tests: tests/laser/rates.test.js
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
  function at(functionName) {
    return "LaserEngine.rates.fourLevel." + functionName;
  }

  // The smallest y liftToSeed counts with: 10⁻¹² of the threshold
  // inversion, reached after the pump has been off for about 28τ. The
  // photons it adds are 10⁻¹² of the seed at threshold. When the pump comes
  // back, the solver must follow the photons up from that level; measured
  // for ε from 10⁻⁶ to 2×10⁻⁴ and x from 1.01 to 50, it can from 10⁻²⁰ but
  // not from 10⁻³⁰, so 10⁻¹² leaves a wide margin.
  var Y_FLOOR = 1e-12;

  // The numbers that link the dimensionless state to physics (§4.1, §11.2).
  // scales({ sigma, tau, nu, l_g, area, L_e, refl1, refl2, alpha_i })
  function scales(params) {
    var where = at("scales");
    check.params(where, params, ["sigma", "tau", "nu", "l_g", "area", "L_e", "refl1", "refl2", "alpha_i"]);
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
    var N_c = gamma / (sigma * l_g);         // threshold inversion, = ΔN_th (§4.1)
    var V = area * L_e;                      // mode volume
    var V_a = area * l_g;                    // active volume
    var B = sigma * c / V;                   // s⁻¹ (§4.1)
    var pOnePhoton = B * tau;                // p = Bτ·φ with φ = 1
    // γ₂ = −ln R₂, the output coupler's share of the loss. Math.abs so a
    // perfect mirror gives +0 (−ln 1 would be −0, shown as "−0 W").
    var gammaOut = Math.abs(Math.log(refl2));
    // Photons leave through mirror 2 at the rate cγ₂/(2L_e) (§4.1).
    var outputRate = c * gammaOut / (2 * L_e);

    return {
      gamma: gamma,
      tau_c: tau_c,
      N_c: N_c,
      R_c: N_c / tau,                        // pump rate at threshold, m⁻³ s⁻¹
      V: V,
      V_a: V_a,
      B: B,
      eps: tau_c / tau,
      pOnePhoton: pOnePhoton,
      sOnePhoton: Math.log(pOnePhoton),
      phiPerP: 1 / pOnePhoton,               // photons per unit of p
      powerPerP: h * nu * outputRate / pOnePhoton   // W per unit of p
    };
  }

  // The right-hand side of §11.2 with s = ln p (§11.3), for ode.dopri5.
  // derivatives({ x, eps, beta })  ->  f(tPrime, [y, s]) -> [dy/dt′, ds/dt′]
  // The inputs are checked here, once; f itself checks nothing, because
  // the solver calls it about 10⁵ times per frame.
  function derivatives(params) {
    var where = at("derivatives");
    check.params(where, params, ["x", "eps", "beta"]);
    var x = check.atLeast(where, "x", params.x, 0);
    var eps = check.positive(where, "eps", params.eps);
    var beta = check.between(where, "beta", params.beta, 0, 1);
    var logBeta = Math.log(beta);            // used only when β > 0

    return function (tPrime, state) {
      var y = state[0];
      var s = state[1];
      // The seed βy/p = βy·e^(−s), computed as one exponential,
      // e^(ln β + ln y − s) (§11.3). Written as β·y·e^(−s), the factor
      // e^(−s) overflows once s < −709 even when the product is about 1
      // (pump off: y falls and s follows ln(βy) down), and with β = 0 the
      // product would be 0·Infinity = NaN. No seed with β = 0, or with
      // y ≤ 0 (no excited atoms; or a solver trial a hair below 0).
      var seed = 0;
      if (beta > 0 && y > 0) {
        seed = Math.exp(logBeta + Math.log(y) - s);
      }
      return [x - y - y * Math.exp(s), ((y - 1) + seed) / eps];
    };
  }

  // The steady state, with the seed: from dy/dt′ = 0 and ds/dt′ = 0,
  //   p = ((x − 1) + √((x − 1)² + 4βx)) / 2,   y = x/(1 + p).
  // Above threshold p ≈ x − 1 and y ≈ 1; below it p ≈ βx/(1 − x), the
  // seed level, and y ≈ x.
  // steadyState({ x, beta })  ->  { y, p }
  function steadyState(params) {
    var where = at("steadyState");
    check.params(where, params, ["x", "beta"]);
    var x = check.atLeast(where, "x", params.x, 0);
    var beta = check.between(where, "beta", params.beta, 0, 1);
    var squareRoot = Math.sqrt((x - 1) * (x - 1) + 4 * beta * x);
    // Below threshold (x − 1) + squareRoot subtracts two nearly equal
    // numbers; the same value written as 2βx/(squareRoot − (x − 1)) does not.
    var p = x >= 1 ? ((x - 1) + squareRoot) / 2 : 2 * beta * x / (squareRoot - (x - 1));
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
    var where = at("relaxation");
    check.params(where, params, ["x", "tau", "tau_c"]);
    var x = check.finite(where, "x", params.x);
    if (x <= 1) {
      check.fail(where, "x must be above 1: below threshold there is no laser light to oscillate, got " + x + ".");
    }
    var tau = check.positive(where, "tau", params.tau);
    var tau_c = check.positive(where, "tau_c", params.tau_c);
    var omegaR = Math.sqrt((x - 1) / (tau * tau_c));
    var dampingRate = x / (2 * tau);
    var squared = omegaR * omegaR - dampingRate * dampingRate;
    return {
      omegaR: omegaR,
      omegaDamped: squared > 0 ? Math.sqrt(squared) : 0,
      t_damp: 1 / dampingRate
    };
  }

  // Raises the photons to at least the seed level, p ≥ β·max(y, 10⁻¹²):
  // the photons one photon lifetime of spontaneous emission feeds in, which
  // is where the real photon number gets within about τ_c anyway. Call it
  // before every solver call: a state at or above that level (a laser that
  // runs, the below-threshold steady state, the one-photon start, any state
  // with β = 0) comes back unchanged, and a state below it (β just turned
  // on, the pump back after a long time off) would otherwise stop the
  // solver. y is never changed.
  // liftToSeed({ state, beta })  ->  a new [y, s]
  function liftToSeed(params) {
    var where = at("liftToSeed");
    check.params(where, params, ["state", "beta"]);
    var state = check.finiteArray(where, "state", params.state);
    if (state.length !== 2) {
      check.fail(where, "state must be [y, s], got " + check.describe(state) + ".");
    }
    var beta = check.between(where, "beta", params.beta, 0, 1);
    var y = state[0];
    var s = state[1];
    if (beta === 0) return [y, s];
    var seedLevel = Math.log(beta) + Math.log(Math.max(y, Y_FLOOR));
    return [y, Math.max(s, seedLevel)];
  }

  E.rates = Object.freeze({
    fourLevel: Object.freeze({
      scales: scales,
      derivatives: derivatives,
      steadyState: steadyState,
      relaxation: relaxation,
      liftToSeed: liftToSeed
    })
  });
})(this);
