import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";

import {
  buildProjectFieldProvenance,
  createCreativeMemoryStore,
} from "../lib/creative_memory_store.js";
import { createPersistence } from "../lib/persistence_adapter.js";
import {
  buildScreenplayQuestionPlan,
  createPendingScreenplayLearningQuestion,
} from "../lib/screenplay_question_planner.js";
import { startBackend } from "../tests/helpers/backend_test_server.mjs";
import {
  createStudioRestoreOwnerIdentity,
  requestStudioRestoreJSON,
  studioRestoreOwnerHeaders,
} from "./studio_restore_seed_helper.mjs";

const APP_TOKEN = "them-cross-platform-question-cadence";
const ANSWERED_PROJECT_ID = "question-cadence-answered";
const ANSWERED_PROJECT_TITLE = "The Last Crossing";
const IGNORED_PROJECT_ID = "question-cadence-ignored";
const IGNORED_PROJECT_TITLE = "After the Flood";
const MINUTE_MS = 60 * 1_000;
const TALK_AUDIO = readFileSync(new URL("../test.wav", import.meta.url));

function requireText(value, message) {
  const clean = String(value || "").trim();
  assert.ok(clean, message);
  return clean;
}

function questionInteraction(pending, responseStatus = "asked", respondedAt = 0) {
  return {
    ...pending,
    questionId: pending.id,
    responseStatus,
    respondedAt,
  };
}

function plannerTrace(memory, { projectId, projectTitle }) {
  const project = memory?.projectContinuity && typeof memory.projectContinuity === "object"
    ? memory.projectContinuity
    : {};
  return {
    applied: true,
    project_id: projectId,
    project_title: projectTitle,
    accepted_scenes: (Array.isArray(memory?.acceptedScenes) ? memory.acceptedScenes : [])
      .map((scene) => ({
        scene_heading: scene.sceneHeading ?? scene.scene_heading,
        act: scene.act,
        feature_sequence: scene.featureSequence ?? scene.feature_sequence,
        summary: scene.summary,
        accepted_at: scene.acceptedAt ?? scene.accepted_at,
      })),
    screenplay_project_memory: {
      project_id: projectId,
      project_title: projectTitle,
      act: project.act,
      feature_sequence: project.featureSequence,
      protagonist_want: project.protagonistWant,
      central_question: project.centralQuestion,
      antagonistic_force: project.antagonisticForce,
      protagonist_need: project.protagonistNeed,
      ending_image: project.endingImage,
      theme_argument: project.themeArgument,
      scene_objective: project.sceneObjective,
      next_scene_plan: project.nextScenePlan,
      unresolved_setups: project.unresolvedSetups,
      question_effectiveness: project.questionEffectiveness,
      field_provenance: buildProjectFieldProvenance(project),
    },
  };
}

async function createAuthenticatedProject(server, identity, projectId, title) {
  const result = await requestStudioRestoreJSON({
    baseURL: server.baseUrl,
    path: "/screenplay/projects",
    method: "POST",
    headers: studioRestoreOwnerHeaders(identity),
    body: {
      project_id: projectId,
      title,
      phase: "scene_draft",
      activate: true,
    },
  });
  assert.ok(
    result.response.ok,
    `Authenticated project creation failed with HTTP ${result.status}.`
  );
}

async function refreshClientIdentity(server, identity) {
  const result = await requestStudioRestoreJSON({
    baseURL: server.baseUrl,
    path: "/session",
    method: "POST",
    headers: {
      "X-APP-TOKEN": identity.appToken,
      Authorization: `Bearer ${identity.accessToken}`,
    },
    body: {},
  });
  assert.ok(result.response.ok, `macOS session refresh failed with HTTP ${result.status}.`);
  const expiresIn = Math.max(60, Number(result.payload?.expires_in || 0));
  return {
    ...identity,
    clientToken: requireText(
      result.payload?.client_token,
      "macOS session refresh returned no client token."
    ),
    clientTokenCachedAt: Math.floor(Date.now() / 1_000),
    clientTokenExpiry: new Date(Date.now() + expiresIn * 1_000).toISOString(),
    sessionPayload: result.payload,
  };
}

async function activateProject(server, identity, projectId) {
  const result = await requestStudioRestoreJSON({
    baseURL: server.baseUrl,
    path: `/screenplay/projects/${encodeURIComponent(projectId)}/activate`,
    method: "POST",
    headers: studioRestoreOwnerHeaders(identity),
    body: {},
  });
  assert.ok(result.response.ok, `Project activation failed with HTTP ${result.status}.`);
}

function assertRestoredSessionQuestion(identity, expected) {
  const pending = identity.sessionPayload?.pending_screenplay_question;
  assert.ok(pending, "Session restore did not include the active project's pending question.");
  assert.deepEqual(
    Object.keys(pending).sort(),
    [
      "asked_at",
      "id",
      "project_id",
      "project_title",
      "provisional_options",
      "question",
      "target_field",
      "target_label",
    ],
    "Session restore exposed fields outside the content-safe question contract."
  );
  assert.equal(pending.id, expected.id);
  assert.equal(pending.project_id, expected.projectId);
  assert.equal(pending.project_title, expected.projectTitle);
  assert.equal(pending.target_field, expected.targetField);
  assert.equal(pending.question, expected.question);
  assert.ok(
    Array.isArray(pending.provisional_options),
    "Session restore provisional options must be an array."
  );
  assert.ok(
    pending.provisional_options.length <= 3,
    "Session restore exposed more than three provisional options."
  );
  for (const option of pending.provisional_options) {
    assert.deepEqual(
      Object.keys(option).sort(),
      ["id", "rank", "recommended", "value"],
      "A provisional option exposed fields outside its content-safe contract."
    );
    assert.match(option.id, /^option-[123]$/);
    assert.ok(Number.isInteger(option.rank) && option.rank >= 1 && option.rank <= 3);
    assert.ok(typeof option.recommended === "boolean");
    assert.ok(
      typeof option.value === "string" &&
      option.value.length > 0 &&
      option.value.length <= 360,
      "A provisional option exceeded its bounded story-choice contract."
    );
  }
}

async function assertMacCanRestoreProjects(server, identity) {
  const result = await requestStudioRestoreJSON({
    baseURL: server.baseUrl,
    path: "/screenplay/projects",
    headers: studioRestoreOwnerHeaders(identity),
  });
  assert.ok(result.response.ok, `macOS project restore failed with HTTP ${result.status}.`);
  const projects = Array.isArray(result.payload?.screenplay_projects)
    ? result.payload.screenplay_projects
    : Array.isArray(result.payload?.projects)
      ? result.payload.projects
      : [];
  const ids = new Set(projects.map((project) => String(
    project?.id ?? project?.project_id ?? project?.projectId ?? ""
  )));
  assert.ok(ids.has(ANSWERED_PROJECT_ID), "macOS could not restore the answered project.");
  assert.ok(ids.has(IGNORED_PROJECT_ID), "macOS could not restore the ignored project.");
}

function openMemoryStore(server) {
  // Match the isolated backend's JSON store, never the caller's database.
  const persistence = createPersistence({ databaseUrl: "", jsonRoot: server.env.PERSISTENCE_JSON_ROOT });
  return {
    persistence,
    store: createCreativeMemoryStore({ persistence }),
  };
}

async function seedAccountPendingQuestions(server, identity, pendingQuestions) {
  const pendingPersistence = createPersistence({
    databaseUrl: "",
    jsonRoot: server.env.PERSISTENCE_JSON_ROOT,
  });
  try {
    const key = `byUserId:${identity.userID}`;
    const existing = await pendingPersistence.get({
      domain: "user_memory",
      key,
    });
    const now = Date.now();
    await pendingPersistence.put({
      domain: "user_memory",
      key,
      value: {
        ...(existing && typeof existing === "object" ? existing : {}),
        userId: identity.userID,
        updatedAt: now,
        memory: {
          ...(existing?.memory && typeof existing.memory === "object"
            ? existing.memory
            : {}),
          turns: 3,
          lastUpdatedAt: now,
          pendingScreenplayLearningQuestions: pendingQuestions,
        },
      },
    });
  } finally {
    await pendingPersistence.close();
  }
}

async function postAuthenticatedTalk(server, identity, transcript, {
  projectId,
  projectTitle,
  act,
  featureSequence,
} = {}) {
  const form = new FormData();
  form.append("debug_transcript", transcript);
  form.append("screenplay_project_id", projectId);
  form.append("screenplay_project_title", projectTitle);
  form.append("screenplay_act", act);
  form.append("screenplay_feature_sequence", featureSequence);
  form.append("screenplay_target", "voice_pin");
  form.append("screenplay_prompt_source", "typed");
  form.append("file", new Blob([TALK_AUDIO], { type: "audio/wav" }), "test.wav");
  const response = await fetch(`${server.baseUrl}/talk`, {
    method: "POST",
    headers: {
      "X-APP-TOKEN": identity.appToken,
      Authorization: `Bearer ${identity.accessToken}`,
      "X-Client-Token": identity.clientToken,
    },
    body: form,
  });
  const audio = Buffer.from(await response.arrayBuffer());
  assert.equal(response.status, 200, `Authenticated /talk failed with HTTP ${response.status}.`);
  assert.ok(audio.length > 1_024, "Authenticated /talk returned no usable audio.");
  assert.equal(response.headers.get("x-turn-status"), "responded");
  return {
    turnId: requireText(response.headers.get("x-turn-id"), "Authenticated /talk returned no turn id."),
    transcript: decodeURIComponent(response.headers.get("x-transcript") || ""),
  };
}

let server = null;
let persistence = null;
let dataDir = "";

try {
  const backendEnv = {
    APP_TOKEN,
    REQUIRE_USER_AUTH: "1",
    TALK_TEST_DEBUG_TRANSCRIPT_ENABLED: "1",
    TALK_TEST_DEBUG_OFFLINE_ENABLED: "1",
    TALK_STREAM_AUDIO_ENABLED: "0",
  };
  server = await startBackend({ env: backendEnv });
  dataDir = server.dataDir;
  const iPhoneIdentity = await createStudioRestoreOwnerIdentity({
    baseURL: server.baseUrl,
    appToken: APP_TOKEN,
    emailPrefix: "question-cadence",
  });
  await createAuthenticatedProject(
    server,
    iPhoneIdentity,
    ANSWERED_PROJECT_ID,
    ANSWERED_PROJECT_TITLE
  );
  await createAuthenticatedProject(
    server,
    iPhoneIdentity,
    IGNORED_PROJECT_ID,
    IGNORED_PROJECT_TITLE
  );

  let memory = openMemoryStore(server);
  persistence = memory.persistence;
  let store = memory.store;
  const askedAt = Date.now();

  await store.recordProjectContinuity({
    userId: iPhoneIdentity.userID,
    continuity: {
      projectId: ANSWERED_PROJECT_ID,
      projectTitle: ANSWERED_PROJECT_TITLE,
      act: "Act II",
      featureSequence: "Midpoint Fallout",
      protagonistWant: "Bring her sister home before the ferries stop.",
      centralQuestion: "Can Mara save June without deciding who June must become?",
      antagonisticForce: "The evacuation authority and Mara's need for control.",
      protagonistNeed: "Trust June to choose the risk for herself.",
      endingImage: "The sisters board separate ferries and wave across the water.",
    },
  });
  let answeredMemory = await store.getCreativeMemoryForPrompt({
    userId: iPhoneIdentity.userID,
    projectId: ANSWERED_PROJECT_ID,
    projectTitle: ANSWERED_PROJECT_TITLE,
    query: "The theme is blurry. Help me find what this feature argues.",
  });
  const answeredAskPlan = buildScreenplayQuestionPlan({
    transcript: "The theme is blurry. Help me find what this feature argues.",
    creativeMemoryTrace: plannerTrace(answeredMemory, {
      projectId: ANSWERED_PROJECT_ID,
      projectTitle: ANSWERED_PROJECT_TITLE,
    }),
    studioMeta: {
      screenplayProjectId: ANSWERED_PROJECT_ID,
      screenplayAct: "Act II",
      screenplayFeatureSequence: "Midpoint Fallout",
    },
    turnPlanner: { intent: "idea_development" },
    now: askedAt,
  });
  assert.equal(answeredAskPlan.shouldAsk, true);
  assert.equal(answeredAskPlan.targetField, "project.theme_argument");
  const answeredPending = createPendingScreenplayLearningQuestion(answeredAskPlan, {
    askedAtTurn: 3,
    now: askedAt,
  });
  assert.ok(answeredPending, "iPhone did not create the theme learning question.");
  const answeredAskedReceipt = await store.recordTriggersFromTalkTurn({
    userId: iPhoneIdentity.userID,
    transcript: "Help me sharpen the theme.",
    reply: answeredPending.question,
    projectId: ANSWERED_PROJECT_ID,
    projectTitle: ANSWERED_PROJECT_TITLE,
    questionInteraction: questionInteraction(answeredPending),
  });
  assert.equal(answeredAskedReceipt.questionInteractionsRecorded, 1);

  const ignoredAcceptedAt = askedAt - (40 * MINUTE_MS);
  await store.recordProjectContinuity({
    userId: iPhoneIdentity.userID,
    continuity: {
      projectId: IGNORED_PROJECT_ID,
      projectTitle: IGNORED_PROJECT_TITLE,
      act: "Act III",
      featureSequence: "Resolution",
      protagonistWant: "Get the drowned neighborhood recognized as a crime scene.",
      centralQuestion: "Will Lena expose the city if it costs her the last home she has?",
      antagonisticForce: "The mayor's recovery commission.",
      protagonistNeed: "Stop mistaking isolation for integrity.",
      themeArgument: "Repair begins when private grief becomes public responsibility.",
      acceptedScenes: [{
        anchorSceneId: "ignored-project-resolution-page",
        sceneHeading: "EXT. FLOODED BLOCK - DAWN",
        act: "Act III",
        featureSequence: "Resolution",
        summary: "Lena opens the barricade and lets the displaced families return.",
        acceptedAt: ignoredAcceptedAt,
      }],
    },
  });
  let ignoredMemory = await store.getCreativeMemoryForPrompt({
    userId: iPhoneIdentity.userID,
    projectId: IGNORED_PROJECT_ID,
    projectTitle: IGNORED_PROJECT_TITLE,
    query: "Help me find the final image for the ending.",
  });
  const ignoredAskPlan = buildScreenplayQuestionPlan({
    transcript: "Help me find the final image for the ending.",
    creativeMemoryTrace: plannerTrace(ignoredMemory, {
      projectId: IGNORED_PROJECT_ID,
      projectTitle: IGNORED_PROJECT_TITLE,
    }),
    studioMeta: {
      screenplayProjectId: IGNORED_PROJECT_ID,
      screenplayAct: "Act III",
      screenplayFeatureSequence: "Resolution",
    },
    turnPlanner: { intent: "idea_development" },
    now: askedAt,
  });
  assert.equal(ignoredAskPlan.shouldAsk, true);
  assert.equal(ignoredAskPlan.targetField, "project.ending_image");
  const ignoredPending = createPendingScreenplayLearningQuestion(ignoredAskPlan, {
    askedAtTurn: 0,
    now: askedAt,
  });
  assert.ok(ignoredPending, "iPhone did not create the ending-image learning question.");
  const ignoredAskedReceipt = await store.recordTriggersFromTalkTurn({
    userId: iPhoneIdentity.userID,
    transcript: "Help me solve the ending image.",
    reply: ignoredPending.question,
    projectId: IGNORED_PROJECT_ID,
    projectTitle: IGNORED_PROJECT_TITLE,
    questionInteraction: questionInteraction(ignoredPending),
  });
  assert.equal(ignoredAskedReceipt.questionInteractionsRecorded, 1);

  await persistence.close();
  persistence = null;
  await server.stop();
  server = null;
  await seedAccountPendingQuestions(
    { env: { PERSISTENCE_JSON_ROOT: `${dataDir}/persistence` } },
    iPhoneIdentity,
    [answeredPending, ignoredPending]
  );
  server = await startBackend({ dataDir, env: backendEnv });
  let macIdentity = await refreshClientIdentity(server, iPhoneIdentity);
  assert.notEqual(
    macIdentity.clientToken,
    iPhoneIdentity.clientToken,
    "The two device sessions unexpectedly reused one client credential."
  );
  await assertMacCanRestoreProjects(server, macIdentity);
  assertRestoredSessionQuestion(macIdentity, ignoredPending);

  await activateProject(server, macIdentity, ANSWERED_PROJECT_ID);
  macIdentity = await refreshClientIdentity(server, macIdentity);
  assertRestoredSessionQuestion(macIdentity, answeredPending);

  const answeredTalk = await postAuthenticatedTalk(
    server,
    macIdentity,
    "Love without control means helping someone choose, even when their choice takes them away from you.",
    {
      projectId: ANSWERED_PROJECT_ID,
      projectTitle: ANSWERED_PROJECT_TITLE,
      act: "Act II",
      featureSequence: "Midpoint Fallout",
    }
  );
  assert.match(answeredTalk.transcript, /love without control/i);
  const ignoredTalk = await postAuthenticatedTalk(
    server,
    macIdentity,
    "Let's keep moving through the resolution.",
    {
      projectId: IGNORED_PROJECT_ID,
      projectTitle: IGNORED_PROJECT_TITLE,
      act: "Act III",
      featureSequence: "Resolution",
    }
  );
  assert.match(ignoredTalk.transcript, /keep moving through the resolution/i);

  memory = openMemoryStore(server);
  persistence = memory.persistence;
  store = memory.store;
  const pageReceipt = await store.recordTriggersFromTalkTurn({
    userId: macIdentity.userID,
    transcript: "Keep that page.",
    projectId: ANSWERED_PROJECT_ID,
    projectTitle: ANSWERED_PROJECT_TITLE,
    acceptedPageText: `EXT. WEST FERRY DOCK - BLUE HOUR

Mara loosens her grip on June's ticket. June takes it, then steps onto the opposite ferry.`,
  });
  assert.equal(pageReceipt.questionAcceptedPageOutcomes, 1);

  await persistence.close();
  persistence = null;
  memory = openMemoryStore(server);
  persistence = memory.persistence;
  store = memory.store;

  answeredMemory = await store.getCreativeMemoryForPrompt({
    userId: macIdentity.userID,
    projectId: ANSWERED_PROJECT_ID,
    projectTitle: ANSWERED_PROJECT_TITLE,
    query: "What does this movie argue about love and control?",
  });
  const answeredOutcome = answeredMemory.projectContinuity.questionEffectiveness
    .find((item) => item.questionId === answeredPending.id);
  assert.equal(answeredOutcome.responseStatus, "answered");
  assert.equal(answeredOutcome.acceptedPageCount, 1);
  assert.equal(answeredOutcome.outcome, "accepted_pages");
  assert.match(answeredMemory.projectContinuity.themeArgument, /love without control/i);
  const noDuplicatePlan = buildScreenplayQuestionPlan({
    transcript: "The theme matters here. Help me sharpen what this film argues.",
    creativeMemoryTrace: plannerTrace(answeredMemory, {
      projectId: ANSWERED_PROJECT_ID,
      projectTitle: ANSWERED_PROJECT_TITLE,
    }),
    studioMeta: {
      screenplayProjectId: ANSWERED_PROJECT_ID,
      screenplayAct: "Act II",
      screenplayFeatureSequence: "Midpoint Fallout",
    },
    turnPlanner: { intent: "idea_development" },
    now: Date.now(),
  });
  assert.ok(
    noDuplicatePlan.fieldStates.learned.includes("project.theme_argument"),
    "The learned theme did not survive into planner field state."
  );
  assert.notEqual(
    noDuplicatePlan.targetField,
    "project.theme_argument",
    "macOS re-asked the theme question after learning its answer."
  );

  ignoredMemory = await store.getCreativeMemoryForPrompt({
    userId: macIdentity.userID,
    projectId: IGNORED_PROJECT_ID,
    projectTitle: IGNORED_PROJECT_TITLE,
    query: "Keep developing the resolution.",
  });
  const ignoredOutcome = ignoredMemory.projectContinuity.questionEffectiveness
    .find((item) => item.questionId === ignoredPending.id);
  assert.equal(ignoredOutcome.responseStatus, "expired");
  assert.equal(ignoredOutcome.outcome, "ignored");
  assert.equal(ignoredOutcome.acceptedPageCount, undefined);
  const protectedPlan = buildScreenplayQuestionPlan({
    transcript: "Let's keep developing Act Three.",
    creativeMemoryTrace: plannerTrace(ignoredMemory, {
      projectId: IGNORED_PROJECT_ID,
      projectTitle: IGNORED_PROJECT_TITLE,
    }),
    studioMeta: {
      screenplayProjectId: IGNORED_PROJECT_ID,
      screenplayAct: "Act III",
      screenplayFeatureSequence: "Resolution",
    },
    turnPlanner: { intent: "idea_development" },
    now: ignoredAcceptedAt + (41 * MINUTE_MS),
  });
  assert.equal(protectedPlan.mode, "protect_momentum");
  assert.equal(protectedPlan.shouldAsk, false);
  assert.equal(protectedPlan.writingMomentum.interventionProfile.strategy, "favor_silence");
  assert.equal(protectedPlan.writingMomentum.interventionProfile.windowMinutes, 45);

  const resumedPlan = buildScreenplayQuestionPlan({
    transcript: "Let's keep developing Act Three.",
    creativeMemoryTrace: plannerTrace(ignoredMemory, {
      projectId: IGNORED_PROJECT_ID,
      projectTitle: IGNORED_PROJECT_TITLE,
    }),
    studioMeta: {
      screenplayProjectId: IGNORED_PROJECT_ID,
      screenplayAct: "Act III",
      screenplayFeatureSequence: "Resolution",
    },
    turnPlanner: { intent: "idea_development" },
    now: askedAt + (46 * MINUTE_MS),
  });
  assert.equal(resumedPlan.mode, "develop_then_learn");
  assert.equal(resumedPlan.shouldAsk, true);

  console.log(JSON.stringify({
    ok: true,
    sourceDevice: "iPhone",
    restoredDevice: "macOS",
    backendRestarted: true,
    distinctClientSessions: true,
    activeProjectQuestionRestored: true,
    sessionQuestionContractSafe: true,
    liveTalkResolution: true,
    answeredOutcome: answeredOutcome.outcome,
    ignoredOutcome: ignoredOutcome.outcome,
    cadenceMinutes: protectedPlan.writingMomentum.interventionProfile.windowMinutes,
    duplicateResolvedQuestion: false,
  }));
  console.log("cross-platform-question-cadence-smoke: ok");
} finally {
  if (persistence) await persistence.close().catch(() => {});
  if (server) await server.stop().catch(() => {});
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
}
