# Tasks — 12_flatten

> Each task cites the requirement(s) it satisfies. Mark `[x]` as completed.
> Read `design.md` first. **This feature touches NO schema and adds NO
> migration, Server Action, route handler, Storage bucket/policy, env var, or
> dependency** (R28) — if a task seems to need one, stop and re-read the spec.
> `lib/image-prep-core.ts` and its tests are NOT modified; feature 12 only
> imports from it. No config change is authorized (the worker entry's existing
> vitest coverage exclusion already covers the extended dispatcher).
>
> **Phased delivery:** Phases A → B → C are strictly ordered; each phase ends
> with green `typecheck` / `lint` / `test` and is independently shippable, so
> the human can approve delivering them incrementally. One spec, one feature.

## Phase A — flood/brush select + flatten + undo (R1–R5, R7, R8, R10–R16, R20–R22, R25–R28)

### A. Core math

- [x] Create `lib/flatten-core.ts` — part 1, foundations + masks: the Phase-A exported constants (`DEFAULT_FLOOD_TOLERANCE` 24, `MIN/MAX_TOLERANCE` 0/150, `TOLERANCE_STEP` 4, `DEFAULT_BRUSH_RADIUS` 8, `MIN/MAX_BRUSH_RADIUS` 1/100, `BRUSH_RADIUS_STEP` 2, `MAX_RUNNER_UPS` 6, `MAX_FLATTEN_HISTORY` 12, overlay color/alpha constants), the types (`Mask`, `MaskMode`, `ColorCount`), and the mask builders/set ops: `floodMask` (4-connected FIFO BFS, seed clamped, `colorDistance(pixel, seed) ≤ tolerance`, deterministic neighbor order), `brushMask` (`dx²+dy² ≤ r²`, clipped, radius clamped), `maskPixelCount`, `maskContains` (out-of-bounds → false), `subtractMask`, `unionMasks` (`[]` → empty mask), `maskOutline` (image edge counts as outside). Pure — imports only `Rgb`/`PixelBuffer`/`colorDistance`/hex helpers from `@/lib/image-prep-core`; no DOM, no React, no `server-only`, no new dependency; header comment justifies the sibling-core decision (R5, R7, R10, R11, R12)
- [x] `lib/flatten-core.ts` — part 2, selection stats + fills + overlay: `maskStats` (exact-color counts over masked pixels, count desc, first-row-major-appearance tie-break), `colorAtPixel` (clamped), `parseHexInput` (trim, optional `#`, 3/6 hex digits case-insensitive, else `null`), `applyFillToMask` (new buffer, input unmutated), `buildFlattenOverlay` (selection tint `SELECTION_FILL_ALPHA` + selection outline + hover outline, hover wins overlaps, `null` when nothing to draw) (R4, R13, R14, R15, R16)

### A. Worker + hook

- [x] Extend `components/image-prep/worker-messages.ts` with the FULL new protocol (shapes for all phases, dispatch lands per phase): `FlattenAction` (`fill` | `recolor` | `removeSmall`), the `mask` and `flatten` request variants, `MaskResult` (`mask` ArrayBuffer + `count`) and `FlattenResult` responses — existing ops untouched (R4, R16, R17, R18, R19, R26)
- [x] Extend `components/image-prep/image-prep.worker.ts` — still a logic-free stateless dispatcher: `mask` with `mode: "flood"` → `floodMask` (+ count), `flatten`/`fill` → `applyFillToMask`; buffers on the transfer list both ways; errors → `{ ok: false, error }`; unimplemented Phase-B/C actions throw a clear error caught by the same path (R4, R5, R16, R26)
- [x] Extend `components/image-prep/useImagePrepWorker.ts` — `request(body, opts?: { background?: boolean })`: background requests skip the `inFlight`/busy accounting; add `RequestFn` overloads for `mask` → `MaskResult` and `flatten` → `FlattenResult`; existing behavior byte-for-byte otherwise (R26)

### A. Island stage integration

- [x] `components/image-prep/ImagePrep.tsx` — refactor the Stage union into named aliases (`EmptyStage`/`LoadedStage`/`AdjustedStage`/`QuantizedStage`, pure rename) and add `FlattenStage` (`resume`, `entry`, `current`, `history: { pixels; regionsFlattened }[]`, `regionsFlattened`) per design.md; `handleEnterFlatten` (snapshot working image, seed history baseline, counter 0, disabled while busy/empty), `handleExitFlatten` (`setStage(stage.resume)` — palette + palette-undo history restored untouched), `handleFlattenMutated(pixels, regionsCollapsed)` (replace `current`, bump counter, push history capped at `MAX_FLATTEN_HISTORY`), `handleFlattenUndo` (pure pop restoring pixels AND counter; `canFlattenUndo = flatten && !busy && history.length > 1`), `handleFlattenReset` (restore `entry`, reseed history, counter 0); working-image derivation gains the `flatten.current` arm; Apply/Posterize/load read sources through `resume` while flattening so upstream ops structurally discard the stage; PalettePanel hidden and Histogram read from `resume` during flatten (R1, R2, R3, R16, R20, R21, R22, R27)
- [x] Create `components/image-prep/FlattenStartCard.tsx` (`"use client"`) — left-column card: **Start flatten** (disabled with no image / while busy) when inactive; active notice + **Exit flatten** with discard-warning copy when active; wire into `ImagePrep` (R1, R3)

### A. Canvas + panels

- [x] Extract the jsdom-guarded `paint(canvas, pixels)` helper from `components/image-prep/BeforeAfterPreview.tsx` into `components/image-prep/canvas-paint.ts` (null-ref + missing-2D-context guards intact); `BeforeAfterPreview` imports it — zero behavior change (R4)
- [x] Create `components/image-prep/FlattenCanvas.tsx` (`"use client"`) — viewport div + transform wrapper (static identity view in Phase A) holding the base canvas (painted from `current` via `paint`) and the overlay canvas (`buildFlattenOverlay`, `pointer-events-none`, `aria-hidden`); pointer move/leave/click handlers resolve pixels by reusing `mapClickToPixel` (imported from `BeforeAfterPreview`) against `getBoundingClientRect()` — letterbox positions rejected; crosshair cursor while pick mode; the keyboard-hints strip (Click add region · Click selected = remove · W/S resize · Enter flatten · Esc clear · Scroll zoom · Z undo); **Download PNG** button (offscreen canvas → `toBlob` → `<a download>` of `downloadFileName(fileName)`, no network) (R4, R24, R25, R27)
- [x] Create `components/image-prep/FlattenWorkspace.tsx` (`"use client"`) — owns transient flatten UI state (mode flood/brush, tolerance + radius, selection `{ id, mask }[]` disjoint by construction, hover mask + token, chosen fill + hex draft, pick mode, view, expand); the hover pipeline per design.md (background `mask` requests, one in flight, stale token/buffer-version responses dropped; brush masks built synchronously via `brushMask`); click → add hovered mask minus selection as a new region with "N px selected" from `maskPixelCount(union)`, click-on-selected → remove containing region, Esc/Clear → empty; `[current]` effect clears selection + hover; derived memoized stats → suggested + runner-ups; mutations posted via the island's `request` and reported up through `onMutated` (R4, R5, R7, R10, R11, R12, R13, R16, R26)
- [x] Create `components/image-prep/FlattenControls.tsx` (`"use client"`) — mode radio group (Flood/Brush in Phase A), tolerance-or-radius readout with "W grow · S shrink" caption, **Undo** (disabled per `canUndo`), **Reset all**, the "N regions flattened" counter; every mutation control disabled while busy (R8, R20, R21, R22, R26)
- [x] Create `components/image-prep/FlattenFillPanel.tsx` (`"use client"`) — rendered while the selection is non-empty: "N px selected", suggested swatch + hex + "% of selection" (1 dp), runner-up swatch buttons, labelled hex input with inline `role="alert"` error on `parseHexInput` null, **Pick** eyedropper toggle (`aria-pressed`; picks set the fill from `colorAtPixel`, never modify the selection, suppress hover), **Flatten selection**, **Clear**; chosen fill resets to suggested on selection change (R12, R13, R14, R15, R16)
- [x] Wire the flatten keyboard map in `FlattenWorkspace` (window listener mounted only while the stage is active): `W`/`S` step size clamped (hover refreshes; text-input guard), `Enter` → Flatten selection, `Esc` → clear, `Z` (and Ctrl/Cmd+Z) → flatten undo when `canUndo` (text-input guard; the existing palette listener stays untouched and inert during flatten) (R8, R12, R16, R20)

### A. Tests (phase gate: all green before Phase B)

- [x] Vitest `lib/__tests__/flatten-core.test.ts` — masks part 1: `floodMask` includes/excludes at the exact tolerance boundary, is 4-connected (diagonal pixel excluded), clamps out-of-bounds seeds, two runs deeply equal (determinism); `brushMask` radius membership (`dx²+dy² ≤ r²`), edge clipping, radius clamping; `maskPixelCount`, `maskContains` (in/edge/out-of-bounds), `subtractMask`, `unionMasks` (incl. `[]`), `maskOutline` (interior excluded, image-edge pixels included) — 100% branch on the covered functions (R5, R7, R10, R11, R12)
- [x] Vitest (flatten-core) — stats/fills/overlay: `maskStats` count-desc order + first-appearance tie-break + empty-mask → `[]`; `parseHexInput` (3- and 6-digit, `#` optional, case-insensitive, invalid/empty → null); `colorAtPixel` clamping; `applyFillToMask` fills exactly the masked pixels and mutates nothing; `buildFlattenOverlay` hover-only / selection-only / overlap (hover wins) / nothing → null (R4, R13, R14, R15, R16)
- [x] Component `components/image-prep/__tests__/ImagePrep.test.tsx` (extend; fake worker extended to `mask`/`flatten` ops backed by `flatten-core`) — stage integration: Start flatten enabled from loaded AND quantized stages, disabled while busy; entering hides the palette panel and shows the workspace with counter 0 + Undo disabled; Exit restores the exact prior stage including the palette-undo depth; Apply / Posterize / new-file each discard the flatten stage; Download during flatten still names `<base>-prepped.png` with no fetch (R1, R2, R3, R22, R27)
- [x] Component `components/image-prep/__tests__/FlattenWorkspace.test.tsx` (mocked `getBoundingClientRect`, R21-suite pattern) — interactions: hover shows the outline overlay and clears over the letterbox; click adds a region and "N px selected" updates; clicking a selected pixel removes that region; Esc and Clear empty the selection; W/S step the readout (clamped at both ends) and refresh the hover mask; fill panel shows suggested hex + % and runner-ups, alternate click / valid hex / pick each set the fill, invalid hex shows the alert and changes nothing, pick clicks never alter the selection; Flatten selection (button AND Enter) sends `fill`, bumps the counter by the region count, clears the selection; Z walks undo back to baseline restoring pixels AND counter then disables, `z` typed in the hex input is ignored, Undo disabled while busy; Reset all restores entry + counter 0 after > cap operations; hover requests never flip the global busy state; hints strip visible (R4, R5, R7, R8, R10–R16, R20, R21, R22, R25, R26)
- [x] Phase A gate: `pnpm typecheck`, `pnpm lint`, `pnpm test` green; `lib/flatten-core.ts` at 100% branch on all Phase-A code (R28 spot-check: no schema/action/route/storage/env/dependency diff)

## Phase B — smooth mode, catch strays, recolor every match (R6, R9, R17)

- [x] `lib/flatten-core.ts` — part 3: `DEFAULT_SMOOTH_TOLERANCE` 10, `STRAY_MAX_ISLAND_PX` 16, `STRAY_MARGIN_PX` 8; `smoothMask` (4-connected BFS, neighbor-step `colorDistance ≤ tolerance`, deterministic), `addStrayIslands` (row-major component discovery; only components disjoint from the mask, area ≤ cap, fully inside the dilated-and-clipped bbox), `recolorExact` (exact-equality image-wide swap, new buffer) (R6, R9, R17)
- [x] Worker + workspace dispatch: `mask` handles `mode: "smooth"` and `catchStrays: true` (builder + `addStrayIslands`); `flatten` handles `recolor`; `FlattenControls` gains the Smooth mode option (own tolerance state) and the "Catch stray pixels" checkbox (flood/smooth only); `FlattenFillPanel` gains **Recolor every match** (enabled only when chosen fill ≠ suggested), which sends `recolor(from: suggested, to: chosen)`, clears the selection, pushes undo, leaves the counter unchanged (R6, R9, R17, R26)
- [x] Vitest (flatten-core) — Phase B: `smoothMask` chains a gradient that `floodMask` at the same tolerance rejects, respects the step boundary, stays deterministic; `addStrayIslands` adds a qualifying island, rejects one over the size cap, rejects one outside the margin bbox, no-ops with none present, leaves the input mask unmutated; `recolorExact` swaps only exact matches (near-miss untouched) and mutates nothing — 100% branch maintained (R6, R9, R17)
- [x] Component (extend `FlattenWorkspace.test.tsx`) — Smooth mode selectable with its own W/S-stepped tolerance; catch-strays checkbox appears for flood/smooth, not brush, and its value rides the mask request; Recolor every match disabled while fill = suggested, enabled after choosing an alternate, recolors a matching pixel OUTSIDE the selection, clears the selection, is undoable, leaves the counter unchanged. Phase B gate: typecheck/lint/test green (R6, R9, R17, R20)

## Phase C — presets, despeckle, zoom/pan/expand (R18, R19, R23, R24)

- [x] `lib/flatten-core.ts` — part 4: `DESPECKLE_MAX_REGION_PX` 2, `PRESET_MAX_REGION_PX` { low: 8, medium: 32, high: 128 }; `removeSmallRegions` (4-connected exact-color labeling on the input; components ≤ threshold recolored in an output copy to the most common input-sampled border color, first-appearance tie-break, ascending area then ascending first-pixel order; larger components untouched) (R18, R19)
- [x] `lib/flatten-core.ts` — part 5, view math: `MIN_ZOOM` 1, `MAX_ZOOM` 16, `ZOOM_FACTOR` 1.25, `IDENTITY_VIEW`, `ViewTransform`; `zoomAt` (clamped, focal point under the cursor invariant), `panBy`, `clampView` (content always overlaps the viewport; zoom 1 forces origin) (R23)
- [x] Worker + UI dispatch: `flatten` handles `removeSmall`; `FlattenControls` gains **Low / Medium / High** and **Despeckle** buttons (disabled while busy) sending `removeSmall` with the exported thresholds — each replaces the working image, pushes undo, clears the selection, leaves the counter unchanged (R18, R19, R26)
- [x] `FlattenCanvas` navigation: non-passive `wheel` listener → `zoomAt` toward the cursor (`preventDefault`, no page scroll); middle-button drag and Space+left drag → `panBy` (Space guarded against text inputs, `preventDefault`); the transform wrapper renders the view; **Expand** toggle enlarges the viewport; view resets to `IDENTITY_VIEW` on stage entry; hover/click/pick geometry verified correct while zoomed + panned (the transformed `getBoundingClientRect` + `mapClickToPixel` reuse) (R23, R24)
- [x] Vitest (flatten-core) — Phase C: `removeSmallRegions` absorbs a 1-px speck into its dominant border color, honors the exact threshold boundary (area = threshold absorbed, area = threshold+1 kept), applies the deterministic tie-break and ascending-area order, samples border colors from the INPUT buffer, mutates nothing; view math — zoom clamps at both ends, focal-point invariance under zoom-in/out, `panBy` + `clampView` bounds, zoom 1 → origin — 100% branch maintained (R18, R19, R23)
- [x] Component (extend) — preset buttons send `removeSmall` with 8/32/128 and Despeckle with 2, each undoable with selection cleared and counter unchanged; wheel zoom updates the transform within limits, space-drag and middle-drag pan, Expand toggles the enlarged viewport, and a click while zoomed/panned still resolves to the correct pixel (mocked transformed rect). Phase C gate: typecheck/lint/test green (R18, R19, R20, R23, R24)

## Feature close-out

- [x] E2E `e2e/flatten.spec.ts` (Playwright, credential-gated like `e2e/image-prep.spec.ts`, skipping when creds absent; reuses `e2e/fixtures/image-prep-sample.png`) — signed in: upload → Posterize 8 → **Start flatten** (palette panel gone, counter "0 regions flattened") → hover a color block and click → "px selected" appears with the fill panel → **Flatten selection** → counter shows 1 → press `z` → counter back to 0 → **Despeckle** completes with busy state → **Exit flatten** restores the palette panel → Download suggests `image-prep-sample-prepped.png`. Exercises the REAL worker `mask`/`flatten` ops and canvas geometry (R1, R2, R3, R4, R10, R16, R19, R20, R22, R26, R27)
- [x] Confirm the no-persistence contract: `prisma/schema.prisma` + `prisma/migrations/` untouched, no `actions/` file, no `app/api/` route, no Storage code, no `.env.example` entry, no `package.json` dependency, no config change beyond nothing (the worker exclusion pre-exists); `lib/image-prep-core.ts` diff is empty (R28)
- [x] Full suite: `pnpm typecheck`, `pnpm lint`, `pnpm test` (with coverage) green — `lib/flatten-core.ts` at **100% branch**, ≥ 80% lines on every other changed module

## Verification

- Start/Exit flatten round-trips the pipeline exactly; upstream ops discard
  flatten work (R1–R3).
- Hover masks (flood/smooth/brush) preview correctly, resize with W/S, and
  optionally catch strays (R4–R9).
- Click add / click remove / Esc-Clear selection with a live px count
  (R10–R12).
- Suggested + runner-ups + hex + eyedropper choose the fill; Flatten
  selection and Recolor every match apply via the worker (R13–R17).
- Presets and Despeckle clean the whole image deterministically (R18, R19).
- Z-undo, Reset all, and the counter behave per the bounded, flatten-scoped
  history; the palette undo history survives inside the resume snapshot
  (R20–R22).
- Zoom/pan/Expand navigate the canvas with exact click geometry; hints strip
  visible (R23–R25).
- Heavy work stays in the worker with honest busy states; hover never
  flickers busy (R26). Download exports the flatten image (R27). Nothing is
  persisted (R28).

## Coverage target

- **`lib/flatten-core.ts`: 100% branch coverage** (pure-core standard,
  matching `image-prep-core`/`pricing-core`).
- ≥ 80% lines on the other changed modules (island, workspace, canvas,
  panels, start card, hook, `worker-messages`, `canvas-paint`); the worker
  entry keeps its pre-existing exclusion.
- **Traceability:** R1 → stage-integration component test + E2E; R2 →
  stage-integration (upstream discard) + E2E (palette hidden); R3 →
  exit-restores test + E2E; R4 → core overlay tests + workspace hover tests +
  E2E; R5 → core `floodMask` + workspace click tests; R6 → core `smoothMask`
  + Phase-B component; R7 → core `brushMask` + workspace tests; R8 → W/S
  component tests; R9 → core `addStrayIslands` + Phase-B component; R10 →
  core mask set ops + click-add tests + E2E; R11 → click-remove test; R12 →
  Esc/Clear/auto-clear tests; R13 → core `maskStats` + fill-panel tests; R14
  → core `parseHexInput` + hex-input tests; R15 → core `colorAtPixel` + pick
  tests; R16 → core `applyFillToMask` + flatten-selection tests + E2E; R17 →
  core `recolorExact` + Phase-B component; R18 → core `removeSmallRegions` +
  preset component tests; R19 → same core + Despeckle component + E2E; R20 →
  undo component suite + E2E (`z` revert); R21 → Reset-all tests; R22 →
  counter assertions across R16/R20/R21 tests + E2E; R23 → core view math +
  Phase-C navigation tests; R24 → geometry-under-zoom test (+ Phase-A
  letterbox rejection via `mapClickToPixel` reuse); R25 → hints-strip test;
  R26 → busy-state + background-request tests + E2E; R27 → download tests +
  E2E filename; R28 → the no-persistence close-out check. Every R1–R28
  traces to at least one test task.
