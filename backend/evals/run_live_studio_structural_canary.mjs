#!/usr/bin/env node

process.env.RUN_SERVER = "0";

const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
if (!apiKey) {
  console.error("LIVE STUDIO STRUCTURAL CANARY BLOCKED: OPENAI_API_KEY is required.");
  process.exit(2);
}

const [{ renderStudioRealtimeText }, { enforceStudioStructuralAnalysisQuality }, canary] = await Promise.all([
  import("../index.js"),
  import("../lib/studio_screenplay_quality_gate.js"),
  import("../lib/live_studio_structural_canary.js"),
]);

const results = [];
for (const scenario of canary.LIVE_STUDIO_STRUCTURAL_CANARY_CASES) {
  const initialReply = await renderStudioRealtimeText({
    systemPrompt: scenario.systemPrompt,
    transcript: scenario.transcript,
    modelTier: "structural",
    maxTokens: scenario.maxTokens,
  });
  const guarded = await enforceStudioStructuralAnalysisQuality({
    reply: initialReply,
    transcript: scenario.transcript,
    studioMeta: scenario.studioMeta,
    modelReason: scenario.modelReason,
    taskIntent: scenario.taskIntent,
    maxTokens: scenario.maxTokens,
    renderRepair: renderStudioRealtimeText,
  });
  const releaseScore = canary.scoreStudioStructuralCanaryReply({
    reply: guarded.reply,
    caseId: scenario.id,
  });
  const passed = Boolean(guarded.structuralQuality?.passed) && releaseScore.passed;
  results.push({
    id: scenario.id,
    passed,
    repaired: Boolean(guarded.repaired),
    productionGate: guarded.structuralQuality,
    releaseScore,
  });
  const dimensions = Object.entries(releaseScore.scores)
    .map(([name, value]) => `${name}=${value.toFixed(2)}`)
    .join(" ");
  console.log(
    `${passed ? "PASS" : "FAIL"} ${scenario.id} production=${guarded.structuralQuality?.final_score?.toFixed?.(2) || "0.00"} repaired=${guarded.repaired ? "1" : "0"} ${dimensions}`,
  );
  if (!passed) {
    console.log(`  failed=${releaseScore.failedDimensions.join(",") || guarded.structuralQuality?.reason || "production_gate"}`);
  }
}

const passed = results.every((item) => item.passed);
console.log(JSON.stringify({
  canary: "live_studio_structural",
  passed,
  provider: "openai",
  cases: results,
}, null, 2));
process.exit(passed ? 0 : 1);
