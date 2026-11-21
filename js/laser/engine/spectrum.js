/* ============================================================================
   spectrum.js — emission, lineshapes and the gain curve.

   PART OF THE LASER ENGINE (js/laser/engine/): plain numbers in and out, SI
   units, nothing on the page. Needs check.js and constants.js to be loaded
   first.

   docs/laser-physics.md §1 and §3.3:
     - thermal equilibrium: why an ordinary hot source is not a laser;
     - the shape and width of the gain line (Lorentzian for a homogeneous
       line, Gaussian for an inhomogeneous one), the cross section from the
       Einstein coefficient, the gain coefficient and how it saturates;
     - how wide a band of the line oscillates, and the comb of cavity modes.
   Frequencies and widths are in Hz; every width is the full width at half
   maximum.

   A function with more than one input takes one object of named values
   (see check.js):  spectrum.lorentzian({ nu: 4.74e14, nu0: 4.74e14, dnu: 1.5e9 })

   Tests: tests/laser/spectrum.test.js
   ========================================================================== */
(function (root) {
  "use strict";

  var E = root.LaserEngine = root.LaserEngine || {};
  if (!E.check || !E.constants) {
    throw new Error("spectrum.js needs js/laser/engine/check.js and constants.js to be loaded first.");
  }

  var check = E.check;
  var h = E.constants.h;
  var c = E.constants.c;
  var k = E.constants.k;

  // The name errors start with: the function the caller called.
  function at(functionName) {
    return "LaserEngine.spectrum." + functionName;
  }

  // hν/kT for light of wavelength lam at temperature T.
  function energyOverKT(lam, T) {
    return h * c / (lam * k * T);
  }

  /* ---------- thermal equilibrium (§1) ---------- */

  // In thermal equilibrium at temperature T, how many photons of wavelength
  // lam are emitted by stimulated emission for every one emitted
  // spontaneously:  1 / (exp(hν/kT) − 1).   (§1, Problems 4–5 to §119)
  // stimulatedToSpontaneous({ lam, T })
  function stimulatedToSpontaneous(params) {
    var where = at("stimulatedToSpontaneous");
    check.params(where, params, ["lam", "T"]);
    var lam = check.positive(where, "lam", params.lam);
    var T = check.positive(where, "T", params.T);
    // Math.expm1(x) is exp(x) − 1 computed without the rounding error the
    // plain subtraction has when x is small (long wavelengths, hot sources).
    return 1 / Math.expm1(energyOverKT(lam, T));
  }

  // The wavelength above which stimulated emission wins at temperature T:
  // the ratio above equals 1 when hν = kT·ln 2.   ≈ 69 µm at 300 K.
  function crossoverLam(T) {
    check.positive(at("crossoverLam"), "T", T);
    return h * c / (k * T * Math.LN2);
  }

  // The temperature above which stimulated emission wins at wavelength lam.
  // ≈ 3.8×10⁴ K for green light (550 nm).
  function crossoverT(lam) {
    check.positive(at("crossoverT"), "lam", lam);
    return h * c / (k * lam * Math.LN2);
  }

  // Boltzmann population ratio N₂/N₁ of two levels lam apart in energy:
  // (g₂/g₁)·exp(−hν/kT), with deg1 and deg2 the level degeneracies (1 for
  // non-degenerate levels).  ≈ 10⁻³⁰ for ruby (694 nm) at 300 K.
  // boltzmannRatio({ lam, T, deg1, deg2 })
  function boltzmannRatio(params) {
    var where = at("boltzmannRatio");
    check.params(where, params, ["lam", "T", "deg1", "deg2"]);
    var lam = check.positive(where, "lam", params.lam);
    var T = check.positive(where, "T", params.T);
    var deg1 = check.positive(where, "deg1", params.deg1);
    var deg2 = check.positive(where, "deg2", params.deg2);
    return (deg2 / deg1) * Math.exp(-energyOverKT(lam, T));
  }

  /* ---------- lineshapes (§1) ---------- */

  // The two lineshape formulas, without checks: the public functions below
  // check their inputs first, each under its own name.

  // Normalised Lorentzian: integral 1, peak 2/(πΔν), half the peak at ν₀ ± Δν/2.
  function lorentzianFormula(nu, nu0, dnu) {
    var detuning = nu - nu0;
    var halfWidth = dnu / 2;
    return (dnu / (2 * Math.PI)) / (detuning * detuning + halfWidth * halfWidth);
  }

  // Normalised Gaussian of full width dnuD: integral 1, peak
  // 2·√(ln 2/π)/Δν_D ≈ 0.939/Δν_D.
  function gaussianFormula(nu, nu0, dnuD) {
    var detuning = nu - nu0;
    return (2 / dnuD) * Math.sqrt(Math.LN2 / Math.PI) *
      Math.exp(-4 * Math.LN2 * detuning * detuning / (dnuD * dnuD));
  }

  // Homogeneous line.  1/Hz.
  // lorentzian({ nu, nu0, dnu })
  function lorentzian(params) {
    var where = at("lorentzian");
    check.params(where, params, ["nu", "nu0", "dnu"]);
    var nu = check.finite(where, "nu", params.nu);
    var nu0 = check.positive(where, "nu0", params.nu0);
    var dnu = check.positive(where, "dnu", params.dnu);
    return lorentzianFormula(nu, nu0, dnu);
  }

  // Inhomogeneous (e.g. Doppler) line.  1/Hz.
  // gaussian({ nu, nu0, dnuD })
  function gaussian(params) {
    var where = at("gaussian");
    check.params(where, params, ["nu", "nu0", "dnuD"]);
    var nu = check.finite(where, "nu", params.nu);
    var nu0 = check.positive(where, "nu0", params.nu0);
    var dnuD = check.positive(where, "dnuD", params.dnuD);
    return gaussianFormula(nu, nu0, dnuD);
  }

  // The checked inputs of lineshape() and relativeGain(), which take the
  // same four: { broadening, nu, nu0, dnu }.
  function readLine(where, params) {
    check.params(where, params, ["broadening", "nu", "nu0", "dnu"]);
    return {
      broadening: check.broadening(where, params.broadening),
      nu: check.finite(where, "nu", params.nu),
      nu0: check.positive(where, "nu0", params.nu0),
      dnu: check.positive(where, "dnu", params.dnu)
    };
  }

  // The lineshape of a line read by readLine, at frequency nu.
  function shapeAt(line, nu) {
    if (line.broadening === "homogeneous") return lorentzianFormula(nu, line.nu0, line.dnu);
    return gaussianFormula(nu, line.nu0, line.dnu);
  }

  // The lineshape of a medium, picked by its broadening.  1/Hz.
  // lineshape({ broadening, nu, nu0, dnu })
  function lineshape(params) {
    var line = readLine(at("lineshape"), params);
    return shapeAt(line, line.nu);
  }

  // g₀(ν)/g₀(ν₀): how the small-signal gain falls away from the line centre.
  // 1 at ν₀, ½ at ν₀ ± Δν/2. Multiply by the peak cross section or gain to get
  // the gain curve against the frequency.
  // relativeGain({ broadening, nu, nu0, dnu })
  function relativeGain(params) {
    var line = readLine(at("relativeGain"), params);
    return shapeAt(line, line.nu) / shapeAt(line, line.nu0);
  }

  // Natural linewidth of a level that lives tau seconds: 1/(2πτ).  Hz.
  function naturalWidth(tau) {
    check.positive(at("naturalWidth"), "tau", tau);
    return 1 / (2 * Math.PI * tau);
  }

  // Doppler width (full width at half maximum) of a line at nu0 from atoms
  // of mass M (kg) at temperature T: ν₀·√(8kT·ln 2/(Mc²)).  Hz.
  // dopplerWidth({ nu0, T, M })
  function dopplerWidth(params) {
    var where = at("dopplerWidth");
    check.params(where, params, ["nu0", "T", "M"]);
    var nu0 = check.positive(where, "nu0", params.nu0);
    var T = check.positive(where, "T", params.T);
    var M = check.positive(where, "M", params.M);
    return nu0 * Math.sqrt(8 * k * T * Math.LN2 / (M * c * c));
  }

  // Stimulated-emission cross section from the spontaneous rate A21 (1/s):
  // σ(ν) = A₂₁·λ₀²/(8πn²)·ĝ(ν), with lam0 the vacuum wavelength and
  // lineshape = ĝ(ν) in 1/Hz.  m².
  // crossSection({ A21, lam0, n, lineshape })
  function crossSection(params) {
    var where = at("crossSection");
    check.params(where, params, ["A21", "lam0", "n", "lineshape"]);
    var A21 = check.positive(where, "A21", params.A21);
    var lam0 = check.positive(where, "lam0", params.lam0);
    var n = check.atLeast(where, "n", params.n, 1);
    var lineshapeValue = check.atLeast(where, "lineshape", params.lineshape, 0);
    return A21 * lam0 * lam0 / (8 * Math.PI * n * n) * lineshapeValue;
  }

  /* ---------- gain (§1) ---------- */

  // Population inversion ΔN = N₂ − (g₂/g₁)·N₁, from the populations of the
  // lower (N1) and upper (N2) levels and their degeneracies.  m⁻³.
  // inversion({ N1, N2, deg1, deg2 })
  function inversion(params) {
    var where = at("inversion");
    check.params(where, params, ["N1", "N2", "deg1", "deg2"]);
    var N1 = check.atLeast(where, "N1", params.N1, 0);
    var N2 = check.atLeast(where, "N2", params.N2, 0);
    var deg1 = check.positive(where, "deg1", params.deg1);
    var deg2 = check.positive(where, "deg2", params.deg2);
    return N2 - (deg2 / deg1) * N1;
  }

  // Gain coefficient g = σ·ΔN.  m⁻¹; negative means the medium absorbs.
  // gainCoefficient({ sigma, dN })
  function gainCoefficient(params) {
    var where = at("gainCoefficient");
    check.params(where, params, ["sigma", "dN"]);
    var sigma = check.positive(where, "sigma", params.sigma);
    var dN = check.finite(where, "dN", params.dN);
    return sigma * dN;
  }

  // Gain g0 saturated by light of intensity I: g₀/(1 + I/I_sat) for a
  // homogeneous line, g₀/√(1 + I/I_sat) for an inhomogeneous one, where
  // each mode only empties its own part of the line.  m⁻¹.
  // saturatedGain({ broadening, g0, I, I_sat })
  function saturatedGain(params) {
    var where = at("saturatedGain");
    check.params(where, params, ["broadening", "g0", "I", "I_sat"]);
    var broadening = check.broadening(where, params.broadening);
    var g0 = check.finite(where, "g0", params.g0);
    var I = check.atLeast(where, "I", params.I, 0);
    var I_sat = check.positive(where, "I_sat", params.I_sat);
    if (broadening === "homogeneous") return g0 / (1 + I / I_sat);
    return g0 / Math.sqrt(1 + I / I_sat);
  }

  /* ---------- oscillating band and mode comb (§3.3) ---------- */

  // The width of the band where the small-signal gain is above threshold,
  // for a line of width dnu pumped x = g₀(ν₀)/g_th times over threshold:
  // Δν·√(x − 1) for a Lorentzian, Δν_D·√(ln x/ln 2) for a Gaussian.  Hz.
  // At or below threshold nothing oscillates: 0 (the formulas would take
  // the root of a negative number there).
  // oscillatingBandwidth({ broadening, dnu, x })
  function oscillatingBandwidth(params) {
    var where = at("oscillatingBandwidth");
    check.params(where, params, ["broadening", "dnu", "x"]);
    var broadening = check.broadening(where, params.broadening);
    var dnu = check.positive(where, "dnu", params.dnu);
    var x = check.finite(where, "x", params.x);
    if (x <= 1) return 0;
    if (broadening === "homogeneous") return dnu * Math.sqrt(x - 1);
    return dnu * Math.sqrt(Math.log(x) / Math.LN2);
  }

  // A window of the spectrum holds at most this many mode lines; more would
  // freeze the page (Ti:sapphire's whole line holds ~10⁵ modes).
  var MAX_COMB_LINES = 100000;

  // The longitudinal modes ν_q = q·Δν_FSR (q = 1, 2, ...) that lie from
  // nuLow to nuHigh, lowest first.  Hz.
  // modeComb({ nuLow, nuHigh, fsr })
  function modeComb(params) {
    var where = at("modeComb");
    check.params(where, params, ["nuLow", "nuHigh", "fsr"]);
    var nuLow = check.atLeast(where, "nuLow", params.nuLow, 0);
    var nuHigh = check.atLeast(where, "nuHigh", params.nuHigh, 0);
    var fsr = check.positive(where, "fsr", params.fsr);
    if (nuHigh < nuLow) {
      check.fail(where, "nuHigh must not be below nuLow (got " + nuLow + " to " + nuHigh + ").");
    }
    // The mode numbers q from first to last, with one extra q on each side:
    // rounding in nuLow/fsr or nuHigh/fsr can skip a line that sits exactly
    // on the edge. The check in the loop throws the extras out again.
    // No mode at 0 Hz: q starts at 1.
    var first = Math.max(1, Math.ceil(nuLow / fsr) - 1);
    var last = Math.floor(nuHigh / fsr) + 1;
    // Past 2^53, q + 1 is q again and the loop below would never end.
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) {
      check.fail(where, "nuLow/fsr and nuHigh/fsr are too large to count modes one by one.");
    }
    var lines = [];
    for (var q = first; q <= last; q++) {
      var nu = q * fsr;
      if (nu >= nuLow && nu <= nuHigh) {
        // Counted on the lines really returned, so the limit is exact, and
        // the loop never runs much more than MAX_COMB_LINES times.
        if (lines.length === MAX_COMB_LINES) {
          check.fail(where, "the window holds more than " + MAX_COMB_LINES +
            " lines; ask for a narrower one.");
        }
        lines.push(nu);
      }
    }
    return lines;
  }

  E.spectrum = Object.freeze({
    stimulatedToSpontaneous: stimulatedToSpontaneous,
    crossoverLam: crossoverLam,
    crossoverT: crossoverT,
    boltzmannRatio: boltzmannRatio,
    lorentzian: lorentzian,
    gaussian: gaussian,
    lineshape: lineshape,
    relativeGain: relativeGain,
    naturalWidth: naturalWidth,
    dopplerWidth: dopplerWidth,
    crossSection: crossSection,
    inversion: inversion,
    gainCoefficient: gainCoefficient,
    saturatedGain: saturatedGain,
    oscillatingBandwidth: oscillatingBandwidth,
    modeComb: modeComb
  });
})(this);
