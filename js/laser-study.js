/* =========================================================================
   The study page (?view=laser-study): the laser explained in chapters.

   The words are data/laser-study.json, the layout sections/laser-study.html,
   both filled in by js/content.js like every page. This file only does two
   things the binder cannot:

   1. A chapter with no "dig deeper" text loses its empty <details> (the
      binder removes the missing text, not the box around it).
   2. The formulas. In the JSON a formula is written in LaTeX between dollar
      signs: $E = h\nu$ inside a sentence, or $$ … $$ as a paragraph of its
      own (shown centred, on its own line). KaTeX (vendor/katex, MIT licence)
      turns each one into typeset maths.

   KaTeX is about 300 KB with its fonts, so it is downloaded only when this
   page is actually shown: the router builds every page in the background
   ("section:ready", hidden) and fires "view:shown" when one comes on screen.
   A formula KaTeX cannot read is shown in red as its source (throwOnError:
   false), so one typo never breaks the page; if KaTeX does not download,
   the formulas stay as their LaTeX text.

   3. The contents. It numbers the chapters (id="chapter-1" …), points the
      contents' links and each chapter's "Contents ↑" at them, and scrolls
      there when one of those, or a "chapter N" link in the text
      ([chapter 4](#chapter-4) in the JSON), is clicked. It scrolls itself
      because the router answers a change of the address's # by showing
      the page again from the top.

   Adds one global, LaserStudy, with pieces() for the tests.
   ========================================================================= */

(function (global) {
  "use strict";

  var ROUTE = "laser-study";
  var KATEX_CSS = "vendor/katex/katex.min.css";
  var KATEX_JS = "vendor/katex/katex.min.js";

  var latest = null;          // the newest build of the page (a language switch builds it again)
  var loading = false;        // the KaTeX script is on its way
  var styling = false;        // the KaTeX stylesheet is on its way, or here
  var styled = false;         // the KaTeX stylesheet has arrived
  var build = 0;              // counts the builds of the page
  var typesetBuild = -1;      // the build whose formulas are typeset

  /* ---------- Finding the formulas ---------- */

  // Splits a text into pieces: { text } for plain words, { tex, display }
  // for a formula. $$…$$ is a display formula, $…$ an inline one. A dollar
  // sign with no partner stays as text.
  function pieces(text) {
    var out = [];
    var pattern = /\$\$([^$]+)\$\$|\$([^$]+)\$/g;
    var last = 0;
    var match;
    while ((match = pattern.exec(text)) !== null) {
      if (match.index > last) out.push({ text: text.slice(last, match.index) });
      if (match[1] !== undefined) out.push({ tex: match[1], display: true });
      else out.push({ tex: match[2], display: false });
      last = pattern.lastIndex;
    }
    if (last < text.length) out.push({ text: text.slice(last) });
    return out;
  }

  /* ---------- Typesetting ---------- */

  // Replaces one text node by its pieces, each formula in a <span> of its own.
  function typesetText(node) {
    var parts = pieces(node.nodeValue);
    var hasFormula = parts.some(function (part) { return part.tex !== undefined; });
    if (!hasFormula) return;
    var parent = node.parentNode;
    parts.forEach(function (part) {
      var piece;
      if (part.tex === undefined) {
        piece = global.document.createTextNode(part.text);
      } else {
        piece = global.document.createElement("span");
        global.katex.render(part.tex, piece, { displayMode: part.display, throwOnError: false });
      }
      parent.insertBefore(piece, node);
    });
    parent.removeChild(node);
  }

  // Walks an element's text, also inside bold words and links. KaTeX's own
  // output is a <span> whose text has no dollar signs, so typesetting the
  // same page twice changes nothing.
  function typesetElement(element) {
    var children = Array.prototype.slice.call(element.childNodes);
    children.forEach(function (child) {
      if (child.nodeType === 3) typesetText(child);
      else if (child.nodeType === 1) typesetElement(child);
    });
  }

  // Typesets the newest build once both KaTeX files are here: without its
  // stylesheet KaTeX's output shows every formula twice. Each build is
  // typeset once, however often the page is shown.
  function typeset(container) {
    if (!container || !global.katex || !styled || typesetBuild === build) return;
    Array.prototype.forEach.call(container.querySelectorAll("[data-rich]"), typesetElement);
    typesetBuild = build;
  }

  /* ---------- Loading KaTeX, once ---------- */

  function loadKatex() {
    var document = global.document;
    if (!styling) {
      styling = true;
      var link = document.createElement("link");
      link.setAttribute("rel", "stylesheet");
      link.setAttribute("href", KATEX_CSS);
      link.onload = function () {
        styled = true;
        typeset(latest);
      };
      link.onerror = function () {
        link.parentNode.removeChild(link);
        styling = false;               // the next visit to the page tries again
      };
      document.head.appendChild(link);
    }
    if (global.katex) {
      typeset(latest);
      return;
    }
    if (loading) return;
    loading = true;
    var script = document.createElement("script");
    script.src = KATEX_JS;
    script.onload = function () {
      loading = false;
      typeset(latest);                 // the newest build, not the one shown first
    };
    script.onerror = function () {
      loading = false;                 // the next visit to the page tries again
    };
    document.head.appendChild(script);
  }

  /* ---------- Empty dig-deeper boxes ---------- */

  function dropEmptyDeeper(container) {
    Array.prototype.forEach.call(container.querySelectorAll("[data-study-deeper]"), function (box) {
      if (box.querySelectorAll("[data-rich]").length === 0) box.parentNode.removeChild(box);
    });
  }

  /* ---------- The contents and the links between chapters ---------- */

  var targets = {};           // "#chapter-3" → that chapter of the newest build

  // Each chapter's id comes from its "id" in the JSON (id="chapter-ruby"),
  // so a link keeps its chapter when the chapters are reordered.
  function numberChapters(container, data) {
    var list = (data && data.chapters) || [];
    targets = {};
    var toc = container.querySelectorAll("[data-study-toc]")[0];
    if (toc) {
      toc.setAttribute("id", "contents");
      targets["#contents"] = toc;
    }
    var links = container.querySelectorAll("[data-study-link]");
    Array.prototype.forEach.call(container.querySelectorAll("[data-study-chapter]"), function (chapter, i) {
      var name = list[i] && list[i].id ? list[i].id : String(i + 1);
      var id = "chapter-" + name;
      chapter.setAttribute("id", id);
      targets["#" + id] = chapter;
      if (links[i]) links[i].setAttribute("href", "#" + id);
    });
    Array.prototype.forEach.call(container.querySelectorAll("[data-study-top]"), function (link) {
      link.setAttribute("href", "#contents");
    });
  }

  // The link a click landed in (the click may land on a word inside it).
  function linkOf(node) {
    while (node && node.tagName !== "A") node = node.parentNode;
    return node || null;
  }

  // Is the node inside the newest build of the book?
  function inBook(node) {
    while (node) {
      if (node === latest) return true;
      node = node.parentNode;
    }
    return false;
  }

  function lessMotion() {
    return !!(global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function followLink(event) {
    // A click meant for a new tab or window is the browser's.
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var link = linkOf(event.target);
    if (!link || !inBook(link)) return;
    var target = targets[link.getAttribute("href")];
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: lessMotion() ? "auto" : "smooth", block: "start" });
  }

  /* ---------- Hooks ---------- */

  global.addEventListener("section:ready", function (event) {
    if (!event.detail || event.detail.route !== ROUTE) return;
    latest = event.detail.container;
    build += 1;
    dropEmptyDeeper(latest);
    numberChapters(latest, event.detail.data);
    typeset(latest);                   // does nothing until KaTeX is here
  });

  global.addEventListener("view:shown", function (event) {
    if (!event.detail || event.detail.route !== ROUTE) return;
    loadKatex();
  });

  global.document.addEventListener("click", followLink);

  global.LaserStudy = { pieces: pieces };
})(this);
