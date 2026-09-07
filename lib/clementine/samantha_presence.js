// D009 strangler — Samantha presence for industry writers: presence-memory, intuition-proactive, voice-growth.
// Persists characterContexts memory across sessions via commitScreenplayOwnerMutation + barge-in presence.
// No backend/index.js growth. Pure wrapper, injected deps only.
import { pushCharacterMemory, ensureCharacterContexts, getCharacterContext } from "./short_film_character_context.js";

function trimToString(v) { return v == null ? "" : String(v).trim(); }

export const PRESENCE_STATES = Object.freeze(["idle", "listening", "speaking", "barge_in", "recovering", "present"]);
export const DEFAULT_PRESENCE = "idle";
export const SAMANTHA_PRESENCE_STATES = PRESENCE_STATES;

function normalizePresence(v) {
  const t = trimToString(v).toLowerCase();
  if (!t) return DEFAULT_PRESENCE;
  if (PRESENCE_STATES.includes(t)) return t;
  if (t === "barge-in" || t === "bargein" || t === "interrupted") return "barge_in";
  if (t === "active" || t === "here") return "present";
  return DEFAULT_PRESENCE;
}
export function isValidPresence(v) { return PRESENCE_STATES.includes(trimToString(v).toLowerCase()); }

function findProject(owner, projectId) {
  if (!owner || !Array.isArray(owner.projects)) return null;
  const pid = trimToString(projectId);
  if (pid) return owner.projects.find((p) => String(p?.id) === pid) || null;
  const active = trimToString(owner.activeProjectId);
  if (active) return owner.projects.find((p) => String(p?.id) === active) || null;
  return owner.projects[0] || null;
}

function ensurePresenceContainer(project) {
  if (!project.samanthaPresence || typeof project.samanthaPresence !== "object" || Array.isArray(project.samanthaPresence)) {
    project.samanthaPresence = { state: DEFAULT_PRESENCE, updatedAt: Date.now(), history: [] };
  }
  if (!Array.isArray(project.samanthaPresence.history)) project.samanthaPresence.history = [];
  return project.samanthaPresence;
}

function pushPresenceHistory(container, state) {
  const s = normalizePresence(state);
  if (container.history[container.history.length - 1] !== s) {
    container.history.push(s);
    if (container.history.length > 20) container.history.shift();
  }
  container.state = s;
  container.updatedAt = Date.now();
}

// Core: persist characterContexts memory across sessions (same contract as memory_persist, adds presence)
export async function persistSamanthaMemory({
  ownerKey,
  projectId = "",
  name,
  text,
  page = 1,
  role = "dialogue",
  presence = "present",
  commitScreenplayOwnerMutation,
} = {}) {
  const key = trimToString(ownerKey);
  if (!key) throw new Error("ownerKey required");
  if (!trimToString(name)) throw new Error("name required");
  if (typeof commitScreenplayOwnerMutation !== "function") throw new Error("commitScreenplayOwnerMutation required");
  const pres = normalizePresence(presence);
  const result = await commitScreenplayOwnerMutation({
    ownerKey: key,
    mutate: (owner) => {
      const project = findProject(owner, projectId);
      if (!project) return { commit: false, reason: "project_not_found" };
      if (!Array.isArray(project.characterContexts)) {
        try { ensureCharacterContexts(project, null); } catch {}
      }
      const updated = pushCharacterMemory(project, { name, text, page, role });
      if (!updated) return { commit: false, reason: "character_not_found" };
      // presence-memory: record Samantha presence alongside memory mutation
      const container = ensurePresenceContainer(project);
      pushPresenceHistory(container, pres);
      // also stamp character-level presence for intuition-proactive
      try { if (updated) { updated.lastPresence = pres; updated.lastPresenceAt = Date.now(); } } catch {}
      project.updatedAt = Date.now();
      owner.updatedAt = Date.now();
      return { commit: true };
    },
  });
  return result;
}

// Alias for memory_persist contract compatibility
export const persistCharacterMemoryWithPresence = persistSamanthaMemory;
export const persistSamanthaPresence = persistSamanthaMemory;

// Ensure characterContexts exist and snapshot presence across sessions
export async function persistSamanthaContexts({
  ownerKey,
  projectId = "",
  parsed,
  presence = "present",
  commitScreenplayOwnerMutation,
} = {}) {
  const key = trimToString(ownerKey);
  if (!key) throw new Error("ownerKey required");
  if (typeof commitScreenplayOwnerMutation !== "function") throw new Error("commitScreenplayOwnerMutation required");
  const pres = normalizePresence(presence);
  const result = await commitScreenplayOwnerMutation({
    ownerKey: key,
    mutate: (owner) => {
      const project = findProject(owner, projectId);
      if (!project) return { commit: false, reason: "project_not_found" };
      try { ensureCharacterContexts(project, parsed); } catch (e) { return { commit: false, reason: e.message }; }
      const container = ensurePresenceContainer(project);
      pushPresenceHistory(container, pres);
      project.updatedAt = Date.now();
      owner.updatedAt = Date.now();
      return { commit: true };
    },
  });
  return result;
}

// Barge-in presence: cancel in-flight Page work and persist barge_in state atomically
export async function handleBargeIn({
  ownerKey,
  projectId = "",
  sessionId = "",
  reason = "barge_in",
  page = 1,
  text = "",
  name = "",
  presence = "barge_in",
  commitScreenplayOwnerMutation,
  cancelOnBargeIn,
  cancelByOwner,
  pageReservationStore,
} = {}) {
  const key = trimToString(ownerKey);
  if (!key) throw new Error("ownerKey required");
  if (typeof commitScreenplayOwnerMutation !== "function") throw new Error("commitScreenplayOwnerMutation required");
  const pres = normalizePresence(presence) === DEFAULT_PRESENCE ? "barge_in" : normalizePresence(presence);
  const bargeReason = trimToString(reason) || "barge_in";

  // 1) cancel in-flight Page reservations (D008 cancel-on-barge-in) if injector provided
  let cancelledIds = [];
  try {
    if (typeof cancelOnBargeIn === "function" && trimToString(sessionId)) {
      const r = cancelOnBargeIn(trimToString(sessionId), { reason: bargeReason });
      if (Array.isArray(r)) cancelledIds = r;
    } else if (typeof cancelByOwner === "function" && trimToString(sessionId)) {
      const r = cancelByOwner({ sessionId: trimToString(sessionId) }, { reason: bargeReason });
      if (Array.isArray(r)) cancelledIds = r;
    } else if (pageReservationStore && typeof pageReservationStore.cancelOnBargeIn === "function" && trimToString(sessionId)) {
      const r = pageReservationStore.cancelOnBargeIn(trimToString(sessionId), { reason: bargeReason });
      if (Array.isArray(r)) cancelledIds = r;
    }
  } catch {}

  // 2) persist presence + optional character memory in same transaction
  const result = await commitScreenplayOwnerMutation({
    ownerKey: key,
    mutate: (owner) => {
      const project = findProject(owner, projectId);
      if (!project) return { commit: false, reason: "project_not_found" };
      if (!Array.isArray(project.characterContexts)) {
        try { ensureCharacterContexts(project, null); } catch {}
      }
      const container = ensurePresenceContainer(project);
      container.lastBargeInAt = Date.now();
      container.lastBargeInReason = bargeReason;
      container.lastSessionId = trimToString(sessionId);
      pushPresenceHistory(container, pres);
      // if name+text provided, also push as memory so barge-in is recalled next session
      if (trimToString(name) && trimToString(text)) {
        const updated = pushCharacterMemory(project, { name, text, page, role: "barge_in" });
        if (updated) { updated.lastPresence = pres; updated.lastPresenceAt = Date.now(); }
      }
      project.updatedAt = Date.now();
      owner.updatedAt = Date.now();
      return { commit: true, cancelledIds };
    },
  });
  // surface cancelledIds alongside commit result
  if (result && typeof result === "object" && !Array.isArray(result)) {
    result.cancelledIds = cancelledIds;
    if (result.committed === undefined && result.ok !== undefined) result.committed = result.ok;
  }
  return result;
}

export const handleBargeInPresence = handleBargeIn;
export const onBargeIn = handleBargeIn;

export function buildPresencePayload({ presence = DEFAULT_PRESENCE, characterContexts = [], bargeIn = null, timestamp = Date.now(), sessionId = "" } = {}) {
  const state = normalizePresence(presence);
  const contexts = Array.isArray(characterContexts) ? characterContexts : [];
  return {
    presence: state,
    state,
    characterCount: contexts.length,
    characters: contexts.map((c) => ({ name: String(c?.name || ""), voice: String(c?.voice || ""), memoryCount: Array.isArray(c?.memory) ? c.memory.length : 0 })),
    bargeIn: bargeIn ? { reason: trimToString(bargeIn.reason) || "barge_in", at: Number(bargeIn.at) || timestamp, sessionId: trimToString(bargeIn.sessionId || sessionId) } : null,
    hasBargeIn: Boolean(bargeIn),
    timestamp: Number(timestamp) || Date.now(),
    isPresent: state === "present" || state === "speaking" || state === "listening",
    isBargedIn: state === "barge_in",
  };
}

export function getSamanthaPresence(project) {
  if (!project || typeof project !== "object") return { state: DEFAULT_PRESENCE, history: [] };
  const c = project.samanthaPresence;
  if (!c || typeof c !== "object") return { state: DEFAULT_PRESENCE, history: [] };
  return { state: normalizePresence(c.state), history: Array.isArray(c.history) ? [...c.history] : [], lastBargeInAt: c.lastBargeInAt || null, lastBargeInReason: c.lastBargeInReason || null };
}

export function createSamanthaPresence({ commitScreenplayOwnerMutation, cancelOnBargeIn, cancelByOwner, pageReservationStore } = {}) {
  if (typeof commitScreenplayOwnerMutation !== "function") throw new Error("commitScreenplayOwnerMutation required");
  return {
    persistSamanthaMemory: (opts = {}) => persistSamanthaMemory({ ...opts, commitScreenplayOwnerMutation }),
    persistCharacterMemory: (opts = {}) => persistSamanthaMemory({ ...opts, commitScreenplayOwnerMutation }),
    persistSamanthaPresence: (opts = {}) => persistSamanthaPresence({ ...opts, commitScreenplayOwnerMutation }),
    persistSamanthaContexts: (opts = {}) => persistSamanthaContexts({ ...opts, commitScreenplayOwnerMutation }),
    persistCharacterContexts: (opts = {}) => persistSamanthaContexts({ ...opts, commitScreenplayOwnerMutation }),
    handleBargeIn: (opts = {}) => handleBargeIn({ ...opts, commitScreenplayOwnerMutation, cancelOnBargeIn, cancelByOwner, pageReservationStore }),
    handleBargeInPresence: (opts = {}) => handleBargeIn({ ...opts, commitScreenplayOwnerMutation, cancelOnBargeIn, cancelByOwner, pageReservationStore }),
    onBargeIn: (opts = {}) => handleBargeIn({ ...opts, commitScreenplayOwnerMutation, cancelOnBargeIn, cancelByOwner, pageReservationStore }),
    buildPresencePayload,
    getPresence: getSamanthaPresence,
    normalizePresence,
    isValidPresence,
  };
}

export const createPresencePersister = createSamanthaPresence;
export const createSamanthaPresencePersister = createSamanthaPresence;

export default {
  PRESENCE_STATES,
  DEFAULT_PRESENCE,
  normalizePresence,
  isValidPresence,
  persistSamanthaMemory,
  persistSamanthaPresence,
  persistSamanthaContexts,
  handleBargeIn,
  handleBargeInPresence,
  buildPresencePayload,
  getSamanthaPresence,
  createSamanthaPresence,
};
