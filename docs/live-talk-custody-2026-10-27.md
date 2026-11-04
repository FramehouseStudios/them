# Accepted live reply custody — T1182, in progress

Base: `48311abe2e911a589b719274bb3f9e800d98ef7d`.
Branch: `codex/T-1182-live-reply-custody`.

This is a prerequisite checkpoint, **not a completed live-reply workflow**.
The existing BackendClient and Root have not yet been connected to the new
admission/receipt APIs. No production, original PR or main branch changed.
No provider calls or credits were used. Real microphone and physical-phone
proof remain outstanding.

## Storage boundary

The existing OfflineTalkOutbox now supports parked live admission before a
request is sent, and atomic retention of a completed HTTP200 response under
the original admission. A later account switch cannot redirect that write.
An unreadable index cannot stop an independently admitted response blob
from being retained. Repeated completion cannot replace accepted bytes,
enriched metadata, delivery plans or settled work.

New admissions use a freshly constructed request with finite noncredential
headers; clearing headers on a copied URLRequest did not reliably remove
synthetic credentials in the native reproducer. This does not migrate or
sanitize legacy ordinary enqueue records. Limits remain 25MiB request and
32MiB retained response audio. Oversized audio is explicitly omitted; a failed
blob write is an error, not a durable receipt. No all-storage-failure guarantee
is claimed.

VERIFIED: `live-custody-storage-final.xcresult` — 39 passed, 0 failed, 0 skipped,
including 13 new cases and existing retention/ownership/page/metadata cases.
Earlier characterization: 2/5/0; first API run: 10/1/0, exposing credential
header retention. Those failures were corrected, not skipped.

## Completed-transport boundary

BackendTalkStreamingTransport has an optional accepted-response retention
hook. Once complete successful bytes win its lock, cancellation suppresses
consumer delivery only after custody finishes. A failed retention hook is
wrapped separately from transient network errors. Incomplete/cancelled
transport does not manufacture accepted evidence.

The hook is not yet supplied by the live client. This API cannot establish
end-to-end custody on its own.

## Connected document-origin correction

An empty edit and an explicit Clear have different meanings. Ordinary edits
preserve the current document token/project; an explicit Clear rotates the
token even on an already blank page. Stored empty drafts keep their origin.
Project selection alone cannot relabel a nonempty previous draft.

Accepted project hydration now installs exact draft bytes with explicit
project/version provenance, including intentional unbound empty values.
It runs after protected-edit and queued-save owner checks. Equal-byte A/B
loads no longer depend on a text observer firing. Existing initial-project
receipt promotion preserves the unbound document token.

The existing live-draft service's weak attached-editor identity gates bridge
hydration/context updates, including when network following is disabled.
Project/queue awaits also capture the document token. The screen's draft
mirror uses the same lease and rejects obsolete observer values using exact
UTF8 equality. This prevents an older mounted Studio model's delayed load
from becoming an edit to the newer model's shared page. It is not a new
per-window document architecture or proof of every multiwindow focus path.

Both success and failure continuations check the captured document/editor
before changing project state. The two SwiftUI draft observers and Combine
debounce now use `ScreenplayDraftTextObservation`: exact UTF8 equality rather
than Swift String's canonically equivalent equality. This keeps a composition-only
edit observable without normalizing its bytes or relying on a hash collision
assumption. Broader cross-device text equality remains a separate audit surface.

Zora's read-only audit identified two corrected integration errors: accepted
unbound hydration falling back to an old binding, and the screen mirror
bypassing the model lease. Both were addressed at their canonical seams.

## Native checkpoint record

All runs use signing on and erased task-owned simulator
`91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A` (iOS26.2/23C54).
Artifacts currently reside in `/private/tmp/them-1182-proof`.

| Bundle | Pass | Fail | Skip | Scope |
| --- | ---: | ---: | ---: | --- |
| origin-transport | 109 | 3 | 0 | Initial origin/transport and legacy recovery fixtures |
| origin-transport-corrected | 114 | 0 | 0 | Nine origin cases, ten transport cases, recovery/creation/queue |
| custody-origin-checkpoint-units | 942 | 0 | 0 | Full units after screen lease, before final byte/error follow-ups |
| origin-writer-checkpoint | 1 | 0 | 0 | Authenticated synthetic raw Home/page/save/exact relaunch |
| origin-byte-observers-final | 85 | 1 | 0 | New debounce check read recovery before its write finished |
| custody-origin-final-units | 944 | 0 | 0 | Full signed exact-tree units, including actual Unicode debounce persistence |
| origin-writer-final | 1 | 0 | 0 | Exact final tree: raw audio, formatted page, save, exact relaunch |

The three initial failures included an overfulfilled Stop expectation, a
crash in that fixture's Stop handler, and a Swift concurrency/XCTest crash
in the gated completed-response case. The protocol now keeps its initiating
fixture instance instead of consulting the next test's static state; its
Stop signal is specific to the active protocol instance. The gated case
uses an ordinary bounded waiter instead of changing inversion after waiting.
No assertions were removed and both cancellation and custody ordering remain
checked. The screen-mirror change passed the full942 checkpoint above.

The Unicode check's failure was an early observation: the dirty flag is
published before pagination/revision awaits and persistence. It now waits
for the post-persistence status while retaining both exact-byte assertions.
The final exact-tree units pass944/0/0; macOS scaffold compilation exits0
(`origin-macos-final.log`). This is compilation, not macOS voice/runtime proof.
The writer checkpoint intercepted STT1/chat2/TTS23; those are fixture calls,
not physical-microphone, live-model or shipping-backend evidence.

Backend code is unchanged. Node20 full2996/0/5 remains inherited from T1178,
not a fresh backend suite. The final raw writer run again intercepted
STT1/chat2/TTS23. All assertions stayed enabled. Stop's actual network
cancellation is included in the final unit suite; the wider Stop UI proof is
inherited from T1181 because its Root/runtime path has not changed here.

## Exact changed files

```text
TASKS.md
docs/live-talk-custody-2026-10-27.md
them/OfflineTalkOutbox.swift
them/BackendTalkStreamingTransport.swift
them/ScreenplayLiveDraftBridge.swift
them/ScreenplayLiveDraftSync.swift
them/ScreenplayProjectPromotion.swift
them/ScreenplayStudioPersistencePolicies.swift
them/ScreenplayStudioScreen.swift
them/ScreenplayStudioViewModel.swift
themTests/OfflineTalkLiveCustodyTests.swift
themTests/BackendTalkStreamingTransportTests.swift
themTests/ScreenplayLiveDraftOriginTests.swift
```

VERIFIED: god-file gate against fetched published T1181 passes:
index33494 unchanged, Studio17340→17339, Root14930 unchanged,
bridge12784→12774, BackendMemoryAPI10463 unchanged. `git diff --check` passes.
The first gate attempt failed because its comparison ref was unavailable;
fetching that exact published ref resolved comparison, with no exemption.

## Preserved evidence

Permanent local proof:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1182-20261027.s0vot0ef`.
9654 files copied and SHA256-verified, zero mismatches.
`MANIFEST.json` SHA256:
`5da2ece875ed614ca91c86e594a7772281b3a0bafa947e4c7197901f4dc25344`.
It includes the completed bundles/logs/summaries and the 11 changed runtime/test
source files with their baseline commit. No environment files or credentials
were copied. All native jobs ended; the exact temporary dependency symlink was
removed without touching its target installation.

This branch is an in-progress integration backup, not a merge-ready replacement
PR. Original PR heads, main, production and review protections remain held.

Scoped runtime checkpoints:

- `81b60046a80d2928bbb70ea289893e597f3b4c98` — parked live admission and
  accepted response custody in the existing outbox, plus13 regressions.
- `a12aa6ca2f551656a081d874963093d2289fbcc0` — optional accepted-response
  transport boundary, cancellation ordering, and fixture ownership.
- `95631d562552590d6aec55aaf9108d544168f6b0` — connected document-origin,
  active-editor, stale-error and exact-byte observer/debounce fixes.

The final944 units, writer UI1/0/0 and Mac build cover their combined runtime
tree. BackendClient and RootExperienceView remain byte-identical to the base;
that is deliberate evidence that live receipt wiring is still outstanding.

## Required next integration boundary

1. Bind initiating identity/document before any await, retain one exact prepared
   multipart request across allowed unaccepted auth retries, and admit before
   transmission. Never retry accepted work to repair audio or metadata.
2. Supply the transport hook from the actual client before cancellation,
   decoding, metadata lookup or owner rejection. Keep metadata lookups under
   the original current owner; carry the current durable receipt to the caller.
3. Fence Root's streamed/final/catch/playback mutations using the captured
   account/origin/document/turn, including typed turns. Do not compare changing
   screenplay text as turn identity or discard accepted work silently.
4. Persist page-delivery intent before mutation, covering replacements without
   weakening the existing recovery append-only contract. Settle spoken-only
   replies on actual playback completion and page replies on exact saved-version
   evidence. A crash between save and acknowledgement must not append twice.
5. Prove actual held-response owner/project switches and relaunch without new
   generation, then the complete writer UI/macOS checkpoint. Preserve the
   original stack/review requirements and the production hold.
