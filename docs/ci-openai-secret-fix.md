# Fixing the malformed `OPENAI_API_KEY` GitHub Actions secret (issue #33)

The Postgres-backed eval gate fails in CI because the
`OPENAI_API_KEY` repository secret is malformed (trailing whitespace, a
stray newline, or pasted from a wrapped editor). This blocks the
quality gate and any merge that depends on `eval:gate`.

This is a **human-only** action: rotating the GitHub Actions secret
requires repository admin access, which neither support agent nor Codex has.

## Symptoms

- `quality-gate.yml` step `Run quality gate` exits non-zero with an
  HTTP 401 from `api.openai.com` and a body like
  `{ "error": { "message": "Incorrect API key provided" } }`.
- Local `OPENAI_API_KEY=... npm run eval:gate` succeeds with the same
  key value typed manually.
- Other workflows that touch OpenAI are also unstable.

## Fix (5 minutes)

1. **Generate a fresh key.** Go to `https://platform.openai.com` →
   API keys → "Create new secret key". Scope it to the
   `them-backend-ci` workspace if you use OpenAI workspaces.
2. **Validate locally** before pasting:

   ```sh
   # Replace the value below with the freshly-generated key.
   KEY='sk-...'
   # No trailing newline, no whitespace, no curl with $KEY in quotes
   # that would expand a shell var.
   printf '%s' "$KEY" | wc -c
   curl -fsS https://api.openai.com/v1/models \
     -H "Authorization: Bearer $KEY" \
     | head -c 200 && echo
   ```

   Expect a JSON response listing models. The `wc -c` count should
   match what OpenAI shows in the dashboard for the key length (no
   off-by-one from a trailing newline).
3. **Update the GitHub secret.** Settings → Secrets and variables →
   Actions → repository secrets → `OPENAI_API_KEY` → **Update**.
   Paste the key. Do **not** wrap in quotes. Do **not** add a newline.
   GitHub's input strips trailing whitespace but not embedded
   characters; if you copy from `Notes.app` or a wrapped terminal,
   round-trip through `pbpaste | tr -d '\n\r' | pbcopy` first.
4. **Re-run the failed workflow.** Actions → the failed run →
   "Re-run all jobs". The `eval:gate` step should now pass.
5. **Revoke the old key** in the OpenAI dashboard once the new one is
   confirmed working.

## Validation script (committed)

A script that exercises the secret end-to-end without spending a
meaningful token budget:

```yaml
# Add to quality-gate.yml ABOVE the existing eval:gate step
- name: Validate OPENAI_API_KEY format
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
  run: |
    set -e
    if [[ -z "${OPENAI_API_KEY}" ]]; then
      echo "::error::OPENAI_API_KEY secret is empty"
      exit 1
    fi
    if [[ "${OPENAI_API_KEY}" =~ [[:space:]] ]]; then
      echo "::error::OPENAI_API_KEY contains whitespace; rotate the secret per docs/ci-openai-secret-fix.md"
      exit 1
    fi
    code=$(curl -sS -o /tmp/openai-validate.json -w "%{http_code}" \
      https://api.openai.com/v1/models \
      -H "Authorization: Bearer ${OPENAI_API_KEY}")
    if [[ "${code}" != "200" ]]; then
      echo "::error::OPENAI_API_KEY rejected by api.openai.com (HTTP ${code})"
      head -c 400 /tmp/openai-validate.json
      exit 1
    fi
    echo "OPENAI_API_KEY validated OK"
```

This adds ~1s and one `GET /v1/models` call per workflow run, in
exchange for a clear, immediate failure message when the secret is
malformed instead of a cryptic 401 inside the eval gate.

## Why this isn't fixed in code

The CI workflow is configured by the human and the secret is in the
GitHub admin UI. No agent has permission to rotate it. Once the new
key is in place, the validation step above can be added by support agent in
a follow-up PR.
