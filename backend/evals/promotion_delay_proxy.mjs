import http from 'node:http';
import { once } from 'node:events';

// Proof-only loopback transport barrier. Never imported by production code.
// Forward real auth/project/version requests; hold successful create replies
// by default. Opt-in render barriers delay complete successful responses by
// request ordinal, including two same-project submissions independently.
// These prove late delivery, not progressive-prefix custody or live AI quality.
export async function startPromotionDelayProxy(targetURL, { holdCreations = true, holdStudioRenders = false, holdAfterFirstStudioDelta = false } = {}) {
  if (holdAfterFirstStudioDelta && !holdStudioRenders) throw new Error('Partial render barrier requires render barriers');
  const target = new URL(targetURL);
  if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1') throw new Error('Loopback proof target required');
  let released = false;
  let delivered = 0;
  let versionRequests = 0;
  let staleRootVersionRequests = 0;
  let heldProjectID = '';
  const pending = new Set();
  const renders = [];
  const renderDeliveries = new Map();
  const upstreams = new Set();
  const state = () => ({ pending_creates: pending.size, delivered_creates: delivered, version_requests: versionRequests,
    stale_root_version_requests: staleRootVersionRequests, held_project_id: heldProjectID });
  const server = http.createServer((req, res) => {
    const pathname = (req.url || '/').split('?')[0];
    if (holdStudioRenders && pathname === '/__them-proof/render' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ renders, version_requests: versionRequests }));
      return;
    }
    if (holdStudioRenders && pathname === '/__them-proof/render/release' && req.method === 'POST') {
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        let id;
        try { id = JSON.parse(Buffer.concat(chunks).toString('utf8')).id; } catch {}
        const deliver = renderDeliveries.get(id);
        if (!deliver) { res.writeHead(404).end(); return; }
        deliver();
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ released_id: id }));
      });
      return;
    }
    if (pathname === '/__them-proof/promotion' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(state()));
      return;
    }
    if (pathname === '/__them-proof/promotion/release' && req.method === 'POST') {
      released = true;
      for (const deliver of [...pending]) deliver();
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(state()));
      return;
    }
    if (req.method === 'POST' && /^\/screenplay\/projects\/[^/]+\/version$/.test(pathname)) versionRequests += 1;
    const requestChunks = [];
    const isRender = holdStudioRenders && req.method === 'POST'
      && ['/realtime/studio_render', '/realtime/studio_render_stream'].includes(pathname);
    const render = isRender ? { id: renders.length + 1, project_id: '', route: pathname,
      status: null, held: false, delivered: false, closed: false, character_voice_memory_count: null } : null;
    if (render) renders.push(render);
    req.on('data', chunk => requestChunks.push(chunk));
    req.on('end', () => {
      let payload;
      try { payload = JSON.parse(Buffer.concat(requestChunks).toString('utf8')); } catch { return; }
      if (render) {
        render.project_id = typeof payload.screenplay_project_id === 'string' ? payload.screenplay_project_id : '';
        const voices = payload.screenplay_character_voice_memories ?? payload.screenplayCharacterVoiceMemories;
        // Counts only: never expose character names, traits or request content.
        render.character_voice_memory_count = voices == null ? 0 : Array.isArray(voices) ? voices.length : -1;
      }
      if (req.method === 'POST' && pathname === `/screenplay/projects/${heldProjectID}/version`
          && payload.source === 'studio_first_turn_auto_create') staleRootVersionRequests += 1;
    });
    const upstream = http.request({ hostname: target.hostname, port: target.port,
      path: req.url, method: req.method, headers: { ...req.headers, host: target.host, connection: 'close', 'accept-encoding': 'identity' },
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const body = Buffer.concat(chunks);
        let requestPayload = {}, responsePayload = {};
        try { requestPayload = JSON.parse(Buffer.concat(requestChunks).toString('utf8')); } catch {}
        try { responsePayload = JSON.parse(body.toString('utf8')); } catch {}
        const isCreation = req.method === 'POST' && response.statusCode >= 200 && response.statusCode < 300
          && (pathname === '/screenplay/projects/initialize'
              || (pathname === '/screenplay/projects' && (!requestPayload.project_id || requestPayload.initial_draft)));
        if (isCreation && !heldProjectID) heldProjectID = responsePayload.project_id || responsePayload.project?.id || '';
        if (render) render.status = response.statusCode;
        let partialSent = false;
        let remainingBody = body;
        if (render && response.statusCode === 200 && holdAfterFirstStudioDelta && pathname === '/realtime/studio_render_stream') {
          // Only release a complete actual delta event; never invent provider output.
          let offset = 0, boundary = -1;
          while (offset < body.length) {
            const end = body.indexOf('\n\n', offset);
            if (end < 0) break;
            const event = body.subarray(offset, end).toString('utf8');
            if (/^event: delta$/m.test(event)) {
              const line = event.split('\n').find(value => value.startsWith('data: '));
              let delta = '';
              try { delta = JSON.parse(line.slice(6)).delta || ''; } catch {}
              // This opt-in harness is used only with the synthetic fixture.
              // Expose length and a fixture marker, never screenplay contents.
              render.first_delta_characters = delta.length;
              render.first_delta_has_fixture_marker = delta.includes('HOME VOICE HANDOFF');
              boundary = end + 2; break;
            }
            offset = end + 2;
          }
          if (boundary < 0 || boundary === body.length) {
            render.status = 502;
            res.writeHead(502).end('Proof stream had no delta followed by remaining events');
            return;
          }
          const headers = { ...response.headers };
          delete headers['content-length'];
          res.writeHead(response.statusCode, headers);
          res.write(body.subarray(0, boundary));
          remainingBody = body.subarray(boundary);
          partialSent = true;
          render.partial_sent = true;
        }
        const deliver = () => {
          pending.delete(deliver);
          if (render) { renderDeliveries.delete(render.id); render.held = false; }
          if (res.destroyed || res.writableEnded) return;
          if (isCreation) delivered += 1;
          if (render) render.delivered = true;
          if (!partialSent) res.writeHead(response.statusCode, response.headers);
          res.end(remainingBody);
        };
        if (render && response.statusCode === 200) {
          render.held = true;
          renderDeliveries.set(render.id, deliver);
          res.on('close', () => {
            if (!render.delivered) render.closed = true;
            render.held = false;
            renderDeliveries.delete(render.id);
          });
        } else if (holdCreations && isCreation && !released) {
          pending.add(deliver);
          res.on('close', () => pending.delete(deliver));
        } else deliver();
      });
    });
    upstreams.add(upstream);
    upstream.on('close', () => upstreams.delete(upstream));
    upstream.on('error', () => {
      if (!res.destroyed && !res.writableEnded) res.writeHead(502).end();
    });
    req.pipe(upstream);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    port: server.address().port,
    async stop() {
      for (const request of upstreams) request.destroy();
      pending.clear();
      renderDeliveries.clear();
      const closed = once(server, 'close');
      server.close();
      server.closeAllConnections();
      await closed;
    },
  };
}
