#!/usr/bin/env bash
#
# init.sh — bootstrap + verification entry point for the SDD harness.
#
# Stack: Next.js (App Router) · Supabase (hosted) · Prisma · Tailwind/shadcn ·
#        dnd-kit · pnpm · Vitest + Playwright.
#
# Usage:
#   ./init.sh            # full pipeline: install → generate → typecheck → lint → test → build
#   ./init.sh quick      # fast loop: typecheck → lint → test (skip install/build/e2e)
#   ./init.sh e2e        # run Playwright E2E only (requires a build/dev server)
#
# Conventions:
#   - Exits non-zero on the first failing step (set -e), so callers can gate on it.
#   - Reads env from .env.local (gitignored). Never prints secret values.
#   - Targets the DEV/STAGING Supabase project only. Never production.

set -euo pipefail

MODE="${1:-full}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

log()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# --- Preconditions ----------------------------------------------------------
command -v pnpm >/dev/null 2>&1 || die "pnpm not found. Install it: npm i -g pnpm (or 'corepack enable')."

if [ ! -f package.json ]; then
  warn "No package.json yet — the app hasn't been bootstrapped."
  warn "This is expected before feature '00_project_setup' is implemented."
  warn "Nothing to verify. Exiting 0."
  exit 0
fi

if [ ! -f .env.local ]; then
  warn ".env.local not found. Copy .env.example → .env.local and fill in the"
  warn "Supabase + Prisma values (DATABASE_URL, DIRECT_URL, NEXT_PUBLIC_SUPABASE_URL,"
  warn "NEXT_PUBLIC_SUPABASE_ANON_KEY, ...). Some steps may fail without them."
fi

# --- Steps ------------------------------------------------------------------
install_deps() { log "Installing dependencies (pnpm)"; pnpm install --frozen-lockfile || pnpm install; }
prisma_generate() {
  if [ -f prisma/schema.prisma ]; then log "Generating Prisma client"; pnpm prisma generate; fi
}
typecheck() { log "Type-checking (tsc --noEmit)"; pnpm run typecheck; }
lint()      { log "Linting (eslint)"; pnpm run lint; }
unit()      { log "Unit/component tests (Vitest + coverage)"; pnpm run test; }
e2e()       { log "E2E tests (Playwright)"; pnpm run test:e2e; }
build()     { log "Production build (next build)"; pnpm run build; }

case "$MODE" in
  quick) typecheck; lint; unit ;;
  e2e)   e2e ;;
  full)  install_deps; prisma_generate; typecheck; lint; unit; build ;;
  *)     die "Unknown mode '$MODE'. Use: full | quick | e2e" ;;
esac

log "init.sh ($MODE) completed successfully ✅"
