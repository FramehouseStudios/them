import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { startPromotionDelayProxy } from '../evals/promotion_delay_proxy.mjs';

test('proof barrier holds only create replies and records real version requests', async () => {
  const target = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => res.writeHead(201, { 'Content-Type': 'application/json' }).end('{"project_id":"id","ok":true}'));
  });
  target.listen(0, '127.0.0.1');
  await once(target, 'listening');
  const proxy = await startPromotionDelayProxy(`http://127.0.0.1:${target.address().port}`);
  const base = `http://127.0.0.1:${proxy.port}`;
  try {
    const creation = fetch(base + '/screenplay/projects', { method: 'POST' });
    let state;
    for (let i = 0; i < 100; i += 1) {
      state = await (await fetch(base + '/__them-proof/promotion')).json();
      if (state.pending_creates === 1) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.deepEqual(state, { pending_creates: 1, delivered_creates: 0, version_requests: 0, stale_root_version_requests: 0, held_project_id: 'id' });
    const metadata = await fetch(base + '/screenplay/projects', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: 'id' }) });
    assert.equal(metadata.status, 201, 'Metadata upserts must not be held as new creations.');
    const released = await (await fetch(base + '/__them-proof/promotion/release', { method: 'POST' })).json();
    assert.equal(released.delivered_creates, 1);
    assert.deepEqual(await (await creation).json(), { project_id: 'id', ok: true });
    assert.equal((await fetch(base + '/screenplay/projects/id/version', { method: 'POST' })).status, 201);
    const settled = await (await fetch(base + '/__them-proof/promotion')).json();
    assert.equal(settled.version_requests, 1);
    assert.equal(settled.stale_root_version_requests, 0);
    await fetch(base + '/screenplay/projects/id/version', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'studio_first_turn_auto_create' }) });
    assert.equal((await (await fetch(base + '/__them-proof/promotion')).json()).stale_root_version_requests, 1);
  } finally {
    await proxy.stop();
    const closed = once(target, 'close');
    target.close();
    target.closeAllConnections();
    await closed;
  }
});

test('proof proxy refuses non-loopback targets before opening a listener', async () => {
  await assert.rejects(startPromotionDelayProxy('https://example.com'), /Loopback/);
  await assert.rejects(startPromotionDelayProxy('http://example.com'), /Loopback/);
});

test('proof barrier also holds an atomic initialization replay receipt', async () => {
  const target = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => res.writeHead(200, { 'Content-Type': 'application/json' })
      .end('{"project_id":"stable-id","ok":true,"replayed":true}'));
  });
  target.listen(0, '127.0.0.1');
  await once(target, 'listening');
  const proxy = await startPromotionDelayProxy(`http://127.0.0.1:${target.address().port}`);
  const base = `http://127.0.0.1:${proxy.port}`;
  try {
    const receipt = fetch(base + '/screenplay/projects/initialize', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: 'stable-id', initial_draft: { draft: 'Exact words' } }) });
    let state;
    for (let i = 0; i < 100; i += 1) {
      state = await (await fetch(base + '/__them-proof/promotion')).json();
      if (state.pending_creates === 1) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(state.pending_creates, 1);
    assert.equal(state.held_project_id, 'stable-id');
    assert.equal(state.delivered_creates, 0);
    await fetch(base + '/__them-proof/promotion/release', { method: 'POST' });
    assert.equal((await receipt).status, 200);
    assert.equal((await (await fetch(base + '/__them-proof/promotion')).json()).delivered_creates, 1);
  } finally {
    await proxy.stop();
    const closed = once(target, 'close');
    target.close(); target.closeAllConnections();
    await closed;
  }
});
