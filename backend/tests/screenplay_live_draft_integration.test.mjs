// T-live-draft-sync — spawned-backend proof of the live typing channel.
//
// Runs against the real index.js (auth middleware, owner records, mounts):
// Alice's Mac keystrokes reach Alice's phone stream through a JWT-protected
// SSE channel, Bob cannot read or publish into Alice's channel, and an
// unauthenticated caller is refused before any owner record is touched.

import assert from "node:assert/strict";
import { test } from "node:test";

import { apiRequest, startBackend } from "./helpers/backend_test_server.mjs";
import { diffLiveDraft, liveDraftChecksum } from "../lib/live_draft_hub.js";

const PASSWORD = "live-draft-password-123";

async function signup(server, email) {
  const response = await apiRequest(server, "/auth/signup", {
    method: "POST",
    json: { email, password: PASSWORD },
  });
  assert.equal(response.status, 201, `${email} signup`);
  const token = String(response.json?.token || response.json?.access_token || "");
  const userId = String(response.json?.user?.user_id || "");
  assert.ok(token.length > 20, `${email} access token`);
  return { email, token, userId };
}

function authHeaders(user, extra = {}) {
  return { Authorization: `Bearer ${user.token}`, ...extra };
}

// Minimal SSE consumer over the real HTTP server.
async function openStream(server, user, pathname) {
  const controller = new AbortController();
  const response = await fetch(server.baseUrl + pathname, {
    headers: { "X-APP-TOKEN": server.env.APP_TOKEN, ...authHeaders(user) },
    signal: controller.signal,
  });
  const events = [];
  const waiters = [];
  if (response.status === 200) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buffer.indexOf("\n\n")) >= 0) {
            const frame = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            let type = "message";
            let data = "";
            for (const line of frame.split("\n")) {
              if (line.startsWith("event:")) type = line.slice(6).trim();
              else if (line.startsWith("data:")) data += line.slice(5).trim();
            }
            if (!data) continue;
            const event = { type, ...JSON.parse(data) };
            events.push(event);
            for (const waiter of [...waiters]) {
              if (waiter.type === event.type && waiter.where(event)) {
                waiters.splice(waiters.indexOf(waiter), 1);
                waiter.resolve(event);
              }
            }
          }
        }
      } catch (_error) {
        // aborted at teardown
      }
    })();
  }
  return {
    status: response.status,
    events,
    close: () => controller.abort(),
    next(type, where = () => true, timeoutMs = 3_000) {
      const existing = events.find((e) => e.type === type && !e._consumed && where(e));
      if (existing) {
        existing._consumed = true;
        return Promise.resolve(existing);
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeoutMs);
        waiters.push({ type, where, resolve: (e) => { clearTimeout(timer); e._consumed = true; resolve(e); } });
      });
    },
  };
}

test("[live-draft-e2e] Mac keystrokes reach the phone; other users and anonymous callers are refused", async () => {
  const server = await startBackend();
  const streams = [];
  try {
    const alice = await signup(server, "alice-live-draft@example.com");
    const bob = await signup(server, "bob-live-draft@example.com");

    const created = await apiRequest(server, "/screenplay/projects", {
      method: "POST",
      headers: authHeaders(alice),
      json: { title: "Live Draft Feature" },
    });
    assert.equal(created.status, 201);
    const projectId = String(created.json?.project_id || created.json?.project?.id || "");
    assert.ok(projectId);

    const savedDraft = "FADE IN:\n\nINT. ROOM - DAY\n\nMara waits.";
    const saved = await apiRequest(server, `/screenplay/projects/${projectId}/version`, {
      method: "POST",
      headers: authHeaders(alice),
      json: { draft: savedDraft },
    });
    assert.equal(saved.status, 201, saved.text);
    const savedVersionId = String(saved.json?.version_id || "");
    assert.ok(savedVersionId);

    // Phone opens the channel first: it is seeded from the saved version.
    const phone = await openStream(server, alice, `/screenplay/projects/${projectId}/live/stream?device_id=ios-phone`);
    streams.push(phone);
    assert.equal(phone.status, 200);
    const hello = await phone.next("hello");
    assert.equal(hello.seq, 0);
    assert.equal(hello.seeded, true);
    assert.equal(hello.text, savedDraft);
    assert.equal(hello.version_id, savedVersionId);

    // Mac types " She leaves." one keystroke at a time. Each entry is the
    // mirror state the next keystroke builds on.
    const typed = [{ text: savedDraft, seq: 0 }];
    for (const keystroke of [" ", "S", "h", "e", " ", "l", "e", "a", "v", "e", "s", "."]) {
      const base = typed.at(-1);
      const next = base.text + keystroke;
      const op = diffLiveDraft(base.text, next);
      const posted = await apiRequest(server, `/screenplay/projects/${projectId}/live/ops`, {
        method: "POST",
        headers: authHeaders(alice),
        json: {
          device_id: "mac-desk",
          base_seq: base.seq,
          base_checksum: liveDraftChecksum(base.text),
          op,
          checksum: liveDraftChecksum(next),
        },
      });
      assert.equal(posted.status, 200, posted.text);
      assert.equal(posted.json.seq, base.seq + 1);
      typed.push({ text: next, seq: posted.json.seq });
      const received = await phone.next("op", (e) => e.seq === posted.json.seq);
      assert.equal(received.device_id, "mac-desk");
      assert.deepEqual(received.op, op);
      assert.equal(received.checksum, liveDraftChecksum(next));
    }
    const { text, seq } = typed.at(-1);
    assert.equal(text, `${savedDraft} She leaves.`);

    // Mac's autosave lands; the phone learns the version id without saving.
    const nextSave = await apiRequest(server, `/screenplay/projects/${projectId}/version`, {
      method: "POST",
      headers: authHeaders(alice),
      json: { draft: text, base_version_id: savedVersionId },
    });
    assert.equal(nextSave.status, 201, nextSave.text);
    const announced = await apiRequest(server, `/screenplay/projects/${projectId}/live/version`, {
      method: "POST",
      headers: authHeaders(alice),
      json: { device_id: "mac-desk", version_id: nextSave.json.version_id, checksum: liveDraftChecksum(text) },
    });
    assert.equal(announced.status, 200, announced.text);
    const versionEvent = await phone.next("version");
    assert.equal(versionEvent.version_id, nextSave.json.version_id);
    assert.equal(versionEvent.device_id, "mac-desk");

    // Bob holds a real session and Alice's ids; nothing crosses the boundary.
    const bobSpoof = authHeaders(bob, { "X-User-Id": alice.userId });
    const bobSnapshot = await apiRequest(server, `/screenplay/projects/${projectId}/live/snapshot`, { headers: bobSpoof });
    assert.equal(bobSnapshot.status, 404);
    assert.equal(bobSnapshot.json?.error, "project_not_found");
    assert.ok(!bobSnapshot.text.includes("Mara"), "Bob snapshot leaked draft text");
    const bobOp = await apiRequest(server, `/screenplay/projects/${projectId}/live/ops`, {
      method: "POST",
      headers: bobSpoof,
      json: { device_id: "bob", base_seq: seq, op: { start: 0, delete_count: 0, insert: "BOB" } },
    });
    assert.equal(bobOp.status, 404);
    const bobStream = await openStream(server, bob, `/screenplay/projects/${projectId}/live/stream?device_id=bob`);
    streams.push(bobStream);
    assert.equal(bobStream.status, 404);
    const aliceSnapshot = await apiRequest(server, `/screenplay/projects/${projectId}/live/snapshot`, { headers: authHeaders(alice) });
    assert.equal(aliceSnapshot.status, 200);
    assert.equal(aliceSnapshot.json.text, text, "Bob's attempts left Alice's mirror untouched");
    assert.equal(aliceSnapshot.json.seq, seq);

    // No bearer token at all: refused before any owner record is resolved.
    const anonymous = await apiRequest(server, `/screenplay/projects/${projectId}/live/snapshot`, {
      headers: { "X-User-Id": alice.userId },
    });
    assert.equal(anonymous.status, 401);
    assert.ok(!anonymous.text.includes("Mara"));
  } finally {
    for (const stream of streams) stream.close();
    await server.stop();
  }
});
