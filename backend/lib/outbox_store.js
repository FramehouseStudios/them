let configuredDeps = null;
let outboxWorkerInFlight = false;

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
    CALENDAR_COMPOSE_TARGET,
    buildCalendarComposeUrl,
    captureLocalNote,
    normalizeLocalActionType,
    normalizeSnippet,
    sendLocalEmail,
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
  if (type === "email_compose") {
    const result = await sendLocalEmail({
      recipient: payload.recipient,
      subject: payload.subject,
      body: payload.body,
      reqId: `outbox-${String(item?.id || "").slice(0, 8)}`,
    });
    const status = String(result?.status || "");
    const success = status === "composed";
    const terminal = status === "disabled" || status === "needs_recipient" || status === "needs_content";
    return {
      ok: success,
      done: success || terminal,
      error: success ? "" : String(result?.error || status || "email_compose_failed"),
      result: result && typeof result === "object" ? result : {},
    };
  }
  if (type === "calendar_compose") {
    const compose = buildCalendarComposeUrl({
      title: payload.title,
      startAt: Number(payload.startAt || 0),
      endAt: Number(payload.endAt || 0),
      details: normalizeSnippet(payload.details, 360),
      target: payload.target,
    });
    const success = Boolean(compose?.url);
    return {
      ok: success,
      done: success,
      error: success ? "" : "calendar_compose_failed",
      result: success
        ? {
          status: "composed",
          action: "compose",
          title: normalizeSnippet(payload.title, 120) || "Calendar block",
          target: String(compose.target || payload.target || CALENDAR_COMPOSE_TARGET),
          transport: String(compose.transport || "none"),
          composeUrl: String(compose.url || ""),
          startAt: Math.max(0, Number(payload.startAt || 0)),
          endAt: Math.max(0, Number(payload.endAt || 0)),
        }
        : {
          status: "failed",
          action: "none",
          error: "Could not build calendar compose URL.",
        },
    };
  }
  return { ok: false, done: true, error: `unsupported_type:${type}`, result: {} };
}

async function processOutboxBatch({ limit = null, reqId = "outbox_worker" } = {}) {
  const {
    OUTBOX_ENABLED,
    OUTBOX_RETRY_MAX_ATTEMPTS,
    OUTBOX_WORKER_BATCH_SIZE,
    normalizeSnippet,
    scaleBackplane,
  } = outboxStoreDeps();
  if (!OUTBOX_ENABLED) return { claimed: 0, completed: 0, failed: 0, retried: 0 };
  const due = await scaleBackplane.claimDueOutbox(Math.max(1, Number(limit || OUTBOX_WORKER_BATCH_SIZE)));
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

async function processSingleOutboxItemById(id, reqId = "outbox_manual_retry") {
  const {
    OUTBOX_RETRY_MAX_ATTEMPTS,
    normalizeSnippet,
    scaleBackplane,
  } = outboxStoreDeps();
  const targetId = String(id || "").trim();
  if (!targetId) {
    return { ok: false, error: "missing_id" };
  }
  const candidates = await scaleBackplane.listOutbox({ status: "all", limit: 2000 });
  const item = candidates.find((x) => String(x?.id || "") === targetId);
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
  if (outboxWorkerInFlight) return;
  outboxWorkerInFlight = true;
  try {
    await processOutboxBatch({ limit: OUTBOX_WORKER_BATCH_SIZE, reqId: "outbox_worker" });
  } catch (err) {
    console.error(`[outbox_worker] error=${String(err?.message || err)}`);
  } finally {
    outboxWorkerInFlight = false;
  }
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
};
