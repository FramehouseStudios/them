// Compatibility boundary: old deployments still read samanthaPresence.
// Read-only projection never mutates stored projects. Migration happens inside
// the caller's existing owner/project mutation, not during header generation.
import { isDeepStrictEqual } from 'node:util';
function validRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    typeof value.state === 'string' &&
    (value.history === undefined || Array.isArray(value.history));
}

export function readPresenceRecord(project) {
  if (validRecord(project?.clementinePresence)) {
    const baseline = project.clementinePresenceCompatibilityBaseline;
    // After rollback, an old server only changes the legacy field. Recognize
    // that unambiguous write without trusting clocks or merging two histories.
    if (validRecord(baseline) && validRecord(project.samanthaPresence) &&
        isDeepStrictEqual(project.clementinePresence, baseline) &&
        !isDeepStrictEqual(project.samanthaPresence, baseline)) return project.samanthaPresence;
    return project.clementinePresence;
  }
  if (validRecord(project?.samanthaPresence)) return project.samanthaPresence;
  return null;
}

export function ensurePresenceRecord(project, now = Date.now()) {
  const source = readPresenceRecord(project);
  const record = source ? structuredClone(source) : { state: 'idle', updatedAt: now, history: [] };
  if (!Array.isArray(record.history)) record.history = [];
  project.clementinePresence = record;
  // Dual-write during the supported rollback window. Both keys serialize the
  // same value, including later history updates in this owner transaction.
  project.samanthaPresence = record;
  project.clementinePresenceCompatibilityBaseline = record;
  return record;
}
