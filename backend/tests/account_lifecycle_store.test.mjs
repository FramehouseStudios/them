import test from "node:test";
import assert from "node:assert/strict";

import { createAccountLifecycleStore } from "../lib/account_lifecycle_store.js";

// Minimal in-memory pg-shaped fake. Implements just enough of the
// SQL surface this store uses, matched by substring on the query
// text. Mirrors the testing approach used elsewhere for the
// Postgres adapter.
function makeFakeClient({ failAtomicAuditEvent = null } = {}) {
  const lifecycle = new Map(); // user_id -> row
  const audit = [];
  return {
    audit,
    lifecycle,
    async query(sql, params = []) {
      const q = sql.replace(/\s+/g, " ").trim();
      if (q.startsWith("INSERT INTO account_audit_log")) {
        audit.push({
          user_id: params[0],
          event: params[1],
          request_id: params[2],
          actor_ip: params[3],
          metadata: JSON.parse(params[4]),
        });
        return { rowCount: 1, rows: [] };
      }
      if (q.startsWith("SELECT user_id, pending_deletion_at")) {
        const row = lifecycle.get(params[0]);
        return { rows: row ? [row] : [] };
      }
      if (q.startsWith("WITH lifecycle_write AS")) {
        const nextRow = {
          user_id: params[0],
          pending_deletion_at: params[1],
          hard_delete_at: params[2],
          reason: params[3],
        };
        const nextAudit = {
          user_id: params[0],
          event: params[4],
          request_id: null,
          actor_ip: null,
          metadata: JSON.parse(params[5]),
        };
        if (nextAudit.event === failAtomicAuditEvent) {
          throw new Error("simulated atomic statement failure");
        }
        lifecycle.set(params[0], nextRow);
        audit.push(nextAudit);
        return { rowCount: 1, rows: [] };
      }
      if (q.startsWith("WITH lifecycle_clear AS")) {
        const row = lifecycle.get(params[0]);
        if (row && row.pending_deletion_at) {
          if (params[1] === failAtomicAuditEvent) {
            throw new Error("simulated atomic statement failure");
          }
          row.pending_deletion_at = null;
          row.hard_delete_at = null;
          row.reason = null;
          audit.push({
            user_id: params[0],
            event: params[1],
            request_id: null,
            actor_ip: null,
            metadata: JSON.parse(params[2]),
          });
          return { rowCount: 1, rows: [{ user_id: params[0] }] };
        }
        return { rowCount: 0, rows: [] };
      }
      if (q.startsWith("SELECT user_id FROM account_lifecycle")) {
        const cutoff = params[0];
        const due = [...lifecycle.values()]
          .filter((r) => r.hard_delete_at && r.hard_delete_at <= cutoff)
          .map((r) => ({ user_id: r.user_id }));
        return { rows: due };
      }
      if (q.startsWith("DELETE FROM account_lifecycle")) {
        lifecycle.delete(params[0]);
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`unexpected query in fake: ${q}`);
    },
  };
}

test("[lifecycle] requires a pg-style client", () => {
  assert.throws(() => createAccountLifecycleStore({}), /requires a pg-style client/);
});

test("[lifecycle] markPendingDeletion writes row + audit", async () => {
  const client = makeFakeClient();
  const store = createAccountLifecycleStore({ client });
  await store.markPendingDeletion({
    userId: "alice",
    pendingDeletionAt: 1_000_000,
    hardDeleteAt: 1_000_000 + 7 * 86400000,
    reason: "trying it out",
  });
  const row = client.lifecycle.get("alice");
  assert.ok(row);
  assert.equal(row.reason, "trying it out");
  assert.equal(client.audit.length, 1);
  assert.equal(client.audit[0].event, "account_deletion_requested");
});

test("[lifecycle] failed deletion audit leaves no pending lifecycle row", async () => {
  const client = makeFakeClient({ failAtomicAuditEvent: "account_deletion_requested" });
  const store = createAccountLifecycleStore({ client });

  await assert.rejects(
    () => store.markPendingDeletion({
      userId: "atomic-mark",
      pendingDeletionAt: 1_000_000,
      hardDeleteAt: 2_000_000,
    }),
    /simulated atomic statement failure/
  );

  assert.equal(client.lifecycle.has("atomic-mark"), false);
  assert.equal(client.audit.length, 0);
});

test("[lifecycle] read round-trips timestamps to epoch ms", async () => {
  const client = makeFakeClient();
  const store = createAccountLifecycleStore({ client });
  const pending = Date.UTC(2026, 4, 1);
  const hard = Date.UTC(2026, 4, 8);
  await store.markPendingDeletion({
    userId: "bob", pendingDeletionAt: pending, hardDeleteAt: hard,
  });
  const got = await store.read("bob");
  assert.equal(got.userId, "bob");
  assert.equal(got.pendingDeletionAt, pending);
  assert.equal(got.hardDeleteAt, hard);
});

test("[lifecycle] read returns null for unknown user", async () => {
  const store = createAccountLifecycleStore({ client: makeFakeClient() });
  assert.equal(await store.read("nobody"), null);
});

test("[lifecycle] clearPendingDeletion is idempotent + audits only on change", async () => {
  const client = makeFakeClient();
  const store = createAccountLifecycleStore({ client });
  await store.markPendingDeletion({
    userId: "carol", pendingDeletionAt: 1_000, hardDeleteAt: 2_000,
  });
  const first = await store.clearPendingDeletion("carol");
  const second = await store.clearPendingDeletion("carol");
  assert.equal(first, true);
  assert.equal(second, false, "no-op when nothing pending");
  const events = client.audit.map((a) => a.event);
  assert.deepEqual(events, ["account_deletion_requested", "account_deletion_cancelled"]);
});

test("[lifecycle] failed cancellation audit preserves pending lifecycle row", async () => {
  const client = makeFakeClient();
  const store = createAccountLifecycleStore({ client });
  await store.markPendingDeletion({
    userId: "atomic-clear", pendingDeletionAt: 1_000, hardDeleteAt: 2_000,
  });
  const failingClient = makeFakeClient({ failAtomicAuditEvent: "account_deletion_cancelled" });
  failingClient.lifecycle.set("atomic-clear", { ...client.lifecycle.get("atomic-clear") });
  failingClient.audit.push(...client.audit);
  const failingStore = createAccountLifecycleStore({ client: failingClient });

  await assert.rejects(
    () => failingStore.clearPendingDeletion("atomic-clear"),
    /simulated atomic statement failure/
  );

  assert.equal(failingClient.lifecycle.get("atomic-clear").pending_deletion_at, new Date(1_000).toISOString());
  assert.deepEqual(
    failingClient.audit.map((entry) => entry.event),
    ["account_deletion_requested"]
  );
});

test("[lifecycle] listDueForHardDelete returns only elapsed windows", async () => {
  let nowMs = Date.UTC(2026, 4, 15);
  const client = makeFakeClient();
  const store = createAccountLifecycleStore({ client, now: () => nowMs });
  await store.markPendingDeletion({
    userId: "due", pendingDeletionAt: Date.UTC(2026, 4, 1), hardDeleteAt: Date.UTC(2026, 4, 8),
  });
  await store.markPendingDeletion({
    userId: "notyet", pendingDeletionAt: Date.UTC(2026, 4, 14), hardDeleteAt: Date.UTC(2026, 4, 21),
  });
  const due = await store.listDueForHardDelete();
  assert.deepEqual(due, ["due"]);
});

test("[lifecycle] finalizeHardDelete audits then removes the row", async () => {
  const client = makeFakeClient();
  const store = createAccountLifecycleStore({ client });
  await store.markPendingDeletion({
    userId: "gone", pendingDeletionAt: 1, hardDeleteAt: 2,
  });
  await store.finalizeHardDelete("gone");
  assert.equal(client.lifecycle.has("gone"), false);
  assert.equal(client.audit.at(-1).event, "account_hard_deleted");
});

test("[lifecycle] audit rejects unknown events", async () => {
  const store = createAccountLifecycleStore({ client: makeFakeClient() });
  await assert.rejects(
    () => store.audit({ userId: "x", event: "not_a_real_event" }),
    /unknown account_audit_log event/
  );
});
