export const FAILURE_OUTPUT_LIMIT = 24_000;

export function failureOutputTail(value) {
  const output = String(value || "");
  if (output.length <= FAILURE_OUTPUT_LIMIT) return output;
  return `[earlier output omitted; showing final ${FAILURE_OUTPUT_LIMIT} characters]\n`
    + output.slice(-FAILURE_OUTPUT_LIMIT);
}

export function assertSinglePassedTestSummary(summary) {
  const counts = {
    total: Number(summary?.totalTestCount),
    passed: Number(summary?.passedTests),
    failed: Number(summary?.failedTests),
    skipped: Number(summary?.skippedTests),
  };
  if (counts.total !== 1 || counts.passed !== 1 || counts.failed !== 0 || counts.skipped !== 0) {
    throw new Error(
      `Integrated iPhone writer-loop test did not execute exactly once: ${JSON.stringify(counts)}`
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
      if (message) details.push(`${label}: ${message}`);
    }
    for (const child of Array.isArray(node.children) ? node.children : []) visit(child);
  };
  for (const node of Array.isArray(testResults?.testNodes) ? testResults.testNodes : []) visit(node);
  return details.join("\n");
}
