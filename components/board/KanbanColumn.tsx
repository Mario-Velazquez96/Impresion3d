"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { SortableTaskCard } from "@/components/board/SortableTaskCard";
import type { TaskCardView } from "@/components/board/TaskCard";
import {
  TASK_STATE_LABELS,
  type CategoryOption,
  type UserOption,
} from "@/components/board/board-types";

/**
 * One droppable board column (04: R1, R2). A `useDroppable` zone keyed by the
 * column's TaskState so a card can be dropped into an empty column (where there
 * is no sortable item to land on), wrapping a per-column `SortableContext` with
 * `verticalListSortingStrategy`. Mirrors 03's BoardColumn header/empty-state so
 * the visual board is unchanged; the static BoardColumn stays for 03's tests.
 */
export function KanbanColumn({
  state,
  tasks,
  categories,
  users,
}: {
  state: string;
  tasks: TaskCardView[];
  categories: CategoryOption[];
  users: UserOption[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: state });
  const label = TASK_STATE_LABELS[state] ?? state;
  const headingId = `column-${state}`;

  return (
    <section
      aria-labelledby={headingId}
      className={
        "flex min-w-64 flex-1 flex-col gap-3 rounded-lg border bg-muted/30 p-3 " +
        (isOver ? "ring-2 ring-ring" : "")
      }
    >
      <h2
        id={headingId}
        className="flex items-center justify-between text-sm font-semibold"
      >
        <span>{label}</span>
        <span className="text-xs font-normal text-muted-foreground">
          {tasks.length}
        </span>
      </h2>

      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul ref={setNodeRef} className="flex min-h-12 flex-col gap-2">
          {tasks.length === 0 ? (
            <li className="py-6 text-center text-xs text-muted-foreground">
              No tasks
            </li>
          ) : (
            tasks.map((task) => (
              <SortableTaskCard
                key={task.id}
                task={task}
                categories={categories}
                users={users}
              />
            ))
          )}
        </ul>
      </SortableContext>
    </section>
  );
}
