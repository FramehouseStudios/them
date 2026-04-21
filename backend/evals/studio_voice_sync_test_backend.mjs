import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

import { startBackend } from "../tests/helpers/backend_test_server.mjs";

const DEFAULTS_DOMAIN = "io.them.them";
const TEST_APP_TOKEN = "them-dev";

function readDefaultState(key) {
  try {
    const value = execFileSync("defaults", ["read", DEFAULTS_DOMAIN, key], {
      encoding: "utf8",
    }).trim();
    return {
      exists: true,
      value,
    };
  } catch {
    return {
      exists: false,
      value: "",
    };
  }
}

function writeDefaultString(key, value) {
  execFileSync("defaults", ["write", DEFAULTS_DOMAIN, key, "-string", String(value ?? "")], {
    stdio: "ignore",
  });
}

function restoreDefaultState(key, state) {
  if (state?.exists) {
    writeDefaultString(key, state.value);
    return;
  }
  try {
    execFileSync("defaults", ["delete", DEFAULTS_DOMAIN, key], {
      stdio: "ignore",
    });
  } catch {
    // ignore missing defaults keys
  }
}

async function createSession(baseUrl, appToken) {
  const response = await fetch(`${baseUrl}/session`, {
    method: "POST",
    headers: {
      "X-APP-TOKEN": appToken,
    },
  });
  const payload = await response.json().catch(() => ({}));
  assert.equal(response.status, 201, `Failed to create Studio voice sync test session: ${response.status} ${JSON.stringify(payload)}`);
  const clientToken = String(payload?.client_token || "").trim();
  assert(clientToken, "Studio voice sync test session did not return a client token");
  return clientToken;
}

export async function withDeterministicStudioVoiceBackend(
  callback,
  {
    streamAudioEnabled = false,
    streamEndDelayMs = streamAudioEnabled ? 320 : 0,
  } = {},
) {
  const originalAppToken = readDefaultState("app_token");
  const originalClientToken = readDefaultState("client_token");
  const server = await startBackend({
    env: {
      APP_TOKEN: TEST_APP_TOKEN,
      REQUIRE_USER_AUTH: "0",
      TALK_TEST_DEBUG_OFFLINE_ENABLED: "1",
      TALK_TEST_DEBUG_TRANSCRIPT_ENABLED: "1",
      TALK_STREAM_AUDIO_ENABLED: streamAudioEnabled ? "1" : "0",
      TALK_TEST_DEBUG_STREAM_END_DELAY_MS: String(Math.max(0, Number(streamEndDelayMs || 0))),
    },
  });

  try {
    const clientToken = await createSession(server.baseUrl, TEST_APP_TOKEN);
    writeDefaultString("app_token", TEST_APP_TOKEN);
    writeDefaultString("client_token", clientToken);
    return await callback({
      appToken: TEST_APP_TOKEN,
      baseUrl: server.baseUrl,
      clientToken,
    });
  } finally {
    restoreDefaultState("app_token", originalAppToken);
    restoreDefaultState("client_token", originalClientToken);
    await server.stop();
  }
}
