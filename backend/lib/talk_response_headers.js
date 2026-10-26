// Keep successful audio responses readable by ordinary HTTP clients. Full
// screenplay/timing/text already live in the canonical turn metadata endpoint.
export const TALK_RESPONSE_HEADER_BYTES = 8_192;
const AUTO_HEADER_RESERVE_BYTES = 512;
const metadataHeaders = [
  'x-dialogue-timeline', 'x-screenplay-cues', 'x-screenplay-output',
  'x-knowledge-citations', 'x-knowledge-query-raw', 'x-knowledge-query-rewrite',
  'x-transcript', 'x-reply',
];
// These rich hints were already optional under per-field size limits. Their
// canonical project/memory data stays on the server; never truncate JSON.
const optionalHeaders = [
  'x-live-paper', 'x-live-paper-beats40', 'x-live-paper-synopsis',
  'x-live-paper-logline', 'x-creative-memory-trace',
];

export function talkResponseHeaderBytes(headers) {
  return Object.entries(headers).reduce((bytes, [name, raw]) => {
    const values = Array.isArray(raw) ? raw : [raw];
    return bytes + values.reduce((n, value) => n + Buffer.byteLength(`${name}: ${value}\r\n`), 0);
  }, 0);
}

export function setTalkInlineJSONHeader(res, name, value, maxSourceChars) {
  if (!value || (Array.isArray(value) && !value.length)) return;
  const json = JSON.stringify(value);
  if (json.length <= maxSourceChars) res.setHeader(name, encodeURIComponent(json));
}

export function applyTalkResponseHeaderBudget(res) {
  const limit = TALK_RESPONSE_HEADER_BYTES - AUTO_HEADER_RESERVE_BYTES;
  const hasMetadata = String(res.getHeader('x-turn-meta-available')) === '1'
    && Boolean(String(res.getHeader('x-turn-id') || '').trim());
  const removed = [];
  for (const name of [...(hasMetadata ? metadataHeaders : []), ...optionalHeaders]) {
    if (talkResponseHeaderBytes(res.getHeaders()) <= limit) break;
    if (res.getHeader(name) === undefined) continue;
    res.removeHeader(name);
    removed.push(name);
  }
  if (res.getHeader('x-live-paper') === undefined && removed.includes('x-live-paper')) {
    res.setHeader('x-live-paper-available', '0');
  }
  const bytes = talkResponseHeaderBytes(res.getHeaders());
  if (bytes > limit) {
    // Never turn a complete page into a successful partial reply or drop
    // identity/actions/security headers merely to satisfy a byte count.
    const error = new Error('Reply metadata exceeds the response header budget');
    error.code = 'TALK_RESPONSE_HEADERS_TOO_LARGE';
    throw error;
  }
  return { bytes, removed };
}
