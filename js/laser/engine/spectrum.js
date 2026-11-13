/* ============================================================================
   spectrum.js — emission, lineshapes and the gain curve.

   PART OF THE LASER ENGINE (js/laser/engine/): plain numbers in and out, SI
   units, nothing on the page. Needs constants.js to be loaded first.

   So far this file has only the thermal-equilibrium part of
   docs/laser-physics.md §1: why an ordinary hot source is not a laser.
   Lineshapes, the gain curve and the comb of cavity modes (§1, §3.3) are
   added here in build stage 2 (see docs/laser-plan.md).

   Tests: tests/laser/spectrum.test.js
   ========================================================================== */
(function (root) {
  "use strict";

  var E = root.LaserEngine = root.LaserEngine || {};
  if (!E.constants) {
    throw new Error("spectrum.js needs js/laser/engine/constants.js to be loaded first.");
  }

  var h = E.constants.h;
  var c = E.constants.c;
  var k = E.constants.k;

  // A temperature, wavelength or degeneracy that is zero, negative, infinite
  // or not a number at all is a mistake in the caller (e.g. a slider that
  // goes too far), not physics. Say so loudly instead of returning a number
  // that looks real.
  function checkPositive(name, value, functionName) {
    if (typeof value !== "number" || !isFinite(value) || value <= 0) {
      throw new Error("LaserEngine.spectrum." + functionName + ": " + name +
        " must be a positive finite number, got " + value + ".");
    }
  }

  // hν/kT for light of wavelength lam at temperature T.
  function energyOverKT(lam, T) {
    return h * c / (lam * k * T);
  }

  E.spectrum = Object.freeze({

    // In thermal equilibrium at temperature T, how many photons of wavelength
    // lam are emitted by stimulated emission for every one emitted
    // spontaneously:  1 / (exp(hν/kT) − 1).   (§1, Problems 4–5 to §119)
    stimulatedToSpontaneous: function (lam, T) {
      checkPositive("lam", lam, "stimulatedToSpontaneous");
      checkPositive("T", T, "stimulatedToSpontaneous");
      // Math.expm1(x) is exp(x) − 1 computed without the rounding error the
      // plain subtraction has when x is small (long wavelengths, hot sources).
      return 1 / Math.expm1(energyOverKT(lam, T));
    },

    // The wavelength above which stimulated emission wins at temperature T:
    // the ratio above equals 1 when hν = kT·ln 2.   ≈ 69 µm at 300 K.
    crossoverLam: function (T) {
      checkPositive("T", T, "crossoverLam");
      return h * c / (k * T * Math.LN2);
    },

    // The temperature above which stimulated emission wins at wavelength lam.
    // ≈ 3.8×10⁴ K for green light (550 nm).
    crossoverT: function (lam) {
      checkPositive("lam", lam, "crossoverT");
      return h * c / (k * lam * Math.LN2);
    },

    // Boltzmann population ratio N₂/N₁ of two levels lam apart in energy:
    // (g₂/g₁)·exp(−hν/kT). deg1 and deg2 are the level degeneracies; leave
    // them out for non-degenerate levels.  ≈ 10⁻³⁰ for ruby (694 nm) at 300 K.
    boltzmannRatio: function (lam, T, deg1, deg2) {
      checkPositive("lam", lam, "boltzmannRatio");
      checkPositive("T", T, "boltzmannRatio");
      if (deg1 === undefined) deg1 = 1;
      if (deg2 === undefined) deg2 = 1;
      checkPositive("deg1", deg1, "boltzmannRatio");
      checkPositive("deg2", deg2, "boltzmannRatio");
      return (deg2 / deg1) * Math.exp(-energyOverKT(lam, T));
    }
  });
})(this);
