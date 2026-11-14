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
    find: "var tau_c = L_e / (c * gamma);\n    // A loss too small",
    replace: "var tau_c = 2 * L_e / (c * gamma);\n    // A loss too small",
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
    find: "if (overThreshold <= 0) return 0;\n    // A loss too small to divide by (T_oc + L_i",
    replace: "// A loss too small to divide by (T_oc + L_i",
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
  },

  /* ---------- stage 3: ode.js ---------- */
  {
    file: "js/laser/engine/ode.js",
    find: "[44 / 45, -56 / 15, 32 / 9],",
    replace: "[44 / 45, -56 / 16, 32 / 9],",
    why: "one coefficient of the table mistyped"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "393 / 640,",
    replace: "393 / 641,",
    why: "one weight of the 4th-order error estimate mistyped"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "var stageTime = Math.min(t + TABLEAU.c[i] * h, t1);",
    replace: "var stageTime = Math.min(t + h, t1);",
    why: "every stage evaluated at the end of the step instead of at t + c_i·h"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "var SAFETY = 0.9;",
    replace: "var SAFETY = 1;",
    why: "no safety factor: about half of all steps rejected"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "var ERROR_EXPONENT = 1 / 5;",
    replace: "var ERROR_EXPONENT = 1 / 4;",
    why: "step control using the order of the wrong solution"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "var MAX_FACTOR = 5;",
    replace: "var MAX_FACTOR = 10;",
    why: "step allowed to grow faster than planned"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "var MIN_FACTOR = 0.2;",
    replace: "var MIN_FACTOR = 0.1;",
    why: "step allowed to shrink faster than planned"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "var hTry = lastStep ? t1 - t : h;",
    replace: "var hTry = h;",
    why: "the last step overshoots t1 instead of landing on it"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "        rejected++;\n",
    replace: "        rejected++;\n        k1 = step.kLast;\n",
    why: "after a rejected step, the next try starts from the rejected step's last derivative"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "k1 = step.kLast;             // first same as last",
    replace: "k1 = derivatives(lastStep ? t1 : t + hTry, step.state);",
    why: "first same as last not used: 7 calls of f per step instead of 6"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "h = hTry < h ? Math.max(h, hProposed) : hProposed;",
    replace: "h = hProposed;",
    why: "a short last step shrinks the step for the next frame"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "while (accepted + rejected < maxSteps) {",
    replace: "while (accepted + rejected <= maxSteps) {",
    why: "the step budget off by one"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "if (justRejected) factor = Math.min(factor, 1);",
    replace: "",
    why: "the step grows right after a rejection"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "        justRejected = false;\n",
    replace: "",
    why: "after one rejection the step never grows again"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "    if (isNaN(err)) err = Infinity;\n",
    replace: "",
    why: "a NaN error makes the step NaN, and the solver spins until the budget runs out"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "    check.finiteArray(WHERE, \"f(t0, state0)\", k1);\n",
    replace: "",
    why: "NaN at the start not reported"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "return 16 * Number.EPSILON * Math.max(Math.abs(t), Math.abs(t1));",
    replace: "return 16 * Number.EPSILON * Math.abs(t);",
    why: "the smallest step is 0 at t = 0, so the step can shrink forever"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "var result = f(t, state.slice());",
    replace: "var result = f(t, state);",
    why: "f gets the solver's own array and can change it"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "    return result.slice();\n",
    replace: "    return result;\n",
    why: "f's answer not copied: an f that reuses one array overwrites earlier stages"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "var f1 = derivatives(Math.min(t0 + h, t1), probe);",
    replace: "var f1 = derivatives(t0 + h, probe);",
    why: "the first-step guess calls f after t1"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "var scale = atol + rtol * Math.max(Math.abs(state[m]), Math.abs(newState[m]));",
    replace: "var scale = atol + rtol * Math.abs(state[m]);",
    why: "error scale from the old state only"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "if (t1 <= t0) check.fail",
    replace: "if (t1 < t0) check.fail",
    why: "a zero-length interval accepted"
  },
  {
    file: "js/laser/engine/check.js",
    find: "if (!isNumber(value) || Math.floor(value) !== value || value < min) {",
    replace: "if (!isNumber(value) || value < min) {",
    why: "a fraction of a step accepted as a count"
  },
  {
    file: "js/laser/engine/check.js",
    find: "      if (value.length === 0) fail(where, name + \" must not be an empty array.\");\n",
    replace: "",
    why: "an empty state accepted"
  },

  /* ---------- stage 3, review ---------- */
  {
    file: "js/laser/engine/ode.js",
    find: "var stageTime = Math.min(t + TABLEAU.c[i] * h, t1);",
    replace: "var stageTime = t + TABLEAU.c[i] * h;",
    why: "the last stages called one unit past t1 (a pump or Q-switch would switch early)"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "      if (!isFinite(newState[m])) {",
    replace: "      if (false) {",
    why: "a step into Infinity accepted: its error scale is Infinity, so its error looks like 0"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "0.01 * d0 / d1;",
    replace: "0.1 * d0 / d1;",
    why: "first-step guess: wrong size from d0/d1"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "Math.pow(0.01 / fastest, ERROR_EXPONENT)",
    replace: "Math.pow(0.1 / fastest, ERROR_EXPONENT)",
    why: "first-step guess: wrong size from how fast f changes"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "guess = Math.min(100 * h, h1);",
    replace: "guess = Math.min(h, h1);",
    why: "first-step guess: the 100·h limit replaced by h"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "? 1e-6 : 0.01",
    replace: "? 1e-5 : 0.01",
    why: "first-step guess: wrong fallback when state and f are 0"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "return Math.max(guess, smallestStep(t0, t1));",
    replace: "return guess;",
    why: "far from t = 0 the guess is below what t can resolve, and a smooth problem throws"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "    h = Math.min(h, hMax);           // a given h0 or the guess, never past hMax\n",
    replace: "",
    why: "a given h0 longer than hMax used as it is"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "var hProposed = Math.min(hTry * factor, hMax);",
    replace: "var hProposed = hTry * factor;",
    why: "hMax ignored after the first step"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "h = hTry < h ? Math.max(h, hProposed) : hProposed;",
    replace: "h = hTry < h ? Math.min(h, hTry * SAFETY * Math.pow(step.err, -ERROR_EXPONENT)) : hProposed;",
    why: "the step passed on taken from a cut-short step's error, which on a very short step is mostly rounding (declined review suggestion)"
  },
  {
    file: "js/laser/engine/check.js",
    find: "    if (typeof value === \"string\") return JSON.stringify(value);\n",
    replace: "",
    why: "a string in an error message looks like a number"
  },
  {
    file: "js/laser/engine/check.js",
    find: "    if (Array.isArray(value)) return \"an array of length \" + value.length;\n",
    replace: "",
    why: "a long array floods an error message"
  },

  /* ---------- stage 4: rates.js ---------- */
  {
    file: "js/laser/engine/rates.js",
    find: "return [x - y - y * Math.exp(s), ((y - 1) + seed) / eps];",
    replace: "return [x - y - y * Math.exp(s), ((1 - y) + seed) / eps];",
    why: "sign of (y − 1) flipped: gain becomes loss"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "return [x - y - y * Math.exp(s), ((y - 1) + seed) / eps];",
    replace: "return [x - y - y * Math.exp(s), ((y - 1) + seed)];",
    why: "ε dropped: photons as slow as the inversion"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "return [x - y - y * Math.exp(s), ((y - 1) + seed) / eps];",
    replace: "return [x - y - Math.exp(s), ((y - 1) + seed) / eps];",
    why: "stimulated emission y·p written as p"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "seed = Math.exp(logBeta + Math.log(y) - s);",
    replace: "seed = Math.exp(logBeta - s);",
    why: "seed β·y written as β"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "seed = Math.exp(logBeta + Math.log(y) - s);",
    replace: "seed = Math.exp(logBeta + Math.log(y) + s);",
    why: "seed β·y/p written as β·y·p"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "seed = Math.exp(logBeta + Math.log(y) - s);",
    replace: "seed = beta * y * Math.exp(-s);",
    why: "seed as β·y·e^(−s): e^(−s) overflows once s < −709 although the seed is about 1 (pump off)"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "if (beta > 0 && y > 0) {\n        seed = Math.exp(logBeta + Math.log(y) - s);",
    replace: "if (y > 0) {\n        seed = beta * y * Math.exp(-s);",
    why: "β = 0 seed multiplied by 0: 0·Infinity = NaN once s < −709"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "if (beta > 0 && y > 0) {",
    replace: "if (beta > 0) {",
    why: "a seed from y < 0 (a solver trial): ln of a negative number is NaN"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "return [x - y - y * Math.exp(s), ((y - 1) + seed) / eps];",
    replace: "return [x - y - y * Math.exp(s), ((y - 1) + seed) / (eps * (1 + eps))];",
    why: "an error that grows with ε: the runs at ε ≤ 10⁻³ hardly see it, the He-Ne run (ε ≈ 0.66) does"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "var outputRate = c * gammaOut / (2 * L_e);",
    replace: "var outputRate = c * gammaOut / L_e;",
    why: "output rate without the ½ (γ₂ is a round-trip loss)"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "var gammaOut = Math.abs(Math.log(refl2));",
    replace: "var gammaOut = -Math.log(refl2);",
    why: "a perfect output mirror gives −0 W"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "var V = area * L_e;",
    replace: "var V = area * l_g;",
    why: "mode volume from the rod length instead of L_e"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "var N_c = gamma / (sigma * l_g);",
    replace: "var N_c = gamma / sigma;",
    why: "threshold inversion without the rod length"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "eps: tau_c / tau,",
    replace: "eps: tau / tau_c,",
    why: "ε upside down"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "var pOnePhoton = B * tau;",
    replace: "var pOnePhoton = B;",
    why: "one photon as p = B instead of Bτ"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "powerPerP: h * nu * outputRate / pOnePhoton",
    replace: "powerPerP: h * outputRate / pOnePhoton",
    why: "output power without the photon energy hν"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "var gamma = alpha_i * l_g - 0.5 * (Math.log(refl1) + Math.log(refl2));",
    replace: "var gamma = alpha_i - 0.5 * (Math.log(refl1) + Math.log(refl2));",
    why: "internal loss α not multiplied by the rod length"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "if (!isFinite(tau_c / tau)) {",
    replace: "if (false) {",
    why: "a lossless cavity accepted: infinite photon lifetime"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "if (!isFinite(tau_c / tau)) {",
    replace: "if (gamma === 0) {",
    why: "only γ = 0 refused: γ = 10⁻³²⁰ gives τ_c = Infinity"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "if (l_g > L_e * (1 + 1e-9)) {",
    replace: "if (l_g > L_e) {",
    why: "a medium filling the cavity refused after float rounding"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "if (l_g > L_e * (1 + 1e-9)) {",
    replace: "if (false) {",
    why: "a rod longer than the cavity accepted"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "var p = x >= 1 ? ((x - 1) + squareRoot) / 2 : 2 * beta * x / (squareRoot - (x - 1));",
    replace: "var p = ((x - 1) + squareRoot) / 2;",
    why: "steady state below threshold computed with cancellation"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "return { y: x / (1 + p), p: p };",
    replace: "return { y: x / p, p: p };",
    why: "steady inversion x/p instead of x/(1 + p)"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "var squared = omegaR * omegaR - dampingRate * dampingRate;",
    replace: "var squared = omegaR * omegaR;",
    why: "damped frequency without the (x/2τ)² correction"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "t_damp: 1 / dampingRate",
    replace: "t_damp: 0.5 / dampingRate",
    why: "damping time τ/x instead of 2τ/x"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "    if (x <= 1) {\n      check.fail(where, \"x must be above 1",
    replace: "    if (x < 1) {\n      check.fail(where, \"x must be above 1",
    why: "relaxation at exactly threshold accepted"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "return [y, Math.max(s, seedLevel)];",
    replace: "return [y, s];",
    why: "liftToSeed does nothing: the solver gives up when β comes on or the pump comes back"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "return [y, Math.max(s, seedLevel)];",
    replace: "return [y, Math.min(s, seedLevel)];",
    why: "liftToSeed lowers the photons of a laser that runs"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "var seedLevel = Math.log(beta) + Math.log(Math.max(y, Y_FLOOR));",
    replace: "var seedLevel = Math.log(beta) + Math.log(y);",
    why: "no floor for y: after a long time with the pump off there is nothing to lift to"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "var Y_FLOOR = 1e-12;",
    replace: "var Y_FLOOR = 1e-40;",
    why: "a floor so low that the solver cannot follow the photons up when the pump comes back"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "if (state.length !== 2) {",
    replace: "if (false) {",
    why: "liftToSeed takes a state that is not [y, s]"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "check.params(where, params, [\"x\", \"eps\", \"beta\"]);",
    replace: "",
    why: "derivatives ignores a name it does not use"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "check.params(where, params, [\"x\", \"beta\"]);",
    replace: "",
    why: "steadyState ignores a name it does not use"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "check.params(where, params, [\"x\", \"tau\", \"tau_c\"]);",
    replace: "",
    why: "relaxation ignores a name it does not use"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "check.params(where, params, [\"state\", \"beta\"]);",
    replace: "",
    why: "liftToSeed ignores a name it does not use"
  },

  /* ---------- stage 4 review: cavity.js, a loss too small to divide by ---------- */
  {
    file: "js/laser/engine/cavity.js",
    find: "if (!isFinite(tau_c)) failLossless(where);",
    replace: "",
    why: "photonLifetime returns Infinity for γ = 10⁻³²⁰"
  },
  {
    file: "js/laser/engine/cavity.js",
    find: "if (overThreshold === Infinity) failLossless(where);",
    replace: "",
    why: "rigrodLowGain returns NaN or Infinity for T_oc + L_i = 10⁻³²⁴"
  },

  /* ---------- stage 5: js/laser/ui/loop.js ---------- */
  {
    file: "js/laser/ui/loop.js",
    find: "var MAX_STEP = 0.05;",
    replace: "var MAX_STEP = 0.5;",
    why: "the time-step cap too loose: a tab back from the background jumps"
  },
  {
    file: "js/laser/ui/loop.js",
    find: "lastTime = 0;\n        frameId = root.requestAnimationFrame(frame);",
    replace: "frameId = root.requestAnimationFrame(frame);",
    why: "a restart's first step counts the whole time the loop was stopped"
  },
  {
    file: "js/laser/ui/loop.js",
    find: "var MAX_PIXEL_RATIO = 2;",
    replace: "var MAX_PIXEL_RATIO = 3;",
    why: "the pixel ratio not capped at 2"
  },
  {
    file: "js/laser/ui/loop.js",
    find: "entry.canvas.width = Math.round(width * dpr);",
    replace: "entry.canvas.width = Math.round(width);",
    why: "canvas pixels not multiplied by the pixel ratio (blurry on retina)"
  },
  {
    file: "js/laser/ui/loop.js",
    find: "var width = entry.box.clientWidth;",
    replace: "var width = entry.box.getBoundingClientRect().width;",
    why: "the box measured with its border: the picture drawn 2 px too wide and squeezed (found in the browser)"
  },
  {
    file: "js/laser/ui/loop.js",
    find: "entry.g.setTransform(dpr, 0, 0, dpr, 0, 0);",
    replace: "entry.g.setTransform(1, 0, 0, 1, 0, 0);",
    why: "drawing not scaled to the pixel ratio"
  },
  {
    file: "js/laser/ui/loop.js",
    find: "var height = Math.max(entry.minHeight, Math.min(width / entry.aspect, entry.maxHeight));",
    replace: "var height = Math.min(width / entry.aspect, entry.maxHeight);",
    why: "no minimum height: a phone gets a sliver of a canvas"
  },
  {
    file: "js/laser/ui/loop.js",
    find: "if (width === entry.w && dpr === entry.dpr) return;",
    replace: "",
    why: "every resize report redraws, even when nothing changed"
  },
  {
    file: "js/laser/ui/loop.js",
    find: "if (!width) return;",
    replace: "if (width < 0) return;",
    why: "a hidden page (width 0) shrinks the canvas to nothing"
  },
  {
    file: "js/laser/ui/loop.js",
    find: "entry.onScreen = !!change.isIntersecting;",
    replace: "entry.onScreen = entry.onScreen || !!change.isIntersecting;",
    why: "scrolling away does not stop the loop"
  },
  {
    file: "js/laser/ui/loop.js",
    find: "var run = !destroyed && wanted && anyOnScreen();",
    replace: "var run = !destroyed && anyOnScreen();",
    why: "pause does nothing"
  },
  {
    file: "js/laser/ui/loop.js",
    find: "var wanted = options.running === undefined ? !reduceMotion : !!options.running;",
    replace: "var wanted = options.running === undefined ? true : !!options.running;",
    why: "a visitor who asked for less motion gets it moving anyway"
  },
  {
    file: "js/laser/ui/loop.js",
    find: "root.removeEventListener(\"theme:changed\", onThemeChanged);",
    replace: "",
    why: "destroy leaves the theme listener behind (one more per language switch)"
  },
  {
    file: "js/laser/ui/loop.js",
    find: "root.removeEventListener(\"resize\", onResize);",
    replace: "",
    why: "destroy leaves the resize listener behind"
  },
  {
    file: "js/laser/ui/loop.js",
    find: "if (seenWatcher) seenWatcher.disconnect();",
    replace: "",
    why: "destroy leaves the visibility observer watching an old canvas"
  },
  {
    file: "js/laser/ui/loop.js",
    find: "frameId = null;\n      if (destroyed) return;\n      var dt",
    replace: "frameId = null;\n      var dt",
    why: "a frame already queued at destroy brings the old loop back to life"
  },
  {
    file: "js/laser/ui/loop.js",
    find: "destroyed = true;\n        live -= 1;",
    replace: "destroyed = true;",
    why: "a destroyed loop still counted as live"
  },
  {
    file: "js/laser/ui/loop.js",
    find: "if (destroyed) return;\n        destroyed = true;",
    replace: "destroyed = true;",
    why: "a second destroy counts the loop down twice"
  },
  {
    file: "js/laser/ui/loop.js",
    find: "style = readStyle();\n      // A running loop",
    replace: "// A running loop",
    why: "a theme switch keeps the old colours"
  },
  {
    file: "js/laser/ui/loop.js",
    find: "if (frameId === null) drawAll();",
    replace: "",
    why: "a paused picture is not redrawn after a theme switch"
  },
  {
    file: "js/laser/ui/loop.js",
    find: "return String(style.getPropertyValue(variable) || \"\").trim();",
    replace: "return String(style.getPropertyValue(variable) || \"\");",
    why: "a CSS variable read with its leading space"
  },
  {
    file: "js/laser/ui/loop.js",
    find: "if (update) update(dt);\n        entries.forEach(function (entry) {\n          if (entry.onScreen) drawOne(entry, dt);\n        });",
    replace: "entries.forEach(function (entry) {\n          if (entry.onScreen) drawOne(entry, dt);\n        });\n        if (update) update(dt);",
    why: "drawn before the simulation step: every picture one frame late"
  },
  {
    file: "js/laser/ui/loop.js",
    find: "if (entry.onScreen) drawOne(entry, dt);",
    replace: "drawOne(entry, dt);",
    why: "canvases off screen are drawn every frame too"
  },
  {
    file: "js/laser/ui/loop.js",
    find: "entries.forEach(function (entry) { entry.onScreen = true; });",
    replace: "",
    why: "without IntersectionObserver the loop never starts"
  },
  {
    file: "js/laser/ui/loop.js",
    find: "soft: \"--accent-soft\",",
    replace: "soft: \"--color-secondary\",",
    why: "a colour only the dark theme sets"
  },

  /* ---------- stage 5: js/laser/ui/draw-bench.js ---------- */
  {
    file: "js/laser/ui/draw-bench.js",
    find: "g.fillStyle = colors.soft;",
    replace: "g.fillStyle = \"#7ea8ff\";",
    why: "a colour written out: it stays blue on the light theme"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "backMirror: { x: pad, y: mirrorTop - 0.6 * fontSize, align: \"left\"",
    replace: "backMirror: { x: pad, y: mirrorTop - 0.6 * fontSize, align: \"right\"",
    why: "a label aligned the wrong way runs off the canvas"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "g.fillText(text, spot.x, spot.y, spot.maxWidth);",
    replace: "g.fillText(text, spot.x, spot.y);",
    why: "a long word not squeezed into its place"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "if (!text) return;",
    replace: "",
    why: "an empty label written anyway"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "var lampY = rodY + rodHeight + 0.09 * h;",
    replace: "var lampY = rodY + rodHeight;",
    why: "the lamp drawn touching the rod"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "var innerRight = w - pad - mirrorThickness;",
    replace: "var innerRight = w - pad;",
    why: "the output mirror out of line with the back mirror: a lopsided picture"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "medium: { x: w / 2, y: rodY - 0.6 * fontSize,",
    replace: "medium: { x: w / 2, y: mirrorTop - 0.6 * fontSize,",
    why: "the medium label in the mirror labels' row"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "    g.restore();\n  }",
    replace: "  }",
    why: "the context's settings left changed for the next drawing"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "var rodY = axisY - rodHeight / 2;",
    replace: "var rodY = axisY - rodHeight;",
    why: "the rod drawn off the axis"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "g.clearRect(0, 0, view.w, view.h);",
    replace: "g.clearRect(0, 0, view.w, view.h / 2);",
    why: "only part of the canvas cleared: old frames show through"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "var fontSize = Math.max(11, Math.min(15, Math.round(0.055 * h)));",
    replace: "var fontSize = Math.round(0.04 * h);",
    why: "labels too small to read on a phone"
  },

  /* ---------- stage 5: js/laser/page.js ---------- */
  {
    file: "js/laser/page.js",
    find: "teardown();\n      teardown = null;",
    replace: "teardown = null;",
    why: "a language switch leaves the old loop running (one more each time)"
  },
  {
    file: "js/laser/page.js",
    find: "if (detail.route !== ROUTE) return;",
    replace: "if (detail.route === \"\") return;",
    why: "every page's section:ready rebuilds the laser page"
  },
  {
    file: "js/laser/page.js",
    find: "var name = word(data, \"bench.alt\") || word(data, \"page.title\");",
    replace: "var name = word(data, \"page.title\");",
    why: "the picture's description not used for screen readers"
  },
  {
    file: "js/laser/page.js",
    find: "      canvas.setAttribute(\"aria-hidden\", \"true\");\n",
    replace: "",
    why: "a picture with no name left as an unnamed image for screen readers"
  },
  {
    file: "js/laser/page.js",
    find: "      running: false,             // nothing moves yet (stage 6: Play)\n",
    replace: "",
    why: "a still picture redrawn 60 times a second"
  },
  {
    file: "js/laser/page.js",
    find: "var canvas = container.querySelector('[data-laser-canvas=\"bench\"]');",
    replace: "var canvas = container.querySelector('[data-laser-canvas=\"plot\"]');",
    why: "the wrong canvas name: the page builds nothing"
  },
  {
    file: "js/laser/page.js",
    find: "    if (teardown) {\n      teardown();\n      teardown = null;\n    }\n    if (!detail.container) return;\n    teardown = build(detail.container, detail.data || {});",
    replace: "    var next = detail.container ? build(detail.container, detail.data || {}) : null;\n    if (!next) return;\n    if (teardown) teardown();\n    teardown = next;",
    why: "a section that failed to load leaves the old loop running"
  },
  {
    file: "js/laser/page.js",
    find: "root.Site.lang);",
    replace: "\"en\");",
    why: "the words always in English"
  },

  /* ---------- stage 5: the page's own files ---------- */
  {
    file: "data/laser.json",
    find: "\"outputMirror\": { \"hy\": \"Ելքային հայելի\",",
    replace: "\"outputMirror\": { \"hy\": \"\",",
    why: "a word with no Armenian"
  },
  {
    file: "data/laser.json",
    find: "\"status\": {",
    replace: "\"note\": {",
    why: "a word renamed in the data but not in the layout"
  },
  {
    file: "data/laser.json",
    find: "\"title\": { \"hy\": \"Լազերը\", \"en\": \"The Laser\" },",
    replace: "\"title\": \"The Laser\",",
    why: "a word in one language only"
  },
  {
    file: "sections/laser.html",
    find: "<div class=\"laser-bench reveal\">",
    replace: "<div class=\"laser-bench reveal\" style=\"margin: 0\">",
    why: "a style written in the layout"
  },
  {
    file: "sections/laser.html",
    find: "<div class=\"page-head laser-head\">",
    replace: "<header class=\"page-head laser-head\">",
    why: "a <header> in a fragment picks up the site's header bar"
  },
  {
    file: "sections/laser.html",
    find: "data-text=\"page.lead\"",
    replace: "data-text=\"page.leed\"",
    why: "a word name mistyped in the layout"
  },
  {
    file: "sections/laser.html",
    find: "data-laser-canvas=\"bench\" role=\"img\"",
    replace: "data-laser-canvas=\"bench\"",
    why: "the canvas not announced as a picture"
  },
  {
    file: "css/laser.css",
    find: "color: var(--muted);\n  font-size: 0.88rem;",
    replace: "color: #9aa6c4;\n  font-size: 0.88rem;",
    why: "a colour written out in the CSS"
  },
  {
    file: "index.html",
    find: "<script src=\"js/laser/engine/ode.js\"></script>\n  <script src=\"js/laser/engine/rates.js\"></script>",
    replace: "<script src=\"js/laser/engine/rates.js\"></script>\n  <script src=\"js/laser/engine/ode.js\"></script>",
    why: "engine files loaded out of order"
  },
  {
    file: "index.html",
    find: "<script src=\"js/laser/ui/draw-bench.js\"></script>\n  <script src=\"js/laser/page.js\"></script>",
    replace: "<script src=\"js/laser/page.js\"></script>\n  <script src=\"js/laser/ui/draw-bench.js\"></script>",
    why: "page.js loaded before a drawing file"
  },
  {
    file: "index.html",
    find: "  <script src=\"js/laser/ui/draw-bench.js\"></script>\n",
    replace: "",
    why: "a new UI file not added to index.html"
  },
  {
    file: "index.html",
    find: "  <link rel=\"stylesheet\" href=\"css/laser.css\">\n",
    replace: "",
    why: "the page's stylesheet not linked"
  },
  {
    file: "data/site.json",
    find: "\"route\": \"laser\",\n      \"hidden\": true,",
    replace: "\"route\": \"laser\",\n      \"hidden\": false,",
    why: "the unfinished page shown in the menu"
  },
  {
    file: "sections/labs.html",
    find: "href=\"?view=laser\" data-goto=\"laser\"",
    replace: "href=\"?view=lab\" data-goto=\"laser\"",
    why: "the banner's address wrong when opened in a new tab"
  },
  {
    file: "sections/labs.html",
    find: "<h3 class=\"lab-feature__title\" data-text=\"title\">",
    replace: "<h3 class=\"lab-feature__title\" data-text=\"titel\">",
    why: "the banner asks for a word that does not exist"
  },
  {
    file: "sections/labs.html",
    find: "data-list=\"featured.items\"",
    replace: "data-list=\"featured.item\"",
    why: "the banner's list named wrong: no banner at all"
  },
  {
    file: "data/labs.json",
    find: "\"title\": { \"hy\": \"Կառուցե՛ք ձեր լազերը\",",
    replace: "\"title\": { \"hy\": \"\",",
    why: "the banner's title with no Armenian"
  },
  {
    file: "js/laser/ui/loop.js",
    find: "      seconds += dt;\n      try {\n        if (update) update(dt);\n        entries.forEach(function (entry) {\n          if (entry.onScreen) drawOne(entry, dt);\n        });\n      } catch (error) {\n        // Stop, rather than throw the same error again 60 times a second.\n        // The error still reaches the console once; play() tries again.\n        wanted = false;\n        sync();\n        throw error;\n      }\n      // The next frame is asked for only now, so a pause() or destroy()\n      // made during this one (by update or a draw) holds.\n      if (frameId === null && !destroyed && wanted && anyOnScreen()) {\n        frameId = root.requestAnimationFrame(frame);\n      }\n    }",
    replace: "      seconds += dt;\n      if (update) update(dt);\n      entries.forEach(function (entry) {\n        if (entry.onScreen) drawOne(entry, dt);\n      });\n      frameId = root.requestAnimationFrame(frame);\n    }",
    why: "an error in update or draw thrown again every frame (the next frame asked for first)"
  },
  {
    file: "js/laser/ui/loop.js",
    find: "        wanted = false;\n        sync();\n        throw error;",
    replace: "        throw error;",
    why: "after an error the canvas still says data-running=\"true\""
  },
  {
    file: "js/laser/ui/loop.js",
    find: "entry.canvas.setAttribute(\"data-running\", run && entry.onScreen ? \"true\" : \"false\");",
    replace: "entry.canvas.setAttribute(\"data-running\", run ? \"true\" : \"false\");",
    why: "a canvas scrolled away still says data-running=\"true\""
  },
  {
    file: "js/laser/ui/loop.js",
    find: "    measureAll();\n\n    /* ---------- watching size and visibility ---------- */\n\n    var sizeWatcher = null;\n    if (typeof root.ResizeObserver === \"function\") {\n      sizeWatcher = new root.ResizeObserver(function (changes) {\n        changes.forEach(function (change) {\n          entries.forEach(function (entry) {\n            if (entry.box === change.target) measure(entry);\n          });\n        });\n      });\n      entries.forEach(function (entry) { sizeWatcher.observe(entry.box); });\n    }\n    root.addEventListener(\"resize\", onResize);\n    root.addEventListener(\"theme:changed\", onThemeChanged);\n",
    replace: "\n    /* ---------- watching size and visibility ---------- */\n\n    var sizeWatcher = null;\n    if (typeof root.ResizeObserver === \"function\") {\n      sizeWatcher = new root.ResizeObserver(function (changes) {\n        changes.forEach(function (change) {\n          entries.forEach(function (entry) {\n            if (entry.box === change.target) measure(entry);\n          });\n        });\n      });\n      entries.forEach(function (entry) { sizeWatcher.observe(entry.box); });\n    }\n    root.addEventListener(\"resize\", onResize);\n    root.addEventListener(\"theme:changed\", onThemeChanged);\n    measureAll();\n",
    why: "listeners registered before the first picture: a draw that throws leaves them behind for good"
  },
  {
    file: "js/laser/ui/loop.js",
    find: "      entry.canvas.width = Math.round(width * dpr);\n      entry.canvas.height = Math.round(height * dpr);\n      entry.canvas.style.height = height + \"px\";\n      // A new canvas size resets the context, so the scale is set after it.\n      entry.g.setTransform(dpr, 0, 0, dpr, 0, 0);",
    replace: "      entry.g.setTransform(dpr, 0, 0, dpr, 0, 0);\n      entry.canvas.width = Math.round(width * dpr);\n      entry.canvas.height = Math.round(height * dpr);\n      entry.canvas.style.height = height + \"px\";",
    why: "the scale set before the resize, which resets it: half-size picture on retina"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "var PARTS = Object.freeze([\"backMirror\", \"outputMirror\", \"medium\", \"pump\"]);",
    replace: "var PARTS = Object.freeze([\"backMirror\", \"outputMirror\", \"medium\"]);",
    why: "a part left out of PARTS: its label never written"
  },
  {
    file: "css/laser.css",
    find: "  background: var(--faint-bg);\n  color: var(--muted);",
    replace: "  background: var(--faint-bg);\n  color: crimson;",
    why: "a colour name beyond the basic ones written in the CSS"
  },
  {
    file: "js/router.js",
    find: "Promise.all([Site.ready, documentRead])",
    replace: "Promise.all([Site.ready])",
    why: "the first page built before the later scripts listen: the laser bench never drawn"
  },
  {
    file: "js/router.js",
    find: "    if (document.readyState === \"loading\") {",
    replace: "    if (false) {",
    why: "the router never waits for the page to be read"
  },
  {
    file: "js/router.js",
    find: "    } else {\n      resolve();\n    }\n  });",
    replace: "    }\n  });",
    why: "a router loaded after the page was read never starts"
  }
];

module.exports = { MUTATIONS };
