---
id: T73
title: Build iOS Fountain import surface
owner: codex
status: merged
branch: codex/T73-ios-fountain-import
pillar: mobile-first + screenplay craft
---

## Scope

Consume support agent PR #87's `POST /screenplay/import/fountain` contract from the
Studio app. Script text imports should use the backend Fountain parser when it
is available, fall back to local normalization when offline, and keep PDF/OCR
import behavior intact.

## Done when

The Studio can import Fountain/plain-text screenplay files from the document
controls, navigator, drag/drop, and iOS file importer path; imported structured
screenplays are projected back to editable Fountain text; focused backend
client tests cover the request and projection; and the repo handoff no longer
marks PR #87 as awaiting an iOS consumer.
