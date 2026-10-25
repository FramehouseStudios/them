import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const FAILURE_OUTPUT_LIMIT = 24_000;

export function writerLoopResultBundlePath(environment = process.env) {
  const artifactDirectory = environment.ARTIFACT_DIR
    || join(environment.RUNNER_TEMP || environment.TMPDIR || tmpdir(), "them-v1-ui-smoke");
  return join(artifactDirectory, `writer-loop-${randomUUID()}.xcresult`);
}

export function failureOutputTail(value) {
  const output = String(value || "");
  if (output.length <= FAILURE_OUTPUT_LIMIT) return output;
  return `[earlier output omitted; showing final ${FAILURE_OUTPUT_LIMIT} characters]\n`
    + output.slice(-FAILURE_OUTPUT_LIMIT);
}

export function assertSinglePassedTestSummary(summary) {
  assertPassedTestSummary(summary, 1, "Integrated iPhone writer-loop test did not execute exactly once");
}

export function assertPassedTestSummary(summary, expectedCount, failureMessage) {
  const counts = {
    total: Number(summary?.totalTestCount),
    passed: Number(summary?.passedTests),
    failed: Number(summary?.failedTests),
    skipped: Number(summary?.skippedTests),
  };
  if (counts.total !== expectedCount || counts.passed !== expectedCount || counts.failed !== 0 || counts.skipped !== 0) {
    throw new Error(
      `${failureMessage}: ${JSON.stringify(counts)}`
    );
  }
}

export function xcresultFailureDetails(testResults) {
  const details = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    const nodeType = String(node.nodeType || "");
    const result = String(node.result || "");
    if (nodeType === "Failure Message" || (nodeType === "Test Case" && result === "Failed")) {
      const label = nodeType === "Failure Message" ? "failure" : "failed test";
      const message = [node.name, node.details]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .join(" — ");
      // A single XCTest message can contain the entire UI hierarchy. Preserve
      // its assertion headline here so the outer bounded tail cannot erase it;
      // the retained xcresult still owns the complete hierarchy/screenshots.
      if (message) details.push(`${label}: ${message.slice(0, 2_000)}`
        + (message.length > 2_000 ? "\n[details truncated; see retained xcresult]" : ""));
    }
    for (const child of Array.isArray(node.children) ? node.children : []) visit(child);
  };
  for (const node of Array.isArray(testResults?.testNodes) ? testResults.testNodes : []) visit(node);
  return details.join("\n");
}
