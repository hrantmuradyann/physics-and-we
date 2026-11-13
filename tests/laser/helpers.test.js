/* ============================================================================
   helpers.test.js — the test helpers themselves. A helper that passes
   everything would make every other test worthless.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { assertClose, plain } = require("./helpers.js");

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
