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

- **Getting there from the Labs page:** a large "featured lab" banner above the simulations grid in `sections/labs.html`, using `data-route="laser.route"` and text from `data/labs.json`. The current card template only links to `?view=lab&id=…`, and a flagship lab deserves a bigger entry anyway.
- **Why the layout lives in `sections/laser.html`:** the learn chapters can use `data-list` / `data-rich`, so editors can fix or translate the lessons in `data/laser.json` exactly like any other page (`Instructions/EDITING-GUIDE.md`).
- **Lifecycle:** `js/laser/ui/loop.js` follows the same rules as `js/labs.js`:
  - one `requestAnimationFrame` loop for all of the page's canvases;
  - the time step is capped;
  - the loop stops while the page is off screen (`IntersectionObserver`);
  - canvases are resized with `ResizeObserver` and sharpened for the screen's pixel density (DPR);
  - colours are re-read on `theme:changed`;
  - everything is torn down before a rebuild. A language switch fires `section:ready` again, so this needs the same `generation` guard `labs.js` uses.

  These ~100 lines are copied in on purpose rather than pulled out of `labs.js`, so the two working labs aren't put at risk. They can be merged later.
- `index.html` gets one `<script>` line per laser file, after `js/labs.js`, with the engine files in the order of `ENGINE_FILES` in `tests/laser/helpers.js` (a test checks this). Keep the engine to about 7 files so the list stays short.

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

## 3. Build stages

Each stage has a check that can be run on its own. Engine stages are checked with `node --test` from the repo root: `tests/laser/helpers.js` loads the engine files into a `vm` sandbox, and the tests use only the built-in `node:test` / `node:assert`.

1. ✅ **Test setup + constants + media table.**
   - Check: constants match §13.
   - Check: §12 "stimulated beats spontaneous": λ > 69 µm at 300 K; T > 3.8×10⁴ K at 550 nm.
   - Check: I_sat for Nd:YAG (≈ 2.9 kW/cm²), CO₂ (≈ 22 W/cm²) and ruby (hν/(2στ), F_sat ≈ 5.7 J/cm²).
2. **Static cavity + spectrum** (`cavity.js`, `spectrum.js`).
   - Check: τ_c and threshold against hand-worked formulas.
   - Check: mode spacing = c/2L_e.
   - Check: the optimum coupler maximises P_out.
   - Check: Fresnel reflection from a ruby end face = 7.6% (§12).
3. **ODE solver alone** (`ode.js`).
   - Check: exponential decay and the harmonic oscillator match the exact solution to tolerance.
   - Check: a stiff test case finishes within a step-count bound.
4. **4-level rate equations** (`rates.js`).
   - Check: steady state above threshold is y = 1, p = x − 1; below threshold p stays ≈ 0.
   - Check: the relaxation-oscillation frequency matches the analytic value.
   - Check: growth from 1 photon to 10¹⁸ photons doesn't overflow.
5. **Page skeleton.**
   - Build: hidden route, section, JSON, CSS, `loop.js`, featured banner on the Labs page, a static bench drawing, `<script>` lines in `index.html`.
   - Check (browser): it opens from the Labs page; works in both themes and both languages; the loop stops when scrolled away; a language switch doesn't leave two loops running.
   - Check (test): the skipped load-order test in `engine-rules.test.js` now runs and passes.
6. **First playable laser: Nd:YAG, CW.**
   - Build: pump and output-coupler sliders, slow-motion control, level bars, P(t) plot, a gain/loss gauge with a threshold line.
   - Check: the on-screen threshold and power match the stage-2 numbers.
7. **Swapping media + 3-level + flashlamp.**
   - Build: parts tray with ruby, He-Ne and others.
   - Check (test): ruby's threshold needs about half the population inverted.
   - Check (test): a flash produces spikes ~µs apart (§12).
8. **Q-switch parts** (Pockels cell, rotating prism, saturable absorber as a time-dependent loss).
   - Check (test): a 20×1.5 cm ruby gives a pulse of ~10 ns and ~1–2 J (§12).
9. **Spectrum panel + several longitudinal modes.**
   - Build: gain curve, mode comb, threshold line.
   - Check (test): the number of modes above threshold; modes compete when broadening is homogeneous.
10. **Mirror geometry** (`optics.js`).
    - Build: mirror radii, (g₁, g₂) stability diagram, Gaussian mode; an unstable cavity stops lasing.
    - Check (test): stability boundaries; confocal w₀.
11. **Lenses outside the cavity.**
    - Build: lens picker, q(z) through lenses, focal spot; lamp + lens ray tracing showing that a lens can't make a laser (§8.3); wavelength colours.
    - Check (test): thin-lens q transform; exact ray trace agrees with the paraxial result for small angles.
12. **Learn section.**
    - Build: chapters in `data/laser.json` (rich text), each with a "Try it on the bench" button (`data-preset="…"`) that loads a preset from `presets.js` and scrolls to the bench; the indicators from §11.6.
    - Check (browser): every preset loads; each chapter reads well in both languages.
13. **Extras, one stage each:** Brewster windows/polarization (§9), second harmonic (§10.2), thermal lens (§8.7), mode-locking scene (§4.5), self-focusing (§10.3).
14. **Docs**, updated together with whichever stage changes them:
    - `CLAUDE.md`: route, file map, tests, why the laser page doesn't use `js/labs.js`;
    - `Instructions/LABS-GUIDE.md`: pointer to the laser page;
    - editing notes for `data/laser.json`.

## Verification (every stage)

- `node --test` stays green.
- Serve the site (`python3 -m http.server 5500`), open `http://localhost:5500/?view=laser` and check:
  - dark and light theme;
  - hy and en;
  - narrow (mobile) width;
  - scroll away and come back (loop paused);
  - switch language mid-run (no doubled loop and no console errors).
- The existing labs (`?view=lab&id=pendulum`, `refraction`) still work unchanged.

## Notes

- `tests/` and `docs/` are deployed with the site and can be opened publicly. That's harmless, since they're only static files.
- The physics numbers stay in JS (`media.js`, `presets.js`); `data/laser.json` holds only words. That keeps the site's rule that editors edit text, not physics.
- Most medium parameters in §5.1 are textbook values that haven't been checked against printed sources yet (see "Sources" in `docs/laser-physics.md`). Check them before the site goes public.
