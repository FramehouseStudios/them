// Durable request admission owns cancellation across restart/worker boundaries.
// No expiry/eviction: absence permits admission, so removing a stop would reopen
// it. Account deletion purges these metadata-only rows after revoking identity.
import { createHash, randomUUID } from 'node:crypto';

const PAGE_REQUEST_DOMAIN = 'page_requests';
const digest = value => createHash('sha256').update(value).digest('hex');

function identity({ sessionId, userId, requestId } = {}) {
  const parts = [userId, sessionId, requestId].map(value => typeof value === 'string' ? value.trim() : '');
  if (parts.some(value => !value) || parts[0].length > 256 || parts[1].length > 4096 || parts[2].length > 128) {
    throw Object.assign(new Error('Invalid writing turn identity.'), { code: 'invalid_page_request_id', status: 400 });
  }
  return { key: digest(JSON.stringify(parts)), ownerId: parts[0],
    sessionHash: digest(parts[1]), requestHash: digest(parts[2]) };
}

function createPageRequestLedger({ persistence, now = () => Date.now(), pollMs = 250 } = {}) {
  if (typeof persistence?.get !== 'function' || typeof persistence?.compareAndSwap !== 'function') {
    throw new Error('Page request ledger requires canonical get/compareAndSwap persistence.');
  }
  const interval = Math.max(25, Math.min(1000, Number(pollMs) || 250));
  const read = async target => {
    const { key, ...scope } = identity(target);
    const record = await persistence.get({ domain: PAGE_REQUEST_DOMAIN, key });
    if (record && (record.schemaVersion !== 1 || record.ownerId !== scope.ownerId ||
        record.sessionHash !== scope.sessionHash || record.requestHash !== scope.requestHash ||
        !['admitted', 'cancelled', 'finishing'].includes(record.state))) {
      throw new Error('Invalid durable writing turn record.');
    }
    return record;
  };

  async function transition(target, state, admissionId = null) {
    const { key, ...scope } = identity(target);
    for (let attempt = 0; attempt < 8; attempt++) {
      const previous = await read(target);
      if (state === 'finishing' && (!previous || previous.admissionId !== admissionId)) {
        throw new Error('Writing turn completion requires its original admission.');
      }
      if (previous) {
        if (state === 'admitted') return { ok: false, code: previous.state === 'cancelled'
          ? 'page_generation_cancelled' : 'page_request_already_started' };
        if (previous.state === 'finishing') return { ok: false, code: 'page_request_finalizing' };
        if (state === 'finishing' && previous.state === 'cancelled') {
          return { ok: false, code: 'page_generation_cancelled' };
        }
        if (previous.state === 'cancelled') return { ok: true };
      }
      const value = { schemaVersion: 1, ...scope, state,
        admissionId: previous?.admissionId || randomUUID(),
        createdAt: previous?.createdAt ?? now(), updatedAt: now() };
      if (await persistence.compareAndSwap({ domain: PAGE_REQUEST_DOMAIN, key, expectedValue: previous, value })) {
        return { ok: true, admissionId: value.admissionId };
      }
    }
    throw new Error('Writing turn admission contention.');
  }

  function watch(target, onStop) {
    let stopped = false, timer = null;
    const close = () => { stopped = true; clearTimeout(timer); };
    async function check() {
      try {
        const record = await read(target);
        if (stopped) return;
        if (!record || record.state === 'cancelled') { close(); onStop(); return; }
      } catch {
        if (stopped) return;
        close(); onStop(); return; // storage disappearance is not permission to finish
      }
      timer = setTimeout(check, interval);
      timer.unref?.();
    }
    void check();
    return close;
  }

  return { admit: target => transition(target, 'admitted'),
    stop: target => transition(target, 'cancelled'),
    claimCompletion: (target, admissionId) => transition(target, 'finishing', admissionId), read, watch };
}

export { createPageRequestLedger, PAGE_REQUEST_DOMAIN };
