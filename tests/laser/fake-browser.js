/* ============================================================================
   fake-browser.js — a very small browser for the laser page tests.

   js/laser/ui/*.js and js/laser/page.js run in a browser, but their
   lifecycle (start the drawing loop only while the canvas is on screen,
   take everything down before the page is built again) is exactly where
   mistakes hide. So the tests run the real files inside a Node "vm"
   sandbox that has just enough of a browser for them, and every part of
   it is controlled by the test:

     frames            requestAnimationFrame only queues; runFrame(ms) runs them
     on screen         an IntersectionObserver only reports when the test
                       says so: setOnScreen(canvas, true)
     sizes             a canvas box has the width the test gives it;
                       resizeBox(box, 600) also tells the ResizeObservers
     window events     addEventListener is counted, so a test can check that
                       a teardown removed everything it added
     elements          attributes, textContent, value, hidden, and their own
                       listeners: fire("click") runs them, listenerCount counts
     colours           getComputedStyle reads the CSS variables of
                       css/style.css (dark theme unless the test sets others)
     2D context        records every method call and every property set

   Not a test file itself; fake-browser.test.js tests it.
   ========================================================================== */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { ROOT } = require("./helpers.js");

/* ---------- the CSS variables of the two themes ---------- */

// The text between the braces of the first rule whose selector is exactly
// `selector` (":root" or ":root.theme-light"), comments removed.
function ruleBody(css, selector) {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = pattern.exec(bare)) !== null) {
    if (match[1].trim() === selector) return match[2];
  }
  throw new Error("css/style.css has no rule for " + selector);
}

// { "--bg": "#070b1a", ... } for one rule body.
function variablesIn(body) {
  const found = {};
  const pattern = /(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g;
  let match;
  while ((match = pattern.exec(body)) !== null) found[match[1]] = match[2].trim();
  return found;
}

// The variables of both themes, read from the project's css/style.css.
// The light theme only overrides some of them; `light` here is the full
// set the browser sees (the dark values with the light ones on top).
function themeVariables() {
  const css = fs.readFileSync(path.join(ROOT, "css", "style.css"), "utf8");
  const dark = variablesIn(ruleBody(css, ":root"));
  const lightOnly = variablesIn(ruleBody(css, ":root.theme-light"));
  return { dark: dark, lightOnly: lightOnly, light: Object.assign({}, dark, lightOnly) };
}

/* ---------- elements ---------- */

// An element: attributes, text, a value (for sliders), `hidden`, and its
// own event listeners. fire("input") or fire("click") calls them as the
// browser would; listenerCount(type) lets a test check a teardown.
function fakeElement(tag) {
  const attributes = new Map();
  const listeners = new Map();          // event type -> [listener]
  const element = {
    tagName: String(tag).toUpperCase(),
    style: {},
    textContent: "",
    value: "",
    hidden: false,
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.has(name) ? attributes.get(name) : null; },
    hasAttribute(name) { return attributes.has(name); },
    removeAttribute(name) { attributes.delete(name); },
    // A listener added twice is kept once, as in a real browser.
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      const list = listeners.get(type);
      if (!list.includes(listener)) list.push(listener);
    },
    removeEventListener(type, listener) {
      const list = listeners.get(type) || [];
      const index = list.indexOf(listener);
      if (index !== -1) list.splice(index, 1);
    },
    fire(type) {
      const event = { type: type, target: element, preventDefault() {} };
      for (const listener of (listeners.get(type) || []).slice()) listener.call(element, event);
    },
    listenerCount(type) { return (listeners.get(type) || []).length; }
  };
  return element;
}

// A 2D context that records what is done to it.
//   calls  [{ name, args }]   every method call, in order
//   sets   [{ name, value }]  every property set, in order
//   log    both together, in the order they happened:
//          [{ call: name, args }] and [{ set: name, value }], plus
//          { reset: true } when its canvas was resized (see fakeCanvas)
function fakeContext() {
  const calls = [];
  const sets = [];
  const log = [];
  const values = {};
  const context = new Proxy(values, {
    get(target, name) {
      if (typeof name === "symbol") return undefined;
      if (Object.prototype.hasOwnProperty.call(target, name)) return target[name];
      return function () {
        const args = Array.from(arguments);
        calls.push({ name: name, args: args });
        log.push({ call: name, args: args });
      };
    },
    set(target, name, value) {
      target[name] = value;
      sets.push({ name: name, value: value });
      log.push({ set: name, value: value });
      return true;
    }
  });
  // What a browser does to the context when its canvas is resized: every
  // setting (transform, colours, font, ...) back to the start.
  function reset() {
    for (const name of Object.keys(values)) delete values[name];
    log.push({ reset: true });
  }
  return { context: context, calls: calls, sets: sets, log: log, reset: reset };
}

// A canvas inside a box with a 1 px border, like .laser-bench. box.width
// is the inside of the box (what clientWidth reports, and what the canvas
// fills); getBoundingClientRect counts the border too, as in a browser.
// The canvas starts at the browser's default 300 × 150. Setting its width
// or height resets the context, as in a browser, so a test can check that
// the scale is set after the resize, not before.
const BOX_BORDER = 1;
function fakeCanvas(boxWidth) {
  const box = fakeElement("div");
  box.width = boxWidth;
  Object.defineProperty(box, "clientWidth", { get() { return box.width; } });
  box.getBoundingClientRect = function () {
    const outer = box.width ? box.width + 2 * BOX_BORDER : 0;
    return { width: outer, height: 0, top: 0, left: 0, right: outer, bottom: 0 };
  };
  const canvas = fakeElement("canvas");
  const recorder = fakeContext();
  const pixels = { width: 300, height: 150 };
  for (const side of ["width", "height"]) {
    Object.defineProperty(canvas, side, {
      get() { return pixels[side]; },
      set(value) {
        pixels[side] = value;
        recorder.reset();
      }
    });
  }
  canvas.parentNode = box;
  canvas.getContext = function (kind) { return kind === "2d" ? recorder.context : null; };
  return { canvas: canvas, box: box, recorder: recorder };
}

// A section container: querySelector answers from a table the test fills.
function fakeContainer(bySelector) {
  const element = fakeElement("section");
  element.querySelector = function (selector) {
    return Object.prototype.hasOwnProperty.call(bySelector, selector) ? bySelector[selector] : null;
  };
  return element;
}

/* ---------- the browser ---------- */

// options:
//   cssVariables      the CSS variables getComputedStyle sees (default: the
//                     dark theme of css/style.css)
//   devicePixelRatio  default 1
//   reducedMotion     true: the visitor asked for less motion
//   noObservers       true: a browser without IntersectionObserver and
//                     ResizeObserver
function createBrowser(options) {
  const opts = options || {};
  const listeners = new Map();          // event type -> [listener]
  let frames = new Map();               // frame id -> callback
  let running = new Map();              // the frames runFrame is running now
  let nextFrameId = 1;
  const intersectionObservers = [];
  const resizeObservers = [];
  let css = Object.assign({}, opts.cssVariables || themeVariables().dark);

  function observerClass(list) {
    return class FakeObserver {
      constructor(callback, observerOptions) {
        this.callback = callback;
        this.options = observerOptions;
        this.targets = [];
        this.disconnected = false;
        list.push(this);
      }
      observe(target) { if (!this.targets.includes(target)) this.targets.push(target); }
      unobserve(target) { this.targets = this.targets.filter((t) => t !== target); }
      disconnect() { this.targets = []; this.disconnected = true; }
    };
  }

  const window = {
    devicePixelRatio: opts.devicePixelRatio || 1,
    document: { documentElement: fakeElement("html") },

    // A listener added twice is kept once, as in a real browser.
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      const list = listeners.get(type);
      if (!list.includes(listener)) list.push(listener);
    },
    removeEventListener(type, listener) {
      const list = listeners.get(type) || [];
      const index = list.indexOf(listener);
      if (index !== -1) list.splice(index, 1);
    },
    dispatchEvent(event) {
      for (const listener of (listeners.get(event.type) || []).slice()) listener.call(window, event);
      return true;
    },
    CustomEvent: class FakeCustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init ? init.detail : undefined;
      }
    },

    requestAnimationFrame(callback) {
      const id = nextFrameId;
      nextFrameId += 1;
      frames.set(id, callback);
      return id;
    },
    // A frame cancelled by an earlier callback of the same batch does not
    // run either, as in a browser.
    cancelAnimationFrame(id) {
      frames.delete(id);
      running.delete(id);
    },

    matchMedia(query) {
      return { media: query, matches: !!opts.reducedMotion && query.includes("prefers-reduced-motion") };
    },
    getComputedStyle() {
      return {
        getPropertyValue(name) { return Object.prototype.hasOwnProperty.call(css, name) ? " " + css[name] : ""; }
      };
    }
  };
  if (!opts.noObservers) {
    window.IntersectionObserver = observerClass(intersectionObservers);
    window.ResizeObserver = observerClass(resizeObservers);
  }
  // Browser scripts written as (function (global) { ... })(window) need this.
  window.window = window;
  vm.createContext(window);
  // What the sandbox had before any project file ran, to tell which globals
  // a file adds.
  const startingGlobals = Object.keys(window);

  return {
    window: window,

    // Runs a project file (path relative to the project root) in the sandbox.
    load(relativePath) {
      const fullPath = path.join(ROOT, relativePath);
      vm.runInContext(fs.readFileSync(fullPath, "utf8"), window, { filename: fullPath });
    },

    // The globals the project files added.
    addedGlobals() {
      return Object.keys(window).filter((name) => !startingGlobals.includes(name));
    },

    // Runs the frames requested so far, at time `ms` (what the browser
    // passes to the callback). A frame requested while running waits for
    // the next runFrame, as in a browser.
    runFrame(ms) {
      running = frames;
      frames = new Map();
      try {
        // A Map visits what is still in it, so a frame cancelled meanwhile
        // is skipped.
        for (const callback of running.values()) callback(ms);
      } finally {
        running = new Map();
      }
    },
    pendingFrames() { return frames.size; },

    // Reports a target coming on or going off screen to every observer
    // that watches it.
    setOnScreen(target, onScreen) {
      for (const observer of intersectionObservers) {
        if (observer.targets.includes(target)) {
          observer.callback([{ target: target, isIntersecting: !!onScreen }], observer);
        }
      }
    },
    // Gives a box a new width and tells every ResizeObserver that watches it.
    resizeBox(box, width) {
      box.width = width;
      for (const observer of resizeObservers) {
        if (observer.targets.includes(box)) observer.callback([{ target: box }], observer);
      }
    },
    intersectionObservers: intersectionObservers,
    resizeObservers: resizeObservers,

    listenerCount(type) { return (listeners.get(type) || []).length; },
    setCssVariables(next) { css = Object.assign({}, next); }
  };
}

module.exports = {
  themeVariables,
  fakeElement,
  fakeContext,
  fakeCanvas,
  fakeContainer,
  createBrowser
};
