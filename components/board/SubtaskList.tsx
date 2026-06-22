"use client";

import { useRef, useState, useTransition } from "react";

import {
  addSubtaskAction,
  removeSubtaskAction,
  toggleSubtaskAction,
} from "@/actions/tasks";

/**
 * Subtask checklist (Client island). Each checkbox toggles a subtask via the
 * toggleSubtask action (R6); the new value persists and reflects on reload. An
 * inline add field appends a subtask; a remove button deletes one. Mutations run
 * inside a transition so the row disables while pending. Fully keyboard operable
 * (native checkboxes, inputs, buttons).
 */

export type SubtaskItem = { id: string; title: string; done: boolean };

export function SubtaskList({
  taskId,
  subtasks,
}: {
  taskId: string;
  subtasks: SubtaskItem[];
}) {
  const [isPending, startTransition] = useTransition();
  const addInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(subtaskId: string, done: boolean) {
    setError(null);
    const formData = new FormData();
    formData.set("subtaskId", subtaskId);
    formData.set("done", done ? "true" : "false");
    startTransition(async () => {
      const result = await toggleSubtaskAction(null, formData);
      if (!result.ok) setError(result.error);
    });
  }

  function remove(subtaskId: string) {
    setError(null);
    const formData = new FormData();
    formData.set("subtaskId", subtaskId);
    startTransition(async () => {
      const result = await removeSubtaskAction(null, formData);
      if (!result.ok) setError(result.error);
    });
  }

  function add(formData: FormData) {
    setError(null);
    formData.set("taskId", taskId);
    startTransition(async () => {
      const result = await addSubtaskAction(null, formData);
      if (result.ok) {
        addInputRef.current?.form?.reset();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="mt-2 flex flex-col gap-1">
      {subtasks.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {subtasks.map((subtask) => {
            const checkboxId = `subtask-${subtask.id}`;
            return (
              <li key={subtask.id} className="flex items-center gap-2 text-xs">
                <input
                  id={checkboxId}
                  type="checkbox"
                  checked={subtask.done}
                  disabled={isPending}
                  onChange={(e) => toggle(subtask.id, e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                <label
                  htmlFor={checkboxId}
                  className={
                    subtask.done
                      ? "flex-1 text-muted-foreground line-through"
                      : "flex-1"
                  }
                >
                  {subtask.title}
                </label>
                <button
                  type="button"
                  onClick={() => remove(subtask.id)}
                  disabled={isPending}
                  aria-label={`Remove subtask ${subtask.title}`}
                  className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <form action={add} className="flex items-center gap-1">
        <input
          ref={addInputRef}
          name="title"
          placeholder="Add subtask"
          aria-label="New subtask title"
          className="h-7 flex-1 rounded border border-input bg-background px-2 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          disabled={isPending}
          className="h-7 rounded border px-2 text-xs disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}
