import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { listenEphemeral, getEphemeralJSON } from './helpers/ephemeral_server.mjs';

async function withServer(handler, run) {
  const server = listenEphemeral(handler);
  await once(server, 'listening');
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('one-shot fixture JSON reads use distinct non-pooled sockets', async () => {
  const sockets = new Set();
  await withServer((req, res) => {
    sockets.add(req.socket);
    assert.equal(req.headers.connection, 'close');
    res.end(JSON.stringify({ count: sockets.size }));
  }, async base => {
    for (let i = 1; i <= 4; i++) {
      assert.deepEqual(await getEphemeralJSON(base), { status: 200, body: { count: i } });
    }
  });
});

test('fixture JSON read preserves authentication/error status and body', async () => {
  await withServer((_req, res) => {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: 'user_auth_required' }));
  }, async base => {
    assert.deepEqual(await getEphemeralJSON(base), { status: 401, body: { error: 'user_auth_required' } });
  });
});

test('invalid fixture JSON retains null-body contract', async () => {
  await withServer((_req, res) => res.end('not JSON'), async base => {
    assert.deepEqual(await getEphemeralJSON(base), { status: 200, body: null });
  });
});

test('an interrupted response is a failure, not an empty successful read', async () => {
  let calls = 0;
  await withServer((_req, res) => { calls++; res.destroy(); }, async base => {
    await assert.rejects(getEphemeralJSON(base));
    assert.equal(calls, 1, 'no automatic retry');
  });
});

test('a stalled fixture has a total request deadline and no automatic retry', async () => {
  let calls = 0;
  await withServer(() => { calls++; }, async base => {
    await assert.rejects(getEphemeralJSON(base, { timeoutMs: 100 }), { name: 'AbortError' });
    assert.equal(calls, 1);
  });
});
