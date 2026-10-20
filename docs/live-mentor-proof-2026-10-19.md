# T-1015 — Live API access and interrupted mentor evaluation

## Scope and authorization

Source: `457c1f19315820ab1599494cfa3e4db2705e41f2`.
The human confirmed the local key was saved, then explicitly authorized one
retry after adding $10. They subsequently asked to prioritize bug fixes and
reduce paid testing. Codex stopped the active evaluation; do not resume it
automatically or treat this report as fresh permission for paid calls.

## Verified results

- First authorized attempt: Node20.20.2, one actual OpenAI request, HTTP429,
  no reply, 39 of 40 cases unattempted. The retained safe metadata does not
  establish whether credits, rate, spend or approved usage caused the error.
- After the human's top-up: same source, canonical
  `npm run eval:mentor-golden:live`, real `gpt-4o-2024-08-06` responses.
  21 requests started; 20 returned HTTP200. The remaining request was in
  flight when Codex stopped the exact evaluation container on human request.
  Container exit137 records interruption, not a quality verdict.
- Completed responses report 42,181 input tokens and 1,888 output tokens.
  At the published uncached GPT-4o rates ($2.50/$10 per million), estimated
  completed-request text cost is $0.1243325. This is not an invoice; cached
  discounts and the interrupted request's possible cost are not established.
- No final report was written before interruption. The complete 40-case
  quality gate is UNPROVEN. Successful API access is not physical-phone,
  screenplay-generation, persistence, voice or production proof.

## Isolation and retained evidence

Both runs used the pinned Node20 container, read-only source/key mounts,
synthetic container-local storage, and no production database or deployment.
The key was parsed privately; never printed, committed, or copied into code.
The observer used real fetch, capped outbound requests at40, and stopped
after the first provider error. No simulated replies were used.

Private original evidence:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1015-live-20261019.RbtiPu/`.
Private top-up evidence:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1015-topup-20261019.X5SFto/`.
The second attempt initially failed container mount initialization before
any process/API call; creating the ignored empty dependency mountpoint fixed
that local setup. Only one post-top-up evaluation process was started.

No provider bodies, keys or generated screenplay content belong in Git.
No main/original-PR head or production configuration was changed.

## Next

Prioritize the reproduced save-drain handoff bug and conflict recovery with
local deterministic/signed checks, which incur no model charges. Request a
new bounded paid authorization only when a connected workflow needs proof.
The explicit production hold remains unchanged.

Official references:
- https://developers.openai.com/api/docs/models/gpt-4o
- https://developers.openai.com/api/docs/guides/error-codes
