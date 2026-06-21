# Solution Design — <App Name>

> **Status: TEMPLATE — to be filled in after `client_requirement.md`.**
> This is the approved architecture: *how* we build it. The `leader` follows
> this plan to sequence features. Keep it aligned with `docs/architecture.md`.

**Stack:** Next.js (App Router) · Supabase (Postgres + Auth + Storage, hosted) ·
Prisma · Tailwind + shadcn/ui · dnd-kit · Vercel · TypeScript · pnpm.

---

## 1. Context

_Restate the goal in technical terms and any constraints/decisions already made._

## 2. Requirement → Design mapping

| Requirement (from brief) | Design element |
|---|---|
| _Feature X_ | _route / component / action / model_ |

## 3. Data model (Prisma)

_Sketch the `schema.prisma` models, relations, indexes, and ownership fields.
Note where `position`/`order` ranks are needed for dnd-kit reordering._

```prisma
// model User { ... }
// model ... { ... }
```

## 4. Routes & components (App Router)

_Route tree; which segments are Server vs Client Components; layouts;
loading/error boundaries._

```
app/
  (auth)/...
  ...
```

## 5. Mutations (Server Actions / route handlers)

_For each mutation: trigger → auth → Zod schema → authorization → service →
revalidate. Note which need optimistic UI (e.g. dnd-kit reorder)._

## 6. Auth, Storage & security

_Supabase Auth flow (@supabase/ssr, middleware session refresh); RLS policies as
defense-in-depth; how server-layer authorization protects Prisma paths; Storage
buckets and access rules._

## 7. Drag & drop design (dnd-kit)

_Sensors (incl. keyboard), the DndContext layout, the ordering strategy, and how
order persists durably and idempotently._

## 8. Environment & deployment

_Required env vars (DATABASE_URL pooled, DIRECT_URL, NEXT_PUBLIC_SUPABASE_URL,
NEXT_PUBLIC_SUPABASE_ANON_KEY, ...) → `.env.example`. Vercel project + preview
strategy. Which Supabase project is dev/staging._

## 9. Feature breakdown & sequencing

_The ordered list of features for `feature_list.json`, with `depends_on`.
`00_project_setup` first, then build outward._

## 10. Risks & open items

| # | Risk / item | Decision |
|---|---|---|
| 1 | | |

## 11. Verification strategy

_What Vitest vs Playwright cover; coverage target; what a Vercel preview smoke
test should confirm._
