# Review - 04_task_board_dnd

**Verdict: APPROVE**

Reviewed read-only against the requirements/design/tasks specs, the verification,
conventions and architecture docs, the implementer report, and the 03 board for
regression. Pipeline reproduced green; ordering core at 100 percent branch.

## R1-R8 traceability

| Req | Test | Result |
|-----|------|--------|
| R1 drop to other column persists state+position | tasks-reorder.test.ts across-columns; actions tasks-reorder.test.ts persists-and-revalidates; KanbanBoard.test.tsx commitDrop optimistic-real-move | PASS |
| R2 within-column reorder persists position | tasks-reorder.test.ts within-a-column updates-only-positions; applyMove reorders-within-a-column; resolveDrop target tests | PASS |
| R3 contiguous normalize, idempotent, no drift | tasks-reorder.test.ts insert-at-index, clamp too-large, clamp negative, normalize gapped/unsorted, idempotent replay, stays-contiguous-many-reorders | PASS, 100pct branch on tasks.ts |
| R4 failure rollback + toast, no partial state | KanbanBoard.test.tsx commitDrop rolls-back-to-snapshot-and-toasts, 2 setGrouped calls, 2nd toBe(g) exact snapshot, toast message | PASS |
| R5 unauthenticated reject, no write | actions tasks-reorder.test.ts rejects-unauthenticated-NO-service-call + 4 invalid-input tests asserting no service call/revalidate | PASS |
| R6 keyboard-operable + ARIA announcements | KanbanBoard.test.tsx focusable drag handle button, exposes ARIA live regions; KeyboardSensor + sortableKeyboardCoordinates + custom announcements; E2E drives KeyboardSensor | PASS, jsdom limit noted |
| R7 DragOverlay preview while dragging | DragOverlay renders activeTask; board render tests; live-drag branch deferred to Playwright | PASS, structural |
| R8 persisted order after reload equals optimistic | KanbanBoard.test.tsx reconciles-to-fresh-server-props signature re-sync; revalidatePath /board; E2E reload assertions credential-gated | PASS |

Every R1-R8 maps to at least one real, behavior-asserting test. No untested requirement.

## Task completeness

All 11 tasks.md items are [x] and genuinely done, spot-checked against code: Zod schema,
transactional service + pure renumber core, auth-first action, KanbanBoard island with
sensors/SortableContext/DragOverlay/announcements, droppable KanbanColumn + SortableTaskCard,
page swap with server fetch unchanged, optimistic+rollback+toast, announcements, the full
test suite, the auth-denial test, and verified pipeline.

## Ordering core (R3, the crux)

renumberColumnWithInsert / renumberColumn / reorderTask verified:
- Cross-column: moved task state set first, THEN both dest (renumberColumnWithInsert) and
  source (renumberColumn) renumbered to contiguous 0..n-1, confirmed in code and the
  renumbers-dest-AND-source test.
- Within-column: no state write, guarded by fromState not equal toState, positions only,
  single findMany, asserted by the no-state-write test (1 findMany only).
- Out-of-range clamped via Math.max(0, Math.min(toIndex, without.length)), too-large and
  negative both tested.
- Idempotent: replay yields same order, tested.
- Many sequential reorders never drift/gap, tested, positions always 0..4, set size 5.
- reorderTask runs inside db.transaction, confirmed.
- lib/services/tasks.ts: 100pct statements / 100pct branch, meets the spec explicit target.

## Optimistic / rollback (R4)

commitDrop snapshots grouped pre-drag, applies applyMove optimistically, calls the action,
and on not-ok restores the snapshot and toasts. The rollback test asserts the second
setGrouped arg is the EXACT original object via toBe(g), so no partial state, plus the toast
message. Verified.

## Auth (R5)

reorderTaskAction calls ensureUser (to requireUser) BEFORE Zod/service. The unauthenticated
test sends a fully-valid payload yet asserts no service call and no revalidate. Invalid
toState / negative / non-integer toIndex / missing taskId all reject pre-write. Verified.

## Accessibility (R6, R7)

KeyboardSensor with sortableKeyboardCoordinates; custom accessibility announcements for
start/over/end/cancel; focusable drag-handle button (aria-label Drag-plus-title) carrying
listeners so Edit dialog/subtasks stay independently operable; DragOverlay renders the active
card. Keyboard path tested as far as jsdom allows (handle focusability + live regions); full
keyboard drag in the credential-gated E2E. Verified.

## Server/Client boundary and regressions

- board/page.tsx stays a Server Component; server fetch unchanged; dnd isolated to the
  KanbanBoard client island wrapped in ToastProvider. Build emits /board as dynamic with no
  boundary/serialization errors.
- 03 islands (TaskFilters, TaskFormDialog, SubtaskList) untouched and still pass.
- The li-to-div change on the TaskCard root is legitimate: the card is now wrapped by the
  SortableTaskCard li (inside the column ul), so list-item semantics moved up one level rather
  than being lost. TaskCard.test.tsx was updated only to select the card root by div.rounded-md;
  the behavior assertions are unchanged and NOT weakened. TaskCard.tsx stays at 100pct coverage.

## Deviation judgments

- (a) Local components/ui/toast.tsx instead of a new dep: ACCEPTABLE. Conventions forbid
  undescribed dependencies; lockfile confirms no toast dep added. ARIA role=alert/region live
  area, swappable for shadcn/sonner later. Reasonable.
- (b) jsdom approach + ~75pct on KanbanBoard.tsx: ACCEPTABLE. The spec target is ordering
  function 100pct branches plus rollback path covered, NOT a global threshold. Ordering core is
  100pct branch; rollback unit-tested via extracted commitDrop. The uncovered lines are precisely
  the live-drag DndContext code (sensors, announcement callbacks, DragOverlay branch) that jsdom
  cannot drive, covered by the credential-gated Playwright specs. Spec target met.
- (c) reorderTaskAction taking a typed payload object instead of (prevState, FormData):
  ACCEPTABLE. The island calls it programmatically, not via a form. Still follows requireUser to
  Zod safeParse to service to revalidate, validating unknown safely.
- (d) Retained BoardColumns/BoardColumn from 03: ACCEPTABLE (minor). Confirmed NOT imported
  anywhere under app/ (off the render path) but still imported by their own 03 tests, so tested,
  not orphaned. Keeping them avoids widening 04 scope; not a rejection. NOTE for the leader: a
  future cleanup pass could delete BoardColumns.tsx/BoardColumn.tsx + their test once 03 no longer
  needs them.

## Data and security / scope

- No schema change: latest migration is 03 tasks_and_subtasks_rls; 04 adds none. Task.position,
  Task.state and the index on (state, position) already exist. prisma/ clean.
- No new runtime dependency: package.json/lockfile show dnd-kit already present from setup; no
  toast/sonner added.
- No new env var; .env.example unchanged; no secrets. Prisma used server-only via the singleton;
  lib/validation/task.ts stays client-importable (no server-only import).
- No leakage from later features; no console.log; no any (typecheck clean).

## Pipeline reproduced (corepack pnpm, credential-free)

- typecheck: PASS, tsc --noEmit, 0 errors.
- lint: PASS, next lint, 0 warnings/errors.
- test: PASS, 26 files / 245 tests. lib/services/tasks.ts 100pct/100pct branch;
  lib/validation/task.ts 98.68pct; TaskCard.tsx 100pct; KanbanBoard.tsx 75.49pct
  (live-drag-only remainder); overall 92.48pct lines.
- build: PASS, next build; /board dynamic, no boundary/serialization errors.

E2E e2e/board-dnd.spec.ts: spec FILE exists and is correct (cross-column R1/R8 + within-column
R2/R8 driven via the KeyboardSensor, with reload-persistence assertions), skips when
E2E_EMPLOYEE_EMAIL / E2E_EMPLOYEE_PASSWORD are absent, and documents the follow-up command
corepack pnpm test:e2e. Legitimately credential-gated, not held against approval.

## Conclusion

APPROVE. The leader may mark 04_task_board_dnd as done. Recommended non-blocking follow-up:
schedule deletion of the now-off-path BoardColumns/BoardColumn once 03 no longer references them,
and run the credential-gated Playwright E2E once .env.local is provided to confirm durability
end-to-end.
