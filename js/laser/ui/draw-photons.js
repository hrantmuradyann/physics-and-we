/* ============================================================================
   draw-photons.js — a cartoon of what happens inside the gain medium: atoms,
   and photons flying through them (docs/laser-plan.md, stage 6b).

   THIS IS AN ILLUSTRATION, NOT THE SIMULATION. The numbers on the page
   come from js/laser/engine/; this picture only acts them out with a few
   dozen atoms. What it shows is true in kind:
     · a photon of the laser light that passes an excited atom can make it
       emit a second photon that flies along with the first (stimulated
       emission): this is how the medium amplifies light;
     · the pump lifts atoms back up;
     · an excited atom also emits by itself, now and then, in any
       direction (spontaneous emission); only a photon that happens to fly
       along the axis joins the laser light. That is how a laser starts.
   What is not to scale: 60 atoms stand for about 10²², and the share of
   them drawn excited is chosen by the page.

     var model = LaserUI.photons.create({ cols, rows, random });
         cols, rows   the grid of atoms
         random       a function like Math.random (the tests pass their own,
                      so they can be repeated)
     model.step(dt, drive)     moves the cartoon on by dt seconds of screen
                               time. drive = { excited, light, pump }, each
                               from 0 to 1:
                                 excited  the share of atoms to keep excited
                                 light    how strong the laser light is
                                 pump     how hard the pump works
     model.send(row, direction)   a photon of the laser light enters row
                               `row` from the left (direction 1) or the
                               right (−1)
     model.atoms       [{ col, row, x, y, excited, flash, lifted }]; x and y
                       run from 0 to 1 across the picture; flash and lifted
                       fade from 1 to 0 after the atom emitted / was lifted
     model.photons     [{ x, y, dx, dy, row, fresh }]: row is the row a
                       photon of the laser light flies along, −1 for a
                       stray photon; fresh fades from 1 to 0 after it was
                       made
     model.tally       { entered, stimulated, spontaneous, lifted }: how
                       often each thing has happened

     LaserUI.photons.draw(view, model, words)
         words  { title, excited, ground, photon, stray }: the title and
                the legend; a missing word is left out
     LaserUI.photons.layout(w, h)    the box of atoms and the legend
     LaserUI.photons.SIZE, WORDS, LIMITS

   Tests: tests/laser/draw-photons.test.js
   ========================================================================== */
(function (root) {
  "use strict";

  var UI = root.LaserUI = root.LaserUI || {};

  var SIZE = Object.freeze({ aspect: 1.5, minHeight: 240, maxHeight: 340 });
  var WORDS = Object.freeze(["title", "excited", "ground", "photon", "stray"]);

  var SPEED = 0.42;          // a photon crosses the picture in about 2.4 s
  var CHANCE = 0.45;         // that a passing photon makes an excited atom emit
  var ENTER = 2.5;           // photons of the laser light entering a second, at full light
  var SELF = 0.04;           // how often a second an excited atom emits by itself
  var LIFT = 16;             // atoms the pump lifts a second, at most
  var DROP = 16;             // atoms that fall a second when the inversion falls
  var MOST = 48;             // photons in the picture, at most
  var CONE = 0.2;            // rad: a photon emitted this close to the axis joins the laser light
  var FLASH = 0.35;          // s an atom that has just emitted stays marked
  var LIFTED = 0.25;         // s an atom that was just lifted stays marked
  var FRESH = 0.45;          // s a new photon stays marked
  var LIMITS = Object.freeze({
    speed: SPEED, chance: CHANCE, enter: ENTER, self: SELF, lift: LIFT, drop: DROP, most: MOST, cone: CONE,
    flash: FLASH, lifted: LIFTED, fresh: FRESH
  });

  function clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
  }

  function fail(where, message) {
    throw new Error("LaserUI.photons." + where + ": " + message);
  }

  function isWhole(value) {
    return typeof value === "number" && isFinite(value) && Math.floor(value) === value;
  }

  // A drive value as a number from 0 to 1.
  function share(where, name, value) {
    if (typeof value !== "number" || isNaN(value)) {
      fail(where, "drive." + name + " must be a number from 0 to 1, got " + value + ".");
    }
    return clamp(value, 0, 1);
  }

  /* ---------- the cartoon's state ---------- */

  function create(options) {
    var where = "create";
    if (!options || !isWhole(options.cols) || !isWhole(options.rows) || options.cols < 1 || options.rows < 1) {
      fail(where, "cols and rows must be whole numbers of at least 1.");
    }
    if (typeof options.random !== "function") fail(where, "random must be a function like Math.random.");
    var cols = options.cols;
    var rows = options.rows;
    var random = options.random;

    var atoms = [];
    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < cols; col++) {
        atoms.push({
          col: col, row: row, x: (col + 0.5) / cols, y: (row + 0.5) / rows,
          excited: false, flash: 0, lifted: 0
        });
      }
    }
    var photons = [];
    var tally = { entered: 0, stimulated: 0, spontaneous: 0, lifted: 0 };
    var enterCredit = 0;
    var liftCredit = 0;
    var dropCredit = 0;

    function pick(list) {
      return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
    }

    function atomsThat(excited) {
      return atoms.filter(function (atom) { return atom.excited === excited; });
    }

    // A photon of the laser light, flying along a row.
    function laserPhoton(x, y, row, direction) {
      photons.push({ x: x, y: y, dx: direction, dy: 0, row: row, fresh: 1 });
    }

    // An atom emits by itself, in any direction. A photon that happens to
    // fly along the axis joins the laser light.
    function emitAlone(atom) {
      atom.excited = false;
      tally.spontaneous += 1;
      if (photons.length >= MOST) return;
      var angle = 2 * Math.PI * random();
      if (Math.abs(Math.sin(angle)) < Math.sin(CONE)) {
        laserPhoton(atom.x, atom.y, atom.row, Math.cos(angle) > 0 ? 1 : -1);
      } else {
        photons.push({ x: atom.x, y: atom.y, dx: Math.cos(angle), dy: Math.sin(angle), row: -1, fresh: 1 });
      }
    }

    // A passing photon makes an atom emit a second photon that flies with it.
    function emitWith(atom, photon) {
      atom.excited = false;
      atom.flash = 1;
      tally.stimulated += 1;
      // Beside the first, a quarter of a row away, still inside the row.
      var side = random() < 0.5 ? -1 : 1;
      var y = photon.y + side * 0.22 / rows;
      if (Math.abs(y - atom.y) > 0.36 / rows) y = photon.y - side * 0.22 / rows;
      laserPhoton(photon.x, y, photon.row, photon.dx);
    }

    function movePhotons(dt) {
      var existing = photons.length;                 // photons made in this step wait for the next
      for (var i = 0; i < existing; i++) {
        var photon = photons[i];
        var from = photon.x;
        photon.x += photon.dx * SPEED * dt;
        photon.y += photon.dy * SPEED * dt;
        if (photon.row < 0) continue;                // a stray photon meets nobody
        var low = Math.min(from, photon.x);
        var high = Math.max(from, photon.x);
        for (var col = 0; col < cols; col++) {
          var atom = atoms[photon.row * cols + col];
          if (!(atom.x > low && atom.x <= high)) continue;
          if (atom.excited && photons.length < MOST && random() < CHANCE) emitWith(atom, photon);
        }
      }
      for (var j = photons.length - 1; j >= 0; j--) {
        var p = photons[j];
        if (p.x < -0.03 || p.x > 1.03 || p.y < -0.03 || p.y > 1.03) photons.splice(j, 1);
      }
    }

    function send(row, direction) {
      if (!isWhole(row) || row < 0 || row >= rows) fail("send", "row must be a whole number from 0 to " + (rows - 1) + ".");
      if (direction !== 1 && direction !== -1) fail("send", "direction must be 1 or -1.");
      laserPhoton(direction === 1 ? 0 : 1, (row + 0.5) / rows, row, direction);
      tally.entered += 1;
    }

    // Lifts or drops atoms until the share excited is the one asked for,
    // no faster than the pump (or the light) would.
    function follow(dt, drive) {
      var target = Math.round(drive.excited * atoms.length);
      var count = atomsThat(true).length;
      if (count < target) {
        liftCredit = Math.min(3, liftCredit + LIFT * (0.2 + 0.8 * drive.pump) * dt);
        while (liftCredit >= 1 && count < target) {
          var lifted = pick(atomsThat(false));
          lifted.excited = true;
          lifted.lifted = 1;
          tally.lifted += 1;
          count += 1;
          liftCredit -= 1;
        }
      } else if (count > target) {
        dropCredit = Math.min(3, dropCredit + DROP * dt);
        while (dropCredit >= 1 && count > target) {
          var falling = pick(atomsThat(true));
          // With laser light around, the light took the atom's energy;
          // without it, the atom emitted by itself.
          if (drive.light > 0.02 && photons.length < MOST) {
            falling.excited = false;
            falling.flash = 1;
            tally.stimulated += 1;
            laserPhoton(falling.x, falling.y, falling.row, random() < 0.5 ? -1 : 1);
          } else {
            emitAlone(falling);
          }
          count -= 1;
          dropCredit -= 1;
        }
      } else {
        liftCredit = Math.min(liftCredit, 1);
        dropCredit = Math.min(dropCredit, 1);
      }
    }

    function fade(dt) {
      atoms.forEach(function (atom) {
        atom.flash = Math.max(0, atom.flash - dt / FLASH);
        atom.lifted = Math.max(0, atom.lifted - dt / LIFTED);
      });
      photons.forEach(function (photon) {
        photon.fresh = Math.max(0, photon.fresh - dt / FRESH);
      });
    }

    function step(dt, drive) {
      var at = "step";
      if (typeof dt !== "number" || !isFinite(dt) || dt < 0) fail(at, "dt must be a number of seconds, 0 or more, got " + dt + ".");
      if (!drive || typeof drive !== "object") fail(at, "drive must be { excited, light, pump }.");
      var wanted = {
        excited: share(at, "excited", drive.excited),
        light: share(at, "light", drive.light),
        pump: share(at, "pump", drive.pump)
      };
      if (dt === 0) return;

      fade(dt);
      movePhotons(dt);

      // Laser light enters from either side.
      enterCredit = Math.min(3, enterCredit + ENTER * wanted.light * dt);
      while (enterCredit >= 1) {
        enterCredit -= 1;
        if (photons.length >= MOST) continue;
        send(Math.min(rows - 1, Math.floor(random() * rows)), random() < 0.5 ? 1 : -1);
      }

      // Now and then an excited atom emits by itself.
      atoms.forEach(function (atom) {
        if (atom.excited && random() < SELF * dt) emitAlone(atom);
      });

      follow(dt, wanted);
    }

    return { cols: cols, rows: rows, atoms: atoms, photons: photons, tally: tally, step: step, send: send };
  }

  /* ---------- the picture ---------- */

  function layout(w, h) {
    var pad = Math.max(10, 0.03 * w);
    var fontSize = clamp(Math.round(0.05 * h), 11, 14);
    var titleY = pad + fontSize;
    var legendBottom = h - pad - 0.3 * fontSize;
    var legendTop = legendBottom - 1.5 * fontSize;
    var middle = w / 2;
    return {
      fontSize: fontSize,
      titleY: titleY,
      titleWidth: w - 2 * pad,
      box: { left: pad, right: w - pad, top: titleY + 0.8 * fontSize, bottom: legendTop - 1.3 * fontSize },
      // The legend: two rows of two, each a mark and a word.
      legend: {
        excited: { x: pad, y: legendTop },
        ground: { x: middle, y: legendTop },
        photon: { x: pad, y: legendBottom },
        stray: { x: middle, y: legendBottom }
      },
      legendMark: 2.2 * fontSize,                       // room for the mark before the word
      legendWidth: middle - pad - 2.6 * fontSize
    };
  }

  function atomRadius(L, model) {
    var cellWidth = (L.box.right - L.box.left) / model.cols;
    var cellHeight = (L.box.bottom - L.box.top) / model.rows;
    return 0.26 * Math.min(cellWidth, cellHeight);
  }

  // An atom: a ring in the ground state, a filled, glowing disc when excited.
  function atomMark(g, colors, x, y, radius, excited) {
    g.beginPath();
    g.arc(x, y, radius, 0, 2 * Math.PI);
    if (excited) {
      g.fillStyle = colors.accent;
      g.fill();
      g.strokeStyle = colors.glow;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y, radius + 2.5, 0, 2 * Math.PI);
      g.stroke();
    } else {
      g.strokeStyle = colors.faint;
      g.lineWidth = 1.3;
      g.stroke();
    }
  }

  // A photon: a short wave with an arrowhead, flying along (dx, dy).
  function photonMark(g, x, y, dx, dy, length) {
    g.save();
    g.translate(x, y);
    g.rotate(Math.atan2(dy, dx));
    g.beginPath();
    for (var k = 0; k <= 12; k++) {
      var along = -length / 2 + k / 12 * length;
      var across = 0.16 * length * Math.sin(k / 12 * 3 * Math.PI);
      if (k === 0) g.moveTo(along, across);
      else g.lineTo(along, across);
    }
    g.stroke();
    g.beginPath();
    g.moveTo(length / 2 + 0.28 * length, 0);
    g.lineTo(length / 2, -0.18 * length);
    g.lineTo(length / 2, 0.18 * length);
    g.closePath();
    g.fill();
    g.restore();
  }

  function draw(view, model, words) {
    var g = view.g;
    var c = view.colors;
    var L = layout(view.w, view.h);
    var B = L.box;
    var width = B.right - B.left;
    var height = B.bottom - B.top;
    var radius = atomRadius(L, model);
    var photonLength = clamp(2.3 * radius, 12, 30);   // a little longer than an atom is wide
    var named = words || {};

    function word(name) {
      return typeof named[name] === "string" ? named[name] : "";
    }

    g.clearRect(0, 0, view.w, view.h);
    g.save();
    g.font = L.fontSize + "px " + view.font;
    g.textBaseline = "alphabetic";
    g.textAlign = "left";

    g.fillStyle = c.text;
    if (word("title")) g.fillText(word("title"), B.left, L.titleY, L.titleWidth);

    /* the piece of medium */
    g.strokeStyle = c.line;
    g.lineWidth = 1;
    g.strokeRect(B.left, B.top, width, height);

    // Nothing is drawn outside the box: photons fly out of sight.
    g.save();
    g.beginPath();
    g.rect(B.left, B.top, width, height);
    g.clip();

    model.atoms.forEach(function (atom) {
      var x = B.left + atom.x * width;
      var y = B.top + atom.y * height;
      atomMark(g, c, x, y, radius, atom.excited);
      if (atom.lifted > 0) {
        // The pump has just lifted it: a short stroke coming up from below.
        g.globalAlpha = atom.lifted;
        g.strokeStyle = c.glow;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x, y + radius + 9);
        g.lineTo(x, y + radius + 3);
        g.stroke();
        g.globalAlpha = 1;
      }
      if (atom.flash > 0) {
        // It has just emitted for a passing photon: a ring that spreads and fades.
        g.globalAlpha = atom.flash;
        g.strokeStyle = c.accent2;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(x, y, radius + 4 + (1 - atom.flash) * 8, 0, 2 * Math.PI);
        g.stroke();
        g.globalAlpha = 1;
      }
    });

    model.photons.forEach(function (photon) {
      var tone = photon.row < 0 ? c.muted : c.accent2;
      g.strokeStyle = tone;
      g.fillStyle = tone;
      g.lineWidth = 1.6 + 1.2 * photon.fresh;        // a new photon stands out for a moment
      photonMark(g, B.left + photon.x * width, B.top + photon.y * height, photon.dx, photon.dy, photonLength);
    });
    g.restore();

    /* the legend */
    var markY = -0.33 * L.fontSize;                   // the marks sit at the middle of the letters
    var legendRadius = 0.38 * L.fontSize;
    ["excited", "ground", "photon", "stray"].forEach(function (name) {
      if (!word(name)) return;
      var spot = L.legend[name];
      var markX = spot.x + L.legendMark / 2;
      if (name === "excited" || name === "ground") {
        atomMark(g, c, markX - 0.3 * L.fontSize, spot.y + markY, legendRadius, name === "excited");
      } else {
        var tone = name === "stray" ? c.muted : c.accent2;
        g.strokeStyle = tone;
        g.fillStyle = tone;
        g.lineWidth = 1.6;
        photonMark(g, markX - 0.3 * L.fontSize, spot.y + markY, 1, 0, 1.2 * L.fontSize);
      }
      g.fillStyle = c.muted;
      g.fillText(word(name), spot.x + L.legendMark, spot.y, L.legendWidth);
    });

    g.restore();
  }

  UI.photons = Object.freeze({
    SIZE: SIZE,
    WORDS: WORDS,
    LIMITS: LIMITS,
    create: create,
    layout: layout,
    draw: draw
  });
})(this);
