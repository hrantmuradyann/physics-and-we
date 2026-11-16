/* ============================================================================
   constants.js — physical constants and unit conversions for the laser engine.

   PART OF THE LASER ENGINE (js/laser/engine/). Every engine file follows
   the same rules, so the physics can be tested without a browser:
     · plain numbers and plain objects in and out, SI units everywhere
     · nothing here draws, touches the page or remembers anything between calls
     · names follow the "code name" column of docs/laser-physics.md §0

   Needs check.js to be loaded first.

   Values: docs/laser-physics.md §13 (CODATA 2018 — h, c, k and e are exact
   by definition since 2019).
   Tests:  tests/laser/constants.test.js   (run all engine tests:  node --test)
   ========================================================================== */
(function (root) {
  "use strict";

  var E = root.LaserEngine = root.LaserEngine || {};
  if (!E.check) {
    throw new Error("constants.js needs js/laser/engine/check.js to be loaded first.");
  }

  var h = 6.62607015e-34;        // Planck constant, J·s
  var c = 299792458;             // speed of light in vacuum, m/s
  var k = 1.380649e-23;          // Boltzmann constant, J/K
  var e = 1.602176634e-19;       // elementary charge, C (also: joules in 1 eV)
  var eps0 = 8.8541878128e-12;   // vacuum permittivity, F/m
  var u = 1.66053906660e-27;     // atomic mass unit, kg

  /* ---------- the numbers ---------- */

  E.constants = Object.freeze({
    h: h,
    hbar: h / (2 * Math.PI),
    c: c,
    k: k,
    e: e,
    eps0: eps0,
    u: u,

    // Units the book and the handbooks use, written in SI.
    // Multiply by one of these to get SI:  2.5e-20 * cm2  ->  m²
    eV: e,                       // J
    ms: 1e-3,                    // s
    us: 1e-6,                    // s  (µs)
    ns: 1e-9,                    // s
    ps: 1e-12,                   // s
    MHz: 1e6,                    // Hz
    GHz: 1e9,                    // Hz
    THz: 1e12,                   // Hz
    nm: 1e-9,                    // m
    um: 1e-6,                    // m
    mm: 1e-3,                    // m
    cm: 1e-2,                    // m
    mm2: 1e-6,                   // m²
    cm2: 1e-4,                   // m²
    cm3: 1e-6,                   // m³
    mA: 1e-3,                    // A
    erg: 1e-7,                   // J
    dynPerCm2: 0.1,              // Pa
    statvoltPerCm: c * 1e-4,     // V/m  (1 statvolt = 299.79 V, the book's "300 V/cm")
    mmHg: 133.322387415,         // Pa
    atm: 101325                  // Pa
  });

  /* ---------- conversions ---------- */
  // Every wavelength here is the wavelength in vacuum. Inputs are checked
  // (js/laser/engine/check.js): a missing or impossible value throws.

  var check = E.check;

  function at(functionName) {
    return "LaserEngine.units." + functionName;
  }

  E.units = Object.freeze({

    // Frequency of light of wavelength lam, Hz.
    nuFromLam: function (lam) {
      check.positive(at("nuFromLam"), "lam", lam);
      return c / lam;
    },

    // Wavelength of light of frequency nu, m.
    lamFromNu: function (nu) {
      check.positive(at("lamFromNu"), "nu", nu);
      return c / nu;
    },

    // Energy of one photon, J.
    photonEnergy: function (lam) {
      check.positive(at("photonEnergy"), "lam", lam);
      return h * c / lam;
    },

    // λ [nm] = 1239.84 / E [eV], written in SI: photon energy in eV -> m.
    lamFromEV: function (energyEV) {
      check.positive(at("lamFromEV"), "energyEV", energyEV);
      return h * c / (energyEV * e);
    },

    // Photon energy in eV for a wavelength in m.
    eVFromLam: function (lam) {
      check.positive(at("eVFromLam"), "lam", lam);
      return h * c / (lam * e);
    },

    // Linewidth in frequency from linewidth in wavelength: Δν = c·Δλ/λ².
    //   dnuFromDlam({ dlam: 1e-9, lam: 1e-6 })  ->  3.0e11 Hz
    dnuFromDlam: function (params) {
      var where = at("dnuFromDlam");
      check.params(where, params, ["dlam", "lam"]);
      var dlam = check.atLeast(where, "dlam", params.dlam, 0);
      var lam = check.positive(where, "lam", params.lam);
      return c * dlam / (lam * lam);
    },

    // Linewidth in wavelength from linewidth in frequency: Δλ = λ²·Δν/c.
    dlamFromDnu: function (params) {
      var where = at("dlamFromDnu");
      check.params(where, params, ["dnu", "lam"]);
      var dnu = check.atLeast(where, "dnu", params.dnu, 0);
      var lam = check.positive(where, "lam", params.lam);
      return dnu * lam * lam / c;
    },

    // Spectroscopists' wavenumber (cm⁻¹) -> frequency, Hz. 1 cm⁻¹ ≈ 30 GHz.
    // Zero and negative values are allowed: a difference between two
    // levels can be either.
    hzFromWavenumber: function (perCm) {
      check.finite(at("hzFromWavenumber"), "perCm", perCm);
      return c * perCm * 100;
    },

    // Wavenumber (cm⁻¹) -> energy, eV. 1 cm⁻¹ ≈ 1.24×10⁻⁴ eV.
    eVFromWavenumber: function (perCm) {
      check.finite(at("eVFromWavenumber"), "perCm", perCm);
      return h * c * perCm * 100 / e;
    },

    // The book's nonlinear index n₂ (Gaussian units, n = n₀ + n₂A²) -> the
    // intensity form used in SI, n = n₀ + n₂ᴵ·I, in m²/W.
    //   n₂ᴵ = 8π·n₂ / (c·n₀)  in cm²·s/erg, and 1 cm²·s/erg = 10³ m²/W.
    // n2esu may be negative (a self-defocusing medium).
    n2FromEsu: function (params) {
      var where = at("n2FromEsu");
      check.params(where, params, ["n2esu", "n0"]);
      var n2esu = check.finite(where, "n2esu", params.n2esu);
      var n0 = check.atLeast(where, "n0", params.n0, 1);
      var cCgs = c * 100;        // speed of light in cm/s
      return 8 * Math.PI * n2esu / (cCgs * n0) * 1e3;
    }
  });
})(this);
