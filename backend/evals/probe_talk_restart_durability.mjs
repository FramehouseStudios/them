// T-1118 focused local gate: actual auth + /talk + wallet + restart, with
// deterministic intercepted providers. Never point this at production or load
// a private .env file.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import { randomUUID } from "node:crypto";

import { startBackend, apiRequest } from "../tests/helpers/backend_test_server.mjs";
import { createPersistence } from "../lib/persistence_adapter.js";
import { createAdapterWalletPersistence, createPostgresWalletPersistence } from "../lib/clementine/wallet_persistence.js";

const databaseUrl = String(process.env.THEM_TALK_RESTART_TEST_DATABASE_URL || '');
if (databaseUrl && !['127.0.0.1', 'localhost'].includes(new URL(databaseUrl).hostname)) throw new Error('Only an explicitly task-owned localhost database is allowed');
const unsetEnv = databaseUrl ? ['REDIS_URL'] : ['DATABASE_URL', 'REDIS_URL'];

const appToken = "them-t1118-local-proof";
const env = {
  ...(databaseUrl ? {DATABASE_URL: databaseUrl} : {}),
  APP_TOKEN: appToken,
  REQUIRE_USER_AUTH: "1",
  CLEMENTINE_PROVIDER: "openai",
  CLEMENTINE_MUSE_ENABLED: "0",
  MUSE_ENABLED: "0",
  LLM_PROVIDER: "openai",
  TALK_TEST_DEBUG_TRANSCRIPT_ENABLED: "0",
  TALK_TEST_DEBUG_OFFLINE_ENABLED: "0",
  TALK_STREAM_AUDIO_ENABLED: "0",
  CHAT_STREAM_ENABLED: "0",
  KNOWLEDGE_RAG_EMBEDDINGS_ENABLED: "0",
  THEM_HOME_VOICE_PROVIDER_FIXTURE: "1",
  NODE_OPTIONS: `--import=${new URL("./home_voice_provider_fixture.mjs", import.meta.url).href}`,
};
const audio = fs.readFileSync(new URL("../response.mp3", import.meta.url));
const generationTranscript = "Write a story about two astronauts who discover the observatory sky is a painted set. Put HOME VOICE HANDOFF on the panel.";

function providerCounts(server) {
  const log = server.stdout.join("");
  return Object.fromEntries(["stt", "chat", "tts"].map((name) => [
    name,
    log.split(`mocked_${name}`).length - 1,
  ]));
}

async function writer(server, label) {
  const signup = await apiRequest(server, "/auth/signup", {
    method: "POST",
    json: {
      email: `t1118-${label}-${randomUUID()}@example.test`,
      password: "Local-proof-only-aA1!",
    },
  });
  assert.equal(signup.status, 201);
  return {
    userId: signup.json.user?.user_id || signup.json.user?.id,
    auth: { Authorization: `Bearer ${signup.json.access_token || signup.json.token}` },
  };
}

async function sessionHeaders(server, identity) {
  const session = await apiRequest(server, "/session", {
    method: "POST",
    headers: identity.auth,
    json: {},
  });
  assert.equal(session.status, 201);
  return {
    ...identity.auth,
    "X-APP-TOKEN": appToken,
    "X-Client-Token": session.json.client_token,
  };
}

function talkForm(projectId) {
  const form = new FormData();
  form.append("screenplay_project_id", projectId);
  form.append("screenplay_target", "page");
  form.append("screenplay_prompt_source", "voice");
  form.append("screenplay_generation_transcript", generationTranscript);
  form.append("speech_ms", "3000");
  form.append("tail_silence_ms", "900");
  form.append("file", new Blob([audio], { type: "audio/mpeg" }), "fixture.mp3");
  return form;
}

async function talk(server, headers, projectId, idempotencyKey) {
  const response = await fetch(server.baseUrl + "/talk", {
    method: "POST",
    headers: { ...headers, "X-Idempotency-Key": idempotencyKey },
    body: talkForm(projectId),
  });
  const body = Buffer.from(await response.arrayBuffer());
  return {
    status: response.status,
    body,
    headerBytes: [...response.headers].reduce((total, [name, value]) => total + Buffer.byteLength(`${name}: ${value}\r\n`), 0),
    turnId: response.headers.get("x-turn-id"),
    replay: response.headers.get("x-idempotency-replay"),
    authoritative: response.headers.get("x-screenplay-authoritative"),
    reply: response.headers.get("x-reply"),
    screenplayOutput: response.headers.get("x-screenplay-output"),
  };
}

async function forcedStop(server) {
  if (server.child.exitCode != null) return;
  server.child.kill("SIGKILL");
  await once(server.child, "exit");
}

let server = await startBackend({ unsetEnv, env });
const dataDir = server.dataDir;
const observations = { providerMode: "intercepted; no paid calls", persistence: databaseUrl ? 'postgres' : 'json' };
try {
  const owner = await writer(server, "owner");
  const other = await writer(server, "other");
  await server.stop();

  const persistence = createPersistence({ databaseUrl, jsonRoot: path.join(dataDir, "persistence") });
  const funding = databaseUrl ? createPostgresWalletPersistence({client: persistence}) : createAdapterWalletPersistence({persistence});
  await funding.putBalance({
    ownerId: owner.userId,
    pageMilliturns: 100_000,
    companionMilliturns: 0,
    grantedPageMilliturns: 100_000,
    grantedCompanionMilliturns: 0,
  });
  await persistence.close();

  server = await startBackend({ dataDir, unsetEnv, env });
  let ownerHeaders = await sessionHeaders(server, owner);
  const otherHeaders = await sessionHeaders(server, other);
  const created = await apiRequest(server, "/screenplay/projects", {
    method: "POST",
    headers: ownerHeaders,
    json: { title: "T-1118 restart proof" },
  });
  assert.equal(created.status, 201);
  const projectId = created.json.project_id || created.json.project?.id;
  assert.ok(projectId);
  const seeded = await apiRequest(server, `/screenplay/projects/${projectId}/version`, {
    method: "POST",
    headers: ownerHeaders,
    json: { draft: "INT. OBSERVATORY - NIGHT\n\nOriginal exact words." },
  });
  assert.ok([200, 201].includes(seeded.status));
  const balance = async () => (await apiRequest(server, "/talk/wallet", {
    method: "POST",
    headers: owner.auth,
    json: { owner_id: owner.userId },
  })).json;

  const beforeBalance = await balance();
  const gracefulKey = `t1118-graceful-${randomUUID()}`;
  const accepted = await talk(server, ownerHeaders, projectId, gracefulKey);
  assert.equal(accepted.status, 200);
  assert.equal(accepted.authoritative, "1");
  assert.ok(accepted.turnId);
  const acceptedBalance = await balance();
  const initialCalls = providerCounts(server);
  const preRestartOwner = await apiRequest(server, `/talk/turn/${accepted.turnId}`, { headers: ownerHeaders });
  const preRestartOther = await apiRequest(server, `/talk/turn/${accepted.turnId}`, { headers: otherHeaders });
  observations.beforeRestart = {
    turnId: accepted.turnId,
    bytes: accepted.body.length,
    ownerRead: preRestartOwner.status,
    otherRead: preRestartOther.status,
    providerCalls: initialCalls,
    balanceChanged: JSON.stringify(beforeBalance) !== JSON.stringify(acceptedBalance),
  };
  assert.equal(preRestartOwner.status, 200);
  assert.equal(preRestartOther.status, 403);
  const scene = String(preRestartOwner.json.screenplay_output?.text || '');
  assert.ok(scene.includes('HOME VOICE HANDOFF'));
  assert.ok(accepted.headerBytes <= 8192, 'Actual reply headers exceeded the product budget.');
  const exported = await apiRequest(server, '/account/export', { headers: owner.auth });
  const otherExported = await apiRequest(server, '/account/export', { headers: other.auth });
  assert.equal(exported.status, 200);
  assert.equal(otherExported.status, 200);
  assert.ok(exported.json.domains.talk_turns.some(row => row.value.userId === owner.userId));
  assert.ok(exported.json.domains.talk_idempotency.some(row => row.value.userId === owner.userId));
  assert.equal(otherExported.json.domains.talk_turns.length, 0);
  assert.equal(otherExported.json.domains.talk_idempotency.length, 0);
  const exportedTalk = JSON.stringify([exported.json.domains.talk_turns, exported.json.domains.talk_idempotency]);
  assert.ok(!exportedTalk.includes(ownerHeaders['X-Client-Token']), 'New recovery exports exposed session authority.');
  const gracefulStop = await server.stop();

  server = await startBackend({ dataDir, unsetEnv, env });
  ownerHeaders = await sessionHeaders(server, owner);
  const ownerAfterRestart = await apiRequest(server, `/talk/turn/${accepted.turnId}`, { headers: owner.auth });
  const otherAfterRestart = await apiRequest(server, `/talk/turn/${accepted.turnId}`, { headers: other.auth });
  const gracefulReplay = await talk(server, ownerHeaders, projectId, gracefulKey);
  const gracefulReplayCalls = providerCounts(server);
  const balanceAfterReplay = await balance();
  assert.ok(Buffer.from(String(ownerAfterRestart.json.screenplay_output?.text || '')).equals(Buffer.from(scene)), 'Graceful restart lost full page text.');
  assert.ok(gracefulReplay.headerBytes <= 8192);
  observations.gracefulRestart = {
    forced: gracefulStop.forced,
    ownerRead: ownerAfterRestart.status,
    otherRead: otherAfterRestart.status,
    replayHeader: gracefulReplay.replay,
    sameTurn: gracefulReplay.turnId === accepted.turnId,
    sameBody: gracefulReplay.body.equals(accepted.body),
    providerCalls: gracefulReplayCalls,
    sameBalance: JSON.stringify(balanceAfterReplay) === JSON.stringify(acceptedBalance),
  };

  const forcedKey = `t1118-forced-${randomUUID()}`;
  const acceptedBeforeKill = await talk(server, ownerHeaders, projectId, forcedKey);
  assert.equal(acceptedBeforeKill.status, 200);
  // Terminate directly after accepting the HTTP body. An extra balance read
  // could give fire-and-forget writes time to finish and hide the real window.
  await forcedStop(server);
  server = await startBackend({ dataDir, unsetEnv, env });
  ownerHeaders = await sessionHeaders(server, owner);
  const forcedRead = await apiRequest(server, `/talk/turn/${acceptedBeforeKill.turnId}`, { headers: owner.auth });
  const forcedReplay = await talk(server, ownerHeaders, projectId, forcedKey);
  const forcedReplayCalls = providerCounts(server);
  const balanceAfterForcedReplay = await balance();
  assert.ok(Buffer.from(String(forcedRead.json.screenplay_output?.text || '')).equals(Buffer.from(scene)), 'Forced termination lost full page text.');
  assert.ok(forcedReplay.headerBytes <= 8192);
  observations.transport = {acceptedHeaderBytes: accepted.headerBytes, gracefulReplayHeaderBytes: gracefulReplay.headerBytes,
    forcedReplayHeaderBytes: forcedReplay.headerBytes, fullSceneBytes: Buffer.byteLength(scene), canonicalSceneRestored: true};
  observations.forcedTermination = {
    ownerRead: forcedRead.status,
    replayHeader: forcedReplay.replay,
    sameTurn: forcedReplay.turnId === acceptedBeforeKill.turnId,
    sameBody: forcedReplay.body.equals(acceptedBeforeKill.body),
    providerCalls: forcedReplayCalls,
  };
  observations.billing = {initialDebitObserved: observations.beforeRestart.balanceChanged,
    forcedRestartBalance: balanceAfterForcedReplay.pageTurnsLeft,
    proof: 'Response replay only; funded durable debit/settlement requires its own boundary.'};

  console.log(JSON.stringify(observations));
  assert.deepEqual(observations.gracefulRestart, {
    forced: false,
    ownerRead: 200,
    otherRead: 403,
    replayHeader: "1",
    sameTurn: true,
    sameBody: true,
    providerCalls: { stt: 0, chat: 0, tts: 0 },
    sameBalance: true,
  });
  assert.deepEqual(observations.forcedTermination, {
    ownerRead: 200,
    replayHeader: "1",
    sameTurn: true,
    sameBody: true,
    providerCalls: { stt: 0, chat: 0, tts: 0 },
  });
} finally {
  await server.stop();
}
