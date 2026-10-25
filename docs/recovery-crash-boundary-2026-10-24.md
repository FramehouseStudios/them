# T-1133 — Interrupt recovery before insertion or save admission

VERIFIED parent: `325cfb5`, final T1130 runtime0b10320 with signed955/0/0.
Task branch: `codex/T-1133-recovery-crash-boundary`, local only.

Add explicit DEBUG/UI/loopback fault boundaries to the existing recovery fixture:
throw once after the real delivery plan is durable but before inserting; or hold
all canonical save admission for this fixture's original project until relaunch.
No injected success, outbox replacement, provider generation or Release behavior.
The hold checks the real fixture's installed-project marker, so it cannot affect
normal Debug runs, remote backends or another project's saves.

The connected cases share the existing queued-response/playback/project-switch/
exact-byte/one-server-copy/relaunch journey. The acknowledgement variant retains
its stronger newer-saved-writer-words check. A resumed not-yet-saved plan must add
exactly one server version; a saved acknowledgement retry must add none.

VERIFIED: before-insertion case **1/0/0** in
`/tmp/them-1133-before-insert.xcresult`, local authenticated HTTP,
intercepted ASR/chat/TTS1/2/23. The existing T1130 continuation was sufficient;
no product bug is claimed fixed by this probe. Signed erased owned simulator
7F1A14C1-B379-4417-AFE9-331810CD9CD3, iOS26.2/Xcode26.3. Syntax/diff pass.

NOT RUN: before-save-admission case, unchanged normal/acknowledgement variants,
full signed units or Mac on this probe source. Stop for the first new hosted red:
original #975 run40160039304 at80a2f66 now fails offline recovery after passing
units, writer and broad UI. Auth-refresh recovery reports two matching server
versions; conflict-choice recovery fails its post-relaunch predicate; the result
also reports SIGTERM. Voice/Mac hosted steps skipped. Inspect actual artifacts
before interpreting those predicates as a precise data-loss cause.

Next: preserve this local investigation, repair the actual #975 failure first
from its exact source, then return to before-save admission. No PR push/merge,
main change, production change, paid call or physical-phone claim.

Exact files: `them/OfflineTalkPageRecoveryUITestFixture.swift`,
`them/OfflineTalkPageRecoveryPanel.swift`, `them/ScreenplayStudioViewModel.swift`,
`themUITests/V1SmokeUITests.swift`,
`backend/evals/run_home_voice_handoff_ui_smoke.mjs`, this report, `TASKS.md`.
