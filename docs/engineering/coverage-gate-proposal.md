# Coverage gate proposal (backend)

Status: proposal. `npm run test:coverage` exists and is measured; wiring a
threshold into CI is a workflow change and needs an owner's yes.

## Baseline

`main` 0a557131, 2026-09-05, full suite 2520/2520:

| Metric | Coverage | Covered / total |
| --- | --- | --- |
| Statements | 81.42% | 83,070 / 102,016 |
| Branches | 70.18% | 21,213 / 30,223 |
| Functions | 86.54% | 2,573 / 2,973 |

Measured with `c8` over the process tree the suite spawns
(`TEST_SPAWN_BACKEND=1`), excluding `tests/`, `evals/`, `scripts/`.

## Proposed thresholds

Gate on the two metrics with headroom, not the one sitting on the line:

| Metric | Threshold | Headroom |
| --- | --- | --- |
| Statements | 80 | 1.4 pts |
| Functions | 85 | 1.5 pts |
| Branches | none (report only) | 0.2 pts — would flap |

Ratchet branches to 70 once three consecutive weeks measure ≥ 71.

## Where it runs

Add to `.github/workflows/quality-gate.yml`, in the `backend-tests` job
(ubuntu, already runs `npm test`), replacing that step:

```yaml
      - name: Backend tests with coverage
        working-directory: backend
        run: >-
          npx c8 --reporter=text-summary --reporter=lcov --reports-dir=coverage
          --exclude="tests/**" --exclude="evals/**" --exclude="scripts/**"
          --check-coverage --statements 80 --functions 85
          npm test
      - name: Upload coverage
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: backend-coverage
          path: backend/coverage/lcov.info
          retention-days: 14
```

No external coverage service is required; the lcov artifact is enough for
review and the numbers print in the job log. Codecov can be added later if
a PR-comment diff is wanted.

## Cost

Measured locally: the suite takes ~10% longer under c8 (instrumentation is
V8-native, no source transform). Well inside the job's budget.

## What this does not cover

iOS. `xcodebuild test` can emit coverage (`-enableCodeCoverage YES`), but
the unit target's numbers are only meaningful once the five pre-existing
failures are merged out (PR "make the unit target green"). Propose the
same shape there afterwards: measure first, gate second.
