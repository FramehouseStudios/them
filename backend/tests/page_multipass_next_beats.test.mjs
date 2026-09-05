import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPlanPrompt, parseNextBeats, runTalkGeneratePageMultipass } from "../lib/clementine/page_multipass.js";
import { LANE } from "../lib/clementine/lanes.js";

describe("page_multipass next-beats", () => {
  it("parseNextBeats returns 0 for no Next lines", () => {
    assert.deepEqual(parseNextBeats("no beats here"), []);
    assert.deepEqual(parseNextBeats(""), []);
    assert.deepEqual(parseNextBeats(null), []);
  });
  it("parseNextBeats returns 1 for single Next line", () => {
    const plan = "outline\nNext: protagonist finds clue — cost: loses trust";
    assert.deepEqual(parseNextBeats(plan), ["protagonist finds clue — cost: loses trust"]);
  });
  it("parseNextBeats returns 3 for three Next lines", () => {
    const plan = "line\nNext: A — cost: x\nNext: B — cost: y\nNext: C — cost: z\nend";
    assert.deepEqual(parseNextBeats(plan), ["A — cost: x", "B — cost: y", "C — cost: z"]);
  });
  it("parseNextBeats truncates at 3 for 5 Next lines", () => {
    const plan = ["Next: 1", "Next: 2", "Next: 3", "Next: 4", "Next: 5"].join("\n");
    const out = parseNextBeats(plan);
    assert.equal(out.length, 3);
    assert.deepEqual(out, ["1", "2", "3"]);
  });
  it("parseNextBeats truncates long lines at 180 chars", () => {
    const long = "Next: " + "x".repeat(250);
    const out = parseNextBeats(long);
    assert.equal(out[0].length, 180);
    assert.equal(out[0], "x".repeat(180));
  });
  it("buildPlanPrompt contains no proper names", () => {
    const prompt = buildPlanPrompt("write a scene where she leaves");
    // Ensure demo names from scratch branch are not present
    assert.equal(/Jess/.test(prompt), false);
    assert.equal(/Marcus/.test(prompt), false);
    assert.equal(/JESS/.test(prompt), false);
    assert.equal(/MARCUS/.test(prompt), false);
    // Should contain generic protagonist wording and Next: instruction
    assert.match(prompt, /Next:/);
    assert.match(prompt, /protagonist/i);
  });
  it("buildPlanPrompt is roster-free when called with single arg", () => {
    const prompt = buildPlanPrompt("test utterance");
    // No roster hint leakage
    assert.equal(prompt.includes("Roster:"), false);
  });
});

describe("page_multipass next-beats parsing of bullet lines", () => {
  it("accepts -, * and • bullets before Next:", () => {
    const plan = "outline\n- Next: A\n* Next: B\n• Next: C\nNext: D";
    assert.deepEqual(parseNextBeats(plan), ["A", "B", "C"]);
  });
  it("ignores lines where Next: is not at the start", () => {
    assert.deepEqual(parseNextBeats("The Next: thing\nnext:   only this"), ["only this"]);
  });
});

const PAGE = [
  "INT. KITCHEN - NIGHT",
  "",
  "Maya sets the tape on the table. Her hand does not leave it.",
  "",
  "MAYA",
  "You said you burned it.",
  "",
  "JUNE",
  "I said a lot of things.",
].join("\n");

function fakeSupplier(planContent) {
  return {
    stream: async () => { throw new Error("no stream"); },
    chat: async (args) => {
      const last = args.messages[args.messages.length - 1]?.content || "";
      let content = PAGE;
      if (args.multipassStage === "plan" || /outline|beat\/intent/i.test(last)) content = planContent;
      else if (args.multipassStage === "revise" || /Revise the Fountain/i.test(last)) content = PAGE + "\nMaya stands.\n";
      return {
        response: { ok: true, status: 200 },
        rawText: JSON.stringify({ choices: [{ message: { content } }] }),
        model: args.model,
        apiMode: args.apiMode || "chat_completions",
        reasoningEffort: args.reasoningEffort,
        fallbackUsed: false,
        usage: { inputTokens: 2, outputTokens: 30, reasoningTokens: 0, totalTokens: 32 },
      };
    },
  };
}

describe("page_multipass next-beats reach req.clementine only", () => {
  it("stores parsed beats on req.clementine.multipass and never touches req.body", async () => {
    const req = {
      body: { next_three_turns: ["writer's own plan"], screenplay_next_three_turns: ["writer's own plan"] },
      clementine: { lane: LANE.PAGE, effort: "low", pageMultipass: true, commitWallet: () => {} },
    };
    const bodyBefore = JSON.stringify(req.body);
    await runTalkGeneratePageMultipass({
      req,
      rid: "next-beats-1",
      logger: { log() {}, warn() {} },
      chatSupplier: fakeSupplier("1. Want\n2. Obstacle\n- Next: June lies to Maya — cost: the tape stays hidden\n- Next: Maya plays the tape — cost: June leaves\n- Next: the landlord knocks — cost: no time to decide"),
      system: "sys",
      talkGenerationTranscript: "risk the tape",
      chatMessages: [{ role: "user", content: "risk the tape" }],
      chatModelPlan: { model: "turn-model", apiMode: "chat_completions", reasoningEffort: "low", tier: "fast" },
      chatMaxTokens: 400,
      chatStart: Date.now(),
      env: { ...process.env, CLEMENTINE_PAGE_MULTIPASS: "1", CLEMENTINE_MUSE_ENABLED: "0" },
    });
    assert.deepEqual(req.clementine.multipass.nextBeats, [
      "June lies to Maya — cost: the tape stays hidden",
      "Maya plays the tape — cost: June leaves",
      "the landlord knocks — cost: no time to decide",
    ]);
    assert.equal(JSON.stringify(req.body), bodyBefore, "writer-supplied canon fields are untouched");
  });
});
