import { BoardColumn } from "@/components/board/BoardColumn";
import type {
  CategoryOption,
  UserOption,
} from "@/components/board/board-types";
import type { TaskCardView } from "@/components/board/TaskCard";
import { TASK_STATES } from "@/lib/validation/task";

/**
 * The six board columns (Server Component) rendered in the fixed TaskState order
 * (R8), each fed the subset of tasks for its state. The flat, position-ordered
 * task list is grouped into columns here in memory (no extra queries). 04 will
 * wrap this in a single dnd context; the Server/Client split is drawn so that can
 * happen without changing the column data flow.
 */
export function BoardColumns({
  tasks,
  categories,
  users,
}: {
  tasks: TaskCardView[];
  categories: CategoryOption[];
  users: UserOption[];
}) {
  const byState = new Map<string, TaskCardView[]>();
  for (const state of TASK_STATES) byState.set(state, []);
  for (const task of tasks) {
    byState.get(task.state)?.push(task);
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {TASK_STATES.map((state) => (
        <BoardColumn
          key={state}
          state={state}
          tasks={byState.get(state) ?? []}
          categories={categories}
          users={users}
        />
      ))}
    </div>
  );
}
