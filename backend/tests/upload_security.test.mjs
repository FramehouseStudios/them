import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { talkUpload } from '../app.js';
import { createUploadErrorHandler } from '../lib/upload_error_handler.js';

test('upload error extraction preserves size response and forwards unrelated failures', () => {
  const handler = createUploadErrorHandler(20);
  const responses = [];
  const forwarded = [];
  const res = { headersSent: false, status(code) { this.code = code; return this; },
    json(body) { responses.push({ status: this.code, body }); } };
  handler({ code: 'LIMIT_FILE_SIZE' }, {}, res, error => forwarded.push(error));
  assert.deepEqual(responses, [{ status: 413,
    body: { stage: 'upload', error: 'File too large. Max is 20MB.' } }]);
  const unrelated = new Error('storage unavailable');
  handler(unrelated, {}, res, error => forwarded.push(error));
  assert.deepEqual(forwarded, [unrelated]);
  res.headersSent = true;
  const late = { code: 'LIMIT_FILE_SIZE' };
  handler(late, {}, res, error => forwarded.push(error));
  assert.deepEqual(forwarded, [unrelated, late]);
  assert.equal(responses.length, 1);
});

test('production upload parser accepts voice metadata and bounds hostile field names', async () => {
  const app = express();
  app.post('/upload', talkUpload, (req, res) => res.json({
    text: req.body.client_transcript, audio: req.files?.audio?.[0]?.size,
  }));
  app.use(createUploadErrorHandler(20));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const send = async form => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/upload`, {
      method: 'POST', body: form, signal: AbortSignal.timeout(2000),
    });
    return { status: res.status, body: await res.json() };
  };
  try {
    const valid = new FormData();
    valid.set('client_transcript', 'Write the opening scene.');
    valid.set('audio', new Blob(['audio fixture'], { type: 'audio/wav' }), 'voice.wav');
    const accepted = await send(valid);
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.text, 'Write the opening scene.');
    assert.equal(accepted.body.audio, 13);
    for (const [field, code] of [
      ['a[101]', 'LIMIT_FIELD_ARRAY_INDEX'],
      ['a[b][c][d][e][f]', 'LIMIT_FIELD_NESTING'],
      ['x'.repeat(129), 'LIMIT_FIELD_KEY'],
    ]) {
      const form = new FormData();
      form.set(field, 'private-value');
      const rejected = await send(form);
      assert.equal(rejected.status, 400);
      assert.equal(rejected.body.code, code);
      assert.equal(JSON.stringify(rejected.body).includes('private-value'), false);
    }
    const healthy = new FormData();
    healthy.set('client_transcript', 'Still writing.');
    assert.equal((await send(healthy)).status, 200);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
