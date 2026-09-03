let configuredDeps = null;
let outboxWorkerPromise = null;

function configureOutboxStore(deps = {}) {
  configuredDeps = deps;
}

function outboxStoreDeps() {
  if (!configuredDeps) {
    throw new Error("outbox_store not configured");
  }
  return configuredDeps;
}

function buildOutboxActionKey(type, payload = {}) {
  const {
    buildLocalActionSignature,
    normalizeLocalActionType,
  } = outboxStoreDeps();
  return buildLocalActionSignature(`outbox_${normalizeLocalActionType(type)}`, payload);
}

async function enqueueActionOutbox({
  type = "",
  payload = {},
  result = {},
  status = "pending",
  retryAt = 0,
  actionKey = "",
  reqId = "outbox",
  userId = null,
} = {}) {
  const {
    OUTBOX_ENABLED,
    normalizeLocalActionType,
    randomUUID,
    scaleBackplane,
    normalizeSnippet,
  } = outboxStoreDeps();
  if (!OUTBOX_ENABLED) return null;
  const normalizedType = normalizeLocalActionType(type);
  if (!normalizedType || normalizedType === "none") return null;
  const nextStatus = String(status || "pending").toLowerCase();
  const now = Date.now();
  const row = await scaleBackplane.enqueueOutbox({
    id: randomUUID(),
    type: normalizedType,
    actionKey: actionKey || buildOutboxActionKey(normalizedType, payload),
    status: nextStatus,
    attempts: 0,
    createdAt: now,
    updatedAt: now,
    nextAttemptAt: Math.max(0, Number(retryAt || now)),
    payload: payload && typeof payload === "object" ? payload : {},
    result: result && typeof result === "object" ? result : {},
    lastError: nextStatus === "failed" ? normalizeSnippet(result?.error, 640) : "",
    userId: userId ? String(userId).trim() : "",
  });
  if (row?.duplicate) {
    console.warn(`[${reqId}] outbox duplicate type=${normalizedType} key=${row.actionKey || "none"}`);
  } else {
    console.warn(`[${reqId}] outbox enqueue id=${row?.id || "none"} type=${normalizedType} status=${nextStatus}`);
  }
  return row;
}

function computeOutboxRetryAt(attempt) {
  const { OUTBOX_RETRY_BASE_DELAY_MS } = outboxStoreDeps();
  const n = Math.max(0, Number(attempt || 0));
  const multiplier = Math.max(1, Math.min(32, 2 ** n));
  return Date.now() + (OUTBOX_RETRY_BASE_DELAY_MS * multiplier);
}

async function retryOutboxAction(item) {
  const {
    captureLocalNote,
    normalizeLocalActionType,
    normalizeSnippet,
  } = outboxStoreDeps();
  const payload = item?.payload && typeof item.payload === "object" ? item.payload : {};
  const type = normalizeLocalActionType(item?.type);
  if (!type || type === "none") {
    return { ok: false, done: true, error: "invalid_type", result: {} };
  }
  if (type === "note_capture") {
    const noteText = normalizeSnippet(payload.noteText, 1600);
    if (!noteText) {
      return { ok: false, done: true, error: "missing_note_text", result: {} };
    }
    const result = await captureLocalNote({
      noteText,
      reqId: `outbox-${String(item?.id || "").slice(0, 8)}`,
    });
    const success = String(result?.status || "") === "saved";
    return {
      ok: success,
      done: success,
      error: success ? "" : String(result?.error || "note_capture_failed"),
      result: result && typeof result === "object" ? result : {},
    };
  }
  return { ok: false, done: true, error: `unsupported_type:${type}`, result: {} };
}

async function processOutboxBatch({ limit = null, reqId = "outbox_worker", userId = null, allowAllUsers = false } = {}) {
  const {
    OUTBOX_ENABLED,
    OUTBOX_RETRY_MAX_ATTEMPTS,
    OUTBOX_WORKER_BATCH_SIZE,
    normalizeSnippet,
    scaleBackplane,
  } = outboxStoreDeps();
  if (!OUTBOX_ENABLED) return { claimed: 0, completed: 0, failed: 0, retried: 0 };
  if (!userId && !allowAllUsers) {
    throw new Error("processOutboxBatch requires userId or allowAllUsers:true");
  }
  const due = userId
    ? await scaleBackplane.claimDueOutbox(Math.max(1, Number(limit || OUTBOX_WORKER_BATCH_SIZE)), { userId: String(userId).trim() })
    : await scaleBackplane.claimDueOutbox(Math.max(1, Number(limit || OUTBOX_WORKER_BATCH_SIZE)), { allowAllUsers: true });
  let completed = 0;
  let failed = 0;
  let retried = 0;
  for (const item of due) {
    const attempts = Math.max(0, Number(item?.attempts || 0));
    const retry = await retryOutboxAction(item);
    if (retry.ok) {
      await scaleBackplane.updateOutbox(item.id, {
        status: "completed",
        attempts: attempts + 1,
        updatedAt: Date.now(),
        nextAttemptAt: 0,
        result: retry.result,
        lastError: "",
      });
      completed += 1;
      continue;
    }
    const nextAttempts = attempts + 1;
    const shouldStop = retry.done || nextAttempts >= OUTBOX_RETRY_MAX_ATTEMPTS;
    await scaleBackplane.updateOutbox(item.id, {
      status: shouldStop ? "failed" : "pending",
      attempts: nextAttempts,
      updatedAt: Date.now(),
      nextAttemptAt: shouldStop ? 0 : computeOutboxRetryAt(nextAttempts),
      result: retry.result,
      lastError: normalizeSnippet(retry.error, 640),
    });
    if (shouldStop) failed += 1;
    else retried += 1;
  }
  if (due.length > 0) {
    console.warn(
      `[${reqId}] outbox_batch claimed=${due.length} completed=${completed} failed=${failed} retried=${retried}`
    );
  }
  return { claimed: due.length, completed, failed, retried };
}

async function processSingleOutboxItemById(id, reqId = "outbox_manual_retry", userId = null, allowAllUsers = false) {
  const {
    OUTBOX_RETRY_MAX_ATTEMPTS,
    normalizeSnippet,
    scaleBackplane,
  } = outboxStoreDeps();
  const targetId = String(id || "").trim();
  if (!targetId) {
    return { ok: false, error: "missing_id" };
  }
  const owner = userId ? String(userId).trim() : null;
  if (!owner && !allowAllUsers) {
    throw new Error("processSingleOutboxItemById requires userId or allowAllUsers:true");
  }
  // Scoped callers list only their own rows; the operator control plane
  // opts into the cross-user view explicitly.
  const candidates = owner
    ? await scaleBackplane.listOutbox({ status: "all", limit: 2000, userId: owner })
    : await scaleBackplane.listOutbox({ status: "all", limit: 2000, allowAllUsers: true });
  const item = candidates.find((x) => String(x?.id || "") === targetId);
  // Belt and braces: even if a backplane returns a foreign row, a scoped
  // caller sees not_found (never 403, so existence is not confirmed).
  if (owner && item && String(item.userId || "") !== owner) {
    return { ok: false, error: "not_found" };
  }
  if (!item) {
    return { ok: false, error: "not_found" };
  }
  const attempts = Math.max(0, Number(item?.attempts || 0));
  const retry = await retryOutboxAction(item);
  if (retry.ok) {
    const updated = await scaleBackplane.updateOutbox(item.id, {
      status: "completed",
      attempts: attempts + 1,
      updatedAt: Date.now(),
      nextAttemptAt: 0,
      result: retry.result,
      lastError: "",
    });
    return { ok: true, status: "completed", item: updated };
  }
  const nextAttempts = attempts + 1;
  const shouldStop = retry.done || nextAttempts >= OUTBOX_RETRY_MAX_ATTEMPTS;
  const updated = await scaleBackplane.updateOutbox(item.id, {
    status: shouldStop ? "failed" : "pending",
    attempts: nextAttempts,
    updatedAt: Date.now(),
    nextAttemptAt: shouldStop ? 0 : computeOutboxRetryAt(nextAttempts),
    result: retry.result,
    lastError: normalizeSnippet(retry.error, 640),
  });
  console.warn(
    `[${reqId}] outbox_single id=${targetId} status=${String(updated?.status || "failed")} err=${normalizeSnippet(retry.error, 120) || "none"}`
  );
  return { ok: false, status: String(updated?.status || "failed"), error: retry.error, item: updated };
}

async function runOutboxWorkerTick() {
  const {
    OUTBOX_ENABLED,
    OUTBOX_WORKER_BATCH_SIZE,
    OUTBOX_WORKER_ENABLED,
  } = outboxStoreDeps();
  if (!OUTBOX_ENABLED || !OUTBOX_WORKER_ENABLED) return;
  if (outboxWorkerPromise) return outboxWorkerPromise;
  const activePromise = (async () => {
    try {
      return await processOutboxBatch({
        limit: OUTBOX_WORKER_BATCH_SIZE,
        reqId: "outbox_worker",
        allowAllUsers: true,
      });
    } catch (err) {
      console.error(`[outbox_worker] error=${String(err?.message || err)}`);
      return null;
    }
  })();
  outboxWorkerPromise = activePromise;
  try {
    return await activePromise;
  } finally {
    if (outboxWorkerPromise === activePromise) {
      outboxWorkerPromise = null;
    }
  }
}

async function waitForOutboxWorkerIdle() {
  return outboxWorkerPromise || undefined;
}

export {
  buildOutboxActionKey,
  computeOutboxRetryAt,
  configureOutboxStore,
  enqueueActionOutbox,
  processOutboxBatch,
  processSingleOutboxItemById,
  retryOutboxAction,
  runOutboxWorkerTick,
  waitForOutboxWorkerIdle,
};
