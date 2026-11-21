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
     LaserEngine.bench.configFor({ medium, pump })   a new config: that setup,
                                          with no Q-switch
     LaserEngine.bench.hasThermalLens({ medium, pump })   true when the
                                          pump heats that bench's rod into
                                          a lens (stage 13c: Nd:YAG with
                                          diodes)
     LaserEngine.bench.qSwitchesFor({ medium, pump })   the Q-switches that
                                          setup can have: "none" first
     LaserEngine.bench.withQSwitch({ config, qSwitch })   a new config: the
                                          same bench with that Q-switch and
                                          its starting values
     LaserEngine.bench.controls(config)   the sliders of that bench:
                                          { pump: { name, min, max, log },
                                            coupler: { min, max, log },
                                            Rc1, Rc2: a curved mirror's
                                              radius slider, or null,
                                            absorberT0: the filter's, or null }
     LaserEngine.bench.beamPath({ config, starts, roundTrips, points })
                                          what the page draws of the
                                          mirrors: { mode: [{ z, w }] or
                                          null, rays: traceRay's answers }
     LaserEngine.bench.defaultConfig()    a new config: the default bench
                                          (Nd:YAG with diodes)
     LaserEngine.bench.derive(config)     threshold, output power, best
                                          coupler, the mirrors (resonator),
                                          … (SI units)
     LaserEngine.bench.MIRROR_SHAPES      ["flat", "concave", "convex"]
     LaserEngine.bench.start(config)      the simulation at the moment the
                                          bench is switched on:
                                          { t, N, lnPhi, flash, opensAt, absorber }
     LaserEngine.bench.fire({ sim, config })   a copy with a flash of the
                                          config's energy fired now
     LaserEngine.bench.advance({ sim, config, seconds, maxSteps })
                                          -> { sim, reachedEnd, steps, peak }
     LaserEngine.bench.pumpNow({ sim, config })   the pump at the moment
                                          of sim: { x, w, smallSignal,
                                          overThreshold }
     LaserEngine.bench.flashThreshold(config)   the smallest flash energy
                                          that reaches threshold (J), or null;
                                          behind a filter, its closed loss
     LaserEngine.bench.lossNow({ sim, config })   the cavity's loss at the
                                          moment of sim, in units of the open
                                          cavity's: 1 + the Q-switch's
     LaserEngine.bench.switchNow({ sim, config })   the Q-switch at the
                                          moment of sim: { loss, open }, or null
     LaserEngine.bench.carryOver({ sim, config })   the simulation going on
                                          for the same bench with another
                                          Q-switch (or none)
     LaserEngine.bench.giantPulse({ sim, config })   §4.3's giant pulse for
                                          the inversion of sim, if the shutter
                                          opened now: { eta_E, energy,
                                          peakPower, width }, or null

   THE CONFIG (all SI)
     medium     an id from media.js       pump   "diode", "laser" (both
                                                 continuous light),
                                                 "flashlamp" or "discharge"
     l_g        rod length, m              area   mode area A, m²
     L          mirror spacing, m          refl1, refl2   mirror reflectivities
     alpha_i    internal loss, m⁻¹         beta   share of spontaneous
                                                  emission into the mode
     mirror1, mirror2   each mirror's shape: "flat", "concave" or "convex"
                (MIRROR_SHAPES); mirror 1 is the back mirror, 2 the output
     Rc1, Rc2   their radii of curvature, m, positive; a flat mirror's is
                kept but not used (the radius its slider shows when bent)
     aperture   the radius of the rod or of the gas tube's bore, m
   The mirrors' loss (optics.js, docs/laser-physics.md §7.7: the aperture
   clipping the beam, the light an unstable pair lets walk out) joins the
   internal loss; they do not change the gain, which stays spread over
   `area` (docs/laser-plan.md, stage 10a, D15).
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
   and the Q-switch (qswitch.js, docs/laser-physics.md §4.3, §9):
     qSwitch    "none"; or, for the setups that list them (qSwitchesFor),
                "cell" (a Pockels cell and polarizer), "prism" (a rotating
                prism as the back mirror) or "absorber" (a bleachable filter)
     cell       qDelay      from the flash to the voltage starting to fall, s
                leak        the share of the light a closed shutter keeps
                            per round trip
                switchTime  how long the voltage takes to fall, s
     prism      qDelay      from the flash to the prism lining up, s; it
                            keeps turning, so it also lines up every
                            1/rotation before and after that
                leak        as the cell's, for the prism turned away
                rotation    rev/s, at most 10⁵
                angleTolerance  θ_tol, rad
     absorber   absorber    the filter's id (qswitch.ABSORBERS)
                absorberT0  its transmission per pass when unbleached
   The filter's beam is as wide as the mode in the medium (A_a = A).

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

   THE SIMULATION STATE  { t, N, lnPhi, flash, opensAt, absorber }
   Physical, not the solver's y and s: t in s, the inversion N in m⁻³ (for
   three and two levels ΔN = N₂ − N₁, from −N_t with every ion down),
   lnPhi = ln φ (φ = photons in the mode), and flash, the last flash fired:
   null (none yet) or { at, flashEnergy, flashTime }, its time and the
   energy and t_p it was fired with, so a slider moved after Fire changes
   the next flash, not the one that is running. opensAt, set by Fire as
   its time + qDelay, is when the cell starts to open, or a moment the
   prism lines up (it lines up again every turn, before it too: a fast
   prism lets out pulses during the flash). null before Fire (the
   shutter stays closed, the prism counts as turned away) and on a bench
   without a shutter. absorber is the share of the filter's molecules in their ground
   state, 1 when it has recovered (start), null without a filter. Every
   slider changes the scales that turn N and φ into y and s, but not the
   atoms and photons, so they are kept and converted again on each call.
   ln φ, not φ, because the solver works with ln φ, and because φ has no
   lower limit of its own: with β = 0 it falls without end (e^(−1600)
   before threshold), and with the pump off it settles at the seed
   floor's level (rates.js), φ ≈ 10⁻⁹ for the default bench. Each call
   lets the solver choose its first step again, which costs a settled
   laser a few steps a call (stage 7a; with dopri5, carrying the step
   size saved only 2–8 %, stage 6).

   THE Q-SWITCH IN THE RUN. The switch adds its loss to the photons'
   equation (qswitch.withLoss); the filter is one more entry of the
   solver's state (qswitch.withAbsorber). The prism lines up for about
   0.3 µs a turn, with the leak's loss on both sides, so a long solver
   call could step right over it: advance starts a new call where each
   of its windows opens (cutsOf). advance's peak is the highest output
   at the solver's points within the call: a giant pulse lasts ~10 ns,
   far less than the time between the page's chart points, and the
   solver's steps are short there.

   THE MIRRORS (optics.js, docs/laser-physics.md §5.9, §7.7). readConfig
   works out the config's mirrors once (resonatorOf); their loss γ_m joins
   the internal loss, spread over the rod (α_i + γ_m/l_g, alphaWithMirrors),
   so every threshold, τ_c and the best coupler include it. They do not
   change the gain (stage 10a, D15).

   Tests: tests/laser/bench.test.js, tests/laser/bench-pumps.test.js,
   tests/laser/bench-qswitch.test.js, tests/laser/bench-mirrors.test.js
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
  var us = E.constants.us;
  var ns = E.constants.ns;
  var mA = E.constants.mA;
  var c = E.constants.c;

  var COMMON_NAMES = ["medium", "pump", "l_g", "area", "L", "refl1", "refl2", "alpha_i", "beta", "qSwitch",
    "mirror1", "Rc1", "mirror2", "Rc2", "aperture"];
  // The mirror shapes a config can have (optics.js, docs/laser-physics.md §7).
  var MIRROR_SHAPES = Object.freeze(["flat", "concave", "convex"]);
  var PUMP_NAMES = {
    diode: ["pumpPower", "pumpLam", "eta"],
    laser: ["pumpPower", "pumpLam", "eta"],
    flashlamp: ["flashEnergy", "flashShare", "flashTime", "pumpLam", "eta"],
    discharge: ["current", "currentPeak", "gainPeak"]
  };
  // The config field each pump's slider sets.
  var CONTROL_NAMES = { diode: "pumpPower", laser: "pumpPower", flashlamp: "flashEnergy", discharge: "current" };
  var SIM_NAMES = ["t", "N", "lnPhi", "flash", "opensAt", "absorber"];
  // giantPulse predicts a pulse only from 1 % over threshold. Just above
  // it §4.3's pulse is nothing and lasts for ever (at x = 1 + 10⁻⁹ a
  // "pulse" of 128 s): no prediction to give.
  var PULSE_FROM = 1.01;
  // The config fields of each Q-switch.
  var Q_SWITCH_NAMES = {
    none: [],
    cell: ["qDelay", "leak", "switchTime"],
    prism: ["qDelay", "leak", "rotation", "angleTolerance"],
    absorber: ["absorber", "absorberT0"]
  };
  var FLASH_NAMES = ["at", "flashEnergy", "flashTime"];

  // A cavity losing less than this per pass keeps its photons for seconds
  // (τ_c = L_e/(cγ)); it is refused here, with this file's name in the
  // message, before rates.js would refuse it with its own.
  var MIN_LOSS = 1e-9;

  // The smallest radius of curvature a mirror may have: 1 mm, far below
  // any real laser mirror's (and below the page's slider). A radius of
  // 10⁻¹⁶⁰ m made 1/R and the magnification overflow inside optics.js.
  var MIN_RADIUS = 1e-3;

  // The flash's t_p for every lamp: 0.73 ms at half its peak, the owner's
  // "about 1 ms" (docs/laser-plan.md, stage 7b).
  var FLASH_TIME = 0.3 * ms;
  var FLASH_SHARE = 0.12;    // the book's 10–15 % of the lamp's light (§6.1)
  var BETA = 1e-8;           // §4.1's range, 10⁻⁸–10⁻⁴

  // The shutters (docs/laser-plan.md, stage 8a; not verified against
  // printed sources). A closed shutter keeps 10⁻⁴ of the light per round
  // trip: a loss of 4.6 per pass, so that ruby (n_t = 11.5, γ = 0.35)
  // cannot lase through it. The cell's voltage falls in 5 ns (§9.3:
  // "~nanoseconds"); the prism turns 500 times a second and the cavity
  // takes it within 1 mrad (§9.5).
  var LEAK = 1e-4;
  var SWITCH_TIME = 5 * ns;
  var ROTATION = 500;
  var ANGLE_TOLERANCE = 1e-3;
  // The prism's loss is the leak's to rounding past 6 θ_tol from lining
  // up (e^(−36) = 2×10⁻¹⁶): its window opens there.
  var PRISM_WINDOW = 6;
  // The fastest prism a config may have: §9.5's turns 500 times a second.
  // A much faster one would only make the windows (and so the cuts below)
  // too many and too short to mean anything.
  var MAX_ROTATION = 1e5;

  // The output coupler's slider, T = 1 − R₂, for every setup: up to
  // ruby's 50 % (§3.1) and a little more.
  var COUPLER_RANGE = { min: 0.005, max: 0.6, log: true };

  // The filter's slider (docs/laser-plan.md, stage 8b): its transmission
  // from 20 %, which holds ruby back past its default flash, to 99 %.
  var ABSORBER_T0_RANGE = { min: 0.2, max: 0.99, log: false };

  // A curved mirror's radius slider (stage 10b): from a quarter of the
  // cavity's length, which reaches past the concentric pair (R = L/2,
  // §7.1) and the confocal one (R = L), to 50 m, nearly flat; log. Every
  // setup's own radius lies inside it (bench-mirrors.test.js).
  var RADIUS_RANGE = { minShare: 0.25, max: 50, log: true };

  // beamPath's limits: a picture needs a few round trips and a few dozen
  // points, and a call must stay cheap.
  var MAX_PATH_ROUND_TRIPS = 100;
  var MAX_PATH_POINTS = 1000;

  // The two-level atom absorbs at its own line: there is no other level.
  var TWO_LEVEL_LINE = E.media.get("two-level").lam;

  // Every medium and pump the bench runs, in the order of the dropdowns
  // (docs/laser-plan.md, stage 7b, where each number is explained). max is
  // the pump slider's top; a discharge's comes from its law (pumps.js).
  // qSwitches lists the Q-switches a setup can take besides "none"
  // (stage 8a). qDelay is when the inversion behind a closed shutter is
  // highest after the flash, at the default flash energy (measured: ruby
  // 1.00 ms, Nd:glass 0.60 ms, Nd:YAG 0.55 ms). absorberT0 is the filter's
  // transmission: low enough to hold the light back for a while, high
  // enough that the inversion can overcome it (Nd:glass with 0.5 never
  // lased: its threshold behind the filter, 6.3, is above its peak, 3.45).
  var SETUPS = [
    // §3.1's ruby: rod 10 cm, 1 cm across. Lamp light absorbed in the green
    // band, η = 0.7 (not verified). Threshold about 640 J.
    { medium: "ruby", pump: "flashlamp", max: 3000,
      qSwitches: ["cell", "prism", "absorber"], qDelay: 1 * ms, absorber: "cryptocyanine", absorberT0: 0.5,
      config: { l_g: 10 * cm, area: Math.PI * (5 * mm) * (5 * mm), L: 50 * cm, refl1: 1, refl2: 0.5, alpha_i: 0,
        mirror1: "flat", Rc1: 1, mirror2: "flat", Rc2: 1, aperture: 5 * mm,
        flashEnergy: 1000, flashShare: FLASH_SHARE, flashTime: FLASH_TIME, pumpLam: 550 * nm, eta: 0.7 } },
    // Threshold about 29 J.
    { medium: "nd-glass", pump: "flashlamp", max: 300,
      qSwitches: ["cell", "prism", "absorber"], qDelay: 0.6 * ms, absorber: "cr-yag", absorberT0: 0.8,
      config: { l_g: 10 * cm, area: Math.PI * (5 * mm) * (5 * mm), L: 50 * cm, refl1: 1, refl2: 0.8, alpha_i: 0.2,
        mirror1: "flat", Rc1: 1, mirror2: "flat", Rc2: 1, aperture: 5 * mm,
        flashEnergy: 100, flashShare: FLASH_SHARE, flashTime: FLASH_TIME, pumpLam: 808 * nm, eta: 0.9 } },
    // Stage 12c: Nd:glass end-pumped by diodes at its 802 nm absorption
    // peak, as in diode-pumped phosphate-glass lasers: a 5 mm disc, a
    // 0.1 mm² spot, a 2 % coupler on a 20 cm mirror. Threshold 0.34 W.
    // Stage 13g's fix: the bleachable filter, a thin Cr⁴⁺:YAG plate of
    // T₀ = 0.99 (the cavity loses so little that 0.95 needs 1.9 W): behind
    // it the threshold is 0.65 W, under the default 1 W, and it pulses
    // (0.57 kW peaks), as the diode Nd:YAG does; its doubling crystal had
    // no pulses to turn green. Its filter's slider starts at 0.9
    // (absorberMin; threshold 3.56 W, under the 5 W top): from the usual
    // 0.2, 95 % of it never lased (0.85 needs 5.31 W; review).
    { medium: "nd-glass", pump: "diode", max: 5,
      qSwitches: ["absorber"], absorber: "cr-yag", absorberT0: 0.99, absorberMin: 0.9,
      config: { l_g: 5 * mm, area: 0.1 * mm2, L: 10 * cm, refl1: 1, refl2: 0.98, alpha_i: 0.2,
        mirror1: "flat", Rc1: 1, mirror2: "concave", Rc2: 20 * cm, aperture: 1 * mm,
        pumpPower: 1, pumpLam: 802 * nm, eta: 0.9 } },
    // Stage 4's small Nd:YAG laser (stage 6): rod 5 cm, mode area 1 mm²,
    // a 5 % output coupler, scattering 0.2 m⁻¹ (L_i = 2 %: with none there
    // is no best coupler, §3.6), 808 nm diodes with η = 0.9 (§6.3).
    { medium: "nd-yag", pump: "diode", max: 20,
      qSwitches: ["absorber"], absorber: "cr-yag", absorberT0: 0.95,
      config: { l_g: 5 * cm, area: 1 * mm2, L: 30 * cm, refl1: 1, refl2: 0.95, alpha_i: 0.2,
        mirror1: "flat", Rc1: 1, mirror2: "concave", Rc2: 1, aperture: 1.5 * mm,
        pumpPower: 5, pumpLam: 808 * nm, eta: 0.9 } },
    // Rod 7.5 cm, 6 mm across. Threshold about 1.3 J.
    { medium: "nd-yag", pump: "flashlamp", max: 50,
      qSwitches: ["cell", "prism", "absorber"], qDelay: 0.55 * ms, absorber: "cr-yag", absorberT0: 0.5,
      config: { l_g: 7.5 * cm, area: Math.PI * (3 * mm) * (3 * mm), L: 30 * cm, refl1: 1, refl2: 0.8, alpha_i: 0.2,
        mirror1: "concave", Rc1: 5, mirror2: "flat", Rc2: 1, aperture: 3 * mm,
        flashEnergy: 10, flashShare: FLASH_SHARE, flashTime: FLASH_TIME, pumpLam: 808 * nm, eta: 0.9 } },
    // The tube fills the cavity. 15.5 %/m (0.144 m⁻¹) at 5 mA; 0.43 mW there.
    { medium: "he-ne", pump: "discharge", law: "optimum",
      config: { l_g: 30 * cm, area: 0.2 * mm2, L: 30 * cm, refl1: 0.999, refl2: 0.99, alpha_i: 0.01,
        mirror1: "flat", Rc1: 1, mirror2: "concave", Rc2: 45 * cm, aperture: 0.75 * mm,
        current: 5 * mA, currentPeak: 5 * mA, gainPeak: 0.144 } },
    // 10 dB/m (2.3 m⁻¹) at the rated 40 A (0.45 W there); the slider
    // starts at 30 A. Tube and cavity 1 m.
    { medium: "ar-ion", pump: "discharge", law: "square",
      config: { l_g: 100 * cm, area: 1.8 * mm2, L: 100 * cm, refl1: 1, refl2: 0.95, alpha_i: 0.01,
        mirror1: "concave", Rc1: 5, mirror2: "flat", Rc2: 1, aperture: 1.5 * mm,
        current: 30, currentPeak: 40, gainPeak: 2.3 } },
    // 1.1 %/cm (1.1 m⁻¹) at 20 mA; about 8 W.
    { medium: "co2", pump: "discharge", law: "optimum",
      config: { l_g: 80 * cm, area: 50 * mm2, L: 80 * cm, refl1: 1, refl2: 0.8, alpha_i: 0.005,
        mirror1: "concave", Rc1: 20, mirror2: "flat", Rc2: 1, aperture: 6 * mm,
        current: 20 * mA, currentPeak: 20 * mA, gainPeak: 1.1 } },
    // A 0.2 mm dye jet, a 15 µm spot (700 µm²), pumped at 532 nm.
    // Threshold 42 mW.
    { medium: "dye-r6g", pump: "laser", max: 10,
      config: { l_g: 0.2 * mm, area: 700 * um * um, L: 50 * cm, refl1: 1, refl2: 0.97, alpha_i: 5,
        mirror1: "concave", Rc1: 30 * cm, mirror2: "concave", Rc2: 30 * cm, aperture: 5 * mm,
        pumpPower: 2, pumpLam: 532 * nm, eta: 1 } },
    // Stage 12c: the coaxial flashlamp dye laser (the dye flows through a
    // tube inside the lamp; 585 nm medical lasers are built so): a 10 cm
    // cell 6 mm across, a 1 µs flash, 1 % of the lamp's light reaching the
    // upper level (not verified; the dye's triplet loss is not modelled).
    // Threshold 6.6 J.
    { medium: "dye-r6g", pump: "flashlamp", max: 100,
      config: { l_g: 10 * cm, area: Math.PI * (3 * mm) * (3 * mm), L: 40 * cm, refl1: 1, refl2: 0.7, alpha_i: 0.5,
        mirror1: "flat", Rc1: 1, mirror2: "flat", Rc2: 1, aperture: 3 * mm,
        flashEnergy: 20, flashShare: 0.01, flashTime: 1 * us, pumpLam: 530 * nm, eta: 1 } },
    // A 5 mm crystal, a 30 µm spot (2800 µm²), pumped at 532 nm.
    // Threshold 0.15 W.
    { medium: "ti-sapphire", pump: "laser", max: 10,
      config: { l_g: 5 * mm, area: 2800 * um * um, L: 150 * cm, refl1: 1, refl2: 0.97, alpha_i: 0.5,
        mirror1: "concave", Rc1: 1, mirror2: "concave", Rc2: 1, aperture: 5 * mm,
        pumpPower: 5, pumpLam: 532 * nm, eta: 1 } },
    // Ruby's numbers in a small sample, pumped by light at its own line.
    { medium: "two-level", pump: "laser", max: 1000,
      config: { l_g: 1 * cm, area: 1 * mm2, L: 10 * cm, refl1: 1, refl2: 0.9, alpha_i: 0,
        mirror1: "flat", Rc1: 1, mirror2: "concave", Rc2: 50 * cm, aperture: 0.56 * mm,
        pumpPower: 100, pumpLam: TWO_LEVEL_LINE, eta: 1 } },
    { medium: "two-level", pump: "flashlamp", max: 10,
      config: { l_g: 1 * cm, area: 1 * mm2, L: 10 * cm, refl1: 1, refl2: 0.9, alpha_i: 0,
        mirror1: "flat", Rc1: 1, mirror2: "concave", Rc2: 50 * cm, aperture: 0.56 * mm,
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
    config.qSwitch = "none";
    return config;
  }

  // The Q-switches of a setup: "none", then the ones it lists.
  // A cell or a prism: a shutter that Fire times (a filter opens by itself).
  function hasShutter(config) {
    return config.qSwitch === "cell" || config.qSwitch === "prism";
  }

  function qSwitchesOf(setup) {
    return ["none"].concat(setup.qSwitches || []);
  }

  // hasThermalLens({ medium, pump }) -> whether that bench's pump makes a
  // thermal lens in its rod (stage 13c), at any pump above 0.
  function hasThermalLens(params) {
    var where = at("hasThermalLens");
    check.params(where, params, ["medium", "pump"]);
    var found = findSetup(where, params.medium, params.pump);
    return lensKindOf(found.medium, found.setup);
  }

  // qSwitchesFor({ medium, pump }) -> ["none", "cell", ...], a new array
  function qSwitchesFor(params) {
    var where = at("qSwitchesFor");
    check.params(where, params, ["medium", "pump"]);
    return qSwitchesOf(findSetup(where, params.medium, params.pump).setup);
  }

  // withQSwitch({ config, qSwitch }) -> a new config: the same bench with
  // that Q-switch, its fields at their starting values (another
  // Q-switch's fields are dropped).
  function withQSwitch(params) {
    var where = at("withQSwitch");
    check.params(where, params, ["config", "qSwitch"]);
    var config = params.config;
    var setup = readConfig(where, config).setup;
    var qSwitch = readQSwitch(where, setup, params.qSwitch);
    var copy = {};
    COMMON_NAMES.concat(PUMP_NAMES[setup.pump]).forEach(function (name) {
      copy[name] = config[name];
    });
    copy.qSwitch = qSwitch;
    if (hasShutter(copy)) {
      copy.qDelay = setup.qDelay;
      copy.leak = LEAK;
    }
    if (qSwitch === "cell") copy.switchTime = SWITCH_TIME;
    if (qSwitch === "prism") {
      copy.rotation = ROTATION;
      copy.angleTolerance = ANGLE_TOLERANCE;
    }
    if (qSwitch === "absorber") {
      copy.absorber = setup.absorber;
      copy.absorberT0 = setup.absorberT0;
    }
    return copy;
  }

  // controls(config) -> { pump, coupler, Rc1, Rc2, absorberT0 }
  // The pump slider { name, min, max, log } sets the config field `name`;
  // a discharge's top is the highest current its law allows for this
  // config's currentPeak. The coupler slider { min, max, log } sets
  // T = 1 − refl2. The filter's slider { name, min, max, log } sets
  // absorberT0; null without a filter. (The page offers the filter only;
  // a cell's or a prism's timing has no slider.) Rc1 and Rc2, each
  // { name, min, max, log }, set a curved mirror's radius; null for a
  // flat one (stage 10b).
  function controls(config) {
    var read = readConfig(at("controls"), config);
    var setup = read.setup;
    var top = setup.max;
    if (setup.pump === "discharge") {
      top = E.pumps.dischargeMax({ law: setup.law, currentPeak: config.currentPeak });
    }
    return {
      pump: { name: CONTROL_NAMES[setup.pump], min: 0, max: top, log: false },
      coupler: { min: COUPLER_RANGE.min, max: COUPLER_RANGE.max, log: COUPLER_RANGE.log },
      absorberT0: config.qSwitch === "absorber" ? {
        name: "absorberT0", min: setup.absorberMin || ABSORBER_T0_RANGE.min, max: ABSORBER_T0_RANGE.max, log: ABSORBER_T0_RANGE.log
      } : null,
      Rc1: radiusRange(config, config.mirror1, "Rc1"),
      Rc2: radiusRange(config, config.mirror2, "Rc2")
    };
  }

  // A mirror's radius slider, or null for a flat mirror (its radius is
  // kept, unused, for when it is bent).
  function radiusRange(config, shape, name) {
    if (shape === "flat") return null;
    return { name: name, min: RADIUS_RANGE.minShare * config.L, max: RADIUS_RANGE.max, log: RADIUS_RANGE.log };
  }

  // What the page draws of the mirrors (stage 10b): the lowest mode's
  // radius w (m) at `points` + 1 evenly spaced real distances z from
  // mirror 1 (0 to L; null when the pair has no Gaussian mode: on a
  // stability edge or outside), and a ray traced from mirror 1 for each
  // height in `starts` (m, inside the aperture), along the axis
  // (θ = 0), for `roundTrips` round trips: optics.traceRay's answers.
  function beamPath(params) {
    var where = at("beamPath");
    check.params(where, params, ["config", "starts", "roundTrips", "points"]);
    var config = params.config;
    var read = readConfig(where, config);
    var starts = check.finiteArray(where, "starts", params.starts);
    var roundTrips = check.integerAtLeast(where, "roundTrips", params.roundTrips, 1);
    if (roundTrips > MAX_PATH_ROUND_TRIPS) {
      check.fail(where, "roundTrips must be at most " + MAX_PATH_ROUND_TRIPS + ", got " + roundTrips + ".");
    }
    var points = check.integerAtLeast(where, "points", params.points, 1);
    if (points > MAX_PATH_POINTS) {
      check.fail(where, "points must be at most " + MAX_PATH_POINTS + ", got " + points + ".");
    }
    starts.forEach(function (y, i) {
      if (Math.abs(y) > config.aperture) {
        check.fail(where, "starts[" + i + "] (y = " + y + " m) is outside the aperture (" + config.aperture + " m).");
      }
    });
    var medium = read.medium;
    var mirrors = {
      L: config.L, l_g: config.l_g, n: medium.n,
      c1: curvatureOf(config.mirror1, config.Rc1), c2: curvatureOf(config.mirror2, config.Rc2),
      lens: read.lens
    };
    var mode = null;
    if (read.resonator.w0 !== null) {
      mode = [];
      for (var k = 0; k <= points; k++) {
        // The last point exactly at L, not one rounding past it.
        var z = k === points ? config.L : k * config.L / points;
        mode.push({ z: z, w: E.optics.beamRadius(Object.assign({ lam: medium.lam, z: z }, mirrors)) });
      }
    }
    var rays = starts.map(function (y) {
      return E.optics.traceRay(Object.assign({ aperture: config.aperture, y: y, theta: 0, roundTrips: roundTrips }, mirrors));
    });
    return { mode: mode, rays: rays };
  }

  function defaultConfig() {
    return configFor({ medium: "nd-yag", pump: "diode" });
  }

  /* ---------- the config ---------- */

  // Checks a config and returns { medium, setup, lens, resonator } (the
  // rod's thermal lens, 1/f in m⁻¹, 0 without one; the mirrors:
  // optics.resonator with it). Every check is made here, so an error always names
  // the function the page called.
  function readConfig(where, config) {
    if (config === null || typeof config !== "object" || Array.isArray(config)) {
      check.params(where, config, COMMON_NAMES);       // says it needs one object
    }
    var found = findSetup(where, config.medium, config.pump);
    var setup = found.setup;
    var medium = found.medium;
    var qSwitch = readQSwitch(where, setup, config.qSwitch);
    check.params(where, config, COMMON_NAMES.concat(PUMP_NAMES[setup.pump], Q_SWITCH_NAMES[qSwitch]));
    readQSwitchFields(where, config, qSwitch);

    var l_g = check.positive(where, "l_g", config.l_g);
    check.positive(where, "area", config.area);
    var L = check.positive(where, "L", config.L);
    if (l_g > L) {
      check.fail(where, "l_g (" + l_g + " m) is longer than the cavity (L = " + L + " m).");
    }
    check.reflectivity(where, "refl1", config.refl1);
    check.reflectivity(where, "refl2", config.refl2);
    check.atLeast(where, "alpha_i", config.alpha_i, 0);
    check.between(where, "beta", config.beta, 0, 1);
    readMirror(where, config, "mirror1", "Rc1");
    readMirror(where, config, "mirror2", "Rc2");
    check.positive(where, "aperture", config.aperture);

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
      return { medium: medium, setup: setup, lens: 0, resonator: mirrorsOf(where, config, medium, 0) };
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
    var lens = lensPowerOf(config, medium, setup);
    return { medium: medium, setup: setup, lens: lens, resonator: mirrorsOf(where, config, medium, lens) };
  }

  // The mirrors (§7.7) of a config whose every field is checked, with the
  // rod's thermal lens of power `lens` (stage 13c), worked out once in
  // readConfig; compute uses them. optics.js cannot refuse checked inputs, and with radii of
  // 1 mm or more its numbers stay finite (an unstable pair's γ_m = ln M).
  // Refuses a cavity whose loss, the mirrors' included, cannot be used.
  function mirrorsOf(where, config, medium, lens) {
    var resonator = resonatorOf(config, medium, lens);
    // γ with the mirrors' loss, as compute will have it.
    var loss = config.alpha_i * config.l_g - 0.5 * (Math.log(config.refl1) + Math.log(config.refl2)) + resonator.gamma;
    if (!isFinite(loss)) {
      check.fail(where, "the mirrors lose too much light to compute (γ = " + loss + " per pass).");
    }
    if (!(loss >= MIN_LOSS)) {
      check.fail(where, "the cavity loses almost no light (γ = " + loss + " per pass, below " +
        MIN_LOSS + "), so its photons would live for seconds. Lower a mirror's reflectivity " +
        "or add internal loss.");
    }
    return resonator;
  }

  // The rod's thermal lens (docs/laser-physics.md §8.7, stage 13c): its
  // power 1/f (m⁻¹), 0 without one. Only a steady pump (diodes, a pump
  // laser) on a medium with known thermalK and dndT makes one: the heat
  // P_h = (1 − η·λ_p/λ_l)·P_abs (the quantum defect, and the absorbed
  // photons that never reach the upper level) spread over the pumped area
  // A gives §8.7's end-pumped lens, 1/f = P_h·(dn/dT)/(K·A) (πw_p² = A).
  // Only the thermo-optic part: stress and bulging (20–30 % more) are not
  // modelled, and the lens follows the pump at once.
  function lensPowerOf(config, medium, setup) {
    if (!lensKindOf(medium, setup)) return 0;
    var heat = (1 - config.eta * config.pumpLam / medium.lam) * config.pumpPower;
    return heat * medium.dndT / (medium.thermalK * config.area);
  }

  // Checks one mirror: its shape and its radius of curvature (m). A flat
  // mirror keeps a radius too, unused: the one the page's slider shows
  // when the visitor bends it again.
  function readMirror(where, config, shapeName, radiusName) {
    if (MIRROR_SHAPES.indexOf(config[shapeName]) === -1) {
      check.fail(where, shapeName + " must be one of " + MIRROR_SHAPES.join(", ") + ", got " +
        check.describe(config[shapeName]) + ".");
    }
    check.atLeast(where, radiusName, config[radiusName], MIN_RADIUS);
  }

  // A mirror's curvature 1/R for optics.js: positive for a concave mirror,
  // negative for a convex one, 0 for a flat one (D9).
  function curvatureOf(shape, radius) {
    if (shape === "concave") return 1 / radius;
    if (shape === "convex") return -1 / radius;
    return 0;
  }

  // Whether a bench makes a thermal lens: a steady pump on a medium whose
  // K and dn/dT are known.
  function lensKindOf(medium, setup) {
    if (setup.pump !== "diode" && setup.pump !== "laser") return false;
    return medium.thermalK !== null && medium.dndT !== null;
  }

  // The mirrors of a checked config (optics.js, docs/laser-physics.md §7.7),
  // with a lens of power `lens` (m⁻¹) at the rod's middle.
  function resonatorOf(config, medium, lens) {
    return E.optics.resonator({
      L: config.L, l_g: config.l_g, n: medium.n,
      c1: curvatureOf(config.mirror1, config.Rc1), c2: curvatureOf(config.mirror2, config.Rc2),
      lens: lens, lam: medium.lam, aperture: config.aperture
    });
  }

  // Checks a Q-switch's name against the ones its setup can have.
  function readQSwitch(where, setup, qSwitch) {
    var allowed = qSwitchesOf(setup);
    if (allowed.indexOf(qSwitch) === -1) {
      check.fail(where, "qSwitch must be one of " + allowed.join(", ") + " for " + setup.medium + " with " +
        setup.pump + ", got " + check.describe(qSwitch) + ".");
    }
    return qSwitch;
  }

  // Checks the fields of a config's Q-switch.
  // (The leak is checked here as qswitch.js checks it, so that the error
  // names the function the page called.)
  function readQSwitchFields(where, config, qSwitch) {
    if (hasShutter(config)) {
      check.atLeast(where, "qDelay", config.qDelay, 0);
      var leak = check.between(where, "leak", config.leak, 0, 1);
      if (leak === 0) check.fail(where, "leak must be above 0: a shutter that holds back every photon gives an infinite loss.");
    }
    if (qSwitch === "cell") check.positive(where, "switchTime", config.switchTime);
    if (qSwitch === "prism") {
      var rotation = check.positive(where, "rotation", config.rotation);
      if (rotation > MAX_ROTATION) {
        check.fail(where, "rotation must be at most " + MAX_ROTATION + " rev/s (§9.5's prism turns 500 times a " +
          "second), got " + rotation + ".");
      }
      check.positive(where, "angleTolerance", config.angleTolerance);
    }
    if (qSwitch === "absorber") {
      var ids = Object.keys(E.qswitch.ABSORBERS);
      if (ids.indexOf(config.absorber) === -1) {
        check.fail(where, "absorber must be one of " + ids.join(", ") + ", got " + check.describe(config.absorber) + ".");
      }
      var T0 = check.between(where, "absorberT0", config.absorberT0, 0, 1);
      if (T0 === 0) check.fail(where, "absorberT0 must be above 0: a filter that lets no light through can never bleach.");
    }
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

    // The best output coupler (§3.6), with L_i = 2α·l, the round-trip form
    // of every loss but the coupler's in γ ≈ (T + L_i)/2: α is α_i with
    // the mirrors' loss (alphaWithMirrors). The mirrors always lose a
    // little, so T_opt is null only when they lose exactly nothing and
    // α_i = 0; with α_i = 0 alone it is tiny (1×10⁻⁵ on the diode bench). optimumCoupler refuses
    // a gain so high that it would ask for T ≥ 1; the bench then has no
    // low-gain answer to show.
    var L_i = 2 * d.alphaWithMirrors * config.l_g;
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

  // The extra single-pass loss of the closed Q-switch, over γ: a shutter's
  // leak, or the unbleached filter's −ln T₀.
  function closedExtra(config, gamma) {
    if (hasShutter(config)) return E.qswitch.closedLoss(config.leak) / gamma;
    if (config.qSwitch === "absorber") return -Math.log(config.absorberT0) / gamma;
    return 0;
  }

  // 1 + closedExtra, or null without a Q-switch.
  function closedLoss(config, gamma) {
    return config.qSwitch === "none" ? null : 1 + closedExtra(config, gamma);
  }

  // The loss, over the open cavity's, that the inversion must overcome
  // before any light builds up: the unbleached filter's, which only the
  // light itself can open; 1 otherwise (a shutter is opened by Fire, and
  // then the open cavity's threshold is the one that counts).
  function startingLoss(config, gamma) {
    return config.qSwitch === "absorber" ? closedLoss(config, gamma) : 1;
  }

  // A steady pump behind a Q-switch never settles: the filter lets the
  // light out in a train of pulses (§9.4). Its steady numbers would be the
  // open cavity's, which it never reaches: none.
  function noSteadyState(d) {
    d.ySteady = null;
    d.P_out = null;
    d.slope = null;
    d.T_opt = null;
    d.T_best = null;
    d.period = null;
    d.t_damp = null;
  }

  // The still numbers of a checked config (see derive below).
  function compute(where, config, read) {
    var medium = read.medium;
    var setup = read.setup;
    var fourLevel = medium.scheme === "four-level";
    var L_e = E.cavity.effectiveLength({ L: config.L, l_g: config.l_g, nGroup: medium.nGroup });
    // The light the mirrors lose (§7.7) joins the internal loss, spread over
    // the rod: γ = (α_i + γ_m/l_g)·l + ½·ln(1/(R₁R₂)) = the old γ + γ_m. So
    // every threshold, the photon lifetime and the best coupler (whose L_i
    // is every round-trip loss but the coupler's) include it.
    var resonator = read.resonator;
    var alphaWithMirrors = config.alpha_i + resonator.gamma / config.l_g;
    var inputs = {
      sigma: medium.sigma, tau: medium.tau, nu: medium.nu, l_g: config.l_g, area: config.area,
      L_e: L_e, refl1: config.refl1, refl2: config.refl2, alpha_i: alphaWithMirrors
    };
    var scales;
    if (fourLevel) {
      scales = E.rates.fourLevel.scales(inputs);
    } else {
      inputs.N_t = medium.N_t;
      scales = E.rates.threeLevel.scales(inputs);
    }
    var thresholdRate = fourLevel ? 1 : scales.n_t + 1;
    var gth = E.cavity.thresholdGain({
      refl1: config.refl1, refl2: config.refl2, alpha_i: alphaWithMirrors, l_g: config.l_g
    });

    var d = {
      medium: medium.id,
      scheme: medium.scheme,
      pump: setup.pump,
      lam: medium.lam,
      tau: medium.tau,
      I_sat: medium.I_sat,
      L_e: L_e,
      // The mirrors (optics.resonator): stability, the mode, F, their loss.
      resonator: resonator,
      // The rod's thermal lens (stage 13c): its focal length, m; null
      // without one, or with no heat (the pump off).
      thermalFocus: read.lens === 0 ? null : 1 / read.lens,
      // α_i with the mirrors' loss spread over the rod, m⁻¹.
      alphaWithMirrors: alphaWithMirrors,
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
      // The pump rate at threshold in the units of the rate equations, N_c/τ
      // (§11.2): 1 for four levels (x = 1), w_th(n_t − 1) = n_t + 1 for three
      // (two levels, with no threshold, use the same). A steady laser's
      // stimulated emission y·p is this times x − 1.
      thresholdRate: thresholdRate,
      // The steady output at twice threshold, the page's unit of light (its
      // beam and its chart): p = x − 1 = 1 for four levels, p = (n_t + 1)(x − 1)
      // = n_t + 1 for three.
      powerAtTwiceThreshold: scales.powerPerP * thresholdRate,
      sOnePhoton: scales.sOnePhoton,
      beta: config.beta,
      qSwitch: config.qSwitch,
      // The loss with the Q-switch closed (the filter unbleached), in units
      // of the open cavity's: the inversion y it holds back without lasing.
      lossClosed: closedLoss(config, scales.gamma),
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
      steadyFourLevel(d, config, g0);                    // no discharge has a Q-switch (readConfig)
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
    if (config.qSwitch === "none") {
      steadyFourLevel(d, config, d.g0);
    } else {
      // Behind the filter the inversion without light, x, must reach the
      // closed loss before the laser starts: that much more pump. It
      // pulses, so it has no steady numbers (none worked out).
      d.pumpThreshold *= startingLoss(config, d.gamma);
      noSteadyState(d);
    }
    return d;
  }

  // derive(config) -> the still numbers of the bench, in SI:
  //   for every bench: medium, scheme, pump, lam, tau, I_sat, L_e,
  //   resonator (optics.resonator of the config's mirrors: stable, g1, g2,
  //   the mode, focus1, focus2, the mirrors' loss; with the rod's thermal
  //   lens in it), thermalFocus (that lens's focal length, m, null without
  //   one: only a steady pump on Nd:YAG, stage 13c), alphaWithMirrors, gamma
  //   (single pass), gth, N_c, tau_c, eps, powerPerP, powerPerPhoton,
  //   thresholdRate, powerAtTwiceThreshold, sOnePhoton, beta; R_c for four
  //   levels; N_t, n_t for three and two,
  //   and wThreshold for three (null if n_t ≤ 1).
  //   a steady pump (light, discharge): x, ySteady (the steady y), P_out
  //   (W); for four levels also g0, T_opt and T_best (null with no loss
  //   but the coupler's: α_i = 0 and mirrors that lose nothing), period and t_damp (null at or below threshold); light also
  //   R_p, pumpThreshold (W) and slope, a discharge currentThreshold (A,
  //   null if the tube never reaches threshold). The two-level atom, which
  //   has no threshold: x null, w = W_p·τ, ySteady < 0, P_out = 0.
  //   a flashlamp: flashPeak (the lamp's peak, W) and xPeak (the pump then
  //   in units of threshold; null for two levels). Its steady numbers are
  //   null.
  //   with a Q-switch: qSwitch, and lossClosed, the loss with it closed
  //   (the filter unbleached) over the open cavity's, so the inversion it
  //   holds back; null without one. The other numbers are the open
  //   cavity's, except for a steady pump behind a Q-switch, which pulses:
  //   no steady numbers (ySteady, P_out, slope, T_opt, T_best, period and
  //   t_damp null), and pumpThreshold the pump that starts it behind the
  //   closed filter (lossClosed times the open cavity's).
  //   Every number a bench does not have is null.
  function derive(config) {
    var where = at("derive");
    var read = readConfig(where, config);
    return compute(where, config, read);
  }

  /* ---------- the simulation ---------- */

  // The lowest inversion a medium can have: none for four levels, every
  // ion down (ΔN = −N_t) for three and two.
  function lowestN(medium) {
    return medium.scheme === "four-level" ? 0 : -medium.N_t;
  }

  // start(config) -> { t, N, lnPhi, flash, opensAt, absorber }: no
  // inversion for four levels, every ion down (ΔN = −N_t) for three and
  // two, one photon (ln 1 = 0), no flash yet, a shutter that has not
  // opened, a filter that has recovered (absorber 1) if there is one.
  function start(config) {
    var read = readConfig(at("start"), config);
    var N = lowestN(read.medium);
    var absorber = config.qSwitch === "absorber" ? 1 : null;
    return { t: 0, N: N, lnPhi: 0, flash: null, opensAt: null, absorber: absorber };
  }

  function copySim(sim) {
    return {
      t: sim.t, N: sim.N, lnPhi: sim.lnPhi, flash: copyFlash(sim.flash),
      opensAt: sim.opensAt, absorber: sim.absorber
    };
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
    if (sim.opensAt !== null) check.atLeast(where, "sim.opensAt", sim.opensAt, 0);
    if (sim.absorber !== null) check.between(where, "sim.absorber", sim.absorber, 0, 1);
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

  // A simulation that does not fit the bench (a page that kept the
  // simulation of its last bench) is refused, not quietly misread: a
  // flash on a bench without a lamp, a shutter's opening on a bench
  // without a shutter, a filter's state that the bench has not, or none
  // when it has one.
  function refuseStrangeSim(where, sim, read, config) {
    var again = " Start the simulation again for a new bench.";
    if (sim.flash !== null && read.setup.pump !== "flashlamp") {
      check.fail(where, "sim.flash is a flash fired at " + sim.flash.at + " s, but this bench has no " +
        "flashlamp (its pump is " + read.setup.pump + ")." + again);
    }
    if (sim.opensAt !== null && !hasShutter(config)) {
      check.fail(where, "sim.opensAt is " + sim.opensAt + " s, but this bench has no shutter (its qSwitch is " +
        config.qSwitch + ")." + again);
    }
    var filterWord = ": a filter's state is a number exactly when there is a filter.";
    if (config.qSwitch === "absorber" && sim.absorber === null) {
      check.fail(where, "sim.absorber is null, but this bench's qSwitch is absorber" + filterWord + again);
    }
    if (config.qSwitch !== "absorber" && sim.absorber !== null) {
      check.fail(where, "sim.absorber is " + sim.absorber + ", but this bench's qSwitch is " + config.qSwitch +
        filterWord + again);
    }
  }

  // fire({ sim, config }) -> a copy of sim with a flash fired now, of the
  // config's flashEnergy and flashTime, and a shutter (cell or prism) set
  // to open qDelay later. A flash fired while one runs replaces it.
  function fire(params) {
    var where = at("fire");
    check.params(where, params, ["sim", "config"]);
    var sim = readSim(where, params.sim);
    var config = params.config;
    var read = readConfig(where, config);
    if (read.setup.pump !== "flashlamp") {
      check.fail(where, "needs a config with pump: \"flashlamp\", got " + check.describe(config.pump) + ".");
    }
    refuseStrangeSim(where, sim, read, config);
    var fired = copySim(sim);
    fired.flash = { at: sim.t, flashEnergy: config.flashEnergy, flashTime: config.flashTime };
    // A shutter is closed again, to open qDelay after this flash.
    fired.opensAt = hasShutter(config) ? sim.t + config.qDelay : null;
    return fired;
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

  // The shutter's extra single-pass loss (a cell or a prism) as a function
  // of the time t (s), checked once here (the solver calls it several
  // times a step): closed until the simulation has an opening time.
  function shutterLossFunction(config, opensAt) {
    if (opensAt === null) {
      var closed = E.qswitch.closedLoss(config.leak);
      return function () { return closed; };
    }
    var loss;
    if (config.qSwitch === "cell") {
      loss = E.qswitch.cellLossFunction({ leak: config.leak, switchTime: config.switchTime });
    } else {
      loss = E.qswitch.prismLossFunction({
        leak: config.leak, rotation: config.rotation, angleTolerance: config.angleTolerance
      });
    }
    return function (t) { return loss(t - opensAt); };
  }

  // The times after t and before t + seconds (s, in order) where advance
  // starts a new solver call: where each of the prism's windows opens,
  // PRISM_WINDOW θ_tol before it lines up. On both sides of a window the
  // loss is the leak's, so a call that began before it could step right
  // over it (measured: a 200 µs call over ruby's lined-up prism, 12 steps
  // and no pulse); a new call starts with a short step and finds it. The
  // cell needs no cut: once open it stays open, and the solver's error
  // control finds the corners of its switching (measured in stage 8a: the
  // same pulse, 7 % more steps, than with cuts there).
  // A run needs at least one step from each cut, so at most maxSteps of
  // them are made: the work here stays bounded however fast the prism.
  function cutsOf(config, opensAt, t, seconds, maxSteps) {
    var cuts = [];
    if (opensAt === null || config.qSwitch !== "prism") return cuts;
    var turn = 1 / config.rotation;
    var half = PRISM_WINDOW * config.angleTolerance / (2 * Math.PI * config.rotation);
    // The first window that opens after t (opensAt + k·turn − half > t),
    // then one each turn until the run's end.
    var k = Math.floor((t - opensAt + half) / turn) + 1;
    for (var opens = opensAt + k * turn - half; opens < t + seconds && cuts.length < maxSteps; opens += turn) {
      cuts.push(opens);
    }
    return cuts;
  }

  // advance({ sim, config, seconds, maxSteps }) -> { sim, reachedEnd, steps, peak }
  // Moves the simulation `seconds` of simulated time on, with at most
  // maxSteps solver steps (accepted or rejected). Out of steps, it stops
  // where it got to: reachedEnd is false, and the next call carries on.
  // peak = { t, power }: the highest output (W) at the solver's points
  // in the call, the start included.
  function advance(params) {
    var where = at("advance");
    check.params(where, params, ["sim", "config", "seconds", "maxSteps"]);
    var sim = readSim(where, params.sim);
    var config = params.config;
    var read = readConfig(where, config);
    var lowest = lowestN(read.medium);
    check.atLeast(where, "sim.N", sim.N, lowest);
    refuseStrangeSim(where, sim, read, config);
    var seconds = check.atLeast(where, "seconds", params.seconds, 0);
    var maxSteps = check.integerAtLeast(where, "maxSteps", params.maxSteps, 1);
    var d = compute(where, config, read);
    if (seconds === 0) {
      return {
        sim: copySim(sim),
        reachedEnd: true,
        steps: 0,
        peak: { t: sim.t, power: d.powerPerPhoton * Math.exp(sim.lnPhi) }
      };
    }
    var tau = d.tau;

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
    // liftToSeed raises the photons to what the seed keeps in an open
    // cavity; a closed Q-switch, losing 1 + q times as much, keeps
    // 1/(1 + q) of that. Lifted to the open cavity's level, they fell back
    // in every call: 64 steps a call behind Nd:YAG's closed cell, 4 with
    // this (stage 8a). β/(1 + q) is still never above the steady level.
    var state = [sim.N / d.N_c, sim.lnPhi + d.sOnePhoton];
    var liftBeta = d.beta / (1 + extraLossNow(config, sim, d.gamma));
    if (d.scheme === "four-level") {
      state = E.rates.fourLevel.liftToSeed({ state: state, beta: liftBeta });
    } else {
      state = E.rates.threeLevel.liftToSeed({ state: state, n_t: d.n_t, beta: liftBeta });
    }
    // t′ counts from this call's start: the flash's pump is a function of it.
    var f = derivativesFor(d, pump, d.beta, d.eps);
    if (hasShutter(config)) {
      var shutter = shutterLossFunction(config, sim.opensAt);
      f = E.qswitch.withLoss({
        f: f, eps: d.eps,
        loss: function (tPrime) { return shutter(sim.t + tPrime * tau) / d.gamma; }
      });
    } else if (config.qSwitch === "absorber") {
      var filter = E.qswitch.ABSORBERS[config.absorber];
      // The filter's beam is the mode's (A_a = A): σ_a·c·τ/(A·L_e·p₁) (§9.4).
      f = E.qswitch.withAbsorber({
        f: f, eps: d.eps,
        depth: closedExtra(config, d.gamma),
        recovery: tau / filter.tau,
        bleach: filter.sigma * c * tau / (config.area * d.L_e * Math.exp(d.sOnePhoton))
      });
      state.push(sim.absorber);
    }

    // The implicit solver: below threshold the photons sit at their seed
    // level, where dopri5's step would stay below 3.3ε/(1 − y) (§11.3).
    // One solver call from each cut to the next (t′ from this call's start).
    var cuts = cutsOf(config, sim.opensAt, sim.t, seconds, maxSteps);
    var steps = 0;
    var reachedEnd = true;
    var tNow = sim.t;
    var peak = { t: sim.t, s: state[1] };
    var from = 0;
    for (var i = 0; i <= cuts.length; i++) {
      var last = i === cuts.length;
      var to = last ? seconds / tau : (cuts[i] - sim.t) / tau;
      // A cut that rounds onto the last one (or onto the end) leaves
      // nothing to run, and the solver refuses an empty interval.
      if (to <= from) continue;
      var run = E.ode.rosenbrock({
        f: f, t0: from, state0: state, t1: to, maxSteps: maxSteps - steps, peakOf: 1
      });
      steps += run.accepted + run.rejected;
      state = run.state;
      if (run.peak.value > peak.s) peak = { t: sim.t + run.peak.t * tau, s: run.peak.value };
      if (!run.reachedEnd) {
        reachedEnd = false;
        tNow = sim.t + run.t * tau;
        break;
      }
      if (steps >= maxSteps && !last) {
        reachedEnd = false;
        tNow = cuts[i];
        break;
      }
      from = to;
    }

    var next = copySim(sim);
    next.t = reachedEnd ? sim.t + seconds : tNow;
    // With the pump off y decays below the solver's atol, where its error
    // control stops watching it, and a step can end a hair below its
    // lowest value (measured, four levels: 30 % coupler, after 35τ). The
    // next call would refuse it. The filter's share is kept in [0, 1] for
    // the same reason.
    next.N = Math.max(lowest, state[0] * d.N_c);
    next.lnPhi = state[1] - d.sOnePhoton;
    if (config.qSwitch === "absorber") next.absorber = clampShare(state[2]);
    return {
      sim: next,
      reachedEnd: reachedEnd,
      steps: steps,
      peak: { t: peak.t, power: d.powerPerP * Math.exp(peak.s) }
    };
  }

  // pumpNow({ sim, config }) -> { x, w, smallSignal, overThreshold }
  // The pump at the moment of sim: steady, or the flash fired last (none
  // before Fire), with the energy and t_p it was fired with.
  //   x            the pump in units of the open cavity's threshold: R_p/R_c
  //                for four levels (a discharge: its x), w/w_th for three;
  //                null for the two-level atom, which has no threshold
  //   overThreshold  the pump over the pump that starts the laser: x,
  //                except behind a filter, whose closed loss L the
  //                inversion must reach first: x/L for four levels,
  //                w/w_th(L) with w_th(L) = (n_t + L)/(n_t − L) for three
  //                (null when n_t ≤ L: even every ion up is short of it);
  //                null for the two-level atom
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
    refuseStrangeSim(where, sim, read, config);
    var d = compute(where, config, read);
    // The pump as advance runs it: x for four levels, w for three and two.
    var level;
    if (d.pump === "flashlamp") {
      var flash = sim.flash;
      if (flash === null) level = 0;
      else level = flashPump(d, config, flash.flashEnergy, flash.flashTime, sim.t - flash.at)(0);
    } else {
      level = d.scheme === "four-level" ? d.x : d.w;
    }
    var startLoss = startingLoss(config, d.gamma);
    if (d.scheme === "four-level") {
      return { x: level, w: null, smallSignal: level, overThreshold: level / startLoss };
    }
    if (d.scheme === "three-level") {
      // The photon-free y = n_t(w − 1)/(w + 1) reaches L at this w (§2.2).
      var startW = d.n_t > startLoss ? (d.n_t + startLoss) / (d.n_t - startLoss) : null;
      return {
        x: d.wThreshold === null ? null : level / d.wThreshold,
        w: level,
        smallSignal: d.n_t * (level - 1) / (level + 1),
        overThreshold: startW === null ? null : level / startW
      };
    }
    return { x: null, w: level, smallSignal: -d.n_t / (1 + 2 * level), overThreshold: null };
  }

  // The Q-switch's extra single-pass loss at the moment of sim, over γ.
  function extraLossNow(config, sim, gamma) {
    if (hasShutter(config)) return shutterLossFunction(config, sim.opensAt)(sim.t) / gamma;
    if (config.qSwitch === "absorber") return sim.absorber * closedExtra(config, gamma);
    return 0;
  }

  // lossNow({ sim, config }) -> the cavity's loss at the moment of sim, in
  // units of the open cavity's: 1 + the shutter's extra loss over γ, or
  // 1 + the filter's (its share still unbleached times its depth); 1
  // without a Q-switch.
  function lossNow(params) {
    var where = at("lossNow");
    check.params(where, params, ["sim", "config"]);
    var sim = readSim(where, params.sim);
    var config = params.config;
    var read = readConfig(where, config);
    refuseStrangeSim(where, sim, read, config);
    return 1 + extraLossNow(config, sim, compute(where, config, read).gamma);
  }

  // switchNow({ sim, config }) -> { loss, open }, or null without a
  // Q-switch: what the page draws of the switch at the moment of sim.
  //   loss   the cavity's loss over the open cavity's (lossNow)
  //   open   how far the loss has come down from the closed switch's to
  //          the open cavity's: (lossClosed − loss)/(lossClosed − 1), 0
  //          closed to 1 open; for the filter, the share bleached
  function switchNow(params) {
    var where = at("switchNow");
    check.params(where, params, ["sim", "config"]);
    var sim = readSim(where, params.sim);
    var config = params.config;
    var read = readConfig(where, config);
    refuseStrangeSim(where, sim, read, config);
    if (config.qSwitch === "none") return null;
    var d = compute(where, config, read);
    var loss = 1 + extraLossNow(config, sim, d.gamma);
    // A filter that lets all the light through (T₀ = 1), or a shutter
    // whose leak is 1, holds nothing back: always open.
    var open = d.lossClosed > 1 ? clampShare((d.lossClosed - loss) / (d.lossClosed - 1)) : 1;
    return { loss: loss, open: open };
  }

  function clampShare(value) {
    return Math.min(1, Math.max(0, value));
  }

  // carryOver({ sim, config }) -> a copy of sim for `config`, the same
  // bench with another Q-switch (or none): the atoms, the photons, the
  // flash and the time go on; the new switch starts closed: a shutter
  // until the next Fire (no opening time), a filter dark (absorber 1, as
  // recovered); nothing for no switch. The page turns its filter on or
  // off this way without starting the run again.
  function carryOver(params) {
    var where = at("carryOver");
    check.params(where, params, ["sim", "config"]);
    var sim = readSim(where, params.sim);
    var config = params.config;
    var read = readConfig(where, config);
    if (sim.flash !== null && read.setup.pump !== "flashlamp") {
      check.fail(where, "sim.flash is a flash fired at " + sim.flash.at + " s, but this bench has no " +
        "flashlamp (its pump is " + read.setup.pump + "): carryOver only changes the Q-switch.");
    }
    // An inversion this medium cannot have is refused here, not later by
    // advance: a ruby simulation (every ion down) carried to Nd:YAG. (A
    // four-level simulation inside three levels' range cannot be told
    // from a three-level one: the caller carries only its own bench's.)
    if (read.medium.scheme === "four-level") {
      check.atLeast(where, "sim.N", sim.N, 0);
    } else {
      check.between(where, "sim.N", sim.N, -read.medium.N_t, read.medium.N_t);
    }
    var next = copySim(sim);
    next.opensAt = null;
    next.absorber = config.qSwitch === "absorber" ? 1 : null;
    return next;
  }

  // giantPulse({ sim, config }) -> { eta_E, energy, peakPower, width }, or
  // null: §4.3's giant pulse if the cavity opened fully now, with the
  // inversion of sim (x = N/N_c over the open cavity's threshold). null
  // below PULSE_FROM times threshold, and for the two-level atom, which
  // never lases.
  function giantPulse(params) {
    var where = at("giantPulse");
    check.params(where, params, ["sim", "config"]);
    var sim = readSim(where, params.sim);
    var config = params.config;
    var read = readConfig(where, config);
    refuseStrangeSim(where, sim, read, config);
    var d = compute(where, config, read);
    var x = sim.N / d.N_c;
    if (d.scheme === "two-level" || !(x >= PULSE_FROM)) return null;
    return E.qswitch.giantPulse({
      x: x,
      N_p: d.N_c,
      V_a: config.area * config.l_g,
      nu: read.medium.nu,
      tau_c: d.tau_c,
      gamma: d.gamma,
      gammaOut: Math.abs(Math.log(config.refl2)),
      scheme: d.scheme
    });
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
  // threshold: y = 1, the open cavity's loss, with no Q-switch and with
  // a cell or a prism (opened at the inversion's peak, it gives a pulse
  // only if y > 1 there); behind a filter, which must be overcome before
  // any light builds up, y = lossClosed. For four levels y is
  // proportional to the energy (its equation is linear and starts at 0),
  // so one run gives it; for three levels the pump multiplies y, and it
  // is found by bisection. Two levels never reach it, nor three whose
  // target is at or above n_t (every ion up).
  function flashThreshold(config) {
    var where = at("flashThreshold");
    var read = readConfig(where, config);
    if (read.setup.pump !== "flashlamp") {
      check.fail(where, "needs a config with pump: \"flashlamp\", got " + check.describe(config.pump) + ".");
    }
    var d = compute(where, config, read);
    var target = startingLoss(config, d.gamma);
    if (d.scheme === "two-level") return null;
    if (d.scheme === "three-level" && target >= d.n_t) return null;
    // The energy whose peak pump is the threshold pump: the peak of y lags
    // behind the pump's, so the threshold energy is above it.
    var atPeak = Math.E * config.flashTime / pumpLevel(d, config, config.flashShare);
    if (d.scheme === "four-level") {
      return target * atPeak / photonFreePeak(d, config, atPeak);
    }
    atPeak *= d.wThreshold;
    var low = 0;
    var high = atPeak;
    var doublings = 0;
    while (photonFreePeak(d, config, high) < target) {
      low = high;
      high *= 2;
      doublings += 1;
      if (doublings > 60) return null;
    }
    // To 10⁻⁶ of the energy: the page shows 3 or 4 digits.
    for (var i = 0; i < 60 && high - low > 1e-6 * high; i++) {
      var middle = (low + high) / 2;
      if (photonFreePeak(d, config, middle) < target) low = middle;
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
    flashThreshold: flashThreshold,
    qSwitchesFor: qSwitchesFor,
    hasThermalLens: hasThermalLens,
    withQSwitch: withQSwitch,
    lossNow: lossNow,
    switchNow: switchNow,
    carryOver: carryOver,
    giantPulse: giantPulse,
    beamPath: beamPath,
    MIRROR_SHAPES: MIRROR_SHAPES
  });
})(this);
