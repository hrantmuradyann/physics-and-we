/* =========================================================================
   The laser book (?view=laser-study): chapters, each with sections.

   The words are data/laser-study.json, the layout sections/laser-study.html,
   both filled in by js/content.js like every page. This file only does the
   five things the binder cannot:

   1. A section with no "more simply" or "dig deeper" text loses that empty
      <details> (the binder removes the missing text, not the box around
      it), and its
      picture box shows either the picture or, until there is one, what the
      picture should show.
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

   3. The contents and the numbers. It numbers the chapters and sections
      (3, 3.1) in the contents and the headings, names each by its JSON id
      (id="chapter-medium", id="section-ruby"), points the contents' links
      and each chapter's "Contents ↑" at them, and scrolls there when one of
      those, or a link in the text ([the ruby laser](#section-ruby) in the
      JSON), is clicked. It scrolls itself because the router answers a
      change of the address's # by showing the page again from the top.
      Opened with an id (?view=laser-study&id=section-ruby, the lab's
      "Learn more" links), it goes to that section, and again once the
      formulas, which make the text taller, are typeset.

   4. The "Hide links" button, pinned to the corner of the screen. It makes
      the links in the text ([data-rich] a) look and act like plain words
      (data-study-plain="true" on the page; css/site.css), and takes them
      out of the keyboard's way; the contents keep their links. Pressed
      again, it brings them back. The choice outlives a language switch and
      is kept for the next visit (localStorage, if the browser allows it).

   5. The "Русский" button at the top right of each chapter. The site is
      Armenian and English; the book's chapters also have a Russian text
      ("ru" beside "hy" and "en" in the JSON), for a reader who follows a
      point better in Russian. The button fills that one chapter in again
      in Russian (Content.bind with lang "ru"), and pressed again, in the
      site's language. The formulas are the same in every language. The
      choice outlives a language switch, not a new visit.

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
  var wanted = null;          // the section the address asked for, until the formulas are set

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
    // The formulas make the text taller and move the sections down: back to
    // the one asked for, and once more when KaTeX's fonts have arrived
    // (they change the formulas' heights again). Then it is forgotten.
    goToWanted();
    var fonts = global.document.fonts;
    if (wanted && fonts && fonts.ready) {
      fonts.ready.then(function () {
        goToWanted();
        wanted = null;
      });
    } else {
      wanted = null;
    }
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

  /* ---------- Empty "more simply" and dig-deeper boxes, and the pictures ---------- */

  function first(element, selector) {
    return element.querySelectorAll(selector)[0] || null;
  }

  function remove(element) {
    if (element && element.parentNode) element.parentNode.removeChild(element);
  }

  // The "more simply" box and the dig-deeper box, each without its text.
  function dropEmptyDeeper(container) {
    ["[data-study-simpler]", "[data-study-deeper]"].forEach(function (selector) {
      Array.prototype.forEach.call(container.querySelectorAll(selector), function (box) {
        if (box.querySelectorAll("[data-rich]").length === 0) remove(box);
      });
    });
  }

  // A picture with a file shows it with its caption; without one, the box
  // saying what it should show; with neither, the section has no figure.
  function settleFigures(container) {
    Array.prototype.forEach.call(container.querySelectorAll("[data-study-figure]"), function (figure) {
      var image = first(figure, "[data-study-image]");
      var todo = first(figure, "[data-study-todo]");
      if (image && image.getAttribute("src")) {
        remove(todo);
        // Its section puts the picture to the right of the text (css/site.css).
        if (figure.parentNode) figure.parentNode.setAttribute("data-study-pictured", "");
        return;
      }
      remove(image);
      remove(first(figure, "[data-study-caption]"));
      if (!todo || !first(todo, "[data-study-todo-text]")) remove(figure);
    });
  }

  /* ---------- The numbers, the contents and the links ---------- */

  var targets = {};           // "#section-ruby" → that section of the newest build

  function setNumber(element, number) {
    var place = first(element, "[data-study-number]");
    if (place) place.textContent = number;
  }

  function point(link, id) {
    if (link) link.setAttribute("href", "#" + id);
  }

  // The page's chapters and sections are numbered in the order they stand,
  // and named by their "id" in the JSON (id="section-ruby"), so a link in
  // the text keeps its target when chapters or sections are moved.
  function numberBook(container, data) {
    var list = (data && data.chapters) || [];
    targets = {};
    var toc = first(container, "[data-study-toc]");
    if (toc) {
      toc.setAttribute("id", "contents");
      targets["#contents"] = toc;
    }
    var tocChapters = toc ? toc.querySelectorAll("[data-study-toc-chapter]") : [];
    Array.prototype.forEach.call(container.querySelectorAll("[data-study-chapter]"), function (chapter, i) {
      var chapterData = list[i] || {};
      var sectionsData = chapterData.sections || [];
      var number = String(i + 1);
      var id = "chapter-" + (chapterData.id || number);
      chapter.setAttribute("id", id);
      targets["#" + id] = chapter;
      setNumber(chapter, number);

      var tocChapter = tocChapters[i] || null;
      var tocLinks = tocChapter ? tocChapter.querySelectorAll("[data-study-link]") : [];
      if (tocChapter) {
        setNumber(tocChapter, number);
        point(tocLinks[0], id);
      }

      Array.prototype.forEach.call(chapter.querySelectorAll("[data-study-section]"), function (section, j) {
        var sectionData = sectionsData[j] || {};
        var sectionNumber = number + "." + (j + 1);
        var sectionId = "section-" + (sectionData.id || sectionNumber);
        section.setAttribute("id", sectionId);
        targets["#" + sectionId] = section;
        setNumber(section, sectionNumber);
        var tocLink = tocLinks[j + 1];
        if (tocLink) {
          setNumber(tocLink, sectionNumber);
          point(tocLink, sectionId);
        }
      });
    });
    Array.prototype.forEach.call(container.querySelectorAll("[data-study-top]"), function (link) {
      link.setAttribute("href", "#contents");
    });
    // A link in the text to a chapter or section ([the ruby laser](#section-ruby))
    // opens it in a new tab, as every link in the site's text does (content.js),
    // so it gets the whole address: ?view=laser-study&id=section-ruby, which
    // the router opens and this file scrolls to (view:shown). The contents and
    // the "Contents ↑" links stay in the tab and scroll (followLink).
    each(container, "[data-rich]", function (rich) {
      linksIn(rich, []).forEach(function (link) {
        var href = link.getAttribute("href") || "";
        if (!targets[href]) return;
        link.setAttribute("href", "?view=" + ROUTE + "&id=" + href.slice(1));
        link.setAttribute("target", "_blank");
      });
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

  // Opened at one section (?view=laser-study&id=section-ruby, from a
  // "Learn more" in the lab): there at once, without a smooth scroll.
  function goToWanted() {
    var target = wanted ? targets["#" + wanted] : null;
    if (target) target.scrollIntoView({ behavior: "auto", block: "start" });
  }

  /* ---------- Hiding the text's links ---------- */

  var STORE_KEY = "study-links-hidden";
  var plain = null;           // the text's links hidden; null until read from the storage

  function storage() {
    try {
      return global.localStorage || null;
    } catch (err) {
      return null;              // storage blocked (private browsing, some settings)
    }
  }

  function readPlain() {
    var store = storage();
    try {
      return !!store && store.getItem(STORE_KEY) === "true";
    } catch (err) {
      return false;
    }
  }

  function keepPlain() {
    var store = storage();
    try {
      if (store) store.setItem(STORE_KEY, plain ? "true" : "false");
    } catch (err) {
      // Not kept for the next visit; the button still works now.
    }
  }

  // Every <a> inside the node, at any depth.
  function linksIn(node, out) {
    (node.childNodes || []).forEach(function (child) {
      if (child.nodeType !== 1) return;
      if (child.tagName === "A") out.push(child);
      linksIn(child, out);
    });
    return out;
  }

  function each(container, selector, fn) {
    Array.prototype.forEach.call(container.querySelectorAll(selector), fn);
  }

  // Shows the choice on one build: the page's mark for the CSS, the links'
  // place in the keyboard's order, and the button's word.
  function showPlain(container) {
    container.setAttribute("data-study-plain", plain ? "true" : "false");
    each(container, "[data-rich]", function (rich) {
      linksIn(rich, []).forEach(function (link) {
        link.setAttribute("tabindex", plain ? "-1" : "0");
      });
    });
    each(container, "[data-study-links]", function (button) {
      button.setAttribute("aria-pressed", plain ? "true" : "false");
    });
    each(container, "[data-study-links-hide]", function (word) { word.hidden = plain; });
    each(container, "[data-study-links-show]", function (word) { word.hidden = !plain; });
  }

  function buttonOf(node) {
    while (node) {
      if (node.nodeType === 1 && node.getAttribute("data-study-links") !== null) return node;
      node = node.parentNode;
    }
    return null;
  }

  // True if the click was on the newest build's button.
  function toggleLinks(event) {
    var button = buttonOf(event.target);
    if (!button || !inBook(button)) return false;
    plain = !plain;
    keepPlain();
    showPlain(latest);
    return true;
  }

  /* ---------- One chapter in Russian ---------- */

  // The chapters shown in Russian, by their JSON id. Kept when the page is
  // built again (a language switch), forgotten when the visitor leaves the site.
  var russian = {};
  var book = null;            // the newest build's data (data/laser-study.json)

  // The site's word for a key of data/site.json's "ui", in the site's language.
  function siteWord(key) {
    var site = global.Site;
    return site && site.word ? site.word(key) : "";
  }

  function siteLang() {
    return (global.Site && global.Site.lang) || "en";
  }

  // The button says what it will do: "Русский" while the chapter is in the
  // site's language, the site's language ("English") while it is in Russian.
  function labelRussian(chapter, inRussian) {
    chapter.setAttribute("lang", inRussian ? "ru" : siteLang());
    each(chapter, "[data-study-russian]", function (button) {
      button.textContent = siteWord(inRussian ? "readSiteLanguage" : "readRussian");
      button.setAttribute("lang", inRussian ? siteLang() : "ru");
    });
  }

  // Fills one chapter in again from the same data, in Russian or in the
  // site's language. Content.bind rebuilds its sections from their template,
  // so they get their pictures, boxes and numbers again below.
  function fillChapter(chapter, data, inRussian) {
    global.Content.bind(chapter, data, {
      lang: inRussian ? "ru" : siteLang(),
      ui: (global.Site && global.Site.ui) || {}
    });
    dropEmptyDeeper(chapter);
    settleFigures(chapter);
  }

  // The chapter elements of a build, with their data, in the same order.
  function eachChapter(container, fn) {
    var list = (book && book.chapters) || [];
    Array.prototype.forEach.call(container.querySelectorAll("[data-study-chapter]"), function (chapter, i) {
      if (list[i]) fn(chapter, list[i]);
    });
  }

  function chapterOf(node) {
    while (node) {
      if (node.nodeType === 1 && node.getAttribute("data-study-chapter") !== null) return node;
      node = node.parentNode;
    }
    return null;
  }

  function russianButtonOf(node) {
    while (node) {
      if (node.nodeType === 1 && node.getAttribute("data-study-russian") !== null) return node;
      node = node.parentNode;
    }
    return null;
  }

  // True if the click was on a chapter's "Русский" button in the newest build.
  function toggleRussian(event) {
    var button = russianButtonOf(event.target);
    if (!button || !inBook(button)) return false;
    var clicked = chapterOf(button);
    eachChapter(latest, function (chapter, data) {
      if (chapter !== clicked) return;
      var inRussian = !russian[data.id];
      if (inRussian) russian[data.id] = true;
      else delete russian[data.id];
      fillChapter(chapter, data, inRussian);
      labelRussian(chapter, inRussian);
      numberBook(latest, book);          // the new text's section links and numbers
      showPlain(latest);                 // its links hidden too, if they are
      if (global.katex && styled) {
        each(chapter, "[data-rich]", typesetElement);
      }
    });
    return true;
  }

  /* ---------- Hooks ---------- */

  global.addEventListener("section:ready", function (event) {
    if (!event.detail || event.detail.route !== ROUTE) return;
    latest = event.detail.container;
    book = event.detail.data || null;
    build += 1;
    // A language switch builds the page again: the chapters the visitor
    // turned to Russian stay in Russian.
    eachChapter(latest, function (chapter, data) {
      if (russian[data.id]) fillChapter(chapter, data, true);
      labelRussian(chapter, !!russian[data.id]);
    });
    dropEmptyDeeper(latest);
    settleFigures(latest);
    numberBook(latest, event.detail.data);
    if (plain === null) plain = readPlain();
    showPlain(latest);
    typeset(latest);                   // does nothing until KaTeX is here
  });

  // The visitor scrolling on their own, or leaving the book, ends the wait:
  // a late scroll would pull them back from where they went.
  function forgetWanted() {
    wanted = null;
  }
  ["wheel", "touchstart", "keydown"].forEach(function (type) {
    global.addEventListener(type, forgetWanted, { passive: true });
  });

  global.addEventListener("view:shown", function (event) {
    if (!event.detail) return;
    if (event.detail.route !== ROUTE) {
      wanted = null;
      return;
    }
    wanted = event.detail.id || null;
    goToWanted();
    if (typesetBuild === build) wanted = null;   // already set: nothing will move it
    loadKatex();
  });

  // One listener for every click in the book: the "Hide links" button, a
  // chapter's "Русский" button, or a link.
  global.document.addEventListener("click", function (event) {
    if (toggleLinks(event)) return;
    if (toggleRussian(event)) return;
    followLink(event);
  });

  global.LaserStudy = { pieces: pieces };
})(this);
