---
id: T-finished-script-end-guard
title: Stop page-lane writes after a screenplay terminal ending
owner: codex
status: review
branch: codex/T-finished-script-end-guard
pillar: voice-to-scene
v1_pillar: screenplay
v1_effect: prevents Clementine from silently appending pages after a saved screenplay's THE END marker
---

## Scope

Before Page-lane reservation or model generation, inspect the authenticated
project's canonical saved draft. Reject default/after-ending append requests
when it contains a standalone Fountain `THE END`; allow explicit anchored
rewrites. Do not trust the request's draft excerpt as authoritative.

## Done when

Focused tests prove terminal-marker parsing, allowed earlier rewrites,
fail-closed persistence/project lookup, and rejection before wallet/page
reservation or model dispatch. Full backend tests, the god-file gate, and
`git diff --check` pass without changing pinned god files.
