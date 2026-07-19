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
// Routes extracted (9 total):
//
//   GET  /memories            — list view + delta-no-change
//                               short-circuit + If-None-Match etag.
//                               Performs background theme backfill.
//   GET  /memories/export     — full-dump envelope (memory_cards,
//                               history_threads, tasks, themes,
//                               assembled into export_json string).
//   POST /memories/update     — mutate a memory card.
//   POST /memories/character-bible/update
//                             — repair durable character canon.
//   POST /memories/corrections/undo
//                             — undo an accepted-canon correction.
//   POST /memories/corrections/resolve
//                             — resolve an ambiguous canon correction.
//   POST /memories/forget     — delete a memory card.
//   POST /memories/promote    — promote a card to a theme.
//   POST /memories/feedback   — record human feedback on a theme.
//
// Response envelopes, body limits, cache controls, and read-state
// headers remain compatible with the original inline handlers.
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
import { extractCharacterMemoryCorrection } from "./creative_memory_store.js";

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

  function isDurableCreativeMemoryKey(key = "") {
    return /^(?:character|episode):\S/i.test(String(key || "").trim());
  }

  async function readCreativeMemoryForUser(userId, query = "memories character bible") {
    if (!userId || !creativeMemoryStore || typeof creativeMemoryStore.getCreativeMemoryForPrompt !== "function") {
      return null;
    }
    try {
      if (typeof creativeMemoryStore.getCreativeMemoryLedger === "function") {
        return await creativeMemoryStore.getCreativeMemoryLedger({
          userId,
          includeSuperseded: true,
          maxEpisodicMemories: 72,
        });
      }
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

  function canonCorrectionReceiptPayload(receipt = null) {
    if (!receipt || typeof receipt !== "object") return null;
    return {
      id: String(receipt.id || ""),
      status: String(receipt.status || ""),
      project_id: String(receipt.projectId || ""),
      project_title: String(receipt.projectTitle || ""),
      correction_text: String(receipt.correctionText || ""),
      matched_facts: Array.isArray(receipt.matchedFacts) ? receipt.matchedFacts : [],
      correction_memory_id: String(receipt.correctionMemoryId || ""),
      created_at: Math.max(0, Number(receipt.createdAt || 0)),
      undone_at: Math.max(0, Number(receipt.undoneAt || 0)) || null,
    };
  }

  function canonCorrectionAmbiguityPayload(ambiguity = null) {
    if (!ambiguity || typeof ambiguity !== "object") return null;
    return {
      id: String(ambiguity.id || ""),
      status: String(ambiguity.status || ""),
      project_id: String(ambiguity.projectId || ""),
      project_title: String(ambiguity.projectTitle || ""),
      correction_text: String(ambiguity.correctionText || ""),
      candidate_facts: Array.isArray(ambiguity.candidateFacts) ? ambiguity.candidateFacts : [],
      correction_memory_id: String(ambiguity.correctionMemoryId || ""),
      selected_fact: String(ambiguity.selectedFact || ""),
      selected_facts: Array.isArray(ambiguity.selectedFacts)
        ? ambiguity.selectedFacts
        : ambiguity.selectedFact
          ? [ambiguity.selectedFact]
          : [],
      receipt_id: String(ambiguity.receiptId || ""),
      created_at: Math.max(0, Number(ambiguity.createdAt || 0)),
      resolved_at: Math.max(0, Number(ambiguity.resolvedAt || 0)) || null,
    };
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

  function mergeUniqueMemoryLines(primary = [], secondary = [], limit = 8) {
    const seen = new Set();
    const out = [];
    for (const value of [...primary, ...secondary]) {
      const clean = normalizeSnippet(value, 220);
      if (!clean) continue;
      const key = clean.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(clean);
      if (out.length >= limit) break;
    }
    return out;
  }

  function enrichCharacterBiblePatchWithCorrectionParser(character, characterBible) {
    if (!character || !characterBible) return characterBible;
    const correctionText = [
      ...(Array.isArray(characterBible.corrections) ? characterBible.corrections : []),
      ...(Array.isArray(characterBible.canon) ? characterBible.canon : []),
    ].join(" ");
    const parsed = extractCharacterMemoryCorrection(correctionText, character);
    if (!parsed) return characterBible;
    const parsedCanon = parsed.correctedFact ? [parsed.correctedFact] : [];
    return {
      ...characterBible,
      canon: mergeUniqueMemoryLines(characterBible.canon, parsedCanon, 8),
      correctedTerms: mergeUniqueMemoryLines(characterBible.correctedTerms, parsed.correctedTerms, 8),
      correctionReplacements: mergeUniqueMemoryLines(
        characterBible.correctionReplacements,
        parsed.correctionReplacements,
        8,
      ),
    };
  }

  function buildCharacterArcCorrectionLine(character, arc = {}) {
    const parts = [
      arc.act ? `act=${arc.act}` : "",
      arc.want ? `want=${arc.want}` : "",
      arc.need ? `need=${arc.need}` : "",
      arc.wound ? `wound=${arc.wound}` : "",
      arc.falseBelief ? `false belief=${arc.falseBelief}` : "",
      arc.relationshipPressure ? `pressure=${arc.relationshipPressure}` : "",
      arc.currentTactic ? `tactic=${arc.currentTactic}` : "",
      arc.nextEmotionalTurn ? `next turn=${arc.nextEmotionalTurn}` : "",
    ].filter(Boolean);
    if (!parts.length) return "";
    return normalizeSnippet(`${character}: ${parts.join("; ")}`, 280);
  }

  function buildCharacterBibleStorySpinePatch(character, characterBible = {}) {
    const correctionLines = normalizeStringListPayload(characterBible.corrections, 6, 260);
    const canonLines = normalizeStringListPayload(characterBible.canon, 8, 220);
    const correctedTerms = normalizeStringListPayload(characterBible.correctedTerms, 8, 120);
    const correctionReplacements = normalizeStringListPayload(characterBible.correctionReplacements, 8, 160);
    const arc = normalizeArcPatch(characterBible.arc);
    const authoritativeLine = normalizeSnippet(
      correctionLines[0] || canonLines[0] || buildCharacterArcCorrectionLine(character, arc),
      220,
    );
    if (
      !authoritativeLine &&
      !correctedTerms.length &&
      !correctionReplacements.length &&
      !Object.keys(arc).length
    ) {
      return null;
    }

    const continuityNotes = [
      authoritativeLine
        ? `Authoritative user correction for ${character}: ${authoritativeLine}`
        : `Authoritative user correction for ${character}'s character bible.`,
    ];
    const characterArcLine = buildCharacterArcCorrectionLine(character, arc);
    const characterArcTurns = [
      characterArcLine,
      ...correctionLines.map((line) => `${character}: ${line}`),
    ].filter(Boolean);

    return {
      characterFocus: [character],
      continuityNotes,
      correctedTerms,
      correctionReplacements,
      characterArcTurns,
      characterArcState: characterArcLine,
      emotionalContinuity: `Honor ${character}'s corrected character bible before writing new pages.`,
      reason: authoritativeLine || `Corrected ${character}'s character bible.`,
    };
  }

  function buildScreenplayProjectMemoryRepairCardId(item = {}, fallback = "") {
    const key = [
      "screenplay-project",
      item?.projectId || item?.documentRevisionId || item?.sceneLabel || item?.updatedAt || fallback,
    ].join("-").replace(/[^a-zA-Z0-9_-]+/g, "-");
    return normalizeMemoryCardId(key);
  }

  function projectMemoryContainsCharacterCorrectionSignal(item = {}, character = "", patch = {}, total = 0) {
    if (total <= 1) return true;
    const characterKey = String(character || "").trim().toLowerCase();
    const terms = [
      characterKey,
      ...(Array.isArray(patch.correctedTerms) ? patch.correctedTerms : []),
      ...(Array.isArray(patch.correctionReplacements) ? patch.correctionReplacements : [])
        .flatMap((entry) => String(entry || "").split(/\s*->\s*/)),
    ]
      .map((entry) => String(entry || "").trim().toLowerCase())
      .filter(Boolean);
    if (!terms.length) return false;
    const haystack = JSON.stringify(item || {}).toLowerCase();
    return terms.some((term) => haystack.includes(term));
  }

  function repairScreenplayProjectMemoryForCharacterBible(memory, character, characterBible, nowTs) {
    if (!memory || typeof memory !== "object") {
      return { repaired: false, count: 0, cardIds: [] };
    }
    const projects = Array.isArray(memory.screenplayProjectMemory)
      ? memory.screenplayProjectMemory
      : [];
    if (!projects.length) {
      return { repaired: false, count: 0, cardIds: [] };
    }
    const patch = buildCharacterBibleStorySpinePatch(character, characterBible);
    if (!patch) {
      return { repaired: false, count: 0, cardIds: [] };
    }

    const repairedIds = [];
    const seenTargets = new Set();
    projects.forEach((item, index) => {
      const key = normalizeSnippet(item?.projectId || item?.documentRevisionId || "", 96);
      const cardId = buildScreenplayProjectMemoryRepairCardId(item, index + 1);
      const targetKey = key || cardId;
      if (!targetKey || seenTargets.has(targetKey)) return;
      if (!projectMemoryContainsCharacterCorrectionSignal(item, character, patch, projects.length)) return;
      seenTargets.add(targetKey);
      const mutation = updateMemoryCardInMemory(
        memory,
        {
          cardId,
          key,
          title: normalizeSnippet(item?.projectTitle || item?.sceneLabel || "Screenplay Project", 84),
          summary: "",
          reason: patch.reason,
          storySpine: patch,
        },
        nowTs,
      );
      if (mutation?.ok) {
        repairedIds.push(String(mutation.cardId || cardId || targetKey));
      }
    });

    if (!repairedIds.length) {
      return { repaired: false, count: 0, cardIds: [] };
    }
    return { repaired: true, count: repairedIds.length, cardIds: repairedIds };
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
    const { character, characterBible: rawCharacterBible } = normalizeCharacterBiblePatch(req.body || {});
    const characterBible = enrichCharacterBiblePatchWithCorrectionParser(character, rawCharacterBible);
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

    const context = resolveWritableMemoryContext(req, nowTs);
    const memory = sanitizePersistedSessionMemory(context.memory);
    const storySpineRepair = repairScreenplayProjectMemoryForCharacterBible(
      memory,
      character,
      characterBible,
      nowTs,
    );
    const persisted = storySpineRepair.repaired
      ? persistWritableMemoryContext(context, memory, nowTs)
      : memory;
    const readMeta = buildReadStateMeta(req, persisted, context.requesterIp);
    const historyThreads = buildConversationHistoryThreads(persisted, 160);
    const creativeMemory = await readCreativeMemoryForUser(userId, character);
    const cards = buildMemoryCards(persisted, historyThreads, 160, creativeMemory);
    const normalizedTargetId = normalizeMemoryCardId(`character-${character}`);
    const updatedCard = cards.find((card) => (
      normalizeMemoryCardId(card.id) === normalizedTargetId ||
      String(card.key || "") === `character:${character}`
    )) || null;
    const memoryQuality = buildMemoryQualitySnapshot(persisted, cards, nowTs);

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
      story_spine_repaired: Boolean(storySpineRepair.repaired),
      story_spine_repair_count: Math.max(0, Number(storySpineRepair.count || 0)),
      story_spine_repaired_card_ids: storySpineRepair.cardIds || [],
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
    const storySpine = req.body?.story_spine && typeof req.body.story_spine === "object"
      ? req.body.story_spine
      : (req.body?.storySpine && typeof req.body.storySpine === "object" ? req.body.storySpine : null);
    const mutation = updateMemoryCardInMemory(
      memory,
      { cardId, key, title, summary, reason, storySpine },
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

  // ============== POST /memories/corrections/undo ==============
  app.post("/memories/corrections/undo", express.json({ limit: MEMORIES_MUTATION_BODY_LIMIT }), async (req, res) => {
    const userId = requireMemoryUser(req, res, "memories_correction_undo");
    if (!userId) return;
    const rid = req.requestId || createRequestId();
    const receiptId = String(req.body?.receipt_id ?? req.body?.receiptId ?? "").trim().slice(0, 96);
    if (!receiptId) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(400).json({
        ok: false,
        action: "undo_correction",
        status: "correction_receipt_id_required",
        message: "A correction receipt id is required.",
      });
    }
    if (!creativeMemoryStore || typeof creativeMemoryStore.undoCanonCorrection !== "function") {
      res.setHeader("Cache-Control", "no-store");
      return res.status(503).json({
        ok: false,
        action: "undo_correction",
        status: "creative_memory_unavailable",
        message: "Durable creative memory is not available.",
      });
    }

    let mutation;
    try {
      mutation = await creativeMemoryStore.undoCanonCorrection({ userId, receiptId });
    } catch (error) {
      logger.log(`[${rid}] memories_correction_undo error=${error?.message || error}`);
      res.setHeader("Cache-Control", "no-store");
      return res.status(500).json({
        ok: false,
        action: "undo_correction",
        status: "correction_undo_failed",
        message: "The correction could not be undone.",
      });
    }

    const status = String(mutation?.status || "correction_undo_failed");
    const statusCode = mutation?.ok
      ? 200
      : status === "correction_receipt_not_found" || status === "memory_not_found"
        ? 404
        : status === "newer_correction_exists"
          ? 409
          : 400;
    const nowTs = Date.now();
    const context = resolveWritableMemoryContext(req, nowTs);
    const memory = sanitizePersistedSessionMemory(context.memory);
    const persisted = mutation?.ok && status === "undone"
      ? persistWritableMemoryContext(context, memory, nowTs)
      : memory;
    const readMeta = buildReadStateMeta(req, persisted, context.requesterIp);
    const receipt = mutation?.receipt || null;
    res.setHeader("Cache-Control", "no-store");
    applyReadStateHeaders(res, readMeta);
    logger.log(`[${rid}] memories_correction_undo status=${status} receipt=${receiptId}`);
    return res.status(statusCode).json({
      ok: Boolean(mutation?.ok),
      action: "undo_correction",
      status,
      message: status === "newer_correction_exists"
        ? "Undo the newer correction for this project first."
        : null,
      correction_receipt: canonCorrectionReceiptPayload(receipt),
      session_id: readMeta.sessionId,
      state_version: readMeta.stateVersion,
      last_turn_id: readMeta.lastTurnId || null,
      last_updated_at: readMeta.lastUpdatedAt || null,
      history_updated_at: readMeta.historyUpdatedAt || null,
      memory_updated_at: readMeta.memoryUpdatedAt || null,
      backend_boot_id: readMeta.backendBootId,
      schema_version: readMeta.schemaVersion,
      backend_build: readMeta.backendBuild,
    });
  });

  // ============== POST /memories/corrections/resolve ==============
  app.post("/memories/corrections/resolve", express.json({ limit: MEMORIES_MUTATION_BODY_LIMIT }), async (req, res) => {
    const userId = requireMemoryUser(req, res, "memories_correction_resolve");
    if (!userId) return;
    const rid = req.requestId || createRequestId();
    const ambiguityId = String(req.body?.ambiguity_id ?? req.body?.ambiguityId ?? "").trim().slice(0, 96);
    const legacySelectedFact = normalizeSnippet(
      req.body?.selected_fact ?? req.body?.selectedFact ?? "",
      220
    );
    const selectedFacts = normalizeStringListPayload(
      req.body?.selected_facts ?? req.body?.selectedFacts ?? (legacySelectedFact ? [legacySelectedFact] : []),
      8,
      220
    );
    if (!ambiguityId || !selectedFacts.length) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(400).json({
        ok: false,
        action: "resolve_correction",
        status: !ambiguityId ? "correction_ambiguity_id_required" : "selected_fact_required",
        message: !ambiguityId
          ? "A correction ambiguity id is required."
          : "Choose at least one accepted canon fact.",
      });
    }
    if (!creativeMemoryStore || typeof creativeMemoryStore.resolveCanonCorrectionAmbiguity !== "function") {
      res.setHeader("Cache-Control", "no-store");
      return res.status(503).json({
        ok: false,
        action: "resolve_correction",
        status: "creative_memory_unavailable",
        message: "Durable creative memory is not available.",
      });
    }

    let mutation;
    try {
      mutation = await creativeMemoryStore.resolveCanonCorrectionAmbiguity({
        userId,
        ambiguityId,
        selectedFacts,
      });
    } catch (error) {
      logger.log(`[${rid}] memories_correction_resolve error=${error?.message || error}`);
      res.setHeader("Cache-Control", "no-store");
      return res.status(500).json({
        ok: false,
        action: "resolve_correction",
        status: "correction_resolution_failed",
        message: "The correction choice could not be applied.",
      });
    }

    const status = String(mutation?.status || "correction_resolution_failed");
    const statusCode = mutation?.ok
      ? 200
      : status === "correction_ambiguity_not_found" || status === "memory_not_found"
        ? 404
        : [
          "correction_ambiguity_already_resolved",
          "correction_project_not_found",
          "accepted_canon_fact_not_found",
        ].includes(status)
          ? 409
          : 400;
    const nowTs = Date.now();
    const context = resolveWritableMemoryContext(req, nowTs);
    const memory = sanitizePersistedSessionMemory(context.memory);
    const persisted = mutation?.ok && status === "resolved"
      ? persistWritableMemoryContext(context, memory, nowTs)
      : memory;
    const readMeta = buildReadStateMeta(req, persisted, context.requesterIp);
    res.setHeader("Cache-Control", "no-store");
    applyReadStateHeaders(res, readMeta);
    logger.log(`[${rid}] memories_correction_resolve status=${status} ambiguity=${ambiguityId}`);
    return res.status(statusCode).json({
      ok: Boolean(mutation?.ok),
      action: "resolve_correction",
      status,
      message: statusCode === 409
        ? "This correction choice is stale. Refresh Memories and try again."
        : null,
      correction_ambiguity: canonCorrectionAmbiguityPayload(mutation?.ambiguity),
      correction_receipt: canonCorrectionReceiptPayload(mutation?.receipt),
      session_id: readMeta.sessionId,
      state_version: readMeta.stateVersion,
      last_turn_id: readMeta.lastTurnId || null,
      last_updated_at: readMeta.lastUpdatedAt || null,
      history_updated_at: readMeta.historyUpdatedAt || null,
      memory_updated_at: readMeta.memoryUpdatedAt || null,
      backend_boot_id: readMeta.backendBootId,
      schema_version: readMeta.schemaVersion,
      backend_build: readMeta.backendBuild,
    });
  });

  // ============== POST /memories/forget ==============
  app.post("/memories/forget", express.json({ limit: MEMORIES_MUTATION_BODY_LIMIT }), async (req, res) => {
    const userId = requireMemoryUser(req, res, "memories_forget");
    if (!userId) return;
    const rid = req.requestId || createRequestId();
    const nowTs = Date.now();
    const cardId = normalizeMemoryCardId(req.body?.card_id ?? req.body?.id ?? "");
    const key = String(req.body?.key || "").trim();
    let durableMemoryDeleted = null;
    if (isDurableCreativeMemoryKey(key)) {
      if (!creativeMemoryStore || typeof creativeMemoryStore.forgetMemoryCard !== "function") {
        res.setHeader("Cache-Control", "no-store");
        return res.status(503).json({
          ok: false,
          action: "forget",
          status: "creative_memory_unavailable",
          message: "Durable creative memory is not available.",
        });
      }
      try {
        const receipt = await creativeMemoryStore.forgetMemoryCard({ userId, key });
        if (!receipt?.ok) {
          res.setHeader("Cache-Control", "no-store");
          return res.status(400).json({
            ok: false,
            action: "forget",
            status: String(receipt?.reason || "creative_memory_forget_failed"),
            message: "Durable creative memory could not be forgotten.",
          });
        }
        durableMemoryDeleted = Boolean(receipt.forgotten);
      } catch (error) {
        logger.log(`[${rid}] memories_forget creative_error=${error?.message || error}`);
        res.setHeader("Cache-Control", "no-store");
        return res.status(500).json({
          ok: false,
          action: "forget",
          status: "creative_memory_forget_failed",
          message: "Durable creative memory could not be forgotten.",
        });
      }
    }
    const context = resolveWritableMemoryContext(req, nowTs);
    const memory = sanitizePersistedSessionMemory(context.memory);
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
      durable_memory_deleted: durableMemoryDeleted,
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
