// Pure rule/heuristic Reflex classifier (D008 / T-clementine-reflex-lane).
//
// No model calls. Greetings, thanks, check-ins, simple acknowledgements, and
// light known-fact callbacks. Complex asks return isReflex:false so Companion /
// Page / Spark keep the turn.

/**
 * @typedef {{ id?: string, key?: string, label?: string, value?: string, text?: string }} KnownFact
 * @typedef {{ isReflex: boolean, templateId?: string, confidence: number, reason?: string }} ReflexClassification
 */

function normalizeText(input) {
  return String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[.!?…]+$/g, "")
    .replace(/\s+/g, " ");
}

function wordCount(text) {
  const t = String(text || "").trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

/** Hard vetoes — never Reflex (Spark / Page / Deep territory). */
function looksComplex(text) {
  if (!text) return false;
  if (wordCount(text) > 14) return true;
  if (
    /\b(write|draft|rewrite|continue|outline|plan|think hard|deep dive|advise|should i|help me decide|remember when|what did i|screenplay|slugline|int\.|ext\.)\b/.test(
      text
    )
  ) {
    return true;
  }
  if (/\?/.test(text) && wordCount(text) > 6) return true;
  // Multi-clause asks
  if ((text.match(/\b(and|but|because|also)\b/g) || []).length >= 2) return true;
  return false;
}

/**
 * Match a short known-fact callback, e.g. "my dog's name?" against knownFacts.
 * Only ultra-short fact probes — not open recall.
 * @param {string} text
 * @param {KnownFact[]} knownFacts
 * @returns {{ templateId: string, confidence: number, fact?: KnownFact } | null}
 */
function matchKnownFact(text, knownFacts) {
  if (!Array.isArray(knownFacts) || knownFacts.length === 0) return null;
  if (wordCount(text) > 8) return null;
  if (!/\b(name|called|what's my|whats my|what is my|remind me)\b/.test(text)) {
    return null;
  }
  for (const fact of knownFacts) {
    const key = normalizeText(fact?.key || fact?.label || fact?.id || "");
    const value = String(fact?.value || fact?.text || "").trim();
    if (!key || !value) continue;
    // Fact key appears in the ask (e.g. key "dog" / "dog_name")
    const keyBits = key.split(/[_\s-]+/).filter((b) => b.length > 2);
    if (keyBits.some((b) => text.includes(b))) {
      return { templateId: "known_fact", confidence: 0.82, fact };
    }
  }
  return null;
}

/**
 * Classify whether `text` can be answered on the Reflex lane (templates only).
 * @param {string} text
 * @param {{ knownFacts?: KnownFact[] }} [opts]
 * @returns {ReflexClassification}
 */
function classifyReflex(text, opts = {}) {
  const raw = String(text ?? "").trim();
  const normalized = normalizeText(raw);

  if (!normalized) {
    return { isReflex: true, templateId: "silence_soft", confidence: 0.95, reason: "empty" };
  }

  if (looksComplex(normalized) || looksComplex(raw.toLowerCase())) {
    return { isReflex: false, confidence: 0.9, reason: "complex" };
  }

  const factHit = matchKnownFact(normalized, opts.knownFacts || []);
  if (factHit) {
    return {
      isReflex: true,
      templateId: factHit.templateId,
      confidence: factHit.confidence,
      reason: "known_fact",
      fact: factHit.fact,
    };
  }

  // Silence / yield
  if (
    /^(ok|okay|k|mm+|hmm+|mhm|silence|pass|never ?mind|leave it|i'?ll leave that|wait|stop)$/.test(
      normalized
    )
  ) {
    return { isReflex: true, templateId: "silence_soft", confidence: 0.93, reason: "silence" };
  }

  // Thanks
  if (
    /^(thanks|thank you|thx|ty|appreciate it|thanks a lot|thank you so much)$/.test(normalized) ||
    /^thanks[, ]+(clementine|clem)?$/.test(normalized)
  ) {
    return { isReflex: true, templateId: "thanks", confidence: 0.94, reason: "thanks" };
  }

  // Simple acknowledgements
  if (
    /^(cool|got it|noted|yes|yeah|yep|yup|alright|all right|sounds good|fair|copy|roger)$/.test(
      normalized
    )
  ) {
    return { isReflex: true, templateId: "ack", confidence: 0.9, reason: "ack" };
  }

  // Check-ins (before bare greetings that share "how")
  if (
    /^(how are you|how're you|how r you|how are you doing|how's it going|hows it going|checking in|check[- ]?in|you good|you okay|you ok)(\s+today)?$/.test(
      normalized
    )
  ) {
    return { isReflex: true, templateId: "check_in", confidence: 0.92, reason: "check_in" };
  }

  // Greetings
  if (
    /^(hi|hey|hello|yo|hiya|howdy|gm|good morning|good evening|good night|good afternoon)([, ]+.*)?$/.test(
      normalized
    ) ||
    /^(hey there|hi there|hello there|what'?s up|whats up|sup)$/.test(normalized)
  ) {
    if (/^(gm|good morning)\b/.test(normalized)) {
      return { isReflex: true, templateId: "greeting_morning", confidence: 0.95, reason: "greeting" };
    }
    if (/^(good night|good evening)\b/.test(normalized)) {
      return { isReflex: true, templateId: "greeting_evening", confidence: 0.93, reason: "greeting" };
    }
    if (/^(what'?s up|whats up|sup)$/.test(normalized)) {
      return { isReflex: true, templateId: "greeting_whats_up", confidence: 0.93, reason: "greeting" };
    }
    return { isReflex: true, templateId: "greeting", confidence: 0.95, reason: "greeting" };
  }

  return { isReflex: false, confidence: 0.7, reason: "no_match" };
}

export { classifyReflex, normalizeText, looksComplex, matchKnownFact };
