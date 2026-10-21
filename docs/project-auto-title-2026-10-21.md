# T-1103 — Writer-owned project titles on the current foundation

October 21, 2026. Parent `cc7b339`.
Branch `codex/T-1103-project-auto-title`.
Original #647 `848e59d040dc935d082beaeb7dc21c51faee4222` preserved by no-ff
`4386ad68d394a2f18e05ede710bd4e5c0866e137`.
Scoped correction `d2dc719e42d165b42b7df6d942e6e3869875c56b`.

## Why this change is more than a renamed heading

Read the original current PR body, commit, actual base #646 and comments (none).
Its sensible move delegates generated project labels out of RootExperienceView.
Its original helper nonetheless scans the first12 nonblank lines for any Title
field, misses indented/multiline metadata, rejects a one-character title, and
removes literal underscore characters. Direct execution of the actual original
pure helper (Foundation/swiftc, not a simulator/model) reproduced all4:

| Synthetic input | Original output | Correct output |
| --- | --- | --- |
| A Title line on an in-scene monitor | NOT THE PROJECT NAME | Room at Night |
| Indented multiline title page | Pier at Dawn | The Long Night |
| Explicit title X | Room at Night | X |
| Explicit title WALL_E | WALLE | WALL_E |

Jarvis decision: extend the canonical FountainTitlePageCodec, not another
metadata heuristic. Project suggestions come from its actual body; a title-page
title wins only at the same first-physical-line boundary used elsewhere. Root
passes the original document, not its trimmed display copy, to this helper.
Paired display emphasis is removed without deleting intraword underscores or
unpaired punctuation. Explicit writer titles no longer inherit the48-character
generated-suggestion limit. The existing server's project-title storage contract
is unchanged (160-character normalizeSnippet at the route), not a new unlimited
storage guarantee. Actual script/title-page source bytes are not rewritten.

Scene-heading, pack and dated fallbacks and generated48-character bound remain.
Already-bound projects still follow the existing promotion guards; no existing
project is deliberately renamed by this change. Async promotion safety is NOT
proved by this pure label helper; see T-1104 below.

Also read #855's current final head4ff637a and its follow-up word-list decision.
That is FirstPageFreshProject's scene-seed title algorithm, not this restored
live-draft metadata caller. It remains queued intact at its real boundary; no
NLTagger or competing scene-seed algorithm was introduced here.

## Proof and scope

VERIFIED signed focused **25 pass /0 fail /0 skip**, normally signed on erased
task-owned iPhone17Pro/iOS26.2(23C54),
`7F1A14C1-B379-4417-AFE9-331810CD9CD3`:
9 naming tests plus existing Studio action/document-authority and promotion
policy checks. Original5 naming tests retained. Added title-in-action/leading
blank boundary, multiline CRLF source, X/Unicode/underscore/unpaired star,
balanced emphasis, and a writer title longer than48 characters.

macOS scaffold BUILD SUCCEEDED; D009/diff pass. Root14992 ->14963 (-29);
other monitored counts unchanged: index33557, Studio17337, bridge12934,
MemoryAPI10845. Existing and imported Swift6 isolation/Sendable warnings are
not suppressed. No full native/backend rerun solely for a pure label helper and
one-line façade. Production backend is unchanged from T-1102's2898/0/2 snapshot;
that is parent evidence, NOT a new Node run. No current title-promotion UI,
physical phone, speech/provider, release or production claim.

Exact changed files:

- `them/RootExperienceView.swift`
- `them/ScreenplayProjectAutoTitle.swift`
- `themTests/ScreenplayProjectAutoTitleTests.swift`
- `TASKS.md`
- this report

Permanent proof:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1103-20261021.ufHRT8/`
contains original four-case execution/output, signed result bundle/log, macOS
log, exact committed public source, manifest and integration patch.

## Stop the feature sequence at the newly discovered storage issue

VERIFIED source inspection: Root's first-project promotion sends a trimmed
cleanDraft; the active backend POST /projects/:id/version additionally converts
CRLF toLF and trims, including for retry comparison. Native BackendMemoryAPI
itself already sends raw draft, and stored-version normalization/serialization
preserve their inputs. Single-marker UI workflows did not cover this loss.
Do not infer raw-text preservation from their earlier green results.

T-1104 takes priority BEFORE the actual next original #648
`210c5ef02d075b0bd359d4c55f5b8c0917d15554` (based on #647): real handler
reproduction, exact-byte save/replay/read/relaunch, and an authenticated native
unbound-draft promotion journey. Also investigate the existing planned-draft
promotion at playback start and absent intermediate auth/document rechecks;
those are source risks, not newly reproduced async failures. Preserve the
existing committed-write/document/auth owners; no parallel state framework.

No main merge, force push, original-head rewrite, replacement PR, paid call,
secret mutation or deployment. Production hold and independent review remain.
Full THEM goal remains active and is not complete.
