import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { createWalletStore } from '../lib/clementine/wallet.js';
import { createMemoryWalletPersistence } from '../lib/clementine/wallet_persistence.js';
import { createPageReservationStore } from '../lib/clementine/page_cancel.js';
import { createPageLaneTalkAdapter } from '../lib/clementine/page_lane_adapter.js';
import { runTalkGenerate } from '../lib/talk_generate.js';
import { createTalkIdempotencyHelpers } from '../lib/talk_state.js';
import { multipassWalletReserveTokenMultiplier } from '../lib/clementine/page_multipass.js';

function response() {
  const res = new EventEmitter(), headers = new Map();
  return Object.assign(res, { statusCode: 200, headersSent: false,
    setHeader: (key, value) => headers.set(key, value), getHeader: key => headers.get(key),
    removeHeader: key => headers.delete(key), status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; this.emit('finish'); return this; },
  });
}

test('a funded Page uses the server cap, not an inflated client hold or truncated output', async () => {
  const wallet = createWalletStore({ initialBalances: { writer: { page: 5 } } });
  const pages = createPageReservationStore({ walletStore: wallet });
  const req = { authUser: { id: 'writer' }, body: {
    client_transcript: 'Write the opening scene.', screenplay_target: 'page', max_output_tokens: 99999999,
  } };
  const res = response();
  let providerCalls = 0, reservationID;
  await createPageLaneTalkAdapter({ pageReservationStore: pages, walletStore: wallet, logger: null,
    handleTalkRequest: async () => {
      reservationID = req.clementine.walletReservationId;
      assert.equal(wallet.getBalance('writer').pageTurnsLeft, 5, 'client fields cannot set the funded hold');
      await runTalkGenerate({ req, rid: 'funded', chatMaxTokens: 900, chatModelPlan: { model: 'fixture' },
        logger: null, chatSupplier: { chat: async ({ maxTokens }) => {
          providerCalls++;
          assert.equal(maxTokens, 900, 'do not truncate the story to fit a client budget');
          assert.equal(wallet.getBalance('writer').pageTurnsLeft, 2.75);
          req.clementine.prepareGenerationBudget(900);
          assert.equal(wallet.getBalance('writer').pageTurnsLeft, 2.75, 'same-budget notification cannot double-hold');
          assert.equal(req.clementine.walletReservationId, reservationID);
          return { response: { ok: true, status: 200 }, rawText: JSON.stringify({ choices: [{ message: { content: 'INT. LAB - NIGHT\n\nA light fails.' } }] }), usage: { outputTokens: 800 } };
        } },
      });
      res.emit('finish');
      res.emit('finish');
    },
  })(req, res);
  assert.equal(providerCalls, 1);
  assert.equal(wallet.getBalance('writer').pageTurnsLeft, 3, 'settle the actual800 tokens once, refund unused cap');
  assert.equal(wallet.getReservation(reservationID).settledTurns, 2);
});

test('wallet budget top-ups are atomic, monotonic, cancellation-safe and cannot reopen settled work', () => {
  const wallet = createWalletStore({ initialBalances: { writer: { page: 4 } } });
  const hold = wallet.reserve({ ownerId: 'writer', lane: 'page', maxOutputTokens: 0 });
  wallet.ensureReservationBudget(hold.reservationId, 400);
  const before = wallet.getReservation(hold.reservationId);
  assert.throws(() => wallet.ensureReservationBudget(hold.reservationId, 2000), error => error.code === 'wallet_empty');
  assert.deepEqual(wallet.getReservation(hold.reservationId), before);
  assert.equal(wallet.getBalance('writer').pageTurnsLeft, 3);
  wallet.ensureReservationBudget(hold.reservationId, 400);
  wallet.ensureReservationBudget(hold.reservationId, 200);
  assert.deepEqual(wallet.getReservation(hold.reservationId), before);
  for (const invalid of [0, -1, NaN, Infinity]) assert.throws(() => wallet.ensureReservationBudget(hold.reservationId, invalid));
  wallet.release(hold.reservationId);
  assert.equal(wallet.getBalance('writer').pageTurnsLeft, 4);
  assert.throws(() => wallet.ensureReservationBudget(hold.reservationId, 400), error => error.code === 'wallet_reservation_unavailable');
});

test('Page adapter exposes durable settlement before finish and finish cannot double debit', async () => {
  const persistence = createMemoryWalletPersistence();
  await persistence.putBalance({ ownerId: 'durable-writer', companionMilliturns: 0,
    pageMilliturns: 10_000, grantedCompanionMilliturns: 0, grantedPageMilliturns: 10_000 });
  const wallet = createWalletStore({ persistence });
  await wallet.hydrate();
  const pages = createPageReservationStore({ walletStore: wallet });
  const req = { authUser: { id: 'durable-writer' }, body: {
    client_transcript: 'Write the opening scene.', screenplay_target: 'page',
  } };
  const res = response();
  await createPageLaneTalkAdapter({ pageReservationStore: pages, walletStore: wallet, logger: null,
    handleTalkRequest: async () => {
      req.clementine.prepareGenerationBudget(1_000);
      req.clementine.commitWallet(80);
      const settlement = req.clementine.buildWalletSettlement('durable-page-key');
      assert.equal(settlement.settledMilliturns, 200);
      await req.clementine.settleWalletDurably(settlement);
      assert.equal((await persistence.getBalance('durable-writer')).pageMilliturns, 9_800);
      res.emit('finish');
      res.emit('close');
    },
  })(req, res);
  assert.equal((await persistence.getBalance('durable-writer')).pageMilliturns, 9_800);
  assert.equal(wallet.getBalance('durable-writer').pageTurnsLeft, 9.8);
  assert.equal((await persistence.getTalkSettlement('durable-page-key')).settledMilliturns, 200);
});

test('close during prepared write cannot publish completion for a released hold', async () => {
  const persistence = createMemoryWalletPersistence();
  await persistence.putBalance({ ownerId: 'race-writer', companionMilliturns: 0,
    pageMilliturns: 10_000, grantedCompanionMilliturns: 0, grantedPageMilliturns: 10_000 });
  const wallet = createWalletStore({ persistence });
  await wallet.hydrate();
  const pages = createPageReservationStore({ walletStore: wallet });
  const records = new Map();
  let preparedStarted;
  let releasePrepared;
  const preparedStartedPromise = new Promise(resolve => { preparedStarted = resolve; });
  const preparedGate = new Promise(resolve => { releasePrepared = resolve; });
  const scaleBackplane = {
    async getIdempotency(key) { return records.get(key) || null; },
    async setIdempotency(key, value) { records.set(key, value); },
    async deleteIdempotency(key) { records.delete(key); },
    async compareAndSetIdempotency(key, _expected, value) {
      records.set(key, value);
      if (value.status === 'prepared') {
        preparedStarted();
        await preparedGate;
      }
    },
  };
  const helpers = createTalkIdempotencyHelpers({ scaleBackplane,
    talkIdempotencyEnabled: true, talkIdempotencyTtlMs: 60_000,
    talkIdempotencyMaxEntries: 16 });
  const cacheKey = 'user:race-writer|close-race';
  records.set(cacheKey, { status: 'pending', createdAt: Date.now(), expiresAt: Date.now() + 60_000 });
  const req = { authUser: { id: 'race-writer' },
    talkIdempotency: { cacheKey, key: 'close-race', sessionKey: 'race-session' },
    body: { client_transcript: 'Write the opening scene.', screenplay_target: 'page' } };
  const res = response();
  await createPageLaneTalkAdapter({ pageReservationStore: pages, walletStore: wallet, logger: null,
    handleTalkRequest: async () => {
      req.clementine.prepareGenerationBudget(1_000);
      req.clementine.commitWallet(80);
      const committing = helpers.commitSuccess(req, { body: Buffer.from('accepted bytes') });
      await preparedStartedPromise;
      res.emit('close');
      releasePrepared();
      await assert.rejects(committing, error => error?.code === 'wallet_reservation_released');
    },
  })(req, res);
  assert.equal(records.get(cacheKey)?.status, 'prepared');
  assert.equal((await persistence.getBalance('race-writer')).pageMilliturns, 10_000);
  assert.equal(await persistence.getTalkSettlement(cacheKey), null);
  assert.equal(wallet.getBalance('race-writer').pageTurnsLeft, 10);
});

test('reservation infrastructure failure cannot fall through into model generation', async () => {
  let handlerCalls = 0;
  const res = response();
  await createPageLaneTalkAdapter({ logger: null,
    pageReservationStore: { reserve() { throw new Error('synthetic store failure'); } },
    handleTalkRequest: async () => { handlerCalls++; },
  })({ body: { client_transcript: 'Write the next scene.', screenplay_target: 'page' } }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error_class, 'page_reservation_unavailable');
  assert.equal(handlerCalls, 0);
});

test('the optional metered repair pass is included in multipass budget headroom', () => {
  assert.equal(multipassWalletReserveTokenMultiplier({}), 1);
  assert.equal(multipassWalletReserveTokenMultiplier({ CLEMENTINE_PAGE_MULTIPASS: '1' }), 2);
  assert.equal(multipassWalletReserveTokenMultiplier({ CLEMENTINE_PAGE_MULTIPASS: '1', PAGE_MULTIPASS_REPAIR: '1' }), 3);
});

for (const clientBudget of [undefined, 0, 1]) {
  test(`server Page budget blocks an unfunded generation despite client cap ${clientBudget}`, async () => {
    const wallet = createWalletStore({ initialBalances: { writer: { page: 0.1 } } });
    const pages = createPageReservationStore({ walletStore: wallet });
    const req = { authUser: { id: 'writer' }, body: {
      client_transcript: 'Write the opening scene.', screenplay_target: 'page',
      ...(clientBudget === undefined ? {} : { max_output_tokens: clientBudget }),
    } };
    let providerCalls = 0;
    const wrapped = createPageLaneTalkAdapter({ pageReservationStore: pages, walletStore: wallet, logger: null,
      handleTalkRequest: async () => runTalkGenerate({ req, rid: 'budget-proof', chatMaxTokens: 900,
        chatModelPlan: { model: 'local-proof' }, logger: null,
        chatSupplier: { chat: async () => { providerCalls++; return {
          response: { ok: true, status: 200 }, rawText: JSON.stringify({ choices: [{ message: { content: 'INT. LAB - NIGHT\n\nA light fails.' } }] }),
          usage: { outputTokens: 800 },
        }; } },
      }),
    });
    await assert.rejects(() => wrapped(req, response()), error => error.status === 402 && error.errorClass === 'wallet_empty');
    assert.equal(providerCalls, 0, 'no provider work before the actual server cap is funded');
    assert.equal(wallet.getBalance('writer').pageTurnsLeft, 0.1, 'failed preparation must not consume a hold');
  });
}

for (const explicitTarget of [true, false]) {
test(`a caller intent hint cannot downgrade a writing request (explicit target: ${explicitTarget})`, async () => {
  const wallet = createWalletStore({ initialBalances: { writer: { page: 0.1 } } });
  const pages = createPageReservationStore({ walletStore: wallet });
  const req = { authUser: { id: 'writer' }, body: {
    client_transcript: 'Write the opening scene.', clementine_intent: 'advise',
    ...(explicitTarget ? { screenplay_target: 'page' } : {}),
  } };
  let providerCalls = 0;
  const wrapped = createPageLaneTalkAdapter({ pageReservationStore: pages, walletStore: wallet, logger: null,
    handleTalkRequest: async () => runTalkGenerate({ req, rid: 'forced-intent-budget', chatMaxTokens: 900,
      chatModelPlan: { model: 'fixture' }, logger: null,
      chatSupplier: { chat: async () => { providerCalls++; return {
        response: { ok: true, status: 200 }, rawText: JSON.stringify({ choices: [{ message: { content: 'INT. LAB - NIGHT\n\nA light fails.' } }] }),
        usage: { outputTokens: 800 },
      }; } },
    }),
  });
  await assert.rejects(() => wrapped(req, response()), error => error.status === 402 && error.errorClass === 'wallet_empty');
  assert.equal(providerCalls, 0);
  assert.equal(wallet.getBalance('writer').pageTurnsLeft, 0.1);
});
}

test('an explicit discussion target retains its conversational hint and creates no Page hold', async () => {
  const wallet = createWalletStore({ initialBalances: { writer: { page: 1 } } });
  const pages = createPageReservationStore({ walletStore: wallet });
  const req = { authUser: { id: 'writer' }, body: {
    client_transcript: 'How do I write a scene?', screenplay_target: 'voice_pin', clementine_intent: 'advise',
  } };
  const res = response();
  await createPageLaneTalkAdapter({ pageReservationStore: pages, walletStore: wallet, logger: null,
    handleTalkRequest: async () => {
      assert.equal(req.clementine.lane, 'Companion');
      assert.equal(req.clementine.reservationId, null);
      assert.equal(pages.size(), 0);
      res.emit('finish');
    },
  })(req, res);
  assert.equal(wallet.getBalance('writer').pageTurnsLeft, 1);
});
