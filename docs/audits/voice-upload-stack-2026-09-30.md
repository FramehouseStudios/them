# Voice-upload security integration — 2026-09-30

Goal criteria 4/6/7/8. Parent #882 `0e1465fa`. Exact #612 commit `af38065a`
ported with `cherry-pick -x` as `66f7dcd9`; original branches remain intact.
#616's dependency changes match #612's, but lack its upload bounds/error tests.
No work is silently closed, discarded or deployed. #766 → #770 still land first.

VERIFIED: original #612 passes 14 security cases but rejects the current Swift
voice builder's complete field-name envelope with 413. Source-derived contract
test detects 71 possible metadata field names, not a hand-copied fixture list.
The corrected parser allows 80 fields plus one file, rejects 81 fields, bounds
parts at 82, and retains 25 MB/file, field-size/name and structured-name limits.
Metadata is not silently dropped to fit the limit. The source-envelope test
proves parser compatibility, not an actual native audio capture/provider turn.

Current npm audit found a newer moderate Multer 2.3.0 advisory and high fast-uri.
Vendor [GHSA-3pph-fpjx-jg34](https://github.com/expressjs/multer/security/advisories/GHSA-3pph-fpjx-jg34)
identifies disk-storage abort cleanup and patched 2.4.0. THEM uses memory storage;
no claim that this disk-specific exploit reaches its voice endpoint. Upgrade to
2.4.0 nevertheless establishes the current patched dependency baseline.
After upgrade, production-dependency audit reports one high package: fast-uri;
no Multer finding. Existing #782 is the next upgrade candidate, not bypassed.

Proof: focused 17/17, including a full server with REQUIRE_USER_AUTH=true:
anonymous upload returns 401, authenticated unsafe names return 400, excess
fields return 413, health stays 200. Parser harness verifies normal file/audio
aliases, full client field envelope, 80-field acceptance, excess/nested/oversized
payloads and malformed input. No ASR/model needed for rejected uploads.
Signed full units on erased E37CE808: 666/666; no Swift code changed.
Parent-relative god-file gate all five +0; Node syntax and diff check pass.
Earlier full backend with corrected limits and Multer 2.3: 2,809 pass/0 fail/2 skip;
same numbers on 2.4 before adding the full-server auth test. Original failed
compatibility run (14 pass/1 fail) and both audits retained.

The next full run stalled in the confirmed-live `realtime_routes_deeper` worker,
not `realtime_turn_commit_route`. Its cwd/command were checked before stopping
only that worker with SIGTERM after over two minutes. Run retained: 2,808 pass,
one deliberately terminated worker failure, two skips; not a passing full suite.
Brought forward Claude's `ed670e0d` migration of that fixture; the file matches
#877 verbatim. No assertion removed or retry added. Combined focused upload/
realtime proof then passes 26/26. This removes concrete socket/teardown hazards;
it does not establish one root cause for every historical hang.
Final full backend after fixture repair: 2,810 passed, zero failed, two skipped
(2,812 total, Node 20). Final signed units on erased E37CE808 again pass 666/666.

Artifacts under `/Users/halfmutantfilms/io.them-worktrees/_proof/branch-audit-20260930/`
use `voice-upload-stack-` prefix: client-repro, focused, focused-patched,
focused-auth, backend, backend-patched, backend-final, units logs/xcresult,
audit/audit-patched JSON and install/install-patched logs. Repaired fixture proof:
`focused-final.log` and `backend-fixture-fixed.log`; interrupted run is
`backend-final.log`.
Final iOS proof: `units-final.log/.xcresult`.

Not proved: physical mic, audible response, actual native multipart transport,
production provider/configuration, aggregate-memory/load resilience, full V1 UI
or deployment. Limits are a compatibility/security restriction, not a claim of
unlimited recording. Auth/session/concurrency guards precede production parsing;
their existence is not a measured load-test result. Never rollback to vulnerable
Multer 1.x. Early index remains approved 33,626; later stack establishes 33,603.
