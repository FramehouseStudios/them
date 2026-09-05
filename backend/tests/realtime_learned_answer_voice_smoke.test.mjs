import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const BACKEND_DIR = fileURLToPath(new URL("..", import.meta.url));

test("realtime voice learns a planned answer and uses it on the next spoken turn", () => {
  const result = spawnSync(
    process.execPath,
    ["evals/run_realtime_learned_answer_voice_smoke.mjs"],
    {
      cwd: BACKEND_DIR,
      encoding: "utf8",
      timeout: 120_000,
      maxBuffer: 16 * 1024 * 1024,
      // A developer's ambient storage must never receive this fixture's writes.
      env: {
        ...process.env,
        DATABASE_URL: "postgres://ambient:poison@127.0.0.1:1/ambient_database",
        SCALE_POSTGRES_URL: "postgres://ambient:poison@127.0.0.1:1/ambient_scale",
        REDIS_URL: "redis://127.0.0.1:1/0",
        SCALE_REDIS_URL: "redis://127.0.0.1:1/1",
      },
    },
  );
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  assert.equal(result.status, 0, output);
  assert.match(output, /"askedPlannedQuestion":true/);
  assert.match(output, /"answerLearned":true/);
  assert.match(output, /"pendingQuestionCleared":true/);
  assert.match(output, /"groundingRefreshed":true/);
  assert.match(output, /"samePeerConnection":true/);
  assert.match(output, /"nextSpokenReplyUsesLearnedFact":true/);
  assert.match(output, /"repeatedResolvedQuestion":false/);
  assert.match(output, /"transportLosses":0/);
  assert.match(output, /realtime-learned-answer-voice-smoke: ok/);
  assert.doesNotMatch(
    output,
    /accessToken|clientToken|Authorization|Bearer\s|password|@example\.test/i,
  );
});
