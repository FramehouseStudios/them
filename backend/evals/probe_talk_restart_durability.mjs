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

const databaseUrl = String(process.env.THEM_TALK_RESTART_TEST_DATABASE_URL || "");
if (databaseUrl && !['127.0.0.1', 'localhost'].includes(new URL(databaseUrl).hostname)) throw new Error('Only an explicitly task-owned localhost database is allowed');
const settlementFaultProof = process.env.THEM_TALK_SETTLEMENT_FAULT_PROOF === "1";
if (settlementFaultProof && (!databaseUrl || new URL(databaseUrl).pathname !== "/t1124")) {
  throw new Error("Settlement fault injection requires the dedicated task-owned localhost t1124 database");
}
const unsetEnv = databaseUrl ? ["REDIS_URL"] : ["DATABASE_URL", "REDIS_URL"];

const appToken = "them-t1118-local-proof";
const env = {
  ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}),
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

// Actual PostgreSQL faults, not a fake ledger assertion: exercise both sides of
// the debit/replay boundary through authenticated HTTP and a real process kill.
async function proveSettlementFailures({ server: initialServer, owner, projectId }) {
  const db = createPersistence({ databaseUrl });
  const suffix = randomUUID().replaceAll("-", "");
  const functionName = `t1124_fault_${suffix}`;
  const triggerName = `t1124_fault_trigger_${suffix}`;
  const literal = value => `'${String(value).replaceAll("'", "''")}'`;
  let current = initialServer;
  let headers = await sessionHeaders(current, owner);
  const results = [];
  try {
    for (const [index, phase] of ["before_debit", "after_debit_before_completion"].entries()) {
      const key = `t1124-${phase}-${randomUUID()}`;
      const cacheKey = `user:${owner.userId}|${key}`;
      const table = index === 0 ? "wallet_talk_settlements" : "persistence_talk_idempotency";
      const condition = index === 0
        ? "NEW.settlement_key = TG_ARGV[0]"
        : "NEW.key = TG_ARGV[0] AND NEW.value->>'status' = 'completed'";
      await db.query(`CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF ${condition} THEN RAISE EXCEPTION 'injected T1124 settlement boundary failure'; END IF;
        RETURN NEW; END; $$`);
      await db.query(`CREATE TRIGGER ${triggerName} BEFORE INSERT OR UPDATE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION ${functionName}(${literal(cacheKey)})`);
      const failed = await talk(current, headers, projectId, key);
      assert.ok(failed.status >= 500 && failed.status < 600, `${phase} falsely acknowledged HTTP ${failed.status}`);
      const prepared = await db.get({ domain: "talk_idempotency", key: cacheKey });
      assert.equal(prepared?.status, "prepared", `${phase} discarded the original prepared reply`);
      assert.equal(prepared.body?.encoding, "base64");
      const originalBytes = Buffer.from(prepared.body.data, "base64");
      assert.ok(originalBytes.length > 0);
      const receiptBefore = await db.query("SELECT count(*)::int AS n FROM wallet_talk_settlements WHERE settlement_key = $1", [cacheKey]);
      assert.equal(receiptBefore.rows[0].n, index === 0 ? 0 : 1);
      const beforeBalance = await db.query("SELECT page_milliturns::int AS n FROM wallet_balances WHERE owner_id = $1", [owner.userId]);
      assert.equal(beforeBalance.rows[0].n, index === 0 ? 100000 : 99600);
      await forcedStop(current);
      await db.query(`DROP TRIGGER ${triggerName} ON ${table}`);
      await db.query(`DROP FUNCTION ${functionName}()`);
      current = await startBackend({ dataDir: initialServer.dataDir, unsetEnv, env });
      headers = await sessionHeaders(current, owner);
      const replay = await talk(current, headers, projectId, key);
      assert.equal(replay.status, 200);
      assert.equal(replay.replay, "1");
      assert.equal(replay.turnId, prepared.headers["x-turn-id"]);
      assert.deepEqual(replay.body, originalBytes);
      assert.deepEqual(providerCounts(current), { stt: 0, chat: 0, tts: 0 });
      const secondReplay = await talk(current, headers, projectId, key);
      assert.equal(secondReplay.status, 200);
      assert.deepEqual(secondReplay.body, originalBytes);
      const completed = await db.get({ domain: "talk_idempotency", key: cacheKey });
      assert.equal(completed.status, "completed");
      const receiptAfter = await db.query("SELECT count(*)::int AS n FROM wallet_talk_settlements WHERE settlement_key = $1", [cacheKey]);
      assert.equal(receiptAfter.rows[0].n, 1);
      const balanceAfter = await db.query("SELECT page_milliturns::int AS n FROM wallet_balances WHERE owner_id = $1", [owner.userId]);
      assert.equal(balanceAfter.rows[0].n, 100000 - (index + 1) * 200);
      results.push({ phase, failedHTTP: failed.status, receiptBefore: receiptBefore.rows[0].n,
        replayHTTP: replay.status, sameBytes: true, sameTurn: true, receiptsAfter: 1,
        pageMilliturnsAfter: balanceAfter.rows[0].n, providerCalls: providerCounts(current) });
    }
    return { server: current, headers, results };
  } catch (error) {
    await current.stop();
    throw error;
  } finally {
    for (const table of ["wallet_talk_settlements", "persistence_talk_idempotency"]) {
      await db.query(`DROP TRIGGER IF EXISTS ${triggerName} ON ${table}`).catch(() => {});
    }
    await db.query(`DROP FUNCTION IF EXISTS ${functionName}()`).catch(() => {});
    await db.close();
  }
}

let server = await startBackend({ unsetEnv, env });
const dataDir = server.dataDir;
const observations = { providerMode: "intercepted; no paid calls", persistence: databaseUrl ? 'postgres' : 'json' };
try {
  const owner = await writer(server, "owner");
  const other = await writer(server, "other");
  await server.stop();

  const persistence = createPersistence({ databaseUrl, jsonRoot: path.join(dataDir, "persistence") });
  const funding = databaseUrl ? createPostgresWalletPersistence({ client: persistence }) : createAdapterWalletPersistence({ persistence });
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

  if (settlementFaultProof) {
    const proof = await proveSettlementFailures({ server, owner, projectId });
    server = proof.server; ownerHeaders = proof.headers;
    observations.settlementFailures = proof.results;
  }
  const expectedStartingTurns = settlementFaultProof ? 99.6 : 100;
  const expectedAcceptedTurns = settlementFaultProof ? 99.4 : 99.8;
  const beforeBalance = await balance();
  const gracefulKey = `t1118-graceful-${randomUUID()}`;
  const accepted = await talk(server, ownerHeaders, projectId, gracefulKey);
  assert.equal(accepted.status, 200);
  assert.equal(accepted.authoritative, "1");
  assert.ok(accepted.turnId);
  const acceptedBalance = await balance();
  assert.equal(beforeBalance.pageTurnsLeft, expectedStartingTurns);
  assert.equal(acceptedBalance.pageTurnsLeft, expectedAcceptedTurns, 'initial accepted result must actually debit the funded wallet');
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
  const exported = await apiRequest(server, '/account/export', { headers: owner.auth });
  const otherExported = await apiRequest(server, '/account/export', { headers: other.auth });
  assert.equal(exported.status, 200);
  assert.equal(otherExported.status, 200);
  assert.ok(exported.json.domains.talk_turns.some(row => row.value.userId === owner.userId));
  assert.ok(exported.json.domains.talk_idempotency.some(row => row.value.userId === owner.userId));
  assert.equal(otherExported.json.domains.talk_turns.length, 0);
  assert.equal(otherExported.json.domains.talk_idempotency.length, 0);
  const gracefulStop = await server.stop();

  server = await startBackend({ dataDir, unsetEnv, env });
  ownerHeaders = await sessionHeaders(server, owner);
  const ownerAfterRestart = await apiRequest(server, `/talk/turn/${accepted.turnId}`, { headers: owner.auth });
  const otherAfterRestart = await apiRequest(server, `/talk/turn/${accepted.turnId}`, { headers: other.auth });
  const gracefulReplay = await talk(server, ownerHeaders, projectId, gracefulKey);
  const gracefulReplayCalls = providerCounts(server);
  const balanceAfterReplay = await balance();
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
  const expectedBalanceAfterKill = { ...acceptedBalance, pageTurnsLeft: settlementFaultProof ? 99.2 : 99.6 };
  // No extra HTTP read before termination: it would give queued settlement
  // writes time to finish and hide a response-before-wallet-durability window.
  await forcedStop(server);
  server = await startBackend({ dataDir, unsetEnv, env });
  ownerHeaders = await sessionHeaders(server, owner);
  const forcedRead = await apiRequest(server, `/talk/turn/${acceptedBeforeKill.turnId}`, { headers: owner.auth });
  const forcedReplay = await talk(server, ownerHeaders, projectId, forcedKey);
  const forcedReplayCalls = providerCounts(server);
  const balanceAfterForcedReplay = await balance();
  observations.forcedTermination = {
    ownerRead: forcedRead.status,
    replayHeader: forcedReplay.replay,
    sameTurn: forcedReplay.turnId === acceptedBeforeKill.turnId,
    sameBody: forcedReplay.body.equals(acceptedBeforeKill.body),
    providerCalls: forcedReplayCalls,
    sameBalance: JSON.stringify(balanceAfterForcedReplay) === JSON.stringify(expectedBalanceAfterKill),
  };

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
    sameBalance: true,
  });
} finally {
  await server.stop();
}
