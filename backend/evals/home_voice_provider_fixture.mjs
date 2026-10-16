import fs from 'node:fs';
// Generated silence: 672 bytes, measured 0.168 s (24 kHz mono MP3).
// Never repeat the 7.704 s response.mp3 fixture for every synthesized phrase.
const silentAudio = Buffer.from('//NExAAAAANIAAAAAExBTUU0LjBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTQu//NExFMAAANIAAAAADBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTQu//NExKYAAANIAAAAADBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTQu//NExKwAAANIAAAAADBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTQu//NExKwAAANIAAAAADBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NExKwAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NExKwAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV', 'base64');
if (process.env.NODE_ENV !== 'test' || process.env.HOST !== '127.0.0.1' || process.env.THEM_HOME_VOICE_PROVIDER_FIXTURE !== '1') {
  throw new Error('Home voice provider fixture is restricted to an explicit loopback test process');
}
const fetchReal = globalThis.fetch;
const ttsAudio = process.env.THEM_HOME_VOICE_LONG_AUDIO === '1'
  ? fs.readFileSync(new URL('../response.mp3', import.meta.url))
  : silentAudio;
const story = 'Write a story about two astronauts who discover the observatory sky is a painted set. Put HOME VOICE HANDOFF on the panel.';
const draft = `INT. OBSERVATORY - NIGHT

Mara hooks her tether to the telescope. Its stars do not move when Eli
turns the focus wheel. A brass panel reads HOME VOICE HANDOFF.

MARA
That constellation was behind us an hour ago.

Eli pulls the wheel harder. A seam opens through Orion. Beyond it, a
paintbrush hangs from a nail in ordinary plywood.

ELI
Tell me that's a repair hatch.

Mara pushes her glove through the seam. Blue paint stains the thumb.
She holds it between them instead of answering.

MARA
Who has been answering Houston?

A red light blinks above the hatch. Eli covers it with his palm, then
looks at the camera they have mistaken for a smoke detector.

ELI
Don't say another word until we find the microphone.

MARA
Answer one question before we open it. Is my daughter real?

Eli offers his radio. Mara leaves it in his hand and unlocks the hatch.
She steps through first, tearing the only return tether behind her.

Mara snaps her tether loose. The painted stars shiver as she pulls the
wall toward her. Someone on the other side pulls back.
`;
export { draft, story };
globalThis.fetch = async (input, options = {}) => {
  const u = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) return fetchReal(input, options);
  if (u.hostname === 'api.openai.com') {
    const request = typeof options.body === 'string' ? JSON.parse(options.body) : {};
    if (u.pathname === '/v1/audio/transcriptions') {
      process.stdout.write('[proof-provider] mocked_stt\n');
      return Response.json({ text: story, language: 'en' });
    }
    if (u.pathname === '/v1/responses') {
      process.stdout.write('[proof-provider] mocked_chat\n');
      if (request.stream) return new Response(`data: ${JSON.stringify({type:'response.output_text.delta',delta:draft})}\n\ndata: ${JSON.stringify({type:'response.completed',response:{usage:{input_tokens:20,output_tokens:80}}})}\n\n`,{headers:{'content-type':'text/event-stream'}});
      return Response.json({ id: 'fixture-response', status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: draft }] }], usage: { input_tokens: 20, output_tokens: 80 } });
    }
    if (u.pathname === '/v1/chat/completions') {
      process.stdout.write('[proof-provider] mocked_chat\n');
      if (request.stream) return new Response(`data: ${JSON.stringify({choices:[{delta:{content:draft}}]})}\n\ndata: [DONE]\n\n`,{headers:{'content-type':'text/event-stream'}});
      return Response.json({ choices: [{ message: { content: draft }, finish_reason: 'stop' }], usage: { prompt_tokens: 20, completion_tokens: 80 } });
    }
    if (u.pathname === '/v1/audio/speech') {
      process.stdout.write('[proof-provider] mocked_tts\n');
      return new Response(ttsAudio, { headers: { 'content-type': 'audio/mpeg' } });
    }
  }
  throw new Error(`External network blocked by deterministic proof fixture: ${u.hostname}${u.pathname}`);
};
