// Disposable route harness using the production app middleware/parser.
// No model adapter, account, storage or external request is involved.
import { app, talkUpload } from "../../app.js";
app.get("/health", (_req, res) => res.json({ ok: true }));
app.post("/upload", (_req, _res, next) => { process.send({ uploadStarted: true }); next(); }, talkUpload, (req, res) => {
  const files = Object.values(req.files || {}).flat();
  res.json({ ok: true, files: files.map((f) => ({ field: f.fieldname,
    bytes: f.size, hex: f.buffer.toString("hex") })), text: req.body?.text || "" });
});
app.use((err, _req, res, _next) => {
  // Match the current production oversized-file contract, not a mock parser.
  if (err?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ stage: "upload", error: "File too large." });
  return res.status(500).json({ stage: "server", error: "Internal server error." });
});
const server = app.listen(0, "127.0.0.1", () => process.send({ port: server.address().port }));
process.on("SIGTERM", () => { server.closeAllConnections(); server.close(() => process.exit(0)); });
