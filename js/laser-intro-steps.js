/* =========================================================================
   The laser intro tour's eight steps (js/laser-intro.js runs them; the
   drawing helpers are js/laser-intro-draw.js).

   The story (the owner's, 2026-11-24): two mirrors and some light; one
   mirror lets 10% through, so the light dies in nanoseconds; a candle
   between the mirrors keeps light coming, but it is just candlelight; up
   close it is a jumble of waves; one atom on its own sends light any way;
   a passing photon makes a twin, and light grows where more atoms are up
   than down; the laser, with the candle outside, too weak, and a flash
   lamp that starts it; your turn.

   Each step is watched first (`watch` seconds, captions starting at
   `captions`), then played with (its `controls`). A step is an object:

     watch, captions     seconds; the caption starts (one per caption in
                         data/laser.json intro.steps[i].captions)
     view                [top, bottom]: the heights of the board the step
                         draws on; the tour zooms to them
     controls            [{ type: "slider", name, min, max, step }
                          { type: "button", name }
                          { type: "choice", name, options: [..] }]
     start(env)          a new state
     update(s, dt, env)  moves it on (dt in seconds of screen time)
     draw(s, env)        draws it on the 1280 x 720 board
     value(s, name)      a slider's value
     set(s, name, v)     a slider moved or a choice made
     press(s, name, env) a button pressed
     valueText(s, name, env)  a slider's words (also its aria-valuetext)
     notes(s, env)       the readouts under the controls, a list of lines
     toTry(s)            the watching part is over (optional)
     buttonWord(s, name) the button's word, when it changes (optional)
     pointer(s, x, y, env)    a click on the picture (optional)

   env: { t (seconds since the step started), trying (the watching part is
   over), random() (0..1), still (less motion asked), w(key, values) (a
   word of this step: intro.steps[i].<key>, {name}s filled in), page(path)
   (a word of the page) }.

   LaserIntro.physics holds the numbers the words state (tested in
   tests/laser/intro.test.js), so a readout never disagrees with a bar.

   Adds LaserIntro.physics and LaserIntro.steps.
   ========================================================================= */

(function (global) {
  "use strict";

  var LaserIntro = global.LaserIntro = global.LaserIntro || {};
  var D = LaserIntro.draw;

  var W = 1280;
  var H = 720;
  var C = 299792458;        // the speed of light, m/s
  var AXIS = 300;           // the height of the mirrors' line on the board
  var RAIL = 470;           // the bench's rail

  /* ---------- The physics behind the words ---------- */

  // Seconds for light to go from one mirror to the other and back.
  function roundTrip(length) {
    return 2 * length / C;
  }

  // How many bounces off a mirror that lets `through` (0..1) of the light
  // out, before less than `share` of it is left.
  function bouncesUntil(share, through) {
    var left = 1;
    var bounces = 0;
    while (left >= share && bounces < 100000) {
      left *= 1 - through;
      bounces += 1;
    }
    return bounces;
  }

  // Is atom i (of `total` in a row) excited, when `up` of them are? The
  // excited ones are spread along the row, starting with the first.
  function isUp(i, up, total) {
    return Math.floor((total - i) * up / total) > Math.floor((total - i - 1) * up / total);
  }

  // A photon group going through a row of atoms: each excited atom it
  // reaches adds a twin (and falls down), each calm one swallows a photon
  // (and goes up). Returns the count after each atom (the last = out).
  function passRow(up, total, photonsIn) {
    var n = photonsIn;
    var counts = [];
    for (var i = 0; i < total; i++) {
      if (n > 0) {
        if (isUp(i, up, total)) n += 1;
        else n -= 1;
      }
      counts.push(n);
    }
    return counts;
  }

  // The laser of step 7: the most the ruby adds to the light in one round
  // trip (a share), at full brightness, for each pump; and the share the
  // right mirror lets out.
  var MAX_GAIN = { candle: 0.03, lamp: 0.4 };
  var LETS_OUT = 0.1;
  var SEED = 1e-4;          // light the atoms send by themselves, per round trip and unit of gain
  var ROUNDS = 40;          // round trips shown per second of screen time
  var FLASH_EVERY = 3;      // seconds between the lamp's flashes (screen time)
  var FLASH_RISE = 0.6;     // seconds to the flash's top
  var BEAM_SHOWN = 0.6;     // light at which the beam is named on the picture

  // How bright the pump is now (0..1): a candle burns steadily, the lamp
  // flashes again and again.
  function pumpNow(pump, brightness, time) {
    if (pump === "candle") return brightness;
    var since = time % FLASH_EVERY;
    var f = since / FLASH_RISE;
    return brightness * f * Math.exp(1 - f);
  }

  // The share the ruby adds in one round trip at this pump level.
  function gainOf(pump, level) {
    return MAX_GAIN[pump] * level;
  }

  // One round trip of the light between the mirrors (light in units where
  // 1 is a strong beam): the ruby adds `gain` (less as the light grows and
  // takes the atoms down), the mirror lets LETS_OUT out, and the atoms send
  // a little light by themselves.
  function roundTripLight(light, gain) {
    var next = light * (1 + gain / (1 + light) - LETS_OUT) + SEED * gain;
    return Math.max(next, 0);
  }

  var physics = Object.freeze({
    C: C,
    roundTrip: roundTrip,
    bouncesUntil: bouncesUntil,
    isUp: isUp,
    passRow: passRow,
    MAX_GAIN: Object.freeze(MAX_GAIN),
    LETS_OUT: LETS_OUT,
    pumpNow: pumpNow,
    gainOf: gainOf,
    roundTripLight: roundTripLight
  });

  /* ---------- Small helpers ---------- */

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function fadeIn(t, start, duration) {
    var f = clamp((t - start) / duration, 0, 1);
    return f * f * (3 - 2 * f);
  }

  // 1234567 -> "1 200 000": two significant digits, spaces between
  // thousands (the same in both languages).
  // Puts a step's state back to a fresh one, in place (the frame keeps
  // the same object).
  function resetTo(s, fresh) {
    for (var key in fresh) s[key] = fresh[key];
  }

  function bigNumber(value) {
    if (value < 100) return String(Math.round(value));
    var power = Math.pow(10, Math.floor(Math.log(value) / Math.LN10) - 1);
    var digits = String(Math.round(value / power) * power);
    // a space between each group of three digits, from the right
    var grouped = "";
    while (digits.length > 3) {
      grouped = " " + digits.slice(-3) + grouped;
      digits = digits.slice(0, -3);
    }
    return digits + grouped;
  }

  // A time or a length as the lab writes it: a power of ten, no prefix
  // ("2.00 × 10⁻⁹ s"; the owner's choice, 2026-11-23).
  function si(value, unit) {
    return global.LaserUI.format.si(value, unit);
  }

  function metres(length) {
    return global.LaserUI.format.number(length) + " m";
  }

  function colours() {
    return D.colors();
  }

  // The two mirrors of steps 1-3, `length` (m) apart, centred on the board. 0.3 m, the
  // length of steps 2 and 3, is 760 px; the picture is not to scale (1 m
  // would not fit), but a longer cavity is always drawn wider.
  var MIRROR_W = 22;
  function pairFor(length) {
    var gap = Math.round(760 * Math.pow(length / 0.3, 0.3));
    var xl = W / 2 - gap / 2;
    var xr = W / 2 + gap / 2;
    return {
      left: { x: xl - MIRROR_W, y: 220, w: MIRROR_W, h: 160 },
      right: { x: xr, y: 220, w: MIRROR_W, h: 160 },
      xl: xl,
      xr: xr,
      gap: gap
    };
  }

  var PAIR = pairFor(0.3);
  var XL = PAIR.xl;
  var XR = PAIR.xr;
  var GAP = PAIR.gap;

  function drawPair(rightStrong, alpha, pair) {
    var p = pair || PAIR;
    var g = D.context();
    g.save();
    g.globalAlpha *= alpha === undefined ? 1 : alpha;
    D.rail(Math.min(170, p.xl - 90), Math.max(1110, p.xr + 90), RAIL);
    D.post(p.left.x + p.left.w / 2, p.left.y + p.left.h + 4, RAIL);
    D.post(p.right.x + p.right.w / 2, p.right.y + p.right.h + 4, RAIL);
    D.mirror(p.left, true, true, AXIS, 30);
    D.mirror(p.right, false, rightStrong, AXIS, 30);
    g.restore();
  }

  // Where a pulse is on its way between the mirrors: `pos` counts the
  // crossings (0.5 = the middle of the first one, going right).
  function pulseAt(pos, pair) {
    var p = pair || PAIR;
    var k = Math.floor(pos);
    var f = pos - k;
    if (k % 2 === 0) return { x: p.xl + f * p.gap, dir: 1 };
    return { x: p.xr - f * p.gap, dir: -1 };
  }

  // The title card the tour opens with (step 1's first seconds): the
  // question and a red beam drawn across under it.
  var COVER = 5.5;           // film seconds the title card stays (time to read it)
  function drawCover(env) {
    var c = colours();
    var t = env.t;
    var show = 1 - fadeIn(t, COVER - 0.8, 0.8);
    if (show <= 0) return;
    var g = D.context();
    g.save();
    g.globalAlpha = show;
    D.text(env.page("page.eyebrow"), W / 2, 220, { size: 22, color: c.muted, weight: "600", alpha: fadeIn(t, 0.1, 0.6) });
    D.text(env.w("canvas.cover"), W / 2, 300, { size: 60, color: c.heading, weight: "600", maxWidth: 1160, alpha: fadeIn(t, 0.3, 0.8) });
    var reach = fadeIn(t, 0.6, 1.2);
    g.strokeStyle = c.beam;
    g.lineWidth = 4;
    D.line(W / 2 - 420, 362, W / 2 - 420 + 840 * reach, 362);
    D.glow(W / 2 - 420 + 840 * reach, 362, 40, c.beam, 0.6 * reach * (1 - reach / 1.2));
    g.restore();
  }

  /* ======================================================================
     Step 1: two mirrors and some light
     ====================================================================== */

  var step1 = {
    view: [80, 510],
    watch: 21,
    captions: [COVER, 9.5, 15.5],
    controls: [
      { type: "slider", name: "slow", min: 7, max: 9, step: 0.05 },
      { type: "slider", name: "length", min: 0.1, max: 1, step: 0.05 },
      { type: "button", name: "again" }
    ],
    start: function () {
      return { length: 0.3, power: 9, pos: 0.5, real: 0, going: false };
    },
    update: function (s, dt, env) {
      if (!s.going && (env.t >= COVER + 1.6 || env.trying)) s.going = true;
      if (!s.going) return;
      var slow = Math.pow(10, s.power);
      var crossing = s.length / C * slow;   // seconds of screen time per crossing
      s.pos += dt / crossing;
      s.real += dt / slow;
    },
    draw: function (s, env) {
      var c = colours();
      var slow = Math.pow(10, s.power);
      if (!env.trying && env.t < COVER) {
        drawCover(env);
        return;
      }
      var pair = pairFor(s.length);
      var show = env.trying ? 1 : fadeIn(env.t, COVER - 0.2, 1);
      drawPair(true, show, pair);
      D.scaleBar(pair.xl, pair.xr, 420, env.w("canvas.distance", { m: metres(s.length) }));
      if (!s.going) return;
      var crossing = s.length / C * slow;
      if (crossing < 0.15) {
        // too fast to follow: a streak of light from mirror to mirror
        var g = D.context();
        g.save();
        g.globalAlpha = 0.7;
        g.strokeStyle = c.amber;
        g.lineWidth = 6;
        D.line(pair.xl, AXIS, pair.xr, AXIS);
        g.restore();
        D.glow(W / 2, AXIS, 120, c.amberRaw, 0.5);
      } else {
        var p = pulseAt(s.pos, pair);
        D.packet(p.x, AXIS, p.dir, 1, c.amber, c.amberRaw);
      }
      D.text(env.w("canvas.slowed", { n: bigNumber(slow) }), W / 2, 110, { size: 24, color: c.heading, weight: "600", maxWidth: 1100 });
      D.text(env.w("canvas.clock", { t: si(s.real, "s") }), Math.max(40, pair.xl - 10), 175, { size: 20, color: c.muted, align: "left" });
      D.text(env.w("canvas.bounces", { n: Math.max(0, Math.floor(s.pos)) }), Math.min(W - 40, pair.xr + 10), 175, { size: 20, color: c.muted, align: "right" });
    },
    value: function (s, name) {
      return name === "slow" ? s.power : s.length;
    },
    set: function (s, name, v) {
      if (name === "slow") s.power = v;
      else s.length = v;
    },
    press: function (s) {
      s.pos = 0.5;
      s.real = 0;
      s.going = true;
    },
    valueText: function (s, name, env) {
      if (name === "slow") return env.w("try.slowValue", { n: bigNumber(Math.pow(10, s.power)) });
      return env.w("try.lengthValue", { m: metres(s.length) });
    },
    notes: function (s, env) {
      var trip = roundTrip(s.length);
      return [env.w("try.roundTrip", { t: si(trip, "s"), n: bigNumber(1 / trip) })];
    }
  };

  /* ======================================================================
     Step 2: one mirror lets light through
     ====================================================================== */

  var STEP2_SLOW = 5e8;     // twice step 1's pace at its start: easy to follow (the owner)
  var STEP2_LENGTH = 0.3;

  function step2Start(through) {
    return { through: through, pos: 0.5, left: 1, history: [1], outs: [], wait: 0 };
  }

  var step2 = {
    view: [150, 700],
    watch: 26,
    captions: [0, 6, 16],
    controls: [{ type: "slider", name: "through", min: 1, max: 50, step: 1 }],
    start: function () {
      return step2Start(0.1);
    },
    update: function (s, dt, env) {
      if (env.t < 1.5 && !env.trying) return;
      var crossing = STEP2_LENGTH / C * STEP2_SLOW;
      var speed = GAP / crossing;
      for (var i = 0; i < s.outs.length; i++) s.outs[i].x += speed * dt;
      s.outs = s.outs.filter(function (o) { return o.x < W + 80; });
      if (s.left < 0.01) {
        // nearly all gone: start again after a moment (only while playing)
        if (env.trying) {
          s.wait += dt;
          if (s.wait > 1.2) {
            var keep = s.through;
            var fresh = step2Start(keep);
            resetTo(s, fresh);
          }
        }
        return;
      }
      var before = Math.floor(s.pos);
      s.pos += dt / crossing;
      var after = Math.floor(s.pos);
      for (var k = before + 1; k <= after; k++) {
        if (k % 2 === 1) {
          // a hit on the right mirror: a part leaves, the rest comes back
          s.outs.push({ x: XR + 40, strength: s.left * s.through });
          s.left *= 1 - s.through;
          s.history.push(s.left);
        }
      }
    },
    draw: function (s, env) {
      var c = colours();
      drawPair(false);
      D.text(env.w("canvas.through", { p: Math.round(s.through * 100) }), XR + 30, 190, { size: 19, color: c.muted });
      if (s.left >= 0.01) {
        var p = pulseAt(s.pos);
        D.packet(p.x, AXIS, p.dir, s.left, c.amber, c.amberRaw);
      }
      for (var i = 0; i < s.outs.length; i++) {
        D.packet(s.outs[i].x, AXIS, 1, Math.min(1, s.outs[i].strength * 4), c.amber, c.amberRaw);
      }
      drawBars(s, env);
    },
    value: function (s) {
      return Math.round(s.through * 100);
    },
    set: function (s, name, v) {
      var fresh = step2Start(v / 100);
      resetTo(s, fresh);
    },
    valueText: function (s, name, env) {
      return env.w("try.throughValue", { p: Math.round(s.through * 100) });
    },
    notes: function (s, env) {
      var half = bouncesUntil(0.5, s.through);
      var tenth = bouncesUntil(0.1, s.through);
      var gone = bouncesUntil(0.01, s.through);
      return [
        env.w("try.half", { n: half }),
        env.w("try.tenth", { n: tenth }),
        env.w("try.gone", { n: gone, t: si(gone * roundTrip(STEP2_LENGTH), "s") })
      ];
    }
  };

  // The bars under the mirrors: how much light is left after each bounce.
  function drawBars(s, env) {
    var c = colours();
    var g = D.context();
    var x0 = 170;
    var x1 = 1110;
    var top = 500;
    var bottom = 680;
    var count = clamp(bouncesUntil(0.01, s.through) + 1, 24, 60);
    var width = (x1 - x0) / count;
    var half = bouncesUntil(0.5, s.through);
    var tenth = bouncesUntil(0.1, s.through);
    g.save();
    g.strokeStyle = c.line;
    g.lineWidth = 1;
    D.line(x0, bottom, x1, bottom);
    g.restore();
    for (var i = 0; i < s.history.length && i < count; i++) {
      var h = (bottom - top) * s.history[i];
      g.save();
      g.globalAlpha = (i === half || i === tenth) ? 1 : 0.6;
      g.fillStyle = c.amber;
      g.fillRect(x0 + i * width + 1, bottom - h, Math.max(1, width - 2), h);
      g.restore();
    }
    var marks = [{ share: 0.5, at: half, key: "canvas.halfLine" }, { share: 0.1, at: tenth, key: "canvas.tenthLine" }];
    for (var m = 0; m < marks.length; m++) {
      var y = bottom - (bottom - top) * marks[m].share;
      D.dashed(x0, y, x1, y, c.muted, 1.2);
      if (s.history.length > marks[m].at && marks[m].at < count) {
        D.text(env.w(marks[m].key, { n: marks[m].at }), Math.min(x0 + (marks[m].at + 0.5) * width + 8, x1 - 340), y - 14,
          { size: 18, color: c.heading, align: "left", weight: "600", maxWidth: 360 });
      }
    }
  }

  /* ======================================================================
     Step 3: a candle between the mirrors
     ====================================================================== */

  var CANDLE_X = 640;
  var FLAME_Y = AXIS - 2;   // the flame's middle sits on the mirrors' line
  var RING_EVERY = 0.45;    // seconds between two rings of light at full flame
  var RING_SPEED = 170;     // px per second
  var RING_REACH = 620;     // px: a ring has faded out by then

  // The candle's light, drawn as rings spreading out from the flame: light
  // leaves a flame in every direction at once. Along the mirrors' line a
  // faint band stays, the little light the mirrors keep sending back.
  var step3 = {
    view: [60, 560],
    watch: 13,
    captions: [0, 4.5, 9.5],
    controls: [
      { type: "button", name: "candle" },
      { type: "slider", name: "flame", min: 0.2, max: 1, step: 0.05 }
    ],
    start: function () {
      return { lit: true, flame: 1, shown: 0, glow: 0, rings: [], due: 0 };
    },
    update: function (s, dt, env) {
      var target = s.lit ? s.flame : 0;
      s.shown += (target - s.shown) * Math.min(1, dt * 6);
      if (env.t < 1.2 && !env.trying) s.shown = 0;
      s.due += dt * s.shown / RING_EVERY;
      while (s.due >= 1) {
        s.rings.push({ r: 0, strength: s.shown });
        s.due -= 1;
      }
      for (var i = 0; i < s.rings.length; i++) s.rings[i].r += RING_SPEED * dt;
      s.rings = s.rings.filter(function (ring) { return ring.r < RING_REACH; });
      // the light leaving through the right mirror follows the flame, and
      // goes almost at once when the candle does
      s.glow += (s.shown - s.glow) * Math.min(1, dt * 12);
    },
    draw: function (s, env) {
      var c = colours();
      var g = D.context();
      var flicker = env.still ? 1 : 0.85 + 0.15 * Math.sin(17 * env.t) * Math.sin(5.3 * env.t);
      // the rings, under everything else
      g.save();
      g.strokeStyle = c.amber;
      g.lineWidth = 3;
      for (var i = 0; i < s.rings.length; i++) {
        var ring = s.rings[i];
        var fade = 1 - ring.r / RING_REACH;
        g.globalAlpha = 0.45 * ring.strength * fade * fade;
        g.beginPath();
        g.arc(CANDLE_X, FLAME_Y, Math.max(1, ring.r + 26), 0, Math.PI * 2);
        g.stroke();
      }
      g.restore();
      // the faint band of light along the mirrors' line
      if (s.glow > 0.01) {
        g.save();
        g.globalAlpha = 0.25 * s.glow * flicker;
        g.fillStyle = c.amberRaw;
        g.fillRect(XL, AXIS - 10, XR - XL, 20);
        g.restore();
      }
      drawPair(false);
      D.candle(CANDLE_X, FLAME_Y, RAIL, s.shown, env.t, env.still);
      // a weak, flickering glow leaving through the right mirror
      D.glow(XR + 80, AXIS, 60, c.amberRaw, 0.55 * s.glow * flicker);
      D.text(env.w("canvas.candle"), CANDLE_X, RAIL + 34, { size: 19, color: c.muted });
      if (s.glow > 0.05) {
        D.text(env.w("canvas.out"), XR + 70, AXIS + 70, { size: 18, color: c.muted, align: "left", maxWidth: 190, alpha: clamp(s.glow * 2, 0, 1) });
      }
      // the last caption: a ring round the place to look closer
      if (!env.trying && env.t > 10) {
        g.save();
        g.globalAlpha = fadeIn(env.t, 10, 0.8);
        g.strokeStyle = c.heading;
        g.lineWidth = 2.5;
        g.setLineDash([8, 6]);
        g.beginPath();
        g.arc(XR + 60, AXIS, 70, 0, Math.PI * 2);
        g.stroke();
        g.restore();
      }
    },
    value: function (s) {
      return s.flame;
    },
    set: function (s, name, v) {
      s.flame = v;
    },
    press: function (s) {
      s.lit = !s.lit;
    },
    buttonWord: function (s) {
      return s.lit ? "try.blowOut" : "try.light";
    },
    valueText: function (s, name, env) {
      return env.w("try.flameValue", { p: Math.round(s.flame * 100) });
    },
    notes: function (s, env) {
      return [s.lit ? env.w("try.litNote") : env.w("try.outNote")];
    }
  };

  /* ======================================================================
     Step 4: a closer look: chaos
     ====================================================================== */

  var NM_PX = 0.3;          // px of the board per nm of wavelength
  var WAVE_SPEED = 120;     // px per second: every wave moves at the speed of light
  var BASE_LAM = 600;       // nm: the first wave's
  var WAVES = 12;

  function randomWaves(random) {
    var list = [];
    for (var i = 0; i < WAVES; i++) {
      list.push({ lam: 420 + random() * 280, phase: random() * Math.PI * 2 });
    }
    return list;
  }

  function waveColour(lam) {
    var c = colours();
    var M = global.LaserUI.materials;
    return M.readable(M.beam(lam * 1e-9).color, c.bg);
  }

  function waveY(x, lam, phase, shift) {
    return Math.sin(2 * Math.PI * (x - shift) / (lam * NM_PX) + phase);
  }

  // The words for two waves: in step, cancelling, or neither.
  function twoWaves(lam2, phaseDeg) {
    var sameColour = Math.abs(lam2 - BASE_LAM) < 3;
    var p = ((phaseDeg % 360) + 360) % 360;
    if (sameColour && (p < 20 || p > 340)) return "inStep";
    if (sameColour && Math.abs(p - 180) < 20) return "cancel";
    if (sameColour) return "partly";
    return "colours";
  }

  var step4 = {
    view: [20, 715],
    watch: 25,
    captions: [0, 8, 15, 20],
    controls: [
      { type: "slider", name: "lam", min: 420, max: 700, step: 5 },
      { type: "slider", name: "phase", min: 0, max: 360, step: 5 }
    ],
    start: function (env) {
      return { mode: "two", lam2: BASE_LAM, phase2: 0, waves: randomWaves(env.random), shift: 0 };
    },
    // the playing part: two waves, starting in step
    toTry: function (s) {
      s.mode = "two";
      s.lam2 = BASE_LAM;
      s.phase2 = 0;
    },
    update: function (s, dt, env) {
      s.shift += WAVE_SPEED * dt;
      if (!env.trying) {
        // the watching part: two waves in step, then cancelling, then of
        // two colours; then all twelve
        var t = env.t;
        if (t < 8) s.mode = "many";
        else if (t < 15) {
          s.mode = "two";
          s.lam2 = BASE_LAM;
          s.phase2 = t < 10.5 ? 0 : 180 * fadeIn(t, 10.5, 1.5);
          if (t > 13) s.lam2 = BASE_LAM - 140 * fadeIn(t, 13, 1);
        } else s.mode = "many";
      }
    },
    draw: function (s, env) {
      var c = colours();
      var g = D.context();
      var x0 = 50;
      var x1 = 1230;
      var open = env.trying ? 1 : fadeIn(env.t, 0, 3);
      g.save();
      // the magnifier opening from the edge of the right mirror
      if (open < 1) {
        g.beginPath();
        g.arc(lerp(1100, W / 2, open), lerp(AXIS, H / 2, open), 40 + open * 760, 0, Math.PI * 2);
        g.clip();
      }
      g.fillStyle = c.bg;
      g.fillRect(0, 0, W, H);
      var sumTop = 450;
      var sumMid = 570;
      D.text(env.w("canvas.waves"), x0, 50, { size: 24, color: c.muted, align: "left" });
      D.text(env.w("canvas.sum"), x0, sumTop - 18, { size: 24, color: c.muted, align: "left" });
      g.save();
      g.strokeStyle = c.line;
      g.lineWidth = 1;
      D.line(x0, sumMid, x1, sumMid);
      g.restore();
      var points = [];
      var x;
      if (s.mode === "two") {
        D.wave(x0, x1, 150, 62, BASE_LAM * NM_PX, 0, s.shift, waveColour(BASE_LAM), 4.5);
        D.wave(x0, x1, 310, 62, s.lam2 * NM_PX, s.phase2 * Math.PI / 180, s.shift, waveColour(s.lam2), 4.5);
        for (x = x0; x <= x1; x += 3) {
          var sum = waveY(x - x0, BASE_LAM, 0, s.shift) + waveY(x - x0, s.lam2, s.phase2 * Math.PI / 180, s.shift);
          points.push({ x: x, y: sumMid - 62 * sum });
        }
        D.curve(points, c.heading, 4.5);
        var verdict = twoWaves(s.lam2, s.phase2);
        D.tag(env.w("canvas." + verdict), 1040, sumTop - 24, { width: 360 });
      } else {
        for (var i = 0; i < s.waves.length; i++) {
          var wv = s.waves[i];
          D.wave(x0, x1, 240, 110, wv.lam * NM_PX, wv.phase, s.shift, waveColour(wv.lam), 3, 0.55);
        }
        for (x = x0; x <= x1; x += 3) {
          var total = 0;
          for (var k = 0; k < s.waves.length; k++) total += waveY(x - x0, s.waves[k].lam, s.waves[k].phase, s.shift);
          points.push({ x: x, y: sumMid - 130 * total / s.waves.length });
        }
        D.curve(points, c.heading, 4.5);
      }
      // the three things the light would need, at the end of the watching part
      if (!env.trying && env.t > 20) {
        var keys = ["canvas.mono", "canvas.coherent", "canvas.direction"];
        for (var n = 0; n < keys.length; n++) {
          D.tag(env.w(keys[n]), 240 + n * 400, 690, { width: 380, alpha: fadeIn(env.t, 20.5 + n * 0.8, 0.6) });
        }
      }
      g.restore();
    },
    value: function (s, name) {
      return name === "lam" ? s.lam2 : s.phase2;
    },
    set: function (s, name, v) {
      s.mode = "two";
      if (name === "lam") s.lam2 = v;
      else s.phase2 = v;
    },
    valueText: function (s, name, env) {
      if (name === "lam") return env.w("try.lamValue", { lam: si(s.lam2 * 1e-9, "m") });
      return env.w("try.phaseValue", { deg: s.phase2 });
    },
    notes: function (s, env) {
      return [env.w("try.twoNote")];
    }
  };

  function lerp(a, b, f) {
    return a + (b - a) * f;
  }

  /* ======================================================================
     Step 5: an atom on its own
     ====================================================================== */

  var ATOM_SPEED = 260;     // px per second, a photon's

  function gridAtoms() {
    var atoms = [];
    for (var row = 0; row < 3; row++) {
      for (var col = 0; col < 4; col++) {
        atoms.push({ x: 400 + col * 160 + (row % 2) * 40, y: 200 + row * 140, up: false, wait: 0, glow: 0 });
      }
    }
    return atoms;
  }

  function excite(a, random) {
    if (a.up) return;
    a.up = true;
    a.wait = 0.6 + random() * 2.4;
  }

  function sendStray(s, a, angle) {
    s.photons.push({ x: a.x, y: a.y, dx: Math.cos(angle), dy: Math.sin(angle), laser: true, stray: true });
    s.sent += 1;
  }

  var ONE = { x: 470, y: 330 };
  var LEVEL_X0 = 780;
  var LEVEL_X1 = 1060;
  var LEVEL_UP = 220;
  var LEVEL_DOWN = 450;

  var step5 = {
    view: [110, 690],
    watch: 16,
    captions: [0, 4, 9.5],
    controls: [{ type: "button", name: "all" }],
    start: function () {
      return {
        one: { x: ONE.x, y: ONE.y, up: false, glow: 0 },
        atoms: gridAtoms(),
        photons: [],
        events: 0,
        sent: 0,
        grid: false
      };
    },
    update: function (s, dt, env) {
      var t = env.t;
      // the watching part's single atom: lit by a lamp's photon, falling
      // back by itself, twice; then the grid, all excited at once
      if (!env.trying && !s.grid) {
        var script = [
          { at: 0.5, what: "in" }, { at: 2.4, what: "up" }, { at: 4.6, what: "down", angle: 2.3 },
          { at: 5.4, what: "in" }, { at: 7.3, what: "up" }, { at: 8.6, what: "down", angle: -0.8 }
        ];
        while (s.events < script.length && t >= script[s.events].at) {
          var e = script[s.events];
          if (e.what === "in") s.photons.push({ x: 90, y: ONE.y, dx: 1, dy: 0, laser: false, stopAt: ONE.x - 22 });
          if (e.what === "up") s.one.up = true;
          if (e.what === "down") {
            s.one.up = false;
            sendStray(s, s.one, e.angle);
          }
          s.events += 1;
        }
        if (t >= 9.5) {
          s.grid = true;
          s.photons = [];
        }
      }
      if (env.trying) s.grid = true;
      if (s.grid && !env.trying && t >= 10 && !s.allDone) {
        for (var i = 0; i < s.atoms.length; i++) excite(s.atoms[i], env.random);
        s.allDone = true;
      }
      s.one.glow += ((s.one.up ? 1 : 0) - s.one.glow) * Math.min(1, dt * 8);
      for (var a = 0; a < s.atoms.length; a++) {
        var atom = s.atoms[a];
        if (atom.up) {
          atom.wait -= dt;
          if (atom.wait <= 0) {
            atom.up = false;
            sendStray(s, atom, env.random() * Math.PI * 2);
          }
        }
        atom.glow += ((atom.up ? 1 : 0) - atom.glow) * Math.min(1, dt * 8);
      }
      for (var p = 0; p < s.photons.length; p++) {
        var ph = s.photons[p];
        ph.x += ph.dx * ATOM_SPEED * dt;
        ph.y += ph.dy * ATOM_SPEED * dt;
        if (ph.stopAt && ph.x >= ph.stopAt) ph.gone = true;
      }
      s.photons = s.photons.filter(function (q) {
        return !q.gone && q.x > -40 && q.x < W + 40 && q.y > -40 && q.y < H + 40;
      });
    },
    draw: function (s, env) {
      var c = colours();
      var i;
      if (!s.grid) {
        D.atom(s.one.x, s.one.y, s.one.glow, 24);
        // its two levels, with a dot on the one it is on
        var g = D.context();
        g.save();
        g.strokeStyle = c.heading;
        g.lineWidth = 3;
        D.line(LEVEL_X0, LEVEL_UP, LEVEL_X1, LEVEL_UP);
        D.line(LEVEL_X0, LEVEL_DOWN, LEVEL_X1, LEVEL_DOWN);
        g.restore();
        D.text(env.w("canvas.high"), LEVEL_X1 + 12, LEVEL_UP, { size: 19, align: "left", color: c.muted, maxWidth: 200 });
        D.text(env.w("canvas.low"), LEVEL_X1 + 12, LEVEL_DOWN, { size: 19, align: "left", color: c.muted, maxWidth: 200 });
        var y = lerp(LEVEL_DOWN, LEVEL_UP, s.one.glow);
        D.atom((LEVEL_X0 + LEVEL_X1) / 2, y - 14, s.one.glow, 12);
      } else {
        for (i = 0; i < s.atoms.length; i++) D.atom(s.atoms[i].x, s.atoms[i].y, s.atoms[i].glow, 22);
      }
      for (i = 0; i < s.photons.length; i++) {
        var p = s.photons[i];
        D.photon(p.x, p.y, p.dx, p.dy, p.laser ? c.beam : c.amber, 1, 1, p.stray);
      }
      if (s.grid && env.trying) {
        D.text(env.w("canvas.click"), W / 2, 660, { size: 20, color: c.muted, maxWidth: 1000 });
      }
    },
    // the playing part counts its own photons
    toTry: function (s) {
      s.sent = 0;
      s.photons = [];   // the lone atom's, if its part was skipped
    },
    press: function (s, name, env) {
      for (var i = 0; i < s.atoms.length; i++) excite(s.atoms[i], env.random);
    },
    pointer: function (s, x, y, env) {
      for (var i = 0; i < s.atoms.length; i++) {
        var a = s.atoms[i];
        if ((x - a.x) * (x - a.x) + (y - a.y) * (y - a.y) < 36 * 36) {
          excite(a, env.random);
          return true;
        }
      }
      return false;
    },
    notes: function (s, env) {
      return [env.w("try.sent", { n: s.sent })];
    }
  };

  /* ======================================================================
     Step 6: the twin photon
     ====================================================================== */

  var ROW = 10;
  var CRYSTAL = { x: 240, y: AXIS - 80, w: 800, h: 160 };
  var ROW_X0 = 290;
  var ROW_STEP = 78;
  var GROUP_SPEED = 230;

  function rowState(up) {
    var atoms = [];
    for (var i = 0; i < ROW; i++) atoms.push(isUp(i, up, ROW));
    return { atoms: atoms, x: null, n: 0, next: 0, out: null };
  }

  function sendGroup(row) {
    row.x = 120;
    row.n = 1;
    row.next = 0;
    row.out = null;
  }

  function moveGroup(row, dt) {
    if (row.x === null) return;
    row.x += GROUP_SPEED * dt;
    while (row.next < ROW && row.x >= ROW_X0 + row.next * ROW_STEP) {
      var i = row.next;
      if (row.n > 0) {
        if (row.atoms[i]) {
          row.atoms[i] = false;
          row.n += 1;
        } else {
          row.atoms[i] = true;
          row.n -= 1;
        }
      }
      row.next += 1;
    }
    if (row.next >= ROW && row.out === null) row.out = row.n;
    if (row.x > W + 60) row.x = null;
  }

  function drawGroup(row, colour, y) {
    if (row.x === null || row.n <= 0) return;
    var spacing = Math.min(14, 140 / row.n);
    for (var k = 0; k < row.n; k++) {
      D.photon(row.x, y + (k - (row.n - 1) / 2) * spacing, 1, 0, colour);
    }
  }

  var step6 = {
    view: [110, 470],
    watch: 21,
    captions: [0, 7.5, 14],
    controls: [
      { type: "slider", name: "up", min: 0, max: 10, step: 1 },
      { type: "button", name: "send" }
    ],
    start: function () {
      return {
        up: 7,
        lone: { up: true, glow: 1, x: null, twin: false },
        row: null,
        part: "lone"
      };
    },
    update: function (s, dt, env) {
      var t = env.t;
      if (!env.trying) {
        if (t < 7.5) {
          s.part = "lone";
          if (t >= 1 && s.lone.x === null) s.lone.x = 80;
        } else if (t < 14) {
          if (s.part !== "few") {
            s.part = "few";
            s.row = rowState(2);
          }
          if (t >= 8.3 && s.row.x === null && s.row.out === null) sendGroup(s.row);
        } else {
          if (s.part !== "many") {
            s.part = "many";
            s.row = rowState(9);
          }
          if (t >= 14.8 && s.row.x === null && s.row.out === null) sendGroup(s.row);
        }
      } else if (s.part !== "try") {
        s.part = "try";
        s.row = rowState(s.up);
      }
      if (s.part === "lone" && s.lone.x !== null) {
        s.lone.x += GROUP_SPEED * dt;
        if (s.lone.x >= 640 && s.lone.up) {
          s.lone.up = false;
          s.lone.twin = true;
        }
        s.lone.glow += ((s.lone.up ? 1 : 0) - s.lone.glow) * Math.min(1, dt * 8);
      }
      if (s.row) moveGroup(s.row, dt);
    },
    draw: function (s, env) {
      var c = colours();
      if (s.part === "lone") {
        D.atom(640, AXIS, s.lone.glow, 28);
        if (s.lone.x !== null && s.lone.x < W + 40) {
          D.photon(s.lone.x, AXIS - (s.lone.twin ? 26 : 0), 1, 0, c.beam, 1, 1.8);
          if (s.lone.twin) D.photon(s.lone.x, AXIS + 26, 1, 0, c.beam, 1, 1.8);
        }
        if (s.lone.twin) D.tag(env.w("canvas.twin"), 640, 430, { width: 420, alpha: 1 });
        else D.text(env.w("canvas.waiting"), 640, 380, { size: 19, color: c.muted });
        return;
      }
      D.ruby(CRYSTAL, 0);
      for (var i = 0; i < ROW; i++) {
        D.atom(ROW_X0 + i * ROW_STEP, AXIS, s.row.atoms[i] ? 1 : 0, 18);
      }
      drawGroup(s.row, c.beam, AXIS);
      var up = 0;
      for (var k = 0; k < ROW; k++) if (s.row.atoms[k]) up += 1;
      var label = s.part === "few" ? "canvas.fewUp" : s.part === "many" ? "canvas.manyUp" : null;
      if (label) D.tag(env.w(label), 640, 140, { width: 620 });
      if (s.row.out !== null) {
        D.text(env.w("canvas.out", { n: s.row.out }), 1160, AXIS + 120, { size: 20, color: c.heading, weight: "600", maxWidth: 220 });
      }
      D.text(env.w("canvas.crystal"), 640, CRYSTAL.y + CRYSTAL.h + 30, { size: 19, color: c.muted });
      if (env.trying && s.row.x === null) {
        D.text(env.w("canvas.upNow", { n: up, total: ROW }), 640, 140, { size: 20, color: c.muted });
      }
    },
    value: function (s) {
      return s.up;
    },
    set: function (s, name, v) {
      s.up = v;
      s.row = rowState(v);
    },
    press: function (s) {
      s.row = rowState(s.up);
      sendGroup(s.row);
    },
    valueText: function (s, name, env) {
      return env.w("try.upValue", { n: s.up, total: ROW });
    },
    notes: function (s, env) {
      var out = passRow(s.up, ROW, 1)[ROW - 1];
      return [env.w("try.inOut", { n: out })];
    }
  };

  /* ======================================================================
     Step 7: the laser
     ====================================================================== */

  var L7 = {
    candleX: 110,
    lensX: 250,
    left: { x: 340, y: AXIS - 70, w: 22, h: 140 },
    right: { x: 920, y: AXIS - 70, w: 22, h: 140 },
    rod: { x: 430, y: AXIS - 34, w: 420, h: 68 },
    lamp: { x: 450, y: AXIS + 74, w: 380, h: 22, cap: 12 }
  };

  function step7Start(pump, bright) {
    return {
      pump: pump, bright: bright, light: 0, clock: 0, carry: 0, gain: 0, level: 0, peak: 0, lightPeak: 0, peakAge: 0,
      lastPeak: 0, lastLightPeak: 0,
      atoms: [false, false, false, false, false, false, false, false],
      dark: [0, 0, 0, 0, 0, 0, 0, 0],   // seconds until a used atom may glow again
      packet: null,                      // the photons between the mirrors
      leaving: [],                       // photons gone out through the right mirror
      wait: 0
    };
  }

  /* The photons between the mirrors, drawn as a group running back and
     forth (an illustration, much slower than real light). Passing a
     glowing atom, the group gains a twin and the atom goes dark: it gave
     its energy away. At the right mirror a tenth of them leave (carried
     over as a fraction, so 10 photons lose one each time). How many
     there may be follows the round-trip model of the gauge (`light`), so
     the picture and the notes agree; the candle's few atoms give a few
     twins, which then leak out, because it cannot light the atoms again
     in time. */
  var ATOMS7 = 8;
  var PACKET_SPEED = 330;   // px per second
  var PACKET_MAX = 24;      // the most photons drawn
  var CANDLE_MAX = 4;       // a candle's atoms give at most a few twins
  var RELIGHT = 0.35;       // seconds a used atom stays dark under the lamp, at full brightness

  function atomX(a) {
    return L7.rod.x + 35 + a * 50;
  }

  function packetLeft() {
    return L7.left.x + L7.left.w + 10;
  }

  function packetRight() {
    return L7.right.x - 10;
  }

  // How many photons the model allows now.
  function packetRoom(s) {
    if (s.pump === "candle") return CANDLE_MAX;
    return clamp(1 + Math.round(PACKET_MAX * s.light / 1.5), 1, PACKET_MAX);
  }

  function movePacket(s, dt, excited) {
    var lampOn = s.pump === "lamp" && s.level > 0.05;
    // the atoms the pump keeps up: the lamp lights them again soon after
    // they give a twin; the candle only while no photons are running
    for (var a = 0; a < ATOMS7; a++) {
      var wanted = a / ATOMS7 < excited;
      if (s.dark[a] > 0) s.dark[a] = Math.max(0, s.dark[a] - dt);
      if (!s.packet && s.pump === "candle") s.dark[a] = 0;   // the candle had time again
      if (!wanted) s.atoms[a] = false;
      else if (s.dark[a] === 0 && (lampOn || !s.packet)) s.atoms[a] = true;
    }
    for (var i = 0; i < s.leaving.length; i++) s.leaving[i].x += PACKET_SPEED * dt;
    s.leaving = s.leaving.filter(function (p) { return p.x < W + 40; });
    var p = s.packet;
    if (!p) return;
    var from = p.x;
    p.x += p.dir * PACKET_SPEED * dt;
    var lo = Math.min(from, p.x);
    var hi = Math.max(from, p.x);
    var room = packetRoom(s);
    for (var b = 0; b < ATOMS7; b++) {
      var x = atomX(b);
      if (x > lo && x <= hi && s.atoms[b] && p.n < room) {
        p.n += 1;                       // a twin
        s.atoms[b] = false;
        s.dark[b] = s.pump === "lamp" ? RELIGHT / Math.max(s.level, 0.05) : 1e9;
        p.twinAt = b;
        p.twinAge = 0;
      }
    }
    p.twinAge += dt;
    if (p.x >= packetRight()) {
      p.x = packetRight();
      p.dir = -1;
      p.loss += 0.1 * p.n;              // the right mirror lets a tenth out
      var out = Math.floor(p.loss);
      if (s.pump === "lamp") out = Math.max(out, p.n - room);
      out = Math.min(out, p.n);
      p.loss -= Math.floor(p.loss);
      for (var k = 0; k < out; k++) s.leaving.push({ x: L7.right.x + L7.right.w + 6, y: AXIS + (k - (out - 1) / 2) * 8 });
      p.n -= out;
      if (p.n <= 0) s.packet = null;
    } else if (p.x <= packetLeft()) {
      p.x = packetLeft();
      p.dir = 1;
    }
  }

  // The share of the ruby's atoms the pump keeps up (as many glow).
  function excitedShare(s) {
    return clamp(s.gain / 0.4 + clamp(s.level, 0, 1) * 0.3, 0, 1);
  }

  // One photon an atom sent by itself along the axis: the start of it all.
  function sendPacket(s) {
    s.packet = { x: atomX(0), dir: 1, n: 1, loss: 0, twinAt: null, twinAge: 9 };
  }

  function drawPacket(s, env, alpha) {
    var c = colours();
    var p = s.packet;
    if (p) {
      var spacing = Math.min(9, 56 / p.n);
      for (var k = 0; k < p.n; k++) {
        D.photon(p.x, AXIS + (k - (p.n - 1) / 2) * spacing, p.dir, 0, c.beam, alpha);
      }
      // a flash on the atom that just gave a twin
      if (p.twinAt !== null && p.twinAge < 0.5) {
        D.glow(atomX(p.twinAt), AXIS + (p.twinAt % 2 ? 14 : -14), 26, c.beam, alpha * (1 - p.twinAge / 0.5));
      }
    }
    for (var i = 0; i < s.leaving.length; i++) {
      D.photon(s.leaving[i].x, s.leaving[i].y, 1, 0, c.beam, alpha * 0.8);
    }
  }

  var step7 = {
    view: [60, 550],
    watch: 24,
    captions: [0, 8, 15],
    controls: [
      { type: "choice", name: "pump", options: ["candle", "lamp"] },
      { type: "slider", name: "bright", min: 0, max: 1, step: 0.05 }
    ],
    start: function () {
      return step7Start("candle", 1);
    },
    update: function (s, dt, env) {
      s.clock += dt;
      var on = env.trying || env.t > 3;
      s.level = on ? pumpNow(s.pump, s.bright, s.clock) : 0;
      s.gain = gainOf(s.pump, s.level);
      s.carry += dt * ROUNDS;
      while (s.carry >= 1) {
        s.light = roundTripLight(s.light, s.gain);
        s.carry -= 1;
      }
      // the most added in the last flash (or now, for the candle)
      // and the most light between the mirrors in that time
      s.peakAge += dt;
      if (s.peakAge > FLASH_EVERY) {
        // keep the flash just over for the notes: the new one starts dark
        s.lastPeak = s.peak;
        s.lastLightPeak = s.lightPeak;
        s.peak = 0;
        s.lightPeak = 0;
        s.peakAge -= FLASH_EVERY;   // not 0: stays in time with the flashes
      }
      s.peak = Math.max(s.peak, s.gain);
      s.lightPeak = Math.max(s.lightPeak, s.light);
      // the photons between the mirrors: the first sets off in the
      // watching part at 9 s; later, a new one a moment after the last
      // has gone (while the pump is on)
      movePacket(s, dt, excitedShare(s));
      if (!s.packet && on && (env.trying || env.t > 9)) {
        s.wait += dt;
        if (s.wait > (env.trying ? 1.5 : 0)) {
          s.wait = 0;
          sendPacket(s);
        }
      }
    },
    draw: function (s, env) {
      var c = colours();
      var g = D.context();
      var lamp = s.pump === "lamp";
      var show = env.trying ? 1 : fadeIn(env.t, 0, 1.5);
      g.save();
      g.globalAlpha = show;
      D.rail(60, 1000, RAIL);
      if (!lamp) D.post(L7.lensX, AXIS + 60, RAIL);
      D.post(L7.left.x + 11, L7.left.y + L7.left.h + 4, RAIL);
      D.post(L7.right.x + 11, L7.right.y + L7.right.h + 4, RAIL);
      D.post(L7.rod.x + 30, L7.rod.y + L7.rod.h, RAIL);
      D.post(L7.rod.x + L7.rod.w - 30, L7.rod.y + L7.rod.h, RAIL);

      // the pump's light
      var lit = clamp(s.level, 0, 1);
      if (!lamp) {
        // candle light through the lens: spreading before it, parallel after
        if (lit > 0.01) {
          g.save();
          g.strokeStyle = c.amber;
          g.lineWidth = 2;
          g.globalAlpha = 0.6 * lit;
          // from the focus the rays spread to the lens and leave it parallel
          var ys = [-30, -15, 0, 15, 30];
          for (var r = 0; r < ys.length; r++) {
            D.line(L7.candleX, AXIS, L7.lensX, AXIS + ys[r]);
            D.line(L7.lensX, AXIS + ys[r], L7.rod.x + L7.rod.w, AXIS + ys[r]);
          }
          g.restore();
        }
      } else {
        D.flashlamp(L7.lamp, lit, env.still ? 0 : s.clock, L7.rod);
      }
      D.ruby(L7.rod, lit * 0.8, lamp ? c.flash : c.amberRaw);
      // atoms in the ruby: the pump lights them, a twin puts one out
      for (var a = 0; a < ATOMS7; a++) {
        D.atom(atomX(a), AXIS + (a % 2 ? 14 : -14), s.atoms[a] ? 0.9 : 0, 8);
      }
      D.mirror(L7.left, true, true, AXIS, 46);
      D.mirror(L7.right, false, false, AXIS, 30);
      if (!lamp) {
        // the flame's middle on the axis, one focal length from the lens
        // (step 3's candle stands 16 px higher, its flame among the rays)
        D.candle(L7.candleX, AXIS, RAIL, env.trying || env.t > 3 ? s.bright : 0, env.t, env.still);
        D.lens(L7.lensX, AXIS, 130);
        // the focal length: the candle sits one focal length from the lens
        D.dashed(L7.candleX, AXIS - 110, L7.candleX, AXIS - 60, c.muted, 1.2);
        D.text("F", L7.candleX, AXIS - 124, { size: 20, color: c.heading, weight: "600" });
        g.save();
        g.strokeStyle = c.muted;
        g.lineWidth = 1.2;
        D.line(L7.candleX, AXIS - 90, L7.lensX, AXIS - 90);
        g.restore();
        D.text(env.w("canvas.focal"), (L7.candleX + L7.lensX) / 2, AXIS - 108, { size: 16, color: c.muted, maxWidth: 150 });
      }

      // the laser light between the mirrors, and the beam out
      var strength = clamp(s.light / 2, 0, 1);
      if (strength > 0.01) {
        g.save();
        g.globalAlpha = 0.25 + 0.6 * strength;
        g.strokeStyle = c.beam;
        g.lineWidth = 2 + 6 * strength;
        D.line(L7.left.x + L7.left.w, AXIS, L7.right.x, AXIS);
        g.globalAlpha = strength;
        D.line(L7.right.x + L7.right.w, AXIS, W, AXIS);
        g.restore();
        D.glow(W - 80, AXIS, 60, c.beam, 0.4 * strength);
      }
      g.restore();
      drawPacket(s, env, show);

      // the gauge: added in one round trip against let out
      if (env.trying || env.t > 15) {
        drawGauge(s, env, env.trying ? 1 : fadeIn(env.t, 15, 0.8));
      }
      // the labels of the parts, in the watching part
      if (!env.trying && env.t < 15) {
        var la = fadeIn(env.t, 1, 1) * (1 - fadeIn(env.t, 13.5, 1));
        D.text(env.w("canvas.leftMirror"), L7.left.x + 11, L7.left.y - 30, { size: 17, color: c.heading, alpha: la, maxWidth: 260 });
        D.text(env.w("canvas.rightMirror"), L7.right.x + 11, L7.right.y - 30, { size: 17, color: c.heading, alpha: la, maxWidth: 260 });
        D.text(env.w("canvas.medium"), L7.rod.x + L7.rod.w / 2, RAIL + 30, { size: 18, color: c.muted, alpha: la });
      }
      if (lamp) D.text(env.w("canvas.lamp"), L7.lamp.x + L7.lamp.w / 2, RAIL + 30, { size: 18, color: c.muted });
      if (env.trying && s.light >= BEAM_SHOWN) {
        D.tag(env.w("canvas.beam"), 1100, AXIS + 90, { width: 220, border: c.beam });
        D.text(env.w("canvas.beamIs"), 1000, RAIL + 60, { size: 18, color: c.heading, maxWidth: 540 });
        // the waves of the beam, all the same and in step
        for (var n = 0; n < 3; n++) {
          D.wave(960, 1270, AXIS - 120 + n * 26, 9, 60, 0, s.clock * 120, c.beam, 2, 0.8);
        }
      }
    },
    value: function (s) {
      return s.bright;
    },
    set: function (s, name, v) {
      if (name === "pump") {
        var fresh = step7Start(v, s.bright);
        resetTo(s, fresh);
      } else {
        s.bright = v;
      }
    },
    pressed: function (s, name, option) {
      return s.pump === option;
    },
    valueText: function (s, name, env) {
      return env.w("try.brightValue", { p: Math.round(s.bright * 100) });
    },
    notes: function (s, env) {
      // this flash or the one just over, whichever was stronger
      var peak = Math.max(s.peak, s.lastPeak);
      var lightPeak = Math.max(s.lightPeak, s.lastLightPeak);
      var lines = [env.w("try.gauge", { p: Math.round(peak * 100), out: Math.round(LETS_OUT * 100) })];
      if (s.pump === "candle") lines.push(env.w("try.tooWeak"));
      else if (lightPeak >= BEAM_SHOWN) lines.push(env.w("try.lasing"));
      else if (peak > LETS_OUT) lines.push(env.w("try.weak"));
      else lines.push(env.w("try.below"));
      return lines;
    }
  };

  function drawGauge(s, env, alpha) {
    var c = colours();
    var g = D.context();
    var x0 = 430;
    var x1 = 850;
    var full = 0.4;
    var y = 90;
    g.save();
    g.globalAlpha = alpha;
    g.strokeStyle = c.line;
    g.lineWidth = 1.2;
    g.strokeRect(x0, y, x1 - x0, 26);
    g.strokeRect(x0, y + 56, x1 - x0, 26);
    g.fillStyle = c.accent;
    g.fillRect(x0, y, (x1 - x0) * clamp(s.gain / full, 0, 1), 26);
    g.fillStyle = c.muted;
    g.fillRect(x0, y + 56, (x1 - x0) * LETS_OUT / full, 26);
    var mark = x0 + (x1 - x0) * LETS_OUT / full;
    g.restore();
    D.dashed(mark, y - 8, mark, y + 90, c.heading, 1.5);
    D.text(env.w("canvas.added", { p: Math.round(s.gain * 100) }), x0 - 12, y + 13, { size: 17, align: "right", color: c.heading, alpha: alpha, maxWidth: 330 });
    D.text(env.w("canvas.lost", { p: Math.round(LETS_OUT * 100) }), x0 - 12, y + 69, { size: 17, align: "right", color: c.heading, alpha: alpha, maxWidth: 330 });
  }

  /* ======================================================================
     Step 8: your turn
     ====================================================================== */

  var step8 = {
    view: [110, 620],
    watch: 6,
    captions: [0],
    controls: [{ type: "button", name: "open", close: true }],
    start: function () {
      return {};
    },
    update: function () {},
    draw: function (s, env) {
      var c = colours();
      var g = D.context();
      var t = env.trying ? 10 : env.t;
      var reach = lerp(0, W, fadeIn(t, 0, 1.2));
      g.save();
      g.strokeStyle = c.beam;
      g.lineWidth = 5;
      D.line(0, 150, reach, 150);
      g.restore();
      D.text(env.page("page.title"), W / 2, 250, { size: 46, color: c.heading, weight: "600", alpha: fadeIn(t, 1, 1), maxWidth: 1100 });
      D.text(env.w("canvas.question"), W / 2, 315, { size: 26, color: c.muted, alpha: fadeIn(t, 1.4, 1), maxWidth: 1100 });
      for (var i = 0; i < 3; i++) {
        D.text(env.w("canvas.point" + (i + 1)), W / 2, 420 + i * 60, { size: 25, color: c.text, alpha: fadeIn(t, 2.2 + i * 0.9, 0.8), maxWidth: 1100 });
      }
    },
    press: function () {}
  };

  LaserIntro.physics = physics;
  LaserIntro.steps = Object.freeze([step1, step2, step3, step4, step5, step6, step7, step8]);
})(this);
