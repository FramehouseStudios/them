// Routing permission only. Never replace the original writer message sent to
// the model, stored in history, or used as screenplay content with this text.
// Swift mirror: DraftStudioPageWritePolicy; shared behavioral fixtures pin it.
const QUOTED_TEXT = /"[^"\n]*"|“[^”\n]*”|‘(?:[^’\n]|(?<=\w)’(?=\w))*?’(?!\w)|(?<!\w)'(?:[^'\n]|(?<=\w)'(?=\w))*?'(?!\w)/gu;
const ACTIONS = "keep writing|carry on|take it from here|punch up|open on|write|writing|rewrite|rewriting|revise|revising|draft|drafting|generate|generating|compose|composing|continue|continuing|finish|complete|change|changing|edit|editing|polish|polishing|replace|replacing|tighten|shorten|add|adding|insert|inserting|format|formatting|script";
const PREFIX = "(?:(?:hey|okay|ok)[, ]+)?(?:clementine[, ]+)?(?:(?:please|just|now|actually|and)[, ]+)*";
const REFUSAL = new RegExp(`^${PREFIX}(?:(?:i|we)\\s+)?(?:don'?t(?:\\s+want(?:\\s+you)?(?:\\s+to)?)?|do not(?:\\s+want(?:\\s+you)?(?:\\s+to)?)?|never|stop|avoid|no need to|let'?s not)\\s+(?:(?:please|just|a|any)\\s+)*(?:${ACTIONS})\\b`, "i");
const AFFIRMATIVE = new RegExp(`^${PREFIX}(?:(?:can|could|would|will) you (?:please )?|(?:i|we)(?: would|'d)? (?:want|need|like)(?: you)? to |let'?s |help me )?(?:${ACTIONS}|next page|next scene|more pages|give me (?:the |a |another |next )?(?:scene|page|script|screenplay))\\b`, "i");
const CONCEPTUAL = /^(?:write|draft|generate|compose)\s+(?:(?:a|an|the|my|this)\s+)?(?:outline|synopsis|premise|logline|notes|feedback)\b/i;

function maskQuotedScreenplayText(text, replacement = "\uE000quoted\uE001") {
  return String(text ?? "").replace(QUOTED_TEXT, replacement);
}

function analyzeScreenplayWriteInstruction(text = "") {
  const original = String(text ?? "");
  // Pasted screenplay dialogue is data, not permission/refusal. Only a request
  // preceding its first scene heading participates in this routing decision.
  let masked = original.replace(/^Intent:[^\n]+\n\s*Writer request:\s*/i, "");
  masked = masked.replace(/(?:^|\n)\s*(?:INT\.|EXT\.|INT\/EXT\.|I\/E\.)[\s\S]*$/i, "\n\uE000screenplay\uE001");
  masked = maskQuotedScreenplayText(masked).replace(/\u2019/g, "'");
  // Do not mistake "don't stop writing" for a command to stop.
  masked = masked.replace(/\b(?:don'?t|do not|never)\s+stop\s+(?:writing|drafting|rewriting)\b/gi, "keep writing");
  const clauses = masked.replace(/\b(?:but|instead|then)\b/gi, ";").split(/[.!?;\n]+/).map(s => s.trim()).filter(Boolean);
  const hadRefusal = clauses.some(clause => REFUSAL.test(clause));
  if (!hadRefusal) return { hadRefusal: false, refusesPageWrite: false, routingText: original };
  const remaining = clauses.filter(clause => !REFUSAL.test(clause));
  const permitsSeparateWrite = remaining.some(clause => {
    const unprefixed = clause.replace(new RegExp(`^${PREFIX}`, "i"), "");
    return !CONCEPTUAL.test(unprefixed) && AFFIRMATIVE.test(clause);
  });
  return { hadRefusal: true, refusesPageWrite: !permitsSeparateWrite, routingText: remaining.join(". ") };
}

function currentScreenplayInstruction(input = {}) {
  // Current heard/typed words outrank expansion/task hints from an earlier turn.
  for (const key of ["client_transcript", "clientTranscript", "transcript", "user_input", "userInput", "user_message", "userMessage", "text", "utterance", "prompt", "input", "debug_transcript", "debugTranscript", "screenplay_generation_transcript", "screenplayGenerationTranscript", "screenplay_task_hint", "screenplayTaskHint"]) {
    const text = String(input?.[key] ?? "").trim();
    if (text) return text;
  }
  return "";
}

export { analyzeScreenplayWriteInstruction, currentScreenplayInstruction, maskQuotedScreenplayText };
