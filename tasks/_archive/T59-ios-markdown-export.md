---
id: T59
title: iOS Markdown Export
owner: codex
branch: codex/T59-ios-markdown-export
pillar: mobile-first + voice→scene
status: merged
---

# T59 — iOS Markdown Export

Owner: codex
Status: merged (PR #136)
Branch: codex/T59-ios-markdown-export
Tier: 1

Done when:
- The Studio export UI offers Markdown as a first-class export/share option.
- iOS sends `format=md` to the merged `POST /screenplay/export` backend contract.
- Export filename/type handling uses `.md` / `text/markdown` where applicable.
- Focused tests, full macOS tests, generic iOS build, and `git diff --check` are attempted and reported.
