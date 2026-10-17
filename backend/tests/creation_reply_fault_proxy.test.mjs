import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { startCreationReplyFaultProxy } from "../evals/creation_reply_fault_proxy.mjs";

test("creation proof drops the committed response, then explicitly releases retry", async () => {
  let creations = 0, versions = 0;
  const upstream = http.createServer((req, res) => {
    req.resume();
    if (req.method === "PUT") creations += 1;
    if (req.method === "POST") versions += 1;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise(resolve => upstream.listen(0, "127.0.0.1", resolve));
  const proxy = await startCreationReplyFaultProxy(`http://127.0.0.1:${upstream.address().port}`, "fixture");
  const base = `http://127.0.0.1:${proxy.port}`;
  try {
    await assert.rejects(fetch(`${base}/screenplay/projects/stable/creation`, { method: "PUT" }));
    assert.equal(creations, 1);
    assert.equal((await fetch(`${base}/screenplay/projects/stable/version`, { method: "POST" })).status, 503);
    assert.equal(versions, 0);
    assert.equal((await fetch(`${base}/__proof/creation/arm`, { method: "POST" })).status, 401);
    const armed = await fetch(`${base}/__proof/creation/arm`, { method: "POST", headers: { "x-app-token": "fixture" } });
    assert.deepEqual(await armed.json(), { ok: true, state: "armed", droppedReplies: 1, blockedVersions: 1 });
    assert.equal((await fetch(`${base}/screenplay/projects/stable/creation`, { method: "PUT" })).status, 200);
    assert.equal((await fetch(`${base}/screenplay/projects/stable/version`, { method: "POST" })).status, 200);
    assert.equal(creations, 2);
    assert.equal(versions, 1);
  } finally {
    await proxy.stop();
    upstream.closeAllConnections();
    await new Promise(resolve => upstream.close(resolve));
  }
});

test("creation proof refuses non-loopback upstreams", async () => {
  await assert.rejects(startCreationReplyFaultProxy("http://example.com", "fixture"), /loopback/);
});
