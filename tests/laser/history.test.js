/* ============================================================================
   history.test.js — js/laser/ui/history.js, the plot's memory: the newest
   points of the simulation, in simulated seconds (not pixels, so a resize
   or a new slow-motion setting needs nothing recomputed), in a buffer of
   fixed size so a long visit never grows it (docs/laser-plan.md, stage 6).
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { plain } = require("./helpers.js");
const { createBrowser } = require("./fake-browser.js");

const browser = createBrowser();
browser.load("js/laser/ui/history.js");
const H = browser.window.LaserUI.history;

function times(points) {
  return Array.from(points, (point) => point.t);
}

test("loads as LaserUI.history, frozen, adding only LaserUI", () => {
  assert.ok(Object.isFrozen(H));
  assert.deepEqual(browser.addedGlobals(), ["LaserUI"]);
});

test("keeps the points in time order, as plain { t, P } objects", () => {
  const h = H.create(10);
  h.push(1, 0.5);
  h.push(2, 0.7);
  assert.equal(h.size(), 2);
  assert.deepEqual(plain(h.points(-Infinity)), [{ t: 1, P: 0.5 }, { t: 2, P: 0.7 }]);
  assert.deepEqual(plain(h.last()), { t: 2, P: 0.7 });
});

test("a full buffer drops the oldest point, whatever the number of laps", () => {
  const h = H.create(4);
  for (let i = 1; i <= 11; i++) h.push(i, i);
  assert.equal(h.size(), 4);
  assert.deepEqual(times(h.points(-Infinity)), [8, 9, 10, 11]);
  assert.equal(h.last().t, 11);
});

test("points(from): only the points at or after that time", () => {
  const h = H.create(8);
  for (let i = 1; i <= 11; i++) h.push(i, 0);
  assert.deepEqual(times(h.points(9)), [9, 10, 11]);
  assert.deepEqual(times(h.points(9.5)), [10, 11]);
  assert.deepEqual(times(h.points(100)), []);
});

test("points() hands out copies: changing them does not change the history", () => {
  const h = H.create(3);
  h.push(1, 2);
  const points = h.points(-Infinity);
  points[0].P = 99;
  points.length = 0;
  assert.equal(h.points(-Infinity)[0].P, 2);
});

test("clear() empties it; last() of an empty history is null", () => {
  const h = H.create(3);
  h.push(1, 2);
  h.clear();
  assert.equal(h.size(), 0);
  assert.deepEqual(times(h.points(-Infinity)), []);
  assert.equal(h.last(), null);
  h.push(5, 0);
  assert.deepEqual(times(h.points(-Infinity)), [5]);
});

test("refuses a size it cannot use", () => {
  for (const capacity of [0, -1, 2.5, NaN, "10"]) {
    assert.throws(() => H.create(capacity), /LaserUI\.history\.create/, String(capacity));
  }
});
