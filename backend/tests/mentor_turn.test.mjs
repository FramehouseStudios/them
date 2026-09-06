import test from "node:test";
import assert from "node:assert/strict";
import {
  isMentorTurn,
  elevateChatModelPlanForMentorTurn,
  mentorTurnsEnabled,
  MENTOR_REASON,
} from "../lib/mentor_turn.js";

const PITCH_PROMPT = "You are Clementine.\n\nSCENE PITCH (standing collaborator rule):\n- This is the first exchange of the session.";
const STUDIO_PROMPT = "You are Clementine.\n\nSCREENPLAY STUDIO MODE (priority override - supersedes RESPONSE SHAPE below):";

test("[mentor-turn] writing-session prompts and Studio context mark a mentor turn; page writes never do", () => {
  assert.equal(isMentorTurn({ customSystemPrompt: PITCH_PROMPT, env: {} }), true);
  assert.equal(isMentorTurn({ customSystemPrompt: STUDIO_PROMPT, env: {} }), true);
  assert.equal(isMentorTurn({ customSystemPrompt: "", screenplayContextActive: true, env: {} }), true);
  assert.equal(isMentorTurn({ customSystemPrompt: PITCH_PROMPT, screenplayPageWrite: true, env: {} }), false, "pages keep the page contract");
  assert.equal(isMentorTurn({ customSystemPrompt: "You are Clementine. GRIEF MODE (active this turn)", env: {} }), false, "no marker → plain conversation");
  assert.equal(isMentorTurn({ customSystemPrompt: "", env: {} }), false);
  assert.equal(isMentorTurn({ customSystemPrompt: PITCH_PROMPT, env: { CLEMENTINE_MENTOR_TURNS: "0" } }), false, "kill switch");
  assert.equal(mentorTurnsEnabled({}), true);
  assert.equal(mentorTurnsEnabled({ CLEMENTINE_MENTOR_TURNS: "off" }), false);
});

test("[mentor-turn] a fast plan is elevated to rich; rich, structural, and load-shed plans are left alone", () => {
  const fast = { model: "gpt-4o-mini", tier: "fast", reason: "default_fast", apiMode: "chat_completions", repairModel: "gpt-4o" };
  const elevated = elevateChatModelPlanForMentorTurn(fast, { mentorTurn: true, env: { CHAT_MODEL_RICH: "gpt-4o" } });
  assert.equal(elevated.tier, "rich");
  assert.equal(elevated.model, "gpt-4o");
  assert.equal(elevated.reason, MENTOR_REASON);
  assert.equal(elevated.apiMode, "chat_completions");
  assert.equal(elevated.repairModel, "gpt-4o", "other plan fields are carried");
  assert.equal(fast.tier, "fast", "input is not mutated");

  assert.equal(elevateChatModelPlanForMentorTurn(fast, { mentorTurn: false, env: {} }), fast);
  const structural = { model: "gpt-5.6-sol", tier: "structural", reason: "screenplay_momentum_rescue" };
  assert.equal(elevateChatModelPlanForMentorTurn(structural, { mentorTurn: true, env: {} }), structural);
  const rich = { model: "gpt-4o", tier: "rich", reason: "substantive_question" };
  assert.equal(elevateChatModelPlanForMentorTurn(rich, { mentorTurn: true, env: {} }), rich);
  const shed = { model: "gpt-4o-mini", tier: "fast", reason: "load_shed_latency" };
  assert.equal(elevateChatModelPlanForMentorTurn(shed, { mentorTurn: true, env: {} }), shed, "the server's self-protection wins");
  assert.equal(elevateChatModelPlanForMentorTurn(null, { mentorTurn: true }), null);
  assert.equal(elevateChatModelPlanForMentorTurn(fast, { mentorTurn: true, env: {} }).model, "gpt-4o", "default rich model");
  assert.equal(elevateChatModelPlanForMentorTurn(fast, { mentorTurn: true, richModel: "custom-rich" }).model, "custom-rich");
});
