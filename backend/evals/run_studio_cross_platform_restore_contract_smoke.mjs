import { spawnSync } from "node:child_process";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  cleanupStudioEvalSessionsWithHelper,
  createStudioEvalDebugContext,
  ensureStudioProjectLoadedWithDebugHook,
  ensureStudioVisibleWithOpenHandshake,
  stageStudioProjectLoadDebugRequest,
} from "./studio_eval_debug_utils.mjs";
import { fetchStudioProjectMetadata } from "./studio_project_metadata_probe.mjs";
import {
  createStudioRestoreAppLaunchEnvironment,
  createStudioRestoreUITestFixtureJSON,
  normalizeStudioRestoreKey,
  normalizeStudioRestoreText,
  requestStudioRestoreJSON,
  seedBackendStudioRestoreFixture,
  studioRestoreOwnerHeaders,
} from "./studio_restore_seed_helper.mjs";
import { createCreativeMemoryStore } from "../lib/creative_memory_store.js";
import { createPersistence } from "../lib/persistence_adapter.js";
import { startBackend } from "../tests/helpers/backend_test_server.mjs";

const ROOT_DIR = fileURLToPath(new URL("../..", import.meta.url));
const STUDIO_APP_SESSION_HELPER = fileURLToPath(
  new URL("./studio_app_session_helper.sh", import.meta.url)
);
const APP_TOKEN = "them-dev";
const CROSS_PLATFORM_PORT = Number(process.env.THEM_CROSS_PLATFORM_RESTORE_CONTRACT_PORT || 31338);
const AUTOMATION_SESSION_ID = `cross-platform-restore-${process.pid}-${Date.now()}`;
const CANON_FACTS = Object.freeze([
  "Mara abandons Eli at the east ferry dock.",
  "Mara abandons June at the east ferry dock.",
]);
const CANON_CORRECTION = "Mara never abandons anyone at the east ferry dock. She goes back for both of them. The unresolved setup is Mara promised to return for Eli and June.";
const LIVE_SYNC_DRAFT_MARKER = "Mara hears both ferry horns answer from the dark water.";
const MAC_PAGE_WRITE_ONE = `INT. KITCHEN - DAY

LUCY reaches the threshold before FRANK can answer, taking the room's silence with her.

FRANK
Lucy--

The door closes softly. That is worse than a slam.`;
const MAC_PAGE_WRITE_TWO = `EXT. FERRY TERMINAL - DAWN

MARA reaches the locked gate as the last ferry pulls away. Across the water, ELI raises the red flare.

MARA
You said we still had time.

She grips the chain, then turns toward the maintenance skiff.`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requireString(value, message) {
  const clean = String(value || "").trim();
  if (!clean) throw new Error(message);
  return clean;
}

function sameTextList(actual, expected) {
  const left = (Array.isArray(actual) ? actual : []).map(normalizeStudioRestoreText).sort();
  const right = (Array.isArray(expected) ? expected : []).map(normalizeStudioRestoreText).sort();
  return JSON.stringify(left) === JSON.stringify(right);
}

function occurrenceCount(text, needle) {
  const source = String(text || "");
  const target = String(needle || "");
  if (!target) return 0;
  return source.split(target).length - 1;
}

function draftFingerprint(value) {
  let hash = 14_695_981_039_346_656_037n;
  const prime = 1_099_511_628_211n;
  const mask = 0xffff_ffff_ffff_ffffn;
  for (const byte of Buffer.from(String(value || ""), "utf8")) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }
  return hash.toString(16);
}

async function seedPendingCanonCorrection(server, seeded) {
  const persistence = createPersistence({
    jsonRoot: server.env.PERSISTENCE_JSON_ROOT,
  });
  const store = createCreativeMemoryStore({ persistence });
  const projectTitle = requireString(
    seeded?.fixture?.title || seeded?.projectPayload?.project?.title,
    "Cross-platform canon seed is missing a project title."
  );
  const page = `EXT. EAST FERRY DOCK - NIGHT

Mara watches two separate ferries pull away.`;
  try {
    await store.recordTriggersFromTalkTurn({
      userId: seeded.identity.userID,
      transcript: "Commit the east ferry dock scene.",
      reply: page,
      acceptedPageText: page,
      acceptedSceneContext: { anchorSceneId: "scene-east-ferry-dock" },
      projectId: seeded.projectID,
      projectTitle,
      projectContinuity: {
        act: "Act II",
        irreversibleConsequences: CANON_FACTS,
      },
      source: "talk_screenplay_output",
    });
    const correction = await store.recordTriggersFromTalkTurn({
      userId: seeded.identity.userID,
      transcript: `Actually, ${CANON_CORRECTION}`,
      projectId: seeded.projectID,
      projectTitle,
      source: "talk_turn",
    });
    const ambiguity = correction?.canonCorrectionAmbiguity;
    assert(ambiguity?.status === "pending", "Canon seed did not produce a pending clarification.");
    assert(
      sameTextList(ambiguity?.candidateFacts, CANON_FACTS),
      `Canon clarification candidates drifted: ${JSON.stringify(ambiguity?.candidateFacts || [])}`
    );
    return {
      ambiguityID: requireString(ambiguity.id, "Canon clarification did not return an id."),
      projectTitle,
      correctionText: requireString(ambiguity.correctionText, "Canon clarification did not preserve the correction."),
      candidateFacts: [...CANON_FACTS],
    };
  } finally {
    await persistence.close();
  }
}

async function resolveCanonCorrectionFromIPhone(seeded, canonSeed) {
  const result = await requestStudioRestoreJSON({
    baseURL: seeded.baseURL,
    path: "/memories/corrections/resolve",
    method: "POST",
    headers: seeded.headers,
    body: {
      ambiguity_id: canonSeed.ambiguityID,
      selected_facts: canonSeed.candidateFacts,
    },
  });
  assert(
    result.response.ok && result.payload?.ok === true,
    `iPhone canon correction failed: ${result.status} ${JSON.stringify(result.payload)}`
  );
  assert(
    ["resolved", "already_resolved"].includes(String(result.payload?.status || "")),
    `Unexpected canon resolution status: ${result.payload?.status || "missing"}`
  );
  const receipt = result.payload?.correction_receipt || {};
  assert(sameTextList(receipt.matched_facts, CANON_FACTS), "Canon receipt did not retire both selected facts.");
  const replacementText = requireString(
    receipt.replacement_facts?.[0],
    "Canon receipt did not return an authoritative replacement."
  );
  assert(
    /goes back for both of them/i.test(replacementText),
    `Canon receipt lost the writer's correction: ${replacementText}`
  );
  return {
    receiptID: requireString(receipt.receipt_id || receipt.id, "Canon correction did not return a receipt id."),
    replacementText,
    stateVersion: String(result.payload?.state_version || ""),
  };
}

async function issueAuthenticatedClient(seeded, label) {
  const session = await requestStudioRestoreJSON({
    baseURL: seeded.baseURL,
    path: "/session",
    method: "POST",
    headers: {
      "X-APP-TOKEN": seeded.identity.appToken,
      Authorization: `Bearer ${seeded.identity.accessToken}`,
    },
    body: {},
  });
  assert(
    session.response.ok,
    `${label} session failed: ${session.status} ${JSON.stringify(session.payload)}`
  );
  const expiresIn = Math.max(60, Number(session.payload?.expires_in || 0) || 0);
  return {
    ...seeded.identity,
    clientToken: requireString(session.payload?.client_token, `${label} session did not return a client token.`),
    clientTokenCachedAt: Math.floor(Date.now() / 1000),
    clientTokenExpiry: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

function seededForClient(seeded, identity, canonSeed, resolution) {
  const clientSeeded = {
    ...seeded,
    identity,
    headers: studioRestoreOwnerHeaders(identity),
    expectedCanonCorrectionTitle: `${canonSeed.projectTitle} Canon Correction`,
    expectedCanonCorrectionText: resolution.replacementText,
    expectedRetiredCanonFacts: [...canonSeed.candidateFacts],
    canonCorrectionReceiptID: resolution.receiptID,
  };
  return {
    ...clientSeeded,
    appLaunchEnvironment: {
      ...createStudioRestoreAppLaunchEnvironment(clientSeeded),
      THEM_STUDIO_AUTOMATION_SESSION_ID: AUTOMATION_SESSION_ID,
    },
  };
}

async function assertCanonCorrectionVisibleToClient(seeded, label) {
  const memories = await requestStudioRestoreJSON({
    baseURL: seeded.baseURL,
    path: "/memories?limit=160",
    method: "GET",
    headers: seeded.headers,
  });
  assert(
    memories.response.ok,
    `${label} memory read failed: ${memories.status} ${JSON.stringify(memories.payload)}`
  );
  const cards = Array.isArray(memories.payload?.memories) ? memories.payload.memories : [];
  const card = cards.find((item) => (
    String(item?.source || "") === "canon_correction"
    && String(item?.correction_receipt?.receipt_id || item?.correction_receipt?.id || "") === seeded.canonCorrectionReceiptID
  ));
  assert(card, `${label} did not receive the resolved canon correction card.`);
  assert(
    normalizeStudioRestoreText(card.title) === normalizeStudioRestoreText(seeded.expectedCanonCorrectionTitle),
    `${label} received the wrong correction title: ${card.title || "missing"}`
  );
  assert(
    /goes back for both of them/i.test(String(card.summary || "")),
    `${label} received a correction card without the writer's story change.`
  );
  assert(
    (card.correction_receipt?.replacement_facts || []).some((fact) => (
      normalizeStudioRestoreText(fact) === normalizeStudioRestoreText(seeded.expectedCanonCorrectionText)
    )),
    `${label} received the wrong authoritative replacement facts.`
  );
  assert(
    sameTextList(card.correction_receipt?.matched_facts, seeded.expectedRetiredCanonFacts),
    `${label} did not receive both retired canon facts.`
  );
  return card;
}

async function saveSharedProjectFromIPhone(seeded) {
  const draft = `${seeded.expectedDraft.trim()}\n\nEXT. EAST FERRY DOCK - NIGHT\n\n${LIVE_SYNC_DRAFT_MARKER}`;
  const result = await requestStudioRestoreJSON({
    baseURL: seeded.baseURL,
    path: `/screenplay/projects/${encodeURIComponent(seeded.projectID)}/version`,
    method: "POST",
    headers: seeded.headers,
    body: {
      draft,
      title: seeded.fixture?.title || "Cross-platform Live Sync",
      phase: "scene_draft",
      source: "studio_clementine_page_write",
      notes: "iPhone live cross-device continuity contract",
      base_version_id: seeded.versionID,
      conflict_strategy: "reject_if_stale",
    },
  });
  assert(
    result.response.ok && result.payload?.conflict !== true,
    `iPhone live screenplay save failed: ${result.status} ${JSON.stringify(result.payload)}`
  );
  const versionID = requireString(
    result.payload?.version_id || result.payload?.version?.id,
    "iPhone live screenplay save did not return a version id."
  );
  assert(versionID !== seeded.versionID, "iPhone live screenplay save reused the stale base version id.");
  const probe = await fetchStudioProjectMetadata(seeded.projectID, seeded.headers, seeded.baseURL);
  assert(probe.response.ok && probe.metadata, "iPhone live screenplay save could not be read back.");
  assert(
    probe.metadata.activeVersionId === normalizeStudioRestoreKey(versionID),
    `iPhone live screenplay save did not become active: ${probe.metadata.activeVersionId}`
  );
  assert(
    String(probe.metadata.activeVersion?.draft || "").trim() === draft,
    "iPhone live screenplay save read back with a different draft."
  );
  assert(
    occurrenceCount(probe.metadata.activeVersion?.draft, LIVE_SYNC_DRAFT_MARKER) === 1,
    "iPhone live screenplay save duplicated its page marker."
  );
  return {
    draft,
    versionID,
    stateVersion: String(result.payload?.state_version || ""),
    probe,
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || result.error?.message || `${command} failed`).trim());
  }
  return (result.stdout || "").trim();
}

function runOptional(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  });
  return {
    status: result.status ?? 1,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || result.error?.message || "").trim(),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildCurrentMacApp() {
  const result = spawnSync("xcodebuild", [
    "build",
    "-project", "them.xcodeproj",
    "-scheme", "them-macOS-scaffold",
    "-configuration", "Mac Scaffold Debug",
    "-destination", "platform=macOS",
    "CODE_SIGNING_ALLOWED=NO",
    "CODE_SIGNING_REQUIRED=NO",
  ], {
    cwd: ROOT_DIR,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  assert(
    result.status === 0,
    "Could not build the current macOS app before the cross-platform restore contract.\n"
      + `stdout:\n${result.stdout || ""}\n`
      + `stderr:\n${result.stderr || ""}`
  );
}

function findDebugAppPath() {
  const direct = process.env.THEM_APP_PATH?.trim();
  if (direct && existsSync(direct)) return direct;

  const discovered = run("/bin/zsh", [
    "-lc",
    `
for config in "Mac Scaffold Debug" "Debug"; do
  candidate="$(
    find ~/Library/Developer/Xcode/DerivedData -path "*/Build/Products/\${config}/them.app/Contents/MacOS/them" -exec stat -f '%m %N' {} \\; \
      | awk '$0 !~ /\\/them_MAIN-/' \
      | sort -nr \
      | head -n 1 \
      | cut -d' ' -f2- \
      | sed 's#/Contents/MacOS/them$##'
  )"
  if [[ -n "$candidate" ]]; then
    printf '%s\\n' "$candidate"
    exit 0
  fi
done
`,
  ]);
  assert(discovered, "Could not locate Debug them.app");
  assert(existsSync(discovered), `Debug app path does not exist: ${discovered}`);
  return discovered;
}

const studioDebug = createStudioEvalDebugContext({ run, runOptional });
const studioApp = studioDebug.ownedApp;

function readDefaultString(key) {
  return studioDebug.readDefaultString(key);
}

function readDefaultInt(key) {
  return studioDebug.readDefaultInt(key);
}

function readDefaultBool(key) {
  return studioDebug.readDefaultBool(key);
}

function writeDefaultString(key, value) {
  studioDebug.writeDefaultString(key, value);
}

function writeDefaultInt(key, value) {
  studioDebug.writeDefaultInt(key, value);
}

function writeDefaultBool(key, value) {
  studioDebug.writeDefaultBool(key, value);
}

function synchronizeDefaults() {
  runOptional("defaults", ["synchronize", "io.them.them"]);
  for (const plistPath of studioDebug.defaults.plistTargets || []) {
    const target = plistPath.endsWith(".plist") ? plistPath.slice(0, -".plist".length) : plistPath;
    runOptional("defaults", ["synchronize", target]);
  }
}

function appIsRunning() {
  return studioApp.isRunning();
}

function currentAppPidForPath(appPath = "") {
  if (!studioApp.isRunning()) return 0;
  return studioApp.pid;
}

function activateApp(appPath = "", appSession = null) {
  studioApp.activate(appPath, appSession);
}

function appHasWindow() {
  return studioApp.hasWindow();
}

function quitApp() {
  cleanupStudioEvalSessionsWithHelper({ runOptional });
}

async function ensureAppStopped() {
  quitApp();
}

function readDebugDiffState() {
  return studioDebug.readDebugDiffState(null);
}

function writeMacRestoreDefaults(seeded) {
  writeDefaultString("app_token", APP_TOKEN);
  writeDefaultString("backend_base_url", seeded.baseURL);
  writeDefaultString("user_id", seeded.identity.userID);
  writeDefaultString("client_token", seeded.identity.clientToken);
  writeDefaultInt("client_token_cached_at", seeded.identity.clientTokenCachedAt);
  writeDefaultString("client_token_base_url", seeded.baseURL);
  writeDefaultString("client_token_expiry", seeded.identity.clientTokenExpiry);
  writeDefaultString("auth_debug_access_token", seeded.identity.accessToken);
  writeDefaultBool("auth_debug_access_token_enabled", true);
  writeDefaultBool("auth_signed_in", true);
  writeDefaultBool("auth_session_token_deletion_pending", false);
  writeDefaultString("studio.full.thread.state.v1", seeded.localState.fullThreadStateJSON);
  writeDefaultString("studio.ask.note.history.v2", "{}");
  writeDefaultString("studio.diff.keep-current.v1", seeded.localState.acknowledgedJSON);
  writeDefaultString("studio.diff.keep-current.writeids.v1", seeded.localState.acknowledgedWriteIDsJSON);
  writeDefaultString("studio_debug_diff_state_json", "");
  writeDefaultString("studio_debug_project_load_trace_json", "[]");
  writeDefaultString("studio_debug_submit_transport_mode", "stub");
  synchronizeDefaults();
}

function expectedCollaborationState(state, seeded) {
  const approvedEmails = Array.isArray(state?.approvedEmails)
    ? state.approvedEmails.map((value) => normalizeStudioRestoreKey(value))
    : [];
  const latestCommentText = normalizeStudioRestoreText(state?.latestCommentText ?? state?.latest_comment_text ?? "");
  const latestCommentAuthor = normalizeStudioRestoreKey(state?.latestCommentAuthor ?? state?.latest_comment_author ?? "");
  return Number(state?.collaboratorCount ?? state?.collaborator_count ?? 0) >= 1
    && approvedEmails.includes(normalizeStudioRestoreKey(seeded.expectedCollaboratorEmail))
    && Number(state?.commentCount ?? state?.comment_count ?? 0) >= 1
    && latestCommentText === normalizeStudioRestoreText(seeded.expectedCommentText)
    && latestCommentAuthor === normalizeStudioRestoreKey(seeded.expectedCollaboratorEmail)
    && Boolean(state?.latestCommentResolved ?? state?.latest_comment_resolved) === true
    && Boolean(state?.latestCommentDeleted ?? state?.latest_comment_deleted) === false;
}

function expectedMacRestoreState(state, seeded, stagedRequest) {
  if (!state) return false;
  const reopenedLineageKeys = Array.isArray(state.restoredReopenedLineageKeys)
    ? state.restoredReopenedLineageKeys.map((value) => normalizeStudioRestoreKey(value))
    : [];
  const draftText = normalizeStudioRestoreText(`${state.draftPreview || ""} ${state.draftTailPreview || ""}`);
  return normalizeStudioRestoreKey(state.projectKey) === normalizeStudioRestoreKey(seeded.projectKey)
    && normalizeStudioRestoreKey(state.selectedProjectID) === normalizeStudioRestoreKey(seeded.projectID)
    && normalizeStudioRestoreKey(state.latestVersionID) === normalizeStudioRestoreKey(seeded.versionID)
    && Boolean(state.selectedProjectPresent)
    && Boolean(state.loadProjectReady)
    && normalizeStudioRestoreKey(state.loadProjectStage) === "editor_ready"
    && Number(state.loadProjectToken || 0) === Number(stagedRequest.token)
    && !normalizeStudioRestoreKey(state.loadProjectError)
    && normalizeStudioRestoreKey(state.restoredFocusedDiffKey) === normalizeStudioRestoreKey(seeded.expectedFocusedDiffKey)
    && reopenedLineageKeys.includes(normalizeStudioRestoreKey(seeded.expectedReopenedLineageKey))
    && normalizeStudioRestoreKey(state.restoredLatestReopenedWriteID) === normalizeStudioRestoreKey(seeded.expectedReopenedWriteID)
    && Number(state.reopenedDiffCount || 0) > 0
    && Number(state.askNoteHistoryCount ?? state.ask_note_history_count ?? 0) >= 3
    && Number(state.backendAskNoteHistoryCount ?? state.backend_ask_note_history_count ?? 0) >= 3
    && normalizeStudioRestoreText(state.latestAskNoteInsertedText ?? state.latest_ask_note_inserted_text ?? "").includes(
      normalizeStudioRestoreText(seeded.expectedDraft)
    )
    && draftText.includes(normalizeStudioRestoreText(seeded.expectedDraft))
    && Number(state.draftCharacterCount || 0) === String(seeded.expectedDraft || "").trim().length
    && expectedCollaborationState(state, seeded);
}

async function waitForMacRestoreState(seeded, stagedRequest) {
  const deadline = Date.now() + 60000;
  let state = null;
  while (Date.now() < deadline) {
    state = readDebugDiffState();
    if (expectedMacRestoreState(state, seeded, stagedRequest)) return state;
    await sleep(300);
  }
  state = readDebugDiffState();
  throw new Error(`macOS did not restore the shared Studio project.\n${JSON.stringify({ seeded, stagedRequest, state }, null, 2)}`);
}

async function submitMacStudioPageWrite(prompt) {
  const token = Math.max(
    Date.now() % 1_000_000_000,
    readDefaultInt("studio_debug_submit_token"),
    readDefaultInt("studio_debug_submit_ack_token"),
    readDefaultInt("studio_debug_submit_result_token")
  ) + 1;
  writeDefaultInt("studio_debug_submit_ack_token", 0);
  writeDefaultInt("studio_debug_submit_result_token", 0);
  writeDefaultString("studio_debug_submit_result_status", "");
  writeDefaultString("studio_debug_submit_result_error", "");
  writeDefaultString("studio_debug_submit_text", prompt);
  writeDefaultString("studio_debug_submit_routing", "page");
  writeDefaultString("studio_debug_submit_replacement_mode", "none");
  writeDefaultInt("studio_debug_submit_token", token);
  synchronizeDefaults();

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const resultToken = readDefaultInt("studio_debug_submit_result_token");
    const status = readDefaultString("studio_debug_submit_result_status").toLowerCase();
    if (resultToken === token && status === "ok") return token;
    if (resultToken === token && status === "error") {
      throw new Error(
        `macOS Studio page write failed: ${readDefaultString("studio_debug_submit_result_error") || "unknown error"}`
      );
    }
    await sleep(100);
  }
  throw new Error(`macOS Studio did not finish page write: ${prompt}`);
}

async function focusMacStudioDiff(diffKey) {
  const token = Math.max(
    Date.now() % 1_000_000_000,
    readDefaultInt("studio_debug_focus_diff_token"),
    readDefaultInt("studio_debug_focus_diff_ack_token")
  ) + 1;
  writeDefaultInt("studio_debug_focus_diff_ack_token", 0);
  writeDefaultString("studio_debug_focus_diff_key", diffKey);
  writeDefaultInt("studio_debug_focus_diff_token", token);
  synchronizeDefaults();

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (readDefaultInt("studio_debug_focus_diff_ack_token") === token) return token;
    await sleep(100);
  }
  throw new Error(`macOS Studio did not focus diff ${diffKey}.`);
}

async function saveTwoAuthoritativePageWritesOnMac(seeded, appPath, originalPID) {
  await submitMacStudioPageWrite("Write the first batch into the screenplay page.");
  await submitMacStudioPageWrite("Write the second batch at the ferry terminal into the screenplay page.");

  const expectedDraft = `${seeded.expectedDraft.trim()}\n\n${MAC_PAGE_WRITE_ONE}\n\n${MAC_PAGE_WRITE_TWO}`;
  const deadline = Date.now() + 30000;
  let probe = null;
  let state = null;
  let focusRequested = false;
  while (Date.now() < deadline) {
    probe = await fetchStudioProjectMetadata(seeded.projectID, seeded.headers, seeded.baseURL);
    state = readDebugDiffState();
    const metadata = probe.metadata;
    const activeDraft = String(metadata?.activeVersion?.draft || "").trim();
    const activeVersionID = normalizeStudioRestoreKey(metadata?.activeVersionId);
    const focusedDiffKey = normalizeStudioRestoreKey(metadata?.focusedDiffKey);
    const stateFocusedDiffKey = normalizeStudioRestoreKey(state?.focusedDiffKey);
    const latestReopenedWriteID = normalizeStudioRestoreKey(metadata?.latestReopenedWriteID);
    const latestReopenedLineageKey = normalizeStudioRestoreKey(state?.latestReopenedLineageKey);
    const reopenedLineageKeys = Array.isArray(metadata?.reopenedLineageKeys)
      ? metadata.reopenedLineageKeys.map((value) => normalizeStudioRestoreKey(value))
      : [];
    const expectedFocusedDiffKey = normalizeStudioRestoreKey(seeded.expectedFocusedDiffKey);
    const expectedReopenedWriteID = normalizeStudioRestoreKey(seeded.expectedReopenedWriteID);
    const expectedReopenedLineageKey = normalizeStudioRestoreKey(seeded.expectedReopenedLineageKey);
    const currentPID = currentAppPidForPath(appPath);
    assert(currentPID === originalPID, `macOS app relaunched during page-write save: ${originalPID} -> ${currentPID || "stopped"}`);
    const exactFinalVersions = (metadata?.versions || []).filter((version) => (
      version.source === "studio_clementine_page_write"
      && String(version.draft || "").trim() === expectedDraft
    ));
    const writesSettled = (
      probe.response.ok
      && activeVersionID
      && activeVersionID !== normalizeStudioRestoreKey(seeded.versionID)
      && activeDraft === expectedDraft
      && occurrenceCount(activeDraft, MAC_PAGE_WRITE_ONE) === 1
      && occurrenceCount(activeDraft, MAC_PAGE_WRITE_TWO) === 1
      && exactFinalVersions.length === 1
      && normalizeStudioRestoreKey(state?.latestVersionID) === activeVersionID
      && Number(state?.draftCharacterCount || 0) === expectedDraft.length
      && normalizeStudioRestoreKey(state?.draftFingerprint) === draftFingerprint(expectedDraft)
      && !Boolean(state?.hasUnsavedDraftChanges)
      && !normalizeStudioRestoreKey(state?.errorText)
    );
    if (writesSettled && !focusRequested) {
      await focusMacStudioDiff(expectedFocusedDiffKey);
      focusRequested = true;
      await sleep(250);
      continue;
    }
    if (
      writesSettled
      && focusRequested
      && focusedDiffKey === expectedFocusedDiffKey
      && stateFocusedDiffKey === expectedFocusedDiffKey
      && latestReopenedWriteID === expectedReopenedWriteID
      && latestReopenedLineageKey === expectedReopenedLineageKey
      && reopenedLineageKeys.includes(expectedReopenedLineageKey)
    ) {
      return {
        draft: expectedDraft,
        versionID: activeVersionID,
        probe,
        state,
        expectedAskNoteText: MAC_PAGE_WRITE_TWO,
        expectedFocusedDiffKey,
        expectedReopenedWriteID,
        expectedReopenedLineageKey,
      };
    }
    await sleep(250);
  }
  throw new Error(`macOS did not persist two authoritative page writes exactly once.\n${JSON.stringify({
    projectID: seeded.projectID,
    initialVersionID: seeded.versionID,
    expectedDraftLength: expectedDraft.length,
    metadata: probe?.metadata || null,
    state: state ? {
      selectedProjectID: state.selectedProjectID,
      latestVersionID: state.latestVersionID,
      focusedDiffKey: state.focusedDiffKey,
      latestReopenedWriteID: state.latestReopenedWriteID,
      latestReopenedLineageKey: state.latestReopenedLineageKey,
      draftCharacterCount: state.draftCharacterCount,
      draftFingerprint: state.draftFingerprint,
      hasUnsavedDraftChanges: state.hasUnsavedDraftChanges,
      autosaveStatusText: state.autosaveStatusText,
      queuedDraftSaveCount: state.queuedDraftSaveCount,
      parkedDraftSaveCount: state.parkedDraftSaveCount,
      debugAutomationSession: state.debugAutomationSession,
      debugAuthSessionAuthenticated: state.debugAuthSessionAuthenticated,
      debugAuthHeaderPresent: state.debugAuthHeaderPresent,
      debugProjectClientOwner: state.debugProjectClientOwner,
      debugProjectClientTokenPresent: state.debugProjectClientTokenPresent,
      errorText: state.errorText,
      infoText: state.infoText,
      conflictPresent: state.conflictPresent,
      conflictBaseVersionID: state.conflictBaseVersionID,
      conflictServerVersionID: state.conflictServerVersionID,
    } : null,
  }, null, 2)}`);
}

async function waitForMacLiveSync({ seeded, versionID, expectedDraft, appPath, originalPID }) {
  const deadline = Date.now() + 30000;
  let state = null;
  while (Date.now() < deadline) {
    state = readDebugDiffState();
    const draftText = normalizeStudioRestoreText(`${state?.draftPreview || ""} ${state?.draftTailPreview || ""}`);
    const currentPID = currentAppPidForPath(appPath);
    assert(currentPID === originalPID, `macOS app relaunched during live sync: ${originalPID} -> ${currentPID || "stopped"}`);
    if (
      normalizeStudioRestoreKey(state?.selectedProjectID) === normalizeStudioRestoreKey(seeded.projectID)
      && normalizeStudioRestoreKey(state?.latestVersionID) === normalizeStudioRestoreKey(versionID)
      && draftText.includes(normalizeStudioRestoreText(LIVE_SYNC_DRAFT_MARKER))
      && Number(state?.draftCharacterCount || 0) === String(expectedDraft || "").trim().length
      && normalizeStudioRestoreKey(state?.draftFingerprint) === draftFingerprint(String(expectedDraft || "").trim())
      && !normalizeStudioRestoreKey(state?.errorText)
    ) {
      return state;
    }
    await sleep(300);
  }
  state = readDebugDiffState();
  throw new Error(`macOS did not receive the live iPhone screenplay save.\n${JSON.stringify({
    projectID: seeded.projectID,
    versionID,
    originalPID,
    currentPID: currentAppPidForPath(appPath),
    state,
  }, null, 2)}`);
}

async function assertBackendSeeded(seeded) {
  const probe = await fetchStudioProjectMetadata(seeded.projectID, seeded.headers, seeded.baseURL);
  assert(probe.response.ok, `Backend project probe failed: ${probe.response.status} ${JSON.stringify(probe.payload)}`);
  assert(probe.metadata, "Backend project probe returned no metadata.");
  assert(
    probe.metadata.activeVersionId === normalizeStudioRestoreKey(seeded.versionID),
    `Expected active version ${seeded.versionID}, got ${probe.metadata.activeVersionId}`
  );
  assert(
    normalizeStudioRestoreText(probe.metadata.activeVersion?.draft) === normalizeStudioRestoreText(seeded.expectedDraft),
    "Backend active draft did not match the shared restore draft."
  );
  assert(
    probe.metadata.focusedDiffKey === normalizeStudioRestoreKey(seeded.expectedFocusedDiffKey),
    `Expected backend focused diff ${seeded.expectedFocusedDiffKey}, got ${probe.metadata.focusedDiffKey}`
  );
  assert(
    probe.metadata.latestReopenedWriteID === normalizeStudioRestoreKey(seeded.expectedReopenedWriteID),
    `Expected backend reopened write ${seeded.expectedReopenedWriteID}, got ${probe.metadata.latestReopenedWriteID}`
  );
  assert(
    probe.metadata.reopenedLineageKeys.includes(normalizeStudioRestoreKey(seeded.expectedReopenedLineageKey)),
    `Expected backend reopened lineage ${seeded.expectedReopenedLineageKey}, got ${probe.metadata.reopenedLineageKeys.join(",")}`
  );
  assert(
    Number(probe.metadata.askNoteHistoryCount || 0) >= 3,
    `Expected backend ask-note history to be seeded, got ${probe.metadata.askNoteHistoryCount || 0}`
  );
  assert(
    probe.metadata.askNoteHistory.some((entry) => (
      normalizeStudioRestoreText(entry.insertedText)
        === normalizeStudioRestoreText(seeded.expectedAskNoteText || seeded.expectedDraft)
    )),
    "Expected backend ask-note history to include the shared restore write."
  );
  return probe;
}

async function restoreSharedProjectOnMac(seeded) {
  const appPath = findDebugAppPath();
  await ensureAppStopped();
  writeDefaultString("studio_debug_target_session_id", AUTOMATION_SESSION_ID);
  writeMacRestoreDefaults(seeded);
  const stagedRequest = stageStudioProjectLoadDebugRequest({
    debugDefaults: studioDebug.defaults,
    projectId: seeded.projectID,
    versionId: seeded.versionID,
  });
  const openResult = await ensureStudioVisibleWithOpenHandshake({
    appPath,
    helperPath: STUDIO_APP_SESSION_HELPER,
    debugDefaults: studioDebug.defaults,
    launchEnvironment: seeded.appLaunchEnvironment,
    runOptional,
    activateApp,
    appHasWindow,
    readDebugDiffState,
  });
  await ensureStudioProjectLoadedWithDebugHook({
    debugDefaults: studioDebug.defaults,
    projectId: seeded.projectID,
    versionId: seeded.versionID,
    readDebugDiffState,
    timeoutMs: 45000,
    stagedRequest,
  });
  const restoredState = await waitForMacRestoreState(seeded, stagedRequest);
  return {
    appPath,
    appSession: openResult.appSession,
    stagedRequest,
    restoredState,
  };
}

function restoreSharedProjectOniPhone(seeded) {
  const testName = "test_cross_platform_project_and_canon_correction_survive_restart";
  const backendOnlySeeded = {
    ...seeded,
    localState: {
      ...seeded.localState,
      askHistoryJSON: "{}",
    },
  };
  const fixtureJSON = createStudioRestoreUITestFixtureJSON(backendOnlySeeded, {
    loadToken: Date.now() % 1_000_000_000,
  });
  const fixtureBase64URL = Buffer.from(fixtureJSON, "utf8").toString("base64url");
  const xcconfigPath = `/tmp/them_studio_cross_platform_restore_${process.pid}.xcconfig`;
  writeFileSync(
    xcconfigPath,
    `THEM_UITEST_RESTORE_FIXTURE_BASE64URL = ${fixtureBase64URL}\n`,
    { encoding: "utf8", mode: 0o600 }
  );
  let child;
  try {
    child = spawnSync("bash", ["scripts/run_v1_ui_smoke.sh"], {
      cwd: ROOT_DIR,
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
      env: {
        ...process.env,
        ONLY_TESTING: `themUITests/V1SmokeUITests/${testName}`,
        THEM_UITEST_RESTORE_XCCONFIG_PATH: xcconfigPath,
      },
    });
  } finally {
    if (existsSync(xcconfigPath)) unlinkSync(xcconfigPath);
  }
  const combinedOutput = `${child.stdout || ""}\n${child.stderr || ""}`;
  if (child.status !== 0) {
    throw new Error(
      "iPhone did not restore the shared Studio project.\n"
      + `status=${child.status}\n`
      + `stdout:\n${child.stdout || ""}\n`
      + `stderr:\n${child.stderr || ""}`
    );
  }
  const namedTestSkipped = new RegExp(`Test Case .*${testName}.* skipped`, "i").test(combinedOutput);
  if (/Executed 0 tests/.test(combinedOutput) || namedTestSkipped) {
    throw new Error(
      "iPhone cross-platform restore UI test did not execute the restore assertion.\n"
      + `stdout:\n${child.stdout || ""}\n`
      + `stderr:\n${child.stderr || ""}`
    );
  }
  process.stdout.write(child.stdout || "");
  process.stderr.write(child.stderr || "");
  return { output: combinedOutput };
}

const restoreKeys = [
  "studio.full.thread.state.v1",
  "studio.diff.keep-current.v1",
  "studio.diff.keep-current.writeids.v1",
  "studio.ask.note.history.v2",
  "studio_debug_diff_state_json",
  "studio_debug_project_load_trace_json",
  "studio_debug_submit_transport_mode",
  "studio_debug_submit_text",
  "studio_debug_submit_routing",
  "studio_debug_submit_replacement_mode",
  "studio_debug_submit_ack_text",
  "studio_debug_submit_ack_routing",
  "studio_debug_submit_ack_replacement_mode",
  "studio_debug_submit_ack_request_id",
  "studio_debug_submit_result_status",
  "studio_debug_submit_result_error",
  "studio_debug_submit_result_json",
  "studio_debug_focus_diff_key",
  "app_token",
  "backend_base_url",
  "client_token",
  "user_id",
  "client_token_base_url",
  "client_token_expiry",
  "auth_debug_access_token",
  "studio_debug_load_project_id",
  "studio_debug_load_project_version_id",
  "studio_debug_target_session_id",
];
const restoreIntKeys = [
  "client_token_cached_at",
  "studio_debug_load_project_token",
  "studio_debug_load_project_ack_token",
  "studio_debug_submit_token",
  "studio_debug_submit_command_received_token",
  "studio_debug_submit_ack_token",
  "studio_debug_submit_result_token",
  "studio_debug_focus_diff_token",
  "studio_debug_focus_diff_ack_token",
];
const restoreBoolKeys = [
  "auth_debug_access_token_enabled",
  "auth_signed_in",
  "auth_session_token_deletion_pending",
];
const originalStringValues = Object.fromEntries(restoreKeys.map((key) => [key, readDefaultString(key)]));
const originalIntValues = Object.fromEntries(restoreIntKeys.map((key) => [key, readDefaultInt(key)]));
const originalBoolValues = Object.fromEntries(restoreBoolKeys.map((key) => [key, readDefaultBool(key)]));

let server = null;
try {
  buildCurrentMacApp();
  const backendEnv = {
    APP_TOKEN,
    REQUIRE_USER_AUTH: "1",
  };
  server = await startBackend({
    port: CROSS_PLATFORM_PORT,
    env: backendEnv,
  });

  const initialSeeded = await seedBackendStudioRestoreFixture({
    baseURL: server.baseUrl,
    appToken: APP_TOKEN,
  });
  const canonSeed = await seedPendingCanonCorrection(server, initialSeeded);
  const resolution = await resolveCanonCorrectionFromIPhone(initialSeeded, canonSeed);

  const preRestartMacIdentity = await issueAuthenticatedClient(initialSeeded, "pre-restart Mac");
  const preRestartMacSeeded = seededForClient(
    initialSeeded,
    preRestartMacIdentity,
    canonSeed,
    resolution
  );
  await assertCanonCorrectionVisibleToClient(preRestartMacSeeded, "pre-restart Mac");

  const dataDir = server.dataDir;
  await server.stop();
  server = null;
  server = await startBackend({
    port: CROSS_PLATFORM_PORT,
    dataDir,
    env: backendEnv,
  });

  const restartedBaseSeed = {
    ...initialSeeded,
    baseURL: server.baseUrl,
  };
  const macIdentity = await issueAuthenticatedClient(restartedBaseSeed, "restarted Mac");
  const macSeeded = seededForClient(restartedBaseSeed, macIdentity, canonSeed, resolution);
  const restartedCanonCard = await assertCanonCorrectionVisibleToClient(macSeeded, "restarted Mac");
  const backendProbe = await assertBackendSeeded(macSeeded);
  const mac = await restoreSharedProjectOnMac(macSeeded);

  const iphoneIdentity = await issueAuthenticatedClient(restartedBaseSeed, "restarted iPhone");
  const iphoneSeeded = seededForClient(restartedBaseSeed, iphoneIdentity, canonSeed, resolution);
  await assertCanonCorrectionVisibleToClient(iphoneSeeded, "restarted iPhone");
  const macPIDBeforeLiveSync = currentAppPidForPath(mac.appPath);
  assert(macPIDBeforeLiveSync > 0, "Could not identify the running macOS app before live sync.");
  const macPageWriteSave = await saveTwoAuthoritativePageWritesOnMac(
    macSeeded,
    mac.appPath,
    macPIDBeforeLiveSync
  );
  const iphoneWriteBaseSeeded = {
    ...iphoneSeeded,
    expectedDraft: macPageWriteSave.draft,
    expectedAskNoteText: macPageWriteSave.expectedAskNoteText,
    expectedFocusedDiffKey: macPageWriteSave.expectedFocusedDiffKey,
    expectedReopenedWriteID: macPageWriteSave.expectedReopenedWriteID,
    expectedReopenedLineageKey: macPageWriteSave.expectedReopenedLineageKey,
    versionID: macPageWriteSave.versionID,
  };
  const liveSave = await saveSharedProjectFromIPhone(iphoneWriteBaseSeeded);
  await server.stop();
  server = null;
  server = await startBackend({
    port: CROSS_PLATFORM_PORT,
    dataDir,
    env: backendEnv,
  });
  const postIPhoneRestartSeeded = {
    ...iphoneWriteBaseSeeded,
    baseURL: server.baseUrl,
    expectedDraft: liveSave.draft,
    versionID: liveSave.versionID,
  };
  await assertBackendSeeded(postIPhoneRestartSeeded);
  const liveMacState = await waitForMacLiveSync({
    seeded: postIPhoneRestartSeeded,
    versionID: liveSave.versionID,
    expectedDraft: liveSave.draft,
    appPath: mac.appPath,
    originalPID: macPIDBeforeLiveSync,
  });
  const liveIPhoneSeeded = {
    ...postIPhoneRestartSeeded,
    expectedDraft: liveSave.draft,
    versionID: liveSave.versionID,
  };
  const iphone = restoreSharedProjectOniPhone(liveIPhoneSeeded);
  console.log(JSON.stringify({
    ok: true,
    projectID: macSeeded.projectID,
    versionID: macSeeded.versionID,
    canon: {
      ambiguityID: canonSeed.ambiguityID,
      receiptID: resolution.receiptID,
      retiredFacts: canonSeed.candidateFacts.length,
      replacement: restartedCanonCard.summary,
      survivedBackendRestart: true,
    },
    backend: backendProbe.metadata,
    mac: {
      appPath: mac.appPath,
      stagedRequest: mac.stagedRequest,
      restoredProjectID: mac.restoredState?.selectedProjectID || "",
      restoredVersionID: mac.restoredState?.latestVersionID || "",
    },
    liveSync: {
      source: "iPhone",
      destination: "macOS",
      survivedBackendRestartAfterIPhoneSave: true,
      macPID: macPIDBeforeLiveSync,
      versionID: liveSave.versionID,
      stateVersion: liveSave.stateVersion,
      receivedWithoutRelaunch: currentAppPidForPath(mac.appPath) === macPIDBeforeLiveSync,
      draftMarkerVisible: normalizeStudioRestoreText(
        `${liveMacState?.draftPreview || ""} ${liveMacState?.draftTailPreview || ""}`
      ).includes(normalizeStudioRestoreText(LIVE_SYNC_DRAFT_MARKER)),
    },
    authoritativePageWrites: {
      source: "macOS",
      destination: "backend",
      versionID: macPageWriteSave.versionID,
      exactFinalVersionCount: macPageWriteSave.probe.metadata.versions.filter((version) => (
        version.source === "studio_clementine_page_write"
        && String(version.draft || "").trim() === macPageWriteSave.draft
      )).length,
      firstBatchOccurrences: occurrenceCount(macPageWriteSave.draft, MAC_PAGE_WRITE_ONE),
      secondBatchOccurrences: occurrenceCount(macPageWriteSave.draft, MAC_PAGE_WRITE_TWO),
    },
    iphone: {
      outputBytes: iphone.output.length,
    },
  }, null, 2));
  console.log("studio-cross-platform-restore-contract-smoke: ok");
} catch (error) {
  if (server) {
    const backendStdout = server.stdout.join("").trim();
    const backendStderr = server.stderr.join("").trim();
    if (backendStdout) console.error(`cross-platform restore backend stdout:\n${backendStdout}`);
    if (backendStderr) console.error(`cross-platform restore backend stderr:\n${backendStderr}`);
  }
  throw error;
} finally {
  try {
    quitApp();
  } catch (cleanupError) {
    console.error(`Studio eval cleanup failed: ${cleanupError?.message || cleanupError}`);
  }
  for (const [key, value] of Object.entries(originalStringValues)) {
    writeDefaultString(key, value);
  }
  for (const [key, value] of Object.entries(originalIntValues)) {
    writeDefaultInt(key, value);
  }
  for (const [key, value] of Object.entries(originalBoolValues)) {
    writeDefaultBool(key, value);
  }
  synchronizeDefaults();
  if (server) {
    await server.stop();
  }
}
