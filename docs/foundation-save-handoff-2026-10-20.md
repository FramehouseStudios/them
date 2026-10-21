# T-1077 — Foundation Save Now handoff

## Boundary and evidence

Original #964ee5c83fd190ff41d0f4386f1f8497f4cfb14e109 is independently
approved but hosted run39507066013 failed its required writer workflow.
Final snapshot retains the typed draft, dirty/manual1, trigger1, queued0,
saving0; server versions are empty. V1 and voice/macOS were skipped after
that failure. Do not call the words lost or the save successful. Full log
and uploaded artifact12305576432 are retained in the adjacent T1076 proof.
The old producer removes its writer bundle; that hosted native evidence
gap remains explicit, not reconstructed from a passing local run.

## Root repair and provenance

Source review confirms two serialization gaps: the explicit save checked
the outbox before claiming its save lease, and the background drain released
that lease without consuming a pending explicit save. The final snapshot
is consistent with a stranded request, but is not a complete hosted causal
trace. Existing original970b84f6f21a867239c0fcdb2b980b33838e6d22 already owns
the coherent slot repair. Apply it without replacing the original PR.

The existing two mutable fields become one small product-owned slot, not
a new queue/framework. Both ordinary saves and draining claim before any
await; one newest waiting request follows the current owner. A queued save
tries the existing retry mechanism, which retains its own backoff.

Adapt original50d04ae51e6ff92b22451d12a0b9e934aca5e267's later handoff rule:
release only after the drain's final asynchronous status refresh, preserve
the captured request, and rebase only same-project/same-auth ordinary work
after an acknowledged earlier save. Explicit Keep Mine keeps its captured
base. If account, project or conflict choice changed, retain the waiting
request locally rather than posting it as a save of the newly selected page.
Later conflict-authority and exact-word retention work remains in the
preserved original stack; this is not universal recovery certification.

## Verification scope

Follow the human's fix-first direction: run the six preserved slot checks
and the unchanged authenticated writer/save/export/relaunch journey once.
No full local backend/unit/UI rerun duplicates required fresh hosted gates.
No model call, deployment, direct main push, replacement PR or history rewrite.
The old local writer producer's bundle is copied by an external evidence-only
wrapper before cleanup, with unchanged native arguments and exit code.
Actual signed/erased owned375-point SE/iOS26.2 results:

- Preserved slot checks **6/0/0**, producer exit0:
  `/tmp/them-1077-focused/v1-ui-smoke-local-1-53796.xcresult`.
  These characterize the slot/helper, not a forced interleaving on the model.
- Unchanged authenticated writer/save/export/relaunch **1/0/0**, producer0:
  `/tmp/them-1077-writer/io-them-studio-ios-writer-loop-54526.xcresult`.
  No assertion or wait change. DEBUG deterministic replies and a temporary
  export artifact do not prove real speech/provider or external Files.
- D009 against actual security main78b8c94f: all five deltas0, index33626,
  Studio17435, Root15112, bridge12952, memory10865. Diff check passes.
  Existing compiler warnings remain. All dependency-security files unchanged.

No new full local backend/unit/V1/macOS run. The original hosted iOS26.5 red
remains retained and unclosed pending fresh exact-head proof. This bounded
verification does not establish all auth/project/choice interleavings.

## Merge boundary

Keep original #964 draft until exact-head required checks and independent
review pass. A changed source head can dismiss the earlier approval; never
submit another person's review or bypass that protection. Current main78b8c94f
has a green required run39502261480, but does not contain this repair or the
remaining product stack. Production is held; physical-phone/live-provider
and complete integrated-product proof remain outstanding.
