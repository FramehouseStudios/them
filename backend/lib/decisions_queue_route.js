// T-decisions-queue-route — GET /coordination/decisions-queue
//
// Exposes `docs/decisions-queue.md` as a machine-readable snapshot so
// iOS / dashboards can surface "items waiting on the human" without
// re-parsing the markdown ledger. The markdown remains the canonical
// source of truth — this route is a read-only projection.
//
// Format expected (one entry per `###` heading):
//
//   ### D-<slug> — <question>
//   - **Asked by:** claude | codex
//   - **Asked at:** YYYY-MM-DD
//   - **Why it matters:** ...
//   - **Question:** ...
//   - **Default if no answer:** ...
//
// Entries below `## Open` go into `open`, entries below `## Resolved`
// go into `resolved`. Resolved entries may include a `**Resolved at:**`
// or `**Answer:**` line — both are captured if present.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_QUEUE_PATH = path.resolve(__dirname, "..", "..", "docs", "decisions-queue.md");

const DECISIONS_QUEUE_SCHEMA_VERSION = 1;

function safeReadQueueFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function parseFieldLine(line) {
  // Matches "- **Field name:** value..." (colon inside the bold) and
  // tolerates "- **Field name**: value..." (colon outside).
  const m = line.match(/^\s*-\s+\*\*([^*]+?)\s*:?\s*\*\*\s*:?\s*(.*)$/);
  if (!m) return null;
  const rawKey = m[1].replace(/:+\s*$/u, "").trim();
  if (!rawKey) return null;
  return { key: rawKey.toLowerCase().replace(/\s+/g, "_"), value: m[2].trim() };
}

function parseDecisionsQueueMarkdown(text) {
  const out = { schemaVersion: DECISIONS_QUEUE_SCHEMA_VERSION, open: [], resolved: [] };
  if (typeof text !== "string" || text.length === 0) return out;

  const lines = text.split(/\r?\n/);
  let section = null; // "open" | "resolved" | null
  let current = null;

  function flush() {
    if (!current || !section) return;
    if (section === "open") out.open.push(current);
    else if (section === "resolved") out.resolved.push(current);
    current = null;
  }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/u, "");
    const headerMatch = line.match(/^##\s+(.+?)\s*$/);
    if (headerMatch) {
      flush();
      const name = headerMatch[1].toLowerCase();
      if (name === "open") section = "open";
      else if (name === "resolved") section = "resolved";
      else section = null;
      continue;
    }
    if (!section) continue;

    const entryMatch = line.match(/^###\s+(D-[A-Za-z0-9_-]+)\s*(?:—|--|-)\s*(.+?)\s*$/);
    if (entryMatch) {
      flush();
      current = { id: entryMatch[1], title: entryMatch[2] };
      continue;
    }

    if (!current) continue;
    const field = parseFieldLine(line);
    if (field) {
      current[field.key] = field.value;
    }
  }
  flush();

  return out;
}

function defaultResolveQueuePath(req) {
  const fromLocals = req?.app?.locals?.decisionsQueuePath;
  if (typeof fromLocals === "string" && fromLocals.length > 0) return fromLocals;
  return DEFAULT_QUEUE_PATH;
}

function mountDecisionsQueueRoute(app, { filePath = null } = {}) {
  if (!app || typeof app.get !== "function") {
    throw new Error("mountDecisionsQueueRoute requires an Express app");
  }

  app.get("/coordination/decisions-queue", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const resolved = filePath || defaultResolveQueuePath(req);
      const text = safeReadQueueFile(resolved);
      const parsed = parseDecisionsQueueMarkdown(text);
      return res.status(200).json({
        ...parsed,
        counts: { open: parsed.open.length, resolved: parsed.resolved.length },
      });
    } catch (e) {
      return res.status(500).json({
        schemaVersion: DECISIONS_QUEUE_SCHEMA_VERSION,
        open: [],
        resolved: [],
        counts: { open: 0, resolved: 0 },
        error: e?.message || "decisions_queue_failed",
      });
    }
  });
}

export {
  mountDecisionsQueueRoute,
  parseDecisionsQueueMarkdown,
  DECISIONS_QUEUE_SCHEMA_VERSION,
};
