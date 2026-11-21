/* ============================================================================
   mutation-check.js — proves the laser tests can catch real mistakes.

   1. Copies the parts of the project the tests read (COPY_ENTRIES below) to
      a temporary folder, and runs every laser test against that copy WITHOUT
      any change. They must all pass — otherwise "a test failed" would mean
      nothing, and every mistake would look caught.
   2. Then, for each deliberate mistake in tests/laser/mutations.js: a fresh
      copy, the mistake made in the copy (the real files are never touched),
      and the laser test files run against it, one after another, until one
      FAILS. One failing test is all a mistake needs to count as caught, so
      the files after it are not run: the outcome is the same as running
      them all, in a fraction of the time. The files named after the changed
      file run first (bench.js: bench.test.js, bench-pumps.test.js), as they
      catch most mistakes, then the others, quickest first (timed in step 1).
      Several mistakes are checked at the same time (PARALLEL_RUNS below),
      each in its own copy; the results are printed in the order of the list.

   Outcomes for each mistake:
     caught      a test failed — good
     MISSED      every test passed: the tests have a hole, add a test
     TIMED OUT   a test file ran too long before any file failed: a loop in
                   a test (a solver run) has no small bound, so the mistake
                   made it slow instead of failing. Bound the work (maxSteps
                   near what the run needs); a { timeout } does not help,
                   because node:test cannot stop a test that never gives up
                   control
     ERROR       the entry itself is wrong (text not found, not valid
                   JavaScript after the change, path outside the copy, ...)

   Run from the top folder of the project:   node tests/laser/mutation-check.js
   Only Node's built-in modules are used, like the tests. Exit code 1 if the
   tests fail on the unchanged copy, or any mistake is not "caught".
   ========================================================================== */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { spawn } = require("node:child_process");

const REAL_ROOT = path.join(__dirname, "..", "..");
const TEST_DIR = __dirname;

// What gets copied: everything the laser tests read, nothing else. Not .git,
// not images (13 MB), and never local secrets such as .dev.vars.
const COPY_ENTRIES = ["index.html", "js", "css", "data", "sections"];

// How long one test file may take before it counts as hung. (Until the
// check stopped at the first failing file, the whole suite had this long,
// its files running side by side: in effect, so did its slowest file.)
const DEFAULT_TIMEOUT_MS = 60 * 1000;

// The most output one test run may print (in characters). A mistake that
// makes a test print in a loop is stopped here, not when memory runs out.
const DEFAULT_MAX_OUTPUT = 64 * 1024 * 1024;

// How many mistakes are checked at once. Each runs its test files one after
// another, so one mistake per processor core, less one core for the rest of
// the computer.
const PARALLEL_RUNS = Math.max(1, os.cpus().length - 1);

// This file's own test (mutation-check.test.js) runs this checker. If the
// checker ran that test too, every run would start another run, forever.
const SELF_TEST = "mutation-check.test.js";

// Every laser test file except the checker's own test.
function allTestFiles() {
  return fs.readdirSync(TEST_DIR)
    .filter((name) => name.endsWith(".test.js") && name !== SELF_TEST)
    .sort()
    .map((name) => path.join(TEST_DIR, name));
}

/* ---------- checking and applying one entry ---------- */

// Throws a clear error if an entry in mutations.js is malformed.
function checkEntry(mutation) {
  for (const key of ["file", "find", "replace", "why"]) {
    if (typeof mutation[key] !== "string") {
      throw new Error("mutation entry needs a text \"" + key + "\": " + JSON.stringify(mutation));
    }
  }
  if (mutation.find === "") {
    throw new Error('mutation "' + mutation.why + '": "find" is empty.');
  }
  const top = mutation.file.split(/[\\/]/)[0];
  if (!COPY_ENTRIES.includes(top)) {
    throw new Error('mutation "' + mutation.why + '": "file" must start with one of ' +
      COPY_ENTRIES.join(", ") + " (it is relative to the top folder of the project), got " +
      mutation.file);
  }
}

// The changed text. split/join rather than String.replace, because replace
// would treat "$&", "$$" and similar in the replacement as special patterns.
// Throws unless "find" appears exactly once, so a list that has gone out of
// date is reported instead of silently testing something else.
function applyMutation(text, mutation) {
  const pieces = text.split(mutation.find);
  const found = pieces.length - 1;
  if (found !== 1) {
    throw new Error('mutation "' + mutation.why + '": its "find" text appears ' + found +
      " times in " + mutation.file + " (it must appear exactly once). Update tests/laser/mutations.js.");
  }
  return pieces.join(mutation.replace);
}

// A mistake must be a mistake in the physics or the logic, not a typo that
// stops the file from loading at all — that would be "caught" by every test
// and prove nothing.
function checkStillValid(code, mutation) {
  if (mutation.file.endsWith(".js")) {
    try {
      new vm.Script(code, { filename: mutation.file });
    } catch (err) {
      throw new Error('mutation "' + mutation.why + '": after the change ' + mutation.file +
        " is not valid JavaScript (" + err.message + ").");
    }
  } else if (mutation.file.endsWith(".json")) {
    try {
      JSON.parse(code);
    } catch (err) {
      throw new Error('mutation "' + mutation.why + '": after the change ' + mutation.file +
        " is not valid JSON (" + err.message + ").");
    }
  }
}

/* ---------- copies and test runs ---------- */

function makeCopy() {
  const copyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "laser-mutation-"));
  for (const entry of COPY_ENTRIES) {
    fs.cpSync(path.join(REAL_ROOT, entry), path.join(copyRoot, entry), { recursive: true });
  }
  return copyRoot;
}

// Runs one test file against the project copy at copyRoot, with
// `node --test`, as the whole suite runs it (each file in a process of its
// own), and once more if it died before reporting any test. Resolves to { outcome: "passed" | "failed" | "timed out", output,
// ms }; rejects if the run cannot start or prints more than
// options.maxOutput characters.
function runFile(copyRoot, file, options) {
  return runFileOnce(copyRoot, file, options).then((run) => {
    if (run.outcome !== "failed" || !diedBeforeAnyTest(run.output)) return run;
    // Node itself sometimes crashes (exit 139, a segmentation fault: 1 run
    // in about 30 of page-choose.test.js under a full machine, Node 24.14,
    // 2026-11-21) before the file reports a single test. Run it once
    // more: a file that really cannot load fails again, so the verdict is
    // the same, and a crash no longer stops the whole check.
    return runFileOnce(copyRoot, file, options);
  });
}

// True when a run failed as a whole file without reporting any test of
// its own (node --test's summary: one test, the file, and it failed).
function diedBeforeAnyTest(output) {
  return /ℹ tests 1\b/.test(output) && /ℹ pass 0\b/.test(output) && /test at [^\n]*:1:1/.test(output);
}

function runFileOnce(copyRoot, file, options) {
  const env = Object.assign({}, process.env, {
    LASER_TEST_ROOT: copyRoot,
    LASER_MUTATION_CHECK: "1"
  });
  // When this checker itself runs inside "node --test" (its own test does
  // that), Node gives it NODE_TEST_CONTEXT. A nested "node --test" that
  // inherits it reports to the outer runner instead of setting its own exit
  // code. Start the inner run clean.
  delete env.NODE_TEST_CONTEXT;

  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--test", file], { env: env });
    let output = "";
    let tooMuchOutput = false;
    function collect(text) {
      if (tooMuchOutput) return;
      output += text;
      if (output.length > options.maxOutput) {
        tooMuchOutput = true;
        child.kill();
      }
    }
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error("could not run the tests: " + err.message));
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const ms = Date.now() - started;
      if (timedOut) {
        resolve({ outcome: "timed out", output: output, ms: ms });
      } else if (tooMuchOutput) {
        reject(new Error("the tests printed more than " + options.maxOutput +
          " characters; a mistake probably makes a test print in a loop."));
      } else if (signal) {
        reject(new Error("the test run was killed by " + signal));
      } else {
        resolve({ outcome: code === 0 ? "passed" : "failed", output: output, ms: ms });
      }
    });
  });
}

// Runs test files one after another and stops at the first that does not
// pass: one failing test is all a mistake needs to be caught, and a file
// that hangs leaves the outcome unknown. Resolves to { outcome, output,
// files }: "passed", "failed" or "timed out", the output of the file that
// decided it, and the files that ran, in order.
async function runFiles(copyRoot, files, options) {
  const ran = [];
  for (const file of files) {
    const run = await runFile(copyRoot, file, options);
    ran.push(file);
    if (run.outcome !== "passed") {
      return { outcome: run.outcome, output: path.basename(file) + ":\n" + run.output, files: ran };
    }
  }
  return { outcome: "passed", output: "", files: ran };
}

// The order to run the test files in for a mistake in `mutatedFile`: first
// the files named after it (js/laser/engine/bench.js: bench.test.js and
// bench-pumps.test.js), which catch most mistakes, then the others. Each
// group runs quickest first, by `durations` (ms per file, from the
// unchanged copy's run), so a mistake that a quick file catches costs
// little. Without durations each group keeps the given order.
function orderFor(mutatedFile, testFiles, durations) {
  const stem = path.basename(mutatedFile).replace(/\.[^.]+$/, "");
  function isNamedAfter(file) {
    const name = path.basename(file);
    return name.startsWith(stem + ".") || name.startsWith(stem + "-");
  }
  function quickestFirst(a, b) {
    if (!durations) return 0;
    return (durations[a] || 0) - (durations[b] || 0);
  }
  const named = testFiles.filter(isNamedAfter).sort(quickestFirst);
  const others = testFiles.filter((file) => !isNamedAfter(file)).sort(quickestFirst);
  return named.concat(others);
}

// Runs work(item) for every item, at most `limit` at a time. Resolves to the
// answers in the order of the items, whatever order they finish in.
async function inParallel(items, limit, work) {
  const answers = new Array(items.length);
  let next = 0;
  // Each worker takes the next item until none is left.
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      answers[index] = await work(items[index]);
    }
  }
  const workers = [];
  for (let i = 0; i < Math.min(limit, items.length); i++) workers.push(worker());
  await Promise.all(workers);
  return answers;
}

function withDefaults(options) {
  return Object.assign({
    testFiles: allTestFiles(),
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxOutput: DEFAULT_MAX_OUTPUT,
    parallel: PARALLEL_RUNS,
    durations: null
  }, options || {});
}

/* ---------- the public functions ---------- */

// The tests against an unchanged copy, every file, several at a time.
// Resolves to { outcome, output, durations }: the outcome must be "passed"
// before any mistake can be judged; output is that of the first file in
// the list that did not pass; durations gives each file's time in ms, which
// orders the files for the mistakes.
async function runBaseline(options) {
  const opts = withDefaults(options);
  const copyRoot = makeCopy();
  try {
    const runs = await inParallel(opts.testFiles, opts.parallel, (file) => runFile(copyRoot, file, opts));
    const durations = {};
    let outcome = "passed";
    let output = "";
    for (let i = 0; i < runs.length; i++) {
      const file = opts.testFiles[i];
      durations[file] = runs[i].ms;
      if (outcome === "passed" && runs[i].outcome !== "passed") {
        outcome = runs[i].outcome;
        output = path.basename(file) + ":\n" + runs[i].output;
      }
    }
    return { outcome: outcome, output: output, durations: durations };
  } finally {
    fs.rmSync(copyRoot, { recursive: true, force: true });
  }
}

// One mistake. Resolves to { outcome: "caught" | "missed" | "timed out",
// output, files } (files: the test files that ran, in order); rejects if the
// entry itself is wrong.
async function runMutation(mutation, options) {
  const opts = withDefaults(options);
  checkEntry(mutation);
  const copyRoot = makeCopy();
  try {
    const target = path.resolve(copyRoot, mutation.file);
    if (!target.startsWith(copyRoot + path.sep)) {
      throw new Error('mutation "' + mutation.why + '": ' + mutation.file + " points outside the copy.");
    }
    if (!fs.existsSync(target)) {
      throw new Error('mutation "' + mutation.why + '": there is no file ' + mutation.file);
    }
    const changed = applyMutation(fs.readFileSync(target, "utf8"), mutation);
    checkStillValid(changed, mutation);
    fs.writeFileSync(target, changed);

    const order = orderFor(mutation.file, opts.testFiles, opts.durations);
    const run = await runFiles(copyRoot, order, opts);
    const outcome = run.outcome === "failed" ? "caught"
      : run.outcome === "passed" ? "missed"
      : "timed out";
    return { outcome: outcome, output: run.output, files: run.files };
  } finally {
    fs.rmSync(copyRoot, { recursive: true, force: true });
  }
}

// Every mistake in a list, PARALLEL_RUNS at a time (options.parallel to
// change that). Resolves to one result per entry, in the order of the list:
// { mutation, outcome, error } where outcome is "caught", "missed",
// "timed out" or "error".
async function checkMutations(list, options) {
  const opts = withDefaults(options);
  return inParallel(list, opts.parallel, async (mutation) => {
    try {
      const run = await runMutation(mutation, opts);
      return { mutation: mutation, outcome: run.outcome, error: null };
    } catch (err) {
      return { mutation: mutation, outcome: "error", error: err.message };
    }
  });
}

/* ---------- running it from the command line ---------- */

const LABELS = { caught: "caught", missed: "MISSED", "timed out": "TIMED OUT", error: "ERROR" };

async function main() {
  const started = Date.now();
  const baseline = await runBaseline();
  if (baseline.outcome !== "passed") {
    console.log(baseline.output);
    console.log("The tests do not pass on an unchanged copy of the project (" + baseline.outcome +
      "), so no mistake can be judged. Make `node --test` pass first.");
    process.exitCode = 1;
    return;
  }

  const { MUTATIONS } = require("./mutations.js");
  const results = await checkMutations(MUTATIONS, { durations: baseline.durations });
  let problems = 0;

  for (const result of results) {
    const label = (LABELS[result.outcome] + "           ").slice(0, 11);
    if (result.outcome !== "caught") problems += 1;
    if (result.outcome === "error") {
      console.log("  " + label + " " + result.error);
    } else {
      console.log("  " + label + " " + result.mutation.file + ": " + result.mutation.why);
    }
  }

  console.log("");
  console.log((results.length - problems) + " of " + results.length + " deliberate mistakes caught (" +
    Math.round((Date.now() - started) / 1000) + " s).");
  if (problems > 0) {
    console.log("Add a test for each MISSED mistake, bound the work of the tests a TIMED OUT one " +
      "slowed down (maxSteps; a { timeout } cannot stop a synchronous test), " +
      "and fix each ERROR entry in tests/laser/mutations.js.");
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.log(err.message);
    process.exitCode = 1;
  });
}

module.exports = { applyMutation, orderFor, runBaseline, runMutation, checkMutations, COPY_ENTRIES };
