# Mentor core on the corrected writer candidate

## Scope and preserved history

VERIFIED preserving merge `bfcf19524fa652a4cc0ccd10d76199c66d051f6c` has
parents `01fa49481308315d9b89e780c0baaaa7fcca5a1e` and original #638
`6ad41171276e9c314ef2b12d818d5eff7463ab71`. No merge conflicts. The older
broad mentor rehearsal `4c99a59c` remains intact on its own local branch;
its later database/product work was not absorbed into this candidate.

Original #638 adds the mentor output contract, protected prompt trimming,
fast-to-rich writing-session routing with load-shed/kill-switch respect,
default-off distracting companion arcs, and the client mentor/pitch identity.
Page writes retain their separate page-output contract. These modules are
imported and used by the production talk handler, not orphan helpers.

VERIFIED writer model, generation/billing implementation, redirect-protected
client, native export support, dependency lockfile, workflows and package
scripts are unchanged from `01fa4948`. No new framework or god-view state.
The orb and Clementine are preserved.

## Root prompt corrections

The original first-session rule demanded a pitch "before anything else,"
contradicting direct-answer and writer-authorship rules. It now limits the
unsolicited opening to greetings/open invitations; a specific craft, scene or
editing request explicitly takes precedence, without a redundant permission
question. The added Swift assertion checks both fresh and ongoing prompts.

The original mentor block hard-coded page25/55/75 on a 110-page feature and
described 90–120 pages as the feature range. DECIDED by the human: recommend
120 pages while permitting shorter or longer stories with three acts. The
prompt now says that explicitly, scales structural guidance to the writer's
target and forbids padding/truncation. This does not change pagination,
project settings or existing drafts. Future #639's text/parity fixture must
retain this correction rather than reintroduce its old 110-page paragraph.

These are prompt-contract corrections, NOT proof that a paid model or a
physical microphone obeyed them. No paid call was made.

## Focused verification

VERIFIED cached Docker Node **20.20.2**, network disabled:

`node --test tests/mentor_turn.test.mjs tests/companion_arcs_policy.test.mjs tests/persona_mentor_contract.test.mjs tests/persona_deeper.test.mjs tests/system_prompt_trim.test.mjs tests/talk_generate_stage.test.mjs`

**32 passed / 0 failed / 0 skipped.** Includes page-vs-mentor priority,
load shedding, kill switch, retained care/continuity, protected trimming and
injected-provider generation/wallet paths. It is not a full HTTP/live-provider
or complete backend run. Log: `/tmp/them-1087-mentor-focused.log`.

The first container attempt exited125 before executing tests: its read-only
archive lacked the nested dependency mountpoint. Creating that directory in
the disposable archive fixed the harness; no production source was changed.

VERIFIED signed Swift mentor/pitch tests on erased task-owned Pro
`11CF5EFB-D8C3-4F19-8062-28AF37F27D93`, iOS26.2/23C54:
**10 passed / 0 failed / 0 skipped**, actual completed bundle summary read.
Command: `scripts/run_v1_ui_smoke.sh` with
`ONLY_TESTING=themTests/HerVoiceSpecMentorCoreTests` and additional
`-only-testing:themTests/HerVoiceSpecScenePitchTests`, normal signing retained.
Bundle: `/tmp/them-1087-mentor-swift/v1-ui-smoke-local-1-77562.xcresult`;
summary: `/tmp/them-1087-mentor-swift-summary.json`;
log: `/tmp/them-1087-mentor-swift.log`. The assembled-prompt assertions are
not model-compliance or voice-recognition evidence.

VERIFIED D009 vs fetched main `78b8c94f`: index33626 delta0, Studio17425
delta-10, Root15112 delta0, bridge12929 delta-23, memoryAPI10865 delta0.
The human-approved33626 exception still applies until the later stack changes
it to33603. Whitespace and changed production-JS syntax checks pass. No full
backend/unit/V1/macOS repeat; the selected Swift test invocation built its
app/test dependencies, not a separate macOS scaffold.

## External export observation and remaining gates

VERIFIED after manual Mac unlock: the existing T-1086 file
`writer-loop-9ec67ddc8240.md` opens in simulator Files outside THEM. AX lists
35bytes; the inspected preview displays `**WRITER LOOP DRAFT 9EC67DDC8240**`.
The existing independent receipt/hash remains in
`docs/native-files-writer-sync-2026-10-20.md`; no export rerun was needed.
The SE's file/state is retained; mentor checks use the separate owned Pro.

VERIFIED GitHub #964 head `5faa43d6`: all3 required checks SUCCESS, ready,
reviewDecision REVIEW_REQUIRED, mergeState BLOCKED. Main remains `78b8c94f`.
Protection retains strict up-to-date, one non-author review, stale-review
dismissal and administrator enforcement. The agent did not approve or merge.

The integration backup is not a replacement PR or a main-ready claim. Keep
earlier original PR landing scopes separate; never advance #625 to a tip
containing still-unreviewed #590/#638. Every landing requires its own updated
head, required checks and genuine independent approval. Before a main merge,
recheck deployment automation so the explicit production hold is preserved.

Remaining: integrated-main gates, intended shipping backend/credentials,
physical-iPhone microphone/reply/write/rewrite/save/offline/relaunch/export
journey, and fresh permission before further paid proof. App Store work is
not the functional milestone. Continue status: READY FOR CONTINUE.
