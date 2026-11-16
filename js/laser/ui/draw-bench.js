/* ============================================================================
   draw-bench.js — the picture of the laser on the bench.

   PART OF THE LASER PAGE'S DRAWING (js/laser/ui/): it draws, and never
   does physics. It shows the four parts every laser has
   (docs/laser-physics.md §11.1) the way they stand on an optical bench: a
   mirror that reflects all the light, the gain medium on the axis, its
   pump, and an output mirror that lets part of the light out. The light
   is drawn as separate rays (docs/laser-plan.md, stage 6b).

     LaserUI.bench.SIZE              { aspect, minHeight, maxHeight }: the
                                     canvas proportions, for the loop
     LaserUI.bench.PARTS             the names of the labels, the keys of
                                     `labels` below
     LaserUI.bench.KINDS             the pumps it can draw: "diode",
                                     "laser", "flashlamp", "discharge" (the
                                     engine's pump kinds)
     LaserUI.bench.Q_KINDS           the Q-switches it can draw: the
                                     engine's "absorber" (the bleachable
                                     filter, the one the page offers)
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
         labels  { backMirror, outputMirror, medium, pump, transmission,
                 qSwitch }: the words, already in the visitor's language; an
                 empty one is left out. After `transmission` the drawing
                 writes the output mirror's transmission ("Transmission
                 5.00 %"), and without a transmission in `light` it leaves
                 that label out. `qSwitch` is written only with a switch
         light   optional { beam, pump, transmission, pumpKind, qSwitch }
                 beam          the output power over the output at twice
                               threshold; 0 or none draws no rays
                 pump          the pump over its strongest setting, 0–1;
                               0 or none draws no pump light
                 transmission  the output mirror's, 0–1
                 pumpKind      one of KINDS; none, or one it does not
                               know, draws the diodes
                 qSwitch       optional { kind, open }: kind one of
                               Q_KINDS (none, or one it does not know,
                               draws no switch); open 0 (closed) to 1

   THE PUMPS (docs/laser-plan.md, stage 7d)
     diode      a strip of diodes under the rod; its light goes up into
                the rod
     flashlamp  a tube under the rod with a metal cap (its electrode) at
                each end. Lit (the owner asked for a flash that is easy
                to see), its gas burns in the flash colour inside a soft
                halo, the whole bench lights up, broad beams fan up into
                the rod, which glows, and short streaks flicker all round
                the tube: all of it as strong as the flash. The flicker
                runs in screen time (view.t), like the photon cartoon:
                an illustration, not physics. For a visitor who asked
                for less motion (view.still) the streaks stand still
     discharge  no rod: the medium is a gas tube that fills most of the
                cavity. Its gas glows with the current; two electrodes
                under it are wired to a power supply on the bench, and
                an arrow on each wire shows the current
     laser      a pump laser on the bench under the rod; its beam runs to
                a small mirror at 45° under the rod's middle, which
                turns it up into the rod
   The pump light is the theme's colour, as the laser's own rays are (the
   flash's is colors.flash, a bluish white on the dark theme, a warm
   orange on the light one).

   THE Q-SWITCH (docs/laser-plan.md, stage 8b)
     absorber  a filter plate on a post in the gap between the back
               mirror and the rod, shaded by its share still unbleached
               (1 − open)
   With a gas tube, which fills the cavity, no switch is drawn (no bench
   has one there). The filter's name goes on the top row, from the
   filter, and the transmission beside it then has most of the row.

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
  var PARTS = Object.freeze(["backMirror", "outputMirror", "medium", "pump", "transmission", "qSwitch"]);

  // The pumps it draws: the engine's pump kinds.
  var KINDS = Object.freeze(["diode", "laser", "flashlamp", "discharge"]);

  // The Q-switch it draws: the engine's bleachable filter.
  var Q_KINDS = Object.freeze(["absorber"]);
  // The top row with the filter's name: the transmission's share
  // of it, and the least room the name is given before it moves left.
  var TRANSMISSION_SHARE = 0.6;
  var NAME_ROOM = 100;

  // A pump under this share of full is drawn off: a flash's tail,
  // (E/t_p)(t/t_p)e^(−t/t_p), reaches 0 only after hundreds of t_p, and a
  // lamp drawn lit (its glow and arrows start from a floor) for all that
  // time would look like it never went out.
  var PUMP_OFF = 0.01;

  // The width of a post's foot on the bench.
  var POST_FOOT = 18;

  // A lit flashlamp's light: the halo's rings, the streaks round the
  // tube, and how fast they flicker (rad per second of screen time).
  var HALO_RINGS = 6;               // more, fainter rings: 4 showed as steps
  var FLASH_STREAKS = 16;
  var FLICKER_SPEED = 11;

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
    var rodBottom = rodY + rodHeight;

    // The gas tube of a discharge is the medium: it fills most of the
    // cavity, and is as tall as the rod, so the rays run inside its bore.
    var tubeLength = 0.86 * span;
    var tubeX = innerLeft + (span - tubeLength) / 2;
    var boreHeight = 0.8 * rodHeight;
    var boreInset = 0.02 * tubeLength;
    // Its electrodes stick down near its ends; the wires run from them to
    // a power supply standing on the bench in the middle.
    var electrodeWidth = 6;
    var electrodeHeight = 0.06 * h;
    var supplyWidth = 0.18 * tubeLength;
    var supplyHeight = 0.1 * h;
    var supplyY = railY - supplyHeight;
    var wireY = supplyY + supplyHeight / 2;
    var electrodes = [0.12, 0.88].map(function (share) {
      return { x: tubeX + share * tubeLength - electrodeWidth / 2, y: rodBottom, w: electrodeWidth, h: electrodeHeight };
    });
    // The current goes up into the left electrode and down out of the right.
    var arrowY = (rodBottom + electrodeHeight + wireY) / 2;

    // The pump laser stands on the bench under the rod's left half, clear
    // of the feet of the rod's left post and of the small mirror's post; the
    // small mirror under the rod's middle turns its beam up into the rod.
    var rodPosts = [rodX + 0.02 * rodLength, rodX + 0.98 * rodLength];
    var foldX = w / 2;
    var pumpLaserLeft = rodPosts[0] + POST_FOOT / 2 + 3;
    var pumpLaserRight = foldX - POST_FOOT / 2 - Math.max(6, 0.12 * rodLength);
    var pumpLaserHeight = 0.1 * h;
    var pumpLaserY = railY - pumpLaserHeight;
    var beamY = pumpLaserY + pumpLaserHeight / 2;

    // The filter, in the gap between the back mirror's face and the rod,
    // around every ray, with room after it for the left arrowheads.
    var gap = rodX - innerLeft;
    var filterHeight = 0.8 * rodHeight;
    var filterX = innerLeft + 0.36 * gap;
    var filterWidth = Math.max(5, 0.12 * gap);

    // The rays: an odd number, the middle one on the axis.
    var beamHeight = 0.7 * rodHeight;
    var half = clamp(Math.floor(beamHeight / 2 / RAY_GAP), 1, (MAX_RAYS - 1) / 2);
    var rays = [];
    for (var i = -half; i <= half; i++) rays.push(axisY + i * beamHeight / (2 * half));

    var fontSize = clamp(Math.round(0.05 * h), 11, 15);
    var topRow = mirrorTop - 0.6 * fontSize;        // right above the mirrors
    var nameRow = topRow - 1.35 * fontSize;         // the mirrors' names, above that
    var sharedRow = shareTopRow(w, pad, fontSize, topRow, filterX);
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
      rodPosts: rodPosts,
      lamp: { x: lampX, y: lampY, w: lampLength, h: lampHeight },
      flashTube: { x: lampX, y: lampY, w: lampLength, h: 0.065 * h },
      flashCap: Math.max(3, 0.04 * lampLength),
      // A lit flashlamp: each of its halo's rings is this much wider than
      // the last, its streaks at most this long, its gas's bloom this wide.
      haloStep: 0.02 * h,
      streak: 0.06 * h,
      bloom: Math.max(8, 0.06 * h),
      tube: { x: tubeX, y: rodY, w: tubeLength, h: rodHeight },
      bore: { x: tubeX + boreInset, y: axisY - boreHeight / 2, w: tubeLength - 2 * boreInset, h: boreHeight },
      tubePosts: [tubeX + 0.035 * tubeLength, tubeX + 0.965 * tubeLength],
      electrodes: electrodes,
      supply: { x: w / 2 - supplyWidth / 2, y: supplyY, w: supplyWidth, h: supplyHeight },
      wireY: wireY,
      currentArrows: [
        { x: electrodes[0].x + electrodeWidth / 2, y: arrowY, dy: -1 },
        { x: electrodes[1].x + electrodeWidth / 2, y: arrowY, dy: 1 }
      ],
      pumpLaser: { x: pumpLaserLeft, y: pumpLaserY, w: pumpLaserRight - pumpLaserLeft, h: pumpLaserHeight },
      beamY: beamY,
      fold: { x: foldX, y: beamY, size: Math.max(10, 0.06 * h) },
      filter: { x: filterX, y: axisY - filterHeight / 2, w: filterWidth, h: filterHeight },
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
        transmission: { x: w - pad, y: topRow, align: "right", maxWidth: w - 2 * pad },
        // The filter's name shares the top row with the transmission,
        // which keeps most of it (sharedRow below).
        qSwitch: sharedRow.name,
        transmissionShared: sharedRow.transmission
      }
    };
  }

  // The top row shared by the filter's name (left) and the transmission
  // (right), a font size apart. The transmission keeps TRANSMISSION_SHARE
  // of it: at half, the Armenian "Թափանցելիություն 5.00 %" was squeezed on
  // a phone (stage 8b review). The name starts above the filter, or
  // further left, as far as the margin, to keep NAME_ROOM.
  function shareTopRow(w, pad, fontSize, topRow, switchLeft) {
    var transmissionWidth = TRANSMISSION_SHARE * (w - 2 * pad - fontSize);
    var nameRight = w - pad - fontSize - transmissionWidth;
    var nameLeft = Math.max(pad, Math.min(switchLeft, nameRight - NAME_ROOM));
    return {
      name: { x: nameLeft, y: topRow, align: "left", maxWidth: nameRight - nameLeft },
      transmission: { x: w - pad, y: topRow, align: "right", maxWidth: transmissionWidth }
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
    g.fillRect(x - POST_FOOT / 2, railY - 4, POST_FOOT, 4);
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

  // The pump to draw: the light's, if this file knows it, else the diodes.
  function kindOf(light) {
    if (light && KINDS.indexOf(light.pumpKind) !== -1) return light.pumpKind;
    return "diode";
  }

  // The Q-switch to draw: the light's, if this file knows it and there is
  // a rod (a gas tube fills the cavity), else null.
  function switchOf(light, pumpKind) {
    if (!light || !light.qSwitch || pumpKind === "discharge") return null;
    if (Q_KINDS.indexOf(light.qSwitch.kind) === -1) return null;
    return light.qSwitch;
  }

  // How far a switch is open, 0 to 1 (anything else counts as closed).
  function openOf(qSwitch) {
    var open = qSwitch.open;
    return typeof open === "number" && isFinite(open) ? clamp(open, 0, 1) : 0;
  }

  // The pump's light going up into the rod: PUMP_ARROWS upright lines with
  // arrowheads, from just above `fromY` to the rod's bottom, spread over
  // the part from x to x + width.
  function lightUp(g, color, L, x, width, fromY, pump) {
    var rodBottom = L.rod.y + L.rod.h;
    g.globalAlpha = 0.3 + 0.7 * pump;
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineWidth = 2;
    for (var k = 0; k < PUMP_ARROWS; k++) {
      var px = x + (k + 0.5) / PUMP_ARROWS * width;
      line(g, px, fromY - 2, px, rodBottom + 6);
      arrowHead(g, px, rodBottom + 2, 0, -1, 5);
    }
    g.globalAlpha = 1;
  }

  // Diodes: a strip under the rod.
  function drawDiodes(g, colors, L, pump) {
    g.fillStyle = colors.glow;
    g.fillRect(L.lamp.x, L.lamp.y, L.lamp.w, L.lamp.h);
    g.strokeStyle = colors.faint;
    g.lineWidth = 1;
    g.strokeRect(L.lamp.x, L.lamp.y, L.lamp.w, L.lamp.h);
    if (pump > 0) lightUp(g, colors.glow, L, L.lamp.x, L.lamp.w, L.lamp.y, pump);
  }

  // A lit flashlamp, behind every part: the bench lit by the flash, and a
  // halo round the tube, rings that grow and fade outward.
  function flashBehind(g, colors, L, w, h, pump) {
    var F = L.flashTube;
    g.fillStyle = colors.flash;
    g.globalAlpha = 0.1 * pump;
    g.fillRect(0, 0, w, h);
    g.globalAlpha = 0.06 * pump;
    for (var k = 1; k <= HALO_RINGS; k++) {
      g.beginPath();
      g.ellipse(F.x + F.w / 2, F.y + F.h / 2, F.w / 2 + k * L.haloStep, F.h / 2 + k * L.haloStep, 0, 0, 2 * Math.PI);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  // Short streaks all round a lit flashlamp's tube, each flickering at its
  // own phase in screen time t.
  function flashStreaks(g, colors, L, pump, t) {
    var F = L.flashTube;
    var time = typeof t === "number" && isFinite(t) ? t : 0;
    g.strokeStyle = colors.flash;
    g.lineWidth = 2;
    for (var k = 0; k < FLASH_STREAKS; k++) {
      var angle = 2 * Math.PI * (k + 0.5) / FLASH_STREAKS;
      var dx = Math.cos(angle);
      var dy = Math.sin(angle);
      var flicker = 0.5 + 0.5 * Math.sin(FLICKER_SPEED * time + 2.4 * k);
      var length = L.streak * pump * (0.4 + 0.6 * flicker);
      // from just outside the tube, on an ellipse round it
      var x0 = F.x + F.w / 2 + dx * (F.w / 2 + 3);
      var y0 = F.y + F.h / 2 + dy * (F.h / 2 + 3);
      g.globalAlpha = (0.3 + 0.6 * flicker) * pump;
      line(g, x0, y0, x0 + dx * length, y0 + dy * length);
    }
    g.globalAlpha = 1;
  }

  // A rod lit by the flash it absorbs.
  function lightRod(g, colors, L, pump) {
    g.globalAlpha = 0.3 * pump;
    g.fillStyle = colors.flash;
    g.fillRect(L.rod.x, L.rod.y, L.rod.w, L.rod.h);
    g.globalAlpha = 1;
  }

  // A flashlamp: a glass tube with a metal cap at each end, its gas
  // glowing as strongly as the flash (dark before it is fired).
  function drawFlashlamp(g, colors, L, pump, t) {
    var F = L.flashTube;
    var cap = L.flashCap;
    if (pump > 0) {
      // Broad beams, from the tube's lit length up to the rod's whole
      // bottom (the rod is drawn over their top).
      var rodBottom = L.rod.y + L.rod.h;
      g.globalAlpha = 0.15 + 0.35 * pump;
      g.fillStyle = colors.flash;
      g.beginPath();
      g.moveTo(F.x + cap, F.y);
      g.lineTo(F.x + F.w - cap, F.y);
      g.lineTo(L.rod.x + L.rod.w, rodBottom);
      g.lineTo(L.rod.x, rodBottom);
      g.closePath();
      g.fill();
      flashStreaks(g, colors, L, pump, t);
      // The gas, blooming: a canvas shadow of its own colour, set back
      // by restore() so no other part blooms.
      g.save();
      g.globalAlpha = 0.4 + 0.6 * pump;
      g.fillStyle = colors.flash;
      g.shadowColor = colors.flash;
      g.shadowBlur = L.bloom * pump;
      g.fillRect(F.x + cap, F.y, F.w - 2 * cap, F.h);
      g.restore();
    }
    // The glass's edge and the metal caps in the lamp's own colour (the
    // owner found them dull grey on the light theme).
    g.strokeStyle = colors.lamp;
    g.lineWidth = 1;
    g.strokeRect(F.x, F.y, F.w, F.h);
    g.fillStyle = colors.lamp;
    g.fillRect(F.x, F.y, cap, F.h);
    g.fillRect(F.x + F.w - cap, F.y, cap, F.h);
    if (pump > 0) lightUp(g, colors.accent, L, F.x, F.w, F.y, pump);
  }

  // A discharge: the electrodes under the gas tube, wired to the supply on
  // the bench, with an arrow on each wire while the current flows. (The
  // tube itself is the medium: drawTube.)
  function drawDischarge(g, colors, L, pump) {
    var S = L.supply;
    var sides = [S.x, S.x + S.w];
    g.strokeStyle = colors.muted;
    g.lineWidth = 1.5;
    L.electrodes.forEach(function (e, i) {
      var x = e.x + e.w / 2;
      line(g, x, e.y + e.h, x, L.wireY);
      line(g, x, L.wireY, sides[i], L.wireY);
    });
    g.globalAlpha = 0.4;
    g.fillStyle = colors.faint;
    g.fillRect(S.x, S.y, S.w, S.h);
    g.globalAlpha = 1;
    g.strokeRect(S.x, S.y, S.w, S.h);
    g.fillStyle = colors.muted;
    L.electrodes.forEach(function (e) {
      g.fillRect(e.x, e.y, e.w, e.h);
    });
    if (pump > 0) {
      g.globalAlpha = 0.3 + 0.7 * pump;
      g.fillStyle = colors.glow;
      L.currentArrows.forEach(function (arrow) {
        arrowHead(g, arrow.x, arrow.y, 0, arrow.dy, 6);
      });
      g.globalAlpha = 1;
    }
  }

  // A pump laser: a box on the bench; its beam runs to a small mirror at
  // 45° under the rod's middle, which turns it up into the rod.
  function drawPumpLaser(g, colors, L, pump) {
    var P = L.pumpLaser;
    var fold = L.fold;
    var half = fold.size / 2;
    var rodBottom = L.rod.y + L.rod.h;
    g.globalAlpha = 0.4;
    g.fillStyle = colors.faint;
    g.fillRect(P.x, P.y, P.w, P.h);
    g.globalAlpha = 1;
    g.strokeStyle = colors.muted;
    g.lineWidth = 1.5;
    g.strokeRect(P.x, P.y, P.w, P.h);
    if (pump > 0) {
      g.globalAlpha = 0.3 + 0.7 * pump;
      g.strokeStyle = colors.glow;
      g.fillStyle = colors.glow;
      g.lineWidth = 2.5;
      line(g, P.x + P.w, L.beamY, fold.x, L.beamY);
      line(g, fold.x, L.beamY, fold.x, rodBottom + 6);
      arrowHead(g, fold.x, rodBottom + 2, 0, -1, 6);
      g.globalAlpha = 1;
    }
    // The small mirror, "/": light coming from the left goes up.
    g.fillStyle = colors.faint;
    post(g, fold.x, fold.y + half, L.railY);
    g.strokeStyle = colors.heading;
    g.lineWidth = 2.5;
    line(g, fold.x - half, fold.y + half, fold.x + half, fold.y - half);
  }

  // A bleachable filter: a plate, shaded by its share still unbleached.
  function drawFilter(g, colors, L, open) {
    var F = L.filter;
    g.globalAlpha = 0.15 + 0.6 * (1 - open);
    g.fillStyle = colors.muted;
    g.fillRect(F.x, F.y, F.w, F.h);
    g.globalAlpha = 1;
    g.strokeStyle = colors.faint;
    g.lineWidth = 1;
    g.strokeRect(F.x, F.y, F.w, F.h);
  }

  // The rod of gain medium: a see-through fill with a solid edge.
  function drawRod(g, colors, L) {
    g.globalAlpha = 0.28;
    g.fillStyle = colors.accent;
    g.fillRect(L.rod.x, L.rod.y, L.rod.w, L.rod.h);
    g.globalAlpha = 1;
    g.strokeStyle = colors.accent;
    g.lineWidth = 1.5;
    g.strokeRect(L.rod.x, L.rod.y, L.rod.w, L.rod.h);
  }

  // The gas tube of a discharge: lighter glass than a rod, and its gas
  // glowing with the current (never so brightly that the rays vanish in it).
  function drawTube(g, colors, L, pump) {
    var T = L.tube;
    var B = L.bore;
    g.globalAlpha = 0.12;
    g.fillStyle = colors.accent;
    g.fillRect(T.x, T.y, T.w, T.h);
    if (pump > 0) {
      g.globalAlpha = 0.15 + 0.6 * pump;
      g.fillStyle = colors.glow;
      g.fillRect(B.x, B.y, B.w, B.h);
    }
    g.globalAlpha = 1;
    g.strokeStyle = colors.accent;
    g.lineWidth = 1.5;
    g.strokeRect(T.x, T.y, T.w, T.h);
  }

  function draw(view, labels, light) {
    var g = view.g;
    var colors = view.colors;
    var L = layout(view.w, view.h);
    var beam = light && light.beam > 0 ? light.beam : 0;
    var pump = light && light.pump >= PUMP_OFF ? Math.min(1, light.pump) : 0;
    var kind = kindOf(light);
    var qSwitch = switchOf(light, kind);
    var rodBottom = L.rod.y + L.rod.h;

    g.clearRect(0, 0, view.w, view.h);
    g.save();
    if (kind === "flashlamp" && pump > 0) flashBehind(g, colors, L, view.w, view.h, pump);

    // The bench, and what the parts stand on: the mirrors, and the two ends
    // of the medium (a gas tube's posts stand outside its electrodes).
    g.strokeStyle = colors.line;
    g.lineWidth = 2;
    line(g, L.pad / 2, L.railY, view.w - L.pad / 2, L.railY);
    g.fillStyle = colors.faint;
    post(g, L.backMirror.x + L.backMirror.w / 2, L.backMirror.y + L.backMirror.h + 3, L.railY);
    post(g, L.outputMirror.x + L.outputMirror.w / 2, L.outputMirror.y + L.outputMirror.h + 3, L.railY);
    if (qSwitch) post(g, L.filter.x + L.filter.w / 2, L.filter.y + L.filter.h, L.railY);
    var mediumPosts = kind === "discharge" ? L.tubePosts : L.rodPosts;
    mediumPosts.forEach(function (x) {
      post(g, x, rodBottom, L.railY);
    });

    // The pump, then the medium over it.
    if (kind === "flashlamp") drawFlashlamp(g, colors, L, pump, view.still ? 0 : view.t);
    else if (kind === "discharge") drawDischarge(g, colors, L, pump);
    else if (kind === "laser") drawPumpLaser(g, colors, L, pump);
    else drawDiodes(g, colors, L, pump);
    if (kind === "discharge") drawTube(g, colors, L, pump);
    else drawRod(g, colors, L);
    if (kind === "flashlamp" && pump > 0) lightRod(g, colors, L, pump);
    // The filter in the gap.
    if (qSwitch) drawFilter(g, colors, L, openOf(qSwitch));

    // The light: separate rays between the mirrors, some of them leaving.
    if (beam > 0) {
      var count = L.rays.length;
      var leaving = middleRays(count, raysOut(count, light.transmission));
      var outLeft = L.outputMirror.x + L.outputMirror.w;
      // The arrowheads go in the open gaps between the mirrors and the
      // medium: the rod, or a discharge's gas tube.
      var medium = kind === "discharge" ? L.tube : L.rod;
      // On the left, between the filter (if any) and the medium.
      var leftFrom = qSwitch ? L.filter.x + L.filter.w : faceX(L, "back", L.axis.y);
      var leftGap = (leftFrom + medium.x) / 2;
      var rightGap = (medium.x + medium.w + faceX(L, "output", L.axis.y)) / 2;
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
    // The filter's name on the top row, which the transmission then shares.
    var switchName = qSwitch && labels.qSwitch ? labels.qSwitch : "";
    PARTS.forEach(function (name) {
      var text = name === "transmission" ? transmissionText(labels.transmission, light) : labels[name];
      var spot = L.labels[name];
      if (name === "qSwitch") text = switchName;
      if (name === "transmission" && switchName) spot = L.labels.transmissionShared;
      if (!text) return;
      g.textAlign = spot.align;
      g.fillText(text, spot.x, spot.y, spot.maxWidth);
    });

    g.restore();
  }

  UI.bench = Object.freeze({
    SIZE: SIZE,
    PARTS: PARTS,
    KINDS: KINDS,
    Q_KINDS: Q_KINDS,
    PUMP_OFF: PUMP_OFF,
    POST_FOOT: POST_FOOT,
    layout: layout,
    faceX: faceX,
    raysOut: raysOut,
    rayAlpha: rayAlpha,
    draw: draw
  });
})(this);
