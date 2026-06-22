import type { Metadata } from "next";

import { BoardColumns } from "@/components/board/BoardColumns";
import { TaskFilters } from "@/components/board/TaskFilters";
import { TaskFormDialog } from "@/components/board/TaskFormDialog";
import type { TaskCardView } from "@/components/board/TaskCard";
import { requireUser } from "@/lib/auth";
import { listCatalog } from "@/lib/services/catalogs";
import { listTasks } from "@/lib/services/tasks";
import { listUsers } from "@/lib/services/users";
import { taskFiltersSchema } from "@/lib/validation/task";

export const metadata: Metadata = {
  title: "Board — Tower Layers",
};

/**
 * The Kanban board (Server Component, R7, R8). The (app) layout already redirects
 * unauthenticated requests; requireUser() here is a second server-layer guard
 * before any data read. Parses the owner/category/state search params into
 * filters, fetches the matching tasks (single query) plus the category + user
 * option lists, and renders the six fixed-order columns. All interactivity lives
 * in small Client islands (filters, the create/edit dialog, subtask checkboxes);
 * the page itself stays static so 04 can add a dnd island without rewriting it.
 */
export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();

  const params = await searchParams;
  const first = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value;

  const filters = taskFiltersSchema.parse({
    assigneeId: first(params.owner) ?? "",
    categoryId: first(params.category) ?? "",
    state: first(params.state) ?? "",
  });

  const [tasks, categories, users] = await Promise.all([
    listTasks(filters),
    listCatalog("taskCategory"),
    listUsers(),
  ]);

  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name }));
  const userOptions = users.map((u) => ({ id: u.id, name: u.name }));

  const cards: TaskCardView[] = tasks.map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    categoryId: task.categoryId,
    state: task.state,
    assigneeId: task.assigneeId,
    dueDate: task.dueDate ? task.dueDate.toISOString() : null,
    position: task.position,
    subtasks: task.subtasks.map((s) => ({
      id: s.id,
      title: s.title,
      done: s.done,
    })),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Board</h1>
        <TaskFormDialog
          mode="create"
          categories={categoryOptions}
          users={userOptions}
        />
      </div>

      <TaskFilters categories={categoryOptions} users={userOptions} />

      <BoardColumns
        tasks={cards}
        categories={categoryOptions}
        users={userOptions}
      />
    </div>
  );
}
