/* ============================================================================
   format.js — numbers for people, and sliders.

     LaserUI.format.si(3.19e-8, "s")       -> "31.9 ns"   (SI prefix)
     LaserUI.format.si(2.41e6, "Hz", 2)    -> "2.4 MHz"   (2 significant digits)
     LaserUI.format.number(0.71293)        -> "0.713"     (no prefix: m⁻¹, %, ×)
     LaserUI.format.prefix(0.0074)         -> { power: -3, symbol: "m" }
     LaserUI.format.plain(13.1826)         -> "13.2"      (for a number box)
     LaserUI.format.fromSlider(range, f)   slider position f (0 to 1) -> value
     LaserUI.format.toSlider(range, v)     value -> slider position
       range: { min, max, log }; a log range moves by the same factor for
       each step of the slider (needed when it spans 10³ to 10⁶).

   A number and its unit are joined by a no-break space, so a readout never
   wraps between "31.9" and "ns"; a negative number gets a real minus sign.
   Anything that is not a finite number shows as "—".

   Tests: tests/laser/format.test.js
   ========================================================================== */
(function (root) {
  "use strict";

  var UI = root.LaserUI = root.LaserUI || {};

  var NO_BREAK = " ";
  var MINUS = "−";
  var DASH = "—";

  // From femto to tera. A larger value is written with tera; one below
  // 1 f is written "< 1 f…" (see si).
  var PREFIXES = [
    { power: -15, symbol: "f" },
    { power: -12, symbol: "p" },
    { power: -9, symbol: "n" },
    { power: -6, symbol: "µ" },
    { power: -3, symbol: "m" },
    { power: 0, symbol: "" },
    { power: 3, symbol: "k" },
    { power: 6, symbol: "M" },
    { power: 9, symbol: "G" },
    { power: 12, symbol: "T" }
  ];

  function isNumber(value) {
    return typeof value === "number" && isFinite(value);
  }

  function signOf(value) {
    return value < 0 ? MINUS : "";
  }

  // value rounded to `digits` significant digits, then written with as
  // many decimals as those digits need: 0.71293 -> "0.713", 1234.5 -> "1235"
  // (a whole number keeps all its digits).
  function significant(value, digits) {
    if (value === 0) return "0";
    var size = Math.floor(Math.log10(value));
    var rounded = Number(value.toPrecision(digits));
    // Rounding can carry into the next power of ten (9.9996 -> 10.0).
    if (Math.floor(Math.log10(rounded)) > size) size += 1;
    var decimals = digits - 1 - size;
    if (decimals <= 0) return String(Math.round(value));   // no decimals: every whole digit
    return rounded.toFixed(decimals);
  }

  // The prefix for a value: the largest one not above it (femto for
  // anything smaller, tera for anything larger, none for 0).
  function prefixOf(size) {
    var chosen = PREFIXES[0];
    for (var i = 0; i < PREFIXES.length; i++) {
      if (size >= Number("1e" + PREFIXES[i].power)) chosen = PREFIXES[i];
    }
    return chosen;
  }

  // prefix(value) -> { power, symbol }: 0.0074 -> { power: -3, symbol: "m" }.
  function prefix(value) {
    if (!isNumber(value) || value === 0) return { power: 0, symbol: "" };
    var chosen = prefixOf(Math.abs(value));
    return { power: chosen.power, symbol: chosen.symbol };
  }

  // plain(value, digits) -> the text a number box shows: `digits`
  // significant digits (3), a plain point, no unit: "5", "13.2", "10000".
  function plain(value, digits) {
    if (!isNumber(value)) return "";
    return String(Number(value.toPrecision(digits || 3)));
  }

  function number(value, digits) {
    if (!isNumber(value)) return DASH;
    var places = digits || 3;
    var size = Math.abs(value);
    // Far below anything the page shows, and below what toFixed() can
    // write (it throws past 100 decimals): powers of ten, "8.00e−170".
    if (size !== 0 && size < 1e-15) {
      return signOf(value) + size.toExponential(places - 1).replace("-", MINUS);
    }
    return signOf(value) + significant(size, places);
  }

  function si(value, unit, digits) {
    if (!isNumber(value)) return DASH;
    var places = digits || 3;
    var size = Math.abs(value);
    if (size === 0) return "0" + NO_BREAK + unit;
    // The prefix is chosen after rounding, so 999.96 W becomes 1.00 kW.
    var rounded = Number(size.toPrecision(places));
    // Below the smallest prefix the number tells a visitor nothing more,
    // and toFixed() could not write it (the page meets 10⁻¹⁷⁰ W with the
    // pump off): "< 1 fW".
    if (rounded < 1e-15) {
      var bound = value < 0 ? ">" + NO_BREAK + MINUS : "<" + NO_BREAK;
      return bound + "1" + NO_BREAK + PREFIXES[0].symbol + unit;
    }
    var chosen = prefixOf(rounded);
    var scaled = rounded / Number("1e" + chosen.power);
    return signOf(value) + significant(scaled, places) + NO_BREAK + chosen.symbol + unit;
  }

  /* ---------- sliders ---------- */

  function checkRange(where, range) {
    var ok = range !== null && typeof range === "object" &&
      isNumber(range.min) && isNumber(range.max) && range.min < range.max &&
      typeof range.log === "boolean" && (!range.log || range.min > 0);
    if (!ok) {
      throw new Error(where + ": the range must be { min, max, log } with min < max " +
        "(and min > 0 for a log range), got " + JSON.stringify(range) + ".");
    }
  }

  function clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
  }

  function fromSlider(range, fraction) {
    var where = "LaserUI.format.fromSlider";
    checkRange(where, range);
    if (typeof fraction !== "number" || isNaN(fraction)) {
      throw new Error(where + ": the slider position must be a number, got " + fraction + ".");
    }
    var f = clamp(fraction, 0, 1);
    if (f === 0) return range.min;               // the ends exactly
    if (f === 1) return range.max;
    if (range.log) return range.min * Math.pow(range.max / range.min, f);
    return range.min + f * (range.max - range.min);
  }

  function toSlider(range, value) {
    var where = "LaserUI.format.toSlider";
    checkRange(where, range);
    if (typeof value !== "number" || isNaN(value)) {
      throw new Error(where + ": the value must be a number, got " + value + ".");
    }
    var v = clamp(value, range.min, range.max);
    if (range.log) return Math.log(v / range.min) / Math.log(range.max / range.min);
    return (v - range.min) / (range.max - range.min);
  }

  UI.format = Object.freeze({
    si: si,
    number: number,
    prefix: prefix,
    plain: plain,
    fromSlider: fromSlider,
    toSlider: toSlider
  });
})(this);
