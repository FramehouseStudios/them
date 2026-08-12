// T-decompose-phase5b2-studio-render — integration tests for
// `mountRealtimeStudioRenderRoutes`. Cover both routes
// (sync + SSE), happy paths, error envelopes, missing-key
// 503 guard, empty-transcript 400 guard, and the
// required-deps mount guard.

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import {
  mountRealtimeStudioRenderRoutes,
  STUDIO_RENDER_BODY_LIMIT,
} from "../lib/realtime_studio_render_routes.js";

const VALID_SCREENPLAY_REPLY = [
  "INT. ARCHIVE - NIGHT",
  "",
  "Mara drives a brass key into the evidence locker as footsteps close behind her.",
  "",
  "ELI",
  "You said the file was gone.",
  "",
  "Mara snaps the key before the lock can release it.",
  "",
  "MARA",
  "I said they could not use it.",
  "",
  "The broken half drops inside the locker. Eli raises the original subpoena, its red seal reflected in the steel door.",
  "",
  "ELI",
  "Then we use this.",
  "",
  "Mara takes the subpoena and steps toward the approaching guard instead of the exit.",
].join("\n");

function defaultDeps(overrides = {}) {
  const calls = { renderInvocations: [], streamInvocations: [] };
  return {
    getOpenAIApiKey: () => "sk-test",
    createRequestId: () => "req_studio_test",
    normalizeSnippet: (v, _max) => (typeof v === "string" ? v.trim() : ""),
    renderStudioRealtimeText: async (options) => {
      calls.renderInvocations.push(options);
      return options.modelTier === "rich" ? VALID_SCREENPLAY_REPLY : "rendered reply";
    },
    streamStudioRealtimeText: async (options) => {
      const { onDelta } = options;
      calls.streamInvocations.push(options);
      if (options.modelTier === "rich") {
        const splitAt = VALID_SCREENPLAY_REPLY.indexOf("MARA\n");
        const first = VALID_SCREENPLAY_REPLY.slice(0, splitAt);
        await onDelta(first, first);
        await onDelta(VALID_SCREENPLAY_REPLY.slice(splitAt), VALID_SCREENPLAY_REPLY);
        return VALID_SCREENPLAY_REPLY;
      }
      await onDelta("hello ", "hello ");
      await onDelta("world", "hello world");
      return "hello world";
    },
    _calls: calls,
    ...overrides,
  };
}

async function withTestServer(deps, fn) {
  const app = express();
  mountRealtimeStudioRenderRoutes(app, deps);
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const port = server.address().port;
  try { await fn(`http://127.0.0.1:${port}`); }
  finally { await new Promise((r) => server.close(r)); }
}

async function postJson(baseURL, path, body) {
  const r = await fetch(`${baseURL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

async function postSse(baseURL, path, body) {
  const r = await fetch(`${baseURL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  return { status: r.status, text };
}

// ---------- factory + mount guards ----------

test("[studio-render] STUDIO_RENDER_BODY_LIMIT exported as 512kb", () => {
  assert.equal(STUDIO_RENDER_BODY_LIMIT, "512kb");
});

test("[studio-render] mount fails without Express app", () => {
  assert.throws(() => mountRealtimeStudioRenderRoutes(null, defaultDeps()));
});

test("[studio-render] mount fails when any required dep is missing", () => {
  const required = [
    "renderStudioRealtimeText",
    "streamStudioRealtimeText",
    "createRequestId",
    "normalizeSnippet",
    "getOpenAIApiKey",
  ];
  for (const key of required) {
    const deps = defaultDeps();
    deps[key] = undefined;
    const app = express();
    assert.throws(
      () => mountRealtimeStudioRenderRoutes(app, deps),
      new RegExp(key),
      `should reject missing ${key}`,
    );
  }
});

// ---------- /realtime/studio_render (sync) ----------

test("[studio-render] sync: 200 with ok envelope on happy path", async () => {
  const deps = defaultDeps();
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", {
      transcript: "make me a scene",
      system_prompt: "you are a writer",
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.action, "studio_render");
    assert.equal(r.body.reply, "rendered reply");
    assert.equal(deps._calls.renderInvocations.length, 1);
    assert.equal(deps._calls.renderInvocations[0].transcript, "make me a scene");
  });
});

test("[studio-render] sync: applies corrected character bible memory to page prompt", async () => {
  const memoryCalls = [];
  const deps = defaultDeps({
    resolveUserId: () => "user-1",
    creativeMemoryStore: {
      getCreativeMemoryForPrompt: async (args) => {
        memoryCalls.push(args);
        return {
          userId: "user-1",
          version: 1,
          characters: [
            {
              name: "Mara",
              last_referenced: 100,
              bible: {
                canon: ["Mara is Eli's older sister and his legal guardian."],
                corrections: ["Authoritative correction for Mara: Mara is Eli's sister, not his mother."],
                correctedTerms: ["mother"],
                correctionReplacements: ["mother -> Eli's sister"],
                arc: {
                  act: "Act II",
                  want: "win Eli's trust before the hearing",
                  need: "tell the truth in public",
                  falseBelief: "truth will get Eli taken away",
                  currentTactic: "bury evidence to keep him close",
                  nextEmotionalTurn: "choose public courage over control",
                },
              },
            },
          ],
        };
      },
    },
  });

  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", {
      transcript: "Continue Mara's Act II page from the courthouse.",
      system_prompt: "Return screenplay pages only.",
      screenplay_target: "page",
      screenplay_project_id: "project-1",
      screenplay_project_title: "The Glass Orchard",
    });
    assert.equal(r.status, 200);
    assert.equal(memoryCalls.length, 1);
    assert.equal(memoryCalls[0].userId, "user-1");
    assert.equal(memoryCalls[0].projectId, "project-1");
    assert.equal(memoryCalls[0].projectTitle, "The Glass Orchard");
    assert.equal(memoryCalls[0].recordEpisodicRecall, true);
    const prompt = deps._calls.renderInvocations[0].systemPrompt;
    assert.match(prompt, /<creative_memory>/);
    assert.match(prompt, /Mara is Eli's older sister/);
    assert.match(prompt, /mother -> Eli's sister/);
    assert.match(prompt, /false_belief=truth will get Eli taken away/);
    assert.equal(r.body.memory_applied.creative_memory, true);
    assert.equal(r.body.memory_applied.character_bible, true);
    assert.equal(r.body.memory_applied.character_corrections, true);
    assert.equal(r.body.memory_applied.correction_applied_to_prompt, true);
    assert.deepEqual(r.body.memory_applied.characters, ["Mara"]);
    assert.deepEqual(r.body.memory_applied.corrected_terms, ["mother"]);
    assert.deepEqual(r.body.memory_applied.correction_replacements, ["mother -> Eli's sister"]);
  });
});

test("[studio-render] sync: ordinary voice pin target does not inject page memory", async () => {
  let memoryReads = 0;
  const deps = defaultDeps({
    resolveUserId: () => "user-1",
    creativeMemoryStore: {
      getCreativeMemoryForPrompt: async () => {
        memoryReads += 1;
        return null;
      },
    },
  });

  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", {
      transcript: "Just talk this through with me.",
      system_prompt: "Be conversational.",
      screenplay_target: "voice_pin",
    });
    assert.equal(r.status, 200);
    assert.equal(memoryReads, 0);
    assert.doesNotMatch(deps._calls.renderInvocations[0].systemPrompt, /<creative_memory>/);
    assert.equal(r.body.memory_applied, undefined);
  });
});

test("[studio-render] sync: writer-block voice pin applies corrected instincts to a playable fallback", async () => {
  const memoryCalls = [];
  const deps = defaultDeps({
    renderStudioRealtimeText: async () => "Maybe raise the stakes and trust your instincts.",
    resolveUserId: () => "user-1",
    creativeMemoryStore: {
      getCreativeMemoryForPrompt: async (args) => {
        memoryCalls.push(args);
        return {
          userId: "user-1",
          version: 3,
          projectContinuity: {
            projectId: "split-ferries",
            projectTitle: "Split Ferries",
            act: "Act II",
            featureSequence: "Bad Guys Close In",
            currentBeat: "Mara cannot decide whether to trust Eli.",
            characterFocus: ["Mara", "Eli"],
            storyMovePreferenceOverrides: [{
              family: "relationship_pressure",
              stance: "prefer",
              updatedAt: 5_000,
            }],
          },
        };
      },
    },
  });

  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", {
      transcript: "I am stuck in the middle. What should happen next?",
      system_prompt: "Be a decisive screenplay partner.",
      screenplay_target: "voice_pin",
      screenplay_project_id: "split-ferries",
      screenplay_project_title: "Split Ferries",
    });
    assert.equal(r.status, 200);
    assert.equal(memoryCalls.length, 1);
    assert.equal(memoryCalls[0].projectId, "split-ferries");
    assert.match(r.body.reply, /^Ranked strongest move - relationship pressure:/);
    assert.match(r.body.reply, /Mara/);
    assert.match(r.body.reply, /Causal turn:/);
    assert.match(r.body.reply, /Character cost:/);
    assert.match(r.body.reply, /Act progress: Act II progression:/);
    assert.equal(r.body.screenplay_quality.ok, true);
    assert.equal(r.body.screenplay_quality.source, "guard_momentum_rescue_fallback");
    assert.equal(r.body.screenplay_quality.repair_outcome, "fallback");
    assert.equal(r.body.screenplay_quality.counts.playableSpecificity, 1);
    assert.equal(r.body.screenplay_quality.counts.causalAdvancement, 1);
    assert.equal(r.body.screenplay_quality.counts.characterCost, 1);
    assert.equal(r.body.screenplay_quality.counts.actProgression, 1);
  });
});

test("[studio-render] sync: due canon outranks corrected instincts during writer-block fallback", async () => {
  const deps = defaultDeps({
    renderStudioRealtimeText: async () => "Try a twist and see what feels exciting.",
    resolveUserId: () => "user-1",
    creativeMemoryStore: {
      getCreativeMemoryForPrompt: async () => ({
        userId: "user-1",
        version: 4,
        projectContinuity: {
          projectId: "split-ferries",
          projectTitle: "Split Ferries",
          act: "Act II",
          featureSequence: "Bad Guys Close In",
          currentBeat: "Mara cannot decide whether to trust Eli.",
          characterFocus: ["Mara", "Eli"],
          storyMovePreferenceOverrides: [{
            family: "relationship_pressure",
            stance: "prefer",
            updatedAt: 5_000,
          }],
        },
        dueStoryThread: {
          kind: "setup",
          setup: "The red locket inside the courthouse clock",
          sourceSceneHeading: "INT. CLOCK TOWER - NIGHT",
          sourceAct: "Act I",
          ageInScenes: 14,
          acceptedSceneCount: 15,
        },
      }),
    },
  });

  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", {
      transcript: "I am stuck in the middle. What should happen next?",
      screenplay_target: "voice_pin",
      screenplay_project_id: "split-ferries",
    });
    assert.equal(r.status, 200);
    assert.match(r.body.reply, /^Ranked strongest move - payoff pressure:/);
    assert.match(r.body.reply, /The red locket inside the courthouse clock/);
    assert.doesNotMatch(r.body.reply, /^Ranked strongest move - relationship pressure:/);
    assert.equal(r.body.screenplay_quality.ok, true);
  });
});

test("[studio-render] sync: page target strips screenplay chat drift", async () => {
  const rawReply = [
    "Absolutely - here's the continuation.",
    "",
    "INT. DINER - NIGHT",
    "",
    "Rain needles the front window.",
    "",
    "MARA",
    "He came back.",
    "",
    "Want me to keep going?"
  ].join("\n");
  const deps = defaultDeps({
    renderStudioRealtimeText: async () => rawReply,
  });

  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", {
      transcript: "continue the scene",
      screenplay_target: "page",
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.reply, [
      "INT. DINER - NIGHT",
      "",
      "Rain needles the front window.",
      "",
      "MARA",
      "He came back."
    ].join("\n"));
  });
});

test("[studio-render] sync: page target strips strategy notes before screenplay text", async () => {
  const rawReply = [
    "Strategy: make the receipt the trap instead of exposition.",
    "The scene needs one irreversible turn before anyone explains the clue.",
    "",
    "INT. MOTEL ROOM - NIGHT",
    "",
    "June folds the receipt into a white square.",
    "",
    "MARCUS",
    "You kept it."
  ].join("\n");
  const deps = defaultDeps({
    renderStudioRealtimeText: async () => rawReply,
  });

  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", {
      transcript: "make this more expert and faster",
      screenplay_target: "page",
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.reply, [
      "INT. MOTEL ROOM - NIGHT",
      "",
      "June folds the receipt into a white square.",
      "",
      "MARCUS",
      "You kept it."
    ].join("\n"));
  });
});

test("[studio-render] sync: page target strips labels, dividers, and trailing craft notes", async () => {
  const rawReply = [
    "## Screenplay Pages",
    "---",
    "Here are the next pages:",
    "",
    "INT. MOTEL ROOM - NIGHT",
    "",
    "June folds the receipt into a white square.",
    "",
    "MARCUS",
    "You kept it.",
    "",
    "END SCENE.",
    "",
    "Why this works:",
    "This gives the scene pressure without explaining the feeling.",
    "Want me to keep going from here?"
  ].join("\n");
  const deps = defaultDeps({
    renderStudioRealtimeText: async () => rawReply,
  });

  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", {
      transcript: "write the next page",
      screenplay_target: "page",
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.reply, [
      "INT. MOTEL ROOM - NIGHT",
      "",
      "June folds the receipt into a white square.",
      "",
      "MARCUS",
      "You kept it."
    ].join("\n"));
  });
});

test("[studio-render] sync: page generation uses rich model budget and returns quality metadata", async () => {
  const deps = defaultDeps();
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", {
      transcript: "Continue the scene from here.",
      screenplay_target: "page",
    });

    assert.equal(r.status, 200);
    assert.equal(r.body.reply, VALID_SCREENPLAY_REPLY);
    assert.equal(r.body.screenplay_quality.ok, true);
    assert.equal(r.body.screenplay_quality.repair_outcome, "not_needed");
    assert.equal(deps._calls.renderInvocations.length, 1);
    assert.equal(deps._calls.renderInvocations[0].modelTier, "rich");
    assert.equal(deps._calls.renderInvocations[0].maxTokens, 1_600);
  });
});

test("[studio-render] sync: first page pass receives feature metadata when client prompt is not canonical", async () => {
  const contextualReply = [
    "INT. COURTHOUSE ARCHIVE - NIGHT",
    "",
    "The prosecutor's lockdown alarm seals the archive doors.",
    "",
    "Mara gives Eli the only brass key, the one he stole in Act I. He drives it into the wrong evidence locker before she can stop him.",
    "",
    "ELI",
    "You wanted me to choose.",
    "",
    "The locker opens. The planted subpoena slides across the floor under a red emergency light.",
    "",
    "MARA",
    "Then we make it public.",
    "",
    "Mara takes Eli's hand instead of the subpoena. Together they shoulder through the archive door as the prosecutor reaches for the alarm.",
  ].join("\n");
  const deps = defaultDeps({
    renderStudioRealtimeText: async (options) => {
      deps._calls.renderInvocations.push(options);
      return contextualReply;
    },
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", {
      transcript: "Write the next page from the courthouse trap.",
      system_prompt: "Return screenplay pages only.",
      screenplay_target: "page",
      screenplay_project_id: "project-glass-orchard",
      screenplay_document_revision_id: "revision-12",
      screenplay_act: "Act II",
      screenplay_feature_sequence: "Courthouse trap",
      screenplay_feature_obligation: "Force Mara to choose Eli over winning.",
      screenplay_scene_summary: "Mara discovers the subpoena was planted.",
      screenplay_current_beat: "The bailiff locks the archive doors.",
      screenplay_antagonistic_force: "The prosecutor controls the building.",
      screenplay_next_three_turns: [
        "Mara gives Eli the only key.",
        "Eli opens the wrong evidence locker.",
        "The planted subpoena becomes public.",
      ],
      screenplay_unresolved_setups: ["The brass key Eli stole in Act I."],
      screenplay_beat_sequence: ["Locked archive", "Wrong locker", "Public reversal"],
      screenplay_character_focus: ["Mara", "Eli"],
      screenplay_continuity_notes: ["Mara still believes control keeps Eli safe."],
      screenplay_page_count: 58,
      screenplay_target_pages: 110,
    });

    assert.equal(r.status, 200);
    assert.equal(deps._calls.renderInvocations.length, 1);
    const prompt = deps._calls.renderInvocations[0].systemPrompt;
    assert.match(prompt, /<feature_film_map>/);
    assert.match(prompt, /project-glass-orchard/);
    assert.match(prompt, /Act II/);
    assert.match(prompt, /Courthouse trap/);
    assert.match(prompt, /Force Mara to choose Eli over winning/);
    assert.match(prompt, /Mara gives Eli the only key/);
    assert.match(prompt, /The brass key Eli stole in Act I/);
    assert.match(prompt, /The prosecutor controls the building/);
    assert.match(prompt, /Mara still believes control keeps Eli safe/);
  });
});

test("[studio-render] sync: canonical Apple feature prompt is not duplicated", async () => {
  const deps = defaultDeps();
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", {
      transcript: "Continue the scene.",
      system_prompt: [
        "Return screenplay pages only.",
        "<feature_film_map>",
        "active_act: Act II",
        "</feature_film_map>",
      ].join("\n"),
      screenplay_target: "page",
      screenplay_act: "Act II",
      screenplay_feature_sequence: "Courthouse trap",
    });

    assert.equal(r.status, 200);
    const prompt = deps._calls.renderInvocations[0].systemPrompt;
    assert.equal((prompt.match(/<feature_film_map>/g) || []).length, 1);
  });
});

test("[studio-render] sync: malformed page receives exactly one repair before success", async () => {
  const calls = [];
  const deps = defaultDeps({
    renderStudioRealtimeText: async (options) => {
      calls.push(options);
      return calls.length === 1
        ? "Here are three ideas for what the scene could do next."
        : VALID_SCREENPLAY_REPLY;
    },
  });

  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", {
      transcript: "Write the next page.",
      system_prompt: "CANON_CORRECTION: Mara is Eli's sister.",
      screenplay_target: "page",
    });

    assert.equal(r.status, 200);
    assert.equal(r.body.reply, VALID_SCREENPLAY_REPLY);
    assert.equal(r.body.screenplay_quality.repair_outcome, "repaired");
    assert.equal(calls.length, 2);
    assert.equal(calls[1].repairAttempt, true);
    assert.equal(calls[1].modelTier, "rich");
    assert.match(calls[1].systemPrompt, /QUALITY_FAILURE:/);
    assert.match(calls[1].systemPrompt, /Mara is Eli's sister/);
    assert.match(calls[1].transcript, /WRITER_REQUEST:/);
  });
});

test("[studio-render] sync: accepted canon contradiction receives exactly one repair", async () => {
  const contradictoryReply = [
    "INT. ARCHIVE - NIGHT",
    "",
    "Mara drives a brass key into the evidence locker as footsteps close behind her.",
    "",
    "ELI",
    "I had no idea you forged the affidavit.",
    "",
    "Mara freezes with the key halfway through the lock.",
    "",
    "MARA",
    "Then listen now.",
    "",
    "The broken half drops inside the locker. Eli raises the original subpoena, its red seal reflected in the steel door.",
    "",
    "Mara takes the subpoena and steps toward the approaching guard instead of the exit.",
  ].join("\n");
  const calls = [];
  const deps = defaultDeps({
    resolveUserId: () => "user-1",
    creativeMemoryStore: {
      getCreativeMemoryForPrompt: async () => ({
        userId: "user-1",
        version: 1,
        characters: [],
        acceptedCausalFacts: [{
          kind: "revelation",
          fact: "MARA: I forged the affidavit.",
          sourceSceneHeading: "INT. COURTHOUSE - DAY",
          sourceAct: "Act II",
        }],
      }),
    },
    renderStudioRealtimeText: async (options) => {
      calls.push(options);
      return calls.length === 1 ? contradictoryReply : VALID_SCREENPLAY_REPLY;
    },
  });

  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", {
      transcript: "Continue the archive scene from the accepted reveal.",
      system_prompt: "Return screenplay pages only.",
      screenplay_target: "page",
      screenplay_project_id: "project-1",
    });

    assert.equal(r.status, 200);
    assert.equal(r.body.reply, VALID_SCREENPLAY_REPLY);
    assert.equal(r.body.screenplay_quality.repair_outcome, "repaired");
    assert.equal(r.body.screenplay_quality.initial_reason, "accepted_canon_contradiction");
    assert.equal(r.body.screenplay_quality.canon_facts_checked, 1);
    assert.deepEqual(r.body.screenplay_quality.canon_violation_types, []);
    assert.equal(r.body.memory_applied.accepted_causal_facts, 1);
    assert.equal(calls.length, 2);
    assert.match(calls[0].systemPrompt, /MARA: I forged the affidavit/);
    assert.match(calls[1].transcript, /BINDING_CAUSAL_FACT \[revelation\]: MARA: I forged the affidavit/);
    assert.match(calls[1].transcript, /CANON_VIOLATION \[revelation_reset\]:/);
  });
});

test("[studio-render] sync: rejected repair cannot be returned as a successful page", async () => {
  let calls = 0;
  const deps = defaultDeps({
    renderStudioRealtimeText: async () => {
      calls += 1;
      return calls === 1
        ? "Here is a recap instead of screenplay pages."
        : "The scene should probably become more intense.";
    },
  });

  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", {
      transcript: "Write the next page.",
      screenplay_target: "page",
    });

    assert.equal(r.status, 502);
    assert.equal(r.body.stage, "studio_render_quality");
    assert.equal(r.body.reply, undefined);
    assert.equal(r.body.screenplay_quality.repair_outcome, "rejected");
    assert.equal(calls, 2);
  });
});

test("[studio-render] sync: infers page target for typed screenplay continuation", async () => {
  const rawReply = [
    "Here are the next pages:",
    "",
    "INT. COURTHOUSE HALLWAY - NIGHT",
    "",
    "Mara stops walking before the verdict reaches her face.",
    "",
    "END SCENE.",
    "",
    "Want me to keep going?"
  ].join("\n");
  const deps = defaultDeps({
    renderStudioRealtimeText: async () => rawReply,
  });

  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", {
      transcript: "Continue the scene from here.",
      screenplay_draft_excerpt: "INT. COURTHOUSE HALLWAY - NIGHT\n\nMARA stops walking.",
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.reply, [
      "INT. COURTHOUSE HALLWAY - NIGHT",
      "",
      "Mara stops walking before the verdict reaches her face."
    ].join("\n"));
  });
});

test("[studio-render] sync: voice pin target preserves conversational reply", async () => {
  const reply = "I can keep helping you shape the scene from here.";
  const deps = defaultDeps({
    renderStudioRealtimeText: async () => reply,
  });

  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", {
      transcript: "help me think",
      screenplay_target: "voice_pin",
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.reply, reply);
  });
});

test("[studio-render] sync: 503 when OPENAI_API_KEY missing", async () => {
  const deps = defaultDeps({ getOpenAIApiKey: () => "" });
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", { transcript: "x" });
    assert.equal(r.status, 503);
    assert.equal(r.body.stage, "studio_render");
    assert.match(r.body.error, /OpenAI API key/);
  });
});

test("[studio-render] sync: explicit test render bypasses missing OPENAI_API_KEY", async () => {
  const deps = defaultDeps({
    getOpenAIApiKey: () => "",
    shouldAllowStudioRenderWithoutOpenAIKey: () => true,
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", { transcript: "x" });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.reply, "rendered reply");
    assert.equal(deps._calls.renderInvocations.length, 1);
  });
});

test("[studio-render] sync: 400 when transcript is empty", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", { transcript: "" });
    assert.equal(r.status, 400);
    assert.equal(r.body.stage, "studio_render");
    assert.match(r.body.error, /empty/);
  });
});

test("[studio-render] sync: 400 when neither transcript nor user_message provided", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", {});
    assert.equal(r.status, 400);
  });
});

test("[studio-render] sync: accepts user_message as fallback for transcript", async () => {
  const deps = defaultDeps();
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", { user_message: "alt field" });
    assert.equal(r.status, 200);
    assert.equal(deps._calls.renderInvocations[0].transcript, "alt field");
  });
});

test("[studio-render] sync: renderer error envelope honors err.status + err.stage + err.message", async () => {
  const err = Object.assign(new Error("upstream boom"), { status: 504, stage: "openai" });
  const deps = defaultDeps({
    renderStudioRealtimeText: async () => { throw err; },
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", { transcript: "x" });
    assert.equal(r.status, 504);
    assert.equal(r.body.stage, "openai");
    assert.match(r.body.error, /upstream boom/);
  });
});

test("[studio-render] sync: renderer error without status defaults to 502", async () => {
  const deps = defaultDeps({
    renderStudioRealtimeText: async () => { throw new Error("plain error"); },
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/studio_render", { transcript: "x" });
    assert.equal(r.status, 502);
    assert.equal(r.body.stage, "studio_render");
  });
});

// ---------- /realtime/studio_render_stream (SSE) ----------

test("[studio-render-stream] sse: emits meta + delta + done events on happy path", async () => {
  const deps = defaultDeps();
  await withTestServer(deps, async (baseURL) => {
    const r = await postSse(baseURL, "/realtime/studio_render_stream", { transcript: "stream me" });
    assert.equal(r.status, 200);
    assert.match(r.text, /event: meta\b/);
    assert.match(r.text, /event: delta\b/);
    assert.match(r.text, /event: done\b/);
    // Verify the deltas are in order.
    const deltaCount = (r.text.match(/event: delta\b/g) || []).length;
    assert.equal(deltaCount, 2, "expected 2 delta events from stub");
  });
});

test("[studio-render-stream] sse: applies corrected character bible memory and exposes metadata", async () => {
  const deps = defaultDeps({
    resolveUserId: () => "user-1",
    creativeMemoryStore: {
      getCreativeMemoryForPrompt: async () => ({
        userId: "user-1",
        version: 1,
        characters: [
          {
            name: "Mara",
            last_referenced: 100,
            bible: {
              canon: ["Mara is Eli's older sister and his legal guardian."],
              corrections: ["Authoritative correction for Mara: Mara is Eli's sister, not his mother."],
              correctedTerms: ["mother"],
              correctionReplacements: ["mother -> Eli's sister"],
              arc: {
                act: "Act II",
                want: "win Eli's trust before the hearing",
                need: "tell the truth in public",
              },
            },
          },
        ],
      }),
    },
  });

  await withTestServer(deps, async (baseURL) => {
    const r = await postSse(baseURL, "/realtime/studio_render_stream", {
      transcript: "Stream Mara's next Act II page.",
      system_prompt: "Return screenplay pages only.",
      screenplay_target: "page",
    });
    assert.equal(r.status, 200);
    assert.match(deps._calls.streamInvocations[0].systemPrompt, /<creative_memory>/);
    assert.match(deps._calls.streamInvocations[0].systemPrompt, /mother -> Eli's sister/);
    assert.match(r.text, /event: meta\b/);
    assert.match(r.text, /event: done\b/);
    assert.match(r.text, /"memory_applied":/);
    assert.match(r.text, /"character_bible":true/);
    assert.match(r.text, /"correction_applied_to_prompt":true/);
    assert.match(r.text, /"characters":\["Mara"\]/);
  });
});

test("[studio-render-stream] sse: page target strips screenplay chat drift from deltas and done", async () => {
  const rawReply = [
    "Absolutely - here's the continuation.",
    "",
    "INT. DINER - NIGHT",
    "",
    "Rain needles the front window.",
    "",
    "MARA",
    "He came back.",
    "",
    "Want me to keep going?"
  ].join("\n");
  const deps = defaultDeps({
    streamStudioRealtimeText: async ({ onDelta }) => {
      const first = "Absolutely - here's the continuation.\n\n";
      const second = `${first}INT. DINER - NIGHT\n\nRain needles the front window.\n\nMARA\nHe came back.`;
      await onDelta(first, first);
      await onDelta(second.slice(first.length), second);
      await onDelta("\n\nWant me to keep going?", rawReply);
      return rawReply;
    },
  });

  await withTestServer(deps, async (baseURL) => {
    const r = await postSse(baseURL, "/realtime/studio_render_stream", {
      transcript: "continue the scene",
      screenplay_target: "page",
    });
    assert.equal(r.status, 200);
    assert.match(r.text, /event: delta\b/);
    assert.match(r.text, /INT\. DINER - NIGHT/);
    assert.doesNotMatch(r.text, /Absolutely/);
    assert.doesNotMatch(r.text, /Want me to keep going/);
  });
});

test("[studio-render-stream] sse: page target strips labels and craft notes from deltas and done", async () => {
  const rawReply = [
    "## Screenplay Pages",
    "---",
    "Here are the next pages:",
    "",
    "INT. MOTEL ROOM - NIGHT",
    "",
    "June folds the receipt into a white square.",
    "",
    "MARCUS",
    "You kept it.",
    "",
    "END SCENE.",
    "",
    "Why this works:",
    "This gives the scene pressure without explaining the feeling."
  ].join("\n");
  const deps = defaultDeps({
    streamStudioRealtimeText: async ({ onDelta }) => {
      const first = "## Screenplay Pages\n---\nHere are the next pages:\n\n";
      const second = `${first}INT. MOTEL ROOM - NIGHT\n\nJune folds the receipt into a white square.\n\nMARCUS\nYou kept it.`;
      await onDelta(first, first);
      await onDelta(second.slice(first.length), second);
      await onDelta("\n\nEND SCENE.\n\nWhy this works:\nThis gives the scene pressure without explaining the feeling.", rawReply);
      return rawReply;
    },
  });

  await withTestServer(deps, async (baseURL) => {
    const r = await postSse(baseURL, "/realtime/studio_render_stream", {
      transcript: "write the next page",
      screenplay_target: "page",
    });
    assert.equal(r.status, 200);
    assert.match(r.text, /INT\. MOTEL ROOM - NIGHT/);
    assert.doesNotMatch(r.text, /Screenplay Pages/);
    assert.doesNotMatch(r.text, /Here are the next pages/);
    assert.doesNotMatch(r.text, /END SCENE/);
    assert.doesNotMatch(r.text, /Why this works/);
  });
});

test("[studio-render-stream] sse: repaired final replaces provisional page without duplicate delta", async () => {
  const provisional = "INT. HALL - NIGHT\n\nMara crosses the room.\n\n[INSERT SCENE HERE]";
  const repairCalls = [];
  const deps = defaultDeps({
    streamStudioRealtimeText: async ({ onDelta, modelTier, maxTokens }) => {
      assert.equal(modelTier, "rich");
      assert.equal(maxTokens, 1_600);
      await onDelta(provisional, provisional);
      return provisional;
    },
    renderStudioRealtimeText: async (options) => {
      repairCalls.push(options);
      return VALID_SCREENPLAY_REPLY;
    },
  });

  await withTestServer(deps, async (baseURL) => {
    const r = await postSse(baseURL, "/realtime/studio_render_stream", {
      transcript: "Write the next page.",
      screenplay_target: "page",
    });

    assert.equal(r.status, 200);
    assert.match(r.text, /"kind":"quality_repair"/);
    assert.match(r.text, /event: done\b/);
    assert.doesNotMatch(r.text, /event: error\b/);
    assert.match(r.text, /"repair_outcome":"repaired"/);
    assert.equal((r.text.match(/Mara drives a brass key/g) || []).length, 1);
    assert.equal(repairCalls.length, 1);
    assert.equal(repairCalls[0].repairAttempt, true);
  });
});

test("[studio-render-stream] sse: failed repair emits error and never commits done", async () => {
  const provisional = "INT. HALL - NIGHT\n\nMara crosses the room.\n\n[INSERT SCENE HERE]";
  let repairCalls = 0;
  const deps = defaultDeps({
    streamStudioRealtimeText: async ({ onDelta }) => {
      await onDelta(provisional, provisional);
      return provisional;
    },
    renderStudioRealtimeText: async () => {
      repairCalls += 1;
      return "A generic summary of what might happen next.";
    },
  });

  await withTestServer(deps, async (baseURL) => {
    const r = await postSse(baseURL, "/realtime/studio_render_stream", {
      transcript: "Write the next page.",
      screenplay_target: "page",
    });

    assert.equal(r.status, 200);
    assert.match(r.text, /event: error\b/);
    assert.match(r.text, /"stage":"studio_render_quality"/);
    assert.match(r.text, /"repair_outcome":"rejected"/);
    assert.doesNotMatch(r.text, /event: done\b/);
    assert.equal(repairCalls, 1);
  });
});

test("[studio-render-stream] sse: emits trace event on first delta", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postSse(baseURL, "/realtime/studio_render_stream", { transcript: "x" });
    assert.match(r.text, /event: trace\b/);
    assert.match(r.text, /"kind":"first_delta"/);
  });
});

test("[studio-render-stream] sse: 503 when OPENAI_API_KEY missing", async () => {
  const deps = defaultDeps({ getOpenAIApiKey: () => "" });
  await withTestServer(deps, async (baseURL) => {
    const r = await fetch(`${baseURL}/realtime/studio_render_stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transcript: "x" }),
    });
    assert.equal(r.status, 503);
    const body = await r.json();
    assert.equal(body.stage, "studio_render");
  });
});

test("[studio-render-stream] sse: explicit test render bypasses missing OPENAI_API_KEY", async () => {
  const deps = defaultDeps({
    getOpenAIApiKey: () => "",
    shouldAllowStudioRenderWithoutOpenAIKey: () => true,
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postSse(baseURL, "/realtime/studio_render_stream", { transcript: "x" });
    assert.equal(r.status, 200);
    assert.match(r.text, /event: done\b/);
    assert.equal(deps._calls.streamInvocations.length, 1);
  });
});

test("[studio-render-stream] sse: 400 when transcript empty", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await fetch(`${baseURL}/realtime/studio_render_stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transcript: "" }),
    });
    assert.equal(r.status, 400);
  });
});

test("[studio-render-stream] sse: emits error event when streamer throws", async () => {
  const err = Object.assign(new Error("stream boom"), { stage: "openai" });
  const deps = defaultDeps({
    streamStudioRealtimeText: async ({ onDelta }) => {
      await onDelta("partial", "partial");
      throw err;
    },
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postSse(baseURL, "/realtime/studio_render_stream", { transcript: "x" });
    assert.match(r.text, /event: error\b/);
    assert.match(r.text, /"stage":"openai"/);
    assert.match(r.text, /"error":"stream boom"/);
  });
});

test("[studio-render-stream] sse: sets correct SSE headers", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await fetch(`${baseURL}/realtime/studio_render_stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transcript: "x" }),
    });
    assert.equal(r.headers.get("content-type"), "text/event-stream");
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal(r.headers.get("connection"), "keep-alive");
    assert.ok(r.headers.get("x-studio-render-request-id"));
  });
});

test("[studio-render-stream] sse: response body is read to completion (no hung connection)", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postSse(baseURL, "/realtime/studio_render_stream", { transcript: "x" });
    // The body is fully read before the assertion — proves the server ended the response.
    assert.ok(r.text.length > 0);
    assert.match(r.text, /event: done\b/);
  });
});
