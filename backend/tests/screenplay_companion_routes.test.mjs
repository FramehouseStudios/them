// T-decompose-phase3-screenplay-companion — integration tests for
// the 4 routes in `mountScreenplayCompanionRoutes`. Pin response
// contracts, editor line addressing, and the required-deps guard.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import express from "express";

import { mountScreenplayCompanionRoutes } from "../lib/screenplay_companion_routes.js";
import { createScreenplayModelServices } from "../services/screenplay_model.js";
import { apiRequest, startBackend } from "./helpers/backend_test_server.mjs";

const screenplayModel = createScreenplayModelServices();

function defaultOwner() {
  return {
    ownerKey: "companion-owner",
    activeProjectId: "p1",
    projects: [],
    companionState: null,
  };
}

function defaultDeps(overrides = {}) {
  const owner = defaultOwner();
  return {
    getOrCreateScreenplayOwnerRecord: () => owner,
    markScreenplayOwnerDirty: (_o, _now) => {},
    refreshScreenplayOwnerRecord: async () => ({
      ok: true,
      owner,
      authoritative: true,
      persistenceKind: "test",
    }),
    normalizeStoredScreenplayCompanionState: (raw) => {
      const r = raw || {};
      return {
        mode_raw: typeof r.mode_raw === "string" ? r.mode_raw : "idle",
        recent_turns: Array.isArray(r.recent_turns) ? r.recent_turns : [],
        analytics: {
          updatedAt: Number(r.analytics?.updatedAt || 0),
          firstPageWrittenAt: Number(r.analytics?.firstPageWrittenAt || 0),
          firstPageWrittenSourceRaw: r.analytics?.firstPageWrittenSourceRaw || "",
          firstPageWrittenProjectId: r.analytics?.firstPageWrittenProjectId || "",
          firstPageWrittenVersionId: r.analytics?.firstPageWrittenVersionId || "",
        },
        signals: r.signals || {},
      };
    },
    toScreenplayCompanionStatePayload: (state) => ({
      companion_mode_raw: state.mode_raw,
      companion_recent_turns: state.recent_turns,
      companion_analytics: state.analytics,
      companion_signals: state.signals,
    }),
    buildScreenplayEnvelope: (_req, _owner, extra) => ({ ok: true, ...extra }),
    buildScreenplayReadMeta: () => ({ stateVersion: "v1" }),
    applyReadStateHeaders: (res, meta) => { res.setHeader("X-State-Version", meta.stateVersion); },
    normalizeClientIp: (v) => (typeof v === "string" ? v : ""),
    clientIp: () => "127.0.0.1",
    normalizeSnippet: (v, _max) => (typeof v === "string" ? v.trim() : ""),
    normalizeScreenplayPhaseValue: (v) => (typeof v === "string" && v ? v : "scene_draft"),
    parsePositiveInt: (v, def) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : def;
    },
    splitScreenplayLines: screenplayModel.splitScreenplayLines,
    buildDraftExcerpt: (text, len) => String(text).slice(0, len),
    buildScreenplayRevisionPayload: (baseDraft, newDraft, color) => ({
      stage: "screenplay_revision",
      revision_color: color,
      base_lines: baseDraft.split("\n").length,
      new_lines: newDraft.split("\n").length,
      changes: baseDraft === newDraft ? [] : [{ kind: "modified" }],
    }),
    _owner: owner,
    ...overrides,
  };
}

async function withTestServer(deps, fn) {
  const app = express();
  mountScreenplayCompanionRoutes(app, deps);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function get(baseURL, path) {
  const r = await fetch(`${baseURL}${path}`);
  return { status: r.status, headers: r.headers, body: await r.json().catch(() => null) };
}

async function postJson(baseURL, path, body) {
  const r = await fetch(`${baseURL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

test("[screenplay-companion-routes] mount fails without Express app", () => {
  assert.throws(() => mountScreenplayCompanionRoutes(null, defaultDeps()));
});

test("[screenplay-companion-routes] mount fails when required deps are missing", () => {
  const required = [
    "getOrCreateScreenplayOwnerRecord",
    "markScreenplayOwnerDirty",
    "refreshScreenplayOwnerRecord",
    "normalizeStoredScreenplayCompanionState",
    "toScreenplayCompanionStatePayload",
    "buildScreenplayEnvelope",
    "buildScreenplayReadMeta",
    "applyReadStateHeaders",
    "normalizeClientIp",
    "clientIp",
    "normalizeSnippet",
    "normalizeScreenplayPhaseValue",
    "parsePositiveInt",
    "splitScreenplayLines",
    "buildDraftExcerpt",
    "buildScreenplayRevisionPayload",
  ];
  for (const key of required) {
    const deps = defaultDeps();
    deps[key] = undefined;
    const app = express();
    assert.throws(
      () => mountScreenplayCompanionRoutes(app, deps),
      new RegExp(key),
      `should reject missing ${key}`,
    );
  }
});

test("[screenplay-companion-routes] GET /companion/state returns normalized state", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await get(baseURL, "/screenplay/companion/state");
    assert.equal(r.status, 200);
    assert.equal(r.body.stage, "screenplay_companion_state");
    assert.equal(r.body.status, "ok");
    assert.equal(r.body.companion_mode_raw, "idle");
    assert.equal(r.headers.get("x-state-version"), "v1");
  });
});

test("[screenplay-companion-routes] GET /companion/state refreshes canonical multi-instance state", async () => {
  const deps = defaultDeps();
  const freshOwner = structuredClone(deps._owner);
  freshOwner.companionState = {
    mode_raw: "writing",
    recent_turns: [],
    analytics: {},
    signals: {},
  };
  deps.refreshScreenplayOwnerRecord = async () => ({
    ok: true,
    owner: freshOwner,
    authoritative: true,
    persistenceKind: "postgres",
  });

  await withTestServer(deps, async (baseURL) => {
    const r = await get(baseURL, "/screenplay/companion/state");
    assert.equal(r.status, 200);
    assert.equal(r.body.companion_mode_raw, "writing");
  });
});

test("[screenplay-companion-routes] canonical read failures return 503 instead of stale state", async () => {
  const deps = defaultDeps({
    refreshScreenplayOwnerRecord: async () => ({
      ok: false,
      persistenceKind: "postgres",
    }),
  });

  await withTestServer(deps, async (baseURL) => {
    const r = await get(baseURL, "/screenplay/companion/state");
    assert.equal(r.status, 503);
    assert.equal(r.body.error, "screenplay_persistence_failed");
    assert.equal(r.body.persistence, "postgres");
    assert.equal(r.headers.get("cache-control"), "no-store");
  });
});

test("[screenplay-companion-routes] POST /companion/state persists + responds 'saved'", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, "/screenplay/companion/state", {
      mode_raw: "writing",
      recent_turns: [{ id: "t1" }, { id: "t2" }],
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "saved");
    assert.equal(r.body.companion_mode_raw, "writing");
    assert.equal(r.body.companion_recent_turns.length, 2);
  });
});

test("[screenplay-companion-routes] POST /companion/state waits for durable persistence", async () => {
  let releasePersistence;
  let signalPersistenceStarted;
  const persistenceGate = new Promise((resolve) => { releasePersistence = resolve; });
  const persistenceStarted = new Promise((resolve) => { signalPersistenceStarted = resolve; });
  const deps = defaultDeps({
    markScreenplayOwnerDirty: () => {
      signalPersistenceStarted();
      return {
        ok: true,
        persistenceKind: "postgres",
        persistencePromise: persistenceGate,
      };
    },
  });

  await withTestServer(deps, async (baseURL) => {
    let responseSettled = false;
    const responsePromise = postJson(baseURL, "/screenplay/companion/state", {
      mode_raw: "writing",
    }).then((response) => {
      responseSettled = true;
      return response;
    });
    await persistenceStarted;
    assert.equal(responseSettled, false);
    releasePersistence({ ok: true });
    const response = await responsePromise;
    assert.equal(response.status, 200);
  });
});

test("[screenplay-companion-routes] POST /companion/state responds with its committed snapshot", async () => {
  let releasePersistence;
  let signalPersistenceStarted;
  const persistenceGate = new Promise((resolve) => { releasePersistence = resolve; });
  const persistenceStarted = new Promise((resolve) => { signalPersistenceStarted = resolve; });
  let committedOwner = null;
  const deps = defaultDeps({
    markScreenplayOwnerDirty: (owner) => {
      committedOwner = structuredClone(owner);
      signalPersistenceStarted();
      return {
        ok: true,
        persistenceKind: "postgres",
        persistencePromise: persistenceGate,
      };
    },
  });

  await withTestServer(deps, async (baseURL) => {
    const responsePromise = postJson(baseURL, "/screenplay/companion/state", {
      mode_raw: "writing",
    });
    await persistenceStarted;
    deps._owner.companionState.mode_raw = "concurrent-change";
    releasePersistence({ ok: true, owner: committedOwner });

    const response = await responsePromise;
    assert.equal(response.status, 200);
    assert.equal(response.body.companion_mode_raw, "writing");
  });
});

test("[screenplay-companion-routes] POST /companion/state returns 503 on durable failure", async () => {
  const deps = defaultDeps({
    markScreenplayOwnerDirty: () => ({
      ok: true,
      persistenceKind: "postgres",
      persistencePromise: Promise.resolve({
        ok: false,
        persistenceKind: "postgres",
        persistenceFailureCount: 1,
      }),
    }),
  });

  await withTestServer(deps, async (baseURL) => {
    const response = await postJson(baseURL, "/screenplay/companion/state", {
      mode_raw: "writing",
    });
    assert.equal(response.status, 503);
    assert.equal(response.body.error, "screenplay_persistence_failed");
    assert.equal(response.body.persistence, "postgres");
  });
});

test("[screenplay-companion-routes] POST /companion/state preserves existing firstPageWrittenAt", async () => {
  const deps = defaultDeps();
  // Pre-set an existing first-page-written timestamp.
  deps._owner.companionState = {
    mode_raw: "idle",
    recent_turns: [],
    analytics: {
      updatedAt: 1000,
      firstPageWrittenAt: 9999,
      firstPageWrittenSourceRaw: "studio",
      firstPageWrittenProjectId: "p1",
      firstPageWrittenVersionId: "v1",
    },
    signals: {},
  };
  await withTestServer(deps, async (baseURL) => {
    // Save without firstPageWrittenAt — existing value should survive.
    const r = await postJson(baseURL, "/screenplay/companion/state", {
      mode_raw: "writing",
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.companion_analytics.firstPageWrittenAt, 9999);
    assert.equal(r.body.companion_analytics.firstPageWrittenSourceRaw, "studio");
  });
});

test("[screenplay-companion-routes] POST /paginate splits draft into pages", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const lines = Array.from({ length: 120 }, (_, i) => `line ${i + 1}`);
    const r = await postJson(baseURL, "/screenplay/paginate", {
      draft: lines.join("\n"),
      lines_per_page: 55,
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.stage, "screenplay_paginate");
    assert.equal(r.body.line_count, 120);
    assert.equal(r.body.lines_per_page, 55);
    assert.equal(r.body.page_count, 3); // ceil(120/55) = 3
    assert.equal(r.body.length_profile, "standard");
    assert.equal(r.body.pages[0].start_line, 1);
    assert.equal(r.body.pages[0].end_line, 55);
  });
});

test("[screenplay-companion-routes] POST /paginate rejects empty draft with 400", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, "/screenplay/paginate", { draft: "" });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, "draft_required");
  });
});

const paginationLineFixtures = [
  {
    name: "leading blank lines",
    lines: ["", "", ...Array.from({ length: 60 }, (_, i) => `line ${i + 1}`)],
    newline: "\n",
  },
  {
    name: "trailing blank lines and an empty final page",
    lines: [...Array.from({ length: 55 }, (_, i) => `line ${i + 1}`), "", ""],
    newline: "\n",
  },
  {
    name: "CRLF, internal blank lines, indentation, and Unicode",
    lines: [
      "", "", "  INT. CAFÉ — DAY",
      ...Array.from({ length: 55 }, (_, i) => i % 3 === 0 ? "" : `ÉLODIE ${i + 1} 👩🏽‍🚀 e\u0301`),
      "  Fin — 終わり  ", "", "",
    ],
    newline: "\r\n",
  },
  {
    name: "lone CR, leading and trailing blank lines, and Unicode",
    lines: [
      "", "", "  INT. CAFÉ — NIGHT",
      ...Array.from({ length: 55 }, (_, i) => i % 4 === 0 ? "" : `JOSÉ ${i + 1} 👩🏽‍🚀 e\u0301`),
      "  Fin — 終わり  ", "", "",
    ],
    newline: "\r",
  },
];

for (const fixture of paginationLineFixtures) {
  test(`[screenplay-companion-routes] POST /paginate preserves editor coordinates for ${fixture.name}`, async () => {
    const draft = fixture.lines.join(fixture.newline);
    let splitInput;
    const deps = defaultDeps({
      splitScreenplayLines: (value) => {
        splitInput = value;
        return screenplayModel.splitScreenplayLines(value);
      },
      buildDraftExcerpt: screenplayModel.buildDraftExcerpt,
    });
    await withTestServer(deps, async (baseURL) => {
      const response = await postJson(baseURL, "/screenplay/paginate", {
        draft,
        lines_per_page: 55,
      });
      assert.equal(response.status, 200);
      const { pages, page_count: pageCount, line_count: lineCount } = response.body;
      assert.equal(lineCount, fixture.lines.length, "Every editor line, including blank lines, must be addressable");
      assert.equal(pageCount, Math.ceil(fixture.lines.length / 55));
      assert.equal(pages.length, pageCount);
      assert.equal(splitInput, fixture.lines.join("\n"), "Pagination may normalize line endings but must not trim writer text");

      const addressedLines = [];
      for (const [index, page] of pages.entries()) {
        const startIndex = index * 55;
        const expectedLines = fixture.lines.slice(startIndex, startIndex + 55);
        assert.equal(page.page, index + 1);
        assert.equal(page.start_line, startIndex + 1);
        assert.equal(page.end_line, startIndex + expectedLines.length);
        assert.equal(page.line_count, expectedLines.length);
        const editorLines = fixture.lines.slice(page.start_line - 1, page.end_line);
        assert.deepEqual(editorLines, expectedLines, "Jump ranges must select the matching raw editor text");
        assert.equal(page.preview, screenplayModel.buildDraftExcerpt(editorLines.join(" "), 140));
        addressedLines.push(...editorLines);
      }
      assert.deepEqual(addressedLines, fixture.lines, "Page ranges must cover all lines exactly once");
    });
  });
}

test("[screenplay-companion-routes] real backend pagination preserves the complete editor line map", async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "them-pagination-lines-"));
  let server;
  t.after(async () => {
    await server?.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  server = await startBackend({ dataDir });
  const signup = await apiRequest(server, "/auth/signup", {
    method: "POST",
    json: { email: "pagination-lines@example.test", password: "pagination-fixture-password-123" },
  });
  assert.equal(signup.status, 201);
  assert.ok(signup.json.access_token);
  for (const fixture of paginationLineFixtures) {
    const response = await apiRequest(server, "/screenplay/paginate", {
      method: "POST",
      headers: { Authorization: `Bearer ${signup.json.access_token}` },
      json: { draft: fixture.lines.join(fixture.newline), lines_per_page: 55 },
    });
    assert.equal(response.status, 200, fixture.name);
    assert.equal(response.json.stage, "screenplay_paginate");
    assert.equal(response.json.line_count, fixture.lines.length, fixture.name);
    assert.equal(response.json.page_count, Math.ceil(fixture.lines.length / 55));
    let nextLine = 1;
    const addressedLines = [];
    for (const page of response.json.pages) {
      assert.equal(page.start_line, nextLine, "No editor lines may be skipped or repeated");
      assert.equal(page.end_line, Math.min(nextLine + 54, fixture.lines.length));
      const editorLines = fixture.lines.slice(page.start_line - 1, page.end_line);
      assert.equal(page.line_count, editorLines.length);
      assert.equal(page.preview, screenplayModel.buildDraftExcerpt(editorLines.join(" "), 140));
      addressedLines.push(...editorLines);
      nextLine = page.end_line + 1;
    }
    assert.deepEqual(addressedLines, fixture.lines, fixture.name);
  }
});

test("[screenplay-companion-routes] POST /paginate still rejects whitespace-only drafts", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    for (const draft of [" \n\n\t", "\r\n \r\n", "\u00a0\n"]) {
      const response = await postJson(baseURL, "/screenplay/paginate", { draft });
      assert.equal(response.status, 400);
      assert.equal(response.body.error, "draft_required");
    }
  });
});

test("[screenplay-companion-routes] POST /paginate clamps lines_per_page to [24, 120]", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, "/screenplay/paginate", {
      draft: "a\nb\nc",
      lines_per_page: 999,
    });
    assert.equal(r.body.lines_per_page, 120);
    const r2 = await postJson(baseURL, "/screenplay/paginate", {
      draft: "a\nb\nc",
      lines_per_page: 1,
    });
    assert.equal(r2.body.lines_per_page, 24);
  });
});

test("[screenplay-companion-routes] POST /paginate length_profile thresholds", async () => {
  const deps = defaultDeps();
  await withTestServer(deps, async (baseURL) => {
    // 1 page → short
    const r1 = await postJson(baseURL, "/screenplay/paginate", {
      draft: "one line",
      lines_per_page: 55,
    });
    assert.equal(r1.body.length_profile, "short");
    // 8 pages → long
    const longLines = Array.from({ length: 440 }, (_, i) => `line ${i + 1}`);
    const r2 = await postJson(baseURL, "/screenplay/paginate", {
      draft: longLines.join("\n"),
      lines_per_page: 55,
    });
    assert.equal(r2.body.page_count, 8);
    assert.equal(r2.body.length_profile, "long");
  });
});

test("[screenplay-companion-routes] POST /revision-colors returns payload", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, "/screenplay/revision-colors", {
      base_draft: "scene A",
      draft: "scene B",
      revision_color: "pink",
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.stage, "screenplay_revision");
    assert.equal(r.body.revision_color, "pink");
    assert.equal(r.body.changes.length, 1);
  });
});

test("[screenplay-companion-routes] POST /revision-colors defaults to blue when color omitted", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, "/screenplay/revision-colors", {
      draft: "scene",
    });
    assert.equal(r.body.revision_color, "blue");
  });
});

test("[screenplay-companion-routes] POST /revision-colors rejects empty draft with 400", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, "/screenplay/revision-colors", { draft: "" });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, "draft_required");
  });
});
