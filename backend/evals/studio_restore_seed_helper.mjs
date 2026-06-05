import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function normalizeStudioRestoreKey(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeKey(value) {
  return normalizeStudioRestoreKey(value);
}

export function normalizeStudioRestoreText(value) {
  return String(value || "")
    .replace(/\\[nr]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readDefaultString(key) {
  const result = spawnSync("defaults", ["read", "io.them.them", key], {
    encoding: "utf8",
    env: process.env,
  });
  return result.status === 0 ? String(result.stdout || "").trim() : "";
}

function readJSONDefault(key) {
  const raw = readDefaultString(key);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function projectIdFromHistoryKey(value) {
  const clean = String(value || "").trim();
  return clean.startsWith("project:") ? clean.slice("project:".length) : clean;
}

function extractMarkedJSON(text, marker) {
  const lines = String(text || "").split(/\r?\n/).reverse();
  const taggedLine = lines.find((line) => line.startsWith(marker));
  if (!taggedLine) {
    throw new Error(`Missing ${marker} output from studio cmd-return seed run.`);
  }
  const rawJSON = taggedLine.slice(marker.length).trim();
  try {
    return JSON.parse(rawJSON);
  } catch (error) {
    throw new Error(`Could not parse ${marker} JSON: ${error.message}`);
  }
}

function normalizeAcknowledgedKey(value) {
  const normalized = normalizeKey(value);
  if (!normalized) return "";
  if (normalized.startsWith("write:")) {
    const writeID = normalizeKey(normalized.slice("write:".length));
    return writeID ? `lineage:${writeID}` : "";
  }
  return normalized;
}

function readProjectScopedState(projectKey, payload) {
  const debugState = readJSONDefault("studio_debug_diff_state_json");
  const threadMap = readJSONDefault("studio.full.thread.state.v1");
  const acknowledgedMapRaw = readJSONDefault("studio.diff.keep-current.v1");
  const acknowledgedWriteMapRaw = readJSONDefault("studio.diff.keep-current.writeids.v1");

  const rawRecord = threadMap[projectKey] && typeof threadMap[projectKey] === "object"
    ? threadMap[projectKey]
    : (payload.fullThreadBrowseState && typeof payload.fullThreadBrowseState === "object" ? payload.fullThreadBrowseState : {});

  const acknowledgedRecordRaw = acknowledgedMapRaw[projectKey] && typeof acknowledgedMapRaw[projectKey] === "object"
    ? acknowledgedMapRaw[projectKey]
    : {};
  const acknowledgedWriteRecordRaw = acknowledgedWriteMapRaw[projectKey] && typeof acknowledgedWriteMapRaw[projectKey] === "object"
    ? acknowledgedWriteMapRaw[projectKey]
    : {};

  const acknowledgedRecord = {};
  for (const [key, fingerprint] of Object.entries(acknowledgedRecordRaw)) {
    const normalizedKey = normalizeAcknowledgedKey(key);
    if (!normalizedKey) continue;
    acknowledgedRecord[normalizedKey] = String(fingerprint || "").trim();
  }

  const acknowledgedWriteRecord = {};
  for (const [key, writeID] of Object.entries(acknowledgedWriteRecordRaw)) {
    const normalizedKey = normalizeAcknowledgedKey(key);
    const normalizedWriteID = normalizeKey(writeID);
    if (!normalizedKey || !normalizedWriteID) continue;
    acknowledgedWriteRecord[normalizedKey] = normalizedWriteID;
  }

  return {
    debugState,
    rawRecord,
    acknowledgedRecord,
    acknowledgedWriteRecord,
  };
}

function buildSeedFixture(payload, mode) {
  assert(payload?.ok === true, "Studio cmd-return seed payload was not marked ok.");

  const projectKey = String(payload.projectKey || "").trim();
  const projectId = String(payload.throwawayProjectId || projectIdFromHistoryKey(projectKey)).trim();
  assert(projectKey, "Studio cmd-return seed payload did not include a project key.");
  assert(projectId, "Studio cmd-return seed payload did not include a project id.");

  const { debugState, rawRecord, acknowledgedRecord, acknowledgedWriteRecord } = readProjectScopedState(projectKey, payload);
  const acknowledgedLineageKey = normalizeKey(
    debugState?.latestAcknowledgedLineageKey
      || Object.keys(acknowledgedWriteRecord)[0]
      || Object.keys(acknowledgedRecord)[0]
      || debugState?.latestReopenedLineageKey
      || debugState?.activeRevisedLineageKey
  );
  const acknowledgedWriteID = normalizeKey(
    debugState?.latestAcknowledgedWriteID
      || acknowledgedWriteRecord[acknowledgedLineageKey]
      || debugState?.latestReopenedWriteID
      || debugState?.activeRevisedWriteID
  );
  const acknowledgedFingerprint = String(
    debugState?.latestAcknowledgedFingerprint
      || acknowledgedRecord[acknowledgedLineageKey]
      || ""
  ).trim();
  const focusedDiffKey = normalizeKey(
    rawRecord?.focusedDiffKey
      || debugState?.focusedDiffKey
      || debugState?.restoredFocusedDiffKey
      || (acknowledgedWriteID ? `write:${acknowledgedWriteID}` : "")
  );
  const reopenedLineageKeys = Array.isArray(rawRecord?.reopenedLineageKeys)
    ? rawRecord.reopenedLineageKeys.map((value) => normalizeKey(value)).filter(Boolean)
    : [];
  const latestReopenedWriteID = normalizeKey(rawRecord?.latestReopenedWriteID);

  assert(focusedDiffKey, "Studio cmd-return seed payload did not include a focused diff key.");
  assert(acknowledgedLineageKey, "Studio cmd-return seed payload did not include an acknowledged lineage key.");
  assert(acknowledgedWriteID, "Studio cmd-return seed payload did not include an acknowledged write id.");
  if (mode !== "ack-only") {
    assert(reopenedLineageKeys.length > 0, "Studio cmd-return seed payload did not include reopened lineage keys.");
    assert(latestReopenedWriteID, "Studio cmd-return seed payload did not include a reopened write id.");
  }

  const ackRawRecord = {
    ...rawRecord,
    focusedDiffKey,
    reopenedLineageKeys: [],
    latestReopenedWriteID: "",
  };
  const reopenedRawRecord = {
    ...rawRecord,
    focusedDiffKey,
    reopenedLineageKeys,
    latestReopenedWriteID,
  };

  return {
    projectId,
    projectKey,
    cmdreturn: payload,
    draftRecoveryFallback: {
      draft: String(
        payload.thirdEntry?.insertedText
          || payload.secondEntry?.insertedText
          || payload.firstEntry?.insertedText
          || ""
      ).trim(),
      baseVersionId: "",
    },
    ackSeed: {
      projectKey,
      focusedDiffKey,
      acknowledgedLineageKey,
      acknowledgedWriteID,
      acknowledgedFingerprint,
      reopenedLineageKeys: [],
      latestReopenedWriteID: "",
      rawRecord: ackRawRecord,
    },
    reopenedSeed: mode === "ack-only"
      ? null
      : {
          projectKey,
          focusedDiffKey,
          reopenedLineageKeys,
          latestReopenedWriteID,
          acknowledgedLineageKey,
          acknowledgedWriteID,
          acknowledgedFingerprint,
          rawRecord: reopenedRawRecord,
        },
  };
}

export function runStudioCmdReturnSeed(mode = "reopened") {
  const scriptPath = fileURLToPath(new URL("./run_studio_cmdreturn_smoke.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [scriptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      STUDIO_CMDRETURN_SCENARIO: mode,
    },
  });
  if (result.status !== 0) {
    throw new Error(
      [
        "studio-cmdreturn seed run failed.",
        (result.stdout || "").trim(),
        (result.stderr || "").trim(),
      ].filter(Boolean).join("\n")
    );
  }

  const payload = extractMarkedJSON(result.stdout || "", "__STUDIO_CMDRETURN_RESULT__");
  return buildSeedFixture(payload, mode);
}

function normalizedAnchorExcerpt(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function noteBodyForText(text) {
  return String(text || "")
    .trim()
    .slice(0, 220)
    .trim();
}

function makePageExchange({
  prompt,
  insertedText,
  writeID,
  replacedWriteID = "",
  timestamp,
  requestID,
}) {
  const cleanInserted = String(insertedText || "").trim();
  return {
    id: randomUUID().toUpperCase(),
    backendThreadID: "",
    backendTurn: null,
    requestID,
    prompt,
    target: "page",
    source: "typed",
    noteTitle: "Wrote to page",
    noteBody: noteBodyForText(cleanInserted.replace(/\n+/g, " ")),
    writeID,
    replacedWriteID: replacedWriteID || "",
    anchorLine: 1,
    anchorEndLine: 3,
    anchorSceneLabel: "INT. ROOM - NIGHT",
    anchorExcerpt: cleanInserted,
    insertedText: cleanInserted,
    replacementApplied: Boolean(replacedWriteID),
    revisedBlockText: Boolean(replacedWriteID) ? cleanInserted : null,
    resolvedAnchorExcerpt: cleanInserted,
    timestamp: new Date(timestamp).toISOString(),
  };
}

export function createStudioRestoreFixture(kind = "reopened") {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const projectId = `studio-restore-${stamp}`;
  const projectKey = `project:${projectId}`;
  const title = `Studio Restore Smoke ${stamp}`;

  const firstWriteID = randomUUID().toLowerCase();
  const secondWriteID = randomUUID().toLowerCase();
  const thirdWriteID = randomUUID().toLowerCase();
  const lineageKey = `lineage:${firstWriteID}`;
  const focusedDiffKey = `write:${firstWriteID}`;

  const firstText = "INT. ROOM - NIGHT\n\nHe closes the blinds and waits.";
  const secondText = "INT. ROOM - NIGHT\n\nHe waits.";
  const thirdText = "INT. ROOM - NIGHT\n\nHe waits, still.";
  const now = Date.now();

  const firstEntry = makePageExchange({
    prompt: "Write one new action line: He closes the blinds and waits.",
    insertedText: firstText,
    writeID: firstWriteID,
    timestamp: now - 2000,
    requestID: `studio-fixture-${randomUUID().toLowerCase()}`,
  });
  const secondEntry = makePageExchange({
    prompt: "Rewrite only the last line shorter. Replace that line and do not add a new slugline or any extra lines.",
    insertedText: secondText,
    writeID: secondWriteID,
    replacedWriteID: firstWriteID,
    timestamp: now - 1000,
    requestID: `studio-fixture-${randomUUID().toLowerCase()}`,
  });
  const thirdEntry = makePageExchange({
    prompt: "Rewrite that same line again, but make it more visual. Replace the same line only.",
    insertedText: thirdText,
    writeID: thirdWriteID,
    replacedWriteID: secondWriteID,
    timestamp: now,
    requestID: `studio-fixture-${randomUUID().toLowerCase()}`,
  });

  const ackHistory = [secondEntry, firstEntry];
  const reopenedHistory = [thirdEntry, secondEntry, firstEntry];
  const acknowledgedFingerprint = normalizedAnchorExcerpt(secondText);

  const ackThreadViewState = {
    searchText: "",
    selectedFilterRaw: "all",
    selectedSceneKey: "",
    scrollTargetKey: String(firstEntry.id || "").toLowerCase(),
    collapsedSectionKeys: [],
    focusedDiffKey,
    reopenedLineageKeys: [],
    latestReopenedWriteID: "",
  };
  const reopenedThreadViewState = {
    ...ackThreadViewState,
    reopenedLineageKeys: [lineageKey],
    latestReopenedWriteID: thirdWriteID,
  };

  return {
    kind,
    projectId,
    projectKey,
    title,
    draftAck: secondText,
    draftReopened: thirdText,
    firstEntry,
    secondEntry,
    thirdEntry,
    ackHistory,
    reopenedHistory,
    ackSeed: {
      projectKey,
      focusedDiffKey,
      acknowledgedLineageKey: lineageKey,
      acknowledgedWriteID: secondWriteID,
      acknowledgedFingerprint,
      reopenedLineageKeys: [],
      latestReopenedWriteID: "",
      rawRecord: ackThreadViewState,
    },
    reopenedSeed: {
      projectKey,
      focusedDiffKey,
      reopenedLineageKeys: [lineageKey],
      latestReopenedWriteID: thirdWriteID,
      acknowledgedLineageKey: lineageKey,
      acknowledgedWriteID: secondWriteID,
      acknowledgedFingerprint,
      rawRecord: reopenedThreadViewState,
    },
  };
}

function normalizedBackendBaseURL(baseURL) {
  const clean = String(baseURL || "").trim().replace(/\/+$/, "");
  if (!clean) throw new Error("Studio restore backend baseURL is required.");
  return clean;
}

function requireNonEmptyString(value, message) {
  const clean = String(value || "").trim();
  if (!clean) throw new Error(message);
  return clean;
}

export function createStudioRestoreThreadViewPayload(seed) {
  const record = seed?.rawRecord && typeof seed.rawRecord === "object" ? seed.rawRecord : {};
  return {
    search_text: String(record.searchText || ""),
    selected_filter_raw: String(record.selectedFilterRaw || "all"),
    selected_scene_key: String(record.selectedSceneKey || ""),
    scroll_target_key: String(record.scrollTargetKey || ""),
    collapsed_section_keys: Array.isArray(record.collapsedSectionKeys) ? record.collapsedSectionKeys : [],
    focused_diff_key: String(seed?.focusedDiffKey || record.focusedDiffKey || ""),
    reopened_lineage_keys: Array.isArray(seed?.reopenedLineageKeys)
      ? seed.reopenedLineageKeys
      : (Array.isArray(record.reopenedLineageKeys) ? record.reopenedLineageKeys : []),
    latest_reopened_write_id: String(seed?.latestReopenedWriteID || record.latestReopenedWriteID || ""),
  };
}

export function createStudioRestoreDiffAcknowledgedEntries(seed) {
  const key = normalizeStudioRestoreKey(seed?.acknowledgedLineageKey);
  if (!key) return [];
  return [{
    key,
    fingerprint: String(seed?.acknowledgedFingerprint || "").trim(),
    write_id: normalizeStudioRestoreKey(seed?.acknowledgedWriteID),
  }];
}

export function createStudioRestoreAskNoteHistoryPayload(fixture, seed = fixture?.reopenedSeed) {
  const history = Array.isArray(seed?.latestReopenedWriteID ? fixture?.reopenedHistory : fixture?.ackHistory)
    ? (seed?.latestReopenedWriteID ? fixture.reopenedHistory : fixture.ackHistory)
    : [];
  return history.slice(0, 24);
}

export function createStudioRestoreLocalStatePayload(fixture, seed = fixture?.reopenedSeed) {
  const projectKey = requireNonEmptyString(seed?.projectKey || fixture?.projectKey, "Studio restore fixture is missing a project key.");
  const acknowledgedLineageKey = normalizeStudioRestoreKey(seed?.acknowledgedLineageKey);
  const history = createStudioRestoreAskNoteHistoryPayload(fixture, seed);
  return {
    fullThreadStateJSON: JSON.stringify({
      [projectKey]: seed?.rawRecord && typeof seed.rawRecord === "object" ? seed.rawRecord : {},
    }),
    askHistoryJSON: JSON.stringify({
      [projectKey]: history,
    }),
    acknowledgedJSON: JSON.stringify({
      [projectKey]: acknowledgedLineageKey
        ? { [acknowledgedLineageKey]: String(seed?.acknowledgedFingerprint || "").trim() }
        : {},
    }),
    acknowledgedWriteIDsJSON: JSON.stringify({
      [projectKey]: acknowledgedLineageKey
        ? { [acknowledgedLineageKey]: normalizeStudioRestoreKey(seed?.acknowledgedWriteID) }
        : {},
    }),
  };
}

export async function requestStudioRestoreJSON({
  baseURL,
  path,
  method = "GET",
  headers = {},
  body = null,
} = {}) {
  const resolvedBaseURL = normalizedBackendBaseURL(baseURL);
  const cleanPath = String(path || "").replace(/^\/+/, "");
  const requestHeaders = {
    ...(body == null ? {} : { "Content-Type": "application/json" }),
    ...headers,
    Connection: "close",
  };
  const response = await fetch(`${resolvedBaseURL}/${cleanPath}`, {
    method,
    headers: requestHeaders,
    body: body == null ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload, status: response.status };
}

export async function createStudioRestoreOwnerIdentity({
  baseURL,
  appToken = "them-dev",
  emailPrefix = "studio-restore",
} = {}) {
  const stamp = `${Date.now()}-${randomUUID().slice(0, 8).toLowerCase()}`;
  const signup = await requestStudioRestoreJSON({
    baseURL,
    path: "/auth/signup",
    method: "POST",
    headers: { "X-APP-TOKEN": appToken },
    body: {
      email: `${emailPrefix}-${stamp}@example.test`.toLowerCase(),
      password: `ThemRestore-${stamp}-aA1!`,
      display_name: "Studio Restore Contract",
    },
  });
  if (!signup.response.ok) {
    throw new Error(`Failed to create Studio restore owner: ${signup.status} ${JSON.stringify(signup.payload)}`);
  }
  const user = signup.payload?.user && typeof signup.payload.user === "object" ? signup.payload.user : {};
  const accessToken = requireNonEmptyString(
    signup.payload?.access_token || signup.payload?.accessToken,
    "Studio restore owner signup did not return an access token."
  );
  const userID = requireNonEmptyString(
    user.id || user.user_id || user.userId || signup.payload?.user_id || signup.payload?.userId,
    "Studio restore owner signup did not return a user id."
  );
  const session = await requestStudioRestoreJSON({
    baseURL,
    path: "/session",
    method: "POST",
    headers: {
      "X-APP-TOKEN": appToken,
      Authorization: `Bearer ${accessToken}`,
    },
    body: {},
  });
  if (!session.response.ok) {
    throw new Error(`Failed to create Studio restore session: ${session.status} ${JSON.stringify(session.payload)}`);
  }
  const clientToken = requireNonEmptyString(
    session.payload?.client_token || session.payload?.session_id,
    "Studio restore session did not return a client token."
  );
  const expiresIn = Math.max(60, Number(session.payload?.expires_in || 0) || 0);
  return {
    appToken,
    accessToken,
    userID,
    clientToken,
    clientTokenCachedAt: Math.floor(Date.now() / 1000),
    clientTokenExpiry: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

export function studioRestoreOwnerHeaders(identity) {
  return {
    "Content-Type": "application/json",
    "X-APP-TOKEN": requireNonEmptyString(identity?.appToken, "Studio restore identity is missing an app token."),
    Authorization: `Bearer ${requireNonEmptyString(identity?.accessToken, "Studio restore identity is missing an access token.")}`,
    "X-Client-Token": requireNonEmptyString(identity?.clientToken, "Studio restore identity is missing a client token."),
  };
}

export function createStudioRestoreAppLaunchEnvironment(seeded) {
  const baseURL = normalizedBackendBaseURL(seeded?.baseURL);
  const identity = seeded?.identity || {};
  const localState = seeded?.localState || {};
  return {
    THEM_UITEST_BACKEND_BASE_URL: baseURL,
    THEM_UITEST_APP_TOKEN: String(identity.appToken || "them-dev"),
    THEM_UITEST_USER_ID: requireNonEmptyString(identity.userID, "Studio restore identity is missing a user id."),
    THEM_UITEST_CLIENT_TOKEN: requireNonEmptyString(identity.clientToken, "Studio restore identity is missing a client token."),
    THEM_UITEST_CLIENT_TOKEN_CACHED_AT: String(identity.clientTokenCachedAt || Math.floor(Date.now() / 1000)),
    THEM_UITEST_CLIENT_TOKEN_BASE_URL: baseURL,
    THEM_UITEST_CLIENT_TOKEN_EXPIRY: requireNonEmptyString(identity.clientTokenExpiry, "Studio restore identity is missing a client token expiry."),
    THEM_UITEST_AUTH_DEBUG_ACCESS_TOKEN: requireNonEmptyString(identity.accessToken, "Studio restore identity is missing an access token."),
    THEM_UITEST_AUTH_DEBUG_ACCESS_TOKEN_ENABLED: "1",
    THEM_UITEST_AUTH_SIGNED_IN: "1",
    THEM_UITEST_STUDIO_FULL_THREAD_STATE_JSON: String(localState.fullThreadStateJSON || "{}"),
    THEM_UITEST_STUDIO_ASK_NOTE_HISTORY_JSON: String(localState.askHistoryJSON || "{}"),
    THEM_UITEST_STUDIO_DIFF_ACKNOWLEDGED_JSON: String(localState.acknowledgedJSON || "{}"),
    THEM_UITEST_STUDIO_DIFF_ACKNOWLEDGED_WRITEIDS_JSON: String(localState.acknowledgedWriteIDsJSON || "{}"),
  };
}

export function createStudioRestoreUITestFixtureJSON(seeded, { loadToken = Date.now() } = {}) {
  return JSON.stringify({
    baseURL: normalizedBackendBaseURL(seeded?.baseURL),
    appToken: seeded?.identity?.appToken || "them-dev",
    userID: seeded?.identity?.userID || "",
    clientToken: seeded?.identity?.clientToken || "",
    clientTokenCachedAt: seeded?.identity?.clientTokenCachedAt || Math.floor(Date.now() / 1000),
    clientTokenExpiry: seeded?.identity?.clientTokenExpiry || "",
    accessToken: seeded?.identity?.accessToken || "",
    projectID: seeded?.projectID || "",
    projectKey: seeded?.projectKey || "",
    versionID: seeded?.versionID || "",
    loadToken,
    expectedDraft: seeded?.expectedDraft || "",
    expectedFocusedDiffKey: seeded?.expectedFocusedDiffKey || "",
    expectedReopenedWriteID: seeded?.expectedReopenedWriteID || "",
    expectedReopenedLineageKey: seeded?.expectedReopenedLineageKey || "",
    expectedCollaboratorEmail: seeded?.expectedCollaboratorEmail || "",
    expectedCommentText: seeded?.expectedCommentText || "",
    fullThreadStateJSON: seeded?.localState?.fullThreadStateJSON || "{}",
    askHistoryJSON: seeded?.localState?.askHistoryJSON || "{}",
    acknowledgedJSON: seeded?.localState?.acknowledgedJSON || "{}",
    acknowledgedWriteIDsJSON: seeded?.localState?.acknowledgedWriteIDsJSON || "{}",
  });
}

export async function seedBackendStudioRestoreFixture({
  baseURL,
  appToken = "them-dev",
  fixture = createStudioRestoreFixture("reopened"),
  seed = fixture?.reopenedSeed,
  draft = fixture?.draftReopened,
  identity = null,
  collaboratorEmail = "",
  commentText = "",
  title = "",
} = {}) {
  const resolvedBaseURL = normalizedBackendBaseURL(baseURL);
  const resolvedFixture = fixture || createStudioRestoreFixture("reopened");
  const resolvedSeed = seed || resolvedFixture.reopenedSeed;
  const projectID = projectIdFromHistoryKey(resolvedSeed?.projectKey || resolvedFixture.projectKey);
  const projectKey = requireNonEmptyString(resolvedSeed?.projectKey || resolvedFixture.projectKey, "Studio restore seed is missing a project key.");
  const resolvedDraft = requireNonEmptyString(draft || resolvedFixture.draftReopened, "Studio restore fixture is missing a draft.");
  const resolvedIdentity = identity || await createStudioRestoreOwnerIdentity({
    baseURL: resolvedBaseURL,
    appToken,
    emailPrefix: "studio-cross-platform-restore",
  });
  const headers = studioRestoreOwnerHeaders(resolvedIdentity);
  const projectResponse = await requestStudioRestoreJSON({
    baseURL: resolvedBaseURL,
    path: "/screenplay/projects",
    method: "POST",
    headers,
    body: {
      project_id: projectID,
      title: title || resolvedFixture.title || "Studio Restore Contract",
      phase: "scene_draft",
      activate: true,
      studio_thread_view_state: createStudioRestoreThreadViewPayload(resolvedSeed),
      studio_diff_acknowledged_entries: createStudioRestoreDiffAcknowledgedEntries(resolvedSeed),
      studio_ask_note_history: createStudioRestoreAskNoteHistoryPayload(resolvedFixture, resolvedSeed),
    },
  });
  if (!projectResponse.response.ok) {
    throw new Error(`Failed to seed Studio restore project: ${projectResponse.status} ${JSON.stringify(projectResponse.payload)}`);
  }
  const versionResponse = await requestStudioRestoreJSON({
    baseURL: resolvedBaseURL,
    path: `/screenplay/projects/${encodeURIComponent(projectID)}/version`,
    method: "POST",
    headers,
    body: {
      draft: resolvedDraft,
      title: title || resolvedFixture.title || "Studio Restore Contract",
      phase: "scene_draft",
      source: "studio_clementine_page_write",
      base_version_id: "",
    },
  });
  if (!versionResponse.response.ok) {
    throw new Error(`Failed to seed Studio restore project version: ${versionResponse.status} ${JSON.stringify(versionResponse.payload)}`);
  }
  const versionID = requireNonEmptyString(
    versionResponse.payload?.version_id || versionResponse.payload?.server_version_id,
    "Seeded Studio restore version did not return an id."
  );
  const resolvedCollaboratorEmail = (collaboratorEmail || `cross-platform-collab-${projectID}@example.com`).toLowerCase();
  const resolvedCommentText = commentText || `Cross-platform restore note ${projectID}`;
  const collaboratorResponse = await requestStudioRestoreJSON({
    baseURL: resolvedBaseURL,
    path: `/screenplay/projects/${encodeURIComponent(projectID)}/collaborators`,
    method: "POST",
    headers,
    body: {
      email: resolvedCollaboratorEmail,
      action: "approve",
      note: "Seeded before cross-platform Studio restore.",
      invited_by: "studio-cross-platform-restore-contract",
    },
  });
  if (!collaboratorResponse.response.ok) {
    throw new Error(`Failed to seed Studio restore collaborator: ${collaboratorResponse.status} ${JSON.stringify(collaboratorResponse.payload)}`);
  }
  const commentResponse = await requestStudioRestoreJSON({
    baseURL: resolvedBaseURL,
    path: `/screenplay/projects/${encodeURIComponent(projectID)}/comments`,
    method: "POST",
    headers,
    body: {
      text: resolvedCommentText,
      author_email: resolvedCollaboratorEmail,
      author_name: "Studio Cross-Platform Restore",
      actor_email: resolvedCollaboratorEmail,
      anchor_line: 1,
      version_id: versionID,
      type: "text",
      action: "create",
    },
  });
  if (!commentResponse.response.ok) {
    throw new Error(`Failed to seed Studio restore comment: ${commentResponse.status} ${JSON.stringify(commentResponse.payload)}`);
  }
  const commentPayload = commentResponse.payload?.comment && typeof commentResponse.payload.comment === "object"
    ? commentResponse.payload.comment
    : {};
  const commentID = requireNonEmptyString(
    commentPayload.id || commentResponse.payload?.comment_id,
    "Seeded Studio restore comment did not return an id."
  );
  const resolveResponse = await requestStudioRestoreJSON({
    baseURL: resolvedBaseURL,
    path: `/screenplay/projects/${encodeURIComponent(projectID)}/comments`,
    method: "POST",
    headers,
    body: {
      action: "resolve",
      comment_id: commentID,
      actor_email: resolvedCollaboratorEmail,
      author_email: resolvedCollaboratorEmail,
    },
  });
  if (!resolveResponse.response.ok) {
    throw new Error(`Failed to resolve Studio restore comment: ${resolveResponse.status} ${JSON.stringify(resolveResponse.payload)}`);
  }
  const localState = createStudioRestoreLocalStatePayload(resolvedFixture, resolvedSeed);
  const seeded = {
    baseURL: resolvedBaseURL,
    appToken,
    fixture: resolvedFixture,
    seed: resolvedSeed,
    identity: resolvedIdentity,
    headers,
    localState,
    projectID,
    projectKey,
    versionID,
    expectedDraft: resolvedDraft,
    expectedFocusedDiffKey: normalizeStudioRestoreKey(resolvedSeed.focusedDiffKey),
    expectedReopenedWriteID: normalizeStudioRestoreKey(resolvedSeed.latestReopenedWriteID),
    expectedReopenedLineageKey: normalizeStudioRestoreKey(resolvedSeed.reopenedLineageKeys?.[0]),
    expectedCollaboratorEmail: resolvedCollaboratorEmail,
    expectedCommentText: resolvedCommentText,
    projectPayload: projectResponse.payload,
    versionPayload: versionResponse.payload,
    collaboratorPayload: collaboratorResponse.payload,
    commentPayload: commentResponse.payload,
    resolvedCommentPayload: resolveResponse.payload,
  };
  return {
    ...seeded,
    appLaunchEnvironment: createStudioRestoreAppLaunchEnvironment(seeded),
  };
}
