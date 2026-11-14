/* ============================================================================
   loop.test.js — js/laser/ui/loop.js, the drawing loop of the laser page.

   The rules it must keep are the ones js/labs.js keeps for the other labs
   (docs/laser-plan.md §1 and the stage-5 card): run only while wanted and on
   screen, cap the time step, size the canvas for the screen, read the
   colours from the theme, and leave nothing behind when it is destroyed.
   Runs the real file in the fake browser of fake-browser.js.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createBrowser, fakeCanvas, themeVariables } = require("./fake-browser.js");

// One loop with one canvas. Records what the loop does, in order:
// events = [["update", dt], ["draw", { w, h, dt, ... }], ...].
function setup(options) {
  const opts = options || {};
  const browser = createBrowser(opts.browser);
  browser.load("js/laser/ui/loop.js");
  const UI = browser.window.LaserUI;
  const parts = fakeCanvas(opts.boxWidth === undefined ? 600 : opts.boxWidth);
  const events = [];
  const canvasSpec = Object.assign({
    canvas: parts.canvas,
    box: parts.box,
    aspect: 2,
    minHeight: 100,
    maxHeight: 400,
    draw(view) {
      events.push(["draw", {
        w: view.w, h: view.h, dpr: view.dpr, dt: view.dt, t: view.t,
        colors: Object.assign({}, view.colors), font: view.font, g: view.g
      }]);
    }
  }, opts.canvas);
  const loopOptions = Object.assign({
    canvases: [canvasSpec],
    update(dt) { events.push(["update", dt]); }
  }, opts.loop);
  const loop = UI.loop.create(loopOptions);
  return Object.assign({ browser: browser, UI: UI, loop: loop, events: events }, parts);
}

function draws(events) {
  return events.filter((e) => e[0] === "draw").map((e) => e[1]);
}

test("loads as one global, LaserUI, with frozen objects", () => {
  const browser = createBrowser();
  browser.load("js/laser/ui/loop.js");
  assert.deepEqual(browser.addedGlobals(), ["LaserUI"]);
  const loop = browser.window.LaserUI.loop;
  assert.ok(Object.isFrozen(loop));
  assert.ok(Object.isFrozen(loop.PALETTE));
  assert.equal(loop.liveCount(), 0);
});

test("built while the page is hidden: no frame, not running, nothing drawn", () => {
  const s = setup({ boxWidth: 0 });
  assert.equal(s.browser.pendingFrames(), 0);
  assert.equal(s.loop.isRunning(), false);
  assert.equal(s.canvas.getAttribute("data-running"), "false");
  assert.deepEqual(s.events, []);
  assert.equal(s.canvas.width, 300, "a box of width 0 does not resize the canvas");
  assert.equal(s.UI.loop.liveCount(), 1);
  s.loop.destroy();
});

test("on screen: frames start; the canvas is the inside of its box times the pixel ratio", () => {
  const s = setup({ browser: { devicePixelRatio: 2 }, boxWidth: 600 });
  assert.equal(s.browser.pendingFrames(), 0, "not before the observer says it is on screen");
  s.browser.setOnScreen(s.canvas, true);
  assert.equal(s.browser.pendingFrames(), 1);
  assert.equal(s.loop.isRunning(), true);
  assert.equal(s.canvas.getAttribute("data-running"), "true");
  // 600 px inside the box's border (602 with it), aspect 2 -> 300 px
  // high; 2 device pixels per CSS pixel.
  assert.equal(s.box.getBoundingClientRect().width, 602);
  assert.equal(s.canvas.width, 1200);
  assert.equal(s.canvas.height, 600);
  assert.equal(s.canvas.style.height, "300px");
  const transforms = s.recorder.calls.filter((c) => c.name === "setTransform");
  assert.deepEqual(transforms[transforms.length - 1].args, [2, 0, 0, 2, 0, 0]);
  // Resizing a canvas resets its context, so the scale must come after it.
  const log = s.recorder.log;
  const lastReset = log.map((e) => !!e.reset).lastIndexOf(true);
  const lastScale = log.map((e) => e.call === "setTransform").lastIndexOf(true);
  assert.ok(lastReset !== -1 && lastScale > lastReset, "setTransform after the resize");
  const drawn = draws(s.events);
  assert.equal(drawn[drawn.length - 1].w, 600);
  assert.equal(drawn[drawn.length - 1].h, 300);
  assert.equal(drawn[drawn.length - 1].dpr, 2);
  assert.equal(drawn[drawn.length - 1].g, s.canvas.getContext("2d"));
  s.loop.destroy();
});

test("time step: 0 on the first frame, the real gap after, at most 0.05 s; update before draw", () => {
  const s = setup();
  s.browser.setOnScreen(s.canvas, true);
  s.events.length = 0;
  s.browser.runFrame(1000);
  s.browser.runFrame(1016);
  s.browser.runFrame(2016);           // a 1 s gap (a background tab)
  assert.deepEqual(s.events.map((e) => e[0]),
    ["update", "draw", "update", "draw", "update", "draw"]);
  const steps = s.events.filter((e) => e[0] === "update").map((e) => e[1]);
  assert.equal(steps[0], 0);
  assert.ok(Math.abs(steps[1] - 0.016) < 1e-12, "got " + steps[1]);
  assert.equal(steps[2], 0.05);
  const drawn = draws(s.events);
  assert.deepEqual(drawn.map((d) => d.dt), steps);
  assert.ok(Math.abs(drawn[2].t - 0.066) < 1e-12, "t adds up the steps, got " + drawn[2].t);
  assert.equal(s.browser.pendingFrames(), 1, "the loop asks for the next frame");
  s.loop.destroy();
});

test("height stays between minHeight and maxHeight; the pixel ratio is capped at 2", () => {
  const narrow = setup({ boxWidth: 150 });      // 150/2 = 75 -> 100
  narrow.browser.setOnScreen(narrow.canvas, true);
  assert.equal(narrow.canvas.style.height, "100px");
  assert.equal(narrow.canvas.height, 100);
  narrow.loop.destroy();

  const wide = setup({ boxWidth: 1000 });       // 1000/2 = 500 -> 400
  wide.browser.setOnScreen(wide.canvas, true);
  assert.equal(wide.canvas.style.height, "400px");
  wide.loop.destroy();

  const sharp = setup({ browser: { devicePixelRatio: 3 }, boxWidth: 500 });
  sharp.browser.setOnScreen(sharp.canvas, true);
  assert.equal(sharp.canvas.width, 1000);
  assert.equal(sharp.canvas.height, 500);
  sharp.loop.destroy();

  // A width that is not a whole number of pixels is rounded, not cut.
  const odd = setup({ browser: { devicePixelRatio: 1.5 }, boxWidth: 333 });
  odd.browser.setOnScreen(odd.canvas, true);
  assert.equal(odd.canvas.width, 500);           // 499.5 -> 500
  odd.loop.destroy();
});

test("off screen it stops; back on screen it starts again with a time step of 0", () => {
  const s = setup();
  s.browser.setOnScreen(s.canvas, true);
  s.browser.runFrame(1000);
  s.browser.setOnScreen(s.canvas, false);
  assert.equal(s.browser.pendingFrames(), 0);
  assert.equal(s.loop.isRunning(), false);
  assert.equal(s.canvas.getAttribute("data-running"), "false");
  s.events.length = 0;
  s.browser.setOnScreen(s.canvas, true);
  s.browser.runFrame(9000);           // 8 s later
  assert.equal(s.events.find((e) => e[0] === "update")[1], 0);
  s.loop.destroy();
});

test("pause and play: play starts it only while it is on screen", () => {
  const s = setup();
  s.loop.pause();
  s.browser.setOnScreen(s.canvas, true);
  assert.equal(s.browser.pendingFrames(), 0);
  assert.equal(s.canvas.getAttribute("data-running"), "false");
  s.loop.play();
  assert.equal(s.browser.pendingFrames(), 1);
  assert.equal(s.canvas.getAttribute("data-running"), "true");
  s.loop.pause();
  assert.equal(s.browser.pendingFrames(), 0);
  assert.equal(s.loop.isRunning(), false);
  s.browser.setOnScreen(s.canvas, false);
  s.loop.play();
  assert.equal(s.browser.pendingFrames(), 0, "wanted, but not on screen");
  assert.equal(s.canvas.getAttribute("data-running"), "false");
  s.loop.destroy();
});

test("a visitor who asked for less motion gets a paused loop that still draws once", () => {
  const s = setup({ browser: { reducedMotion: true } });
  s.browser.setOnScreen(s.canvas, true);
  assert.equal(s.browser.pendingFrames(), 0);
  assert.equal(s.canvas.getAttribute("data-running"), "false");
  assert.equal(draws(s.events).length, 1, "the still picture is there");
  s.loop.play();
  assert.equal(s.browser.pendingFrames(), 1);
  s.loop.destroy();

  const asked = setup({ loop: { running: false } });
  asked.browser.setOnScreen(asked.canvas, true);
  assert.equal(asked.browser.pendingFrames(), 0, "running: false starts paused too");
  asked.loop.destroy();

  const forced = setup({ browser: { reducedMotion: true }, loop: { running: true } });
  forced.browser.setOnScreen(forced.canvas, true);
  assert.equal(forced.browser.pendingFrames(), 1, "running: true overrides the default");
  forced.loop.destroy();
});

test("theme switch: the colours are read again; a paused loop draws once with them", () => {
  const s = setup();
  s.loop.pause();
  s.browser.setOnScreen(s.canvas, true);
  const before = draws(s.events).length;
  s.browser.setCssVariables(themeVariables().light);
  s.browser.window.dispatchEvent(new s.browser.window.CustomEvent("theme:changed", { detail: { theme: "light" } }));
  const drawn = draws(s.events);
  assert.equal(drawn.length, before + 1);
  assert.equal(drawn[drawn.length - 1].colors.accent, "#c0603a");

  // A running loop does not draw at once; its next frame uses the new colours.
  s.loop.play();
  s.events.length = 0;
  s.browser.setCssVariables(themeVariables().dark);
  s.browser.window.dispatchEvent(new s.browser.window.CustomEvent("theme:changed", { detail: { theme: "dark" } }));
  assert.equal(draws(s.events).length, 0);
  s.browser.runFrame(100);
  assert.equal(draws(s.events)[0].colors.accent, "#2f80ed");
  s.loop.destroy();
});

test("the palette: every colour from its CSS variable, without the spaces; the font too", () => {
  const s = setup();
  s.browser.setOnScreen(s.canvas, true);
  const view = draws(s.events)[0];
  const dark = themeVariables().dark;
  const PALETTE = s.UI.loop.PALETTE;
  assert.deepEqual(Object.keys(view.colors).sort(), Object.keys(PALETTE).sort());
  for (const name of Object.keys(PALETTE)) {
    assert.equal(view.colors[name], dark[PALETTE[name]], name);
  }
  assert.equal(view.font, dark["--font-main"]);
  s.loop.destroy();
});

test("resize: a new width means a new size and one draw; the same width or 0 means nothing", () => {
  const s = setup();
  s.loop.pause();
  s.browser.setOnScreen(s.canvas, true);
  let count = draws(s.events).length;
  s.browser.resizeBox(s.box, 800);
  assert.equal(s.canvas.width, 800);
  assert.equal(draws(s.events).length, count + 1);
  count += 1;
  s.browser.resizeBox(s.box, 800);
  assert.equal(draws(s.events).length, count, "same width: no new draw");
  s.browser.resizeBox(s.box, 0);
  assert.equal(s.canvas.width, 800, "a hidden page keeps the last size");
  assert.equal(draws(s.events).length, count);
  // The window's resize event measures too (a browser without ResizeObserver).
  s.box.width = 500;
  s.browser.window.dispatchEvent(new s.browser.window.CustomEvent("resize"));
  assert.equal(s.canvas.width, 500);
  // The pixel ratio changing (the window moved to another screen) counts.
  s.browser.window.devicePixelRatio = 2;
  s.browser.window.dispatchEvent(new s.browser.window.CustomEvent("resize"));
  assert.equal(s.canvas.width, 1000);
  s.loop.destroy();
});

test("redraw: a paused loop draws at once, a running one waits for its frame", () => {
  const s = setup();
  s.loop.pause();
  s.browser.setOnScreen(s.canvas, true);
  const count = draws(s.events).length;
  s.loop.redraw();
  assert.equal(draws(s.events).length, count + 1);
  assert.equal(draws(s.events)[count].dt, 0);
  s.loop.play();
  s.loop.redraw();
  assert.equal(draws(s.events).length, count + 1);
  s.loop.destroy();
});

test("destroy: nothing left behind, late callbacks ignored, a second destroy harmless", () => {
  const s = setup();
  assert.equal(s.browser.listenerCount("resize"), 1);
  assert.equal(s.browser.listenerCount("theme:changed"), 1);
  s.browser.setOnScreen(s.canvas, true);
  assert.equal(s.UI.loop.liveCount(), 1);

  s.loop.destroy();
  assert.equal(s.browser.pendingFrames(), 0);
  assert.equal(s.loop.isRunning(), false);
  assert.equal(s.canvas.getAttribute("data-running"), "false");
  assert.equal(s.browser.listenerCount("resize"), 0);
  assert.equal(s.browser.listenerCount("theme:changed"), 0);
  assert.ok(s.browser.intersectionObservers.every((o) => o.disconnected));
  assert.ok(s.browser.resizeObservers.every((o) => o.disconnected));
  assert.equal(s.UI.loop.liveCount(), 0);

  // A callback already on its way when the page was rebuilt.
  s.events.length = 0;
  const observer = s.browser.intersectionObservers[0];
  observer.callback([{ target: s.canvas, isIntersecting: true }], observer);
  s.browser.resizeObservers[0].callback([{ target: s.box }], s.browser.resizeObservers[0]);
  s.loop.play();
  s.loop.redraw();
  assert.equal(s.browser.pendingFrames(), 0);
  assert.deepEqual(s.events, []);
  assert.equal(s.canvas.getAttribute("data-running"), "false");

  s.loop.destroy();
  assert.equal(s.UI.loop.liveCount(), 0, "counted down once");
});

test("a frame already queued when the loop is destroyed does nothing", () => {
  const s = setup();
  s.browser.setOnScreen(s.canvas, true);
  // Keep the queued frame's callback, then destroy, then run it by hand.
  let queued = null;
  const realRequest = s.browser.window.requestAnimationFrame;
  s.browser.window.requestAnimationFrame = (callback) => { queued = callback; return realRequest(callback); };
  s.browser.runFrame(1000);
  s.loop.destroy();
  s.events.length = 0;
  queued(1016);
  assert.deepEqual(s.events, []);
  assert.equal(s.browser.pendingFrames(), 0);
});

test("without IntersectionObserver or ResizeObserver the canvas counts as on screen", () => {
  const s = setup({ browser: { noObservers: true } });
  assert.equal(s.browser.pendingFrames(), 1);
  assert.equal(s.canvas.getAttribute("data-running"), "true");
  s.box.width = 400;
  s.browser.window.dispatchEvent(new s.browser.window.CustomEvent("resize"));
  assert.equal(s.canvas.width, 400);
  s.loop.destroy();
  assert.equal(s.browser.pendingFrames(), 0);
});

test("two canvases share one frame loop", () => {
  const browser = createBrowser();
  browser.load("js/laser/ui/loop.js");
  const a = fakeCanvas(600);
  const b = fakeCanvas(300);
  const drawn = [];
  let updates = 0;
  function spec(parts, name) {
    return {
      canvas: parts.canvas, box: parts.box, aspect: 2, minHeight: 50, maxHeight: 500,
      draw() { drawn.push(name); }
    };
  }
  const loop = browser.window.LaserUI.loop.create({
    canvases: [spec(a, "a"), spec(b, "b")],
    update() { updates += 1; }
  });
  browser.setOnScreen(a.canvas, true);
  browser.setOnScreen(b.canvas, true);
  assert.equal(browser.pendingFrames(), 1, "one loop, not one per canvas");
  drawn.length = 0;
  browser.runFrame(100);
  assert.deepEqual(drawn, ["a", "b"]);
  assert.equal(updates, 1);
  browser.setOnScreen(a.canvas, false);
  drawn.length = 0;
  browser.runFrame(116);
  assert.deepEqual(drawn, ["b"], "only the canvas on screen is drawn");
  assert.equal(browser.pendingFrames(), 1, "the loop still runs for b");
  assert.equal(a.canvas.getAttribute("data-running"), "false", "a, scrolled away, is not being drawn");
  assert.equal(b.canvas.getAttribute("data-running"), "true");
  browser.setOnScreen(b.canvas, false);
  assert.equal(browser.pendingFrames(), 0);
  assert.equal(b.canvas.getAttribute("data-running"), "false");
  assert.equal(a.canvas.getAttribute("data-running"), "false");
  loop.destroy();
});

test("create refuses what it cannot draw, naming itself", () => {
  const browser = createBrowser();
  browser.load("js/laser/ui/loop.js");
  const create = browser.window.LaserUI.loop.create;
  const parts = fakeCanvas(600);
  const good = { canvas: parts.canvas, box: parts.box, aspect: 2, minHeight: 100, maxHeight: 400, draw() {} };
  const bad = [
    {},
    { canvases: [] },
    { canvases: [Object.assign({}, good, { draw: undefined })] },
    { canvases: [Object.assign({}, good, { canvas: undefined })] },
    { canvases: [Object.assign({}, good, { box: undefined })] },
    { canvases: [Object.assign({}, good, { aspect: 0 })] },
    { canvases: [Object.assign({}, good, { aspect: NaN })] },
    { canvases: [Object.assign({}, good, { minHeight: 500 })] },
    { canvases: [good], update: "not a function" }
  ];
  for (const options of bad) {
    assert.throws(() => create(options), /^Error: LaserUI\.loop\.create: /, JSON.stringify(Object.keys(options)));
  }
  assert.equal(browser.window.LaserUI.loop.liveCount(), 0, "a refused loop is not counted");
  create({ canvases: [good] }).destroy();
});

test("every PALETTE colour is set by both themes in css/style.css", () => {
  const browser = createBrowser();
  browser.load("js/laser/ui/loop.js");
  const PALETTE = browser.window.LaserUI.loop.PALETTE;
  const themes = themeVariables();
  assert.ok(Object.keys(PALETTE).length >= 6);
  for (const name of Object.keys(PALETTE)) {
    const variable = PALETTE[name];
    assert.ok(themes.dark[variable], name + ": " + variable + " is not in :root");
    assert.ok(themes.lightOnly[variable], name + ": " + variable + " is not in :root.theme-light, " +
      "so the light theme would draw it in the dark theme's colour");
  }
});

test("an error in update pauses the loop: thrown once, not every frame; play tries again", () => {
  let fail = false;
  const s = setup({ loop: { update() { if (fail) throw new Error("solver gave up"); } } });
  s.browser.setOnScreen(s.canvas, true);
  s.browser.runFrame(1000);
  fail = true;
  assert.throws(() => s.browser.runFrame(1016), /solver gave up/);
  assert.equal(s.browser.pendingFrames(), 0, "no next frame to throw again");
  assert.equal(s.loop.isRunning(), false);
  assert.equal(s.canvas.getAttribute("data-running"), "false");
  fail = false;
  s.loop.play();
  assert.equal(s.browser.pendingFrames(), 1);
  s.browser.runFrame(2000);
  assert.equal(s.browser.pendingFrames(), 1, "running again");
  s.loop.destroy();
});

test("an error in a draw pauses the loop too", () => {
  let fail = false;
  const s = setup({ canvas: { draw() { if (fail) throw new Error("bad drawing"); } } });
  s.browser.setOnScreen(s.canvas, true);
  fail = true;
  assert.throws(() => s.browser.runFrame(1000), /bad drawing/);
  assert.equal(s.browser.pendingFrames(), 0);
  assert.equal(s.loop.isRunning(), false);
  s.loop.destroy();
});

test("a pause or destroy made during a frame holds: no next frame is asked for", () => {
  let loop = null;
  let action = null;
  const s = setup({ loop: { update() { if (action) loop[action](); } } });
  loop = s.loop;
  s.browser.setOnScreen(s.canvas, true);
  action = "pause";
  s.browser.runFrame(1000);
  assert.equal(s.browser.pendingFrames(), 0);
  assert.equal(s.canvas.getAttribute("data-running"), "false");
  action = null;
  s.loop.play();
  action = "destroy";
  s.browser.runFrame(2000);
  assert.equal(s.browser.pendingFrames(), 0);
  assert.equal(s.UI.loop.liveCount(), 0);
});

test("a draw that throws on the first picture: create throws and leaves nothing behind", () => {
  const browser = createBrowser();
  browser.load("js/laser/ui/loop.js");
  const parts = fakeCanvas(600);
  assert.throws(() => browser.window.LaserUI.loop.create({
    canvases: [{
      canvas: parts.canvas, box: parts.box, aspect: 2, minHeight: 100, maxHeight: 400,
      draw() { throw new Error("broken first picture"); }
    }]
  }), /broken first picture/);
  assert.equal(browser.window.LaserUI.loop.liveCount(), 0);
  assert.equal(browser.listenerCount("resize"), 0);
  assert.equal(browser.listenerCount("theme:changed"), 0);
  assert.equal(browser.intersectionObservers.length, 0, "no observer was made");
  assert.equal(browser.resizeObservers.length, 0);
  assert.equal(browser.pendingFrames(), 0);
});
