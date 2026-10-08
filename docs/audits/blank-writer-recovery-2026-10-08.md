# T-931 — Intentional blank writer recovery

## Problem and connected fix

VERIFIED: manually deleting all saved screenplay text produced no recoverable
blank copy. Debounce discarded recovery, save guards rejected the deletion, and
server hydration could reinsert the old words. The retained signed regression
failed with five assertions before the client fix.

Deletion intent is now tied to the current auth context, selected/loaded project
and an existing version. Only explicit manual edits acquire it. The canonical
recovery store and durable outbox carry it through debounce, relaunch and retry;
missing metadata in legacy manifests defaults off. Both actual version API paths
send the server prerequisite's additive flag. Save controls recognize an explicit
blank edit, while incidental empty drafts remain ineligible.

Queued blank saves are restored before project hydration. Conflicting remote text
does not replace a dirty intentional deletion. Clear Draft preserves prior unsaved
words and retains an unresolved Keep Mine / Load Server choice; remote live text
cannot reuse earlier local deletion intent. No second persistence framework was
introduced. Historical saved words remain as their original version.

## Scope and adversarial review

- Answered: default-off legacy queue decoding, owner-scoped recovery, selected
  project guard, auth-generation guard, explicit flag propagation, guarded queue
  insertion, same-ID flag identity, retry preservation and conflict hydration.
- Answered: clear during unresolved conflict retains the existing choice and
  autosave stops at the existing conflict guard. Previous unsaved words receive
  a separate preserved recovery copy rather than disappearing.
- Answered locally: delete-all offline, offline relaunch without re-running the
  edit fixture, reconnect, exact empty server bytes, exactly one new version,
  original version retained, and saved blank restored on online relaunch.
- Not covered: blank revision snapshots. `studio_snapshot` is deliberately not
  an allowed blank-save source; snapshot creation/loading needs its own contract
  and UI follow-up. Do not silently broaden the server allowlist here.
- Not covered: uninstall with unsynced local text, physical microphone/provider
  voice, production Postgres soak, 120-page performance, export parity or release.

## Proof interpretation

VERIFIED final proof (Xcode 26.3, iOS 26.2, owned iPhone 17 Pro simulator
`11CF5EFB-D8C3-4F19-8062-28AF37F27D93`, erased before each signed proof):

- Units: 666 pass, 0 fail, 0 skip, `/tmp/them-931-final-units.xcresult`.
- Signed UI: 3 pass, 0 fail, 0 skip,
  `/tmp/them-931-final-ui/screenplay-save-network-fault-16721.xcresult`.
- Backend Node 20.20.2, external networking disabled: 2,743 pass, 0 fail,
  2 skip, `/tmp/them-931-final-node20.log`.
- Wrapper tests: 4 pass, 0 fail. Evaluator syntax and `git diff --check` pass.
- macOS scaffold build: exit 0, `/tmp/them-931-final2-mac.log`; this is an
  unsigned build-only check, not a macOS UI test.
- God-file gate against main and the immediate #929 base passes; all five
  protected files have zero growth against the immediate base.

Initial UI 3/3 and units 664/664 passed before the adversarial conflict review;
both signed gates were rerun after the final reviewed changes. Existing Swift
concurrency warnings remain. Hosted gates are separately pending, not inferred
green from these local proofs.

The UI test uses a DEBUG edit fixture invoking the real manual-edit/save path,
not physical keyboard or microphone input. The local backend requires user auth,
and assertions fetch the actual saved project. The evaluator requires all three
recovery tests with zero failures and zero skips. This is scoped deterministic
evidence, not a claim that the app is releasable.

Landing remains #766 then #770 first, with independent approval and green hosted
checks. Main must not be mutated by this draft. No paid model calls or secrets
were used. Protected `index.js` remains at the approved pre-stack 33,626 count;
enforce 33,603 when the product stack establishes it.
