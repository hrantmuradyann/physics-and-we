/* ============================================================================
   pumps.test.js — js/laser/engine/pumps.js: the flashlamp's pulse (§6.1)
   and the gas discharge's gain against its current (§6.4).
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine, deepFreeze, assertClose } = require("./helpers.js");

const E = loadEngine();
const P = E.pumps;

function call(name, params) {
  return P[name](deepFreeze(Object.assign({}, params)));
}

// The lamp's power at time t after firing (W), through flash(), which
// checks its inputs once and returns an unchecked function of t.
function flashPower(energy, flashTime, t) {
  return call("flash", { energy, flashTime })(t);
}

/* ---------- the flash ---------- */

// Simpson's rule over [a, b] with n (even) intervals.
function simpson(fn, a, b, n) {
  const h = (b - a) / n;
  let sum = fn(a) + fn(b);
  for (let i = 1; i < n; i++) sum += (i % 2 === 1 ? 4 : 2) * fn(a + i * h);
  return sum * h / 3;
}

test("the flash carries exactly its energy: ∫P dt = E (§6.1)", () => {
  for (const [energy, flashTime] of [[1000, 0.3e-3], [10, 0.3e-3], [1, 1e-3]]) {
    const power = call("flash", { energy, flashTime });
    // e^(−60) of the pulse is left past 60 t_p: far below the tolerance.
    const total = simpson(power, 0, 60 * flashTime, 60000);
    assertClose(total, energy, 1e-9, "∫P dt for E = " + energy + " J");
  }
});

test("the flash peaks at t_p with E/(e·t_p), starts at 0 and is 0 before it is fired", () => {
  const energy = 1000;
  const flashTime = 0.3e-3;
  const power = (t) => flashPower(energy, flashTime, t);
  assertClose(power(flashTime), energy / (Math.E * flashTime), 1e-12, "the peak");
  assert.ok(power(0.99 * flashTime) < power(flashTime) && power(1.01 * flashTime) < power(flashTime), "a maximum");
  assert.equal(power(0), 0);
  assert.equal(power(-1e-3), 0);
  // The shape (E/t_p)(t/t_p)e^(−t/t_p) at one more point, by hand.
  assertClose(power(0.5e-3), (energy / flashTime) * (0.5 / 0.3) * Math.exp(-0.5 / 0.3), 1e-12, "at 0.5 ms");
  // Twice the energy, twice the power.
  assertClose(flashPower(2 * energy, flashTime, 0.2e-3), 2 * power(0.2e-3), 1e-12, "linear in E");
  assert.equal(flashPower(0, flashTime, 0.2e-3), 0, "no energy, no light");
});

test("a flash of t_p = 0.3 ms lasts about 0.73 ms at half its peak (the owner's 'about 1 ms')", () => {
  // u·e^(1 − u) = 1/2 at u = 0.23196 and 2.67835: a width of 2.4464·t_p.
  const flashTime = 0.3e-3;
  const peak = flashPower(1, flashTime, flashTime);
  const half = (t) => flashPower(1, flashTime, t) - peak / 2;
  const root = (lo, hi) => {
    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2;
      if (Math.sign(half(mid)) === Math.sign(half(lo))) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const width = root(flashTime, 10 * flashTime) - root(0, flashTime);
  assertClose(width, 2.4464 * flashTime, 1e-4, "FWHM");
  assert.ok(width > 0.7e-3 && width < 0.77e-3, "0.73 ms: " + width);
});

test("flash checks its inputs and names itself", () => {
  const good = { energy: 1000, flashTime: 0.3e-3 };
  const bad = [
    [{ energy: -1 }, /energy/],
    [{ energy: NaN }, /energy/],
    [{ flashTime: 0 }, /flashTime/],
    [{ flashTime: Infinity }, /flashTime/],
    [{ t: 1e-4 }, /t is not one of its inputs/]
  ];
  for (const [change, pattern] of bad) {
    assert.throws(() => call("flash", Object.assign({}, good, change)),
      (err) => /^LaserEngine\.pumps\.flash: /.test(err.message) && pattern.test(err.message),
      JSON.stringify(change));
  }
  assert.throws(() => P.flash(1000), /^Error: LaserEngine\.pumps\.flash: needs one object/);
});

/* ---------- the discharge ---------- */

const HENE = { currentPeak: 5e-3, gainPeak: 0.144 };

test("the optimum law is §6.4's ΔN = aI/(1 + I/I_sat) − bI with a/b = 4, scaled to its peak", () => {
  // With a/b = 4 the optimum I_sat(√(a/b) − 1) is I_sat itself.
  const a = 1;
  const b = 0.25;
  const I_sat = HENE.currentPeak;
  const deltaN = (I) => a * I / (1 + I / I_sat) - b * I;
  const peak = deltaN(HENE.currentPeak);
  for (const I of [0.5e-3, 2e-3, 5e-3, 7.5e-3, 12e-3, 14.9e-3]) {
    const g = call("dischargeGain", Object.assign({ law: "optimum", current: I }, HENE));
    assertClose(g, HENE.gainPeak * deltaN(I) / peak, 1e-12, "g₀ at " + I * 1e3 + " mA");
  }
  assert.equal(P.gainRatio, 4, "a/b");
});

test("the optimum law peaks at its current, and has no gain at 0 and at 3× that current", () => {
  const gain = (I) => call("dischargeGain", Object.assign({ law: "optimum", current: I }, HENE));
  assertClose(gain(HENE.currentPeak), HENE.gainPeak, 1e-12, "the peak");
  assert.equal(gain(0), 0);
  assertClose(gain(3 * HENE.currentPeak), 0, 0, "zero gain again at 3·I_peak", 1e-15);
  // A scan: the largest gain is at the peak current.
  let best = 0;
  for (let i = 1; i < 3000; i++) {
    if (gain(i * 5e-6) > gain(best * 5e-6)) best = i;
  }
  assertClose(best * 5e-6, HENE.currentPeak, 1e-12, "the scan's maximum");
  assertClose(call("dischargeMax", { law: "optimum", currentPeak: 5e-3 }), 15e-3, 1e-12, "the highest current");
});

test("the optimum law's gain at its highest current is never below 0, whatever rounding gives", () => {
  // A negative g₀ would make x < 0, which derive refuses: the slider's top
  // would throw. 2000 peak currents from 0.1 mA to 200 mA.
  for (let k = 1; k <= 2000; k++) {
    const currentPeak = k * 1e-4;
    const top = call("dischargeMax", { law: "optimum", currentPeak });
    const g = call("dischargeGain", { law: "optimum", current: top, currentPeak, gainPeak: 0.144 });
    assert.ok(g >= 0 && g < 1e-15, "g₀ at the top for I_peak = " + currentPeak + " A: " + g);
  }
});

test("the square law grows as I² up to the rated current (Ar⁺)", () => {
  const ar = { currentPeak: 40, gainPeak: 2.3 };
  for (const I of [0, 10, 20, 40]) {
    const g = call("dischargeGain", Object.assign({ law: "square", current: I }, ar));
    assertClose(g, 2.3 * (I / 40) * (I / 40), 1e-12, "g₀ at " + I + " A", 1e-300);
  }
  assert.equal(call("dischargeMax", { law: "square", currentPeak: 40 }), 40);
});

test("the threshold current is where the gain first reaches g_th, and none if the gain never does", () => {
  const gain = (law, I, peak) => call("dischargeGain", Object.assign({ law, current: I }, peak));
  for (const k of [1e-12, 1e-3, 0.2, 0.5, 0.9, 0.999]) {
    const gth = k * HENE.gainPeak;
    const I_th = call("dischargeThreshold", Object.assign({ law: "optimum", gth }, HENE));
    assertClose(gain("optimum", I_th, HENE), gth, 1e-9, "g₀(I_th) = g_th for k = " + k);
    assert.ok(I_th < HENE.currentPeak, "the lower of the two currents");
    assert.ok(gain("optimum", I_th * (1 - 1e-6), HENE) < gth, "below it, below threshold");
  }
  // The highest threshold the tube can reach is its peak, at the peak current.
  assertClose(call("dischargeThreshold", Object.assign({ law: "optimum", gth: HENE.gainPeak }, HENE)),
    HENE.currentPeak, 1e-6, "g_th = g_peak");
  assert.equal(call("dischargeThreshold", Object.assign({ law: "optimum", gth: 1.01 * HENE.gainPeak }, HENE)), null);
  const ar = { currentPeak: 40, gainPeak: 2.3 };
  assertClose(call("dischargeThreshold", Object.assign({ law: "square", gth: 0.0356 }, ar)),
    40 * Math.sqrt(0.0356 / 2.3), 1e-12, "square law: I_peak·√(g_th/g_peak)");
  assert.equal(call("dischargeThreshold", Object.assign({ law: "square", gth: 3 }, ar)), null);
});

test("the discharge functions check their inputs and name themselves", () => {
  const good = { law: "optimum", current: 5e-3, currentPeak: 5e-3, gainPeak: 0.144 };
  const bad = [
    [{ law: "linear" }, /law must be "optimum" or "square"/],
    [{ current: -1e-3 }, /current/],
    [{ current: 15.1e-3 }, /current .* at most 0\.015/],
    [{ currentPeak: 0 }, /currentPeak/],
    [{ gainPeak: -0.1 }, /gainPeak/],
    [{ voltage: 1000 }, /voltage is not one of its inputs/]
  ];
  for (const [change, pattern] of bad) {
    assert.throws(() => call("dischargeGain", Object.assign({}, good, change)),
      (err) => /^LaserEngine\.pumps\.dischargeGain: /.test(err.message) && pattern.test(err.message),
      JSON.stringify(change));
  }
  assert.throws(() => call("dischargeGain", Object.assign({}, good, { law: "square", current: 41, currentPeak: 40 })),
    /current .* at most 40/);
  assert.throws(() => call("dischargeThreshold", { law: "optimum", currentPeak: 5e-3, gainPeak: 0.144, gth: 0 }),
    /^Error: LaserEngine\.pumps\.dischargeThreshold: gth/);
  assert.throws(() => call("dischargeMax", { law: "optimum", currentPeak: -1 }),
    /^Error: LaserEngine\.pumps\.dischargeMax: currentPeak/);
  assert.throws(() => call("dischargeMax", { law: "cubic", currentPeak: 1 }),
    /^Error: LaserEngine\.pumps\.dischargeMax: law must be "optimum" or "square"/);
  for (const name of ["dischargeGain", "dischargeThreshold", "dischargeMax"]) {
    assert.throws(() => P[name](5e-3), new RegExp("^Error: LaserEngine\\.pumps\\." + name + ": needs one object"), name);
  }
});

test("pumps is frozen", () => {
  assert.equal(Object.isFrozen(P), true);
});
