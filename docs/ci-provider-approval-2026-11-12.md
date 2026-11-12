# CI provider approval — 2026-11-12

## Problem and fix

VERIFIED by source inspection: the previous Quality Gate supplied a provider credential to its whole job while starting a backend whose embedding warmup defaults on. A missing embedding cache could therefore initiate a provider request during otherwise deterministic checks. Actual hosted requests and billing are UNKNOWN; this is a demonstrated credential/startup path, not a claim of measured charges.

The original #964 now carries a narrow workflow repair. Pull-request/main checks receive an empty provider key; boot embedding warmup is disabled. Provider-capable gates require a fresh manual dispatch, a typed `live_approved=true`, and explicit requested scope. Only their validation and canonical gate steps receive a credential. Reusing an automatic caller or retrying a previously approved run cannot authorize spending. Unapproved paid requests fail before backend startup. Provider validation reports HTTP status without printing response bodies.

The optional PostgreSQL live-eval workflow loses automatic schedule/push triggers and requires explicit fresh approval inside both its preflight and paid job, including job-only retries. Its remote metadata was already `disabled_manually` and was not changed. This parks automatic **live-model** coverage; it does not claim a new offline PostgreSQL run. Unpaid ops-metrics alerts retain their original defaults, authentication and behavior.

## Proof

- Source implementation: `41d1a5d7818be365c02ec05d332e3a537f20616c`, descendant of original #964 `eaa94d0b07ce527d67e3ddb8ec9d5ef0a95bbbd8`.
- Focused workflow contracts: 18 passed, 0 failed, 0 skipped. Root independently ran the same source under cached Node 20.20.2, Docker network disabled, read-only frozen source: 18/0/0, 725 ms. Agent also ran host-Node contracts.
- Initial unfixed contract: 6 passed / 9 failed / 0 skipped. An intermediate test-fixture extraction failure (15/1/0) was fixed and retained in evidence.
- Canonical shell propagation and redaction checks use owned fake npm/curl and synthetic sentinels. They test actual shell bodies and current workflow expressions, not GitHub's full interpreter, actual provider egress or billing.
- Unique-key YAML parse, Node syntax, source identities, diff and D009 passed. All five god files have zero delta against the genuine published #964 head.
- App, units, UI sources, packages, backend, native runner and canonical quality-gate script are byte-identical to the previous #964 head. Required backend, signed units, writer, recovery, V1, voice and macOS steps remain connected. No unchanged app/backend suite was repeated locally.
- Root log: `/private/tmp/them-t1421-root-contract/node20.log`; source manifest: `/private/tmp/them-t1421-ci-provider-approval/proof.json`. Permanent evidence is in the adjacent `_proof/T-1421-ci-provider-approval-20261112` archive.

GitHub documents that `github.run_attempt` increments on reruns and that reusable workflows use the caller's GitHub context: [contexts](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context), [reusable workflow context](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations#github-context).

## Boundaries

Fresh hosted checks remain required after publication. Earlier green results are not proof of the new Actions interpreter path. This does not retroactively change earlier runs or unrelated workflows. No live provider/native/backend experiment was performed for this workflow-only repair. No main merge, independent approval, protection change, secret mutation or deployment is implied. The human's production hold and fresh paid-call approval requirement remain in force.
