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
- **Asked by:** claude | codex
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

### D-v1-release-preflight-clearance — Clear release signing/configuration blockers?
- **Asked by:** codex
- **Asked at:** 2026-05-15
- **Why it matters:** This blocks TestFlight/external review even though Debug
  app build/tests and deterministic V1 smokes are green.
- **Question:** May the release signing/configuration values listed in
  `docs/v1-release-preflight-proof.md` be set now, including Development Team,
  Hardened Runtime, Release `BACKEND_URL`, Release `APP_TOKEN`, and microphone
  usage build setting?
- **Default if no answer:** Keep TestFlight handoff parked and do not change
  human-owned release/signing settings.

### D-creative-memory-delete-scope — What should memory delete remove?
- **Asked by:** codex
- **Asked at:** 2026-05-14
- **Why it matters:** This decides whether Claude PR #99 can ship a memory
  deletion route and what data it is allowed to erase.
- **Question:** Should V1 `DELETE /memory/forget` be creative-memory-only, so
  Codex can clear and merge PR #99 after Claude rebases/tests under the
  constraints in `docs/memory-export-delete-decision-packet.md`?
- **Default if no answer:** Do not merge PR #99.

### D-decomposition-sprint — Adopt the decomposition-sprint operating change?
- **Asked by:** claude
- **Asked at:** 2026-05-16
- **Why it matters:** Decides whether index.js 28k→~5k finishes at
  branch-merge speed (monolith feature-freeze + ≤2 WIP + fast-lane Codex
  SLA + acorn-closure CI gate + batched human gates) or stays on the
  current ad-hoc per-phase cadence that produced 158/359-commit-stale
  rebase tax this session. Full proposal:
  `tasks/_proposals/T-decomposition-sprint-operating-change.md`.
- **Question:** Should Codex propose a `DECISIONS.md` ADR adopting the
  decomposition-sprint operating change, for the human to accept?
- **Default if no answer:** Status quo — ad-hoc per-phase decomposition,
  no feature-freeze or SLA. No protocol change.

---

## Resolved

### D-auth-route-extraction-clearance — Clear auth extraction after rebase?
- **Asked by:** codex
- **Asked at:** 2026-05-14
- **Resolved at:** 2026-05-16
- **Resolution:** **Cleared (one-time, human/product-lead grant).** The
  human explicitly cleared the tier-3 auth gate for PR #212 this one
  time. Scope of the clearance: the **byte-identical** extraction of
  the 11 `/auth/*` routes from `backend/index.js` into
  `backend/lib/auth_routes.js` only — it does **not** change any auth
  contract, handler, or policy and is **not** a standing/blanket auth
  clearance. PR #212 was rebased onto current `main`, the dependency
  boundary was verified deterministically with the acorn closure tool
  (`backend/tools/freevars.mjs`: free = `express` import +
  `AUTH_BODY_LIMIT` lib const; only injected dep is `userAuth`),
  `node scripts/pre_flight.mjs --strict` is clean, auth tests are
  44/44, and `cd backend && npm test` is 1181 pass / 0 fail / 1
  skipped. Codex may clear the `do-not-merge`/`tier-3` labels and
  merge under D005. Any future auth-route change still requires a
  fresh human decision.
- **Resolved by:** human product lead, 2026-05-16 (one-time gate
  clearance granted in-session; recorded by Claude, not authored).

### D-creative-memory-export-approval — Approve full memory export?
- **Asked by:** codex
- **Asked at:** 2026-05-14
- **Resolved at:** 2026-05-16
- **Resolution:** **Approved — V1 core-only (human/product-lead
  decision).** Deep review of PR #94 found a real IDOR: the optional
  `?projectIds=` path returned per-project logline history + accepted
  twists fetched **by projectId with no owner scoping** (logline/twist
  stores are projectId-keyed; ownership lives in `screenplay_store`),
  so a caller could export another user's project data from a
  privacy/data-control route. The human decided: **ship core-only for
  V1.** PR #94 now exposes `GET /memory/export` returning ONLY the
  requesting user's own creative-memory core (`creativeMemory`,
  `characters`, `habits`), strictly `userId`-scoped, unauthenticated →
  empty, no server-only metadata, `schemaVersion: 2`. The `projectIds`
  expansion was removed and deferred post-V1 to
  `tasks/_proposals/T-creative-memory-export-projectids-ownership.md`
  pending an explicit ownership-model decision. Codex may clear the
  `tier-3`/`needs-human` labels and merge under D005 after review;
  branch re-derived on current `main`, closure verified deterministically
  (acorn: zero free identifiers), `pre_flight --strict` clean, full
  backend `npm test` 1178 pass / 0 fail / 1 skipped.
- **Resolved by:** human product lead, 2026-05-16 (core-only V1
  decision; recorded by Claude, not authored).
