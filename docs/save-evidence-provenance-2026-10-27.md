# T1184 — Immutable save evidence for live reply settlement

Integration update: Jarvis connected the canonical actor and executed signed
native proof on the combined tree (checkpoint1022/0/0, including all sixteen
cases here). The historical assignment below correctly records that Zora did
not run native tools. Final source/proof/publication is maintained in
`live-reply-settlement-2026-10-27.md`; preserve original commit5457b7e.

Base: `f588fb8df59f2b3fa74388b904635c498eab6ebc`.
Branch: `codex/T-1184-save-evidence`.
Worktree: `/Users/halfmutantfilms/io.them-worktrees/codex-save-evidence`.
Owner: Zora, isolated implementation delegated by Jarvis.

## Scope and source findings

VERIFIED by source inspection: a normal queued save had exact request text and
project/owner, but no immutable document/backend provenance. Reading the bridge
when a queued A save executes while B is visible cannot supply that provenance.
The existing server version route returns the committed draft, version project
and original client request ID; the canonical client result discarded its HTTP
response URL. Initial project receipts already have exact draft validation and
document/backend metadata.

This patch adds `deliveryOrigin` to the existing request and draft-save entry.
Only the active editor with matching selected/loaded project and bridge document
may capture it. Queue/retry/rebase retain it; coalescing, older parked cleanup
and base rebasing cannot cross distinct document origins. Older nil-origin
entries remain saveable but do not produce automatic live settlement evidence.
The outbox success mutation now rolls back its in-memory removal/rebase if its
manifest write fails, retaining the exact queued request for review/retry.

For nonnil origins, the VM parks backend-mismatched work. The canonical version
client also checks `expectedBackendURL` against the actual built request URL
after bootstrap and on every retry, immediately before transport. This closes
the await between VM validation and request construction. Actual response origin
is separately checked; preflight cannot adopt another backend's read response.
Nil-origin legacy request behavior is preserved.

The same review also tightened the existing committed-write adoption seam:
current auth and the active editor are required, composition-only text changes
use exact UTF8 comparison, and the deferred save checks the captured original
project/document before request creation. After the existing save-queue awaits,
UI/recovery publication requires that same original lease; immutable A enqueue
still proceeds, but current B text cannot be read into A's recovery.
Save completion also uses the request's original document token and backend
instead of recapturing a later document when a queued operation begins.

## Interface for Jarvis

`ScreenplayDraftSaveOrigin: Codable, Equatable, Sendable` exposes `documentID`
and `backendURL`. `ScreenplayConfirmedDraftSave: Sendable` exposes immutable
`requestID`, `owner`, `projectID`, `versionID`, `documentID`, `backendURL`, exact
`draft`, `promotedFromProjectID`, `initialProjectReceiptID` and
`initialProjectVersionID`. Its initializer is private; its failable factories
are the only constructors:

- `ordinary(entry:version:versionID:projectID:responseURL:owner:currentOwner:)`
  requires the exact echoed draft, matching project/version, POST request ID,
  operation owner, original document and actual response origin.
- `readback(entry:version:projectID:responseURL:owner:currentOwner:)` accepts an
  exact existing version whose original POST request ID can differ. Reconstruct
  the entry from the stored live plan with its original explicit origin; never
  substitute the current editor's document/project/backend. A GET alone does
  not prove an unbound document's promotion to a new project.
- `initial(...)` uses the same labels as `ordinary`, plus the existing immutable
  initialization metadata. It requires matching delivery origin and returns
  the source project and exact initial receipt/version linkage, including an
  empty source project for verified unbound promotion.

`BackendReadResult.responseURL` defaults to nil for compatibility. The value is
extracted into `BackendReadResult.swift`; canonical `screenplayReadResult` sets
it from the actual HTTP response. No URL is inferred from current defaults.

VM ordinary/readback hooks run before `markSucceeded` and before UI publication
lease checks. The initial hook runs after `recordInitialProjectReceipt` and
before returning the receipt. Both call Jarvis's actor interface:

`try await liveReplyOutbox.recordConfirmedPageSave(evidence) -> Int`

The count is ignored. If this write throws, exact queued save data remains;
missing/incomplete legacy echo merely skips evidence without breaking the save.
VM and initial creation accept canonical `liveReplyOutbox = .shared` injection.
No parallel store, per-autosave GET, playback marker or recovery UI was added.

## Verification and limitations

- Sixteen new focused cases cover exact echo/Unicode, request/project/origin/
  owner mismatches, readback, initial promotion, active-editor capture, legacy
  decoding, retry/restart, distinct-document queue identity and actual canonical
  URLSession response-URL/send-origin behavior with an injected HTTP peer,
  plus real VM committed-write Unicode/obsolete-editor/old-owner adoption.
- VERIFIED `git diff --check`: pass. Canonical god-file gate exits 0 versus
  the existing `origin/main`; exact-base comparison against `f588fb8` shows
  only BackendMemoryAPI changes among the five protected files, decreasing
  by two lines (10463 to10461). The other four are byte-identical.
- Native tests and compilation **UNRUN** by assignment. No Xcode, simulator,
  physical phone, network/provider, credentials or production changes.
- This isolated base intentionally lacks Jarvis's concurrently implemented
  `recordConfirmedPageSave`; integrate both sides before compiling. No stub was
  added to hide that dependency. Actor settlement/playback/crash behavior is
  Jarvis's work and is not proven by these source/factory cases.
- Account changes may still cause the canonical HTTP API to reject its result
  before returning a save acknowledgement; no evidence is invented in that
  case, and original queued work remains. This is not a new auth contract.
- The existing admission concurrency before `isDraftSaveInFlight` is set is
  not redesigned. The queue-await UI publication fence is source-reviewed;
  the new native tests do not claim a held-actor reproduction of that await.
- Readback can establish historical exact bytes, not that they remain the
  current writer draft. Evidence authorizes receipt reconciliation, never UI
  overwrite, fuzzy matching, or a second generation request.

Next: integrate this commit with Jarvis's actor changes; run
`ScreenplayDraftSaveEvidenceTests`, existing save ownership/outbox cases and the
appropriate signed checkpoint. Re-prove actual save plus full playback before
claiming normal live delivery settled.
