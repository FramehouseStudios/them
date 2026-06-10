const userMemoryByIp = new Map();
const userMemoryByUserId = new Map();
const userMemoryByClientToken = new Map();

let configuredDeps = null;

function configureMemoryStore(deps = {}) {
  configuredDeps = deps;
}

function memoryStoreDeps() {
  if (!configuredDeps) {
    throw new Error("memory_store not configured");
  }
  return configuredDeps;
}

function sanitizePersistedSessionMemory(rawMemory) {
  const {
    DEFAULT_ASSISTANT_SELF_NAME,
    SCREENPLAY_PROJECT_MEMORY_MAX = 8,
    SESSION_THREAD_SCHEMA_VERSION,
    SOCIAL_SPARK_MEMORY_MAX,
    TASKS_MAX_STORED,
    USER_MEMORY_LISTENING_FACTS_MAX,
    USER_MEMORY_REMEMBERED_PEOPLE_MAX,
    USER_MEMORY_TURN_HISTORY_MAX,
    USER_SPECIFICITY_TARGET_MAX,
    USER_SPECIFICITY_TARGET_MIN,
    clampUnit,
    createEmptyEmotionMemory,
    normalizeAffectionStyle,
    normalizeAssistantSelfName,
    normalizeEmailAddress,
    normalizeLocalActionType,
    normalizeMotivationOutcome,
    normalizeReassuranceStyle,
    normalizeSnippet,
    normalizeUserPersonName,
    personalitySignalKeys,
    pushBoundedUniqueFolded,
    rankPersonalitySignals,
    sanitizeActiveThemes,
    sanitizeAdaptiveBias,
    sanitizeAdaptiveHistoryItems,
    sanitizeAdaptiveQualityTags,
    sanitizeDailyTurnItems,
    sanitizeDayStampList,
    sanitizeMemoryCardIdList,
    sanitizePersonalitySignalMap,
    sanitizeReassuranceStyleScores,
    sanitizeRememberedPeople,
    sanitizeScreenplayProjectMemoryItems,
    sanitizeSnippetList,
    sanitizeSocialSparkMoments,
    sanitizeTaskItems,
    sanitizeTaskItems: _sanitizeTaskItems,
    sanitizeTimestampList,
    sanitizeTurnHistoryItems,
    trimToMax,
  } = memoryStoreDeps();
  const base = createEmptyEmotionMemory();
  const source = rawMemory && typeof rawMemory === "object" ? rawMemory : {};
  const merged = {
    ...base,
    ...source,
  };

  merged.assistantSelfName =
    normalizeAssistantSelfName(merged.assistantSelfName) || DEFAULT_ASSISTANT_SELF_NAME;
  merged.assistantSelfNameUpdatedAt = Math.max(0, Number(merged.assistantSelfNameUpdatedAt || 0));

  merged.userPrimaryName = normalizeUserPersonName(merged.userPrimaryName);
  merged.userPrimaryNameUpdatedAt = Math.max(0, Number(merged.userPrimaryNameUpdatedAt || 0));
  merged.lastUserNameMentionTurn = Math.max(0, Number(merged.lastUserNameMentionTurn || 0));
  merged.lastUserNameMentionAt = Math.max(0, Number(merged.lastUserNameMentionAt || 0));
  merged.userNameMentionCount = Math.max(0, Number(merged.userNameMentionCount || 0));
  merged.rememberedPeople = sanitizeRememberedPeople(
    merged.rememberedPeople,
    USER_MEMORY_REMEMBERED_PEOPLE_MAX
  );
  merged.lastConversationRecap = normalizeSnippet(merged.lastConversationRecap, 220);
  merged.lastConversationAt = Math.max(0, Number(merged.lastConversationAt || 0));
  merged.lastConversationSnapshot = normalizeSnippet(merged.lastConversationSnapshot, 420);
  merged.lastConversationSnapshotAt = Math.max(0, Number(merged.lastConversationSnapshotAt || 0));
  merged.lastConversationSummaryVersion = Math.max(
    1,
    Number(merged.lastConversationSummaryVersion || 1)
  );
  merged.lastBoundaryEdgeTurn = Math.max(0, Number(merged.lastBoundaryEdgeTurn || 0));
  merged.boundaryEdgeCount = Math.max(0, Number(merged.boundaryEdgeCount || 0));
  merged.lastBoundaryEdgeReason = normalizeSnippet(merged.lastBoundaryEdgeReason, 96);
  merged.turnQualityScore = clampUnit(merged.turnQualityScore, 0.66);
  merged.turnQualityEMA = clampUnit(merged.turnQualityEMA, merged.turnQualityScore);
  merged.turnQualityCount = Math.max(0, Number(merged.turnQualityCount || 0));
  merged.turnQualityLastSource = normalizeSnippet(merged.turnQualityLastSource, 32);
  merged.turnQualityLastTags = sanitizeAdaptiveQualityTags(merged.turnQualityLastTags);
  merged.turnQualityLastAt = Math.max(0, Number(merged.turnQualityLastAt || 0));
  merged.turnQualityLastSpecificity = clampUnit(merged.turnQualityLastSpecificity, 0.50);
  merged.turnQualityLastContinuity = clampUnit(merged.turnQualityLastContinuity, 0.50);
  merged.turnQualityLastAttunement = clampUnit(merged.turnQualityLastAttunement, 0.50);
  merged.turnQualityLastPull = clampUnit(merged.turnQualityLastPull, 0.50);
  merged.turnQualityLastBrevity = clampUnit(merged.turnQualityLastBrevity, 0.50);
  merged.turnQualityLastCompletionRate = clampUnit(merged.turnQualityLastCompletionRate, 0.50);
  merged.avgTurnQuality7d = clampUnit(
    merged.avgTurnQuality7d,
    clampUnit(merged.turnQualityEMA, merged.turnQualityScore)
  );
  merged.adaptiveQuestionBias = sanitizeAdaptiveBias(merged.adaptiveQuestionBias);
  merged.adaptiveSoftnessBias = sanitizeAdaptiveBias(merged.adaptiveSoftnessBias);
  merged.adaptiveDepthBias = sanitizeAdaptiveBias(merged.adaptiveDepthBias);
  merged.adaptiveInitiativeBias = sanitizeAdaptiveBias(merged.adaptiveInitiativeBias);
  merged.adaptiveClarityBias = sanitizeAdaptiveBias(merged.adaptiveClarityBias);
  merged.adaptiveEvalCount = Math.max(0, Number(merged.adaptiveEvalCount || 0));
  merged.adaptiveEvalFailureCount = Math.max(0, Number(merged.adaptiveEvalFailureCount || 0));
  merged.adaptiveHistory = sanitizeAdaptiveHistoryItems(merged.adaptiveHistory);
  merged.userSpecificitySignalLast = clampUnit(
    merged.userSpecificitySignalLast,
    USER_SPECIFICITY_TARGET_MIN
  );
  merged.userSpecificityMomentum = clampUnit(
    merged.userSpecificityMomentum,
    merged.userSpecificitySignalLast
  );
  merged.userSpecificityTarget = Math.max(
    USER_SPECIFICITY_TARGET_MIN,
    Math.min(
      USER_SPECIFICITY_TARGET_MAX,
      clampUnit(merged.userSpecificityTarget, merged.userSpecificityMomentum)
    )
  );
  merged.userSpecificityAnchorCountLast = Math.max(
    0,
    Number(merged.userSpecificityAnchorCountLast || 0)
  );
  merged.userSpecificityDetailCueCountLast = Math.max(
    0,
    Number(merged.userSpecificityDetailCueCountLast || 0)
  );
  merged.userSpecificityWordCountLast = Math.max(
    0,
    Number(merged.userSpecificityWordCountLast || 0)
  );
  merged.userSpecificityUpdatedAt = Math.max(0, Number(merged.userSpecificityUpdatedAt || 0));

  merged.recentUserTurns = sanitizeSnippetList(merged.recentUserTurns, 8, 170);
  merged.recentAssistantTurns = sanitizeSnippetList(merged.recentAssistantTurns, 8, 170);
  merged.recentQAPairs = sanitizeSnippetList(merged.recentQAPairs, 8, 260);
  merged.turnHistory = sanitizeTurnHistoryItems(merged.turnHistory).slice(-USER_MEMORY_TURN_HISTORY_MAX);
  if (typeof sanitizeScreenplayProjectMemoryItems === "function") {
    merged.screenplayProjectMemory = sanitizeScreenplayProjectMemoryItems(
      merged.screenplayProjectMemory,
      SCREENPLAY_PROJECT_MEMORY_MAX
    );
  } else {
    merged.screenplayProjectMemory = (Array.isArray(merged.screenplayProjectMemory)
      ? merged.screenplayProjectMemory
      : []
    )
      .map((item) => (item && typeof item === "object" ? item : null))
      .filter(Boolean)
      .slice(-SCREENPLAY_PROJECT_MEMORY_MAX);
  }
  merged.screenplayProjectMemoryUpdatedAt = Math.max(
    0,
    Number(merged.screenplayProjectMemoryUpdatedAt || 0)
  );

  let listeningFacts = [];
  const sourceFacts = Array.isArray(merged.listeningFacts) ? merged.listeningFacts : [];
  for (const fact of sourceFacts) {
    const clean = normalizeSnippet(fact, 90);
    if (!clean) continue;
    listeningFacts = pushBoundedUniqueFolded(
      listeningFacts,
      clean,
      USER_MEMORY_LISTENING_FACTS_MAX
    );
  }
  merged.listeningFacts = listeningFacts.slice(-USER_MEMORY_LISTENING_FACTS_MAX);
  merged.recentEmotionShifts = sanitizeSnippetList(merged.recentEmotionShifts, 8, 90);

  const turnFallback = Math.max(0, Number(merged.turns || 0));
  merged.activeThemes = sanitizeActiveThemes(merged.activeThemes, turnFallback);
  merged.sessionThreads = sanitizeActiveThemes(
    Array.isArray(merged.sessionThreads) && merged.sessionThreads.length
      ? merged.sessionThreads
      : merged.activeThemes,
    turnFallback
  );
  merged.sessionThreadSchemaVersion = Math.max(
    SESSION_THREAD_SCHEMA_VERSION,
    Number(merged.sessionThreadSchemaVersion || 0)
  );

  merged.activeDayStamps = sanitizeDayStampList(merged.activeDayStamps, 56);
  merged.highDepthDayStamps = sanitizeDayStampList(merged.highDepthDayStamps, 56);
  merged.recentDailyTurns = sanitizeDailyTurnItems(merged.recentDailyTurns, 56);
  merged.dependencySignalTimestamps = sanitizeTimestampList(merged.dependencySignalTimestamps, 512);
  merged.veryHighBehaviorTurnTimestamps = sanitizeTimestampList(merged.veryHighBehaviorTurnTimestamps, 512);

  merged.initiationRecentBanks = sanitizeSnippetList(merged.initiationRecentBanks, 16, 48);
  merged.initiationRecentLines = sanitizeSnippetList(merged.initiationRecentLines, 24, 140);
  merged.socialSparkMoments = sanitizeSocialSparkMoments(
    merged.socialSparkMoments,
    SOCIAL_SPARK_MEMORY_MAX
  );
  merged.socialSparkRecentQuestions = sanitizeSnippetList(merged.socialSparkRecentQuestions, 24, 180);
  merged.lastSocialSparkEvent = normalizeSnippet(merged.lastSocialSparkEvent, 96);
  merged.lastSocialSparkDetail = normalizeSnippet(merged.lastSocialSparkDetail, 140);
  merged.lastSocialSparkAffect = normalizeSnippet(merged.lastSocialSparkAffect, 40);
  merged.lastSocialSparkTurn = Math.max(0, Number(merged.lastSocialSparkTurn || 0));
  merged.lastSocialSparkAt = Math.max(0, Number(merged.lastSocialSparkAt || 0));
  merged.lastSocialSparkReferenceTurn = Math.max(0, Number(merged.lastSocialSparkReferenceTurn || 0));
  merged.lastSocialSparkQuestion = normalizeSnippet(merged.lastSocialSparkQuestion, 180);
  merged.lastSocialSparkQuestionTurn = Math.max(0, Number(merged.lastSocialSparkQuestionTurn || 0));
  merged.socialSparkYassCount = Math.max(0, Number(merged.socialSparkYassCount || 0));
  merged.lastSocialSparkYassTurn = Math.max(0, Number(merged.lastSocialSparkYassTurn || 0));
  merged.lastSocialSparkYassAt = Math.max(0, Number(merged.lastSocialSparkYassAt || 0));
  merged.personalitySignalScores = sanitizePersonalitySignalMap(merged.personalitySignalScores);
  const personalityKeys = personalitySignalKeys();
  merged.personalityTopSignals = Array.isArray(merged.personalityTopSignals)
    ? merged.personalityTopSignals
      .map((x) => String(x || "").trim().toLowerCase())
      .filter((x) => personalityKeys.includes(x))
      .slice(0, 4)
    : [];
  if (!merged.personalityTopSignals.length) {
    merged.personalityTopSignals = rankPersonalitySignals(merged.personalitySignalScores)
      .filter((x) => Number(x.score || 0) >= 0.16)
      .slice(0, 3)
      .map((x) => x.key);
  }
  merged.personalitySummary = normalizeSnippet(merged.personalitySummary, 140);
  merged.personalityCheckInCount = Math.max(0, Number(merged.personalityCheckInCount || 0));
  merged.lastPersonalityCheckInTurn = Math.max(0, Number(merged.lastPersonalityCheckInTurn || 0));
  merged.lastPersonalityCheckInAt = Math.max(0, Number(merged.lastPersonalityCheckInAt || 0));
  merged.lastPersonalityQuestion = normalizeSnippet(merged.lastPersonalityQuestion, 180);
  merged.lastPersonalityInsightAt = Math.max(0, Number(merged.lastPersonalityInsightAt || 0));
  merged.reassuranceStyle = normalizeReassuranceStyle(merged.reassuranceStyle, "soft");
  merged.reassuranceStyleScores = sanitizeReassuranceStyleScores(merged.reassuranceStyleScores);
  merged.reassuranceStyleUpdatedAt = Math.max(0, Number(merged.reassuranceStyleUpdatedAt || 0));
  merged.affectionStyle = normalizeAffectionStyle(merged.affectionStyle, "casual");
  merged.supportIntentHint = normalizeSnippet(merged.supportIntentHint, 40) || "clarity_then_comfort";
  merged.loveTopicActive = Boolean(merged.loveTopicActive);
  merged.romanceDepthHint = clampUnit(merged.romanceDepthHint, 0);
  merged.motivationFollowupPending = Boolean(merged.motivationFollowupPending);
  merged.motivationLastAction = normalizeSnippet(merged.motivationLastAction, 140);
  merged.motivationLastActionAt = Math.max(0, Number(merged.motivationLastActionAt || 0));
  merged.motivationLastActionTurn = Math.max(0, Number(merged.motivationLastActionTurn || 0));
  merged.motivationLastOutcome = normalizeMotivationOutcome(merged.motivationLastOutcome, "none");
  merged.motivationCompletionStreak = Math.max(0, Number(merged.motivationCompletionStreak || 0));
  merged.motivationSetbackCount = Math.max(0, Number(merged.motivationSetbackCount || 0));
  merged.motivationLastStatusAt = Math.max(0, Number(merged.motivationLastStatusAt || 0));
  merged.pendingEmailRecipient = normalizeEmailAddress(merged.pendingEmailRecipient);
  merged.pendingEmailSubject = trimToMax(String(merged.pendingEmailSubject || "").trim(), 120);
  merged.pendingEmailAwaitingBody = Boolean(merged.pendingEmailAwaitingBody) &&
    Boolean(merged.pendingEmailRecipient);
  merged.pendingEmailUpdatedAt = Math.max(0, Number(merged.pendingEmailUpdatedAt || 0));
  merged.pendingLocalActionType = normalizeLocalActionType(merged.pendingLocalActionType);
  merged.pendingLocalActionPayload = normalizeSnippet(merged.pendingLocalActionPayload, 2_400);
  merged.pendingLocalActionSummary = normalizeSnippet(merged.pendingLocalActionSummary, 220);
  merged.pendingLocalActionUpdatedAt = Math.max(0, Number(merged.pendingLocalActionUpdatedAt || 0));
  merged.lastLocalActionType = normalizeLocalActionType(merged.lastLocalActionType);
  merged.lastLocalActionSignature = normalizeSnippet(merged.lastLocalActionSignature, 40);
  merged.lastLocalActionAt = Math.max(0, Number(merged.lastLocalActionAt || 0));
  merged.tasks = sanitizeTaskItems(merged.tasks, TASKS_MAX_STORED);
  merged.taskLastUpdatedAt = Math.max(0, Number(merged.taskLastUpdatedAt || 0));
  merged.forgottenMemoryCardIds = configuredDeps.sanitizeMemoryCardIdList(
    merged.forgottenMemoryCardIds,
    768
  );
  merged.memoryQualityHitCount = Math.max(0, Number(merged.memoryQualityHitCount || 0));
  merged.memoryQualityCorrectionCount = Math.max(0, Number(merged.memoryQualityCorrectionCount || 0));
  merged.memoryQualityLastAt = Math.max(0, Number(merged.memoryQualityLastAt || 0));
  merged.memoryBackfillLastAt = Math.max(0, Number(merged.memoryBackfillLastAt || 0));
  merged.memoryBackfillLastTrigger = normalizeSnippet(merged.memoryBackfillLastTrigger, 32);
  merged.memoryBackfillLastCreated = Math.max(0, Number(merged.memoryBackfillLastCreated || 0));
  merged.memoryBackfillTotal = Math.max(0, Number(merged.memoryBackfillTotal || 0));
  merged.memoryUsefulnessLastAt = Math.max(0, Number(merged.memoryUsefulnessLastAt || 0));
  merged.memoryUsefulnessLastTrigger = normalizeSnippet(merged.memoryUsefulnessLastTrigger, 24);
  merged.memoryUsefulnessLastTurn = Math.max(0, Number(merged.memoryUsefulnessLastTurn || 0));
  merged.memoryUsefulnessLastPromotions = Math.max(0, Number(merged.memoryUsefulnessLastPromotions || 0));
  merged.memoryUsefulnessLastDemotions = Math.max(0, Number(merged.memoryUsefulnessLastDemotions || 0));
  merged.memoryUsefulnessLastDropped = Math.max(0, Number(merged.memoryUsefulnessLastDropped || 0));
  merged.memoryUsefulnessPromotionsTotal = Math.max(0, Number(merged.memoryUsefulnessPromotionsTotal || 0));
  merged.memoryUsefulnessDemotionsTotal = Math.max(0, Number(merged.memoryUsefulnessDemotionsTotal || 0));
  merged.memoryPromptLastThemeCount = Math.max(0, Number(merged.memoryPromptLastThemeCount || 0));
  merged.memoryPromptLastInjectedCount = Math.max(0, Number(merged.memoryPromptLastInjectedCount || 0));
  merged.memoryPromptLastSuppressedCount = Math.max(0, Number(merged.memoryPromptLastSuppressedCount || 0));
  merged.memoryPromptLastAt = Math.max(0, Number(merged.memoryPromptLastAt || 0));
  merged.memoriesClearedAt = Math.max(0, Number(merged.memoriesClearedAt || 0));
  merged.historyClearedAt = Math.max(0, Number(merged.historyClearedAt || 0));

  const dayStamp = String(merged.relationshipDepthDailyStamp || "").trim();
  merged.relationshipDepthDailyStamp = /^\d{4}-\d{2}-\d{2}$/.test(dayStamp)
    ? dayStamp
    : "";
  merged.lastUpdatedAt = Math.max(0, Number(merged.lastUpdatedAt || Date.now()));

  return merged;
}

function sanitizeClientTokenAliasList(items, maxItems = 24) {
  const { normalizeClientToken } = memoryStoreDeps();
  const source = Array.isArray(items) ? items : (items ? [items] : []);
  const out = [];
  for (const item of source) {
    const token = normalizeClientToken(item);
    if (!token) continue;
    if (!out.includes(token)) out.push(token);
  }
  if (out.length > maxItems) {
    return out.slice(out.length - maxItems);
  }
  return out;
}

function cleanupUserMemoryStore(now = Date.now()) {
  const {
    USER_MEMORY_MAX_TRACKED,
    USER_MEMORY_STALE_DAYS,
    normalizeClientIp,
    normalizeClientToken,
  } = memoryStoreDeps();
  const staleMs = Math.max(1, USER_MEMORY_STALE_DAYS) * 24 * 60 * 60 * 1000;
  for (const [ip, record] of userMemoryByIp) {
    const updatedAt = Number(record?.updatedAt || record?.memory?.lastUpdatedAt || 0);
    if (!Number.isFinite(updatedAt) || updatedAt <= 0 || (now - updatedAt) > staleMs) {
      userMemoryByIp.delete(ip);
    }
  }

  for (const [userId, record] of userMemoryByUserId) {
    const updatedAt = Number(record?.updatedAt || record?.memory?.lastUpdatedAt || 0);
    if (!Number.isFinite(updatedAt) || updatedAt <= 0 || (now - updatedAt) > staleMs) {
      userMemoryByUserId.delete(userId);
    }
  }
  if (userMemoryByIp.size > USER_MEMORY_MAX_TRACKED) {
    const entries = [...userMemoryByIp.entries()]
      .map(([ip, record]) => ({
        ip,
        updatedAt: Number(record?.updatedAt || record?.memory?.lastUpdatedAt || 0),
      }))
      .sort((a, b) => a.updatedAt - b.updatedAt);
    const excess = userMemoryByIp.size - USER_MEMORY_MAX_TRACKED;
    for (let i = 0; i < excess; i += 1) {
      userMemoryByIp.delete(entries[i].ip);
    }
  }

  if (userMemoryByUserId.size > USER_MEMORY_MAX_TRACKED) {
    const entries = [...userMemoryByUserId.entries()]
      .map(([userId, record]) => ({
        userId,
        updatedAt: Number(record?.updatedAt || record?.memory?.lastUpdatedAt || 0),
      }))
      .sort((a, b) => a.updatedAt - b.updatedAt);
    const excess = userMemoryByUserId.size - USER_MEMORY_MAX_TRACKED;
    for (let i = 0; i < excess; i += 1) {
      userMemoryByUserId.delete(entries[i].userId);
    }
  }

  for (const [token, ip] of userMemoryByClientToken.entries()) {
    const normalizedToken = normalizeClientToken(token);
    const normalizedIp = normalizeClientIp(ip);
    if (!normalizedToken || !normalizedIp || normalizedIp === "unknown") {
      userMemoryByClientToken.delete(token);
      continue;
    }
    const record = userMemoryByIp.get(normalizedIp);
    const aliases = sanitizeClientTokenAliasList(record?.clientTokens, 24);
    if (!record || !aliases.includes(normalizedToken)) {
      userMemoryByClientToken.delete(token);
    }
  }

  for (const [ip, record] of userMemoryByIp.entries()) {
    const aliases = sanitizeClientTokenAliasList(record?.clientTokens, 24);
    if (aliases.length !== (Array.isArray(record?.clientTokens) ? record.clientTokens.length : 0)) {
      record.clientTokens = aliases;
      userMemoryByIp.set(ip, record);
    }
    for (const token of aliases) {
      userMemoryByClientToken.set(token, ip);
    }
  }
}

function saveUserMemoryStore(now = Date.now()) {
  const deps = memoryStoreDeps();
  const {
    USER_MEMORY_STORE_PATH,
    writeJsonFileAtomic,
    persistence,
  } = deps;
  cleanupUserMemoryStore(now);
  const entries = [...userMemoryByIp.entries()].map(([ip, record]) => ({
    ip,
    updatedAt: Number(record?.updatedAt || now),
    clientTokens: sanitizeClientTokenAliasList(record?.clientTokens, 24),
    memory: sanitizePersistedSessionMemory(record?.memory),
  }));
  const users = [...userMemoryByUserId.entries()].map(([userId, record]) => ({
    userId,
    updatedAt: Number(record?.updatedAt || now),
    memory: sanitizePersistedSessionMemory(record?.memory),
  }));
  const payload = {
    version: 3,
    updatedAt: now,
    entries,
    users,
  };
  // Existing JSON-file path stays canonical until cutover completes.
  writeJsonFileAtomic(USER_MEMORY_STORE_PATH, payload, "user_memory");
  // T07c: dual-write to the persistence adapter when configured.
  // Records are namespaced by source bucket so reverse migration can
  // reconstruct the legacy byUserId / byIp / byClientToken structure.
  if (persistence && typeof persistence.put === "function") {
    for (const entry of entries) {
      void Promise.resolve(persistence.put({
        domain: "user_memory",
        key: `byIp:${entry.ip}`,
        value: entry,
      })).catch((err) => {
        console.error(`[user_memory] adapter put byIp:${entry.ip} failed:`, err?.message || err);
      });
    }
    for (const userEntry of users) {
      void Promise.resolve(persistence.put({
        domain: "user_memory",
        key: `byUserId:${userEntry.userId}`,
        value: userEntry,
      })).catch((err) => {
        console.error(`[user_memory] adapter put byUserId:${userEntry.userId} failed:`, err?.message || err);
      });
    }
  }
}

// T07c: load user-memory records from the persistence adapter.
// Returns true if any records were loaded so callers can fall back
// to the legacy JSON-file load when the adapter is empty.
async function loadUserMemoryStoreFromAdapter(
  targetByIp = userMemoryByIp,
  targetByToken = userMemoryByClientToken,
) {
  const deps = memoryStoreDeps();
  const { persistence, normalizeClientIp } = deps;
  if (!persistence || typeof persistence.list !== "function") return false;
  let records;
  try {
    records = await persistence.list({ domain: "user_memory", limit: 10_000 });
  } catch (err) {
    console.error("[user_memory] adapter list failed:", err?.message || err);
    return false;
  }
  if (!Array.isArray(records) || records.length === 0) return false;
  targetByIp.clear();
  targetByToken.clear();
  for (const { key, value } of records) {
    if (key.startsWith("byIp:")) {
      const ip = (typeof normalizeClientIp === "function") ? normalizeClientIp(value?.ip) : value?.ip;
      if (!ip) continue;
      targetByIp.set(ip, value);
      if (Array.isArray(value?.clientTokens)) {
        for (const token of value.clientTokens) {
          if (token) targetByToken.set(token, ip);
        }
      }
    } else if (key.startsWith("byUserId:")) {
      const userId = key.slice("byUserId:".length);
      if (userId) userMemoryByUserId.set(userId, value);
    }
  }
  return true;
}

function loadUserMemoryStore(targetByIp = userMemoryByIp, targetByToken = userMemoryByClientToken) {
  const {
    USER_MEMORY_STORE_PATH,
    fs,
    normalizeClientIp,
  } = memoryStoreDeps();
  targetByIp.clear();
  targetByToken.clear();
  try {
    if (!fs.existsSync(USER_MEMORY_STORE_PATH)) {
      return;
    }
    const raw = fs.readFileSync(USER_MEMORY_STORE_PATH, "utf8");
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (parseErr) {
      const corruptPath = `${USER_MEMORY_STORE_PATH}.corrupt-${Date.now()}`;
      try {
        fs.renameSync(USER_MEMORY_STORE_PATH, corruptPath);
      } catch (_) {
        // no-op
      }
      console.error(
        `[user_memory] Corrupt store detected. Moved to ${corruptPath}.`,
        parseErr
      );
      return;
    }
    const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
    const users = Array.isArray(parsed?.users) ? parsed.users : [];
    const now = Date.now();
    for (const entry of entries) {
      const ip = normalizeClientIp(entry?.ip);
      if (!ip || ip === "unknown") continue;
      const memory = sanitizePersistedSessionMemory(entry?.memory);
      const updatedAt = Math.max(
        0,
        Math.min(
          now,
          Number(entry?.updatedAt || memory?.lastUpdatedAt || 0)
        )
      );
      if (!updatedAt) continue;
      const aliases = sanitizeClientTokenAliasList(entry?.clientTokens, 24);
      const existing = targetByIp.get(ip);
      if (!existing || updatedAt >= Number(existing.updatedAt || 0)) {
        targetByIp.set(ip, { memory, updatedAt, clientTokens: aliases });
      }
    }


    for (const entry of users) {
      const userId = String(entry?.userId || "").trim();
      if (!userId) continue;
      const memory = sanitizePersistedSessionMemory(entry?.memory);
      const updatedAt = Math.max(0, Math.min(now, Number(entry?.updatedAt || memory?.lastUpdatedAt || 0)));
      if (!updatedAt) continue;
      const existing = userMemoryByUserId.get(userId);
      if (!existing || updatedAt >= Number(existing.updatedAt || 0)) {
        userMemoryByUserId.set(userId, { memory, updatedAt });
      }
    }

    for (const [ip, record] of targetByIp.entries()) {
      const aliases = sanitizeClientTokenAliasList(record?.clientTokens, 24);
      for (const token of aliases) {
        targetByToken.set(token, ip);
      }
    }
  } catch (err) {
    console.error(`[user_memory] Failed to load store ${USER_MEMORY_STORE_PATH}:`, err);
  }
}

function getPersistedIpForClientToken(clientToken, now = Date.now()) {
  const { normalizeClientIp, normalizeClientToken } = memoryStoreDeps();
  cleanupUserMemoryStore(now);
  const normalizedToken = normalizeClientToken(clientToken);
  if (!normalizedToken) return "";
  const mappedIp = normalizeClientIp(userMemoryByClientToken.get(normalizedToken));
  if (!mappedIp || mappedIp === "unknown") return "";
  if (!userMemoryByIp.has(mappedIp)) return "";
  return mappedIp;
}

function getPersistedUserMemoryForClientToken(clientToken, now = Date.now()) {
  const mappedIp = getPersistedIpForClientToken(clientToken, now);
  if (!mappedIp) return null;
  return getPersistedUserMemoryForIp(mappedIp, now);
}

function getPersistedUserMemoryForUserId(userId, now = Date.now()) {
  cleanupUserMemoryStore(now);
  const key = String(userId || "").trim();
  if (!key) return null;
  const record = userMemoryByUserId.get(key);
  if (!record || typeof record !== "object") return null;
  return sanitizePersistedSessionMemory(record.memory);
}

function getPersistedUserMemoryForIp(ip, now = Date.now()) {
  const { normalizeClientIp } = memoryStoreDeps();
  cleanupUserMemoryStore(now);
  const key = normalizeClientIp(ip);
  const record = userMemoryByIp.get(key);
  if (!record || typeof record !== "object") return null;
  return sanitizePersistedSessionMemory(record.memory);
}

function setPersistedUserMemoryForUserId(userId, memory, now = Date.now()) {
  const key = String(userId || "").trim();
  if (!key) return sanitizePersistedSessionMemory(memory);
  const sanitized = sanitizePersistedSessionMemory(memory);
  userMemoryByUserId.set(key, { memory: sanitized, updatedAt: now });
  saveUserMemoryStore(now);
  return sanitized;
}

function setPersistedUserMemoryForIp(ip, memory, now = Date.now(), options = {}) {
  const {
    normalizeClientIp,
    syncUserMemoryRecordToBackplane,
  } = memoryStoreDeps();
  const key = normalizeClientIp(ip);
  if (!key || key === "unknown") {
    return sanitizePersistedSessionMemory(memory);
  }
  const sanitized = sanitizePersistedSessionMemory(memory);
  const existing = userMemoryByIp.get(key);
  const existingAliases = sanitizeClientTokenAliasList(existing?.clientTokens, 24);
  const optionAliases = sanitizeClientTokenAliasList(options?.clientTokenAliases, 24);
  const aliases = sanitizeClientTokenAliasList(
    [...existingAliases, ...optionAliases],
    24
  );
  userMemoryByIp.set(key, { memory: sanitized, updatedAt: now, clientTokens: aliases });
  for (const token of aliases) {
    userMemoryByClientToken.set(token, key);
  }
  saveUserMemoryStore(now);
  if (typeof syncUserMemoryRecordToBackplane === "function") {
    syncUserMemoryRecordToBackplane(key, { memory: sanitized, updatedAt: now, clientTokens: aliases });
  }
  return sanitized;
}

export {
  cleanupUserMemoryStore,
  configureMemoryStore,
  getPersistedIpForClientToken,
  getPersistedUserMemoryForClientToken,
  getPersistedUserMemoryForUserId,
  getPersistedUserMemoryForIp,
  loadUserMemoryStore,
  loadUserMemoryStoreFromAdapter,
  sanitizeClientTokenAliasList,
  sanitizePersistedSessionMemory,
  saveUserMemoryStore,
  setPersistedUserMemoryForIp,
  setPersistedUserMemoryForUserId,
  userMemoryByClientToken,
  userMemoryByIp,
  userMemoryByUserId,
};
