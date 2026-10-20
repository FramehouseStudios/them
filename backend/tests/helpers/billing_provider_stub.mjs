// Test subprocess only: intercept provider transport, never the production handler.
import fs from 'node:fs';
const audio = fs.readFileSync(new URL('../../response.mp3', import.meta.url));
const mentorQuotedLine = '"Do not leave. Stay here."';
globalThis.fetch = async (input, init) => {
  const url = String(input?.url || input);
  if (url === 'https://api.openai.com/v1/audio/speech') {
    if (process.env.BILLING_TEST_REPLY === 'mentor') {
      const body = JSON.parse(init?.body || '{}');
      console.log('[mentor-test] tts_causal_advice=' + String(body.input || '').includes("John's lie forces the chase"));
      console.log('[mentor-test] tts_complete_quoted_dialogue=' + String(body.input || '').includes(mentorQuotedLine));
    }
    return new Response(audio, { headers: { 'content-type': 'audio/mpeg' } });
  }
  if (url === 'https://api.openai.com/v1/chat/completions' || url === 'https://api.openai.com/v1/responses') {
    console.log('[billing-test] provider generation requested');
    if (['advice', 'mentor'].includes(process.env.BILLING_TEST_REPLY)) {
      if (process.env.BILLING_TEST_REPLY === 'mentor') {
        const body = JSON.parse(init?.body || '{}');
        console.log('[mentor-test] mentor_contract=' + JSON.stringify(body).includes('<mentor_output>'));
        const required = JSON.stringify('one sentence that contains the word "because"').slice(1, -1);
        console.log('[mentor-test] because_contract=' + JSON.stringify(body).includes(required));
      }
      const content = process.env.BILLING_TEST_REPLY === 'mentor'
        ? `I love this line ${mentorQuotedLine} because John's lie forces the chase. Make John choose before midnight. Who gets the key?`
        : 'Start with what Mara wants in the room. Give her an obstacle that forces a visible choice before the scene ends.';
      return Response.json(url.endsWith('/responses')
        ? { output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: content }] }], usage: { input_tokens: 20, output_tokens: 123 } }
        : { choices: [{ message: { content } }], usage: { completion_tokens: 123 } });
    }
    return new Response(JSON.stringify({
      choices: [{ message: { content: process.env.BILLING_TEST_REPLY === 'prose' ? 'Here are some ideas for your scene.' : '' } }], usage: { completion_tokens: 123 },
    }), { headers: { 'content-type': 'application/json' } });
  }
  throw new Error('Unexpected network request in billing regression: ' + new URL(url).pathname);
};
