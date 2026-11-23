/* ============================================================================
   format.test.js — js/laser/ui/format.js: numbers for people ("31.9 ns")
   and the one place where a slider position becomes a physical value and
   back (docs/laser-plan.md, stage 6).

   A number and its unit are joined by a no-break space (U+00A0), so a
   readout never wraps between "31.9" and "ns"; negative numbers use the
   minus sign (U+2212), not a hyphen.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { assertClose } = require("./helpers.js");
const { createBrowser } = require("./fake-browser.js");

const browser = createBrowser();
browser.load("js/laser/ui/format.js");
const F = browser.window.LaserUI.format;
const NB = " ";

test("loads as LaserUI.format, frozen, adding only LaserUI", () => {
  assert.ok(Object.isFrozen(F));
  assert.deepEqual(browser.addedGlobals(), ["LaserUI"]);
});

test("si: an SI prefix and three significant digits", () => {
  const cases = [
    [3.1909e-8, "s", undefined, "31.9" + NB + "×" + NB + "10⁻⁹" + NB + "s"],
    [2.41e6, "Hz", 2, "2.4" + NB + "×" + NB + "10⁶" + NB + "Hz"],
    [1.7151, "W", undefined, "1.72" + NB + "W"],
    [0.0015, "W", undefined, "1.50" + NB + "×" + NB + "10⁻³" + NB + "W"],
    [-0.0015, "W", undefined, "−1.50" + NB + "×" + NB + "10⁻³" + NB + "W"],
    [1.1208e-5, "s", undefined, "11.2" + NB + "×" + NB + "10⁻⁶" + NB + "s"],
    [7.4e-9, "W", undefined, "7.40" + NB + "×" + NB + "10⁻⁹" + NB + "W"],
    [999.96, "W", undefined, "1.00" + NB + "×" + NB + "10³" + NB + "W"],
    [999.4, "W", undefined, "999" + NB + "W"],
    [0.99996e-6, "s", undefined, "1.00" + NB + "×" + NB + "10⁻⁶" + NB + "s"],
    [123456, "Hz", undefined, "123" + NB + "×" + NB + "10³" + NB + "Hz"],
    [2.5e12, "Hz", undefined, "2.50" + NB + "×" + NB + "10¹²" + NB + "Hz"],
    [0, "W", undefined, "0" + NB + "W"],
    [9.996e-16, "W", undefined, "1.00" + NB + "×" + NB + "10⁻¹⁵" + NB + "W"],
    // Below the smallest prefix (the page meets 10⁻¹⁷⁰ W with the pump off).
    [5e-16, "W", undefined, "<" + NB + "10⁻¹⁵" + NB + "W"],
    [8e-170, "W", undefined, "<" + NB + "10⁻¹⁵" + NB + "W"],
    [-8e-170, "W", undefined, ">" + NB + "−10⁻¹⁵" + NB + "W"],
    [5e-324, "s", undefined, "<" + NB + "10⁻¹⁵" + NB + "s"]
  ];
  for (const [value, unit, digits, expected] of cases) {
    assert.equal(F.si(value, unit, digits), expected, value + " " + unit);
  }
});

test("si and number: no number gives a dash, never 'NaN' or 'Infinity'", () => {
  for (const value of [NaN, Infinity, -Infinity, null, undefined, "5"]) {
    assert.equal(F.si(value, "W"), "—", String(value));
    assert.equal(F.number(value), "—", String(value));
  }
});

test("si and number never throw: every power of ten from 10⁻³²³ to 10³⁰⁸ gives a short text", () => {
  // toFixed() throws past 100 decimals: a power of 10⁻¹⁷⁰ W once stopped
  // the page (stage-6 review).
  for (let power = -323; power <= 308; power++) {
    for (const value of [Number("1e" + power), -Number("7.5e" + power)]) {
      if (!Number.isFinite(value) || value === 0) continue;
      for (const text of [F.si(value, "W"), F.number(value)]) {
        assert.equal(typeof text, "string");
        assert.ok(text.length > 0 && text.length <= 30, value + ": " + text);
        assert.ok(!/NaN|undefined|Infinity/.test(text), value + ": " + text);
      }
    }
  }
});

test("prefix: the SI prefix si() would use, as { power, symbol }", () => {
  const cases = [
    [1.72, 0, ""], [0.0074, -3, "m"], [3.19e-8, -9, "n"], [2.41e6, 6, "M"], [999, 0, ""], [1000, 3, "k"],
    [1e-20, -15, "f"], [1e15, 12, "T"], [0, 0, ""], [-0.0074, -3, "m"]
  ];
  for (const [value, power, symbol] of cases) {
    const prefix = F.prefix(value);
    assert.equal(prefix.power, power, String(value));
    assert.equal(prefix.symbol, symbol, String(value));
  }
  assert.equal(F.prefix(NaN).power, 0);
});

test("plain: the text a number box shows, with a plain point and no unit", () => {
  const cases = [
    [5, undefined, "5"], [7.25, undefined, "7.25"], [13.1826, undefined, "13.2"], [0.5, undefined, "0.5"],
    [10000, undefined, "10000"], [1e6, undefined, "1000000"], [12345.6, undefined, "12300"], [0, undefined, "0"],
    [4.75021, 4, "4.75"], [-2.5, undefined, "-2.5"]
  ];
  for (const [value, digits, expected] of cases) {
    assert.equal(F.plain(value, digits), expected, String(value));
    // A browser's number box takes it back as the same number.
    assert.equal(Number(F.plain(value, digits)), Number(value.toPrecision(digits || 3)));
  }
  for (const value of [NaN, Infinity, null, undefined, "5"]) assert.equal(F.plain(value), "", String(value));
});

test("number: significant digits without a prefix (for m⁻¹, %, ×)", () => {
  const cases = [
    [0.71293, undefined, "0.713"],
    [3.3068, undefined, "3.31"],
    [3.3068, 2, "3.3"],
    [4.7502, undefined, "4.75"],
    [37.702, undefined, "37.7"],
    [1234.5, undefined, "1235"],
    [0, undefined, "0"],
    [-0.5, undefined, "−0.500"],
    [9.9996, undefined, "10.0"],
    [0.00012345, undefined, "0.000123"],
    [8e-170, undefined, "8.00e−170"],
    [-8e-170, 2, "−8.0e−170"]
  ];
  for (const [value, digits, expected] of cases) {
    assert.equal(F.number(value, digits), expected, String(value));
  }
});

test("fromSlider / toSlider: the ends exactly, the log midpoint at √(min·max), and back again", () => {
  const linear = { min: 0, max: 20, log: false };
  const log = { min: 0.005, max: 0.3, log: true };
  assert.equal(F.fromSlider(linear, 0), 0);
  assert.equal(F.fromSlider(linear, 1), 20);
  assert.equal(F.fromSlider(linear, 0.25), 5);
  assert.equal(F.fromSlider(log, 0), 0.005);
  assert.equal(F.fromSlider(log, 1), 0.3);
  assertClose(F.fromSlider(log, 0.5), Math.sqrt(0.005 * 0.3), 1e-12, "log midpoint");
  assertClose(F.fromSlider({ min: 1e3, max: 1e6, log: true }, 1 / 3), 1e4, 1e-12, "slow motion");
  // Ranges where the formula alone misses the top by one rounding unit
  // (0.7000000000000001, 13.669999999999998): the ends are given exactly.
  assert.equal(F.fromSlider({ min: 0.3, max: 0.7, log: true }, 1), 0.7);
  assert.equal(F.fromSlider({ min: 4.97, max: 13.67, log: false }, 1), 13.67);
  for (const range of [linear, log]) {
    for (const fraction of [0, 0.1, 0.37, 0.5, 0.999, 1]) {
      assertClose(F.toSlider(range, F.fromSlider(range, fraction)), fraction, 0, "round trip", 1e-12);
    }
  }
  // Outside the range: held at the ends.
  assert.equal(F.fromSlider(linear, -0.5), 0);
  assert.equal(F.fromSlider(log, 7), 0.3);
  assert.equal(F.toSlider(linear, 50), 1);
  assert.equal(F.toSlider(log, 1e-9), 0);
});

test("fromSlider / toSlider refuse a range they cannot use", () => {
  const bad = [
    { min: 5, max: 5, log: false },
    { min: 6, max: 5, log: false },
    { min: 0, max: 1, log: true },
    { min: -1, max: 1, log: true },
    { min: 0, max: NaN, log: false },
    { min: 0, max: 1 }
  ];
  for (const range of bad) {
    assert.throws(() => F.fromSlider(range, 0.5), /^Error: LaserUI\.format\.fromSlider/, JSON.stringify(range));
    assert.throws(() => F.toSlider(range, 0.5), /^Error: LaserUI\.format\.toSlider/, JSON.stringify(range));
  }
  assert.throws(() => F.fromSlider({ min: 0, max: 1, log: false }, NaN), /LaserUI\.format\.fromSlider/);
  assert.throws(() => F.toSlider({ min: 0, max: 1, log: false }, NaN), /LaserUI\.format\.toSlider/);
});
