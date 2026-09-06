# io.them V1 Launch Doctor

- Generated: 2026-09-05T22:00:00.000Z
- Overall: in_progress
- Passed: 0/5
- Failed: 0

## Talk Pipeline

- Pillar: talk
- Status: in_progress
- Goal: Record voice, receive a useful companion reply, hear playback, and keep the turn.
- Pass criteria: Voice -> reply -> playback -> saved turn works without a restart or manual repair.
- Evidence: 2026-09-05 on main 9c74759: deterministic V1 voice-to-page smoke PASS (npm run eval:v1-smokes); local backend suite 2522/2522; signed iOS V1 UI smoke on iPhone 17 Pro simulator: test_record_voice_turn_round_trips_to_screenplay and test_live_intent_try_this_ask_loads_the_companion_composer passed. Manual microphone record -> reply -> playback -> saved turn has not been run in Launch Doctor.

Automated proof is current; the human mic/playback smoke on a device against the intended backend is the remaining gate. Hosted-gate writer-loop step is flaky on the runner (PR #448 re-taps Save now); judge hosted red against sibling runs.

## Screenplay Studio

- Pillar: screenplay
- Status: in_progress
- Goal: Create a project, write a properly formatted page, save it, reopen it, and export it.
- Pass criteria: A one-page screenplay survives save/reopen and exports through the current Studio controls.
- Evidence: 2026-09-05 on main 9c74759: deterministic V1 screenplay smoke PASS (Fountain export fixture, ordering, byte determinism); integrated iPhone writer loop test_integrated_iphone_writer_loop_creates_saves_exports_and_restores PASSED locally (create -> type -> Save now -> export -> relaunch -> restore) against a loopback backend; UI smoke: draft conflict keep-mine/load-server, draft tools tabs, saved panel routing passed. FAILED on main: test_all_studio_inspector_tabs_route_to_real_panels_and_report_selection, test_backend_project_restore_loads_seeded_screenplay_session, test_creative_partner_mode_reuse_and_to_page_callbacks (fixes live in unmerged #425).

In-app create/save/reopen/export manual smoke still owed by a human. Three Studio UI smokes fail on main until #425 (stacked on conflicting #423) is re-landed. Real PDF export now exists behind PR #435; FDX/Fountain/Markdown ship today.

## Creative Memory

- Pillar: memory
- Status: in_progress
- Goal: Confirm io.them remembers safe creative context and exposes enough shape to diagnose memory.
- Pass criteria: Memory improves continuity, diagnostics are readable, and privacy-gated export/delete behavior is understood.
- Evidence: 2026-09-05 on main 9c74759: deterministic V1 memory recall smoke PASS (cold state, character record, recall, determinism, isolation); UI smoke: test_memory_recall_includes_a_mentioned_character, test_pending_screenplay_question_appears_in_memories_and_opens_studio, test_restored_screenplay_question_can_be_answered_or_skipped, test_canon_clarification_is_visible_in_companion_and_studio passed.

App-level character continuity smoke with Data Controls visible to the human tester still owed. Account export/delete (T-account-deletion-and-export) is still in review and is a store-submission gate.

## Realtime

- Pillar: realtime
- Status: in_progress
- Goal: Mint a realtime session, confirm supplier metadata, and verify degraded-mode behavior.
- Pass criteria: Realtime starts on the primary path, fallback is visible when triggered, and no dead-end state traps the user.
- Evidence: 2026-09-05 on main 9c74759: deterministic V1 realtime failover smoke PASS (primary_ok, primary_fail_fallback_ok, primary_fail_fallback_fail, pinned_provider_fail) and realtime learned-answer voice smoke ok (answer learned, pending question cleared, grounding refreshed, next turn gated until grounded); UI smoke: test_realtime_fallback_does_not_crash_companion and test_realtime_network_faults_resolve_exactly_once passed.

In-app primary-provider plus forced-failure/degraded-mode manual smoke still owed; needs live provider credentials.

## iOS Release Readiness

- Pillar: ios
- Status: in_progress
- Goal: Confirm release config, signed preflight, and Launch Doctor proof are ready before TestFlight or external review.
- Pass criteria: Release config is real, preflight is green, Launch Doctor proof is exported, and human sign-off is recorded before TestFlight/external review.
- Evidence: 2026-09-05 on main 9c74759: signed iOS V1 UI smoke on iPhone 17 Pro simulator executed 35 tests: 22 passed, 4 failed (inspector tab routing, backend project restore, creative-partner mode reuse, remembered-login Keychain relaunch), 8 skipped. GitHub Actions billing block that started 08:46 UTC is cleared; Backend tests, evaluate and docker-build are green on open PRs. Required writer-loop gate step is a runner coin flip (same tree passes and fails minutes apart); PR #448 addresses it in the test.

Unpassed on purpose until Apple team/signing, production APP_TOKEN_RELEASE, an exported Launch Doctor proof from a human run, and human approval exist. Four failing UI smokes and the flaky required gate must be green before external review.
