/* ============================================================================
   pumps.js — how a flashlamp and a gas discharge pump the medium.

   PART OF THE LASER ENGINE (js/laser/engine/): plain numbers in and out, SI
   units, nothing on the page. Needs check.js to be loaded first.

   Physics: docs/laser-physics.md §6.1 (the flash), §6.4 (the discharge);
   the choices are in docs/laser-plan.md, stage 7b.

     LaserEngine.pumps.flash({ energy, flashTime })
         returns power(t): the lamp's electrical power (W) t seconds after
         it is fired, (E/t_p)(t/t_p)e^(−t/t_p), and 0 before. Its integral
         is E and its peak E/(e·t_p) at t = t_p. Like rates.js's
         derivatives, it checks its inputs once and returns an unchecked
         function, because the solver calls it every step.
     LaserEngine.pumps.dischargeGain({ law, current, currentPeak, gainPeak })
         the small-signal gain g₀ (m⁻¹) at a discharge current (A):
           "optimum"  §6.4: ΔN = aI/(1 + I/I_sat) − bI with a/b = 4, scaled
                      to gainPeak at its best current currentPeak; the gain
                      is 0 again at 3·currentPeak (He-Ne, CO₂)
           "square"   gainPeak·(I/currentPeak)², up to the rated current
                      currentPeak (Ar⁺: two collisions per excitation)
     LaserEngine.pumps.dischargeThreshold({ law, currentPeak, gainPeak, gth })
         the lowest current with g₀ = gth (A), or null if the tube never
         reaches it (gainPeak < gth)
     LaserEngine.pumps.dischargeMax({ law, currentPeak })
         the highest current the law allows (A): 3·currentPeak or currentPeak
     LaserEngine.pumps.gainRatio   a/b of the optimum law, 4

   Tests: tests/laser/pumps.test.js
   ========================================================================== */
(function (root) {
  "use strict";

  var E = root.LaserEngine = root.LaserEngine || {};
  if (!E.check) {
    throw new Error("pumps.js needs js/laser/engine/check.js to be loaded first.");
  }

  var check = E.check;

  // a/b of §6.4's ΔN = aI/(1 + I/I_sat) − bI. §6.4 leaves a and b free; 4
  // puts the best current at I_sat(√(a/b) − 1) = I_sat and the end of the
  // gain at I_sat(a/b − 1) = 3·I_sat (docs/laser-plan.md, stage 7b).
  var GAIN_RATIO = 4;
  var ROOT_RATIO = Math.sqrt(GAIN_RATIO);     // √(a/b) = 2

  function at(functionName) {
    return "LaserEngine.pumps." + functionName;
  }

  /* ---------- the flash (§6.1) ---------- */

  // flash({ energy, flashTime }) -> power(t), W
  function flash(params) {
    var where = at("flash");
    check.params(where, params, ["energy", "flashTime"]);
    var energy = check.atLeast(where, "energy", params.energy, 0);
    var flashTime = check.positive(where, "flashTime", params.flashTime);
    var scale = energy / flashTime;

    return function (t) {
      if (t <= 0) return 0;
      var u = t / flashTime;
      return scale * u * Math.exp(-u);
    };
  }

  /* ---------- the discharge (§6.4) ---------- */

  function readLaw(where, law) {
    if (law !== "optimum" && law !== "square") {
      check.fail(where, 'law must be "optimum" or "square", got ' + check.describe(law) + ".");
    }
    return law;
  }

  function maxCurrent(law, currentPeak) {
    // The optimum law's gain is 0 again at I_sat(a/b − 1), and
    // I_sat = currentPeak/(√(a/b) − 1): that is currentPeak·(√(a/b) + 1).
    if (law === "optimum") return currentPeak * (ROOT_RATIO + 1);
    return currentPeak;
  }

  // dischargeMax({ law, currentPeak }) -> A
  function dischargeMax(params) {
    var where = at("dischargeMax");
    check.params(where, params, ["law", "currentPeak"]);
    var law = readLaw(where, params.law);
    var currentPeak = check.positive(where, "currentPeak", params.currentPeak);
    return maxCurrent(law, currentPeak);
  }

  // dischargeGain({ law, current, currentPeak, gainPeak }) -> g₀, m⁻¹
  function dischargeGain(params) {
    var where = at("dischargeGain");
    check.params(where, params, ["law", "current", "currentPeak", "gainPeak"]);
    var law = readLaw(where, params.law);
    var current = check.atLeast(where, "current", params.current, 0);
    var currentPeak = check.positive(where, "currentPeak", params.currentPeak);
    var gainPeak = check.positive(where, "gainPeak", params.gainPeak);
    var highest = maxCurrent(law, currentPeak);
    if (current > highest) {
      check.fail(where, "current (" + current + " A) must be at most " + highest + " A: " +
        (law === "optimum" ? "past that the discharge gives no gain." : "the tube's rated current."));
    }

    if (law === "square") {
      var ratio = current / currentPeak;
      return gainPeak * ratio * ratio;
    }
    // u = I/I_sat. ΔN/(b·I_sat) = (a/b)·u/(1 + u) − u, which is
    // (√(a/b) − 1)² at the best current u = √(a/b) − 1.
    var u = (current / currentPeak) * (ROOT_RATIO - 1);
    // Never below 0: the check above keeps u within one rounding unit of
    // a/b − 1 = 3, where this is exactly 0 (pumps.test.js).
    var relative = (GAIN_RATIO * u / (1 + u) - u) / ((ROOT_RATIO - 1) * (ROOT_RATIO - 1));
    return gainPeak * relative;
  }

  // dischargeThreshold({ law, currentPeak, gainPeak, gth }) -> A, or null
  function dischargeThreshold(params) {
    var where = at("dischargeThreshold");
    check.params(where, params, ["law", "currentPeak", "gainPeak", "gth"]);
    var law = readLaw(where, params.law);
    var currentPeak = check.positive(where, "currentPeak", params.currentPeak);
    var gainPeak = check.positive(where, "gainPeak", params.gainPeak);
    var gth = check.positive(where, "gth", params.gth);
    var k = gth / gainPeak;                        // the share of the peak needed
    if (k > 1) return null;

    if (law === "square") return currentPeak * Math.sqrt(k);
    // (a/b)·u/(1 + u) − u = c with c = k(√(a/b) − 1)²:
    //   u² + (1 − a/b + c)·u + c = 0, the smaller root. Written as
    //   2c/(B + √(B² − 4c)) with B = a/b − 1 − c, so a small c loses no
    //   digits. At k = 1 the two roots meet (B² = 4c); rounding may leave
    //   the difference a hair below 0.
    var c = k * (ROOT_RATIO - 1) * (ROOT_RATIO - 1);
    var b = GAIN_RATIO - 1 - c;
    var u = 2 * c / (b + Math.sqrt(Math.max(0, b * b - 4 * c)));
    return u * currentPeak / (ROOT_RATIO - 1);
  }

  E.pumps = Object.freeze({
    gainRatio: GAIN_RATIO,
    flash: flash,
    dischargeGain: dischargeGain,
    dischargeThreshold: dischargeThreshold,
    dischargeMax: dischargeMax
  });
})(this);
