# Design — 04_task_board_dnd

**Source:** `solution_design.md` §7 (dnd-kit design); `client_requirement.md` §4.1

## Approach

Interactivity layer over `03`. Wrap the server-rendered columns in a Client
island so the page stays a Server Component (data fetched on the server, passed as
props). dnd-kit handles drag; a single `reorderTask` server action persists the
result; local optimistic state with snapshot-based rollback handles failures.

## Components & boundary

```
components/board/
  KanbanBoard.tsx (client)     # receives initial tasks-by-column from the Server page;
                               # holds optimistic state; DndContext + sensors + DragOverlay
  SortableTaskCard.tsx (client)# useSortable wrapper around the presentational TaskCard
  BoardColumn.tsx              # becomes a droppable (useDroppable) container
actions/tasks.ts               # add reorderTask({ taskId, toState, toIndex })
lib/services/tasks.ts          # add reorderTask service: transaction renumbering columns
```

- `board/page.tsx` (from `03`) now renders `<KanbanBoard initial={grouped} />`
  instead of static columns; server fetch unchanged.
- **Sensors:** `PointerSensor` (activation distance to avoid click-vs-drag) +
  `KeyboardSensor` with `sortableKeyboardCoordinates` (R6). `DndContext`
  `accessibility.announcements` customized for pick-up/move/drop.
- **Strategy:** `SortableContext` per column with `verticalListSortingStrategy`.
- **DragOverlay** renders the active card during drag (R7).

## Persistence & ordering

- On drop, compute the destination column + index; **optimistically** splice local
  state; call `reorderTask`.
- `reorderTask` service runs in a `prisma.$transaction`: set the moved task's
  `state = toState`, then **renumber** the destination column (and the source
  column if different) to contiguous `0..n-1` by current order with the moved task
  inserted at `toIndex` (R3 — normalize, idempotent).
- On resolve: reconcile (server is source of truth). On reject: restore the
  pre-drag snapshot and toast (R4).

## Auth & security

- `reorderTask` starts with `requireUser()` (R5). Per-request Supabase client.
- Zod-validate `{ taskId, toState ∈ TaskState, toIndex ≥ 0 }`.

## Validation

- `reorderTaskSchema` { taskId: id, toState: TaskState enum, toIndex: int ≥ 0 }.

## Test approach

- **Vitest:** the renumber/insert function — moves across and within columns yield
  contiguous positions; idempotent on replay; bad index clamped.
- **Component (RTL + dnd-kit testing utils):** simulate a drop → optimistic order
  updates and action called (R1, R2); mock action rejection → rollback + toast
  (R4); keyboard pick-up/move/drop path (R6).
- **E2E (Playwright):** drag a card to another column, reload → persisted (R8);
  reorder within a column, reload → persisted.
- **RLS/auth test:** unauthenticated `reorderTask` rejected, no write (R5).
- Coverage target: the ordering function 100% branches; rollback path covered.

## Open items / discrepancies

- Concurrent reorders normalize last-write; no locking in MVP (acceptable at ≤5
  users).
