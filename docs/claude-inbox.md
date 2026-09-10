# Support inbox

Snapshot: September 8, 2026. Read `AGENTS.md`, `DECISIONS.md`,
`docs/coordination.json`, and `docs/branch-audit-2026-09-07.md` first.

## Current product lane

The next milestone is a dependable, production-configured iPhone writer beta.
The visible app name is **THEM** under D015. Clementine remains the named
creative companion and the orb remains the product's visual heart under D014.

The only current app landing train is:

1. #590 — dependable iPhone Files export.
2. #591 — narrow-width Pages navigator.
3. #592 — Clementine voice across all six Studio tabs.
4. Reconstruct #422's authenticated first-run behavior after #592.

The current backend safety train is separate. Each successor branches directly
from #596 so unrelated safety changes remain independently reviewable:

1. #596 — restore the green backend baseline.
2. #597 — context-aware, Fountain-correct character-cue linting.
3. #598 — parser-backed child-process safety guard.
4. #599 — fail-closed, self-describing release preflight.
5. #600 — safe Dependabot configuration reconstructed from #456.
6. #602 — pinned Node 24 LTS runtime across local, CI, and Docker surfaces.
7. #603 — explicit, clock-free FDX title metadata reconstructed from #442.
8. #604 — canonical APP_TOKEN_RELEASE wiring for the full Quality Gate.
9. #605 — no-op outbox notification suppression reconstructed from #481.
10. #606 — archive obsolete root prompts, reconstructed from closed #466.

The implementation successors have clean local relevant-suite evidence. Hosted
Actions now execute, but each exact candidate must complete its own required
gate after rebasing onto the corrected baseline; do not merge around a failed,
pending, or superseded run.

Do not open or extend another cumulative product stack. Do not merge, rebase,
or revive #445, the 36-PR `clementine/smooth-*` chain, or the 15-feature Claude
Studio chain. The exhaustive keep/port/retire decision is in the branch audit.

## Hard gates

- GitHub Actions billing was restored on September 8 and jobs now execute.
  #596's design-token repair is running the complete required gate on exact SHA
  `e3cb72a` in run 34272801038. No implementation merge until that exact
  candidate receives the complete required green checks.
- Render correctly refuses the newer production build while
  `APP_STORE_ISSUER_ID`, `APP_STORE_KEY_ID`, and `APP_STORE_PRIVATE_KEY` are
  absent. Do not weaken the fail-closed guard or redeploy the candidate.
- Printing remains Release-off by default, opt-in, and protected by its hard
  kill switch.
- Production credentials, DNS/privacy proof, physical-device/provider
  acceptance, and TestFlight signoff remain separate human/release gates.

## What support should do next

Until the app train lands, support work is limited to one fresh, small branch
from current `main` at a time. Priority order:

1. Rebuild #456 only as independent changes: Dependabot with real labels;
   reproducible third-party notices; a real private security-reporting channel;
   a proven current gitleaks workflow; and CodeQL only after GitHub Code
   Security is enabled. Never reuse its stale RC notes.
2. #481 is closed and safely reconstructed as #605 without its stale-cache
   change. After the app train, review only #482's owner-scoped ETag tip.
3. Reconstruct the D009 backend sequence one independently mergeable,
   domain-owned slice at a time. #461–#465 are closed after architecture audit;
   do not revive their stale cumulative stack.

#442, #455, #460, and #477 are complete as stronger successors #603, #599,
#598, and #597. Their source PRs are closed and their branches are preserved.
#456 is closed after review: its reporting channel was unavailable, both
security workflows had failed, and its release notes claimed unmerged features
were shipped. Its safe Dependabot slice now lives independently in #600.
#436 is also closed: it had no producer, wrote an internal TODO marker into
screenplay text, and its advertised answer action did not resolve that marker.
#466 is closed and superseded by #606, which preserves the historical prompt
contents and Git history while clarifying that the archived files are not live
instructions. #431 is closed after product audit; its raw speech ghost should
return only as a global, responsive Clementine hearing state with lifecycle and
transport parity. #435 is closed after a P0 pagination audit reproduced a
nonterminating export path and content-integrity failures. #461–#465 are closed
after architecture audit; future extraction work must have shape-aware
dependencies, live route coverage, domain ownership, and current proof.

#443/#444 remain under audit. Do not enable them until next-beat batches have
owner/project/version/request identity, stale invalidation, stable retry
identity, honest cost copy, and signed iPhone-width proof.

## Reporting contract

Every proposed port must state:

- the exact source commit and the current-main commit it becomes;
- the V1 outcome;
- what inherited stack content was deliberately excluded;
- focused tests and full relevant gate results;
- whether required GitHub checks actually executed.

Use:

```bash
node scripts/agent_next.mjs --role=support
node scripts/coordination_state.mjs read
```

No production mutation, branch deletion, PR closure, or merge is authorized by
this inbox alone.
