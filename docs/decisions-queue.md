# Decisions Queue

Short, scannable list of items that need the **human's** decision.

This file is the only place the human needs to look to find every
open question from either agent. Neither agent should propose
decisions inside PR bodies, Slack, or chat memory — only here. Once
a decision is made, the agent that asked moves the entry from
**Open** to **Resolved** with the human's answer and the date.

Open entries follow this shape:

```markdown
### D-<short-slug> — <one-line question>
- **Asked by:** support | codex
- **Asked at:** YYYY-MM-DD
- **Why it matters:** one sentence on what unblocks if you answer.
- **Question:** the single concrete question. No menus longer than 3
  options.
- **Default if no answer:** what the agent will do absent an answer
  (always a safe, conservative default).
```

Rules:

- One question per entry. If you have three questions, file three
  entries.
- If a question grows into an architectural decision, the agent must
  also propose a `D###` row in `DECISIONS.md` and link to it from
  the queue entry. The queue entry resolves when the human accepts
  or rejects the ADR.
- Resolved entries below ~30 days may be pruned.

---

## Open

No open decisions.

---

## Resolved

### D-guest-mode-vs-required-login — Does V1 require login, or allow guest use?
- **Asked by:** support
- **Asked at:** 2026-06-10
- **Resolved at:** 2026-06-11
- **Resolution:** **Require login. No guest mode in production.** Production
  must enforce user auth on protected routes. An unset value remains
  secure-by-default; an explicit `REQUIRE_USER_AUTH=false`/`0`/`no`
  misconfiguration fails startup loudly.
- **Resolved by:** Human product lead, 2026-06-11. Implementation evidence:
  `resolveRequireUserAuth()` and `assertProductionEnv()` in
  `backend/config.js`; regression coverage in
  `backend/tests/config_assert_production_env.test.mjs`.
- **Original why it mattered:** `REQUIRE_USER_AUTH` previously defaulted off in
  production, silently leaving `/talk`, `/state`, `/memories`, `/screenplay`,
  and related protected routes reachable by any client with the app token.
- **Question answered:** For V1, must every user sign in before reaching the
  protected routes, or should a scoped unauthenticated guest mode be approved
  and built?
- **Default if no answer was:** Require login. Production runs with user auth
  enforced; no guest mode ships until explicitly approved.

### D-account-export-key-scope — How is per-user data keyed for export?
- **Asked by:** support
- **Asked at:** 2026-05-15
- **Resolved at:** 2026-05-28
- **Resolution:** `req.authUser.id` is the canonical authenticated
  identity for account export/delete, but it is **not** assumed to be
  every domain's raw key prefix. The export path must use a per-row
  ownership check: accepted user-key shapes (`<userId>`,
  `user:<userId>`, `authuser:<userId>`, and their prefixed forms)
  plus persisted owner fields (`userId`, `user_id`, `ownerId`,
  `owner_id`, `ownerUserId`, `owner_user_id`, `authUserId`,
  `auth_user_id`). Rows without a trusted match stay out of the V1
  export/delete scope. This is the conservative product answer until
  post-V1 domain-specific export UX exists.
- **Resolved by:** Codex acting product owner during support agent coverage,
  2026-05-28. Implementation evidence: `exportAuthenticatedUserData`
  in `backend/index.js`; regression coverage in
  `backend/tests/account_routes_wiring.test.mjs`.
- **Original why it mattered:** `T-account-deletion-and-export` Phase-1 wiring
  needs to enumerate every store row owned by a user. The legacy
  memory path keys by session/ip (`/data/memories/clear` uses
  `resolveWritableMemoryContext`, not `req.authUser`), so a naive
  `list({domain, prefix: userId})` may under- or over-collect.
- **Question answered:** For V1 export/delete, is `req.authUser.id` a reliable
  prefix/owner for every persistence domain, or do specific domains
  (user_memory, screenplay) need a domain-specific ownership lookup?
- **Default if no answer was:** Phase-1 exports only the domains where
  user-id keying is verified (creative_memory, accepted_twists,
  craft_*, telemetry); memory/screenplay export is marked "partial —
  contact support" until the key convention is confirmed. Deletion
  uses the same conservative set.

### D-creative-memory-export-approval — Approve full memory export?
- **Asked by:** codex
- **Asked at:** 2026-05-14
- **Resolved at:** 2026-05-14
- **Resolution:** **Approved.** PR #94 may merge. Route must remain
  authenticated, scoped to the requesting user, rate-limited, and
  documented in `docs/v1-definition.md` as a privacy/data-control
  surface. Export payload must exclude server-only metadata (boot
  ids, supplier secrets, internal telemetry).
- **Resolved by:** human product lead (one-time override granted in
  end-to-end audit session, 2026-05-14).

### D-creative-memory-delete-scope — What should memory delete remove?
- **Asked by:** codex
- **Asked at:** 2026-05-14
- **Resolved at:** 2026-05-14
- **Resolution:** **Approved with narrow V1 scope.** PR #99 may ship
  `DELETE /memory/forget` that erases **only `creative_memory`** for
  V1. Project-scoped screenplay artifacts and derived memories are
  **out of scope for V1** and tracked separately as a follow-up.
  The route must require explicit user confirmation server-side
  (idempotency token + user-id match), and must log a deletion
  receipt the user can see.
- **Resolved by:** human product lead, 2026-05-14.

### D-auth-route-extraction-clearance — Clear auth extraction after rebase?
- **Asked by:** codex
- **Asked at:** 2026-05-14
- **Resolved at:** 2026-05-14
- **Resolution:** **Approved.** Once support agent rebases PR #212 onto
  `main`, the existing `themTests` suite is green, and the diff
  remains byte-identical (only file moves), Codex may clear the
  tier-3 `do-not-merge` label and merge under D005 supervisor
  authority. If the rebase introduces any non-trivial diff, the PR
  reverts to tier-3 and requires a fresh human review.
- **Resolved by:** human product lead, 2026-05-14.

### D-desktop-posture-v1 — Is io.them shipping a desktop app for V1?
- **Asked by:** support
- **Asked at:** 2026-05-14
- **Resolved at:** 2026-05-14
- **Resolution:** **No desktop app for V1.** V1 is mobile-only
  (iPhone). The existing `macosx` SUPPORTED_PLATFORMS flag and
  `#if os(macOS)` conditionals are **dormant scaffolding** —
  acceptable to keep so long as they compile, but must not appear
  in any V1 marketing, TestFlight notes, or App Store listing.
  Native macOS shell (sidebar, menu bar, keyboard shortcuts,
  window sizing) is deferred to V1.1+ and requires its own ADR.
  Action: Codex spec captures a follow-up to either gate macOS out
  cleanly or commit a real Mac shell post-V1.
- **Resolved by:** human product lead, 2026-05-14.

### D-token-keychain-migration — Move auth tokens off UserDefaults?
- **Asked by:** support
- **Asked at:** 2026-05-14
- **Resolved at:** 2026-05-14
- **Resolution:** **Approved for V1.** iOS must migrate the stored
  `app_token` and `sharedUserID` from `UserDefaults` to the iOS
  Keychain before TestFlight external review. Migration must be
  one-way and idempotent: on first launch under the new build,
  read existing UserDefaults values, write to Keychain, then clear
  the UserDefaults entries. New writes use Keychain only. A
  follow-up Codex spec captures the iOS work.
- **Resolved by:** human product lead, 2026-05-14.

### D-ci-openai-secret-format — Fix malformed CI OPENAI_API_KEY (issue #33)?
- **Asked by:** support
- **Asked at:** 2026-05-14
- **Resolved at:** 2026-05-14
- **Resolution:** **Approved for human action.** Human will rotate
  the `OPENAI_API_KEY` GitHub Actions secret. See
  `docs/ci-openai-secret-fix.md` for the exact rotation steps,
  validation script, and how to confirm the eval gate is green.
- **Resolved by:** human product lead, 2026-05-14.
