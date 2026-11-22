/* ============================================================================
   fake-browser.test.js — the small fake browser the page tests run in.

   A fake that reported "on screen" by itself, ran frames on its own or
   forgot a listener would make the loop and page tests pass for the wrong
   reason. These tests pin down what it does.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  THEMES, themeVariables, fakeElement, fakeContext, fakeCanvas, fakeContainer, createBrowser
} = require("./fake-browser.js");

test("theme variables: the site's colours come from css/style.css's :root", () => {
  const themes = themeVariables();
  assert.deepEqual(Object.keys(themes), THEMES);
  assert.equal(themes.site["--accent"], "var(--red)");
  assert.equal(themes.site["--laser-bg"], "#fafafa");
  // A value with commas and brackets is read whole.
  assert.equal(themes.site["--canvas-line"], "rgba(0, 0, 0, 0.30)");
});

test("frames run only when the test says so, once each", () => {
  const browser = createBrowser();
  const times = [];
  browser.window.requestAnimationFrame((ms) => times.push(ms));
  assert.equal(browser.pendingFrames(), 1);
  assert.deepEqual(times, []);
  browser.runFrame(16);
  assert.deepEqual(times, [16]);
  browser.runFrame(32);
  assert.deepEqual(times, [16], "a frame runs once");
});

test("a frame requested inside a frame waits for the next one; a cancelled one never runs", () => {
  const browser = createBrowser();
  const times = [];
  function step(ms) {
    times.push(ms);
    browser.window.requestAnimationFrame(step);
  }
  browser.window.requestAnimationFrame(step);
  browser.runFrame(10);
  browser.runFrame(20);
  assert.deepEqual(times, [10, 20]);
  const id = browser.window.requestAnimationFrame(() => times.push("cancelled"));
  browser.window.cancelAnimationFrame(id);
  browser.runFrame(30);
  assert.deepEqual(times, [10, 20, 30]);
});

test("a frame cancelled by an earlier frame of the same batch does not run", () => {
  const browser = createBrowser();
  const ran = [];
  let second = null;
  browser.window.requestAnimationFrame(() => {
    ran.push("first");
    browser.window.cancelAnimationFrame(second);
  });
  second = browser.window.requestAnimationFrame(() => ran.push("second"));
  browser.runFrame(10);
  assert.deepEqual(ran, ["first"]);
  assert.equal(browser.pendingFrames(), 0);
});

test("resizing a canvas resets its context, as in a browser", () => {
  const { canvas, recorder } = fakeCanvas(100);
  const g = canvas.getContext("2d");
  g.fillStyle = "x";
  g.setTransform(2, 0, 0, 2, 0, 0);
  canvas.width = 200;
  assert.equal(canvas.width, 200);
  assert.notEqual(g.fillStyle, "x", "settings back to the start");
  assert.deepEqual(recorder.log.map((e) => e.reset ? "reset" : e.call || e.set),
    ["fillStyle", "setTransform", "reset"]);
  canvas.height = 80;
  assert.equal(canvas.height, 80);
  assert.equal(recorder.log[recorder.log.length - 1].reset, true);
});

test("observers report only for the targets they watch, and only when told", () => {
  const browser = createBrowser();
  const { canvas, box } = fakeCanvas(500);
  const seen = [];
  const sizes = [];
  const intersection = new browser.window.IntersectionObserver((entries) => {
    for (const entry of entries) seen.push(entry.isIntersecting);
  });
  const resize = new browser.window.ResizeObserver(() => sizes.push(box.clientWidth));
  browser.setOnScreen(canvas, true);
  browser.resizeBox(box, 400);
  assert.deepEqual(seen, [], "not watching yet");
  assert.deepEqual(sizes, []);
  intersection.observe(canvas);
  resize.observe(box);
  browser.setOnScreen(canvas, true);
  browser.setOnScreen(canvas, false);
  browser.resizeBox(box, 640);
  assert.deepEqual(seen, [true, false]);
  assert.deepEqual(sizes, [640]);
  intersection.disconnect();
  resize.disconnect();
  browser.setOnScreen(canvas, true);
  browser.resizeBox(box, 700);
  assert.deepEqual(seen, [true, false], "a disconnected observer hears nothing");
  assert.deepEqual(sizes, [640]);
  assert.equal(intersection.disconnected, true);
});

test("window listeners are counted; adding the same one twice keeps one", () => {
  const browser = createBrowser();
  const heard = [];
  const listener = (event) => heard.push(event.detail);
  browser.window.addEventListener("theme:changed", listener);
  browser.window.addEventListener("theme:changed", listener);
  assert.equal(browser.listenerCount("theme:changed"), 1);
  browser.window.dispatchEvent(new browser.window.CustomEvent("theme:changed", { detail: "light" }));
  assert.deepEqual(heard, ["light"]);
  browser.window.removeEventListener("theme:changed", listener);
  assert.equal(browser.listenerCount("theme:changed"), 0);
});

test("getComputedStyle reads the CSS variables, with the leading space a browser keeps", () => {
  const browser = createBrowser();
  const style = browser.window.getComputedStyle(browser.window.document.documentElement);
  assert.equal(style.getPropertyValue("--accent"), " var(--red)");
  assert.equal(style.getPropertyValue("--no-such-variable"), "");
  browser.setCssVariables(Object.assign({}, themeVariables().site, { "--accent": "#c0603a" }));
  assert.equal(style.getPropertyValue("--accent"), " #c0603a");
});

test("the recording context keeps calls and property sets in order", () => {
  const recorder = fakeContext();
  recorder.context.fillStyle = "red";
  recorder.context.fillRect(1, 2, 3, 4);
  assert.equal(recorder.context.fillStyle, "red");
  assert.deepEqual(recorder.calls, [{ name: "fillRect", args: [1, 2, 3, 4] }]);
  assert.deepEqual(recorder.sets, [{ name: "fillStyle", value: "red" }]);
  assert.deepEqual(recorder.log, [
    { set: "fillStyle", value: "red" },
    { call: "fillRect", args: [1, 2, 3, 4] }
  ]);
});

test("a canvas has its box as parent; a container answers only what it was given", () => {
  const { canvas, box } = fakeCanvas(320);
  assert.equal(canvas.parentNode, box);
  assert.equal(box.clientWidth, 320, "the inside of the box");
  assert.equal(box.getBoundingClientRect().width, 322, "with its 1 px border on each side");
  box.width = 0;
  assert.equal(box.getBoundingClientRect().width, 0, "a hidden box has no size at all");
  assert.equal(canvas.getContext("webgl"), null);
  const container = fakeContainer({ "[data-x]": canvas });
  assert.equal(container.querySelector("[data-x]"), canvas);
  assert.equal(container.querySelector("[data-y]"), null);
});

test("a file run in the sandbox sees the fake window; addedGlobals names what it added", () => {
  const browser = createBrowser({ devicePixelRatio: 2 });
  assert.deepEqual(browser.addedGlobals(), []);
  browser.window.LaserUI = {};
  assert.deepEqual(browser.addedGlobals(), ["LaserUI"]);
  assert.equal(browser.window.devicePixelRatio, 2);
  assert.equal(createBrowser({ noObservers: true }).window.IntersectionObserver, undefined);
  assert.equal(createBrowser({ reducedMotion: true }).window
    .matchMedia("(prefers-reduced-motion: reduce)").matches, true);
  assert.equal(createBrowser().window.matchMedia("(prefers-reduced-motion: reduce)").matches, false);
});

test("an element keeps its own listeners: fire() runs them, removing one stops it, twice is kept once", () => {
  const element = fakeElement("button");
  assert.equal(element.textContent, "");
  assert.equal(element.value, "");
  assert.equal(element.hidden, false);
  const heard = [];
  const listener = function (event) { heard.push([event.type, event.target === element, this === element]); };
  element.addEventListener("click", listener);
  element.addEventListener("click", listener);
  assert.equal(element.listenerCount("click"), 1);
  element.fire("click");
  element.fire("input");
  assert.deepEqual(heard, [["click", true, true]]);
  element.removeEventListener("click", listener);
  assert.equal(element.listenerCount("click"), 0);
  element.fire("click");
  assert.equal(heard.length, 1);
});

test("fire() can carry what the browser puts on an event; scrollIntoView is recorded", () => {
  const element = fakeElement("canvas");
  const seen = [];
  element.addEventListener("pointermove", (event) => seen.push([event.type, event.offsetX, event.target === element]));
  element.fire("pointermove", { offsetX: 200 });
  element.fire("pointermove");
  assert.deepEqual(seen, [["pointermove", 200, true], ["pointermove", undefined, true]]);
  assert.deepEqual(element.scrolledTo, []);
  element.scrollIntoView({ behavior: "smooth", block: "start" });
  assert.deepEqual(element.scrolledTo, [{ behavior: "smooth", block: "start" }]);
  // Each element has its own record.
  assert.deepEqual(fakeElement("div").scrolledTo, []);
});

test("children: document.createElement, appendChild, removeChild and firstChild, as in a browser", () => {
  const browser = createBrowser();
  const select = browser.window.document.createElement("select");
  assert.equal(select.tagName, "SELECT");
  assert.equal(select.firstChild, null);
  const a = browser.window.document.createElement("option");
  const b = browser.window.document.createElement("option");
  assert.equal(select.appendChild(a), a);
  select.appendChild(b);
  assert.deepEqual(select.children, [a, b]);
  assert.equal(select.firstChild, a);
  assert.equal(a.parentNode, select);
  // Each element has its own list of children.
  assert.deepEqual(a.children, []);
  // Moving an element to another parent takes it from the first.
  const other = fakeElement("select");
  other.appendChild(a);
  assert.deepEqual(select.children, [b]);
  assert.equal(a.parentNode, other);
  // Emptying one, the way page.js does.
  while (select.firstChild) select.removeChild(select.firstChild);
  assert.deepEqual(select.children, []);
  assert.equal(b.parentNode, null);
  assert.throws(() => select.removeChild(b), /not a child/);
  // A canvas is its box's child.
  const parts = fakeCanvas(300);
  assert.deepEqual(parts.box.children, [parts.canvas]);
});
