# Review — 11_image_prep palette-cleanup Undo (R20)

**Reviewer verdict: APPROVED**
**Date:** 2026-07-17
**Scope reviewed:** In-session, client-only Undo of palette-cleanup edits
(merge / merge-similar / merge-tiny / snap) back to the fresh-posterize
baseline. New requirement R20. Pre-commit validation.

## 1. Traceability — R20 is covered, and the tests assert behavior

`components/image-prep/__tests__/ImagePrep.test.tsx` adds a
`describe("palette undo (R20)")` block (6 tests, all green):

- **baseline-disabled** — after Posterize the Undo button is `disabled`
  (history holds only the baseline).
- **enable + restore** — a tap-two merge enables Undo; clicking it restores the
  prior palette (white 25.0% / black 50.0% coverage reappear) and asserts
  `requestSpy` call count is unchanged (no worker re-post), disabling Undo again
  at baseline.
- **walk-back** — two merges then two Undos step back through each intermediate
  state to the baseline, asserting coverage at each step and that Undo disables;
  confirms the worker call count is flat across the Undos.
- **re-posterize resets** — after a merge, re-running Posterize disables Undo
  (history reseeded to a single baseline entry).
- **busy-disabled** — with history present but `busy` true, Undo is disabled.
- **Ctrl+Z** — `keydown` with `ctrlKey` reverts the last action.

These assert real state (palette entries, coverage %, request-spy counts), not
just rendering. R20 traces to concrete tests.

## 2. Behavior correctness (read of `ImagePrep.tsx`)

- **Pure client pop, no worker re-post.** `handleUndo` is a `setStage` that does
  `history.slice(0, -1)` and restores the new top's `image`/`preview`. It never
  calls `request()`. Confirmed by the tests' flat request-spy counts.
- **History reseeds on re-posterize.** `handlePosterize` sets
  `history: [{ image, preview }]`, so `canUndo` (needs `history.length > 1`)
  is false at a fresh baseline.
- **Discarded when the stage leaves `quantized`.** The `history` field lives
  inside the `quantized` stage variant. `handleApply` builds a fresh `adjusted`
  stage and `handleLoaded` a fresh `loaded` stage, both without a `history`
  field — structurally discarded, preserving R16.
- **Bounded depth.** `MAX_PALETTE_HISTORY = 20`; `handlePaletteAction` drops the
  oldest via `history.slice(history.length - MAX_PALETTE_HISTORY)`.
- **Stale palette selection cannot survive.** Undo restores a *different*
  `IndexedImage` reference (the stored prior state), so PalettePanel's
  `useEffect(..., [image])` re-fires and calls `setSelected(null)`. Additionally
  an undo always moves to a palette with *more* entries (merges only shrink it),
  so any lingering index is in-range; `entryButton` only iterates indices from
  the current image, so no out-of-range `image.entries[index]` access occurs.
  No path leaves a mismatched selection index live.
- **Busy guard at both call sites.** `canUndo` includes `!busy`; the button is
  `disabled={!canUndo}` and the keydown handler returns early unless `canUndo`.
  `Ctrl/Cmd+Z` only `preventDefault`s when Undo actually applies.

No way found for a stale or mismatched palette index to survive an undo.

## 3. Scope discipline

`git diff --stat` shows exactly 8 files: `ImagePrep.tsx`, `PalettePanel.tsx`,
the component test, and the four docs/progress files. **No** change to
`lib/image-prep-core.ts`, the worker, `worker-messages.ts`, `useImagePrepWorker`,
`prisma/schema.prisma`, `prisma/migrations/`, `package.json`, `.env.example`, or
any persistence path. R1–R19 tests are untouched and all still pass.

## 4. Conventions

- Both components keep `"use client"`; the Server/Client split is unchanged
  (undo is pure client state).
- The Undo button reuses the panel's secondary button styling
  (`h-8 rounded-md border px-2 text-xs hover:bg-accent disabled:opacity-50`),
  matching the Merge similar / Merge tiny buttons.
- Naming (`canUndo`, `onUndo`, `handleUndo`, `MAX_PALETTE_HISTORY`) is
  consistent with the codebase. No `any`, no `console.log` (lint clean).

## 5. Gates (re-run locally, build intentionally skipped)

- `corepack pnpm typecheck` — pass (0 errors).
- `corepack pnpm lint` — pass (only pre-existing unrelated `_a` unused-var
  warnings in `WeekPlanner.test.tsx`; no new findings).
- `corepack pnpm test` — **853 passed / 61 files**.
- Coverage: `lib/image-prep-core.ts` **100% branch** (unchanged, target met);
  `ImagePrep.tsx` 93.95% lines / `PalettePanel.tsx` 99.42% lines — both ≥ 80%.

## Verdict

**APPROVED.** The R20 Undo enhancement is correct, well-tested, in scope, and
all gates are green. The leader may have the change committed and the feature
marked `done`.
