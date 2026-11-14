/* ============================================================================
   cavity.test.js — js/laser/engine/cavity.js against docs/laser-physics.md
   §3 (threshold, photon lifetime, modes, finesse, output power) and the
   matching rows of §12.

   Every call gets a deep-frozen input object, so a function that changed
   its input would throw.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine, deepFreeze, assertClose } = require("./helpers.js");

const { constants: C, units: U, media: M, spectrum: S, cavity: K } = loadEngine();

// Every test calls the engine through this, so no input can be changed.
function call(name, params) {
  return K[name](deepFreeze(params));
}

// The He-Ne example of §3.1–3.2: mirrors 0.99 and 0.98, a 0.3 m tube that
// fills the cavity, no other loss.
const HENE = { refl1: 0.99, refl2: 0.98, alpha_i: 0, l_g: 0.3 };
// The ruby example of §3.1: R₁ = 1, R₂ = 0.5, a 10 cm rod.
const RUBY = { refl1: 1, refl2: 0.5, alpha_i: 0, l_g: 0.1 };

/* ---------- threshold (§3.1) ---------- */

test("§12: He-Ne threshold gain ≈ 0.05 m⁻¹", () => {
  // 0.05042; the doc gives 1 digit, so ±0.005
  assertClose(call("thresholdGain", HENE), 0.05, 0.1, "g_th, m⁻¹");
});

test("§3.1: ruby threshold gain ≈ 3.5 m⁻¹ and inversion ≈ 1.4×10¹⁸ cm⁻³, ~9 % of N_t", () => {
  const gth = call("thresholdGain", RUBY);
  assertClose(gth, 3.5, 0.05 / 3.5, "g_th, m⁻¹ (3.466)");
  const dNth = call("thresholdInversion", { gth: gth, sigma: M.get("ruby").sigma });
  assertClose(dNth / 1e6, 1.4e18, 0.05 / 1.4, "ΔN_th, cm⁻³ (1.386×10¹⁸)");
  // "only ~9 % of N_t ≈ 1.6×10¹⁹ cm⁻³"
  const share = dNth / (1.6e19 * 1e6);
  assert.ok(share > 0.085 && share < 0.095, "share of N_t " + share);
});

test("g_th·l = γ, and γ = αl + ½·ln(1/(R₁R₂))", () => {
  assertClose(call("thresholdGain", HENE) * HENE.l_g, call("singlePassLoss", HENE), 1e-12, "g_th·l = γ");
  // 0.5 m⁻¹ of internal loss over 0.2 m, ideal mirrors: γ = 0.1
  assertClose(call("singlePassLoss", { refl1: 1, refl2: 1, alpha_i: 0.5, l_g: 0.2 }), 0.1, 1e-12, "αl alone");
  // each mirror alone adds half its own −ln R
  assertClose(call("singlePassLoss", { refl1: 1, refl2: Math.exp(-0.2), alpha_i: 0, l_g: 1 }), 0.1, 1e-12, "R₂ alone");
  assertClose(call("singlePassLoss", { refl1: Math.exp(-0.2), refl2: 1, alpha_i: 0, l_g: 1 }), 0.1, 1e-12, "R₁ alone");
});

test("γ ≈ (T + L_i)/2 for small losses: single pass vs round trip (§3.6)", () => {
  // The output coupler as R₂ = 1 − T, all other loss as R₁ = 1 − L_i.
  const T_oc = 0.002;
  const L_i = 0.001;
  const gamma = call("singlePassLoss", { refl1: 1 - L_i, refl2: 1 - T_oc, alpha_i: 0, l_g: 0.1 });
  const halfRoundTrip = (T_oc + L_i) / 2;
  // They differ only in second order: by less than (T + L_i)/2 of the value.
  assert.ok(Math.abs(gamma / halfRoundTrip - 1) < halfRoundTrip,
    "γ " + gamma + " vs (T + L_i)/2 " + halfRoundTrip);
});

/* ---------- photon lifetime, Q, linewidth (§3.2) ---------- */

test("§3.2: He-Ne photon lifetime ≈ 66 ns, cold-cavity linewidth ≈ 2.4 MHz, Q ≈ 2.0×10⁸", () => {
  const gamma = call("singlePassLoss", HENE);
  const L_e = call("effectiveLength", { L: 0.3, l_g: 0.3, nGroup: 1 });
  const tau_c = call("photonLifetime", { L_e: L_e, gamma: gamma });
  assertClose(tau_c / C.ns, 66, 0.5 / 66, "τ_c, ns (66.15)");
  const dnu_c = K.coldLinewidth(tau_c);
  assertClose(dnu_c / C.MHz, 2.4, 0.05 / 2.4, "Δν_c, MHz (2.406)");
  const nu = M.get("he-ne").nu;
  const Q = call("qFactor", { nu: nu, tau_c: tau_c });
  assertClose(Q, 2.0e8, 0.05 / 2.0, "Q (1.969×10⁸)");
  // Q is also the line frequency over the cavity linewidth
  assertClose(Q, nu / dnu_c, 1e-12, "Q = ν/Δν_c");
});

test("τ_c = L_e/(cγ): one pass of the cavity, divided by the loss per pass", () => {
  assertClose(call("photonLifetime", { L_e: C.c, gamma: 0.5 }), 2, 1e-12, "1 s per pass, γ = 0.5");
});

/* ---------- effective length and longitudinal modes (§3.2–3.3) ---------- */

test("effective length L_e = L + (n − 1)·l", () => {
  assertClose(call("effectiveLength", { L: 0.3, l_g: 0.3, nGroup: 1 }), 0.3, 1e-12, "gas: L_e = L");
  // ruby: 10 cm rod with n = 1.76 in a 0.5 m cavity → 0.576 m (doc: 0.58 m)
  const ruby = call("effectiveLength", { L: 0.5, l_g: 0.1, nGroup: M.get("ruby").nGroup });
  assertClose(ruby, 0.58, 0.005 / 0.58, "ruby L_e, m");
  assertClose(ruby, 0.576, 1e-12, "ruby L_e exact");
});

test("§12: free spectral range of a 0.3 m cavity = 500 MHz, Δλ = λ²/2L", () => {
  const fsr = K.freeSpectralRange(0.3);
  assertClose(fsr / C.MHz, 500, 0.01, "Δν_FSR, MHz (499.65)");
  assertClose(fsr, C.c / 0.6, 1e-12, "c/2L");
  // As a wavelength difference (units.dlamFromDnu): Δλ = λ²/2L = 0.667 pm
  const lam = 632.8 * C.nm;
  const dlam = U.dlamFromDnu({ dnu: fsr, lam: lam });
  assertClose(dlam, lam * lam / 0.6, 1e-12, "Δλ = λ²/2L");
  assertClose(dlam / 1e-12, 0.667, 0.0005 / 0.667, "Δλ, pm (0.6674)");
});

test("§3.3 table: free spectral range of ruby (0.576 m) and the diode (300 µm, n_g = 4)", () => {
  const rubyFsr = K.freeSpectralRange(call("effectiveLength", { L: 0.5, l_g: 0.1, nGroup: 1.76 }));
  assertClose(rubyFsr / C.MHz, 260, 5 / 260, "ruby, MHz (260.2)");

  const diode = M.get("diode");
  const L_e = call("effectiveLength", { L: 300 * C.um, l_g: 300 * C.um, nGroup: diode.nGroup });
  assertClose(L_e / 1e-3, 1.2, 0.05 / 1.2, "diode L_e, mm");
  assertClose(K.freeSpectralRange(L_e) / C.GHz, 125, 0.5 / 125, "diode, GHz (124.9)");
});

test("§3.3 table: modes under the gain curve — He-Ne ~3, ruby ~10³, diode ~10²", () => {
  function modes(id, L, l_g) {
    const m = M.get(id);
    const L_e = call("effectiveLength", { L: L, l_g: l_g, nGroup: m.nGroup });
    return call("modeCount", { bandwidth: m.dnu, fsr: K.freeSpectralRange(L_e) });
  }
  const hene = modes("he-ne", 0.3, 0.3);          // 3.0
  assert.ok(hene > 2.5 && hene < 3.5, "He-Ne " + hene);
  // "~10ᵏ": within half a decade, 10^(k−0.5) to 10^(k+0.5)
  const ruby = modes("ruby", 0.5, 0.1);           // 1268
  assert.ok(ruby > Math.pow(10, 2.5) && ruby < Math.pow(10, 3.5), "ruby " + ruby);
  const diode = modes("diode", 300 * C.um, 300 * C.um);   // 80
  assert.ok(diode > Math.pow(10, 1.5) && diode < Math.pow(10, 2.5), "diode " + diode);
});

test("§3.3: x = 2 in He-Ne (gain 0.1 m⁻¹, threshold 0.05 m⁻¹) oscillates over the whole Doppler width", () => {
  const he = M.get("he-ne");
  const x = 0.1 / 0.05;
  const band = S.oscillatingBandwidth({ broadening: he.broadening, dnu: he.dnu, x: x });
  assertClose(band, he.dnu, 1e-12, "Δν_osc = Δν_D at x = 2");
  const count = call("modeCount", { bandwidth: band, fsr: K.freeSpectralRange(0.3) });
  assert.ok(count > 2.5 && count < 3.5, "modes " + count);
});

/* ---------- finesse (§3.4) ---------- */

test("§3.4: finesse; for small losses Δν_FSR/F equals the cold-cavity linewidth", () => {
  const F = call("finesse", { refl1: 0.99, refl2: 0.98 });
  assertClose(F, Math.PI * Math.pow(0.99 * 0.98, 0.25) / (1 - Math.sqrt(0.99 * 0.98)), 1e-12, "formula");
  assertClose(F, 207.7, 0.0005, "He-Ne F");
  const fsr = K.freeSpectralRange(0.3);
  const tau_c = call("photonLifetime", { L_e: 0.3, gamma: call("singlePassLoss", HENE) });
  assertClose(fsr / F, K.coldLinewidth(tau_c), 1e-3, "Δν_FSR/F vs Δν_c");
});

/* ---------- output power (§3.6) ---------- */

const HENE_ISAT = M.get("he-ne").I_sat;
const AREA = 1e-6;                     // 1 mm² mode area

test("low-gain Rigrod: a case worked by hand", () => {
  // 2g₀l = 0.06 and T + L_i = 0.03, so the bracket is 2 − 1 = 1:
  // P_out = A·T·I_sat/2
  const P = call("rigrodLowGain", { g0: 0.1, l_g: 0.3, T_oc: 0.02, L_i: 0.01, I_sat: HENE_ISAT, area: AREA });
  assertClose(P, AREA * 0.02 * HENE_ISAT / 2, 1e-12, "P_out, W");
});

test("below threshold there is no output: 0 W, never a negative power", () => {
  // 2g₀l = 0.02 < T + L_i = 0.03
  assert.equal(call("rigrodLowGain", { g0: 0.1, l_g: 0.1, T_oc: 0.02, L_i: 0.01, I_sat: 1, area: 1 }), 0);
  // g₀l = 0.3 < ln(1/√0.5) = 0.347
  assert.equal(call("rigrodExact", { g0: 3, l_g: 0.1, refl1: 1, refl2: 0.5, I_sat: 1, area: 1 }), 0);
  // an absorbing medium
  assert.equal(call("rigrodLowGain", { g0: -1, l_g: 0.1, T_oc: 0.02, L_i: 0.01, I_sat: 1, area: 1 }), 0);
  assert.equal(call("rigrodExact", { g0: -1, l_g: 0.1, refl1: 1, refl2: 0.5, I_sat: 1, area: 1 }), 0);
});

// The exact Rigrod formula, checked without trusting it: light is followed
// both ways through the rod, dI±/dz = ±g·I± with g = g₀/(1 + (I₊ + I₋)/I_sat)
// (homogeneous saturation, standing-wave fringes averaged out), and the
// starting intensity is searched for until the mirrors close the loop:
// I₊(0) = R₁·I₋(0) and I₋(l) = R₂·I₊(l). Output: (1 − R₂)·I₊(l).
function rigrodByIntegration(g0, l, R1, R2, Isat) {
  function travel(start) {
    let forward = start;
    let backward = start / R1;
    const steps = 2000;
    const h = l / steps;
    const slope = (f, b) => {
      const g = g0 / (1 + (f + b) / Isat);
      return [g * f, -g * b];
    };
    for (let i = 0; i < steps; i++) {          // classic 4th-order Runge–Kutta
      const k1 = slope(forward, backward);
      const k2 = slope(forward + h / 2 * k1[0], backward + h / 2 * k1[1]);
      const k3 = slope(forward + h / 2 * k2[0], backward + h / 2 * k2[1]);
      const k4 = slope(forward + h * k3[0], backward + h * k3[1]);
      forward += h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
      backward += h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    }
    return { forward, backward };
  }
  // Too little light comes back stronger than R₂ lets through, too much
  // comes back weaker; halve the gap (on a log scale) until they meet.
  let low = Math.log(1e-12 * Isat);
  let high = Math.log(1e6 * Isat);
  for (let i = 0; i < 100; i++) {
    const middle = (low + high) / 2;
    const end = travel(Math.exp(middle));
    if (end.backward < R2 * end.forward) low = middle;
    else high = middle;
  }
  return (1 - R2) * travel(Math.exp((low + high) / 2)).forward;
}

test("exact Rigrod agrees with following the light through the rod numerically", () => {
  const cases = [
    { g0: 20, l_g: 0.1, refl1: 0.8, refl2: 0.3 },       // high gain, lossy mirrors
    { g0: 10, l_g: 0.1, refl1: 1, refl2: 0.5 },         // ruby-like
    { g0: 0.1, l_g: 0.3, refl1: 0.99, refl2: 0.98 },    // He-Ne-like
    { g0: 2, l_g: 0.5, refl1: 0.95, refl2: 0.6 }
  ];
  for (const c of cases) {
    const P = call("rigrodExact", Object.assign({ I_sat: 1, area: 1 }, c));
    const expected = rigrodByIntegration(c.g0, c.l_g, c.refl1, c.refl2, 1);
    assertClose(P, expected, 1e-6, JSON.stringify(c));
  }
});

test("output power scales with mode area and I_sat", () => {
  const base = { g0: 10, l_g: 0.1, refl1: 0.9, refl2: 0.5, I_sat: 2e7, area: 1e-6 };
  const P = call("rigrodExact", base);
  assertClose(call("rigrodExact", Object.assign({}, base, { area: 3e-6 })), 3 * P, 1e-12, "area");
  assertClose(call("rigrodExact", Object.assign({}, base, { I_sat: 4e7 })), 2 * P, 1e-12, "I_sat");
  const low = { g0: 0.1, l_g: 0.3, T_oc: 0.02, L_i: 0.01, I_sat: 2e7, area: 1e-6 };
  const p = call("rigrodLowGain", low);
  assertClose(call("rigrodLowGain", Object.assign({}, low, { area: 3e-6 })), 3 * p, 1e-12, "area, low gain");
});

test("§12: exact Rigrod → low-gain Rigrod as T → 0 (R₁ = 1, L_i = 0)", () => {
  const g0 = 0.1;
  const l_g = 0.3;
  let previous = Infinity;
  for (const T_oc of [1e-2, 1e-3, 1e-4]) {
    const exact = call("rigrodExact", { g0, l_g, refl1: 1, refl2: 1 - T_oc, I_sat: 1, area: 1 });
    const low = call("rigrodLowGain", { g0, l_g, T_oc, L_i: 0, I_sat: 1, area: 1 });
    const difference = Math.abs(exact / low - 1);
    // They differ by about (T²/4)/(g₀l − T/2): 1.0×10⁻³ at T = 10⁻², 8.5×10⁻⁶
    // at T = 10⁻³ (g₀l = 0.03). 20·T² is above that for every T here.
    assert.ok(difference < T_oc * T_oc * 20, "T = " + T_oc + ": differ by " + difference);
    assert.ok(difference < previous / 50, "the gap must shrink like T²");
    previous = difference;
  }
});

test("exact and low-gain Rigrod agree when every loss is small (R₁ = 1 − L_i)", () => {
  const T_oc = 0.002;
  const L_i = 0.001;
  const exact = call("rigrodExact", { g0: 0.005 / 0.3, l_g: 0.3, refl1: 1 - L_i, refl2: 1 - T_oc, I_sat: 1, area: 1 });
  const low = call("rigrodLowGain", { g0: 0.005 / 0.3, l_g: 0.3, T_oc, L_i, I_sat: 1, area: 1 });
  // first-order agreement: off by about (T + L_i)/2 relative
  assertClose(exact, low, (T_oc + L_i) / 2, "P_out");
});

test("D8: ruby's output uses I_sat = hν/(2στ), the three-level value", () => {
  const ruby = M.get("ruby");
  const P = call("rigrodExact", { g0: 10, l_g: 0.1, refl1: 1, refl2: 0.5, I_sat: ruby.I_sat, area: 1e-4 });
  // R₁ = 1 makes the mirror factor exactly 1: I_out = I_sat·(g₀l − ½ ln 2)
  const hv = ruby.photonEnergy;
  const expected = 1e-4 * hv / (2 * ruby.sigma * ruby.tau) * (10 * 0.1 - 0.5 * Math.LN2);
  assertClose(P, expected, 1e-12, "P_out, W");
});

test("optimum coupler T_opt = √(2g₀l·L_i) − L_i really gives the most power", () => {
  const g0 = 0.1;
  const l_g = 0.3;                    // g₀l = 0.03
  const L_i = 0.02;
  const T_opt = call("optimumCoupler", { g0, l_g, L_i });
  assertClose(T_opt, 0.0146410161513775, 1e-12, "T_opt");
  // scan the coupler from 0 to 5 % in steps of 10⁻⁶
  let bestT = 0;
  let bestP = -1;
  for (let i = 0; i <= 50000; i++) {
    const T_oc = i * 1e-6;
    const P = call("rigrodLowGain", { g0, l_g, T_oc, L_i, I_sat: 1, area: 1 });
    if (P > bestP) {
      bestP = P;
      bestT = T_oc;
    }
  }
  assertClose(bestT, T_opt, 0, "the scan's best T", 1e-6);
});

test("T_opt: when the low-gain formula asks for T ≥ 1 it does not hold, and that is said, not hidden", () => {
  // √(2·10·0.2) − 0.2 = 1.8: a "coupler" that would be no mirror at all
  assert.throws(() => call("optimumCoupler", { g0: 100, l_g: 0.1, L_i: 0.2 }), /too high for the low-gain formula/);
  // below 1 it is still answered: √0.1 − 0.2 = 0.116
  assertClose(call("optimumCoupler", { g0: 2.5, l_g: 0.1, L_i: 0.2 }), Math.sqrt(0.1) - 0.2, 1e-12, "T_opt");
});

test("a medium that fills the cavity is accepted despite float rounding", () => {
  assertClose(call("effectiveLength", { L: 0.7 - 0.4, l_g: 0.3, nGroup: 2 }), 0.6, 1e-12, "L_e");
});

test("no coupler helps a laser that cannot start: T_opt = 0 when 2g₀l ≤ L_i", () => {
  assert.equal(call("optimumCoupler", { g0: 0.01, l_g: 0.3, L_i: 0.01 }), 0);
  assert.equal(call("optimumCoupler", { g0: -1, l_g: 0.3, L_i: 0.01 }), 0);
});

test("with no other loss there is no best coupler: L_i = 0 is refused, not answered with 0", () => {
  // P_out = A·I_sat·(g₀l − T/2) then only grows as T shrinks.
  assert.throws(() => call("optimumCoupler", { g0: 0.1, l_g: 0.3, L_i: 0 }), /L_i must be above 0/);
  // ...unless the laser cannot start at all: then the answer is 0, as for any L_i (doc §3.6)
  assert.equal(call("optimumCoupler", { g0: -1, l_g: 0.3, L_i: 0 }), 0);
});

/* ---------- end face (§12) ---------- */

test("§12: a ruby end face (n = 1.76) reflects 7.6 % at normal incidence", () => {
  assertClose(K.faceReflectivity(1.76), 0.076, 0.0005 / 0.076, "R");
  assertClose(K.faceReflectivity(1.5), 0.04, 1e-12, "glass, 4 %");
  assertClose(K.faceReflectivity(1), 0, 0, "no step in index", 1e-15);
});

/* ---------- inputs ---------- */

test("a missing or impossible value is refused with its name", () => {
  assert.throws(() => call("thresholdGain", { refl1: 0.99, alpha_i: 0, l_g: 0.3 }), /refl2 must be a finite number/);
  assert.throws(() => call("thresholdGain", { refl1: 1.2, refl2: 0.9, alpha_i: 0, l_g: 0.3 }), /refl1 must be a finite number above 0 and at most 1/);
  assert.throws(() => call("thresholdGain", { refl1: 0, refl2: 0.9, alpha_i: 0, l_g: 0.3 }), /refl1 must be a finite number above 0 and at most 1/);
  assert.throws(() => call("thresholdGain", { refl1: 1, refl2: 0.9, alpha_i: -1, l_g: 0.3 }), /alpha_i must be a finite number of at least 0/);
  assert.throws(() => call("thresholdGain", { refl1: 1, refl2: 0.9, alpha_i: 0, l_g: 0 }), /l_g must be a positive finite number/);
  assert.throws(() => call("effectiveLength", { L: 0.3, l_g: 0.3, nGroup: 0.5 }), /nGroup must be a finite number of at least 1/);
  assert.throws(() => call("effectiveLength", { L: 0.3, l_g: 0.4, nGroup: 1.5 }), /l_g must not be longer than L/);
  assert.throws(() => call("photonLifetime", { L_e: 0.3, gamma: 0 }), /gamma must be a positive finite number/);
  assert.throws(() => call("rigrodLowGain", { g0: 0.1, l_g: 0.3, T_oc: 1.5, L_i: 0, I_sat: 1, area: 1 }), /T_oc must be a finite number from 0 to 1/);
  assert.throws(() => call("rigrodLowGain", { g0: 0.1, l_g: 0.3, T_oc: 0.02, L_i: 0, I_sat: 1, area: "1" }), /area must be a positive finite number/);
  assert.throws(() => call("modeCount", { bandwidth: -1, fsr: 1e9 }), /bandwidth must be a finite number of at least 0/);
  assert.throws(() => K.thresholdGain(), /needs one object of named values/);
  assert.throws(() => K.thresholdGain(0.99, 0.98), /needs one object of named values/);
  assert.throws(() => K.freeSpectralRange(0), /L_e must be a positive finite number/);
  assert.throws(() => K.faceReflectivity(0.5), /n must be a finite number of at least 1/);
  // errors name the function that was called, not a helper it uses
  assert.throws(() => call("thresholdGain", { refl1: 2, refl2: 0.9, alpha_i: 0, l_g: 0.3 }),
    /^Error: LaserEngine\.cavity\.thresholdGain: refl1/);
});

test("a cavity with no loss at all is refused: its finesse, τ_c and power would be infinite", () => {
  const lossless = { refl1: 1, refl2: 1, alpha_i: 0, l_g: 0.1 };
  assert.throws(() => call("singlePassLoss", lossless), /singlePassLoss: this cavity has no loss at all/);
  assert.throws(() => call("thresholdGain", lossless), /thresholdGain: this cavity has no loss at all/);
  assert.throws(() => call("finesse", { refl1: 1, refl2: 1 }), /no loss at all/);
  assert.throws(() => call("rigrodExact", { g0: 1, l_g: 0.1, refl1: 1, refl2: 1, I_sat: 1, area: 1 }), /no loss at all/);
  assert.throws(() => call("rigrodLowGain", { g0: 1, l_g: 0.1, T_oc: 0, L_i: 0, I_sat: 1, area: 1 }), /no loss at all/);
});

test("effectiveLength takes nGroup, so the phase index n cannot be passed by mistake (D5)", () => {
  assert.throws(() => call("effectiveLength", { L: 300 * C.um, l_g: 300 * C.um, n: 3.6 }),
    /n is not one of its inputs \(L, l_g, nGroup\)/);
});

test("a loss a formula does not use is refused instead of quietly ignored", () => {
  const ruby = { g0: 3.6, l_g: 0.1, refl1: 1, refl2: 0.5, I_sat: 1, area: 1 };
  assert.throws(() => call("rigrodExact", Object.assign({ alpha_i: 0.5 }, ruby)), /alpha_i is not one of its inputs/);
  assert.throws(() => call("rigrodExact", Object.assign({ L_i: 0.01 }, ruby)), /L_i is not one of its inputs/);
  assert.throws(() => call("finesse", { refl1: 0.99, refl2: 0.98, alpha_i: 0.05 }), /alpha_i is not one of its inputs/);
  assert.throws(() => call("finesse", { refl1: 0.99, refl2: 0.98, L_i: 0.05 }), /L_i is not one of its inputs/);
  assert.throws(() => call("rigrodLowGain", { g0: 0.1, l_g: 0.3, T_oc: 0.02, L_i: 0.01, alpha_i: 5, I_sat: 1, area: 1 }),
    /alpha_i is not one of its inputs/);
  assert.throws(() => call("thresholdGain", Object.assign({ L_i: 0.02 }, HENE)), /L_i is not one of its inputs/);
  // and a misspelt name
  assert.throws(() => call("thresholdGain", { refl1: 0.99, refl2: 0.98, alpha: 0, l_g: 0.3 }), /alpha is not one of its inputs/);
});

test("tiny reflectivities do not round the loss to infinity", () => {
  // ½·ln(1/(10⁻²⁰⁰·10⁻²⁰⁰)) = 200·ln 10 = 460.5; the product itself is 0 in floating point
  assertClose(call("singlePassLoss", { refl1: 1e-200, refl2: 1e-200, alpha_i: 0, l_g: 1 }), 200 * Math.LN10, 1e-12, "γ");
});

test("the cavity object cannot be changed by accident", () => {
  assert.ok(Object.isFrozen(K));
});
