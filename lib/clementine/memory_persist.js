// D009 strangler — persist characterContexts memory via commitScreenplayOwnerMutation wrapper.
// No backend/index.js growth. Pure wrapper, injected deps only.
import { pushCharacterMemory, ensureCharacterContexts } from "./short_film_character_context.js";

function trimToString(v) { return v == null ? "" : String(v).trim(); }

function findProject(owner, projectId) {
  if (!owner || !Array.isArray(owner.projects)) return null;
  const pid = trimToString(projectId);
  if (pid) return owner.projects.find((p) => String(p?.id) === pid) || null;
  const active = trimToString(owner.activeProjectId);
  if (active) return owner.projects.find((p) => String(p?.id) === active) || null;
  return owner.projects[0] || null;
}

/**
 * Persist single character memory line via commitScreenplayOwnerMutation.
 * D009: caller provides commit fn, we do the mutate.
 * Returns commit result or null if character not found.
 */
export async function persistCharacterMemory({
  ownerKey,
  projectId = "",
  name,
  text,
  page = 1,
  role = "dialogue",
  commitScreenplayOwnerMutation,
} = {}) {
  const key = trimToString(ownerKey);
  if (!key) throw new Error("ownerKey required");
  if (!trimToString(name)) throw new Error("name required");
  if (typeof commitScreenplayOwnerMutation !== "function") throw new Error("commitScreenplayOwnerMutation required");
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
      project.updatedAt = Date.now();
      owner.updatedAt = Date.now();
      return { commit: true };
    },
  });
  return result;
}

/**
 * Ensure characterContexts exist for a project and persist via commit.
 */
export async function persistCharacterContexts({
  ownerKey,
  projectId = "",
  parsed,
  commitScreenplayOwnerMutation,
} = {}) {
  const key = trimToString(ownerKey);
  if (!key) throw new Error("ownerKey required");
  if (typeof commitScreenplayOwnerMutation !== "function") throw new Error("commitScreenplayOwnerMutation required");
  const result = await commitScreenplayOwnerMutation({
    ownerKey: key,
    mutate: (owner) => {
      const project = findProject(owner, projectId);
      if (!project) return { commit: false, reason: "project_not_found" };
      try { ensureCharacterContexts(project, parsed); } catch (e) { return { commit: false, reason: e.message }; }
      project.updatedAt = Date.now();
      owner.updatedAt = Date.now();
      return { commit: true };
    },
  });
  return result;
}

export function createMemoryPersister({ commitScreenplayOwnerMutation } = {}) {
  if (typeof commitScreenplayOwnerMutation !== "function") throw new Error("commitScreenplayOwnerMutation required");
  return {
    persistCharacterMemory: (opts = {}) => persistCharacterMemory({ ...opts, commitScreenplayOwnerMutation }),
    persistCharacterContexts: (opts = {}) => persistCharacterContexts({ ...opts, commitScreenplayOwnerMutation }),
  };
}
