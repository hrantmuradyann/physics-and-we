/* =========================================================================
   The laser intro: a one-minute film, full screen, each time the laser
   page (?view=laser) comes on screen. It shows how a laser works in
   eight short scenes: atoms and their three energy levels, the pump, a photon sent out by an
   atom on its own, twin photons (stimulated emission), the mirrors, and
   the beam. A "Skip" button at the top right (or Esc) closes it; it also
   closes by itself at the end.

   It is drawn on a canvas, in the lab's own look: the colours are the
   lab's --laser-* variables (css/style.css), and the physical ones (the
   ruby, the mirrors' glass and silver) come from js/laser/ui/materials.js,
   as on the bench; the beam is the site's --red (css/style.css). The words are the "intro"
   block of data/laser.json (plus page.eyebrow, page.title, bench.parts,
   media.ruby and pumps.flashlamp), taken from the page's own build, so a
   language switch changes them too. The film's timing is here.

   The overlay (.laser-intro in css/laser.css) is made once, on the first
   showing, and added to <body>, outside the router's #app.
   A visitor who asked for less motion is not shown the film.

   Adds no global.
   ========================================================================= */

(function (global) {
  "use strict";

  var ROUTE = "laser";
  var W = 1280;          // the film is drawn on a 1280 x 720 board, then scaled
  var H = 720;
  var DURATION = 60;     // seconds
  var CLOSE_AFTER = 0.8; // seconds the last picture stays before the film closes
  var RUBY = "ruby";

  // When each caption (data/laser.json intro.captions, in order) starts;
  // each lasts until the next one, the last to the end.
  var CAPTION_STARTS = [0, 5, 13, 20, 25, 35, 45, 52];

  var data = null;       // the laser page's words, from its newest build
  var overlay = null;    // the overlay's elements, made on the first showing
  var colors = null;     // the colours, read when the film opens
  var g = null;          // the canvas's 2D context
  var time = 0;          // seconds of the film shown
  var lastFrame = null;
  var frame = null;      // the requested animation frame, or null when closed
  var resizeWatcher = null;

  /* ---------- Small helpers ---------- */

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function lerp(a, b, f) {
    return a + (b - a) * f;
  }

  // Smooth start and smooth stop, for f from 0 to 1.
  function ease(f) {
    f = clamp(f, 0, 1);
    return f * f * (3 - 2 * f);
  }

  // 0 before `start`, rising to 1 over `duration` seconds.
  function fadeIn(t, start, duration) {
    return ease((t - start) / duration);
  }

  // A word of the laser page in the chosen language ("intro.skip").
  function word(path) {
    if (!data || !global.Content) return "";
    return global.Content.inLang(global.Content.valueAt(data, path), global.Site.lang);
  }

  function cssColour(name) {
    return global.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // The lab's colours (css/style.css) and the physical ones (materials.js),
  // the physical ones made readable on the lab's background as on the bench.
  function readColours() {
    var M = global.LaserUI.materials;
    var bg = cssColour("--laser-bg");
    var flash = cssColour("--laser-canvas-flash");
    var lam = global.LaserEngine.media.get(RUBY).lam;
    return {
      bg: bg,
      heading: cssColour("--laser-heading"),
      text: cssColour("--laser-text"),
      muted: cssColour("--laser-muted"),
      line: cssColour("--laser-canvas-line"),
      white: cssColour("--laser-faint-bg"),
      ghostBorder: cssColour("--laser-ghost-border"),
      accent: cssColour("--laser-accent"),
      glow: cssColour("--laser-canvas-glow"),
      flash: flash,
      flashLine: M.readable(flash, bg),
      lamp: cssColour("--laser-canvas-lamp"),
      // The beam's red is the site's --red (the simple theme's too): ruby's
      // 694 nm, a little darker than its pure red so it reads well on white.
      beam: cssColour("--red") || M.readable(M.beam(lam).color, bg),
      lam: lam,
      ruby: M.MEDIA[RUBY].body,
      mirrorGlass: M.MIRROR_GLASS,
      mirrorEdge: M.readable(M.MIRROR_GLASS, bg),
      silver: M.readable(M.SILVER, bg),
      highlight: M.HIGHLIGHT,
      shade: M.SHADE,
      font: cssColour("--font-main") || "sans-serif"
    };
  }

  /* ---------- Drawing helpers ---------- */

  function text(words, x, y, options) {
    options = options || {};
    g.save();
    g.globalAlpha *= (options.alpha === undefined) ? 1 : options.alpha;
    g.fillStyle = options.color || colors.text;
    g.font = (options.weight || "normal") + " " + (options.size || 22) + "px " + colors.font;
    g.textAlign = options.align || "center";
    g.textBaseline = "middle";
    if (options.spacing) {
      g.letterSpacing = options.spacing + "px";
    }
    if (options.maxWidth) {
      g.fillText(words, x, y, options.maxWidth);
    } else {
      g.fillText(words, x, y);
    }
    g.restore();
  }

  // The small upper-case line over a title, as on the site (.eyebrow).
  function eyebrow(words, x, y, alpha) {
    text(words.toUpperCase(), x, y, {
      size: 17, weight: "600", color: colors.accent, spacing: 5, alpha: alpha
    });
  }

  // Break a sentence into lines no wider than maxWidth.
  function wrapText(words, maxWidth) {
    var parts = words.split(" ");
    var lines = [];
    var current = "";
    for (var i = 0; i < parts.length; i++) {
      var test = current === "" ? parts[i] : current + " " + parts[i];
      if (g.measureText(test).width > maxWidth && current !== "") {
        lines.push(current);
        current = parts[i];
      } else {
        current = test;
      }
    }
    lines.push(current);
    return lines;
  }

  function roundRect(x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y);
    g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r);
    g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r);
    g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }

  function line(x1, y1, x2, y2) {
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  }

  // A filled arrowhead with its tip at (x, y), pointing along (dx, dy).
  function arrowHead(x, y, dx, dy, size) {
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x - dx * size - dy * 0.55 * size, y - dy * size - dx * 0.55 * size);
    g.lineTo(x - dx * size + dy * 0.55 * size, y - dy * size + dx * 0.55 * size);
    g.closePath();
    g.fill();
  }

  // A line of laser light with a thin casing of the background round it,
  // as the bench draws its rays.
  function ray(x1, y1, x2, y2, alpha, width) {
    g.save();
    g.globalAlpha *= 0.6 * alpha;
    g.strokeStyle = colors.bg;
    g.lineWidth = width + 2;
    line(x1, y1, x2, y2);
    g.globalAlpha /= 0.6;
    g.strokeStyle = colors.beam;
    g.lineWidth = width;
    line(x1, y1, x2, y2);
    g.restore();
  }

  // An atom, as in the lab's cartoon: a ring when calm, a filled glowing
  // graphite disc when excited. energy goes from 0 (calm) to 1 (excited).
  function drawAtom(x, y, energy) {
    var radius = 15;
    g.save();
    g.beginPath();
    g.arc(x, y, radius, 0, Math.PI * 2);
    g.fillStyle = colors.bg;
    g.fill();
    g.strokeStyle = colors.muted;
    g.lineWidth = 1.6;
    g.stroke();
    if (energy > 0) {
      g.globalAlpha *= energy;
      g.fillStyle = colors.accent;
      g.beginPath();
      g.arc(x, y, radius, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = colors.glow;
      g.lineWidth = 5;
      g.beginPath();
      g.arc(x, y, radius + 5, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
  }

  // A photon, as in the lab's cartoon: a short wave with an arrowhead,
  // flying along (dx, dy). One sent out by an atom on its own (stray)
  // has a dashed wave.
  function drawPhoton(x, y, dx, dy, colour, stray) {
    var length = 34;
    g.save();
    g.translate(x, y);
    g.rotate(Math.atan2(dy, dx));
    g.strokeStyle = colour;
    g.fillStyle = colour;
    g.lineWidth = 2.6;
    g.lineCap = "round";
    if (stray) {
      g.setLineDash([5, 4]);
    }
    g.beginPath();
    for (var k = 0; k <= 16; k++) {
      var along = -length / 2 + k / 16 * length;
      var across = 0.16 * length * Math.sin(k / 16 * 3 * Math.PI);
      if (k === 0) {
        g.moveTo(along, across);
      } else {
        g.lineTo(along, across);
      }
    }
    g.stroke();
    g.setLineDash([]);
    g.beginPath();
    g.moveTo(length / 2 + 0.3 * length, 0);
    g.lineTo(length / 2, -0.2 * length);
    g.lineTo(length / 2, 0.2 * length);
    g.closePath();
    g.fill();
    g.restore();
  }

  /* ---------- The bench's parts, drawn as on the lab page ---------- */

  // A flashlamp: a glass tube with a metal cap at each end. `pump` (0..1)
  // is how brightly it burns; `rod`, if given, gets the flash's broad beams.
  function drawFlashlamp(F, pump, t, rod) {
    if (pump > 0) {
      // a soft halo round the tube
      g.save();
      g.fillStyle = colors.flash;
      g.globalAlpha *= 0.08 * pump;
      for (var ring = 1; ring <= 6; ring++) {
        g.beginPath();
        g.ellipse(F.x + F.w / 2, F.y + F.h / 2, F.w / 2 + ring * 7, F.h / 2 + ring * 7, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();

      // broad beams up into the rod
      if (rod) {
        g.save();
        g.globalAlpha *= 0.15 + 0.35 * pump;
        g.fillStyle = colors.flash;
        g.beginPath();
        g.moveTo(F.x + F.cap, F.y);
        g.lineTo(F.x + F.w - F.cap, F.y);
        g.lineTo(rod.x + rod.w, rod.y + rod.h);
        g.lineTo(rod.x, rod.y + rod.h);
        g.closePath();
        g.fill();
        g.restore();
      }

      // short streaks all round the tube, each flickering
      g.save();
      g.strokeStyle = colors.flashLine;
      g.lineWidth = 2;
      for (var k = 0; k < 16; k++) {
        var angle = 2 * Math.PI * (k + 0.5) / 16;
        var dx = Math.cos(angle);
        var dy = Math.sin(angle);
        var flicker = 0.5 + 0.5 * Math.sin(18 * t + 2.4 * k);
        var length = 22 * pump * (0.4 + 0.6 * flicker);
        var x0 = F.x + F.w / 2 + dx * (F.w / 2 + 3);
        var y0 = F.y + F.h / 2 + dy * (F.h / 2 + 3);
        g.save();
        g.globalAlpha *= (0.3 + 0.6 * flicker) * pump;
        line(x0, y0, x0 + dx * length, y0 + dy * length);
        g.restore();
      }
      g.restore();

      // the burning gas, blooming: xenon's blue-white at its edge, so it
      // shows on the white page, and white-hot in its middle, as on the bench
      g.save();
      g.globalAlpha *= 0.4 + 0.6 * pump;
      g.fillStyle = colors.flashLine;
      g.shadowColor = colors.flash;
      g.shadowBlur = 24 * pump;
      g.fillRect(F.x + F.cap, F.y, F.w - 2 * F.cap, F.h);
      g.shadowBlur = 0;
      g.fillStyle = colors.highlight;
      g.fillRect(F.x + F.cap, F.y + 0.22 * F.h, F.w - 2 * F.cap, 0.56 * F.h);
      g.restore();
    }
    g.save();
    g.strokeStyle = colors.lamp;
    g.lineWidth = 1;
    g.strokeRect(F.x, F.y, F.w, F.h);
    g.fillStyle = colors.lamp;
    g.fillRect(F.x, F.y, F.cap, F.h);
    g.fillRect(F.x + F.w - F.cap, F.y, F.cap, F.h);
    g.restore();
  }

  // The ruby crystal: a see-through red cylinder, darker at the bottom,
  // a glint along the top and an end face at each end; `lit` tints it
  // with the flash it absorbs.
  function drawRuby(R, lit) {
    g.save();
    g.globalAlpha *= 0.5;
    g.fillStyle = colors.ruby;
    g.fillRect(R.x, R.y, R.w, R.h);
    g.restore();

    if (lit > 0) {
      g.save();
      g.globalAlpha *= 0.3 * lit;
      g.fillStyle = colors.flash;
      g.fillRect(R.x, R.y, R.w, R.h);
      g.restore();
    }

    g.save();
    g.globalAlpha *= 0.2;
    g.fillStyle = colors.shade;
    g.fillRect(R.x, R.y + 0.7 * R.h, R.w, 0.3 * R.h);
    g.restore();

    g.save();
    g.globalAlpha *= 0.35;
    g.fillStyle = colors.highlight;
    g.fillRect(R.x + 0.03 * R.w, R.y + 0.14 * R.h, 0.94 * R.w, 0.12 * R.h);
    g.restore();

    g.save();
    g.strokeStyle = colors.ruby;
    g.lineWidth = 1.5;
    g.strokeRect(R.x, R.y, R.w, R.h);
    var ends = [R.x, R.x + R.w];
    for (var i = 0; i < ends.length; i++) {
      g.beginPath();
      g.ellipse(ends[i], R.y + R.h / 2, 0.12 * R.h, R.h / 2, 0, 0, Math.PI * 2);
      g.save();
      g.globalAlpha *= 0.5;
      g.fillStyle = colors.ruby;
      g.fill();
      g.restore();
      g.stroke();
    }
    g.restore();
  }

  // A post from a part down to the bench's rail, with a foot.
  function drawPost(x, fromY, railY) {
    g.save();
    g.fillStyle = colors.muted;
    g.fillRect(x - 2, fromY, 4, railY - fromY);
    g.fillRect(x - 12, railY - 4, 24, 4);
    g.restore();
  }

  // A flat mirror seen from the side: pale green glass with a glint, a
  // silver coating on the face towards the laser, in a metal mount (with a
  // hole for the light) with an adjusting knob at the top and the bottom.
  // `strong` is the back mirror, which reflects everything; the output
  // mirror's coating is thinner and see-through.
  function drawMirror(m, back, strong, axisY, holeHalf) {
    var outer = back ? m.x : m.x + m.w;
    var inner = back ? m.x + m.w : m.x;
    var towardsLaser = back ? 1 : -1;
    var plate = 6;
    var knob = 4;

    g.save();
    // the mount's plate, with a hole for the light
    var plateX = back ? outer - plate : outer;
    var holeTop = axisY - holeHalf;
    var holeBottom = axisY + holeHalf;
    g.fillStyle = colors.muted;
    g.fillRect(plateX, m.y - 4, plate, holeTop - (m.y - 4));
    g.fillRect(plateX, holeBottom, plate, m.y + m.h + 4 - holeBottom);
    // the adjusting knobs
    var knobX = outer - towardsLaser * (plate + knob);
    var knobYs = [m.y + 0.12 * m.h, m.y + 0.88 * m.h];
    for (var i = 0; i < knobYs.length; i++) {
      g.fillRect(Math.min(outer, knobX), knobYs[i] - 1, plate + knob, 2);
      g.fillRect(knobX - knob, knobYs[i] - 1.6 * knob, 2 * knob, 3.2 * knob);
    }

    // the glass
    g.save();
    g.globalAlpha *= 0.55;
    g.fillStyle = colors.mirrorGlass;
    g.fillRect(m.x, m.y, m.w, m.h);
    g.restore();
    g.strokeStyle = colors.mirrorEdge;
    g.lineWidth = 1;
    g.strokeRect(m.x, m.y, m.w, m.h);

    // its darker back edge and a glint of light
    g.save();
    g.globalAlpha *= 0.18;
    g.fillStyle = colors.shade;
    g.fillRect(back ? outer : outer - 2, m.y, 2, m.h);
    g.restore();
    g.save();
    g.strokeStyle = colors.highlight;
    g.lineWidth = 1.5;
    var glintX = outer + towardsLaser * 0.4 * m.w;
    g.globalAlpha *= 0.9;
    line(glintX, m.y + 0.1 * m.h, glintX, m.y + 0.45 * m.h);
    g.globalAlpha *= 0.66;
    line(glintX, m.y + 0.55 * m.h, glintX, m.y + 0.65 * m.h);
    g.restore();

    // the silver coating
    g.save();
    g.strokeStyle = colors.silver;
    g.lineWidth = strong ? 4 : 2.5;
    g.globalAlpha *= strong ? 1 : 0.55;
    line(inner, m.y, inner, m.y + m.h);
    g.restore();

    // the clamps at the top and the bottom
    g.fillStyle = colors.muted;
    g.fillRect(m.x - 2, m.y - 4, m.w + 4, 4);
    g.fillRect(m.x - 2, m.y + m.h, m.w + 4, 4);
    g.restore();
  }

  /* ---------- Scene 1 (0-5 s): a laser beam crosses the screen ---------- */

  function sceneOpening(t) {
    eyebrow(word("page.eyebrow"), W / 2, 185, fadeIn(t, 1.2, 0.8));
    text(word("intro.question"), W / 2, 242, {
      size: 58, weight: "800", color: colors.heading, alpha: fadeIn(t, 1.6, 0.8), maxWidth: 1180
    });
    var head = lerp(-40, W + 60, ease((t - 0.4) / 1.8));
    ray(-40, 380, head - 14, 380, 1, 4);
    g.save();
    g.fillStyle = colors.beam;
    arrowHead(head, 380, 1, 0, 18);
    g.restore();
  }

  /* ---------- Scenes 2-4 (5-25 s): atoms on three energy levels ---------- */

  // Ruby's three levels, as the lab's "Inside one atom" draws them (the
  // ground, the metastable upper level, and the broad pump band on top).
  // Two levels would be wrong: light that lifts atoms up pushes as many
  // back down, so the pump alone could never put more atoms up than down.
  // The pump lifts an atom from the ground to the band; it falls at once to
  // the upper level (giving up a little heat), and waits there.
  var GROUND = 450;   // height of the atoms on the ground level
  var UPPER = 300;    // on the upper level, where they wait
  var BAND = 185;     // on the pump band
  var BAND_HALF = 16; // half the band's thickness
  var ATOM_COUNT = 8;
  var LEVEL_LEFT = 290;
  var LEVEL_RIGHT = 1000;
  var LAMP = { x: 330, y: 535, w: 630, h: 20, cap: 14 };

  function atomX(i) {
    return 330 + i * 90;
  }

  // When each atom is lifted (seconds). Atom 3 goes first, on its own;
  // atom 6 is never pumped, so "most" (not all) atoms end up excited.
  var UP_AT = { 3: 8.0, 0: 14.0, 5: 14.75, 2: 15.5, 7: 16.25, 1: 17.0, 4: 17.75 };
  var FALLS_AT = { 1: 21.0 }; // atom 1 falls back by itself
  var PUMP_TRIP = 0.6;        // how long the lamp's light takes to reach an atom
  var RISE = 0.5;             // ground -> band
  var STAY = 0.25;            // a moment in the band
  var SETTLE = 0.45;          // band -> upper level (heat)

  // The height of atom i at time t.
  function atomY(i, t) {
    var y = GROUND;
    if (UP_AT[i] !== undefined) {
      var u = t - UP_AT[i];
      if (u <= 0) {
        y = GROUND;
      } else if (u < RISE) {
        y = lerp(GROUND, BAND, ease(u / RISE));
      } else if (u < RISE + STAY) {
        y = BAND;
      } else {
        y = lerp(BAND, UPPER, ease((u - RISE - STAY) / SETTLE));
      }
    }
    if (FALLS_AT[i] !== undefined && t > FALLS_AT[i]) {
      y = lerp(UPPER, GROUND, ease((t - FALLS_AT[i]) / 0.4));
    }
    return y;
  }

  // An atom glows while it is above the ground.
  function glowAt(y) {
    return clamp((GROUND - y) / (GROUND - UPPER), 0, 1);
  }

  // True while atom i falls from the band to the upper level.
  function settling(i, t) {
    if (UP_AT[i] === undefined) return false;
    var u = t - UP_AT[i];
    return u > RISE + STAY && u < RISE + STAY + SETTLE + 0.3;
  }

  // A short wavy line downwards: energy given up as heat.
  function heatWave(x, y1, y2) {
    g.save();
    g.strokeStyle = colors.muted;
    g.fillStyle = colors.muted;
    g.lineWidth = 2;
    g.beginPath();
    var steps = 16;
    for (var k = 0; k <= steps; k++) {
      var y = lerp(y1, y2 - 8, k / steps);
      var x0 = x + 3 * Math.sin(k / steps * 4 * Math.PI);
      if (k === 0) {
        g.moveTo(x0, y);
      } else {
        g.lineTo(x0, y);
      }
    }
    g.stroke();
    arrowHead(x, y2, 0, 1, 8);
    g.restore();
  }

  function sceneLevels(t) {
    // The pump band: a broad faint strip with its line, as on the page.
    g.save();
    g.globalAlpha *= 0.35;
    g.fillStyle = colors.line;
    g.fillRect(LEVEL_LEFT, BAND + 22 - BAND_HALF, LEVEL_RIGHT - LEVEL_LEFT, 2 * BAND_HALF);
    g.restore();

    // The three levels.
    g.save();
    g.strokeStyle = colors.heading;
    g.lineWidth = 2;
    line(LEVEL_LEFT, GROUND + 22, LEVEL_RIGHT, GROUND + 22);
    line(LEVEL_LEFT, UPPER + 22, LEVEL_RIGHT, UPPER + 22);
    line(LEVEL_LEFT, BAND + 22, LEVEL_RIGHT, BAND + 22);
    g.restore();
    var labels = [
      { y: BAND, path: "intro.bandLevel" },
      { y: UPPER, path: "intro.upperLevel" },
      { y: GROUND, path: "intro.groundLevel" }
    ];
    for (var n = 0; n < labels.length; n++) {
      text(word(labels[n].path), LEVEL_RIGHT + 14, labels[n].y + 22, {
        align: "left", color: colors.muted, size: 19, maxWidth: 260
      });
    }

    // Scene 2: an arrow shows the first atom taking in energy, and a wavy
    // one the heat it gives up as it settles on the upper level.
    if (t > 7.2 && t < 12.6) {
      var arrowAlpha = Math.min(fadeIn(t, 7.2, 0.4), 1 - fadeIn(t, 12, 0.5));
      var ax = atomX(3) + 42;
      g.save();
      g.globalAlpha *= arrowAlpha;
      g.strokeStyle = colors.accent;
      g.fillStyle = colors.accent;
      g.lineWidth = 2.5;
      line(ax, GROUND + 10, ax, BAND + 22);
      arrowHead(ax, BAND + 10, 0, -1, 12);
      g.restore();
      text(word("intro.extraEnergy"), ax + 14, (GROUND + UPPER) / 2 + 30, {
        align: "left", size: 20, weight: "600", color: colors.heading, alpha: arrowAlpha, maxWidth: 220
      });
      var heatAlpha = Math.min(fadeIn(t, 8.8, 0.4), 1 - fadeIn(t, 12, 0.5));
      g.save();
      g.globalAlpha *= heatAlpha;
      heatWave(atomX(3) - 42, BAND + 14, UPPER + 8);
      g.restore();
      text(word("intro.heat"), atomX(3) - 56, (BAND + UPPER) / 2 + 12, {
        align: "right", size: 19, color: colors.muted, alpha: heatAlpha, maxWidth: 200
      });
    }

    // The flashlamp under the atoms, flashing while it pumps.
    var lampVisible = fadeIn(t, 12.6, 0.6);
    var pump = 0;
    if (t > 13.3 && t < 19.4) {
      pump = (0.55 + 0.45 * Math.sin(t * 7)) * Math.min(fadeIn(t, 13.3, 0.4), 1 - fadeIn(t, 19, 0.4));
    }
    g.save();
    g.globalAlpha *= lampVisible;
    drawFlashlamp(LAMP, pump, t, null);
    g.restore();
    text(word("intro.lamp"), LAMP.x + LAMP.w + 20, LAMP.y + LAMP.h / 2, {
      align: "left", size: 20, weight: "600", color: colors.heading, alpha: lampVisible, maxWidth: 280
    });

    // The lamp's light flying up to each atom just before it is lifted,
    // and the heat each one gives up as it settles.
    for (var key in UP_AT) {
      var i = Number(key);
      var arrive = UP_AT[i];
      if (arrive > 13 && t > arrive - PUMP_TRIP && t < arrive) {
        var f = (t - (arrive - PUMP_TRIP)) / PUMP_TRIP;
        drawPhoton(atomX(i), lerp(LAMP.y - 30, GROUND + 30, f), 0, -1, colors.flashLine, false);
      }
      if (arrive > 13 && settling(i, t)) {
        heatWave(atomX(i) + 26, BAND + 14, UPPER + 8);
      }
    }

    // The atoms themselves; those waiting on the upper level are counted.
    var waiting = 0;
    for (var j = 0; j < ATOM_COUNT; j++) {
      var y = atomY(j, t);
      if (Math.abs(y - UPPER) < 1) {
        waiting++;
      }
      drawAtom(atomX(j), y, glowAt(y));
    }

    // A counter while we pump.
    if (t > 13 && t < 20.6) {
      var counter = word("intro.excited").replace("{n}", waiting).replace("{total}", ATOM_COUNT);
      text(counter, W / 2, 105, {
        size: 28, weight: "700", color: colors.heading, alpha: fadeIn(t, 13, 0.5)
      });
    }

    // Atom 1 falls by itself and sends out a photon in a random direction.
    var fall = FALLS_AT[1];
    if (t > fall + 0.15) {
      var flown = (t - fall - 0.15) * 420;
      var dx = -0.6;
      var dy = -0.8;
      drawPhoton(atomX(1) + dx * (flown + 30), UPPER + 10 + dy * (flown + 30), dx, dy, colors.beam, true);
      text(word("intro.byItself"), atomX(1) + 80, UPPER - 50, {
        size: 22, weight: "700", color: colors.beam, alpha: fadeIn(t, fall + 0.3, 0.4)
      });
    }
  }

  /* ---------- Scene 5 (25-35 s): twin photons, 1 -> 2 -> 4 -> 8 ---------- */

  var TWIN_COLUMNS = [420, 640, 860];
  var TWIN_START = 26;
  var TWIN_SPEED = 1000 / 7; // pixels per second

  // Height of photon i when there are 2^stage photons. Each photon's twin
  // appears next to it, so they spread out like the branches of a tree.
  function twinY(stage, i) {
    var count = Math.pow(2, stage);
    var gap = 44 * Math.pow(2, 3 - stage);
    return 310 + (i - (count - 1) / 2) * gap;
  }

  function sceneTwins(t) {
    var x = 150 + (t - TWIN_START) * TWIN_SPEED;

    // How many columns of atoms the photons have already passed.
    var stage = 0;
    for (var c = 0; c < TWIN_COLUMNS.length; c++) {
      if (x >= TWIN_COLUMNS[c]) {
        stage = c + 1;
      }
    }

    // The atoms: each column waits, excited, until the photons pass.
    for (var col = 0; col < TWIN_COLUMNS.length; col++) {
      var passedAt = TWIN_START + (TWIN_COLUMNS[col] - 150) / TWIN_SPEED;
      var energy = 1 - ease((t - passedAt) / 0.35);
      var atomsHere = Math.pow(2, col);
      for (var a = 0; a < atomsHere; a++) {
        drawAtom(TWIN_COLUMNS[col], twinY(col, a), energy);
      }
    }
    text(word("intro.excitedAtoms"), 640, 80, { size: 20, color: colors.muted, alpha: fadeIn(t, 25.3, 0.5) });

    if (t <= TWIN_START) {
      return;
    }

    var count = Math.pow(2, stage);
    for (var p = 0; p < count; p++) {
      var y;
      if (stage === 0) {
        y = twinY(0, 0);
      } else {
        var from = twinY(stage - 1, Math.floor(p / 2));
        var to = twinY(stage, p);
        y = lerp(from, to, ease((x - TWIN_COLUMNS[stage - 1]) / 90));
      }
      drawPhoton(x, y, 1, 0, colors.beam, false);
    }

    // The big counter: 1, 2, 4, 8.
    text(String(count), 1090, 140, { size: 64, weight: "800", color: colors.beam, align: "right" });
    text(word(count === 1 ? "intro.photon" : "intro.photons"), 1102, 148, {
      size: 26, weight: "600", color: colors.heading, align: "left", maxWidth: 160
    });

    // Point at the very first twin.
    if (x > TWIN_COLUMNS[0] + 20 && x < TWIN_COLUMNS[1] - 20) {
      text(word("intro.twin"), x - 30, twinY(1, 1) + 44, { size: 22, weight: "700", color: colors.beam });
    }
  }

  /* ---------- Scenes 6-7 (35-52 s): the bench, as on the lab page ---------- */

  var AXIS = 270;
  var BACK = { x: 170, y: AXIS - 95, w: 18, h: 190 };
  var OUTPUT = { x: 1092, y: AXIS - 95, w: 18, h: 190 };
  var ROD = { x: 370, y: AXIS - 30, w: 540, h: 60 };
  var TUBE = { x: 390, y: AXIS + 95, w: 500, h: 22, cap: 14 };
  var RAIL = AXIS + 195;
  var RAY_OFFSETS = [-20, -10, 0, 10, 20];
  // The photons' lanes in the order they fill up (the middle first), and
  // the lane each new one splits off from.
  var LANE_ORDER = [2, 1, 3, 0, 4];
  var LANE_PARENT = { 1: 2, 3: 2, 0: 1, 4: 3 };

  function sceneBench(t) {
    var tt = t - 35;
    var labelsAlpha = fadeIn(t, 36, 0.8);

    // The lamp flashes on and off; the light inside builds up over 9 s.
    var pump = 0.55 + 0.45 * Math.sin(t * 6);
    var strength = clamp(tt / 9, 0.03, 1);
    var rayStrength = Math.sqrt(strength);

    // The whole bench faintly tinted by the flash, as on the page.
    g.save();
    g.globalAlpha *= 0.1 * pump;
    g.fillStyle = colors.flash;
    g.fillRect(0, 0, W, H);
    g.restore();

    // The rail and the posts.
    g.save();
    g.fillStyle = colors.line;
    g.fillRect(110, RAIL, W - 220, 3);
    g.restore();
    drawPost(BACK.x + BACK.w / 2, BACK.y + BACK.h + 4, RAIL);
    drawPost(OUTPUT.x + OUTPUT.w / 2, OUTPUT.y + OUTPUT.h + 4, RAIL);
    drawPost(TUBE.x + 60, TUBE.y + TUBE.h, RAIL);
    drawPost(TUBE.x + TUBE.w - 60, TUBE.y + TUBE.h, RAIL);

    drawFlashlamp(TUBE, pump, t, ROD);

    // The rays between the mirrors, stronger as the light builds up.
    var left = BACK.x + BACK.w;
    var right = OUTPUT.x;
    for (var r = 0; r < RAY_OFFSETS.length; r++) {
      ray(left, AXIS + RAY_OFFSETS[r], right, AXIS + RAY_OFFSETS[r], rayStrength, 1.8);
    }

    drawRuby(ROD, pump);

    // Arrowheads in the gaps between the mirrors and the rod: every second
    // ray to the right, the others to the left.
    g.save();
    g.fillStyle = colors.beam;
    g.globalAlpha *= rayStrength;
    for (var a = 0; a < RAY_OFFSETS.length; a++) {
      if (a % 2 === 0) {
        arrowHead(1010, AXIS + RAY_OFFSETS[a], 1, 0, 9);
      } else {
        arrowHead(270, AXIS + RAY_OFFSETS[a], -1, 0, 9);
      }
    }
    g.restore();

    drawMirror(BACK, true, true, AXIS, 38);
    drawMirror(OUTPUT, false, false, AXIS, 38);

    // A few photons bouncing back and forth. A new twin is born inside the
    // ruby, where the excited atoms are (in its middle, on each pass), never
    // at a mirror: it splits off the photon in the lane beside it.
    if (t < 46) {
      var passTime = 1.6;
      var pass = Math.floor(tt / passTime);
      var phase = (tt % (2 * passTime)) / (2 * passTime);
      var x;
      var direction;
      if (phase < 0.5) {
        x = lerp(left + 30, right - 50, phase * 2);
        direction = 1;
      } else {
        x = lerp(right - 30, left + 50, (phase - 0.5) * 2);
        direction = -1;
      }
      var middle = ROD.x + ROD.w / 2;
      var pastMiddle = direction === 1 ? x >= middle : x <= middle;
      var born = 1 + pass + (pastMiddle ? 1 : 0);
      var count = Math.min(born, LANE_ORDER.length);
      // How far the newest photon has come since it was born (px).
      var sinceBirth = Math.abs(x - middle);
      g.save();
      g.globalAlpha *= 1 - fadeIn(t, 45.2, 0.8);
      for (var p = 0; p < count; p++) {
        var lane = LANE_ORDER[p];
        var y = AXIS + RAY_OFFSETS[lane];
        // The newest, just born this pass: it slides out of its parent's lane.
        if (p === count - 1 && p > 0 && pastMiddle && born <= LANE_ORDER.length) {
          var parentY = AXIS + RAY_OFFSETS[LANE_PARENT[lane]];
          y = lerp(parentY, y, ease(sinceBirth / 60));
        }
        drawPhoton(x, y, direction, 0, colors.beam, false);
      }
      g.restore();
    }

    // The parts' names, as the page writes them.
    text(word("bench.parts.backMirror"), BACK.x + BACK.w / 2, BACK.y - 46, {
      size: 20, weight: "600", color: colors.heading, alpha: labelsAlpha, maxWidth: 240
    });
    text(word("intro.reflectsAll"), BACK.x + BACK.w / 2, BACK.y - 22, {
      size: 17, color: colors.muted, alpha: labelsAlpha, maxWidth: 260
    });
    text(word("bench.parts.outputMirror"), OUTPUT.x + OUTPUT.w / 2, OUTPUT.y - 46, {
      size: 20, weight: "600", color: colors.heading, alpha: labelsAlpha, maxWidth: 240
    });
    text(word("intro.letsOut"), OUTPUT.x + OUTPUT.w / 2, OUTPUT.y - 22, {
      size: 17, color: colors.muted, alpha: labelsAlpha, maxWidth: 260
    });
    text(word("media.ruby"), ROD.x + ROD.w / 2, ROD.y - 26, {
      size: 20, weight: "600", color: colors.heading, alpha: labelsAlpha
    });
    text(word("pumps.flashlamp"), TUBE.x + TUBE.w / 2, RAIL + 30, {
      size: 20, weight: "600", color: colors.heading, alpha: labelsAlpha
    });

    // Scene 7: the beam leaves through the output mirror.
    if (t <= 45) {
      return;
    }
    var head = lerp(OUTPUT.x + OUTPUT.w, W + 30, ease((t - 45) / 1.0));
    var outRays = [-10, 0, 10];
    for (var o = 0; o < outRays.length; o++) {
      ray(OUTPUT.x + OUTPUT.w, AXIS + outRays[o], head, AXIS + outRays[o], 1, 2.4);
    }
    g.save();
    g.fillStyle = colors.beam;
    g.globalAlpha *= fadeIn(t, 45.6, 0.3);
    arrowHead(1215, AXIS, 1, 0, 12);
    g.restore();
    // Its name above it, its wavelength under it, clear of the mirror's knobs.
    text(word("intro.beam"), 1200, AXIS - 42, {
      size: 20, weight: "700", color: colors.beam, alpha: fadeIn(t, 45.8, 0.5), maxWidth: 150
    });
    text(global.LaserUI.format.si(colors.lam, "m"), 1200, AXIS + 44, {
      size: 17, color: colors.muted, alpha: fadeIn(t, 45.8, 0.5)
    });

    // Three short words about the beam, as the site's ghost buttons.
    for (var c = 0; c < 3; c++) {
      var chipAlpha = fadeIn(t, 47 + c * 1.3, 0.5);
      var cx = 400 + c * 240;
      g.save();
      g.globalAlpha *= chipAlpha;
      g.fillStyle = colors.white;
      g.strokeStyle = colors.ghostBorder;
      g.lineWidth = 1.5;
      roundRect(cx - 105, 515, 210, 46, 23);
      g.fill();
      g.stroke();
      g.restore();
      text(word("intro.chips." + c), cx, 538, {
        size: 21, weight: "600", color: colors.heading, alpha: chipAlpha, maxWidth: 190
      });
    }
  }

  /* ---------- Scene 8 (52-60 s): the title, like the lab page's head ---------- */

  function sceneTitle(t) {
    eyebrow(word("page.eyebrow"), W / 2, 215, fadeIn(t, 52.4, 0.8));
    text(word("page.title"), W / 2, 290, {
      size: 100, weight: "800", color: colors.heading, alpha: fadeIn(t, 52.4, 0.8), maxWidth: 1100
    });
    if (t > 53) {
      var head = lerp(250, W - 250, ease((t - 53) / 1.4));
      ray(250, 372, head - 12, 372, 1, 4);
      g.save();
      g.fillStyle = colors.beam;
      arrowHead(head, 372, 1, 0, 16);
      g.restore();
    }
    text(word("intro.last"), W / 2, 450, {
      size: 28, weight: "600", color: colors.muted, alpha: fadeIn(t, 54.8, 0.8), maxWidth: 1100
    });
  }

  /* ---------- Captions ---------- */

  function drawCaption(t) {
    for (var i = 0; i < CAPTION_STARTS.length; i++) {
      var start = CAPTION_STARTS[i];
      var end = i + 1 < CAPTION_STARTS.length ? CAPTION_STARTS[i + 1] : DURATION;
      if (t < start || t > end) {
        continue;
      }
      var alpha = clamp(Math.min((t - start) / 0.4, (end - t) / 0.4), 0, 1);
      if (i === 0) {
        alpha = clamp((end - t) / 0.4, 0, 1); // there from the first picture
      }
      if (end === DURATION) {
        alpha = clamp((t - start) / 0.4, 0, 1); // stays to the end
      }
      var words = word("intro.captions." + i);
      if (!words) {
        continue;
      }
      g.save();
      g.font = "25px " + colors.font;
      var lines = wrapText(words, 1120);
      g.restore();
      var top = H - 30 - lines.length * 34;
      for (var j = 0; j < lines.length; j++) {
        text(lines[j], W / 2, top + j * 34 + 17, { size: 25, color: colors.text, alpha: alpha });
      }
    }
  }

  /* ---------- One moment of the film ---------- */

  // Draw a scene, fading it in at its start and out at its end.
  function drawScene(sceneFunction, t, start, end) {
    var fade = 0.6;
    var alpha = clamp(Math.min((t - start) / fade, (end - t) / fade), 0, 1);
    if (start === 0) {
      alpha = clamp((end - t) / fade, 0, 1);
    }
    if (end === DURATION) {
      alpha = clamp((t - start) / fade, 0, 1);
    }
    if (alpha <= 0) {
      return;
    }
    g.save();
    g.globalAlpha = alpha;
    sceneFunction(t);
    g.restore();
  }

  function drawFrame(t) {
    g.fillStyle = colors.bg;
    g.fillRect(0, 0, W, H);
    drawScene(sceneOpening, t, 0, 5.3);
    drawScene(sceneLevels, t, 4.9, 25.2);
    drawScene(sceneTwins, t, 25.0, 35.2);
    drawScene(sceneBench, t, 35.0, 52.2);
    drawScene(sceneTitle, t, 52.0, DURATION);
    drawCaption(t);
  }

  /* ---------- The overlay: opening, playing, closing ---------- */

  // The "skip" icon: two triangles and a bar (aria-hidden, the word names it).
  var SKIP_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
    '<path d="M4 5l8 7-8 7z M12 5l8 7-8 7z" fill="currentColor"/>' +
    '<rect x="20" y="5" width="2" height="14" fill="currentColor"/></svg>';

  function makeOverlay() {
    var box = document.createElement("div");
    box.className = "laser-intro";
    box.hidden = true;
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");

    var canvas = document.createElement("canvas");
    canvas.className = "laser-intro__film";
    canvas.setAttribute("role", "img");
    box.appendChild(canvas);

    var skip = document.createElement("button");
    skip.type = "button";
    skip.className = "laser-intro__skip";
    var skipWord = document.createElement("span");
    skip.appendChild(skipWord);
    skip.insertAdjacentHTML("beforeend", SKIP_ICON);
    skip.addEventListener("click", close);
    box.appendChild(skip);

    document.body.appendChild(box);
    return { box: box, canvas: canvas, skip: skip, skipWord: skipWord };
  }

  // The canvas's pixels follow its size on screen (sharp on any screen).
  function resize() {
    var canvas = overlay.canvas;
    var ratio = Math.min(global.devicePixelRatio || 1, 2);
    var width = canvas.clientWidth;
    if (!width) return;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(width * ratio * H / W);
    var scale = canvas.width / W;
    g.setTransform(scale, 0, 0, scale, 0, 0);
    drawFrame(time);
  }

  function writeWords() {
    var label = word("intro.label");
    overlay.box.setAttribute("aria-label", label);
    overlay.canvas.setAttribute("aria-label", label);
    overlay.skipWord.textContent = word("intro.skip");
  }

  function tick(now) {
    if (lastFrame !== null) {
      time += Math.min((now - lastFrame) / 1000, 0.1);
    }
    lastFrame = now;
    if (time >= DURATION + CLOSE_AFTER) {
      close();
      return;
    }
    drawFrame(Math.min(time, DURATION));
    frame = global.requestAnimationFrame(tick);
  }

  function onKey(event) {
    if (event.key === "Escape") {
      close();
    }
  }

  function open() {
    if (frame !== null || !data) return;
    if (!global.LaserUI || !global.LaserUI.materials || !global.LaserEngine) return;
    if (!overlay) {
      overlay = makeOverlay();
      g = overlay.canvas.getContext("2d");
    }
    colors = readColours();
    writeWords();
    time = 0;
    lastFrame = null;
    overlay.box.hidden = false;
    document.documentElement.classList.add("laser-intro-open");
    global.addEventListener("resize", resize);
    global.addEventListener("keydown", onKey);
    resize();
    overlay.skip.focus();
    frame = global.requestAnimationFrame(tick);
  }

  function close() {
    if (frame !== null) {
      global.cancelAnimationFrame(frame);
      frame = null;
    }
    if (!overlay) return;
    overlay.box.hidden = true;
    document.documentElement.classList.remove("laser-intro-open");
    global.removeEventListener("resize", resize);
    global.removeEventListener("keydown", onKey);
  }

  function asksForLessMotion() {
    return global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  // The page's words, from each build (a language switch builds it again).
  global.addEventListener("section:ready", function (event) {
    var detail = event.detail || {};
    if (detail.route !== ROUTE) return;
    data = detail.data || null;
    if (overlay && frame !== null) writeWords();
  });

  // The film opens each time the laser page comes on screen, and closes
  // if the visitor goes to another page meanwhile (the browser's Back).
  global.addEventListener("view:shown", function (event) {
    var detail = event.detail || {};
    if (detail.route !== ROUTE) {
      close();
      return;
    }
    if (asksForLessMotion()) return;
    open();
  });
})(this);
