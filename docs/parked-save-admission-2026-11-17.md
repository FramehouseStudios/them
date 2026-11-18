# Preserve draft choices through relaunch — 2026-11-17

## Problem and success criteria

An ordinary save could reach the canonical write path after a relaunch while
the same owner/project still had an unresolved conflict on disk. Restoring the
page and fetching project detail suspend independently; the fresh model can
temporarily have dirty writer text and no in-memory conflict. Checking only the
model's conflict state or active queue entries did not protect that interval.

Success means ordinary writes stay local until the writer chooses; exact text
and captured version bases survive reopening; a captured Keep Mine can retry
without reviving earlier held requests; and a newly advanced server head still
requires a fresh choice. Matching canonical metadata remains connected.

## Fix

- The existing outbox `markInflight` method owns dispatch admission and returns
  a Bool. It durably parks an ordinary request behind a same-owner/project
  conflict, rolls back memory if persistence fails, and never revives an old
  held invocation. The model checks refusal before preflight or HTTP.
- `beginNext` uses that same admission owner. An already captured, pending
  explicit resolution can pass earlier held copies; its immutable request ID,
  draft, source and base survive inflight-to-pending restoration.
- One queue selector supplies conflict authority to hydration. Newer writer
  words retain their own captured bases while the unresolved original base
  remains available. A captured choice resumes against its unchanged server
  head; a different advanced head invokes the existing conflict handler.
- Existing exact matching metadata acknowledgments and all prior 48 outbox
  tests remain intact. No backend, UI-test, workflow, dependency or provider
  contract changed in this repair.

## Evidence and limits

- Hosted #1003 at `6af7b72b` failed recovery: **1 passed / 1 failed / 0 skipped**.
  The failed compound assertion retained the writer marker and 87 characters,
  but conflict IDs, held count and dirty state were absent. This was not proof
  that all text disappeared. A templated version-201 event preceded Keep Mine;
  its project/content cannot be established from that event alone.
- Test-first `10420396`: the real disk-backed admission reproducer failed
  **0/1/0**, as expected, without HTTP or providers.
- Intermediate `dfd5bc69`: focused class **50/2/0**. Both failures were new
  fixture assumptions that a freshly reopened interrupted entry stayed
  inflight; the canonical behavior is pending. The correction retains live
  actor inflight assertions and adds reopened pending/scope/byte assertions.
- Final runtime source `61114510`: affected tests **9/0/0**, exact identities;
  unchanged recovery UI **2/0/0**, including real loopback login, Keychain,
  save401/refresh200/replay201 and version-count/idempotency assertions.
  Both use an erased task-owned simulator, normal signing, Xcode26.3/iOS26.2.
  The UI fixture uses Node24.19.0, not Node20. Its external Node calls were zero;
  all 1,465 source inputs and 3,303 dependency entries remained unchanged.
- macOS scaffold build passed at `61114510`, source unchanged; compile only, no launch/install.
- Strict D009 against exact PR parent `ef2df816` has five zero deltas. All five
  protected files remain byte-identical after the final follow-up. An initial
  missing-ref/null-baseline report was rejected as proof; the strict comparison
  used a temporary exact-parent task ref and removed it with a value check.
- Backend bytes equal #1003's Node20.20.2 proof: **2789/0/2**. This is inherited
  evidence; the unchanged backend suite was not repeated locally. Final-head
  required hosted checks remain mandatory.
- A credential-free Node20 HEAD request reached HTTPS headers (404). It sent no
  key, audio or model request. It does not prove transcription or model quality.

This is not a transaction across the ordinary-recovery store and outbox, nor
proof of every inner auth suspension. Independent Codex review found no
introduced critical blocker in the bounded diff; it is not human PR approval.
Physical microphone/reply/page/rewrite/save, integrated main and production
remain unproven. Production stays held; no key was read or paid call made.

## History and next step

Preserve `10420396` → `e872263d` → `dfd5bc69` → `61114510` over original
`6af7b72b`, then preserve-merge into original #1003 and advance normally. Keep
the original PR, base and prior commits. Require fresh checks and genuine human
review before landing; no replacement, squash, force push or main bypass.

Private evidence: `_proof/T-1485-parked-save-admission-20261117`. The failed
hosted ZIP is hash-verified and preserved there, alongside the original
failures and source-specific local results.
