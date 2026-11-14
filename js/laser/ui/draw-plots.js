/* ============================================================================
   draw-plots.js — output power and inversion against time, one above the
   other on one time axis (docs/laser-physics.md §11.6, item 5).

     LaserUI.plots.draw(view, picture)
       view     what loop.js passes to a draw: { g, w, h, colors, font, … }
       picture  { points, tNow, window, Pfloor, x, words }
                points  [{ t, P, y }] from history.js: simulated s, W, N/N_c
                tNow    the simulation's time now (the right edge), s
                window  how much simulated time the plot shows, s
                Pfloor  the least the power axis shows, W (see powerMax)
                x       pump / threshold: the inversion's level with no light
                words   { power, inversion, threshold, time }; a missing
                        word is left out
     LaserUI.plots.layout(w, h)          the two plot boxes (CSS pixels)
     LaserUI.plots.powerMax(points, Pfloor)   the top of the power axis
     LaserUI.plots.inversionMax(points, x)    the top of the inversion axis

   Time runs from the left edge (a window ago) to the right edge (now). The
   power axis starts at 0 and goes at least to Pfloor: below threshold the
   only light is spontaneous emission, about 10⁻⁸ of a lasing output, and
   an axis scaled to it would make it look like a laser. The inversion axis
   always shows the threshold (y = 1, dashed).

   Tests: tests/laser/draw-panels.test.js
   ========================================================================== */
(function (root) {
  "use strict";

  var UI = root.LaserUI = root.LaserUI || {};

  var SIZE = Object.freeze({ aspect: 2.2, minHeight: 240, maxHeight: 380 });
  var HEADROOM = 1.1;

  function clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
  }

  function powerMax(points, Pfloor) {
    var top = Pfloor;
    for (var i = 0; i < points.length; i++) {
      if (points[i].P > top) top = points[i].P;
    }
    return top * HEADROOM;
  }

  function inversionMax(points, x) {
    var top = Math.max(1, x);
    for (var i = 0; i < points.length; i++) {
      if (points[i].y > top) top = points[i].y;
    }
    return top * HEADROOM;
  }

  function layout(w, h) {
    var pad = Math.max(10, 0.03 * w);
    var fontSize = clamp(Math.round(0.045 * h), 11, 14);
    var titleRoom = 1.5 * fontSize;                  // a title above each box
    var bottomRoom = 1.6 * fontSize;                 // the time label below
    var available = h - pad - bottomRoom - pad - 2 * titleRoom;
    var boxHeight = available / 2;
    var powerTop = pad + titleRoom;
    var inversionTop = powerTop + boxHeight + titleRoom;
    return {
      fontSize: fontSize,
      power: { left: pad, right: w - pad, top: powerTop, bottom: powerTop + boxHeight },
      inversion: { left: pad, right: w - pad, top: inversionTop, bottom: inversionTop + boxHeight },
      timeY: h - pad
    };
  }

  function word(words, name) {
    var value = words && words[name];
    return typeof value === "string" ? value : "";
  }

  function text(g, value, x, y, maxWidth) {
    if (value) g.fillText(value, x, y, maxWidth);
  }

  // A horizontal line across a box at the value `value` of a scale 0..top.
  function level(g, box, value, top) {
    var y = box.bottom - (box.bottom - box.top) * value / top;
    g.beginPath();
    g.moveTo(box.left, y);
    g.lineTo(box.right, y);
    g.stroke();
    return y;
  }

  // One curve: `value(point)` on a scale 0..top, time from tNow − shownTime
  // (left) to tNow (right). powerMax and inversionMax make `top` hold every
  // point shown, so no clamp (it would only hide a wrong scale).
  function curve(g, box, shown, tNow, shownTime, top, value) {
    var width = box.right - box.left;
    var height = box.bottom - box.top;
    g.beginPath();
    for (var i = 0; i < shown.length; i++) {
      var x = box.right - (tNow - shown[i].t) / shownTime * width;
      var y = box.bottom - height * value(shown[i]) / top;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }

  function draw(view, picture) {
    var g = view.g;
    var c = view.colors;
    var F = UI.format;
    var L = layout(view.w, view.h);
    var words = picture.words || {};
    var tNow = picture.tNow;
    var shownTime = picture.window;               // simulated s across the plot
    var shown = [];
    for (var i = 0; i < picture.points.length; i++) {
      var point = picture.points[i];
      if (point.t >= tNow - shownTime && point.t <= tNow) shown.push(point);
    }
    var Ptop = powerMax(shown, picture.Pfloor);
    var ytop = inversionMax(shown, picture.x);
    var boxWidth = L.power.right - L.power.left;

    g.clearRect(0, 0, view.w, view.h);
    g.save();
    g.font = L.fontSize + "px " + view.font;
    g.textBaseline = "alphabetic";
    g.lineJoin = "round";

    /* the boxes and their titles */
    g.strokeStyle = c.grid;
    g.lineWidth = 1;
    [L.power, L.inversion].forEach(function (box) {
      g.strokeRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
    });
    g.fillStyle = c.muted;
    g.textAlign = "left";
    text(g, word(words, "power"), L.power.left, L.power.top - 0.45 * L.fontSize, 0.6 * boxWidth);
    text(g, word(words, "inversion"), L.inversion.left, L.inversion.top - 0.45 * L.fontSize, 0.6 * boxWidth);
    g.textAlign = "right";
    text(g, F.si(Ptop, "W", 2), L.power.right, L.power.top - 0.45 * L.fontSize, 0.35 * boxWidth);
    text(g, F.number(ytop, 2), L.inversion.right, L.inversion.top - 0.45 * L.fontSize, 0.35 * boxWidth);
    var timeLabel = F.si(shownTime, "s", 2);
    if (word(words, "time")) timeLabel = word(words, "time") + " " + timeLabel;
    text(g, timeLabel, L.inversion.right, L.timeY, boxWidth);

    /* the threshold (y = 1) and the pump level (y = x) */
    g.lineWidth = 1.5;
    g.setLineDash([5, 4]);
    g.strokeStyle = c.soft;
    var thresholdY = level(g, L.inversion, 1, ytop);
    if (picture.x > 0) {
      g.strokeStyle = c.faint;
      level(g, L.inversion, picture.x, ytop);
    }
    g.setLineDash([]);
    g.fillStyle = c.soft;
    g.textAlign = "left";
    // The word sits above its line, or below it when the line is near the
    // top of the box (pump off: the axis ends at 1.1), where it would run
    // into the box's title (found in the browser).
    var thresholdWordY = thresholdY - 4;
    if (thresholdWordY - L.fontSize < L.inversion.top) thresholdWordY = thresholdY + L.fontSize + 2;
    text(g, word(words, "threshold"), L.inversion.left + 4, thresholdWordY, 0.4 * boxWidth);

    /* the curves */
    g.lineWidth = 2;
    g.strokeStyle = c.accent;
    curve(g, L.power, shown, tNow, shownTime, Ptop, function (p) { return p.P; });
    g.strokeStyle = c.accent2;
    curve(g, L.inversion, shown, tNow, shownTime, ytop, function (p) { return p.y; });

    g.restore();
  }

  UI.plots = Object.freeze({
    SIZE: SIZE,
    layout: layout,
    powerMax: powerMax,
    inversionMax: inversionMax,
    draw: draw
  });
})(this);
