// T-live-draft-sync — in-process live draft hub.
//
// Keeps one mirror of the screenplay draft per (user, project) channel and
// fans keystroke-level operations out to every other device the same user
// has open on that project. This is what makes typing on the desktop app
// appear on the iPhone (and vice versa) while the user types, ahead of the
// slower authoritative `/screenplay/projects/:id/version` autosave.
//
// V1 pillar: infra
// V1 effect: cross-device live typing for the Studio editor.
//
// Model:
//   - `op` = { start, delete_count, insert } in UTF-16 code units. JS strings
//     and Swift `String.utf16` share that unit, so both sides apply the same
//     op to the same text and land on the same checksum.
//   - Every applied op bumps the channel `seq`. A publisher sends the seq +
//     checksum it built the op against; a stale base is rejected with the
//     current full text so the client can resync instead of diverging.
//   - Checksum = FNV-1a 32-bit over UTF-16 code units, 8 hex chars. Cheap
//     enough to run per keystroke on a phone; strong enough to detect drift.
//
// Nothing here is authoritative persistence. The channel text is a mirror
// that dies with the process (or after `idleTtlMs`); the saved version
// remains the source of truth and clients re-seed from it.
//
// No module-level mutable state; the hub instance is created by index.js and
// injected into the route lib.

const DEFAULT_MAX_CHANNELS = 2_000;
const DEFAULT_IDLE_TTL_MS = 30 * 60_000;
const DEFAULT_MAX_TEXT_CHARS = 2_000_000;
const DEFAULT_MAX_SUBSCRIBERS_PER_CHANNEL = 8;
const DEFAULT_MAX_OPS_PER_SECOND_PER_DEVICE = 40;
const DEVICE_ID_MAX_CHARS = 96;
// Rate-limit entries are keyed by device id; a caller cycling ids must not
// grow a channel without bound.
const MAX_RATE_ENTRIES_PER_CHANNEL = 64;
const VERSION_ID_MAX_CHARS = 64;

function liveDraftChecksum(text) {
  const value = String(text ?? "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function cleanIdentifier(value, maxChars) {
  return String(value ?? "")
    .trim()
    .replace(/[^A-Za-z0-9._:-]/g, "")
    .slice(0, maxChars);
}

function normalizeLiveDraftDeviceId(value) {
  return cleanIdentifier(value, DEVICE_ID_MAX_CHARS);
}

function normalizeLiveDraftVersionId(value) {
  return cleanIdentifier(value, VERSION_ID_MAX_CHARS);
}

function nonNegativeInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) return null;
  return n;
}

// Accepts either snake_case (wire) or camelCase (internal) op shapes.
function normalizeLiveDraftOp(raw, { maxInsertChars = DEFAULT_MAX_TEXT_CHARS } = {}) {
  if (!raw || typeof raw !== "object") return null;
  const start = nonNegativeInt(raw.start);
  const deleteCount = nonNegativeInt(raw.delete_count ?? raw.deleteCount ?? 0);
  const insert = raw.insert == null ? "" : raw.insert;
  if (start == null || deleteCount == null) return null;
  if (typeof insert !== "string") return null;
  if (insert.length > maxInsertChars) return null;
  return { start, delete_count: deleteCount, insert };
}

function applyLiveDraftOp(text, op) {
  const source = String(text ?? "");
  const normalized = normalizeLiveDraftOp(op);
  if (!normalized) return null;
  const end = normalized.start + normalized.delete_count;
  if (normalized.start > source.length || end > source.length) return null;
  return source.slice(0, normalized.start) + normalized.insert + source.slice(end);
}

function isHighSurrogate(unit) {
  return unit >= 0xd800 && unit <= 0xdbff;
}

function isLowSurrogate(unit) {
  return unit >= 0xdc00 && unit <= 0xdfff;
}

// Minimal diff: common prefix / common suffix. Mirrors the Swift client so a
// test can round-trip an op produced on either side. Exposed for tests and
// for any server-side producer (none today).
function diffLiveDraft(previous, next) {
  const a = String(previous ?? "");
  const b = String(next ?? "");
  if (a === b) return null;
  let prefix = 0;
  const maxPrefix = Math.min(a.length, b.length);
  while (prefix < maxPrefix && a.charCodeAt(prefix) === b.charCodeAt(prefix)) prefix += 1;
  // Never split a surrogate pair: Swift cannot represent a lone surrogate in
  // a String, so an op that cut through one would decode differently on the
  // two sides and trip the checksum.
  if (prefix > 0 && isHighSurrogate(a.charCodeAt(prefix - 1))) prefix -= 1;
  let suffix = 0;
  const maxSuffix = maxPrefix - prefix;
  while (
    suffix < maxSuffix &&
    a.charCodeAt(a.length - 1 - suffix) === b.charCodeAt(b.length - 1 - suffix)
  ) {
    suffix += 1;
  }
  if (suffix > 0 && isLowSurrogate(a.charCodeAt(a.length - suffix))) suffix -= 1;
  return {
    start: prefix,
    delete_count: a.length - prefix - suffix,
    insert: b.slice(prefix, b.length - suffix),
  };
}

function createLiveDraftHub({
  now = () => Date.now(),
  maxChannels = DEFAULT_MAX_CHANNELS,
  idleTtlMs = DEFAULT_IDLE_TTL_MS,
  maxTextChars = DEFAULT_MAX_TEXT_CHARS,
  maxSubscribersPerChannel = DEFAULT_MAX_SUBSCRIBERS_PER_CHANNEL,
  maxOpsPerSecondPerDevice = DEFAULT_MAX_OPS_PER_SECOND_PER_DEVICE,
  logger = null,
} = {}) {
  // Map<channelKey, channel>. Insertion order doubles as LRU order: a touched
  // channel is deleted + re-inserted so the head is always the coldest.
  const channels = new Map();

  function channelKey(userId, projectId) {
    const user = String(userId || "").trim();
    const project = String(projectId || "").trim();
    if (!user || !project) return "";
    return `${user}${project}`;
  }

  function touch(channel) {
    channel.updatedAt = now();
    channels.delete(channel.key);
    channels.set(channel.key, channel);
  }

  function evictIfNeeded() {
    while (channels.size > maxChannels) {
      let victim = null;
      for (const candidate of channels.values()) {
        if (candidate.subscribers.size === 0) {
          victim = candidate;
          break;
        }
      }
      if (!victim) break;
      channels.delete(victim.key);
      logger?.warn?.(`[live_draft_hub] evicted idle channel key_hash=${liveDraftChecksum(victim.key)}`);
    }
  }

  function ensure(key, { seedText = "", seedVersionId = "" } = {}) {
    if (!key) return null;
    let channel = channels.get(key);
    if (channel) {
      touch(channel);
      return channel;
    }
    const text = String(seedText ?? "").slice(0, maxTextChars);
    channel = {
      key,
      seq: 0,
      text,
      checksum: liveDraftChecksum(text),
      versionId: normalizeLiveDraftVersionId(seedVersionId),
      seeded: true,
      createdAt: now(),
      updatedAt: now(),
      lastDeviceId: "",
      subscribers: new Map(), // subscriberId -> { deviceId, send }
      opRate: new Map(), // deviceId -> { tokens, lastMs }
      nextSubscriberId: 1,
    };
    channels.set(key, channel);
    evictIfNeeded();
    return channel;
  }

  function get(key) {
    return channels.get(key) || null;
  }

  function presencePayload(channel) {
    const devices = new Set();
    for (const sub of channel.subscribers.values()) {
      if (sub.deviceId) devices.add(sub.deviceId);
    }
    return { type: "presence", seq: channel.seq, devices: [...devices], ts: now() };
  }

  function broadcast(channel, event, { exceptSubscriberId = null } = {}) {
    for (const [subscriberId, sub] of channel.subscribers) {
      if (exceptSubscriberId != null && subscriberId === exceptSubscriberId) continue;
      try {
        sub.send(event);
      } catch (error) {
        logger?.warn?.(`[live_draft_hub] subscriber_send_failed err=${String(error?.message || error)}`);
      }
    }
  }

  function snapshot(key) {
    const channel = get(key);
    if (!channel) return null;
    return {
      seq: channel.seq,
      text: channel.text,
      checksum: channel.checksum,
      version_id: channel.versionId,
      seeded: channel.seeded,
      updated_at: channel.updatedAt,
      device_count: presencePayload(channel).devices.length,
    };
  }

  function allowOp(channel, deviceId) {
    const t = now();
    let entry = channel.opRate.get(deviceId);
    if (!entry) {
      entry = { tokens: maxOpsPerSecondPerDevice, lastMs: t };
      channel.opRate.set(deviceId, entry);
      while (channel.opRate.size > MAX_RATE_ENTRIES_PER_CHANNEL) {
        const oldest = channel.opRate.keys().next().value;
        if (oldest == null) break;
        channel.opRate.delete(oldest);
      }
    }
    const elapsed = Math.max(0, t - entry.lastMs);
    entry.tokens = Math.min(maxOpsPerSecondPerDevice, entry.tokens + (elapsed * maxOpsPerSecondPerDevice) / 1000);
    entry.lastMs = t;
    if (entry.tokens < 1) return false;
    entry.tokens -= 1;
    return true;
  }

  function rejection(channel, reason) {
    return {
      ok: false,
      reason,
      seq: channel.seq,
      checksum: channel.checksum,
      text: channel.text,
      version_id: channel.versionId,
    };
  }

  function applyOp(key, { deviceId, baseSeq, baseChecksum, op, checksum = "", cursor = null } = {}) {
    const channel = get(key);
    if (!channel) return { ok: false, reason: "channel_missing", seq: 0, checksum: "", text: "" };
    const device = normalizeLiveDraftDeviceId(deviceId);
    if (!device) return rejection(channel, "device_id_required");
    if (!allowOp(channel, device)) return rejection(channel, "rate_limited");
    const normalizedOp = normalizeLiveDraftOp(op, { maxInsertChars: maxTextChars });
    if (!normalizedOp) return rejection(channel, "bad_op");
    const base = nonNegativeInt(baseSeq);
    if (base == null || base !== channel.seq) return rejection(channel, "stale_base");
    if (baseChecksum && String(baseChecksum) !== channel.checksum) return rejection(channel, "checksum_mismatch");
    const nextText = applyLiveDraftOp(channel.text, normalizedOp);
    if (nextText == null) return rejection(channel, "bad_op");
    if (nextText.length > maxTextChars) return rejection(channel, "text_too_large");
    const nextChecksum = liveDraftChecksum(nextText);
    if (checksum && String(checksum) !== nextChecksum) return rejection(channel, "checksum_mismatch");

    channel.seq += 1;
    channel.text = nextText;
    channel.checksum = nextChecksum;
    channel.seeded = false;
    channel.lastDeviceId = device;
    touch(channel);
    const event = {
      type: "op",
      seq: channel.seq,
      device_id: device,
      op: normalizedOp,
      checksum: nextChecksum,
      cursor: cursor == null ? null : nonNegativeInt(cursor),
      ts: channel.updatedAt,
    };
    broadcast(channel, event);
    return { ok: true, seq: channel.seq, checksum: nextChecksum, event };
  }

  function replaceText(key, { deviceId, text, versionId = "" } = {}) {
    const channel = get(key);
    if (!channel) return { ok: false, reason: "channel_missing", seq: 0, checksum: "", text: "" };
    const device = normalizeLiveDraftDeviceId(deviceId);
    if (!device) return rejection(channel, "device_id_required");
    if (typeof text !== "string") return rejection(channel, "text_required");
    if (text.length > maxTextChars) return rejection(channel, "text_too_large");
    if (!allowOp(channel, device)) return rejection(channel, "rate_limited");
    const nextChecksum = liveDraftChecksum(text);
    const version = normalizeLiveDraftVersionId(versionId);
    const unchanged = text === channel.text;
    if (!unchanged) {
      channel.seq += 1;
      channel.text = text;
      channel.checksum = nextChecksum;
    }
    if (version) channel.versionId = version;
    channel.seeded = false;
    channel.lastDeviceId = device;
    touch(channel);
    const event = {
      type: "snapshot",
      seq: channel.seq,
      device_id: device,
      text,
      checksum: nextChecksum,
      version_id: channel.versionId,
      ts: channel.updatedAt,
    };
    if (!unchanged) broadcast(channel, event);
    return { ok: true, seq: channel.seq, checksum: nextChecksum, unchanged, event };
  }

  function announceVersion(key, { deviceId, versionId, checksum = "" } = {}) {
    const channel = get(key);
    if (!channel) return { ok: false, reason: "channel_missing", seq: 0, checksum: "", text: "" };
    const device = normalizeLiveDraftDeviceId(deviceId);
    if (!device) return rejection(channel, "device_id_required");
    const version = normalizeLiveDraftVersionId(versionId);
    if (!version) return rejection(channel, "version_id_required");
    // A version announcement is only meaningful for the text the channel
    // currently mirrors. A stale announcement is dropped, not broadcast.
    if (checksum && String(checksum) !== channel.checksum) return rejection(channel, "checksum_mismatch");
    channel.versionId = version;
    touch(channel);
    const event = {
      type: "version",
      seq: channel.seq,
      device_id: device,
      version_id: version,
      checksum: channel.checksum,
      ts: channel.updatedAt,
    };
    broadcast(channel, event);
    return { ok: true, seq: channel.seq, checksum: channel.checksum, event };
  }

  function subscribe(key, { deviceId, send } = {}) {
    const channel = get(key);
    if (!channel) return null;
    if (typeof send !== "function") return null;
    if (channel.subscribers.size >= maxSubscribersPerChannel) return null;
    const device = normalizeLiveDraftDeviceId(deviceId);
    const subscriberId = channel.nextSubscriberId;
    channel.nextSubscriberId += 1;
    channel.subscribers.set(subscriberId, { deviceId: device, send });
    touch(channel);
    broadcast(channel, presencePayload(channel));
    let active = true;
    return function unsubscribe() {
      if (!active) return;
      active = false;
      const current = channels.get(key);
      if (!current) return;
      current.subscribers.delete(subscriberId);
      current.updatedAt = now();
      broadcast(current, presencePayload(current));
    };
  }

  function sweep() {
    const t = now();
    let removed = 0;
    for (const channel of [...channels.values()]) {
      if (channel.subscribers.size > 0) continue;
      if (t - channel.updatedAt < idleTtlMs) continue;
      channels.delete(channel.key);
      removed += 1;
    }
    return removed;
  }

  function closeAll() {
    let closed = 0;
    for (const channel of channels.values()) {
      for (const sub of channel.subscribers.values()) {
        try {
          sub.send({ type: "bye", seq: channel.seq, ts: now() });
        } catch (_error) {
          // The subscriber is already gone; nothing to do.
        }
        closed += 1;
      }
      channel.subscribers.clear();
    }
    channels.clear();
    return closed;
  }

  function stats() {
    let subscribers = 0;
    for (const channel of channels.values()) subscribers += channel.subscribers.size;
    return { channels: channels.size, subscribers };
  }

  return {
    channelKey,
    ensure,
    has: (key) => channels.has(key),
    snapshot,
    applyOp,
    replaceText,
    announceVersion,
    subscribe,
    presence: (key) => {
      const channel = get(key);
      return channel ? presencePayload(channel) : null;
    },
    sweep,
    closeAll,
    stats,
  };
}

export {
  MAX_RATE_ENTRIES_PER_CHANNEL,
  DEFAULT_IDLE_TTL_MS,
  DEFAULT_MAX_CHANNELS,
  DEFAULT_MAX_SUBSCRIBERS_PER_CHANNEL,
  DEFAULT_MAX_TEXT_CHARS,
  applyLiveDraftOp,
  createLiveDraftHub,
  diffLiveDraft,
  liveDraftChecksum,
  normalizeLiveDraftDeviceId,
  normalizeLiveDraftOp,
  normalizeLiveDraftVersionId,
};
