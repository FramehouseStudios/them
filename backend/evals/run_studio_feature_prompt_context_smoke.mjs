import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  apiRequest,
  startBackend,
} from "../tests/helpers/backend_test_server.mjs";

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

function assertIncludes(text, snippet, label) {
  assert.ok(
    String(text || "").includes(snippet),
    `${label} missing snippet: ${snippet}`
  );
}

async function signup(server) {
  const email = `studio-feature-context-${randomUUID()}@example.test`;
  const result = await apiRequest(server, "/auth/signup", {
    method: "POST",
    json: {
      email,
      password: `FeatureContext-${randomUUID()}-aA1!`,
      display_name: "Studio Feature Prompt Context Smoke",
    },
  });
  assert.equal(result.status, 201, `signup failed: ${result.text}`);
  const token = String(result.json?.access_token || "").trim();
  const userId = String(result.json?.user?.user_id || result.json?.user?.id || "").trim();
  assert.ok(token, "signup did not return an access token");
  assert.ok(userId, "signup did not return a user id");
  return { email, token, userId };
}

const server = await startBackend();
let smokeResult = null;

try {
  const owner = await signup(server);
  const headers = authHeaders(owner.token);
  const projectId = `studio-feature-context-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const marker = `FEATURE-CONTEXT-${Date.now().toString(36).toUpperCase()}`;
  const title = `Clementine Feature Context Smoke ${marker}`;
  const draft = [
    "INT. MOTEL ROOM - NIGHT",
    "",
    `JUNE studies the damp receipt under the bathroom light. ${marker}`,
    "",
    "MARCUS",
    "You have to trust me before sunrise.",
    "",
    "June folds the receipt until the motel name disappears.",
  ].join("\n");

  const created = await apiRequest(server, "/screenplay/projects", {
    method: "POST",
    headers,
    json: {
      project_id: projectId,
      title,
      phase: "scene_draft",
      activate: true,
    },
  });
  assert.equal(created.status, 201, `project create failed: ${created.text}`);

  const outline = await apiRequest(server, `/screenplay/projects/${projectId}/outline`, {
    method: "POST",
    headers,
    json: {
      acts: [
        { id: "act2", title: "Act II" },
      ],
      beats: [
        { id: "beat_receipt", label: "Receipt reveal", actId: "act2", sceneId: "scene_motel" },
        { id: "beat_lie", label: "Marcus lies badly", actId: "act2", sceneId: "scene_motel" },
      ],
      scenes: [
        {
          id: "scene_motel",
          title: "INT. MOTEL ROOM - NIGHT",
          slugline: "INT. MOTEL ROOM - NIGHT",
          actId: "act2",
          objective: "June decides whether to burn the evidence or save Marcus.",
          summary: "The receipt exposes the lie but not the motive.",
        },
      ],
    },
  });
  assert.equal(outline.status, 200, `outline save failed: ${outline.text}`);

  const savedVersion = await apiRequest(server, `/screenplay/projects/${projectId}/version`, {
    method: "POST",
    headers,
    json: {
      draft,
      phase: "scene_draft",
      source: "studio_clementine_page_write",
      conflict_strategy: "allow",
    },
  });
  assert.equal(savedVersion.status, 201, `version save failed: ${savedVersion.text}`);
  const versionId = String(savedVersion.json?.version_id || "").trim();
  assert.ok(versionId, "version save did not return a version id");

  const fetchedProject = await apiRequest(
    server,
    `/screenplay/projects/${projectId}?include_drafts=1&version_limit=4`,
    { headers }
  );
  assert.equal(fetchedProject.status, 200, `project fetch failed: ${fetchedProject.text}`);
  const projectPayload = fetchedProject.json?.payload?.project || fetchedProject.json?.project || {};
  assert.equal(String(projectPayload.id || ""), projectId);
  assert.equal(String(projectPayload.active_version_id || projectPayload.activeVersionId || ""), versionId);

  const persona = "You are Clementine, an emotionally cinematic feature-film writing partner.";
  const continueBuild = await apiRequest(server, "/screenplay/prompt/build", {
    method: "POST",
    headers,
    json: {
      persona,
      user_input: "",
      screenplay_task_hint: "Write the next ten pages of act two.",
      session_context: {
        project_id: projectId,
      },
    },
  });
  assert.equal(continueBuild.status, 200, `continue prompt build failed: ${continueBuild.text}`);
  assert.equal(continueBuild.json?.ok, true);
  assert.equal(continueBuild.json?.session_context_applied, true);
  assert.equal(continueBuild.json?.session_context_hydrated, true);
  assert.equal(continueBuild.json?.screenplay_task_intent, "finish_feature");

  const continuePrompt = String(continueBuild.json?.prompt || "");
  for (const snippet of [
    `project: ${projectId}`,
    `version: ${versionId}`,
    `pack: ${title}`,
    "scene: INT. MOTEL ROOM - NIGHT",
    "feature_continuity:",
    "act: Act II",
    "current_scene_objective: June decides whether to burn the evidence or save Marcus.",
    "current_scene_summary: The receipt exposes the lie but not the motive.",
    "current_beat: Marcus lies badly",
    "- Receipt reveal",
    "- Marcus lies badly",
    "draft_excerpt:",
    marker,
    "intent: finish_feature",
    "<feature_film_map>",
    "active_act_label: Act II",
    "position_basis: outline act label overrides low draft-page estimate.",
    "Act II must escalate tactics, reversals, midpoint pressure",
    "feature_completion_protocol:",
    "active_sequence_pressure: Act II - Promise Of The Premise",
  ]) {
    assertIncludes(continuePrompt, snippet, "continue prompt");
  }
  assert.ok(continuePrompt.length <= 12_000, `continue prompt too large: ${continuePrompt.length}`);

  const rewriteBuild = await apiRequest(server, "/screenplay/prompt/build", {
    method: "POST",
    headers,
    json: {
      persona,
      user_input: "",
      screenplay_task_hint: "Rewrite Marcus's last exchange so it is shorter and more wounded.",
      session_context: {
        project_id: projectId,
        version_id: versionId,
      },
    },
  });
  assert.equal(rewriteBuild.status, 200, `rewrite prompt build failed: ${rewriteBuild.text}`);
  assert.equal(rewriteBuild.json?.ok, true);
  assert.equal(rewriteBuild.json?.session_context_applied, true);
  assert.equal(rewriteBuild.json?.session_context_hydrated, true);
  assert.equal(rewriteBuild.json?.screenplay_task_intent, "rewrite_scene");

  const rewritePrompt = String(rewriteBuild.json?.prompt || "");
  for (const snippet of [
    `project: ${projectId}`,
    `version: ${versionId}`,
    "draft_excerpt:",
    marker,
    "intent: rewrite_scene",
    "Preserve the writer's intention and continuity",
    "current_scene_objective: June decides whether to burn",
  ]) {
    assertIncludes(rewritePrompt, snippet, "rewrite prompt");
  }
  assert.ok(rewritePrompt.length <= 12_000, `rewrite prompt too large: ${rewritePrompt.length}`);

  smokeResult = {
    ok: true,
    userId: owner.userId,
    projectId,
    versionId,
    marker,
    continueIntent: continueBuild.json?.screenplay_task_intent,
    rewriteIntent: rewriteBuild.json?.screenplay_task_intent,
    continuePromptLength: continuePrompt.length,
    rewritePromptLength: rewritePrompt.length,
    hydratedContinueContext: continueBuild.json?.session_context_hydrated === true,
    hydratedRewriteContext: rewriteBuild.json?.session_context_hydrated === true,
  };
  console.log(JSON.stringify(smokeResult, null, 2));
  console.log("studio-feature-prompt-context-smoke: ok");
} finally {
  await server.stop();
}
