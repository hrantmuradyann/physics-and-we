# Laser simulator — architecture and build plan

The physics behind every stage is in `docs/laser-physics.md` (Sivukhin, *Optics*, §§119–126). Section numbers like "§5.1" below refer to that file.

## What we are building

**One big lab** with two parts:

- a **playground**: a laser bench where the visitor swaps parts (gain medium, pump, mirrors, Q-switch, lenses) and watches what happens;
- a **learn** part: organised, interesting chapters on the physics behind it, each one linked to the bench.

The shell every other lab runs in (`js/labs.js`) doesn't fit this. It gives a lab one canvas, a column of sliders and toggles, and a theory paragraph, with no dropdowns, no parts tray and no room for chapters. So the laser gets its own page. It still follows the site's rules: layout in `sections/`, words in `data/`, no build step, no npm, colours only from the theme variables.

## 1. Where it lives

Its own hidden route, `?view=laser`. It works like the existing hidden routes `post` and `lab`, and it doesn't touch the Labs shell.

```
sections/laser.html        page layout: bench, parts tray, control dock, plots, learn chapters
data/laser.json            every word (hy/en): part names, labels, readouts, chapters, preset names
data/site.json             + nav entry { "route": "laser", "hidden": true, label }
css/laser.css              this page only; theme vars only (linked in index.html)

js/laser/engine/           PHYSICS: pure, SI, no DOM (see §2 below)
js/laser/ui/               DRAWING and controls: reads engine output, never does physics
js/laser/page.js           glue: hooks section:ready for route "laser", owns state, wires UI → engine → drawing
js/laser/presets.js        ready-made bench setups (numbers only; their names are in data/laser.json)

tests/laser/*.test.js      engine tests, run with Node's built-in runner (no package.json)
```

- **Getting there from the Labs page:** a large "featured lab" banner (`.lab-feature`) above the simulations grid in `sections/labs.html`. Where it leads, `href="?view=laser" data-goto="laser"`, is written in the layout, like the cards' `data-goto="lab"`; its words are `featured` in `data/labs.json` (stage 5 decision: a typo in a text file cannot break the link). The card template only links to `?view=lab&id=…`, and a flagship lab deserves a bigger entry anyway.
- **Why the layout lives in `sections/laser.html`:** the learn chapters can use `data-list` / `data-rich`, so editors can fix or translate the lessons in `data/laser.json` exactly like any other page (`Instructions/EDITING-GUIDE.md`).
- **Lifecycle:** `js/laser/ui/loop.js` follows the same rules as `js/labs.js`:
  - one `requestAnimationFrame` loop for all of the page's canvases;
  - the time step is capped;
  - the loop stops while the page is off screen (`IntersectionObserver`);
  - canvases are resized with `ResizeObserver` and sharpened for the screen's pixel density (DPR);
  - colours are re-read on `theme:changed`;
  - everything is torn down before a rebuild: a language switch fires `section:ready` again. `labs.js` also needs a `generation` guard because it fetches a lab's words before building; the laser page gets its words with the event and builds synchronously, so tearing down first is enough (stage 5).

  These ~100 lines are copied in on purpose rather than pulled out of `labs.js`, so the two working labs aren't put at risk. They can be merged later.
- `index.html` gets one `<script>` line per laser file, after `js/labs.js`, with the engine files in the order of `ENGINE_FILES` in `tests/laser/helpers.js` (a test checks this). Keep the engine to about 9 files so the list stays short.

## 2. Separating the physics engine from rendering

**Engine (`js/laser/engine/`)**: a global `LaserEngine` namespace.

- Every file is a plain script: `(function (root) { var E = root.LaserEngine = root.LaserEngine || {}; E.cavity = {…}; })(this);`. The same file works in the browser (`this` = `window`) and in a Node `vm` sandbox for tests.
- Rules (checked by `tests/laser/engine-rules.test.js`):
  - only plain numbers and plain objects go in and out, in SI units;
  - functions return new objects and never change their inputs; the engine's own objects are frozen;
  - no page, network, clock, timers or random numbers inside;
  - variable names come from the code-name column of the symbol table in `docs/laser-physics.md` §0 (`N1`, `sigma`, `tau_c`, `refl2`, `Rc1`, `w0`, `phi` = photon count, `S` = photon density, …);
  - physics numbers are written as the handbook's number × unit (`2.5e-20 * cm2`, `230 * us`).

| File | Contents | Doc § |
|---|---|---|
| `check.js` | input checks shared by every engine file (loaded first) | — |
| `constants.js` | h, c, k, ε₀…, units, CGS↔SI helpers | 13 |
| `media.js` | table of media (ruby, Nd:YAG, Nd:glass, He-Ne, CO₂, diode, Ti:sapphire…): λ, σ, τ, n, scheme, linewidth, broadening type; derived ν, hν, I_sat | 5.1 |
| `spectrum.js` | thermal emission; lineshapes, gain curve g₀(ν), longitudinal-mode comb | 1, 3.3 |
| `cavity.js` | losses γ, τ_c, threshold gain/inversion, CW output power, optimum coupler | 3 |
| `rates.js` | right-hand sides of the 3- and 4-level rate equations in dimensionless form, `ln p` variable, time-dependent loss for Q-switching | 4, 11.2 |
| `ode.js` | generic adaptive Dormand–Prince RK45 (knows nothing about lasers) | 11.3 |
| `optics.js` | ABCD matrices, stability, Gaussian q-parameter through elements, exact ray tracing through lenses | 7, 8 |
| `bench.js` | the façade the page uses: `derive(config)` → static results; `advance(sim, config, simSeconds, budget)` → new sim state | 11.1 |

**Data flow (one direction only):**

```
controls / parts tray ──► config (what is on the bench)
config ──► LaserEngine.bench.derive(config) ──► derived  (threshold, stability, w(z), modes)
each frame: sim = LaserEngine.bench.advance(sim, config, wallDt × slowMotion, stepBudget)
{config, derived, sim, history} ──► js/laser/ui/draw-*.js  (read-only)
```

- **Simulation time vs. real time:** simulated time runs separately from real time through a slow-motion factor (10³–10¹²×). Each frame has a step budget. If the stiff solver needs more steps than the budget allows, the simulation runs slower instead of freezing the page.
- **Rendering (`js/laser/ui/`):**
  - `loop.js`: lifecycle, as above.
  - `draw-bench.js`: mirrors, rod, pump and beam on the bench.
  - `draw-levels.js`: level diagram with population bars.
  - `draw-plots.js`: P(t), N(t), spectrum, stability diagram.
  - `color.js`: wavelength → RGB, with false colour plus an "invisible" label for IR/UV (§11.5).
  - `parts.js`: the parts tray and pickers (DOM). Labels come from `data/laser.json` and are set with `textContent` only.

  The UI files take a snapshot plus the theme colours and draw. They never call `rates`/`ode`.

## Status

- ✅ Stage 1: constants, media table, tests (`2f8b190`).
- ✅ Stage 1b: safety tools (mutation checker, `deepFreeze`, engine-folder override).
- ✅ Stage 2: static cavity and spectrum (`cavity.js`, `check.js`, lineshapes and mode comb in `spectrum.js`, `ng` in `media.js`).
- ✅ Stage 3: ODE solver (`ode.js`: adaptive Dormand–Prince 5(4)); the mutation check runs in parallel.
- ✅ Stage 4: four-level rate equations (`rates.js`: scales, right-hand side, steady state, relaxation oscillations, the seed floor `liftToSeed`).
- ✅ Stage 5: page skeleton (`?view=laser`, the Labs-page banner, `js/laser/ui/loop.js`, `draw-bench.js`, `page.js`; the engine is loaded by `index.html`).
- ✅ Stage 6: first playable laser (`bench.js`; `format.js`, `history.js`, `draw-levels.js`, `draw-plots.js`; sliders for pump, coupler and slow motion, Play/Pause, Reset, readouts, the level diagram with its gain/loss gauge, plots of power and inversion).
- ✅ Stage 6b: the page in the owner's design (`axis.js`, `draw-photons.js`; the bench with real-looking mirrors and separate rays, a scientific chart of the output power, number boxes beside the sliders, the photon cartoon, the "dig deeper" theory section).
- ✅ Stage 7a: implicit solver for stiff runs (`ode.rosenbrock`, one step loop shared with `dopri5`; the bench switched to it; the seed floor inside the rate equations).
- ✅ Stage 7b: the engine for every medium and pump the bench runs (`pumps.js`: the flash and the gas discharge; `rates.threeLevel` and `rates.twoLevel`; ruby's N_t and the two-level atom in `media.js`; `bench.js`: the setups, `controls`, `fire`, `flashThreshold`); the page unchanged apart from `start(config)` and its light scale.
- ✅ Stage 7c: choosing the laser on the page (two dropdowns over every bench of 7b; each bench's pump slider, units, starting slow motion and readout rows; Fire for a flashlamp; `bench.pumpNow`, whose `smallSignal` puts the gauge's dashed line at each medium's own gain; the inversion chart removed; the mutation check about 10× faster). Until 7d every bench is drawn with diodes and four levels.
- ✅ Stage 7d: each pump drawn as itself on the bench (diodes, flashlamp, gas tube with electrodes and supply, pump laser with its fold mirror) and the level picture for three and two levels (the ground as the lower level, the share bars with the threshold mark, the gauge below zero); `derive` gives `thresholdRate`.
- ✅ Stage 8a: Q-switching in the engine (`qswitch.js`: η_E and §4.3's giant pulse, the Pockels cell's and the rotating prism's loss, the bleachable filter as one more rate equation; `bench.js`: `qSwitchesFor`, `withQSwitch`, the shutter's opening time and the filter's state in the simulation, `lossNow`, `giantPulse`, advance's `peak` and its pieces at the shutter's moments; `ode.js`: `peakOf`); the page unchanged.
- ✅ Stage 8b: Q-switching on the page (the owner's design: one Q-switch, the bleachable filter, as an On/Off switch right under the laser beside Fire; turning it on or off keeps the run and the chart (`bench.carryOver`); its slider, the loss now and §4.3's prediction, the highest output from the runs' peaks, the pulses' tops on the chart, the filter on the drawing; `derive` and `pumpNow` give the closed filter's threshold on a steady pump).
- ✖ Stage 9 (several longitudinal modes and a spectrum panel): **dropped by the owner** on 2026-11-16, as it would make everything too complex. The simulator stays one-mode (`docs/laser-physics.md` §11.3). The number is not reused, so later stages keep theirs.
- ✅ Stage 10a: mirror optics in the engine (`optics.js`: ray matrices, stability, the Gaussian mode, each mirror's F, a ray trace, and the mirrors' loss across every stability edge, §7.7; `bench.js`: each bench's real mirrors (§5.9), the mirrors' loss in every threshold, `derive`'s `resonator`); the page unchanged.
- ✅ After 10a, at the owner's request (2026-11-19): the energy levels with their gain/loss gauge removed from the page (`draw-levels.js`, its canvas, words and tests; the theory's pointer to it now points to the power chart).
- ✅ Stage 10b: the mirrors on the page (each mirror flat, concave or convex, a curved one's radius slider; the hourglass, traced rays that fade and walk out, each mirror's F, "Widths × k"; the readouts of the pair; the stability diagram beside the chart; `bench.controls`' radii and `bench.beamPath`).
- ✅ Stage 10c2: the pump you can see working (end-pumped diodes and pump laser, the filter beyond the rod, pump photons, gas atoms, light dimmed behind a dark filter).
- ✅ Stage 10c1 (committed): each medium's look and the beam's colour (`materials.js`; the rods as crystals in their colours, the dye in a glass cell, each gas glowing in its colour, the beam in its wavelength's colour or a labelled false colour; §5.10).
- ✅ After 10c2, at the owner's request (2026-11-20): one near-white lab in both themes (`--laser-*` colours, `.laser-lab`), the mirrors drawn as real ones (glass, silver coating, a mount with knobs; each face standing out towards the laser, as deep as its radius on the slider), each mirror's controls beside the drawing, and "inside one atom" (`draw-atoms.js`) under the cartoon.
  - **Finished 2026-11-20** (the session before had stopped part-way, with 5 tests failing): the tests follow the new mirror faces (each standing out towards the laser; as deep as `cavity.curve`, the radius on its slider) and the controls' new order; new tests for the depth, the page's `curveOf`, the atom picture's drive from the page, its readable colours, the mirrors' readable lines and `.laser-lab` mapping every themed site colour (`OUTSIDE_THE_LAB` lists the six it need not); `--canvas-flash` and `--canvas-lamp`, unused since the lab has its own, removed. 13 stale entries of `mutations.js` fixed (3 more moved with the review's tidy-up) and 27 added; 949 of 949 caught (the last run found one stale entry the tidy-up moved, and a line in `mountHole` that never mattered, the rays always lying inside the rod's half-height: the line went, and its mistake now shrinks the hole below the rod's).
  - **Review** (`/code-review medium`, 10 findings), fixed: the flash nearly invisible on the near-white (its silver-white 1.6:1): the streaks, the burning gas and the flash's pump photons now `readable`, the tint and halo stay a faint glow; the mirror mount's plate crossed the beam and the pump cone: it has a hole (`mountHole`); the atom picture wrote "1064 nm" under the bench's "1.06 µm": both `format.si`; an atom glowed on its heat drop to the ground: only up, or moving to or from there; the atom picture's screen-reader text described four levels only: now every scheme; the cartoon's and the atom's drive worked out twice a frame; CLAUDE.md's and draw-bench.js's per-theme flash colours. Declined: the atom picture's pump following the gain (`glowNow`), not the current (`benchPumpNow`): the cartoon does the same on purpose (`page-choose.test.js`: a discharge at the optimum law's top has no net pumping of the upper level, which is why its gain is 0); `docs/laser-guide.md` in CLAUDE.md's file map: it is the owner's untracked learning material, not part of the repo; `transparent` in css/laser.css: the colour-literal test allows `transparent` and `currentColor` on purpose (CLAUDE.md now says so). Not yet seen in a browser: the flash and the mount's hole.
- ✖ Stage 11 (lenses outside the laser) **dropped by the owner** (2026-11-20). It had been split into 11a (the engine: committed as 8d9bcd2) and 11b (a separate "after the laser" block with its own drawing, pickers and numbers: built, never committed). Shown 11b, the owner found it far too much ("no need for special after the laser picture") and asked to drop the whole stage: 11b was thrown away, and 11a undone by a revert commit (the code is in git history if a lens is ever wanted). See the stage below.

### Where we stopped (2026-11-20), for the next session

- **Last commit:** "Laser simulator: drop stage 11 (lenses), at the owner's request", on `feature/laser`, which reverts stage 11a. Before it: "Laser page: the owner's requests of 20 November". **Nothing is pushed**; push only when the owner says so. `docs/laser-guide.md` (the owner's learning material, written by another AI) is untracked on purpose: not part of a stage.
- **Stage 10c is finished** (10c1 and 10c2): 739 tests pass, 922 of 922 deliberate mistakes are caught, and each sub-stage had one review, every finding fixed or declined in its scope card. Not yet seen in a browser: a 320 px phone (the note's row, the filter's name under the bench); stage 10b's unseen checks (760–1100 px layout, shape buttons wrapping at 320 px) and stage 8b's (no empty line above the switch at 390 px) still stand. Two whole test files (page-choose, page) each failed once in a full parallel run and passed on their own and in every run after: watch for it.
- **Stage 11 is dropped** (see the status list). **Next is stage 12** (the "learn" section), after asking the owner what they want in it; keep it small. The lesson of stage 11: the owner wants the page simple; ask before adding a new block, picture or set of controls, and offer the smallest version first.
- **Questions still open with the owner** (asked, no answer yet):
  - a short "check the numbers" stage (CO₂'s I_sat/gain against sources, the §5.1 media numbers, ruby's flash share);
  - the Armenian terms «Բարորակության մոդուլյատոր» (Q-switch) and «Հագեցող ֆիլտր» (bleachable filter), and a fluent reader for all the Armenian (10b added the mirror words: «Հարթ», «Գոգավոր», «Ուռուցիկ», «կորության շառավիղ»);
  - ruby's ~13 J against the book's 1–2 J;
  - pushing `feature/laser`.
- **What the owner values** (from their requests): a page that is simple and inviting for someone who knows nothing about lasers, and now also realistic to look at. Small asks get small changes (e.g. "only change the color").
- **Practical:**
  - serve the site with `python3 -m http.server 5500 --bind 127.0.0.1` and open `http://127.0.0.1:5500/?view=laser`. The server caches: fetch changed files with `cache: "reload"` before reloading;
  - `node --test` takes about 30 s; `node tests/laser/mutation-check.js` about 6 min;
  - edit nothing under `js/`, `css/`, `data/`, `sections/`, `index.html` or `tests/` while the mutation check runs (docs are safe);
  - use the Edit tool, not shell scripts, for Armenian text;
  - the review runs as `/code-review medium` (the owner's setting, 2026-11-20; stages up to 10c2 used xhigh).

Working agreement: every stage follows the recipe in section 3, ends with `/code-review` (findings fixed before the stage counts as done), and is committed to `feature/laser` as one commit. Nothing is pushed without asking. `docs/laser-progress.md` tells the same story in plain words for the owner; update it with each stage's commit.

## What went wrong in stage 1, and the rule that prevents it

| Stage-1 mistake | Rule from now on |
|---|---|
| `I_sat` taken from §5.1 only; §2.2 and §4.4 said otherwise | **Read every doc section that mentions a quantity**, not just the main one: grep the doc for each symbol before coding |
| CaF₂:Dy marked "not pulsed"; §5.4 and §12 said it Q-switches | Same rule: grep the doc for each medium/part name too |
| Comments claimed facts that weren't true ("halves the gain", "gives 22 W/cm²") | Every physics claim in a comment either cites a doc § **and** is covered by a test, or is removed |
| A 10 % tolerance hid a 5 % error | **Tolerance policy** (below); never loosen a tolerance to make a test pass |
| Only some fields range-checked | Every new data field gets a units/range sanity test |
| Rules test matched substrings; `plain()` hid NaN; `assertClose` broke at 0 | Test helpers get their own tests (done in stage 1); new helpers too |
| `CLAUDE.md` claimed a test that didn't exist, and linked a file outside the repo | Every "X is enforced" sentence names a real test; no paths outside the repo |
| `assert.equal` on floats (`230 * 1e-6`) | Never compare floats with `equal`; use `assertClose` |
| Doc used φ for three different things | A symbol-consistency check against the §0 table is part of each stage's doc audit |

**Tolerance policy:**
- an exact formula identity: relative tolerance 1e-12;
- a number the doc prints with k significant digits: half a unit in the last digit (e.g. "3.8×10⁴" → ±1.3 %), with the exact value written in a comment;
- a book "~" or order-of-magnitude value: an explicit `[low, high]` range with a comment quoting the book.

---

## 3. The recipe every stage follows

1. **Scope card.** Before any code, add the stage's contract to `docs/laser-plan.md`:
   - each function: name, inputs with units, output with units, doc §;
   - each test value and its source;
   - each decision made.
2. **Doc audit** (read-only, then fix the doc first):
   - a. grep the doc for every symbol, medium and part the stage uses, and read every hit;
   - b. dimension-check each formula (units of every term);
   - c. recompute each worked example in Node and note the result in the scope card;
   - d. check symbols against the §0 table and add missing code names;
   - e. fix contradictions in the doc. If the fix is a physics *choice* the doc doesn't settle, ask the user.
3. **Tests first.** Write the tests from the scope card and run them; they must fail, because the functions don't exist yet.
   - Per function, cover: a normal value; every doc example; boundaries and singular points; invalid input throws a clear error; a units sanity range for each new field; inputs left unchanged (tests pass **deep-frozen** inputs, so any change throws).
4. **Implement**, following the engine rules in `CLAUDE.md`. Values are written as number × unit, and comments cite the doc.
5. **Break it on purpose.** Add this stage's deliberate breaks to `tests/laser/mutations.js` and run `node tests/laser/mutation-check.js`. Every break must come back "caught": MISSED means a missing test, TIMED OUT means a test's work is not bounded tightly enough (give each solver call a `maxSteps` near what it needs: node:test cannot stop a synchronous test, so a `{ timeout }` does nothing), ERROR means a bad entry. Each break must leave the file valid JS/JSON; a typo that stops the file loading proves nothing.
   - Typical breaks: drop a factor of 2, flip a sign, forget a unit, use the wrong variable (`l` vs `L`, `n` vs `n_g`), an off-by-one, the wrong log.
6. **Full checks.**
   - `node --test` must pass.
   - For UI stages, the browser checklist (Verification section): run through Claude in Chrome if it's connected, otherwise handed to the user as a list.
7. **Review.**
   - Run `/code-review`.
   - Fix the findings, recompute any numbers they touch, and rerun steps 5–6.
   - Report any finding that is not fixed, and why, instead of silently skipping it.
8. **Docs.**
   - Update `CLAUDE.md` (file map, rules, and only claims backed by a named test).
   - Update `docs/laser-plan.md`: stage marked done, decisions recorded.
9. **Commit** the stage to `feature/laser` (one commit, message lists decisions and anything still unverified), then report to the user. If a check can't be made to pass honestly, stop and ask the user; don't commit around it.

---

## Stage 1b — safety tools ✅

- `tests/laser/helpers.js`:
  - `LASER_TEST_ROOT` + `LASER_MUTATION_CHECK=1` point the tests at a copy of the project; `LASER_TEST_ROOT` alone stops the tests with an error;
  - `deepFreeze()`: freezes inside already-frozen objects too, handles loops, refuses typed arrays.
- `tests/laser/mutation-check.js` + `tests/laser/mutations.js`:
  - `mutations.js` holds `{ file, find, replace, why }` entries; `file` is relative to the repo root, so engine, UI, data and CSS files can all be checked.
  - The checker copies `index.html`, `js/`, `css/`, `data/` and `sections/` to a temp folder and first runs the tests on the unchanged copy; they must pass. Then, for each entry, it makes the change in a fresh copy and runs every laser test.
  - Outcomes: caught, MISSED (add a test), TIMED OUT (bound the test's work, e.g. `maxSteps`; a `{ timeout }` cannot stop a synchronous test), ERROR (the text isn't found exactly once, the change isn't valid JS/JSON, or the path is outside the copy).
  - The replacement is inserted literally, so `$&` and `$$` aren't special.
  - 28 entries at the end of stage 1b, all caught. A full run then took about 4 s; after stage 2 (70 entries) about 22 s. After stage 3 (94 entries) it took 44 s one at a time, so it now checks half the processor cores' worth of mistakes at once, each in its own copy: about 17 s on a 10-core machine; after stage 4 (143 entries) about 28 s; after stage 5 (214 entries) about 55 s. By stage 7c (575 entries) a run took 25 minutes, so it now runs the test files one after another for each mistake and stops at the first that fails, files named after the changed file first, then the others quickest first, one mistake per core less one: about 2.5 minutes, with the same verdicts (stage 7c).
- `tests/laser/mutation-check.test.js` tests the checker itself on one small test file (to keep `node --test` fast):
  - an unchanged copy passes;
  - a harmless change is not caught;
  - a real mistake is caught;
  - an endless loop is reported as timed out;
  - six kinds of broken entry are reported as errors.
  - On its first run it found a real bug in the checker. Inside `node --test`, child processes get `NODE_TEST_CONTEXT`, and a nested `node --test` that inherits it doesn't report failure through its exit code. The checker now removes that variable.
- Review fixes, beyond the checker itself:
  - a full §5.1 table test: every field of every medium, typed again in the table's units;
  - a test for every unit factor;
  - the spectrum functions refuse Infinity, non-numbers and bad degeneracies;
  - the engine-rules check ignores words inside strings ("Brewster window").

---

## Doc problems found in the pre-audit

These numbers were recomputed in Node and match the doc:
- He-Ne g_th 0.0504 m⁻¹; ruby g_th 3.466 m⁻¹ and ΔN_th 1.39×10¹⁸ cm⁻³;
- He-Ne τ_c 66.2 ns and Δν_c 2.41 MHz;
- free spectral range 500 MHz / 260 MHz / 125 GHz;
- ruby spike period 17.2 µs, damping time 2 ms;
- η_E 0.9405 and Δτ_p 15.65 ns;
- confocal w₀ 0.317 mm and θ 2.18′;
- Fan–Byer threshold 0.133 W; thermal lens 1.08 m;
- Brewster R_s 0.148, 0.85⁸ = 0.27, ruby end face 7.58 %, ruby internal Brewster angle 29.6°;
- CS₂ self-focusing 16.8 kW and 95.6 cm; silica P_cr 4.3 MW;
- §8.8: 1.94×10⁵ V/cm and 0.033 atm; at the focus 2.92×10⁸ V/cm and 7.4×10⁴ atm;
- T_eff 3.6×10¹⁶ K.

Problems to handle in the named stage:

| # | Problem | Fix | Stage |
|---|---|---|---|
| D1 | **Confocal resonator (g₁ = g₂ = 0) is 0/0 in every closed form of §7.2** (w₀², w₁², z₁), and its round-trip matrix is −I, so the ABCD method of §7.3 is also undetermined. It is the main test case | Use the symmetric formula w₀² = (λL/π)·√((1+g)/(4(1−g))), which is regular at g = 0. Test confocal against √(λL/2π), and test continuity at g = ±0.01 | 10a ✅ (`optics.js`: the symmetric form when g₁ = g₂; `optics.test.js`) |
| D2 | §4.1 says for three levels "N → ΔN in the second equation". The spontaneous seed β·V_a·ΔN/τ then goes **negative** while ΔN < 0 (ruby before half inversion), giving a negative photon number and a NaN log | The seed uses N₂ = (N_t + ΔN)/2. Fix the doc sentence | 7 |
| D3 | §4.2 says He-Ne "shows no oscillations at all". At x = 2 it is weakly underdamped (ω_R = 1.23×10⁷ s⁻¹ > x/2τ = 1.0×10⁷ s⁻¹) and dies out within about one oscillation | Done in stage 4: the doc now gives the exact damped frequency (0.72/τ) and the factor e^8.8 lost per period; `rates.test.js` checks ω·t_damp < 1 for He-Ne | 4 |
| D4 | Ruby N_t is 1.6×10¹⁹ cm⁻³ in §3.1 but "~10¹⁹" in §5.2 and §12 | Use 1.6×10¹⁹ (the standard value for 0.05 wt % Cr₂O₃, and the one §3.1's 9 % needs); fix §5.2 | 7 (doc fix in 2) |
| D5 | Diode free spectral range uses the group index n_g ≈ 4 (§3.3), but the media table's n = 3.6 is the phase index | Add `ng` to the diode entry; the cavity functions take the index explicitly | 2 |
| D6 | §5.1 media numbers and the Sellmeier/KDP coefficients were "not checked against printed sources" | Web-verify the values each stage needs before it uses them; record sources in the doc | 7, 11, 13 |
| D7 | The §12 ruby "1–2 J, 10⁻⁸ s" depends on parameters the doc doesn't state | Write the assumptions into the preset; test order of magnitude only; **never tune parameters just to pass** — report if it can't be reached | 8 |
| D8 | Several formulas silently need the three-level factor 2 (Rigrod, E_out, F_sat) | Always take `I_sat` from `media.get()`; the factor 2 appears in a test for every such formula | 2, 8 |
| D9 | Sign conventions: mirror radius positive = concave (§7.1), lens surface radius positive = centre to the right (§8.1), mirror as a lens f = R/2 | Write one convention in the `optics.js` header; test a plane mirror (R = ∞), a concave mirror and a convex mirror | 10a ✅ for mirrors (the header of `optics.js`); lenses in 11 |
| D11 | **Loss near and on the stability edges is not in the doc.** §7.2 gives w → ∞ at g₁g₂ = 0 or 1 (flat-flat, hemispherical, concentric), and §7.6 has only the numerical Fox–Li. A rod's flat-flat cavity really lases with a small diffraction loss (N_F ~ 100) | Research (Siegman, *Lasers*, ch. 19–22; Li 1965 and Vainshtein for the plane-parallel loss against N_F) and write a closed form, or a fast 1D Fox–Li run when a mirror slider is let go, into a new §7.7. Test: the loss is continuous across each edge, and a flat-flat rod lases | 10a ✅ (§7.7: Vainshtein and the min interpolation; no Fox–Li run) |
| D12 | **Unstable mirrors' loss is not in the doc** (§7.1 only says "rays walk off") | The geometric magnification M = \|m\| + √(m² − 1) and the round-trip loss 1 − 1/M² for round mirrors (Siegman, Proc. IEEE 53, 277 (1965); *Lasers* ch. 22): research, check and write into §7.7 | 10a ✅ (§7.7) |
| D13 | **Each laser's real mirrors are not in the doc** (He-Ne §5.5: only "spherical multilayer mirrors") | Research the usual radii and which mirror is flat for each bench, and record them with sources in §5 | 10a ✅ (§5.9) |
| D14 | **What each medium and pump looks like is not in the doc** (colours, rods, tubes, cells, diode modules) | Research with sources into a new §5.10 | 10c |
| D15 | The engine's gain is plane-wave over `area`: the mode's size does not change the gain | Decide in 10a's scope card: mirrors change only the losses (simple, the default), or also the gain (Fan–Byer's mode size for the diode bench, §6.3). Write the choice down either way | 10a ✅ (losses only) |
| D10 | A Gaussian beam in a medium: §7.3 replaces a slab by l/n, while §8.4 puts n into z_R. Mixing the two is off by a factor of n | Use the reduced (l/n) convention everywhere; test slab ≡ free space l/n | 10a ✅ (`slab`, `reducedLength`; `optics.test.js`) |

**Site trap found while reading `js/router.js`.** After the first page loads, the router renders **every** page in the background, which fires `section:ready` for `laser` while it's hidden. (A second trap was found in stage 5's browser check: the router could fire the first `section:ready` before the scripts after it had run. It now waits for `DOMContentLoaded`.) It also re-renders every loaded page on each language switch. So `page.js` must:
- tear down the previous build (a generation counter like `js/labs.js`'s is only needed if the build waits for something; in stage 5 it does not);
- remove its `window` listeners;
- do no heavy computation when the section is built;
- start the loop only while the page is visible (`IntersectionObserver`).

---

## Stages

Each stage follows the recipe. Below: what's specific to it.

### Stage 2 — Static cavity and spectrum (`cavity.js`, `spectrum.js`) ✅

**Scope card.** Every value in SI. Doc sections refer to `docs/laser-physics.md`.

Calling convention (decided in the review, below): a function with one input takes it as it is; a function with more than one takes **one object of code-named values**, so two numbers can never be swapped. Every input is checked by the shared `check.js`: a missing or impossible value throws an error that starts with the function the caller called, and so does a name the function does not use.

`spectrum.js`:

| Function | Inputs | Output | Doc |
|---|---|---|---|
| `lorentzian({ nu, nu0, dnu })` | Hz, Hz, FWHM Hz | ĝ_L, 1/Hz | §1 |
| `gaussian({ nu, nu0, dnuD })` | Hz, Hz, FWHM Hz | ĝ_G, 1/Hz | §1 |
| `lineshape({ broadening, nu, nu0, dnu })` | `"homogeneous"` → Lorentzian, `"inhomogeneous"` → Gaussian | 1/Hz | §1 |
| `relativeGain({ broadening, nu, nu0, dnu })` | as above | g₀(ν)/g₀(ν₀): 1 at the centre, ½ at ν₀ ± Δν/2 | §1, §3.3 |
| `naturalWidth(tau)` | s | 1/(2πτ), Hz | §1 |
| `dopplerWidth({ nu0, T, M })` | Hz, K, kg | Δν_D, Hz | §1 |
| `crossSection({ A21, lam0, n, lineshape })` | s⁻¹, m, —, 1/Hz | σ, m² | §1 |
| `inversion({ N1, N2, deg1, deg2 })` | m⁻³, m⁻³, —, — | ΔN = N₂ − (g₂/g₁)N₁, m⁻³ | §1, symbol table |
| `gainCoefficient({ sigma, dN })` | m², m⁻³ | g, m⁻¹ (negative = absorbs) | §1 |
| `saturatedGain({ broadening, g0, I, I_sat })` | —, m⁻¹, W/m², W/m² | g, m⁻¹ | §1 |
| `oscillatingBandwidth({ broadening, dnu, x })` | —, Hz, — | Δν_osc, Hz; 0 for x ≤ 1 | §3.3 |
| `modeComb({ nuLow, nuHigh, fsr })` | Hz, Hz, Hz | ascending q·Δν_FSR (q ≥ 1) inside [nuLow, nuHigh], edges included; refuses more than 100 000 lines | §3.3 |

The stage-1 functions follow the same convention: `stimulatedToSpontaneous({ lam, T })`, `boltzmannRatio({ lam, T, deg1, deg2 })` (degeneracies now required), `units.dnuFromDlam({ dlam, lam })`, `units.dlamFromDnu({ dnu, lam })`, `units.n2FromEsu({ n2esu, n0 })`; one-input functions are unchanged.

`cavity.js`:

| Function | Inputs | Output | Doc |
|---|---|---|---|
| `effectiveLength({ L, l_g, nGroup })` | m, m, — (`media.get(id).nGroup`: for the diode 4, not n = 3.6) | L_e = L + (n_g − 1)l, m | §3.2 |
| `singlePassLoss({ refl1, refl2, alpha_i, l_g })` | —, —, m⁻¹, m | γ = αl + ½ln(1/(R₁R₂)); a lossless cavity throws | §3.2 |
| `thresholdGain({ refl1, refl2, alpha_i, l_g })` | same | g_th = γ/l, m⁻¹ | §3.1 |
| `thresholdInversion({ gth, sigma })` | m⁻¹, m² | ΔN_th, m⁻³ | §3.1 |
| `photonLifetime({ L_e, gamma })` | m, — | τ_c = L_e/(cγ), s | §3.2 |
| `qFactor({ nu, tau_c })` | Hz, s | Q = 2πντ_c | §3.2 |
| `coldLinewidth(tau_c)` | s | Δν_c = 1/(2πτ_c), Hz | §3.2 |
| `freeSpectralRange(L_e)` | m | c/(2L_e), Hz (as a wavelength: `units.dlamFromDnu`) | §3.3 |
| `finesse({ refl1, refl2 })` | —, — | F of the mirrors only | §3.4 |
| `modeCount({ bandwidth, fsr })` | Hz, Hz | N_modes ≈ bandwidth/Δν_FSR | §3.3 |
| `rigrodLowGain({ g0, l_g, T_oc, L_i, I_sat, area })` | m⁻¹, m, —, —, W/m², m² | P_out, W; 0 below threshold | §3.6 |
| `rigrodExact({ g0, l_g, refl1, refl2, I_sat, area })` | as `rigrodLowGain`, mirrors instead of T and L_i; α = 0 | P_out, W; 0 below threshold | §3.6 |
| `optimumCoupler({ g0, l_g, L_i })` | m⁻¹, m, — | T_opt; 0 when 2g₀l ≤ L_i; throws for L_i = 0 (no optimum) and when the formula asks for T ≥ 1 (gain too high for it) | §3.6 |
| `faceReflectivity(n)` | — | ((n − 1)/(n + 1))², normal incidence from air | §9.1, §12 |

`check.js` (new, loaded first): `params`, `finite`, `positive`, `atLeast`, `between`, `reflectivity`, `broadening`, `fail`.

`media.js`: a new field `ng` (group index; 4 for the diode, null = same as n for the rest), and a derived `nGroup` in `get()` (D5).

**Test values** (recomputed in Node during the audit; doc value → computed):

| Check | Doc | Computed | Tolerance |
|---|---|---|---|
| He-Ne g_th (R 0.99/0.98, l 0.3 m) | ≈ 0.05 m⁻¹ | 0.05042 | ±0.005 |
| He-Ne τ_c, Δν_c, Q (L 0.3 m) | ≈ 66 ns, 2.4 MHz, 2.0×10⁸ | 66.15 ns, 2.406 MHz, 1.969×10⁸ | half a unit in the last digit |
| He-Ne FSR, Δλ | 500 MHz, λ²/2L | 499.65 MHz, 0.6674 pm | ±1 %; Δλ half a unit of 0.667 pm |
| Ruby g_th, ΔN_th (R 1/0.5, l 0.1 m) | ≈ 3.5 m⁻¹, 1.4×10¹⁸ cm⁻³, ~9 % of N_t | 3.466, 1.386×10¹⁸, 8.7 % | half a unit; [8.5 %, 9.5 %] |
| Ruby L_e, FSR (10 cm rod, 0.5 m) | 0.58 m, 260 MHz | 0.576 m, 260.2 MHz | half a unit |
| Diode L_e, FSR (300 µm, n_g 4) | 1.2 mm, ~125 GHz | 1.2 mm, 124.9 GHz | half a unit |
| Modes under the gain curve | He-Ne ~3, ruby ~10³, diode ~10² | 3.0, 1268, 80 | [2.5, 3.5]; half a decade |
| Ne Doppler width (20 u, 400 K) | ≈ 1.5 GHz | 1.5175 GHz | ±0.05 GHz |
| ĝ_G(ν₀)·Δν_D | 0.939 | 2√(ln2/π) = 0.93944 | exact |
| Ruby σ from A (Lorentzian peak) | ≈ 4×10⁻²⁴ m² | 3.98×10⁻²⁴ | ±0.5×10⁻²⁴ |
| Ruby end face | 7.6 % | 7.582 % | ±0.05 % |
| Gain at I = I_sat | — | g₀/2 hom., g₀/√2 inhom. | exact |
| Exact Rigrod | — | equals a numerical two-way integration through the rod (in the test file) to < 1e-6 | |
| Exact → low-gain Rigrod (R₁ = 1, L_i = 0) | Section 3.6, §12 | difference 8.5×10⁻⁶ at T = 10⁻³, shrinking as T² | |
| T_opt (g₀l = 0.03, L_i = 0.02) | — | 0.014641 = argmax of a scan of P_out(T) | scan step 10⁻⁶ |

Also: lineshapes integrate to 1 (the Lorentzian against its exact ±X integral (2/π)·atan(2X/Δν)); `relativeGain` × x = 1 at the edges of `oscillatingBandwidth`; γ ≈ (T + L_i)/2 for small losses; FSR/F ≈ Δν_c for small losses; Boltzmann populations (stage 1) give negative gain; every input checked; frozen inputs.

**Decisions:**
- Doc fixes: τ_c ≈ 66 ns (the doc rounded γ before dividing); Q ≈ 2.0×10⁸ added; He-Ne "2–3" modes → "~3" (1.5 GHz / 500 MHz = 3.0); L_e uses the group index; Rigrod: γ ≈ (T + L_i)/2, zero below threshold, and a caveat that both formulas assume a homogeneous line (He-Ne and CO₂ are Doppler-broadened, so for them it is an estimate); ruby N_t note in §5.2 (D4); new code names in the symbol table (`N_t`, `ng`, `A21`, `nu0`, `dnu`, `dnuD`, `M`, `L_i`, `x`, `Q`, `dnu_c`, `fsr`, `finesse`, `area`, `P_out`).
- Below threshold, the bandwidth and Rigrod functions return 0, never NaN or a negative power. A cavity with no loss at all (R₁R₂ = 1, or T + L_i = 0) throws: its finesse, τ_c and power are infinite.
- The pump ratio x = g₀/g_th is one division, so it has no function.

**Traps:** mixing single-pass γ with round-trip T and L_i (the names say which, and a test checks γ ≈ (T + L_i)/2); √ or log of a negative number below threshold; D5; D8 (ruby's I_sat from `media.get()` already has the factor 2).

**Breaks:** drop the ½ in γ; L instead of L_e; c/L instead of c/2L; τ_c from the round-trip time; Gaussian without √(ln2/π); Lorentzian Δν/π; Doppler without ln 2; inhomogeneous saturation without √; Lorentzian band without √; no zero below threshold (band and Rigrod); exact Rigrod without √R₁; T_opt sign; σ with n instead of n²; finesse with the wrong power; Q without 2π; face reflectivity without the square; degeneracies upside down; mode comb off by one line; Gaussian `relativeGain` without 4 ln 2; reflectivity > 1 accepted; n instead of n_g.

**Review outcome** (`/code-review`, 15 findings; 14 fixed, 1 kept):
- Mode comb: a line exactly on the window edge could be lost to rounding in q·fsr/fsr (now one extra q on each side, filtered); the line limit was off by one when q was clamped to start at 1; mode numbers past 2⁵³ made the loop endless (now refused); no mode at 0 Hz.
- `optimumCoupler` could ask for more than 100 % (now at most 1), and answered 0 both for "cannot start" and for L_i = 0 (L_i = 0 now throws: there is no best coupler then).
- `effectiveLength` refused a medium filling the cavity after float rounding (0.7 − 0.4 < 0.3); its index input is now named `nGroup`, so the phase index cannot be passed by mistake.
- A lossless cavity now throws where γ is computed, not one function later with a misleading message.
- `rigrodExact` and `finesse` refuse an internal loss they would otherwise ignore.
- `nGroup` falls back to n when `ng` is missing, not only when it is null.
- One calling convention and one input checker (`check.js`) for the whole engine, so errors read the same everywhere and name the function that was called (`lineshape` used to report `lorentzian`).
- `fsrWavelength` removed: `units.dlamFromDnu` already does it.
- Plan marked the stage done before the review: fixed (marked done only now).
- Kept: `coldLinewidth` repeats the one-line 1/(2πτ) of `spectrum.naturalWidth`. Calling across files would make its errors name a function the caller never called, and the name says which lifetime it is.
- New mutations for every fix; two old entries needed new text, and one became harmless (the comb loop now runs one q past the window on purpose) and was replaced.

**Second review** (the fixes above rewrote a lot, so `/code-review` ran again; 15 findings; 13 fixed, 1 partly, 1 declined):
- Mode comb: the 2⁵³ guard missed the extra q past the window (endless loop at q = 2⁵³ − 1); the 100 000 limit did not count the edge lines. The limit is now counted on the lines actually returned.
- `check.params` takes the list of names each function reads and refuses any other: one rule instead of hand-written guards in two functions (`finesse` still ignored `L_i`; `rigrodLowGain` ignored `alpha_i`; `thresholdGain` ignored `L_i`), and typos (`alpha`) are caught too.
- `optimumCoupler` returned 1 for very high gain, which as a mirror is R₂ = 0 and is refused by every other function; it now throws there (the low-gain formula does not hold). It now answers 0 ("cannot start") before refusing L_i = 0, as the doc says.
- γ computed as −½(ln R₁ + ln R₂): the product R₁R₂ underflowed to 0 for tiny reflectivities. Partly: other overflows (g₀ = 10³⁰⁸) are not checked, since every result would need it and the bench's sliders keep inputs physical.
- Error messages survived values that cannot become text (`Symbol`, objects without a prototype).
- Wavenumber conversions accept 0 and negative values again (level differences).
- Symbol table: `nGroup` and n_g in L_e; `check.js` header example fixed; `media.js` header and the plan's file count updated.
- `relativeGain` reuses the two lineshape formulas instead of a second copy.
- Declined: "named values cost too much per pixel". Measured outside Node's `vm` sandbox, a checked `relativeGain` call takes 44 ns, so a 1000-px gain curve at 60 fps costs 0.26 % of one core (inside the test sandbox, where global lookups are slow, 820 ns). If a later stage calls a spectrum function inside the ODE right-hand side, measure again.

### Stage 3 — ODE solver (`ode.js`) ✅

**Scope card.** `ode.js` knows nothing about lasers: t is in whatever unit f uses (the laser equations of §11.2 use t′ = t/τ). Sources: J. R. Dormand and P. J. Prince, "A family of embedded Runge–Kutta formulae", *J. Comput. Appl. Math.* 6 (1980) 19–26; E. Hairer, S. P. Nørsett and G. Wanner, *Solving Ordinary Differential Equations I*, 2nd ed. (Springer, 1993), §II.4 (step control, error norm, first step) and §II.5 (the Dormand–Prince 5(4) coefficients).

| Function | Inputs | Output |
|---|---|---|
| `ode.dopri5({ f, t0, state0, t1, rtol, atol, h0, hMax, maxSteps })` | `f(t, state)` → array of derivatives, one per entry of `state`; `t0 < t1`; `state0` a non-empty array of finite numbers. Optional: `rtol` (default 10⁻⁶, from 0 to 1), `atol` (default 10⁻⁹, > 0), `h0` first step (default: Hairer's starting-step algorithm), `hMax` (leave it out for no limit, `Infinity` is refused; a default of t1 − t0 would cap every step at the frame's length), `maxSteps` (default 100 000, a whole number ≥ 1; only a safety limit, see the review) | `{ t, state, reachedEnd, hNext, accepted, rejected, evaluations }`: `t = t1` exactly and `reachedEnd: true`, or, when `maxSteps` attempts are used up first, the last accepted point with `reachedEnd: false`. `hNext` is the step to pass as `h0` to continue |
| `ode.tableau` | — | the coefficients `{ c, a, b, bStar }` the solver itself loops over, deep-frozen |

`check.js` gets three more checks: `func`, `finiteArray` (a non-empty array of finite numbers), `integerAtLeast`; and `describe`, made public for messages written outside the checks (strings in quotes, arrays by their length).

**Test values** (measured with a prototype during the audit; the real file gives the same numbers):

| Check | Expected | Measured | Bound |
|---|---|---|---|
| Order conditions: all 17 up to order 5 for b, all 8 up to order 4 for b* (and b* misses at least one of order 5, or the error estimate would be 0) | exact fractions | — | 1e-14 |
| c_i = Σ_j a_ij; Σ b = Σ b* = 1; the last row of a equals b (what makes "first same as last" correct) | exact | — | 1e-15; equal |
| y′ = t⁴ on [0, 1] in one step | 1/5 (the quadrature conditions up to c⁴; also checks the stage times t + c_i·h) | — | 1e-15 |
| Fixed step (h0 = hMax, tolerances huge), oscillator over one period, h = T/64 → T/128 | error ratio 2⁵ = 32 | 32.1 | [30, 34] |
| Decay y′ = −y to t = 10, and oscillator for 10 periods, tol 10⁻⁸ | error ∝ tol | 6.6×tol, 26×tol | ≤ 100×tol; 10⁴ times smaller tol → ≥ 10³ times smaller error |
| Smooth problem (oscillator, tol 10⁻⁶) | few rejected steps | 0 of 230 (without the 0.9 safety factor: 654 of 210) | rejected ≤ 5 % of accepted |
| Stiff y′ = −10⁴(y − cos t), t ∈ [0, 1] | finishes, accurate; about k/3.3 steps (stability limit of an explicit method, \|hλ\| ≲ 3.3) | 3052 accepted + 382 rejected, rel. error 3×10⁻⁷ | accepted ≥ 0.8·k/3.3; attempts ≤ 1.5·k/3.3; rel. error ≤ 10⁻⁵ |
| Evaluations | 1 + (1 for the first-step guess) + 6 per attempt | — | exact |
| One step done by hand in the test from the table (stages, b, b − b*, error norm): accepted and rejected | new state; next step h·0.9·err^(−1/5) | — | 1e-14; 1e-12 |
| After a rejected step, the retried step equals a fresh step of the same length from the same point | bit for bit | — | equal |

Also: the last step lands exactly on t1; running out of `maxSteps` gives a correct partial result, and continuing from it with `h0 = hNext` (no rejected step in between) reaches the same answer bit for bit; a last step cut short to land on t1 does not shrink `hNext`; 65 components at once; `f` that changes its input or returns the same array every time cannot corrupt the solver; frozen inputs; a blow-up (y′ = y²) and a NaN partway through throw quickly with t in the message; every input checked.

**Decisions:**
- Named inputs, like every engine function since stage 2 (the plan had `dopri5(f, t0, y0, t1, options)`). The state is called `state`, not `y`, because y is the inversion of §11.2 and stage 4 integrates `[y, s]`.
- `hNext` is returned so the next frame continues with a good step instead of guessing again. A last step shortened to land on t1 says nothing against the longer step that was planned, so it does not shrink `hNext`.
- `maxSteps` counts every attempt, accepted or rejected: each costs the same 6 evaluations, and the budget is about cost.
- Non-finite values: if `f(t0, state0)` is not finite the call throws at once (no smaller step can fix the starting point). A trial step with a non-finite value is rejected and the step shrinks ×0.2, because a too-long step can overflow. A step below 16·ε_machine·max(\|t\|, \|t1\|) throws: the solution blows up, f gives NaN there, or the tolerances are tighter than the arithmetic allows.
- `f` receives a copy of the state and its result is copied: an `f` that changes its input or reuses one output array cannot corrupt the stages.
- Step control as in Hairer §II.4: error norm √(mean((e_i/sk_i)²)) with sk_i = atol + rtol·max(\|y_i\|, \|y_new,i\|), new step = old × 0.9·err^(−1/5) limited to 0.2×–5×, and no growth right after a rejection. No "last step up to 1 % longer" rule (Hairer has one): a sliver of a last step costs one step and, by the `hNext` rule, does not shrink the next frame's step; the extra rule would have needed its own cap against `hMax`.
- No dense output (values between steps): a caller that needs points inside a frame splits the frame into shorter calls, at the cost of one evaluation per call.
- t1 must be later than t0: no backward integration, and a paused frame does not call the solver.

**Traps:**
- NaN makes every step "rejected" and the solver loops until `maxSteps` (handled above).
- A new state that overflows to Infinity has an error scale of Infinity, so its error looks like 0: the state itself must be checked (found in the review).
- Step-size underflow: throw. A floor of 16·ε·\|t\| alone is 0 at t = 0, so the floor also uses \|t1\|.
- FSAL reuse: after a rejected step the first derivative is the old one, not the rejected step's last one.
- Arrays shared between steps or with `f`.
- Coefficients copied from Hairer's table and checked by the order-condition tests.

**Doc audit (§11.2, §11.3).** §11.3 said the adaptive step "grows automatically between pulses". It doesn't while the photon number sits at its spontaneous-emission level: there ∂ṡ/∂s = −(1 − y)/ε, so an explicit method's step stays below about 3.3ε/(1 − y). Measured with the prototype: ε = 10⁻⁶, x = 0.5, 3τ of pumping takes about 6×10⁵ steps. Fixed in the doc; stage 7 measures whether a ruby flash fits the frame budget, as already planned.

**Breaks** (24, all caught): change one coefficient; a wrong b* weight (error estimate); stage times t + h instead of t + c_i·h; drop the safety factor; error exponent 1/4 instead of 1/5; growth limit 10× and shrink limit 0.1×; don't clamp the last step; FSAL after a rejection; recompute k1 every step; hNext from the shortened last step; budget check off by one; growth right after a rejection; no growth ever again after one rejection; NaN error → NaN step; NaN at the start not reported; underflow floor without \|t1\|; f gets the solver's own array; no copy of f's result; first-step guess probing past t1; error scale from the old state only; a zero-length interval accepted; `integerAtLeast` accepting fractions; `finiteArray` accepting an empty array.

**Also in this stage:** the mutation check took 44 s one at a time, past the 30 s the stage-1b notes set, so `tests/laser/mutation-check.js` now runs half the processor cores' worth of mistakes at once (17 s). Its own tests became `async`, and a new one checks that results come back in list order.

**Review outcome** (`/code-review`, 15 findings: 10 fixed, 3 fixed in the docs, 2 declined):
- A step whose new state overflowed to Infinity was accepted (its error scale was Infinity, so its error looked like 0) and could return `state: [Infinity]` with `reachedEnd: true`. Now any value that is not finite makes the error Infinity: the step is retried 5× shorter. A NaN only in f at the new state is tested by an f that returns NaN on its 7th call.
- On the last step, t + c_i·h could round one unit past t1, so f was called after t1 (an f that switches at t1 would see the other side). Stage times and the first-step probe are now kept at most t1, tested with the review's numbers.
- The first-step guess was untested: now checked against Hairer's algorithm written out in the test, in four cases that each depend on a different part. Its absolute fallback (1e-6) was below what t can resolve far from t = 0 (t0 = 10¹¹ threw "the step size fell below"); the guess is now at least that floor. A given `h0` longer than `hMax` was untested.
- The parallel checker had lost the 64 MB output limit of `spawnSync`; it is back (`maxOutput`), with a test.
- `err === 0` in the step factor was dead code (removed); `kindOf()` repeated `check.js` and wrote "a undefined" (now `check.describe`, public); the k₁ check repeated `check.finiteArray` (now uses it); the error sum built two arrays per step only to add them up (now summed in the loop).
- Docs: `maxSteps` was called "one animation frame's budget", but 100 000 steps take about 65 ms; it is now a safety limit, and stage 6 must pass a measured budget. "Carrying on repeats the very same steps" is not true right after a rejected step (a new call may let the next step grow sooner); the docs say so. `hMax: Infinity` is refused: leave it out for no limit. The plan still described a "1 % longer last step" rule the code does not have (removed, reason above).
- Declined: passing on the step from a cut-short last step's own error (the reviewer's fix for a frame whose short step has err near 1). Measured: on a very short step the error is mostly rounding, and the rule shrank `hNext` 1700× (a frame 10⁻⁶ of the step at rtol 10⁻⁶; 0.15× even at 10⁻³), which is the common frame-by-frame case. The case it fixes costs one rejected try, and only when the problem changes suddenly inside a frame. Kept as a mutation, so the test that measures it stays.
- Declined: dropping the two array copies around each call of f. Measured outside the sandbox: they cost 18 % of a step for 2 components and 5 % for 65. They are what makes "an f that changes its input or reuses its output array cannot corrupt the solver" true, which `rates.js` and later f's rely on without having to know it.
- 12 more mutations for these fixes (106 in all, all caught; about 19 s).

### Stage 4 — Four-level rate equations (`rates.js`) ✅

**Scope card.** Physics: `docs/laser-physics.md` §4.1, §4.2, §11.2, §11.3. Everything in `LaserEngine.rates.fourLevel`; three levels come in stage 7.

| Function | Inputs | Output | Doc |
|---|---|---|---|
| `scales({ sigma, tau, nu, l_g, area, L_e, refl1, refl2, alpha_i })` | m², s, Hz, m, m², m, —, —, m⁻¹ (`L_e` ≥ `l_g`) | `{ gamma, tau_c, N_c, R_c, V, V_a, B, eps, pOnePhoton, sOnePhoton, phiPerP, powerPerP }`: everything that turns the dimensionless state into physics. N = y·N_c, φ = p·phiPerP, P_out = p·powerPerP, t = t′·τ; one photon is p = Bτ | §4.1, §11.2 |
| `derivatives({ x, eps, beta })` | —, —, — (x ≥ 0, ε > 0, β from 0 to 1) | f(t′, [y, s]) → [dy/dt′, ds/dt′], for `ode.dopri5`; no checks inside f (hot loop) | §11.2, §11.3 |
| `steadyState({ x, beta })` | —, — | `{ y, p }`, exact with the seed: p = ((x − 1) + √((x − 1)² + 4βx))/2, y = x/(1 + p) | §11.2 |
| `relaxation({ x, tau, tau_c })` | —, s, s (x > 1, else it throws: no oscillation below threshold) | `{ omegaR, omegaDamped, t_damp }`: √((x − 1)/(ττ_c)) rad/s; √(ω_R² − (x/2τ)²), or 0 if overdamped; 2τ/x s | §4.2 |
| `liftToSeed({ state, beta })` (added in review) | [y, s], — | a new [y, s] with s ≥ ln(β·max(y, 10⁻¹²)); unchanged when β = 0 or s is already there. The bench calls it before every solver call | §11.3 |

**Test values** (measured with a prototype on the real `ode.js`):

| Check | Expected | Measured | Bound |
|---|---|---|---|
| N_c·σ·l = γ; N_c, γ, τ_c equal `cavity.thresholdInversion`, `singlePassLoss`, `photonLifetime` | identity | — | 1e-12 |
| `powerPerP` = (γ₂/2)·A·I_sat with I_sat from `media.get("nd-yag")`, and p·`powerPerP` at p = x − 1 = §4.1's (cγ₂/2L_e)·hν·φ₀, φ₀ = τ_cV_a(R_p − R_c) | identity | — | 1e-12 |
| Small Nd:YAG laser (A = 1 mm², l = 5 cm, L = 0.3 m, R₂ = 0.95): ε, Bτ, P_out at x = 2 | — | 1.928×10⁻⁴, 5.66×10⁻¹², 0.74 W | half a unit |
| Steady P_out vs low-gain Rigrod (R₁ = 1, L_i = 0, small T, same x) | relative difference T/(2(x − 1)) (derived in the audit) | — | 2 % of that difference, T = 10⁻³ and 10⁻⁴ |
| §12: x = 2 from one photon (Nd:YAG ε) | y → 1, p → 1 | rel. error 1×10⁻⁸ at t′ = 20 | 10⁻⁶ |
| x = 0.5: p stays at the seed level | y → x, p → `steadyState` (≈ β) | 1×10⁻⁸ | 10⁻⁶ |
| β = 0 from one photon (x = 2) | s falls to about −1600 and comes back; lasing still starts | p → 1 within 6×10⁻⁷ | 10⁻⁵ |
| Small oscillation, ruby numbers (τ 3 ms, τ_c 5 ns, x = 3), kick δy = 10⁻³·√(ε(x − 1)) | period 2π/`omegaDamped` = 17.21 µs (doc "≈ 17 µs") | 1 + 1×10⁻⁶ of theory | 10⁻⁴; doc value ± 0.5 µs; doc ω_R within 5 % (plan) |
| Damping, x = 2, ε = 10⁻³ | rate x/2 per τ (t_damp = 2τ/x) | 1 + 1×10⁻⁴ | 1 % |
| `relaxation`: ruby, He-Ne (τ 100 ns, τ_c 66.15 ns, x = 2) | ruby 17.2 µs, 2 ms, ω·t_damp ≈ 730; He-Ne ω·t_damp = 0.715 (< 1: gone within a radian) | — | half a unit |
| `steadyState` | §12 x = 2 → (1, 1); β = 0 → (min(x, 1), max(x − 1, 0)); f = 0 there; p(x = 1) = √β; x = 0.5, β = 10⁻¹⁵ → p = βx/(1 − x) to 10⁻¹² (no cancellation) | — | 1e-12 |
| Seed where e^(−s) alone overflows (review): β = 10⁻³¹⁰, s = ln(βy) ≈ −714 | ds/dt′ = y/ε | exact | 1e-12 |
| β turned on after a run with β = 0 (review): x = 2, ε = 10⁻³, s ≈ −313 at t′ = 0.5 | the solver gives up without `liftToSeed`; with it, the steady state | 6554 steps | 10⁻⁶ |
| Pump off for 720τ, then back on at x = 2 (review; ε = 0.1 to keep it short) | s follows ln(βy) below −720; back on, the solver gives up without `liftToSeed` and settles with it | s − ln(βy) = 0.06; 855 steps | 0.2; 10⁻⁶ |
| He-Ne kicked by δy = 10⁻⁶ (review, D3): ε = 0.66, x = 2, simulated to t′ = 9 (one period) | the linear solution built from `relaxation`'s ω and t_damp | within 4×10⁻⁶ of the envelope, 99 steps | 10⁻⁴ of the envelope |

Also: f's values at a point by hand; f stays finite at s = −800 with β = 0 (the seed term is skipped, not multiplied by 0); every input checked; a lossless cavity and `L_e < l_g` throw; frozen objects; deep-frozen inputs.

**Decisions:**
- `scales` takes the mirrors and the internal loss, not γ, so γ and the output coupler cannot disagree. It repeats `cavity.js`'s one-line γ = αl − ½(ln R₁ + ln R₂) (calling across files would put the wrong function in error messages, as for `coldLinewidth` in stage 2); a test checks the two stay equal, one loss at a time and all together.
- The seed βy·e^(−s) is computed as one exponential, e^(ln β + ln y − s) (review): e^(−s) alone overflows past s ≈ −709 while the seed is about 1.
- `liftToSeed` (review) raises s to the seed level ln(β·max(y, 10⁻¹²)) before each solver call, because ln p is too stiff to integrate when p ≪ βy. The real photons get there within about τ_c, so the jump skips at most one photon lifetime. The y floor 10⁻¹² was measured: for ε from 10⁻⁶ to 2×10⁻⁴ and x from 1.01 to 50 the solver can start from 10⁻²⁰ but not from 10⁻³⁰.
- Physical ↔ dimensionless conversions are multiplications by the `scales` numbers, not functions (as for x in stage 2).
- `relaxation` returns SI values (the doc's formulas and numbers are in SI) and throws for x ≤ 1, where there is nothing to oscillate around.
- `steadyState` includes the seed exactly, so it is also the below-threshold level the bench can show, and it uses the form without cancellation on each side of x = 1.
- f is built once by `derivatives` (inputs checked there) and does no checks itself: the solver calls it ~10⁵ times a frame.
- Doc: new code names in §0 (`N_c`, `R_p`, `R_c`, `V`, `V_a`, `B`, `beta`, `tPrime`, `y`, `p`, `s`, `eps`, `omegaR`, `t_damp`; B is not the Einstein B, ε not the permittivity or the tilt angle); §4.1 gains P_out = (γ₂/2)·A·I_sat·(x − 1) and its relation to Rigrod; §4.2 gains the exact damped frequency, when an oscillation counts as small, and D3 (He-Ne) is fixed; §11.3 gains the one-photon start and the β = 0 trap.

**Traps:**
- One photon, p = Bτ, as the start: s = ln 0 does not exist.
- **β = 0:** below threshold s falls without limit (to −1600 for Nd:YAG); e^(−s) overflows and 0·∞ = NaN. Found by the prototype: the solver threw "step size fell below" at t′ = 0.15.
- A "small" oscillation in ruby must be tiny: a 1 % kick of y is full spiking (period off by 2×). Found by the prototype.
- Simulated time vs real time: t = t′·τ.
- **Photons far below the seed** (review): with p ≪ βy, ds/dt′ ≈ βy/(εp), and the solver needs steps shorter than floating-point time can hold. It happens when β is turned on after a β = 0 run, and when the pump comes back after about 100τ or more off. Measured: both throw "the step size fell below" at once; both settle after `liftToSeed`.
- **A `{ timeout }` does not stop a synchronous test** (review; checked on Node 24.14: a test that is busy for 2 s with a 300 ms timeout passes). Only `maxSteps` bounds a solver run.

**Breaks** (37, all caught): sign of (y − 1); ε dropped; β·y → β; e^(−s) → e^s in the seed; the seed as β·y·e^(−s) (overflow), and as that with β = 0 (NaN); a seed from y < 0; an error that grows with ε (only the He-Ne run and f's hand values see it); dy without the y·p term's y; γ₂ without ½ in `powerPerP`; −0 W for a perfect mirror; V from l instead of L_e; N_c without l; ε upside down; one photon as B instead of Bτ; no hν in the power; α not multiplied by l; the lossless guard, and only γ = 0 refused; the `l_g ≤ L_e` check, too strict and missing; `steadyState` with the cancelling form below threshold; y = x/p; `relaxation` without (x/2τ)²; t_damp = τ/x; x = 1 accepted; `liftToSeed` doing nothing, lowering s, without the y floor, with a floor of 10⁻⁴⁰, taking a state that is not [y, s]; `check.params` removed from `derivatives`, `steadyState`, `relaxation`, `liftToSeed`; in `cavity.js`, the near-lossless checks of `photonLifetime` and `rigrodLowGain`.

**Also in this stage:** the first mutation run had one TIMED OUT, a wrong error-estimate weight in `ode.js`. `smallOscillation`'s 1200 short solver calls had no step limit, so the broken solver spent 100 000 steps on each. Each call now has `maxSteps: 200` and checks `reachedEnd`.

**Review outcome** (`/code-review`, 13 findings: 11 fixed, 2 declined):
- The seed overflowed for β > 0: with the pump off, y falls, s follows ln(βy) below −709, and e^(−s) became Infinity although the seed was about 1 (the solver gave up near t′ = 700; with β = 10⁻³¹⁰ already by t′ = 0.14). Fixed with the one-exponential form (also the review's design finding); tested by f at β = 10⁻³¹⁰ and by a 720τ pump-off run.
- A state from a β = 0 run could not go on with β > 0 (s ≈ −307: the solver gave up at once). Checking it, I found the same failure when the pump comes back after about 100τ off. Both fixed by `liftToSeed`, both tested with and without it.
- The `{ timeout: 15000 }` on the solver tests did nothing (see Traps). Removed; each solver call now has a `maxSteps` about 1.5× its measured need (it was 200 000, 12× the need), and `integrate()` checks `reachedEnd` on every run (two tests did not). The same false advice was in `CLAUDE.md`, in the mutation checker's TIMED OUT text and in this plan's recipe; all corrected.
- `check.params` in `derivatives`, `steadyState` and `relaxation` was untested (removing it passed every test). Now every function has an unknown-name test and a plain-number test, with a mutation for each.
- `scales` returned τ_c = Infinity for a loss too small to divide by (α = 10⁻³²⁰ with perfect mirrors). It now refuses a τ_c/τ that is not finite. `cavity.js` had the same gap: `photonLifetime` returned Infinity and `rigrodLowGain` NaN; both now refuse it, tested. `finesse` and `rigrodExact` were checked and are safe (their R₁R₂ = 1 test covers it).
- D3 was only checked through `relaxation`'s own formula. Now a He-Ne run (ε = 0.66, every other run has ε ≤ 10⁻³) is compared with the linear solution.
- Docs: "116 oscillations before they die out" counted oscillations per damping time, after which the amplitude has only fallen by e. Now "116 while it falls by e, about 535 to 1 %", in the doc and the test names, and the test checks both numbers. A local `root` in `steadyState` hid the `root` of the file wrapper: renamed `squareRoot`.
- Declined: one `Math.exp` fewer in f (seed = βy/p). Measured on the full x = 2 Nd:YAG run (30 000 calls of f): two exponentials 20.0 ms, exponential and division 20.0 ms, the one-exponential seed 20.9 ms. The saving does not show, and βy/p overflows at the same s as before; the 5 % for the safe form is kept.
- Declined: making `scales` call `cavity.js` (exporting its internal `lossPerPass(where, params)`). That function takes the caller's name first, unlike every other engine function, and would be public only for `rates.js`. The repeated formulas are one line each; the identity test now checks each term of γ on its own (four loss settings instead of two), and mutations break each formula.
- 15 more mutations for these fixes (143 in all, all caught; about 28 s).

### Stage 5 — Page skeleton ✅

**Scope card.** No physics; the page, its lifecycle and the way in from the Labs page. Read first: `js/labs.js` (mount and loop), `js/router.js` (render, prefetch, language switch), `js/content.js`, `css/labs.css` (`.line-art`, `.lab__frame`), `css/site.css` (`.page-head`, `.band`, `.card`), `Instructions/HTML-CLASSES.md`, the hidden routes in `data/site.json`.

| File | What it holds |
|---|---|
| `data/site.json` | hidden route `laser`, label "Լազեր" / "The Laser" |
| `sections/laser.html` | inside `.line-art`: a page head (back link, eyebrow, title, lead, a "being built" note) and the bench band with one canvas `data-laser-canvas="bench"`. No `<header>`/`<footer>` (they inherit the site bar), no `style=`, no `<script>` |
| `data/laser.json` | every word of the page, hy and en: page head, the canvas description, the four part labels |
| `css/laser.css` (linked in `index.html`) | the page and the Labs-page banner `.lab-feature`; theme variables only |
| `js/laser/ui/loop.js` | `LaserUI.loop.create({ canvases, update, running })` → `{ play, pause, isRunning, redraw, destroy }`; `LaserUI.loop.liveCount()`; `LaserUI.loop.PALETTE` (palette name → CSS variable) |
| `js/laser/ui/draw-bench.js` | `LaserUI.bench.layout(w, h)` (pure: where each part goes, in CSS pixels), `LaserUI.bench.draw(view, labels)`, `SIZE` (canvas proportions) and `PARTS` (the labelled parts) |
| `js/laser/page.js` | on `section:ready` for `laser`: tears down the previous build, then builds a paused loop for the bench canvas; nothing else |
| `index.html` | `css/laser.css`; after `js/labs.js`: the engine in `ENGINE_FILES` order, then `js/laser/ui/*.js`, then `js/laser/page.js` |
| `sections/labs.html` + `data/labs.json` | a featured banner above the simulations grid, linking to `?view=laser`; the template of `data-list="featured.items"` (review) |

**The loop** (`loop.js`), the same rules as `js/labs.js`:
- one `requestAnimationFrame` loop for all the page's canvases: each frame calls `update(dt)` once (the simulation, from stage 6), then `draw(view)` for every canvas on screen;
- dt in seconds, 0 on the first frame after a start, capped at 0.05 s;
- it runs only while it is wanted (`play`/`pause`; not at the start for reduced-motion visitors) **and** a canvas is on screen (`IntersectionObserver`); each canvas carries `data-running="true|false"`;
- canvas size from its box's inner width, `clientWidth` (`ResizeObserver` + window `resize`), height = width/aspect clamped to [minHeight, maxHeight], pixels × devicePixelRatio (at most 2) and then `setTransform(dpr, …)`; a box of width 0 (hidden page) keeps the last size;
- `data-running` is `"true"` only on a canvas that is on screen while the loop runs; the next frame is asked for after `update` and the draws, and an error in either pauses the loop (review);
- colours read from the CSS variables in `PALETTE`, read again on `theme:changed`; a paused loop draws once after a resize or a theme change;
- `destroy()` stops the frame, disconnects both observers, removes both window listeners and ignores any callback that still arrives.

**Test values and checks** (Node, with a small fake browser in `tests/laser/fake-browser.js`, which has its own tests):

| Check | Expected |
|---|---|
| `data/laser.json`: every `{ hy, en }` pair | both filled; no other language keys |
| every `data-text`/`data-rich`/`data-alt` key in `sections/laser.html` and in the banner | exists in its JSON, both languages; every `data-ui` key exists in `data/site.json` |
| `sections/laser.html` | no `style=`, `<style`, `<script`, `<header`, `<footer` |
| `css/laser.css`, `js/laser/ui/*.js`, `js/laser/page.js` | no colour literals (hex, `rgb(`, `hsl(`, colour names) |
| every `PALETTE` variable | defined in both `:root` and `:root.theme-light` of `css/style.css` |
| `index.html` | engine in `ENGINE_FILES` order (the skipped test now runs), then every `js/laser/ui/*.js` on disk and only those, then `page.js`; all after `content.js`, `main.js` and `labs.js`; `css/laser.css` linked |
| `data/site.json` | `laser` route present, hidden, both labels |
| loop, built while hidden | no frame requested, `data-running="false"`, nothing drawn |
| loop, canvas comes on screen | a frame is requested; box 600 px inside a 1 px border, aspect 2, dpr 2 → 1200 × 600 pixels, `setTransform(2, 0, 0, 2, 0, 0)` after the resize; first dt 0; a 1 s gap → dt 0.05; `update` once per frame before `draw` |
| height clamp, dpr cap | width/aspect below minHeight → minHeight; dpr 3 → 2 |
| loop, off screen / `pause()` / `play()` / reduced motion | stops / stops / restarts only if on screen / starts paused |
| theme switch | palette read again; a paused loop draws once |
| `destroy()` | frame cancelled, observers disconnected, window listener counts back to before, `liveCount()` back down; a late observer callback does nothing; a second `destroy()` is harmless |
| `bench.layout` for widths 280–1400 px | every part inside the canvas; back mirror < rod < output mirror; the lamp under the rod without touching it; label rows do not overlap; the picture symmetric (added when a break slipped through) |
| `bench.draw` | every colour it sets is a palette value; it writes exactly the four labels, each with a `maxWidth` |
| `page.js`: `section:ready` for `laser` | one loop, paused (nothing moves yet); the canvas gets `aria-label` = `bench.alt` in the current language (else the page title, else `aria-hidden`); the drawn labels are that language's |
| `section:ready` for `laser` again (language switch), twice | still one live loop; the old one destroyed; window listener counts unchanged |
| `section:ready` for another route | nothing built or torn down |
| a `laser` section with no canvas (load error) | the old build torn down, no error |

**Decisions:**
- The page's loop starts paused (`running: false`) until stage 6 has something that moves (review): a still picture redrawn 60 times a second only costs battery. The loop's running path is tested in `loop.test.js`.
- The banner's link target is layout: `href="?view=laser" data-goto="laser"` is written in `sections/labs.html`, like the cards' `data-goto="lab"`; only its words come from `data/labs.json`. (The plan said `data-route="laser.route"`; that would let a typo in a text file break the link.)
- No generation counter in `page.js`: the build is synchronous (the words arrive with `section:ready`), so tearing down the previous build first is enough. One is needed only if a build ever waits for something.
- The bench drawing is still in this stage, but the loop runs it every frame anyway, so the lifecycle is real and testable now; stage 6 adds the Play/Pause button.
- Canvas colours come only from `PALETTE` (no fallback colours as in `labs.js`): a test checks every variable exists in both themes instead.
- The banner's CSS is in `css/laser.css`, so everything the laser adds is in one file under the no-colour-literal test.
- The engine is loaded on every page, like the two other labs (they add 49 KB, 13 KB gzipped; the engine 74 KB, 22 KB gzipped). If that ever matters, load the laser scripts only when `?view=laser` is first opened.

**Traps:**
- The router renders `laser` while it is hidden (prefetch) and again on every language switch: tear down first, do nothing heavy at build time, run only while on screen.
- `<header>`/`<footer>` inside a fragment pick up the site's bar styles: use `<div>`s.
- `<script>` in a fragment never runs; words only through `textContent` / `Content.bind`.
- A hidden section has width 0: keep the last size, do not shrink the canvas to nothing.
- **A box's border is not the canvas's** (found in the browser): measured with `getBoundingClientRect`, `.laser-bench`'s 1 px border made the bitmap 1824 px for a canvas shown 910 px wide at dpr 2, so the picture was drawn slightly squeezed. Measure `clientWidth`. `js/labs.js` had the same bug (fixed in this stage too, checked in the browser on both labs).
- Resizing a canvas resets its context, transform included: `setTransform` must come after the resize. The fake canvas now resets too, so the tests see the order.

**Breaks** (71, all caught): the loop's step cap, restart step, pixel-ratio cap, pixels × dpr, scale, transform order, minimum height, the same-width guard, a hidden page's width 0, the border counted in the width, stopping off screen, pause, reduced motion, each teardown step (both listeners, the observer, a queued frame, the live count, a second destroy), theme colours not re-read or not redrawn, an untrimmed CSS value, update after draw, off-screen canvases drawn, no observer fallback, a dark-only palette colour, an error thrown every frame, a stale `data-running` after an error, one `data-running` for every canvas, listeners registered before the first picture; the bench's colours, label alignment, `maxWidth`, empty labels, the lamp touching the rod, a lopsided picture, the medium label's row, save/restore, the rod off the axis, a partial clear, a tiny font, a part missing from `PARTS`; `page.js`'s teardown, route check, screen-reader name (description and hidden), canvas selector, a failed section keeping the old loop, the language, a running still picture; the words (an empty one, a renamed key, a bare string), the layout (`style=`, `<header>`, a key typo, `role="img"`), CSS colours (hex and a colour name), `index.html` (engine order, `page.js` order, a missing UI file, the stylesheet), the route not hidden, the banner (address, a missing word, its list renamed, an empty Armenian title); the router building the first page before the page scripts listen, never waiting, or never starting when loaded late.

**Browser check** (Claude in Chrome, `http://127.0.0.1:5500`): the banner on the Labs page opens the page; a direct `?view=laser` works; the router's background build stays `data-running="false"` until the page is opened; leaving the page sets it to `"false"`; two language switches leave one live loop with Armenian labels; dark and light themes recolour the bench; at 375 px (an iframe, as the window could not be resized) the bench fits with no sideways scroll, and scrolling it away sets `"false"`; no console errors; the pendulum and refraction labs still work.

**Found in the last browser check, after the review: the router could build the page before `page.js` listened.** With the edited laser files downloaded fresh, the background build of the laser page had no loop at all (`liveCount()` 0, no screen-reader name), and the server log showed `sections/laser.html` fetched before `page.js` arrived. All scripts are plain `<script>` tags at the end of `<body>`, but between two of them the browser still runs other work, so `router.js` (loaded early) finished its fetches and fired `section:ready` while the laser scripts were still downloading. `labs.js`, `news.js` and `home.js` have the same exposure; the laser's ten files after the router made it likely. Fix, in `js/router.js`: build the first page only after `DOMContentLoaded` (which fires after every such script has run) as well as `data/site.json`. Tested in `page.test.js` (the router in a small sandbox: nothing built while the page is being read, built at `DOMContentLoaded`, built at once if loaded late), three breaks, and in the browser again (direct `?view=laser`, the home page, both labs, the background build live and paused).

**Review outcome** (`/code-review`, 15 findings: 14 fixed, 1 declined):
- The loop redrew an unchanging picture 60 times a second (nothing to update, no Pause button). The page now starts its loop paused; it draws on resize and theme change.
- The fake canvas did not reset its context on resize, so the tests could not see `setTransform` placed before the resize (half-size picture on retina). It does now; a test and a break cover the order.
- The no-colour test knew 25 colour names and two colour functions, and only quoted JS strings. It now knows every CSS colour name and colour function and template strings, and ignores theme-variable names (`var(--gold-line)`).
- A draw throwing on the first picture left observers and listeners behind with no way to remove them: the first picture is now drawn before anything is registered. An error in `update` or a draw was thrown again every frame: the loop now pauses on it.
- `js/labs.js` kept the border bug found in this stage: fixed (one line, `frame.clientWidth`), both labs checked in the browser.
- With no description, the canvas was an unnamed image (`role="img"`, empty `aria-label`): now the page title, or `aria-hidden` if there is no word at all.
- Deleting the banner's words left an empty card with "Open the lab →": the banner is now the one item of a list, so deleting it removes the card.
- `data-running` was the same on every canvas: now `"true"` only on a canvas that is on screen. The fake browser ran a frame cancelled earlier in the same batch: fixed, with a test.
- Docs: `HTML-CLASSES.md` said the banner lifts on hover. No card on the site does: `.reveal.is-visible { transform: none }` (`site.css`) has the same specificity as `.card:hover` and comes later. The doc now says what happens; the site-wide CSS is left alone (reported).
- The old load-order test in `engine-rules.test.js` still skipped itself when no engine line was there, and repeated `site-files.test.js`: removed. The part list was written in both `page.js` and `draw-bench.js`: now `LaserUI.bench.PARTS`. A dense one-line `valueAt` in a test became a plain loop.
- Declined: loading the engine only from stage 6 (or lazily). Every page already loads both labs the same way; the engine is 22 KB gzipped; the browser check in this stage proved it loads without errors. Recorded above as an option for later.

### Stage 6 — First playable laser: Nd:YAG, continuous ✅

**Scope card.** Physics: `docs/laser-physics.md` §3.2, §3.6, §4.1, §4.2, §6.3, §11.3, §11.6. One laser this stage: Nd:YAG, pumped by 808 nm diodes, running continuously.

| Function | Inputs | Output | Doc |
|---|---|---|---|
| `LaserEngine.bench.defaultConfig()` | — | a new config object (below) | — |
| `LaserEngine.bench.derive(config)` | config: `medium` (id, four-level with σ), `l_g` m, `area` m², `L` m, `refl1`, `refl2`, `alpha_i` m⁻¹, `pumpPower` W (absorbed), `pumpLam` m, `eta` (share of absorbed pump photons that reach the upper level), `beta` | `{ L_e, gamma, gth, N_c, R_c, tau_c, eps, R_p, x, g0, pumpThreshold, slope, powerPerP, P_out, T_opt, T_best, period, t_damp, … }`, SI | §3.2, §3.6, §4.1, §4.2, §6.3 |
| `LaserEngine.bench.start()` | — | `{ t: 0, N: 0, lnPhi: 0 }`: the pump just switched on, one photon | §11.3 |
| `LaserEngine.bench.advance({ sim, config, seconds, maxSteps })` | sim (s, m⁻³, ln of a photon count), config, s ≥ 0, integer ≥ 1 | `{ sim, reachedEnd, steps }` | §11.2, §11.3 |
| `LaserEngine.bench.RANGES` | — | the sliders' physical ranges: pump 0–20 W, coupler T 0.5–30 % (log) | — |
| `LaserUI.format.si(value, unit, digits)` | number, string, significant digits (3) | "66.2 ns", "2.41 MHz", "0 W", "—" for no number | — |
| `LaserUI.format.number(value, digits)` | | the same without a prefix (for m⁻¹, %, ×) | — |
| `LaserUI.format.fromSlider(range, fraction)`, `toSlider(range, value)` | `{ min, max, log }`, 0–1 | the one place a slider position becomes a value, and back | — |
| `LaserUI.history.create(capacity)` | integer | a ring buffer of `{ t, P, y }` in simulated seconds: `push`, `points(fromTime)`, `clear`, `size` | — |
| `LaserUI.levels.draw(view, picture)`, `LaserUI.plots.draw(view, picture)` | the loop's view; numbers and words | the level diagram with the upper-level bar and the gain/loss gauge; P(t) and y(t) | §11.6 items 1, 2, 4 |

The model (decisions, below): R_p = η·P_pump/(hν_p·V_a), spread evenly over the active volume A·l (the plane-wave §4.1 model); x = R_p/R_c; g₀ = σR_pτ; pumpThreshold = hν_p·A·γ/(στη); P_out = (γ₂/2)·A·I_sat·(x − 1), 0 below threshold (§4.1, no seed); slope = powerPerP/pumpThreshold = η·(λ_p/λ)·γ₂/(2γ) (§3.6 with η); T_opt = `cavity.optimumCoupler({ g0, l_g, L_i: 2α_i·l_g })` (§3.6); T_best = 1 − e^(−T_opt), the transmission where this model's P_out(T) peaks; period = 2π/ω (damped, §4.2) and t_damp = 2τ/x, null at or below threshold.

The default bench (stage 4's small Nd:YAG laser plus a pump): rod l = 5 cm, A = 1 mm², L = 0.3 m, R₁ = 1, R₂ = 0.95, α_i = 0.2 m⁻¹ (L_i = 2 %), β = 10⁻⁸, diodes at 808 nm with η = 0.9 (§6.3), 5 W absorbed.

**Test values** (recomputed on the real engine in the audit):

| Check | Expected | Source | Bound |
|---|---|---|---|
| Default bench | L_e 0.341 m, γ 0.035647, g_th 0.71293 m⁻¹, τ_c 31.91 ns, ε 1.3874×10⁻⁴, threshold 1.5120 W, x 3.3068, P_out 1.7151 W, slope 0.49173, T_opt 4.8667 %, T_best 4.7502 %, period 11.21 µs, t_damp 139.1 µs | audit | 1e-4 relative (5 digits printed) |
| g_th = `cavity.thresholdGain`, γ, N_c, τ_c = `rates.fourLevel.scales`, N_c·σ·l = γ | identity | stage 2, 4 | 1e-12 |
| x = pumpPower/pumpThreshold; g₀l = xγ; P_out = slope·(P_pump − threshold) | identity | §3.6, §4.1 | 1e-12 |
| slope = η·(λ_p/λ)·γ₂/(2γ); ≈ §3.6's η·η_q·T/(T + L_i) | identity; within the small-loss difference | §3.6 | 1e-12; 3 % |
| §6.3 Fan–Byer: A = π(200 µm)², log loss 0.05, η 0.9 | 0.1333 W ("≈ 0.13 W") | §6.3 | 1e-12 of the hand formula; [0.125, 0.135] |
| Scan of T (2×10⁻⁶ steps) at 2, 5 and 20 W | the peak at T_best (0.023156, 0.047502, 0.110711) | derived in the audit | one scan step |
| Below threshold (2 W, T 30 %; 0 W) | P_out 0, period null, T_opt 0 at 0 W | §3.6, §4.1 | exact |
| Every slider corner (0 and 20 W × 0.5 and 30 %) | derive does not throw; all numbers finite or null | ranges | — |
| advance from `start()`, default bench, 30τ | P = powerPerP·p equal to derive's P_out | plan: 1 % | 1 % (measured 3×10⁻⁵) |
| advance twice with the same input | the same output, to the bit | plan | deepEqual |
| advance with maxSteps 5 | `reachedEnd` false, t moved forward but short of the target, all finite; carrying on in 5-step calls reaches the state of one long call | plan | 10⁻⁴ (each call picks its own first step, so the steps differ; measured 1.2×10⁻⁶) |
| advance with seconds = 0 | the sim unchanged, 0 steps | plan | deepEqual |
| A config change mid-run (T 5 % → 20 %) | N and φ carried over: y and s are converted with the new scales | decision | 1e-12 |
| Pump off for 750τ, then on again | lnPhi stays exact where φ would be a subnormal number (about 10⁻³¹⁹, with only a few significant bits); lasing comes back | §11.3 | finite; 1 % |
| `format.si` | 3.19e-8 s → "31.9 ns"; 2.41e6 Hz, 2 digits → "2.4 MHz"; 0 → "0 W"; 999.96 → "1.00 kW"; NaN/Infinity/null → "—"; −0.0015 → "−1.50 mW" | plan | exact |
| `fromSlider`/`toSlider` | ends exact; log midpoint = √(min·max); round trip | plan | 1e-12 |
| history | keeps the newest `capacity` points in order; `points(from)` | plan | exact |

**Decisions:**
- The pump slider is **absorbed** pump power, spread evenly over the rod's mode area (§4.1's plane-wave model). With A = πw² this gives §6.3's Fan–Byer threshold for a pump spot matched to the mode, which is the test. η_p (absorbed share) and η_t (overlap) are 1 by construction; η = 0.9 is §6.3's.
- Internal loss α_i = 0.2 m⁻¹ (L_i = 2 %, typical scattering in a YAG rod). With L_i = 0 there is no best coupler (§3.6), and the P_out(T) lesson needs one.
- "Best coupler" shows T_best = 1 − e^(−T_opt), not §3.6's T_opt. The model's coupler loss is γ₂ = −ln(1 − T); in γ₂ its P_out is exactly the low-gain Rigrod curve, which peaks at γ₂ = T_opt. §3.6's T is the small-loss form of γ₂, so the two differ by 2–6 % here, which a visitor scanning the slider would see.
- The simulation state is physical, `{ t, N, lnPhi }` (lnPhi = ln φ), not y and s: the scales change with every slider, while the atoms and photons do not. ln φ, because after a long time with the pump off φ falls to about 10⁻³¹⁹, a subnormal number with only a few significant bits, while ln φ keeps them all.
- The solver's last step size is not carried from call to call: measured, it saved 2–8 % of the steps (lasing: 445 instead of 467 steps in 40 pieces, against 424 in one call; pump off at T = 30 %: 8169 instead of 8370), and no test could catch its loss.
- Slow motion 10³–10⁶ (log), default 10⁴ (1 s on screen = 100 µs). §11.3's range starts at 10³; above 10⁶ nothing moves in this laser. The plot shows the last 5 s of screen time on a linear time axis (log axes are for ms and ns together, stage 8).
- Each frame is split into pieces (one plot point each) sharing a budget of 1500 solver steps: about 480 points a second of screen time, so 8 a frame at 60 Hz, 2 at 240 Hz, at least 1 (review: 8 a frame made the plot depend on the refresh rate). Measured warm in Node: about 6.2 µs a step; the dearest corner (pump off, T = 30 %, slow motion 10³) needs about 900 steps a frame. When the budget runs out, simulated time falls behind; when that happens in more than a quarter of a second's frames, a note says so.
- P(t) axis: from 0 to the larger of the window's highest point and powerPerP (the output at twice threshold), so the 10 nW of spontaneous emission below threshold sits on the axis instead of being blown up to fill it.
- The state (config, sim, history) lives in `page.js` across rebuilds: a language switch keeps the experiment running.
- Units are SI symbols in both languages, with a decimal point, as the other labs do (flagged for the Armenian review).

**Doc fixes from the audit:** §3.6's η_s = η_p·η_q·η_c·η_t had no factor for the absorbed pump photons that do not reach the upper level (§6.3's η): added. Nd:YAG's σ, τ and n checked against RP Photonics and a vendor datasheet (Sources).

- **Traps:**
  - `ode.dopri5`'s default `maxSteps` (100 000) is a safety limit, not a frame budget (about 65 ms for a 2-component f): pass a per-frame budget measured from the time a step takes;
  - pass the state through `rates.fourLevel.liftToSeed` before every solver call, or turning the pump back on after a long time off makes the solver give up (stage 4 review, §11.3);
  - below threshold with a seed, and with the pump off, the explicit solver is slow (∂ṡ/∂s = −(1 − y)/ε, §11.3). Measured for this Nd:YAG (ε = 1.9×10⁻⁴): about 1000 steps per τ at x = 0.5 and 1900 per τ with the pump off, so one real-time frame (16 ms ≈ 70τ) would need about 10⁵ steps. Choose the slow-motion range and budget with that in mind, or this is where stage 7b's implicit solver comes in;
  - plot history stored in simulated seconds, as a bounded ring buffer (no pixels: the resize rule);
  - readouts updated at most ~10×/s;
  - frames with dt = 0 only draw;
  - reduced-motion visitors start paused (as `labs.js` does).

**Found while building and testing:**
- **The plot was cut short on a 120 Hz screen** (browser): 8 points a frame × 120 frames × 5 s = 4800 points, more than the 4096 the history kept. First fixed with a bigger history; after the review the points are counted per second of screen time instead (480), and the history keeps 16384 (enough up to 3000 Hz), tested at 240 and 1000 Hz.
- **Level names squeezed** (browser): the level diagram's lines took most of its width. The two panels are now equal, the lines take 45 %, the words are shorter, and the "threshold" word next to the upper-level bar went (it sat on the level's name at a strong pump).
- **The solver costs about 1 µs a step in Chrome**, 6 µs in Node's vm, so the 1500-step frame budget is about 1.5 ms in the browser.
- **The inversion can end a step a hair below 0 with the pump off** (30 % coupler, 0.5τ pieces, after 35τ, measured with the clamp removed): below the solver's atol its error control no longer watches y. The next call would refuse N < 0, so `advance` passes on `max(0, y)`. Reproducing it costs 450 000 steps, so its test wraps the solver to return such an answer.
- **hNext dropped** (decision above): measured savings 2–8 %, no test could see it.
- φ does not reach 0 in a long pump-off run, as first written here: it falls to about 10⁻³¹⁹, a subnormal number. The test now checks that ln φ is below ln(2.2×10⁻³⁰⁸), where φ would have lost its precision.

**Breaks** (85, all caught; 299 in all; 12 of them from the review): bench.js: η left out of R_p, the pump photon at the laser wavelength, the pumped volume over the cavity, the threshold without /η, P_out as x or negative below threshold, L_i as one pass, a best coupler with no internal loss, T_best = T_opt, the period without 2π, g₀ without τ, the slope upside down, the photon's power divided, ln φ handed over as s and back, seconds as t′, the N clamp, a zero-length run, the pumpLam / η / tiny-loss / rod-length / three-level checks, a linear coupler slider; format.js: prefix before rounding, hyphen minus, plain space, log slider read as linear, no carry, whole numbers cut, slider top computed, no clamp; history.js: index after wrapping, unbounded count, the edge point, `clear()`; draw-levels.js: the scale without the loss or the inversion, the gain bar from the top, the loss line at x, the small-signal line at y, the bar from the pump, the laser arrow from the pump, a palette typo; draw-plots.js: time reversed, the floor ignored, old points kept, the threshold at x, the inversion axis without 1, the power label, the time label; draw-bench.js: linear alpha, a beam with no light, a short output beam; page.js: slow motion multiplied, each piece the whole budget, the budget never spent, readouts every frame, Pause not writing them, a rebuild restarting the experiment, listeners left behind, a short history, no `aria-valuetext`, T used as R, the note never shown, the plot window multiplied, the beam always on, stimulated emission without photons, Reset keeping the plot, a slider not re-deriving, reduced motion ignored, no page-title fallback. Five stage-5 entries were brought up to date with the new code. The first run missed 9; the tests added for them: the inversion clamp (wrapped solver), slider tops for ranges where the formula misses by one rounding unit, the small-signal line, the laser arrow only with light, no beam drawn with no light, the steps a frame really uses (counted around `advance`), Pause after 32 frames (the throttle last wrote at frame 30), the levels picture before and after the light comes, the plot after Reset. From the review: tiny values handed to `toFixed()` (`si` and `number`), an error in a drawing or in the simulation leaving the button at Pause, a failed build left standing, a slider leaving "now" stale, the note judged on every frame or left up after Pause or a slider move, 8 points a frame whatever the refresh rate, "0 %" for no best mirror, `points()` handing out the whole buffer. From the browser check after the review: the threshold word over the plot's title.

**Browser check** (Claude in Chrome, `http://127.0.0.1:5500`): the page lases with relaxation spikes after Reset; every readout equals `derive()` (g_th 0.713 m⁻¹ = `cavity.thresholdGain`); below threshold no output, period "—", no beam; scanning the coupler peaks at 4.75 % = the "best output mirror" readout; Reset gives time 0; two language switches leave one loop with the coupler and the run kept; leaving the page sets every `data-running` to `"false"`; light and dark themes; 375 px is one column with no sideways scroll; the pendulum and refraction labs still work; no console errors.

**Browser check after the review:** the review's corner (lasing at 20 W and 30 %, then the pump off, slow motion 10³) runs on with "< 1 fW", the button at Pause, one loop after two language switches and no console errors. In the automated window Chrome ran at 33 frames a second (the mutation check was using the processor), so each frame needed more than its 1500 steps and the note rightly showed. Found: with the pump off the inversion axis ends at 1.1, and the "threshold" word sat on the box's title "Inversion ÷ threshold"; it now goes under its line there (a test at every width, and a break).

**Review outcome** (`/code-review`, 13 findings: 9 fixed, 1 answered with a test, 3 declined):
- **A tiny output power stopped the page.** `format.js` used `toFixed()`, which throws past 100 decimals. With the pump off at a 30 % coupler the output reaches about 10⁻¹⁷⁰ W, so the readout threw inside the frame, the loop paused, and every Pause click and rebuild threw again. Now "< 1 fW" (and e-notation in `number()`), with a test over every power of ten and a page test of that corner.
- That error showed two more problems, both fixed. A build that threw part-way left its loop and listeners behind, so each language switch leaked one more loop: the build now takes down what it set up before passing the error on. After an error paused the loop the button still said Pause: `page.js` now sets it to Play, and Play tries again.
- A slider moved while paused left "output now" at its old number (it depends on the mirror): a slider move now writes every readout.
- The "cannot keep up" note blinked with every dropped frame and stayed up while paused: now judged once a second (more than a quarter of the frames behind) and cleared by Pause, Reset and a slider move.
- The plot still ran out of history above about 400 Hz: about 480 points a second of screen time now, instead of 8 a frame.
- `history.points()` copied the whole 16384-point buffer every frame: it now walks back from the newest point to the window's start.
- "Best output mirror 0 %" with no pump: now "—", as no mirror can make the laser run.
- Local variables named `window` (`page.js`, `draw-plots.js`) shadowed the browser's: renamed.
- Answered with a test: `bench.js` writes γ out in its "almost no loss" check, a third copy of the formula. Kept, so the error names `bench.derive` and not `cavity.singlePassLoss`; a test now ties the two at the limit.
- Declined: after N is clamped to 0, `liftToSeed`'s floor lifts ln φ on every call, so the leftover photon number depends on how the run is cut into calls. The floor is stage 4's protection against a seed that overflows when the pump comes back, and the light it leaves is below 10⁻²⁰ W: "< 1 fW", an invisible beam, a line on the plot's axis.
- Declined: `advance` checks and re-derives the config for every piece. Measured: 23 µs a piece in Node, 9 µs of it `derive`, so about 30 µs a frame in Chrome; the checks are the engine's rule that every error names the function called.
- Declined: the three-line `clamp`/`word`/`text` helpers repeated in the drawing files, and `page.js`'s own reduced-motion check. Each UI file stands alone; sharing them would need one more shared file for very little.

### Stage 6b — The page in the owner's design ✅

The owner drew the page they want (14 Nov 2026) and asked for it together with stage 7. It is built first, as its own stage with its own commit, because stage 7's medium pickers go into the new layout. No new physics.

**The design, in words** (the drawing itself is not in the repo):

```
              [ Dig deeper into the physics of the laser ]        [ dropdowns: gain medium, ... (stage 7) ]
 ┌──────────────────────────────────────────────────────┐        ┌───────────────────────────────────────┐
 │ THE BENCH: two mirrors that look like real mirrors,  │        │ OUTPUT POWER, big: a real scientific  │
 │ the gain medium between them, many separate rays of  │        │ chart with precise time and power     │
 │ light, a few of them leaving through the output      │        │ axes ("like a Bloomberg terminal")    │
 │ mirror, the mirror's transmission written beside it  │        │                                       │
 ├──────────────────────────┬───────────────────────────┤        ├───────────────────────────────────────┤
 │ CONTROLS: pump, output   │ PHOTONS: how single       │        │ THE NUMBERS (threshold pump power,    │
 │ mirror, slow motion,     │ photons make excited      │        │ pump ÷ threshold, ... simulated time) │
 │ each a slider AND a      │ atoms emit more photons   │        │                                       │
 │ box to type a number     │                           │        │                                       │
 └──────────────────────────┴───────────────────────────┘        └───────────────────────────────────────┘
 The colours of the drawing are only an example: use the site's.
```

**Scope card.**

| Piece | What it is | Tests |
|---|---|---|
| `LaserUI.axis.ticks(min, max, count)` | `{ step, values }`: ticks at multiples of a 1-2-5 × 10ᵏ step inside [min, max], free of rounding noise (0.3, not 0.30000000000000004) | `axis.test.js` |
| `LaserUI.axis.fromZero(max, count)` | `{ top, step, values }`: an axis from 0 to the first tick at or above max | `axis.test.js` |
| `LaserUI.axis.labels(values, step, unit)` | `{ texts, unit, power, decimals }`: one SI prefix for the whole axis ("mW"), as many decimals as the step needs, the same for every tick; no prefix without a unit | `axis.test.js` |
| `LaserUI.axis.valueText(value, labels, extra)` | a value written in the axis's own unit, with `extra` more decimals | `axis.test.js` |
| `LaserUI.format.prefix(value)`, `plain(value, digits)` | the SI prefix `si()` uses; the text a number box shows ("5", "13.2", "10000") | `format.test.js` |
| `LaserUI.plots.draw(view, chart)` | one chart, used twice (output power, big; inversion, small): frame, grid at the ticks, tick labels on the right and under the time axis, the unit once, an area under the curve, dashed reference lines with a word (steady output; threshold), a filled tag with the latest value on the axis, and under the pointer a crosshair with the time and value of the nearest point | `draw-plots.test.js` |
| `LaserUI.bench.draw(view, labels, light)` | mirrors as glass with a curved coated face in a mount on a rail; the rod; the pump diodes with pump light going into the rod; an odd number of separate rays (3 to 21, as many as fit 5 px apart) from mirror face to mirror face, arrowheads showing both directions; round(rays × T), at least one, leave through the output mirror; the transmission written at the bottom right | `draw-bench.test.js` |
| `LaserUI.photons.create({ cols, rows, random })`, `.step(dt, drive)`, `LaserUI.photons.draw(view, model, words)` | a cartoon of the medium: a grid of atoms (excited or not) and photons flying through. A photon passing an excited atom can make it emit a second photon beside it (same direction); the pump lifts atoms again; an excited atom now and then emits by itself in a random direction. `drive = { excited, light, pump }` (each 0–1) comes from the simulation; `random` is passed in, so the tests are repeatable | `draw-photons.test.js` |
| `page.js` | five canvases (`bench`, `power`, `photons`, `levels`, `inversion`); each slider has a number box (`data-laser-input`) that follows it and sets it; the pointer over a chart; the "dig deeper" button scrolls to the theory | `page.test.js`, `site-files.test.js` |

**Decisions:**
- The level diagram with the gain/loss gauge and the inversion plot are not in the drawing. They are kept in a row under the designed blocks: stage 7's three-level lessons need the level diagram, and the inversion is the other half of every spike. The big chart shows the output power alone, as drawn.
- The photon picture is a cartoon, and says so: 60 atoms stand for 10²² and the share of excited ones is y/(1 + y), so half are excited at threshold. Its rates follow the simulation (pump, light), its single events are random. It lives in `js/laser/ui/` because it is an illustration; no number on the page comes from it.
- Rays: their number shows the mirror's transmission by counting (with 15 rays and T = 30 %, 5 leave; below 1 in 15 the one ray still leaves).
- Number boxes: a typed value is used on Enter or when the box is left, held inside the slider's range; text that is not a number puts the old value back. The output mirror is typed in %, the slow motion as its factor (10 000 = 1 s shows 100 µs). They are text boxes with the decimal keypad (`type="text" inputmode="decimal"`), and the page reads a decimal comma as a point: Armenian writes 13,5, and a `type="number"` box hands the page "" for it in some browsers (review).
- The chart's time axis is simulated time (ticks at round times that scroll left), not "seconds ago": that is what a recording instrument shows.
- "Dig deeper" leads to a short theory section at the bottom of the same page (five short chapters); stage 12 turns it into the full learn section with presets.
- The page's container is wider than the other labs' (1480 px): three columns do not fit in 960 px. From 760 to 1100 px there are two columns (controls beside the photons, the chart beside its numbers); under 760 px one column: button, bench, controls, chart, numbers, photons.
- A slider gives values rounded to 4 significant digits, so its number box shows exactly the value that is simulated (13.46 W, not 13.4600000001). A typed value is rounded to the 6 digits the box shows, for the same reason (review).
- The tag on a chart's axis shows the latest value with two more decimals than the ticks ("1.70" on an axis of 0, 5, 10). It is the page's background framed in the curve's colour, with the text in the heading colour (review: text on a tag filled with the curve's colour was 3.6:1 on the light theme).
- The pump level x on the inversion chart does not stretch the axis (`stretch: false`); it is drawn when the curve comes near it, with the word "pump" (review: at x = 38 the curve near 1 lay flat on the bottom).
- The transmission is written under the output mirror's name, right above the mirror, on a row of its own; the drawing writes its number from `light.transmission`, so `labels` holds words only (review).
- On a touch screen a tap puts the chart's crosshair there and it stays when the finger leaves; a sideways drag moves it (`touch-action: pan-y`), an up-and-down drag scrolls the page (review).

**Traps:**
- the fake 2D context returns nothing from `measureText` and `createLinearGradient`: draw without them (text is squeezed with `fillText`'s `maxWidth`);
- an object made inside the test sandbox (the options of `scrollIntoView`, the array of `setLineDash`) fails `deepEqual` against a Node literal: compare its fields or its JSON;
- a mutation check that runs while the computer goes to sleep reports TIMED OUT for every break in flight (its 60 s limit is wall-clock time): run it under `caffeinate -i`;
- `toFixed` and tick arithmetic: build powers of ten with `Number("1e" + k)`, not `Math.pow`, and clean products to 12 digits;
- a chart with no points, one point, or a flat line at 0 must still have an axis;
- the pointer position is in CSS pixels of the canvas (`offsetX`), the same units the drawing uses.
- a `type="number"` box hands the page "" for a decimal comma in some browsers: read the number yourself from a text box;
- a tap on a touch screen sends `pointerdown` and `pointerleave`, no `pointermove`, and a drag is taken for scrolling unless the element sets `touch-action`;
- Python's `json.dumps` loses `data/*.json`'s hand-made layout (short `{ "hy", "en" }` pairs on one line, blank lines between blocks): change those files as text.

**Found while building and testing:**
- Three of the first breaks were missed: the tag at the oldest value (the test's curve started and ended at 1.7 W), the threshold word over the title (the test's line was never near the top), and photons entering a full picture (nothing filled it). Each has a test now.
- Browser: the photons were too short to see as moving light, and the theory chapters' prose stopped at the site's reading width inside its panel; both tuned.

**Breaks** (115 for this stage, 83 for the design and 32 from the review; 414 in all, all caught): axis.js steps, decimals, prefixes and rounding noise; the chart's tag, reference lines, crosshair, area and title; the bench's rays, arrowheads, mirrors, labels and transmission; the photon cartoon's rates, limits and drawing; the number boxes, the theory button, the pointer and the five canvases in page.js; the layout's controls, canvases and words. 23 earlier entries were brought up to date for the moved code; after the review 10 more were, and 4 went with the code they broke (the boxes' min and max, the old tag and transmission slots). The first run missed the 3 above; the run after the review missed 1, the shared chart points kept after a second Reset at t = 0, now tested.

**Browser check** (Claude in Chrome, `http://127.0.0.1:5500`, after the review): the three-column layout at 1440 px; "13,5" typed into the pump box gives 13.5 W, the slider and the readouts follow; the crosshair reads 5.570 W at 2.056 ms over the spikes after the pump went up; at 20 W and a 0.5 % coupler (x = 37.7) the inversion axis ends at 1.5 with the curve on its threshold line; at 1 W (x = 0.661) the faint "pump" line shows with the curve rising to it; the bench 300 px wide in Armenian writes "Թափանցելիություն 5.00 %" unsqueezed; the outlined tag reads well on the light theme; the chart canvases have `touch-action: pan-y` and the crosshair cursor; one loop after a language switch, the canvases off screen not running; no console errors. Chrome would not make its window narrower than about 960 px, so the phone width was checked by narrowing the bench's box.

**Review outcome** (`/code-review` on Opus 5.5, 14 findings, all fixed):
- Reset left the photon cartoon as it was (atoms excited, light in flight) while the bench and charts started again: Reset makes a new one.
- The number boxes were `type="number"`, which hands the page "" for "13,5" in some browsers (iOS Safari), so a decimal comma was silently thrown away: text boxes with the decimal keypad, and the page reads a comma as a point (and drops spaces between digits).
- The crosshair did not work on a touch screen (a tap sends no `pointermove`, a drag scrolls): it also follows `pointerdown`, a finger leaving keeps it, and the chart canvases set `touch-action: pan-y`.
- The pump level x stretched the inversion axis, so at x = 38 the curve near 1 lay on the bottom: `stretch: false`, drawn when the curve comes near it, with the word "pump"; the description for screen readers mentions it.
- A pointer move over a paused chart drew all five pictures: `loop.redraw(canvas)` draws only that chart.
- The two charts each took their own copy of the points every frame: they share one, taken again after every new point.
- A typed value was simulated with all its digits, but the box showed 6: it is rounded to the 6 digits the box shows.
- The tag's text (the background colour on the curve's colour) was 3.6:1 on the light theme and 4.3:1 on the dark inversion chart: the heading colour on the background, framed in the curve's colour (13.9:1 or more).
- On a phone the transmission label was squeezed to 40 % beside the pump's name: it has a row of its own under the output mirror's name.
- `page.js` wrote the transmission's number into the bench's words every frame: the drawing writes it from `light.transmission`, and `labels` holds words only.
- The cartoon's light repeated the bench's ray strength: both use `LaserUI.bench.rayAlpha`.
- `.laser-bench__canvas--chart` had no CSS rule: it now has the crosshair cursor and `touch-action: pan-y`, documented in `Instructions/HTML-CLASSES.md`, and a test checks both.
- `CLAUDE.md`'s file map still described the stage-5 page: updated.
- The nested clamp-and-round one-liners in `page.js`: a `clamp()` and a `round()` helper, one step per line.

### Stage 7 — Swapping media, three levels, flashlamp
- **Prep:** D6 for the media becoming selectable. Web-verify §5.1 values against published sources and record them in the doc. Then D2, D3, D4.
- **Build:**
  - `rates.threeLevel`: derive its dimensionless form ourselves and add it to the doc;
  - the flash pulse P(t) = P₀·(t/t_p)·e^(1 − t/t_p), normalised so ∫P dt = E;
  - the two-level steady state, for the "two levels never invert" lesson;
  - a parts tray for the 4-level media and ruby.
  - CaF₂:Dy (no σ) and the diode (needs its own carrier model) are shown as "coming later" (diode → stage 13f).
- **Tests:**
  - ruby: no gain until N₂ > N_t/2, and lasing starts after a delay;
  - §12 free-running ruby: spike spacing in [1, 50] µs;
  - He-Ne settles within a few τ;
  - a two-level system never has ΔN > 0;
  - the flash integral equals E;
  - a full 1 ms ruby flash fits the step budget at the default slow motion. If it doesn't, add an implicit Rosenbrock solver as stage 7b, with its own tests.
- **Breaks:** seed from ΔN instead of N₂; drop the factor 2 in the 3-level stimulated term; flash not normalised.

**The owner's choices** (15 Nov 2026): a second dropdown for the **pump**, listing only the pumps the chosen medium can use; a **flashlamp** turns the pump slider into the flash energy (J) and adds a "Fire" button that fires one flash of about 1 ms; the **two-level atom** is the last entry of the medium list ("never lases"); the **gas lasers** get a discharge-current slider (mA) with §6.4's model, optimum current included.

**Split into three stages, three commits** (measured at the start of the stage, below): **7a** an implicit solver, **7b** the engine for the new media and pumps, **7c** the page.

**Why an implicit solver now.** The plan's test, "a full 1 ms ruby flash fits the step budget at the default slow motion", was measured with a prototype of the three-level equations (§3.1's ruby: l = 10 cm, R₂ = 0.5, L = 0.5 m, so ε = 1.85×10⁻⁶, n_t = N_t/N_c = 11.5; a 1 cm rod; a flash of t_p = 0.3 ms). With `ode.dopri5`, before the first spike each frame needs about 1400 of its 1500 steps at slow motion 10⁴ (3500 per 4.2 µs of simulated time): the photons sit at their seed level, where ∂ṡ/∂s = −(1 − y)/ε, and with y ≈ −n_t that is 7×10⁶ per τ (§11.3). A 2.5 ms run costs 3.1×10⁵ steps (1000 J) to 1.7×10⁶ (100 J, below threshold), several seconds in Node. A prototype of the Rosenbrock method below needs 1.6×10⁵ steps in all for the 1000 J run at the same tolerance, at most 670 a frame (in the spikes, not before them), and gives the same spikes (first light at 469.8 µs both ways, the same spacing, the same energy to 10⁻³). Stage 8's Q-switch is worse: the closed switch makes ε about 100 times smaller.

### Stage 7a — Implicit solver for stiff runs (`ode.rosenbrock`)

**Scope card.** Source: L. F. Shampine and M. W. Reichelt, "The MATLAB ODE Suite", *SIAM J. Sci. Comput.* 18 (1997) 1–22, §3: the modified Rosenbrock pair of order 2(3) behind MATLAB's `ode23s`. The numerical Jacobian follows Hairer and Wanner's codes (*Solving Ordinary Differential Equations II*, 2nd ed., §IV.7 and the RADAU5 code): δ_j = √(ε_machine·max(10⁻⁵, |y_j|)).

| Function | Inputs | Output |
|---|---|---|
| `ode.rosenbrock({ f, t0, state0, t1, rtol, atol, h0, hMax, maxSteps })` | exactly as `ode.dopri5` | exactly as `ode.dopri5`: `{ t, state, reachedEnd, hNext, accepted, rejected, evaluations }` |
| `ode.rosenbrockCoefficients` | — | `{ d: 1/(2 + √2), e32: 6 + √2 }`, frozen: the numbers the solver uses |

One step from (t, y) with F₀ = f(t, y), J ≈ ∂f/∂y and T ≈ ∂f/∂t (both by forward differences, once per accepted point; T over √ε·max(|t|, |t + h|) but never longer than the step, as MATLAB's ode23s takes it), W = I − h·d·J:

    k₁ = W⁻¹(F₀ + h·d·T)
    F₁ = f(t + h/2, y + (h/2)·k₁)
    k₂ = W⁻¹(F₁ − k₁) + k₁
    y_new = y + h·k₂                         (order 2)
    F₂ = f(t + h, y_new)
    k₃ = W⁻¹(F₂ − e32·(k₂ − F₁) − 2·(k₁ − F₀) + h·d·T)
    error ≈ (h/6)·(k₁ − 2k₂ + k₃)            (order 3)

It is L-stable: a component that decays far faster than the step is damped to 0 in one step, so the step follows the accuracy of the slow parts, not the stiffness. F₂ is the next step's F₀ (first same as last). W is solved by Gaussian elimination with partial pivoting (n components; the laser uses 2 now, stage 8 adds a third, stage 9 up to 65).

**Decisions:**
- The same contract as `dopri5`, so the bench can use either and the same rules hold, from one step loop both solvers share (`adaptiveRun`; the review found two near copies): f gets copies and is never called outside [t0, t1] (the difference for T is never longer than the step); `maxSteps` counts every attempt; a step with a value that is not finite is retried 5× shorter; a step below 16·ε·max(|t|, |t1|) throws; `hNext` is not shrunk by a cut-short last step; no growth right after a rejection. The error norm and its scale are `dopri5`'s; the step factor is 0.9·err^(−1/3), between 0.2× and 5×.
- J and T are computed again only at a new accepted point: a rejected step retries with the same ones (they belong to the point, not the step). Each accepted point costs n + 1 extra calls of f; each attempt 2.
- `bench.advance` switches to `rosenbrock`, for every call (see the review below). Measured on the default Nd:YAG bench (rtol 10⁻⁶): lasing from the start for 30τ takes 12 390 steps instead of `dopri5`'s 4565 (order 2 against 5; at slow motion 10⁴ that is a few tens of steps a frame); 10τ below threshold 615 instead of 12 652. `dopri5` stays: it is the reference the new solver is tested against, and later stages may want it for non-stiff runs.
- Not a higher-order Rosenbrock (RODAS, Kaps–Rentrop): their coefficients are long decimals that would have to be copied by hand; `ode23s`'s are two exact numbers, and its cost is within the budget.

**Test values** (prototype; the real file is measured again in the tests):

| Check | Expected | Bound |
|---|---|---|
| d and e32 | 1/(2 + √2), 6 + √2 | exact |
| One step by hand on a linear problem (J and T exact there, but found by differences good to about 10⁻⁸) | y_new, the next h = h·0.9·err^(−1/3); also from y = 0, where the error scale must use the new state | 1e-9; hNext 1e-6 |
| Fixed steps on a smooth nonlinear problem, h halved | error ÷ 4 (order 2); error estimate ÷ 8 (order 3) | [3.6, 4.4]; [7, 9] |
| Stiff y′ = −λ(y − cos t), t ∈ [0, 1], λ = 10⁴ and 10⁸ | accurate, and about as many steps for 10⁸ as for 10⁴ (dopri5 needs λ/3.3) | measured 725 and 802 attempts: ≤ 1000 each, 10⁸ ≤ 1.5× 10⁴ |
| The same with T left out | the steps or the error grow (a break must be caught) | — |
| Four-level rate equations at the seed level (ε = 10⁻⁶, x = 0.5, 3τ) | finishes in about 10³ steps (dopri5: 6.9×10⁵, too many for a test reference), and y, s match the answer y = x(1 − e⁻³), s = ln(β(y + 10⁻¹²)/(1 − y)) | measured 1233 steps, errors 1.1×10⁻⁵ and 2.1×10⁻⁵: ≤ 2000 steps, 5×10⁻⁵ |
| A coupled 3-component linear system with a known exact answer | matches | 1e-5 |
| A step where W's first pivot is 0 | solved by pivoting, accepted | — |

Also the contract tests of `dopri5`, for `rosenbrock`: the last step lands on t1; a partial result out of budget, continued to the same answer; f's copies; f never outside [t0, t1], also with T and J; not finite at the start throws; a blow-up and a NaN partway throw quickly; an overflow is never accepted; every input checked, errors naming `ode.rosenbrock`; 65 components; evaluations counted.

**Traps:** the difference for T must not step past t1; a step δ so small that t + δ rounds to t gives T = 0/0; the Jacobian of a state where f is not finite nearby has NaN, which must make the step fail, not be accepted; the four-level f has a kink at y = 0 (no seed below), which a difference across it sees; pivoting.

**Found while building and testing:**
- **The solver stopped on the stage-6 bench with the pump off** (the long-cavity test: 750τ off). The bench passes on y = max(0, y), and with no seed at y ≤ 0 the four-level f has a kink there: just above 0 the seed's slope is β·e^(−s), which grows as the photons fall, past 10³³. The forward-difference Jacobian took that slope, the implicit step made y and s jump, and the steps shrank to nothing ("the step size fell below" after 1 000 000 tries). `dopri5` never looked at a slope, so it never saw this. Fix (a modelling decision, not settled by the doc, physically negligible): the seed adds 10⁻¹², the floor `liftToSeed` already used between calls, to the inversion: `β·(max(y, 0) + 10⁻¹²)·e^(−s)`. (First written as `max(y, 10⁻¹²)`; the review found its corner at 10⁻¹², below.) The photons with the pump off now settle at the seed of 10⁻¹² of threshold instead of following the atoms down to φ ≈ 10⁻³¹⁹; the stage-6 test that checked ln φ below the subnormal range checks the floor's level instead, and the stage-6 review's declined finding (the leftover light depended on how a run was cut into calls) is gone with it. Measured on three cavities (ε = 0.09, 1.4×10⁻⁴, 2.6×10⁻⁵): 750τ off costs 670 to 18 000 steps, and lasing comes back exactly.
- **The Jacobian's difference step was lost in rounding past |y| ≈ 4.5×10¹⁵** (Hairer's √(ε·|y|) is below y's last digit there), giving 0/0: found by the overflow test, which climbs to 10³⁰⁸. There the step is √ε·|y|; tested at y = 10²⁰.
- **Global accuracy is lower than `dopri5`'s at the same tolerance**: decay to t = 10 at rtol 10⁻⁶ ends 5×10⁻⁴ off (`dopri5`: 7×10⁻⁶), the oscillator's 10 periods at rtol 10⁻⁷ 6×10⁻⁴ off. That is what an order-2 method that advances with the less accurate of its pair does; the bench's dynamics are damped, so its steady states still match `derive()` to 10⁻⁸ (P_out after 30τ), and the ruby prototype's spikes matched `dopri5` at 10⁻⁸.
- **Cost on the stage-6 bench** (rtol 10⁻⁶): 30τ from the start 12 390 steps (`dopri5` 4565); 10τ below threshold 615 (12 652); 200 µs 2129. The worst slider corner at slow motion 10³ needs about 700 steps in a 60 Hz frame (20 W, 30 % coupler, while the spikes last), so nothing falls behind on its own any more. The two page tests of the frame budget therefore use `dearer()` (`page.test.js`), a stand-in that charges a set number of steps per simulated second, as the old stiff corner did; stage 7c's ruby flash gives a real costly case.
- A settled laser costs one to a few steps per call, because each call guesses its first step again and the guess falls back to 10⁻⁶ where f is nearly 0. Cheap enough (32 steps a frame); carrying the step between calls stays declined.
- The first mutation check caught 449 of 451, with 2 timed out: with the middle stage or the error estimate broken, the 65-component test ran on to the default 100 000 steps (70 s; each step solves a 65 × 65 system). It now has `maxSteps: 270` (1.5× the 178 it needs) and checks `reachedEnd`.

**Breaks** (33 for this stage: 30 in its own section of `tests/laser/mutations.js`, 3 beside the entries they belong with (the seed as max(y, 10⁻¹²), `steadyState` without the floor, the Rosenbrock error scale from the old state only); 447 in all): the two coefficients; ∂f/∂t left out of k₁ or k₃; the middle stage's time and state; k₂ without + k₁; the error estimate's size and sign; W's sign and a transposed Jacobian; pivoting, the row order, the kept factors and back substitution; the Jacobian's step lost in rounding, and filled in by rows; J and T never taken again, or taken for every retry; T past t1 on a short call, with the wrong sign, as 0; f at the new point not carried over; a step into Infinity and a NaN error; f one unit past t1; the step control's exponent and the first step's; the bench back on `dopri5`. The shared step loop's entries (the last step, the budget, hNext, growth after a rejection, NaN at the start, hMax) now cover both solvers at once, so the Rosenbrock copies of them were dropped.

**Browser check** (Claude in Chrome, `http://127.0.0.1:5500/?view=laser`, after the review): the page loads the new engine (one step loop, the floor's p = 10⁻²⁰ with the pump off), no console errors. The costliest corner (20 W, 30 % coupler, slow motion 10³) from Reset and then with the pump off: on an idle machine (120 Hz, no frame over 25 ms) the "behind" note never shows, the power reads 7.77 W and falls to about 1 fW within 4 s. While the mutation check loaded the machine (one frame in ten 25–50 ms), the note showed for about a second during the spikes. Measured in Node at that corner: frames up to 33 ms fit the 1500 steps with either solver, 50 ms frames (the longest, dt is capped there) do not (Rosenbrock 7 of 12 behind, `dopri5` 1 of 12); from the seed level `dopri5` is no cheaper (870 steps against 691 in a 60 Hz frame), so this does not change the declined finding below.

**Review outcome** (`/code-review` on Opus 5.5, 13 findings: 12 fixed, 1 declined):
- The seed floor `max(y, 10⁻¹²)` only moved the corner from y = 0 to 10⁻¹², and the Jacobian's difference in y (4.7×10⁻¹¹) reached across it: frames with the pump off cost up to 580 steps (all 1500 at ε = 10⁻⁶, ruby's range). The floor is added instead, `max(y, 0) + 10⁻¹²` (in f, `liftToSeed` and `steadyState`); the worst pump-off frame is now 212. Tested by the seed's slope across 10⁻¹² (`rates.test.js`) and by a frame-by-frame run of the costliest corner (below).
- Nothing drove the real solver through a costly slider setting since the page's budget tests moved to `dearer()`: `bench.test.js` runs 20 W, 30 % coupler, slow motion 10³ as the page does (8 pieces a frame), each frame allowed 1.5× its measured cost (698 while the spikes last, 212 after the pump goes off, over 60τ).
- `steadyState` no longer matched f with the pump nearly off (p → 0 where f settles at β·10⁻¹²): it solves f's own equilibrium, floor included; the test that it makes f zero now includes x = 0 and 10⁻¹⁴.
- The backward difference for T was never reached by any test, and is not needed: T is now taken as MATLAB's ode23s takes it, forward over at most the step, which never leaves [t0, t1] (the clamp to t1 was dropped too: when the difference is the whole last step, t1 − t is exact). The limit to the step is now what keeps f inside on a short call, and a break of it is caught. Its test checks a stiff step both ways, with the difference inside the step and as the whole step; the dead `dt === 0` branch is gone.
- The Rosenbrock error scale's use of the new state was not tested: a step by hand from y = 0, where the old state alone would give the scale atol.
- The test "agrees with dopri5" compared with the analytic answer: renamed, and its bound tightened to 5×10⁻⁵ (measured 1.1×10⁻⁵ and 2.1×10⁻⁵); `dopri5` would need 6.9×10⁵ steps there.
- Two tests passed by rounding luck (`N = 0` after the pump-off run; `liftToSeed` leaving the end state exactly unchanged): they check that the inversion is below the floor, and that the lift is below 10⁻⁴ (measured 1.5×10⁻⁵).
- The two solvers' step loops were near copies: one loop, `adaptiveRun`, that both use, and the error norm through `scaledSize`.
- The page test of the pump off no longer reaches 10⁻¹⁷⁰ W (5×10⁻²⁰ W with the floor): its comment, `format.js` and `CLAUDE.md` now say so, and that `format.test.js`'s sweep of every power of ten is what guards the old crash.
- `CLAUDE.md`, `bench.js`'s header and `rates.js`'s comments still said that φ falls to 10⁻³¹⁹ with the pump off and that `liftToSeed` is needed when the pump comes back: updated, and `ode.rosenbrockCoefficients` added to the frozen objects.
- This section contradicted itself and the tests on step counts and bounds: corrected above.
- Declined: using `rosenbrock` only when the run is stiff, or carrying the step between pieces (the reviewer measured 2–3× `dopri5`'s steps while lasing, 5× in the worst frame). The worst frame is 698 of 1500 steps; choosing a solver per call would add a rule about stiffness that the ruby and Q-switch stages (ε down to 10⁻⁸) would have to keep right, and those are the runs the implicit solver is for.

### Stage 7b — The engine for the new media and pumps (`rates.js`, `pumps.js`, `media.js`, `bench.js`) ✅

**Scope card.** No page work: the page (stage 7c) still shows the Nd:YAG diode bench, and only gains `pump: "diode"` in its config and `start(config)`.

| Function | Inputs (SI) | Output |
|---|---|---|
| `rates.threeLevel.scales({ sigma, tau, nu, l_g, area, L_e, refl1, refl2, alpha_i, N_t })` | four-level's, plus N_t (m⁻³) | four-level's numbers with p = 2Bτφ (`pOnePhoton = 2Bτ`, so `powerPerP = (γ₂/2)·A·hν/(2στ)`), plus `n_t = N_t/N_c` and `wThreshold = (n_t + 1)/(n_t − 1)` (null for n_t ≤ 1: even all ions up stay below threshold) |
| `rates.threeLevel.derivatives({ w, n_t, eps, beta })` | w = W_pτ, a number ≥ 0 or a function of t′ (a flash) | f(t′, [y, s]) with y = ΔN/N_c: dy/dt′ = w(n_t − y) − (n_t + y) − y·p, ε·ds/dt′ = (y − 1) + β·(max(n_t + y, 0) + 10⁻⁷·n_t)·e^(−s) (the ion floor, below) |
| `rates.threeLevel.steadyState({ w, n_t, beta })` | w a number | { y, p }, f's own equilibrium, floor included |
| `rates.threeLevel.relaxation({ w, n_t, tau, tau_c })` | w > wThreshold | ω_R = √(p₀/(ττ_c)), p₀ = (n_t − 1)w − (n_t + 1); damping rate n_t(w − 1)/(2τ); `omegaDamped`, `t_damp` as four-level |
| `rates.threeLevel.liftToSeed({ state, n_t, beta })` | | s raised to ln(β·(max(n_t + y, 0) + 10⁻⁷·n_t)/(1 + n_t)): below the below-threshold level β(n_t + y)/(1 − y) for every y ≥ −n_t, so a steady state is never raised |
| `rates.twoLevel.derivatives({ w, n_t, eps, beta })`, `.steadyState({ w, n_t, beta })` | | dy/dt′ = −2w·y − (n_t + y) − y·p and the same photon equation; `scales` and `liftToSeed` are the three-level ones |
| `rates.fourLevel.derivatives({ x, eps, beta })` | x may now be a function of t′ | otherwise unchanged |
| `pumps.flash({ energy, flashTime })` | J, s (t_p) | power(t), a function of the seconds since firing: (E/t_p)(t/t_p)e^(−t/t_p) for t > 0, 0 before (§6.1): ∫ = E, peak E/(e·t_p) at t = t_p. Checked once, like `derivatives`, because the solver calls it every step |
| `pumps.dischargeGain({ law, current, currentPeak, gainPeak })` | law `"optimum"` or `"square"`; A, A, m⁻¹ | g₀ (m⁻¹): §6.4 with a/b = 4, normalised to gainPeak at currentPeak; or gainPeak·(I/I_peak)² |
| `pumps.dischargeThreshold({ law, currentPeak, gainPeak, gth })` | | the lowest current with g₀ = g_th (closed form), null if gainPeak < g_th |
| `pumps.dischargeMax({ law, currentPeak })` | | the highest current the law allows: 3·I_peak (gain 0 again) or I_peak (the rated current) |
| `bench.pumpsFor(medium)` | id | the pumps the bench can run it with, in the dropdown's order; [] for CaF₂:Dy and the diode |
| `bench.configFor({ medium, pump })` | | a new config for that pair |
| `bench.controls(config)` | | `{ pump: { name, min, max, log }, coupler: { min, max, log } }`: the config field the pump slider sets and its range (a discharge's from the config's own currentPeak), and the coupler's T range, 0.5–60 % for every bench (first `pumpControl({ medium, pump })`, pump only; changed in the review) |
| `bench.start(config)` | | `{ t: 0, N: 0 (four-level) or −N_t (all ions down), lnPhi: 0, flash: null }` |
| `bench.fire({ sim, config })` | a flashlamp config | a copy with `flash: { at: t, flashEnergy, flashTime }` from the config, the flash's own energy and t_p from then on (a flash fired while one runs replaces it; first `fire(sim)` with only `flashAt`, changed in the review) |
| `bench.flashThreshold(config)` | a flashlamp config | the smallest flash energy whose inversion reaches threshold (J), null if none can (two-level) |

**Config:** `medium`, `pump`, `l_g`, `area`, `L`, `refl1`, `refl2`, `alpha_i`, `beta`, and by pump kind:
- `diode`, `laser` (continuous light): `pumpPower` (W absorbed by the unpumped medium), `pumpLam`, `eta`.
- `flashlamp`: `flashEnergy` (J into the lamp), `flashShare` (the share absorbed by the unpumped rod), `flashTime` (t_p), `pumpLam`, `eta`.
- `discharge`: `current`, `currentPeak`, `gainPeak` (the law is the medium's: `"optimum"` for He-Ne and CO₂, `"square"` for Ar⁺).

The pump rate per ion is set for the unpumped medium, as a lamp sets it whatever the populations are (W_p = σ_aΦ): four-level R_p = η·P/(hν_p·V_a) as before; three- and two-level W_p = η·P/(hν_p·N_t·V_a), with P the absorbed power (the flash: share·P_flash(t)). A discharge sets the small-signal gain: x = g₀(I)·l/γ.

**Decisions** (numbers checked where a source was found; the rest marked):
- Flash t_p = 0.3 ms for every flashlamp medium (FWHM 0.73 ms: the owner's "about 1 ms").
- Ruby (§3.1's example): rod 10 cm, 1 cm across, L = 0.5 m, R₂ = 0.5, α_i = 0, N_t = 1.6×10¹⁹ cm⁻³; lamp light absorbed in the 550 nm band, share 0.12 (the book's 10–15 %), η = 0.7 (not verified: between about 0.7 and 1 in the literature). Then n_t = 11.54, ε = 1.85×10⁻⁶, τ_c = 5.54 ns, threshold about 640 J; the flash slider 0–3000 J, 1000 J at the start.
- Nd:YAG with a flashlamp: rod 7.5 cm, 6 mm across, R₂ = 0.8 (threshold about 1.3 J; 0–50 J, 10 J). Nd:glass: rod 10 cm, 1 cm across, L = 0.5 m, R₂ = 0.8 (about 29 J; 0–300 J, 100 J). Both absorb in the 808 nm band, η = 0.9, share 0.12 (the book's ruby number; not verified for neodymium).
- He-Ne: tube = cavity, 0.3 m; mode area 0.2 mm²; R₁ = 0.999, R₂ = 0.99; α_i = 0.01 m⁻¹ (so there is a best coupler); g_peak = 0.144 m⁻¹ (15.5 %/m, Stanford) at I_peak = 5 mA (datasheets: 3–8 mA, at most about 6.5 mA for a small tube; I_opt grows with the bore, so the book's 7–10 mm tubes ran at tens of mA). 0.43 mW at 5 mA. Slider 0–15 mA.
- CO₂: tube = cavity, 0.8 m; 50 mm² (8 mm bore); R₂ = 0.8; α_i = 0.005 m⁻¹; g_peak = 1.1 m⁻¹ (1.1 %/cm, a DC longitudinal discharge) at I_peak = 20 mA (sealed tubes run at 14–29 mA). About 8 W (real 80 cm tubes give 40–60 W: this plane-wave model saturates the whole bore evenly). Slider 0–60 mA.
- Ar⁺: tube = cavity, 1 m; 1.8 mm² (1.5 mm bore); R₂ = 0.95; α_i = 0.01 m⁻¹; g_peak = 2.3 m⁻¹ (about 10 dB/m) at its rated I_peak = 40 A. **Square law**, not §6.4's optimum: the upper level is reached in two electron collisions, so the gain grows as I² and keeps growing up to the rated current (not verified against a printed source). A departure from the owner's "optimum current included", for this one gas. About 0.45 W at 40 A; the slider (0–40 A) starts at 30 A (0.25 W), so it can still go up.
- §6.4's a/b = 4 for He-Ne and CO₂: the gain is 0 again at 3·I_peak (a model choice; §6.4 leaves a, b free).
- Dye (Rhodamine 6G): a 0.2 mm jet, a 15 µm spot (7×10⁻¹⁰ m²), L = 0.5 m, R₂ = 0.97, pumped at 532 nm with η = 1 (S₁ is reached directly; its own decay is in τ); triplet losses (§5.8) are left out, so the slope is high: threshold 42 mW, 1.6 W at 2 W. Ti:sapphire: crystal 5 mm, a 30 µm spot, L = 1.5 m, R₂ = 0.97, α_i = 0.5 m⁻¹, 532 nm, η = 1: threshold 0.15 W, 2.8 W at 5 W. Both 0–10 W.
- The two-level atom: ruby's numbers (scheme `"two-level"`, I_sat with the factor 2 as for ruby), the last entry of the media list; a small sample (1 cm, 1 mm², L = 0.1 m, R₂ = 0.9) so that a pump of tens of watts reaches W_pτ ≈ 1; pumped by light at its own line (`pumpLam` = λ: there is no other level to absorb into), `"laser"` (0–1000 W) or `"flashlamp"`. It never runs, so `cw` and `pulsed` are both false.
- `derive` for a flashlamp gives the flash's peak power and the pump at the peak in units of threshold (`xPeak`), and null for the steady numbers (P_out, threshold power, best coupler, relaxation); for a discharge `currentThreshold` instead of `pumpThreshold` and `slope`; for the two-level atom x = 0 and `ySteady` < 0.

**Doc audit** (fixed in `docs/laser-physics.md` with this stage):
- D2, §4.1: "N → ΔN in the second equation" makes the seed negative while ΔN < 0. The photon equation of a three-level medium has V_aBΔNφ for stimulated emission and βV_aN₂/τ for the seed, N₂ = (N_t + ΔN)/2; written out, with its dimensionless form in §11.2 (derived here: p = 2Bτφ, w = W_pτ, n_t = N_t/N_c).
- §4.2: the ruby numbers (period 17 µs, damping 2 ms, "116 oscillations", "never die out") come from the four-level linearization. Linearizing the three-level equations: ω_R² = (n_t + 1)(x − 1)/(ττ_c), damping rate n_t(w − 1)/(2τ); for ruby at x = 3 a period of 5.1 µs and a damping time of 0.2 ms, shorter than the flash. So single-mode rate equations damp ruby's spikes far above threshold (at 2000–3000 J they smooth out within about 0.3 ms), but not near it (at 700–1000 J they last as long as the light, 0.3–0.8 ms; measured on the bench); real ruby keeps spiking irregularly even far above threshold, which needs several modes and heating (a known gap of the simple model).
- §6.4: the He-Ne currents (above), and the square law for Ar⁺.
- §5.1/§5.2: N_t as a column for ruby; the usual doping 0.05 wt % and τ = 3 ms at 300 K checked (Roditi's datasheet); the two-level atom added as a teaching entry.
- D3 (He-Ne "no oscillations") was already reworded in stage 4; this stage tests it.

**Test values** (prototypes in Node; the real files are measured again):

| Check | Expected | Bound |
|---|---|---|
| Ruby scales (§3.1) | N_c = 1.39×10¹⁸ cm⁻³, n_t = 11.54, ε = 1.848×10⁻⁶, τ_c = 5.54 ns, w_th = 1.190 | 1e-3 |
| Three-level gain from the pump alone (§2.2) | y < 0 for W_pτ < 1, y > 0 just above; steady y = n_t(w − 1)/(w + 1) without light | exact identity 1e-12 |
| The seed comes from N₂ | at y = −n_t (all down) the seed is the floor's, not negative | — |
| steadyState makes f zero, both schemes | | 1e-12 |
| Relaxation (three-level) against a kicked run | period and damping time | 2 %, 10 % |
| Two-level: y < 0 | every w from 0 to 10⁶, from y = −n_t and from y = 0.9·n_t (an inverted start relaxes) | always |
| Ruby flash at 0.95 × and 1.05 × the threshold energy | no light above the seed level ×10; lasing | — |
| Ruby at 1000 J | first light after a delay of 0.2–0.8 ms; spike spacing in [1, 50] µs (§12) | ranges |
| He-Ne from the off state to I_peak | overdamped (no period), rises without overshoot, within 1 % of steady by 12τ (D3; the build-up from one photon takes about 6τ, so 10τ was too early) | 1 % |
| Flash | ∫P dt = E, peak at t_p, 0 before | 1e-9 |
| Discharge (optimum) | g₀(I_peak) = g_peak, the scan's maximum at I_peak, 0 at 0 and 3·I_peak, threshold = bisection | 1e-9 |
| Every (medium, pump) of `configFor` | derives, runs 1 ms of its default within a step bound | — |
| A ruby flash in page frames (slow motion 10⁴, 60 Hz) | fits 1500 steps a frame | measured, 1.5× |

**Traps:** the seed from ΔN (negative before half the ions are up); dropping the factor 2 of the three-level stimulated term (p = 2Bτφ); a flash not normalised (∫ ≠ E); pumping with the populations instead of for the unpumped medium; the two-level pump at a shorter wavelength; `liftToSeed` raising a below-threshold three-level state (its level β(n_t + y)/(1 − y) is 12 times lower than β(n_t + y) at y = −n_t); the flash's corner at t = 0 (it starts at a call's start, where the forward difference only sees one side); clamping y at −n_t, not 0, for three levels.

**Found while building and testing:**
- **The three-level seed floor had to be bigger than four levels' 10⁻¹².** There the upper level is n_t + y, and as the ions all fall back down (y → −n_t) it is known only to the rounding of n_t, 2×10⁻¹⁶·n_t. Next to a floor of 10⁻¹² that rounding was noise of 10⁻³ in the seed, and the implicit solver, which differentiates f, took about 10⁵ steps per 10τ (ruby, 30τ after the pump stopped). The floor is 10⁻⁷·n_t (`ION_FLOOR`, in f, `steadyState` and `liftToSeed`): the rounding is then 2×10⁻⁹ of it, below the solver's tolerance whatever n_t is, and the same decay takes under 10 steps. With the pump off the photons settle at β·10⁻⁷·n_t/(1 + n_t), for ruby a hundredth of a photon. The four-level floor stays 10⁻¹² (its y = 0 is exact).
- **He-Ne is not within 1 % after 10τ**: the build-up from one photon alone takes about 6τ. At 5 mA (x = 5.07) it is overdamped (x/2 > ω_Rτ, `derive` gives no period), so the test checks that it rises without overshoot and is within 1 % by 12τ.
- **The two-level setups need their pump at the line itself**, which a fixed number in `SETUPS` would duplicate: their `pumpLam` is null there and `configFor` fills in the medium's λ; `derive` refuses any other wavelength for two levels.
- **No clamp is needed at the discharge's highest current.** A first version clamped the optimum law's gain at 0 there for rounding; the mutation check showed the clamp never acts: the max-current check keeps u = I/I_peak within one rounding unit of 3, where the formula is exactly 0. The clamp is gone, and a test checks the gain at the top for 2000 peak currents.
- **The flash threshold's peak search could run 55 000 pieces** when y never moved (a break that read the pump only at t′ = 0 timed the test run out): it now stops at the first piece that does not rise, not the first that falls. The parabola through the last three samples went with it: it moved the threshold energies by at most 6×10⁻⁷.
- The step bounds in the tests were first guesses and too low: each is now 1.5× the measured cost.

**Measured** (the real files, rtol 10⁻⁶):
- The setups (5 digits, now the test values): He-Ne τ_c 117.38 ns, g_th 0.028418 m⁻¹, x 5.0672, 0.42773 mW, threshold 0.36139 mA; Ar⁺ at 30 A x 36.294, 0.25162 W (at 40 A 64.522, 0.45288 W), threshold 4.9797 A; CO₂ τ_c 23.090 ns, x 7.6143, 8.2319 W, threshold 0.93073 mA; dye threshold 42.420 mW, x 47.148, 1.6288 W, ε 20.556; Ti:sapphire threshold 0.14853 W, x 33.664, 2.7713 W; ruby n_t 11.5416, ε 1.84793×10⁻⁶, w_th 1.18973.
- Flash thresholds: ruby 638.68 J (63 ms to compute after the review: bisection to 10⁻⁶ over runs of the photon-free equation), Nd:YAG 1.2932 J, Nd:glass 28.969 J. At the default energies the pump peaks at 5.72 (ruby, 1000 J), 9.69 (Nd:YAG, 10 J) and 4.69 (Nd:glass, 100 J) times threshold.
- Ruby at 1000 J: first light at 0.47 ms, then 115 spikes 5–7 µs apart (§12's [1, 50] µs; the three-level relaxation period at x = 3 is 5.1 µs), peaks up to 0.32 MW. At 0.95 × the threshold energy the most light is 0.16 mW (spontaneous, amplified near threshold); at 1.05 × a 31 kW spike.
- Cost: 1 ms of each setup's default (flash fired at the start) from 350 steps (He-Ne) to 15 000 (ruby); a ruby flash on the page (slow motion 10⁴, 60 Hz) at most 588 steps a frame, 33 on average, so the 1500 a frame are enough; the two-level flash at most 1284 steps per 50 µs piece.

**Breaks** (70 for this stage: 51 in its own section of `tests/laser/mutations.js`, 2 beside the media entries (the factor 2 per emission for three and for two levels), 17 from the review in a section of their own; 515 in all): three levels seeded from ΔN, without the factor 2 of p = 2Bτφ, with four levels' decay, with the pump not emptying the ground level, with the sign of (y − 1) flipped; two levels with −w·y or pumped as three; `liftToSeed` without /(1 + n_t); the ion floor at 10⁻¹² or unscaled in the steady state; the steady states without the seed, the factor 2 or p; w_th, p₀ and the damping of the three-level relaxation; a pump function read only at t′ = 0 (four and three levels); the flash not normalised, as a jump, lit before firing; §6.4's a/b, the optimum law's top, the square law and its threshold, the optimum threshold's sign and root, a tube with no threshold, a current past the top; the clamp at 0 instead of −N_t, ruby starting half inverted, the pump without η or τ or per threshold ion, the whole lamp's light absorbed, xPeak, the lamp's peak without 1/e, ruby's threshold by the linear shortcut, the bisection turned round, the flash restarting each call or aged wrongly; the two-level pump wavelength, a flash later than t or on a bench without a lamp, the two-level atom given a threshold or three levels' equations; the discharge's x without l, ruby's N_t a decade low, the flash share; from the review: the running flash read from the sliders, the flash not copied, the flash checks, the slider tops, the coupler range, ruby's light scale, the bisection's tolerance, `findSetup`, R_p, the new units, a function's name in errors. 23 entries for `rates.js` and `bench.js` were brought up to date with the rewritten code first, and 9 more after the review; 2 went with the code they broke (the two-level `pumpLam` marker, R_p's own η). The first run missed 2 and timed out 1: the parabola in the flash threshold's peak search and the clamp of the discharge gain at 0 changed nothing that matters, so both were removed (see above); the timeout was the peak search running 55 000 pieces when y never rose, which now stops at once. After the review 2 more: a test of the flash copy compared copies its helper had made (it now calls `advance` directly), and a page test of 5000 frames that, with off-screen canvases drawn, drew 5000 long charts (27 s; it now checks after every 100 frames that none was drawn).

**Browser check** (Claude in Chrome, `http://127.0.0.1:5500/?view=laser`, after the review; the page still shows only Nd:YAG): the page lases as in stage 7a, with the same readouts (threshold 1.51 W, x 3.31, g_th 0.713 m⁻¹, best output mirror 4.75 %) and the canvases off screen not running; no console errors. In Chrome the engine is about 8 times faster than in Node's vm: ruby's flash threshold takes 7.6 ms, and a 1.2 ms ruby flash run in 720 page frames 19 ms (18 240 steps). The first load mixed a cached `media.js` from before this stage with the new `bench.js` and threw ("there is no medium called two-level"): the local Python server sends no cache headers, so Chrome guessed; a hard reload fixed it. Cloudflare Pages tells browsers to check every file again, so the live site should not mix versions; worth checking once after the first deploy.

**Review outcome** (`/code-review` on Opus 5.5, 14 findings, all fixed):
- Ruby's default coupler (50 %) was outside `RANGES.T_oc` (0.5–30 %), so a slider would have shown 30 % while the bench ran at 50 %. `controls(config)` now gives the coupler's range with the pump's, 0.5–60 % (log) for every bench, and a test checks every default inside it and every corner of both sliders. `RANGES` stays the stage-6 page's until 7c.
- A fired flash was rebuilt from the config on every call, so moving the energy slider after Fire changed the flash that was running. The sim keeps `flash: { at, flashEnergy, flashTime }`, set by `fire({ sim, config })`. Tested: ruby fired at 1000 J, then the energy set to 0 and t_p doubled, runs exactly as the untouched flash.
- `powerPerP` is the output at p = 1, which is twice threshold only for four levels (for ruby p = n_t + 1 = 12.5 there, so its beam would have been 12.5× too bright). `derive` gives `powerAtTwiceThreshold`, and the page uses it for the beam and the power chart's floor. The page shows only Nd:YAG until 7c, where the two are equal, so a break of the page's use is caught from 7c on.
- `flashThreshold` took 0.18–0.27 s for ruby under load: bisection to 10⁻⁶ instead of 10⁻⁹, now 63 ms. Stage 7c should still not call it on every slider move (keep the result until the config changes).
- Its peak search grew with t_p/τ (Nd:YAG with t_p = 0.1 s: 0.75 s): pieces of t_p/100 instead of min(t_p, τ)/100. With t_p = 1 s, Nd:YAG now takes 31 ms and ruby 0.32 s; ruby with 1 µs 0.25 s.
- Continuous light on a three-level medium fell into the four-level code (no setup has it): it is refused, naming `derive`.
- A discharge's slider top came from the setup's default peak current, not the config's (He-Ne at 4 mA: 15 mA offered, 12 mA accepted): from the config's, tested.
- The four-level light pump repeated `pumpLevel`'s formula: it uses `pumpLevel`.
- `readConfig` looked the medium up twice and the setup in two scans, and `advance` derived before its 0-second return: one lookup, one scan, the derive after the return.
- `ionDerivatives`/`ionSteadyState` took a scheme name and a flag that follows from it: the flag only.
- The two-level setups had `pumpLam: null`, filled in by `configFor`: `SETUPS` reads the line from `media.js` (`TWO_LEVEL_LINE`).
- Two tests ran the solver with an unmeasured `maxSteps` and no `reachedEnd` check: measured bounds (1.5×) and the check.
- The setups wrote handbook values as bare SI numbers (`5e-3` for 5 mA): written with units; `mm`, `mm2` and `mA` added to `constants.js` and its test.
- The docs said the model's ruby spikes die out within 0.2 ms, but the bench spikes for 0.8 ms at 1000 J. Measured at four energies (t_p = 0.3 ms, threshold 639 J): at 700 J and 1000 J the spikes last as long as the light (0.3 and 0.8 ms; the light still drops by more than half between spikes at the end), at 2000 J and 3000 J they smooth out within about 0.3 ms. §4.2, the doc audit above and `docs/laser-progress.md` now say so.

### Stage 7c — Choosing the laser on the page ✅

**The owner's choices** (15 Nov 2026, besides stage 7's): the small chart of the inversion is not needed (the level picture shows the inversion as its bar), so it goes for every medium; each pump is drawn as itself on the bench. The page work is split in two commits: **7c** choosing the laser (the dropdowns, the controls, Fire, the slow motion, the readouts, the words), **7d** the drawings (each pump on the bench, the level picture and the cartoon for three and two levels). Until 7d, ruby is drawn with diodes and four levels: the commit is not deployed in between.

**Scope card.**

| Part | What it does |
|---|---|
| Medium dropdown (`data-laser-choose="medium"`, a `<select>`) | every medium of `media.list()`, in its order, named from `data/laser.json` (`media.<id>`); a medium without setups (CaF₂:Dy, the diode laser) is listed `disabled` with the words "coming later" |
| Pump dropdown (`data-laser-choose="pump"`) | the medium's `bench.pumpsFor(medium)`, named from `pumps.<kind>` |
| Choosing either | `config = bench.configFor(...)`, a new simulation (`start`), the charts' history and the cartoon cleared, the slow motion set to the setup's starting value, the sliders re-ranged from `bench.controls(config)`; Play/Pause kept. A language switch keeps the choice (it is in `state`) |
| Pump slider | `controls(config).pump`: its field (`pumpPower`, `flashEnergy`, `current`), name (`controls.pump.<kind>`), range and unit: W, J, or A (mA when the top is under 1 A) |
| Coupler slider | `controls(config).coupler`, 0.5–60 %, log. `bench.RANGES` goes (stage 7b kept it for the stage-6 page) |
| Fire (`data-laser-action="fire"`) | shown only on a flashlamp bench: `sim = bench.fire({ sim, config })`; if the loop is paused it also presses Play, since the visitor asked to see a flash |
| Slow motion | range 10³–10⁹ (log; the fastest lasers change within nanoseconds); each setup has a starting value (a table in `page.js`, below) |
| Readouts | rows shown by pump kind (`hidden` on the others): continuous light as now; a discharge the threshold current instead of the threshold pump power; a flashlamp the threshold flash energy (`flashThreshold`, computed once per config change, not per frame), the pump now ÷ threshold, and the highest output since Fire; the two-level atom "never" for its threshold |
| The pump now | `bench.pumpNow({ sim, config })` (engine, new) -> `{ x, w, smallSignal }` (after the review; first `{ x, power }`): x the pump now in units of threshold (four levels x, three levels w/w_th, null for the two-level atom, which has none), w the three- and two-level pump W_pτ (null for four levels), and `smallSignal` the gain without light over the loss, g₀/g_th, which is the inversion the medium would reach with no photons: x for four levels, n_t(w − 1)/(w + 1) for three (§2.2), −n_t/(1 + 2w) for two. The level picture (its pump arrow from x, or w for two levels; its gauge's dashed line from `smallSignal`), the cartoon and the bench's pump glow use it, so a flash shows as it rises and falls |
| The inversion chart | removed: its canvas, words, alt text and CSS; the level picture takes the row under the stage alone |
| Words | `data/laser.json`: the medium and pump names, "coming later", the slider names by pump, Fire, the new readouts, a status line and theory that no longer say "one Nd:YAG laser"; both languages (the Armenian flagged for a fluent reader, as before) |

**Starting slow motion** (from each setup's time scales, measured with `derive`; the frame cost of each is measured again in the tests):

| Setup | Time scale | Start | 1 s on screen |
|---|---|---|---|
| Ruby, Nd:glass, Nd:YAG flash; Nd:YAG diodes; CO₂ | flash 1 ms; relaxation 6–11 µs | 10⁴ | 100 µs |
| Two-level, laser | τ = 3 ms | 10³ | 1 ms |
| Two-level, flash | the 1 ms flash | 10⁴ | 100 µs |
| He-Ne, Ti:sapphire | build-up about 1 µs; Ti:sapphire's period 2.2 µs | 10⁶ | 1 µs |
| Ar⁺, dye | build-up about 0.1 µs (τ 10 ns and 5 ns) | 10⁷ | 100 ns |

**Tests first:**
- `page.test.js`: the dropdowns list every medium in order, the two without setups disabled; the pump list follows the medium; a choice gives `configFor`'s config, a new simulation, cleared charts, the setup's slow motion and the new slider ranges and units; a language switch keeps it; Fire shows only for a flashlamp, fires (flash at the current t) and plays a paused loop; the readout rows by pump kind; `flashThreshold` is called once per config change; the pump now drives the levels, cartoon and bench; no inversion canvas any more.
- `bench-pumps.test.js`: `pumpNow` for each kind (a flash at its peak gives `xPeak`; before Fire 0; a discharge its x; two levels w).
- The frame budget, with the real engine, for every setup at its starting slow motion and at the slider's ends (60 Hz, 1.5× the measured worst frame, inside 1500), and a ruby flash fired on the page.
- `site-files.test.js`: every `data-laser-*` name `page.js` needs, once; the words of every medium and pump in both languages.

**Traps:** a choice must not keep the old bench's flash (a flash on a bench without a lamp is refused by `advance`); a slider range from the previous bench (the value must be read from the new config); `flashThreshold` per frame (60 ms in Node); a `<select>`'s `change` event, not `input`, in some browsers; option words set with `textContent`, never as markup; the number box's unit and factor change with the bench (mA against A); a disabled option the keyboard can still reach in some browsers (the page refuses a medium without setups anyway).

**Found while building and testing:**
- **Three and two levels broke the cartoon's excited share.** y/(1 + y) divides by zero at y = −1, and ruby starts at y = −n_t. The share N₂/N_t = (N_t + N)/(2N_t) for three and two levels came forward from 7d; the level picture's y is clamped at 0 until 7d draws it below zero.
- The no-break space between a number and its unit was lost once when `page.js` was rewritten: the file write turned the `\u00a0` escape into the invisible character itself, and 8 tests caught it. Both the space and the pattern that reads it back are written as escapes.
- A `<select>` fires `change` only when its value changes; the first test helper fired it anyway and counted one choice twice. `choose()` now fires only on a new value, and `chooseAfresh()` goes through another bench first.
- 60 frames at 10⁴ are only 100 µs, before the flash peaks at 0.3 ms: the tests of the pump driving the pictures run 240 and 200 frames.
- The new page tests first took 9 s, because each reset chose ruby again and searched its threshold flash (60 ms in Node) every time. The resets now go through He-Ne or CO₂ (5 s).
- The highest output since Fire is read at the chart's points (480 a second of screen time), so a spike narrower than their spacing can be read a little low. This is a known limit; the chart has the same resolution.
- The dye's first frame after the pump goes off costs 414 steps, more than its running frames (48 at most).

**Measured** (the real engine, 60 Hz frames at each bench's starting slow motion; 30 frames at every corner of the pump and coupler sliders, then 10 with the pump off; worst frame in solver steps, of 1500): ruby 647, two-level with a laser 739, two-level with a flashlamp 722, Nd:YAG with a flashlamp 495, Nd:glass 437, dye 414 (after the pump goes off), Nd:YAG with diodes 338, Ar⁺ 332 (after the pump goes off), CO₂ 277, He-Ne 64, Ti:sapphire 48. Every bench has at least 2× headroom, so the starting slow motions of the scope card stand; `page-choose.test.js` bounds each at about 1.5× its own worst.

**Browser check** (Claude in Chrome, `http://127.0.0.1:5500/?view=laser`):
- The medium dropdown lists the 11 media, CaF₂:Dy and the diode laser disabled with "(coming later)"; the pump dropdown follows the medium.
- Every bench runs at its starting slow motion without the "behind" note, with its own rows. He-Ne: 5 mA, threshold 361 µA. Ar⁺ and the dye: no period (overdamped). The two-level atom: "never reached".
- Ruby fired at 1000 J: "pump now ÷ threshold" rises to 5.72 at 0.3 ms, the spikes reach 462 kW, and the beam and the cartoon light up.
- The light theme and Armenian keep the chosen bench.
- At 375 px (the page in a 375 px iframe, because the window would not shrink) nothing sticks out.
- The level picture stands alone, centred, 760 px wide.
- No console errors.
- Found: in the stage's narrow middle column the two dropdowns were 165 px wide each, which cut the Armenian names ("Երկմակարդակ ա…"). Their columns are now at least 15rem, since the longest name that can be chosen (the dye's) is 192 px of text. They stack in the narrow column and sit side by side when the panel is wide.

**Breaks** (73 for this stage: 48 in its own section of `tests/laser/mutations.js`, 22 from the review in a section of their own, 3 rewritten in place; 575 in all): `pumpNow` (the two-level atom's x, the pump before Fire, three levels' w not over w_th, the slider's energy or t_p instead of the fired flash's, the flash timed from t = 0, a flash on a bench without a lamp, its errors' name); the starting slow motion (He-Ne at 10⁴, looked up by the medium alone, the slider stopping at 10⁶); the units (a current in mA read as A, He-Ne in A, a flash in W); the readout rows by kind, "never reached"; the threshold flash searched on every move or not for a new mirror; a new bench keeping the old simulation or slow motion, a new medium always taking its first pump, a medium or pump the bench cannot run accepted, options added to the old ones, a medium not built yet offered or not marked, a medium with no name; Fire shown without a lamp, Fire on a paused page, the peak since Fire (its start, its update, Reset); the cartoon's excited share; the level picture's bar below zero, its pump from the steady numbers, the glow; a steady line on a flash's chart; the pump slider's name, a new bench's sliders and readouts; Fire and hidden rows shown by their own display rules; two words without a language; and from the review: the gauge's dashed line at the pump (three and two levels), `smallSignal` for each scheme, the threshold flash searched during a drag or not after it, "…" while it waits, `pumpNow` asked more than once a frame or kept for a new sim, the drawing's pump name, the steady line at 0, the two-level atom's x and `xPeak`, a failed choice or mirror leaving the bench half taken, the config changed in place. 13 entries went with the code they broke (the inversion chart, its pointer, its shared points and its pump line; the old glow) and 26 were brought up to date with the rewritten `page.js`. The first full run after the review missed 2 (a failed choice leaving the config half taken, and the config changed in place): the failure test now moves a slider afterwards and checks the config the engine is given. The last run: 575 of 575 caught, in 169 s.

**The mutation check made faster** (asked by the owner, during this stage): a full run had grown to 25 minutes (1525 s), because every one of the 575 mistakes ran all 30 test files. One failing test is enough to call a mistake caught, so `tests/laser/mutation-check.js` now runs the test files one at a time (each with `node --test`, as the suite does) and stops at the first that fails. The files named after the changed file go first (`bench.js` → `bench.test.js`, `bench-pumps.test.js`; a name must be followed by "." or "-", so "benches" does not count), then the others quickest first, timed on the unchanged copy. One mistake per processor core less one runs at once (half the cores before). A file is the smallest piece: `node --test` holds a file's results until the file ends, and its tests are synchronous, so it cannot be stopped at its first failing test. Measured on the same 575 entries: 1525 s before, 146 s after, and every verdict the same (575 caught both ways). TIMED OUT now means a file ran past 60 s before any file failed; a slow file after the failing one is not run, so it is not reported. Its own test (`mutation-check.test.js`) checks that the baseline times every file, that a run stops at the first failing file, that a missed mistake runs every file, and the order.

**Review outcome** (`/code-review` on Opus 5.5, 13 findings, all fixed):
- The gauge's dashed line (the gain without light over the loss) was drawn at the pump x for every medium. That is right for four levels only: ruby at the flash's peak has x = 5.72 but g₀/g_th = 8.59, and the two-level atom, which never gains, had its line at w. `pumpNow` now gives `smallSignal`, the inversion the medium would reach with no photons (x; n_t(w − 1)/(w + 1); −n_t/(1 + 2w)), and the level picture draws its line there (at 0 or above until 7d draws below zero). Tested for Nd:YAG's flash (equal to x), ruby before Fire and at the peak, and the two-level atom.
- Dragging the output mirror on a flashlamp bench searched the threshold flash at every step of the drag (60 ms each in Node, 8 ms in Chrome), so the slider stuttered. The readout shows "…" during a drag and the search runs once, when the slider is let go (`change`) or a number is typed.
- `bench.pumpNow` (a whole `derive`) was asked up to four times a frame, by the glow, the cartoon, the level picture and the readouts. It is kept for the same simulation and the same derived numbers: about once a frame (30–32 calls in 30 frames, tested).
- At 320 px the dropdowns' 15rem columns stuck out of the panel: `minmax(min(15rem, 100%), 1fr)`.
- The drawing named the pump "pump diodes" on every bench, and the bench's alt text described diodes: the label is now the chosen pump's (`bench.pumps.<kind>`, else the general `parts.pump`), and the alt texts of the bench and the power chart fit every laser.
- A choice or an output mirror whose threshold search threw left the page half changed (the new config with the old numbers): everything is worked out first and taken together (`numbersOf`, `take`), and the config is copied, never changed in place. Tested with a threshold search made to fail.
- Below threshold the steady output line was drawn at 0: only when the steady output is above 0.
- `derive` gave the two-level atom x = 0, as if it had a threshold and no pump: x and a flash's `xPeak` are null for it.
- `pumpNow`'s `power` had no reader: dropped.
- `docs/laser-progress.md` still called 7c "being started", and `Instructions/HTML-CLASSES.md` still described the inversion chart and none of the new markup: both brought up to date.
- `draw-plots.test.js` still looped over the inversion chart's small size, and a comment counted five canvases: removed and corrected.
- `page-helpers.js` held the no-break space as the invisible character itself: written as `\u00a0`.

**Browser check after the review** (Claude in Chrome, the same address): the first load drew the gauge's line at w, from a `draw-levels.js` Chrome had cached (0 B transferred); a hard reload (Cmd+Shift+R) fixed it, as in stage 7b. Then: the engine gives `{ x, w, smallSignal }` (the two-level atom: x null, w 6.55, smallSignal −0.54) and `derive` the two-level x null; the two-level atom's dashed line sits at 0, and its drawing names the pump "Pump laser"; ruby, fired at 1000 J and paused at 225 µs (5.51 × threshold), has its dashed line at its own small-signal gain, not at the pump; the bench's alt text no longer speaks of diodes; dragging ruby's output mirror shows "…" under the chart and one search when it is let go (566 J at 6.6 %); at 320 px the two dropdowns stack inside the panel (x 41–279 px within 24–296); no console errors.

### Stage 7d — Each pump drawn, and three and two levels ✅

**The owner's choice** (15 Nov 2026, "Draw each pump"): diodes as now; a flashlamp, a tube beside the rod that glows as strongly as the flash; a gas discharge, where the tube is the medium, with electrodes at its ends and the current; a pump laser, a beam going into the medium. With this stage the level picture and its gauge also show three and two levels as they are (the stage-7c clamps at 0 go).

**Scope card.** UI only; no engine change.

| Part | What it does |
|---|---|
| `bench.draw(view, labels, light)` | `light.pumpKind`: `"diode"`, `"flashlamp"`, `"discharge"` or `"laser"` (`bench.KINDS`, the engine's pump kinds); missing or unknown draws the diodes. `light.pump` (0–1) is how strongly each pump glows, as before |
| Diodes | as before: a strip under the rod and 7 arrows of light up into the rod |
| Flashlamp | a tube under the rod, as long as the diodes' strip and a little thicker, with a metal cap at each end (its electrodes); its gas glows with `light.pump` (dark before Fire); 7 arrows of light up into the rod while it glows |
| Discharge | no rod: the medium is a gas tube on the axis, 0.86 of the space between the mirrors, as tall as the rod, so the rays run inside it. Its bore glows with `light.pump`; two electrodes stick down from it near its ends, wired to a power supply that stands on the bench in the middle; an arrow on each wire shows the current (up into the left electrode, down out of the right) while it flows. The tube stands on two posts near its ends, outside the electrodes, so no wire crosses a post |
| Pump laser | the rod as for diodes; the pump laser is a box on the bench under the rod's left half; its beam runs right to a small mirror at 45° under the rod's middle, which turns it up into the rod (an arrowhead at the rod). The beam shows only while the pump is on, with its alpha from `light.pump`; the small mirror stands on a post |
| `bench.layout(w, h)` | gains `flashTube`, `tube` (with its `bore`), `electrodes` (two), `supply`, `wireY`, `posts` per kind, `pumpLaser`, `fold` and `beamY`, checked for every width from 280 to 1400 px like the rest |
| `levels.draw(view, picture)` | `picture.scheme` (`"four-level"`, `"three-level"`, `"two-level"`; missing is four) and `picture.n_t` (N_t/N_c, for three and two). y and the small-signal gain may now be below zero |
| Four levels | as before |
| Three levels | three lines: the pump band, the upper level, and the ground, which is also the lower laser level (its word `groundLower`, else `ground`). The laser arrow runs from the upper level down to the ground. Two bars: the share of ions up, N₂/N_t = (n_t + y)/(2n_t), on the upper level, with a mark at threshold, (1 + 1/n_t)/2 (54 % for ruby), and the share down on the ground |
| Two levels | two lines, the upper level and the ground; the pump drawn twice, up and down, equally wide: the pump light takes atoms down as fast as up (§2.1). The same two bars and mark: the upper bar never reaches the mark |
| The gauge, three and two levels | from −n_t·1.15 (every ion down) up to max(small-signal gain, y, 1)·1.15, and at least a quarter of the depth below zero, so the loss line and its word fit. A zero line with the word `transparent`; a gain below zero (the medium absorbs) is drawn down from it, paler |
| `levels.scaleMax`, `levels.scaleMin` | the top and bottom of the gauge. The top no longer takes x (it was there for the dashed line, which is now `smallSignal`; for four levels they are equal) |
| `page.js` | passes `pumpKind = config.pump` to the bench; `scheme`, `n_t`, y and the small-signal gain unclamped to the levels; the laser arrow's rate y·p over the threshold pump rate, which is 1 for four levels and n_t + 1 for three and two (so a steady laser draws x − 1 for every scheme; for ruby y·p alone is 12.5 times that) |
| Words | `levels.words.groundLower`, `levels.words.transparent`; the alt texts of the bench and of the level picture for every medium and pump; the theory and status unchanged |

**Decisions:**
- The pump laser's beam (532 nm, green, for the dye and Ti:sapphire) is drawn in the theme's pump colour, like every pump's light, as the laser's own rays are in the theme's colour (1064 nm is invisible). Colour from wavelength (§11.5) comes in stage 11, for both beams at once.
- The medium stays schematic: a rod for every solid and for the dye (to scale, the dye's 0.2 mm jet in a 0.5 m cavity would be a line), a tube for the three gases.
- The cartoon of atoms keeps its stage-7c share N₂/N_t for three and two levels; it does not show a ground atom absorbing the laser light (an illustration; noted as a limit).

**Test values:** ruby before Fire, y = −n_t = −11.54: the upper bar empty, the ground bar full, the gain bar from zero down to the gauge's bottom less its 15 %; the two-level atom with its laser, steady y = smallSignal = −n_t/(1 + 2w) = −0.538 (w = 6.55, n_t = 7.59): its bar and dashed line just under zero; ruby's threshold mark at (1 + 1/11.54)/2 = 0.543.

**Tests first:**
- `draw-bench.test.js`: every new part inside the canvas at every width, in its place (the flashlamp under the rod with room for its light, the tube on the axis between the mirrors and around every ray, the electrodes under the tube's ends, the supply on the bench between them, posts outside the electrodes, the pump laser box under the rod clear of its posts, the fold under the rod's middle); for each kind the colour, clear/restore, inside and word checks; what each kind draws (the lamp's glow and light only with the pump; no rod for a discharge, the bore's glow and the current arrows with the pump; the pump beam's two legs and arrowhead with the pump, its alpha following it); an unknown kind is the diodes; `KINDS` is every pump kind of the engine.
- `draw-panels.test.js`: three-level and two-level pictures in the shared checks; the lines drawn per scheme (no lower level for three, no pump band for two); the laser arrow from the upper level to the ground for three levels; the two bars as the shares, the threshold mark; the two-level pump arrows up and down, equally wide; `scaleMin`/`scaleMax`; the gauge's zero line and word only below zero; a negative gain drawn down from zero; the dashed line below zero.
- `page-choose.test.js`: the bench gets the chosen pump's kind; the level picture gets the scheme, n_t, the unclamped y and small-signal gain, and the scaled laser rate (y·p/(n_t + 1) at every frame while ruby lases).
- `site-files.test.js`: the new words in both languages (by the existing check of `data/laser.json`).

**Found while building and testing:**
- The scope card's "ruby lasing: about x − 1" for the laser arrow holds only for a steady laser. Ruby spikes: at 1000 J the arrow's rate y·p/(n_t + 1) reached 53 against x = 5.08 in a spike, about ten times the steady rate. The page test now checks the formula itself at every frame while ruby lases, not a range.
- The mistakes check missed one entry on its first run: `groundLower` dropped from the words `page.js` reads, which left ruby's ground named "Ground" instead of "Ground (lower level)". A page test now checks that the level picture gets every word of `levels.words` in both languages.

**Breaks** (83 for this stage: 61 new, 22 rewritten; 636 in all): the bench's pumps (each kind's parts, the flashlamp's glow and its light, dark before Fire, the gas tube in place of the rod, its bore and glow, the electrodes, wires, supply and current arrows, the posts outside the electrodes, the pump laser's box, beam, fold mirror and arrowhead, an unknown kind, `KINDS`), the level picture (each scheme's lines and words, the ground as the lower level, the two-level pump both ways, the laser arrow's end, the two share bars and the threshold mark, `scaleMin`, the top's floor for the loss word, the zero line and its word, a gain below zero drawn down and paler), the page (`pumpKind`, the scheme and n_t, the unclamped y and small-signal gain, the laser arrow's scale, the level words), the data (`groundLower`, `transparent` in each language); and from the review: the tube by its gain, its glow from amperes, `PUMP_OFF`, the box against the posts' feet, the arrowheads in the tube, the mark when n_t ≤ 1, the loss word above the gauge, the arrow not over `thresholdRate`. 15 entries were rewritten for the new drawings and 7 for the review's changes. The first run missed 1 (`groundLower` left out of the words `page.js` reads; see above). The last run: 636 of 636 caught, in 180 s.

**Browser check** (Claude in Chrome, `http://127.0.0.1:5500/?view=laser`, after a hard reload):
- Each pump as itself: Nd:YAG with its diode strip; ruby's flashlamp dark before Fire, then glowing and lighting the rod as the flash rises and falls; He-Ne, Ar⁺ and CO₂ as a gas tube with its electrodes, wires, supply and current arrows, the rays inside its bore; the dye and Ti:sapphire with the pump laser's box, its beam turned up into the rod by the small mirror.
- The level picture: ruby before Fire with every ion down and its gain bar below zero, the "Transparent" line, then climbing past the threshold mark and lasing down to the ground; the two-level atom with its pump drawn up and down, its gain just under zero.
- The light theme, Armenian, and a 360 px phone (the page in a 360 px iframe): everything fits, no console errors.
- After the review: He-Ne at the top of its current (15 mA, no gain) glows and shows the current's arrows; at 360 px the pump laser's box stands clear of the posts' feet, and Ar⁺'s arrowheads sit in the gaps between the mirrors and the tube.

**Review outcome** (`/code-review` on Opus 5.5, 10 findings: 9 fixed, 1 left with a reason):
- A discharge's tube glow and current arrows followed its gain x, which the "optimum" law takes back to 0 at the slider's top: He-Ne and CO₂ were drawn dark and without current at their highest current. The bench now gets the current's share of the slider's top for a discharge (`benchPumpNow`); the cartoon keeps the gain. Tested at four slider positions for the three gases.
- The flashlamp's glow (alpha from 0.2) and light (from 0.3) showed for any pump above 0, and a flash's tail only reaches 0 after hundreds of t_p: after one Fire the lamp looked lit for half an hour of screen time. A pump under 1 % of full (`PUMP_OFF`) is drawn off, for every kind.
- At phone widths the rod's left post's foot (18 px) ran up to 4 px into the pump laser's box; the box now starts clear of it and ends clear of the small mirror's post (`POST_FOOT`; the test checks the feet, not only the posts).
- The threshold mark (1 + 1/n_t)/2 was drawn above its bar when n_t < 1 (the two-level atom at couplers past about 55 %): no mark then, as even every ion up is short of threshold.
- For n_t from about 2 to 7 the loss word rose above the gauge (5.8 px of room at 220 px): it now goes under its line when the line is too near the gauge's top; tested at every width for both schemes and n_t from 0.9 to 40. `ABOVE_ZERO`'s comment said "share of its depth below zero" while the code multiplies n_t: corrected.
- The rays' arrowheads stood midway between each mirror and the rod, which a discharge does not draw, so they sat in the gas tube's glow: they now use the medium drawn, the rod or the tube.
- The threshold pump rate (1 or n_t + 1) was physics in `page.js` and repeated in `bench.js`: `derive` now gives `thresholdRate`, and `powerAtTwiceThreshold` is `powerPerP·thresholdRate`. The scope card's "no engine change" has this one exception.
- `KINDS` was said to be "in the dropdown's order", which has no single order: corrected.
- `docs/laser-progress.md` was still at 7c: updated with this commit.
- Not changed: the reviewer suggested the page pass the share of ions up to the level picture, which `page.js` also works out for the cartoon. The picture already gets y and n_t, which its gauge needs anyway, and draws its bars from them; a second copy of the same number could let the bars and the gauge disagree.

### Stage 8 — Q-switch parts
- **Build:**
  - η_E(x) by bisection;
  - E_out, P_peak and Δτ_p (§4.3), with the 3-level factor ½;
  - time-varying losses: rotating prism R_eff(t), Pockels cell cos²Γ(t), and a saturable absorber as one more ODE (N_g a density; convert S = φ/V);
  - the parasitic end-face cavity R ≈ 0.076.
- **Tests:**
  - §12 η_E(3) = 0.9405 and Δτ_p = 15.65 ns exactly;
  - a simulated instant switch gives energy within 5 % and width within 20 % of the formulas;
  - the absorber under continuous pumping gives more than one pulse;
  - the prism slowed ×100 gives several weak pulses;
  - ruby 20×1.5 cm: order of magnitude only, assumptions written down (D7).
- **Traps:**
  - stop the integration exactly at the switching time; don't step across the jump;
  - φ vs S in the absorber equation;
  - the build-up needs the β seed.

### Stage 8a — Q-switching in the engine (`qswitch.js`, `bench.js`, `ode.js`)

**The owner was away** (16 Nov 2026: "don't ask me any questions for now, just do the work"). Every choice below that would have been theirs is marked *(decided without the owner)*, for them to review.

**The split** *(decided without the owner)*: as in stage 7, the engine first (8a), then the page (8b), one commit each. 8a changes nothing on the page; the page keeps running because the new config and simulation fields have their defaults (`qSwitch: "none"`, `opensAt: null`, `absorber: null`).

**Doc audit** (§4.3, §9.3, §9.4, §9.5, §11.2, §12; every hit of "Q-switch", "shutter", "prism", "Pockels", "bleach", "absorber", "η_E", "giant"):
- §4.3's three formulas recomputed: x = 3 gives η_E = 0.940480 and Δτ_p = τ_c·xη_E/(x − 1 − ln x) = 3.13011 τ_c, 15.6505 ns for τ_c = 5 ns (§12: "η_E ≈ 0.94, Δτ_p ≈ 16 ns"). P_peak follows from the dimensionless equations with the pump and the decay left out: dp/dy = −(y − 1)/(εy), so p is highest at y = 1, p_peak = (x − 1 − ln x)/ε, which is §4.3's P_peak. E_out follows from the final inversion of x·η = −ln(1 − η).
- §4.3 said the energy is half for three levels. So is the peak power (p = 2Bτφ: the same p is half the photons), and the width E/P is the same. Fixed in the doc.
- §9.5's prism: R_eff(θ) = R·exp(−(θ/θ_tol)²) falls to e^(−10⁷) when the prism is turned away, a loss the solver cannot use. So there is a floor *(decided without the owner)*: R_eff = R·(ℓ + (1 − ℓ)·exp(−(θ/θ_tol)²)), with the same leak ℓ = 10⁻⁴ as the Pockels cell's polarizer. θ is wrapped to one turn, so the prism lines up again every turn. Its window is θ_tol/Ω = 0.32 µs at 500 rev/s and 1 mrad, as §9.5 says. Written into §4.3's table and §9.5.
- §9.3: T = cos²Γ is 0 when the cell is closed, an infinite loss. The same floor: T = ℓ + (1 − ℓ)cos²Γ. Γ falls from π/2 to 0 evenly over the switching time t_s = 5 ns ("~nanoseconds") *(decided without the owner)*. Written into §9.3.
- §9.4: N_g is a density and S the photon density φ/V (the φ against S trap of D-list). In the rate equations' units the filter's ground share a = N_g/N_a obeys da/dt′ = (τ/τ_a)(1 − a) − b·a·p, with b = σ_a·c·τ/(A_a·L_e·p₁), p₁ the p of one photon (Bτ for four levels, 2Bτ for three). This is the same σc/V that gives the medium's B, with the filter's own σ_a and area. Its loss is a·(−ln T₀) per pass, T₀ its transmission when unbleached. Each photon absorbed bleaches one molecule, so the photon loss and the bleaching are one process (checked: σ_a·c·φ·N_g·l_a/L_e both ways). Written into §9.4, with "under a continuous flash" corrected to "under continuous pumping".
- §4.3's parasitic end-face cavity (R ≈ 0.076) needs a second photon variable, so it moved to stage 13a, with the Brewster windows *(decided without the owner)*. Noted in §4.3.
- §11.2's "(y − 1) becomes (y − γ(t)/γ₀)" is what the code does: γ(t)/γ₀ = 1 + q, with q the switch's extra loss over the open cavity's γ.

**Scope card.**

| Function | In | Out | Doc |
|---|---|---|---|
| `qswitch.energyUse(x)` | x > 1, the inversion at opening over threshold | η_E, solving x·η = −ln(1 − η) by bisection (in u = −ln(1 − η), so a large x does not round 1 − η to 0) | §4.3 |
| `qswitch.giantPulse({ x, N_p, V_a, nu, tau_c, gamma, gammaOut, scheme })` | as named; gammaOut = −ln R₂ (a round trip's), at most 2γ; scheme "four-level" or "three-level" | `{ eta_E, energy (J), peakPower (W), width (s) }`, half the energy and peak for three levels | §4.3 |
| `qswitch.cellLoss({ leak, switchTime, since })` | the leak ℓ, t_s (s), the time since the voltage started to fall (s; below 0: still closed) | the cell's extra single-pass loss −½ ln(ℓ + (1 − ℓ)cos²Γ), Γ = (π/2)(1 − since/t_s) inside [0, t_s] | §9.3 |
| `qswitch.prismLoss({ leak, rotation, angleTolerance, since })` | rev/s, rad, s since the prism lined up | −½ ln(ℓ + (1 − ℓ)e^(−(θ/θ_tol)²)), θ = 2π·rotation·since, wrapped to one turn | §9.5 |
| `qswitch.withLoss({ f, eps, loss })` | a rate-equation f, ε, the extra loss over γ as a function of t′ | f with −loss(t′)/ε added to ds/dt′ | §11.2 |
| `qswitch.withAbsorber({ f, eps, depth, recovery, bleach })` | depth = −ln T₀/γ, recovery = τ/τ_a, bleach = b | f for [y, s, a] | §9.4 |
| `qswitch.ABSORBERS` | | Cr⁴⁺:YAG (σ_a 4.3×10⁻¹⁸ cm², τ_a 3.4 µs) and cryptocyanine (8×10⁻¹⁶ cm², 22 ps); not verified against printed sources | §9.4 |
| `ode`: optional `peakOf` | the index of a state entry | `peak: { t, value }`, its highest value at t0 and the accepted points; `null` when not asked | |
| `bench.qSwitchesFor({ medium, pump })` | | `["none", "cell", "prism", "absorber"]` for the three flashlamp rods, `["none", "absorber"]` for the diode-pumped Nd:YAG, `["none"]` for the rest | |
| `bench.withQSwitch({ config, qSwitch })` | | a new config, the same bench with that Q-switch and its starting values (and without the fields of the last one) | |
| `bench.derive` | | gains `qSwitch` and `lossClosed`, the loss with the switch closed in units of the open cavity's (null without one) | |
| `bench.start`, `bench.fire` | | the simulation gains `opensAt` (when the shutter opens: Fire's time + qDelay; null before Fire and without a shutter) and `absorber` (the filter's ground share, 1 at the start; null without a filter) | |
| `bench.advance` | | gains `peak: { t, power }`, the highest output at the solver's points within the call; starts a new solver call where each of the prism's windows opens (6 θ_tol before it lines up), so a long call cannot step over it | |
| `bench.lossNow({ sim, config })` | | the loss now, in units of the open cavity's: 1 + q | |
| `bench.giantPulse({ sim, config })` | | §4.3's prediction for the inversion of `sim` (null at or below threshold and for the two-level atom) | |

**Decisions** *(all decided without the owner)*:
- Which benches get a Q-switch: the three flashlamp rods (ruby, Nd:glass, Nd:YAG) get all three switches; the diode-pumped Nd:YAG gets the filter, which gives a train of pulses from continuous pumping (§9.4; this is how small passively Q-switched lasers work). A cell or a prism on a continuous bench would need a repetition rate, which the page has no control for yet; the gases, the dye and Ti:sapphire get none (their gain is too low or their upper level too short to store energy).
- The shutter opens `qDelay` after Fire, and by default `qDelay` is when the inversion behind the closed shutter is highest at the default flash energy: measured, ruby 1.00 ms, Nd:glass 0.60 ms, Nd:YAG 0.55 ms (y = 4.32, 3.45 and 7.73 there).
- The filters: cryptocyanine for ruby (the dye of the first Q-switched ruby lasers) with T₀ = 0.5; Cr⁴⁺:YAG for the neodymium lasers, T₀ = 0.8 for Nd:glass (0.5 never opened: the threshold behind it, 6.3, is above Nd:glass's peak, 3.45), 0.5 for the Nd:YAG rod, 0.95 for the diode bench. The filter's beam is as wide as the mode (A_a = A).
- The prism turns at 500 rev/s (§9.5) with θ_tol = 1 mrad; the cell switches in 5 ns; both leak ℓ = 10⁻⁴.
- The prism turns all the time, and Fire times the flash so that it lines up `qDelay` later. It also lines up once every turn before and after that: at 500 rev/s these are 2 ms away, outside the flash, but a faster prism gives pulses at each of them. Before the first Fire the prism counts as turned away (there is nothing to time it to, and no inversion to release).
- The closed shutter's photons: `liftToSeed` raises the photons to the seed's level in the open cavity before each call. Behind a closed switch, which loses 1 + q times as much, that level is too high, so the photons fell back in every call, costing 64 steps a call behind Nd:YAG's closed cell. The bench now lifts with β/(1 + q_now): 4.4 steps a call, and still never above the steady level.
- The page's frame budget (1500 steps) stays. Ruby's dye filter recovers in 22 ps, and its pulse costs about 3000 steps, so the page falls 1 or 2 frames behind there; the note "behind" needs a quarter of a second's frames, so it does not show.

**Found while building and testing:**
- The first plan cut the run at the cell's switching and at both edges of the prism's windows, with a step limit inside each. The mistakes check missed three of those guards, so they were measured with one long call across each opening. Only the cut where the prism's window opens matters: without it a 200 µs call steps right over the lined-up prism (12 steps, no pulse). The cell's cut changed no result (7 % fewer steps), and the step limits changed nothing, even at 5 rev/s. Those were removed, and a test now makes the long call.
- A closed shutter first cost 64 steps a call (Nd:YAG): `liftToSeed` raised the photons to the open cavity's seed level, and they fell back in every call. Lifted with β/(1 + q_now), 4.4.
- The "no light at all" run used to check the closed shutter still lased with Nd:YAG: β = 0 removes the seed but not the one photon the run starts with, and in ln φ even e^(−10⁵) photons come back above threshold. The test now integrates the photon-free equation itself, as `bench-pumps.test.js` does.

**Test values** (measured in stage 8a):
- A cell opened at the inversion's peak, 5 ns switching: ruby 6.638 J, 522.2 MW, 12.71 ns; Nd:glass 1.82 J, 47.6 MW, 38.3 ns; Nd:YAG 0.163 J, 10.35 MW, 15.7 ns. That is §4.3's prediction to 0.01–0.02 % for each, with the peak 43–170 ns after the voltage starts to fall. A 0.01 ns switch gives the same.
- The closed shutter: about 10⁻⁵ W (ruby) and 2×10⁻⁷ W (Nd:YAG) for the whole millisecond; the inversion is that of no light at all to 2×10⁻⁵.
- The prism at 500 rev/s, ruby: one pulse of 120 MW. It comes before the prism is fully lined up, so it is weaker than the cell's (§9.5, added to the doc). At 5 rev/s: 15 pulses, the largest 0.93 MW. Nd:glass: 46.7 MW at 500 rev/s, 6 pulses at 5 rev/s; Nd:YAG: 2.1 MW at 500 rev/s (its pulse builds up slowly), 18 pulses at 5 rev/s.
- The filter: ruby, one pulse of 210 MW at 631 µs, the dye bleached to 13 %; Nd:glass (T₀ 0.8), 28.2 MW at 356 µs; the Nd:YAG rod, 7.28 MW at 353 µs; the diode bench, a pulse of 2.57 kW every 299.9 µs (without the filter: a steady 1.7 W).
- D7, §12's ruby 20 × 1.5 cm, "10⁻⁸ s pulse, 1–2 J, 10–200 MW". The book does not give the lamp or the mirrors; assumed: a 60 cm cavity, a 50 % output mirror, a flash of 1.2 times the threshold (3225 J), the cell opened at the inversion's peak, 1.05 ms. The model gives 18.6 ns, so the width agrees, but 12.7 J and 685 MW: 6–13 times the book's energy. The model pumps the whole rod evenly and puts all of it in the mode, and the book's lasers did neither. Not tuned to agree; the test checks the width's order of magnitude and pins the energy between 1 and 20 J.
- One long call across the opening, from 100 µs before it: the cell 462 steps (ruby) and 645 (Nd:YAG), the top within 0.02 % of §4.3; the prism (200 µs) 1093 and 1353, the same top as 2 ns calls to 10⁻⁴.
- Page frames (8 calls at slow motion 10⁴, 60 Hz) around each pulse, the worst of 9 starting times: ruby 427 (cell), 650 (prism), 2567 (filter); Nd:glass 418, 461, 564; Nd:YAG 592, 689, 718; the diode bench's filter 406. Behind the closed switch: at most 18.

**Breaks** (85 for this stage: 77 new, and 8 of earlier stages rewritten for the new `advance`, `fire`, `pumpNow` and `flashThreshold`; 713 in all): `qswitch.js` (η_E's bisection and its answer, x = 1, the three-level half, γ₂/(2γ), the peak's − ln x, the energy's x, the γ₂ check, a two-level pulse, the width as E/P, the leak's check and `closedLoss`, the round-trip loss as single pass, the cell's clamp, its Γ = π, cos instead of cos², the prism's wrap, its rad/s, its width, both loss functions against the checked ones, the 1/ε, the filter's bleaching, depth and p, the filters' σ_a and τ_a, the frozen table, depth 0), `ode.js` (`peakOf`: the last point, t0 left out, one past the state), `bench.js` (the setups' switches and defaults, `LEAK`, `SWITCH_TIME`, `withQSwitch`'s fields, the checks, the closed losses, the filter at the start, `opensAt` from the flash, the strange simulations, a shutter before Fire, the loss over γ and its time, the prism's cuts and the stop at a cut, the lift behind the switch, the filter's depth, recovery, bleaching and state, advance's peak, `lossNow`, `giantPulse`'s mirror, volume and x, `flashThreshold` behind a filter, the rotation's cap) and `constants.js` (`ps`). The first run missed 3 (the cell's cut, the step limit inside the windows and the prism's window skipped: see "Found while building"); the second missed 1 (advance's peak taken from the last piece only: a test now spans two lining-ups). The last run: 713 of 713 caught, in 222 s.

**Browser check** (Claude in Chrome, `http://127.0.0.1:5500/?view=laser`, after a hard reload: the cached `index.html` had no `qswitch.js`): the page runs as in 7d, ruby fires, no console errors. In Chrome the engine's ruby cell pulse is 522.2 MW, as in Node, and a step costs 0.7–1.8 µs warmed up, with or without a Q-switch (12 µs on the first, cold call).

**Review outcome** (`/code-review` on Opus 5.5, xhigh, 9 findings; 8 fixed, 1 kept with a reason):
- `qswitch.giantPulse` gave a width of NaN with no output mirror (γ₂ = 0, so energy and peak are both 0): the width is now §4.3's τ_c·xη_E/(x − 1 − ln x) written out, which does not depend on the mirrors.
- The prism lines up every turn after Fire, also before `qDelay` (at 5000 rev/s, a 2.2 MW pulse 200 µs before it), while the comments said `opensAt` is when it opens. **Kept**: the prism really never stops turning, and a fast one does let out pulses during the flash. The comments, the plan's decisions and `CLAUDE.md` now say what `qDelay` means for a prism (a moment it lines up; it does so every 1/rotation), and a test runs a 5000 rev/s prism over two lining-ups.
- The solver's loss function called the fully checked `cellLoss`/`prismLoss` on every evaluation of f (1.15 µs a call against 0.5 µs): `qswitch.cellLossFunction` and `prismLossFunction` now check once and return an unchecked function, as `rates.*.derivatives` do.
- `cutsOf` made every cut before any step, so an absurd rotation (10¹⁷ rev/s) or an hour-long call built an array of 10⁹ cuts or more (a `RangeError`). The rotation is now at most 10⁵ rev/s (§9.5's is 500), and at most `maxSteps` cuts are made, since each needs a step; a test makes an hour-long call on the fastest prism.
- `flashThreshold` gave the open cavity's threshold behind a filter, which must be overcome first: Nd:glass with T₀ = 0.5 showed 29 J for a filter that the default 100 J flash never opened. It now aims at `lossClosed` behind a filter (182 J there), and gives null when even every ion up is short of it.
- Nine solver calls in `bench-qswitch.test.js` used the answer without checking `reachedEnd`: they now go through `reach()`, which does.
- The shutter test (`qSwitch` is a cell or a prism) was written out 7 times, and `shutterLoss` had a dead branch: one `hasShutter(config)`, and `shutterLossFunction` is closed (no opening time yet) or the cell's or the prism's function.
- The closed shutter's loss −½ ln ℓ was written out three times: it is now `qswitch.closedLoss(leak)`, used by `derive` and the run. The leak's check is still in `bench.js` too, on purpose: every error names the function the page called (engine rule).
- An XOR of two booleans (`(sim.absorber === null) !== (config.qSwitch !== "absorber")`) checked the filter's state: two plain `if`s now, each with its own message.

### Stage 8b — Q-switching on the page ✅

**The owner was away for the first build** (as for 8a), which offered all three of 8a's Q-switches. Choices made then are marked *(decided without the owner)*. The owner then came back mid-stage and asked for three changes, which this card describes as built:
- the Q-switch as an **On/Off switch right under the laser**, not a dropdown, and turning it on or off **must not start the chart again**;
- **one Q-switch only**: asked which, the owner chose the bleachable filter (the engine's `"absorber"`) over the Pockels cell and the rotating prism. The cell and the prism stay in the engine (8a), with their tests; the page and the drawing no longer use them;
- **Fire right under the laser too**, beside the switch;
- then: **Fire right under the lamp, looking like a button anyone would press, and a flash that is much easier to see**, with visual effects;
- then: the lamp's **grey caps and glass edge on the light theme in a bright colour** ("only change the color").

**Scope card** (as built). The page shows what stage 8a built, for the filter. A few engine additions, so that `page.js` keeps doing no physics.

| Part | What it does |
|---|---|
| `bench.controls(config)` | gains `absorberT0`, `{ name, min, max, log }` like `pump`: 0.2–0.99, linear; null without a filter |
| `bench.switchNow({ sim, config })` | `{ loss, open }` for a bench with a Q-switch, null without: `loss` = `lossNow`; `open` = (lossClosed − loss)/(lossClosed − 1), 0 closed to 1 open (for the filter, the share bleached; 1 when the closed switch adds nothing) |
| `bench.carryOver({ sim, config })` | the simulation going on with the config's Q-switch: atoms, photons, flash and time kept; `opensAt` null (a shutter closed until the next Fire), `absorber` 1 (a dark filter) or null. The On/Off uses it, so the run is not started again |
| `derive` behind a switch on a steady pump | no steady state (`ySteady`, `P_out`, `slope`, `T_opt`, `T_best`, `period`, `t_damp` null: it pulses), and behind a filter `pumpThreshold` is the closed filter's, `lossClosed` times the open cavity's |
| `bench.pumpNow` | gains `overThreshold`: the pump over the pump that starts the laser now (x without a switch; behind a filter x/L for four levels, w over (n_t + L)/(n_t − L) for three, null when n_t ≤ L; null for two levels). The page's "Pump now ÷ threshold" reads it |
| The row under the drawing | `data-laser-under`, right under the bench's canvas, a grid: Fire in the middle, under the drawn lamp (moved there from the buttons under the sliders; shown on a flashlamp bench), and the Q-switch's group on the left, under the drawn filter (`data-laser-switch`: its name "Q-switch (bleachable filter)" over a `<button role="switch" aria-checked>` with a track, a knob and the word On/Off; shown on the four benches whose `qSwitchesFor` has the filter). Under 760 px the two stack, Fire first. The row is hidden when it has neither |
| Fire | a big `.btn--primary` pill (`.laser-fire`) with a lightning bolt and "Fire the flash". While the lamp is dark (`data-ready="true"`: before the first flash, and once a flash is past its peak and drawn off) a ring of light swells out of it and the bolt pulses; from Fire to the flash's peak, and while it is lit, it waits. Both stand still for reduced motion |
| The flash on the bench | lit, all of it as strong as the flash: the whole bench tinted with the flash colour (`--canvas-flash`: bluish white on dark, warm orange on light), a halo of 6 rings round the tube, broad beams up into the rod, 16 streaks round the tube flickering in screen time, the gas blooming (a canvas shadow, nothing else blooms), arrows into the rod, and the rod tinted by what it absorbs. The lamp's caps and glass edge have their own colour (`--canvas-lamp`: the old blue-grey on dark, bright terracotta on light) |
| On/Off | turns the filter on or off: `withQSwitch(state.config)` (keeping the pump, the coupler and the slow motion), its numbers and threshold flash worked out first, then `carryOver`: the chart, the cartoon, the highest output and Play/Pause go on. A new medium or pump keeps the filter on if the new bench can have it |
| The filter's slider | one more slider row (`data-laser-slider="absorberT0"`, hidden while the filter is off), in %, with its number box. A move changes the config through the same `numbersOf`/`take` as the others and moves the threshold flash (found when the slider is let go, as for the coupler); a threshold flash past the pump slider's top reads "never reached" |
| Readouts | `lossNow` (the loss now over the open cavity's: "3.00 ×"), `giant` (§4.3's pulse if the filter bleached now, from `bench.giantPulse`: "4.03 J · 216 MW · 18.7 ns", "—" at or below threshold), both live, while the filter is on. A bench with no steady output (`derived.P_out` null: a flash, or the diodes behind the filter) hides `P_out`, `T_best` and `period`, and shows `peak`, named "Highest output since the start" on a steady pump (`readouts.peakStart`, written into `data-laser-name="peak"`; a flash bench keeps `readouts.peak`) |
| The highest output | from each `advance` call's `peak`, not from the chart's points: a 13 ns pulse falls between two points (0.2 µs apart at slow motion 10⁴). A flash bench starts it at Fire, as before; a continuous bench at its start (choice, Reset, the page's first build) |
| The chart | each piece whose `peak` lies strictly inside it adds that point before its end point, so a pulse between two points shows at its true top. At most one extra point a piece: 4800 in the 5 s window up to 480 Hz, within the history's 16384 up to 1600 Hz. The steady line only when `derived.P_out` is above 0 |
| The level gauge | `picture.loss` (the loss now; none is 1). The loss line, its word and the bars' threshold mark follow it (four levels at y = loss; three and two at (1 + loss/n_t)/2, none when loss ≥ n_t); the scale's top is max(small-signal gain, y, loss)·1.15 |
| The bench | `light.qSwitch` = `{ kind, open }` or none, and `labels.qSwitch` = `bench.parts.qSwitch` ("Bleachable filter"). The filter: a plate on a post in the gap between the back mirror and the rod, shaded by its unbleached share; the left arrowheads between it and the rod. Its name on the top row's left; the transmission then has 0.6 of that row |
| Words | `choose.qSwitch`, `choose.on`, `choose.off`, `bench.parts.qSwitch`, `controls.absorberT0`, `readouts.lossNow`, `readouts.giant`, `readouts.peakStart`; the bench's alt text; the status line and the giant-pulse chapter (the On/Off under the drawing, the filter; the cell and the prism named only as other kinds) |

**Decisions:**
- Only the filter, as an On/Off under the drawing, beside Fire: **the owner's**. Its name on the page says what it is: "Q-switch (bleachable filter)".
- Fire under the lamp, inviting, and a flash with effects: **the owner's** wish; how it looks (the ring, the bolt, the halo, the streaks, the colours) *(decided without the owner)*. The streaks' flicker is an illustration in screen time, like the photon cartoon; everything else follows the pump.
- Stage 9 (several modes and a spectrum panel): **dropped by the owner** (2026-11-16), as too complex; see "Status".
- The filter's slider 20–99 % (20 % holds ruby back past the default flash, so the visitor sees that a filter can be too dark; Nd:glass's 20 % needs 383 J, past its 300 J slider, and reads "never reached") *(decided without the owner)*.
- A filter turned on mid-run starts dark (recovered); turned off, the photons and atoms go on as they are *(decided without the owner)*.
- §4.3's prediction is "if the filter bleached now", live: the filter has no opening time. Paused before the pulse it can be compared with the highest output *(decided without the owner)*.
- The pulse's shape (13 ns) is not visible at the starting slow motion; a close-up of the last pulse is left for later (stage 12's indicators) *(decided without the owner)*.
- Behind the filter the diode bench's threshold and "Pump now ÷ threshold" are the closed filter's (the review's finding: the open cavity's 1.51 W never lases behind it; it needs 3.69 W). The gauge and the "Loss now" readout still show the loss in units of the open cavity's.

**Found while building and testing:**
- The first build (a third dropdown, all three switches) started a fresh run on every switch choice, which wiped the chart: the owner wanted to see the steady beam turn into pulses, so the switch now carries the run over (`carryOver`).
- With the switch on, the steady pump's numbers were the open cavity's, so the page decided by itself that the bench pulses. `derive` now says so (P_out null), and the page reads that.
- A shutter's angle jumped at Fire, and a prism slider moved mid-shot moved the opening: fixed in the engine for the first build (the parked prism, `newRotation`), then removed with the prism.
- The gauge's scale held the closed switch's loss (37 for Nd:YAG's cell) after the opening, pressing the clamped gain into the bottom fortieth: it follows the loss now.
- `.btn--sm` (`css/labs.css`) grows to fill its row; under the drawing it stretched Fire across half the bench and pushed the switch to the far end. The row is a grid now, and Fire a `.laser-fire` (no `.btn--sm`).
- The halo was first 4 rings, which showed as steps in the browser: 6 fainter ones closer together look smooth.
- The equivalent mistake: "a flash showing a steady output" (`P_out` in the flashlamp's rows) was missed, because a flash has no steady output, so the pulsing rule takes `P_out` out and puts `peak` back: the same rows. It now adds the steady pump's threshold, which a test does catch.
- Measured in the first build (the numbers `page-qswitch.test.js` bounds at 1.5×): a frame's worst steps with the filter, through a whole flash (or 600 µs of the diodes) at 10⁴ and 60 Hz: ruby 1500 (its 22 ps dye uses the frame's whole budget for 2 frames, too few for the "behind" note), Nd:glass 955, Nd:YAG with a flashlamp 871, the diodes 562; the pulses' tops as in 8a (210 MW, 28.2 MW, 7.28 MW, 2.57 kW).

**Tests:**
- `bench-qswitch.test.js`: `controls`' filter range (null for every other switch); `switchNow` for the cell (closed, switching, open) and the filter (its bleached share, a clear filter open); the filter on the diode bench (no steady numbers, the closed filter's threshold, checked by runs just under and over it); `overThreshold` for four and three levels, a filter nothing can beat and the two-level atom; `carryOver` (the run kept, the filter dark, a shutter's opening dropped, a flash refused on a bench without a lamp).
- `page-qswitch.test.js` (new): the row under the drawing per bench (Fire, the switch, neither); Fire from the row; On/Off keeping the run, the chart, the flash, the highest output and the settings; the filter kept across a medium or pump; its slider (shown, ranged, %, typed values, a stray event while off); the threshold flash waiting for the slider to be let go and "never reached" past the slider; the readouts with and without the filter; the closed filter's threshold on the diode bench; the loss and the prediction live through a pulse; the chart's peak points; the level picture's loss; the bench's filter and its name in both languages; a language switch; the frame cost of every filter bench.
- `draw-bench.test.js`: the filter's place at every width, its shade, post and outline, the rays mirror to mirror, the left arrowheads clear of it, its name beside the transmission; the cell, the prism and an unknown kind draw nothing.
- `draw-panels.test.js`: the loss line at `loss`; the scale with the loss, coming down after the pulse.
- `site-files.test.js`: the row under the drawing (once, hidden, after the bench's canvas; Fire, then the switch, named by the Q-switch's name, with its word); Fire's bolt (`aria-hidden`), its word and `data-ready="false"`; no dropdown of kinds; the filter's slider row; every animation in `css/laser.css` stopped for reduced motion.
- `page-qswitch.test.js` (the lamp and the second review): Fire's `data-ready` through a whole flash (ready, waiting from Fire, ready again only past the peak and once the lamp is drawn off, written twice in all), none on a bench without a lamp; the filter's transmission kept per bench (off and on, another laser and back, a bench never set); a pump threshold past the slider's top reads "never reached"; §4.3's pulse at 0.5 % and 2 % over threshold (a run made to end there).
- `draw-bench.test.js` (the flash): no flash colour while dark or for another pump; the bench tint first of all, the halo's rings, the beams' corners, the gas and the rod lit; everything brighter, longer or wider with a stronger flash; the streaks outside the tube, pointing out, inside the canvas at every width and moment, flickering, each at its own phase; a view without a time drawn as t = 0; only the gas blooms.

**Breaks** (807 in all): 91 new for this stage (the first build's entries for the cell, the prism, the dropdown and the `lossTop` scale removed with them; 35 for the lamp's button, its light and the second review's fixes), and earlier stages' entries rewritten for the changed code (two pairs became one each where `startBench` and `turnSwitch` now share `showBench`). The run before the lamp: 768 of 769 caught (the equivalent entry above). After the lamp: 803 of 803 caught. After the third review: **807 of 807 caught** (324 s).

**Browser check of the lamp** (Claude in Chrome, the changed files fetched afresh): Fire sits centred under the lamp and its name, the switch on the left; the ring swells round it while ready. Fired, the dark theme's lamp burns white with its halo, streaks and beams, the rod and the bench lit; the light theme's glows orange between terracotta caps (the grey caps the owner disliked are gone). At slow motion 10³ Fire waits through ruby's flash and asks again 2.4 s after the press. A 390 px frame in Armenian: Fire centred, the switch under it, nothing past the edge. One loop, the off-screen canvas not running, no console errors after a reload.

**Browser check** (first build; Claude in Chrome, `http://127.0.0.1:5500/?view=laser`, with the changed files fetched afresh: the server's cache kept the old `css/laser.css`): the row sits right under the bench, "Q-switch (bleachable filter)", the switch and Off; a real click turns it on, the filter appears on the drawing, the diode bench pulses every 0.3 ms (2.57 kW), the threshold reads 3.69 W and the simulated time goes on from where it was (1.49 → 2.51 ms, the chart not cleared). Ruby keeps the filter on; Fire sits beside the switch (after the `.btn--sm` fix) and gives the 210 MW pulse. At 360 px in Armenian with the light theme the row wraps (Fire; the name; the switch) with nothing past the edge. One loop; the canvases off screen are not running; no console errors after a reload.

**Review outcome, first build** (`/code-review` on Opus 5.5, xhigh, 13 findings, on the three-switch dropdown; 12 fixed, 1 declined):
- The diode bench behind a filter showed the open cavity's threshold (1.51 W) and x, so 2 W read "above threshold" and never lased: `derive` gives the closed filter's threshold (3.69 W), and `pumpNow` the pump over it (`overThreshold`).
- The page decided for itself which benches pulse: `derive` now says so (P_out null on a steady pump behind a switch), and the page hides the steady rows from that.
- The gauge's scale kept the closed switch's loss after the opening (`lossTop`), pressing the clamped gain into the bottom fortieth: the scale follows the loss now.
- A threshold flash past the pump slider's top (Nd:glass behind a 20 % filter, 383 J on a 300 J slider) was shown as if it could be fired: it reads "never reached".
- The transmission's half of the top row squeezed the Armenian word on a phone: it has 0.6 of the row, and the switch's name moves left (to the margin at most) to keep 100 px.
- Moving the prism's speed mid-shot moved its opening, and the prism jumped at Fire: fixed in the engine (`newRotation`, the prism parked at Fire's angle), then removed with the prism.
- Two copies of the "worked out once a moment" cache (the pump, the switch): one `keptForMoment`. The filter's state clamped by hand in `advance`: `clampShare`.
- `CLAUDE.md`, stale comments in `page.js`, `css/laser.css` and `sections/laser.html` ("two dropdowns"): updated.
- **Declined**: the threshold flash is searched again on every switch change (8 ms in Chrome for ruby, on a click, never in a frame). Keeping it would need the page to know which inputs the search depends on (the switch, the coupler, the filter's transmission and every field of the setup), a second copy of the engine's knowledge that could fall out of step with it.

**Review outcome, final build** (`/code-review` on Opus 5.5, xhigh, 12 findings on the filter-only page; all fixed, except one part of the eleventh, declined):
- Turning the filter off and on again reset its transmission to the bench's own (the visitor's 30 % back at 95 %): the page keeps it per bench (`state.filterT0`, `withFilter`), also across a visit to another laser.
- Behind a dark filter the diodes' threshold (69.8 W) was shown although the slider stops at 20 W: every threshold past the pump slider's top reads "never reached" (`thresholdText`), as the threshold flash already did.
- §4.3's pulse just above threshold is nothing and lasts for ever (1 + 10⁻⁹: a 128 s "pulse"): the readout shows "—" until the inversion is 1 % over threshold (`GIANT_FROM`).
- The status line and the giant-pulse chapter still described the dropdown and the three switches: rewritten in both languages for the On/Off and the filter.
- `Instructions/HTML-CLASSES.md` still had Fire in the buttons row and no `.laser-under`/`.laser-switch`: added, with `.laser-fire`.
- `CLAUDE.md`: `page-helpers.js` also serves `page-qswitch.test.js`; "both sliders" is now "the sliders".
- `turnSwitch` repeated a dozen lines of `startBench`: both end in `showBench`, and `startBench` works out its own slow motion.
- `nameTheParts` set only the pump's name: `nameThePump` again, called only for a new bench.
- `newState` and `restart` each had the rule for where the highest output starts: `peakFrom`.
- A discharge's Q-switch line in `derive` could never run (`readConfig` refuses a switch a setup does not list): removed.
- The "hidden filter slider does nothing" check was written four times: once, `whileShown`.
- `.laser-stage [hidden]`'s comment named only the readouts and Fire: it lists everything it keeps hidden.
- **Declined**: the page's `switchNow()` wrapper, called redundant, skips a whole `derive` every frame on a bench without a switch; it stays, with that reason in its comment.

**Review outcome, third review** (`/code-review` on Opus 5.5, xhigh, on the whole stage including the lamp; 11 findings, all fixed):
- The flash's streaks flickered for a visitor who asked for less motion: the loop's view has `still`, and the streaks stand still with it (the flash still rises and falls: that is the physics).
- `carryOver` took any inversion: one the medium cannot have (ruby's −N_t to Nd:YAG, more ions up than N_t) is refused, naming `carryOver`.
- Fire was looked up 450 lines after the functions that read it: found first in the build.
- On a phone the switch was pinned to the row's second line, so without Fire an empty line stood above it: both follow the written order (not yet seen in the browser; see "Where we stopped").
- `choose(…, "absorber")` in `page-helpers.js` did not check that the switch came on: it does.
- The page's own 1 % limit for §4.3's pulse (`GIANT_FROM`) moved into the engine (`bench.giantPulse`, `PULSE_FROM`), so every caller gets it.
- `compute` worked out the steady numbers behind a Q-switch only to null them: skipped.
- `switchNow()` called twice for the level picture; a `slider()` helper used once: tidied.
- Stale references: the plan's "§11.6 items 1, 2, 5" (now 4), the physics doc's §11.6 numbered 7 after 5, `sections/laser.html`'s header comment.

### Stage 10 — Mirrors, the light's path, and a bench that looks real

Rewritten on 2026-11-16 from the owner's requests (in their words, shortened):
1. "Will I see the direction of light, curved a bit, not a straight line?"
2. A choice of mirror: **flat, concave or convex**, and **a slider for the radius** of the concave and convex ones.
3. "I want to see how light will move after touching them."
4. The mirrors' **focal points drawn and labelled F**.
5. "The light has to go through the ruby to make a laser; if the mirrors focus it wrong, nothing will happen."
6. **Every gain medium as it really is**: ruby in its natural red, gases in cylindrical tubes with the gas visible, and so on. "Make everything look real."
7. **Diodes that look more real**, and the way they pump the medium made visible, with an accent on it.

**The physics that shapes the design** (to keep in mind in every sub-stage):
- Light goes in straight lines between surfaces. It changes direction only at a mirror or a surface (and bends gently inside a heated rod: stage 13c). What looks "curved" is the bundle: the beam narrows to a waist and widens again, an hourglass (§7.2's w(z)). So the bench draws the beam's outline (the Gaussian envelope) and a few rays traced round trip after round trip (§7.3's ABCD matrices), each a straight piece between two reflections.
- A stable pair of mirrors (0 ≤ g₁g₂ ≤ 1, §7.1) keeps a ray near the axis for ever; in an unstable pair it walks out over a few round trips and leaves past a mirror's edge. The owner's item 5 is true for most lasers here, not all: a low-gain laser (He-Ne) stops at once, while a high-gain one (ruby, Nd, CO₂ with a strong pump) can still lase, and real high-power lasers use unstable mirrors on purpose (§7.1's table). The page must show which, not "nothing ever happens".
- Two flat mirrors sit on the stability edge, and real lasers work that way (the first ruby laser had flat ends). Their loss comes from diffraction at the rod's edge, small for a rod (Fresnel number N_F = a²/(λL) ~ 100). §7.2's formulas give w → ∞ there, so flat-flat must not be drawn or simulated as "never lases" (D11).
- "Through the ruby": a beam wider than the rod is clipped, a loss of exp(−2a²/w²) per pass for the lowest mode (§7.4), with a the rod's radius.
- **The picture is stretched across the axis.** The beam is about 1 mm wide in a 10–100 cm cavity, so the drawing magnifies widths k times and says so ("widths × k"). Paraxial optics is linear: stretched across, rays stay straight and F stays where it is along the axis, while angles look k times steeper. A mirror's drawn bend is a symbol (more bend for a smaller radius), not to scale.

Three sub-stages, one commit each, each through the whole recipe (§3):

#### Stage 10a — Mirror optics in the engine (`js/laser/engine/optics.js`, `bench.js`)
- **Doc audit first, with research** (D11, D12, D13, D15): write the missing theory into `docs/laser-physics.md` (a new §7.7 "Loss near and beyond the stability edges"; the mirror set-ups in §5) with sources, before the scope card.
- **Build:**
  - `optics.js` (new engine file: `ENGINE_FILES`, `index.html`, the engine rules):
    - ABCD matrices (free space, mirror, slab l/n), the round trip, m = (A + D)/2, g₁, g₂, stability;
    - the Gaussian mode (w₀, its place, w on each mirror, w(z)) with D1's form, regular at g = 0;
    - each mirror's focal point, f = R/2: real, in front, for a concave mirror; virtual, behind it, for a convex one (D9); none for a flat one;
    - the paraxial ray trace the drawing needs: a ray (y, θ) through n round trips, its hit points, and where it leaves (past a mirror's edge or the rod's);
    - the losses: clipping by the rod (§7.4), walk-off of an unstable pair (D12), the edges (D11).
  - The config gets each mirror's shape and radius (code names `Rc1`, `Rc2` from §0; a flat mirror cannot be `Infinity`, which `check.js` refuses: decide in the scope card, e.g. a shape word plus a radius). Each `SETUPS` bench gets its real mirrors (D13). The mirrors' loss joins the cavity's γ (single pass) and every threshold; `derive` gives the stability, the mode, F, the loss.
  - Decide in the scope card (D15): mirrors change only the losses (simple, the default), or also the gain through the mode's size (Fan–Byer for the diode bench, §6.3).
- **Tests:**
  - (A + D)/2 = 2g₁g₂ − 1 for random g₁, g₂;
  - every row of the §7.1 table, boundaries included;
  - D1: confocal w₀ = 0.317 mm and θ = 2.18′, continuous near g = 0;
  - w(z) from q = the closed form;
  - F = R/2 with its signs (D9);
  - a slab = free space l/n (D10);
  - a ray stays inside for 1000 round trips when stable and leaves when unstable;
  - the loss is continuous across each edge (D11, D12); a flat-flat ruby rod lases;
  - a slightly unstable He-Ne stops, while ruby with a strong flash still pulses.
- **Breaks:** f = R instead of R/2; slab l instead of l/n; drop the √ in w²; 1/M instead of 1/M²; a convex mirror's sign flipped.

##### Stage 10a scope card ✅ (2026-11-19)

**Research first (D11, D12, D13, D15), written into `docs/laser-physics.md`** before any code: §7.7 "Loss near and beyond the stability edges" and §5.9 "The mirrors of each bench", with sources (Kogelnik & Li 1966, read from the paper's scan, eq. (86) and Fig. 22; Siegman 1965; the benches' mirrors from HRL, Physics World, repairfaq, the University of Arizona and Coherent; the rest marked "not checked"). §0 gained `c1`, `c2`, `reducedLength`, `aperture`, `fresnel`, `magnification`. §7.2 now points to §7.7 and D1's regular form. D14's "What each medium looks like" becomes §5.10 in stage 10c (§5.9 is the mirrors now).

**`js/laser/engine/optics.js`** (new engine file, after `qswitch.js`, before `bench.js`; needs only `check.js`):

| Function | In | Out | Doc |
|---|---|---|---|
| `freeSpace(d)` | m | `{ A, B, C, D }` | §7.3 |
| `slab({ l, n })` | m, — | free space l/n | §7.3, D10 |
| `mirror(c)` | 1/m, signed | `[[1, 0], [−2c, 1]]` (f = R/2) | §7.3, D9 |
| `multiply([first, …])` | matrices in the order light meets them | matrix | §7.3 |
| `reducedLength({ L, l_g, n })` | m, m, — | L* = L − l_g + l_g/n | D10 |
| `roundTrip({ L, l_g, n, c1, c2 })` | | from mirror 1 to 2 and back | §7.3 |
| `resonator({ L, l_g, n, c1, c2, lam, aperture })` | | `{ reducedLength, g1, g2, m, stable, w0, waistAt, zR, w1, w2, focus1, focus2, fresnel, magnification, loss1, loss2, loss, gamma }` | §7.1, §7.2, §7.7 |
| `beamRadius({ L, l_g, n, c1, c2, lam, z })` | z in m from mirror 1 | w (m), or null without a mode | §7.2 |
| `traceRay({ L, l_g, n, c1, c2, aperture, y, theta, roundTrips })` | m, rad, ≤ 10 000 | `{ hits: [{ mirror, y, theta }], escaped: null or { mirror, roundTrip } }` | §7.1, §7.3 |
| `plateLoss(fresnel)` | N | Vainshtein's share lost per pass | §7.7 |

**Decisions** (made without the owner, who asked to go on; to review):
- **D15: the mirrors change only the losses**, not the gain, which stays spread over `area` (the default the plan proposed: simple, and every earlier number of the gain stays). So ruby's ~13 J against the book's 1–2 J is not touched here.
- **The config** gains `mirror1`, `mirror2` (`"flat"`, `"concave"`, `"convex"`, `bench.MIRROR_SHAPES`), `Rc1`, `Rc2` (positive radii, m) and `aperture` (the rod's or bore's radius, m). A flat mirror keeps its radius, unused, so that the page's slider (10b) shows it again when the visitor bends the mirror. optics.js takes signed curvatures c = 1/R (flat c = 0), never R = ∞, which `check.js` refuses.
- **The rod sits in the middle of the cavity**, as the drawing has it, and counts l/n for the beam (D10); `waistAt` and `beamRadius` take and give real distances.
- **The aperture is taken at both mirrors.** Exact for a tube that fills the cavity; for a shorter rod it loses a little more than the real one.
- **The loss model (§7.7):** each mirror loses min(e^(−2πN√|Y_i|), δ_flat(N)), the round trip keeps (1 − δ₁)(1 − δ₂)/M², γ_m = −½ ln of it. The min is the simulator's own interpolation (not a textbook formula), chosen because Kogelnik & Li's Fig. 22 shows the near-edge curves under the flat mirrors' and joining it; it makes the loss continuous across every edge (tested at 10⁻⁶ and 10⁻¹²). Only TEM₀₀; the mirrors aligned.
- **The mirrors' loss joins α_i**, spread over the rod: `derive` passes α_i + γ_m/l_g to `rates.*.scales` and `thresholdGain`, so γ = the old γ + γ_m and every threshold, τ_c and the best coupler (whose L_i is every loss but the coupler's) include it. `derive` gives `resonator` (the whole answer of `optics.resonator`) and `alphaWithMirrors`.
- **Each bench's mirrors (D13, §5.9):** ruby and Nd:glass two flat mirrors (Maiman's flat silvered ends); Nd:YAG with a flashlamp a 5 m back mirror and a flat output mirror; Nd:YAG with diodes a flat back mirror (it passes 808 nm) and a 1 m output mirror; He-Ne flat and 45 cm in its 30 cm tube (near-hemispherical), bore 1.5 mm; Ar⁺ a 5 m back mirror; CO₂ a 20 m back mirror (catalogue 15–30 m), flat ZnSe output; dye and Ti:sapphire two concave mirrors standing in for their folded cavities; the two-level atom flat and 50 cm. Apertures: ruby, Nd:glass 5 mm, Nd:YAG 3 mm (flash) and 1.5 mm (diode), He-Ne 0.75 mm, Ar⁺ 1.5 mm, CO₂ 6 mm, dye and Ti:sapphire 5 mm, two-level 0.56 mm.

**Worked numbers** (recomputed in Node, all in the tests): confocal L = 1 m, 632.8 nm: w₀ = 0.317 mm, θ = 2.18′ (D1); Vainshtein with κ₀₀² (§7.7) 0.800 dB at N = 1, 0.128 at 4, 0.0355 at 10, 0.0098 at 24.5, 2.88×10⁻⁴ at 100 (Fig. 22: 0.1 dB at N ≈ 4.3, 0.03 at 10, 0.01 at 24, within 20 %; Fig. 24's phase shift 0.26° at N = 100 through eq. (87)); the clipping at Fig. 22's 0.01 dB points 0.022, 0.0057, 0.0041, 0.0117 dB (g = 0, 0.5, 0.9, 0.99); the benches' losses per pass of §5.9 (ruby 4.09×10⁻⁴, Nd:glass 7.86×10⁻⁴, He-Ne 7.72×10⁻⁵, Ar⁺ 8.97×10⁻⁶, CO₂ 4.86×10⁻³); He-Ne with R₂ = 29 cm: M = 1.4467, no current lases; ruby with a convex 5 m output mirror: M = 1.8143, γ_m = 0.5957, threshold 803.06 J against 638.78 J.

**What moved in the earlier tests** (the mirrors' loss is real physics now, so their audited numbers were recomputed, the old ones kept in comments): ruby n_t 11.54 → 11.528, ε 1.848 → 1.8458×10⁻⁶, threshold flash 638.68 → 638.78 J, xPeak 5.7229 → 5.7217, small-signal gain 8.5855 → 8.5753, the closed cell's 14.288 → 14.272, ruby behind its dye 833.97 → 834.10 J; Nd:glass 28.969 → 29.142 J, xPeak 4.6917 → 4.6639, its filter pulse 355.8 → 356.7 µs and 2.825 → 2.816×10⁷ W; He-Ne's threshold current 361 → 365 µA, x 5.0672 → 5.0217; CO₂ x 7.6143 → 7.3073, 8.23 → 7.85 W; Ar⁺ in the fifth digit; the Nd:YAG diode bench and the dye and Ti:sapphire lasers unchanged to the tests' digits. Tests that compare `derive` with the formulas now pass α_i + γ_m. Two tests were fragile and were made sound: ruby's dye filter was sampled every 1 µs, and only by chance in its pulse's tail (13 %); it is now followed in 2 ns pieces across the 20 ns pulse (2 %); the per-call bound around that pulse went from 3000 to 4600 steps (one call can take the whole pulse: 3067 measured), and its worst frame is 3290 (stage 8a 2567).

**Recipe note:** optics.js was written before its tests this time (the prototype of the loss model needed the code to check continuity and the setups' numbers); the tests were then written from the scope card and the doc, and the mutation check is what stands behind them.

**Tests:** `tests/laser/optics.test.js` (18: the matrices, D10, (A + D)/2 = 2g₁g₂ − 1, §7.1's table, D1, w(z) against §7.3's q, D9, the ray trace, Vainshtein against eq. (86) and Fig. 22, the clipping, the equivalence, 1/M², continuity at every edge, the input checks), `tests/laser/bench-mirrors.test.js` (7: §5.9's mirrors, `derive`'s resonator, γ + γ_m, the unstable He-Ne, the flat and the convex ruby, the config checks, a Q-switch keeping the mirrors). 697 tests in all.

**Breaks:** 47 (`mutations.js`, "stage 10a" and "stage 10a, the review's fixes"), the plan's five among them; 854 of 854 caught. The first mutation check caught 849 of 851: an old entry whose line had changed (the best coupler's L_i, now with the mirrors), and a ray that never leaves below the axis (a test added: the same ray mirrored below the axis leaves on the same pass).

**Review** (`/code-review xhigh`, 15 findings):
1. **Vainshtein misread** (the big one): eq. (86) needs κ₀₀², and its α is the energy lost per transit (eq. (81)), not a field decay; the code gave 0.83 of the loss. Fixed, with eq. (87) and Fig. 24's phase shift as a new check (§7.7 tells the story). Only the flat-flat benches moved (ruby, Nd:glass; numbers above); the two mutations that had the right form as the "mistake" now have the old reading as the mistake.
2. The lossless-cavity guard (`MIN_LOSS`) ignored the mirrors and refused a cavity whose mirrors lose a lot: it now adds γ_m, and refuses an infinite γ.
3. Tiny radii overflowed inside optics.js and the error named `optics.resonator`: radii now at least 1 mm (`MIN_RADIUS`), checked in `derive`.
4. "No internal loss → no best coupler" is no longer true (the mirrors always lose a little): comments and `CLAUDE.md` say so; the engine still gives the tiny T_opt (the page's T_best row shows what the engine gives).
5. The flat-ray walk test counted on a rounding: the aperture is now 0.74 mm, clear of every pass.
6. traceRay's last hit keeps the angle it came in at: now in the contract.
7. A convex mirror's virtual waist outside the cavity: now in the contract, with a test.
8. Declined: moving the mirrors' loss out of α_i into its own term of γ. `rates.*.scales` and `thresholdGain` take α and the mirrors; a γ_m input to each would mean changing four tested functions for no different number. γ is computed in one place (`compute`), and the guard now uses the same sum.
9. Declined: caching the resonator across calls. It is worked out once per engine call (now in `readConfig`, where the guard needs it), a few µs next to a frame's milliseconds of solving.
10.–11. The test helpers (`alphaWithMirrors`, `mirrorCurvature`) moved into `helpers.js`, written with plain `if`s, with their own tests; the nested ternaries are gone.
12. The recipe note (code before tests) stays: it is true.
13. `docs/laser-guide.md` is the owner's learning material from another AI, not this stage's: left out of the commit.
14. bench.js's header lists `bench-mirrors.test.js` and the mirrors.
15. The shadowed `plain` in a test renamed `airOnly`.

#### Stage 10b — The mirrors on the page ✅
- **Build:**
  - For each mirror, a choice of flat, concave or convex (three buttons with a little picture of each), and a radius slider (log) shown only for a curved mirror. Its range comes from the scope card, and it must reach confocal (R = L) and concentric (R = L/2).
  - The drawing:
    - the mirrors bent by their shape;
    - the beam's outline, the hourglass, shaded;
    - 3–5 rays traced bounce by bounce (straight pieces), fading with each round trip; a ray that misses the rod or walks past a mirror's edge goes on out and fades, which is the loss made visible;
    - F for each curved mirror: a dot on the axis labelled "F", solid for a real focus (concave) and hollow and dashed for a virtual one (convex, behind the mirror);
    - an F off the canvas becomes an arrow at the edge with its distance ("F 2.5 m →");
    - the "widths × k" note.
  - Readouts: stable or unstable (in words), the waist, the mirrors' loss. An unstable or clipped laser visibly dims or stops.
  - Words in both languages.
- **Asked the owner (answered 2026-11-19):**
  - one choice per mirror (recommended, because the most common real laser has one flat and one concave mirror), or one choice for both: **one per mirror**;
  - whether to add a small stability diagram, (g₁, g₂) with a moving dot (§7.1): **yes**, somewhere it is comfortable to watch while the laser runs (beside the bench and the chart).
- **Tests:**
  - page and draw tests: the controls, every width, rays straight between reflections, F at R/2 along the drawing's axis scale, the off-canvas arrow, an unstable ray leaving;
  - the browser check of the look with the owner.
- **Scope card (2026-11-19)** ✅. Decisions taken without the owner, for review:
  - **Engine:** `bench.controls(config)` gives `Rc1` and `Rc2` (`{ name, min, max, log }`, null for a flat mirror): from L/4 (so it reaches concentric, R = L/2, and confocal, R = L) to 50 m, log. `bench.beamPath({ config, starts, roundTrips, points })` gives what the page draws: the mode's radius at `points` + 1 places from mirror 1 to L (null without a Gaussian mode) and `optics.traceRay` from mirror 1 at each height of `starts` (inside the aperture), along the axis; at most 100 round trips and 1000 points. The page traces 4 rays (0.9, 0.45, −0.45, −0.9 of the mode's half-width on mirror 1, or of half the aperture without a mode) for 4 round trips, and the mode at 40 pieces, only when the config changes (never per frame).
  - **Widths:** the aperture is drawn as the mirrors' half-height, so the widths are drawn many times larger than the lengths; "Widths × 26" (the Nd:YAG diode bench) on the picture's bottom-left says by how much.
  - **The beam:** the mode's hourglass, shaded (alpha 0.45 × the beam's ray strength); without a mode (flat-flat on the edge, or unstable) a band half the aperture wide. The traced rays are always drawn, faintly with the laser dark (alpha 0.3), fading by 0.72 each round trip; a ray that walks out goes on past the mirror for 6 % of the picture's width, and every traced ray is clipped to a band a quarter of a mirror above and below the mirrors (found in the browser: with the widths × 26 the last piece of an escaping ray ran steeply across the whole picture and its words).
  - **The light leaving** through the output mirror: the old parallel rays (round(count·T) of them), across the mode's width there.
  - **F:** a dot on the axis, solid in front (real), hollow and dashed behind (virtual); off the picture an arrowhead at the edge it lies beyond and "F 500 mm" on its own row near the bottom (back mirror's row, output mirror's row).
  - **Controls:** under the coupler, each mirror's name and three toggle buttons (`aria-pressed`, a little picture of the face with the laser on its side, and the word), then its radius slider with its number box in m, shown only for a curved mirror. A click keeps the run (as a slider does), finds the threshold flash again, and lights the button; a flat mirror keeps its radius for the next bend. Toggle buttons rather than radios, so no arrow-key handling is promised.
  - **Readouts**, on every bench: the mirror pair (stable, unstable, or "on the edge of stable" for m = ±1: two flat mirrors), the beam at its narrowest (w₀, "—" without a mode), the light lost at the mirrors per round trip ("< 0.01 %" under 10⁻⁴).
  - **The stability diagram** (`js/laser/ui/draw-stability.js`, canvas `stability`): g₁ across, g₂ up, from −2 to 2; the region 0 < g₁g₂ < 1 shaded with its two hyperbola edges; the pair a dot, in the accent when stable, muted when not, hollow at the edge when past ±2. It sits in the side column right under the power chart: beside the bench above 1100 px, under the chart beside the numbers from 760 to 1100 px, in the single column below.
- **Review** (`/code-review xhigh`, 15 findings; 14 fixed, 1 declined):
  - the shape icons showed concave and convex the wrong way round (now pinned by `site-files.test.js`: a concave picture's middle lies away from the laser);
  - "the beam at its narrowest" showed w₀ even when a convex mirror puts the waist behind a mirror; now the smaller mirror spot then;
  - the aperture was drawn as the mirrors' half-height, so the hourglass ran outside the rod or a gas tube's bore (CO₂, He-Ne, Ar⁺ as they load); now the rod's half-height, or the bore's on a discharge;
  - an F off the picture was written in the margin over the mirror's post, and could not tell real from virtual or which mirror: now an arrowhead in the margin (filled real, outlined virtual) and "F₂ 500 mm" just inside the mirror, no wider than the gap to the rod or the discharge's electrode; F₁ and F₂ name the mirrors, as g₁ and g₂ on the diagram;
  - "on the edge" was an exact float test, |m| = 1; now within 10⁻⁹;
  - the cavity was traced again on every pump, coupler or filter move; now only when its own fields change (`CAVITY_FIELDS`);
  - the shape buttons wrap on a narrow panel; the diagram's g₁ sits above the axis, clear of the "1" under it; the teardown test covers the shape buttons; a CSS comment put back over its rule; the headers of `bench.js`, `page.js` and `draw-bench.js`, and `CLAUDE.md`, brought up to date; the progress doc's placeholders filled;
  - **declined:** drawing the stability diagram only when it changes. The loop draws every canvas on screen each frame by design (`loop.js`: a canvas resize or a theme change resets it), and the diagram costs about 200 path calls a frame, far below the bench's; a skip would need the loop to know a picture is unchanged, for every canvas.
- **Measured in the browser** (1512 px, both themes): the Nd:YAG diode bench shows the hourglass with F 500 mm off the left; its output mirror bent convex shows the rays walking out, F behind it off the right, the dot outside the region, and the output falling to 0 at once.

#### Stage 10c — A bench that looks real
- **Research first (D14),** written into `docs/laser-physics.md` as a new §5.10 "What each medium looks like" (§5.9 is the mirrors, since stage 10a), with sources:
  - ruby: a pink-red rod; Cr³⁺ absorbs the green and violet of §5.2's pump bands and passes red;
  - Nd:YAG: pale lilac; Nd:glass: pale purple; Ti:sapphire: pink;
  - dye (rhodamine 6G): a red-orange liquid in a glass cell or a jet;
  - He-Ne: a glass tube with a thin bore, glowing orange-red, with Brewster windows;
  - Ar⁺: a blue-white plasma in a ceramic bore with water cooling;
  - CO₂: a long glass tube with a faint violet-pink glow and a water jacket;
  - the two-level atom stays symbolic.
- **Build:**
  - Rods drawn as cylinders with highlights and polished ends, each in its medium's colour.
  - Gases in glass cylinders, glowing in their own colour, with atoms drifting (an illustration in screen time, still for `view.still`). Dye in a glass cell.
  - **The diodes** (asked the owner at the start, with pictures; **answered 2026-11-20: end pumping**):
    - **end pumping (recommended):** a diode module with a fibre and a focusing lens behind the back mirror, which passes 808 nm (a dichroic mirror, labelled). The pump cone narrows into the rod and fades as it is absorbed, P(z) = P₀e^(−αz) (§6.3). This is what the doc and the engine's numbers already describe (Fan–Byer, matched spot), and it makes the pumping very easy to see;
    - **side pumping (the alternative):** diode bars on heat sinks under the rod, each with a fan of light.
    - Either way, 808 nm is infrared, drawn in a false colour labelled "808 nm, infrared (invisible)".
  - **The accent on pumping** (every pump): pump photons travelling into the medium and vanishing where they are absorbed, each lighting an atom; the medium's glow growing with the inversion (the flash already lights the rod: `lightRod`).
  - The pump laser of dye and Ti:sapphire as a real 532 nm green beam (end-pumped as in real ones: decide in the scope card).
  - **Beam colours from the wavelength** (§11.5; moved here from stage 11, because the colour is part of the look):
    - visible: ruby 694 nm deep red, He-Ne 633 nm red, Ar⁺ 488/514 nm blue-green, dye ~590 nm yellow-orange;
    - near the edge of sight: Ti:sapphire ~800 nm;
    - invisible: Nd 1064 nm and CO₂ 10.6 µm, drawn in a false colour labelled "infrared, invisible".
  - Physical colours (materials, wavelengths) live in one file, `js/laser/ui/materials.js`. It is the only file the colour-literal test (`site-files.test.js`) exempts, and each of its colours is tested for contrast against both themes' bench background. CLAUDE.md's colour rule gets this exception written in.
  - The fake 2D context gets `createLinearGradient`/`createRadialGradient` that record their stops (with tests in `fake-browser.test.js`), so the shading can be tested.
- **Tests:** every medium and pump drawn inside the canvas at every width, from its own colours; the gradients' stops; the beam colour for every medium (in range, no NaN, the invisible label); the contrast.

- **Split (2026-11-20):** 10c is two sub-stages, each one commit: **10c1** each medium's look and the beam's colour; **10c2** the end-pumped diodes, the green pump laser, pump photons travelling into the medium and atoms drifting in the gases.
- **10c1 scope card (2026-11-20)** ✅. Decisions taken without the owner, for review:
  - research: `docs/laser-physics.md` §5.10 (what each medium looks like, with sources; the Ar⁺ and CO₂ glow colours are marked "not checked": only forum descriptions found);
  - `js/laser/ui/materials.js` holds every physical colour (the only file allowed colour literals): ruby pink-red, Nd:YAG lilac, Nd:glass pale purple, Ti:sapphire pink, dye orange, He-Ne salmon, Ar⁺ blue-violet, CO₂ pink-violet, glass, a white highlight, and `INFRARED`, the false colour of an invisible beam (a violet-magenta, unlike every visible beam);
  - the beam's colour from its wavelength by Bruton's scheme (§11.5), 380–780 nm; past 780 nm (Nd 1064 nm, CO₂ 10.6 µm, and Ti:sapphire's 800 nm, which the eye barely sees) the false colour and the words "infrared, invisible" with the wavelength;
  - **contrast:** a physical colour drawn as a line (a beam, a rod's edge, the glass) is mixed towards white on the dark theme and towards black on the cream one until its WCAG contrast is at least 3.3 (3 against both ends of the bench's box). The hue is kept but not the exact shade: dye's yellow-orange beam turns brown-orange on cream. Fills at partial alpha keep the raw colour;
  - no gradients (the fake context has none): a rod's roundness is a darker bottom strip, a highlight strip along its top and an ellipse end face at each end;
  - the dye is a glass cell inside the rod's outline (outside it, its top wall ran into the medium's name: found in the browser), with two pipes under it; no jet;
  - the gases: glass with the bore glowing in the gas's colour; CO₂'s water jacket and Ar⁺'s ceramic bore are not drawn (left for 10c2 if wanted);
  - the two-level atom stays in the theme's colours.
- **Review** (`/code-review xhigh`, 15 findings), fixed: rays lost over a medium of their own hue (the false colour over Nd:YAG's lilac 1.6:1, He-Ne's beam over its bore 1.07:1): each coloured ray is drawn over a 2 px wider casing in the theme's background at 0.6 of its alpha; the "invisible" note squeezed to a third beside the pump's name on a phone: its own row under it, the full width; the glass outlines' `readable()` not pinned by a test; the rod's lower strip made it lighter on dark: now `SHADE` (black at 0.2); `HIGHLIGHT` and `SHADE` tested against each rod's colour (they are drawn over the rod, not the background); the progress doc and "Where we stopped"; ultraviolet called infrared: `beam()` gives `band` and the words are `bench.parts.infrared`/`ultraviolet`; `readable()` towards whichever of white and black stands out more (luminance 0.5 was wrong between 0.18 and 0.5); `lookOf` took `"constructor"` for a medium (`hasOwnProperty` now); the file header; `CAVITY_WORDS` renamed `OWN_PLACE_WORDS`; `readable()` answers kept per (colour, background); `lam` looked up only when the medium changes; the false colour moved from violet `#b44fd8` (1.8:1 against a 405 nm beam) to hot pink `#e8459b`, off the spectrum (tested against every nm); CLAUDE.md's file order. Declined: the hourglass band's contrast over the medium (it is a shading at low alpha under the cased rays, which carry the beam).
- **Measured in the browser** (1512 px): Nd:YAG lilac with the magenta false-colour beam and "1.06 µm · infrared, invisible"; ruby pink-red with red rays during a flash; He-Ne's salmon bore with a red-orange beam; the dye cell orange with a brown-orange beam on cream.

- **10c2 scope card (2026-11-20).** Decisions taken without the owner, for review:
  - **the diodes, end-pumped** (the owner's choice): a diode module with cooling fins on the bench under the rod; a fibre from it along the bench (in front of the posts, as a cable lies on a table), up the left margin, into a small focusing lens behind the back mirror, on the axis. From the lens a cone of pump light passes through the back mirror (which lets 808 nm through: not labelled, to keep the top rows readable), narrows to a waist just inside the rod and widens again, fading along the rod as e^(−z/d) (§6.3). **d is an illustration, 0.35 of the drawn rod**: with §6.3's α ≈ 7.5 cm⁻¹ the stage-6 bench's 5 cm rod would swallow the pump in its first 2.7 % (1.3 mm) (real end-pumped rods are a few mm long, or lightly doped); the engine spreads the gain evenly, so the drawing does too;
  - **the pump laser** (dye, Ti:sapphire, the two-level atom), its beam in its own colour, 532 nm green; first kept side-pumped (a 45° mirror under the rod), then, at the owner's request ("do like it is in reality"), **end-pumped** as real Ti:sapphire lasers are (and CW dye jets, pumped along or nearly along the axis): the box on the bench under the rod, its beam along the bench to a periscope of two 45° mirrors in the left margin, up to the axis, through the diodes' lens and the back mirror into the medium, the same cone and photons. A filter on a pump-laser bench (none offered today) would stand beyond the rod too;
  - the pump's colour: `materials.beam(pumpLam)`, made readable; the page passes `light.pumpLam` (the config's, for diode and laser pumps). An invisible pump (808 nm) joins the note: "808 nm, 1.06 µm · infrared, invisible";
  - **pump photons** (diodes, pump laser, flashlamp; not the discharge, whose atoms are hit by electrons): `PUMP_PHOTONS` (12) dots, as many shown as the pump is strong, travelling along the pump light into the medium and vanishing at their own depth (exponential, d as above), where a white spark lights an atom. In screen time `view.t`, from a fixed table of fractions (no random numbers: the drawing stays a function of its inputs); for `view.still` they stand still at t = 0;
  - **gas atoms** (discharge): `GAS_ATOMS` (18) dots drifting along the bore in the gas's colour, wobbling a little; as many of them lit (larger, brighter) as the current is strong;
  - not done: the medium's glow following the inversion (the photon cartoon shows it), CO₂'s water jacket, Ar⁺'s ceramic bore, a dichroic label.
  - **the filter, after the owner's look (2026-11-20):** "when I turn on the bleachable filter I can still see photons going through it; also the laser goes through it like nothing is there". On the end-pumped diodes the filter now stands between the rod and the output mirror (`filterBeyond`, the mirror image of its place; real end-pumped passively Q-switched lasers put it there, out of the pump), its name under the bench at the right (`labels.qSwitchBelow`), the transmission back on its whole row. On every bench the plate is drawn over the rays, and the light beyond it (towards the mirror on its far side) is dimmed by the background's colour at `FILTER_SHADE`·(1 − open), the plate's own shading (0.6): a dark filter holds the light back, a bleached one nothing.
- **Review** (`/code-review xhigh`, launched at xhigh by mistake: the owner had set medium; 15 findings), fixed: white sparks and lit atoms on cream (1.19:1): their ring is the heading's colour where white does not stand out on the background; 808 nm and 1064 nm in one pink: an invisible pump has its own paler false colour, `PUMP_INFRARED` (tested apart on both themes); three tests that missed their mistakes (sparks on the light theme, atoms drifting by their x, the streaks compared alone now that photons move too); the note's dead `sort` (the engine refuses a pump at or past the line: the pump comes first); photons bunched at a low pump (phases k/count); the unlit gas drawn in its glow's colour with the current off (now the theme's muted colour, the old test back); flashlamp photons made readable over a medium; stale comments; `screenTime` and the pump's colour worked out once per frame; one `ownPumpLam` for the colour and the note; the cone's slices at whole pixels (seams); the doc's 2 % (2.7 %). Declined: `layout().lamp` (it still places the flash tube and two labels' widths); `docs/laser-guide.md` in the file map (the owner's file, untracked on purpose).

### Stage 11 — Lenses outside the cavity, ray tracing, colour ✖ DROPPED

**Dropped by the owner (2026-11-20).** Everything below is kept as a record only. 11a (the engine, `lenses.js` and `bench.outputBeam`) was built, reviewed and committed (8d9bcd2), then undone by a revert commit; 11b (a separate block under the laser: its own drawing with exact rays, lens and glass dropdowns, a focal-length slider, eight numbers at the focus and a plasma spark) was built and thrown away uncommitted. Two findings worth keeping if lenses ever come back: §8.2's silica coefficients C were rounded too far (the squares of Malitson's resonance wavelengths give the catalogue's 1.45846; the revert put the rounded ones back in docs/laser-physics.md), and a Gaussian beam's focus does not follow f (He-Ne's waist 40 cm before a 50 cm lens lands only 4.5 cm behind it, by Self's formula).

- **Prep:** D6 for the Sellmeier coefficients (N-BK7, fused silica).
- **Build:**
  - lensmaker formula (thick lens), surface matrix, Self's formula, focused spot, telescope, Airy radius;
  - exact ray tracing: ray–sphere intersection, vector Snell's law, total-internal-reflection flag;
  - Sellmeier glass indices (λ in **µm**);
  - field and pressure at a target (§8.8); T_eff (§8.3);
  - lens picker, ray drawing through the lenses (the colour from the wavelength is done in stage 10c).
- **Tests:**
  - n_BK7(587.6 nm) = 1.5168 and n_silica = 1.4585 (known reference values);
  - blue focuses before red;
  - exact ray trace = paraxial result for small angles;
  - §12 field and pressure rows (1.94×10⁵ V/cm, 0.033 atm; 2.92×10⁸ V/cm, 7.4×10⁴ atm);
  - Self's formula: s = f → output waist at the back focal plane.
- **Breaks:** λ in nm passed to Sellmeier; flipped normal; wrong sign in Self's formula.

**The owner's choice (2026-11-20):** asked how much of the plan visitors should see, the owner chose **"the full plan on the page"**: a lens picker with several lenses and glasses, a telescope, exact rays drawn through each lens, and the field and pressure readouts. Split like stages 8 and 10: **11a** the engine (the page unchanged), **11b** the page.

#### Stage 11a — Lenses in the engine (`js/laser/engine/lenses.js`, `bench.js`)

##### Stage 11a scope card (2026-11-20)

**Doc audit (D6), done first:** §8.2's Sellmeier table checked against sources (SCHOTT's N-BK7 data sheet; Malitson 1965 for fused silica, whose C are the squares of his resonance wavelengths: the table's rounded values replaced; ZnSe added from Connolly 1979 / Tatian 1984, read from the refractiveindex.info database) with each glass's valid range, all in §8.2. Recomputed in Node: n_d = 1.51680 (N-BK7), 1.45846 (silica); ZnSe 2.4028 at 10.6 µm, 2.5911 at 632.8 nm; §8.8's rows E_rms = 1.941×10⁵ V/cm and 0.0329 atm (100 MW on 1 cm²), and with f = 5 cm, r = √(1 cm²/π) = 5.64 mm, λ = 694.3 nm the Airy radius 3.753 µm, E_rms = 2.918×10⁸ V/cm, 7.44×10⁴ atm; §8.3's He-Ne (10 mW, 10⁴ Hz) T_eff = W/(2kδν) = 3.62×10¹⁶ K.

**`js/laser/engine/lenses.js`** (new engine file, after `optics.js`, before `bench.js`; uses `check.js`, `constants.js` and `optics.multiply`/`optics.freeSpace`). Every length in m, λ in m (converted to µm only inside `glassIndex`), curvatures signed as §8.1 (c = 1/R, positive when the centre of curvature lies to the right, the side the light goes to; a flat surface is c = 0):

| Function | In | Out | Doc |
|---|---|---|---|
| `GLASSES` | | frozen `{ "n-bk7", "fused-silica", "znse" }`, each `{ B: [3], C: [3] (µm²), from, to (m) }` | §8.2 |
| `glassIndex({ glass, lam })` | id, m | n; throws outside the glass's range | §8.2 |
| `surface({ n1, n2, c })` | —, —, 1/m | `[[1, 0], [(n1 − n2)c/n2, n1/n2]]` | §8.1 |
| `thickLens({ n, c1, c2, d })` | in air | `{ matrix, power, f, backFocus, frontFocus }` (f, the foci null at zero power); backFocus from the back vertex, frontFocus before the front one | §8.1 |
| `LENS_SHAPES` | | frozen: `biconvex`, `plano-convex`, `convex-plano` (flat side first), `meniscus`, `biconcave`, `plano-concave`, each `{ bend, converging }` (bend = Coddington's (c1 + c2)/(c1 − c2)) | §8.1 |
| `lensFor({ shape, f, n, d })` | | `{ c1, c2 }` whose **thick** lens has exactly f (the thin-lens curvatures scaled by the root of the quadratic in the scale nearest 1); throws for f of the wrong sign for the shape | §8.1 |
| `traceExact({ surfaces, z, y, angle, n })` | surfaces `[{ z, c, n, aperture }]` (vertex, curvature, index after it, semi-diameter); the ray's start, its angle (rad) and the index it starts in | `{ points: [{ z, y }], angle, n, tir, blocked }`: tir/blocked the surface's index or null | §8.2 |
| `axisCrossing({ z, y, angle })` | | the z where the ray crosses the axis ahead, or null | §8.2 |
| `beamQ({ w, curvature, lam, M2 })` | | q = `{ re, im }`, 1/q = curvature − iM²λ/(πw²) | §8.4 |
| `propagate({ q, matrix })` | | (Aq + B)/(Cq + D), in air on both sides | §8.4 |
| `beamOf({ q, lam, M2 })` | | `{ w, curvature, w0, toWaist, zR }` (toWaist: + ahead) | §8.4 |
| `selfImage({ w0, s, f, lam, M2 })` | | `{ w0, s, zR, magnification }` (Self) | §8.4 |
| `focusedSpot({ w, f, lam, M2 })` | | `{ w, depth }` (w_f, 2z_R) | §8.4 |
| `airyRadius({ f, lam, r })` | | 0.61fλ/r | §8.4 |
| `telescope({ f1, f2 })` | | `{ magnification: −f2/f1, length: f1 + f2, internalFocus }` | §8.5 |
| `atTarget({ power, area, n })` | W, m², — | `{ I, E0, Erms, pressureAbsorbed, pressureMirror }` (W/m², V/m, Pa) | §8.8 |
| `brightnessTemperature({ power, linewidth })` | W, Hz | W/(2kδν), K (a diffraction-limited beam) | §8.3 |
| `BREAKDOWN` | | 10¹⁰ W/cm² = 10¹⁴ W/m² | §8.8 |

**`bench.outputBeam(config)`**: the beam just outside the output mirror, `{ lam, mode, w, curvature, radius }`: with a Gaussian mode, w = the mode's radius on mirror 2 and the curvature its wavefront's, which is the mirror's own (c₂; the mode's phase front fits the mirror); without one (flat-flat on the edge, or unstable), `mode: false` and `radius` = the aperture, a uniform beam that a lens focuses to an Airy disk (§8.4, as in §8.8's Problem 1).

**Decisions** (mine; the owner chose only the scope):
- **ZnSe joins the glasses** so CO₂ can be focused: BK7 and silica do not pass 10.6 µm. A glass is refused outside its valid range (the page will grey it out for that laser), never extrapolated.
- **M² = 1 everywhere on the bench**: the simulator's mode is TEM₀₀ (§7.7). The functions still take `M2` (≥ 1) for §8.4's formulas and tests.
- **The output mirror's substrate is ignored** (as if its back face compensated, as real curved output couplers' do): the beam leaves with the mode's w and curvature.
- **Meridional rays only** (in the drawing's plane), no Fresnel losses on the rays (they carry no intensity), no aspheres or cylindrical lenses (§8.6 belongs to the diode laser, stage 13f).
- **The breakdown threshold** is one number, 10¹⁰ W/cm², the middle (on a log scale) of §8.8's 10⁹–10¹¹: an illustration, written as such in the doc.

**Tests** (`tests/laser/lenses.test.js`, `tests/laser/bench-output.test.js`): the catalogue indices and every glass's range; λ in nm refused; blue focuses before red (exact rays); the exact trace equals the paraxial ABCD result for small heights, and differs (spherical aberration, marginal rays crossing closer) for large ones; a plano-convex lens turned the wrong way has more aberration; total internal reflection flagged; a ray outside the aperture blocked; the thick-lens f against the matrix and the thin limit; `lensFor` gives the asked f for every shape; Self's formula with s = f puts the waist at the back focal plane, and agrees with q through the thin-lens matrix; the focused spot and the Airy radius; the telescope's M and wθ kept; §8.8's four numbers; §8.3's T_eff; every input checked, frozen inputs.

**Breaks:** λ in nm passed to Sellmeier; a flipped normal; a wrong sign in Self's formula; the thin-lens f for a thick lens; f = R for a surface; E from I without the 2; the mirror's pressure I/c; Airy 1.22 for 0.61 with a diameter.

### Stage 12 — Learn section
- **Build:**
  - chapters in `data/laser.json` (rich text, hy and en);
  - `js/laser/presets.js`;
  - "Try it on the bench" buttons (`data-preset`) that load a preset and scroll to the bench;
  - the §11.6 indicators.
- **Tests:**
  - every preset passes `bench.derive` and lands in the regime its chapter claims (e.g. the "below threshold" preset has x < 1; the "giant pulse" preset produces a pulse);
  - every preset id has a name in both languages;
  - every chapter's preset exists.
- **Content:** each chapter's physics claims checked against the doc §. The Armenian text is flagged for review by a fluent speaker.

### Stage 13 — Extras: one sub-stage, one commit each
| Sub-stage | Content | Key tests |
|---|---|---|
| 13a | Polarization: Fresnel, Brewster windows, Jones matrices, two photon variables φ_p/φ_s | R_s = 0.148, 0.85⁸ = 0.27, ruby 7.58 % and 29.6° |
| 13b | Second harmonic (Sellmeier verified first, D6) | θ_m ≈ 41°, η ≤ 1 (tanh²) |
| 13c | Thermal lens in the round trip | f = 1.08 m; the cavity goes unstable with more pump |
| 13d | Mode-locking scene | Δτ ≈ T_R/N; ruby ≈ 1 ps |
| 13e | Self-focusing | 16.8 kW and 95.6 cm; silica 4.3 MW |
| 13f | Diode carrier model (§5.7) + collimation (§8.6) | I_th 10–30 mA, slope 0.5–1 W/A |
| 13g | Pumping chain: elliptical reflector ray tracing, Fan–Byer, discharge optimum, Planck lamp | P_th = 0.133 W, I_opt formula |

### Stage 14 — Docs
A final pass over `CLAUDE.md`, `Instructions/LABS-GUIDE.md` (pointer to the laser page) and editing notes for `data/laser.json`. Each earlier stage has already kept them current (recipe step 8).

---

## Verification (every stage)

- `node --test`: all pass.
- `node tests/laser/mutation-check.js`: every deliberate break is caught.
- `/code-review`: findings fixed, or disagreements reported.
- **UI stages (5+):** site served at `http://localhost:5500`; through Claude in Chrome if connected, otherwise a checklist for the user. Check:
  - the page opens from the Labs page and from a direct URL;
  - dark and light theme × hy and en;
  - narrow width (375 px);
  - no console errors;
  - scrolling away sets `data-running="false"`;
  - two language switches still leave only one loop;
  - the pendulum and refraction labs still work.
- **Commit:** one commit per stage, after all of the above pass.

## Notes

- `tests/` and `docs/` are deployed with the site and can be opened publicly. That's harmless, since they're only static files.
- The physics numbers stay in JS (`media.js`, `presets.js`); `data/laser.json` holds only words. That keeps the site's rule that editors edit text, not physics.
- Most medium parameters in §5.1 are textbook values that haven't been checked against printed sources yet (see "Sources" in `docs/laser-physics.md`). Check them before the site goes public.
