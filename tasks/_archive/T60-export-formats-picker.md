---
id: T60
title: Consume screenplay export formats in Studio
owner: codex
status: merged
branch: codex/T60-export-formats-picker
pillar: mobile-first + screenplay craft
---

## Scope

PR #135 added `GET /screenplay/export/formats` so iOS no longer has to
hard-code the export contract. This task adds the app-side consumer:
typed decoding, a small view-state adapter for supported formats, and
a Studio export menu that can prefer backend-discovered formats while
keeping local fallbacks available when the backend is unreachable.

## Done when

iOS has typed client/model coverage for `GET /screenplay/export/formats`;
the Studio export menu can render supported formats from the backend
contract while preserving local fallback options; focused tests cover
decoding, fallback ordering, and unsupported-format filtering; handoff
docs tell support agent the endpoint has an app consumer.
