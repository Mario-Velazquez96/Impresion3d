"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

import { reorderTaskAction } from "@/actions/tasks";
import { KanbanColumn } from "@/components/board/KanbanColumn";
import { TaskCard, type TaskCardView } from "@/components/board/TaskCard";
import {
  TASK_STATE_LABELS,
  type CategoryOption,
  type UserOption,
} from "@/components/board/board-types";
import { useToast } from "@/components/ui/toast";
import { TASK_STATES, type TaskState } from "@/lib/validation/task";

/**
 * The interactive Kanban board (04: R1, R2, R4, R6, R7). A Client island that:
 *  - receives the flat, position-ordered task list from the Server page and
 *    groups it into columns (the page stays a Server Component);
 *  - holds the grouping in optimistic local state;
 *  - wraps the columns in a DndContext with Pointer + Keyboard sensors and a
 *    per-column SortableContext (in KanbanColumn);
 *  - on drop, splices local state immediately, then calls reorderTaskAction;
 *    on failure it restores the pre-drag snapshot and shows a toast (R4);
 *  - renders a DragOverlay preview of the active card (R7);
 *  - customizes accessibility announcements for pick-up/move/drop (R6).
 *
 * The page revalidates /board on a successful action, which re-renders this
 * island with fresh props — server truth reconciles the optimistic state.
 */

type Grouped = Record<string, TaskCardView[]>;

/** Group a flat, position-ordered task list into the six fixed columns. */
function groupTasks(tasks: TaskCardView[]): Grouped {
  const grouped: Grouped = {};
  for (const state of TASK_STATES) grouped[state] = [];
  for (const task of tasks) {
    (grouped[task.state] ??= []).push(task);
  }
  return grouped;
}

/** The column a task currently sits in within the grouped state. */
function findColumnOf(grouped: Grouped, id: UniqueIdentifier): string | null {
  for (const state of TASK_STATES) {
    if (grouped[state]?.some((t) => t.id === id)) return state;
  }
  return null;
}

/**
 * Resolve a drop target (`over.id`) to a destination column + index. The target
 * is either a column droppable (its id is a TaskState — drop at the end) or
 * another card (insert before it). Pure and exported for the component test.
 */
export function resolveDrop(
  grouped: Grouped,
  activeId: UniqueIdentifier,
  overId: UniqueIdentifier,
): { toState: TaskState; toIndex: number } | null {
  const fromState = findColumnOf(grouped, activeId);
  if (!fromState) return null;

  const overIsColumn = (TASK_STATES as readonly string[]).includes(
    String(overId),
  );
  const toState = (
    overIsColumn ? String(overId) : findColumnOf(grouped, overId)
  ) as TaskState | null;
  if (!toState) return null;

  const destColumn = grouped[toState] ?? [];
  if (overIsColumn) {
    // Dropping onto the column body: append (or, within the same column, the
    // end excluding the moved card).
    const without = destColumn.filter((t) => t.id !== activeId);
    return { toState, toIndex: without.length };
  }

  const without = destColumn.filter((t) => t.id !== activeId);
  const overIndex = without.findIndex((t) => t.id === overId);
  return { toState, toIndex: overIndex < 0 ? without.length : overIndex };
}

/**
 * Apply a resolved drop to the grouped state, returning a new grouping with the
 * moved card removed from its source column and inserted at `toIndex` in the
 * destination (with its `state` updated). Pure; the optimistic update.
 */
export function applyMove(
  grouped: Grouped,
  activeId: UniqueIdentifier,
  toState: TaskState,
  toIndex: number,
): Grouped {
  const fromState = findColumnOf(grouped, activeId);
  if (!fromState) return grouped;

  const moved = grouped[fromState]?.find((t) => t.id === activeId);
  if (!moved) return grouped;

  const next: Grouped = {};
  for (const state of TASK_STATES) {
    next[state] = (grouped[state] ?? []).filter((t) => t.id !== activeId);
  }
  const updated = { ...moved, state: toState };
  const clamped = Math.max(0, Math.min(toIndex, next[toState].length));
  next[toState] = [
    ...next[toState].slice(0, clamped),
    updated,
    ...next[toState].slice(clamped),
  ];
  return next;
}

/**
 * Commit a resolved drop: optimistically splice local state, call the reorder
 * action, and on failure roll back to the snapshot and toast (R1, R2, R4).
 * Returns the action result (or null for a no-op / unresolved drop). Extracted
 * from the DndContext handler so the optimistic + rollback path is deterministic
 * under test (jsdom can't run dnd-kit's pointer/keyboard layout pipeline).
 */
export async function commitDrop(args: {
  grouped: Grouped;
  activeId: UniqueIdentifier;
  overId: UniqueIdentifier | null;
  setGrouped: (next: Grouped) => void;
  action: (payload: {
    taskId: string;
    toState: TaskState;
    toIndex: number;
  }) => Promise<{ ok: boolean; error?: string }>;
  toast: (message: string) => void;
}): Promise<{ ok: boolean; error?: string } | null> {
  const { grouped, activeId, overId, setGrouped, action, toast } = args;
  if (overId == null) return null;

  const target = resolveDrop(grouped, activeId, overId);
  if (!target) return null;

  const fromState = findColumnOf(grouped, activeId);
  const fromIndex =
    fromState != null
      ? (grouped[fromState] ?? []).findIndex((t) => t.id === activeId)
      : -1;
  if (fromState === target.toState && fromIndex === target.toIndex) return null;

  const snapshot = grouped;
  setGrouped(applyMove(grouped, activeId, target.toState, target.toIndex));

  const result = await action({
    taskId: String(activeId),
    toState: target.toState,
    toIndex: target.toIndex,
  });

  if (!result.ok) {
    setGrouped(snapshot); // rollback (R4)
    toast(result.error ?? "Failed to reorder task");
  }
  return result;
}

export function KanbanBoard({
  initial,
  categories,
  users,
}: {
  initial: TaskCardView[];
  categories: CategoryOption[];
  users: UserOption[];
}) {
  const { toast } = useToast();
  const [grouped, setGrouped] = useState<Grouped>(() => groupTasks(initial));
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);

  // Re-sync local state when the server sends a new task list (revalidate after
  // a successful reorder, or any other board mutation). Keyed remount via the
  // task signature keeps optimistic state authoritative during a drag but yields
  // to server truth between renders.
  const signature = useMemo(
    () => initial.map((t) => `${t.id}:${t.state}:${t.position}`).join("|"),
    [initial],
  );
  const [lastSignature, setLastSignature] = useState(signature);
  if (signature !== lastSignature) {
    setLastSignature(signature);
    setGrouped(groupTasks(initial));
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const activeTask = useMemo(() => {
    if (!activeId) return null;
    for (const state of TASK_STATES) {
      const found = grouped[state]?.find((t) => t.id === activeId);
      if (found) return found;
    }
    return null;
  }, [activeId, grouped]);

  function onDragStart(event: DragStartEvent) {
    setActiveId(event.active.id);
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    await commitDrop({
      grouped,
      activeId: active.id,
      overId: over?.id ?? null,
      setGrouped,
      action: reorderTaskAction,
      toast,
    });
  }

  const announcements: Announcements = {
    onDragStart({ active }) {
      const col = findColumnOf(grouped, active.id);
      return `Picked up task ${labelFor(grouped, active.id)} from ${columnLabel(col)}.`;
    },
    onDragOver({ active, over }) {
      if (!over) return `Task ${labelFor(grouped, active.id)} is no longer over a column.`;
      const target = resolveDrop(grouped, active.id, over.id);
      if (!target) return undefined;
      return `Task ${labelFor(grouped, active.id)} moved to position ${
        target.toIndex + 1
      } in ${columnLabel(target.toState)}.`;
    },
    onDragEnd({ active, over }) {
      if (!over) return `Task ${labelFor(grouped, active.id)} dropped back where it started.`;
      const target = resolveDrop(grouped, active.id, over.id);
      if (!target) return `Task ${labelFor(grouped, active.id)} dropped.`;
      return `Task ${labelFor(grouped, active.id)} dropped at position ${
        target.toIndex + 1
      } in ${columnLabel(target.toState)}.`;
    },
    onDragCancel({ active }) {
      return `Dragging task ${labelFor(grouped, active.id)} cancelled.`;
    },
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      accessibility={{ announcements }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex gap-3 overflow-x-auto pb-2">
        {TASK_STATES.map((state) => (
          <KanbanColumn
            key={state}
            state={state}
            tasks={grouped[state] ?? []}
            categories={categories}
            users={users}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask ? (
          <TaskCard task={activeTask} categories={categories} users={users} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/** The title of a task by id, for announcements. */
function labelFor(grouped: Grouped, id: UniqueIdentifier): string {
  for (const state of TASK_STATES) {
    const found = grouped[state]?.find((t) => t.id === id);
    if (found) return found.title;
  }
  return String(id);
}

/** The human-readable label of a column state, for announcements. */
function columnLabel(state: string | null): string {
  if (!state) return "the board";
  return TASK_STATE_LABELS[state] ?? state;
}
