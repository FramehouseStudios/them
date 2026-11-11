// Test-only loopback proxy: discard the first successful recovery initializer
// response after the authenticated backend has durably committed it.
import http from "node:http";
import { startBackend } from "../backend/tests/helpers/backend_test_server.mjs";

const backend = await startBackend({ env: { REQUIRE_USER_AUTH: "1", APP_TOKEN: "them-dev" }, unsetEnv: ["DATABASE_URL", "REDIS_URL"] });
let dropped = false;
const proxy = http.createServer(async (incoming, outgoing) => {
  const chunks = [];
  for await (const chunk of incoming) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  let loseResponse = false;
  try {
    const payload = body.length ? JSON.parse(body.toString("utf8")) : null;
    loseResponse = !dropped && incoming.method === "POST" && incoming.url === "/screenplay/projects/initialize"
      && payload?.initial_draft?.source === "studio_recovery_fork" && payload?.activate === false;
  } catch { /* Forward non-JSON requests unchanged. */ }
  const upstream = http.request({ hostname: "127.0.0.1", port: backend.port, path: incoming.url,
    method: incoming.method, headers: { ...incoming.headers, host: `127.0.0.1:${backend.port}` } }, (response) => {
    if (loseResponse && response.statusCode === 201 && !dropped) {
      response.resume();
      response.on("end", () => { dropped = true; outgoing.destroy(); process.stdout.write("recovery_ack_dropped_after_201\n"); });
      return;
    }
    outgoing.writeHead(response.statusCode || 502, response.headers);
    response.pipe(outgoing);
  });
  upstream.on("error", () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end(); });
  upstream.end(body);
});
proxy.listen(31337, "127.0.0.1", () => process.stdout.write("recovery_proxy_ready\n"));
async function shutdown() { proxy.close(); await backend.stop(); process.exit(0); }
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
