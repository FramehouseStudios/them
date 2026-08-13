import {
  buildCreativeMemoryRevision,
  createCreativeMemoryStore,
} from "../lib/creative_memory_store.js";
import { createPersistence } from "../lib/persistence_adapter.js";
import { startBackend } from "../tests/helpers/backend_test_server.mjs";
import {
  createStudioRestoreOwnerIdentity,
  requestStudioRestoreJSON,
} from "./studio_restore_seed_helper.mjs";

const APP_TOKEN = "them-dev";
const PORT = Number(process.env.THEM_CROSS_DEVICE_MEMORY_CONFLICT_PORT || 31342);
const PROJECT_ID = "cross-device-memory-conflict";
const PROJECT_TITLE = "Cross-Device Memory Conflict";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function headers(identity, device) {
  return {
    "X-APP-TOKEN": identity.appToken,
    "X-CLIENT-TOKEN": `${identity.clientToken}-${device}`,
    Authorization: `Bearer ${identity.accessToken}`,
  };
}

async function getMemories(baseURL, identity, device) {
  const result = await requestStudioRestoreJSON({
    baseURL,
    path: `/memories?story_preference_project_id=${PROJECT_ID}`,
    headers: headers(identity, device),
  });
  assert(result.response.ok, `${device} memory read failed: ${result.status}`);
  const revision = String(result.payload?.creative_memory_revision || "").trim();
  const stateVersion = String(result.payload?.state_version || "").trim();
  assert(/^cm_[a-f0-9]{24}$/.test(revision), `${device} did not receive a creative-memory revision.`);
  assert(/^[a-f0-9]{24}$/.test(stateVersion), `${device} did not receive a memory state version.`);
  return { ...result, revision, stateVersion };
}

async function updateStorySpine(baseURL, identity, device, card, nextScenePlan, stateVersion) {
  return requestStudioRestoreJSON({
    baseURL,
    path: "/memories/update",
    method: "POST",
    headers: {
      ...headers(identity, device),
      "X-State-Version": stateVersion,
    },
    body: {
      card_id: card.id,
      key: card.key,
      title: PROJECT_TITLE,
      summary: nextScenePlan,
      reason: "Cross-device Story Spine correction",
      expected_state_version: stateVersion,
      story_spine: {
        project_id: PROJECT_ID,
        project_title: PROJECT_TITLE,
        next_scene_plan: nextScenePlan,
      },
    },
  });
}

async function updatePreference(baseURL, identity, device, action, revision) {
  return requestStudioRestoreJSON({
    baseURL,
    path: "/memories/story-preferences/update",
    method: "POST",
    headers: headers(identity, device),
    body: {
      project_id: PROJECT_ID,
      project_title: PROJECT_TITLE,
      family: "relationship_pressure",
      action,
      expected_creative_memory_revision: revision,
    },
  });
}

async function updateCharacter(baseURL, identity, device, want, revision) {
  return requestStudioRestoreJSON({
    baseURL,
    path: "/memories/character-bible/update",
    method: "POST",
    headers: headers(identity, device),
    body: {
      card_id: "character-mara",
      key: "character:Mara",
      expected_creative_memory_revision: revision,
      character_bible: {
        character: "Mara",
        arc: { want },
      },
    },
  });
}

function assertOneWinner(results, label) {
  const winner = results.find((item) => item.status === 200);
  const stale = results.find((item) => item.status === 409);
  assert(winner, `${label} did not produce one successful write.`);
  assert(stale, `${label} did not reject the competing stale write.`);
  assert(
    stale.payload?.status === "stale_creative_memory_revision",
    `${label} returned the wrong stale-write contract.`
  );
  assert(
    stale.payload?.current_creative_memory_revision === winner.payload?.creative_memory_revision,
    `${label} did not return the winning revision to the stale device.`
  );
  return { winner, stale };
}

function assertOneStateWinner(results, label) {
  const winner = results.find((item) => item.status === 200);
  const stale = results.find((item) => item.status === 409);
  assert(winner, `${label} did not produce one successful write.`);
  assert(stale, `${label} did not reject the competing stale write.`);
  assert(
    stale.payload?.status === "stale_memory_state_version",
    `${label} returned the wrong stale-state contract.`
  );
  assert(
    stale.payload?.current_state_version === winner.payload?.state_version,
    `${label} did not return the winning state version.`
  );
  return { winner, stale };
}

async function resolveCorrection(baseURL, identity, device, ambiguityId, selectedFacts, revision) {
  return requestStudioRestoreJSON({
    baseURL,
    path: "/memories/corrections/resolve",
    method: "POST",
    headers: headers(identity, device),
    body: {
      ambiguity_id: ambiguityId,
      selected_facts: selectedFacts,
      expected_creative_memory_revision: revision,
    },
  });
}

async function undoCorrection(baseURL, identity, device, receiptId, revision) {
  return requestStudioRestoreJSON({
    baseURL,
    path: "/memories/corrections/undo",
    method: "POST",
    headers: headers(identity, device),
    body: {
      receipt_id: receiptId,
      expected_creative_memory_revision: revision,
    },
  });
}

let server;
let persistence;
try {
  server = await startBackend({
    port: PORT,
    env: {
      APP_TOKEN,
      REQUIRE_USER_AUTH: "1",
    },
  });
  const identity = await createStudioRestoreOwnerIdentity({
    baseURL: server.baseUrl,
    appToken: APP_TOKEN,
    emailPrefix: "cross-device-memory-conflict",
  });
  persistence = createPersistence({ jsonRoot: server.env.PERSISTENCE_JSON_ROOT });
  const store = createCreativeMemoryStore({ persistence });
  const now = Date.now();
  await persistence.put({
    domain: "user_memory",
    key: `byUserId:${identity.userID}`,
    value: {
      userId: identity.userID,
      updatedAt: now,
      memory: {
        lastUpdatedAt: now,
        screenplayProjectMemoryUpdatedAt: now,
        screenplayProjectMemory: [{
          projectId: PROJECT_ID,
          projectTitle: PROJECT_TITLE,
          act: "Act II",
          currentBeat: "Mara watches both ferries pull away.",
          nextScenePlan: "Mara chooses which ferry to follow.",
          unresolvedStoryThreads: ["Which person did Mara abandon?"],
          updatedAt: now,
        }],
      },
    },
  });
  await store.recordProjectContinuity({
    userId: identity.userID,
    continuity: {
      projectId: PROJECT_ID,
      projectTitle: PROJECT_TITLE,
      act: "Act II",
      featureSequence: "Promise of the Premise",
    },
  });
  const acceptedPage = [
    "EXT. EAST FERRY DOCK - NIGHT",
    "",
    "Mara watches two separate ferries pull away.",
  ].join("\n");
  await store.recordTriggersFromTalkTurn({
    userId: identity.userID,
    transcript: "Commit the east ferry dock scene.",
    reply: acceptedPage,
    acceptedPageText: acceptedPage,
    acceptedSceneContext: { anchorSceneId: "scene-east-ferry-dock" },
    projectId: PROJECT_ID,
    projectTitle: PROJECT_TITLE,
    projectContinuity: {
      act: "Act II",
      irreversibleConsequences: [
        "Mara abandons Eli at the east ferry dock.",
        "Mara abandons June at the east ferry dock.",
      ],
    },
    source: "talk_screenplay_output",
  });
  const ambiguitySeed = await store.recordTriggersFromTalkTurn({
    userId: identity.userID,
    transcript: "Actually, Mara never abandons anyone at the ferry dock. She goes back for both of them.",
    projectId: PROJECT_ID,
    projectTitle: PROJECT_TITLE,
    source: "talk_turn",
  });
  const ambiguityId = String(ambiguitySeed?.canonCorrectionAmbiguityId || "");
  const candidateFacts = ambiguitySeed?.canonCorrectionAmbiguity?.candidateFacts || [];
  assert(ambiguityId, "The correction ambiguity seed did not produce an id.");
  assert(candidateFacts.length === 2, "The correction ambiguity seed did not retain both candidate facts.");

  const dataDir = server.dataDir;
  await persistence.close();
  persistence = null;
  await server.stop();
  server = await startBackend({
    port: PORT,
    dataDir,
    env: {
      APP_TOKEN,
      REQUIRE_USER_AUTH: "1",
    },
  });
  persistence = createPersistence({ jsonRoot: server.env.PERSISTENCE_JSON_ROOT });

  const [iphoneRead, macRead] = await Promise.all([
    getMemories(server.baseUrl, identity, "iphone"),
    getMemories(server.baseUrl, identity, "mac"),
  ]);
  assert(iphoneRead.revision === macRead.revision, "Devices did not begin from the same revision.");
  assert(iphoneRead.stateVersion === macRead.stateVersion, "Devices did not begin from the same state version.");

  const storyCard = iphoneRead.payload?.memories?.find((item) => (
    item?.story_spine?.project_id === PROJECT_ID ||
    item?.storySpine?.projectId === PROJECT_ID ||
    item?.key === PROJECT_ID ||
    item?.id === `screenplay-project-${PROJECT_ID}`
  ));
  assert(
    storyCard?.id,
    `The seeded Story Spine card was not restored after backend restart: ${JSON.stringify(iphoneRead.payload?.memories || [])}`
  );
  const storyRace = await Promise.all([
    updateStorySpine(
      server.baseUrl,
      identity,
      "iphone-story",
      storyCard,
      "Mara boards Eli's ferry before the horn.",
      iphoneRead.stateVersion,
    ),
    updateStorySpine(
      server.baseUrl,
      identity,
      "mac-story",
      storyCard,
      "Mara follows June into the terminal.",
      macRead.stateVersion,
    ),
  ]);
  assertOneStateWinner(storyRace, "Story Spine race");
  const afterStoryRace = await getMemories(server.baseUrl, identity, "story-refresh");
  const refreshedStoryCard = afterStoryRace.payload?.memories?.find((item) => item?.id === storyCard.id);
  const storyRetry = await updateStorySpine(
    server.baseUrl,
    identity,
    "iphone-story-retry",
    refreshedStoryCard,
    "Mara goes back for both of them before the final horn.",
    afterStoryRace.stateVersion,
  );
  assert(storyRetry.status === 200, "The refreshed Story Spine retry did not succeed.");
  const afterStoryRetry = await getMemories(server.baseUrl, identity, "story-final");
  const finalStoryCard = afterStoryRetry.payload?.memories?.find((item) => item?.id === storyCard.id);
  const finalStoryPlan = String(
    finalStoryCard?.story_spine?.next_scene_plan ||
      finalStoryCard?.storySpine?.nextScenePlan ||
      ""
  );
  assert(
    finalStoryPlan === "Mara goes back for both of them before the final horn.",
    `The final Story Spine correction was not preserved: ${JSON.stringify(finalStoryCard || null)}`
  );

  const preferenceRace = await Promise.all([
    updatePreference(server.baseUrl, identity, "iphone", "prefer", iphoneRead.revision),
    updatePreference(server.baseUrl, identity, "mac", "avoid", macRead.revision),
  ]);
  const preferenceResult = assertOneWinner(preferenceRace, "Preference race");
  const afterPreference = await getMemories(server.baseUrl, identity, "iphone-refresh");
  assert(
    afterPreference.revision === preferenceResult.winner.payload.creative_memory_revision,
    "The winning preference revision was not visible after refresh."
  );

  const preferenceRetry = await updatePreference(
    server.baseUrl,
    identity,
    "iphone-retry",
    "prefer",
    afterPreference.revision,
  );
  assert(preferenceRetry.status === 200, "The refreshed iPhone preference retry did not succeed.");
  const relationshipPreference = preferenceRetry.payload?.story_move_preferences?.find(
    (item) => item?.family === "relationship_pressure"
  );
  assert(
    relationshipPreference?.explicit_stance === "prefer",
    "The refreshed preference retry did not become authoritative."
  );

  const characterBase = await getMemories(server.baseUrl, identity, "character-race");
  const characterRace = await Promise.all([
    updateCharacter(
      server.baseUrl,
      identity,
      "iphone-character",
      "Control Eli's escape",
      characterBase.revision,
    ),
    updateCharacter(
      server.baseUrl,
      identity,
      "mac-character",
      "Trust Eli with the escape route",
      characterBase.revision,
    ),
  ]);
  const characterResult = assertOneWinner(characterRace, "Character Bible race");
  const finalCharacter = await updateCharacter(
    server.baseUrl,
    identity,
    "iphone-character-retry",
    "Free Eli without becoming her father",
    characterResult.winner.payload.creative_memory_revision,
  );
  assert(finalCharacter.status === 200, "The refreshed Character Bible retry did not succeed.");

  const beforeResolution = await getMemories(server.baseUrl, identity, "resolution-stale-base");
  const interveningPreference = await updatePreference(
    server.baseUrl,
    identity,
    "mac-resolution-intervening-write",
    "avoid",
    beforeResolution.revision,
  );
  assert(interveningPreference.status === 200, "The intervening creative-memory write failed.");
  const staleResolution = await resolveCorrection(
    server.baseUrl,
    identity,
    "iphone-stale-resolution",
    ambiguityId,
    candidateFacts,
    beforeResolution.revision,
  );
  assert(staleResolution.status === 409, "A stale correction resolution was not rejected.");
  assert(
    staleResolution.payload?.status === "stale_creative_memory_revision",
    "The stale correction resolution returned the wrong contract."
  );
  const resolutionRefresh = await getMemories(server.baseUrl, identity, "resolution-refresh");
  const resolvedCorrection = await resolveCorrection(
    server.baseUrl,
    identity,
    "iphone-resolution-retry",
    ambiguityId,
    candidateFacts,
    resolutionRefresh.revision,
  );
  assert(resolvedCorrection.status === 200, "The refreshed correction resolution failed.");
  const resolutionReceiptId = String(resolvedCorrection.payload?.correction_receipt?.id || "");
  assert(resolutionReceiptId, "The correction resolution did not return an undo receipt.");

  const afterResolutionRevision = String(resolvedCorrection.payload?.creative_memory_revision || "");
  const interveningCharacter = await updateCharacter(
    server.baseUrl,
    identity,
    "mac-undo-intervening-write",
    "Free Eli without mistaking control for love",
    afterResolutionRevision,
  );
  assert(interveningCharacter.status === 200, "The intervening Character Bible write failed.");
  const staleUndo = await undoCorrection(
    server.baseUrl,
    identity,
    "iphone-stale-undo",
    resolutionReceiptId,
    afterResolutionRevision,
  );
  assert(staleUndo.status === 409, "A stale correction undo was not rejected.");
  assert(
    staleUndo.payload?.status === "stale_creative_memory_revision",
    "The stale correction undo returned the wrong contract."
  );
  const undoRefresh = await getMemories(server.baseUrl, identity, "undo-refresh");
  const correctedUndo = await undoCorrection(
    server.baseUrl,
    identity,
    "iphone-undo-retry",
    resolutionReceiptId,
    undoRefresh.revision,
  );
  assert(correctedUndo.status === 200, "The refreshed correction undo failed.");

  const finalStore = createCreativeMemoryStore({ persistence });
  const finalLedger = await finalStore.getCreativeMemoryLedger({ userId: identity.userID });
  const mara = finalLedger?.characters?.find((item) => item?.name === "Mara");
  assert(
    mara?.bible?.arc?.want === "Free Eli without mistaking control for love",
    "Undo replaced an unrelated newer Character Bible correction."
  );
  const finalRevision = buildCreativeMemoryRevision(finalLedger);
  assert(
    finalRevision === correctedUndo.payload.creative_memory_revision,
    "The final client and durable creative-memory revisions diverged."
  );

  console.log(JSON.stringify({
    ok: true,
    sameAccount: true,
    devices: ["iPhone", "macOS"],
    preferenceConflictRejected: true,
    characterConflictRejected: true,
    storySpineConflictRejected: true,
    correctionResolutionConflictRejected: true,
    correctionUndoConflictRejected: true,
    refreshedRetrySucceeded: true,
    finalRevision,
    finalStoryPlan,
    finalCharacterWant: mara.bible.arc.want,
  }, null, 2));
  console.log("cross-device-memory-conflict-smoke: ok");
} finally {
  await persistence?.close?.();
  await server?.stop?.();
}
