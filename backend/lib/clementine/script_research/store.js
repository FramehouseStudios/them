// Script research store — per-owner rows + brief (D009 strangler, no 33626 growth)
// Stores 800-char excerpts + scores only, not full scripts. samantha is clementine.
import { createHash } from "node:crypto";

function trimmed(v){ return String(v||"").trim(); }

function fingerprint(draft){
  const h = createHash("sha256");
  h.update(String(draft||""));
  return h.digest("hex").slice(0,16);
}

const _rows = new Map(); // ownerKey -> ScriptResearchRow[]
const _briefs = new Map(); // ownerKey -> {hash, brief, createdAt, usage}

export function getFingerprint(draft){ return fingerprint(draft); }

export function ingestRow({ ownerKey, draft, genre="horror", tone="dark", character="John", ghost="bedroom memory", want="prove safe", need="admit fear", motif="listening shadow", scar="second hand missing", finalImage="final echo bedroom", project } = {}){
  const key = trimmed(ownerKey) || "default";
  const fp = fingerprint(draft);
  const arr = _rows.get(key) || [];
  if (arr.some(r=> r.fingerprint===fp)) return arr.find(r=> r.fingerprint===fp);
  const text = String(draft||"");
  const row = {
    id: `${Date.now()}-${fp}`,
    ownerKey: key,
    createdAt: Date.now(),
    fingerprint: fp,
    genre: String(genre||"horror").toLowerCase(),
    tone: String(tone||"dark").toLowerCase(),
    pages: Math.max(1, Math.ceil(text.split("\n").length/55)),
    lines: text.split("\n").length,
    excerpt: text.slice(0,800),
    draftLen: text.length,
    character: String(character||"John"),
    scores: null, strengths: [], weaknesses: []
  };
  arr.push(row);
  if (arr.length>50) arr.shift();
  _rows.set(key, arr);
  return row;
}

export function getRows(ownerKey){
  const key = trimmed(ownerKey) || "default";
  return [...(_rows.get(key)||[])];
}

export function setScores({ ownerKey, fingerprint: fp, scores, strengths, weaknesses } = {}){
  const key = trimmed(ownerKey) || "default";
  const arr = _rows.get(key) || [];
  const row = arr.find(r=> r.fingerprint===fp);
  if (!row) return null;
  row.scores = scores;
  row.strengths = Array.isArray(strengths)? strengths: [];
  row.weaknesses = Array.isArray(weaknesses)? weaknesses: [];
  row.scoredAt = Date.now();
  return row;
}

export function getBrief(ownerKey){
  const key = trimmed(ownerKey) || "default";
  return _briefs.get(key) || null;
}

export function setBrief({ ownerKey, hash, brief, usage } = {}){
  const key = trimmed(ownerKey) || "default";
  const entry = { ownerKey: key, hash: String(hash||""), brief: brief||null, usage: usage||null, createdAt: Date.now() };
  _briefs.set(key, entry);
  return entry;
}

export function rowsHash(ownerKey){
  const rows = getRows(ownerKey);
  const h = createHash("sha256");
  h.update(JSON.stringify(rows.map(r=> ({fp:r.fingerprint, s: JSON.stringify(r.scores)}))));
  return h.digest("hex").slice(0,16);
}

export function clearResearch(ownerKey){
  const key = trimmed(ownerKey) || "default";
  _rows.delete(key);
  _briefs.delete(key);
  return true;
}

export default { getFingerprint, ingestRow, getRows, setScores, getBrief, setBrief, rowsHash, clearResearch };
