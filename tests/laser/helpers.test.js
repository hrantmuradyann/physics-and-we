/* ============================================================================
   helpers.test.js — the test helpers themselves. A helper that passes
   everything would make every other test worthless.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { assertClose, plain, deepFreeze, mirrorCurvature, alphaWithMirrors, loadEngine } = require("./helpers.js");

test("assertClose: within and outside the relative tolerance", () => {
  assertClose(101, 100, 0.01);
  assert.throws(() => assertClose(102, 100, 0.01));
});

test("assertClose: an expected 0 needs an absolute tolerance", () => {
  assertClose(0, 0, 1e-9, "exact zero", 1e-12);
  assertClose(1e-15, 0, 1e-9, "tiny", 1e-12);
  assert.throws(() => assertClose(1e-3, 0, 1e-9, "too big", 1e-12));
});

test("assertClose: NaN and Infinity always fail", () => {
  assert.throws(() => assertClose(NaN, 1, 1), /finite number/);
  assert.throws(() => assertClose(Infinity, 1, 1), /finite number/);
});

test("plain: keeps NaN apart from null", () => {
  const copy = plain({ a: NaN, b: null, c: [1, Infinity] });
  assert.ok(Number.isNaN(copy.a));
  assert.equal(copy.b, null);
  assert.deepEqual(copy.c, [1, Infinity]);
});

test("deepFreeze: freezes nested objects and arrays, and returns the value", () => {
  const value = { a: { b: [1, { c: 2 }] } };
  assert.equal(deepFreeze(value), value);
  assert.ok(Object.isFrozen(value.a));
  assert.ok(Object.isFrozen(value.a.b));
  assert.ok(Object.isFrozen(value.a.b[1]));
  // This file is strict mode, like the engine: writing to a frozen object throws.
  assert.throws(() => { value.a.b[1].c = 3; }, TypeError);
  assert.throws(() => { value.a.b.push(4); }, TypeError);
});

test("deepFreeze: leaves plain numbers and null alone", () => {
  assert.equal(deepFreeze(5), 5);
  assert.equal(deepFreeze(null), null);
});

test("deepFreeze: goes inside objects that are already frozen at the top level", () => {
  const inner = Object.freeze({ list: [1, 2] });   // Object.freeze is shallow
  deepFreeze({ config: inner });
  assert.ok(Object.isFrozen(inner.list));
  assert.throws(() => { inner.list.push(3); }, TypeError);
});

test("deepFreeze: refuses typed arrays with a clear message", () => {
  assert.throws(() => deepFreeze({ y: new Float64Array(3) }), /Float64Array.*plain arrays/);
});

test("deepFreeze: an object that refers back to itself does not loop forever", () => {
  const value = { name: "loop" };
  value.self = value;
  deepFreeze(value);
  assert.ok(Object.isFrozen(value));
});

test("LASER_TEST_ROOT without the mutation checker's marker stops the tests", () => {
  // A child Node process loads helpers.js with only LASER_TEST_ROOT set, as
  // if it had been left over in a terminal.
  const { spawnSync } = require("node:child_process");
  const env = Object.assign({}, process.env, { LASER_TEST_ROOT: "/some/old/copy" });
  delete env.LASER_MUTATION_CHECK;
  delete env.NODE_TEST_CONTEXT;
  const run = spawnSync(process.execPath, ["-e", "require(" + JSON.stringify(require.resolve("./helpers.js")) + ")"],
    { env: env, encoding: "utf8" });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /LASER_TEST_ROOT is set.*only for tests\/laser\/mutation-check\.js/);
});

test("mirrorCurvature: concave 1/R, convex −1/R, flat 0; anything else refused", () => {
  assert.equal(mirrorCurvature("concave", 2), 0.5);
  assert.equal(mirrorCurvature("convex", 4), -0.25);
  assert.equal(mirrorCurvature("flat", 3), 0);
  assert.throws(() => mirrorCurvature("round", 1), /unknown shape round/);
});

test("alphaWithMirrors: α_i plus the mirrors' γ_m over the rod; just α_i when the mirrors lose nothing", () => {
  const E = loadEngine();
  const ruby = E.bench.configFor({ medium: "ruby", pump: "flashlamp" });
  // Two flat mirrors, a = 5 mm: Vainshtein's 4.09×10⁻⁴ per pass, over a 10 cm rod.
  assertClose(alphaWithMirrors(E, ruby), ruby.alpha_i + 4.09e-4 / 0.1, 0.005, "ruby");
  // A 2 cm aperture on the diode bench: e^(−3800) = 0, nothing lost.
  const wide = Object.assign(E.bench.configFor({ medium: "nd-yag", pump: "diode" }), { aperture: 0.02 });
  assert.equal(alphaWithMirrors(E, wide), wide.alpha_i);
});
