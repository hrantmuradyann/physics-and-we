/* ============================================================================
   intro.test.js — the laser intro tour (js/laser-intro.js, its steps in
   js/laser-intro-steps.js, its drawing helpers in js/laser-intro-draw.js).

   1. The numbers its words state (LaserIntro.physics): 7 and 22 bounces
      for a mirror letting 10% out, 2 ns there and back over 30 cm, twins
      in a row of atoms, the candle below the mirror's loss and the lamp
      above it.
   2. Its words: every step has its title, hint and captions in hy and en,
      and every word the steps ask for while playing exists.
   3. The tour in the fake browser: it opens once by itself, never for a
      visitor who asked for less motion, from the page's button any time;
      it walks through the eight steps; Skip, Esc and another page close
      it and take its listeners away.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, ENGINE_FILES, UI_FILES } = require("./helpers.js");
const { createBrowser, fakeElement, fakeCanvas, fakeContainer } = require("./fake-browser.js");

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "laser.json"), "utf8"));
const STEPS = 8;

/* ---------- a browser with the tour ---------- */

// The fake browser plus what the tour needs of a page: <body>, storage,
// a canvas from createElement, focus and insertAdjacentHTML.
function setup(options) {
  const opts = options || {};
  const browser = createBrowser(opts);
  const w = browser.window;
  const canvases = [];
  const plainCreate = w.document.createElement;
  w.document.createElement = function (tag) {
    let el;
    if (tag === "canvas") {
      const made = fakeCanvas(1000);
      el = made.canvas;
      Object.defineProperty(el, "clientWidth", { get() { return 1000; } });
      el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 562.5 });
      canvases.push(made);
    } else {
      el = plainCreate(tag);
    }
    el.insertAdjacentHTML = function () {};
    el.style.setProperty = function (name, value) { el.style[name] = String(value); };
    el.focus = function () { w.document.activeElement = el; };
    return el;
  };
  w.document.body = fakeElement("body");
  w.document.documentElement.className = "";
  const store = new Map();
  w.localStorage = {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); }
  };
  browser.load("js/content.js");
  for (const file of ENGINE_FILES) browser.load("js/laser/engine/" + file);
  for (const file of UI_FILES) browser.load("js/laser/ui/" + file);
  w.Site = { lang: opts.lang || "en", word() { return ""; } };
  // Every word the tour asks for must be there.
  const missing = [];
  const realInLang = w.Content.inLang;
  w.Content = Object.assign({}, w.Content, {
    inLang(value, lang) {
      const text = realInLang(value, lang);
      if (!text) missing.push(value);
      return text;
    }
  });
  const before = browser.addedGlobals();
  browser.load("js/laser-intro-draw.js");
  browser.load("js/laser-intro-steps.js");
  browser.load("js/laser-intro.js");
  const added = browser.addedGlobals().filter((name) => !before.includes(name));
  const button = fakeElement("button");
  button.focus = function () { w.document.activeElement = button; };
  return { browser, w, store, canvases, missing, added, button };
}

function ready(t) {
  const container = fakeContainer({ "[data-laser-intro]": t.button });
  t.w.dispatchEvent(new t.w.CustomEvent("section:ready", { detail: { route: "laser", data: DATA, container } }));
}

function shown(t, route) {
  t.w.dispatchEvent(new t.w.CustomEvent("view:shown", { detail: { route: route || "laser", id: null } }));
}

// Every element under el (depth first).
function all(el) {
  const found = [el];
  for (const child of el.children || []) found.push(...all(child));
  return found;
}

function byClass(t, name) {
  return all(t.w.document.body).filter((el) => (" " + (el.className || "") + " ").includes(" " + name + " "));
}

function one(t, name) {
  const list = byClass(t, name);
  assert.equal(list.length, 1, name);
  return list[0];
}

// The watching part runs at this share of the screen's clock (WATCH_PACE
// in js/laser-intro.js), so there is time to read.
const PACE = 0.6;

// Plays a step's whole watching part, and a little more.
// (each caption also holds the film until it has been read, so this plays
// until the "Try it" part comes, at most two minutes)
function watchStep(t, i) {
  const tryRow = one(t, "laser-intro__try");
  for (let k = 0; k < 1200 && tryRow.hidden; k++) play(t, 0.1);
  assert.equal(tryRow.hidden, false, "step " + (i + 1) + " reaches its Try it part");
  play(t, 0.5);
}

// The button on the right of the nav row: Skip while a step is watched,
// Next once it is finished.
function navButton(t) {
  const nav = one(t, "laser-intro__nav");
  return nav.children[nav.children.length - 1];
}

// From step 1 to step `index` + 1: Skip, then Next, for each step.
function goToStep(t, index) {
  for (let i = 0; i < index; i++) {
    navButton(t).fire("click");
    navButton(t).fire("click");
  }
}

let clock = 0;
// Runs frames for `seconds` of screen time, 20 a second.
function play(t, seconds) {
  const frames = Math.round(seconds * 20);
  for (let i = 0; i < frames; i++) {
    clock += 50;
    t.browser.runFrame(clock);
  }
}

/* ---------- 1. the physics behind the words ---------- */

test("the numbers the words state: 7 and 22 bounces at 10%, 2 ns over 30 cm", () => {
  const { w } = setup();
  const P = w.LaserIntro.physics;
  assert.equal(P.bouncesUntil(0.5, 0.1), 7);
  assert.equal(P.bouncesUntil(0.1, 0.1), 22);
  assert.equal(P.bouncesUntil(0.01, 0.1), 44);
  assert.equal(P.bouncesUntil(0.5, 0.01), 69);
  assert.equal(P.bouncesUntil(0.5, 0.5), 2, "exactly half after one: less than half after two");
  assert.equal(P.bouncesUntil(0.1, 0.5), 4);
  // 0.9^7 is under a half, 0.9^6 is not
  assert.ok(Math.pow(0.9, 7) < 0.5 && Math.pow(0.9, 6) >= 0.5);
  assert.ok(Math.abs(P.roundTrip(0.3) - 2.0e-9) < 0.01e-9);
  // the step 2 caption: 44 round trips are under a tenth of a microsecond
  assert.ok(P.bouncesUntil(0.01, 0.1) * P.roundTrip(0.3) < 1e-7);
});

test("twins in a row of ten atoms: the light grows only when more are up than down", () => {
  const { w } = setup();
  const P = w.LaserIntro.physics;
  const out = (up) => P.passRow(up, 10, 1)[9];
  assert.equal(out(10), 11, "every atom adds a twin");
  assert.equal(out(5), 1, "half up: as much out as in");
  for (let up = 0; up < 5; up++) assert.equal(out(up), 0, up + " up: swallowed");
  for (let up = 6; up <= 10; up++) assert.ok(out(up) > out(up - 1), up + " up: more than " + (up - 1));
  for (let up = 0; up <= 10; up++) {
    let count = 0;
    for (let i = 0; i < 10; i++) if (P.isUp(i, up, 10)) count += 1;
    assert.equal(count, up, "isUp puts exactly " + up + " up");
  }
});

test("the laser of step 7: the candle stays under the mirror's 10%, the flash lamp starts it", () => {
  const { w } = setup();
  const P = w.LaserIntro.physics;
  assert.ok(P.gainOf("candle", 1) < P.LETS_OUT, "a candle at full is too weak");
  assert.ok(P.gainOf("lamp", 1) > P.LETS_OUT, "the lamp is strong enough");
  const run = (gain, rounds) => {
    let light = 0;
    for (let i = 0; i < rounds; i++) light = P.roundTripLight(light, gain);
    return light;
  };
  assert.ok(run(P.gainOf("candle", 1), 2000) < 0.01, "no beam with the candle");
  assert.ok(run(P.gainOf("lamp", 1), 200) > 1, "a beam with the lamp");
  assert.ok(run(0.099, 2000) < 0.05, "just under the threshold: none");
  assert.ok(run(0.11, 2000) > 0.05, "just over it: some");
  // the lamp flashes: dark at the start of each flash, full at its top
  assert.equal(P.pumpNow("lamp", 1, 0), 0);
  let top = 0;
  for (let t = 0; t < 3; t += 0.01) top = Math.max(top, P.pumpNow("lamp", 1, t));
  assert.ok(top > 0.99 && top <= 1, "the flash's top is the brightness: " + top);
  assert.equal(P.pumpNow("candle", 0.6, 1.234), 0.6, "a candle burns steadily");
});

/* ---------- 2. the words ---------- */

test("data/laser.json: eight steps, each with its title, hint and captions in both languages", () => {
  const intro = DATA.intro;
  for (const key of ["label", "replay", "skip", "stepOf", "watchAgain", "back", "next"]) {
    assert.ok(intro[key] && intro[key].hy && intro[key].en, key);
  }
  const { w } = setup();
  assert.equal(intro.steps.length, STEPS);
  assert.equal(w.LaserIntro.steps.length, STEPS);
  intro.steps.forEach((step, i) => {
    for (const key of ["title", "hint"]) assert.ok(step[key].hy && step[key].en, i + " " + key);
    assert.equal(step.captions.length, w.LaserIntro.steps[i].captions.length, "step " + (i + 1) + ": one caption per start");
    for (const caption of step.captions) assert.ok(caption.hy && caption.en, "step " + (i + 1));
  });
});

test("every 'monochromatic' and 'coherent' has its plain meaning in brackets, in both languages", () => {
  const words = [];
  (function walk(v) {
    if (v && typeof v === "object") {
      if (typeof v.en === "string" && typeof v.hy === "string") words.push(v);
      else for (const k of Object.keys(v)) walk(v[k]);
    }
  })(DATA.intro.steps);
  let seen = 0;
  for (const pair of words) {
    for (const [lang, term] of [["en", "monochromatic"], ["en", "coherent"], ["hy", "մոնոքրոմատիկ"], ["hy", "կոհերենտ"]]) {
      const text = pair[lang];
      let at = text.indexOf(term);
      while (at !== -1) {
        seen += 1;
        assert.match(text.slice(at + term.length), /^(\*\*)?\s*\(/, lang + ": " + text);
        at = text.indexOf(term, at + 1);
      }
    }
  }
  assert.ok(seen >= 6, "the terms appear: " + seen);
});

/* ---------- 3. the tour in a browser ---------- */

test("opens by itself each time the laser page comes on screen, adds only LaserIntro, and the button opens it", () => {
  const t = setup();
  assert.deepEqual(t.added, ["LaserIntro"]);
  ready(t);
  shown(t);
  assert.equal(t.w.LaserIntro.isOpen(), true);
  assert.match(t.w.document.documentElement.className, /laser-intro-open/);
  one(t, "laser-intro__skip").fire("click");
  assert.equal(t.w.LaserIntro.isOpen(), false);
  assert.doesNotMatch(t.w.document.documentElement.className, /laser-intro-open/);
  assert.equal(t.browser.listenerCount("keydown"), 0);
  assert.equal(t.browser.listenerCount("resize"), 0);
  assert.equal(t.browser.pendingFrames(), 0);
  shown(t);
  assert.equal(t.w.LaserIntro.isOpen(), true, "again on the next visit (a reload too)");
  one(t, "laser-intro__skip").fire("click");
  t.button.fire("click", { currentTarget: t.button });
  assert.equal(t.w.LaserIntro.isOpen(), true, "the button opens it");
  t.w.dispatchEvent({ type: "keydown", key: "Escape" });
  assert.equal(t.w.LaserIntro.isOpen(), false, "Esc closes it");
  assert.equal(t.w.document.activeElement, t.button, "the focus goes back to the button");
});

test("captions: none during the title card, then each fades in whole, key words in <strong>", () => {
  const t = setup();
  ready(t);
  shown(t);
  const caption = one(t, "laser-intro__caption");
  assert.equal(caption.getAttribute("data-text"), "", "the title card has no caption");
  play(t, 6 / PACE);   // past the card (5.5 s of the film)
  assert.equal(caption.getAttribute("data-text"), DATA.intro.steps[0].captions[0].en);
  // one line, faded in as a whole (css/laser.css), its pieces in order
  assert.equal(caption.children.length, 1);
  const line = caption.children[0];
  assert.equal(line.className, "laser-intro__line");
  assert.equal(line.children.map((el) => el.textContent).join(""), DATA.intro.steps[0].captions[0].en);
  // the second caption: its key words in <strong>
  for (let k = 0; k < 400 && caption.getAttribute("data-text") === DATA.intro.steps[0].captions[0].en; k++) play(t, 0.1);
  const strong = all(caption).filter((el) => el.tagName === "STRONG").map((el) => el.textContent);
  assert.deepEqual(strong, ["slowed down a billion times"]);
  assert.equal(one(t, "laser-intro__try").hidden, true);
});

test("a new caption blurs the picture and stops the film until it has been read", () => {
  const t = setup();
  ready(t);
  shown(t);
  const box = one(t, "laser-intro");
  const caption = one(t, "laser-intro__caption");
  const words = (text) => text.split(/\s+/).length;
  // the title card has no caption: the picture is sharp
  play(t, 1);
  assert.equal(box.getAttribute("data-reading"), "false");
  const first = DATA.intro.steps[0].captions[0].en;
  for (let k = 0; k < 400 && caption.getAttribute("data-text") !== first; k++) play(t, 0.05);
  assert.equal(box.getAttribute("data-reading"), "true", "blurred while the caption comes in");
  // 3 s of fading in, then 0.3 s a word
  const need = 3 + words(first) * 0.3;
  play(t, need - 1);
  assert.equal(box.getAttribute("data-reading"), "true", "still blurred while it is read");
  play(t, 1.5);
  assert.equal(box.getAttribute("data-reading"), "false", "then the picture comes back");
  // the caption stays up while the film goes on
  assert.equal(caption.getAttribute("data-text"), first);
  // the Try it part never blurs
  watchStep(t, 0);
  assert.equal(box.getAttribute("data-reading"), "false");
});

test("while a step is watched the button is Skip (straight to Try it), then the red Next", () => {
  const t = setup();
  ready(t);
  t.button.fire("click", { currentTarget: t.button });
  const button = navButton(t);
  const tryRow = one(t, "laser-intro__try");
  const count = one(t, "laser-intro__count");
  assert.equal(button.textContent, DATA.intro.skipStep.en);
  assert.doesNotMatch(button.className, /btn--primary/, "not the red button yet");
  button.fire("click");
  assert.equal(tryRow.hidden, false, "Skip goes straight to the Try it part");
  assert.equal(count.textContent, "Step 1 of 8", "on the same step");
  assert.equal(button.textContent, DATA.intro.next.en);
  assert.match(button.className, /btn--primary/);
  button.fire("click");
  assert.equal(count.textContent, "Step 2 of 8");
  assert.equal(button.textContent, DATA.intro.skipStep.en, "Skip again on the new step");
  // the last step: Skip while watched, no Next after
  goToStep(t, 6);
  assert.equal(count.textContent, "Step 8 of 8");
  assert.equal(button.hidden, false);
  button.fire("click");
  assert.equal(button.hidden, true);
});

test("step 7: the photons between the mirrors gain twins from glowing atoms and leak at the mirror", () => {
  const t = setup();
  const step = t.w.LaserIntro.steps[6];
  const env = (time, trying) => ({ t: time, trying, random: () => 0.5, still: false, w: () => "", page: () => "" });
  // the watching part, with the candle: a lone photon gets a few twins
  let s = step.start(env(0, false));
  let most = 0;
  for (let time = 0; time < 24; time += 0.05) {
    step.update(s, 0.05, env(time, false));
    if (s.packet) most = Math.max(most, s.packet.n);
  }
  assert.ok(most >= 3 && most <= 4, "a candle's photon gets a few twins: " + most);
  // with the candle the twins leak out and the group is never large
  s = step.start(env(0, true));
  const sizes = [];
  for (let time = 0; time < 90; time += 0.05) {
    step.update(s, 0.05, env(time, true));
    sizes.push(s.packet ? s.packet.n : 0);
  }
  assert.ok(Math.max(...sizes) <= 4, "the candle never makes more than a few");
  assert.ok(sizes.includes(0), "they leak out and the light dies");
  assert.ok(s.leaving !== undefined);
  // the flash lamp at full brightness: the group fills up
  s = step.start(env(0, true));
  step.set(s, "pump", "lamp");
  let lampMost = 0;
  for (let time = 0; time < 12; time += 0.05) {
    step.update(s, 0.05, env(time, true));
    if (s.packet) lampMost = Math.max(lampMost, s.packet.n);
  }
  assert.ok(lampMost >= 12, "the lamp fills the group with twins: " + lampMost);
  // a dim lamp, under the threshold: no growth beyond the lone photon
  s = step.start(env(0, true));
  step.set(s, "pump", "lamp");
  step.set(s, "bright", 0.15);
  let dimMost = 0;
  for (let time = 0; time < 12; time += 0.05) {
    step.update(s, 0.05, env(time, true));
    if (s.packet) dimMost = Math.max(dimMost, s.packet.n);
  }
  assert.equal(dimMost, 1, "under the threshold the photon finds no room for twins");
});

test("the progress bar fills the current step's segment as it plays", () => {
  const t = setup();
  ready(t);
  t.button.fire("click", { currentTarget: t.button });
  const fills = byClass(t, "laser-intro__fill");
  assert.equal(fills.length, 8);
  const share = (i) => Number(fills[i].style["--p"]);
  play(t, 2);
  const early = share(0);
  assert.ok(early > 0 && early < 1, "part of step 1: " + early);
  play(t, 3);
  assert.ok(share(0) > early, "and it grows");
  assert.equal(share(1), 0);
  watchStep(t, 0);
  assert.equal(share(0), 1, "full once the step is finished");
  navButton(t).fire("click");
  assert.equal(share(0), 1, "a step done stays full");
  assert.equal(share(1), 0, "the next starts empty");
});

test("not by itself for a visitor who asked for less motion; another page closes it", () => {
  const t = setup({ reducedMotion: true });
  ready(t);
  shown(t);
  assert.equal(t.w.LaserIntro.isOpen(), false);
  t.button.fire("click", { currentTarget: t.button });
  assert.equal(t.w.LaserIntro.isOpen(), true, "the button still opens it");
  shown(t, "labs");
  assert.equal(t.w.LaserIntro.isOpen(), false);
});

for (const lang of ["en", "hy"]) {
  test("walks through all eight steps (" + lang + "): watch, then try every control, every word there", () => {
    const t = setup({ lang });
    ready(t);
    t.button.fire("click", { currentTarget: t.button });
    const next = navButton(t);
    const tryRow = one(t, "laser-intro__try");
    const caption = one(t, "laser-intro__caption");
    for (let i = 0; i < STEPS; i++) {
      const step = t.w.LaserIntro.steps[i];
      assert.equal(tryRow.hidden, true, "step " + (i + 1) + ": the controls wait");
      watchStep(t, i);
      assert.ok(caption.getAttribute("data-text"), "step " + (i + 1) + ": a caption");
      assert.equal(tryRow.hidden, false, "step " + (i + 1) + ": then the controls show");
      // move every slider to both ends, press every button and choice
      for (const input of byClass(t, "laser-intro__range")) {
        for (const end of ["min", "max"]) {
          input.value = input.getAttribute(end);
          input.fire("input");
          play(t, 1);
          assert.ok(input.getAttribute("aria-valuetext"), "step " + (i + 1) + ": a slider's words");
        }
      }
      const buttons = all(one(t, "laser-intro__controls")).filter((el) => el.tagName === "BUTTON");
      for (const b of buttons) {
        if (b.className.includes("btn--primary")) continue;   // the last step's "Open the lab" closes
        b.fire("click");
        play(t, 1.5);
      }
      if (i === 4) {
        // a click on an atom of step 5 excites it
        one(t, "laser-intro__film").fire("pointerdown", { clientX: 400 * 1000 / 1280, clientY: 200 * 1000 / 1280 });
        play(t, 4);
      }
      const notes = all(one(t, "laser-intro__notes")).filter((el) => el.tagName === "P").map((el) => el.textContent);
      for (const line of notes) assert.doesNotMatch(line, /\{\w+\}/, "every {name} filled in: " + line);
      if (i < STEPS - 1) {
        assert.equal(next.hidden, false);
        assert.match(next.className, /btn--primary/, "a red Next once the step is finished");
        next.fire("click");
      } else {
        assert.equal(next.hidden, true, "no Next on the last step");
      }
    }
    assert.deepEqual(t.missing, [], "every word the tour asked for is in data/laser.json");
    const open = byClass(t, "btn--primary").find((b) => b.parentNode.className.includes("laser-intro__control"));
    open.fire("click");
    assert.equal(t.w.LaserIntro.isOpen(), false, "'Open the laser lab' closes the tour");
  });
}

test("an error in a step closes the tour, so the button can open it again", () => {
  const t = setup();
  ready(t);
  t.button.fire("click", { currentTarget: t.button });
  const step = t.w.LaserIntro.steps[0];
  const update = step.update;
  step.update = function () { throw new Error("a broken step"); };
  try {
    assert.throws(() => play(t, 0.1), /a broken step/);
  } finally {
    step.update = update;
  }
  assert.equal(t.w.LaserIntro.isOpen(), false);
  assert.equal(t.browser.pendingFrames(), 0);
  t.button.fire("click", { currentTarget: t.button });
  assert.equal(t.w.LaserIntro.isOpen(), true);
});

test("step 7 calls it a working laser only when the beam is there: a lamp just over the threshold is weak", () => {
  const t = setup();
  ready(t);
  t.button.fire("click", { currentTarget: t.button });
  goToStep(t, 6);
  watchStep(t, 6);
  const notes = () => one(t, "laser-intro__notes").children.map((p) => p.textContent).join(" ");
  assert.match(notes(), /Too weak/, "the candle");
  all(one(t, "laser-intro__controls")).find((el) => el.getAttribute && el.getAttribute("data-option") === "lamp").fire("click");
  const slider = one(t, "laser-intro__range");
  slider.value = "0.3";
  slider.fire("input");
  play(t, 7);
  assert.match(notes(), /Just over the threshold/, "brightness 0.3: the gain passes 10% only briefly");
  slider.value = "1";
  slider.fire("input");
  play(t, 7);
  assert.match(notes(), /The laser works/);
  slider.value = "0.2";
  slider.fire("input");
  play(t, 7);
  assert.match(notes(), /Below the threshold/);
});

test("the page behind the open tour is taken away (the lab's loop stops, Tab stays in the tour)", () => {
  const css = fs.readFileSync(path.join(ROOT, "css", "laser.css"), "utf8");
  const rule = css.match(/html\.laser-intro-open #site-header,\s*html\.laser-intro-open #app,\s*html\.laser-intro-open #site-footer\s*\{([^}]*)\}/);
  assert.ok(rule, "the rule is there");
  assert.match(rule[1], /display:\s*none/);
});

test("step 1: the mirrors move apart as the distance grows", () => {
  const t = setup();
  ready(t);
  t.button.fire("click", { currentTarget: t.button });
  watchStep(t, 0);
  const recorder = t.canvases[0].recorder;
  // the mirrors' glass: 22 x 160 rectangles on the board
  const mirrorsAt = () => {
    recorder.calls.length = 0;
    play(t, 0.1);
    return recorder.calls.filter((c) => c.name === "fillRect" && c.args[2] === 22 && c.args[3] === 160).map((c) => c.args[0])
      .filter((x, i, list) => list.indexOf(x) === i);   // once a frame: each place once
  };
  const slider = byClass(t, "laser-intro__range").find((el) => el.id.endsWith("-length"));
  const widths = [];
  for (const length of ["0.1", "0.3", "1"]) {
    slider.value = length;
    slider.fire("input");
    const xs = mirrorsAt();
    assert.equal(xs.length, 2, length + " m: two mirrors");
    widths.push(Math.max(...xs) - Math.min(...xs));
  }
  assert.ok(widths[0] < widths[1] && widths[1] < widths[2], "wider apart each time: " + widths);
  assert.ok(widths[2] <= 1280 - 2 * 60, "1 m still fits on the board: " + widths[2]);
});

test("step 6 shows on the picture the count the readout states", () => {
  const t = setup();
  ready(t);
  t.button.fire("click", { currentTarget: t.button });
  goToStep(t, 5);
  watchStep(t, 5);
  const slider = one(t, "laser-intro__range");
  for (const up of [3, 5, 8]) {
    slider.value = String(up);
    slider.fire("input");
    const expected = t.w.LaserIntro.physics.passRow(up, 10, 1)[9];
    assert.match(one(t, "laser-intro__notes").children[0].textContent, new RegExp("Out: " + expected + "\\."));
  }
});

test("index.html loads the tour's three files in order, after the laser lab", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const order = ["js/laser/page.js", "js/laser-intro-draw.js", "js/laser-intro-steps.js", "js/laser-intro.js"]
    .map((src) => html.indexOf('<script src="' + src + '"></script>'));
  for (const at of order) assert.ok(at > 0);
  assert.deepEqual(order.slice().sort((a, b) => a - b), order);
  const section = fs.readFileSync(path.join(ROOT, "sections", "laser.html"), "utf8");
  assert.equal((section.match(/data-laser-intro\b/g) || []).length, 1, "one button opens it again");
  assert.match(section, /data-laser-intro[^>]*data-text="intro\.replay"/);
});
