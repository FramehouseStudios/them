# THEM branch review — 2026-09-30

## Authority and scope

DECIDED: the founder requests review of every remote branch, preservation of
Claude's existing work, and merge commits in this order: #766, #770, then the
actual product stack beginning #638. No squash, replacement implementation,
direct main push, branch deletion, or protection bypass is authorized here.
This newest request supersedes D007's older port-only workflow for this work.

DECIDED: #766 and #770 may retain main's unchanged 33,626-line index.js so the
data-loss fixes can land first. Enforce exactly 33,603 after the product stack
establishes it. Never pad or delete meaningful code solely to meet a count.

## Complete inventory, not complete product proof

VERIFIED snapshot: main `647e01fcf17730d301aaa8a5072255ca7494c53c`.
The [439-row branch ledger](branch-inventory-2026-09-30.jsonl) records every
remote branch SHA, ancestry, associated PRs, bases, and review status.

| Category | Branches |
| --- | ---: |
| Open PR | 279 |
| Closed PR only | 99 |
| Merged PR | 54 |
| No PR, including main | 7 |
| Total | 439 |

VERIFIED: 158 branch names start with `claude/`. PR history has 873 records:
279 open, 140 closed, 454 merged. Git ancestry: 271 branches descend from main,
109 diverge, 58 tips are already in main, and one is main itself. Nine branches
linked to merged PRs have current tips outside main's ancestry; check squash
history, stacked-base merges, and later commits before drawing conclusions.
No branch is dismissed because it lacks an open PR or uses an old name.

VERIFIED: following #877's actual bases yields 237 open draft PRs from #638,
excluding #766, #770, and #782. There are 42 other open PRs. No parent cycles,
missing parents, absent open remote heads, or PR/head SHA mismatches were found.
Metadata and ancestry coverage do not establish that all branch code works.

## Priority independent proof

- #766 head `f0c565c4d71bf26cbe320aeb0a0bfe51ebfdca98`: reviewed agreed-base
  guard and regression test. Signed erased-simulator themTests: 619 passed,
  zero failed. Backend: 2,739 passed, zero failed, two skipped. God-file gate
  and diff check passed. Claude's 2026-09-30 live reproduction is attributed
  evidence, not a live run performed by this reviewer.
- #770 head `beac630465f26f67f41071c55f2e09573a076b41`: actually based on #766.
  Reviewed stream-open text capture and textless-hello regression. Signed
  erased-simulator themTests: 620 passed, zero failed. Backend: 2,739 passed,
  zero failed, two skipped. Existing billing-era hosted checks rerun.
- Required protection: strict god-file check and one approving review, with
  admin enforcement. Quality Gate and Backend tests are checked manually too;
  they are not currently separate required protection contexts.
- The authenticated account authors these PRs and cannot approve its own work.
  HUMAN_INPUT_REQUIRED: another authorized GitHub reviewer must review/approve
  the exact final heads. No self-approval or admin override is assumed.

## Findings retained for the product-stack review

- VERIFIED #870 grows ScreenplayLiveDraftBridge from 12,588 to 12,595 against
  its parent. Its body claims no growth; hosted gate contradicts that claim.
  Preserve its typed-cue fix and repair the seven-line growth before landing.
- VERIFIED full static parent-relative counts cover all 279 open PRs. Of the
  237 product-stack PRs, 49 grow at least one tracked god file; another nine
  open PRs outside the chain grow files. The first stack failure is #643:
  RootExperienceView 15,031 -> 15,033. Running the canonical gate on its exact
  head with GITHUB_BASE_REF=claude/pages-port independently reproduces failure.
  Passing against today's main is not sufficient after prior shrinkage lands.
  The exact index count is first established by #722 and holds at all later
  stack heads. This is static evidence, not runtime proof.
- VERIFIED #855 contains the deterministic title word-list follow-up; #869
  contains the IOThemTypography follow-up. Always review/merge latest heads.
- SOURCE REVIEW #861 is additive and resolves authenticated project ownership.
  Its client suppresses settings-send errors; durable cross-device settings
  under failed sends and in-flight reordering still need independent proof.
- Claude's full HANDOFF-2026-09-27 and SINE-DIE/BUGS-found-2026-09-30 records
  were read and retained as review inputs. Replay proof does not establish live
  model quality, and aggregate tip counts do not prove each parent diff.

## Other safety drafts are not proven redundant

SOURCE REVIEW: bodies and consequential code were compared for #609, #610,
#614, #615, #617, #618, and #620 through #635 against #877. No complete PR in
that set was proven redundant. Partial overlap does not authorize deletion.

- #622 retains identity/epoch guards missing from the stack's ETag cache path.
- #625's wallet settlement/release is absent from the stack; its current head
  already handles asked_repeat and continue_listening recovery outcomes.
- #634's cancellation-owner boundary is absent from the stack. The current
  stack route still prefers caller-supplied user_id and accepts a reservation
  without proving its owner. This must be resolved before release.
- #617/#618 contain distinct durable receipt and follower-save proof protocols;
  reconcile with #832/#833 rather than assuming the stack replaced them.
- #631 preserves memory through a rename, but its 60-line index extraction and
  weakening exact assertions to ceilings conflict with the newest exact-count
  rule. Preserve the migration while resolving that conflict explicitly.
- #627's reachability guard intentionally fails on 52 unresolved modules; it
  is not currently merge-ready. Complete dispositions, do not waive the guard.
- #635's request-stop ledger retains bounded process-lifetime state; safe
  admission expiry, restart durability and multi-worker behavior remain open.
- #610 uses 55-line targeting, while the stack uses 54; #615 evolves that core.
  Reconcile the existing implementations before any integration choice.

These are preparatory source findings, without independent runtime proof of
those 22 drafts. The remaining 20 extra-open PRs still require source review.

## Human product decisions remain open

HUMAN_INPUT_REQUIRED: editor/print element identity (#80); writing after THE END;
drafting beats from finished scripts; whether Lines/Page changes true layout;
explicit iPhone PDF export approval; server-script privacy disclosure; act
selection without an outline. No behavior or privacy copy is silently chosen.
Engineering follow-ups include the second element sync per keystroke and
full-Studio rendering on status updates.

## Next sequence

Finish exact-head proof and required reviews for #766; merge with a merge
commit; retarget #770 to main without deleting either branch; refresh proof and
merge #770. Then update #638 with the two fixes while retaining its commits,
prove its complete diff, and repeat bottom-up. Stop at the first failing check.
All remaining branch categories stay in the ledger until individually reviewed.
