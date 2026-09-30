import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { apiRequest, startBackend } from "./helpers/backend_test_server.mjs";

// A 74-page script's save answered 3.2 MB (24 full drafts) and the phone spent
// ~26 s per page on it (seen live 2026-09-30). A client naming the versions it
// already holds gets those drafts omitted; a client naming none gets them all.
test("[screenplay-known-version-drafts] saves and reads omit only the versions the client already holds", async () => {
  const server = await startBackend();
  const stamp = randomUUID().replace(/-/g, "");
  const projectId = `known-drafts-${stamp.slice(0, 12)}`;
  try {
    const signup = await apiRequest(server, "/auth/signup", {
      method: "POST",
      json: { email: `known-${stamp}@example.test`, password: `Known-${stamp}-aA1!`, display_name: "Known Drafts" },
    });
    assert.equal(signup.status, 201, signup.text);
    const headers = { Authorization: `Bearer ${signup.json?.access_token || signup.json?.token}` };
    const created = await apiRequest(server, "/screenplay/projects", {
      method: "POST", headers, json: { project_id: projectId, title: "Known Drafts", activate: true },
    });
    assert.equal(created.status, 201, created.text);

    const save = (draft, base, known) => apiRequest(server, `/screenplay/projects/${projectId}/version`, {
      method: "POST",
      headers,
      json: {
        draft,
        source: "studio_clementine_page_write",
        conflict_strategy: "reject_if_stale",
        ...(base ? { base_version_id: base } : {}),
        ...(known ? { known_version_ids: known } : {}),
      },
    });
    const first = await save("INT. SENATE CORRIDOR - NIGHT\n\nNora counts on her fingers.", "", null);
    assert.equal(first.status, 201, first.text);
    const firstId = first.json.version_id;

    const second = await save("INT. SENATE CORRIDOR - NIGHT\n\nNora counts on her fingers.\n\nDANNY\nTwenty-four.", firstId, [firstId]);
    assert.equal(second.status, 201, second.text);
    const secondId = second.json.version_id;
    const byId = Object.fromEntries(second.json.project.versions.map((version) => [version.id, version]));
    assert.equal(byId[firstId].draft ?? null, null, "the draft the client already holds is omitted");
    assert.equal(byId[firstId].studio_write_anchors ?? null, null, "and its write anchors (each carries inserted text)");
    assert.equal(byId[firstId].screenplay_bindings ?? null, null, "and its bindings");
    assert.ok(Array.isArray(byId[secondId].studio_write_anchors), "the new version keeps its anchors");
    assert.ok(byId[firstId].draft_excerpt || byId[firstId].id, "the version itself is still listed");
    assert.match(byId[secondId].draft, /Twenty-four/, "the new version's draft still ships");
    assert.equal(second.json.version.draft ?? null, null, "the client sent this draft; it is not echoed");
    assert.ok(Array.isArray(second.json.version.studio_write_anchors), "the saved version's anchors still come back");
    assert.equal(second.json.server_version.draft ?? null, null);
    assert.match(first.json.version.draft, /Nora counts/, "a client naming no versions gets the draft echoed as before");

    // Another device saved on top of firstId: the stale save must still see
    // that device's words in full, even though it names every version it holds.
    const stale = await save("INT. SENATE CORRIDOR - NIGHT\n\nA stale device's page.", firstId, [firstId, secondId]);
    assert.equal(stale.status, 409, stale.text);
    assert.equal(stale.json.server_version_id, secondId);
    assert.match(stale.json.server_version.draft, /Twenty-four/, "a conflict always carries the server's draft");

    const full = await apiRequest(server, `/screenplay/projects/${projectId}?include_drafts=1`, { headers });
    assert.equal(full.status, 200, full.text);
    assert.ok(full.json.project.versions.every((version) => typeof version.draft === "string"), "no field, every draft");

    const lean = await apiRequest(server, `/screenplay/projects/${projectId}?include_drafts=1&known_version_ids=${firstId},${secondId}`, { headers });
    assert.equal(lean.status, 200, lean.text);
    assert.ok(lean.json.project.versions.every((version) => version.draft == null), JSON.stringify(lean.json.project.versions));
  } finally {
    await server.stop();
  }
});
