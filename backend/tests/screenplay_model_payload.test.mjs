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
