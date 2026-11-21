/* ============================================================================
   harmonic.test.js — js/laser/engine/harmonic.js against docs/laser-physics.md
   §10.2 (docs/laser-plan.md, stage 13b scope card): KDP's indices, the
   phase-matching angle, and the share of the light a doubling crystal
   turns green.

   Every call gets a deep-frozen input, so a function that changed its
   input would throw.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine, deepFreeze, assertClose } = require("./helpers.js");

const E = loadEngine();
const H = E.harmonic;
const DEG = Math.PI / 180;

const index = (lam, ray) => H.kdpIndex(deepFreeze({ lam, ray }));
const double = (params) => H.doubling(deepFreeze(params));

// §10.2's η₀ written out here: 8π²·d_eff²·L²·I/(n³·ε₀·c·λ²), d_eff = d₃₆·sin θ_m.
function eta0(power, area, length, lam) {
  const theta = H.phaseMatchAngle(lam);
  const d = 0.39e-12 * Math.sin(theta);
  const n = index(lam, "o");
  return 8 * Math.PI * Math.PI * d * d * length * length * (power / area) /
    (n * n * n * 8.8541878128e-12 * 299792458 * lam * lam);
}

test("KDP's indices (§10.2, Zernike's fit): n_o, n_e at 1064 nm and 532 nm", () => {
  // The doc's 1.4938, 1.4599, 1.5124, 1.4705; the fit's own values to 6 digits.
  assertClose(index(1064e-9, "o"), 1.49378, 1e-5, "n_o(1064)");
  assertClose(index(1064e-9, "e"), 1.45987, 1e-5, "n_e(1064)");
  assertClose(index(532e-9, "o"), 1.51242, 1e-5, "n_o(532)");
  assertClose(index(532e-9, "e"), 1.47047, 1e-5, "n_e(532)");
  // Normal dispersion: bluer light, higher index.
  assert.ok(index(400e-9, "o") > index(800e-9, "o"));
});

test("the phase-matching angle for 1064 → 532 nm is 41.21°, EKSMA's cut of 41.2° (the book: 41°35′)", () => {
  const theta = H.phaseMatchAngle(1064e-9);
  assertClose(theta / DEG, 41.2, 0.05 / 41.2, "θ_m");
  // At θ_m the harmonic's extraordinary index equals the light's ordinary one.
  const no2 = index(532e-9, "o");
  const ne2 = index(532e-9, "e");
  const neTheta = 1 / Math.sqrt(Math.cos(theta) ** 2 / no2 ** 2 + Math.sin(theta) ** 2 / ne2 ** 2);
  assertClose(neTheta, index(1064e-9, "o"), 1e-12, "n_e(2ω, θ_m) = n_o(ω)");
  // Ruby (694.3 nm → 347 nm) matches too, at a larger angle.
  assert.ok(H.phaseMatchAngle(694.3e-9) > theta);
  // Type I cannot match light this blue in KDP.
  assert.equal(H.phaseMatchAngle(0.45e-6), null);
});

test("η = tanh²√η₀: the flashlamp Nd:YAG's beam at 10 MW gives 7.0 %, the diode bench's 2 W gives 4.2×10⁻⁷", () => {
  const big = double({ power: 1e7, area: Math.PI * 9e-6, length: 0.02, lam: 1064e-9 });
  const e0 = eta0(1e7, Math.PI * 9e-6, 0.02, 1064e-9);
  assertClose(e0, 0.0736, 0.001, "η₀");
  assertClose(big.share, Math.tanh(Math.sqrt(e0)) ** 2, 1e-12, "tanh²");
  assertClose(big.share, 0.0701, 0.001, "η");
  assertClose(big.power, big.share * 1e7, 1e-12, "the green power");
  assertClose(big.theta, H.phaseMatchAngle(1064e-9), 1e-12, "θ_m");
  const small = double({ power: 2, area: 1e-6, length: 0.02, lam: 1064e-9 });
  assertClose(small.share, 4.163e-7, 0.001, "η");
});

test("weak light: η = η₀, quadratic in the length and linear in the intensity; strong light never passes 1", () => {
  const at = (power, length) => double({ power, area: 1e-6, length, lam: 1064e-9 }).share;
  assertClose(at(1, 0.02), eta0(1, 1e-6, 0.02, 1064e-9), 1e-6, "η₀");
  assertClose(at(2, 0.02) / at(1, 0.02), 2, 1e-6, "linear in I");
  assertClose(at(1, 0.04) / at(1, 0.02), 4, 1e-6, "quadratic in L");
  let last = 0;
  for (const power of [1e3, 1e6, 1e7, 1e8]) {
    const share = at(power, 0.02);
    assert.ok(share > last && share < 1, "rises towards 1: " + share);
    last = share;
  }
  assert.ok(last > 0.999, "1e8 W on 1 mm²: " + last);
  // Past that it is 1 to the last digit, never more.
  assert.ok(at(1e14, 0.02) <= 1);
  assert.equal(at(0, 0.02), 0, "no light, no green");
  assert.equal(double({ power: 0, area: 1e-6, length: 0.02, lam: 1064e-9 }).power, 0);
});

test("the page's crystal: KDP, d₃₆ = 0.39 pm/V, 2 cm long; frozen", () => {
  assertClose(H.KDP.d36, 0.39e-12, 1e-12, "d₃₆");
  assertClose(H.KDP.length, 0.02, 1e-12, "L");
  assert.ok(Object.isFrozen(H.KDP));
  assert.ok(Object.isFrozen(H));
});

test("inputs are checked and every error names the function", () => {
  assert.throws(() => index(1064e-9, "x"), /^Error: LaserEngine\.harmonic\.kdpIndex: ray must be "o" or "e"/);
  assert.throws(() => index(2e-6, "o"), /^Error: LaserEngine\.harmonic\.kdpIndex: lam must be/);
  assert.throws(() => index(0.1e-6, "o"), /lam must be/);
  assert.throws(() => H.kdpIndex(deepFreeze({ lam: 1e-6, ray: "o", n: 1 })), /n is not one of its inputs/);
  assert.throws(() => H.phaseMatchAngle(0.3e-6), /^Error: LaserEngine\.harmonic\.phaseMatchAngle: .*where KDP absorbs/);
  assert.throws(() => H.phaseMatchAngle(NaN), /phaseMatchAngle: lam must be/);
  const ok = { power: 1, area: 1e-6, length: 0.02, lam: 1064e-9 };
  assert.doesNotThrow(() => double(ok));
  for (const [change, pattern] of [
    [{ power: -1 }, /power must be/], [{ area: 0 }, /area must be a positive/], [{ length: 0 }, /length must be a positive/],
    [{ lam: 0.45e-6 }, /cannot phase-match/], [{ lam: 0.3e-6 }, /where KDP absorbs/], [{ lam: 3e-6 }, /lam must be/]
  ]) {
    assert.throws(() => double(Object.assign({}, ok, change)), (err) => /^LaserEngine\.harmonic\.doubling: /.test(err.message) && pattern.test(err.message),
      JSON.stringify(change));
  }
});
