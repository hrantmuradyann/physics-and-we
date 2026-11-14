/* ============================================================================
   draw-bench.js — the picture of the laser on the bench.

   PART OF THE LASER PAGE'S DRAWING (js/laser/ui/): it draws, and never
   does physics. For now it is a still picture of the four parts every
   laser has (docs/laser-physics.md §11.1): a mirror that reflects all the
   light, a rod of gain medium on the axis, a pump lamp beside the rod, and
   an output mirror that lets part of the light out. Build stage 6 adds the
   light itself.

     LaserUI.bench.SIZE              { aspect, minHeight, maxHeight }: the
                                     canvas proportions, for the loop
     LaserUI.bench.PARTS             the names of the labelled parts, the
                                     keys of `labels` below
     LaserUI.bench.layout(w, h)      where every part and label goes, in CSS
                                     pixels (plain arithmetic, tested for
                                     every width the page can have)
     LaserUI.bench.draw(view, labels)
         view    what LaserUI.loop hands its draw function
         labels  { backMirror, outputMirror, medium, pump }: the words,
                 already in the visitor's language; an empty one is left out

   Colours come only from view.colors (the theme), so the picture follows
   the dark and the light theme.

   Tests: tests/laser/draw-bench.test.js
   ========================================================================== */
(function (root) {
  "use strict";

  var UI = root.LaserUI = root.LaserUI || {};

  // Wide and low, like a real optical bench. At 327 px (a phone) the
  // minimum height wins; on a wide window the maximum does.
  var SIZE = Object.freeze({ aspect: 2.6, minHeight: 220, maxHeight: 360 });

  // The parts that have a label, in the order they are written. page.js
  // takes their words from data/laser.json (bench.parts.<name>).
  var PARTS = Object.freeze(["backMirror", "outputMirror", "medium", "pump"]);

  // Where everything goes on a canvas w × h CSS pixels. Every rectangle is
  // { x, y, w, h } from its top-left corner; a label is its text's baseline
  // point { x, y }, how it is aligned there, and the widest it may be.
  function layout(w, h) {
    var pad = Math.max(12, 0.05 * w);               // the margin left and right
    var axisY = 0.46 * h;                           // the laser's axis
    var mirrorHeight = 0.46 * h;
    var mirrorThickness = Math.max(6, 0.012 * w);
    var mirrorTop = axisY - mirrorHeight / 2;
    var innerLeft = pad + mirrorThickness;          // the back mirror's face
    var innerRight = w - pad - mirrorThickness;     // the output mirror's face
    var span = innerRight - innerLeft;

    var rodLength = 0.46 * span;
    var rodHeight = 0.15 * h;
    var rodX = innerLeft + (span - rodLength) / 2;
    var rodY = axisY - rodHeight / 2;

    var lampLength = 0.9 * rodLength;
    var lampHeight = 0.06 * h;
    var lampX = innerLeft + (span - lampLength) / 2;
    var lampY = rodY + rodHeight + 0.09 * h;

    var fontSize = Math.max(11, Math.min(15, Math.round(0.055 * h)));
    var mirrorLabelWidth = w / 2 - pad - fontSize;  // leaves a gap in the middle

    return {
      fontSize: fontSize,
      axis: { x1: innerLeft, x2: innerRight, y: axisY },
      backMirror: { x: pad, y: mirrorTop, w: mirrorThickness, h: mirrorHeight },
      outputMirror: { x: innerRight, y: mirrorTop, w: mirrorThickness, h: mirrorHeight },
      rod: { x: rodX, y: rodY, w: rodLength, h: rodHeight },
      lamp: { x: lampX, y: lampY, w: lampLength, h: lampHeight },
      labels: {
        backMirror: { x: pad, y: mirrorTop - 0.6 * fontSize, align: "left", maxWidth: mirrorLabelWidth },
        outputMirror: { x: w - pad, y: mirrorTop - 0.6 * fontSize, align: "right", maxWidth: mirrorLabelWidth },
        medium: { x: w / 2, y: rodY - 0.6 * fontSize, align: "center", maxWidth: rodLength },
        pump: { x: w / 2, y: lampY + lampHeight + 1.4 * fontSize, align: "center", maxWidth: lampLength }
      }
    };
  }

  function draw(view, labels) {
    var g = view.g;
    var colors = view.colors;
    var L = layout(view.w, view.h);

    g.clearRect(0, 0, view.w, view.h);
    g.save();

    // The axis: a dashed line from one mirror to the other.
    g.strokeStyle = colors.faint;
    g.lineWidth = 1;
    g.setLineDash([6, 6]);
    g.beginPath();
    g.moveTo(L.axis.x1, L.axis.y);
    g.lineTo(L.axis.x2, L.axis.y);
    g.stroke();
    g.setLineDash([]);

    // The pump lamp, under the rod.
    g.fillStyle = colors.glow;
    g.fillRect(L.lamp.x, L.lamp.y, L.lamp.w, L.lamp.h);
    g.strokeStyle = colors.faint;
    g.strokeRect(L.lamp.x, L.lamp.y, L.lamp.w, L.lamp.h);

    // The rod of gain medium: a see-through fill with a solid edge.
    g.globalAlpha = 0.3;
    g.fillStyle = colors.accent;
    g.fillRect(L.rod.x, L.rod.y, L.rod.w, L.rod.h);
    g.globalAlpha = 1;
    g.strokeStyle = colors.accent;
    g.lineWidth = 1.5;
    g.strokeRect(L.rod.x, L.rod.y, L.rod.w, L.rod.h);

    // The mirrors. The output mirror is drawn paler: it lets light through.
    g.fillStyle = colors.soft;
    g.fillRect(L.backMirror.x, L.backMirror.y, L.backMirror.w, L.backMirror.h);
    g.globalAlpha = 0.45;
    g.fillRect(L.outputMirror.x, L.outputMirror.y, L.outputMirror.w, L.outputMirror.h);
    g.globalAlpha = 1;
    g.strokeStyle = colors.soft;
    g.lineWidth = 1;
    g.strokeRect(L.outputMirror.x, L.outputMirror.y, L.outputMirror.w, L.outputMirror.h);

    // The names of the parts. fillText's fourth argument squeezes a word
    // that is too long for its place instead of letting it run into the
    // next one (a long Armenian word on a phone).
    g.fillStyle = colors.muted;
    g.font = "600 " + L.fontSize + "px " + view.font;
    g.textBaseline = "alphabetic";
    PARTS.forEach(function (name) {
      var text = labels[name];
      if (!text) return;
      var spot = L.labels[name];
      g.textAlign = spot.align;
      g.fillText(text, spot.x, spot.y, spot.maxWidth);
    });

    g.restore();
  }

  UI.bench = Object.freeze({
    SIZE: SIZE,
    PARTS: PARTS,
    layout: layout,
    draw: draw
  });
})(this);
