// Dual-channel: talk ideas (conversation) while writing pages (Fountain) simultaneously.
// Clean + polished: conversation reply (x-reply, TTS) and screenplay pages (x-screenplay-output) are separate, never mixed.
// D009 strangler under lib/clementine; no backend/index.js growth.

import { buildShortFilmPrompt } from "./short_film_prompt.js";

function trimToString(v) { return v == null ? "" : String(v).trim(); }

// Pure: split dual output contract for talk_handler.
// Returns { conversationSystem, pageSystem } so lane=Page never leaks Fountain into chat.
export function splitDualChannel({ baseSystem, parsed, project } = {}) {
  const short = buildShortFilmPrompt(parsed, { project });
  const pageSystem = baseSystem ? `${baseSystem}\n\n${short.system}` : short.system;
  const pageUser = short.user;
  // Conversation about ideas uses baseSystem + idea prompt (no Fountain constraints)
  const ideaPrompt = `You are Clementine discussing story ideas. Be concise, warm, and craft-aware. Do not write screenplay pages. Discuss: genre=${parsed?.genre||""}, tone=${parsed?.influences?.tones?.[0]||""}, logline hint. Offer 2-3 beats or character ideas as bullet thoughts. Keep to prose, no script formatting.`;
  const conversationSystem = baseSystem ? `${baseSystem}\n\n${ideaPrompt}` : ideaPrompt;
  return { pageSystem, pageUser, conversationSystem };
}

// Helper for talk_generate: run page lane + conversation chat in parallel, return both.
// chatSupplier must support chat({messages}) and signal. Conversation uses normal lane.
export async function runDualChannel({ req, parsed, project, chatSupplier, baseSystem, signal, chatModelPlan } = {}) {
  if (!parsed) throw new Error("runDualChannel requires parsed");
  if (!chatSupplier || typeof chatSupplier.chat !== "function") throw new Error("chatSupplier required");
  const { pageSystem, pageUser, conversationSystem } = splitDualChannel({ baseSystem, parsed, project });

  // Launch both in parallel for simultaneous feel; abort signal shared.
  const pagePromise = chatSupplier.chat({
    model: chatModelPlan?.model || process.env.CHAT_MODEL_STRUCTURAL || "gpt-5.6-sol",
    messages: [{ role: "system", content: pageSystem }, { role: "user", content: pageUser }],
    maxTokens: chatModelPlan?.maxTokens || 4000,
    apiMode: chatModelPlan?.apiMode,
    reasoningEffort: req?.clementine?.effort || chatModelPlan?.reasoningEffort,
    signal, lane: "Page",
  }).then(r => ({ kind: "page", draft: trimToString(r?.text || r?.rawText), usage: r?.usage || {} }))
   .catch(e => { if (e?.cancelled) throw e; throw e; });

  const convoPromise = chatSupplier.chat({
    model: chatModelPlan?.model || "gpt-4o-mini",
    messages: [{ role: "system", content: conversationSystem }, { role: "user", content: `Talk ideas for: ${parsed?.genre || ""} ${parsed?.setting||""} with ${Array.isArray(parsed?.characters)?parsed.characters.join(", "):""}. Share 2-3 story thoughts.` }],
    maxTokens: 600,
    temperature: 0.7,
    signal, lane: "normal_rotation",
  }).then(r => ({ kind: "convo", reply: trimToString(r?.text || r?.rawText) }))
   .catch(() => ({ kind: "convo", reply: "" })); // conversation is best-effort, never fails page write

  const [pageRes, convoRes] = await Promise.all([pagePromise, convoPromise]);
  return { draft: pageRes.draft, usage: pageRes.usage, conversationReply: convoRes.reply };
}

export default { splitDualChannel, runDualChannel };
