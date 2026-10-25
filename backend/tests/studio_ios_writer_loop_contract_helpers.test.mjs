import assert from "node:assert/strict";
import test from "node:test";
import { dirname, basename, join } from "node:path";
import { tmpdir } from "node:os";

import {
  assertSinglePassedTestSummary,
  failureOutputTail,
  FAILURE_OUTPUT_LIMIT,
  xcresultFailureDetails,
  writerLoopResultBundlePath,
} from "../evals/studio_ios_writer_loop_contract_helpers.mjs";

for (const [name, environment, expectedDirectory] of [
  ["explicit artifact owner", { ARTIFACT_DIR: "/tmp/them-owned-evidence", RUNNER_TEMP: "/runner", TMPDIR: "/temporary" }, "/tmp/them-owned-evidence"],
  ["existing CI upload glob", { RUNNER_TEMP: "/runner", TMPDIR: "/temporary" }, "/runner/them-v1-ui-smoke"],
  ["local temporary owner", { TMPDIR: "/temporary" }, "/temporary/them-v1-ui-smoke"],
  ["platform fallback", {}, join(tmpdir(), "them-v1-ui-smoke")],
]) {
  test(`[studio-ios-writer-loop] retains a unique native bundle under ${name}`, () => {
    const first = writerLoopResultBundlePath(environment);
    const second = writerLoopResultBundlePath(environment);
    assert.equal(dirname(first), expectedDirectory);
    assert.match(basename(first), /^writer-loop-[0-9a-f-]{36}\.xcresult$/);
    assert.notEqual(first, second, "Runs must not overwrite an earlier result bundle.");
  });
}

test("[studio-ios-writer-loop] accepts exactly one passed, unskipped test", () => {
  assert.doesNotThrow(() => assertSinglePassedTestSummary({
    totalTestCount: 1,
    passedTests: 1,
    failedTests: 0,
    skippedTests: 0,
  }));
});

for (const [name, summary] of [
  ["zero executed tests", { totalTestCount: 0, passedTests: 0, failedTests: 0, skippedTests: 0 }],
  ["a skipped test", { totalTestCount: 1, passedTests: 0, failedTests: 0, skippedTests: 1 }],
  ["multiple tests", { totalTestCount: 2, passedTests: 2, failedTests: 0, skippedTests: 0 }],
]) {
  test(`[studio-ios-writer-loop] rejects ${name}`, () => {
    assert.throws(
      () => assertSinglePassedTestSummary(summary),
      /did not execute exactly once/
    );
  });
}

test("[studio-ios-writer-loop] bounds diagnostic output to its final context", () => {
  const prefix = "not-the-useful-part";
  const suffix = "root-cause-at-the-end";
  const output = `${prefix}${"x".repeat(FAILURE_OUTPUT_LIMIT * 2)}${suffix}`;
  const bounded = failureOutputTail(output);

  assert.doesNotMatch(bounded, new RegExp(prefix));
  assert.match(bounded, new RegExp(suffix));
  assert.ok(bounded.length < output.length);
});

test("[studio-ios-writer-loop] extracts only actionable xcresult failure records", () => {
  const details = xcresultFailureDetails({
    devices: [{ deviceName: "irrelevant" }],
    testNodes: [{
      nodeType: "UI test bundle",
      name: "themUITests",
      children: [{
        nodeType: "Test Case",
        name: "writer loop",
        result: "Failed",
        children: [{
          nodeType: "Test Case Run",
          children: [{
            nodeType: "Failure Message",
            name: "XCTAssertTrue failed",
            details: "Save Now did not commit the UI-entered draft.",
          }],
        }],
      }, {
        nodeType: "Test Case",
        name: "unrelated passing test",
        result: "Passed",
      }],
    }],
  });

  assert.match(details, /failed test: writer loop/);
  assert.match(details, /failure: XCTAssertTrue failed.*Save Now did not commit/);
  assert.doesNotMatch(details, /unrelated passing test|irrelevant/);
});

test("[studio-ios-writer-loop] retains the first assertion before an oversized UI hierarchy", () => {
  const output = xcresultFailureDetails({ testNodes: [{ nodeType: "Failure Message",
    name: "Real export did not present the native Files picker.",
    details: "Observed native picker hierarchy: " + "x".repeat(FAILURE_OUTPUT_LIMIT * 2),
  }] });
  assert.match(failureOutputTail(output), /Real export did not present the native Files picker/);
  assert.match(output, /see retained xcresult/);
  assert.ok(output.length < FAILURE_OUTPUT_LIMIT);
});
