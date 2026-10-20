import test from "node:test";
import assert from "node:assert/strict";

import { createPageReservationStore } from "../lib/clementine/page_cancel.js";
import {
  configureScreenplayStore,
  getOrCreateScreenplayOwnerRecord,
  screenplayStoreByOwner,
} from "../lib/screenplay_store.js";
import {
  createFinishedScriptGuard,
  findTerminalEndLine,
  guardFinishedScriptWrite,
  isAppendAfterTerminalEnd,
} from "../lib/clementine/finished_script_guard.js";
import { createPageLaneTalkAdapter } from "../lib/clementine/page_lane_adapter.js";

test("terminal marker parser recognizes standalone Fountain endings and CRLF", () => {
  assert.equal(findTerminalEndLine("INT. SHIP - NIGHT\r\n\r\nTHE END\r\n"), 3);
  assert.equal(findTerminalEndLine("INT. ROOM - DAY\n> THE END <\n"), 2);
  assert.equal(findTerminalEndLine("INT. THE ENDING - DAY\n\nFADE OUT."), 0);
  assert.equal(findTerminalEndLine("THE END is what she fears"), 0);
});

test("append policy blocks missing/default placement and placement at/after THE END", () => {
  assert.equal(isAppendAfterTerminalEnd({ terminalEndLine: 12 }), true);
  assert.equal(isAppendAfterTerminalEnd({ terminalEndLine: 12, insertionMode: "append" }), true);
  assert.equal(isAppendAfterTerminalEnd({ terminalEndLine: 12, insertionMode: "insert_after_anchor", anchorLine: 12 }), true);
  assert.equal(isAppendAfterTerminalEnd({ terminalEndLine: 12, insertionMode: "insert_after_anchor", anchorLine: 13 }), true);
});

test("explicit rewrites and insertions before THE END stay available", () => {
  assert.equal(isAppendAfterTerminalEnd({
    terminalEndLine: 12,
    insertionMode: "replace_selection",
    anchorLine: 5,
    anchorEndLine: 7,
  }), false);
  assert.equal(isAppendAfterTerminalEnd({
    terminalEndLine: 12,
    insertionMode: "replace_selection",
    anchorLine: 12,
    anchorEndLine: 12,
  }), false);
  assert.equal(isAppendAfterTerminalEnd({
    terminalEndLine: 12,
    insertionMode: "insert_after_anchor",
    anchorLine: 11,
  }), false);
  assert.equal(isAppendAfterTerminalEnd({ terminalEndLine: 12, anchorLine: 11 }), false);
});

test("project state failures fail closed while first-write projects remain usable", async () => {
  const unavailable = createFinishedScriptGuard({
    loadProjectDraft: async () => { throw Object.assign(new Error("store down"), { code: "store_unavailable", status: 503 }); },
  });
  await assert.rejects(unavailable({ body: { screenplay_project_id: "p1" } }), /store down/);

  const firstWrite = createFinishedScriptGuard({ loadProjectDraft: async () => null });
  assert.deepEqual(await firstWrite({ body: { screenplay_project_id: "p1" } }), {
    allowed: true,
    checked: false,
  });
});

test("default guard checks the authenticated owner's active project when request omits its id", async () => {
  screenplayStoreByOwner.clear();
  configureScreenplayStore({
    createEmptyScreenplayOwner: (ownerKey) => ({
      ownerKey,
      activeProjectId: "",
      projects: [],
    }),
    resolveScreenplayOwnerKey: (req) => String(req?.authUser?.id || req?.ownerKey || "anonymous"),
    persistence: null,
  });
  const owner = getOrCreateScreenplayOwnerRecord({ ownerKey: "writer-a" }, { create: true });
  owner.activeProjectId = "writer-a-project";
  owner.projects.push({
    id: "writer-a-project",
    versions: [{ id: "v1", updatedAt: 1, draft: "INT. ROOM - NIGHT\n\nTHE END" }],
  });

  assert.deepEqual(await guardFinishedScriptWrite({
    ownerKey: "writer-a",
    body: { screenplay_target: "page" },
  }), {
    allowed: false,
    status: 409,
    error: "screenplay_already_ended",
    message: "This screenplay is marked THE END. Select a passage to rewrite, or start a new project to keep writing.",
    terminalEndLine: 3,
  });

  await assert.rejects(
    guardFinishedScriptWrite({
      ownerKey: "writer-a",
      body: { screenplay_project_id: "not-owned-project" },
    }),
    (error) => error.status === 404 && error.code === "screenplay_project_not_found"
  );

  screenplayStoreByOwner.clear();
  configureScreenplayStore({});
});

test("page adapter rejects finished-script append before reservation, wallet, or handler", async () => {
  const pageReservationStore = createPageReservationStore({ now: () => 1 });
  let walletReserveCalls = 0;
  let handleCalls = 0;
  const wrapped = createPageLaneTalkAdapter({
    pageReservationStore,
    walletStore: { reserve() { walletReserveCalls += 1; return { reservationId: "wallet-1" }; } },
    finishedScriptGuard: async () => ({
      allowed: false,
      status: 409,
      error: "screenplay_already_ended",
      message: "This screenplay is marked THE END.",
      terminalEndLine: 8,
    }),
    handleTalkRequest: async (_req, res) => {
      handleCalls += 1;
      return res.status(200).json({ ok: true });
    },
  });

  let statusCode = 0;
  let responseBody = null;
  const res = {
    status(code) { statusCode = code; return this; },
    json(body) { responseBody = body; return body; },
  };
  await wrapped({
    body: {
      client_transcript: "write the next page",
      screenplay_target: "page",
      screenplay_project_id: "p1",
    },
    headers: {},
    get: () => "",
    ip: "127.0.0.1",
  }, res);
  assert.equal(statusCode, 409);
  assert.deepEqual(responseBody, {
    ok: false,
    stage: "screenplay_end",
    error: "This screenplay is marked THE END.",
    code: "screenplay_already_ended",
    message: "This screenplay is marked THE END.",
    terminal_end_line: 8,
  });
  assert.equal(walletReserveCalls, 0);
  assert.equal(pageReservationStore.size(), 0);
  assert.equal(handleCalls, 0);
});
