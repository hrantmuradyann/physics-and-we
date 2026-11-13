/* ============================================================================
   media.test.js — js/laser/engine/media.js against the table in
   docs/laser-physics.md §5.1.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine, plain, assertClose } = require("./helpers.js");

const { constants: C, media: M } = loadEngine();

const SCHEMES = ["three-level", "four-level", "semiconductor"];
const PUMPS = ["flashlamp", "diode", "lamp", "discharge", "current", "laser"];

test("the table has the ten media of §5.1, in order", () => {
  assert.deepEqual(plain(M.list()), [
    "ruby", "nd-glass", "nd-yag", "caf2-dy", "he-ne",
    "ar-ion", "co2", "diode", "dye-r6g", "ti-sapphire"
  ]);
});

test("every medium has sensible numbers in SI units", () => {
  for (const id of M.list()) {
    const m = M.get(id);
    assert.ok(SCHEMES.includes(m.scheme), id + ": scheme " + m.scheme);

    // 300 nm – 20 µm covers every laser in the table. A wavelength outside it
    // almost always means a unit was forgotten (870 instead of 870 * nm).
    const wavelengths = { lam: m.lam, lamMin: m.lamMin, lamMax: m.lamMax };
    m.otherLines.forEach((line, i) => { wavelengths["otherLines[" + i + "]"] = line; });
    for (const [name, value] of Object.entries(wavelengths)) {
      assert.ok(value > 300e-9 && value < 20e-6, id + ": " + name + " " + value);
    }
    assert.ok(m.lamMin <= m.lam && m.lam <= m.lamMax, id + ": lam outside lamMin–lamMax");

    assert.ok(m.tau > 0 && m.tau < 1, id + ": tau " + m.tau);
    assert.ok(m.n >= 1 && m.n < 4, id + ": n " + m.n);
    assert.ok(m.cw || m.pulsed, id + ": neither cw nor pulsed");
    assert.ok(m.pumps.length > 0, id + ": no pump");
    for (const pump of m.pumps) assert.ok(PUMPS.includes(pump), id + ": pump " + pump);

    // Cross sections in the table run from 10⁻²⁴ to 10⁻¹⁵ m². Anything far
    // outside that is a cm² value that was not converted.
    if (m.sigma !== null) {
      assert.ok(m.sigma > 1e-25 && m.sigma < 1e-14, id + ": sigma " + m.sigma);
    }
    // The diode's differential gain is (2–5)×10⁻¹⁶ cm² = (2–5)×10⁻²⁰ m².
    if (m.diffGain !== null) {
      assert.ok(m.diffGain > 1e-21 && m.diffGain < 1e-19, id + ": diffGain " + m.diffGain);
    }
    if (m.dnu !== null) assert.ok(m.dnu > 1e6 && m.dnu < 1e15, id + ": dnu " + m.dnu);
  }
});

test("only the diode uses differential gain instead of a cross section", () => {
  for (const id of M.list()) {
    const m = M.get(id);
    if (id === "diode") {
      assert.equal(m.sigma, null);
      assertClose(m.diffGain, 3e-20, 1e-12, "diode a, m²");
    } else {
      assert.equal(m.diffGain, null, id);
    }
  }
});

test("only CaF₂:Dy has numbers the table leaves blank", () => {
  for (const id of M.list()) {
    const m = M.get(id);
    const blanks = ["dnu", "broadening"].filter((key) => m[key] === null);
    if (m.sigma === null && id !== "diode") blanks.push("sigma");
    if (id === "caf2-dy") {
      assert.deepEqual(blanks.sort(), ["broadening", "dnu", "sigma"]);
    } else {
      assert.deepEqual(blanks, [], id);
    }
  }
});

test("spot checks against the table (and its cm² -> m² conversion)", () => {
  const ruby = M.get("ruby");
  assert.equal(ruby.scheme, "three-level");
  assertClose(ruby.lam, 694.3e-9, 1e-12, "ruby λ");
  assertClose(ruby.sigma, 2.5e-24, 1e-12, "ruby σ, m²");
  assertClose(ruby.tau, 3e-3, 1e-12, "ruby τ");
  assertClose(ruby.dnu, 330e9, 1e-12, "ruby Δν");
  assert.equal(ruby.n, 1.76);

  const yag = M.get("nd-yag");
  assertClose(yag.sigma, 2.8e-23, 1e-12, "Nd:YAG σ, m²");
  assertClose(yag.tau, 230e-6, 1e-12, "Nd:YAG τ");
  assert.deepEqual(plain(yag.pumps), ["flashlamp", "diode"]);

  const heNe = M.get("he-ne");
  assert.equal(heNe.broadening, "inhomogeneous");
  assertClose(heNe.otherLines[1], 3.39e-6, 1e-12, "He-Ne 3.39 µm line");
});

test("Nd:glass linewidth: 25 nm at 1.06 µm ≈ 6.7 THz", () => {
  assertClose(M.get("nd-glass").dnu, 6.67e12, 0.005, "Δν");
});

test("derived: photon energy and frequency", () => {
  const yag = M.get("nd-yag");
  assertClose(yag.nu, C.c / 1064e-9, 1e-12, "ν");
  assertClose(yag.photonEnergy / C.eV, 1.1653, 1e-4, "hν, eV");
});

test("derived: I_sat = hν/(στ) for a four-level medium", () => {
  // Nd:YAG: ≈ 2.9 kW/cm²
  assertClose(M.get("nd-yag").I_sat / 1e4, 2.9e3, 0.01, "Nd:YAG I_sat, W/cm²");
  // CO₂: the measured 22 W/cm² that §5.1 uses to get σ
  assertClose(M.get("co2").I_sat / 1e4, 22, 0.02, "CO₂ I_sat, W/cm²");
  // No cross section, no saturation intensity
  assert.equal(M.get("caf2-dy").I_sat, null);
  assert.equal(M.get("diode").I_sat, null);
});

test("derived: I_sat = hν/(2στ) for ruby, the three-level medium (§2.2)", () => {
  const ruby = M.get("ruby");
  assertClose(ruby.I_sat, ruby.photonEnergy / (2 * ruby.sigma * ruby.tau), 1e-12, "formula");
  // The same factor 2 gives the saturation fluence F_sat = hν/(2σ) ≈ 5.7 J/cm²
  // that §4.4 quotes for ruby amplifiers.
  assertClose(ruby.I_sat * ruby.tau / 1e4, 5.7, 0.01, "ruby F_sat, J/cm²");
});

test("CaF₂:Dy can run Q-switched (§5.4), so it counts as pulsed", () => {
  const dy = M.get("caf2-dy");
  assert.equal(dy.cw, true);
  assert.equal(dy.pulsed, true);
});

test("the media object cannot be changed by accident", () => {
  assert.ok(Object.isFrozen(M));
});

test("get() hands back a copy: changing it does not change the table", () => {
  const first = M.get("ruby");
  first.tau = 999;
  first.pumps.push("diode");
  const second = M.get("ruby");
  assertClose(second.tau, 3e-3, 1e-12, "ruby τ after the copy was changed");
  assert.deepEqual(plain(second.pumps), ["flashlamp"]);
});

test("get() with an unknown name says what went wrong", () => {
  assert.throws(() => M.get("unobtainium"), /no medium called "unobtainium"/);
});
