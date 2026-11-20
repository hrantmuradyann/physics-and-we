/* ============================================================================
   lenses.js — the optics outside the laser: the glasses' indices, thick
   lenses and their shapes, the exact ray trace through them, the Gaussian
   beam through lenses and telescopes, and the light at a target
   (docs/laser-physics.md §8.1–8.5, §8.8, §8.3).

   PART OF THE LASER ENGINE (js/laser/engine/): plain numbers in and out, SI
   units, nothing on the page. Needs check.js, constants.js and optics.js
   to be loaded first.

   CONVENTIONS
     The light goes along +z. Every length is in m, every wavelength in m
     (turned into µm only inside glassIndex, where the Sellmeier
     coefficients need it). A surface is given by its curvature c = 1/R,
     positive when its centre of curvature lies ahead (to +z), as in §8.1;
     a flat surface is c = 0 (check.js refuses R = ∞). So a biconvex lens
     has c1 > 0 and c2 < 0.
     A ray is (y, angle): its height above the axis (m) and its angle to
     the axis (rad, positive upwards). A matrix is { A, B, C, D }, as in
     optics.js: (y′, θ′) = (A·y + B·θ, C·y + D·θ).
     A Gaussian beam is its complex parameter q = { re, im } = z + i·z_R
     (§8.4): re is how far the beam is past its waist, im its Rayleigh
     range; 1/q = 1/R − i·M²λ/(πw²).

     LaserEngine.lenses.GLASSES                 the Sellmeier glasses (§8.2)
     LaserEngine.lenses.glassIndex({ glass, lam })               n
     LaserEngine.lenses.surface({ n1, n2, c })                   matrix (§8.1)
     LaserEngine.lenses.thickLens({ n, c1, c2, d })
                          { matrix, power, f, backFocus, frontFocus }
     LaserEngine.lenses.LENS_SHAPES             §8.1's catalogue
     LaserEngine.lenses.lensFor({ shape, f, n, d })              { c1, c2 }
     LaserEngine.lenses.traceExact({ surfaces, z, y, angle, n })
                          { points, angle, n, tir, blocked }      (§8.2)
     LaserEngine.lenses.axisCrossing({ z, y, angle })            z or null
     LaserEngine.lenses.beamQ({ w, curvature, lam, M2 })         q
     LaserEngine.lenses.propagate({ q, matrix })                 q
     LaserEngine.lenses.beamOf({ q, lam, M2 })
                          { w, curvature, w0, toWaist, zR }
     LaserEngine.lenses.selfImage({ w0, s, f, lam, M2 })
                          { w0, s, zR, magnification }            (Self)
     LaserEngine.lenses.focusedSpot({ w, f, lam, M2 })           { w, depth }
     LaserEngine.lenses.airyRadius({ f, lam, r })                m
     LaserEngine.lenses.telescope({ f1, f2 })
                          { magnification, length, internalFocus } (§8.5)
     LaserEngine.lenses.atTarget({ power, area, n })
                          { I, E0, Erms, pressureAbsorbed, pressureMirror } (§8.8)
     LaserEngine.lenses.brightnessTemperature({ power, linewidth })  K (§8.3)
     LaserEngine.lenses.BREAKDOWN               W/m² (§8.8)

   Tests: tests/laser/lenses.test.js
   ========================================================================== */
(function (root) {
  "use strict";

  var E = root.LaserEngine = root.LaserEngine || {};
  if (!E.check || !E.constants || !E.optics) {
    throw new Error("lenses.js needs check.js, constants.js and optics.js to be loaded first.");
  }

  var check = E.check;
  var K = E.constants;
  var um = K.um;
  var cm = K.cm;

  function at(functionName) {
    return "LaserEngine.lenses." + functionName;
  }

  function freezeAll(object) {
    Object.keys(object).forEach(function (key) {
      var value = object[key];
      if (value && typeof value === "object") freezeAll(value);
    });
    return Object.freeze(object);
  }

  /* ---------- the glasses (§8.2) ---------- */

  // n² = 1 + Σ Bᵢλ²/(λ² − Cᵢ), λ in µm, Cᵢ in µm². `from` and `to` (m) are
  // the range the fit is valid in; outside it the glass is refused.
  // Sources and checks: docs/laser-physics.md §8.2.
  var GLASSES = freezeAll({
    // SCHOTT's N-BK7 data sheet.
    "n-bk7": {
      B: [1.03961212, 0.231792344, 1.01046945],
      C: [0.00600069867, 0.0200179144, 103.560653],
      from: 0.3 * um, to: 2.5 * um
    },
    // Malitson 1965, who gives the resonances as wavelengths (µm).
    "fused-silica": {
      B: [0.6961663, 0.4079426, 0.8974794],
      C: [0.0684043 * 0.0684043, 0.1162414 * 0.1162414, 9.896161 * 9.896161],
      from: 0.21 * um, to: 3.71 * um
    },
    // CVD ZnSe at 23 °C: Connolly 1979, as fitted by Tatian 1984.
    "znse": {
      B: [4.45813734, 0.467216334, 2.89566290],
      C: [0.200859853 * 0.200859853, 0.391371166 * 0.391371166, 47.1362108 * 47.1362108],
      from: 0.54 * um, to: 18.2 * um
    }
  });

  function oneOf(where, name, value, table) {
    if (typeof value !== "string" || !Object.prototype.hasOwnProperty.call(table, value)) {
      check.fail(where, name + " must be one of " + Object.keys(table).map(function (id) {
        return "\"" + id + "\"";
      }).join(", ") + ", got " + check.describe(value) + ".");
    }
    return table[value];
  }

  function glassIndex(params) {
    var where = at("glassIndex");
    check.params(where, params, ["glass", "lam"]);
    var glass = oneOf(where, "glass", params.glass, GLASSES);
    var lam = check.positive(where, "lam", params.lam);
    if (lam < glass.from || lam > glass.to) {
      check.fail(where, "lam = " + lam + " m is outside " + params.glass + "'s range, " +
        glass.from + " to " + glass.to + " m (lam is in metres).");
    }
    var x = lam / um;                     // the Sellmeier fit takes µm
    var x2 = x * x;
    var n2 = 1;
    for (var i = 0; i < 3; i++) n2 += glass.B[i] * x2 / (x2 - glass.C[i]);
    return Math.sqrt(n2);
  }

  /* ---------- surfaces and lenses (§8.1) ---------- */

  function matrix(A, B, C, D) {
    return { A: A, B: B, C: C, D: D };
  }

  function surfaceMatrix(n1, n2, c) {
    return matrix(1, 0, (n1 - n2) * c / n2, n1 / n2);
  }

  function surface(params) {
    var where = at("surface");
    check.params(where, params, ["n1", "n2", "c"]);
    var n1 = check.atLeast(where, "n1", params.n1, 1);
    var n2 = check.atLeast(where, "n2", params.n2, 1);
    var c = check.finite(where, "c", params.c);
    return surfaceMatrix(n1, n2, c);
  }

  // A lens in air: S₂·T(d)·S₁. Its power is −C; the back focus is −A/C
  // past the back vertex, the front focus −D/C before the front one.
  function lensMatrix(n, c1, c2, d) {
    return E.optics.multiply([surfaceMatrix(1, n, c1), E.optics.freeSpace(d), surfaceMatrix(n, 1, c2)]);
  }

  function thickLens(params) {
    var where = at("thickLens");
    check.params(where, params, ["n", "c1", "c2", "d"]);
    var n = check.atLeast(where, "n", params.n, 1);
    var c1 = check.finite(where, "c1", params.c1);
    var c2 = check.finite(where, "c2", params.c2);
    var d = check.atLeast(where, "d", params.d, 0);
    var M = lensMatrix(n, c1, c2, d);
    // A flat window has C = 0 and no power. (Tested as === 0 before the
    // minus sign, so it never reads "−0".)
    if (M.C === 0) return { matrix: M, power: 0, f: null, backFocus: null, frontFocus: null };
    var power = -M.C;
    return { matrix: M, power: power, f: 1 / power, backFocus: -M.A / M.C, frontFocus: -M.D / M.C };
  }

  // §8.1's catalogue. bend is Coddington's shape factor (c1 + c2)/(c1 − c2):
  // 0 a symmetric lens, 1 flat at the back, −1 flat at the front.
  var LENS_SHAPES = freezeAll({
    "biconvex": { bend: 0, converging: true },
    "plano-convex": { bend: 1, converging: true },      // curved side towards the beam
    "convex-plano": { bend: -1, converging: true },     // the same lens turned round
    "meniscus": { bend: 2, converging: true },
    "biconcave": { bend: 0, converging: false },
    "plano-concave": { bend: 1, converging: false }
  });

  // Curvatures for a lens of the shape whose THICK lens has focal length f:
  // the thin lens's c₁, c₂ times the scale s that solves §8.1's
  // (n − 1)[s(c₁ − c₂) + s²(n − 1)d·c₁c₂/n] = 1/f, the root nearest 1.
  function lensFor(params) {
    var where = at("lensFor");
    check.params(where, params, ["shape", "f", "n", "d"]);
    var shape = oneOf(where, "shape", params.shape, LENS_SHAPES);
    var f = check.finite(where, "f", params.f);
    if (f === 0) check.fail(where, "f must be a finite number other than 0, got 0.");
    var n = check.atLeast(where, "n", params.n, 1);
    if (n === 1) check.fail(where, "n must be above 1: a lens of n = 1 does not bend light.");
    var d = check.atLeast(where, "d", params.d, 0);
    if (shape.converging && f < 0) check.fail(where, "a " + params.shape + " lens converges: f must be positive, got " + f + ".");
    if (!shape.converging && f > 0) check.fail(where, "a " + params.shape + " lens diverges: f must be negative, got " + f + ".");

    // k = c₁ − c₂ of the thin lens, which is also 1/(f(n − 1)), what the
    // quadratic below must reach: b·s² + k·s − k = 0.
    var k = 1 / (f * (n - 1));
    var c1 = k * (shape.bend + 1) / 2;
    var c2 = k * (shape.bend - 1) / 2;
    var b = (n - 1) * d * c1 * c2 / n;
    var scale = 1;
    if (b !== 0) {
      var disc = k * k + 4 * b * k;
      if (disc < 0) {
        check.fail(where, "no " + params.shape + " lens " + d + " m thick has f = " + f + " m.");
      }
      var root1 = (-k + Math.sqrt(disc)) / (2 * b);
      var root2 = (-k - Math.sqrt(disc)) / (2 * b);
      scale = Math.abs(root1 - 1) <= Math.abs(root2 - 1) ? root1 : root2;
    }
    // A flat side is exactly 0: bend ±1 makes one of k·(bend ± 1)/2 zero,
    // and a zero times a negative scale or k would read "−0".
    var curved1 = scale * c1;
    var curved2 = scale * c2;
    if (curved1 === 0) curved1 = 0;
    if (curved2 === 0) curved2 = 0;
    return { c1: curved1, c2: curved2 };
  }

  /* ---------- the exact ray trace (§8.2) ---------- */

  // A surface with its vertex at the origin, in the vertex form
  // c·(Z² + y²) − 2Z = 0: a sphere of radius 1/c through the vertex, and
  // for c = 0 the plane Z = 0 (the same formula, with no 1/c to overflow
  // when c is tiny). Z is measured from the vertex.
  //
  // Where a ray from (z, y) along the unit direction (dz, dy) meets the
  // surface whose vertex is at zv: the distance t along the ray, or null
  // if it misses. Along the ray the form is A·t² + B·t + C = 0; both roots
  // are found the stable way (q/A and C/q, so nothing cancels), and the
  // first one ahead on the vertex's half of the sphere (c·Z < 1, the side
  // of the centre the vertex is on) is the one the light meets.
  function meet(z, y, dz, dy, zv, c) {
    var Z = z - zv;
    var A = c;
    var B = 2 * (c * (Z * dz + y * dy) - dz);
    var C = c * (Z * Z + y * y) - 2 * Z;
    var disc = B * B - 4 * A * C;
    if (disc < 0) return null;
    var root = Math.sqrt(disc);
    var q = B < 0 ? -(B - root) / 2 : -(B + root) / 2;
    if (q === 0) return null;                     // the ray only grazes it
    var roots = [C / q];
    if (A !== 0) roots.push(q / A);
    var best = null;
    roots.forEach(function (t) {
      var onVertexSide = c * (Z + t * dz) < 1;
      if (t >= 0 && onVertexSide && (best === null || t < best)) best = t;
    });
    return best;
  }

  // How far along z the surface lies from its vertex at height y (its
  // sag), for a height up to the sphere's radius.
  function sagAt(c, y) {
    if (c === 0) return 0;
    var h = Math.min(Math.abs(y), 1 / Math.abs(c));
    return c * h * h / (1 + Math.sqrt(1 - c * c * h * h));
  }

  function readSurfaces(where, list) {
    if (!Array.isArray(list) || list.length === 0) {
      check.fail(where, "surfaces must be a non-empty array of { z, c, n, aperture }, got " + check.describe(list) + ".");
    }
    return list.map(function (s, i) {
      var name = "surfaces[" + i + "]";
      check.params(where, s, ["z", "c", "n", "aperture"]);
      var z = check.finite(where, name + ".z", s.z);
      if (i > 0 && z < list[i - 1].z) {
        check.fail(where, name + ".z (" + z + " m) is before surfaces[" + (i - 1) + "] (" + list[i - 1].z + " m).");
      }
      return {
        z: z,
        c: check.finite(where, name + ".c", s.c),
        n: check.atLeast(where, name + ".n", s.n, 1),
        aperture: check.positive(where, name + ".aperture", s.aperture)
      };
    });
  }

  function traceExact(params) {
    var where = at("traceExact");
    check.params(where, params, ["surfaces", "z", "y", "angle", "n"]);
    var surfaces = readSurfaces(where, params.surfaces);
    var z = check.finite(where, "z", params.z);
    var y = check.finite(where, "y", params.y);
    var limit = Math.PI / 2 - 1e-9;
    var angle = check.between(where, "angle", params.angle, -limit, limit);
    var n = check.atLeast(where, "n", params.n, 1);
    // Before the first surface at the ray's own height: a concave face's
    // edges reach back towards the light, past its vertex.
    var firstAt = surfaces[0].z + sagAt(surfaces[0].c, y);
    if (z >= firstAt) {
      check.fail(where, "the ray starts at z = " + z + " m, past the first surface at its height (z = " + firstAt + " m).");
    }

    var dz = Math.cos(angle);
    var dy = Math.sin(angle);
    var points = [{ z: z, y: y }];
    for (var i = 0; i < surfaces.length; i++) {
      var s = surfaces[i];
      var t = meet(z, y, dz, dy, s.z, s.c);
      if (t === null) {
        // It misses the sphere: it ends at the vertex's plane, if that is
        // still ahead of it.
        var tPlane = (s.z - z) / dz;
        if (tPlane > 0) points.push({ z: s.z, y: y + tPlane * dy });
        return { points: points, angle: Math.atan2(dy, dz), n: n, tir: null, blocked: i };
      }
      z = z + t * dz;
      y = y + t * dy;
      points.push({ z: z, y: y });
      if (Math.abs(y) > s.aperture) {
        return { points: points, angle: Math.atan2(dy, dz), n: n, tir: null, blocked: i };
      }
      // The surface's unit normal at the hit point: the vertex form's
      // gradient, (c·Z − 1, c·y), made one long and turned to face the ray.
      var gz = s.c * (z - s.z) - 1;
      var gy = s.c * y;
      var size = Math.sqrt(gz * gz + gy * gy);
      var nz = gz / size;
      var ny = gy / size;
      if (nz * dz + ny * dy > 0) {
        nz = -nz;
        ny = -ny;
      }
      // Snell's law in vector form (§8.2).
      var eta = n / s.n;
      var cos1 = -(nz * dz + ny * dy);
      var under = 1 - eta * eta * (1 - cos1 * cos1);
      if (under < 0) {
        return { points: points, angle: Math.atan2(dy, dz), n: n, tir: i, blocked: null };
      }
      var cos2 = Math.sqrt(under);
      var tz = eta * dz + (eta * cos1 - cos2) * nz;
      var ty = eta * dy + (eta * cos1 - cos2) * ny;
      var length = Math.sqrt(tz * tz + ty * ty);
      dz = tz / length;
      dy = ty / length;
      n = s.n;
      // Bent so steeply that it runs back against the light (near the rim
      // of a deep face): it goes no further through the lens.
      if (dz <= 0) {
        return { points: points, angle: Math.atan2(dy, dz), n: n, tir: null, blocked: i };
      }
    }
    return { points: points, angle: Math.atan2(dy, dz), n: n, tir: null, blocked: null };
  }

  function axisCrossing(params) {
    var where = at("axisCrossing");
    check.params(where, params, ["z", "y", "angle"]);
    var z = check.finite(where, "z", params.z);
    var y = check.finite(where, "y", params.y);
    var angle = check.between(where, "angle", params.angle, -Math.PI / 2, Math.PI / 2);
    if (y === 0) return z;
    // Ahead only if the ray runs towards the axis.
    if (angle === 0 || (y > 0) === (angle > 0)) return null;
    return z - y / Math.tan(angle);
  }

  /* ---------- the Gaussian beam (§8.4) ---------- */

  function readM2(where, value) {
    return check.atLeast(where, "M2", value, 1);
  }

  function readQ(where, q) {
    check.params(where, q, ["re", "im"]);
    return { re: check.finite(where, "q.re", q.re), im: check.positive(where, "q.im", q.im) };
  }

  // 1/q = curvature − i·M²λ/(πw²), so q = (a + ib)/(a² + b²).
  function beamQ(params) {
    var where = at("beamQ");
    check.params(where, params, ["w", "curvature", "lam", "M2"]);
    var w = check.positive(where, "w", params.w);
    var a = check.finite(where, "curvature", params.curvature);
    var lam = check.positive(where, "lam", params.lam);
    var b = readM2(where, params.M2) * lam / (Math.PI * w * w);
    var size = a * a + b * b;
    return { re: a / size, im: b / size };
  }

  // q₂ = (Aq₁ + B)/(Cq₁ + D), complex, in air on both sides.
  function propagate(params) {
    var where = at("propagate");
    check.params(where, params, ["q", "matrix"]);
    var q = readQ(where, params.q);
    var M = params.matrix;
    check.params(where, M, ["A", "B", "C", "D"]);
    ["A", "B", "C", "D"].forEach(function (name) { check.finite(where, "matrix." + name, M[name]); });
    // In air on both sides the determinant is 1 (§8.1: det S = n₁/n₂, so a
    // matrix that ends in glass has another, and q would come out wrong).
    var det = M.A * M.D - M.B * M.C;
    var scale = Math.max(1, Math.abs(M.A * M.D) + Math.abs(M.B * M.C));
    if (Math.abs(det - 1) > 1e-9 * scale) {
      check.fail(where, "the matrix's determinant is " + det + ", not 1: the beam must start and end in air.");
    }
    var topRe = M.A * q.re + M.B;
    var topIm = M.A * q.im;
    var bottomRe = M.C * q.re + M.D;
    var bottomIm = M.C * q.im;
    var size = bottomRe * bottomRe + bottomIm * bottomIm;
    return {
      re: (topRe * bottomRe + topIm * bottomIm) / size,
      im: (topIm * bottomRe - topRe * bottomIm) / size
    };
  }

  function beamOf(params) {
    var where = at("beamOf");
    check.params(where, params, ["q", "lam", "M2"]);
    var q = readQ(where, params.q);
    var lam = check.positive(where, "lam", params.lam);
    var M2 = readM2(where, params.M2);
    var size = q.re * q.re + q.im * q.im;
    return {
      w: Math.sqrt(M2 * lam * size / (Math.PI * q.im)),
      curvature: q.re / size,
      w0: Math.sqrt(M2 * lam * q.im / Math.PI),
      toWaist: -q.re,
      zR: q.im
    };
  }

  // Self's formula (§8.4): the waist w₀ at s before a thin lens f.
  function selfImage(params) {
    var where = at("selfImage");
    check.params(where, params, ["w0", "s", "f", "lam", "M2"]);
    var w0 = check.positive(where, "w0", params.w0);
    var s = check.finite(where, "s", params.s);
    var f = check.finite(where, "f", params.f);
    if (f === 0) check.fail(where, "f must be a finite number other than 0, got 0.");
    var lam = check.positive(where, "lam", params.lam);
    var M2 = readM2(where, params.M2);
    var zR1 = Math.PI * w0 * w0 / (M2 * lam);
    var magnification = f / Math.sqrt((s - f) * (s - f) + zR1 * zR1);
    var w02 = Math.abs(magnification) * w0;
    return {
      w0: w02,
      s: f + magnification * magnification * (s - f),
      zR: Math.PI * w02 * w02 / (M2 * lam),
      magnification: magnification
    };
  }

  function focusedSpot(params) {
    var where = at("focusedSpot");
    check.params(where, params, ["w", "f", "lam", "M2"]);
    var w = check.positive(where, "w", params.w);
    var f = check.positive(where, "f", params.f);
    var lam = check.positive(where, "lam", params.lam);
    var M2 = readM2(where, params.M2);
    var wf = M2 * lam * f / (Math.PI * w);
    return { w: wf, depth: 2 * Math.PI * wf * wf / (M2 * lam) };
  }

  // A uniform round beam of radius r: the Airy disk's radius (§8.4).
  function airyRadius(params) {
    var where = at("airyRadius");
    check.params(where, params, ["f", "lam", "r"]);
    var f = check.positive(where, "f", params.f);
    var lam = check.positive(where, "lam", params.lam);
    var r = check.positive(where, "r", params.r);
    return 0.61 * f * lam / r;
  }

  /* ---------- the telescope (§8.5) ---------- */

  function telescope(params) {
    var where = at("telescope");
    check.params(where, params, ["f1", "f2"]);
    var f1 = check.finite(where, "f1", params.f1);
    var f2 = check.finite(where, "f2", params.f2);
    if (f1 === 0) check.fail(where, "f1 must be a finite number other than 0, got 0.");
    if (f2 === 0) check.fail(where, "f2 must be a finite number other than 0, got 0.");
    var length = f1 + f2;
    if (length <= 0) check.fail(where, "the lenses would be " + length + " m apart (f1 + f2): no telescope.");
    return { magnification: -f2 / f1, length: length, internalFocus: f1 > 0 && f2 > 0 };
  }

  /* ---------- at the target (§8.8, §8.3) ---------- */

  function atTarget(params) {
    var where = at("atTarget");
    check.params(where, params, ["power", "area", "n"]);
    var power = check.atLeast(where, "power", params.power, 0);
    var area = check.positive(where, "area", params.area);
    var n = check.atLeast(where, "n", params.n, 1);
    var I = power / area;
    var E0 = Math.sqrt(2 * I / (K.c * K.eps0 * n));
    return {
      I: I,
      E0: E0,
      Erms: E0 / Math.SQRT2,
      pressureAbsorbed: I / K.c,
      pressureMirror: 2 * I / K.c
    };
  }

  // §8.3, a diffraction-limited beam (S·δΩ ≈ λ²): T = W/(2k·δν).
  function brightnessTemperature(params) {
    var where = at("brightnessTemperature");
    check.params(where, params, ["power", "linewidth"]);
    var power = check.atLeast(where, "power", params.power, 0);
    var linewidth = check.positive(where, "linewidth", params.linewidth);
    return power / (2 * K.k * linewidth);
  }

  E.lenses = Object.freeze({
    GLASSES: GLASSES,
    glassIndex: glassIndex,
    surface: surface,
    thickLens: thickLens,
    LENS_SHAPES: LENS_SHAPES,
    lensFor: lensFor,
    traceExact: traceExact,
    axisCrossing: axisCrossing,
    beamQ: beamQ,
    propagate: propagate,
    beamOf: beamOf,
    selfImage: selfImage,
    focusedSpot: focusedSpot,
    airyRadius: airyRadius,
    telescope: telescope,
    atTarget: atTarget,
    brightnessTemperature: brightnessTemperature,
    // Where air breaks down into a plasma: 10⁹–10¹¹ W/cm² by the material
    // and the pulse (§8.8); the simulator takes the middle on a log scale,
    // 10¹⁰ W/cm², as an illustration.
    BREAKDOWN: 1e10 / (cm * cm)
  });
})(this);
