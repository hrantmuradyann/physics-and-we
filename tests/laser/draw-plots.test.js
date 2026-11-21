/* ============================================================================
   draw-plots.test.js — js/laser/ui/draw-plots.js: the chart of a quantity
   against time, drawn like a measuring instrument's (docs/laser-plan.md,
   stage 6b). The page uses it for the output power; these tests also draw
   a plain number against time (an inversion over its threshold, as the
   page did until stage 7c), so nothing in it is tied to watts.

   The chart only draws what it is given: points { t, P, y } in simulated
   seconds, W and units of the threshold. What these tests pin is that
   every mark stands exactly where its number says: ticks at round values,
   the curve on the axes' scales, the tag at the latest value, the
   crosshair on the nearest point.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { deepFreeze, assertClose } = require("./helpers.js");
const { createBrowser } = require("./fake-browser.js");
const { WIDTHS, heightFor, makeView, commonDrawingTests } = require("./draw-helpers.js");

const browser = createBrowser();
for (const file of ["loop.js", "format.js", "axis.js", "draw-plots.js"]) browser.load("js/laser/ui/" + file);
const UI = browser.window.LaserUI;
const PLOTS = UI.plots;
const NB = " ";

// 400 points over 1.2 windows (some older than the window), a steady
// 1.7 W with one spike to 8.5 W, the inversion wobbling around 1.
function spikyPoints(tNow, shownTime) {
  const points = [];
  for (let i = 0; i <= 400; i++) {
    const t = tNow - shownTime * 1.2 + (i / 400) * shownTime * 1.2;
    const spike = (t - tNow + 0.6 * shownTime) / (0.02 * shownTime);
    points.push({ t: t, P: 1.7 * (1 + 4 * Math.exp(-spike * spike)), y: 1 + 0.3 * Math.sin(i) });
  }
  return points;
}

function powerChart(changes) {
  return Object.assign({
    points: spikyPoints(2.5e-3, 5e-4), key: "P", tNow: 2.5e-3, shownTime: 5e-4, floor: 0.74,
    unit: "W", title: "Output power", color: "accent",
    lines: [{ value: 1.7, word: "steady", tone: "soft" }], cursor: null
  }, changes || {});
}

function inversionChart(changes) {
  return Object.assign({
    points: spikyPoints(2.5e-3, 5e-4), key: "y", tNow: 2.5e-3, shownTime: 5e-4, floor: 1,
    unit: "", title: "Inversion ÷ threshold", color: "accent2",
    lines: [{ value: 1, word: "threshold", tone: "soft" }, { value: 3.3, word: "", tone: "faint" }], cursor: null
  }, changes || {});
}

const CHARTS = [
  powerChart(),
  powerChart({ cursor: 200 }),
  powerChart({ points: [] }),
  powerChart({ points: [{ t: 2.5e-3, P: 0, y: 0 }] }),
  powerChart({ points: spikyPoints(2.5e-3, 5e-4).map((p) => ({ t: p.t, P: 1e-8, y: 0.4 })), lines: [] }),
  powerChart({ tNow: 1e-4, points: [{ t: 0, P: 3e-20, y: 0 }, { t: 1e-4, P: 1e-9, y: 0.2 }] }),   // just started
  powerChart({ title: "", lines: [{ value: 1.7, word: "", tone: "soft" }] }),
  inversionChart(),
  inversionChart({ cursor: 60 }),
  inversionChart({ lines: [{ value: 1, word: "threshold", tone: "soft" }, { value: 0, word: "", tone: "faint" }] })
];

function drawChart(chart, w, size, options) {
  const made = makeView(UI, size || PLOTS.SIZE, w || 600, options);
  PLOTS.draw(made.view, deepFreeze(chart));
  return made;
}

// The geometry the chart must follow, from its own layout and scale.
function geometry(chart, view) {
  const L = PLOTS.layout(view.w, view.h);
  const S = PLOTS.scale(chart);
  const P = L.plot;
  return {
    L: L, S: S, P: P,
    xOf: (t) => P.right - (chart.tNow - t) / chart.shownTime * (P.right - P.left),
    yOf: (v) => P.bottom - v / S.value.top * (P.bottom - P.top)
  };
}

function texts(recorder) {
  return recorder.calls.filter((c) => c.name === "fillText");
}

// A straight line drawn from (x1, y1) to (x2, y2): a moveTo then a lineTo.
function hasLine(recorder, x1, y1, x2, y2) {
  return recorder.calls.some((c, i) => c.name === "moveTo" &&
    Math.abs(c.args[0] - x1) < 1e-6 && Math.abs(c.args[1] - y1) < 1e-6 &&
    recorder.calls[i + 1] && recorder.calls[i + 1].name === "lineTo" &&
    Math.abs(recorder.calls[i + 1].args[0] - x2) < 1e-6 && Math.abs(recorder.calls[i + 1].args[1] - y2) < 1e-6);
}

test("loads frozen, with the canvas size the page uses", () => {
  assert.ok(Object.isFrozen(PLOTS));
  assert.ok(Object.isFrozen(PLOTS.SIZE));
  assert.ok(PLOTS.SIZE.aspect > 0 && PLOTS.SIZE.minHeight > 0 && PLOTS.SIZE.minHeight <= PLOTS.SIZE.maxHeight);
  // The small size of the inversion chart went with it (stage 7c).
  assert.equal(PLOTS.SIZE_SMALL, undefined);
});

for (const [sizeName, size] of [["large", PLOTS.SIZE]]) {
  commonDrawingTests("chart (" + sizeName + ")", UI, size, CHARTS.map((chart) => (view) => PLOTS.draw(view, deepFreeze(chart))));

  test("layout (" + sizeName + "): the plot inside the canvas with room for the title, the labels and the tag", () => {
    for (const w of WIDTHS) {
      const h = heightFor(size, w);
      const L = PLOTS.layout(w, h);
      const P = L.plot;
      assert.ok(L.fontSize >= 10 && L.fontSize <= 13, "font " + L.fontSize);
      assert.ok(P.left >= 8 && P.left < P.right && P.right < w, "left to right at " + w);
      assert.ok(P.top < P.bottom && P.bottom < h);
      assert.ok(P.right - P.left >= 0.6 * w, "the plot takes most of the width at " + w);
      assert.ok(P.bottom - P.top >= 0.6 * h, "and of the height at " + w);
      assert.ok(L.titleY >= L.fontSize && L.titleY <= P.top - 0.3 * L.fontSize, "the title above the plot");
      assert.ok(L.timeY > P.bottom + L.fontSize && L.timeY <= h, "the time labels under it");
      assert.ok(L.labelX > P.right && L.labelX + L.labelWidth <= w, "the value labels beside it");
      assert.ok(L.labelWidth >= 3 * L.fontSize, "wide enough for '12.5'");
      assert.ok(P.right + 1 + L.tagWidth <= w, "the tag inside the canvas");
    }
  });
}

test("scale: the value axis runs from 0 to a round tick above everything shown; old points are left out", () => {
  const chart = powerChart();
  const S = PLOTS.scale(chart);
  assert.ok(S.shown.length > 0 && S.shown.length < chart.points.length, "some points are older than the window");
  for (const point of S.shown) assert.ok(point.t >= chart.tNow - chart.shownTime && point.t <= chart.tNow);
  const highest = Math.max(...S.shown.map((p) => p.P));
  assert.ok(highest > 8, "the spike is in the window");
  assert.equal(S.value.top, 10);
  assert.deepEqual(Array.from(S.value.values), [0, 5, 10]);
});

test("scale: the floor keeps spontaneous emission on the axis; a reference line is always on the chart", () => {
  const dim = powerChart({ points: [{ t: 2.5e-3, P: 1e-8, y: 0.4 }], lines: [] });
  assert.equal(PLOTS.scale(dim).value.top, 0.8, "0.74 W floor");
  const withLine = powerChart({ points: [{ t: 2.5e-3, P: 1e-8, y: 0.4 }], lines: [{ value: 3.1, word: "steady", tone: "soft" }] });
  assert.ok(PLOTS.scale(withLine).value.top >= 3.1 * 1.05);
  // Nothing at all to show: still an axis.
  const empty = powerChart({ points: [], floor: 0, lines: [] });
  assert.ok(PLOTS.scale(empty).value.top > 0);
  // 5 % of room above the highest point: a point exactly on a tick does not touch the top.
  const exact = powerChart({ points: [{ t: 2.5e-3, P: 2, y: 1 }], floor: 0, lines: [] });
  assert.ok(PLOTS.scale(exact).value.top > 2);
});

test("the grid: a line and a label at every tick of both axes, the unit written once", () => {
  for (const chart of [powerChart(), inversionChart()]) {
    const { recorder, view } = drawChart(chart);
    const { L, S, P, xOf, yOf } = geometry(chart, view);
    S.value.values.forEach((value, i) => {
      assert.ok(hasLine(recorder, P.left, yOf(value), P.right, yOf(value)), "a grid line at " + value);
      const label = texts(recorder).find((c) => c.args[0] === S.valueLabels.texts[i] && Math.abs(c.args[1] - L.labelX) < 1e-9);
      assert.ok(label, "the label " + S.valueLabels.texts[i]);
      assertClose(label.args[2], yOf(value) + 0.35 * L.fontSize, 1e-9, "beside its tick");
    });
    let labelled = 0;
    S.time.values.forEach((t, i) => {
      assert.ok(hasLine(recorder, xOf(t), P.top, xOf(t), P.bottom), "a grid line at t = " + t);
      const label = texts(recorder).find((c) => c.args[0] === S.timeLabels.texts[i] && Math.abs(c.args[2] - L.timeY) < 1e-9);
      if (label) {
        labelled += 1;
        assertClose(label.args[1], xOf(t), 1e-9, "under its tick");
      }
    });
    assert.ok(labelled >= 3, "most time ticks are labelled: " + labelled);
    assert.deepEqual(Array.from(S.timeLabels.texts), ["2.0", "2.1", "2.2", "2.3", "2.4", "2.5"]);
    assert.equal(texts(recorder).filter((c) => c.args[0] === "ms").length, 1, "the time unit once");
    if (chart.unit) assert.equal(texts(recorder).filter((c) => c.args[0] === "W").length, 1, "the value unit once");
    assert.ok(texts(recorder).some((c) => c.args[0] === chart.title));
  }
});

test("a small power is written with its prefix: the ticks in milliwatts under 'mW', the tag too", () => {
  const chart = powerChart({
    points: [{ t: 2.2e-3, P: 0.0031, y: 1 }, { t: 2.5e-3, P: 0.00512, y: 1 }], floor: 0.0074, lines: []
  });
  const { recorder } = drawChart(chart);
  const written = texts(recorder).map((c) => c.args[0]);
  assert.ok(written.includes("mW"), "the unit with its prefix");
  assert.ok(!written.includes("W"));
  for (const label of ["0", "2", "4", "6", "8"]) assert.ok(written.includes(label), "tick " + label);
  assert.ok(written.includes("5.12"), "the tag in mW, two decimals finer than the ticks");
});

test("a time label at the very edge of the plot is left out, not cut off", () => {
  const chart = powerChart();
  const { recorder, view } = drawChart(chart);
  const { L, P } = geometry(chart, view);
  for (const call of texts(recorder).filter((c) => Math.abs(c.args[2] - L.timeY) < 1e-9 && c.args[0] !== "ms")) {
    assert.ok(call.args[1] >= P.left + 1.6 * L.fontSize - 1e-9 && call.args[1] <= P.right - 1.2 * L.fontSize + 1e-9,
      "label " + call.args[0] + " at " + call.args[1]);
  }
});

test("just after the start: times before 0 get no grid line and no label", () => {
  const chart = powerChart({ tNow: 1e-4, points: [{ t: 0, P: 0, y: 0 }, { t: 1e-4, P: 0, y: 0.2 }] });
  const { recorder, view } = drawChart(chart);
  const { S, P, xOf } = geometry(chart, view);
  assert.ok(S.time.values.some((t) => t < 0), "the window starts before 0");
  for (const t of S.time.values) {
    assert.equal(hasLine(recorder, xOf(t), P.top, xOf(t), P.bottom), t >= 0, "grid line at t = " + t);
  }
  for (const call of texts(recorder)) assert.ok(!call.args[0].startsWith("−"), "a negative time: " + call.args[0]);
});

test("the curve: every shown point on the axes' scales, the latest at the right edge", () => {
  for (const chart of [powerChart(), inversionChart()]) {
    const { recorder, view } = drawChart(chart);
    const { S, P, xOf, yOf } = geometry(chart, view);
    // The stroked curve is the last path with one moveTo and a lineTo for
    // each further point; find its points after the last beginPath
    // before the first stroke that follows the area's fill.
    const fillAt = recorder.calls.findIndex((c) => c.name === "fill");
    const path = [];
    for (let i = fillAt + 1; i < recorder.calls.length; i++) {
      const call = recorder.calls[i];
      if (call.name === "stroke") break;
      if (call.name === "moveTo" || call.name === "lineTo") path.push(call);
    }
    assert.equal(path.length, S.shown.length);
    assert.equal(path[0].name, "moveTo");
    S.shown.forEach((point, i) => {
      assertClose(path[i].args[0], xOf(point.t), 1e-9, "x of point " + i);
      assertClose(path[i].args[1], yOf(point[chart.key]), 1e-9, "y of point " + i);
    });
    assertClose(path[path.length - 1].args[0], P.right, 1e-9, "now is the right edge");
    for (let i = 1; i < path.length; i++) assert.ok(path[i].args[0] > path[i - 1].args[0], "time runs left to right");
  }
});

test("the curve and its area are in the chart's colour; the area is faint", () => {
  for (const [chart, name] of [[powerChart(), "accent"], [inversionChart(), "accent2"]]) {
    const { recorder, view } = drawChart(chart);
    let alpha = 1;
    let fillStyle = null;
    let areaAlpha = null;
    for (const entry of recorder.log) {
      if (entry.set === "globalAlpha") alpha = entry.value;
      if (entry.set === "fillStyle") fillStyle = entry.value;
      if (entry.call === "fill" && areaAlpha === null) {
        areaAlpha = alpha;
        assert.equal(fillStyle, view.colors[name]);
      }
    }
    assert.ok(areaAlpha > 0 && areaAlpha <= 0.25, "area alpha " + areaAlpha);
  }
});

test("the tag: on the value axis at the latest value, which it writes with two more decimals than the ticks", () => {
  // The run ends at 2.3 W, so the latest value differs from the oldest (1.7 W).
  const points = spikyPoints(2.5e-3, 5e-4);
  points[points.length - 1] = { t: points[points.length - 1].t, P: 2.3, y: 1 };
  const chart = powerChart({ points: points });
  const { recorder, view } = drawChart(chart);
  const { L, S, P, yOf } = geometry(chart, view);
  const last = S.shown[S.shown.length - 1];
  assert.equal(last.P, 2.3);
  assert.ok(Math.abs(yOf(S.shown[0].P) - yOf(last.P)) > 10, "the oldest and latest values are far apart on the chart");
  const tag = recorder.calls.find((c) => c.name === "fillRect" && Math.abs(c.args[0] - (P.right + 1)) < 1e-9);
  assert.ok(tag, "a filled tag right of the plot");
  assertClose(tag.args[1] + tag.args[3] / 2, yOf(last.P), 1e-9, "centred on the latest value");
  assert.equal(tag.args[2], L.tagWidth);
  const expected = UI.axis.valueText(last.P, S.valueLabels, 2);
  assert.equal(expected, "2.30");
  const written = texts(recorder).find((c) => c.args[0] === expected);
  assert.ok(written, "the tag's text " + expected);
  assertClose(written.args[2], yOf(last.P) + 0.35 * L.fontSize, 1e-9, "inside the tag");
  // The page's background framed in the curve's colour, the text in the
  // heading colour: readable in both themes on both charts (the text in
  // the background colour on a tag filled with the curve's colour was
  // 3.6:1 on the light theme; stage 6b review).
  let fillStyle = null;
  let strokeStyle = null;
  let tagFill = null;
  let frameStroke = null;
  let textFill = null;
  for (const entry of recorder.log) {
    if (entry.set === "fillStyle") fillStyle = entry.value;
    if (entry.set === "strokeStyle") strokeStyle = entry.value;
    if (entry.call === "fillRect" && entry.args === tag.args) tagFill = fillStyle;
    if (entry.call === "strokeRect" && entry.args.join() === tag.args.join()) frameStroke = strokeStyle;
    if (entry.call === "fillText" && entry.args === written.args) textFill = fillStyle;
  }
  assert.equal(tagFill, view.colors.bg);
  assert.equal(frameStroke, view.colors.accent, "framed in the curve's colour");
  assert.equal(textFill, view.colors.heading);
  // No points, no tag.
  const empty = drawChart(powerChart({ points: [] }));
  assert.ok(!empty.recorder.calls.some((c) => c.name === "fillRect"));
});

test("reference lines: dashed, at their value, with their word; none for a value of 0", () => {
  const chart = inversionChart();
  const { recorder, view } = drawChart(chart);
  const { P, yOf } = geometry(chart, view);
  for (const line of chart.lines) {
    assert.ok(hasLine(recorder, P.left, yOf(line.value), P.right, yOf(line.value)), "a line at " + line.value);
  }
  const word = texts(recorder).find((c) => c.args[0] === "threshold");
  assert.ok(word);
  assert.ok(Math.abs(word.args[2] - yOf(1)) < 20, "the word is at its line");
  // Dashed while the reference lines are drawn.
  const dashes = recorder.calls.filter((c) => c.name === "setLineDash");
  assert.ok(dashes.some((c) => c.args[0].length > 0));
  assert.equal(dashes[dashes.length - 1].args[0].length, 0, "and solid again after");

  const none = inversionChart({ lines: [{ value: 0, word: "pump", tone: "faint" }] });
  const drawn = drawChart(none);
  assert.ok(!texts(drawn.recorder).some((c) => c.args[0] === "pump"));
  assert.ok(!drawn.recorder.calls.some((c) => c.name === "setLineDash" && c.args[0].length > 0));
});

test("a reference line with stretch: false does not stretch the axis, and is drawn only inside it", () => {
  // The pump level x = 38 on the inversion chart while y stays near 1.
  const points = spikyPoints(2.5e-3, 5e-4).map((p) => ({ t: p.t, P: p.P, y: 1 + 0.02 * Math.sin(p.t * 1e5) }));
  const high = inversionChart({ points: points, lines: [
    { value: 1, word: "threshold", tone: "soft" },
    { value: 38, word: "pump", tone: "faint", stretch: false }
  ] });
  const S = PLOTS.scale(high);
  assert.ok(S.value.top <= 2, "the axis fits the curve, not the pump level: " + S.value.top);
  const { recorder } = drawChart(high);
  assert.ok(!texts(recorder).some((c) => c.args[0] === "pump"), "a line above the axis is not drawn");
  // The same line stretching the axis (the default) would put the curve
  // on the bottom.
  const stretched = Object.assign({}, high, { lines: [high.lines[0], { value: 38, word: "pump", tone: "faint" }] });
  assert.equal(PLOTS.scale(stretched).value.top, 40);
  // Inside the axis it is drawn, at its value.
  const low = inversionChart({ points: points.map((p) => ({ t: p.t, P: p.P, y: 1.6 })), lines: [
    { value: 1, word: "threshold", tone: "soft" },
    { value: 1.4, word: "pump", tone: "faint", stretch: false }
  ] });
  const drawn = drawChart(low);
  const { yOf } = geometry(low, drawn.view);
  const word = texts(drawn.recorder).find((c) => c.args[0] === "pump");
  assert.ok(word, "drawn when inside the axis");
  assert.ok(Math.abs(word.args[2] - yOf(1.4)) < 20, "the word at its line");
});

test("a reference line's word stays inside the plot: under its line when the line is near the top", () => {
  // The line is the highest thing on the chart. At 1.9 the axis ends at
  // 2 (1.9 and the 5 % headroom), so the line is 5 % under the top and a
  // word above it would sit on the chart's title; at 1 the axis ends at
  // 1.5 and the word fits above its line.
  for (const value of [1.9, 1]) {
    let under = 0;
    for (const w of WIDTHS) {
      const chart = inversionChart({ points: [{ t: 2.5e-3, P: 0, y: 0 }], lines: [{ value: value, word: "threshold", tone: "soft" }] });
      const { recorder, view } = drawChart(chart, w);
      const { L, P, yOf } = geometry(chart, view);
      const word = texts(recorder).find((c) => c.args[0] === "threshold");
      const where = value + " at " + w + " px: the word at " + word.args[2];
      assert.ok(word.args[2] - L.fontSize >= P.top - 1e-9 && word.args[2] <= P.bottom, where);
      if (word.args[2] > yOf(value)) under += 1;
      else assert.ok(word.args[2] <= yOf(value), where + ", above its line");
    }
    if (value === 1) assert.equal(under, 0, "at 1 the word is always above its line");
    else assert.ok(under > 0, "at 1.9 the word goes under its line");
  }
});

test("the pointer: a crosshair on the nearest point, with its value and time written out", () => {
  const chart = powerChart({ cursor: 200 });
  const { recorder, view } = drawChart(chart);
  const { S, P, xOf, yOf } = geometry(chart, view);
  const timeAt = chart.tNow - (P.right - 200) / (P.right - P.left) * chart.shownTime;
  let near = S.shown[0];
  for (const point of S.shown) {
    if (Math.abs(point.t - timeAt) < Math.abs(near.t - timeAt)) near = point;
  }
  assert.ok(Math.abs(xOf(near.t) - 200) <= (P.right - P.left) / S.shown.length, "the nearest point is under the pointer");
  assert.ok(hasLine(recorder, xOf(near.t), P.top, xOf(near.t), P.bottom), "the upright line");
  assert.ok(hasLine(recorder, P.left, yOf(near.P), P.right, yOf(near.P)), "the line across");
  const dot = recorder.calls.find((c) => c.name === "arc");
  assert.ok(dot, "a dot on the point");
  assertClose(dot.args[0], xOf(near.t), 1e-9, "dot x");
  assertClose(dot.args[1], yOf(near.P), 1e-9, "dot y");
  const F = UI.format;
  assert.ok(texts(recorder).some((c) => c.args[0] === F.si(near.P, "W", 4)), "the value " + F.si(near.P, "W", 4));
  assert.ok(texts(recorder).some((c) => c.args[0] === F.si(near.t, "s", 4)), "the time " + F.si(near.t, "s", 4));
  assert.ok(F.si(near.P, "W", 4).endsWith(NB + "W"));

  // The nearest point, whichever side of the pointer it is on.
  for (let x = 150; x <= 400; x += 12.5) {
    const moved = powerChart({ cursor: x });
    const made = drawChart(moved);
    const g = geometry(moved, made.view);
    const at = moved.tNow - (g.P.right - x) / (g.P.right - g.P.left) * moved.shownTime;
    let best = g.S.shown[0];
    for (const point of g.S.shown) {
      if (Math.abs(point.t - at) < Math.abs(best.t - at)) best = point;
    }
    assertClose(made.recorder.calls.find((c) => c.name === "arc").args[0], g.xOf(best.t), 1e-9, "pointer at " + x);
  }

  // A plain number (the inversion) is written without a unit.
  const plain = inversionChart({ cursor: 200 });
  const second = drawChart(plain);
  const g2 = geometry(plain, second.view);
  let near2 = g2.S.shown[0];
  for (const point of g2.S.shown) {
    if (Math.abs(point.t - timeAt) < Math.abs(near2.t - timeAt)) near2 = point;
  }
  assert.ok(texts(second.recorder).some((c) => c.args[0] === F.number(near2.y, 4)));
});

test("the pointer's reading sits in the top corner away from the pointer", () => {
  const leftSide = drawChart(powerChart({ cursor: 60 }));
  const rightSide = drawChart(powerChart({ cursor: 480 }));
  const P = PLOTS.layout(leftSide.view.w, leftSide.view.h).plot;
  // The box is the stroked rectangle that is neither the plot's frame
  // nor the tag's frame (right of the plot).
  function box(made) {
    return made.recorder.calls.filter((c) => c.name === "strokeRect" && c.args[0] <= P.right)[1];
  }
  assert.ok(box(leftSide).args[0] > (P.left + P.right) / 2, "pointer left, reading right");
  assert.ok(box(rightSide).args[0] < (P.left + P.right) / 2, "pointer right, reading left");
  for (const made of [leftSide, rightSide]) {
    const b = box(made).args;
    assert.ok(b[0] >= P.left && b[0] + b[2] <= P.right && b[1] >= P.top && b[1] + b[3] <= P.bottom, "inside the plot");
  }
});

test("no crosshair without a pointer, with the pointer outside the plot, or with nothing to point at", () => {
  const P = PLOTS.layout(600, heightFor(PLOTS.SIZE, 600)).plot;
  const cases = [
    powerChart({ cursor: null }),
    powerChart({ cursor: undefined }),
    powerChart({ cursor: P.right + 5 }),
    powerChart({ cursor: P.left - 1 }),
    powerChart({ cursor: 200, points: [] })
  ];
  for (const chart of cases) {
    const { recorder } = drawChart(chart);
    assert.ok(!recorder.calls.some((c) => c.name === "arc"), "cursor " + chart.cursor);
    const frames = recorder.calls.filter((c) => c.name === "strokeRect" && c.args[0] <= P.right);
    assert.equal(frames.length, 1, "only the plot's frame (and the tag's, right of the plot)");
  }
});
