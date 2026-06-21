# Slicing guide — turning a web feature into implementable specs

The goal: each spec is **independently implementable and verifiable**, given only
the specs before it. Bad slices block the implementer; good slices flow.

## The default web layering

Order features by dependency, foundation first:

1. **Schema + RLS** — Prisma schema/migration for the tables, the Supabase RLS
   policies (SQL), and any Storage bucket policies. No app logic. Everything
   depends on it. Verifiable with the migration applying + a policy/denial test.
2. **Data access layer** — Prisma client wiring, query/mutation functions, Zod
   schemas. Pure, unit-testable functions. No HTTP, no UI.
3. **Server actions / route handlers** — server entry points that enforce auth
   (`getUser()`), validate with Zod, and call the data layer.
4. **UI** — App Router routes/pages, Server Components for fetching, Client
   Components for interactivity, shadcn + Tailwind. Renders real data.
5. **Interactivity + realtime** — dnd-kit drag-and-drop with optimistic updates
   and rollback, Supabase Realtime, and polish (loading/empty/error states,
   accessibility).

Adapt to the real system, but keep the principle: buildable and testable given
only the slices before it.

## Heuristics for where to cut

**Cut here (good boundaries):**
- Between schema/RLS and the first code that queries it.
- Between the data layer and the server actions that call it (build callable,
  tested functions first; wire HTTP/actions after).
- Between server logic and UI (a route that renders server data is a clean slice
  before you add drag-and-drop).
- Between static UI and dnd-kit/realtime interactivity — the board that *renders*
  is one feature; the board you can *reorder* is the next.

**Don't cut here (creates blocked specs):**
- Splitting a server action from the Zod schema and data function it needs.
- Separating a table's columns from its RLS policy — they ship together.
- Isolating a Client Component from the server action that persists its changes,
  when neither can be tested without the other.

## Merge when…

- Two "features" are the same code path differing only by data/config (e.g.
  several similar CRUD entities). Consider one parameterized slice — but if each
  has distinct RLS or UI, keep them separate.
- A piece is too small to test alone and always ships with its neighbor.

## Split when…

- One user-facing feature spans schema + server + UI + dnd-kit (e.g. "a kanban
  board"). That's 4–5 specs, not one.
- The interactive layer (optimistic dnd-kit + realtime) is substantial — give it
  its own spec so its tricky rollback/reconciliation logic gets focused tests.

## Server vs Client boundary across slices

Note in each UI design which components are Server vs Client. A common pattern:
the page and data fetching are Server Components (one feature), and the
interactive island (dnd-kit board) is a Client Component added in a later feature.
State this so the implementer doesn't make the whole page a Client Component.

## Sanity check before finalizing

For each feature ask: "Given only its `depends_on`, can the implementer build AND
test this without touching anything unbuilt?" Pay special attention to RLS — a UI
slice that reads user data assumes the RLS slice already landed. If the order is
wrong, re-slice.
