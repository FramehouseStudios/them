// Creative-companion memory store (T08 + T08-postgres).
//
// A per-user record capturing the four pillars of longitudinal
// learning: style, characters, tone, habits. The shape mirrors
// the schema in docs/T08-prompt-centralization-and-memory-tier.md.
//
// Persistence is the canonical T07 adapter (Postgres when DATABASE_URL
// is set, JSON-file-backed otherwise). The store is keyed by userId in
// the `creative_memory` domain — one row per user. The previous file-
// backed MVP (single JSON document at backend/creative_memory_store.json
// containing all users) is superseded by this layout; legacy data can
// be migrated by reading the old file and writing each entry to the
// adapter once at startup if needed.
//
// Concurrency: writes serialize per-user via an in-process mutex chain.
// Cross-process safety comes from the adapter's underlying store
// (Postgres in production; single-process discipline in JSON mode).

import { createPersistence } from "./persistence_adapter.js";
import { mergeTraits as mergeCharacterTraits } from "./trait_library.js";

const SCHEMA_VERSION = 1;
const LEXICAL_FINGERPRINT_MAX = 64;
const CHARACTERS_MAX = 32;
const EPISODIC_MEMORIES_MAX = 64;
const EPISODIC_MEMORY_PROMPT_MAX = 6;
const DOMAIN = "creative_memory";
const EPISODIC_MEMORY_STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "are",
  "because",
  "before",
  "between",
  "character",
  "characters",
  "could",
  "feature",
  "for",
  "from",
  "have",
  "help",
  "into",
  "just",
  "like",
  "movie",
  "need",
  "next",
  "page",
  "pages",
  "scene",
  "screenplay",
  "script",
  "should",
  "story",
  "the",
  "that",
  "their",
  "there",
  "they",
  "this",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "with",
  "write",
]);
const EPISODIC_CHARACTER_NAME_BLOCKLIST = new Set([
  "A",
  "An",
  "And",
  "Act",
  "The",
  "This",
  "That",
  "She",
  "He",
  "They",
  "We",
  "You",
  "My",
  "Our",
]);
const STORY_MEMORY_KEYWORDS = /\b(?:act\s*(?:i|ii|iii|1|2|3|one|two|three)|all[- ]is[- ]lost|antagonist|arc|beat|beats|character|climax|continue|ending|ending image|feature|film|final image|finale|first act|inciting incident|logline|midpoint|motif|movie|payoff|premise|protagonist|rewrite|scene|screenplay|script|sequence|setup|theme|third act|tone|voice|want|wound)\b/i;
const EXPLICIT_MEMORY_KEYWORDS = /\b(?:remember|keep in mind|do not forget|don't forget|note that|important|actually,\s*no|correction|for this movie|for this film|for this screenplay|in this movie|in this film|in this script|in my movie|in my film|in my screenplay|in my script)\b/i;
const CORRECTION_KEYWORDS = /\b(?:actually,\s*no|correction|scratch that|not that|instead|retcon|change it to|make it so)\b/i;

function nowMs() {
  return Date.now();
}

function makeEmptyMemory(userId) {
  return {
    userId: String(userId || ""),
    version: SCHEMA_VERSION,
    updatedAt: nowMs(),
    style: {
      lexicalFingerprint: [],
    },
    characters: [],
    episodicMemories: [],
    tone: {},
    habits: {},
  };
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function cleanText(value, maxChars = 800) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(maxChars || 800)))
    .trim();
}

function titleCaseName(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .map((part) => {
      const clean = part.trim();
      if (!clean) return "";
      if (/^[A-Z0-9 .'-]+$/.test(clean) && clean.length > 1) return clean;
      return clean.charAt(0).toUpperCase() + clean.slice(1);
    })
    .filter(Boolean)
    .join(" ");
}

function normalizeCharacterName(value) {
  const clean = titleCaseName(
    String(value ?? "")
      .replace(/[^A-Za-z0-9 .'-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 48)
  );
  if (!clean || EPISODIC_CHARACTER_NAME_BLOCKLIST.has(clean)) return "";
  if (clean.length < 2) return "";
  return clean;
}

function normalizeStringList(items, maxItems = 8, maxChars = 80) {
  const source = Array.isArray(items)
    ? items
    : cleanText(items, maxItems * maxChars)
      ? String(items).split(/\r?\n|;|,/)
      : [];
  const out = [];
  const seen = new Set();
  for (const item of source) {
    const clean = cleanText(item, maxChars);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= maxItems) break;
  }
  return out;
}

function tokenizeMemoryText(value) {
  const tokens = String(value || "")
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9'-]{1,}/g) || [];
  return tokens.filter((token) => token.length > 2 && !EPISODIC_MEMORY_STOPWORDS.has(token));
}

function stableHash(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function extractDeclaredCharacterNames(text = "") {
  const source = String(text || "");
  if (!source.trim()) return [];
  const patterns = [
    /\b(?:my|the|our)\s+(?:protagonist|lead|main character|hero|heroine|detective|writer|lawyer|mother|father|sister|brother|villain|antagonist)\s+(?:is\s+)?(?:named|called)?\s*([A-Za-z][A-Za-z'-]{1,32})\b/gi,
    /\b(?:character|protagonist|lead|hero|heroine)\s+(?:named|called)\s+([A-Za-z][A-Za-z'-]{1,32})\b/gi,
    /\b([A-Z][A-Za-z'-]{2,32})\s+is\s+(?:a|an|the)\s+(?:protagonist|lead|detective|writer|lawyer|courier|public defender|mother|father|sister|brother)\b/g,
  ];
  const out = [];
  const seen = new Set();
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const name = normalizeCharacterName(match[1]);
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      out.push(name);
      if (out.length >= 8) return out;
    }
  }
  return out;
}

function firstScreenplaySceneHeading(text = "") {
  const match = String(text || "").match(/(?:^|\n)\s*((?:INT\.|EXT\.|INT\/EXT\.|INT\.\/EXT\.)[^\n]{3,120})/i);
  return cleanText(match?.[1] || "", 140);
}

function firstMemoryMoment(text = "") {
  const lines = String(text || "")
    .split(/\r?\n|[.!?]\s+/)
    .map((line) => cleanText(line, 220))
    .filter((line) => {
      if (!line) return false;
      if (/^(INT\.|EXT\.|CUT TO|FADE|TITLE|END)$/i.test(line)) return false;
      return tokenizeMemoryText(line).length >= 4;
    });
  return lines[0] || "";
}

function sanitizeEpisodicMemoryItem(item = {}) {
  if (!item || typeof item !== "object") return null;
  const characterNames = normalizeStringList(item.characterNames ?? item.characters, 8, 48)
    .map(normalizeCharacterName)
    .filter(Boolean);
  const tags = normalizeStringList(item.tags, 8, 48)
    .map((tag) => tag.toLowerCase())
    .filter(Boolean);
  const summary = cleanText(item.summary, 280);
  const text = cleanText(item.text ?? item.excerpt, 900);
  const projectId = cleanText(item.projectId ?? item.project_id, 96);
  const projectTitle = cleanText(item.projectTitle ?? item.project_title, 160);
  if (!summary && !text && !characterNames.length && !projectTitle) return null;
  const createdAt = Math.max(0, Number(item.createdAt ?? item.created_at ?? nowMs()));
  const updatedAt = Math.max(createdAt, Number(item.updatedAt ?? item.updated_at ?? createdAt));
  const id = cleanText(
    item.id || `episode_${stableHash([projectId, projectTitle, summary, text, characterNames.join("|")].join("|"))}`,
    80
  );
  return {
    id,
    summary: summary || firstMemoryMoment(text) || (characterNames.length ? `Story memory for ${characterNames.join(", ")}` : "Story memory"),
    excerpt: cleanText(item.excerpt || text, 420),
    text,
    characterNames,
    tags,
    projectId,
    projectTitle,
    source: cleanText(item.source, 64),
    createdAt,
    updatedAt,
    lastReferencedAt: Math.max(0, Number(item.lastReferencedAt ?? item.last_referenced_at ?? updatedAt)),
    referenceCount: Math.max(0, Number(item.referenceCount ?? item.reference_count ?? 0)),
  };
}

function scoreEpisodicMemoryForQuery(memory, query = "", {
  projectId = "",
  projectTitle = "",
} = {}) {
  const cleanQuery = cleanText(query, 2_000).toLowerCase();
  const cleanProjectId = cleanText(projectId, 96).toLowerCase();
  const cleanProjectTitle = cleanText(projectTitle, 160).toLowerCase();
  const queryTokens = new Set(tokenizeMemoryText(cleanQuery));
  const searchable = [
    memory.summary,
    memory.excerpt,
    memory.text,
    memory.projectTitle,
    ...(memory.characterNames || []),
    ...(memory.tags || []),
  ].join(" ").toLowerCase();
  if (!queryTokens.size) {
    let score = Math.min(4, Number(memory.referenceCount || 0)) +
      Math.min(3, Math.floor(Number(memory.updatedAt || 0) / 86_400_000_000));
    if (cleanProjectId && cleanText(memory.projectId, 96).toLowerCase() === cleanProjectId) score += 8;
    if (cleanProjectTitle && cleanText(memory.projectTitle, 160).toLowerCase() === cleanProjectTitle) score += 5;
    return score;
  }
  let score = 0;
  for (const token of queryTokens) {
    if (searchable.includes(token)) score += 1;
  }
  for (const name of memory.characterNames || []) {
    const cleanName = String(name || "").toLowerCase();
    if (cleanName && cleanQuery.includes(cleanName)) score += 6;
  }
  for (const tag of memory.tags || []) {
    const cleanTag = String(tag || "").toLowerCase();
    if (cleanTag && cleanQuery.includes(cleanTag)) score += 2;
  }
  if (memory.projectTitle && cleanQuery.includes(String(memory.projectTitle).toLowerCase())) score += 4;
  if (cleanProjectId && cleanText(memory.projectId, 96).toLowerCase() === cleanProjectId) score += 8;
  if (cleanProjectTitle && cleanText(memory.projectTitle, 160).toLowerCase() === cleanProjectTitle) score += 5;
  return score;
}

function selectEpisodicMemoriesForPrompt(items = [], {
  query = "",
  projectId = "",
  projectTitle = "",
  maxItems = EPISODIC_MEMORY_PROMPT_MAX,
} = {}) {
  const sanitized = (Array.isArray(items) ? items : [])
    .map(sanitizeEpisodicMemoryItem)
    .filter(Boolean);
  if (!sanitized.length) return [];
  const cleanQuery = cleanText(query, 2_000);
  return sanitized
    .map((item) => ({
      item,
      score: scoreEpisodicMemoryForQuery(item, cleanQuery, { projectId, projectTitle }),
    }))
    .filter((entry) => !cleanQuery || entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Number(b.item.updatedAt || 0) - Number(a.item.updatedAt || 0);
    })
    .slice(0, Math.max(1, Number(maxItems || EPISODIC_MEMORY_PROMPT_MAX)))
    .map(({ item }) => {
      const out = clone(item);
      delete out.text;
      return out;
    });
}

function isStoryMemoryCandidate({
  transcript = "",
  reply = "",
  projectId = "",
  projectTitle = "",
  sceneHeading = "",
  characterNames = [],
  source = "",
  moment = "",
} = {}) {
  if (characterNames.length || sceneHeading) return true;
  const cleanTranscript = cleanText(transcript, 2_000);
  const cleanReply = cleanText(reply, 2_000);
  const combined = `${cleanTranscript} ${cleanReply}`.trim();
  if (!combined || !moment) return false;
  const hasProjectIdentity = Boolean(cleanText(projectId, 96) || cleanText(projectTitle, 160));
  const sourceLooksLikeScreenplay = /\bscreenplay|page|studio|script\b/i.test(String(source || ""));
  if (hasProjectIdentity && tokenizeMemoryText(combined).length >= 6) return true;
  if (sourceLooksLikeScreenplay && tokenizeMemoryText(combined).length >= 8) return true;
  return EXPLICIT_MEMORY_KEYWORDS.test(combined) || STORY_MEMORY_KEYWORDS.test(combined);
}

function buildEpisodicTags({ transcript = "", source = "", projectId = "", projectTitle = "" } = {}) {
  const tags = ["screenplay"];
  const text = String(transcript || "");
  if (cleanText(projectId, 96) || cleanText(projectTitle, 160)) tags.push("project");
  if (EXPLICIT_MEMORY_KEYWORDS.test(text)) tags.push("user-note");
  if (CORRECTION_KEYWORDS.test(text)) tags.push("correction");
  if (/\boutput|page|studio\b/i.test(String(source || ""))) tags.push("generated-pages");
  return [...new Set(tags)];
}

function buildEpisodicSummary({
  characterNames = [],
  sceneHeading = "",
  moment = "",
  projectTitle = "",
  transcript = "",
} = {}) {
  const cleanCharacters = normalizeStringList(characterNames, 8, 48)
    .map(normalizeCharacterName)
    .filter(Boolean);
  const cleanProjectTitle = cleanText(projectTitle, 120);
  const cleanSceneHeading = cleanText(sceneHeading, 140);
  const cleanMoment = cleanText(moment || firstMemoryMoment(transcript), 180);
  const subject = cleanCharacters.length
    ? `Story memory for ${cleanCharacters.join(", ")}`
    : cleanProjectTitle
      ? `Project memory for ${cleanProjectTitle}`
      : "Story memory";
  return cleanText(
    [
      subject,
      cleanSceneHeading,
      cleanMoment,
    ].filter(Boolean).join(": "),
    280
  );
}

function createCreativeMemoryStore({ persistence } = {}) {
  const store = persistence || createPersistence();
  const writeChain = new Map(); // userId -> Promise

  function withUserLock(userId, fn) {
    const prev = writeChain.get(userId) || Promise.resolve();
    const next = prev.then(() => fn());
    writeChain.set(userId, next.catch(() => {}));
    return next;
  }

  async function readUser(userId) {
    if (!userId) return null;
    const raw = await store.get({ domain: DOMAIN, key: userId });
    if (!raw) return null;
    if (raw.version !== SCHEMA_VERSION) {
      // Future migrations live here. Refuse stale shapes for now.
      return null;
    }
    return clone(raw);
  }

  async function writeUser(userId, value) {
    await store.put({ domain: DOMAIN, key: userId, value });
  }

  async function updateUser(userId, mutator) {
    if (!userId) return;
    await withUserLock(userId, async () => {
      const current = (await readUser(userId)) || makeEmptyMemory(userId);
      const next = mutator(clone(current)) || current;
      next.userId = userId;
      next.version = SCHEMA_VERSION;
      next.updatedAt = nowMs();
      await writeUser(userId, next);
    });
  }

  // ---------- public reads ----------

  async function getCreativeMemoryForPrompt({
    userId,
    query = "",
    projectId = "",
    projectTitle = "",
    maxEpisodicMemories = EPISODIC_MEMORY_PROMPT_MAX,
  } = {}) {
    const rec = await readUser(userId);
    if (!rec) return null;
    const out = {
      userId: rec.userId,
      version: rec.version,
      updatedAt: rec.updatedAt,
    };
    if (rec.style && Object.keys(rec.style).length) {
      const style = clone(rec.style);
      if (Array.isArray(style.lexicalFingerprint) && style.lexicalFingerprint.length === 0) {
        delete style.lexicalFingerprint;
      }
      if (Object.keys(style).length) out.style = style;
    }
    if (Array.isArray(rec.characters) && rec.characters.length) out.characters = clone(rec.characters);
    const episodicMemories = selectEpisodicMemoriesForPrompt(rec.episodicMemories, {
      query,
      projectId,
      projectTitle,
      maxItems: maxEpisodicMemories,
    });
    if (episodicMemories.length) out.episodicMemories = episodicMemories;
    if (rec.tone && Object.keys(rec.tone).length) out.tone = clone(rec.tone);
    if (rec.habits && Object.keys(rec.habits).length) out.habits = clone(rec.habits);
    return out;
  }

  async function hasMemoryForUser(userId) {
    return (await readUser(userId)) !== null;
  }

  // ---------- write triggers ----------

  // T30: optional `source` and `metadata` thread through so callers can
  // distinguish reply-side rendered mentions (e.g. `ios_screenplay_render`)
  // from user-input mentions. Schema stays backward-compatible: existing
  // callers pass nothing for these fields and the character record adds
  // them only when supplied. Returns a small action receipt so route
  // handlers can build a typed response without a second read; legacy
  // callers can ignore the return value.
  // T30: optional `source` and `metadata` thread through.
  // T-trait-library: optional `traits` delta merges into character.traits
  // (canonical merge via trait_library.mergeTraits). All three fields are
  // additive — existing callers pass nothing and nothing changes.
  async function recordCharacterMention({
    userId,
    characterName,
    voice = "",
    tags = [],
    source = "",
    metadata = null,
    traits = null,
  }) {
    if (!userId || !characterName || typeof characterName !== "string") {
      return { ok: false, action: "skipped", reason: "missing_userId_or_name" };
    }
    const name = characterName.trim();
    if (!name) {
      return { ok: false, action: "skipped", reason: "empty_name" };
    }
    const cleanSource = typeof source === "string" ? source.trim() : "";
    const cleanMetadata = metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? metadata
      : null;
    const cleanTraits = traits && typeof traits === "object" && !Array.isArray(traits)
      ? traits
      : null;
    let resolvedAction = "recorded";
    await updateUser(userId, (rec) => {
      const characters = Array.isArray(rec.characters) ? rec.characters : [];
      const existingIdx = characters.findIndex((c) => c.name === name);
      const now = nowMs();
      if (existingIdx >= 0) {
        resolvedAction = "updated";
        characters[existingIdx].last_referenced = now;
        if (voice) characters[existingIdx].voice = voice;
        if (Array.isArray(tags) && tags.length) {
          const set = new Set([...(characters[existingIdx].tags || []), ...tags]);
          characters[existingIdx].tags = [...set];
        }
        if (cleanSource) characters[existingIdx].source = cleanSource;
        if (cleanMetadata) {
          characters[existingIdx].metadata = {
            ...(characters[existingIdx].metadata || {}),
            ...cleanMetadata,
          };
        }
        if (cleanTraits) {
          characters[existingIdx].traits = mergeCharacterTraits(
            characters[existingIdx].traits,
            cleanTraits,
          );
        }
      } else {
        const entry = {
          name,
          voice: voice || "",
          first_seen: now,
          last_referenced: now,
          tags: Array.isArray(tags) ? [...new Set(tags)] : [],
        };
        if (cleanSource) entry.source = cleanSource;
        if (cleanMetadata) entry.metadata = { ...cleanMetadata };
        if (cleanTraits) entry.traits = mergeCharacterTraits(null, cleanTraits);
        characters.push(entry);
      }
      characters.sort((a, b) => (b.last_referenced || 0) - (a.last_referenced || 0));
      rec.characters = characters.slice(0, CHARACTERS_MAX);
      return rec;
    });
    return { ok: true, action: resolvedAction, characterName: name, source: cleanSource };
  }

  async function recordEpisodicMemory({
    userId,
    summary = "",
    text = "",
    characterNames = [],
    tags = [],
    projectId = "",
    projectTitle = "",
    source = "",
  } = {}) {
    if (!userId) return { ok: false, action: "skipped", reason: "missing_userId" };
    const item = sanitizeEpisodicMemoryItem({
      summary,
      text,
      characterNames,
      tags,
      projectId,
      projectTitle,
      source,
      createdAt: nowMs(),
      updatedAt: nowMs(),
      lastReferencedAt: nowMs(),
      referenceCount: 1,
    });
    if (!item) return { ok: false, action: "skipped", reason: "empty_memory" };
    let action = "recorded";
    await updateUser(userId, (rec) => {
      const memories = Array.isArray(rec.episodicMemories)
        ? rec.episodicMemories.map(sanitizeEpisodicMemoryItem).filter(Boolean)
        : [];
      const itemCharacters = new Set((item.characterNames || []).map((name) => name.toLowerCase()));
      const duplicateIdx = memories.findIndex((memory) => {
        if (memory.id === item.id) return true;
        if (memory.summary.toLowerCase() === item.summary.toLowerCase()) return true;
        if (!itemCharacters.size) return false;
        const memoryCharacters = new Set((memory.characterNames || []).map((name) => name.toLowerCase()));
        const overlap = [...itemCharacters].some((name) => memoryCharacters.has(name));
        if (!overlap) return false;
        const projectMatches = item.projectId && memory.projectId
          ? item.projectId === memory.projectId
          : item.projectTitle && memory.projectTitle
            ? item.projectTitle.toLowerCase() === memory.projectTitle.toLowerCase()
            : true;
        return projectMatches && memory.summary.toLowerCase().includes(item.summary.toLowerCase().slice(0, 80));
      });
      if (duplicateIdx >= 0) {
        action = "updated";
        const existing = memories[duplicateIdx];
        const mergedCharacters = normalizeStringList(
          [...(existing.characterNames || []), ...(item.characterNames || [])],
          8,
          48
        ).map(normalizeCharacterName).filter(Boolean);
        const mergedTags = normalizeStringList(
          [...(existing.tags || []), ...(item.tags || [])],
          8,
          48
        ).map((tag) => tag.toLowerCase());
        memories[duplicateIdx] = {
          ...existing,
          summary: item.summary || existing.summary,
          excerpt: item.excerpt || existing.excerpt,
          text: item.text || existing.text,
          characterNames: mergedCharacters,
          tags: mergedTags,
          projectId: item.projectId || existing.projectId,
          projectTitle: item.projectTitle || existing.projectTitle,
          source: item.source || existing.source,
          updatedAt: nowMs(),
          lastReferencedAt: nowMs(),
          referenceCount: Math.max(0, Number(existing.referenceCount || 0)) + 1,
        };
      } else {
        memories.push(item);
      }
      memories.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
      rec.episodicMemories = memories.slice(0, EPISODIC_MEMORIES_MAX);
      return rec;
    });
    return { ok: true, action, memoryId: item.id };
  }

  // T-trait-library: reader for one or all character trait records.
  async function getCharacterTraits({ userId, characterName = null } = {}) {
    if (!userId) return null;
    const rec = await readUser(userId);
    if (!rec || !Array.isArray(rec.characters)) return null;
    if (characterName && typeof characterName === "string") {
      const name = characterName.trim();
      if (!name) return null;
      const found = rec.characters.find((c) => c.name === name);
      if (!found) return null;
      return { name: found.name, traits: found.traits || null };
    }
    return rec.characters.map((c) => ({ name: c.name, traits: c.traits || null }));
  }

  async function recordSceneCompletion({ userId, scenePageCount }) {
    if (!userId || typeof scenePageCount !== "number" || !Number.isFinite(scenePageCount)) return;
    await updateUser(userId, (rec) => {
      rec.habits = rec.habits || {};
      const prev = Number(rec.habits.preferred_scene_length_pages);
      const prevCount = Number(rec.habits._scene_completion_count) || 0;
      const nextCount = prevCount + 1;
      const nextAvg = Number.isFinite(prev) && prev > 0
        ? (prev * prevCount + scenePageCount) / nextCount
        : scenePageCount;
      rec.habits.preferred_scene_length_pages = Math.round(nextAvg * 100) / 100;
      rec.habits._scene_completion_count = nextCount;
      const completed = Number(rec.habits._scenes_completed) || 0;
      rec.habits._scenes_completed = completed + 1;
      const attempted = Math.max(rec.habits._scenes_completed, Number(rec.habits._scenes_attempted) || rec.habits._scenes_completed);
      rec.habits._scenes_attempted = attempted;
      rec.habits.page_completion_rate = Math.round(
        (rec.habits._scenes_completed / Math.max(1, attempted)) * 100,
      ) / 100;
      // T-block-detector: completing a scene clears the recent-short-turn
      // streak (the writer is no longer stuck) and stamps the activity
      // timestamps the block_detector reads.
      rec.habits.last_scene_completion_at = nowMs();
      rec.habits.last_scene_attempt_at = rec.habits.last_scene_completion_at;
      rec.habits.recent_short_turns = 0;
      return rec;
    });
  }

  async function recordSceneAttempt({ userId }) {
    if (!userId) return;
    await updateUser(userId, (rec) => {
      rec.habits = rec.habits || {};
      const attempted = Number(rec.habits._scenes_attempted) || 0;
      rec.habits._scenes_attempted = attempted + 1;
      const completed = Number(rec.habits._scenes_completed) || 0;
      rec.habits.page_completion_rate = Math.round(
        (completed / Math.max(1, rec.habits._scenes_attempted)) * 100,
      ) / 100;
      // T-block-detector: stamp the attempt time so block_detector can
      // measure dry spells. Completion stamps both fields; attempt-only
      // stamps just `last_scene_attempt_at`.
      rec.habits.last_scene_attempt_at = nowMs();
      return rec;
    });
  }

  // T-block-detector: record a /talk turn's contribution to the block
  // signal. Updates `last_talk_turn_at` and maintains a small rolling
  // counter `recent_short_turns` (transcripts under SHORT_TURN_LEN_CHARS).
  // Capped at SHORT_TURN_WINDOW so the counter doesn't grow unbounded.
  // Long turns decay the counter toward zero so the user's recovery is
  // observable in the next signal computation.
  async function recordTalkTurnForBlockSignal({ userId, transcript = "", nowAtMs = nowMs() } = {}) {
    if (!userId) return;
    const len = typeof transcript === "string" ? transcript.trim().length : 0;
    const SHORT_TURN_LEN_CHARS = 40;
    const SHORT_TURN_WINDOW = 8;
    const isShort = len > 0 && len < SHORT_TURN_LEN_CHARS;
    const isLong = len >= SHORT_TURN_LEN_CHARS;
    await updateUser(userId, (rec) => {
      rec.habits = rec.habits || {};
      rec.habits.last_talk_turn_at = Number(nowAtMs) || nowMs();
      const prev = Number(rec.habits.recent_short_turns) || 0;
      if (isShort) {
        rec.habits.recent_short_turns = Math.min(prev + 1, SHORT_TURN_WINDOW);
      } else if (isLong) {
        // Long turn → fade the short-turn signal one step toward zero.
        rec.habits.recent_short_turns = Math.max(prev - 1, 0);
      }
      return rec;
    });
  }

  // T-block-signal-history-tracking: append a sample of the computed
  // block signal to habits.block_signal_history (ring buffer, cap 30).
  // Debounced: skip if a sample with the same level was recorded
  // within the last 60 seconds, so a busy GET /memory/block-signal
  // poll loop doesn't flood the buffer with redundant entries.
  async function recordBlockSignalSample({ userId, score, level, atMs = nowMs() } = {}) {
    if (!userId) return { skipped: true, reason: "no userId" };
    // Resolve atMs:
    //   - explicit number (including 0) → honored verbatim
    //   - null / undefined / "" / non-numeric string → nowMs() fallback
    //   - non-finite number (NaN / Infinity) → nowMs() fallback
    //
    // Naive `Number(atMs) || nowMs()` had the falsy-zero bug (PR #120
    // side finding). Naive `Number.isFinite(Number(atMs))` silently
    // coerced `null` and `""` to 0 (because Number(null)=0,
    // Number("")=0) — Codex review on #124 flagged this.
    // The explicit null/blank check below distinguishes them.
    let n;
    if (atMs === null || atMs === undefined || atMs === "") {
      n = nowMs();
    } else if (typeof atMs === "number") {
      n = Number.isFinite(atMs) ? atMs : nowMs();
    } else {
      // String / other coercible. Reject NaN explicitly.
      const candidate = Number(atMs);
      n = Number.isFinite(candidate) ? candidate : nowMs();
    }
    const cleanLevel = typeof level === "string" && level.trim() ? level.trim() : "low";
    const cleanScore = Number.isFinite(score) ? Math.round(Number(score) * 1000) / 1000 : 0;
    const BLOCK_SIGNAL_HISTORY_MAX = 30;
    const BLOCK_SIGNAL_DEBOUNCE_MS = 60_000;
    let recorded = false;
    await updateUser(userId, (rec) => {
      rec.habits = rec.habits || {};
      const history = Array.isArray(rec.habits.block_signal_history)
        ? rec.habits.block_signal_history
        : [];
      const last = history.length ? history[history.length - 1] : null;
      if (last
        && last.level === cleanLevel
        && Number.isFinite(last.at)
        && n - last.at < BLOCK_SIGNAL_DEBOUNCE_MS
      ) {
        return rec;
      }
      history.push({ score: cleanScore, level: cleanLevel, at: n });
      if (history.length > BLOCK_SIGNAL_HISTORY_MAX) {
        history.splice(0, history.length - BLOCK_SIGNAL_HISTORY_MAX);
      }
      rec.habits.block_signal_history = history;
      recorded = true;
      return rec;
    });
    return { skipped: !recorded };
  }

  async function recordToneSignal({ userId, signal }) {
    if (!userId || !signal || typeof signal !== "object") return;
    await updateUser(userId, (rec) => {
      rec.tone = rec.tone || {};
      if (typeof signal.emotional_default === "string" && signal.emotional_default.trim()) {
        rec.tone.emotional_default = signal.emotional_default.trim();
      }
      if (typeof signal.humor_register === "string" && signal.humor_register.trim()) {
        rec.tone.humor_register = signal.humor_register.trim();
      }
      if (typeof signal.violence_tolerance === "string" && signal.violence_tolerance.trim()) {
        rec.tone.violence_tolerance = signal.violence_tolerance.trim();
      }
      if (typeof signal.preferredTone === "string" && signal.preferredTone.trim()) {
        rec.style = rec.style || {};
        rec.style.preferredTone = signal.preferredTone.trim();
      }
      return rec;
    });
  }

  async function recordSessionEnd({ userId, sessionDurationMs, sessionStartedAt }) {
    if (!userId) return;
    await updateUser(userId, (rec) => {
      rec.habits = rec.habits || {};
      if (Number.isFinite(sessionStartedAt)) {
        const hour = new Date(sessionStartedAt).getHours();
        let bucket = "burst";
        if (hour >= 5 && hour < 11) bucket = "morning";
        else if (hour >= 11 && hour < 17) bucket = "afternoon";
        else if (hour >= 17 && hour < 22) bucket = "evening";
        else bucket = "late-night";
        rec.habits.session_pattern = bucket;
      }
      if (Number.isFinite(sessionDurationMs) && sessionDurationMs > 0) {
        rec.habits._last_session_duration_ms = Math.round(sessionDurationMs);
      }
      return rec;
    });
  }

  async function recordLexicalFingerprint({ userId, phrases }) {
    if (!userId || !Array.isArray(phrases) || phrases.length === 0) return;
    await updateUser(userId, (rec) => {
      rec.style = rec.style || {};
      const existing = Array.isArray(rec.style.lexicalFingerprint) ? rec.style.lexicalFingerprint : [];
      const seen = new Set(existing.map((p) => String(p).toLowerCase()));
      for (const raw of phrases) {
        const phrase = String(raw || "").trim();
        if (!phrase) continue;
        const key = phrase.toLowerCase();
        if (seen.has(key)) continue;
        existing.push(phrase);
        seen.add(key);
      }
      rec.style.lexicalFingerprint = existing.slice(-LEXICAL_FINGERPRINT_MAX);
      return rec;
    });
  }

  // Test seam — clear all entries in this domain.
  async function _clearAll() {
    if (typeof store.clear === "function") {
      await store.clear({ domain: DOMAIN });
    }
  }

  // T08w-triggers: extract signals from a /talk turn and fire the
  // appropriate write triggers. Pure-ish: deterministic given inputs;
  // only side effect is the writes through the existing trigger
  // functions above. Safe to call when userId is null (becomes a no-op).
  async function recordTriggersFromTalkTurn({
    userId,
    transcript = "",
    reply = "",
    sessionStartedAt = null,
    sessionDurationMs = null,
    projectId = "",
    projectTitle = "",
    source = "talk_turn",
  } = {}) {
    if (!userId) return { skipped: true, reason: "no userId" };
    const cleanProjectId = cleanText(projectId, 96);
    const cleanProjectTitle = cleanText(projectTitle, 160);
    const cleanSource = cleanText(source || "talk_turn", 64) || "talk_turn";
    const summary = {
      characterMentions: 0,
      episodicMemories: 0,
      lexicalPhrases: 0,
      sessionRecorded: false,
    };

    const combined = `${String(transcript || "")}\n${String(reply || "")}`;
    const turnCharacterNames = [];
    const rememberCharacterName = async (rawName) => {
      const name = normalizeCharacterName(rawName);
      if (!name) return false;
      const key = name.toUpperCase();
      if (turnCharacterNames.map((item) => item.toUpperCase()).includes(key)) return false;
      if (turnCharacterNames.length >= 8) return false;
      turnCharacterNames.push(name);
      try {
        await recordCharacterMention({ userId, characterName: name, source: "talk_turn" });
        summary.characterMentions += 1;
      } catch (_e) { /* never block the response on memory writes */ }
      return true;
    };

    for (const declaredName of extractDeclaredCharacterNames(transcript)) {
      if (turnCharacterNames.length >= 8) break;
      await rememberCharacterName(declaredName);
    }

    // Character mentions: screenplay character cue lines are CAPITALIZED
    // names on their own line, optionally followed by a parenthetical.
    // Allow letters, digits ("GUARD 2"), spaces, periods, apostrophes,
    // and hyphens. Bounded — we cap at 8 unique names per turn.
    // Use [ \t]* (horizontal whitespace) rather than \s* — \s would
    // greedily consume trailing newlines and skip the next cue line.
    const cueRegex = /(?:^|\n)[ \t]*([A-Z][A-Z0-9 .'-]{1,34}[A-Z0-9])(?:[ \t]*\([^)]+\))?[ \t]*\n/g;
    const seen = new Set();
    let match;
    let limit = 8;
    while (limit > 0 && (match = cueRegex.exec(combined)) !== null) {
      const raw = String(match[1] || "").trim();
      if (!raw || raw.length < 2) continue;
      // Skip screenplay scene headings (INT./EXT. + LOCATION) and common
      // transition words. Prefix match catches "INT. KITCHEN - NIGHT".
      if (/^(INT\.|EXT\.|INT\/EXT|INT|EXT|FADE|CUT TO|CUT|END|TITLE|MONTAGE|FLASHBACK|SUPER|SMASH CUT|MATCH CUT|DISSOLVE)/.test(raw)) continue;
      // Skip lines that look like scene actions (multiple spaces after a hyphen).
      if (raw.includes(" - ") && raw.split(" ").length > 4) continue;
      const key = raw.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      await rememberCharacterName(raw);
      limit -= 1;
    }

    const sceneHeading = firstScreenplaySceneHeading(combined);
    const moment = firstMemoryMoment(transcript) || firstMemoryMoment(reply);
    if (isStoryMemoryCandidate({
      transcript,
      reply,
      projectId: cleanProjectId,
      projectTitle: cleanProjectTitle,
      sceneHeading,
      characterNames: turnCharacterNames,
      source: cleanSource,
      moment,
    })) {
      const memorySummary = buildEpisodicSummary({
        characterNames: turnCharacterNames,
        sceneHeading,
        moment,
        projectTitle: cleanProjectTitle,
        transcript,
      });
      try {
        const receipt = await recordEpisodicMemory({
          userId,
          summary: memorySummary,
          text: combined,
          characterNames: turnCharacterNames,
          tags: buildEpisodicTags({
            transcript,
            source: cleanSource,
            projectId: cleanProjectId,
            projectTitle: cleanProjectTitle,
          }),
          projectId: cleanProjectId,
          projectTitle: cleanProjectTitle,
          source: cleanSource,
        });
        if (receipt?.ok) summary.episodicMemories += 1;
      } catch (_e) { /* never block the response on memory writes */ }
    }

    // Lexical fingerprint: capture short evocative phrases from the
    // user's transcript (4-10 words, ending at sentence boundary).
    // Bounded — top 4 sentences from this turn.
    if (transcript && typeof transcript === "string") {
      const sentences = transcript
        .split(/[.!?]\s+/)
        .map((s) => s.trim())
        .filter((s) => {
          const wc = s.split(/\s+/).filter(Boolean).length;
          return wc >= 4 && wc <= 12;
        })
        .slice(0, 4);
      if (sentences.length) {
        try {
          await recordLexicalFingerprint({ userId, phrases: sentences });
          summary.lexicalPhrases = sentences.length;
        } catch (_e) { /* */ }
      }
    }

    // Session pattern: derive from the session start time when supplied.
    if (Number.isFinite(sessionStartedAt)) {
      try {
        await recordSessionEnd({ userId, sessionStartedAt, sessionDurationMs });
        summary.sessionRecorded = true;
      } catch (_e) { /* */ }
    }

    // T-block-detector: stamp last_talk_turn_at and maintain the short-
    // turn counter. Single write; never blocks the response.
    try {
      await recordTalkTurnForBlockSignal({ userId, transcript });
      summary.blockSignalUpdated = true;
    } catch (_e) { /* */ }

    return summary;
  }

  // T-block-detector: expose the raw habits object so the route layer
  // can compute a block signal without re-reading the full record.
  async function getHabitsForUser(userId) {
    const rec = await readUser(userId);
    if (!rec || !rec.habits || typeof rec.habits !== "object") return null;
    return clone(rec.habits);
  }

  return {
    SCHEMA_VERSION,
    DOMAIN,
    getCreativeMemoryForPrompt,
    getCharacterTraits,
    getHabitsForUser,
    hasMemoryForUser,
    recordEpisodicMemory,
    recordCharacterMention,
    recordSceneCompletion,
    recordSceneAttempt,
    recordToneSignal,
    recordSessionEnd,
    recordLexicalFingerprint,
    recordTalkTurnForBlockSignal,
    recordBlockSignalSample,
    recordTriggersFromTalkTurn,
    _clearAll,
  };
}

export {
  createCreativeMemoryStore,
  SCHEMA_VERSION as CREATIVE_MEMORY_SCHEMA_VERSION,
};
