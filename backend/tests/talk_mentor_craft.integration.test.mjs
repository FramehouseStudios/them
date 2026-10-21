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
const mentorCore = fs.readFileSync(new URL("../../docs/persona/mentor-core.txt", import.meta.url), "utf8").trim();
const nativePrompt = process.env.THEM_MENTOR_NATIVE_PROMPT_FILE
  ? fs.readFileSync(process.env.THEM_MENTOR_NATIVE_PROMPT_FILE, "utf8") : "";
globalThis.fetch = async (url, options = {}) => {
  if (String(url).startsWith("http://127.0.0.1:")) return realFetch(url, options);
  if (String(url) === "https://api.openai.com/v1/chat/completions") {
    const body = JSON.parse(options.body);
    systems.push(body.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n"));
    return Response.json({ choices: [{ message: { content: "Give the captain an urgent want. He needs to get his sister across before midnight, but the ferry is grounded. Make him risk his license to move her." } }], usage: { prompt_tokens: 10, completion_tokens: 20 } });
  }
  if (String(url) === "https://api.openai.com/v1/audio/speech") return new Response(Buffer.concat([Buffer.from("ID3"), Buffer.alloc(128)]), { status: 200, headers: { "content-type": "audio/mpeg" } });
  throw new Error(`Unmocked external provider request: ${new URL(url).pathname}`);
};
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
      const map = feature ? "<feature_film_map>target_pages: 90; All Is Lost in Act II.</feature_film_map>" : "";
      const source = nativePrompt
        ? nativePrompt.replace("</mentor_core>", `</mentor_core>\n${map}`)
        : `<mentor_core>\n${mentorCore}\n</mentor_core>\n<scene_pitch>SCENE PITCH (standing collaborator rule)\nKeep the writer's premise.</scene_pitch>\n${map}`;
      form.append("system_prompt", source + "\nDisposable continuity detail. ".repeat(600));
      form.append("file", new Blob([Buffer.alloc(64)], { type: "audio/wav" }), "test.wav");
      const response = await realFetch(`${base}/talk`, { method: "POST", headers: { "X-APP-TOKEN": "mentor-talk-test", "X-Client-Token": client_token }, body: form });
      await response.arrayBuffer();
      assert.equal(response.status, 200);
      const prompt = systems.slice(before).find((value) => value.includes("<mentor_output>"));
      assert.ok(prompt, "real handler must reach provider with mentor contract");
      const deliveredCore = prompt.match(/<mentor_core>([\s\S]*?)<\/mentor_core>/)?.[1];
      assert.equal(deliveredCore?.replace(/\s+/g, " ").trim(), mentorCore.replace(/\s+/g, " ").trim(), "The actual provider must receive the complete shared mentor identity, not just a header");
      const deliveredPitch = prompt.match(/<scene_pitch>([\s\S]*?)<\/scene_pitch>/)?.[1];
      const expectedPitch = source.match(/<scene_pitch>([\s\S]*?)<\/scene_pitch>/)?.[1];
      assert.ok(expectedPitch, "The source must contain the actual pitch contract");
      assert.equal(deliveredPitch?.replace(/\s+/g, " ").trim(), expectedPitch.replace(/\s+/g, " ").trim(), "The entire pitch contract survives, including its writer-intent boundaries");
      console.log("[mentor-delivery] " + JSON.stringify({ clientChars: source.length, providerChars: prompt.length, coreWhole: true, pitchWhole: true, featureMap: feature }));
      if (!nativePrompt) assert.match(prompt, /Keep the writer's premise/);
      if (feature) { assert.match(prompt, /<feature_film_map>/); assert.doesNotMatch(prompt, /<craft>/); }
      else assert.match(prompt, /<craft>[\s\S]*three-act[\s\S]*<\/craft>/);
    }
  } finally {
    globalThis.fetch = realFetch;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
