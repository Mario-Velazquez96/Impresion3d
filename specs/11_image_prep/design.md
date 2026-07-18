# Design — 11_image_prep

**Source:** product-owner decision (2026-07-16)
**Depends on:** 02_catalog_management (`Color` model), 01_auth (`requireUser`),
09_price_calculator (the stateless page + pure-core precedent this follows)

## Approach

A **read-only, stateless** feature shaped exactly like 09: the server does one
thing (authorize + load the `Color` catalog), then everything is client-local.
The new element is a **Web Worker** between the island and the pure core, so
million-pixel operations never block the main thread.

```
app/(app)/image-prep/page.tsx            Server Component — auth + Color catalog read
  └─ components/image-prep/ImagePrep.tsx     Client island — ALL pipeline state
       ├─ components/image-prep/ImageDropzone.tsx      Client — picker + drag/drop + file guards
       ├─ components/image-prep/AdjustPanel.tsx        Client — sliders, auto-levels, Apply
       ├─ components/image-prep/HistogramChart.tsx     Client — 256-bin bar rendering (SVG)
       ├─ components/image-prep/PosterizePanel.tsx     Client — N slider, dither checkbox, Posterize
       ├─ components/image-prep/PalettePanel.tsx       Client — palette, merges, snap-to-filaments
       ├─ components/image-prep/BeforeAfterPreview.tsx Client — two canvases + Download PNG
       ├─ components/image-prep/useImagePrepWorker.ts  Client hook — Promise API over the worker
       ├─ components/image-prep/image-prep.worker.ts   Worker entry — thin, stateless dispatcher
       ├─ components/image-prep/worker-messages.ts     Typed request/response protocol
       └─ components/image-prep/types.ts               Client-safe view types (ColorView, stages)
lib/image-prep-core.ts                   PURE core — every algorithm (no DOM/Prisma/React/server-only)
components/layout/MainNav.tsx            + "Image prep" link (all authenticated users)
```

### No persistence — explicit statement

This feature adds:

- **No Prisma model, enum, or field** → `prisma/schema.prisma` is untouched;
  **no migration**, **no RLS change** (the catalog read rides the existing
  `Color` RLS as defense-in-depth, with `requireUser()` as the real
  server-layer guard since Prisma bypasses RLS).
- **No Server Action, no route handler**, hence **no Zod schema** — nothing is
  ever submitted. File-type/size guards are client-side.
- **No Supabase Storage read or write.** The image never leaves the browser;
  the output exits only via the Download anchor.
- **No env var** (nothing for `.env.example`) and **no new runtime
  dependency** — quantization, dithering, and color math are hand-rolled in
  the pure core (they are small, deterministic algorithms; a library would add
  weight without testability).
- No `localStorage`, cookie, or URL-param state. Reload = a fresh tool.

## Algorithm decisions (and why)

- **Quantization: median cut** (not k-means). Median cut is **deterministic**
  (no random seeding → the same input always yields the same palette, which R7
  requires and which makes core tests exact rather than statistical), runs in
  one pass over the histogram of unique colors (O(n log n), comfortably fast
  in a worker at ≤ 2048² pixels), and is the classic posterization algorithm —
  its box-mean palettes produce the **flat, banded regions HueForge layers
  need**. K-means yields marginally lower error but is iterative (many full
  passes), needs k-means++ seeding (randomness or an awkward fixed-seed PRNG),
  and its convergence-dependent output is hostile to exact unit tests.
  Implementation: boxes over RGB space, always splitting the box with the
  largest **longest-axis range** at the median of that axis (weighted by pixel
  count), until N boxes exist or no box is splittable; each palette entry is
  the **pixel-count-weighted mean** of its box. Ties broken by lowest box
  index — determinism is a contract, so every tie-break is defined.
- **Color distance: "redmean" weighted Euclidean**
  (`Δ² = (2 + r̄/256)ΔR² + 4ΔG² + (3 + (255−r̄)/256)ΔB²`, `r̄` = mean red).
  Perceptually much better than plain Euclidean for judging "similar
  filaments", at a fraction of the cost/complexity of full CIELAB/ΔE2000, and
  trivially pure. One metric everywhere: nearest-palette mapping, merge-similar,
  merge-tiny, and catalog snapping (R11–R13) — so behavior is consistent.
- **Dithering: Floyd–Steinberg**, standard left-to-right kernel (7/16 right,
  3/16 down-left, 5/16 down, 1/16 down-right), errors clamped to 0–255.
  **Off by default** — flat bands print better in HueForge; dithering is
  offered for photographic sources (R8).
- **Adjustments** (R5), applied in a fixed, documented order so output is
  deterministic and testable: brightness → contrast → gamma as a single
  **256-entry LUT** (one table lookup per channel per pixel), then saturation
  per pixel (`v' = luma + (v − luma) × (1 + s/100)`), then auto-levels.
  Formulas: brightness offset `v + (b/100)·128`; contrast
  `(v − 128)·((c + 100)/100) + 128`; gamma `255·(v/255)^(1/γ)`; every step
  clamps to 0–255. **Auto-levels** = linear stretch of each channel between
  the luminance histogram's 0.5th and 99.5th percentile bounds (clip constant
  exported). Identity inputs (0/0/1.0/0, auto-levels off) produce a
  pixel-identical buffer — the LUT degenerates to `lut[i] === i`.
- **Luminance**: Rec. 601 (`0.299R + 0.587G + 0.114B`), rounded to 0–255 —
  one function shared by the histogram, saturation, and auto-levels (R6).
- **Alpha**: flattened over white at decode time (`out = a·v + (1−a)·255`).
  HueForge prints have no alpha; carrying it through quantization would poison
  palette means. Stated in R2; the core treats every buffer as opaque RGBA.

## `lib/image-prep-core.ts` — the pure core

Lives in `lib/`, **not** `lib/services/`, and deliberately **does not** import
`server-only` — exactly like `lib/pricing-core.ts`. No DOM types beyond
`Uint8ClampedArray`/`Uint8Array` (plain JS, available in Node and the worker),
so Vitest hits it with zero mocks at 100% branch coverage.

```ts
// ---- shared structures ------------------------------------------------
export type Rgb = { r: number; g: number; b: number };

/** ImageData-compatible, but a plain object: constructible in Node tests. */
export type PixelBuffer = { width: number; height: number; data: Uint8ClampedArray }; // RGBA

/** The quantized working state. indices fits Uint8Array because N ≤ 32. */
export type PaletteEntry = {
  color: Rgb;
  count: number;                                    // pixels mapped to this entry
  catalog: { id: string; name: string; hex: string } | null; // set by snap (R13)
};
export type IndexedImage = { width: number; height: number; indices: Uint8Array; entries: PaletteEntry[] };

export type AdjustSettings = { brightness: number; contrast: number; gamma: number; saturation: number; autoLevels: boolean };

// ---- constants (exported so tests + UI pin the same values) -----------
export const MAX_WORKING_DIMENSION = 2048;          // R4
export const MAX_FILE_BYTES = 20 * 1024 * 1024;     // R3
export const MIN_COLORS = 2, MAX_COLORS = 32, DEFAULT_COLORS = 8;      // R7
export const NEUTRAL_SATURATION_THRESHOLD = 0.12;   // R9
export const DEFAULT_MERGE_DISTANCE = 40;           // R11 (redmean units, slider 0–150)
export const DEFAULT_TINY_COVERAGE_PERCENT = 2;     // R12 (slider 0–20)
export const AUTO_LEVELS_CLIP = 0.005;              // R5

// ---- color math --------------------------------------------------------
export function hexToRgb(hex: string): Rgb;               // #RGB/#RRGGBB, case-insensitive; throws on malformed (guarded upstream)
export function rgbToHex(c: Rgb): string;
export function rgbToHsl(c: Rgb): { h: number; s: number; l: number };
export function luminance601(c: Rgb): number;             // 0–255, rounded
export function colorDistance(a: Rgb, b: Rgb): number;    // redmean (see above)

// ---- stage 2: adjust (R5, R6) ------------------------------------------
export const IDENTITY_ADJUSTMENTS: AdjustSettings;        // 0 / 0 / 1.0 / 0 / false
export function buildAdjustmentLut(s: AdjustSettings): Uint8ClampedArray;   // brightness→contrast→gamma, 256 entries
export function applyAdjustments(src: PixelBuffer, s: AdjustSettings): PixelBuffer; // LUT → saturation → autoLevels; new buffer
export function luminanceHistogram(src: PixelBuffer): Uint32Array;          // 256 bins
export function autoLevelsRange(hist: Uint32Array, clip?: number): { low: number; high: number }; // percentile bounds; flat image → identity range

// ---- stage 3: posterize (R7, R8) ----------------------------------------
export function medianCutPalette(src: PixelBuffer, n: number): Rgb[];       // clamps n to 2–32; ≤ n entries; deterministic
export function nearestIndex(c: Rgb, palette: Rgb[]): number;               // redmean argmin, lowest index wins ties
export function quantize(src: PixelBuffer, n: number, dither: boolean): IndexedImage; // maps (flat) or FS-dithers; counts filled

// ---- stage 4: palette cleanup (R9–R12) ----------------------------------
export function coveragePercent(entry: PaletteEntry, image: IndexedImage): number;   // count / (w·h) · 100
export function classifyPalette(image: IndexedImage): { neutrals: number[]; colors: number[] };
//   neutrals: HSL s < NEUTRAL_SATURATION_THRESHOLD, sorted by lightness desc (light→dark)
//   colors:   the rest, sorted by hue asc; both are entry-index arrays (view order, no mutation)
export function mergeEntries(image: IndexedImage, from: number, into: number): IndexedImage; // remap indices, sum counts, drop `from`; no-op if from === into
export function mergeSimilar(image: IndexedImage, threshold: number): IndexedImage;  // closest pair < threshold, smaller count into larger, repeat (R11)
export function mergeTiny(image: IndexedImage, coveragePercentThreshold: number): IndexedImage; // smallest-first absorb into nearest by distance; stops at 1 entry (R12)

// ---- stage 5: snap (R13) -------------------------------------------------
export function snapToCatalog(image: IndexedImage, catalog: { id: string; name: string; hex: string }[]): IndexedImage;
//   each entry → nearest catalog hex (redmean); entries snapping to the same catalog id merge;
//   result entries carry `catalog` labels and the catalog color replaces `color`.
//   Empty catalog → returns the input unchanged (the UI disables the button anyway, R14).

// ---- rendering / io edges ------------------------------------------------
export function indexedToPixels(image: IndexedImage): PixelBuffer;   // for putImageData + histogram of a quantized stage
export function fitWithin(w: number, h: number, max: number): { width: number; height: number }; // proportional downscale target (R4)
export function downloadFileName(originalName: string): string;      // "photo.jpg" → "photo-prepped.png" (R17)
export function formatByteSize(bytes: number): string;               // "1.2 MB" for the R2 caption
```

Design notes:

- **All functions are pure** — new buffers/arrays out, inputs never mutated.
  Merges return a fresh `IndexedImage` (indices remapped through an old→new
  lookup table, O(pixels) with a ≤ 32-entry map), so React state stays
  immutable and the worker can transfer results without aliasing.
- **`IndexedImage` is the pivot type.** Quantize produces it; every cleanup and
  snap operation is `IndexedImage → IndexedImage`; `indexedToPixels` renders
  it. Coverage is derived from `count`, never stored as a percent, so it can't
  drift from the pixels (mirrors 10's "derived, never stored" principle).
- **Determinism is a contract** (R7): no `Math.random`, no `Date`, defined
  tie-breaks (lowest index) in `nearestIndex`, box selection, and pair
  selection in `mergeSimilar`.
- **The core knows nothing about workers, canvases, or React.** The worker and
  the island are thin shells around these functions — that is what makes the
  100% branch target honest.

## Web Worker — `components/image-prep/image-prep.worker.ts`

Thin, **stateless** dispatcher: every request carries the buffers it needs and
the response transfers the result back. Statelessness keeps the protocol
trivial (no sync bugs between worker-held and island-held state) and makes the
island's React state the single source of truth.

```ts
// worker-messages.ts (types only, shared by worker + hook)
export type WorkerRequest =
  | { id: number; op: "adjust";   buffer: ArrayBuffer; width: number; height: number; settings: AdjustSettings }
  | { id: number; op: "quantize"; buffer: ArrayBuffer; width: number; height: number; colors: number; dither: boolean }
  | { id: number; op: "palette";  image: SerializedIndexedImage;
      action: { kind: "merge"; from: number; into: number }
            | { kind: "mergeSimilar"; threshold: number }
            | { kind: "mergeTiny"; coveragePercent: number }
            | { kind: "snap"; catalog: { id: string; name: string; hex: string }[] } };
export type WorkerResponse =
  | { id: number; ok: true;  result: /* op-specific: adjusted buffer + histogram | SerializedIndexedImage + preview buffer */ }
  | { id: number; ok: false; error: string };
```

- Instantiated with the Next-supported pattern
  `new Worker(new URL("./image-prep.worker.ts", import.meta.url))` so the
  bundler compiles it — no config change needed.
- Pixel `ArrayBuffer`s are passed in the **transfer list** both directions
  (zero-copy). `palette` ops also return the re-rendered preview buffer
  (`indexedToPixels`) so the island never runs O(pixels) work on the main
  thread.
- `adjust` responds with the adjusted buffer **and** its `luminanceHistogram`
  (one round trip for R5 + R6).
- Errors are caught in the worker and returned as `{ ok: false, error }` — the
  island shows a user-safe message; nothing throws across the boundary.
- The worker file itself contains **no logic** beyond
  deserialize → call core → serialize. It is exercised by E2E, not unit tests
  (see Test approach for the coverage-exclude note).

## Client hook — `components/image-prep/useImagePrepWorker.ts`

`"use client"`. Lazily creates the worker once (`useRef`), tears it down on
unmount, and exposes:

```ts
{ request: (req: Omit<WorkerRequest, "id">) => Promise<ResultFor<typeof req>>, busy: boolean }
```

- Correlates responses by `id`; rejects the Promise on `{ ok: false }`.
- `busy` is true while any request is in flight — the panels use it for R18's
  disabled/busy state.
- **Testability:** component tests `vi.mock` this module with a synchronous
  fake that calls `lib/image-prep-core` directly. Because the real worker is
  also just "call the core", the fake is behaviorally equivalent — parity is
  guaranteed by keeping the worker logic-free.

## Page — `app/(app)/image-prep/page.tsx` (Server Component)

Thin, mirroring `app/(app)/calculator/page.tsx`:

- `await requireUser()` — second server-layer guard behind the `(app)`
  layout's redirect; **no `requireAdmin`** (R1). This runs before the Prisma
  read because Prisma bypasses RLS.
- One query, no N+1:
  `db.color.findMany({ select: { id: true, name: true, hex: true }, orderBy: { name: "asc" } })`
  — the same read the calculator page already performs.
- Renders the heading + `<ImagePrep catalogColors={colors} />`; props are plain
  serializable data.
- `export const metadata = { title: "Image prep — Tower Layers" }`.
- No `searchParams` — the tool holds no URL state (nothing persisted, R19).

## Client island — `components/image-prep/ImagePrep.tsx`

`"use client"`. Owns the pipeline as **stage state**, not an effect chain:

```ts
type Stage =
  | { kind: "empty" }
  | { kind: "loaded";    original: PixelBuffer; fileName: string; fileBytes: number;
      originalDims: { width: number; height: number }; downscaled: boolean }
  | { kind: "adjusted";  /* loaded fields + */ adjusted: PixelBuffer; histogram: Uint32Array }
  | { kind: "quantized"; /* adjusted fields + */ image: IndexedImage; preview: PixelBuffer };
```

- **Working image** = `quantized.preview` ?? `adjusted` ?? `original` — one
  derivation used by both the "after" pane and Download (R15, R17).
- **Invalidation (R16) falls out of the state shape:** Apply produces a fresh
  `adjusted` stage (no `quantized` field can survive it); loading a file
  produces a fresh `loaded` stage. Stale palettes are unrepresentable.
- On load, the island decodes the `File` via an `<img>`/`createImageBitmap` +
  canvas `drawImage` (downscaling to `fitWithin(w, h, MAX_WORKING_DIMENSION)`
  in the same draw, over a white-filled canvas to flatten alpha) and
  `getImageData` → `PixelBuffer`. This DOM-bound decode glue lives in a small
  helper inside the island and is covered by E2E, not unit tests.
- Adjust panel state (slider values, auto-levels, N, dither, thresholds) is
  plain `useState`; **nothing recomputes on slider move** — only the explicit
  Apply / Posterize / merge / snap buttons post to the worker (R5, R7).
- Palette operations send the current `IndexedImage` to the worker and replace
  the `quantized` stage with the response (image + preview).
- **Palette undo (R20):** the `quantized` stage carries a `history:
  { image; preview }[]` stack whose last entry mirrors the current palette.
  Posterize seeds it with the single baseline result; each palette-cleanup
  action pushes the new state (dropping the oldest beyond `MAX_PALETTE_HISTORY`
  = 20 so memory stays bounded on large images). `handleUndo` is a **pure
  client-state pop** — `history.slice(0, -1)`, restore the new top's
  `image`/`preview` — that posts **nothing** to the worker and recomputes
  nothing; restoring the prior `image` reference also re-fires PalettePanel's
  `[image]` effect, clearing any in-progress selection. `canUndo =
  stage.kind === "quantized" && !busy && history.length > 1`. Because the stack
  lives *inside* the quantized stage, Apply / load (which build a fresh
  loaded/adjusted stage) discard it structurally, preserving the R16 invariant.
  A `Ctrl/Cmd+Z` window listener calls the same `handleUndo` and only
  `preventDefault`s when `canUndo`, so it never interferes elsewhere. There is
  no Redo.
- **Download (R17):** paint the working image to an offscreen canvas,
  `canvas.toBlob("image/png")` → object URL → temporary `<a download>` click →
  revoke. Filename via `downloadFileName(fileName)`.

### Panels (presentational, controlled by the island)

- **`ImageDropzone`** — a labelled `<input type="file" accept="image/png,image/jpeg,image/webp">`
  plus a drop target (`onDragOver`/`onDrop`); validates MIME type against the
  allow-list and `file.size ≤ MAX_FILE_BYTES` **before** decoding; surfaces
  errors via a status region (`role="alert"`) (R2, R3). Shows
  "W × H px · `formatByteSize(bytes)`" and the R4 downscale notice.
- **`AdjustPanel`** — four labelled `<input type="range">` sliders with their
  numeric value shown, the auto-levels checkbox, a Reset-to-defaults button,
  and **Apply** (disabled while `busy`) (R5).
- **`HistogramChart`** — renders the 256-bin `Uint32Array` as an inline SVG bar
  chart (no canvas → trivially assertable in jsdom), with an accessible label
  (R6).
- **`PosterizePanel`** — N slider (`min=2 max=32`, default 8, value shown),
  dither checkbox (default off), **Posterize** button (disabled until an image
  is loaded, and while `busy`) (R7, R8).
- **`PalettePanel`** — two labelled groups (Neutrals / Colors) from
  `classifyPalette`; each entry is a `<button aria-pressed>` with swatch
  (hex-filled dot, `aria-hidden`, matching the app's swatch convention), hex
  text, and coverage % (1 decimal). Tap-two merge per R10 (selection state
  lives here). Below: "Merge similar" (threshold slider 0–150, default
  `DEFAULT_MERGE_DISTANCE`), "Merge tiny" (slider 0–20%, default
  `DEFAULT_TINY_COVERAGE_PERCENT`), and "Snap to filaments" — disabled with an
  explanatory note when `catalogColors.length === 0` (R11–R14). Snapped
  entries show the filament **name** next to the hex (R13).
- **`BeforeAfterPreview`** — two `<canvas>` elements ("Original" / "Preview")
  painted via `putImageData` in a `useEffect` guarded by ref presence (jsdom
  has no 2D context — the guard keeps component tests rendering), plus the
  **Download PNG** button (R15, R17).

## `components/image-prep/types.ts`

Client-safe view types, declared here rather than imported from server code:

```ts
export type ColorView = { id: string; name: string; hex: string }; // the catalog rows the page passes down
```

(Stage and settings types live beside the island; core types come from
`lib/image-prep-core`.)

## `components/layout/MainNav.tsx`

Add **one** link, **outside** the `showAdmin` block, after "Finances", so it
renders for every authenticated user in both navs (R1):

```tsx
<Link href="/image-prep" className="text-sm text-muted-foreground hover:text-foreground">
  Image prep
</Link>
```

## Auth & security

- `(app)/layout.tsx` redirects unauthenticated requests to `/login`; the
  page's `requireUser()` is the server-layer guard before the single Prisma
  read (Prisma bypasses RLS, so this is the real check). No admin gating (R1).
- No mutation ⇒ no auth→Zod→authorize→service→revalidate flow exists to
  specify. The user's image never leaves the browser — it is not uploaded,
  posted, or stored anywhere (R17, R19), which is also the privacy story.
- Reference data (color names/hex) is already visible to any authenticated
  user on `/inventory`, `/planning`, and `/calculator` — no new exposure.
- No secrets, no `NEXT_PUBLIC_*`, no env vars.

## Server/Client boundary

- **Server:** `app/(app)/image-prep/page.tsx` — auth + one catalog read.
- **Client:** everything under `components/image-prep/` — state, canvases,
  the worker, event handlers.
- **Shared/pure:** `lib/image-prep-core.ts` — importable by the worker, the
  island, and Vitest alike (no `server-only`), which is precisely why it is
  not in `lib/services/`.

## Test approach

- **Vitest (pure core, target 100% branch coverage)** on tiny synthetic
  buffers (2×2 … 8×8): conversions and luminance; redmean distance ordering;
  identity adjustments are pixel-identical; brightness/contrast/gamma/
  saturation known-value cases + 0–255 clamping; histogram bin counts;
  auto-levels range + flat-image edge; `fitWithin`; median-cut — an image with
  k ≤ N distinct colors returns exactly those k, two clear clusters split
  correctly, n clamps to 2–32, determinism (two runs strictly equal);
  `nearestIndex` tie-break; flat quantize vs a hand-computed Floyd–Steinberg
  example; coverage sums; classify thresholds + both sort orders;
  `mergeEntries` (remap, counts, from===into no-op); `mergeSimilar` iteration
  + threshold boundary; `mergeTiny` smallest-first + single-entry stop;
  `snapToCatalog` (labels, same-target dedupe, empty catalog); round trips
  (`indexedToPixels`, hex); `downloadFileName`, `formatByteSize`.
- **Component (RTL, worker hook mocked with a synchronous core-backed fake):**
  dropzone accept/reject/size messaging; dimension + size caption; Apply-only
  recompute (slider move alone triggers no request); histogram renders bins;
  posterize slider bounds/defaults + dither default off; palette grouping,
  coverage text, tap-two merge + deselect, merge-similar/tiny controls, snap
  labels + empty-catalog disabled state; stage invalidation (re-Apply clears
  the palette); busy state disables buttons; Download button wiring
  (`toBlob`/object-URL mocked).
- **E2E (Playwright, credential-gated like `e2e/calculator.spec.ts`):**
  signed-out redirect; the nav link; upload a small committed fixture PNG
  (`e2e/fixtures/image-prep-sample.png`, a few solid color blocks), posterize,
  see the palette, download and assert the suggested filename via Playwright's
  download event. E2E is what exercises the **real** worker + canvas decode.
- **Coverage config note:** `components/image-prep/image-prep.worker.ts` (the
  logic-free worker entry) may be added to the `coverage.exclude` list in
  `vitest.config.ts` with a one-line reason (browser-only worker shell,
  exercised by E2E) — this is the only config change this spec authorizes.
- **Targets:** `lib/image-prep-core.ts` **100% branch coverage**; ≥ 80% lines
  on the other changed modules.

## Pick-from-image / eyedropper (R21)

A **client-only** enhancement layered on the existing palette selection — no
worker round trip, no schema/dependency/persistence change.

- **Core:** one pure helper `paletteIndexAt(image, x, y)` (clamps x/y into
  `[0, width)`/`[0, height)`, returns `indices[y·width + x]`). This is the ONLY
  change to `lib/image-prep-core.ts`; existing algorithms, the worker, and the
  message protocol are untouched. Kept in the core so the pixel→entry lookup
  stays unit-testable at 100% branch coverage.
- **Lifted selection:** the palette `selected` index moves from `PalettePanel`
  up into `ImagePrep` as controlled props (`selected` / `onSelectedChange`),
  preserving R10 tap-to-merge exactly (tap to select, same tap to deselect,
  different tap to merge). The old `[image]` selection-reset effect moves up too:
  `ImagePrep` resets `selected` whenever the quantized `image` reference changes
  (merge / snap / undo / fresh posterize) or the stage leaves `quantized`.
- **Pick mode + geometry:** `ImagePrep` owns a `pickMode` flag and a "Pick from
  image" toggle in `PalettePanel`'s toolbar (`aria-pressed`, active style).
  `BeforeAfterPreview` gives the Preview canvas `cursor-crosshair` and an
  `onClick` while pick mode is on. The click→pixel math is a pure, DOM-free
  `mapClickToPixel({ rectW, rectH, imgW, imgH, offsetX, offsetY })` that inverts
  the `object-contain` uniform scale + centering (`scale = min(rectW/imgW,
  rectH/imgH)`), rejects letterbox-margin clicks (returns `null`), and floors to
  an integer pixel — unit-testable without a real layout. The component glue is
  thin: read `getBoundingClientRect` + intrinsic `width`/`height`, call the pure
  function, forward the result.
- **Wiring:** `ImagePrep.handlePick(x, y)` guards `stage.kind === "quantized"`,
  computes `paletteIndexAt(stage.image, x, y)`, and sets the lifted `selected`
  so the swatch highlights via the existing `ring-2 ring-ring` style. Pick mode
  stays on for repeated picking; the toolbar button toggles it off. A small
  "Picked" readout (swatch + hex + filament name when snapped) shows the current
  selection.

## Open items

- None. AI upscaling, background removal, crop/rotate/brush tools, and any
  persistence (Storage or DB) are explicitly deferred (see `requirements.md`
  → Out of scope).
