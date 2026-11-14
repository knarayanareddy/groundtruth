// Versions, limits and fixed vocabularies. Pure data: no clocks, no randomness.

export const TOOL_NAME = "groundtruth-blindspot";
export const TOOL_VERSION = "1.0.0";
export const ENGINE_VERSION = "1.0";
export const SCHEMA_VERSION = 1;
export const SCENARIO_SCHEMA = "groundtruth-blindspot-scenario";
export const RECORD_SCHEMA = "groundtruth-blindspot-record";

export const LIMITS = {
  maxBytes: 1_048_576, // 1 MiB of UTF-8 text
  maxSources: 50,
  maxDependencies: 100,
  maxEvents: 5000,
  maxUserEvents: 500,
  maxDropWindows: 100,
  maxNotes: 200,
  maxStringLen: 200,
  maxDescriptionLen: 1000,
  maxNoteLen: 2000,
  maxDuration: 86_400,
  maxThreshold: 3600,
  maxTolerance: 3600,
  maxErrors: 50,
  maxComparisons: 500,
} as const;

export const SPEEDS = [0.5, 1, 2, 4] as const;

export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

export const DEPENDENCY_KNOWLEDGE = ["complete", "partial", "unknown"] as const;
export const CLOCK_QUALITY = ["synthetic_synchronized", "unverified", "unknown"] as const;
export const DATA_ORIGIN = ["synthetic", "user_provided"] as const;

/** Plain-language derivation rules embedded in every export (kept in sync with docs/SCHEMA.md). */
export const DERIVATION_RULES = [
  "Time is integer virtual elapsed seconds on the receiver clock. The replay clock T never reads the wall clock.",
  "Ordering: events sort by receivedAt ascending, then by event id (plain code-unit string comparison). All events with receivedAt <= T apply before state at T is computed.",
  "Heartbeat state at T: WAITING / UNKNOWN if no heartbeat has been received; FRESH HEARTBEAT if 0 <= T - lastHeartbeatReceivedAt < threshold; STALE / UNKNOWN if T - lastHeartbeatReceivedAt >= threshold.",
  "A heartbeat received exactly at lastHeartbeatReceivedAt + threshold is processed first, so the source is FRESH at that T.",
  "Observations never reset heartbeat freshness, including backfilled observations that were received recently.",
  "Transitions are computed analytically from the received heartbeats, at their exact boundary times (lastHeartbeat + threshold for staleness; the heartbeat time for recovery), regardless of how T was reached.",
  "Observation age = T - observedAt, shown only when observedAt is known and not later than receivedAt. It is reliable only under a synthetic_synchronized clock; otherwise it is a claimed age.",
  "observedAt later than receivedAt is flagged CLOCK SKEW; the event is kept, its age is not computed and it is never treated as fresh or comparable.",
  "Disagreement cue: two reports from different sources are comparable only if subject, property and context match exactly, units are identical strings, values are present, both clocks are synthetic_synchronized with known observedAt, and |observedAt difference| <= comparisonToleranceSeconds. Otherwise: not comparable / insufficient information. No winner is chosen.",
  "Dependencies are declared metadata. A shared declared dependency is shown with its ID and assertion source. 'No overlap declared' is never reported as independence, and unknown or partial knowledge stays unknown.",
  "User-injected synthetic heartbeats and drop windows are explicit synthetic entries in the export. Drop windows apply only to heartbeats of the original log received strictly after the moment they were authored.",
  "Reviewer notes are a separate, non-causal layer; during ordinary replay only notes with authoredAtT <= T are shown.",
];
