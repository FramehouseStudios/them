import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import {
  mountScreenplayQuestionRoutes,
  SCREENPLAY_QUESTION_RESOLUTION_BODY_LIMIT,
} from "../lib/screenplay_question_routes.js";

const pendingQuestion = {
  id: "screenplay-learning-4-project.theme_argument",
  projectId: "split-ferries",
  projectTitle: "Split Ferries",
  targetField: "project.theme_argument",
  targetLabel: "the theme argument",
  anchor: "Split Ferries",
  question: "What does Split Ferries argue about how a person should live?",
  actKey: "act2",
  sequenceKey: "midpoint",
  writerBlocked: false,
  askedAtTurn: 4,
  expiresAfterTurn: 6,
  askedAt: 1_725_000_000_000,
};

function defaultDeps(overrides = {}, initialQuestion = pendingQuestion) {
  let storedMemory = {
    turns: 5,
    pendingScreenplayLearningQuestions: [initialQuestion],
  };
  const calls = {
    creativeMemory: [],
    persisted: 0,
  };
  return {
    createRequestId: () => "req-question",
    normalizeSnippet: (value, max) => String(value ?? "").trim().slice(0, max),
    resolveWritableMemoryContext: () => ({
      memory: storedMemory,
      requesterIp: "127.0.0.1",
    }),
    sanitizePersistedSessionMemory: (memory) => structuredClone(memory || {}),
    persistWritableMemoryContext: (_context, memory) => {
      calls.persisted += 1;
      storedMemory = structuredClone(memory);
      return {
        source: "user",
        ip: "127.0.0.1",
        memory: storedMemory,
      };
    },
    recordCreativeMemoryTriggersForRequest: async (_req, turn) => {
      calls.creativeMemory.push(turn);
      return {
        learningAnswersPromoted: turn.learningContext ? 1 : 0,
        learningAnswersCorrectionProtected: 0,
      };
    },
    buildReadStateMeta: () => ({
      sessionId: "session-question",
      stateVersion: "state-question-2",
      lastUpdatedAt: 1_725_000_001_000,
      historyUpdatedAt: 1_725_000_001_000,
      memoryUpdatedAt: 1_725_000_001_000,
      lastTurnId: "turn-5",
      schemaVersion: 1,
      backendBuild: "test-build",
      backendBootId: "test-boot",
    }),
    applyReadStateHeaders: (res, meta) => {
      res.setHeader("x-state-version", meta.stateVersion);
      res.setHeader("x-session-id", meta.sessionId);
    },
    logger: {
      warn() {},
      error() {},
    },
    _calls: calls,
    _memory: () => storedMemory,
    ...overrides,
  };
}

async function withServer(deps, fn, { authenticated = true } = {}) {
  const app = express();
  if (authenticated) {
    app.use((req, _res, next) => {
      req.authUser = { id: "writer-1" };
      next();
    });
  }
  mountScreenplayQuestionRoutes(app, deps);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function postResolution(baseURL, body) {
  const response = await fetch(`${baseURL}/memory/screenplay-question/resolve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    headers: response.headers,
    body: await response.json(),
  };
}

test("[screenplay-question-route] body limit is intentionally small", () => {
  assert.equal(SCREENPLAY_QUESTION_RESOLUTION_BODY_LIMIT, "64kb");
});

test("[screenplay-question-route] mount fails when a required dependency is absent", () => {
  const deps = defaultDeps();
  delete deps.persistWritableMemoryContext;
  assert.throws(
    () => mountScreenplayQuestionRoutes(express(), deps),
    /persistWritableMemoryContext/
  );
});

test("[screenplay-question-route] requires trusted user auth", async () => {
  await withServer(defaultDeps(), async (baseURL) => {
    const result = await postResolution(baseURL, {
      question_id: pendingQuestion.id,
      project_id: pendingQuestion.projectId,
      response_status: "declined",
    });
    assert.equal(result.status, 401);
    assert.equal(result.body.error, "user_auth_required");
  }, { authenticated: false });
});

test("[screenplay-question-route] promotes an explicit answer before clearing it", async () => {
  const deps = defaultDeps();
  await withServer(deps, async (baseURL) => {
    const result = await postResolution(baseURL, {
      question_id: pendingQuestion.id,
      project_id: pendingQuestion.projectId,
      project_title: pendingQuestion.projectTitle,
      response_status: "answered",
      answer: "Love without trust becomes possession.",
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.status, "resolved");
    assert.equal(result.body.response_status, "answered");
    assert.equal(result.body.learning_promoted, true);
    assert.equal(result.headers.get("x-state-version"), "state-question-2");
    assert.equal(deps._calls.persisted, 1);
    assert.deepEqual(deps._memory().pendingScreenplayLearningQuestions, []);
    assert.equal(deps._calls.creativeMemory.length, 1);
    assert.equal(
      deps._calls.creativeMemory[0].learningContext.targetField,
      "project.theme_argument"
    );
    assert.equal(
      deps._calls.creativeMemory[0].transcript,
      "Love without trust becomes possession."
    );
  });
});

test("[screenplay-question-route] preserves an uncertain question for option generation", async () => {
  const deps = defaultDeps();
  await withServer(deps, async (baseURL) => {
    const result = await postResolution(baseURL, {
      question_id: pendingQuestion.id,
      project_id: pendingQuestion.projectId,
      project_title: pendingQuestion.projectTitle,
      response_status: "answered",
      answer: "I'm not sure, give me three options instead.",
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.status, "awaiting_options");
    assert.equal(result.body.response_status, "provisional_options");
    assert.equal(result.body.option_generation_required, true);
    assert.equal(result.body.learning_promoted, false);
    assert.equal(deps._calls.creativeMemory.length, 0);
    assert.equal(deps._calls.persisted, 0);
    assert.equal(deps._memory().pendingScreenplayLearningQuestions.length, 1);
  });
});

test("[screenplay-question-route] promotes only an explicitly selected provisional option", async () => {
  const provisionalQuestion = {
    ...pendingQuestion,
    id: "screenplay-options-5-project.theme_argument",
    question: "Which path should become true: Option 1, 2, or 3?",
    provisionalOptions: [
      {
        id: "option-1",
        rank: 1,
        value: "Love without trust becomes control.",
        recommended: true,
      },
      {
        id: "option-2",
        rank: 2,
        value: "Love requires risking the truth even when it may cost the relationship.",
        recommended: false,
      },
      {
        id: "option-3",
        rank: 3,
        value: "Protection becomes abandonment when it denies another person's agency.",
        recommended: false,
      },
    ],
  };
  const deps = defaultDeps({}, provisionalQuestion);
  await withServer(deps, async (baseURL) => {
    const result = await postResolution(baseURL, {
      question_id: provisionalQuestion.id,
      project_id: provisionalQuestion.projectId,
      project_title: provisionalQuestion.projectTitle,
      response_status: "answered",
      answer: "Option 2.",
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.response_status, "answered");
    assert.equal(result.body.selected_option_id, "option-2");
    assert.equal(result.body.selected_option_rank, 2);
    assert.equal(result.body.learning_promoted, true);
    assert.equal(deps._calls.creativeMemory.length, 1);
    assert.equal(deps._calls.creativeMemory[0].transcript, "Option 2.");
    assert.equal(
      deps._calls.creativeMemory[0].learningContext.selectedOptionId,
      "option-2"
    );
    assert.equal(
      deps._calls.creativeMemory[0].learningContext.provisionalOptions.length,
      3
    );
    assert.deepEqual(deps._memory().pendingScreenplayLearningQuestions, []);
  });
});

test("[screenplay-question-route] keeps a confirmation-only answer pending", async () => {
  const deps = defaultDeps();
  await withServer(deps, async (baseURL) => {
    const result = await postResolution(baseURL, {
      question_id: pendingQuestion.id,
      project_id: pendingQuestion.projectId,
      project_title: pendingQuestion.projectTitle,
      response_status: "answered",
      answer: "Exactly.",
    });

    assert.equal(result.status, 400);
    assert.equal(result.body.error, "insufficient");
    assert.equal(deps._calls.creativeMemory.length, 0);
    assert.equal(deps._calls.persisted, 0);
    assert.equal(deps._memory().pendingScreenplayLearningQuestions.length, 1);
  });
});

test("[screenplay-question-route] records a decline without a learning promotion", async () => {
  const deps = defaultDeps();
  await withServer(deps, async (baseURL) => {
    const result = await postResolution(baseURL, {
      question_id: pendingQuestion.id,
      project_id: pendingQuestion.projectId,
      response_status: "declined",
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.response_status, "declined");
    assert.equal(result.body.learning_promoted, false);
    assert.equal(deps._calls.creativeMemory[0].learningContext, null);
    assert.equal(
      deps._calls.creativeMemory[0].questionInteraction.responseStatus,
      "declined"
    );
    assert.deepEqual(deps._memory().pendingScreenplayLearningQuestions, []);
  });
});

test("[screenplay-question-route] replay is idempotent after the first resolution", async () => {
  const deps = defaultDeps();
  await withServer(deps, async (baseURL) => {
    const body = {
      question_id: pendingQuestion.id,
      project_id: pendingQuestion.projectId,
      response_status: "declined",
    };
    const first = await postResolution(baseURL, body);
    const replay = await postResolution(baseURL, body);

    assert.equal(first.body.status, "resolved");
    assert.equal(replay.status, 200);
    assert.equal(replay.body.status, "already_resolved");
    assert.equal(deps._calls.creativeMemory.length, 1);
    assert.equal(deps._calls.persisted, 1);
  });
});

test("[screenplay-question-route] a project mismatch cannot clear another project", async () => {
  const deps = defaultDeps();
  await withServer(deps, async (baseURL) => {
    const result = await postResolution(baseURL, {
      question_id: pendingQuestion.id,
      project_id: "different-project",
      response_status: "answered",
      answer: "A different movie.",
    });

    assert.equal(result.status, 409);
    assert.equal(result.body.error, "different_project");
    assert.equal(deps._calls.creativeMemory.length, 0);
    assert.equal(deps._calls.persisted, 0);
    assert.equal(deps._memory().pendingScreenplayLearningQuestions.length, 1);
  });
});
