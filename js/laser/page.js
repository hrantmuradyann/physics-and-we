/* ============================================================================
   page.js — builds the laser page (?view=laser) once the router has put
   its layout (sections/laser.html) and words (data/laser.json) on the page.

   It connects the parts and owns nothing else: the physics is in
   js/laser/engine/ (this file only calls LaserEngine.bench and
   LaserEngine.media), the drawing in js/laser/ui/. Two dropdowns choose
   the laser: a gain medium, and one of the pumps the engine runs it with
   (docs/laser-plan.md, stage 7c). A slider and a number box each set the
   pump (its power, its flash's energy or its current), the output coupler
   and the slow motion; Fire fires a flashlamp. Four pictures: the bench,
   the chart of the output power, the cartoon of atoms and photons, and the
   energy levels (stages 6 and 6b).

   WHY IT TAKES ITSELF DOWN FIRST
   The router (js/router.js) fires "section:ready" for this page more often
   than the visitor opens it: once when it quietly builds every page in the
   background (this page is hidden then), and again on every language
   switch. So each time the previous build is taken down first, nothing
   heavy happens while building, and the loop only runs while a canvas is
   on screen (js/laser/ui/loop.js). The build is synchronous (the words
   arrive with the event), so tearing down first is enough; js/labs.js
   also needs a generation counter only because it fetches its words.

   WHAT SURVIVES A REBUILD
   The experiment itself (`state` below: the bench chosen, the simulation,
   the chart's history, the cartoon, Play/Pause, the flash threshold) lives
   outside the build, so a language switch changes the words, not the
   experiment.

   CHOOSING A LASER
   A new medium keeps the pump if it has one of that kind, else takes its
   first. Either choice starts a new bench from the engine's setup
   (bench.configFor): a new simulation (so no flash of the old bench is
   kept), an empty chart, a new cartoon, the slow motion the bench starts
   at (START_SLOW_MOTION) and the sliders' ranges of that bench
   (bench.controls). Play/Pause is kept. A medium the engine cannot run
   yet is listed but disabled; if a browser lets the visitor reach it
   anyway, the choice is refused and the dropdown goes back.

   TIME
   Each frame moves the simulation by (real seconds) / (slow motion), in
   pieces (one chart point each) that share FRAME_STEPS solver steps: about
   POINTS_PER_SECOND points a second of screen time, so the chart holds the
   same stretch of time on a 60 Hz and a 240 Hz screen. When the steps run
   out the simulation falls behind instead of freezing the page; if that
   happens in more than a quarter of the frames of a second, a note says
   so. The cost per step was measured in the stage-6 audit, and each
   bench's cost a frame in stage 7c (docs/laser-plan.md).

   ERRORS
   An error in a frame pauses the loop (loop.js); the Play button then says
   Play, so the visitor can try again. A build that fails part-way takes
   down what it had set up before passing the error on.

   Tests: tests/laser/page.test.js, tests/laser/page-choose.test.js
   ========================================================================== */
(function (root) {
  "use strict";

  var ROUTE = "laser";
  var SLIDER_STEPS = 1000;                            // a slider runs 0..1000
  var SLIDER_DIGITS = 4;                              // a slider gives values of 4 digits: 13.46 W
  var BOX_DIGITS = 6;                                 // a number box shows and gives 6 digits
  // 1 s on screen from 1 ms (the slowest lasers) to 1 ns (the fastest).
  var SLOW_MOTION = { min: 1e3, max: 1e9, log: true };
  // The slow motion each bench starts at (docs/laser-plan.md, stage 7c):
  // one second on screen shows the part of its run worth watching. A flash
  // lasts about a millisecond; the solid-state lasers' spikes come every
  // few microseconds; the gas and dye lasers settle within a microsecond.
  var START_SLOW_MOTION = {
    "ruby flashlamp": 1e4,                            // 1 s = 100 µs
    "nd-glass flashlamp": 1e4,
    "nd-yag diode": 1e4,
    "nd-yag flashlamp": 1e4,
    "he-ne discharge": 1e6,                           // 1 s = 1 µs
    "ar-ion discharge": 1e7,                          // 1 s = 100 ns
    "co2 discharge": 1e4,
    "dye-r6g laser": 1e7,
    "ti-sapphire laser": 1e6,
    "two-level laser": 1e3,                           // 1 s = 1 ms
    "two-level flashlamp": 1e4
  };
  // A bench missing above (page-choose.test.js checks that none is) starts here.
  var DEFAULT_SLOW_MOTION = 1e4;
  var POINTS_PER_SECOND = 480;                        // chart points a second of screen time
  var MAX_PIECES = 8;                                 // at most 8 a frame (60 Hz and slower)
  var FRAME_STEPS = 1500;                             // solver steps per frame
  var WINDOW = 5;                                     // s of screen time on the chart
  // Points the chart keeps. 480 a second × WINDOW = 2400 up to 480 Hz; a
  // faster screen gets one a frame, so 16384 is enough up to 3000 Hz (the
  // first version kept 8 a frame in 4096 points, which cut the plot short
  // on a 120 Hz Mac).
  var HISTORY_SIZE = 16384;
  var READOUT_EVERY = 0.1;                            // s between live readouts
  var BEHIND_EVERY = 1;                               // s of frames judged for the note
  var BEHIND_SHARE = 0.25;                            // the note shows above this share
  var CARTOON = { cols: 12, rows: 5 };                // the atoms of the photon picture
  var PUMP_FULL = 4;                                  // the pump glows fully from 4 × threshold
  var NO_BREAK = "\u00a0";                          // between a number and its unit

  var CONTROLS = ["pump", "coupler", "slowMotion"];
  var CHOICES = ["medium", "pump"];
  // Every number the page can show, and the ones each pump shows (the
  // others are hidden): a threshold in the pump's own terms, and for a
  // flash the highest output since it was fired instead of the steady
  // numbers, which a flash does not have.
  var READOUTS = ["pumpThreshold", "currentThreshold", "flashThreshold", "x", "gth", "tau_c", "P_out", "peak",
    "powerNow", "T_best", "period", "time"];
  var STEADY_ROWS = ["pumpThreshold", "x", "gth", "tau_c", "P_out", "powerNow", "T_best", "period", "time"];
  var ROWS = {
    diode: STEADY_ROWS,
    laser: STEADY_ROWS,
    discharge: ["currentThreshold", "x", "gth", "tau_c", "P_out", "powerNow", "T_best", "period", "time"],
    flashlamp: ["flashThreshold", "x", "gth", "tau_c", "peak", "powerNow", "time"]
  };
  // The two-level atom has no threshold to measure the pump against, no
  // best mirror and no oscillation.
  var TWO_LEVEL_HIDES = ["x", "T_best", "period"];
  // The readouts that change while the simulation runs ("x" for a flash).
  var LIVE_READOUTS = ["x", "peak", "powerNow", "time"];
  var CANVASES = ["bench", "power", "photons", "levels"];
  var LEVEL_WORDS = ["pumpBand", "upper", "lower", "ground", "gain", "loss"];
  var POWER_WORDS = ["title", "steady"];

  var teardown = null;          // takes the current build down, or null
  var state = null;             // the experiment, kept across rebuilds

  function prefersLessMotion() {
    return typeof root.matchMedia === "function" &&
      root.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  // The cartoon of atoms and photons: an illustration with random events
  // of its own (js/laser/ui/draw-photons.js), not the physics.
  function newCartoon() {
    return root.LaserUI.photons.create({ cols: CARTOON.cols, rows: CARTOON.rows, random: Math.random });
  }

  function startSlowMotion(config) {
    var start = START_SLOW_MOTION[config.medium + " " + config.pump];
    return start === undefined ? DEFAULT_SLOW_MOTION : start;
  }

  // The smallest flash that makes the bench lase (J; null for a bench
  // without a flashlamp, or one that never lases). It is a search, 8 ms
  // in Chrome for ruby (60 ms in Node), so it is found again only when the
  // bench or its output mirror changes: never in a frame, and not at every
  // step of a drag of the output mirror's slider (only when it is let go).
  function thresholdFlash(config) {
    if (config.pump !== "flashlamp") return null;
    return root.LaserEngine.bench.flashThreshold(config);
  }

  function newState() {
    var bench = root.LaserEngine.bench;
    var config = bench.defaultConfig();
    return {
      config: config,
      sim: bench.start(config),
      history: root.LaserUI.history.create(HISTORY_SIZE),
      cartoon: newCartoon(),
      slowMotion: startSlowMotion(config),
      playing: !prefersLessMotion(),
      behind: false,
      peak: null,                                     // the highest output since Fire, W
      flashThreshold: thresholdFlash(config),
      // True while the output mirror's slider is dragged: the threshold
      // flash is then the old mirror's, and is found again when it is let go.
      flashThresholdOld: false
    };
  }

  // One word from data/laser.json in the visitor's language ("" if missing).
  function word(data, path) {
    return root.Content.inLang(root.Content.valueAt(data, path), root.Site.lang);
  }

  // The words `names` under `path`, as { name: word }.
  function wordsAt(data, path, names) {
    var words = {};
    names.forEach(function (name) { words[name] = word(data, path + "." + name); });
    return words;
  }

  function clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
  }

  // A value rounded to `digits` significant digits: 13.4612 -> 13.46.
  function round(value, digits) {
    return Number(value.toPrecision(digits));
  }

  // The number typed into a box, or NaN. A decimal comma is read as a
  // point (Armenian writes 13,5), and spaces between digits are dropped
  // (10 000). The boxes are type="text" for this: a type="number" box
  // hands the page "" for "13,5" in some browsers (iOS Safari), and the
  // typed value was lost without a word (stage 6b review).
  function readNumber(text) {
    var cleaned = String(text).replace(/[\s\u00a0]/g, "").replace(",", ".");
    if (cleaned === "") return NaN;
    return Number(cleaned);
  }

  function siteWord(key) {
    return typeof root.Site.word === "function" ? root.Site.word(key) : "";
  }

  /* ---------- building ---------- */

  // Builds the page inside the router's container. Returns the function
  // that takes it down again, or null if there is nothing to build (the
  // layout failed to load, so the router put an error message there).
  function build(container, data) {
    var found = {};
    var any = false;
    CANVASES.forEach(function (name) {
      found[name] = container.querySelector('[data-laser-canvas="' + name + '"]');
      if (found[name]) any = true;
    });
    if (!any) return null;
    if (!state) state = newState();

    var engine = root.LaserEngine;
    var bench = engine.bench;
    var UI = root.LaserUI;
    var F = UI.format;
    var derived = null;         // bench.derive(state.config)
    var controls = null;        // bench.controls(state.config): the sliders' ranges
    var sinceReadout = 0;
    var cursor = null;          // the pointer over the chart, CSS px from its left
    var unhook = [];            // functions that remove this build's listeners
    var shows = {};             // each control's function that shows its value

    function find(selector) {
      return container.querySelector(selector);
    }

    // A listener this build adds, and the way to remove it at teardown.
    function listen(element, type, handler) {
      element.addEventListener(type, handler);
      unhook.push(function () { element.removeEventListener(type, handler); });
    }

    // The still numbers and the sliders' ranges of a config.
    function numbersOf(config) {
      return { derived: bench.derive(config), controls: bench.controls(config) };
    }
    // A new config and its numbers, taken together. Whatever can fail (a
    // config the engine refuses, a threshold search) is worked out before,
    // so a failure leaves the old bench as it was.
    function take(config, numbers) {
      state.config = config;
      derived = numbers.derived;
      controls = numbers.controls;
    }
    take(state.config, numbersOf(state.config));

    /* the words */
    var labels = wordsAt(data, "bench.parts", UI.bench.PARTS);
    // The name under the pump is the chosen pump's (bench.pumps.<kind>; the
    // drawing's own word if it has none). Until stage 7d every pump is drawn
    // as the diodes.
    var anyPump = labels.pump;
    function nameThePump() {
      labels.pump = word(data, "bench.pumps." + state.config.pump) || anyPump;
    }
    nameThePump();
    var levelWords = wordsAt(data, "levels.words", LEVEL_WORDS);
    var powerWords = wordsAt(data, "power.words", POWER_WORDS);
    var photonWords = wordsAt(data, "photons.words", UI.photons.WORDS);
    var never = word(data, "readouts.never") || "—";

    // Each picture's name for screen readers (role="img" is in the layout):
    // its description, or else the page title. With neither, an unnamed
    // picture is worse than none, so it is hidden from screen readers. Set
    // as attributes, so a word is never read as markup.
    CANVASES.forEach(function (name) {
      var canvas = found[name];
      if (!canvas) return;
      var label = word(data, name + ".alt") || word(data, "page.title");
      if (label) {
        canvas.setAttribute("aria-label", label);
        canvas.removeAttribute("aria-hidden");
      } else {
        canvas.removeAttribute("aria-label");
        canvas.setAttribute("aria-hidden", "true");
      }
    });

    /* what the simulation shows now */
    function powerNow() {
      return derived.powerPerPhoton * Math.exp(state.sim.lnPhi);
    }
    // The inversion over threshold, y = N/N_c (§11.2): from −n_t (every
    // ion down) for three and two levels, from 0 for four.
    function inversionNow() {
      return state.sim.N / derived.N_c;
    }
    // The light's strength for the pictures: the output over the output at
    // twice threshold.
    function beamNow() {
      return powerNow() / derived.powerAtTwiceThreshold;
    }
    // The pump at this moment: { x, w, smallSignal } (a flash rises and
    // falls). bench.pumpNow derives the whole bench again, and the pictures
    // ask for it several times a frame, so the answer is kept until the
    // simulation moves on or the bench changes (both are new objects then).
    var pumpKept = { sim: null, derived: null, pump: null };
    function pumpNow() {
      if (pumpKept.sim !== state.sim || pumpKept.derived !== derived) {
        pumpKept = {
          sim: state.sim,
          derived: derived,
          pump: bench.pumpNow({ sim: state.sim, config: state.config })
        };
      }
      return pumpKept.pump;
    }
    // The pump's strength for the pictures: x, in units of threshold; the
    // two-level atom, which has no threshold, by its W_pτ instead.
    function pumpLevel() {
      var pump = pumpNow();
      return pump.x !== null ? pump.x : pump.w;
    }
    // How strongly the pump glows on the bench and in the cartoon, 0 to 1.
    function glowNow() {
      return Math.min(1, pumpLevel() / PUMP_FULL);
    }
    // The share of the cartoon's atoms that are excited: for four levels
    // y/(1 + y), half of them at threshold (y = 1); for three and two
    // levels the share of ions up, N₂/N_t = (N_t + ΔN)/(2N_t).
    function excitedNow() {
      if (derived.scheme === "four-level") {
        var y = inversionNow();
        return y / (1 + y);
      }
      return (derived.N_t + state.sim.N) / (2 * derived.N_t);
    }
    function remember() {
      state.history.push(state.sim.t, powerNow());
    }
    if (state.history.size() === 0) remember();

    // A new simulation of the bench: from the start, with an empty chart,
    // a new cartoon and no flash.
    function restart() {
      state.sim = bench.start(state.config);
      state.history.clear();
      state.cartoon = newCartoon();       // no atoms or light left from the old run
      state.peak = null;
      remember();
    }

    /* readouts */
    function setText(selector, text) {
      var element = find(selector);
      if (element) element.textContent = text;
    }
    // The readouts this bench shows.
    function rowsShown() {
      var rows = ROWS[state.config.pump];
      if (derived.scheme !== "two-level") return rows;
      return rows.filter(function (name) { return TWO_LEVEL_HIDES.indexOf(name) === -1; });
    }
    function showRows() {
      var rows = rowsShown();
      READOUTS.forEach(function (name) {
        var row = find('[data-laser-row="' + name + '"]');
        if (row) row.hidden = rows.indexOf(name) === -1;
      });
    }
    function readoutText(name) {
      var d = derived;
      if (name === "pumpThreshold") return d.pumpThreshold === null ? never : F.si(d.pumpThreshold, "W");
      if (name === "currentThreshold") return d.currentThreshold === null ? never : F.si(d.currentThreshold, "A");
      if (name === "flashThreshold") {
        if (state.flashThresholdOld) return "…";       // found when the slider is let go
        return state.flashThreshold === null ? never : F.si(state.flashThreshold, "J");
      }
      if (name === "x") return F.number(pumpNow().x);  // its row is hidden where x is null
      if (name === "gth") return F.number(d.gth) + NO_BREAK + "m⁻¹";
      if (name === "tau_c") return F.si(d.tau_c, "s");
      if (name === "P_out") return F.si(d.P_out, "W");
      if (name === "peak") return state.peak === null ? "—" : F.si(state.peak, "W");
      // 0 when the gain cannot beat the internal loss: no mirror is best.
      if (name === "T_best") return d.T_best === null || d.T_best <= 0 ? "—" : F.number(100 * d.T_best) + NO_BREAK + "%";
      if (name === "period") return d.period === null ? "—" : F.si(d.period, "s");
      if (name === "powerNow") return F.si(powerNow(), "W");
      return F.si(state.sim.t, "s");                       // "time"
    }
    // Writes the readouts `names` that this bench shows.
    function showReadouts(names) {
      var shown = rowsShown();
      names.forEach(function (name) {
        if (shown.indexOf(name) === -1) return;
        setText('[data-laser-readout="' + name + '"]', readoutText(name));
      });
    }
    function showAll() {
      showReadouts(READOUTS);
      sinceReadout = 0;
    }
    function showBehind() {
      var note = find('[data-laser-note="behind"]');
      if (note) note.hidden = !state.behind;
    }
    // The note is judged over BEHIND_EVERY seconds of frames, so a dropped
    // frame now and then does not make it blink.
    var judgedTime = 0;
    var judgedFrames = 0;
    var framesBehind = 0;
    function setBehind(value) {
      judgedTime = 0;
      judgedFrames = 0;
      framesBehind = 0;
      if (value !== state.behind) {
        state.behind = value;
        showBehind();
      }
    }
    function judgeFrame(dt, behind) {
      judgedTime += dt;
      judgedFrames += 1;
      if (behind) framesBehind += 1;
      if (judgedTime >= BEHIND_EVERY) setBehind(framesBehind > BEHIND_SHARE * judgedFrames);
    }

    /* the loop */
    function update(dt) {
      if (dt <= 0) return;                    // a frame after a (re)start only draws
      // 8 pieces a frame at 60 Hz, 2 at 240 Hz, 1 from 480 Hz up.
      var pieces = Math.min(MAX_PIECES, Math.max(1, Math.round(dt * POINTS_PER_SECOND)));
      var piece = dt / state.slowMotion / pieces;
      var stepsLeft = FRAME_STEPS;
      var behind = false;
      for (var i = 0; i < pieces; i++) {
        if (stepsLeft < 1) {
          behind = true;
          break;
        }
        var run = bench.advance({ sim: state.sim, config: state.config, seconds: piece, maxSteps: stepsLeft });
        state.sim = run.sim;
        stepsLeft -= run.steps;
        remember();
        // The highest output since Fire, at the chart's points.
        if (state.peak !== null) state.peak = Math.max(state.peak, powerNow());
        if (!run.reachedEnd) {
          behind = true;
          break;
        }
      }
      judgeFrame(dt, behind);

      // The cartoon acts the simulation out in screen time, its light as
      // bright as the beam.
      state.cartoon.step(dt, {
        excited: excitedNow(),
        light: UI.bench.rayAlpha(beamNow()),
        pump: glowNow()
      });

      sinceReadout += dt;
      if (sinceReadout >= READOUT_EVERY) {
        sinceReadout = 0;
        showReadouts(LIVE_READOUTS);
      }
    }

    // An error in a frame pauses the loop (loop.js): the button must then
    // say Play. The error is passed on, so it still shows in the console.
    function pauseOnError(work) {
      return function (argument) {
        try {
          work(argument);
        } catch (err) {
          state.playing = false;
          showPlay();
          throw err;
        }
      };
    }

    /* the pictures */
    var canvases = [];
    function addCanvas(name, size, draw) {
      var canvas = found[name];
      if (!canvas) return;
      canvases.push({
        canvas: canvas,
        box: canvas.parentNode,
        aspect: size.aspect,
        minHeight: size.minHeight,
        maxHeight: size.maxHeight,
        draw: pauseOnError(draw)
      });
    }
    addCanvas("bench", UI.bench.SIZE, function (view) {
      UI.bench.draw(view, labels, {
        beam: beamNow(),
        pump: glowNow(),
        transmission: 1 - state.config.refl2
      });
    });
    addCanvas("power", UI.plots.SIZE, function (view) {
      var shownTime = WINDOW / state.slowMotion;          // simulated s on the chart
      // A line at the steady output, if there is one above 0: not for a
      // flash, a laser below threshold, or the two-level atom.
      var lines = [];
      if (derived.P_out !== null && derived.P_out > 0) lines.push({ value: derived.P_out, word: powerWords.steady, tone: "soft" });
      UI.plots.draw(view, {
        points: state.history.points(state.sim.t - shownTime),
        key: "P",
        tNow: state.sim.t,
        shownTime: shownTime,
        floor: derived.powerAtTwiceThreshold,
        unit: "W",
        title: powerWords.title,
        color: "accent",
        lines: lines,
        cursor: cursor
      });
    });
    addCanvas("photons", UI.photons.SIZE, function (view) {
      UI.photons.draw(view, state.cartoon, photonWords);
    });
    addCanvas("levels", UI.levels.SIZE, function (view) {
      var y = inversionNow();
      // Stimulated emission in units of the threshold rate: y·p (§11.2).
      var p = Math.exp(state.sim.lnPhi + derived.sOnePhoton);
      // The picture is the four-level one until stage 7d: it has no room
      // below zero, where three and two levels start (every ion down) and
      // where the two-level atom's small-signal gain always is.
      UI.levels.draw(view, {
        x: pumpLevel(),
        smallSignal: Math.max(0, pumpNow().smallSignal),
        y: Math.max(0, y),
        stim: Math.max(0, y * p),
        words: levelWords
      });
    });

    /* the choice of laser */
    var selects = {};
    CHOICES.forEach(function (name) {
      selects[name] = find('[data-laser-choose="' + name + '"]');
    });

    // Makes a dropdown's options again: [{ value, text, disabled }]. The
    // names are set as text, never as markup.
    function fill(select, options) {
      while (select.firstChild) select.removeChild(select.firstChild);
      options.forEach(function (item) {
        var option = root.document.createElement("option");
        option.value = item.value;
        option.textContent = item.text;
        option.disabled = item.disabled;
        select.appendChild(option);
      });
    }
    // Both dropdowns, for the bench chosen. A missing name falls back to
    // the engine's id, so no option is ever blank.
    function showChoices() {
      if (selects.medium) {
        var later = word(data, "choose.later");
        fill(selects.medium, engine.media.list().map(function (id) {
          var notYet = bench.pumpsFor(id).length === 0;
          var name = word(data, "media." + id) || id;
          return { value: id, text: notYet && later ? name + " (" + later + ")" : name, disabled: notYet };
        }));
        selects.medium.value = state.config.medium;
      }
      if (selects.pump) {
        fill(selects.pump, bench.pumpsFor(state.config.medium).map(function (kind) {
          return { value: kind, text: word(data, "pumps." + kind) || kind, disabled: false };
        }));
        selects.pump.value = state.config.pump;
      }
    }
    // Fire is there only for a flashlamp.
    function showFire() {
      var fire = find('[data-laser-action="fire"]');
      if (fire) fire.hidden = state.config.pump !== "flashlamp";
    }
    // A new bench: the engine's setup of that medium and pump.
    function chooseBench(medium, pump) {
      var config = bench.configFor({ medium: medium, pump: pump });
      var numbers = numbersOf(config);
      var threshold = thresholdFlash(config);
      take(config, numbers);
      state.flashThreshold = threshold;
      state.flashThresholdOld = false;
      state.slowMotion = startSlowMotion(config);
      nameThePump();
      restart();
      showChoices();
      CONTROLS.forEach(function (name) { if (shows[name]) shows[name](); });
      showRows();
      showFire();
      setBehind(false);
      showAll();
      loop.redraw();
    }
    function connectChoices() {
      if (selects.medium) {
        listen(selects.medium, "change", function () {
          var medium = selects.medium.value;
          var pumps = engine.media.list().indexOf(medium) === -1 ? [] : bench.pumpsFor(medium);
          if (pumps.length === 0) {
            // Not a medium the bench runs (a disabled option some browsers
            // let the keyboard reach): the dropdown goes back.
            selects.medium.value = state.config.medium;
            return;
          }
          var pump = pumps.indexOf(state.config.pump) === -1 ? pumps[0] : state.config.pump;
          chooseBench(medium, pump);
        });
      }
      if (selects.pump) {
        listen(selects.pump, "change", function () {
          var pump = selects.pump.value;
          if (bench.pumpsFor(state.config.medium).indexOf(pump) === -1) {
            selects.pump.value = state.config.pump;
            return;
          }
          chooseBench(state.config.medium, pump);
        });
      }
    }

    /* the sliders and their number boxes */
    function rangeOf(name) {
      if (name === "pump") return controls.pump;
      if (name === "coupler") return controls.coupler;
      return SLOW_MOTION;
    }
    function valueOf(name) {
      if (name === "pump") return state.config[controls.pump.name];
      if (name === "coupler") return 1 - state.config.refl2;
      return state.slowMotion;
    }
    // The pump's unit: W of light, J of a flash, A of a current.
    function pumpUnit() {
      var field = controls.pump.name;
      if (field === "flashEnergy") return "J";
      if (field === "current") return "A";
      return "W";
    }
    // What a number box shows: the value times `factor`, in `unit`. A
    // current that never reaches 1 A is shown in mA.
    function shownOf(name) {
      if (name === "coupler") return { unit: "%", factor: 100 };
      if (name === "slowMotion") return { unit: "×", factor: 1 };
      if (pumpUnit() === "A" && controls.pump.max < 1) return { unit: "mA", factor: 1000 };
      return { unit: pumpUnit(), factor: 1 };
    }
    // A value as a sentence: for screen readers on the slider, and under
    // the slow-motion slider.
    function valueText(name, value) {
      if (name === "pump") return F.si(value, pumpUnit());
      if (name === "coupler") return F.number(100 * value) + NO_BREAK + "%";
      // Slow motion: how much simulated time one second on screen shows.
      return "1" + NO_BREAK + "s = " + F.si(1 / value, "s");
    }

    function connectControls() {
      CONTROLS.forEach(function (name) {
        var slider = find('[data-laser-control="' + name + '"]');
        var box = find('[data-laser-input="' + name + '"]');

        // Writes the value everywhere it is shown, with this bench's range
        // and unit.
        function show() {
          var value = valueOf(name);
          var text = valueText(name, value);
          var shown = shownOf(name);
          setText('[data-laser-unit="' + name + '"]', shown.unit);
          if (name === "pump") setText('[data-laser-name="pump"]', word(data, "controls.pump." + state.config.pump));
          if (slider) {
            slider.value = String(Math.round(SLIDER_STEPS * F.toSlider(rangeOf(name), value)));
            slider.setAttribute("aria-valuetext", text);
          }
          if (box) box.value = F.plain(shown.factor * value, BOX_DIGITS);
          setText('[data-laser-value="' + name + '"]', text);
        }
        shows[name] = show;
        // A new value from the slider or the box. `settled`: the value is
        // final (typed, or the slider let go), not a step of a drag.
        function use(value, settled) {
          if (name === "slowMotion") {
            state.slowMotion = value;
          } else {
            // A changed copy of the config, taken only once its numbers
            // are worked out.
            var config = Object.assign({}, state.config);
            if (name === "pump") config[controls.pump.name] = value;
            else config.refl2 = 1 - value;
            var numbers = numbersOf(config);
            // The flash threshold depends on the output mirror, not on the
            // flash's energy; while the mirror is dragged it waits.
            var threshold = state.flashThreshold;
            if (name === "coupler" && settled) threshold = thresholdFlash(config);
            take(config, numbers);
            state.flashThreshold = threshold;
            if (name === "coupler") state.flashThresholdOld = !settled;
          }
          show();
          setBehind(false);                   // the new setting is judged afresh
          showAll();                          // "now" depends on the bench too
          loop.redraw();
        }

        if (slider) {
          slider.min = "0";
          slider.max = String(SLIDER_STEPS);
          slider.step = "1";
          // The slider's value, rounded so the box shows exactly what is
          // simulated.
          function sliderValue() {
            var range = rangeOf(name);
            var value = F.fromSlider(range, Number(slider.value) / SLIDER_STEPS);
            return clamp(round(value, SLIDER_DIGITS), range.min, range.max);
          }
          // "input": every step of a drag; "change": the slider let go, or
          // moved by a key.
          listen(slider, "input", function () { use(sliderValue(), false); });
          listen(slider, "change", function () { use(sliderValue(), true); });
        }
        if (box) {
          // "change": Enter, or leaving the box. A typed value is rounded
          // to the digits the box shows (so it shows exactly what is
          // simulated) and held inside the slider's range; text that is no
          // number, or nothing, puts the old value back.
          listen(box, "change", function () {
            var typed = readNumber(box.value);
            if (!isFinite(typed)) {
              show();
              return;
            }
            var range = rangeOf(name);
            var rounded = round(typed, BOX_DIGITS) / shownOf(name).factor;
            use(clamp(rounded, range.min, range.max), true);
          });
        }
        show();
      });
    }

    /* the buttons */
    var playButton = find('[data-laser-action="play"]');
    function showPlay() {
      if (playButton) playButton.textContent = siteWord(state.playing ? "labPause" : "labPlay");
    }
    function play() {
      state.playing = true;
      showPlay();
      loop.play();
    }
    function connectButtons() {
      if (playButton) {
        listen(playButton, "click", function () {
          if (!state.playing) {
            play();
            return;
          }
          state.playing = false;
          showPlay();
          loop.pause();
          setBehind(false);                   // paused: nothing is behind
          showAll();                          // paused: show the exact moment
        });
      }
      var resetButton = find('[data-laser-action="reset"]');
      if (resetButton) {
        listen(resetButton, "click", function () {
          restart();
          setBehind(false);
          showAll();
          loop.redraw();
        });
      }
      // Fire: a flash of the slider's energy, from the moment the
      // simulation has reached. The visitor asked to see a flash, so a
      // paused page starts playing.
      var fireButton = find('[data-laser-action="fire"]');
      if (fireButton) {
        listen(fireButton, "click", function () {
          if (state.config.pump !== "flashlamp") return;
          state.sim = bench.fire({ sim: state.sim, config: state.config });
          state.peak = powerNow();
          if (!state.playing) play();
          showAll();
          loop.redraw();
        });
      }
      // "Dig deeper": down to the theory at the bottom of the page.
      var learnButton = find('[data-laser-action="learn"]');
      var theory = find("[data-laser-learn]");
      if (learnButton && theory) {
        listen(learnButton, "click", function () {
          theory.scrollIntoView({ behavior: prefersLessMotion() ? "auto" : "smooth", block: "start" });
        });
      }
    }

    /* the pointer over the chart: its crosshair follows */
    function connectPointer() {
      var canvas = found.power;
      if (!canvas) return;
      // Only the chart is drawn again; a running loop draws it on its next
      // frame anyway.
      function pointAt(event) {
        cursor = event.offsetX;
        loop.redraw(canvas);
      }
      // A tap on a touch screen sends no pointermove, so the crosshair
      // also goes where the pointer comes down (with touch-action: pan-y
      // in css/laser.css, a sideways drag moves it).
      listen(canvas, "pointerdown", pointAt);
      listen(canvas, "pointermove", pointAt);
      // A finger leaves the screen after every tap: its crosshair stays
      // until the next tap. A mouse or pen takes it away.
      listen(canvas, "pointerleave", function (event) {
        if (event.pointerType === "touch") return;
        cursor = null;
        loop.redraw(canvas);
      });
    }

    function takeDown() {
      unhook.forEach(function (remove) { remove(); });
      loop.destroy();
    }

    // If a draw throws here, loop.js has registered nothing yet.
    var loop = UI.loop.create({ canvases: canvases, update: pauseOnError(update), running: state.playing });
    try {
      connectChoices();
      connectControls();
      connectButtons();
      connectPointer();
      showChoices();
      showRows();
      showFire();
      showPlay();
      showAll();
      showBehind();
    } catch (err) {
      takeDown();                             // a failed build leaves nothing behind
      throw err;
    }
    return takeDown;
  }

  root.addEventListener("section:ready", function (event) {
    var detail = event.detail || {};
    if (detail.route !== ROUTE) return;
    if (teardown) {
      teardown();
      teardown = null;
    }
    if (!detail.container) return;
    teardown = build(detail.container, detail.data || {});
  });
})(this);
