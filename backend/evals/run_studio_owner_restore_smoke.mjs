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
  const response = await fetch(url, options);
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

function userHeaders(userId) {
  return jsonHeaders({ "x-user-id": userId });
}

function tokenHeaders(clientToken) {
  return jsonHeaders({ "x-client-token": clientToken });
}

function combinedHeaders(userId, clientToken) {
  return jsonHeaders({ "x-user-id": userId, "x-client-token": clientToken });
}

async function upsertProject(projectId, title, headers, marker) {
  const { response, payload } = await readJson("http://127.0.0.1:3000/screenplay/projects", {
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
const userId = `usr_owner_${stamp}`;
const clientToken = `studio-owner-token-${stamp}`;

await upsertProject(projectId, "Owner Smoke User", userHeaders(userId), "user");
await upsertProject(projectId, "Owner Smoke Token", tokenHeaders(clientToken), "token");
await upsertProject(projectId, "Owner Smoke User Priority", combinedHeaders(userId, clientToken), "user-priority");

const userFetch = await fetchProject(projectId, userHeaders(userId));
assert(userFetch.response.ok, `User owner fetch failed: ${userFetch.response.status} ${JSON.stringify(userFetch.payload)}`);
assertProjectShape(userFetch.payload, {
  projectId,
  title: "Owner Smoke User Priority",
  marker: "user-priority",
});

const tokenFetch = await fetchProject(projectId, tokenHeaders(clientToken));
assert(tokenFetch.response.ok, `Client-token owner fetch failed: ${tokenFetch.response.status} ${JSON.stringify(tokenFetch.payload)}`);
assertProjectShape(tokenFetch.payload, {
  projectId,
  title: "Owner Smoke Token",
  marker: "token",
});

console.log("studio-owner-restore-smoke: ok");
