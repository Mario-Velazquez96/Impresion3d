# Design — 08_task_priority

**Source:** product-owner decision (2026-06-28); extends `specs/03_task_board_core`
**Depends on:** 03_task_board_core (Task model, `lib/validation/task.ts`,
`lib/services/tasks.ts`, `actions/tasks.ts`, `components/board/*`,
`app/(app)/board/page.tsx`)

## Approach

Additive change along the existing 03 seams. A new `Priority` enum + `Task.priority`
field flows through the same schema → service → action → page → component chain:
the board stays a Server Component, the form/filters stay Client islands, and the
auth + Zod + service + revalidate contract of `actions/tasks.ts` is reused
verbatim — the create/edit actions just carry one more validated field. No new
Server Action, route handler, env var, dependency, or RLS policy is introduced.
Card ordering is untouched (priority is filter-only; `position` still orders
columns).

## Schema & migration

Add to `prisma/schema.prisma`:

```prisma
enum Priority { LOW MEDIUM HIGH }

model Task {
  // …existing fields…
  priority Priority @default(MEDIUM)
  // …existing relations/indexes…
  @@index([priority]) // supports the priority filter
}
```

- Migration `task_priority` (`prisma migrate dev --name task_priority`). The
  column default `MEDIUM` backfills every existing row, so the migration is safe
  and non-destructive (R1). Commit the generated SQL.
- **RLS:** none added. The new column lives on the already-RLS-protected `Task`
  table from 03; existing policies cover it (out of scope per requirements).

## Validation (`lib/validation/task.ts`)

- Add a client-importable enum array + schema mirroring the Prisma enum, matching
  the existing `TASK_STATES` pattern (kept here so client components and the
  browser bundle avoid the server-only Prisma client):

  ```ts
  export const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
  export const prioritySchema = z.enum(PRIORITIES);
  export type Priority = z.infer<typeof prioritySchema>;
  ```

- `createTaskSchema` gains `priority: prioritySchema.default("MEDIUM")` so an
  absent form value defaults to `MEDIUM` (R2) and an out-of-set value fails
  validation (R6). `updateTaskSchema` inherits it via `.extend({ id })` and so
  validates `priority` on edit (R3, R6).
- `taskFiltersSchema` gains an optional `priority`, normalizing `""` / absent to
  `undefined` (same union-transform pattern as `state`):

  ```ts
  priority: z.union([z.literal(""), prioritySchema]).optional()
    .transform((v) => (v ? (v as Priority) : undefined)),
  ```

## Services (`lib/services/tasks.ts`)

- `TaskWithSubtasks` and the `listTasks` `select` gain `priority: true` so the
  card can render the badge (R4).
- `buildTaskWhere` gains `if (filters.priority) where.priority = filters.priority;`,
  AND-ed with the existing `assigneeId` / `categoryId` / `state` clauses — each
  absent filter is still omitted, so all active filters compose (R5). `where`'s
  local type gains `priority?: Priority`.
- `createTask` / `updateTask` write `priority: input.priority` (validated upstream).
  No position/sort change — column order stays by `position`.

## Actions (`actions/tasks.ts`)

- `createTaskAction` / `updateTaskAction` add `priority: formData.get("priority")`
  to the object passed to `safeParse`. No other change: `requireUser()` still runs
  first (R7), Zod still rejects a bad value (R6), and an invalid value returns a
  `zodFailure` field error. `revalidatePath('/board')` unchanged (R2, R3).

## Page (`app/(app)/board/page.tsx`, Server Component)

- Parse the new param into the filters object:
  `priority: first(params.priority) ?? ""` inside the `taskFiltersSchema.parse(...)`
  call. `listTasks(filters)` then constrains by priority (R5).
- Map `priority` into each `TaskCardView` (see below) so the card can render the
  badge. Server/Client split unchanged: page stays server-rendered; only the
  filters/dialog/card-islands are client.

## Components

### `TaskFilters.tsx` (Client island)

- Add a **Priority `<select>`** next to Owner/Category/State, reading
  `searchParams.get("priority") ?? ""` and calling the existing `setParam("priority", value)`
  (push/replace URL) so the page re-fetches server-side (R5). Options: `All
  priorities` (value `""`, clears the param) + one per `PRIORITIES` member with a
  human label. `hasFilters` includes `priority` so "Clear filters" appears when set.
- Add `PRIORITY_LABELS` (`Low` / `Medium` / `High`) to `components/board/board-types.ts`
  alongside `TASK_STATE_LABELS`.

### `TaskFormDialog.tsx` (Client island)

- Add a **priority `<select name="priority">`** (Low / Medium / High) after the
  state select, `defaultValue={task?.priority ?? "MEDIUM"}` — Medium on create,
  prefilled on edit (R2, R3). Extend the `EditTask` type with `priority: string`.

### `TaskCard.tsx` (Server Component)

- Extend `TaskCardView` with `priority: string`.
- Render a **colored, labelled priority badge** in the existing badge row, mapped
  by priority using `cn()` + Tailwind semantic tokens (dark-theme-friendly,
  accessible — label text always shown, not color-only, R4):
  - **HIGH** → destructive tone, e.g. `bg-destructive/15 text-destructive border-destructive/30`.
  - **MEDIUM** → amber/neutral tone, e.g. `bg-amber-500/15 text-amber-400 border-amber-500/30`.
  - **LOW** → muted/low-emphasis tone, e.g. `bg-muted text-muted-foreground border-border`.
  - Label text from `PRIORITY_LABELS` (`High` / `Medium` / `Low`).
- Pass `priority` through `TaskFormDialog`'s edit `task` prop so the edit form is
  prefilled.

## Auth & security

- Reuses 03 wholesale: every mutation begins with `requireUser()` (R7); Zod
  validates at the boundary, rejecting an out-of-set priority (R6). Prisma still
  bypasses RLS, so the server layer remains the guard; the existing `Task` RLS is
  defense-in-depth and already covers the new column.

## Server/Client boundary (unchanged from 03)

- Server: `board/page.tsx`, `TaskCard`, services — fetch + render.
- Client: `TaskFilters`, `TaskFormDialog` — interactivity only, importing the
  client-safe `PRIORITIES` / labels (no Prisma).

## Test approach

- **Vitest (schema/service, branch-complete):** `createTaskSchema` accepts each
  valid priority, defaults to `MEDIUM` when absent, and rejects an invalid value;
  `buildTaskWhere` includes `priority` and composes it with owner/category/state.
- **Component:** `TaskFormDialog` submits the chosen priority; `TaskCard` renders
  the correct badge per level; `TaskFilters` priority dropdown updates the URL.
- **E2E (Playwright):** create a High task → its badge shows; filter the board by
  priority narrows results and is reflected in `?priority=`.
- Coverage target: services + schemas branch-complete; the E2E flows green.

## Open items

- None. Auto-sort by priority is explicitly deferred (out of scope).
