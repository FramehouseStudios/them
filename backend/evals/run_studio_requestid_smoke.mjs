function normalizeBackendThreadID(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return '';
  if (raw.startsWith('turn-')) return raw;
  const digits = raw.replace(/\D+/g, '');
  return digits ? `turn-${digits}` : raw;
}

function normalizeRequestID(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizePrompt(value) {
  return String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function matches(event, exchange) {
  const exchangeBackendID = normalizeBackendThreadID(exchange.backendThreadID);
  const eventBackendID = normalizeBackendThreadID(event.turnId);
  if (exchangeBackendID) {
    return exchangeBackendID === eventBackendID;
  }

  const exchangeRequestID = normalizeRequestID(exchange.requestID);
  const eventRequestID = normalizeRequestID(event.requestId);
  if (exchangeRequestID || eventRequestID) {
    return Boolean(exchangeRequestID && eventRequestID && exchangeRequestID === eventRequestID);
  }

  const eventPrompt = normalizePrompt(event.userMessage);
  const exchangePrompt = normalizePrompt(exchange.prompt);
  if (!eventPrompt || !exchangePrompt) return false;
  return eventPrompt === exchangePrompt || eventPrompt.includes(exchangePrompt) || exchangePrompt.includes(eventPrompt);
}

function applyEvent(event, exchange) {
  return {
    ...exchange,
    backendThreadID: normalizeBackendThreadID(event.turnId),
    backendTurn: Number(String(event.turnId).replace(/\D+/g, '')) || exchange.backendTurn,
    requestID: exchange.requestID || normalizeRequestID(event.requestId) || null,
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const prompt = 'Rewrite this beat sharper.';
const queue = [
  {
    id: 'a',
    backendThreadID: null,
    backendTurn: null,
    requestID: 'studio-smoke-a',
    prompt,
  },
  {
    id: 'b',
    backendThreadID: null,
    backendTurn: null,
    requestID: 'studio-smoke-b',
    prompt,
  },
];

const events = [
  { turnId: 'turn-101', requestId: 'studio-smoke-b', userMessage: prompt },
  { turnId: 'turn-100', requestId: 'studio-smoke-a', userMessage: prompt },
];

const resolved = [];
for (const event of events) {
  const index = queue.findIndex((exchange) => matches(event, exchange));
  assert(index >= 0, `No matching exchange for ${event.requestId}`);
  const next = applyEvent(event, queue.splice(index, 1)[0]);
  resolved.push(next);
}

assert(queue.length === 0, 'Expected all pending identical prompts to resolve');
assert(resolved.find((item) => item.id === 'a')?.backendThreadID === 'turn-100', 'Request A bound to wrong turn');
assert(resolved.find((item) => item.id === 'b')?.backendThreadID === 'turn-101', 'Request B bound to wrong turn');
assert(resolved.find((item) => item.id === 'a')?.backendThreadID !== resolved.find((item) => item.id === 'b')?.backendThreadID, 'Distinct identical prompts collapsed together');

const fallbackExchange = {
  id: 'fallback',
  backendThreadID: null,
  backendTurn: null,
  requestID: null,
  prompt,
};
const fallbackEvent = { turnId: 'turn-102', requestId: '', userMessage: prompt };
assert(matches(fallbackEvent, fallbackExchange), 'Prompt fallback should still work without request ids');

console.log('studio-requestid-smoke: ok');
