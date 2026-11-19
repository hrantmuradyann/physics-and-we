/* ============================================================================
   draw-stability.js — the stability diagram of the two mirrors
   (docs/laser-physics.md §7.1; docs/laser-plan.md, stage 10b).

   PART OF THE LASER PAGE'S DRAWING (js/laser/ui/): it draws, and never
   does physics. A pair of mirrors is a point (g₁, g₂); the pair keeps the
   light between the mirrors (it is stable) inside the shaded region,
   0 < g₁g₂ < 1, which the two branches of the hyperbola g₁g₂ = 1 and the
   two axes bound. A dot shows the bench's pair, and moves as the visitor
   bends a mirror.

     LaserUI.stability.SIZE          { aspect, minHeight, maxHeight }: the
                                     canvas proportions, for the loop
     LaserUI.stability.WORDS         the names of the words, the keys of
                                     `words` below
     LaserUI.stability.RANGE         the axes run from −RANGE to RANGE
     LaserUI.stability.layout(w, h)  where the plot and every word go, in
                                     CSS pixels
     LaserUI.stability.toPlot(P, g1, g2)   the pixel of the point (g₁, g₂)
                                     on the layout P, not held inside it
     LaserUI.stability.draw(view, words, pair)
         view    what LaserUI.loop hands its draw function
         words   { title, stable, g1, g2 }: already in the visitor's
                 language; an empty one is left out
         pair    { g1, g2, stable } (the engine's resonator), or null for
                 no dot. A point past the axes' ends is drawn hollow at
                 the edge, in its direction

   Colours come only from view.colors (the theme).

   Tests: tests/laser/draw-stability.test.js
   ========================================================================== */
(function (root) {
  "use strict";

  var UI = root.LaserUI = root.LaserUI || {};

  var SIZE = Object.freeze({ aspect: 1.3, minHeight: 220, maxHeight: 340 });
  var WORDS = Object.freeze(["title", "stable", "g1", "g2"]);
  var RANGE = 2;
  // Points along each branch of the hyperbola g₁g₂ = 1.
  var CURVE_POINTS = 40;

  function clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
  }

  // Where everything goes on a canvas w × h CSS pixels: a square plot
  // under the title, its axes crossing in the middle.
  function layout(w, h) {
    var pad = Math.max(10, 0.04 * w);
    var fontSize = clamp(Math.round(0.055 * h), 11, 14);
    var top = pad + 1.7 * fontSize;                 // under the title
    var bottom = h - pad;
    var size = Math.min(w - 2 * pad - 2 * fontSize, bottom - top);
    var center = { x: w / 2, y: (top + bottom) / 2 };
    var plot = { x: center.x - size / 2, y: center.y - size / 2, size: size };
    var perUnit = size / (2 * RANGE);
    return {
      fontSize: fontSize,
      pad: pad,
      plot: plot,
      center: center,
      perUnit: perUnit,
      dot: Math.max(4, 0.025 * size),
      labels: {
        title: { x: pad, y: pad + fontSize, align: "left", maxWidth: w - 2 * pad },
        // g₁ just above the horizontal axis at its right end (under it, it
        // shared the "1" tick's line and covered it on a phone: stage 10b
        // review), g₂ beside the vertical axis at its top.
        g1: { x: plot.x + size, y: center.y - 0.45 * fontSize, align: "right", maxWidth: size / 2 - fontSize },
        g2: { x: center.x + 0.5 * fontSize, y: plot.y + fontSize, align: "left", maxWidth: size / 2 - fontSize },
        // In the shaded region of the first quadrant, at (0.45, 0.45).
        stable: { x: center.x + 0.45 * perUnit, y: center.y - 0.45 * perUnit + 0.35 * fontSize, align: "center", maxWidth: 0.8 * perUnit }
      }
    };
  }

  function toPlot(P, g1, g2) {
    return { x: P.center.x + g1 * P.perUnit, y: P.center.y - g2 * P.perUnit };
  }

  // The stable region of one quadrant (sign +1: the first, −1: the third):
  // from the corner at the origin up the g₂ axis to the hyperbola, along it,
  // and back down the g₁ axis.
  function stableRegion(g, P, sign) {
    var start = 1 / RANGE;
    var corner = toPlot(P, 0, 0);
    g.beginPath();
    g.moveTo(corner.x, corner.y);
    var up = toPlot(P, 0, sign * RANGE);
    g.lineTo(up.x, up.y);
    for (var k = 0; k <= CURVE_POINTS; k++) {
      var g1 = start + (RANGE - start) * k / CURVE_POINTS;
      var point = toPlot(P, sign * g1, sign / g1);
      g.lineTo(point.x, point.y);
    }
    var across = toPlot(P, sign * RANGE, 0);
    g.lineTo(across.x, across.y);
    g.closePath();
    g.fill();
  }

  // One branch of g₁g₂ = 1 inside the plot.
  function hyperbola(g, P, sign) {
    var start = 1 / RANGE;
    g.beginPath();
    for (var k = 0; k <= CURVE_POINTS; k++) {
      var g1 = start + (RANGE - start) * k / CURVE_POINTS;
      var point = toPlot(P, sign * g1, sign / g1);
      if (k === 0) g.moveTo(point.x, point.y);
      else g.lineTo(point.x, point.y);
    }
    g.stroke();
  }

  function line(g, x1, y1, x2, y2) {
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  }

  function writeWord(g, text, spot) {
    if (!text || !(spot.maxWidth > 0)) return;
    g.textAlign = spot.align;
    g.fillText(text, spot.x, spot.y, spot.maxWidth);
  }

  function draw(view, words, pair) {
    var g = view.g;
    var colors = view.colors;
    var P = layout(view.w, view.h);
    var w = words || {};

    g.clearRect(0, 0, view.w, view.h);
    g.save();

    // The stable region, shaded, and its edges.
    g.fillStyle = colors.accent;
    g.globalAlpha = 0.16;
    stableRegion(g, P, 1);
    stableRegion(g, P, -1);
    g.globalAlpha = 0.7;
    g.strokeStyle = colors.accent;
    g.lineWidth = 1.5;
    hyperbola(g, P, 1);
    hyperbola(g, P, -1);
    g.globalAlpha = 1;

    // The axes, with a tick at ±1 and ±2 and the numbers ±1.
    var left = toPlot(P, -RANGE, 0);
    var right = toPlot(P, RANGE, 0);
    var bottom = toPlot(P, 0, -RANGE);
    var top = toPlot(P, 0, RANGE);
    g.strokeStyle = colors.line;
    g.lineWidth = 1;
    line(g, left.x, left.y, right.x, right.y);
    line(g, bottom.x, bottom.y, top.x, top.y);
    var tick = 4;
    [-2, -1, 1, 2].forEach(function (value) {
      var onX = toPlot(P, value, 0);
      var onY = toPlot(P, 0, value);
      line(g, onX.x, onX.y - tick, onX.x, onX.y + tick);
      line(g, onY.x - tick, onY.y, onY.x + tick, onY.y);
    });
    g.fillStyle = colors.muted;
    g.font = (P.fontSize - 1) + "px " + view.font;
    g.textBaseline = "alphabetic";
    [-1, 1].forEach(function (value) {
      var text = value < 0 ? "−1" : "1";
      var onX = toPlot(P, value, 0);
      var onY = toPlot(P, 0, value);
      g.textAlign = "center";
      g.fillText(text, onX.x, onX.y + tick + P.fontSize, P.fontSize * 2);
      g.textAlign = "right";
      g.fillText(text, onY.x - tick - 2, onY.y + 0.35 * P.fontSize, P.fontSize * 2);
    });

    // The words.
    g.font = "600 " + P.fontSize + "px " + view.font;
    g.fillStyle = colors.heading;
    writeWord(g, w.title, P.labels.title);
    g.fillStyle = colors.muted;
    writeWord(g, w.g1, P.labels.g1);
    writeWord(g, w.g2, P.labels.g2);
    g.fillStyle = colors.accent;
    writeWord(g, w.stable, P.labels.stable);

    // The bench's pair: a dot, solid and in the accent colour when stable;
    // hollow at the edge when it lies past the axes' ends.
    if (pair && typeof pair.g1 === "number" && typeof pair.g2 === "number" && isFinite(pair.g1) && isFinite(pair.g2)) {
      var inside = Math.abs(pair.g1) <= RANGE && Math.abs(pair.g2) <= RANGE;
      var at = toPlot(P, clamp(pair.g1, -RANGE, RANGE), clamp(pair.g2, -RANGE, RANGE));
      g.beginPath();
      g.arc(at.x, at.y, P.dot, 0, 2 * Math.PI);
      g.lineWidth = 2;
      g.strokeStyle = colors.heading;
      if (inside) {
        g.fillStyle = pair.stable ? colors.accent2 : colors.muted;
        g.fill();
      }
      g.stroke();
    }

    g.restore();
  }

  UI.stability = Object.freeze({
    SIZE: SIZE,
    WORDS: WORDS,
    RANGE: RANGE,
    layout: layout,
    toPlot: toPlot,
    draw: draw
  });
})(this);
