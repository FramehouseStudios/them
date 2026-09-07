import assert from "node:assert/strict";
import { describe, it } from "node:test";

// B: realtime turn_commit isolation — concurrent commits must serialize (one wins, one 409 or both eventually committed but not racy corrupt)
// This is a logic-level isolation test: we assert the route's session lock contract.
// We test the talk_state lock directly, since full HTTP concurrency would need spawn.

import { createTalkSessionSerialGuard } from "../lib/talk_state.js";

describe("realtime turn_commit isolation (B, --test-concurrency=1 guard)", () => {
  it("session serial guard rejects second concurrent turn with 409", async () => {
    const fakeScale = {
      acquireSessionLock: async () => ({ ok: true }),
      releaseSessionLock: async () => {},
    };
    let metrics = [];
    const guard = createTalkSessionSerialGuard({
      isSpeculativePrepareRequest: () => false,
      talkSessionSerialEnabled: true,
      resolveTalkSessionKey: () => "sess-1",
      scaleBackplane: fakeScale,
      recordTalkMetric: (m) => metrics.push(m),
      createRequestId: () => "req-1",
      sttTimeoutMs: 1000, chatTimeoutMs: 1000, ttsTimeoutMs: 1000,
    });
    const req1 = { requestId: "r1" };
    const req2 = { requestId: "r2" };
    let next1Called = false;
    let next2Status = null;
    const res1 = { on: () => {}, setHeader: () => {}, status: (c) => ({ json: () => { next2Status = c; } }) };
    const res2 = { on: () => {}, setHeader: () => {}, status: (c) => ({ json: (o) => { next2Status = c; return o; } }) };
    // first acquires
    await guard(req1, res1, () => { next1Called = true; });
    assert.equal(next1Called, true);
    // second while first still in-flight should 409
    await guard(req2, res2, () => {});
    assert.equal(next2Status, 409);
    assert.ok(metrics.some(m => m.talkStatus === "session_busy"));
  });
});
