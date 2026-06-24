"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  TaskCard,
  type DragListeners,
  type TaskCardView,
} from "@/components/board/TaskCard";
import type {
  CategoryOption,
  UserOption,
} from "@/components/board/board-types";

/**
 * A sortable wrapper around the presentational TaskCard (04: R1, R2). Applies
 * dnd-kit's `useSortable` to a list item: the sortable transform/transition drive
 * the visual reorder, and the drag listeners are forwarded to the card's drag
 * handle so the Edit dialog and subtask checkboxes stay independently
 * clickable/focusable. While this item is the active drag source it is dimmed
 * (the DragOverlay carries the visible preview, R7).
 */
export function SortableTaskCard({
  task,
  categories,
  users,
}: {
  task: TaskCardView;
  categories: CategoryOption[];
  users: UserOption[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : undefined,
      }}
    >
      <TaskCard
        task={task}
        categories={categories}
        users={users}
        drag={{ attributes, listeners: listeners as DragListeners | undefined }}
      />
    </li>
  );
}
