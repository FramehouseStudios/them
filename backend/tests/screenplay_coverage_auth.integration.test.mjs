import assert from "node:assert/strict";
import test from "node:test";
import { apiRequest, startBackend } from "./helpers/backend_test_server.mjs";

test("[coverage-auth] real backend requires user auth and reads only submitted pages", async () => {
  const server = await startBackend({ env: { REQUIRE_USER_AUTH: "true" } });
  const draft = "INT. KITCHEN - NIGHT\n\nMARA\nKeep the light on.\n\nFRANK\nIt costs us every minute.\n";
  try {
    const denied = await apiRequest(server, "/screenplay/coverage", {
      method: "POST", json: { title: "Kitchen", draft },
    });
    assert.equal(denied.status, 401);
    assert.equal(denied.json?.stage, "auth_user");

    // Synthetic identity in this helper's isolated temporary test store;
    // never signs into or creates an account on the production service.
    const signup = await apiRequest(server, "/auth/signup", {
      method: "POST",
      json: { email: "coverage-proof@example.com", password: "coverage-test-password-123" },
    });
    assert.equal(signup.status, 201);
    const headers = { Authorization: "Bearer " + signup.json.token };
    const request = { method: "POST", headers, json: { title: "Kitchen", draft } };
    const first = await apiRequest(server, "/screenplay/coverage", request);
    const second = await apiRequest(server, "/screenplay/coverage", request);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(first.json.stage, "screenplay_coverage");
    assert.equal(first.json.mode, "computed");
    assert.equal(first.json.title, "Kitchen");
    assert.deepEqual(first.json.characters.map((character) => character.name), ["MARA", "FRANK"]);
    assert.deepEqual(second.json, first.json);

    const changed = await apiRequest(server, "/screenplay/coverage", {
      method: "POST", headers,
      json: { title: "Roof", draft: "EXT. ROOF - DAWN\n\nJUNE\nDon't look down.\n" },
    });
    assert.equal(changed.status, 200);
    assert.equal(changed.json.title, "Roof");
    assert.deepEqual(changed.json.characters.map((character) => character.name), ["JUNE"]);
    assert.equal(JSON.stringify(changed.json).includes("MARA"), false);
    assert.equal(JSON.stringify(changed.json).includes("FRANK"), false);
  } finally {
    await server.stop();
  }
});
