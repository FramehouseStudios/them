// Subprocess-only provider transport. The real handler, auth, wallet, prompt,
// reply shaper, TTS request and project persistence remain production code.
import fs from "node:fs";
const audio = fs.readFileSync(new URL("../../response.mp3", import.meta.url));
const reply = "The setup is strong because John's lie forces the chase. Make John choose before midnight. Who gets the key?";
globalThis.fetch = async (input, init) => {
  const url = String(input?.url || input);
  if (url === "https://api.openai.com/v1/audio/speech") {
    const body = JSON.parse(init?.body || "{}");
    console.log("[mentor-test] tts_causal_advice=" + String(body.input || "").includes("because John's lie forces the chase"));
    return new Response(audio, { headers: { "content-type": "audio/mpeg" } });
  }
  if (["https://api.openai.com/v1/chat/completions", "https://api.openai.com/v1/responses"].includes(url)) {
    const body = JSON.parse(init?.body || "{}");
    console.log("[mentor-test] mentor_contract=" + JSON.stringify(body).includes('<mentor_output>'));
    const required = JSON.stringify('one sentence that contains the word "because"').slice(1, -1);
    console.log("[mentor-test] because_contract=" + JSON.stringify(body).includes(required));
    return Response.json(url.endsWith("/responses")
      ? { output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: reply }] }], usage: { input_tokens: 20, output_tokens: 123 } }
      : { choices: [{ message: { content: reply } }], usage: { completion_tokens: 123 } });
  }
  throw new Error("Unexpected provider request in mentor fixture: " + new URL(url).pathname);
};
