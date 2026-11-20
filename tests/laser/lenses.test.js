/* ============================================================================
   lenses.test.js — js/laser/engine/lenses.js against docs/laser-physics.md
   §8.1–8.5 and §8.8 (docs/laser-plan.md, stage 11a scope card): the
   glasses' indices, the thick lens, the lens shapes, the exact ray trace,
   the Gaussian beam through lenses, the telescope, and the light at a
   target.

   Every call gets a deep-frozen input, so a function that changed its
   input would throw.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine, deepFreeze, assertClose } = require("./helpers.js");

const E = loadEngine();
const Lz = E.lenses;
const C = E.constants;
const nm = 1e-9;
const um = 1e-6;
const mm = 1e-3;
const cm = 1e-2;

function call(name, params) {
  return Lz[name](deepFreeze(params));
}

// The two surfaces of a lens in air: front vertex at z = 0, back at d.
function lensSurfaces(lens, n, d, aperture) {
  return [
    { z: 0, c: lens.c1, n: n, aperture: aperture },
    { z: d, c: lens.c2, n: 1, aperture: aperture }
  ];
}

// Where a ray parallel to the axis at height y, coming from z = −1 cm,
// crosses the axis behind the lens.
function crossing(surfaces, y) {
  const out = call("traceExact", { surfaces: surfaces, z: -1 * cm, y: y, angle: 0, n: 1 });
  assert.equal(out.tir, null);
  assert.equal(out.blocked, null);
  const last = out.points[out.points.length - 1];
  return call("axisCrossing", { z: last.z, y: last.y, angle: out.angle });
}

/* ---------- the glasses (§8.2, D6) ---------- */

test("glassIndex: the catalogue values at the d line (587.56 nm), and ZnSe at CO₂'s 10.6 µm", () => {
  // Each value to exactly the digits its source gives.
  const digits = (glass, lam, places) => Math.round(call("glassIndex", { glass: glass, lam: lam }) * 10 ** places) / 10 ** places;
  const d = 587.5618 * nm;
  // SCHOTT's n_d = 1.51680 for N-BK7; Malitson's 1.45846 for fused silica.
  assert.equal(digits("n-bk7", d, 5), 1.5168, "N-BK7");
  assert.equal(digits("fused-silica", d, 5), 1.45846, "fused silica");
  // The F and C lines of N-BK7 (SCHOTT: 1.52238, 1.51432).
  assert.equal(digits("n-bk7", 486.1327 * nm, 5), 1.52238, "N-BK7 F");
  assert.equal(digits("n-bk7", 656.2725 * nm, 5), 1.51432, "N-BK7 C");
  // ZnSe: 2.403 at 10.6 µm, the value CO₂ optics catalogues give, and
  // 2.591 at 632.8 nm (the scope card's recomputation: 2.40278, 2.59109).
  assert.equal(digits("znse", 10.6 * um, 3), 2.403, "ZnSe, 10.6 µm");
  assert.equal(digits("znse", 632.8 * nm, 3), 2.591, "ZnSe, 632.8 nm");
});

test("glassIndex: normal dispersion, blue bent more than red, across each glass's range", () => {
  for (const id of Object.keys(Lz.GLASSES)) {
    const glass = Lz.GLASSES[id];
    let last = Infinity;
    for (let i = 0; i <= 40; i++) {
      const lam = glass.from + (glass.to - glass.from) * i / 40;
      const n = call("glassIndex", { glass: id, lam: lam });
      assert.ok(n > 1 && n < 3, id + " at " + lam + ": " + n);
      assert.ok(n < last, id + ": n falls as λ grows, at " + lam);
      last = n;
    }
  }
});

test("GLASSES: frozen, each with three B, three C (µm², silica's from Malitson's wavelengths), and its valid range in metres", () => {
  assert.ok(Object.isFrozen(Lz.GLASSES));
  assert.deepEqual(Object.keys(Lz.GLASSES), ["n-bk7", "fused-silica", "znse"]);
  for (const id of Object.keys(Lz.GLASSES)) {
    const glass = Lz.GLASSES[id];
    assert.ok(Object.isFrozen(glass) && Object.isFrozen(glass.B) && Object.isFrozen(glass.C), id);
    assert.equal(glass.B.length, 3);
    assert.equal(glass.C.length, 3);
  }
  assertClose(Lz.GLASSES["fused-silica"].C[2], 9.896161 * 9.896161, 1e-15);
  assert.equal(Lz.GLASSES["n-bk7"].C[2], 103.560653);
  assertClose(Lz.GLASSES["n-bk7"].from, 0.3 * um, 1e-12);
  assertClose(Lz.GLASSES["n-bk7"].to, 2.5 * um, 1e-12);
  assertClose(Lz.GLASSES["fused-silica"].from, 0.21 * um, 1e-12);
  assertClose(Lz.GLASSES["fused-silica"].to, 3.71 * um, 1e-12);
  assertClose(Lz.GLASSES.znse.from, 0.54 * um, 1e-12);
  assertClose(Lz.GLASSES.znse.to, 18.2 * um, 1e-12);
});

test("glassIndex refuses a wavelength outside the glass's range (λ in nm, CO₂ through BK7, argon through ZnSe) and an unknown glass", () => {
  assert.throws(() => call("glassIndex", { glass: "n-bk7", lam: 587.6 }),
    /^Error: LaserEngine\.lenses\.glassIndex: lam = 587\.6 m is outside n-bk7's range/);
  assert.throws(() => call("glassIndex", { glass: "n-bk7", lam: 10.6 * um }), /outside n-bk7's range/);
  assert.throws(() => call("glassIndex", { glass: "fused-silica", lam: 10.6 * um }), /outside fused-silica's range/);
  assert.throws(() => call("glassIndex", { glass: "znse", lam: 514.5 * nm }), /outside znse's range/);
  assert.throws(() => call("glassIndex", { glass: "crown", lam: 600 * nm }), /glass must be one of "n-bk7", "fused-silica", "znse"/);
  assert.throws(() => call("glassIndex", { glass: "constructor", lam: 600 * nm }), /glass must be one of/);
  assert.throws(() => call("glassIndex", { glass: "n-bk7", lam: -1 }), /lam must be a positive/);
  assert.throws(() => call("glassIndex", { glass: "n-bk7", lam: 600 * nm, T: 20 }), /T is not one of its inputs/);
  // The ends of the range are inside it.
  for (const id of Object.keys(Lz.GLASSES)) {
    call("glassIndex", { glass: id, lam: Lz.GLASSES[id].from });
    call("glassIndex", { glass: id, lam: Lz.GLASSES[id].to });
  }
});

/* ---------- surfaces and thick lenses (§8.1) ---------- */

test("surface: §8.1's matrix of one refracting surface", () => {
  const S = call("surface", { n1: 1, n2: 1.5, c: 10 });
  assert.equal(S.A, 1);
  assert.equal(S.B, 0);
  assertClose(S.C, (1 - 1.5) * 10 / 1.5, 1e-15);
  assertClose(S.D, 1 / 1.5, 1e-15);
  const flat = call("surface", { n1: 1.5, n2: 1, c: 0 });
  assert.equal(flat.C, 0);
  assertClose(flat.D, 1.5, 1e-15, "a flat surface only bends the angle: Snell for small angles");
  assert.throws(() => call("surface", { n1: 0.5, n2: 1, c: 0 }), /^Error: LaserEngine\.lenses\.surface: n1 must be/);
  assert.throws(() => call("surface", { n1: 1, n2: 1, R: 0.1 }), /R is not one of its inputs/);
});

test("thickLens: the lensmaker's equation with thickness, the back and front focal distances, and the thin limit", () => {
  const n = 1.5168;
  const c1 = 1 / (10 * cm);
  const c2 = -1 / (10 * cm);
  const d = 5 * mm;
  const lens = call("thickLens", { n: n, c1: c1, c2: c2, d: d });
  const power = (n - 1) * (c1 - c2 + (n - 1) * d * c1 * c2 / n);
  assertClose(lens.power, power, 1e-12, "§8.1's formula");
  assertClose(lens.f, 1 / power, 1e-12);
  assertClose(lens.f, 0.097580, 1e-4, "9.76 cm");
  // Back focal distance from the back vertex, front from the front vertex.
  assertClose(lens.backFocus, lens.f * (1 - (n - 1) * d * c1 / n), 1e-12);
  assertClose(lens.frontFocus, lens.f * (1 + (n - 1) * d * c2 / n), 1e-12);
  // A lens that is not symmetric has its foci at different distances
  // from its faces: a plano-convex, flat at the back.
  const plano = call("thickLens", { n: n, c1: c1, c2: 0, d: d });
  assertClose(plano.frontFocus, plano.f, 1e-12, "in front: f from the curved face");
  assertClose(plano.backFocus, plano.f * (1 - (n - 1) * d * c1 / n), 1e-12, "behind: shorter by d/n");
  assert.ok(plano.backFocus < plano.frontFocus);
  // The matrix is the product S₂·T(d)·S₁, and a lens in air has det 1.
  const M = lens.matrix;
  assertClose(M.A * M.D - M.B * M.C, 1, 1e-12, "det");
  assertClose(M.C, -power, 1e-12);
  // Thin: 1/f = (n − 1)(c₁ − c₂), and both foci at f.
  const thin = call("thickLens", { n: n, c1: c1, c2: c2, d: 0 });
  assertClose(thin.f, 1 / ((n - 1) * (c1 - c2)), 1e-12);
  assertClose(thin.backFocus, thin.f, 1e-12);
  assertClose(thin.frontFocus, thin.f, 1e-12);
  // No power at all: a flat window.
  const window = call("thickLens", { n: n, c1: 0, c2: 0, d: d });
  assert.equal(window.power, 0);
  assert.equal(window.f, null);
  assert.equal(window.backFocus, null);
  assert.equal(window.frontFocus, null);
  assert.throws(() => call("thickLens", { n: 0.9, c1: c1, c2: c2, d: d }), /n must be/);
  assert.throws(() => call("thickLens", { n: n, c1: c1, c2: c2, d: -1 * mm }), /d must be/);
});

test("LENS_SHAPES: §8.1's catalogue; lensFor gives curvatures whose THICK lens has exactly the asked f", () => {
  assert.deepEqual(Object.keys(Lz.LENS_SHAPES),
    ["biconvex", "plano-convex", "convex-plano", "meniscus", "biconcave", "plano-concave"]);
  assert.ok(Object.isFrozen(Lz.LENS_SHAPES));
  const n = 1.5168;
  const d = 4 * mm;
  for (const shape of Object.keys(Lz.LENS_SHAPES)) {
    assert.ok(Object.isFrozen(Lz.LENS_SHAPES[shape]), shape);
    const f = Lz.LENS_SHAPES[shape].converging ? 0.1 : -0.1;
    const lens = call("lensFor", { shape: shape, f: f, n: n, d: d });
    const thick = call("thickLens", { n: n, c1: lens.c1, c2: lens.c2, d: d });
    assertClose(thick.f, f, 1e-12, shape + ": f");
    // Thin: the curvatures of the thin-lens formula.
    const thin = call("lensFor", { shape: shape, f: f, n: n, d: 0 });
    assertClose((n - 1) * (thin.c1 - thin.c2), 1 / f, 1e-12, shape + ": thin");
  }
  const at = (shape, f) => call("lensFor", { shape: shape, f: f, n: n, d: d });
  assert.equal(at("plano-convex", 0.1).c2, 0, "flat back");
  assert.ok(at("plano-convex", 0.1).c1 > 0, "curved front, bulging towards the light");
  assert.equal(at("convex-plano", 0.1).c1, 0, "flat front");
  assert.ok(at("convex-plano", 0.1).c2 < 0);
  const bi = at("biconvex", 0.1);
  assertClose(bi.c1, -bi.c2, 1e-12, "symmetric");
  const men = at("meniscus", 0.1);
  assert.ok(men.c1 > 0 && men.c2 > 0 && men.c1 > men.c2, "both curved the same way");
  const cave = at("biconcave", -0.1);
  assert.ok(cave.c1 < 0 && cave.c2 > 0);
  assertClose(cave.c1, -cave.c2, 1e-12);
  assert.equal(at("plano-concave", -0.1).c2, 0);
  assert.ok(at("plano-concave", -0.1).c1 < 0);
});

test("lensFor refuses an f of the wrong sign for its shape, an unknown shape, and a lens too thick for its f", () => {
  assert.throws(() => call("lensFor", { shape: "biconvex", f: -0.1, n: 1.5, d: 0 }),
    /^Error: LaserEngine\.lenses\.lensFor: a biconvex lens converges: f must be positive/);
  assert.throws(() => call("lensFor", { shape: "biconcave", f: 0.1, n: 1.5, d: 0 }), /a biconcave lens diverges: f must be negative/);
  assert.throws(() => call("lensFor", { shape: "prism", f: 0.1, n: 1.5, d: 0 }), /shape must be one of "biconvex"/);
  assert.throws(() => call("lensFor", { shape: "biconvex", f: 0, n: 1.5, d: 0 }), /f must be/);
  assert.throws(() => call("lensFor", { shape: "biconvex", f: 5 * cm, n: 1.5, d: 1 }), /no biconvex lens 1 m thick has f = 0\.05 m/);
});

/* ---------- the exact ray trace (§8.2) ---------- */

test("traceExact: Snell's law exactly at a flat surface, and total internal reflection past the critical angle", () => {
  const plane = [{ z: 1 * cm, c: 0, n: 1, aperture: 1 }];
  // From glass (1.5) into air at 0.7 rad: 1.5·sin 0.7 = sin θ′.
  const out = call("traceExact", { surfaces: plane, z: 0, y: 0, angle: 0.7, n: 1.5 });
  assert.equal(out.tir, null);
  assertClose(out.angle, Math.asin(1.5 * Math.sin(0.7)), 1e-12, "Snell");
  assert.equal(out.n, 1, "it ends in air");
  assert.equal(out.points.length, 2);
  assertClose(out.points[1].z, 1 * cm, 1e-12);
  assertClose(out.points[1].y, 1 * cm * Math.tan(0.7), 1e-12);
  // Past the critical angle asin(1/1.5) = 0.7297 rad: reflected inside.
  const tir = call("traceExact", { surfaces: plane, z: 0, y: 0, angle: 0.75, n: 1.5 });
  assert.equal(tir.tir, 0, "the first surface");
  assert.equal(tir.points.length, 2, "it ends where it is reflected");
  // Below the axis, the same by symmetry.
  const down = call("traceExact", { surfaces: plane, z: 0, y: 0, angle: -0.7, n: 1.5 });
  assertClose(down.angle, -out.angle, 1e-12);
  // Into the glass, bent towards the normal.
  const into = call("traceExact", { surfaces: [{ z: 1 * cm, c: 0, n: 1.5, aperture: 1 }], z: 0, y: 0, angle: 0.5, n: 1 });
  assertClose(Math.sin(into.angle) * 1.5, Math.sin(0.5), 1e-12);
});

test("traceExact: through a curved surface, Snell's law against the sphere's normal at the hit point", () => {
  // A ray parallel to the axis at height y meets a surface of radius R
  // where its normal makes the angle asin(y/R) with the axis.
  const R = 5 * cm;
  const y = 2 * cm;
  const out = call("traceExact", { surfaces: [{ z: 0, c: 1 / R, n: 1.5, aperture: 3 * cm }], z: -1 * cm, y: y, angle: 0, n: 1 });
  const incidence = Math.asin(y / R);
  const refracted = Math.asin(Math.sin(incidence) / 1.5);
  assertClose(out.angle, -(incidence - refracted), 1e-12, "bent towards the axis");
  // The hit point is on the sphere, on the vertex's side.
  const hit = out.points[1];
  assertClose(hit.z, R - Math.sqrt(R * R - y * y), 1e-12, "the sag at y");
  assertClose(hit.y, y, 1e-15);
  // The same surface met by a concave one (c < 0) bends the ray away.
  const away = call("traceExact", { surfaces: [{ z: 0, c: -1 / R, n: 1.5, aperture: 3 * cm }], z: -1 * cm, y: y, angle: 0, n: 1 });
  assert.ok(away.angle > 0, "a diverging surface");
  assertClose(away.points[1].z, -(R - Math.sqrt(R * R - y * y)), 1e-12, "the vertex's side of a concave sphere");
});

test("traceExact = the paraxial result for small heights: the focus at the back focal distance, θ′ = −y/f", () => {
  const n = call("glassIndex", { glass: "n-bk7", lam: 632.8 * nm });
  const d = 4 * mm;
  for (const shape of ["biconvex", "plano-convex", "convex-plano", "meniscus"]) {
    const lens = call("lensFor", { shape: shape, f: 0.1, n: n, d: d });
    const thick = call("thickLens", { n: n, c1: lens.c1, c2: lens.c2, d: d });
    const surfaces = lensSurfaces(lens, n, d, 1 * cm);
    const y = 1e-5;
    assertClose(crossing(surfaces, y), d + thick.backFocus, 1e-7, shape + ": the paraxial focus");
    const out = call("traceExact", { surfaces: surfaces, z: -1 * cm, y: y, angle: 0, n: 1 });
    assertClose(out.angle, -y / thick.f, 1e-6, shape + ": the angle out");
  }
  // A diverging lens: the ray leaves away from the axis, as from its virtual focus.
  const cave = call("lensFor", { shape: "biconcave", f: -0.1, n: n, d: 2 * mm });
  const out = call("traceExact", { surfaces: lensSurfaces(cave, n, 2 * mm, 1 * cm), z: -1 * cm, y: 1e-5, angle: 0, n: 1 });
  assertClose(out.angle, 1e-5 / 0.1, 1e-4, "θ′ = −y/f > 0");
  const last = out.points[out.points.length - 1];
  assert.equal(call("axisCrossing", { z: last.z, y: last.y, angle: out.angle }), null, "it never crosses ahead");
});

test("spherical aberration: marginal rays cross closer than paraxial ones, and a plano-convex lens turned flat side first is worse", () => {
  const n = call("glassIndex", { glass: "n-bk7", lam: 632.8 * nm });
  const d = 6 * mm;
  const right = lensSurfaces(call("lensFor", { shape: "plano-convex", f: 0.1, n: n, d: d }), n, d, 2.5 * cm);
  const wrong = lensSurfaces(call("lensFor", { shape: "convex-plano", f: 0.1, n: n, d: d }), n, d, 2.5 * cm);
  for (const surfaces of [right, wrong]) {
    let last = crossing(surfaces, 1e-5);
    for (const y of [5 * mm, 10 * mm, 15 * mm, 20 * mm]) {
      const z = crossing(surfaces, y);
      assert.ok(z < last, "higher rays cross closer: " + y);
      last = z;
    }
  }
  const spread = (surfaces) => crossing(surfaces, 1e-5) - crossing(surfaces, 15 * mm);
  assert.ok(spread(wrong) > 3 * spread(right), "flat side first: " + spread(wrong) + " against " + spread(right));
  // The symmetric lens lies between the two (10.1, 3.66 and 2.52 mm here).
  const bi = lensSurfaces(call("lensFor", { shape: "biconvex", f: 0.1, n: n, d: d }), n, d, 2.5 * cm);
  assert.ok(spread(right) < spread(bi) && spread(bi) < spread(wrong), "biconvex between");
});

test("chromatic aberration: through the same lens, blue focuses before red", () => {
  for (const glass of ["n-bk7", "fused-silica"]) {
    const nBlue = call("glassIndex", { glass: glass, lam: 450 * nm });
    const nRed = call("glassIndex", { glass: glass, lam: 650 * nm });
    // One lens, ground once (its curvatures for the d line).
    const nD = call("glassIndex", { glass: glass, lam: 587.5618 * nm });
    const lens = call("lensFor", { shape: "biconvex", f: 0.1, n: nD, d: 4 * mm });
    const blue = crossing(lensSurfaces(lens, nBlue, 4 * mm, 1 * cm), 1 * mm);
    const red = crossing(lensSurfaces(lens, nRed, 4 * mm, 1 * cm), 1 * mm);
    assert.ok(blue < red, glass + ": " + blue + " < " + red);
    assert.ok(red - blue > 1 * mm, glass + ": millimetres apart for a 10 cm lens");
  }
});

test("traceExact: a ray outside the lens's aperture, or one that misses its sphere, is blocked where it meets the surface", () => {
  const surfaces = [{ z: 0, c: 10, n: 1.5, aperture: 5 * mm }, { z: 3 * mm, c: -10, n: 1, aperture: 5 * mm }];
  const out = call("traceExact", { surfaces: surfaces, z: -1 * cm, y: 6 * mm, angle: 0, n: 1 });
  assert.equal(out.blocked, 0);
  assert.equal(out.tir, null);
  assert.equal(out.points.length, 2, "it ends on the first surface");
  assertClose(out.points[1].y, 6 * mm, 1e-12);
  // Above the sphere itself (|y| > R): no hit at all; it ends at the vertex's plane.
  const miss = call("traceExact", { surfaces: [{ z: 0, c: 10, n: 1.5, aperture: 1 }], z: -1 * cm, y: 0.2, angle: 0, n: 1 });
  assert.equal(miss.blocked, 0);
  assertClose(miss.points[1].z, 0, 1e-12);
  // Inside the aperture it goes through both surfaces.
  const through = call("traceExact", { surfaces: surfaces, z: -1 * cm, y: 4 * mm, angle: 0, n: 1 });
  assert.equal(through.blocked, null);
  assert.equal(through.points.length, 3);
});

test("traceExact refuses what it cannot trace, naming itself", () => {
  const ok = { surfaces: [{ z: 0, c: 0, n: 1.5, aperture: 1 }], z: -1, y: 0, angle: 0, n: 1 };
  const bad = (change, pattern) => assert.throws(() => call("traceExact", Object.assign({}, ok, change)), pattern);
  bad({ surfaces: [] }, /^Error: LaserEngine\.lenses\.traceExact: surfaces must be a non-empty array/);
  bad({ angle: Math.PI / 2 }, /angle must be a finite number from/);
  bad({ n: 0.5 }, /n must be/);
  bad({ z: 0.5 }, /starts at z = 0\.5 m, past the first surface/);
  bad({ surfaces: [{ z: 0, c: 0, n: 1.5, aperture: 1 }, { z: -1e-3, c: 0, n: 1, aperture: 1 }] }, /surfaces\[1\]\.z .* before surfaces\[0\]/);
  bad({ surfaces: [{ z: 0, c: 0, n: 1.5 }] }, /surfaces\[0\]\.aperture must be a positive/);
  bad({ surfaces: [{ z: 0, c: 0, n: 1.5, aperture: 1, R: 1 }] }, /R is not one of its inputs/);
  bad({ theta: 0 }, /theta is not one of its inputs/);
});

test("axisCrossing: ahead of the ray, or null when it runs parallel or away", () => {
  assertClose(call("axisCrossing", { z: 1, y: 1e-3, angle: -0.01 }), 1 + 1e-3 / Math.tan(0.01), 1e-12);
  assertClose(call("axisCrossing", { z: 1, y: -1e-3, angle: 0.01 }), 1 + 1e-3 / Math.tan(0.01), 1e-12);
  assert.equal(call("axisCrossing", { z: 2, y: 0, angle: 0.3 }), 2, "on the axis already");
  assert.equal(call("axisCrossing", { z: 1, y: 1e-3, angle: 0 }), null);
  assert.equal(call("axisCrossing", { z: 1, y: 1e-3, angle: 0.01 }), null);
});

/* ---------- the Gaussian beam (§8.4) ---------- */

test("beamQ, propagate, beamOf: a waist that spreads as w₀√(1 + (z/z_R)²), with z_R = πw₀²/(M²λ) and 1/R = z/(z² + z_R²)", () => {
  const lam = 1064 * nm;
  const w0 = 0.5 * mm;
  for (const M2 of [1, 2]) {
    const zR = Math.PI * w0 * w0 / (M2 * lam);
    const q0 = call("beamQ", { w: w0, curvature: 0, lam: lam, M2: M2 });
    assertClose(q0.re, 0, 1, "at a waist", 1e-15);
    assertClose(q0.im, zR, 1e-12, "q = i·z_R");
    for (const z of [0.1, zR, 5]) {
      const q = call("propagate", { q: q0, matrix: E.optics.freeSpace(z) });
      const b = call("beamOf", { q: q, lam: lam, M2: M2 });
      assertClose(b.w, w0 * Math.sqrt(1 + (z / zR) * (z / zR)), 1e-12, "w at " + z);
      assertClose(b.curvature, z / (z * z + zR * zR), 1e-12, "1/R at " + z);
      assertClose(b.toWaist, -z, 1e-12, "the waist behind");
      assertClose(b.w0, w0, 1e-12);
      assertClose(b.zR, zR, 1e-12);
    }
  }
  // beamQ and beamOf undo each other.
  const q = call("beamQ", { w: 2 * mm, curvature: -0.7, lam: lam, M2: 1 });
  const b = call("beamOf", { q: q, lam: lam, M2: 1 });
  assertClose(b.w, 2 * mm, 1e-12);
  assertClose(b.curvature, -0.7, 1e-12);
  assert.ok(b.toWaist > 0, "a converging beam's waist is ahead");
});

test("Self's formula: s = f puts the waist at the back focal plane; it agrees with q through the thin lens for any s", () => {
  const lam = 632.8 * nm;
  const w0 = 0.3 * mm;
  const f = 0.1;
  const at = call("selfImage", { w0: w0, s: f, f: f, lam: lam, M2: 1 });
  assertClose(at.s, f, 1e-12, "at the back focal plane");
  const zR1 = Math.PI * w0 * w0 / lam;
  assertClose(at.magnification, f / zR1, 1e-12);
  assertClose(at.w0, f * lam / (Math.PI * w0), 1e-12, "w₀₂ = fλ/(πw₀₁)");
  const lensMatrix = { A: 1, B: 0, C: -1 / f, D: 1 };
  for (const s of [0, 0.05, 0.3, 2]) {
    const self = call("selfImage", { w0: w0, s: s, f: f, lam: lam, M2: 1 });
    const q0 = call("beamQ", { w: w0, curvature: 0, lam: lam, M2: 1 });
    const q = call("propagate", { q: call("propagate", { q: q0, matrix: E.optics.freeSpace(s) }), matrix: lensMatrix });
    const b = call("beamOf", { q: q, lam: lam, M2: 1 });
    assertClose(self.s, b.toWaist, 1e-9, "s′ at s = " + s);
    assertClose(self.w0, b.w0, 1e-9, "w₀₂ at s = " + s);
    assertClose(self.zR, b.zR, 1e-9);
  }
  // With M² = 2 the same agreement (z_R = πw₀²/(M²λ) on both sides).
  for (const s of [0.05, 0.3]) {
    const self = call("selfImage", { w0: w0, s: s, f: f, lam: lam, M2: 2 });
    const q0 = call("beamQ", { w: w0, curvature: 0, lam: lam, M2: 2 });
    const q = call("propagate", { q: call("propagate", { q: q0, matrix: E.optics.freeSpace(s) }), matrix: lensMatrix });
    const b = call("beamOf", { q: q, lam: lam, M2: 2 });
    assertClose(self.s, b.toWaist, 1e-9, "M² = 2: s′ at s = " + s);
    assertClose(self.w0, b.w0, 1e-9, "M² = 2: w₀₂ at s = " + s);
  }
  // Far away, the geometric image: s′ → f.
  assertClose(call("selfImage", { w0: w0, s: 100, f: f, lam: lam, M2: 1 }).s, f * 100 / (100 - f), 1e-4);
  assert.throws(() => call("selfImage", { w0: w0, s: 0.1, f: 0, lam: lam, M2: 1 }), /^Error: LaserEngine\.lenses\.selfImage: f must be/);
  assert.throws(() => call("selfImage", { w0: w0, s: 0.1, f: f, lam: lam, M2: 0.5 }), /M2 must be a finite number of at least 1/);
});

test("focusedSpot: a collimated beam of radius w to w_f = M²λf/(πw), its depth of focus 2z_R; the Airy disk of a uniform beam, 0.61fλ/r", () => {
  const spot = call("focusedSpot", { w: 1 * mm, f: 0.1, lam: 1064 * nm, M2: 1 });
  assertClose(spot.w, 1064 * nm * 0.1 / (Math.PI * 1 * mm), 1e-12);
  assertClose(spot.w, 33.868 * um, 1e-4);
  assertClose(spot.depth, 2 * Math.PI * spot.w * spot.w / (1064 * nm), 1e-12);
  assertClose(call("focusedSpot", { w: 1 * mm, f: 0.1, lam: 1064 * nm, M2: 3 }).w, 3 * spot.w, 1e-12, "M² times larger");
  // Self's formula with the waist on the lens and z_R ≫ f gives the same
  // to (f/z_R)² (here z_R = 2.95 m, f = 0.1 m: 1.1e-3).
  const self = call("selfImage", { w0: 1 * mm, s: 0, f: 0.1, lam: 1064 * nm, M2: 1 });
  assertClose(self.w0, spot.w, 1.2e-3);
  // §8.8: ruby, 1 cm² (r = 5.64 mm), f = 5 cm.
  const r = Math.sqrt(1 * cm * cm / Math.PI);
  assertClose(call("airyRadius", { f: 5 * cm, lam: 694.3 * nm, r: r }), 3.75337 * um, 1e-5);
  assert.throws(() => call("airyRadius", { f: -0.05, lam: 694.3 * nm, r: r }), /^Error: LaserEngine\.lenses\.airyRadius: f must be a positive/);
});

/* ---------- the telescope (§8.5) ---------- */

test("telescope: Kepler and Galileo, |M| = |f₂/f₁|, lenses f₁ + f₂ apart; afocal, and wθ kept", () => {
  const kepler = call("telescope", { f1: 5 * cm, f2: 50 * cm });
  assertClose(kepler.magnification, -10, 1e-12, "an inverted image");
  assertClose(kepler.length, 55 * cm, 1e-12);
  assert.equal(kepler.internalFocus, true);
  const galileo = call("telescope", { f1: -5 * cm, f2: 50 * cm });
  assertClose(galileo.magnification, 10, 1e-12);
  assertClose(galileo.length, 45 * cm, 1e-12);
  assert.equal(galileo.internalFocus, false, "no focus inside: no air breakdown");
  for (const t of [kepler, galileo]) {
    const f1 = t === kepler ? 5 * cm : -5 * cm;
    const M = E.optics.multiply([{ A: 1, B: 0, C: -1 / f1, D: 1 }, E.optics.freeSpace(t.length), { A: 1, B: 0, C: -1 / 0.5, D: 1 }]);
    assertClose(M.C, 0, 1, "afocal", 1e-12);
    assertClose(M.A, t.magnification, 1e-12);
    // A beam 10 times wider leaves 10 times less divergent: z_R × M².
    const lam = 1064 * nm;
    const q0 = call("beamQ", { w: 0.3 * mm, curvature: 0, lam: lam, M2: 1 });
    const out = call("beamOf", { q: call("propagate", { q: q0, matrix: M }), lam: lam, M2: 1 });
    assertClose(out.w0, 10 * 0.3 * mm, 1e-9, "w × |M|");
    // θ = w₀/z_R falls by |M|, so w₀θ stays M²λ/π (§8.5).
    assertClose(out.zR, 100 * q0.im, 1e-9, "z_R × M²");
    assertClose(out.w0 * (out.w0 / out.zR), lam / Math.PI, 1e-9, "wθ = λ/π");
  }
  assert.throws(() => call("telescope", { f1: -50 * cm, f2: 5 * cm }), /^Error: LaserEngine\.lenses\.telescope: the lenses would be -0\.45 m apart/);
  assert.throws(() => call("telescope", { f1: 0, f2: 5 * cm }), /f1 must be/);
});

/* ---------- at the target (§8.8, §8.3) ---------- */

test("atTarget: §8.8's ruby, 100 MW on 1 cm² and then in the Airy disk of a 5 cm lens", () => {
  const atm = C.atm;
  const wide = call("atTarget", { power: 100e6, area: 1 * cm * cm, n: 1 });
  assertClose(wide.I, 1e12, 1e-12, "W/m²");
  assertClose(wide.Erms / 100, 1.94095e5, 1e-5, "V/cm");
  assert.equal(Math.round(wide.Erms / 100 / 1e3), 194, "§8.8: 1.94×10⁵ V/cm");
  assertClose(wide.E0, Math.SQRT2 * wide.Erms, 1e-12);
  assertClose(wide.pressureAbsorbed / atm, 0.0329202, 1e-5);
  assert.equal(Math.round(wide.pressureAbsorbed / atm * 1000), 33, "§8.8: 0.033 atm");
  assertClose(wide.pressureMirror, 2 * wide.pressureAbsorbed, 1e-12, "a mirror takes twice the push");
  const r = Math.sqrt(1 * cm * cm / Math.PI);
  const airy = call("airyRadius", { f: 5 * cm, lam: 694.3 * nm, r: r });
  const focus = call("atTarget", { power: 100e6, area: Math.PI * airy * airy, n: 1 });
  assertClose(focus.Erms / 100, 2.91755e8, 1e-5, "V/cm");
  assert.equal(Math.round(focus.Erms / 100 / 1e6), 292, "§8.8: 2.9×10⁸ V/cm");
  assertClose(focus.pressureAbsorbed / atm, 7.43822e4, 1e-5);
  assert.equal(Math.round(focus.pressureAbsorbed / atm / 100), 744, "§8.8: 7.4×10⁴ atm");
  assert.ok(focus.I > Lz.BREAKDOWN, "far past breakdown: plasma");
  // In glass the same intensity has a smaller field.
  assertClose(call("atTarget", { power: 100e6, area: 1 * cm * cm, n: 1.5 }).E0, wide.E0 / Math.sqrt(1.5), 1e-12);
  // No light, nothing.
  const dark = call("atTarget", { power: 0, area: 1 * cm * cm, n: 1 });
  assert.equal(dark.I, 0);
  assert.equal(dark.E0, 0);
  assert.throws(() => call("atTarget", { power: -1, area: 1, n: 1 }), /^Error: LaserEngine\.lenses\.atTarget: power must be/);
  assert.throws(() => call("atTarget", { power: 1, area: 0, n: 1 }), /area must be a positive/);
});

test("BREAKDOWN is 10¹⁰ W/cm²; brightnessTemperature: §8.3's He-Ne, 10 mW in 10⁴ Hz, 3.6×10¹⁶ K", () => {
  assertClose(Lz.BREAKDOWN, 1e10 / (cm * cm), 1e-12);
  assertClose(call("brightnessTemperature", { power: 10e-3, linewidth: 1e4 }), 3.62149e16, 1e-5);
  assertClose(call("brightnessTemperature", { power: 10e-3, linewidth: 1e4 }), 10e-3 / (2 * C.k * 1e4), 1e-12);
  assert.throws(() => call("brightnessTemperature", { power: 1, linewidth: 0 }), /^Error: LaserEngine\.lenses\.brightnessTemperature: linewidth must be a positive/);
});

test("ε₀ in the constants: ε₀μ₀c² = 1", () => {
  const mu0 = 4 * Math.PI * 1e-7 * 1.00000000055;   // CODATA 2018
  assertClose(C.eps0 * mu0 * C.c * C.c, 1, 1e-9);
});

test("propagate and beamOf refuse what is not a beam", () => {
  assert.throws(() => call("beamOf", { q: { re: 1, im: 0 }, lam: 1e-6, M2: 1 }), /^Error: LaserEngine\.lenses\.beamOf: q\.im must be a positive/);
  assert.throws(() => call("propagate", { q: { re: 1, im: 1 }, matrix: { A: 1, B: 0, C: 0 } }), /^Error: LaserEngine\.lenses\.propagate: .*D/);
  assert.throws(() => call("propagate", { q: { re: 1 }, matrix: E.optics.freeSpace(1) }), /q\.im must be/);
  assert.throws(() => call("beamQ", { w: 0, curvature: 0, lam: 1e-6, M2: 1 }), /^Error: LaserEngine\.lenses\.beamQ: w must be a positive/);
});

/* ---------- the review's cases ---------- */

test("traceExact: a nearly flat surface (c = 1e-200, 1e-8) refracts as a flat one, and c = 0 is the same formula", () => {
  for (const c of [0, 1e-200, 1e-8]) {
    const out = call("traceExact", { surfaces: [{ z: 0, c: c, n: 1.5, aperture: 2 * cm }], z: -1 * cm, y: 1 * cm, angle: 0.3, n: 1 });
    assert.equal(out.blocked, null, "c = " + c);
    assertClose(Math.sin(out.angle) * 1.5, Math.sin(0.3), 1e-6, "Snell at c = " + c);
    assertClose(out.points[1].y, 1 * cm + 1 * cm * Math.tan(0.3), 1e-6, "the hit at c = " + c);
  }
});

test("traceExact: a ray must start before the first surface at its own height (a concave face's edges reach back towards the light)", () => {
  const cave = [{ z: 0, c: -20, n: 1.5, aperture: 2 * cm }, { z: 3 * mm, c: 20, n: 1, aperture: 2 * cm }];
  // At y = 1 cm the face lies at z = c·y²/(1 + √(1 − c²y²)) = −1.01 mm.
  // Between the rim and the vertex (z = −0.5 mm): before the vertex, but
  // already past the face at its height.
  assert.throws(() => call("traceExact", { surfaces: cave, z: -0.5 * mm, y: 1 * cm, angle: 0, n: 1 }),
    /^Error: LaserEngine\.lenses\.traceExact: the ray starts at z = -0\.0005 m, past the first surface at its height \(z = -0\.00101/);
  assert.throws(() => call("traceExact", { surfaces: cave, z: 0, y: 1 * cm, angle: 0, n: 1 }), /past the first surface at its height/);
  const out = call("traceExact", { surfaces: cave, z: -2 * mm, y: 1 * cm, angle: 0, n: 1 });
  assert.equal(out.blocked, null, "from in front of it, it goes through");
  assertClose(out.points[1].z, -20 * 1e-4 / (1 + Math.sqrt(1 - 400 * 1e-4)), 1e-9, "on the face");
  assert.ok(out.angle > 0, "a diverging lens");
});

test("traceExact: a ray turned backwards at a steep surface stops there, blocked, with finite points", () => {
  // From glass (1.5) into air, near the rim of a face of radius 5 mm, at a
  // steep angle: Snell's law sends it out running back against the light.
  const R = 5 * mm;
  const surfaces = [{ z: 0, c: 1 / R, n: 1, aperture: 1 }, { z: 5 * mm, c: 0, n: 1.5, aperture: 1 }];
  const out = call("traceExact", { surfaces: surfaces, z: -1 * mm, y: 4.7 * mm, angle: -1.11, n: 1.5 });
  assert.equal(out.blocked, 0, "it stops at the face it turned back at");
  assert.equal(out.tir, null, "refracted, not reflected");
  assert.equal(out.points.length, 2);
  for (const p of out.points) assert.ok(Number.isFinite(p.z) && Number.isFinite(p.y));
  assert.ok(Math.cos(out.angle) < 0, "running backwards: " + out.angle);
  // Snell's law against the sphere's normal at the hit (its centre at z = R).
  const hit = out.points[1];
  const normal = Math.atan2(hit.y, hit.z - R);                // outward from the centre
  const inAngle = -1.11 - (normal + Math.PI);                 // the ray against the inward normal
  const outAngle = out.angle - (normal + Math.PI);
  assertClose(1.5 * Math.sin(inAngle), Math.sin(outAngle), 1e-9, "Snell");
});

test("propagate refuses a matrix that is not air to air (its determinant must be 1)", () => {
  const q = { re: 0, im: 1 };
  assert.throws(() => call("propagate", { q: q, matrix: call("surface", { n1: 1, n2: 1.5, c: 0 }) }),
    /^Error: LaserEngine\.lenses\.propagate: the matrix's determinant is 0\.666666666666666\d, not 1: the beam must start and end in air/);
  const lens = call("thickLens", { n: 1.5168, c1: 10, c2: -10, d: 5 * mm }).matrix;
  call("propagate", { q: q, matrix: lens });
});

test("traceExact: a ray that starts behind a concave face's centre crosses the far half of its sphere first, and meets the face on the vertex's half", () => {
  // c = −20: the centre 5 cm before the vertex. From 10 cm before it, the
  // ray at 1 cm crosses the sphere's far half near z = −9.9 cm: no surface
  // there. It meets the face itself at its sag, −1.01 mm.
  const out = call("traceExact", { surfaces: [{ z: 0, c: -20, n: 1.5, aperture: 2 * cm }], z: -10 * cm, y: 1 * cm, angle: 0, n: 1 });
  assert.equal(out.blocked, null);
  assertClose(out.points[1].z, -20 * 1e-4 / (1 + Math.sqrt(1 - 400 * 1e-4)), 1e-9, "on the face, at its sag");
});
