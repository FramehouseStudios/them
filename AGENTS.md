# AGENTS.md — io.them Operating System

## North Star

> io.them is a mobile-first AI screenplay studio built around a living creative companion. It helps writers turn voice, fragments, and emotional impulses into properly formatted scenes — fast — while learning their style, characters, tone, and creative habits over time.

Every change should move the app closer to a stable, usable, emotionally cinematic writing experience.

## Active ownership model

- The human is the product lead and final authority for product direction, privacy policy, release credentials, App Store metadata, and merges that materially change risk.
- Codex is the active implementation owner. Build, verify, document, and keep moving.
- Historical task records can contain older `support` ownership metadata. Treat that as history, not a live instruction to create or wait for another assistant lane.
- New work uses `codex/<task-id>-<short-name>` branches unless the human explicitly asks for a different branch.
- Do not push directly to `main` during normal development. Use scoped PRs for implementation work.

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

## Self-checking loop

Every meaningful implementation pass follows the same strict loop:

1. **Plan** — state the single next target and its binary success criteria.
2. **Do** — implement or improve the real product behavior.
3. **Verify** — run the strongest relevant checks and report every failure or skip honestly.
4. **Decide** — if every criterion passes, commit and continue; otherwise fix the weakest result first and repeat.

Do not call work complete until it is connected, verified, and usable, or a specific external or human-authority blocker is documented.

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

## Verification expectations

- Swift/UI changes: run focused `xcodebuild` tests when available; run a broader build or test target when risk is high.
- Backend changes: run focused Node tests plus `cd backend && npm test` when practical.
- Script/workflow changes: run `node --check`, focused `node --test`, and `git diff --check`.
- Release changes: run `scripts/run_release_preflight.sh` or the most relevant preflight script.
- Documentation-only changes: run link/path/static checks where useful, and always run `git diff --check`.

Report skipped verification plainly. Never claim a test passed if it was not run.

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
