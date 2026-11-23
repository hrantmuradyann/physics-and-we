/* ============================================================================
   axis.js — where a chart's axis puts its ticks, and what it writes beside
   them. Plain arithmetic, no drawing (js/laser/ui/draw-plots.js draws).

     LaserUI.axis.ticks(min, max, count)
         -> { step, values }: ticks at the multiples of a round step (1, 2
            or 5 times a power of ten) that lie inside [min, max]; about
            `count` of them
     LaserUI.axis.fromZero(max, count)
         -> { top, step, values }: an axis from 0 up to the first tick at or
            above `max`
     LaserUI.axis.labels(values, step, unit)
         -> { texts, unit, power, decimals }: the ticks written with one SI
            prefix for the whole axis ("mW") and as many decimals as the
            step needs, the same on every tick ("0.0", "0.5", "1.0"). With
            unit "" (a plain number) there is no prefix.
     LaserUI.axis.valueText(value, labels, extra)
         -> a value written the way that axis writes its ticks, with `extra`
            more decimals (for the tag that shows the latest value)

   Powers of ten are built with Number("1e-7"), which is the nearest number
   to 10⁻⁷; Math.pow(10, -7) may be one rounding unit off. Products are
   cleaned to 12 digits, so 3 × 0.1 is 0.3 and not 0.30000000000000004.

   Needs: format.js (the SI prefixes).
   Tests: tests/laser/axis.test.js
   ========================================================================== */
(function (root) {
  "use strict";

  var UI = root.LaserUI = root.LaserUI || {};

  var MINUS = "−";
  var DASH = "—";
  var MAX_DECIMALS = 9;

  function fail(where, message) {
    throw new Error("LaserUI.axis." + where + ": " + message);
  }

  function isNumber(value) {
    return typeof value === "number" && isFinite(value);
  }

  function powerOfTen(exponent) {
    return Number("1e" + exponent);
  }

  function clean(value) {
    return Number(value.toPrecision(12));
  }

  // The round step that divides `span` into about `count` parts.
  function stepFor(span, count) {
    var raw = span / count;
    var exponent = Math.floor(Math.log10(raw));
    // Math.log10 can be one rounding unit off at an exact power of ten.
    if (powerOfTen(exponent + 1) <= raw) exponent += 1;
    if (powerOfTen(exponent) > raw) exponent -= 1;
    var ratio = raw / powerOfTen(exponent);             // 1 ≤ ratio < 10
    var round = 10;
    if (ratio <= 1 + 1e-9) round = 1;
    else if (ratio <= 2 + 1e-9) round = 2;
    else if (ratio <= 5 + 1e-9) round = 5;
    return clean(round * powerOfTen(exponent));
  }

  function checkCount(where, count) {
    if (!isNumber(count) || count < 1) {
      fail(where, "the number of ticks must be a number of at least 1, got " + count + ".");
    }
  }

  // The multiples of step from the first at or above min to the last at
  // or below max (a tick a rounding unit outside still counts).
  function multiples(step, min, max) {
    var first = Math.ceil(min / step - 1e-9);
    var last = Math.floor(max / step + 1e-9);
    var values = [];
    for (var i = first; i <= last; i++) values.push(clean(i * step));
    return values;
  }

  function ticks(min, max, count) {
    if (!isNumber(min) || !isNumber(max) || !(max > min)) {
      fail("ticks", "min and max must be numbers with min < max, got " + min + " and " + max + ".");
    }
    checkCount("ticks", count);
    var step = stepFor(max - min, count);
    return { step: step, values: multiples(step, min, max) };
  }

  function fromZero(max, count) {
    if (!isNumber(max) || !(max > 0)) {
      fail("fromZero", "the largest value must be a number above 0, got " + max + ".");
    }
    checkCount("fromZero", count);
    var step = stepFor(max, count);
    var top = clean(Math.ceil(max / step - 1e-9) * step);
    return { top: top, step: step, values: multiples(step, 0, top) };
  }

  function written(value, scale, decimals) {
    var text = (Math.abs(value) / scale).toFixed(decimals);
    // "−0.00" would be a minus sign in front of nothing.
    return (value < 0 && Number(text) !== 0 ? MINUS : "") + text;
  }

  function labels(values, step, unit) {
    var largest = 0;
    for (var i = 0; i < values.length; i++) largest = Math.max(largest, Math.abs(values[i]));
    var prefix = unit ? UI.format.prefix(largest) : { power: 0, symbol: "" };
    var scale = powerOfTen(prefix.power);
    // As many decimals as it takes to write the step: 0.5 -> 1, 20 -> 0.
    var decimals = 0;
    while (decimals < MAX_DECIMALS && clean(step / scale * powerOfTen(decimals)) < 1) decimals += 1;
    var texts = [];
    for (var j = 0; j < values.length; j++) texts.push(written(values[j], scale, decimals));
    return { texts: texts, unit: UI.format.unit(prefix.power, unit), power: prefix.power, decimals: decimals };
  }

  function valueText(value, axisLabels, extra) {
    if (!isNumber(value)) return DASH;
    var decimals = Math.min(MAX_DECIMALS + 1, axisLabels.decimals + (extra || 0));
    return written(value, powerOfTen(axisLabels.power), decimals);
  }

  UI.axis = Object.freeze({
    ticks: ticks,
    fromZero: fromZero,
    labels: labels,
    valueText: valueText
  });
})(this);
