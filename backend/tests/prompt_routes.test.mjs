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
      assert.ok(body.prompt.includes("<screenplay_task>"));
      assert.ok(body.prompt.includes("intent: write_scene"));
      assert.ok(body.prompt.includes("project: proj-77"));
      assert.ok(body.prompt.includes("phase: scene_draft"));
      assert.ok(body.prompt.includes("pack: Feature Sprint"));
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
