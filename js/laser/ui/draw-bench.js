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
     LaserUI.bench.SHAPES            the mirror shapes it draws: "flat",
                                     "concave", "convex"
     LaserUI.bench.faceX(L, which, y, shape)   the x of a mirror's face at
                                     height y; which is "back" or "output";
                                     shape one of SHAPES (none, or one it
                                     does not know: concave, the drawing's
                                     shape before stage 10b)
     LaserUI.bench.PUMP_PHOTONS      at most this many pump photons drawn
     LaserUI.bench.GAS_ATOMS         the atoms drifting in a gas tube
     LaserUI.bench.PUMP_DEPTH        the pump light fades as e^(−z/d), d
                                     this share of the drawn rod
     LaserUI.bench.raysOut(count, transmission)   how many of `count` rays
                                     leave through the output mirror
     LaserUI.bench.rayAlpha(beam)    how strongly the rays are drawn, 0–1;
                                     the photon cartoon's light uses it too
     LaserUI.bench.draw(view, labels, light)
         view    what LaserUI.loop hands its draw function
         labels  { backMirror, outputMirror, medium, pump, transmission,
                 qSwitch, widths, focus, infrared, ultraviolet }: the
                 words, already in the visitor's language (widths:
                 "Widths ×", written with its number; focus: "F", written
                 F₁ and F₂; infrared / ultraviolet: "infrared, invisible",
                 written after an invisible beam's wavelength); an
                 empty one is left out. After `transmission` the drawing
                 writes the output mirror's transmission ("Transmission
                 5.00 %"), and without a transmission in `light` it leaves
                 that label out. `qSwitch` is written only with a switch
         light   optional { beam, pump, transmission, pumpKind, qSwitch,
                 cavity, medium, lam }
                 medium        the engine's medium id (stage 10c1): its
                               look and colours from materials.js
                 lam           the laser's wavelength (m): the beam's
                               colour
                 pumpLam       the pump's wavelength (m), for diodes and
                               a pump laser: their light's colour
                               (stage 10c2)
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
                 doubler       optional (stage 13b) { share, green }: a
                               doubling crystal past the output mirror
                               turning that share (0–1) of the leaving
                               light into its second harmonic (λ/2),
                               green its light in beam's units; drawn
                               only with cavity; null or none draws no
                               crystal
                 cavity        optional (stage 10b) { length, aperture,
                               shapes: { back, output }, focus: { back,
                               output } (R/2, m; negative behind, null
                               flat), mode: [{ z, w }] or null, rays:
                               [{ y0, hits, escaped }] (the engine's
                               traceRay from mirror 1 at height y0; a
                               hit's `middle`, with the rod's thermal
                               lens, bends the ray at the middle) }.
                               With it: the mirrors in their shapes, the
                               mode's hourglass (a band without a mode),
                               the traced rays, F, "Widths × k"; without
                               it, the parallel rays of stage 6b

   THE PUMPS (docs/laser-plan.md, stage 7d)
     diode      end-pumped (stage 10c2): a module on the bench, a fibre to
                a lens behind the back mirror, and a cone of pump light
                through the back mirror into the rod (see THE PUMP'S
                LIGHT)
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
     laser      end-pumped (stage 10c2), as real Ti:sapphire and dye
                lasers are: a pump laser on the bench, its beam to a
                periscope in the left margin, up to the axis and through
                the lens behind the back mirror into the rod, as the
                diodes' light
   A diode's or a pump laser's light has its wavelength's colour (stage
   10c2); the flash's is colors.flash (a silver-white, the same in both
   themes), made readable on the bench; without a medium, the theme's glow.

   THE Q-SWITCH (docs/laser-plan.md, stage 8b)
     absorber  a filter plate on a post in the gap between the back
               mirror and the rod, shaded by its share still unbleached;
               on an end-pumped bench (diodes, pump laser), in the gap between the rod and
               the output mirror (as in real ones: out of the pump's way),
               its name then under the bench at the right. It is drawn
               over the laser's rays, and the light beyond it (towards
               the mirror on its far side) is dimmed as much as the plate
               is shaded: a dark filter holds the light back
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
   spontaneous emission below threshold (about 10⁻⁸) does not.

   THE PUMP'S LIGHT (stage 10c2)
   The diodes are end-pumped (docs/laser-physics.md §6.3): a module with
   cooling fins on the bench, a fibre along the bench and up the left
   margin to a lens on the axis behind the back mirror, and from the lens
   a cone of pump light through the back mirror into the rod, narrowing to
   a waist just inside it and fading as e^(−z/d) (d: PUMP_DEPTH of the
   rod, an illustration). A pump laser (532 nm green) is end-pumped the
   same way, its beam brought to the lens by a periscope. Pump photons (diodes, pump laser, flashlamp) travel
   into the medium, as many as the pump is strong, each vanishing at its
   own depth where a spark lights an atom; atoms drift in a gas tube, as
   many lit as the current is strong. Both move in screen time view.t,
   from fixed fractions (no random numbers), and stand still for
   view.still.

   THE MEDIA AND THE BEAM'S COLOUR (stage 10c1; docs/laser-physics.md
   §5.10, §11.5)
   With light.medium, a medium materials.js knows, the rod is a crystal in
   its own colour (a highlight along its top, a shade along its bottom, a
   polished end face at each end), the dye a glass cell with two pipes, a
   gas tube glass with its bore glowing in the gas's colour; and the beam
   (light.lam) is drawn in its wavelength's colour, or, for light the eye
   cannot see, in materials' false colour with "1.06 µm · infrared,
   invisible" on its own row at the bottom right. A coloured ray is drawn
   over a thin casing in the theme's background colour, so it shows over
   a medium of the same hue. Every physical line goes through
   materials.readable() against the theme's background.

   Colours come from view.colors (the theme), and, for the media and the
   beams, from LaserUI.materials; the two-level atom, or a light without
   a medium, is drawn in the theme's colours only.

   Needs: format.js (the transmission's number, the wavelength) and
   materials.js, loaded before it.
   Tests: tests/laser/draw-bench.test.js
   ========================================================================== */
(function (root) {
  "use strict";

  var UI = root.LaserUI = root.LaserUI || {};

  // Wide and low, like a real optical bench.
  var SIZE = Object.freeze({ aspect: 2.6, minHeight: 240, maxHeight: 380 });

  // The labels, in the order they are written. page.js takes their words
  // from data/laser.json (bench.parts.<name>).
  var PARTS = Object.freeze(["backMirror", "outputMirror", "medium", "pump", "transmission", "qSwitch", "widths", "focus",
    "infrared", "ultraviolet"]);
  // The words written in places of their own, not by the loop over PARTS:
  // "Widths × 90" (bottom left), each focal point's "F", and the note
  // under an invisible beam.
  var OWN_PLACE_WORDS = ["widths", "focus", "infrared", "ultraviolet"];

  // The mirrors' shapes it can draw (the engine's bench.MIRROR_SHAPES).
  var SHAPES = Object.freeze(["flat", "concave", "convex"]);
  // A traced ray is drawn this much fainter on each round trip, and at
  // least this strong when the laser is dark: it is the path light would
  // take, shown whether or not there is light.
  var RAY_FADE = 0.72;
  var PATH_ALPHA = 0.3;
  // How far a ray that walks out is drawn past the mirror: this share of
  // the picture's width.
  var ESCAPE_RUN = 0.06;
  // After the word F: which mirror's focus it is.
  var FOCUS_MARKS = ["₁", "₂"];
  // An F's words start this far inside the mirror's face edge, plus the
  // deepest a face can stand out (L.sagMax).
  var FOCUS_GAP = 8;
  // A mirror's mount (px): the metal plate behind the glass, and the
  // half-width of its adjusting knobs.
  var MOUNT_PLATE = 3;
  var MOUNT_KNOB = 2.5;
  // The light's clearance in the mount's hole, above and below it (px).
  var MOUNT_HOLE = 2;
  // The traced rays are drawn only this share of a mirror's height above
  // and below the mirrors.
  var PATH_BAND = 0.25;

  // The pumps it draws: the engine's pump kinds.
  var KINDS = Object.freeze(["diode", "laser", "flashlamp", "discharge"]);

  // The Q-switch it draws: the engine's bleachable filter.
  var Q_KINDS = Object.freeze(["absorber"]);
  // The top row with the filter's name: the transmission's share
  // of it, and the least room the name is given before it moves left.
  var TRANSMISSION_SHARE = 0.6;
  // How much darker a dark filter's plate is than a bleached one, and so
  // how much it dims the light beyond it.
  var FILTER_SHADE = 0.6;
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
  // Stage 10c2. The pump light fades inside the medium as e^(−z/d), with d
  // this share of the drawn rod (an illustration: docs/laser-plan.md,
  // 10c2's scope card).
  var PUMP_DEPTH = 0.35;
  // At most this many pump photons, as many shown as the pump is strong;
  // each goes round PHOTON_RATE times a second of screen time, travelling
  // for the first PHOTON_TRAVEL of its round and then lighting an atom.
  var PUMP_PHOTONS = 12;
  var PHOTON_RATE = 0.6;
  var PHOTON_TRAVEL = 0.8;
  // The atoms drifting in a gas tube.
  var GAS_ATOMS = 18;
  // Fixed fractions from 0 to 1, spread evenly (k times the golden ratio,
  // and k times another irrational number, each without its whole part):
  // where each photon is absorbed, where it starts, where each atom is. No
  // random numbers, so the picture depends only on what it is given.
  var SPREAD_A = [];
  var SPREAD_B = [];
  for (var spread = 0; spread < Math.max(PUMP_PHOTONS, GAS_ATOMS); spread++) {
    SPREAD_A.push(((spread + 1) * 0.6180339887) % 1);
    SPREAD_B.push(((spread + 1) * 0.7548776662) % 1);
  }

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

    // The rod's two posts, near its ends.
    var rodPosts = [rodX + 0.02 * rodLength, rodX + 0.98 * rodLength];

    // The end-pumped diodes (stage 10c2): a module on the bench under the
    // rod's middle, its fibre along the bench to the left margin, up it,
    // and into a small lens on the axis behind the back mirror.
    var moduleWidth = 0.5 * lampLength;
    var moduleHeight = 0.1 * h;
    var marginLeft = pad / 2;
    var marginRoom = side - marginLeft;
    var fibreX = marginLeft + 0.3 * marginRoom;
    var lensX = marginLeft + 0.72 * marginRoom;

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
      sag: 0.35 * mirrorThickness,                  // how deep a curved face is when its radius is not known
      sagMin: 0.25 * mirrorThickness,               // ... the largest radius
      sagMax: Math.min(2.8 * mirrorThickness, 0.08 * span),   // ... the smallest radius
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
      // The pump laser (stage 10c2: end-pumped, as real Ti:sapphire and
      // dye lasers are): a box on the bench under the rod's middle, where
      // the diodes' module stands; its beam leaves its left end, runs along
      // the bench to a periscope of two mirrors at 45° in the left margin,
      // up to the axis, and into the lens behind the back mirror.
      pumpLaser: { x: w / 2 - moduleWidth / 2, y: railY - moduleHeight, w: moduleWidth, h: moduleHeight },
      beamY: railY - moduleHeight / 2,
      periscope: { x: fibreX, low: railY - moduleHeight / 2, high: axisY, half: Math.min(5, 0.25 * marginRoom) },
      filter: { x: filterX, y: axisY - filterHeight / 2, w: filterWidth, h: filterHeight },
      // The filter on the end-pumped diodes (stage 10c2): the mirror image,
      // between the rod and the output mirror.
      filterBeyond: { x: w - filterX - filterWidth, y: axisY - filterHeight / 2, w: filterWidth, h: filterHeight },
      // The doubling crystal (stage 13b): a small block on the beam past
      // the output mirror, in the room left for the light that leaves.
      doubler: { x: w - 0.75 * side, y: axisY - 0.08 * h, w: 0.3 * side, h: 0.16 * h },
      diodeModule: { x: w / 2 - moduleWidth / 2, y: railY - moduleHeight, w: moduleWidth, h: moduleHeight },
      fins: 5,
      finHeight: 0.03 * h,
      fibre: { x: fibreX, y: railY - moduleHeight / 2, corner: Math.min(8, 0.5 * (lensX - fibreX)) },
      lens: { x: lensX, y: axisY, rx: Math.max(1.5, 0.06 * marginRoom), ry: 0.32 * rodHeight },
      // The pump light's cone, as half-heights: at the lens, at its waist
      // just inside the rod, and at the rod's far end.
      cone: { start: 0.25 * rodHeight, waistX: rodX + 0.1 * rodLength, waist: 0.08 * rodHeight, end: 0.2 * rodHeight },
      pumpDepth: PUMP_DEPTH * rodLength,
      pumpDepthUp: PUMP_DEPTH * rodHeight,
      rays: rays,
      // With the cavity's numbers: the aperture (the rod's radius, or the
      // gas tube's bore) is drawn as the rod's half-height, or the bore's
      // on a discharge, so the beam and the rays stay inside the medium
      // that limits them (stage 10b review). An F off the picture is an
      // arrowhead in the margin beside its edge, and its words just inside
      // the mirror, on its mirror's row under the rod, no wider than the
      // gap before the rod (`focusRoom.rod`) or, on a discharge, before
      // the electrode (`focusRoom.discharge`).
      // A dye cell's pipes, under it near its ends (stage 10c), clear of
      // the rod's posts.
      cellPipes: [rodX + 0.15 * rodLength, rodX + 0.85 * rodLength],
      cellPipe: 0.05 * h,
      apertureHalf: rodHeight / 2,
      boreHalf: boreHeight / 2,
      focusRows: [axisY + 0.17 * h, axisY + 0.17 * h + 1.15 * fontSize],
      focusRoom: {
        rod: Math.max(fontSize, rodX - innerLeft - 8),
        discharge: Math.max(fontSize, electrodes[0].x - innerLeft - 6)
      },
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
        transmissionShared: sharedRow.transmission,
        // The filter's name when it stands beyond the rod (stage 10c2):
        // under the bench at the right, beside the pump's name.
        qSwitchBelow: { x: w - pad, y: bottomRow, align: "right", maxWidth: Math.max(fontSize, w / 2 - lampLength / 2 - pad - fontSize) },
        // "Widths × 90": bottom left, beside the pump's name.
        widths: { x: pad, y: bottomRow, align: "left", maxWidth: Math.max(fontSize, lampX - pad - fontSize) },
        // "1.06 µm · infrared, invisible", for a beam the eye cannot see
        // (stage 10c1): on a row of its own under the pump's name, at the
        // right (beside the pump's name it was squeezed to a third on a
        // phone: stage 10c1 review).
        invisible: { x: w - pad, y: bottomRow + 1.35 * fontSize, align: "right", maxWidth: w - 2 * pad }
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

  // How a face curves: +1 into the glass (concave, as seen from the
  // cavity), −1 out of it (convex), 0 flat. Anything else is concave, the
  // drawing's shape before the page chose mirrors.
  function bendOf(shape) {
    if (shape === "flat") return 0;
    if (shape === "convex") return -1;
    return 1;
  }

  // How deep a mirror's face curves (px): from its radius when the
  // drawing has it (L.depth, set in draw(): a small radius curves deeply,
  // a large one hardly at all), else the layout's `sag`.
  function sagOf(L, which) {
    if (L.depth && typeof L.depth[which] === "number") return L.depth[which];
    return L.sag;
  }

  // How far a mirror's face stands out of the glass towards the laser at
  // height share u (0 at the top, 1 at the bottom). Convex: the middle
  // bulges out by the sag. Concave: the top and bottom stand out by the
  // sag and the middle stays on the glass, a cup open towards the laser.
  // Flat: 0. The face never cuts into the glass, so a deep curve fits.
  function faceOffset(L, which, u, shape) {
    var bend = bendOf(shape);
    var sag = sagOf(L, which);
    var middle = 4 * u * (1 - u);
    if (bend === 0) return 0;
    if (bend < 0) return sag * middle;
    return sag * (1 - middle);
  }

  // A mirror's face: its x at height y. This is the curve quadraticCurveTo
  // draws in mirror().
  function faceX(L, which, y, shape) {
    var mirror = which === "back" ? L.backMirror : L.outputMirror;
    var u = clamp((y - mirror.y) / mirror.h, 0, 1);
    var offset = faceOffset(L, which, u, shape);
    return which === "back" ? mirror.x + mirror.w + offset : mirror.x - offset;
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

  // A ray in its colour, over a casing 2 px wider in `casing` (the
  // theme's background) at 0.6 of its alpha, so a beam shows over a
  // medium of the same hue (stage 10c1 review); without a casing, the ray
  // alone.
  function casedLine(g, x1, y1, x2, y2, colour, casing, alpha, width) {
    if (casing) {
      g.globalAlpha = 0.6 * alpha;
      g.strokeStyle = casing;
      g.lineWidth = width + 2;
      line(g, x1, y1, x2, y2);
    }
    g.globalAlpha = alpha;
    g.strokeStyle = colour;
    g.lineWidth = width;
    line(g, x1, y1, x2, y2);
  }

  function line(g, x1, y1, x2, y2) {
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  }

  // A filled arrowhead with its tip at (x, y), pointing along (dx, dy),
  // which is (±1, 0) or (0, ±1).
  // The same arrowhead, pointing along the x axis (dx ±1), outlined.
  function hollowArrowHead(g, x, y, dx, size) {
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x - dx * size, y - 0.55 * size);
    g.lineTo(x - dx * size, y + 0.55 * size);
    g.closePath();
    g.stroke();
  }

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

  // The hole in a mirror's mount: from MOUNT_HOLE px above the highest
  // light that passes a mirror (the rod's or the bore's half-height, which
  // the rays stay inside, and the pump's cone) to as far below it.
  function mountHole(L) {
    var half = Math.max(L.apertureHalf, L.boreHalf, L.cone.start);
    return { top: L.axis.y - half - MOUNT_HOLE, bottom: L.axis.y + half + MOUNT_HOLE };
  }

  // A mirror, drawn as a real one looks from the side: a block of pale
  // green optical glass with a glint along it, a silver coating on its
  // curved face, held in a metal mount with an adjusting knob at the top
  // and the bottom. `strong` is the mirror that reflects everything; the
  // output mirror's coating is thinner and see-through, as it lets light out.
  function mirror(g, colors, L, which, strong, shape) {
    var m = which === "back" ? L.backMirror : L.outputMirror;
    var outer = which === "back" ? m.x : m.x + m.w;
    var inner = which === "back" ? m.x + m.w : m.x;
    var towardsLaser = which === "back" ? 1 : -1;
    // The face's ends and its middle (faceOffset), and the control point
    // that puts a quadratic curve through all three.
    var endX = inner + towardsLaser * faceOffset(L, which, 0, shape);
    var middleX = inner + towardsLaser * faceOffset(L, which, 0.5, shape);
    var controlX = 2 * middleX - endX;
    var middleY = m.y + m.h / 2;

    var M = UI.materials;
    var glassEdge = M.readable(M.MIRROR_GLASS, colors.bg);
    var silver = M.readable(M.SILVER, colors.bg);
    var awayFromLaser = -towardsLaser;

    // the mount behind the glass: a metal plate as tall as the mirror and
    // its clamps, with an adjusting knob sticking out at the top and the
    // bottom (as on a real mirror mount)
    // It has a hole for the light, as a real mount does: the plate stops
    // short of the beam, the rays and the pump light (mountHole), which
    // pass through the mirror.
    var plateX = which === "back" ? outer - MOUNT_PLATE : outer;
    var hole = mountHole(L);
    g.fillStyle = colors.muted;
    g.fillRect(plateX, m.y - 4, MOUNT_PLATE, hole.top - (m.y - 4));
    g.fillRect(plateX, hole.bottom, MOUNT_PLATE, m.y + m.h + 4 - hole.bottom);
    // (rectangles, not circles: a circle on the bench is a photon or an atom)
    var knobX = outer + awayFromLaser * (MOUNT_PLATE + MOUNT_KNOB);
    [m.y + 0.12 * m.h, m.y + 0.88 * m.h].forEach(function (y) {
      g.fillRect(Math.min(outer, knobX), y - 1, MOUNT_PLATE + MOUNT_KNOB, 2);
      g.fillRect(knobX - MOUNT_KNOB, y - 1.6 * MOUNT_KNOB, 2 * MOUNT_KNOB, 3.2 * MOUNT_KNOB);
    });

    // the glass
    g.beginPath();
    g.moveTo(outer, m.y);
    g.lineTo(endX, m.y);
    g.quadraticCurveTo(controlX, middleY, endX, m.y + m.h);
    g.lineTo(outer, m.y + m.h);
    g.closePath();
    g.globalAlpha = 0.55;
    g.fillStyle = M.MIRROR_GLASS;
    g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = glassEdge;
    g.lineWidth = 1;
    g.stroke();

    // the glass's darker back edge, and a glint of light along it
    g.globalAlpha = 0.18;
    g.fillStyle = M.SHADE;
    g.fillRect(which === "back" ? outer : outer - 2, m.y, 2, m.h);
    g.globalAlpha = 0.9;
    g.strokeStyle = M.HIGHLIGHT;
    g.lineWidth = 1.5;
    var glintX = outer + towardsLaser * 0.4 * m.w;
    line(g, glintX, m.y + 0.1 * m.h, glintX, m.y + 0.45 * m.h);
    g.globalAlpha = 0.6;
    line(g, glintX, m.y + 0.55 * m.h, glintX, m.y + 0.65 * m.h);
    g.globalAlpha = 1;

    // the silver coating on the face
    g.beginPath();
    g.moveTo(endX, m.y);
    g.quadraticCurveTo(controlX, middleY, endX, m.y + m.h);
    g.strokeStyle = silver;
    g.lineWidth = strong ? 4 : 2.5;
    g.globalAlpha = strong ? 1 : 0.55;
    g.stroke();
    g.globalAlpha = 1;

    // the holder: a clamp at the top and at the bottom
    // (as wide as the glass with a concave face's rims)
    var clampLeft = Math.min(m.x, endX) - 2;
    var clampWidth = Math.max(m.x + m.w, endX) + 2 - clampLeft;
    g.fillStyle = colors.muted;
    g.fillRect(clampLeft, m.y - 4, clampWidth, 4);
    g.fillRect(clampLeft, m.y + m.h, clampWidth, 4);
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

  // The end-pumped diodes (stage 10c2): the module with its cooling fins
  // on the bench, the fibre to the left margin and up it, and the lens on
  // the axis behind the back mirror. Their light: drawCone() and
  // drawPhotons().
  function drawDiodes(g, colors, L) {
    var M = L.diodeModule;
    var F = L.fibre;
    var lens = L.lens;
    var r = F.corner;
    g.globalAlpha = 0.4;
    g.fillStyle = colors.faint;
    g.fillRect(M.x, M.y, M.w, M.h);
    g.globalAlpha = 1;
    g.strokeStyle = colors.muted;
    g.lineWidth = 1.5;
    g.strokeRect(M.x, M.y, M.w, M.h);
    for (var k = 0; k < L.fins; k++) {
      var x = M.x + (k + 0.5) / L.fins * M.w;
      line(g, x, M.y, x, M.y - L.finHeight);
    }
    // The fibre, its corners cut at 45°.
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(M.x, F.y);
    g.lineTo(F.x + r, F.y);
    g.lineTo(F.x, F.y - r);
    g.lineTo(F.x, lens.y + r);
    g.lineTo(F.x + r, lens.y);
    g.lineTo(lens.x - lens.rx, lens.y);
    g.stroke();
    drawLens(g, colors, L);
  }

  // The lens on the axis behind the back mirror that focuses the pump
  // into the rod (the diodes' and the pump laser's).
  function drawLens(g, colors, L) {
    var lens = L.lens;
    g.globalAlpha = 0.4;
    g.fillStyle = colors.faint;
    g.beginPath();
    g.ellipse(lens.x, lens.y, lens.rx, lens.ry, 0, 0, 2 * Math.PI);
    g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = colors.heading;
    g.lineWidth = 1.2;
    g.stroke();
  }

  // The cone's half-height at x: from the lens to its waist, then wider
  // again to the rod's far end.
  function coneHalf(L, x) {
    var C = L.cone;
    var rodEnd = L.rod.x + L.rod.w;
    if (x <= C.waistX) {
      var share = (x - L.lens.x) / (C.waistX - L.lens.x);
      return C.start + (C.waist - C.start) * clamp(share, 0, 1);
    }
    return C.waist + (C.end - C.waist) * clamp((x - C.waistX) / (rodEnd - C.waistX), 0, 1);
  }

  // The diodes' light: a cone from the lens through the back mirror into
  // the rod, fading as it is absorbed, e^(−z/d), drawn in slices.
  function drawCone(g, L, colour, pump) {
    var strength = 0.15 + 0.35 * pump;
    var rodStart = L.rod.x;
    // Each slice's edges at whole pixels: at a fraction, the two slices
    // either side of an edge each half cover it, which shows as a seam.
    var stops = [Math.round(L.lens.x), Math.round(L.cone.waistX)];
    var slices = 12;
    for (var k = 1; k <= slices; k++) stops.push(Math.round(L.cone.waistX + k / slices * (L.rod.x + L.rod.w - L.cone.waistX)));
    g.fillStyle = colour;
    for (var i = 0; i + 1 < stops.length; i++) {
      var x1 = stops[i];
      var x2 = stops[i + 1];
      var middle = (x1 + x2) / 2;
      var depth = Math.max(0, middle - rodStart);
      g.globalAlpha = strength * Math.exp(-depth / L.pumpDepth);
      g.beginPath();
      g.moveTo(x1, L.axis.y - coneHalf(L, x1));
      g.lineTo(x2, L.axis.y - coneHalf(L, x2));
      g.lineTo(x2, L.axis.y + coneHalf(L, x2));
      g.lineTo(x1, L.axis.y + coneHalf(L, x1));
      g.closePath();
      g.fill();
    }
    g.globalAlpha = 1;
  }

  // Where pump photon k is at screen time t, by kind: { x, y, travelling,
  // share }, share the part of its round past its travel (0 while it
  // travels, up to 1 as its atom's spark fades).
  // The photons shown are spread evenly over a round (k / count), so a
  // steady pump looks steady, not bunched.
  function photonAt(L, kind, k, count, t) {
    var round = (t * PHOTON_RATE + k / count) % 1;
    if (round < 0) round += 1;
    var travel = Math.min(1, round / PHOTON_TRAVEL);
    var spark = round < PHOTON_TRAVEL ? 0 : (round - PHOTON_TRAVEL) / (1 - PHOTON_TRAVEL);
    // Its depth in the medium: exponential, e^(−z/d), at most nearly through.
    var u = SPREAD_A[k];
    var side = 2 * SPREAD_B[k] - 1;
    var rodBottom = L.rod.y + L.rod.h;
    var x;
    var y;
    if (kind === "diode" || kind === "laser") {
      var depth = Math.min(-Math.log(1 - u) * L.pumpDepth, 0.97 * L.rod.w);
      x = L.lens.x + travel * (L.rod.x + depth - L.lens.x);
      y = L.axis.y + 0.8 * side * coneHalf(L, x);
    } else {
      // The flashlamp's light, from the tube up into the rod.
      var up = Math.min(-Math.log(1 - u) * L.pumpDepthUp, 0.95 * L.rod.h);
      var F = L.flashTube;
      x = F.x + L.flashCap + SPREAD_B[k] * (F.w - 2 * L.flashCap);
      y = F.y + travel * (rodBottom - up - F.y);
    }
    return { x: x, y: y, travelling: spark === 0, share: spark };
  }

  // The pump's photons on their way into the medium, as many as the pump
  // is strong; each vanishes where it is absorbed, lighting an atom.
  function drawPhotons(g, L, kind, colour, spark, casing, sparkRing, pump, t) {
    var count = Math.ceil(PUMP_PHOTONS * pump);
    for (var k = 0; k < count; k++) {
      var p = photonAt(L, kind, k, count, t);
      if (p.travelling) dot(g, p.x, p.y, 2.2, colour, 0.9, casing);
      else dot(g, p.x, p.y, 3.2, spark, 0.9 * (1 - p.share), sparkRing);
    }
    g.globalAlpha = 1;
  }

  // A dot of radius r, over a ring 1.2 px wider in `casing` at 0.6 of its
  // alpha.
  function dot(g, x, y, r, fill, alpha, casing) {
    g.globalAlpha = 0.6 * alpha;
    g.fillStyle = casing;
    g.beginPath();
    g.arc(x, y, r + 1.2, 0, 2 * Math.PI);
    g.fill();
    g.globalAlpha = alpha;
    g.fillStyle = fill;
    g.beginPath();
    g.arc(x, y, r, 0, 2 * Math.PI);
    g.fill();
  }

  // The atoms in a gas tube, drifting along the bore and wobbling a
  // little, in the theme's muted colour (a gas cannot be seen); as many
  // of them lit, white sparks, as the current is strong.
  function drawGasAtoms(g, L, colour, spark, casing, sparkRing, pump, t) {
    var B = L.bore;
    var lit = Math.round(GAS_ATOMS * pump);
    for (var k = 0; k < GAS_ATOMS; k++) {
      var direction = k % 2 === 0 ? 1 : -1;
      var speed = 0.03 + 0.06 * SPREAD_B[k];         // bore lengths a second
      var along = (SPREAD_A[k] + direction * speed * t) % 1;
      if (along < 0) along += 1;
      var x = B.x + 3 + along * (B.w - 6);
      var y = B.y + B.h * (0.25 + 0.5 * SPREAD_B[(k + 7) % GAS_ATOMS]) + 0.1 * B.h * Math.sin(2 * t + k);
      if (k < lit) dot(g, x, y, 2.6, spark, 0.95, sparkRing);
      else dot(g, x, y, 1.8, colour, 0.7, casing);
    }
    g.globalAlpha = 1;
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
  // own phase in screen time t (draw() hands it a number: 0 for a view
  // without one, or for a visitor who asked for less motion).
  function flashStreaks(g, colors, L, pump, t) {
    var F = L.flashTube;
    var time = t;
    // Lines, so readable on the bench (the silver-white flash is too pale
    // for the near-white lab as it is; the tint and the halo stay a glow).
    g.strokeStyle = UI.materials.readable(colors.flash, colors.bg);
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
      g.fillStyle = UI.materials.readable(colors.flash, colors.bg);
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

  // A pump laser (stage 10c2), end-pumped as real Ti:sapphire and dye
  // lasers are: a box on the bench, its beam along the bench to a
  // periscope in the left margin (two mirrors at 45°: the lower turns it
  // up, the upper along the axis), and into the lens behind the back
  // mirror; from the lens, drawCone(). The beam only while the pump is on.
  function drawPumpLaser(g, colors, L, pump, pumpColour) {
    var P = L.pumpLaser;
    var S = L.periscope;
    var lens = L.lens;
    g.globalAlpha = 0.4;
    g.fillStyle = colors.faint;
    g.fillRect(P.x, P.y, P.w, P.h);
    g.globalAlpha = 1;
    g.strokeStyle = colors.muted;
    g.lineWidth = 1.5;
    g.strokeRect(P.x, P.y, P.w, P.h);
    // The periscope's post, from its upper mirror down to the bench.
    g.fillStyle = colors.faint;
    post(g, S.x, S.high + S.half, L.railY);
    if (pump > 0) {
      g.globalAlpha = 0.3 + 0.7 * pump;
      g.strokeStyle = pumpColour;
      g.lineWidth = 2.5;
      line(g, P.x, S.low, S.x, S.low);
      line(g, S.x, S.low, S.x, S.high);
      line(g, S.x, S.high, lens.x - lens.rx, S.high);
      g.globalAlpha = 1;
    }
    // The two mirrors: "\" turns light going left up; "/" turns it right.
    g.strokeStyle = colors.heading;
    g.lineWidth = 2.5;
    line(g, S.x - S.half, S.low - S.half, S.x + S.half, S.low + S.half);
    line(g, S.x - S.half, S.high + S.half, S.x + S.half, S.high - S.half);
    drawLens(g, colors, L);
  }

  // A bleachable filter, as a real one looks from the side: a thin disc
  // of its own colour (Cr⁴⁺:YAG dark brown) or a glass cell of dye
  // (ruby's cryptocyanine, deep blue), held at the top and the bottom in a
  // ring holder, shaded by its unbleached share, with a glint along it.
  // `absorber` is the engine's id; without one the theme's grey.
  function drawFilter(g, colors, F, open, absorber) {
    var M = UI.materials;
    var look = absorber ? M.ABSORBERS[absorber] : null;
    var body = look ? look.body : colors.muted;
    // the holder's clamps, above and below the disc
    g.fillStyle = colors.muted;
    g.fillRect(F.x - 2, F.y - 5, F.w + 4, 5);
    g.fillRect(F.x - 2, F.y + F.h, F.w + 4, 5);
    var shade = 0.15 + FILTER_SHADE * (1 - open);
    g.globalAlpha = shade;
    g.fillStyle = body;
    g.fillRect(F.x, F.y, F.w, F.h);
    g.globalAlpha = 1;
    if (look && look.look === "liquid") {
      // the cell's glass walls, over the dye between them (under it,
      // the dye hid them: review)
      g.fillStyle = M.readable(M.GLASS, colors.bg);
      g.fillRect(F.x, F.y, 1.5, F.h);
      g.fillRect(F.x + F.w - 1.5, F.y, 1.5, F.h);
    }
    g.strokeStyle = look ? M.readable(body, colors.bg) : colors.faint;
    g.lineWidth = 1;
    g.strokeRect(F.x, F.y, F.w, F.h);
    if (look) {
      // a white glint drawn over the plate, as strong as the plate is
      // dark: on a bleached plate it would be white on white
      g.globalAlpha = 0.9 * shade;
      g.strokeStyle = M.HIGHLIGHT;
      line(g, F.x + 0.35 * F.w, F.y + 0.1 * F.h, F.x + 0.35 * F.w, F.y + 0.4 * F.h);
      g.globalAlpha = 1;
    }
  }

  // The light beyond a filter, towards the mirror on its far side: the
  // background's colour over it, as strong as the plate's shade
  // (0.6·(1 − open)), over the filter's height. Nothing once bleached.
  function dimBeyond(g, colors, L, F, beyond, open) {
    var strength = FILTER_SHADE * (1 - open);
    if (!(strength > 0)) return;
    var from = beyond ? F.x + F.w : L.backMirror.x + L.backMirror.w;
    var to = beyond ? L.outputMirror.x : F.x;
    g.globalAlpha = strength;
    g.fillStyle = colors.bg;
    g.fillRect(from, F.y, to - from, F.h);
    g.globalAlpha = 1;
  }

  // The medium's look from materials.js (stage 10c), or null: the
  // two-level atom, or a light without a medium, is drawn in the theme's
  // colours as before.
  function lookOf(light) {
    if (!light || typeof light.medium !== "string") return null;
    if (!Object.prototype.hasOwnProperty.call(UI.materials.MEDIA, light.medium)) return null;
    return UI.materials.MEDIA[light.medium];
  }

  // The beam's colour: its wavelength's (materials.js), made readable on
  // the theme's background; an infrared beam's false colour; the theme's
  // accent for a medium with no look or no wavelength.
  function rayColourOf(light, colors) {
    if (!lookOf(light) || !(light.lam > 0)) return colors.accent2;
    return UI.materials.readable(UI.materials.beam(light.lam).color, colors.bg);
  }

  // The pump's own wavelength: a diode's or a pump laser's light (a
  // flashlamp's pumpLam is the band its rod absorbs, not its light), or
  // null.
  function ownPumpLam(light, kind) {
    if ((kind === "diode" || kind === "laser") && light && light.pumpLam > 0) return light.pumpLam;
    return null;
  }

  // The pump's light (stage 10c2): a diode's or a pump laser's colour from
  // its wavelength, or materials' pump false colour when it cannot be seen
  // (unlike the laser's, so 808 nm and 1064 nm stay apart); the flash's
  // colour, readable on the bench with or without a medium; the others
  // made readable over a medium of their own, the theme's glow without one.
  function pumpColourOf(light, colors, kind, look) {
    if (kind === "flashlamp") return UI.materials.readable(colors.flash, colors.bg);
    if (!look) return colors.glow;
    var lam = ownPumpLam(light, kind);
    if (lam === null) return colors.glow;
    var pumpBeam = UI.materials.beam(lam);
    var raw = pumpBeam.visible ? pumpBeam.color : UI.materials.PUMP_INFRARED;
    return UI.materials.readable(raw, colors.bg);
  }

  // The words under the bench for the light the eye cannot see, the
  // pump's (a diode's or a pump laser's) and the laser's: "808 nm,
  // 1.06 µm · infrared, invisible"; "" when there is none.
  function invisibleNote(labels, light, look, kind) {
    if (!look) return "";
    var seen = { infrared: [], ultraviolet: [] };
    var lams = [];
    // The pump's first: its photons are the more energetic (the engine
    // refuses a pump wavelength at or past the laser's).
    var pumpLam = ownPumpLam(light, kind);
    if (pumpLam !== null) lams.push(pumpLam);
    if (light.lam > 0) lams.push(light.lam);
    lams.forEach(function (lam) {
      var band = UI.materials.beam(lam).band;
      if (band !== "visible") seen[band].push(UI.format.si(lam, "m"));
    });
    var parts = [];
    ["ultraviolet", "infrared"].forEach(function (band) {
      if (seen[band].length > 0 && labels[band]) parts.push(seen[band].join(", ") + " · " + labels[band]);
    });
    return parts.join("; ");
  }

  // A crystal rod (stage 10c): its material's colour, darker along its
  // bottom, a highlight along its top where it reflects the room, and a
  // polished end face (an ellipse) at each end; its edge readable on the
  // theme's background.
  function drawCrystal(g, colors, L, body) {
    var R = L.rod;
    g.globalAlpha = 0.5;
    g.fillStyle = body;
    g.fillRect(R.x, R.y, R.w, R.h);
    g.globalAlpha = 0.2;
    g.fillStyle = UI.materials.SHADE;
    g.fillRect(R.x, R.y + 0.7 * R.h, R.w, 0.3 * R.h);
    g.globalAlpha = 0.35;
    g.fillStyle = UI.materials.HIGHLIGHT;
    g.fillRect(R.x + 0.03 * R.w, R.y + 0.14 * R.h, 0.94 * R.w, 0.12 * R.h);
    g.globalAlpha = 1;
    var edge = UI.materials.readable(body, colors.bg);
    g.strokeStyle = edge;
    g.lineWidth = 1.5;
    g.strokeRect(R.x, R.y, R.w, R.h);
    [R.x, R.x + R.w].forEach(function (x) {
      g.beginPath();
      g.ellipse(x, R.y + R.h / 2, 0.12 * R.h, R.h / 2, 0, 0, 2 * Math.PI);
      g.globalAlpha = 0.5;
      g.fillStyle = body;
      g.fill();
      g.globalAlpha = 1;
      g.stroke();
    });
  }

  // A dye cell (stage 10c): glass walls round the orange liquid, inside
  // the rod's outline (outside it, the top wall ran into the medium's
  // name), with a pipe in and a pipe out under it (the dye flows, so it
  // does not wear out).
  function drawCell(g, colors, L, body) {
    var R = L.rod;
    var wall = Math.max(3, 0.08 * R.h);
    var glass = UI.materials.readable(UI.materials.GLASS, colors.bg);
    g.globalAlpha = 0.25;
    g.fillStyle = UI.materials.GLASS;
    g.fillRect(R.x, R.y, R.w, R.h);
    g.globalAlpha = 0.6;
    g.fillStyle = body;
    g.fillRect(R.x + wall, R.y + wall, R.w - 2 * wall, R.h - 2 * wall);
    g.globalAlpha = 1;
    g.strokeStyle = glass;
    g.lineWidth = 1.5;
    g.strokeRect(R.x, R.y, R.w, R.h);
    L.cellPipes.forEach(function (x) {
      g.globalAlpha = 0.6;
      g.fillStyle = body;
      g.fillRect(x - wall, R.y + R.h, 2 * wall, L.cellPipe);
      g.globalAlpha = 1;
      g.strokeRect(x - wall, R.y + R.h, 2 * wall, L.cellPipe);
    });
  }

  // The rod of gain medium: a see-through fill with a solid edge.
  function drawRod(g, colors, L, look) {
    if (look && look.look === "rod") {
      drawCrystal(g, colors, L, look.body);
      return;
    }
    if (look && look.look === "liquid") {
      drawCell(g, colors, L, look.body);
      return;
    }
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
  // With a look (stage 10c) the glass is glass and the gas glows in its
  // own colour (He-Ne salmon, Ar⁺ blue-violet, CO₂ pink-violet).
  function drawTube(g, colors, L, pump, look) {
    var T = L.tube;
    var B = L.bore;
    var glass = look ? UI.materials.GLASS : colors.accent;
    g.globalAlpha = look ? 0.18 : 0.12;
    g.fillStyle = glass;
    g.fillRect(T.x, T.y, T.w, T.h);
    if (pump > 0) {
      g.globalAlpha = 0.15 + 0.6 * pump;
      g.fillStyle = look ? look.body : colors.glow;
      g.fillRect(B.x, B.y, B.w, B.h);
    }
    g.globalAlpha = 1;
    g.strokeStyle = look ? UI.materials.readable(UI.materials.GLASS, colors.bg) : colors.accent;
    g.lineWidth = 1.5;
    g.strokeRect(T.x, T.y, T.w, T.h);
  }

  /* ---------- the cavity's own numbers (stage 10b) ---------- */

  // The cavity the light carries, if it has a length and an aperture.
  function cavityOf(light) {
    var cavity = light ? light.cavity : null;
    if (!cavity || !(cavity.length > 0) || !(cavity.aperture > 0)) return null;
    return cavity;
  }

  // How deep a mirror's face is drawn, from the cavity's `curve` (0 for
  // the largest radius the slider allows, 1 for the smallest), or null
  // when the cavity does not give it.
  function depthOf(L, cavity, which) {
    if (!cavity || !cavity.curve) return null;
    var curve = cavity.curve[which];
    if (typeof curve !== "number" || !isFinite(curve)) return null;
    return L.sagMin + clamp(curve, 0, 1) * (L.sagMax - L.sagMin);
  }

  // A mirror's shape, if the cavity gives one this file knows.
  function shapeOf(cavity, which) {
    if (!cavity || !cavity.shapes) return undefined;
    var shape = cavity.shapes[which];
    return SHAPES.indexOf(shape) === -1 ? undefined : shape;
  }

  // From the cavity's metres to the picture's pixels. Along the axis the
  // cavity's length spans the faces' edges; across it the aperture is the
  // mirrors' half-height, so the widths are drawn `widths` times larger
  // than the lengths (written on the picture).
  function cavityScale(L, cavity, kind) {
    var half = kind === "discharge" ? L.boreHalf : L.apertureHalf;
    var perMetreX = (L.axis.x2 - L.axis.x1) / cavity.length;
    var perMetreY = half / cavity.aperture;
    return {
      x1: L.axis.x1, x2: L.axis.x2, perMetreX: perMetreX, perMetreY: perMetreY, widths: perMetreY / perMetreX,
      half: half, room: kind === "discharge" ? L.focusRoom.discharge : L.focusRoom.rod
    };
  }

  // Where a ray meets mirror 1 (back) or 2 (output) at height y (m): on
  // the mirror's face, or, past the aperture, beside the mirror's edge.
  function onMirror(L, S, shapes, mirrorNumber, y) {
    var Y = L.axis.y - y * S.perMetreY;
    var which = mirrorNumber === 1 ? "back" : "output";
    return { x: faceX(L, which, Y, shapes[which]), y: Y };
  }

  // The beam inside the cavity, shaded: the lowest mode's width along the
  // cavity (an hourglass), or, with no mode (two flat mirrors, unstable
  // mirrors), a band half as wide as the aperture. Never wider than the
  // mirrors.
  function drawBeamBand(g, rayColour, L, S, cavity, beam) {
    var top = [];
    var bottom = [];
    if (cavity.mode && cavity.mode.length > 1) {
      cavity.mode.forEach(function (point) {
        var x = S.x1 + point.z * S.perMetreX;
        var half = Math.min(point.w * S.perMetreY, S.half);
        top.push({ x: x, y: L.axis.y - half });
        bottom.push({ x: x, y: L.axis.y + half });
      });
    } else {
      var band = S.half / 2;
      top = [{ x: S.x1, y: L.axis.y - band }, { x: S.x2, y: L.axis.y - band }];
      bottom = [{ x: S.x1, y: L.axis.y + band }, { x: S.x2, y: L.axis.y + band }];
    }
    g.globalAlpha = 0.45 * rayAlpha(beam);
    g.fillStyle = rayColour;
    g.beginPath();
    g.moveTo(top[0].x, top[0].y);
    for (var i = 1; i < top.length; i++) g.lineTo(top[i].x, top[i].y);
    for (var k = bottom.length - 1; k >= 0; k--) g.lineTo(bottom[k].x, bottom[k].y);
    g.closePath();
    g.fill();
    g.globalAlpha = 1;
  }

  // The traced rays (`cavity.rays`: { y0, hits, escaped }, the engine's
  // ray trace from mirror 1): straight pieces from mirror to mirror (bent
  // at the cavity's middle when a hit has `middle`: the thermal lens),
  // fainter on each round trip. A ray that walks out goes on past the
  // mirror's edge, still straight, for a short run (ESCAPE_RUN of the
  // picture's width, less at the picture's edge), so it does not cross
  // the whole drawing and its words. They show
  // the path light would take, so they are drawn faintly with the laser
  // dark, and strongly with it shining.
  function drawPaths(g, rayColour, casing, L, S, shapes, cavity, beam, w, h) {
    if (!cavity.rays) return;
    // Only inside a band a quarter of a mirror taller than the mirrors at
    // each side: the widths are drawn many times wider than they are, so
    // a ray that walks out would otherwise run steeply across the whole
    // picture and its words.
    var mirror = L.backMirror;
    var bandTop = Math.max(0, mirror.y - PATH_BAND * mirror.h);
    var bandBottom = Math.min(h, mirror.y + (1 + PATH_BAND) * mirror.h);
    g.save();
    g.beginPath();
    g.rect(0, bandTop, w, bandBottom - bandTop);
    g.clip();
    var strength = PATH_ALPHA + (1 - PATH_ALPHA) * rayAlpha(beam);
    g.strokeStyle = rayColour;
    g.lineWidth = 1.2;
    cavity.rays.forEach(function (ray) {
      if (!ray || !ray.hits || ray.hits.length === 0) return;
      var from = onMirror(L, S, shapes, 1, ray.y0);
      var fade = strength;
      ray.hits.forEach(function (hit, k) {
        var to = onMirror(L, S, shapes, hit.mirror, hit.y);
        fade = strength * Math.pow(RAY_FADE, Math.floor(k / 2));
        // Through the rod's thermal lens (stage 13c): bent at the cavity's
        // middle, where the hit says it crossed.
        if (typeof hit.middle === "number") {
          var middle = { x: S.x1 + (cavity.length / 2) * S.perMetreX, y: L.axis.y - hit.middle * S.perMetreY };
          casedLine(g, from.x, from.y, middle.x, middle.y, rayColour, casing, fade, 1.2);
          from = middle;
        }
        casedLine(g, from.x, from.y, to.x, to.y, rayColour, casing, fade, 1.2);
        from = to;
      });
      if (ray.escaped) {
        var last = ray.hits[ray.hits.length - 1];
        // It goes on the way it travelled: right past mirror 2, left past
        // mirror 1, its height changing by θ per metre travelled.
        var direction = last.mirror === 2 ? 1 : -1;
        var drop = -last.theta * S.perMetreY / S.perMetreX;     // screen y per pixel travelled
        var room = Math.min(ESCAPE_RUN * w, direction > 0 ? w - from.x : from.x);
        if (drop < 0) room = Math.min(room, from.y / -drop);
        if (drop > 0) room = Math.min(room, (h - from.y) / drop);
        casedLine(g, from.x, from.y, from.x + direction * room, from.y + drop * room, rayColour, casing, 0.6 * fade, 1.2);
      }
    });
    g.restore();
  }

  // The light that leaves through the output mirror: round(rays ×
  // transmission) of the rays across the beam at the output mirror (as
  // before stage 10b, so the transmission can be counted), straight on to
  // the edge.
  function drawOutput(g, rayColour, L, S, cavity, light, beam, w, colors) {
    var spot = S.half / 2;
    if (cavity.mode && cavity.mode.length > 0) {
      spot = Math.min(cavity.mode[cavity.mode.length - 1].w * S.perMetreY, S.half);
    }
    var half = clamp(Math.floor(spot / RAY_GAP), 0, (MAX_RAYS - 1) / 2);
    var count = 2 * half + 1;
    var heights = [];
    for (var i = -half; i <= half; i++) heights.push(half === 0 ? L.axis.y : L.axis.y + i * spot / half);
    var outLeft = L.outputMirror.x + L.outputMirror.w;
    var leaving = middleRays(count, raysOut(count, light.transmission));
    var doubler = doublerOf(light);
    g.lineWidth = 1.4;
    if (doubler === null) {
      g.globalAlpha = rayAlpha(beam);
      g.strokeStyle = rayColour;
      g.fillStyle = rayColour;
      leaving.forEach(function (index) {
        var y = heights[index];
        line(g, outLeft, y, w, y);
        arrowHead(g, w - 0.4 * L.pad, y, 1, 0, 6);
      });
      g.globalAlpha = 1;
      return;
    }
    // Through the doubling crystal (stage 13b): the laser's light up to
    // it; past it what is left of that light, and the green light it
    // made, each as strong as its own power.
    var crystal = L.doubler;
    var past = crystal.x + crystal.w;
    var green = greenColourOf(light, colors);
    var restAlpha = rayAlpha(beam * (1 - doubler.share));
    var greenAlpha = rayAlpha(doubler.green);
    leaving.forEach(function (index) {
      var y = heights[index];
      g.globalAlpha = rayAlpha(beam);
      g.strokeStyle = rayColour;
      line(g, outLeft, y, crystal.x, y);
      g.globalAlpha = restAlpha;
      line(g, past, y, w, y);
      g.globalAlpha = greenAlpha;
      g.strokeStyle = green;
      line(g, past, y, w, y);
      // The arrowhead in the stronger of the two lights.
      g.globalAlpha = Math.max(restAlpha, greenAlpha);
      g.fillStyle = greenAlpha > restAlpha ? green : rayColour;
      arrowHead(g, w - 0.4 * L.pad, y, 1, 0, 6);
    });
    g.globalAlpha = 1;
  }

  // The doubling crystal (light.doubler): { share (0 to 1), green (≥ 0) },
  // or null when there is no crystal in the beam.
  function doublerOf(light) {
    if (!light || !light.doubler) return null;
    var share = light.doubler.share;
    var green = light.doubler.green;
    if (!(share >= 0) || !(green >= 0)) return null;
    return { share: Math.min(1, share), green: green };
  }

  // The second harmonic's colour, λ/2 (532 nm for Nd:YAG: green), made
  // readable on the background like the laser's own.
  function greenColourOf(light, colors) {
    if (!(light && light.lam > 0)) return colors.accent;
    return UI.materials.readable(UI.materials.beam(light.lam / 2).color, colors.bg);
  }

  // The doubling crystal, as a real one looks: a water-clear KDP block
  // (faint, so the light through it shows) with the edges of its polished
  // faces, held by metal clamps at the
  // top and the bottom, on a small tilt stage with its knob (the crystal
  // is turned to the phase-matching angle), on a post.
  function drawDoubler(g, colors, L) {
    var M = UI.materials;
    var C = L.doubler;
    g.fillStyle = colors.faint;
    post(g, C.x + C.w / 2, C.y + C.h, L.railY);
    // the tilt stage under the crystal, with its knob
    var stageY = C.y + C.h + 2;
    var stageH = Math.max(3, 0.12 * C.h);
    g.fillStyle = colors.muted;
    g.fillRect(C.x - 2, stageY, C.w + 4, stageH);
    g.fillRect(C.x + C.w + 2, stageY + stageH / 2 - 1, 3, 2);
    g.fillRect(C.x + C.w + 5, stageY - 1, 3, stageH + 2);
    // the clamps
    g.fillRect(C.x - 2, C.y - 3, C.w + 4, 3);
    g.fillRect(C.x - 2, C.y + C.h, C.w + 4, 2);
    // the crystal, a little darker at the bottom
    g.globalAlpha = 0.3;
    g.fillStyle = M.KDP;
    g.fillRect(C.x, C.y, C.w, C.h);
    g.globalAlpha = 0.12;
    g.fillStyle = M.SHADE;
    g.fillRect(C.x, C.y + 0.75 * C.h, C.w, 0.25 * C.h);
    g.globalAlpha = 1;
    g.strokeStyle = M.readable(M.KDP, colors.bg);
    g.lineWidth = 1;
    g.strokeRect(C.x, C.y, C.w, C.h);
    // the edges of its polished faces, seen through the clear crystal (a
    // white glint vanished on the near-white bench: review)
    g.globalAlpha = 0.6;
    line(g, C.x + 0.18 * C.w, C.y, C.x + 0.18 * C.w, C.y + C.h);
    line(g, C.x + 0.82 * C.w, C.y, C.x + 0.82 * C.w, C.y + C.h);
    g.globalAlpha = 1;
  }

  // Each curved mirror's focal point F, R/2 from it along the axis
  // (`cavity.focus`: m, positive in front of the mirror, negative behind
  // it, null for a flat mirror): a dot on the axis, solid for a real focus,
  // hollow and dashed for a virtual one (a convex mirror's, behind it). One
  // off the picture is written at its edge, with its distance from the
  // mirror and an arrow: "F 2.50 m".
  function drawFocus(g, colors, L, S, cavity, word, view) {
    var w = view.w;
    var size = Math.max(9, L.fontSize - 2);
    g.font = "600 " + size + "px " + view.font;
    g.textBaseline = "alphabetic";
    ["back", "output"].forEach(function (which, index) {
      // F₁ for the back mirror, F₂ for the output mirror, as g₁ and g₂ on
      // the stability diagram.
      var name = word + FOCUS_MARKS[index];
      var f = cavity.focus ? cavity.focus[which] : null;
      if (typeof f !== "number" || !isFinite(f) || f === 0) return;
      var x = which === "back" ? S.x1 + f * S.perMetreX : S.x2 - f * S.perMetreX;
      var real = f > 0;
      g.fillStyle = colors.heading;
      g.strokeStyle = colors.heading;
      if (x >= L.pad && x <= w - L.pad) {
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(x, L.axis.y, 3.5, 0, 2 * Math.PI);
        if (real) {
          g.fill();
        } else {
          g.setLineDash([2, 2]);
          g.stroke();
          g.setLineDash([]);
        }
        if (word) {
          g.textAlign = "center";
          g.fillText(name, x, L.axis.y - 7, 3 * size);
        }
        return;
      }
      // Off the picture: an arrowhead in the margin at the edge it lies
      // beyond, solid for a real F and hollow for a virtual one, and the
      // words just inside the mirror on that side.
      var right = x > w - L.pad;
      var rowY = L.focusRows[index];
      var text = (word ? name + " " : "") + UI.format.si(Math.abs(f), "m");
      var tip = right ? w - 2 : 2;
      var dx = right ? 1 : -1;
      if (real) {
        arrowHead(g, tip, rowY - 0.35 * size, dx, 0, 5);
      } else {
        g.lineWidth = 1;
        hollowArrowHead(g, tip, rowY - 0.35 * size, dx, 5);
      }
      g.textAlign = right ? "right" : "left";
      var gap = FOCUS_GAP + L.sagMax;
      g.fillText(text, right ? S.x2 - gap : S.x1 + gap, rowY, Math.max(10, S.room - L.sagMax));
    });
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
    var cavity = cavityOf(light);
    var shapes = { back: shapeOf(cavity, "back"), output: shapeOf(cavity, "output") };
    L.depth = { back: depthOf(L, cavity, "back"), output: depthOf(L, cavity, "output") };
    var look = lookOf(light);
    // Screen time, for the flash's streaks, the photons and the atoms:
    // still (as at t = 0) for a visitor who asked for less motion.
    var screenTime = view.still || typeof view.t !== "number" || !isFinite(view.t) ? 0 : view.t;
    var pumpColour = pumpColourOf(light, colors, kind, look);
    // The filter: in the gap before the rod, or, on the end-pumped diodes,
    // beyond it, out of the pump's way (stage 10c2).
    var filterBeyond = qSwitch !== null && (kind === "diode" || kind === "laser");
    var filterRect = filterBeyond ? L.filterBeyond : L.filter;

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
    if (qSwitch) post(g, filterRect.x + filterRect.w / 2, filterRect.y + filterRect.h, L.railY);
    var mediumPosts = kind === "discharge" ? L.tubePosts : L.rodPosts;
    mediumPosts.forEach(function (x) {
      post(g, x, rodBottom, L.railY);
    });

    // The pump, then the medium over it.
    if (kind === "flashlamp") drawFlashlamp(g, colors, L, pump, screenTime);
    else if (kind === "discharge") drawDischarge(g, colors, L, pump);
    else if (kind === "laser") drawPumpLaser(g, colors, L, pump, pumpColour);
    else drawDiodes(g, colors, L);
    if (kind === "discharge") drawTube(g, colors, L, pump, look);
    else drawRod(g, colors, L, look);
    // The diodes' cone (stage 10c2), under the laser's rays; the photons
    // and the gas's atoms come after the rays, over them.
    var endPumped = kind === "diode" || kind === "laser";
    if (endPumped && pump > 0) drawCone(g, L, pumpColour, pump);
    if (kind === "flashlamp" && pump > 0) lightRod(g, colors, L, pump);

    // The light. With the cavity's numbers: the beam's shape, the traced
    // rays, and the light leaving. Without them: separate rays between the
    // mirrors, some of them leaving.
    var S = cavity ? cavityScale(L, cavity, kind) : null;
    var rayColour = rayColourOf(light, colors);
    // A coloured beam runs over a medium of its own hue: a thin casing in
    // the background's colour keeps it apart (stage 10c1 review).
    var casing = look ? colors.bg : null;
    if (cavity) {
      if (beam > 0) drawBeamBand(g, rayColour, L, S, cavity, beam);
      drawPaths(g, rayColour, casing, L, S, shapes, cavity, beam, view.w, view.h);
      if (beam > 0) drawOutput(g, rayColour, L, S, cavity, light, beam, view.w, colors);
    } else if (beam > 0) {
      var count = L.rays.length;
      var leaving = middleRays(count, raysOut(count, light.transmission));
      var outLeft = L.outputMirror.x + L.outputMirror.w;
      // The arrowheads go in the open gaps between the mirrors and the
      // medium: the rod, or a discharge's gas tube.
      var medium = kind === "discharge" ? L.tube : L.rod;
      // Between the filter (if any, on its side) and the medium.
      var leftFrom = qSwitch && !filterBeyond ? L.filter.x + L.filter.w : faceX(L, "back", L.axis.y);
      var rightTo = filterBeyond ? L.filterBeyond.x : faceX(L, "output", L.axis.y);
      var leftGap = (leftFrom + medium.x) / 2;
      var rightGap = (medium.x + medium.w + rightTo) / 2;
      g.fillStyle = rayColour;
      L.rays.forEach(function (y, i) {
        casedLine(g, faceX(L, "back", y), y, faceX(L, "output", y), y, rayColour, casing, rayAlpha(beam), 1.4);
        // The light goes both ways: right on every second ray, left on the others.
        if (i % 2 === 0) arrowHead(g, rightGap + 4, y, 1, 0, 6);
        else arrowHead(g, leftGap - 4, y, -1, 0, 6);
      });
      leaving.forEach(function (i) {
        var y = L.rays[i];
        casedLine(g, outLeft, y, view.w, y, rayColour, casing, rayAlpha(beam), 1.4);
        arrowHead(g, view.w - 0.4 * L.pad, y, 1, 0, 6);
      });
      g.globalAlpha = 1;
    }

    // The filter (stage 8b), over the rays that cross it; a dark filter
    // holds the light back, so beyond it the light is dimmed as much as
    // the plate is shaded (the owner: the laser went through it "like
    // nothing is there").
    if (qSwitch) {
      var open = openOf(qSwitch);
      dimBeyond(g, colors, L, filterRect, filterBeyond, open);
      drawFilter(g, colors, filterRect, open, qSwitch.absorber);
    }

    // The pump's photons, or the gas's atoms, over the rays, each on a
    // ring so it shows over a beam or a glow of its own hue. A spark is
    // white over a coloured medium, on a ring of the background's colour,
    // or of the heading's where white would vanish on it (the cream theme).
    var spark = look ? UI.materials.HIGHLIGHT : colors.heading;
    var sparkRing = UI.materials.contrast(spark, colors.bg) >= 3 ? colors.bg : colors.heading;
    if (kind === "discharge") {
      drawGasAtoms(g, L, colors.muted, spark, colors.bg, sparkRing, pump, screenTime);
    } else if (pump > 0) {
      drawPhotons(g, L, kind, pumpColour, spark, colors.bg, sparkRing, pump, screenTime);
    }

    // The mirrors, over the ends of the rays.
    mirror(g, colors, L, "back", true, shapes.back);
    mirror(g, colors, L, "output", false, shapes.output);
    if (cavity) drawFocus(g, colors, L, S, cavity, labels.focus, view);

    // The doubling crystal (stage 13b) over the light it turns green:
    // only with the cavity's numbers, the drawing that sends the leaving
    // light through it (drawOutput).
    if (cavity && doublerOf(light) !== null) drawDoubler(g, colors, L);

    // The names of the parts. fillText's fourth argument squeezes a word
    // that is too long for its place instead of letting it run into the
    // next one (a long Armenian word on a phone).
    g.fillStyle = colors.muted;
    g.font = "600 " + L.fontSize + "px " + view.font;
    g.textBaseline = "alphabetic";
    // The filter's name on the top row, which the transmission then
    // shares; a filter beyond the rod has its name under the bench.
    var switchName = qSwitch && labels.qSwitch ? labels.qSwitch : "";
    PARTS.forEach(function (name) {
      if (OWN_PLACE_WORDS.indexOf(name) !== -1) return;
      var text = name === "transmission" ? transmissionText(labels.transmission, light) : labels[name];
      var spot = L.labels[name];
      if (name === "qSwitch") text = switchName;
      if (name === "qSwitch" && filterBeyond) spot = L.labels.qSwitchBelow;
      if (name === "transmission" && switchName && !filterBeyond) spot = L.labels.transmissionShared;
      if (!text) return;
      g.textAlign = spot.align;
      g.fillText(text, spot.x, spot.y, spot.maxWidth);
    });
    // "Widths × 90": how much wider than the lengths the widths are drawn.
    if (cavity && labels.widths) {
      var spot = L.labels.widths;
      g.textAlign = spot.align;
      g.fillText(labels.widths + " " + String(Number(S.widths.toPrecision(2))), spot.x, spot.y, spot.maxWidth);
    }
    // An invisible beam says so, with its wavelength (§11.5: otherwise the
    // visitor thinks the laser does not work).
    var note = invisibleNote(labels, light, look, kind);
    if (note) {
      var where = L.labels.invisible;
      g.textAlign = where.align;
      g.fillText(note, where.x, where.y, where.maxWidth);
    }

    g.restore();
  }

  UI.bench = Object.freeze({
    SIZE: SIZE,
    PARTS: PARTS,
    KINDS: KINDS,
    Q_KINDS: Q_KINDS,
    PUMP_OFF: PUMP_OFF,
    POST_FOOT: POST_FOOT,
    PUMP_PHOTONS: PUMP_PHOTONS,
    GAS_ATOMS: GAS_ATOMS,
    PUMP_DEPTH: PUMP_DEPTH,
    SHAPES: SHAPES,
    layout: layout,
    mountHole: mountHole,
    faceX: faceX,
    raysOut: raysOut,
    rayAlpha: rayAlpha,
    draw: draw
  });
})(this);
