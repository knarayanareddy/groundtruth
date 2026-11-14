# Changes and Provenance — Ground Truth + BlindSpot Implementation

## 1. Provenance & Baseline Starting Point

This implementation was built independently from the supplied `GroundTruth_BlindSpot_Agent_Handoff/starting_point/` baseline (`SHA256SUMS.txt` verified `OK` for all 29 handoff files prior to modification).

- **Original Handoff Documentation & Context Preserved:**
  - `00_START_HERE.md`, `01_IMPLEMENTATION_SPEC.md`, `02_SEND_TO_BOTH.md`, `03_BASELINE_INSPECTION.md`, `SHA256SUMS.txt`
  - `context/Idea_Studio_2_End_to_End_Review.md`, `context/IdeaHackReviews_Independent_Review.md`, `context/Existing_Showcase.html`, `context/Original_Idea_Studio_2.zip`, and `context/legacy_examples/` (`BlindSpot.tsx`, `SignalCheck.tsx`, `SensorBridge.tsx`).

---

## 2. Baseline Files Replaced, Removed, or Modified

| File Path | Action | Description & Rationale |
|---|---|---|
| `src/components/BenchmarkTacticalView.tsx` | **DELETED / EXCLUDED FROM BUNDLE** | Removed completely from `src/components/` and from the compiled bundle (`dist/index.html`) per Section 1 & Section 3 of `01_IMPLEMENTATION_SPEC.md`. Eliminated its hard-coded sources, fake Atech cable toggle, invented Brier scores, scripted Sybil burst, military target/action claims, and unsafe regex PII scrubber. Archived provenance remains in `context/`. |
| `src/App.tsx` | **MODIFIED** | Replaced `BenchmarkTacticalView` with `GroundTruthBlindSpotView`, configured the application to open directly into the Ground Truth + BlindSpot interactive prototype on load (`id = 'benchmark'`, `step = 'preview'`), and updated the `benchmark` and `fiber` metadata cards to remove unsupported calibration/scrubber claims. |
| `index.html` | **MODIFIED** | Updated `<title>` to `Ground Truth + BlindSpot — Local-First Source Monitoring & Uncertainty Review`. |
| `package.json` & `package-lock.json` | **MODIFIED (via `npm install`)** | Added pinned dev dependencies (`vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `tsx`, `playwright@1.52.0`) and `lucide-react@1.72.0` to support portable automated unit and browser tests. |

---

## 3. Baseline Files Reused Unchanged

The following files from `starting_point/` were retained to preserve the surrounding Idea Studio 2 shell for non-BenchmarkTacticalView tabs:
- `vite.config.ts`, `tsconfig.json`, `src/main.tsx`, `src/index.css`, `src/utils/cn.ts`
- `src/components/NexusTrustLineView.tsx`, `src/components/MantaviaCableGuardView.tsx`, `src/components/ThermalClearHotView.tsx`, `src/components/PhalanxSwarmView.tsx`, `src/components/AuditAndMergerView.tsx`, `src/components/UkraineFrontlineView.tsx`
- `src/data/reviewData.ts`, `src/data/ukraineResearchData.ts`

---

## 4. New Files Created for Ground Truth + BlindSpot

| File Path | Purpose |
|---|---|
| `src/engine/types.ts` | Versioned schema (`groundtruth-blindspot/v1`), event types (`heartbeat`, `observation`), dependency knowledge enums, clock quality metadata, derived state & transition interfaces, export record schema, and validation result types. |
| `src/engine/replayEngine.ts` | Pure, deterministic causal derivation engine (`normalizeEvents`, `deriveReplaySnapshot`, `deriveSourceTransitionsUpToT`, `deriveDependencyOverlaps`, `deriveObservationComparisons`, `createExportRecord`). Zero wall-clock usage. |
| `src/engine/validator.ts` | All-or-nothing input validator (`validateScenarioInput`) checking 1 MiB byte limit, JSON syntax, schema/engine version, unique IDs, referential integrity, timestamp bounds, and stored-snapshot mismatch verification. |
| `src/engine/localStorageSession.ts` | Truthful browser `localStorage` persistence (`groundtruth_blindspot_session_v1`) with quota/permission error handling and explicit clear control. |
| `src/engine/localFeedAdapter.ts` | Separate opt-in test-only local heartbeat feed adapter state machine (Spec Section 7 & 8.6), explicitly labelled `UNTESTED WITH PHYSICAL HARDWARE`. Implements immediate stale/disconnected transition on poll failure, advancing local snapshot age, out-of-order callback rejection, and recovery tracking. |
| `fixtures/reference-fixture.json` & `public/fixtures/reference-fixture.json` | Checked-in deterministic Section 4 reference fixture JSON (12s duration, 5s threshold, Sources A/B/C, `gateway-1`, `power-1`, `power-2`, heartbeats `A@0, B@0, A@5, B@7`, observations `A@2, B@2` disagreement, `B@6` backfill from `observedAt=1`). |
| `src/fixtures/referenceFixture.ts` | Exports `REFERENCE_FIXTURE` and `CLOCK_AND_DEPENDENCY_EDGE_FIXTURE` (diagnostic scenario for future `observedAt` clock skew, unverified clocks, and multi-dependency overlap). |
| `src/components/GroundTruthBlindSpotView.tsx` | Main React UI for the Ground Truth + BlindSpot prototype: evidence boundary banner, deterministic virtual clock & transport bar, simultaneous multi-source status cards with separated timings, SVG dependency graph & pairwise overlap cards, comparable report disagreement cue, causal transition & event logs, synthetic event controls, plain-text reviewer notes, reproducible JSON export/import, and optional adapter harness. |
| `tests/engineAndUi.test.tsx` | Portable Vitest unit and React component test suite (15 test suites covering Sections 8.1, 8.2, 8.3, 8.4, and 8.6). |
| `tests/browser-e2e.spec.ts` | Portable Playwright Chromium end-to-end browser test suite (36 assertions covering Sections 8.5 and 8.6, external request blocking, keyboard operation, and 390px narrow mobile viewport). |
| `README.md`, `RESULTS_AND_LIMITATIONS.md`, `CHANGES_AND_PROVENANCE.md` | Project documentation, Mac setup, five-minute demo, compliance matrix, test evidence, and provenance. |

---

## 5. Design Influences & Attribution

- Conceptual UI ideas for explicit `UNKNOWN` states, timeline logging, and keeping conflicting claims side-by-side without merging were informed by the specification (`01_IMPLEMENTATION_SPEC.md`) and the review critiques in `context/Idea_Studio_2_End_to_End_Review.md` and `context/IdeaHackReviews_Independent_Review.md`.
- Specifically, Continuity Desk failure modes documented in `context/IdeaHackReviews_Independent_Review.md` (Findings #2, #3, #4, #5: cached fresh cards remaining after poll failure, backfilled observations resetting transport freshness, future data leaking into causal replay, and out-of-order sequence handling) were explicitly prevented in `src/engine/replayEngine.ts` and `src/engine/localFeedAdapter.ts` and verified in `tests/`.
