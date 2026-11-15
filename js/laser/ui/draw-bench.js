/* ============================================================================
   draw-bench.js — the picture of the laser on the bench.

   PART OF THE LASER PAGE'S DRAWING (js/laser/ui/): it draws, and never
   does physics. It shows the four parts every laser has
   (docs/laser-physics.md §11.1) the way they stand on an optical bench: a
   mirror that reflects all the light, a rod of gain medium on the axis,
   the pump under the rod, and an output mirror that lets part of the
   light out. The light is drawn as separate rays (docs/laser-plan.md,
   stage 6b).

     LaserUI.bench.SIZE              { aspect, minHeight, maxHeight }: the
                                     canvas proportions, for the loop
     LaserUI.bench.PARTS             the names of the labels, the keys of
                                     `labels` below
     LaserUI.bench.layout(w, h)      where every part, ray and label goes,
                                     in CSS pixels (plain arithmetic,
                                     tested for every width the page has)
     LaserUI.bench.faceX(L, which, y)   the x of a mirror's curved face at
                                     height y; which is "back" or "output"
     LaserUI.bench.raysOut(count, transmission)   how many of `count` rays
                                     leave through the output mirror
     LaserUI.bench.rayAlpha(beam)    how strongly the rays are drawn, 0–1;
                                     the photon cartoon's light uses it too
     LaserUI.bench.draw(view, labels, light)
         view    what LaserUI.loop hands its draw function
         labels  { backMirror, outputMirror, medium, pump, transmission }:
                 the words, already in the visitor's language; an empty one
                 is left out. After `transmission` the drawing writes the
                 output mirror's transmission ("Transmission 5.00 %"), and
                 without a transmission in `light` it leaves that label out
         light   optional { beam, pump, transmission }
                 beam          the output power over the output at twice
                               threshold; 0 or none draws no rays
                 pump          the pump over its strongest setting, 0–1;
                               0 or none draws no pump light
                 transmission  the output mirror's, 0–1

   THE RAYS
   An odd number of rays (3 to 21, as many as fit 5 px apart) run from the
   face of one mirror to the face of the other. Arrowheads point right on
   every second ray and left on the others: the light goes both ways.
   round(rays × transmission) of them, the ones nearest the axis and at
   least one, go on through the output mirror to the edge of the picture,
   so the mirror's transmission can be counted. Their strength (alpha) is
   the square root of `beam`, so a weak laser still shows while the
   spontaneous emission below threshold (about 10⁻⁸) does not. 1064 nm is
   invisible: the colour is the theme's, not the light's (§11.5 comes in a
   later stage).

   Colours come only from view.colors (the theme), so the picture follows
   the dark and the light theme.

   Needs: format.js (the transmission's number).
   Tests: tests/laser/draw-bench.test.js
   ========================================================================== */
(function (root) {
  "use strict";

  var UI = root.LaserUI = root.LaserUI || {};

  // Wide and low, like a real optical bench.
  var SIZE = Object.freeze({ aspect: 2.6, minHeight: 240, maxHeight: 380 });

  // The labels, in the order they are written. page.js takes their words
  // from data/laser.json (bench.parts.<name>).
  var PARTS = Object.freeze(["backMirror", "outputMirror", "medium", "pump", "transmission"]);

  var MAX_RAYS = 21;
  var RAY_GAP = 5;              // px between two rays, at least
  var PUMP_ARROWS = 7;

  var NO_BREAK = "\u00a0";

  function clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
  }

  // Where everything goes on a canvas w × h CSS pixels. Every rectangle is
  // { x, y, w, h } from its top-left corner; a label is its text's baseline
  // point { x, y }, how it is aligned there, and the widest it may be.
  function layout(w, h) {
    var pad = Math.max(12, 0.04 * w);               // the margin left and right
    var side = pad + 0.07 * w;                      // edge to a mirror's back: room for the rays that leave
    var axisY = 0.45 * h;                           // the laser's axis
    var railY = 0.81 * h;                           // the bench the parts stand on
    var mirrorHeight = 0.5 * h;
    var mirrorThickness = Math.max(8, 0.018 * w);
    var mirrorTop = axisY - mirrorHeight / 2;
    var innerLeft = side + mirrorThickness;         // the edge of the back mirror's face
    var innerRight = w - side - mirrorThickness;    // the edge of the output mirror's face
    var span = innerRight - innerLeft;

    var rodLength = 0.5 * span;
    var rodHeight = 0.26 * h;
    var rodX = innerLeft + (span - rodLength) / 2;
    var rodY = axisY - rodHeight / 2;

    var lampLength = 0.9 * rodLength;
    var lampHeight = 0.045 * h;
    var lampX = innerLeft + (span - lampLength) / 2;
    var lampY = rodY + rodHeight + 0.075 * h;

    // The rays: an odd number, the middle one on the axis.
    var beamHeight = 0.7 * rodHeight;
    var half = clamp(Math.floor(beamHeight / 2 / RAY_GAP), 1, (MAX_RAYS - 1) / 2);
    var rays = [];
    for (var i = -half; i <= half; i++) rays.push(axisY + i * beamHeight / (2 * half));

    var fontSize = clamp(Math.round(0.05 * h), 11, 15);
    var topRow = mirrorTop - 0.6 * fontSize;        // right above the mirrors
    var nameRow = topRow - 1.35 * fontSize;         // the mirrors' names, above that
    var bottomRow = railY + 1.45 * fontSize;

    return {
      fontSize: fontSize,
      pad: pad,
      axis: { x1: innerLeft, x2: innerRight, y: axisY },
      railY: railY,
      backMirror: { x: side, y: mirrorTop, w: mirrorThickness, h: mirrorHeight },
      outputMirror: { x: innerRight, y: mirrorTop, w: mirrorThickness, h: mirrorHeight },
      sag: 0.35 * mirrorThickness,                  // how deep the mirrors' faces curve
      rod: { x: rodX, y: rodY, w: rodLength, h: rodHeight },
      lamp: { x: lampX, y: lampY, w: lampLength, h: lampHeight },
      rays: rays,
      labels: {
        backMirror: { x: pad, y: nameRow, align: "left", maxWidth: w / 2 - pad - fontSize },
        outputMirror: { x: w - pad, y: nameRow, align: "right", maxWidth: w / 2 - pad - fontSize },
        medium: { x: w / 2, y: rodY - 0.6 * fontSize, align: "center", maxWidth: rodLength },
        pump: { x: w / 2, y: bottomRow, align: "center", maxWidth: lampLength },
        // Under the output mirror's name, right above the mirror, with the
        // whole row to itself: on a phone, under the bench beside the
        // pump's name, "Թափանցելիություն 5.00 %" was squeezed to 40 % of
        // its width (stage 6b review).
        transmission: { x: w - pad, y: topRow, align: "right", maxWidth: w - 2 * pad }
      }
    };
  }

  // A mirror's face is curved inwards (concave towards the rod): it lies
  // at the mirror's inner edge at the top and bottom and `sag` deeper in
  // the middle. This is the curve quadraticCurveTo draws in mirror().
  function faceX(L, which, y) {
    var mirror = which === "back" ? L.backMirror : L.outputMirror;
    var u = clamp((y - mirror.y) / mirror.h, 0, 1);
    var depth = 4 * L.sag * u * (1 - u);
    return which === "back" ? mirror.x + mirror.w - depth : mirror.x + depth;
  }

  // The rays' strength: the square root of the light, so a weak laser
  // still shows while spontaneous emission (about 10⁻⁸) does not.
  function rayAlpha(beam) {
    return beam > 0 ? Math.min(1, Math.sqrt(beam)) : 0;
  }

  function raysOut(count, transmission) {
    var share = transmission > 0 ? transmission : 0;
    return clamp(Math.round(count * share), 1, count);
  }

  // The indices of the `howMany` rays nearest the axis (the middle ones).
  function middleRays(count, howMany) {
    var first = Math.floor((count - howMany) / 2);
    var list = [];
    for (var i = first; i < first + howMany; i++) list.push(i);
    return list;
  }

  function line(g, x1, y1, x2, y2) {
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  }

  // A filled arrowhead with its tip at (x, y), pointing along (dx, dy),
  // which is (±1, 0) or (0, ±1).
  function arrowHead(g, x, y, dx, dy, size) {
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x - dx * size - dy * 0.55 * size, y - dy * size - dx * 0.55 * size);
    g.lineTo(x - dx * size + dy * 0.55 * size, y - dy * size + dx * 0.55 * size);
    g.closePath();
    g.fill();
  }

  // A post from a part down to the bench, with a foot.
  function post(g, x, fromY, railY) {
    g.fillRect(x - 2, fromY, 4, railY - fromY);
    g.fillRect(x - 9, railY - 4, 18, 4);
  }

  // A mirror: a piece of glass with a curved, coated face, held at the
  // top and the bottom. `strong` is the mirror that reflects everything;
  // the output mirror's coating is thinner and paler.
  function mirror(g, colors, L, which, strong) {
    var m = which === "back" ? L.backMirror : L.outputMirror;
    var outer = which === "back" ? m.x : m.x + m.w;
    var inner = which === "back" ? m.x + m.w : m.x;
    var towardsGlass = which === "back" ? -1 : 1;
    var controlX = inner + towardsGlass * 2 * L.sag;       // the curve passes `sag` deep
    var middleY = m.y + m.h / 2;

    // the glass
    g.beginPath();
    g.moveTo(outer, m.y);
    g.lineTo(inner, m.y);
    g.quadraticCurveTo(controlX, middleY, inner, m.y + m.h);
    g.lineTo(outer, m.y + m.h);
    g.closePath();
    g.globalAlpha = 0.22;
    g.fillStyle = colors.accent;
    g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = colors.faint;
    g.lineWidth = 1;
    g.stroke();

    // the coating on the face
    g.beginPath();
    g.moveTo(inner, m.y);
    g.quadraticCurveTo(controlX, middleY, inner, m.y + m.h);
    g.strokeStyle = colors.heading;
    g.lineWidth = strong ? 3.5 : 2;
    g.globalAlpha = strong ? 0.95 : 0.5;
    g.stroke();
    g.globalAlpha = 1;

    // the holder: a clamp at the top and at the bottom
    g.fillStyle = colors.muted;
    g.fillRect(m.x - 2, m.y - 3, m.w + 4, 3);
    g.fillRect(m.x - 2, m.y + m.h, m.w + 4, 3);
  }

  // "Transmission 5.00 %": the word and the output mirror's transmission,
  // or "" when there is no transmission to write.
  function transmissionText(word, light) {
    var transmission = light ? light.transmission : undefined;
    if (typeof transmission !== "number" || !isFinite(transmission)) return "";
    var number = UI.format.number(100 * transmission) + NO_BREAK + "%";
    return word ? word + " " + number : number;
  }

  function draw(view, labels, light) {
    var g = view.g;
    var colors = view.colors;
    var L = layout(view.w, view.h);
    var beam = light && light.beam > 0 ? light.beam : 0;
    var pump = light && light.pump > 0 ? Math.min(1, light.pump) : 0;
    var rodBottom = L.rod.y + L.rod.h;

    g.clearRect(0, 0, view.w, view.h);
    g.save();

    // The bench, and what the parts stand on.
    g.strokeStyle = colors.line;
    g.lineWidth = 2;
    line(g, L.pad / 2, L.railY, view.w - L.pad / 2, L.railY);
    g.fillStyle = colors.faint;
    post(g, L.backMirror.x + L.backMirror.w / 2, L.backMirror.y + L.backMirror.h + 3, L.railY);
    post(g, L.outputMirror.x + L.outputMirror.w / 2, L.outputMirror.y + L.outputMirror.h + 3, L.railY);
    post(g, L.rod.x + 0.02 * L.rod.w, rodBottom, L.railY);
    post(g, L.rod.x + 0.98 * L.rod.w, rodBottom, L.railY);

    // The pump, under the rod, and its light going up into the rod.
    g.fillStyle = colors.glow;
    g.fillRect(L.lamp.x, L.lamp.y, L.lamp.w, L.lamp.h);
    g.strokeStyle = colors.faint;
    g.lineWidth = 1;
    g.strokeRect(L.lamp.x, L.lamp.y, L.lamp.w, L.lamp.h);
    if (pump > 0) {
      g.globalAlpha = 0.3 + 0.7 * pump;
      g.strokeStyle = colors.glow;
      g.fillStyle = colors.glow;
      g.lineWidth = 2;
      for (var k = 0; k < PUMP_ARROWS; k++) {
        var px = L.lamp.x + (k + 0.5) / PUMP_ARROWS * L.lamp.w;
        line(g, px, L.lamp.y - 2, px, rodBottom + 6);
        arrowHead(g, px, rodBottom + 2, 0, -1, 5);
      }
      g.globalAlpha = 1;
    }

    // The rod of gain medium: a see-through fill with a solid edge.
    g.globalAlpha = 0.28;
    g.fillStyle = colors.accent;
    g.fillRect(L.rod.x, L.rod.y, L.rod.w, L.rod.h);
    g.globalAlpha = 1;
    g.strokeStyle = colors.accent;
    g.lineWidth = 1.5;
    g.strokeRect(L.rod.x, L.rod.y, L.rod.w, L.rod.h);

    // The light: separate rays between the mirrors, some of them leaving.
    if (beam > 0) {
      var count = L.rays.length;
      var leaving = middleRays(count, raysOut(count, light.transmission));
      var outLeft = L.outputMirror.x + L.outputMirror.w;
      var leftGap = (faceX(L, "back", L.axis.y) + L.rod.x) / 2;
      var rightGap = (L.rod.x + L.rod.w + faceX(L, "output", L.axis.y)) / 2;
      g.globalAlpha = rayAlpha(beam);
      g.strokeStyle = colors.accent2;
      g.fillStyle = colors.accent2;
      g.lineWidth = 1.4;
      L.rays.forEach(function (y, i) {
        line(g, faceX(L, "back", y), y, faceX(L, "output", y), y);
        // The light goes both ways: right on every second ray, left on the others.
        if (i % 2 === 0) arrowHead(g, rightGap + 4, y, 1, 0, 6);
        else arrowHead(g, leftGap - 4, y, -1, 0, 6);
      });
      leaving.forEach(function (i) {
        var y = L.rays[i];
        line(g, outLeft, y, view.w, y);
        arrowHead(g, view.w - 0.4 * L.pad, y, 1, 0, 6);
      });
      g.globalAlpha = 1;
    }

    // The mirrors, over the ends of the rays.
    mirror(g, colors, L, "back", true);
    mirror(g, colors, L, "output", false);

    // The names of the parts. fillText's fourth argument squeezes a word
    // that is too long for its place instead of letting it run into the
    // next one (a long Armenian word on a phone).
    g.fillStyle = colors.muted;
    g.font = "600 " + L.fontSize + "px " + view.font;
    g.textBaseline = "alphabetic";
    PARTS.forEach(function (name) {
      var text = name === "transmission" ? transmissionText(labels.transmission, light) : labels[name];
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
    faceX: faceX,
    raysOut: raysOut,
    rayAlpha: rayAlpha,
    draw: draw
  });
})(this);
