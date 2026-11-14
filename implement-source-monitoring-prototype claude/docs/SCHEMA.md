# Data schema and semantics (schemaVersion 1, engineVersion "1.0")

## Time
Integer **virtual elapsed seconds** (`timeUnit: "seconds"`) on the receiver clock, 0 ≤ t ≤ `durationSeconds` (1…86 400). Fractions and negatives are rejected. To use milliseconds, convert to seconds before import (not supported natively). The replay clock T is an integer in [0, duration].

## Scenario file (`schema: "groundtruth-blindspot-scenario"`)
Strict: unknown fields are rejected.

```jsonc
{
  "schema": "groundtruth-blindspot-scenario", "schemaVersion": 1, "engineVersion": "1.0",
  "meta": { "title": "...", "description": "...(optional)", "dataOrigin": "synthetic" | "user_provided" },
  "timeUnit": "seconds",
  "durationSeconds": 12,                    // 1..86400
  "heartbeatThresholdSeconds": 5,           // 1..3600
  "comparisonToleranceSeconds": 0,          // 0..3600, declared tolerance for the disagreement cue
  "observationRecencySeconds": 5,           // optional; default = heartbeatThresholdSeconds
  "dependencies": [ { "id": "gateway-1", "name": "human-readable name" } ],
  "sources": [ {
      "id": "A", "name": "unique name",
      "dependencyKnowledge": "complete" | "partial" | "unknown",
      "dependencyIds": ["gateway-1"],       // must reference dependencies[].id
      "dependencyDeclaredBy": "who asserted this list (human-provided metadata)"
  } ],
  "events": [
    { "id": "hb-A-0", "sourceId": "A", "receivedAt": 0, "type": "heartbeat" },
    { "id": "obs-A-2", "sourceId": "A", "receivedAt": 2, "type": "observation",
      "observation": {
        "comparisonKey": { "subject": "...", "property": "...", "unit": "none", "context": "..." },
        "value": "on" | null,               // null = value missing
        "observedAt": 2 | "unknown",        // source-claimed time
        "clockQuality": "synthetic_synchronized" | "unverified" | "unknown",
        "backfilled": false                 // optional, default false
      } }
  ]
}
```
IDs: `^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$`. Source IDs, dependency IDs and event IDs are each unique; source names and dependency names are unique (case-insensitive). Limits: ≤ 1 MiB, ≤ 50 sources, ≤ 100 dependencies, ≤ 5000 events, strings ≤ 200 chars.

The reference fixture is `fixtures/reference-fixture.json`.

## Ordering and causality
* Replay order: `receivedAt` ascending, then `id` by plain UTF-16 code-unit comparison (so `"B" < "a"`; no locale). Files may list events out of order: they are **sorted** (a warning shows how many were out of order) — nothing is rejected for ordering, and nothing is visible before its `receivedAt`.
* Duplicate IDs are rejected. Events with identical content but different IDs are kept and flagged with a warning ("possible duplicate delivery").
* All events with `receivedAt <= T` apply before state at T is derived. Events after T are not read by any display, note filter or comparison (tested by truncating the log).

## Heartbeat state at T (per source)
| State | Rule |
|---|---|
| `WAITING / UNKNOWN` | no heartbeat received by T |
| `FRESH HEARTBEAT` | `0 <= T - lastHeartbeatReceivedAt < threshold` |
| `STALE / UNKNOWN` | `T - lastHeartbeatReceivedAt >= threshold` |

Stale means "no recent heartbeat"; the cause is not established. Observations never change heartbeat state. A heartbeat at exactly `last + threshold` leaves the source fresh with no stale transition. Transitions: `WAITING→FRESH` at the first heartbeat; `FRESH→STALE` at `lastHeartbeat + threshold` (only if T has reached it); `STALE→FRESH` at the heartbeat time, labelled "recovery of heartbeat receipt". Computed analytically from the received heartbeats, so they are exact however T was reached and are never duplicated by re-rendering. No transition exists for a source that never sent a heartbeat.

## Observation timing (displayed separately from heartbeat)
* *receive age* = `T - receivedAt`; *observation age* = `T - observedAt` (only if `observedAt` is known and ≤ `receivedAt`); *receive lag* = `receivedAt - observedAt`.
* Timing label: `unknown_time` · `clock_skew_future` (observedAt > receivedAt; flagged, age not computed, never fresh, never compared) · `claimed_unverified_clock` (clock not `synthetic_synchronized`; never labelled fresh) · `backfilled_historical` · `recent_claimed` (age < recency) · `old_claimed`.
* All observation ages are claims by the source; `synthetic_synchronized` is a statement in the data, not a measured property.

## Dependencies
Declared metadata only. Pair status: **declared overlap** (shared IDs shown with who asserted them), **no overlap declared** (only when both lists are marked `complete`; explicitly not independence), or **unknown** (any partial/unknown knowledge). No score is computed.

## Disagreement cue
Two received observations from **different sources** are compared only if: identical `subject`, `property`, `context`; identical `unit` string ("compatible" = identical in v1); both values non-null; both clocks `synthetic_synchronized` with known, non-skewed `observedAt`; and `|Δ observedAt| <= comparisonToleranceSeconds` (boundary inclusive). Result: `reports differ` / `reports match` / `not comparable / insufficient information` with reasons. No winner is chosen. Pairs of one source's own reports are not compared. A source with no observation is listed as silent, never as an opposing report. Comparisons are flagged HISTORICAL when any report is backfilled, older than the recency window, or has unreliable timing.

## Synthetic additions (explicit, exported)
* `userSynthetic.events[]`: synthetic heartbeat `{id, sourceId, receivedAt, type:"heartbeat", synthetic:true, authoredAtT}` with `authoredAtT <= receivedAt`. The UI sets `receivedAt = T`.
* `userSynthetic.dropWindows[]`: `{id, sourceId, fromT, untilT, authoredAtT}`; original-log heartbeats of that source with `fromT <= receivedAt < untilT` are treated as not received (shown as DROPPED). Requires `fromT > authoredAtT` (cannot un-receive what was already seen). Does not affect synthetic heartbeats or observations.

## Exported record (`schema: "groundtruth-blindspot-record"`)
`schema, schemaVersion, engineVersion, tool{name,version}, labels[], derivationRules[], exportNotice, scenario (as loaded), userSynthetic, replay{currentT, speed ∈ {0.5,1,2,4}}, reviewerNotes[{id,text,authoredAtT,alias}], derivedSnapshot (informational), exportedAtWallClock (informational)`.
On import everything is revalidated and **recomputed**; `derivedSnapshot` is compared to the recomputation and a mismatch only produces a warning. `exportedAtWallClock` is the only wall-clock value and never enters derivation.
Notes: ≤ 200, ≤ 2000 chars, `alias` is an unauthenticated local label.
