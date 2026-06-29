"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";

/**
 * Minimal local toast (04_task_board_dnd). The repo has no toast utility and the
 * spec forbids new runtime dependencies, so this is a tiny self-contained
 * provider + hook: an ARIA live region renders transient messages and auto-
 * dismisses them. Used by the KanbanBoard to surface a reorder failure (R4).
 *
 * Scope intentionally small: a single severity, auto-dismiss, no queueing UI
 * beyond stacking. Swap for shadcn/sonner later without touching callers.
 */

export type Toast = { id: number; message: string };

type ToastContextValue = {
  toast: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DISMISS_MS = 4000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const toast = useCallback((message: string) => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, message }]);
    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, DISMISS_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        role="region"
        aria-label="Notifications"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            className="pointer-events-auto rounded-md border border-destructive bg-card px-4 py-2 text-sm text-destructive shadow-lg"
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Access the toast dispatcher. Throws if used outside a ToastProvider so a
 * missing provider fails loudly in development rather than silently dropping
 * notifications.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
