const CONCURRENT_WRITER_KEYS = new Set([
  "activeThemes",
  "forgottenMemoryCardIds",
  "pendingScreenplayLearningQuestions",
  "screenplayProjectMemory",
  "screenplayProjectMemoryUpdatedAt",
  "sessionThreads",
  "tasks",
  "taskLastUpdatedAt",
]);

const HISTORY_CLEAR_KEYS = new Set([
  "continuationHoldCount",
  "forgottenMemoryCardIds",
  "lastAssistantReply",
  "lastConversationAt",
  "lastConversationRecap",
  "lastConversationSnapshot",
  "lastConversationSnapshotAt",
  "lastUserQuestion",
  "pendingScreenplayLearningQuestions",
  "recentAssistantTurns",
  "recentQAPairs",
  "recentUserTurns",
  "turnHistory",
  "turns",
]);

const MEMORY_CLEAR_KEYS = new Set([
  "activeThemes",
  "forgottenMemoryCardIds",
  "lastFeelingHint",
  "lastMirrorCue",
  "lastNeedHint",
  "lastTheme",
  "listeningFacts",
  "pendingScreenplayLearningQuestions",
  "rememberedPeople",
  "screenplayProjectMemory",
  "screenplayProjectMemoryUpdatedAt",
  "sessionThreads",
  "tasks",
  "taskLastUpdatedAt",
  "userPrimaryName",
  "userPrimaryNameUpdatedAt",
]);

const MONOTONIC_KEYS = new Set([
  "cycleIndex",
  "growthLevel",
  "growthProgress",
  "relationshipDepthPeak",
  "relationshipDepthScore",
  "seasonTransitionCount",
]);

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function arrayIdentity(value) {
  if (!isPlainObject(value)) return `${typeof value}:${JSON.stringify(value)}`;
  for (const key of ["id", "projectId", "key", "turnId"]) {
    const identity = String(value[key] || "").trim();
    if (identity) return `${key}:${identity}`;
  }
  return JSON.stringify(value);
}

function mergeArrays(winner, candidate, rootKey) {
  const combined = [...winner, ...candidate];
  const byIdentity = new Map();
  for (const item of combined) {
    byIdentity.set(arrayIdentity(item), cloneJson(item));
  }
  const merged = [...byIdentity.values()];
  if (rootKey === "turnHistory") {
    merged.sort((left, right) => Number(left?.ts || 0) - Number(right?.ts || 0));
  }
  return merged;
}

function isCounterKey(key) {
  return key === "turns" || /(?:Count|Total|Turns|Streak)$/.test(key);
}

function isTimestampKey(key) {
  return /(?:At|UpdatedAt|Timestamp|Ts)$/.test(key);
}

function mergeValue(base, candidate, winner, path, preferCandidate) {
  if (sameJson(candidate, base)) return cloneJson(winner);
  if (sameJson(winner, base)) return cloneJson(candidate);

  const rootKey = path[0] || "";
  const key = path[path.length - 1] || rootKey;
  if (
    typeof base === "number" &&
    typeof candidate === "number" &&
    typeof winner === "number"
  ) {
    if (isTimestampKey(key) || MONOTONIC_KEYS.has(rootKey)) {
      return Math.max(candidate, winner);
    }
    if (isCounterKey(key) && candidate >= base && winner >= base) {
      return winner + (candidate - base);
    }
  }
  if (sameJson(candidate, winner)) return cloneJson(winner);
  if (Array.isArray(candidate) && Array.isArray(winner)) {
    return mergeArrays(winner, candidate, rootKey);
  }
  if (isPlainObject(candidate) && isPlainObject(winner)) {
    const baseObject = isPlainObject(base) ? base : {};
    const merged = {};
    const keys = new Set([
      ...Object.keys(baseObject),
      ...Object.keys(winner),
      ...Object.keys(candidate),
    ]);
    for (const childKey of keys) {
      merged[childKey] = mergeValue(
        baseObject[childKey],
        candidate[childKey],
        winner[childKey],
        [...path, childKey],
        preferCandidate,
      );
    }
    return merged;
  }
  return cloneJson(preferCandidate ? candidate : winner);
}

function mergeConcurrentAccountMemory({
  baseMemory,
  candidateMemory,
  winnerMemory,
} = {}) {
  const base = isPlainObject(baseMemory) ? baseMemory : {};
  const candidate = isPlainObject(candidateMemory) ? candidateMemory : {};
  const winner = isPlainObject(winnerMemory) ? winnerMemory : {};
  const winnerHistoryCleared = Number(winner.historyClearedAt || 0) > Number(base.historyClearedAt || 0);
  const winnerMemoriesCleared = Number(winner.memoriesClearedAt || 0) > Number(base.memoriesClearedAt || 0);
  const preferCandidate = Number(candidate.lastUpdatedAt || 0) >= Number(winner.lastUpdatedAt || 0);
  const merged = {};
  const keys = new Set([
    ...Object.keys(base),
    ...Object.keys(winner),
    ...Object.keys(candidate),
  ]);

  for (const key of keys) {
    const candidateChanged = !sameJson(candidate[key], base[key]);
    const winnerChanged = !sameJson(winner[key], base[key]);
    const clearWins =
      (winnerHistoryCleared && (HISTORY_CLEAR_KEYS.has(key) || winnerChanged)) ||
      (winnerMemoriesCleared && (MEMORY_CLEAR_KEYS.has(key) || winnerChanged));
    if (
      clearWins ||
      (candidateChanged && winnerChanged && CONCURRENT_WRITER_KEYS.has(key))
    ) {
      merged[key] = cloneJson(winner[key]);
      continue;
    }
    merged[key] = mergeValue(
      base[key],
      candidate[key],
      winner[key],
      [key],
      preferCandidate,
    );
  }
  merged.lastUpdatedAt = Math.max(
    Number(candidate.lastUpdatedAt || 0),
    Number(winner.lastUpdatedAt || 0),
  );
  return merged;
}

function createAccountMemoryTurnCommitter({
  context,
  persistMemory,
  sanitizeMemory,
  maxAttempts = 3,
} = {}) {
  if (!context || typeof context !== "object") {
    throw new Error("createAccountMemoryTurnCommitter requires context");
  }
  if (typeof persistMemory !== "function") {
    throw new Error("createAccountMemoryTurnCommitter requires persistMemory");
  }
  if (typeof sanitizeMemory !== "function") {
    throw new Error("createAccountMemoryTurnCommitter requires sanitizeMemory");
  }
  const attemptCap = Math.max(1, Math.min(5, Number(maxAttempts) || 3));
  let baseline = cloneJson(sanitizeMemory(context.memory));
  let queue = Promise.resolve();

  async function commitNow(requestedMemory, requestedBaseline, nowTs) {
    let candidate = cloneJson(sanitizeMemory(requestedMemory));
    let repairBaseline = cloneJson(baseline);
    if (!sameJson(requestedBaseline, repairBaseline)) {
      candidate = sanitizeMemory(mergeConcurrentAccountMemory({
        baseMemory: requestedBaseline,
        candidateMemory: candidate,
        winnerMemory: repairBaseline,
      }));
    }
    for (let attempt = 0; attempt < attemptCap; attempt += 1) {
      const result = await persistMemory(context, candidate, nowTs);
      if (result?.ok) {
        const committed = sanitizeMemory(result.memory || candidate);
        baseline = cloneJson(committed);
        context.memory = committed;
        if (result.record) context.canonicalRecord = result.record;
        if (context.activeSession && typeof context.activeSession === "object") {
          context.activeSession.memory = committed;
        }
        return committed;
      }
      if (result?.status !== "stale_memory_state_version") break;
      const winner = sanitizeMemory(result.memory || context.memory);
      candidate = sanitizeMemory(mergeConcurrentAccountMemory({
        baseMemory: repairBaseline,
        candidateMemory: candidate,
        winnerMemory: winner,
      }));
      repairBaseline = cloneJson(winner);
      context.memory = winner;
      context.canonicalRecord = result.record || null;
    }
    const error = new Error("Clementine memory changed too many times to commit this turn safely.");
    error.code = "memory_commit_conflict";
    error.stage = "memory";
    error.status = 503;
    throw error;
  }

  return function commitTurnMemory(nextMemory, nowTs = Date.now()) {
    const requestedMemory = cloneJson(nextMemory);
    const requestedBaseline = cloneJson(baseline);
    const pending = queue.then(() => commitNow(requestedMemory, requestedBaseline, nowTs));
    queue = pending.catch(() => undefined);
    return pending;
  };
}

export {
  createAccountMemoryTurnCommitter,
  mergeConcurrentAccountMemory,
};
