# T-986 — Preserve original #904 and prove real recovery

## History and scope

Original PR: https://github.com/FramehouseStudios/them/pull/904.
Original head: `a27c75a85309e8557163b009baf6e1573d403a0d` (still preserved).
Owned branch/worktree: `codex/T-986-original-904-recovery` /
`~/io.them-worktrees/codex-original-904-recovery`.

Normal merge `6f1ffa09017c3ff0f03ce8bcd869e8b560a5872d` has parents
`0f8a42c001f9f4a46bf729476a4d73e7c19e8a33` (current-main proof fixes)
and the original head above. No squash, replacement PR, force push, main
merge or original remote-head mutation at this checkpoint.

Reviewed original body/follow-ups and production changes before merging.
Retain its deterministic save-only offline fault, queued-draft restoration
before server hydration, drain project-readiness guards, recovery history,
exact-text assertions, stable inspector hit targets and title-field focus.
Only three proof-runner files conflicted. Resolutions retain the newer exact
erased-ID/signing/actual-summary rules AND original iPhone-only gating and
supported time-allowance flags. No requested recovery test was removed.

## Review correction

Original restore captured project/owner before awaiting the outbox, but did
not revalidate them before applying its returned draft. Compare the current
selection and current account/session intent against the captured context
at application time, using the existing canonical auth policy. Policy tests
cover stale owner/session plus the existing wrong-project/dirty-editor cases.
These are policy-level checks and code review, not a physical account-switch
race reproduction. Production/server isolation is not certified by them.

The workflow also now uploads the actual unique retained recovery bundle
path. Explicit iPhone-only runs validate only that claimed platform; default
cross-platform runs must validate both actual summaries. Mac compilation
remains a separate required gate, not an implied successful Mac UI run.

## Evidence at this checkpoint

- T-985 root harness commit `0f8a42c` is backed up on its owned remote branch.
  Full Node20 backend2747/0/2 and scripts223/0/0, focused14/0/0.
- Its actual signed main-based recovery repro completed0 pass/2 fail/0 skip;
  the corrected harness rejected it and retained actionable failures, rather
  than printing success. Bundle:
  `/tmp/them-985-recovery/them-save-recovery-4rLmRc/recovery-ios.xcresult`;
  log `/tmp/them-985-recovery.log`. Both failed during initial queue setup.
- D009 passes on the combined application: Studio screen17435→17431;
  all four other watched files unchanged, index.js33626.
- Full signed units632 pass/0 fail/0 skip on erased owned simulator
  `11CF5EFB-D8C3-4F19-8062-28AF37F27D93`, iOS26.2 build23C54. Actual bundle:
  `/tmp/them-986-units/v1-ui-smoke-local-1-51030.xcresult`.
- Full Node20.20.2 script suite224/0/0; backend2749/0/2. External network off,
  disposable data, no host database or provider credentials forwarded.
- macOS compile exit0 (preexisting warnings retained); canonical PR-shaped
  offline quality gate PASS with server/canon/heuristic craft/fresh craft
  completeness and recovery runner contracts enabled. Provider gates off.
- Logs: `/tmp/them-986-units.log`, `/tmp/them-986-full-node20.log`,
  `/tmp/them-986-macos.log`, `/tmp/them-986-offline-quality.log`.
- Real authenticated iPhone-only recovery:2 pass/0 fail/0 skip. Actual retained
  summary confirms the same erased owned UDID above. Both reconnect/relaunch
  and auth-refresh/stale-conflict/Keep Mine cases require exact full draft
  equality and exactly-once saved versions, not merely presence of a marker.
  Bundle `/tmp/them-986-recovery/them-save-recovery-uHuVOM/recovery-ios.xcresult`;
  log `/tmp/them-986-recovery.log`. This uses controlled DEBUG save failure,
  not a physical airplane-mode typing journey. The
  local UI harness backend uses host Node26.7.0; the complete backend suite
  above independently runs on the repository-pinned Node20.20.2 container.
- Original #961 head46a5b4e run39298823662 passed its hosted signed-unit and
  writer-loop steps; full V1 UI is still running. Overall green is unproven.

The reviewed combined executable tree is `e0477d5`. Writer/save/Markdown-export/
relaunch passed1/0/0 (`/tmp/them-986-writer.log`); that helper removes its
temporary result bundle, so no retained writer bundle is claimed.
Full signed V1 UI stopped red:27 pass/1 fail/9 skip on the exact owned erased
simulator. Retained bundle:
`/tmp/them-986-v1/v1-ui-smoke-local-1-54352.xcresult`; log
`/tmp/them-986-v1.log`. The failing direct-typing test's chunk9 expected
`motel sign`, but both UIKit and the draft model contained `motel sig`.
Root cause is not established; do not classify it as merely XCTest flakiness,
weaken the assertion, or retry unchanged to manufacture green.
Original #904's remote head remains unchanged. Hold its update pending the
first-red diagnosis and fresh proof, retaining review/protection gates.

## Shipping-readiness observation, 2026-10-19

Read-only authenticated Render inspection: backend service
`srv-dact95cmqu1s73bpjal0` serves last-successful commit
`a5ea13faada2a7411637354cb434017113c5e776`, not current main.
Public `https://them-backend.onrender.com/healthz` returns HTTP200.
`https://api.them.io/healthz` returns302 to a domain parking page. Render
reports Waiting for DNS and Waiting for Verification. Its required record
is CNAME hostname `api`, target `them-backend.onrender.com`; public DNS
currently returns `uixie.porkbun.com.` with Porkbun authoritative nameservers.
Requested human sign-in to the registrar to establish domain control before
any DNS change. No deploy, secret inspection, credential entry, or production
configuration change was performed.

The current production lockfile audit flags two transitive packages:
proxy-addr2.0.7 (critical) and fast-uri3.1.6 (high). This does not prove the
application is exploitable. Original #909 is being preserved/re-proved in
the separate owned T-987 worktree; not merged or deployed. Node20 is now
upstream EOL, despite remaining the repository-pinned compatibility proof;
a separately verified supported-LTS migration is still a release gap.

Production/physical microphone, live generation, external-open export and a
generated120-page Hollywood screenplay remain unproven. No paid call or
production configuration/credential change was made here.
