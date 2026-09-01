// Reflex lane entrypoint (D008 / T-clementine-reflex-lane).
//
// tryReflexReply — templates only, no Spark / no wallet / no TPM.
// Stubs (explicit): no on-device CoreML classifier yet; no server Glimmer.

import { classifyReflex } from "./reflex_classifier.js";
import { renderReflexTemplate } from "./reflex_templates.js";

/**
 * @typedef {{ id?: string, key?: string, label?: string, value?: string, text?: string }} KnownFact
 */

/**
 * Attempt a Reflex reply. Pure / local.
 *
 * @param {{
 *   text: string,
 *   knownFacts?: KnownFact[],
 *   voiceSpecHints?: { seed?: string|number, preferShort?: boolean },
 * }} args
 * @returns {{ handled: true, text: string, lane: 'reflex', templateId: string, confidence: number }
 *   | { handled: false }}
 */
function tryReflexReply({ text, knownFacts = [], voiceSpecHints = {} } = {}) {
  const classification = classifyReflex(text, { knownFacts });
  if (!classification.isReflex || !classification.templateId) {
    return { handled: false };
  }

  const fact = classification.fact || null;
  const vars = {};
  if (fact) {
    vars.value = String(fact.value || fact.text || "").trim();
    vars.label = String(fact.label || fact.key || fact.id || "that").trim();
    vars.name = vars.value;
  }

  const rendered = renderReflexTemplate(classification.templateId, {
    seed: voiceSpecHints?.seed ?? text,
    vars,
  });
  if (!rendered?.text) {
    return { handled: false };
  }

  // voiceSpecHints.preferShort: already short; no-op beyond bank choice
  return {
    handled: true,
    text: rendered.text,
    lane: "reflex",
    templateId: rendered.templateId,
    confidence: classification.confidence,
  };
}

export { tryReflexReply };
