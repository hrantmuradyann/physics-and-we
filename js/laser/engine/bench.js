/* ============================================================================
   bench.js — the one engine file the laser page talks to.

   The page describes what is on the bench in one "config" object; this
   file turns it into the still numbers (derive) and moves the simulation
   on in time (advance). It is built from the other engine files and adds
   only the pump (§6.3) and the bookkeeping between them.

     LaserEngine.bench.defaultConfig()   a new config: the default bench
     LaserEngine.bench.derive(config)    threshold, output power, best
                                         coupler, … (SI units)
     LaserEngine.bench.start()           the simulation at the moment the
                                         pump is switched on: { t, N, lnPhi }
     LaserEngine.bench.advance({ sim, config, seconds, maxSteps })
                                         -> { sim, reachedEnd, steps }
     LaserEngine.bench.RANGES            the sliders' physical ranges

   THE CONFIG (all SI)
     medium     an id from media.js (four-level, with a cross section)
     l_g        rod length, m              area   mode area A, m²
     L          mirror spacing, m          refl1, refl2   mirror reflectivities
     alpha_i    internal loss, m⁻¹         beta   share of spontaneous
                                                  emission into the mode
     pumpPower  ABSORBED pump power, W     pumpLam  pump wavelength, m
     eta        share of absorbed pump photons that reach the upper level

   THE MODEL (docs/laser-physics.md §4.1, §6.3)
   The pump is spread evenly over the active volume V_a = A·l (the
   plane-wave rate equations of §4.1): R_p = η·P/(hν_p·V_a). With A = πw²
   this gives the Fan–Byer threshold of §6.3 for a pump spot matched to the
   mode, which is how it is tested.

   THE SIMULATION STATE  { t, N, lnPhi }
   Physical, not the solver's y and s: t in s, the inversion N in m⁻³,
   lnPhi = ln φ (φ = photons in the mode). Every slider changes the scales
   that turn N and φ into y and s, but not the atoms and photons, so they
   are kept and converted again on each call. ln φ, not φ, because the
   solver works with ln φ, and because φ has no lower limit of its own:
   with β = 0 it falls without end (e^(−1600) before threshold), and with
   the pump off it settles at the seed floor's level (rates.js), φ ≈ 10⁻⁹
   for the default bench. Each call lets the solver choose its first step
   again, which costs a settled laser a few steps a call (stage 7a; with
   dopri5, carrying the step size saved only 2–8 %, stage 6).

   Tests: tests/laser/bench.test.js
   ========================================================================== */
(function (root) {
  "use strict";

  var E = root.LaserEngine = root.LaserEngine || {};
  var check = E.check;
  var U = E.units;
  var nm = E.constants.nm;

  var CONFIG_NAMES = ["medium", "l_g", "area", "L", "refl1", "refl2", "alpha_i",
    "pumpPower", "pumpLam", "eta", "beta"];
  var SIM_NAMES = ["t", "N", "lnPhi"];

  // A cavity losing less than this per pass keeps its photons for seconds
  // (τ_c = L_e/(cγ)); it is refused here, with this file's name in the
  // message, before rates.js would refuse it with its own.
  var MIN_LOSS = 1e-9;

  function at(functionName) {
    return "LaserEngine.bench." + functionName;
  }

  /* ---------- the config ---------- */

  // Checks a config and returns the medium it names. Every check is made
  // here, so an error always names the function the page called.
  function readConfig(where, config) {
    check.params(where, config, CONFIG_NAMES);
    var ids = E.media.list();
    if (typeof config.medium !== "string" || ids.indexOf(config.medium) === -1) {
      check.fail(where, "medium must be one of " + ids.join(", ") + ", got " +
        check.describe(config.medium) + ".");
    }
    var medium = E.media.get(config.medium);
    if (medium.scheme !== "four-level" || medium.sigma === null) {
      check.fail(where, "medium " + config.medium + " cannot be simulated yet: the bench runs " +
        "four-level media with a known cross section only.");
    }
    var l_g = check.positive(where, "l_g", config.l_g);
    check.positive(where, "area", config.area);
    var L = check.positive(where, "L", config.L);
    if (l_g > L) {
      check.fail(where, "l_g (" + l_g + " m) is longer than the cavity (L = " + L + " m).");
    }
    var refl1 = check.reflectivity(where, "refl1", config.refl1);
    var refl2 = check.reflectivity(where, "refl2", config.refl2);
    var alpha_i = check.atLeast(where, "alpha_i", config.alpha_i, 0);
    var loss = alpha_i * l_g - 0.5 * (Math.log(refl1) + Math.log(refl2));
    if (!(loss >= MIN_LOSS)) {
      check.fail(where, "the cavity loses almost no light (γ = " + loss + " per pass, below " +
        MIN_LOSS + "), so its photons would live for seconds. Lower a mirror's reflectivity " +
        "or add internal loss.");
    }
    check.atLeast(where, "pumpPower", config.pumpPower, 0);
    var pumpLam = check.positive(where, "pumpLam", config.pumpLam);
    if (pumpLam >= medium.lam) {
      check.fail(where, "pumpLam (" + pumpLam + " m) must be shorter than the laser line (" +
        medium.lam + " m): a pump photon must carry more energy than the laser photon it makes.");
    }
    var eta = check.between(where, "eta", config.eta, 0, 1);
    if (eta === 0) check.fail(where, "eta must be above 0: with none of the pump reaching the upper level nothing happens.");
    check.between(where, "beta", config.beta, 0, 1);
    return medium;
  }

  // The still numbers of a checked config (see derive below).
  function compute(config, medium) {
    var L_e = E.cavity.effectiveLength({ L: config.L, l_g: config.l_g, nGroup: medium.nGroup });
    var scales = E.rates.fourLevel.scales({
      sigma: medium.sigma, tau: medium.tau, nu: medium.nu, l_g: config.l_g, area: config.area,
      L_e: L_e, refl1: config.refl1, refl2: config.refl2, alpha_i: config.alpha_i
    });
    var gth = E.cavity.thresholdGain({
      refl1: config.refl1, refl2: config.refl2, alpha_i: config.alpha_i, l_g: config.l_g
    });

    // The pump (§4.1, §6.3): absorbed photons per second and m³, of which
    // the share η reaches the upper level.
    var pumpPhoton = U.photonEnergy(config.pumpLam);
    var V_a = config.area * config.l_g;
    var R_p = config.eta * config.pumpPower / (pumpPhoton * V_a);
    var x = R_p / scales.R_c;                          // pump / threshold
    var pumpThreshold = scales.R_c * pumpPhoton * V_a / config.eta;
    // Output above threshold, (γ₂/2)·A·I_sat·(x − 1) (§4.1); none below.
    var P_out = x > 1 ? scales.powerPerP * (x - 1) : 0;

    // The best output coupler (§3.6), with L_i = 2α_i·l, the round-trip
    // form of the internal loss in γ ≈ (T + L_i)/2. optimumCoupler refuses
    // a gain so high that it would ask for T ≥ 1; the bench then has no
    // low-gain answer to show.
    var g0 = medium.sigma * R_p * medium.tau;
    var L_i = 2 * config.alpha_i * config.l_g;
    var T_opt = null;
    if (L_i > 0 && L_i < 1) {
      var roundTripGain = 2 * g0 * config.l_g;
      if (roundTripGain <= L_i || Math.sqrt(roundTripGain * L_i) - L_i < 1) {
        T_opt = E.cavity.optimumCoupler({ g0: g0, l_g: config.l_g, L_i: L_i });
      }
    }
    // Where this model's P_out(T) peaks. Its coupler loss is γ₂ = −ln(1 − T),
    // and in γ₂ its P_out is exactly the low-gain curve of §3.6, which peaks
    // at γ₂ = T_opt. §3.6's T is the small-loss form of γ₂.
    var T_best = T_opt === null ? null : 1 - Math.exp(-T_opt);

    // Relaxation oscillations (§4.2), only above threshold.
    var period = null;
    var t_damp = null;
    if (x > 1) {
      var relaxation = E.rates.fourLevel.relaxation({ x: x, tau: medium.tau, tau_c: scales.tau_c });
      if (relaxation.omegaDamped > 0) period = 2 * Math.PI / relaxation.omegaDamped;
      t_damp = relaxation.t_damp;
    }

    return {
      medium: medium.id,
      lam: medium.lam,
      tau: medium.tau,
      I_sat: medium.I_sat,
      L_e: L_e,
      gamma: scales.gamma,
      gth: gth,
      N_c: scales.N_c,
      R_c: scales.R_c,
      tau_c: scales.tau_c,
      eps: scales.eps,
      R_p: R_p,
      x: x,
      g0: g0,
      pumpThreshold: pumpThreshold,
      slope: scales.powerPerP / pumpThreshold,     // W of output per W of pump
      powerPerP: scales.powerPerP,                 // the output at x = 2
      powerPerPhoton: scales.powerPerP * scales.pOnePhoton,
      sOnePhoton: scales.sOnePhoton,
      P_out: P_out,
      T_opt: T_opt,
      T_best: T_best,
      period: period,
      t_damp: t_damp,
      beta: config.beta
    };
  }

  // derive(config) -> the still numbers of the bench, in SI:
  //   L_e, gamma (single pass), gth, N_c, R_c, tau_c, eps, R_p, x, g0,
  //   pumpThreshold (W), slope, powerPerP, powerPerPhoton, sOnePhoton,
  //   P_out (W, steady), T_opt and T_best (null with no internal loss),
  //   period and t_damp (s, null at or below threshold), and the medium's
  //   id, lam, tau, I_sat, and beta.
  function derive(config) {
    var where = at("derive");
    return compute(config, readConfig(where, config));
  }

  /* ---------- the simulation ---------- */

  function start() {
    return { t: 0, N: 0, lnPhi: 0 };                    // one photon: ln 1 = 0
  }

  function readSim(where, sim) {
    check.params(where, sim, SIM_NAMES);
    check.atLeast(where, "sim.t", sim.t, 0);
    check.atLeast(where, "sim.N", sim.N, 0);
    check.finite(where, "sim.lnPhi", sim.lnPhi);
    return sim;
  }

  // advance({ sim, config, seconds, maxSteps }) -> { sim, reachedEnd, steps }
  // Moves the simulation `seconds` of simulated time on, with at most
  // maxSteps solver steps (accepted or rejected). Out of steps, it stops
  // where it got to: reachedEnd is false, and the next call carries on.
  function advance(params) {
    var where = at("advance");
    check.params(where, params, ["sim", "config", "seconds", "maxSteps"]);
    var sim = readSim(where, params.sim);
    var medium = readConfig(where, params.config);
    var seconds = check.atLeast(where, "seconds", params.seconds, 0);
    var maxSteps = check.integerAtLeast(where, "maxSteps", params.maxSteps, 1);
    if (seconds === 0) {
      return {
        sim: { t: sim.t, N: sim.N, lnPhi: sim.lnPhi },
        reachedEnd: true,
        steps: 0
      };
    }

    var d = compute(params.config, medium);
    var fourLevel = E.rates.fourLevel;
    // Into the solver's variables (§11.2): y = N/N_c, s = ln p = ln φ + ln(Bτ).
    var state = fourLevel.liftToSeed({
      state: [sim.N / d.N_c, sim.lnPhi + d.sOnePhoton],
      beta: d.beta
    });
    // The implicit solver: below threshold the photons sit at their seed
    // level, where dopri5's step would stay below 3.3ε/(1 − y) (§11.3).
    var run = E.ode.rosenbrock({
      f: fourLevel.derivatives({ x: d.x, eps: d.eps, beta: d.beta }),
      t0: 0,
      state0: state,
      t1: seconds / d.tau,                              // t′ = t/τ
      maxSteps: maxSteps
    });

    return {
      sim: {
        t: run.reachedEnd ? sim.t + seconds : sim.t + run.t * d.tau,
        // With the pump off y decays below the solver's atol, where its
        // error control stops watching it, and a step can end a hair below
        // 0 (measured: 30 % coupler, after 35τ). The next call would refuse it.
        N: Math.max(0, run.state[0]) * d.N_c,
        lnPhi: run.state[1] - d.sOnePhoton
      },
      reachedEnd: run.reachedEnd,
      steps: run.accepted + run.rejected
    };
  }

  /* ---------- the default bench and the sliders ---------- */

  // Stage 4's small Nd:YAG laser with a pump (docs/laser-plan.md, stage 6):
  // rod 5 cm, mode area 1 mm², mirrors 0.3 m apart, a 5 % output coupler,
  // scattering 0.2 m⁻¹ (L_i = 2 %: with none there is no best coupler,
  // §3.6), 808 nm diodes with η = 0.9 (§6.3), β = 10⁻⁸ (§4.1's range).
  function defaultConfig() {
    return {
      medium: "nd-yag",
      l_g: 0.05,
      area: 1e-6,
      L: 0.3,
      refl1: 1,
      refl2: 0.95,
      alpha_i: 0.2,
      pumpPower: 5,
      pumpLam: 808 * nm,
      eta: 0.9,
      beta: 1e-8
    };
  }

  E.bench = Object.freeze({
    RANGES: Object.freeze({
      pumpPower: Object.freeze({ min: 0, max: 20, log: false }),     // W, absorbed
      T_oc: Object.freeze({ min: 0.005, max: 0.3, log: true })       // output coupler
    }),
    defaultConfig: defaultConfig,
    derive: derive,
    start: start,
    advance: advance
  });
})(this);
