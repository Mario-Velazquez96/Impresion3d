# Tasks — 13_crop

> Each task cites the requirement(s) it satisfies. Mark `[x]` as completed.
> Read `design.md` first. **This feature touches NO schema and adds NO
> migration, Server Action, route handler, Storage bucket/policy, env var, or
> dependency** (R22) — if a task seems to need one, stop and re-read the spec.
> `lib/image-prep-core.ts`, `lib/flatten-core.ts`, `worker-messages.ts`,
> `image-prep.worker.ts`, and `useImagePrepWorker.ts` are **not modified**;
> feature 13 only imports from them (R21). No config change is authorized (no
> new coverage exclusion, no threshold edit).
>
> **Single phase**, sliced by layer: core math → shared hook/canvas → panel UI
> → island wiring → tests/E2E. Tasks are ordered; each is independently
> verifiable and leaves `typecheck` / `lint` / `test` green.

## 1. Core math (`lib/crop-core.ts`)

- [x] Create `lib/crop-core.ts` — part 1, units + constants + geometry helpers: the types (`CropRect`, `PrintSize`, `Handle`, `HitTarget`, `Orientation`, `ResolutionLevel`, `CropPreset`, `ContentBox`), the exported constants (`MIN_PRINT_MM` 1, `MAX_PRINT_MM` 1000, `MM_MAX_DECIMALS` 2, `DEFAULT_PRINT_SIZE` 71.7 × 94, `MIN_CROP_PX` 16, `HANDLE_HIT_SCREEN_PX` 10, `NUDGE_PX` 1, `NUDGE_COARSE_PX` 10, `PX_PER_MM_COMFORTABLE` 5, `PX_PER_MM_MIN` 2.5, `MM_PER_INCH` 25.4) and `CROP_PRESETS` (the six built-ins of design.md, including **71.7 × 94**, each with the one-line justification comment); `parseMmInput` (trim, `,` or `.` separator, reject empty/non-numeric/NaN/Infinity/≤ 0/out of range/too many decimals → `null`), `aspectRatio`, `swapOrientation`, `describeAspect`, `matchingPreset`. Pure — imports only `PixelBuffer` + `MAX_WORKING_DIMENSION` from `@/lib/image-prep-core`; no DOM, no React, no `server-only`, no new dependency; header comment justifies the **sibling-core** decision (R2, R3, R4, R5)
- [x] `lib/crop-core.ts` — part 2, the ratio-locked rectangle: `clampRectToImage` (the idempotent invariant enforcer — shrink to fit with the derived side `round(other × ratio)`, `MIN_CROP_PX` floor on both sides, translate inside bounds, integer output), `fitRect` (largest ratio rect, centred), `fillRect` (Fit's size around the current centre, then clamped), `refitRect` (new ratio, centre + pixel area preserved, then clamped), `moveRect`, `resizeRect` (all 8 handles with the anchor rules of design.md — corner → opposite corner, edge → opposite edge with the perpendicular axis centred; growth **stops** at the image bounds instead of breaking the ratio), `hitTestHandle` (corners > edges > `"inside"` > `null`), `handleCursor`. Every rect-producing function ends in `clampRectToImage`, so R6 holds by construction (R6, R7, R8, R9, R19)
- [x] `lib/crop-core.ts` — part 3, box geometry + readout + the crop: `contentBoxOf` (the same uniform `object-contain` scale + centring `mapClickToPixel` inverts; degenerate → `null`), `boxPointToImage` (the documented **clamped, float** sibling of `mapClickToPixel` for in-progress drags), `imageRectToBoxFractions`; `effectivePxPerMm`, `pxPerMmToDpi`, `resolutionLevel` (`< PX_PER_MM_MIN` → `"critical"`, `< PX_PER_MM_COMFORTABLE` → `"low"`, else `"ok"`), `pixelsKeptPercent`; `cropPixels` (rect clamped defensively, row-wise `subarray`→`set` copy into a fresh buffer, input unmutated, **no resampling/scaling** — output is exactly `rect.width × rect.height` source pixels) (R10, R11, R13, R18, R21)

## 2. Shared canvas view (reuse, not reinvention)

- [x] Create `components/image-prep/use-canvas-view.ts` (`"use client"`) by **extracting** the viewport/`ResizeObserver` content measurement, non-passive wheel-zoom listener, Space tracking, middle-/Space-drag pan, Expand toggle, and the `capClass`/`fitClass`/`transformStyle` derivation out of `FlattenCanvas.tsx` — importing `zoomAt`/`panBy`/`clampView`/`IDENTITY_VIEW` from `@/lib/flatten-core` **verbatim** (including the corrected content-vs-viewport `clampView` bounds); refactor `FlattenCanvas.tsx` to consume it. **Mechanical, zero behavior change**: `components/image-prep/__tests__/FlattenWorkspace.test.tsx` must pass **unmodified** (R17, R18)

## 3. Crop canvas + overlay

- [x] Create `components/image-prep/CropCanvas.tsx` (`"use client"`) — `useCanvasView` viewport + transform wrapper holding the base canvas (painted from the working image via the existing jsdom-guarded `paint` from `canvas-paint.ts`) and the **DOM** crop overlay (content-box wrapper `overflow-hidden` + `pointer-events-none` + `aria-hidden`, the rect div with its ring and `shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]` dim, 8 decorative handle squares), positioned from the pure `imageRectToBoxFractions`; `onMouseDown` → `mapClickToPixel` (imported from `BeforeAfterPreview`, letterbox press → no drag) → `hitTestHandle` with tolerance `HANDLE_HIT_SCREEN_PX / contentBox.scale`; window `mousemove`/`mouseup` continue/end the drag via `boxPointToImage` → `moveRect` / `resizeRect`; hover cursor via `handleCursor`; Space/middle-button presses defer to the hook's pan and never also crop; Expand toggle; the hints strip (drag to move · handles to resize · arrows nudge (Shift ×10) · scroll zoom · space-drag pan · Esc cancel). **No Download button** (R6, R7, R8, R17, R18, R20)

## 4. Panel UI

- [x] Create `components/image-prep/CropSizePanel.tsx` (`"use client"`) — two labelled mm inputs (`inputMode="decimal"`, controlled string drafts) with a per-field inline `role="alert"` on invalid input; the `CROP_PRESETS` buttons (`aria-pressed` via `matchingPreset`); **Swap orientation**; **Fit** / **Fill** / **Reset**; the readout block (`W × H px · N% of pixels kept · W × H mm · N.N px/mm (D dpi)`) with the `resolutionLevel`-driven caution (`role="status"`) and warning (`role="alert"`) and the R12 note that the readout comes from the 2048 px-capped working image and that cropping only ever **reduces** px/mm; **Apply crop** (disabled while `busy` or any mm field is invalid) and **Cancel** (R2, R3, R4, R5, R9, R10, R11, R12, R13, R14, R21)
- [x] Create `components/image-prep/CropStartCard.tsx` (`"use client"`) — left-column card: inactive → copy + **Start crop** (disabled with no image / while busy); inactive **and cropped** → also "Cropped to `W × H px` — from `W₀ × H₀`" + **Revert to uncropped**; active → the notice that applying restarts the pipeline and discards adjustments, palette, and flatten edits (R1, R13, R15)

## 5. Workspace + island wiring

- [x] Create `components/image-prep/CropWorkspace.tsx` (`"use client"`) — owns the transient crop state (`size`, the two mm drafts + errors, `rect`, the active-drag ref) and wires `CropCanvas` + `CropSizePanel`: mm edit / preset / swap → `parseMmInput` → new `size` → `refitRect`; Fit / Fill / Reset (Reset restores the **stage-entry** size *and* the Fit rect); a `[working]` effect re-fits the rect if the reference image is replaced; derived readout via `effectivePxPerMm` / `pxPerMmToDpi` / `resolutionLevel` / `pixelsKeptPercent`; the crop keyboard map on a window listener (arrows / Shift+arrows nudge with the feature-12 text-entry guard, `Esc` cancels); `onApply(rect)` / `onCancel` up to the island (R2, R3, R4, R5, R6, R9, R10, R11, R14, R19)
- [x] `components/image-prep/ImagePrep.tsx` — stage integration: add `uploaded: PixelBuffer` to `LoadedFields` (same reference as `original` until a crop; set on file load) and `CropStage { kind: "crop"; resume: CropResume }` to the Stage union; a `baseOf(stage)` helper unwrapping `crop → resume → (flatten → resume)` replacing the inline ternary, and the working-image derivation gaining the crop arm; `handleEnterCrop` (`{ kind: "crop", resume: current }`, disabled while busy/empty), `handleCancelCrop` (`setStage(stage.resume)` — pure restore of the palette + its undo history, or the flatten image + history + counter), `handleApplyCrop(rect)` (`cropPixels(base.original, rect)` on the **main thread**, then a fresh `loaded` stage with `original` = cropped and `uploaded` preserved — structurally discarding adjusted/histogram/quantized/palette/palette-history/flatten per 11/R16), `handleRevertCrop` (fresh `loaded` stage with `original = base.uploaded`); while cropping, hide `PalettePanel` and pass `disabled` to `AdjustPanel` / `PosterizePanel` / `FlattenStartCard` while the dropzone stays live; render `CropWorkspace` instead of `BeforeAfterPreview`. **No worker request is posted anywhere in this path** (R1, R13, R14, R15, R16, R21)

## 6. Tests

- [x] Vitest `lib/__tests__/crop-core.test.ts` — units + rectangle math: `parseMmInput` (`"71.7"`, `"71,7"`, `" 94 "`, `""`, `"abc"`, `"0"`, `"-5"`, `"1001"`, `"0.5"`, `"1.234"`, both range ends); `aspectRatio` / `swapOrientation` (twice = identity) / `describeAspect` (portrait, landscape, square) / `matchingPreset` (exact hit + miss); `fitRect` (portrait target on a landscape image and vice versa, the 3:4 identity case covering the whole image, odd-remainder centring); `clampRectToImage` (oversize on each axis, `MIN_CROP_PX` floor, translate-inside on all four edges, **idempotence**); `fillRect` (grows around an off-centre framing, stays inside); `refitRect` (centre + area preserved then clamped); `moveRect` (clamped at all four edges); `resizeRect` (all 8 handles: ratio locked, anchor fixed, growth stops at the bounds, min-size floor, two runs deeply equal); `hitTestHandle` (corner precedence over edge, edge, inside, outside → `null`, tolerance boundary); `handleCursor` (R2–R9, R19)
- [x] Vitest (crop-core) — geometry + readout + crop: `contentBoxOf` (letterbox on each axis, degenerate → `null`); `boxPointToImage` (clamps beyond both axes, and **agrees with `mapClickToPixel`** on in-content points — the anti-fork test); `imageRectToBoxFractions`; `effectivePxPerMm` (both axes agree within R6 rounding, `min` reported), `pxPerMmToDpi`, `resolutionLevel` (both thresholds probed from both sides, incl. exact equality), `pixelsKeptPercent`; `cropPixels` (extracted pixels byte-exact, output size = rect, source unmutated, out-of-bounds rect clamped instead of throwing, a full-image rect is byte-identical — proving **no resampling**) — `lib/crop-core.ts` at **100% branch** after this task (R6, R10, R11, R13, R18, R21)
- [x] Component `components/image-prep/__tests__/CropWorkspace.test.tsx` (RTL, `getBoundingClientRect` mocked per the 11/R21 + 12 pattern) — mm edit re-locks the ratio keeping the centre; invalid mm shows the field error, leaves the rect unchanged and disables Apply; each preset sets its mm values with `aria-pressed`; swap flips orientation and back; Fit / Fill / Reset; interior drag moves and clamps at the edges; corner and edge handle drags resize ratio-locked and refuse to overflow the bounds; a press in the letterbox starts no drag; a drag continued off-image clamps; arrows nudge 1 px and Shift+arrows 10 px while typing in an mm field does not nudge; readout text and both warning tiers (and that Apply stays enabled under them); the 2048-cap note; hints strip; `Esc` cancels; a handle drag with a mocked zoomed/panned rect still resolves to the right pixels (R2–R12, R14, R17–R20)
- [x] Component `components/image-prep/__tests__/ImagePrep.test.tsx` (extend) — Start crop offered from loaded / adjusted / quantized / flatten stages and disabled while busy; entering hides the palette panel, disables Adjust/Posterize/Start-flatten, and the dropzone still loads a file (discarding the crop stage); **Apply crop** makes the Original pane the cropped image at the rect's exact size and discards palette + flatten (fresh loaded stage, palette Undo gone); **Cancel** restores the quantized stage with its palette-undo depth intact, and the flatten stage with its working image, history, and counter intact; **Revert to uncropped** restores the upload and then disappears; Download after Apply exports the cropped pixels with no network request; **no worker request is posted** by any crop interaction or by Apply (assert the fake worker's call count is unchanged) (R1, R13, R14, R15, R16, R21, R22)
- [x] E2E `e2e/crop.spec.ts` (Playwright, **credential-gated** exactly like `e2e/image-prep.spec.ts` — `test.skip` when `E2E_EMPLOYEE_EMAIL` / `E2E_EMPLOYEE_PASSWORD` are absent; reuses `e2e/fixtures/image-prep-sample.png`): signed in → upload → **Start crop** → readout shows the default 71.7 × 94 mm crop in px + px/mm → `100 × 100` preset makes it square → **Swap orientation** → back to `71.7 × 94` → drag a corner handle → **Fit** → **Apply crop** → the crop card reports the cropped size and the palette/flatten controls are back in their fresh state → **Revert to uncropped** restores the full size → Download suggests `image-prep-sample-prepped.png`. **Written, not executed** (repo convention: E2E suites skip without `.env.local` credentials) (R1, R4, R5, R8, R9, R10, R13, R15)

## 7. Close-out

- [x] Confirm the no-persistence contract: `prisma/schema.prisma` + `prisma/migrations/` untouched, no `actions/` file, no `app/api/` route, no Storage code, no `.env.example` entry, no `package.json` dependency, no config/coverage-threshold change; `lib/image-prep-core.ts`, `lib/flatten-core.ts`, `components/image-prep/worker-messages.ts`, `image-prep.worker.ts`, and `useImagePrepWorker.ts` diffs are **empty**; presets exist only as constants in `lib/crop-core.ts` (R21, R22)
- [x] Full suite: `pnpm typecheck`, `pnpm lint`, `pnpm test` (with coverage) green — `lib/crop-core.ts` at **100% branch**, ≥ 80% lines on every other changed module; `FlattenWorkspace.test.tsx` passing **unmodified** after the `use-canvas-view` extraction

## Verification

- Start crop enters from any loaded stage with the default 71.7 × 94 mm Fit
  rectangle; Cancel restores the prior stage exactly (R1, R14, R16).
- mm inputs (decimals), presets, and swap all re-lock the rectangle to the new
  ratio; invalid input is inert and blocks Apply (R2–R5).
- The rectangle is always ratio-locked, in-bounds, integer, and above the
  minimum size under drag, handle resize, Fit/Fill/Reset, and arrow nudges
  (R6–R9, R19).
- The readout reports crop px, mm, px/mm and DPI, warns below 5 and 2.5 px/mm,
  and states the 2048 px working cap (R10–R12).
- Apply crops the pipeline source and discards every downstream result exactly
  like Apply-adjustments; Revert returns the full upload (R13, R15).
- Zoom/pan/Expand and the pointer geometry behave under `object-contain` +
  transform; the hints strip is visible (R17, R18, R20).
- No worker op, no protocol change, nothing persisted (R21, R22).

## Coverage target

- **`lib/crop-core.ts`: 100% branch coverage** (pure-core standard, matching
  `image-prep-core` / `flatten-core` / `pricing-core`).
- ≥ 80% lines on every other changed module (`ImagePrep`, `CropWorkspace`,
  `CropCanvas`, `CropSizePanel`, `CropStartCard`, `use-canvas-view`,
  `FlattenCanvas` after the extraction).
- **Traceability:** R1 → island stage-integration test + E2E; R2 → core
  `parseMmInput`/`refitRect` + workspace mm test + E2E readout; R3 → core
  invalid-input cases + workspace error/Apply-disabled test; R4 → core
  `matchingPreset` + workspace preset test + E2E; R5 → core `swapOrientation` +
  workspace swap test + E2E; R6 → core `clampRectToImage` idempotence +
  every rect-op test + workspace invariant assertions; R7 → core `moveRect` +
  workspace interior-drag test; R8 → core `resizeRect` (8 handles) + workspace
  handle-drag test + E2E; R9 → core `fitRect`/`fillRect` + workspace
  Fit/Fill/Reset test + E2E; R10 → core `effectivePxPerMm`/`pxPerMmToDpi`/
  `pixelsKeptPercent` + workspace readout test + E2E; R11 → core
  `resolutionLevel` + workspace warning-tier test; R12 → workspace cap-note
  test; R13 → core `cropPixels` + island Apply test + E2E; R14 → island Cancel
  test + workspace Esc test; R15 → island Revert test + E2E; R16 → island
  modality test; R17 → the reused flatten view-math tests + unmodified
  `FlattenWorkspace.test.tsx` + workspace zoomed-drag test; R18 → core
  `contentBoxOf`/`boxPointToImage` (incl. the `mapClickToPixel` agreement test)
  + workspace letterbox/off-image tests; R19 → workspace nudge tests; R20 →
  hints-strip test; R21 → core `cropPixels` + the island "no worker request"
  assertion; R22 → the no-persistence close-out check. Every R1–R22 traces to
  at least one test task.
