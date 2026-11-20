import fs from "node:fs";
import { setTimeout } from "node:timers/promises";

const page = process.env.PAGE_TEST_SCREENPLAY;
let synthesisAttempts = 0;

const recoveryAudio = fs.readFileSync(new URL("../../response.mp3", import.meta.url));

globalThis.fetch = async (input, options) => {
  const url = String(input?.url || input);
  if (url === "https://api.openai.com/v1/audio/transcriptions") {
    const name = options.body.get("file").name;
    console.log(`[fixture] transcribed ${name}`);
    if (name === "advice.wav") {
      return Response.json({ text: "How would you write the opening scene?" });
    }
    if (name === "low-confidence.wav") {
      return Response.json({
        text: "Write the opening scene.",
        words: [{ confidence: 0.1 }, { confidence: 0.1 }],
      });
    }
    return Response.json({ text: "Write the opening scene for my screenplay. Mara meets Vale in a diner at night." });
  }
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
    console.log("[fixture] reached generation");
    const reply = options.body.includes("How would you write the opening scene?")
      ? "Let the audience learn what Mara wants through what she does."
      : page;
    const payload = {
      choices: [{ message: { content: reply } }],
      output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: reply }] }],
      usage: { completion_tokens: 123, output_tokens: 123 },
    };
    return Response.json(payload);
  }
  throw new Error("Unexpected outbound request in the page-audio fixture.");
};
