# io.them Six-Week Launch Plan

This is the operating plan for taking V1 from current proof state to a
fully functioning TestFlight-ready app. It is intentionally execution-focused:
one deep Claude task at a time, Codex as supervisor/integrator, and the human
only pulled in for decisions and manual smoke that agents cannot truthfully run.

## Current Launch Room

Run:

```sh
node scripts/v1_launch_room.mjs
```

Role-specific views:

```sh
node scripts/v1_launch_room.mjs --role=claude
node scripts/v1_launch_room.mjs --role=codex
node scripts/v1_launch_room.mjs --role=human
```

The app-side smoke recorder lives at Data Controls -> V1 Launch Doctor and
exports `~/Downloads/io_them_v1_launch_doctor.latest.json`; the launch-room
command reports that artifact when it exists.

## Operating Rules

- Claude works one deep backend task at a time.
- Codex reviews/merges, owns iOS/product integration, and assigns Claude's next
  backend task.
- Human decisions are batched through `docs/decisions-queue.md`.
- No net-new backend feature work opens while V1-critical work is waiting.
- Every PR must name its V1 pillar and concrete V1 effect.

## Week 1: Launch Path Stabilization

- Claude implements Phase 7b `backend/lib/talk_handler.js`.
- Codex reviews Phase 7b for response envelope, log prefix, counter ordering,
  and no realtime supplier leakage.
- Human answers the privacy/auth/release decision queue where possible.
- Codex keeps release-preflight blockers visible without changing human-owned
  release settings.

Gate: Phase 7b is merged or has one named blocker, and the release blocker list
is current.

## Week 2: Human Smoke Week

- Human runs the in-app V1 Launch Doctor from Data Controls and exports the
  latest report.
- Human can still run `node scripts/v1_manual_qa_checklist.mjs --prompt` for
  the text checklist version of the same smoke.
- Codex fixes every app-facing smoke failure.
- Claude fixes backend smoke failures only when assigned.

Gate: the Launch Doctor report says Talk, Studio, Memory, and Realtime are
passed or each failed flow has a named blocker.

## Week 3: Data Controls And Privacy

- If approved, Claude rebases and fixes PR #94 memory export.
- If approved, Claude rebases and fixes PR #99 memory delete.
- Codex verifies Data Controls copy and user-facing trust language.

Gate: memory export/delete is either approved and tested or explicitly parked
outside V1.

## Week 4: Release Configuration

- Human/Codex clear the remaining release preflight blockers in
  `docs/v1-release-preflight-proof.md`: Apple team ID, hosted backend URL, and
  production app token.
- Codex reruns release preflight.
- Codex reruns full app build and `themTests`.

Gate: release preflight has zero failures, or each remaining failure is an
explicit launch decision.

## Week 5: Product Polish Burn-Down

- Codex performs a full app walkthrough from cold start.
- Claude stays in support mode.
- Fix first-run clarity, failure states, export confidence, memory trust
  language, and realtime degraded-mode messaging.

Gate: no known V1-blocking bugs remain.

## Week 6: Release Candidate

- Codex cuts a release candidate.
- Run app build, `themTests`, deterministic V1 smokes, backend tests, release
  preflight, and human manual smoke.
- Human signs off.
- Claude freezes backend except emergency fixes.

Gate: V1 is ready for TestFlight/external review.
