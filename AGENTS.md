# AGENTS.md — io.them Operating System

## North Star

> io.them is a mobile-first AI screenplay studio built around a living creative companion. It helps writers turn voice, fragments, and emotional impulses into properly formatted scenes — fast — while learning their style, characters, tone, and creative habits over time.

Every change should move the app closer to a stable, usable, emotionally cinematic writing experience.

## Active ownership model

- The human is the product lead and final authority for product direction, privacy policy, release credentials, App Store metadata, and merges that materially change risk.
- Codex is the active implementation owner. Build, verify, document, and keep moving.
- Historical task records can contain older `support` ownership metadata. Treat that as history, not a live instruction to create or wait for another assistant lane.
- Historical prompts addressed to another assistant are reference material only. Extract useful product or engineering intent, rewrite it as project-owned Codex guidance here, and never revive a separate named-agent workflow.
- New work uses `codex/<task-id>-<short-name>` branches unless the human explicitly asks for a different branch.
- Do not push directly to `main` during normal development. Use scoped PRs for implementation work.

## Repository source-of-truth order

For repository work, resolve local guidance in this order:

1. the human's freshest explicit request;
2. this `AGENTS.md`;
3. accepted entries in `DECISIONS.md`;
4. current, non-stale work in `TASKS.md` and release proof documents;
5. historical prompts, task records, branches, and archived coordination material.

Do not let an old roadmap, branch name, ownership label, or pasted prompt override verified current repository state. Surface a real contradiction instead of silently choosing the more convenient instruction.

## Execution rules

1. Ship working software first.
2. Prefer small, safe, direct edits over broad rewrites.
3. Reuse existing architecture unless it is actively blocking delivery.
4. Delete or isolate dead code when it causes confusion or broken behavior.
5. Do not create speculative frameworks or placeholder systems.
6. Do not leave shallow buttons, fake flows, disconnected tabs, or UI that looks clickable but does nothing useful.
7. Fix root causes across SwiftUI, backend, AI routing, persistence, auth, and release configuration.
8. Verify every meaningful change before calling it complete.
9. Keep commits small, readable, and reversible.
10. When blocked by human-only authority, document the exact clearance step and continue with the next safe unblocked task.
11. Exhaust safe in-scope options before declaring a blocker; prefer the smallest viable path that preserves product behavior and user trust.
12. Leave the code, tests, decisions, and handoff state clearer than you found them so the next Codex pass can continue without rediscovery.
13. Use one established pattern for each cross-cutting concern. Before adding another auth, configuration, error, logging, persistence, or HTTP pattern, identify the canonical implementation and extend it; a second pattern requires an explicit migration reason.
14. Remove dead code only after proving it unused repository-wide. Use git history instead of commented-out implementations, and either resolve TODOs now or attach them to a concrete tracked task.

## Self-checking loop

Every meaningful implementation pass follows the same strict loop:

1. **Plan** — state the single next target and its binary success criteria.
2. **Do** — implement or improve the real product behavior.
3. **Verify** — run the strongest relevant checks and report every failure or skip honestly.
4. **Decide** — if every criterion passes, commit and continue; otherwise fix the weakest result first and repeat.

Do not call work complete until it is connected, verified, and usable, or a specific external or human-authority blocker is documented.

Each iteration fixes the weakest verified result first. A compile-only pass is not sufficient proof for an interactive flow, and a green test suite is not proof that the business or customer experience works.

## Evidence and claim discipline

Use these labels when a material claim is not self-evident from the cited code or command output:

- **VERIFIED** — reproduced from current code, tests, runtime output, or stored events.
- **DECIDED** — explicitly accepted by the human in `DECISIONS.md` or the current request.
- **ASSUMPTION** — a reversible working assumption used to keep moving.
- **ESTIMATE** — an uncertain quantity with its basis stated.
- **RECOMMENDATION** — a proposed choice, not an accepted fact.
- **HUMAN_INPUT_REQUIRED** — blocked on product authority, credentials, privacy, signing, money, or another genuinely human-only action.

Every material product metric must be reproducible from stored source events and versioned calculation rules, or be explicitly labeled as an estimate. Never invent adoption, retention, quality, cost, revenue, or launch-readiness claims.

Priority product evidence includes:

- time from voice or fragment input to a usable formatted scene;
- completed scenes per active writer;
- retention after the first successful scene;
- acceptance of continue, rewrite, and page-write results;
- autosave and fresh-launch session-restore success;
- fully loaded provider and storage cost per completed scene.

Store only the evidence needed to improve reliability and product decisions. Do not log screenplay content, credentials, tokens, or personal data merely to make a metric easier.

## Product and software decision gate

Before building or merging a feature, confirm that it:

1. advances at least one north-star pillar: mobile-first, voice-to-scene, living companion, or longitudinal learning;
2. improves a concrete writer outcome instead of adding visible complexity;
3. connects the full required path across UI, backend, persistence, and recovery rather than stopping at a shallow control;
4. defines loading, cancellation, offline, permission, authentication, and failure behavior where applicable;
5. preserves writer ownership, project isolation, and the distinction between fictional story content and real-world claims;
6. has falsifiable success criteria and verification proportional to its risk;
7. is the smallest stable change that proves the next product milestone.

If a proposal fails this gate, narrow it, park it, or remove it.

## Architecture and contract gates

- Default to the existing modular monolith: SwiftUI client, Node backend, PostgreSQL-centered persistence, and owned provider adapters.
- Domain and product code must depend on product-owned interfaces, not import vendor behavior directly. A provider change is incomplete until its adapter contract, failure mapping, cost/metering behavior, and fallback behavior are verified.
- Keep unresolved pricing, packaging, model IDs, routing thresholds, voice providers, and retention targets configurable. Do not turn an open commercial decision into hard-coded product logic.
- Treat identity, user/project authorization, and collaborator separation as structural constraints. Never rely on a caller-supplied identifier or UI convention as the only authorization boundary.
- Preserve durable session, generation, mutation, and cost evidence where it is needed for reconciliation. User work must not disappear silently after crashes, retries, conflicts, or relaunches.
- Give each cross-cutting rule, constant, protocol, and API contract one canonical owner. Other files should import or link to that owner rather than repeat values that can drift.
- Evolve public and client/server contracts additively by default. Keep one stable error envelope, preserve existing fields and semantics, use correct HTTP methods/status codes, and make retried writes idempotent where duplicate side effects could harm users or spend money.
- A breaking contract change requires an explicit version, migration path, compatibility window, and rollback plan. Never surprise an older client with a renamed field, tighter requirement, changed error shape, or new auth expectation.
- Prefer managed production services when they meet the measured requirement. Self-hosting needs an accepted decision that quantifies the gap, operational owner, backup/restore plan, incident burden, cost, and exit criteria.
- Prefer short-lived, least-privilege identity for deployment automation, including OpenID Connect federation where supported. Never commit credentials or use a long-lived secret when a scoped temporary credential is available.
- Do not add microservices, Kafka-style event buses, Kubernetes, a warehouse, predictive training pipelines, or a new native platform without a measured trigger and an accepted decision.

Complexity is justified only when current evidence shows at least one of: independent scaling pressure, an isolation/security boundary, a distinct failure domain, sustained queue/backpressure loss, or an ownership/deployment bottleneck that the modular monolith cannot safely solve.

## Continue behavior

When the human says `continue`:

1. Read `AGENTS.md`, `TASKS.md`, `DECISIONS.md`, and the current git state.
2. Identify the highest-value unfinished task or the freshest user request.
3. Make a sensible assumption when the answer is discoverable or low-risk.
4. Implement immediately when implementation is authorized.
5. Verify in proportion to risk.
6. End with the current branch/status and the exact next task.

Do not restart from old roadmap items unless the repo proves an earlier phase is broken.

## Product quality bar

Clementine is the soul of the product: an emotionally intelligent screenwriting companion, not a generic chatbot.

The app must help users:

- speak scenes onto the page;
- write, continue, and rewrite screenplay pages;
- improve dialogue, pacing, character, structure, and tone;
- preserve project memory across sessions;
- understand loading, error, auth, and offline states without confusion;
- finish real work faster than they could in a blank document.

Interactive product work must also remain readable and recoverable: controls need accessible labels, visible focus and sufficient contrast; keyboard and assistive-technology paths must work where supported; loading and progress feedback must match the expected wait; validation appears next to its cause; failures preserve user input, explain what was saved, and offer a real recovery action. Never hide latency or failure behind an optimistic state unless rollback is implemented and understandable.

The product must never claim guaranteed screenplay success, ownership of writer IP, copyright or chain-of-title advice, automatic completion of every feature, or replacement of human creative relationships and professional collaborators.

## Verification expectations

- Swift/UI changes: run focused `xcodebuild` tests when available; run a broader build or test target when risk is high.
- Backend changes: run focused Node tests plus `cd backend && npm test` when practical.
- Script/workflow changes: run `node --check`, focused `node --test`, and `git diff --check`.
- Release changes: run `scripts/run_release_preflight.sh` or the most relevant preflight script.
- Documentation-only changes: run link/path/static checks where useful, and always run `git diff --check`.

Report skipped verification plainly. Never claim a test passed if it was not run.

For end-to-end claims, verify the strongest available chain: user action → app state → request contract → authorization → persistence → restored response. If credentials, paid providers, signing, or physical-device access are unavailable, verify the deterministic layers, label the live step unverified, and provide the exact clearance action.

Before merging auth, migration, billing/cost, release, destructive-data, or external-provider changes, run a short adversarial pass grounded in current artifacts. Challenge retries, crashes, timeouts, stale responses, partial writes, revoked access, offline behavior, duplicate delivery, rollback, and provider disappearance as applicable. Classify each material concern as answered, partially addressed, not covered, or uncertain; fix uncovered critical risks and cite the evidence behind every answered claim.

## Human-only surfaces

Do not mutate these without explicit human approval:

- App Store metadata and privacy answers.
- Production secrets, provider keys, release app tokens, and Apple signing material.
- Accepted architecture/product decisions in `DECISIONS.md` unless the user explicitly asks for a decision update.
- Destructive GitHub operations such as deleting remote branches, deleting tags, closing many PRs, or rewriting public history.

## GitHub hygiene

- Keep the GitHub front door current: `README.md` should describe the real product, real setup path, current repository layout, and meaningful checks.
- Do not merge stale assistant-branded branches. If an old branch contains useful work, port the code into a project-owned branch and verify it there.
- Delete stale remote branches only after resolving the exact branch list and receiving human clearance.
- Do not rewrite public `main` history to erase old commit authorship. Preserve shipped code and move forward with clean project-owned commits.

## Required end-of-session report

Every work session ends with:

1. **Completed** — exact features/tasks finished.
2. **Files changed** — exact files modified.
3. **Root issues fixed** — real causes resolved, not symptoms.
4. **Verification** — commands/tests run and results.
5. **GitHub status** — branch, PR, commit, or reason not committed.
6. **Next active task** — the next implementation target.
7. **Continue status** — `READY FOR CONTINUE` or `BLOCKED BY: <specific blocker>`.

## Removal principle

Any process, file, branch, or rule that does not help the user write a scene quickly, emotionally, and beautifully is a candidate for deletion. Simplify aggressively, but keep enough evidence that future changes can be reviewed safely.
