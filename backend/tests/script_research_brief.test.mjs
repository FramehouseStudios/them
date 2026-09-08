import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BRIEF_CONTRACT, buildPrompt, mockBrief, validateBrief, buildBriefWithLLM } from "../lib/clementine/script_research/brief_llm.js";
import { ingestRow, setScores, clearResearch } from "../lib/clementine/script_research/store.js";
import { buildRollup } from "../lib/clementine/script_research/aggregate.js";
import { scoreScript } from "../lib/clementine/script_research/score.js";

describe("script research brief llm (nightly brief, samantha is clementine)", () => {
  it("contract + mockBrief + validate + prompt", () => {
    assert.ok(BRIEF_CONTRACT.required.includes("strengths"));
    const prompt = buildPrompt({ ownerKey:"o1", rollup:{ totalScripts:2, coverageMean:3, ghostPaidRatio:0.5, imageMissingRate:0.5, hedgesMean:3 }, rows:[{genre:"horror",tone:"dark",pages:1,scores:{coverage:{overall:3,verdict:"CONSIDER"},ghostPaidRatio:0,image:{missing:[{seq:4}]},writer:{hedges:3}},excerpt:"hello"}] });
    assert.ok(prompt.includes("Owner o1"));
    const mock = mockBrief({ rollup:{ coverageMean:2, imageMissingRate:0.6, hedgesMean:3 }, rows:[] });
    assert.equal(validateBrief(mock).ok, true);
    assert.equal(validateBrief({}).ok, false);
  });
  it("buildBriefWithLLM offline mocked when no chatSupplier", async () => {
    clearResearch("owner-brief-llm");
    const draft = "INT. bedroom - NIGHT\nWe see John is scared ghost very.\n\nJOHN\nPlease stay.";
    const row = ingestRow({ ownerKey:"owner-brief-llm", draft });
    const { scores, strengths, weaknesses } = scoreScript({ draft, ownerKey:"owner-brief-llm" });
    setScores({ ownerKey:"owner-brief-llm", fingerprint: row.fingerprint, scores, strengths, weaknesses });
    const rollup = buildRollup("owner-brief-llm");
    const { brief, usage } = await buildBriefWithLLM({ ownerKey:"owner-brief-llm", rollup, rows:[{...row, scores, strengths, weaknesses}] });
    assert.ok(brief.strengths.length>=2 && brief.weaknesses.length>=2 && brief.exercise.lines.length);
    assert.ok(usage.mocked===true);
  });
});
