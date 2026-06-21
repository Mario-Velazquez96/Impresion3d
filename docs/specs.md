# docs/specs.md — Spec-Driven Development process

This project uses a Kiro-style, three-file spec per feature plus a human
approval gate. Read this before drafting or reading any spec.

## The three files

Each `"sdd": true` feature gets a folder `specs/<feature>/` with:

| File | Purpose |
|---|---|
| `requirements.md` | What and why. User stories + acceptance criteria in EARS notation, numbered `R1…Rn`. Scope and out-of-scope. |
| `design.md` | How. Technical approach: routes/components, server actions/route handlers, Prisma schema changes, Supabase auth/Storage/RLS usage, validation, security. |
| `tasks.md` | Ordered, checkable implementation steps. Each task cites the requirement(s) it satisfies and includes explicit test tasks + a coverage target. |

## EARS notation

Write acceptance criteria as structured EARS statements so they are testable:

- **Ubiquitous:** "The system shall <response>."
- **Event-driven:** "When <trigger>, the system shall <response>."
- **State-driven:** "While <state>, the system shall <response>."
- **Unwanted behavior:** "If <condition>, then the system shall <response>."
- **Optional:** "Where <feature included>, the system shall <response>."

Examples for this stack:
> **R3 (Event-driven):** When an authenticated user drops a card into a new
> column, the system shall persist the card's `columnId` and `position` and
> reflect the new order on reload.
>
> **R4 (Unwanted behavior):** If an unauthenticated request hits the reorder
> action, then the system shall reject it with a 401 and make no DB write.

## What good design.md decisions look like here

- Which parts are **Server Components** vs **Client Components** and why.
- Mutations as **Server Actions** or **route handlers**; the auth + Zod +
  authorize + service + revalidate flow for each.
- **Prisma schema** additions/changes and the migration they require.
- Where **Supabase Auth / Storage / RLS** is involved, and how authorization is
  enforced in the server layer (remember: Prisma bypasses RLS — see
  `docs/architecture.md`).
- Any new env vars (added to `.env.example`) and new dependencies.

## The human approval gate

```
pending → [spec_author] → spec_ready → ⏸ HUMAN → in_progress → [implementer → reviewer] → done
```

When a spec reaches `spec_ready`, the leader **stops**. A human reviews the
three files and either approves (status → `in_progress`) or requests changes
(spec_author revises). Implementation never begins before approval.

## Traceability contract

Every `R<n>` must be traceable to at least one test (Vitest unit/component or
Playwright E2E). The reviewer enforces this: a requirement with no corresponding
test is an automatic rejection.
