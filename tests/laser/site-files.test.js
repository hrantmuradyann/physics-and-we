/* ============================================================================
   site-files.test.js — the laser page's place in the site.

   Static checks on the files a browser loads, so a slip in one of them
   is caught without opening the page:
     data/laser.json      every word in both languages
     sections/laser.html  every word it asks for exists; no styles, scripts,
                          <header> or <footer> (CLAUDE.md, "Critical gotchas")
     css/laser.css, js/laser/ui/*.js, js/laser/page.js
                          no colour written out: theme variables only
     index.html           the laser files load, in the right order
     data/site.json       the hidden route
     sections/labs.html   the banner that leads to the laser page
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, ENGINE_FILES, UI_FILES } = require("./helpers.js");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}
function readJSON(relativePath) {
  return JSON.parse(read(relativePath));
}

const LANGS = ["hy", "en"];

/* ---------- small helpers, with their own tests below ---------- */

// Every { hy, en } pair in a data file, with its path ("bench.parts.pump").
// A key starting with "_" ("_readme") is a note for editors, not a word.
function wordPairs(value, where, found) {
  const list = found || [];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const keys = Object.keys(value).filter((key) => !key.startsWith("_"));
    if (keys.some((key) => LANGS.includes(key))) {
      list.push({ where: where, value: value, keys: keys });
      return list;
    }
    for (const key of keys) {
      // A "route" is the name of a page to link to (data-route), not a word.
      if (key === "route" && typeof value[key] === "string") continue;
      wordPairs(value[key], where ? where + "." + key : key, list);
    }
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => wordPairs(item, where + "." + index, list));
  } else if (typeof value === "string") {
    list.push({ where: where, value: value, keys: null });   // a bare string
  }
  return list;
}

// The value at "a.b.c" in an object, or undefined (like Content.valueAt
// in js/content.js).
function valueAt(data, dotted) {
  let node = data;
  for (const key of dotted.split(".")) {
    if (node === null || node === undefined) return undefined;
    node = node[key];
  }
  return node;
}

// The HTML with every <template>…</template> and every comment removed:
// the names inside a template belong to one item of a list, not the page.
function outsideTemplates(html) {
  return html.replace(/<!--[\s\S]*?-->/g, "").replace(/<template>[\s\S]*?<\/template>/g, "");
}

// Every data-list in a layout with the HTML of its <template>:
// [{ list: "featured.items", html: "<a …>…</a>" }]. Inside a template the
// names belong to one item of that list.
function listTemplates(html) {
  const found = [];
  const pattern = /data-list="([^"]+)"[^>]*>\s*<template>([\s\S]*?)<\/template>/g;
  let match;
  while ((match = pattern.exec(html.replace(/<!--[\s\S]*?-->/g, ""))) !== null) {
    found.push({ list: match[1], html: match[2] });
  }
  return found;
}

// The values of one attribute everywhere in a piece of HTML.
function attributeValues(html, name) {
  const pattern = new RegExp("\\s" + name + '="([^"]*)"', "g");
  const found = [];
  let match;
  while ((match = pattern.exec(html)) !== null) found.push(match[1]);
  return found;
}

// Every colour name CSS knows (CSS Color Module Level 4), except
// "transparent" and "currentColor", which are allowed.
const COLOUR_NAMES = ("aliceblue antiquewhite aqua aquamarine azure beige bisque black " +
  "blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral " +
  "cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen " +
  "darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon " +
  "darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink " +
  "deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro " +
  "ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo " +
  "ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan " +
  "lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen " +
  "lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen " +
  "magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen " +
  "mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream " +
  "mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid " +
  "palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum " +
  "powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown " +
  "seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen " +
  "steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow " +
  "yellowgreen").split(" ");

// Every CSS function that makes a colour from numbers.
const COLOUR_FUNCTIONS = ["rgb", "rgba", "hsl", "hsla", "hwb", "lab", "lch", "oklab", "oklch",
  "color", "color-mix"];

// Colours written out in CSS: hex, rgb()/rgba()/hsl()/hsla(), or a colour
// name, in the declarations (not in selectors, where "#site-header" is an
// id). Comments are ignored; "transparent" and "currentColor" are allowed.
function colourLiteralsInCss(css) {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const found = [];
  const blocks = /\{([^{}]*)\}/g;
  let block;
  while ((block = blocks.exec(bare)) !== null) {
    for (const declaration of block[1].split(";")) {
      const colon = declaration.indexOf(":");
      if (colon === -1) continue;
      const value = declaration.slice(colon + 1);
      found.push(...colourLiteralsInText(value));
    }
  }
  return found;
}

// The colours written out in a piece of text. A theme variable's name is
// not a colour, even if it has one in it (var(--gold-line)), so var(…) is
// taken out first.
function colourLiteralsInText(text) {
  const bare = text.replace(/var\(\s*--[\w-]+\s*\)/g, " ");
  const found = [];
  const hex = bare.match(/#[0-9a-fA-F]{3,8}\b/g);
  if (hex) found.push(...hex);
  const functions = bare.match(new RegExp("(?<![\\w-])(" + COLOUR_FUNCTIONS.join("|") + ")\\(", "gi"));
  if (functions) found.push(...functions);
  const names = bare.match(new RegExp("(?<![\\w-])(" + COLOUR_NAMES.join("|") + ")(?![\\w-])", "gi"));
  if (names) found.push(...names);
  return found;
}

// Colours written out in JavaScript strings ("…", '…' and `…`): the same
// patterns, inside strings only, comments removed.
function colourLiteralsInJs(code) {
  const bare = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const found = [];
  const strings = /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|`([^`\\]|\\.)*`/g;
  let match;
  while ((match = strings.exec(bare)) !== null) found.push(...colourLiteralsInText(match[0]));
  return found;
}

// The src of every <script> and the href of every stylesheet, in order.
function scriptsIn(html) {
  return attributeValues(html.replace(/<!--[\s\S]*?-->/g, ""), "src");
}
function stylesheetsIn(html) {
  const found = [];
  const pattern = /<link\s+rel="stylesheet"\s+href="([^"]+)"/g;
  let match;
  while ((match = pattern.exec(html)) !== null) found.push(match[1]);
  return found;
}

test("the helpers of this file: word pairs, templates, colours", () => {
  const pairs = wordPairs({ _readme: "note", a: { hy: "ա", en: "a" }, b: { c: "bare" }, d: [{ hy: "", en: "x" }] });
  assert.deepEqual(pairs.map((p) => p.where), ["a", "b.c", "d.0"]);
  assert.equal(pairs[1].keys, null);
  assert.equal(valueAt({ a: { b: { c: 3 } } }, "a.b.c"), 3);
  assert.equal(valueAt({ a: 1 }, "a.b.c"), undefined);
  assert.equal(outsideTemplates('<p data-text="x"></p><template><p data-text="y"></p></template><!-- data-text="z" -->'),
    '<p data-text="x"></p>');
  assert.deepEqual(attributeValues('<a data-text="one" x-data-text="no"><b data-text="two">', "data-text"), ["one", "two"]);
  assert.deepEqual(colourLiteralsInCss("#site-header { color: #fff; background: rgba(0,0,0,.5); }"), ["#fff", "rgba("]);
  assert.deepEqual(colourLiteralsInCss("/* #fff */ .a:hover { color: var(--text); border: 1px solid transparent; }"), []);
  assert.deepEqual(colourLiteralsInCss("@media (max-width: 600px) { .a { color: White; } }"), ["White"]);
  assert.deepEqual(colourLiteralsInCss(".a { font-family: var(--font-main); margin: 0 auto; }"), []);
  assert.deepEqual(colourLiteralsInJs('var a = "#2f80ed"; // "#fff"\n/* "red" */ var b = "rgb(" + r;'), ["#2f80ed", "rgb("]);
  assert.deepEqual(colourLiteralsInJs('var url = "http://x"; g.fillStyle = view.colors.soft;'), []);
  // Names and functions beyond the basic ones, and template strings.
  assert.deepEqual(colourLiteralsInCss(".a { color: crimson; background: oklch(0.6 0.1 30); }"), ["crimson", "oklch("]);
  assert.deepEqual(colourLiteralsInCss(".a { background: color-mix(in srgb, var(--accent), white); }"), ["color-mix(", "white"]);
  assert.deepEqual(colourLiteralsInJs("g.fillStyle = \"tomato\"; g.strokeStyle = `hsl(${h}, 50%, 50%)`;"), ["tomato", "hsl("]);
  // A theme variable with a colour in its name is not a colour written out.
  assert.deepEqual(colourLiteralsInCss(".a { color: var(--gold-line); border-color: var( --red ); }"), []);
  assert.deepEqual(colourLiteralsInText("a reduced, tanned, golden redline"), []);
  assert.deepEqual(listTemplates('<div data-list="a.items"><template><p data-text="t"></p></template></div>'),
    [{ list: "a.items", html: '<p data-text="t"></p>' }]);
  assert.equal(valueAt({ a: { b: { c: 3 } } }, "a.b.c"), 3);
  assert.deepEqual(scriptsIn('<script src="a.js"></script><!-- <script src="b.js"></script> --><script src="c.js">'), ["a.js", "c.js"]);
});

/* ---------- data/laser.json ---------- */

test("data/laser.json: every word in Armenian and English, and nothing else", () => {
  const pairs = wordPairs(readJSON("data/laser.json"));
  assert.ok(pairs.length >= 8, "the page has words");
  for (const pair of pairs) {
    assert.ok(pair.keys, pair.where + " is a bare string; words need { \"hy\": …, \"en\": … }");
    assert.deepEqual(pair.keys.slice().sort(), LANGS.slice().sort(), pair.where + " has other keys than hy and en");
    for (const lang of LANGS) {
      assert.equal(typeof pair.value[lang], "string", pair.where + "." + lang);
      assert.ok(pair.value[lang].trim(), pair.where + "." + lang + " is empty");
    }
  }
});

/* ---------- sections/laser.html ---------- */

test("sections/laser.html: every word it asks for is in data/laser.json, in both languages", () => {
  const html = outsideTemplates(read("sections/laser.html"));
  const data = readJSON("data/laser.json");
  const keys = [];
  for (const name of ["data-text", "data-rich", "data-alt"]) keys.push(...attributeValues(html, name));
  assert.ok(keys.length >= 4, "the layout uses some words");
  for (const key of keys) {
    const value = valueAt(data, key);
    assert.ok(value && typeof value === "object", key + " is not in data/laser.json");
    for (const lang of LANGS) assert.ok(String(value[lang] || "").trim(), key + "." + lang + " is empty");
  }
  const ui = readJSON("data/site.json").ui;
  for (const key of attributeValues(html, "data-ui")) {
    for (const lang of LANGS) assert.ok(ui[key] && String(ui[key][lang] || "").trim(), "ui." + key + "." + lang);
  }
});

test("sections/laser.html: no styles, scripts, <header> or <footer>; one plain background around it", () => {
  const raw = read("sections/laser.html");
  const html = raw.replace(/<!--[\s\S]*?-->/g, "");
  assert.doesNotMatch(html, /\sstyle\s*=/i, "a style= attribute (CSS goes in css/laser.css)");
  assert.doesNotMatch(html, /<style\b/i, "a <style> block");
  assert.doesNotMatch(html, /<script\b/i, "a <script> (it would never run in a fragment)");
  assert.doesNotMatch(html, /<header\b/i, "a <header> picks up the site's header bar");
  assert.doesNotMatch(html, /<footer\b/i, "a <footer> picks up the site's footer bar");
  assert.match(html.trim(), /^<div class="laser-lab">[\s\S]*<\/div>$/, "wrapped in <div class=\"laser-lab\">");
});

// The site's colours the light theme changes but nothing inside the laser
// lab uses: the site header's bar, the home hero's vignette, and the small
// labs' canvas colours (js/labs.js).
const OUTSIDE_THE_LAB = ["--header-bg", "--vignette", "--canvas-line", "--canvas-grid", "--canvas-faint", "--canvas-glow"];

test(".laser-lab sets every site colour the theme changes to the lab's own fixed one, so the lab looks the same in both themes", () => {
  const block = (css, selector) => {
    const start = css.search(new RegExp("^" + selector.replace(/\./g, "\\.") + "\\s*\\{", "m"));
    assert.ok(start >= 0, selector);
    return css.slice(start, css.indexOf("\n}", start));
  };
  const names = (text) => Array.from(text.matchAll(/^\s+(--[a-z0-9-]+)\s*:/gm), (m) => m[1]);
  const themed = names(block(read("css/style.css"), ":root.theme-light"));
  const lab = block(read("css/laser.css"), ".laser-lab");
  const labNames = names(lab);
  for (const name of themed) {
    if (OUTSIDE_THE_LAB.includes(name)) continue;
    assert.ok(labNames.includes(name), name + " is not set inside the lab: it would follow the site's theme");
    const value = lab.match(new RegExp("^\\s+" + name + "\\s*:\\s*([^;]+);", "m"))[1].trim();
    assert.match(value, /^(var\(--laser-[a-z0-9-]+\)|none|transparent)$/, name + ": a lab colour, got " + value);
  }
  for (const name of OUTSIDE_THE_LAB) {
    for (const file of ["css/laser.css", "css/labs.css", "js/laser/ui/loop.js", "js/laser/page.js"]) {
      assert.ok(!read(file).includes("var(" + name + ")") && !read(file).includes("\"" + name + "\""), name + " used in " + file);
    }
  }
});

// The pictures js/laser/page.js draws, by their data-laser-canvas names
// (tests/laser/page.test.js uses the same list).
const PAGE_CANVASES = ["bench", "power", "photons", "atoms", "stability"];

test("sections/laser.html: the canvases, each a picture for screen readers, each described in the data", () => {
  const html = read("sections/laser.html").replace(/<!--[\s\S]*?-->/g, "");
  const canvases = html.match(/<canvas\b[^>]*>/g) || [];
  assert.deepEqual(canvases.map((tag) => (tag.match(/\sdata-laser-canvas="([^"]*)"/) || [])[1]).sort(),
    PAGE_CANVASES.slice().sort());
  for (const tag of canvases) assert.match(tag, /\srole="img"/);
  const data = readJSON("data/laser.json");
  const page = read("js/laser/page.js");
  for (const name of PAGE_CANVASES) {
    for (const lang of LANGS) assert.ok(String(data[name].alt[lang] || "").trim(), name + ".alt." + lang);
    assert.ok(page.includes('"' + name + '"'), "page.js draws " + name);
  }
});

test("the chart canvas, and only it, carries the class that lets a finger move the crosshair", () => {
  const html = read("sections/laser.html").replace(/<!--[\s\S]*?-->/g, "");
  for (const tag of html.match(/<canvas\b[^>]*>/g) || []) {
    const name = (tag.match(/\sdata-laser-canvas="([^"]*)"/) || [])[1];
    const chart = name === "power";
    assert.equal(/\sclass="[^"]*\blaser-bench__canvas--chart\b/.test(tag), chart, name);
  }
  // A sideways drag goes to the page (the crosshair), an up-and-down drag
  // still scrolls; the mouse pointer is a crosshair.
  const css = read("css/laser.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = css.match(/\.laser-bench__canvas--chart\s*\{([^}]*)\}/);
  assert.ok(rule, "css/laser.css has a rule for .laser-bench__canvas--chart");
  assert.match(rule[1], /touch-action:\s*pan-y\s*;/);
  assert.match(rule[1], /cursor:\s*crosshair\s*;/);
});

// What js/laser/page.js looks for (tests/laser/page.test.js uses the same
// names). A name missing from the layout would leave a control dead
// without any error.
const PAGE_CONTROLS = ["Rc1", "Rc2", "pump", "coupler", "absorberT0", "slowMotion"];
// The sliders in rows page.js hides: each curved mirror's radius (stage
// 10b) and the filter's.
const PAGE_Q_CONTROLS = ["Rc1", "Rc2", "absorberT0"];
const PAGE_READOUTS = ["pumpThreshold", "currentThreshold", "flashThreshold", "x", "gth", "tau_c",
  "stability", "waist", "mirrorLoss", "lossNow", "P_out", "giant", "peak", "powerNow", "T_best", "period", "time"];
const PAGE_CHOICES = ["medium", "pump"];

test("sections/laser.html: every slider, number box, readout and button page.js needs, once each", () => {
  const html = read("sections/laser.html").replace(/<!--[\s\S]*?-->/g, "");
  assert.deepEqual(attributeValues(html, "data-laser-control"), PAGE_CONTROLS);
  assert.deepEqual(attributeValues(html, "data-laser-input"), PAGE_CONTROLS);
  assert.deepEqual(attributeValues(html, "data-laser-unit"), PAGE_CONTROLS);
  assert.deepEqual(attributeValues(html, "data-laser-value"), ["slowMotion"]);
  assert.deepEqual(attributeValues(html, "data-laser-readout"), PAGE_READOUTS);
  // Each readout in a row of its own, which page.js hides on a bench that
  // does not have that number.
  assert.deepEqual(attributeValues(html, "data-laser-row"), PAGE_READOUTS);
  const rows = html.split(/(?=<div\b[^>]*\sdata-laser-row=")/).slice(1);
  rows.forEach((row, i) => {
    const inside = row.slice(0, row.indexOf("</div>"));
    assert.ok(inside.includes('data-laser-readout="' + PAGE_READOUTS[i] + '"'), PAGE_READOUTS[i] + " is in its own row");
    assert.ok(inside.includes('data-text="readouts.' + PAGE_READOUTS[i] + '"'), PAGE_READOUTS[i] + " is named in its row");
  });
  assert.deepEqual(attributeValues(html, "data-laser-action").sort(), ["fire", "play", "qSwitch", "reset"]);
  // Fire starts hidden: the default bench has no flashlamp. It holds a
  // lightning bolt, hidden from screen readers, and its word, and starts
  // not asking to be pressed (data-ready, which page.js sets).
  assert.match(html, /<button\b[^>]*\sdata-laser-action="fire"[^>]*\shidden[\s>]/);
  const fire = html.match(/<button\b[^>]*\sdata-laser-action="fire"[^>]*>([\s\S]*?)<\/button>/);
  assert.match(fire[0], /^<button\b[^>]*\sdata-ready="false"/);
  assert.match(fire[1], /<svg\b[^>]*\saria-hidden="true"/, "the bolt, hidden from screen readers");
  assert.match(fire[1], /<span\b[^>]*\sdata-text="buttons\.fire"/, "its word, inside it beside the bolt");
  // Right under the drawing (stage 8b, the owner's wish): one row, hidden
  // until page.js shows it, with Fire and then the Q-switch's group (its
  // name and its On/Off switch), in the bench's box after its canvas.
  assert.equal((html.match(/\sdata-laser-under[\s>]/g) || []).length, 1, "one row under the drawing");
  assert.equal((html.match(/\sdata-laser-switch[\s>]/g) || []).length, 1, "one Q-switch group");
  const benchCanvas = html.indexOf('data-laser-canvas="bench"');
  const under = html.slice(html.indexOf("data-laser-under"));
  assert.ok(html.indexOf("data-laser-under") > benchCanvas, "after the bench's canvas");
  assert.ok(html.indexOf("data-laser-under") < html.indexOf('data-laser-canvas="power"'), "before the next picture");
  assert.match(html, /<div\b[^>]*\sdata-laser-under[^>]*\shidden[\s>]/);
  assert.match(html, /<div\b[^>]*\sdata-laser-switch[^>]*\shidden[\s>]/);
  const fireAt = under.indexOf('data-laser-action="fire"');
  const switchAt = under.indexOf("data-laser-switch");
  const toggleAt = under.indexOf('data-laser-action="qSwitch"');
  const controlsAt = under.indexOf("laser-stage__controls");
  assert.ok(fireAt !== -1 && fireAt < switchAt && switchAt < toggleAt && toggleAt < controlsAt, "Fire, then the switch, in the row");
  // The switch: a button with role="switch", off to start with, named by
  // the Q-switch's name, with the word On/Off (written by page.js) in it.
  const toggle = html.match(/<button\b[^>]*\sdata-laser-action="qSwitch"[^>]*>/)[0];
  assert.match(toggle, /\srole="switch"/);
  assert.match(toggle, /\saria-checked="false"/);
  const nameId = (toggle.match(/\saria-labelledby="([^"]+)"/) || [])[1];
  assert.ok(nameId, "the switch is named");
  assert.match(html, new RegExp('<span\\b[^>]*\\sid="' + nameId + '"[^>]*\\sdata-text="choose\\.qSwitch"'), "by the Q-switch's name");
  assert.match(html, /<button\b[^>]*\sdata-laser-action="qSwitch"[^>]*>[\s\S]*?data-laser-name="qSwitchState"[\s\S]*?<\/button>/,
    "the word inside the switch");
  // The two dropdowns, each a <select> named by its own <label for="...">;
  // page.js fills in their options.
  assert.deepEqual(attributeValues(html, "data-laser-choose"), PAGE_CHOICES);
  for (const name of PAGE_CHOICES) {
    const select = html.match(new RegExp('<select\\b[^>]*\\sdata-laser-choose="' + name + '"[^>]*>\\s*</select>'));
    assert.ok(select, name + " is an empty <select>");
    const id = (select[0].match(/\sid="([^"]+)"/) || [])[1];
    assert.ok(id, name + " has an id");
    assert.match(html, new RegExp('<label\\b[^>]*\\sfor="' + id + '"'), name + " has a label");
  }
  // The switch's On/Off word and the pump slider's name are written by
  // page.js (they depend on the switch and the pump): they have
  // data-laser-name, not data-text. The highest output's name has both:
  // page.js writes the one for a continuous bench over the flash's.
  assert.deepEqual(attributeValues(html, "data-laser-name"), ["qSwitchState", "pump", "peak"]);
  const pumpName = html.match(/<label\b[^>]*\sdata-laser-name="pump"[^>]*>/);
  assert.match(pumpName[0], /\sfor="laser-pump"/);
  assert.doesNotMatch(pumpName[0], /\sdata-text=/);
  assert.doesNotMatch(html.match(/<[a-z]+\b[^>]*\sdata-laser-name="qSwitchState"[^>]*>/)[0], /\sdata-text=/);
  assert.match(html, /<span\b[^>]*\sdata-text="readouts\.peak"[^>]*\sdata-laser-name="peak"/);
  // The filter's slider, in a row of its own that page.js hides while the
  // Q-switch is off. The page offers one Q-switch, so there is no dropdown
  // of kinds (and no cell's or prism's slider).
  assert.deepEqual(attributeValues(html, "data-laser-slider"), PAGE_Q_CONTROLS);
  const sliderRows = html.split(/(?=<div\b[^>]*\sdata-laser-slider=")/).slice(1);
  // Each part runs from one row to the next: its own slider is in it.
  sliderRows.forEach((row, i) => {
    assert.ok(row.includes('data-laser-control="' + PAGE_Q_CONTROLS[i] + '"'), PAGE_Q_CONTROLS[i] + " is in its own row");
    assert.ok(row.includes('data-laser-input="' + PAGE_Q_CONTROLS[i] + '"'), PAGE_Q_CONTROLS[i] + "'s box is in its row");
  });
  assert.deepEqual(attributeValues(html, "data-laser-choice"), []);
  // Each mirror's shapes (stage 10b): a group named by the mirror's name,
  // with three toggle buttons (aria-pressed, set by page.js), each with
  // its picture (hidden from screen readers) and its word; then that
  // mirror's radius slider.
  assert.deepEqual(attributeValues(html, "data-laser-mirror"), ["mirror1", "mirror2"]);
  const mirrorParts = html.split(/(?=<div\b[^>]*\sdata-laser-mirror=")/).slice(1);
  mirrorParts.forEach((part, i) => {
    const name = "mirror" + (i + 1);
    const group = part.match(/<div\b[^>]*\srole="group"[^>]*>/);
    assert.ok(group, name + "'s shapes are a group");
    const nameId = (group[0].match(/\saria-labelledby="([^"]+)"/) || [])[1];
    assert.match(part, new RegExp('<span\\b[^>]*\\sid="' + nameId + '"[^>]*\\sdata-text="bench\\.parts\\.' +
      (i === 0 ? "backMirror" : "outputMirror") + '"'), name + "'s group named by the mirror's name");
    const buttons = part.match(/<button\b[^>]*\sdata-laser-shape="[^"]+"[^>]*>[\s\S]*?<\/button>/g);
    assert.deepEqual(buttons.map((b) => b.match(/data-laser-shape="([^"]+)"/)[1]), ["flat", "concave", "convex"], name);
    for (const button of buttons) {
      assert.match(button, /^<button\b[^>]*\saria-pressed="false"/);
      assert.match(button, /<svg\b[^>]*\saria-hidden="true"/);
      assert.match(button, /<span\b[^>]*\sdata-text="controls\.shapes\.(flat|concave|convex)"/);
    }
    // Each picture is the face as the bench draws it, the laser on the
    // back mirror's right and the output mirror's left: a concave face is
    // a cup open towards the laser, so its middle lies away from the laser
    // (the review found them the wrong way round). "M x y q dx dy …": dx
    // is how far the curve's middle is pulled; towards the laser is +1 for
    // the back mirror, −1 for the output mirror.
    const towardsLaser = i === 0 ? 1 : -1;
    for (const button of buttons) {
      const shape = button.match(/data-laser-shape="([^"]+)"/)[1];
      const d = button.match(/<path d="([^"]+)"/)[1];
      const pull = d.match(/q(-?\d+(?:\.\d+)?)/);
      if (shape === "flat") {
        assert.equal(pull, null, name + " flat: a straight line, " + d);
        continue;
      }
      const sign = Math.sign(Number(pull[1])) * towardsLaser;
      assert.equal(sign, shape === "concave" ? -1 : 1, name + " " + shape + ": " + d);
    }
    assert.ok(part.indexOf('data-laser-slider="Rc' + (i + 1) + '"') !== -1, name + "'s radius slider after its shapes");
  });
  assert.deepEqual(attributeValues(html, "data-laser-note"), ["behind"]);
  // The theory has a page of its own (study.test.js); nothing scrolls to it here.
  assert.equal((html.match(/\sdata-laser-learn[\s>]/g) || []).length, 0);
  const page = read("js/laser/page.js");
  for (const name of PAGE_CONTROLS.concat(PAGE_READOUTS, PAGE_CHOICES, ["fire", "qSwitch", "qSwitchState"])) {
    assert.ok(page.includes('"' + name + '"'), "page.js uses " + name);
  }
  // Each slider is a range input, named by its own <label for="...">.
  for (const name of PAGE_CONTROLS) {
    const input = html.match(new RegExp('<input\\b[^>]*\\sdata-laser-control="' + name + '"[^>]*>'));
    assert.ok(input, name);
    assert.match(input[0], /\stype="range"/);
    const id = (input[0].match(/\sid="([^"]+)"/) || [])[1];
    assert.ok(id, name + " has an id");
    assert.match(html, new RegExp('<label\\b[^>]*\\sfor="' + id + '"'), name + " has a label");
  }
  // Each number box is a text input with the decimal keypad, named by its
  // slider's label (aria-labelledby the label's id). Not type="number":
  // some browsers hand the page "" for a decimal comma ("13,5"), and
  // page.js reads the number itself (stage 6b review).
  for (const name of PAGE_CONTROLS) {
    const box = html.match(new RegExp('<input\\b[^>]*\\sdata-laser-input="' + name + '"[^>]*>'));
    assert.ok(box, name + " has a number box");
    assert.match(box[0], /\stype="text"/);
    assert.match(box[0], /\sinputmode="decimal"/, "the keypad with a decimal point");
    const labelId = (box[0].match(/\saria-labelledby="([^"]+)"/) || [])[1];
    assert.ok(labelId, name + "'s box is named");
    assert.match(html, new RegExp('<label\\b[^>]*\\sid="' + labelId + '"'), name + "'s box is named by a label");
  }
  // Buttons are type="button"; the "behind" note starts hidden.
  for (const tag of html.match(/<button\b[^>]*>/g) || []) assert.match(tag, /\stype="button"/);
  assert.match(html, /<p\b[^>]*\sdata-laser-note="behind"[^>]*\shidden[\s>]/);
});

test("css/laser.css: whatever page.js hides on the stage stays hidden, whatever its own display rule", () => {
  // .lab-readout (display: flex) and .btn (display: inline-flex) would
  // otherwise show a readout or the Fire button that page.js hid.
  const css = read("css/laser.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = css.match(/(^|\})\s*\.laser-stage \[hidden\]\s*\{([^}]*)\}/);
  assert.ok(rule, "css/laser.css has a rule for .laser-stage [hidden]");
  assert.match(rule[2], /display:\s*none\s*;/);
  // Nothing in the laser stylesheet is more specific and shows them again.
  assert.doesNotMatch(css, /\.laser-stage[^{]*\.(lab-readout|btn)\b[^{]*\{[^}]*display:/);
});

/* ---------- no colour written out ---------- */

test("css/laser.css: every animation stops for a visitor who asks for less motion", () => {
  const css = read("css/laser.css").replace(/\/\*[\s\S]*?\*\//g, "");
  // The blocks of @media (prefers-reduced-motion: reduce), found by
  // counting braces, and the rest of the file.
  const blocks = [];
  let rest = "";
  let from = 0;
  const opening = /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{/g;
  let found;
  while ((found = opening.exec(css)) !== null) {
    let depth = 1;
    let end = opening.lastIndex;
    while (depth > 0) {
      if (css[end] === "{") depth += 1;
      if (css[end] === "}") depth -= 1;
      end += 1;
    }
    rest += css.slice(from, found.index);
    blocks.push(css.slice(opening.lastIndex, end - 1));
    from = end;
    opening.lastIndex = end;
  }
  rest += css.slice(from);
  assert.ok(blocks.length >= 1, "css/laser.css has a reduced-motion block");
  // The selectors the blocks stop: each rule there with "animation: none".
  const stopped = [];
  for (const block of blocks) {
    for (const rule of block.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/\banimation\s*:\s*none\b/.test(rule[2])) continue;
      for (const selector of rule[1].split(",")) stopped.push(selector.trim());
    }
  }
  // Every rule elsewhere that runs an animation.
  const animated = [];
  for (const rule of rest.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/\banimation\s*:/.test(rule[2]) || /\banimation\s*:\s*none\b/.test(rule[2])) continue;
    for (const selector of rule[1].split(",")) animated.push(selector.trim());
  }
  assert.ok(animated.length >= 2, "Fire's ring and bolt are animated: " + animated);
  for (const selector of animated) assert.ok(stopped.includes(selector), selector + " keeps moving for a visitor who asked for less");
});

test("css/laser.css: theme variables only, no colour written out", () => {
  assert.deepEqual(colourLiteralsInCss(read("css/laser.css")), []);
});

// materials.js is the one exception: the physical colours of the media and
// the beams (stage 10c), each tested for contrast in materials.test.js.
const COLOUR_FILE = "materials.js";

test("js/laser/ui/*.js and js/laser/page.js: no colour written out, except in materials.js", () => {
  const files = UI_FILES.filter((file) => file !== COLOUR_FILE).map((file) => "js/laser/ui/" + file).concat(["js/laser/page.js"]);
  for (const file of files) assert.deepEqual(colourLiteralsInJs(read(file)), [], file);
  // The exception holds colours, and is still listed (so it is loaded).
  assert.ok(UI_FILES.includes(COLOUR_FILE));
  assert.ok(colourLiteralsInJs(read("js/laser/ui/" + COLOUR_FILE)).length > 0, "materials.js holds the physical colours");
});

/* ---------- index.html ---------- */

test("index.html: every js/laser/ui file on disk is in UI_FILES (tests/laser/helpers.js)", () => {
  const onDisk = fs.readdirSync(path.join(ROOT, "js", "laser", "ui")).filter((f) => f.endsWith(".js")).sort();
  assert.deepEqual(onDisk, UI_FILES.slice().sort());
});

test("index.html: the engine, then the UI, then page.js, after the site's own scripts", () => {
  const scripts = scriptsIn(read("index.html"));
  const laser = scripts.filter((src) => src.startsWith("js/laser/"));
  const expected = ENGINE_FILES.map((f) => "js/laser/engine/" + f)
    .concat(UI_FILES.map((f) => "js/laser/ui/" + f))
    .concat(["js/laser/page.js"]);
  assert.deepEqual(laser, expected);
  // Each laser script once, and all after the scripts page.js relies on.
  const firstLaser = scripts.indexOf(expected[0]);
  for (const needed of ["js/content.js", "js/main.js", "js/router.js", "js/labs.js"]) {
    const at = scripts.indexOf(needed);
    assert.ok(at !== -1 && at < firstLaser, needed + " loads before the laser files");
  }
  // Nothing else is loaded between the laser files.
  assert.deepEqual(scripts.slice(firstLaser, firstLaser + expected.length), expected);
});

test("index.html: css/laser.css is linked once, after the shared stylesheets", () => {
  const sheets = stylesheetsIn(read("index.html"));
  assert.equal(sheets.filter((s) => s === "css/laser.css").length, 1);
  for (const shared of ["css/style.css", "css/site.css", "css/labs.css"]) {
    assert.ok(sheets.indexOf(shared) < sheets.indexOf("css/laser.css"), shared + " before css/laser.css");
  }
});

/* ---------- the route and the way in ---------- */

test("data/site.json: the laser route is there, hidden from the menu, named in both languages", () => {
  const entries = readJSON("data/site.json").nav.filter((entry) => entry.route === "laser");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].hidden, true);
  for (const lang of LANGS) assert.ok(String(entries[0].label[lang] || "").trim(), "label." + lang);
});

test("sections/labs.html: one banner links to the laser page, from a list that can be emptied", () => {
  const html = read("sections/labs.html").replace(/<!--[\s\S]*?-->/g, "");
  const links = html.match(/<a\b[^>]*data-goto="laser"[^>]*>/g) || [];
  assert.equal(links.length, 1, "one link to the laser page");
  assert.match(links[0], /\shref="\?view=laser"/);
  // The banner is the item of a list, so deleting its words in the data
  // removes the whole card (content.js), not just its text.
  const banner = listTemplates(html).filter((t) => t.list === "featured.items");
  assert.equal(banner.length, 1, "the banner is the template of data-list=\"featured.items\"");
  assert.match(banner[0].html, /data-goto="laser"/);
  assert.equal(outsideTemplates(html).includes('data-goto="laser"'), false, "no banner outside the list");
});

test("sections/labs.html: every word the page and its lists ask for is in data/labs.json", () => {
  const html = read("sections/labs.html");
  const data = readJSON("data/labs.json");
  function checkWords(keys, source, where) {
    for (const key of keys) {
      const value = valueAt(source, key);
      assert.ok(value && typeof value === "object", where + key + " is not in data/labs.json");
      for (const lang of LANGS) assert.ok(String(value[lang] || "").trim(), where + key + "." + lang + " is empty");
    }
  }
  checkWords(attributeValues(outsideTemplates(html), "data-text"), data, "");
  const lists = listTemplates(html);
  assert.ok(lists.length >= 2, "the banner and the simulations");
  for (const template of lists) {
    const items = valueAt(data, template.list);
    assert.ok(Array.isArray(items) && items.length >= 1, template.list + " is a list with items");
    items.forEach((item, index) => {
      checkWords(attributeValues(template.html, "data-text"), item, template.list + "." + index + ".");
    });
  }
});
