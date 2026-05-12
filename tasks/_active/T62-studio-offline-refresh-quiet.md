---
id: T62
title: Quiet offline Studio export-format refresh
owner: codex
status: in-progress
branch: codex/T62-studio-offline-refresh-quiet
pillar: mobile-first + infra
---

## Scope

T60 added backend-driven export format discovery. The Studio currently tries
that fetch automatically on view load, which creates noisy localhost failures
in test/offline runs even though local fallback export options are available.

## Done when

Studio still discovers backend export formats when appropriate, but app/test
launches do not surface noisy localhost connection failures; manual Refresh
Formats remains available; focused tests cover the quiet/fallback behavior.
