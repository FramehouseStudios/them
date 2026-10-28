import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { startPromotionDelayProxy } from './promotion_delay_proxy.mjs';

async function fixture(t, options = {}) {
  const requests = [];
  const upstream = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    requests.push({ path: req.url, headers: req.headers, bytes });
    if (req.url === '/fail') return res.writeHead(401).end('denied');
    const payload = bytes.length ? JSON.parse(bytes.toString('utf8')) : {};
    if (payload.reject) return res.writeHead(422).end('quality rejected');
    if (req.url === '/screenplay/projects/initialize') {
      return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ project_id: 'fixture-created' }));
    }
    const body = Buffer.from(`data: {"reply":"café 🌙 ${payload.screenplay_project_id || ''}"}\n\ndata: {"done":true}\n\n  `);
    res.writeHead(200, { 'content-type': 'text/event-stream' }).end(body);
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const proxy = await startPromotionDelayProxy(`http://127.0.0.1:${upstream.address().port}`, options);
  const base = `http://127.0.0.1:${proxy.port}`;
  t.after(async () => {
    await proxy.stop();
    const closed = once(upstream, 'close');
    upstream.close(); upstream.closeAllConnections();
    await closed;
  });
  const send = (project, extra = {}, route = '/realtime/studio_render_stream') => {
    const response = fetch(base + route, { method: 'POST', headers: {
      'content-type': 'application/json', authorization: 'Bearer fixture-only',
      'x-app-token': 'fixture-app', 'x-client-token': 'fixture-session',
    }, body: JSON.stringify({ screenplay_project_id: project, transcript: 'same fixture prompt', ...extra }) });
    response.catch(() => {});
    return response;
  };
  const state = async () => (await fetch(base + '/__them-proof/render')).json();
  const held = async count => {
    const deadline = Date.now() + 3000;
    do {
      const value = await state();
      if (value.renders.filter(item => item.held).length === count) return value;
      await new Promise(resolve => setTimeout(resolve, 10));
    } while (Date.now() < deadline);
    assert.fail('proxy did not hold the requested completed responses');
  };
  const release = id => fetch(base + '/__them-proof/render/release', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }),
  });
  return { base, requests, send, state, held, release };
}

test('render barriers are opt-in and the existing creation barrier remains the default', async t => {
  const f = await fixture(t);
  assert.equal((await f.send('ordinary')).status, 200);
  const creation = fetch(f.base + '/screenplay/projects/initialize', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  });
  creation.catch(() => {});
  const deadline = Date.now() + 3000;
  let state;
  do {
    state = await (await fetch(f.base + '/__them-proof/promotion')).json();
    if (state.pending_creates === 1) break;
    await new Promise(resolve => setTimeout(resolve, 10));
  } while (Date.now() < deadline);
  assert.equal(state.pending_creates, 1);
  assert.equal((await fetch(f.base + '/__them-proof/promotion/release', { method: 'POST' })).status, 200);
  assert.equal((await creation).status, 200);
});

test('independent completed A/B renders retain exact bytes and authenticated forwarding', async t => {
  const f = await fixture(t, { holdCreations: false, holdStudioRenders: true });
  const a = f.send('project-a'), b = f.send('project-b', {}, '/realtime/studio_render');
  const state = await f.held(2);
  const heldA = state.renders.find(item => item.project_id === 'project-a');
  const heldB = state.renders.find(item => item.project_id === 'project-b');
  assert.equal(heldA.status, 200); assert.equal(heldB.status, 200);
  assert.equal((await f.release(heldA.id)).status, 200);
  assert.equal(await (await a).text(), 'data: {"reply":"café 🌙 project-a"}\n\ndata: {"done":true}\n\n  ');
  const afterA = await f.state();
  assert.equal(afterA.renders.find(item => item.id === heldB.id).held, true);
  assert.equal(afterA.renders.find(item => item.id === heldB.id).delivered, false);
  assert.equal((await f.release(heldB.id)).status, 200);
  assert.equal(await (await b).text(), 'data: {"reply":"café 🌙 project-b"}\n\ndata: {"done":true}\n\n  ');
  assert.equal((await f.release(heldA.id)).status, 404, 'release cannot duplicate a delivery');
  for (const request of f.requests) {
    assert.equal(request.headers.authorization, 'Bearer fixture-only');
    assert.equal(request.headers['x-app-token'], 'fixture-app');
    assert.equal(request.headers['x-client-token'], 'fixture-session');
    assert.equal(JSON.parse(request.bytes).transcript, 'same fixture prompt');
  }
  assert.doesNotMatch(JSON.stringify(await f.state()), /fixture-only|fixture-app|fixture-session|same fixture prompt|cafe/);
});

test('same-document resubmissions have independent barriers; rejected output is never held', async t => {
  const f = await fixture(t, { holdCreations: false, holdStudioRenders: true });
  const first = f.send('same');
  await f.held(1);
  const second = f.send('same');
  const state = await f.held(2);
  assert.notEqual(state.renders[0].id, state.renders[1].id);
  await f.release(state.renders[1].id); await second;
  assert.equal((await f.state()).renders[0].held, true);
  await f.release(state.renders[0].id); await first;
  const rejected = await f.send('rejected', { reject: true });
  assert.equal(rejected.status, 422);
  assert.equal(await rejected.text(), 'quality rejected');
  const final = await f.state();
  assert.equal(final.renders[2].held, false);
  assert.equal(final.renders[2].delivered, true);
  assert.equal(final.renders[2].status, 422);
  assert.equal((await fetch(f.base + '/screenplay/projects/initialize', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  })).status, 200, 'render mode must not hold setup/project creation');
});
