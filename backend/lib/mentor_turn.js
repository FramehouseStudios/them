// Mentor turns: when the writer is in a writing session (not writing pages),
// Clementine speaks as a screenwriting mentor — verdict, reason, the move —
// and gets a model that can carry that. This module decides which turns those
// are and elevates the chat model plan for them.
//
// The client's assembled system prompt marks writing sessions itself: the
// SCENE PITCH rule is present on every turn that could pitch or build a scene,
// and SCREENPLAY STUDIO MODE is present inside the Studio. A Studio project
// or target on the request is the same signal from the other side.

const MENTOR_MARKERS = Object.freeze([
  "SCENE PITCH (standing collaborator rule)",
  "SCREENPLAY STUDIO MODE",
]);
const MENTOR_REASON = "mentor_craft_talk";
const DEFAULT_RICH_MODEL = "gpt-4o";

function envFlagOff(value) {
  const n = String(value ?? "").trim().toLowerCase();
  return n === "0" || n === "false" || n === "no" || n === "off";
}

/** CLEMENTINE_MENTOR_TURNS=0 restores the plain conversational contract. */
function mentorTurnsEnabled(env = process.env) {
  return !envFlagOff(env?.CLEMENTINE_MENTOR_TURNS);
}

function isMentorTurn({
  customSystemPrompt = "",
  screenplayPageWrite = false,
  screenplayContextActive = false,
  env = process.env,
} = {}) {
  if (screenplayPageWrite) return false;
  if (!mentorTurnsEnabled(env)) return false;
  if (screenplayContextActive) return true;
  const prompt = String(customSystemPrompt || "");
  if (!prompt) return false;
  return MENTOR_MARKERS.some((marker) => prompt.includes(marker));
}

/**
 * A mentor turn never runs on the fast tier. Load-shed plans are respected
 * (the server is protecting itself), and rich/structural plans stay as chosen.
 */
function elevateChatModelPlanForMentorTurn(plan, {
  mentorTurn = false,
  richModel = "",
  env = process.env,
} = {}) {
  if (!mentorTurn || !plan || typeof plan !== "object") return plan;
  if (String(plan.tier || "") !== "fast") return plan;
  if (String(plan.reason || "").startsWith("load_shed")) return plan;
  const model = String(richModel || env?.CHAT_MODEL_RICH || DEFAULT_RICH_MODEL).trim() || DEFAULT_RICH_MODEL;
  return {
    ...plan,
    model,
    tier: "rich",
    reason: MENTOR_REASON,
    apiMode: "chat_completions",
    reasoningEffort: "",
    fallbackModel: "",
  };
}

export {
  MENTOR_MARKERS,
  MENTOR_REASON,
  DEFAULT_RICH_MODEL,
  mentorTurnsEnabled,
  isMentorTurn,
  elevateChatModelPlanForMentorTurn,
};
