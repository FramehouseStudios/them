// Voice-to-Page streaming helpers — pure, no backend/index.js growth.
// D009 strangler: accumulation, first-sentence detection, abort handling.

function accumulateChunks(chunks) {
  if (!Array.isArray(chunks)) return "";
  return chunks.map((c) => String(c || "")).join("");
}

function detectFirstSentence(text) {
  const t = String(text || "").trim();
  if (!t) return "";
  const m = t.match(/^[^.!?]+[.!?]/);
  return m ? m[0].trim() : t.split("\n")[0].trim().slice(0, 120);
}

function shouldAbort(signal) {
  return Boolean(signal && signal.aborted);
}

function createStreamAccumulator({ onFirstSentence } = {}) {
  let buffer = "";
  let firstSent = false;
  return {
    push(chunk) {
      const s = String(chunk || "");
      buffer += s;
      if (!firstSent && typeof onFirstSentence === "function") {
        const sent = detectFirstSentence(buffer);
        if (sent && sent.length >= 12) {
          firstSent = true;
          try { onFirstSentence(sent); } catch {}
        }
      }
      return buffer;
    },
    get() { return buffer; },
    reset() { buffer = ""; firstSent = false; }
  };
}

export { accumulateChunks, detectFirstSentence, shouldAbort, createStreamAccumulator };
