import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { analyzeScreenplayWriteInstruction as analyze } from '../lib/screenplay_write_instruction.js';
import { inferScreenplayTask, buildModelPrompt } from '../lib/prompt_assembly.js';
import { fitSystemPromptForTurnLatency } from '../lib/system_prompt_trim.js';
import { classifyIntent, INTENT } from '../lib/clementine/intents.js';
import { LANE } from '../lib/clementine/lanes.js';
import { beginPageWork, createPageLaneTalkAdapter } from '../lib/clementine/page_lane_adapter.js';
import { createPageReservationStore } from '../lib/clementine/page_cancel.js';
import { createWalletStore } from '../lib/clementine/wallet.js';
import { enforceScreenplayWriteRefusal, resolveScreenplayTargetFromRequest } from '../lib/screenplay_turn_target.js';

const fixtures = JSON.parse(fs.readFileSync(new URL('./fixtures/screenplay_write_refusal.json', import.meta.url)));
const staleHints = { pageMode: true, continuePage: true, intent: INTENT.PAGE_REWRITE };

test('shared Swift/JS refusal cases guard task, target and actual Page reservation', () => {
  for (const fixture of fixtures) {
    const text = fixture.text;
    const analysis = analyze(text);
    assert.equal(analysis.refusesPageWrite, fixture.refused, text);
    assert.equal(analysis.hadRefusal, fixture.hadRefusal, text);
    if (!fixture.refused) continue;
    assert.equal(classifyIntent(text, staleHints), INTENT.ADVISE, text);
    assert.equal(inferScreenplayTask(text).intent, 'story_discussion', text);
    assert.equal(resolveScreenplayTargetFromRequest({
      client_transcript: text, screenplay_target: 'page',
      screenplay_generation_transcript: 'Rewrite the last scene.', screenplay_target_pages: 5,
    }), 'voice_pin', text);
    const pages = createPageReservationStore();
    const wallet = createWalletStore({ initialBalances: { writer: { page: 2 } } });
    const before = wallet.getBalance('writer');
    const started = beginPageWork(pages, {
      utterance: text, hints: staleHints, userId: 'writer', sessionId: 'session', walletStore: wallet,
    });
    assert.equal(started.reserved, false, text);
    assert.equal(pages.size(), 0, text);
    assert.deepEqual(wallet.getBalance('writer'), before, text);
  }
});

test('a separate positive command remains usable without selecting the refused operation', () => {
  for (const [text, task, laneIntent] of [
    ['Do not rewrite the scene; continue from here instead.', 'continue_script', INTENT.PAGE_CONTINUE],
    ["Don't write act one, but rewrite act two.", 'rewrite_scene', INTENT.PAGE_REWRITE],
  ]) {
    assert.equal(inferScreenplayTask(text).intent, task, text);
    assert.equal(classifyIntent(text, staleHints), laneIntent, text);
    assert.equal(resolveScreenplayTargetFromRequest({ client_transcript: text, screenplay_project_id: 'current' }), 'page', text);
    assert.equal(analyze(text).routingText.toLowerCase().includes('do not'), false);
  }
});

test('refusal survives legacy intent wrapping and prompt trimming without changing writer words', () => {
  const text = 'Do not rewrite this scene. Just discuss the ending.';
  for (const input of [text, `Intent: Produce screenplay-ready rewritten material.\n\nWriter request: ${text}`]) {
    assert.equal(analyze(input).refusesPageWrite, true);
    assert.equal(inferScreenplayTask(input).intent, 'story_discussion');
  }
  const prompt = buildModelPrompt({ persona: 'p'.repeat(8000), screenplayTask: inferScreenplayTask(text), userInput: text });
  assert.ok(prompt.includes(text), 'original writer words, not filtered routing text, reach the model');
  const result = fitSystemPromptForTurnLatency(prompt, { fastMaxChars: 1600 });
  const trimmed = typeof result === 'string' ? result : result.prompt;
  assert.match(trimmed, /writer refused page changes/);
  assert.doesNotMatch(trimmed, /Fountain pages first/);
});

test('authoritative ASR refusal cancels the existing Page hold before generation, not the conversation', async () => {
  const wallet = createWalletStore({ initialBalances: { writer: { page: 5 } } });
  const pages = createPageReservationStore({ walletStore: wallet });
  const before = wallet.getBalance('writer');
  const req = { body: { screenplay_target: 'page', session_id: 'session', max_output_tokens: 400, screenplay_generation_transcript: 'Rewrite the last scene.' }, authUser: { id: 'writer' } };
  const res = new EventEmitter();
  const headers = new Map();
  Object.assign(res, {
    statusCode: 200, headersSent: false,
    setHeader: (key, value) => headers.set(key, value),
    removeHeader: key => headers.delete(key), getHeader: key => headers.get(key),
  });
  let reservationId;
  const handler = createPageLaneTalkAdapter({ pageReservationStore: pages, walletStore: wallet, logger: null,
    handleTalkRequest: async (request) => {
      reservationId = request.clementine.reservationId;
      assert.ok(reservationId, 'audio starts with a provisional Page hold');
      assert.equal(wallet.getBalance('writer').pageTurnsLeft, 5, 'the real server generation budget is not known before ASR');
      request.clementine.prepareGenerationBudget(400);
      assert.equal(wallet.getBalance('writer').pageTurnsLeft, 4, 'a prepared hold must still be refunded by refusal');
      const originalSignal = request.clementine.abortSignal;
      const meta = { screenplayTarget: 'page' };
      const words = 'Do not rewrite my scene. Just discuss it.';
      assert.equal(enforceScreenplayWriteRefusal(request, meta, words), true);
      assert.equal(meta.screenplayTarget, 'voice_pin');
      assert.equal(request.body.client_transcript, words);
      assert.equal(request.clementine.lane, LANE.COMPANION);
      assert.equal(originalSignal.aborted, true);
      assert.equal(request.clementine.abortSignal, null);
      assert.equal(request.clementine.commitWallet, null);
      assert.equal(request.clementine.proceed().ok, true, 'nonwriting reply can still run');
      assert.equal(headers.has('x-clementine-page-reservation'), false);
      res.emit('finish');
    },
  });
  await handler(req, res);
  assert.equal(pages.get(reservationId).status, 'cancelled');
  assert.equal(pages.get(reservationId).cancelReason, 'writer_refused');
  assert.deepEqual(wallet.getBalance('writer'), before);
});
