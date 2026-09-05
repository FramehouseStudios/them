// T-decompose-phase3-screenplay-companion — integration tests for
// the 4 routes in `mountScreenplayCompanionRoutes`. Pin byte-
// identical behavior + required-deps guard.

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import { mountScreenplayCompanionRoutes } from "../lib/screenplay_companion_routes.js";

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
    splitScreenplayLines: (draft) => draft.split("\n").filter((l) => l.length > 0),
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
