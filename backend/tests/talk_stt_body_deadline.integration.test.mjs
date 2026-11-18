import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiRequest, startBackend } from './helpers/backend_test_server.mjs';

test('the real talk route times out when the transcription body stalls after headers', { timeout: 30_000 }, async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'them-stt-body-deadline-'));
  const providerStub = fileURLToPath(new URL('./helpers/stt_body_provider_stub.mjs', import.meta.url));
  let server;
  try {
    server = await startBackend({
      dataDir,
      unsetEnv: ['DATABASE_URL', 'REDIS_URL'],
      env: {
        NODE_OPTIONS: `--import=${providerStub}`,
        REQUIRE_USER_AUTH: '1',
        STT_TIMEOUT_MS: '150',
        TALK_TEST_DEBUG_TRANSCRIPT_ENABLED: '0',
        TALK_TEST_DEBUG_OFFLINE_ENABLED: '0',
        KNOWLEDGE_RAG_EMBEDDINGS_ENABLED: '0',
        KNOWLEDGE_RAG_WARMUP_ON_BOOT: '0',
        TALK_STREAM_AUDIO_ENABLED: '0',
        CLEMENTINE_MUSE_ENABLED: '0',
      },
    });
    const signup = await apiRequest(server, '/auth/signup', {
      method: 'POST', json: { email: 'stt-deadline@example.com', password: 'isolated-test-password-123' },
    });
    assert.equal(signup.status, 201);
    const auth = { Authorization: `Bearer ${signup.json.token || signup.json.access_token}` };
    const session = await apiRequest(server, '/session', { method: 'POST', headers: auth });
    assert.equal(session.status, 201);
    const form = new FormData();
    const audio = await readFile(new URL('../test.wav', import.meta.url));
    form.append('file', new Blob([audio], { type: 'audio/wav' }), 'fixture.wav');
    const result = await apiRequest(server, '/talk', {
      method: 'POST', headers: { ...auth, 'X-Client-Token': session.json.client_token }, body: form,
    });
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('x-turn-status'), 'error_recovered');
    assert.equal(result.headers.get('x-turn-error-stage'), 'stt');
    assert.equal(result.headers.get('x-turn-error-class'), 'provider_timeout');
  } finally {
    await server?.stop();
    await rm(dataDir, { recursive: true, force: true });
  }
});
