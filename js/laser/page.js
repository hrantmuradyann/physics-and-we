/* ============================================================================
   page.js — builds the laser page (?view=laser) once the router has put
   its layout (sections/laser.html) and words (data/laser.json) on the page.

   It connects the parts and owns nothing else: the physics is in
   js/laser/engine/ (this file only calls LaserEngine.bench), the drawing in
   js/laser/ui/. Build stage 6: one Nd:YAG laser, pumped continuously, with
   sliders for the pump, the output coupler and the slow motion.

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
   The experiment itself (`state` below: the bench, the simulation, the
   plot's history, Play/Pause) lives outside the build, so a language
   switch changes the words, not the experiment.

   TIME
   Each frame moves the simulation by (real seconds) / (slow motion), in
   pieces (one plot point each) that share FRAME_STEPS solver steps: about
   POINTS_PER_SECOND points a second of screen time, so the plot holds the
   same stretch of time on a 60 Hz and a 240 Hz screen. When the steps run
   out the simulation falls behind instead of freezing the page; if that
   happens in more than a quarter of the frames of a second, a note says
   so. The cost per step was measured in the stage-6 audit
   (docs/laser-plan.md).

   ERRORS
   An error in a frame pauses the loop (loop.js); the Play button then says
   Play, so the visitor can try again. A build that fails part-way takes
   down what it had set up before passing the error on.

   Tests: tests/laser/page.test.js
   ========================================================================== */
(function (root) {
  "use strict";

  var ROUTE = "laser";
  var SLIDER_STEPS = 1000;                            // a slider runs 0..1000
  var SLOW_MOTION = { min: 1e3, max: 1e6, log: true };
  var START_SLOW_MOTION = 1e4;                        // 1 s on screen = 100 µs
  var POINTS_PER_SECOND = 480;                        // plot points a second of screen time
  var MAX_PIECES = 8;                                 // at most 8 a frame (60 Hz and slower)
  var FRAME_STEPS = 1500;                             // solver steps per frame
  var WINDOW = 5;                                     // s of screen time on the plot
  // Points the plot keeps. 480 a second × WINDOW = 2400 up to 480 Hz; a
  // faster screen gets one a frame, so 16384 is enough up to 3000 Hz (the
  // first version kept 8 a frame in 4096 points, which cut the plot short
  // on a 120 Hz Mac).
  var HISTORY_SIZE = 16384;
  var READOUT_EVERY = 0.1;                            // s between live readouts
  var BEHIND_EVERY = 1;                               // s of frames judged for the note
  var BEHIND_SHARE = 0.25;                            // the note shows above this share
  var NO_BREAK = " ";

  var CONTROLS = ["pump", "coupler", "slowMotion"];
  var DERIVED_READOUTS = ["pumpThreshold", "x", "gth", "tau_c", "P_out", "T_best", "period"];
  var LIVE_READOUTS = ["powerNow", "time"];
  var CANVASES = ["bench", "levels", "plots"];
  var LEVEL_WORDS = ["pumpBand", "upper", "lower", "ground", "gain", "loss"];
  var PLOT_WORDS = ["power", "inversion", "threshold", "time"];

  var teardown = null;          // takes the current build down, or null
  var state = null;             // the experiment, kept across rebuilds

  function prefersLessMotion() {
    return typeof root.matchMedia === "function" &&
      root.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function newState() {
    var bench = root.LaserEngine.bench;
    var history = root.LaserUI.history.create(HISTORY_SIZE);
    var experiment = {
      config: bench.defaultConfig(),
      sim: bench.start(),
      history: history,
      slowMotion: START_SLOW_MOTION,
      playing: !prefersLessMotion(),
      behind: false
    };
    return experiment;
  }

  // One word from data/laser.json in the visitor's language ("" if missing).
  function word(data, path) {
    return root.Content.inLang(root.Content.valueAt(data, path), root.Site.lang);
  }

  function siteWord(key) {
    return typeof root.Site.word === "function" ? root.Site.word(key) : "";
  }

  /* ---------- the controls: value <-> config ---------- */

  function rangeOf(name) {
    var ranges = root.LaserEngine.bench.RANGES;
    if (name === "pump") return ranges.pumpPower;
    if (name === "coupler") return ranges.T_oc;
    return SLOW_MOTION;
  }

  function valueOf(name) {
    if (name === "pump") return state.config.pumpPower;
    if (name === "coupler") return 1 - state.config.refl2;
    return state.slowMotion;
  }

  function setValue(name, value) {
    if (name === "pump") state.config.pumpPower = value;
    else if (name === "coupler") state.config.refl2 = 1 - value;
    else state.slowMotion = value;
  }

  function valueText(name, value) {
    var F = root.LaserUI.format;
    if (name === "pump") return F.si(value, "W");
    if (name === "coupler") return F.number(100 * value) + NO_BREAK + "%";
    // Slow motion: how much simulated time one second on screen shows.
    return "1" + NO_BREAK + "s = " + F.si(1 / value, "s");
  }

  /* ---------- building ---------- */

  // Builds the page inside the router's container. Returns the function
  // that takes it down again, or null if there is nothing to build (the
  // layout failed to load, so the router put an error message there).
  function build(container, data) {
    var found = {};
    CANVASES.forEach(function (name) {
      found[name] = container.querySelector('[data-laser-canvas="' + name + '"]');
    });
    if (!found.bench && !found.levels && !found.plots) return null;
    if (!state) state = newState();

    var bench = root.LaserEngine.bench;
    var UI = root.LaserUI;
    var F = UI.format;
    var derived = bench.derive(state.config);
    var sinceReadout = 0;
    var unhook = [];            // functions that remove this build's listeners

    function find(selector) {
      return container.querySelector(selector);
    }

    // A listener this build adds, and the way to remove it at teardown.
    function listen(element, type, handler) {
      element.addEventListener(type, handler);
      unhook.push(function () { element.removeEventListener(type, handler); });
    }

    /* the words */
    var labels = {};
    UI.bench.PARTS.forEach(function (part) {
      labels[part] = word(data, "bench.parts." + part);
    });
    var levelWords = {};
    LEVEL_WORDS.forEach(function (name) { levelWords[name] = word(data, "levels.words." + name); });
    var plotWords = {};
    PLOT_WORDS.forEach(function (name) { plotWords[name] = word(data, "plots.words." + name); });

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
    function inversionNow() {
      return state.sim.N / derived.N_c;
    }
    function remember() {
      state.history.push(state.sim.t, powerNow(), inversionNow());
    }
    if (state.history.size() === 0) remember();

    /* readouts */
    function setText(selector, text) {
      var element = find(selector);
      if (element) element.textContent = text;
    }
    function readoutText(name) {
      var d = derived;
      if (name === "pumpThreshold") return F.si(d.pumpThreshold, "W");
      if (name === "x") return F.number(d.x);
      if (name === "gth") return F.number(d.gth) + NO_BREAK + "m⁻¹";
      if (name === "tau_c") return F.si(d.tau_c, "s");
      if (name === "P_out") return F.si(d.P_out, "W");
      // 0 when the gain cannot beat the internal loss: no mirror is best.
      if (name === "T_best") return d.T_best === null || d.T_best <= 0 ? "—" : F.number(100 * d.T_best) + NO_BREAK + "%";
      if (name === "period") return d.period === null ? "—" : F.si(d.period, "s");
      if (name === "powerNow") return F.si(powerNow(), "W");
      return F.si(state.sim.t, "s");                       // "time"
    }
    function showReadouts(names) {
      names.forEach(function (name) {
        setText('[data-laser-readout="' + name + '"]', readoutText(name));
      });
    }
    function showAll() {
      showReadouts(DERIVED_READOUTS);
      showReadouts(LIVE_READOUTS);
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
        if (!run.reachedEnd) {
          behind = true;
          break;
        }
      }
      judgeFrame(dt, behind);
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
      UI.bench.draw(view, labels, { beam: powerNow() / derived.powerPerP });
    });
    addCanvas("levels", UI.levels.SIZE, function (view) {
      var y = inversionNow();
      // Stimulated emission in units of the threshold rate: y·p (§11.2).
      var p = Math.exp(state.sim.lnPhi + derived.sOnePhoton);
      UI.levels.draw(view, { x: derived.x, y: y, stim: y * p, words: levelWords });
    });
    addCanvas("plots", UI.plots.SIZE, function (view) {
      var shownTime = WINDOW / state.slowMotion;          // simulated s on the plot
      UI.plots.draw(view, {
        points: state.history.points(state.sim.t - shownTime),
        tNow: state.sim.t,
        window: shownTime,
        Pfloor: derived.powerPerP,
        x: derived.x,
        words: plotWords
      });
    });

    /* the sliders */
    function connectSliders() {
      CONTROLS.forEach(function (name) {
        var input = find('[data-laser-control="' + name + '"]');
        var output = find('[data-laser-value="' + name + '"]');
        function show() {
          var text = valueText(name, valueOf(name));
          if (output) output.textContent = text;
          if (input) input.setAttribute("aria-valuetext", text);
        }
        if (input) {
          input.min = "0";
          input.max = String(SLIDER_STEPS);
          input.step = "1";
          input.value = String(Math.round(SLIDER_STEPS * F.toSlider(rangeOf(name), valueOf(name))));
          listen(input, "input", function () {
            setValue(name, F.fromSlider(rangeOf(name), Number(input.value) / SLIDER_STEPS));
            derived = bench.derive(state.config);
            show();
            setBehind(false);                 // the new setting is judged afresh
            showAll();                        // "now" depends on the bench too
            loop.redraw();
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
    function connectButtons() {
      if (playButton) {
        listen(playButton, "click", function () {
          state.playing = !state.playing;
          showPlay();
          if (state.playing) {
            loop.play();
          } else {
            loop.pause();
            setBehind(false);                 // paused: nothing is behind
            showAll();                        // paused: show the exact moment
          }
        });
      }
      var resetButton = find('[data-laser-action="reset"]');
      if (resetButton) {
        listen(resetButton, "click", function () {
          state.sim = bench.start();
          state.history.clear();
          remember();
          setBehind(false);
          showAll();
          loop.redraw();
        });
      }
    }

    function takeDown() {
      unhook.forEach(function (remove) { remove(); });
      loop.destroy();
    }

    // If a draw throws here, loop.js has registered nothing yet.
    var loop = UI.loop.create({ canvases: canvases, update: pauseOnError(update), running: state.playing });
    try {
      connectSliders();
      connectButtons();
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
