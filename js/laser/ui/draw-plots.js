/* ============================================================================
   draw-plots.js — one chart of a quantity against time, drawn the way a
   measuring instrument draws it (docs/laser-plan.md, stage 6b). The page
   uses it for the output power; until stage 7c it also drew the
   inversion, and the chart still takes any value of a point (`key`).

     LaserUI.plots.draw(view, chart)
       view    what loop.js passes to a draw: { g, w, h, colors, font, … }
       chart   { points, key, tNow, shownTime, floor, unit, title, color,
                 lines, cursor }
               points     [{ t, … }] from history.js, in time order
               key        which value of a point to plot (the page: "P")
               tNow       the simulation's time now (the right edge), s
               shownTime  how much simulated time the chart shows, s
               floor      the least the value axis reaches (see below)
               unit       "W", or "" for a plain number
               title      the word above the chart ("" leaves it out)
               color      the curve's palette name: "accent" or "accent2"
               lines      [{ value, word, tone, stretch }]: dashed
                          reference lines (the steady output, the
                          threshold); tone is a palette name; a value of 0
                          or less is not drawn. The axis reaches up to
                          every line, except one with `stretch: false`,
                          which is drawn only if it is inside the axis
               cursor     where the pointer is, in CSS pixels from the left
                          of the canvas, or null
     LaserUI.plots.layout(w, h)    the plot box and where the labels go
     LaserUI.plots.scale(chart)    the points shown and the two axes
     LaserUI.plots.SIZE            the canvas proportions

   WHAT IS ON IT
   · Time runs from the left edge (shownTime ago) to the right edge (now),
     in simulated time: the ticks stand at round times and move left.
   · The value axis starts at 0 and ends on a round tick above everything
     shown, and at least at `floor`: below threshold the only light is
     spontaneous emission, about 10⁻⁸ of a lasing output, and an axis
     scaled to it would make it look like a laser.
   · Ticks at 1, 2 or 5 times a power of ten (axis.js), a grid line at each,
     the labels on the right, the unit written once above them.
   · A tag on the value axis shows the latest value, in the heading
     colour on the page's background, framed in the curve's colour.
   · Under the pointer: a crosshair on the nearest point, and its value and
     time written out.

   Needs: format.js, axis.js.
   Tests: tests/laser/draw-plots.test.js
   ========================================================================== */
(function (root) {
  "use strict";

  var UI = root.LaserUI = root.LaserUI || {};

  var SIZE = Object.freeze({ aspect: 1.15, minHeight: 300, maxHeight: 460 });
  var VALUE_TICKS = 4;            // about this many ticks on the value axis
  var TIME_TICKS = 5;
  var HEADROOM = 1.05;            // the axis ends a little above the highest point

  function clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
  }

  function layout(w, h) {
    var pad = Math.max(8, 0.025 * w);
    var fontSize = clamp(Math.round(0.034 * h), 10, 13);
    var margin = 4.2 * fontSize;                     // tick labels and the value tag
    var right = w - pad - margin;
    return {
      fontSize: fontSize,
      plot: { left: pad, right: right, top: pad + 1.8 * fontSize, bottom: h - pad - 1.7 * fontSize },
      titleY: pad + fontSize,
      labelX: right + 0.5 * fontSize,                // where the labels on the right start
      labelWidth: margin - 0.5 * fontSize,
      tagWidth: margin - 2,
      timeY: h - pad
    };
  }

  // The points inside the time window and the two axes.
  function scale(chart) {
    var from = chart.tNow - chart.shownTime;
    var shown = [];
    var largest = chart.floor > 0 ? chart.floor : 0;
    for (var i = 0; i < chart.points.length; i++) {
      var point = chart.points[i];
      if (point.t < from || point.t > chart.tNow) continue;
      shown.push(point);
      if (point[chart.key] > largest) largest = point[chart.key];
    }
    // A reference line stretches the axis to show itself, unless it says
    // `stretch: false`: then it is drawn only when it is inside the axis
    // anyway (the pump level x on the inversion chart, which at a strong
    // pump would press the curve near 1 flat; stage 6b review).
    var lines = chart.lines || [];
    for (var j = 0; j < lines.length; j++) {
      if (lines[j].stretch === false) continue;
      if (lines[j].value > largest) largest = lines[j].value;
    }
    if (!(largest > 0)) largest = 1;                 // nothing to show yet: an axis all the same
    var value = UI.axis.fromZero(largest * HEADROOM, VALUE_TICKS);
    var time = UI.axis.ticks(from, chart.tNow, TIME_TICKS);
    return {
      shown: shown,
      from: from,
      value: value,
      valueLabels: UI.axis.labels(value.values, value.step, chart.unit || ""),
      time: time,
      timeLabels: UI.axis.labels(time.values, time.step, "s")
    };
  }

  // The point of `shown` (in time order) nearest to time t.
  function nearest(shown, t) {
    var low = 0;
    var high = shown.length - 1;
    while (high - low > 1) {
      var middle = Math.floor((low + high) / 2);
      if (shown[middle].t < t) low = middle;
      else high = middle;
    }
    return Math.abs(shown[low].t - t) <= Math.abs(shown[high].t - t) ? shown[low] : shown[high];
  }

  function text(g, value, x, y, maxWidth) {
    if (value) g.fillText(value, x, y, maxWidth);
  }

  function draw(view, chart) {
    var g = view.g;
    var c = view.colors;
    var F = UI.format;
    var L = layout(view.w, view.h);
    var P = L.plot;
    var S = scale(chart);
    var key = chart.key;
    var width = P.right - P.left;
    var height = P.bottom - P.top;
    var curveColor = c[chart.color] || c.accent;

    function xOf(t) {
      return P.right - (chart.tNow - t) / chart.shownTime * width;
    }
    function yOf(value) {
      return P.bottom - value / S.value.top * height;
    }
    function across(y) {
      g.beginPath();
      g.moveTo(P.left, y);
      g.lineTo(P.right, y);
      g.stroke();
    }
    function upright(x) {
      g.beginPath();
      g.moveTo(x, P.top);
      g.lineTo(x, P.bottom);
      g.stroke();
    }

    g.clearRect(0, 0, view.w, view.h);
    g.save();
    g.font = L.fontSize + "px " + view.font;
    g.textBaseline = "alphabetic";
    g.lineJoin = "round";

    /* the grid and the frame */
    g.strokeStyle = c.grid;
    g.lineWidth = 1;
    S.value.values.forEach(function (value) { across(yOf(value)); });
    S.time.values.forEach(function (t) {
      if (t >= 0) upright(xOf(t));                   // nothing happened before t = 0
    });
    g.strokeStyle = c.line;
    g.strokeRect(P.left, P.top, width, height);

    /* the title, and the unit above the value labels */
    g.fillStyle = c.text;
    g.textAlign = "left";
    text(g, chart.title, P.left, L.titleY, width);
    g.fillStyle = c.muted;
    text(g, S.valueLabels.unit, L.labelX, L.titleY, L.labelWidth);

    /* the tick labels */
    S.value.values.forEach(function (value, i) {
      g.fillText(S.valueLabels.texts[i], L.labelX, yOf(value) + 0.35 * L.fontSize, L.labelWidth);
    });
    g.textAlign = "center";
    S.time.values.forEach(function (t, i) {
      var x = xOf(t);
      // A label at the very edge would be cut off or run into the unit.
      if (t < 0 || x < P.left + 1.6 * L.fontSize || x > P.right - 1.2 * L.fontSize) return;
      g.fillText(S.timeLabels.texts[i], x, L.timeY, 4.5 * L.fontSize);
    });
    g.textAlign = "left";
    text(g, S.timeLabels.unit, L.labelX, L.timeY, L.labelWidth);

    /* the reference lines */
    (chart.lines || []).forEach(function (line) {
      if (!(line.value > 0) || line.value > S.value.top) return;
      var y = yOf(line.value);
      var tone = c[line.tone] || c.soft;
      g.strokeStyle = tone;
      g.lineWidth = 1.5;
      g.setLineDash([5, 4]);
      across(y);
      g.setLineDash([]);
      // The word sits above its line, or under it when the line is close
      // to the top of the plot (found in the browser in stage 6).
      var wordY = y - 4;
      if (wordY - L.fontSize < P.top) wordY = y + L.fontSize + 2;
      g.fillStyle = tone;
      text(g, line.word, P.left + 4, wordY, 0.5 * width);
    });

    if (S.shown.length > 0) {
      var first = S.shown[0];
      var last = S.shown[S.shown.length - 1];

      /* a light area under the curve, then the curve */
      g.beginPath();
      g.moveTo(xOf(first.t), P.bottom);
      S.shown.forEach(function (point) { g.lineTo(xOf(point.t), yOf(point[key])); });
      g.lineTo(xOf(last.t), P.bottom);
      g.closePath();
      g.globalAlpha = 0.14;
      g.fillStyle = curveColor;
      g.fill();
      g.globalAlpha = 1;

      g.beginPath();
      S.shown.forEach(function (point, i) {
        if (i === 0) g.moveTo(xOf(point.t), yOf(point[key]));
        else g.lineTo(xOf(point.t), yOf(point[key]));
      });
      g.strokeStyle = curveColor;
      g.lineWidth = 2;
      g.stroke();

      /* the latest value, as a tag on the value axis: the page's
         background framed in the curve's colour, the text in the heading
         colour. Text on a filled tag in the curve's colour was too faint
         in some theme and chart pairs (2.3:1 to 5.1:1; stage 6b review);
         the heading colour on the background is 13.9:1 or more. */
      var tagY = yOf(last[key]);
      var tagHeight = 1.5 * L.fontSize;
      g.fillStyle = c.bg;
      g.fillRect(P.right + 1, tagY - tagHeight / 2, L.tagWidth, tagHeight);
      g.strokeStyle = curveColor;
      g.lineWidth = 1.5;
      g.strokeRect(P.right + 1, tagY - tagHeight / 2, L.tagWidth, tagHeight);
      g.fillStyle = c.heading;
      g.font = "700 " + L.fontSize + "px " + view.font;
      // Two more decimals than the ticks: "1.70" on an axis of 0, 5, 10.
      g.fillText(UI.axis.valueText(last[key], S.valueLabels, 2), L.labelX, tagY + 0.35 * L.fontSize, L.labelWidth);
      g.font = L.fontSize + "px " + view.font;

      /* under the pointer: a crosshair on the nearest point, and its reading */
      if (typeof chart.cursor === "number" && chart.cursor >= P.left && chart.cursor <= P.right) {
        var timeAt = chart.tNow - (P.right - chart.cursor) / width * chart.shownTime;
        var point = nearest(S.shown, timeAt);
        var cx = xOf(point.t);
        var cy = yOf(point[key]);
        g.strokeStyle = c.faint;
        g.lineWidth = 1;
        g.setLineDash([3, 3]);
        upright(cx);
        across(cy);
        g.setLineDash([]);
        g.fillStyle = c.heading;
        g.beginPath();
        g.arc(cx, cy, 3.5, 0, 2 * Math.PI);
        g.fill();

        // The reading goes in the top corner away from the pointer.
        var boxWidth = Math.min(width - 12, 10 * L.fontSize);
        var boxHeight = 3.1 * L.fontSize;
        var boxX = cx < (P.left + P.right) / 2 ? P.right - boxWidth - 6 : P.left + 6;
        var boxY = P.top + 6;
        var inner = boxWidth - 1.2 * L.fontSize;
        g.globalAlpha = 0.9;
        g.fillStyle = c.bg;
        g.fillRect(boxX, boxY, boxWidth, boxHeight);
        g.globalAlpha = 1;
        g.strokeStyle = c.line;
        g.strokeRect(boxX, boxY, boxWidth, boxHeight);
        g.fillStyle = c.heading;
        g.font = "700 " + L.fontSize + "px " + view.font;
        var reading = chart.unit ? F.si(point[key], chart.unit, 4) : F.number(point[key], 4);
        g.fillText(reading, boxX + 0.6 * L.fontSize, boxY + 1.25 * L.fontSize, inner);
        g.fillStyle = c.muted;
        g.font = L.fontSize + "px " + view.font;
        g.fillText(F.si(point.t, "s", 4), boxX + 0.6 * L.fontSize, boxY + 2.5 * L.fontSize, inner);
      }
    }

    g.restore();
  }

  UI.plots = Object.freeze({
    SIZE: SIZE,
    layout: layout,
    scale: scale,
    draw: draw
  });
})(this);
