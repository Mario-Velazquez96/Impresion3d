# docs/verification.md — How to verify your work

Read before declaring any task `done`.

## Steps

1. **Run the full test suite.**
   ```
   sf apex run test --result-format human --code-coverage --wait 10
   ```
   All tests must pass. Coverage must meet the target in `tasks.md` (default
   ≥ 85% per class).

2. **Validate the deployment** (never deploy to production):
   ```
   sf project deploy validate --source-dir force-app -o <scratch-or-sandbox-alias>
   ```

4. **Check requirement traceability.** For each `R<n>` in `requirements.md`,
   confirm at least one test exercises it. Note the mapping in your progress
   file, e.g. `R3 → RenewalOpportunity_Test.testClosedWonCreatesRenewal`.

5. **Lint and clean up.** No `System.debug()` left in, no dead code, no TODOs
   without context.

## Definition of done

A task is `done` only when steps 1–5 pass **and** the reviewer has written
APPROVE in `progress/review_<feature>.md`.
