// Bounded retry with exponential backoff for provider HTTP calls.
//
// A single transient OpenAI/ElevenLabs hiccup (a 502/503, a 429, a dropped
// socket) should not fail an entire /talk turn. This helper retries an
// IDEMPOTENT provider request a small, bounded number of times on transient
// failures, then returns/raises like a single call.
//
// What is retried:
//   - retryable HTTP statuses: 429 and 5xx (500/502/503/504);
//   - network-level thrown errors (dropped socket, DNS, connection reset).
// What is NOT retried (fail fast, exactly once):
//   - timeouts/aborts — the caller surfaces a fast 504; retrying compounds
//     latency on the voice loop (excluded via the caller's isRetryableError);
//   - auth failures (401/403) and validation failures (400/404/409/422) — these
//     are deterministic; retrying cannot help and could mask a real bug.
//
// Retry-After: when a retryable response carries a Retry-After header (seconds
// or HTTP-date), we honor it as the backoff delay, capped at maxDelayMs so a
// server asking for a 60s wait cannot stall a voice turn.
//
// Side-effect safety: `attempt` performs ONE provider request and nothing else.
// It is the ONLY thing re-invoked on retry, so retries cannot duplicate turn
// commits, TTS synthesis bookkeeping, persistence, or spend metering — those
// run once, after the provider call returns, outside this helper.

const DEFAULT_RETRYABLE_STATUSES = Object.freeze([429, 500, 502, 503, 504]);

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelayMs(attemptIndex, baseDelayMs, maxDelayMs) {
  return Math.min(maxDelayMs, baseDelayMs * 2 ** attemptIndex);
}

// Parse a Retry-After header (delta-seconds or HTTP-date) into ms, or null.
function parseRetryAfterMs(resp, now = Date.now()) {
  let raw = null;
  try {
    if (resp && resp.headers && typeof resp.headers.get === "function") {
      raw = resp.headers.get("retry-after");
    } else if (resp && typeof resp.getHeader === "function") {
      raw = resp.getHeader("retry-after");
    }
  } catch {
    return null;
  }
  if (raw == null || String(raw).trim() === "") return null;
  const secs = Number(raw);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const dateMs = Date.parse(String(raw));
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - now);
  return null;
}

async function withProviderRetry(attempt, {
  retries = 2,
  baseDelayMs = 200,
  maxDelayMs = 2000,
  retryableStatuses = DEFAULT_RETRYABLE_STATUSES,
  // By default every thrown error is retryable; suppliers override this to
  // exclude their timeout/abort sentinel so timeouts fail fast.
  isRetryableError = () => true,
  sleep = defaultSleep,
  now = () => Date.now(),
  onRetry = () => {},
} = {}) {
  const statusSet = retryableStatuses instanceof Set
    ? retryableStatuses
    : new Set(retryableStatuses);
  const maxRetries = Math.max(0, Math.floor(Number(retries) || 0));

  let attemptIndex = 0;
  for (;;) {
    const isLast = attemptIndex >= maxRetries;
    try {
      const resp = await attempt(attemptIndex);
      if (!isLast && resp && statusSet.has(Number(resp?.status))) {
        try {
          if (typeof resp.text === "function") await resp.text(); // drain socket
        } catch {
          // ignore drain failures
        }
        const retryAfterMs = parseRetryAfterMs(resp, now());
        const delayMs = retryAfterMs != null
          ? Math.min(maxDelayMs, retryAfterMs)
          : backoffDelayMs(attemptIndex, baseDelayMs, maxDelayMs);
        onRetry({ attempt: attemptIndex, status: Number(resp.status), delayMs, retryAfterMs, error: null });
        await sleep(delayMs);
        attemptIndex += 1;
        continue;
      }
      return resp;
    } catch (err) {
      if (isLast || !isRetryableError(err)) throw err;
      const delayMs = backoffDelayMs(attemptIndex, baseDelayMs, maxDelayMs);
      onRetry({ attempt: attemptIndex, status: null, delayMs, retryAfterMs: null, error: err });
      await sleep(delayMs);
      attemptIndex += 1;
    }
  }
}

export {
  DEFAULT_RETRYABLE_STATUSES,
  backoffDelayMs,
  parseRetryAfterMs,
  withProviderRetry,
};
