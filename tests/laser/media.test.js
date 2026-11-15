/* ============================================================================
   media.test.js — js/laser/engine/media.js against the table in
   docs/laser-physics.md §5.1.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine, plain, assertClose } = require("./helpers.js");

const { constants: C, media: M } = loadEngine();

const SCHEMES = ["three-level", "four-level", "semiconductor", "two-level"];
const PUMPS = ["flashlamp", "diode", "lamp", "discharge", "current", "laser"];

test("the table has the ten media of §5.1, in order, and the two-level atom last", () => {
  assert.deepEqual(plain(M.list()), [
    "ruby", "nd-glass", "nd-yag", "caf2-dy", "he-ne",
    "ar-ion", "co2", "diode", "dye-r6g", "ti-sapphire", "two-level"
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
    // The group index, where given, is above the phase index (normal
    // dispersion) and below 5 for any real laser material.
    if (m.ng !== null) assert.ok(m.ng > m.n && m.ng < 5, id + ": ng " + m.ng);
    // Only the two-level atom never lases (§2.1).
    assert.equal(m.cw || m.pulsed, id !== "two-level", id + ": cw " + m.cw + ", pulsed " + m.pulsed);
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
    // The density of active ions, which the three- and two-level equations
    // need (and only they): 10¹⁷–10²² cm⁻³ = 10²³–10²⁸ m⁻³ for any solid
    // or gas; a cm⁻³ value left unconverted would be 10⁶ times too small.
    const needsIons = m.scheme === "three-level" || m.scheme === "two-level";
    if (needsIons) assert.ok(m.N_t > 1e23 && m.N_t < 1e28, id + ": N_t " + m.N_t);
    else assert.equal(m.N_t, null, id + ": N_t");
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

// The whole §5.1 table, typed again here from docs/laser-physics.md in the
// table's own units, converted with plain powers of ten (not the engine's
// unit constants). Any value or unit that was copied wrongly into media.js —
// for ANY medium — makes this test fail.
//   lam, lamMin, lamMax, otherLines in nm · sigma, diffGain in cm² · tau in s
//   dnu in Hz (Nd:glass: from 25 nm at 1.06 µm, the middle of 20–30 nm)
//   ng: the group index, given only for the diode (§3.3: n_g ≈ 4)
//   N_t in cm⁻³, the density of active ions: only where the equations need
//     it, ruby and the two-level atom (§4.1, §5.1)
const NM = 1e-9;
const CM2 = 1e-4;
const PER_CM3 = 1e6;
const TABLE = {
  "ruby":        { scheme: "three-level", lam: 694.3, lamMin: 694.3, lamMax: 694.3, otherLines: [],
                   sigma: 2.5e-20, diffGain: null, tau: 3e-3, dnu: 330e9, broadening: "homogeneous",
                   n: 1.76, ng: null, N_t: 1.6e19, pumps: ["flashlamp"], cw: false, pulsed: true },
  "nd-glass":    { scheme: "four-level", lam: 1060, lamMin: 1060, lamMax: 1060, otherLines: [],
                   sigma: 3e-20, diffGain: null, tau: 0.3e-3, dnu: 2.99792458e8 * 25e-9 / (1.06e-6 * 1.06e-6),
                   broadening: "inhomogeneous", n: 1.5, ng: null, N_t: null, pumps: ["flashlamp"], cw: false, pulsed: true },
  "nd-yag":      { scheme: "four-level", lam: 1064, lamMin: 1064, lamMax: 1064, otherLines: [],
                   sigma: 2.8e-19, diffGain: null, tau: 230e-6, dnu: 120e9, broadening: "homogeneous",
                   n: 1.82, ng: null, N_t: null, pumps: ["flashlamp", "diode"], cw: true, pulsed: true },
  "caf2-dy":     { scheme: "four-level", lam: 2360, lamMin: 2360, lamMax: 2360, otherLines: [],
                   sigma: null, diffGain: null, tau: 20e-3, dnu: null, broadening: null,
                   n: 1.43, ng: null, N_t: null, pumps: ["lamp"], cw: true, pulsed: true },
  "he-ne":       { scheme: "four-level", lam: 632.8, lamMin: 632.8, lamMax: 632.8, otherLines: [1150, 3390],
                   sigma: 3e-13, diffGain: null, tau: 0.1e-6, dnu: 1.5e9, broadening: "inhomogeneous",
                   n: 1, ng: null, N_t: null, pumps: ["discharge"], cw: true, pulsed: false },
  "ar-ion":      { scheme: "four-level", lam: 514.5, lamMin: 514.5, lamMax: 514.5, otherLines: [488],
                   sigma: 2.5e-12, diffGain: null, tau: 10e-9, dnu: 3.5e9, broadening: "inhomogeneous",
                   n: 1, ng: null, N_t: null, pumps: ["discharge"], cw: true, pulsed: false },
  "co2":         { scheme: "four-level", lam: 10600, lamMin: 10600, lamMax: 10600, otherLines: [9600],
                   sigma: 3e-18, diffGain: null, tau: 0.28e-3, dnu: 50e6, broadening: "inhomogeneous",
                   n: 1, ng: null, N_t: null, pumps: ["discharge"], cw: true, pulsed: true },
  "diode":       { scheme: "semiconductor", lam: 850, lamMin: 780, lamMax: 870, otherLines: [],
                   sigma: null, diffGain: 3e-16, tau: 3e-9, dnu: 10e12, broadening: "homogeneous",
                   n: 3.6, ng: 4, N_t: null, pumps: ["current"], cw: true, pulsed: false },
  "dye-r6g":     { scheme: "four-level", lam: 600, lamMin: 560, lamMax: 640, otherLines: [],
                   sigma: 2e-16, diffGain: null, tau: 5e-9, dnu: 30e12, broadening: "homogeneous",
                   n: 1.36, ng: null, N_t: null, pumps: ["laser"], cw: true, pulsed: true },
  "ti-sapphire": { scheme: "four-level", lam: 800, lamMin: 660, lamMax: 1100, otherLines: [],
                   sigma: 3.9e-19, diffGain: null, tau: 3.2e-6, dnu: 100e12, broadening: "homogeneous",
                   n: 1.76, ng: null, N_t: null, pumps: ["laser"], cw: true, pulsed: true },
  // Ruby with its pump bands taken away (§5.1, §2.1): pumped at its own line.
  "two-level":   { scheme: "two-level", lam: 694.3, lamMin: 694.3, lamMax: 694.3, otherLines: [],
                   sigma: 2.5e-20, diffGain: null, tau: 3e-3, dnu: 330e9, broadening: "homogeneous",
                   n: 1.76, ng: null, N_t: 1.6e19, pumps: ["laser", "flashlamp"], cw: false, pulsed: false }
};

// A number, or null meaning "not given", compared with a tolerance.
function sameNumber(actual, expected, label) {
  if (expected === null) {
    assert.equal(actual, null, label + " should be null (not given in the table)");
  } else {
    assertClose(actual, expected, 1e-12, label);
  }
}

test("every value of every medium matches the §5.1 table", () => {
  assert.deepEqual(plain(M.list()).sort(), Object.keys(TABLE).sort());
  for (const id of Object.keys(TABLE)) {
    const want = TABLE[id];
    const m = M.get(id);
    assert.equal(m.scheme, want.scheme, id + " scheme");
    sameNumber(m.lam, want.lam * NM, id + " lam");
    sameNumber(m.lamMin, want.lamMin * NM, id + " lamMin");
    sameNumber(m.lamMax, want.lamMax * NM, id + " lamMax");
    assert.equal(m.otherLines.length, want.otherLines.length, id + " number of otherLines");
    want.otherLines.forEach((line, i) => sameNumber(m.otherLines[i], line * NM, id + " otherLines[" + i + "]"));
    sameNumber(m.sigma, want.sigma === null ? null : want.sigma * CM2, id + " sigma");
    sameNumber(m.diffGain, want.diffGain === null ? null : want.diffGain * CM2, id + " diffGain");
    sameNumber(m.tau, want.tau, id + " tau");
    sameNumber(m.dnu, want.dnu, id + " dnu");
    assert.equal(m.broadening, want.broadening, id + " broadening");
    sameNumber(m.n, want.n, id + " n");
    sameNumber(m.ng, want.ng, id + " ng");
    sameNumber(m.N_t, want.N_t === null ? null : want.N_t * PER_CM3, id + " N_t");
    assert.deepEqual(plain(m.pumps), want.pumps, id + " pumps");
    assert.equal(m.cw, want.cw, id + " cw");
    assert.equal(m.pulsed, want.pulsed, id + " pulsed");
  }
});

test("Nd:glass linewidth: 25 nm at 1.06 µm ≈ 6.7 THz", () => {
  assertClose(M.get("nd-glass").dnu, 6.67e12, 0.005, "Δν");
});

test("derived: nGroup is the group index where the table gives one, otherwise n (D5)", () => {
  assertClose(M.get("diode").nGroup, 4, 1e-12, "diode: n_g, not n = 3.6");
  for (const id of M.list()) {
    const m = M.get(id);
    if (id !== "diode") assertClose(m.nGroup, m.n, 1e-12, id);
  }
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

test("derived: I_sat = hν/(2στ) for the two-level atom too: its lower level is the ground state, as in ruby", () => {
  const atom = M.get("two-level");
  assertClose(atom.I_sat, atom.photonEnergy / (2 * atom.sigma * atom.tau), 1e-12, "formula");
  assertClose(atom.I_sat, M.get("ruby").I_sat, 1e-12, "ruby's");
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
