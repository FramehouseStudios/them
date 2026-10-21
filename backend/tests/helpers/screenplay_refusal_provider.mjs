// Transport-only fixture. Production routing/handler/persistence are untouched.
import assert from 'node:assert/strict';
import fs from 'node:fs';
if (process.env.NODE_ENV !== 'test' || process.env.HOST !== '127.0.0.1' || process.env.THEM_REFUSAL_FIXTURE !== '1') {
  throw new Error('Refusal fixture requires an explicit loopback test process');
}
const realFetch = globalThis.fetch;
const words = 'Do not rewrite this scene. Just discuss the ending.';
const reply = 'We can discuss the ending without changing your draft. What does Mara lose if she opens that door?';
const audio = fs.readFileSync(new URL('../../response.mp3', import.meta.url));
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(String(input?.url || input));
  if (['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return realFetch(input, options);
  if (url.hostname !== 'api.openai.com') throw new Error('Unmocked provider in refusal proof');
  if (url.pathname === '/v1/audio/transcriptions') {
    console.log('[refusal-fixture] ASR supplied current words');
    return Response.json({ text: words, language: 'en' });
  }
  if (url.pathname === '/v1/audio/speech') return new Response(audio, { headers: { 'content-type': 'audio/mpeg' } });
  if (['/v1/responses', '/v1/chat/completions'].includes(url.pathname)) {
    const body = JSON.parse(options.body);
    const wire = JSON.stringify(body);
    assert.ok(wire.includes(words), 'original words must reach generation');
    assert.match(wire, /story_discussion/);
    assert.match(wire, /writer refused page changes/i);
    assert.doesNotMatch(wire, /intent: rewrite_scene/);
    console.log('[refusal-fixture] actual generation permission verified');
    return Response.json({
      output_text: reply,
      choices: [{ message: { content: reply }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 20, input_tokens: 10, output_tokens: 20 },
    });
  }
  throw new Error('Unmocked provider route in refusal proof');
};
