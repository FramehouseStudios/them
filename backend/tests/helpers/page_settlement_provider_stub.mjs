// Subprocess provider transport only. The app/router/quality/persistence remain real.
import fs from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';

const directory = process.env.PAGE_SETTLEMENT_TEST_BARRIER;
if (!directory || !path.basename(directory).startsWith('them-page-handler-')) {
  throw new Error('A dedicated synthetic barrier directory is required');
}
async function barrier(stage) {
  if (process.env.PAGE_SETTLEMENT_TEST_STAGE !== stage) return;
  await fs.writeFile(path.join(directory, 'entered'), stage);
  await new Promise((resolve, reject) => {
    const watcher = watch(directory, check);
    const timer = setTimeout(() => { watcher.close(); reject(new Error('Synthetic provider barrier timed out')); }, 10000);
    async function check() {
      try {
        await fs.access(path.join(directory, 'resume'));
        clearTimeout(timer); watcher.close(); resolve();
      } catch { /* wait for this test's explicit release */ }
    }
    void check();
  });
}
// Reuse the accepted playable-page sample from screenplay_page_quality.test.mjs.
const draft = 'INT. MOTEL ROOM - NIGHT\n\nJune folds the receipt into a white square.\n\nMARCUS\nYou kept it.';
const audio = await fs.readFile(new URL('../../response.mp3', import.meta.url));
globalThis.fetch = async input => {
  const url = String(input?.url || input);
  if (url === 'https://api.openai.com/v1/audio/speech') {
    await barrier('tts');
    return new Response(audio, { headers: { 'content-type': 'audio/mpeg' } });
  }
  if (url === 'https://api.openai.com/v1/chat/completions' || url === 'https://api.openai.com/v1/responses') {
    await barrier('generation');
    return new Response(JSON.stringify({ choices: [{ message: { content: draft } }],
      usage: { completion_tokens: 123 } }), { headers: { 'content-type': 'application/json' } });
  }
  throw new Error('Unexpected provider request in settlement proof: ' + new URL(url).pathname);
};
