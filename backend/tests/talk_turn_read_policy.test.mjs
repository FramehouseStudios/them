import assert from 'node:assert/strict';
import test from 'node:test';
import { createTalkTurnReadPolicy } from '../lib/talk_turn_read_policy.js';

const tokenA = 'fixture-client-token-for-a', tokenB = 'fixture-client-token-for-b';
const policy = createTalkTurnReadPolicy({ clientIp: req => req.ip,
  normalizeClientIp: ip => ip === '127.0.0.1' ? 'loopback' : ip,
  normalizeClientToken: value => String(value || '').length >= 16 ? value : '' });
function req(user = '', token = '', ip = '127.0.0.1') {
  return { authUser: user ? { id: user } : null, ip,
    get: key => ({ 'x-client-token': token, 'x-user-id': 'writer-a', 'x-app-token': 'them-dev' })[key.toLowerCase()] };
}

test('[talk-turn-read] an owned turn never follows a different identity or caller header', () => {
  for (const sessionId of [tokenA, 'ip:loopback', '']) {
    const meta = { userId: 'writer-a', sessionId };
    assert.equal(policy(req('writer-a'), meta), true);
    assert.equal(policy(req('writer-a', tokenB), meta), true);
    assert.equal(policy(req('writer-b', tokenA), meta), false);
    assert.equal(policy(req('', tokenA), meta), false);
    assert.equal(policy({ ...req('writer-b', tokenA), userId: 'writer-a' }, meta), false);
  }
});

test('[talk-turn-read] ownerless legacy sessions require token or matching IP proof', () => {
  assert.equal(policy(req('', tokenA), { userId: '', sessionId: tokenA }), true);
  assert.equal(policy(req('', tokenB), { userId: '', sessionId: tokenA }), false);
  assert.equal(policy(req(), { userId: '', sessionId: tokenA }), false);
  assert.equal(policy(req(), { userId: '', sessionId: 'ip:loopback' }), true);
  assert.equal(policy(req('', '', '192.0.2.2'), { userId: '', sessionId: 'ip:loopback' }), false);
  assert.equal(policy(req(), { userId: '', sessionId: '' }), false);
  assert.equal(policy(req(), null), false);
});
