// Test subprocess only: intercept provider transport, never the production handler.
import fs from 'node:fs';
const audio = fs.readFileSync(new URL('../../response.mp3', import.meta.url));
globalThis.fetch = async (input) => {
  const url = String(input?.url || input);
  if (url === 'https://api.openai.com/v1/audio/speech') {
    return new Response(audio, { headers: { 'content-type': 'audio/mpeg' } });
  }
  if (url === 'https://api.openai.com/v1/chat/completions' || url === 'https://api.openai.com/v1/responses') {
    console.log('[billing-test] provider generation requested');
    return new Response(JSON.stringify({
      choices: [{ message: { content: process.env.BILLING_TEST_REPLY === 'prose' ? 'Here are some ideas for your scene.' : '' } }], usage: { completion_tokens: 123 },
    }), { headers: { 'content-type': 'application/json' } });
  }
  throw new Error('Unexpected network request in billing regression: ' + new URL(url).pathname);
};
