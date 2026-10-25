# T-951 — Original pages integration and bounded continuation

Goal requirements advanced: 2 (page agreement), 5 (full-length correctness),
7 (integration proof). This does not close #80 or prove printed exports.

## Provenance and acceptance

- Parent T-950 `ccb50270`; original #642 head `7c40428b`, base
  `claude/filmmaker-dialogue-port`, both original commits read.
- Preserving merge `66c89f56`, no conflicts; no original-head rewrite,
  replacement PR, squash, main merge or deployment.
- Binary criteria: bounded speech pages, every dialogue line exactly once,
  Unicode-safe Swift/Node parity on every rendered line, full Node20 backend,
  signed full units after owned-device erase, numbered page UI, macOS build,
  offline golden, D009 and diff checks.

## Reproduction and root corrections

- VERIFIED original engine: 14 filler lines followed by a 200-sentence speech,
  limit24, produced pages `[24,194]`. The first continuation placed the entire
  remaining speech on one page. A speech beginning at the page top instead
  used action overflow and omitted the continuation markers.
- VERIFIED original JS wrapping uses UTF-16 lengths/slices; wrapping repeated
  astronaut emoji at width2 returns detached modifier/ZWJ/surrogate fragments,
  unlike Swift Character wrapping. JS cue detection also excluded non-ASCII
  letters; Swift whitespace splitting handled only space/tab.
- Regression log `/tmp/them-951-pagination-red.log`: 7 pass, 2 fail before fix.
- Existing speech layout now repeats the reserve-MORE / repeat-original-cue
  boundary for every page. Start-of-page and near-footer cases share it.
  Independent tests assert all pages <=24 and complete ordered dialogue once.
- JS uses Intl.Segmenter graphemes to mirror Swift Characters; Unicode letters
  qualify for cues; Swift word splitting includes Unicode whitespace.
- Shared fixtures now include multi-page speech, emoji/combining characters,
  non-ASCII cues and NBSP; both suites compare every rendered line, not just
  counts and first/last text. Fixture generation remains the existing script.
- Focused backend pagination after corrections: 9/0/0 on the host. Node20
  full run and signed Swift parity pending; no pass claim yet.

## Existing repair to preserve

#893 `58c3ff33` is an additive repair based on #642: guard the iOS-only
navigationBarTitleDisplayMode modifier. Its body, full diff and provenance
were read. Integrate its original commit after the active Xcode run finishes;
do not edit Swift during a build or recreate the repair.

## Limits and next work

- These are deterministic/local checks, not microphone, model, phone or shipping
  persistence proof. No paid provider calls are required for pagination.
- Page card rendering still uses a coarse classifier; editor/export agreement
  (#80), page_flip reconciliation, title-page exclusion and later UI fitting
  work retain their existing original stack ownership. Do not claim this
  partial stack renders the final exported screenplay identically.
- Full-session 120-page UI responsiveness is not measured by these unit tests.
- Next original product boundary is #643 `86cc5b24`, base `claude/pages-port`.
  #893 is a sibling repair, not a replacement for that product boundary.
- #766 then #770 still require actual non-author approval before main landing.
