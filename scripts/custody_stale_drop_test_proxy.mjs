// Test-only proxy: drop the first selected-custody request before it reaches the backend.
import http from "node:http";
import { startBackend } from "../backend/tests/helpers/backend_test_server.mjs";

const databaseURL = process.env.THEM_CUSTODY_FENCE_TEST_DATABASE_URL || "";
if (databaseURL) {
  const target = new URL(databaseURL);
  if (!["127.0.0.1", "localhost", "::1"].includes(target.hostname) || !/^\/them_t[0-9]+[a-z0-9_]*$/.test(target.pathname)) {
    throw new Error("Custody fence proof requires an explicitly task-owned loopback database.");
  }
}
const backend = await startBackend({ env: { REQUIRE_USER_AUTH: "1", APP_TOKEN: "them-dev",
  ...(databaseURL ? { DATABASE_URL: databaseURL } : {}) }, unsetEnv: databaseURL ? ["REDIS_URL"] : ["DATABASE_URL", "REDIS_URL"] });
let dropped = false;
let droppedRequest = null;
const proxy = http.createServer(async (incoming, outgoing) => {
  const chunks = [];
  for await (const chunk of incoming) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  // Synthetic local proof only: expose the captured request to that same test
  // account so its late retry can be checked without manufacturing an ID.
  if (incoming.method === "GET" && incoming.url === "/__test/custody-dropped") {
    if (!droppedRequest || incoming.headers.authorization !== droppedRequest.authorization ||
        incoming.headers["x-client-token"] !== droppedRequest.clientToken) {
      outgoing.writeHead(404); outgoing.end(); return;
    }
    outgoing.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    outgoing.end(JSON.stringify({ project_id: droppedRequest.projectID, request: droppedRequest.payload })); return;
  }
  let loseResponse = false;
  try {
    const payload = body.length ? JSON.parse(body.toString("utf8")) : null;
    loseResponse = !dropped && incoming.method === "POST" && /^\/screenplay\/projects\/[^/]+\/version$/.test(incoming.url)
      && payload?.source === "studio_custody_selected";
  } catch { /* Forward non-JSON requests unchanged. */ }
  if (loseResponse) {
    dropped = true;
    droppedRequest = { projectID: incoming.url.split("/")[3], payload: JSON.parse(body.toString("utf8")),
      authorization: incoming.headers.authorization, clientToken: incoming.headers["x-client-token"] };
    process.stdout.write("custody_request_dropped_before_send\n"); outgoing.destroy(); return;
  }
  const upstream = http.request({ hostname: "127.0.0.1", port: backend.port, path: incoming.url,
    method: incoming.method, headers: { ...incoming.headers, host: `127.0.0.1:${backend.port}` } }, (response) => {
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
