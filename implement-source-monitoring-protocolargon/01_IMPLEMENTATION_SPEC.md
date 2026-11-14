# Ground Truth + BlindSpot — implementation and acceptance specification

## 1. Purpose and non-negotiable boundaries

Build a usable **local-first source-monitoring and uncertainty-review prototype**. A human can replay simulated or locally imported event logs, see which source heartbeats are current or stale relative to a declared time threshold, distinguish received message timing from observation timing, examine known shared dependencies, and see limited explicitly comparable conflicting reports. The prototype does not detect threats or prove sensor operation, field coverage, source independence, a ground-truth fact, deception, jamming or safety. No automation of deployment or response decisions.

A working demo: load the provided multi-source fixture → start or step the simulation → see the source go from waiting to fresh, then stale/unknown and then fresh after a new heartbeat → keep a second source visible → inspect timeline and dependency overlap → inspect one simple disagreement → export the replay and a reviewer note → import in a clean session and reproduce the same transitions. Separately show invalid input being rejected without losing the existing session. Do this entirely locally after setup. This is a functional software demonstration; its data is synthetic, not physical hardware testing.

Do not present the old military detection claims, invented calibrations, `true independent groups`, Sybil conclusions, simulated hardware as connected, or the toy scrubber as privacy protection. Don't present a fresh heartbeat as calibrated measurements, an operating sensor, reliable coverage, or a cleared scene. Explicitly label outputs as synthetic or user-provided, never automatically verified. Do not ship the legacy inner `BenchmarkTacticalView` in the main workflow/bundle or merely put another warning above it; replace/remove it while keeping archived provenance. No real personal information, exact operational locations, credentials or private footage are included or needed.

## 2. Architecture and usability

Work from `starting_point/`. Reuse suitable existing React/Vite structure, not its fake data or unsafe assertions. Separate pure, deterministic state derivation from UI and file handling. The app must have a versioned event/scenario model, deterministic replay with a declared virtual clock, and a compact status dashboard and history derived from actual imported or generated events. No backend or database is required. Use TypeScript, React and locked dependencies; supply source, sample data, built app where practical and portable tests. Give keyboard operation, meaningful labels, readable timeline, responsive layout and statuses legible without color alone. Make it easy for the user on a Mac to run a single-file build or a documented loopback-only local server. Initial dependency or test-browser downloads may need internet; normal app use must make no external requests, analytics, fonts or CDN calls. No outward-facing default server.

## 3. Data, time, and status model

Provide a documented versioned JSON input and a real checked-in fixture with sources, explicit dependencies and a time-ordered event log. Use virtual elapsed milliseconds or seconds consistently; exact semantics and conversion must be documented. For ease of testing, the reference fixture below uses **integer elapsed seconds** and a threshold of 5 seconds. Each source has unique ID/name and a set of explicitly declared dependency IDs plus dependency knowledge `complete`, `partial`, or `unknown`; these are human-provided metadata, not proof of independence. Support overlap, not only one mutually exclusive group. Include a human-readable name for each dependency, with referential validation.

Each event has unique ID, source reference, `receivedAt` and type. At minimum support:
- `heartbeat`: an actual event in the log representing a received heartbeat, not a synthetic UI status. A current heartbeat only supports 'a heartbeat was received recently'.
- `observation`: a categorical source report with value, explicitly assigned comparison key (same subject/property/units if relevant), and source `observedAt` or `unknown`, plus clock-quality metadata (`synthetic_synchronized`, `unverified` or `unknown`). `receivedAt` is independent of observation time. This event is not automatically a heartbeat.

Log order and all decisions must be **causal**: at replay time T only events with `receivedAt <= T` can affect the current dashboard, claims, notes or state. Future events can appear only in a clearly separate post-hoc mode, if provided, never during ordinary replay. Stable ordering for same-time events must be documented (e.g. timestamp then ID), and all packets at T apply before calculating state at T. A future `observedAt` relative to `receivedAt` must be rejected or flagged as clock skew and not treated as fresh; specify deterministic behavior. Replayed events imported with out-of-order arrival times must be sorted by received time with stable ordering or rejected clearly; no arrival may rewrite earlier replay results as if known before it arrived.

Per-source heartbeat state at T:
- `WAITING / UNKNOWN`: no heartbeat received by T. Never show as fresh.
- `FRESH HEARTBEAT`: `0 <= T - lastHeartbeatReceivedAt < threshold`.
- `STALE / UNKNOWN`: `T - lastHeartbeatReceivedAt >= threshold`; timeout means no recent heartbeat, not established device failure or cause.

For a heartbeat at the exact stale threshold, process the new event first: status at T is fresh. Record a transition at its exact simulated boundary even if replay jumps over it; no fake initial or recovery event. An observation, including a recently received old backfill, must **not** reset heartbeat freshness. Display `last packet received`, `last heartbeat received`, `last observation source time`, source clock quality and observation age separately; clock-unverified/unknown observations cannot be labelled reliably fresh based on claimed time. Keep historical observations with their times rather than overwriting or calling them current. Observation age must not be confused with transport freshness. Status is relative to the visible virtual replay clock, not a frozen system timestamp.

The UI must include play, pause, step and seek with clear current T and speed; derived results must be identical whether T is reached by playing, seeking or stepping. Handle browser timer throttling, large jumps, rewind, pause, restart and changing input deterministically; show paused/stopped and do not present replay as live hardware. A UI control may inject/drop synthetic heartbeats, but such changes must be explicit synthetic events/configuration included in export, never a fake physical unplug. If omitted, the bundled fixture's real replay and import still satisfy acceptance.

## 4. Deterministic reference fixture and expected states

Check in one JSON fixture with virtual duration at least 12 seconds, threshold 5, and:

- Sources A and B both list `gateway-1`; A additionally lists `power-1`, B lists `power-2`, with known declarations. C has `unknown` dependency knowledge and no heartbeat. A and B share a **declared** dependency; C is not established independent, and different power labels do not prove independence.
- Heartbeats: A@0, B@0, A@5, B@7 (these are receiver times; unique event IDs). No others.
- Two generic comparable categorical observations received at 2, both claiming observation time 2 on a synthetic synchronized clock: A reports `indicator=on`, B reports `indicator=off`; same explicitly specified subject/property/unit and comparison context. They are a disagreement in reports, not proof which one is correct.
- One B historical observation, observed at 1 but received at 6, identified as backfilled. Its reception must not restore B's heartbeat freshness; its source observation age and receive age must remain distinct. Keep the already seen disagreement visible as historical context, not as a claim that the observation at time 2 remains current.

Expected snapshots after processing events at each T:
- T=0: A and B `FRESH HEARTBEAT`, C `WAITING / UNKNOWN`.
- T=2: both original observation values and their disagreement are visible with IDs and provenance; C remains unknown.
- T=5: A is fresh (event at exact threshold processed first); B `STALE / UNKNOWN` since last heartbeat 0; C unknown. B becomes stale exactly at T=5.
- T=6: B remains stale despite a new old observation. Last packet receipt and heartbeat time differ. No claim of new current source observation.
- T=7: B is fresh because a new heartbeat arrives; show a stale-to-fresh transition/recovery **of heartbeat receipt**, not proof that the sensor or monitored area recovered.
- T=10: A stale since its last heartbeat at 5; B fresh (age 3), C unknown. At T=12 B also becomes stale (last heartbeat at 7); exact threshold rule applies.

This is a simulated receiver-clock timeline, not tested hardware. A silent source cannot be counted as negative evidence about the environment. If notes exist, their recorded time must not expose user-entered future notes during ordinary historical replay; keep annotations in a separate explicitly non-causal layer or filter by authoring time.

## 5. Dependency and disagreement view

Display source metadata and declared dependency overlap pairwise or as a readable graph. Where two sources list the same dependency, show the matching ID and the assertion's source. Unknown or partial declarations remain unknown; `no overlap declared` is not proof of independent power, networks, provenance, modalities or failure modes. Do not calculate a single numeric independence score, confidence score, source trust or Brier rating.

Provide one limited, deterministic disagreement cue for **received observations** with the same explicitly assigned comparison context, same subject, property and compatible unit, and known comparable observation times within a declared tolerance. Show both raw claims, times, source IDs, comparison rule and dependency overlap; do not select a winner. If clocks are unverified, missing, values missing, context different, units incompatible, or outside tolerance, say `not comparable / insufficient information`. An unavailable or silent source is not an opposing observation. No automatic linking based only on proximity or unstated event identity. Mark old comparisons as historical using timestamps and clock-quality caveats. Avoid duplicating Fiber-Watch's full case-review product; this is a compact source-status cue.

## 6. Import, export and local data handling

- Validate entire input before replacing current state: required fields; schema/engine versions; unique source, dependency and event IDs; references; types/enums; comparison key; threshold bounds; valid intervals, timestamps and source-clock metadata; finite nonnegative values and documented size/count limits. Show path-specific errors. Define tie order and reject ambiguous duplicates; invalid, unsupported, malformed or oversized JSON must leave active replay/review intact.
- Treat all imported text as untrusted, render as plain text, never auto-fetch links or execute code. No remote service or account.
- Export a versioned JSON with original source definitions, dependencies, event log, thresholds, current replay position, user-added synthetic events/config if supported, explicit labels and local reviewer notes. Include tool and schema version and derivation rules. The app recomputes status and disagreement from events when imported; don't trust an arbitrary stored snapshot as current. Show warning on mismatch if derived snapshots are included. Recompute transitions, support clean reimport and return to the specified T. Clearly identify user notes and unauthenticated local aliases, if supported.
- Tell users exports may contain their text, are not anonymized/encrypted/signed, and initiate downloads without claiming they are safely stored. Don't use or promise a regex scrubber. If localStorage is used, state what is stored, expose a clear control, handle denied/quota errors, and show truthful save status. No previously fabricated notes or source scores.

## 7. Optional hardware extension — not required

Only if time and compatibility permit: design a separate opt-in local adapter for a **test-only** heartbeat feed from the user's device, with protocol/version and explicit user selection, input validation and clear disconnection behavior. It must not interact with robot flight, safety or control links. Do not assume that Atech Frame 10 or Frame 2.1 firmware, modules or serial features are confirmed. A synthetic event generator is not hardware-in-the-loop. If the agent cannot actually connect and test hardware, label any adapter untested; do not fabricate serial logs. The core acceptance and demo cannot depend on hardware or a specific browser serial API. Treat physical safety, electrical connections and testing permissions as outside what the prototype can certify.

## 8. Tests and evidence required

Implement portable automated unit tests and browser tests, pin dependencies, run them, and provide actual outputs and environment. At minimum test:
1. Every exact expected state/transition in section 4, threshold equality, C never reports, no derived future information, synthetic recovery only on heartbeat, transport vs heartbeat vs observation age, historical backfill, unknown/unverified/skewed clocks.
2. Step/play/seek equivalence, initial no-data, large forward jumps capturing threshold transition, reverse seek then replay, duplicate/delayed/out-of-order entries, same-time deterministic ordering, paused state and no use of wall clock in deterministic results. Do not create duplicate transitions on repeated renders.
3. Real dependency intersection with multi-dependency overlap, partial and unknown metadata; no claim of independence from disjoint or missing labels. Check discrepancy same/different context, property/unit, time-window boundary, unknown clock and absent observations; no auto-winner.
4. Malformed JSON, duplicate IDs, unresolved references, invalid enum/version, invalid time, oversized file and invalid threshold; assert all-or-nothing import. Test local text containing HTML renders literally without execution.
5. Browser end-to-end: fixture load → step/play and observe stale → recovery → inspect shared dependency and disagreement → export → clear/reset → import → same state and notes; error handling and clearing/persistence behavior. Test keyboard navigation and narrow viewport. Record/block all external requests throughout normal use and report results. Explain any one-time browser installation.
6. If any live polling/adapter is added, test successful feed → failures or disconnect → cached data visibly stale/unknown, local advancing age, no falsely fresh card → recovery; out-of-order callbacks cannot roll state backward. Label actual vs simulated adapter tests correctly.

Record commands, pass/fail and skipped tests, browser/OS/Node versions. Never assert Mac, hardware, network-security, field reliability or user testing unless actually performed. A test only establishes the properties it exercises.

## 9. Return deliverables

Return one ZIP per agent: runnable source, pinned lockfile, fixtures and portable tests, plus local build if feasible. `README.md`: Mac prerequisites and commands, offline mode, five-minute demo, data schema, replay/clock semantics, export/import and storage cleanup. `RESULTS_AND_LIMITATIONS.md`: PASS/PARTIAL/NOT IMPLEMENTED for every numbered section, evidence paths, real commands and actual observed output, limitations. `CHANGES_AND_PROVENANCE.md`: what baseline files were reused or replaced, dependencies and attribution. No fabricated physical connection, calibration, real-world incident, authentication, anonymity or verified system performance.
