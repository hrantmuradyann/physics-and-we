/* ============================================================================
   loop.js — the drawing loop of the laser page (?view=laser).

   PART OF THE LASER PAGE'S DRAWING (js/laser/ui/): it puts pictures on the
   page and never does physics. It keeps the same rules js/labs.js keeps for
   the other labs (docs/laser-plan.md §1); they are copied here rather than
   shared, so the two working labs are not put at risk:

     · ONE requestAnimationFrame loop for all of the page's canvases. Each
       frame calls update(dt) once (the simulation, from build stage 6), then
       draw(view) for every canvas on screen.
     · It runs only while it is wanted (play / pause; a visitor who asked
       for less motion starts paused) AND a canvas is on screen. A page the
       visitor is not looking at must never keep a laptop fan running.
       Each canvas carries data-running: "true" while the loop runs and that
       canvas is on screen, else "false".
     · The time step dt is in seconds: 0 on the first frame after a start,
       and never more than MAX_STEP, so a tab coming back from the
       background does not hand the simulation an enormous jump.
     · An error in update or draw pauses the loop (the error is thrown once,
       not every frame).
     · Each canvas is as wide as the inside of its box (clientWidth: inside
       the border, which getBoundingClientRect would count), as high as
       width / aspect (kept between minHeight and maxHeight), and sharp on
       a retina screen.
     · The colours are the theme's CSS variables (PALETTE below), read again
       when the visitor switches theme.
     · destroy() leaves nothing behind. The router builds the page again on
       every language switch, and the old loop must not go on drawing into
       a canvas that is no longer on the page.

   USE
     var loop = LaserUI.loop.create({
       canvases: [{ canvas, box, aspect, minHeight, maxHeight, draw }],
       update: function (dt) { ... },      optional
       running: true | false               optional; default: not for a
     });                                    visitor who asked for less motion
     loop.play()  loop.pause()  loop.isRunning()
     loop.redraw()     a paused loop draws every canvas once (a control moved)
     loop.destroy()
     LaserUI.loop.liveCount()   loops created and not yet destroyed

   draw(view) gets view = { g, w, h, dpr, colors, font, t, dt }: the 2D
   context, the size in CSS pixels, the pixel ratio, the theme colours by
   PALETTE name, the site's font, the seconds the loop has run, the step.

   Tests: tests/laser/loop.test.js
   ========================================================================== */
(function (root) {
  "use strict";

  var UI = root.LaserUI = root.LaserUI || {};

  var MAX_STEP = 0.05;          // s: the biggest step a frame is ever given
  var MAX_PIXEL_RATIO = 2;      // sharper than this costs memory, not looks

  // The colours a drawing may use: name -> the CSS variable it comes from
  // (css/style.css). A test checks both themes set every one of them.
  var PALETTE = Object.freeze({
    accent: "--accent",
    accent2: "--accent-2",
    soft: "--accent-soft",
    heading: "--heading",
    text: "--text",
    muted: "--muted",
    line: "--canvas-line",
    grid: "--canvas-grid",
    faint: "--canvas-faint",
    glow: "--canvas-glow"
  });
  var FONT_VARIABLE = "--font-main";

  var live = 0;                 // loops created and not yet destroyed

  function fail(message) {
    throw new Error("LaserUI.loop.create: " + message);
  }

  // The theme's colours, read from the CSS variables on <html>.
  function readStyle() {
    var style = root.getComputedStyle(root.document.documentElement);
    function read(variable) {
      return String(style.getPropertyValue(variable) || "").trim();
    }
    var colors = {};
    Object.keys(PALETTE).forEach(function (name) {
      colors[name] = read(PALETTE[name]);
    });
    return { colors: colors, font: read(FONT_VARIABLE) || "sans-serif" };
  }

  function checkCanvas(spec, index) {
    var where = "canvases[" + index + "]";
    if (!spec || typeof spec !== "object") fail(where + " must be an object.");
    if (!spec.canvas || typeof spec.canvas.getContext !== "function") fail(where + ".canvas must be a <canvas>.");
    if (!spec.box || typeof spec.box.clientWidth !== "number") {
      fail(where + ".box must be the element whose inner width the canvas takes.");
    }
    if (typeof spec.draw !== "function") fail(where + ".draw must be a function.");
    if (!(spec.aspect > 0) || !isFinite(spec.aspect)) fail(where + ".aspect must be a positive number.");
    if (!(spec.minHeight > 0) || !(spec.maxHeight >= spec.minHeight) || !isFinite(spec.maxHeight)) {
      fail(where + ".minHeight and .maxHeight must be positive, with minHeight ≤ maxHeight.");
    }
  }

  function create(options) {
    if (!options || !Array.isArray(options.canvases) || options.canvases.length === 0) {
      fail("canvases must be a list of at least one canvas.");
    }
    options.canvases.forEach(checkCanvas);
    if (options.update !== undefined && typeof options.update !== "function") {
      fail("update must be a function, or left out.");
    }

    var update = options.update || null;
    var reduceMotion = typeof root.matchMedia === "function" &&
      root.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var wanted = options.running === undefined ? !reduceMotion : !!options.running;

    var style = readStyle();
    var frameId = null;           // the frame asked for, or null when stopped
    var lastTime = 0;             // the time of the last frame; 0 = none yet
    var seconds = 0;              // how long the loop has run
    var destroyed = false;

    var entries = options.canvases.map(function (spec) {
      return {
        canvas: spec.canvas,
        box: spec.box,
        g: spec.canvas.getContext("2d"),
        aspect: spec.aspect,
        minHeight: spec.minHeight,
        maxHeight: spec.maxHeight,
        draw: spec.draw,
        w: 0,                     // size in CSS pixels; 0 until measured
        h: 0,
        dpr: 0,
        onScreen: false
      };
    });

    /* ---------- drawing ---------- */

    function drawOne(entry, dt) {
      if (!entry.w) return;
      entry.draw({
        g: entry.g,
        w: entry.w,
        h: entry.h,
        dpr: entry.dpr,
        colors: style.colors,
        font: style.font,
        t: seconds,
        dt: dt
      });
    }

    function drawAll() {
      entries.forEach(function (entry) { drawOne(entry, 0); });
    }

    /* ---------- sizing ---------- */

    // Sizes the canvas to its box and draws it once. A box of width 0 (the
    // page is hidden) keeps the last size instead of collapsing to nothing.
    // The width is the box's inside, without its border: the canvas fills
    // only that, and a canvas 2 px wider than it is shown would be drawn
    // slightly squeezed. clientWidth is a whole number of pixels; the part
    // of a pixel it drops cannot be seen.
    function measure(entry) {
      if (destroyed) return;
      var width = entry.box.clientWidth;
      if (!width) return;
      var dpr = Math.min(root.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      // Setting the height below can resize the box, which calls this
      // again; nothing has changed unless the width or the screen did.
      if (width === entry.w && dpr === entry.dpr) return;
      var height = Math.max(entry.minHeight, Math.min(width / entry.aspect, entry.maxHeight));
      entry.w = width;
      entry.h = height;
      entry.dpr = dpr;
      entry.canvas.width = Math.round(width * dpr);
      entry.canvas.height = Math.round(height * dpr);
      entry.canvas.style.height = height + "px";
      // A new canvas size resets the context, so the scale is set after it.
      entry.g.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawOne(entry, 0);
    }

    function measureAll() {
      entries.forEach(measure);
    }

    /* ---------- the loop ---------- */

    function frame(now) {
      frameId = null;
      if (destroyed) return;
      var dt = lastTime ? (now - lastTime) / 1000 : 0;
      lastTime = now;
      if (dt > MAX_STEP) dt = MAX_STEP;
      if (dt < 0) dt = 0;
      seconds += dt;
      try {
        if (update) update(dt);
        entries.forEach(function (entry) {
          if (entry.onScreen) drawOne(entry, dt);
        });
      } catch (error) {
        // Stop, rather than throw the same error again 60 times a second.
        // The error still reaches the console once; play() tries again.
        wanted = false;
        sync();
        throw error;
      }
      // The next frame is asked for only now, so a pause() or destroy()
      // made during this one (by update or a draw) holds.
      if (frameId === null && !destroyed && wanted && anyOnScreen()) {
        frameId = root.requestAnimationFrame(frame);
      }
    }

    function anyOnScreen() {
      return entries.some(function (entry) { return entry.onScreen; });
    }

    // Starts or stops the frames to match what is wanted and what is seen.
    function sync() {
      var run = !destroyed && wanted && anyOnScreen();
      if (run && frameId === null) {
        lastTime = 0;
        frameId = root.requestAnimationFrame(frame);
      } else if (!run && frameId !== null) {
        root.cancelAnimationFrame(frameId);
        frameId = null;
      }
      // "true" only on a canvas that is being drawn frame after frame; one
      // scrolled out of view says "false" even while the loop runs for
      // another canvas.
      entries.forEach(function (entry) {
        entry.canvas.setAttribute("data-running", run && entry.onScreen ? "true" : "false");
      });
    }

    /* ---------- the theme ---------- */

    function onThemeChanged() {
      if (destroyed) return;
      style = readStyle();
      // A running loop draws with the new colours at its next frame.
      if (frameId === null) drawAll();
    }

    function onResize() {
      measureAll();
    }

    /* ---------- the first picture ---------- */

    // Drawn before anything is registered: if a draw function throws here,
    // create throws and leaves no observer or listener behind that nothing
    // could ever remove.
    measureAll();

    /* ---------- watching size and visibility ---------- */

    var sizeWatcher = null;
    if (typeof root.ResizeObserver === "function") {
      sizeWatcher = new root.ResizeObserver(function (changes) {
        changes.forEach(function (change) {
          entries.forEach(function (entry) {
            if (entry.box === change.target) measure(entry);
          });
        });
      });
      entries.forEach(function (entry) { sizeWatcher.observe(entry.box); });
    }
    root.addEventListener("resize", onResize);
    root.addEventListener("theme:changed", onThemeChanged);

    // A hidden page has no size and cannot be seen, so leaving the page or
    // scrolling past the canvases stops the loop by itself.
    var seenWatcher = null;
    if (typeof root.IntersectionObserver === "function") {
      seenWatcher = new root.IntersectionObserver(function (changes) {
        if (destroyed) return;
        changes.forEach(function (change) {
          entries.forEach(function (entry) {
            if (entry.canvas !== change.target) return;
            entry.onScreen = !!change.isIntersecting;
            if (entry.onScreen) measure(entry);
          });
        });
        sync();
      }, { threshold: 0.01 });
      entries.forEach(function (entry) { seenWatcher.observe(entry.canvas); });
    } else {
      entries.forEach(function (entry) { entry.onScreen = true; });
    }

    /* ---------- go ---------- */

    live += 1;
    sync();

    return Object.freeze({
      play: function () {
        wanted = true;
        sync();
      },
      pause: function () {
        wanted = false;
        sync();
      },
      isRunning: function () {
        return frameId !== null;
      },
      redraw: function () {
        if (!destroyed && frameId === null) drawAll();
      },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        live -= 1;
        if (frameId !== null) {
          root.cancelAnimationFrame(frameId);
          frameId = null;
        }
        if (sizeWatcher) sizeWatcher.disconnect();
        if (seenWatcher) seenWatcher.disconnect();
        root.removeEventListener("resize", onResize);
        root.removeEventListener("theme:changed", onThemeChanged);
        sync();
      }
    });
  }

  UI.loop = Object.freeze({
    create: create,
    liveCount: function () { return live; },
    PALETTE: PALETTE
  });
})(this);
