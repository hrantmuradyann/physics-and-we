/* ============================================================================
   draw-levels.js — the four levels of the gain medium and the gain/loss
   gauge (docs/laser-physics.md §11.6, items 1 and 2).

     LaserUI.levels.draw(view, picture)
       view     what loop.js passes to a draw: { g, w, h, colors, font, … }
       picture  { x, y, stim, words }
                x     pump rate / threshold rate (R_p/R_c)
                y     inversion / threshold inversion (N/N_c), now
                stim  stimulated emission now, in the same units (y·p):
                      x − 1 once the laser runs steadily
                words { pumpBand, upper, lower, ground, gain, loss };
                      a missing word is left out
     LaserUI.levels.layout(w, h)     where everything goes (CSS pixels)
     LaserUI.levels.scaleMax(picture)   the top of both scales, in units
                                        of the threshold

   Left: the levels, the pump arrow (ground → pump band) and the laser
   arrow (upper → lower) as wide as their rates, and a bar on the upper
   level filling up with the inversion, with a mark at threshold (no word:
   at a strong pump the mark sits on the upper level's name). Right: the
   gain bar against the loss line, which is the threshold. Above threshold the gain rises to
   the loss and stops there, whatever the pump: gain clamping (§4.1).
   Both use units of the threshold, so the loss is always 1.

   Tests: tests/laser/draw-panels.test.js
   ========================================================================== */
(function (root) {
  "use strict";

  var UI = root.LaserUI = root.LaserUI || {};

  var SIZE = Object.freeze({ aspect: 1.6, minHeight: 220, maxHeight: 320 });
  var HEADROOM = 1.15;            // room above the highest value on a scale
  var ARROW_FULL = 4;             // a rate of 4× threshold draws the widest arrow

  function clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
  }

  // Holds x, y and the loss (1) with room above, so nothing drawn on the
  // scale needs clamping (a clamp would only hide a wrong scale).
  function scaleMax(picture) {
    return Math.max(picture.x, picture.y, 1) * HEADROOM;
  }

  function layout(w, h) {
    var pad = Math.max(10, 0.03 * w);
    var fontSize = clamp(Math.round(0.05 * h), 11, 14);
    var split = 0.6 * w;                                 // levels | gauge
    var top = pad + 0.4 * fontSize;
    var bottom = h - pad - 1.6 * fontSize;               // room for the gauge's word
    var span = bottom - top;
    var lineLeft = pad;
    // The lines take a bit less than half, the level names the rest.
    var lineRight = lineLeft + 0.45 * (split - pad - lineLeft);
    var lineWidth = lineRight - lineLeft;
    var labelLeft = lineRight + 0.6 * fontSize;
    var upper = top + 0.36 * span;
    var gaugeLeft = split + pad;
    var gaugeRight = w - pad;
    var gaugeWidth = gaugeRight - gaugeLeft;
    var barWidth = Math.max(6, 0.1 * lineWidth);

    return {
      fontSize: fontSize,
      lineLeft: lineLeft,
      lineRight: lineRight,
      labelLeft: labelLeft,
      labelWidth: Math.max(1, split - pad - labelLeft),
      pumpBand: top + 0.06 * span,
      upper: upper,
      lower: top + 0.76 * span,
      ground: bottom,
      arrows: {
        pump: lineLeft + 0.14 * lineWidth,
        relaxTop: lineLeft + 0.34 * lineWidth,
        laser: lineLeft + 0.52 * lineWidth,
        relaxBottom: lineLeft + 0.68 * lineWidth
      },
      maxArrow: Math.max(3, 0.06 * lineWidth),
      bar: {
        x: lineRight - barWidth - 2,
        w: barWidth,
        top: upper - 0.26 * span,
        bottom: upper
      },
      gauge: {
        left: gaugeLeft,
        right: gaugeRight,
        top: top,
        bottom: bottom,
        gainX: gaugeLeft + 0.12 * gaugeWidth,
        gainW: 0.34 * gaugeWidth,
        wordY: h - pad
      }
    };
  }

  function word(words, name) {
    var value = words && words[name];
    return typeof value === "string" ? value : "";
  }

  function text(g, value, x, y, maxWidth) {
    if (value) g.fillText(value, x, y, maxWidth);
  }

  // A vertical arrow from y1 to y2, `width` wide; the head at y2.
  function arrow(g, x, y1, y2, width) {
    var head = Math.max(4, 1.6 * width);
    var direction = y2 > y1 ? 1 : -1;
    g.lineWidth = width;
    g.beginPath();
    g.moveTo(x, y1);
    g.lineTo(x, y2 - direction * head);
    g.stroke();
    g.beginPath();
    g.moveTo(x - head * 0.7, y2 - direction * head);
    g.lineTo(x + head * 0.7, y2 - direction * head);
    g.lineTo(x, y2);
    g.closePath();
    g.fill();
  }

  function draw(view, picture) {
    var g = view.g;
    var c = view.colors;
    var L = layout(view.w, view.h);
    var words = picture.words || {};
    var top = scaleMax(picture);

    g.clearRect(0, 0, view.w, view.h);
    g.save();
    g.font = L.fontSize + "px " + view.font;
    g.textBaseline = "alphabetic";

    /* the four levels */
    var levels = [
      { y: L.pumpBand, name: "pumpBand" },
      { y: L.upper, name: "upper" },
      { y: L.lower, name: "lower" },
      { y: L.ground, name: "ground" }
    ];
    g.strokeStyle = c.line;
    g.lineWidth = 2;
    levels.forEach(function (level) {
      g.beginPath();
      g.moveTo(L.lineLeft, level.y);
      g.lineTo(L.lineRight, level.y);
      g.stroke();
    });
    g.fillStyle = c.muted;
    g.textAlign = "left";
    levels.forEach(function (level) {
      text(g, word(words, level.name), L.labelLeft, level.y + 0.35 * L.fontSize, L.labelWidth);
    });

    /* fast relaxations, thin and dashed */
    g.strokeStyle = c.faint;
    g.setLineDash([3, 3]);
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(L.arrows.relaxTop, L.pumpBand);
    g.lineTo(L.arrows.relaxTop, L.upper);
    g.moveTo(L.arrows.relaxBottom, L.lower);
    g.lineTo(L.arrows.relaxBottom, L.ground);
    g.stroke();
    g.setLineDash([]);

    /* the pump and the laser transition, as wide as their rates */
    var pumpShare = clamp(picture.x / ARROW_FULL, 0, 1);
    if (pumpShare > 0) {
      g.strokeStyle = c.glow;
      g.fillStyle = c.glow;
      arrow(g, L.arrows.pump, L.ground, L.pumpBand, 1 + pumpShare * L.maxArrow);
    }
    var laserShare = clamp(picture.stim / ARROW_FULL, 0, 1);
    if (laserShare > 0.001) {
      g.strokeStyle = c.accent2;
      g.fillStyle = c.accent2;
      arrow(g, L.arrows.laser, L.upper, L.lower, 1 + laserShare * L.maxArrow);
    }

    /* the upper level's population: a bar with a mark at threshold */
    var slot = L.bar.bottom - L.bar.top;
    g.strokeStyle = c.grid;
    g.lineWidth = 1;
    g.strokeRect(L.bar.x, L.bar.top, L.bar.w, slot);
    var filled = picture.y / top * slot;
    if (filled > 0) {
      g.fillStyle = c.accent;
      g.globalAlpha = 0.75;
      g.fillRect(L.bar.x, L.bar.bottom - filled, L.bar.w, filled);
      g.globalAlpha = 1;
    }
    var markY = L.bar.bottom - slot / top;
    g.strokeStyle = c.soft;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(L.bar.x - 3, markY);
    g.lineTo(L.bar.x + L.bar.w + 3, markY);
    g.stroke();

    /* the gauge: gain against loss (units of the threshold) */
    var G = L.gauge;
    var span = G.bottom - G.top;
    g.strokeStyle = c.grid;
    g.lineWidth = 1;
    g.strokeRect(G.gainX, G.top, G.gainW, span);
    var gainHeight = span * picture.y / top;
    if (gainHeight > 0) {
      g.fillStyle = c.accent;
      g.fillRect(G.gainX, G.bottom - gainHeight, G.gainW, gainHeight);
    }
    // The small-signal gain: where the gain would be with no light at all.
    var smallY = G.bottom - span * picture.x / top;
    g.strokeStyle = c.muted;
    g.setLineDash([4, 3]);
    g.beginPath();
    g.moveTo(G.gainX, smallY);
    g.lineTo(G.gainX + G.gainW, smallY);
    g.stroke();
    g.setLineDash([]);
    // The loss: gain must reach it to lase.
    var lossY = G.bottom - span / top;
    g.strokeStyle = c.soft;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(G.left, lossY);
    g.lineTo(G.right, lossY);
    g.stroke();
    var wordsLeft = G.gainX + G.gainW + 6;
    g.fillStyle = c.soft;
    g.textAlign = "left";
    text(g, word(words, "loss"), wordsLeft, lossY - 4, Math.max(1, G.right - wordsLeft));
    g.fillStyle = c.muted;
    g.textAlign = "center";
    // Centred under the bar, never wider than the gauge's left edge allows.
    var gainCentre = G.gainX + G.gainW / 2;
    text(g, word(words, "gain"), gainCentre, G.wordY, 2 * (gainCentre - G.left));

    g.restore();
  }

  UI.levels = Object.freeze({
    SIZE: SIZE,
    layout: layout,
    scaleMax: scaleMax,
    draw: draw
  });
})(this);
