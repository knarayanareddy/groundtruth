# Ground Truth + BlindSpot — Local-First Source Monitoring & Uncertainty Review Prototype

> **STATUS (2026-11-14): SUPERSEDED — kept for provenance.**
> The canonical implementation in this repository is now
> [`../implement-source-monitoring-prototype-claude/`](../implement-source-monitoring-prototype-claude/).
> An end-to-end review (`.review/REVIEW.md`) found both implementations' replay engines to be
> equally correct against spec §4, but this copy ships the retained Idea Studio showcase in its
> production bundle, including claim vocabulary spec §1 forbids (`Brier` ×12, `Sybil` ×1,
> `OPSEC scrubbing` ×1 — see the corrected §1 row in `RESULTS_AND_LIMITATIONS.md`).
> The genuinely additive part of this implementation — the optional §7 test-feed adapter harness —
> has been ported into the canonical app as `src/engine/adapter.ts` with its own test coverage.
> This directory is not deleted so that the independent work and its provenance remain auditable.

## Overview & Evidence Boundaries

This repository contains the local-first **Ground Truth + BlindSpot** source-monitoring and uncertainty-review prototype implemented against `01_IMPLEMENTATION_SPEC.md`.

### Non-Negotiable Boundaries
- **Synthetic / User-Provided Data Only:** All bundled fixtures (`fixtures/reference-fixture.json` and diagnostic scenarios) are synthetic. Imported files are treated as untrusted user-provided text, rendered strictly as plain text, and never automatically verified.
- **Heartbeat ≠ Sensor Accuracy or Clear Scene:** `FRESH HEARTBEAT` means only that a `heartbeat` event arrived within the declared threshold (`0 <= T - lastHeartbeatReceivedAt < heartbeatThreshold`). It does **not** establish calibrated sensor operation, valid measurements, field coverage, or that a monitored area is safe.
- **Silence ≠ Safe or Known Failure Cause:** `STALE / UNKNOWN` and `WAITING / UNKNOWN` indicate no recent heartbeat within the threshold. Silence is never negative evidence about the environment and does not prove device failure cause or jamming.
- **Different IDs ≠ Source Independence:** Declared dependencies (`gateway-1`, `power-1`, `power-2`) and dependency knowledge (`complete`, `partial`, `unknown`) are human-entered metadata. Disjoint labels (`power-1` vs `power-2`) or unknown declarations (`Source C`) **never** prove physical, network, power, or failure-mode independence. No numeric independence score, confidence percentage, or Brier score is computed.
- **Legacy Panel Removed:** The legacy `src/components/BenchmarkTacticalView.tsx` component (which contained scripted source states, simulated Atech toggles, invented Brier/Sybil claims, and a regex PII scrubber) has been deleted from `src/components/` and excluded from the application workflow and production bundle.
- **No Hardware, Cloud, or Privacy Scrubber:** No physical Atech Frame 10 / Frame 2.1 board, Raspberry Pi, Nexus connection, robot link, or regex anonymizer is connected or claimed. Never enter real personal, confidential, or operational data.

---

## 1. Mac Prerequisites & Setup Commands

Use **Node.js 20.19+** (within 20.x) or **Node.js 22.12+** and `npm` (Vite 7 does not support Node 21):

```sh
# 1. Install pinned dependencies from package-lock.json
npm ci

# 2. Run TypeScript static typecheck
npx tsc --noEmit

# 3. Build single-file offline-capable bundle (dist/index.html)
npm run build

# 4. Run portable unit & component test suite (Vitest)
npx vitest run tests/engineAndUi.test.tsx

# 5. Run portable browser end-to-end test suite (Playwright Chromium)
# Note: On a new Mac, run `npx playwright install chromium` once if Chromium is not yet cached.
npx tsx tests/browser-e2e.spec.ts

# 6. Start loopback-only local development server
npm run dev -- --host 127.0.0.1
```

### Offline Mode
After `npm run build`, the entire application is inlined into a single self-contained file at `dist/index.html`.
- On macOS, open it directly without any server:
  ```sh
  open dist/index.html
  ```
- During normal operation, the application makes **zero external HTTP/HTTPS requests**, loads no remote fonts or analytics, and operates completely offline.

---

## 2. Five-Minute Local Demo Walkthrough

1. **Launch & Inspect Initial State (`T+0s`, ~45s):**
   - Open `dist/index.html` or `http://127.0.0.1:5173`.
   - Click **Clear LocalStorage & Reset Session** to ensure a clean start on the **Section 4 Reference Fixture** (`spec-sec4-reference-fixture`, duration `12s`, heartbeat threshold `5s`, comparison tolerance `0s`).
   - Observe all three sources visible side-by-side at `T+0s`:
     - **Source A:** `● FRESH HEARTBEAT` (`hb-A-0` received at `T+0s`).
     - **Source B:** `● FRESH HEARTBEAT` (`hb-B-0` received at `T+0s`).
     - **Source C:** `◌ WAITING / UNKNOWN` (`unknown` dependency knowledge, zero packets).
   - Note that the Disagreement panel shows no observations yet (future events at `T+2s` and `T+6s` are causally withheld).

2. **Step to `T+2s` — Inspect Comparable Report Disagreement & Shared Dependency (~1 min):**
   - Click **+1s** twice (or click checkpoint **T=2s**).
   - In the **Limited Comparable Report Disagreement Cue** panel, inspect the side-by-side conflict between:
     - **Source A (`obs-A-2`):** `"indicator=on"` (`observedAt: T+2s`, `receivedAt: T+2s`, `clockQuality: synthetic_synchronized`).
     - **Source B (`obs-B-2`):** `"indicator=off"` (`observedAt: T+2s`, `receivedAt: T+2s`, `clockQuality: synthetic_synchronized`).
   - Verify the comparison rule (`ctx-panel-alpha / panel-alpha.indicator (categorical_state)`, `|Δt| <= 0s`), **No Winner Selected**, and that **Source C** is explicitly noted as silent/unavailable (never counted as an opposing observation).
   - In the **Declared Shared Dependencies & Overlap Analysis** panel, inspect the SVG bipartite graph and pairwise cards showing that **A ↔ B** share `gateway-1` (`DECLARED_OVERLAP`), distinct power labels (`power-1` vs `power-2`) do not prove independence, and **C** has `unknown` dependency declarations.

3. **Step/Jump to `T+5s` & `T+6s` — Exact Threshold Boundary & Historical Backfill (~1.5 min):**
   - Click **T=5s** (or step to `T+5s`):
     - **Source A** receives `hb-A-5` at the exact `5s` threshold; the new event is processed first so **Source A** stays `● FRESH HEARTBEAT` (age `0s`).
     - **Source B** has had no heartbeat since `T+0s` (`5 - 0 >= 5`), so **Source B** transitions at the exact boundary `T+5s` to `▲ STALE / UNKNOWN`.
   - Click **+1s** to advance to **`T+6s`**:
     - **Source B** receives backfilled observation `obs-B-6-backfill` (`observedAt: T+1s`, `receivedAt: T+6s`, `isBackfill: true`).
     - Verify on **Source B's card** that **Source B remains `▲ STALE / UNKNOWN`**:
       - `Last Packet Received`: `T+6s (age 0s)`
       - `Last Heartbeat Received`: `T+0s (age 6s)`
       - `Last Obs Source Time`: `T+1s` (`Obs Age: 5s (rcv age 0s)`)
     - Verify that the `T+2s` disagreement remains visible and is marked **`HISTORICAL CONTEXT (obs age 4s at T+6s)`**, while `(obs-A-2, obs-B-6-backfill)` is marked **`not comparable / insufficient information`** (`|2s - 1s| = 1s > 0s` tolerance).

4. **Step to `T+7s`, `T+10s`, `T+12s` — Heartbeat Receipt Recovery & Later Timeouts (~1 min):**
   - Click **+1s** to reach **`T+7s`**:
     - **Source B** receives `hb-B-7` and transitions `STALE / UNKNOWN → FRESH HEARTBEAT`. Inspect the **Causal Heartbeat State Transitions** log confirming this is labelled **recovery of heartbeat packet receipt only**, not proof of sensor or scene recovery.
   - Click **T=10s** (`A` becomes `▲ STALE / UNKNOWN`, `B` is `● FRESH HEARTBEAT` age `3s`) and **T=12s** (`B` also becomes `▲ STALE / UNKNOWN`).

5. **Add Reviewer Note, Export, Reset, Reimport & Reject Invalid Input (~1 min):**
   - Click **T=7s**, type a note in **Local Reviewer Notes**, and click **Add Note @ T+7s**.
   - Click **Export Reproducible JSON @ T+7s** and click **Copy Export JSON into Import Box**.
   - Click **Clear LocalStorage & Reset Session** (clock returns to `T+0s`, notes cleared).
   - Click **Validate & Import JSON** — the session returns to `T+7s` with the exact same source statuses, transition log, and reviewer note.
   - Click **Test Invalid Input Rejection** — path-specific validation errors appear (`heartbeatThreshold`, `sources[0].dependencyIds[0]`, `events[0].sourceId`, `events[0].receivedAt`) while the active `T+7s` session and reviewer note remain intact.

---

## 3. Data Schema (`groundtruth-blindspot/v1`) & Limits

- **Schema Version:** `"groundtruth-blindspot/v1"` (`ENGINE_VERSION = "1.0.0"`).
- **Time Unit:** `"seconds"` (finite nonnegative elapsed seconds; documented conversion: `1s = 1000ms` via `secondsToMillis` / `millisToSeconds`).
- **Documented Input Limits:**
  - `MAX_IMPORT_BYTES`: `1,048,576` bytes (1 MiB)
  - `MAX_SOURCES`: `100`
  - `MAX_DEPENDENCIES`: `200`
  - `MAX_EVENTS`: `10,000`
  - `MAX_NOTES`: `1,000`
  - `MAX_DURATION_SEC` / `MAX_THRESHOLD_SEC`: `86,400` seconds
  - `MAX_TOLERANCE_SEC`: `3,600` seconds
- **Referential & Enum Validation:**
  - Every `source.dependencyIds[i]` must reference a defined `dependencies[].id`.
  - Every `event.sourceId` must reference a defined `sources[].id`.
  - `dependencyKnowledge`: `"complete" | "partial" | "unknown"`
  - `clockQuality`: `"synthetic_synchronized" | "unverified" | "unknown"`
  - `event.type`: `"heartbeat" | "observation"`

---

## 4. Replay, Virtual Clock & Status Semantics

1. **Strict Causality:** At virtual time `T`, only events with `receivedAt <= T` affect source statuses, observation histories, transitions, or comparisons. Reviewer notes with `recordedAtReplayT > T` are withheld in causal replay mode.
2. **Deterministic Tie-Breaking:** Events are sorted by `receivedAt` ascending, then `id` ascending (code-unit order). Out-of-order imported event arrays are sorted deterministically by `receivedAt` without rewriting earlier replay states.
3. **Per-Source Heartbeat States at `T`:**
   - `WAITING / UNKNOWN`: No `heartbeat` event with `receivedAt <= T`. Never displayed as fresh.
   - `FRESH HEARTBEAT`: `0 <= T - lastHeartbeatReceivedAt < heartbeatThreshold`.
   - `STALE / UNKNOWN`: `T - lastHeartbeatReceivedAt >= heartbeatThreshold`.
4. **Exact Threshold Boundary Rule:** Events with `receivedAt === T` are applied before evaluating staleness at `T`. Transitions are computed at exact simulated boundaries (`lastHb + threshold`) even if replay jumps over intermediate timestamps.
5. **Observation vs. Heartbeat Separation:** `observation` events update `lastPacketReceivedAt` and `observationHistory`, but **never** initialize or reset `lastHeartbeatReceivedAt`. If `observedAt > receivedAt`, the observation is deterministically flagged with `clockSkew: true` (`observationAge: "clock_skew"`) and excluded from valid comparisons.

---

## 5. Export, Import & LocalStorage Cleanup

- **LocalStorage Key:** `groundtruth_blindspot_session_v1` stores the current plain-text scenario, replay clock `T`, explicit synthetic event config, and local reviewer notes.
- **Cleanup:** Click **Clear LocalStorage & Reset Session** in the top bar (or run `localStorage.removeItem('groundtruth_blindspot_session_v1')` in browser devtools) to remove all stored local state.
- **Snapshot Verification on Import:** When importing an exported JSON record, the app recomputes all states, transitions, and disagreements from the event log at `replayPositionT` and displays a warning banner if `derivedSnapshotAtExportT` in the file does not match recomputed truth.
