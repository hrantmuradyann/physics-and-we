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
  assertClose(U.dnuFromDlam({ dlam: 1 * C.nm, lam: 1 * C.um }), 2.99792e11, 1e-5, "Δν");
  const dnu = U.dnuFromDlam({ dlam: 3 * C.nm, lam: 800 * C.nm });
  assertClose(U.dlamFromDnu({ dnu: dnu, lam: 800 * C.nm }), 3 * C.nm, 1e-12, "round trip");
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
  assertClose(U.n2FromEsu({ n2esu: 2e-11, n0: 1.62 }), expected, 1e-12, "CS₂");
  assertClose(U.n2FromEsu({ n2esu: 2e-11, n0: 1.62 }), 1.035e-17, 0.001, "CS₂, rounded");
});

test("every unit factor equals its definition", () => {
  // Typed here as plain powers of ten, independently of constants.js.
  // Compared with a tolerance: 230 * 1e-6 is 0.00022999999999999998 in
  // floating point, not exactly 230e-6.
  const expected = {
    ms: 1e-3, us: 1e-6, ns: 1e-9,
    MHz: 1e6, GHz: 1e9, THz: 1e12,
    nm: 1e-9, um: 1e-6, mm: 1e-3, cm: 1e-2, mm2: 1e-6, cm2: 1e-4, cm3: 1e-6, mA: 1e-3,
    erg: 1e-7, dynPerCm2: 0.1, eV: 1.602176634e-19,
    mmHg: 133.322387415, atm: 101325
  };
  for (const [name, value] of Object.entries(expected)) {
    assertClose(C[name], value, 1e-12, name);
  }
  assertClose(230 * C.us, 230e-6, 1e-12, "230 µs");
});

test("conversions refuse missing or impossible inputs", () => {
  assert.throws(() => U.nuFromLam(0), /^Error: LaserEngine\.units\.nuFromLam: lam must be a positive finite number/);
  assert.throws(() => U.photonEnergy(-1), /lam must be a positive finite number/);
  assert.throws(() => U.lamFromEV(NaN), /energyEV must be a positive finite number/);
  assert.throws(() => U.hzFromWavenumber(Infinity), /perCm must be a finite number/);
  assert.throws(() => U.dnuFromDlam({ dlam: 1e-9 }), /lam must be a positive finite number, got undefined/);
  assert.throws(() => U.dlamFromDnu({ dnu: -1, lam: 1e-6 }), /dnu must be a finite number of at least 0/);
  assert.throws(() => U.n2FromEsu({ n2esu: 2e-11, n0: 0.5 }), /n0 must be a finite number of at least 1/);
});

test("conversions with two inputs take named values, so the two cannot be swapped", () => {
  assert.throws(() => U.dnuFromDlam(1e-9, 1e-6), /needs one object of named values/);
  assert.throws(() => U.n2FromEsu(2e-11, 1.62), /needs one object of named values/);
});

test("wavenumbers may be 0 or negative: a difference between two levels can be either", () => {
  assert.equal(U.hzFromWavenumber(0), 0);
  assertClose(U.hzFromWavenumber(-1), -U.hzFromWavenumber(1), 1e-12, "Hz");
  assertClose(U.eVFromWavenumber(-2000), -U.eVFromWavenumber(2000), 1e-12, "eV");
});
