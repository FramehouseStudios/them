import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "them-mentor-talk-"));
Object.assign(process.env, {
  RUN_SERVER: "0", NODE_ENV: "test", REQUIRE_USER_AUTH: "0",
  APP_TOKEN: "mentor-talk-test", OPENAI_API_KEY: "not-a-real-provider-key",
  TALK_TEST_DEBUG_TRANSCRIPT_ENABLED: "1", TALK_STREAM_AUDIO_ENABLED: "0",
  TALK_TEST_DEBUG_OFFLINE_ENABLED: "0",
  KNOWLEDGE_RAG_EMBEDDINGS_ENABLED: "0", OUTBOX_WORKER_ENABLED: "0",
  PERSISTENCE_JSON_ROOT: path.join(root, "persistence"),
  USER_STORE_PATH: path.join(root, "users.json"),
  USER_MEMORY_STORE_PATH: path.join(root, "memory.json"),
  OUTBOX_STORE_PATH: path.join(root, "outbox.json"),
  SCREENPLAY_STORE_PATH: path.join(root, "screenplay.json"),
});
delete process.env.DATABASE_URL;
const realFetch = globalThis.fetch;
const systems = [];
let fixtureReply = "Give the captain an urgent want. He needs to get his sister across before midnight, but the ferry is grounded. Make him risk his license to move her.";
const fixtureFetch = async (url, options = {}) => {
  if (String(url).startsWith("http://127.0.0.1:")) return realFetch(url, options);
  if (String(url) === "https://api.openai.com/v1/chat/completions") {
    const body = JSON.parse(options.body);
    systems.push(body.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n"));
    return Response.json({ choices: [{ message: { content: fixtureReply } }], usage: { prompt_tokens: 10, completion_tokens: 20 } });
  }
  if (String(url) === "https://api.openai.com/v1/audio/speech") return new Response(Buffer.concat([Buffer.from("ID3"), Buffer.alloc(128)]), { status: 200, headers: { "content-type": "audio/mpeg" } });
  throw new Error(`Unmocked external provider request: ${new URL(url).pathname}`);
};
globalThis.fetch = fixtureFetch;
await import("../index.js");
const { app } = await import("../app.js");

test("[640-talk] real talk path carries mentor craft and suppresses it for a feature map", async () => {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const session = await realFetch(`${base}/session`, { method: "POST", headers: { "X-APP-TOKEN": "mentor-talk-test" } });
    assert.equal(session.status, 201);
    const { client_token } = await session.json();
    for (const feature of [false, true]) {
      const before = systems.length;
      const form = new FormData();
      form.append("debug_transcript", "Help me strengthen the ferry captain's choice.");
      form.append("system_prompt", "SCENE PITCH (standing collaborator rule)\n" + (feature ? "<feature_film_map>target_pages: 90; All Is Lost in Act II.</feature_film_map>" : ""));
      form.append("file", new Blob([Buffer.alloc(64)], { type: "audio/wav" }), "test.wav");
      const response = await realFetch(`${base}/talk`, { method: "POST", headers: { "X-APP-TOKEN": "mentor-talk-test", "X-Client-Token": client_token }, body: form });
      await response.arrayBuffer();
      assert.equal(response.status, 200);
      const prompt = systems.slice(before).find((value) => value.includes("<mentor_output>"));
      assert.ok(prompt, "real handler must reach provider with mentor contract");
      if (feature) { assert.match(prompt, /<feature_film_map>/); assert.doesNotMatch(prompt, /<craft>/); }
      else assert.match(prompt, /<craft>[\s\S]*three-act[\s\S]*<\/craft>/);
    }
  } finally {
    globalThis.fetch = realFetch;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("[649-talk] crowded tagged client identity reaches the actual provider request whole", async () => {
  globalThis.fetch = fixtureFetch;
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const core = fs.readFileSync(new URL("../../docs/persona/mentor-core.txt", import.meta.url), "utf8").trim();
  const pitch = "SCENE PITCH (standing collaborator rule):\nKeep the writer's ferry scene; give the captain a deadline.";
  // The real client can place mode rules after a long Studio context. Protect
  // them through ingress normalization too, not only the final provider trim.
  const prompt = `<mentor_core>\n${core}\n</mentor_core>\n` + "Disposable companion context. ".repeat(900) + `\n<scene_pitch>\n${pitch}\n</scene_pitch>`;
  try {
    const session = await realFetch(`${base}/session`, {method: "POST", headers: {"X-APP-TOKEN": "mentor-talk-test"}});
    const {client_token} = await session.json();
    const before = systems.length;
    const form = new FormData();
    form.append("debug_transcript", "Help me strengthen the ferry captain's choice.");
    form.append("system_prompt", prompt);
    form.append("studio_capabilities", JSON.stringify({has_project: true, has_draft: true, tabs: ["draft", "craft"]}));
    form.append("file", new Blob([Buffer.alloc(64)], {type: "audio/wav"}), "test.wav");
    const response = await realFetch(`${base}/talk`, {method: "POST", body: form,
      headers: {"X-APP-TOKEN": "mentor-talk-test", "X-Client-Token": client_token}});
    await response.arrayBuffer();
    assert.equal(response.status, 200);
    const sent = systems.slice(before).find(value => value.includes("<mentor_output>"));
    assert.ok(sent, "real handler must call provider");
    assert.ok(sent.length > 6200 && sent.length <= 13000, `actual budget: ${sent.length}`);
    assert.ok(sent.includes(`<mentor_core>\n${core}\n</mentor_core>`), "complete current identity, including target-aware landmarks");
    assert.ok(sent.includes(pitch));
    assert.match(sent, /<studio_controls>[\s\S]*<\/studio_controls>/);
    assert.match(sent, /<craft>[\s\S]*<\/craft>/);
  } finally {
    globalThis.fetch = realFetch;
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test("[648-talk] actual HTTP action headers and spoken preview respect writer authority", async () => {
  globalThis.fetch = fixtureFetch;
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const cases = [
    { transcript: "Jump to the basement scene.", reply: "I've jumped to the basement scene. Give the captain an urgent want.",
      action: [], spoken: /I don't see a basement scene on the page yet/ },
    { transcript: "Don't save my draft.", reply: "I've saved the draft. [[studio: save_draft]]",
      action: [], spoken: /I won't carry out that action/ },
    { transcript: "Open the craft tab.", reply: "Give the captain an urgent want.",
      action: [{type: "open_tab", tab: "craft", source: "writer"}], spoken: /Give the captain/ },
    { transcript: "Save a revision in pink.", reply: "Saving a revision in blue. [[studio: save_revision color=blue]]",
      action: [{type: "save_revision", color: "pink", source: "writer"}], spoken: /I'll save a revision in pink/ },
  ];
  try {
    for (const sample of cases) {
      fixtureReply = sample.reply;
      const session = await realFetch(`${base}/session`, {method: "POST", headers: {"X-APP-TOKEN": "mentor-talk-test"}});
      const {client_token} = await session.json();
      const form = new FormData();
      form.append("debug_transcript", sample.transcript);
      form.append("system_prompt", "SCENE PITCH (standing collaborator rule)");
      form.append("studio_capabilities", JSON.stringify({has_project: true, has_draft: true,
        tabs: ["draft", "craft"], scene_labels: ["INT. FERRY - NIGHT"]}));
      form.append("file", new Blob([Buffer.alloc(64)], {type: "audio/wav"}), "test.wav");
      const response = await realFetch(`${base}/talk`, {method: "POST", body: form,
        headers: {"X-APP-TOKEN": "mentor-talk-test", "X-Client-Token": client_token}});
      await response.arrayBuffer();
      assert.equal(response.status, 200, sample.transcript);
      const actions = JSON.parse(decodeURIComponent(response.headers.get("x-studio-actions") || "%5B%5D"));
      assert.deepEqual(actions, sample.action, sample.transcript);
      assert.match(decodeURIComponent(response.headers.get("x-reply") || ""), sample.spoken, sample.transcript);
    }
  } finally {
    globalThis.fetch = realFetch;
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
