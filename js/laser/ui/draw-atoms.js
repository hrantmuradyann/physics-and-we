/* ============================================================================
   draw-atoms.js — inside one atom: the energy levels of the chosen gain
   medium, and a few atoms moving between them (docs/laser-physics.md §2,
   §5).

   THIS IS AN ILLUSTRATION, NOT THE SIMULATION. The numbers on the page come
   from js/laser/engine/; this picture acts them out with a row of atoms,
   as draw-photons.js does inside the medium. What it shows is true in kind:
     · each medium has its own scheme (SCHEMES): ruby three levels, with
       broad pump bands; neodymium four; helium-neon and CO₂ four, pumped
       through a partner gas (He, N₂) that hands its energy over in a
       collision; the argon ion four, pumped by electron impacts; dye and
       Ti:sapphire four, with broad bands of vibrational sublevels; the
       two-level atom two;
     · the pump lifts an atom from the ground level to the pump band (or,
       through the partner, straight to the upper laser level); from the
       band it drops fast to the upper laser level, the rest of its energy
       going into heat;
     · a step down from the upper laser level, with laser light around,
       sends out a laser photon in the beam's colour; with no light, the
       atom emits by itself, in any direction;
     · four levels: the lower laser level empties at once (heat);
       three levels: the laser step ends on the ground level itself;
       two levels: the pump light knocks atoms down as often as it lifts
       them.
   What is not to scale: the heights of the levels, and the 8 atoms.

     var model = LaserUI.atoms.create({ random });
         random       a function like Math.random (the tests pass their own)
     model.use(medium)     the medium whose levels are shown (an engine id);
                           a new medium puts every atom on the ground level
     model.step(dt, drive)  moves the picture on by dt seconds of screen
                           time. drive = { medium, excited, light, pump }:
                             medium   as for use()
                             excited  the share of atoms to keep on the
                                      upper laser level, 0 to 1
                             light    how strong the laser light is, 0 to 1
                             pump     how hard the pump works, 0 to 1
     model.scheme      the medium's scheme from SCHEMES, or null
     model.atoms       [{ col, level, legs, t }]: level is where it rests
                       (or starts its move from); legs the moves still to
                       make, [{ from, to, kind }]; t how far along the first
     model.photons     [{ x, y, dx, dy, kind, fresh }]: x across the levels
                       (0 to 1), y in the levels' heights (0 to 1); kind
                       "laser", "stray" or "push" (two levels: knocked down
                       by the pump's light)
     model.tally       { pumped, laser, stray, push, heat }

     LaserUI.atoms.draw(view, model, words, picture)
         words    WORDS: the title, each scheme's name and note, the
                  levels' roles and the arrows' names; a missing word is
                  left out
         picture  { name, medium, lam, pumpLam, pumpKind, light, pump }:
                  the medium's name for the title, the laser's and the
                  pump's wavelengths (m), the pump's kind (bench's KINDS),
                  and how strong the light and the pump are now (0 to 1:
                  the arrows of the pump and of the laser step glow with
                  them); the colours of the light are LaserUI.materials',
                  for a medium that has a look there, else the theme's
     LaserUI.atoms.layout(w, h, partner)
     LaserUI.atoms.SIZE, WORDS, SCHEMES, ATOMS, LIMITS

   Tests: tests/laser/draw-atoms.test.js
   ========================================================================== */
(function (root) {
  "use strict";

  var UI = root.LaserUI = root.LaserUI || {};

  var SIZE = Object.freeze({ aspect: 1.5, minHeight: 260, maxHeight: 360 });
  var WORDS = Object.freeze(["title", "two", "three", "four", "ground", "lower", "upper", "band",
    "pump", "electrons", "heat", "transfer", "noteTwo", "noteThree", "noteFour"]);

  var ATOMS = 8;             // atoms in the row
  var LIFT = 6;              // atoms the pump lifts a second, at most
  var DROP = 6;              // atoms that step down a second when there are too many up
  var CYCLE = 2.5;           // laser steps a second at full light, even when the share holds
  var SELF = 0.05;           // how often a second a resting atom up emits by itself
  var SPEED = 0.45;          // a photon crosses the levels in about 2 s
  var FRESH = 0.45;          // s a new photon stays marked
  // How long each kind of move takes (s of screen time).
  var DURATION = Object.freeze({ pump: 0.5, transfer: 0.5, heat: 0.3, laser: 0.4, stray: 0.4, push: 0.4 });
  var LIMITS = Object.freeze({
    lift: LIFT, drop: DROP, cycle: CYCLE, self: SELF, speed: SPEED, fresh: FRESH, duration: DURATION
  });
  var NB = " ";

  // Each medium's levels: y is the height in the picture (0 = ground,
  // 1 = the top; not to scale), term its spectroscopic name. `band` is a
  // broad pump band; `bands` pairs of levels with a band of vibrational
  // sublevels between them; `partner` the gas that is pumped and hands its
  // energy over in a collision.
  function freezeAll(object) {
    Object.keys(object).forEach(function (key) {
      if (object[key] && typeof object[key] === "object") freezeAll(object[key]);
    });
    return Object.freeze(object);
  }
  // Nd³⁺ is the same atom in glass and in YAG.
  function neodymium() {
    return {
      kind: "four",
      levels: {
        ground: { y: 0, term: "⁴I₉/₂" },
        lower: { y: 0.22, term: "⁴I₁₁/₂" },
        upper: { y: 0.68, term: "⁴F₃/₂" },
        band: { y: 0.88, term: "⁴F₅/₂", wide: true }
      }
    };
  }
  var SCHEMES = freezeAll({
    "ruby": {
      kind: "three",
      levels: {
        ground: { y: 0, term: "⁴A₂" },
        upper: { y: 0.6, term: "²E" },
        band: { y: 0.86, term: "⁴F₂", wide: true }
      }
    },
    "nd-glass": neodymium(),
    "nd-yag": neodymium(),
    "he-ne": {
      kind: "four",
      levels: {
        ground: { y: 0, term: "2p⁶" },
        lower: { y: 0.5, term: "2p₄" },
        upper: { y: 0.84, term: "3s₂" }
      },
      partner: { name: "He", term: "2¹S" }
    },
    "ar-ion": {
      kind: "four",
      levels: {
        ground: { y: 0, term: "Ar⁺" },
        lower: { y: 0.42, term: "4s" },
        upper: { y: 0.72, term: "4p" },
        band: { y: 0.9, term: "", wide: true }
      }
    },
    "co2": {
      kind: "four",
      levels: {
        ground: { y: 0, term: "00⁰0" },
        lower: { y: 0.4, term: "10⁰0" },
        upper: { y: 0.8, term: "00⁰1" }
      },
      partner: { name: "N₂", term: "v = 1" }
    },
    "dye-r6g": {
      kind: "four",
      levels: {
        ground: { y: 0, term: "S₀" },
        lower: { y: 0.24, term: "" },
        upper: { y: 0.62, term: "S₁" },
        band: { y: 0.88, term: "" }
      },
      bands: [["ground", "lower"], ["upper", "band"]]
    },
    "ti-sapphire": {
      kind: "four",
      levels: {
        ground: { y: 0, term: "²T₂" },
        lower: { y: 0.24, term: "" },
        upper: { y: 0.62, term: "²E" },
        band: { y: 0.88, term: "" }
      },
      bands: [["ground", "lower"], ["upper", "band"]]
    },
    "two-level": {
      kind: "two",
      levels: {
        ground: { y: 0, term: "E₁" },
        upper: { y: 0.7, term: "E₂" }
      }
    }
  });

  function clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
  }

  function fail(where, message) {
    throw new Error("LaserUI.atoms." + where + ": " + message);
  }

  // A drive value as a number from 0 to 1.
  function share(where, name, value) {
    if (typeof value !== "number" || isNaN(value)) {
      fail(where, "drive." + name + " must be a number from 0 to 1, got " + value + ".");
    }
    return clamp(value, 0, 1);
  }

  function schemeOf(medium) {
    if (typeof medium !== "string" || !Object.prototype.hasOwnProperty.call(SCHEMES, medium)) return null;
    return SCHEMES[medium];
  }

  /* ---------- the moves ---------- */

  // The moves of the pump: up to the band, then down to the upper laser
  // level as heat; through a partner gas straight up; two levels straight up.
  function pumpLegs(scheme) {
    if (scheme.partner) return [{ from: "ground", to: "upper", kind: "transfer" }];
    if (scheme.levels.band) {
      return [{ from: "ground", to: "band", kind: "pump" }, { from: "band", to: "upper", kind: "heat" }];
    }
    return [{ from: "ground", to: "upper", kind: "pump" }];
  }

  // The moves of a step down from the upper laser level, of a kind
  // ("laser", "stray" or "push"); four levels then empty the lower level.
  function downLegs(scheme, kind) {
    if (scheme.kind === "four") {
      return [{ from: "upper", to: "lower", kind: kind }, { from: "lower", to: "ground", kind: "heat" }];
    }
    return [{ from: "upper", to: "ground", kind: kind }];
  }

  /* ---------- the model ---------- */

  function create(options) {
    if (!options || typeof options.random !== "function") fail("create", "random must be a function like Math.random.");
    var random = options.random;
    var atoms = [];
    for (var col = 0; col < ATOMS; col++) atoms.push({ col: col, level: "ground", legs: [], t: 0 });
    var photons = [];
    var tally = { pumped: 0, laser: 0, stray: 0, push: 0, heat: 0 };
    var credit = { lift: 0, drop: 0, cycle: 0 };
    var model = { scheme: null, medium: null, atoms: atoms, photons: photons, tally: tally };

    function use(medium) {
      if (medium === model.medium) return;
      model.medium = medium;
      model.scheme = schemeOf(medium);
      atoms.forEach(function (atom) {
        atom.level = "ground";
        atom.legs = [];
        atom.t = 0;
      });
      photons.length = 0;
      credit.lift = 0;
      credit.drop = 0;
      credit.cycle = 0;
    }

    function pick(list) {
      return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
    }

    // Where an atom will be once its moves are made.
    function bound(atom) {
      return atom.legs.length ? atom.legs[atom.legs.length - 1].to : atom.level;
    }
    function resting(level) {
      return atoms.filter(function (atom) { return atom.legs.length === 0 && atom.level === level; });
    }
    function upCount() {
      return atoms.filter(function (atom) { return bound(atom) === "upper"; }).length;
    }

    // The photon a step down sends out, from the atom's place on the upper
    // laser level: along the axis (to the right) for the laser light and
    // the pump's push, anywhere for one emitted by itself.
    function emit(atom, kind) {
      var x = (atom.col + 0.5) / ATOMS;
      var y = model.scheme.levels.upper.y;
      if (kind === "stray") {
        var angle = 2 * Math.PI * random();
        photons.push({ x: x, y: y, dx: Math.cos(angle), dy: Math.sin(angle), kind: kind, fresh: 1 });
      } else {
        photons.push({ x: x, y: y, dx: 1, dy: 0, kind: kind, fresh: 1 });
      }
    }

    function start(atom, legs) {
      atom.legs = legs;
      atom.t = 0;
      begin(atom);
    }
    // A move starts: a step down sends its photon now.
    function begin(atom) {
      var leg = atom.legs[0];
      if (!leg) return;
      if (leg.kind === "laser" || leg.kind === "stray" || leg.kind === "push") {
        emit(atom, leg.kind);
        tally[leg.kind] += 1;
      } else if (leg.kind === "heat") {
        tally.heat += 1;
      } else {
        tally.pumped += 1;
      }
    }

    function moveAtoms(dt) {
      atoms.forEach(function (atom) {
        var left = dt;
        while (atom.legs.length && left > 0) {
          var leg = atom.legs[0];
          var need = (1 - atom.t) * DURATION[leg.kind];
          if (left < need) {
            atom.t += left / DURATION[leg.kind];
            left = 0;
          } else {
            left -= need;
            atom.level = leg.to;
            atom.legs.shift();
            atom.t = 0;
            begin(atom);
          }
        }
      });
    }

    function movePhotons(dt) {
      photons.forEach(function (photon) {
        photon.x += photon.dx * SPEED * dt;
        photon.y += photon.dy * SPEED * dt;
        photon.fresh = Math.max(0, photon.fresh - dt / FRESH);
      });
      for (var i = photons.length - 1; i >= 0; i--) {
        var p = photons[i];
        if (p.x < 0 || p.x > 1 || p.y < -0.05 || p.y > 1.05) photons.splice(i, 1);
      }
    }

    function step(dt, drive) {
      var at = "step";
      if (typeof dt !== "number" || !isFinite(dt) || dt < 0) fail(at, "dt must be a number of seconds, 0 or more, got " + dt + ".");
      if (!drive || typeof drive !== "object") fail(at, "drive must be { medium, excited, light, pump }.");
      var excited = share(at, "excited", drive.excited);
      var light = share(at, "light", drive.light);
      var pump = share(at, "pump", drive.pump);
      use(drive.medium);
      var scheme = model.scheme;
      if (dt === 0 || scheme === null) return;

      moveAtoms(dt);
      movePhotons(dt);

      // Two levels: the pump's own light knocks atoms down; the others:
      // the laser light.
      var two = scheme.kind === "two";
      var down = two ? pump : light;
      var downKind = down > 0.02 ? (two ? "push" : "laser") : "stray";
      var target = Math.round(excited * ATOMS);
      var up = upCount();

      if (up < target) {
        credit.lift = Math.min(3, credit.lift + LIFT * (0.2 + 0.8 * pump) * dt);
        while (credit.lift >= 1 && up < target) {
          var low = resting("ground");
          if (!low.length) break;
          start(pick(low), pumpLegs(scheme));
          up += 1;
          credit.lift -= 1;
        }
      } else if (up > target) {
        credit.drop = Math.min(3, credit.drop + DROP * dt);
        while (credit.drop >= 1 && up > target) {
          var high = resting("upper");
          if (!high.length) break;
          start(pick(high), downLegs(scheme, downKind));
          up -= 1;
          credit.drop -= 1;
        }
      } else {
        credit.lift = Math.min(credit.lift, 1);
        credit.drop = Math.min(credit.drop, 1);
      }

      // With light (two levels: with the pump on), atoms keep stepping down
      // and the pump keeps lifting them again, even while the share holds.
      if (down > 0.02 && pump > 0.02) {
        credit.cycle = Math.min(2, credit.cycle + CYCLE * down * dt);
        while (credit.cycle >= 1) {
          credit.cycle -= 1;
          var ready = resting("upper");
          if (ready.length) start(pick(ready), downLegs(scheme, downKind));
        }
      }

      // Now and then an atom up emits by itself.
      resting("upper").forEach(function (atom) {
        if (random() < SELF * dt) start(atom, downLegs(scheme, "stray"));
      });
    }

    model.use = use;
    model.step = step;
    return model;
  }

  /* ---------- the picture ---------- */

  function layout(w, h, partner) {
    var pad = 10;
    var fontSize = clamp(Math.round(0.045 * h), 11, 14);
    var titleY = pad + fontSize;
    var noteY = h - pad - 0.2 * fontSize;
    var top = titleY + 1.8 * fontSize;
    var bottom = noteY - 2.2 * fontSize;
    var partnerWidth = partner ? clamp(0.13 * w, 40, 90) : 0;
    var termWidth = clamp(3.6 * fontSize, 40, 60);
    var roleWidth = clamp(0.27 * w, 70, 210);
    var left = pad + partnerWidth + termWidth;
    var right = w - pad - roleWidth;
    var span = right - left;
    return {
      pad: pad,
      fontSize: fontSize,
      titleY: titleY,
      noteY: noteY,
      top: top,
      bottom: bottom,
      partner: partner ? { left: pad, right: pad + partnerWidth, x: pad + partnerWidth / 2 } : null,
      left: left,
      right: right,
      pumpX: left + 0.06 * span,
      heatX: left + 0.12 * span,
      colsLeft: left + 0.18 * span,
      colsRight: left + 0.78 * span,
      laserX: left + 0.86 * span,
      dropX: left + 0.93 * span,
      roleX: right + 8,
      roleWidth: roleWidth - 8 - 2,
      bandHalf: 0.045 * (bottom - top)
    };
  }

  // The middle of the widest gap between the levels below `top` (a height
  // from 0 to 1): where a word beside the pump's arrow meets no level's name.
  function freeGap(levels, top) {
    var heights = Object.keys(levels).map(function (id) { return levels[id].y; })
      .filter(function (y) { return y <= top; })
      .sort(function (a, b) { return a - b; });
    var best = { size: -1, middle: top / 2 };
    for (var i = 1; i < heights.length; i++) {
      var size = heights[i] - heights[i - 1];
      if (size > best.size) best = { size: size, middle: (heights[i] + heights[i - 1]) / 2 };
    }
    return best.middle;
  }

  function levelY(L, y) {
    return L.bottom - y * (L.bottom - L.top);
  }

  function colX(L, col) {
    return L.colsLeft + (col + 0.5) / ATOMS * (L.colsRight - L.colsLeft);
  }

  function atomRadius(L) {
    return clamp(0.28 * (L.colsRight - L.colsLeft) / ATOMS, 3, 7);
  }

  function line(g, x1, y1, x2, y2) {
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  }

  // An arrow from (x, y1) straight up or down to (x, y2).
  function arrow(g, x, y1, y2, head) {
    var dir = y2 > y1 ? 1 : -1;
    line(g, x, y1, x, y2 - dir * head);
    g.beginPath();
    g.moveTo(x, y2);
    g.lineTo(x - 0.6 * head, y2 - dir * head);
    g.lineTo(x + 0.6 * head, y2 - dir * head);
    g.closePath();
    g.fill();
  }

  // A wavy arrow (energy going into heat) from (x, y1) down to (x, y2).
  function wavyArrow(g, x, y1, y2, head) {
    var length = y2 - y1 - head;
    var steps = 16;
    g.beginPath();
    for (var k = 0; k <= steps; k++) {
      var along = y1 + k / steps * length;
      var across = 3 * Math.sin(k / steps * 4 * Math.PI);
      if (k === 0) g.moveTo(x + across, along);
      else g.lineTo(x + across, along);
    }
    g.stroke();
    g.beginPath();
    g.moveTo(x, y2);
    g.lineTo(x - 0.6 * head, y2 - head);
    g.lineTo(x + 0.6 * head, y2 - head);
    g.closePath();
    g.fill();
  }

  // A photon: a short wave with an arrowhead, flying along (dx, dy).
  function photonMark(g, x, y, dx, dy, length) {
    var angle = Math.atan2(dy, dx);
    var cos = Math.cos(angle);
    var sin = Math.sin(angle);
    function at(along, across) {
      return [x + along * cos - across * sin, y + along * sin + across * cos];
    }
    g.beginPath();
    for (var k = 0; k <= 12; k++) {
      var p = at(-length / 2 + k / 12 * length, 0.16 * length * Math.sin(k / 12 * 3 * Math.PI));
      if (k === 0) g.moveTo(p[0], p[1]);
      else g.lineTo(p[0], p[1]);
    }
    g.stroke();
    var tip = at(length / 2 + 0.28 * length, 0);
    var a = at(length / 2, -0.18 * length);
    var b = at(length / 2, 0.18 * length);
    g.beginPath();
    g.moveTo(tip[0], tip[1]);
    g.lineTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    g.closePath();
    g.fill();
  }

  // "694 nm", "1.06 µm", "10.6 µm": a wavelength in m, written as the
  // bench writes it (LaserUI.format.si), or "".
  function wavelengthText(lam) {
    if (typeof lam !== "number" || !isFinite(lam) || lam <= 0) return "";
    return UI.format.si(lam, "m");
  }

  // The colours of the light: the laser's and the pump's, physical for a
  // medium with a look in LaserUI.materials, else the theme's.
  function lightColours(colors, picture) {
    var M = UI.materials;
    var physical = M && picture && typeof picture.medium === "string" &&
      Object.prototype.hasOwnProperty.call(M.MEDIA, picture.medium);
    if (!physical) return { laser: colors.accent2, pump: colors.accent2 };
    var laser = M.readable(M.beam(picture.lam).color, colors.bg);
    var pump;
    if (picture.pumpKind === "discharge") pump = colors.accent;
    else if (picture.pumpKind === "flashlamp") pump = M.readable(colors.flash, colors.bg);
    else if (typeof picture.pumpLam === "number" && picture.pumpLam > 0) pump = M.readable(M.beam(picture.pumpLam).color, colors.bg);
    else pump = colors.accent;
    return { laser: laser, pump: pump };
  }

  // An atom: a filled, glowing disc up (upper level, pump band), a ring
  // down (ground, lower level).
  function atomMark(g, colors, x, y, radius, excited) {
    g.beginPath();
    g.arc(x, y, radius, 0, 2 * Math.PI);
    if (excited) {
      g.fillStyle = colors.accent;
      g.fill();
      g.strokeStyle = colors.glow;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y, radius + 2, 0, 2 * Math.PI);
      g.stroke();
    } else {
      g.fillStyle = colors.bg;
      g.fill();
      g.strokeStyle = colors.muted;
      g.lineWidth = 1.4;
      g.stroke();
    }
  }

  function draw(view, model, words, picture) {
    var g = view.g;
    var c = view.colors;
    var shown = picture || {};
    var named = words || {};
    var scheme = model ? model.scheme : null;
    var L = layout(view.w, view.h, !!(scheme && scheme.partner));
    var fs = L.fontSize;

    function word(name) {
      return typeof named[name] === "string" ? named[name] : "";
    }
    function text(value, x, y, maxWidth) {
      if (value && maxWidth > 0) g.fillText(value, x, y, maxWidth);
    }

    g.clearRect(0, 0, view.w, view.h);
    g.save();
    g.font = fs + "px " + view.font;
    g.textBaseline = "alphabetic";

    /* the title, and the medium with its scheme on the right */
    var inner = view.w - 2 * L.pad;
    g.fillStyle = c.text;
    g.textAlign = "left";
    text(word("title"), L.pad, L.titleY, 0.56 * inner);
    if (scheme) {
      var kindWord = word(scheme.kind);
      var heading = shown.name && kindWord ? shown.name + " · " + kindWord : (shown.name || kindWord);
      g.fillStyle = c.heading;
      g.textAlign = "right";
      text(heading, view.w - L.pad, L.titleY, 0.42 * inner);
    }
    if (!scheme) {
      g.restore();
      return;
    }

    var levels = scheme.levels;
    var colours = lightColours(c, shown);
    var light = clamp(typeof shown.light === "number" ? shown.light : 0, 0, 1);
    var pumping = clamp(typeof shown.pump === "number" ? shown.pump : 0, 0, 1);
    var Y = {};
    Object.keys(levels).forEach(function (id) { Y[id] = levelY(L, levels[id].y); });
    var head = clamp(0.7 * fs, 7, 10);

    /* the bands of sublevels (dye, Ti:sapphire) and a broad pump band */
    g.fillStyle = c.faint;
    (scheme.bands || []).forEach(function (pair) {
      var yLow = Y[pair[0]];
      var yHigh = Y[pair[1]];
      g.globalAlpha = 0.35;
      g.fillRect(L.left, yHigh, L.right - L.left, yLow - yHigh);
      g.globalAlpha = 1;
      g.strokeStyle = c.line;
      g.lineWidth = 1;
      for (var k = 1; k <= 3; k++) {
        var ySub = yLow + k / 4 * (yHigh - yLow);
        line(g, L.left, ySub, L.right, ySub);
      }
    });
    Object.keys(levels).forEach(function (id) {
      if (!levels[id].wide) return;
      g.globalAlpha = 0.35;
      g.fillStyle = c.faint;
      g.fillRect(L.left, Y[id] - L.bandHalf, L.right - L.left, 2 * L.bandHalf);
      g.globalAlpha = 1;
    });

    /* the levels: a line each, its name on the left, its role on the right */
    Object.keys(levels).forEach(function (id) {
      var y = Y[id];
      g.strokeStyle = c.heading;
      g.lineWidth = 2;
      line(g, L.left, y, L.right, y);
      g.fillStyle = c.heading;
      g.textAlign = "right";
      // With a partner gas the collision's arrow runs along the upper
      // level into the line, so that level's name goes under its line.
      var termY = L.partner && id === "upper" ? y + 1.3 * fs : y + 0.35 * fs;
      text(levels[id].term, L.left - 6, termY, L.left - 6 - (L.partner ? L.partner.right + 4 : L.pad));
      g.fillStyle = c.muted;
      g.textAlign = "left";
      text(word(id), L.roleX, y + 0.35 * fs, L.roleWidth);
    });

    /* the pump */
    var pumpWord = shown.pumpKind === "discharge" ? word("electrons") : word("pump");
    if (shown.pumpKind !== "discharge" && shown.pumpKind !== "flashlamp") {
      var pumpLam = scheme.kind === "two" ? shown.lam : shown.pumpLam;
      var lamText = wavelengthText(pumpLam);
      if (lamText) pumpWord = pumpWord ? pumpWord + " " + lamText : lamText;
    }
    g.strokeStyle = colours.pump;
    g.fillStyle = colours.pump;
    g.lineWidth = 2.5;
    g.globalAlpha = 0.35 + 0.65 * pumping;
    if (scheme.partner) {
      // The partner gas: its ground and its level, the pump up it, and a
      // collision that hands the energy over to the upper laser level.
      var P = L.partner;
      g.globalAlpha = 1;
      g.strokeStyle = c.heading;
      g.lineWidth = 2;
      line(g, P.left + 4, Y.ground, P.right - 4, Y.ground);
      line(g, P.left + 4, Y.upper, P.right - 4, Y.upper);
      g.fillStyle = c.heading;
      g.textAlign = "center";
      text(scheme.partner.name + " " + scheme.partner.term, P.x, Y.upper - 0.5 * fs, P.right - P.left);
      g.strokeStyle = colours.pump;
      g.fillStyle = colours.pump;
      g.lineWidth = 2.5;
      g.globalAlpha = 0.35 + 0.65 * pumping;
      arrow(g, P.x, Y.ground, Y.upper + 2, head);
      g.setLineDash([4, 3]);
      g.lineWidth = 1.5;
      line(g, P.right - 2, Y.upper, L.left - 0.8 * head, Y.upper);
      g.setLineDash([]);
      g.beginPath();
      g.moveTo(L.left, Y.upper);
      g.lineTo(L.left - 0.9 * head, Y.upper - 0.5 * head);
      g.lineTo(L.left - 0.9 * head, Y.upper + 0.5 * head);
      g.closePath();
      g.fill();
      g.globalAlpha = 1;
      g.fillStyle = c.muted;
      g.textAlign = "left";
      text(word("transfer"), P.right + 2, Y.upper - 0.9 * fs, L.left - P.right - 4);
      g.fillStyle = colours.pump;
      text(pumpWord, P.x + 6, levelY(L, freeGap(levels, levels.upper.y)) + 0.35 * fs, L.left - P.x - 10);
    } else {
      var pumpTop = levels.band ? Y.band : Y.upper;
      arrow(g, L.pumpX, Y.ground, pumpTop + 2, head);
      g.globalAlpha = 1;
      g.textAlign = "right";
      var pumpWordY = levelY(L, freeGap(levels, levels.band ? levels.band.y : levels.upper.y)) + 0.35 * fs;
      text(pumpWord, L.pumpX - 6, pumpWordY, L.pumpX - 6 - L.pad);
    }
    g.globalAlpha = 1;

    /* the fast drops into heat */
    g.strokeStyle = c.muted;
    g.fillStyle = c.muted;
    g.lineWidth = 1.5;
    if (levels.band) wavyArrow(g, L.heatX, Y.band + 3, Y.upper - 2, head * 0.8);
    if (levels.lower) wavyArrow(g, L.dropX, Y.lower + 3, Y.ground - 2, head * 0.8);
    var heatWord = word("heat");
    if (heatWord && levels.lower) {
      g.textAlign = "left";
      text(heatWord, L.roleX, (Y.lower + Y.ground) / 2 + 0.35 * fs, L.roleWidth);
    }

    /* the laser step */
    var laserEnd = levels.lower ? Y.lower : Y.ground;
    g.strokeStyle = colours.laser;
    g.fillStyle = colours.laser;
    g.lineWidth = 3;
    g.globalAlpha = 0.35 + 0.65 * light;
    arrow(g, L.laserX, Y.upper + 2, laserEnd - 2, head);
    g.globalAlpha = 1;
    g.textAlign = "left";
    text(wavelengthText(shown.lam), L.roleX, (Y.upper + laserEnd) / 2 + 0.35 * fs, L.roleWidth);

    /* the atoms and their photons, inside the levels' box */
    var radius = atomRadius(L);
    g.save();
    g.beginPath();
    g.rect(L.left, L.top - 2 * radius - 4, L.right - L.left, L.bottom - L.top + 2 * radius + 6);
    g.clip();
    var photonLength = clamp(2.4 * radius, 10, 20);
    model.photons.forEach(function (photon) {
      var tone = photon.kind === "laser" ? colours.laser : photon.kind === "push" ? colours.pump : c.muted;
      g.strokeStyle = tone;
      g.fillStyle = tone;
      g.lineWidth = 1.5 + 1.2 * photon.fresh;
      photonMark(g, L.left + photon.x * (L.right - L.left), levelY(L, photon.y) - radius - 1,
        photon.dx, -photon.dy, photonLength);
    });
    model.atoms.forEach(function (atom) {
      var x = colX(L, atom.col);
      var from = Y[atom.level];
      var y = from;
      var leg = atom.legs[0];
      if (leg) {
        var to = Y[leg.to];
        y = from + atom.t * (to - from);
        // Its trail: the pump's colour going up, the light's going down.
        var tone = leg.kind === "laser" ? colours.laser
          : leg.kind === "pump" || leg.kind === "transfer" || leg.kind === "push" ? colours.pump : c.muted;
        g.strokeStyle = tone;
        g.lineWidth = 2;
        g.globalAlpha = 0.7;
        line(g, x, from - radius - 1, x, y - radius - 1);
        g.globalAlpha = 1;
      }
      // Excited while it is up, or on its way up there or down from there;
      // not while it drops from the lower laser level to the ground as heat.
      var high = function (level) { return level === "upper" || level === "band"; };
      var excited = high(atom.level) || (leg ? high(leg.to) : false);
      atomMark(g, c, x, y - radius - 1, radius, excited);
    });
    g.restore();

    /* the note: what this scheme teaches */
    var note = word("note" + scheme.kind.charAt(0).toUpperCase() + scheme.kind.slice(1));
    g.fillStyle = c.muted;
    g.textAlign = "left";
    text(note, L.pad, L.noteY, inner);

    g.restore();
  }

  UI.atoms = Object.freeze({
    SIZE: SIZE,
    WORDS: WORDS,
    SCHEMES: SCHEMES,
    ATOMS: ATOMS,
    LIMITS: LIMITS,
    create: create,
    layout: layout,
    draw: draw
  });
})(this);
