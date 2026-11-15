/* ============================================================================
   bench.test.js — js/laser/engine/bench.js, the one engine file the page
   talks to: derive(config) gives the still numbers of the bench, advance()
   moves the simulation on (docs/laser-plan.md, stage 6 scope card).

   The expected numbers were recomputed on the real engine during the
   stage-6 audit; the doc sections are docs/laser-physics.md §3.6, §4.1,
   §4.2, §6.3, §11.3.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine, deepFreeze, assertClose, plain } = require("./helpers.js");

const E = loadEngine();
const B = E.bench;
const YAG = E.media.get("nd-yag");

// A config with some values changed, deep-frozen so a function that
// changes its input throws.
function config(changes) {
  return deepFreeze(Object.assign(B.defaultConfig(), changes || {}));
}

function derive(changes) {
  return B.derive(config(changes));
}

function advance(sim, cfg, seconds, maxSteps) {
  return B.advance(deepFreeze({ sim: plain(sim), config: cfg, seconds: seconds, maxSteps: maxSteps }));
}

// The output power the simulation shows: W per photon × the photon count.
function powerOf(sim, derived) {
  return derived.powerPerPhoton * Math.exp(sim.lnPhi);
}

/* ---------- the default bench ---------- */

test("the default bench: a small Nd:YAG laser pumped by 5 W of 808 nm diode light", () => {
  const c = B.defaultConfig();
  assert.deepEqual(plain(c), {
    medium: "nd-yag", l_g: 0.05, area: 1e-6, L: 0.3, refl1: 1, refl2: 0.95,
    alpha_i: 0.2, pumpPower: 5, pumpLam: 808e-9, eta: 0.9, beta: 1e-8
  });
  c.pumpPower = 7;
  assert.equal(B.defaultConfig().pumpPower, 5, "each call gives a new object");
});

test("default bench numbers (audit, 5 digits)", () => {
  const d = derive();
  const expected = {
    L_e: 0.341, gamma: 0.035647, gth: 0.71293, tau_c: 31.909e-9, eps: 1.3874e-4,
    pumpThreshold: 1.5120, x: 3.3068, P_out: 1.7151, slope: 0.49173,
    T_opt: 0.048667, T_best: 0.047502, period: 11.208e-6, t_damp: 139.11e-6
  };
  for (const name of Object.keys(expected)) {
    assertClose(d[name], expected[name], 1e-4, name);
  }
  assert.equal(d.medium, "nd-yag");
  assert.equal(d.tau, YAG.tau);
  assert.equal(d.lam, YAG.lam);
});

/* ---------- derive: identities with the files it is built from ---------- */

test("derive agrees with cavity.js and rates.js (one loss at a time and all together)", () => {
  const settings = [{}, { alpha_i: 0 }, { refl1: 0.99 }, { refl2: 0.7, alpha_i: 1 }, { L: 1, l_g: 0.1 }];
  for (const changes of settings) {
    const c = config(changes);
    const d = B.derive(c);
    const L_e = E.cavity.effectiveLength({ L: c.L, l_g: c.l_g, nGroup: YAG.nGroup });
    assertClose(d.L_e, L_e, 1e-12, "L_e");
    assertClose(d.gth, E.cavity.thresholdGain({ refl1: c.refl1, refl2: c.refl2, alpha_i: c.alpha_i, l_g: c.l_g }), 1e-12, "gth");
    const scales = E.rates.fourLevel.scales({
      sigma: YAG.sigma, tau: YAG.tau, nu: YAG.nu, l_g: c.l_g, area: c.area,
      L_e: L_e, refl1: c.refl1, refl2: c.refl2, alpha_i: c.alpha_i
    });
    for (const name of ["gamma", "N_c", "R_c", "tau_c", "eps", "powerPerP", "sOnePhoton"]) {
      assertClose(d[name], scales[name], 1e-12, name + " " + JSON.stringify(changes));
    }
    assertClose(d.powerPerPhoton, scales.powerPerP * scales.pOnePhoton, 1e-12, "powerPerPhoton");
    assertClose(d.N_c * YAG.sigma * c.l_g, d.gamma, 1e-12, "N_c·σ·l = γ");
    assertClose(d.gth, d.gamma / c.l_g, 1e-12, "g_th = γ/l");
  }
});

test("the pump: R_p = η·P/(hν_p·V_a), x = R_p/R_c, g₀l = xγ, x = P/threshold (§4.1, §6.3)", () => {
  for (const pumpPower of [0.5, 5, 17]) {
    const c = config({ pumpPower: pumpPower });
    const d = B.derive(c);
    const hnuP = E.units.photonEnergy(c.pumpLam);
    const V_a = c.area * c.l_g;
    assertClose(d.R_p, c.eta * pumpPower / (hnuP * V_a), 1e-12, "R_p");
    assertClose(d.x, d.R_p / d.R_c, 1e-12, "x");
    assertClose(d.g0, YAG.sigma * d.R_p * YAG.tau, 1e-12, "g0");
    assertClose(d.g0 * c.l_g, d.x * d.gamma, 1e-12, "g0·l = x·γ");
    assertClose(d.x, pumpPower / d.pumpThreshold, 1e-12, "x = P/P_th");
    assertClose(d.pumpThreshold, hnuP * c.area * d.gamma / (YAG.sigma * YAG.tau * c.eta), 1e-12, "threshold");
  }
});

test("§6.3 Fan–Byer: a 200 µm pump spot matched to the mode, 5 % loss, η = 0.9 → about 0.13 W", () => {
  const w = 200e-6;
  const d = derive({ area: Math.PI * w * w, refl1: 1, refl2: Math.exp(-0.05), alpha_i: 0 });
  const hnuP = E.units.photonEnergy(808e-9);
  // P_th = π·hν_p·(w_L² + w_p²)·(T + L_i)/(4στη) with w_L = w_p = w.
  const fanByer = Math.PI * hnuP * (2 * w * w) * 0.05 / (4 * YAG.sigma * YAG.tau * 0.9);
  assertClose(d.pumpThreshold, fanByer, 1e-12, "the formula");
  assert.ok(d.pumpThreshold >= 0.125 && d.pumpThreshold <= 0.135, "the doc's 0.13 W: " + d.pumpThreshold);
});

test("output power: (γ₂/2)·A·I_sat·(x − 1) above threshold, 0 below (§4.1); linear in the pump with the §3.6 slope", () => {
  const c = config();
  const d = B.derive(c);
  const gamma2 = -Math.log(c.refl2);
  assertClose(d.P_out, (gamma2 / 2) * c.area * YAG.I_sat * (d.x - 1), 1e-12, "§4.1");
  assertClose(d.P_out, d.slope * (c.pumpPower - d.pumpThreshold), 1e-12, "slope × (P − P_th)");
  assertClose(d.slope, c.eta * (c.pumpLam / YAG.lam) * gamma2 / (2 * d.gamma), 1e-12, "η·η_q·γ₂/(2γ)");
  // §3.6's small-loss form η·η_q·T/(T + L_i), T = 5 %, L_i = 2 %.
  const smallLoss = c.eta * (c.pumpLam / YAG.lam) * 0.05 / (0.05 + 2 * c.alpha_i * c.l_g);
  assertClose(d.slope, smallLoss, 0.03, "§3.6");
  for (const pumpPower of [0, 1, 1.5]) {
    const below = derive({ pumpPower: pumpPower });
    assert.ok(below.x < 1);
    assert.equal(below.P_out, 0, "no output below threshold at " + pumpPower + " W");
    assert.equal(below.period, null, "no relaxation oscillation below threshold");
    assert.equal(below.t_damp, null);
  }
  assert.equal(derive({ pumpPower: 0 }).T_opt, 0, "no coupler helps with no pump (§3.6)");
});

test("relaxation oscillations: the damped period of §4.2 above threshold", () => {
  const d = derive();
  const r = E.rates.fourLevel.relaxation({ x: d.x, tau: YAG.tau, tau_c: d.tau_c });
  assertClose(d.period, 2 * Math.PI / r.omegaDamped, 1e-12, "period");
  assertClose(d.t_damp, r.t_damp, 1e-12, "t_damp");
});

test("the best coupler: T_opt of §3.6, and where this model's P_out(T) really peaks, 1 − e^(−T_opt)", () => {
  const expectedPeak = { 2: 0.023156, 5: 0.047502, 20: 0.110711 };
  for (const pumpPower of [2, 5, 20]) {
    const d = derive({ pumpPower: pumpPower });
    const L_i = 2 * 0.2 * 0.05;
    assertClose(d.T_opt, E.cavity.optimumCoupler({ g0: d.g0, l_g: 0.05, L_i: L_i }), 1e-12, "T_opt");
    assertClose(d.T_best, 1 - Math.exp(-d.T_opt), 1e-12, "T_best");
    // Scan the coupler in steps of 2×10⁻⁶ around the peak.
    let best = -1;
    let bestT = 0;
    for (let T = 0.5 * d.T_best; T <= 1.5 * d.T_best; T += 2e-6) {
      const P = derive({ pumpPower: pumpPower, refl2: 1 - T }).P_out;
      if (P > best) {
        best = P;
        bestT = T;
      }
    }
    assertClose(bestT, d.T_best, 0, "peak at " + pumpPower + " W", 2e-6);
    assertClose(d.T_best, expectedPeak[pumpPower], 0, "audit value", 1e-6);
  }
  assert.equal(derive({ alpha_i: 0 }).T_opt, null, "no internal loss: no best coupler (§3.6)");
  assert.equal(derive({ alpha_i: 0 }).T_best, null);
});

test("every corner of the sliders gives finite numbers (or null), never an error", () => {
  const R = B.RANGES;
  for (const pumpPower of [R.pumpPower.min, R.pumpPower.max]) {
    for (const T of [R.T_oc.min, R.T_oc.max]) {
      const d = derive({ pumpPower: pumpPower, refl2: 1 - T });
      for (const [name, value] of Object.entries(d)) {
        if (typeof value === "number") assert.ok(Number.isFinite(value), name + " at " + pumpPower + " W, T " + T);
        else assert.ok(value === null || typeof value === "string", name);
      }
    }
  }
  assert.deepEqual(plain(R), {
    pumpPower: { min: 0, max: 20, log: false },
    T_oc: { min: 0.005, max: 0.3, log: true }
  });
  assert.ok(Object.isFrozen(R) && Object.isFrozen(R.pumpPower) && Object.isFrozen(R.T_oc));
});

/* ---------- advance: the simulation ---------- */

test("start(): the pump just switched on, no inversion, one photon", () => {
  assert.deepEqual(plain(B.start()), { t: 0, N: 0, lnPhi: 0 });
});

test("from start to steady state: the output equals derive's P_out within 1 %", () => {
  const c = config();
  const d = B.derive(c);
  // 30τ: about 50 damping times. Measured: 12 390 steps (dopri5: 4565; the
  // implicit solver is order 2, stage 7a).
  const run = advance(B.start(), c, 30 * d.tau, 18600);
  assert.equal(run.reachedEnd, true);
  assertClose(run.sim.t, 30 * d.tau, 1e-12, "time");
  assertClose(powerOf(run.sim, d), d.P_out, 0.01, "P_out");
  assertClose(run.sim.N, d.N_c, 0.01, "the inversion clamped at threshold");
  assert.ok(run.steps > 1000 && run.steps <= 18600, "steps " + run.steps);
});

test("below threshold: the inversion settles at x·N_c and the output stays at the spontaneous level", () => {
  const c = config({ pumpPower: 0.75 });
  const d = B.derive(c);
  // 10τ at x ≈ 0.5: measured 615 steps (dopri5 took 12 652 here, held to
  // 3.3ε/(1 − y) by the photons' seed level, §11.3).
  const run = advance(B.start(), c, 10 * d.tau, 1000);
  assert.equal(run.reachedEnd, true);
  assertClose(run.sim.N / d.N_c, d.x, 1e-3, "y → x");
  assert.ok(powerOf(run.sim, d) < 1e-6 * d.powerPerP, "no lasing: " + powerOf(run.sim, d) + " W");
});

test("advance is deterministic: the same input gives the same output, to the bit", () => {
  const c = config();
  const first = advance(B.start(), c, 200e-6, 3200);           // measured: 2129
  const second = advance(B.start(), c, 200e-6, 3200);
  assert.deepEqual(plain(first), plain(second));
});

test("advance by 0 s changes nothing and takes no step (a frame that only draws)", () => {
  const sim = { t: 1e-3, N: 2e22, lnPhi: 30 };
  const run = advance(sim, config(), 0, 10);
  assert.deepEqual(plain(run), { sim: sim, reachedEnd: true, steps: 0 });
});

test("out of steps: partial progress, never a freeze; carrying on reaches the same state as one call", () => {
  const c = config();
  const target = 120e-6;
  const short = advance(B.start(), c, target, 5);
  assert.equal(short.reachedEnd, false);
  assert.equal(short.steps, 5);
  assert.ok(short.sim.t > 0 && short.sim.t < target, "moved forward: " + short.sim.t);
  for (const value of [short.sim.N, short.sim.lnPhi]) assert.ok(Number.isFinite(value));

  let sim = short.sim;
  let calls = 0;
  while (target - sim.t > 1e-15 && calls < 1000) {
    sim = advance(sim, c, target - sim.t, 5).sim;
    calls += 1;
  }
  const whole = advance(B.start(), c, target, 3000);
  assert.equal(whole.reachedEnd, true);
  assertClose(sim.t, target, 1e-12, "time");
  // Each call picks its own first step, so the pieces take other steps
  // than one long call and agree only to the solver's accuracy (rtol 10⁻⁶
  // a step; measured 1.2×10⁻⁶ apart in ln φ). Losing or shifting anything
  // between calls is far bigger: ln φ would be off by |sOnePhoton| ≈ 26.
  assertClose(sim.N, whole.sim.N, 1e-4, "N");
  assertClose(sim.lnPhi, whole.sim.lnPhi, 1e-4, "ln φ");
});

test("a solver answer a hair below N = 0 is passed on as 0, so the next call accepts it", () => {
  // With the pump off the inversion decays to below the solver's atol,
  // where its error control no longer watches it, and a step can end a
  // hair below 0. Found in stage 6 while measuring (30 % coupler, pump
  // off, 0.5τ pieces, after 35τ), but that run is slow and depends on the
  // solver's rounding, so this engine's solver is wrapped to give such an
  // answer.
  const loaded = loadEngine();
  const ode = loaded.ode;
  loaded.ode = {
    rosenbrock: function (params) {
      const run = ode.rosenbrock(params);
      return Object.assign({}, run, { state: [-1e-12, run.state[1]] });
    }
  };
  const c = config({ pumpPower: 0 });
  const first = loaded.bench.advance({ sim: { t: 0, N: 1e10, lnPhi: 0 }, config: c, seconds: 1e-9, maxSteps: 100 });
  assert.equal(first.sim.N, 0);
  loaded.ode = ode;
  const next = loaded.bench.advance({ sim: first.sim, config: c, seconds: 1e-9, maxSteps: 100 });
  assert.equal(next.reachedEnd, true);
});

test("the 'almost no loss' check uses cavity.js's γ: accepted just above 10⁻⁹ a pass, refused just below", () => {
  // bench.js writes γ out itself, so the error names bench.derive and not
  // cavity.singlePassLoss; this ties the two together at the limit.
  for (const [gamma, accepted] of [[2e-9, true], [0.5e-9, false]]) {
    const changes = { refl1: 1, refl2: Math.exp(-2 * gamma), alpha_i: 0 };
    assertClose(E.cavity.singlePassLoss({ refl1: 1, refl2: changes.refl2, alpha_i: 0, l_g: 0.05 }), gamma, 1e-6, "γ");
    if (accepted) {
      assert.doesNotThrow(() => B.derive(config(changes)), String(gamma));
    } else {
      assert.throws(() => B.derive(config(changes)), /^Error: LaserEngine\.bench\.derive: .*almost no light/, String(gamma));
    }
  }
});

test("a slider moved mid-run: the atoms and photons carry over, only the scales change", () => {
  const c = config();
  const before = advance(B.start(), c, 300e-6, 5800).sim;      // measured: 3887
  const c2 = config({ refl2: 0.9 });                // x = 1.88: still lasing
  // 1 fs: far shorter than τ_c (6 ns here), so nothing has time to change.
  const after = advance(before, c2, 1e-15, 100).sim;
  assertClose(after.N, before.N, 1e-6, "N");
  assertClose(after.lnPhi, before.lnPhi, 1e-6, "ln φ");
  // And the new cavity settles to its own output.
  const d2 = B.derive(c2);
  const settled = advance(after, c2, 30 * d2.tau, 39000);       // measured: 25 904 steps
  assert.equal(settled.reachedEnd, true);
  assertClose(powerOf(settled.sim, d2), d2.P_out, 0.01, "new P_out");
});

test("pump off for 750τ, then on again: the photons settle at the seed of y = 10⁻¹², and lasing comes back", () => {
  // A long, low-loss cavity (ε ≈ 0.09). With the pump off the inversion
  // falls past 10⁻³⁰⁰ of threshold; the seed counts it as y + 10⁻¹²
  // (rates.js, Y_FLOOR), so ln φ settles near ln(β·10⁻¹²) − sOnePhoton
  // instead of following the atoms down.
  const long = { L: 3, refl2: 0.999, alpha_i: 0, pumpPower: 4 };
  const on = config(long);
  const off = config(Object.assign({}, long, { pumpPower: 0 }));
  const d = B.derive(on);
  assert.ok(d.eps > 0.05 && d.x > 1.5, "the setting is what the comment says");
  let run = advance(B.start(), on, 40 * d.tau, 800);            // measured: 521
  assert.equal(run.reachedEnd, true);
  run = advance(run.sim, off, 750 * d.tau, 1000);               // measured: 671 (dopri5: about 7300)
  assert.equal(run.reachedEnd, true);
  // What is left of y is below the solver's atol, where it no longer
  // controls the error: a hair above 0 or below it (passed on as 0),
  // depending on rounding. Either way it is below the seed floor's 10⁻¹².
  assert.ok(run.sim.N >= 0 && run.sim.N < 1e-12 * d.N_c, "the inversion is gone: N = " + run.sim.N);
  const floorLevel = Math.log(1e-8 * 1e-12) - d.sOnePhoton;     // ln φ at the floor's seed (1 − y ≈ 1)
  assertClose(run.sim.lnPhi, floorLevel, 1e-6, "ln φ at the floor's seed level");
  run = advance(run.sim, on, 60 * d.tau, 1000);                 // measured: 678
  assert.equal(run.reachedEnd, true);
  assertClose(powerOf(run.sim, d), d.P_out, 0.01, "lasing again");
});

// Runs `count` frames of 60 Hz as page.js does: each frame moves the
// simulation (1/60 s) ÷ slowMotion on, in 8 pieces that share the frame's
// steps. Here a frame may use only `bound` steps, so a solver that became
// costlier fails at its first costly frame instead of running long.
function pageFrames(sim, cfg, slowMotion, count, bound) {
  const piece = (1 / 60) / slowMotion / 8;
  let worst = 0;
  for (let frame = 0; frame < count; frame++) {
    let used = 0;
    for (let i = 0; i < 8; i++) {
      const run = B.advance(deepFreeze({ sim, config: cfg, seconds: piece, maxSteps: Math.max(1, bound - used) }));
      used += run.steps;
      assert.equal(run.reachedEnd, true, "frame " + frame + " needed more than " + bound + " steps");
      sim = run.sim;
    }
    worst = Math.max(worst, used);
  }
  return { sim, worst };
}

test("the costliest Nd:YAG corner fits a 60 Hz frame's 1500 steps (20 W, 30 % coupler, slow motion 10³)", () => {
  // Measured per frame: up to 698 steps while the spikes last (3 t_damp),
  // 212 in the first τ with the pump off, 56 later on. The bounds are 1.5×
  // that. The pump-off run goes on for 60τ, past y = 10⁻¹² (about 28τ),
  // where the old seed floor max(y, 10⁻¹²) made frames cost up to 580.
  const hot = config({ pumpPower: 20, refl2: 0.7 });
  const d = B.derive(hot);
  const frame = (1 / 60) / 1e3;
  const on = pageFrames(B.start(), hot, 1e3, Math.ceil(3 * d.t_damp / frame), 1050);
  assert.ok(on.worst > 400, "the spikes are the costly part: " + on.worst + " steps");
  const off = pageFrames(on.sim, config({ pumpPower: 0, refl2: 0.7 }), 1e3, Math.ceil(60 * d.tau / frame), 320);
  assert.ok(off.worst > 100, "the light dying away costs something: " + off.worst + " steps");
});

/* ---------- inputs ---------- */

test("every input is checked, and every error names the function that was called", () => {
  const bad = [
    [{ medium: "unobtainium" }, /medium/],
    [{ medium: 7 }, /medium/],
    [{ medium: "ruby" }, /four-level/],
    [{ l_g: 0 }, /l_g/],
    [{ l_g: 0.5 }, /longer than the cavity|l_g/],
    [{ area: -1 }, /area/],
    [{ refl2: 1.2 }, /refl2/],
    [{ alpha_i: -0.1 }, /alpha_i/],
    [{ refl1: 1, refl2: 1, alpha_i: 0 }, /no light|loses/],
    [{ pumpPower: -1 }, /pumpPower/],
    [{ pumpPower: NaN }, /pumpPower/],
    [{ pumpLam: 1100e-9 }, /pumpLam|pump photon/],
    [{ eta: 0 }, /eta/],
    [{ eta: 1.1 }, /eta/],
    [{ beta: 2 }, /beta/]
  ];
  for (const [changes, pattern] of bad) {
    assert.throws(() => B.derive(config(changes)), (error) =>
      error.message.startsWith("LaserEngine.bench.derive") && pattern.test(error.message),
      JSON.stringify(changes));
    assert.throws(() => advance(B.start(), config(changes), 1e-6, 10), (error) =>
      error.message.startsWith("LaserEngine.bench.advance") && pattern.test(error.message),
      "advance " + JSON.stringify(changes));
  }
  const badRuns = [
    [{ sim: { t: 0, N: -1, lnPhi: 0 } }, /N/],
    [{ sim: { t: NaN, N: 0, lnPhi: 0 } }, /\bt\b/],
    [{ sim: { t: 0, N: 0, lnPhi: Infinity } }, /lnPhi/],
    [{ sim: { t: 0, N: 0 } }, /lnPhi/],
    [{ sim: { t: 0, N: 0, lnPhi: 0, y: 1 } }, /y/],
    [{ sim: 5 }, /one object/],
    [{ seconds: -1 }, /seconds/],
    [{ seconds: Infinity }, /seconds/],
    [{ maxSteps: 0 }, /maxSteps/],
    [{ maxSteps: 2.5 }, /maxSteps/]
  ];
  for (const [changes, pattern] of badRuns) {
    const params = Object.assign({ sim: B.start(), config: config(), seconds: 1e-6, maxSteps: 10 }, changes);
    assert.throws(() => B.advance(deepFreeze(params)), (error) =>
      error.message.startsWith("LaserEngine.bench.advance") && pattern.test(error.message),
      JSON.stringify(changes));
  }
});

test("a name the function does not use is refused (a typo would otherwise be ignored)", () => {
  assert.throws(() => B.derive(config({ pumpPowr: 5 })), /LaserEngine\.bench\.derive.*pumpPowr/);
  assert.throws(() => B.derive(config({ T_oc: 0.05 })), /LaserEngine\.bench\.derive.*T_oc/);
  assert.throws(() => B.advance(deepFreeze({ sim: B.start(), config: config(), seconds: 1e-6, maxSteps: 10, budget: 3 })),
    /LaserEngine\.bench\.advance.*budget/);
});

test("advance refuses plain numbers instead of one object of named values", () => {
  assert.throws(() => B.advance(B.start(), config(), 1e-6, 10), /LaserEngine\.bench\.advance/);
});

test("the engine's bench object is frozen; returned objects are new", () => {
  assert.ok(Object.isFrozen(B));
  const a = B.start();
  a.t = 5;
  assert.equal(B.start().t, 0);
});
