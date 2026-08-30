---
id: T-fix-214-audit-and-readme
title: Fix #214 follow-up — audit script + lib README precedent + task file with V1 pillar
owner: support
status: review
branch: support/T-fix-214-audit-and-readme
pillar: infra
v1_pillar: infra
v1_effect: infrastructure for "Backend `/talk` path exists and prompt assembly is centralized" + every other decomp checklist item
---

## Scope

Round-22 review of merged #214 surfaced three fixes:

1. **`backend/lib/README.md` cited #212 as "thin-delegate pattern"
   precedent.** #212 is open and unaccepted as of this PR. Only
   phases merged on `main` count as precedent for the lib pattern.
   This PR replaces the reference with an explicit "accepted
   precedents" list of the 5 phases that have actually landed
   (#183, #190, #192, #197, #204), and adds a note that open / in-
   review PRs are NOT precedent.

2. **`scripts/audit_inline_routes.mjs` conflated live route
   handlers with `app.all(..., methodNotAllowed(...))` 405-handler
   catches.** The pre-fix audit reported 98 "inline routes" when in
   fact ~57 of those are method-guards (not real handler bodies).
   This inflated the remaining-decomp estimate and misdirected the
   next phase. Fix: split the two categories. Output now shows:

   - Live inline route handlers: 41 (real bodies to extract)
   - Method-guard (`app.all` + `methodNotAllowed`) catches: 57
     (these belong in their decomposition target's lib but are
      mechanically tracked separately)

   Sort order is by live count descending; method-guards listed in
   their own section at the bottom. JSON output (`--json`) preserves
   both fields.

3. **Missing task file with V1 pillar/effect.** Every PR must
   declare which V1 checklist item it touches per
   `docs/v1-definition.md`. This file is that record. The
   audit script and the lib README are infrastructure for every
   decomp item in V1's checklist — they don't themselves close a
   checklist item, but they prevent future decomp PRs from
   misdirecting the next phase or making unaccepted-precedent
   claims.

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: infrastructure for all V1 backend-index decomposition
  checklist items (talk pipeline route decomposition, realtime
  route decomposition, screenplay route decomposition).`

## Verification

- `node scripts/audit_inline_routes.mjs` now reports 41 live inline
  routes + 57 method-guards (against current main).
- The `backend/lib/README.md` accepted-precedents list contains only
  merged phases.
- `node --check scripts/audit_inline_routes.mjs` passes.
- `node scripts/agent_event.mjs append --by=support --kind=pr_opened
  --pr=N --comment="..."` will fire on PR open.

## Done when

The three fixes are merged. The lib README references only accepted
precedent; the audit script reports live + method-guard counts
separately; the task file records V1 pillar/effect.

## Followups

- Future decomp PRs cite their direct precedent merged phase by PR
  number, not by phase number alone.
- Future PRs include the `V1 pillar:` + `V1 effect:` lines in their
  description per the rule at the bottom of `docs/v1-definition.md`.
