"use client";

import { useActionState, useEffect, useRef } from "react";

import {
  createTaskAction,
  updateTaskAction,
  type TaskActionResult,
} from "@/actions/tasks";
import {
  TASK_STATE_LABELS,
  type CategoryOption,
  type UserOption,
} from "@/components/board/board-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TASK_STATES } from "@/lib/validation/task";

/**
 * Create/edit task dialog (Client island). Renders a trigger button and a native
 * <dialog> form that submits to createTask (R4) or updateTask (R5). Column
 * placement is set purely by the `state` <select> here — there is no dnd in 03;
 * changing state moves the card to another column on reload. Fully keyboard
 * operable: native <dialog>, labelled inputs, real buttons. Field errors from the
 * action (incl. a bad category/assignee FK, R10) render inline.
 */

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

type EditTask = {
  id: string;
  title: string;
  description: string | null;
  categoryId: string;
  state: string;
  assigneeId: string | null;
  dueDate: string | null; // ISO string
};

export function TaskFormDialog({
  mode,
  categories,
  users,
  task,
  defaultState,
}: {
  mode: "create" | "edit";
  categories: CategoryOption[];
  users: UserOption[];
  task?: EditTask;
  defaultState?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const action = mode === "create" ? createTaskAction : updateTaskAction;
  const [state, formAction, pending] = useActionState<
    TaskActionResult | null,
    FormData
  >(async (_prev, formData) => action(_prev, formData), null);

  useEffect(() => {
    if (state?.ok) {
      if (mode === "create") formRef.current?.reset();
      dialogRef.current?.close();
    }
  }, [state, mode]);

  const title = mode === "create" ? "New task" : "Edit task";
  const idPrefix = mode === "create" ? "new" : `edit-${task?.id ?? "x"}`;
  const dueDateValue = task?.dueDate ? task.dueDate.slice(0, 10) : "";

  const fieldError = (field: string) =>
    state && !state.ok
      ? state.fieldErrors?.find((e) => e.field === field)?.message
      : undefined;
  const formError =
    state && !state.ok && (!state.fieldErrors || state.fieldErrors.length === 0)
      ? state.error
      : undefined;

  return (
    <>
      {mode === "create" ? (
        <Button type="button" onClick={() => dialogRef.current?.showModal()}>
          New task
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => dialogRef.current?.showModal()}
        >
          Edit
        </Button>
      )}

      <dialog
        ref={dialogRef}
        aria-label={title}
        className="w-full max-w-md rounded-lg border bg-card p-6 text-card-foreground shadow-lg backdrop:bg-black/40"
      >
        <h2 className="mb-4 text-lg font-semibold">{title}</h2>
        <form ref={formRef} action={formAction} className="flex flex-col gap-4">
          {mode === "edit" && task ? (
            <input type="hidden" name="id" value={task.id} />
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${idPrefix}-title`}>Title</Label>
            <Input
              id={`${idPrefix}-title`}
              name="title"
              defaultValue={task?.title ?? ""}
              required
            />
            {fieldError("title") ? (
              <span role="alert" className="text-xs text-destructive">
                {fieldError("title")}
              </span>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${idPrefix}-description`}>Description</Label>
            <textarea
              id={`${idPrefix}-description`}
              name="description"
              defaultValue={task?.description ?? ""}
              rows={3}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${idPrefix}-category`}>Category</Label>
            <select
              id={`${idPrefix}-category`}
              name="categoryId"
              defaultValue={task?.categoryId ?? ""}
              required
              className={selectClass}
            >
              <option value="" disabled>
                Select a category
              </option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            {fieldError("categoryId") ? (
              <span role="alert" className="text-xs text-destructive">
                {fieldError("categoryId")}
              </span>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${idPrefix}-state`}>Column (state)</Label>
            <select
              id={`${idPrefix}-state`}
              name="state"
              defaultValue={task?.state ?? defaultState ?? "BACKLOG"}
              className={selectClass}
            >
              {TASK_STATES.map((s) => (
                <option key={s} value={s}>
                  {TASK_STATE_LABELS[s] ?? s}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${idPrefix}-assignee`}>Assignee</Label>
            <select
              id={`${idPrefix}-assignee`}
              name="assigneeId"
              defaultValue={task?.assigneeId ?? ""}
              className={selectClass}
            >
              <option value="">Unassigned</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${idPrefix}-due`}>Due date</Label>
            <Input
              id={`${idPrefix}-due`}
              name="dueDate"
              type="date"
              defaultValue={dueDateValue}
            />
          </div>

          {formError ? (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => dialogRef.current?.close()}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : mode === "create" ? "Create" : "Save"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
