// Structured memory tools for Clementine Muse runtime (D008 build order #4).
//
// Thin adapters over existing creative_memory / user_memory stores via DI.
// Do NOT rewrite creative_memory_store.js — call into it when injected.
//
// Tool schemas are OpenAI / Muse Responses–compatible. Names are stable and
// defer_loading-friendly so rare memory ops stay out of the cache-stable
// persona+voice-spec prefix (see cache_policy.js). Standard Muse only;
// never Contributor.

const MEMORY_TOOL_NAMES = Object.freeze({
  WRITE: "memory_write",
  READ: "memory_read",
  SEARCH: "memory_search",
});

const MEMORY_KINDS = Object.freeze({
  SEMANTIC_PROFILE: "semantic_profile",
  EPISODIC_NOTE: "episodic_note",
});

function trimToString(v) {
  return v === null || v === undefined ? "" : String(v).trim();
}

function clampText(v, max = 2_000) {
  const s = trimToString(v);
  if (!s) return "";
  return s.length <= max ? s : s.slice(0, max);
}

function normalizeKind(raw) {
  const k = trimToString(raw).toLowerCase().replace(/-/g, "_");
  if (k === "semantic" || k === "profile" || k === MEMORY_KINDS.SEMANTIC_PROFILE) {
    return MEMORY_KINDS.SEMANTIC_PROFILE;
  }
  if (k === "episodic" || k === "note" || k === "episode" || k === MEMORY_KINDS.EPISODIC_NOTE) {
    return MEMORY_KINDS.EPISODIC_NOTE;
  }
  return "";
}

/**
 * Muse / OpenAI function-tool schema. Flat `name` + `parameters` shape used by
 * Responses API; `defer_loading: true` keeps these off the always-on prefix.
 */
function buildMemoryToolSchemas({ deferLoading = true } = {}) {
  const defer = deferLoading === true;
  return [
    {
      type: "function",
      name: MEMORY_TOOL_NAMES.WRITE,
      description:
        "Write a structured memory: semantic_profile (durable taste/habits) or episodic_note (one scene/session fact). Prefer short summaries.",
      defer_loading: defer,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: {
            type: "string",
            enum: [MEMORY_KINDS.SEMANTIC_PROFILE, MEMORY_KINDS.EPISODIC_NOTE],
            description: "semantic_profile = durable profile; episodic_note = one recallable note",
          },
          summary: {
            type: "string",
            description: "Short memory text (preferred for episodic_note)",
          },
          text: {
            type: "string",
            description: "Optional longer body; truncated server-side",
          },
          profile_patch: {
            type: "object",
            description: "Small semantic profile fields (preferredTone, habits note, etc.)",
            additionalProperties: false,
            properties: {
              preferredTone: { type: "string" },
              habitsNote: { type: "string" },
              lexicalPhrases: {
                type: "array",
                items: { type: "string" },
                maxItems: 8,
              },
            },
          },
          tags: {
            type: "array",
            items: { type: "string" },
            maxItems: 8,
          },
          character_names: {
            type: "array",
            items: { type: "string" },
            maxItems: 8,
          },
          project_id: { type: "string" },
        },
        required: ["kind"],
      },
    },
    {
      type: "function",
      name: MEMORY_TOOL_NAMES.READ,
      description:
        "Read structured memory for the current user. Optional kind filter; returns a compact slice for prompt injection.",
      defer_loading: defer,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: {
            type: "string",
            enum: [MEMORY_KINDS.SEMANTIC_PROFILE, MEMORY_KINDS.EPISODIC_NOTE, "all"],
            description: "Which tier to read; default all",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 12,
            description: "Max episodic notes to return",
          },
        },
      },
    },
    {
      type: "function",
      name: MEMORY_TOOL_NAMES.SEARCH,
      description:
        "Keyword search over episodic notes (and profile text when present). Stub-safe: keyword match when embeddings are unavailable.",
      defer_loading: defer,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: {
            type: "string",
            description: "Search query",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 12,
          },
        },
        required: ["query"],
      },
    },
  ];
}

function keywordScore(haystack, query) {
  const h = trimToString(haystack).toLowerCase();
  const q = trimToString(query).toLowerCase();
  if (!h || !q) return 0;
  if (h.includes(q)) return 10 + Math.min(q.length, 40);
  const tokens = q.split(/\s+/).filter((t) => t.length > 2);
  if (!tokens.length) return 0;
  let hits = 0;
  for (const t of tokens) {
    if (h.includes(t)) hits += 1;
  }
  return hits === 0 ? 0 : hits * 2;
}

function createMemoryTools({
  creativeMemoryStore = null,
  /** Optional in-memory / Map-backed scratch for tests when stores are absent. */
  scratch = null,
  now = () => Date.now(),
} = {}) {
  const local = scratch || {
    episodic: /** @type {Map<string, object[]>} */ (new Map()),
    profiles: /** @type {Map<string, object>} */ (new Map()),
  };

  function episodicBucket(userId) {
    const id = trimToString(userId) || "_anon";
    if (!local.episodic.has(id)) local.episodic.set(id, []);
    return local.episodic.get(id);
  }

  async function memoryWrite(args = {}, ctx = {}) {
    const userId = trimToString(ctx.userId || args.userId);
    const kind = normalizeKind(args.kind);
    if (!kind) {
      return { ok: false, error: "invalid_kind", code: "memory_write_invalid" };
    }
    if (!userId) {
      return { ok: false, error: "missing_userId", code: "memory_write_invalid" };
    }

    if (kind === MEMORY_KINDS.EPISODIC_NOTE) {
      const summary = clampText(args.summary || args.text, 400);
      const text = clampText(args.text || args.summary, 2_000);
      if (!summary && !text) {
        return { ok: false, error: "empty_memory", code: "memory_write_invalid" };
      }
      const tags = Array.isArray(args.tags) ? args.tags.map(trimToString).filter(Boolean).slice(0, 8) : [];
      const characterNames = Array.isArray(args.character_names)
        ? args.character_names.map(trimToString).filter(Boolean).slice(0, 8)
        : [];

      if (creativeMemoryStore && typeof creativeMemoryStore.recordEpisodicMemory === "function") {
        const receipt = await creativeMemoryStore.recordEpisodicMemory({
          userId,
          summary: summary || text.slice(0, 200),
          text,
          tags,
          characterNames,
          projectId: trimToString(args.project_id),
          source: "clementine_memory_write",
        });
        return {
          ok: Boolean(receipt?.ok !== false),
          kind,
          action: receipt?.action || "recorded",
          memoryId: receipt?.memoryId || receipt?.id || null,
          via: "creative_memory_store",
        };
      }

      const note = {
        id: `ep_${now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        summary: summary || text.slice(0, 200),
        text,
        tags,
        characterNames,
        projectId: trimToString(args.project_id),
        createdAt: now(),
      };
      const bucket = episodicBucket(userId);
      bucket.unshift(note);
      if (bucket.length > 64) bucket.length = 64;
      return { ok: true, kind, action: "recorded", memoryId: note.id, via: "scratch" };
    }

    // semantic_profile
    const patch = args.profile_patch && typeof args.profile_patch === "object"
      ? args.profile_patch
      : {};
    const preferredTone = trimToString(patch.preferredTone || args.preferredTone);
    const habitsNote = clampText(patch.habitsNote || args.summary || args.text, 400);
    const lexicalPhrases = Array.isArray(patch.lexicalPhrases)
      ? patch.lexicalPhrases.map(trimToString).filter(Boolean).slice(0, 8)
      : [];

    if (creativeMemoryStore) {
      const results = [];
      if (preferredTone && typeof creativeMemoryStore.recordToneSignal === "function") {
        results.push(
          await creativeMemoryStore.recordToneSignal({
            userId,
            signal: { preferredTone },
          })
        );
      }
      if (lexicalPhrases.length && typeof creativeMemoryStore.recordLexicalFingerprint === "function") {
        results.push(
          await creativeMemoryStore.recordLexicalFingerprint({
            userId,
            phrases: lexicalPhrases,
          })
        );
      }
      // habitsNote has no dedicated store mutator without rewriting the store;
      // keep it in scratch / return payload for a later structured call.
      if (habitsNote) {
        const prev = local.profiles.get(userId) || {};
        local.profiles.set(userId, {
          ...prev,
          habitsNote,
          preferredTone: preferredTone || prev.preferredTone || "",
          updatedAt: now(),
        });
      }
      if (results.length || habitsNote || preferredTone || lexicalPhrases.length) {
        return {
          ok: true,
          kind,
          action: "patched",
          via: results.length ? "creative_memory_store" : "scratch",
          applied: {
            preferredTone: Boolean(preferredTone),
            lexicalPhrases: lexicalPhrases.length,
            habitsNote: Boolean(habitsNote),
          },
        };
      }
      return { ok: false, error: "empty_profile_patch", code: "memory_write_invalid" };
    }

    const prev = local.profiles.get(userId) || {};
    local.profiles.set(userId, {
      ...prev,
      preferredTone: preferredTone || prev.preferredTone || "",
      habitsNote: habitsNote || prev.habitsNote || "",
      lexicalPhrases: lexicalPhrases.length
        ? [...new Set([...(prev.lexicalPhrases || []), ...lexicalPhrases])].slice(-32)
        : prev.lexicalPhrases || [],
      updatedAt: now(),
    });
    return { ok: true, kind, action: "patched", via: "scratch" };
  }

  async function memoryRead(args = {}, ctx = {}) {
    const userId = trimToString(ctx.userId || args.userId);
    if (!userId) {
      return { ok: false, error: "missing_userId", code: "memory_read_invalid" };
    }
    const kindRaw = trimToString(args.kind || "all").toLowerCase();
    const limit = Math.min(12, Math.max(1, Math.round(Number(args.limit) || 6)));
    const out = { ok: true, kind: kindRaw || "all", semantic_profile: null, episodic: [] };

    const wantProfile = kindRaw === "all" || normalizeKind(kindRaw) === MEMORY_KINDS.SEMANTIC_PROFILE;
    const wantEpisodic = kindRaw === "all" || normalizeKind(kindRaw) === MEMORY_KINDS.EPISODIC_NOTE;

    if (wantProfile) {
      let profile = local.profiles.get(userId) || null;
      if (creativeMemoryStore && typeof creativeMemoryStore.getCreativeMemoryForPrompt === "function") {
        try {
          const mem = await creativeMemoryStore.getCreativeMemoryForPrompt({ userId });
          if (mem && typeof mem === "object") {
            profile = {
              preferredTone: mem.style?.preferredTone || profile?.preferredTone || "",
              lexicalPhrases: Array.isArray(mem.style?.lexicalFingerprint)
                ? mem.style.lexicalFingerprint.slice(0, 16)
                : profile?.lexicalPhrases || [],
              habitsNote: profile?.habitsNote || "",
              tone: mem.tone || null,
              via: "creative_memory_store",
            };
          }
        } catch (_e) {
          /* fall through to scratch */
        }
      }
      out.semantic_profile = profile;
    }

    if (wantEpisodic) {
      if (creativeMemoryStore && typeof creativeMemoryStore.getCreativeMemoryForPrompt === "function") {
        try {
          const mem = await creativeMemoryStore.getCreativeMemoryForPrompt({ userId });
          const list = Array.isArray(mem?.episodicMemories) ? mem.episodicMemories : [];
          out.episodic = list.slice(0, limit).map((m) => ({
            id: m.id || null,
            summary: m.summary || "",
            tags: m.tags || [],
            characterNames: m.characterNames || [],
          }));
          out.via = "creative_memory_store";
        } catch (_e) {
          out.episodic = episodicBucket(userId).slice(0, limit);
          out.via = "scratch";
        }
      } else {
        out.episodic = episodicBucket(userId).slice(0, limit);
        out.via = "scratch";
      }
    }

    return out;
  }

  async function memorySearch(args = {}, ctx = {}) {
    const userId = trimToString(ctx.userId || args.userId);
    const query = clampText(args.query, 200);
    if (!userId) {
      return { ok: false, error: "missing_userId", code: "memory_search_invalid" };
    }
    if (!query) {
      return { ok: false, error: "missing_query", code: "memory_search_invalid" };
    }
    const limit = Math.min(12, Math.max(1, Math.round(Number(args.limit) || 6)));

    /** @type {object[]} */
    let candidates = [];
    let via = "scratch";

    if (creativeMemoryStore && typeof creativeMemoryStore.getCreativeMemoryForPrompt === "function") {
      try {
        const mem = await creativeMemoryStore.getCreativeMemoryForPrompt({ userId });
        candidates = Array.isArray(mem?.episodicMemories) ? mem.episodicMemories : [];
        via = "creative_memory_store";
      } catch (_e) {
        candidates = episodicBucket(userId);
      }
    } else {
      candidates = episodicBucket(userId);
    }

    const scored = candidates
      .map((m) => {
        const hay = [m.summary, m.text, m.excerpt, ...(m.tags || []), ...(m.characterNames || [])]
          .filter(Boolean)
          .join(" ");
        return { memory: m, score: keywordScore(hay, query) };
      })
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ memory, score }) => ({
        id: memory.id || null,
        summary: memory.summary || "",
        score,
        tags: memory.tags || [],
      }));

    return {
      ok: true,
      query,
      strategy: "keyword_stub",
      via,
      results: scored,
    };
  }

  const handlers = Object.freeze({
    [MEMORY_TOOL_NAMES.WRITE]: memoryWrite,
    [MEMORY_TOOL_NAMES.READ]: memoryRead,
    [MEMORY_TOOL_NAMES.SEARCH]: memorySearch,
  });

  async function dispatch(toolName, args = {}, ctx = {}) {
    const name = trimToString(toolName);
    const fn = handlers[name];
    if (!fn) {
      return { ok: false, error: "unknown_tool", code: "memory_tool_unknown", tool: name };
    }
    return fn(args, ctx);
  }

  return {
    schemas: buildMemoryToolSchemas(),
    names: MEMORY_TOOL_NAMES,
    handlers,
    dispatch,
    memoryWrite,
    memoryRead,
    memorySearch,
  };
}

export {
  MEMORY_TOOL_NAMES,
  MEMORY_KINDS,
  buildMemoryToolSchemas,
  createMemoryTools,
};
