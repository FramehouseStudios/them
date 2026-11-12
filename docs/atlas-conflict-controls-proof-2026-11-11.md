# ATLAS first assignment — conflict decision controls

## 1. Verified results

ATLAS is installed locally as `~/.codex/skills/atlas/SKILL.md`, with UI metadata
in `agents/openai.yaml`; skill validation passes. It is a Codex role, not a
human reviewer. Jarvis owns integration decisions.

Candidate branch: `codex/T-1375-original-992-boundary`. Source commit:
`6c5f2416064d57b9900443a99437e2fe1079b638`, parent `ea0cfec0`.
The original #992 head `db26ccc3` remains an ancestor. The isolated ATLAS
branch `codex/T-1376-conflict-controls-seam` contains the same commit.

The recovery candidate at `ea0cfec0` grew ScreenplayStudioScreen by one line
against #992's actual parent `12b6b193`. ATLAS extracted the conflict action
controls into the existing held-draft recovery child file. The custody-review
condition, labels, accessibility identifiers, keyboard shortcuts, disabled
state and existing asynchronous view-model handlers are retained.

D009 passes with `GITHUB_BASE_REF=codex/T-1311-placeholder-context`:

| File | Actual parent | Candidate | Delta |
| --- | ---: | ---: | ---: |
| backend/index.js | 33502 | 33502 | 0 |
| ScreenplayStudioScreen.swift | 17236 | 17221 | -15 |
| RootExperienceView.swift | 14749 | 14749 | 0 |
| ScreenplayLiveDraftBridge.swift | 12770 | 12770 | 0 |
| BackendMemoryAPI.swift | 10450 | 10450 | 0 |

Default-signed universal iOS simulator app build and strict signature check
passed in ATLAS's isolated worktree. `git diff --check` passes.

On exact source `6c5f2416`, signed UI proof on erased task-owned simulator
`81F0FF38-9DAD-4011-907B-357DFADD094C` (iPhone 17 Pro, iOS 26.2):

- `test_screenplay_save_outbox_restores_conflict_choice_and_resolves_once`
- `test_custody_copies_save_and_reopen_against_authenticated_backend`
- `test_superseded_custody_save_keeps_copies_and_allows_fresh_choice`

Actual xcresult summary: **3 passed, 0 failed, 0 skipped**. Backend:
`http://127.0.0.1:31337`, disposable JSON storage, user authentication required,
synthetic test identities/provider configuration. No paid model call was made.
These cases exercise real local authenticated storage with injected loss of
acknowledgement; they do not establish live generation or physical-phone proof.
Pre-extraction `ea0cfec0` separately passed the same three cases.

Evidence retained locally:

- `/private/tmp/them-t1376-post-extraction-ui.log`
- `/tmp/them-t1375-build/Logs/Test/Test-them-2026.11.11_18-43-26--0800.xcresult`
- `/private/tmp/them-t1376-ios-build.log`
- `/private/tmp/them-t1376-d009-actual-parent.json`
- `/private/tmp/them-t1376-conflict-controls.patch`

## 2. Actual failures and skips

The pre-extraction actual-parent D009 failure was real: Studio +1. The gate
and its limits were not changed. A comparison initially lacked the remote
parent ref; the actual parent was fetched before the measured result above.
The original remote #992 Quality Gate is still failing, on its unchanged head.

Full backend, full signed units, macOS and broader writer UI were not rerun on
this extracted candidate; they remain publication-boundary work. No live model
or physical-device check was run. Local sandbox restrictions initially blocked
result-tool cache access and loopback access; authorized access succeeded.

## 3. Changed files

- `them/ScreenplayStudioScreen.swift`: composes the extracted conflict controls.
- `them/ScreenplayHeldDraftRecoveryOverlay.swift`: owns that child view.
- This report records the bounded extraction and exact proof limits.
- Outside Git, the ATLAS skill and its UI metadata define its operating scope.

## 4. GitHub state

Fresh reads in this session:

- #992: open draft, original head `db26ccc3`, base
  `codex/T-1311-placeholder-context` at `12b6b193`; backend and D009 success,
  Quality Gate failure. No remote head was advanced.
- #964: open, head `5faa43d6`, base main `78b8c94f`; all three required checks
  successful, `REVIEW_REQUIRED`.

No push, merge, review, protection change or production deployment occurred.
Branch protections were not re-audited during this bounded task.

## 5. Remaining gaps

Full #992 publication proof remains outstanding. Later CAS/ownership/fence
work remains preserved separately rather than being folded into this scoped
candidate. The configured shipping backend is `https://api.them.io`; this
session did not recheck its availability. The complete physical-iPhone journey
against the named intended backend remains unproven. Production remains held.

The current decision file still names io.them, omits D017, and contains old
porting guidance that differs from newer human instructions. These differences
were surfaced; accepted decisions were not edited. This extraction changes none
of those product or history decisions.

## 6. Next task

Finish the exact-candidate #992 publication-boundary checks before any normal,
history-preserving advancement of its original branch. Do not begin another
unrelated extraction. READY FOR CONTINUE.
