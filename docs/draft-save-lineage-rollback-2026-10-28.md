# Draft-save lineage rollback boundary — 2026-10-28

## Scope

This change protects unresolved **Keep Mine** lineage in the existing
`ScreenplayDraftSaveOutbox`. It does not add a second queue, change server
contracts, or claim that an older app provides a complete rollback experience.

## Storage contract

- Queues without conflict-lineage metadata remain the legacy top-level JSON
  array. Existing ordinary saves and Load Server retirement markers therefore
  keep their prior storage shape.
- A queue containing any entry with `supersededConflictRequests` is written as
  a schema-versioned object with `schemaVersion: 2` and `entries`.
- Current code reads both formats. Unknown versions, malformed envelopes, and a
  v2 envelope without lineage fail before normalization or persistence.
- The confirmed Keep Mine transaction removes the resolution and every exact
  referenced parked conflict in one atomic write. If no lineage remains, that
  same write returns the queue to the legacy array while retaining unrelated
  saves and Load Server retirement markers.

The object envelope is intentionally not readable by array-only builds. Those
builds fail before they can decode, retry, or rewrite individual rows, so they
cannot silently remove the lineage that authorizes exact conflict cleanup.

## User-visible recovery on an older build

If an older array-only build is installed while unresolved Keep Mine lineage is
present, its existing unreadable-queue handling should keep the queue file
unchanged and report that local saves cannot be read. The safe recovery is:

1. Do not repeatedly press Save or Keep Mine in the older build.
2. Export the currently visible page if the older build offers that action.
3. Install a build that understands the v2 lineage envelope.
4. Sign in to the same account, open the same project, and let that build restore
   the exact queued conflict before retrying Keep Mine.

This is a fail-closed storage boundary, not a polished downgrade workflow. It
does not prove every historical build presents the same explanation, that a
physical-device downgrade preserves every separate recovery store, or that an
older build remains usable for new screenplay saves while the protected queue
exists.

## Release and rollback restriction

Do not ship, reissue, or roll back to an array-only binary over installs that may
contain unresolved lineage. An emergency rollback build must retain the v2
envelope decoder and conditional writer even if unrelated T-1205 behavior is
reverted. A rollback to an older binary is safe only after the compatible build
has confirmed the resolution and persisted a lineage-free legacy array.

## Verification boundary

Focused deterministic tests were added for legacy-array compatibility, old-decoder
rejection, current-client restoration and retry, malformed/unknown schema
preservation, atomic write rollback, and the return to a legacy array while
preserving unrelated and retirement rows. Native execution is intentionally
deferred to the integrating owner for this isolated handoff.
