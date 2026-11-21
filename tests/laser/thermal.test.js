/* ============================================================================
   thermal.test.js — the rod's thermal lens (docs/laser-plan.md, stage 13c
   scope card; docs/laser-physics.md §7.3 and §8.7): the media's thermal
   numbers, optics.js with a thin lens at the cavity's middle (Kogelnik's
   equivalent resonator, the beam through the lens, the ray trace), and the
   bench, where the pump of the diode-pumped Nd:YAG makes the lens.

   Every call gets a deep-frozen input, so a function that changed its
   input would throw.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine, deepFreeze, assertClose, plain, thermalLens } = require("./helpers.js");

const E = loadEngine();
const O = E.optics;
const B = E.bench;

function call(name, params) {
  return O[name](deepFreeze(params));
}

function configFor(medium, pump, changes) {
  return deepFreeze(Object.assign(B.configFor({ medium, pump }), changes || {}));
}

// The diode-pumped Nd:YAG bench's cavity (bench.js SETUPS): L = 30 cm, a
// 5 cm rod of n = 1.82, a flat back mirror and a 1 m output mirror, a
// 1.5 mm aperture.
const YAG_CAVITY = { L: 0.3, l_g: 0.05, n: 1.82, c1: 0, c2: 1 };
const LAM = 1064e-9;

// The matrices by hand (§7.3), for the checks below.
function product(list) {
  let r = { A: 1, B: 0, C: 0, D: 1 };
  for (const m of list) {
    r = { A: m.A * r.A + m.B * r.C, B: m.A * r.B + m.B * r.D, C: m.C * r.A + m.D * r.C, D: m.C * r.B + m.D * r.D };
  }
  return r;
}
const space = (d) => ({ A: 1, B: d, C: 0, D: 1 });
const lensOf = (P) => ({ A: 1, B: 0, C: -P, D: 1 });
const mirrorOf = (c) => ({ A: 1, B: 0, C: -2 * c, D: 1 });

// A seeded random source, so the "any pair" tests are the same every run.
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/* ---------- the numbers (§8.7) ---------- */

test("§8.7's example: a 6 mm Nd:YAG rod with 100 W of heat, f = 2KA/(P_h·dn/dT) = 1.08 m (written ≈ 1 m before stage 13c)", () => {
  const yag = E.media.get("nd-yag");
  const A = Math.PI * 3e-3 * 3e-3;
  // 2 · 14 · 2.827×10⁻⁵ / (100 · 7.3×10⁻⁶) = 1.0845 m
  assertClose(2 * yag.thermalK * A / (100 * yag.dndT), 1.0845, 0.0001, "f");
});

test("only Nd:YAG has thermal numbers: K = 14 W/(m·K), dn/dT = 7.3×10⁻⁶ K⁻¹ (§8.7); every other medium null", () => {
  for (const id of E.media.list()) {
    const m = E.media.get(id);
    if (id === "nd-yag") {
      assertClose(m.thermalK, 14, 1e-12, "K");
      assertClose(m.dndT, 7.3e-6, 1e-12, "dn/dT");
    } else {
      assert.equal(m.thermalK, null, id + " K");
      assert.equal(m.dndT, null, id + " dn/dT");
    }
  }
});

/* ---------- optics.js with a lens (§7.3) ---------- */

test("thinLens(P) is [[1, 0], [−P, 1]]", () => {
  assert.deepEqual(plain(O.thinLens(2)), { A: 1, B: 0, C: -2, D: 1 });
  assert.deepEqual(plain(O.thinLens(0)), { A: 1, B: 0, C: 0, D: 1 });
  assert.throws(() => O.thinLens(Infinity), /^Error: LaserEngine\.optics\.thinLens: P must be a finite number/);
});

test("the round trip with a lens at the middle is the matrices by hand, and (A + D)/2 = 2g₁g₂ − 1 with the equivalent g's", () => {
  const random = seeded(7);
  for (let k = 0; k < 200; k++) {
    const L = 0.1 + random();
    const l_g = random() * L;
    const n = 1 + random();
    const c1 = 4 * random() - 2;
    const c2 = 4 * random() - 2;
    const P = 20 * random() - 5;              // diverging ones too
    const Lr = L - l_g + l_g / n;
    const half = space(Lr / 2);
    const pass = product([half, lensOf(P), half]);
    const expected = product([pass, mirrorOf(c2), pass, mirrorOf(c1)]);
    const M = call("roundTrip", { L, l_g, n, c1, c2, lens: P });
    for (const name of ["A", "B", "C", "D"]) assertClose(M[name], expected[name], 1e-9, name + " " + k, 1e-12);
    const r = call("resonator", { L, l_g, n, c1, c2, lens: P, lam: LAM, aperture: 1e-3 });
    // Kogelnik's equivalent resonator, written out: L₀ = 2d − d²P.
    const d = Lr / 2;
    const L0 = 2 * d - d * d * P;
    assertClose(r.g1, 1 - d * P - L0 * c1, 1e-12, "g₁ " + k, 1e-12);
    assertClose(r.g2, 1 - d * P - L0 * c2, 1e-12, "g₂ " + k, 1e-12);
    assertClose(r.m, (M.A + M.D) / 2, 1e-9, "m " + k, 1e-12);
    assert.equal(r.stable, Math.abs(r.m) < 1, "stable " + k);
  }
});

test("lens: 0 is the cavity without a lens, bit for bit, and a lens of 10⁻¹² m⁻¹ almost the same", () => {
  const base = Object.assign({ lam: LAM, aperture: 1.5e-3 }, YAG_CAVITY);
  const none = call("resonator", Object.assign({ lens: 0 }, base));
  const tiny = call("resonator", Object.assign({ lens: 1e-12 }, base));
  // The empty pair's numbers (§7.1–7.2): g₁ = 1, g₂ = 1 − L*.
  const Lr = 0.3 - 0.05 + 0.05 / 1.82;
  assert.equal(none.g1, 1);
  assertClose(none.g2, 1 - Lr, 1e-12, "g₂");
  for (const name of ["g1", "g2", "m", "w0", "w1", "w2", "gamma"]) {
    assertClose(tiny[name], none[name], 1e-9, name);
  }
  assertClose(tiny.waistAt, none.waistAt, 1e-9, "waistAt", 1e-12);
});

test("the beam with a lens: continuous through it, the mirrors' spots are the equivalent resonator's (|L₀| for L*), w₀ the narrowest place", () => {
  for (const P of [1, 3.3, 6, -1]) {
    const p = Object.assign({ lens: P, lam: LAM, aperture: 1.5e-3 }, YAG_CAVITY);
    const r = call("resonator", p);
    if (!r.stable) continue;
    const beam = (z) => call("beamRadius", Object.assign({ lens: P, lam: LAM, z }, YAG_CAVITY));
    // The lens is at the rod's middle, z = 15 cm.
    assertClose(beam(0.15 - 1e-12), beam(0.15 + 1e-12), 1e-9, "continuous at the lens, P = " + P);
    const d = r.reducedLength / 2;
    const L0 = Math.abs(2 * d - d * d * P);
    const g = r.g1 * r.g2;
    const w1 = Math.sqrt((LAM * L0 / Math.PI) * Math.sqrt(r.g2 / (r.g1 * (1 - g))));
    const w2 = Math.sqrt((LAM * L0 / Math.PI) * Math.sqrt(r.g1 / (r.g2 * (1 - g))));
    assertClose(r.w1, w1, 1e-9, "w₁, P = " + P);
    assertClose(r.w2, w2, 1e-9, "w₂, P = " + P);
    assertClose(beam(0), w1, 1e-9, "beamRadius at mirror 1");
    assertClose(beam(0.3), w2, 1e-9, "beamRadius at mirror 2");
    // w₀ is the narrowest of 3001 places, within the grid's step.
    let narrowest = Infinity;
    for (let k = 0; k <= 3000; k++) narrowest = Math.min(narrowest, beam(k * 0.3 / 3000));
    assert.ok(r.w0 <= narrowest * (1 + 1e-12), "w₀ is the narrowest, P = " + P);
    assertClose(r.w0, narrowest, 1e-4, "w₀, P = " + P);
    assert.ok(r.waistAt >= 0 && r.waistAt <= 0.3, "inside the cavity");
    assertClose(beam(r.waistAt), r.w0, 1e-9, "w at waistAt");
  }
});

test("the beam with a lens: a symmetric pair has its two waists at the same distance from the lens", () => {
  // Two concave 1 m mirrors 1 m apart, a 2 m⁻¹ lens in the middle: the
  // waists sit one each side, symmetric about the middle.
  const p = { L: 1, l_g: 0, n: 1, c1: 1, c2: 1, lens: 2 };
  const beam = (z) => call("beamRadius", Object.assign({ lam: LAM, z }, p));
  for (const z of [0, 0.1, 0.25, 0.4]) assertClose(beam(z), beam(1 - z), 1e-9, "z = " + z);
  // Each waist is inside its piece (at 0.25 and 0.75 m), narrower than the
  // mirrors and the lens: w₀ is that waist.
  const r = call("resonator", Object.assign({ lam: LAM, aperture: 1e-2 }, p));
  let narrowest = Infinity;
  for (let k = 0; k <= 1000; k++) narrowest = Math.min(narrowest, beam(k / 1000));
  assertClose(r.w0, narrowest, 1e-9, "w₀");
  assertClose(r.waistAt, 0.75, 1e-9, "the first waist found narrowest: 0.25 or 0.75", 1e-9);
  assert.ok(r.w0 < 0.99 * Math.min(r.w1, beam(0.5)), "narrower than a mirror's spot and the lens's");
});

test("the losses with a lens: the clip e^(−2a²/w²) on each mirror's spot, never more than the flat mirrors'", () => {
  const P = 3.3;
  const r = call("resonator", Object.assign({ lens: P, lam: LAM, aperture: 0.4e-3 }, YAG_CAVITY));
  assert.ok(r.stable);
  const flat = O.plateLoss(r.fresnel);
  const share = (w) => Math.min(Math.exp(-2 * 0.4e-3 * 0.4e-3 / (w * w)), flat);
  assertClose(r.loss1, share(r.w1), 1e-9, "mirror 1");
  assertClose(r.loss2, share(r.w2), 1e-9, "mirror 2");
  assertClose(r.gamma, -0.5 * (Math.log1p(-r.loss1) + Math.log1p(-r.loss2)), 1e-12, "γ_m");
});

test("traceRay with a lens: each pass bends at the middle by −P·y, `middle` on every hit; none without a lens", () => {
  const P = 3.3;
  const p = Object.assign({ lens: P, aperture: 1.5e-3, y: 0.4e-3, theta: 0.2e-3, roundTrips: 3 }, YAG_CAVITY);
  const run = call("traceRay", p);
  assert.equal(run.hits.length, 6);
  const Lr = 0.3 - 0.05 + 0.05 / 1.82;
  let y = 0.4e-3;
  let theta = 0.2e-3;
  const curvatures = [1, 0];
  run.hits.forEach((hit, k) => {
    y += (Lr / 2) * theta;
    const middle = y;
    theta -= P * y;
    y += (Lr / 2) * theta;
    theta -= 2 * curvatures[k % 2] * y;
    assert.equal(hit.mirror, k % 2 === 0 ? 2 : 1);
    assertClose(hit.middle, middle, 1e-12, "middle " + k, 1e-18);
    assertClose(hit.y, y, 1e-12, "y " + k, 1e-18);
    assertClose(hit.theta, theta, 1e-12, "θ " + k, 1e-18);
  });
  const without = call("traceRay", Object.assign({}, p, { lens: 0 }));
  without.hits.forEach((hit) => assert.equal("middle" in hit, false));
});

test("every function that takes the mirrors refuses a missing or impossible lens, and names itself", () => {
  const rays = { aperture: 1e-3, y: 0, theta: 0, roundTrips: 1 };
  const cases = [
    ["roundTrip", {}],
    ["resonator", { lam: LAM, aperture: 1e-3 }],
    ["beamRadius", { lam: LAM, z: 0.1 }],
    ["traceRay", rays]
  ];
  for (const [name, extra] of cases) {
    const ok = Object.assign({}, YAG_CAVITY, extra);
    assert.throws(() => call(name, ok), new RegExp("^Error: LaserEngine\\.optics\\." + name + ": lens must be a finite number, got undefined"));
    assert.throws(() => call(name, Object.assign({ lens: NaN }, ok)), /lens must be a finite number, got NaN/);
    assert.throws(() => call(name, Object.assign({ lens: Infinity }, ok)), /lens must be a finite number/);
    assert.doesNotThrow(() => call(name, Object.assign({ lens: 2 }, ok)));
  }
});

/* ---------- the bench ---------- */

test("the diode-pumped Nd:YAG's lens: P_h = (1 − η·λ_p/λ_l)·P_abs, f = K·A/(P_h·dn/dT): 1.2117 m at 5 W, 0.3029 m at 20 W", () => {
  const heatShare = 1 - 0.9 * 808 / 1064;                    // 0.3165
  assertClose(heatShare, 0.316541, 1e-5, "the heat share");
  for (const [power, f] of [[5, 1.21173], [20, 0.302932], [1.5, 4.03909]]) {
    const d = B.derive(configFor("nd-yag", "diode", { pumpPower: power }));
    assertClose(d.thermalFocus, 14 * 1e-6 / (heatShare * power * 7.3e-6), 1e-12, "the formula at " + power + " W");
    assertClose(d.thermalFocus, f, 1e-5, power + " W");
  }
  // Half the pump, twice the focal length.
  const a = B.derive(configFor("nd-yag", "diode", { pumpPower: 4 }));
  const b = B.derive(configFor("nd-yag", "diode", { pumpPower: 8 }));
  assertClose(a.thermalFocus, 2 * b.thermalFocus, 1e-12, "f ∝ 1/P");
  // A smaller pumped area makes a stronger lens: f ∝ A.
  const small = B.derive(configFor("nd-yag", "diode", { area: 0.5e-6 }));
  assertClose(small.thermalFocus, 1.21173 / 2, 1e-5, "f ∝ A");
});

test("no lens with the pump off, on the flashlamp Nd:YAG, and on every other bench", () => {
  assert.equal(B.derive(configFor("nd-yag", "diode", { pumpPower: 0 })).thermalFocus, null, "pump off");
  for (const medium of E.media.list()) {
    for (const pump of B.pumpsFor(medium)) {
      const d = B.derive(configFor(medium, pump));
      if (medium === "nd-yag" && pump === "diode") assert.ok(d.thermalFocus > 0);
      else assert.equal(d.thermalFocus, null, medium + " " + pump);
    }
  }
});

test("derive's resonator has the lens: the dot on the stability diagram moves with the pump, (1, 0.72) at 0 W to (0.54, 0.33) at 20 W", () => {
  const off = B.derive(configFor("nd-yag", "diode", { pumpPower: 0 }));
  assert.equal(off.resonator.g1, 1);
  assertClose(off.resonator.g2, 0.7225, 1e-3, "g₂ off");
  const full = B.derive(configFor("nd-yag", "diode", { pumpPower: 20 }));
  assertClose(full.resonator.g1, 0.5422, 1e-3, "g₁ at 20 W");
  assertClose(full.resonator.g2, 0.3282, 1e-3, "g₂ at 20 W");
  assert.ok(full.resonator.stable);
  // The same as optics.resonator with the lens at its power.
  const c = configFor("nd-yag", "diode", { pumpPower: 20 });
  const expected = O.resonator(deepFreeze({
    L: c.L, l_g: c.l_g, n: 1.82, c1: 0, c2: 1 / c.Rc2, lens: thermalLens(E, c), lam: LAM, aperture: c.aperture
  }));
  assert.deepEqual(plain(full.resonator), plain(expected));
});

test("pumped harder the pair leaves the stable region (g₂ = 0 at 36.6 W) and comes back past 43.7 W (both g negative)", () => {
  const at = (power) => B.derive(configFor("nd-yag", "diode", { pumpPower: power })).resonator;
  assert.equal(at(36).stable, true, "36 W");
  assert.equal(at(37).stable, false, "37 W");
  assert.ok(at(37).g2 < 0 && at(37).g1 > 0);
  assert.equal(at(43).stable, false, "43 W");
  assert.equal(at(44).stable, true, "44 W");
  assert.ok(at(44).g1 < 0 && at(44).g2 < 0);
  // Out there the pair walks the light out (M > 1), but by less than
  // ln 1.2 per pass: the laser, 24 times over the cold cavity's threshold,
  // keeps going, x = 5.1 of the threshold the walk-off raises (the scope
  // card: why the slider stops at 20 W).
  const r = at(40);
  assert.ok(r.magnification > 1 && Math.log(r.magnification) < Math.log(1.2), "M = " + r.magnification);
  const d = B.derive(configFor("nd-yag", "diode", { pumpPower: 40 }));
  assert.ok(d.x > 5 && d.P_out > 0, "still lasing: x = " + d.x);
});

test("beamPath has the lens: the mode and the rays are optics' with it, and the rays carry `middle`", () => {
  const c = configFor("nd-yag", "diode", { pumpPower: 20 });
  const d = B.derive(c);
  const mirrors = { L: c.L, l_g: c.l_g, n: 1.82, c1: 0, c2: 1 / c.Rc2, lens: thermalLens(E, c) };
  const path = B.beamPath(deepFreeze({ config: c, starts: [0.3e-3], roundTrips: 2, points: 4 }));
  path.mode.forEach((point) => {
    assertClose(point.w, O.beamRadius(deepFreeze(Object.assign({ lam: LAM, z: point.z }, mirrors))), 1e-12, "w");
  });
  const ray = O.traceRay(deepFreeze(Object.assign({ aperture: c.aperture, y: 0.3e-3, theta: 0, roundTrips: 2 }, mirrors)));
  assert.deepEqual(plain(path.rays[0]), plain(ray));
  assert.ok(path.rays[0].hits.every((hit) => typeof hit.middle === "number"));
});

test("the threshold is the cavity's as it is now: with the lens, still 1.51 W on the diode bench (the lens moves it by under 10⁻⁶)", () => {
  const d = B.derive(configFor("nd-yag", "diode"));
  const off = B.derive(configFor("nd-yag", "diode", { pumpPower: 0 }));
  assertClose(d.pumpThreshold, off.pumpThreshold, 1e-6, "with and without the lens");
  assertClose(d.pumpThreshold, 1.51, 0.005, "1.51 W");
});
