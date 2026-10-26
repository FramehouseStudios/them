import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { startBackend, apiRequest } from './helpers/backend_test_server.mjs';

test('[talk-turn-owner] authenticated metadata cannot follow a prior owner client token', { timeout: 60_000 }, async () => {
  const appToken = 'them-owner-boundary-proof'; // deliberately NOT the local them-dev bypass
  const server = await startBackend({ unsetEnv: ['DATABASE_URL', 'REDIS_URL'], env: {
    APP_TOKEN: appToken, REQUIRE_USER_AUTH: '1', CLEMENTINE_PROVIDER: 'openai',
    CLEMENTINE_MUSE_ENABLED: '0', MUSE_ENABLED: '0', LLM_PROVIDER: 'openai',
    TALK_TEST_DEBUG_TRANSCRIPT_ENABLED: '0', TALK_TEST_DEBUG_OFFLINE_ENABLED: '0', TALK_STREAM_AUDIO_ENABLED: '0',
    KNOWLEDGE_RAG_EMBEDDINGS_ENABLED: '0', THEM_HOME_VOICE_PROVIDER_FIXTURE: '1',
    NODE_OPTIONS: `--import=${new URL('../evals/home_voice_provider_fixture.mjs', import.meta.url).href}`,
  } });
  try {
    async function writer() {
      const signup = await apiRequest(server, '/auth/signup', { method: 'POST', json: {
        email: `turn-owner-${randomUUID()}@example.test`, password: 'Local-proof-only-aA1!',
      } });
      assert.equal(signup.status, 201);
      const auth = { Authorization: `Bearer ${signup.json.access_token || signup.json.token}` };
      const session = await apiRequest(server, '/session', { method: 'POST', headers: auth, json: {} });
      assert.equal(session.status, 201);
      return { auth, clientToken: session.json.client_token,
        userID: signup.json.user?.id || signup.json.user?.user_id || signup.json.user?.userId };
    }
    const a = await writer(), b = await writer();
    const form = new FormData();
    form.append('speech_ms', '3000'); form.append('tail_silence_ms', '900');
    form.append('file', new Blob([fs.readFileSync(new URL('../response.mp3', import.meta.url))], { type: 'audio/mpeg' }), 'fixture.mp3');
    const talk = await fetch(server.baseUrl + '/talk', { method: 'POST',
      headers: { ...a.auth, 'X-APP-TOKEN': appToken, 'X-Client-Token': a.clientToken, 'X-Idempotency-Key': randomUUID() }, body: form });
    await talk.arrayBuffer();
    assert.equal(talk.status, 200);
    const turnID = talk.headers.get('x-turn-id');
    assert.ok(turnID);
    const read = headers => apiRequest(server, `/talk/turn/${encodeURIComponent(turnID)}`, { headers: { 'X-APP-TOKEN': appToken, ...headers } });
    const owner = await read({ ...a.auth, 'X-Client-Token': a.clientToken });
    assert.equal(owner.status, 200);
    assert.equal(owner.json.turn_id, turnID);
    assert.ok(a.userID);
    assert.ok(owner.json.reply);
    const other = await read({ ...b.auth, 'X-Client-Token': b.clientToken });
    const priorToken = await read({ ...b.auth, 'X-Client-Token': a.clientToken });
    const claimedOwner = await read({ ...b.auth, 'X-Client-Token': a.clientToken, 'X-User-Id': String(owner.json.user_id) });
    const signedOut = await read({ 'X-User-Id': String(owner.json.user_id), 'X-Client-Token': a.clientToken });
    const sameOwnerWithoutClientToken = await read(a.auth);
    // Collect every actual handler result before asserting: a normalization
    // failure must not hide whether another account can read the response.
    console.log(JSON.stringify({ fixture: 'real local auth/talk/metadata HTTP; providers intercepted',
      owner: owner.status, other: other.status, priorToken: priorToken.status,
      claimedOwner: claimedOwner.status, signedOut: signedOut.status, ownerWithoutClientToken: sameOwnerWithoutClientToken.status,
      canonicalOwner: owner.json.user_id === a.userID }));
    assert.equal(owner.json.user_id, a.userID, 'Turn metadata must carry the canonical auth ID, not repeatedly prefixed ownership keys.');
    assert.equal(other.status, 403);
    assert.equal(priorToken.status, 403, 'A different authenticated writer followed the previous writer client token into their reply.');
    assert.equal(priorToken.json.error, 'forbidden');
    assert.equal(priorToken.json.reply, undefined);
    assert.equal(claimedOwner.status, 403, 'A caller-supplied owner header overrode authenticated identity.');
    assert.equal(claimedOwner.json.error, 'forbidden');
    assert.equal(signedOut.status, 401, 'An unsigned caller read owned turn metadata with a stale token/header.');
    assert.equal(signedOut.json.stage, 'auth_user');
    assert.equal(sameOwnerWithoutClientToken.status, 200);
  } finally { await server.stop(); }
});
