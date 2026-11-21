/* ============================================================================
   mutation-check.test.js — the mutation checker itself.

   A checker that reported every mistake as "caught" — for example because
   the tests already failed, or the changed file no longer loaded — would
   look perfect and prove nothing. So: an unchanged copy must pass, a harmless
   change must NOT be caught, a real mistake must be, and broken entries must
   be reported as errors.

   To keep every `node --test` quick, these runs use one or two small test
   files (media.test.js, constants.test.js) instead of the whole suite.
   ========================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { applyMutation, orderFor, runBaseline, runMutation, checkMutations } = require("./mutation-check.js");

const MEDIA = path.join(__dirname, "media.test.js");
const CONSTANTS = path.join(__dirname, "constants.test.js");
const SMALL = { testFiles: [MEDIA] };

test("the tests pass on an unchanged copy of the project", async () => {
  const result = await runBaseline(SMALL);
  assert.equal(result.outcome, "passed", result.output);
});

test("the unchanged copy's run times every file, to order the files for the mistakes", async () => {
  const result = await runBaseline({ testFiles: [MEDIA, CONSTANTS] });
  assert.equal(result.outcome, "passed", result.output);
  assert.deepEqual(Object.keys(result.durations).sort(), [CONSTANTS, MEDIA].sort());
  for (const file of [MEDIA, CONSTANTS]) assert.ok(result.durations[file] > 0, file);
});

test("a mistake stops at the first test file that fails: the files after it are not run", async () => {
  const result = await runMutation({
    file: "js/laser/engine/media.js",
    find: "sigma: 2.5e-20 * cm2,",
    replace: "sigma: 2.5e-20,",
    why: "ruby cross section left in cm²"
  }, { testFiles: [MEDIA, CONSTANTS] });
  assert.equal(result.outcome, "caught");
  assert.deepEqual(result.files, [MEDIA], "media.test.js caught it; constants.test.js did not run");
  assert.match(result.output, /^media\.test\.js:/, "the output of the file that caught it");
});

test("a mistake no file catches runs every file", async () => {
  const result = await runMutation({
    file: "js/laser/engine/media.js",
    find: "// 20–30 nm in the table: the middle",
    replace: "// a comment changed on purpose",
    why: "harmless"
  }, { testFiles: [CONSTANTS, MEDIA] });
  assert.equal(result.outcome, "missed", result.output);
  assert.deepEqual(result.files, [MEDIA, CONSTANTS], "both, media.test.js first: it is named after media.js");
});

test("the files named after the changed file run first, then the others, each group quickest first", () => {
  const files = ["page.test.js", "bench.test.js", "axis.test.js", "bench-pumps.test.js", "benches.test.js", "rates.test.js"]
    .map((name) => path.join(__dirname, name));
  const at = (name) => path.join(__dirname, name);
  const durations = {};
  durations[at("page.test.js")] = 3000;
  durations[at("bench.test.js")] = 2000;
  durations[at("axis.test.js")] = 300;
  durations[at("bench-pumps.test.js")] = 1000;
  durations[at("benches.test.js")] = 100;
  durations[at("rates.test.js")] = 200;
  const names = (list) => list.map((file) => path.basename(file));
  // "benches" is not named after "bench": only "bench." and "bench-" are.
  assert.deepEqual(names(orderFor("js/laser/engine/bench.js", files, durations)),
    ["bench-pumps.test.js", "bench.test.js", "benches.test.js", "rates.test.js", "axis.test.js", "page.test.js"]);
  assert.deepEqual(names(orderFor("data/laser.json", files, durations)),
    ["benches.test.js", "rates.test.js", "axis.test.js", "bench-pumps.test.js", "bench.test.js", "page.test.js"],
    "no file named after it: quickest first");
  assert.deepEqual(names(orderFor("js/laser/engine/bench.js", files, null)),
    ["bench.test.js", "bench-pumps.test.js", "page.test.js", "axis.test.js", "benches.test.js", "rates.test.js"],
    "without times each group keeps the given order");
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
    find: "var perEmission = 1;",
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

test("a test file whose Node crashes before any test is run once more; one that cannot load still fails", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "laser-crash-"));
  try {
    // Crashes (as Node's segmentation faults do) on its first run only.
    const marker = path.join(dir, "crashed-once");
    const crashing = path.join(dir, "crash-once.test.js");
    fs.writeFileSync(crashing, "const fs = require('node:fs');\n" +
      "if (!fs.existsSync(" + JSON.stringify(marker) + ")) { fs.writeFileSync(" + JSON.stringify(marker) + ", ''); process.kill(process.pid, 'SIGSEGV'); }\n" +
      "require('node:test')('fine', () => {});\n");
    const ok = await runBaseline({ testFiles: [crashing] });
    assert.equal(ok.outcome, "passed", ok.output);
    assert.ok(fs.existsSync(marker), "it did crash once");
    // Fails to load every time: still failed after the second run.
    const broken = path.join(dir, "broken.test.js");
    fs.writeFileSync(broken, "throw new Error('cannot load');\n");
    const bad = await runBaseline({ testFiles: [broken] });
    assert.equal(bad.outcome, "failed");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

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
