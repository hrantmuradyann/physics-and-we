/* ============================================================================
   media.js — the gain media the visitor can put on the bench.

   PART OF THE LASER ENGINE (js/laser/engine/): plain numbers in and out, SI
   units, nothing on the page. Needs check.js and constants.js to be loaded
   first.

   Numbers: docs/laser-physics.md §5.1 (typical, rounded values). Each one is
   written as the handbook's number times its unit (2.5e-20 * cm2, 230 * us),
   so every line can be checked against the table by eye. Most of them are
   standard textbook values that have not yet been checked against the
   printed sources — see the "Sources" section of the doc.
   The names of the media, in Armenian and English, are not here — they are
   words, and words live in data/laser.json.

   Using it:
     LaserEngine.media.list()      -> ["ruby", "nd-glass", ...]  (table order)
     LaserEngine.media.get("ruby") -> a fresh copy of one medium, plus:
         nu            laser frequency, Hz
         photonEnergy  energy of one laser photon, J
         nGroup        the index that sets the round-trip time (cavity
                         effectiveLength): ng where the table gives it,
                         otherwise n
         I_sat         saturation intensity, W/m² (null if σ is not known):
                         hν/(στ)  for a four-level medium
                         hν/(2στ) for a three-level one (ruby): there one
                         emission changes ΔN by 2, not 1 (§2.2)

   Tests: tests/laser/media.test.js
   ========================================================================== */
(function (root) {
  "use strict";

  var E = root.LaserEngine = root.LaserEngine || {};
  if (!E.check || !E.constants) {
    throw new Error("media.js needs js/laser/engine/check.js and constants.js to be loaded first.");
  }

  var C = E.constants;
  var U = E.units;

  // Short names for the units, so the table below reads like the doc's table.
  var nm = C.nm;
  var um = C.um;        // micrometre (length)
  var cm2 = C.cm2;
  var ms = C.ms;
  var us = C.us;        // microsecond (time)
  var ns = C.ns;
  var MHz = C.MHz;
  var GHz = C.GHz;
  var THz = C.THz;

  /* What each field means (all SI):

       id          the name used in the code, the address and data/laser.json
       scheme      "three-level", "four-level" or "semiconductor"
       lam         main laser wavelength in vacuum, m
       lamMin,     the range of wavelengths the medium can give; both equal
       lamMax        lam for a medium with one fixed line
       otherLines  other wavelengths it can also lase on, m
       sigma       stimulated-emission cross section, m²   (null: not known)
       diffGain    differential gain a, m² — the semiconductor's stand-in for
                     sigma, in g = a(N − N_tr). null for every other medium
       tau         upper-laser-level lifetime, s (carrier lifetime for a diode)
       dnu         width of the gain line, Hz                (null: not known)
       broadening  "homogeneous" or "inhomogeneous"          (null: not known)
       n           refractive index
       ng          group index, where it differs noticeably from n: only
                     the diode (§3.3: n_g ≈ 4 against n = 3.6). null = use n
       pumps       how it can be pumped: "flashlamp", "diode", "lamp",
                     "discharge", "current", "laser"
       cw, pulsed  whether it runs continuously and/or in pulses
                     (pulsed includes Q-switched)                            */

  var MEDIA = [
    {
      id: "ruby",
      scheme: "three-level",
      lam: 694.3 * nm, lamMin: 694.3 * nm, lamMax: 694.3 * nm,
      otherLines: [],
      sigma: 2.5e-20 * cm2,
      diffGain: null,
      tau: 3 * ms,
      dnu: 330 * GHz,
      broadening: "homogeneous",
      n: 1.76,
      ng: null,
      pumps: ["flashlamp"],
      cw: false, pulsed: true
    },
    {
      id: "nd-glass",
      scheme: "four-level",
      lam: 1.06 * um, lamMin: 1.06 * um, lamMax: 1.06 * um,
      otherLines: [],
      sigma: 3e-20 * cm2,
      diffGain: null,
      tau: 0.3 * ms,
      dnu: U.dnuFromDlam({ dlam: 25 * nm, lam: 1.06 * um }),   // 20–30 nm in the table: the middle
      broadening: "inhomogeneous",
      n: 1.5,
      ng: null,
      pumps: ["flashlamp"],
      cw: false, pulsed: true
    },
    {
      id: "nd-yag",
      scheme: "four-level",
      lam: 1064 * nm, lamMin: 1064 * nm, lamMax: 1064 * nm,
      otherLines: [],
      sigma: 2.8e-19 * cm2,
      diffGain: null,
      tau: 230 * us,
      dnu: 120 * GHz,
      broadening: "homogeneous",
      n: 1.82,
      ng: null,
      pumps: ["flashlamp", "diode"],
      cw: true, pulsed: true
    },
    {
      // Lases only when cooled to 77 K (§5.4): CW from a 15–20 W lamp, and
      // Q-switched at 1–2 MW. The table gives no cross section, and the
      // linewidth "strongly depends on temperature", so those stay null
      // until the temperature model is built.
      id: "caf2-dy",
      scheme: "four-level",
      lam: 2.36 * um, lamMin: 2.36 * um, lamMax: 2.36 * um,
      otherLines: [],
      sigma: null,
      diffGain: null,
      tau: 20 * ms,                             // 10–50 ms, depends on concentration
      dnu: null,
      broadening: null,
      n: 1.43,
      ng: null,
      pumps: ["lamp"],
      cw: true, pulsed: true
    },
    {
      id: "he-ne",
      scheme: "four-level",
      lam: 632.8 * nm, lamMin: 632.8 * nm, lamMax: 632.8 * nm,
      otherLines: [1.15 * um, 3.39 * um],
      sigma: 3e-13 * cm2,
      diffGain: null,
      tau: 0.1 * us,
      dnu: 1.5 * GHz,
      broadening: "inhomogeneous",              // Doppler
      n: 1,
      ng: null,
      pumps: ["discharge"],
      cw: true, pulsed: false
    },
    {
      id: "ar-ion",
      scheme: "four-level",
      lam: 514.5 * nm, lamMin: 514.5 * nm, lamMax: 514.5 * nm,
      otherLines: [488 * nm],
      sigma: 2.5e-12 * cm2,
      diffGain: null,
      tau: 10 * ns,
      dnu: 3.5 * GHz,
      broadening: "inhomogeneous",              // Doppler
      n: 1,
      ng: null,
      pumps: ["discharge"],
      cw: true, pulsed: false
    },
    {
      id: "co2",
      scheme: "four-level",
      lam: 10.6 * um, lamMin: 10.6 * um, lamMax: 10.6 * um,
      otherLines: [9.6 * um],
      sigma: 3e-18 * cm2,
      diffGain: null,
      // The table says 0.1–1 ms. 0.28 ms is the value that, with this σ, gives
      // back the measured saturation intensity of 22 W/cm² quoted in §5.1.
      tau: 0.28 * ms,
      dnu: 50 * MHz,
      // ~50 MHz at low pressure is the Doppler width of CO₂, so the line is
      // inhomogeneous there (the table does not say so in words).
      broadening: "inhomogeneous",
      n: 1,
      ng: null,
      pumps: ["discharge"],
      cw: true, pulsed: true
    },
    {
      // GaAs/AlGaAs. lamMin–lamMax is the range the material's composition
      // allows, not a tuning range. Its gain is g = a(N − N_tr), §5.7.
      id: "diode",
      scheme: "semiconductor",
      lam: 850 * nm, lamMin: 780 * nm, lamMax: 870 * nm,
      otherLines: [],
      sigma: null,
      diffGain: 3e-16 * cm2,                    // (2–5)×10⁻¹⁶ cm² in the table
      tau: 3 * ns,                              // 2–4 ns (carriers)
      dnu: 10 * THz,
      broadening: "homogeneous",                // §1 lists semiconductors as homogeneous
      n: 3.6,
      ng: 4,
      pumps: ["current"],
      cw: true, pulsed: false
    },
    {
      // Rhodamine 6G in ethanol. Tunable 560–640 nm; lam is the middle.
      // Homogeneous broadening is the textbook value; the table does not say.
      id: "dye-r6g",
      scheme: "four-level",
      lam: 600 * nm, lamMin: 560 * nm, lamMax: 640 * nm,
      otherLines: [],
      sigma: 2e-16 * cm2,
      diffGain: null,
      tau: 5 * ns,
      dnu: 30 * THz,
      broadening: "homogeneous",
      n: 1.36,
      ng: null,
      pumps: ["laser"],
      cw: true, pulsed: true
    },
    {
      // Tunable 660–1100 nm with its peak near 800 nm. Homogeneous broadening
      // is the textbook value; the table does not say.
      id: "ti-sapphire",
      scheme: "four-level",
      lam: 800 * nm, lamMin: 660 * nm, lamMax: 1100 * nm,
      otherLines: [],
      sigma: 3.9e-19 * cm2,
      diffGain: null,
      tau: 3.2 * us,
      dnu: 100 * THz,
      broadening: "homogeneous",
      n: 1.76,
      ng: null,
      pumps: ["laser"],
      cw: true, pulsed: true
    }
  ];

  /* ---------- reading the table ---------- */

  function find(id) {
    for (var i = 0; i < MEDIA.length; i++) {
      if (MEDIA[i].id === id) return MEDIA[i];
    }
    return null;
  }

  // A copy, so a caller that changes it cannot change the table for everyone.
  function copyOf(medium) {
    var copy = {};
    Object.keys(medium).forEach(function (key) {
      var value = medium[key];
      copy[key] = Array.isArray(value) ? value.slice() : value;
    });
    return copy;
  }

  // The saturation intensity (§1, §2.2). For a homogeneous line it is the
  // intensity that halves the gain, g = g₀/(1 + I/I_sat). For an
  // inhomogeneous line the gain falls more slowly, g = g₀/√(1 + I/I_sat),
  // so at I = I_sat it is g₀/√2, not g₀/2.
  function saturationIntensity(medium, photonEnergy) {
    if (medium.sigma === null) return null;
    // In a three-level medium one emission empties the upper level AND fills
    // the lower one, so it changes the inversion ΔN by 2.
    var perEmission = medium.scheme === "three-level" ? 2 : 1;
    return photonEnergy / (perEmission * medium.sigma * medium.tau);
  }

  E.media = Object.freeze({

    list: function () {
      return MEDIA.map(function (medium) { return medium.id; });
    },

    get: function (id) {
      var medium = find(id);
      if (!medium) {
        throw new Error('LaserEngine.media.get: there is no medium called "' + id + '".');
      }

      var result = copyOf(medium);
      result.nu = U.nuFromLam(medium.lam);
      result.photonEnergy = U.photonEnergy(medium.lam);
      // typeof, not !== null: an entry that leaves ng out must fall back to n too.
      result.nGroup = typeof medium.ng === "number" ? medium.ng : medium.n;
      result.I_sat = saturationIntensity(medium, result.photonEnergy);
      return result;
    }
  });
})(this);
