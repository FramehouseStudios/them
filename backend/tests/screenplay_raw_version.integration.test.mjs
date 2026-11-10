import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startBackend, apiRequest } from './helpers/backend_test_server.mjs';

const options = { unsetEnv: ['DATABASE_URL', 'REDIS_URL'], env: { REQUIRE_USER_AUTH: '1' } };

async function createWriter(server) {
  const response = await apiRequest(server, '/auth/signup', { method: 'POST', json: {
    email: `raw-version-${randomUUID()}@example.test`, password: 'Raw-version-fixture-aA1!',
  } });
  assert.equal(response.status, 201);
  return { Authorization: `Bearer ${response.json.access_token || response.json.token}` };
}

async function createProject(server, headers) {
  const response = await apiRequest(server, '/screenplay/projects', {
    method: 'POST', headers, json: { title: 'Exact writer words' },
  });
  assert.equal(response.status, 201);
  return response.json.project_id;
}

const draft = '\r\n \tINT. CAFE - NIGHT\r\n\r\nMARA\r\nA cafe\u0301 waits.\r\n\t  ';
const bytes = value => Buffer.from(value, 'utf8');

test('authenticated raw version bytes survive response, GET, restart and exact replay once', { timeout: 60000 }, async () => {
  let server = await startBackend(options);
  try {
    const headers = await createWriter(server);
    const id = await createProject(server, headers);
    const request = {
      draft,
      title: 'Exact writer words',
      phase: 'scene_draft',
      source: 'studio_manual',
      notes: 'Exact retry metadata',
      studio_write_anchors: [{ write_id: 'raw-write-1', anchor_line: 2, inserted_text: 'A cafe\u0301 waits.' }],
      screenplay_bindings: [{ draft_scene_id: 'raw-scene-1', draft_line: 2, outline_scene_id: 'outline-scene-1' }],
      client_request_id: 'raw-save-once',
      conflict_strategy: 'reject_if_stale',
    };
    const saved = await apiRequest(server, `/screenplay/projects/${id}/version`, { method: 'POST', headers, json: request });
    assert.equal(saved.status, 201);
    const versionID = saved.json.version_id;
    assert.ok(versionID);
    assert.deepEqual(bytes(saved.json.version.draft), bytes(draft), 'acknowledgement must contain the original UTF-8');
    const read = () => apiRequest(server, `/screenplay/projects/${id}?include_drafts=1`, { headers });
    const first = await read();
    assert.equal(first.status, 200);
    assert.deepEqual(bytes(first.json.project.versions[0].draft), bytes(draft));
    const dataDir = server.dataDir;
    assert.equal((await server.stop()).forced, false);
    server = await startBackend({ ...options, dataDir });
    const restored = await read();
    assert.equal(restored.status, 200);
    assert.equal(restored.json.project.active_version_id, versionID);
    assert.deepEqual(bytes(restored.json.project.versions[0].draft), bytes(draft));
    const replay = await apiRequest(server, `/screenplay/projects/${id}/version`, { method: 'POST', headers, json: request });
    assert.equal(replay.status, 200);
    assert.equal(replay.json.status, 'replayed');
    assert.equal(replay.json.replay_proof, 'full_request_hash_v1');
    assert.equal(replay.json.version_id, versionID);
    assert.deepEqual(bytes(replay.json.version.draft), bytes(draft));
    assert.equal((await read()).json.project.versions.length, 1);
    const changedMetadata = await apiRequest(server, `/screenplay/projects/${id}/version`, {
      method: 'POST', headers, json: { ...request, title: 'Different retry title' },
    });
    assert.equal(changedMetadata.status, 409);
    assert.equal(changedMetadata.json.status, 'client_request_id_reused');
  } finally { await server.stop(); }
});

test('a request ID cannot acknowledge different whitespace, line endings or Unicode bytes', { timeout: 60000 }, async () => {
  const server = await startBackend(options);
  try {
    const headers = await createWriter(server);
    const id = await createProject(server, headers);
    const request = { draft, client_request_id: 'byte-identity', conflict_strategy: 'reject_if_stale' };
    const saved = await apiRequest(server, `/screenplay/projects/${id}/version`, { method: 'POST', headers, json: request });
    assert.equal(saved.status, 201);
    for (const changed of [draft.trim(), draft.replaceAll('\r\n', '\n'), draft + ' ', draft.normalize('NFC')]) {
      const replay = await apiRequest(server, `/screenplay/projects/${id}/version`, { method: 'POST', headers, json: { ...request, draft: changed } });
      assert.equal(replay.status, 409, 'different bytes must not receive a successful replay receipt');
      assert.equal(replay.json.status, 'client_request_id_reused');
      assert.equal(replay.json.conflict, true);
      assert.equal(replay.json.replayed, false);
    }
    const read = await apiRequest(server, `/screenplay/projects/${id}?include_drafts=1`, { headers });
    assert.equal(read.status, 200);
    assert.equal(read.json.project.versions.length, 1);
    assert.deepEqual(bytes(read.json.project.versions[0].draft), bytes(draft));
    const otherWriter = await createWriter(server);
    const foreign = await apiRequest(server, `/screenplay/projects/${id}?include_drafts=1`, { headers: otherWriter });
    assert.equal(foreign.status, 404);
    assert.equal(JSON.stringify(foreign.json).includes('A cafe'), false);
    for (const invalidDraft of ['', 42, null, { text: 'words' }]) {
      const invalid = await apiRequest(server, `/screenplay/projects/${id}/version`, {
        method: 'POST', headers, json: { draft: invalidDraft },
      });
      assert.equal(invalid.status, 400);
      assert.equal(invalid.json.error, 'draft_required');
    }
  } finally { await server.stop(); }
});

test('explicit cleared version survives authenticated restart and idempotent replay', { timeout: 60000 }, async () => {
  let server = await startBackend(options);
  try {
    const headers = await createWriter(server);
    const id = await createProject(server, headers);
    const original = await apiRequest(server, `/screenplay/projects/${id}/version`, {
      method: 'POST', headers, json: { draft: 'Original writer words', client_request_id: 'clear-base' },
    });
    assert.equal(original.status, 201);
    const clear = { draft: '', allow_empty_draft: true, base_version_id: original.json.version_id,
      client_request_id: 'clear-once', conflict_strategy: 'reject_if_stale' };
    const saved = await apiRequest(server, `/screenplay/projects/${id}/version`, { method: 'POST', headers, json: clear });
    assert.equal(saved.status, 201);
    assert.equal(saved.json.version.draft, '');
    const versionID = saved.json.version_id;
    const dataDir = server.dataDir;
    assert.equal((await server.stop()).forced, false);
    server = await startBackend({ ...options, dataDir });
    const restored = await apiRequest(server, `/screenplay/projects/${id}?include_drafts=1`, { headers });
    assert.equal(restored.status, 200);
    assert.equal(restored.json.project.active_version_id, versionID);
    assert.equal(restored.json.project.versions[0].draft, '');
    const replay = await apiRequest(server, `/screenplay/projects/${id}/version`, { method: 'POST', headers, json: clear });
    assert.equal(replay.status, 200);
    assert.equal(replay.json.version_id, versionID);
    assert.equal(replay.json.version.draft, '');
    assert.equal((await apiRequest(server, `/screenplay/projects/${id}?include_drafts=1`, { headers })).json.project.versions.length, 2);
    const other = await createWriter(server);
    const foreign = await apiRequest(server, `/screenplay/projects/${id}/version`, { method: 'POST', headers: other, json: clear });
    assert.equal(foreign.status, 404);
  } finally { await server.stop(); }
});
