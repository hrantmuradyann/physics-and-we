/* ============================================================================
   bench.js — the one engine file the laser page talks to.

   The page describes what is on the bench in one "config" object; this
   file turns it into the still numbers (derive) and moves the simulation
   on in time (advance). It is built from the other engine files and adds
   only the pump (§6), the setups of each medium, and the bookkeeping
   between them.

     LaserEngine.bench.pumpsFor(medium)   the pumps the bench runs a medium
                                          with, in the dropdown's order
                                          ([] for one it cannot run yet)
     LaserEngine.bench.configFor({ medium, pump })   a new config: that setup
     LaserEngine.bench.controls(config)   the sliders of that bench:
                                          { pump: { name, min, max, log },
                                            coupler: { min, max, log } }
     LaserEngine.bench.defaultConfig()    a new config: the default bench
                                          (Nd:YAG with diodes)
     LaserEngine.bench.derive(config)     threshold, output power, best
                                          coupler, … (SI units)
     LaserEngine.bench.start(config)      the simulation at the moment the
                                          bench is switched on:
                                          { t, N, lnPhi, flash }
     LaserEngine.bench.fire({ sim, config })   a copy with a flash of the
                                          config's energy fired now
     LaserEngine.bench.advance({ sim, config, seconds, maxSteps })
                                          -> { sim, reachedEnd, steps }
     LaserEngine.bench.pumpNow({ sim, config })   the pump at the moment
                                          of sim: { x, w, smallSignal }
     LaserEngine.bench.flashThreshold(config)   the smallest flash energy
                                          that reaches threshold (J), or null

   THE CONFIG (all SI)
     medium     an id from media.js       pump   "diode", "laser" (both
                                                 continuous light),
                                                 "flashlamp" or "discharge"
     l_g        rod length, m              area   mode area A, m²
     L          mirror spacing, m          refl1, refl2   mirror reflectivities
     alpha_i    internal loss, m⁻¹         beta   share of spontaneous
                                                  emission into the mode
   and, by pump:
     diode, laser   pumpPower  ABSORBED pump power, W
                    pumpLam    pump wavelength, m
                    eta        share of absorbed pump photons that reach
                               the upper level
     flashlamp      flashEnergy  electrical energy of one flash, J
                    flashShare   the share of it the unpumped rod absorbs
                    flashTime    t_p of the flash's shape (pumps.js), s
                    pumpLam, eta as above
     discharge      current      A
                    currentPeak  the current of the highest gain (He-Ne,
                                 CO₂) or the rated current (Ar⁺), A
                    gainPeak     the small-signal gain there, m⁻¹
   The discharge's law is the medium's ("optimum" or "square", pumps.js).

   THE MODEL (docs/laser-physics.md §4.1, §6)
   The pump is spread evenly over the active volume V_a = A·l (the
   plane-wave rate equations of §4.1), and it is set for the unpumped
   medium, as a lamp sets it whatever the populations are:
     four levels            R_p = η·P/(hν_p·V_a),       x = R_p/R_c
     three and two levels   W_p = η·P/(hν_p·N_t·V_a),   w = W_p·τ
   with P the absorbed power (a flash: flashShare × the lamp's power). With
   A = πw² this gives the Fan–Byer threshold of §6.3 for a pump spot
   matched to the mode, which is how it is tested. A discharge sets the
   small-signal gain itself: x = g₀(I)·l/γ.

   THE SIMULATION STATE  { t, N, lnPhi, flash }
   Physical, not the solver's y and s: t in s, the inversion N in m⁻³ (for
   three and two levels ΔN = N₂ − N₁, from −N_t with every ion down),
   lnPhi = ln φ (φ = photons in the mode), and flash, the last flash fired:
   null (none yet) or { at, flashEnergy, flashTime }, its time and the
   energy and t_p it was fired with, so a slider moved after Fire changes
   the next flash, not the one that is running. Every slider changes the
   scales that turn N and φ into y and s, but not the atoms and photons,
   so they are kept and converted again on each call. ln φ, not φ, because the solver works
   with ln φ, and because φ has no lower limit of its own: with β = 0 it
   falls without end (e^(−1600) before threshold), and with the pump off
   it settles at the seed floor's level (rates.js), φ ≈ 10⁻⁹ for the
   default bench. Each call lets the solver choose its first step again,
   which costs a settled laser a few steps a call (stage 7a; with dopri5,
   carrying the step size saved only 2–8 %, stage 6).

   Tests: tests/laser/bench.test.js, tests/laser/bench-pumps.test.js
   ========================================================================== */
(function (root) {
  "use strict";

  var E = root.LaserEngine = root.LaserEngine || {};
  var check = E.check;
  var U = E.units;
  var nm = E.constants.nm;
  var um = E.constants.um;
  var mm = E.constants.mm;
  var cm = E.constants.cm;
  var mm2 = E.constants.mm2;
  var ms = E.constants.ms;
  var mA = E.constants.mA;

  var COMMON_NAMES = ["medium", "pump", "l_g", "area", "L", "refl1", "refl2", "alpha_i", "beta"];
  var PUMP_NAMES = {
    diode: ["pumpPower", "pumpLam", "eta"],
    laser: ["pumpPower", "pumpLam", "eta"],
    flashlamp: ["flashEnergy", "flashShare", "flashTime", "pumpLam", "eta"],
    discharge: ["current", "currentPeak", "gainPeak"]
  };
  // The config field each pump's slider sets.
  var CONTROL_NAMES = { diode: "pumpPower", laser: "pumpPower", flashlamp: "flashEnergy", discharge: "current" };
  var SIM_NAMES = ["t", "N", "lnPhi", "flash"];
  var FLASH_NAMES = ["at", "flashEnergy", "flashTime"];

  // A cavity losing less than this per pass keeps its photons for seconds
  // (τ_c = L_e/(cγ)); it is refused here, with this file's name in the
  // message, before rates.js would refuse it with its own.
  var MIN_LOSS = 1e-9;

  // The flash's t_p for every lamp: 0.73 ms at half its peak, the owner's
  // "about 1 ms" (docs/laser-plan.md, stage 7b).
  var FLASH_TIME = 0.3 * ms;
  var FLASH_SHARE = 0.12;    // the book's 10–15 % of the lamp's light (§6.1)
  var BETA = 1e-8;           // §4.1's range, 10⁻⁸–10⁻⁴

  // The output coupler's slider, T = 1 − R₂, for every setup: up to
  // ruby's 50 % (§3.1) and a little more.
  var COUPLER_RANGE = { min: 0.005, max: 0.6, log: true };

  // The two-level atom absorbs at its own line: there is no other level.
  var TWO_LEVEL_LINE = E.media.get("two-level").lam;

  // Every medium and pump the bench runs, in the order of the dropdowns
  // (docs/laser-plan.md, stage 7b, where each number is explained). max is
  // the pump slider's top; a discharge's comes from its law (pumps.js).
  var SETUPS = [
    // §3.1's ruby: rod 10 cm, 1 cm across. Lamp light absorbed in the green
    // band, η = 0.7 (not verified). Threshold about 640 J.
    { medium: "ruby", pump: "flashlamp", max: 3000,
      config: { l_g: 10 * cm, area: Math.PI * (5 * mm) * (5 * mm), L: 50 * cm, refl1: 1, refl2: 0.5, alpha_i: 0,
        flashEnergy: 1000, flashShare: FLASH_SHARE, flashTime: FLASH_TIME, pumpLam: 550 * nm, eta: 0.7 } },
    // Threshold about 29 J.
    { medium: "nd-glass", pump: "flashlamp", max: 300,
      config: { l_g: 10 * cm, area: Math.PI * (5 * mm) * (5 * mm), L: 50 * cm, refl1: 1, refl2: 0.8, alpha_i: 0.2,
        flashEnergy: 100, flashShare: FLASH_SHARE, flashTime: FLASH_TIME, pumpLam: 808 * nm, eta: 0.9 } },
    // Stage 4's small Nd:YAG laser (stage 6): rod 5 cm, mode area 1 mm²,
    // a 5 % output coupler, scattering 0.2 m⁻¹ (L_i = 2 %: with none there
    // is no best coupler, §3.6), 808 nm diodes with η = 0.9 (§6.3).
    { medium: "nd-yag", pump: "diode", max: 20,
      config: { l_g: 5 * cm, area: 1 * mm2, L: 30 * cm, refl1: 1, refl2: 0.95, alpha_i: 0.2,
        pumpPower: 5, pumpLam: 808 * nm, eta: 0.9 } },
    // Rod 7.5 cm, 6 mm across. Threshold about 1.3 J.
    { medium: "nd-yag", pump: "flashlamp", max: 50,
      config: { l_g: 7.5 * cm, area: Math.PI * (3 * mm) * (3 * mm), L: 30 * cm, refl1: 1, refl2: 0.8, alpha_i: 0.2,
        flashEnergy: 10, flashShare: FLASH_SHARE, flashTime: FLASH_TIME, pumpLam: 808 * nm, eta: 0.9 } },
    // The tube fills the cavity. 15.5 %/m (0.144 m⁻¹) at 5 mA; 0.43 mW there.
    { medium: "he-ne", pump: "discharge", law: "optimum",
      config: { l_g: 30 * cm, area: 0.2 * mm2, L: 30 * cm, refl1: 0.999, refl2: 0.99, alpha_i: 0.01,
        current: 5 * mA, currentPeak: 5 * mA, gainPeak: 0.144 } },
    // 10 dB/m (2.3 m⁻¹) at the rated 40 A (0.45 W there); the slider
    // starts at 30 A. Tube and cavity 1 m.
    { medium: "ar-ion", pump: "discharge", law: "square",
      config: { l_g: 100 * cm, area: 1.8 * mm2, L: 100 * cm, refl1: 1, refl2: 0.95, alpha_i: 0.01,
        current: 30, currentPeak: 40, gainPeak: 2.3 } },
    // 1.1 %/cm (1.1 m⁻¹) at 20 mA; about 8 W.
    { medium: "co2", pump: "discharge", law: "optimum",
      config: { l_g: 80 * cm, area: 50 * mm2, L: 80 * cm, refl1: 1, refl2: 0.8, alpha_i: 0.005,
        current: 20 * mA, currentPeak: 20 * mA, gainPeak: 1.1 } },
    // A 0.2 mm dye jet, a 15 µm spot (700 µm²), pumped at 532 nm.
    // Threshold 42 mW.
    { medium: "dye-r6g", pump: "laser", max: 10,
      config: { l_g: 0.2 * mm, area: 700 * um * um, L: 50 * cm, refl1: 1, refl2: 0.97, alpha_i: 5,
        pumpPower: 2, pumpLam: 532 * nm, eta: 1 } },
    // A 5 mm crystal, a 30 µm spot (2800 µm²), pumped at 532 nm.
    // Threshold 0.15 W.
    { medium: "ti-sapphire", pump: "laser", max: 10,
      config: { l_g: 5 * mm, area: 2800 * um * um, L: 150 * cm, refl1: 1, refl2: 0.97, alpha_i: 0.5,
        pumpPower: 5, pumpLam: 532 * nm, eta: 1 } },
    // Ruby's numbers in a small sample, pumped by light at its own line.
    { medium: "two-level", pump: "laser", max: 1000,
      config: { l_g: 1 * cm, area: 1 * mm2, L: 10 * cm, refl1: 1, refl2: 0.9, alpha_i: 0,
        pumpPower: 100, pumpLam: TWO_LEVEL_LINE, eta: 1 } },
    { medium: "two-level", pump: "flashlamp", max: 10,
      config: { l_g: 1 * cm, area: 1 * mm2, L: 10 * cm, refl1: 1, refl2: 0.9, alpha_i: 0,
        flashEnergy: 2, flashShare: FLASH_SHARE, flashTime: FLASH_TIME, pumpLam: TWO_LEVEL_LINE, eta: 1 } }
  ];

  function at(functionName) {
    return "LaserEngine.bench." + functionName;
  }

  /* ---------- the setups ---------- */

  // Checks a medium id and returns the medium.
  function readMedium(where, id) {
    var ids = E.media.list();
    if (typeof id !== "string" || ids.indexOf(id) === -1) {
      check.fail(where, "medium must be one of " + ids.join(", ") + ", got " + check.describe(id) + ".");
    }
    return E.media.get(id);
  }

  function pumpsOf(id) {
    var pumps = [];
    SETUPS.forEach(function (setup) {
      if (setup.medium === id) pumps.push(setup.pump);
    });
    return pumps;
  }

  // The medium and the setup of a medium and pump, checked:
  // -> { medium (a copy from media.js), setup }
  function findSetup(where, id, pump) {
    var medium = readMedium(where, id);
    var pumps = [];
    var found = null;
    SETUPS.forEach(function (setup) {
      if (setup.medium !== id) return;
      pumps.push(setup.pump);
      if (setup.pump === pump) found = setup;
    });
    if (pumps.length === 0) {
      check.fail(where, "medium " + id + " cannot be simulated yet: its model is a later build stage.");
    }
    if (found === null) {
      check.fail(where, "pump must be one of " + pumps.join(", ") + " for " + id + ", got " +
        check.describe(pump) + ".");
    }
    return { medium: medium, setup: found };
  }

  // pumpsFor(medium) -> ["diode", "flashlamp"], a new array
  function pumpsFor(medium) {
    readMedium(at("pumpsFor"), medium);
    return pumpsOf(medium);
  }

  // configFor({ medium, pump }) -> a new config
  function configFor(params) {
    var where = at("configFor");
    check.params(where, params, ["medium", "pump"]);
    var setup = findSetup(where, params.medium, params.pump).setup;
    var config = { medium: setup.medium, pump: setup.pump };
    Object.keys(setup.config).forEach(function (name) {
      config[name] = setup.config[name];
    });
    config.beta = BETA;
    return config;
  }

  // controls(config) -> { pump: { name, min, max, log }, coupler: { min, max, log } }
  // The pump slider sets the config field `name`; a discharge's top is the
  // highest current its law allows for this config's currentPeak. The
  // coupler slider sets T = 1 − refl2.
  function controls(config) {
    var read = readConfig(at("controls"), config);
    var setup = read.setup;
    var top = setup.max;
    if (setup.pump === "discharge") {
      top = E.pumps.dischargeMax({ law: setup.law, currentPeak: config.currentPeak });
    }
    return {
      pump: { name: CONTROL_NAMES[setup.pump], min: 0, max: top, log: false },
      coupler: { min: COUPLER_RANGE.min, max: COUPLER_RANGE.max, log: COUPLER_RANGE.log }
    };
  }

  function defaultConfig() {
    return configFor({ medium: "nd-yag", pump: "diode" });
  }

  /* ---------- the config ---------- */

  // Checks a config and returns { medium, setup }. Every check is made
  // here, so an error always names the function the page called.
  function readConfig(where, config) {
    if (config === null || typeof config !== "object" || Array.isArray(config)) {
      check.params(where, config, COMMON_NAMES);       // says it needs one object
    }
    var found = findSetup(where, config.medium, config.pump);
    var setup = found.setup;
    var medium = found.medium;
    check.params(where, config, COMMON_NAMES.concat(PUMP_NAMES[setup.pump]));

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
    check.between(where, "beta", config.beta, 0, 1);

    if (setup.pump === "discharge") {
      check.atLeast(where, "current", config.current, 0);
      check.positive(where, "currentPeak", config.currentPeak);
      check.positive(where, "gainPeak", config.gainPeak);
      var highest = E.pumps.dischargeMax({ law: setup.law, currentPeak: config.currentPeak });
      if (config.current > highest) {
        check.fail(where, "current (" + config.current + " A) must be at most " + highest + " A for " +
          medium.id + (setup.law === "optimum" ? ": past that the discharge gives no gain." :
          ": the tube's rated current."));
      }
      return { medium: medium, setup: setup };
    }

    if (setup.pump === "flashlamp") {
      check.atLeast(where, "flashEnergy", config.flashEnergy, 0);
      var share = check.between(where, "flashShare", config.flashShare, 0, 1);
      if (share === 0) check.fail(where, "flashShare must be above 0: a rod that absorbs none of the flash is not pumped.");
      check.positive(where, "flashTime", config.flashTime);
    } else {
      check.atLeast(where, "pumpPower", config.pumpPower, 0);
    }
    var pumpLam = check.positive(where, "pumpLam", config.pumpLam);
    if (medium.scheme === "two-level") {
      if (Math.abs(pumpLam - medium.lam) > 1e-9 * medium.lam) {
        check.fail(where, "pumpLam (" + pumpLam + " m) must be the line itself (" + medium.lam +
          " m): two levels can absorb only at the line they emit.");
      }
    } else if (pumpLam >= medium.lam) {
      check.fail(where, "pumpLam (" + pumpLam + " m) must be shorter than the laser line (" +
        medium.lam + " m): a pump photon must carry more energy than the laser photon it makes.");
    }
    var eta = check.between(where, "eta", config.eta, 0, 1);
    if (eta === 0) check.fail(where, "eta must be above 0: with none of the pump reaching the upper level nothing happens.");
    return { medium: medium, setup: setup };
  }

  /* ---------- the still numbers ---------- */

  // The pump in the solver's units for `power` W absorbed (§4.1): x for
  // four levels, w = W_p·τ for three and two, both set for the unpumped
  // medium.
  function pumpLevel(d, config, power) {
    var perVolume = config.eta * power / (U.photonEnergy(config.pumpLam) * config.area * config.l_g);
    if (d.scheme === "four-level") return perVolume / d.R_c;      // R_p/R_c
    return perVolume * d.tau / d.N_t;                              // W_p·τ
  }

  // The numbers of a four-level laser with a steady pump x and its small-
  // signal gain g0, into d: the output, the best coupler and the
  // relaxation oscillations.
  function steadyFourLevel(d, config, g0) {
    var x = d.x;
    // Output above threshold, (γ₂/2)·A·I_sat·(x − 1) (§4.1); none below.
    d.P_out = x > 1 ? d.powerPerP * (x - 1) : 0;
    d.ySteady = E.rates.fourLevel.steadyState({ x: x, beta: config.beta }).y;

    // The best output coupler (§3.6), with L_i = 2α_i·l, the round-trip
    // form of the internal loss in γ ≈ (T + L_i)/2. optimumCoupler refuses
    // a gain so high that it would ask for T ≥ 1; the bench then has no
    // low-gain answer to show.
    var L_i = 2 * config.alpha_i * config.l_g;
    var T_opt = null;
    if (L_i > 0 && L_i < 1) {
      var roundTripGain = 2 * g0 * config.l_g;
      if (roundTripGain <= L_i || Math.sqrt(roundTripGain * L_i) - L_i < 1) {
        T_opt = E.cavity.optimumCoupler({ g0: g0, l_g: config.l_g, L_i: L_i });
      }
    }
    d.T_opt = T_opt;
    // Where this model's P_out(T) peaks. Its coupler loss is γ₂ = −ln(1 − T),
    // and in γ₂ its P_out is exactly the low-gain curve of §3.6, which peaks
    // at γ₂ = T_opt. §3.6's T is the small-loss form of γ₂.
    d.T_best = T_opt === null ? null : 1 - Math.exp(-T_opt);

    // Relaxation oscillations (§4.2), only above threshold.
    if (x > 1) {
      var relaxation = E.rates.fourLevel.relaxation({ x: x, tau: d.tau, tau_c: d.tau_c });
      if (relaxation.omegaDamped > 0) d.period = 2 * Math.PI / relaxation.omegaDamped;
      d.t_damp = relaxation.t_damp;
    }
  }

  // The still numbers of a checked config (see derive below).
  function compute(where, config, medium, setup) {
    var fourLevel = medium.scheme === "four-level";
    var L_e = E.cavity.effectiveLength({ L: config.L, l_g: config.l_g, nGroup: medium.nGroup });
    var inputs = {
      sigma: medium.sigma, tau: medium.tau, nu: medium.nu, l_g: config.l_g, area: config.area,
      L_e: L_e, refl1: config.refl1, refl2: config.refl2, alpha_i: config.alpha_i
    };
    var scales;
    if (fourLevel) {
      scales = E.rates.fourLevel.scales(inputs);
    } else {
      inputs.N_t = medium.N_t;
      scales = E.rates.threeLevel.scales(inputs);
    }
    var gth = E.cavity.thresholdGain({
      refl1: config.refl1, refl2: config.refl2, alpha_i: config.alpha_i, l_g: config.l_g
    });

    var d = {
      medium: medium.id,
      scheme: medium.scheme,
      pump: setup.pump,
      lam: medium.lam,
      tau: medium.tau,
      I_sat: medium.I_sat,
      L_e: L_e,
      gamma: scales.gamma,
      gth: gth,
      N_c: scales.N_c,
      R_c: fourLevel ? scales.R_c : null,
      N_t: fourLevel ? null : medium.N_t,
      n_t: fourLevel ? null : scales.n_t,
      // The two-level atom has no threshold, whatever its n_t.
      wThreshold: medium.scheme === "three-level" ? scales.wThreshold : null,
      tau_c: scales.tau_c,
      eps: scales.eps,
      powerPerP: scales.powerPerP,                 // the output at p = 1
      powerPerPhoton: scales.powerPerP * scales.pOnePhoton,
      // The steady output at twice threshold, the page's unit of light (its
      // beam and its chart): p = x − 1 = 1 for four levels, p = (n_t + 1)(x − 1)
      // = n_t + 1 for three (two levels, with no threshold, use the same).
      powerAtTwiceThreshold: fourLevel ? scales.powerPerP : scales.powerPerP * (scales.n_t + 1),
      sOnePhoton: scales.sOnePhoton,
      beta: config.beta,
      // Filled in below, by pump: a steady pump, a discharge or a flash.
      R_p: null,
      x: null,
      w: null,
      g0: null,
      ySteady: null,
      pumpThreshold: null,
      slope: null,
      currentThreshold: null,
      P_out: null,
      T_opt: null,
      T_best: null,
      period: null,
      t_damp: null,
      flashPeak: null,
      xPeak: null
    };

    if (setup.pump === "flashlamp") {
      // The lamp's peak, E/(e·t_p) at t = t_p (pumps.js), and the pump it
      // gives then, in units of threshold.
      d.flashPeak = config.flashEnergy / (Math.E * config.flashTime);
      var peak = pumpLevel(d, config, config.flashShare * d.flashPeak);
      if (fourLevel) d.xPeak = peak;
      else if (d.wThreshold !== null) d.xPeak = peak / d.wThreshold;
      return d;                                         // two levels: no threshold, xPeak null
    }

    if (setup.pump === "discharge") {
      var g0 = E.pumps.dischargeGain({
        law: setup.law, current: config.current, currentPeak: config.currentPeak, gainPeak: config.gainPeak
      });
      d.g0 = g0;
      d.x = g0 * config.l_g / d.gamma;                   // g₀l = x·γ
      d.currentThreshold = E.pumps.dischargeThreshold({
        law: setup.law, currentPeak: config.currentPeak, gainPeak: config.gainPeak, gth: gth
      });
      steadyFourLevel(d, config, g0);
      return d;
    }

    // Continuous light: diodes or another laser.
    if (medium.scheme === "two-level") {
      d.w = pumpLevel(d, config, config.pumpPower);     // x stays null: no threshold
      d.P_out = 0;
      d.ySteady = E.rates.twoLevel.steadyState({ w: d.w, n_t: d.n_t, beta: config.beta }).y;
      return d;
    }
    if (!fourLevel) {
      // No setup pumps a three-level medium with continuous light (ruby
      // runs on a flash); its steady numbers are not built.
      check.fail(where, "continuous light for a three-level medium (" + medium.id + ") is not built.");
    }
    // The pump (§4.1, §6.3): absorbed photons per second and m³, of which
    // the share η reaches the upper level.
    d.x = pumpLevel(d, config, config.pumpPower);        // pump / threshold
    d.R_p = d.x * d.R_c;
    d.pumpThreshold = d.R_c * U.photonEnergy(config.pumpLam) * config.area * config.l_g / config.eta;
    d.slope = d.powerPerP / d.pumpThreshold;             // W of output per W of pump
    d.g0 = medium.sigma * d.R_p * medium.tau;
    steadyFourLevel(d, config, d.g0);
    return d;
  }

  // derive(config) -> the still numbers of the bench, in SI:
  //   for every bench: medium, scheme, pump, lam, tau, I_sat, L_e, gamma
  //   (single pass), gth, N_c, tau_c, eps, powerPerP, powerPerPhoton,
  //   sOnePhoton, beta; R_c for four levels; N_t, n_t for three and two,
  //   and wThreshold for three (null if n_t ≤ 1).
  //   a steady pump (light, discharge): x, ySteady (the steady y), P_out
  //   (W); for four levels also g0, T_opt and T_best (null with no internal
  //   loss), period and t_damp (null at or below threshold); light also
  //   R_p, pumpThreshold (W) and slope, a discharge currentThreshold (A,
  //   null if the tube never reaches threshold). The two-level atom, which
  //   has no threshold: x null, w = W_p·τ, ySteady < 0, P_out = 0.
  //   a flashlamp: flashPeak (the lamp's peak, W) and xPeak (the pump then
  //   in units of threshold; null for two levels). Its steady numbers are
  //   null.
  //   Every number a bench does not have is null.
  function derive(config) {
    var where = at("derive");
    var read = readConfig(where, config);
    return compute(where, config, read.medium, read.setup);
  }

  /* ---------- the simulation ---------- */

  // start(config) -> { t, N, lnPhi, flash }: no inversion for four
  // levels, every ion down (ΔN = −N_t) for three and two, one photon
  // (ln 1 = 0), no flash yet.
  function start(config) {
    var read = readConfig(at("start"), config);
    var N = read.medium.scheme === "four-level" ? 0 : -read.medium.N_t;
    return { t: 0, N: N, lnPhi: 0, flash: null };
  }

  function copyFlash(flash) {
    if (flash === null) return null;
    return { at: flash.at, flashEnergy: flash.flashEnergy, flashTime: flash.flashTime };
  }

  function readSim(where, sim) {
    check.params(where, sim, SIM_NAMES);
    check.atLeast(where, "sim.t", sim.t, 0);
    check.finite(where, "sim.N", sim.N);
    check.finite(where, "sim.lnPhi", sim.lnPhi);
    var flash = sim.flash;
    if (flash === null) return sim;
    if (typeof flash !== "object" || Array.isArray(flash)) {
      check.fail(where, "sim.flash must be null (no flash yet) or { " + FLASH_NAMES.join(", ") +
        " }, got " + check.describe(flash) + ".");
    }
    check.params(where, flash, FLASH_NAMES);
    check.atLeast(where, "sim.flash.at", flash.at, 0);
    check.atLeast(where, "sim.flash.flashEnergy", flash.flashEnergy, 0);
    check.positive(where, "sim.flash.flashTime", flash.flashTime);
    if (flash.at > sim.t) {
      check.fail(where, "sim.flash.at (" + flash.at + " s) cannot be later than sim.t (" + sim.t + " s).");
    }
    return sim;
  }

  // A flash in a simulation of a bench without a lamp (a page that kept
  // the simulation of its last bench) is refused, not ignored.
  function refuseStrayFlash(where, sim, read) {
    if (sim.flash !== null && read.setup.pump !== "flashlamp") {
      check.fail(where, "sim.flash is a flash fired at " + sim.flash.at + " s, but this bench has no " +
        "flashlamp (its pump is " + read.setup.pump + "). Start the simulation again for a new bench.");
    }
  }

  // fire({ sim, config }) -> a copy of sim with a flash fired now, of the
  // config's flashEnergy and flashTime. A flash fired while one runs
  // replaces it.
  function fire(params) {
    var where = at("fire");
    check.params(where, params, ["sim", "config"]);
    var sim = readSim(where, params.sim);
    var config = params.config;
    var read = readConfig(where, config);
    if (read.setup.pump !== "flashlamp") {
      check.fail(where, "needs a config with pump: \"flashlamp\", got " + check.describe(config.pump) + ".");
    }
    return {
      t: sim.t,
      N: sim.N,
      lnPhi: sim.lnPhi,
      flash: { at: sim.t, flashEnergy: config.flashEnergy, flashTime: config.flashTime }
    };
  }

  // The flash's pump as a function of t′, the solver's time in a call that
  // starts `since` seconds after the flash (§6.1): x or w per W absorbed,
  // times the absorbed share of the lamp's power.
  function flashPump(d, config, energy, flashTime, since) {
    var lamp = E.pumps.flash({ energy: energy, flashTime: flashTime });
    var perWatt = pumpLevel(d, config, config.flashShare);   // linear in the power
    var tau = d.tau;
    return function (tPrime) {
      return perWatt * lamp(since + tPrime * tau);
    };
  }

  // The right-hand side of the medium's rate equations (rates.js) for a
  // pump x or w (a number or a function of t′).
  function derivativesFor(d, pump, beta, eps) {
    if (d.scheme === "four-level") return E.rates.fourLevel.derivatives({ x: pump, eps: eps, beta: beta });
    var ions = d.scheme === "three-level" ? E.rates.threeLevel : E.rates.twoLevel;
    return ions.derivatives({ w: pump, n_t: d.n_t, eps: eps, beta: beta });
  }

  // advance({ sim, config, seconds, maxSteps }) -> { sim, reachedEnd, steps }
  // Moves the simulation `seconds` of simulated time on, with at most
  // maxSteps solver steps (accepted or rejected). Out of steps, it stops
  // where it got to: reachedEnd is false, and the next call carries on.
  function advance(params) {
    var where = at("advance");
    check.params(where, params, ["sim", "config", "seconds", "maxSteps"]);
    var sim = readSim(where, params.sim);
    var config = params.config;
    var read = readConfig(where, config);
    // The lowest inversion there is: none, or every ion down.
    var lowest = read.medium.scheme === "four-level" ? 0 : -read.medium.N_t;
    check.atLeast(where, "sim.N", sim.N, lowest);
    refuseStrayFlash(where, sim, read);
    var seconds = check.atLeast(where, "seconds", params.seconds, 0);
    var maxSteps = check.integerAtLeast(where, "maxSteps", params.maxSteps, 1);
    if (seconds === 0) {
      return {
        sim: { t: sim.t, N: sim.N, lnPhi: sim.lnPhi, flash: copyFlash(sim.flash) },
        reachedEnd: true,
        steps: 0
      };
    }
    var d = compute(where, config, read.medium, read.setup);

    // The pump: steady, or the flash fired last (none before it is fired),
    // with the energy and t_p it was fired with. A flash fired now starts
    // at this call's start, where its corner is at t′ = 0: the solver's
    // forward differences only see its smooth side.
    var pump;
    var flash = sim.flash;
    if (d.pump === "flashlamp") {
      pump = flash === null ? 0 : flashPump(d, config, flash.flashEnergy, flash.flashTime, sim.t - flash.at);
    } else {
      pump = d.scheme === "four-level" ? d.x : d.w;
    }

    // Into the solver's variables (§11.2): y = N/N_c, s = ln p = ln φ + ln(p of one photon).
    var state = [sim.N / d.N_c, sim.lnPhi + d.sOnePhoton];
    if (d.scheme === "four-level") {
      state = E.rates.fourLevel.liftToSeed({ state: state, beta: d.beta });
    } else {
      state = E.rates.threeLevel.liftToSeed({ state: state, n_t: d.n_t, beta: d.beta });
    }
    // The implicit solver: below threshold the photons sit at their seed
    // level, where dopri5's step would stay below 3.3ε/(1 − y) (§11.3).
    var run = E.ode.rosenbrock({
      f: derivativesFor(d, pump, d.beta, d.eps),
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
        // its lowest value (measured, four levels: 30 % coupler, after
        // 35τ). The next call would refuse it.
        N: Math.max(lowest, run.state[0] * d.N_c),
        lnPhi: run.state[1] - d.sOnePhoton,
        flash: copyFlash(flash)
      },
      reachedEnd: run.reachedEnd,
      steps: run.accepted + run.rejected
    };
  }

  // pumpNow({ sim, config }) -> { x, w, smallSignal }
  // The pump at the moment of sim: steady, or the flash fired last (none
  // before Fire), with the energy and t_p it was fired with.
  //   x            the pump in units of threshold: R_p/R_c for four levels
  //                (a discharge: its x), w/w_th for three; null for the
  //                two-level atom, which has no threshold
  //   w            W_p·τ for three and two levels; null for four
  //   smallSignal  the small-signal gain over the threshold gain, g₀/g_th:
  //                the inversion y this pump would hold with no light
  //                (§2.2, §11.2): x for four levels, n_t(w − 1)/(w + 1) for
  //                three, −n_t/(1 + 2w) for two (below 0, the medium absorbs)
  function pumpNow(params) {
    var where = at("pumpNow");
    check.params(where, params, ["sim", "config"]);
    var sim = readSim(where, params.sim);
    var config = params.config;
    var read = readConfig(where, config);
    refuseStrayFlash(where, sim, read);
    var d = compute(where, config, read.medium, read.setup);
    // The pump as advance runs it: x for four levels, w for three and two.
    var level;
    if (d.pump === "flashlamp") {
      var flash = sim.flash;
      if (flash === null) level = 0;
      else level = flashPump(d, config, flash.flashEnergy, flash.flashTime, sim.t - flash.at)(0);
    } else {
      level = d.scheme === "four-level" ? d.x : d.w;
    }
    if (d.scheme === "four-level") return { x: level, w: null, smallSignal: level };
    if (d.scheme === "three-level") {
      return {
        x: d.wThreshold === null ? null : level / d.wThreshold,
        w: level,
        smallSignal: d.n_t * (level - 1) / (level + 1)
      };
    }
    return { x: null, w: level, smallSignal: -d.n_t / (1 + 2 * level) };
  }

  /* ---------- the flash threshold ---------- */

  // The highest y a flash of `energy` gives with no light (p = 0): the
  // inversion equation of rates.js on its own, from the start of start(),
  // on dopri5 in pieces of 1/100 of t_p. y rises to
  // one peak after the flash's and falls after it (the pump only falls
  // then), so the first piece that does not rise ends the search, and the
  // sample before it is the peak. The true peak between two samples is
  // higher by less than 10⁻⁶ of it: a parabola through the last three
  // samples moved the threshold energy by at most 6×10⁻⁷ (ruby, Nd:YAG,
  // Nd:glass), far below what the page shows.
  function photonFreePeak(d, config, energy) {
    var y = d.scheme === "four-level" ? 0 : -d.n_t;
    if (energy === 0) return y;
    var withLight = derivativesFor(d, flashPump(d, config, energy, config.flashTime, 0), 0, 1);
    var f = function (tPrime, state) {
      return [withLight(tPrime, [state[0], -Infinity])[0]];   // s = −∞: no photons
    };
    // In units of τ. Pieces of t_p/100 keep the count near a few hundred
    // whatever t_p is (y peaks within a few t_p, or t_p + a few τ); the
    // peak's width grows with t_p too, so the samples still resolve it.
    var flashTime = config.flashTime / d.tau;
    var piece = flashTime / 100;
    var tEnd = 50 * (flashTime + 1);
    var t = 0;
    var h;
    var old = y;
    while (t < tEnd) {
      var run = E.ode.dopri5({ f: f, t0: t, state0: [old], t1: t + piece, h0: h, rtol: 1e-10, atol: 1e-12, maxSteps: 200 });
      if (!run.reachedEnd) {
        check.fail(at("flashThreshold"), "the inversion after a flash of " + energy + " J could not be followed.");
      }
      h = run.hNext;
      t = run.t;
      var now = run.state[0];
      if (now <= old) return old;
      old = now;
    }
    return old;
  }

  // flashThreshold(config) -> J, or null
  // The smallest flash energy whose inversion, without light, reaches
  // threshold (y = 1). For four levels y is proportional to the energy
  // (its equation is linear and starts at 0), so one run gives it; for
  // three levels the pump multiplies y, and it is found by bisection. Two
  // levels never reach it, nor three with n_t ≤ 1.
  function flashThreshold(config) {
    var where = at("flashThreshold");
    var read = readConfig(where, config);
    if (read.setup.pump !== "flashlamp") {
      check.fail(where, "needs a config with pump: \"flashlamp\", got " + check.describe(config.pump) + ".");
    }
    var d = compute(where, config, read.medium, read.setup);
    if (d.scheme === "two-level" || (d.scheme === "three-level" && d.wThreshold === null)) return null;
    // The energy whose peak pump is the threshold pump: the peak of y lags
    // behind the pump's, so the threshold energy is above it.
    var atPeak = Math.E * config.flashTime / pumpLevel(d, config, config.flashShare);
    if (d.scheme === "four-level") {
      return atPeak / photonFreePeak(d, config, atPeak);
    }
    atPeak *= d.wThreshold;
    var low = 0;
    var high = atPeak;
    var doublings = 0;
    while (photonFreePeak(d, config, high) < 1) {
      low = high;
      high *= 2;
      doublings += 1;
      if (doublings > 60) return null;
    }
    // To 10⁻⁶ of the energy: the page shows 3 or 4 digits.
    for (var i = 0; i < 60 && high - low > 1e-6 * high; i++) {
      var middle = (low + high) / 2;
      if (photonFreePeak(d, config, middle) < 1) low = middle;
      else high = middle;
    }
    return (low + high) / 2;
  }

  E.bench = Object.freeze({
    pumpsFor: pumpsFor,
    configFor: configFor,
    controls: controls,
    defaultConfig: defaultConfig,
    derive: derive,
    start: start,
    fire: fire,
    advance: advance,
    pumpNow: pumpNow,
    flashThreshold: flashThreshold
  });
})(this);
