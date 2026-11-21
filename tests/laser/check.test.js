/* ============================================================================
   check.test.js — js/laser/engine/check.js, the input checks every engine
   file uses. If one of these lets a bad value through, every engine
   function that relies on it does too.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine } = require("./helpers.js");

const { check } = loadEngine();
const AT = "LaserEngine.test.f";

// Every way a value can fail to be a usable number.
const NOT_NUMBERS = [NaN, Infinity, -Infinity, undefined, null, "1", true, [1], {}];

test("each check returns the value it accepted", () => {
  assert.equal(check.finite(AT, "x", -2.5), -2.5);
  assert.equal(check.positive(AT, "x", 3), 3);
  assert.equal(check.atLeast(AT, "x", 1, 1), 1);
  assert.equal(check.between(AT, "x", 0, 0, 1), 0);
  assert.equal(check.between(AT, "x", 1, 0, 1), 1);
  assert.equal(check.reflectivity(AT, "x", 1), 1);
  assert.equal(check.broadening(AT, "homogeneous"), "homogeneous");
  const params = { a: 1 };
  assert.equal(check.params(AT, params, ["a", "b"]), params);
});

test("every number check refuses values that are not finite numbers", () => {
  for (const value of NOT_NUMBERS) {
    const label = String(value);
    assert.throws(() => check.finite(AT, "x", value), /x must be a finite number/, label);
    assert.throws(() => check.positive(AT, "x", value), /x must be a positive finite number/, label);
    assert.throws(() => check.atLeast(AT, "x", value, 0), /x must be a finite number of at least 0/, label);
    assert.throws(() => check.between(AT, "x", value, 0, 1), /x must be a finite number from 0 to 1/, label);
    assert.throws(() => check.reflectivity(AT, "x", value), /x must be a finite number above 0 and at most 1/, label);
    assert.throws(() => check.integerAtLeast(AT, "x", value, 1), /x must be a whole number of at least 1/, label);
  }
});

test("func, finiteArray and integerAtLeast return the value they accepted", () => {
  const fn = () => 0;
  assert.equal(check.func(AT, "f", fn), fn);
  const state = [1, -2.5, 0];
  assert.equal(check.finiteArray(AT, "state0", state), state);
  assert.equal(check.integerAtLeast(AT, "n", 3, 1), 3);
  assert.equal(check.integerAtLeast(AT, "n", 1, 1), 1);     // the minimum itself is allowed
});

test("func refuses anything that cannot be called", () => {
  for (const value of [undefined, null, 1, "f", {}, [() => 0]]) {
    assert.throws(() => check.func(AT, "f", value), /f must be a function/, String(value));
  }
});

test("finiteArray refuses non-arrays, typed arrays, an empty array and any entry that is not a finite number", () => {
  for (const value of [undefined, null, 1, "12", { length: 1, 0: 1 }, new Float64Array([1])]) {
    assert.throws(() => check.finiteArray(AT, "state0", value),
      /state0 must be an array of finite numbers/, String(value));
  }
  assert.throws(() => check.finiteArray(AT, "state0", []), /state0 must not be an empty array/);
  // eslint-disable-next-line no-sparse-arrays
  for (const value of [[1, NaN], [1, "2"], [1, null], [1, Infinity], [1, , 3]]) {
    assert.throws(() => check.finiteArray(AT, "state0", value),
      /state0\[1\] must be a finite number, got/, String(value));
  }
});

test("integerAtLeast refuses fractions and values below the minimum", () => {
  for (const value of [1.5, 0, -1, 0.999]) {
    assert.throws(() => check.integerAtLeast(AT, "n", value, 1),
      /n must be a whole number of at least 1, got/, String(value));
  }
});

test("the limits: positive refuses 0, atLeast and between include their ends, reflectivity is (0, 1]", () => {
  assert.throws(() => check.positive(AT, "x", 0), /positive/);
  assert.throws(() => check.atLeast(AT, "x", 0.999, 1), /at least 1, got 0.999/);
  assert.throws(() => check.between(AT, "x", -0.001, 0, 1), /from 0 to 1/);
  assert.throws(() => check.between(AT, "x", 1.001, 0, 1), /from 0 to 1/);
  assert.throws(() => check.reflectivity(AT, "x", 0), /above 0 and at most 1/);
  assert.throws(() => check.reflectivity(AT, "x", 1.0001), /above 0 and at most 1/);
});

test("named values must come as one object, not numbers, arrays or nothing", () => {
  for (const value of [undefined, null, 0.99, "refl1", [0.99, 0.98]]) {
    assert.throws(() => check.params(AT, value, ["refl1", "refl2"]),
      /needs one object of named values, like \{ refl1, refl2 \}/, String(value));
  }
});

test("a name the function does not use is refused: a typo, or a value it would ignore", () => {
  assert.throws(() => check.params(AT, { refl1: 1, alpha: 0.5 }, ["refl1", "alpha_i"]),
    { message: "LaserEngine.test.f: alpha is not one of its inputs (refl1, alpha_i)." });
  // even when the value is 0: each call passes exactly the inputs it uses
  assert.throws(() => check.params(AT, { refl1: 1, L_i: 0 }, ["refl1"]), /L_i is not one of its inputs/);
});

test("a value that cannot be turned into text still gives the proper message", () => {
  assert.throws(() => check.positive(AT, "x", Symbol("s")), /x must be a positive finite number, got Symbol\(s\)/);
  assert.throws(() => check.positive(AT, "x", Object.create(null)),
    /x must be a positive finite number, got a value that cannot be shown as text/);
  // such an object is still a valid object of named values
  const bare = Object.create(null);
  bare.a = 1;
  assert.equal(check.params(AT, bare, ["a"]), bare);
});

test("describe: strings in quotes, arrays by their length, anything else as text", () => {
  assert.equal(check.describe("1"), '"1"');
  assert.equal(check.describe([1, "2", 3]), "an array of length 3");
  assert.equal(check.describe(undefined), "undefined");
  assert.equal(check.describe(null), "null");
  assert.equal(check.describe(NaN), "NaN");
  assert.equal(check.describe(Object.create(null)), "a value that cannot be shown as text");
  // and the checks use it
  assert.throws(() => check.positive(AT, "x", "1"), /x must be a positive finite number, got "1"\./);
  assert.throws(() => check.finiteArray(AT, "state0", "12"), /got "12"\./);
});

test("broadening must be one of the two words media.js uses", () => {
  assert.throws(() => check.broadening(AT, "Doppler"), /broadening must be "homogeneous" or "inhomogeneous"/);
  assert.throws(() => check.broadening(AT, null), /broadening must be/);
});

test("every message starts with the function that was called", () => {
  assert.throws(() => check.positive(AT, "l_g", -1),
    { message: "LaserEngine.test.f: l_g must be a positive finite number, got -1." });
  assert.throws(() => check.fail(AT, "something else is wrong."),
    { message: "LaserEngine.test.f: something else is wrong." });
});

test("the check object cannot be changed by accident", () => {
  assert.ok(Object.isFrozen(check));
});
