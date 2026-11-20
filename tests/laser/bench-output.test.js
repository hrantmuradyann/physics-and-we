/* ============================================================================
   bench-output.test.js — LaserEngine.bench.outputBeam (docs/laser-plan.md,
   stage 11a scope card): the beam just outside the output mirror, which
   the lenses of stage 11 take.

   Every call gets a deep-frozen config, so a function that changed its
   input would throw.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine, deepFreeze, assertClose, mirrorCurvature } = require("./helpers.js");

const E = loadEngine();
const B = E.bench;
const cm = 1e-2;

function configFor(medium, pump, changes) {
  return deepFreeze(Object.assign(B.configFor({ medium, pump }), changes || {}));
}

test("outputBeam: a Gaussian mode leaves with its radius on the output mirror and that mirror's own curvature", () => {
  const config = configFor("he-ne", "discharge");
  const out = B.outputBeam(config);
  const r = B.derive(config).resonator;
  assert.equal(out.mode, true);
  assert.equal(out.w, r.w2, "the mode's radius on mirror 2");
  assertClose(out.curvature, 1 / (45 * cm), 1e-12, "the wavefront fits the 45 cm mirror");
  assert.equal(out.lam, E.media.get("he-ne").lam);
  assert.equal(out.radius, null);
});

test("outputBeam's q, carried back across the cavity, is the mode at mirror 1: its radius w₁ and the mirror's curvature", () => {
  // Both mirrors curved (the dye laser's 30 cm pair) and one flat (He-Ne,
  // the diode-pumped Nd:YAG): the wavefront fits mirror 1 too, met going
  // towards mirror 2 (so its curvature is −c₁).
  for (const [medium, pump] of [["dye-r6g", "laser"], ["he-ne", "discharge"], ["nd-yag", "diode"]]) {
    const config = configFor(medium, pump);
    const out = B.outputBeam(config);
    const r = B.derive(config).resonator;
    const q = E.lenses.beamQ({ w: out.w, curvature: out.curvature, lam: out.lam, M2: 1 });
    // Back across the cavity: free space of minus its reduced length (D10).
    const back = { A: 1, B: -r.reducedLength, C: 0, D: 1 };
    const atMirror1 = E.lenses.beamOf({ q: E.lenses.propagate({ q: q, matrix: back }), lam: out.lam, M2: 1 });
    assertClose(atMirror1.w, r.w1, 1e-9, medium + ": w₁");
    const c1 = mirrorCurvature(config.mirror1, config.Rc1);
    assertClose(atMirror1.curvature, -c1, 1e-9, medium + ": the wavefront fits mirror 1", 1e-12);
    assertClose(atMirror1.w0, r.w0, 1e-9, medium + ": the waist");
  }
});

test("outputBeam: without a Gaussian mode (two flat mirrors, or an unstable pair) a uniform beam as wide as the aperture", () => {
  const ruby = configFor("ruby", "flashlamp");
  const flat = B.outputBeam(ruby);
  assert.equal(flat.mode, false, "flat-flat: on the stability edge");
  assert.equal(flat.radius, ruby.aperture);
  assert.equal(flat.w, null);
  assert.equal(flat.curvature, null);
  assert.equal(flat.lam, E.media.get("ruby").lam);
  const bent = B.outputBeam(configFor("he-ne", "discharge", { Rc2: 29 * cm }));
  assert.equal(bent.mode, false, "R = 29 cm in a 30 cm tube: unstable");
  assert.equal(bent.radius, configFor("he-ne", "discharge").aperture);
});

test("outputBeam for every bench: the medium's wavelength, a mode exactly when the resonator has one that fits the aperture", () => {
  for (const medium of E.media.list()) {
    for (const pump of B.pumpsFor(medium)) {
      const config = configFor(medium, pump);
      const out = B.outputBeam(config);
      const r = B.derive(config).resonator;
      assert.equal(out.lam, E.media.get(medium).lam, medium);
      assert.equal(out.mode, r.w0 !== null && r.w2 <= config.aperture, medium + " " + pump + ": a mode that fits through the aperture");
      if (out.mode) {
        assert.ok(out.w > 0 && out.w < config.aperture, medium + ": inside the aperture");
        assertClose(out.curvature, mirrorCurvature(config.mirror2, config.Rc2), 1e-12, medium, 1e-15);
      }
    }
  }
});

test("outputBeam refuses a config derive refuses, naming itself", () => {
  assert.throws(() => B.outputBeam(configFor("he-ne", "discharge", { L: 0.1 })), /^Error: LaserEngine\.bench\.outputBeam: /);
  assert.throws(() => B.outputBeam(null), /^Error: LaserEngine\.bench\.outputBeam: /);
});

test("outputBeam: a mode wider than the aperture is cut off by it, so the light leaves as the uniform beam the aperture allows", () => {
  // He-Ne bent to its stability edge (R = 30.01 cm in its 30 cm tube): the
  // mode on the output mirror grows to 1.82 mm against a 0.75 mm bore.
  const config = configFor("he-ne", "discharge", { Rc2: 0.3001 });
  const r = B.derive(config).resonator;
  assert.ok(r.w2 > config.aperture, "the mode is wider than the bore: " + r.w2);
  const out = B.outputBeam(config);
  assert.equal(out.mode, false);
  assert.equal(out.radius, config.aperture);
  assert.equal(out.w, null);
  // Just inside the aperture the Gaussian still leaves.
  let Rc2 = 0.45;
  while (B.derive(configFor("he-ne", "discharge", { Rc2: Rc2 })).resonator.w2 < 0.9 * config.aperture) Rc2 -= 0.005;
  const near = configFor("he-ne", "discharge", { Rc2: Rc2 });
  assert.ok(B.derive(near).resonator.w2 < config.aperture);
  assert.equal(B.outputBeam(near).mode, true, "R = " + Rc2);
});
