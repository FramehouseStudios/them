import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTalkResponseHeaderBudget, setTalkInlineJSONHeader,
  talkResponseHeaderBytes, TALK_RESPONSE_HEADER_BYTES } from '../lib/talk_response_headers.js';

function response(headers = {}) {
  const fields = {...headers};
  return {getHeaders: () => ({...fields}), getHeader: name => fields[name],
    setHeader: (name, value) => { fields[name] = value; }, removeHeader: name => { delete fields[name]; }};
}

test('small legacy headers remain byte-for-byte unchanged', () => {
  const headers = {'content-type': 'audio/mpeg', 'x-screenplay-output': '%7B%7D',
    'x-reply': 'Kept%20words', 'x-session-id': 'fixture-session'};
  const res = response(headers);
  assert.deepEqual(applyTalkResponseHeaderBudget(res).removed, []);
  assert.deepEqual(res.getHeaders(), headers);
});

test('aggregate encoded screenplay headers defer whole fields to advertised turn metadata', () => {
  const output = encodeURIComponent(JSON.stringify({text: '🌕 café '.repeat(500)}));
  const headers = {'content-type': 'audio/mpeg', 'x-turn-id': 'turn-1', 'x-turn-meta-available': '1',
    'x-screenplay-output-available': '1', 'x-screenplay-authoritative': '1', 'x-screenplay-project-id': 'owned-project',
    'x-screenplay-output': output, 'x-screenplay-cues': output, 'x-dialogue-timeline': output,
    'x-session-id': 'fixture-session', 'x-studio-actions': '%5B%5D', 'cache-control': 'no-store'};
  const res = response(headers), result = applyTalkResponseHeaderBudget(res);
  assert.ok(result.bytes + 512 <= TALK_RESPONSE_HEADER_BYTES);
  assert.equal(res.getHeader('x-screenplay-output'), undefined);
  for (const name of ['x-turn-id', 'x-turn-meta-available', 'x-screenplay-output-available',
    'x-screenplay-authoritative', 'x-screenplay-project-id', 'x-session-id', 'x-studio-actions', 'cache-control']) {
    assert.equal(res.getHeader(name), headers[name]);
  }
});

test('a page without metadata is refused rather than silently truncated or discarded', () => {
  const page = 'a'.repeat(9_000), res = response({'x-screenplay-output': page, 'x-turn-meta-available': '0'});
  assert.throws(() => applyTalkResponseHeaderBudget(res), {code: 'TALK_RESPONSE_HEADERS_TOO_LARGE'});
  assert.equal(res.getHeader('x-screenplay-output'), page);
});

test('optional rich hints may be omitted while essential action and ownership fields remain', () => {
  const res = response({'x-creative-memory-trace': 'x'.repeat(9_000), 'x-canon-clarification': 'x'.repeat(9_000), 'x-studio-actions': 'owned-action',
    'x-screenplay-project-id': 'project-a', 'www-authenticate': 'fixture-challenge'});
  applyTalkResponseHeaderBudget(res);
  assert.equal(res.getHeader('x-creative-memory-trace'), undefined);
  assert.equal(res.getHeader('x-canon-clarification'), undefined);
  assert.equal(res.getHeader('x-studio-actions'), 'owned-action');
  assert.equal(res.getHeader('x-screenplay-project-id'), 'project-a');
  assert.equal(res.getHeader('www-authenticate'), 'fixture-challenge');
});

test('byte accounting includes multi-value headers and legacy JSON limits stay unchanged', () => {
  const fields = {'set-cookie': ['fixture-a', 'fixture-b'], 'x-name': 'café'};
  assert.equal(talkResponseHeaderBytes(fields), Buffer.byteLength('set-cookie: fixture-a\r\nset-cookie: fixture-b\r\nx-name: café\r\n'));
  const res = response();
  setTalkInlineJSONHeader(res, 'x-json', {text: 'kept'}, 100);
  assert.deepEqual(JSON.parse(decodeURIComponent(res.getHeader('x-json'))), {text: 'kept'});
  setTalkInlineJSONHeader(res, 'x-too-large', {text: 'x'.repeat(101)}, 100);
  setTalkInlineJSONHeader(res, 'x-empty', [], 100);
  assert.equal(res.getHeader('x-too-large'), undefined);
  assert.equal(res.getHeader('x-empty'), undefined);
});
