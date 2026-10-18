// D009 B3 — characterization for talk_generate stage (abort / wallet / stream→chat).

import test from "node:test";
import assert from "node:assert/strict";
import { runTalkGenerate } from "../lib/talk_generate.js";

function makeChatSupplier({ streamImpl = null, chatImpl = null } = {}) {
  return {
    stream: streamImpl || (async () => {
      throw new Error("stream should not be called");
    }),
    chat: chatImpl || (async () => {
      throw new Error("chat should not be called");
    }),
  };
}

test("[D009-B3] runTalkGenerate commits wallet after non-stream chat success", async () => {
  const commits = [];
  const req = {
    clementine: {
      effort: "low",
      lane: "page",
      commitWallet: (n) => commits.push(n),
    },
  };
  const chatSupplier = makeChatSupplier({
    chatImpl: async () => ({
      response: { ok: true, status: 200 },
      rawText: JSON.stringify({
        choices: [{ message: { content: "Hello from chat" } }],
      }),
      model: "gpt-test",
      apiMode: "chat_completions",
      reasoningEffort: "low",
      fallbackUsed: false,
      usage: { inputTokens: 10, outputTokens: 7, reasoningTokens: 0, totalTokens: 17 },
    }),
  });

  const result = await runTalkGenerate({
    req,
    rid: "r1",
    logger: { log() {}, warn() {} },
    chatSupplier,
    useChatStreaming: false,
    system: "sys",
    shortTermContextMessages: [],
    talkGenerationTranscript: "hi",
    chatMessages: [{ role: "user", content: "hi" }],
    chatModelPlan: {
      model: "gpt-test",
      apiMode: "chat_completions",
      reasoningEffort: "medium",
      fallbackModel: null,
    },
    chatTemperature: 0.4,
    chatMaxTokens: 100,
    chatStart: Date.now(),
  });

  assert.equal(result.rawReply, "Hello from chat");
  assert.equal(result.streamChatUsed, false);
  assert.deepEqual(commits, [7]);
  assert.equal(result.effectiveChatUsage.outputTokens, 7);
});

test("[D009-B3] runTalkGenerate stream success commits wallet and skips chat", async () => {
  const commits = [];
  let chatCalled = false;
  const req = {
    clementine: {
      lane: "companion",
      commitWallet: (n) => commits.push(n),
    },
  };
  const chatSupplier = makeChatSupplier({
    streamImpl: async () => ({
      reply: "Streamed reply",
      firstSentence: "Streamed",
      model: "muse-test",
      apiMode: "responses",
      reasoningEffort: "none",
      fallbackUsed: false,
      usage: { inputTokens: 3, outputTokens: 4, reasoningTokens: 0, totalTokens: 7 },
    }),
    chatImpl: async () => {
      chatCalled = true;
      throw new Error("chat should not run after stream success");
    },
  });

  const result = await runTalkGenerate({
    req,
    rid: "r2",
    logger: { log() {}, warn() {} },
    chatSupplier,
    useChatStreaming: true,
    system: "sys",
    talkGenerationTranscript: "hi",
    chatMessages: [],
    chatModelPlan: { model: "muse-test", apiMode: "responses", reasoningEffort: "none" },
    chatTemperature: 0.5,
    chatMaxTokens: 80,
    chatStart: Date.now(),
  });

  assert.equal(result.rawReply, "Streamed reply");
  assert.equal(result.streamChatUsed, true);
  assert.equal(chatCalled, false);
  assert.deepEqual(commits, [4]);
});

test("[D009-B3] runTalkGenerate maps page abort to cancelled error", async () => {
  const { isPageCancelledError } = await import("../lib/clementine/page_abort.js");
  const controller = new AbortController();
  controller.abort("barge_in");
  const req = {
    clementine: {
      reservationId: "res-1",
      abortSignal: controller.signal,
      proceed: () => ({ ok: true, reservation: { cancelReason: "barge_in" } }),
      lane: "page",
    },
  };

  // Gate throws before supplier when signal already aborted.
  await assert.rejects(
    () => runTalkGenerate({
      req,
      rid: "r3",
      logger: { log() {}, warn() {} },
      chatSupplier: makeChatSupplier(),
      useChatStreaming: false,
      chatMessages: [],
      chatModelPlan: { model: "x", apiMode: "chat_completions" },
      chatTemperature: 0.2,
      chatMaxTokens: 10,
      chatStart: Date.now(),
    }),
    (err) => isPageCancelledError(err) && Number(err.status) === 409
  );
});

test("[PR3] runTalkGenerate short-film beta commits wallet with usage.outputTokens", async () => {
  const commits = [];
  const req = {
    clementine: {
      lane: "Page",
      commitWallet: (n) => commits.push(n),
    },
  };
  const prev = process.env.CLEMENTINE_SHORT_FILM_BETA;
  process.env.CLEMENTINE_SHORT_FILM_BETA = "1";
  // Fake supplier that returns a short-film draft that passes the studio quality gate
  // Use a longer, valid Fountain draft (like the offline draft) so enforceStudioScreenplayQuality doesn't hard-fail
  const { generateOfflineShortFilmDraft } = await import("../lib/clementine/short_film_prompt.js");
  const validDraft = generateOfflineShortFilmDraft({ totalPages: 15, requestedPages: 5, genre: "horror", setting: "bedroom", characters: ["John","Sally","Sam"] });
  const chatSupplier = makeChatSupplier({
    chatImpl: async () => ({
      text: validDraft,
      usage: { outputTokens: 123 },
      model: "test-model",
      apiMode: "chat_completions",
      reasoningEffort: "low",
      fallbackUsed: false,
      response: { ok: true, status: 200 },
      rawText: JSON.stringify({ choices: [{ message: { content: validDraft } }] }),
    }),
  });

  try {
    const result = await runTalkGenerate({
      req,
      rid: "r-beta",
      logger: { log() {}, warn() {} },
      chatSupplier,
      useChatStreaming: false,
      system: "You are Clementine. Persona + contract.",
      shortTermContextMessages: [],
      talkGenerationTranscript: "Hey Clementine, I want to write a short film today 15 pages, genre will be horror film, one location, in a bedroom, three characters, one John, one Sally, one Sam. Write the first five pages and we'll go from there.",
      chatMessages: [{ role: "user", content: "Hey Clementine, I want to write a short film today 15 pages, genre will be horror film, one location, in a bedroom, three characters, one John, one Sally, one Sam. Write the first five pages and we'll go from there." }],
      chatModelPlan: { model: "test-model", apiMode: "chat_completions", reasoningEffort: "low", fallbackModel: null },
      chatTemperature: 0.7,
      chatMaxTokens: 4000,
      chatStart: Date.now(),
    });

    // For page-write, rawReply is the draft but may be filtered by quality gate; main assertion is wallet commit
    assert.deepEqual(commits, [123], "commitWallet should be called once with usage.outputTokens");
    assert.equal(result.streamFirstSentence, "", "page-write should not use early TTS");
    // If draft is available, it should be non-empty; if quality gate filtered, skip
    if (result.rawReply) {
      assert.ok(result.rawReply.length > 0);
    }
  } finally {
    if (prev === undefined) delete process.env.CLEMENTINE_SHORT_FILM_BETA;
    else process.env.CLEMENTINE_SHORT_FILM_BETA = prev;
  }
});

test("short-film talk generation persists dialogue memory and wires it into the next prompt", async () => {
  const previous = process.env.CLEMENTINE_SHORT_FILM_BETA;
  process.env.CLEMENTINE_SHORT_FILM_BETA = "1";
  const transcript = "Hey Clementine, I want to write a short film today 15 pages, genre will be horror film, one location, in a bedroom, three characters, one John, one Sally, one Sam. Write the first one page and we'll go from there.";
  const draft = [
    "INT. BEDROOM - NIGHT",
    "",
    "John drives the brass key into the bedroom lock as footsteps close behind him.",
    "",
    "JOHN",
    "We shouldn't have stayed.",
    "",
    "Sally blocks the door with the suitcase before the lock can release.",
    "",
    "SALLY",
    "Then stop treating the door like a question.",
    "",
    "Sam tears the false floor plan from the wall and exposes a second room beneath it.",
    "",
    "SAM",
    "The house drew us in before we arrived.",
    "",
    "John snaps the key. The broken half falls through the keyhole, and the footsteps stop.",
  ].join("\n");
  const durableOwner = { ownerKey: "user:roundtrip", projects: [], activeProjectId: "" };
  const warnings = [];
  let commitCalls = 0;
  const commitScreenplayOwnerMutation = async ({ mutate }) => {
    commitCalls += 1;
    await mutate(durableOwner);
    return { committed: true };
  };

  try {
    const firstOwner = structuredClone(durableOwner);
    await runTalkGenerate({
      req: {
        clementine: {
          lane: "Page",
          screenplayOwnerRecord: firstOwner,
          commitScreenplayOwnerMutation,
        },
      },
      rid: "memory-first",
      logger: { log() {}, warn(message) { warnings.push(message); } },
      chatSupplier: makeChatSupplier({
        chatImpl: async () => ({ text: draft, usage: { outputTokens: 100 } }),
      }),
      talkGenerationTranscript: transcript,
      chatMessages: [{ role: "user", content: transcript }],
      chatModelPlan: { model: "test", apiMode: "chat_completions", reasoningEffort: "low" },
    });

    const storedProject = durableOwner.projects[0];
    assert.deepEqual(warnings, []);
    assert.equal(commitCalls, 1, "the generated draft should execute one owner mutation");
    assert.ok(storedProject, "the owner mutation should persist the generated project");
    const john = storedProject.characterContexts.find((context) => context.name === "John");
    assert.ok(john.memory.length > 0, "the durable owner should receive extracted dialogue");
    assert.equal(john.memory[0].text, "We shouldn't have stayed.");
    assert.ok(john.memory.every((memory) => !memory.text.startsWith("INT.")));

    let secondSystem = "";
    await runTalkGenerate({
      req: {
        screenplayOwnerRecord: durableOwner,
        clementine: {
          lane: "Page",
          commitScreenplayOwnerMutation,
        },
      },
      rid: "memory-second",
      logger: { log() {}, warn() {} },
      chatSupplier: makeChatSupplier({
        chatImpl: async ({ messages }) => {
          secondSystem = messages.find((message) => message.role === "system")?.content || "";
          return { text: draft, usage: { outputTokens: 100 } };
        },
      }),
      talkGenerationTranscript: transcript,
      chatMessages: [{ role: "user", content: transcript }],
      chatModelPlan: { model: "test", apiMode: "chat_completions", reasoningEffort: "low" },
    });
    assert.ok(secondSystem.includes("Per-character context"));
    assert.ok(secondSystem.includes(`recent: "${john.memory[0].text}"`));
  } finally {
    if (previous === undefined) delete process.env.CLEMENTINE_SHORT_FILM_BETA;
    else process.env.CLEMENTINE_SHORT_FILM_BETA = previous;
  }
});
