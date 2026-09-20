# Multipart upload security

Branch `codex/T-multipart-security`, based on main `647e01fc`.

GitHub's 14 open Dependabot alerts all concern runtime Multer (12 high,
two low, including duplicate manifest/lockfile reports). Upgraded Multer from
1.4.5-lts to 2.3.0, with only its obsolete transitive dependencies removed.
Upstream release: https://github.com/expressjs/multer/releases/tag/v2.3.0
The isolated install used `--ignore-scripts`; npm audited 137 packages and
reported zero known vulnerabilities. The jsrsasign deprecation warning remains;
an audit with no findings is not proof of universal security.

The actual app middleware now caps field names, nesting, numeric indices,
field/file counts and total parts. Existing file-size policy is preserved.
Voice metadata is flat, with structured values encoded as JSON strings;
the limits retain up to four nesting levels and index 100 for compatibility.
Upload errors are handled by one extracted middleware: existing size errors
remain 413 with the same message, other Multer validation errors are 400 and
do not echo attacker-controlled names or values. Unrelated errors still pass
to the existing handler. backend/index.js shrinks eight lines.

Verification:
- Initial dependency-upgrade full backend: 2,739 passed, zero failed, two skipped
  (2,741 total), `/tmp/them-multipart-backend-full.log`.
- Real app upload middleware test passes: normal audio and metadata accepted;
  excessive nesting/index/name rejected; subsequent valid request still works.
- Diff and D009 checks pass.
- Full suite including limits/extracted handler: 2,739 passed, two failed,
  two skipped (2,743 total), `/tmp/them-multipart-backend-final.log`.
  Both failures asserted index.js must equal exactly 33,626 lines. The actual
  count is 33,618; corrected those assertions to enforce a nonempty file at or
  below the existing ceiling, consistent with D009. No ceiling was raised.
- Added explicit tests preserving the 413 size-error envelope and delegation
  of unrelated/headers-already-sent errors. Both focused upload tests pass.
- Full rerun passed: 2,741 passed, zero failures, two skipped (2,743 total),
  45.48 seconds, exit 0: `/tmp/them-multipart-backend-verified.log`.
- Final `npm audit --omit=dev --json` returned zero known vulnerabilities:
  `/tmp/them-multipart-production-audit.json`.
- No Swift changes; iOS/macOS suites were not run on this branch. Results from
  other branches are not attributed to this security change.

Adversarial review: bounded malicious field names are rejected by the actual
production parser, normal audio remains accepted, and a subsequent request
works after rejection. Responses omit submitted content. Existing file-size
error shape is preserved; unrelated errors are delegated. The new count/name
limits intentionally reject previously unbounded requests. Rollback must retain
the patched parser rather than reintroducing known vulnerable versions.

No merge/deploy/device installation or live provider calls. This does not prove
load capacity, every malformed stream condition, or production upgrade success.
