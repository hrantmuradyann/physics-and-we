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
- Next: stage 6.

Working agreement: every stage follows the recipe in section 3, ends with `/code-review` (findings fixed before the stage counts as done), and is committed to `feature/laser` as one commit. Nothing is pushed without asking.

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
  - 28 entries at the end of stage 1b, all caught. A full run then took about 4 s; after stage 2 (70 entries) about 22 s. After stage 3 (94 entries) it took 44 s one at a time, so it now checks half the processor cores' worth of mistakes at once, each in its own copy: about 17 s on a 10-core machine; after stage 4 (143 entries) about 28 s; after stage 5 (214 entries) about 55 s.
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
| D1 | **Confocal resonator (g₁ = g₂ = 0) is 0/0 in every closed form of §7.2** (w₀², w₁², z₁), and its round-trip matrix is −I, so the ABCD method of §7.3 is also undetermined. It is the main test case | Use the symmetric formula w₀² = (λL/π)·√((1+g)/(4(1−g))), which is regular at g = 0. Test confocal against √(λL/2π), and test continuity at g = ±0.01 | 10 |
| D2 | §4.1 says for three levels "N → ΔN in the second equation". The spontaneous seed β·V_a·ΔN/τ then goes **negative** while ΔN < 0 (ruby before half inversion), giving a negative photon number and a NaN log | The seed uses N₂ = (N_t + ΔN)/2. Fix the doc sentence | 7 |
| D3 | §4.2 says He-Ne "shows no oscillations at all". At x = 2 it is weakly underdamped (ω_R = 1.23×10⁷ s⁻¹ > x/2τ = 1.0×10⁷ s⁻¹) and dies out within about one oscillation | Done in stage 4: the doc now gives the exact damped frequency (0.72/τ) and the factor e^8.8 lost per period; `rates.test.js` checks ω·t_damp < 1 for He-Ne | 4 |
| D4 | Ruby N_t is 1.6×10¹⁹ cm⁻³ in §3.1 but "~10¹⁹" in §5.2 and §12 | Use 1.6×10¹⁹ (the standard value for 0.05 wt % Cr₂O₃, and the one §3.1's 9 % needs); fix §5.2 | 7 (doc fix in 2) |
| D5 | Diode free spectral range uses the group index n_g ≈ 4 (§3.3), but the media table's n = 3.6 is the phase index | Add `ng` to the diode entry; the cavity functions take the index explicitly | 2 |
| D6 | §5.1 media numbers and the Sellmeier/KDP coefficients were "not checked against printed sources" | Web-verify the values each stage needs before it uses them; record sources in the doc | 7, 11, 13 |
| D7 | The §12 ruby "1–2 J, 10⁻⁸ s" depends on parameters the doc doesn't state | Write the assumptions into the preset; test order of magnitude only; **never tune parameters just to pass** — report if it can't be reached | 8 |
| D8 | Several formulas silently need the three-level factor 2 (Rigrod, E_out, F_sat) | Always take `I_sat` from `media.get()`; the factor 2 appears in a test for every such formula | 2, 8 |
| D9 | Sign conventions: mirror radius positive = concave (§7.1), lens surface radius positive = centre to the right (§8.1), mirror as a lens f = R/2 | Write one convention in the `optics.js` header; test a plane mirror (R = ∞), a concave mirror and a convex mirror | 10–11 |
| D10 | A Gaussian beam in a medium: §7.3 replaces a slab by l/n, while §8.4 puts n into z_R. Mixing the two is off by a factor of n | Use the reduced (l/n) convention everywhere; test slab ≡ free space l/n | 10 |

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

### Stage 6 — First playable laser: Nd:YAG, continuous
- **Build:**
  - `bench.js`: `derive(config)` (built from media + cavity) and `advance(sim, config, simSeconds, budget)` (built from ode + rates);
  - pure UI helpers `ui/format.js` (SI prefixes: "66 ns", "2.4 MHz") and layout maths;
  - sliders: pump, output coupler T, slow motion (log slider);
  - readouts, level bars, a P(t) plot, a gain/loss gauge.
- **Tests (Node):**
  - `advance` is deterministic;
  - running out of budget gives partial progress, never a freeze;
  - steady state from `advance` = analytic P_out from `derive` within 1 %;
  - formatting;
  - slider → SI conversion done in one tested function.
- **Browser:**
  - the threshold readout equals stage 2's g_th;
  - no output below threshold;
  - P_out vs T shows its maximum at T_opt.
- **Traps:**
  - `ode.dopri5`'s default `maxSteps` (100 000) is a safety limit, not a frame budget (about 65 ms for a 2-component f): pass a per-frame budget measured from the time a step takes;
  - pass the state through `rates.fourLevel.liftToSeed` before every solver call, or turning the pump back on after a long time off makes the solver give up (stage 4 review, §11.3);
  - below threshold with a seed, and with the pump off, the explicit solver is slow (∂ṡ/∂s = −(1 − y)/ε, §11.3). Measured for this Nd:YAG (ε = 1.9×10⁻⁴): about 1000 steps per τ at x = 0.5 and 1900 per τ with the pump off, so one real-time frame (16 ms ≈ 70τ) would need about 10⁵ steps. Choose the slow-motion range and budget with that in mind, or this is where stage 7b's implicit solver comes in;
  - plot history stored in simulated seconds, as a bounded ring buffer (no pixels: the resize rule);
  - readouts updated at most ~10×/s;
  - frames with dt = 0 only draw;
  - reduced-motion visitors start paused (as `labs.js` does).

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

### Stage 9 — Spectrum panel and several modes
- **Build:**
  - one photon variable per longitudinal mode, with gain σ(ν_q)·ΔN;
  - homogeneous: one shared ΔN;
  - inhomogeneous: spectral classes, where each mode burns its own hole;
  - simulate at most ~64 modes nearest line centre and draw the rest as the gain envelope;
  - a spectrum panel with log axes.
- **Tests:**
  - modes above threshold vs the §3.3 formula;
  - homogeneous: the centre mode wins;
  - inhomogeneous: about N_modes coexist;
  - the sum over modes equals the single-mode power of stage 4.
- **Traps:**
  - stiffness and cost grow with the mode count: keep the step-budget test;
  - spatial hole burning is outside the model, and the doc says so.

### Stage 10 — Mirror geometry (`optics.js`, part 1)
- **Build:**
  - ABCD matrices (free space, thin lens, mirror, slab l/n), round trip, stability m, g-parameters, mode from the round trip;
  - §7.2 closed forms;
  - transverse-mode frequencies, aperture loss, Fresnel number, tilt displacement;
  - in the bench, an unstable cavity gets a large diffraction loss and stops lasing;
  - a stability-diagram panel.
- **Tests:**
  - §12 (A + D)/2 = 2g₁g₂ − 1 for several random g₁, g₂;
  - every row of the §7.1 table, boundaries included;
  - **D1**: confocal w₀ = 0.317 mm and θ = 2.18′, plus continuity near g = 0;
  - w(z) from q propagation = the closed-form w(z);
  - tilt displacement grows without limit near plane-parallel;
  - D9, D10.
- **Breaks:** f = R instead of R/2; slab l instead of l/n; drop the √ in w².

### Stage 11 — Lenses outside the cavity, ray tracing, colour
- **Prep:** D6 for the Sellmeier coefficients (N-BK7, fused silica).
- **Build:**
  - lensmaker formula (thick lens), surface matrix, Self's formula, focused spot, telescope, Airy radius;
  - exact ray tracing: ray–sphere intersection, vector Snell's law, total-internal-reflection flag;
  - Sellmeier glass indices (λ in **µm**);
  - field and pressure at a target (§8.8); T_eff (§8.3);
  - `ui/color.js`: wavelength → RGB, plus the "invisible" label for IR/UV;
  - lens picker, ray drawing, beam envelope.
- **Tests:**
  - n_BK7(587.6 nm) = 1.5168 and n_silica = 1.4585 (known reference values);
  - blue focuses before red;
  - exact ray trace = paraxial result for small angles;
  - §12 field and pressure rows (1.94×10⁵ V/cm, 0.033 atm; 2.92×10⁸ V/cm, 7.4×10⁴ atm);
  - Self's formula: s = f → output waist at the back focal plane;
  - colour function: endpoint fade, no NaN.
- **Browser:** every beam colour is visible in both themes (yellow and green on cream).
- **Breaks:** λ in nm passed to Sellmeier; flipped normal; wrong sign in Self's formula.

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
