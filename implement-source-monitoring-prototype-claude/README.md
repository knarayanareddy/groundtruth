# Ground Truth + BlindSpot — source monitoring & uncertainty review (local prototype)

A local-first, software-only prototype for **reviewing the status of information sources**: heartbeat freshness, observation timing, declared shared dependencies, and one limited disagreement cue. It replays a timestamped event log (a bundled synthetic fixture, or a JSON file you import) on a **virtual clock**.

**All example data is synthetic.** Nothing is live. No hardware, cloud service, Nexus connection, robot, recording or account is involved or required.

It does **not** detect anything, does not show that a sensor works or is correct, does not show that a source is independent, and does not show that any area is clear. A heartbeat only means "a message was received". Silence is unknown, not reassurance. See `RESULTS_AND_LIMITATIONS.md`.

## Mac prerequisites and setup

* macOS with a terminal. **Node.js 20.19+ (20.x line) or 22.12+**, and npm. Vite 7 does not support Node 21. Check with `node -v`.
* **Not tested on a Mac** — see `RESULTS_AND_LIMITATIONS.md`. Everything was run on Linux x86_64 / Node 20.20.2.

```sh
unzip GroundTruth_BlindSpot_Implementation.zip && cd GroundTruth_BlindSpot_Implementation
npm ci                      # needs internet once, to download the pinned dependencies
npm run build               # produces dist/index.html (single self-contained file) + adds a restrictive CSP
```

### Run it (pick one; both work without internet after setup)

1. **Open the file directly (offline mode):** `open dist/index.html` (a prebuilt copy is already in the ZIP, so you can do this before `npm ci`).
2. **Loopback-only static server:** `npm run serve` then open <http://127.0.0.1:4173/>. It binds `127.0.0.1` only, serves only `dist/`, GET/HEAD only.
3. **Dev server (for development):** `npm run dev` → <http://127.0.0.1:5173/> (the script forces loopback).

Normal use makes **no external requests** (no analytics, fonts, CDNs). The built page also carries a Content-Security-Policy meta tag with `connect-src 'none'`.

### Tests (details and real output in `RESULTS_AND_LIMITATIONS.md`)

```sh
npm run typecheck           # tsc for app and tests
npm test                    # 149 unit + component tests (Vitest)
npx playwright install chromium    # ONE-TIME browser download (internet needed); on Linux you may also need system libraries
npm run test:all            # typecheck + build + unit + browser tests; writes outputs to test-results/
```

## Five-minute local demo

See `DEMO_5_MIN.md` (same steps, with the exact values you should see).

## What you see

| Panel | Meaning |
|---|---|
| Replay clock | Play / pause / step ±1 s / seek / restart / speed. Shows current **T** and PAUSED / PLAYING / STOPPED. Status depends only on T. |
| Source status | Per source: heartbeat state (`WAITING / UNKNOWN`, `FRESH HEARTBEAT`, `STALE / UNKNOWN`), **last packet received**, **last heartbeat received**, heartbeat age, last observation, **receive age**, **source-claimed time + clock quality**, **observation age**, newest claimed time. These are deliberately separate. |
| Timeline | Lanes per source with text, glyph and border/pattern coding (never colour alone), received markers, claimed-observation-time markers, and a transitions list at exact boundaries. |
| Declared dependencies | Declared metadata only: matching IDs, who asserted them, `complete / partial / unknown`. "No overlap declared" is never shown as independence. No score. |
| Report disagreement | For received reports with the same explicit subject/property/context, identical unit, synchronized clocks and times within the declared tolerance: shows both raw claims, times, rule and dependency overlap. Otherwise "not comparable / insufficient information". Never picks a winner. |
| Event log | Only events received by T (causal). Plain-text rendering. |
| Synthetic injection | Optional: inject a synthetic heartbeat or a drop window. They are explicit entries in the log and export, never a fake physical unplug. |
| Reviewer notes | Local, unauthenticated alias; separate non-causal layer; only notes authored at or before T are shown unless you tick "show all". |

## Replay and clock semantics (summary; full text in `docs/SCHEMA.md`)

* Time is **integer virtual elapsed seconds** on the receiver clock. The engine never reads the wall clock or random numbers (enforced by a test).
* Events sort by `(receivedAt, id)` with plain code-unit string comparison. All events with `receivedAt <= T` apply before state at T.
* `FRESH` iff `0 <= T - lastHeartbeat < threshold`; `STALE` iff `>= threshold`. A heartbeat at exactly `last + threshold` is processed first, so the source is fresh.
* Observations (even recently-received backfill) never reset heartbeat freshness.
* Transitions are computed analytically at their exact boundary, so seeking or jumping over a threshold still records it, and play/step/seek reach identical results.
* `observedAt` later than `receivedAt` is flagged as clock skew: kept, never treated as fresh, never compared.

## Export, import and storage

* **Export** downloads a versioned JSON record: original scenario, thresholds, event log, your synthetic additions, replay position, notes, labels, derivation rules, and an informational derived snapshot. It may contain text you typed and is **not anonymised, encrypted or signed**. The app cannot tell whether the browser actually saved the file.
* **Import** accepts a scenario file or an exported record. The whole input is validated first (size ≤ 1 MiB, ≤ 5000 events, versions, unique IDs, references, enums, integer times, threshold bounds, strict field names). Errors show JSON paths. A rejected import changes nothing. On import all status is **recomputed**; a stored snapshot that disagrees only triggers a warning.
* **Browser storage (optional)**: nothing is stored unless you press **Save to this browser**. It stores one localStorage key, `groundtruth-blindspot:saved-session:v1`, containing the exported record JSON. Status messages are truthful (read-back confirmed, or the quota/denied error). **Delete saved copy** removes it. To clear manually: DevTools → Application → Local Storage → delete that key, or clear site data. **Clear session** only clears the open tab.

## Layout of this ZIP

```
src/engine/    pure deterministic engine (types, validation, replay reducer, derivation, dependency + disagreement, record, adapter)
src/ui/        React UI (no engine logic)       src/App.tsx   entry
fixtures/      reference-fixture.json, html-literal-test.json, invalid/*.json
tests/unit/    Vitest          tests/e2e/   Playwright (against dist/index.html over file://)
scripts/       serve-local.mjs, harden-dist.mjs, run-all-tests.sh, make-invalid-fixtures.mjs
archive/legacy_scripted_panel/   old scripted panel kept as non-compiled .txt for provenance ONLY (not in src, not in bundle)
test-results/  actual outputs from the last full run
docs/SCHEMA.md   RESULTS_AND_LIMITATIONS.md   CHANGES_AND_PROVENANCE.md   DEMO_5_MIN.md
dist/index.html  prebuilt single-file app
```

## Optional test feed adapter (§7)

**Implemented in software; no hardware was attached or tested.** Ported from the Protocol Argon
implementation during the 2026-11-14 merge pass.

It is a separate panel at the bottom of the workbench, and nothing else in the app depends on it.
Its buttons emit **synthetic frames inside the browser tab** — there is no serial/USB/WebSerial code,
no network call, and no wall-clock read. The panel is labelled
`UNTESTED — NO PHYSICAL DEVICE ATTACHED`.

What it is for is practising the transitions a real adapter would have to get right:

1. Tick **Opt in**, then **Simulate a valid heartbeat** → the card shows `FRESH HEARTBEAT (AGE 0s < 5s THRESHOLD)`.
2. **Simulate a poll failure** → the card immediately becomes `DISCONNECTED / POLL FAILED — STATUS UNKNOWN (NOT FRESH)`. A cached card never survives a failure looking current.
3. **Advance local clock 1 s** repeatedly → the cached snapshot age counts up (1 s, 2 s, …) while the card stays unknown.
4. Leave it long enough without a failure and the age crosses the threshold → `STALE / UNKNOWN`.
5. **Simulate a valid heartbeat** again → `FRESH HEARTBEAT (RESUMED AFTER A Ns GAP)`. That is a statement about *receipt*, not about any device or area.
6. **Simulate a late out-of-order callback** → ignored, and the ignored count increments. State cannot roll backwards.

Turning opt-in off discards the cache. This state is deliberately **not** part of the exported
record; the record contains the replayed event log. Covered by `tests/unit/adapter.test.ts`
(28 tests) and `tests/unit/ui.test.tsx` (11 component tests).
