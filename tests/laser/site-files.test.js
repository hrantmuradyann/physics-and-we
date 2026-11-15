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
    for (const key of keys) wordPairs(value[key], where ? where + "." + key : key, list);
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

test("sections/laser.html: no styles, scripts, <header> or <footer>; the silver lines around it", () => {
  const raw = read("sections/laser.html");
  const html = raw.replace(/<!--[\s\S]*?-->/g, "");
  assert.doesNotMatch(html, /\sstyle\s*=/i, "a style= attribute (CSS goes in css/laser.css)");
  assert.doesNotMatch(html, /<style\b/i, "a <style> block");
  assert.doesNotMatch(html, /<script\b/i, "a <script> (it would never run in a fragment)");
  assert.doesNotMatch(html, /<header\b/i, "a <header> picks up the site's header bar");
  assert.doesNotMatch(html, /<footer\b/i, "a <footer> picks up the site's footer bar");
  assert.match(html.trim(), /^<div class="line-art">[\s\S]*<\/div>$/, "wrapped in <div class=\"line-art\">");
});

// The pictures js/laser/page.js draws, by their data-laser-canvas names
// (tests/laser/page.test.js uses the same list).
const PAGE_CANVASES = ["bench", "power", "photons", "levels"];

test("sections/laser.html: the four canvases, each a picture for screen readers, each described in the data", () => {
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
const PAGE_CONTROLS = ["pump", "coupler", "slowMotion"];
const PAGE_READOUTS = ["pumpThreshold", "currentThreshold", "flashThreshold", "x", "gth", "tau_c", "P_out", "peak",
  "powerNow", "T_best", "period", "time"];
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
  assert.deepEqual(attributeValues(html, "data-laser-action").sort(), ["fire", "learn", "play", "reset"]);
  // Fire starts hidden: the default bench has no flashlamp.
  assert.match(html, /<button\b[^>]*\sdata-laser-action="fire"[^>]*\shidden[\s>]/);
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
  // The pump slider's name is written by page.js (it depends on the pump):
  // its label has data-laser-name, not data-text.
  assert.deepEqual(attributeValues(html, "data-laser-name"), ["pump"]);
  const pumpName = html.match(/<label\b[^>]*\sdata-laser-name="pump"[^>]*>/);
  assert.match(pumpName[0], /\sfor="laser-pump"/);
  assert.doesNotMatch(pumpName[0], /\sdata-text=/);
  assert.deepEqual(attributeValues(html, "data-laser-note"), ["behind"]);
  // The theory the "learn" button scrolls to is on the page, once.
  assert.equal((html.match(/\sdata-laser-learn[\s>]/g) || []).length, 1);
  const page = read("js/laser/page.js");
  for (const name of PAGE_CONTROLS.concat(PAGE_READOUTS, PAGE_CHOICES, ["fire"])) {
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

test("css/laser.css: theme variables only, no colour written out", () => {
  assert.deepEqual(colourLiteralsInCss(read("css/laser.css")), []);
});

test("js/laser/ui/*.js and js/laser/page.js: no colour written out", () => {
  const files = UI_FILES.map((file) => "js/laser/ui/" + file).concat(["js/laser/page.js"]);
  for (const file of files) assert.deepEqual(colourLiteralsInJs(read(file)), [], file);
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
