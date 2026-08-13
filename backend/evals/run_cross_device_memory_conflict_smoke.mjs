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
  assert(/^cm_[a-f0-9]{24}$/.test(revision), `${device} did not receive a creative-memory revision.`);
  return { ...result, revision };
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
  await store.recordProjectContinuity({
    userId: identity.userID,
    continuity: {
      projectId: PROJECT_ID,
      projectTitle: PROJECT_TITLE,
      act: "Act II",
      featureSequence: "Promise of the Premise",
    },
  });

  const [iphoneRead, macRead] = await Promise.all([
    getMemories(server.baseUrl, identity, "iphone"),
    getMemories(server.baseUrl, identity, "mac"),
  ]);
  assert(iphoneRead.revision === macRead.revision, "Devices did not begin from the same revision.");

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

  const finalLedger = await store.getCreativeMemoryLedger({ userId: identity.userID });
  const mara = finalLedger?.characters?.find((item) => item?.name === "Mara");
  assert(
    mara?.bible?.arc?.want === "Free Eli without becoming her father",
    "The final writer correction was not preserved after the device race."
  );
  const finalRevision = buildCreativeMemoryRevision(finalLedger);
  assert(
    finalRevision === finalCharacter.payload.creative_memory_revision,
    "The final client and durable creative-memory revisions diverged."
  );

  console.log(JSON.stringify({
    ok: true,
    sameAccount: true,
    devices: ["iPhone", "macOS"],
    preferenceConflictRejected: true,
    characterConflictRejected: true,
    refreshedRetrySucceeded: true,
    finalRevision,
    finalCharacterWant: mara.bible.arc.want,
  }, null, 2));
  console.log("cross-device-memory-conflict-smoke: ok");
} finally {
  await persistence?.close?.();
  await server?.stop?.();
}
