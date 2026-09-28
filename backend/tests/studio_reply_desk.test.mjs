import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";

import { createStudioStandIn } from "../lib/studio_reply_desk.js";

const quiet = { info() {}, warn() {} };

test("[reply_desk] with nothing configured the stand-in is disabled and returns null", async () => {
  const standIn = createStudioStandIn({ logger: quiet });
  assert.equal(standIn.enabled, false);
  assert.equal(await standIn.reply({ transcript: "write a page" }), null);
});

test("[reply_desk] a fixed test reply keeps its old single-delta behaviour", async () => {
  const deltas = [];
  const standIn = createStudioStandIn({ testReply: "INT. ROOM - DAY", logger: quiet });
  const reply = await standIn.reply({ transcript: "x", onDelta: (d, full) => deltas.push([d, full]) });
  assert.equal(reply, "INT. ROOM - DAY");
  assert.deepEqual(deltas, [["INT. ROOM - DAY", "INT. ROOM - DAY"]]);
});

test("[reply_desk] a request waits for the reply file, streams it in chunks, and cleans up", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reply-desk-"));
  const standIn = createStudioStandIn({ deskDir: dir, pollMs: 10, chunkDelayMs: 0, logger: quiet });
  const deltas = [];
  const pending = standIn.reply({ systemPrompt: "You are Clementine.", transcript: "Write the next page.", onDelta: (d, full) => deltas.push(full) });
  let request;
  for (let i = 0; i < 100 && !request; i += 1) {
    await new Promise((r) => setTimeout(r, 10));
    const files = fs.existsSync(path.join(dir, "pending")) ? fs.readdirSync(path.join(dir, "pending")) : [];
    if (files.length) request = JSON.parse(fs.readFileSync(path.join(dir, "pending", files[0]), "utf8"));
  }
  assert.equal(request.transcript, "Write the next page.");
  assert.equal(request.system_prompt, "You are Clementine.");
  const page = "EXT. HIGHWAY - DUSK\n\nThe truck idles.\n\nMAE\nFine. Drive.";
  fs.writeFileSync(path.join(dir, "replies", `${request.id}.txt`), `${page}\n`);
  assert.equal(await pending, page);
  assert.ok(deltas.length > 1, "streamed in more than one chunk");
  assert.equal(deltas.at(-1), page);
  assert.deepEqual(fs.readdirSync(path.join(dir, "pending")), []);
  assert.deepEqual(fs.readdirSync(path.join(dir, "replies")), []);
});

test("[reply_desk] an unanswered request times out as a studio_render 504 and leaves nothing behind", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reply-desk-"));
  const standIn = createStudioStandIn({ deskDir: dir, timeoutMs: 40, pollMs: 10, logger: quiet });
  await assert.rejects(standIn.reply({ transcript: "x" }), (err) => err.stage === "studio_render" && err.status === 504);
  assert.deepEqual(fs.readdirSync(path.join(dir, "pending")), []);
});

test("[reply_desk] production ignores both dev switches", () => {
  const out = execFileSync(process.execPath, ["--input-type=module", "-e",
    "const c = await import('./config.js'); console.log(JSON.stringify([c.STUDIO_RENDER_TEST_REPLY, c.STUDIO_REPLY_DESK_DIR]));"], {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: { ...process.env, NODE_ENV: "production", STUDIO_RENDER_TEST_REPLY: "fixed", STUDIO_REPLY_DESK_DIR: "/tmp/desk" },
  }).toString().trim().split("\n").at(-1);
  assert.deepEqual(JSON.parse(out), ["", ""]);
});
