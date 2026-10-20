# Original context for recovered voice writes — T-1031

## Problem and scope

Recovered replies had a service-reported project header, but no separate copy
of the original typed Studio request context. After relaunch or changing
projects, neither the open screenplay nor that response header can establish
the request's original target. Reconstructing that context during recovery
would risk attributing a result to the wrong script.

This change preserves the original project ID, document revision, target,
prompt source, write ID, anchor lines and insertion mode. It captures the
existing metadata value on both foreground retention paths, persists it with
the original request and carries it into the successful recovered receipt.
The established protected on-device storage and account partition remain the
owners; there is no new persistence, multipart parser or network path.

Duplicate enqueue/retry does not replace the retained context or original
multipart bytes. Older queue/receipt JSON without this optional field remains
readable and explicitly unknown. Review labels original context separately
from the service report. It does not infer either from the current project.

These fields preserve the typed request values, not a re-decoded wire body.
They are not an authorization grant, full draft snapshot or proof of unchanged
local text. A revision ID alone cannot detect unsaved editing. Review remains
read-only, including for a matching current project/revision.

## Verification

- VERIFIED: focused signed checks **25 passed / 0 failed / 0 skipped**, native
  exit0, on erased task-owned iPhone 17 Pro simulator
  `11CF5EFB-D8C3-4F19-8062-28AF37F27D93`, iOS 26.2 (23C54); signing enabled.
  This comprises22 existing outbox checks and three client checks; the new
  client check exercises both rejected and interrupted page requests.
- The real loopback HTTP fixture accepts the multipart request, then returns
  provider quota failure or truncates a successful response. The client must
  retain the original context after relaunch. Explicit replay must preserve
  every original body byte and write a receipt retaining that context even
  when the service reports a different project.
- Legacy queue/receipt decode and duplicate-enqueue checks are included.
- VERIFIED: existing macOS scaffold **BUILD SUCCEEDED**, native exit0, local
  ad-hoc signing. No interactive recovery-screen or physical-phone observation
  was rerun for this change.
- D009 passes against fetched `origin/codex/T-1030-joined-writer-recovery`:
  all five protected line-count deltas are zero. An initial attempt correctly
  failed because the baseline reference was not yet available locally.
- `git diff --check` passes. No backend runtime or dependency changed; the
  complete Node 20/PostgreSQL/integration proof for the parent is recorded in
  `joined-writer-recovery-2026-10-19.md`, not claimed as rerun for this change.
- Actual Xcode summary read with `xcresulttool get test-results summary`;
  completed bundle cloned and byte-compared into private evidence directory
  `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1031-20261019.FJe7eJ/`.
  Source logs: `/tmp/them-1031-focused.log`, `/tmp/them-1031-macos.log`.

## Adversarial review

- Answered: duplicate enqueue cannot erase original context or substitute
  multipart bytes; actual explicit-replay byte equality is asserted.
- Answered: a different service-reported project remains separate from the
  original project after receipt persistence and a fresh actor/relaunch.
- Answered: legacy queue/receipt JSON without the additive field decodes to
  unknown, not an inferred current project. Existing owned recovery checks pass.
- Not covered: unchanged local draft/anchor identity, durable server result
  retention beyond the existing metadata TTL, safe recovered-page application
  and real phone/provider behavior. No new apply action is exposed.

## GitHub and limits

Original #962 was normally advanced from `527c58d6` to human-approved
`f5e746c2146afd2050cad596d73f863961a72def`, preserving its base/history/draft.
Hosted run `39367137834` has successful Backend tests and D009; Quality Gate
was still running its required V1 UI step when this pass began. No new hosted
test count is inferred from a completed step alone.

No original #963/#653 head, main, production configuration, credential or DNS
changed. No paid model request was made. No physical-phone, live voice,
automatic recovered-page application or production-ready claim is made.

Next: capture a complete immutable original base/anchor identity, retrieve
missing authoritative output through the existing owned turn-result contract,
and connect an explicit guarded apply/save action. Never insert a preview,
reinterpret old context using the current selection, or silently append a
recovered result that may already be on the page.
