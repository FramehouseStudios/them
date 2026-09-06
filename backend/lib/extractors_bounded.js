// D009 — extract* helpers that read module limits, extracted verbatim from backend/index.js.
//
// Functions here read only their arguments, the helpers imported below, the
// limits in lib/limits.js, and each other. Moved verbatim with doc comments;
// index.js imports every name unchanged.

import { DEFAULT_ASSISTANT_SELF_NAME } from "../config.js";
import { USER_MEMORY_REMEMBERED_PEOPLE_MAX } from "./limits.js";
import { normalizeRememberedRelation } from "./normalizers.js";
import { normalizeAssistantSelfName, normalizeUserPersonName } from "./normalizers_bounded.js";
import { sanitizeRememberedPeople } from "./sanitizers_bounded.js";
import { escapeRegex, normalizeSnippet } from "./utils.js";
import { NOTE_CAPTURE_TRIGGERS, RESPONSE_FOCUS_STOPWORDS } from "./limits.js";

function extractNoteCaptureIntent(transcript) {
  const source = String(transcript || "").trim();
  if (!source) {
    return {
      shouldCapture: false,
      needsContent: false,
      noteText: "",
      trigger: "",
    };
  }

  const lower = source.toLowerCase();
  let trigger = "";
  let triggerIndex = -1;

  for (const candidate of NOTE_CAPTURE_TRIGGERS) {
    const idx = lower.indexOf(candidate);
    if (idx >= 0 && (triggerIndex === -1 || idx < triggerIndex)) {
      trigger = candidate;
      triggerIndex = idx;
    }
  }

  if (triggerIndex < 0) {
    return {
      shouldCapture: false,
      needsContent: false,
      noteText: "",
      trigger: "",
    };
  }

  let noteText = source.slice(triggerIndex + trigger.length).trim();
  noteText = noteText.replace(/^[\s:,\-–—]+/, "").trim();
  noteText = noteText.replace(/^["“”'`]+|["“”'`]+$/g, "").trim();

  const quoted = [...source.matchAll(/["“]([^"”]+)["”]/g)]
    .map((m) => String(m[1] || "").trim())
    .filter(Boolean);
  if (!noteText && quoted.length) {
    noteText = quoted[quoted.length - 1];
  }

  if (!noteText) {
    noteText = source
      .replace(/\bclementine\b[:,]?\s*/ig, "")
      .replace(
        new RegExp(
          `\\b(?:can you|could you|please|hey)?\\s*${escapeRegex(trigger)}\\b`,
          "i"
        ),
        ""
      )
      .replace(/^[\s:,\-–—]+/, "")
      .trim();
  }

  noteText = noteText.replace(/\b(?:please|for me)\b$/i, "").trim();
  noteText = noteText.replace(/\s+/g, " ");

  if (!noteText || noteText.length < 3) {
    return {
      shouldCapture: true,
      needsContent: true,
      noteText: "",
      trigger,
    };
  }

  return {
    shouldCapture: true,
    needsContent: false,
    noteText,
    trigger,
  };
}

function extractUserIdentityIntent(transcript) {
  const source = String(transcript || "").trim();
  const out = {
    clearPrimaryName: false,
    primaryName: "",
    rememberedPeople: [],
    hasUpdate: false,
  };
  if (!source) return out;

  if (/\b(?:forget|clear|reset)\s+(?:my|the)\s+name\b/i.test(source)) {
    out.clearPrimaryName = true;
    out.hasUpdate = true;
  }

  const primaryPatterns = [
    /\bmy\s+name(?:\s+is|['’]s)\s+([A-Za-z][A-Za-z0-9' -]{1,40})\b/i,
    /\b(?:call\s+me|you\s+can\s+call\s+me|i\s+go\s+by)\s+([A-Za-z][A-Za-z0-9' -]{1,40})\b/i,
    /\bremember\s+my\s+name(?:\s+is)?\s+([A-Za-z][A-Za-z0-9' -]{1,40})\b/i,
  ];
  for (const re of primaryPatterns) {
    const match = source.match(re);
    if (!match) continue;
    const candidate = normalizeUserPersonName(match[1]);
    if (!candidate) continue;
    out.primaryName = candidate;
    out.hasUpdate = true;
    break;
  }

  const rememberGate = /\b(?:remember|don['’]?t\s+forget)\b/i.test(source);
  if (rememberGate) {
    const remembered = [];
    const addRemembered = (nameRaw, relationRaw = "", noteRaw = "") => {
      const name = normalizeUserPersonName(nameRaw);
      if (!name) return;
      remembered.push({
        name,
        relation: normalizeRememberedRelation(relationRaw),
        note: normalizeSnippet(noteRaw, 90),
        updatedAt: Date.now(),
      });
    };

    let match;
    const namedRelationRe = /(?:remember|don['’]?t\s+forget)\s+(?:that\s+)?([A-Za-z][A-Za-z0-9' -]{1,40})\s+is\s+my\s+([A-Za-z][A-Za-z0-9' -]{1,40})/gi;
    while ((match = namedRelationRe.exec(source)) !== null) {
      addRemembered(match[1], match[2]);
    }

    const relationPairRe = /([A-Za-z][A-Za-z0-9' -]{1,40})\s+is\s+my\s+([A-Za-z][A-Za-z0-9' -]{1,40})/gi;
    while ((match = relationPairRe.exec(source)) !== null) {
      addRemembered(match[1], match[2]);
    }

    const simpleRememberRe = /(?:remember|don['’]?t\s+forget)\s+(?:about\s+)?([A-Za-z][A-Za-z0-9' -]{1,40})\b/gi;
    while ((match = simpleRememberRe.exec(source)) !== null) {
      addRemembered(match[1], "");
    }

    out.rememberedPeople = sanitizeRememberedPeople(remembered, USER_MEMORY_REMEMBERED_PEOPLE_MAX);
    if (out.rememberedPeople.length > 0) {
      out.hasUpdate = true;
    }
  }

  return out;
}

function extractAssistantRenameIntent(transcript) {
  const source = String(transcript || "").trim();
  if (!source) return { name: "", source: "none" };

  if (/\b(?:reset|clear)\s+(?:your\s+)?name\b/i.test(source)) {
    return { name: DEFAULT_ASSISTANT_SELF_NAME, source: "voice_reset" };
  }

  const patterns = [
    { source: "voice_call_you", re: /\bcall\s+you\s+([A-Za-z][A-Za-z0-9' -]{1,40})\b/i },
    { source: "voice_name_you", re: /\bname\s+you\s+([A-Za-z][A-Za-z0-9' -]{1,40})\b/i },
    {
      source: "voice_refer_as",
      re: /\b(?:refer\s+to\s+you\s+as|have\s+to\s+call\s+you|let\s+me\s+call\s+you)\s+([A-Za-z][A-Za-z0-9' -]{1,40})\b/i,
    },
    {
      source: "voice_change_name",
      re: /\b(?:change|set)\s+your\s+name\s+to\s+([A-Za-z][A-Za-z0-9' -]{1,40})\b/i,
    },
    {
      source: "voice_your_name_is",
      re: /\byour\s+name(?:\s+is|['’]s)\s+([A-Za-z][A-Za-z0-9' -]{1,40})\b/i,
    },
  ];

  const invalid = new Set(["later", "back", "tomorrow", "soon", "again", "now", "it", "that", "this"]);
  for (const pattern of patterns) {
    const match = source.match(pattern.re);
    if (!match) continue;
    const candidateRaw = String(match[1] || "")
      .replace(/\b(?:from\s+now\s+on|for\s+now|please|okay|ok)\b.*$/i, "")
      .trim();
    const candidate = normalizeAssistantSelfName(candidateRaw);
    if (!candidate) continue;
    if (invalid.has(candidate.toLowerCase())) continue;
    return { name: candidate, source: pattern.source };
  }

  return { name: "", source: "none" };
}

function extractAnchorTerms(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .filter((w) => w.length >= 4)
    .filter((w) => !RESPONSE_FOCUS_STOPWORDS.has(w));
}

export {
  extractAnchorTerms,
  extractAssistantRenameIntent,
  extractNoteCaptureIntent,
  extractUserIdentityIntent,
};
