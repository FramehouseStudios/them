import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { createPageLaneTalkAdapter } from '../lib/clementine/page_lane_adapter.js';
import { createPageReservationStore } from '../lib/clementine/page_cancel.js';
import { createWalletStore } from '../lib/clementine/wallet.js';
import { reconcileScreenplayTranscript } from '../lib/screenplay_turn_target.js';

function response() {
  const res = new EventEmitter();
  const headers = new Map();
  return Object.assign(res, {
    statusCode: 200, headersSent: false, writableEnded: false, destroyed: false,
    setHeader: (key, value) => headers.set(key, value),
    getHeader: key => headers.get(key), removeHeader: key => headers.delete(key),
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; this.writableEnded = true; this.emit('finish'); return this; },
  });
}

for (const [label, transcript, expectedLane, pageTurns] of [
  ['writing with a funded wallet', 'Write the opening scene about two astronauts.', 'Page', 2],
  ['writing with an empty wallet', 'Write the opening scene about two astronauts.', null, 0],
  ['a spoken greeting', 'hello', 'Reflex', 2],
]) {
  test(`raw audio defers lane preparation until actual ASR: ${label}`, async () => {
    const wallet = createWalletStore({ initialBalances: { writer: { page: pageTurns } } });
    const pages = createPageReservationStore({ walletStore: wallet });
    const req = { body: { screenplay_project_id: 'project', max_output_tokens: 400 }, file: {}, authUser: { id: 'writer' } };
    const res = response();
    let handlerCalls = 0;
    const adapter = createPageLaneTalkAdapter({ walletStore: wallet, pageReservationStore: pages, logger: null,
      handleTalkRequest: async () => {
        handlerCalls++;
        assert.equal(pages.size(), 0, 'no reservation based on unknown audio');
        assert.equal(req.clementine.reflex, undefined, 'unknown audio is not a silence reply');
        const resolve = req.clementine.resolveTranscript;
        const page = await reconcileScreenplayTranscript(req, res, { screenplayProjectId: 'project' }, transcript);
        await resolve(transcript); // A duplicate notification must not reserve twice.
        if (pageTurns === 0) {
          assert.throws(() => req.clementine.prepareGenerationBudget(400), error => error.status === 402);
          res.status(402).json({ error: 'wallet_empty' });
          assert.equal(wallet.getBalance('writer').pageTurnsLeft, 0);
          return;
        }
        assert.equal(req.clementine.lane, expectedLane);
        assert.equal(page, expectedLane === 'Page');
        if (page) {
          assert.equal(pages.size(), 1);
          assert.equal(wallet.getBalance('writer').pageTurnsLeft, 2, 'ASR alone does not set a client-owned hold');
          req.clementine.prepareGenerationBudget(400);
          assert.equal(req.clementine.proceed().ok, true);
          assert.equal(wallet.getBalance('writer').pageTurnsLeft, 1);
          const reservation = req.clementine.reservationId;
          pages.cancel(reservation, { reason: 'manual_typing' });
          assert.equal(req.clementine.abortSignal.aborted, true);
          assert.equal(req.clementine.proceed().ok, false);
          assert.equal(wallet.getBalance('writer').pageTurnsLeft, 2);
        } else {
          assert.equal(req.clementine.reflex.templateId, 'greeting');
          assert.equal(pages.size(), 0);
          assert.equal(wallet.getBalance('writer').pageTurnsLeft, 2);
        }
        res.emit('finish');
      },
    });
    await adapter(req, res);
    assert.equal(handlerCalls, 1, 'ASR lane preparation must not rerun the speech handler');
  });
}

test('a disconnected raw recording cannot create a late Page reservation', async () => {
  const pages = createPageReservationStore();
  const res = response();
  const req = { body: { screenplay_target: 'page' }, file: {} };
  await createPageLaneTalkAdapter({ pageReservationStore: pages, logger: null,
    handleTalkRequest: async () => {
      res.destroyed = true;
      await req.clementine.resolveTranscript('Write the opening scene.');
      assert.equal(pages.size(), 0);
    },
  })(req, res);
});
