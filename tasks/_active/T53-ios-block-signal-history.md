# T53 — iOS Block-Signal History Surface

Owner: codex
Status: in-progress
Branch: codex/T53-ios-block-signal-history
Tier: 1

Done when:
- iOS fetches `GET /memory/block-signal/history` through the typed backend client.
- The Studio block-signal nudge shows a compact history trend without blocking the writing flow.
- Failures degrade silently/non-blockingly.
- Focused client/UI tests, package tests, macOS tests, generic iOS build, and `git diff --check` pass or any environmental blocker is recorded.
