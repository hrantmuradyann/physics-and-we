/* ============================================================================
   page.test.js — js/laser/page.js, which builds the laser page.

   The router (js/router.js) fires "section:ready" for the laser page more
   often than it is opened: once when it quietly builds every page in the
   background (the page is hidden then), and again on every language
   switch. page.js must take the previous build down each time, do nothing
   heavy while hidden, and ignore every other page (docs/laser-plan.md,
   "Site trap"). Runs the real files, with the real data/laser.json, in the
   fake browser of fake-browser.js.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { ROOT, UI_FILES } = require("./helpers.js");
const { createBrowser, fakeCanvas, fakeContainer } = require("./fake-browser.js");

const WORDS = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "laser.json"), "utf8"));
const CANVAS_SELECTOR = '[data-laser-canvas="bench"]';
const PARTS = ["backMirror", "outputMirror", "medium", "pump"];

// A fake browser with the site's content.js, the laser UI and page.js
// loaded, in the given language.
function setup(lang) {
  const browser = createBrowser();
  browser.load("js/content.js");
  for (const file of UI_FILES) browser.load("js/laser/ui/" + file);
  browser.window.Site = { lang: lang || "en" };
  const before = browser.addedGlobals();
  browser.load("js/laser/page.js");
  return { browser: browser, globalsBeforePage: before };
}

// A laser section as the router builds it. The box has width 0 by default:
// the router builds pages while they are hidden.
function laserSection(boxWidth) {
  const parts = fakeCanvas(boxWidth === undefined ? 0 : boxWidth);
  const by = {};
  by[CANVAS_SELECTOR] = parts.canvas;
  return Object.assign({ container: fakeContainer(by) }, parts);
}

function sectionReady(browser, route, container, data) {
  browser.window.dispatchEvent(new browser.window.CustomEvent("section:ready", {
    detail: { route: route, id: null, container: container, data: data }
  }));
}

function texts(recorder) {
  return recorder.calls.filter((c) => c.name === "fillText").map((c) => c.args[0]);
}

// A theme switch makes every live loop draw its (paused) picture again, so
// it shows which builds are still alive.
function switchTheme(browser) {
  browser.window.dispatchEvent(new browser.window.CustomEvent("theme:changed", { detail: { theme: "light" } }));
}

test("page.js adds no global, and listens to section:ready once", () => {
  const { browser, globalsBeforePage } = setup();
  assert.deepEqual(browser.addedGlobals(), globalsBeforePage);
  assert.equal(browser.listenerCount("section:ready"), 1);
});

test("the words page.js needs are in data/laser.json, in both languages", () => {
  for (const lang of ["hy", "en"]) {
    assert.ok(WORDS.bench.alt[lang].trim(), "bench.alt." + lang);
    for (const part of PARTS) assert.ok(WORDS.bench.parts[part][lang].trim(), part + "." + lang);
  }
});

test("built while hidden: one loop, no frame asked for, the canvas described", () => {
  const { browser } = setup("en");
  const section = laserSection();
  sectionReady(browser, "laser", section.container, WORDS);
  assert.equal(browser.window.LaserUI.loop.liveCount(), 1);
  assert.equal(browser.pendingFrames(), 0);
  assert.equal(section.canvas.getAttribute("data-running"), "false");
  assert.equal(section.canvas.getAttribute("aria-label"), WORDS.bench.alt.en);
  assert.deepEqual(section.recorder.calls, [], "nothing drawn into a hidden canvas");
});

test("on screen: the still bench is drawn with the page's words, and nothing runs", () => {
  for (const lang of ["hy", "en"]) {
    const { browser } = setup(lang);
    const section = laserSection(600);
    sectionReady(browser, "laser", section.container, WORDS);
    assert.equal(section.canvas.getAttribute("aria-label"), WORDS.bench.alt[lang]);
    browser.setOnScreen(section.canvas, true);
    // Nothing moves yet (stage 6 adds Play), so no frame is asked for.
    assert.equal(browser.pendingFrames(), 0, lang);
    assert.equal(section.canvas.getAttribute("data-running"), "false");
    assert.deepEqual(texts(section.recorder).sort(),
      // Array.from: PARTS is an array of the sandbox, which deepEqual
      // would call different from a Node array (helpers.js, plain()).
      Array.from(browser.window.LaserUI.bench.PARTS, (part) => WORDS.bench.parts[part][lang]).sort(), lang);
    // The canvas has the bench's own proportions.
    const SIZE = browser.window.LaserUI.bench.SIZE;
    const expected = Math.max(SIZE.minHeight, Math.min(600 / SIZE.aspect, SIZE.maxHeight));
    assert.equal(section.canvas.style.height, expected + "px");
  }
});

test("language switch, twice: rebuilt each time, one loop and one set of listeners", () => {
  const { browser } = setup("en");
  const first = laserSection(600);
  sectionReady(browser, "laser", first.container, WORDS);
  browser.setOnScreen(first.canvas, true);
  const resizeListeners = browser.listenerCount("resize");
  const themeListeners = browser.listenerCount("theme:changed");

  browser.window.Site.lang = "hy";
  const second = laserSection(600);
  sectionReady(browser, "laser", second.container, WORDS);
  browser.window.Site.lang = "en";
  const third = laserSection(600);
  sectionReady(browser, "laser", third.container, WORDS);

  assert.equal(browser.window.LaserUI.loop.liveCount(), 1);
  assert.equal(browser.listenerCount("resize"), resizeListeners);
  assert.equal(browser.listenerCount("theme:changed"), themeListeners);
  assert.equal(first.canvas.getAttribute("data-running"), "false");
  // Only the newest build still draws.
  for (const old of [first, second, third]) old.recorder.calls.length = 0;
  switchTheme(browser);
  assert.deepEqual(first.recorder.calls, [], "the first build is gone");
  assert.deepEqual(second.recorder.calls, [], "the second build is gone");
  assert.ok(texts(third.recorder).includes(WORDS.bench.parts.medium.en));
  assert.equal(third.canvas.getAttribute("aria-label"), WORDS.bench.alt.en);
  // The old canvases' observers hear nothing either.
  browser.setOnScreen(first.canvas, true);
  browser.setOnScreen(second.canvas, true);
  assert.deepEqual(first.recorder.calls, []);
});

test("other pages are ignored: nothing built, the laser page left alive", () => {
  const { browser } = setup("en");
  const section = laserSection(600);
  sectionReady(browser, "laser", section.container, WORDS);
  for (const route of ["lab", "labs", "home", "post"]) {
    sectionReady(browser, route, laserSection(600).container, {});
  }
  assert.equal(browser.window.LaserUI.loop.liveCount(), 1);
  section.recorder.calls.length = 0;
  switchTheme(browser);
  assert.ok(texts(section.recorder).length > 0, "the laser loop was not taken down");
});

test("a laser section without its canvas (a page that failed to load): the old build goes, nothing breaks", () => {
  const { browser } = setup("en");
  const section = laserSection(600);
  sectionReady(browser, "laser", section.container, WORDS);
  browser.setOnScreen(section.canvas, true);
  sectionReady(browser, "laser", fakeContainer({}), WORDS);
  assert.equal(browser.window.LaserUI.loop.liveCount(), 0);
  assert.equal(browser.pendingFrames(), 0);
  assert.equal(browser.listenerCount("resize"), 0);
  assert.equal(browser.listenerCount("theme:changed"), 0);
});

test("the picture's name: its description, else the page title, else hidden from screen readers", () => {
  const { browser } = setup("en");
  const noAlt = JSON.parse(JSON.stringify(WORDS));
  delete noAlt.bench.alt;
  const titled = laserSection(600);
  sectionReady(browser, "laser", titled.container, noAlt);
  assert.equal(titled.canvas.getAttribute("aria-label"), WORDS.page.title.en);
  assert.equal(titled.canvas.getAttribute("aria-hidden"), null);

  const bare = laserSection(600);
  bare.canvas.setAttribute("aria-label", "left over");
  sectionReady(browser, "laser", bare.container, {});
  assert.equal(bare.canvas.getAttribute("aria-label"), null, "no empty name");
  assert.equal(bare.canvas.getAttribute("aria-hidden"), "true");

  const named = laserSection(600);
  named.canvas.setAttribute("aria-hidden", "true");
  sectionReady(browser, "laser", named.container, WORDS);
  assert.equal(named.canvas.getAttribute("aria-hidden"), null, "a named picture is not hidden");
});

test("words missing from the data: the page still builds, with no 'undefined' anywhere", () => {
  const { browser } = setup("en");
  const section = laserSection(600);
  sectionReady(browser, "laser", section.container, {});
  assert.equal(browser.window.LaserUI.loop.liveCount(), 1);
  browser.setOnScreen(section.canvas, true);
  switchTheme(browser);
  assert.deepEqual(texts(section.recorder), [], "no labels to write");
});

// ---------------------------------------------------------------------------
// js/router.js loads before page.js and the other page scripts (index.html).
// While a later script is still downloading, the browser can already finish
// the router's fetches; a page built then fires "section:ready" before
// page.js listens, and the bench is never drawn (found in the browser in
// stage 5, when the laser files were downloaded fresh). So the router must
// wait for DOMContentLoaded, which fires only after every <script> at the
// end of <body> has run.

// Runs js/router.js in a sandbox with just enough of a browser to start.
// Its first step, once it starts, is to look for #app; it finds none here,
// so it stops there and `looked` shows whether and when it started.
function startRouter(readyState) {
  const documentListeners = {};
  const looked = [];
  const sandbox = {
    Site: { ready: Promise.resolve({ nav: [] }) },
    document: {
      readyState: readyState,
      addEventListener(type, listener) {
        if (!documentListeners[type]) documentListeners[type] = [];
        documentListeners[type].push(listener);
      },
      getElementById(id) {
        looked.push(id);
        return null;
      }
    },
    addEventListener() {}
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  const file = path.join(ROOT, "js", "router.js");
  vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file });
  return { documentListeners: documentListeners, looked: looked };
}

// Lets every promise callback that is ready run.
function settle() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("the router builds the first page only after every script on the page has run", async () => {
  const { documentListeners, looked } = startRouter("loading");
  await settle();
  assert.deepEqual(looked, [], "nothing built while index.html is still being read");
  const listeners = documentListeners.DOMContentLoaded || [];
  assert.equal(listeners.length, 1);
  listeners[0]();
  await settle();
  assert.deepEqual(looked, ["app"]);
});

test("the router starts at once if the page has already been read", async () => {
  const { looked } = startRouter("interactive");
  await settle();
  assert.deepEqual(looked, ["app"]);
});
