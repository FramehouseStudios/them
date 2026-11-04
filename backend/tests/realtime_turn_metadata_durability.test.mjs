import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate as nextTick } from 'node:timers/promises';
import { mountRealtimeTurnCommitRoute } from '../lib/realtime_turn_commit_route.js';

// Exercise the actual mounted handler without opening a listening socket or
// substituting its metadata boundary. Only the canonical memory deps are fixtures.
function fixture(storeTalkTurnMeta) {
  let handler;
  const app = {post: (_path, ...middleware) => { handler = middleware.at(-1); }};
  const context = {authenticatedUserId: 'canonical-writer', memory: {}, requesterIp: '127.0.0.1'};
  const deps = {
    createRequestId: () => 'fixture-request',
    normalizeSnippet: (value, max) => String(value || '').trim().slice(0, max),
    sanitizeStudioTurnMetadata: () => null,
    resolveCanonicalWritableMemoryContext: async () => context,
    sanitizePersistedSessionMemory: value => value || {},
    createTalkMemoryCommitter: () => async value => value,
    createCanonicalMemoryMutationCommitter: () => async mutate => mutate(context.memory),
    normalizeClientIp: value => value,
    clientIp: () => '127.0.0.1',
    directorFlagsFromTranscript: () => ({}),
    getUserMetricState: () => ({}),
    countSessionStartsForDay: () => 0,
    formatLocalDateStamp: () => '2026-10-26',
    updateSessionEmotionMemory: value => value,
    updateSessionAfterReply: value => value,
    recordUserTalkMetrics: () => {},
    maybeRefineActiveThemesWithLLM: async () => {},
    recordCreativeMemoryTriggersForRequest: async () => ({skipped: false}),
    storeTalkTurnMeta,
    buildReadStateMeta: () => ({lastTurnId: 'turn-1', sessionId: 'fixture-session', stateVersion: 'v1'}),
    applyReadStateHeaders: () => {},
    DEEP_TURN_SCORE_THRESHOLD: 0.7,
  };
  mountRealtimeTurnCommitRoute(app, deps);
  const req = {body: {transcript: 'Write my story', reply: 'Your words are kept.'},
    authUser: {id: 'canonical-writer'}, userId: 'untrusted-alias', header: () => ''};
  const headers = {};
  const res = {statusCode: 200, body: undefined,
    setHeader: (name, value) => { headers[name] = value; },
    getHeader: name => headers[name],
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; }};
  return {run: () => handler(req, res), res};
}

test('realtime commit waits for durable metadata before publishing success', async () => {
  let release, started;
  const pending = new Promise(resolve => { release = resolve; });
  const began = new Promise(resolve => { started = resolve; });
  const {run, res} = fixture(async () => { started(); await pending; });
  const task = run();
  await began;
  await nextTick();
  const earlyBody = res.body;
  release();
  await task;
  assert.equal(earlyBody, undefined, '201 committed was published while its metadata was still volatile.');
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.status, 'committed');
});

test('realtime metadata carries canonical ownership instead of becoming a legacy session record', async () => {
  let captured;
  const {run, res} = fixture(async value => { captured = value; });
  await run();
  assert.equal(res.statusCode, 201);
  assert.equal(captured.userId, 'canonical-writer');
  assert.equal(captured.turnId, 'turn-1');
  assert.equal(captured.transcript, 'Write my story');
  assert.equal(captured.reply, 'Your words are kept.');
});

test('failed metadata persistence returns retryable 503 without claiming committed success', async () => {
  const {run, res} = fixture(async () => { throw new Error('fixture-private database failure'); });
  await run();
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, {stage: 'realtime_turn_commit', error: 'turn_metadata_write_failed'});
  assert.equal(JSON.stringify(res.body).includes('fixture-private'), false);
});
