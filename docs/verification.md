# docs/verification.md — How to verify your work

Read before declaring any task `done`. The fastest path is `./init.sh`, which
runs the code-quality gates in order and stops at the first failure.

## Steps

1. **Type-check.**
   ```
   pnpm typecheck      # tsc --noEmit
   ```
   Zero errors. No new `any` / `@ts-ignore` without justification.

2. **Lint.**
   ```
   pnpm lint           # eslint (next lint)
   ```
   Zero errors. No leftover `console.log`/debug code.

3. **Unit / component tests + coverage.**
   ```
   pnpm test           # vitest run --coverage
   ```
   All pass. Coverage meets the target in `tasks.md` (default ≥ 80% lines on
   changed modules). Tests must assert behaviour, not just execute lines —
   cover positive, negative, and edge/bulk paths.

4. **E2E tests** (for any feature with user-facing flows).
   ```
   pnpm test:e2e       # playwright test
   ```
   Skip only if the feature has no UI behaviour — and say so explicitly in the
   progress file.

5. **Production build.**
   ```
   pnpm build          # next build
   ```
   Must succeed. This catches Server/Client boundary mistakes, non-serializable
   props, and bad imports that unit tests miss.

6. **Migrations** (only if the data model changed).
   ```
   pnpm prisma migrate dev --name <change>     # against dev/staging Supabase
   pnpm prisma migrate status                  # confirms applied & in sync
   ```
   The migration is committed and applies cleanly. **Never** target production.

7. **Requirement traceability.** For each `R<n>` in `requirements.md`, confirm at
   least one test exercises it. Record the mapping in your progress file, e.g.
   `R3 → board-reorder.test.ts > "persists new column and position"`.

8. **Clean up.** No dead code, no debug logging, no TODOs without context, no new
   undocumented env var (add it to `.env.example`), no committed secrets.

## Definition of done

A task is `done` only when steps 1–8 pass (i.e. `./init.sh` exits 0, plus the
manual traceability/migration checks) **and** the reviewer has written APPROVE in
`progress/review_<feature>.md`. See `CHECKPOINTS.md` for the full objective list.
