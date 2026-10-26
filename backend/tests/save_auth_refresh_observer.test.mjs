import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';

test('observer requires real rejection, successful refresh and the returned bearer', async () => {
  process.env.NODE_ENV = 'test';
  process.env.HOST = '127.0.0.1';
  process.env.APP_TOKEN = 'observer-fixture';
  process.env.THEM_SAVE_AUTH_REFRESH_PROOF = '1';
  await import('../evals/save_auth_refresh_observer.mjs');
  const { app } = await import('../app.js');
  app.post('/auth/refresh', (_req, res) => res.json({ access_token: 'synthetic-rotated' }));
  app.post('/screenplay/projects/proof/version', (req, res) => {
    res.status(req.headers.authorization === 'Bearer expired' ? 401 : 201).json({ ok: true });
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (path, bearer) => {
    const response = await fetch(base + path, { method: 'POST', headers: {
      'X-APP-TOKEN': 'observer-fixture', Authorization: `Bearer ${bearer}`,
    } });
    await response.text();
    return response.status;
  };
  const read = async () => {
    const response = await fetch(base + '/__test/save-auth-refresh-stats', { headers: { 'X-APP-TOKEN': 'observer-fixture' } });
    assert.equal(response.status, 200);
    return response.json();
  };
  try {
    assert.equal(await post('/auth/refresh', 'original'), 200);
    assert.equal(await post('/screenplay/projects/proof/version', 'synthetic-rotated'), 201);
    assert.deepEqual(await read(), { version401: 0, refresh200: 1, freshBearerVersion201: 0 });
    assert.equal(await post('/screenplay/projects/proof/version', 'expired'), 401);
    assert.equal(await post('/auth/refresh', 'original'), 200);
    await post('/screenplay/projects/proof/version', 'wrong-bearer');
    assert.deepEqual(await read(), { version401: 1, refresh200: 2, freshBearerVersion201: 0 });
    await post('/screenplay/projects/proof/version', 'synthetic-rotated');
    const counts = await read();
    assert.deepEqual(counts, { version401: 1, refresh200: 2, freshBearerVersion201: 1 });
    assert.equal(JSON.stringify(counts).includes('synthetic-rotated'), false);
  } finally {
    const closed = once(server, 'close');
    server.close();
    server.closeAllConnections();
    await closed;
  }
});

test('observer cannot be loaded in production or without the explicit proof flag', () => {
  for (const env of [
    { NODE_ENV: 'production', HOST: '127.0.0.1', THEM_SAVE_AUTH_REFRESH_PROOF: '1' },
    { NODE_ENV: 'test', HOST: '127.0.0.1', THEM_SAVE_AUTH_REFRESH_PROOF: '0' },
  ]) {
    const result = spawnSync(process.execPath, ['--import', new URL('../evals/save_auth_refresh_observer.mjs', import.meta.url).href, '-e', ''], {
      env: { ...process.env, ...env }, encoding: 'utf8', timeout: 10_000,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Explicit loopback auth-refresh proof process required/);
  }
});
