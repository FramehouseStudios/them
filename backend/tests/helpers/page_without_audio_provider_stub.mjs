import fs from "node:fs";
import { setTimeout } from "node:timers/promises";

const page = process.env.PAGE_TEST_SCREENPLAY;
let synthesisAttempts = 0;

const recoveryAudio = fs.readFileSync(new URL("../../response.mp3", import.meta.url));

globalThis.fetch = async (input, options) => {
  const url = String(input?.url || input);
  if (url === "https://api.openai.com/v1/audio/speech") {
    if (JSON.parse(options.body).input.startsWith("INT. DINER")) {
      console.log("[fixture] verified page reached synthesis");
      synthesisAttempts += 1;
      if (synthesisAttempts === 3) {
        for (let attempt = 0; attempt < 250; attempt += 1) {
          if (fs.existsSync(process.env.PAGE_TEST_CANCEL_RELEASE_FILE)) break;
          await setTimeout(20);
        }
      }
      throw new TypeError("Fixture speech transport failed.");
    }
    return new Response(recoveryAudio, { headers: { "content-type": "audio/mpeg" } });
  }
  if (url === "https://api.openai.com/v1/chat/completions" || url === "https://api.openai.com/v1/responses") {
    const payload = {
      choices: [{ message: { content: page } }],
      output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: page }] }],
      usage: { completion_tokens: 123, output_tokens: 123 },
    };
    return Response.json(payload);
  }
  throw new Error("Unexpected outbound request in the page-audio fixture.");
};
