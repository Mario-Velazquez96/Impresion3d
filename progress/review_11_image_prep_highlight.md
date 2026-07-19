# Review — 11_image_prep enhancement: selection highlight (R23)

Date: 2026-07-18 · Reviewer subagent · Scope: uncommitted working-tree diff
(pre-commit validation)

## Verdict: APPROVED

## What was verified

### 1. Mask correctness (`lib/image-prep-core.ts`)
- `buildHighlightMask(image, selected)` builds a `width*height*4` RGBA buffer:
  alpha stays 0 over pixels of ANY selected entry (union via a `Set`), and only
  the alpha byte is set to `HIGHLIGHT_DIM_ALPHA` (178, ~70% dim) elsewhere —
  black veil, exactly as the design documents.
- Contract is explicit in the doc comment and enforced in code: `selected` is
  deduped (Set), non-integer / negative / past-the-palette indices are filtered
  (`Number.isInteger && i >= 0 && i < entries.length`), and `null` is returned
  when nothing valid remains.
- 6 new unit tests in `lib/__tests__/image-prep-core.test.ts` pin: single-entry
  transparency vs. exact `HIGHLIGHT_DIM_ALPHA` dim, union of [0,2],
  all-entries -> fully transparent mask, `[1,1,1.5,-1,99]` === `[1]` (dedupe +
  each invalid shape), `[]` and all-invalid -> `null`, and purity (indices +
  entries snapshots unchanged).
- Coverage: `lib/image-prep-core.ts` remains 100 / 100 / 100 / 100.

### 2. Rendering correctness (`BeforeAfterPreview.tsx`)
- Geometry checked carefully: the wrapper `div.relative` has no padding/border,
  the Preview canvas is its only in-flow child (block via Tailwind preflight,
  `w-full`), so wrapper box == canvas border box. Overlay is
  `absolute inset-0 h-full w-full` -> same border box; it carries the same 1px
  border (`border border-transparent`) so the CONTENT boxes coincide; both use
  `object-contain` and are painted at identical intrinsic dims
  (`highlight.image` w/h == `stage.preview` w/h, since the preview is
  `indexedToPixels(stage.image)`). Letterboxing therefore matches
  pixel-for-pixel, including the `max-h-[70vh]` clamped case.
- `pointer-events-none` present (asserted in a test) so R21 eyedropper clicks
  reach the canvas below; `aria-hidden="true"` — decorative only.
- Overlay unmounts entirely when the mask is null (conditional render keyed on
  `highlightMask`), restoring the plain preview.
- Painting reuses the existing jsdom-guarded `paint` helper (null canvas /
  missing 2D context no-op), same guard style as the R15 path.

### 3. View-only guarantee
- `highlight` is derived state only; no pipeline stage, worker message, or
  `working` buffer is touched. `handleDownload` reads `working` exactly as
  before — the overlay never composites into the exported canvas.
- Test asserts Download while highlighted still yields `photo-prepped.png`,
  one `URL.createObjectURL` call, and zero `fetch` calls.
- No new worker op; mask is a single O(pixels) main-thread pass.
- Memoization keyed correctly: `ImagePrep` memoizes `highlight` on
  `[quantizedImage, selected]` (null unless quantized + non-empty selection);
  `BeforeAfterPreview` memoizes the mask on `[highlight]`, which is
  referentially stable across unrelated re-renders (busy, pickMode, etc.).

### 4. Invariants (R20/R21/R22 cross-check)
- The existing `useEffect(() => setSelected([]), [quantizedImage])` reset fires
  on merge / snap / undo / fresh posterize / stage exit, so the highlight
  clears through the same path (test: fresh posterize unmounts the overlay).
- The one-render window where a new image renders with the stale selection is
  safe: `buildHighlightMask` filters out-of-range indices, so a removed entry
  can never be indexed.
- Eyedropper toggling composes: same-pixel pick deselects and the overlay
  clears (tested through the overlay, proving pass-through).

### 5. Scope discipline
- Diff limited to: core (+37, additive only), BeforeAfterPreview, ImagePrep,
  the two test files (additions ONLY — 0 deleted lines, R1–R22 tests
  untouched), specs (R23 + design section + tasks), progress logs.
- No changes to `package.json`, `pnpm-lock.yaml`, `prisma/`, `.env.example`,
  `worker-messages.ts`, `useImagePrepWorker.ts` — no schema, dependency,
  persistence, or worker-protocol change. No `console.log` / `any` /
  `debugger` / TODO in the diff.

### 6. Checks (re-run by reviewer, per instructions)
- `corepack pnpm typecheck` — pass (0 errors).
- `corepack pnpm lint` — exit 0; only pre-existing warnings in the unrelated
  `components/planning/__tests__/WeekPlanner.test.tsx`.
- `corepack pnpm test` — 62 files / 889 tests, all pass. Coverage:
  `lib/image-prep-core.ts` 100% branch; changed components
  `BeforeAfterPreview.tsx` 93.67% lines, `ImagePrep.tsx` 94.05% lines
  (target >= 80%).
- `pnpm build` and `pnpm test:e2e` intentionally NOT run this round per the
  leader's review instructions (typecheck/lint/test only); the change is
  client-render-only with no Server/Client boundary or route impact.

### Traceability
- R23 -> `image-prep-core.test.ts > buildHighlightMask (R23)` (6 tests) and
  `ImagePrep.test.tsx > selection highlight (R23)` (5 tests). `tasks.md`
  traceability table updated to R1–R23; all task boxes `[x]` and spot-checked
  against the code.

## Conclusion

APPROVED — the leader may commit this enhancement and keep `11_image_prep`
marked done.
