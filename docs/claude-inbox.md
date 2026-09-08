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

The current backend safety train is separate and stacked in this order:

1. #596 — restore the green backend baseline.
2. #597 — context-aware, Fountain-correct character-cue linting.
3. #598 — parser-backed child-process safety guard.

All three have clean local full-suite evidence. They remain blocked on the
same hosted Actions failure and must not merge around it.

Do not open or extend another cumulative product stack. Do not merge, rebase,
or revive #445, the 36-PR `clementine/smooth-*` chain, or the 15-feature Claude
Studio chain. The exhaustive keep/port/retire decision is in the branch audit.

## Hard gates

- Required GitHub Actions jobs currently abort before running because of the
  account billing/spending-limit block. No implementation merge until the
  exact candidate SHA receives the required green checks.
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

1. Port #455's truthful GREEN-versus-PARTIAL release-preflight presentation,
   excluding dated evidence.
2. Rebuild #456 only as independent changes: Dependabot with real labels;
   reproducible third-party notices; a real private security-reporting channel;
   a proven current gitleaks workflow; and CodeQL only after GitHub Code
   Security is enabled. Never reuse its stale RC notes.
3. After the app train, port only #481's session-churn tip and tests, then only
   #482's owner-scoped ETag tip.
4. Begin the D009 backend sequence with #461 alone only after the above work is
   reviewed.

#460 and #477 are complete as stronger successors #598 and #597. Their source
PRs are closed and their branches are preserved. #456 is closed after review:
its reporting channel was unavailable, both security workflows had failed,
and its release notes claimed unmerged features were shipped.

Do not merge #435 merely because its ordinary checks are green: adversarial
review reproduced nontermination, silent content loss, Unicode corruption,
incomplete continuation cues, and ineffective page limits. Do not enable
#443/#444 until next-beat batches have owner/project/version/request identity,
stale invalidation, stable retry identity, honest cost copy, and signed
iPhone-width proof. Do not merge #431 until ghost ownership, grammar,
cancellation, lifecycle invalidation, and narrow layout are corrected.

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
