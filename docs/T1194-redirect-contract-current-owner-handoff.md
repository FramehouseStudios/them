# T1194 — redirect coverage follows the canonical transport

- Base: `28f3c396fbbb349ab66254104fda4151c88be154`.
- Branch/worktree: `codex/T-1194-redirect-contract-current-owner`, `/Users/halfmutantfilms/io.them-worktrees/codex-redirect-contract-current-owner`.
- Scope: redirect coverage test, one explicitly authorized DEBUG fixture caller, and this handoff. Parent source and all prior helper branches were untouched.

## Root causes and changes

The old lint stopped at the first closing parenthesis inside a retention closure and misidentified the product-owned transport wrapper as native URLSession. Its dedicated-session check also searched BackendClient after the real delegate moved to BackendTalkStreamingTransport.

Coverage now scans balanced calls and requires a top-level canonical delegate argument for native data/bytes calls. Only explicitly qualified `BackendTalkStreamingTransport.data` may delegate that proof to the canonical transport owner. The wrapper's actual session/delegate binding, exactly one dedicated dataTask, and redirect callback forwarding to `BackendHTTPRedirectGuard.shared` are asserted. Negative source fixtures prevent nested/string delegate tokens, unknown/bytes wrappers, nil delegate, absent/replaced redirect forwarding, and extra dedicated sessions from passing. This remains coverage lint; semantic callback proof belongs to native tests.

The repaired lint uncovered a real missed caller: `OfflineTalkPageRecoveryUITestFixture.swift` used `URLSession.shared.data(for:)` without the guard. Added the canonical guard argument and reviewed that native surface. DEBUG and loopback restrictions remain unchanged; no exclusion was added.

## Proof and limits

- Focused Node 20.20.2 run initially recorded **3 pass / 1 fail / 0 skip**, identifying the missed fixture caller.
- After its fix, the same focused file recorded **4 pass / 0 fail / 0 skip**, 325.953001 ms test duration.
- Runs used cached `them-foundation-proof-tools:node20`, `--network none`, and the task source mounted read-only at `/repo`.
- `git diff --check` passed. No provider/network calls, full backend/native/UI runs, push, merge, or main changes were performed here. Prior parent native results do not cover this new fixture line before integration.

Preserve this local commit after the parent source freeze, then compile and verify the final combined source under the parent's checkpoint process. Helper freezes at handoff.
