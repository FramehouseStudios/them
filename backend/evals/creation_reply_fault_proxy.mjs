// Test-only, loopback-only transport fixture. No production routes or app flags.
import http from "node:http";

export async function startCreationReplyFaultProxy(upstreamBaseURL, appToken) {
  const upstream = new URL(upstreamBaseURL);
  if (upstream.hostname !== "127.0.0.1") throw new Error("Creation proof requires a loopback backend");
  let state = "closed", droppedReplies = 0, blockedVersions = 0;
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    if ((req.url === "/__proof/creation/arm" && req.method === "POST") ||
        (req.url === "/__proof/creation/status" && req.method === "GET")) {
      if (req.headers["x-app-token"] !== appToken) { res.writeHead(401); res.end(); return; }
      if (req.method === "POST") state = "armed";
      req.resume();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, state, droppedReplies, blockedVersions }));
      return;
    }
    const creation = req.method === "PUT" && /^\/screenplay\/projects\/[^/]+\/creation$/.test(req.url || "");
    if (state !== "open" && req.method === "POST" && /\/version$/.test(req.url || "")) {
      blockedVersions += 1;
      req.resume();
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ stage: "proof_network", error: "synthetic_offline" }));
      return;
    }
    const forwarding = http.request({ hostname: "127.0.0.1", port: upstream.port,
      path: req.url, method: req.method, headers: { ...req.headers, host: upstream.host } }, reply => {
      if (creation && reply.statusCode >= 200 && reply.statusCode < 300 && state !== "open") {
        if (state === "armed") state = "open";
        else {
          droppedReplies += 1;
          reply.resume();
          reply.on("end", () => req.socket.destroy());
          return;
        }
      }
      res.writeHead(reply.statusCode, reply.headers);
      reply.pipe(res);
    });
    forwarding.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.on("error", () => forwarding.destroy());
    req.pipe(forwarding);
  });
  server.on("connection", socket => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { port: server.address().port, async stop() {
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  } };
}
