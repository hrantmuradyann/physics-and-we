/* ============================================================================
   harmonic.js — frequency doubling in a KDP crystal: the infrared beam of a
   neodymium laser turned green (docs/laser-physics.md §10.2; stage 13b).

   PART OF THE LASER ENGINE (js/laser/engine/): plain numbers in and out, SI
   units, nothing on the page. Needs check.js and constants.js to be
   loaded first.

   THE CRYSTAL. KDP (KH₂PO₄), a negative uniaxial crystal, doubling in
   type I: two ordinary photons at ω make one extraordinary photon at 2ω.
   Its indices come from Zernike's Sellmeier fit (§10.2, λ in µm), used
   from 0.2 to 1.5 µm (KDP's transparency). The fit was checked through its
   phase-matching angle: 41.21° for 1064 → 532 nm, where EKSMA Optics cuts
   KDP at 41.2° (docs/laser-plan.md, stage 13b scope card).

   PHASE MATCHING (§10.2). At the angle θ_m to the optic axis where
   n_e(2ω, θ_m) = n_o(ω) the harmonic keeps in step with the light that
   makes it:
     sin²θ_m = (n_o⁻²(ω) − n_o⁻²(2ω)) / (n_e⁻²(2ω) − n_o⁻²(2ω)).

   EFFICIENCY (§10.2), the crystal cut at θ_m (Δk = 0), length L, the beam
   of power P spread evenly over the area A (I = P/A):
     η₀ = 8π²·d_eff²·L²·I / (n_ω²·n_2ω·ε₀·c·λ²),   η = tanh²√η₀
   with d_eff = d₃₆·sin θ_m (type I, the crystal turned 45° about its axis)
   and n_2ω = n_e(2ω, θ_m) = n_o(ω). tanh² takes the light the harmonic
   uses up into account, so η never passes 1; for weak light η = η₀.

     LaserEngine.harmonic.kdpIndex({ lam, ray })   n of KDP at the vacuum
                                       wavelength lam (m), ray "o" or "e"
     LaserEngine.harmonic.phaseMatchAngle(lam)     θ_m (rad) for doubling
                                       light of wavelength lam (m); null if
                                       type I cannot match it
     LaserEngine.harmonic.doubling({ power, area, length, lam })
                                       { share: η, power: η·P (W),
                                         theta: θ_m (rad) }
     LaserEngine.harmonic.KDP          { d36 (m/V), length (m): the page's
                                         crystal }

   Tests: tests/laser/harmonic.test.js
   ========================================================================== */
(function (root) {
  "use strict";

  var E = root.LaserEngine = root.LaserEngine || {};
  if (!E.check || !E.constants) {
    throw new Error("harmonic.js needs js/laser/engine/check.js and constants.js to be loaded first.");
  }

  var check = E.check;
  var C = E.constants;
  var um = C.um;

  // Zernike's fit (§10.2): n² = A + B/(λ² − C) + D·λ²/(λ² − 400), λ in µm.
  var SELLMEIER = {
    o: { A: 2.259276, B: 0.01008956, C: 0.012942625, D: 13.00522 },
    e: { A: 2.132668, B: 0.008637494, C: 0.012281043, D: 3.2279924 }
  };
  var LAM_MIN = 0.2 * um;
  var LAM_MAX = 1.5 * um;

  // d₃₆ = 0.39 pm/V (Berlin Crystals; EKSMA lists 0.43, Byer's group 0.38);
  // a doubler 2 cm long (KDP doublers are 1–3 cm).
  var KDP = Object.freeze({
    d36: 0.39 * C.pm,                     // m/V
    length: 2 * C.cm
  });

  function at(functionName) {
    return "LaserEngine.harmonic." + functionName;
  }

  // n of one ray at a wavelength already checked, in m.
  function indexOf(ray, lam) {
    var s = SELLMEIER[ray];
    var l2 = (lam / um) * (lam / um);
    return Math.sqrt(s.A + s.B / (l2 - s.C) + s.D * l2 / (l2 - 400));
  }

  function readWavelength(where, name, lam) {
    return check.between(where, name, lam, LAM_MIN, LAM_MAX);
  }

  // A wavelength to double: inside the fit's range, and its harmonic too.
  function readFundamental(where, lam) {
    readWavelength(where, "lam", lam);
    if (lam / 2 < LAM_MIN) {
      check.fail(where, "lam (" + lam + " m) has its harmonic at " + lam / 2 + " m, below " + LAM_MIN + " m, where KDP absorbs.");
    }
    return lam;
  }

  function kdpIndex(params) {
    var where = at("kdpIndex");
    check.params(where, params, ["lam", "ray"]);
    var lam = readWavelength(where, "lam", params.lam);
    if (params.ray !== "o" && params.ray !== "e") {
      check.fail(where, "ray must be \"o\" or \"e\", got " + check.describe(params.ray) + ".");
    }
    return indexOf(params.ray, lam);
  }

  // θ_m for a fundamental of wavelength lam already checked, or null.
  function matchAngle(lam) {
    var half = lam / 2;
    var top = Math.pow(indexOf("o", lam), -2) - Math.pow(indexOf("o", half), -2);
    var bottom = Math.pow(indexOf("e", half), -2) - Math.pow(indexOf("o", half), -2);
    var sin2 = top / bottom;
    if (!(sin2 >= 0 && sin2 <= 1)) return null;
    return Math.asin(Math.sqrt(sin2));
  }

  function phaseMatchAngle(lam) {
    var where = at("phaseMatchAngle");
    return matchAngle(readFundamental(where, lam));
  }

  function doubling(params) {
    var where = at("doubling");
    check.params(where, params, ["power", "area", "length", "lam"]);
    var power = check.atLeast(where, "power", params.power, 0);
    var area = check.positive(where, "area", params.area);
    var length = check.positive(where, "length", params.length);
    var lam = readFundamental(where, params.lam);
    var theta = matchAngle(lam);
    if (theta === null) {
      check.fail(where, "KDP cannot phase-match the doubling of " + lam + " m in type I.");
    }
    var dEff = KDP.d36 * Math.sin(theta);
    var n = indexOf("o", lam);            // n_ω = n_2ω at θ_m
    var intensity = power / area;
    var eta0 = 8 * Math.PI * Math.PI * dEff * dEff * length * length * intensity /
      (n * n * n * C.eps0 * C.c * lam * lam);
    var t = Math.tanh(Math.sqrt(eta0));
    var share = t * t;
    return { share: share, power: share * power, theta: theta };
  }

  E.harmonic = Object.freeze({
    kdpIndex: kdpIndex,
    phaseMatchAngle: phaseMatchAngle,
    doubling: doubling,
    KDP: KDP
  });
})(this);
