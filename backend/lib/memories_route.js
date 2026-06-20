// T-decompose-phase6-memories — extract the 6 /memories/* routes
// from backend/index.js.
//
// Phase 6 of the decomposition (spec:
// docs/specs/T-decompose-backend-index.md, design note #228).
// Phase 5b (#238/#264/#273/#288) is now complete; Phase 6 is
// the next decomp arc per the spec.
//
// V1 pillar: memory
// V1 effect: closes V1 line 53 + 54 prerequisite work by moving
// the /memories/* cluster into its own testable lib. The memory
// surface is the V1 memory pillar's iOS-facing contract; iOS
// decoders depend on the envelopes documented in
// docs/schemas/memories-list.md, memories-mutate.md,
// memories-export.md (all already on main).
//
// Routes extracted (6 total):
//
//   GET  /memories            — list view + delta-no-change
//                               short-circuit + If-None-Match etag.
//                               Performs background theme backfill.
//   GET  /memories/export     — full-dump envelope (memory_cards,
//                               history_threads, tasks, themes,
//                               assembled into export_json string).
//   POST /memories/update     — mutate a memory card.
//   POST /memories/forget     — delete a memory card.
//   POST /memories/promote    — promote a card to a theme.
//   POST /memories/feedback   — record human feedback on a theme.
//
// Behavior is byte-identical with the previous inline handlers:
//   - same response envelopes (matching memories-*.md schema docs)
//   - same 200/400/304 status routing
//   - same Cache-Control: no-store + applyReadStateHeaders cycle
//   - same per-route logger.log diagnostic lines
//   - same body limits (256kb) for POSTs
//   - same backfill side-effect on GET /memories
//   - same persist-before-respond order on mutations
//
// Access-control posture: PER-USER. Memory record resolved via
// `selectMemoryRecordForRead` (read) or
// `resolveWritableMemoryContext` (write) only after trusted auth
// identity resolves. Caller-supplied X-User-Id is never trusted for
// ownership.
//
// Per the #238 invariant inheritance: this lib does NOT mutate
// any module-level state. The shared per-IP persistence call
// (`setPersistedUserMemoryForIp` on the GET /memories backfill
// path) is preserved as the byte-identical side-effect from the
// inline handler — it's a write to an existing accessor, not a
// new setter.

import express from "express";
import { defaultResolveMemoryUserId, memoryAuthRequired } from "./memory_route_auth.js";

const MEMORIES_MUTATION_BODY_LIMIT = "256kb";

function mountMemoriesRoutes(app, deps = {}) {
  if (!app || typeof app.get !== "function" || typeof app.post !== "function") {
    throw new Error("mountMemoriesRoutes requires an Express app");
  }
  const {
    // ---------- request helpers ----------
    parseQueryLimit,
    createRequestId,
    normalizeSnippet,
    clampUnit,
    resolveUserId = defaultResolveMemoryUserId,
    // ---------- memory context resolution ----------
    selectMemoryRecordForRead,
    resolveWritableMemoryContext,
    sanitizePersistedSessionMemory,
    persistWritableMemoryContext,
    setPersistedUserMemoryForIp,
    normalizeClientToken,
    // ---------- read-state pipeline ----------
    buildReadStateMeta,
    applyReadStateHeaders,
    ifNoneMatchStateHit,
    // ---------- memory card / quality builders ----------
    buildConversationHistoryThreads,
    buildMemoryCards,
    buildMemoryQualitySnapshot,
    maybeBackfillThemesFromHistory,
    // ---------- export-specific helpers ----------
    buildTaskSnapshot,
    sanitizeActiveThemes,
    sanitizeRememberedPeople,
    formatLocalDateStamp,
    // ---------- identity / name normalizers ----------
    normalizeAssistantSelfName,
    getAssistantSelfNameForIp,
    normalizeUserPersonName,
    // ---------- card mutators ----------
    normalizeMemoryCardId,
    updateMemoryCardInMemory,
    forgetMemoryCardInMemory,
    promoteMemoryCardToThemeInMemory,
    resolveThemeKeyFromMemoryCard,
    normalizeMemoryQualitySignal,
    incrementThemeQualitySignal,
    creativeMemoryStore = null,
    logger = console,
    // ---------- constants ----------
    TASKS_MAX_STORED,
    USER_MEMORY_REMEMBERED_PEOPLE_MAX,
  } = deps;

  // Required-fn deps guard — any missing dep fails LOUDLY at mount
  // time, not on the first request. Matches the 5b precedent.
  const requiredFns = {
    parseQueryLimit, createRequestId, normalizeSnippet, clampUnit,
    selectMemoryRecordForRead, resolveWritableMemoryContext,
    sanitizePersistedSessionMemory, persistWritableMemoryContext,
    setPersistedUserMemoryForIp, normalizeClientToken,
    buildReadStateMeta, applyReadStateHeaders, ifNoneMatchStateHit,
    buildConversationHistoryThreads, buildMemoryCards,
    buildMemoryQualitySnapshot, maybeBackfillThemesFromHistory,
    buildTaskSnapshot, sanitizeActiveThemes, sanitizeRememberedPeople,
    formatLocalDateStamp,
    normalizeAssistantSelfName, getAssistantSelfNameForIp,
    normalizeUserPersonName,
    normalizeMemoryCardId, updateMemoryCardInMemory,
    forgetMemoryCardInMemory, promoteMemoryCardToThemeInMemory,
    resolveThemeKeyFromMemoryCard, normalizeMemoryQualitySignal,
    incrementThemeQualitySignal,
  };
  for (const [key, fn] of Object.entries(requiredFns)) {
    if (typeof fn !== "function") {
      throw new Error(`mountMemoriesRoutes: ${key} is required`);
    }
  }
  if (typeof TASKS_MAX_STORED !== "number") {
    throw new Error("mountMemoriesRoutes: TASKS_MAX_STORED must be a number");
  }
  if (typeof USER_MEMORY_REMEMBERED_PEOPLE_MAX !== "number") {
    throw new Error("mountMemoriesRoutes: USER_MEMORY_REMEMBERED_PEOPLE_MAX must be a number");
  }

  function requireMemoryUser(req, res, stage) {
    const userId = String(resolveUserId(req) || "").trim();
    if (userId) return userId;
    res.setHeader("Cache-Control", "no-store");
    res.status(401).json(memoryAuthRequired(stage));
    return "";
  }

  async function readCreativeMemoryForUser(userId, query = "memories character bible") {
    if (!userId || !creativeMemoryStore || typeof creativeMemoryStore.getCreativeMemoryForPrompt !== "function") {
      return null;
    }
    try {
      return await creativeMemoryStore.getCreativeMemoryForPrompt({ userId, query });
    } catch (error) {
      logger.log(`[memories_creative_read_failed] error=${error?.message || error}`);
      return null;
    }
  }

  function normalizeStringListPayload(value, maxItems = 8, maxChars = 220) {
    const items = Array.isArray(value)
      ? value
      : String(value || "")
        .split(/\r?\n/)
        .map((item) => item.trim());
    const out = [];
    const seen = new Set();
    for (const item of items) {
      const clean = normalizeSnippet(item, maxChars);
      if (!clean) continue;
      const key = clean.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(clean);
      if (out.length >= maxItems) break;
    }
    return out;
  }

  function normalizeArcPatch(value = {}) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const out = {};
    const fields = [
      ["act", source.act ?? source.currentAct ?? source.current_act, 80],
      ["want", source.want ?? source.consciousWant ?? source.conscious_want, 180],
      ["need", source.need ?? source.unconsciousNeed ?? source.unconscious_need, 180],
      ["wound", source.wound, 180],
      ["falseBelief", source.falseBelief ?? source.false_belief, 180],
      ["relationshipPressure", source.relationshipPressure ?? source.relationship_pressure, 180],
      ["currentTactic", source.currentTactic ?? source.current_tactic, 180],
      ["nextEmotionalTurn", source.nextEmotionalTurn ?? source.next_emotional_turn, 180],
    ];
    for (const [key, raw, maxChars] of fields) {
      const clean = normalizeSnippet(raw, maxChars);
      if (clean) out[key] = clean;
    }
    return out;
  }

  function normalizeCharacterBiblePatch(body = {}) {
    const source = body?.character_bible && typeof body.character_bible === "object"
      ? body.character_bible
      : (body?.characterBible && typeof body.characterBible === "object" ? body.characterBible : body);
    const character = normalizeSnippet(
      source?.character ?? source?.name ?? body?.character ?? body?.name,
      72,
    );
    const canon = normalizeStringListPayload(source?.canon ?? source?.facts, 8, 220);
    const corrections = normalizeStringListPayload(source?.corrections, 6, 260);
    const correctedTerms = normalizeStringListPayload(
      source?.corrected_terms ?? source?.correctedTerms,
      8,
      140,
    );
    const correctionReplacements = normalizeStringListPayload(
      source?.correction_replacements ?? source?.correctionReplacements,
      8,
      180,
    );
    const arc = normalizeArcPatch(source?.arc);
    const hasSignal = Boolean(
      canon.length ||
      corrections.length ||
      correctedTerms.length ||
      correctionReplacements.length ||
      Object.keys(arc).length
    );
    return {
      character,
      characterBible: hasSignal ? {
        canon,
        corrections,
        correctedTerms,
        correctionReplacements,
        arc,
      } : null,
    };
  }

  // ============== GET /memories ==============
  app.get("/memories", async (req, res) => {
    const userId = requireMemoryUser(req, res, "memories");
    if (!userId) return;
    const limit = parseQueryLimit(req.query?.limit, 24, 120);
    const sinceVersion = String(req.query?.sinceVersion || "").trim();
    const selected = selectMemoryRecordForRead(req, Date.now());
    const memory = sanitizePersistedSessionMemory(selected.memory);
    const creativeMemory = await readCreativeMemoryForUser(userId, "memories character bible");
    const historyThreads = buildConversationHistoryThreads(
      memory,
      Math.max(12, Math.min(limit * 2, 140)),
    );
    const backfillResult = maybeBackfillThemesFromHistory(
      memory,
      historyThreads,
      Date.now(),
      { trigger: "memories_read" },
    );
    if (backfillResult.applied && selected.ip && selected.ip !== "unknown") {
      setPersistedUserMemoryForIp(selected.ip, memory, Date.now(), {
        clientTokenAliases: [normalizeClientToken(req.get("X-Client-Token"))],
      });
      logger.log(
        `[memories_backfill] source=${selected.source} ip=${selected.ip} created=${backfillResult.created} keys=${(backfillResult.keys || []).join(",") || "none"}`,
      );
    }
    const readMeta = buildReadStateMeta(req, memory, selected.ip);
    const memories = buildMemoryCards(memory, historyThreads, limit, creativeMemory);
    const memoryQuality = buildMemoryQualitySnapshot(memory, memories, Date.now());

    res.setHeader("Cache-Control", "no-store");
    applyReadStateHeaders(res, readMeta);
    if (sinceVersion && sinceVersion === readMeta.stateVersion && !creativeMemory) {
      return res.status(200).json({
        source: selected.source,
        source_ip: selected.ip,
        assistant_name:
          normalizeAssistantSelfName(memory?.assistantSelfName) || getAssistantSelfNameForIp(selected.ip),
        user_name: normalizeUserPersonName(memory?.userPrimaryName),
        relationship_depth_score: Number(memory?.relationshipDepthScore || 0),
        behavior_mode: String(memory?.behaviorMode || "surface"),
        cycle_index: Math.max(0, Number(memory?.cycleIndex || 0)),
        season: Math.max(1, Number(memory?.season || 1)),
        season_progress: clampUnit(memory?.seasonProgress, 0),
        session_id: readMeta.sessionId,
        state_version: readMeta.stateVersion,
        last_updated_at: readMeta.lastUpdatedAt || null,
        history_updated_at: readMeta.historyUpdatedAt || null,
        memory_updated_at: readMeta.memoryUpdatedAt || null,
        last_turn_id: readMeta.lastTurnId || null,
        schema_version: readMeta.schemaVersion,
        backend_build: readMeta.backendBuild,
        backend_boot_id: readMeta.backendBootId,
        is_delta: true,
        delta_no_change: true,
        memory_quality: memoryQuality,
        memories: [],
        conversation_samples: [],
      });
    }
    if (ifNoneMatchStateHit(req, readMeta.etag, readMeta.stateVersion)) {
      return res.status(304).end();
    }
    return res.status(200).json({
      source: selected.source,
      source_ip: selected.ip,
      assistant_name:
        normalizeAssistantSelfName(memory?.assistantSelfName) || getAssistantSelfNameForIp(selected.ip),
      user_name: normalizeUserPersonName(memory?.userPrimaryName),
      relationship_depth_score: Number(memory?.relationshipDepthScore || 0),
      behavior_mode: String(memory?.behaviorMode || "surface"),
      cycle_index: Math.max(0, Number(memory?.cycleIndex || 0)),
      season: Math.max(1, Number(memory?.season || 1)),
      season_progress: clampUnit(memory?.seasonProgress, 0),
      session_id: readMeta.sessionId,
      state_version: readMeta.stateVersion,
      last_updated_at: readMeta.lastUpdatedAt || null,
      history_updated_at: readMeta.historyUpdatedAt || null,
      memory_updated_at: readMeta.memoryUpdatedAt || null,
      last_turn_id: readMeta.lastTurnId || null,
      schema_version: readMeta.schemaVersion,
      backend_build: readMeta.backendBuild,
      backend_boot_id: readMeta.backendBootId,
      is_delta: Boolean(sinceVersion),
      delta_no_change: false,
      memory_quality: memoryQuality,
      memories,
      conversation_samples: historyThreads.slice(0, Math.max(3, Math.min(12, limit))),
    });
  });

  // ============== POST /memories/character-bible/update ==============
  app.post("/memories/character-bible/update", express.json({ limit: MEMORIES_MUTATION_BODY_LIMIT }), async (req, res) => {
    const userId = requireMemoryUser(req, res, "memories_character_bible_update");
    if (!userId) return;
    const rid = req.requestId || createRequestId();
    if (!creativeMemoryStore || typeof creativeMemoryStore.recordCharacterMention !== "function") {
      res.setHeader("Cache-Control", "no-store");
      return res.status(503).json({
        ok: false,
        action: "character_bible_update",
        status: "creative_memory_unavailable",
        message: "Creative memory is not available.",
      });
    }
    const nowTs = Date.now();
    const { character, characterBible } = normalizeCharacterBiblePatch(req.body || {});
    if (!character || !characterBible) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(400).json({
        ok: false,
        action: "character_bible_update",
        status: "invalid_character_bible",
        message: "Character and at least one character bible field are required.",
      });
    }

    let receipt;
    try {
      receipt = await creativeMemoryStore.recordCharacterMention({
        userId,
        characterName: character,
        source: "memory_character_bible_edit",
        characterBible,
      });
    } catch (error) {
      logger.log(`[${rid}] memories_character_bible_update error=${error?.message || error}`);
      res.setHeader("Cache-Control", "no-store");
      return res.status(500).json({
        ok: false,
        action: "character_bible_update",
        status: "creative_memory_write_failed",
        message: "Character memory could not be updated.",
      });
    }

    const selected = selectMemoryRecordForRead(req, nowTs);
    const memory = sanitizePersistedSessionMemory(selected.memory);
    const readMeta = buildReadStateMeta(req, memory, selected.ip);
    const historyThreads = buildConversationHistoryThreads(memory, 160);
    const creativeMemory = await readCreativeMemoryForUser(userId, character);
    const cards = buildMemoryCards(memory, historyThreads, 160, creativeMemory);
    const normalizedTargetId = normalizeMemoryCardId(`character-${character}`);
    const updatedCard = cards.find((card) => (
      normalizeMemoryCardId(card.id) === normalizedTargetId ||
      String(card.key || "") === `character:${character}`
    )) || null;
    const memoryQuality = buildMemoryQualitySnapshot(memory, cards, nowTs);

    res.setHeader("Cache-Control", "no-store");
    applyReadStateHeaders(res, readMeta);
    logger.log(
      `[${rid}] memories_character_bible_update status=${receipt?.action || "updated"} character=${character}`,
    );
    return res.status(200).json({
      ok: true,
      action: "character_bible_update",
      status: String(receipt?.action || "updated"),
      message: null,
      memory_card: updatedCard,
      session_id: readMeta.sessionId,
      state_version: readMeta.stateVersion,
      last_turn_id: readMeta.lastTurnId || null,
      last_updated_at: readMeta.lastUpdatedAt || null,
      history_updated_at: readMeta.historyUpdatedAt || null,
      memory_updated_at: readMeta.memoryUpdatedAt || null,
      backend_boot_id: readMeta.backendBootId,
      memory_quality: memoryQuality,
      schema_version: readMeta.schemaVersion,
      backend_build: readMeta.backendBuild,
    });
  });

  // ============== GET /memories/export ==============
  app.get("/memories/export", (req, res) => {
    if (!requireMemoryUser(req, res, "memories_export")) return;
    const selected = selectMemoryRecordForRead(req, Date.now());
    const memory = sanitizePersistedSessionMemory(selected.memory);
    const readMeta = buildReadStateMeta(req, memory, selected.ip);
    const historyThreads = buildConversationHistoryThreads(memory, 280);
    const memoryCards = buildMemoryCards(memory, historyThreads, 180);
    const memoryQuality = buildMemoryQualitySnapshot(memory, memoryCards, Date.now());
    const tasks = buildTaskSnapshot(memory, {
      status: "all",
      limit: TASKS_MAX_STORED,
    });
    const themes = sanitizeActiveThemes(
      Array.isArray(memory.sessionThreads) && memory.sessionThreads.length
        ? memory.sessionThreads
        : memory.activeThemes,
      Number(memory.turns || 0),
    );
    const exportedAt = Date.now();
    const stamp = formatLocalDateStamp(exportedAt).replace(/-/g, "");
    const filename = `clementine_memory_export_${stamp}_${Math.max(0, Number(memory.turns || 0))}.json`;
    const exportPayload = {
      exported_at: exportedAt,
      source: selected.source,
      source_ip: selected.ip,
      session_id: readMeta.sessionId,
      state_version: readMeta.stateVersion,
      last_turn_id: readMeta.lastTurnId || null,
      assistant_name:
        normalizeAssistantSelfName(memory?.assistantSelfName) || getAssistantSelfNameForIp(selected.ip),
      user_name: normalizeUserPersonName(memory?.userPrimaryName),
      remembered_names: sanitizeRememberedPeople(
        memory?.rememberedPeople,
        USER_MEMORY_REMEMBERED_PEOPLE_MAX,
      ),
      behavior_mode: String(memory?.behaviorMode || "surface"),
      relationship_depth_score: Number(memory?.relationshipDepthScore || 0),
      memory_quality: memoryQuality,
      cycle_index: Math.max(0, Number(memory?.cycleIndex || 0)),
      season: Math.max(1, Number(memory?.season || 1)),
      season_progress: clampUnit(memory?.seasonProgress, 0),
      themes,
      memory_cards: memoryCards,
      tasks: tasks.tasks,
      history_threads: historyThreads,
    };

    res.setHeader("Cache-Control", "no-store");
    applyReadStateHeaders(res, readMeta);
    return res.status(200).json({
      source: selected.source,
      source_ip: selected.ip,
      session_id: readMeta.sessionId,
      state_version: readMeta.stateVersion,
      last_updated_at: readMeta.lastUpdatedAt || null,
      history_updated_at: readMeta.historyUpdatedAt || null,
      memory_updated_at: readMeta.memoryUpdatedAt || null,
      last_turn_id: readMeta.lastTurnId || null,
      schema_version: readMeta.schemaVersion,
      backend_build: readMeta.backendBuild,
      backend_boot_id: readMeta.backendBootId,
      memory_quality: memoryQuality,
      filename,
      exported_at: exportedAt,
      export_json: `${JSON.stringify(exportPayload, null, 2)}\n`,
    });
  });

  // ============== POST /memories/update ==============
  app.post("/memories/update", express.json({ limit: MEMORIES_MUTATION_BODY_LIMIT }), (req, res) => {
    if (!requireMemoryUser(req, res, "memories_update")) return;
    const rid = req.requestId || createRequestId();
    const nowTs = Date.now();
    const context = resolveWritableMemoryContext(req, nowTs);
    const memory = sanitizePersistedSessionMemory(context.memory);
    const cardId = normalizeMemoryCardId(req.body?.card_id ?? req.body?.id ?? "");
    const key = String(req.body?.key || "").trim();
    const title = normalizeSnippet(req.body?.title ?? "", 84);
    const summary = normalizeSnippet(req.body?.summary ?? "", 260);
    const reason = normalizeSnippet(req.body?.reason ?? "", 220);
    const mutation = updateMemoryCardInMemory(
      memory,
      { cardId, key, title, summary, reason },
      nowTs,
    );
    const persisted = persistWritableMemoryContext(context, memory, nowTs);
    const readMeta = buildReadStateMeta(req, persisted, context.requesterIp);
    const historyThreads = buildConversationHistoryThreads(persisted, 160);
    const cards = buildMemoryCards(persisted, historyThreads, 160);
    const memoryQuality = buildMemoryQualitySnapshot(persisted, cards, nowTs);
    const resolvedThemeKey = resolveThemeKeyFromMemoryCard(cardId, key);
    const updatedCard = cards.find((card) => (
      normalizeMemoryCardId(card.id) === normalizeMemoryCardId(mutation.cardId || cardId) ||
      (resolvedThemeKey && String(card.key || "").trim().toLowerCase() === resolvedThemeKey)
    )) || null;
    const statusCode = mutation.ok ? 200 : 400;

    res.setHeader("Cache-Control", "no-store");
    applyReadStateHeaders(res, readMeta);
    logger.log(
      `[${rid}] memories_update status=${mutation.status} card=${normalizeMemoryCardId(cardId) || "none"} key=${resolvedThemeKey || "none"}`,
    );

    return res.status(statusCode).json({
      ok: Boolean(mutation.ok),
      action: "update",
      status: String(mutation.status || (mutation.ok ? "updated" : "failed")),
      message: mutation.message || null,
      memory_card: updatedCard,
      session_id: readMeta.sessionId,
      state_version: readMeta.stateVersion,
      last_turn_id: readMeta.lastTurnId || null,
      last_updated_at: readMeta.lastUpdatedAt || null,
      history_updated_at: readMeta.historyUpdatedAt || null,
      memory_updated_at: readMeta.memoryUpdatedAt || null,
      backend_boot_id: readMeta.backendBootId,
      memory_quality: memoryQuality,
      schema_version: readMeta.schemaVersion,
      backend_build: readMeta.backendBuild,
    });
  });

  // ============== POST /memories/forget ==============
  app.post("/memories/forget", express.json({ limit: MEMORIES_MUTATION_BODY_LIMIT }), (req, res) => {
    if (!requireMemoryUser(req, res, "memories_forget")) return;
    const rid = req.requestId || createRequestId();
    const nowTs = Date.now();
    const context = resolveWritableMemoryContext(req, nowTs);
    const memory = sanitizePersistedSessionMemory(context.memory);
    const cardId = normalizeMemoryCardId(req.body?.card_id ?? req.body?.id ?? "");
    const key = String(req.body?.key || "").trim();
    const mutation = forgetMemoryCardInMemory(memory, { cardId, key }, nowTs);
    const persisted = persistWritableMemoryContext(context, memory, nowTs);
    const readMeta = buildReadStateMeta(req, persisted, context.requesterIp);
    const cards = buildMemoryCards(
      persisted,
      buildConversationHistoryThreads(persisted, 160),
      160,
    );
    const memoryQuality = buildMemoryQualitySnapshot(persisted, cards, nowTs);
    const statusCode = mutation.ok ? 200 : 400;

    res.setHeader("Cache-Control", "no-store");
    applyReadStateHeaders(res, readMeta);
    logger.log(
      `[${rid}] memories_forget status=${mutation.status} forgotten=${String(mutation.forgottenId || cardId || "none")}`,
    );

    return res.status(statusCode).json({
      ok: Boolean(mutation.ok),
      action: "forget",
      status: String(mutation.status || (mutation.ok ? "forgotten" : "failed")),
      message: mutation.message || null,
      forgotten_id: String(mutation.forgottenId || cardId || ""),
      theme_key: String(mutation.themeKey || ""),
      session_id: readMeta.sessionId,
      state_version: readMeta.stateVersion,
      last_turn_id: readMeta.lastTurnId || null,
      last_updated_at: readMeta.lastUpdatedAt || null,
      history_updated_at: readMeta.historyUpdatedAt || null,
      memory_updated_at: readMeta.memoryUpdatedAt || null,
      backend_boot_id: readMeta.backendBootId,
      memory_quality: memoryQuality,
      schema_version: readMeta.schemaVersion,
      backend_build: readMeta.backendBuild,
    });
  });

  // ============== POST /memories/promote ==============
  app.post("/memories/promote", express.json({ limit: MEMORIES_MUTATION_BODY_LIMIT }), (req, res) => {
    if (!requireMemoryUser(req, res, "memories_promote")) return;
    const rid = req.requestId || createRequestId();
    const nowTs = Date.now();
    const context = resolveWritableMemoryContext(req, nowTs);
    const memory = sanitizePersistedSessionMemory(context.memory);
    const cardId = normalizeMemoryCardId(req.body?.card_id ?? req.body?.id ?? "");
    const key = String(req.body?.key || "").trim();
    const title = normalizeSnippet(req.body?.title ?? "", 84);
    const summary = normalizeSnippet(req.body?.summary ?? "", 260);
    const reason = normalizeSnippet(req.body?.reason ?? "", 220);
    const mutation = promoteMemoryCardToThemeInMemory(
      memory,
      { cardId, key, title, summary, reason },
      nowTs,
    );
    const persisted = persistWritableMemoryContext(context, memory, nowTs);
    const readMeta = buildReadStateMeta(req, persisted, context.requesterIp);
    const historyThreads = buildConversationHistoryThreads(persisted, 160);
    const cards = buildMemoryCards(persisted, historyThreads, 160);
    const memoryQuality = buildMemoryQualitySnapshot(persisted, cards, nowTs);
    const resolvedThemeKey = resolveThemeKeyFromMemoryCard(mutation.cardId || "", mutation.themeKey || key);
    const updatedCard = cards.find((card) => (
      normalizeMemoryCardId(card.id) === normalizeMemoryCardId(mutation.cardId || "") ||
      (resolvedThemeKey && String(card.key || "").trim().toLowerCase() === resolvedThemeKey)
    )) || null;
    const statusCode = mutation.ok ? 200 : 400;

    res.setHeader("Cache-Control", "no-store");
    applyReadStateHeaders(res, readMeta);
    logger.log(
      `[${rid}] memories_promote status=${mutation.status} card=${cardId || "none"} key=${resolvedThemeKey || "none"} created=${mutation.created ? "1" : "0"}`,
    );

    return res.status(statusCode).json({
      ok: Boolean(mutation.ok),
      action: "promote",
      status: String(mutation.status || (mutation.ok ? "promoted" : "failed")),
      message: mutation.message || null,
      memory_card: updatedCard,
      theme_key: String(mutation.themeKey || resolvedThemeKey || ""),
      session_id: readMeta.sessionId,
      state_version: readMeta.stateVersion,
      last_turn_id: readMeta.lastTurnId || null,
      last_updated_at: readMeta.lastUpdatedAt || null,
      history_updated_at: readMeta.historyUpdatedAt || null,
      memory_updated_at: readMeta.memoryUpdatedAt || null,
      backend_boot_id: readMeta.backendBootId,
      memory_quality: memoryQuality,
      schema_version: readMeta.schemaVersion,
      backend_build: readMeta.backendBuild,
    });
  });

  // ============== POST /memories/feedback ==============
  app.post("/memories/feedback", express.json({ limit: MEMORIES_MUTATION_BODY_LIMIT }), (req, res) => {
    if (!requireMemoryUser(req, res, "memories_feedback")) return;
    const rid = req.requestId || createRequestId();
    const nowTs = Date.now();
    const context = resolveWritableMemoryContext(req, nowTs);
    const memory = sanitizePersistedSessionMemory(context.memory);
    const cardId = normalizeMemoryCardId(req.body?.card_id ?? req.body?.id ?? "");
    const key = String(req.body?.key || "").trim();
    const signal = normalizeMemoryQualitySignal(req.body?.signal ?? req.body?.feedback ?? "");
    const note = normalizeSnippet(req.body?.note ?? req.body?.reason ?? "", 96);
    const themeKey = resolveThemeKeyFromMemoryCard(cardId, key);
    let mutation;
    if (!themeKey) {
      mutation = {
        ok: false,
        status: "not_editable",
        message: "Only theme memories support quality feedback.",
        themeKey: "",
      };
    } else if (signal === "none") {
      mutation = {
        ok: false,
        status: "invalid_signal",
        message: "Feedback signal must be hit or correction.",
        themeKey,
      };
    } else {
      const feedback = incrementThemeQualitySignal(
        memory,
        themeKey,
        {
          signal,
          reason: note || "user_feedback",
          amount: 1,
          nowTs,
          trigger: "feedback",
          runUsefulnessLoop: true,
        },
      );
      mutation = feedback.ok
        ? {
          ok: true,
          status: signal,
          message: null,
          themeKey,
        }
        : {
          ok: false,
          status: feedback.status || "not_found",
          message: "Memory card not found.",
          themeKey,
        };
    }

    const persisted = persistWritableMemoryContext(context, memory, nowTs);
    const readMeta = buildReadStateMeta(req, persisted, context.requesterIp);
    const historyThreads = buildConversationHistoryThreads(persisted, 160);
    const cards = buildMemoryCards(persisted, historyThreads, 160);
    const memoryQuality = buildMemoryQualitySnapshot(persisted, cards, nowTs);
    const updatedCard = cards.find((card) => (
      normalizeMemoryCardId(card.id) === normalizeMemoryCardId(cardId) ||
      (themeKey && String(card.key || "").trim().toLowerCase() === themeKey)
    )) || null;
    const statusCode = mutation.ok ? 200 : 400;

    res.setHeader("Cache-Control", "no-store");
    applyReadStateHeaders(res, readMeta);
    logger.log(
      `[${rid}] memories_feedback status=${mutation.status} signal=${signal || "none"} card=${normalizeMemoryCardId(cardId) || "none"} key=${themeKey || "none"}`,
    );

    return res.status(statusCode).json({
      ok: Boolean(mutation.ok),
      action: "feedback",
      status: String(mutation.status || (mutation.ok ? "feedback" : "failed")),
      message: mutation.message || null,
      memory_card: updatedCard,
      theme_key: String(mutation.themeKey || themeKey || ""),
      session_id: readMeta.sessionId,
      state_version: readMeta.stateVersion,
      last_turn_id: readMeta.lastTurnId || null,
      last_updated_at: readMeta.lastUpdatedAt || null,
      history_updated_at: readMeta.historyUpdatedAt || null,
      memory_updated_at: readMeta.memoryUpdatedAt || null,
      backend_boot_id: readMeta.backendBootId,
      memory_quality: memoryQuality,
      schema_version: readMeta.schemaVersion,
      backend_build: readMeta.backendBuild,
    });
  });
}

export { mountMemoriesRoutes, MEMORIES_MUTATION_BODY_LIMIT };
