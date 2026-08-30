function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForHealth() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const { payload } = await readJson("http://127.0.0.1:3000/health");
      if (payload?.ok === true) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Backend health is not OK on localhost:3000");
}

async function readJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Connection: "close",
    },
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function jsonHeaders(extra = {}) {
  return {
    "content-type": "application/json",
    "x-app-token": "them-dev",
    ...extra,
  };
}

function tokenHeaders(clientToken) {
  return jsonHeaders({ "x-client-token": clientToken });
}

function authHeaders(token, extra = {}) {
  return jsonHeaders({ Authorization: `Bearer ${token}`, ...extra });
}

function authClientHeaders(user, extra = {}) {
  return authHeaders(user.token, {
    "x-client-token": user.clientToken,
    ...extra,
  });
}

async function createClientSession(token) {
  const { response, payload } = await readJson("http://127.0.0.1:3000/session", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({}),
  });
  assert(response.ok, `Failed to create owner restore client session: ${response.status} ${JSON.stringify(payload)}`);
  const clientToken = String(payload?.client_token || payload?.session_id || "").trim();
  assert(clientToken, "Session did not return a client token");
  return clientToken;
}

async function signupUser(email, password = "OwnerRestore-password-123-aA1!") {
  const { response, payload } = await readJson("http://127.0.0.1:3000/auth/signup", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email, password, display_name: "Studio Owner Restore Smoke" }),
  });
  assert(response.status === 201 || response.ok, `Failed to signup owner user: ${response.status} ${JSON.stringify(payload)}`);
  const token = String(payload?.access_token || payload?.token || "").trim();
  const userId = String(
    payload?.user?.id ||
    payload?.user?.user_id ||
    payload?.user?.userId ||
    payload?.user_id ||
    payload?.userId ||
    ""
  ).trim();
  assert(token, "Signup did not return an access token");
  assert(userId, "Signup did not return a user id");
  const clientToken = await createClientSession(token);
  return { token, userId, clientToken };
}

async function upsertProjectRequest(projectId, title, headers, marker) {
  return readJson("http://127.0.0.1:3000/screenplay/projects", {
    method: "POST",
    headers,
    body: JSON.stringify({
      project_id: projectId,
      title,
      phase: "scene_draft",
      activate: true,
      studio_thread_view_state: {
        focused_diff_key: `thread:${marker}`,
        reopened_lineage_keys: [`lineage:${marker}`],
        latest_reopened_write_id: `write-${marker}`,
      },
      studio_diff_acknowledged_entries: [{
        key: `lineage:${marker}`,
        fingerprint: `fingerprint-${marker}`,
        write_id: `write-${marker}`,
      }],
    }),
  });
}

async function upsertProject(projectId, title, headers, marker) {
  const { response, payload } = await upsertProjectRequest(projectId, title, headers, marker);
  assert(response.ok, `Failed to upsert project ${projectId}: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

async function fetchProject(projectId, headers) {
  const { response, payload } = await readJson(`http://127.0.0.1:3000/screenplay/projects/${projectId}?include_drafts=1`, {
    headers,
  });
  return { response, payload };
}

function assertProjectShape(payload, expected) {
  const project = payload?.payload?.project || payload?.project;
  assert(project, "Project payload missing project body");
  assert(project.id === expected.projectId, `Expected project id ${expected.projectId}, got ${project.id}`);
  assert(project.title === expected.title, `Expected title ${expected.title}, got ${project.title}`);
  const threadViewState = project?.studioThreadViewState || project?.studio_thread_view_state || {};
  const diffAcknowledged = project?.studioDiffAcknowledged || project?.studio_diff_acknowledged || {};
  const focusedDiffKey = String(threadViewState?.focusedDiffKey || threadViewState?.focused_diff_key || "").trim().toLowerCase();
  const reopenedLineageKeys = Array.isArray(threadViewState?.reopenedLineageKeys || threadViewState?.reopened_lineage_keys)
    ? (threadViewState.reopenedLineageKeys || threadViewState.reopened_lineage_keys).map((value) => String(value || "").trim().toLowerCase()).filter(Boolean)
    : [];
  const latestReopenedWriteID = String(threadViewState?.latestReopenedWriteID || threadViewState?.latest_reopened_write_id || "").trim().toLowerCase();
  const ackEntries = Array.isArray(diffAcknowledged?.entries) ? diffAcknowledged.entries : [];
  const ackEntry = ackEntries[0] || null;
  assert(focusedDiffKey === `thread:${expected.marker}`, `Expected focused diff thread:${expected.marker}, got ${focusedDiffKey}`);
  assert(reopenedLineageKeys.includes(`lineage:${expected.marker}`), `Expected reopened lineage lineage:${expected.marker}, got ${JSON.stringify(reopenedLineageKeys)}`);
  assert(latestReopenedWriteID === `write-${expected.marker}`, `Expected latest reopened write write-${expected.marker}, got ${latestReopenedWriteID}`);
  assert(String(ackEntry?.key || "").trim().toLowerCase() === `lineage:${expected.marker}`, `Expected ack key lineage:${expected.marker}, got ${ackEntry?.key}`);
  assert(
    String(ackEntry?.writeId || ackEntry?.write_id || "").trim().toLowerCase() === `write-${expected.marker}`,
    `Expected ack write id write-${expected.marker}, got ${ackEntry?.writeId || ackEntry?.write_id}`
  );
}

await waitForHealth();

const stamp = Date.now().toString(36);
const projectId = `studio-owner-restore-${stamp}`;
const strayClientToken = `studio-owner-token-${stamp}`;
const user = await signupUser(`studio-owner-${stamp}@example.com`, `OwnerRestore-${stamp}-aA1!`);
const otherUser = await signupUser(`studio-owner-other-${stamp}@example.com`, `OwnerRestoreOther-${stamp}-aA1!`);

await upsertProject(projectId, "Owner Smoke User", authClientHeaders(user), "user");
const tokenOnlyUpsert = await upsertProjectRequest(projectId, "Owner Smoke Token", tokenHeaders(strayClientToken), "token");
assert(
  tokenOnlyUpsert.response.status === 401 && tokenOnlyUpsert.payload?.error === "user_auth_required",
  `Token-only screenplay write should require auth: ${tokenOnlyUpsert.response.status} ${JSON.stringify(tokenOnlyUpsert.payload)}`
);
await upsertProject(projectId, "Owner Smoke User Priority", authClientHeaders(user, { "x-client-token": strayClientToken }), "user-priority");

const userFetch = await fetchProject(projectId, authClientHeaders(user));
assert(userFetch.response.ok, `User owner fetch failed: ${userFetch.response.status} ${JSON.stringify(userFetch.payload)}`);
assertProjectShape(userFetch.payload, {
  projectId,
  title: "Owner Smoke User Priority",
  marker: "user-priority",
});

const otherFetch = await fetchProject(projectId, authClientHeaders(otherUser));
assert(otherFetch.response.status === 404, `Other authenticated user should not read owner project: ${otherFetch.response.status} ${JSON.stringify(otherFetch.payload)}`);

const tokenFetch = await fetchProject(projectId, tokenHeaders(strayClientToken));
assert(
  tokenFetch.response.status === 401 && tokenFetch.payload?.error === "user_auth_required",
  `Token-only screenplay read should require auth: ${tokenFetch.response.status} ${JSON.stringify(tokenFetch.payload)}`
);

console.log("studio-owner-restore-smoke: ok");
