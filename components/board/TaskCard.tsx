import type { DraggableAttributes } from "@dnd-kit/core";

import { SubtaskList } from "@/components/board/SubtaskList";
import { TaskFormDialog } from "@/components/board/TaskFormDialog";
import type {
  CategoryOption,
  UserOption,
} from "@/components/board/board-types";

/**
 * A single board task (Server Component). Shows the title, a category badge, an
 * optional assignee + due-date badge, subtask progress, and hosts the subtask
 * checklist plus an Edit dialog. The interactive pieces (Edit dialog, subtask
 * checkboxes) are Client islands; the card itself stays server-rendered so the
 * board is statically renderable and 04 can wrap cards in a dnd island without
 * touching this file's data shape.
 */

export type TaskCardView = {
  id: string;
  title: string;
  description: string | null;
  categoryId: string;
  state: string;
  assigneeId: string | null;
  dueDate: string | null; // ISO string, serializable across the boundary
  position: number;
  subtasks: { id: string; title: string; done: boolean }[];
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Optional drag affordances supplied by 04's SortableTaskCard. When present, a
 * dedicated drag-handle button is rendered (carrying the dnd-kit listeners) so
 * the rest of the card — the Edit dialog, subtask checkboxes — stays clickable
 * and keyboard-focusable. Absent (e.g. the static 03 tests, or the DragOverlay
 * preview) the card renders exactly as before.
 */
// dnd-kit's useSortable listeners map (handlers keyed by event name). The
// package does not re-export the named type from its root, so we describe the
// shape we actually spread onto the handle button.
export type DragListeners = Record<
  string,
  (event: React.SyntheticEvent) => void
>;

export type TaskCardDrag = {
  attributes?: Partial<DraggableAttributes>;
  listeners?: DragListeners;
};

export function TaskCard({
  task,
  categories,
  users,
  drag,
}: {
  task: TaskCardView;
  categories: CategoryOption[];
  users: UserOption[];
  drag?: TaskCardDrag;
}) {
  const category = categories.find((c) => c.id === task.categoryId);
  const assignee = task.assigneeId
    ? users.find((u) => u.id === task.assigneeId)
    : null;
  const doneCount = task.subtasks.filter((s) => s.done).length;

  return (
    <div className="rounded-md border bg-card p-3 text-card-foreground shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-1.5">
          {drag ? (
            <button
              type="button"
              aria-label={`Drag ${task.title}`}
              className="mt-0.5 cursor-grab touch-none rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
              {...drag.attributes}
              {...drag.listeners}
            >
              ⠿
            </button>
          ) : null}
          <h3 className="truncate text-sm font-medium leading-snug">
            {task.title}
          </h3>
        </div>
        <TaskFormDialog
          mode="edit"
          categories={categories}
          users={users}
          task={{
            id: task.id,
            title: task.title,
            description: task.description,
            categoryId: task.categoryId,
            state: task.state,
            assigneeId: task.assigneeId,
            dueDate: task.dueDate,
          }}
        />
      </div>

      {task.description ? (
        <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
          {task.description}
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
        <span className="rounded border px-1.5 py-0.5 text-muted-foreground">
          {category?.name ?? "Uncategorized"}
        </span>
        {assignee ? (
          <span className="rounded border px-1.5 py-0.5 text-muted-foreground">
            {assignee.name}
          </span>
        ) : null}
        {task.dueDate ? (
          <span className="rounded border px-1.5 py-0.5 text-muted-foreground">
            Due {formatDate(task.dueDate)}
          </span>
        ) : null}
        {task.subtasks.length > 0 ? (
          <span className="rounded border px-1.5 py-0.5 text-muted-foreground">
            {doneCount}/{task.subtasks.length} done
          </span>
        ) : null}
      </div>

      <SubtaskList taskId={task.id} subtasks={task.subtasks} />
    </div>
  );
}
