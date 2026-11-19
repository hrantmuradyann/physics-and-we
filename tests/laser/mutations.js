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
    find: "if (medium.scheme === \"three-level\" || medium.scheme === \"two-level\") perEmission = 2;",
    replace: "if (medium.scheme === \"two-level\") perEmission = 2;",
    why: "three-level I_sat without its factor 2 (doc §2.2)"
  },
  {
    file: "js/laser/engine/media.js",
    find: "if (medium.scheme === \"three-level\" || medium.scheme === \"two-level\") perEmission = 2;",
    replace: "if (medium.scheme === \"three-level\") perEmission = 2;",
    why: "the two-level atom's I_sat without the factor 2 that ruby has"
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
    find: "n: 1.76,\n      ng: null,\n      N_t: null,\n      pumps: [\"laser\"],",
    replace: "n: 1.67,\n      ng: null,\n      N_t: null,\n      pumps: [\"laser\"],",
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
    find: "var hTry = lastStep ? t1 - point.t : h;",
    replace: "var hTry = h;",
    why: "the last step overshoots t1 instead of landing on it"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "        rejected++;\n        justRejected = true;",
    replace: "        rejected++;\n        point = { t: point.t, state: point.state, f: step.fNew };\n        justRejected = true;",
    why: "after a rejected step, the next try starts from the rejected step's last derivative"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "point = { t: lastStep ? t1 : point.t + hTry, state: step.state, f: step.fNew };",
    replace: "point = { t: lastStep ? t1 : point.t + hTry, state: step.state, f: derivatives(lastStep ? t1 : point.t + hTry, step.state) };",
    why: "first same as last not used: one more call of f per step (7 instead of 6 for dopri5)"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "h = hTry < h ? Math.max(h, hProposed) : hProposed;",
    replace: "h = hProposed;",
    why: "a short last step shrinks the step for the next frame"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "while (accepted + rejected < inputs.maxSteps) {",
    replace: "while (accepted + rejected <= inputs.maxSteps) {",
    why: "the step budget off by one"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "if (justRejected) factor = Math.min(factor, 1);\n        var hProposed = Math.min(hTry * factor, hMax);\n        // A last step cut short to land on t1 (a frame shorter than the\n",
    replace: "\n        var hProposed = Math.min(hTry * factor, hMax);\n        // A last step cut short to land on t1 (a frame shorter than the\n",
    why: "the step grows right after a rejection"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "        justRejected = false;\n        // f at the new state",
    replace: "        // f at the new state",
    why: "after one rejection the step never grows again"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "    if (isNaN(err)) err = Infinity;\n    return { state: newState, fNew: k[k.length - 1], err: err };",
    replace: "    return { state: newState, fNew: k[k.length - 1], err: err };",
    why: "a NaN error makes the step NaN, and the solver spins until the budget runs out"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "    check.finiteArray(where, \"f(t0, state0)\", point.f);\n",
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
    find: "var scale = atol + rtol * Math.max(Math.abs(state[m]), Math.abs(newState[m]));\n      sumOfSquares",
    replace: "var scale = atol + rtol * Math.abs(state[m]);\n      sumOfSquares",
    why: "error scale from the old state only"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "scale.push(atol + rtol * Math.max(Math.abs(state[m]), Math.abs(newState[m])));",
    replace: "scale.push(atol + rtol * Math.abs(state[m]));",
    why: "error scale from the old state only (rosenbrock): a state growing from 0 is measured against atol alone"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "if (inputs.t1 <= inputs.t0) {",
    replace: "if (inputs.t1 < inputs.t0) {",
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
    find: "      if (!isFinite(newState[m])) {\n        return { state: newState, fNew: k[k.length - 1], err: Infinity };",
    replace: "      if (false) {\n        return { state: newState, fNew: k[k.length - 1], err: Infinity };",
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
    find: "Math.pow(0.01 / fastest, exponent)",
    replace: "Math.pow(0.1 / fastest, exponent)",
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
    find: "    h = Math.min(h, hMax);           // a given h0 or the guess, never past hMax\n\n    var accepted = 0;",
    replace: "\n    var accepted = 0;",
    why: "a given h0 longer than hMax used as it is"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "var hProposed = Math.min(hTry * factor, hMax);\n        // A last step cut short to land on t1 (a frame shorter than the\n",
    replace: "var hProposed = hTry * factor;\n        // A last step cut short to land on t1 (a frame shorter than the\n",
    why: "hMax ignored after the first step"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "h = hTry < h ? Math.max(h, hProposed) : hProposed;",
    replace: "h = hTry < h ? Math.min(h, hTry * SAFETY * Math.pow(step.err, -exponent)) : hProposed;",
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
    find: "return [pump - y - y * Math.exp(s), ((y - 1) + seed) / eps];",
    replace: "return [pump - y - y * Math.exp(s), ((1 - y) + seed) / eps];",
    why: "sign of (y − 1) flipped: gain becomes loss"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "return [pump - y - y * Math.exp(s), ((y - 1) + seed) / eps];",
    replace: "return [pump - y - y * Math.exp(s), ((y - 1) + seed)];",
    why: "ε dropped: photons as slow as the inversion"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "return [pump - y - y * Math.exp(s), ((y - 1) + seed) / eps];",
    replace: "return [pump - y - Math.exp(s), ((y - 1) + seed) / eps];",
    why: "stimulated emission y·p written as p"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "seed = Math.exp(logBeta + Math.log(Math.max(y, 0) + Y_FLOOR) - s);",
    replace: "seed = Math.exp(logBeta - s);",
    why: "seed β·y written as β"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "seed = Math.exp(logBeta + Math.log(Math.max(y, 0) + Y_FLOOR) - s);",
    replace: "seed = Math.exp(logBeta + Math.log(Math.max(y, 0) + Y_FLOOR) + s);",
    why: "seed β·y/p written as β·y·p"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "seed = Math.exp(logBeta + Math.log(Math.max(y, 0) + Y_FLOOR) - s);",
    replace: "seed = beta * (Math.max(y, 0) + Y_FLOOR) * Math.exp(-s);",
    why: "seed as β·y·e^(−s): e^(−s) overflows once s < −709 although the seed is about 1 (pump off)"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "if (beta > 0) {\n        seed = Math.exp(logBeta + Math.log(Math.max(y, 0) + Y_FLOOR) - s);",
    replace: "if (true) {\n        seed = beta * (Math.max(y, 0) + Y_FLOOR) * Math.exp(-s);",
    why: "β = 0 seed multiplied by 0: 0·Infinity = NaN once s < −709"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "Math.log(Math.max(y, 0) + Y_FLOOR) - s",
    replace: "Math.log(y) - s",
    why: "the seed without its floor: ln of y ≤ 0 is NaN, and the implicit solver's Jacobian across y = 0 grows past 10³³ with the pump off"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "Math.log(Math.max(y, 0) + Y_FLOOR) - s",
    replace: "Math.log(Math.max(y, Y_FLOOR)) - s",
    why: "the seed floor as max(y, 10⁻¹²): a corner at y = 10⁻¹² that the solver's difference in y reaches across, so pump-off frames cost up to 580 steps (stage 7a review)"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "return [pump - y - y * Math.exp(s), ((y - 1) + seed) / eps];",
    replace: "return [pump - y - y * Math.exp(s), ((y - 1) + seed) / (eps * (1 + eps))];",
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
    find: "N_c: gamma / (sigma * l_g),",
    replace: "N_c: gamma / sigma,",
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
    find: "var result = scalesFor(numbers, numbers.B * numbers.tau);",
    replace: "var result = scalesFor(numbers, numbers.B);",
    why: "one photon as p = B instead of Bτ"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "powerPerPhoton: h * nu * outputRate",
    replace: "powerPerPhoton: h * outputRate",
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
    find: "return a >= 0 ? (a + squareRoot) / 2 : 2 * cTerm / (squareRoot - a);",
    replace: "return (a + squareRoot) / 2;",
    why: "steady state below threshold computed with cancellation"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "var p = steadyPhotons(x - 1 + beta * Y_FLOOR, beta * (x + Y_FLOOR));",
    replace: "var p = steadyPhotons(x - 1, beta * x);",
    why: "steadyState without the seed floor: p = 0 with the pump off, where f settles at β·10⁻¹²"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "return { y: x / (1 + p), p: p };",
    replace: "return { y: x / p, p: p };",
    why: "steady inversion x/p instead of x/(1 + p)"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "var squared = omegaSquared - dampingRate * dampingRate;",
    replace: "var squared = omegaSquared;",
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
    find: "var seedLevel = Math.log(beta) + Math.log(Math.max(y, 0) + Y_FLOOR);\n    return [y, Math.max(s, seedLevel)];",
    replace: "var seedLevel = Math.log(beta) + Math.log(Math.max(y, 0) + Y_FLOOR);\n    return [y, s];",
    why: "liftToSeed does nothing: the solver gives up when β comes on or the pump comes back"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "var seedLevel = Math.log(beta) + Math.log(Math.max(y, 0) + Y_FLOOR);\n    return [y, Math.max(s, seedLevel)];",
    replace: "var seedLevel = Math.log(beta) + Math.log(Math.max(y, 0) + Y_FLOOR);\n    return [y, Math.min(s, seedLevel)];",
    why: "liftToSeed lowers the photons of a laser that runs"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "var seedLevel = Math.log(beta) + Math.log(Math.max(y, 0) + Y_FLOOR);",
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
    find: "    g.fillStyle = colors.muted;\n    g.font = \"600 \"",
    replace: "    g.fillStyle = \"#7ea8ff\";\n    g.font = \"600 \"",
    why: "a colour written out: it stays blue on the light theme"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "backMirror: { x: pad, y: nameRow, align: \"left\"",
    replace: "backMirror: { x: pad, y: nameRow, align: \"right\"",
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
    find: "var lampY = rodY + rodHeight + 0.075 * h;",
    replace: "var lampY = rodY + rodHeight;",
    why: "the lamp drawn touching the rod"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "var innerRight = w - side - mirrorThickness;",
    replace: "var innerRight = w - side;",
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
    find: "var fontSize = clamp(Math.round(0.05 * h), 11, 15);",
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
    find: "var label = word(data, name + \".alt\") || word(data, \"page.title\");",
    replace: "var label = word(data, \"page.title\");",
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
    find: "update: pauseOnError(update), running: state.playing });",
    replace: "update: pauseOnError(update), running: true });",
    why: "the loop started running whatever Play/Pause and the visitor's motion setting say"
  },
  {
    file: "js/laser/page.js",
    find: "found[name] = container.querySelector('[data-laser-canvas=\"' + name + '\"]');",
    replace: "found[name] = container.querySelector('[data-laser-canvas=\"' + name + 's\"]');",
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
    find: "<div class=\"laser-stage__controls lab__panel reveal\">",
    replace: "<div class=\"laser-stage__controls lab__panel reveal\" style=\"margin: 0\">",
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
    find: "<script src=\"js/laser/ui/draw-photons.js\"></script>\n  <script src=\"js/laser/page.js\"></script>",
    replace: "<script src=\"js/laser/page.js\"></script>\n  <script src=\"js/laser/ui/draw-photons.js\"></script>",
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
    find: "var PARTS = Object.freeze([\"backMirror\", \"outputMirror\", \"medium\", \"pump\", \"transmission\", \"qSwitch\"]);",
    replace: "var PARTS = Object.freeze([\"backMirror\", \"outputMirror\", \"medium\", \"pump\", \"qSwitch\"]);",
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
  },
  /* ---------- stage 6: bench.js ---------- */
  {
    file: "js/laser/engine/bench.js",
    find: "var perVolume = config.eta * power / (U.photonEnergy(config.pumpLam) * config.area * config.l_g);",
    replace: "var perVolume = config.eta * power / (U.photonEnergy(d.lam) * config.area * config.l_g);",
    why: "the pump photon's energy taken at the laser wavelength"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "var perVolume = config.eta * power / (U.photonEnergy(config.pumpLam) * config.area * config.l_g);",
    replace: "var perVolume = config.eta * power / (U.photonEnergy(config.pumpLam) * config.area * d.L_e);",
    why: "the pumped volume taken over the whole cavity instead of the rod"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "d.pumpThreshold = d.R_c * U.photonEnergy(config.pumpLam) * config.area * config.l_g / config.eta;",
    replace: "d.pumpThreshold = d.R_c * U.photonEnergy(config.pumpLam) * config.area * config.l_g;",
    why: "the threshold pump power without /η"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "d.P_out = x > 1 ? d.powerPerP * (x - 1) : 0;",
    replace: "d.P_out = x > 1 ? d.powerPerP * x : 0;",
    why: "the output as x instead of x − 1"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "d.P_out = x > 1 ? d.powerPerP * (x - 1) : 0;",
    replace: "d.P_out = d.powerPerP * (x - 1);",
    why: "a negative output below threshold"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "var L_i = 2 * d.alphaWithMirrors * config.l_g;",
    replace: "var L_i = d.alphaWithMirrors * config.l_g;",
    why: "the internal loss as one pass instead of a round trip"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "if (L_i > 0 && L_i < 1) {",
    replace: "if (L_i < 1) {",
    why: "a best coupler asked for with no internal loss"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "d.T_best = T_opt === null ? null : 1 - Math.exp(-T_opt);",
    replace: "d.T_best = T_opt;",
    why: "the best coupler shown as §3.6's T_opt, which is not where this model's output peaks"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "period = 2 * Math.PI / relaxation.omegaDamped;",
    replace: "period = 1 / relaxation.omegaDamped;",
    why: "the period without 2π"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "d.g0 = medium.sigma * d.R_p * medium.tau;",
    replace: "d.g0 = medium.sigma * d.R_p;",
    why: "the small-signal gain without τ"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "d.slope = d.powerPerP / d.pumpThreshold;",
    replace: "d.slope = d.pumpThreshold / d.powerPerP;",
    why: "the slope efficiency upside down"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "powerPerPhoton: scales.powerPerP * scales.pOnePhoton,",
    replace: "powerPerPhoton: scales.powerPerP / scales.pOnePhoton,",
    why: "the power of one photon divided instead of multiplied"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "var state = [sim.N / d.N_c, sim.lnPhi + d.sOnePhoton];",
    replace: "var state = [sim.N / d.N_c, sim.lnPhi];",
    why: "ln φ handed to the solver as s = ln p"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "next.lnPhi = state[1] - d.sOnePhoton;",
    replace: "next.lnPhi = state[1];",
    why: "s = ln p kept as ln φ"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "var to = last ? seconds / tau : (cuts[i] - sim.t) / tau;",
    replace: "var to = last ? seconds : (cuts[i] - sim.t) / tau;",
    why: "simulated seconds passed to the solver as t′"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "next.N = Math.max(lowest, state[0] * d.N_c);",
    replace: "next.N = state[0] * d.N_c;",
    why: "a step's tiny negative inversion passed on, so the next call refuses it"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "    if (seconds === 0) {",
    replace: "    if (false) {",
    why: "a frame of no time handed to the solver, which refuses an empty interval"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "if (pumpLam >= medium.lam) {",
    replace: "if (false) {",
    why: "a pump photon weaker than the laser photon accepted"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "if (eta === 0) check.fail(",
    replace: "if (false) check.fail(",
    why: "η = 0 accepted: the threshold divides by it"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "if (!(loss >= MIN_LOSS)) {",
    replace: "if (false) {",
    why: "a cavity with almost no loss accepted, so rates.js refuses it with its own name"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "if (l_g > L) {",
    replace: "if (false) {",
    why: "a rod longer than the cavity accepted"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "if (d.scheme === \"four-level\") return E.rates.fourLevel.derivatives({ x: pump, eps: eps, beta: beta });",
    replace: "if (d.scheme !== \"two-level\") return E.rates.fourLevel.derivatives({ x: pump, eps: eps, beta: beta });",
    why: "a three-level medium run with the four-level equations"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "var COUPLER_RANGE = { min: 0.005, max: 0.6, log: true };",
    replace: "var COUPLER_RANGE = { min: 0.005, max: 0.6, log: false };",
    why: "the coupler slider made linear: the small couplers crowd into its first few pixels"
  },

  /* ---------- stage 6: format.js ---------- */
  {
    file: "js/laser/ui/format.js",
    find: "var chosen = prefixOf(rounded);",
    replace: "var chosen = prefixOf(size);",
    why: "the prefix chosen before rounding: 999.96 W written as 1000 W"
  },
  {
    file: "js/laser/ui/format.js",
    find: "var MINUS = \"−\";",
    replace: "var MINUS = \"-\";",
    why: "a hyphen for the minus sign"
  },
  {
    file: "js/laser/ui/format.js",
    find: "var NO_BREAK = \" \";",
    replace: "var NO_BREAK = \" \";",
    why: "a plain space between number and unit: the unit can wrap to the next line"
  },
  {
    file: "js/laser/ui/format.js",
    find: "if (range.log) return range.min * Math.pow(range.max / range.min, f);",
    replace: "if (false) return range.min * Math.pow(range.max / range.min, f);",
    why: "a log slider read as linear"
  },
  {
    file: "js/laser/ui/format.js",
    find: "if (Math.floor(Math.log10(rounded)) > size) size += 1;",
    replace: "if (false) size += 1;",
    why: "rounding that carries into the next power of ten not counted (9.9996 -> 10.00)"
  },
  {
    file: "js/laser/ui/format.js",
    find: "if (decimals <= 0) return String(Math.round(value));",
    replace: "if (decimals <= 0) return String(rounded);",
    why: "a whole number cut to 3 digits (1234.5 -> 1230)"
  },
  {
    file: "js/laser/ui/format.js",
    find: "if (f === 1) return range.max;",
    replace: "if (false) return range.max;",
    why: "the top of a slider computed, not exact"
  },
  {
    file: "js/laser/ui/format.js",
    find: "var v = clamp(value, range.min, range.max);",
    replace: "var v = value;",
    why: "a value outside the range put the slider outside 0..1"
  },

  /* ---------- stage 6: history.js ---------- */
  {
    file: "js/laser/ui/history.js",
    find: "return (next - count + i + capacity) % capacity;",
    replace: "return (i + capacity) % capacity;",
    why: "the ring buffer read from slot 0 after it wrapped"
  },
  {
    file: "js/laser/ui/history.js",
    find: "if (count < capacity) count += 1;",
    replace: "count += 1;",
    why: "the count growing past the capacity"
  },
  {
    file: "js/laser/ui/history.js",
    find: "while (first > 0 && times[indexOf(first - 1)] >= fromTime) first -= 1;",
    replace: "while (first > 0 && times[indexOf(first - 1)] > fromTime) first -= 1;",
    why: "the point exactly at the window's edge left out"
  },
  {
    file: "js/laser/ui/history.js",
    find: "        next = 0;\n        count = 0;",
    replace: "        next = 0;",
    why: "clear() forgets nothing"
  },

  /* ---------- stage 6: draw-levels.js ---------- */
  {
    file: "js/laser/ui/draw-levels.js",
    find: "var top = Math.max(picture.smallSignal, picture.y, lossOf(picture)) * HEADROOM;",
    replace: "var top = Math.max(picture.smallSignal, picture.y) * HEADROOM;",
    why: "the scale forgets the loss: below threshold the loss line is off the gauge"
  },
  {
    file: "js/laser/ui/draw-levels.js",
    find: "var top = Math.max(picture.smallSignal, picture.y, lossOf(picture)) * HEADROOM;",
    replace: "var top = Math.max(picture.smallSignal, lossOf(picture)) * HEADROOM;",
    why: "the scale forgets the inversion: a spike runs off the bar"
  },
  {
    file: "js/laser/ui/draw-levels.js",
    find: "g.fillRect(G.gainX, gainY, G.gainW, zeroY - gainY);",
    replace: "g.fillRect(G.gainX, G.top, G.gainW, zeroY - gainY);",
    why: "the gain bar hanging from the top"
  },
  {
    file: "js/laser/ui/draw-levels.js",
    find: "var lossY = gaugeY(loss);",
    replace: "var lossY = gaugeY(picture.smallSignal);",
    why: "the loss line drawn at the small-signal gain"
  },
  {
    file: "js/laser/ui/draw-levels.js",
    find: "var smallY = gaugeY(picture.smallSignal);",
    replace: "var smallY = gaugeY(picture.y);",
    why: "the small-signal gain drawn at the gain"
  },
  {
    file: "js/laser/ui/draw-levels.js",
    find: "shareBar(g, c, L.bar, picture.y / top);",
    replace: "shareBar(g, c, L.bar, picture.x / top);",
    why: "the upper-level bar showing the pump, not the inversion"
  },
  {
    file: "js/laser/ui/draw-levels.js",
    find: "var laserShare = clamp(picture.stim / ARROW_FULL, 0, 1);",
    replace: "var laserShare = clamp(picture.x / ARROW_FULL, 0, 1);",
    why: "the laser arrow drawn from the pump, so it shows before the laser starts"
  },
  {
    file: "js/laser/ui/draw-levels.js",
    find: "      g.strokeStyle = c.glow;",
    replace: "      g.strokeStyle = c.glo;",
    why: "a palette name misspelt: the colour is undefined"
  },

  /* ---------- stage 6: draw-plots.js ---------- */
  {
    file: "js/laser/ui/draw-plots.js",
    find: "return P.right - (chart.tNow - t) / chart.shownTime * width;",
    replace: "return P.left + (chart.tNow - t) / chart.shownTime * width;",
    why: "time running the wrong way: now on the left"
  },
  {
    file: "js/laser/ui/draw-plots.js",
    find: "var largest = chart.floor > 0 ? chart.floor : 0;",
    replace: "var largest = 0;",
    why: "the floor ignored: spontaneous emission blown up to fill the plot"
  },
  {
    file: "js/laser/ui/draw-plots.js",
    find: "if (point.t < from || point.t > chart.tNow) continue;",
    replace: "if (point.t > chart.tNow) continue;",
    why: "points older than the window drawn off the left edge"
  },
  {
    file: "js/laser/ui/draw-plots.js",
    find: "if (lines[j].value > largest) largest = lines[j].value;",
    replace: "if (false) largest = lines[j].value;",
    why: "the axis forgets the reference lines: the threshold or the steady output can be off the chart"
  },
  {
    file: "js/laser/ui/draw-plots.js",
    find: "g.fillText(S.valueLabels.texts[i], L.labelX,",
    replace: "g.fillText(S.valueLabels.texts[0], L.labelX,",
    why: "every tick of the value axis labelled with the first tick's number"
  },
  {
    file: "js/laser/ui/draw-plots.js",
    find: "timeLabels: UI.axis.labels(time.values, time.step, \"s\")",
    replace: "timeLabels: UI.axis.labels(value.values, value.step, \"s\")",
    why: "the time axis labelled with the value axis's numbers"
  },

  /* ---------- stage 6: draw-bench.js ---------- */
  {
    file: "js/laser/ui/draw-bench.js",
    find: "g.globalAlpha = rayAlpha(beam);",
    replace: "g.globalAlpha = Math.min(1, beam);",
    why: "the beam's alpha linear in the power: a weak laser looks dark"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "    if (beam > 0) {",
    replace: "    if (beam >= 0) {",
    why: "an invisible beam drawn with no light"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "line(g, outLeft, y, view.w, y);",
    replace: "line(g, outLeft, y, view.w - 10, y);",
    why: "the rays that leave stopping short of the edge"
  },

  /* ---------- stage 6: page.js ---------- */
  {
    file: "js/laser/page.js",
    find: "var piece = dt / state.slowMotion / pieces;",
    replace: "var piece = dt * state.slowMotion / pieces;",
    why: "slow motion multiplied instead of divided"
  },
  {
    file: "js/laser/page.js",
    find: "seconds: piece, maxSteps: stepsLeft });",
    replace: "seconds: piece, maxSteps: FRAME_STEPS });",
    why: "each piece given the whole frame's budget: a frame runs 8 times over"
  },
  {
    file: "js/laser/page.js",
    find: "stepsLeft -= run.steps;",
    replace: "stepsLeft -= 0;",
    why: "the budget never spent"
  },
  {
    file: "js/laser/page.js",
    find: "if (sinceReadout >= READOUT_EVERY) {",
    replace: "if (true) {",
    why: "the readouts rewritten every frame"
  },
  {
    file: "js/laser/page.js",
    find: "          showAll();                          // paused: show the exact moment\n",
    replace: "",
    why: "pausing leaves the readouts up to 0.1 s old"
  },
  {
    file: "js/laser/page.js",
    find: "if (!state) state = newState();",
    replace: "state = newState();",
    why: "a language switch restarts the experiment"
  },
  {
    file: "js/laser/page.js",
    find: "unhook.forEach(function (remove) { remove(); });",
    replace: "",
    why: "the old build's slider and button listeners left behind"
  },
  {
    file: "js/laser/page.js",
    find: "var HISTORY_SIZE = 16384;",
    replace: "var HISTORY_SIZE = 4096;",
    why: "a plot history too short for a fast screen (found on a 120 Hz Mac)"
  },
  {
    file: "js/laser/page.js",
    find: "            slider.setAttribute(\"aria-valuetext\", text);\n",
    replace: "",
    why: "screen readers hear slider positions 0..1000 instead of watts"
  },
  {
    file: "js/laser/page.js",
    find: "else if (name === \"coupler\") config.refl2 = 1 - value;",
    replace: "else if (name === \"coupler\") config.refl2 = value;",
    why: "the coupler's transmission used as its reflectivity"
  },
  {
    file: "js/laser/page.js",
    find: "if (note) note.hidden = !state.behind;",
    replace: "if (note) note.hidden = true;",
    why: "the note never says the simulation fell behind"
  },
  {
    file: "js/laser/page.js",
    find: "var shownTime = WINDOW / state.slowMotion;          // simulated s on the chart",
    replace: "var shownTime = WINDOW * state.slowMotion;          // simulated s on the chart",
    why: "the plot's window multiplied by the slow motion"
  },
  {
    file: "js/laser/page.js",
    find: "        beam: beamNow(),\n        pump: benchPumpNow(),",
    replace: "        beam: 1,\n        pump: benchPumpNow(),",
    why: "the beam drawn whatever the output"
  },
  {
    file: "js/laser/page.js",
    find: "return Math.max(0, y * p) / derived.thresholdRate;",
    replace: "return Math.max(0, y) / derived.thresholdRate;",
    why: "the laser arrow drawn from the inversion alone, before there is any light"
  },
  {
    file: "js/laser/page.js",
    find: "      state.history.clear();\n",
    replace: "",
    why: "Reset keeps the old run on the plot"
  },
  {
    file: "js/laser/page.js",
    find: "            take(config, numbers);\n            state.flashThreshold = threshold;",
    replace: "            state.config = config;\n            state.flashThreshold = threshold;",
    why: "a slider changes the config but not the numbers derived from it"
  },
  {
    file: "js/laser/page.js",
    find: "playing: !prefersLessMotion(),",
    replace: "playing: true,",
    why: "a visitor who asked for less motion gets it moving anyway"
  },
  {
    file: "js/laser/page.js",
    find: "var label = word(data, name + \".alt\") || word(data, \"page.title\");",
    replace: "var label = word(data, name + \".alt\");",
    why: "a picture with no description loses the page title as its name"
  },
  /* ---------- stage 6 review ---------- */
  {
    file: "js/laser/ui/format.js",
    find: "    if (rounded < 1e-15) {",
    replace: "    if (false) {",
    why: "a power below 1 fW handed to toFixed(), which throws past 100 decimals and stopped the page"
  },
  {
    file: "js/laser/ui/format.js",
    find: "    if (size !== 0 && size < 1e-15) {",
    replace: "    if (false) {",
    why: "number() of a tiny value handed to toFixed()"
  },
  {
    file: "js/laser/page.js",
    find: "        draw: pauseOnError(draw)",
    replace: "        draw: draw",
    why: "a drawing error pauses the loop but the button still says Pause"
  },
  {
    file: "js/laser/page.js",
    find: "update: pauseOnError(update), running: state.playing });",
    replace: "update: update, running: state.playing });",
    why: "a simulation error pauses the loop but the button still says Pause"
  },
  {
    file: "js/laser/page.js",
    find: "      takeDown();                             // a failed build leaves nothing behind\n",
    replace: "",
    why: "a build that fails part-way leaves its loop and listeners behind"
  },
  {
    file: "js/laser/page.js",
    find: "          showAll();                          // \"now\" depends on the bench too",
    replace: "          showReadouts(DERIVED_READOUTS);",
    why: "a slider moved while paused leaves the output now at its old number"
  },
  {
    file: "js/laser/page.js",
    find: "if (judgedTime >= BEHIND_EVERY) setBehind(",
    replace: "if (true) setBehind(",
    why: "the note judged on every frame: it blinks with every dropped frame"
  },
  {
    file: "js/laser/page.js",
    find: "          setBehind(false);                   // paused: nothing is behind\n",
    replace: "",
    why: "the note stays up while paused"
  },
  {
    file: "js/laser/page.js",
    find: "          setBehind(false);                   // the new setting is judged afresh\n",
    replace: "",
    why: "the note stays up after a slider moved to a cheaper setting"
  },
  {
    file: "js/laser/page.js",
    find: "var pieces = Math.min(MAX_PIECES, Math.max(1, Math.round(dt * POINTS_PER_SECOND)));",
    replace: "var pieces = MAX_PIECES;",
    why: "8 plot points a frame whatever the refresh rate: a fast screen cuts the plot short"
  },
  {
    file: "js/laser/page.js",
    find: "d.T_best === null || d.T_best <= 0 ?",
    replace: "d.T_best === null ?",
    why: "\"best output mirror 0 %\" when no mirror can make the laser run"
  },
  {
    file: "js/laser/ui/history.js",
    find: "for (var i = first; i < count; i++) list.push(pointAt(i));",
    replace: "for (var i = 0; i < count; i++) list.push(pointAt(i));",
    why: "points() hands out the whole buffer, older points included"
  },
  {
    file: "js/laser/ui/draw-plots.js",
    find: "if (wordY - L.fontSize < P.top) wordY = y + L.fontSize + 2;",
    replace: "if (false) wordY = y + L.fontSize + 2;",
    why: "the threshold word written over the box's title when the pump is off (found in the browser)"
  },
  /* ---------- stage 6b: the page in the owner's design ---------- */
  {
    file: "js/laser/ui/axis.js",
    find: "else if (ratio <= 2 + 1e-9) round = 2;",
    replace: "else if (ratio <= 2 + 1e-9) round = 2.5;",
    why: "a step of 2.5: ticks at 2.5 and 7.5"
  },
  {
    file: "js/laser/ui/axis.js",
    find: "var first = Math.ceil(min / step - 1e-9);",
    replace: "var first = Math.floor(min / step);",
    why: "a tick before the start of the axis"
  },
  {
    file: "js/laser/ui/axis.js",
    find: "for (var i = first; i <= last; i++) values.push(clean(i * step));",
    replace: "for (var i = first; i <= last; i++) values.push(i * step);",
    why: "rounding noise in the ticks (0.30000000000000004)"
  },
  {
    file: "js/laser/ui/axis.js",
    find: "var top = clean(Math.ceil(max / step - 1e-9) * step);",
    replace: "var top = clean(Math.floor(max / step) * step);",
    why: "the axis ends below the largest value"
  },
  {
    file: "js/laser/ui/axis.js",
    find: "var step = stepFor(max - min, count);",
    replace: "var step = stepFor(max, count);",
    why: "the step taken from the end of the window, not its length: one tick late in a run"
  },
  {
    file: "js/laser/ui/axis.js",
    find: "var prefix = unit ? UI.format.prefix(largest) : { power: 0, symbol: \"\" };",
    replace: "var prefix = UI.format.prefix(largest);",
    why: "a plain number given an SI prefix (0.004 written as 4)"
  },
  {
    file: "js/laser/ui/axis.js",
    find: "while (decimals < MAX_DECIMALS && clean(step / scale * powerOfTen(decimals)) < 1) decimals += 1;",
    replace: "while (false) decimals += 1;",
    why: "no decimals: 0.5, 1.0, 1.5 written as 1, 1, 2"
  },
  {
    file: "js/laser/ui/axis.js",
    find: "return (value < 0 && Number(text) !== 0 ? MINUS : \"\") + text;",
    replace: "return text;",
    why: "negative ticks lose their sign"
  },
  {
    file: "js/laser/ui/axis.js",
    find: "var decimals = Math.min(MAX_DECIMALS + 1, axisLabels.decimals + (extra || 0));",
    replace: "var decimals = axisLabels.decimals;",
    why: "the value tag written no finer than the ticks"
  },
  {
    file: "js/laser/ui/format.js",
    find: "return String(Number(value.toPrecision(digits || 3)));",
    replace: "return value.toPrecision(digits || 3);",
    why: "a number box showing 5.00 or 1.00e+4"
  },
  {
    file: "js/laser/ui/format.js",
    find: "if (!isNumber(value) || value === 0) return { power: 0, symbol: \"\" };",
    replace: "if (!isNumber(value)) return { power: 0, symbol: \"\" };",
    why: "0 given the smallest prefix"
  },
  {
    file: "js/laser/ui/draw-plots.js",
    find: "return P.bottom - value / S.value.top * height;",
    replace: "return P.top + value / S.value.top * height;",
    why: "the value axis upside down"
  },
  {
    file: "js/laser/ui/draw-plots.js",
    find: "var value = UI.axis.fromZero(largest * HEADROOM, VALUE_TICKS);",
    replace: "var value = UI.axis.fromZero(largest, VALUE_TICKS);",
    why: "no room above the highest point: a point on a tick touches the top"
  },
  {
    file: "js/laser/ui/draw-plots.js",
    find: "if (t >= 0) upright(xOf(t));",
    replace: "upright(xOf(t));",
    why: "grid lines for times before the start"
  },
  {
    file: "js/laser/ui/draw-plots.js",
    find: "if (t < 0 || x < P.left + 1.6 * L.fontSize || x > P.right - 1.2 * L.fontSize) return;",
    replace: "if (x < P.left + 1.6 * L.fontSize || x > P.right - 1.2 * L.fontSize) return;",
    why: "a negative time written under the chart"
  },
  {
    file: "js/laser/ui/draw-plots.js",
    find: "if (t < 0 || x < P.left + 1.6 * L.fontSize || x > P.right - 1.2 * L.fontSize) return;",
    replace: "if (t < 0) return;",
    why: "a time label at the edge of the plot, cut off or run into the unit"
  },
  {
    file: "js/laser/ui/draw-plots.js",
    find: "var tagY = yOf(last[key]);",
    replace: "var tagY = yOf(first[key]);",
    why: "the tag at the oldest value, not the latest"
  },
  {
    file: "js/laser/ui/draw-plots.js",
    find: "return Math.abs(shown[low].t - t) <= Math.abs(shown[high].t - t) ? shown[low] : shown[high];",
    replace: "return shown[low];",
    why: "the crosshair on the point before the pointer, not the nearest"
  },
  {
    file: "js/laser/ui/draw-plots.js",
    find: "var boxX = cx < (P.left + P.right) / 2 ? P.right - boxWidth - 6 : P.left + 6;",
    replace: "var boxX = P.left + 6;",
    why: "the reading always on the left: it covers the point under the pointer"
  },
  {
    file: "js/laser/ui/draw-plots.js",
    find: "if (typeof chart.cursor === \"number\" && chart.cursor >= P.left && chart.cursor <= P.right) {",
    replace: "if (typeof chart.cursor === \"number\") {",
    why: "a crosshair for a pointer outside the plot"
  },
  {
    file: "js/laser/ui/draw-plots.js",
    find: "g.globalAlpha = 0.14;",
    replace: "g.globalAlpha = 1;",
    why: "the area under the curve solid: it hides the grid"
  },
  {
    file: "js/laser/ui/draw-plots.js",
    find: "var curveColor = c[chart.color] || c.accent;",
    replace: "var curveColor = c.accent;",
    why: "every chart in the same colour"
  },
  {
    file: "js/laser/ui/draw-plots.js",
    find: "if (!(line.value > 0) || line.value > S.value.top) return;",
    replace: "if (line.value > S.value.top) return;",
    why: "a reference line drawn at 0 (no steady output below threshold)"
  },
  {
    file: "js/laser/ui/draw-plots.js",
    find: "text(g, S.valueLabels.unit, L.labelX, L.titleY, L.labelWidth);",
    replace: "text(g, chart.unit, L.labelX, L.titleY, L.labelWidth);",
    why: "the unit written without its prefix: milliwatts under 'W'"
  },
  {
    file: "js/laser/ui/draw-plots.js",
    find: "g.fillText(UI.axis.valueText(last[key], S.valueLabels, 2), L.labelX,",
    replace: "g.fillText(F.si(last[key], chart.unit, 3), L.labelX,",
    why: "the tag written in its own unit, not the axis's (5.12 mW on an axis of W)"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "var depth = 4 * L.sag * u * (1 - u);",
    replace: "var depth = 0;",
    why: "the rays end at the mirror's edge, not on its curved face"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "return clamp(Math.round(count * share), 1, count);",
    replace: "return clamp(Math.round(count * share), 0, count);",
    why: "no ray leaves through a weak output mirror"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "return clamp(Math.round(count * share), 1, count);",
    replace: "return clamp(Math.floor(count * share), 1, count);",
    why: "the rays that leave rounded down: 1 of 15 at 10 %"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "var first = Math.floor((count - howMany) / 2);",
    replace: "var first = 0;",
    why: "the rays that leave are the top ones, not the ones on the axis"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "if (i % 2 === 0) arrowHead(g, rightGap + 4, y, 1, 0, 6);",
    replace: "if (true) arrowHead(g, rightGap + 4, y, 1, 0, 6);",
    why: "every ray pointing right: light going one way only"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "var RAY_GAP = 5;",
    replace: "var RAY_GAP = 2;",
    why: "rays packed closer than 5 px: a blur, not separate rays"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "    if (pump > 0) lightUp(g, colors.glow, L, L.lamp.x, L.lamp.w, L.lamp.y, pump);",
    replace: "    lightUp(g, colors.glow, L, L.lamp.x, L.lamp.w, L.lamp.y, pump);",
    why: "pump light drawn with the pump off"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "\n    g.globalAlpha = 0.3 + 0.7 * pump;\n    g.strokeStyle = color;",
    replace: "\n    g.globalAlpha = 1;\n    g.strokeStyle = color;",
    why: "pump light as strong at 1 W as at 20 W"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "g.lineWidth = strong ? 3.5 : 2;",
    replace: "g.lineWidth = 2;",
    why: "both mirrors drawn with the same coating"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "var railY = 0.81 * h;",
    replace: "var railY = 0.69 * h;",
    why: "the bench drawn through the parts"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "line(g, faceX(L, \"back\", y), y, faceX(L, \"output\", y), y);",
    replace: "line(g, L.rod.x, y, L.rod.x + L.rod.w, y);",
    why: "rays only inside the rod: no light between the rod and the mirrors"
  },
  {
    file: "js/laser/ui/draw-photons.js",
    find: "if (atom.excited && photons.length < MOST && random() < CHANCE) emitWith(atom, photon);",
    replace: "if (photons.length < MOST && random() < CHANCE) emitWith(atom, photon);",
    why: "an atom at rest emitting: light from nothing"
  },
  {
    file: "js/laser/ui/draw-photons.js",
    find: "      atom.excited = false;\n      atom.flash = 1;\n      tally.stimulated += 1;\n      // Beside the first",
    replace: "      atom.flash = 1;\n      tally.stimulated += 1;\n      // Beside the first",
    why: "an atom keeps its energy after emitting: energy from nothing"
  },
  {
    file: "js/laser/ui/draw-photons.js",
    find: "laserPhoton(photon.x, y, photon.row, photon.dx);",
    replace: "laserPhoton(photon.x, y, photon.row, -photon.dx);",
    why: "the second photon flying the other way: not stimulated emission"
  },
  {
    file: "js/laser/ui/draw-photons.js",
    find: "if (Math.abs(Math.sin(angle)) < Math.sin(CONE)) {",
    replace: "if (true) {",
    why: "every photon an atom emits by itself joins the laser light"
  },
  {
    file: "js/laser/ui/draw-photons.js",
    find: "        if (photons.length >= MOST) continue;\n",
    replace: "",
    why: "photons entering without limit"
  },
  {
    file: "js/laser/ui/draw-photons.js",
    find: "liftCredit = Math.min(3, liftCredit + LIFT * (0.2 + 0.8 * drive.pump) * dt);",
    replace: "liftCredit = Math.min(3, liftCredit + LIFT * dt);",
    why: "a weak pump lifting atoms as fast as a strong one"
  },
  {
    file: "js/laser/ui/draw-photons.js",
    find: "if (drive.light > 0.02 && photons.length < MOST) {",
    replace: "if (false) {",
    why: "atoms falling in laser light shown as emitting by themselves"
  },
  {
    file: "js/laser/ui/draw-photons.js",
    find: "atom.flash = Math.max(0, atom.flash - dt / FLASH);",
    replace: "atom.flash = Math.max(0, atom.flash - dt);",
    why: "the flash fading at a speed of its own, not LIMITS.flash"
  },
  {
    file: "js/laser/ui/draw-photons.js",
    find: "if (p.x < -0.03 || p.x > 1.03 || p.y < -0.03 || p.y > 1.03) photons.splice(j, 1);",
    replace: "if (false) photons.splice(j, 1);",
    why: "photons that left the picture never forgotten"
  },
  {
    file: "js/laser/ui/draw-photons.js",
    find: "photon.x += photon.dx * SPEED * dt;",
    replace: "photon.x += photon.dx * dt;",
    why: "photons flying at a speed of their own, not LIMITS.speed"
  },
  {
    file: "js/laser/ui/draw-photons.js",
    find: "laserPhoton(direction === 1 ? 0 : 1, (row + 0.5) / rows, row, direction);",
    replace: "laserPhoton(0, (row + 0.5) / rows, row, direction);",
    why: "a photon going left entering at the left edge: it leaves at once"
  },
  {
    file: "js/laser/ui/draw-photons.js",
    find: "enterCredit = Math.min(3, enterCredit + ENTER * wanted.light * dt);",
    replace: "enterCredit = Math.min(3, enterCredit + ENTER * dt);",
    why: "laser photons entering with no laser light"
  },
  {
    file: "js/laser/ui/draw-photons.js",
    find: "dropCredit = Math.min(3, dropCredit + DROP * dt);",
    replace: "dropCredit = 3;",
    why: "the atoms falling all at once when the inversion falls"
  },
  {
    file: "js/laser/ui/draw-photons.js",
    find: "atomMark(g, c, x, y, radius, atom.excited);",
    replace: "atomMark(g, c, x, y, radius, false);",
    why: "excited atoms drawn like atoms at rest"
  },
  {
    file: "js/laser/ui/draw-photons.js",
    find: "var tone = photon.row < 0 ? c.muted : c.accent2;",
    replace: "var tone = c.accent2;",
    why: "stray photons drawn like laser photons"
  },
  {
    file: "js/laser/ui/draw-photons.js",
    find: "g.rotate(Math.atan2(dy, dx));",
    replace: "g.rotate(0);",
    why: "every photon drawn pointing right"
  },
  {
    file: "js/laser/ui/draw-photons.js",
    find: "    g.clip();\n",
    replace: "",
    why: "photons drawn outside the box"
  },
  {
    file: "js/laser/ui/draw-photons.js",
    find: "      if (!word(name)) return;\n",
    replace: "",
    why: "a legend mark drawn for a word that is missing"
  },
  {
    file: "js/laser/page.js",
    find: "if (box) box.value = F.plain(shown.factor * value, BOX_DIGITS);",
    replace: "if (box) box.value = F.plain(value, BOX_DIGITS);",
    why: "the output mirror's box showing 0.05 beside a % sign"
  },
  {
    file: "js/laser/page.js",
    find: "var rounded = round(typed, BOX_DIGITS) / shownOf(name).factor;",
    replace: "var rounded = round(typed, BOX_DIGITS);",
    why: "12.5 typed as per cent taken as 12.5 (1250 %)"
  },
  {
    file: "js/laser/page.js",
    find: "var rounded = round(typed, BOX_DIGITS) / shownOf(name).factor;\n            use(clamp(rounded, range.min, range.max), true);",
    replace: "var rounded = round(typed, BOX_DIGITS) / shownOf(name).factor;\n            use(rounded, true);",
    why: "a typed 50 W accepted: beyond what the slider allows"
  },
  {
    file: "js/laser/page.js",
    find: "return clamp(round(value, SLIDER_DIGITS), range.min, range.max);",
    replace: "return clamp(value, range.min, range.max);",
    why: "a slider giving 1.7078032… %, which the box cannot show exactly"
  },
  {
    file: "js/laser/page.js",
    find: "        setText('[data-laser-unit=\"' + name + '\"]', shown.unit);\n",
    replace: "",
    why: "the number boxes without their units"
  },
  {
    file: "js/laser/page.js",
    find: "cursor = event.offsetX;",
    replace: "cursor = event.clientX;",
    why: "the pointer measured from the window, not from the chart"
  },
  {
    file: "js/laser/page.js",
    find: "        cursor = null;\n",
    replace: "",
    why: "the crosshair stays after the pointer left"
  },
  {
    file: "js/laser/page.js",
    find: "theory.scrollIntoView({ behavior: prefersLessMotion() ? \"auto\" : \"smooth\", block: \"start\" });",
    replace: "theory.scrollIntoView({ behavior: \"smooth\", block: \"start\" });",
    why: "a smooth scroll for a visitor who asked for less motion"
  },
  {
    file: "js/laser/page.js",
    find: "return y / (1 + y);",
    replace: "return y;",
    why: "the cartoon's excited share is the raw inversion: every atom excited at threshold"
  },
  {
    file: "js/laser/page.js",
    find: "state.cartoon.step(dt, {",
    replace: "state.cartoon.step(dt / state.slowMotion, {",
    why: "the cartoon run in simulated time: it stands still"
  },
  {
    file: "js/laser/page.js",
    find: "light: UI.bench.rayAlpha(beamNow()),",
    replace: "light: 1,",
    why: "the cartoon full of laser light before the laser starts"
  },
  {
    file: "js/laser/page.js",
    find: "return Math.min(1, pumpLevel() / PUMP_FULL);",
    replace: "return pumpLevel() / PUMP_FULL;",
    why: "the pump's glow not held at its strongest"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "return word ? word + \" \" + number : number;",
    replace: "return word || number;",
    why: "the output mirror's transmission written without its number"
  },
  {
    file: "js/laser/page.js",
    find: "return Math.min(1, pumpLevel() / PUMP_FULL);",
    replace: "return Math.min(1, pumpLevel());",
    why: "the pump's glow at full strength from threshold up"
  },
  {
    file: "js/laser/page.js",
    find: "        transmission: 1 - state.config.refl2,\n",
    replace: "        transmission: state.config.refl2,\n",
    why: "the rays that leave counted from the reflectivity"
  },
  {
    file: "js/laser/page.js",
    find: "floor: derived.powerAtTwiceThreshold,",
    replace: "floor: 0,",
    why: "no floor on the power axis: spontaneous emission blown up to fill the chart"
  },
  {
    file: "js/laser/page.js",
    find: "if (derived.P_out !== null && derived.P_out > 0) lines.push(",
    replace: "if (false) lines.push(",
    why: "no steady-output line on the power chart"
  },
  {
    file: "js/laser/page.js",
    find: "if (!any) return null;",
    replace: "if (!found.bench) return null;",
    why: "a page with only its charts builds nothing"
  },
  {
    file: "js/laser/page.js",
    find: "var shownTime = WINDOW / state.slowMotion;          // simulated s on the chart",
    replace: "var shownTime = WINDOW;",
    why: "the charts showing 5 simulated seconds, not 5 seconds of screen time"
  },
  {
    file: "sections/laser.html",
    find: "data-laser-input=\"coupler\"",
    replace: "data-laser-input=\"mirror\"",
    why: "a number box page.js cannot find"
  },
  {
    file: "sections/laser.html",
    find: " aria-labelledby=\"laser-pump-name\" data-laser-input=\"pump\"",
    replace: " data-laser-input=\"pump\"",
    why: "a number box with no name for screen readers"
  },
  {
    file: "sections/laser.html",
    find: "<section class=\"band laser-learn\" data-laser-learn>",
    replace: "<section class=\"band laser-learn\">",
    why: "the theory button with nowhere to scroll to"
  },
  {
    file: "sections/laser.html",
    find: "data-laser-canvas=\"photons\"",
    replace: "data-laser-canvas=\"photon\"",
    why: "a canvas page.js cannot find"
  },
  {
    file: "data/laser.json",
    find: "\"button\": { \"hy\": \"Խորանալ լազերի ֆիզիկայի մեջ\",",
    replace: "\"button\": { \"hy\": \"\",",
    why: "the theory button without its Armenian words"
  },
  {
    file: "data/laser.json",
    find: "  \"photons\": {",
    replace: "  \"photon\": {",
    why: "the photon picture's words under another name"
  },
  {
    file: "index.html",
    find: "<script src=\"js/laser/ui/axis.js\"></script>\n  <script src=\"js/laser/ui/history.js\"></script>",
    replace: "<script src=\"js/laser/ui/history.js\"></script>\n  <script src=\"js/laser/ui/axis.js\"></script>",
    why: "the UI files loaded in another order than UI_FILES"
  },
  {
    file: "js/laser/ui/loop.js",
    find: "    bg: \"--bg\"",
    replace: "    bg: \"--bg-dark\"",
    why: "a palette colour no theme sets"
  },
  /* ---------- stage 6b: from the review ---------- */
  {
    file: "js/laser/page.js",
    find: "      state.cartoon = newCartoon();       // no atoms or light left from the old run\n",
    replace: "",
    why: "Reset or a new bench keeping the old cartoon's atoms and photons"
  },
  {
    file: "js/laser/page.js",
    find: ".replace(/[\\s\\u00a0]/g, \"\").replace(\",\", \".\")",
    replace: ".replace(/[\\s\\u00a0]/g, \"\")",
    why: "a decimal comma not read as a point"
  },
  {
    file: "js/laser/page.js",
    find: "String(text).replace(/[\\s\\u00a0]/g, \"\")",
    replace: "String(text).trim()",
    why: "spaces between digits not dropped"
  },
  {
    file: "js/laser/page.js",
    find: "    if (cleaned === \"\") return NaN;\n",
    replace: "",
    why: "an empty box read as 0"
  },
  {
    file: "js/laser/page.js",
    find: "var rounded = round(typed, BOX_DIGITS) / shownOf(name).factor;",
    replace: "var rounded = typed / shownOf(name).factor;",
    why: "a typed value used with more digits than the box shows"
  },
  {
    file: "js/laser/page.js",
    find: "      listen(canvas, \"pointerdown\", pointAt);\n",
    replace: "",
    why: "a tap on a chart (no pointermove) shows no crosshair"
  },
  {
    file: "js/laser/page.js",
    find: "if (event.pointerType === \"touch\") return;",
    replace: "if (false) return;",
    why: "a finger leaving after a tap takes the crosshair away"
  },
  {
    file: "js/laser/page.js",
    find: "        cursor = event.offsetX;\n        loop.redraw(canvas);",
    replace: "        cursor = event.offsetX;\n        loop.redraw();",
    why: "the pointer redrawing every picture, not its chart"
  },
  {
    file: "js/laser/page.js",
    find: "light: UI.bench.rayAlpha(beamNow()),",
    replace: "light: Math.min(1, beamNow()),",
    why: "the cartoon's light not the bench's ray strength"
  },
  {
    file: "js/laser/page.js",
    find: "      UI.bench.draw(view, labels, {",
    replace: "      labels.transmission = \"\";\n      UI.bench.draw(view, labels, {",
    why: "page.js changing the bench's words"
  },
  {
    file: "js/laser/ui/loop.js",
    find: "        if (canvas === undefined) {",
    replace: "        if (true) {",
    why: "redraw(canvas) drawing every canvas"
  },
  {
    file: "js/laser/ui/loop.js",
    find: "        if (destroyed || frameId !== null) return;\n        if (canvas === undefined) {",
    replace: "        if (destroyed) return;\n        if (canvas === undefined) {",
    why: "redraw(canvas) drawing outside a frame while running"
  },
  {
    file: "js/laser/ui/draw-plots.js",
    find: "      g.fillStyle = c.heading;\n      g.font = \"700 \"",
    replace: "      g.fillStyle = c.bg;\n      g.font = \"700 \"",
    why: "the tag's text in the background colour, on the background"
  },
  {
    file: "js/laser/ui/draw-plots.js",
    find: "      g.fillStyle = c.bg;\n      g.fillRect(P.right + 1",
    replace: "      g.fillStyle = curveColor;\n      g.fillRect(P.right + 1",
    why: "the tag filled with the curve's colour again (too little contrast)"
  },
  {
    file: "js/laser/ui/draw-plots.js",
    find: "      g.strokeRect(P.right + 1, tagY - tagHeight / 2, L.tagWidth, tagHeight);\n",
    replace: "",
    why: "the tag without its frame"
  },
  {
    file: "js/laser/ui/draw-plots.js",
    find: "      if (lines[j].stretch === false) continue;\n",
    replace: "",
    why: "a line with stretch: false stretching the axis"
  },
  {
    file: "js/laser/ui/draw-plots.js",
    find: "if (!(line.value > 0) || line.value > S.value.top) return;",
    replace: "if (!(line.value > 0)) return;",
    why: "a line above the axis drawn outside the plot"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "transmission: { x: w - pad, y: topRow, align: \"right\", maxWidth: w - 2 * pad }",
    replace: "transmission: { x: w - pad, y: bottomRow, align: \"right\", maxWidth: (w - pad) - (w / 2 + lampLength / 2) - fontSize }",
    why: "the transmission back under the bench, squeezed beside the pump's name"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "maxWidth: w - 2 * pad }",
    replace: "maxWidth: w / 2 - pad - fontSize }",
    why: "the transmission's row only half wide"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "var nameRow = topRow - 1.35 * fontSize;",
    replace: "var nameRow = topRow;",
    why: "the mirror names on the transmission's row"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "return word ? word + \" \" + number : number;",
    replace: "return word + \" \" + number;",
    why: "the transmission's number after an empty word"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "if (typeof transmission !== \"number\" || !isFinite(transmission)) return \"\";",
    replace: "if (transmission === undefined) return \"\";",
    why: "a transmission that is no number written out"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "return beam > 0 ? Math.min(1, Math.sqrt(beam)) : 0;",
    replace: "return beam > 0 ? Math.min(1, beam) : 0;",
    why: "rayAlpha without the square root"
  },
  {
    file: "sections/laser.html",
    find: "type=\"text\" inputmode=\"decimal\" autocomplete=\"off\" spellcheck=\"false\" aria-labelledby=\"laser-pump-name\"",
    replace: "type=\"number\" inputmode=\"decimal\" autocomplete=\"off\" spellcheck=\"false\" aria-labelledby=\"laser-pump-name\"",
    why: "the pump's box a number input (loses a decimal comma)"
  },
  {
    file: "css/laser.css",
    find: "  touch-action: pan-y;\n",
    replace: "",
    why: "a finger drag on a chart taken by the browser"
  },
  /* ---------- stage 7a: ode.rosenbrock, the seed floor, the bench ---------- */
  {
    file: "js/laser/engine/ode.js",
    find: "d: 1 / (2 + Math.SQRT2),",
    replace: "d: 1 / (2 - Math.SQRT2),",
    why: "d from the other root of the method's equation"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "e32: 6 + Math.SQRT2",
    replace: "e32: 6 - Math.SQRT2",
    why: "e32 with the wrong sign of √2"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "rhs.push(f0[m] + hd * T[m]);",
    replace: "rhs.push(f0[m]);",
    why: "∂f/∂t left out of k₁: a stiff problem that changes with t lags behind"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "- 2 * (k1[m] - f0[m]) + hd * T[m]);",
    replace: "- 2 * (k1[m] - f0[m]));",
    why: "∂f/∂t left out of k₃ (the error estimate)"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "var f1 = derivatives(Math.min(t + 0.5 * h, t1), midState);",
    replace: "var f1 = derivatives(Math.min(t + h, t1), midState);",
    why: "the middle stage evaluated at the end of the step"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "midState.push(state[m] + 0.5 * h * k1[m]);",
    replace: "midState.push(state[m] + h * k1[m]);",
    why: "the middle stage's state a whole step on"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "    for (m = 0; m < n; m++) k2[m] += k1[m];\n",
    replace: "",
    why: "k₂ without its + k₁"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "estimate.push(h / 6 * (k1[m] - 2 * k2[m] + k3[m]));",
    replace: "estimate.push(h / 3 * (k1[m] - 2 * k2[m] + k3[m]));",
    why: "the error estimate twice too big"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "estimate.push(h / 6 * (k1[m] - 2 * k2[m] + k3[m]));",
    replace: "estimate.push(h / 6 * (k1[m] + 2 * k2[m] + k3[m]));",
    why: "the error estimate with a wrong sign"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "var ROSENBROCK_EXPONENT = 1 / 3;",
    replace: "var ROSENBROCK_EXPONENT = 1 / 5;",
    why: "the step control of dopri5 (order 5) for an order-3 error estimate"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "row.push((m === j ? 1 : 0) - hd * J[m][j]);",
    replace: "row.push((m === j ? 1 : 0) + hd * J[m][j]);",
    why: "W = I + h·d·J: the implicit part with the wrong sign"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "row.push((m === j ? 1 : 0) - hd * J[m][j]);",
    replace: "row.push((m === j ? 1 : 0) - hd * J[j][m]);",
    why: "the Jacobian transposed"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "        if (Math.abs(matrix[row][col]) > Math.abs(matrix[best][col])) best = row;\n",
    replace: "",
    why: "no pivoting: a 0 on the diagonal is divided by"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "        order[col] = order[best];\n        order[best] = swapIndex;\n",
    replace: "",
    why: "rows swapped without keeping track of their order"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "        matrix[row][col] = factor;\n",
    replace: "",
    why: "the elimination factors not kept for the solve"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "x[i] = sum / lu[i][i];",
    replace: "x[i] = sum;",
    why: "back substitution without dividing by the diagonal"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "sum = b[factors.order[i]];",
    replace: "sum = b[i];",
    why: "the right-hand side not put in the swapped row order"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "      if (state[j] + step === state[j]) step = Math.sqrt(Number.EPSILON) * Math.abs(state[j]);\n",
    replace: "",
    why: "a Jacobian step lost in rounding at large |state| (0/0)"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "for (i = 0; i < n; i++) J[i][j] = (fMoved[i] - f0[i]) / delta;",
    replace: "for (i = 0; i < n; i++) J[j][i] = (fMoved[i] - f0[i]) / delta;",
    why: "the Jacobian filled in by rows instead of columns"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "      if (point !== jacobianPoint) {",
    replace: "      if (jacobianPoint === null) {",
    why: "J and T never computed again after the first point"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "      if (point !== jacobianPoint) {",
    replace: "      if (true) {",
    why: "J and T computed again for every retry: n + 1 calls of f wasted"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "var delta = Math.min(Math.sqrt(Number.EPSILON) * Math.max(Math.abs(t), Math.abs(t + h)), h);",
    replace: "var delta = Math.sqrt(Number.EPSILON) * Math.max(Math.abs(t), Math.abs(t + h));",
    why: "∂f/∂t over √ε·|t| even when that is longer than the step: on a short call f is called past t1"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "return (value - f0[i]) / dt;",
    replace: "return (f0[i] - value) / dt;",
    why: "∂f/∂t with the wrong sign"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "return (value - f0[i]) / dt;",
    replace: "return 0;",
    why: "∂f/∂t taken as 0"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "point = { t: lastStep ? t1 : point.t + hTry, state: step.state, f: step.fNew };",
    replace: "point = { t: lastStep ? t1 : point.t + hTry, state: step.state, f: point.f };",
    why: "f at the new point never taken over: every step starts from the first derivative"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "      if (!isFinite(newState[m])) {\n        return { state: newState, fNew: f2, err: Infinity };",
    replace: "      if (false) {\n        return { state: newState, fNew: f2, err: Infinity };",
    why: "a step into Infinity accepted (rosenbrock)"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "    if (isNaN(err)) err = Infinity;\n    return { state: newState, fNew: f2, err: err };",
    replace: "    return { state: newState, fNew: f2, err: err };",
    why: "a NaN error makes the step NaN (rosenbrock)"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "var f2 = derivatives(Math.min(t + h, t1), newState);",
    replace: "var f2 = derivatives(t + h, newState);",
    why: "f called one rounding unit past t1 on the last step"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "firstStep(derivatives, t0, t1, point.state, point.f, inputs.rtol, inputs.atol, exponent)",
    replace: "firstStep(derivatives, t0, t1, point.state, point.f, inputs.rtol, inputs.atol, ERROR_EXPONENT)",
    why: "the first-step guess made for dopri5's order"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "var run = E.ode.rosenbrock({\n        f: f, t0: from,",
    replace: "var run = E.ode.dopri5({\n        f: f, t0: from,",
    why: "the bench back on the explicit solver: below threshold its step stays below 3.3ε/(1 − y)"
  },

  /* ---------- stage 7b: three and two levels, the pumps ---------- */
  {
    file: "js/laser/engine/rates.js",
    find: "seed = Math.exp(logBeta + Math.log(Math.max(n_t + y, 0) + floor) - s);",
    replace: "seed = Math.exp(logBeta + Math.log(Math.max(y, 0) + floor) - s);",
    why: "three levels seeded from ΔN instead of N₂ (D2): no seed before half inversion"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "var result = scalesFor(numbers, 2 * numbers.B * numbers.tau);",
    replace: "var result = scalesFor(numbers, numbers.B * numbers.tau);",
    why: "three levels without the factor 2 of an emission changing ΔN by 2"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "var pumped = twoLevel ? -2 * pump * y : pump * (n_t - y);",
    replace: "var pumped = twoLevel ? -pump * y : pump * (n_t - y);",
    why: "two levels: the pump's stimulated emission −w·y instead of −2w·y"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "var pumped = twoLevel ? -2 * pump * y : pump * (n_t - y);",
    replace: "var pumped = pump * (n_t - y);",
    why: "two levels pumped as three: the pump light does not drive the ions back down"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "var pumped = twoLevel ? -2 * pump * y : pump * (n_t - y);",
    replace: "var pumped = twoLevel ? -2 * pump * y : pump * n_t;",
    why: "three levels: the pump does not empty the ground level"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "return [pumped - (n_t + y) - y * Math.exp(s), ((y - 1) + seed) / eps];",
    replace: "return [pumped - y - y * Math.exp(s), ((y - 1) + seed) / eps];",
    why: "three levels: spontaneous decay of ΔN as for four levels, not of N₂"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "return [pumped - (n_t + y) - y * Math.exp(s), ((y - 1) + seed) / eps];",
    replace: "return [pumped - (n_t + y) - y * Math.exp(s), ((1 - y) + seed) / eps];",
    why: "three levels: sign of (y − 1) flipped"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "+ ION_FLOOR * n_t) - Math.log(1 + n_t);",
    replace: "+ ION_FLOOR * n_t);",
    why: "three-level liftToSeed without /(1 + n_t): it raises ruby's all-down level"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "var ION_FLOOR = 1e-7;",
    replace: "var ION_FLOOR = 1e-12;",
    why: "the ion floor at 10⁻¹²: rounding of n_t + y becomes noise and the solver crawls"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "var floor = ION_FLOOR * n_t;\n    var seedShift",
    replace: "var floor = ION_FLOOR;\n    var seedShift",
    why: "the three-level steady state with a floor that is not f's"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "p = steadyPhotons((n_t - 1) * w - (n_t + 1) + seedShift,",
    replace: "p = steadyPhotons((n_t - 1) * w - (n_t + 1),",
    why: "the three-level steady state without the seed"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "return { y: -n_t / (1 + 2 * w + p), p: p };",
    replace: "return { y: -n_t / (1 + w + p), p: p };",
    why: "the two-level steady state without the factor 2"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "return { y: n_t * (w - 1) / (1 + w + p), p: p };",
    replace: "return { y: n_t * (w - 1) / (1 + w), p: p };",
    why: "the three-level steady y without the light's p"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "result.wThreshold = n_t > 1 ? (n_t + 1) / (n_t - 1) : null;",
    replace: "result.wThreshold = n_t > 1 ? n_t / (n_t - 1) : null;",
    why: "three-level threshold pump wrong"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "var p0 = (n_t - 1) * w - (n_t + 1);",
    replace: "var p0 = w - 1;",
    why: "three-level relaxation: four-level p₀"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "return oscillation(p0 / (tau * tau_c), n_t * (w - 1) / (2 * tau));",
    replace: "return oscillation(p0 / (tau * tau_c), w / (2 * tau));",
    why: "three-level relaxation damped at four levels' rate"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "var pump = pumpAt === null ? x : pumpAt(tPrime);",
    replace: "var pump = pumpAt === null ? x : pumpAt(0);",
    why: "four levels: a pump function read only at t′ = 0"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "var pump = pumpAt === null ? w : pumpAt(tPrime);",
    replace: "var pump = pumpAt === null ? w : pumpAt(0);",
    why: "three levels: a pump function read only at t′ = 0"
  },
  {
    file: "js/laser/engine/pumps.js",
    find: "var scale = energy / flashTime;",
    replace: "var scale = energy;",
    why: "the flash not normalised: ∫P dt is E·t_p"
  },
  {
    file: "js/laser/engine/pumps.js",
    find: "return scale * u * Math.exp(-u);",
    replace: "return scale * Math.exp(-u);",
    why: "the flash as a jump and a decay, not t·e^(−t)"
  },
  {
    file: "js/laser/engine/pumps.js",
    find: "if (t <= 0) return 0;",
    replace: "",
    why: "the flash lights before it is fired"
  },
  {
    file: "js/laser/engine/pumps.js",
    find: "var GAIN_RATIO = 4;",
    replace: "var GAIN_RATIO = 3;",
    why: "§6.4's a/b changed"
  },
  {
    file: "js/laser/engine/pumps.js",
    find: "if (law === \"optimum\") return currentPeak * (ROOT_RATIO + 1);",
    replace: "if (law === \"optimum\") return currentPeak * ROOT_RATIO;",
    why: "the optimum law's highest current too low"
  },
  {
    file: "js/laser/engine/pumps.js",
    find: "return gainPeak * ratio * ratio;",
    replace: "return gainPeak * ratio;",
    why: "Ar⁺'s gain linear in the current, not square"
  },
  {
    file: "js/laser/engine/pumps.js",
    find: "if (law === \"square\") return currentPeak * Math.sqrt(k);",
    replace: "if (law === \"square\") return currentPeak * k;",
    why: "the square law's threshold without the root"
  },
  {
    file: "js/laser/engine/pumps.js",
    find: "var b = GAIN_RATIO - 1 - c;",
    replace: "var b = GAIN_RATIO - 1 + c;",
    why: "the optimum threshold's quadratic with a sign flipped"
  },
  {
    file: "js/laser/engine/pumps.js",
    find: "var u = 2 * c / (b + Math.sqrt(Math.max(0, b * b - 4 * c)));",
    replace: "var u = (b + Math.sqrt(Math.max(0, b * b - 4 * c))) / 2;",
    why: "the optimum threshold at the larger root, past the peak"
  },
  {
    file: "js/laser/engine/pumps.js",
    find: "if (k > 1) return null;",
    replace: "",
    why: "a tube that never reaches threshold given a current anyway"
  },
  {
    file: "js/laser/engine/pumps.js",
    find: "if (current > highest) {",
    replace: "if (current > 10 * highest) {",
    why: "a current past the law's end accepted"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "    var lowest = lowestN(read.medium);",
    replace: "    var lowest = 0;",
    why: "three levels clamped at ΔN = 0 instead of −N_t"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "    var N = lowestN(read.medium);",
    replace: "    var N = 0;",
    why: "ruby starts half inverted, not with every ion down"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "var perVolume = config.eta * power / (U.photonEnergy(config.pumpLam) * config.area * config.l_g);",
    replace: "var perVolume = power / (U.photonEnergy(config.pumpLam) * config.area * config.l_g);",
    why: "the pump rate without η, for every pump of light: every absorbed photon counted as reaching the upper level"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "return perVolume * d.tau / d.N_t;",
    replace: "return perVolume * d.tau / d.N_c;",
    why: "w per ion of the threshold inversion, not per ion"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "return perVolume * d.tau / d.N_t;",
    replace: "return perVolume / d.N_t;",
    why: "w without τ"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "var perWatt = pumpLevel(d, config, config.flashShare);",
    replace: "var perWatt = pumpLevel(d, config, 1);",
    why: "the whole lamp's light absorbed by the rod"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "var peak = pumpLevel(d, config, config.flashShare * d.flashPeak);",
    replace: "var peak = pumpLevel(d, config, d.flashPeak);",
    why: "xPeak counts the whole lamp's light"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "else if (d.wThreshold !== null) d.xPeak = peak / d.wThreshold;",
    replace: "else if (d.wThreshold !== null) d.xPeak = peak;",
    why: "three-level xPeak as w, not in units of threshold"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "d.flashPeak = config.flashEnergy / (Math.E * config.flashTime);",
    replace: "d.flashPeak = config.flashEnergy / config.flashTime;",
    why: "the lamp's peak without the 1/e"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "if (d.scheme === \"four-level\") {\n      return target * atPeak / photonFreePeak(d, config, atPeak);",
    replace: "if (d.scheme !== \"two-level\") {\n      return target * atPeak / photonFreePeak(d, config, atPeak);",
    why: "ruby's flash threshold by the four-level linear shortcut"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "if (photonFreePeak(d, config, middle) < target) low = middle;\n      else high = middle;",
    replace: "if (photonFreePeak(d, config, middle) < target) high = middle;\n      else low = middle;",
    why: "the bisection turned the wrong way"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "return perWatt * lamp(since + tPrime * tau);",
    replace: "return perWatt * lamp(tPrime * tau);",
    why: "the flash restarts at every call"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "flashPump(d, config, flash.flashEnergy, flash.flashTime, sim.t - flash.at);",
    replace: "flashPump(d, config, flash.flashEnergy, flash.flashTime, flash.at);",
    why: "the flash's age taken as its firing time"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "if (Math.abs(pumpLam - medium.lam) > 1e-9 * medium.lam) {",
    replace: "if (false) {",
    why: "the two-level atom pumped at another wavelength"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "if (flash.at > sim.t) {",
    replace: "if (false) {",
    why: "a flash later than the simulation accepted"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "    if (sim.flash !== null && read.setup.pump !== \"flashlamp\") {\n      check.fail(where, \"sim.flash is a flash fired at \" + sim.flash.at + \" s, but this bench has no \" +\n        \"flashlamp (its pump is \" + read.setup.pump + \").\" + again);",
    replace: "    if (false) {\n      check.fail(where, \"sim.flash is a flash fired at \" + sim.flash.at + \" s, but this bench has no \" +\n        \"flashlamp (its pump is \" + read.setup.pump + \").\" + again);",
    why: "a fired flash carried to a bench without a flashlamp"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "wThreshold: medium.scheme === \"three-level\" ? scales.wThreshold : null,",
    replace: "wThreshold: fourLevel ? null : scales.wThreshold,",
    why: "the two-level atom given a threshold"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "d.x = g0 * config.l_g / d.gamma;",
    replace: "d.x = g0 / d.gamma;",
    why: "the discharge's x without the tube length"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "if (config.current > highest) {",
    replace: "if (false) {",
    why: "the bench lets a discharge current past its law's end through"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "var ions = d.scheme === \"three-level\" ? E.rates.threeLevel : E.rates.twoLevel;",
    replace: "var ions = E.rates.threeLevel;",
    why: "the two-level atom run with three levels' equations"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "var FLASH_SHARE = 0.12;",
    replace: "var FLASH_SHARE = 0.2;",
    why: "the absorbed share of the flash changed"
  },
  {
    file: "js/laser/engine/media.js",
    find: "N_t: 1.6e19 / cm3,",
    replace: "N_t: 1.6e18 / cm3,",
    why: "ruby's Cr³⁺ density a decade low"
  },

  /* ---------- stage 7b review ---------- */
  {
    file: "js/laser/engine/bench.js",
    find: "flashPump(d, config, flash.flashEnergy, flash.flashTime, sim.t - flash.at);",
    replace: "flashPump(d, config, config.flashEnergy, config.flashTime, sim.t - flash.at);",
    why: "the running flash read from the sliders: moving them after Fire changes it"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "return { at: flash.at, flashEnergy: flash.flashEnergy, flashTime: flash.flashTime };",
    replace: "return flash;",
    why: "advance hands back the caller's flash object, not a copy"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "check.params(where, flash, FLASH_NAMES);\n",
    replace: "",
    why: "sim.flash with a name it does not use accepted"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "check.atLeast(where, \"sim.flash.at\", flash.at, 0);\n",
    replace: "",
    why: "a flash before t = 0 accepted"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "check.atLeast(where, \"sim.flash.flashEnergy\", flash.flashEnergy, 0);\n",
    replace: "",
    why: "a flash of negative energy accepted"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "check.positive(where, \"sim.flash.flashTime\", flash.flashTime);\n",
    replace: "",
    why: "a flash of no duration accepted"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "var read = readConfig(where, config);\n    if (read.setup.pump !== \"flashlamp\") {\n      check.fail(where, \"needs a config with pump: \\\"flashlamp\\\", got \" + check.describe(config.pump) + \".\");\n    }\n    refuseStrangeSim(where, sim, read, config);\n    var fired",
    replace: "var read = readConfig(where, config);\n    refuseStrangeSim(where, sim, read, config);\n    var fired",
    why: "a flash fired on a bench without a flashlamp"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "top = E.pumps.dischargeMax({ law: setup.law, currentPeak: config.currentPeak });",
    replace: "top = E.pumps.dischargeMax({ law: setup.law, currentPeak: setup.config.currentPeak });",
    why: "the current slider's top from the default peak current, not the config's"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "var COUPLER_RANGE = { min: 0.005, max: 0.6, log: true };",
    replace: "var COUPLER_RANGE = { min: 0.005, max: 0.3, log: true };",
    why: "the coupler slider ends below ruby's 50 %"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "powerAtTwiceThreshold: scales.powerPerP * thresholdRate,",
    replace: "powerAtTwiceThreshold: scales.powerPerP,",
    why: "three levels' light scaled as four levels': ruby's beam 12.5× too bright"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "high - low > 1e-6 * high",
    replace: "high - low > 1e-3 * high",
    why: "the flash threshold bisected only to 10⁻³"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "if (setup.pump === pump) found = setup;",
    replace: "found = setup;",
    why: "findSetup picks a medium's last setup whatever the pump"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "d.R_p = d.x * d.R_c;",
    replace: "d.R_p = d.x;",
    why: "R_p reported as x"
  },
  {
    file: "js/laser/engine/constants.js",
    find: "mA: 1e-3,",
    replace: "mA: 1e-6,",
    why: "the milliampere a thousand times too small"
  },
  {
    file: "js/laser/engine/constants.js",
    find: "mm: 1e-3,",
    replace: "mm: 1e-2,",
    why: "the millimetre written as a centimetre"
  },
  {
    file: "js/laser/engine/constants.js",
    find: "mm2: 1e-6,",
    replace: "mm2: 1e-4,",
    why: "the square millimetre written as a square centimetre"
  },
  {
    file: "js/laser/engine/rates.js",
    find: "var where = at(twoLevel ? \"twoLevel\" : \"threeLevel\", \"derivatives\");",
    replace: "var where = at(twoLevel ? \"threeLevel\" : \"twoLevel\", \"derivatives\");",
    why: "errors of three levels' f named for two levels"
  },

  /* ---------- stage 7c: choosing the laser on the page ---------- */
  {
    file: "js/laser/engine/bench.js",
    find: "level = d.scheme === \"four-level\" ? d.x : d.w;",
    replace: "level = d.x;",
    why: "pumpNow giving the two-level atom's missing x as its pump"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "return { x: null, w: level, smallSignal: -d.n_t / (1 + 2 * level), overThreshold: null };",
    replace: "return { x: 0, w: level, smallSignal: -d.n_t / (1 + 2 * level), overThreshold: null };",
    why: "pumpNow giving the two-level atom x = 0, a threshold it does not have"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "if (flash === null) level = 0;",
    replace: "if (flash === null) level = d.xPeak;",
    why: "pumpNow pumping before the flash is fired"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "x: d.wThreshold === null ? null : level / d.wThreshold,",
    replace: "x: level,",
    why: "pumpNow giving three levels' w, not w over its threshold"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "else level = flashPump(d, config, flash.flashEnergy, flash.flashTime, sim.t - flash.at)(0);",
    replace: "else level = flashPump(d, config, config.flashEnergy, flash.flashTime, sim.t - flash.at)(0);",
    why: "pumpNow using the slider's energy, not the fired flash's"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "else level = flashPump(d, config, flash.flashEnergy, flash.flashTime, sim.t - flash.at)(0);",
    replace: "else level = flashPump(d, config, flash.flashEnergy, config.flashTime, sim.t - flash.at)(0);",
    why: "pumpNow with the config's t_p, not the fired flash's"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "else level = flashPump(d, config, flash.flashEnergy, flash.flashTime, sim.t - flash.at)(0);",
    replace: "else level = flashPump(d, config, flash.flashEnergy, flash.flashTime, sim.t)(0);",
    why: "pumpNow timing the flash from t = 0, not from when it was fired"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "    refuseStrangeSim(where, sim, read, config);\n    var d = compute(where, config, read);\n    // The pump as advance runs it",
    replace: "    var d = compute(where, config, read);\n    // The pump as advance runs it",
    why: "pumpNow ignoring a flash on a bench without a lamp"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "var where = at(\"pumpNow\");",
    replace: "var where = at(\"advance\");",
    why: "pumpNow's errors named for advance"
  },
  {
    file: "js/laser/page.js",
    find: "\"he-ne discharge\": 1e6,",
    replace: "\"he-ne discharge\": 1e4,",
    why: "He-Ne starting at 1 s = 100 µs: its whole run in a few frames"
  },
  {
    file: "js/laser/page.js",
    find: "var start = START_SLOW_MOTION[benchName(config)];",
    replace: "var start = START_SLOW_MOTION[config.medium];",
    why: "the starting slow motion looked up by the medium alone"
  },
  {
    file: "js/laser/page.js",
    find: "var SLOW_MOTION = { min: 1e3, max: 1e9, log: true };",
    replace: "var SLOW_MOTION = { min: 1e3, max: 1e6, log: true };",
    why: "the slow motion stopping at 10⁶: the gas lasers too fast to watch"
  },
  {
    file: "js/laser/page.js",
    find: "return { unit: \"mA\", factor: 1000 };",
    replace: "return { unit: \"mA\", factor: 1 };",
    why: "a current shown as mA but typed and read in A"
  },
  {
    file: "js/laser/page.js",
    find: "if (pumpUnit() === \"A\" && controls.pump.max < 1)",
    replace: "if (pumpUnit() === \"A\" && controls.pump.max < 0.01)",
    why: "He-Ne's current shown in A: 0.005"
  },
  {
    file: "js/laser/page.js",
    find: "if (field === \"flashEnergy\") return \"J\";",
    replace: "if (field === \"flashEnergy\") return \"W\";",
    why: "a flash's energy written in W"
  },
  {
    file: "js/laser/page.js",
    find: "var TWO_LEVEL_HIDES = [\"x\", \"T_best\", \"period\"];",
    replace: "var TWO_LEVEL_HIDES = [];",
    why: "the two-level atom showing a pump over a threshold it does not have"
  },
  {
    file: "js/laser/page.js",
    find: "flashlamp: [\"flashThreshold\", \"x\", \"gth\", \"tau_c\", \"peak\", \"powerNow\", \"time\"]",
    replace: "flashlamp: [\"flashThreshold\", \"pumpThreshold\", \"x\", \"gth\", \"tau_c\", \"peak\", \"powerNow\", \"time\"]",
    why: "a flash showing a steady pump's threshold, which it does not have"
  },
  {
    file: "js/laser/page.js",
    find: "discharge: [\"currentThreshold\", \"x\",",
    replace: "discharge: [\"pumpThreshold\", \"x\",",
    why: "a discharge showing a threshold pump power instead of its current"
  },
  {
    file: "js/laser/page.js",
    find: "      if (name === \"currentThreshold\") return thresholdText(d.currentThreshold, \"A\");",
    replace: "      if (name === \"currentThreshold\") return d.currentThreshold === null ? \"—\" : F.si(d.currentThreshold, \"A\");",
    why: "a threshold the tube never reaches written as a dash, not 'never reached'"
  },
  {
    file: "js/laser/page.js",
    find: "if (movesThreshold && settled) threshold = thresholdFlash(config);",
    replace: "threshold = thresholdFlash(config);",
    why: "the threshold flash searched again on every slider move"
  },
  {
    file: "js/laser/page.js",
    find: "            if (movesThreshold && settled) threshold = thresholdFlash(config);\n",
    replace: "",
    why: "the threshold flash not found again for a new output mirror"
  },
  {
    file: "js/laser/page.js",
    find: "      nameThePump();\n      restart();",
    replace: "      nameThePump();",
    why: "a new bench keeping the old simulation, flash and all"
  },
  {
    file: "js/laser/page.js",
    find: "      state.slowMotion = startSlowMotion(config);\n      nameThePump();",
    replace: "      nameThePump();",
    why: "a new bench keeping the old slow motion"
  },
  {
    file: "js/laser/page.js",
    find: "var pump = pumps.indexOf(state.config.pump) === -1 ? pumps[0] : state.config.pump;",
    replace: "var pump = pumps[0];",
    why: "a new medium always taking its first pump"
  },
  {
    file: "js/laser/page.js",
    find: "          if (pumps.length === 0) {",
    replace: "          if (false) {",
    why: "a medium the bench cannot run accepted"
  },
  {
    file: "js/laser/page.js",
    find: "if (bench.pumpsFor(state.config.medium).indexOf(pump) === -1) {",
    replace: "if (false) {",
    why: "a pump the medium does not have accepted"
  },
  {
    file: "js/laser/page.js",
    find: "      while (select.firstChild) select.removeChild(select.firstChild);\n",
    replace: "",
    why: "the options added to the old ones"
  },
  {
    file: "js/laser/page.js",
    find: "option.disabled = item.disabled;",
    replace: "option.disabled = false;",
    why: "a medium not built yet offered like the others"
  },
  {
    file: "js/laser/page.js",
    find: "text: notYet && later ? name + \" (\" + later + \")\" : name,",
    replace: "text: name,",
    why: "a medium not built yet not marked 'coming later'"
  },
  {
    file: "js/laser/page.js",
    find: "var name = word(data, \"media.\" + id) || id;",
    replace: "var name = word(data, \"media.\" + id);",
    why: "a medium with no name in the data left blank"
  },
  {
    file: "js/laser/page.js",
    find: "        selects.pump.value = state.config.pump;\n      }\n    }\n    // The row under the drawing",
    replace: "      }\n    }\n    // The row under the drawing",
    why: "the pump dropdown not showing the bench's pump"
  },
  {
    file: "js/laser/page.js",
    find: "if (fireButton) fireButton.hidden = !flash;",
    replace: "if (fireButton) fireButton.hidden = false;",
    why: "Fire shown on a bench without a flashlamp"
  },
  {
    file: "js/laser/page.js",
    find: "          if (!state.playing) play();\n",
    replace: "",
    why: "Fire on a paused page: the flash never runs"
  },
  {
    file: "js/laser/page.js",
    find: "          state.peak = powerNow();\n",
    replace: "          state.peak = 0;\n",
    why: "the highest output since Fire starting from nothing, not from the output at Fire"
  },
  {
    file: "js/laser/page.js",
    find: "        if (state.peak !== null) state.peak = Math.max(state.peak, run.peak.power);\n",
    replace: "",
    why: "the highest output since Fire never updated"
  },
  {
    file: "js/laser/page.js",
    find: "      state.peak = peakFrom(state.config, powerNow());\n      remember();",
    replace: "      remember();",
    why: "Reset keeping the old flash's highest output"
  },
  {
    file: "js/laser/page.js",
    find: "return (derived.N_t + state.sim.N) / (2 * derived.N_t);",
    replace: "return (derived.N_t + state.sim.N) / derived.N_t;",
    why: "the cartoon's excited share N₂/N_t written as 2N₂/N_t"
  },
  {
    file: "js/laser/page.js",
    find: "        y: inversionNow(),\n",
    replace: "        y: Math.max(0, inversionNow()),\n",
    why: "three levels' inversion clamped at 0 again: ruby before Fire shows no ion down"
  },
  {
    file: "js/laser/page.js",
    find: "        x: pumpLevel(),\n",
    replace: "        x: derived.x,\n",
    why: "the level picture's pump from the steady numbers: none for a flash"
  },
  {
    file: "js/laser/page.js",
    find: "        pump: benchPumpNow(),\n        transmission",
    replace: "        pump: 1,\n        transmission",
    why: "the pump on the bench always glowing fully"
  },
  {
    file: "js/laser/page.js",
    find: "if (derived.P_out !== null && derived.P_out > 0) lines.push(",
    replace: "if (true) lines.push(",
    why: "a steady-output line on a flash's chart, and on the filter's pulse train"
  },
  {
    file: "js/laser/page.js",
    find: "if (name === \"pump\") setText('[data-laser-name=\"pump\"]', word(data, \"controls.pump.\" + state.config.pump));",
    replace: "if (name === \"pump\") setText('[data-laser-name=\"pump\"]', word(data, \"controls.pump.diode\"));",
    why: "the pump slider always named for diodes"
  },
  {
    file: "js/laser/page.js",
    find: "      showUnderBench();\n      CONTROLS.forEach(function (name) { if (shows[name]) shows[name](); });\n      showRows();",
    replace: "      showUnderBench();\n      showRows();",
    why: "a new bench, or the filter turned on, leaving the sliders as they were (the filter's hidden)"
  },
  {
    file: "js/laser/page.js",
    find: "      CONTROLS.forEach(function (name) { if (shows[name]) shows[name](); });\n      showRows();\n      setBehind(false);",
    replace: "      CONTROLS.forEach(function (name) { if (shows[name]) shows[name](); });\n      setBehind(false);",
    why: "a new bench, or the filter turned on or off, showing the readouts it had before"
  },
  {
    file: "sections/laser.html",
    find: "data-laser-action=\"fire\" data-ready=\"false\" hidden>",
    replace: "data-laser-action=\"fire\" data-ready=\"false\">",
    why: "Fire shown before page.js has run"
  },
  {
    file: "css/laser.css",
    find: ".laser-stage [hidden] {\n  display: none;\n}",
    replace: ".laser-stage [hidden] {\n  opacity: 0.5;\n}",
    why: "hidden readouts and Fire shown by their own display rules"
  },
  {
    file: "data/laser.json",
    find: "\"ruby\": { \"hy\": \"Ռուբին\", \"en\": \"Ruby\" },",
    replace: "\"ruby\": { \"hy\": \"\", \"en\": \"Ruby\" },",
    why: "ruby without its Armenian name"
  },
  {
    file: "data/laser.json",
    find: "\"flashlamp\": { \"hy\": \"Բռնկման էներգիա (էլեկտրական)\", \"en\": \"Flash energy (electrical)\" },",
    replace: "\"flashlamp\": { \"hy\": \"Բռնկման էներգիա (էլեկտրական)\", \"en\": \"\" },",
    why: "the flash slider without its English name"
  },

  /* ---------- stage 7c: the review's fixes ---------- */
  {
    file: "js/laser/ui/draw-levels.js",
    find: "var top = Math.max(picture.smallSignal, picture.y, lossOf(picture)) * HEADROOM;",
    replace: "var top = Math.max(picture.y, lossOf(picture)) * HEADROOM;",
    why: "the scale forgets the small-signal gain: ruby's dashed line above the gauge"
  },
  {
    file: "js/laser/ui/draw-levels.js",
    find: "var smallY = gaugeY(picture.smallSignal);",
    replace: "var smallY = gaugeY(picture.x);",
    why: "the dashed small-signal line drawn at the pump x: wrong for three levels"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "return { x: level, w: null, smallSignal: level, overThreshold: level / startLoss };",
    replace: "return { x: level, w: level, smallSignal: level, overThreshold: level / startLoss };",
    why: "pumpNow giving four levels a w"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "smallSignal: d.n_t * (level - 1) / (level + 1)",
    replace: "smallSignal: level / d.wThreshold",
    why: "three levels' small-signal gain taken as w/w_th"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "smallSignal: d.n_t * (level - 1) / (level + 1)",
    replace: "smallSignal: d.n_t * (level - 1) / (level + 2)",
    why: "three levels' small-signal gain with the wrong denominator"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "return { x: null, w: level, smallSignal: -d.n_t / (1 + 2 * level), overThreshold: null };",
    replace: "return { x: null, w: level, smallSignal: -d.n_t / (1 + level), overThreshold: null };",
    why: "two levels' small-signal gain without the pump's own emission (2w)"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "      else if (d.wThreshold !== null) d.xPeak = peak / d.wThreshold;\n      return d;",
    replace: "      else if (d.wThreshold !== null) d.xPeak = peak / d.wThreshold;\n      else d.xPeak = 0;\n      return d;",
    why: "the two-level flash given xPeak = 0, a threshold it does not have"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "      d.w = pumpLevel(d, config, config.pumpPower);     // x stays null: no threshold",
    replace: "      d.w = pumpLevel(d, config, config.pumpPower);\n      d.x = 0;",
    why: "the two-level atom's derive giving x = 0, not null"
  },
  {
    file: "js/laser/page.js",
    find: "if (movesThreshold && settled) threshold = thresholdFlash(config);",
    replace: "if (movesThreshold) threshold = thresholdFlash(config);",
    why: "the threshold flash searched at every step of a drag"
  },
  {
    file: "js/laser/page.js",
    find: "            if (movesThreshold) state.flashThresholdOld = !settled;\n",
    replace: "",
    why: "a drag of the output mirror showing the old mirror's threshold flash"
  },
  {
    file: "js/laser/page.js",
    find: "          listen(slider, \"change\", whileShown(function () { use(sliderValue(), true); }));\n",
    replace: "",
    why: "a slider let go never settles: the threshold flash waits for ever"
  },
  {
    file: "js/laser/page.js",
    find: "      var threshold = thresholdFlash(config);\n      take(config, numbers);",
    replace: "      take(config, numbers);\n      var threshold = thresholdFlash(config);",
    why: "a new bench taken before its threshold search: a failed search leaves it half-taken"
  },
  {
    file: "js/laser/page.js",
    find: "            var config = Object.assign({}, state.config);",
    replace: "            var config = state.config;",
    why: "a slider changing the config in place: a failed search leaves it changed"
  },
  {
    file: "js/laser/page.js",
    find: "        smallSignal: pumpNow().smallSignal,\n",
    replace: "        smallSignal: pumpLevel(),\n",
    why: "the gauge's dashed line at the pump, not at g₀/g_th"
  },
  {
    file: "js/laser/page.js",
    find: "        smallSignal: pumpNow().smallSignal,\n",
    replace: "        smallSignal: Math.max(0, pumpNow().smallSignal),\n",
    why: "the small-signal gain clamped at 0: the two-level atom seems on the edge of gaining"
  },
  {
    file: "js/laser/page.js",
    find: "if (derived.P_out !== null && derived.P_out > 0) lines.push(",
    replace: "if (derived.P_out !== null) lines.push(",
    why: "a steady-output line at 0 W: below threshold, and for the two-level atom"
  },
  {
    file: "js/laser/page.js",
    find: "        if (kept.sim !== state.sim || kept.derived !== derived) {",
    replace: "        if (true) {",
    why: "the pump and the filter worked out again for every picture"
  },
  {
    file: "js/laser/page.js",
    find: "        if (kept.sim !== state.sim || kept.derived !== derived) {",
    replace: "        if (kept.sim !== state.sim) {",
    why: "the pump kept after a slider move"
  },
  {
    file: "js/laser/page.js",
    find: "      return pump.x !== null ? pump.x : pump.w;",
    replace: "      return pump.x;",
    why: "the two-level atom's pump arrow and glow from the x it does not have"
  },
  {
    file: "js/laser/page.js",
    find: "      labels.pump = word(data, \"bench.pumps.\" + state.config.pump) || anyPump;",
    replace: "      labels.pump = anyPump;",
    why: "the drawing's pump not named for the chosen pump"
  },
  {
    file: "js/laser/page.js",
    find: "      nameThePump();\n      restart();",
    replace: "      restart();",
    why: "the drawing keeping the old bench's pump name"
  },
  {
    file: "data/laser.json",
    find: "\"flashlamp\": { \"hy\": \"Բռնկման լամպ\", \"en\": \"Flashlamp\" },\n      \"discharge\": { \"hy\": \"Էլեկտրական պարպում\", \"en\": \"Electric discharge\" }\n    }\n  },",
    replace: "\"flashlamp\": { \"hy\": \"\", \"en\": \"Flashlamp\" },\n      \"discharge\": { \"hy\": \"Էլեկտրական պարպում\", \"en\": \"Electric discharge\" }\n    }\n  },",
    why: "the flashlamp's name on the drawing without its Armenian"
  },

  /* ---------- stage 7d: each pump drawn, three and two levels ---------- */

  {
    file: "js/laser/ui/draw-bench.js",
    find: "var KINDS = Object.freeze([\"diode\", \"laser\", \"flashlamp\", \"discharge\"]);",
    replace: "var KINDS = Object.freeze([\"diode\", \"laser\", \"flashlamp\"]);",
    why: "the discharge missing from the pumps the drawing knows: a gas laser drawn as diodes"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "if (light && KINDS.indexOf(light.pumpKind) !== -1) return light.pumpKind;",
    replace: "if (false) return light.pumpKind;",
    why: "every pump drawn as diodes"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "    else if (kind === \"laser\") drawPumpLaser(g, colors, L, pump);\n",
    replace: "",
    why: "the pump laser drawn as diodes"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "    if (kind === \"discharge\") drawTube(g, colors, L, pump);\n    else drawRod(g, colors, L);",
    replace: "    drawRod(g, colors, L);",
    why: "a gas laser drawn with a rod, no tube"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "var mediumPosts = kind === \"discharge\" ? L.tubePosts : L.rodPosts;",
    replace: "var mediumPosts = L.rodPosts;",
    why: "the gas tube standing on the rod's posts, across its wires"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "    if (pump > 0) {\n      // Broad beams",
    replace: "    if (true) {\n      // Broad beams",
    why: "the flashlamp glowing before it is fired"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "      g.globalAlpha = 0.4 + 0.6 * pump;",
    replace: "      g.globalAlpha = 1;",
    why: "the flashlamp as bright for a weak flash as for a strong one"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "g.fillRect(F.x + cap, F.y, F.w - 2 * cap, F.h);",
    replace: "g.fillRect(F.x, F.y, F.w, F.h);",
    why: "the flashlamp's glow over its electrodes"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "    if (pump > 0) lightUp(g, colors.accent, L, F.x, F.w, F.y, pump);\n",
    replace: "",
    why: "the flashlamp's light not reaching the rod"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "    g.fillRect(F.x + F.w - cap, F.y, cap, F.h);\n",
    replace: "",
    why: "the flashlamp without its right electrode"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "    if (pump > 0) {\n      g.globalAlpha = 0.15 + 0.6 * pump;",
    replace: "    if (true) {\n      g.globalAlpha = 0.15 + 0.6 * pump;",
    why: "the gas glowing with no current"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "g.globalAlpha = 0.15 + 0.6 * pump;",
    replace: "g.globalAlpha = 0.15 + 0.85 * pump;",
    why: "the gas glowing so brightly that the rays vanish in it"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "    if (pump > 0) {\n      g.globalAlpha = 0.3 + 0.7 * pump;\n      g.fillStyle = colors.glow;\n      L.currentArrows",
    replace: "    if (true) {\n      g.globalAlpha = 0.3 + 0.7 * pump;\n      g.fillStyle = colors.glow;\n      L.currentArrows",
    why: "current arrows with no current"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "{ x: electrodes[0].x + electrodeWidth / 2, y: arrowY, dy: -1 },",
    replace: "{ x: electrodes[0].x + electrodeWidth / 2, y: arrowY, dy: 1 },",
    why: "the current going down both wires"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "      line(g, x, L.wireY, sides[i], L.wireY);",
    replace: "      line(g, x, L.wireY, sides[1 - i], L.wireY);",
    why: "the wires crossing to the supply's far sides"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "var electrodes = [0.12, 0.88].map(",
    replace: "var electrodes = [0.3, 0.7].map(",
    why: "the electrodes away from the tube's ends"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "var tubeLength = 0.86 * span;",
    replace: "var tubeLength = 0.5 * span;",
    why: "the gas tube no longer than a rod"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "var boreHeight = 0.8 * rodHeight;",
    replace: "var boreHeight = 0.6 * rodHeight;",
    why: "rays outside the gas tube's bore"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "var supplyY = railY - supplyHeight;",
    replace: "var supplyY = railY - 1.2 * supplyHeight;",
    why: "the supply floating above the bench"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "    if (pump > 0) {\n      g.globalAlpha = 0.3 + 0.7 * pump;\n      g.strokeStyle = colors.glow;\n      g.fillStyle = colors.glow;\n      g.lineWidth = 2.5;",
    replace: "    if (true) {\n      g.globalAlpha = 0.3 + 0.7 * pump;\n      g.strokeStyle = colors.glow;\n      g.fillStyle = colors.glow;\n      g.lineWidth = 2.5;",
    why: "the pump laser's beam with the pump off"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "      g.globalAlpha = 0.3 + 0.7 * pump;\n      g.strokeStyle = colors.glow;\n      g.fillStyle = colors.glow;\n      g.lineWidth = 2.5;",
    replace: "      g.globalAlpha = 1;\n      g.strokeStyle = colors.glow;\n      g.fillStyle = colors.glow;\n      g.lineWidth = 2.5;",
    why: "the pump laser's beam as strong at any pump"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "      line(g, fold.x, L.beamY, fold.x, rodBottom + 6);\n",
    replace: "",
    why: "the pump beam stopping at the small mirror"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "    line(g, fold.x - half, fold.y + half, fold.x + half, fold.y - half);",
    replace: "    line(g, fold.x - half, fold.y - half, fold.x + half, fold.y + half);",
    why: "the small mirror turned to send the beam down"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "    post(g, fold.x, fold.y + half, L.railY);\n",
    replace: "",
    why: "the small mirror floating over the bench"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "var pumpLaserLeft = rodPosts[0] + POST_FOOT / 2 + 3;",
    replace: "var pumpLaserLeft = rodX;",
    why: "the pump laser standing on the rod's post"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "var beamY = pumpLaserY + pumpLaserHeight / 2;",
    replace: "var beamY = pumpLaserY + pumpLaserHeight;",
    why: "the pump beam leaving from the box's bottom edge"
  },
  {
    file: "js/laser/ui/draw-levels.js",
    find: "return picture.scheme === \"three-level\" || picture.scheme === \"two-level\";",
    replace: "return picture.scheme === \"three-level\";",
    why: "the two-level atom drawn as four levels"
  },
  {
    file: "js/laser/ui/draw-levels.js",
    find: "return hasIons(picture) ? -picture.n_t * HEADROOM : 0;",
    replace: "return hasIons(picture) ? -picture.n_t : 0;",
    why: "no room below every ion down"
  },
  {
    file: "js/laser/ui/draw-levels.js",
    find: "    if (hasIons(picture)) top = Math.max(top, ABOVE_ZERO * picture.n_t);\n",
    replace: "",
    why: "no room above zero: ruby's loss word off the canvas before Fire"
  },
  {
    file: "js/laser/ui/draw-levels.js",
    find: "        { y: L.pumpBand, word: word(words, \"pumpBand\") },\n        { y: L.upper, word: word(words, \"upper\") },\n        { y: L.ground, word: word(words, \"groundLower\") || word(words, \"ground\") }",
    replace: "        { y: L.pumpBand, word: word(words, \"pumpBand\") },\n        { y: L.upper, word: word(words, \"upper\") },\n        { y: L.lower, word: word(words, \"lower\") },\n        { y: L.ground, word: word(words, \"groundLower\") || word(words, \"ground\") }",
    why: "ruby drawn with a lower laser level it does not have"
  },
  {
    file: "js/laser/ui/draw-levels.js",
    find: "word(words, \"groundLower\") || word(words, \"ground\")",
    replace: "word(words, \"ground\")",
    why: "ruby's ground not named as its lower laser level"
  },
  {
    file: "js/laser/ui/draw-levels.js",
    find: "var laserEnd = scheme === \"four-level\" ? L.lower : L.ground;",
    replace: "var laserEnd = L.lower;",
    why: "ruby lasing down to a lower level it does not have"
  },
  {
    file: "js/laser/ui/draw-levels.js",
    find: "        arrow(g, L.arrows.pumpDown, L.upper, L.ground, pumpWidth);\n",
    replace: "",
    why: "the two-level atom's pump only lifting atoms"
  },
  {
    file: "js/laser/ui/draw-levels.js",
    find: "        arrow(g, L.arrows.pump, L.ground, L.upper, pumpWidth);",
    replace: "        arrow(g, L.arrows.pump, L.ground, L.pumpBand, pumpWidth);",
    why: "the two-level atom pumped to a band it does not have"
  },
  {
    file: "js/laser/ui/draw-levels.js",
    find: "      if (scheme === \"four-level\") {\n        g.moveTo(L.arrows.relaxBottom",
    replace: "      if (true) {\n        g.moveTo(L.arrows.relaxBottom",
    why: "ruby drawn with a relaxation from a lower level it does not have"
  },
  {
    file: "js/laser/ui/draw-levels.js",
    find: "    if (scheme !== \"two-level\") {\n      g.strokeStyle = c.faint;",
    replace: "    if (true) {\n      g.strokeStyle = c.faint;",
    why: "the two-level atom drawn with a pump band's relaxation"
  },
  {
    file: "js/laser/ui/draw-levels.js",
    find: "var up = (picture.n_t + picture.y) / (2 * picture.n_t);",
    replace: "var up = (picture.n_t + picture.y) / picture.n_t;",
    why: "the share of ions up written as 2N₂/N_t"
  },
  {
    file: "js/laser/ui/draw-levels.js",
    find: "barMark(g, c, L.bar, (1 + loss / picture.n_t) / 2);",
    replace: "barMark(g, c, L.bar, 0.5);",
    why: "the threshold mark at half the ions up: ruby's 54 % lost"
  },
  {
    file: "js/laser/ui/draw-levels.js",
    find: "shareBar(g, c, L.groundBar, 1 - up);",
    replace: "shareBar(g, c, L.groundBar, up);",
    why: "the ground bar showing the ions up"
  },
  {
    file: "js/laser/ui/draw-levels.js",
    find: "      g.globalAlpha = 0.4;\n      g.fillRect(G.gainX, zeroY, G.gainW, gainY - zeroY);",
    replace: "      g.globalAlpha = 1;\n      g.fillRect(G.gainX, zeroY, G.gainW, gainY - zeroY);",
    why: "absorption drawn as solid as gain"
  },
  {
    file: "js/laser/ui/draw-levels.js",
    find: "    } else if (gainY > zeroY) {",
    replace: "    } else if (false) {",
    why: "a medium that absorbs drawn with no bar"
  },
  {
    file: "js/laser/ui/draw-levels.js",
    find: "    if (low < 0) {",
    replace: "    if (false) {",
    why: "no zero line: where absorption ends is not shown"
  },
  {
    file: "js/laser/ui/draw-levels.js",
    find: "text(g, word(words, \"transparent\"), wordsLeft, zeroY + L.fontSize, wordsWidth);",
    replace: "text(g, word(words, \"transparent\"), wordsLeft, zeroY - 4, wordsWidth);",
    why: "the zero line's word above it, on the loss line's side"
  },
  {
    file: "js/laser/ui/draw-levels.js",
    find: "return G.bottom - span * (value - low) / (top - low);",
    replace: "return G.bottom - span * value / top;",
    why: "the gauge without its part below zero"
  },
  {
    file: "js/laser/page.js",
    find: "        transmission: 1 - state.config.refl2,\n        pumpKind: state.config.pump,\n",
    replace: "        transmission: 1 - state.config.refl2,\n",
    why: "every pump drawn as diodes on the page"
  },
  {
    file: "js/laser/page.js",
    find: "        scheme: derived.scheme,\n",
    replace: "",
    why: "the level picture always four levels"
  },
  {
    file: "js/laser/page.js",
    find: "        n_t: derived.n_t,\n",
    replace: "",
    why: "the level picture without n_t"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "var thresholdRate = fourLevel ? 1 : scales.n_t + 1;",
    replace: "var thresholdRate = 1;",
    why: "ruby's laser arrow 12.5 times too wide"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "var thresholdRate = fourLevel ? 1 : scales.n_t + 1;",
    replace: "var thresholdRate = fourLevel ? 1 : scales.n_t;",
    why: "the threshold pump rate taken as n_t, not n_t + 1"
  },
  {
    file: "js/laser/page.js",
    find: "var LEVEL_WORDS = [\"pumpBand\", \"upper\", \"lower\", \"ground\", \"groundLower\", \"gain\", \"loss\", \"transparent\"];",
    replace: "var LEVEL_WORDS = [\"pumpBand\", \"upper\", \"lower\", \"ground\", \"gain\", \"loss\", \"transparent\"];",
    why: "ruby's ground not named on the page"
  },
  {
    file: "data/laser.json",
    find: "\"transparent\": { \"hy\": \"Թափանցիկ\", \"en\": \"Transparent\" }",
    replace: "\"transparent\": { \"hy\": \"\", \"en\": \"Transparent\" }",
    why: "the gauge's zero line without its Armenian word"
  },
  {
    file: "data/laser.json",
    find: "\"groundLower\": { \"hy\": \"Հիմնական (ստորին)\", \"en\": \"Ground (lower level)\" }",
    replace: "\"groundLower\": { \"hy\": \"Հիմնական (ստորին)\", \"en\": \"\" }",
    why: "ruby's ground without its English name"
  }
,

  // ---------- stage 7d review ----------
  {
    file: "js/laser/page.js",
    find: "if (state.config.pump === \"discharge\") return state.config.current / controls.pump.max;",
    replace: "if (state.config.pump === \"discharge\") return glowNow();",
    why: "the gas tube drawn by its gain: dark at the top of the current"
  },
  {
    file: "js/laser/page.js",
    find: "if (state.config.pump === \"discharge\") return state.config.current / controls.pump.max;",
    replace: "if (state.config.pump === \"discharge\") return state.config.current;",
    why: "the gas tube's glow from the current in amperes, not its share of the slider"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "var pump = light && light.pump >= PUMP_OFF ? Math.min(1, light.pump) : 0;",
    replace: "var pump = light && light.pump > 0 ? Math.min(1, light.pump) : 0;",
    why: "the flashlamp lit for half an hour after its flash"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "var pumpLaserLeft = rodPosts[0] + POST_FOOT / 2 + 3;",
    replace: "var pumpLaserLeft = rodX + 0.07 * rodLength;",
    why: "the rod post's foot poking into the pump laser's box on a phone"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "var pumpLaserRight = foldX - POST_FOOT / 2 - Math.max(6, 0.12 * rodLength);",
    replace: "var pumpLaserRight = foldX;",
    why: "the pump laser's box running into the small mirror's post"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "var medium = kind === \"discharge\" ? L.tube : L.rod;",
    replace: "var medium = L.rod;",
    why: "the rays' arrowheads inside the gas tube's glow"
  },
  {
    file: "js/laser/ui/draw-levels.js",
    find: "if (picture.n_t > loss) barMark(g, c, L.bar, (1 + loss / picture.n_t) / 2);",
    replace: "barMark(g, c, L.bar, (1 + loss / picture.n_t) / 2);",
    why: "the threshold mark above its bar when n_t ≤ 1"
  },
  {
    file: "js/laser/ui/draw-levels.js",
    find: "    if (lossWordY - L.fontSize < G.top) lossWordY = lossY + L.fontSize + 2;\n",
    replace: "",
    why: "the loss word above the gauge's top"
  },
  {
    file: "js/laser/page.js",
    find: "return Math.max(0, y * p) / derived.thresholdRate;",
    replace: "return Math.max(0, y * p);",
    why: "the laser arrow not over the threshold pump rate"
  },
  {
    file: "js/laser/engine/qswitch.js",
    find: "if (x * -Math.expm1(-middle) - middle > 0) low = middle;",
    replace: "if (x * -Math.expm1(-middle) - middle < 0) low = middle;",
    why: "η_E's bisection keeping the wrong half"
  },
  {
    file: "js/laser/engine/qswitch.js",
    find: "return (low + high) / 2 / x;",
    replace: "return (low + high) / 2;",
    why: "η_E given as u = −ln(1 − η)"
  },
  {
    file: "js/laser/engine/qswitch.js",
    find: "var where = at(\"energyUse\");\n    check.finite(where, \"x\", x);\n    if (x <= 1) {",
    replace: "var where = at(\"energyUse\");\n    check.finite(where, \"x\", x);\n    if (x < 1) {",
    why: "energyUse accepting x = 1, where there is no pulse"
  },
  {
    file: "js/laser/engine/qswitch.js",
    find: "var share = scheme === \"four-level\" ? 1 : 0.5;",
    replace: "var share = 1;",
    why: "three levels' giant pulse not halved"
  },
  {
    file: "js/laser/engine/qswitch.js",
    find: "var outShare = gammaOut / (2 * gamma);",
    replace: "var outShare = gammaOut / gamma;",
    why: "the output mirror's share γ₂/γ instead of γ₂/(2γ)"
  },
  {
    file: "js/laser/engine/qswitch.js",
    find: "var peakPower = share * outShare * hnu * V_a * N_p / tau_c * (x - 1 - Math.log(x));",
    replace: "var peakPower = share * outShare * hnu * V_a * N_p / tau_c * (x - 1);",
    why: "the peak power without its − ln x"
  },
  {
    file: "js/laser/engine/qswitch.js",
    find: "var energy = share * outShare * eta * x * N_p * V_a * hnu;",
    replace: "var energy = share * outShare * eta * N_p * V_a * hnu;",
    why: "the energy from N_p instead of N_i = x·N_p"
  },
  {
    file: "js/laser/engine/qswitch.js",
    find: "if (gammaOut > 2 * gamma) {",
    replace: "if (gammaOut > gamma) {",
    why: "gammaOut checked against the single-pass γ"
  },
  {
    file: "js/laser/engine/qswitch.js",
    find: "if (scheme !== \"four-level\" && scheme !== \"three-level\") {",
    replace: "if (scheme !== \"four-level\" && scheme !== \"three-level\" && scheme !== \"two-level\") {",
    why: "a giant pulse for the two-level atom"
  },
  {
    file: "js/laser/engine/qswitch.js",
    find: "if (leak === 0) {",
    replace: "if (leak < 0) {",
    why: "a shutter that holds back every photon accepted"
  },
  {
    file: "js/laser/engine/qswitch.js",
    find: "return Math.max(0, -0.5 * Math.log(kept));",
    replace: "return Math.max(0, -Math.log(kept));",
    why: "a shutter's round-trip loss used as its single-pass loss"
  },
  {
    file: "js/laser/engine/qswitch.js",
    find: "var share = Math.min(1, Math.max(0, since / switchTime));",
    replace: "var share = Math.max(0, since / switchTime);",
    why: "the cell's voltage falling on past 0"
  },
  {
    file: "js/laser/engine/qswitch.js",
    find: "var retardation = (Math.PI / 2) * (1 - share);",
    replace: "var retardation = Math.PI * (1 - share);",
    why: "the closed cell at Γ = π, which lets the light through"
  },
  {
    file: "js/laser/engine/qswitch.js",
    find: "return lossOf(leak + (1 - leak) * cos * cos);",
    replace: "return lossOf(leak + (1 - leak) * cos);",
    why: "the cell's transmission cos Γ instead of cos²Γ"
  },
  {
    file: "js/laser/engine/qswitch.js",
    find: "var angle = 2 * Math.PI * (turns - Math.round(turns));",
    replace: "var angle = 2 * Math.PI * turns;",
    why: "the prism's angle not wrapped to one turn: it lines up only once"
  },
  {
    file: "js/laser/engine/qswitch.js",
    find: "var turns = since * rotation;",
    replace: "var turns = since * rotation / (2 * Math.PI);",
    why: "the prism's rotation taken as rad/s"
  },
  {
    file: "js/laser/engine/qswitch.js",
    find: "return lossOf(leak + (1 - leak) * Math.exp(-ratio * ratio));",
    replace: "return lossOf(leak + (1 - leak) * Math.exp(-ratio * ratio / 2));",
    why: "the prism's window √2 too wide"
  },
  {
    file: "js/laser/engine/qswitch.js",
    find: "return [rates[0], rates[1] - loss(tPrime) / eps];",
    replace: "return [rates[0], rates[1] - loss(tPrime)];",
    why: "the shutter's loss without the 1/ε"
  },
  {
    file: "js/laser/engine/qswitch.js",
    find: "rates[1] - depth * a / eps,",
    replace: "rates[1] - depth / eps,",
    why: "the filter's loss not bleached by the light"
  },
  {
    file: "js/laser/engine/qswitch.js",
    find: "recovery * (1 - a) - bleach * a * p",
    replace: "recovery * (1 - a) - bleach * p",
    why: "the light bleaching molecules that are already bleached"
  },
  {
    file: "js/laser/engine/qswitch.js",
    find: "var p = Math.exp(state[1]);",
    replace: "var p = state[1];",
    why: "the filter bleached by s = ln p instead of p"
  },
  {
    file: "js/laser/engine/qswitch.js",
    find: "\"cr-yag\": Object.freeze({ sigma: 4.3e-18 * cm2, tau: 3.4 * us }),",
    replace: "\"cr-yag\": Object.freeze({ sigma: 4.3e-18 * cm2, tau: 3.4 * 1e-3 }),",
    why: "Cr⁴⁺:YAG recovering in 3.4 ms instead of µs"
  },
  {
    file: "js/laser/engine/qswitch.js",
    find: "\"cryptocyanine\": Object.freeze({ sigma: 8e-16 * cm2, tau: 22 * ps })",
    replace: "\"cryptocyanine\": Object.freeze({ sigma: 8e-18 * cm2, tau: 22 * ps })",
    why: "cryptocyanine's cross section 100 times too small"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "if (peak !== null && point.state[peakOf] > peak.value) peak = { t: point.t, value: point.state[peakOf] };",
    replace: "if (peak !== null) peak = { t: point.t, value: point.state[peakOf] };",
    why: "the solver's peak as its last point"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "var peak = peakOf === null ? null : { t: t0, value: point.state[peakOf] };",
    replace: "var peak = peakOf === null ? null : { t: t0, value: -Infinity };",
    why: "the solver's peak leaving out t0"
  },
  {
    file: "js/laser/engine/ode.js",
    find: "if (inputs.peakOf >= inputs.state0.length) {",
    replace: "if (inputs.peakOf > inputs.state0.length) {",
    why: "peakOf one past the state accepted"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "return [\"none\"].concat(setup.qSwitches || []);",
    replace: "return setup.qSwitches || [\"none\"];",
    why: "a Q-switched setup without \"none\""
  },
  {
    file: "js/laser/engine/bench.js",
    find: "var LEAK = 1e-4;",
    replace: "var LEAK = 1e-2;",
    why: "the shutters leaking 1 %"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "var SWITCH_TIME = 5 * ns;",
    replace: "var SWITCH_TIME = 500 * ns;",
    why: "the cell switching in 500 ns"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "    if (qSwitch === \"cell\") copy.switchTime = SWITCH_TIME;\n",
    replace: "",
    why: "withQSwitch leaving out the cell's switching time"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "COMMON_NAMES.concat(PUMP_NAMES[setup.pump]).forEach(function (name) {",
    replace: "Object.keys(params.config).forEach(function (name) {",
    why: "withQSwitch keeping the last switch's fields"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "qSwitches: [\"cell\", \"prism\", \"absorber\"], qDelay: 1 * ms,",
    replace: "qSwitches: [\"cell\", \"prism\", \"absorber\"], qDelay: 0.5 * ms,",
    why: "ruby's shutter opening at 0.5 ms, before the inversion's peak"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "qDelay: 0.6 * ms, absorber: \"cr-yag\", absorberT0: 0.8,",
    replace: "qDelay: 0.6 * ms, absorber: \"cr-yag\", absorberT0: 0.5,",
    why: "Nd:glass's filter too dark to open"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "      check.atLeast(where, \"qDelay\", config.qDelay, 0);\n",
    replace: "",
    why: "qDelay not checked"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "      if (T0 === 0) check.fail(where, \"absorberT0 must be above 0: a filter that lets no light through can never bleach.\");\n",
    replace: "",
    why: "a filter that lets no light through accepted"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "check.params(where, config, COMMON_NAMES.concat(PUMP_NAMES[setup.pump], Q_SWITCH_NAMES[qSwitch]));",
    replace: "check.params(where, config, COMMON_NAMES.concat(PUMP_NAMES[setup.pump], Q_SWITCH_NAMES.cell, Q_SWITCH_NAMES.prism, Q_SWITCH_NAMES.absorber));",
    why: "any Q-switch's fields accepted on any bench"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "if (hasShutter(config)) return E.qswitch.closedLoss(config.leak) / gamma;",
    replace: "if (hasShutter(config)) return 2 * E.qswitch.closedLoss(config.leak) / gamma;",
    why: "lossClosed from the shutter's round-trip loss"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "if (config.qSwitch === \"absorber\") return -Math.log(config.absorberT0) / gamma;",
    replace: "if (config.qSwitch === \"absorber\") return -0.5 * Math.log(config.absorberT0) / gamma;",
    why: "the filter's single-pass T₀ halved as if it were a round trip's"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "var absorber = config.qSwitch === \"absorber\" ? 1 : null;",
    replace: "var absorber = config.qSwitch === \"absorber\" ? 0 : null;",
    why: "the filter starting bleached"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "fired.opensAt = hasShutter(config) ? sim.t + config.qDelay : null;",
    replace: "fired.opensAt = hasShutter(config) ? config.qDelay : null;",
    why: "the shutter's opening counted from t = 0, not from the flash"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "    if (sim.opensAt !== null && !hasShutter(config)) {\n      check.fail(where, \"sim.opensAt is \" + sim.opensAt + \" s, but this bench has no shutter (its qSwitch is \" +\n        config.qSwitch + \").\" + again);\n    }\n",
    replace: "",
    why: "an opening time on a bench without a shutter accepted"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "    if (config.qSwitch !== \"absorber\" && sim.absorber !== null) {",
    replace: "    if (config.qSwitch === \"none\" && sim.absorber !== null) {",
    why: "a filter's state on a bench without a filter accepted"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "if (sim.absorber !== null) check.between(where, \"sim.absorber\", sim.absorber, 0, 1);",
    replace: "if (sim.absorber !== null) check.finite(where, \"sim.absorber\", sim.absorber);",
    why: "a filter share above 1 accepted"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "var k = Math.floor((t - opensAt + half) / turn) + 1;",
    replace: "var k = Math.floor((t - opensAt + half) / turn) + 2;",
    why: "the prism's window of this turn skipped"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "for (var opens = opensAt + k * turn - half; opens < t + seconds && cuts.length < maxSteps; opens += turn) {",
    replace: "for (var opens = opensAt + k * turn + half; opens < t + seconds && cuts.length < maxSteps; opens += turn) {",
    why: "the new solver call started where the prism's window closes, after the pulse"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "    if (opensAt === null || config.qSwitch !== \"prism\") return cuts;\n",
    replace: "    if (opensAt === null || config.qSwitch !== \"prism\") return cuts;\n    return cuts;\n",
    why: "no new solver call at the prism's window"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "        tNow = cuts[i];",
    replace: "        tNow = sim.t + to * tau * 0.5;",
    why: "out of steps at a cut, the time reported short of where the state is"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "var liftBeta = d.beta / (1 + extraLossNow(config, sim, d.gamma));",
    replace: "var liftBeta = d.beta;",
    why: "the photons behind a closed switch lifted to the open cavity's seed level"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "loss: function (tPrime) { return shutter(sim.t + tPrime * tau) / d.gamma; }",
    replace: "loss: function (tPrime) { return shutter(sim.t + tPrime * tau); }",
    why: "the shutter's loss not in units of γ"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "loss: function (tPrime) { return shutter(sim.t + tPrime * tau) / d.gamma; }",
    replace: "loss: function (tPrime) { return shutter(sim.t + tPrime) / d.gamma; }",
    why: "the shutter's time in t′ taken as seconds"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "        depth: closedExtra(config, d.gamma),\n",
    replace: "        depth: closedExtra(config, d.gamma) / 2,\n",
    why: "the filter half as deep in the run as in derive"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "recovery: tau / filter.tau,",
    replace: "recovery: filter.tau / tau,",
    why: "the filter's recovery rate upside down"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "bleach: filter.sigma * c * tau / (config.area * d.L_e * Math.exp(d.sOnePhoton))",
    replace: "bleach: filter.sigma * c * tau / (config.area * d.L_e)",
    why: "the filter bleached per photon of p, not per photon"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "state.push(sim.absorber);",
    replace: "state.push(1);",
    why: "the filter recovered at the start of every call"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "if (run.peak.value > peak.s) peak = { t: sim.t + run.peak.t * tau, s: run.peak.value };",
    replace: "peak = { t: sim.t + run.peak.t * tau, s: run.peak.value };",
    why: "advance's peak from its last piece only"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "power: d.powerPerP * Math.exp(peak.s) }",
    replace: "power: d.powerPerPhoton * Math.exp(peak.s) }",
    why: "advance's peak power from s as if it were ln φ"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "return sim.absorber * closedExtra(config, gamma);",
    replace: "return closedExtra(config, gamma);",
    why: "lossNow ignoring how far the filter is bleached"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "return 1 + extraLossNow(config, sim, compute(where, config, read).gamma);",
    replace: "return extraLossNow(config, sim, compute(where, config, read).gamma);",
    why: "lossNow without the open cavity's own loss"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "gammaOut: Math.abs(Math.log(config.refl2)),",
    replace: "gammaOut: Math.abs(Math.log(config.refl1)),",
    why: "the giant pulse leaving through the back mirror"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "V_a: config.area * config.l_g,",
    replace: "V_a: config.area * config.L,",
    why: "the giant pulse's volume from the cavity's length"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "var x = sim.N / d.N_c;",
    replace: "var x = sim.N / d.N_c + 1;",
    why: "the giant pulse's x one too high"
  },
  {
    file: "js/laser/engine/constants.js",
    find: "ps: 1e-12",
    replace: "ps: 1e-9",
    why: "a picosecond of 10⁻⁹ s"
  },
  {
    file: "js/laser/engine/qswitch.js",
    find: "var ABSORBERS = Object.freeze({",
    replace: "var ABSORBERS = ({",
    why: "the filters' table not frozen"
  },
  {
    file: "js/laser/engine/qswitch.js",
    find: "\"cryptocyanine\": Object.freeze({ sigma: 8e-16 * cm2, tau: 22 * ps })",
    replace: "\"cryptocyanine\": ({ sigma: 8e-16 * cm2, tau: 22 * ps })",
    why: "one filter not frozen"
  },
  {
    file: "js/laser/engine/qswitch.js",
    find: "var depth = check.atLeast(where, \"depth\", params.depth, 0);",
    replace: "var depth = check.positive(where, \"depth\", params.depth);",
    why: "a filter of no depth (T₀ = 1) refused"
  },
  {
    file: "js/laser/engine/qswitch.js",
    find: "var width = tau_c * x * eta / (x - 1 - Math.log(x));",
    replace: "var width = energy / peakPower;",
    why: "the giant pulse's width as E/P, NaN with no output mirror"
  },
  {
    file: "js/laser/engine/qswitch.js",
    find: "return lossOf(readLeak(at(\"closedLoss\"), leak));",
    replace: "return lossOf(leak);",
    why: "closedLoss not checking the leak"
  },
  {
    file: "js/laser/engine/qswitch.js",
    find: "    return function (since) {\n      return cellLossAt(leak, switchTime, since);",
    replace: "    return function (since) {\n      return cellLossAt(leak, 2 * switchTime, since);",
    why: "the cell's loss function switching twice as slowly as cellLoss"
  },
  {
    file: "js/laser/engine/qswitch.js",
    find: "      return prismLossAt(leak, rotation, tolerance, since);",
    replace: "      return prismLossAt(leak, 2 * rotation, tolerance, since);",
    why: "the prism's loss function turning twice as fast as prismLoss"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "      if (rotation > MAX_ROTATION) {",
    replace: "      if (rotation > 10 * MAX_ROTATION) {",
    why: "a prism faster than 10⁵ rev/s accepted"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "    var target = startingLoss(config, d.gamma);",
    replace: "    var target = 1;",
    why: "flashThreshold behind a filter giving the open cavity's"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "      return target * atPeak / photonFreePeak(d, config, atPeak);",
    replace: "      return atPeak / photonFreePeak(d, config, atPeak);",
    why: "four levels' flash threshold ignoring the filter"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "      if (photonFreePeak(d, config, middle) < target) low = middle;",
    replace: "      if (photonFreePeak(d, config, middle) < 1) low = middle;",
    why: "three levels' bisection aiming at the open cavity behind a filter"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "    if (d.scheme === \"three-level\" && target >= d.n_t) return null;\n",
    replace: "",
    why: "a filter darker than every ion up can overcome searched for anyway"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "    if (opensAt === null) {\n      var closed = E.qswitch.closedLoss(config.leak);\n      return function () { return closed; };\n    }\n",
    replace: "",
    why: "a shutter not yet fired treated as opening at t = 0"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "    return function (t) { return loss(t - opensAt); };",
    replace: "    return function (t) { return loss(t); };",
    why: "the shutter's loss timed from t = 0, not from its opening"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "    if (config.qSwitch === \"absorber\" && sim.absorber === null) {",
    replace: "    if (false) {",
    why: "a filter bench without the filter's state accepted"
  },
  /* ---------- stage 8b: the Q-switch on the page ---------- */
  {
    file: "js/laser/engine/bench.js",
    find: "  var ABSORBER_T0_RANGE = { min: 0.2, max: 0.99, log: false };",
    replace: "  var ABSORBER_T0_RANGE = { min: 0.2, max: 1, log: false };",
    why: "the filter's slider up to 100 %: a filter that holds nothing back"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "      absorberT0: config.qSwitch === \"absorber\" ? {",
    replace: "      absorberT0: false ? {",
    why: "the filter's transmission without its slider"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "    var open = d.lossClosed > 1 ? clampShare((d.lossClosed - loss) / (d.lossClosed - 1)) : 1;",
    replace: "    var open = d.lossClosed > 1 ? clampShare((loss - 1) / (d.lossClosed - 1)) : 1;",
    why: "how open the switch is turned upside down (1 closed, 0 open)"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "    var open = d.lossClosed > 1 ? clampShare((d.lossClosed - loss) / (d.lossClosed - 1)) : 1;",
    replace: "    var open = clampShare((d.lossClosed - loss) / (d.lossClosed - 1));",
    why: "a filter that holds nothing back: open as 0/0"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "  var Q_KINDS = Object.freeze([\"absorber\"]);",
    replace: "  var Q_KINDS = Object.freeze([]);",
    why: "the filter not drawn: a switch kind left out"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "    if (!light || !light.qSwitch || pumpKind === \"discharge\") return null;",
    replace: "    if (!light || !light.qSwitch) return null;",
    why: "a switch drawn inside a gas tube that fills the cavity"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "    var filterX = innerLeft + 0.36 * gap;",
    replace: "    var filterX = innerLeft + 0.8 * gap;",
    why: "the filter against the rod, over the left arrowheads"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "    g.globalAlpha = 0.15 + 0.6 * (1 - open);",
    replace: "    g.globalAlpha = 0.15 + 0.6 * open;",
    why: "the filter darker as it bleaches"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "      if (name === \"transmission\" && switchName) spot = L.labels.transmissionShared;\n",
    replace: "",
    why: "the transmission keeps the whole top row and runs into the switch's name"
  },
  {
    file: "js/laser/ui/draw-levels.js",
    find: "    var lossY = gaugeY(loss);",
    replace: "    var lossY = gaugeY(1);",
    why: "the loss line stays at the open cavity's while the switch is closed"
  },
  {
    file: "js/laser/ui/draw-levels.js",
    find: "      barMark(g, c, L.bar, loss / top);",
    replace: "      barMark(g, c, L.bar, 1 / top);",
    why: "the four-level threshold mark at the open cavity's threshold behind a closed switch"
  },
  {
    file: "js/laser/ui/draw-levels.js",
    find: "      if (picture.n_t > loss) barMark(g, c, L.bar, (1 + loss / picture.n_t) / 2);",
    replace: "      if (picture.n_t > 1) barMark(g, c, L.bar, (1 + loss / picture.n_t) / 2);",
    why: "a three-level threshold mark above its bar when the loss is out of reach"
  },
  {
    file: "js/laser/ui/draw-levels.js",
    find: "    return typeof picture.loss === \"number\" ? picture.loss : 1;",
    replace: "    return 1;",
    why: "the level picture ignores the loss it is given"
  },
  {
    file: "js/laser/page.js",
    find: "        if (run.peak.t > from && run.peak.t < state.sim.t) state.history.push(run.peak.t, run.peak.power);",
    replace: "",
    why: "a giant pulse between two chart points left off the chart"
  },
  {
    file: "js/laser/page.js",
    find: "        if (run.peak.t > from && run.peak.t < state.sim.t) state.history.push(run.peak.t, run.peak.power);",
    replace: "        if (run.peak.t >= from && run.peak.t <= state.sim.t) state.history.push(run.peak.t, run.peak.power);",
    why: "a run's peak at its start or end pushed twice onto the chart"
  },
  {
    file: "js/laser/page.js",
    find: "        if (state.peak !== null) state.peak = Math.max(state.peak, run.peak.power);",
    replace: "        if (state.peak !== null) state.peak = Math.max(state.peak, powerNow());",
    why: "the highest output from the chart's ends, which miss a 13 ns pulse"
  },
  {
    file: "js/laser/page.js",
    find: "      state.peak = peakFrom(state.config, powerNow());",
    replace: "      state.peak = null;",
    why: "a steady bench behind a filter never shows its highest output"
  },
  {
    file: "js/laser/page.js",
    find: "      if (derived.P_out === null) {\n        rows = without(rows, PULSING_HIDES);",
    replace: "      if (false) {\n        rows = without(rows, PULSING_HIDES);",
    why: "the diode bench behind a filter shows a steady output it never has"
  },
  {
    file: "js/laser/page.js",
    find: "      var peakWord = state.config.pump === \"flashlamp\" ? \"readouts.peak\" : \"readouts.peakStart\";",
    replace: "      var peakWord = \"readouts.peak\";",
    why: "a bench without a flash names its highest output \"since the flash\""
  },
  {
    file: "js/laser/page.js",
    find: "      return F.si(pulse.energy, \"J\") + \" · \" + F.si(pulse.peakPower, \"W\") + \" · \" + F.si(pulse.width, \"s\");",
    replace: "      return F.si(pulse.energy, \"J\") + \" · \" + F.si(pulse.peakPower, \"W\") + \" · \" + F.si(pulse.energy / pulse.peakPower / 2, \"s\");",
    why: "the pulse's length worked out on the page, and wrongly"
  },
  {
    file: "js/laser/page.js",
    find: "  var LIVE_READOUTS = [\"x\", \"lossNow\", \"giant\", \"peak\", \"powerNow\", \"time\"];",
    replace: "  var LIVE_READOUTS = [\"x\", \"peak\", \"powerNow\", \"time\"];",
    why: "the loss now and §4.3's pulse written only when a control moves"
  },
  {
    file: "js/laser/page.js",
    find: "        loss: shutter === null ? 1 : shutter.loss,",
    replace: "        loss: 1,",
    why: "the level gauge's loss line stays at the open cavity's"
  },
  {
    file: "js/laser/page.js",
    find: "      if (state.config.qSwitch === FILTER && hasFilter(config)) config = withFilter(config);",
    replace: "      if (false) config = withFilter(config);",
    why: "a new medium drops the filter it can also have"
  },
  {
    file: "js/laser/page.js",
    find: "          if (!hasFilter(state.config)) return;           // a hidden switch: a stray click\n",
    replace: "",
    why: "a hidden switch's stray click asks the engine for a filter the bench cannot have"
  },
  {
    file: "js/laser/page.js",
    find: "      var filtered = bench.withQSwitch({ config: config, qSwitch: FILTER });",
    replace: "      var filtered = bench.withQSwitch({ config: bench.configFor({ medium: config.medium, pump: config.pump }), qSwitch: FILTER });",
    why: "turning the filter on puts the pump and the coupler back to the bench's own"
  },
  {
    file: "js/laser/page.js",
    find: "      take(config, numbers);\n      state.sim = sim;",
    replace: "      take(config, numbers);\n      state.slowMotion = startSlowMotion(config);\n      state.sim = sim;",
    why: "turning the filter on puts the slow motion back"
  },
  {
    file: "js/laser/page.js",
    find: "          if (sliderRow) sliderRow.hidden = hidden();",
    replace: "",
    why: "the Q-switch's slider rows never shown or hidden"
  },
  {
    file: "js/laser/page.js",
    find: "      if (name === \"absorberT0\") return { unit: \"%\", factor: 100 };",
    replace: "      if (name === \"absorberT0\") return { unit: \"%\", factor: 1 };",
    why: "the filter's transmission typed as a share under the unit %"
  },
  {
    file: "js/laser/page.js",
    find: "            var movesThreshold = name === \"coupler\" || name === \"absorberT0\";",
    replace: "            var movesThreshold = name === \"coupler\";",
    why: "the threshold flash not found again for a new filter"
  },
  {
    file: "data/laser.json",
    find: "    \"peakStart\": { \"hy\": \"Ամենաբարձր ելքային հզորությունը սկզբից ի վեր\", \"en\": \"Highest output since the start\" },",
    replace: "    \"peakStart\": { \"hy\": \"\", \"en\": \"Highest output since the start\" },",
    why: "a word missing in Armenian"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "    if (sim.flash !== null && read.setup.pump !== \"flashlamp\") {\n      check.fail(where, \"sim.flash is a flash fired at \" + sim.flash.at + \" s, but this bench has no \" +\n        \"flashlamp (its pump is \" + read.setup.pump + \"): carryOver only changes the Q-switch.\");",
    replace: "    if (false) {\n      check.fail(where, \"sim.flash is a flash fired at \" + sim.flash.at + \" s, but this bench has no \" +\n        \"flashlamp (its pump is \" + read.setup.pump + \"): carryOver only changes the Q-switch.\");",
    why: "carryOver lets a flash onto a bench without a flashlamp"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "    next.absorber = config.qSwitch === \"absorber\" ? 1 : null;",
    replace: "    next.absorber = config.qSwitch === \"absorber\" ? 0 : null;",
    why: "a filter turned on starts bleached, not dark"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "    next.opensAt = null;\n",
    replace: "",
    why: "a shutter switched off keeps its opening time"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "      d.pumpThreshold *= startingLoss(config, d.gamma);\n",
    replace: "",
    why: "the diode bench behind a filter reads the open cavity's threshold, which never lases"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "      d.pumpThreshold *= startingLoss(config, d.gamma);\n      noSteadyState(d);",
    replace: "      d.pumpThreshold *= startingLoss(config, d.gamma);",
    why: "a steady pump behind a filter given a steady output it never has"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "overThreshold: level / startLoss };",
    replace: "overThreshold: level };",
    why: "the pump over threshold read against the open cavity behind a filter"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "      var startW = d.n_t > startLoss ? (d.n_t + startLoss) / (d.n_t - startLoss) : null;",
    replace: "      var startW = d.n_t > startLoss ? (d.n_t + 1) / (d.n_t - 1) : null;",
    why: "three levels' pump over threshold ignores the filter"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "      var startW = d.n_t > startLoss ?",
    replace: "      var startW = d.n_t > 0 ?",
    why: "a filter no inversion can beat gives a negative pump over threshold"
  },
  {
    file: "js/laser/page.js",
    find: "  var FILTER = \"absorber\";",
    replace: "  var FILTER = \"cell\";",
    why: "the switch turns on the engine's Pockels cell, not the filter"
  },
  {
    file: "js/laser/page.js",
    find: ".indexOf(FILTER) !== -1;",
    replace: ".indexOf(FILTER) === -1;",
    why: "the switch shown only where there can be no filter"
  },
  {
    file: "js/laser/page.js",
    find: "      if (switchGroup) switchGroup.hidden = !filter;",
    replace: "      if (switchGroup) switchGroup.hidden = false;",
    why: "the switch shown on a bench that cannot have a filter"
  },
  {
    file: "js/laser/page.js",
    find: "      if (under) under.hidden = !flash && !filter;",
    replace: "      if (under) under.hidden = false;",
    why: "an empty row under the drawing"
  },
  {
    file: "js/laser/page.js",
    find: "      if (toggle) toggle.setAttribute(\"aria-checked\", on ? \"true\" : \"false\");",
    replace: "      if (toggle) toggle.setAttribute(\"aria-checked\", \"false\");",
    why: "the switch always drawn off"
  },
  {
    file: "js/laser/page.js",
    find: "      setText('[data-laser-name=\"qSwitchState\"]', word(data, on ? \"choose.on\" : \"choose.off\"));",
    replace: "      setText('[data-laser-name=\"qSwitchState\"]', word(data, \"choose.off\"));",
    why: "the switch's word always Off"
  },
  {
    file: "js/laser/page.js",
    find: "      state.flashThresholdOld = false;\n      showUnderBench();\n",
    replace: "      state.flashThresholdOld = false;\n",
    why: "the row under the drawing not redrawn: the switch's On/Off, Fire on a new bench"
  },
  {
    file: "js/laser/page.js",
    find: "      var threshold = thresholdFlash(config);\n      var sim = bench.carryOver(",
    replace: "      var threshold = state.flashThreshold;\n      var sim = bench.carryOver(",
    why: "turning the filter on keeps the open cavity's threshold flash"
  },
  {
    file: "js/laser/page.js",
    find: "      state.sim = sim;\n      showBench(threshold);",
    replace: "      state.sim = bench.start(config);\n      showBench(threshold);",
    why: "turning the filter on starts the run again"
  },
  {
    file: "js/laser/page.js",
    find: "          turnSwitch(state.config.qSwitch === \"none\" ? FILTER : \"none\");",
    replace: "          turnSwitch(FILTER);",
    why: "the switch never turns off"
  },
  {
    file: "js/laser/page.js",
    find: "        var over = pumpNow().overThreshold;",
    replace: "        var over = pumpNow().x;",
    why: "the pump over threshold read against the open cavity behind a filter (page)"
  },
  {
    file: "js/laser/page.js",
    find: "      if (value === null || value > controls.pump.max) return never;",
    replace: "      if (value === null) return never;",
    why: "a threshold past the pump slider's top (a flash, a pump power) shown as if it could be reached"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "    if (qSwitch) post(g, L.filter.x + L.filter.w / 2, L.filter.y + L.filter.h, L.railY);\n",
    replace: "",
    why: "the filter floating in the air"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "    var leftFrom = qSwitch ? L.filter.x + L.filter.w : faceX(L, \"back\", L.axis.y);",
    replace: "    var leftFrom = faceX(L, \"back\", L.axis.y);",
    why: "the left arrowheads on top of the filter"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "    g.globalAlpha = 0.15 + 0.6 * (1 - open);",
    replace: "    g.globalAlpha = 0.15 + 0.6 * open;",
    why: "the filter drawn darker as it bleaches"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "    var sharedRow = shareTopRow(w, pad, fontSize, topRow, filterX);",
    replace: "    var sharedRow = shareTopRow(w, pad, fontSize, topRow, w / 2);",
    why: "the filter's name written away from the filter"
  },

  /* ---------- stage 8b: the lamp's button and its light, the review's fixes ---------- */
  {
    file: "js/laser/page.js",
    find: "      var value = state.config.pump === \"flashlamp\" && ready ? \"true\" : \"false\";",
    replace: "      var value = ready ? \"true\" : \"false\";",
    why: "Fire asking to be pressed on a bench without a lamp"
  },
  {
    file: "js/laser/page.js",
    find: "        (state.sim.t > flash.at + flash.flashTime && benchPumpNow() < UI.bench.PUMP_OFF);",
    replace: "        (benchPumpNow() < UI.bench.PUMP_OFF);",
    why: "Fire asking again right after it is pressed, before the lamp lights"
  },
  {
    file: "js/laser/page.js",
    find: "        (state.sim.t > flash.at + flash.flashTime && benchPumpNow() < UI.bench.PUMP_OFF);",
    replace: "        (state.sim.t > flash.at + flash.flashTime);",
    why: "Fire asking again while the lamp is still lit"
  },
  {
    file: "js/laser/page.js",
    find: "        showReadouts(LIVE_READOUTS);\n        showLamp();",
    replace: "        showReadouts(LIVE_READOUTS);",
    why: "Fire never asking again once a flash has faded"
  },
  {
    file: "js/laser/page.js",
    find: "      showReadouts(READOUTS);\n      showLamp();",
    replace: "      showReadouts(READOUTS);",
    why: "Fire not asking on a new flashlamp bench, nor waiting at a press"
  },
  {
    file: "js/laser/page.js",
    find: "      if (fireButton.getAttribute(\"data-ready\") !== value) fireButton.setAttribute(\"data-ready\", value);",
    replace: "      fireButton.setAttribute(\"data-ready\", value);",
    why: "Fire's state written ten times a second"
  },
  {
    file: "js/laser/page.js",
    find: "  function peakFrom(config, power) {\n    return config.pump === \"flashlamp\" ? null : power;",
    replace: "  function peakFrom(config, power) {\n    return null;",
    why: "a steady bench's highest output never started"
  },
  {
    file: "js/laser/page.js",
    find: "      if (name === \"pumpThreshold\") return thresholdText(d.pumpThreshold, \"W\");",
    replace: "      if (name === \"pumpThreshold\") return d.pumpThreshold === null ? never : F.si(d.pumpThreshold, \"W\");",
    why: "the diodes' threshold behind a dark filter shown past the slider's top"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "    if (d.scheme === \"two-level\" || !(x >= PULSE_FROM)) return null;",
    replace: "    if (d.scheme === \"two-level\" || !(x > 1)) return null;",
    why: "§4.3's pulse predicted just above threshold, where it lasts for ever"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "  var PULSE_FROM = 1.01;",
    replace: "  var PULSE_FROM = 1.03;",
    why: "§4.3's pulse hidden at 2 % over threshold"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "  var PULSE_FROM = 1.01;",
    replace: "  var PULSE_FROM = 1.001;",
    why: "§4.3's pulse shown at half a percent over threshold"
  },
  {
    file: "js/laser/page.js",
    find: "      if (kept !== undefined) filtered.absorberT0 = kept;\n",
    replace: "",
    why: "the filter turned off and on again forgetting its transmission"
  },
  {
    file: "js/laser/page.js",
    find: "            if (name === \"absorberT0\") state.filterT0[benchName(config)] = value;",
    replace: "            if (name === \"absorberT0\") state.filterT0[config.pump] = value;",
    why: "one flashlamp bench's filter transmission given to another"
  },
  {
    file: "js/laser/page.js",
    find: "      var config = qSwitch === FILTER ? withFilter(state.config) : bench.withQSwitch({ config: state.config, qSwitch: qSwitch });",
    replace: "      var config = bench.withQSwitch({ config: state.config, qSwitch: qSwitch });",
    why: "the filter's On forgetting the transmission the visitor set"
  },
  {
    file: "js/laser/page.js",
    find: "          if (hidden()) return;\n",
    replace: "",
    why: "the filter's hidden slider written as if it had a range"
  },
  {
    file: "js/laser/page.js",
    find: "            if (!hidden()) work();",
    replace: "            work();",
    why: "a stray event on the filter's hidden slider changing the bench"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "    if (kind === \"flashlamp\" && pump > 0) flashBehind(g, colors, L, view.w, view.h, pump);",
    replace: "    if (kind === \"flashlamp\") flashBehind(g, colors, L, view.w, view.h, pump);",
    why: "the bench lit by a lamp not yet fired"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "    g.globalAlpha = 0.1 * pump;\n    g.fillRect(0, 0, w, h);",
    replace: "    g.globalAlpha = 0.1;\n    g.fillRect(0, 0, w, h);",
    why: "the bench as brightly lit by a weak flash as by a strong one"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "F.w / 2 + k * L.haloStep, F.h / 2 + k * L.haloStep",
    replace: "F.w / 2 + L.haloStep, F.h / 2 + L.haloStep",
    why: "the halo's rings all one size"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "    g.globalAlpha = 0.06 * pump;\n    for (var k = 1",
    replace: "    g.globalAlpha = 0.06;\n    for (var k = 1",
    why: "the halo as bright for a weak flash as for a strong one"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "      var length = L.streak * pump * (0.4 + 0.6 * flicker);",
    replace: "      var length = L.streak * (0.4 + 0.6 * flicker);",
    why: "the streaks as long for a weak flash as for a strong one"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "      var flicker = 0.5 + 0.5 * Math.sin(FLICKER_SPEED * time + 2.4 * k);",
    replace: "      var flicker = 0.5 + 0.5 * Math.sin(2.4 * k);",
    why: "the streaks standing still"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "      var flicker = 0.5 + 0.5 * Math.sin(FLICKER_SPEED * time + 2.4 * k);",
    replace: "      var flicker = 0.5 + 0.5 * Math.sin(FLICKER_SPEED * time);",
    why: "every streak flickering as one"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "    var time = typeof t === \"number\" && isFinite(t) ? t : 0;",
    replace: "    var time = t;",
    why: "a view without a time drawing streaks at NaN"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "      var x0 = F.x + F.w / 2 + dx * (F.w / 2 + 3);",
    replace: "      var x0 = F.x + F.w / 2 + dx * (F.w / 2);",
    why: "the streaks starting inside the tube"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "      g.lineTo(L.rod.x + L.rod.w, rodBottom);",
    replace: "      g.lineTo(F.x + F.w - cap, rodBottom);",
    why: "the flash's beams not reaching across the rod"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "      g.globalAlpha = 0.15 + 0.35 * pump;",
    replace: "      g.globalAlpha = 0.5;",
    why: "the flash's beams as bright for a weak flash as for a strong one"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "      g.shadowBlur = L.bloom * pump;",
    replace: "      g.shadowBlur = L.bloom;",
    why: "the gas blooming as wide for a weak flash"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "      g.fillRect(F.x + cap, F.y, F.w - 2 * cap, F.h);\n      g.restore();\n    }",
    replace: "      g.fillRect(F.x + cap, F.y, F.w - 2 * cap, F.h);\n      g.restore();\n      g.shadowBlur = L.bloom * pump;\n    }",
    why: "the bloom left on, so every part after the lamp blooms"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "    if (kind === \"flashlamp\" && pump > 0) lightRod(g, colors, L, pump);\n",
    replace: "",
    why: "the rod dark in the flash"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "    g.globalAlpha = 0.3 * pump;\n    g.fillStyle = colors.flash;",
    replace: "    g.globalAlpha = 0.3;\n    g.fillStyle = colors.flash;",
    why: "the rod as brightly lit by a weak flash as by a strong one"
  },
  {
    file: "css/style.css",
    find: "  --canvas-flash: #f39a3d;                    /* a lit flashlamp: warm orange, bright on cream */\n",
    replace: "",
    why: "the light theme without the flash colour"
  },
  {
    file: "css/laser.css",
    find: "  .laser-fire[data-ready=\"true\"]::after,\n  .laser-fire[data-ready=\"true\"] .laser-fire__bolt {\n    animation: none;\n  }",
    replace: "  .laser-fire[data-ready=\"true\"]::after {\n    animation: none;\n  }",
    why: "Fire's bolt still pulsing for a visitor who asked for less motion"
  },
  {
    file: "sections/laser.html",
    find: "<svg class=\"laser-fire__bolt\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\">",
    replace: "<svg class=\"laser-fire__bolt\" viewBox=\"0 0 24 24\" focusable=\"false\">",
    why: "Fire's bolt read out to screen readers"
  },
  {
    file: "sections/laser.html",
    find: "            <span data-text=\"buttons.fire\"></span>",
    replace: "            <span></span>",
    why: "Fire without its word"
  },
  {
    file: "css/style.css",
    find: "  --canvas-lamp: #e5673b;                     /* a flashlamp's glass edge and caps: bright terracotta */\n",
    replace: "",
    why: "the light theme without the lamp's own colour"
  },
  // stage 8b, the third review's fixes
  {
    file: "js/laser/engine/bench.js",
    find: "      check.atLeast(where, \"sim.N\", sim.N, 0);\n",
    replace: "",
    why: "a ruby simulation, every ion down, carried to Nd:YAG"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "      check.between(where, \"sim.N\", sim.N, -read.medium.N_t, read.medium.N_t);",
    replace: "      check.atLeast(where, \"sim.N\", sim.N, -read.medium.N_t);",
    why: "more ruby ions up than there are, carried over"
  },
  {
    file: "js/laser/ui/loop.js",
    find: "        still: reduceMotion\n",
    replace: "        still: false\n",
    why: "the drawings never told that the visitor asked for less motion"
  },
  {
    file: "js/laser/ui/draw-bench.js",
    find: "drawFlashlamp(g, colors, L, pump, view.still ? 0 : view.t);",
    replace: "drawFlashlamp(g, colors, L, pump, view.t);",
    why: "the lamp's streaks flicker for a visitor who asked for less motion"
  },
  // stage 10a: the mirrors (optics.js and the bench)
  {
    file: "js/laser/engine/optics.js",
    find: "return matrix(1, 0, 0 - 2 * c, 1);",
    replace: "return matrix(1, 0, 0 - c, 1);",
    why: "a mirror as a lens of f = R, not R/2"
  },
  {
    file: "js/laser/engine/optics.js",
    find: "    return matrix(1, l / n, 0, 1);",
    replace: "    return matrix(1, l, 0, 1);",
    why: "a slab as free space l, not l/n (D10)"
  },
  {
    file: "js/laser/engine/optics.js",
    find: "    return L - l_g + l_g / n;",
    replace: "    return L - l_g + l_g * n;",
    why: "the rod counted l·n, not l/n"
  },
  {
    file: "js/laser/engine/optics.js",
    find: "    var w0 = Math.sqrt(lam * zR / Math.PI);",
    replace: "    var w0 = lam * zR / Math.PI;",
    why: "the √ dropped from w₀"
  },
  {
    file: "js/laser/engine/optics.js",
    find: "      walkOff = Math.log(magnification);",
    replace: "      walkOff = 0.5 * Math.log(magnification);",
    why: "an unstable pair keeping 1/M, not 1/M²"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "    if (shape === \"convex\") return -1 / radius;",
    replace: "    if (shape === \"convex\") return 1 / radius;",
    why: "a convex mirror bent like a concave one"
  },
  {
    file: "js/laser/engine/optics.js",
    find: "      focus1: c1 === 0 ? null : 1 / (2 * c1),",
    replace: "      focus1: c1 === 0 ? null : 1 / c1,",
    why: "F at R, not R/2"
  },
  {
    file: "js/laser/engine/optics.js",
    find: "      focus2: c2 === 0 ? null : 1 / (2 * c2),",
    replace: "      focus2: c2 === 0 ? null : -1 / (2 * c2),",
    why: "a convex mirror's F in front of it"
  },
  {
    file: "js/laser/engine/optics.js",
    find: "    var alpha = 8 * KAPPA_00 * KAPPA_00 * VAINSHTEIN_DELTA * u / (bottom * bottom);",
    replace: "    var alpha = 8 * KAPPA_00 * VAINSHTEIN_DELTA * u / (bottom * bottom);",
    why: "Vainshtein's κ not squared (the first reading of the scan)"
  },
  {
    file: "js/laser/engine/optics.js",
    find: "    return -Math.expm1(-alpha);",
    replace: "    return -Math.expm1(-2 * alpha);",
    why: "Vainshtein's α taken as the field's decay, not the energy lost (eq. (81))"
  },
  {
    file: "js/laser/engine/optics.js",
    find: "    var M = Math.sqrt(8 * Math.PI * N);",
    replace: "    var M = Math.sqrt(4 * Math.PI * N);",
    why: "Vainshtein's M = √(4πN)"
  },
  {
    file: "js/laser/engine/optics.js",
    find: "    return Math.min(clip, flat);",
    replace: "    return Math.max(clip, flat);",
    why: "a mirror losing the more of the two"
  },
  {
    file: "js/laser/engine/optics.js",
    find: "    var clip = Math.exp(-2 * Math.PI * fresnel * Math.sqrt(Math.abs(fit)));",
    replace: "    var clip = Math.exp(-2 * Math.PI * fresnel * Math.abs(fit));",
    why: "the clipping without the √ of w²"
  },
  {
    file: "js/laser/engine/optics.js",
    find: "    if (gi === 0 && gj === 0) return 1;",
    replace: "    if (gi === 0 && gj === 0) return 0;",
    why: "the confocal point taken as an edge"
  },
  {
    file: "js/laser/engine/optics.js",
    find: "    return gi * (1 - gi * gj) / gj;",
    replace: "    return gj * (1 - gi * gj) / gi;",
    why: "each mirror given the other's spot"
  },
  {
    file: "js/laser/engine/optics.js",
    find: "    if (!confocal && !(product > 0 && product < 1)) return null;",
    replace: "    if (!confocal && !(product >= 0 && product <= 1)) return null;",
    why: "a Gaussian mode on the stability edges"
  },
  {
    file: "js/laser/engine/optics.js",
    find: "      zR2 = Lr * Lr * (1 + g1) / (4 * (1 - g1));",
    replace: "      zR2 = Lr * Lr * (1 - g1) / (4 * (1 + g1));",
    why: "the symmetric z_R upside down"
  },
  {
    file: "js/laser/engine/optics.js",
    find: "      z1 = Lr * g2 * (1 - g1) / sum;",
    replace: "      z1 = Lr * g1 * (1 - g2) / sum;",
    why: "the waist measured from the wrong mirror"
  },
  {
    file: "js/laser/engine/optics.js",
    find: "      w1: w0 * Math.sqrt(1 + (z1 / zR) * (z1 / zR)),",
    replace: "      w1: w0 * Math.sqrt(1 + (z2 / zR) * (z2 / zR)),",
    why: "mirror 1 given mirror 2's spot"
  },
  {
    file: "js/laser/engine/optics.js",
    find: "    if (zr <= rodStart + l_g / n) return rodStart + (zr - rodStart) * n;",
    replace: "    if (zr <= rodStart + l_g / n) return rodStart + (zr - rodStart) / n;",
    why: "the waist inside the rod put at the wrong place"
  },
  {
    file: "js/laser/engine/optics.js",
    find: "    if (z <= rodEnd) return rodStart + (z - rodStart) / n;",
    replace: "    if (z <= rodEnd) return rodStart + (z - rodStart) * n;",
    why: "the beam inside the rod growing n times too fast"
  },
  {
    file: "js/laser/engine/optics.js",
    find: "        theta = theta - 2 * curvatures[k] * y;",
    replace: "        theta = theta + 2 * curvatures[k] * y;",
    why: "a ray bent away from the axis by a concave mirror"
  },
  {
    file: "js/laser/engine/optics.js",
    find: "    var curvatures = [c2, c1];",
    replace: "    var curvatures = [c1, c2];",
    why: "a ray meeting the mirrors the wrong way round"
  },
  {
    file: "js/laser/engine/optics.js",
    find: "        if (Math.abs(y) > aperture) {",
    replace: "        if (y > aperture) {",
    why: "a ray never leaving below the axis"
  },
  {
    file: "js/laser/engine/optics.js",
    find: "      magnification = Math.abs(m) + Math.sqrt(m * m - 1);",
    replace: "      magnification = Math.abs(m);",
    why: "M = |m|"
  },
  {
    file: "js/laser/engine/optics.js",
    find: "    if (Math.abs(m) > 1) {",
    replace: "    if (m > 1) {",
    why: "an unstable pair with m < −1 not walking out"
  },
  {
    file: "js/laser/engine/optics.js",
    find: "  var MAX_ROUND_TRIPS = 10000;",
    replace: "  var MAX_ROUND_TRIPS = 100000;",
    why: "no bound on the ray trace"
  },
  {
    file: "js/laser/engine/optics.js",
    find: "    var gamma = -0.5 * (Math.log1p(-loss1) + Math.log1p(-loss2)) + walkOff;",
    replace: "    var gamma = -(Math.log1p(-loss1) + Math.log1p(-loss2)) + walkOff;",
    why: "the edges counted as a single pass, not a round trip"
  },
  {
    file: "js/laser/engine/optics.js",
    find: "      loss: -Math.expm1(-2 * gamma),",
    replace: "      loss: -Math.expm1(-gamma),",
    why: "the round-trip loss from one pass"
  },
  {
    file: "js/laser/engine/optics.js",
    find: "  var KAPPA_00 = 2.404825557695773;",
    replace: "  var KAPPA_00 = 3.831705970207512;",
    why: "the first zero of J₁, not J₀"
  },
  {
    file: "js/laser/engine/optics.js",
    find: "    var fresnel = aperture * aperture / (lam * Lr);",
    replace: "    var fresnel = aperture * aperture / (lam * params.L);",
    why: "the Fresnel number over L, not L*"
  },
  {
    file: "js/laser/engine/optics.js",
    find: "    var n = check.atLeast(where, \"n\", params.n, 1);\n    return matrix",
    replace: "    var n = check.atLeast(where, \"n\", params.n, 0);\n    return matrix",
    why: "a slab of index below 1"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "    var alphaWithMirrors = config.alpha_i + resonator.gamma / config.l_g;",
    replace: "    var alphaWithMirrors = config.alpha_i;",
    why: "the mirrors losing nothing"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "      L: config.L, l_g: config.l_g, n: medium.n,",
    replace: "      L: config.L, l_g: config.l_g, n: 1,",
    why: "the rod counted as air"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "      lam: medium.lam, aperture: config.aperture",
    replace: "      lam: 1e-6, aperture: config.aperture",
    why: "every medium's mirrors at 1 µm"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "    if (shape === \"concave\") return 1 / radius;",
    replace: "    if (shape === \"concave\") return 2 / radius;",
    why: "a concave mirror of half its radius"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "    readMirror(where, config, \"mirror1\", \"Rc1\");\n",
    replace: "",
    why: "mirror 1 unchecked"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "    check.positive(where, \"aperture\", config.aperture);\n",
    replace: "",
    why: "the aperture unchecked"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "    var L_i = 2 * d.alphaWithMirrors * config.l_g;",
    replace: "    var L_i = 2 * config.alpha_i * config.l_g;",
    why: "the best coupler without the mirrors' loss"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "      refl1: config.refl1, refl2: config.refl2, alpha_i: alphaWithMirrors, l_g: config.l_g",
    replace: "      refl1: config.refl1, refl2: config.refl2, alpha_i: config.alpha_i, l_g: config.l_g",
    why: "g_th without the mirrors' loss"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "mirror1: \"flat\", Rc1: 1, mirror2: \"concave\", Rc2: 45 * cm, aperture: 0.75 * mm,",
    replace: "mirror1: \"flat\", Rc1: 1, mirror2: \"concave\", Rc2: 25 * cm, aperture: 0.75 * mm,",
    why: "He-Ne's output mirror too strong: unstable"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "mirror1: \"concave\", Rc1: 20, mirror2: \"flat\", Rc2: 1, aperture: 6 * mm,",
    replace: "mirror1: \"concave\", Rc1: 2, mirror2: \"flat\", Rc2: 1, aperture: 6 * mm,",
    why: "CO₂'s back mirror of 2 m, not 20"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "  var MIRROR_SHAPES = Object.freeze([\"flat\", \"concave\", \"convex\"]);",
    replace: "  var MIRROR_SHAPES = [\"flat\", \"concave\", \"convex\"];",
    why: "the mirror shapes not frozen"
  },
  {
    file: "index.html",
    find: "  <script src=\"js/laser/engine/optics.js\"></script>\n",
    replace: "",
    why: "the page without optics.js"
  },
  // stage 10a, the review's fixes
  {
    file: "js/laser/engine/bench.js",
    find: "    check.atLeast(where, radiusName, config[radiusName], MIN_RADIUS);",
    replace: "    check.positive(where, radiusName, config[radiusName]);",
    why: "a radius of 10⁻¹⁶⁰ m let through to overflow in optics.js"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "    var loss = alpha_i * l_g - 0.5 * (Math.log(refl1) + Math.log(refl2)) + resonator.gamma;",
    replace: "    var loss = alpha_i * l_g - 0.5 * (Math.log(refl1) + Math.log(refl2));",
    why: "the lossless-cavity guard blind to the mirrors' loss"
  },
  {
    file: "js/laser/engine/bench.js",
    find: "    if (!isFinite(loss)) {\n      check.fail(where, \"the mirrors lose too much light",
    replace: "    if (false) {\n      check.fail(where, \"the mirrors lose too much light",
    why: "an infinite mirror loss passed on"
  },
];

module.exports = { MUTATIONS };
