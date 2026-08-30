import assert from "node:assert/strict";
import express from "express";

import { mountPromptRoutes } from "../lib/prompt_routes.js";

const SHARED_USER_ID = "cross-platform-restore-user";
const SHARED_PROJECT_ID = "cross-platform-feature-memory";
const SHARED_VERSION_ID = "rev-cross-platform-17";
const TASK_HINT = "Continue the next five pages from the last accepted script pages.";

const persistentMemory = {
  userId: SHARED_USER_ID,
  version: 1,
  updatedAt: 1_800_000_500_000,
  screenplayProjectMemory: [
    {
      projectId: SHARED_PROJECT_ID,
      documentRevisionId: SHARED_VERSION_ID,
      act: "Act II",
      sceneLabel: "INT. EDIT BAY - NIGHT",
      sceneObjective: "Mara must choose whether to show the reel before Marcus can bury it.",
      sceneSummary: "The recovered reel proves the studio lied, but it also exposes Mara's brother.",
      currentBeat: "Mara pockets the reel and sees the same blue symbol on the sealed affidavit.",
      logline: "A haunted film editor rebuilds a missing reel to overturn her brother's conviction.",
      themeArgument: "Memory only heals when it becomes action.",
      centralQuestion: "Can Mara expose the truth without becoming another editor of it?",
      protagonistWant: "Mara wants the missing final reel.",
      protagonistNeed: "Mara needs to trust someone else with the truth.",
      antagonisticForce: "Marcus and a studio archive that erases witnesses.",
      endingImage: "Mara projects the repaired reel onto the courthouse wall at dawn.",
      featureSequence: "Act II - Reversal Fallout",
      featureObligation: "The old tactic should stop working and force a public choice.",
      nextScenePlan: "Mara returns to the edit bay and realizes the recovered reel is bait.",
      nextSceneMoves: [
        "Make the apparent win become a trap.",
        "Force Mara to choose whether to protect her brother or expose the reel.",
      ],
      beatSequence: [
        "Mara hides the reel.",
        "The blue symbol repeats on the sealed affidavit.",
        "Marcus arrives before the projector cools.",
      ],
      characterFocus: ["Mara", "Marcus", "Eli"],
      unresolvedSetups: ["missing final reel", "sealed affidavit", "blue symbol"],
      continuityNotes: ["Do not forgive Marcus before the midpoint cost lands."],
      emotionalContinuity: "Resolve fractures into grief, then reforms as courage.",
      lastWritePreview: "INT. EDIT BAY - NIGHT\n\nMARA pockets the reel before the projector dies.",
      pageCount: 62,
      targetPages: 110,
      updatedAt: 1_800_000_500_000,
    },
  ],
};

function includesAll(source, markers, label) {
  for (const marker of markers) {
    assert.ok(
      source.includes(marker),
      `${label} prompt is missing marker: ${marker}`
    );
  }
}

async function withPromptServer(fn) {
  let requestedMemoryUserId = "";
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.authUser = { id: SHARED_USER_ID };
    next();
  });
  mountPromptRoutes(app, {
    creativeMemoryStore: {
      getCreativeMemoryForPrompt({ userId }) {
        requestedMemoryUserId = userId;
        return persistentMemory;
      },
    },
  });

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn({ baseURL, requestedMemoryUserId: () => requestedMemoryUserId });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function postPrompt(baseURL, payload) {
  const response = await fetch(`${baseURL}/screenplay/prompt/build`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => null);
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body?.ok, true);
  return body;
}

function assertRestoredPromptContract(body, label) {
  assert.equal(body.memory_applied, true, `${label} should apply persistent memory.`);
  assert.equal(body.session_context_applied, true, `${label} should rebuild a session context.`);
  assert.equal(body.session_context_hydrated, true, `${label} should hydrate from persistent screenplay memory.`);
  assert.equal(body.screenplay_task_intent, "finish_feature");
  assert.equal(body.screenplay_task_feature_scope, "page_batch");
  assert.equal(body.screenplay_task_requested_pages, 5);

  includesAll(body.prompt, [
    `project: ${SHARED_PROJECT_ID}`,
    `version: ${SHARED_VERSION_ID}`,
    "scene: INT. EDIT BAY - NIGHT",
    "act: Act II",
    "current_scene_objective: Mara must choose whether to show the reel",
    "current_beat: Mara pockets the reel",
    "feature_sequence: Act II - Reversal Fallout",
    "structural_obligation_due_now: The old tactic should stop working",
    "persistent_memory_brief: logline: A haunted film editor rebuilds",
    "open setups: missing final reel / sealed affidavit / blue symbol",
    "next_scene_plan: Mara returns to the edit bay",
    "next_scene_moves:",
    "Force Mara to choose whether to protect her brother",
    "beat_sequence:",
    "Marcus arrives before the projector cools.",
    "character_focus:",
    "- Eli",
    "unresolved_setups:",
    "blue symbol",
    "continuity_notes:",
    "Persistent feature sequence: Act II - Reversal Fallout",
    "emotional_handoff: Resolve fractures into grief",
    "estimated_page_count: 62",
    "target_pages: 110",
    "draft_excerpt:",
    "MARA pockets the reel",
    "<feature_film_map>",
    "current_position: p62 / 110",
    "current_sequence: Act II - Reversal Fallout",
    "next_page_moves:",
    "<screenplay_task>",
    "requested_page_batch: 5",
    "Begin with playable Fountain text; do not preface with diagnosis",
  ], label);
}

await withPromptServer(async ({ baseURL, requestedMemoryUserId }) => {
  const iPhonePayload = {
    persona: "You are Clementine, a cinematic screenwriting partner.",
    user_input: "",
    screenplay_task_hint: TASK_HINT,
    session_context: {
      project_id: SHARED_PROJECT_ID,
    },
  };

  const macOSPayload = {
    persona: "You are Clementine, a cinematic screenwriting partner.",
    userInput: "",
    screenplayTaskHint: TASK_HINT,
    sessionContext: {
      projectId: SHARED_PROJECT_ID,
    },
  };

  const iPhone = await postPrompt(baseURL, iPhonePayload);
  const macOS = await postPrompt(baseURL, macOSPayload);

  assert.equal(requestedMemoryUserId(), SHARED_USER_ID);
  assertRestoredPromptContract(iPhone, "iPhone");
  assertRestoredPromptContract(macOS, "macOS");
  assert.equal(iPhone.prompt, macOS.prompt, "iPhone and macOS relaunch prompt contracts should match exactly.");

  console.log(JSON.stringify({
    ok: true,
    projectID: SHARED_PROJECT_ID,
    versionID: SHARED_VERSION_ID,
    platformContracts: ["iPhone", "macOS"],
    intent: iPhone.screenplay_task_intent,
    requestedPages: iPhone.screenplay_task_requested_pages,
    featureScope: iPhone.screenplay_task_feature_scope,
  }, null, 2));
  console.log("studio-cross-platform-prompt-restore-contract-smoke: ok");
});
