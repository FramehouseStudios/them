// F2 — Page multipass unit tests (fake suppliers; no live API).

import test from "node:test";
import assert from "node:assert/strict";

import {
  FLAG_MULTIPASS,
  FLAG_REPAIR,
  STAGES,
  isPageMultipassEnabled,
  isPageMultipassRepairEnabled,
  shouldRunPageMultipass,
  multipassWalletReserveTokenMultiplier,
  critiquePageHeuristic,
  runPageMultipass,
  runTalkGeneratePageMultipass,
} from "../lib/clementine/page_multipass.js";
import {
  resolvePageMultipassStageRoute,
  resolveAllPageMultipassStageRoutes,
  STAGE_ENV_KEYS,
} from "../lib/clementine/page_multipass_routing.js";
import { runTalkGenerate } from "../lib/talk_generate.js";
import { createPageCancelledError, isPageCancelledError } from "../lib/clementine/page_abort.js";
import { beginPageWork } from "../lib/clementine/page_lane_adapter.js";
import { createPageReservationStore } from "../lib/clementine/page_cancel.js";
import { createWalletStore } from "../lib/clementine/wallet.js";
import { LANE } from "../lib/clementine/lanes.js";
import { THRESHOLDS } from "../evals/page_craft/score_page.js";

const STRONG_PAGE = `INT. EDIT BAY - NIGHT

Neon from the hallway paints the glass. MAYA (30s) feeds a frayed cassette into the deck. The same red light ticks like a pulse.

MAYA
(quiet, not looking at him)
You said the tape was insurance.

JON (40s) stays in the doorway, coat still wet.

JON
Insurance doesn't burn people. You do that part.

Maya presses eject. The cassette sticks. She risks the mechanism anyway — a hairline crack spiderwebs the shell.

MAYA
Then bill me for the cost.

The red light dies. Rain finds the window in the same rhythm as the ticking used to.
`;

const WEAK_PAGE = `INT. ROOM - DAY

They look at each other.

ALICE
I am so sad and angry right now.

BOB
This changes everything. We need to talk. Are you okay?

ALICE
I can't do this anymore. I love you.

BOB
Trust your instincts. Raise the stakes.
`;

function withEnv(vars, fn) {
  const prev = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === null || v === undefined) delete process.env[k];
    else process.env[k] = String(v);
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("[F2-multipass] flags default off", () => {
  withEnv({ [FLAG_MULTIPASS]: null, [FLAG_REPAIR]: null }, () => {
    assert.equal(isPageMultipassEnabled(), false);
    assert.equal(isPageMultipassRepairEnabled(), false);
    assert.equal(multipassWalletReserveTokenMultiplier(), 1);
  });
});

test("[F2-multipass] flag on enables detection for Page lane", () => {
  withEnv({ [FLAG_MULTIPASS]: "1" }, () => {
    assert.equal(isPageMultipassEnabled(), true);
    assert.equal(multipassWalletReserveTokenMultiplier(), 2);
    assert.equal(
      shouldRunPageMultipass({ clementine: { lane: LANE.PAGE } }),
      true
    );
    assert.equal(
      shouldRunPageMultipass({ clementine: { lane: LANE.COMPANION } }),
      false
    );
    assert.equal(
      shouldRunPageMultipass({ clementine: { lane: LANE.PAGE, pageMultipass: false } }),
      false
    );
  });
});

test("[F2-multipass] flag off → runTalkGenerate does not multipass", async () => {
  await withEnv({ [FLAG_MULTIPASS]: null }, async () => {
    let chatCalls = 0;
    const chatSupplier = {
      stream: async () => {
        throw new Error("stream should not run");
      },
      chat: async () => {
        chatCalls += 1;
        return {
          response: { ok: true, status: 200 },
          rawText: JSON.stringify({
            choices: [{ message: { content: "Single pass page" } }],
          }),
          model: "test",
          apiMode: "chat_completions",
          reasoningEffort: "low",
          fallbackUsed: false,
          usage: { inputTokens: 1, outputTokens: 5, reasoningTokens: 0, totalTokens: 6 },
        };
      },
    };
    const result = await runTalkGenerate({
      req: { clementine: { lane: LANE.PAGE, effort: "low" } },
      rid: "no-mp",
      logger: { log() {}, warn() {} },
      chatSupplier,
      useChatStreaming: false,
      system: "sys",
      chatMessages: [{ role: "user", content: "write a page" }],
      chatModelPlan: {
        model: "test",
        apiMode: "chat_completions",
        reasoningEffort: "low",
        fallbackModel: null,
      },
      chatMaxTokens: 100,
      chatStart: Date.now(),
    });
    assert.equal(result.rawReply, "Single pass page");
    assert.equal(result.multipass, undefined);
    assert.equal(chatCalls, 1);
  });
});

test("[F2-multipass] flag on runs plan→draft→critique→revise stages", async () => {
  await withEnv({ [FLAG_MULTIPASS]: "1", [FLAG_REPAIR]: null }, async () => {
    const calls = [];
    const meter = [];
    const result = await runPageMultipass({
      utterance: "She risks the tape",
      planSupplier: async () => {
        calls.push("plan");
        return { text: "Want: save tape. Obstacle: jammed deck. Cost: trust.", usage: { outputTokens: 20 } };
      },
      draftSupplier: async ({ plan }) => {
        calls.push("draft");
        assert.match(plan, /Want/);
        return { text: STRONG_PAGE, usage: { outputTokens: 120 } };
      },
      reviseSupplier: async ({ draft, critique }) => {
        calls.push("revise");
        assert.ok(draft.includes("MAYA"));
        assert.ok(critique && typeof critique.overall === "number");
        return { text: STRONG_PAGE + "\n\nMaya pockets the cracked shell.\n", usage: { outputTokens: 80 } };
      },
      walletMeter: (n, meta) => meter.push({ n, stage: meta.stage }),
      env: process.env,
    });

    assert.equal(result.multipass, true);
    assert.ok(result.page.includes("pockets the cracked shell"));
    assert.deepEqual(calls, ["plan", "draft", "revise"]);
    assert.ok(result.stages.some((s) => s.name === "critique" && s.ok));
    assert.ok(result.stages.some((s) => s.name === "repair" && s.skipped));
    assert.deepEqual(
      meter.map((m) => m.stage),
      ["draft", "revise"]
    );
    assert.equal(result.meteredOutputTokens, 200);
    assert.ok(result.scores.final?.overall > 0);
    assert.ok(STAGES.includes("plan"));
  });
});

test("[F2-multipass] abort mid-stage throws page cancelled", async () => {
  await withEnv({ [FLAG_MULTIPASS]: "1" }, async () => {
    const ac = new AbortController();
    await assert.rejects(
      async () =>
        runPageMultipass({
          signal: ac.signal,
          reservationId: "r-abort",
          planSupplier: async () => ({ text: "outline", usage: { outputTokens: 1 } }),
          draftSupplier: async ({ signal }) => {
            ac.abort("barge_in");
            if (signal?.aborted) {
              throw createPageCancelledError({
                reason: "barge_in",
                reservationId: "r-abort",
              });
            }
            return { text: STRONG_PAGE, usage: { outputTokens: 10 } };
          },
          reviseSupplier: async () => {
            throw new Error("revise should not run after abort");
          },
        }),
      (err) => isPageCancelledError(err)
    );
  });
});

test("[F2-multipass] wallet metering counts draft+revise only", async () => {
  await withEnv({ [FLAG_MULTIPASS]: "1" }, async () => {
    const meter = [];
    await runPageMultipass({
      planSupplier: async () => ({ text: "p", usage: { outputTokens: 999 } }),
      draftSupplier: async () => ({ text: WEAK_PAGE, usage: { outputTokens: 50 } }),
      critiqueSupplier: async () =>
        critiquePageHeuristic(WEAK_PAGE),
      reviseSupplier: async () => ({ text: STRONG_PAGE, usage: { outputTokens: 60 } }),
      walletMeter: (n, meta) => meter.push({ n, ...meta }),
    });
    assert.deepEqual(meter, [
      { n: 50, stage: "draft" },
      { n: 60, stage: "revise" },
    ]);
  });
});

test("[F2-multipass] beginPageWork doubles wallet reserve when flag on", () => {
  withEnv({ [FLAG_MULTIPASS]: "1" }, () => {
    const pageStore = createPageReservationStore({ now: () => 1 });
    const wallet = createWalletStore({
      now: () => 1,
      initialBalances: { u1: { page: 100 } },
    });
    const started = beginPageWork(pageStore, {
      utterance: "continue the scene",
      hints: { pageMode: true, maxOutputTokens: 400 },
      sessionId: "s1",
      userId: "u1",
      walletStore: wallet,
    });
    assert.equal(started.reserved, true);
    assert.equal(started.reservation.maxOutputTokens, 800);
    assert.ok(started.walletReservation?.reservationId);
  });
});

test("[F2-multipass] beginPageWork does not double reserve when flag off", () => {
  withEnv({ [FLAG_MULTIPASS]: null }, () => {
    const pageStore = createPageReservationStore({ now: () => 2 });
    const wallet = createWalletStore({
      now: () => 2,
      initialBalances: { u1: { page: 100 } },
    });
    const started = beginPageWork(pageStore, {
      utterance: "continue the scene",
      hints: { pageMode: true, maxOutputTokens: 400 },
      sessionId: "s1",
      userId: "u1",
      walletStore: wallet,
    });
    assert.equal(started.reservation.maxOutputTokens, 400);
  });
});

test("[F2-multipass] repair flag triggers extra revise when below PASS floor", async () => {
  await withEnv({ [FLAG_MULTIPASS]: "1", [FLAG_REPAIR]: "1" }, async () => {
    const calls = [];
    // Force low scores via injected scoreFn
    const lowScore = {
      mode: "heuristic",
      overall: 2.0,
      dimensions: Object.fromEntries(
        [
          "distinct_character_voice",
          "subtext_density",
          "continuity_want_obstacle_cost",
          "motif_image_echo",
          "anti_cliche",
          "format_playability",
        ].map((d) => [d, 2])
      ),
      notes: [],
    };
    const highScore = { ...lowScore, overall: 4.0, dimensions: Object.fromEntries(
      Object.keys(lowScore.dimensions).map((d) => [d, 4])
    ) };
    let scoreN = 0;
    const scoreFn = () => {
      scoreN += 1;
      // final score after repair should look improved
      return scoreN >= 4 ? highScore : lowScore;
    };

    const result = await runPageMultipass({
      draftSupplier: async () => {
        calls.push("draft");
        return { text: WEAK_PAGE, usage: { outputTokens: 10 } };
      },
      reviseSupplier: async ({ repair }) => {
        calls.push(repair ? "repair" : "revise");
        return {
          text: repair ? STRONG_PAGE : WEAK_PAGE,
          usage: { outputTokens: repair ? 15 : 12 },
        };
      },
      scoreFn,
      env: process.env,
    });

    assert.ok(calls.includes("repair"));
    assert.ok(result.stages.some((s) => s.name === "repair" && s.ok && !s.skipped));
    assert.ok(result.page.includes("MAYA"));
    assert.ok(THRESHOLDS.passMinOverall >= 3.5);
  });
});

test("[F2-multipass] talk_generate delegates when flag + Page lane", async () => {
  await withEnv({ [FLAG_MULTIPASS]: "1", [FLAG_REPAIR]: null }, async () => {
    const commits = [];
    const prompts = [];
    const chatSupplier = {
      stream: async () => {
        throw new Error("stream must not run in multipass");
      },
      chat: async ({ messages }) => {
        const last = messages[messages.length - 1]?.content || "";
        prompts.push(last);
        let content = STRONG_PAGE;
        if (/outline|PLAN|beat\/intent/i.test(last) || /Stage=plan/i.test(messages[0]?.content || "")) {
          content = "1. Want tape\n2. Obstacle jam\n3. Cost trust\n4. Motif red light";
        } else if (/Revise the Fountain/i.test(last)) {
          content = STRONG_PAGE + "\nMaya stands.\n";
        }
        return {
          response: { ok: true, status: 200 },
          rawText: JSON.stringify({
            choices: [{ message: { content } }],
          }),
          model: "test-mp",
          apiMode: "chat_completions",
          reasoningEffort: "low",
          fallbackUsed: false,
          usage: { inputTokens: 8, outputTokens: 40, reasoningTokens: 0, totalTokens: 48 },
        };
      },
    };

    const req = {
      clementine: {
        lane: LANE.PAGE,
        effort: "low",
        pageMultipass: true,
        commitWallet: (n) => commits.push(n),
      },
    };

    const result = await runTalkGenerate({
      req,
      rid: "mp1",
      logger: { log() {}, warn() {} },
      chatSupplier,
      useChatStreaming: true, // should still skip stream for multipass
      system: "You write Fountain.",
      talkGenerationTranscript: "risk the tape",
      chatMessages: [{ role: "user", content: "risk the tape" }],
      chatModelPlan: {
        model: "test-mp",
        apiMode: "chat_completions",
        reasoningEffort: "low",
        fallbackModel: null,
      },
      chatMaxTokens: 500,
      chatStart: Date.now(),
    });

    assert.equal(result.multipass?.multipass, true);
    assert.ok(result.rawReply.includes("MAYA"));
    assert.equal(result.streamChatUsed, false);
    // plan + draft + revise = 3 chats; critique is heuristic
    assert.equal(prompts.length, 3);
    // draft+revise metered (40+40); plan usage reported but not committed in walletMeter path
    // runTalkGeneratePageMultipass meters via walletMeter from stage output tokens
    assert.ok(commits.length === 1);
    assert.equal(commits[0], 80);
    assert.ok(req.clementine.multipass?.stages?.length >= 4);
  });
});

test("[F2-multipass] runTalkGeneratePageMultipass export works", async () => {
  assert.equal(typeof runTalkGeneratePageMultipass, "function");
});

test("[F3-routing] defaults: cheap plan/critique, structural craft when Muse off", () => {
  withEnv(
    {
      CHAT_MODEL_FAST: "gpt-4o-mini",
      CHAT_MODEL_STRUCTURAL: "gpt-5.6-sol",
      CHAT_STRUCTURAL_REASONING_EFFORT: "low",
      CHAT_SCREENPLAY_REPAIR_REASONING_EFFORT: "medium",
      CLEMENTINE_MUSE_ENABLED: "0",
      MODEL_API_KEY: "",
      MUSE_API_KEY: "",
      PAGE_MULTIPASS_PLAN_MODEL: null,
      PAGE_MULTIPASS_DRAFT_MODEL: null,
      PAGE_MULTIPASS_PLAN_EFFORT: null,
      PAGE_MULTIPASS_DRAFT_EFFORT: null,
    },
    () => {
      delete process.env.MODEL_API_KEY;
      delete process.env.MUSE_API_KEY;
      const plan = resolvePageMultipassStageRoute("plan", { museEnabled: false });
      const critique = resolvePageMultipassStageRoute("critique", { museEnabled: false });
      const draft = resolvePageMultipassStageRoute("draft", { museEnabled: false });
      const revise = resolvePageMultipassStageRoute("revise", { museEnabled: false });
      const repair = resolvePageMultipassStageRoute("repair", { museEnabled: false });
      assert.equal(plan.model, "gpt-4o-mini");
      assert.equal(plan.effort, "low");
      assert.equal(plan.family, "cheap");
      assert.equal(plan.preferProvider, "");
      assert.equal(critique.model, "gpt-4o-mini");
      assert.equal(critique.family, "cheap");
      assert.equal(draft.model, "gpt-5.6-sol");
      assert.equal(draft.effort, "medium"); // bumped from structural "low" for multipass craft
      assert.equal(draft.apiMode, "responses");
      assert.equal(draft.family, "craft");
      assert.equal(revise.model, "gpt-5.6-sol");
      assert.equal(revise.effort, "medium");
      assert.equal(repair.effort, "medium");
      assert.ok(STAGE_ENV_KEYS.plan.model.includes("PLAN_MODEL"));
    }
  );
});

test("[F3-routing] Muse on: plan/critique prefer OpenAI cheap; draft/revise Muse medium", () => {
  withEnv(
    {
      CHAT_MODEL_FAST: "gpt-4o-mini",
      MUSE_MODEL: "muse-spark-1.2",
      CLEMENTINE_MUSE_ENABLED: "1",
      MODEL_API_KEY: "k",
    },
    () => {
      const routes = resolveAllPageMultipassStageRoutes({ museEnabled: true });
      assert.equal(routes.plan.preferProvider, "openai");
      assert.equal(routes.plan.model, "gpt-4o-mini");
      assert.equal(routes.plan.effort, "low");
      assert.equal(routes.critique.preferProvider, "openai");
      assert.equal(routes.draft.preferProvider, "");
      assert.equal(routes.draft.model, "muse-spark-1.2");
      assert.equal(routes.draft.effort, "medium");
      assert.equal(routes.draft.apiMode, "responses");
      assert.equal(routes.revise.model, "muse-spark-1.2");
      assert.equal(routes.revise.effort, "medium");
      assert.equal(routes.repair.effort, "medium");
    }
  );
});

test("[F3-routing] env overrides win for model + effort", () => {
  withEnv(
    {
      PAGE_MULTIPASS_PLAN_MODEL: "plan-cheap-x",
      PAGE_MULTIPASS_PLAN_EFFORT: "minimal",
      PAGE_MULTIPASS_DRAFT_MODEL: "draft-best-x",
      PAGE_MULTIPASS_DRAFT_EFFORT: "high",
      PAGE_MULTIPASS_REVISE_MODEL: "revise-best-x",
      PAGE_MULTIPASS_REVISE_EFFORT: "high",
    },
    () => {
      const plan = resolvePageMultipassStageRoute("plan", { museEnabled: false });
      const draft = resolvePageMultipassStageRoute("draft", { museEnabled: false });
      const revise = resolvePageMultipassStageRoute("revise", { museEnabled: false });
      assert.equal(plan.model, "plan-cheap-x");
      assert.equal(plan.effort, "minimal");
      assert.equal(draft.model, "draft-best-x");
      assert.equal(draft.effort, "high");
      assert.equal(revise.model, "revise-best-x");
      assert.equal(revise.effort, "high");
    }
  );
});

test("[F3-routing] talk_generate multipass requests per-stage model/effort", async () => {
  await withEnv(
    {
      [FLAG_MULTIPASS]: "1",
      [FLAG_REPAIR]: null,
      CHAT_MODEL_FAST: "gpt-4o-mini",
      CHAT_MODEL_STRUCTURAL: "gpt-5.6-sol",
      PAGE_MULTIPASS_PLAN_MODEL: "plan-test-model",
      PAGE_MULTIPASS_PLAN_EFFORT: "low",
      PAGE_MULTIPASS_DRAFT_MODEL: "draft-test-model",
      PAGE_MULTIPASS_DRAFT_EFFORT: "medium",
      PAGE_MULTIPASS_REVISE_MODEL: "revise-test-model",
      PAGE_MULTIPASS_REVISE_EFFORT: "medium",
      CLEMENTINE_MUSE_ENABLED: "0",
    },
    async () => {
      const requests = [];
      const chatSupplier = {
        stream: async () => {
          throw new Error("no stream");
        },
        chat: async (args) => {
          requests.push({
            stage: args.multipassStage,
            model: args.model,
            effort: args.reasoningEffort || args.effort,
            preferProvider: args.preferProvider || "",
            apiMode: args.apiMode,
          });
          const last = args.messages[args.messages.length - 1]?.content || "";
          let content = STRONG_PAGE;
          if (args.multipassStage === "plan" || /outline|beat\/intent/i.test(last)) {
            content = "1. Want\n2. Obstacle\n3. Cost";
          } else if (args.multipassStage === "revise" || /Revise the Fountain/i.test(last)) {
            content = STRONG_PAGE + "\nMaya stands.\n";
          }
          return {
            response: { ok: true, status: 200 },
            rawText: JSON.stringify({
              choices: [{ message: { content } }],
            }),
            model: args.model,
            apiMode: args.apiMode || "chat_completions",
            reasoningEffort: args.reasoningEffort,
            fallbackUsed: false,
            usage: { inputTokens: 2, outputTokens: 30, reasoningTokens: 0, totalTokens: 32 },
          };
        },
      };

      const result = await runTalkGeneratePageMultipass({
        req: {
          clementine: {
            lane: LANE.PAGE,
            effort: "low",
            pageMultipass: true,
            commitWallet: () => {},
          },
        },
        rid: "f3-route",
        logger: { log() {}, warn() {} },
        chatSupplier,
        system: "sys",
        talkGenerationTranscript: "risk the tape",
        chatMessages: [{ role: "user", content: "risk the tape" }],
        chatModelPlan: {
          model: "ignored-turn-model",
          apiMode: "chat_completions",
          reasoningEffort: "low",
          tier: "fast",
        },
        chatMaxTokens: 400,
        chatStart: Date.now(),
        env: process.env,
      });

      assert.equal(result.multipass?.multipass, true);
      assert.deepEqual(
        requests.map((r) => r.stage),
        ["plan", "draft", "revise"]
      );
      assert.equal(requests[0].model, "plan-test-model");
      assert.equal(requests[0].effort, "low");
      assert.equal(requests[1].model, "draft-test-model");
      assert.equal(requests[1].effort, "medium");
      assert.equal(requests[2].model, "revise-test-model");
      assert.equal(requests[2].effort, "medium");
      assert.equal(result.effectiveChatModel, "draft-test-model");
      assert.ok(Array.isArray(result.multipass?.routing));
      assert.deepEqual(
        result.multipass.routing.map((r) => [r.stage, r.model, r.effort]),
        [
          ["plan", "plan-test-model", "low"],
          ["draft", "draft-test-model", "medium"],
          ["revise", "revise-test-model", "medium"],
        ]
      );
    }
  );
});

test("[F3-routing] Muse preferProvider openai on plan when Muse enabled", async () => {
  await withEnv(
    {
      [FLAG_MULTIPASS]: "1",
      CLEMENTINE_MUSE_ENABLED: "1",
      MODEL_API_KEY: "test-key",
      CHAT_MODEL_FAST: "gpt-4o-mini",
      MUSE_MODEL: "muse-spark-1.2",
    },
    async () => {
      const requests = [];
      const chatSupplier = {
        chat: async (args) => {
          requests.push({
            stage: args.multipassStage,
            model: args.model,
            effort: args.reasoningEffort,
            preferProvider: args.preferProvider || "",
          });
          const content =
            args.multipassStage === "plan"
              ? "outline"
              : args.multipassStage === "revise"
                ? STRONG_PAGE + "\nRev.\n"
                : STRONG_PAGE;
          return {
            response: { ok: true, status: 200 },
            rawText: JSON.stringify({ choices: [{ message: { content } }] }),
            model: args.model,
            apiMode: "responses",
            reasoningEffort: args.reasoningEffort,
            usage: { inputTokens: 1, outputTokens: 20, reasoningTokens: 0, totalTokens: 21 },
          };
        },
      };
      await runTalkGeneratePageMultipass({
        req: { clementine: { lane: LANE.PAGE, pageMultipass: true, commitWallet() {} } },
        rid: "f3-muse",
        logger: { log() {}, warn() {} },
        chatSupplier,
        system: "sys",
        talkGenerationTranscript: "page",
        chatMessages: [{ role: "user", content: "page" }],
        chatModelPlan: { model: "x", apiMode: "responses", reasoningEffort: "low" },
        chatMaxTokens: 200,
        chatStart: Date.now(),
        env: process.env,
      });
      const planReq = requests.find((r) => r.stage === "plan");
      const draftReq = requests.find((r) => r.stage === "draft");
      assert.equal(planReq.preferProvider, "openai");
      assert.equal(planReq.model, "gpt-4o-mini");
      assert.equal(draftReq.preferProvider, "");
      assert.equal(draftReq.model, "muse-spark-1.2");
      assert.equal(draftReq.effort, "medium");
    }
  );
});
