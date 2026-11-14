/* ============================================================================
   mutations.js — deliberate mistakes the engine tests must catch.

   Each entry makes ONE small change to ONE file: the kind of slip that
   is easy to make and easy to miss (a forgotten unit, a dropped factor of 2,
   a flipped sign). tests/laser/mutation-check.js applies them one at a time
   to a copy of the engine and runs every test. If no test fails, the tests
   have a hole: add a test that would have caught it.

     file     the file, relative to the top folder of the project
                (js/laser/engine/media.js, data/laser.json, ...)
     find     exact text to replace. It must appear exactly once in the file,
                so a list that has gone out of date is reported, not ignored.
     replace  the mistake. It must leave valid JavaScript / JSON: a typo that
                stops the file loading would be "caught" by every test and
                prove nothing.
     why      what real mistake this stands for

   Every build stage adds entries for its own formulas (docs/laser-plan.md,
   recipe step 5). This is not a test file itself: run it with
     node tests/laser/mutation-check.js
   ========================================================================== */
"use strict";

const MUTATIONS = [

  /* ---------- constants.js ---------- */
  {
    file: "js/laser/engine/constants.js",
    find: "var k = 1.380649e-23;",
    replace: "var k = 1.380649e-22;",
    why: "a constant typed with the wrong exponent"
  },
  {
    file: "js/laser/engine/constants.js",
    find: "return c * perCm * 100;",
    replace: "return c * perCm * 10;",
    why: "cm⁻¹ -> m⁻¹ converted with the wrong factor"
  },
  {
    file: "js/laser/engine/constants.js",
    find: "statvoltPerCm: c * 1e-4,",
    replace: "statvoltPerCm: c * 1e-2,",
    why: "Gaussian -> SI field unit off by 100"
  },
  {
    file: "js/laser/engine/constants.js",
    find: "return c * dlam / (lam * lam);",
    replace: "return c * dlam / lam;",
    why: "Δν = c·Δλ/λ² written without the square"
  },

  /* ---------- spectrum.js ---------- */
  {
    file: "js/laser/engine/spectrum.js",
    find: "return 1 / Math.expm1(energyOverKT(lam, T));",
    replace: "return 1 / (Math.exp(energyOverKT(lam, T)) - 1);",
    why: "plain exp(x) − 1 loses digits when hν ≪ kT"
  },
  {
    file: "js/laser/engine/spectrum.js",
    find: "return h * c / (k * T * Math.LN2);",
    replace: "return h * c / (k * T);",
    why: "crossover condition hν = kT·ln 2 without the ln 2"
  },
  {
    file: "js/laser/engine/spectrum.js",
    find: "return (deg2 / deg1) * Math.exp(-energyOverKT(lam, T));",
    replace: "return (deg1 / deg2) * Math.exp(-energyOverKT(lam, T));",
    why: "degeneracy ratio upside down"
  },
  {
    file: "js/laser/engine/check.js",
    find: "if (!isNumber(value) || value <= 0) {",
    replace: "if (value < 0) {",
    why: "input check that lets 0, NaN and text through"
  },
  {
    file: "js/laser/engine/check.js",
    find: "return typeof value === \"number\" && isFinite(value);",
    replace: "return typeof value === \"number\";",
    why: "input check that lets Infinity through"
  },
  {
    file: "js/laser/engine/spectrum.js",
    find: "var T = check.positive(where, \"T\", params.T);\n    var deg1 = check.positive(where, \"deg1\", params.deg1);",
    replace: "var T = check.positive(where, \"T\", params.T);\n    var deg1 = params.deg1;",
    why: "degeneracy not checked"
  },

  /* ---------- media.js ---------- */
  {
    file: "js/laser/engine/media.js",
    find: "sigma: 2.5e-20 * cm2,",
    replace: "sigma: 2.5e-20,",
    why: "ruby cross section left in cm²"
  },
  {
    file: "js/laser/engine/media.js",
    find: "lamMax: 870 * nm",
    replace: "lamMax: 870",
    why: "a wavelength without its unit"
  },
  {
    file: "js/laser/engine/media.js",
    find: "otherLines: [488 * nm],",
    replace: "otherLines: [488],",
    why: "an extra laser line without its unit"
  },
  {
    file: "js/laser/engine/media.js",
    find: "diffGain: 3e-16 * cm2,",
    replace: "diffGain: 3e-16,",
    why: "diode differential gain left in cm²"
  },
  {
    file: "js/laser/engine/media.js",
    find: "var perEmission = medium.scheme === \"three-level\" ? 2 : 1;",
    replace: "var perEmission = 1;",
    why: "three-level I_sat without its factor 2 (doc §2.2)"
  },
  {
    file: "js/laser/engine/media.js",
    find: "pumps: [\"lamp\"],\n      cw: true, pulsed: true",
    replace: "pumps: [\"lamp\"],\n      cw: true, pulsed: false",
    why: "CaF₂:Dy marked as unable to run Q-switched (doc §5.4)"
  },
  {
    file: "js/laser/engine/media.js",
    find: "tau: 0.28 * ms,",
    replace: "tau: 0.3 * ms,",
    why: "CO₂ lifetime that no longer gives the measured 22 W/cm²"
  },
  {
    file: "js/laser/engine/media.js",
    find: "copy[key] = Array.isArray(value) ? value.slice() : value;",
    replace: "copy[key] = value;",
    why: "get() hands out the table's own arrays"
  },
  {
    file: "js/laser/engine/media.js",
    find: "E.media = Object.freeze({",
    replace: "E.media = ({",
    why: "engine object left changeable"
  },
  {
    file: "js/laser/engine/media.js",
    find: "var C = E.constants;",
    replace: "var C = E.constants; var started = Date();",
    why: "the engine reads the clock"
  },

  /* The next ones were MISSED before the full-table test in media.test.js
     and the unit-factor test in constants.test.js existed (stage 1b review). */
  {
    file: "js/laser/engine/media.js",
    find: "sigma: 3e-20 * cm2,",
    replace: "sigma: 3e-20,",
    why: "Nd:glass cross section left in cm²"
  },
  {
    file: "js/laser/engine/media.js",
    find: "sigma: 3.9e-19 * cm2,",
    replace: "sigma: 3.9e-19,",
    why: "Ti:sapphire cross section left in cm²"
  },
  {
    file: "js/laser/engine/media.js",
    find: "sigma: 2e-16 * cm2,",
    replace: "sigma: 2e-16,",
    why: "dye cross section left in cm²"
  },
  {
    file: "js/laser/engine/media.js",
    find: "tau: 5 * ns,",
    replace: "tau: 5 * us,",
    why: "dye lifetime with the wrong time unit"
  },
  {
    file: "js/laser/engine/media.js",
    find: "dnu: 3.5 * GHz,",
    replace: "dnu: 3.5 * MHz,",
    why: "Ar-ion linewidth with the wrong frequency unit"
  },
  {
    file: "js/laser/engine/media.js",
    find: "n: 1.76,\n      ng: null,\n      pumps: [\"laser\"],",
    replace: "n: 1.67,\n      ng: null,\n      pumps: [\"laser\"],",
    why: "Ti:sapphire refractive index mistyped"
  },
  {
    file: "js/laser/engine/constants.js",
    find: "cm: 1e-2,",
    replace: "cm: 1e-3,",
    why: "centimetre factor with the wrong exponent"
  },
  {
    file: "js/laser/engine/constants.js",
    find: "cm3: 1e-6,",
    replace: "cm3: 1e-4,",
    why: "cm³ factor with the wrong exponent"
  },

  /* ---------- stage 2: spectrum.js (lineshapes, gain, mode comb) ---------- */
  {
    file: "js/laser/engine/spectrum.js",
    find: "return (dnu / (2 * Math.PI)) / (detuning * detuning + halfWidth * halfWidth);",
    replace: "return (dnu / Math.PI) / (detuning * detuning + halfWidth * halfWidth);",
    why: "Lorentzian with Δν/π instead of Δν/2π: integrates to 2"
  },
  {
    file: "js/laser/engine/spectrum.js",
    find: "return (2 / dnuD) * Math.sqrt(Math.LN2 / Math.PI) *",
    replace: "return (2 / dnuD) *",
    why: "Gaussian lineshape without its √(ln 2/π)"
  },
  {
    file: "js/laser/engine/spectrum.js",
    find: "var halfWidth = dnu / 2;",
    replace: "var halfWidth = dnu;",
    why: "Lorentzian with Δν taken as the half width"
  },
  {
    file: "js/laser/engine/spectrum.js",
    find: "Math.exp(-4 * Math.LN2 * detuning * detuning / (dnuD * dnuD));",
    replace: "Math.exp(-Math.LN2 * detuning * detuning / (dnuD * dnuD));",
    why: "Gaussian without the 4 in 4·ln 2: twice too wide"
  },
  {
    file: "js/laser/engine/spectrum.js",
    find: "return nu0 * Math.sqrt(8 * k * T * Math.LN2 / (M * c * c));",
    replace: "return nu0 * Math.sqrt(8 * k * T / (M * c * c));",
    why: "Doppler width without ln 2"
  },
  {
    file: "js/laser/engine/spectrum.js",
    find: "return A21 * lam0 * lam0 / (8 * Math.PI * n * n) * lineshapeValue;",
    replace: "return A21 * lam0 * lam0 / (8 * Math.PI * n) * lineshapeValue;",
    why: "cross section with n instead of n²"
  },
  {
    file: "js/laser/engine/spectrum.js",
    find: "return N2 - (deg2 / deg1) * N1;",
    replace: "return N2 - (deg1 / deg2) * N1;",
    why: "inversion with the degeneracies upside down"
  },
  {
    file: "js/laser/engine/spectrum.js",
    find: "return g0 / Math.sqrt(1 + I / I_sat);",
    replace: "return g0 / (1 + I / I_sat);",
    why: "inhomogeneous line saturating like a homogeneous one"
  },
  {
    file: "js/laser/engine/spectrum.js",
    find: "if (broadening === \"homogeneous\") return dnu * Math.sqrt(x - 1);",
    replace: "if (broadening === \"homogeneous\") return dnu * (x - 1);",
    why: "Lorentzian oscillating band without the √"
  },
  {
    file: "js/laser/engine/spectrum.js",
    find: "return dnu * Math.sqrt(Math.log(x) / Math.LN2);",
    replace: "return dnu * Math.sqrt(Math.log(x));",
    why: "Gaussian oscillating band without dividing by ln 2"
  },
  {
    file: "js/laser/engine/spectrum.js",
    find: "if (x <= 1) return 0;",
    replace: "",
    why: "oscillating band below threshold: √ of a negative number gives NaN"
  },
  {
    file: "js/laser/engine/spectrum.js",
    find: "for (var q = first; q <= last; q++) {",
    replace: "for (var q = first; q < last - 1; q++) {",
    why: "mode comb loop that stops one line early (the loop runs one q past the window on purpose)"
  },

  /* ---------- stage 2: cavity.js ---------- */
  {
    file: "js/laser/engine/cavity.js",
    find: "var gamma = alpha_i * l_g - 0.5 * (Math.log(refl1) + Math.log(refl2));",
    replace: "var gamma = alpha_i * l_g - (Math.log(refl1) + Math.log(refl2));",
    why: "single-pass loss γ without the ½ (round trip taken for one pass)"
  },
  {
    file: "js/laser/engine/cavity.js",
    find: "return L + (nGroup - 1) * l_g;",
    replace: "return L;",
    why: "the mirror distance L used instead of the optical length L_e"
  },
  {
    file: "js/laser/engine/cavity.js",
    find: "return c / (2 * L_e);",
    replace: "return c / L_e;",
    why: "free spectral range c/L instead of c/2L"
  },
  {
    file: "js/laser/engine/cavity.js",
    find: "return L_e / (c * gamma);",
    replace: "return 2 * L_e / (c * gamma);",
    why: "photon lifetime from the round-trip time instead of one pass"
  },
  {
    file: "js/laser/engine/cavity.js",
    find: "return 2 * Math.PI * nu * tau_c;",
    replace: "return nu * tau_c;",
    why: "Q without 2π"
  },
  {
    file: "js/laser/engine/cavity.js",
    find: "return Math.PI * Math.pow(product, 0.25) / (1 - Math.sqrt(product));",
    replace: "return Math.PI * Math.pow(product, 0.5) / (1 - Math.sqrt(product));",
    why: "finesse with (R₁R₂)^½ instead of ^¼"
  },
  {
    file: "js/laser/engine/cavity.js",
    find: "var overThreshold = 2 * g0 * l_g / (T_oc + L_i) - 1;",
    replace: "var overThreshold = g0 * l_g / (T_oc + L_i) - 1;",
    why: "low-gain Rigrod with one pass of gain against round-trip losses"
  },
  {
    file: "js/laser/engine/cavity.js",
    find: "if (overThreshold <= 0) return 0;\n    return area * (T_oc * I_sat / 2) * overThreshold;",
    replace: "return area * (T_oc * I_sat / 2) * overThreshold;",
    why: "low-gain Rigrod gives a negative power below threshold"
  },
  {
    file: "js/laser/engine/cavity.js",
    find: "if (overThreshold <= 0) return 0;\n    var mirrors",
    replace: "var mirrors",
    why: "exact Rigrod gives a negative power below threshold"
  },
  {
    file: "js/laser/engine/cavity.js",
    find: "var mirrors = (1 - refl2) * root1 / ((root1 + root2) * (1 - rootBoth));",
    replace: "var mirrors = (1 - refl2) / ((root1 + root2) * (1 - rootBoth));",
    why: "exact Rigrod without √R₁"
  },
  {
    file: "js/laser/engine/cavity.js",
    find: "var T_opt = Math.sqrt(roundTripGain * L_i) - L_i;",
    replace: "var T_opt = Math.sqrt(roundTripGain * L_i) + L_i;",
    why: "optimum coupler with the wrong sign"
  },
  {
    file: "js/laser/engine/cavity.js",
    find: "if (roundTripGain <= L_i) return 0;",
    replace: "",
    why: "optimum coupler below threshold: negative T or NaN"
  },
  {
    file: "js/laser/engine/cavity.js",
    find: "return ratio * ratio;",
    replace: "return ratio;",
    why: "face reflectivity without the square"
  },
  {
    file: "js/laser/engine/check.js",
    find: "if (!isNumber(value) || value <= 0 || value > 1) {",
    replace: "if (!isNumber(value) || value <= 0) {",
    why: "a reflectivity above 1 accepted"
  },

  /* ---------- stage 2: media.js ---------- */
  {
    file: "js/laser/engine/media.js",
    find: "result.nGroup = typeof medium.ng === \"number\" ? medium.ng : medium.n;",
    replace: "result.nGroup = medium.n;",
    why: "phase index n used where the group index n_g sets the round trip (D5)"
  },

  /* ---------- stage 2 review: shared checks, edge cases ---------- */
  {
    file: "js/laser/engine/check.js",
    find: "if (params === null || typeof params !== \"object\" || Array.isArray(params)) {",
    replace: "if (params === null) {",
    why: "plain numbers accepted where named values are needed"
  },
  {
    file: "js/laser/engine/check.js",
    find: "if (!isNumber(value) || value < min) {",
    replace: "if (!isNumber(value) || value <= min) {",
    why: "atLeast refuses its own limit (n = 1, a face in air)"
  },
  {
    file: "js/laser/engine/check.js",
    find: "if (!isNumber(value) || value < min || value > max) {",
    replace: "if (!isNumber(value) || value < min) {",
    why: "a round-trip fraction above 1 accepted"
  },
  {
    file: "js/laser/engine/constants.js",
    find: "var n0 = check.atLeast(where, \"n0\", params.n0, 1);",
    replace: "var n0 = params.n0;",
    why: "n₀ not checked in the n₂ conversion"
  },
  {
    file: "js/laser/engine/spectrum.js",
    find: "var first = Math.max(1, Math.ceil(nuLow / fsr) - 1);",
    replace: "var first = Math.max(1, Math.ceil(nuLow / fsr));",
    why: "mode comb drops a line on the lower edge after rounding"
  },
  {
    file: "js/laser/engine/spectrum.js",
    find: "var last = Math.floor(nuHigh / fsr) + 1;",
    replace: "var last = Math.floor(nuHigh / fsr);",
    why: "mode comb drops a line on the upper edge after rounding"
  },
  {
    file: "js/laser/engine/spectrum.js",
    find: "if (lines.length === MAX_COMB_LINES) {",
    replace: "if (lines.length === MAX_COMB_LINES + 1) {",
    why: "mode comb limit off by one"
  },
  {
    file: "js/laser/engine/cavity.js",
    find: "if (gamma === 0) failLossless(where);",
    replace: "",
    why: "a lossless cavity passes on γ = 0 instead of saying so"
  },
  {
    file: "js/laser/engine/check.js",
    find: "if (names.indexOf(key) === -1) {",
    replace: "if (names.indexOf(key) === -2) {",
    why: "unknown names accepted: a loss quietly ignored, a typo unnoticed"
  },
  {
    file: "js/laser/engine/cavity.js",
    find: "if (T_opt >= 1) {",
    replace: "if (T_opt >= 2) {",
    why: "optimum coupler of 100 % or more handed on (refl2 = 1 − T would be 0)"
  },
  {
    file: "js/laser/engine/cavity.js",
    find: "if (L_i === 0) {",
    replace: "if (L_i === -1) {",
    why: "optimum coupler answers 0 (\"cannot start\") when there is no other loss"
  },
  {
    file: "js/laser/engine/cavity.js",
    find: "if (l_g > L * (1 + 1e-9)) {",
    replace: "if (l_g > L) {",
    why: "a medium filling the cavity refused after float rounding"
  },

  /* ---------- stage 2, second review ---------- */
  {
    file: "js/laser/engine/cavity.js",
    find: "var gamma = alpha_i * l_g - 0.5 * (Math.log(refl1) + Math.log(refl2));",
    replace: "var gamma = alpha_i * l_g + 0.5 * Math.log(1 / (refl1 * refl2));",
    why: "loss from the product R₁R₂, which rounds to 0 for tiny reflectivities"
  },
  {
    file: "js/laser/engine/check.js",
    find: "return \"a value that cannot be shown as text\";",
    replace: "throw err;",
    why: "an odd value crashes the error message itself"
  },
  {
    file: "js/laser/engine/constants.js",
    find: "check.finite(at(\"hzFromWavenumber\"), \"perCm\", perCm);",
    replace: "check.positive(at(\"hzFromWavenumber\"), \"perCm\", perCm);",
    why: "a wavenumber difference of 0 or below refused"
  }
];

module.exports = { MUTATIONS };
