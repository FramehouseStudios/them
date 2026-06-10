// HTTP integration tests for the iOS prompt-builder endpoint.
// Keeps T24's server path small and explicit: the app posts one
// request, and the backend runs canonical buildModelPrompt(...).

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import { mountPromptRoutes } from "../lib/prompt_routes.js";
import { MEMORY_BLOCK_OPEN } from "../lib/prompt_assembly.js";
import {
  apiRequest,
  startBackend,
} from "./helpers/backend_test_server.mjs";

async function withTestServer(fn, {
  memory = null,
  craftBlock = "",
  userId = "user-prompt-1",
  promptRouteDeps = {},
} = {}) {
  let requestedMemoryUserId = "";
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.authUser = { id: userId };
    next();
  });
  mountPromptRoutes(app, {
    creativeMemoryStore: {
      getCreativeMemoryForPrompt({ userId: requestedUserId }) {
        requestedMemoryUserId = requestedUserId;
        return memory;
      },
    },
    buildCraftContextBlock({ framework }) {
      return craftBlock ? `${craftBlock} (${framework})` : "";
    },
    ...promptRouteDeps,
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  const baseURL = `http://127.0.0.1:${port}`;
  try {
    await fn({ baseURL, requestedMemoryUserId: () => requestedMemoryUserId });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function postJson(baseURL, path, payload, headers = {}) {
  const r = await fetch(`${baseURL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
  const body = await r.json().catch(() => null);
  return { status: r.status, body };
}

test("POST /screenplay/prompt/build assembles persona, memory, session, user input, and craft block", async () => {
  await withTestServer(
    async ({ baseURL, requestedMemoryUserId }) => {
      const { status, body } = await postJson(baseURL, "/screenplay/prompt/build", {
        persona: "PERSONA",
        user_input: "Write the all-is-lost beat.",
        session_context: {
          project_id: "proj-77",
          version_id: "v3",
          phase: "scene_draft",
          pack: "Feature Sprint",
          scene: "EXT. PIER - DAWN",
          act: "Act II",
          scene_objective: "Mara must decide whether to tell the truth before the boat leaves.",
          current_beat: "The tide exposes the old flare gun.",
          logline: "A public defender exposes a coastal cover-up before her sister takes the fall.",
          theme_argument: "Truth is only love if it costs you something.",
          central_question: "Can Mara tell the truth before it destroys the person she protects?",
          protagonist_want: "Win the public case.",
          protagonist_need: "Stop mistaking control for loyalty.",
          antagonistic_force: "A town that survives by burying evidence.",
          ending_image: "The empty pool filled with rainwater at dawn.",
          feature_sequence: "Act II - Promise Of The Premise (p26-p40)",
          feature_obligation: "Each scene should make Mara try a visible strategy and pay a price.",
          next_scene_plan: "Act II - Promise Of The Premise: Mara tries a new public tactic and pays for it privately.",
          next_scene_moves: [
            "Write tests that force different tactics instead of repeating the premise.",
            "Give each win a cost that narrows later choices.",
          ],
          beat_sequence: ["Tide pulls back", "Mara finds the flare gun", "Eli lies about the boat"],
          character_focus: ["Mara", "Eli"],
          unresolved_setups: ["The flare gun has been planted but not paid off."],
          continuity_notes: ["Keep the argument under the surface until the flare appears."],
          emotional_continuity: "Carry grief into tactical suspicion.",
          page_count: 38,
          target_pages: 110,
          draft_excerpt: "EXT. PIER - DAWN\n\nMARA watches the tide pull back.",
        },
        include_craft_context: true,
        craft_framework_id: "story-circle",
      });

      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.action, "screenplay_prompt_build");
      assert.equal(body.source, "buildModelPrompt");
      assert.equal(body.memory_applied, true);
      assert.equal(body.session_context_applied, true);
      assert.equal(body.craft_context_applied, true);
      assert.equal(body.craft_framework_id, "story-circle");
      assert.equal(body.screenplay_task_intent, "write_scene");
      assert.equal(body.screenplay_task_label, "Write Scene");
      assert.equal(requestedMemoryUserId(), "user-prompt-1");
      assert.ok(body.prompt.includes("PERSONA"));
      assert.ok(body.prompt.includes(MEMORY_BLOCK_OPEN));
      assert.ok(body.prompt.includes("tone: dry"));
      assert.ok(body.prompt.includes("<session>"));
      assert.ok(body.prompt.includes("<feature_film_map>"));
      assert.ok(body.prompt.includes("<screenplay_task>"));
      assert.ok(body.prompt.includes("intent: write_scene"));
      assert.ok(body.prompt.includes("project: proj-77"));
      assert.ok(body.prompt.includes("phase: scene_draft"));
      assert.ok(body.prompt.includes("pack: Feature Sprint"));
      assert.ok(body.prompt.includes("feature_continuity:"));
      assert.ok(body.prompt.includes("act: Act II"));
      assert.ok(body.prompt.includes("current_scene_objective: Mara must decide"));
      assert.ok(body.prompt.includes("current_beat: The tide exposes the old flare gun."));
      assert.ok(body.prompt.includes("feature_sequence: Act II - Promise Of The Premise"));
      assert.ok(body.prompt.includes("structural_obligation_due_now: Each scene should make Mara try"));
      assert.ok(body.prompt.includes("next_scene_plan: Act II - Promise Of The Premise"));
      assert.ok(body.prompt.includes("next_scene_moves:"));
      assert.ok(body.prompt.includes("Give each win a cost that narrows later choices."));
      assert.ok(body.prompt.includes("- Mara finds the flare gun"));
      assert.ok(body.prompt.includes("character_focus:"));
      assert.ok(body.prompt.includes("- Eli"));
      assert.ok(body.prompt.includes("unresolved_setups:"));
      assert.ok(body.prompt.includes("planted but not paid off"));
      assert.ok(body.prompt.includes("continuity_notes:"));
      assert.ok(body.prompt.includes("argument under the surface"));
      assert.ok(body.prompt.includes("emotional_handoff: Carry grief into tactical suspicion."));
      assert.ok(body.prompt.includes("estimated_page_count: 38"));
      assert.ok(body.prompt.includes("target_pages: 110"));
      assert.ok(body.prompt.includes("current_position: p38 / 110"));
      assert.ok(body.prompt.includes("current_sequence: Act II - Promise Of The Premise"));
      assert.ok(body.prompt.includes("Act I: wound, want, catalyst, debate, irreversible choice"));
      assert.ok(body.prompt.includes("act_bridge_ladder:"));
      assert.ok(body.prompt.includes("Act IIa -> Midpoint"));
      assert.ok(body.prompt.includes("feature_compass:"));
      assert.ok(body.prompt.includes("before_pages: silently lock act, sequence, scene job"));
      assert.ok(body.prompt.includes("page_quality_gate: no placeholder scenes"));
      assert.ok(body.prompt.includes("expert_scene_execution:"));
      assert.ok(body.prompt.includes("scene_job: make the objective, obstacle, pressure clock, and cost visible"));
      assert.ok(body.prompt.includes("pressure_clock: give the scene a visible deadline"));
      assert.ok(body.prompt.includes("page_first_protocol: when the target is page text"));
      assert.ok(body.prompt.includes("speed_protocol: when the user asks for pages"));
      assert.ok(body.prompt.includes("story_spine:"));
      assert.ok(body.prompt.includes("theme_argument: Truth is only love"));
      assert.ok(body.prompt.includes("central_question: Can Mara tell the truth"));
      assert.ok(body.prompt.includes("protagonist_need: Stop mistaking control for loyalty."));
      assert.ok(body.prompt.includes("ending_image: The empty pool filled with rainwater"));
      assert.ok(body.prompt.includes("next_page_moves:"));
      assert.ok(body.prompt.includes("Write tests that force different tactics"));
      assert.ok(body.prompt.includes("feature_completion_protocol:"));
      assert.ok(body.prompt.includes("current sequence, next three turns, Act III payoff path"));
      assert.ok(body.prompt.includes("draft_excerpt:"));
      assert.ok(body.prompt.includes("MARA watches the tide"));
      assert.ok(body.prompt.includes("Write the all-is-lost beat."));
      assert.ok(body.prompt.includes("CRAFT CONTEXT (story-circle)"));
    },
    {
      memory: {
        userId: "user-prompt-1",
        version: 1,
        updatedAt: 0,
        style: { preferredTone: "dry" },
      },
      craftBlock: "CRAFT CONTEXT",
    }
  );
});

test("POST /screenplay/prompt/build accepts X-User-Id when auth middleware is absent", async () => {
  const app = express();
  app.use(express.json());
  let requestedMemoryUserId = "";
  mountPromptRoutes(app, {
    creativeMemoryStore: {
      getCreativeMemoryForPrompt({ userId }) {
        requestedMemoryUserId = userId;
        return null;
      },
    },
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  try {
    const { status, body } = await postJson(
      baseURL,
      "/screenplay/prompt/build",
      { persona: "P" },
      { "X-User-Id": "header-user-1" }
    );
    assert.equal(status, 200);
    assert.equal(body.memory_applied, false);
    assert.equal(requestedMemoryUserId, "header-user-1");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("POST /screenplay/prompt/build can infer task from hint without duplicating user input", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await postJson(baseURL, "/screenplay/prompt/build", {
      persona: "PERSONA",
      user_input: "",
      screenplay_task_hint: "Continue the motel scene.",
    });

    assert.equal(status, 200);
    assert.equal(body.screenplay_task_intent, "continue_script");
    assert.ok(body.prompt.includes("<screenplay_task>"));
    assert.ok(body.prompt.includes("intent: continue_script"));
    assert.ok(!body.prompt.includes("Continue the motel scene."));
  });
});

test("POST /screenplay/prompt/build carries rewrite, scene-doctor, and dialogue task contracts", async () => {
  await withTestServer(async ({ baseURL }) => {
    const cases = [
      ["Replace that line with something sharper.", "rewrite_scene", "replace only the requested span"],
      ["Scene doctor this kitchen confrontation and tell me what's not working.", "scene_doctor", "highest-leverage fix"],
      ["Punch up this exchange so it has more subtext.", "dialogue_punchup", "only playable replacement screenplay text"],
      ["Help me finish this feature-length screenplay.", "finish_feature", "for planning, orient act/sequence pressure"],
      ["Help me write the whole feature from Act 1 through Act 2 into Act 3.", "finish_feature", "Locate the current act/sequence"],
      ["Help me write act three of my feature screenplay.", "finish_feature", "next three turns"],
      ["Make this scene more expert and faster.", "rewrite_scene", "stronger playable pages"],
    ];

    for (const [hint, expectedIntent, expectedContract] of cases) {
      const { status, body } = await postJson(baseURL, "/screenplay/prompt/build", {
        persona: "PERSONA",
        user_input: "",
        screenplay_task_hint: hint,
      });

      assert.equal(status, 200);
      assert.equal(body.screenplay_task_intent, expectedIntent);
      assert.ok(body.prompt.includes("<screenplay_task>"));
      assert.ok(body.prompt.includes(`intent: ${expectedIntent}`));
      assert.ok(body.prompt.includes(expectedContract));
    }
  });
});

test("POST /screenplay/prompt/build hydrates missing feature context from saved project/version", async () => {
  const owner = {
    projects: [
      {
        id: "saved-feature-1",
        title: "The Blue Hour",
        activeVersionId: "v2",
        lastPhase: "scene_draft",
        targetPages: 110,
        characters: ["June", "Marcus", "June"],
        outline: {
          acts: [{ id: "act2", label: "Act II" }],
          beats: [
            { id: "b1", label: "Receipt reveal" },
            { id: "b2", label: "Marcus lies badly" },
          ],
          scenes: [
            {
              id: "s2",
              heading: "INT. MOTEL ROOM - NIGHT",
              actId: "act2",
              objective: "June decides whether to burn the evidence or save Marcus.",
              summary: "The receipt exposes the lie but not the motive.",
              emotionalContinuity: "Carry diner fear into private suspicion.",
            },
          ],
        },
        versions: [
          {
            id: "v2",
            phase: "scene_draft",
            draft: [
              "INT. MOTEL ROOM - NIGHT",
              "",
              "JUNE studies the damp receipt under the bathroom light.",
              "",
              "MARCUS",
              "You have to trust me before sunrise.",
            ].join("\n"),
          },
        ],
      },
    ],
  };

  await withTestServer(
    async ({ baseURL }) => {
      const { status, body } = await postJson(baseURL, "/screenplay/prompt/build", {
        persona: "You are Clementine, a cinematic screenwriting partner.",
        user_input: "",
        screenplay_task_hint: "Write the next ten pages of act two.",
        session_context: {
          project_id: "saved-feature-1",
        },
      });

      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.session_context_applied, true);
      assert.equal(body.session_context_hydrated, true);
      assert.equal(body.screenplay_task_intent, "finish_feature");
      assert.equal(body.screenplay_task_feature_scope, "page_batch");
      assert.equal(body.screenplay_task_requested_act, "Act II");
      assert.equal(body.screenplay_task_requested_pages, 10);
      assert.ok(body.prompt.includes("project: saved-feature-1"));
      assert.ok(body.prompt.includes("version: v2"));
      assert.ok(body.prompt.includes("pack: The Blue Hour"));
      assert.ok(body.prompt.includes("scene: INT. MOTEL ROOM - NIGHT"));
      assert.ok(body.prompt.includes("feature_continuity:"));
      assert.ok(body.prompt.includes("<feature_film_map>"));
      assert.ok(body.prompt.includes("act: Act II"));
      assert.ok(body.prompt.includes("target_pages: 110"));
      assert.ok(body.prompt.includes("requested_page_batch: 10"));
      assert.ok(body.prompt.includes("Begin with playable Fountain text; do not preface with diagnosis"));
      assert.ok(body.prompt.includes("page-first delivery: if the request targets screenplay pages"));
      assert.ok(body.prompt.includes("feature page sprint: for multi-page asks"));
      assert.ok(body.prompt.includes("page_batch_execution_plan:"));
      assert.ok(body.prompt.includes("requested_pages: 10"));
      assert.ok(body.prompt.includes("act_sequence_runway:"));
      assert.ok(body.prompt.includes("Act II - Promise Of The Premise"));
      assert.ok(body.prompt.includes("Act II - Collapse / All Is Lost"));
      assert.ok(body.prompt.includes("delivery: write clean Fountain pages first"));
      assert.ok(body.prompt.includes("write playable Fountain immediately with no diagnosis"));
      assert.ok(body.prompt.includes("markdown fence, menu choices, or permission loop"));
      assert.ok(!body.prompt.includes("keep diagnosis to one sentence"));
      assert.ok(body.prompt.includes("active_act_label: Act II"));
      assert.ok(body.prompt.includes("position_basis: outline act label overrides low draft-page estimate."));
      assert.ok(body.prompt.includes("Act II must escalate tactics, reversals, midpoint pressure"));
      assert.ok(body.prompt.includes("feature_completion_protocol:"));
      assert.ok(body.prompt.includes("current_scene_objective: June decides whether to burn"));
      assert.ok(body.prompt.includes("current_scene_summary: The receipt exposes"));
      assert.ok(body.prompt.includes("current_beat: Marcus lies badly"));
      assert.ok(body.prompt.includes("- Receipt reveal"));
      assert.ok(body.prompt.includes("- Marcus"));
      assert.ok(body.prompt.includes("Saved project: The Blue Hour"));
      assert.ok(body.prompt.includes("emotional_handoff: Carry diner fear"));
      assert.ok(body.prompt.includes("draft_excerpt:"));
      assert.ok(body.prompt.includes("JUNE studies the damp receipt"));
    },
    {
      promptRouteDeps: {
        getOrCreateScreenplayOwnerRecord: () => owner,
        getScreenplayProjectRecord: (record, projectId) => {
          return (record.projects || []).find((project) => project.id === projectId) || null;
        },
        getLatestScreenplayVersion: (project) => project.versions?.[0] || null,
      },
    }
  );
});

test("POST /screenplay/prompt/build rejects empty prompt payloads", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await postJson(baseURL, "/screenplay/prompt/build", {});
    assert.equal(status, 400);
    assert.equal(body.stage, "screenplay_prompt_build");
  });
});

test("POST /screenplay/prompt/build parses JSON in the full backend app", async () => {
  const server = await startBackend({
    env: {
      REQUIRE_USER_AUTH: "0",
    },
  });

  try {
    const response = await apiRequest(server, "/screenplay/prompt/build", {
      method: "POST",
      json: {
        persona: "You are Clementine, a cinematic story editor.",
        screenplay_task_hint: "Keep writing from here.",
        session_context: {
          project_id: "prompt-json-smoke",
          draft_excerpt: "INT. KITCHEN - NIGHT\n\nJUNE waits by the sink.",
        },
      },
    });
    assert.equal(response.status, 200);
    assert.equal(response.json?.ok, true);
    assert.equal(response.json?.screenplay_task_intent, "continue_script");
  } finally {
    await server.stop();
  }
});
