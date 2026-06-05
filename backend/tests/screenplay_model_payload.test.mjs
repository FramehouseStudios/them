import assert from "node:assert/strict";
import { test } from "node:test";

import { createScreenplayModelServices } from "../services/screenplay_model.js";

function services() {
  return createScreenplayModelServices({
    recalculateScreenplayProject: (project) => {
      project.versionCount = Array.isArray(project.versions) ? project.versions.length : 0;
      project.outline = project.outline || { acts: [], scenes: [], beats: [] };
      return project;
    },
  });
}

test("[screenplay-model-payload] includes active version even beyond version limit", () => {
  const { toScreenplayProjectPayload } = services();
  const project = {
    id: "project-active-restore",
    title: "Active Restore",
    activeVersionId: "v_old_active",
    lastVersionId: "v_new",
    versions: [
      { id: "v_new", updatedAt: 300, draft: "INT. NEW - DAY" },
      { id: "v_mid", updatedAt: 200, draft: "INT. MID - DAY" },
      { id: "v_old_active", updatedAt: 100, draft: "INT. OLD ACTIVE - DAY" },
    ],
    outline: { acts: [], scenes: [], beats: [] },
  };

  const payload = toScreenplayProjectPayload(project, {
    includeVersions: true,
    includeDrafts: true,
    versionLimit: 1,
  });

  assert.equal(payload.active_version_id, "v_old_active");
  assert.deepEqual(payload.versions.map((version) => version.id), ["v_new", "v_old_active"]);
  assert.equal(payload.versions.find((version) => version.id === "v_old_active")?.draft, "INT. OLD ACTIVE - DAY");
});

test("[screenplay-model-payload] preserves active Clementine page write beyond version limit", () => {
  const { toScreenplayProjectPayload } = services();
  const generatedDraft = "FADE IN:\n\nINT. DINER - NIGHT\n\nClementine writes the room into focus.";
  const project = {
    id: "project-clementine-restore",
    title: "Clementine Restore",
    activeVersionId: "v_clementine_write",
    lastVersionId: "v_clementine_write",
    versions: [
      {
        id: "v_manual_newer",
        updatedAt: 300,
        draft: "INT. ROOM - DAY\n\nA manual draft sits above the generated one.",
        source: "studio_manual",
      },
      {
        id: "v_clementine_write",
        updatedAt: 200,
        draft: generatedDraft,
        source: "studio_clementine_page_write",
      },
    ],
    outline: { acts: [], scenes: [], beats: [] },
  };

  const payload = toScreenplayProjectPayload(project, {
    includeVersions: true,
    includeDrafts: true,
    versionLimit: 1,
  });

  const restoredVersion = payload.versions.find((version) => version.id === "v_clementine_write");
  assert.equal(payload.active_version_id, "v_clementine_write");
  assert.deepEqual(payload.versions.map((version) => version.id), ["v_manual_newer", "v_clementine_write"]);
  assert.equal(restoredVersion?.source, "studio_clementine_page_write");
  assert.equal(restoredVersion?.draft, generatedDraft);
});

test("[screenplay-model-payload] includes capped Studio ask-note history with screenplay line breaks", () => {
  const { toScreenplayProjectPayload } = services();
  const history = Array.from({ length: 26 }, (_, index) => ({
    id: `exchange-${index}`,
    prompt: `Prompt ${index}`,
    target: index === 0 ? "page" : "voicePin",
    source: "typed",
    noteTitle: "Wrote to page",
    noteBody: "INT. ROOM - NIGHT\n\nHe waits, still.",
    insertedText: "INT. ROOM - NIGHT\n\nHe waits, still.",
    writeID: `write-${index}`,
    timestamp: `2026-06-05T20:00:${String(index).padStart(2, "0")}.000Z`,
  }));
  const payload = toScreenplayProjectPayload({
    id: "project-history",
    title: "History",
    studioAskNoteHistory: history,
    outline: { acts: [], scenes: [], beats: [] },
  });

  assert.equal(payload.studio_ask_note_history.length, 24);
  assert.equal(payload.studio_ask_note_history[0].id, "exchange-0");
  assert.equal(payload.studio_ask_note_history[0].target, "page");
  assert.equal(payload.studio_ask_note_history[0].inserted_text, "INT. ROOM - NIGHT\n\nHe waits, still.");
  assert.equal(payload.studio_ask_note_history.at(-1).id, "exchange-23");
});

test("[screenplay-model-payload] outline payload removes orphan scene and beat references", () => {
  const { toScreenplayOutlinePayload } = services();
  const payload = toScreenplayOutlinePayload({
    acts: [
      { id: "act-live", title: "Act Live", order: 0, sceneIds: ["scene-live", "scene-missing"] },
    ],
    scenes: [
      { id: "scene-live", title: "Live", actId: "act-live", order: 0, beatIds: ["beat-live", "beat-missing"] },
      { id: "scene-orphan", title: "Orphan", actId: "act-missing", order: 1, beatIds: [] },
    ],
    beats: [
      { id: "beat-live", label: "Live Beat", sceneId: "scene-live", actId: "act-live", order: 0 },
      { id: "beat-orphan", label: "Orphan Beat", sceneId: "scene-missing", actId: "act-missing", order: 1 },
    ],
  });

  assert.deepEqual(payload.acts[0].scene_ids, ["scene-live"]);
  assert.equal(payload.scenes.find((scene) => scene.id === "scene-orphan")?.act_id, "");
  assert.deepEqual(payload.scenes.find((scene) => scene.id === "scene-live")?.beat_ids, ["beat-live"]);
  const orphanBeat = payload.beats.find((beat) => beat.id === "beat-orphan");
  assert.equal(orphanBeat?.scene_id, "");
  assert.equal(orphanBeat?.act_id, "");
});
