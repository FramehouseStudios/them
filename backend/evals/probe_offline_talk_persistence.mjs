// Explicit local diagnostic: actual auth/talk/storage, intercepted providers.
// Never run against production or load a private .env; use a public snapshot.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { startBackend, apiRequest } from '../tests/helpers/backend_test_server.mjs';

const env = {
  APP_TOKEN: 'them-dev', REQUIRE_USER_AUTH: '1', CLEMENTINE_PROVIDER: 'openai',
  CLEMENTINE_MUSE_ENABLED: '0', MUSE_ENABLED: '0', LLM_PROVIDER: 'openai',
  TALK_TEST_DEBUG_TRANSCRIPT_ENABLED: '0', TALK_TEST_DEBUG_OFFLINE_ENABLED: '0', TALK_STREAM_AUDIO_ENABLED: '0',
  KNOWLEDGE_RAG_EMBEDDINGS_ENABLED: '0', THEM_HOME_VOICE_PROVIDER_FIXTURE: '1',
  NODE_OPTIONS: `--import=${new URL('./home_voice_provider_fixture.mjs', import.meta.url).href}`,
};
const results = [];
for (const bound of [false, true]) {
  let server = await startBackend({ unsetEnv: ['DATABASE_URL', 'REDIS_URL'], env });
  try {
    const signup = await apiRequest(server, '/auth/signup', { method: 'POST', json: {
      email: `offline-probe-${randomUUID()}@example.test`, password: 'Local-proof-only-aA1!',
    } });
    assert.equal(signup.status, 201);
    const auth = { Authorization: `Bearer ${signup.json.access_token || signup.json.token}` };
    const session = await apiRequest(server, '/session', { method: 'POST', headers: auth, json: {} });
    assert.equal(session.status, 201);
    const headers = { ...auth, 'X-APP-TOKEN': 'them-dev', 'X-Client-Token': session.json.client_token };
    let projectID = '';
    if (bound) {
      const created = await apiRequest(server, '/screenplay/projects', { method: 'POST', headers, json: { title: 'Offline probe' } });
      projectID = created.json.project_id || created.json.project.id;
      const seeded = await apiRequest(server, `/screenplay/projects/${projectID}/version`, {
        method: 'POST', headers, json: { draft: 'INT. ROOM - NIGHT\n\nOriginal words.' },
      });
      assert.equal(seeded.status, 201);
    }
    const list = () => apiRequest(server, '/screenplay/projects?include_versions=1&include_drafts=1', { headers });
    const before = await list();
    const form = new FormData();
    form.append('is_screenplay_mode', '1'); form.append('screenplay_target', 'page');
    form.append('screenplay_prompt_source', 'voice');
    form.append('screenplay_write_id', randomUUID());
    form.append('speech_ms', '3000'); form.append('tail_silence_ms', '900');
    if (projectID) form.append('screenplay_project_id', projectID);
    form.append('file', new Blob([fs.readFileSync(new URL('../response.mp3', import.meta.url))], { type: 'audio/mpeg' }), 'fixture.mp3');
    const response = await fetch(server.baseUrl + '/talk', { method: 'POST',
      headers: { ...headers, 'X-Idempotency-Key': randomUUID() }, body: form });
    const body = new Uint8Array(await response.arrayBuffer());
    assert.equal(response.status, 200);
    const turnID = response.headers.get('x-turn-id');
    const after = await list();
    const project = projectID ? await apiRequest(server, `/screenplay/projects/${projectID}?include_drafts=1`, { headers }) : null;
    const meta = turnID ? await apiRequest(server, `/talk/turn/${turnID}`, { headers }) : null;
    const row = { bound, talkStatus: response.status, responseBytes: body.length,
      turnStatus: response.headers.get('x-turn-status'),
      authoritative: response.headers.get('x-screenplay-authoritative') === '1',
      projectCountBefore: before.json.screenplay_projects.length, projectCountAfter: after.json.screenplay_projects.length,
      projectVersionCountAfter: project?.json.project?.versions?.length ?? 0,
      turnMetaStatus: meta?.status ?? null, turnMetaHasPage: Boolean(meta?.json.screenplay_output?.text) };
    row.mockedProviderCalls = Object.fromEntries(['stt', 'chat', 'tts'].map(name => [name, server.stdout.join('').split('mocked_' + name).length - 1]));
    const dataDir = server.dataDir;
    await server.stop();
    server = await startBackend({ dataDir, unsetEnv: ['DATABASE_URL', 'REDIS_URL'], env });
    row.turnMetaStatusAfterRestart = turnID ? (await apiRequest(server, `/talk/turn/${turnID}`, { headers: auth })).status : null;
    results.push(row);
  } finally { await server.stop(); }
}
console.log(JSON.stringify({ providerMode: 'intercepted; no paid calls', results }));
