# Current session

## Feature in progress
`03_task_board_core` — spec approved by human (2026-06-22). Status: `in_progress`.
No spec changes requested. Confirmed design choice: RLS + app-layer authz allow
ANY authenticated user to read/write ALL tasks (no per-row ownership) — intentional
for an internal tool. Open item (auto-archive old DONE tasks) deferred to future.

## State
Done this session: `00_project_setup` ✅, `01_auth_and_user_management` ✅,
`02_catalog_management` ✅ (all reviewer-APPROVED, pipelines green, logged to
`progress/history.md`).

Leader passed the human approval gate for `03`, set status `in_progress`, and
launched the `implementer`. Implementer writes its report to
`progress/impl_03_task_board_core.md` and returns only the reference.

Next after implementation: launch `reviewer` to validate R1–R10 ↔ test
traceability (incl. end-of-column position calc, URL-filter composition, and the
unauthenticated RLS denial test) and the green pipeline before closing.
After `03` is done, `04_task_board_dnd` becomes unblocked.

## Notes / blockers
- `pnpm` is not on this machine's PATH; use `corepack pnpm` for verification.
- Credential-gated stages accumulate across features for a human follow-up pass
  on dev/staging Supabase (apply migrations + seed + run E2E/RLS). Tracked per
  feature's impl report. Never target production.
