# Design — 12_flatten

**Source:** product-owner decision (2026-07-19, reference-tool screenshots)
**Depends on:** 11_image_prep — this feature EXTENDS the `/image-prep` page
and reuses its architecture wholesale: pure core in `lib/`, typed worker
actions, the Stage union in the client island, the R20 undo pattern, and the
R21 click geometry (`mapClickToPixel`).

## Approach

No new route, no server change. The flatten stage is a fifth member of the
island's Stage union plus a dedicated interactive workspace that replaces
`BeforeAfterPreview` while active. All new math is pure and lives in a new
sibling core, `lib/flatten-core.ts`; all heavy operations become new typed
actions on the **existing** Web Worker.

```
app/(app)/image-prep/page.tsx                    UNCHANGED (auth + Color catalog read)
  └─ components/image-prep/ImagePrep.tsx             Island — Stage union gains "flatten"; enter/exit/undo/reset handlers
       ├─ …existing panels (Dropzone/Adjust/Histogram/Posterize/Palette)…   Palette hidden during flatten
       ├─ components/image-prep/FlattenStartCard.tsx    Client — Start flatten / active-status + Exit
       ├─ components/image-prep/FlattenWorkspace.tsx    Client — flatten UI state (mode, sizes, selection, hover, fill, view)
       │    ├─ components/image-prep/FlattenCanvas.tsx      Client — canvas + overlay, zoom/pan/expand, hints strip, Download
       │    ├─ components/image-prep/FlattenControls.tsx    Client — mode, size readout, catch strays, presets, Despeckle, Undo, Reset, counter
       │    └─ components/image-prep/FlattenFillPanel.tsx   Client — suggested + runner-ups, hex input, Pick, Flatten selection, Clear, Recolor
       ├─ components/image-prep/canvas-paint.ts         Extracted jsdom-guarded paint() (shared with BeforeAfterPreview)
       ├─ components/image-prep/image-prep.worker.ts    + "mask" and "flatten" dispatch (still logic-free)
       ├─ components/image-prep/worker-messages.ts      + mask/flatten request & response types
       └─ components/image-prep/useImagePrepWorker.ts   + background-request option (hover masks skip busy)
lib/flatten-core.ts                              NEW pure core — all flatten math (no DOM/Prisma/React/server-only)
lib/image-prep-core.ts                           UNCHANGED (flatten-core imports its Rgb/PixelBuffer/colorDistance/hex helpers)
```

### No persistence — explicit statement (R28)

Identical contract to feature 11: **no** Prisma model/field/migration, RLS
change, Server Action, route handler, Zod schema (no server boundary exists),
Storage access, `localStorage`/cookie/URL state, env var, or npm dependency.
Flood fill, component labeling, and despeckle are small deterministic
algorithms — hand-rolled in the pure core, like the quantizer was.

## Why a sibling core (`lib/flatten-core.ts`), not more `image-prep-core.ts`

- `lib/image-prep-core.ts` is already ~940 lines at 100% branch coverage and
  covers a closed domain (adjust → quantize → palette). Flatten introduces a
  second, distinct domain — binary masks, region growing, connected-component
  labeling, view transforms — with its own constant set. A sibling file keeps
  both reviewable and keeps each file's 100%-branch target honest.
- The dependency direction is clean and one-way: `flatten-core` **imports**
  `Rgb`, `PixelBuffer`, `colorDistance`, `hexToRgb`, `rgbToHex` from
  `image-prep-core` (lib → lib), and never the reverse. Nothing in feature
  11's core changes, so its tests and coverage are untouched.
- Same rules as its sibling: no DOM types beyond typed arrays, no
  `server-only`, no React, all functions pure (new buffers out, inputs never
  mutated), determinism is a contract (no randomness, defined tie-breaks).

## Stage integration (R1–R3) and the two undo histories

The Stage union is refactored into named aliases (`EmptyStage`,
`LoadedStage`, `AdjustedStage`, `QuantizedStage` — pure renames, zero
behavior change) so the flatten stage can carry the previous stage verbatim:

```ts
type FlattenResume = LoadedStage | AdjustedStage | QuantizedStage;

type FlattenHistoryEntry = { pixels: PixelBuffer; regionsFlattened: number };

type FlattenStage = {
  kind: "flatten";
  resume: FlattenResume;          // the EXACT pre-flatten stage object (references, cheap)
  entry: PixelBuffer;             // working image at entry — the Reset-all target
  current: PixelBuffer;           // the flatten working image
  history: FlattenHistoryEntry[]; // last entry mirrors current; seeded [{ entry, 0 }]
  regionsFlattened: number;
};

type Stage = EmptyStage | LoadedStage | AdjustedStage | QuantizedStage | FlattenStage;
```

- **Enter (R1):** `Start flatten` snapshots the current working image
  (`quantized.preview` ?? `adjusted` ?? `original`) into `entry`/`current`,
  stores the whole previous stage in `resume`, seeds `history` with the
  single baseline, counter 0. Disabled while `busy` or stage `empty`.
- **Exit (R3):** `setStage(stage.resume)` — a pure restore. Because `resume`
  holds the quantized stage *object*, the palette **and its R20 palette-undo
  history** come back untouched. Copy on the button warns that flatten edits
  are discarded.
- **Upstream invalidation (R2):** `handleApply` reads
  `original`/file-fields and `handlePosterize` reads `adjusted ?? original`
  **through `resume`** when the stage is `flatten`; both build a fresh
  `adjusted`/`quantized` stage exactly as today — the flatten stage (and its
  `resume`) is structurally discarded. Loading a file builds a fresh
  `loaded` stage. Stale flatten state is unrepresentable, mirroring 11/R16.
- **Working image derivation** gains one arm:
  `flatten.current` ?? `quantized.preview` ?? `adjusted` ?? `original` — so
  Download (R27) needs no special casing.
- **Two undo histories, strictly scoped (R20):** the palette history lives
  inside the quantized stage (unchanged, dormant inside `resume`); the
  flatten history lives inside the flatten stage. They can never interact:
  while flattening the stage is not `quantized`, so the existing palette
  Ctrl/Cmd+Z listener's `canUndo` is false; the new flatten key handler is
  mounted only while the stage is `flatten`. Undo restores `{ pixels,
  regionsFlattened }` together so the counter can never lie (R22).
- **History memory:** full snapshots, capped at `MAX_FLATTEN_HISTORY = 12`.
  Worst case 12 × 16.8 MB (2048² RGBA) ≈ 200 MB transient client memory —
  the same order feature 11 accepted for `MAX_PALETTE_HISTORY = 20`.
  Per-operation diff patches were considered and rejected: recolor, presets,
  and despeckle touch unbounded pixel sets anyway, and snapshots keep Undo a
  trivially correct pure pop (the R20 precedent). `entry` is held outside the
  capped stack, so Reset-all survives cap trimming (R21).

## `lib/flatten-core.ts` — the pure core

```ts
import { colorDistance, hexToRgb, rgbToHex, type Rgb, type PixelBuffer } from "@/lib/image-prep-core";

// ---- types -------------------------------------------------------------
/** Binary mask over an image; data[y*width + x] is 0 | 1. */
export type Mask = { width: number; height: number; data: Uint8Array };
export type MaskMode = "flood" | "smooth" | "brush";
export type ColorCount = { color: Rgb; count: number };
/** Flatten-canvas view: css-transform zoom + pan in canvas-box pixels. */
export type ViewTransform = { zoom: number; panX: number; panY: number };

// ---- constants (exported so tests + UI pin the same values) ------------
export const DEFAULT_FLOOD_TOLERANCE = 24;      // R5 (redmean units, same scale as merge-similar)
export const DEFAULT_SMOOTH_TOLERANCE = 10;     // R6 (per-step, so smaller default)
export const MIN_TOLERANCE = 0, MAX_TOLERANCE = 150, TOLERANCE_STEP = 4;      // R8
export const DEFAULT_BRUSH_RADIUS = 8, MIN_BRUSH_RADIUS = 1, MAX_BRUSH_RADIUS = 100, BRUSH_RADIUS_STEP = 2; // R7, R8
export const STRAY_MAX_ISLAND_PX = 16, STRAY_MARGIN_PX = 8;                   // R9
export const MAX_RUNNER_UPS = 6;                                              // R13
export const DESPECKLE_MAX_REGION_PX = 2;                                     // R19
export const PRESET_MAX_REGION_PX = { low: 8, medium: 32, high: 128 } as const; // R18
export const MAX_FLATTEN_HISTORY = 12;                                        // R20
export const MIN_ZOOM = 1, MAX_ZOOM = 16, ZOOM_FACTOR = 1.25;                 // R23
export const HOVER_OUTLINE_RGBA  = [255, 255, 255, 230] as const;             // R4 (white)
export const SELECTION_OUTLINE_RGBA = [59, 130, 246, 255] as const;           // R10 (blue-500)
export const SELECTION_FILL_ALPHA = 56;                                       // faint tint over selected px

// ---- mask builders (R5–R7, R9) -----------------------------------------
export function floodMask(src: PixelBuffer, seedX: number, seedY: number, tolerance: number): Mask;
//   4-connected BFS from the clamped seed; include pixel iff colorDistance(pixel, seedColor) ≤ tolerance.
export function smoothMask(src: PixelBuffer, seedX: number, seedY: number, tolerance: number): Mask;
//   4-connected BFS; include neighbor iff colorDistance(neighbor, currentPixel) ≤ tolerance (local chaining).
export function brushMask(width: number, height: number, cx: number, cy: number, radius: number): Mask;
//   dx² + dy² ≤ r², clipped to bounds; radius clamped to [MIN, MAX].
export function addStrayIslands(src: PixelBuffer, mask: Mask, seedColor: Rgb, tolerance: number): Mask;
//   NEW mask = mask ∪ every 4-connected component of tolerance-matching pixels (vs seedColor) that is
//   disjoint from mask, has area ≤ STRAY_MAX_ISLAND_PX, and lies fully inside mask's bbox expanded by
//   STRAY_MARGIN_PX (clipped to the image). Deterministic row-major component discovery.

// ---- mask set ops (R10–R12) --------------------------------------------
export function maskPixelCount(mask: Mask): number;
export function maskContains(mask: Mask, x: number, y: number): boolean;   // false when out of bounds
export function subtractMask(a: Mask, b: Mask): Mask;                      // a ∧ ¬b, new mask
export function unionMasks(masks: Mask[], width: number, height: number): Mask; // [] → empty mask
export function maskOutline(mask: Mask): Mask;   // pixels in mask with ≥ 1 four-neighbor outside (image edge counts as outside)

// ---- selection statistics + fills (R13–R17) -----------------------------
export function maskStats(src: PixelBuffer, mask: Mask): ColorCount[];
//   Exact-color counts over masked pixels, sorted count desc; ties broken by first row-major appearance.
export function colorAtPixel(src: PixelBuffer, x: number, y: number): Rgb;  // clamped, like paletteIndexAt (R15)
export function parseHexInput(input: string): Rgb | null;                   // trims, optional '#', 3/6 digits, else null (R14)
export function applyFillToMask(src: PixelBuffer, mask: Mask, fill: Rgb): PixelBuffer;   // new buffer (R16)
export function recolorExact(src: PixelBuffer, from: Rgb, to: Rgb): PixelBuffer;         // exact-equality swap, new buffer (R17)

// ---- whole-image cleanup (R18, R19) -------------------------------------
export function removeSmallRegions(src: PixelBuffer, maxRegionPx: number): PixelBuffer;
//   Label 4-connected EXACT-color components on the input. Every component with area ≤ maxRegionPx is
//   recolored (in an output copy) to the most common color among its border pixels sampled from the
//   INPUT buffer — ties broken by first row-major border appearance. Components processed in ascending
//   area, then ascending first-pixel index. Components larger than the threshold are untouched.
//   Despeckle = removeSmallRegions(src, DESPECKLE_MAX_REGION_PX); presets use PRESET_MAX_REGION_PX.

// ---- canvas overlay (R4, R10) -------------------------------------------
export function buildFlattenOverlay(args: {
  width: number; height: number;
  hover: Mask | null;            // hover outline drawn from maskOutline(hover)
  selection: Mask | null;        // union mask: outline + SELECTION_FILL_ALPHA tint over its interior
}): Uint8ClampedArray | null;    // RGBA w·h·4; null when there is nothing to draw
//   Paint order: selection tint, selection outline, hover outline (hover wins where they overlap).

// ---- view math (R23) -----------------------------------------------------
export function zoomAt(view: ViewTransform, direction: 1 | -1, focalX: number, focalY: number,
                       boxW: number, boxH: number, contentW: number, contentH: number): ViewTransform;
//   Multiply/divide zoom by ZOOM_FACTOR, clamp to [MIN_ZOOM, MAX_ZOOM], adjust pan so the content
//   point under (focalX, focalY) stays put, then clamp the pan.
export function panBy(view: ViewTransform, dx: number, dy: number,
                      boxW: number, boxH: number, contentW: number, contentH: number): ViewTransform;
export function clampView(view: ViewTransform, boxW: number, boxH: number,
                          contentW: number, contentH: number): ViewTransform;
//   Pan clamped so the scaled content never exposes a margin: 0 ≥ pan ≥ min(0, box − content · zoom),
//   with the bounds taken from the CONTENT's untransformed layout size, NOT the viewport. An axis
//   whose scaled content FITS the box is pinned to 0; an axis whose content OVERFLOWS stays pannable,
//   including at zoom 1 (a tall image's clipped bottom must be reachable).
//   [Corrected 2026-07-20 — see "Bug fixes" in progress/impl_12_flatten.md. The original design said
//   "at zoom 1 pan is forced to (0, 0)", which assumed the content always exactly fills the box; it
//   does not, and that assumption made the bottom of a tall image permanently unreachable.]
export const IDENTITY_VIEW: ViewTransform; // { zoom: 1, panX: 0, panY: 0 }
```

Notes:

- **Determinism everywhere:** BFS uses a fixed neighbor order (left, right,
  up, down), queues are FIFO, component labeling scans row-major, every sort
  has a documented tie-break. Same inputs → identical masks/buffers, so core
  tests are exact.
- **Tolerance units** are the redmean `colorDistance` values already used by
  merge-similar (slider 0–150), so users get one consistent "similarity"
  scale across the tool.
- Color-count maps key on `(r << 16) | (g << 8) | b` internally; `maskStats`
  on a full-image selection is a single O(pixels) pass — fine on the main
  thread (it runs per selection *change*, not per mousemove).

## Worker protocol extensions (R4, R16–R19, R26)

`worker-messages.ts` gains two request variants and their responses; existing
ops are untouched (feature 11's protocol is only *extended*):

```ts
export type FlattenAction =
  | { kind: "fill"; mask: ArrayBuffer; fill: Rgb }            // R16 — mask is a transferred Uint8Array buffer
  | { kind: "recolor"; from: Rgb; to: Rgb }                   // R17
  | { kind: "removeSmall"; maxRegionPx: number };             // R18, R19

export type WorkerRequestBody = /* existing ops */
  | { op: "mask"; buffer: ArrayBuffer; width: number; height: number;
      seedX: number; seedY: number; mode: "flood" | "smooth";
      tolerance: number; catchStrays: boolean }               // R4, R5, R6, R9
  | { op: "flatten"; buffer: ArrayBuffer; width: number; height: number; action: FlattenAction };

export type MaskResult = { mask: ArrayBuffer; count: number };            // Uint8Array backing buffer
export type FlattenResult = { pixels: PixelPayload };

export type WorkerResponse = /* existing */
  | { id: number; ok: true; op: "mask"; result: MaskResult }
  | { id: number; ok: true; op: "flatten"; result: FlattenResult };
```

- The worker dispatcher stays **logic-free**: `mask` = flood/smooth builder +
  optional `addStrayIslands`; `flatten` = `applyFillToMask` / `recolorExact` /
  `removeSmallRegions`. Buffers ride the transfer list both ways, as today.
  The file keeps its existing coverage exclusion (browser-only shell,
  exercised by E2E).
- **Brush masks never hit the worker** — `brushMask` is O(radius²) and runs
  synchronously in the workspace.
- Statelessness is preserved (each request carries its pixels). A hover mask
  request therefore copies the current buffer (~5 ms memcpy at 2048²); with
  the one-in-flight coalescing below this is comfortably within budget and
  avoids introducing worker-held state that could drift.

### Hook change — background requests

`useImagePrepWorker`'s `request` gains an options parameter:

```ts
request(body, opts?: { background?: boolean })
```

Background requests (hover masks) skip the `inFlight` busy accounting so the
global "Processing…" indicator and control disabling never flicker during
hover (R26); mutations keep today's behavior exactly. The `RequestFn`
overloads extend to the two new ops. Component tests keep mocking this module
with a synchronous core-backed fake — the real worker stays logic-free, so
parity holds.

### Hover pipeline (R4)

`FlattenWorkspace` owns hover state and coalesces:

- Pointer-move over content → remember the latest `{ x, y }`; if a hover
  request is already in flight, do nothing (the in-flight response will
  re-issue); else post `op: "mask"` (background) tagged with a monotonically
  increasing token **and the current buffer version**.
- On resolve: drop the response if its token is not the newest or the working
  image changed since; otherwise set the hover mask; if the pointer moved
  meanwhile, immediately issue the next request. Mode/tolerance/catch-strays
  changes and W/S presses invalidate + re-issue the same way.
- Pointer leaves content / letterbox / pick mode on / stage busy with a
  mutation → hover mask cleared, pending responses ignored (R12, R15).

## Components (all `"use client"`, presentational state per component)

- **`canvas-paint.ts`** — the existing private `paint(canvas, pixels)` helper
  moves out of `BeforeAfterPreview.tsx` into this tiny shared module
  (ref-null and missing-2D-context guards intact — the jsdom paint-guard
  pattern). `BeforeAfterPreview` imports it; behavior unchanged.
- **`FlattenStartCard.tsx`** — left-column card: **Start flatten** (disabled
  when no image / while busy) or, while active, an active notice + **Exit
  flatten** with the discard warning (R1, R3).
- **`FlattenWorkspace.tsx`** — replaces `BeforeAfterPreview` in the preview
  column while the stage is active. Owns all *transient* flatten UI state:
  mode, flood/smooth tolerances + brush radius, catch-strays flag, the
  selection (`{ id, mask }[]`, disjoint by construction), hover mask, chosen
  fill + hex draft + pick mode, view transform, expand flag. Receives from
  the island: `current`, `entryFileName`, `request`/`busy`,
  `regionsFlattened`, `canUndo`, and callbacks
  (`onMutated(pixels, regionsCollapsed)`, `onUndo`, `onResetAll`, `onExit`).
  Derived (memoized on the selection): `combined = unionMasks(...)`,
  `selectedPx = maskPixelCount(combined)`, `stats = maskStats(current,
  combined)`, suggested = `stats[0]`, runner-ups = `stats.slice(1, 1 +
  MAX_RUNNER_UPS)`. A `[current]` effect clears selection + hover + pending
  hover tokens (R12). Owns the flatten keyboard map (below).
- **`FlattenCanvas.tsx`** — the interactive canvas: a viewport `div`
  (`overflow-hidden`, `relative`; height toggled by Expand, e.g.
  `max-h-[60vh]` → `max-h-[85vh]` full-width) containing a transform wrapper
  (`transform: translate(panX, panY) scale(zoom)`, origin top-left — the only
  dynamic inline style, allowed per conventions) holding the base canvas
  (painted from `current` via `paint`) and an overlay canvas (painted from
  `buildFlattenOverlay`, `pointer-events-none`, `aria-hidden`). Both canvases
  carry the viewport's own height cap plus `object-contain`, so the WHOLE image
  is fitted inside the box at zoom 1 (width-driven sizing alone let a tall image
  overflow the clipped viewport). The base canvas's untransformed layout size
  (`offsetWidth/Height`, re-measured by a `ResizeObserver` and on image/Expand
  change) is what feeds the `clampView` pan bounds. Wheel zoom is
  attached via `ref` + `addEventListener("wheel", …, { passive: false })` so
  `preventDefault` works; middle-button and space+left drags call `panBy`.
  **Click/hover geometry (R24):** `getBoundingClientRect()` of the
  CSS-transformed canvas already reflects zoom and pan, so the existing
  `mapClickToPixel` (imported from `BeforeAfterPreview.tsx`) is reused
  verbatim with that rect — zero new click math; letterbox rejection comes
  for free. Also renders the keyboard-hints strip (R25) and the **Download
  PNG** button (same offscreen-canvas → `toBlob` flow as
  `BeforeAfterPreview`, fed `current` + the original file name) (R27).
- **`FlattenControls.tsx`** — mode radio group (Flood / Smooth / Brush),
  current tolerance-or-radius readout with the "W grow · S shrink" caption
  (R8), catch-strays checkbox (rendered for flood/smooth only, R9), preset
  buttons Low / Medium / High + Despeckle (R18, R19), **Undo** (disabled per
  R20) and **Reset all** (R21), and the "N regions flattened" counter (R22).
  All mutation buttons disabled while `busy`.
- **`FlattenFillPanel.tsx`** — rendered while the selection is non-empty:
  "N px selected", suggested swatch + hex + "% of selection", runner-up
  swatch buttons, a labelled hex `<input>` with inline `role="alert"` error
  on invalid input (`parseHexInput` returns null), the **Pick** eyedropper
  toggle (`aria-pressed`, crosshair on the canvas), **Flatten selection**,
  **Clear**, and **Recolor every match** (disabled unless chosen ≠ suggested)
  (R13–R17).

### Keyboard map (window listener mounted only while the flatten stage is active)

| Key | Action | Guards |
|---|---|---|
| `W` / `S` | grow / shrink active mode's size (R8) | not in text input; clamped |
| `Enter` | Flatten selection (R16) | selection non-empty, not busy, not in text input |
| `Esc` | clear selection (R12) | — |
| `Z` (also Ctrl/Cmd+Z) | flatten undo (R20) | `canUndo`, not in text input |
| `Space` (held) | left-drag pans (R23) | not in text input; `preventDefault` to stop page scroll |

Text-input guard: `event.target` is an `HTMLInputElement` /
`HTMLTextAreaElement` / `HTMLSelectElement`. The existing palette Ctrl/Cmd+Z
listener stays as-is — its `canUndo` requires the quantized stage, so it is
inert during flatten (no double handling).

### Island wiring (`ImagePrep.tsx`)

- Stage union refactor + `FlattenStage` (see above). New handlers, all pure
  state except the worker calls which live in the workspace:
  `handleEnterFlatten`, `handleExitFlatten`, `handleFlattenMutated(pixels,
  regionsCollapsed)` (replace `current`, `regionsFlattened +=
  regionsCollapsed`, push `{ pixels, regionsFlattened }` capped at
  `MAX_FLATTEN_HISTORY`), `handleFlattenUndo` (pure pop restoring pixels +
  counter; `canFlattenUndo = flatten && !busy && history.length > 1`),
  `handleFlattenReset` (restore `entry`, reseed history, counter 0).
- Mutations themselves (`fill` / `recolor` / `removeSmall`) are posted by the
  workspace through the island's single `request` (passed down as a prop —
  one worker instance total) and reported up via `onMutated`; masks are
  requested by the workspace directly (background).
- While `stage.kind === "flatten"`: PalettePanel not rendered; Histogram
  rendered from `resume` when available; Adjust/Posterize handlers read their
  sources through `resume` (R2); the preview column renders
  `FlattenWorkspace` instead of `BeforeAfterPreview`.

## Auth & security

Unchanged from feature 11: the `(app)` layout guard + the page's
`requireUser()` before the single `Color` catalog read. This feature adds no
mutation, no new server surface, and no new data exposure — the image still
never leaves the browser (R27, R28).

## Test approach

- **Vitest — `lib/flatten-core.ts` at 100% branch coverage**, tiny synthetic
  buffers (2×2 … 8×8): flood inclusion/exclusion at the tolerance boundary,
  4-connectivity (diagonals excluded), seed clamping, determinism (two runs
  deeply equal); smooth chains a gradient a plain flood rejects; brush
  radius/clipping/clamping; `addStrayIslands` size cap, margin cap,
  disjointness, no-op cases; mask ops (count, contains incl. out-of-bounds,
  subtract, union incl. `[]`, outline incl. image-edge); `maskStats` order +
  tie-breaks; `parseHexInput` (3/6-digit, `#` optional, invalid → null);
  `colorAtPixel` clamping; `applyFillToMask` and `recolorExact` (exact match
  only, inputs unmutated); `removeSmallRegions` — speck absorbed into
  dominant border color, tie-break, threshold boundary, ascending-area order,
  large regions untouched; `buildFlattenOverlay` (hover-only,
  selection-only, both with hover-wins overlap, null when empty); view math
  (zoom clamp both ends, focal-point invariance, pan clamp, zoom-1 forces
  origin, `IDENTITY_VIEW`).
- **Component (RTL, worker hook mocked with a synchronous core-backed fake
  extended to the new ops; `getBoundingClientRect` mocked as in the R21
  suite):** enter/exit/resume round trip incl. palette-undo depth
  preservation; upstream Apply/Posterize/load discarding the stage; hover →
  click adds region ("N px selected"), click-selected removes, Esc/Clear;
  W/S value stepping + hover refresh + hex-input guard; fill panel
  (suggested %, runner-ups, hex error, pick sets fill without selecting);
  Flatten selection / Recolor / presets / Despeckle send the right actions
  and update counter/selection; undo walks back to baseline restoring
  counter, disabled at baseline and while busy, `z` in hex input ignored;
  Reset all; zoom/pan state math via exposed handlers; hints strip; Download
  naming; busy-state disabling; hover requests not flipping busy.
- **E2E `e2e/flatten.spec.ts`** (Playwright, credential-gated like
  `e2e/image-prep.spec.ts`, reusing `e2e/fixtures/image-prep-sample.png`):
  upload → posterize → Start flatten → hover + click a color block → "px
  selected" appears → Flatten selection → counter shows 1 → `z` reverts →
  Despeckle runs → Exit flatten restores the palette panel → Download
  suggests `image-prep-sample-prepped.png`. This path exercises the REAL
  worker `mask`/`flatten` ops and canvas geometry.
- **Coverage targets:** `lib/flatten-core.ts` **100% branch**; ≥ 80% lines on
  every other changed module (`ImagePrep`, workspace, canvas, panels, hook,
  `worker-messages`); `image-prep.worker.ts` keeps its existing coverage
  exclusion — **no other config change is authorized**.

## Phased delivery (one spec, one feature, approvable increments)

The feature is large; `tasks.md` is sliced into three independently
verifiable phases. Each phase ends green (typecheck/lint/test) and shippable:

- **Phase A — select & flatten (core value):** flatten stage + enter/exit,
  Flood + Brush masks, hover preview, selection add/remove/clear, fill panel
  (suggested/runner-ups/hex/pick), Flatten selection, undo/Reset/counter,
  hints strip, Download. (R1–R5, R7, R8, R10–R16, R20–R22, R25–R28; R24 at
  zoom 1.)
- **Phase B — smarter masks & recolor:** Smooth mode, Catch stray pixels,
  Recolor every match. (R6, R9, R17)
- **Phase C — whole-image helpers & navigation:** remove-small-regions core,
  Low/Medium/High presets, Despeckle, scroll zoom + pan + Expand. (R18, R19,
  R23, R24 under zoom/pan)

## Open items

- None. Touch gestures, AI segmentation, redo, feathered masks, and any
  persistence are explicitly deferred (see `requirements.md` → Out of scope).
