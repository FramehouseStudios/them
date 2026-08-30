import { createAccountMemoryMutationCommitter } from "./account_memory_turn_commit.js";

function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new Error(`restoreAuthenticatedSessionMemory requires ${name}`);
  }
  return value;
}

async function restoreAuthenticatedSessionMemory({
  req,
  token,
  activeSession,
  isNewSession = false,
  nowTs = Date.now(),
  resolveCanonicalWritableMemoryContext,
  persistCanonicalWritableMemoryContext,
  sanitizeMemory,
  initializeNewSessionMemory,
  buildConversationHistoryThreads,
  maybeBackfillThemesFromHistory,
  historyLimit = 260,
} = {}) {
  const resolveCanonical = requireFunction(
    resolveCanonicalWritableMemoryContext,
    "resolveCanonicalWritableMemoryContext",
  );
  const persistCanonical = requireFunction(
    persistCanonicalWritableMemoryContext,
    "persistCanonicalWritableMemoryContext",
  );
  const sanitize = requireFunction(sanitizeMemory, "sanitizeMemory");
  const initializeSession = requireFunction(
    initializeNewSessionMemory,
    "initializeNewSessionMemory",
  );
  const buildThreads = requireFunction(
    buildConversationHistoryThreads,
    "buildConversationHistoryThreads",
  );
  const backfillThemes = requireFunction(
    maybeBackfillThemesFromHistory,
    "maybeBackfillThemesFromHistory",
  );

  const context = await resolveCanonical(req, nowTs);
  if (!context?.canonical) {
    const error = new Error("Authenticated session memory is not canonical.");
    error.code = "canonical_memory_required";
    throw error;
  }
  context.activeSession = activeSession && typeof activeSession === "object"
    ? activeSession
    : null;
  context.clientToken = String(token || "").trim();

  const preview = sanitize(context.memory);
  const initializedPreview = isNewSession
    ? sanitize(initializeSession(preview, nowTs))
    : preview;
  const previewThreads = buildThreads(initializedPreview, historyLimit);
  const previewBackfill = backfillThemes(
    initializedPreview,
    previewThreads,
    nowTs,
    { trigger: "session_load" },
  ) || { applied: false, created: 0, trigger: "session_load", keys: [] };
  const needsCommit = Boolean(isNewSession || previewBackfill.applied);
  let backfillResult = previewBackfill;
  let memory;

  if (needsCommit) {
    const commitMutation = createAccountMemoryMutationCommitter({
      context,
      persistMemory: persistCanonical,
      sanitizeMemory: sanitize,
    });
    memory = await commitMutation((currentMemory) => {
      let candidate = sanitize(currentMemory);
      if (isNewSession) {
        candidate = sanitize(initializeSession(candidate, nowTs));
      }
      const threads = buildThreads(candidate, historyLimit);
      backfillResult = backfillThemes(
        candidate,
        threads,
        nowTs,
        { trigger: "session_load" },
      ) || { applied: false, created: 0, trigger: "session_load", keys: [] };
      return candidate;
    }, nowTs);
  } else {
    memory = sanitize(context.memory);
    if (context.activeSession) context.activeSession.memory = memory;
  }

  return {
    memory: sanitize(memory),
    context,
    backfillResult,
  };
}

export { restoreAuthenticatedSessionMemory };
