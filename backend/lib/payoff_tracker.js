// T-payoff-tracker — Craft Intelligence Suite, Layer 2.
//
// Detects "setup → payoff" pairs in screenplay text and flags
// unpaid setups (lines that hint at but never deliver on a future
// beat). Pure deterministic. No LLM, no I/O.
//
// V1 approach: the analyzer scans for noun-phrases mentioned in a
// distinctive way early in the screenplay — e.g. unusual objects
// ("the locket"), named-but-unintroduced characters ("Marcus said
// you'd be here"), and verbs of foreshadowing ("promised", "swore",
// "warned"). For each candidate setup, the analyzer searches the
// rest of the screenplay for a matching payoff (the same noun
// appearing in an action context, or the same character entering
// scene).
//
// Public surface (pure):
//
//   trackPayoffs({ text, frameworkId? }) -> {
//     schemaVersion,
//     setups: [
//       {
//         id, kind, sourceLine, sourceIndex,
//         text, status: "paid" | "unpaid" | "weak",
//         payoffIndex?, payoffLine?,
//         confidence,           // 0..1 on the setup detection itself
//       }
//     ],
//     summary
//   }
//
// "kind" buckets:
//   - "named-object"   — capitalized noun phrase that becomes plot-relevant later
//   - "named-character"— a character mentioned in dialogue before appearing
//   - "promise"        — explicit foreshadow verbs ("promised", "swore", "warned")
//   - "threat"         — threats / vows ("kill him", "burn it down")

const SCHEMA_VERSION = 1;

const FORESHADOW_VERBS = new Set([
  "promised", "promise", "swore", "swear", "warned", "warn",
  "vowed", "vow", "threatened", "threaten", "predicted", "predict",
]);

const THREAT_VERBS = new Set([
  "kill", "burn", "destroy", "ruin", "expose", "leak", "break",
  "shatter", "leave", "stop", "stop them", "end",
]);

const COMMON_WORDS = new Set([
  "the", "a", "an", "and", "but", "or", "so", "for", "to", "in",
  "on", "at", "by", "from", "with", "is", "are", "was", "were",
  "be", "been", "being", "have", "has", "had", "do", "does", "did",
  "this", "that", "these", "those", "i", "you", "he", "she", "we",
  "they", "it", "me", "him", "her", "us", "them", "my", "your",
  "his", "our", "their", "its", "if", "then", "as", "all", "any",
  "no", "yes", "ok",
]);

function splitLines(text) {
  if (typeof text !== "string") return [];
  return text.replace(/\r\n?/g, "\n").split("\n");
}

function isSceneHeading(line) {
  return typeof line === "string" && /^(INT\.|EXT\.|INT\/EXT|EST\.)\s/i.test(line.trim());
}

function isCharacterCue(line) {
  if (typeof line !== "string") return false;
  const trimmed = line.trim();
  if (!trimmed || isSceneHeading(trimmed)) return false;
  if (trimmed !== trimmed.toUpperCase()) return false;
  return /^[A-Z][A-Z0-9 .'\-()@]{1,38}[A-Z0-9)]$/.test(trimmed);
}

function characterNameOnly(line) {
  return String(line || "").trim().replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function tokenize(text) {
  return String(text || "")
    .replace(/[^A-Za-z' ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function extractNamedObjects(text) {
  // Capitalized two-word noun phrases that are NOT scene headings, NOT
  // character cues. Bounded simple regex; deduped by lowercase.
  const out = new Map();
  if (typeof text !== "string") return out;
  const regex = /\b(?:the|a|an)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const phrase = m[1];
    const key = phrase.toLowerCase();
    if (!out.has(key)) out.set(key, phrase);
  }
  return out;
}

function tokensIndexBy(lines) {
  // For each token, record the line indexes where it appears.
  const index = new Map();
  for (let i = 0; i < lines.length; i += 1) {
    const tokens = tokenize(lines[i]).map((t) => t.toLowerCase());
    for (const t of new Set(tokens)) {
      if (COMMON_WORDS.has(t)) continue;
      let bucket = index.get(t);
      if (!bucket) { bucket = []; index.set(t, bucket); }
      bucket.push(i);
    }
  }
  return index;
}

function characterCueAppearances(lines) {
  const out = new Map(); // name → first cue line index
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!isCharacterCue(line)) continue;
    const name = characterNameOnly(line);
    if (!out.has(name)) out.set(name, i);
  }
  return out;
}

function findPayoffForObject(lowerPhrase, sourceIdx, tokenIndex) {
  const lastWord = lowerPhrase.split(" ").pop();
  if (!lastWord) return null;
  const occurrences = tokenIndex.get(lastWord) || [];
  // Payoff = same token appears at a later index, in a substantive line.
  for (const idx of occurrences) {
    if (idx > sourceIdx) return idx;
  }
  return null;
}

function findCharacterFirstCue(name, sourceIdx, cueIndex) {
  if (!cueIndex.has(name)) return null;
  const idx = cueIndex.get(name);
  return idx > sourceIdx ? idx : null;
}

function trackPayoffs({ text = "", frameworkId = null } = {}) {
  const lines = splitLines(text);
  const tokenIdx = tokensIndexBy(lines);
  const cueIdx = characterCueAppearances(lines);
  const setups = [];
  let nextId = 1;

  // Track named-objects we've already turned into a setup so that
  // the second / third / nth mention of the same object doesn't
  // become a new "unpaid" setup. The first mention IS the setup;
  // every subsequent mention is its payoff.
  // (Codex review on #92.)
  const seenNamedObjects = new Set();

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = String(line || "").trim();
    if (!trimmed || isSceneHeading(trimmed) || isCharacterCue(trimmed)) continue;

    // --- named-object setups ---
    const objects = extractNamedObjects(trimmed);
    for (const [lower, original] of objects.entries()) {
      if (seenNamedObjects.has(lower)) continue; // not a new setup; this is a payoff or later recurrence
      seenNamedObjects.add(lower);
      const payoffIdx = findPayoffForObject(lower, i, tokenIdx);
      setups.push({
        id: `s${nextId++}`,
        kind: "named-object",
        sourceIndex: i,
        sourceLine: trimmed,
        text: original,
        status: payoffIdx === null ? "unpaid" : "paid",
        payoffIndex: payoffIdx,
        payoffLine: payoffIdx === null ? null : (lines[payoffIdx] || "").trim(),
        confidence: 0.5,
      });
    }

    // --- named-character setups (capitalized name in dialogue/action
    // that doesn't yet have a cue) ---
    const nameMatches = trimmed.match(/\b[A-Z][a-z]{2,}\b/g) || [];
    const uniqueNames = [...new Set(nameMatches)];
    for (const name of uniqueNames) {
      const upper = name.toUpperCase();
      if (!cueIdx.has(upper)) continue;
      if (cueIdx.get(upper) <= i) continue; // already cued at or before this point
      setups.push({
        id: `s${nextId++}`,
        kind: "named-character",
        sourceIndex: i,
        sourceLine: trimmed,
        text: name,
        status: "paid",
        payoffIndex: cueIdx.get(upper),
        payoffLine: (lines[cueIdx.get(upper)] || "").trim(),
        confidence: 0.7,
      });
    }

    // --- promise / foreshadow setups ---
    const tokens = tokenize(trimmed);
    for (let t = 0; t < tokens.length; t += 1) {
      const word = tokens[t].toLowerCase();
      if (FORESHADOW_VERBS.has(word)) {
        setups.push({
          id: `s${nextId++}`,
          kind: "promise",
          sourceIndex: i,
          sourceLine: trimmed,
          text: tokens.slice(t, Math.min(t + 8, tokens.length)).join(" "),
          status: "weak", // V1 can't reliably detect promise payoffs; flag for the writer's eye
          payoffIndex: null,
          payoffLine: null,
          confidence: 0.4,
        });
        break;
      }
      if (THREAT_VERBS.has(word)) {
        setups.push({
          id: `s${nextId++}`,
          kind: "threat",
          sourceIndex: i,
          sourceLine: trimmed,
          text: tokens.slice(Math.max(0, t - 1), Math.min(t + 6, tokens.length)).join(" "),
          status: "weak",
          payoffIndex: null,
          payoffLine: null,
          confidence: 0.3,
        });
        break;
      }
    }
  }

  // Dedup: same kind + lowercase text + same line keeps the first.
  const seen = new Set();
  const deduped = [];
  for (const s of setups) {
    const key = `${s.kind}:${String(s.text).toLowerCase()}:${s.sourceIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(s);
  }

  const paid = deduped.filter((s) => s.status === "paid").length;
  const unpaid = deduped.filter((s) => s.status === "unpaid").length;
  const weak = deduped.filter((s) => s.status === "weak").length;
  const total = deduped.length;

  let summary;
  if (total === 0) {
    summary = "No notable setups detected.";
  } else if (unpaid === 0 && weak === 0) {
    summary = `${total} setup(s); every detectable setup pays off.`;
  } else {
    summary = `${total} setup(s); ${unpaid} unpaid object setup(s), ${weak} weak / promise-style setup(s) the writer should verify by hand.`;
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    setups: deduped,
    counts: { paid, unpaid, weak, total },
    frameworkId: typeof frameworkId === "string" ? frameworkId : null,
    summary,
  };
}

export {
  trackPayoffs,
  FORESHADOW_VERBS,
  THREAT_VERBS,
  SCHEMA_VERSION as PAYOFF_TRACKER_SCHEMA_VERSION,
};
