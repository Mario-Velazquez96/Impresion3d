---
name: nextjs-supabase-spec-author
description: Generate Spec-Driven Development (SDD) specs for a Next.js + Supabase + Prisma + Tailwind/shadcn + dnd-kit project deployed on Vercel. Use this skill WHENEVER the user wants to create specs, turn a design or PRD into specs, slice a feature into implementable units, or prepare web app work for an SDD/Kiro-style flow — even if they don't say the word "spec". Trigger on phrases like "create the specs", "generate specs from this design", "break this feature into pieces", "make specs I can implement with Claude Code", or when a product/feature description for this web stack is shared with intent to build. Produces one folder per feature, each with requirements.md (EARS notation) + design.md + tasks.md, sliced by deployable layer (schema/RLS → data access → server actions/route handlers → UI → realtime/polish) and left at spec_ready for human approval. Assumes an existing SDD harness (CLAUDE.md, AGENTS.md, .claude/agents/, docs/specs.md) and integrates into its specs/ folder and feature_list.json.
---

# Next.js + Supabase Spec Author

This skill turns a product/feature description (or PRD, or design doc) into a set
of implementable SDD specs for a **Next.js + Supabase + Prisma + Tailwind/shadcn +
dnd-kit on Vercel** project. The output drops into the repo's `specs/` folder and
is fed to Claude Code one feature at a time.

It uses the **same SDD flow** as the rest of the harness: three Kiro-style files
per feature, EARS-notation requirements, a human approval gate, and a
`feature_list.json` with the standard statuses. Only the technical conventions
change for this stack.

The point of SDD is that the **spec is the approved plan** the human signs off on
*before* any code is written. So specs must be precise, traceable, and sliced so
each one is independently implementable and verifiable.

## Assumes the harness

This skill assumes the repo already has the SDD harness (`CLAUDE.md` assigning a
`leader` role, `AGENTS.md`, `.claude/agents/`, `docs/specs.md`). These specs slot
into the harness's `specs/` folder and `feature_list.json`. If the harness is
missing, still generate the specs the same way — just tell the user they'll need
the harness (or a human) to drive implementation.

## The workflow

Follow these steps in order. The slicing decision (Step 2) is where most of the
value is.

### Step 1 — Read and understand the source

Read the entire source (PRD, design doc, or feature description) before writing.
Identify, for each feature area:

- **Data** — tables, columns, relationships, and the **Row Level Security (RLS)**
  posture. In Supabase, RLS is part of the data model, not an afterthought.
- **Data access** — Prisma models/migrations and where queries run (Server
  Components, Server Actions, Route Handlers).
- **Server logic** — Server Actions and/or Route Handlers, validation, auth checks.
- **UI** — App Router routes, Server vs Client Components, shadcn components,
  Tailwind, and any dnd-kit drag-and-drop surfaces.
- **Realtime / Storage** — Supabase Realtime subscriptions, Storage buckets +
  their access policies.
- **Architecture standards** stated in the source — carry them into every spec.

**Flag any inconsistency or unconfirmed assumption** (ambiguous ownership rules,
unclear RLS intent, optimistic-update expectations for dnd-kit). These become
explicit open items for the human at the approval gate — never silently decide.

Read `references/stack-conventions.md` before writing designs — it has the
current, verified conventions for this stack (Supabase SSR clients, RLS, Prisma
coexistence, Server Actions, dnd-kit, Vercel pitfalls).

### Step 2 — Slice by deployable layer, not by the source's feature list

Source docs often describe whole user-facing features ("a kanban board"). Those
are rarely the right unit to implement one-at-a-time, because they span schema,
server logic, and UI. Slice into **layers that are independently deployable and
verifiable**, ordered by dependency. The canonical web slicing:

1. **Schema + RLS** — Prisma schema/migration for the tables, plus the Supabase
   RLS policies and Storage bucket policies. Data foundation. Everything depends
   on it. Verifiable with migration + policy tests.
2. **Data access layer** — Prisma client setup, query/mutation functions,
   Zod schemas for validation. Pure functions, unit-testable.
3. **Server actions / route handlers** — the server entry points that call the
   data layer, enforce auth (`getUser()`), and validate input.
4. **UI** — App Router routes/pages, Server Components for data fetching, Client
   Components for interactivity, shadcn + Tailwind.
5. **Interactivity (dnd-kit) + realtime** — drag-and-drop with optimistic
   updates, Supabase Realtime subscriptions, and polish.

Adapt to the actual system, but keep the principle: each slice must be buildable
and testable given only the slices before it. Record `depends_on` per feature.
See `references/slicing-guide.md` for heuristics.

Before generating files, present the proposed slicing to the user and confirm it.

### Step 3 — Generate three files per feature

For each feature, create `specs/<NN_feature_name>/` with `requirements.md`,
`design.md`, `tasks.md`. Numeric prefix (`01_`, `02_`) reflects implementation
order. Follow `references/spec-templates.md` exactly. Essentials:

- **requirements.md** — purpose, in/out of scope, numbered **EARS** requirements
  (`R1`…), acceptance, open items. RLS and auth rules are first-class
  requirements, not implementation details.
- **design.md** — technical approach: schema/migration, RLS policies, file/route
  layout (App Router), Server vs Client Component boundaries, Server Actions,
  validation, and test approach. Cite the source's sections.
- **tasks.md** — ordered `- [ ]` checklist, each task citing the requirement(s)
  it satisfies, plus explicit test tasks and a coverage/verification target.

See `references/ears-notation.md` for writing good EARS requirements with web
examples.

### Step 4 — Set status and surface open items

- Create or merge `feature_list.json`, every new feature at `status:
  "spec_ready"` with its `depends_on`. Preserve existing `in_progress`/`done`
  entries. (Statuses: `pending` → `spec_ready` → `in_progress` → `done`, plus
  `blocked`.)
- **Stop at `spec_ready`.** Do not implement. A human must read and approve before
  anything moves to `in_progress`.
- Summarize: the slices, the implementation order, and **every open item needing
  a decision before building**. Make open items impossible to miss.

## Output shape

```
specs/
  01_schema_and_rls/      {requirements,design,tasks}.md
  02_data_access/         {requirements,design,tasks}.md
  03_server_actions/      {requirements,design,tasks}.md
  04_ui/                  {requirements,design,tasks}.md
  05_dnd_and_realtime/    {requirements,design,tasks}.md
feature_list.json         all new features at spec_ready, with depends_on
```

## Reference files

Read as needed — don't load all up front:

- `references/spec-templates.md` — exact templates + `feature_list.json` schema.
  **Read before generating any spec.**
- `references/ears-notation.md` — EARS patterns with Next.js/Supabase examples.
- `references/slicing-guide.md` — heuristics for slicing web features into layers.
- `references/stack-conventions.md` — current verified conventions for Next.js +
  Supabase + Prisma + shadcn + dnd-kit on Vercel. **Read before writing designs.**
