---
id: T-screenplay-prompt-build-schema-doc-v2
title: docs/schemas/screenplay-prompt-build.md
owner: claude
status: review
branch: claude/T-screenplay-prompt-build-schema-doc-v2
pillar: infra (schema discipline)
v1_pillar: screenplay
v1_effect: documents the POST /screenplay/prompt/build preview endpoint iOS uses to inspect assembled prompts without burning an LLM call
---

## Scope

Ships `docs/schemas/screenplay-prompt-build.md` — canonical
request + response shape for the prompt-assembly preview endpoint.

Covers: endpoint + body limits, schema version (1), PER-USER
posture, request shape with camelCase fallbacks, success
envelope, 400 error, invariants (no LLM call; flags reflect
which blocks were applied; craft_context requires both
include_craft_context AND a successful buildCraftContextBlock).

Plus INDEX.md row under Screenplay surface.

## V1 pillar / effect

- `V1 pillar: screenplay`
- `V1 effect: documents the preview-prompt endpoint iOS uses
  for the Studio "preview prompt" surface — useful for tuning
  during review without burning LLM calls.`

## Done when

`docs/schemas/screenplay-prompt-build.md` lands + INDEX entry added.
