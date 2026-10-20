# T-1029 — Preserve the mentor contract without cutting quoted dialogue

## Original history and actual bases

Original #6538f5f4f2f remains open/draft on claude/mentor-last-image (#652).
No open PR currently targets original #963. Do not invent a literal GitHub
base chain: the original mentor parent is already an ancestor of the local
integration parent. Local preserving mergea7388c69 combines T1012 head9ffee7cc
and updated database candidate1ff16763; original #653, #963 and new #962f5e746c2
all remain ancestors. Only TASKS conflicted; both histories retained.
No original head/retarget, replacement PR, squash, main or production change.

Before the correction below, backend files were byte-identical to the earlier
proven T1012 tree; client/Swift/tests/Packages/project remain byte-identical to
the new database parent. No unchanged signed-client run is attributed here.

## Newly reproduced bug and smallest root fix

The opener filter's raw first-sentence regex stops at a period/question/colon
inside quoted dialogue when followed by whitespace. For a mentor praising a
multi-sentence quoted line with a craft reason afterward, it can discard the
first part of the actual dialogue and leave an unmatched closing quote. A
single-sentence quote did not reproduce this; the multi-sentence example did.

New tests before runtime correction, pinned network-disabled Node20.20.2:
4 passed/3 failed/0 skipped. Failures include complete quoted dialogue in a
real authenticated /talk response, quoted causal-verdict preservation, and
unfinished quote retention. This is not a model-generation failure inferred
from a prompt: production shaping reproduced it with synthetic input.

Reuse canonical same-length `maskQuotedSpeech` for sentence boundaries, then
slice the original text with those unchanged indices. Existing quote-aware
causal/critical-advice protection now sees the whole outside-the-quote
reason. Unfinished quoted fragments remain whole. No new parser, provider,
storage contract or prompt workaround. Bounded bland-opener removal and Page/
non-mentor bypass stay unchanged.

After correction: focused shape/causal/persona/HTTP suite30/0/0, pinned Node20,
network disabled, terminal exit0. The authenticated test verifies the actual
because contract, intact quoted line in response and TTS input, and unchanged
saved project. Provider transport is synthetic; no microphone, audible output
or live-model claim. Straight/curly/single/multiline/colon/question quotes and
Unicode text are covered. Logs `/tmp/them-1029-quote-before.log` and
`/tmp/them-1029-quote-after.log`.

Frozen correctionf20482c5: Node20.20.2 scripts231/0/0; offline mentor gate OK,
all40 golden/weak exemplar pairs separated and all six prompt-path checks
true. This is offline fixture validation, not live model quality. Actual JSON
summary read from the retained private report. Full backend2915 passed/0
failed/2 skipped (2917 checks,47 suites), terminal exit0. Skips remain ordinary
live-Postgres-prefix and opt-in live-model page-sync cases, not claimed green.
No --live flag or external network access. Log `/tmp/them-1029-node20.log`.
Only this record/TASKS change after frozen runtimef20482c5.

Initial local base-ref lookup refused a missing remote-tracking ref. Fetch
the exact prepared parent1ff16763, then D009 passes with all five deltas0.
Syntax/whitespace pass. No allow-growth bypass or source change to the gate.
The quote-mask boundary is deliberately conservative about unfinished quoted
material; it does not try to infer missing dialogue or repair model content.

Private evidence: `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1029-20261019.I3w24X/`.
Client identity uses new parent1ff16763, whose runtime is identical to #962f5e746c2
and has signed units869/0/0 plus the already documented app recovery proofs.
That parent evidence is not a new test run on this mentor branch.

## Scope and holds

Preserved original because contract and concrete-advice correction:
backend/lib/persona.js, backend/lib/mentor_reply_shape.js, existing mentor
shape/persona tests, causal tests and test-only provider transport. New manual
runtime delta in this pass is the six-line sentence-splitter diff; regressions
extend backend/tests/mentor_causal_preservation.test.mjs,
backend/tests/mentor_causal_preservation.integration.test.mjs and
backend/tests/helpers/mentor_causal_provider_stub.mjs. TASKS and this record
describe the combined scope. No god file/dependency/client change.

Original #962 hosted39367137834 is still live at last check; original #963
must not advance before it passes. Original #653 is rehearsed, not silently
retargeted or ready for main. Physical-phone/intended-backend proof remains
unverified; human production hold and no-paid-call constraint remain intact.
