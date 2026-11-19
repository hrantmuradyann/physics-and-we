/* ============================================================================
   optics.js — the mirrors of the cavity: rays and the beam between them,
   whether the pair keeps the light (stability), the Gaussian mode, each
   mirror's focal point, and the light the mirrors lose
   (docs/laser-physics.md §7.1–7.4 and §7.7).

   PART OF THE LASER ENGINE (js/laser/engine/): plain numbers in and out, SI
   units, nothing on the page. Needs check.js to be loaded first.

   SIGN CONVENTIONS (D9 of docs/laser-plan.md)
     A mirror is given by its curvature c = 1/R, signed: c > 0 for a concave
     mirror (its centre of curvature in front of it, inside the cavity),
     c < 0 for a convex one, c = 0 for a flat one. (A flat mirror's R = ∞
     cannot be passed: check.js refuses Infinity.) In the unfolded cavity a
     mirror is a thin lens of focal length f = R/2, so its matrix is
     [[1, 0], [−2c, 1]]. Its focal point is f = R/2 in front of a concave
     mirror (real) and |R|/2 behind a convex one (virtual).
     A ray is (y, θ): its height above the axis, m, and its angle, rad.

   THE ROD (D10). The gain medium, of length l_g and index n, sits in the
   middle of the cavity. For the beam and the rays it is the same as free
   space l_g/n (the reduced length), so the whole cavity acts as an empty
   one of length L* = L − l_g + l_g/n, and g = 1 − L*·c (§7.1). Heights at
   the mirrors are real heights; an angle is the angle in air.

   THE APERTURE. The rod's radius (or the gas tube's bore) limits the
   light. It is taken at both mirrors: for a tube that fills the cavity
   that is exact (the widest beam is at a mirror), for a shorter rod it
   loses a little more than the real one.

     LaserEngine.optics.freeSpace(d)                 [[1, d], [0, 1]]
     LaserEngine.optics.slab({ l, n })               free space l/n
     LaserEngine.optics.mirror(c)                    [[1, 0], [−2c, 1]]
     LaserEngine.optics.multiply([first, second, …]) the matrix of the
                                       elements in the order light meets them
     LaserEngine.optics.reducedLength({ L, l_g, n }) L* = L − l_g + l_g/n
     LaserEngine.optics.roundTrip({ L, l_g, n, c1, c2 })   the round trip
                                       from mirror 1, out to mirror 2 and back
     LaserEngine.optics.resonator({ L, l_g, n, c1, c2, lam, aperture })
                                       everything about the pair (below)
     LaserEngine.optics.beamRadius({ L, l_g, n, c1, c2, lam, z })   w at z
                                       (m from mirror 1), null if no mode
     LaserEngine.optics.traceRay({ L, l_g, n, c1, c2, aperture, y, theta, roundTrips })
                                       one ray bounced between the mirrors
     LaserEngine.optics.plateLoss(fresnel)   the diffraction loss per pass
                                       of two flat round mirrors (§7.7)

   A matrix is { A, B, C, D }: (y′, θ′) = (A·y + B·θ, C·y + D·θ).

   Tests: tests/laser/optics.test.js
   ========================================================================== */
(function (root) {
  "use strict";

  var E = root.LaserEngine = root.LaserEngine || {};
  if (!E.check) {
    throw new Error("optics.js needs js/laser/engine/check.js to be loaded first.");
  }

  var check = E.check;

  // Vainshtein's plane-parallel loss (§7.7; Kogelnik & Li 1966, eq. (86)):
  // δ = 0.824 = −ζ(1/2)/√π, and κ₀₀ = 2.4048, the first zero of the
  // Bessel function J₀ (the lowest mode, TEM₀₀).
  var VAINSHTEIN_DELTA = 0.824;
  var KAPPA_00 = 2.404825557695773;

  // traceRay's longest run: enough for a ray that stays (1000 round trips
  // in the tests), and a bound on the array it returns.
  var MAX_ROUND_TRIPS = 10000;

  function at(functionName) {
    return "LaserEngine.optics." + functionName;
  }

  /* ---------- matrices (§7.3) ---------- */

  function matrix(A, B, C, D) {
    return { A: A, B: B, C: C, D: D };
  }

  function freeSpace(d) {
    check.atLeast(at("freeSpace"), "d", d, 0);
    return matrix(1, d, 0, 1);
  }

  // A slab of length l and index n acts on the beam as free space l/n
  // (§7.3; D10: the reduced length, used everywhere in this file).
  function slab(params) {
    var where = at("slab");
    check.params(where, params, ["l", "n"]);
    var l = check.atLeast(where, "l", params.l, 0);
    var n = check.atLeast(where, "n", params.n, 1);
    return matrix(1, l / n, 0, 1);
  }

  // A mirror of curvature c (1/m; concave > 0, convex < 0, flat 0),
  // unfolded into a thin lens of focal length R/2.
  function mirror(c) {
    check.finite(at("mirror"), "c", c);
    return matrix(1, 0, 0 - 2 * c, 1);            // 0 − 0 = 0, not −0, for a flat mirror
  }

  // The product of matrices; list[0] is the element the light meets first.
  function times(second, first) {
    return matrix(
      second.A * first.A + second.B * first.C,
      second.A * first.B + second.B * first.D,
      second.C * first.A + second.D * first.C,
      second.C * first.B + second.D * first.D
    );
  }

  function multiply(list) {
    var where = at("multiply");
    if (!Array.isArray(list) || list.length === 0) {
      check.fail(where, "needs a non-empty array of matrices { A, B, C, D }, got " + check.describe(list) + ".");
    }
    var result = matrix(1, 0, 0, 1);
    list.forEach(function (element, i) {
      check.params(where, element, ["A", "B", "C", "D"]);
      ["A", "B", "C", "D"].forEach(function (name) {
        check.finite(where, "list[" + i + "]." + name, element[name]);
      });
      result = times(element, result);
    });
    return result;
  }

  /* ---------- the cavity ---------- */

  // Checks L, l_g and n, and returns L* = L − l_g + l_g/n.
  function readLength(where, params) {
    var L = check.positive(where, "L", params.L);
    var l_g = check.atLeast(where, "l_g", params.l_g, 0);
    var n = check.atLeast(where, "n", params.n, 1);
    if (l_g > L) check.fail(where, "l_g (" + l_g + " m) is longer than the cavity (L = " + L + " m).");
    return L - l_g + l_g / n;
  }

  function reducedLength(params) {
    var where = at("reducedLength");
    check.params(where, params, ["L", "l_g", "n"]);
    return readLength(where, params);
  }

  // The round trip from mirror 1: across to mirror 2 (reduced length L*),
  // off it, back, and off mirror 1.
  function roundTripOf(Lr, c1, c2) {
    return times(mirror(c1), times(matrix(1, Lr, 0, 1), times(mirror(c2), matrix(1, Lr, 0, 1))));
  }

  function roundTrip(params) {
    var where = at("roundTrip");
    check.params(where, params, ["L", "l_g", "n", "c1", "c2"]);
    var Lr = readLength(where, params);
    var c1 = check.finite(where, "c1", params.c1);
    var c2 = check.finite(where, "c2", params.c2);
    return roundTripOf(Lr, c1, c2);
  }

  /* ---------- the losses (§7.7) ---------- */

  // The share of the light two flat round mirrors of Fresnel number
  // N = a²/(λL) lose per pass (one mirror to the other) in their lowest
  // mode: Vainshtein's large-N formula (Kogelnik & Li 1966, eq. (86)):
  //   α = 8κ₀₀²·δ(M + δ)/[(M + δ)² + δ²]²,  M = √(8πN),
  // the fractional energy lost per transit (their eq. (81): α = 1 − |γ|²).
  // κ₀₀ is squared: the scan of eq. (86) looks like κ, but only κ² agrees
  // with their eq. (87), β = (M/4δ)α, and the phase shift of their Fig. 24
  // (0.25° at N = 100), and with Fig. 22 (0.0098 dB at N = 24.5, the figure
  // 0.01 dB). Made for large N, it passes 1 at small N (2κ₀₀²/δ² = 17 at
  // N → 0), so the share used is 1 − e^(−α): α itself to first order (at
  // N = 100, 2.9×10⁻⁴ either way; at N = 4, 2.91 % against α = 2.95 %), never
  // above 1.
  function vainshtein(N) {
    var M = Math.sqrt(8 * Math.PI * N);
    var u = M + VAINSHTEIN_DELTA;
    var bottom = u * u + VAINSHTEIN_DELTA * VAINSHTEIN_DELTA;
    var alpha = 8 * KAPPA_00 * KAPPA_00 * VAINSHTEIN_DELTA * u / (bottom * bottom);
    return -Math.expm1(-alpha);
  }

  function plateLoss(fresnel) {
    check.positive(at("plateLoss"), "fresnel", fresnel);
    return vainshtein(fresnel);
  }

  // How much of the round trip's spot "fits" mirror i: Y_i with
  // w_i² = (λL*/π)/√Y_i (§7.2: Y₁ = g₁(1 − g₁g₂)/g₂). Positive inside the
  // stable region, negative outside it, 0 where the spot grows without
  // bound (the edges g₁g₂ = 1, and g_i = 0 with the other g not 0), and
  // Infinity where it shrinks to a point (the other mirror's g = 0). At the
  // confocal point, g₁ = g₂ = 0, where every formula is 0/0, the symmetric
  // limit, 1 (D1).
  function spotFit(gi, gj) {
    if (gi === 0 && gj === 0) return 1;
    if (gj === 0) return Infinity;
    return gi * (1 - gi * gj) / gj;
  }

  // The share mirror i loses per round trip (§7.7): the Gaussian spot
  // clipped by the aperture, e^(−2a²/w²) (§7.4), but never more than two
  // flat mirrors lose (Vainshtein): near an edge the Gaussian spot grows
  // without bound, while the real mode stays about as wide as the aperture
  // (Kogelnik & Li's Fig. 22: the |g| = 0.99 curve lies under the flat
  // mirrors' curve and meets it at small N). Outside the stable region the
  // same with |Y|, so the loss runs on across every edge.
  function mirrorShare(fit, fresnel, flat) {
    var clip = Math.exp(-2 * Math.PI * fresnel * Math.sqrt(Math.abs(fit)));
    return Math.min(clip, flat);
  }

  /* ---------- the Gaussian mode (§7.2, D1) ---------- */

  // The mode of a stable pair in the reduced cavity: the waist's distance
  // from mirror 1 (reduced, m), its Rayleigh range zR (m), and the spots on
  // the mirrors. null outside the strictly stable region (at an edge the
  // Gaussian formulas give 0 or ∞).
  function gaussianMode(Lr, g1, g2, lam) {
    var product = g1 * g2;
    var confocal = g1 === 0 && g2 === 0;
    if (!confocal && !(product > 0 && product < 1)) return null;
    var zR2;
    var z1;
    if (g1 === g2) {
      // The symmetric form, regular at g = 0 (D1): zR² = L²(1 + g)/(4(1 − g)).
      zR2 = Lr * Lr * (1 + g1) / (4 * (1 - g1));
      z1 = Lr / 2;
    } else {
      var sum = g1 + g2 - 2 * product;
      zR2 = Lr * Lr * product * (1 - product) / (sum * sum);
      z1 = Lr * g2 * (1 - g1) / sum;
    }
    var zR = Math.sqrt(zR2);
    var w0 = Math.sqrt(lam * zR / Math.PI);
    var z2 = Lr - z1;
    return {
      zR: zR,
      w0: w0,
      z1: z1,
      w1: w0 * Math.sqrt(1 + (z1 / zR) * (z1 / zR)),
      w2: w0 * Math.sqrt(1 + (z2 / zR) * (z2 / zR))
    };
  }

  // A real distance from mirror 1 (0..L) as a reduced one: the rod, in the
  // middle of the cavity, counts l/n.
  function reducedAt(z, L, l_g, n) {
    var rodStart = (L - l_g) / 2;
    var rodEnd = rodStart + l_g;
    if (z <= rodStart) return z;
    if (z <= rodEnd) return rodStart + (z - rodStart) / n;
    return rodStart + l_g / n + (z - rodEnd);
  }

  // ...and back: a reduced distance (0..L*) as a real one.
  function realAt(zr, L, l_g, n) {
    var rodStart = (L - l_g) / 2;
    if (zr <= rodStart) return zr;
    if (zr <= rodStart + l_g / n) return rodStart + (zr - rodStart) * n;
    return zr + l_g - l_g / n;
  }

  /* ---------- the whole pair ---------- */

  // resonator({ L, l_g, n, c1, c2, lam, aperture }) ->
  //   reducedLength  L*, m
  //   g1, g2, m      §7.1's g-parameters and (A + D)/2 = 2g₁g₂ − 1
  //   stable         true strictly inside 0 < g₁g₂ < 1, and at the confocal
  //                  point g₁ = g₂ = 0; false on an edge and beyond
  //   w0, waistAt, zR, w1, w2   the Gaussian mode (m; waistAt is the real
  //                  distance from mirror 1, zR the reduced Rayleigh
  //                  range), all null when not stable. With a convex
  //                  mirror the waist can lie outside the cavity (waistAt
  //                  < 0 or > L): a virtual waist, which the beam inside
  //                  only points back to; beamRadius covers 0 to L only.
  //   focus1, focus2 each mirror's focal length R/2, m: positive in front
  //                  (concave, real), negative behind (convex, virtual),
  //                  null for a flat mirror
  //   fresnel        N = a²/(λL*)
  //   magnification  M = |m| + √(m² − 1) of an unstable pair, else null
  //   loss1, loss2   the share each mirror's edge takes per round trip
  //   loss           the share lost per round trip, 1 − (1 − loss1)(1 − loss2)/M²
  //   gamma          the same as a single-pass logarithmic loss, like the
  //                  cavity's γ: −½·ln(1 − loss)
  function resonator(params) {
    var where = at("resonator");
    check.params(where, params, ["L", "l_g", "n", "c1", "c2", "lam", "aperture"]);
    var Lr = readLength(where, params);
    var c1 = check.finite(where, "c1", params.c1);
    var c2 = check.finite(where, "c2", params.c2);
    var lam = check.positive(where, "lam", params.lam);
    var aperture = check.positive(where, "aperture", params.aperture);

    var g1 = 1 - Lr * c1;
    var g2 = 1 - Lr * c2;
    var m = 2 * g1 * g2 - 1;
    var mode = gaussianMode(Lr, g1, g2, lam);
    var fresnel = aperture * aperture / (lam * Lr);
    var flat = vainshtein(fresnel);
    var loss1 = mirrorShare(spotFit(g1, g2), fresnel, flat);
    var loss2 = mirrorShare(spotFit(g2, g1), fresnel, flat);
    var magnification = null;
    var walkOff = 0;                       // ln M: the unstable pair's loss per pass
    if (Math.abs(m) > 1) {
      magnification = Math.abs(m) + Math.sqrt(m * m - 1);
      walkOff = Math.log(magnification);
    }
    // −½·ln of what a round trip keeps, (1 − loss1)(1 − loss2)/M².
    var gamma = -0.5 * (Math.log1p(-loss1) + Math.log1p(-loss2)) + walkOff;

    return {
      reducedLength: Lr,
      g1: g1,
      g2: g2,
      m: m,
      stable: mode !== null,
      w0: mode === null ? null : mode.w0,
      waistAt: mode === null ? null : realAt(mode.z1, params.L, params.l_g, params.n),
      zR: mode === null ? null : mode.zR,
      w1: mode === null ? null : mode.w1,
      w2: mode === null ? null : mode.w2,
      focus1: c1 === 0 ? null : 1 / (2 * c1),
      focus2: c2 === 0 ? null : 1 / (2 * c2),
      fresnel: fresnel,
      magnification: magnification,
      loss1: loss1,
      loss2: loss2,
      loss: -Math.expm1(-2 * gamma),
      gamma: gamma
    };
  }

  // beamRadius({ L, l_g, n, c1, c2, lam, z }) -> w (m) at z, the real
  // distance from mirror 1 (0 to L): w0·√(1 + (ζ/zR)²) with ζ the reduced
  // distance from the waist. null when the pair has no Gaussian mode.
  function beamRadius(params) {
    var where = at("beamRadius");
    check.params(where, params, ["L", "l_g", "n", "c1", "c2", "lam", "z"]);
    var Lr = readLength(where, params);
    var c1 = check.finite(where, "c1", params.c1);
    var c2 = check.finite(where, "c2", params.c2);
    var lam = check.positive(where, "lam", params.lam);
    var z = check.between(where, "z", params.z, 0, params.L);
    var mode = gaussianMode(Lr, 1 - Lr * c1, 1 - Lr * c2, lam);
    if (mode === null) return null;
    var zeta = (reducedAt(z, params.L, params.l_g, params.n) - mode.z1) / mode.zR;
    return mode.w0 * Math.sqrt(1 + zeta * zeta);
  }

  // traceRay({ L, l_g, n, c1, c2, aperture, y, theta, roundTrips }) ->
  //   { hits: [{ mirror, y, theta }, …], escaped }
  // A ray leaves mirror 1 at height y (m) and angle theta (rad, in air),
  // going towards mirror 2. Each hit is where it meets a mirror (1 or 2):
  // its height there and its angle after the reflection. If it meets a
  // mirror's plane farther from the axis than the aperture, that is its
  // last hit, with the angle it came in at (it misses the mirror and goes
  // on), and escaped is { mirror, roundTrip } (counting from 1); else
  // escaped is null after `roundTrips` round trips (2·roundTrips hits).
  function traceRay(params) {
    var where = at("traceRay");
    check.params(where, params, ["L", "l_g", "n", "c1", "c2", "aperture", "y", "theta", "roundTrips"]);
    var Lr = readLength(where, params);
    var c1 = check.finite(where, "c1", params.c1);
    var c2 = check.finite(where, "c2", params.c2);
    var aperture = check.positive(where, "aperture", params.aperture);
    var y = check.finite(where, "y", params.y);
    var theta = check.finite(where, "theta", params.theta);
    var roundTrips = check.integerAtLeast(where, "roundTrips", params.roundTrips, 1);
    if (roundTrips > MAX_ROUND_TRIPS) {
      check.fail(where, "roundTrips must be at most " + MAX_ROUND_TRIPS + ", got " + roundTrips + ".");
    }
    if (Math.abs(y) > aperture) {
      check.fail(where, "y (" + y + " m) starts outside the aperture (" + aperture + " m).");
    }

    var hits = [];
    var curvatures = [c2, c1];             // the mirror each pass ends on: 2, then 1
    for (var trip = 1; trip <= roundTrips; trip++) {
      for (var k = 0; k < 2; k++) {
        y = y + Lr * theta;
        var mirrorNumber = k === 0 ? 2 : 1;
        if (Math.abs(y) > aperture) {
          hits.push({ mirror: mirrorNumber, y: y, theta: theta });
          return { hits: hits, escaped: { mirror: mirrorNumber, roundTrip: trip } };
        }
        theta = theta - 2 * curvatures[k] * y;
        hits.push({ mirror: mirrorNumber, y: y, theta: theta });
      }
    }
    return { hits: hits, escaped: null };
  }

  E.optics = Object.freeze({
    freeSpace: freeSpace,
    slab: slab,
    mirror: mirror,
    multiply: multiply,
    reducedLength: reducedLength,
    roundTrip: roundTrip,
    resonator: resonator,
    beamRadius: beamRadius,
    traceRay: traceRay,
    plateLoss: plateLoss
  });
})(this);
