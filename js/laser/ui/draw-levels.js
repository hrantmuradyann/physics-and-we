/* ============================================================================
   draw-levels.js — the energy levels of the gain medium and the gain/loss
   gauge (docs/laser-physics.md §2, §11.6 items 1 and 2).

     LaserUI.levels.draw(view, picture)
       view     what loop.js passes to a draw: { g, w, h, colors, font, … }
       picture  { scheme, x, smallSignal, y, stim, n_t, loss, words }
                scheme  "four-level", "three-level" or "two-level"; none
                      is four levels
                x     pump rate / threshold rate (R_p/R_c): the pump
                      arrow's width (for the two-level atom, which has no
                      threshold, its W_pτ)
                smallSignal  the small-signal gain over the loss
                      (g₀/g_th), where the gain would be with no light:
                      the gauge's dashed line. For four levels it is x;
                      for three and two it is not (bench.pumpNow gives it)
                y     inversion / threshold inversion (ΔN/N_c), now: from
                      0 up for four levels, from −n_t (every ion down)
                      for three and two
                stim  stimulated emission now, over the threshold pump
                      rate: x − 1 once the laser runs steadily
                n_t   N_t/N_c, for three and two levels
                loss  the cavity's loss now over the open cavity's (a
                      Q-switch's, bench.switchNow); none is 1. The scale
                      follows it: when a shutter opens it falls from the
                      closed loss (Nd:YAG's cell, 37) to what the gain
                      needs, so the clamped gain stays readable (a scale
                      kept at the closed loss left it in the bottom
                      fortieth: stage 8b review)
                words { pumpBand, upper, lower, ground, groundLower, gain,
                      loss, transparent }; a missing word is left out
     LaserUI.levels.layout(w, h)     where everything goes (CSS pixels)
     LaserUI.levels.scaleMax(picture), scaleMin(picture)
                the top and the bottom of the gauge, in units of the
                threshold; four levels' bar uses the top too

   Left: the levels, the pump arrow and the laser arrow as wide as their
   rates.
     four levels   pump band, upper, lower, ground; the pump from the
                   ground to the band, the laser from upper to lower; a
                   bar on the upper level filling up with the inversion,
                   with a mark at threshold (no word: at a strong pump the
                   mark sits on the upper level's name)
     three levels  pump band, upper, ground: the ground is also the lower
                   laser level, so the laser goes down to it, and more
                   than half the ions must be up before the medium gains
                   (§2.2). Two bars: the share of ions up, with a mark at
                   threshold, (1 + 1/n_t)/2, and the share down
     two levels    upper and ground; the pump drawn up and down, equally
                   wide: its light takes atoms down as fast as up, so the
                   upper bar never passes half (§2.1)
   Right: the gain bar against the loss line, which is the threshold.
   Above threshold the gain rises to the loss and stops there, whatever
   the pump: gain clamping (§4.1). Units of the open cavity's threshold,
   so the loss is 1, or more behind a closed Q-switch (stage 8b), and the
   threshold mark on the bars is where the gain reaches the loss now. For
   three and two levels the gauge goes down to −n_t: below its zero line
   the medium absorbs, and the bar is drawn down, paler.

   Tests: tests/laser/draw-panels.test.js
   ========================================================================== */
(function (root) {
  "use strict";

  var UI = root.LaserUI = root.LaserUI || {};

  var SIZE = Object.freeze({ aspect: 1.6, minHeight: 220, maxHeight: 320 });
  var HEADROOM = 1.15;            // room around the highest and lowest values on a scale
  var ARROW_FULL = 4;             // a rate of 4× threshold draws the widest arrow
  // For three and two levels the gauge reaches above zero at least this
  // many times n_t, so with every ion down (the gauge's bottom at
  // −1.15·n_t) the part above zero, with the loss line, is not a sliver.
  var ABOVE_ZERO = 0.25;

  function clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
  }

  // Three and two levels have ions that can all be down; four levels
  // start from an empty upper level. A picture with no scheme is four.
  function hasIons(picture) {
    return picture.scheme === "three-level" || picture.scheme === "two-level";
  }

  // The loss now, over the open cavity's; 1 when the picture does not
  // give it.
  function lossOf(picture) {
    return typeof picture.loss === "number" ? picture.loss : 1;
  }

  // The top of the gauge: it holds the small-signal gain, y and the loss
  // with room above, so nothing drawn on the scale needs clamping (a clamp
  // would only hide a wrong scale).
  function scaleMax(picture) {
    var top = Math.max(picture.smallSignal, picture.y, lossOf(picture)) * HEADROOM;
    if (hasIons(picture)) top = Math.max(top, ABOVE_ZERO * picture.n_t);
    return top;
  }

  // The bottom of the gauge: 0 for four levels; for three and two, every
  // ion down (y = −n_t), with room below.
  function scaleMin(picture) {
    return hasIons(picture) ? -picture.n_t * HEADROOM : 0;
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
        pumpDown: lineLeft + 0.26 * lineWidth,         // the two-level atom's pump, down
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
      // Three and two levels: the share of ions down, on the ground level.
      groundBar: {
        x: lineRight - barWidth - 2,
        w: barWidth,
        top: bottom - 0.26 * span,
        bottom: bottom
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

  // A horizontal line from x1 to x2 at height y.
  function across(g, x1, x2, y) {
    g.beginPath();
    g.moveTo(x1, y);
    g.lineTo(x2, y);
    g.stroke();
  }

  // A bar filling `share` (0–1) of its slot from the bottom.
  function shareBar(g, c, slot, share) {
    var height = clamp(share, 0, 1) * (slot.bottom - slot.top);
    g.strokeStyle = c.grid;
    g.lineWidth = 1;
    g.strokeRect(slot.x, slot.top, slot.w, slot.bottom - slot.top);
    if (height > 0) {
      g.fillStyle = c.accent;
      g.globalAlpha = 0.75;
      g.fillRect(slot.x, slot.bottom - height, slot.w, height);
      g.globalAlpha = 1;
    }
  }

  // The mark across a bar at `share` of its slot (the threshold).
  function barMark(g, c, slot, share) {
    var markY = slot.bottom - share * (slot.bottom - slot.top);
    g.strokeStyle = c.soft;
    g.lineWidth = 2;
    across(g, slot.x - 3, slot.x + slot.w + 3, markY);
  }

  function draw(view, picture) {
    var g = view.g;
    var c = view.colors;
    var L = layout(view.w, view.h);
    var words = picture.words || {};
    var scheme = hasIons(picture) ? picture.scheme : "four-level";
    var top = scaleMax(picture);
    var low = scaleMin(picture);

    g.clearRect(0, 0, view.w, view.h);
    g.save();
    g.font = L.fontSize + "px " + view.font;
    g.textBaseline = "alphabetic";

    /* the levels of this scheme */
    var levels;
    if (scheme === "three-level") {
      levels = [
        { y: L.pumpBand, word: word(words, "pumpBand") },
        { y: L.upper, word: word(words, "upper") },
        { y: L.ground, word: word(words, "groundLower") || word(words, "ground") }
      ];
    } else if (scheme === "two-level") {
      levels = [
        { y: L.upper, word: word(words, "upper") },
        { y: L.ground, word: word(words, "ground") }
      ];
    } else {
      levels = [
        { y: L.pumpBand, word: word(words, "pumpBand") },
        { y: L.upper, word: word(words, "upper") },
        { y: L.lower, word: word(words, "lower") },
        { y: L.ground, word: word(words, "ground") }
      ];
    }
    g.strokeStyle = c.line;
    g.lineWidth = 2;
    levels.forEach(function (level) {
      across(g, L.lineLeft, L.lineRight, level.y);
    });
    g.fillStyle = c.muted;
    g.textAlign = "left";
    levels.forEach(function (level) {
      text(g, level.word, L.labelLeft, level.y + 0.35 * L.fontSize, L.labelWidth);
    });

    /* fast relaxations, thin and dashed: from the pump band down to the
       upper level, and (four levels) from the lower level to the ground */
    if (scheme !== "two-level") {
      g.strokeStyle = c.faint;
      g.setLineDash([3, 3]);
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(L.arrows.relaxTop, L.pumpBand);
      g.lineTo(L.arrows.relaxTop, L.upper);
      if (scheme === "four-level") {
        g.moveTo(L.arrows.relaxBottom, L.lower);
        g.lineTo(L.arrows.relaxBottom, L.ground);
      }
      g.stroke();
      g.setLineDash([]);
    }

    /* the pump and the laser transition, as wide as their rates */
    var pumpShare = clamp(picture.x / ARROW_FULL, 0, 1);
    if (pumpShare > 0) {
      var pumpWidth = 1 + pumpShare * L.maxArrow;
      g.strokeStyle = c.glow;
      g.fillStyle = c.glow;
      if (scheme === "two-level") {
        // Its light takes atoms down as fast as up (§2.1).
        arrow(g, L.arrows.pump, L.ground, L.upper, pumpWidth);
        arrow(g, L.arrows.pumpDown, L.upper, L.ground, pumpWidth);
      } else {
        arrow(g, L.arrows.pump, L.ground, L.pumpBand, pumpWidth);
      }
    }
    var laserShare = clamp(picture.stim / ARROW_FULL, 0, 1);
    if (laserShare > 0.001) {
      g.strokeStyle = c.accent2;
      g.fillStyle = c.accent2;
      // Four levels lase down to the lower level, three and two to the ground.
      var laserEnd = scheme === "four-level" ? L.lower : L.ground;
      arrow(g, L.arrows.laser, L.upper, laserEnd, 1 + laserShare * L.maxArrow);
    }

    /* how many atoms are up */
    // The threshold now: the inversion where the gain reaches the loss,
    // y = loss (1 without a Q-switch).
    var loss = lossOf(picture);
    if (scheme === "four-level") {
      // The inversion on the gauge's scale, with a mark at threshold.
      shareBar(g, c, L.bar, picture.y / top);
      barMark(g, c, L.bar, loss / top);
    } else {
      // The shares of ions up and down: N₂/N_t = (n_t + y)/(2n_t). At
      // threshold y = loss, so the mark is at (1 + loss/n_t)/2.
      // With n_t ≤ loss even every ion up is short of threshold: no mark.
      var up = (picture.n_t + picture.y) / (2 * picture.n_t);
      shareBar(g, c, L.bar, up);
      if (picture.n_t > loss) barMark(g, c, L.bar, (1 + loss / picture.n_t) / 2);
      shareBar(g, c, L.groundBar, 1 - up);
    }

    /* the gauge: gain against loss (units of the threshold) */
    var G = L.gauge;
    var span = G.bottom - G.top;
    function gaugeY(value) {
      return G.bottom - span * (value - low) / (top - low);
    }
    var zeroY = gaugeY(0);
    g.strokeStyle = c.grid;
    g.lineWidth = 1;
    g.strokeRect(G.gainX, G.top, G.gainW, span);
    // The gain from zero: up while the medium gains, down (paler) while it
    // absorbs.
    var gainY = gaugeY(picture.y);
    if (gainY < zeroY) {
      g.fillStyle = c.accent;
      g.fillRect(G.gainX, gainY, G.gainW, zeroY - gainY);
    } else if (gainY > zeroY) {
      g.fillStyle = c.accent;
      g.globalAlpha = 0.4;
      g.fillRect(G.gainX, zeroY, G.gainW, gainY - zeroY);
      g.globalAlpha = 1;
    }
    // The small-signal gain: where the gain would be with no light at all.
    var smallY = gaugeY(picture.smallSignal);
    g.strokeStyle = c.muted;
    g.setLineDash([4, 3]);
    across(g, G.gainX, G.gainX + G.gainW, smallY);
    g.setLineDash([]);
    var wordsLeft = G.gainX + G.gainW + 6;
    var wordsWidth = Math.max(1, G.right - wordsLeft);
    // Zero, for three and two levels: below it the medium absorbs.
    if (low < 0) {
      g.strokeStyle = c.faint;
      g.lineWidth = 1;
      across(g, G.left, G.right, zeroY);
      g.fillStyle = c.muted;
      g.textAlign = "left";
      text(g, word(words, "transparent"), wordsLeft, zeroY + L.fontSize, wordsWidth);
    }
    // The loss: gain must reach it to lase.
    var lossY = gaugeY(loss);
    g.strokeStyle = c.soft;
    g.lineWidth = 2;
    across(g, G.left, G.right, lossY);
    g.fillStyle = c.soft;
    g.textAlign = "left";
    // Its word above the line, or under it when the line is too near the
    // gauge's top for the word to fit there.
    var lossWordY = lossY - 4;
    if (lossWordY - L.fontSize < G.top) lossWordY = lossY + L.fontSize + 2;
    text(g, word(words, "loss"), wordsLeft, lossWordY, wordsWidth);
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
    scaleMin: scaleMin,
    draw: draw
  });
})(this);
