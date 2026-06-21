# Stack conventions — Next.js + Supabase + Prisma + shadcn + dnd-kit on Vercel

Bake these into each `design.md` and `tasks.md` so the implementer doesn't
re-derive them. If the source design states its own standards, those win — carry
them through and cite the section. These reflect current (2026) practice; verify
against live docs when a detail is load-bearing, since this stack moves fast.

## Supabase auth + SSR (the part people get wrong)

- Use **`@supabase/ssr`**, not the deprecated `@supabase/auth-helpers`.
- You need **two client types**: a browser client (`createBrowserClient`) for
  Client Components, and a server client (`createServerClient`) for Server
  Components, Server Actions, and Route Handlers.
- **Initialize the Supabase client inside the request handler, never at module
  scope.** On Vercel's Fluid compute, a module-scope client can be reused across
  requests from different users and leak one user's session into another's. This
  is a security requirement, not a style choice — make it an explicit spec rule.
- In server code, verify auth with **`supabase.auth.getUser()`** (or
  `getClaims()`), which validates the token against the auth server. Don't trust
  an unverified session for authorization decisions.
- Session refresh runs in **middleware** (`middleware.ts` + a `utils/supabase`
  helper) because Server Components can't write cookies.
- Use the new **publishable / secret** API keys (`sb_publishable_…` /
  `sb_secret_…`); legacy `anon`/`service_role` keys are being phased out. The
  `service_role`/secret key bypasses RLS — it lives only in server-side code,
  never shipped to the browser.

## Row Level Security (RLS) — first-class, not an afterthought

- Every table holding user data has RLS **enabled** with explicit policies. A
  spec that adds a table must specify its RLS policies as requirements.
- Policies are the real authorization boundary. App-layer checks are convenience;
  RLS is enforcement. Specs should state both the policy and the expected denial
  behavior (an unauthorized read returns nothing, not an error).
- Storage buckets need their own access policies — specify them alongside the
  bucket.

## Prisma + Supabase coexistence

- Prisma owns the **schema and migrations** (`prisma migrate`). Decide one source
  of truth for schema and state it — mixing Prisma migrations with Supabase
  dashboard edits causes drift.
- **RLS is not expressed in Prisma.** Prisma migrations create tables/columns;
  RLS policies are added via SQL migrations (Prisma can run raw SQL in a
  migration, or use a Supabase migration). The spec must say where each policy
  lives so it's version-controlled, not clicked in a dashboard.
- Prisma connects via the Supabase connection pooler. Use the pooled connection
  string for the app and the direct connection for migrations; note both env vars
  in the schema feature.
- Caution: Prisma's client, used with the service role, **bypasses RLS**. If you
  query through Prisma server-side, enforce auth in the server action explicitly —
  you don't get RLS protection automatically the way you do through the Supabase
  client with a user's JWT.

## Next.js App Router

- Default to **Server Components**; add `"use client"` only where interactivity
  needs it (event handlers, hooks, dnd-kit, realtime). Keep client bundles small.
- Data fetching happens in Server Components or server actions, close to the data.
- **Server Actions** for mutations: validate input with **Zod** at the top,
  check auth with `getUser()`, then call the data layer. Return typed results.
- Route Handlers (`route.ts`) for webhooks and non-form HTTP endpoints.
- Never put secrets in `NEXT_PUBLIC_*` — those ship to the browser.

## Validation & types

- **Zod** schemas validate every server-action/route-handler input. The same
  schema can type the form. State the schema as part of the design.
- End-to-end TypeScript; generate Supabase types and/or rely on Prisma types.

## Tailwind / shadcn

- shadcn components are copied into the repo (`components/ui`), not a dependency —
  treat them as owned code that can be edited.
- Compose with Tailwind utilities; keep design tokens consistent. Accessibility
  (focus states, ARIA, keyboard nav) is part of acceptance, not optional.

## dnd-kit

- dnd-kit needs Client Components. Isolate the draggable surface in a client
  island; keep the rest server-rendered.
- Specify the **optimistic update** behavior explicitly: reorder in local state
  on drop, persist via a server action, and reconcile/rollback on failure. This
  is a common source of bugs and belongs in requirements (EARS "When… the system
  shall…" + an "If the persist fails, then…" guard).
- Persist order with a stable strategy (e.g. a fractional/`position` column or an
  ordered array), and say which in the design so concurrent reorders don't thrash.
- Keyboard-accessible drag (dnd-kit supports it) is an acceptance criterion.

## Vercel deployment

- Environment variables set per environment (Preview vs Production); migrations
  run as part of the deploy pipeline, not manually against prod.
- Be deliberate about caching on authenticated routes — don't cache responses
  that set auth cookies (covered in the Supabase advanced SSR guidance).

## Testing

- Unit-test the data layer and Zod schemas (Vitest/Jest).
- Component tests for interactive UI (React Testing Library); cover the dnd-kit
  reorder + rollback path.
- E2E for critical flows (Playwright): auth, the main create/read/update path.
- RLS deserves an explicit test: a user cannot read/write another user's rows.
- State a coverage or "what proves done" target per feature in `tasks.md`.
