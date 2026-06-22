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

export function TaskCard({
  task,
  categories,
  users,
}: {
  task: TaskCardView;
  categories: CategoryOption[];
  users: UserOption[];
}) {
  const category = categories.find((c) => c.id === task.categoryId);
  const assignee = task.assigneeId
    ? users.find((u) => u.id === task.assigneeId)
    : null;
  const doneCount = task.subtasks.filter((s) => s.done).length;

  return (
    <li className="rounded-md border bg-card p-3 text-card-foreground shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium leading-snug">{task.title}</h3>
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
    </li>
  );
}
