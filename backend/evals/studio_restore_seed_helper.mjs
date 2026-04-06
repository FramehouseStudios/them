import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
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

function projectIdFromHistoryKey(value) {
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
