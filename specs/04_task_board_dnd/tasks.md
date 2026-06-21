# Tasks — 04_task_board_dnd

> Each task cites the requirement(s) it satisfies. Mark `[x]` as completed.

- [ ] Add `reorderTaskSchema` Zod schema (R5)
- [ ] Implement `reorderTask` service: transactional state change + contiguous renumber of source/dest columns (idempotent) (R3)
- [ ] Implement `reorderTask` server action with `requireUser` + zod (R1, R2, R5)
- [ ] Build `KanbanBoard` client island: DndContext, Pointer + Keyboard sensors, SortableContext per column, DragOverlay (R1, R2, R6, R7)
- [ ] Make `BoardColumn` a droppable; wrap cards in `SortableTaskCard` (R1, R2)
- [ ] Swap `board/page.tsx` to render `<KanbanBoard initial={grouped} />` (no server fetch change) (R8)
- [ ] Implement optimistic update + snapshot rollback + error toast on action failure (R4)
- [ ] Add ARIA announcements for pick-up/move/drop (R6)
- [ ] Write tests: Vitest (renumber/insert, idempotency, clamp); component (drop→optimistic+action, reject→rollback+toast, keyboard path); E2E (cross-column + within-column persist on reload) (all R)
- [ ] Write the auth denial test: unauthenticated `reorderTask` rejected, no write (R5)
- [ ] Verify build + typecheck + lint pass; confirm coverage target

## Verification

- E2E: drag across columns → reload persisted (R1, R8); reorder within → reload persisted (R2).
- Component: failure → UI rollback + toast (R4); keyboard pick-up/move/drop works (R6); overlay shows during drag (R7).
- Unit: many reorders keep positions contiguous; replay idempotent (R3).
- Auth test: unauthenticated reorder denied (R5).
- Target: ordering function 100% branch coverage; rollback covered.
