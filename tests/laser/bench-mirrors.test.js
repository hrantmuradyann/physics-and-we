/* ============================================================================
   bench-mirrors.test.js — the mirrors on the bench (docs/laser-plan.md,
   stage 10a scope card; docs/laser-physics.md §5.9 and §7.7): each setup's
   real mirrors, the config's mirror fields, and the light the mirrors lose
   joining every threshold.

   optics.js itself is tested in optics.test.js.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine, deepFreeze, assertClose, plain, mirrorCurvature, thermalLens } = require("./helpers.js");

const E = loadEngine();
const B = E.bench;

function configFor(medium, pump, changes) {
  return deepFreeze(Object.assign(B.configFor({ medium, pump }), changes || {}));
}

function advance(sim, cfg, seconds, maxSteps) {
  return B.advance(deepFreeze({ sim: plain(sim), config: cfg, seconds, maxSteps }));
}

// §5.9's table: mirror 1, mirror 2 (shape and radius, m; a flat mirror's
// radius is not used), the aperture (m), stable, and the loss per pass
// (single-pass logarithmic, γ_m) with its tolerance.
const MIRRORS = {
  "ruby flashlamp": ["flat", null, "flat", null, 5e-3, false, 4.09e-4],
  "nd-glass flashlamp": ["flat", null, "flat", null, 5e-3, false, 7.86e-4],
  "nd-yag flashlamp": ["concave", 5, "flat", null, 3e-3, true, 1.85e-20],
  "nd-yag diode": ["flat", null, "concave", 1, 1.5e-3, true, 2.44e-10],
  "he-ne discharge": ["flat", null, "concave", 0.45, 0.75e-3, true, 7.72e-5],
  "ar-ion discharge": ["concave", 5, "flat", null, 1.5e-3, true, 8.97e-6],
  "co2 discharge": ["concave", 20, "flat", null, 6e-3, true, 4.86e-3],
  "dye-r6g laser": ["concave", 0.3, "concave", 0.3, 5e-3, true, 0],
  "ti-sapphire laser": ["concave", 1, "concave", 1, 5e-3, true, 0],
  "two-level laser": ["flat", null, "concave", 0.5, 0.56e-3, true, 4.55e-6],
  "two-level flashlamp": ["flat", null, "concave", 0.5, 0.56e-3, true, 4.55e-6]
};

test("§5.9: every bench has its real mirrors, aperture and loss", () => {
  for (const key of Object.keys(MIRRORS)) {
    const [medium, pump] = key.split(" ");
    const [shape1, R1, shape2, R2, aperture, stable, gamma] = MIRRORS[key];
    // With the pump off, so the rod's thermal lens (stage 13c,
    // thermal.test.js) is not in γ_m: these are the mirrors alone.
    const c = configFor(medium, pump, "pumpPower" in configFor(medium, pump) ? { pumpPower: 0 } : {});
    assert.equal(c.mirror1, shape1, key + " mirror 1");
    assert.equal(c.mirror2, shape2, key + " mirror 2");
    if (R1 !== null) assertClose(c.Rc1, R1, 1e-12, key + " R₁");
    if (R2 !== null) assertClose(c.Rc2, R2, 1e-12, key + " R₂");
    assertClose(c.aperture, aperture, 1e-12, key + " aperture");
    const d = B.derive(c);
    assert.equal(d.resonator.stable, stable, key + " stable");
    if (gamma === 0) assert.ok(d.resonator.gamma < 1e-40, key + ": nothing lost, " + d.resonator.gamma);
    else assertClose(d.resonator.gamma, gamma, 0.005, key + " γ_m");
  }
  assert.deepEqual(Array.from(B.MIRROR_SHAPES), ["flat", "concave", "convex"]);
  assert.ok(Object.isFrozen(B.MIRROR_SHAPES));
});

test("derive's resonator is optics.resonator of the config's mirrors: concave c = 1/R, convex −1/R, flat 0", () => {
  for (const [shape1, shape2] of [["flat", "concave"], ["concave", "convex"], ["convex", "flat"], ["concave", "concave"]]) {
    const c = configFor("nd-yag", "diode", { mirror1: shape1, Rc1: 2, mirror2: shape2, Rc2: 3 });
    const d = B.derive(c);
    const expected = E.optics.resonator({
      L: c.L, l_g: c.l_g, n: E.media.get("nd-yag").n, c1: mirrorCurvature(shape1, 2), c2: mirrorCurvature(shape2, 3),
      lens: thermalLens(E, c), lam: E.media.get("nd-yag").lam, aperture: c.aperture
    });
    assert.deepEqual(plain(d.resonator), plain(expected), shape1 + ", " + shape2);
  }
  // A flat mirror's radius is kept for the page but changes nothing.
  const a = B.derive(configFor("ruby", "flashlamp", { Rc1: 0.2 }));
  const b = B.derive(configFor("ruby", "flashlamp", { Rc1: 30 }));
  assert.deepEqual(plain(a.resonator), plain(b.resonator));
  assert.equal(a.gamma, b.gamma);
});

test("the mirrors' loss joins γ: γ = α_i·l + ½·ln(1/(R₁R₂)) + γ_m, so every threshold rises with it", () => {
  for (const key of Object.keys(MIRRORS)) {
    const [medium, pump] = key.split(" ");
    const c = configFor(medium, pump);
    const d = B.derive(c);
    const without = c.alpha_i * c.l_g - 0.5 * (Math.log(c.refl1) + Math.log(c.refl2));
    assertClose(d.gamma, without + d.resonator.gamma, 1e-12, key + " γ");
    assertClose(d.alphaWithMirrors, c.alpha_i + d.resonator.gamma / c.l_g, 1e-12, key + " α");
  }
  // He-Ne's output mirror bent harder, R₂ = 32 cm (g₂ = 0.06, still
  // stable): a bigger spot on it, more clipped, a higher threshold current.
  const usual = B.derive(configFor("he-ne", "discharge"));
  const tight = B.derive(configFor("he-ne", "discharge", { Rc2: 0.32 }));
  assert.equal(tight.resonator.stable, true);
  assert.ok(tight.resonator.gamma > 10 * usual.resonator.gamma, "more loss: " + tight.resonator.gamma);
  assert.ok(tight.currentThreshold > usual.currentThreshold, "a higher threshold current");
  assert.ok(tight.x < usual.x);
});

test("§7.7: a slightly unstable He-Ne stops (R₂ = 29 cm in its 30 cm tube), at any current", () => {
  const c = configFor("he-ne", "discharge", { Rc2: 0.29 });
  const d = B.derive(c);
  assert.equal(d.resonator.stable, false);
  // g₂ = −0.034: m = −1.069, M = 1.447, half the light walks out a round trip.
  assertClose(d.resonator.magnification, 1.4467, 1e-4, "M");
  assert.ok(d.resonator.loss > 0.5, "round trip loses " + d.resonator.loss);
  assert.equal(d.currentThreshold, null, "no current reaches threshold");
  const top = B.controls(c).pump.max;
  for (let k = 1; k <= 10; k++) {
    const x = B.derive(configFor("he-ne", "discharge", { Rc2: 0.29, current: top * k / 10 })).x;
    assert.ok(x < 0.12, "x = " + x + " at " + top * k / 10 + " A");
  }
});

test("§7.7: two flat mirrors on ruby lase (the first laser had them); a convex output mirror needs more flash but still lases", () => {
  // Ruby's own flat mirrors: Vainshtein's 4.1×10⁻⁴ per pass, the threshold
  // flash 639 J (638.68 J with ideal mirrors).
  const flat = configFor("ruby", "flashlamp");
  assert.equal(B.derive(flat).resonator.stable, false, "on the edge, not inside");
  assertClose(B.flashThreshold(flat), 638.78, 1e-4, "threshold flash, J");
  // A convex output mirror of R = 5 m: unstable, M = 1.81, γ_m = 0.60 against
  // ruby's 0.35. The threshold rises only to 803 J: ruby's threshold is
  // mostly the half of its ions that must be lifted first (§3.1).
  const convex = configFor("ruby", "flashlamp", { mirror2: "convex", Rc2: 5, flashEnergy: 2000 });
  const d = B.derive(convex);
  assertClose(d.resonator.magnification, 1.8143, 1e-4, "M");
  assertClose(d.resonator.gamma, 0.5957, 1e-3, "γ_m");
  assertClose(B.flashThreshold(convex), 803.06, 1e-4, "threshold flash, J");
  // Both give laser light after a strong flash: 1 ms in ten calls.
  // Measured: flat 1000 J, 15 023 steps (at most 3361 a call), 436 kW at
  // the top; convex 2000 J, 24 959 steps (at most 5030), 336 kW.
  for (const [cfg, bound] of [[configFor("ruby", "flashlamp"), 5100], [convex, 7600]]) {
    let sim = B.fire({ sim: B.start(cfg), config: cfg });
    let top = 0;
    for (let i = 0; i < 10; i++) {
      const run = advance(sim, cfg, 1e-4, bound);
      assert.equal(run.reachedEnd, true, cfg.mirror2 + ": call " + i);
      sim = run.sim;
      top = Math.max(top, run.peak.power);
    }
    assert.ok(top > 1e5, cfg.mirror2 + " output mirror: " + top + " W at the top");
  }
});

test("the mirror fields are checked, and every error names the function that was called", () => {
  const cases = [
    [{ mirror1: "round" }, /mirror1 must be one of flat, concave, convex, got "round"/],
    [{ mirror2: undefined }, /mirror2 must be one of flat, concave, convex/],
    [{ Rc1: 0 }, /Rc1 must be a finite number of at least 0.001/],
    [{ Rc2: -1 }, /Rc2 must be a finite number of at least 0.001/],
    [{ Rc2: Infinity }, /Rc2 must be a finite number of at least 0.001/],
    // 10⁻¹⁶⁰ m made 1/R and M overflow inside optics.js (the review).
    [{ mirror2: "convex", Rc2: 1e-160 }, /Rc2 must be a finite number of at least 0.001/],
    // A magnification too large to compute (a 1 mm convex mirror on a
    // cavity 10³⁰⁰ m long) is refused by derive, not by optics.js.
    [{ mirror2: "convex", Rc2: 1e-3, L: 1e300 }, /the mirrors lose too much light to compute/],
    [{ aperture: 0 }, /aperture must be a positive finite number/]
  ];
  for (const [change, pattern] of cases) {
    const c = Object.assign(B.configFor({ medium: "nd-yag", pump: "diode" }), change);
    assert.throws(() => B.derive(c), (err) => /^LaserEngine\.bench\.derive: /.test(err.message) && pattern.test(err.message),
      JSON.stringify(change));
    assert.throws(() => B.controls(c), /^Error: LaserEngine\.bench\.controls: /);
  }
  // The guard against a lossless cavity counts the mirrors' loss (the
  // review): perfect mirrors and no α_i, but a convex 10 cm output mirror
  // losing γ_m = 2.57 per pass, is a cavity that loses plenty.
  const lossy = B.derive(Object.assign(B.configFor({ medium: "nd-yag", pump: "diode" }),
    { alpha_i: 0, refl2: 1, mirror2: "convex", Rc2: 0.1 }));
  assertClose(lossy.gamma, lossy.resonator.gamma - 0.5 * Math.log(B.configFor({ medium: "nd-yag", pump: "diode" }).refl1), 1e-12, "γ");
  assert.ok(lossy.gamma > 2, "γ = " + lossy.gamma);
  const missing = B.configFor({ medium: "nd-yag", pump: "diode" });
  delete missing.aperture;
  assert.throws(() => B.derive(missing), /aperture must be a positive/);
});

test("a Q-switch, and carrying the run over to it, keep the mirrors", () => {
  const c = configFor("nd-yag", "diode", { mirror2: "convex", Rc2: 7 });
  const filtered = B.withQSwitch(deepFreeze({ config: c, qSwitch: "absorber" }));
  for (const name of ["mirror1", "Rc1", "mirror2", "Rc2", "aperture"]) assert.equal(filtered[name], c[name], name);
  const back = B.withQSwitch(deepFreeze({ config: filtered, qSwitch: "none" }));
  assert.deepEqual(plain(back), plain(c));
  const carried = B.carryOver(deepFreeze({ sim: B.start(c), config: filtered }));
  assert.equal(carried.absorber, 1);
});

/* ---------- stage 10b: what the page needs for the mirrors ---------- */

test("controls: a radius slider for each curved mirror, from L/4 (past concentric, L/2) to 50 m, log; none for a flat mirror", () => {
  for (const key of Object.keys(MIRRORS)) {
    const [medium, pump] = key.split(" ");
    const c = configFor(medium, pump);
    const R = B.controls(c);
    for (const [shape, name] of [[c.mirror1, "Rc1"], [c.mirror2, "Rc2"]]) {
      if (shape === "flat") {
        assert.equal(R[name], null, key + " " + name);
        continue;
      }
      assert.equal(R[name].name, name);
      assertClose(R[name].min, c.L / 4, 1e-12, key + " " + name + " min");
      assert.equal(R[name].max, 50);
      assert.equal(R[name].log, true);
      // It reaches the concentric (R = L/2) and confocal (R = L) pairs,
      // and every bench's own mirror lies inside it.
      assert.ok(R[name].min < c.L / 2 && R[name].max > c.L, key);
      assert.ok(c[name] >= R[name].min && c[name] <= R[name].max, key + " " + name + " = " + c[name]);
    }
  }
  // Bent, a flat mirror gets its slider, at the radius it kept.
  const bent = configFor("ruby", "flashlamp", { mirror2: "concave" });
  const R = B.controls(bent);
  assert.equal(R.Rc1, null);
  assert.equal(R.Rc2.name, "Rc2");
  assert.ok(bent.Rc2 >= R.Rc2.min && bent.Rc2 <= R.Rc2.max, "ruby's kept radius " + bent.Rc2);
});

test("beamPath: the mode's width along the cavity and the traced rays, from the config's mirrors", () => {
  const c = configFor("he-ne", "discharge");
  const medium = E.media.get("he-ne");
  const base = {
    L: c.L, l_g: c.l_g, n: medium.n,
    c1: mirrorCurvature(c.mirror1, c.Rc1), c2: mirrorCurvature(c.mirror2, c.Rc2), lens: 0
  };
  const path = B.beamPath(deepFreeze({ config: c, starts: [0.2e-3, -0.1e-3], roundTrips: 3, points: 10 }));
  // 11 points from mirror 1 (z = 0) to mirror 2 (z = L), each optics.beamRadius.
  assert.equal(path.mode.length, 11);
  path.mode.forEach((point, k) => {
    assertClose(point.z, k * c.L / 10, 1e-12, "z " + k, 1e-15);
    assertClose(point.w, E.optics.beamRadius(Object.assign({ lam: medium.lam, z: point.z }, base)), 1e-12, "w " + k);
  });
  // Each ray is optics.traceRay from mirror 1, starting along the axis.
  assert.equal(path.rays.length, 2);
  [0.2e-3, -0.1e-3].forEach((y, k) => {
    const expected = E.optics.traceRay(Object.assign({ aperture: c.aperture, y: y, theta: 0, roundTrips: 3 }, base));
    assert.deepEqual(plain(path.rays[k]), plain(expected), "ray " + k);
  });
  // The rod counts l/n: on the diode bench a ray is traced with the rod in it.
  const d = configFor("nd-yag", "diode");
  const yag = E.media.get("nd-yag");
  const ray = B.beamPath(deepFreeze({ config: d, starts: [0.3e-3], roundTrips: 2, points: 4 })).rays[0];
  const expected = E.optics.traceRay({
    L: d.L, l_g: d.l_g, n: yag.n, c1: 0, c2: 1 / d.Rc2, lens: thermalLens(E, d), aperture: d.aperture,
    y: 0.3e-3, theta: 0, roundTrips: 2
  });
  assert.deepEqual(plain(ray), plain(expected));
});

test("beamPath: no mode for mirrors outside the stable region or on its edge; an unstable ray walks out", () => {
  // Ruby's flat pair (the edge) and a convex output mirror (unstable).
  const flat = B.beamPath(deepFreeze({ config: configFor("ruby", "flashlamp"), starts: [2e-3], roundTrips: 4, points: 8 }));
  assert.equal(flat.mode, null);
  assert.equal(flat.rays[0].escaped, null, "a ray along the axis between flat mirrors stays");
  const convex = configFor("ruby", "flashlamp", { mirror2: "convex", Rc2: 5 });
  const out = B.beamPath(deepFreeze({ config: convex, starts: [2e-3], roundTrips: 10, points: 8 }));
  assert.equal(out.mode, null);
  assert.notEqual(out.rays[0].escaped, null, "it walks out");
  assert.ok(out.rays[0].escaped.roundTrip <= 3, "M = 1.8: out within 3 round trips");
});

test("beamPath: its inputs are checked, and every error names it", () => {
  const c = configFor("he-ne", "discharge");
  const cases = [
    [{ config: c, starts: [1e-3], roundTrips: 2, points: 4 }, /y/],                 // past the 0.75 mm aperture
    [{ config: c, starts: "0", roundTrips: 2, points: 4 }, /starts/],
    [{ config: c, starts: [0], roundTrips: 0, points: 4 }, /roundTrips/],
    [{ config: c, starts: [0], roundTrips: 2, points: 0 }, /points/],
    [{ config: c, starts: [0], roundTrips: 2, points: 2.5 }, /points/],
    // At most 100 round trips and 1000 points: the page's drawing, not a
    // run of its own; the edges themselves are allowed (below).
    [{ config: c, starts: [0], roundTrips: 101, points: 4 }, /roundTrips must be at most 100/],
    [{ config: c, starts: [0], roundTrips: 2, points: 1001 }, /points must be at most 1000/],
    [{ config: c, starts: [0], roundTrips: 2, points: 4, extra: 1 }, /extra/],
    [{ config: Object.assign({}, c, { Rc2: -1 }), starts: [0], roundTrips: 2, points: 4 }, /Rc2/]
  ];
  for (const [params, pattern] of cases) {
    assert.throws(() => B.beamPath(params), (err) => /^LaserEngine\.bench\.beamPath: /.test(err.message) && pattern.test(err.message),
      JSON.stringify(Object.keys(params)));
  }
  const most = B.beamPath({ config: c, starts: [0], roundTrips: 100, points: 1000 });
  assert.equal(most.mode.length, 1001);
});
