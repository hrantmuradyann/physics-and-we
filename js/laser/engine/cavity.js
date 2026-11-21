/* ============================================================================
   cavity.js — the resonator without time: threshold, photon lifetime,
   longitudinal modes, finesse and steady output power.

   PART OF THE LASER ENGINE (js/laser/engine/): plain numbers in and out, SI
   units, nothing on the page. Needs check.js and constants.js to be loaded
   first.

   Physics: docs/laser-physics.md §3.1–3.6. Names are the code names of the
   doc's symbol table (§0). A function with more than one input takes one
   object of named values (see check.js):
     LaserEngine.cavity.thresholdGain({ refl1: 0.99, refl2: 0.98, alpha_i: 0, l_g: 0.3 })
     LaserEngine.cavity.freeSpectralRange(0.3)
   A value that is missing, not a finite number, or impossible throws an
   error that names it, and so does a name the function does not use (an
   extra loss it would otherwise quietly ignore, or a misspelling). So does
   a cavity with no loss at all, or with too little to divide by (10⁻³²⁰):
   its finesse, photon lifetime and power would be infinite.

   Losses come in two kinds, and the names say which:
     gamma       single-pass logarithmic loss, γ = αl + ½·ln(1/(R₁R₂))
     T_oc, L_i   round-trip fractions: output-coupler transmission and all
                   other losses. For small losses γ ≈ (T_oc + L_i)/2.

   Tests: tests/laser/cavity.test.js
   ========================================================================== */
(function (root) {
  "use strict";

  var E = root.LaserEngine = root.LaserEngine || {};
  if (!E.check || !E.constants) {
    throw new Error("cavity.js needs js/laser/engine/check.js and constants.js to be loaded first.");
  }

  var check = E.check;
  var c = E.constants.c;

  // The name errors start with: the function the caller called.
  function at(functionName) {
    return "LaserEngine.cavity." + functionName;
  }

  function failLossless(where) {
    check.fail(where, "this cavity has no loss at all (or too little to compute with), " +
      "so the answer would be infinite.");
  }

  /* ---------- threshold (§3.1) ---------- */

  // Single-pass logarithmic loss γ = α·l + ½·ln(1/(R₁R₂)).   (§3.2)
  // where: the public function that was called, for its errors.
  function lossPerPass(where, params) {
    check.params(where, params, ["refl1", "refl2", "alpha_i", "l_g"]);
    var refl1 = check.reflectivity(where, "refl1", params.refl1);
    var refl2 = check.reflectivity(where, "refl2", params.refl2);
    var alpha_i = check.atLeast(where, "alpha_i", params.alpha_i, 0);
    var l_g = check.positive(where, "l_g", params.l_g);
    // ½·ln(1/(R₁R₂)) written as −½(ln R₁ + ln R₂): the product R₁R₂ of two
    // tiny reflectivities would round to 0 and give an infinite loss.
    var gamma = alpha_i * l_g - 0.5 * (Math.log(refl1) + Math.log(refl2));
    if (gamma === 0) failLossless(where);
    return gamma;
  }

  // singlePassLoss({ refl1, refl2, alpha_i, l_g })  ->  γ
  function singlePassLoss(params) {
    return lossPerPass(at("singlePassLoss"), params);
  }

  // Threshold gain g_th = α + ln(1/(R₁R₂))/(2l) = γ/l, where the light just
  // survives a round trip.  m⁻¹.
  // thresholdGain({ refl1, refl2, alpha_i, l_g })
  function thresholdGain(params) {
    return lossPerPass(at("thresholdGain"), params) / params.l_g;
  }

  // Threshold inversion ΔN_th = g_th/σ.  m⁻³.
  // thresholdInversion({ gth, sigma })
  function thresholdInversion(params) {
    var where = at("thresholdInversion");
    check.params(where, params, ["gth", "sigma"]);
    var gth = check.positive(where, "gth", params.gth);
    var sigma = check.positive(where, "sigma", params.sigma);
    return gth / sigma;
  }

  /* ---------- photon lifetime, Q, linewidth (§3.2) ---------- */

  // Effective (optical) length L_e = L + (n − 1)·l of a cavity of length L
  // holding a medium of length l_g. The index sets the round-trip time, so
  // it is the group index: pass media.get(id).nGroup (for the diode 4, not
  // its phase index n = 3.6).  m.
  // effectiveLength({ L, l_g, nGroup })
  function effectiveLength(params) {
    var where = at("effectiveLength");
    check.params(where, params, ["L", "l_g", "nGroup"]);
    var L = check.positive(where, "L", params.L);
    var l_g = check.atLeast(where, "l_g", params.l_g, 0);
    var nGroup = check.atLeast(where, "nGroup", params.nGroup, 1);
    // A medium that fills the cavity (gas tube, diode chip) often arrives as
    // l_g a hair above L after float arithmetic (0.7 − 0.4 < 0.3): allow it.
    if (l_g > L * (1 + 1e-9)) {
      check.fail(where, "l_g must not be longer than L (got l_g = " + l_g + ", L = " + L + ").");
    }
    return L + (nGroup - 1) * l_g;
  }

  // Photon lifetime τ_c = L_e/(c·γ): the time of one pass, divided by the
  // share of the light lost per pass.  s.
  // photonLifetime({ L_e, gamma })
  function photonLifetime(params) {
    var where = at("photonLifetime");
    check.params(where, params, ["L_e", "gamma"]);
    var L_e = check.positive(where, "L_e", params.L_e);
    var gamma = check.positive(where, "gamma", params.gamma);
    var tau_c = L_e / (c * gamma);
    // A loss too small to divide by (γ = 10⁻³²⁰) counts as no loss at all.
    if (!isFinite(tau_c)) failLossless(where);
    return tau_c;
  }

  // Quality factor Q = 2πν·τ_c.
  // qFactor({ nu, tau_c })
  function qFactor(params) {
    var where = at("qFactor");
    check.params(where, params, ["nu", "tau_c"]);
    var nu = check.positive(where, "nu", params.nu);
    var tau_c = check.positive(where, "tau_c", params.tau_c);
    return 2 * Math.PI * nu * tau_c;
  }

  // Linewidth of the empty (cold) cavity, Δν_c = 1/(2πτ_c).  Hz.
  // (The same formula as spectrum.naturalWidth, for a different lifetime.)
  function coldLinewidth(tau_c) {
    check.positive(at("coldLinewidth"), "tau_c", tau_c);
    return 1 / (2 * Math.PI * tau_c);
  }

  /* ---------- longitudinal modes (§3.3) and finesse (§3.4) ---------- */

  // Free spectral range c/(2L_e): the spacing of the longitudinal modes.  Hz.
  // As a wavelength difference: units.dlamFromDnu({ dnu: fsr, lam }) = λ²/(2L_e).
  function freeSpectralRange(L_e) {
    check.positive(at("freeSpectralRange"), "L_e", L_e);
    return c / (2 * L_e);
  }

  // Finesse F = π(R₁R₂)^¼/(1 − √(R₁R₂)) of the mirrors. For small losses the
  // cold-cavity linewidth is Δν_FSR/F. It counts only the mirrors (an
  // alpha_i or L_i is refused as an unknown input); with internal loss, take
  // the linewidth from coldLinewidth(photonLifetime(...)) instead.
  // finesse({ refl1, refl2 })
  function finesse(params) {
    var where = at("finesse");
    check.params(where, params, ["refl1", "refl2"]);
    var refl1 = check.reflectivity(where, "refl1", params.refl1);
    var refl2 = check.reflectivity(where, "refl2", params.refl2);
    var product = refl1 * refl2;
    if (product === 1) failLossless(where);
    return Math.PI * Math.pow(product, 0.25) / (1 - Math.sqrt(product));
  }

  // About how many modes fit in a band: N_modes ≈ bandwidth/Δν_FSR. With
  // the gain linewidth: the modes under the gain curve. With
  // spectrum.oscillatingBandwidth: the modes that oscillate.
  // modeCount({ bandwidth, fsr })
  function modeCount(params) {
    var where = at("modeCount");
    check.params(where, params, ["bandwidth", "fsr"]);
    var bandwidth = check.atLeast(where, "bandwidth", params.bandwidth, 0);
    var fsr = check.positive(where, "fsr", params.fsr);
    return bandwidth / fsr;
  }

  /* ---------- output power (§3.6) ---------- */

  // Rigrod formula for low gain and small losses (He-Ne, CO₂, most CW lasers):
  //   P_out = A·(T·I_sat/2)·(2g₀l/(T + L_i) − 1)
  // with area A the mode area in the gain medium. 0 below threshold.  W.
  // I_sat must come from media.get(): for ruby it already has the
  // three-level factor 2 (§2.2).
  // rigrodLowGain({ g0, l_g, T_oc, L_i, I_sat, area })
  function rigrodLowGain(params) {
    var where = at("rigrodLowGain");
    check.params(where, params, ["g0", "l_g", "T_oc", "L_i", "I_sat", "area"]);
    var g0 = check.finite(where, "g0", params.g0);
    var l_g = check.positive(where, "l_g", params.l_g);
    var T_oc = check.between(where, "T_oc", params.T_oc, 0, 1);
    var L_i = check.between(where, "L_i", params.L_i, 0, 1);
    var I_sat = check.positive(where, "I_sat", params.I_sat);
    var area = check.positive(where, "area", params.area);
    if (T_oc + L_i === 0) failLossless(where);

    var overThreshold = 2 * g0 * l_g / (T_oc + L_i) - 1;
    if (overThreshold <= 0) return 0;
    // A loss too small to divide by (T_oc + L_i = 10⁻³²⁴) counts as no loss
    // at all: the answer would be Infinity, or 0·Infinity = NaN.
    if (overThreshold === Infinity) failLossless(where);
    return area * (T_oc * I_sat / 2) * overThreshold;
  }

  // Exact Rigrod formula for any gain and reflectivity (ruby with R₂ = 0.5,
  // a diode with cleaved facets), with no internal loss (α = 0; an alpha_i
  // or L_i is refused as an unknown input; for small internal losses use
  // rigrodLowGain):
  //   P_out = A·(1 − R₂)√R₁ / ((√R₁ + √R₂)(1 − √(R₁R₂))) · I_sat·(g₀l + ln√(R₁R₂))
  // 0 below threshold.  W.  (tests/laser/cavity.test.js checks it against a
  // numerical solution, light followed both ways through the rod.)
  // rigrodExact({ g0, l_g, refl1, refl2, I_sat, area })
  function rigrodExact(params) {
    var where = at("rigrodExact");
    check.params(where, params, ["g0", "l_g", "refl1", "refl2", "I_sat", "area"]);
    var g0 = check.finite(where, "g0", params.g0);
    var l_g = check.positive(where, "l_g", params.l_g);
    var refl1 = check.reflectivity(where, "refl1", params.refl1);
    var refl2 = check.reflectivity(where, "refl2", params.refl2);
    var I_sat = check.positive(where, "I_sat", params.I_sat);
    var area = check.positive(where, "area", params.area);
    if (refl1 * refl2 === 1) failLossless(where);

    var root1 = Math.sqrt(refl1);
    var root2 = Math.sqrt(refl2);
    var rootBoth = Math.sqrt(refl1 * refl2);
    var overThreshold = g0 * l_g + Math.log(rootBoth);
    if (overThreshold <= 0) return 0;
    var mirrors = (1 - refl2) * root1 / ((root1 + root2) * (1 - rootBoth));
    return area * mirrors * I_sat * overThreshold;
  }

  // The output-coupler transmission that gives the most power (low gain):
  // T_opt = √(2g₀l·L_i) − L_i.
  //   - When 2g₀l ≤ L_i the laser cannot start with any coupler: 0.
  //   - With L_i = 0 (and a laser that can start) there is no best coupler:
  //     the weaker it is, the more power. That throws.
  //   - At high gain the formula can ask for T ≥ 1, a coupler that is no
  //     mirror at all. The low-gain formula does not hold there; that throws
  //     too, rather than give a value the next calculation must refuse.
  // optimumCoupler({ g0, l_g, L_i })
  function optimumCoupler(params) {
    var where = at("optimumCoupler");
    check.params(where, params, ["g0", "l_g", "L_i"]);
    var g0 = check.finite(where, "g0", params.g0);
    var l_g = check.positive(where, "l_g", params.l_g);
    var L_i = check.between(where, "L_i", params.L_i, 0, 1);
    var roundTripGain = 2 * g0 * l_g;
    if (roundTripGain <= L_i) return 0;
    if (L_i === 0) {
      check.fail(where, "L_i must be above 0: with no other loss there is no best coupler " +
        "(the weaker it is, the more power).");
    }
    var T_opt = Math.sqrt(roundTripGain * L_i) - L_i;
    if (T_opt >= 1) {
      check.fail(where, "the gain is too high for the low-gain formula (it asks for T = " +
        T_opt + "); compare rigrodExact over a range of couplers instead.");
    }
    return T_opt;
  }

  /* ---------- an uncoated face (§9.1, §12) ---------- */

  // Reflectivity of a bare face of index n, light at normal incidence from
  // air: ((n − 1)/(n + 1))². A ruby end face reflects 7.6 %; §4.3 uses it
  // as the weak mirror of a parasitic cavity when the faces are not angled.
  function faceReflectivity(n) {
    check.atLeast(at("faceReflectivity"), "n", n, 1);
    var ratio = (n - 1) / (n + 1);
    return ratio * ratio;
  }

  E.cavity = Object.freeze({
    singlePassLoss: singlePassLoss,
    thresholdGain: thresholdGain,
    thresholdInversion: thresholdInversion,
    effectiveLength: effectiveLength,
    photonLifetime: photonLifetime,
    qFactor: qFactor,
    coldLinewidth: coldLinewidth,
    freeSpectralRange: freeSpectralRange,
    finesse: finesse,
    modeCount: modeCount,
    rigrodLowGain: rigrodLowGain,
    rigrodExact: rigrodExact,
    optimumCoupler: optimumCoupler,
    faceReflectivity: faceReflectivity
  });
})(this);
