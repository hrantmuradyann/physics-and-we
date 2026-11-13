/* ============================================================================
   constants.test.js — js/laser/engine/constants.js against
   docs/laser-physics.md §13.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine, assertClose } = require("./helpers.js");

const { constants: C, units: U } = loadEngine();

test("constants match the table in §13", () => {
  // The doc gives six significant figures, so 1e-5 is the right tolerance.
  assertClose(C.h, 6.62607e-34, 1e-5, "h");
  assertClose(C.hbar, 1.05457e-34, 1e-5, "ħ");
  assertClose(C.c, 2.99792e8, 1e-5, "c");
  assertClose(C.k, 1.38065e-23, 1e-5, "k");
  assertClose(C.e, 1.60218e-19, 1e-5, "e");
  assertClose(C.eps0, 8.85419e-12, 1e-5, "ε₀");
  assertClose(C.u, 1.66054e-27, 1e-5, "u");
});

test("constants cannot be changed by accident", () => {
  assert.ok(Object.isFrozen(C));
  assert.ok(Object.isFrozen(U));
});

test("λ [nm] = 1239.84 / E [eV]", () => {
  assertClose(U.lamFromEV(1) / C.nm, 1239.84, 1e-5, "1 eV");
  // GaAs band gap 1.42 eV -> ~870 nm (§5.7)
  assertClose(U.lamFromEV(1.42) / C.nm, 873, 0.01, "GaAs");
  assertClose(U.eVFromLam(U.lamFromEV(2.5)), 2.5, 1e-12, "round trip");
});

test("wavenumbers: 1 cm⁻¹ ≈ 1.2398×10⁻⁴ eV ≈ 30 GHz", () => {
  assertClose(U.eVFromWavenumber(1), 1.2398e-4, 1e-4, "eV");
  assertClose(U.hzFromWavenumber(1), 30e9, 0.001, "Hz");
});

test("kT at 300 K ≈ 0.0259 eV ≈ 208 cm⁻¹", () => {
  const kT = C.k * 300;
  assertClose(kT / C.eV, 0.0259, 0.002, "eV");
  // The exact value is 208.5; the doc rounds it to "≈ 208".
  assertClose(kT / (C.h * C.c * 100), 208, 0.005, "cm⁻¹");
});

test("frequency and wavelength", () => {
  assertClose(U.nuFromLam(632.8 * C.nm), 4.7376e14, 1e-4, "He-Ne frequency");
  assertClose(U.lamFromNu(U.nuFromLam(1064 * C.nm)), 1064 * C.nm, 1e-12, "round trip");
  assertClose(U.photonEnergy(1064 * C.nm) / C.eV, 1.1653, 1e-4, "Nd:YAG photon, eV");
});

test("linewidth: Δν = c·Δλ/λ²", () => {
  // 1 nm wide at 1 µm is 300 GHz
  assertClose(U.dnuFromDlam(1 * C.nm, 1 * C.um), 2.99792e11, 1e-5, "Δν");
  assertClose(U.dlamFromDnu(U.dnuFromDlam(3 * C.nm, 800 * C.nm), 800 * C.nm),
    3 * C.nm, 1e-12, "round trip");
});

test("Gaussian (CGS) units -> SI", () => {
  assert.equal(C.erg, 1e-7);
  assertClose(C.statvoltPerCm, 3e4, 0.001, "1 statvolt/cm ≈ 300 V/cm");
  assertClose(C.atm / C.dynPerCm2, 1.013e6, 0.001, "1 atm in dyn/cm²");
  assertClose(C.mmHg, 133.3, 0.001, "1 mm Hg");
  assertClose(C.atm, 1.013e5, 0.001, "1 atm");
});

test("nonlinear index n₂: esu -> m²/W", () => {
  // Worked by hand from §13: n₂ᴵ = 8π·n₂/(c·n₀) cm²·s/erg, ×10³ -> m²/W.
  // CS₂ values from §12: n₂ = 2×10⁻¹¹ esu, n₀ = 1.62.
  const expected = 8 * Math.PI * 2e-11 / (2.99792458e10 * 1.62) * 1e3;
  assertClose(U.n2FromEsu(2e-11, 1.62), expected, 1e-12, "CS₂");
  assertClose(U.n2FromEsu(2e-11, 1.62), 1.035e-17, 0.001, "CS₂, rounded");
});

test("time and frequency units", () => {
  // Compared with a tolerance: 230 * 1e-6 is 0.00022999999999999998 in
  // floating point, not exactly 230e-6.
  assertClose(230 * C.us, 230e-6, 1e-12, "µs");
  assertClose(3 * C.ms, 3e-3, 1e-12, "ms");
  assertClose(10 * C.ns, 10e-9, 1e-12, "ns");
  assertClose(50 * C.MHz, 50e6, 1e-12, "MHz");
  assertClose(120 * C.GHz, 120e9, 1e-12, "GHz");
  assertClose(10 * C.THz, 10e12, 1e-12, "THz");
});
