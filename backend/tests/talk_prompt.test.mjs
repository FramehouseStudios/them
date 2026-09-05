import assert from "node:assert/strict";
import { test } from "node:test";
import { composeTalkSystemPrompt } from "../lib/talk_prompt.js";

test("talk prompt composes every addendum in canonical order before latency trimming", () => {
  const order = [
    "assistantSelfNameAddendum", "humanStyleAddendum", "therapeuticDepthAddendum",
    "socialSparkAddendum", "socialSparkMemoryHookAddendum", "knowledgeAddendum",
    "hiddenDepthModeAddendum", "seasonalWaveAddendum", "cycleEvolutionAddendum",
    "cycleConsciousMemoryAddendum", "backReferenceAddendum", "characterTextureAddendum",
    "trajectoryAddendum", "timeOfDayToneAddendum", "weeklyArcAddendum",
    "weeklyExpansionAddendum", "movementAddendum", "selfAwarenessAddendum",
    "melancholySeedAddendum", "directorAddendum",
  ];
  const addenda = Object.fromEntries(order.map((name) => [name, name]));
  const appended = [];
  const turnPlanner = { target: "brief" };
  const flags = { trim: true };
  const chatModelPlan = { model: "fixture" };
  let trimCalls = 0;
  const result = composeTalkSystemPrompt({
    systemBase: "base", addenda, turnPlanner, flags, chatModelPlan, routingLane: "fixture_lane",
    appendDirectorAddendum: (base, addendum) => {
      appended.push(addendum);
      return `${base}|${addendum}`;
    },
    fitSystemPromptForTurnLatency: (raw, context) => {
      trimCalls += 1;
      assert.deepEqual(appended, order);
      assert.equal(raw, ["base", ...order].join("|"));
      assert.equal(context.turnPlanner, turnPlanner);
      assert.equal(context.flags, flags);
      assert.equal(context.chatModelPlan, chatModelPlan);
      assert.equal(context.routingLane, "fixture_lane");
      return "trimmed system";
    },
  });
  assert.equal(trimCalls, 1);
  assert.deepEqual(result, { rawSystem: ["base", ...order].join("|"), system: "trimmed system" });
  assert.deepEqual(addenda, Object.fromEntries(order.map((name) => [name, name])));
});

test("talk prompt defaults empty addenda and forwards empty latency context", () => {
  let appendCalls = 0;
  const result = composeTalkSystemPrompt({
    appendDirectorAddendum: (base, addendum) => {
      appendCalls += 1;
      assert.equal(base, "");
      assert.equal(addendum, "");
      return base;
    },
    fitSystemPromptForTurnLatency: (raw, context) => {
      assert.deepEqual(context, { turnPlanner: null, flags: null, routingLane: "", chatModelPlan: null });
      return raw;
    },
  });
  assert.equal(appendCalls, 20);
  assert.deepEqual(result, { rawSystem: "", system: "" });
});

test("talk prompt requires both canonical callbacks before composing", () => {
  assert.throws(() => composeTalkSystemPrompt(), /requires appendDirectorAddendum/);
  let called = false;
  assert.throws(() => composeTalkSystemPrompt({
    appendDirectorAddendum: () => { called = true; },
  }), /requires fitSystemPromptForTurnLatency/);
  assert.equal(called, false);
});
