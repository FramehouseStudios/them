# Actual integration frontier — 2026-11-12

## Verified graph, not a branch code audit

A fresh GitHub metadata inventory contains **388 open PRs**. This inventories heads and bases; it does not prove all branches, code or product behavior. Snapshot: `/private/tmp/them-open-prs-landing-20261112.ndjson`, SHA256 `1f5f5448591560ea72db8bc3e2d6003e1f02cd789bd323bb58515b985990bd0f`.

The current original #997 base chain runs:

`#997 f68eb60f → #995 5c5062cd → #996 89657886 → #994 a45824a2 → #993 5287e587 → #992 c7ccafaa → #991 12b6b193 → closed #990 cb7eeb01 → #987 d7b12ac1 → codex/T-1267-recovery-multicopy-rehearsal 8ef7643e`.

#990 merged into #987's branch, **not main**. The 1267 branch has main `78b8c94f` as an ancestor, is **568 commits beyond main**, and has no PR matching its head ref. This is a missing review path, not permission to retarget the stack wholesale to main or publish a replacement PR containing the entire rehearsal. Preserve and reconcile the original PRs and intermediate source history.

#964 `ca019af2` is a directly reviewable main-based foundation. It is an ancestor of #997 through the separate provider-fence merge, but not of 1267/8ef. Landing #964 alone therefore does not close the missing rehearsal path. The human deferred its genuine non-author review. Main remains `78b8c94f`; strict up-to-date checks, Backend tests, Quality Gate, D009, one independent approval, stale dismissal and administrator enforcement remain enabled.

## First known red and exact limits

Original #987 current head `d7b12ac1ba78f5932fdadcf67b78ed9cac2db2ef` has failed Quality run [42692750316](https://github.com/FramehouseStudios/them/actions/runs/42692750316). Its signed units executed1477 with0failures (aggregate no skip clause); its writer validator succeeded; V1 executed70 with32skips and1failure, therefore37passes. The failure is `test_creative_partner_mode_reuse_and_to_page_callbacks`: **“To Page did not re-route the current exchange to the page.”** Native exit65; later recovery, voice and macOS stages did not run.

Later hosted #995 and #979 executions passed that same named test. Current source changes its earlier mode-selection setup, while the To Page action/route assertion are unchanged. Those later passes do not establish the original failure's cause or a permanent fix. The failed log and retained native artifact are being inspected. Do not rerun the old provider-capable workflow as a substitute for diagnosis.

The current #964/#997 updates have successful backend and D009 jobs; full Quality remains pending at this checkpoint. Chrome observation showed active Swift compilation in #997's unit-bundle step, not a unit-test body hang. No run was cancelled, restarted or relabeled green.

## Other original work is retained

- #638 is independently main-based, part of the rehearsal ancestry and currently green/review-required. #597, #613 and #972 are other independent ancestry fronts with stale bases, failures or conflicts. There is no justified single numeric merge order across these fronts.
- #422 remains an open original PR on main. Its original head is preserved in the current backup; do not replace or close it with a new onboarding PR.
- #633 branding remains open; inclusion in the current backup was not proven because its local commit object was unavailable in this bounded check. Do not claim the global rename is complete.
- Main's high Multer advisory is still open. The strongest backup already declares/locks Multer2.5.0, Express4.22.3 and qs6.16.2. This is exact package evidence, not a clean-security audit. Original #979 contains dependency and UI/proof work and remains a separate preserved review path.

## Prepared work and implementation priority

T1422 `642172d7` privately preserves the existing backend custody fixes above published #997, with exact archived backend3120/0/5 evidence. T1424 `cd992d48` adds the original writer-harness pipe fix; its whole backend matches the already-proven3121/0/5 tree. T1425 `112f5c62` privately carries #964's CI credit fence into original #979 while keeping all c508 product/backend bytes unchanged. These candidates are not new published PRs or new test runs.

**Publication hold:** T1422/T1424 require not only fresh #997 gates but also reconciliation of the earlier red/missing landing path. T1425 waits for fresh #964 gates, then any original #979 advancement needs fresh checks and human review. Do not push directly to main, squash, force, bypass review or manufacture replacement PRs.

**Active bug:** source trace found account-name hydration can hide a newer unfinished onboarding form without passing the action-ID guard. Auth/session reconciliation must remain connected; active writer input must remain owned and visible. T1426 is preparing one real local held-login regression before the smallest root-cause change. Already verified protected checkpoints are not deleted by this path; newest unverified words are not guaranteed captured. No production incident, wallet charge or automatic page submission is established by the trace.

After that fix, diagnose #987's actual To Page failure and reconcile the preserved original fronts into a reviewable bottom-up path. Physical signing remains at Xcode “No Accounts”/missing profile; no available connected phone was observed. Standard Debug localhost is phone-local, and public api.them.io health redirects to parking. Exact human clearance is in `docs/physical-iphone-preparation-2026-11-12.md`.

No new model call, deployment, main merge, credential entry, independent approval or production-hold change occurred. The full physical-phone/intended-backend journey remains unproven. The goal remains active.
