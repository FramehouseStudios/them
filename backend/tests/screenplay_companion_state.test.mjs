import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  apiRequest,
  startBackend,
} from "./helpers/backend_test_server.mjs";

let server;

before(async () => {
  server = await startBackend({
    env: {
      REQUIRE_USER_AUTH: "0",
    },
  });
});

after(async () => {
  await server?.stop();
});

test("screenplay companion state defaults creative signals when none are stored", async () => {
  const result = await apiRequest(server, "/screenplay/companion/state");

  assert.equal(result.status, 200);
  assert.equal(result.json?.mode_raw, "coach");
  assert.deepEqual(result.json?.recent_turns ?? [], []);
  assert.equal(result.json?.signals?.intent?.kind, "reflective_support");
  assert.equal(result.json?.signals?.presence?.title ?? "", "");
  assert.equal(result.json?.signals?.proactive_suggestion, null);
});

test("screenplay companion state persists creative signals", async () => {
  const payload = {
    mode_raw: "coach",
    recent_turns: [
      {
        id: "compturn-test",
        user: "What should happen next in the motel scene?",
        assistant: "Push the confrontation into the parking lot so the scene starts exposed.",
        memory_domain: "project",
        recorded_at: "2026-04-18T19:08:00.000Z",
      },
    ],
    analytics: {
      updated_at: "2026-04-18T19:08:00.000Z",
      total_turns: 3,
      home_turns: 1,
      studio_turns: 2,
      voice_turns: 2,
      typed_turns: 1,
      mode_switches: 1,
      memory_clears: 0,
      thread_clears: 0,
      last_surface_raw: "studio",
      last_source_raw: "voice",
    },
    signals: {
      intent: {
        kind: "story_development",
        label: "Story Development",
        summary: "Pressure-test the scene turn before committing more pages.",
        next_move: "Offer one strong story move before branching into alternatives.",
        confidence: 0.86,
        source_text: "What should happen next in the motel scene?",
        updated_at: "2026-04-18T19:08:05.000Z",
      },
      presence: {
        title: "Co-writer Presence",
        detail: "Holding the creative thread and keeping the next story choice concrete.",
        updated_at: "2026-04-18T19:08:05.000Z",
      },
      proactive_suggestion: {
        category: "Story",
        prompt: "Ask: give me three stronger turns for this sequence",
        reason: "The user is still shaping the story move, so stronger alternatives help momentum.",
        updated_at: "2026-04-18T19:08:05.000Z",
      },
    },
  };

  const saved = await apiRequest(server, "/screenplay/companion/state", {
    method: "POST",
    json: payload,
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.json?.signals?.intent?.kind, "story_development");
  assert.equal(saved.json?.signals?.presence?.title, "Co-writer Presence");
  assert.equal(
    saved.json?.signals?.proactive_suggestion?.prompt,
    "Ask: give me three stronger turns for this sequence"
  );

  const reloaded = await apiRequest(server, "/screenplay/companion/state");
  assert.equal(reloaded.status, 200);
  assert.equal(reloaded.json?.signals?.intent?.summary, payload.signals.intent.summary);
  assert.equal(
    reloaded.json?.signals?.presence?.detail,
    payload.signals.presence.detail
  );
  assert.equal(
    reloaded.json?.signals?.proactive_suggestion?.reason,
    payload.signals.proactive_suggestion.reason
  );
});
