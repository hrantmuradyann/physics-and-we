/* ============================================================================
   mutation-check.test.js — the mutation checker itself.

   A checker that reported every mistake as "caught" — for example because
   the tests already failed, or the changed file no longer loaded — would
   look perfect and prove nothing. So: an unchanged copy must pass, a harmless
   change must NOT be caught, a real mistake must be, and broken entries must
   be reported as errors.

   To keep every `node --test` quick, these runs use one small test file
   (media.test.js) instead of the whole suite.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { applyMutation, runBaseline, runMutation, checkMutations } = require("./mutation-check.js");

const SMALL = { testFiles: [path.join(__dirname, "media.test.js")] };

test("the tests pass on an unchanged copy of the project", async () => {
  const result = await runBaseline(SMALL);
  assert.equal(result.outcome, "passed", result.output);
});

test("a harmless change (a comment) is not reported as caught", async () => {
  const result = await runMutation({
    file: "js/laser/engine/media.js",
    find: "// 20–30 nm in the table: the middle",
    replace: "// a comment changed on purpose",
    why: "harmless"
  }, SMALL);
  assert.equal(result.outcome, "missed", result.output);
});

test("a real mistake is caught", async () => {
  const result = await runMutation({
    file: "js/laser/engine/media.js",
    find: "sigma: 2.5e-20 * cm2,",
    replace: "sigma: 2.5e-20,",
    why: "ruby cross section left in cm²"
  }, SMALL);
  assert.equal(result.outcome, "caught");
});

test("a change that hangs the tests is reported as timed out, not caught", async () => {
  const result = await runMutation({
    file: "js/laser/engine/media.js",
    find: "var C = E.constants;",
    replace: "var C = E.constants; while (C) {}",
    why: "endless loop"
  }, Object.assign({ timeoutMs: 1500 }, SMALL));
  assert.equal(result.outcome, "timed out");
});

// Each of these entries is wrong in itself and must come back as "error".
const BROKEN_ENTRIES = [
  { why: "text not in the file", file: "js/laser/engine/media.js", find: "not in the file", replace: "x",
    message: /appears 0 times/ },
  { why: "no such file", file: "js/laser/engine/no-such-file.js", find: "x", replace: "y",
    message: /there is no file/ },
  { why: "empty find", file: "js/laser/engine/media.js", find: "", replace: "x",
    message: /"find" is empty/ },
  { why: "path outside the copy", file: "js/../../outside.js", find: "x", replace: "y",
    message: /points outside the copy/ },
  { why: "not a copied folder", file: "images/logo.png", find: "x", replace: "y",
    message: /must start with one of/ },
  { why: "typo that breaks the syntax", file: "js/laser/engine/media.js",
    find: "var perEmission = medium.scheme === \"three-level\" ? 2 : 1;",
    replace: "var perEmission = ;",
    message: /not valid JavaScript/ }
];

for (const entry of BROKEN_ENTRIES) {
  test("a broken entry is reported as an error: " + entry.why, async () => {
    const [result] = await checkMutations([entry], SMALL);
    assert.equal(result.outcome, "error");
    assert.match(result.error, entry.message);
  });
}

test("a run that prints too much is stopped and reported, not collected without end", async () => {
  await assert.rejects(runBaseline(Object.assign({ maxOutput: 100 }, SMALL)),
    /the tests printed more than 100 characters/);
});

test("several entries checked at once come back in the order of the list", async () => {
  // The broken entry fails at once and the others take a test run each, so
  // they finish out of order; the results must still follow the list.
  const list = [
    { file: "js/laser/engine/media.js", find: "sigma: 2.5e-20 * cm2,", replace: "sigma: 2.5e-20,", why: "real" },
    { file: "js/laser/engine/media.js", find: "// 20–30 nm in the table: the middle",
      replace: "// a comment changed on purpose", why: "harmless" },
    { file: "js/laser/engine/media.js", find: "not in the file", replace: "x", why: "broken" }
  ];
  const results = await checkMutations(list, Object.assign({ parallel: 3 }, SMALL));
  assert.deepEqual(results.map((result) => result.mutation.why), ["real", "harmless", "broken"]);
  assert.deepEqual(results.map((result) => result.outcome), ["caught", "missed", "error"]);
});

test("the replacement is inserted literally ($& and $$ are not special)", () => {
  const changed = applyMutation("a = b;", { file: "x.js", find: "b", replace: "'$&$$'", why: "dollar signs" });
  assert.equal(changed, "a = '$&$$';");
});
