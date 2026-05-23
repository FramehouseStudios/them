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
