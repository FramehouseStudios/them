# V1 Secret Exposure Response

Generated: 2026-05-18T01:25:12Z

## Current Repo Truth

- No `backend/.env`, `backend/.env.production`, or `them/Release.local.env`
  file is present in this worktree.
- `backend/.env`, `backend/.env.production`, and `them/Release.local.env` are
  ignored by `.gitignore`.
- None of those local secret files are tracked by git.
- Strict pre-flight now includes a `secret-hygiene` check that fails if local
  env files are tracked, expected local secret files are not ignored, or tracked
  files contain OpenAI/ElevenLabs-style provider key patterns.
- The secret-hygiene regression test verifies that findings report file, line,
  and secret type without printing the matched value.

## Human-Owned Rotation

The audit reported real-looking provider keys in local files outside git. If
those values were real or AI-tool-visible, rotate them before any hosted or
TestFlight exposure:

1. Rotate OpenAI project keys.
2. Rotate ElevenLabs keys.
3. Update Render/password-manager values only.
4. Delete local production env copies after rotation.
5. Recreate local env files only from ignored templates when needed.

## Verification

Commands run:

```bash
find backend them . -maxdepth 2 \( -name '.env' -o -name '.env.*' -o -name 'Release.local.env' \) -print
git check-ignore -v backend/.env backend/.env.production them/Release.local.env
git ls-files backend/.env backend/.env.production them/Release.local.env
node --test scripts/pre_flight.test.mjs
node scripts/pre_flight.mjs --strict
node --check scripts/pre_flight.mjs
```
