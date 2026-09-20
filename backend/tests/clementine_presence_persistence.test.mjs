import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startBackend, apiRequest } from './helpers/backend_test_server.mjs';
import { createJsonPersistence } from '../lib/persistence_json.js';

test('real project reload and rename preserve legacy presence history', { timeout: 30000 }, async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'them-presence-restore-'));
  const persistence = createJsonPersistence({ jsonRoot: path.join(dataDir, 'persistence') });
  let server = await startBackend({ dataDir });
  try {
    const signup = await apiRequest(server, '/auth/signup', {
      method: 'POST', json: { email: 'presence@example.com', password: 'presence-test-password-123' },
    });
    assert.equal(signup.status, 201);
    const headers = { Authorization: `Bearer ${signup.json.token || signup.json.access_token}` };
    const created = await apiRequest(server, '/screenplay/projects', {
      method: 'POST', headers, json: { title: 'Presence restore' },
    });
    assert.equal(created.status, 201);
    const projectId = created.json.project_id || created.json.project?.id;
    assert.ok(projectId);
    await server.stop();
    const owners = await persistence.list({ domain: 'screenplay' });
    const row = owners.find(row => row.value.projects?.some(project => project.id === projectId));
    assert.ok(row, 'must seed the actual authenticated owner record');
    const legacy = { state: 'listening', history: ['idle', 'listening'], updatedAt: 42 };
    row.value.projects.find(project => project.id === projectId).samanthaPresence = legacy;
    await persistence.put({ domain: 'screenplay', key: row.key, value: row.value });
    server = await startBackend({ dataDir });
    const other = await apiRequest(server, '/auth/signup', {
      method: 'POST', json: { email: 'other-presence@example.com', password: 'other-presence-password-123' },
    });
    assert.equal(other.status, 201);
    const otherHeaders = { Authorization: `Bearer ${other.json.token || other.json.access_token}` };
    const denied = await apiRequest(server, `/screenplay/projects/${projectId}`, { headers: otherHeaders });
    assert.equal(denied.status, 404, 'another account must not read the migrated project');
    const otherWrite = await apiRequest(server, '/screenplay/projects', {
      method: 'POST', headers: otherHeaders,
      json: { project_id: projectId, title: 'Unauthorized replacement' },
    });
    // Existing API permits caller-selected IDs in each owner's namespace.
    assert.equal(otherWrite.status, 201, 'same ID creates a separate owner-scoped project');
    const ownerView = await apiRequest(server, `/screenplay/projects/${projectId}`, { headers });
    assert.equal(ownerView.status, 200);
    assert.equal(ownerView.json.project.title, 'Presence restore');
    const anonymous = await apiRequest(server, `/screenplay/projects/${projectId}`);
    assert.equal(anonymous.status, 401);
    const renamed = await apiRequest(server, '/screenplay/projects', {
      method: 'POST', headers, json: { project_id: projectId, title: 'Presence restored' },
    });
    assert.equal(renamed.status, 200);
    await server.stop();
    const saved = await persistence.get({ domain: 'screenplay', key: row.key });
    const project = saved.projects.find(project => project.id === projectId);
    assert.equal(project.title, 'Presence restored');
    assert.deepEqual(project.clementinePresence, legacy);
    assert.deepEqual(project.samanthaPresence, legacy);
    const otherRow = (await persistence.list({ domain: 'screenplay' }))
      .find(candidate => candidate.key !== row.key && candidate.value.projects?.some(p => p.id === projectId));
    assert.ok(otherRow, 'same-ID project must be stored under a different owner');
    const otherProject = otherRow.value.projects.find(p => p.id === projectId);
    assert.equal(otherProject.title, 'Unauthorized replacement');
    assert.equal(otherProject.clementinePresence, undefined);
    assert.equal(otherProject.samanthaPresence, undefined);
    // Simulate a legacy writer updating only its known key, then re-upgrade.
    project.samanthaPresence = { ...legacy, state: 'speaking', history: [...legacy.history, 'speaking'] };
    await persistence.put({ domain: 'screenplay', key: row.key, value: saved });
    server = await startBackend({ dataDir });
    const afterLegacyWrite = await apiRequest(server, '/screenplay/projects', {
      method: 'POST', headers, json: { project_id: projectId, title: 'Presence re-upgraded' },
    });
    assert.equal(afterLegacyWrite.status, 200);
    await server.stop();
    const restoredOwner = await persistence.get({ domain: 'screenplay', key: row.key });
    const restored = restoredOwner.projects.find(project => project.id === projectId);
    assert.deepEqual(restored.clementinePresence, project.samanthaPresence);
    assert.deepEqual(restored.samanthaPresence, restored.clementinePresence);
  } finally {
    await server.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
