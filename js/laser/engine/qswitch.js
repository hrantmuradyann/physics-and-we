/* ============================================================================
   qswitch.js — the Q-switch: a shutter inside the cavity that holds the
   light back while the pump stores energy in the medium, then lets it go
   in one giant pulse (docs/laser-physics.md §4.3, §9.3–9.5).

   PART OF THE LASER ENGINE (js/laser/engine/): plain numbers in and out, SI
   units, nothing on the page. Needs check.js and constants.js to be
   loaded first.

   THE GIANT PULSE (§4.3): opened with the inversion x times its threshold,
   the cavity empties the inversion down to (1 − η_E)·x, where
     x·η_E = −ln(1 − η_E),
   and gives out, through the output mirror,
     E_out  = (γ₂/2γ)·η_E·x·N_p·V_a·hν
     P_peak = (γ₂/2γ)·(hν·V_a·N_p/τ_c)·(x − 1 − ln x)
     Δτ_p   = E_out/P_peak = τ_c·x·η_E/(x − 1 − ln x)
   with N_p the threshold inversion of the open cavity, γ its single-pass
   loss and γ₂ = −ln R₂ the output mirror's. For three levels the energy
   and the peak are half: one photon changes ΔN by 2.

   THE SHUTTERS. Each adds a loss to the cavity, written as an extra
   single-pass loss (like γ: e^(−2·loss) of the light is kept per round
   trip). None is ever infinite: a real shutter leaks a little, and the
   solver needs a finite loss. The leak ℓ is the share of the light a
   closed shutter still lets through per round trip.
     cell      a Pockels cell and a polarizer (§9.3): the round trip keeps
               ℓ + (1 − ℓ)cos²Γ; closed Γ = π/2. Opening takes the voltage
               off in t_s: Γ = (π/2)(1 − t/t_s), then 0.
     prism     a rotating prism that is the back mirror (§9.5): it keeps
               ℓ + (1 − ℓ)·e^(−(θ/θ_tol)²) of the light, θ its angle away
               from the aligned position, turning at `rotation` rev/s.
     absorber  a bleachable filter (§9.4): its loss is a·(−ln T₀), with T₀
               its transmission when every molecule is in the ground state
               and a the share that is. The light bleaches it, and it
               recovers in τ_a.

   In the rate equations (rates.js, §11.2) an extra loss q (in units of the
   open cavity's γ) slows the photons: ds/dt′ = ((y − 1 − q) + seed)/ε. So a
   closed shutter raises the threshold to y = 1 + q.

     LaserEngine.qswitch.energyUse(x)          η_E for x > 1
     LaserEngine.qswitch.giantPulse({ x, N_p, V_a, nu, tau_c, gamma, gammaOut, scheme })
         -> { eta_E, energy, peakPower, width }   (1, J, W, s)
     LaserEngine.qswitch.closedLoss(leak)      a closed shutter's loss, −½ ln ℓ
     LaserEngine.qswitch.cellLoss({ leak, switchTime, since })
         the cell's loss `since` seconds after the voltage starts to fall
         (before that, since < 0, it is closed)
     LaserEngine.qswitch.prismLoss({ leak, rotation, angleTolerance, since })
         the prism's loss `since` seconds after it was aligned
     LaserEngine.qswitch.cellLossFunction({ leak, switchTime })
     LaserEngine.qswitch.prismLossFunction({ leak, rotation, angleTolerance })
         the same as a function of `since`, checked once and then not
         again: the solver calls it several times a step
     LaserEngine.qswitch.withLoss({ f, eps, loss })
         f(t′, [y, s]) of rates.js with the extra loss loss(t′) (units of γ)
     LaserEngine.qswitch.withAbsorber({ f, eps, depth, recovery, bleach })
         an f for [y, s, a]: the medium's f plus the filter, with
           depth     −ln T₀ / γ, its loss when unbleached, units of γ
           recovery  τ/τ_a
           bleach    the share of the filter one unit of p bleaches per
                     unit of t′: σ_a·c·τ/(A_a·L_e·p₁), p₁ the p of one photon
         da/dt′ = recovery·(1 − a) − bleach·a·p, loss depth·a
     LaserEngine.qswitch.ABSORBERS   the filters' σ_a and τ_a, by id

   Tests: tests/laser/qswitch.test.js
   ========================================================================== */
(function (root) {
  "use strict";

  var E = root.LaserEngine = root.LaserEngine || {};
  if (!E.check || !E.constants) {
    throw new Error("qswitch.js needs js/laser/engine/check.js and constants.js to be loaded first.");
  }

  var check = E.check;
  var h = E.constants.h;
  var cm2 = E.constants.cm2;
  var us = E.constants.us;
  var ps = E.constants.ps;

  function at(functionName) {
    return "LaserEngine.qswitch." + functionName;
  }

  /* ---------- the giant pulse (§4.3) ---------- */

  // energyUse(x) -> η_E
  // Solved for u = −ln(1 − η) = x·η, the root of x(1 − e^(−u)) = u above 0:
  // written in η, 1 − η rounds to 0 once x is past about 37 and the log
  // gives −Infinity. The root is between 0 and x (1 − e^(−u) < 1), and
  // x(1 − e^(−u)) − u is above 0 below it and below 0 above it.
  function energyUse(x) {
    var where = at("energyUse");
    check.finite(where, "x", x);
    if (x <= 1) {
      check.fail(where, "x must be above 1: a cavity opened below threshold gives no pulse, got " + x + ".");
    }
    var low = 0;
    var high = x;
    for (var i = 0; i < 200 && high - low > 1e-16 * high; i++) {
      var middle = (low + high) / 2;
      // 1 − e^(−u) as −expm1(−u): exact for a small u (x just above 1).
      if (x * -Math.expm1(-middle) - middle > 0) low = middle;
      else high = middle;
    }
    return (low + high) / 2 / x;
  }

  // giantPulse({ x, N_p, V_a, nu, tau_c, gamma, gammaOut, scheme })
  //   -> { eta_E, energy, peakPower, width }
  function giantPulse(params) {
    var where = at("giantPulse");
    check.params(where, params, ["x", "N_p", "V_a", "nu", "tau_c", "gamma", "gammaOut", "scheme"]);
    var x = check.finite(where, "x", params.x);
    if (x <= 1) {
      check.fail(where, "x must be above 1: a cavity opened below threshold gives no pulse, got " + x + ".");
    }
    var N_p = check.positive(where, "N_p", params.N_p);
    var V_a = check.positive(where, "V_a", params.V_a);
    var nu = check.positive(where, "nu", params.nu);
    var tau_c = check.positive(where, "tau_c", params.tau_c);
    var gamma = check.positive(where, "gamma", params.gamma);
    var gammaOut = check.atLeast(where, "gammaOut", params.gammaOut, 0);
    // γ₂ = −ln R₂ is lost once a round trip; γ is the loss of one pass,
    // so the output mirror's share γ₂/(2γ) is at most 1.
    if (gammaOut > 2 * gamma) {
      check.fail(where, "gammaOut (" + gammaOut + ") cannot be more than the round trip's whole loss 2·gamma (" +
        2 * gamma + ").");
    }
    var scheme = params.scheme;
    if (scheme !== "four-level" && scheme !== "three-level") {
      check.fail(where, 'scheme must be "four-level" or "three-level", got ' + check.describe(scheme) + ".");
    }
    // One emission changes ΔN by 2 in a three-level medium: half the photons.
    var share = scheme === "four-level" ? 1 : 0.5;
    var eta = energyUse(x);
    var hnu = h * nu;
    var outShare = gammaOut / (2 * gamma);
    var energy = share * outShare * eta * x * N_p * V_a * hnu;
    var peakPower = share * outShare * hnu * V_a * N_p / tau_c * (x - 1 - Math.log(x));
    // E_out/P_peak, written out: with no output mirror (γ₂ = 0) both are
    // 0, and the ratio would be NaN, but the pulse inside still has this
    // width.
    var width = tau_c * x * eta / (x - 1 - Math.log(x));
    return {
      eta_E: eta,
      energy: energy,
      peakPower: peakPower,
      width: width
    };
  }

  /* ---------- the shutters (§9.3, §9.5) ---------- */

  function readLeak(where, value) {
    var leak = check.between(where, "leak", value, 0, 1);
    if (leak === 0) {
      check.fail(where, "leak must be above 0: a shutter that holds back every photon gives an infinite loss.");
    }
    return leak;
  }

  // The single-pass loss of a round trip that keeps `kept` of the light.
  // Math.max so that keeping all of it gives +0, not −0.
  function lossOf(kept) {
    return Math.max(0, -0.5 * Math.log(kept));
  }

  // closedLoss(leak) -> the closed shutter's extra single-pass loss, −½ ln ℓ
  function closedLoss(leak) {
    return lossOf(readLeak(at("closedLoss"), leak));
  }

  // The cell's and the prism's loss from checked numbers. The solver calls
  // them several times a step, so they check nothing (see the
  // ...LossFunction below).
  function cellLossAt(leak, switchTime, since) {
    var share = Math.min(1, Math.max(0, since / switchTime));   // how far the voltage has fallen
    var retardation = (Math.PI / 2) * (1 - share);
    var cos = Math.cos(retardation);
    return lossOf(leak + (1 - leak) * cos * cos);
  }

  function prismLossAt(leak, rotation, tolerance, since) {
    // The angle from the aligned position, in one turn: −π to π.
    var turns = since * rotation;
    var angle = 2 * Math.PI * (turns - Math.round(turns));
    var ratio = angle / tolerance;
    return lossOf(leak + (1 - leak) * Math.exp(-ratio * ratio));
  }

  // cellLoss({ leak, switchTime, since }) -> the extra single-pass loss
  function cellLoss(params) {
    var where = at("cellLoss");
    check.params(where, params, ["leak", "switchTime", "since"]);
    var leak = readLeak(where, params.leak);
    var switchTime = check.positive(where, "switchTime", params.switchTime);
    var since = check.finite(where, "since", params.since);
    return cellLossAt(leak, switchTime, since);
  }

  // cellLossFunction({ leak, switchTime }) -> loss(since), unchecked
  function cellLossFunction(params) {
    var where = at("cellLossFunction");
    check.params(where, params, ["leak", "switchTime"]);
    var leak = readLeak(where, params.leak);
    var switchTime = check.positive(where, "switchTime", params.switchTime);
    return function (since) {
      return cellLossAt(leak, switchTime, since);
    };
  }

  // prismLoss({ leak, rotation, angleTolerance, since }) -> the extra single-pass loss
  function prismLoss(params) {
    var where = at("prismLoss");
    check.params(where, params, ["leak", "rotation", "angleTolerance", "since"]);
    var leak = readLeak(where, params.leak);
    var rotation = check.positive(where, "rotation", params.rotation);
    var tolerance = check.positive(where, "angleTolerance", params.angleTolerance);
    var since = check.finite(where, "since", params.since);
    return prismLossAt(leak, rotation, tolerance, since);
  }

  // prismLossFunction({ leak, rotation, angleTolerance }) -> loss(since), unchecked
  function prismLossFunction(params) {
    var where = at("prismLossFunction");
    check.params(where, params, ["leak", "rotation", "angleTolerance"]);
    var leak = readLeak(where, params.leak);
    var rotation = check.positive(where, "rotation", params.rotation);
    var tolerance = check.positive(where, "angleTolerance", params.angleTolerance);
    return function (since) {
      return prismLossAt(leak, rotation, tolerance, since);
    };
  }

  /* ---------- in the rate equations (§11.2) ---------- */

  // withLoss({ f, eps, loss }) -> f for [y, s]
  function withLoss(params) {
    var where = at("withLoss");
    check.params(where, params, ["f", "eps", "loss"]);
    var f = check.func(where, "f", params.f);
    var eps = check.positive(where, "eps", params.eps);
    var loss = check.func(where, "loss", params.loss);
    return function (tPrime, state) {
      var rates = f(tPrime, state);
      return [rates[0], rates[1] - loss(tPrime) / eps];
    };
  }

  // withAbsorber({ f, eps, depth, recovery, bleach }) -> f for [y, s, a]
  function withAbsorber(params) {
    var where = at("withAbsorber");
    check.params(where, params, ["f", "eps", "depth", "recovery", "bleach"]);
    var f = check.func(where, "f", params.f);
    var eps = check.positive(where, "eps", params.eps);
    var depth = check.atLeast(where, "depth", params.depth, 0);
    var recovery = check.positive(where, "recovery", params.recovery);
    var bleach = check.positive(where, "bleach", params.bleach);
    return function (tPrime, state) {
      var a = state[2];
      var rates = f(tPrime, [state[0], state[1]]);
      var p = Math.exp(state[1]);
      return [
        rates[0],
        rates[1] - depth * a / eps,
        recovery * (1 - a) - bleach * a * p
      ];
    };
  }

  // The filters (§9.4), not verified against printed sources:
  //   cr-yag         Cr⁴⁺:YAG, the usual filter of Nd lasers at 1.06 µm
  //   cryptocyanine  the dye in methanol of the first Q-switched ruby lasers
  var ABSORBERS = Object.freeze({
    "cr-yag": Object.freeze({ sigma: 4.3e-18 * cm2, tau: 3.4 * us }),
    "cryptocyanine": Object.freeze({ sigma: 8e-16 * cm2, tau: 22 * ps })
  });

  E.qswitch = Object.freeze({
    energyUse: energyUse,
    giantPulse: giantPulse,
    closedLoss: closedLoss,
    cellLoss: cellLoss,
    cellLossFunction: cellLossFunction,
    prismLoss: prismLoss,
    prismLossFunction: prismLossFunction,
    withLoss: withLoss,
    withAbsorber: withAbsorber,
    ABSORBERS: ABSORBERS
  });
})(this);
