/* ============================================================================
   spectrum.test.js — js/laser/engine/spectrum.js against
   docs/laser-physics.md §1 and the first row of §12.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine, assertClose } = require("./helpers.js");

const { constants: C, spectrum: S } = loadEngine();

test("§12: stimulated beats spontaneous only above 69 µm at 300 K", () => {
  assertClose(S.crossoverLam(300) / C.um, 69, 0.01, "λ at 300 K, µm");
});

test("§12: ...and only above 3.8×10⁴ K for green light (550 nm)", () => {
  assertClose(S.crossoverT(550 * C.nm), 3.8e4, 0.01, "T at 550 nm, K");
});

test("the ratio is exactly 1 at the crossover", () => {
  assertClose(S.stimulatedToSpontaneous(S.crossoverLam(300), 300), 1, 1e-9, "at 300 K");
  assertClose(S.stimulatedToSpontaneous(550 * C.nm, S.crossoverT(550 * C.nm)), 1, 1e-9, "at 550 nm");
});

test("visible light from a 300 K source is almost all spontaneous", () => {
  const ratio = S.stimulatedToSpontaneous(550 * C.nm, 300);
  assert.ok(ratio > 0 && ratio < 1e-30, "ratio was " + ratio);
});

test("far infrared at 300 K is mostly stimulated", () => {
  assert.ok(S.stimulatedToSpontaneous(1e-3, 300) > 1);   // 1 mm
});

test("§1: Boltzmann N₂/N₁ for ruby at 300 K is about 10⁻³⁰", () => {
  const ratio = S.boltzmannRatio(694 * C.nm, 300);
  assert.ok(ratio > 1e-31 && ratio < 1e-29, "ratio was " + ratio);
});

test("Boltzmann ratio uses the degeneracies g₂/g₁", () => {
  const plain = S.boltzmannRatio(694 * C.nm, 300);
  assertClose(S.boltzmannRatio(694 * C.nm, 300, 2, 4), 2 * plain, 1e-12, "g₂/g₁ = 2");
});

test("long wavelengths: the ratio stays accurate when hν ≪ kT", () => {
  // For small x = hν/kT, 1/(eˣ − 1) = 1/x − 1/2 + x/12 − ...  Plain
  // exp(x) − 1 loses about 10 digits here; Math.expm1 does not.
  const x = 1e-6;
  const T = 300;
  const lam = C.h * C.c / (x * C.k * T);
  assertClose(S.stimulatedToSpontaneous(lam, T), 1 / x - 0.5 + x / 12, 1e-12, "series");
});

test("a temperature or wavelength of zero or less is refused", () => {
  assert.throws(() => S.stimulatedToSpontaneous(500 * C.nm, -300), /T must be a positive number/);
  assert.throws(() => S.stimulatedToSpontaneous(500 * C.nm, 0), /T must be a positive number/);
  assert.throws(() => S.stimulatedToSpontaneous(0, 300), /lam must be a positive number/);
  assert.throws(() => S.crossoverLam(0), /T must be a positive number/);
  assert.throws(() => S.crossoverT(-1), /lam must be a positive number/);
  assert.throws(() => S.boltzmannRatio(694 * C.nm, NaN), /T must be a positive number/);
});

test("the spectrum object cannot be changed by accident", () => {
  assert.ok(Object.isFrozen(S));
});
