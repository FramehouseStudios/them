---
id: T-agent-operating-system-v1
title: Integrate the io.them agent operating system and master document prompt
owner: codex
status: review
branch: codex/T-agent-operating-system-v1
pillar: infra (enables all)
v1_pillar: infra
v1_effect: makes product doctrine, evidence discipline, and coding-agent execution rules discoverable and consistent for every future io.them task.
---

## Scope

- Integrate the founder-supplied permanent mandate into the canonical
  `AGENTS.md` without weakening current scope, verification, or merge rules.
- Preserve the strict plan/do/verify/decide loop requested for implementation
  work.
- Store the io.them three-document generation prompt as a versioned project
  artifact, with explicit precedence and evidence-label guidance.
- Link the operating system and master prompt from the repository README.

## Done when

- `AGENTS.md` clearly states the permanent mandate, evidence discipline,
  self-checking loop, and document-system precedence.
- The master prompt is complete, copyable, and resolves the mobile-first versus
  generic web-first conflict in favor of io.them's accepted North Star.
- Repository documentation checks and `git diff --check` pass.
- The update is pushed to a dedicated PR based on current `main`.

## Verification

- `node scripts/build_tasks_md.mjs --write`: passed; generated only this task's
  quick-view row and detail block.
- `node scripts/pre_flight.mjs --strict`: passed with no findings.
- `node scripts/tasks_active_frontmatter_eval.mjs --strict`: passed for 93
  active task files.
- `node --test scripts/tasks_active_frontmatter_eval.test.mjs scripts/tasks_sync_check.test.mjs`:
  5 passed, 0 failed.
- `node scripts/tasks_sync_check.mjs`: exited 0 with pre-existing legacy task
  filename/front-matter warnings and no finding for this task.
- Master-prompt contract scan found all three required documents, the evidence
  legend, Contract Gate, Decision Triggers, and terminal handoff status.
- Documentation link targets and `git diff --check`: passed.
- iOS/backend runtime tests were not run because this change is documentation
  and agent-operating doctrine only.
