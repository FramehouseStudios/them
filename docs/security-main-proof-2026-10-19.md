# T-987 — Original #909 current-main compatibility proof

Read original #909 body and its dependency/proxy regression changes before
integration. Normal merge12666bf99cb670f6a9bb9b2824064de447b0aeb2 retains
original788e010735bfa3c786c94c9f17b7f2c9742ee702 and current-main proof
baseline54f700eab285365be0dd9798a31ba99029de2bbd. No original remote
update, replacement PR, main merge, squash, credential access or deployment.

Relative to that baseline only package.json, package-lock.json and
tests/proxy_addr_security.test.mjs differ. Original changes retain
multer2.4.0, proxy-addr2.0.8 and fast-uri3.1.8 with locked resolution.

## Fresh proof

- `npm ci --ignore-scripts --no-audit --no-fund` exit0 under repository-pinned
  Node20.20.2 in owned worktree; no host provider/database credentials passed.
- `npm audit --omit=dev --json`:0 reported vulnerabilities, exit0.
  Log `/tmp/them-987-install-audit.log`. Current main-based recovery lock
  separately flags proxy-addr2.0.7 critical / fast-uri3.1.6 high; this is not
  proof of application exploitability or clearance of all GitHub alerts.
- Complete backend `npm test`, networking disabled/disposable container:
  2740 pass/0 fail/2 skip, exit0. Log `/tmp/them-987-backend-node20.log`.
- D009 versus origin/main: all five deltas0. `git diff --check` passes.
- No fresh iOS/UI/macOS suite on this backend-only boundary; baseline proofs
  remain prior-head evidence, not an exact combined-head claim.

## Adversarial scope / remaining risk

- Answered: original mapped-IP trust regression executes the installed
  proxy-addr, covering unrelated IPv4 exclusion and valid subnet compatibility.
- Partial: full backend suite passes with Multer2, but does not establish
  exhaustive aborted-upload/resource-exhaustion safety. Existing app.js keeps
  memory storage and MAX_FILE_BYTES; no auth or limits weakened here. Original
  upload-hardening work remains separate, not silently declared complete.
- Not covered: the deployment's trust-proxy/network topology and production
  upload-abort behavior; no production exploitability claim.
- Residual debt: install warns jsrsasign11.1.5 is unmaintained. Zero registry
  advisories is not a security certification. Investigate a maintained path
  with actual IAP/auth contracts before replacing a cryptography dependency.
- Node20 is upstream EOL; retain the requested compatibility proof but
  separately migrate/test a maintained LTS before production promotion.

No paid model calls. Shipping backend, physical phone and generated120-page
screenplay remain unproven. Preserve original #909 for landing after fresh
required checks and independent review; do not create a competing patch.
