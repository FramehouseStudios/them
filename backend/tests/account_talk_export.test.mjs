import test from 'node:test';
import assert from 'node:assert/strict';
import { accountExportPersistenceValue } from '../lib/account_routes.js';

test('accepted-reply export keeps audio and identity without exposing replay credentials', () => {
  const body = {encoding: 'base64', data: Buffer.from('exact audio').toString('base64')};
  const row = {key: 'request', userId: 'writer', status: 'completed', statusCode: 200, body,
    sessionKey: 'fixture-session', headers: {'x-session-id': 'fixture-session', 'authorization': 'fixture-private'},
    futureCredential: 'fixture-private'};
  const result = accountExportPersistenceValue('talk_idempotency', row);
  assert.deepEqual(result, {key: 'request', userId: 'writer', status: 'completed', statusCode: 200, body});
  assert.equal(row.sessionKey, 'fixture-session', 'Export must not destroy private replay state.');
  assert.equal(row.headers['x-session-id'], 'fixture-session');
});

test('turn export keeps full writer text and metadata without session authority', () => {
  const page = 'INT. ROOM - NIGHT\r\nKeep cafe\u0301 exactly. \t\n';
  const row = {turnId: 'turn-1', userId: 'writer', sessionId: 'fixture-session', screenplayOutput: {text: page},
    transcript: 'Spoken words', futureCredential: 'fixture-private'};
  const result = accountExportPersistenceValue('talk_turns', row);
  assert.equal(result.sessionId, undefined);
  assert.equal(result.futureCredential, undefined);
  assert.ok(Buffer.from(result.screenplayOutput.text).equals(Buffer.from(page)));
  assert.equal(result.transcript, 'Spoken words');
});

test('existing non-talk export domains keep their contract', () => {
  const row = {draft: 'Keep my words', revision: 1};
  assert.equal(accountExportPersistenceValue('screenplay', row), row);
});
