# Voice upload parser-buffering proof — 2026-10-08

## Scope and provenance

- Parent: #884, `1840690d71a79c2f5ce31dfd18b18530f0635ff3`.
- Branch: `codex/T-927-voice-upload-byte-limit`, isolated worktree.
- Existing #883/#884 Multer, URI and proxy dependency fixes are preserved.
- VERIFIED: individually legal metadata fields could previously aggregate
  above 33 MiB and still reach the handler (HTTP 200).
- DECIDED implementation scope: configured maximum audio bytes plus 8 MiB of
  context/MIME overhead is the aggregate parser budget (default 33 MiB).
  Existing field/file/name/part limits and error codes remain in force.

## Root fixes

1. Reject excessive declared Content-Length before invoking Multer.
2. Count raw Buffer bytes at Multer 2.4's supported streamHandler seam, including
   chunked bodies without Content-Length. Stop feeding Busboy above the budget.
3. Retain the bounded `413 / upload_too_large / stage: upload` envelope and
   `Cache-Control: no-store`; never echo rejected screenplay/audio content.
4. Drop rejected metadata and audio placeholders. Multer's storage cleanup
   removes its file copy, but completed `req.files` placeholders can retain the
   same Buffer. The file-first regression reproduced that 25 MiB reference.

## Proof

- Characterization: `/tmp/them-927-byte-limit-red-verified.log`, 0 pass/1 fail:
  HTTP 200 rather than the required 413, with every field individually legal.
  An earlier fixture accidentally hit the per-field ceiling and is not counted.
- Focused final parser/HTTP: 25 pass/0 fail/0 skip,
  `/tmp/them-927-header-focused.log`.
- Shipping image: `them-upload-byte-proof:927-final`, build succeeded; focused
  25 pass/0 fail/0 skip in its non-root, read-only runtime with tmpfs and no
  external network. Native source mounted read-only for field-name proof;
  backend auth uses synthetic test credentials, not production configuration.
  `/tmp/them-927-shipping-image-focused.log`.
- Node 26.7.0 full backend: 2,822 pass/0 fail/2 skip,
  `/tmp/them-927-proof-final-backend.log`.
- Node 20.20.2 full backend: 2,822 pass/0 fail/2 skip,
  `/tmp/them-927-proof-final-node20.log`. Test-only container includes
  bash/compiler tools required by existing harness tests; this is not the
  shipping image. External network is disabled.
- Signed units, dedicated erased iPhone simulator
  `11CF5EFB-D8C3-4F19-8062-28AF37F27D93`, iOS 26.2: 666 pass/0 fail/0 skip,
  `/tmp/them-927-signed-units.xcresult`. Swift source unchanged; this unit run
  does not prove native microphone/upload/provider behavior.
- macOS scaffold build-only: exit 0, `/tmp/them-927-mac-scaffold.log`.
- God-file gate and diff check pass. All five protected files are unchanged
  relative to #884; index.js remains 33,626 under the approved pre-stack count
  exception. Do not claim the later 33,603 rule is established here.

Focused checks cover declared/chunked rejection, 33 MiB exact acceptance and
one-byte-over rejection, active-file failure, completed-file cleanup, no
downstream handler call on rejected bodies, subsequent valid requests, and
authentication before generation. Full client names are extracted from Swift,
not copied into a stale fixture. A maximum 25 MiB file and 6,600 synthetic lines
are accepted with all native fields; exact CRLF wire text and transcript survive.
The native client currently clips its excerpt at 6,000 characters: this larger
fixture proves parser headroom, not full-script transmission by the client.

## Failures retained and adversarial limitations

- Initial new fixtures had incorrect client field/server URL names and FormData
  newline expectations; corrected to source-derived names and exact wire CRLF.
- First Node 20 full run: 2,819 pass/1 fail/2 skip (`write EPIPE` during the large
  anonymous upload already rejected by auth). The HTTP test now awaits the
  complete JSON response, with an independent deadline and no request retry.
- Completed-file red: 23 pass/1 fail, retained `req.files` buffer 26,214,400 bytes;
  fixed rather than dropping the assertion.
- Attempted immediate socket closure broke reliable JSON error delivery and
  stalled a fixture; experiment removed. No transport-close change ships.
- Local independent code review found no further critical code defect after
  cleanup; its declared-length test gap was closed. This is not a GitHub
  approving review and does not satisfy branch protection.
- NOT COVERED: Multer drains a rejected remainder; raw network bytes and
  connection occupancy are not hard-capped here. Follow-up: implement/prove
  bounded ingress/connection handling with an unfinished oversized stream and
  stable client failure behavior before claiming transport DoS protection.
- NOT COVERED: concurrent heap limits, physical microphone, live paid provider,
  production deployment, native large-upload error UX, full writer-loop UI or
  release configuration. No live model calls; credits remain unconfirmed.

## Landing

Draft stacked on #884, not a replacement for Claude's original work. Main is
unchanged at `647e01fcf17730d301aaa8a5072255ca7494c53c`. Required hosted checks,
independent approval, and the human-approved bottom-up merge sequence still
apply. Next task: inspect the pending hosted iOS gates and continue writer-data
safety proof; ingress hard-cap follow-up stays tracked above.
