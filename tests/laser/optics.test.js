/* ============================================================================
   optics.test.js — js/laser/engine/optics.js against docs/laser-physics.md
   §7.1–7.4 and §7.7 (docs/laser-plan.md, stage 10a scope card): the ray
   matrices, stability, the Gaussian mode, each mirror's focal point, the
   ray trace, and the light the mirrors lose.

   Every call gets a deep-frozen input, so a function that changed its
   input would throw.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine, deepFreeze, assertClose, plain } = require("./helpers.js");

const E = loadEngine();
const O = E.optics;

function call(name, params) {
  return O[name](deepFreeze(params));
}

// An empty cavity of length L with mirror curvatures c1, c2 (1/m) and an
// aperture a: what the edge and loss tests use.
function empty(L, c1, c2, lam, aperture) {
  return call("resonator", { L: L, l_g: 0, n: 1, c1: c1, c2: c2, lam: lam, aperture: aperture });
}

// The same with g-parameters given instead of curvatures: c = (1 − g)/L.
function withG(g1, g2, fresnel) {
  const L = 1;
  const lam = 1e-6;
  return empty(L, (1 - g1) / L, (1 - g2) / L, lam, Math.sqrt(fresnel * lam * L));
}

// Vainshtein's loss per pass written out here from Kogelnik & Li's eq. (86)
// with κ₀₀² (§7.7): α is the energy lost per transit (their eq. (81));
// the share used is 1 − e^(−α), α to first order and never above 1.
function vainshtein(N) {
  const M = Math.sqrt(8 * Math.PI * N);
  const d = 0.824;
  const kappa = 2.404825557695773;
  const alpha = 8 * kappa * kappa * d * (M + d) / Math.pow((M + d) * (M + d) + d * d, 2);
  return -Math.expm1(-alpha);
}

const dB = (share) => -10 * Math.log10(1 - share);

/* ---------- matrices (§7.3) ---------- */

test("the matrices: free space, a mirror as a lens of f = R/2, and a slab = free space l/n (D10)", () => {
  assert.deepEqual(plain(O.freeSpace(0.3)), { A: 1, B: 0.3, C: 0, D: 1 });
  // A concave mirror of R = 2 m: c = 0.5 m⁻¹, a lens of f = 1 m.
  assert.deepEqual(plain(O.mirror(0.5)), { A: 1, B: 0, C: -1, D: 1 });
  assert.deepEqual(plain(O.mirror(0)), { A: 1, B: 0, C: 0, D: 1 }, "a flat mirror bends nothing");
  // A 10 cm rod of index 1.76 acts on the beam as 10/1.76 cm of air.
  const slab = call("slab", { l: 0.1, n: 1.76 });
  assertClose(slab.B, 0.1 / 1.76, 1e-12, "l/n");
  assert.deepEqual(plain(slab), plain(O.freeSpace(0.1 / 1.76)));
  assert.deepEqual(plain(call("slab", { l: 0.2, n: 1 })), plain(O.freeSpace(0.2)), "n = 1 is air");
});

test("multiply: the elements in the order the light meets them (a lens, then free space, is not free space, then the lens)", () => {
  // Lens f = 1 m, then 1 m of air: a ray parallel to the axis at height 1
  // crosses the axis there.
  const lensThenAir = call("multiply", [O.mirror(0.5), O.freeSpace(1)]);
  assert.deepEqual(plain(lensThenAir), { A: 0, B: 1, C: -1, D: 1 });
  const airThenLens = call("multiply", [O.freeSpace(1), O.mirror(0.5)]);
  assert.deepEqual(plain(airThenLens), { A: 1, B: 1, C: -1, D: 0 });
  assert.deepEqual(plain(call("multiply", [O.freeSpace(2)])), { A: 1, B: 2, C: 0, D: 1 });
  assert.throws(() => O.multiply([]), /^Error: LaserEngine\.optics\.multiply: needs a non-empty array/);
  assert.throws(() => O.multiply([{ A: 1, B: 0, C: 0 }]), /^Error: LaserEngine\.optics\.multiply: .*D/);
  assert.throws(() => O.multiply([{ A: 1, B: 0, C: 0, D: NaN }]), /list\[0\]\.D must be a finite number/);
});

test("the round trip: (A + D)/2 = 2g₁g₂ − 1 for any pair, with g = 1 − L*·c and L* = L − l + l/n (§7.3)", () => {
  // Random pairs, from a fixed list (no random numbers in a test).
  const cases = [
    [0.3, 0, 1, 0, 1], [0.5, 0.1, 1.76, 0.4, -0.7], [1, 1, 1, 1 / 5, 0], [0.3, 0.05, 1.82, 0, 1],
    [2, 0.5, 1.5, -2, 3], [0.1, 0.01, 1.76, 9, 9], [1.5, 0.005, 1.76, 1, 1], [0.8, 0.8, 1, 0.05, -0.05]
  ];
  for (const [L, l_g, n, c1, c2] of cases) {
    const Lr = call("reducedLength", { L, l_g, n });
    assertClose(Lr, L - l_g + l_g / n, 1e-12, "L*");
    const M = call("roundTrip", { L, l_g, n, c1, c2 });
    const g1 = 1 - Lr * c1;
    const g2 = 1 - Lr * c2;
    assertClose((M.A + M.D) / 2, 2 * g1 * g2 - 1, 1e-12, "m for " + [L, l_g, n, c1, c2], 1e-12);
    assertClose(M.A * M.D - M.B * M.C, 1, 1e-12, "a round trip keeps the determinant 1");
    // The same product written out with multiply.
    const byHand = call("multiply", [O.freeSpace(Lr), O.mirror(c2), O.freeSpace(Lr), O.mirror(c1)]);
    for (const k of ["A", "B", "C", "D"]) assertClose(M[k], byHand[k], 1e-12, k, 1e-12);
    const r = call("resonator", { L, l_g, n, c1, c2, lam: 1e-6, aperture: 1e-3 });
    assertClose(r.g1, g1, 1e-12, "g1", 1e-15);
    assertClose(r.g2, g2, 1e-12, "g2", 1e-15);
    assertClose(r.m, 2 * g1 * g2 - 1, 1e-12, "m", 1e-15);
  }
});

/* ---------- stability (§7.1) ---------- */

test("§7.1's table: plane-parallel, long-radius, confocal, hemispherical, concentric, unstable", () => {
  const L = 0.3;
  const lam = 632.8e-9;
  const a = 1e-3;
  const rows = [
    // name, c1, c2, g1g2, stable
    ["plane-parallel", 0, 0, 1, false],
    ["long-radius", 1 / 30, 1 / 30, 0.99 * 0.99, true],
    ["confocal", 1 / L, 1 / L, 0, true],
    ["hemispherical", 0, 1 / L, 0, false],
    ["concentric", 2 / L, 2 / L, 1, false],
    ["convex", 0, -1 / 1, 1.3, false]
  ];
  for (const [name, c1, c2, product, stable] of rows) {
    const r = empty(L, c1, c2, lam, a);
    assertClose(r.g1 * r.g2, product, 1e-12, name + ": g₁g₂", 1e-12);
    assert.equal(r.stable, stable, name);
    for (const field of ["w0", "waistAt", "zR", "w1", "w2"]) {
      assert.equal(r[field] === null, !stable, name + ": " + field);
    }
    if (stable) assert.ok(r.w0 > 0 && r.w1 >= r.w0 && r.w2 >= r.w0, name + ": the waist is the narrowest");
  }
  // Only outside the stable region is there a magnification.
  assert.equal(empty(L, 0, 0, lam, a).magnification, null, "flat-flat: M = 1, not unstable");
  assert.equal(empty(L, 2 / L, 2 / L, lam, a).magnification, null, "concentric: on the edge");
  const convex = empty(L, 0, -1, lam, a);
  // m = 2·1.3 − 1 = 1.6: M = 1.6 + √(1.56) = 2.849
  assertClose(convex.magnification, 1.6 + Math.sqrt(1.56), 1e-12, "M = |m| + √(m² − 1)");
  // m < −1 (g₁g₂ < 0): |m| counts.
  const negative = empty(L, 0, 2 / 0.3 + 1, lam, a);           // g₂ = −1 − 0.3: g₁g₂ = −1.3, m = −3.6
  assertClose(negative.magnification, 3.6 + Math.sqrt(3.6 * 3.6 - 1), 1e-12, "M for m = −3.6");
});

/* ---------- the Gaussian mode (§7.2, D1) ---------- */

test("D1: the confocal He-Ne of §7.2 (L = 1 m): w₀ = 0.317 mm, θ = 2.18′, waist in the middle, w = √(λL/π) on the mirrors", () => {
  const lam = 632.8e-9;
  const r = empty(1, 1, 1, lam, 1e-3);
  assert.equal(r.stable, true, "g₁ = g₂ = 0 is the stable confocal point, not an edge");
  // √(λL/2π) = 0.31735 mm; the doc prints 3 digits, so ±0.0005 mm.
  assertClose(r.w0 * 1e3, 0.317, 0.0005 / 0.317, "w₀, mm");
  assertClose(r.w0, Math.sqrt(lam / (2 * Math.PI)), 1e-12, "w₀ exactly");
  const theta = lam / (Math.PI * r.w0) * (180 / Math.PI) * 60;
  assertClose(theta, 2.18, 0.005 / 2.18, "θ, arcmin (2.182)");
  assertClose(r.waistAt, 0.5, 1e-12, "the waist in the middle");
  assertClose(r.w1, Math.sqrt(lam / Math.PI), 1e-12, "w on mirror 1");
  assertClose(r.w2, Math.sqrt(lam / Math.PI), 1e-12, "w on mirror 2");
  assertClose(r.zR, 0.5, 1e-12, "z_R = L/2");
});

test("D1: the mode is continuous through the confocal point along g₁ = g₂ (g = ±0.01 within 1 % of g = 0)", () => {
  const lam = 1e-6;
  const at = (g) => empty(1, 1 - g, 1 - g, lam, 1e-2);
  const confocal = at(0);
  for (const g of [0.01, -0.01, 1e-9, -1e-9]) {
    const r = at(g);
    // w₀² ∝ √((1 + g)/(1 − g)): 1 % from g = 0 at |g| = 0.01.
    assertClose(r.w0, confocal.w0, Math.abs(g) * 1.01 + 1e-12, "w₀ at g = " + g);
    assertClose(r.w0, Math.sqrt(lam / Math.PI * Math.sqrt((1 + g) / (4 * (1 - g)))), 1e-12, "the symmetric formula at g = " + g);
  }
  // Off the diagonal the general formula: g₁ = 0.2, g₂ = 0.5 by hand.
  const r = withG(0.2, 0.5, 10);
  const sum = 0.2 + 0.5 - 2 * 0.1;
  assertClose(r.zR, Math.sqrt(0.1 * 0.9 / (sum * sum)), 1e-12, "z_R, L = 1");
  assertClose(r.waistAt, 0.5 * 0.8 / sum, 1e-12, "z₁ = L·g₂(1 − g₁)/(g₁ + g₂ − 2g₁g₂)");
  assertClose(r.w1 * r.w1, 1e-6 / Math.PI * Math.sqrt(0.5 / (0.2 * 0.9)), 1e-12, "w₁² of §7.2");
  assertClose(r.w2 * r.w2, 1e-6 / Math.PI * Math.sqrt(0.2 / (0.5 * 0.9)), 1e-12, "w₂² of §7.2");
});

test("w(z) agrees with §7.3's q from the round-trip matrix: w² = λ|B|/(π√(1 − m²)) at each mirror", () => {
  const lam = 1064e-9;
  const cases = [[0.3, 0.05, 1.82, 0, 1], [0.5, 0.1, 1.76, 0.4, 0.7], [1.5, 0.005, 1.76, 1, 1], [0.8, 0.8, 1, 1 / 20, 0]];
  for (const [L, l_g, n, c1, c2] of cases) {
    const r = call("resonator", { L, l_g, n, c1, c2, lam, aperture: 1e-2 });
    assert.equal(r.stable, true);
    const fromOne = call("roundTrip", { L, l_g, n, c1, c2 });
    const fromTwo = call("roundTrip", { L, l_g, n, c1: c2, c2: c1 });
    const wSquared = (M) => lam * Math.abs(M.B) / (Math.PI * Math.sqrt(1 - Math.pow((M.A + M.D) / 2, 2)));
    assertClose(r.w1 * r.w1, wSquared(fromOne), 1e-9, "w₁ from q");
    assertClose(r.w2 * r.w2, wSquared(fromTwo), 1e-9, "w₂ from q");
    const beam = (z) => call("beamRadius", { L, l_g, n, c1, c2, lam, z });
    assertClose(beam(0), r.w1, 1e-12, "w(0) = w₁");
    assertClose(beam(L), r.w2, 1e-12, "w(L) = w₂");
    assertClose(beam(r.waistAt), r.w0, 1e-9, "w at the waist = w₀");
    // Through the rod (in the middle of the cavity) the beam grows l/n:
    // propagate q = i·z_R from the waist (reduced) to each end of the rod.
    const rodStart = (L - l_g) / 2;
    // A real distance from mirror 1 as a reduced one: the rod counts l/n.
    function reduced(z) {
      if (z <= rodStart) return z;
      if (z <= rodStart + l_g) return rodStart + (z - rodStart) / n;
      return z - l_g + l_g / n;
    }
    const zWaist = reduced(r.waistAt);
    for (const z of [rodStart, rodStart + l_g / 2, rodStart + l_g, L / 3]) {
      const zeta = (reduced(z) - zWaist) / r.zR;
      assertClose(beam(z), r.w0 * Math.sqrt(1 + zeta * zeta), 1e-12, "w at " + z);
    }
  }
  // No mode, no beam radius.
  assert.equal(call("beamRadius", { L: 0.3, l_g: 0, n: 1, c1: 0, c2: 0, lam, z: 0.1 }), null, "flat-flat");
  assert.equal(call("beamRadius", { L: 0.3, l_g: 0, n: 1, c1: 0, c2: -1, lam, z: 0.1 }), null, "unstable");
});

test("D10: a rod counts l/n: the cavity with a rod is the empty cavity of length L*", () => {
  const withRod = call("resonator", { L: 0.5, l_g: 0.1, n: 1.76, c1: 0, c2: 1, lam: 694.3e-9, aperture: 5e-3 });
  const Lr = 0.5 - 0.1 + 0.1 / 1.76;
  const airOnly = empty(Lr, 0, 1, 694.3e-9, 5e-3);
  for (const field of ["g1", "g2", "w0", "w1", "w2", "zR", "fresnel", "loss"]) {
    assertClose(withRod[field], airOnly[field], 1e-12, field, 1e-300);
  }
  assertClose(withRod.reducedLength, Lr, 1e-12, "L*");
  // The waist on the flat mirror (z = 0) is the same in both.
  assertClose(withRod.waistAt, 0, 1e-12, "waist on the flat mirror", 1e-15);
});

test("with a convex mirror the waist can be virtual, outside the cavity (waistAt < 0), while w inside is still the mode's", () => {
  // c₁ = −1 (convex, R = 1 m), c₂ = 2 (R = 0.5 m), L = 0.3: g₁ = 1.3,
  // g₂ = 0.4, g₁g₂ = 0.52, stable; the waist 5.5 cm behind mirror 1.
  const p = { L: 0.3, l_g: 0, n: 1, c1: -1, c2: 2, lam: 1e-6 };
  const r = call("resonator", Object.assign({ aperture: 1e-2 }, p));
  assert.equal(r.stable, true);
  assert.ok(r.waistAt < -0.05 && r.waistAt > -0.06, "waistAt " + r.waistAt);
  assertClose(call("beamRadius", Object.assign({ z: 0 }, p)), r.w1, 1e-12, "w on mirror 1");
  assert.throws(() => call("beamRadius", Object.assign({ z: r.waistAt }, p)), /z must be a finite number from 0 to 0\.3/);
});

/* ---------- focal points (D9) ---------- */

test("D9: each mirror's focal point is R/2: in front of a concave mirror, behind a convex one, none for a flat one", () => {
  const r = empty(1, 1 / 2, -1 / 3, 1e-6, 1e-3);
  assertClose(r.focus1, 1, 1e-12, "concave R = 2 m: F 1 m in front (real)");
  assertClose(r.focus2, -1.5, 1e-12, "convex R = 3 m: F 1.5 m behind (virtual)");
  const flat = empty(1, 0, 0, 1e-6, 1e-3);
  assert.equal(flat.focus1, null);
  assert.equal(flat.focus2, null);
  // A rod does not move a mirror's own focal point.
  assertClose(call("resonator", { L: 0.5, l_g: 0.1, n: 1.76, c1: 1, c2: 0, lam: 1e-6, aperture: 1e-3 }).focus1, 0.5, 1e-12, "with a rod");
});

/* ---------- the ray trace ---------- */

test("traceRay: straight between the mirrors, bent only at them (θ′ = θ − 2c·y), heights at the mirrors", () => {
  const params = { L: 0.5, l_g: 0.1, n: 1.76, c1: 0, c2: 1, aperture: 5e-3, y: 1e-3, theta: 2e-3, roundTrips: 3 };
  const run = call("traceRay", params);
  assert.equal(run.escaped, null);
  assert.equal(run.hits.length, 6);
  const Lr = 0.5 - 0.1 + 0.1 / 1.76;
  let y = 1e-3;
  let theta = 2e-3;
  run.hits.forEach((hit, i) => {
    const mirror = i % 2 === 0 ? 2 : 1;
    assert.equal(hit.mirror, mirror, "hit " + i);
    y = y + Lr * theta;
    theta = theta - 2 * (mirror === 2 ? 1 : 0) * y;
    assertClose(hit.y, y, 1e-12, "y at hit " + i);
    assertClose(hit.theta, theta, 1e-12, "θ after hit " + i);
  });
  // A ray on the axis stays there, whatever the mirrors.
  const axis = call("traceRay", Object.assign({}, params, { c2: -5, y: 0, theta: 0, roundTrips: 100 }));
  assert.equal(axis.escaped, null);
  assert.ok(axis.hits.every((hit) => hit.y === 0));
});

test("a ray stays inside for 1000 round trips between stable mirrors and walks out between unstable ones (§7.1)", () => {
  const base = { L: 0.3, l_g: 0.3, n: 1, c1: 0, aperture: 0.75e-3, y: 0.3e-3, theta: 0.5e-3, roundTrips: 1000 };
  // He-Ne's own mirrors, R₂ = 45 cm: stable.
  const stable = call("traceRay", Object.assign({}, base, { c2: 1 / 0.45 }));
  assert.equal(stable.escaped, null);
  assert.equal(stable.hits.length, 2000);
  assert.ok(stable.hits.every((hit) => Math.abs(hit.y) <= 0.75e-3));
  // R₂ = 25 cm in a 30 cm tube: g₂ = −0.2, unstable. M = 2.38 a round
  // trip: out of 0.75 mm within a few round trips.
  const unstable = call("traceRay", Object.assign({}, base, { c2: 1 / 0.25 }));
  assert.notEqual(unstable.escaped, null);
  assert.ok(unstable.escaped.roundTrip <= 5, "out after " + unstable.escaped.roundTrip + " round trips");
  const last = unstable.hits[unstable.hits.length - 1];
  assert.ok(Math.abs(last.y) > 0.75e-3, "its last hit is past the edge");
  assert.equal(last.mirror, unstable.escaped.mirror);
  // The same ray started below the axis is its mirror image: it leaves
  // below, past −a, on the same pass.
  const below = call("traceRay", Object.assign({}, base, { c2: 1 / 0.25, y: -0.3e-3, theta: -0.5e-3 }));
  assert.deepEqual(plain(below.escaped), plain(unstable.escaped));
  assertClose(below.hits[below.hits.length - 1].y, -last.y, 1e-12, "below the axis");
  // Two flat mirrors: a tilted ray walks out in a straight line, L*·θ a
  // pass: y = k·0.03 mm after k passes, past a = 0.74 mm on pass 25 (24
  // passes reach 0.72 mm; well clear of the edge either way).
  const flat = call("traceRay", Object.assign({}, base, { c2: 0, y: 0, theta: 1e-4, aperture: 0.74e-3 }));
  assert.notEqual(flat.escaped, null);
  const passes = flat.hits.length;
  assert.equal(passes, 25, "out after a/(L·θ) passes");
  assertClose(flat.hits[passes - 1].y, 25 * 0.3 * 1e-4, 1e-12, "a straight walk");
});

test("traceRay checks its inputs and names itself; at most 10 000 round trips", () => {
  const ok = { L: 0.3, l_g: 0, n: 1, c1: 0, c2: 1, aperture: 1e-3, y: 0, theta: 0, roundTrips: 1 };
  assert.doesNotThrow(() => call("traceRay", Object.assign({}, ok, { roundTrips: 10000 })));
  assert.throws(() => call("traceRay", Object.assign({}, ok, { roundTrips: 10001 })), /^Error: LaserEngine\.optics\.traceRay: roundTrips must be at most 10000/);
  assert.throws(() => call("traceRay", Object.assign({}, ok, { roundTrips: 1.5 })), /roundTrips must be a whole number/);
  assert.throws(() => call("traceRay", Object.assign({}, ok, { y: 2e-3 })), /starts outside the aperture/);
  assert.throws(() => call("traceRay", Object.assign({}, ok, { aperture: 0 })), /aperture must be a positive/);
  assert.throws(() => call("traceRay", Object.assign({}, ok, { angle: 0 })), /angle is not one of its inputs/);
});

/* ---------- the losses (§7.7) ---------- */

test("§7.7: Vainshtein's flat-mirror loss per pass, against Kogelnik & Li's eq. (86) and their Fig. 22", () => {
  for (const N of [0.5, 1, 4, 10, 24.5, 100, 1e4]) {
    assertClose(call("plateLoss", N), vainshtein(N), 1e-12, "N = " + N);
  }
  // The doc's numbers (dB per pass, 3 digits).
  assertClose(dB(O.plateLoss(1)), 0.800, 0.0005 / 0.8, "N = 1");
  assertClose(dB(O.plateLoss(4)), 0.128, 0.0005 / 0.128, "N = 4");
  assertClose(dB(O.plateLoss(10)), 0.0355, 0.00005 / 0.0355, "N = 10");
  assertClose(dB(O.plateLoss(24.5)), 0.00980, 0.000005 / 0.0098, "N = 24.5");
  assertClose(O.plateLoss(100), 2.88e-4, 0.005 / 2.88, "N = 100");
  // Read off Fig. 22 (|g| = 1, the numerical Fox–Li losses): 0.1 dB at
  // N ≈ 4.3, 0.03 dB at N = 10, 0.01 dB at N ≈ 24. Within 20 %: the
  // formula is made for large N.
  assertClose(dB(O.plateLoss(4.3)), 0.1, 0.2, "Fig. 22 at N = 4.3");
  assertClose(dB(O.plateLoss(10)), 0.03, 0.2, "Fig. 22 at N = 10");
  assertClose(dB(O.plateLoss(24)), 0.01, 0.05, "Fig. 22 at N = 24");
  // Kogelnik & Li's eq. (87): the phase shift β = (M/4δ)α, which needs κ²:
  // at N = 100 their Fig. 24 (TEM₀₀, g = 1) reads about 0.26°.
  const M100 = Math.sqrt(8 * Math.PI * 100);
  const alpha100 = -Math.log(1 - O.plateLoss(100));
  const beta = (M100 / (4 * 0.824)) * alpha100 * 180 / Math.PI;
  assertClose(beta, 0.26, 0.05, "Fig. 24's phase shift at N = 100, degrees");
  // It falls steadily with N, and tends to all of the light at N → 0.
  let last = 1;
  for (let k = -3; k <= 4; k += 0.25) {
    const share = O.plateLoss(Math.pow(10, k));
    assert.ok(share < last && share > 0, "falls at N = 10^" + k);
    last = share;
  }
  assert.ok(O.plateLoss(1e-6) > 0.999, "N → 0: almost everything");
  assert.throws(() => O.plateLoss(0), /^Error: LaserEngine\.optics\.plateLoss: fresnel must be a positive/);
});

test("§7.7: inside the stable region each mirror loses e^(−2a²/w²) of its Gaussian spot (§7.4), never more than flat mirrors", () => {
  // He-Ne's mirrors: flat and R = 45 cm, a = 0.75 mm.
  const r = empty(0.3, 0, 1 / 0.45, 632.8e-9, 0.75e-3);
  assertClose(r.loss1, Math.exp(-2 * 0.75e-3 * 0.75e-3 / (r.w1 * r.w1)), 1e-12, "mirror 1", 1e-300);
  assertClose(r.loss2, Math.exp(-2 * 0.75e-3 * 0.75e-3 / (r.w2 * r.w2)), 1e-12, "mirror 2");
  assertClose(r.loss, 1 - (1 - r.loss1) * (1 - r.loss2), 1e-12, "both");
  assertClose(r.gamma, -0.5 * Math.log(1 - r.loss), 1e-12, "as a single-pass loss");
  assertClose(r.gamma, 7.72e-5, 0.005 / 7.72, "He-Ne's: 7.7×10⁻⁵ per pass (§5.9)");
  // Kogelnik & Li's Fig. 22 (identical mirrors): the N where the TEM₀₀
  // loss is 0.01 dB, read off the figure, for g = 0, 0.5, 0.9 and 0.99.
  // The clipping formula gives 0.022, 0.006, 0.004 and 0.012 dB there:
  // within a factor of about 2.5 (§7.7).
  for (const [g, N, doc] of [[0, 0.84, 0.022], [0.5, 1.22, 0.0057], [0.9, 2.54, 0.0041], [0.99, 6.67, 0.0117]]) {
    const pair = withG(g, g, N);
    const perPass = dB(pair.loss1);                   // one mirror: one pass
    assertClose(perPass, doc, 0.05, "g = " + g + " at N = " + N);
    assert.ok(perPass > 0.01 / 2.5 && perPass < 0.01 * 2.5, "within 2.5× of Fig. 22's 0.01 dB");
  }
  // Near the edge the clipping would grow without bound; the flat
  // mirrors' loss caps it.
  const near = withG(0.99999, 0.99999, 5);
  assertClose(near.loss1, O.plateLoss(5), 1e-12, "capped at the flat mirrors' loss");
});

test("§7.7: two flat mirrors lose Vainshtein's share per pass; the concentric pair the same (equivalence)", () => {
  const lam = 694.3e-9;
  const flat = call("resonator", { L: 0.5, l_g: 0.1, n: 1.76, c1: 0, c2: 0, lam, aperture: 5e-3 });
  const N = 5e-3 * 5e-3 / (lam * (0.4 + 0.1 / 1.76));
  assertClose(flat.fresnel, N, 1e-12, "N = a²/(λL*)");
  assertClose(flat.fresnel, 78.8, 0.05 / 78.8, "ruby's 79 (§5.9)");
  assertClose(flat.loss1, vainshtein(N), 1e-12, "mirror 1");
  assertClose(flat.loss2, vainshtein(N), 1e-12, "mirror 2");
  assertClose(flat.gamma, -Math.log(1 - vainshtein(N)), 1e-12, "one pass loses δ");
  assertClose(flat.gamma, 4.09e-4, 0.005 / 4.09, "ruby's 4.1×10⁻⁴ per pass (§5.9)");
  // (g₁, g₂) and (−g₁, −g₂) lose the same (Kogelnik & Li §4.4).
  for (const [g1, g2, N2] of [[1, 1, 5], [0.9, 0.7, 3], [0.5, 0.02, 2], [1.2, 1.1, 4], [2, -0.3, 6]]) {
    const plus = withG(g1, g2, N2);
    const minus = withG(-g1, -g2, N2);
    assertClose(minus.loss, plus.loss, 1e-9, "(" + g1 + ", " + g2 + ")", 1e-300);
    assert.equal(minus.stable, plus.stable);
  }
});

test("§7.7: outside the stable region the round trip keeps 1/M² (Siegman), and the mirrors' edges a little less", () => {
  // A wide aperture (N = 10⁴): no edge loss, only the walk-off.
  for (const [g1, g2] of [[1, 1.5], [2, 2], [-1, 2], [1, -0.2], [0.3, -3]]) {
    const r = withG(g1, g2, 1e4);
    const m = 2 * g1 * g2 - 1;
    const M = Math.abs(m) + Math.sqrt(m * m - 1);
    assert.equal(r.stable, false);
    assertClose(r.magnification, M, 1e-12, "M at (" + g1 + ", " + g2 + ")");
    assertClose(r.loss, 1 - 1 / (M * M), 1e-9, "1 − 1/M²");
    assertClose(r.gamma, Math.log(M), 1e-9, "γ_m = ln M");
  }
  // With a small N the edges add their share.
  const r = withG(1, 1.5, 2);
  assertClose(r.loss, 1 - (1 - r.loss1) * (1 - r.loss2) / Math.pow(r.magnification, 2), 1e-12, "both");
  assert.ok(r.loss1 > 0 && r.loss2 > 0);
});

test("§7.7: the loss runs on smoothly across every edge of the stable region", () => {
  // Each edge, approached from both sides at ε and then 1000 times closer:
  // the two sides agree to within a few √ε (the walk-off grows as
  // √(|m| − 1) past the edge), and closer still the closer one goes.
  const edges = [
    ["plane-parallel g₁ = g₂ = 1", (e) => [1 - e, 1 - e], (e) => [1 + e, 1 + e]],
    ["concentric g₁ = g₂ = −1", (e) => [-1 + e, -1 + e], (e) => [-1 - e, -1 - e]],
    ["g₁g₂ = 1 off the diagonal", (e) => [2, 0.5 - e], (e) => [2, 0.5 + e]],
    ["hemispherical g₁ = 1, g₂ = 0", (e) => [1, e], (e) => [1, -e]],
    ["g₁g₂ = 0, g₁ = 0.5", (e) => [0.5, e], (e) => [0.5, -e]],
    ["g₁ = 0, g₂ = −0.6", (e) => [-e, -0.6], (e) => [e, -0.6]]
  ];
  for (const N of [1, 5, 80]) {
    for (const [name, inside, outside] of edges) {
      const gap = (e) => Math.abs(withG(...inside(e), N).loss - withG(...outside(e), N).loss);
      const far = gap(1e-6);
      const close = gap(1e-12);
      assert.ok(withG(...inside(1e-6), N).stable && !withG(...outside(1e-6), N).stable, name + ": the sides");
      assert.ok(far < 1e-2, name + " at N = " + N + ": " + far + " apart at ε = 10⁻⁶");
      assert.ok(close < 1e-5, name + " at N = " + N + ": " + close + " apart at ε = 10⁻¹²");
      assert.ok(close < far || far === 0, name + ": closer at ε = 10⁻¹²");
    }
  }
  // On the edge g₁g₂ = 1 both sides meet at the flat mirrors' (1 − δ)².
  const onEdge = withG(1, 1, 5);
  assertClose(1 - onEdge.loss, Math.pow(1 - O.plateLoss(5), 2), 1e-12, "(1 − δ_flat)²");
  // On g₁g₂ = 0 at 1 − δ: one mirror's spot grows, the other's shrinks to a point.
  const hemi = withG(1, 0, 5);
  assertClose(hemi.loss, O.plateLoss(5), 1e-12, "δ_flat");
  assert.equal(hemi.loss1, 0, "the flat mirror's spot is a point");
  // The doc's steep rise past the edge at N = 5: 4.2 %, 5.9 %, 20 %.
  assertClose(withG(1, 1, 5).loss, 0.0424, 0.005 / 4.24, "at the edge");
  assertClose(withG(1.00001, 1.00001, 5).loss, 0.0594, 0.005 / 5.94, "g = 1.00001");
  assertClose(withG(1.001, 1.001, 5).loss, 0.199, 0.005 / 1.99, "g = 1.001");
});

test("resonator checks its inputs and names itself; it leaves them unchanged", () => {
  const ok = { L: 0.3, l_g: 0.05, n: 1.82, c1: 0, c2: 1, lam: 1064e-9, aperture: 1.5e-3 };
  assert.doesNotThrow(() => call("resonator", ok));
  const cases = [
    [{ L: 0 }, /L must be a positive/],
    [{ l_g: 0.4 }, /l_g \(0\.4 m\) is longer than the cavity/],
    [{ l_g: -1 }, /l_g must be a finite number of at least 0/],
    [{ n: 0.9 }, /n must be a finite number of at least 1/],
    [{ c1: Infinity }, /c1 must be a finite number/],
    [{ c2: NaN }, /c2 must be a finite number/],
    [{ lam: 0 }, /lam must be a positive/],
    [{ aperture: -1 }, /aperture must be a positive/],
    [{ Rc1: 1 }, /Rc1 is not one of its inputs/]
  ];
  for (const [change, pattern] of cases) {
    assert.throws(() => call("resonator", Object.assign({}, ok, change)),
      (err) => /^LaserEngine\.optics\.resonator: /.test(err.message) && pattern.test(err.message), JSON.stringify(change));
  }
  assert.throws(() => O.resonator(5), /needs one object of named values/);
  assert.throws(() => O.beamRadius(Object.assign({}, ok, { aperture: undefined, z: 0.4 })), /aperture is not one of its inputs|z must be/);
  assert.throws(() => call("beamRadius", { L: 0.3, l_g: 0, n: 1, c1: 0, c2: 1, lam: 1e-6, z: 0.31 }),
    /^Error: LaserEngine\.optics\.beamRadius: z must be a finite number from 0 to 0\.3/);
  assert.throws(() => call("slab", { l: 0.1, n: 0.5 }), /^Error: LaserEngine\.optics\.slab: n must/);
  assert.throws(() => O.freeSpace(-1), /^Error: LaserEngine\.optics\.freeSpace: d must/);
  assert.throws(() => O.mirror("flat"), /^Error: LaserEngine\.optics\.mirror: c must be a finite number/);
  assert.ok(Object.isFrozen(O));
});
