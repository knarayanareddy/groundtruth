export type DependencyKnowledge = "complete" | "partial" | "unknown";
export type ClockQuality = "synthetic_synchronized" | "unverified" | "unknown";
export type DataOrigin = "synthetic" | "user_provided";

export interface Dependency {
  id: string;
  name: string;
}

export interface SourceDef {
  id: string;
  name: string;
  dependencyKnowledge: DependencyKnowledge;
  dependencyIds: string[];
  /** Who asserted the dependency list (human-provided metadata). */
  dependencyDeclaredBy: string;
}

export interface ComparisonKey {
  subject: string;
  property: string;
  unit: string;
  context: string;
}

export interface ObservationPayload {
  comparisonKey: ComparisonKey;
  /** Categorical claim; null means the value is missing. */
  value: string | null;
  /** Source-claimed observation time in virtual seconds, or "unknown". */
  observedAt: number | "unknown";
  clockQuality: ClockQuality;
  backfilled: boolean;
}

export interface HeartbeatEvent {
  id: string;
  sourceId: string;
  receivedAt: number;
  type: "heartbeat";
}

export interface ObservationEvent {
  id: string;
  sourceId: string;
  receivedAt: number;
  type: "observation";
  observation: ObservationPayload;
}

export type LogEvent = HeartbeatEvent | ObservationEvent;

export interface Scenario {
  schema: "groundtruth-blindspot-scenario";
  schemaVersion: 1;
  engineVersion: string;
  meta: { title: string; description: string; dataOrigin: DataOrigin };
  timeUnit: "seconds";
  durationSeconds: number;
  heartbeatThresholdSeconds: number;
  /** Optional; defaults to heartbeatThresholdSeconds. */
  observationRecencySeconds?: number;
  comparisonToleranceSeconds: number;
  dependencies: Dependency[];
  sources: SourceDef[];
  events: LogEvent[];
}

/** User-injected synthetic heartbeat (explicit, exported). */
export interface SyntheticHeartbeat extends HeartbeatEvent {
  synthetic: true;
  authoredAtT: number;
}

/** Synthetic drop window: original-log heartbeats of sourceId with fromT <= receivedAt < untilT are treated as not received. */
export interface DropWindow {
  id: string;
  sourceId: string;
  fromT: number;
  untilT: number;
  authoredAtT: number;
}

export interface UserSynthetic {
  events: SyntheticHeartbeat[];
  dropWindows: DropWindow[];
}

export interface ReviewerNote {
  id: string;
  text: string;
  authoredAtT: number;
  /** Unauthenticated local alias. Not an identity. */
  alias: string;
}

export type HeartbeatState = "WAITING_UNKNOWN" | "FRESH_HEARTBEAT" | "STALE_UNKNOWN";

export type ObservationTiming =
  | "unknown_time"
  | "clock_skew_future"
  | "claimed_unverified_clock"
  | "backfilled_historical"
  | "recent_claimed"
  | "old_claimed";

export interface EffectiveEvent {
  event: LogEvent;
  origin: "scenario" | "user_synthetic";
  dropped: boolean;
  dropWindowId?: string;
}

export interface Model {
  scenario: Scenario;
  user: UserSynthetic;
  /** All events (including dropped), sorted by (receivedAt, id). */
  events: EffectiveEvent[];
  sourceIndex: Map<string, number>;
  threshold: number;
  recency: number;
  tolerance: number;
}

export interface ObservationView {
  eventId: string;
  sourceId: string;
  receivedAt: number;
  receiveAge: number;
  observedAt: number | "unknown";
  /** null when unknown or skewed. */
  observationAge: number | null;
  /** receivedAt - observedAt, null when unknown or skewed. */
  receiveLag: number | null;
  clockQuality: ClockQuality;
  backfilled: boolean;
  timing: ObservationTiming;
  timingText: string;
  value: string | null;
  comparisonKey: ComparisonKey;
}

export interface SourceStatus {
  sourceId: string;
  name: string;
  heartbeatState: HeartbeatState;
  lastPacketReceivedAt: number | null;
  lastPacketEventId: string | null;
  lastHeartbeatReceivedAt: number | null;
  lastHeartbeatEventId: string | null;
  heartbeatAge: number | null;
  /** lastHeartbeat + threshold when stale; else null. */
  staleSince: number | null;
  heartbeatCount: number;
  droppedHeartbeatCount: number;
  observations: ObservationView[];
  lastObservationReceived: ObservationView | null;
  /** Newest valid claimed source time among received observations (not skewed, known). */
  newestClaimedObservedAt: number | null;
}

export type TransitionCause = "first_heartbeat" | "heartbeat_timeout" | "heartbeat_after_timeout";

export interface Transition {
  sourceId: string;
  sourceName: string;
  at: number;
  from: HeartbeatState;
  to: HeartbeatState;
  cause: TransitionCause;
  eventId: string | null;
  description: string;
}

export interface VisibleEvent {
  id: string;
  sourceId: string;
  receivedAt: number;
  type: "heartbeat" | "observation";
  origin: "scenario" | "user_synthetic";
  dropped: boolean;
  dropWindowId?: string;
  observation?: ObservationView;
}

export interface StateSegment {
  sourceId: string;
  from: number;
  to: number;
  state: HeartbeatState;
}

export interface DependencyPair {
  a: string;
  b: string;
  shared: { id: string; name: string }[];
  assertions: { sourceId: string; declaredBy: string }[];
  status: "declared_overlap" | "no_overlap_declared" | "unknown_or_partial";
  text: string;
}

export interface ObsRef {
  eventId: string;
  sourceId: string;
  value: string | null;
  observedAt: number | "unknown";
  receivedAt: number;
  clockQuality: ClockQuality;
  backfilled: boolean;
}

export interface Comparison {
  id: string;
  a: ObsRef;
  b: ObsRef;
  key: { subject: string; property: string; context: string; unitA: string; unitB: string };
  verdict: "reports_differ" | "reports_match" | "not_comparable";
  reasons: string[];
  historical: boolean;
  historicalText: string;
  dependencyText: string;
  sharedDependencies: { id: string; name: string }[];
  rule: string;
}

export interface NoSharedKey {
  sourceA: string;
  sourceB: string;
  text: string;
}

export interface Snapshot {
  T: number;
  sources: SourceStatus[];
  visibleEvents: VisibleEvent[];
  transitions: Transition[];
  segments: StateSegment[];
  comparisons: Comparison[];
  comparisonsTruncated: boolean;
  noSharedKey: NoSharedKey[];
  sourcesWithoutObservations: string[];
}
