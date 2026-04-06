import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

function nowMs() {
  return Date.now();
}

function normalizeJson(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return fallback;
  }
}

function toPositiveInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function safeString(value, max = 320) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text.length <= max ? text : text.slice(0, max);
}

function toStatus(value, fallback = "pending") {
  const v = String(value || "").trim().toLowerCase();
  if (v === "pending" || v === "completed" || v === "failed") return v;
  return fallback;
}

class FileOutboxStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.items = [];
    this.loaded = false;
  }

  load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      if (!fs.existsSync(this.filePath)) {
        this.items = [];
        return;
      }
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed?.items) ? parsed.items : [];
      this.items = list
        .filter((x) => x && typeof x === "object")
        .map((item) => ({
          id: safeString(item.id, 80) || randomUUID(),
          type: safeString(item.type, 64) || "unknown",
          actionKey: safeString(item.actionKey, 180),
          status: toStatus(item.status),
          attempts: Math.max(0, Number(item.attempts || 0)),
          createdAt: Math.max(0, Number(item.createdAt || 0)),
          updatedAt: Math.max(0, Number(item.updatedAt || 0)),
          nextAttemptAt: Math.max(0, Number(item.nextAttemptAt || 0)),
          payload: normalizeJson(item.payload, {}),
          result: normalizeJson(item.result, {}),
          lastError: safeString(item.lastError, 640),
        }));
    } catch (_) {
      this.items = [];
    }
  }

  save() {
    const dir = path.dirname(this.filePath);
    const tmp = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      tmp,
      `${JSON.stringify({ version: 1, updatedAt: nowMs(), items: this.items }, null, 2)}\n`,
      "utf8"
    );
    fs.renameSync(tmp, this.filePath);
  }

  list({ status = "all", limit = 80 } = {}) {
    this.load();
    const normalizedStatus = String(status || "all").trim().toLowerCase();
    const max = Math.max(1, Math.min(500, Number(limit || 80)));
    const rows = this.items
      .filter((item) => normalizedStatus === "all" || item.status === normalizedStatus)
      .sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0));
    return rows.slice(0, max).map((x) => ({ ...x }));
  }

  enqueue(input = {}) {
    this.load();
    const now = nowMs();
    const actionKey = safeString(input.actionKey, 180);
    if (actionKey) {
      const existing = this.items.find((x) => String(x.actionKey || "") === actionKey);
      if (existing) return { ...existing, duplicate: true };
    }
    const row = {
      id: safeString(input.id, 80) || randomUUID(),
      type: safeString(input.type, 64) || "unknown",
      actionKey,
      status: toStatus(input.status, "pending"),
      attempts: Math.max(0, Number(input.attempts || 0)),
      createdAt: Math.max(0, Number(input.createdAt || now)),
      updatedAt: Math.max(0, Number(input.updatedAt || now)),
      nextAttemptAt: Math.max(0, Number(input.nextAttemptAt || now)),
      payload: normalizeJson(input.payload, {}),
      result: normalizeJson(input.result, {}),
      lastError: safeString(input.lastError, 640),
    };
    this.items.push(row);
    if (this.items.length > 5000) {
      this.items = this.items
        .sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0))
        .slice(0, 5000);
    }
    this.save();
    return { ...row, duplicate: false };
  }

  update(id, patch = {}) {
    this.load();
    const key = safeString(id, 80);
    const idx = this.items.findIndex((x) => String(x.id || "") === key);
    if (idx < 0) return null;
    const current = this.items[idx];
    const updated = {
      ...current,
      status: patch.status ? toStatus(patch.status, current.status) : current.status,
      attempts: patch.attempts == null ? current.attempts : Math.max(0, Number(patch.attempts || 0)),
      updatedAt: patch.updatedAt == null ? nowMs() : Math.max(0, Number(patch.updatedAt || nowMs())),
      nextAttemptAt: patch.nextAttemptAt == null
        ? current.nextAttemptAt
        : Math.max(0, Number(patch.nextAttemptAt || 0)),
      result: patch.result == null ? current.result : normalizeJson(patch.result, {}),
      payload: patch.payload == null ? current.payload : normalizeJson(patch.payload, {}),
      lastError: patch.lastError == null ? current.lastError : safeString(patch.lastError, 640),
    };
    this.items[idx] = updated;
    this.save();
    return { ...updated };
  }

  claimDue(limit = 20, now = nowMs()) {
    this.load();
    const max = Math.max(1, Math.min(200, Number(limit || 20)));
    const due = this.items
      .filter((x) => x.status === "pending" && Number(x.nextAttemptAt || 0) <= now)
      .sort((a, b) => Number(a.nextAttemptAt || 0) - Number(b.nextAttemptAt || 0))
      .slice(0, max)
      .map((x) => ({ ...x }));
    return due;
  }
}

export async function createScaleBackplane({
  redisUrl = "",
  postgresUrl = "",
  outboxFilePath = "",
  logger = console,
} = {}) {
  const state = {
    redis: null,
    pg: null,
    redisEnabled: false,
    postgresEnabled: false,
    outbox: new FileOutboxStore(outboxFilePath || path.resolve(process.cwd(), "outbox_store.json")),
  };

  async function initRedis() {
    const url = String(redisUrl || "").trim();
    if (!url) return false;
    try {
      const mod = await import("redis");
      const client = mod?.createClient ? mod.createClient({ url }) : null;
      if (!client) return false;
      client.on("error", (err) => {
        logger?.log?.(`[scale_backplane] redis_error=${String(err?.message || err)}`);
      });
      await client.connect();
      state.redis = client;
      state.redisEnabled = true;
      logger?.log?.("[scale_backplane] redis_enabled=1");
      return true;
    } catch (err) {
      logger?.log?.(`[scale_backplane] redis_disabled reason=${String(err?.message || err)}`);
      return false;
    }
  }

  async function initPostgres() {
    const url = String(postgresUrl || "").trim();
    if (!url) return false;
    try {
      const mod = await import("pg");
      const Pool = mod?.Pool;
      if (!Pool) return false;
      const pool = new Pool({ connectionString: url, max: 6, idleTimeoutMillis: 20_000 });
      await pool.query(`
        create table if not exists user_memory_state (
          ip text primary key,
          updated_at bigint not null,
          client_tokens jsonb not null,
          memory jsonb not null
        );
      `);
      await pool.query(`
        create table if not exists outbox_actions (
          id text primary key,
          action_key text unique,
          action_type text not null,
          status text not null,
          attempts int not null default 0,
          created_at bigint not null,
          updated_at bigint not null,
          next_attempt_at bigint not null,
          payload jsonb not null,
          result jsonb,
          last_error text
        );
      `);
      await pool.query(`
        create table if not exists talk_commit_events (
          id text primary key,
          session_id text,
          turn_id text,
          state_version text,
          status_code int,
          total_ms int,
          stt_ms int,
          llm_ms int,
          tts_ms int,
          created_at bigint not null,
          payload jsonb
        );
      `);
      state.pg = pool;
      state.postgresEnabled = true;
      logger?.log?.("[scale_backplane] postgres_enabled=1");
      return true;
    } catch (err) {
      logger?.log?.(`[scale_backplane] postgres_disabled reason=${String(err?.message || err)}`);
      return false;
    }
  }

  async function init() {
    await Promise.all([initRedis(), initPostgres()]);
    state.outbox.load();
  }

  async function close() {
    if (state.redis) {
      try { await state.redis.quit(); } catch (_) {}
      state.redis = null;
    }
    if (state.pg) {
      try { await state.pg.end(); } catch (_) {}
      state.pg = null;
    }
  }

  async function upsertUserMemory({ ip, updatedAt, clientTokens, memory }) {
    const key = safeString(ip, 128);
    if (!key) return;
    if (!state.postgresEnabled || !state.pg) return;
    try {
      await state.pg.query(
        `insert into user_memory_state (ip, updated_at, client_tokens, memory)
         values ($1, $2, $3::jsonb, $4::jsonb)
         on conflict (ip) do update
         set updated_at = excluded.updated_at,
             client_tokens = excluded.client_tokens,
             memory = excluded.memory`,
        [
          key,
          Math.max(0, Number(updatedAt || nowMs())),
          JSON.stringify(Array.isArray(clientTokens) ? clientTokens : []),
          JSON.stringify(memory && typeof memory === "object" ? memory : {}),
        ]
      );
    } catch (err) {
      logger?.log?.(`[scale_backplane] user_memory_upsert_error ip=${key} err=${String(err?.message || err)}`);
    }
  }

  async function loadAllUserMemory() {
    if (!state.postgresEnabled || !state.pg) return [];
    try {
      const res = await state.pg.query(
        `select ip, updated_at, client_tokens, memory from user_memory_state`
      );
      return (Array.isArray(res?.rows) ? res.rows : []).map((row) => ({
        ip: safeString(row.ip, 128),
        updatedAt: Math.max(0, Number(row.updated_at || 0)),
        clientTokens: Array.isArray(row.client_tokens) ? row.client_tokens : [],
        memory: row.memory && typeof row.memory === "object" ? row.memory : {},
      }));
    } catch (err) {
      logger?.log?.(`[scale_backplane] user_memory_load_error err=${String(err?.message || err)}`);
      return [];
    }
  }

  async function enqueueOutbox(input = {}) {
    const now = nowMs();
    const row = state.outbox.enqueue({
      id: safeString(input.id, 80) || randomUUID(),
      type: safeString(input.type, 64) || "unknown",
      actionKey: safeString(input.actionKey, 180),
      status: toStatus(input.status, "pending"),
      attempts: Math.max(0, Number(input.attempts || 0)),
      createdAt: Math.max(0, Number(input.createdAt || now)),
      updatedAt: Math.max(0, Number(input.updatedAt || now)),
      nextAttemptAt: Math.max(0, Number(input.nextAttemptAt || now)),
      payload: normalizeJson(input.payload, {}),
      result: normalizeJson(input.result, {}),
      lastError: safeString(input.lastError, 640),
    });
    if (state.postgresEnabled && state.pg) {
      try {
        await state.pg.query(
          `insert into outbox_actions (id, action_key, action_type, status, attempts, created_at, updated_at, next_attempt_at, payload, result, last_error)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11)
           on conflict (id) do update set
             action_key = excluded.action_key,
             action_type = excluded.action_type,
             status = excluded.status,
             attempts = excluded.attempts,
             updated_at = excluded.updated_at,
             next_attempt_at = excluded.next_attempt_at,
             payload = excluded.payload,
             result = excluded.result,
             last_error = excluded.last_error`,
          [
            row.id,
            row.actionKey || null,
            row.type,
            row.status,
            row.attempts,
            row.createdAt,
            row.updatedAt,
            row.nextAttemptAt,
            JSON.stringify(row.payload || {}),
            JSON.stringify(row.result || {}),
            row.lastError || null,
          ]
        );
      } catch (err) {
        logger?.log?.(`[scale_backplane] outbox_enqueue_pg_error id=${row.id} err=${String(err?.message || err)}`);
      }
    }
    return row;
  }

  async function updateOutbox(id, patch = {}) {
    const updated = state.outbox.update(id, patch);
    if (!updated) return null;
    if (state.postgresEnabled && state.pg) {
      try {
        await state.pg.query(
          `update outbox_actions
             set status = $2,
                 attempts = $3,
                 updated_at = $4,
                 next_attempt_at = $5,
                 payload = $6::jsonb,
                 result = $7::jsonb,
                 last_error = $8
           where id = $1`,
          [
            updated.id,
            updated.status,
            updated.attempts,
            updated.updatedAt,
            updated.nextAttemptAt,
            JSON.stringify(updated.payload || {}),
            JSON.stringify(updated.result || {}),
            updated.lastError || null,
          ]
        );
      } catch (err) {
        logger?.log?.(`[scale_backplane] outbox_update_pg_error id=${updated.id} err=${String(err?.message || err)}`);
      }
    }
    return updated;
  }

  async function listOutbox({ status = "all", limit = 80 } = {}) {
    return state.outbox.list({ status, limit });
  }

  async function claimDueOutbox(limit = 20) {
    return state.outbox.claimDue(limit, nowMs());
  }

  async function emitTalkCommit(event = {}) {
    if (state.redisEnabled && state.redis) {
      try {
        const streamKey = "them:talk:commits";
        const payload = JSON.stringify(event && typeof event === "object" ? event : {});
        await state.redis.xAdd(streamKey, "*", { payload });
      } catch (err) {
        logger?.log?.(`[scale_backplane] talk_commit_redis_error err=${String(err?.message || err)}`);
      }
    }
    if (state.postgresEnabled && state.pg) {
      try {
        const id = safeString(event.id, 80) || randomUUID();
        await state.pg.query(
          `insert into talk_commit_events (id, session_id, turn_id, state_version, status_code, total_ms, stt_ms, llm_ms, tts_ms, created_at, payload)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
           on conflict (id) do nothing`,
          [
            id,
            safeString(event.sessionId, 120) || null,
            safeString(event.turnId, 120) || null,
            safeString(event.stateVersion, 120) || null,
            Math.max(0, Number(event.statusCode || 0)),
            Math.max(0, Number(event.totalMs || 0)),
            Math.max(0, Number(event.sttMs || 0)),
            Math.max(0, Number(event.llmMs || 0)),
            Math.max(0, Number(event.ttsMs || 0)),
            Math.max(0, Number(event.createdAt || nowMs())),
            JSON.stringify(event && typeof event === "object" ? event : {}),
          ]
        );
      } catch (err) {
        logger?.log?.(`[scale_backplane] talk_commit_pg_error err=${String(err?.message || err)}`);
      }
    }
  }

  async function acquireSessionLock(sessionKey, ownerId, ttlMs = 45_000) {
    const key = safeString(sessionKey, 220);
    const owner = safeString(ownerId, 80) || randomUUID();
    const ttl = Math.max(1_000, Number(ttlMs || 45_000));
    if (state.redisEnabled && state.redis) {
      try {
        const lockKey = `them:talk:lock:${key}`;
        const result = await state.redis.set(lockKey, owner, { NX: true, PX: ttl });
        return { ok: result === "OK", owner };
      } catch (err) {
        logger?.log?.(`[scale_backplane] redis_lock_acquire_error key=${key} err=${String(err?.message || err)}`);
      }
    }
    return { ok: true, owner };
  }

  async function getIdempotency(cacheKey) {
    const key = safeString(cacheKey, 320);
    if (!key) return null;
    if (state.redisEnabled && state.redis) {
      try {
        const redisKey = `them:talk:idemp:${key}`;
        const raw = await state.redis.get(redisKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : null;
      } catch (err) {
        logger?.log?.(`[scale_backplane] idempotency_get_error key=${key} err=${String(err?.message || err)}`);
      }
    }
    return null;
  }

  async function setIdempotency(cacheKey, value, ttlMs = 300_000) {
    const key = safeString(cacheKey, 320);
    if (!key) return;
    if (state.redisEnabled && state.redis) {
      try {
        const redisKey = `them:talk:idemp:${key}`;
        const payload = JSON.stringify(value && typeof value === "object" ? value : {});
        await state.redis.set(redisKey, payload, { PX: Math.max(1_000, Number(ttlMs || 300_000)) });
      } catch (err) {
        logger?.log?.(`[scale_backplane] idempotency_set_error key=${key} err=${String(err?.message || err)}`);
      }
    }
  }

  async function deleteIdempotency(cacheKey) {
    const key = safeString(cacheKey, 320);
    if (!key) return;
    if (state.redisEnabled && state.redis) {
      try {
        const redisKey = `them:talk:idemp:${key}`;
        await state.redis.del(redisKey);
      } catch (err) {
        logger?.log?.(`[scale_backplane] idempotency_delete_error key=${key} err=${String(err?.message || err)}`);
      }
    }
  }

  async function releaseSessionLock(sessionKey, ownerId) {
    const key = safeString(sessionKey, 220);
    const owner = safeString(ownerId, 80);
    if (!key || !owner) return;
    if (state.redisEnabled && state.redis) {
      const lockKey = `them:talk:lock:${key}`;
      try {
        const current = await state.redis.get(lockKey);
        if (current && current === owner) {
          await state.redis.del(lockKey);
        }
      } catch (err) {
        logger?.log?.(`[scale_backplane] redis_lock_release_error key=${key} err=${String(err?.message || err)}`);
      }
    }
  }

  return {
    init,
    close,
    upsertUserMemory,
    loadAllUserMemory,
    enqueueOutbox,
    updateOutbox,
    listOutbox,
    claimDueOutbox,
    getIdempotency,
    setIdempotency,
    deleteIdempotency,
    emitTalkCommit,
    acquireSessionLock,
    releaseSessionLock,
    status() {
      return {
        redisEnabled: state.redisEnabled,
        postgresEnabled: state.postgresEnabled,
        outboxItems: state.outbox.list({ status: "all", limit: 1_000_000 }).length,
      };
    },
  };
}
