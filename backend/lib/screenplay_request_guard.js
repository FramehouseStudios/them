// Shared by screenplay destination inference and cost-lane classification.
// Advice is not permission to generate pages or reserve their wallet meter.
function asksForAdviceOrPlanning(text = "") {
  // Inspect the request, not quoted dialogue or story material after a colon.
  const request = String(text ?? "").trim().toLowerCase().split(/[:\n]/, 1)[0]
    .replace(/^(?:hey[, ]+)?(?:clementine[, ]+)?(?:please\s+)?/, "");
  return [
    /^(?:how (?:do|can|should|would) (?:i|we|you)|(?:can|could|would) you (?:explain|teach|tell)|explain|teach me|tell me how)\b/,
    /^(?:what (?:is|are|makes)|why (?:is|are|does|do))\b/,
    /^(?:do not|don['’]t|never|i (?:do not|don['’]t) want (?:you to|to))\s+(?:write|draft|rewrite|revise|continue|generate|finish|complete|replace)\b/,
    /^(?:(?:can|could|would) you\s+)?help me\s+(?:plan|outline|brainstorm|understand|learn)\b/,
    /^(?:write|draft|give me|create|generate)\s+(?:(?:me\s+)?(?:an?|the)\s+)?(?:outline|plan|logline|synopsis|treatment|beat sheet|advice|notes)\b/,
  ].some((pattern) => pattern.test(request));
}

export { asksForAdviceOrPlanning };
