import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startBackend, apiRequest } from "./helpers/backend_test_server.mjs";
import { createJsonPersistence } from "../lib/persistence_json.js";
import { createAdapterWalletPersistence } from "../lib/clementine/wallet_persistence.js";

for (const requireAuth of ["1", "0"]) {
  test(`wallet identity is server-owned with REQUIRE_USER_AUTH=${requireAuth}`, async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "them-wallet-auth-"));
    const options = { dataDir, unsetEnv: ["DATABASE_URL", "REDIS_URL"], env: {
      REQUIRE_USER_AUTH: requireAuth, CLEMENTINE_MUSE_ENABLED: "0",
    } };
    let server = await startBackend(options);
    try {
      const users = [];
      for (const suffix of ["a", "b"]) {
        const signup = await apiRequest(server, "/auth/signup", { method: "POST",
          json: { email: `wallet-${suffix}@example.com`, password: "wallet-fixture-password-123" } });
        assert.equal(signup.status, 201);
        users.push({ id: signup.json.user.user_id,
          token: signup.json.token || signup.json.access_token });
      }
      await server.stop();
      const persistence = createAdapterWalletPersistence({
        persistence: createJsonPersistence({ jsonRoot: path.join(dataDir, "persistence") }),
      });
      for (const [index, user] of users.entries()) {
        const page = index === 0 ? 7 : 11;
        const companion = index === 0 ? 19 : 23;
        await persistence.putBalance({ ownerId: user.id, pageMilliturns: page * 1000,
          companionMilliturns: companion * 1000, grantedPageMilliturns: page * 1000,
          grantedCompanionMilliturns: companion * 1000 });
      }
      server = await startBackend(options);
      const read = (token, json = {}, extraHeaders = {}) => apiRequest(server, "/talk/wallet", {
        method: "POST", json, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...extraHeaders },
      });
      const assertBalance = (response, page, companion) => {
        assert.equal(response.status, 200);
        assert.equal(response.json.pageTurnsLeft, page);
        assert.equal(response.json.companionTurnsLeft, companion);
        assert.deepEqual(Object.keys(response.json).sort(), ["ok", "companionTurnsLeft",
          "pageTurnsLeft", "approxConversationsLeft", "lowBalance"].sort());
      };
      assertBalance(await read(users[0].token), 7, 19);
      assertBalance(await read(users[1].token), 11, 23);
      for (const alias of ["owner_id", "ownerId", "user_id", "userId"]) {
        assertBalance(await read(users[1].token, { [alias]: users[0].id }, {
          "x-user-id": users[0].id, "x-session-id": users[0].id,
        }), 11, 23);
      }
      const assertDenied = (response, tokenError = "user_auth_required") => {
        assert.equal(response.status, 401);
        assert.equal(response.json.error,
          requireAuth === "1" ? tokenError : "user_auth_required");
        assert.equal(typeof response.json.stage, "string");
        assert.equal(response.response.headers.get("cache-control"), "no-store");
        assert.equal("pageTurnsLeft" in response.json, false);
        assert.equal("companionTurnsLeft" in response.json, false);
      };
      const spoof = { "x-user-id": users[0].id, "x-session-id": users[0].id };
      const cancel = token => apiRequest(server, "/talk/page-cancel", { method: "POST",
        headers: { ...spoof, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        json: { reservation_id: "unknown-reservation", user_id: users[0].id } });
      assertDenied(await cancel(null));
      assertDenied(await cancel("invalid-fixture-token"), "invalid_user_token");
      assert.equal((await cancel(users[0].token)).status, 404, "A valid user reaches the owned-reservation lookup");
      assertDenied(await read(null, { owner_id: users[0].id }, spoof));
      assertDenied(await read("invalid-fixture-token", { user_id: users[0].id }, spoof), "invalid_user_token");
      const logout = await apiRequest(server, "/auth/logout", { method: "POST", json: {},
        headers: { Authorization: `Bearer ${users[1].token}` } });
      assert.equal(logout.status, 200);
      assertDenied(await read(users[1].token, { owner_id: users[0].id }, spoof), "revoked_user_token");
      assertDenied(await cancel(users[1].token), "revoked_user_token");
      await server.stop();
      server = await startBackend(options);
      assertBalance(await read(users[0].token), 7, 19);
      assertDenied(await read(users[1].token, { owner_id: users[0].id }, spoof), "revoked_user_token");
      assertDenied(await cancel(users[1].token), "revoked_user_token");
      assert.equal((await cancel(users[0].token)).status, 404);
    } finally {
      await server.stop();
    }
  });
}
