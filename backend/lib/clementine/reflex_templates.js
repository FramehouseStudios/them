// Reflex template bank (D008 / T-clementine-reflex-lane).
//
// Clementine voice: short, warm, not needy. No therapy-speak, no TPM,
// no essay. Light {{var}} interpolation only.

const TEMPLATE_BANK = Object.freeze({
  greeting: Object.freeze([
    "Hey.",
    "Hey — I'm here.",
    "Hi.",
  ]),
  greeting_morning: Object.freeze([
    "Morning.",
    "Morning — coffee and a blank page?",
  ]),
  greeting_evening: Object.freeze([
    "Evening.",
    "Hey. Quiet night for the page?",
  ]),
  greeting_whats_up: Object.freeze([
    "Not much. You got a scene?",
    "Here. What's calling?",
  ]),
  check_in: Object.freeze([
    "Good. What's the scene?",
    "Steady. You writing?",
    "I'm here — what's on the page?",
  ]),
  thanks: Object.freeze([
    "Anytime.",
    "Of course.",
    "Mm. Glad it landed.",
  ]),
  ack: Object.freeze([
    "Got it.",
    "Mm.",
    "Alright.",
  ]),
  silence_soft: Object.freeze([
    "I'll leave that.",
    "…",
    "Okay.",
  ]),
  known_fact: Object.freeze([
    "{{value}}.",
    "{{label}}: {{value}}.",
    "Still {{value}}.",
  ]),
});

const TEMPLATE_IDS = Object.freeze(Object.keys(TEMPLATE_BANK));

/**
 * Replace {{key}} placeholders. Missing keys → empty string.
 * @param {string} template
 * @param {Record<string, string|number|undefined|null>} [vars]
 */
function interpolate(template, vars = {}) {
  return String(template ?? "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
    const v = vars?.[key];
    if (v == null) return "";
    return String(v);
  }).replace(/[ \t]{2,}/g, " ").replace(/\s+\./g, ".").trim();
}

/**
 * Pick a template string for templateId. Stable index when seed provided.
 * @param {string} templateId
 * @param {{ seed?: number|string, vars?: Record<string, string|number|null|undefined> }} [opts]
 * @returns {{ text: string, templateId: string, variantIndex: number } | null}
 */
function renderReflexTemplate(templateId, opts = {}) {
  const id = String(templateId || "").trim();
  const variants = TEMPLATE_BANK[id];
  if (!Array.isArray(variants) || variants.length === 0) return null;

  let idx = 0;
  if (opts.seed != null && opts.seed !== "") {
    const s = String(opts.seed);
    let h = 0;
    for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    idx = h % variants.length;
  } else {
    idx = Math.floor(Math.random() * variants.length);
  }

  const raw = variants[idx];
  const text = interpolate(raw, opts.vars || {});
  if (!text) return null;
  return { text, templateId: id, variantIndex: idx };
}

function listTemplateIds() {
  return [...TEMPLATE_IDS];
}

function getTemplateBank() {
  return TEMPLATE_BANK;
}

export {
  TEMPLATE_BANK,
  TEMPLATE_IDS,
  interpolate,
  renderReflexTemplate,
  listTemplateIds,
  getTemplateBank,
};
