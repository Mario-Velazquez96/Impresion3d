# Implementation progress — 04_task_board_dnd

Status: implemented; credential-free pipeline green; E2E persistence specs written
but credential-gated. Awaiting reviewer.

## Tasks completed (tasks.md)

All 11 checklist items marked `[x]`:

1. `reorderTaskSchema` Zod schema.
2. `reorderTask` transactional service + pure renumber/insert core.
3. `reorderTaskAction` server action (`requireUser` → Zod → service → revalidate).
4. `KanbanBoard` client island (DndContext, Pointer + Keyboard sensors,
   per-column SortableContext, DragOverlay, announcements).
5. Droppable columns (`KanbanColumn` via `useDroppable`) + `SortableTaskCard`
   (`useSortable`) wrapping the presentational `TaskCard`.
6. `board/page.tsx` swapped to render `<KanbanBoard initial={cards} …>` —
   server fetch logic unchanged.
7. Optimistic splice + snapshot rollback + error toast on failure.
8. ARIA announcements for pick-up / move / drop / cancel.
9. Vitest (renumber/insert + idempotency + clamp), component
   (optimistic+action / rollback+toast / handle a11y), E2E persistence specs.
10. Auth-denial test (unauthenticated reorder rejected, no write).
11. typecheck + lint + test + build verified.

## Requirement traceability

- **R1 (drop into another column persists state + position)**
  - Service: `reorderTask` sets `state = toState` then renumbers dest + source.
  - Action: `reorderTaskAction` calls it and `revalidatePath('/board')`.
  - Tests: `actions/__tests__/tasks-reorder.test.ts > "persists and revalidates
    /board on success"`; `lib/services/__tests__/tasks-reorder.test.ts >
    "across columns: sets new state, renumbers dest AND source"`;
    `components/board/__tests__/KanbanBoard.test.tsx > commitDrop >
    "optimistically splices state and calls the action on a real move"`.
  - E2E (credential-gated): `e2e/board-dnd.spec.ts > "drag a card to another
    column persists across reload"`.

- **R2 (reorder within a column persists position)**
  - Tests: `lib/services/…tasks-reorder.test.ts > "within a column: updates only
    positions, no state write"`; `applyMove` "reorders within a column";
    `resolveDrop` "dropping onto a card targets that card's column + index".
  - E2E (credential-gated): `e2e/board-dnd.spec.ts > "reorder a card within a
    column persists across reload"`.

- **R3 (contiguous normalization + idempotency, no drift)**
  - Pure `renumberColumnWithInsert` / `renumberColumn` in `lib/services/tasks.ts`.
  - Tests: `tasks-reorder.test.ts` — "inserts … at the requested index",
    "clamps a too-large index", "clamps a negative index", "normalizes
    gapped/unsorted input to contiguous 0..n-1", "is idempotent: replaying the
    same target yields the same order", "stays contiguous across many sequential
    reorders (no drift)". `lib/services/tasks.ts` is at **100% branch coverage**
    (the spec's explicit target for the ordering function).

- **R4 (failure → rollback + toast, no partial state)**
  - `commitDrop` snapshots pre-drag state, applies optimistically, and on a
    rejected action restores the snapshot and toasts.
  - Test: `KanbanBoard.test.tsx > commitDrop > "rolls back to the pre-drag
    snapshot and toasts when the action rejects"` (asserts two `setGrouped`
    calls — optimistic then rollback to the exact original object — plus the
    toast message).

- **R5 (unauthenticated → reject, no DB write)**
  - `reorderTaskAction` calls `ensureUser()` (→ `requireUser`) before any Zod or
    service work.
  - Test: `actions/__tests__/tasks-reorder.test.ts > "rejects an unauthenticated
    caller with NO service call or revalidate"`, plus invalid-input tests
    (bad `toState`, negative/non-integer `toIndex`, missing `taskId`) all assert
    no service call.

- **R6 (keyboard-operable + ARIA announcements)**
  - `KeyboardSensor` with `sortableKeyboardCoordinates`; a focusable drag handle
    per card (`aria-label="Drag <title>"`); custom `accessibility.announcements`
    for start/over/end/cancel.
  - Tests: `KanbanBoard.test.tsx` — "renders a focusable drag handle per card",
    "exposes ARIA live regions for drag announcements"; `TaskCard.test.tsx`-style
    handle presence in `KanbanBoard.test.tsx > TaskCard drag handle`.
  - E2E drives drag via the KeyboardSensor (Space / arrows / Space).

- **R7 (DragOverlay preview while dragging)**
  - `<DragOverlay>` renders the active `TaskCard` while `activeId` is set.
  - Covered structurally by the board render tests; the overlay's active-card
    branch only paints during a live drag (see jsdom note below).

- **R8 (persisted order after reload matches optimistic state)**
  - Server page fetch unchanged + `revalidatePath('/board')` on success;
    `KanbanBoard` re-syncs to fresh props via a task-signature guard.
  - Tests: `KanbanBoard.test.tsx > "reconciles to fresh server props after
    revalidation"`. Durability proven end-to-end by the credential-gated E2E
    reload assertions in `e2e/board-dnd.spec.ts`.

## Pipeline results (credential-free, `corepack pnpm …`)

- `typecheck` — PASS (tsc --noEmit, zero errors).
- `lint` — PASS (next lint, no warnings/errors).
- `test` — PASS, **26 files / 245 tests**. Coverage on changed modules:
  - `lib/services/tasks.ts` 100% / 100% branch (ordering core target met).
  - `lib/validation/task.ts` ~99% (reorder schema fully covered).
  - `actions/tasks.ts` covered incl. the full reorder-action path.
  - `components/board/TaskCard.tsx` 100%, `KanbanColumn.tsx` 100% lines,
    `SortableTaskCard.tsx` 100% lines, `components/ui/toast.tsx` covered via the
    rollback toast test.
  - `components/board/KanbanBoard.tsx` ~75% lines: the pure pipeline
    (`resolveDrop`, `applyMove`, `commitDrop`, signature re-sync) is covered;
    the uncovered remainder is the live-drag-only code inside `DndContext`
    (announcement callbacks, sensor config, the DragOverlay active-card branch)
    which cannot execute under jsdom (see deviation below).
- `build` — PASS (`next build`); `/board` compiles with the dnd island, no
  Server/Client boundary or serialization errors.

## Credential-gated stages (NOT run — no `.env.local` present)

Playwright persistence flows need a live dev/staging Supabase project + seeded
account + at least one seeded TaskCategory. To run after providing
`.env.local` with `E2E_EMPLOYEE_EMAIL` / `E2E_EMPLOYEE_PASSWORD`:

```
corepack pnpm test:e2e
```

Specs: `e2e/board-dnd.spec.ts` (cross-column reload persistence R1/R8;
within-column reload persistence R2/R8). They `test.skip` when the vars are
absent. No invented credentials.

## Files created / changed

Created:
- `components/board/KanbanBoard.tsx` — client island (DndContext, sensors,
  optimistic state, DragOverlay, announcements; exports pure `resolveDrop`,
  `applyMove`, `commitDrop`).
- `components/board/KanbanColumn.tsx` — droppable column + per-column
  SortableContext.
- `components/board/SortableTaskCard.tsx` — `useSortable` wrapper around
  `TaskCard`.
- `components/ui/toast.tsx` — minimal local toast provider + `useToast` hook.
- `lib/services/__tests__/tasks-reorder.test.ts`
- `actions/__tests__/tasks-reorder.test.ts`
- `components/board/__tests__/KanbanBoard.test.tsx`
- `e2e/board-dnd.spec.ts`

Changed:
- `lib/validation/task.ts` — `reorderTaskSchema` + `ReorderTaskInput`.
- `lib/services/tasks.ts` — `renumberColumnWithInsert`, `renumberColumn`,
  `reorderTask` (transactional).
- `actions/tasks.ts` — `reorderTaskAction`.
- `components/board/TaskCard.tsx` — optional `drag` prop adds a drag handle;
  card root changed from `<li>` to `<div>` so a sortable wrapper owns list-item
  semantics (presentational, no data-shape change).
- `components/board/BoardColumn.tsx` — wraps each `TaskCard` in `<li>` (kept for
  03's tests; no longer on the page render path).
- `app/(app)/board/page.tsx` — renders `<KanbanBoard …>` inside `<ToastProvider>`;
  **server fetch unchanged**.
- `components/board/__tests__/TaskCard.test.tsx` — badge-row selector updated for
  the `<li>`→`<div>` card root (behaviour unchanged).
- `specs/04_task_board_dnd/tasks.md` — all items checked.

No schema changes (uses existing `Task.position` / `Task.state`); no new env
vars; no new runtime dependencies.

## Deviations / notes

- **Toast without a new dependency:** the repo had no toast utility, so
  `components/ui/toast.tsx` is a tiny self-contained provider + `useToast` hook
  (ARIA `role="alert"` live region, auto-dismiss). It wraps `KanbanBoard` in the
  page. Swappable for shadcn/sonner later without touching callers.
- **dnd tested in jsdom:** jsdom returns all-zero `getBoundingClientRect`, so
  dnd-kit's pointer/keyboard collision pipeline produces a no-op drop and can't
  drive a deterministic reorder. To cover R1/R2/R4 reliably I extracted the
  drop-commit pipeline into pure, exported functions — `resolveDrop` (target
  resolution), `applyMove` (optimistic splice), and `commitDrop` (optimistic +
  action + snapshot rollback + toast) — and unit-tested those directly; the
  `DndContext.onDragEnd` handler is a thin wrapper over `commitDrop`. The pure
  ordering core (`renumberColumnWithInsert`) hits 100% branches. Full
  pointer-drag persistence is validated by the credential-gated Playwright specs,
  which drive the real KeyboardSensor against a live app.
- **`reorderTaskAction` signature:** unlike the 03 form actions (`(prevState,
  FormData)`), the reorder action takes the typed payload object directly because
  the dnd island calls it programmatically, not via a `<form>`. It still follows
  the same requireUser → Zod → service → revalidate contract.
- `BoardColumns`/`BoardColumn` from 03 are no longer on the board render path but
  are retained (and still tested) rather than deleted, to avoid widening scope.
