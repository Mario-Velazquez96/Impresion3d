import { TaskCard, type TaskCardView } from "@/components/board/TaskCard";
import {
  TASK_STATE_LABELS,
  type CategoryOption,
  type UserOption,
} from "@/components/board/board-types";

/**
 * One board column (Server Component): a header with a count and the list of its
 * task cards in position order. Always renders even when empty (R8). The column
 * is a labelled region so it is reachable/announceable by assistive tech; 04 will
 * make it a dnd drop target.
 */
export function BoardColumn({
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
  const label = TASK_STATE_LABELS[state] ?? state;
  const headingId = `column-${state}`;

  return (
    <section
      aria-labelledby={headingId}
      className="flex min-w-64 flex-1 flex-col gap-3 rounded-lg border bg-muted/30 p-3"
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

      {tasks.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          No tasks
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              categories={categories}
              users={users}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
