# Tasks — 00_project_setup

> Each task cites the requirement(s) it satisfies. Mark `[x]` as completed.

- [ ] Initialize Next.js App Router + TypeScript (`strict`), path alias `@/*` (R1)
- [ ] Add Tailwind + globals.css; init shadcn/ui, add one primitive (Button), `cn()` in `lib/utils.ts` (R1, R8)
- [ ] Install Prisma; write `prisma/schema.prisma` datasource (`DATABASE_URL` + `directUrl`) + generator; create `lib/db.ts` server-only singleton (R2)
- [ ] Create `lib/supabase/server.ts` + `lib/supabase/client.ts` via `@supabase/ssr`, per-request, publishable key (R3, R7)
- [ ] Add `middleware.ts` session refresh with a matcher excluding static assets (R4)
- [ ] Install dnd-kit (core + sortable + accessibility) — no UI (R5)
- [ ] Configure Vitest (`vitest.config.ts`) + Playwright (`playwright.config.ts`); add scripts `dev/build/typecheck/lint/test/test:e2e` (R5)
- [ ] Configure ESLint + Prettier (R5)
- [ ] Write `.env.example` with the 5 keys, no values; confirm `.env.local` gitignored (R6, R7)
- [ ] Add root `app/layout.tsx` + placeholder `app/page.tsx` that builds (R8)
- [ ] Write Vitest smoke test (`cn()`); write Playwright smoke test (`/` renders) (R5, R8)
- [ ] Confirm `init.sh` runs install → prisma generate → typecheck → lint → test → build green (R5)
- [ ] Decide & document `app/` vs `src/app/` in `docs/architecture.md` (Open item)
- [ ] Verify a Vercel preview deploy builds (Acceptance)

## Verification

- `bash init.sh` → all stages green (R1–R8). | `grep` confirms no `NEXT_PUBLIC_` on secret keys (R7).
- `pnpm test` → Vitest smoke passes; `pnpm test:e2e` → Playwright home smoke passes (R8).
- `.env.example` present with 5 keys, no secrets (R6).
- Coverage/target: **pipeline green**; smoke tests prove the toolchain end-to-end.
