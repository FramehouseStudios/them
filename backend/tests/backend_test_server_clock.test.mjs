import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import test from 'node:test';
import { waitForServer } from './helpers/backend_test_server.mjs';

test('backend startup deadline is not shortened by wall-clock jumps', async () => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200).end('ready');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  const originalNow = Date.now;
  let wallTime = originalNow();
  Date.now = () => (wallTime += 30_000);
  try {
    await waitForServer(`http://127.0.0.1:${port}`, 1000);
  } finally {
    Date.now = originalNow;
    await new Promise((resolve) => server.close(resolve));
  }
  assert.ok(true);
});
