/* ============================================================================
   spectrum.test.js — js/laser/engine/spectrum.js against
   docs/laser-physics.md §1, §3.3 and the first row of §12.

   Functions with more than one input take one object of named values; the
   tests pass it deep-frozen, so a function that changed it would throw.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine, plain, deepFreeze, assertClose } = require("./helpers.js");

const { constants: C, spectrum: S } = loadEngine();

// Calls S[name] with a deep-frozen copy of params.
function call(name, params) {
  return S[name](deepFreeze(Object.assign({}, params)));
}

/* ---------- thermal equilibrium (§1, §12) ---------- */

test("§12: stimulated beats spontaneous only above 69 µm at 300 K", () => {
  assertClose(S.crossoverLam(300) / C.um, 69, 0.01, "λ at 300 K, µm");
});

test("§12: ...and only above 3.8×10⁴ K for green light (550 nm)", () => {
  assertClose(S.crossoverT(550 * C.nm), 3.8e4, 0.01, "T at 550 nm, K");
});

test("the ratio is exactly 1 at the crossover", () => {
  assertClose(call("stimulatedToSpontaneous", { lam: S.crossoverLam(300), T: 300 }), 1, 1e-9, "at 300 K");
  assertClose(call("stimulatedToSpontaneous", { lam: 550 * C.nm, T: S.crossoverT(550 * C.nm) }), 1, 1e-9, "at 550 nm");
});

test("visible light from a 300 K source is almost all spontaneous", () => {
  const ratio = call("stimulatedToSpontaneous", { lam: 550 * C.nm, T: 300 });
  assert.ok(ratio > 0 && ratio < 1e-30, "ratio was " + ratio);
});

test("far infrared at 300 K is mostly stimulated", () => {
  assert.ok(call("stimulatedToSpontaneous", { lam: 1e-3, T: 300 }) > 1);   // 1 mm
});

test("§1: Boltzmann N₂/N₁ for ruby at 300 K is about 10⁻³⁰", () => {
  const ratio = call("boltzmannRatio", { lam: 694 * C.nm, T: 300, deg1: 1, deg2: 1 });
  assert.ok(ratio > 1e-31 && ratio < 1e-29, "ratio was " + ratio);
});

test("Boltzmann ratio uses the degeneracies g₂/g₁", () => {
  const plainRatio = call("boltzmannRatio", { lam: 694 * C.nm, T: 300, deg1: 1, deg2: 1 });
  assertClose(call("boltzmannRatio", { lam: 694 * C.nm, T: 300, deg1: 2, deg2: 4 }), 2 * plainRatio, 1e-12, "g₂/g₁ = 2");
});

test("long wavelengths: the ratio stays accurate when hν ≪ kT", () => {
  // For small x = hν/kT, 1/(eˣ − 1) = 1/x − 1/2 + x/12 − ...  Plain
  // exp(x) − 1 loses about 10 digits here; Math.expm1 does not.
  const x = 1e-6;
  const T = 300;
  const lam = C.h * C.c / (x * C.k * T);
  assertClose(call("stimulatedToSpontaneous", { lam, T }), 1 / x - 0.5 + x / 12, 1e-12, "series");
});

test("a temperature or wavelength of zero or less is refused", () => {
  assert.throws(() => call("stimulatedToSpontaneous", { lam: 500 * C.nm, T: -300 }), /T must be a positive finite number/);
  assert.throws(() => call("stimulatedToSpontaneous", { lam: 500 * C.nm, T: 0 }), /T must be a positive finite number/);
  assert.throws(() => call("stimulatedToSpontaneous", { lam: 0, T: 300 }), /lam must be a positive finite number/);
  assert.throws(() => S.crossoverLam(0), /T must be a positive finite number/);
  assert.throws(() => S.crossoverT(-1), /lam must be a positive finite number/);
  assert.throws(() => call("boltzmannRatio", { lam: 694 * C.nm, T: NaN, deg1: 1, deg2: 1 }), /T must be a positive finite number/);
});

test("infinite or non-number inputs are refused, not turned into 0 or Infinity", () => {
  assert.throws(() => S.crossoverLam(Infinity), /T must be a positive finite number/);
  assert.throws(() => call("stimulatedToSpontaneous", { lam: Infinity, T: 300 }), /lam must be a positive finite number/);
  assert.throws(() => S.crossoverT("550e-9"), /lam must be a positive finite number/);
  assert.throws(() => S.crossoverLam(true), /T must be a positive finite number/);
  assert.throws(() => S.crossoverLam([300]), /T must be a positive finite number/);
});

test("Boltzmann ratio refuses degeneracies that are missing or not positive numbers", () => {
  const lam = 694 * C.nm;
  assert.throws(() => call("boltzmannRatio", { lam, T: 300, deg1: 0, deg2: 1 }), /deg1 must be a positive finite number/);
  assert.throws(() => call("boltzmannRatio", { lam, T: 300, deg1: null, deg2: 1 }), /deg1 must be a positive finite number/);
  assert.throws(() => call("boltzmannRatio", { lam, T: 300, deg1: 1, deg2: -2 }), /deg2 must be a positive finite number/);
  assert.throws(() => call("boltzmannRatio", { lam, T: 300 }), /deg1 must be a positive finite number, got undefined/);
});

test("errors name the function that was called", () => {
  assert.throws(() => call("lineshape", { broadening: "homogeneous", nu: NaN, nu0: 1e14, dnu: 1e9 }),
    /^Error: LaserEngine\.spectrum\.lineshape: nu must be a finite number/);
  assert.throws(() => call("boltzmannRatio", { lam: 0, T: 300, deg1: 1, deg2: 1 }),
    /^Error: LaserEngine\.spectrum\.boltzmannRatio: lam/);
});

test("a function with several inputs refuses plain numbers instead of named values", () => {
  assert.throws(() => S.lorentzian(1e14, 1e14, 1e9), /needs one object of named values/);
  assert.throws(() => S.boltzmannRatio(694e-9, 300), /needs one object of named values/);
});

test("the spectrum object cannot be changed by accident", () => {
  assert.ok(Object.isFrozen(S));
});

/* ---------- lineshapes (§1) ---------- */

// Simpson's rule: the integral of f from a to b with n (even) steps.
function integrate(f, a, b, n) {
  const h = (b - a) / n;
  let sum = f(a) + f(b);
  for (let i = 1; i < n; i++) sum += (i % 2 === 1 ? 4 : 2) * f(a + i * h);
  return sum * h / 3;
}

const NU0 = 4.7e14;          // a visible line, Hz
const DNU = 1.5e9;           // its width, Hz

// The lineshapes are called many thousands of times in the integrals, so
// these call them directly, without copying and freezing each input.
const lorentzianAt = (nu) => S.lorentzian({ nu: nu, nu0: NU0, dnu: DNU });
const gaussianAt = (nu) => S.gaussian({ nu: nu, nu0: NU0, dnuD: DNU });

test("Lorentzian: peak 2/(πΔν), and its integral over ±X is (2/π)·atan(2X/Δν)", () => {
  assertClose(call("lorentzian", { nu: NU0, nu0: NU0, dnu: DNU }), 2 / (Math.PI * DNU), 1e-12, "peak");
  // The Lorentzian's tails are so long that ±1000 widths still miss 0.03 %,
  // so the test compares with the exact integral over the same range.
  const X = 1000 * DNU;
  const area = integrate(lorentzianAt, NU0 - X, NU0 + X, 400000);
  assertClose(area, (2 / Math.PI) * Math.atan(2 * X / DNU), 1e-9, "∫ over ±1000 Δν");
});

test("Gaussian: integrates to 1, and ĝ_G(ν₀)·Δν_D = 0.939 (§1)", () => {
  const area = integrate(gaussianAt, NU0 - 5 * DNU, NU0 + 5 * DNU, 20000);
  assertClose(area, 1, 1e-9, "∫ over ±5 Δν_D");
  const peakTimesWidth = call("gaussian", { nu: NU0, nu0: NU0, dnuD: DNU }) * DNU;
  // 0.939 in the doc; exactly 2·√(ln 2/π) = 0.93944
  assertClose(peakTimesWidth, 2 * Math.sqrt(Math.LN2 / Math.PI), 1e-12, "exact");
  assertClose(peakTimesWidth, 0.939, 0.0005 / 0.939, "doc value");
});

test("both lineshapes fall to half their peak at ν₀ ± Δν/2 (Δν is the full width)", () => {
  for (const shape of [lorentzianAt, gaussianAt]) {
    const peak = shape(NU0);
    assertClose(shape(NU0 + DNU / 2), peak / 2, 1e-12, "above");
    assertClose(shape(NU0 - DNU / 2), peak / 2, 1e-12, "below");
  }
});

test("lineshape() picks the Lorentzian for a homogeneous line, the Gaussian for an inhomogeneous one", () => {
  const nu = NU0 + 0.3 * DNU;
  assertClose(call("lineshape", { broadening: "homogeneous", nu, nu0: NU0, dnu: DNU }), lorentzianAt(nu), 1e-12, "hom");
  assertClose(call("lineshape", { broadening: "inhomogeneous", nu, nu0: NU0, dnu: DNU }), gaussianAt(nu), 1e-12, "inh");
  assert.throws(() => call("lineshape", { broadening: "Doppler", nu, nu0: NU0, dnu: DNU }),
    /broadening must be "homogeneous" or "inhomogeneous"/);
  assert.throws(() => call("lineshape", { broadening: null, nu, nu0: NU0, dnu: DNU }), /broadening must be/);
});

test("relativeGain is the lineshape divided by its peak: 1 at ν₀, ½ at ν₀ ± Δν/2", () => {
  for (const broadening of ["homogeneous", "inhomogeneous"]) {
    const at = (nu) => call("relativeGain", { broadening, nu, nu0: NU0, dnu: DNU });
    const shape = (nu) => call("lineshape", { broadening, nu, nu0: NU0, dnu: DNU });
    assertClose(at(NU0), 1, 1e-12, broadening + " centre");
    assertClose(at(NU0 + DNU / 2), 0.5, 1e-12, broadening + " half width");
    const nu = NU0 - 1.7 * DNU;
    assertClose(at(nu), shape(nu) / shape(NU0), 1e-12, broadening + " ratio");
  }
});

test("natural linewidth 1/(2πτ): ruby's 3 ms gives 53 Hz", () => {
  assertClose(S.naturalWidth(3e-3), 1 / (2 * Math.PI * 3e-3), 1e-12, "formula");
  assertClose(S.naturalWidth(3e-3), 53.05, 0.001, "Hz");
});

test("§1: Doppler width of neon (20 u) at 400 K, 632.8 nm ≈ 1.5 GHz", () => {
  const width = call("dopplerWidth", { nu0: C.c / (632.8 * C.nm), T: 400, M: 20 * C.u });
  // 1.5175 GHz; the doc gives 2 digits, so ±0.05 GHz
  assertClose(width, 1.5e9, 0.05 / 1.5, "Δν_D, Hz");
});

test("Doppler width grows as ν₀·√(T/M)", () => {
  const base = call("dopplerWidth", { nu0: 4e14, T: 300, M: 20 * C.u });
  assertClose(call("dopplerWidth", { nu0: 8e14, T: 300, M: 20 * C.u }), 2 * base, 1e-12, "double ν₀");
  assertClose(call("dopplerWidth", { nu0: 4e14, T: 1200, M: 20 * C.u }), 2 * base, 1e-12, "four times T");
  assertClose(call("dopplerWidth", { nu0: 4e14, T: 300, M: 80 * C.u }), base / 2, 1e-12, "four times M");
});

test("§1: ruby σ from A₂₁ at the Lorentzian peak ≈ 4×10⁻²⁴ m²", () => {
  const nu0 = C.c / (694.3 * C.nm);
  const peak = call("lorentzian", { nu: nu0, nu0, dnu: 330 * C.GHz });
  const sigma = call("crossSection", { A21: 1 / (3 * C.ms), lam0: 694.3 * C.nm, n: 1.76, lineshape: peak });
  // 3.98×10⁻²⁴; the doc gives 1 digit, so ±0.5×10⁻²⁴
  assertClose(sigma, 4e-24, 0.5 / 4, "σ, m²");
});

test("σ = A₂₁λ²ĝ/(8πn²): grows as λ², falls as 1/n²", () => {
  const base = { A21: 1e3, lam0: 500e-9, n: 1.5, lineshape: 1e-12 };
  const sigma = call("crossSection", base);
  assertClose(call("crossSection", Object.assign({}, base, { lam0: 1000e-9 })), 4 * sigma, 1e-12, "double λ");
  assertClose(call("crossSection", Object.assign({}, base, { n: 3 })), sigma / 4, 1e-12, "double n");
  assertClose(call("crossSection", Object.assign({}, base, { A21: 2e3 })), 2 * sigma, 1e-12, "double A");
  assertClose(sigma, 1e3 * 500e-9 * 500e-9 * 1e-12 / (8 * Math.PI * 1.5 * 1.5), 1e-12, "formula");
});

/* ---------- gain (§1) ---------- */

test("inversion ΔN = N₂ − (g₂/g₁)·N₁", () => {
  assertClose(call("inversion", { N1: 3e24, N2: 5e24, deg1: 1, deg2: 1 }), 2e24, 1e-12, "equal degeneracies");
  assertClose(call("inversion", { N1: 3e24, N2: 5e24, deg1: 2, deg2: 4 }), 5e24 - 2 * 3e24, 1e-12, "g₂/g₁ = 2");
  assertClose(call("inversion", { N1: 1e24, N2: 1e24, deg1: 1, deg2: 1 }), 0, 0, "equal populations", 1);
});

test("§1: in Boltzmann equilibrium the gain is negative — the medium absorbs", () => {
  const N1 = 1e25;
  for (const [deg1, deg2] of [[1, 1], [2, 4], [4, 2]]) {
    const N2 = N1 * call("boltzmannRatio", { lam: 694 * C.nm, T: 300, deg1, deg2 });
    const dN = call("inversion", { N1, N2, deg1, deg2 });
    const g = call("gainCoefficient", { sigma: 2.5e-24, dN });
    assert.ok(g < 0, "g₁ = " + deg1 + ", g₂ = " + deg2 + ": gain " + g);
  }
});

test("gain coefficient g = σ·ΔN", () => {
  assertClose(call("gainCoefficient", { sigma: 2.5e-24, dN: 1.386e24 }), 3.465, 1e-12, "ruby at threshold, m⁻¹");
  assertClose(call("gainCoefficient", { sigma: 2.5e-24, dN: -1e24 }), -2.5, 1e-12, "absorbing");
});

test("saturated gain at I = I_sat: g₀/2 for a homogeneous line, g₀/√2 for an inhomogeneous one", () => {
  const I_sat = 5e7;
  const gain = (broadening, I) => call("saturatedGain", { broadening, g0: 3, I, I_sat });
  assertClose(gain("homogeneous", I_sat), 1.5, 1e-12, "hom");
  assertClose(gain("inhomogeneous", I_sat), 3 / Math.SQRT2, 1e-12, "inh");
  assertClose(gain("homogeneous", 0), 3, 1e-12, "no light");
  assertClose(gain("homogeneous", 3 * I_sat), 0.75, 1e-12, "hom, I = 3 I_sat");
  assertClose(gain("inhomogeneous", 3 * I_sat), 1.5, 1e-12, "inh, I = 3 I_sat");
});

/* ---------- oscillating band and mode comb (§3.3) ---------- */

const band = (broadening, x) => call("oscillatingBandwidth", { broadening, dnu: DNU, x });

test("oscillating bandwidth: Δν√(x − 1) for a Lorentzian, Δν_D√(ln x/ln 2) for a Gaussian", () => {
  assertClose(band("homogeneous", 2), DNU, 1e-12, "hom x = 2");
  assertClose(band("homogeneous", 5), 2 * DNU, 1e-12, "hom x = 5");
  assertClose(band("inhomogeneous", 2), DNU, 1e-12, "inh x = 2");
  assertClose(band("inhomogeneous", 4), Math.SQRT2 * DNU, 1e-12, "inh x = 4");
});

test("at the edges of the oscillating band the gain is exactly at threshold", () => {
  // relativeGain(edge) · x = g₀(edge)/g_th = 1
  for (const broadening of ["homogeneous", "inhomogeneous"]) {
    for (const x of [1.3, 2, 7.5, 40]) {
      const edge = NU0 + band(broadening, x) / 2;
      const relative = call("relativeGain", { broadening, nu: edge, nu0: NU0, dnu: DNU });
      assertClose(relative * x, 1, 1e-9, broadening + " x = " + x);
    }
  }
});

test("at or below threshold (x ≤ 1) nothing oscillates: bandwidth 0, never NaN", () => {
  for (const broadening of ["homogeneous", "inhomogeneous"]) {
    for (const x of [1, 0.5, 0, -2]) {
      assert.equal(band(broadening, x), 0, broadening + " x = " + x);
    }
  }
});

test("mode comb: every line q·Δν_FSR inside the window, in order, none missing", () => {
  const fsr = C.c / (2 * 0.3);                         // He-Ne, 500 MHz
  const nu0 = C.c / (632.8 * C.nm);
  const nuLow = nu0 - 0.75 * C.GHz;
  const nuHigh = nu0 + 0.75 * C.GHz;
  const comb = plain(call("modeComb", { nuLow, nuHigh, fsr }));
  assert.equal(comb.length, 3, "a 1.5 GHz window holds 3 lines 500 MHz apart");
  for (const nu of comb) {
    assert.ok(nu >= nuLow && nu <= nuHigh, "line " + nu + " outside the window");
    const q = nu / fsr;
    assertClose(q, Math.round(q), 1e-12, "q is a whole number");
  }
  for (let i = 1; i < comb.length; i++) assertClose(comb[i] - comb[i - 1], fsr, 1e-6, "spacing");
  assert.ok(comb[0] - fsr < nuLow, "a line below the first one would be inside the window");
  assert.ok(comb[comb.length - 1] + fsr > nuHigh, "a line above the last one would be inside the window");
});

test("mode comb keeps a line that sits exactly on the window edge", () => {
  // Dividing q·fsr by fsr again does not always give back q exactly, and a
  // line on the edge must not be lost to that. Both cases were found by a
  // search (He-Ne and ruby combs).
  const heneFsr = C.c / 0.6;
  const lowEdge = 37127 * heneFsr;           // (q·fsr)/fsr = 37127.00000000001
  assert.ok(lowEdge / heneFsr > 37127, "the lower-edge case still rounds up");
  assert.equal(plain(call("modeComb", { nuLow: lowEdge, nuHigh: lowEdge + heneFsr / 2, fsr: heneFsr })).length, 1,
    "lower edge");
  const rubyFsr = C.c / (2 * 0.576);
  const highEdge = 1667909 * rubyFsr;        // (q·fsr)/fsr is a hair below 1667909
  assert.ok(highEdge / rubyFsr < 1667909, "the upper-edge case still rounds down");
  assert.equal(plain(call("modeComb", { nuLow: highEdge - rubyFsr / 2, nuHigh: highEdge, fsr: rubyFsr })).length, 1,
    "upper edge");
  assert.deepEqual(plain(call("modeComb", { nuLow: 0, nuHigh: 0.5, fsr: 1 })), [], "no mode at 0 Hz");
});

test("mode comb: an empty window gives no lines; a reversed or huge one is refused", () => {
  assert.deepEqual(plain(call("modeComb", { nuLow: 1.2e9, nuHigh: 1.3e9, fsr: 1e9 })), []);
  assert.throws(() => call("modeComb", { nuLow: 2e9, nuHigh: 1e9, fsr: 1e8 }), /nuHigh must not be below nuLow/);
  // Ti:sapphire's 100 THz line with a 300 MHz comb would be 3.3×10⁵ lines
  assert.throws(() => call("modeComb", { nuLow: 3.25e14, nuHigh: 4.25e14, fsr: 3e8 }), /more than 100000 lines/);
  // exactly at the limit is still allowed: q = 1 … 100000
  assert.equal(call("modeComb", { nuLow: 0.5, nuHigh: 100000.5, fsr: 1 }).length, 100000);
  assert.throws(() => call("modeComb", { nuLow: 0.5, nuHigh: 100001.5, fsr: 1 }), /more than 100000 lines/);
});

test("mode comb refuses mode numbers too large to count (no endless loop)", () => {
  assert.throws(() => call("modeComb", { nuLow: 1e15, nuHigh: 1e15 + 100, fsr: 0.01 }), /too large/);
  assert.throws(() => call("modeComb", { nuLow: 1e308, nuHigh: 1e308, fsr: 1e-10 }), /too large/);
  // the last mode number checked is one past the window: 2^53 here
  assert.throws(() => call("modeComb", { nuLow: 9007199254740981, nuHigh: 9007199254740991, fsr: 1 }), /too large/);
});

test("the 100000-line limit counts the lines really returned, edge lines included", () => {
  // q = 37127 … 137127: 100001 lines. nuLow/fsr rounds up past 37127, so a
  // count made from nuLow/fsr alone would see only 100000.
  const fsr = C.c / 0.6;
  assert.throws(() => call("modeComb", { nuLow: 37127 * fsr, nuHigh: 137127 * fsr, fsr }), /more than 100000 lines/);
});

test("a name the function does not use is refused", () => {
  assert.throws(() => call("lorentzian", { nu: NU0, nu0: NU0, dnu: DNU, dnuD: DNU }), /dnuD is not one of its inputs/);
});

test("the new functions refuse impossible inputs", () => {
  assert.throws(() => call("lorentzian", { nu: NU0, nu0: NU0, dnu: 0 }), /dnu must be a positive finite number/);
  assert.throws(() => call("gaussian", { nu: NU0, nu0: -NU0, dnuD: DNU }), /nu0 must be a positive finite number/);
  assert.throws(() => call("gaussian", { nu: NaN, nu0: NU0, dnuD: DNU }), /nu must be a finite number/);
  assert.throws(() => call("gaussian", { nu: NU0, nu0: NU0, dnu: DNU }), /dnu is not one of its inputs \(nu, nu0, dnuD\)/);
  assert.throws(() => call("gaussian", { nu: NU0, nu0: NU0 }), /dnuD must be a positive finite number, got undefined/);
  assert.throws(() => call("dopplerWidth", { nu0: NU0, T: 0, M: 20 * C.u }), /T must be a positive finite number/);
  assert.throws(() => call("dopplerWidth", { nu0: NU0, T: 300, M: 0 }), /M must be a positive finite number/);
  assert.throws(() => call("crossSection", { A21: 1e3, lam0: 500e-9, n: 1.5, lineshape: -1 }), /lineshape must be a finite number of at least 0/);
  assert.throws(() => call("crossSection", { A21: 1e3, lam0: 500e-9, n: 0.5, lineshape: 1 }), /n must be a finite number of at least 1/);
  assert.throws(() => call("inversion", { N1: -1, N2: 1, deg1: 1, deg2: 1 }), /N1 must be a finite number of at least 0/);
  assert.throws(() => call("inversion", { N1: 1, N2: 1, deg1: 0, deg2: 1 }), /deg1 must be a positive finite number/);
  assert.throws(() => call("gainCoefficient", { sigma: 2.5e-24, dN: Infinity }), /dN must be a finite number/);
  assert.throws(() => call("saturatedGain", { broadening: "homogeneous", g0: 3, I: -1, I_sat: 5e7 }), /I must be a finite number of at least 0/);
  assert.throws(() => call("saturatedGain", { broadening: "homogeneous", g0: 3, I: 1, I_sat: 0 }), /I_sat must be a positive finite number/);
  assert.throws(() => call("saturatedGain", { broadening: "both", g0: 3, I: 1, I_sat: 1 }), /broadening must be/);
  assert.throws(() => call("oscillatingBandwidth", { broadening: "homogeneous", dnu: DNU, x: NaN }), /x must be a finite number/);
  assert.throws(() => call("modeComb", { nuLow: 1e9, nuHigh: 2e9, fsr: 0 }), /fsr must be a positive finite number/);
});
