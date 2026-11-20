import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { setTimeout } from "node:timers/promises";
import { createAdapterWalletPersistence } from "../lib/clementine/wallet_persistence.js";
import { createJsonPersistence } from "../lib/persistence_json.js";
import { apiRequest, startBackend } from "./helpers/backend_test_server.mjs";

const PAGE = [
  "INT. DINER - NIGHT",
  "",
  "Rain needles the front window while neon bleeds across the counter.",
  "",
  "MARA",
  "He came back with Café Minuit's key.",
  "",
  "Mara slides the key beneath a dry saucer.",
  "",
  "VALE",
  "Then he'll expect you to open the door.",
].join("\n");

const optIn = { "X-Talk-Accept-Page-Without-Audio": "1", "X-Talk-Stream": "audio" };
const wav = fs.readFileSync(new URL("../test.wav", import.meta.url));

test("authenticated Page delivery survives synthesis failure and remains owner scoped and idempotent", { timeout: 35_000 }, async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "them-page-without-audio-"));
  const stub = fileURLToPath(new URL("./helpers/page_without_audio_provider_stub.mjs", import.meta.url));
  const releaseFile = path.join(dataDir, "cancelled");
  const options = { dataDir, env: {
    NODE_OPTIONS: `--import=${stub}`,
    PAGE_TEST_SCREENPLAY: PAGE,
    PAGE_TEST_CANCEL_RELEASE_FILE: releaseFile,
    REQUIRE_USER_AUTH: "1",
    REQUIRE_CLIENT_TOKEN: "0",
    TALK_IDEMPOTENCY_ENABLED: "1",
    TALK_TEST_DEBUG_OFFLINE_ENABLED: "0",
    CHAT_STREAM_ENABLED: "0",
    TALK_STREAM_AUDIO_ENABLED: "1",
    KNOWLEDGE_RAG_EMBEDDINGS_ENABLED: "0",
    ADAPTIVE_QUALITY_EVAL_ENABLED: "0",
    ACTIVE_THEME_LLM_ENABLED: "0",
    CLEMENTINE_SHORT_FILM_BETA: "0",
    CLEMENTINE_MUSE_ENABLED: "0",
    CLEMENTINE_PROVIDER: "openai",
  }};
  let server = await startBackend(options);
  try {
    const signup = async (email) => {
      const response = await apiRequest(server, "/auth/signup", {
        method: "POST",
        json: { email, password: "page-fixture-password-123" },
      });
      assert.equal(response.status, 201);
      return {
        owner: response.json.user.user_id,
        auth: { Authorization: `Bearer ${response.json.token || response.json.access_token}` },
      };
    };
    const writer = await signup("page-owner@example.com");
    const other = await signup("another-writer@example.com");
    await server.stop();
    const persistence = createJsonPersistence({ jsonRoot: path.join(dataDir, "persistence") });
    await createAdapterWalletPersistence({ persistence }).putBalance({
      ownerId: writer.owner, pageMilliturns: 100000, companionMilliturns: 0,
      grantedPageMilliturns: 100000, grantedCompanionMilliturns: 0,
    });
    server = await startBackend(options);

    const session = await apiRequest(server, "/session", { method: "POST", headers: writer.auth });
    assert.equal(session.status, 201);
    const token = session.json.client_token;
    assert.ok(token);
    const headers = { ...writer.auth, "X-Client-Token": token };
    const created = await apiRequest(server, "/screenplay/projects", {
      method: "POST", headers, json: { title: "Page without audio fixture" },
    });
    assert.equal(created.status, 201);
    const projectId = created.json.project_id || created.json.project?.id;
    assert.ok(projectId);
    const balance = async () => {
      const response = await apiRequest(server, "/talk/wallet", {
        method: "POST", headers, json: { owner_id: writer.owner },
      });
      assert.equal(response.status, 200);
      return response.json.pageTurnsLeft ?? response.json.balance?.pageTurnsLeft;
    };

    const send = (key, extraHeaders = optIn, auth = headers) => {
      const form = new FormData();
      form.append("client_transcript", "Write the opening scene for my screenplay. Mara meets Vale in a diner at night.");
      form.append("screenplay_target", "page");
      form.append("screenplay_prompt_source", "voice");
      form.append("screenplay_project_id", projectId);
      form.append("max_output_tokens", "400");
      form.append("file", new Blob([wav], { type: "audio/wav" }), "test.wav");
      return apiRequest(server, "/talk", {
        method: "POST", headers: { ...auth, ...extraHeaders, "X-Idempotency-Key": key }, body: form,
      });
    };

    const before = await balance();
    assert.equal(before, 100);
    const page = await send("one-page-without-audio");
    assert.equal(page.status, 200);
    assert.equal(page.headers.get("x-turn-status"), "responded", `fixture status: ${page.headers.get("x-turn-error-class")}`);
    assert.match(page.headers.get("content-type"), /^application\/json/);
    assert.equal(page.headers.get("x-talk-audio-unavailable"), "1");
    assert.equal(page.headers.get("x-screenplay-authoritative"), "1");
    assert.equal(page.headers.get("x-screenplay-sync-ready"), "0");
    assert.equal(page.headers.get("x-screenplay-cues"), null);
    assert.equal(page.headers.get("x-dialogue-timeline"), null);
    assert.equal(page.headers.get("x-talk-stream-mode"), "off");
    assert.equal(page.headers.get("x-tts-segments"), "0");
    assert.equal(decodeURIComponent(page.headers.get("x-screenplay-project-id")), projectId);
    assert.equal(page.json.screenplay_output.target, "page");
    assert.equal(page.json.screenplay_output.text, PAGE);
    assert.equal(server.stdout.join("").match(/verified page reached synthesis/g)?.length, 1);

    const turn = await apiRequest(server, `/talk/turn/${page.headers.get("x-turn-id")}`, { headers });
    assert.equal(turn.status, 200);
    assert.deepEqual(page.json.screenplay_output, turn.json.screenplay_output);
    assert.equal(turn.json.render_contract.sync_ready, false);
    assert.deepEqual(turn.json.screenplay_cues, []);
    assert.equal(await balance(), 99.692);

    const replay = await send("one-page-without-audio");
    assert.equal(replay.headers.get("x-idempotency-replay"), "1");
    assert.equal(replay.text, page.text);
    assert.equal(await balance(), 99.692);
    const accountMismatch = await send("one-page-without-audio", optIn, { ...other.auth, "X-Client-Token": token });
    assert.equal(accountMismatch.status, 409);
    assert.equal(accountMismatch.json.screenplay_output, undefined);
    const capabilityMismatch = await send("one-page-without-audio", {});
    assert.equal(capabilityMismatch.status, 409);
    assert.equal(capabilityMismatch.json.screenplay_output, undefined);
    assert.equal(server.stdout.join("").match(/verified page reached synthesis/g)?.length, 1);

    const oldClient = await send("legacy-page-audio-failure", {});
    assert.equal(oldClient.status, 200);
    assert.equal(oldClient.headers.get("x-turn-status"), "error_recovered");
    assert.equal(oldClient.headers.get("x-talk-audio-unavailable"), null);
    assert.equal(await balance(), 99.692);

    const pending = send("cancelled-page-audio-failure");
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (server.stdout.join("").match(/verified page reached synthesis/g)?.length === 3) break;
      await setTimeout(20);
    }
    assert.equal(server.stdout.join("").match(/verified page reached synthesis/g)?.length, 3);
    const cancelled = await apiRequest(server, "/talk/page-cancel", {
      method: "POST", headers, json: { session_id: token },
    });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.json.cancelled, true);
    fs.writeFileSync(releaseFile, "1");
    const stopped = await pending;
    assert.equal(stopped.status, 409);
    assert.equal(stopped.json.error, "page_generation_cancelled");
    assert.equal(stopped.headers.get("x-talk-audio-unavailable"), null);
    assert.equal(await balance(), 99.692);
  } finally {
    await server.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
