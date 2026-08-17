#!/usr/bin/env node

process.env.RUN_SERVER = "0";

const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
if (!apiKey) {
  console.error("LIVE STUDIO STRUCTURAL CANARY BLOCKED: OPENAI_API_KEY is required.");
  process.exit(2);
}

const [
  { renderStudioRealtimeText },
  { enforceStudioScreenplayQuality, enforceStudioStructuralAnalysisQuality },
  { buildModelPrompt, inferScreenplayTask },
  canary,
] = await Promise.all([
  import("../index.js"),
  import("../lib/studio_screenplay_quality_gate.js"),
  import("../lib/prompt_assembly.js"),
  import("../lib/live_studio_structural_canary.js"),
]);

const results = [];
for (const scenario of canary.LIVE_STUDIO_STRUCTURAL_CANARY_CASES) {
  const screenplayTask = inferScreenplayTask(scenario.transcript);
  const providerSystemPrompt = buildModelPrompt({
    persona: scenario.systemPrompt,
    creativeMemory: {
      featureStoryGraph: scenario.studioMeta.screenplayFeatureStoryGraph,
    },
    sessionContext: scenario.studioMeta,
    screenplayTask,
  });
  const initialReply = await renderStudioRealtimeText({
    systemPrompt: providerSystemPrompt,
    transcript: scenario.transcript,
    modelTier: "structural",
    maxTokens: scenario.maxTokens,
  });
  const pageOutput = scenario.outputKind === "page";
  const guarded = pageOutput
    ? await enforceStudioScreenplayQuality({
        reply: initialReply,
        transcript: scenario.transcript,
        body: scenario.studioMeta,
        systemPrompt: providerSystemPrompt,
        renderRepair: renderStudioRealtimeText,
      })
    : await enforceStudioStructuralAnalysisQuality({
        reply: initialReply,
        transcript: scenario.transcript,
        studioMeta: scenario.studioMeta,
        modelReason: scenario.modelReason,
        taskIntent: scenario.taskIntent,
        maxTokens: scenario.maxTokens,
        renderRepair: renderStudioRealtimeText,
      });
  const finalReply = guarded.reply || initialReply;
  const releaseScore = pageOutput
    ? canary.scoreStudioContinuationCanaryReply({
        reply: finalReply,
        corrections: canary.STORY_OBLIGATION_CORRECTIONS,
      })
    : canary.scoreStudioStructuralCanaryReply({
        reply: finalReply,
        caseId: scenario.id,
        corrections: canary.STORY_OBLIGATION_CORRECTIONS,
      });
  const productionGate = pageOutput ? guarded.quality : guarded.structuralQuality;
  const productionPassed = pageOutput
    ? Boolean(guarded.ok)
    : Boolean(guarded.structuralQuality?.passed);
  const passed = productionPassed && releaseScore.passed;
  results.push({
    id: scenario.id,
    outputKind: pageOutput ? "page" : "structural_analysis",
    passed,
    repaired: Boolean(guarded.repaired),
    productionGate,
    releaseScore,
  });
  const dimensions = Object.entries(releaseScore.scores)
    .map(([name, value]) => `${name}=${value.toFixed(2)}`)
    .join(" ");
  console.log(
    `${passed ? "PASS" : "FAIL"} ${scenario.id} production=${productionPassed ? "pass" : "fail"} repaired=${guarded.repaired ? "1" : "0"} ${dimensions}`,
  );
  if (!passed) {
    console.log(`  failed=${releaseScore.failedDimensions.join(",") || productionGate?.reason || "production_gate"}`);
  }
}

const passed = results.every((item) => item.passed);
console.log(JSON.stringify({
  canary: "live_studio_story_quality",
  passed,
  provider: "openai",
  cases: results,
}, null, 2));
process.exit(passed ? 0 : 1);
