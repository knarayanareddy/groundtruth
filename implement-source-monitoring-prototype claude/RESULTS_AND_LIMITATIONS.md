# Results and limitations

Everything below was observed in the environment listed here. Nothing was run on a Mac, on a physical device, or by a human user other than the automated tests.

## Environment actually used

| Item | Value |
|---|---|
| OS | Linux 6.1.189+ x86_64 (sandbox) — **not macOS** |
| Node / npm | v20.20.2 / 10.8.2 |
| Vitest | 4.1.12 |
| Playwright | 1.65.1, Chromium **headless shell 159.0.8154.6** only (no Firefox, Safari, or headed Chrome) |
| One-time browser installation | `npx playwright install chromium` (downloaded ~125 MiB). In this sandbox the browser would not start until its Linux system libraries (libnspr4, libnss3, libgbm1, …) were installed with `apt-get`. A Mac normally does not need that step. |
| Raw logs | `test-results/environment.txt`, `01-typecheck.txt`, `02-build.txt`, `03-unit.txt`, `04-e2e.txt`, `00-summary.txt`, `playwright-report.json`, `clean-copy-verification.txt` |

## Commands and actual observed results

| Command | Result (from `test-results/`) |
|---|---|
| `npm run typecheck` (`tsc --noEmit` for app and for tests) | exit 0, no output |
| `npm run build` (`vite build` + `postbuild` CSP hook) | exit 0, `dist/index.html 313.66 kB │ gzip: 91.42 kB`, `CSP meta present` |
| `npx vitest run` | **PASS: 5 files, 109 tests passed, 0 failed, 0 skipped** (the 2 bundle checks run only when `dist/` exists, and it did) |
| `npx playwright test` | **PASS: 15 passed, 0 failed, 0 skipped** (13.1 s) |
| `npm run test:all` | `overall exit: 0` |
| Clean-copy check: unzip to a new dir → `npm ci` → typecheck → build → unit → browser | all passed; 123 packages; rebuilt `dist/index.html` SHA-256 `8c3f90ce…9125e27` **identical** to the shipped file |

An earlier run in this session had failures that I fixed rather than hid: (1) 12 unit failures caused by a name clash in my own test helper and one over-broad regex; (2) three browser failures — a real horizontal-overflow bug at 375 px (grid tracks growing to fit tables; fixed with `grid-cols-1`/`min-w-0`) and two mistakes in my test expectations; (3) three unit failures once the built bundle existed: one negated sentence in a UI file (moved into the exempt limitations module) and two checks that were too loose (`Atech` matched React's `rateChange`; Vite's inert modulepreload polyfill contains one `fetch(`). The final results above are after those fixes.

### Browser tests (`tests/e2e/`, run against the **built** `dist/index.html` over `file://`)

```
 1 initial state: no scenario, no data shown as fresh; banner and title are honest
 2 reference fixture: exact §4 states via stepping, with recovery, dependencies and disagreement
 3 play with real timers reaches stale and recovery; play/step/seek give identical text
 4 causal replay: nothing from the future is visible before it is received
 5 export → clear → import reproduces state, transitions, synthetic entries and notes; HTML note stays literal
 6 tampered snapshot in an imported record shows a warning and recomputed state wins
 7 invalid, malformed and oversized imports are rejected with path-specific errors and the session is untouched
 8 imported HTML/script/link text renders literally; nothing executes or is fetched
 9 synthetic controls: injected heartbeat and drop window are explicit events and affect derived state
10 keyboard operation: Enter/Space on buttons, shortcuts, labelled controls, visible focus
11 status is legible without color: text label, glyph and border style differ per state
12 narrow viewport (375 px): no horizontal page overflow, controls reachable
13 optional browser storage: explicit save, restore, delete; denied/quota errors are reported truthfully
14 built bundle: legacy scripted panel absent, CSP present, no external references
15 scripts/serve-local.mjs binds 127.0.0.1 only and serves the built app with a restrictive CSP
```

**External requests:** every browser test runs under a fixture that records all requests, aborts any `http(s)/ws(s)` request, and fails the test on any external request, console error (this includes CSP violations) or uncaught page error. Result: **0 external requests, 0 console errors, 0 page errors** across all 15 tests. This covers the flows exercised by those tests in Chromium; it is not a proof for every possible path or browser.

**Loopback binding:** test 15 started `scripts/serve-local.mjs` and fetched it on 127.0.0.1 (200, CSP header present, path traversal not served, POST → 405). The sandbox's only non-loopback address was `169.254.0.21` (link-local); a connection to it was refused. This is not a LAN/firewall test.

Screenshots: `test-results/artifacts/screenshot-reference-T12.png` (desktop, T=12), `screenshot-narrow-375.png`.

## Status by numbered spec section

| § | Section | Status | Evidence | Notes |
|---|---|---|---|---|
| 1 | Purpose and non-negotiable boundaries | **PASS** | Whole app; `tests/unit/claims-and-bundle.test.ts`; e2e 1, 8, 14; `src/engine/limits.ts` | Legacy `BenchmarkTacticalView` is not in `src/`, not in the bundle, and not wrapped by a warning: it is archived as non-compiled `.txt`. Synthetic/user-provided labels everywhere. The "forbidden claims" test is **keyword based** — it cannot prove that no misleading wording exists, only that listed phrases are absent from `src/`. |
| 2 | Architecture and usability | **PARTIAL** | `src/engine` (pure) vs `src/ui`; e2e 10, 11, 12, 15 | Done: pure engine, versioned model, virtual clock, TypeScript/React, locked deps, single-file build, loopback server, no external requests (Chromium only), keyboard operation, non-colour status coding, one narrow-width check. **Not done/verified:** any Mac run, Safari/Firefox, screen-reader testing, automated accessibility audit (e.g. axe), colour-contrast measurement, widths other than 375 and 1280, touch input. |
| 3 | Data, time and status model | **PASS** | `docs/SCHEMA.md`; `tests/unit/reference.test.ts`, `heartbeat.test.ts`; e2e 2–5, 9 | Exact thresholds and tie rules, transitions at exact boundaries even when jumping, backfill does not reset freshness, separate packet/heartbeat/observation timing, clock skew flagged, causal replay, play/pause/step/seek/rewind/restart, synthetic inject/drop exported. Time is integer seconds only (milliseconds not supported natively). |
| 4 | Reference fixture and expected states | **PASS** | `fixtures/reference-fixture.json`; `reference.test.ts` (17 tests, every T from 0…12, exact transition list); e2e 2 | The spec does not give the backfilled observation's value or the tolerance. **My choices:** value `"off"`, same comparison key, tolerance 0 s, so the backfill (observed t=1) is "not comparable — outside the declared tolerance" against A's t=2 report instead of becoming a second disagreement. Event IDs and names are mine. |
| 5 | Dependency and disagreement view | **PASS** | `dependency-disagreement.test.ts` (19 tests); e2e 2 | Multi-dependency pairwise overlap, partial/unknown stay unknown, no independence claim or score, one limited deterministic cue, no winner. "Compatible unit" is defined as an identical string. |
| 6 | Import, export and local data handling | **PASS** | `import-export.test.ts` (23 tests); e2e 5–8, 13 | Whole-input validation with JSON-path errors, all-or-nothing, 1 MiB/5000-event limits, plain-text rendering, recomputation on import with mismatch warning, notes/aliases labelled unauthenticated, explicit export notice, explicit-only localStorage with truthful status and delete control. Limits (50 sources, etc.) are my choices; documented. |
| 7 | Optional hardware extension | **NOT IMPLEMENTED** | — | No adapter, no serial/USB/WebSerial code, no board connected, nothing tested. Not required for acceptance; nothing depends on it. |
| 8 | Tests and evidence required | **PARTIAL** | Items 1–5: tests above. | Items 1–5 covered. **Item 6 (live polling/adapter): not applicable** — none exists. **Not covered:** Mac; browsers other than Chromium; real browser timer throttling (large wall-clock jumps are tested at the reducer level with irregular tick sizes and one huge tick, not by throttling a real background tab); performance at the 5000-event limit was not benchmarked; no user testing. |
| 9 | Return deliverables | **PASS** (with caveat) | This ZIP | README with Mac commands (**untested on a Mac**), offline mode, five-minute demo, schema, semantics, export/import, storage cleanup; this file; `CHANGES_AND_PROVENANCE.md`; lockfile; fixtures; tests; prebuilt `dist/index.html`. |

## What I could not implement or test

* **Optional hardware adapter (§7): not built.** No Atech or other device was available or connected; no serial log of any kind exists. This is not a claim about whether any specific board would work.
* **macOS:** nothing was run on a Mac. Setup instructions are written for macOS but were exercised only on Linux.
* **Browsers:** Chromium headless shell only. File download, file picker and localStorage behaviour in Safari/Firefox/desktop Chrome are untested. Chromium's `file://` localStorage worked in the tests; other browsers may restrict `file://` storage — use `npm run serve` if so.
* **Accessibility:** keyboard operation, accessible names, visible focus and non-colour coding were tested automatically; there was no screen-reader run, no axe/Lighthouse audit, and no contrast measurement.
* **Real-world behaviour:** nothing here shows that any real source, sensor, network or clock behaves like the synthetic log. `synthetic_synchronized` is a label in the data, not a measurement.
* **Not done by design:** no detection, no trust/confidence/independence scores, no automatic linking of reports, no live feed, no Nexus/robot/cloud integration, no privacy transformation, no authentication, no signing or encryption of exports.
* **Spec §3 latitude I took:** future `observedAt` is flagged (not rejected); out-of-order files are sorted with a warning (not rejected); only duplicate IDs are rejected as ambiguous, identical-content duplicates under different IDs are kept with a warning.
* **Drop windows and synthetic heartbeats** are my interpretation of the optional "inject/drop" control. Drop windows act only on original-log heartbeats received strictly after the moment they were authored; injected heartbeats are stamped at the current T, so they change the state *at* T (and after) but never earlier results.
* **Bundle contents:** the built page contains Vite's standard modulepreload polyfill, which includes one `fetch(` call. It only runs for `<link rel="modulepreload">` elements, which the single-file build does not contain, and the build's CSP (`connect-src 'none'`) would block it. This is disclosed rather than hidden; the test allows exactly that one pattern and nothing else.
* **CSP is added by a post-build step** (`scripts/harden-dist.mjs`, run by npm's `postbuild` hook) because I did not edit `vite.config.ts`. If someone builds with `npx vite build` directly, the hook does not run and the CSP meta is absent (the app still makes no requests, but the browser-level guard is missing). The dev server has no CSP.
* **Dev server:** `npm run dev` forces `--host 127.0.0.1`. The supplied `vite.config.ts` contains no `server` block, so `npx vite` alone would use Vite's default (localhost) too; the handoff's `starting_point/vite.config.ts` instead had `host: "0.0.0.0", allowedHosts: true`, which I did not carry over.
* **Only one implementation:** the task describes two independent copies; I produced one and did not compare against any other.
* Reviewer notes and exports are plain text in plain JSON. Do not enter sensitive information.
