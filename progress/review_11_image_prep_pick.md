# Review — 11_image_prep · "Pick from image" eyedropper (R21)

**Verdict: APPROVED** — the leader may leave `11_image_prep` `done`; this
enhancement is safe to commit.

## What was verified

### 1. R21 traceability — tests genuinely assert behavior (not just render)
- `lib/__tests__/image-prep-core.test.ts` → `paletteIndexAt` (R21): in-bounds
  (both else branches), edge (last col/row), low clamp on each axis, high clamp
  on each axis → exercises every branch, keeping the core at 100% branch.
- `components/image-prep/__tests__/BeforeAfterPreview.test.tsx` (6 tests) →
  `mapClickToPixel`: 1:1 map, CSS-scale inversion, horizontal + vertical
  object-contain letterbox mapping, letterbox-margin rejection, far-edge
  half-open rejection (`offsetX === drawnW` → null), degenerate zero-size box/
  image → null.
- `components/image-prep/__tests__/ImagePrep.test.tsx` "pick from image (R21)"
  (4 tests): toggle flips `aria-pressed` and adds/removes `cursor-crosshair` on
  the Preview canvas; a stubbed-rect click selects the entry the pixel maps to
  (`aria-pressed=true` + "Picked" readout shows `#c80000`); pick-then-tap-another
  performs the merge (picked red into white → white 50%, red gone); a letterbox
  click selects nothing.
- Lifted tap-to-merge (R10) still asserted: "tap A then B merges A into B;
  tapping A twice deselects without merging" passes with the controlled
  selection.

### 2. Correctness (by reading the code)
- `mapClickToPixel`: `scale = min(rectW/imgW, rectH/imgH)`, centered via
  `(rect - drawn)/2`, half-open bounds reject the letterbox, floored to integer
  pixels. Pure and DOM-free; the component glue in `BeforeAfterPreview` passes
  real geometry — `getBoundingClientRect()` for the box and intrinsic
  `canvas.width/height` for the image — and forwards only non-null results.
- `paletteIndexAt` clamps x into `[0,width)` and y into `[0,height)` on each
  axis, then indexes `indices[cy*width + cx]`. Additive-only: the core diff is
  exactly the +17-line helper (`git diff` confirms no existing core logic
  changed).
- Selection invariant preserved after lifting: `ImagePrep` resets `selected`
  via `useEffect` keyed on the `quantizedImage` reference, which changes on
  merge / snap / fresh-posterize (new `image`) and on undo (restored prior
  `image` reference), and becomes `null` when the stage leaves `quantized` —
  so no stale index survives. `PalettePanel` also guards
  `selected < image.entries.length` before dereferencing. Cross-checked against
  the R20 undo path: `handleUndo` restores a prior `image` reference, re-firing
  the reset effect.
- pickMode is meaningful only in the quantized stage:
  `pickMode={stage.kind === "quantized" && pickMode}` gates the canvas
  onClick/crosshair, and `handlePick` guards `stage.kind === "quantized"` before
  calling `paletteIndexAt` — clicking when not quantized is unreachable/no-op.

### 3. Scope discipline
- `git diff --name-only` touches only: `lib/image-prep-core.ts`, the three
  named components, their tests, the new `BeforeAfterPreview.test.tsx`, and
  `specs/`/`progress/` docs. No `image-prep.worker.ts`, no `worker-messages.ts`,
  no `prisma/schema.prisma`, no migration, no `package.json`, no `.env.example`.
  No worker round trip, no persistence. R1–R20 code and tests untouched.

### 4. Conventions
- All-client boundary unchanged; naming consistent; the toggle carries
  `aria-pressed` with an active `bg-accent ring-2 ring-ring` style matching the
  entry-selected style; the controlled-props refactor of `PalettePanel`
  (`selected`/`onSelectedChange`/`pickMode`/`onTogglePickMode`) is clean and
  fully typed. No `console.*`, no `any`.

### 5. Gates re-run (build intentionally skipped)
- `corepack pnpm typecheck` → clean.
- `corepack pnpm lint` → clean (only pre-existing unrelated warnings in
  `components/planning/__tests__/WeekPlanner.test.tsx`).
- `corepack pnpm test` → **864 passed / 62 files**.
- Coverage: `lib/image-prep-core.ts` **100% branch**; changed components ≥ 80%
  lines — `BeforeAfterPreview.tsx` 92.42%, `ImagePrep.tsx` 93.65%,
  `PalettePanel.tsx` 98.55%.

## Non-blocking observation
- The "Picked" readout renders for any selection (including the first tap of a
  tap-two merge), not only eyedropper picks. This matches the spec's "optional
  Picked readout" and is harmless; no change required.
