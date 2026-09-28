// Studio stand-in for the model, for local development only.
//
// Two dev switches answer Studio renders instead of OpenAI; config.js blanks
// both when NODE_ENV=production:
//   STUDIO_RENDER_TEST_REPLY  one fixed reply for every request (smoke evals).
//   STUDIO_REPLY_DESK_DIR     a folder where each request waits for a reply:
//     the prompt is written to <dir>/pending/<id>.json and the reply is read
//     from <dir>/replies/<id>.txt, written by whoever is playing Clementine
//     (a developer or an assistant) while the model is unavailable. The reply
//     is streamed back in small chunks so the app sees a real stream.
//
// Nothing here is used in production and nothing is billed.

import nodeFs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_POLL_MS = 250;

function deskTimeoutError(id) {
  const err = new Error(`Reply desk timed out waiting for ${id}.`);
  err.stage = "studio_render";
  err.status = 504;
  return err;
}

function streamChunks(text, size = 24) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}

function createStudioStandIn({
  testReply = "",
  deskDir = "",
  timeoutMs = DEFAULT_TIMEOUT_MS,
  pollMs = DEFAULT_POLL_MS,
  chunkDelayMs = 15,
  fs = nodeFs,
  logger = console,
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const fixed = String(testReply || "").trim();
  const dir = String(deskDir || "").trim();

  async function answerFromDesk({ systemPrompt, transcript }) {
    const id = `${new Date(now()).toISOString().replace(/[:.]/g, "-")}-${randomBytes(3).toString("hex")}`;
    const pendingPath = path.join(dir, "pending", `${id}.json`);
    const replyPath = path.join(dir, "replies", `${id}.txt`);
    fs.mkdirSync(path.dirname(pendingPath), { recursive: true });
    fs.mkdirSync(path.dirname(replyPath), { recursive: true });
    fs.writeFileSync(pendingPath, JSON.stringify({ id, created_at: new Date(now()).toISOString(), system_prompt: systemPrompt, transcript }, null, 2));
    logger?.info?.(`[studio_reply_desk] waiting id=${id}`);
    const deadline = now() + timeoutMs;
    while (now() < deadline) {
      if (fs.existsSync(replyPath)) {
        const reply = fs.readFileSync(replyPath, "utf8").trim();
        fs.rmSync(replyPath, { force: true });
        fs.rmSync(pendingPath, { force: true });
        logger?.info?.(`[studio_reply_desk] answered id=${id} chars=${reply.length}`);
        return reply;
      }
      await sleep(pollMs);
    }
    fs.rmSync(pendingPath, { force: true });
    throw deskTimeoutError(id);
  }

  return {
    enabled: Boolean(fixed || dir),
    /** Returns null when no stand-in is configured, so the caller uses OpenAI. */
    async reply({ systemPrompt = "", transcript = "", onDelta } = {}) {
      if (!fixed && !dir) return null;
      const text = fixed || await answerFromDesk({ systemPrompt, transcript });
      if (typeof onDelta === "function") {
        if (fixed) {
          await onDelta(text, text);
        } else {
          let sent = "";
          for (const chunk of streamChunks(text)) {
            sent += chunk;
            await onDelta(chunk, sent);
            if (chunkDelayMs > 0) await sleep(chunkDelayMs);
          }
        }
      }
      return text;
    },
  };
}

export { createStudioStandIn };
