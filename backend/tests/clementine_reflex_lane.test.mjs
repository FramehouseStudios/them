import test from "node:test";
import assert from "node:assert/strict";

import { classifyReflex } from "../lib/clementine/reflex_classifier.js";
import {
  TEMPLATE_BANK,
  TEMPLATE_IDS,
  renderReflexTemplate,
  interpolate,
  listTemplateIds,
} from "../lib/clementine/reflex_templates.js";
import { tryReflexReply } from "../lib/clementine/reflex_lane.js";
import { INTENT, classifyIntent } from "../lib/clementine/intents.js";
import { LANE, laneForIntent } from "../lib/clementine/lanes.js";
import {
  tryTalkEdgeReflex,
  sendReflexReply,
  isReflexEligibleLane,
} from "../lib/clementine/talk_edge_adapter.js";
import {
  createPageLaneTalkAdapter,
  resolveTalkLane,
} from "../lib/clementine/page_lane_adapter.js";
import { createPageReservationStore } from "../lib/clementine/page_cancel.js";
import { createWalletStore } from "../lib/clementine/wallet.js";

test("[reflex] greetings classified and handled without Spark", () => {
  for (const text of ["hey", "hello", "gm", "what's up?", "hi there"]) {
    const c = classifyReflex(text);
    assert.equal(c.isReflex, true, text);
    assert.ok(c.templateId, text);
    assert.ok(c.confidence >= 0.9, text);
    const reply = tryReflexReply({ text, voiceSpecHints: { seed: text } });
    assert.equal(reply.handled, true, text);
    assert.equal(reply.lane, "reflex");
    assert.ok(String(reply.text).trim().length > 0, text);
    assert.equal(/TPM|token|wallet|Spark|muse/i.test(reply.text), false, text);
  }
});

test("[reflex] thanks / check-in / ack / silence handled", () => {
  const cases = [
    ["thanks", "thanks"],
    ["how are you?", "check_in"],
    ["got it", "ack"],
    ["never mind", "silence_soft"],
    ["", "silence_soft"],
  ];
  for (const [text, templateId] of cases) {
    const c = classifyReflex(text);
    assert.equal(c.isReflex, true, text);
    assert.equal(c.templateId, templateId, text);
    const reply = tryReflexReply({ text, voiceSpecHints: { seed: 1 } });
    assert.equal(reply.handled, true, text);
    assert.ok(reply.text.length > 0);
  }
});

test("[reflex] complex asks are NOT handled", () => {
  const hard = [
    "write the next beat where she leaves before he answers",
    "help me plan act two conflict and the midpoint twist",
    "should I cut the monologue or keep it for character?",
    "remember when we talked about my sister's wedding last month and what I decided?",
    "think hard about whether the antagonist knows the secret",
  ];
  for (const text of hard) {
    const c = classifyReflex(text);
    assert.equal(c.isReflex, false, text);
    assert.equal(tryReflexReply({ text }).handled, false, text);
  }
});

test("[reflex] templates non-empty; interpolation works; no TPM", () => {
  assert.ok(TEMPLATE_IDS.length >= 5);
  for (const id of listTemplateIds()) {
    const variants = TEMPLATE_BANK[id];
    assert.ok(Array.isArray(variants) && variants.length > 0, id);
    for (const v of variants) {
      assert.ok(String(v).trim().length > 0, id);
      assert.equal(/TPM|tokens?\s*per|milliturn/i.test(v), false, id);
    }
    const rendered = renderReflexTemplate(id, {
      seed: id,
      vars: { value: "Mochi", label: "dog", name: "Mochi" },
    });
    assert.ok(rendered?.text, id);
    assert.ok(rendered.text.trim().length > 0, id);
  }
  assert.equal(interpolate("Hi {{name}}.", { name: "Sam" }), "Hi Sam.");
  assert.equal(interpolate("x {{missing}} y", {}), "x y");
});

test("[reflex] knownFacts light probe", () => {
  const facts = [{ key: "dog_name", label: "dog", value: "Mochi" }];
  const c = classifyReflex("what's my dog's name?", { knownFacts: facts });
  assert.equal(c.isReflex, true);
  assert.equal(c.templateId, "known_fact");
  const reply = tryReflexReply({
    text: "what's my dog's name?",
    knownFacts: facts,
    voiceSpecHints: { seed: "fact" },
  });
  assert.equal(reply.handled, true);
  assert.match(reply.text, /Mochi/);
});

test("[reflex] intent map stays consistent: greeting/check-in → Reflex", () => {
  assert.equal(classifyIntent("hey there"), INTENT.GREETING);
  assert.equal(classifyIntent("how are you doing?"), INTENT.CHECK_IN);
  assert.equal(laneForIntent(INTENT.GREETING).lane, LANE.REFLEX);
  assert.equal(laneForIntent(INTENT.CHECK_IN).lane, LANE.REFLEX);
  assert.equal(laneForIntent(INTENT.GREETING).usesSpark, false);
  assert.equal(resolveTalkLane("hello").lane, LANE.REFLEX);
});

test("[reflex] talk-edge eligible only Reflex/Companion", () => {
  assert.equal(isReflexEligibleLane(LANE.REFLEX), true);
  assert.equal(isReflexEligibleLane(LANE.COMPANION), true);
  assert.equal(isReflexEligibleLane(LANE.PAGE), false);
  assert.equal(isReflexEligibleLane(LANE.DEEP), false);

  const hit = tryTalkEdgeReflex({
    text: "hey",
    laneInfo: resolveTalkLane("hey"),
  });
  assert.ok(hit?.handled);
  assert.equal(hit.lane, "reflex");

  const miss = tryTalkEdgeReflex({
    text: "hey",
    laneInfo: { lane: LANE.PAGE, walletMeter: "page", intent: INTENT.PAGE_EDIT },
  });
  assert.equal(miss, null);
});

test("[reflex] page_lane_adapter short-circuits before wallet/Spark", async () => {
  const wallet = createWalletStore({
    initialBalances: { "u-reflex": { companion: 50, page: 50 } },
  });
  const pageStore = createPageReservationStore({ walletStore: wallet, now: () => 1 });

  let talkHandlerCalls = 0;
  const wrapped = createPageLaneTalkAdapter({
    handleTalkRequest: async () => {
      talkHandlerCalls += 1;
      throw new Error("Spark path should not run for Reflex greetings");
    },
    pageReservationStore: pageStore,
    walletStore: wallet,
    logger: { log() {}, warn() {} },
  });

  const headers = {};
  let statusCode = 0;
  let body = null;
  const req = {
    body: { text: "hey there", knownFacts: [] },
    authUser: { id: "u-reflex" },
    get: () => "",
    headers: {},
    ip: "127.0.0.1",
  };
  const res = {
    setHeader(k, v) {
      headers[String(k).toLowerCase()] = String(v);
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return payload;
    },
  };

  await wrapped(req, res);

  assert.equal(talkHandlerCalls, 0);
  assert.equal(statusCode, 200);
  assert.equal(body.ok, true);
  assert.equal(body.lane, "reflex");
  assert.equal(body.spark, false);
  assert.ok(String(body.reply).trim().length > 0);
  assert.equal(/TPM/i.test(JSON.stringify(body)), false);
  assert.equal(headers["x-clementine-reflex"], "1");
  assert.equal(pageStore.size(), 0);
  assert.equal(req.clementine.reflex.handled, true);
});

test("[reflex] complex ask still reaches talk_handler (no short-circuit)", async () => {
  const pageStore = createPageReservationStore({ now: () => 2 });
  let talkHandlerCalls = 0;
  const wrapped = createPageLaneTalkAdapter({
    handleTalkRequest: async (req, res) => {
      talkHandlerCalls += 1;
      return res.status(200).json({ ok: true, reply: "from-spark-stub" });
    },
    pageReservationStore: pageStore,
    logger: { log() {}, warn() {} },
  });

  let body = null;
  const req = {
    body: { text: "help me plan act two conflict carefully" },
    get: () => "",
    headers: {},
    ip: "127.0.0.1",
  };
  const res = {
    setHeader() {},
    status() {
      return this;
    },
    json(payload) {
      body = payload;
      return payload;
    },
  };

  await wrapped(req, res);
  assert.equal(talkHandlerCalls, 1);
  assert.equal(body.reply, "from-spark-stub");
});

test("[reflex] sendReflexReply shape has no TPM fields", () => {
  let payload = null;
  const res = {
    setHeader() {},
    status() {
      return this;
    },
    json(p) {
      payload = p;
      return p;
    },
  };
  sendReflexReply(res, {
    reflex: { text: "Hey.", templateId: "greeting", confidence: 0.95, lane: "reflex" },
    laneInfo: { intent: INTENT.GREETING, lane: LANE.REFLEX },
  });
  assert.equal(payload.ok, true);
  assert.equal(payload.spark, false);
  assert.equal(payload.clementine.walletMeter, "none");
  assert.equal("tpm" in payload, false);
  assert.equal("tokens" in payload, false);
});

test("[reflex] a greeting that opens a fresh conversation goes to the model so the scene pitch can fire", () => {
  const laneInfo = laneForIntent(INTENT.GREETING);
  for (const text of ["hello", "hi clementine", "hey there", "how are you"]) {
    assert.equal(tryTalkEdgeReflex({ text, laneInfo, freshConversation: true }), null, text);
    const later = tryTalkEdgeReflex({ text, laneInfo, freshConversation: false });
    assert.equal(later?.handled, true, `${text} still uses Reflex once the conversation has history`);
  }
  // Non-greeting templates are unaffected by freshness.
  const thanks = tryTalkEdgeReflex({ text: "thanks", laneInfo: laneForIntent(INTENT.UNKNOWN), freshConversation: true });
  assert.equal(thanks?.handled, true);
});

test("[reflex] conversation freshness comes from the explicit index, else from the client prompt", async () => {
  const { peekConversationFreshness, RECENT_CONVERSATION_MARKER } = await import("../lib/clementine/talk_edge_adapter.js");
  assert.equal(peekConversationFreshness({ body: { conversation_turn_index: "0" } }), true);
  assert.equal(peekConversationFreshness({ body: { conversation_turn_index: 0 } }), true);
  assert.equal(peekConversationFreshness({ body: { conversation_turn_index: "3" } }), false);
  assert.equal(peekConversationFreshness({ body: { system_prompt: "You are io.them.\nSCENE PITCH (standing collaborator rule):\n- This is the first exchange of the session." } }), true);
  assert.equal(peekConversationFreshness({ body: { system_prompt: `You are io.them.\n${RECENT_CONVERSATION_MARKER}last 2 turns - use for continuity):\nUSER: hi` } }), false);
  assert.equal(peekConversationFreshness({ body: { system_prompt: "  " } }), false, "no prompt, no evidence → keep Reflex");
  assert.equal(peekConversationFreshness({ body: {} }), false);
  assert.equal(peekConversationFreshness(null), false);
  assert.equal(peekConversationFreshness({ body: { conversation_turn_index: "abc", system_prompt: "fresh prompt" } }), true, "junk index falls back to the prompt");
});
