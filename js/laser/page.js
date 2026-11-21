/* ============================================================================
   page.js — builds the laser page (?view=laser) once the router has put
   its layout (sections/laser.html) and words (data/laser.json) on the page.

   It connects the parts and owns nothing else: the physics is in
   js/laser/engine/ (this file only calls LaserEngine.bench and
   LaserEngine.media), the drawing in js/laser/ui/. Two dropdowns choose
   the laser: a gain medium, and one of the pumps the engine runs it with
   (docs/laser-plan.md, stage 7c). Right under the drawing: Fire, which
   fires a flashlamp, and an On/Off switch for the Q-switch, on a laser
   that can have one (stage 8b). A slider and a number box each set the
   pump (its power, its flash's energy or its current), the output coupler,
   the filter's transmission, a curved mirror's radius and the slow motion;
   three buttons per mirror make it flat, concave or convex (stage 10b).
   Four pictures: the bench (with the mirrors' beam, traced rays and F
   since stage 10b), the chart of the output power, the cartoon of atoms
   and photons (stages 6 and 6b), and the mirrors' stability diagram
   (stage 10b). The energy levels with their gain gauge were drawn until
   the owner had them removed, after stage 10a.

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

   UNDER THE DRAWING
   A row right under the laser holds what the visitor reaches for most:
   Fire (only on a flashlamp bench) and the Q-switch's On/Off (only on a
   bench that can have one). The row is hidden when it has neither.

   THE Q-SWITCH
   The page offers one Q-switch, the bleachable filter (the engine's
   "absorber"; the owner chose it over the Pockels cell and the rotating
   prism, which stay in the engine). It needs no timing: switched on, it
   holds the light back until the gain beats it, then bleaches and lets a
   giant pulse out, again and again on a steady pump. Turning it on or off
   does not start the run again: the bench's settings are kept
   (bench.withQSwitch) and the simulation goes on from where it is
   (bench.carryOver), with the chart, the cartoon, the highest output and
   the slow motion, so the visitor sees the steady beam turn into pulses
   and back. A filter turned on starts dark. A new medium or pump keeps
   it on if the new bench can have it. It has its own slider (its
   transmission, bench.controls) and readouts: the loss now and §4.3's
   pulse if the filter bleached now. A giant pulse lasts about 10 ns, far
   less than the time between two chart points, so each run's peak
   (bench.advance) is a point of the chart when it lies inside the run,
   and the highest output is taken from the runs' peaks.

   TIME
   Each frame moves the simulation by (real seconds) / (slow motion), in
   pieces (one chart point each, and one more for a pulse's top inside
   it) that share FRAME_STEPS solver steps: about
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

   Tests: tests/laser/page.test.js, tests/laser/page-choose.test.js,
   tests/laser/page-qswitch.test.js, tests/laser/page-mirrors.test.js
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
    "nd-glass diode": 1e4,
    "nd-yag diode": 1e4,
    "nd-yag flashlamp": 1e4,
    "he-ne discharge": 1e6,                           // 1 s = 1 µs
    "ar-ion discharge": 1e7,                          // 1 s = 100 ns
    "co2 discharge": 1e4,
    "dye-r6g laser": 1e7,
    "dye-r6g flashlamp": 1e6,                         // its flash lasts a few µs
    "ti-sapphire laser": 1e6
  };
  // A bench missing above (page-choose.test.js checks that none is) starts here.
  var DEFAULT_SLOW_MOTION = 1e4;
  var POINTS_PER_SECOND = 480;                        // chart points a second of screen time
  var MAX_PIECES = 8;                                 // at most 8 a frame (60 Hz and slower)
  var FRAME_STEPS = 1500;                             // solver steps per frame
  var WINDOW = 5;                                     // s of screen time on the chart
  // Points the chart keeps. 480 a second × WINDOW = 2400 up to 480 Hz; a
  // faster screen gets one a frame. Each piece may add one more, its
  // pulse's top, so at most twice that: 4800, and 16384 is enough up to
  // 1600 Hz (the first version kept 8 a frame in 4096 points, which cut
  // the plot short on a 120 Hz Mac).
  var HISTORY_SIZE = 16384;
  var READOUT_EVERY = 0.1;                            // s between live readouts
  var BEHIND_EVERY = 1;                               // s of frames judged for the note
  var BEHIND_SHARE = 0.25;                            // the note shows above this share
  var CARTOON = { cols: 12, rows: 5 };                // the atoms of the photon picture
  var PUMP_FULL = 4;                                  // the pump glows fully from 4 × threshold
  var NO_BREAK = "\u00a0";                          // between a number and its unit

  // The filter's slider (absorberT0) is shown only while the filter is on
  // (bench.controls gives null without it).
  var CONTROLS = ["pump", "coupler", "Rc1", "Rc2", "absorberT0", "slowMotion"];
  // The mirrors' shapes (stage 10b): each mirror's three buttons, and the
  // radius slider a curved one has (Rc1, Rc2 above).
  var MIRRORS = ["mirror1", "mirror2"];
  var SHAPES = ["flat", "concave", "convex"];
  // The rays traced through the mirrors for the drawing: from mirror 1, at
  // these shares of the beam's half-width there (the mode's, or half the
  // aperture without one), for this many round trips; the mode's width
  // at this many pieces of the cavity.
  var RAY_STARTS = [0.9, 0.45, -0.45, -0.9];
  var RAY_ROUND_TRIPS = 4;
  var MODE_PIECES = 40;
  // How close to 1 |m| must be for the pair to read "on the edge of stable".
  var EDGE_TOLERANCE = 1e-9;
  // The config fields the drawn cavity (cavityOf) depends on: the mirrors,
  // the lengths, the aperture and the medium (its index n and λ).
  var CAVITY_FIELDS = ["medium", "L", "l_g", "aperture", "mirror1", "mirror2", "Rc1", "Rc2"];
  var CHOICES = ["medium", "pump"];
  // The media the dropdown lists, in its groups (the owner's choice,
  // stage 12c): by what the medium is, then the year it first lased. The
  // engine's two-level atom is in none, so the page does not offer it.
  // The groups' names are choose.groups.* in data/laser.json.
  var MEDIA_GROUPS = [
    { name: "solid", media: ["ruby", "nd-glass", "caf2-dy", "nd-yag", "ti-sapphire"] },
    { name: "gas", media: ["he-ne", "ar-ion", "co2"] },
    { name: "liquid", media: ["dye-r6g"] },
    { name: "semiconductor", media: ["diode"] }
  ];
  function offered(medium) {
    return MEDIA_GROUPS.some(function (group) { return group.media.indexOf(medium) !== -1; });
  }
  // The one Q-switch the page offers: the engine's bleachable filter.
  var FILTER = "absorber";
  // The media whose light a KDP crystal turns green (1.06 µm → 532 nm;
  // stage 13b): the doubling crystal's On/Off shows only on them.
  var DOUBLER_MEDIA = ["nd-yag", "nd-glass"];
  // Every number the page can show, and the ones each pump shows (the
  // others are hidden): a threshold in the pump's own terms, and for a
  // flash the highest output since it was fired instead of the steady
  // numbers, which a flash does not have.
  // Every bench shows its mirrors: stable or not, the beam's narrowest
  // radius and the light they lose (stage 10b), and a bench whose pump
  // heats its rod into a lens that lens's focal length (stage 13c).
  var READOUTS = ["pumpThreshold", "currentThreshold", "flashThreshold", "x", "gth", "tau_c",
    "stability", "waist", "mirrorLoss", "thermalLens", "lossNow", "P_out", "giant", "peak", "powerNow", "harmonic", "T_best", "period", "time"];
  var MIRROR_ROWS = ["stability", "waist", "mirrorLoss", "thermalLens"];
  var STEADY_ROWS = ["pumpThreshold", "x", "gth", "tau_c"].concat(MIRROR_ROWS, ["P_out", "powerNow", "T_best", "period", "time"]);
  var ROWS = {
    diode: STEADY_ROWS,
    laser: STEADY_ROWS,
    discharge: ["currentThreshold", "x", "gth", "tau_c"].concat(MIRROR_ROWS, ["P_out", "powerNow", "T_best", "period", "time"]),
    flashlamp: ["flashThreshold", "x", "gth", "tau_c"].concat(MIRROR_ROWS, ["peak", "powerNow", "time"])
  };
  // The filter adds the loss now and §4.3's pulse. A bench with no steady output (derive gives P_out null: a
  // flash, or a steady pump behind a filter, which pulses) has no best
  // mirror or oscillation, and shows the highest output instead.
  var SWITCH_ROWS = ["lossNow", "giant"];
  var PULSING_HIDES = ["P_out", "T_best", "period"];
  // The readouts that change while the simulation runs ("x" for a flash).
  var LIVE_READOUTS = ["x", "lossNow", "giant", "peak", "powerNow", "harmonic", "time"];
  var CANVASES = ["bench", "power", "photons", "atoms", "stability"];
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

  // Inside one atom: the medium's energy levels with a row of atoms acting
  // the simulation out (js/laser/ui/draw-atoms.js), an illustration too.
  function newAtoms() {
    return root.LaserUI.atoms.create({ random: Math.random });
  }

  function startSlowMotion(config) {
    var start = START_SLOW_MOTION[benchName(config)];
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

  // Can this bench have the filter?
  function hasFilter(config) {
    return root.LaserEngine.bench.qSwitchesFor({ medium: config.medium, pump: config.pump }).indexOf(FILTER) !== -1;
  }
  // Whether a bench has the doubling crystal's On/Off (stage 13b).
  function hasDoubler(config) {
    return DOUBLER_MEDIA.indexOf(config.medium) !== -1;
  }

  // Where the highest output starts for a new run of the bench: a flash
  // bench's at Fire (null until then), a steady bench's at the run's start,
  // whose output is `power`.
  function peakFrom(config, power) {
    return config.pump === "flashlamp" ? null : power;
  }

  // A bench's name in the tables above: "ruby flashlamp".
  function benchName(config) {
    return config.medium + " " + config.pump;
  }

  function newState() {
    var bench = root.LaserEngine.bench;
    var config = bench.defaultConfig();
    return {
      config: config,
      sim: bench.start(config),
      history: root.LaserUI.history.create(HISTORY_SIZE),
      cartoon: newCartoon(),
      atoms: newAtoms(),
      slowMotion: startSlowMotion(config),
      playing: !prefersLessMotion(),
      behind: false,
      // The highest output since Fire (or the start), W. A run starts with
      // one photon.
      peak: peakFrom(config, bench.derive(config).powerPerPhoton),
      flashThreshold: thresholdFlash(config),
      // The filter's transmission as the visitor last set it on each bench
      // ({ "ruby flashlamp": 0.3 }), so the filter turned off and on again,
      // or a visit to another laser and back, keeps it.
      filterT0: {},
      // The doubling crystal (stage 13b) in the beam, on a bench that has
      // one: kept across benches that have it and a language switch.
      doubler: false,
      // True while the output mirror's or the filter's slider is dragged:
      // the threshold flash is then the old one, and is found again when
      // it is let go.
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
    // Fire, found first: showLamp and showUnderBench, which any later
    // part of the build may call, read it.
    var fireButton = find('[data-laser-action="fire"]');

    // A listener this build adds, and the way to remove it at teardown.
    function listen(element, type, handler) {
      element.addEventListener(type, handler);
      unhook.push(function () { element.removeEventListener(type, handler); });
    }

    // The still numbers and the sliders' ranges of a config, and what the
    // drawing shows of its mirrors.
    // The cavity is traced again only when its own fields or the rod's
    // thermal lens change: a coupler or filter move keeps it, and so does a
    // pump move on a bench without a lens (stage 10b review, stage 13c).
    function numbersOf(config) {
      var d = bench.derive(config);
      var sameCavity = cavity !== null && d.thermalFocus === derived.thermalFocus &&
        CAVITY_FIELDS.every(function (field) {
          return config[field] === state.config[field];
        });
      return {
        derived: d, controls: bench.controls(config), cavity: sameCavity ? cavity : cavityOf(config, d),
        // Whether the bench shows its thermal lens's row: a bench's answer,
        // so asked once per config, not per readout.
        hasLens: bench.hasThermalLens({ medium: config.medium, pump: config.pump }),
        // The wavelength changes only with the medium (stage 10c1 review:
        // media.get copies the whole medium, on every slider move).
        lam: lam !== null && config.medium === state.config.medium ? lam : engine.media.get(config.medium).lam
      };
    }
    // How curved a mirror is, for the drawing: 0 at the largest radius its
    // slider allows, 1 at the smallest (on the slider's log scale); null for
    // a flat mirror.
    function curveOf(config, name) {
      var range = bench.controls(config)[name];
      if (!range) return null;
      var share = Math.log(range.max / config[name]) / Math.log(range.max / range.min);
      return Math.min(1, Math.max(0, share));
    }
    // The mirrors for the bench drawing (draw-bench.js's light.cavity): the
    // cavity's length and aperture, each mirror's shape and focal point,
    // the mode's width along the cavity and a few traced rays.
    function cavityOf(config, d) {
      var r = d.resonator;
      var half = r.w1 === null ? config.aperture / 2 : Math.min(r.w1, 0.9 * config.aperture);
      var starts = RAY_STARTS.map(function (share) { return share * half; });
      var path = bench.beamPath({ config: config, starts: starts, roundTrips: RAY_ROUND_TRIPS, points: MODE_PIECES });
      return {
        length: config.L,
        aperture: config.aperture,
        shapes: { back: config.mirror1, output: config.mirror2 },
        curve: { back: curveOf(config, "Rc1"), output: curveOf(config, "Rc2") },
        focus: { back: r.focus1, output: r.focus2 },
        mode: path.mode,
        rays: path.rays.map(function (ray, i) {
          return { y0: starts[i], hits: ray.hits, escaped: ray.escaped };
        })
      };
    }
    var cavity = null;          // cavityOf(state.config, derived)
    var lam = null;             // the laser's wavelength (m), for the beam's colour (stage 10c)
    var hasLens = false;        // bench.hasThermalLens of state.config (stage 13c)
    // A new config and its numbers, taken together. Whatever can fail (a
    // config the engine refuses, a threshold search) is worked out before,
    // so a failure leaves the old bench as it was.
    function take(config, numbers) {
      state.config = config;
      derived = numbers.derived;
      controls = numbers.controls;
      cavity = numbers.cavity;
      lam = numbers.lam;
      hasLens = numbers.hasLens;
    }
    take(state.config, numbersOf(state.config));

    /* the words */
    var labels = wordsAt(data, "bench.parts", UI.bench.PARTS);
    // The name under the pump is the chosen pump's (bench.pumps.<kind>; the
    // drawing's own word if it has none). The other names, the filter's
    // (parts.qSwitch) among them, are the same for every bench.
    var anyPump = labels.pump;
    function nameThePump() {
      labels.pump = word(data, "bench.pumps." + state.config.pump) || anyPump;
    }
    nameThePump();
    var powerWords = wordsAt(data, "power.words", POWER_WORDS);
    var stabilityWords = wordsAt(data, "stability.words", UI.stability.WORDS);
    var photonWords = wordsAt(data, "photons.words", UI.photons.WORDS);
    var atomWords = wordsAt(data, "atoms.words", UI.atoms.WORDS);
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
    // The highest output in the last frame's runs (W): the drawn green
    // flashes with a pulse shorter than a frame. It counts only while the
    // loop runs (each frame works it out again before it draws): a paused
    // redraw, after Reset or a new bench too, shows the light at this
    // moment, as the readouts do.
    var framePeak = null;
    // Whether the doubling crystal is in the beam now (stage 13b).
    function doublingNow() {
      return state.doubler && hasDoubler(state.config);
    }
    // The green light now: the KDP crystal's share of the output and its
    // power (harmonic.doubling, the beam spread over the bench's area).
    function greenNow() {
      return greenAt(powerNow());
    }
    function greenAt(power) {
      return engine.harmonic.doubling({
        power: power, area: state.config.area, length: engine.harmonic.KDP.length, lam: lam
      });
    }
    // The crystal for the bench drawing: the share of the light now, and
    // the green light's strength (in the beam's unit) at the frame's
    // highest output, so a short pulse's green shows; null when off.
    function doublerLight() {
      if (!doublingNow()) return null;
      var fresh = framePeak !== null && state.playing;
      var top = fresh ? Math.max(framePeak, powerNow()) : powerNow();
      return { share: greenNow().share, green: greenAt(top).power / derived.powerAtTwiceThreshold };
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
    // An engine answer about this moment, kept until the simulation moves
    // on or the bench changes (both are new objects then): each is a whole
    // derive, and the pictures ask several times a frame.
    function keptForMoment(ask) {
      var kept = { sim: null, derived: null, answer: null };
      return function () {
        if (kept.sim !== state.sim || kept.derived !== derived) {
          kept = { sim: state.sim, derived: derived, answer: ask() };
        }
        return kept.answer;
      };
    }
    // The pump at this moment: { x, w, smallSignal, overThreshold } (a
    // flash rises and falls).
    var pumpNow = keptForMoment(function () {
      return bench.pumpNow({ sim: state.sim, config: state.config });
    });
    // The Q-switch at this moment, { loss, open } (bench.switchNow),
    // or null without one.
    var switchKept = keptForMoment(function () {
      return bench.switchNow({ sim: state.sim, config: state.config });
    });
    function switchNow() {
      if (state.config.qSwitch === "none") return null;
      return switchKept();
    }
    // The pump's strength for the pictures: x, in units of threshold.
    function pumpLevel() {
      return pumpNow().x;
    }
    // How strongly the pump glows on the bench and in the cartoon, 0 to 1.
    function glowNow() {
      return Math.min(1, pumpLevel() / PUMP_FULL);
    }
    // How strongly the pump is drawn on the bench: as it glows, except a
    // discharge, whose tube glows and whose wires carry their arrows by the
    // current, its share of the slider's top. Its gain, and so its glow,
    // falls back to 0 at the top of the "optimum" law (He-Ne, CO₂), where
    // the most current flows.
    function benchPumpNow() {
      if (state.config.pump === "discharge") return state.config.current / controls.pump.max;
      return glowNow();
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
    // a new cartoon and no flash. A flash bench's highest output starts at
    // Fire; a steady bench's now.
    function restart() {
      state.sim = bench.start(state.config);
      state.history.clear();
      state.cartoon = newCartoon();       // no atoms or light left from the old run
      state.atoms = newAtoms();
      state.peak = peakFrom(state.config, powerNow());
      remember();
    }

    /* readouts */
    function setText(selector, text) {
      var element = find(selector);
      if (element) element.textContent = text;
    }
    function without(rows, hidden) {
      return rows.filter(function (name) { return hidden.indexOf(name) === -1; });
    }
    // The readouts this bench shows.
    function rowsShown() {
      var rows = ROWS[state.config.pump];
      if (!hasLens) {
        rows = without(rows, ["thermalLens"]);
      }
      if (doublingNow()) rows = rows.concat(["harmonic"]);
      if (derived.P_out === null) {
        rows = without(rows, PULSING_HIDES);
        if (rows.indexOf("peak") === -1) rows = rows.concat(["peak"]);
      }
      if (state.config.qSwitch === "none") return rows;
      return rows.concat(SWITCH_ROWS);
    }
    function showRows() {
      var rows = rowsShown();
      READOUTS.forEach(function (name) {
        var row = find('[data-laser-row="' + name + '"]');
        if (row) row.hidden = rows.indexOf(name) === -1;
      });
      // Since the flash, or since the start on a steady bench.
      var peakWord = state.config.pump === "flashlamp" ? "readouts.peak" : "readouts.peakStart";
      setText('[data-laser-name="peak"]', word(data, peakWord));
    }
    // §4.3's giant pulse if the filter bleached now, as "6.64 J · 522 MW · 12.7 ns";
    // "—" when the engine predicts none (below 1 % over threshold, where
    // §4.3's pulse is nothing and lasts for ever).
    function giantText() {
      var pulse = bench.giantPulse({ sim: state.sim, config: state.config });
      if (pulse === null) return "—";
      return F.si(pulse.energy, "J") + " · " + F.si(pulse.peakPower, "W") + " · " + F.si(pulse.width, "s");
    }
    // A threshold the pump slider cannot reach (none, or past its top:
    // the diodes behind a dark filter, 69.8 W on a 20 W slider) is never.
    function thresholdText(value, unit) {
      if (value === null || value > controls.pump.max) return never;
      return F.si(value, unit);
    }
    function readoutText(name) {
      var d = derived;
      if (name === "pumpThreshold") return thresholdText(d.pumpThreshold, "W");
      if (name === "currentThreshold") return thresholdText(d.currentThreshold, "A");
      if (name === "flashThreshold") {
        if (state.flashThresholdOld) return "…";       // found when the slider is let go
        return thresholdText(state.flashThreshold, "J");
      }
      if (name === "x") {
        // Over the pump that starts the laser (behind a filter, its closed
        // loss's).
        var over = pumpNow().overThreshold;
        return over === null ? never : F.number(over);
      }
      if (name === "gth") return F.number(d.gth) + NO_BREAK + "m⁻¹";
      if (name === "tau_c") return F.si(d.tau_c, "s");
      if (name === "stability") return word(data, "readouts." + stabilityOf(d.resonator)) || "—";
      if (name === "waist") {
        var narrowest = narrowestOf(d.resonator, state.config.L);
        return narrowest === null ? "—" : F.si(narrowest, "m");
      }
      if (name === "mirrorLoss") return lossText(d.resonator.loss);
      // No lens with the pump off.
      if (name === "thermalLens") return d.thermalFocus === null ? "—" : F.si(d.thermalFocus, "m");
      if (name === "lossNow") {
        var now = switchNow();
        return now === null ? "—" : F.number(now.loss) + NO_BREAK + "×";
      }
      if (name === "giant") return giantText();
      if (name === "P_out") return F.si(d.P_out, "W");
      if (name === "peak") return state.peak === null ? "—" : F.si(state.peak, "W");
      // 0 when the gain cannot beat the internal loss: no mirror is best.
      if (name === "T_best") return d.T_best === null || d.T_best <= 0 ? "—" : F.number(100 * d.T_best) + NO_BREAK + "%";
      if (name === "period") return d.period === null ? "—" : F.si(d.period, "s");
      if (name === "powerNow") return F.si(powerNow(), "W");
      if (name === "harmonic") return doublingNow() ? F.si(greenNow().power, "W") : "—";
      return F.si(state.sim.t, "s");                       // "time"
    }
    // The mirror pair in words: "stable", "unstable", or "edge" right on
    // the edge of the stable region (m = ±1: two flat mirrors, a
    // concentric pair).
    // Both edges (g₁g₂ = 1, and g₁ or g₂ = 0) are |m| = 1. Reached with a
    // slider on a rod bench, m is 1 only to the rounding of L* = L − l + l/n
    // (stage 10b review), so "on the edge" holds within EDGE_TOLERANCE.
    function stabilityOf(r) {
      if (Math.abs(Math.abs(r.m) - 1) <= EDGE_TOLERANCE) return "edge";
      return r.stable ? "stable" : "unstable";
    }
    // The beam's narrowest radius between the mirrors: the waist w₀ when it
    // lies between them, else the smaller of the beam's radii on the two
    // mirrors (a convex mirror can put the waist behind a mirror, where
    // the beam is narrower than anywhere inside; stage 10b review). null
    // without a Gaussian mode.
    function narrowestOf(r, L) {
      if (r.w0 === null) return null;
      if (r.waistAt >= 0 && r.waistAt <= L) return r.w0;
      return Math.min(r.w1, r.w2);
    }
    // A share of the light as a percentage; under 0.01 % as "< 0.01 %"
    // (the stable pairs lose 10⁻²⁰ and less).
    function lossText(share) {
      if (share < 1e-4) return "<" + NO_BREAK + "0.01" + NO_BREAK + "%";
      return F.number(100 * share) + NO_BREAK + "%";
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
      showLamp();
      sinceReadout = 0;
    }
    // Fire asks to be pressed (data-ready="true": a ring of light swells
    // out of it, css/laser.css) while the lamp is dark: before the first
    // flash, and once a flash is past its peak and has faded below the
    // drawing's "off" (LaserUI.bench.PUMP_OFF). From Fire to the flash's
    // peak it waits, though the lamp starts dark. Written only when it
    // changes.
    function showLamp() {
      if (!fireButton) return;
      var flash = state.sim.flash;
      var ready = flash === null ||
        (state.sim.t > flash.at + flash.flashTime && benchPumpNow() < UI.bench.PUMP_OFF);
      var value = state.config.pump === "flashlamp" && ready ? "true" : "false";
      if (fireButton.getAttribute("data-ready") !== value) fireButton.setAttribute("data-ready", value);
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
      framePeak = powerNow();
      for (var i = 0; i < pieces; i++) {
        if (stepsLeft < 1) {
          behind = true;
          break;
        }
        var from = state.sim.t;
        var run = bench.advance({ sim: state.sim, config: state.config, seconds: piece, maxSteps: stepsLeft });
        state.sim = run.sim;
        stepsLeft -= run.steps;
        // A pulse shorter than a piece (a giant pulse, ~10 ns) falls between
        // two points: the run's peak, when it lies inside the run, is a
        // point too, before the run's end.
        if (run.peak.t > from && run.peak.t < state.sim.t) state.history.push(run.peak.t, run.peak.power);
        remember();
        // The highest output since Fire (or the start), at the runs' peaks.
        if (state.peak !== null) state.peak = Math.max(state.peak, run.peak.power);
        framePeak = Math.max(framePeak, run.peak.power);
        if (!run.reachedEnd) {
          behind = true;
          break;
        }
      }
      judgeFrame(dt, behind);

      // The cartoon acts the simulation out in screen time, its light as
      // bright as the beam.
      var drive = {
        excited: excitedNow(),
        light: UI.bench.rayAlpha(beamNow()),
        pump: glowNow()
      };
      state.cartoon.step(dt, drive);
      // The atom's levels act out the same numbers.
      state.atoms.step(dt, {
        medium: state.config.medium,
        excited: drive.excited,
        light: drive.light,
        pump: drive.pump
      });

      sinceReadout += dt;
      if (sinceReadout >= READOUT_EVERY) {
        sinceReadout = 0;
        showReadouts(LIVE_READOUTS);
        showLamp();
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
    // The Q-switch for the bench drawing: { kind, open }, or null.
    function switchLight() {
      var now = switchNow();
      if (now === null) return null;
      return { kind: state.config.qSwitch, open: now.open };
    }
    addCanvas("bench", UI.bench.SIZE, function (view) {
      UI.bench.draw(view, labels, {
        beam: beamNow(),
        pump: benchPumpNow(),
        transmission: 1 - state.config.refl2,
        pumpKind: state.config.pump,
        medium: state.config.medium,
        lam: lam,
        pumpLam: state.config.pumpLam,
        qSwitch: switchLight(),
        doubler: doublerLight(),
        cavity: cavity
      });
    });
    addCanvas("stability", UI.stability.SIZE, function (view) {
      var r = derived.resonator;
      UI.stability.draw(view, stabilityWords, { g1: r.g1, g2: r.g2, stable: r.stable });
    });
    addCanvas("power", UI.plots.SIZE, function (view) {
      var shownTime = WINDOW / state.slowMotion;          // simulated s on the chart
      // A line at the steady output, if there is one above 0: not for a
      // flash, a laser below threshold, or a steady pump behind a filter,
      // which pulses (P_out null).
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
    addCanvas("atoms", UI.atoms.SIZE, function (view) {
      state.atoms.use(state.config.medium);
      UI.atoms.draw(view, state.atoms, atomWords, {
        name: word(data, "media." + state.config.medium),
        medium: state.config.medium,
        lam: lam,
        pumpLam: state.config.pumpLam,
        pumpKind: state.config.pump,
        light: UI.bench.rayAlpha(beamNow()),
        pump: glowNow()
      });
    });

    /* the choice of laser */
    var toggle = find('[data-laser-action="qSwitch"]');        // the Q-switch's On/Off
    var doublerToggle = find('[data-laser-action="doubler"]'); // the doubling crystal's On/Off (stage 13b)
    var selects = {};
    CHOICES.forEach(function (name) {
      selects[name] = find('[data-laser-choose="' + name + '"]');
    });

    // Makes a dropdown's options again: [{ value, text, disabled }], or
    // groups of them, [{ group, options }], each an <optgroup>. The names
    // are set as text, never as markup.
    function addOptions(parent, options) {
      options.forEach(function (item) {
        var option = root.document.createElement("option");
        option.value = item.value;
        option.textContent = item.text;
        option.disabled = item.disabled;
        parent.appendChild(option);
      });
    }
    function fill(select, options) {
      while (select.firstChild) select.removeChild(select.firstChild);
      addOptions(select, options);
    }
    function fillGroups(select, groups) {
      while (select.firstChild) select.removeChild(select.firstChild);
      groups.forEach(function (item) {
        var group = root.document.createElement("optgroup");
        group.setAttribute("label", item.group);
        addOptions(group, item.options);
        select.appendChild(group);
      });
    }
    // A "Learn more" link that follows the choice: the book's section for
    // the chosen medium or pump (more.media.*, more.pumps.* in
    // data/laser.json), hidden when there is none.
    function pointMore(name, id) {
      var link = find('[data-laser-more="' + name + '"]');
      if (!link) return;
      var known = typeof id === "string" && /^section-[a-z0-9-]+$/.test(id);
      link.hidden = !known;
      if (!known) return;
      link.setAttribute("href", "?view=laser-study&id=" + id);
      link.setAttribute("data-id", id);
    }
    // The dropdowns, for the bench chosen. A missing name falls back to
    // the engine's id, so no option is ever blank.
    function showChoices() {
      if (selects.medium) {
        var later = word(data, "choose.later");
        var known = engine.media.list();
        fillGroups(selects.medium, MEDIA_GROUPS.map(function (group) {
          return {
            group: word(data, "choose.groups." + group.name) || group.name,
            options: group.media.filter(function (id) { return known.indexOf(id) !== -1; }).map(function (id) {
              var notYet = bench.pumpsFor(id).length === 0;
              var name = word(data, "media." + id) || id;
              return { value: id, text: notYet && later ? name + " (" + later + ")" : name, disabled: notYet };
            })
          };
        }));
        selects.medium.value = state.config.medium;
      }
      var more = (data && data.more) || {};
      pointMore("medium", (more.media || {})[state.config.medium]);
      pointMore("pump", (more.pumps || {})[state.config.pump]);
      if (selects.pump) {
        fill(selects.pump, bench.pumpsFor(state.config.medium).map(function (kind) {
          return { value: kind, text: word(data, "pumps." + kind) || kind, disabled: false };
        }));
        selects.pump.value = state.config.pump;
      }
    }
    // The row under the drawing: Fire only for a flashlamp, the filter's
    // On/Off only for a bench that can have it, the row only with either.
    function showUnderBench() {
      var flash = state.config.pump === "flashlamp";
      var filter = hasFilter(state.config);
      var on = state.config.qSwitch !== "none";
      if (fireButton) fireButton.hidden = !flash;
      var switchGroup = find("[data-laser-switch]");
      if (switchGroup) switchGroup.hidden = !filter;
      if (toggle) toggle.setAttribute("aria-checked", on ? "true" : "false");
      setText('[data-laser-name="qSwitchState"]', word(data, on ? "choose.on" : "choose.off"));
      var doublerGroup = find("[data-laser-doubler]");
      if (doublerGroup) doublerGroup.hidden = !hasDoubler(state.config);
      var doubled = doublingNow();
      if (doublerToggle) doublerToggle.setAttribute("aria-checked", doubled ? "true" : "false");
      setText('[data-laser-name="doublerState"]', word(data, doubled ? "choose.on" : "choose.off"));
    }
    // A new config is taken in two steps: its numbers (and anything that
    // can fail) first, then the config. showBench then shows it: the
    // threshold flash found for it, every control and every readout.
    function showBench(threshold) {
      state.flashThreshold = threshold;
      state.flashThresholdOld = false;
      showUnderBench();
      showMirrors();
      CONTROLS.forEach(function (name) { if (shows[name]) shows[name](); });
      showRows();
      setBehind(false);
      showAll();
      loop.redraw();
    }
    // A config to run from the start, at its bench's own slow motion: a
    // new simulation, chart, cartoon and highest output.
    function startBench(config) {
      var numbers = numbersOf(config);
      var threshold = thresholdFlash(config);
      take(config, numbers);
      state.slowMotion = startSlowMotion(config);
      nameThePump();
      restart();
      showChoices();
      showBench(threshold);
    }
    // The config with the filter on, at the transmission the visitor last
    // set on this bench (the bench's own at first).
    function withFilter(config) {
      var filtered = bench.withQSwitch({ config: config, qSwitch: FILTER });
      var kept = state.filterT0[benchName(config)];
      if (kept !== undefined) filtered.absorberT0 = kept;
      return filtered;
    }
    // A new bench: the engine's setup of that medium and pump. The filter
    // stays on if the new bench can have it; else it is off.
    function chooseBench(medium, pump) {
      var config = bench.configFor({ medium: medium, pump: pump });
      if (state.config.qSwitch === FILTER && hasFilter(config)) config = withFilter(config);
      startBench(config);
    }
    // The same bench with the filter on (FILTER) or off ("none"), going on
    // from where it is (bench.carryOver): the atoms, the photons, the
    // flash, the chart, the cartoon, the highest output and the slow motion
    // are kept. A filter turned on is dark.
    function turnSwitch(qSwitch) {
      if (qSwitch === state.config.qSwitch) return;
      var config = qSwitch === FILTER ? withFilter(state.config) : bench.withQSwitch({ config: state.config, qSwitch: qSwitch });
      var numbers = numbersOf(config);
      var threshold = thresholdFlash(config);
      var sim = bench.carryOver({ sim: state.sim, config: config });
      take(config, numbers);
      state.sim = sim;
      showBench(threshold);
    }
    function connectChoices() {
      if (selects.medium) {
        listen(selects.medium, "change", function () {
          var medium = selects.medium.value;
          var pumps = offered(medium) && engine.media.list().indexOf(medium) !== -1 ? bench.pumpsFor(medium) : [];
          if (pumps.length === 0) {
            // Not a medium the bench runs or the page offers (a disabled option some browsers
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
      // The filter, on and off.
      if (toggle) {
        listen(toggle, "click", function () {
          if (!hasFilter(state.config)) return;           // a hidden switch: a stray click
          turnSwitch(state.config.qSwitch === "none" ? FILTER : "none");
        });
      }
      // The doubling crystal, in and out of the beam: the laser runs on.
      if (doublerToggle) {
        listen(doublerToggle, "click", function () {
          if (!hasDoubler(state.config)) return;         // a hidden switch: a stray click
          state.doubler = !state.doubler;
          showUnderBench();
          showRows();
          showAll();
          loop.redraw();
        });
      }
    }

    /* the mirrors' shapes (stage 10b) */
    function shapeButton(mirror, shape) {
      return find('[data-laser-mirror="' + mirror + '"] [data-laser-shape="' + shape + '"]');
    }
    // Lights the chosen shape of each mirror.
    function showMirrors() {
      MIRRORS.forEach(function (mirror) {
        SHAPES.forEach(function (shape) {
          var button = shapeButton(mirror, shape);
          if (button) button.setAttribute("aria-pressed", state.config[mirror] === shape ? "true" : "false");
        });
      });
    }
    // A mirror bent to `shape`: the run goes on (as when a slider moves),
    // with the new mirrors' numbers, rays and threshold flash; a curved
    // mirror's radius slider shows at the radius it kept.
    function bendMirror(mirror, shape) {
      if (state.config[mirror] === shape) return;
      var config = Object.assign({}, state.config);
      config[mirror] = shape;
      var numbers = numbersOf(config);
      var threshold = thresholdFlash(config);
      take(config, numbers);
      showBench(threshold);
    }
    function connectMirrors() {
      MIRRORS.forEach(function (mirror) {
        SHAPES.forEach(function (shape) {
          var button = shapeButton(mirror, shape);
          if (button) listen(button, "click", function () { bendMirror(mirror, shape); });
        });
      });
    }

    /* the sliders and their number boxes */
    // A slider's range: the engine's for the bench, null for the filter's
    // while the filter is off.
    function rangeOf(name) {
      if (name === "slowMotion") return SLOW_MOTION;
      return controls[name];
    }
    function valueOf(name) {
      if (name === "pump") return state.config[controls.pump.name];
      if (name === "coupler") return 1 - state.config.refl2;
      if (name === "slowMotion") return state.slowMotion;
      return state.config[name];                       // the filter's transmission, a radius
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
      if (name === "absorberT0") return { unit: "%", factor: 100 };
      if (name === "Rc1" || name === "Rc2") return { unit: "m", factor: 1 };
      if (pumpUnit() === "A" && controls.pump.max < 1) return { unit: "mA", factor: 1000 };
      return { unit: pumpUnit(), factor: 1 };
    }
    // A value as a sentence: for screen readers on the slider, and under
    // the slow-motion slider.
    function valueText(name, value) {
      if (name === "pump") return F.si(value, pumpUnit());
      if (name === "coupler" || name === "absorberT0") return F.number(100 * value) + NO_BREAK + "%";
      if (name === "Rc1" || name === "Rc2") return F.si(value, "m");
      // Slow motion: how much simulated time one second on screen shows.
      return "1" + NO_BREAK + "s = " + F.si(1 / value, "s");
    }

    function connectControls() {
      CONTROLS.forEach(function (name) {
        var slider = find('[data-laser-control="' + name + '"]');
        var box = find('[data-laser-input="' + name + '"]');

        // The filter's slider's row, hidden while the filter is off.
        var sliderRow = find('[data-laser-slider="' + name + '"]');

        // The filter's slider has no range while the filter is off: its row
        // is hidden, and a stray event on it changes nothing.
        function hidden() {
          return rangeOf(name) === null;
        }
        function whileShown(work) {
          return function () {
            if (!hidden()) work();
          };
        }

        // Writes the value everywhere it is shown, with this bench's range
        // and unit.
        function show() {
          if (sliderRow) sliderRow.hidden = hidden();
          if (hidden()) return;
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
            else if (name === "coupler") config.refl2 = 1 - value;
            else config[name] = value;                 // the filter's transmission, a radius
            var numbers = numbersOf(config);
            // The flash threshold depends on the mirrors and on the filter,
            // not on the flash's energy; while one of them is dragged it
            // waits.
            var movesThreshold = name !== "pump";
            var threshold = state.flashThreshold;
            if (movesThreshold && settled) threshold = thresholdFlash(config);
            take(config, numbers);
            state.flashThreshold = threshold;
            if (movesThreshold) state.flashThresholdOld = !settled;
            if (name === "absorberT0") state.filterT0[benchName(config)] = value;
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
          listen(slider, "input", whileShown(function () { use(sliderValue(), false); }));
          listen(slider, "change", whileShown(function () { use(sliderValue(), true); }));
        }
        if (box) {
          // "change": Enter, or leaving the box. A typed value is rounded
          // to the digits the box shows (so it shows exactly what is
          // simulated) and held inside the slider's range; text that is no
          // number, or nothing, puts the old value back.
          listen(box, "change", whileShown(function () {
            var typed = readNumber(box.value);
            if (!isFinite(typed)) {
              show();
              return;
            }
            var range = rangeOf(name);
            var rounded = round(typed, BOX_DIGITS) / shownOf(name).factor;
            use(clamp(rounded, range.min, range.max), true);
          }));
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
      connectMirrors();
      connectControls();
      connectButtons();
      connectPointer();
      showChoices();
      showMirrors();
      showUnderBench();
      showRows();
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
