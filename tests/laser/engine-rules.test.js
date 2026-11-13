/* ============================================================================
   engine-rules.test.js — checks the rules every engine file must keep.

   The engine is pure physics: it must run the same in a browser and in this
   test, so it may not touch the page, the clock, timers or random numbers.
   If one of these fails, the fix is to move that code to js/laser/ui/ or
   js/laser/page.js.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, ENGINE_DIR, ENGINE_FILES, loadEngineWithSandbox } = require("./helpers.js");

// Removes /* ... */ and // ... comments AND the text inside strings, so a
// comment or an error message that mentions one of the forbidden words
// ("Brewster window", "waist location") is not mistaken for code that uses
// it. The quote marks stay, so the code around them is unchanged. It walks
// the code one character at a time, so a "//" inside a string ("http://...")
// is not taken for a comment. Limitation: it does not understand
// regular-expression literals — the engine has none; if one is ever added
// and contains a quote or "//", check this function still reads it right.
function withoutCommentsOrStrings(code) {
  let out = "";
  let quote = null;        // the quote character while inside a string
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    const next = code[i + 1];
    if (quote) {
      if (ch === "\\") {               // an escaped character: skip both
        i += 2;
        continue;
      }
      if (ch === quote) {               // the closing quote stays
        out += ch;
        quote = null;
      }
      i += 1;
    } else if (ch === "/" && next === "*") {
      const end = code.indexOf("*/", i + 2);
      i = end === -1 ? code.length : end + 2;
      out += " ";
    } else if (ch === "/" && next === "/") {
      const end = code.indexOf("\n", i);
      i = end === -1 ? code.length : end;
    } else {
      if (ch === '"' || ch === "'" || ch === "`") quote = ch;
      out += ch;
      i += 1;
    }
  }
  return out;
}

// Whole words only (\b), so a physics name such as brewsterWindowLoss is fine
// but window, window.x or Date() are not.
const FORBIDDEN = [
  /\bwindow\b/,          // the page
  /\bdocument\b/,
  /\bself\b/,
  /\bglobalThis\b/,
  /\bnavigator\b/,
  /\blocation\b/,
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  /\bfetch\b/,           // the network
  /\bXMLHttpRequest\b/,
  /\bDate\b/,            // the clock
  /\bperformance\b/,
  /\bsetTimeout\b/,      // timers
  /\bsetInterval\b/,
  /\brequestAnimationFrame\b/,
  /\bMath\.random\b/     // random numbers
];

// The forbidden words found in one piece of code, comments ignored.
function forbiddenWordsIn(code) {
  const bare = withoutCommentsOrStrings(code);
  return FORBIDDEN.filter((pattern) => pattern.test(bare)).map((pattern) => pattern.source);
}

test("the rules check itself: catches what it should, allows what it should", () => {
  assert.deepEqual(forbiddenWordsIn("var x = brewsterWindowLoss(theta);"), []);
  assert.deepEqual(forbiddenWordsIn("// window is only mentioned here\nvar a = 1;"), []);
  assert.deepEqual(forbiddenWordsIn("/* uses document */ var a = 1;"), []);
  assert.equal(forbiddenWordsIn("var t = Date();").length, 1);
  assert.equal(forbiddenWordsIn("globalThis.document.title = 1;").length, 2);
  assert.equal(forbiddenWordsIn('var u = "http://x"; window.y = 1;').length, 1);
  assert.equal(forbiddenWordsIn("fetch ('data.json');").length, 1);
  // Words inside strings are text, not code.
  assert.deepEqual(forbiddenWordsIn('throw new Error("loss at the Brewster window");'), []);
  assert.deepEqual(forbiddenWordsIn("var label = 'waist location';"), []);
  assert.deepEqual(forbiddenWordsIn('var s = "say \\"window\\" twice"; var t = 1;'), []);
  assert.equal(forbiddenWordsIn('var s = "a"; self.x = 1;').length, 1);
});

test("every engine file is in the load list in tests/laser/helpers.js", () => {
  const onDisk = fs.readdirSync(ENGINE_DIR).filter((name) => name.endsWith(".js")).sort();
  assert.deepEqual(onDisk, ENGINE_FILES.slice().sort());
});

test("engine files do not touch the page, the network, the clock, timers or random numbers", () => {
  for (const file of ENGINE_FILES) {
    const found = forbiddenWordsIn(fs.readFileSync(path.join(ENGINE_DIR, file), "utf8"));
    assert.deepEqual(found, [], file + " uses " + found.join(", "));
  }
});

test("the engine adds exactly one global, LaserEngine", () => {
  const { sandbox } = loadEngineWithSandbox();
  assert.deepEqual(Object.keys(sandbox), ["LaserEngine"]);
});

test("index.html loads the engine files in the same order as the tests", (t) => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const loaded = [];
  const pattern = /<script\s+src="js\/laser\/engine\/([^"]+)"/g;
  let match;
  while ((match = pattern.exec(html)) !== null) loaded.push(match[1]);

  if (loaded.length === 0) {
    t.skip("index.html does not load the engine yet (build stage 5)");
    return;
  }
  assert.deepEqual(loaded, ENGINE_FILES);
});
