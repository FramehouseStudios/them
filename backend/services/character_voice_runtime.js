// Per-character voice modeling for the screenplay studio.
//
// Pure runtime: deterministic extractor, schema, prompt-block formatter,
// drift scorer, and merger. No I/O, no LLM calls. Wire-up is done by
// callers (talk_prompt_context.js for prompt injection, route handlers
// for persistence). This is the "v1 mechanical" layer that gap #3 of the
// audit asks for; LLM enrichment of wants/fears/secrets is left as a
// follow-up that can populate the same schema.

const DEFAULT_MAX_SAMPLE_LINES = 6;
const DEFAULT_MAX_SIGNATURE_PHRASES = 8;
const DEFAULT_MAX_AVOIDED_WORDS = 8;
const DEFAULT_MAX_VOCAL_TICS = 6;
const DEFAULT_MAX_CHARACTERS = 24;

const STOPWORDS = new Set([
  "the","a","an","and","or","but","so","if","because","as","of","at","by","for",
  "with","about","to","from","in","on","into","over","under","up","down","out",
  "is","are","was","were","be","been","being","am","do","does","did","done",
  "have","has","had","having","i","you","he","she","it","we","they","me","him",
  "her","us","them","my","your","his","its","our","their","this","that","these",
  "those","what","which","who","whom","whose","when","where","why","how","not",
  "no","yes","just","very","really","kind","sort","like","get","got","go","goes",
  "going","gonna","wanna","yeah","yep","ok","okay","oh","uh","um","hey","hi",
  "well","then","than","there","here","now","still","also","too","one","two",
  "three","can","could","would","should","will","shall","may","might","must"
]);

const SIGNATURE_MIN_OCCURRENCES = 2;
const FRAGMENT_MAX_WORDS = 4;
const NORMALIZED_CARD_VERSION = 1;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clampNumber(value, min, max, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function clampStringList(items, maxItems, maxChars) {
  if (!Array.isArray(items)) return [];
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const text = String(item || "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text.slice(0, Math.max(1, maxChars)));
    if (out.length >= maxItems) break;
  }
  return out;
}

function tokenizeWords(line) {
  const matches = String(line || "")
    .toLowerCase()
    .match(/[a-z][a-z'-]*/g);
  return matches || [];
}

function isFragmentLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return false;
  const words = tokenizeWords(trimmed);
  if (words.length === 0) return false;
  if (words.length <= FRAGMENT_MAX_WORDS) return true;
  return !/[.!?]$/.test(trimmed);
}

function countContractions(line) {
  const matches = String(line || "").match(/\b\w+'(?:t|s|re|ve|d|ll|m)\b/gi);
  return matches ? matches.length : 0;
}

const PROFANITY_PATTERNS = [
  /\bfuck(?:ing|ed|er|s)?\b/i,
  /\bshit(?:ty|s)?\b/i,
  /\bass(?:hole)?\b/i,
  /\bdamn\b/i,
  /\bbitch(?:es)?\b/i,
  /\bhell\b/i,
  /\bbastard(?:s)?\b/i,
  /\bcrap\b/i,
];

function countProfanity(line) {
  const text = String(line || "");
  let count = 0;
  for (const pattern of PROFANITY_PATTERNS) {
    const matches = text.match(new RegExp(pattern, "gi"));
    if (matches) count += matches.length;
  }
  return count;
}

function isExclamationLine(line) {
  return /[!?]\s*$/.test(String(line || "").trim());
}

function isQuestionLine(line) {
  return /\?\s*$/.test(String(line || "").trim());
}

// Heuristic line classifier modeled on talk_screenplay.js conventions but
// kept self-contained so this module is pure. It detects scene headings,
// transitions, parentheticals, character cues, and dialogue. Action lines
// are everything else.
function classifyScreenplayLines(text) {
  const normalized = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const rawLines = normalized.split("\n");
  const out = [];
  let previousElement = "blank";

  for (let i = 0; i < rawLines.length; i += 1) {
    const raw = rawLines[i];
    const trimmed = String(raw || "").trim();
    let element = "blank";

    if (!trimmed) {
      element = "blank";
    } else if (/^(INT|EXT|EST|INT\/EXT|I\/E)\.?\s/.test(trimmed.toUpperCase())) {
      element = "sceneHeading";
    } else if (/^(FADE (IN|OUT|TO BLACK)|CUT TO|DISSOLVE TO|SMASH CUT|MATCH CUT)[:.]?$/i.test(trimmed)) {
      element = "transition";
    } else if (/^\(.+\)$/.test(trimmed)) {
      element = "parenthetical";
    } else if (
      trimmed.length <= 42 &&
      trimmed === trimmed.toUpperCase() &&
      /[A-Z]/.test(trimmed) &&
      !/[.!?]$/.test(trimmed)
    ) {
      // Looks like a cue. Confirm by checking that the next non-empty line
      // is dialogue or a parenthetical.
      const next = rawLines.slice(i + 1).map((l) => String(l || "").trim()).find(Boolean) || "";
      const nextLooksLikeDialogue = next && next !== next.toUpperCase();
      const nextIsParenthetical = /^\(.+\)$/.test(next);
      element = (nextLooksLikeDialogue || nextIsParenthetical) ? "character" : "action";
    } else if (
      previousElement === "character" ||
      previousElement === "parenthetical" ||
      previousElement === "dialogue"
    ) {
      element = "dialogue";
    } else {
      element = "action";
    }

    out.push({ index: i, text: trimmed, element });
    previousElement = element;
  }

  return out;
}

// Group every dialogue line under the most recent character cue.
function groupDialogueByCharacter(classifiedLines) {
  const groups = new Map();
  let activeCue = "";
  for (const line of classifiedLines) {
    if (line.element === "character") {
      // Strip "(V.O.)", "(O.S.)", "(CONT'D)" and similar suffixes.
      activeCue = line.text.replace(/\s*\([^)]+\)\s*$/g, "").trim();
      if (activeCue && !groups.has(activeCue)) {
        groups.set(activeCue, []);
      }
    } else if (line.element === "dialogue" && activeCue) {
      const list = groups.get(activeCue) || [];
      list.push(line.text);
      groups.set(activeCue, list);
    } else if (line.element === "blank" || line.element === "action" || line.element === "sceneHeading" || line.element === "transition") {
      // Blank lines do not break the cue (parentheticals and continued dialogue
      // can wrap), but a scene heading, transition, or action line clears it.
      if (line.element !== "blank") {
        activeCue = "";
      }
    }
  }
  return groups;
}

function buildCadence(dialogueLines) {
  if (!Array.isArray(dialogueLines) || dialogueLines.length === 0) {
    return {
      avgWordsPerLine: 0,
      medianWordsPerLine: 0,
      fragmentRatio: 0,
      contractionRatio: 0,
      profanityRatio: 0,
      exclamationRatio: 0,
      questionRatio: 0,
    };
  }
  const wordCounts = dialogueLines.map((line) => tokenizeWords(line).length);
  const totalWords = wordCounts.reduce((sum, n) => sum + n, 0);
  const totalLines = dialogueLines.length;
  const avg = totalWords / totalLines;
  const sorted = [...wordCounts].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 0;
  const fragments = dialogueLines.filter(isFragmentLine).length;
  const contractions = dialogueLines.reduce((n, line) => n + countContractions(line), 0);
  const profanity = dialogueLines.reduce((n, line) => n + countProfanity(line), 0);
  const exclamations = dialogueLines.filter(isExclamationLine).length;
  const questions = dialogueLines.filter(isQuestionLine).length;

  return {
    avgWordsPerLine: Math.round(avg * 10) / 10,
    medianWordsPerLine: median,
    fragmentRatio: Math.round((fragments / totalLines) * 100) / 100,
    contractionRatio: totalWords > 0 ? Math.round((contractions / totalWords) * 100) / 100 : 0,
    profanityRatio: totalWords > 0 ? Math.round((profanity / totalWords) * 100) / 100 : 0,
    exclamationRatio: Math.round((exclamations / totalLines) * 100) / 100,
    questionRatio: Math.round((questions / totalLines) * 100) / 100,
  };
}

function buildVocabFingerprint(dialogueLines, options = {}) {
  const maxSignatures = clampNumber(options.maxSignatures, 1, 32, DEFAULT_MAX_SIGNATURE_PHRASES);
  const maxAvoided = clampNumber(options.maxAvoided, 0, 32, DEFAULT_MAX_AVOIDED_WORDS);
  const corpusVocabulary = options.corpusVocabulary instanceof Set ? options.corpusVocabulary : null;

  const wordCounts = new Map();
  const bigramCounts = new Map();
  let totalWords = 0;

  for (const line of dialogueLines) {
    const words = tokenizeWords(line);
    totalWords += words.length;
    for (let i = 0; i < words.length; i += 1) {
      const word = words[i];
      if (STOPWORDS.has(word) || word.length < 3) continue;
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      if (i + 1 < words.length) {
        const next = words[i + 1];
        if (!STOPWORDS.has(next) && next.length >= 3) {
          const bigram = `${word} ${next}`;
          bigramCounts.set(bigram, (bigramCounts.get(bigram) || 0) + 1);
        }
      }
    }
  }

  const signatureCandidates = [];
  for (const [phrase, count] of bigramCounts.entries()) {
    if (count >= SIGNATURE_MIN_OCCURRENCES) signatureCandidates.push({ phrase, count, kind: "bigram" });
  }
  for (const [word, count] of wordCounts.entries()) {
    if (count >= SIGNATURE_MIN_OCCURRENCES) signatureCandidates.push({ phrase: word, count, kind: "word" });
  }
  signatureCandidates.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (b.kind !== a.kind) return b.kind === "bigram" ? 1 : -1; // prefer bigrams
    return a.phrase.localeCompare(b.phrase);
  });
  const signaturePhrases = signatureCandidates.slice(0, maxSignatures).map((entry) => entry.phrase);

  let avoidedWords = [];
  if (corpusVocabulary && corpusVocabulary.size > 0 && maxAvoided > 0) {
    const characterVocab = new Set(wordCounts.keys());
    const candidates = [];
    for (const word of corpusVocabulary) {
      if (!characterVocab.has(word) && !STOPWORDS.has(word) && word.length >= 4) {
        candidates.push(word);
      }
    }
    candidates.sort();
    avoidedWords = candidates.slice(0, maxAvoided);
  }

  return {
    totalWords,
    uniqueWords: wordCounts.size,
    signaturePhrases,
    avoidedWords,
  };
}

function buildVocalTics(dialogueLines, options = {}) {
  const maxTics = clampNumber(options.maxTics, 0, 16, DEFAULT_MAX_VOCAL_TICS);
  if (maxTics === 0) return [];
  const tics = new Map();
  const ticPatterns = [
    { id: "ellipsis", regex: /\.\.\./g, label: "trails off (...)" },
    { id: "em_dash", regex: /—|\s--\s/g, label: "interruptive em-dashes" },
    { id: "trailing_question", regex: /\?\s*$/m, label: "ends on a question" },
    { id: "double_exclam", regex: /!!+/g, label: "double exclamations" },
    { id: "filler_well", regex: /\bwell,/gi, label: "opens with 'well,'" },
    { id: "filler_look", regex: /\blook,/gi, label: "opens with 'look,'" },
    { id: "filler_listen", regex: /\blisten,/gi, label: "opens with 'listen,'" },
    { id: "i_mean", regex: /\bi mean\b/gi, label: "'I mean' as a tell" },
    { id: "you_know", regex: /\byou know\b/gi, label: "'you know' as a tell" },
  ];
  for (const line of dialogueLines) {
    for (const pattern of ticPatterns) {
      const matches = String(line || "").match(pattern.regex);
      if (matches && matches.length > 0) {
        tics.set(pattern.id, {
          id: pattern.id,
          label: pattern.label,
          count: (tics.get(pattern.id)?.count || 0) + matches.length,
        });
      }
    }
  }
  return [...tics.values()]
    .filter((tic) => tic.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, maxTics);
}

function buildSampleLines(dialogueLines, max = DEFAULT_MAX_SAMPLE_LINES) {
  const seen = new Set();
  const out = [];
  for (const line of dialogueLines) {
    const trimmed = String(line || "").trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed.slice(0, 240));
    if (out.length >= max) break;
  }
  return out;
}

// Public: extract one card per detected character cue from a Fountain-ish
// screenplay text. Pure function; no I/O.
function extractCharacterVoiceCards(screenplayText, options = {}) {
  const text = String(screenplayText || "");
  if (!text.trim()) return [];

  const maxCharacters = clampNumber(options.maxCharacters, 1, 64, DEFAULT_MAX_CHARACTERS);
  const minLines = clampNumber(options.minLines, 1, 32, 2);

  const classified = classifyScreenplayLines(text);
  const groups = groupDialogueByCharacter(classified);

  const corpusVocabulary = new Set();
  for (const lines of groups.values()) {
    for (const line of lines) {
      for (const word of tokenizeWords(line)) {
        if (!STOPWORDS.has(word) && word.length >= 4) corpusVocabulary.add(word);
      }
    }
  }

  const cards = [];
  for (const [name, dialogueLines] of groups.entries()) {
    if (dialogueLines.length < minLines) continue;
    const cadence = buildCadence(dialogueLines);
    const vocabFingerprint = buildVocabFingerprint(dialogueLines, {
      corpusVocabulary,
      maxSignatures: options.maxSignaturePhrases,
      maxAvoided: options.maxAvoidedWords,
    });
    const vocalTics = buildVocalTics(dialogueLines, { maxTics: options.maxVocalTics });
    cards.push({
      version: NORMALIZED_CARD_VERSION,
      name,
      aliases: [],
      role: "",
      lineCount: dialogueLines.length,
      cadence,
      vocabFingerprint,
      vocalTics,
      sampleLines: buildSampleLines(dialogueLines, options.maxSampleLines),
      // Manually-authored fields stay empty in the deterministic v1.
      wants: "",
      fears: "",
      secret: "",
      contradictions: [],
      notes: "",
      source: "deterministic",
      updatedAt: 0,
    });
  }

  cards.sort((a, b) => b.lineCount - a.lineCount);
  return cards.slice(0, maxCharacters);
}

// Public: schema enforcement so persisted cards (or cards crossing the
// route boundary) are predictable. Anything off-schema is dropped.
function normalizeCharacterVoiceCard(entry) {
  if (!isPlainObject(entry)) return null;
  const name = String(entry.name || "").trim().slice(0, 80);
  if (!name) return null;
  const cadenceIn = isPlainObject(entry.cadence) ? entry.cadence : {};
  const fingerprintIn = isPlainObject(entry.vocabFingerprint) ? entry.vocabFingerprint : {};
  return {
    version: NORMALIZED_CARD_VERSION,
    name,
    aliases: clampStringList(entry.aliases, 12, 48),
    role: String(entry.role || "").trim().slice(0, 80),
    lineCount: Math.max(0, Math.floor(Number(entry.lineCount) || 0)),
    cadence: {
      avgWordsPerLine: clampNumber(cadenceIn.avgWordsPerLine, 0, 1000, 0),
      medianWordsPerLine: clampNumber(cadenceIn.medianWordsPerLine, 0, 1000, 0),
      fragmentRatio: clampNumber(cadenceIn.fragmentRatio, 0, 1, 0),
      contractionRatio: clampNumber(cadenceIn.contractionRatio, 0, 1, 0),
      profanityRatio: clampNumber(cadenceIn.profanityRatio, 0, 1, 0),
      exclamationRatio: clampNumber(cadenceIn.exclamationRatio, 0, 1, 0),
      questionRatio: clampNumber(cadenceIn.questionRatio, 0, 1, 0),
    },
    vocabFingerprint: {
      totalWords: Math.max(0, Math.floor(Number(fingerprintIn.totalWords) || 0)),
      uniqueWords: Math.max(0, Math.floor(Number(fingerprintIn.uniqueWords) || 0)),
      signaturePhrases: clampStringList(fingerprintIn.signaturePhrases, DEFAULT_MAX_SIGNATURE_PHRASES, 64),
      avoidedWords: clampStringList(fingerprintIn.avoidedWords, DEFAULT_MAX_AVOIDED_WORDS, 48),
    },
    vocalTics: Array.isArray(entry.vocalTics)
      ? entry.vocalTics
          .map((tic) => {
            if (!isPlainObject(tic)) return null;
            const id = String(tic.id || "").trim().slice(0, 48);
            const label = String(tic.label || "").trim().slice(0, 120);
            if (!id || !label) return null;
            return { id, label, count: Math.max(1, Math.floor(Number(tic.count) || 1)) };
          })
          .filter(Boolean)
          .slice(0, DEFAULT_MAX_VOCAL_TICS)
      : [],
    sampleLines: clampStringList(entry.sampleLines, DEFAULT_MAX_SAMPLE_LINES, 240),
    wants: String(entry.wants || "").trim().slice(0, 240),
    fears: String(entry.fears || "").trim().slice(0, 240),
    secret: String(entry.secret || "").trim().slice(0, 240),
    contradictions: clampStringList(entry.contradictions, 6, 200),
    notes: String(entry.notes || "").trim().slice(0, 600),
    source: ["deterministic", "llm", "manual", "merged"].includes(entry.source) ? entry.source : "deterministic",
    updatedAt: Math.max(0, Math.floor(Number(entry.updatedAt) || 0)),
  };
}

function normalizeCharacterVoiceCardCollection(rawMap) {
  if (!isPlainObject(rawMap)) return {};
  const out = {};
  for (const [key, value] of Object.entries(rawMap)) {
    const normalized = normalizeCharacterVoiceCard(value);
    if (!normalized) continue;
    const slot = String(key || normalized.name).trim().slice(0, 80);
    if (!slot) continue;
    out[slot] = normalized;
  }
  return out;
}

// Public: merge a freshly-extracted card with an existing one, preserving
// manual fields (wants/fears/secret/notes/contradictions/role) while
// updating mechanical stats.
function mergeCharacterVoiceCard(existing, fresh) {
  const normalizedFresh = normalizeCharacterVoiceCard(fresh);
  if (!normalizedFresh) return null;
  const normalizedExisting = normalizeCharacterVoiceCard(existing);
  if (!normalizedExisting) return { ...normalizedFresh, source: "deterministic" };
  return {
    ...normalizedFresh,
    aliases: normalizedExisting.aliases.length ? normalizedExisting.aliases : normalizedFresh.aliases,
    role: normalizedExisting.role || normalizedFresh.role,
    wants: normalizedExisting.wants || normalizedFresh.wants,
    fears: normalizedExisting.fears || normalizedFresh.fears,
    secret: normalizedExisting.secret || normalizedFresh.secret,
    contradictions: normalizedExisting.contradictions.length
      ? normalizedExisting.contradictions
      : normalizedFresh.contradictions,
    notes: normalizedExisting.notes || normalizedFresh.notes,
    source: normalizedExisting.source === "manual" || normalizedExisting.source === "llm"
      ? "merged"
      : "deterministic",
  };
}

// Public: format a card as a system-prompt addendum block. The caller
// chooses when to include it (e.g. when the current turn targets this
// character cue).
function buildCharacterVoicePromptBlock(card, options = {}) {
  const normalized = normalizeCharacterVoiceCard(card);
  if (!normalized) return "";
  const includeSamples = options.includeSamples !== false;
  const maxSamples = clampNumber(options.maxSamples, 0, DEFAULT_MAX_SAMPLE_LINES, 3);

  const lines = [];
  lines.push(`CHARACTER VOICE — ${normalized.name.toUpperCase()}`);
  if (normalized.role) lines.push(`Role: ${normalized.role}`);
  if (normalized.wants) lines.push(`Want: ${normalized.wants}`);
  if (normalized.fears) lines.push(`Fear: ${normalized.fears}`);
  if (normalized.secret) lines.push(`Secret: ${normalized.secret}`);
  if (normalized.contradictions.length) {
    lines.push(`Contradiction: ${normalized.contradictions.join("; ")}`);
  }

  const cadenceBits = [];
  if (normalized.cadence.avgWordsPerLine) {
    cadenceBits.push(`avg ~${normalized.cadence.avgWordsPerLine} words/line`);
  }
  if (normalized.cadence.fragmentRatio >= 0.4) {
    cadenceBits.push("speaks in fragments");
  } else if (normalized.cadence.fragmentRatio <= 0.1 && normalized.cadence.avgWordsPerLine >= 12) {
    cadenceBits.push("speaks in full, longer sentences");
  }
  if (normalized.cadence.contractionRatio <= 0.02 && normalized.vocabFingerprint.totalWords > 40) {
    cadenceBits.push("rarely uses contractions");
  } else if (normalized.cadence.contractionRatio >= 0.08) {
    cadenceBits.push("contracts naturally");
  }
  if (normalized.cadence.profanityRatio >= 0.01) {
    cadenceBits.push("swears");
  } else if (normalized.vocabFingerprint.totalWords > 40) {
    cadenceBits.push("never swears");
  }
  if (normalized.cadence.questionRatio >= 0.3) {
    cadenceBits.push("asks more than they answer");
  }
  if (normalized.cadence.exclamationRatio >= 0.2) {
    cadenceBits.push("often emphatic");
  }
  if (cadenceBits.length) {
    lines.push(`Cadence: ${cadenceBits.join("; ")}.`);
  }

  if (normalized.vocabFingerprint.signaturePhrases.length) {
    lines.push(`Signature phrases: ${normalized.vocabFingerprint.signaturePhrases.slice(0, 6).join(", ")}.`);
  }
  if (normalized.vocabFingerprint.avoidedWords.length) {
    lines.push(`Avoids: ${normalized.vocabFingerprint.avoidedWords.slice(0, 6).join(", ")}.`);
  }
  if (normalized.vocalTics.length) {
    lines.push(`Vocal tics: ${normalized.vocalTics.map((tic) => tic.label).join("; ")}.`);
  }
  if (includeSamples && maxSamples > 0 && normalized.sampleLines.length) {
    lines.push("Sample lines:");
    for (const sample of normalized.sampleLines.slice(0, maxSamples)) {
      lines.push(`  • ${sample}`);
    }
  }
  lines.push("Stay inside this voice when writing or polishing this character's dialogue. Do not break their cadence or borrow another character's signature phrases.");

  return lines.join("\n");
}

// Public: build a single addendum string covering one or more cards
// targeted by the current turn.
function buildCharacterVoiceAddendum(cards = [], options = {}) {
  if (!Array.isArray(cards) || cards.length === 0) return "";
  const blocks = cards
    .map((card) => buildCharacterVoicePromptBlock(card, options))
    .filter(Boolean);
  if (blocks.length === 0) return "";
  return blocks.join("\n\n");
}

// Public: score how far a fresh batch of dialogue lines drifts from a
// stored card. Returns a [0..1] score (0 = identical fingerprint, 1 =
// maximum drift) and a list of specific human-readable flags.
function scoreCharacterVoiceDrift(card, dialogueLines = []) {
  const normalized = normalizeCharacterVoiceCard(card);
  if (!normalized) return { score: 0, flags: [], compared: false };
  const lines = Array.isArray(dialogueLines)
    ? dialogueLines.map((l) => String(l || "").trim()).filter(Boolean)
    : [];
  if (lines.length === 0) {
    return { score: 0, flags: [], compared: false };
  }

  const fresh = buildCadence(lines);
  const freshFingerprint = buildVocabFingerprint(lines, { maxSignatures: 8, maxAvoided: 0 });

  const flags = [];

  // Cadence drift.
  if (
    normalized.cadence.avgWordsPerLine > 0 &&
    fresh.avgWordsPerLine > 0 &&
    Math.abs(fresh.avgWordsPerLine - normalized.cadence.avgWordsPerLine) >=
      Math.max(4, normalized.cadence.avgWordsPerLine * 0.6)
  ) {
    flags.push(
      `cadence: avg words/line ${fresh.avgWordsPerLine} vs baseline ${normalized.cadence.avgWordsPerLine}`,
    );
  }

  if (
    normalized.cadence.fragmentRatio >= 0.4 &&
    fresh.fragmentRatio <= 0.15 &&
    lines.length >= 2
  ) {
    flags.push("character usually speaks in fragments; new lines are full sentences");
  } else if (
    normalized.cadence.fragmentRatio <= 0.1 &&
    fresh.fragmentRatio >= 0.5 &&
    lines.length >= 2
  ) {
    flags.push("character usually speaks in full sentences; new lines are fragments");
  }

  // Profanity drift.
  if (
    normalized.cadence.profanityRatio === 0 &&
    fresh.profanityRatio > 0 &&
    normalized.vocabFingerprint.totalWords >= 40
  ) {
    flags.push("character has never sworn before — new line introduces profanity");
  }

  // Contractions drift.
  if (
    normalized.cadence.contractionRatio <= 0.02 &&
    fresh.contractionRatio >= 0.1 &&
    normalized.vocabFingerprint.totalWords >= 40
  ) {
    flags.push("character rarely contracts — new lines contract heavily");
  } else if (
    normalized.cadence.contractionRatio >= 0.1 &&
    fresh.contractionRatio === 0 &&
    lines.some((line) => tokenizeWords(line).length >= 6)
  ) {
    flags.push("character contracts naturally — new lines avoid contractions");
  }

  // Avoided-vocab drift.
  if (normalized.vocabFingerprint.avoidedWords.length) {
    const avoided = new Set(normalized.vocabFingerprint.avoidedWords.map((w) => w.toLowerCase()));
    const freshTokens = new Set(lines.flatMap((line) => tokenizeWords(line)));
    const violations = [...avoided].filter((word) => freshTokens.has(word));
    if (violations.length) {
      flags.push(`uses avoided words: ${violations.slice(0, 4).join(", ")}`);
    }
  }

  // Signature-phrase absence is only a soft signal across long stretches.
  if (
    normalized.vocabFingerprint.signaturePhrases.length >= 3 &&
    lines.length >= 4 &&
    freshFingerprint.signaturePhrases.length === 0
  ) {
    const text = lines.join(" ").toLowerCase();
    const matched = normalized.vocabFingerprint.signaturePhrases.some((phrase) =>
      text.includes(phrase.toLowerCase()),
    );
    if (!matched) {
      flags.push("none of the character's signature phrases appear across these lines");
    }
  }

  const score = Math.min(1, flags.length * 0.25);
  return { score, flags, compared: true };
}

export {
  extractCharacterVoiceCards,
  normalizeCharacterVoiceCard,
  normalizeCharacterVoiceCardCollection,
  mergeCharacterVoiceCard,
  buildCharacterVoicePromptBlock,
  buildCharacterVoiceAddendum,
  scoreCharacterVoiceDrift,
};
