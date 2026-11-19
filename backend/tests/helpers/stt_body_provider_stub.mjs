import { readFileSync } from 'node:fs';

const audio = readFileSync(new URL('../../response.mp3', import.meta.url));

// This preload replaces provider transport in the test subprocess. It has no egress.
globalThis.fetch = async (input, { signal } = {}) => {
  const url = String(input?.url || input);
  if (url === 'https://api.openai.com/v1/audio/speech') {
    return new Response(audio, { headers: { 'content-type': 'audio/mpeg' } });
  }
  if (url !== 'https://api.openai.com/v1/audio/transcriptions') {
    throw new Error('Unexpected provider call in transcription deadline fixture');
  }

  // Headers arrive promptly. Without cancellation, malformed JSON arrives late.
  return new Response(new ReadableStream({
    start(controller) {
      const releaseBody = setTimeout(() => {
        signal.removeEventListener('abort', abortBody);
        controller.enqueue(new TextEncoder().encode('{partial'));
        controller.close();
      }, 2_000);
      function abortBody() {
        clearTimeout(releaseBody);
        controller.error(signal.reason);
      }
      if (signal.aborted) abortBody();
      else signal.addEventListener('abort', abortBody, { once: true });
    },
  }), { headers: { 'content-type': 'application/json' } });
};
