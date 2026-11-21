/* ============================================================================
   check.js — input checks shared by every engine file.

   PART OF THE LASER ENGINE (js/laser/engine/). Loaded first, so every other
   engine file can use LaserEngine.check.

   A value that is missing, not a finite number, or impossible (a negative
   length, a reflectivity above 1) is a mistake in the caller, for example
   a slider that goes too far. The engine says so loudly instead of
   returning a number that looks real. Every message starts with the
   function the caller called and names the bad value:
     LaserEngine.cavity.thresholdGain: refl1 must be a finite number above 0
     and at most 1, got 1.2.

   Engine convention: a function with ONE input takes it as it is
   (freeSpectralRange(0.3)); a function with more than one takes ONE object
   of named values, using the code names of docs/laser-physics.md §0
   (thresholdGain({ refl1: 0.99, refl2: 0.98, alpha_i: 0, l_g: 0.3 })), so
   two numbers can never be swapped by accident. A missing name throws, and
   so does a name the function does not use: a misspelling, or a value (an
   extra loss, say) the formula would otherwise quietly ignore.

   How an engine function uses it:
     var where = "LaserEngine.cavity.thresholdGain";
     check.params(where, params, ["refl1", "refl2", "alpha_i", "l_g"]);
     var l_g = check.positive(where, "l_g", params.l_g);
   Each check returns the value, so it can be read and checked in one line.

   Tests: tests/laser/check.test.js
   ========================================================================== */
(function (root) {
  "use strict";

  var E = root.LaserEngine = root.LaserEngine || {};

  // The bad value as text for a message. A string is shown in quotes, so
  // "1" cannot be mistaken for the number 1; an array by its length, so a
  // long state does not flood the message. String() fails on a few values
  // (an object without a prototype); the message must still come out.
  function describe(value) {
    if (typeof value === "string") return JSON.stringify(value);
    if (Array.isArray(value)) return "an array of length " + value.length;
    try {
      return String(value);
    } catch (err) {
      return "a value that cannot be shown as text";
    }
  }

  function fail(where, message) {
    throw new Error(where + ": " + message);
  }

  function isNumber(value) {
    return typeof value === "number" && isFinite(value);
  }

  E.check = Object.freeze({

    // The one object of named values a function with several inputs takes.
    // names: every name the function reads; any other name is refused.
    params: function (where, params, names) {
      if (params === null || typeof params !== "object" || Array.isArray(params)) {
        fail(where, "needs one object of named values, like { " + names.join(", ") +
          " }, got " + describe(params) + ".");
      }
      Object.keys(params).forEach(function (key) {
        if (names.indexOf(key) === -1) {
          fail(where, key + " is not one of its inputs (" + names.join(", ") + ").");
        }
      });
      return params;
    },

    // Any finite number: zero and negative values are allowed.
    finite: function (where, name, value) {
      if (!isNumber(value)) fail(where, name + " must be a finite number, got " + describe(value) + ".");
      return value;
    },

    positive: function (where, name, value) {
      if (!isNumber(value) || value <= 0) {
        fail(where, name + " must be a positive finite number, got " + describe(value) + ".");
      }
      return value;
    },

    // min itself is allowed: atLeast(where, "n", n, 1) accepts n = 1.
    atLeast: function (where, name, value, min) {
      if (!isNumber(value) || value < min) {
        fail(where, name + " must be a finite number of at least " + min + ", got " + describe(value) + ".");
      }
      return value;
    },

    // min and max themselves are allowed.
    between: function (where, name, value, min, max) {
      if (!isNumber(value) || value < min || value > max) {
        fail(where, name + " must be a finite number from " + min + " to " + max +
          ", got " + describe(value) + ".");
      }
      return value;
    },

    // A mirror's power reflectivity. 0 would mean no mirror, so no cavity;
    // 1 is a perfect mirror.
    reflectivity: function (where, name, value) {
      if (!isNumber(value) || value <= 0 || value > 1) {
        fail(where, name + " must be a finite number above 0 and at most 1, got " + describe(value) + ".");
      }
      return value;
    },

    // A count, such as a number of steps: a whole number, min itself allowed.
    integerAtLeast: function (where, name, value, min) {
      if (!isNumber(value) || Math.floor(value) !== value || value < min) {
        fail(where, name + " must be a whole number of at least " + min + ", got " + describe(value) + ".");
      }
      return value;
    },

    // A function the caller passes in, such as the right-hand side of an
    // equation for ode.js.
    func: function (where, name, value) {
      if (typeof value !== "function") {
        fail(where, name + " must be a function, got " + describe(value) + ".");
      }
      return value;
    },

    // A plain, non-empty array of finite numbers, such as the state of an
    // equation. Typed arrays (Float64Array, ...) are refused: the engine
    // uses plain arrays only.
    finiteArray: function (where, name, value) {
      if (!Array.isArray(value)) {
        fail(where, name + " must be an array of finite numbers, got " + describe(value) + ".");
      }
      if (value.length === 0) fail(where, name + " must not be an empty array.");
      for (var i = 0; i < value.length; i++) {
        if (!isNumber(value[i])) {
          fail(where, name + "[" + i + "] must be a finite number, got " + describe(value[i]) + ".");
        }
      }
      return value;
    },

    // The two kinds of line broadening, as written in media.js.
    broadening: function (where, value) {
      if (value !== "homogeneous" && value !== "inhomogeneous") {
        fail(where, 'broadening must be "homogeneous" or "inhomogeneous", got ' + describe(value) + ".");
      }
      return value;
    },

    // For anything else that is wrong with the inputs.
    fail: fail,

    // A value as text, for messages written outside these checks.
    describe: describe
  });
})(this);
