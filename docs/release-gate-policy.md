# Shared release provider-key policy

The wrapper already conditionally required OPENAI_API_KEY according to enabled
provider-backed checks. Its unconditional status-checker subprocess contradicted
that policy and prevented the documented disabled-check path from working.

Both now call `scripts/release_gate_policy.mjs`. Defaults remain enabled, including
empty flags, and every existing provider-backed consumer still requires the key.
Explicitly disabling all such consumers removes only that key requirement;
signing, app-token, config-file safety and other checks remain unchanged.
The status report marks the provider check skipped and explicitly warns that
configuration readiness is not live quality or release-acceptance proof.

Verification: 28 focused policy/status/wrapper tests passed, zero failures:
`/tmp/them-release-gate-policy-final.log`. Shell syntax and diff checks passed.
Tests cover missing/empty flags, each enabled consumer, explicit skips, secret
redaction and private-file permissions/symlinks. No backend or Swift code changes;
their full suites were not run for this tooling-only change.

No actual release flags, production secrets, deployment settings or signing
material were changed. This does not authorize bypassing required hosted checks
or promoting a build without its required live acceptance proof.
