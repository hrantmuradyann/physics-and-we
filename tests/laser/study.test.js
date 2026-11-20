/* The study page (stage 12): ?view=laser-study, the laser explained in
   chapters, each with a "dig deeper" part, its formulas typeset by KaTeX.

   - data/laser-study.json: every word in both languages, every formula
     well formed and accepted by the real KaTeX (vendor/katex, run in Node);
   - js/laser-study.js: loads KaTeX only when the page is shown, then turns
     each $…$ and $$…$$ in the page's rich text into typeset maths. It runs
     here on a small DOM of its own (the fake browser has no text nodes);
   - the menu, the router's "view:shown" and the simulator's link to it.

   Run: node --test (from the repo root). */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { ROOT, REAL_ROOT } = require("./helpers.js");

const LANGS = ["hy", "en"];
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const readJSON = (relative) => JSON.parse(read(relative));

const study = readJSON("data/laser-study.json");

// Every section of the book, with its chapter.
function sections() {
  const out = [];
  study.chapters.forEach((chapter) => (chapter.sections || []).forEach((section) => out.push({ chapter, section })));
  return out;
}

// Every { hy, en } rich text of the book, by its place.
function richParts() {
  const parts = [];
  study.chapters.forEach((chapter) => {
    if (chapter.intro) parts.push({ where: chapter.id + " intro", pair: chapter.intro });
  });
  for (const { section } of sections()) {
    parts.push({ where: section.id + " text", pair: section.text });
    if (section.deeper) parts.push({ where: section.id + " deeper", pair: section.deeper.text });
  }
  return parts;
}

// Every rich text with its place, and the sources.
function richTexts() {
  const found = [];
  for (const { where, pair } of richParts()) for (const lang of LANGS) found.push({ where: where + "." + lang, text: pair[lang] });
  for (const lang of LANGS) found.push({ where: "sources." + lang, text: study.sources.text[lang] });
  return found;
}

// Every plain { hy, en } of the book (titles, the pictures' words).
function plainTexts() {
  const found = [];
  const add = (where, pair) => { for (const lang of LANGS) found.push({ where: where + "." + lang, text: pair[lang] }); };
  study.chapters.forEach((chapter) => add(chapter.id + " title", chapter.title));
  for (const { section } of sections()) {
    add(section.id + " title", section.title);
    if (section.deeper) add(section.id + " deeper.title", section.deeper.title);
    if (section.picture) for (const key of ["alt", "caption", "todo"]) add(section.id + " picture." + key, section.picture[key]);
  }
  return found;
}

/* ---------- the words ---------- */

test("the book: seven chapters in the owner's order, each with numbered sections, in both languages", () => {
  assert.deepEqual(study.chapters.map((c) => c.id),
    ["history", "special", "medium", "pumping", "resonator", "pulses", "safety"]);
  const ids = new Set();
  const unique = (id, what) => {
    assert.match(id, /^[a-z0-9-]+$/, what + " has an id");
    assert.ok(!ids.has(id), "ids differ: " + id);
    ids.add(id);
  };
  study.chapters.forEach((chapter) => {
    unique(chapter.id, "a chapter");
    for (const lang of LANGS) assert.ok(chapter.title[lang] && chapter.title[lang].trim(), chapter.id + " title." + lang);
    if (chapter.intro) for (const lang of LANGS) assert.ok(chapter.intro[lang], chapter.id + " intro." + lang);
    assert.ok(chapter.sections.length >= 3, chapter.id + " has its sections");
  });
  for (const { chapter, section } of sections()) {
    unique(section.id, "a section of " + chapter.id);
    for (const lang of LANGS) {
      assert.ok(section.title[lang] && section.title[lang].trim(), section.id + " title." + lang);
      assert.ok(section.text[lang] && section.text[lang].length > 300, section.id + " text." + lang);
      if (section.deeper) {
        assert.ok(section.deeper.title[lang] && section.deeper.title[lang].trim(), section.id + " deeper.title." + lang);
        assert.ok(section.deeper.text[lang] && section.deeper.text[lang].length > 300, section.id + " deeper.text." + lang);
      }
    }
  }
  const all = sections();
  assert.ok(all.length >= 30, "the outline's sections (" + all.length + ")");
  assert.ok(study.chapters[0].sections.every((s) => !s.deeper), "the history has nothing deeper: it is history");
  assert.ok(all.filter((x) => x.section.deeper).length >= 20, "most sections can be dug deeper");
  for (const id of ["einstein", "meetings", "levels", "ruby", "neodymium", "he-ne", "flashlamp", "diodes", "discharge", "threshold", "giant-pulse", "eye"]) {
    assert.ok(ids.has(id), "the outline's section " + id);
  }
  for (const key of ["title", "lead"]) for (const lang of LANGS) assert.ok(study.head[key][lang], "head." + key + "." + lang);
  for (const lang of LANGS) {
    assert.ok(study.simulator.label[lang], "simulator.label." + lang);
    assert.ok(study.sources.title[lang], "sources.title." + lang);
  }
  assert.equal(study.simulator.route, "laser", "the button opens the simulator");
});

test("a place for a picture in nearly every section: what it should show, in both languages", () => {
  let places = 0;
  for (const { section } of sections()) {
    const picture = section.picture;
    if (!picture) continue;
    places += 1;
    assert.equal(typeof picture.image, "string", section.id + ": image is a file name, \"\" until there is one");
    if (picture.image) {
      // A misspelt name (the server tells Ruby.png from ruby.png) would show a
      // broken picture where the description was. images/ is not copied by
      // the mutation check, so look in the real repo.
      assert.ok(!/^[a-z]+:|^\/\//i.test(picture.image), section.id + ": the picture is a file of the site, not a link");
      assert.ok(fs.existsSync(path.join(REAL_ROOT, picture.image)), section.id + ": the picture " + picture.image + " exists (the name's capitals too)");
      const folder = path.dirname(path.join(REAL_ROOT, picture.image));
      assert.ok(fs.readdirSync(folder).includes(path.basename(picture.image)), section.id + ": " + picture.image + " is spelt with the file's own capitals");
    }
    for (const key of ["alt", "caption", "todo"]) {
      for (const lang of LANGS) assert.ok(picture[key] && picture[key][lang] && picture[key][lang].trim(), section.id + " picture." + key + "." + lang);
    }
    for (const lang of LANGS) assert.ok(picture.todo[lang].length > 40, section.id + ": the todo says what to draw");
  }
  assert.ok(places >= sections().length - 3, "pictures planned (" + places + " of " + sections().length + ")");
});

test("every formula sign is inside a formula: the text has no bare symbols", () => {
  // Outside $…$ and the links' addresses, no sign that belongs in KaTeX.
  const bare = /[_^×≈√=≤≥·]|[Ͱ-Ͽ]/;
  const outside = (text) => text.replace(/\$\$[^$]+\$\$|\$[^$]+\$/g, " ").replace(/\]\([^)]*\)/g, "]");
  for (const { where, text } of richTexts()) {
    if (where.startsWith("sources")) continue;
    const rest = outside(text);
    const at = rest.search(bare);
    assert.equal(at, -1, where + ": a bare formula sign near " + JSON.stringify(rest.slice(Math.max(0, at - 30), at + 30)));
  }
  for (const { where, text } of plainTexts()) {
    assert.ok(!text.includes("$"), where + ": a plain text cannot show a formula");
    const at = text.search(bare);
    assert.equal(at, -1, where + ": a bare formula sign near " + JSON.stringify(text.slice(Math.max(0, at - 30), at + 30)));
  }
});

test("the page shows nothing meant for the developers", () => {
  for (const { where, text } of richTexts()) {
    for (const mark of ["[A §", "[A§", "[A]", "[calc", "[CHECK", "TRY IT", "PICTURE", "laser-physics.md", "laser.json", "textbook value"]) {
      assert.ok(!text.includes(mark), where + " has " + JSON.stringify(mark));
    }
    assert.ok(!/\[S\d/.test(text), where + " cites a source by its number");
    // The site's rich text knows **bold**, not *italic*: a lone star would show.
    assert.ok(!text.replace(/\*\*/g, "").includes("*"), where + " has a lone *");
  }
});

test("the two languages have the same formulas, in the same order", () => {
  const formulas = (text) => (text.match(/\$\$[\s\S]+?\$\$|\$[^$]+\$/g) || []);
  for (const { where, pair } of richParts()) assert.deepEqual(formulas(pair.hy), formulas(pair.en), where);
});

/* ---------- the formulas ---------- */

// The same split the page makes (checked against laser-study.js below).
function formulasOf(text) {
  return loadStudy().LaserStudy.pieces(text).filter((piece) => piece.tex !== undefined);
}

test("every $ is paired and every formula stays inside one piece of text the page can see", () => {
  for (const { where, text } of richTexts()) {
    const pieces = loadStudy().LaserStudy.pieces(text);
    for (const piece of pieces) {
      if (piece.tex === undefined) assert.ok(!piece.text.includes("$"), where + ": a lone $ near " + JSON.stringify(piece.text.slice(0, 60)));
      else {
        // data-rich turns **…** into bold and […](…) into a link before the
        // formulas are found, and a formula must lie in one text node.
        assert.ok(!piece.tex.includes("**"), where + ": ** inside " + piece.tex);
        assert.ok(!/\]\(/.test(piece.tex), where + ": ]( inside " + piece.tex);
        assert.ok(!piece.tex.includes("\n"), where + ": a new line inside " + piece.tex);
        assert.ok(piece.tex.trim().length > 0, where + ": an empty formula");
      }
    }
    // A display formula is a paragraph of its own.
    for (const paragraph of text.split(/\n\s*\n/)) {
      if (paragraph.includes("$$")) assert.match(paragraph.trim(), /^\$\$[^$]+\$\$$/, where + ": $$ … $$ alone in its paragraph");
    }
  }
});

test("every formula is accepted by the vendored KaTeX", () => {
  // The vendored files are read from the real project (the mutation check's
  // copy holds only what the other tests read).
  const katex = require(path.join(REAL_ROOT, "vendor", "katex", "katex.min.js"));
  let count = 0;
  for (const { where, text } of richTexts()) {
    for (const piece of formulasOf(text)) {
      assert.doesNotThrow(() => katex.renderToString(piece.tex, { displayMode: piece.display, throwOnError: true }),
        where + ": " + piece.tex);
      count += 1;
    }
  }
  assert.ok(count >= 150, "the formulas were found (" + count + ")");
});

test("KaTeX is vendored: the script, the stylesheet, its fonts and the licence", () => {
  const dir = path.join(REAL_ROOT, "vendor", "katex");
  for (const name of ["katex.min.js", "katex.min.css", "LICENSE", "README.md"]) {
    assert.ok(fs.existsSync(path.join(dir, name)), name);
  }
  const css = fs.readFileSync(path.join(dir, "katex.min.css"), "utf8");
  const woff2 = [...css.matchAll(/url\((fonts\/[^)]+\.woff2)\)/g)].map((m) => m[1]);
  assert.ok(woff2.length >= 10);
  for (const font of woff2) assert.ok(fs.existsSync(path.join(dir, font)), font);
  assert.match(fs.readFileSync(path.join(dir, "LICENSE"), "utf8"), /MIT License/);
});

/* ---------- the menu, the page, the router, the simulator ---------- */

test("the menu has Study materials right after the labs; its laser poster opens the hidden laser book", () => {
  const site = readJSON("data/site.json");
  const routes = site.nav.map((entry) => entry.route);
  const at = routes.indexOf("study");
  assert.equal(routes[at - 1], "labs");
  assert.ok(!site.nav[at].hidden, "in the menu");
  assert.equal(site.nav[at].label.en, "Study materials");
  assert.ok(site.nav[at].label.hy);
  assert.ok(site.nav[routes.indexOf("laser-study")].hidden, "the book is reached from its poster");
  assert.match(read("sections/study.html"), /<a [^>]*lab-feature[^>]*data-route="route"/);
  const posters = readJSON("data/study.json").featured.items;
  assert.equal(posters.length, 1);
  assert.equal(posters[0].route, "laser-study", "the laser poster opens the laser book");
  for (const key of ["eyebrow", "title", "text", "open"]) for (const lang of LANGS) assert.ok(posters[0][key][lang], key + "." + lang);
});
test("the page's layout: the simulator button, chapters of sections, a dig-deeper <details> and a picture each, the sources", () => {
  const html = read("sections/laser-study.html");
  assert.match(html, /data-route="simulator\.route"/);
  assert.match(html, /<article[^>]*data-study-chapter[\s\S]*?data-rich="intro"[\s\S]*?data-list="sections"[\s\S]*?<section[^>]*data-study-section/);
  // Each section's dig-deeper part is a <details> whose <summary> carries the
  // shared word (a list item reads only its own keys, so it comes from "ui").
  assert.match(html, /<details[^>]*data-study-deeper[^>]*>\s*<summary[^>]*>[\s\S]*?data-ui="digDeeper"[\s\S]*?<\/summary>/);
  const ui = readJSON("data/site.json").ui;
  for (const key of ["digDeeper", "toContents", "pictureToCome"]) for (const lang of LANGS) assert.ok(ui[key][lang], "ui." + key + "." + lang);
  assert.match(html, /data-rich="text"/);
  assert.match(html, /data-rich="deeper\.text"/);
  assert.match(html, /data-rich="sources\.text"/);
  // The picture: the image, its caption, and the box for until it exists.
  assert.match(html, /<figure[^>]*data-study-figure[\s\S]*?<img[^>]*data-study-image[^>]*data-image="picture\.image"[^>]*data-alt="picture\.alt"[\s\S]*?data-study-caption[^>]*data-text="picture\.caption"[\s\S]*?data-study-todo[\s\S]*?data-ui="pictureToCome"[\s\S]*?data-study-todo-text[^>]*data-text="picture\.todo"[\s\S]*?<\/figure>/);
  // Every page is built in the background: a picture must not download
  // before the visitor scrolls to it.
  assert.match(html, /<img[^>]*loading="lazy"[^>]*data-study-image/, "the book's pictures load only when scrolled to");
  // Lists styled without bullets keep their list meaning for screen readers (Safari).
  assert.equal((html.match(/<ol[^>]*role="list"/g) || []).length, 2, "the contents and its sections are lists");
  // The numbers are the page's: a place in each heading, none in the JSON's titles.
  assert.match(html, /<h2[^>]*>\s*<span[^>]*data-study-number[^>]*><\/span>\s*<span data-text="title">/);
  assert.match(html, /<h3[^>]*>\s*<span[^>]*data-study-number[^>]*><\/span>\s*<span data-text="title">/);
  for (const { where, text } of plainTexts()) {
    if (where.includes(" title.")) assert.ok(!/^\s*\d/.test(text), where + " starts with a number: the page writes it");
  }
  assert.ok(!/<script/i.test(html), "no script in a fragment");
  assert.ok(!/style=/i.test(html), "no inline style");
  const index = read("index.html");
  assert.match(index, /<script src="js\/laser-study\.js"><\/script>/);
  assert.ok(index.indexOf("js/router.js") < index.indexOf("js/laser-study.js"));
  assert.ok(!index.includes("katex"), "KaTeX is not loaded on every page");
});

test("the router says which page is shown", () => {
  const router = read("js/router.js");
  const activate = router.slice(router.indexOf("function activate("), router.indexOf("function markCurrentLink("));
  assert.match(activate, /dispatchEvent\(new CustomEvent\("view:shown", \{ detail: \{ route: route \} \}\)\)/);
});

test("the simulator's dig-deeper button and its last section lead to the study page", () => {
  const html = read("sections/laser.html");
  const laser = readJSON("data/laser.json");
  assert.equal(laser.learn.route, "laser-study");
  assert.ok(!laser.learn.chapters, "the old theory chapters are gone");
  assert.equal((html.match(/data-route="learn\.route"/g) || []).length, 2, "the button at the top and the link at the bottom");
  assert.ok(!html.includes('data-laser-action="learn"'));
  assert.ok(!read("js/laser/page.js").includes("data-laser-learn"));
});

/* ---------- js/laser-study.js on a small DOM ---------- */

// Just enough DOM for laser-study.js: elements with children, text nodes,
// attributes, querySelectorAll by attribute, classes; a head that records
// what is added to it; window events.
function makeDom() {
  function node(props) {
    return Object.assign({ childNodes: [], parentNode: null, attributes: {} }, props);
  }
  function element(tag, attrs) {
    const el = node({ nodeType: 1, tagName: tag.toUpperCase(), className: "" });
    Object.assign(el.attributes, attrs || {});
    el.getAttribute = (name) => (name in el.attributes ? el.attributes[name] : null);
    el.setAttribute = (name, value) => { el.attributes[name] = String(value); };
    el.appendChild = (child) => {
      if (child.parentNode) child.parentNode.removeChild(child);
      el.childNodes.push(child);
      child.parentNode = el;
      return child;
    };
    el.insertBefore = (child, before) => {
      const at = el.childNodes.indexOf(before);
      el.childNodes.splice(at, 0, child);
      child.parentNode = el;
      return child;
    };
    el.removeChild = (child) => {
      el.childNodes.splice(el.childNodes.indexOf(child), 1);
      child.parentNode = null;
      return child;
    };
    el.scrolledTo = [];
    el.scrollIntoView = (options) => { el.scrolledTo.push(options); };
    el.querySelectorAll = (selector) => {
      const name = selector.match(/^\[([a-z-]+)\]$/)[1];
      const out = [];
      (function walk(n) {
        for (const child of n.childNodes) {
          if (child.nodeType === 1) {
            if (name in child.attributes) out.push(child);
            walk(child);
          }
        }
      })(el);
      return out;
    };
    return el;
  }
  function text(value) {
    return node({ nodeType: 3, nodeValue: value });
  }
  const listeners = {};
  const head = element("head");
  const documentListeners = {};
  const document = {
    head,
    createElement: (tag) => element(tag),
    createTextNode: text,
    addEventListener(type, fn) { (documentListeners[type] = documentListeners[type] || []).push(fn); },
    click(target) {
      return document.clickWith(target, {});
    },
    // A click with extra properties: { metaKey: true }, { button: 1 }, …
    clickWith(target, extra) {
      const event = Object.assign({ target, button: 0, prevented: false, preventDefault() { this.prevented = true; } }, extra);
      (documentListeners.click || []).forEach((fn) => fn(event));
      return event;
    },
    listenerCount: (type) => (documentListeners[type] || []).length
  };
  const window = {
    document,
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    dispatchEvent(event) { (listeners[event.type] || []).forEach((fn) => fn(event)); },
    listenerCount: (type) => (listeners[type] || []).length
  };
  window.window = window;
  return { window, document, head, element, text };
}

// The text of a node as a reader sees it: KaTeX's output stands as [tex] or [[tex]].
function shown(n) {
  if (n.nodeType === 3) return n.nodeValue;
  if (n.attributes["data-tex"] !== undefined) return n.attributes["data-display"] === "true" ? "[[" + n.attributes["data-tex"] + "]]" : "[" + n.attributes["data-tex"] + "]";
  return n.childNodes.map(shown).join("");
}

function loadStudy(dom) {
  const d = dom || makeDom();
  const context = vm.createContext(d.window);
  vm.runInContext(read("js/laser-study.js"), context, { filename: "js/laser-study.js" });
  return d.window;
}

// A fake KaTeX that marks what it was asked to typeset.
function fakeKatex(calls) {
  return {
    render(tex, span, options) {
      calls.push({ tex, display: options.displayMode, throwOnError: options.throwOnError });
      span.setAttribute("data-tex", tex);
      span.setAttribute("data-display", String(options.displayMode));
    }
  };
}

// A built page: two rich paragraphs, one with bold between formulas, a
// display formula and a plain one with no formula at all.
function buildPage(dom) {
  const container = dom.element("section");
  const rich = dom.element("div", { "data-rich": "text" });
  const p1 = dom.element("p");
  p1.appendChild(dom.text("Gain $g = \\sigma N$ and loss $\\gamma$: "));
  const strong = dom.element("strong");
  strong.appendChild(dom.text("so $x > 1$"));
  p1.appendChild(strong);
  p1.appendChild(dom.text(" ends."));
  const p2 = dom.element("p");
  p2.appendChild(dom.text("$$R_1 R_2 e^{2gl} = 1$$"));
  const p3 = dom.element("p");
  p3.appendChild(dom.text("No formula costs $5 here? No: one lone sign stays."));
  rich.appendChild(p1);
  rich.appendChild(p2);
  rich.appendChild(p3);
  container.appendChild(rich);
  const plain = dom.element("p");                 // outside data-rich: never touched
  plain.appendChild(dom.text("$a$"));
  container.appendChild(plain);
  return { container, p1, p2, p3, plain };
}

function fire(window, type, detail) {
  window.dispatchEvent({ type, detail });
}

test("laser-study.js: pieces() splits text into words, inline and display formulas", () => {
  const { LaserStudy } = loadStudy();
  const plain = (x) => JSON.parse(JSON.stringify(x));
  assert.deepEqual(plain(LaserStudy.pieces("a $x$ b $$y$$ c")), [
    { text: "a " }, { tex: "x", display: false }, { text: " b " }, { tex: "y", display: true }, { text: " c" }
  ]);
  assert.deepEqual(plain(LaserStudy.pieces("no maths")), [{ text: "no maths" }]);
  assert.deepEqual(plain(LaserStudy.pieces("$$a$$")), [{ tex: "a", display: true }]);
  assert.deepEqual(plain(LaserStudy.pieces("one $ alone")), [{ text: "one $ alone" }], "a lone $ is text");
  assert.deepEqual(plain(LaserStudy.pieces("$a$$b$")), [{ tex: "a", display: false }, { tex: "b", display: false }]);
});

test("laser-study.js: nothing is loaded or typeset while the page is only prefetched", () => {
  const dom = makeDom();
  const window = loadStudy(dom);
  const page = buildPage(dom);
  fire(window, "section:ready", { route: "laser-study", container: page.container });
  fire(window, "view:shown", { route: "labs" });
  assert.equal(dom.head.childNodes.length, 0, "no KaTeX downloaded");
  assert.equal(shown(page.p1), "Gain $g = \\sigma N$ and loss $\\gamma$: so $x > 1$ ends.");
});

test("laser-study.js: shown, it loads KaTeX once and typesets every formula of the rich text", () => {
  const dom = makeDom();
  const window = loadStudy(dom);
  const page = buildPage(dom);
  fire(window, "section:ready", { route: "laser-study", container: page.container });
  fire(window, "view:shown", { route: "laser-study" });
  fire(window, "view:shown", { route: "laser-study" });
  // The stylesheet and the script, once each, from vendor/katex.
  assert.equal(dom.head.childNodes.length, 2);
  const [link, script] = dom.head.childNodes;
  assert.equal(link.tagName, "LINK");
  assert.equal(link.attributes.rel, "stylesheet");
  assert.equal(link.attributes.href, "vendor/katex/katex.min.css");
  assert.equal(script.tagName, "SCRIPT");
  assert.equal(script.src, "vendor/katex/katex.min.js");
  assert.equal(shown(page.p1), "Gain $g = \\sigma N$ and loss $\\gamma$: so $x > 1$ ends.", "not before it loads");
  // The script arrives.
  const calls = [];
  window.katex = fakeKatex(calls);
  script.onload();
  assert.equal(shown(page.p1), "Gain $g = \\sigma N$ and loss $\\gamma$: so $x > 1$ ends.", "not before its stylesheet (it would show every formula twice)");
  link.onload();
  assert.equal(shown(page.p1), "Gain [g = \\sigma N] and loss [\\gamma]: so [x > 1] ends.");
  assert.equal(shown(page.p2), "[[R_1 R_2 e^{2gl} = 1]]");
  assert.equal(shown(page.p3), "No formula costs $5 here? No: one lone sign stays.");
  assert.equal(shown(page.plain), "$a$", "only the rich text");
  assert.equal(calls.length, 4);
  assert.ok(calls.every((c) => c.throwOnError === false), "a bad formula never breaks the page");
  assert.deepEqual(calls.map((c) => c.display), [false, false, false, true]);
  // The bold word keeps its formula inside it.
  assert.equal(page.p1.childNodes[page.p1.childNodes.length - 2].tagName, "STRONG");
  // Shown again: nothing typeset twice.
  fire(window, "view:shown", { route: "laser-study" });
  assert.equal(calls.length, 4);
});

test("laser-study.js: a language switch's new build is typeset at once; other pages are left alone", () => {
  const dom = makeDom();
  const window = loadStudy(dom);
  const calls = [];
  const first = buildPage(dom);
  fire(window, "section:ready", { route: "laser-study", container: first.container });
  fire(window, "view:shown", { route: "laser-study" });
  window.katex = fakeKatex(calls);
  dom.head.childNodes[0].onload();
  dom.head.childNodes[1].onload();
  const second = buildPage(dom);
  fire(window, "section:ready", { route: "laser-study", container: second.container, data: BOOK_DATA });
  assert.equal(shown(second.p2), "[[R_1 R_2 e^{2gl} = 1]]", "typeset without being shown again");
  const other = buildPage(dom);
  fire(window, "section:ready", { route: "laser", container: other.container });
  assert.equal(shown(other.p2), "$$R_1 R_2 e^{2gl} = 1$$");
  assert.equal(dom.head.childNodes.length, 2, "still loaded once");
});

test("laser-study.js: a build made while KaTeX is on its way is the one typeset when it lands", () => {
  const dom = makeDom();
  const window = loadStudy(dom);
  const calls = [];
  const first = buildPage(dom);
  fire(window, "section:ready", { route: "laser-study", container: first.container });
  fire(window, "view:shown", { route: "laser-study" });
  const second = buildPage(dom);
  fire(window, "section:ready", { route: "laser-study", container: second.container, data: BOOK_DATA });
  window.katex = fakeKatex(calls);
  dom.head.childNodes[0].onload();
  dom.head.childNodes[1].onload();
  assert.equal(shown(second.p2), "[[R_1 R_2 e^{2gl} = 1]]");
});

test("laser-study.js: if KaTeX does not arrive, the formulas stay as text and a later visit tries again", () => {
  const dom = makeDom();
  const window = loadStudy(dom);
  const page = buildPage(dom);
  fire(window, "section:ready", { route: "laser-study", container: page.container });
  fire(window, "view:shown", { route: "laser-study" });
  dom.head.childNodes[1].onerror();
  assert.equal(shown(page.p2), "$$R_1 R_2 e^{2gl} = 1$$");
  fire(window, "view:shown", { route: "laser-study" });
  const scripts = dom.head.childNodes.filter((n) => n.tagName === "SCRIPT");
  assert.equal(scripts.length, 2, "tried again");
  assert.equal(dom.head.childNodes.filter((n) => n.tagName === "LINK").length, 1, "the stylesheet once");
  window.katex = fakeKatex([]);
  scripts[1].onload();
  dom.head.childNodes[0].onload();
  assert.equal(shown(page.p2), "[[R_1 R_2 e^{2gl} = 1]]");
});

test("laser-study.js adds only the LaserStudy global", () => {
  const dom = makeDom();
  const before = new Set(Object.keys(dom.window));
  const window = loadStudy(dom);
  const added = Object.keys(window).filter((key) => !before.has(key));
  assert.deepEqual(added, ["LaserStudy"]);
  assert.equal(window.listenerCount("section:ready"), 1);
  assert.equal(window.listenerCount("view:shown"), 1);
});

test("laser-study.js: a chapter with nothing deeper loses its empty dig-deeper button at once", () => {
  const dom = makeDom();
  const window = loadStudy(dom);
  const container = dom.element("section");
  const article = dom.element("article");
  const full = dom.element("details", { "data-study-deeper": "" });
  full.appendChild(dom.element("summary"));
  full.appendChild(dom.element("div", { "data-rich": "deeper.text" }));
  const empty = dom.element("details", { "data-study-deeper": "" });
  empty.appendChild(dom.element("summary"));      // its text was missing, so the binder removed it
  article.appendChild(full);
  article.appendChild(empty);
  container.appendChild(article);
  fire(window, "section:ready", { route: "laser-study", container });
  assert.deepEqual(article.childNodes.map((n) => n === full), [true], "only the one with a text stays");
  assert.equal(dom.head.childNodes.length, 0, "and nothing is downloaded for it");
});

/* ---------- the book's contents and its links ---------- */

test("every link in the text leads to a chapter or a section that exists, named in words, the same in both languages", () => {
  const targets = new Set(study.chapters.map((c) => "#chapter-" + c.id).concat(sections().map((x) => "#section-" + x.section.id)));
  const links = (text) => [...text.matchAll(/\[([^\]]+)\]\((#[^)]*)\)/g)].map((m) => ({ words: m[1], href: m[2] }));
  let count = 0;
  for (const { where, pair } of richParts()) {
    assert.deepEqual(links(pair.hy).map((l) => l.href), links(pair.en).map((l) => l.href), where + ": the same links in hy and en");
    for (const lang of LANGS) {
      for (const link of links(pair[lang])) {
        assert.ok(targets.has(link.href), where + "." + lang + ": " + link.href + " is a chapter or a section");
        // The page numbers the book; a number written in a link would go
        // wrong the day a chapter or a section moves.
        assert.ok(!/\d/.test(link.words), where + "." + lang + ": a number in the link's words " + JSON.stringify(link.words));
        if (lang === "en") count += 1;
      }
    }
  }
  assert.ok(count >= 15, "the text links its chapters and sections (" + count + ")");
  for (const lang of LANGS) assert.ok(study.contents[lang], "contents." + lang);
});

test("the layout has the contents (each chapter with its sections), the chapters marked, and a way back under each", () => {
  const html = read("sections/laser-study.html");
  assert.match(html, /<nav[^>]*data-study-toc[\s\S]*?data-list="chapters"[\s\S]*?data-study-toc-chapter[\s\S]*?data-study-link[\s\S]*?data-list="sections"[\s\S]*?data-study-link[\s\S]*?<\/nav>/);
  assert.match(html, /<article[^>]*data-study-chapter/);
  assert.match(html, /data-study-top/);
  assert.ok(html.indexOf("data-study-toc") < html.indexOf("data-study-chapter"), "the contents come first");
});

const BOOK_DATA = { chapters: [
  { id: "a", sections: [{ id: "a1" }, { id: "a2" }] },
  { id: "b", sections: [{ id: "b1" }] },
  { id: "c", sections: [{ id: "c1" }] }
] };

// A built book like the page's: contents with each chapter's link and its
// sections' links, the chapters with their sections, a way back under each;
// the second chapter has a link to chapter c in its text, one to section a2
// and a link to an outside page.
function buildBook(dom) {
  const container = dom.element("section");
  const numbered = (tag, attrs) => {
    const el = dom.element(tag, attrs);
    const number = dom.element("span", { "data-study-number": "" });
    el.appendChild(number);
    el.number = number;
    return el;
  };
  const toc = dom.element("nav", { "data-study-toc": "" });
  const links = [];
  const sectionLinks = [];
  BOOK_DATA.chapters.forEach((chapter) => {
    const li = dom.element("li", { "data-study-toc-chapter": "" });
    const a = numbered("a", { "data-study-link": "" });
    a.appendChild(dom.text("title"));
    li.appendChild(a);
    links.push(a);
    const ol = dom.element("ol");
    chapter.sections.forEach(() => {
      const sli = dom.element("li");
      const sa = numbered("a", { "data-study-link": "" });
      sli.appendChild(sa);
      ol.appendChild(sli);
      sectionLinks.push(sa);
    });
    li.appendChild(ol);
    toc.appendChild(li);
  });
  container.appendChild(toc);
  const chapters = BOOK_DATA.chapters.map((chapter) => {
    const article = dom.element("article", { "data-study-chapter": "" });
    const heading = numbered("h2");
    article.appendChild(heading);
    const parts = chapter.sections.map(() => {
      const section = dom.element("section", { "data-study-section": "" });
      const h3 = numbered("h3");
      section.appendChild(h3);
      article.appendChild(section);
      return { section, heading: h3 };
    });
    const top = dom.element("a", { "data-study-top": "" });
    article.appendChild(top);
    container.appendChild(article);
    return { article, heading, sections: parts, top };
  });
  const rich = dom.element("div", { "data-rich": "text" });
  const inText = dom.element("a", { href: "#chapter-c" });
  const word = dom.element("span");
  inText.appendChild(word);
  const toSection = dom.element("a", { href: "#section-a2" });
  const outside = dom.element("a", { href: "https://example.org/" });
  rich.appendChild(inText);
  rich.appendChild(toSection);
  rich.appendChild(outside);
  chapters[1].sections[0].section.appendChild(rich);
  return { container, toc, links, sectionLinks, chapters, inText, word, toSection, outside };
}

test("laser-study.js: chapters and sections are numbered in order and named by their ids, in the headings and the contents", () => {
  const dom = makeDom();
  const window = loadStudy(dom);
  const book = buildBook(dom);
  fire(window, "section:ready", { route: "laser-study", container: book.container, data: BOOK_DATA });
  assert.deepEqual(book.chapters.map((c) => c.heading.number.textContent), ["1", "2", "3"]);
  assert.deepEqual(book.links.map((a) => a.number.textContent), ["1", "2", "3"]);
  const sectionNumbers = ["1.1", "1.2", "2.1", "3.1"];
  const sectionIds = ["a1", "a2", "b1", "c1"];
  const built = book.chapters.flatMap((c) => c.sections);
  assert.deepEqual(built.map((x) => x.heading.number.textContent), sectionNumbers);
  assert.deepEqual(book.sectionLinks.map((a) => a.number.textContent), sectionNumbers);
  assert.deepEqual(built.map((x) => x.section.attributes.id), sectionIds.map((id) => "section-" + id));
  assert.deepEqual(book.sectionLinks.map((a) => a.attributes.href), sectionIds.map((id) => "#section-" + id));
  dom.document.click(book.sectionLinks[1]);
  assert.equal(built[1].section.scrolledTo.length, 1, "a section's link in the contents scrolls to it");
  dom.document.click(book.toSection);
  assert.equal(built[1].section.scrolledTo.length, 2, "and so does one in the text");
});

test("laser-study.js: a picture shows its image, or until there is one what it should show, or nothing", () => {
  const dom = makeDom();
  const window = loadStudy(dom);
  const container = dom.element("section");
  const figure = (src, todo) => {
    const f = dom.element("figure", { "data-study-figure": "" });
    const img = dom.element("img", Object.assign({ "data-study-image": "" }, src ? { src } : {}));
    const caption = dom.element("figcaption", { "data-study-caption": "" });
    const box = dom.element("p", { "data-study-todo": "" });
    box.appendChild(dom.element("strong"));
    if (todo) box.appendChild(dom.element("span", { "data-study-todo-text": "" }));   // the binder drops a missing todo
    f.appendChild(img);
    f.appendChild(caption);
    f.appendChild(box);
    container.appendChild(f);
    return { f, img, caption, box };
  };
  const drawn = figure("images/study/ruby.jpg", true);
  const planned = figure(null, true);
  const none = figure(null, false);
  fire(window, "section:ready", { route: "laser-study", container });
  assert.deepEqual(drawn.f.childNodes, [drawn.img, drawn.caption], "the picture and its caption");
  assert.deepEqual(planned.f.childNodes, [planned.box], "the box saying what the picture will show");
  assert.ok(!container.childNodes.includes(none.f), "no picture planned: no figure");
  assert.ok(container.childNodes.includes(planned.f));
});

test("laser-study.js: the chapters are numbered and the contents and the ways back link to them", () => {
  const dom = makeDom();
  const window = loadStudy(dom);
  const book = buildBook(dom);
  fire(window, "section:ready", { route: "laser-study", container: book.container, data: BOOK_DATA });
  assert.equal(book.toc.attributes.id, "contents");
  book.chapters.forEach((chapter, i) => {
    assert.equal(chapter.article.attributes.id, "chapter-" + "abc"[i], "named by the chapter's id");
    assert.equal(book.links[i].attributes.href, "#chapter-" + "abc"[i]);
    assert.equal(chapter.top.attributes.href, "#contents");
  });
});

test("laser-study.js: a click on a link inside the book scrolls to its chapter, without the address changing", () => {
  const dom = makeDom();
  const window = loadStudy(dom);
  const book = buildBook(dom);
  fire(window, "section:ready", { route: "laser-study", container: book.container, data: BOOK_DATA });
  let event = dom.document.click(book.links[1]);
  assert.ok(event.prevented, "the router never sees the # (it would scroll to the top)");
  assert.equal(book.chapters[1].article.scrolledTo.length, 1);
  assert.equal(book.chapters[1].article.scrolledTo[0].block, "start");
  event = dom.document.click(book.word);                 // inside a "chapter 3" link in the text
  assert.ok(event.prevented);
  assert.equal(book.chapters[2].article.scrolledTo.length, 1);
  event = dom.document.click(book.chapters[0].top);
  assert.ok(event.prevented);
  assert.equal(book.toc.scrolledTo.length, 1, "back to the contents");
  event = dom.document.click(book.outside);
  assert.ok(!event.prevented, "a link to another site is left alone");
  event = dom.document.click(dom.element("a", { href: "#chapter-b" }));
  assert.ok(!event.prevented, "a link outside the book is left alone");
  assert.equal(dom.document.listenerCount("click"), 1, "one listener, however many builds");
  fire(window, "section:ready", { route: "laser-study", container: buildBook(dom).container, data: BOOK_DATA });
  assert.equal(dom.document.listenerCount("click"), 1);
});

test("laser-study.js: after a language switch the links lead into the new build", () => {
  const dom = makeDom();
  const window = loadStudy(dom);
  const first = buildBook(dom);
  fire(window, "section:ready", { route: "laser-study", container: first.container, data: BOOK_DATA });
  const second = buildBook(dom);
  fire(window, "section:ready", { route: "laser-study", container: second.container, data: BOOK_DATA });
  dom.document.click(second.links[2]);
  assert.equal(second.chapters[2].article.scrolledTo.length, 1);
  assert.equal(first.chapters[2].article.scrolledTo.length, 0);
});

test("laser-study.js: a new build without the contents does not scroll into the old build", () => {
  const dom = makeDom();
  const window = loadStudy(dom);
  const first = buildBook(dom);
  fire(window, "section:ready", { route: "laser-study", container: first.container, data: BOOK_DATA });
  const second = buildBook(dom);
  second.container.removeChild(second.toc);            // this build has no contents
  fire(window, "section:ready", { route: "laser-study", container: second.container, data: BOOK_DATA });
  const event = dom.document.click(second.chapters[0].top);
  assert.ok(!event.prevented, "nothing to scroll to");
  assert.equal(first.toc.scrolledTo.length, 0, "the old contents stay where they are");
});

test("laser-study.js: smooth scrolling, unless the visitor asked for less motion", () => {
  for (const reduce of [false, true]) {
    const dom = makeDom();
    dom.window.matchMedia = (query) => ({ matches: reduce && query === "(prefers-reduced-motion: reduce)" });
    const window = loadStudy(dom);
    const book = buildBook(dom);
    fire(window, "section:ready", { route: "laser-study", container: book.container, data: BOOK_DATA });
    dom.document.click(book.links[0]);
    assert.equal(book.chapters[0].article.scrolledTo[0].behavior, reduce ? "auto" : "smooth");
  }
});

test("laser-study.js: a click meant for a new tab or window is left to the browser", () => {
  const dom = makeDom();
  const window = loadStudy(dom);
  const book = buildBook(dom);
  fire(window, "section:ready", { route: "laser-study", container: book.container, data: BOOK_DATA });
  for (const key of ["metaKey", "ctrlKey", "shiftKey", "altKey"]) {
    const sent = dom.document.clickWith(book.links[0], { [key]: true });
    assert.ok(!sent.prevented, key);
  }
  const middle = dom.document.clickWith(book.links[0], { button: 1 });
  assert.ok(!middle.prevented, "the middle button");
  assert.equal(book.chapters[0].article.scrolledTo.length, 0);
});

test("laser-study.js: without its stylesheet KaTeX does not typeset; a stylesheet that fails is asked for again", () => {
  const dom = makeDom();
  const window = loadStudy(dom);
  const page = buildPage(dom);
  fire(window, "section:ready", { route: "laser-study", container: page.container });
  fire(window, "view:shown", { route: "laser-study" });
  const [link, script] = dom.head.childNodes;
  window.katex = fakeKatex([]);
  script.onload();
  link.onerror();
  assert.equal(shown(page.p2), "$$R_1 R_2 e^{2gl} = 1$$", "no stylesheet, no typesetting");
  assert.equal(dom.head.childNodes.includes(link), false, "the failed stylesheet is taken out");
  fire(window, "view:shown", { route: "laser-study" });
  const links = dom.head.childNodes.filter((n) => n.tagName === "LINK");
  assert.equal(links.length, 1, "asked for again");
  assert.equal(dom.head.childNodes.filter((n) => n.tagName === "SCRIPT").length, 1, "the script is here already");
  links[0].onload();
  assert.equal(shown(page.p2), "[[R_1 R_2 e^{2gl} = 1]]");
});

test("laser-study.js: the stylesheet first, then the script: the script's arrival typesets", () => {
  const dom = makeDom();
  const window = loadStudy(dom);
  const page = buildPage(dom);
  fire(window, "section:ready", { route: "laser-study", container: page.container });
  fire(window, "view:shown", { route: "laser-study" });
  const [link, script] = dom.head.childNodes;
  link.onload();
  assert.equal(shown(page.p2), "$$R_1 R_2 e^{2gl} = 1$$", "the stylesheet alone typesets nothing");
  window.katex = fakeKatex([]);
  script.onload();
  assert.equal(shown(page.p2), "[[R_1 R_2 e^{2gl} = 1]]");
});
