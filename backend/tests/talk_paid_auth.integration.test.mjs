import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { startBackend, apiRequest } from "./helpers/backend_test_server.mjs";
import { createJsonPersistence } from "../lib/persistence_json.js";
import { createAdapterWalletPersistence } from "../lib/clementine/wallet_persistence.js";

for (const requireAuth of ["0", "1"]) {
  test(`paid talk requires verified identity with global auth=${requireAuth}`, { timeout: 60000 }, async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "them-paid-talk-auth-"));
    const options = { dataDir, unsetEnv: ["DATABASE_URL", "REDIS_URL"], env: {
      REQUIRE_USER_AUTH: requireAuth, CLEMENTINE_MUSE_ENABLED: "0",
      TALK_TEST_DEBUG_TRANSCRIPT_ENABLED: "1", TALK_TEST_DEBUG_OFFLINE_ENABLED: "1",
      TALK_STREAM_AUDIO_ENABLED: "0",
    } };
    let server = await startBackend(options);
    try {
      const users = [];
      for (const name of ["owner", "other"]) {
        const signup = await apiRequest(server, "/auth/signup", { method: "POST",
          json: { email: `${name}@paid-talk-fixture.example`, password: "paid-talk-fixture-password-123" } });
        assert.equal(signup.status, 201);
        users.push({ id: signup.json.user.user_id, token: signup.json.access_token || signup.json.token });
      }
      await server.stop();
      const wallets = createAdapterWalletPersistence({ persistence: createJsonPersistence({
        jsonRoot: path.join(dataDir, "persistence"),
      }) });
      for (const [index, user] of users.entries()) {
        await wallets.putBalance({ ownerId: user.id, pageMilliturns: (7 + index * 4) * 1000,
          companionMilliturns: 19000, grantedPageMilliturns: (7 + index * 4) * 1000,
          grantedCompanionMilliturns: 19000 });
      }
      server = await startBackend(options);
      const auth = token => ({ Authorization: `Bearer ${token}` });
      const balance = async user => {
        const response = await apiRequest(server, "/talk/wallet", { method: "POST", json: {}, headers: auth(user.token) });
        assert.equal(response.status, 200);
        return response.json;
      };
      const before = await Promise.all(users.map(balance));
      const draft = "INT. CABIN - NIGHT\n\nRain strikes the glass.\n\nMARA\nWe stay until morning.";
      const talk = (route, token) => {
        const form = new FormData();
        form.set("client_transcript", "Write the prepared screenplay block to the page.");
        form.set("screenplay_generation_transcript", draft);
        form.set("screenplay_target", "page");
        form.set("user_id", users[0].id);
        form.set("max_output_tokens", "400");
        form.set("file", new Blob([fs.readFileSync(new URL("../test.wav", import.meta.url))], { type: "audio/wav" }), "test.wav");
        return apiRequest(server, route, { method: "POST", body: form, headers: {
          ...(token ? auth(token) : {}), "X-User-Id": users[0].id, "X-Session-Id": users[0].id,
        } });
      };
      const denied = response => {
        assert.equal(response.status, 401, `Unverified talk reached HTTP${response.status}; reservation=${response.response.headers.get("x-clementine-page-reservation")}`);
        assert.equal(response.json.stage, "auth_user");
        assert.equal(response.response.headers.get("cache-control"), "no-store");
        for (const header of ["x-clementine-page-reservation", "x-session-bootstrap", "x-screenplay-authoritative"]) {
          assert.equal(response.response.headers.get(header), null, "Auth must reject before the talk pipeline");
        }
      };
      for (const route of ["/talk", "/TaLk/"]) {
        denied(await talk(route));
        denied(await talk(route, "invalid-fixture-token"));
      }
      assert.deepEqual(await Promise.all(users.map(balance)), before, "Rejected requests must not reserve either wallet");

      const own = await talk("/TaLk/", users[1].token);
      assert.equal(own.status, 200, "A verified writer must retain the actual offline talk fixture path");
      assert.equal(own.response.headers.get("x-screenplay-authoritative"), "1");
      assert.deepEqual(await balance(users[0]), before[0], "A verified writer cannot select the other wallet through a body/header alias");

      assert.equal((await apiRequest(server, "/auth/logout", { method: "POST", json: {}, headers: auth(users[1].token) })).status, 200);
      denied(await talk("/talk", users[1].token));
      await server.stop();
      server = await startBackend(options);
      denied(await talk("/TaLk/", users[1].token));
      assert.deepEqual(await balance(users[0]), before[0]);
    } finally {
      await server.stop();
    }
  });
}
