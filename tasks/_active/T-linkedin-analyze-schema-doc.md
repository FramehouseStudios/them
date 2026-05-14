---
id: T-linkedin-analyze-schema-doc-v2
title: docs/schemas/linkedin-analyze.md
owner: claude
status: review
branch: claude/T-linkedin-analyze-schema-doc-v2
pillar: infra (schema discipline)
v1_pillar: infra
v1_effect: documents the feature-flag-gated /linkedin/analyze surface so the TIER-3 SENSITIVE contract stays stable across future routing changes; not in the V1 checklist but adds coverage for a non-V1 user-data-handling route
---

## Scope

Ships `docs/schemas/linkedin-analyze.md` — canonical request +
response shape for the LinkedIn-analyzer endpoint gated by
`LINKEDIN_ANALYSIS_ENABLED`.

Covers: endpoint + body limit, schema version (1), TIER-3
SENSITIVE posture (career history + PII; no persistence),
request shape (profile_text OR structured fields; target_role
+ goals), success envelope (mode, profile_score, three array
fields, two rewritten-* strings), three error paths (400
missing, 400 analyzer-rejected, 503 feature-disabled),
invariants (score clamped; arrays never null; profile content
never persisted).

Plus INDEX entry under a new "Career / profile surfaces"
section.

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: documents the feature-flag-gated /linkedin/analyze
  surface. Not in the V1 checklist; this is contract stability
  for a non-V1 surface that handles TIER-3 SENSITIVE user data.`

## Done when

Doc lands + INDEX entry added.
