# T-1059 — Live word separators are writer text

Preserve integration5391567: original #919c80c073 and #972571592e remain
ancestors. Red full signed SE run678/2/9 is retained, not retried unchanged.
Native video shows `lightsbefore`; To Page also fails visibility separately.

The live iOS/macOS line-normalization wrappers trim the current line before
calling completed-line formatting. Hypothesis: a just-typed separator can
be lost when those callbacks normalize the live line. That code observation
alone does not prove the intermittent Action UI cause. Character names and
scene headings also require word separators while typing.

Six actual native coordinator/binding cases run before any product change:
character-name word boundary, scene-heading trailing separator, Action and
dialogue binding-refresh paths, ordinary Action delegate control and the
existing completed-line formatting contract. No fake formatter or model API.

If confirmed, keep completed formatting unchanged and use one explicitly
live-line rule in the existing shared formatter; preserve trailing spaces/
tabs without adding a second text-binding policy or disabling screenplay
formatting. Require the unchanged exact uninterrupted native UI and broader
integration/recovery proof; no throttled typing, weakened assertion or
success claim from a small passing cohort. Main/production remain unchanged.

## Actual failing-first and correction

**VERIFIED:** unchanged product native before **2 passed /4 failed /0 skipped**,
native65, erased signed owned SE/iOS26.2. Bundle
`/tmp/them-1059-before/v1-ui-smoke-local-1-68534.xcresult`.
Actual coordinator collapses `JOHN DOE` to `JOHNDOE`, strips the heading/
dialogue suffix, and an Action binding refresh turns `lights ` into `lights.`.
Ordinary Action delegate and completed-line trim controls pass. This proves
those destructive native normalization paths; it does not alone prove the
timing origin of every intermittent uninterrupted Action failure.

Add one explicitly live-line operation to the existing FountainFormatter.
Live Action/dialogue return the exact raw input: do not run completed-line
cleanup that invents sentence punctuation or consumes a word separator.
Structural cue/heading/parenthetical/transition normalization retains its
existing core behavior while preserving the exact trailing whitespace suffix.
Both native iOS/macOS live wrappers pass raw text to that shared owner.
Completed `normalizeEditorLine`/document/import/export contracts are unchanged.
No new framework, binding policy, timer, delay or ignored assertion.

**VERIFIED:** same signed erased owned SE after **7/0/0**, native0: all six
unchanged native cases plus the exact single-call uninterrupted sentence.
Actual bundle `/tmp/them-1059-after/v1-ui-smoke-local-1-69312.xcresult`.
An initial summary lookup used a wrong filename and returned no evidence;
the actual discovered path above was read and confirms7 passes.

**VERIFIED:** full shared package: XCTest5/0 and Swift Testing10/0, native0;
`/tmp/them-1059-package.log`, separate `/tmp/them-1059-spm` scratch build,
two jobs. Includes Unicode NBSP, tabs/multiple spaces, structural formatting,
unchanged completed formatting and existing binding-policy tests. D009 vs
actual parent04a993f: bridge-24, other deltas0; whitespace passes.

Broader integration/recovery/macOS proof still required. The separate To Page
and clear-confirmation reveal defects are handled by the existing preserved
#625 reveal owner (T1060/T1058), not by weakening this exact-text test. Do not
promote this small7/0/0 result as universal word safety or phone completion.
