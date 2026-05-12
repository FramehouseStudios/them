// T-decisions-queue-route — unit + integration tests.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import express from "express";

import {
  parseDecisionsQueueMarkdown,
  mountDecisionsQueueRoute,
  DECISIONS_QUEUE_SCHEMA_VERSION,
} from "../lib/decisions_queue_route.js";

// ---------- parser ----------

test("[decisions-queue] empty string yields empty queue", () => {
  const r = parseDecisionsQueueMarkdown("");
  assert.equal(r.schemaVersion, DECISIONS_QUEUE_SCHEMA_VERSION);
  assert.deepEqual(r.open, []);
  assert.deepEqual(r.resolved, []);
});

test("[decisions-queue] non-string input returns empty shape", () => {
  const r = parseDecisionsQueueMarkdown(null);
  assert.equal(r.schemaVersion, DECISIONS_QUEUE_SCHEMA_VERSION);
  assert.deepEqual(r.open, []);
});

test("[decisions-queue] parses an open entry with all fields", () => {
  const md = `# Decisions Queue
## Open

### D-voice-supplier — Pick the default realtime voice supplier
- **Asked by:** claude
- **Asked at:** 2026-05-09
- **Why it matters:** unblocks the failover rollout.
- **Question:** OpenAI vs ElevenLabs as primary?
- **Default if no answer:** stay on OpenAI.

## Resolved

_(empty)_
`;
  const r = parseDecisionsQueueMarkdown(md);
  assert.equal(r.open.length, 1);
  assert.equal(r.resolved.length, 0);
  const entry = r.open[0];
  assert.equal(entry.id, "D-voice-supplier");
  assert.equal(entry.title, "Pick the default realtime voice supplier");
  assert.equal(entry.asked_by, "claude");
  assert.equal(entry.asked_at, "2026-05-09");
  assert.match(entry.why_it_matters, /failover rollout/);
  assert.match(entry.question, /OpenAI vs ElevenLabs/);
  assert.match(entry.default_if_no_answer, /stay on OpenAI/);
});

test("[decisions-queue] parses multiple open entries", () => {
  const md = `## Open

### D-a — first
- **Asked by:** claude

### D-b — second
- **Asked by:** codex
`;
  const r = parseDecisionsQueueMarkdown(md);
  assert.equal(r.open.length, 2);
  assert.equal(r.open[0].id, "D-a");
  assert.equal(r.open[1].id, "D-b");
});

test("[decisions-queue] segregates open vs resolved", () => {
  const md = `## Open

### D-a — open one
- **Asked by:** claude

## Resolved

### D-b — done
- **Asked by:** codex
- **Answer:** picked option 2
`;
  const r = parseDecisionsQueueMarkdown(md);
  assert.equal(r.open.length, 1);
  assert.equal(r.resolved.length, 1);
  assert.equal(r.open[0].id, "D-a");
  assert.equal(r.resolved[0].id, "D-b");
  assert.match(r.resolved[0].answer, /option 2/);
});

test("[decisions-queue] no Open section yields empty open list", () => {
  const md = `# header
Some preamble.
## Other
- **Asked by:** claude
`;
  const r = parseDecisionsQueueMarkdown(md);
  assert.equal(r.open.length, 0);
});

test("[decisions-queue] tolerates entries with no fields", () => {
  const md = `## Open

### D-bare — no fields here
`;
  const r = parseDecisionsQueueMarkdown(md);
  assert.equal(r.open.length, 1);
  assert.equal(r.open[0].id, "D-bare");
  assert.equal(r.open[0].title, "no fields here");
});

test("[decisions-queue] determinism: same input → same output", () => {
  const md = `## Open
### D-x — q
- **Asked by:** claude
`;
  const a = parseDecisionsQueueMarkdown(md);
  const b = parseDecisionsQueueMarkdown(md);
  assert.deepEqual(a, b);
});

// ---------- endpoint integration ----------

async function withTestServer(fn, { fileContents = null, missing = false } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-dq-"));
  const filePath = path.join(tmp, "decisions-queue.md");
  if (!missing) {
    fs.writeFileSync(filePath, fileContents ?? "## Open\n\n_(empty)_\n");
  }
  const app = express();
  mountDecisionsQueueRoute(app, { filePath: missing ? path.join(tmp, "missing.md") : filePath });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  const baseURL = `http://127.0.0.1:${port}`;
  try {
    await fn({ baseURL });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function get(baseURL, p) {
  const r = await fetch(`${baseURL}${p}`);
  return { status: r.status, body: await r.json().catch(() => null) };
}

test("[decisions-queue] GET /coordination/decisions-queue returns parsed queue", async () => {
  const md = `## Open

### D-real — Should we ship?
- **Asked by:** claude
- **Asked at:** 2026-05-10
- **Question:** yes or no
- **Default if no answer:** no

## Resolved
_(empty)_
`;
  await withTestServer(
    async ({ baseURL }) => {
      const r = await get(baseURL, "/coordination/decisions-queue");
      assert.equal(r.status, 200);
      assert.equal(r.body.schemaVersion, DECISIONS_QUEUE_SCHEMA_VERSION);
      assert.equal(r.body.counts.open, 1);
      assert.equal(r.body.counts.resolved, 0);
      assert.equal(r.body.open[0].id, "D-real");
      assert.equal(r.body.open[0].asked_by, "claude");
    },
    { fileContents: md },
  );
});

test("[decisions-queue] missing file returns empty queue (not 500)", async () => {
  await withTestServer(
    async ({ baseURL }) => {
      const r = await get(baseURL, "/coordination/decisions-queue");
      assert.equal(r.status, 200);
      assert.equal(r.body.counts.open, 0);
      assert.equal(r.body.counts.resolved, 0);
    },
    { missing: true },
  );
});

test("[decisions-queue] mountDecisionsQueueRoute requires an Express app", () => {
  assert.throws(() => mountDecisionsQueueRoute(null));
});
