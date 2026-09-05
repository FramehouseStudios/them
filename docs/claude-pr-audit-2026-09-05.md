# Open Claude-related PR audit — September 5, 2026

## Scope and meaning

All 11 PRs below were open when reviewed at the recorded heads. **Review complete
does not mean feature complete, approved for merge, or production verified.**
Useful corrections are now published in open
[#445](https://github.com/FramehouseStudios/them/pull/445), reviewed head
`d5763d4`, base main `9c74759`. The original audit itself did not merge, close,
comment on, or otherwise mutate the reviewed PRs. The shared writer-beta
checkout and Claude worktrees were not overwritten. The orb and Clementine
remain permanent product anchors.

### Current follow-up — September 5, 23:19 UTC

This section supersedes earlier in-progress verification statements below;
the original reproductions and reviewed-head dispositions remain evidence.
[#445's gate](https://github.com/FramehouseStudios/them/actions/runs/33988950331)
passed backend, signed units, native Mac exports and the real Files Cancel/Save
writer loop, but failed the required broader V1 Pages workflow after Previous
did not make page 2 current. Main's
[required gate](https://github.com/FramehouseStudios/them/actions/runs/33980301593)
still fails Save now's exactly-one-action assertion. **Do not merge #445 until
main itself and the current PR revision pass required checks.**

The supervisor's [#446 probe](https://github.com/FramehouseStudios/them/pull/446)
passed the required loop on a PR merge tree identical to current main, not on
the intended pre-#437 tree; optional smokes failed. Its separate direct dispatch
stopped before iOS for missing `APP_TOKEN`. Neither establishes print causality
or clears main. Exact run links are in [claude-inbox.md](claude-inbox.md).

#438 is now verified closed without merge; #440 remains open for the supervisor
to close or rescope. #443 is the selected backend foundation; #444 is its stacked
UI delta, not an independent backend. No new Claude pills/ghost PRs until #443
lands. Selection does not waive ownership/retry/cost/layout verification.
Printing stays Release-off, explicit opt-in, hard kill switch; no accepted
decision was changed by this refresh.

Subsequent local evidence:

- Node 20/PostgreSQL v4: **2,707 passed, zero failed/cancelled, one live-provider
  skip**, `/tmp/io-them-integration-backend-node20-full-pg-v4-20260905.log`.
- Final owner/auth adversarial focused set: **263 passed**; private exact owner
  identity and owner-scoped cache keys replace the earlier global collision
  concern. Unknown-commit and malformed-ack recovery remain fail-closed.
- Mac native export v4: **22 passed**, with both corrected renderer families
  visually inspected. All 19 corrected iOS fixture pages and nine Mac fixture
  pages were inspected earlier in this session; no physical-print claim.
- Local signed iOS export v1: **855 units passed**, but the clipboard test took
  866 seconds with pasteboard errors and native Files presentation failed.
  Later hosted real Files Cancel/Save passed; actual delivered file-byte readback
  is still missing. Do not erase this local discrepancy with the hosted result.

The following sections retain the original review chronology. Current work and
production blockers are summarized in [claude-inbox.md](claude-inbox.md) and
[writer-beta-readiness.md](writer-beta-readiness.md).

These are engineering dispositions, not new accepted product decisions.
GitHub mergeability/check state is transient; source review and scoped tests
do not replace current required checks. Production credentials, release
configuration, domain/privacy approval, distribution, and physical-device
acceptance remain separate gates in [writer-beta-readiness.md](writer-beta-readiness.md).

## Reviewed heads and disposition

| PR | Exact reviewed head | Local disposition |
| --- | --- | --- |
| [420](https://github.com/FramehouseStudios/them/pull/420) — CI cost | `5acce4f8323c6194d1c48a62e719023fb1d02a98` | Do not copy the old soft-gate policy into current required verification. |
| [423](https://github.com/FramehouseStudios/them/pull/423) — auth/index/ETag stack | `144aac6d12a84e269ffbacff68e436b51589441e` | Ported useful protections with additional security regressions; rejected blanket feature-UI softening. |
| [425](https://github.com/FramehouseStudios/them/pull/425) — V1 smoke fixes | `0ca4d1343a97d3a1d9e59a4dc24304ab46298216` | Reset/inspector fixes superseded by stronger integrated implementations; ported the missing Remember me visibility correction. |
| [431](https://github.com/FramehouseStudios/them/pull/431) — ghost preview | `b1af671170ffe44c24f3d5d2557d2766ffa0fa0d` | Not ported: ownership, cue grammar, and lifecycle must be corrected first. |
| [435](https://github.com/FramehouseStudios/them/pull/435) — backend PDF | `7e1a16477ef7fb8683c8a3bfbc0ba53672fe6b98` | Not ported or enabled: bounded review reproduced nontermination and silent content loss. |
| [436](https://github.com/FramehouseStudios/them/pull/436) — TODO clarification nudge | `468124dc1af0c2d30ae0ce52823358bdf4f3c086` | Not ported: restored drafts do not initialize the nudge; real narrow-UI proof is missing. |
| [438](https://github.com/FramehouseStudios/them/pull/438) — next beats in request body | `b38fc95fa8276909fe6bf96e2880551497de87a3` | Do not port; prefer #443's additive response field. |
| [440](https://github.com/FramehouseStudios/them/pull/440) — talk/ghost/print | `97596850effffcd6e294d4130a7a725a36c80cba` | No wholesale port; retain one print owner and Release-off default. Repair existing print correctness separately. |
| [442](https://github.com/FramehouseStudios/them/pull/442) — deterministic FDX date | `50787d1ad4ff53303d06c6d191f665a49bf70a31` | Ported, including additional whitespace/date-alias precedence tests. |
| [443](https://github.com/FramehouseStudios/them/pull/443) — additive next-beats response | `cddfca2dfbae331eb6d2f1284b2cd235baa35780` | Preferred foundation over #438, but **not ported** or enabled. |
| [444](https://github.com/FramehouseStudios/them/pull/444) — next-beat pills | `c9f915b9db7d546195b3aab7f1ec69e37d2e24b2` | Not ported: stale ownership and unknown-outcome retries are not safe yet. |

## Distinct work versus inherited stacks

- #423's 190-file PR diff is mostly inherited Codex work. Its merge-base with
  the verified writer-beta parent is `0a3e89cdf9ae6e3e7969e329888fdee3633310f7`.
  Only `fee58e7` (indexes), `66e5f3a` (ETag), `f60cb0f` (unknown commits), and
  `144aac6` (UI-gate split) are unique head commits reviewed for porting.
- #425 contains two unique commits, `23c7bca` and `0ca4d134`, atop #423.
  Its hosted failure occurred before UI execution in inherited
  `VoiceNetworkConditionSmokeTests.swift`; integration already has the typed
  expression decomposition fixing that compile error.
- #444 is a five-file, one-commit UI delta atop #443, not an independent
  backend implementation. #438 and #443 are alternative one-commit foundations.
  Do not combine their different ownership semantics.

## Corrections integrated locally

### Auth, conditional reads, and indexes (#423)

The original integration failed six new auth regressions. Porting #423
unchanged still failed both uncertain-rotation cases: a stale bearer remained
authorized after a committed rotation when canonical hydration failed.
The corrected implementation quarantines only affected local sessions and
fences snapshot writes. It does not revoke valid canonical rollback rows.
Refresh remains blocked while hydration fails; successful authoritative
reconciliation restores rollback retries, while a committed predecessor stays
invalid. Unrelated active sessions remain authorized.

The real authenticated `/memories` route reproduced an erroneous 304 for
`If-None-Match: ""`. Empty validators now return the full response; real
weak/strong ETags still return 304 and never bypass authentication. The HTTP
fixture first materializes account memory through `/tasks/update`: a brand-new
unmaterialized account otherwise synthesizes a time-varying empty-memory
default. Empty-account cache stability is a separate remaining concern.

`013_auth_user_scoped_indexes.sql` adds the two `value->>'userId'` indexes;
the importer registers it and existing `012_wallet_iap_persistence.sql` remains
unchanged. Scoped auth/memory/migration tests passed **270/270, zero skips**.
Disposable PostgreSQL applied migration 013, reran all 13 with zero pending,
and used both indexes on 10,000-row fixtures. This is not a production migration.

### UI fixture safety (#425)

Keep the integrated reset: exact owner-journal matching, explicit reset
arguments, regular-file/symlink checks, and surfaced failures. #425's broader
matcher and suppressed deletion errors would weaken it. Compact inspector
routing and selection-before-scroll safeguards are already integrated.
Remember me now reveals its actual containing profile scroll view and taps
the visible frame center, failing before interaction if the control remains
offscreen. Signed workflow execution is still required for that correction.

### FDX and existing print correctness (#442; review follow-ups)

FDX serialization is clock-free; the route supplies an injectable UTC date
only for a titled export lacking an explicit date. Whitespace in an earlier
alias cannot hide a later writer-supplied date; frozen input is not mutated.
`backend/lib/fdx_export.js`, `backend/lib/fdx_export_route.js`, and
`backend/tests/fdx_export.test.mjs` were updated. **25/25 tests passed.**

Separate fixes to the existing print implementation address UTF-16/grapheme
offset confusion, partial-success pagination, and the empty macOS print
adapter drawing method. The five-file scope is `ScreenplayPrintService.swift`,
`PrintScreenplayIntent.swift`, `ScreenplayPrintServiceTests.swift`,
`ScreenplayLocalExport.swift`, and `ScreenplayLocalExportTests.swift` under
their existing app/test directories. These are correctness repairs, not a
port of #440's second print owner or a change to the Release-off policy.
Focused signed iPhone print/Pages tests passed **19/19, zero skips**, and native
macOS tests passed **9/9, zero skips**. However, rendered-PDF visual inspection
then found vertically mirrored CoreText text on both platforms and an iOS
`CONT'D`/dialogue overlap. Corrections are in progress; print is **not complete
or visually verified**. Passing helper/native tests did not establish rendering
acceptance. Full integrated iOS and PostgreSQL-backed backend runs are pending.

## Why the remaining features are not accepted yet

- **#420:** old cost estimates describe soft jobs that are now required.
  The proposed label opt-in does not trigger a run when a label is added,
  because `pull_request.types` omits `labeled`. Optimize current measured
  optional work without downgrading deterministic required checks.
- **#431 / ghost portion of #440:** period-based splitting breaks `INT.` and
  `EXT.` headings. Ghost state lacks project/account/Studio-exit invalidation;
  a commit haptic occurs before request acceptance. Fixed indents and two-line
  caps still need narrow-phone inspection. Preserve canonical request ownership
  and cancellation before adding the preview.
- **#440 / print coordinator:** the picker path has no pending job for Cancel
  to invalidate, allowing overlapping pickers/spools. There is no cancellation
  check between selection and irreversible spooling. The countdown begins
  before spoken feedback finishes, lacks owner/project/session invalidation,
  and later rereads settings/renders instead of submitting an immutable
  announced job. Dismissal and printer failure collapse into the same message.
  Keep the existing Siri/Notes intent owner and Release-off flag; do not adopt
  this second coordinator or its Release-on default. Physical AirPrint and
  end-to-end voice cancellation remain unverified.
- **#435:** a 382-byte parenthetical-heavy draft looped without progress; a
  bounded worker exhausted 64 MB or was terminated at 500 ms. A 443,988-byte
  draft silently lost its final 70 lines, while a single 1,470,028-byte block
  bypassed the 400-page limit and returned 487 pages. Unicode becomes `?`
  before classification; a continued 32-character cue ends in incomplete
  ` (CONT`; a heading followed by a blank can be orphaned. Add progress and
  content-conservation guarantees, explicit limits/errors, Unicode-safe text,
  complete cues, actual-route tests, and rendered-PDF inspection before enabling.
  No PDF bytes were generated in this review. Existing iPhone fallback is
  Fountain/FDX/Markdown/Google Docs guidance; macOS retains local CoreText PDF.
- **#436:** nudge derivation runs in `draftText.didSet`, not restored-draft
  initialization. Marker matching inside arbitrary text and the narrow
  question/action row need tests. Keep its real jump/highlight/focus route;
  add restored-session and phone accessibility verification before porting.
- **#438:** model output is copied into `req.body.screenplay_next_three_turns`
  and `next_three_turns`, crossing the writer-canon boundary. Its parser also
  misses requested bullet prefixes. #443 is additive and tests that the
  request body remains unchanged; that makes it preferable, not verified UI.
- **#444:** suggestions carry no owner/project/version/draft/request identity;
  project/account transitions can retain them. An async voice response can
  publish stale suggestions, and the typed transport does not refresh them.
  Submission clears pills before the broader busy guard; error restoration
  reinstates old batches without context checks. Retapping after an unknown
  outcome gets a new request identity. Visible copy omits a cost clause present
  in the submitted prompt; touch-target and narrow-layout proof is incomplete.
  Reuse existing auth-context/request identities, scope and invalidate batches,
  preserve retry identity, and verify real transports before adding the pills.

The review also exposed a separate turn-metadata authorization defect during
integration: stored owner prefixes were doubled and a realtime write omitted
its trusted owner. Local corrections preserve the canonical owner, reject
known-owner mismatches before legacy fallbacks, and pass the server-authenticated
owner on realtime writes. **50 focused tests passed** according to the
implementing lane; complete integrated verification is still pending. Global
`turn-N` key collisions remain an availability concern despite fail-closed reads.

## Evidence and next gates

Local `/tmp` artifacts are diagnostic evidence, not retained release records:

- Auth red / original-PR red / corrected focused green:
  `/tmp/io-them-pr423-auth-red-20260905.log`,
  `/tmp/io-them-pr423-auth-original-port-red-20260905.log`,
  `/tmp/io-them-pr423-auth-focused-green-20260905.log`.
- Real memories HTTP red and final 270-test green:
  `/tmp/io-them-pr423-etag-http-red-20260905.log`,
  `/tmp/io-them-pr423-related-v3-20260905.log`.
- PostgreSQL apply/rerun/query plans:
  `/tmp/io-them-integration-pg-migrations-v2-20260905.log`,
  `/tmp/io-them-integration-pg-rerun-20260905.log`,
  `/tmp/io-them-integration-pg-index-plans-20260905.log`.
- FDX red/green: `/tmp/io-them-pr442-fdx-red-20260905.log`,
  `/tmp/io-them-pr442-fdx-green-20260905.log`.
- Focused signed iPhone print/Pages tests:
  `/tmp/io-them-integration-ios-print-20260905.log`. The subsequent rendered
  visual failures override any inference of complete print acceptance.
- Exact-head bounded PDF layout-only reproduction:
  `/tmp/io-them-pr435-layout-review.rstIuN/layout-review.mjs` and
  `/tmp/io-them-pr435-layout-review.rstIuN/review-results.jsonl`.

Next: complete the integrated backend and signed iPhone writer/recovery/UI
regressions; verify native print/export rendering and full-content retention;
retain failure artifacts; then reassess scoped PR-ready changes against current
main and required checks. No physical printing, paid-provider acceptance,
production deployment, TestFlight distribution, or broad beta signoff is
established by this audit. Do not merge the parked feature stacks wholesale.
