/* =========================================================================
   The laser intro: a step-by-step tour of how a laser works, over the
   whole screen (the owner's story, 2026-11-24; it replaced a one-minute
   film). Eight steps: two mirrors and some light; a mirror that lets 10%
   out; a candle between the mirrors; a closer look at its waves; one atom
   on its own; the twin photon; the laser, pumped by the candle and then
   by a flash lamp; your turn. The steps are in js/laser-intro-steps.js,
   the drawing helpers in js/laser-intro-draw.js; this file is the frame.

   Each step is first watched (a short animation, its captions written
   under the picture), then played with: its sliders and buttons appear
   in the "Try it" row once the watching part is over. Next and Back move
   between steps at any time; "Watch again" starts the step again. Skip
   (top right) or Esc closes the tour. While a step is watched, the
   bottom-right button is a plain Skip that moves forward through the
   captions (a caption's reading, then its picture, then the next
   caption), and Back moves backward the same way, into the step before;
   once the step is finished it becomes the red Next. A progress bar of
   one segment per step fills as the step plays.

   It opens by itself each time the laser page (?view=laser) comes on
   screen, a reload too (the owner's wish), not for a visitor who asked
   for less motion; the page's "Watch the introduction" button
   (data-laser-intro in sections/laser.html) opens it any time. Each new
   caption rises in slowly (css/laser.css) and the film stands still
   while it is read.
   It closes if the visitor goes to another page meanwhile.

   The picture is drawn on a canvas, a 1280 x 720 board scaled to fit, in
   the lab's own look: the lab's --laser-* colours, the site's --red for
   laser light, and the physical colours of js/laser/ui/materials.js. The
   words are the "intro" block of data/laser.json, taken from the page's
   own build, so a language switch changes them too.

   The overlay (.laser-intro in css/laser.css) is made once, on the first
   opening, and added to <body>, outside the router's #app.

   The tour's one global is LaserIntro (draw, physics, steps, and here
   isOpen() and open() for the tests).
   ========================================================================= */

(function (global) {
  "use strict";

  var LaserIntro = global.LaserIntro = global.LaserIntro || {};

  var ROUTE = "laser";
  var W = 1280;          // the board's size
  var H = 720;
  var NOTES_EVERY = 0.25; // seconds between rewrites of the readouts
  // A new caption fades in over CAPTION_FADE seconds (as css/laser.css)
  // while the picture is blurred and the film stands still (the owner: the
  // reader's eye goes to the words); once it can be read, at
  // SECONDS_PER_WORD a word (about 200 words a minute), the picture comes
  // back and the film goes on. The caption stays up until the next one.
  var CAPTION_FADE = 3;
  var SECONDS_PER_WORD = 0.2;

  var data = null;       // the laser page's words, from its newest build
  var pageButton = null; // the page's "Watch the introduction" button, newest build
  var captionAge = 0;    // screen seconds the caption shown has been up
  var reading = false;   // a new caption is being read: picture blurred, film still
  var board = { scale: 1, x: 0, y: 0, width: 0, height: 0 }; // where the board sits on the canvas
  var ui = null;         // the overlay's elements, made on the first opening
  var colors = null;     // the colours, read when the tour opens
  var g = null;          // the canvas's 2D context
  var frame = null;      // the requested animation frame, or null when closed
  var lastFrame = null;
  var opener = null;     // the button that opened the tour, for the focus

  var index = 0;         // the step shown
  var state = null;      // its state
  var time = 0;          // seconds since it started
  var trying = false;    // its watching part is over
  var sinceNotes = 0;
  var controls = [];     // the step's controls: { spec, input, output, button, buttons }

  /* ---------- Words ---------- */

  function word(path) {
    if (!data || !global.Content) return "";
    return global.Content.inLang(global.Content.valueAt(data, path), global.Site.lang);
  }

  // "Half gone after {n} bounces" with { n: 7 }.
  function fill(template, values) {
    if (!values) return template;
    return template.replace(/\{(\w+)\}/g, function (all, name) {
      return Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : all;
    });
  }

  function stepWord(key, values) {
    return fill(word("intro.steps." + index + "." + key), values);
  }

  /* ---------- Colours ---------- */

  function cssColour(name) {
    return global.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // The lab's colours by the names of LaserUI.loop.PALETTE (one list of
  // the --laser-* variables for the lab and the tour).
  function paletteColour(name) {
    return cssColour(global.LaserUI.loop.PALETTE[name]);
  }

  function readColours() {
    var M = global.LaserUI.materials;
    var bg = paletteColour("bg");
    var flash = paletteColour("flash");
    var lam = global.LaserEngine.media.get("ruby").lam;
    return {
      bg: bg,
      heading: paletteColour("heading"),
      text: paletteColour("text"),
      muted: paletteColour("muted"),
      line: paletteColour("line"),
      white: cssColour("--laser-faint-bg"),
      accent: paletteColour("accent"),
      glow: paletteColour("glow"),
      flash: flash,
      flashLine: M.readable(flash, bg),
      lamp: paletteColour("lamp"),
      // laser light is always the site's red (ruby's 694 nm)
      beam: cssColour("--red") || M.readable(M.beam(lam).color, bg),
      // ordinary light (a candle's, a lamp's) is amber
      amber: M.readable(M.AMBER, bg),
      amberRaw: M.AMBER,
      wax: M.CANDLE.wax,
      wick: M.CANDLE.wick,
      flameCore: M.CANDLE.core,
      flameEdge: M.CANDLE.edge,
      flameBase: M.CANDLE.base,
      lensGlass: M.LENS_GLASS,
      ruby: M.MEDIA.ruby.body,
      mirrorGlass: M.MIRROR_GLASS,
      mirrorEdge: M.readable(M.MIRROR_GLASS, bg),
      silver: M.readable(M.SILVER, bg),
      highlight: M.HIGHLIGHT,
      shade: M.SHADE,
      font: cssColour("--font-site") || cssColour("--font-main") || "sans-serif"
    };
  }

  /* ---------- The step being shown ---------- */

  function step() {
    return LaserIntro.steps[index];
  }

  var lessMotion = null;   // the media query, asked for once
  function asksForLessMotion() {
    if (!global.matchMedia) return false;
    if (!lessMotion) lessMotion = global.matchMedia("(prefers-reduced-motion: reduce)");
    return !!lessMotion.matches;
  }

  function env() {
    return {
      t: time,
      trying: trying,
      random: LaserIntro.random || Math.random,
      still: asksForLessMotion(),
      w: stepWord,
      page: word
    };
  }

  function startStep(i) {
    index = i;
    time = 0;
    trying = false;
    sinceNotes = 0;
    state = step().start(env());
    // so the first caption counts as new (Watch again of a one-caption step)
    ui.caption.setAttribute("data-text", " ");
    setReading(false);
    buildControls();
    writeWords();
    ui.tryRow.hidden = true;
    ui.box.setAttribute("data-trying", "false");
    if (ui.canvas.width) resize();
  }

  /* ---------- The overlay ---------- */

  var SKIP_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
    '<path d="M4 5l8 7-8 7z M12 5l8 7-8 7z" fill="currentColor"/>' +
    '<rect x="20" y="5" width="2" height="14" fill="currentColor"/></svg>';

  function make(tag, className, parent) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (parent) parent.appendChild(el);
    return el;
  }

  function button(className, parent, onClick) {
    var b = make("button", className, parent);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  }

  function makeOverlay() {
    var box = make("div", "laser-intro");
    box.hidden = true;
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-labelledby", "laser-intro-title");

    var panel = make("div", "laser-intro__panel", box);
    var top = make("div", "laser-intro__top", panel);
    var heading = make("div", "laser-intro__heading", top);
    var count = make("p", "laser-intro__count", heading);
    var title = make("h2", "laser-intro__title", heading);
    title.id = "laser-intro-title";
    var skip = button("laser-intro__skip", top, close);
    var skipWord = make("span", "", skip);
    skip.insertAdjacentHTML("beforeend", SKIP_ICON);

    // the progress: one segment per step
    var progress = make("div", "laser-intro__progress", panel);
    progress.setAttribute("aria-hidden", "true");
    var dotList = [];
    var fillList = [];
    for (var i = 0; i < LaserIntro.steps.length; i++) {
      var segment = make("span", "laser-intro__segment", progress);
      dotList.push(segment);
      fillList.push(make("span", "laser-intro__fill", segment));
    }

    // the picture fills all the room left
    var stage = make("div", "laser-intro__stage", panel);
    var canvas = make("canvas", "laser-intro__film", stage);
    canvas.setAttribute("role", "img");
    canvas.addEventListener("pointerdown", onPointer);

    var bottom = make("div", "laser-intro__bottom", panel);
    var caption = make("p", "laser-intro__caption", bottom);
    caption.setAttribute("aria-live", "polite");

    var tryRow = make("div", "laser-intro__try", bottom);
    var tryHead = make("p", "laser-intro__hint", tryRow);
    var badge = make("span", "laser-intro__badge", tryHead);
    var hint = make("span", "", tryHead);
    var controlBox = make("div", "laser-intro__controls", tryRow);
    var notes = make("div", "laser-intro__notes", tryRow);
    notes.setAttribute("aria-live", "polite");

    var nav = make("div", "laser-intro__nav", bottom);
    var again = button("btn btn--ghost btn--sm", nav, function () { startStep(index); });
    make("span", "laser-intro__spacer", nav);
    var back = button("btn btn--ghost btn--sm", nav, goBack);
    var next = button("btn btn--primary btn--sm", nav, onNext);

    document.body.appendChild(box);
    return {
      box: box, count: count, title: title, dots: dotList, fills: fillList, skip: skip, skipWord: skipWord,
      canvas: canvas, caption: caption, tryRow: tryRow, badge: badge, hint: hint, controlBox: controlBox,
      notes: notes, again: again, back: back, next: next
    };
  }

  /* The button on the right: Skip while the step is watched, Next once
     the step is finished (the owner's wish). Skip goes forward through the
     captions as Back goes back (the owner's wish): from a caption's
     reading (the picture blurred) to its picture, sharp at once; from a
     picture to the next caption's reading; after the last caption, to the
     step's Try it part. */
  function onNext() {
    if (trying) {
      go(index + 1);
      return;
    }
    var starts = step().captions;
    var k = captionIndex();
    if (reading) {
      setReading(false);
      captionAge = readingTime(ui.caption.getAttribute("data-text"));
    } else if (k + 1 < starts.length) {
      runTo(starts[k + 1]);
      writeCaption();             // the next caption: its reading starts
    } else {
      time = Math.max(time, step().watch);
      startTrying();
    }
    writeProgress();
    draw();
    // the focus stays here, or goes to Back on the last step (no Next)
    var keep = ui.next.hidden ? ui.back : ui.next;
    if (keep.focus) keep.focus();
  }

  function writeNext() {
    var last = index === LaserIntro.steps.length - 1;
    ui.next.className = "btn btn--sm " + (trying ? "btn--primary" : "btn--ghost");
    ui.next.textContent = word(trying ? "intro.next" : "intro.skipStep");
    ui.next.hidden = trying && last;
  }

  /* Back goes back through the step's captions, not straight to the step
     before (the owner's wish). Each caption has two parts: its reading
     (the picture blurred) and then its picture. Back from a reading goes
     to the caption before, its picture already sharp (where its reading
     ended); Back from a picture goes to the start of its own reading.
     Before the first caption, Back goes to the last caption of the step
     before, its picture sharp. */
  function goBack() {
    var k = captionIndex();
    if (trying) {
      seek(index, step().captions.length - 1, true);
    } else if (reading && k > 0) {
      seek(index, k - 1, false);
    } else if (!reading && k >= 0) {
      seek(index, k, true);
    } else if (index > 0) {
      seek(index - 1, LaserIntro.steps[index - 1].captions.length - 1, false);
    } else {
      startStep(0);
    }
    if (ui.back.focus) ui.back.focus();
  }

  // Shows step i at its caption k: the step started again and run forward
  // (without drawing) to where that caption begins; then either its
  // reading, or its picture with the caption already read.
  function seek(i, k, blurred) {
    startStep(i);
    runTo(k >= 0 ? step().captions[k] : 0);
    writeCaption();
    if (!blurred) {
      setReading(false);
      captionAge = readingTime(ui.caption.getAttribute("data-text"));
    }
    writeProgress();
    draw();
  }

  // Runs the step forward (without drawing) to the film time `target`.
  function runTo(target) {
    var STEP = 1 / 30;
    while (time < target) {
      var dt = Math.min(STEP, target - time);
      time += dt;
      step().update(state, dt, env());
    }
    time = Math.max(time, target);
  }

  function go(i) {
    if (i < 0 || i >= LaserIntro.steps.length) return;
    startStep(i);
    // the focus stays on Next, or on Back on the last step (Next is hidden)
    var keep = ui.next.hidden ? ui.back : ui.next;
    if (keep.focus) keep.focus();
  }

  // The canvas fills the room it has (sharp on any screen); the part of
  // the board the step uses is as large as fits in it, centred, and the
  // rest is the same background, so the picture reaches the edges.
  function resize() {
    var canvas = ui.canvas;
    var ratio = Math.min(global.devicePixelRatio || 1, 2);
    var width = canvas.clientWidth;
    var height = canvas.clientHeight || Math.round(width * H / W);
    if (!width || !height) return;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    // the step's own part of the board (its `view`: the heights it uses)
    var view = (index !== null && LaserIntro.steps[index].view) || [0, H];
    var tall = view[1] - view[0];
    var scale = Math.min(canvas.width / W, canvas.height / tall);
    board = {
      scale: scale,
      x: (canvas.width - W * scale) / 2,
      y: (canvas.height - tall * scale) / 2 - view[0] * scale,
      width: width,
      height: height
    };
    draw();
  }

  // The room changed (the controls came in, the window turned).
  function resizeIfNeeded() {
    var canvas = ui.canvas;
    if (canvas.clientWidth !== board.width || (canvas.clientHeight || board.height) !== board.height) resize();
  }

  /* ---------- The controls of a step ---------- */

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function buildControls() {
    clear(ui.controlBox);
    controls = [];
    var specs = step().controls || [];
    for (var i = 0; i < specs.length; i++) controls.push(buildControl(specs[i], i));
  }

  function buildControl(spec, i) {
    var item = { spec: spec };
    var box = make("div", "laser-intro__control laser-intro__control--" + (spec.close ? "open" : spec.type), ui.controlBox);
    if (spec.type === "slider") {
      var id = "laser-intro-" + index + "-" + spec.name;
      item.label = make("label", "laser-intro__label", box);
      item.label.setAttribute("for", id);
      item.input = make("input", "laser-intro__range", box);
      item.input.type = "range";
      item.input.id = id;
      item.input.setAttribute("min", spec.min);
      item.input.setAttribute("max", spec.max);
      item.input.setAttribute("step", spec.step);
      item.input.value = String(step().value(state, spec.name));
      item.output = make("output", "laser-intro__value", box);
      item.output.setAttribute("for", id);
      item.input.addEventListener("input", function () {
        step().set(state, spec.name, Number(item.input.value), env());
        refresh();
      });
    } else if (spec.type === "button") {
      item.button = button(spec.close ? "btn btn--primary laser-intro__open" : "btn btn--ghost btn--sm", box, function () {
        if (spec.close) {
          close();
          return;
        }
        step().press(state, spec.name, env());
        refresh();
        draw();
      });
    } else if (spec.type === "choice") {
      item.label = make("span", "laser-intro__label", box);
      item.group = make("div", "laser-intro__choice", box);
      item.group.setAttribute("role", "group");
      item.buttons = [];
      spec.options.forEach(function (option) {
        var b = button("btn btn--ghost btn--sm", item.group, function () {
          step().set(state, spec.name, option, env());
          refresh();
        });
        b.setAttribute("data-option", option);
        item.buttons.push(b);
      });
    }
    return item;
  }

  // Every word of the step and its controls (a new step, a language switch).
  function writeWords() {
    var label = word("intro.label");
    ui.box.setAttribute("aria-label", label);
    ui.skipWord.textContent = word("intro.skip");
    ui.count.textContent = fill(word("intro.stepOf"), { n: index + 1, total: LaserIntro.steps.length });
    ui.title.textContent = stepWord("title");
    ui.canvas.setAttribute("aria-label", stepWord("title"));
    ui.badge.textContent = word("intro.tryIt");
    ui.hint.textContent = stepWord("hint");
    ui.again.textContent = word("intro.watchAgain");
    ui.back.textContent = word("intro.back");
    writeNext();
    for (var i = 0; i < ui.dots.length; i++) {
      ui.dots[i].className = "laser-intro__segment" + (i === index ? " is-current" : i < index ? " is-done" : "");
    }
    writeProgress();
    for (var c = 0; c < controls.length; c++) {
      var item = controls[c];
      if (item.label) item.label.textContent = stepWord("try." + item.spec.name);
      if (item.buttons) {
        item.group.setAttribute("aria-label", stepWord("try." + item.spec.name));
        for (var b = 0; b < item.buttons.length; b++) {
          item.buttons[b].textContent = stepWord("try." + item.spec.options[b]);
        }
      }
    }
    writeCaption();
    refresh();
  }

  // The caption for the moment shown (the last one once the step is
  // played with; none before the first starts). A new caption fades in as
  // a whole, softly (css/laser.css .laser-intro__line); **words** are its
  // key words.
  function captionIndex() {
    var starts = step().captions;
    var shown = -1;
    for (var i = 0; i < starts.length; i++) {
      if (time >= starts[i] || trying) shown = i;
    }
    return shown;
  }

  function writeCaption() {
    var shown = captionIndex();
    var words = shown < 0 ? "" : stepWord("captions." + shown);
    if (ui.caption.getAttribute("data-text") === words) return;
    ui.caption.setAttribute("data-text", words);
    captionAge = 0;
    clear(ui.caption);
    // a new caption while watching: the picture blurs while it is read
    setReading(!!words && !trying);
    if (!words) return;
    var lineEl = make("span", "laser-intro__line", ui.caption);
    var parts = words.split("**");
    for (var p = 0; p < parts.length; p++) {
      if (!parts[p]) continue;
      make(p % 2 === 1 ? "strong" : "span", "", lineEl).textContent = parts[p];
    }
  }

  // How long (screen seconds) the picture stays blurred for a new
  // caption: its fade, then time to read it at an easy pace.
  function readingTime(words) {
    var count = words ? words.split(/\s+/).length : 0;
    // with less motion the caption is there at once (css/laser.css)
    var fade = asksForLessMotion() ? 0 : CAPTION_FADE;
    return fade + count * SECONDS_PER_WORD;
  }

  // Blurs the picture while a caption is being read (css/laser.css).
  function setReading(on) {
    reading = on;
    ui.box.setAttribute("data-reading", on ? "true" : "false");
  }

  // The progress bar: the steps done full, the current one as far as its
  // watching part has played (full once it is finished), the rest empty.
  // Written every frame, so it moves smoothly (css/laser.css scales the
  // fill by --p).
  function writeProgress() {
    for (var i = 0; i < ui.fills.length; i++) {
      var share = 0;
      if (i < index) share = 1;
      else if (i === index) share = trying ? 1 : Math.min(1, time / step().watch);
      var text = share.toFixed(3);
      if (ui.fills[i].getAttribute("data-p") === text) continue;
      ui.fills[i].setAttribute("data-p", text);
      ui.fills[i].style.setProperty("--p", text);
    }
  }

  // The watching part is over (or skipped): the step's Try it part.
  function startTrying() {
    if (trying) return;
    trying = true;
    setReading(false);
    if (step().toTry) step().toTry(state);
    ui.tryRow.hidden = false;
    ui.box.setAttribute("data-trying", "true");
    writeNext();
    writeProgress();
    writeCaption();
    refresh();
  }

  // The controls' values and words, and the readouts.
  function refresh() {
    var s = step();
    var e = env();
    for (var i = 0; i < controls.length; i++) {
      var item = controls[i];
      var name = item.spec.name;
      if (item.input) {
        var value = s.value(state, name);
        if (Number(item.input.value) !== value) item.input.value = String(value);
        var text = s.valueText ? s.valueText(state, name, e) : "";
        item.output.textContent = text;
        item.input.setAttribute("aria-valuetext", text);
      }
      if (item.button) {
        var key = s.buttonWord ? s.buttonWord(state, name) : "try." + name;
        item.button.textContent = stepWord(key);
      }
      if (item.buttons) {
        for (var b = 0; b < item.buttons.length; b++) {
          item.buttons[b].setAttribute("aria-pressed", s.pressed(state, name, item.spec.options[b]) ? "true" : "false");
        }
      }
    }
    var lines = s.notes ? s.notes(state, e) : [];
    var joined = lines.join("\n");
    if (ui.notes.getAttribute("data-text") !== joined) {
      ui.notes.setAttribute("data-text", joined);
      clear(ui.notes);
      for (var n = 0; n < lines.length; n++) make("p", "laser-intro__note", ui.notes).textContent = lines[n];
    }
  }

  /* ---------- Drawing and time ---------- */

  function draw() {
    if (!g || !ui.canvas.width) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = colors.bg;
    g.fillRect(0, 0, ui.canvas.width, ui.canvas.height);
    g.setTransform(board.scale, 0, 0, board.scale, board.x, board.y);
    LaserIntro.draw.use(g, colors);
    step().draw(state, env());
  }

  // An error in a step closes the tour (thrown once, not 60 times a
  // second), so the button can open it again.
  function tick(now) {
    try {
      frameOf(now);
    } catch (error) {
      frame = null;
      close();
      throw error;
    }
    frame = global.requestAnimationFrame(tick);
  }

  function frameOf(now) {
    var dt = lastFrame === null ? 0 : Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;
    captionAge += dt;
    if (reading && captionAge >= readingTime(ui.caption.getAttribute("data-text"))) setReading(false);
    // the step stands still while a new caption is read
    if (reading) dt = 0;
    time += dt;
    resizeIfNeeded();
    if (!trying && time >= step().watch) startTrying();
    writeProgress();
    step().update(state, dt, env());
    writeCaption();
    sinceNotes += dt;
    if (trying && sinceNotes >= NOTES_EVERY) {
      sinceNotes = 0;
      refresh();
    }
    draw();
  }

  // A click on the picture (an atom of step 5), in the board's units.
  function onPointer(event) {
    var s = step();
    if (!s.pointer || !trying) return;
    var box = ui.canvas.getBoundingClientRect();
    if (!box.width || !board.scale) return;
    var pixels = ui.canvas.width / box.width;   // canvas pixels per screen pixel
    var x = ((event.clientX - box.left) * pixels - board.x) / board.scale;
    var y = ((event.clientY - box.top) * pixels - board.y) / board.scale;
    if (s.pointer(state, x, y, env())) refresh();
  }

  function onKey(event) {
    if (event.key === "Escape") close();
  }

  /* ---------- Opening and closing ---------- */

  function isOpen() {
    return frame !== null;
  }

  function open(from) {
    if (isOpen() || !data) return;
    if (!global.LaserUI || !global.LaserUI.materials || !global.LaserEngine || !LaserIntro.steps) return;
    if (!ui) {
      ui = makeOverlay();
      g = ui.canvas.getContext("2d");
    }
    opener = from || null;
    colors = readColours();
    ui.box.hidden = false;
    document.documentElement.className += " laser-intro-open";
    global.addEventListener("resize", resize);
    global.addEventListener("keydown", onKey);
    lastFrame = null;
    try {
      startStep(0);
      resize();
    } catch (error) {
      // take everything down again, so the page is not left hidden
      takeDown();
      opener = null;
      throw error;
    }
    if (ui.skip.focus) ui.skip.focus();
    frame = global.requestAnimationFrame(tick);
  }

  // Hides the overlay, shows the page again and removes the listeners.
  function takeDown() {
    ui.box.hidden = true;
    document.documentElement.className = document.documentElement.className.replace(/\s*\blaser-intro-open\b/g, "");
    global.removeEventListener("resize", resize);
    global.removeEventListener("keydown", onKey);
  }

  function close() {
    if (frame !== null) {
      global.cancelAnimationFrame(frame);
      frame = null;
    }
    if (!ui || ui.box.hidden) return;
    takeDown();
    // back to what opened it, or, when it opened by itself, to the page's
    // "Watch the introduction" button, so the keyboard is not lost
    var back = opener || pageButton;
    if (back && back.focus) back.focus();
    opener = null;
  }

  function onOpenButton(event) {
    open(event.currentTarget || null);
  }

  // The page's words, and its "Watch the introduction" button, from each
  // build (a language switch builds it again).
  global.addEventListener("section:ready", function (event) {
    var detail = event.detail || {};
    if (detail.route !== ROUTE) return;
    data = detail.data || null;
    var container = detail.container;
    var openButton = container && container.querySelector ? container.querySelector("[data-laser-intro]") : null;
    if (openButton) {
      openButton.addEventListener("click", onOpenButton);
      pageButton = openButton;
    }
    // a language switch: only the words change (the controls, and the
    // focus on one of them, stay)
    if (ui && isOpen()) writeWords();
  });

  // The tour opens by itself each time the laser page comes on screen
  // (the owner's wish, 2026-11-24: also on every reload), and closes if the
  // visitor goes to another page meanwhile.
  global.addEventListener("view:shown", function (event) {
    var detail = event.detail || {};
    if (detail.route !== ROUTE) {
      close();
      return;
    }
    if (asksForLessMotion()) return;
    open(null);
  });

  LaserIntro.isOpen = isOpen;
  LaserIntro.open = open;
  LaserIntro.close = close;
})(this);
