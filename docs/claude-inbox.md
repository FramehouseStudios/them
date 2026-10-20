# Claude Inbox

Short handoff for the Claude/support lane. Read after `AGENTS.md`, `TASKS.md`,
`DECISIONS.md`, and `docs/coordination.json`. Codex owns this file per
`AGENTS.md`; the support lane created it on 2026-09-05 because `AGENTS.md` and
`docs/README.md` referenced it and it did not exist.

## Current review handoff (2026-09-30)

The founder explicitly requests preserving Claude's existing open PRs and
latest commits. The older snapshot and next-step instructions below are
historical; the current human request and AGENTS.md take precedence.

Codex recorded all 439 remote branches and the actual 237-PR product chain in
[draft #878](https://github.com/FramehouseStudios/them/pull/878). That audit PR
must remain behind the data-loss fixes. Landing order: #766, #770, then #638
bottom-up with merge commits, proof and required independent reviews.

Independent exact-head proof: #766 619 signed iOS units, #770 620; each backend
suite 2,739 passed, zero failed, two skipped. Simulator erased, signing on,
no paid model calls. Proof comments are on both PRs. Hosted Quality Gate was
still running at last inspection; backend and god-file jobs passed.
The founder will arrange required reviews at the end; none has been bypassed.

[Parent-relative findings](audits/stack-god-file-findings-2026-09-30.md) list
49 growing stack PRs. #643 is the earliest canonical gate failure; #870 has
seven added bridge lines. Preserve the fixes and coordinate repairs on their
existing PRs. The founder permits #766/#770 to retain main's 33,626 index lines;
exactly 33,603 is established at #722 and must hold thereafter.

Other safety drafts remain in scope: #625 wallet settlement, #622 cache identity,
#634 cancellation ownership, #617/#618 durable save proof, and #630/#633 identity.
The tip does not establish that those implementations are incorporated.
[Review record](audits/branch-review-2026-09-30.md) states evidence and limits.
Please post additional proof or corrections on the existing PRs to avoid
duplicate implementation. Human-owned product/privacy choices remain open.

## Historical entry points

Start with:

```bash
node scripts/agent_next.mjs --role=support
node scripts/coordination_state.mjs read
```

## Current Snapshot (2026-09-05)

Merged this week: #416 live typing between devices, #417 sprint security
rescue, #418 two-device UI smoke, #419 Quality Gate de-flake, #421 resilient
cross-device live drafts. GitHub Actions is running again after the
2026-09-03 billing block.

Open, in order of what unblocks launch:

| PR | Owner | Gate | What it needs |
| --- | --- | --- | --- |
| [#424](https://github.com/FramehouseStudios/them/pull/424) | support | tier 3, human merge | Boot-level IAP fail-closed (D011), `knowledge_cards.json` shipped in the image, `MUSE_MODEL` knob. Local suite 2518/0 fail; GitHub checks green, Quality Gate pending. After merge, set the four `APP_STORE_*` values in Render or production boot refuses by design. |
| [#425](https://github.com/FramehouseStudios/them/pull/425) | support | stacked on #423 | Six V1 smoke fixes. Lands after #423. |
| [#423](https://github.com/FramehouseStudios/them/pull/423) | support | needs rebase | Carries Codex's 41 unpushed keychain commits; conflicting with main until `codex/T-ios-keychain-token-migration` lands. |
| [#422](https://github.com/FramehouseStudios/them/pull/422) | codex | tier 3, human | Authenticated first-run resume. |
| [#420](https://github.com/FramehouseStudios/them/pull/420) | support | draft | Quality Gate PR-cost reduction; human decides on opt-in iOS smokes. |

Human-owned before launch: `render-app-store-secrets` blocker; the
`v1-release-preflight-config` blocker (Team ID, release token,
`scripts/run_release_preflight.sh` with the quality gate on); accept or reject
the D001 and D011 entries in `docs/proposed-decisions.md`.

Branch hygiene: `claude/pii-safe-request-logs` is a stale sprint snapshot cut
before #417. Its PII redaction is on main as #372, its backend work landed via
#417, and its three newest commits moved to #424. Do not merge main into it
(nine conflicting files including `backend/index.js`). Delete only after a
salvage audit of its iOS tree and human clearance.

Known local hazard: the main checkout on the release Mac carries ~411
untracked iCloud conflict copies named `<file> 2.<ext>` (TASKS.md T01). The
Xcode project uses synchronized folder groups, so the ` 2.swift` copies are
compiled and break the iOS build. Human-owned cleanup; not ignored by
`.gitignore` on main.

## What the support lane does next

1. Nothing net-new until #424 is merged and the Render secrets exist.
2. Backend-only follow-ups when asked: the D008 golden-set eval for
   `muse-spark-1.3` once a Meta key is provided; client handling of the
   fail-closed IAP credit path.
3. Keep every claim verified by a local run; paste the summary line.
