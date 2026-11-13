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

const ROOT = path.join(__dirname, "..", "..");
const ENGINE_DIR = path.join(ROOT, "js", "laser", "engine");

// The order the files must load in. A file that uses another one comes after
// it. index.html must load them in this same order — engine-rules.test.js
// checks that as soon as index.html loads any of them.
const ENGINE_FILES = [
  "constants.js",
  "spectrum.js",
  "media.js"
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
  ROOT,
  ENGINE_DIR,
  ENGINE_FILES,
  loadEngine,
  loadEngineWithSandbox,
  plain,
  assertClose
};
