/* =========================================================================
   The laser intro tour's drawing helpers (js/laser-intro.js is the tour,
   js/laser-intro-steps.js its eight steps).

   Every step draws on one 1280 x 720 board with these. They draw with the
   context and the colours the tour hands them (LaserIntro.draw.use(g,
   colors)): the lab's --laser-* colours, the site's --red for laser light,
   and the physical ones (mirror glass, ruby, the candle, amber light) from
   js/laser/ui/materials.js. No colour is written out here.

   The mirror, the flashlamp, the ruby, the atom and the photon are drawn
   as on the lab's bench and in the old one-minute film they come from.

   Adds LaserIntro.draw (the tour's one global is LaserIntro).
   ========================================================================= */

(function (global) {
  "use strict";

  var LaserIntro = global.LaserIntro = global.LaserIntro || {};

  var g = null;       // the canvas's 2D context
  var colors = null;  // the colours the tour read (laser-intro.js, readColours)

  function use(context, colours) {
    g = context;
    colors = colours;
  }

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  /* ---------- Lines, shapes and words ---------- */

  function text(words, x, y, options) {
    if (!words) return;
    options = options || {};
    g.save();
    g.globalAlpha *= (options.alpha === undefined) ? 1 : options.alpha;
    g.fillStyle = options.color || colors.text;
    g.font = (options.weight || "normal") + " " + (options.size || 22) + "px " + colors.font;
    g.textAlign = options.align || "center";
    g.textBaseline = "middle";
    if (options.maxWidth) {
      g.fillText(words, x, y, options.maxWidth);
    } else {
      g.fillText(words, x, y);
    }
    g.restore();
  }

  function line(x1, y1, x2, y2) {
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  }

  function dashed(x1, y1, x2, y2, colour, width) {
    g.save();
    g.strokeStyle = colour || colors.muted;
    g.lineWidth = width || 1.5;
    g.setLineDash([7, 6]);
    line(x1, y1, x2, y2);
    g.setLineDash([]);
    g.restore();
  }

  // A filled arrowhead with its tip at (x, y), pointing along (dx, dy).
  function arrowHead(x, y, dx, dy, size) {
    g.beginPath();
    g.moveTo(x, y);
    // the base's two corners, on either side across (dx, dy): along (-dy, dx)
    g.lineTo(x - dx * size - dy * 0.55 * size, y - dy * size + dx * 0.55 * size);
    g.lineTo(x - dx * size + dy * 0.55 * size, y - dy * size - dx * 0.55 * size);
    g.closePath();
    g.fill();
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

  // A soft round glow: a few circles, each fainter and wider (no
  // gradients, so it draws the same everywhere).
  function glow(x, y, radius, colour, alpha) {
    if (alpha <= 0) return;
    var base = g.globalAlpha;   // a fade around the glow dims it too
    g.save();
    g.fillStyle = colour;
    for (var ring = 4; ring >= 1; ring--) {
      g.globalAlpha = base * clamp(alpha, 0, 1) * 0.12 * (5 - ring);
      g.beginPath();
      g.arc(x, y, radius * ring / 4, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  // A small label box with a line of words (a readout on the picture).
  function tag(words, x, y, options) {
    if (!words) return;
    options = options || {};
    var size = options.size || 20;
    var width = options.width || 260;
    g.save();
    g.globalAlpha *= (options.alpha === undefined) ? 1 : options.alpha;
    g.fillStyle = colors.white;
    g.strokeStyle = options.border || colors.line;
    g.lineWidth = 1.5;
    roundRect(x - width / 2, y - size, width, size * 2, 6);
    g.fill();
    g.stroke();
    g.restore();
    text(words, x, y + 1, {
      size: size * 0.85, color: options.color || colors.heading, weight: "600",
      maxWidth: width - 16, alpha: options.alpha
    });
  }

  // A scale bar from x1 to x2 at height y, with its words under it.
  function scaleBar(x1, x2, y, words) {
    g.save();
    g.strokeStyle = colors.muted;
    g.fillStyle = colors.muted;
    g.lineWidth = 1.5;
    line(x1, y, x2, y);
    line(x1, y - 8, x1, y + 8);
    line(x2, y - 8, x2, y + 8);
    g.restore();
    text(words, (x1 + x2) / 2, y + 24, { size: 19, color: colors.muted });
  }

  /* ---------- Light ---------- */

  // A short pulse of light: a few waves under a bell-shaped envelope, with
  // a soft glow, moving along `dir` (+1 right, -1 left). `strength` 0..1
  // sets its height and how strongly it shows.
  function packet(x, y, dir, strength, colour, glowColour) {
    var s = clamp(strength, 0, 1);
    if (s <= 0.002) return;
    var length = 90;
    var height = 6 + 22 * s;
    glow(x, y, 60, glowColour || colour, 0.25 + 0.5 * s);
    g.save();
    g.globalAlpha *= 0.35 + 0.65 * Math.sqrt(s);
    g.strokeStyle = colour;
    g.lineWidth = 3;
    g.lineCap = "round";
    g.beginPath();
    for (var k = 0; k <= 60; k++) {
      var along = -length / 2 + k / 60 * length;
      var envelope = Math.exp(-Math.pow(along / (length / 3.2), 2));
      var across = height * envelope * Math.sin(along / length * 6 * Math.PI);
      if (k === 0) g.moveTo(x + along, y + across);
      else g.lineTo(x + along, y + across);
    }
    g.stroke();
    g.fillStyle = colour;
    arrowHead(x + dir * (length / 2 + 14), y, dir, 0, 12);
    g.restore();
  }

  // A wave from x0 to x1 around height y: amplitude `amp` px, wavelength
  // `lengthPx` px, phase `phase` (radians), moved along by `shift` px.
  function wave(x0, x1, y, amp, lengthPx, phase, shift, colour, width, alpha) {
    g.save();
    g.globalAlpha *= (alpha === undefined) ? 1 : alpha;
    g.strokeStyle = colour;
    g.lineWidth = width || 2.5;
    g.lineJoin = "round";
    g.beginPath();
    for (var x = x0; x <= x1; x += 3) {
      var yy = y - amp * Math.sin(2 * Math.PI * (x - x0 - shift) / lengthPx + phase);
      if (x === x0) g.moveTo(x, yy);
      else g.lineTo(x, yy);
    }
    g.stroke();
    g.restore();
  }

  // A curve through points [{ x, y }] (the sum of several waves).
  function curve(points, colour, width, alpha) {
    if (points.length < 2) return;
    g.save();
    g.globalAlpha *= (alpha === undefined) ? 1 : alpha;
    g.strokeStyle = colour;
    g.lineWidth = width || 3;
    g.lineJoin = "round";
    g.beginPath();
    g.moveTo(points[0].x, points[0].y);
    for (var i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
    g.stroke();
    g.restore();
  }

  /* ---------- The parts, drawn as on the lab's bench ---------- */

  // An atom: a ring when calm, a filled glowing graphite disc when
  // excited. energy goes from 0 (calm) to 1 (excited).
  function atom(x, y, energy, radius) {
    radius = radius || 15;
    g.save();
    g.beginPath();
    g.arc(x, y, radius, 0, Math.PI * 2);
    g.fillStyle = colors.bg;
    g.fill();
    g.strokeStyle = colors.muted;
    g.lineWidth = 1.6;
    g.stroke();
    if (energy > 0) {
      g.globalAlpha *= clamp(energy, 0, 1);
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

  // A photon: a short wave with an arrowhead, flying along (dx, dy);
  // `size` scales it (1 = as in the lab's cartoon). One an atom sent out on
  // its own (`stray`) has a dashed wave, as in the lab's cartoon: the
  // ruby's red, but not yet laser light.
  function photon(x, y, dx, dy, colour, alpha, size, stray) {
    var length = 34;
    g.save();
    g.globalAlpha *= (alpha === undefined) ? 1 : alpha;
    g.translate(x, y);
    g.rotate(Math.atan2(dy, dx));
    if (size) g.scale(size, size);
    g.strokeStyle = colour;
    g.fillStyle = colour;
    g.lineWidth = 2.6;
    g.lineCap = "round";
    if (stray) g.setLineDash([5, 4]);
    g.beginPath();
    for (var k = 0; k <= 16; k++) {
      var along = -length / 2 + k / 16 * length;
      var across = 0.16 * length * Math.sin(k / 16 * 3 * Math.PI);
      if (k === 0) g.moveTo(along, across);
      else g.lineTo(along, across);
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

  // A flat mirror seen from the side: pale green glass with a glint, a
  // silver coating on the face towards the laser, in a metal mount (with a
  // hole for the light) with an adjusting knob at the top and the bottom.
  // `back` is the left mirror; `strong` reflects everything, otherwise its
  // coating is thinner and see-through.
  function mirror(m, back, strong, axisY, holeHalf) {
    var outer = back ? m.x : m.x + m.w;
    var inner = back ? m.x + m.w : m.x;
    var towardsLaser = back ? 1 : -1;
    var plate = 6;
    var knob = 4;

    g.save();
    var plateX = back ? outer - plate : outer;
    var holeTop = axisY - holeHalf;
    var holeBottom = axisY + holeHalf;
    g.fillStyle = colors.muted;
    g.fillRect(plateX, m.y - 4, plate, holeTop - (m.y - 4));
    g.fillRect(plateX, holeBottom, plate, m.y + m.h + 4 - holeBottom);
    var knobX = outer - towardsLaser * (plate + knob);
    var knobYs = [m.y + 0.12 * m.h, m.y + 0.88 * m.h];
    for (var i = 0; i < knobYs.length; i++) {
      g.fillRect(Math.min(outer, knobX), knobYs[i] - 1, plate + knob, 2);
      g.fillRect(knobX - knob, knobYs[i] - 1.6 * knob, 2 * knob, 3.2 * knob);
    }

    g.save();
    g.globalAlpha *= 0.55;
    g.fillStyle = colors.mirrorGlass;
    g.fillRect(m.x, m.y, m.w, m.h);
    g.restore();
    g.strokeStyle = colors.mirrorEdge;
    g.lineWidth = 1;
    g.strokeRect(m.x, m.y, m.w, m.h);

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
    g.restore();

    g.save();
    g.strokeStyle = colors.silver;
    g.lineWidth = strong ? 4 : 2.5;
    g.globalAlpha *= strong ? 1 : 0.55;
    line(inner, m.y, inner, m.y + m.h);
    g.restore();

    g.fillStyle = colors.muted;
    g.fillRect(m.x - 2, m.y - 4, m.w + 4, 4);
    g.fillRect(m.x - 2, m.y + m.h, m.w + 4, 4);
    g.restore();
  }

  // A post from a part down to the bench's rail, with a foot.
  function post(x, fromY, railY) {
    g.save();
    g.fillStyle = colors.muted;
    g.fillRect(x - 2, fromY, 4, railY - fromY);
    g.fillRect(x - 12, railY - 4, 24, 4);
    g.restore();
  }

  // The bench's rail.
  function rail(x1, x2, y) {
    g.save();
    g.fillStyle = colors.line;
    g.fillRect(x1, y, x2 - x1, 6);
    g.restore();
  }

  // A flashlamp: a glass tube with a metal cap at each end. `pump` (0..1)
  // is how brightly it burns; `rod`, if given, gets the flash's broad beams.
  function flashlamp(F, pump, t, rod) {
    if (pump > 0.01) {
      g.save();
      g.fillStyle = colors.flash;
      g.globalAlpha *= 0.08 * pump;
      for (var ring = 1; ring <= 6; ring++) {
        g.beginPath();
        g.ellipse(F.x + F.w / 2, F.y + F.h / 2, F.w / 2 + ring * 7, F.h / 2 + ring * 7, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();

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
  // with the pump light it takes in.
  function ruby(R, lit, litColour) {
    g.save();
    g.globalAlpha *= 0.5;
    g.fillStyle = colors.ruby;
    g.fillRect(R.x, R.y, R.w, R.h);
    g.restore();

    if (lit > 0) {
      g.save();
      g.globalAlpha *= 0.3 * clamp(lit, 0, 1);
      g.fillStyle = litColour || colors.flash;
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

  // A candle standing on (x, baseY): its wax, its wick and, when lit
  // (flame > 0), a flickering flame whose middle is at flameY. Returns
  // nothing; the flame's light is drawn by the step.
  function candle(x, flameY, baseY, flame, t, still) {
    var bodyW = 44;
    var bodyTop = flameY + 34;
    var base = g.globalAlpha;   // the caller's fade: every alpha here is times it
    g.save();
    // the wax, a little darker on the right, with a melted rim on top
    g.fillStyle = colors.wax;
    g.fillRect(x - bodyW / 2, bodyTop, bodyW, baseY - bodyTop);
    g.globalAlpha = 0.12 * base;
    g.fillStyle = colors.shade;
    g.fillRect(x + bodyW / 6, bodyTop, bodyW / 3, baseY - bodyTop);
    g.globalAlpha = base;
    g.strokeStyle = colors.line;
    g.lineWidth = 1.2;
    g.strokeRect(x - bodyW / 2, bodyTop, bodyW, baseY - bodyTop);
    g.beginPath();
    g.ellipse(x, bodyTop, bodyW / 2, 5, 0, 0, Math.PI * 2);
    g.fillStyle = colors.wax;
    g.fill();
    g.stroke();
    // a holder
    g.fillStyle = colors.muted;
    g.fillRect(x - bodyW / 2 - 12, baseY, bodyW + 24, 6);
    // the wick
    g.strokeStyle = colors.wick;
    g.lineWidth = 3;
    line(x, bodyTop, x + 1, bodyTop - 14);
    g.restore();

    if (flame <= 0.01) return;
    var time = still ? 0 : t;
    var flicker = 1 + 0.07 * Math.sin(13 * time) + 0.05 * Math.sin(7.3 * time + 1) + 0.04 * Math.sin(23 * time + 2);
    var sway = 3 * Math.sin(5.1 * time) + 1.5 * Math.sin(11.7 * time);
    var h = 50 * flame * flicker;
    var w = 15 * (0.6 + 0.4 * flame);
    var bottom = bodyTop - 10;
    glow(x, bottom - h * 0.45, 50 + 40 * flame, colors.amberRaw, 0.45 * flame);
    // the blue at its root, under the flame
    g.save();
    g.globalAlpha = 0.35 * base;
    g.fillStyle = colors.flameBase;
    g.beginPath();
    g.ellipse(x, bottom - 4, w * 0.5, 5, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
    flamePath(x, bottom, w * 1.15, h * 1.05, sway);
    g.save();
    g.globalAlpha = 0.9 * base;
    g.fillStyle = colors.flameEdge;
    g.fill();
    g.restore();
    flamePath(x, bottom - 2, w * 0.65, h * 0.72, sway * 0.7);
    g.save();
    g.fillStyle = colors.flameCore;
    g.fill();
    g.restore();
    // the wick's tip, dark inside the flame
    g.save();
    g.strokeStyle = colors.wick;
    g.lineWidth = 2;
    line(x, bodyTop - 4, x + 1, bodyTop - 16);
    g.restore();
  }

  // A teardrop from (x, bottom) up to its tip, swayed sideways at the tip.
  function flamePath(x, bottom, w, h, sway) {
    g.beginPath();
    g.moveTo(x, bottom);
    g.bezierCurveTo(x - w, bottom - 2, x - w * 0.9, bottom - h * 0.6, x + sway, bottom - h);
    g.bezierCurveTo(x + w * 0.9, bottom - h * 0.6, x + w, bottom - 2, x, bottom);
    g.closePath();
  }

  // A convex lens seen edge-on, centred on (x, y), h tall.
  function lens(x, y, h) {
    var base = g.globalAlpha;   // the caller's fade
    g.save();
    g.beginPath();
    g.moveTo(x, y - h / 2);
    g.quadraticCurveTo(x + 22, y, x, y + h / 2);
    g.quadraticCurveTo(x - 22, y, x, y - h / 2);
    g.closePath();
    g.globalAlpha = 0.6 * base;
    g.fillStyle = colors.lensGlass;
    g.fill();
    g.globalAlpha = base;
    g.strokeStyle = colors.mirrorEdge;
    g.lineWidth = 1.3;
    g.stroke();
    g.restore();
  }

  LaserIntro.draw = Object.freeze({
    use: use,
    clamp: clamp,
    text: text,
    line: line,
    dashed: dashed,
    arrowHead: arrowHead,
    roundRect: roundRect,
    glow: glow,
    tag: tag,
    scaleBar: scaleBar,
    packet: packet,
    wave: wave,
    curve: curve,
    atom: atom,
    photon: photon,
    mirror: mirror,
    post: post,
    rail: rail,
    flashlamp: flashlamp,
    ruby: ruby,
    candle: candle,
    lens: lens,
    context: function () { return g; },
    colors: function () { return colors; }
  });
})(this);
