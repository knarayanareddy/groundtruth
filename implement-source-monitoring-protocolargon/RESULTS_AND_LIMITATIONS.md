# Results and Limitations — Ground Truth + BlindSpot Implementation

## 1. Specification Compliance Matrix (`01_IMPLEMENTATION_SPEC.md`)

| Spec Section | Status | Evidence Paths & Summary |
|---|---|---|
| **1. Purpose and non-negotiable boundaries** | **PASS** | `src/components/GroundTruthBlindSpotView.tsx`, `src/App.tsx`, `dist/index.html`. Replaces and removes `src/components/BenchmarkTacticalView.tsx` from the workflow and bundle. Labels all data as synthetic or user-provided (unverified). Explicitly states a fresh heartbeat is not proof of sensor accuracy or scene safety, silence is not a clear scene, and different IDs do not prove independence. No regex PII scrubber, Brier score, Sybil claim, or simulated hardware unplug is included. |
| **2. Architecture and usability** | **PASS** | Pure deterministic derivation engine in `src/engine/replayEngine.ts`, validator in `src/engine/validator.ts`, storage in `src/engine/localStorageSession.ts`, UI in `src/components/GroundTruthBlindSpotView.tsx`. Keyboard operable, responsive down to 390px viewport width, statuses distinguished by icons (`●`, `▲`, `◌`), border styles (solid/dashed/dotted), SVG patterns, and text badges. Zero external network requests during normal operation. |
| **3. Data, time, and status model** | **PASS** | `src/engine/types.ts`, `src/engine/replayEngine.ts`, `fixtures/reference-fixture.json`. Implements versioned schema `groundtruth-blindspot/v1`, integer/finite elapsed seconds with documented conversion (`1s = 1000ms`), strict causal filtering (`receivedAt <= T`), deterministic tie-breaking (`receivedAt ASC, id ASC`), exact threshold boundary transitions (`0 <= T - lastHb < threshold` vs `>= threshold`), separate `lastPacketReceivedAt`, `lastHeartbeatReceivedAt`, `observedAt`, `observationAge`, `clockQuality`, and deterministic `clockSkew` flagging when `observedAt > receivedAt`. |
| **4. Deterministic reference fixture and expected states** | **PASS** | `fixtures/reference-fixture.json`, `public/fixtures/reference-fixture.json`, `src/fixtures/referenceFixture.ts`, `tests/engineAndUi.test.tsx`, `tests/browser-e2e.spec.ts`. Implements the exact 12s duration, 5s threshold reference fixture (Sources A, B, C; `gateway-1`, `power-1`, `power-2`; heartbeats `A@0, B@0, A@5, B@7`; observations `A@2 indicator=on`, `B@2 indicator=off`, `B@6` backfill `observedAt=1`). Verified at `T=0, 2, 5, 6, 7, 10, 12`. |
| **5. Dependency and disagreement view** | **PASS** | `src/engine/replayEngine.ts` (`deriveDependencyOverlaps`, `deriveObservationComparisons`), `src/components/GroundTruthBlindSpotView.tsx`. Displays SVG bipartite dependency graph and pairwise intersection cards (`A ↔ B` sharing `gateway-1`, `C` with `unknown` declarations, disjoint `power-1`/`power-2` explicitly marked non-independent). Computes no numeric independence/trust/Brier score. Evaluates comparable observation disagreements with explicit comparison rules, marks older comparisons as historical context, and outputs `not comparable / insufficient information` when any comparability requirement fails. |
| **6. Import, export and local data handling** | **PASS** | `src/engine/validator.ts`, `src/engine/localStorageSession.ts`, `src/components/GroundTruthBlindSpotView.tsx`. Enforces all-or-nothing validation (1 MiB byte cap, count caps, schema/engine version, unique IDs, referential integrity, enum/time bounds) with path-specific errors that leave active state intact on failure. Renders all imported/note strings as plain text without HTML execution. Recomputes state from events on import and warns on `derivedSnapshotAtExportT` mismatch. Truthful `localStorage` status and cleanup control. |
| **7. Optional hardware extension — not required** | **PARTIAL (Software Harness Only; Physical Hardware Untested)** | `src/engine/localFeedAdapter.ts`, `src/components/GroundTruthBlindSpotView.tsx`. Implements a separate, opt-in local test-only heartbeat feed adapter state machine with protocol validation (`groundtruth-local-heartbeat-v1`), immediate `DISCONNECTED / STALE / UNKNOWN` transition on poll failure, advancing local snapshot age, out-of-order callback rejection, and outage recovery logging. **Marked PARTIAL because no physical Atech Frame 10 / Frame 2.1 board or USB serial device was connected or tested in this sandbox; the adapter is explicitly labelled `UNTESTED WITH PHYSICAL HARDWARE`.** |
| **8. Tests and evidence required** | **PASS** | `tests/engineAndUi.test.tsx` (15 Vitest unit/component test suites) and `tests/browser-e2e.spec.ts` (36 Playwright Chromium E2E assertions against `dist/index.html`). All tests pass with zero skipped tests, zero external HTTP/HTTPS requests, and zero page/console errors. |
| **9. Return deliverables** | **PASS** | `README.md`, `RESULTS_AND_LIMITATIONS.md`, `CHANGES_AND_PROVENANCE.md`, `fixtures/reference-fixture.json`, `package.json`, `package-lock.json`, `dist/index.html`, `tests/`, and `GroundTruth_BlindSpot_Prototype_Deliverable.zip`. |

---

## 2. Test Environment & Actual Observed Outputs

### Execution Environment
- **OS / Kernel:** Linux x86_64 sandbox (Debian Bookworm userland)
- **Node.js:** `v20.20.2`
- **npm:** `10.8.2`
- **TypeScript:** `5.9.3`
- **Vite:** `7.3.7` (`vite-plugin-singlefile` `2.3.2`)
- **Vitest:** `4.1.12` (`jsdom` `29.0.2`)
- **Playwright Headless Chromium:** `136.0.7103.25` (Playwright `1.52.0`)

### Command 1: TypeScript Type Check & Single-File Production Build
```text
$ npx tsc --noEmit && npm run build
> react-vite-tailwind@0.0.0 build
> vite build

vite v7.3.7 building client environment for production...
transforming...
✓ 2111 modules transformed.
rendering chunks...
[plugin vite:singlefile] Inlining: index-ByBiCu46.js
[plugin vite:singlefile] Inlining: style-K2JA68cA.css
computing gzip size...
dist/index.html  539.10 kB │ gzip: 153.04 kB
✓ built in 2.99s
```

### Command 2: Legacy Panel Exclusion Verification in Built Bundle
```text
$ grep -E "QUARANTINED_SYBIL|REDACTED-VANTAGE-POINT|SAM MISSILE SAVED|TelegramBot_UA_Watch88" dist/index.html || echo "CLEAN: Zero legacy BenchmarkTacticalView claims in dist/index.html"
CLEAN: Zero legacy BenchmarkTacticalView claims in dist/index.html
```

### Command 3: Portable Unit & Component Tests (Vitest)
```text
$ npx vitest run tests/engineAndUi.test.tsx

 RUN  v4.1.12 /home/user/sandbox

 ✓ tests/engineAndUi.test.tsx (15 tests) 325ms

 Test Files  1 passed (1)
      Tests  15 passed (15)
```

### Command 4: Portable Browser End-to-End Tests (Playwright Chromium)
*(Note: In this unprivileged Linux container without root `apt-get install`, Playwright Chromium was launched with user-space extracted Debian shared libraries in `/tmp/pw_libs/extracted` via `LD_LIBRARY_PATH`.)*
```text
$ LD_LIBRARY_PATH="/tmp/pw_libs/extracted/usr/lib/x86_64-linux-gnu:/tmp/pw_libs/extracted/lib/x86_64-linux-gnu" npx tsx tests/browser-e2e.spec.ts

============================================================
PLAYWRIGHT CHROMIUM E2E SUITE PASSED: 36 / 36 checks
============================================================
  [PASS] Workbench loads directly on startup without legacy BenchmarkTacticalView
  [PASS] Initial virtual clock is T+0s
  [PASS] T=0: Source A is FRESH HEARTBEAT
  [PASS] T=0: Source B is FRESH HEARTBEAT
  [PASS] T=0: Source C is WAITING / UNKNOWN
  [PASS] All three sources (A, B, C) are simultaneously visible on the dashboard
  [PASS] Stepped +1s twice to T+2s
  [PASS] T=2: Disagreement between obs-A-2 (indicator=on) and obs-B-2 (indicator=off) is visible with no winner selected
  [PASS] Dependency panel displays shared declared dependency gateway-1 between A and B
  [PASS] T=5: Source A is FRESH HEARTBEAT (heartbeat at exact threshold processed first)
  [PASS] T=5: Source B transitions to STALE / UNKNOWN at exact threshold boundary T=5s
  [PASS] T=5: Source C remains WAITING / UNKNOWN
  [PASS] T=6: Source B remains STALE / UNKNOWN after receiving historical backfill obs-B-6-backfill
  [PASS] T=6: Source B last packet received is T+6s (age 0s)
  [PASS] T=6: Source B last heartbeat received remains T+0s (age 6s)
  [PASS] T=6: Source B backfilled observation shows claimed time T+1s, observation age 5s, receive age 0s
  [PASS] T=6: Earlier T=2 disagreement remains visible and explicitly marked as HISTORICAL CONTEXT
  [PASS] T=7: Source B transitions STALE / UNKNOWN -> FRESH HEARTBEAT upon hb-B-7 arrival
  [PASS] T=7: Transition timeline records stale-to-fresh heartbeat receipt recovery with non-safety caveat
  [PASS] T=10: Source A is STALE / UNKNOWN and Source B is FRESH HEARTBEAT (age 3s)
  [PASS] T=12: Both Source A and Source B are STALE / UNKNOWN at T=12s
  [PASS] Reviewer note containing HTML/script tags renders literally as plain text without execution
  [PASS] Exported JSON contains versioned schema, replayPositionT=7, and reviewer notes
  [PASS] Clear LocalStorage & Reset Session returns clock to T+0s
  [PASS] Reviewer notes are cleared after session reset
  [PASS] Importing exported JSON restores virtual replay clock to T+7s
  [PASS] Importing exported JSON deterministically reproduces source states, transitions, and reviewer note at T+7s
  [PASS] Invalid input is rejected with path-specific validation errors
  [PASS] All-or-nothing import rejection preserves active replay position (T+7s) and existing reviewer notes
  [PASS] Keyboard ArrowRight on focused seek slider advances virtual clock from T+7s to T+8s
  [PASS] Opt-in adapter harness transitions to FRESH_HEARTBEAT_RECEIVED on valid test poll
  [PASS] Opt-in adapter immediately marks cached card DISCONNECTED_OR_POLL_FAILED_UNKNOWN and advances snapshot age on poll failure
  [PASS] Opt-in adapter rejects out-of-order callback without rolling state backward
  [PASS] Narrow mobile viewport (390x844) renders without page-level horizontal overflow
  [PASS] Zero external HTTP/HTTPS requests made during entire browser E2E run
  [PASS] Zero uncaught page errors or console errors during browser E2E run
```

---

## 3. Explicit Limitations & What Could Not Be Tested

1. **No Physical Hardware Connected or Tested:**
   - Physical Atech Frame 10, Atech Frame 2.1, Raspberry Pi gateways, USB serial cables, and physical sensors were **not** available in this sandbox and were **not** tested.
   - Compatibility with specific Atech firmware revisions or attached sensor modules is unverified. The optional Section 7 adapter (`src/engine/localFeedAdapter.ts`) is strictly a software state-machine harness and is labelled `UNTESTED WITH PHYSICAL HARDWARE`.
2. **No macOS Hardware Execution:**
   - All builds and automated tests were executed inside a Linux x86_64 sandbox (`Node v20.20.2`), not on physical Apple Silicon / macOS hardware. Standard Mac commands (`npm ci`, `npm run build`, `open dist/index.html`) are documented in `README.md`.
3. **Synthetic Data & Unverified Metadata:**
   - All bundled scenarios (`fixtures/reference-fixture.json` and `CLOCK_AND_DEPENDENCY_EDGE_FIXTURE`) are synthetic software fixtures.
   - Dependency lists (`gateway-1`, `power-1`, `power-2`) are human-provided declarations; the prototype cannot automatically discover hidden physical or network common-cause failure points.
4. **No Privacy Protection, Encryption, Authentication, or Signing:**
   - Exported JSON files and `localStorage` entries (`groundtruth_blindspot_session_v1`) store plain text and unauthenticated local aliases. No regex PII scrubber is included or claimed.
5. **No Live Detection, Field Validation, or Nexus Integration:**
   - This prototype reviews event timing, heartbeat freshness, declared dependency overlap, and limited categorical report disagreement. It does not detect drones/threats, control robots, or connect to Intelic Nexus or any external backend.
