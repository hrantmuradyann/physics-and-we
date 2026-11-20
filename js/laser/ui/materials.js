/* ============================================================================
   materials.js — the physical colours of the laser page (docs/laser-plan.md,
   stage 10c; docs/laser-physics.md §5.10 and §11.5).

   PART OF THE LASER PAGE'S DRAWING (js/laser/ui/): it holds colours, and
   never does physics. Every other colour on the page is a theme colour
   (css/style.css). These are not: a ruby rod is red and a He-Ne beam is
   red whichever theme the visitor chose. So this is the one file allowed
   to write colours as literals (tests/laser/site-files.test.js exempts it),
   and each of them, made readable() against each theme's background, is
   tested for contrast in tests/laser/materials.test.js.

     LaserUI.materials.MEDIA        medium id -> { look, body }: look is
                                    "rod", "liquid" (a cell of dye) or
                                    "gas" (a glowing tube); body is the
                                    material's colour (a gas: its glow).
                                    A medium not listed (the two-level
                                    atom) is drawn in the theme's colours
     LaserUI.materials.GLASS        the glass of a gas tube or a dye cell
     LaserUI.materials.MIRROR_GLASS a mirror's glass seen edge-on: the pale
                                    green of optical glass
     LaserUI.materials.SILVER       a mirror's reflecting coating
     LaserUI.materials.HIGHLIGHT    the light a polished rod reflects, and
     LaserUI.materials.SHADE        its shade: both drawn over the rod
                                    (tested against each rod's colour)
     LaserUI.materials.INFRARED     the false colour of an invisible beam
                                    (infrared or ultraviolet): off the
                                    spectrum, so no visible beam has it
     LaserUI.materials.PUMP_INFRARED  an invisible pump's false colour:
                                    paler, so 808 nm and 1064 nm differ
     LaserUI.materials.visible(lam)   { r, g, b } (0–1) of light of
                                    wavelength lam (m), or null outside
                                    380–780 nm (Bruton's scheme, §11.5)
     LaserUI.materials.beam(lam)    { color, visible, band }: the beam's
                                    colour as "#rrggbb" (INFRARED when it
                                    cannot be seen), whether the eye sees
                                    it, and "visible", "infrared" or
                                    "ultraviolet"
     LaserUI.materials.readable(color, background)   color made lighter
                                    (on a dark background) or darker (on a
                                    light one: whichever stands out more)
                                    until its contrast with the background
                                    is at least MIN_CONTRAST; the same
                                    hue. Kept per (color, background). Both are "#rrggbb", "#rgb"
                                    or "rgb(…)"/"rgba(…)" strings
     LaserUI.materials.contrast(a, b)   the WCAG contrast ratio of two
                                    colours, 1 to 21
     LaserUI.materials.MIN_CONTRAST 3.3: a bit over WCAG's 3 for graphics,
                                    so the colour still passes against the
                                    lighter top of the bench's dark box

   Tests: tests/laser/materials.test.js
   ========================================================================== */
(function (root) {
  "use strict";

  var UI = root.LaserUI = root.LaserUI || {};

  // §5.10: what each medium looks like in daylight.
  var MEDIA = Object.freeze({
    "ruby": Object.freeze({ look: "rod", body: "#d42a4c" }),          // pink-red
    "nd-glass": Object.freeze({ look: "rod", body: "#a58bd2" }),      // pale purple
    "nd-yag": Object.freeze({ look: "rod", body: "#b9a1de" }),        // pale lilac
    "ti-sapphire": Object.freeze({ look: "rod", body: "#f08a98" }),   // pink, a little orange
    "dye-r6g": Object.freeze({ look: "liquid", body: "#f27a1e" }),    // orange
    "he-ne": Object.freeze({ look: "gas", body: "#ff7e64" }),         // whitish red-orange
    "ar-ion": Object.freeze({ look: "gas", body: "#6f6cff" }),        // blue-violet
    "co2": Object.freeze({ look: "gas", body: "#d77fe2" })            // pink-violet
  });
  var GLASS = "#a8c8d8";
  // A mirror, as a real one looks from the side: a block of optical glass,
  // pale green at its edge, and a metal-bright coating on its face.
  var MIRROR_GLASS = "#b9dcd2";
  var SILVER = "#8e98a3";
  // Drawn over a rod, not over the background: the light it reflects
  // along its top, and the shade along its bottom (black at a low alpha,
  // darker on both themes).
  var HIGHLIGHT = "#ffffff";
  var SHADE = "#000000";
  // The false colour of an invisible beam: a hot pink, off the spectrum
  // (red and blue together, more red than blue), so no visible beam has it.
  var INFRARED = "#e8459b";
  // An invisible pump (808 nm diodes, stage 10c2): off the spectrum too,
  // but paler, so it is not taken for the laser's own invisible light.
  var PUMP_INFRARED = "#f7a8d8";
  var MIN_CONTRAST = 3.3;

  var NM = 1e-9;
  var GAMMA = 0.8;

  function clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
  }

  // Bruton's piecewise-linear colour of a wavelength, dimmed near the
  // ends of sight. null where the eye sees nothing.
  function visible(lam) {
    // In nm, rounded to 10⁻⁶ nm: 510e-9 / 1e-9 is not exactly 510.
    var nm = Math.round(lam / NM * 1e6) / 1e6;
    if (!(nm >= 380 && nm <= 780)) return null;
    var r = 0;
    var g = 0;
    var b = 0;
    if (nm < 440) {
      r = (440 - nm) / 60;
      b = 1;
    } else if (nm < 490) {
      g = (nm - 440) / 50;
      b = 1;
    } else if (nm < 510) {
      g = 1;
      b = (510 - nm) / 20;
    } else if (nm < 580) {
      r = (nm - 510) / 70;
      g = 1;
    } else if (nm < 645) {
      r = 1;
      g = (645 - nm) / 65;
    } else {
      r = 1;
    }
    var strength = 1;
    if (nm < 420) strength = 0.3 + 0.7 * (nm - 380) / 40;
    if (nm > 700) strength = 0.3 + 0.7 * (780 - nm) / 80;
    return {
      r: Math.pow(r * strength, GAMMA),
      g: Math.pow(g * strength, GAMMA),
      b: Math.pow(b * strength, GAMMA)
    };
  }

  function hexOf(rgb) {
    function part(value) {
      var text = Math.round(clamp(value, 0, 1) * 255).toString(16);
      return text.length === 1 ? "0" + text : text;
    }
    return "#" + part(rgb.r) + part(rgb.g) + part(rgb.b);
  }

  // band: "visible", "infrared" (past 780 nm) or "ultraviolet" (under
  // 380 nm), for the words under an invisible beam.
  function beam(lam) {
    var rgb = visible(lam);
    if (rgb !== null) return { color: hexOf(rgb), visible: true, band: "visible" };
    return { color: INFRARED, visible: false, band: lam < 380 * NM ? "ultraviolet" : "infrared" };
  }

  // "#rrggbb", "#rgb", "rgb(r, g, b)" or "rgba(r, g, b, a)" as { r, g, b }
  // from 0 to 1 (an alpha is ignored); null for anything else.
  function parse(color) {
    var text = String(color).trim();
    var short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(text);
    if (short) {
      return {
        r: parseInt(short[1] + short[1], 16) / 255,
        g: parseInt(short[2] + short[2], 16) / 255,
        b: parseInt(short[3] + short[3], 16) / 255
      };
    }
    var long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(text);
    if (long) {
      return { r: parseInt(long[1], 16) / 255, g: parseInt(long[2], 16) / 255, b: parseInt(long[3], 16) / 255 };
    }
    var call = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(text);
    if (call) return { r: Number(call[1]) / 255, g: Number(call[2]) / 255, b: Number(call[3]) / 255 };
    return null;
  }

  // WCAG's relative luminance.
  function luminance(rgb) {
    function linear(c) {
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * linear(rgb.r) + 0.7152 * linear(rgb.g) + 0.0722 * linear(rgb.b);
  }

  function ratio(a, b) {
    var la = luminance(a);
    var lb = luminance(b);
    var light = Math.max(la, lb);
    var dark = Math.min(la, lb);
    return (light + 0.05) / (dark + 0.05);
  }

  function contrast(a, b) {
    var first = parse(a);
    var second = parse(b);
    if (!first || !second) return 1;
    return ratio(first, second);
  }

  // The colour mixed step by step towards white (dark background) or
  // black (light background) until it stands out enough. A background it
  // cannot read leaves the colour as it is.
  // Asked every frame with the same few colours: the answers are kept.
  var readableAnswers = {};
  function readable(color, background) {
    var key = color + "|" + background;
    if (Object.prototype.hasOwnProperty.call(readableAnswers, key)) return readableAnswers[key];
    var answer = mixReadable(color, background);
    readableAnswers[key] = answer;
    return answer;
  }
  function mixReadable(color, background) {
    var rgb = parse(color);
    var bg = parse(background);
    if (!rgb || !bg) return color;
    // Towards whichever of white and black stands out more on this
    // background (they are equal near a luminance of 0.18, not 0.5).
    var white = { r: 1, g: 1, b: 1 };
    var black = { r: 0, g: 0, b: 0 };
    var towards = ratio(white, bg) >= ratio(black, bg) ? 1 : 0;
    var mixed = rgb;
    for (var step = 0; step <= 20; step++) {
      var t = step / 20;
      mixed = {
        r: rgb.r + (towards - rgb.r) * t,
        g: rgb.g + (towards - rgb.g) * t,
        b: rgb.b + (towards - rgb.b) * t
      };
      if (ratio(mixed, bg) >= MIN_CONTRAST) break;
    }
    return hexOf(mixed);
  }

  UI.materials = Object.freeze({
    MEDIA: MEDIA,
    GLASS: GLASS,
    MIRROR_GLASS: MIRROR_GLASS,
    SILVER: SILVER,
    HIGHLIGHT: HIGHLIGHT,
    SHADE: SHADE,
    INFRARED: INFRARED,
    PUMP_INFRARED: PUMP_INFRARED,
    MIN_CONTRAST: MIN_CONTRAST,
    visible: visible,
    beam: beam,
    readable: readable,
    contrast: contrast
  });
})(this);
