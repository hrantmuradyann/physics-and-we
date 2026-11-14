/* ============================================================================
   helpers.js — shared by every laser-engine test.

   The engine files in js/laser/engine/ are ordinary browser scripts (no
   modules, no build step). To test them in Node we run the very same files
   inside an empty sandbox with Node's built-in "vm" module, and read back the
   LaserEngine object they create. No npm packages are needed.

   Run every test from the top folder of the project:   node --test
   ========================================================================== */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const REAL_ROOT = path.join(__dirname, "..", "..");

// Normally the tests read the real project. tests/laser/mutation-check.js
// points them at a copy with one deliberate mistake in it, to prove the tests
// notice that mistake: it sets LASER_TEST_ROOT to the copy and
// LASER_MUTATION_CHECK=1. LASER_TEST_ROOT on its own — for example left over
// in a terminal — would quietly test an old copy instead of the real files,
// so it stops the tests with an error instead.
function chooseRoot() {
  const override = process.env.LASER_TEST_ROOT;
  if (!override) return REAL_ROOT;
  if (process.env.LASER_MUTATION_CHECK !== "1") {
    throw new Error("LASER_TEST_ROOT is set to " + override + ". It is only for " +
      "tests/laser/mutation-check.js; unset it (unset LASER_TEST_ROOT) to test the real files.");
  }
  return override;
}

const ROOT = chooseRoot();
const ENGINE_DIR = path.join(ROOT, "js", "laser", "engine");

// The order the files must load in. A file that uses another one comes after
// it. index.html must load them in this same order — engine-rules.test.js
// checks that as soon as index.html loads any of them.
const ENGINE_FILES = [
  "check.js",
  "constants.js",
  "spectrum.js",
  "media.js",
  "cavity.js"
];

// Loads the engine into a fresh, empty sandbox and returns
// { engine: the LaserEngine object, sandbox: the sandbox's global object }.
function loadEngineWithSandbox() {
  const sandbox = {};
  vm.createContext(sandbox);
  for (const file of ENGINE_FILES) {
    const fullPath = path.join(ENGINE_DIR, file);
    const code = fs.readFileSync(fullPath, "utf8");
    vm.runInContext(code, sandbox, { filename: fullPath });
  }
  return { engine: sandbox.LaserEngine, sandbox: sandbox };
}

// Most tests only need the engine itself.
function loadEngine() {
  return loadEngineWithSandbox().engine;
}

// Arrays and objects made inside the sandbox have the sandbox's own Array and
// Object, so assert.deepEqual calls them different from the same values typed
// in a test. structuredClone copies them into ordinary Node values. Unlike a
// copy through JSON, it keeps NaN, Infinity and undefined as they are, so a
// broken number cannot hide as null.
function plain(value) {
  return structuredClone(value);
}

// Freezes an object and everything inside it, and returns it. Engine
// functions must never change their inputs; a test that passes them a
// deep-frozen input makes any such change throw an error (engine files run
// in strict mode). It goes inside objects that are already frozen at the top,
// because Object.freeze alone only freezes the top level.
// Typed arrays (Float64Array, ...) cannot be frozen at all, so they are
// refused: engine inputs and outputs must be plain arrays.
function deepFreeze(value, seen) {
  if (value === null || typeof value !== "object") return value;
  if (ArrayBuffer.isView(value)) {
    throw new TypeError("deepFreeze: a typed array (" + value.constructor.name + ") cannot be " +
      "frozen. Engine inputs and outputs must be plain arrays (CLAUDE.md, engine rules).");
  }
  const visited = seen || new Set();
  if (visited.has(value)) return value;     // already done (or a loop back to it)
  visited.add(value);
  Object.freeze(value);
  for (const key of Object.keys(value)) deepFreeze(value[key], visited);
  return value;
}

// Passes when actual is close to expected:
//   |actual − expected| ≤ relTol·|expected|   (relTol 0.01 = 1 %)
//   or ≤ absTol, if given — needed when expected is exactly 0, because no
//   relative tolerance can work there.
// Fails on NaN or Infinity, whatever the tolerances.
function assertClose(actual, expected, relTol, message, absTol) {
  const label = message || "value";
  assert.ok(typeof actual === "number" && Number.isFinite(actual),
    label + ": expected a finite number, got " + actual);
  const allowed = Math.max(relTol * Math.abs(expected), absTol || 0);
  const error = Math.abs(actual - expected);
  assert.ok(
    error <= allowed,
    label + ": expected " + expected + " ± " + allowed + ", got " + actual +
      " (off by " + error + ")"
  );
}

module.exports = {
  REAL_ROOT,
  ROOT,
  ENGINE_DIR,
  ENGINE_FILES,
  loadEngine,
  loadEngineWithSandbox,
  plain,
  deepFreeze,
  assertClose
};
