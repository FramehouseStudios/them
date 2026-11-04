# Cue-linter review checkpoint — 2026-09-19

Existing PR #597 remains the chosen replacement for #477; do not create a
duplicate. Local review branch: `codex/T-linter-cue-review`, commit `fddc0c2`.
Main `647e01fc` was merged locally without rewriting public history. The
remaining code diff against main contains only the linter and its tests.

Review corrections handle dual-dialogue extensions, Unicode combining marks,
and action paragraph boundaries. Reference: https://fountain.io/syntax/.

Verification already completed on this code:

- Focused format-linter tests: 31 passed.
- Full backend, Node 24.19.0: 2,746 passed, zero failed, two skipped.
- Full signed iOS tests: 618 passed, zero failures. Dedicated iOS 26.2
  simulator F5305122-ABF5-4661-A7E3-F96C1764EBD7 explicitly erased first.
- God-file gate and diff checks passed.
- First authenticated regression passed; subsequent speculative-reuse smoke
  failed against an unverified default backend. Not branch-specific proof.
- Isolated full gate on this branch, loopback port 18317: exit 1 at
  knowledge_betrayal_recovery, 0.641 below 0.720. No thresholds changed.

Logs: /tmp/them-linter-backend.log, /tmp/them-linter-ios.log,
/tmp/them-linter-quality.log, /tmp/them-linter-quality-isolated.log.

The first publication attempt was blocked by exhausted approval-service
credits. A subsequent authorized read-only GitHub check succeeded. This
update preserves public history and replaces the obsolete #596 dependency
note. Keep #597 draft pending the full quality gate and human review.

Next implementation: empty-page billing protection with a real generation
handler regression test. No changes for that bug are included here. No merge,
deployment, physical-phone update, or complete voice-to-saved-page proof.
