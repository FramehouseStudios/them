import express from "express";

const SESSION_EVOLUTION_BODY_LIMIT = "256kb";

function requireFunction(deps, key) {
  if (typeof deps?.[key] !== "function") {
    throw new Error(`mountSessionEvolutionRoute requires dep: ${key}`);
  }
  return deps[key];
}

function mountSessionEvolutionRoute(app, deps = {}) {
  if (!app || typeof app.patch !== "function") {
    throw new Error("mountSessionEvolutionRoute requires an Express app");
  }
  const applyReadStateHeaders = requireFunction(deps, "applyReadStateHeaders");
  const buildReadStateMeta = requireFunction(deps, "buildReadStateMeta");
  const clampUnit = requireFunction(deps, "clampUnit");
  const clientIp = requireFunction(deps, "clientIp");
  const createCanonicalMemoryMutationCommitter = requireFunction(
    deps,
    "createCanonicalMemoryMutationCommitter",
  );
  const createRequestId = requireFunction(deps, "createRequestId");
  const normalizeAffectionStyle = requireFunction(deps, "normalizeAffectionStyle");
  const normalizeClientIp = requireFunction(deps, "normalizeClientIp");
  const normalizeReassuranceStyle = requireFunction(deps, "normalizeReassuranceStyle");
  const normalizeSnippet = requireFunction(deps, "normalizeSnippet");
  const normalizeUserPersonName = requireFunction(deps, "normalizeUserPersonName");
  const parseBool = requireFunction(deps, "parseBool");
  const parseBoundedFloat = requireFunction(deps, "parseBoundedFloat");
  const parseBoundedInt = requireFunction(deps, "parseBoundedInt");
  const resolveCanonicalWritableMemoryContext = requireFunction(
    deps,
    "resolveCanonicalWritableMemoryContext",
  );
  const sanitizePersistedSessionMemory = requireFunction(
    deps,
    "sanitizePersistedSessionMemory",
  );
  const logger = deps.logger || console;
  const RELATIONSHIP_DEPTH_MAX = Number(deps.RELATIONSHIP_DEPTH_MAX);
  if (!Number.isFinite(RELATIONSHIP_DEPTH_MAX) || RELATIONSHIP_DEPTH_MAX <= 0) {
    throw new Error("mountSessionEvolutionRoute requires numeric RELATIONSHIP_DEPTH_MAX");
  }

  app.patch(
    "/session/evolution",
    express.json({ limit: SESSION_EVOLUTION_BODY_LIMIT }),
    async (req, res) => {
      const rid = req.requestId || createRequestId();
      const now = Date.now();
      const requestIp = normalizeClientIp(clientIp(req));
      const stage = parseBoundedInt(req.body?.stage, 1, 5);
      const depthScore = parseBoundedFloat(req.body?.depth_score ?? req.body?.depth, 0, 10);
      const romanceTension = parseBoundedFloat(
        req.body?.romance_tension ?? req.body?.romance,
        0,
        10,
      );
      const sessionCount = parseBoundedInt(req.body?.session_count, 0, 1_000_000);
      const reassuranceNeed = parseBoundedFloat(req.body?.reassurance_need, 0, 1);
      const boundaryNeed = parseBoundedFloat(req.body?.boundary_need, 0, 1);
      const playfulMomentum = parseBoundedFloat(req.body?.playful_momentum, 0, 1);
      const trustSignal = parseBoundedFloat(req.body?.trust_signal, 0, 1);
      const lastThemeCue = normalizeSnippet(req.body?.last_theme_cue ?? "", 96);
      const latestUserMessage = normalizeSnippet(
        req.body?.latest_user_message ?? req.body?.latestUserMessage ?? "",
        220,
      );
      const reassuranceStyleHintRaw = normalizeSnippet(
        req.body?.reassurance_style_hint ?? req.body?.reassuranceStyleHint ?? "",
        32,
      );
      const reassuranceStyleHint = reassuranceStyleHintRaw
        ? normalizeReassuranceStyle(reassuranceStyleHintRaw, "soft")
        : "";
      const affectionStyleHintRaw = normalizeSnippet(
        req.body?.affection_style_hint ?? req.body?.affectionStyleHint ?? "",
        32,
      );
      const affectionStyleHint = affectionStyleHintRaw
        ? normalizeAffectionStyle(affectionStyleHintRaw, "casual")
        : "";
      const supportIntentHintRaw = normalizeSnippet(
        req.body?.support_intent_hint ?? req.body?.supportIntentHint ?? "",
        40,
      ).toLowerCase();
      const supportIntentHint = (
        supportIntentHintRaw === "comfort_first" ||
        supportIntentHintRaw === "clarity_then_comfort" ||
        supportIntentHintRaw === "playful_then_depth"
      ) ? supportIntentHintRaw : "";
      const romanceDepthHint = parseBoundedFloat(
        req.body?.romance_depth_hint ?? req.body?.romanceDepthHint,
        0,
        1,
      );
      const loveTopicRaw = req.body?.love_topic_active ?? req.body?.loveTopicActive;
      const loveTopicActive = (
        loveTopicRaw == null || String(loveTopicRaw).trim() === ""
      ) ? null : parseBool(loveTopicRaw);
      const isScreenwriterRaw = req.body?.is_screenwriter ?? req.body?.isScreenwriter;
      const isScreenwriter = (
        isScreenwriterRaw == null || String(isScreenwriterRaw).trim() === ""
      ) ? null : parseBool(isScreenwriterRaw);
      const preferredName = normalizeUserPersonName(
        req.body?.preferred_name ?? req.body?.user_name ?? "",
      );

      let context;
      try {
        context = await resolveCanonicalWritableMemoryContext(req, now);
      } catch (error) {
        logger.error?.(
          `[${rid}] session_evolution memory_read_failed error=${String(error?.message || error)}`,
        );
        res.setHeader("Cache-Control", "no-store");
        return res.status(503).json({
          stage: "session_evolution",
          error: "memory_read_failed",
        });
      }

      let persisted;
      try {
        const commitMemoryMutation = createCanonicalMemoryMutationCommitter(context);
        persisted = await commitMemoryMutation((currentMemory) => {
          const memory = sanitizePersistedSessionMemory(currentMemory);
          if (reassuranceNeed != null) {
            memory.reassuranceNeed = clampUnit(reassuranceNeed, memory.reassuranceNeed);
          }
          if (boundaryNeed != null) {
            memory.boundaryNeed = clampUnit(boundaryNeed, memory.boundaryNeed);
          }
          if (playfulMomentum != null) {
            memory.playfulness = clampUnit(playfulMomentum, memory.playfulness);
          }
          if (trustSignal != null) {
            memory.trust = clampUnit(trustSignal, memory.trust);
          }
          if (reassuranceStyleHint) {
            memory.reassuranceStyle = reassuranceStyleHint;
            memory.reassuranceStyleUpdatedAt = now;
          }
          if (affectionStyleHint) memory.affectionStyle = affectionStyleHint;
          if (supportIntentHint) memory.supportIntentHint = supportIntentHint;
          if (romanceDepthHint != null) {
            memory.romanceDepthHint = clampUnit(romanceDepthHint, memory.romanceDepthHint);
          }
          if (loveTopicActive != null) memory.loveTopicActive = Boolean(loveTopicActive);
          if (depthScore != null) {
            const depthTarget = Math.max(0, Math.min(RELATIONSHIP_DEPTH_MAX, depthScore * 16));
            const currentDepth = Math.max(
              0,
              Math.min(
                RELATIONSHIP_DEPTH_MAX,
                Number(memory.relationshipDepthScore || depthTarget),
              ),
            );
            const blendedDepth = (currentDepth * 0.88) + (depthTarget * 0.12);
            memory.relationshipDepthScore = Math.max(
              0,
              Math.min(RELATIONSHIP_DEPTH_MAX, blendedDepth),
            );
            memory.relationshipDepthPeak = Math.max(
              Number(memory.relationshipDepthPeak || 0),
              memory.relationshipDepthScore,
            );
            memory.emotionalDepthScore = clampUnit(depthScore / 10, memory.emotionalDepthScore);
          }
          if (sessionCount != null) memory.conversationCount = Math.max(0, Number(sessionCount));
          if (lastThemeCue) memory.lastTheme = lastThemeCue;
          if (preferredName) {
            memory.userPrimaryName = preferredName;
            memory.userPrimaryNameUpdatedAt = now;
          }
          if (latestUserMessage) {
            memory.lastUserQuestion = normalizeSnippet(latestUserMessage, 180);
          }
          if (isScreenwriter === true) memory.isScreenwriter = true;

          memory.evolutionSync = {
            stage: stage ?? Number(memory.evolutionSync?.stage || 0),
            depthScore: depthScore ?? Number(memory.evolutionSync?.depthScore || 0),
            romanceTension: romanceTension ?? Number(memory.evolutionSync?.romanceTension || 0),
            sessionCount: sessionCount ?? Number(memory.evolutionSync?.sessionCount || 0),
            reassuranceNeed: reassuranceNeed ?? Number(
              memory.evolutionSync?.reassuranceNeed || memory.reassuranceNeed || 0,
            ),
            boundaryNeed: boundaryNeed ?? Number(
              memory.evolutionSync?.boundaryNeed || memory.boundaryNeed || 0,
            ),
            playfulMomentum: playfulMomentum ?? Number(
              memory.evolutionSync?.playfulMomentum || memory.playfulness || 0,
            ),
            trustSignal: trustSignal ?? Number(
              memory.evolutionSync?.trustSignal || memory.trust || 0,
            ),
            lastThemeCue: lastThemeCue || String(
              memory.evolutionSync?.lastThemeCue || memory.lastTheme || "",
            ),
            preferredName: preferredName || String(
              memory.evolutionSync?.preferredName || memory.userPrimaryName || "",
            ),
            latestUserMessage: latestUserMessage || String(
              memory.evolutionSync?.latestUserMessage || "",
            ),
            reassuranceStyleHint: reassuranceStyleHint || String(
              memory.evolutionSync?.reassuranceStyleHint || memory.reassuranceStyle || "soft",
            ),
            affectionStyleHint: affectionStyleHint || String(
              memory.evolutionSync?.affectionStyleHint || memory.affectionStyle || "casual",
            ),
            supportIntentHint: supportIntentHint || String(
              memory.evolutionSync?.supportIntentHint ||
              memory.supportIntentHint ||
              "clarity_then_comfort",
            ),
            romanceDepthHint: romanceDepthHint ?? Number(
              memory.evolutionSync?.romanceDepthHint || memory.romanceDepthHint || 0,
            ),
            loveTopicActive: loveTopicActive != null
              ? Boolean(loveTopicActive)
              : Boolean(memory.evolutionSync?.loveTopicActive || memory.loveTopicActive),
            isScreenwriter: Boolean(
              (isScreenwriter === true) ||
              memory.evolutionSync?.isScreenwriter ||
              memory.isScreenwriter,
            ),
            updatedAt: now,
          };

          if (stage != null) memory.evolutionStageHint = stage;
          if (romanceTension != null) memory.romanceTensionHint = romanceTension;
          memory.lastUpdatedAt = now;
          return memory;
        }, now);
      } catch (error) {
        logger.error?.(
          `[${rid}] session_evolution memory_write_failed error=${String(error?.message || error)}`,
        );
        res.setHeader("Cache-Control", "no-store");
        return res.status(503).json({
          stage: "session_evolution",
          error: "memory_write_failed",
        });
      }

      const requesterIp = context.requesterIp || requestIp;
      const meta = buildReadStateMeta(req, persisted, requesterIp);
      res.setHeader("Cache-Control", "no-store");
      applyReadStateHeaders(res, meta);
      logger.log(
        `[${rid}] session_evolution synced stage=${stage ?? "n/a"} depth=${depthScore ?? "n/a"} romance=${romanceTension ?? "n/a"} reassure_style=${reassuranceStyleHint || "n/a"} affection=${affectionStyleHint || "n/a"} love_topic=${loveTopicActive == null ? "n/a" : (loveTopicActive ? "1" : "0")} ip=${requesterIp}`,
      );
      return res.status(204).end();
    },
  );
}

export {
  SESSION_EVOLUTION_BODY_LIMIT,
  mountSessionEvolutionRoute,
};
