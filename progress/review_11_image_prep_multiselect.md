# Review — 11_image_prep: multi-select palette merging (R22, supersedes tap-two R10)

**Reviewer verdict: APPROVED**
**Date:** 2026-07-18
**Scope reviewed:** uncommitted working-tree diff (12 files: core, worker protocol,
worker, island, panel, two test files, 4 spec/progress docs, progress/current.md).

## 1. Core math correctness — verified

`lib/image-prep-core.ts`:

- **`mergeManyEntries(image, from[], into)`** (lines 639–678): `from` deduped via
  `Set`, `into` filtered out, empty-after-cleanup returns the SAME reference
  (no-op). Counts summed onto the survivor, absorbed entries filtered out.
  The remap is built as a compaction table over the ORIGINAL index space
  (`compacted[i] = next++` for every non-removed i), and each pixel maps via
  `compacted[removed.has(old) ? into : old]` — correct for multiple removals on
  BOTH sides of the survivor (no off-by-one; the classic post-filter shift bug is
  absent). Survivor keeps color AND catalog (entries are deep-copied, only
  `count` mutated on the copy). Pure: input indices/entries untouched.
- **`mergeEntriesToAverage(image, indices[])`** (lines 690–736): dedupe + sort;
  `< 2` distinct indices → same-reference no-op. Count-weighted per-channel sums,
  `Math.round` per channel. Zero-total edge: weighted sums are provably 0 when
  every count is 0, so the unweighted-mean fallback is mathematically sound (no
  divide-by-zero, no double counting). Survivor is `unique[0]` (LOWEST index);
  since every absorbed index is above it, its position is stable through
  `mergeManyEntries`, and the patched entry sets `catalog: null` as specified.
- Old `mergeEntries` retained intentionally — still the engine of
  `mergeSimilar`/`mergeTiny` (per design.md amendment).

Core tests (`lib/__tests__/image-prep-core.test.ts`, R22 describe block, 9 tests):
exact `entries` + `indices` assertions covering remap-with-two-removals,
dedupe/ignore-survivor equivalence, both no-op reference identities, survivor
color+catalog retention with sources on both sides, single-source ≡
`mergeEntries`, lowest-index survivor + rounding (112.5 → 113) + catalog cleared,
unselected entries untouched with correct index shifting, and the zero-count
unweighted fallback. Purity asserted (inputs unmutated).

## 2. Protocol change safety — verified

- `PaletteAction` in `worker-messages.ts` is now `mergeMany | mergeAverage |
  mergeSimilar | mergeTiny | snap`. Grep across all `.ts/.tsx`: **zero**
  references to the removed `{ kind: "merge" }` remain (worker, hook, island,
  panel, tests all clean; only spec/progress prose mentions it historically).
- `image-prep.worker.ts` `applyPaletteAction` is a return-typed switch with no
  default over the union — TypeScript exhaustiveness holds (`tsc --noEmit`
  passes; a missing case would fail the `IndexedImage` return type).

## 3. UI behavior — verified in code and asserted by tests

`ImagePrep.tsx` + `PalettePanel.tsx`, with `ImagePrep.test.tsx` assertions:

- Tap toggles in/out (`toggleSelected`, shared by swatches and eyedropper);
  test asserts aria-pressed both ways and NO worker call on selection.
- Action bar: correct "N selected" count; both merges disabled at 1 selected,
  enabled at ≥ 2; Clear empties (asserted, including no worker call).
- "Merge into one of them…" chooser lists ONLY the selected entries (asserted:
  unselected `#000000` absent) and the survivor keeps color + filament label
  (asserted post-snap: "Rojo" label survives a targeted merge).
- Merge-to-average result asserted numerically in the DOM (#555555 at 75.0%
  from black(2)+white(1)), request `kind: "mergeAverage"` asserted.
- Eyedropper toggles membership (same-pixel pick deselects — asserted), adds to
  a tap-selection and merges through the bar (asserted), letterbox click ignored.
- Selection reset on every palette change: `useEffect(() => setSelected([]),
  [quantizedImage])` fires for merge results, merge-similar/tiny, snap, undo
  (image ref swap on history pop), and fresh posterize; leaving the quantized
  stage nulls `quantizedImage`, also resetting. Asserted after merge-to-average.
- **Stale-index guard** (`selected.filter(i => i < image.entries.length)`):
  legitimate, not bug-masking — the island's reset effect flushes AFTER the
  render that swaps in a shrunken palette, so without the guard
  `image.entries[staleIndex]` would be `undefined` and crash `entryButton` for
  one frame. Effects flush before any subsequent user event, so no wrong merge
  can be dispatched from the transient state. Documented in design.md.

## 4. Undo (R20) integration — verified

Both merges go through `handlePaletteAction` → worker `palette` op → history
push (bounded at 20), identical to the other cleanup actions. Test "restores
the prior palette after a multi-merge to average" asserts palette CONTENT after
Undo (#555555 gone; #000000 at 50.0%, #ffffff at 25.0%) and Undo disabled back
at baseline — not just button state. The full pre-existing undo suite
(baseline-disabled, walk-back, re-posterize reset, busy-disabled, Ctrl+Z) runs
on the new merge flow and passes.

## 5. Scope discipline — verified

Working-tree diff touches exactly: `lib/image-prep-core.ts`, the 4 image-prep
component/protocol files, the 2 test files, 3 spec files, 2 progress files.
No `package.json`, no `prisma/`, no `app/`, no `.env.example`, no Storage, no
persistence. Quantize/adjust/dither logic untouched (diff confined to the merge
section + docs). R1–R21 suites pass, updated only where the interaction model
legitimately changed (tap-merge → toggle; eyedropper select → toggle).

## 6. Checks — all green (run by reviewer)

- `corepack pnpm typecheck` — pass.
- `corepack pnpm lint` — pass (4 pre-existing warnings in
  `components/planning/__tests__/WeekPlanner.test.tsx`, unrelated to this diff).
- `corepack pnpm test` — **878/878 passed** (62 files).
  Coverage: `lib/image-prep-core.ts` **100% / 100% / 100% / 100%** (branch
  target met); `components/image-prep` 96.18% lines / 91.13% branches (≥ 80%
  target met; worker entry coverage-excluded per design.md).
- No `console.log` in the changed modules; no `any` introduced.
- No schema diff → no migration required; `prisma migrate status` N/A.

## Non-blocking observations (no action required)

1. `specs/11_image_prep/design.md` lines ~189–198 (the original Worker-protocol
   sketch) still show the old `{ kind: "merge" }` union; the amendment section
   ("Multi-select merging (R22)") documents the swap. Historical-sketch +
   amendment is this spec's established pattern, but a future doc pass could
   annotate the old sketch.
2. The `ImagePrep.test.tsx` suite emits pre-existing React "not wrapped in
   act(...)" warnings (async mocked-worker resolutions); tests are
   deterministic via `waitFor` and all pass. Same pattern as before this change.

## Verdict

**APPROVED.** Leader may mark the R22 enhancement done and the diff may be
committed. Traceability: R10 (amended), R20 (amended), R21 (amended), R22 all
trace to passing tests; every task in tasks.md is `[x]` and spot-checked real.
