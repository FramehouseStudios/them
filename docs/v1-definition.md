# io.them V1 Definition

This is the operative V1 target until the human product lead changes it.
Every PR must either close a V1 checklist item, unblock one, or clearly say
that it is infrastructure for one. Work that does none of those is not next.

## Platform scope

**V1 is iPhone only.** See `D-desktop-posture-v1` in
`docs/decisions-queue.md` (resolved 2026-05-14). The Xcode `macosx`
target stays in `SUPPORTED_PLATFORMS` as dormant scaffolding so a
future Mac shell isn't re-plumbed from scratch, but the V1 TestFlight
scheme, App Store listing, and marketing copy must say iPhone only. A
real desktop product is `T-macos-shell-v1.1` and requires its own
ADR.

## V1 Promise

A writer can open io.them on a phone, speak or type a messy creative impulse,
and get a properly formatted screenplay page within 60 seconds. The page can
be edited, saved, exported, and improved with a companion that remembers the
writer's characters, tone, recent themes, and current creative friction.

## Talk Pipeline

The user can record or type a turn, receive a companion reply, hear audio when
voice is available, and save the turn. The app keeps the turn useful when the
backend is slow, rate-limited, or temporarily offline. Metadata, errors, and
retry states are visible enough for support without exposing creative content.

Checklist:
- [x] Backend `/talk` path exists and prompt assembly is centralized.
- [x] iOS preserves saved talk replies across rate-limited metadata reads.
- [x] iOS shows talk health, stats, and error state without log spelunking.
- [x] Talk pipeline route decomposition has a design note before Phase 7 code.
- [ ] Manual smoke: record voice -> get reply -> hear reply -> saved turn.

## Screenplay Studio

The user can create or open a screenplay project, write scenes, keep a live
paper surface, and export or import common screenplay formats. Draft analysis
can explain structure, drift, and craft opportunities at page-level anchors.

Checklist:
- [x] Magic-moment onboarding and Studio polish are merged.
- [x] Fountain import and Markdown/export-format discovery are consumed.
- [x] Backend screenplay project read/write routes are extracted and tested.
- [x] iOS consumes FDX export and backend PDF rejection alternatives cleanly.
- [ ] Manual smoke: create project -> write scene -> save -> export -> reopen.

## Creative Memory

The companion remembers only useful creative context: character names, voice
traits, accepted twists, recent themes, and block patterns. Memory improves
suggestions without surprising the user or leaking private content in support
routes.

Checklist:
- [x] Character mentions, traits, archetypes, accepted twists, and block
      history have backend/iOS surfaces.
- [x] Prompt assembly consumes persona, memory, session, accepted twists, and
      block signal in a pinned order.
- [x] iOS exposes a plain-language memory summary and refresh state.
- [x] Human privacy decision is made for full memory export/delete
      (`D-creative-memory-export-approval` and
      `D-creative-memory-delete-scope` resolved 2026-05-14).
- [ ] Manual smoke: mention character -> later suggestion recalls them.

## Realtime

The app can mint a realtime supplier session and degrades gracefully when the
primary supplier fails. Supplier selection is configurable, testable, and
observable without blocking the writer.

Checklist:
- [x] Backend supplier interface and failover are merged.
- [x] iOS supplier selection is merged.
- [x] iOS shows degraded-mode/fallback state when stub failover is used.
- [ ] Manual smoke: primary mint works; forced primary failure shows fallback.
- [x] Realtime route decomposition lands before talk-pipeline Phase 7.

## iOS Release Readiness

V1 is not a pile of endpoints. It is a TestFlight-ready app path that a human
can run end-to-end without developer narration. Build, tests, smoke notes, and
known human-gated privacy decisions must be visible before external review.

Checklist:
- [x] macOS scheme still compiles (kept as dormant scaffolding per
      `D-desktop-posture-v1`; not in V1).
- [x] Current app build and `themTests` are green after the latest app-visible
      feature.
- [x] `smoke.sh` or an equivalent manual QA script covers the V1 path.
- [x] TestFlight preflight artifact names what is verified and what is parked.
- [ ] Human signs off on the V1 manual smoke before external review and the
      TestFlight handoff can proceed.
- [x] iOS auth tokens migrated from UserDefaults to Keychain
      (`T-ios-keychain-token-migration`).
- [x] iOS offline outbox queues talk turns when offline
      (`T-ios-offline-outbox`).
- [x] macOS scaffolding gated off the V1 TestFlight scheme
      (`T-macos-posture-cleanup`).
- [x] Backend deploy manifest + Dockerfile in repo
      (`T-backend-deploy-image`).
- [x] Backend boot guard refuses production start without required env
      (`assertProductionEnv`).
- [x] Migrations runner applies all `backend/migrations/*.sql`
      (`scripts/apply_migrations.mjs`) — run it before first deploy.
- [x] `GET /account/export` + `DELETE /account` wired to real
      persistence — **App Store reviewer blocker**
      (`T-account-deletion-and-export`).
- [x] Security headers (HSTS/nosniff/frame-ancestors) set before
      external review (`T-backend-security-headers`).
- [x] Auth + realtime routes rate-limited
      (`T-backend-rate-limit` Phase 1–2).

## PR Rule

Every PR description should include:

```text
V1 pillar: talk | screenplay | memory | realtime | ios | infra
V1 effect: closes <checklist item> | unblocks <item> | infrastructure for <item>
```

If the V1 effect is "none", the PR should not open without explicit Codex
assignment.
