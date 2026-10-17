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
const speechTexts = [];
let fixtureReply = "Give the captain an urgent want. He needs to get his sister across before midnight, but the ferry is grounded. Make him risk his license to move her.";
const fixtureFetch = async (url, options = {}) => {
  if (String(url).startsWith("http://127.0.0.1:")) return realFetch(url, options);
  if (String(url) === "https://api.openai.com/v1/chat/completions") {
    const body = JSON.parse(options.body);
    systems.push(body.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n"));
    return Response.json({ choices: [{ message: { content: fixtureReply } }], usage: { prompt_tokens: 10, completion_tokens: 20 } });
  }
  if (String(url) === "https://api.openai.com/v1/audio/speech") {
    speechTexts.push(JSON.parse(options.body).input);
    return new Response(Buffer.concat([Buffer.from("ID3"), Buffer.alloc(128)]), { status: 200, headers: { "content-type": "audio/mpeg" } });
  }
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

test("[650-talk] spoken response preserves dialogue and logs only shaping counts", async () => {
  globalThis.fetch = fixtureFetch;
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const originalLog = console.log;
  const shapingLogs = [];
  console.log = (...args) => {
    const line = args.map(String).join(" ");
    if (/mentor_(?:opener_stripped|questions_dropped)/.test(line)) shapingLogs.push(line);
    originalLog(...args);
  };
  const dialogue = "'Why did you leave? Can't you stay?'";
  fixtureReply = `The line names the feeling instead of pursuing a tactic. Try ${dialogue} Why does PRIVATE_STORY_PHRASE need the key? What's the deadline?`;
  try {
    const session = await realFetch(`${base}/session`, {method: "POST", headers: {"X-APP-TOKEN": "mentor-talk-test"}});
    const {client_token} = await session.json();
    const form = new FormData();
    form.append("debug_transcript", "Help me strengthen Mara's tactic in the ferry scene.");
    form.append("system_prompt", "SCENE PITCH (standing collaborator rule)");
    form.append("file", new Blob([Buffer.alloc(64)], {type: "audio/wav"}), "test.wav");
    const response = await realFetch(`${base}/talk`, {method: "POST", body: form,
      headers: {"X-APP-TOKEN": "mentor-talk-test", "X-Client-Token": client_token}});
    await response.arrayBuffer();
    assert.equal(response.status, 200);
    const spoken = decodeURIComponent(response.headers.get("x-reply") || "");
    assert.ok(spoken.includes(dialogue), spoken);
    assert.ok(spoken.endsWith("What's the deadline?"), spoken);
    assert.equal(spoken.includes("PRIVATE_STORY_PHRASE"), false, spoken);
    assert.ok(shapingLogs.some(line => /mentor_questions_dropped_count=1/.test(line)));
    assert.equal(shapingLogs.some(line => /PRIVATE_STORY_PHRASE|Why did you leave/.test(line)), false);
  } finally {
    console.log = originalLog;
    globalThis.fetch = realFetch;
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test("[650-talk] changed mentor replies cannot reuse audio for the old words", async () => {
  globalThis.fetch = fixtureFetch;
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const originalLog = console.log;
  let cacheHits = 0;
  console.log = (...args) => {
    if (args.some(value => /speculative_reuse requested=1 hit=1/.test(String(value)))) cacheHits += 1;
    originalLog(...args);
  };
  try {
    for (const [index, changed] of [true, false].entries()) {
      fixtureReply = changed ? "That's a strong setup. Mara pockets the key before she leaves." : "Mara pockets the key before she leaves.";
      const session = await realFetch(`${base}/session`, {method: "POST", headers: {"X-APP-TOKEN": "mentor-talk-test"}});
      const {client_token} = await session.json();
      const headers = {"X-APP-TOKEN": "mentor-talk-test", "X-Client-Token": client_token};
      const makeForm = () => {
        const form = new FormData();
        form.append("debug_transcript", "Mara waits by the ferry.");
        form.append("system_prompt", "SCENE PITCH (standing collaborator rule)");
        form.append("file", new Blob([Buffer.alloc(64)], {type: "audio/wav"}), "test.wav");
        return form;
      };
      const prepareForm = makeForm();
      prepareForm.append("speculative_key", `mentor-audio-${index}`);
      const prepared = await realFetch(`${base}/talk`, {method: "POST", body: prepareForm,
        headers: {...headers, "X-Speculative-Mode": "prepare"}});
      assert.equal(prepared.status, 201);
      const {prompt_hash} = await prepared.json();
      const beforeHits = cacheHits;
      const beforeSpeech = speechTexts.length;
      const form = makeForm();
      form.append("speculative_reuse_key", `mentor-audio-${index}`);
      form.append("speculative_prompt_hash", prompt_hash);
      const response = await realFetch(`${base}/talk`, {method: "POST", body: form, headers});
      await response.arrayBuffer();
      assert.equal(response.status, 200);
      assert.equal(cacheHits - beforeHits, 1, "fixture must exercise the cache hit, not a miss");
      const spoken = decodeURIComponent(response.headers.get("x-reply") || "");
      assert.equal(spoken.includes("That's a strong setup"), false);
      assert.equal(response.headers.get("x-speculative-reuse"), changed ? "0" : "1");
      assert.equal(speechTexts.length - beforeSpeech, changed ? 1 : 0);
      if (changed) assert.ok(speechTexts.at(-1).includes(spoken), "new audio must be synthesized from the final words");
    }
  } finally {
    console.log = originalLog;
    globalThis.fetch = realFetch;
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test("[651-talk] spoken pitch and TTS input agree without logging the heading", async () => {
  globalThis.fetch = fixtureFetch;
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const originalLog = console.log;
  const shapingLogs = [];
  console.log = (...args) => {
    const line = args.map(String).join(" ");
    if (/mentor_slugline_spoken=/.test(line)) shapingLogs.push(line);
    originalLog(...args);
  };
  const samples = [
    {reply: "Picture this: INT. FAMILY DINER - NIGHT. Mara needs the key, but John blocks her. Who lies first?", prose: "a family diner at night", changed: true},
    {reply: "Mara says “No.” Picture this: INT. THE DINER - NIGHT. Mara needs the key, but John blocks her. Who lies first?", prose: "the diner at night", changed: true},
    {reply: "Your heading 'INT. FAMILY DINER - NIGHT.' works. Mara needs the key, but John blocks her. Who lies first?", prose: "'INT. FAMILY DINER - NIGHT.'", changed: false},
  ];
  try {
    for (const sample of samples) {
      fixtureReply = sample.reply;
      const session = await realFetch(`${base}/session`, {method: "POST", headers: {"X-APP-TOKEN": "mentor-talk-test"}});
      const {client_token} = await session.json();
      const beforeLogs = shapingLogs.length;
      const beforeSpeech = speechTexts.length;
      const form = new FormData();
      form.append("debug_transcript", "Pitch me a scene, anything.");
      form.append("system_prompt", "SCENE PITCH (standing collaborator rule)");
      form.append("file", new Blob([Buffer.alloc(64)], {type: "audio/wav"}), "test.wav");
      const response = await realFetch(`${base}/talk`, {method: "POST", body: form,
        headers: {"X-APP-TOKEN": "mentor-talk-test", "X-Client-Token": client_token}});
      await response.arrayBuffer();
      assert.equal(response.status, 200);
      const spoken = decodeURIComponent(response.headers.get("x-reply") || "");
      assert.ok(spoken.includes(sample.prose), spoken);
      assert.equal(speechTexts.length - beforeSpeech, 1);
      assert.ok(speechTexts.at(-1).includes(spoken), "TTS must receive the final response words");
      assert.equal(shapingLogs.length - beforeLogs, sample.changed ? 1 : 0);
      assert.equal(shapingLogs.some(line => /FAMILY|DINER|Mara/.test(line)), false);
    }
  } finally {
    console.log = originalLog;
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
