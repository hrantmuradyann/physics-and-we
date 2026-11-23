/* ============================================================================
   axis.test.js — js/laser/ui/axis.js: where a chart's axis puts its ticks
   and what it writes beside them (docs/laser-plan.md, stage 6b).

   A scientific chart is only as good as its axes: ticks at round values
   (1, 2 or 5 times a power of ten), labels that tell neighbouring ticks
   apart, one unit for the whole axis, and no rounding noise such as
   0.30000000000000004.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { assertClose } = require("./helpers.js");
const { createBrowser } = require("./fake-browser.js");

const browser = createBrowser();
browser.load("js/laser/ui/format.js");
const globalsBefore = browser.addedGlobals();
browser.load("js/laser/ui/axis.js");
const A = browser.window.LaserUI.axis;

function list(values) {
  return Array.from(values);
}

// step / 10^k for the power of ten just below it: 1, 2 or 5 for a good step.
function leadingDigit(step) {
  const power = Math.floor(Math.log10(step) + 1e-9);
  return Math.round(step / Number("1e" + power));
}

test("loads as LaserUI.axis, frozen, adding no global of its own", () => {
  assert.ok(Object.isFrozen(A));
  assert.deepEqual(browser.addedGlobals(), globalsBefore);
});

test("ticks: round values inside the range, about as many as asked for", () => {
  assert.deepEqual(list(A.ticks(0, 2, 4).values), [0, 0.5, 1, 1.5, 2]);
  assert.equal(A.ticks(0, 2, 4).step, 0.5);
  assert.deepEqual(list(A.ticks(0, 10, 5).values), [0, 2, 4, 6, 8, 10]);
  assert.deepEqual(list(A.ticks(0, 29, 4).values), [0, 10, 20]);
  // A time window in the middle of a run: 1.234 ms to 1.734 ms.
  assert.deepEqual(list(A.ticks(1.234e-3, 1.734e-3, 5).values), [1.3e-3, 1.4e-3, 1.5e-3, 1.6e-3, 1.7e-3]);
  assert.deepEqual(list(A.ticks(-1, 1, 4).values), [-1, -0.5, 0, 0.5, 1]);
});

test("ticks: no rounding noise in the values (0.3, not 0.30000000000000004)", () => {
  assert.deepEqual(list(A.ticks(0, 0.5, 5).values), [0, 0.1, 0.2, 0.3, 0.4, 0.5]);
  assert.deepEqual(list(A.ticks(0, 7e-7, 7).values), [0, 1e-7, 2e-7, 3e-7, 4e-7, 5e-7, 6e-7, 7e-7]);
});

test("ticks: the step is 1, 2 or 5 times a power of ten, for every size of range", () => {
  for (let power = -12; power <= 9; power++) {
    for (const factor of [1, 1.3, 2, 2.7, 3.3, 5, 6.1, 7.77, 9.99]) {
      for (const count of [3, 4, 5, 8]) {
        const max = factor * Number("1e" + power);
        const t = A.ticks(0, max, count);
        assert.ok([1, 2, 5].includes(leadingDigit(t.step)), "step " + t.step + " for 0.." + max);
        // Between half and two and a half times the number asked for.
        assert.ok(t.values.length >= count / 2 && t.values.length <= 2.5 * count + 1,
          t.values.length + " ticks for 0.." + max + " (asked " + count + ")");
        for (const value of t.values) {
          assert.ok(value >= -1e-12 * max && value <= max * (1 + 1e-9), value + " outside 0.." + max);
          const multiple = value / t.step;
          assert.ok(Math.abs(multiple - Math.round(multiple)) < 1e-6, value + " is not a multiple of " + t.step);
        }
      }
    }
  }
});

test("ticks: a small window far from zero (late in a long run) still gets its ticks", () => {
  // 5 µs shown after 2 s of simulated time.
  const t = A.ticks(2, 2.000005, 5);
  assert.equal(t.step, 1e-6);
  assert.equal(t.values.length, 6);
  assertClose(t.values[1] - t.values[0], 1e-6, 1e-6, "spacing");
});

test("ticks: refuses a range it cannot divide, naming itself", () => {
  for (const [min, max, count] of [[1, 1, 4], [2, 1, 4], [NaN, 1, 4], [0, Infinity, 4], [0, 1, 0], [0, 1, NaN], ["0", 1, 4]]) {
    assert.throws(() => A.ticks(min, max, count), /^Error: LaserUI\.axis\.ticks: /, [min, max, count].join(", "));
  }
});

test("fromZero: the axis ends on the first tick at or above the largest value", () => {
  const cases = [
    [1.72, 4, 2, 0.5],
    [2, 4, 2, 0.5],
    [2.01, 4, 3, 1],                 // 2.01 / 4 is just above 0.5, so the step is 1
    [29, 4, 30, 10],
    [0.74, 4, 0.8, 0.2],
    [3.3e-8, 4, 4e-8, 1e-8]
  ];
  for (const [max, count, top, step] of cases) {
    const axis = A.fromZero(max, count);
    assert.equal(axis.top, top, "top for " + max);
    assert.equal(axis.step, step, "step for " + max);
    assert.equal(axis.values[0], 0);
    assert.equal(axis.values[axis.values.length - 1], top, "the last tick is the top");
  }
  for (const bad of [0, -1, NaN, Infinity]) {
    assert.throws(() => A.fromZero(bad, 4), /^Error: LaserUI\.axis\.fromZero: /, String(bad));
  }
});

test("labels: one prefix for the whole axis, the decimals the step needs, the same on every tick", () => {
  const power = A.fromZero(1.72, 4);
  const watts = A.labels(power.values, power.step, "W");
  assert.deepEqual(list(watts.texts), ["0.0", "0.5", "1.0", "1.5", "2.0"]);
  assert.equal(watts.unit, "W");

  const small = A.fromZero(0.0074, 4);                     // 7.4 mW
  const milli = A.labels(small.values, small.step, "W");
  assert.deepEqual(list(milli.texts), ["0", "2", "4", "6", "8"]);
  assert.equal(milli.unit, "10⁻³\u00a0W");

  const time = A.ticks(1.234e-3, 1.734e-3, 5);
  const ms = A.labels(time.values, time.step, "s");
  assert.deepEqual(list(ms.texts), ["1.3", "1.4", "1.5", "1.6", "1.7"]);
  assert.equal(ms.unit, "10⁻³\u00a0s");

  // Late in a run the labels still tell neighbours apart.
  const late = A.ticks(0.1234561, 0.1234611, 5);
  const lateLabels = A.labels(late.values, late.step, "s");
  assert.equal(new Set(lateLabels.texts).size, lateLabels.texts.length, lateLabels.texts.join(" "));
  assert.equal(lateLabels.texts[0], "123.457");
  assert.equal(lateLabels.unit, "10⁻³\u00a0s");
});

test("labels: a number without a unit gets no prefix; negative values use the minus sign", () => {
  const axis = A.fromZero(0.004, 4);
  const plain = A.labels(axis.values, axis.step, "");
  assert.deepEqual(list(plain.texts), ["0.000", "0.001", "0.002", "0.003", "0.004"]);
  assert.equal(plain.unit, "");
  const signed = A.ticks(-1, 1, 4);
  assert.deepEqual(list(A.labels(signed.values, signed.step, "V").texts), ["−1.0", "−0.5", "0.0", "0.5", "1.0"]);
});

test("labels: never 'NaN', 'undefined' or an exponent, for every size of axis", () => {
  for (let power = -14; power <= 11; power++) {
    const axis = A.fromZero(3.3 * Number("1e" + power), 4);
    const labels = A.labels(axis.values, axis.step, "W");
    for (const text of labels.texts) {
      assert.ok(/^[0-9]+(\.[0-9]+)?$/.test(text), "10^" + power + ": " + text);
      assert.ok(text.length <= 8, "10^" + power + ": " + text);
    }
    assert.equal(new Set(labels.texts).size, labels.texts.length, labels.texts.join(" "));
  }
});

test("valueText: a value in the axis's own unit, with extra decimals", () => {
  const axis = A.fromZero(1.72, 4);
  const labels = A.labels(axis.values, axis.step, "W");
  assert.equal(A.valueText(1.7151, labels, 1), "1.72");
  assert.equal(A.valueText(1.7151, labels, 0), "1.7");
  assert.equal(A.valueText(1e-8, labels, 1), "0.00");
  assert.equal(A.valueText(-0.25, labels, 1), "−0.25");
  const small = A.fromZero(0.0074, 4);
  assert.equal(A.valueText(0.00512, A.labels(small.values, small.step, "W"), 1), "5.1");
  assert.equal(A.valueText(NaN, labels, 1), "—");
});
