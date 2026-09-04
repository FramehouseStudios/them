// T-live-draft-sync — mountScreenplayLiveDraftRoutes
//
// Live typing channel for one screenplay project, scoped to the
// authenticated owner. A device publishes keystroke ops; every other device
// the same user has open on that project receives them over SSE within the
// same round trip. See lib/live_draft_hub.js for the op / seq / checksum
// model and docs/specs/T-live-draft-sync.md for the client contract.
//
// Routes:
//   GET  /screenplay/projects/:projectId/live/stream     SSE subscribe
//   GET  /screenplay/projects/:projectId/live/snapshot   current mirror
//   POST /screenplay/projects/:projectId/live/ops        publish one op
//   POST /screenplay/projects/:projectId/live/snapshot   publish full text
//   POST /screenplay/projects/:projectId/live/version    announce saved version
//
// V1 pillar: infra
// V1 effect: desktop <-> iPhone live typing on the Studio page.
//
// Access-control posture: PER-USER. `/screenplay/*` sits under
// USER_PROTECTED_PATTERNS in lib/user_auth.js, so `protectUserRoutes`
// attaches trusted identity before these handlers run. Every handler still
// resolves the owner record from that identity (refreshed from persistence,
// same as the project routes, so a restarted instance answers correctly) and
// 404s when the project is not the caller's — caller-supplied X-User-Id is
// never trusted. Channel keys are derived from (user, project); a user can
// never subscribe to or publish into another user's channel.
//
// Nothing here writes to the screenplay store. The authoritative save stays
// `POST /screenplay/projects/:projectId/version`.

import express from "express";
import {
  defaultResolveScreenplayUserId,
  requireScreenplayUserId,
} from "./screenplay_route_auth.js";
import {
  liveDraftChecksum,
  normalizeLiveDraftDeviceId,
  normalizeLiveDraftVersionId,
} from "./live_draft_hub.js";

const LIVE_DRAFT_OPS_BODY_LIMIT = "512kb";
const LIVE_DRAFT_SNAPSHOT_BODY_LIMIT = "2mb";
const LIVE_DRAFT_VERSION_BODY_LIMIT = "16kb";
const DEFAULT_HEARTBEAT_MS = 15_000;
const STAGE = "screenplay_live";

function writeSseEvent(res, event) {
  const type = String(event?.type || "message");
  const payload = JSON.stringify(event ?? {});
  const idLine = Number.isFinite(Number(event?.seq)) ? `id: ${Number(event.seq)}\n` : "";
  res.write(`${idLine}event: ${type}\ndata: ${payload}\n\n`);
}

function mountScreenplayLiveDraftRoutes(app, deps = {}) {
  if (!app || typeof app.get !== "function" || typeof app.post !== "function") {
    throw new Error("mountScreenplayLiveDraftRoutes requires an Express app");
  }
  const {
    hub,
    getOrCreateScreenplayOwnerRecord,
    getScreenplayProjectRecord,
    getLatestScreenplayVersion,
    normalizeSnippet,
    createRequestId,
    resolveUserId = defaultResolveScreenplayUserId,
    // Optional: authoritative owner refresh (screenplay_store). Without it the
    // in-memory record is used, which is what unit tests exercise.
    refreshScreenplayOwnerRecord = null,
    heartbeatMs = DEFAULT_HEARTBEAT_MS,
  } = deps;
  for (const key of [
    "hub",
    "getOrCreateScreenplayOwnerRecord",
    "getScreenplayProjectRecord",
    "getLatestScreenplayVersion",
    "normalizeSnippet",
    "createRequestId",
  ]) {
    if (deps[key] === undefined) throw new Error("mountScreenplayLiveDraftRoutes requires dep: " + key);
  }

  async function resolveOwner(req, res) {
    const userId = requireScreenplayUserId(req, res, { resolveUserId, stage: STAGE });
    if (!userId) return null;
    if (!req.userId) req.userId = userId;
    const cached = getOrCreateScreenplayOwnerRecord(req, { create: true });
    if (!cached) return { userId, owner: null };
    if (typeof refreshScreenplayOwnerRecord !== "function") return { userId, owner: cached };
    let refreshed;
    try {
      refreshed = await refreshScreenplayOwnerRecord(cached.ownerKey);
    } catch (error) {
      refreshed = { ok: false, error };
    }
    if (!refreshed?.ok) {
      res.setHeader("Cache-Control", "no-store");
      res.status(503).json({
        stage: STAGE,
        error: "screenplay_persistence_failed",
        persistence: refreshed?.persistenceKind || "unknown",
      });
      return null;
    }
    return { userId, owner: refreshed.owner || null };
  }

  // The channel mirrors what the writer sees: the active version when one is
  // set (a restored older version is "current"), else the newest by time.
  function seedVersionFor(project) {
    const activeId = String(project?.activeVersionId || "").trim();
    const active = activeId
      ? (project.versions || []).find((item) => item?.id === activeId) || null
      : null;
    return active || getLatestScreenplayVersion(project);
  }

  async function resolveChannel(req, res) {
    const resolved = await resolveOwner(req, res);
    if (!resolved) return null;
    const { userId, owner } = resolved;
    const projectId = normalizeSnippet(req.params?.projectId, 64);
    const project = owner ? getScreenplayProjectRecord(owner, projectId) : null;
    if (!project) {
      res.setHeader("Cache-Control", "no-store");
      res.status(404).json({ stage: STAGE, error: "project_not_found" });
      return null;
    }
    const key = hub.channelKey(userId, project.id);
    const seed = seedVersionFor(project);
    const channel = hub.ensure(key, {
      seedText: String(seed?.draft || ""),
      seedVersionId: seed?.id || "",
    });
    if (!channel) {
      res.setHeader("Cache-Control", "no-store");
      res.status(503).json({ stage: STAGE, error: "live_channel_unavailable" });
      return null;
    }
    return { key, projectId: project.id };
  }

  function deviceIdFrom(req, res, source) {
    const deviceId = normalizeLiveDraftDeviceId(source?.device_id ?? source?.deviceId ?? "");
    if (!deviceId) {
      res.setHeader("Cache-Control", "no-store");
      res.status(400).json({ stage: STAGE, error: "device_id_required" });
      return "";
    }
    return deviceId;
  }

  function rejectionStatus(reason) {
    switch (reason) {
      case "stale_base":
      case "checksum_mismatch":
        return 409;
      case "rate_limited":
        return 429;
      case "text_too_large":
        return 413;
      case "channel_missing":
        return 503;
      default:
        return 400;
    }
  }

  function respondRejection(res, projectId, rid, result) {
    const status = rejectionStatus(result.reason);
    res.setHeader("Cache-Control", "no-store");
    return res.status(status).json({
      stage: STAGE,
      error: result.reason,
      request_id: rid,
      project_id: projectId,
      seq: result.seq,
      checksum: result.checksum,
      version_id: result.version_id || "",
      // Only the conflict family carries the full text so the client can
      // resync in one round trip; other rejections stay small.
      text: status === 409 ? String(result.text ?? "") : undefined,
    });
  }

  app.get("/screenplay/projects/:projectId/live/stream", async (req, res) => {
    const rid = req.requestId || createRequestId();
    const resolved = await resolveChannel(req, res);
    if (!resolved) return;
    const { key, projectId } = resolved;
    const deviceId = deviceIdFrom(req, res, req.query);
    if (!deviceId) return;
    const clientChecksum = String(req.query?.checksum || "").trim();

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-store, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("X-Screenplay-Live-Request-Id", rid);
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    let closed = false;
    const unsubscribe = hub.subscribe(key, {
      deviceId,
      send: (event) => {
        if (closed) return;
        writeSseEvent(res, event);
        if (event?.type === "bye") {
          closed = true;
          try { res.end(); } catch (_error) { /* already closed */ }
        }
      },
    });
    if (!unsubscribe) {
      writeSseEvent(res, { type: "error", error: "live_channel_full", ts: Date.now() });
      return res.end();
    }

    const snapshot = hub.snapshot(key);
    const includeText = !clientChecksum || clientChecksum !== snapshot.checksum;
    writeSseEvent(res, {
      type: "hello",
      seq: snapshot.seq,
      checksum: snapshot.checksum,
      version_id: snapshot.version_id,
      seeded: snapshot.seeded,
      device_id: deviceId,
      project_id: projectId,
      text: includeText ? snapshot.text : undefined,
      ts: Date.now(),
    });

    const heartbeat = setInterval(() => {
      if (closed) return;
      try { res.write(": ping\n\n"); } catch (_error) { /* connection is going away */ }
    }, Math.max(1_000, Number(heartbeatMs) || DEFAULT_HEARTBEAT_MS));
    heartbeat.unref?.();

    const teardown = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
    };
    req.on("aborted", teardown);
    res.on("close", teardown);
    res.on("error", teardown);
  });

  app.get("/screenplay/projects/:projectId/live/snapshot", async (req, res) => {
    const rid = req.requestId || createRequestId();
    const resolved = await resolveChannel(req, res);
    if (!resolved) return;
    const snapshot = hub.snapshot(resolved.key);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      stage: STAGE,
      request_id: rid,
      project_id: resolved.projectId,
      ...snapshot,
    });
  });

  app.post(
    "/screenplay/projects/:projectId/live/ops",
    express.json({ limit: LIVE_DRAFT_OPS_BODY_LIMIT }),
    async (req, res) => {
      const rid = req.requestId || createRequestId();
      const resolved = await resolveChannel(req, res);
      if (!resolved) return;
      const deviceId = deviceIdFrom(req, res, req.body);
      if (!deviceId) return;
      const result = hub.applyOp(resolved.key, {
        deviceId,
        baseSeq: req.body?.base_seq ?? req.body?.baseSeq,
        baseChecksum: String(req.body?.base_checksum ?? req.body?.baseChecksum ?? "").trim(),
        op: req.body?.op,
        checksum: String(req.body?.checksum ?? "").trim(),
        cursor: req.body?.cursor ?? null,
      });
      if (!result.ok) return respondRejection(res, resolved.projectId, rid, result);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({
        stage: STAGE,
        status: "applied",
        request_id: rid,
        project_id: resolved.projectId,
        seq: result.seq,
        checksum: result.checksum,
      });
    }
  );

  app.post(
    "/screenplay/projects/:projectId/live/snapshot",
    express.json({ limit: LIVE_DRAFT_SNAPSHOT_BODY_LIMIT }),
    async (req, res) => {
      const rid = req.requestId || createRequestId();
      const resolved = await resolveChannel(req, res);
      if (!resolved) return;
      const deviceId = deviceIdFrom(req, res, req.body);
      if (!deviceId) return;
      const text = req.body?.text;
      if (typeof text !== "string") {
        res.setHeader("Cache-Control", "no-store");
        return res.status(400).json({ stage: STAGE, error: "text_required", request_id: rid });
      }
      const result = hub.replaceText(resolved.key, {
        deviceId,
        text: text.replace(/\r\n/g, "\n"),
        versionId: normalizeLiveDraftVersionId(req.body?.version_id ?? req.body?.versionId ?? ""),
      });
      if (!result.ok) return respondRejection(res, resolved.projectId, rid, result);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({
        stage: STAGE,
        status: result.unchanged ? "unchanged" : "replaced",
        request_id: rid,
        project_id: resolved.projectId,
        seq: result.seq,
        checksum: result.checksum,
      });
    }
  );

  app.post(
    "/screenplay/projects/:projectId/live/version",
    express.json({ limit: LIVE_DRAFT_VERSION_BODY_LIMIT }),
    async (req, res) => {
      const rid = req.requestId || createRequestId();
      const resolved = await resolveChannel(req, res);
      if (!resolved) return;
      const deviceId = deviceIdFrom(req, res, req.body);
      if (!deviceId) return;
      const result = hub.announceVersion(resolved.key, {
        deviceId,
        versionId: req.body?.version_id ?? req.body?.versionId ?? "",
        checksum: String(req.body?.checksum ?? "").trim(),
      });
      if (!result.ok) return respondRejection(res, resolved.projectId, rid, result);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({
        stage: STAGE,
        status: "announced",
        request_id: rid,
        project_id: resolved.projectId,
        seq: result.seq,
        checksum: result.checksum,
        version_id: result.event.version_id,
      });
    }
  );
}

export {
  LIVE_DRAFT_OPS_BODY_LIMIT,
  LIVE_DRAFT_SNAPSHOT_BODY_LIMIT,
  LIVE_DRAFT_VERSION_BODY_LIMIT,
  liveDraftChecksum,
  mountScreenplayLiveDraftRoutes,
};
