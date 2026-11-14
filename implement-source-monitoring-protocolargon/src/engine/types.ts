export const SCHEMA_VERSION = 'groundtruth-blindspot/v1' as const;
export const ENGINE_VERSION = '1.0.0' as const;
export const EXPORT_TOOL_NAME = 'GroundTruth-BlindSpot-Local-Prototype' as const;

export const MAX_IMPORT_BYTES = 1_048_576; // 1 MiB documented import size limit
export const MAX_SOURCES = 100;
export const MAX_DEPENDENCIES = 200;
export const MAX_EVENTS = 10_000;
export const MAX_NOTES = 1_000;
export const MAX_DURATION_SEC = 86_400;
export const MAX_THRESHOLD_SEC = 86_400;
export const MAX_TOLERANCE_SEC = 3_600;

export type DependencyKnowledge = 'complete' | 'partial' | 'unknown';

export type ClockQuality = 'synthetic_synchronized' | 'unverified' | 'unknown';

export type DataProvenance = 'synthetic' | 'user_provided';

export type HeartbeatStatus =
  | 'WAITING / UNKNOWN'
  | 'FRESH HEARTBEAT'
  | 'STALE / UNKNOWN';

export interface DependencyDefinition {
  id: string;
  name: string;
  category?: string;
  description?: string;
  declaredBy: string;
}

export interface SourceDefinition {
  id: string;
  name: string;
  description?: string;
  dependencyIds: string[];
  dependencyKnowledge: DependencyKnowledge;
  declarationProvenance: string;
}

export interface ComparisonKey {
  contextId: string;
  subject: string;
  property: string;
  unit: string;
}

export interface BaseScenarioEvent {
  id: string;
  sourceId: string;
  /**
   * Receiver virtual clock time in integer/finite nonnegative elapsed seconds.
   * All replay filtering is strictly causal on receivedAt <= T.
   */
  receivedAt: number;
  syntheticInjected?: boolean;
}

export interface HeartbeatEvent extends BaseScenarioEvent {
  type: 'heartbeat';
}

export interface ObservationEvent extends BaseScenarioEvent {
  type: 'observation';
  value: string;
  comparisonKey: ComparisonKey;
  /**
   * Source-claimed observation timestamp in elapsed seconds, or 'unknown'.
   * Independent of receivedAt. If numeric and observedAt > receivedAt, flagged as clock skew.
   */
  observedAt: number | 'unknown';
  clockQuality: ClockQuality;
  isBackfill?: boolean;
}

export type ScenarioEvent = HeartbeatEvent | ObservationEvent;

export interface ScenarioDefinition {
  schemaVersion: typeof SCHEMA_VERSION;
  scenarioId: string;
  title: string;
  description: string;
  dataProvenance: DataProvenance;
  /**
   * Time unit for virtualDuration, heartbeatThreshold, comparisonTolerance, receivedAt, and observedAt.
   * Conversion: 1 second = 1000 milliseconds.
   */
  timeUnit: 'seconds';
  virtualDuration: number;
  heartbeatThreshold: number;
  comparisonTolerance: number;
  dependencies: DependencyDefinition[];
  sources: SourceDefinition[];
  events: ScenarioEvent[];
}

export interface SyntheticConfig {
  injectedEvents: ScenarioEvent[];
  droppedEventIds: string[];
}

export interface ReviewerNote {
  id: string;
  authorAlias: string;
  recordedAtReplayT: number;
  createdAtIso: string;
  targetScope: string;
  text: string;
}

export interface DerivedObservationItem {
  eventId: string;
  sourceId: string;
  value: string;
  comparisonKey: ComparisonKey;
  receivedAt: number;
  receiveAge: number;
  observedAt: number | 'unknown';
  observationAge: number | 'unknown' | 'clock_skew';
  clockQuality: ClockQuality;
  clockSkew: boolean;
  isBackfill: boolean;
  isCurrentStepObservation: boolean;
  freshnessCaveat: string;
}

export interface DerivedSourceState {
  source: SourceDefinition;
  resolvedDependencies: DependencyDefinition[];
  status: HeartbeatStatus;
  statusExplanation: string;
  lastPacketReceivedAt: number | null;
  lastPacketReceiveAge: number | null;
  lastPacketEventId: string | null;
  lastHeartbeatReceivedAt: number | null;
  lastHeartbeatAge: number | null;
  lastHeartbeatEventId: string | null;
  lastObservation: DerivedObservationItem | null;
  observationHistory: DerivedObservationItem[];
}

export interface StateTransition {
  id: string;
  sourceId: string;
  sourceName: string;
  atT: number;
  fromStatus: HeartbeatStatus;
  toStatus: HeartbeatStatus;
  triggerType: 'heartbeat_received' | 'threshold_timeout' | 'heartbeat_recovery';
  triggerEventId: string | null;
  summary: string;
  uncertaintyCaveat: string;
}

export type PairwiseOverlapCategory =
  | 'DECLARED_OVERLAP'
  | 'DECLARED_OVERLAP_WITH_UNKNOWNS'
  | 'UNKNOWN_OR_PARTIAL_DECLARATIONS'
  | 'NO_OVERLAP_DECLARED_NOT_PROVEN_INDEPENDENT';

export interface PairwiseDependencyOverlap {
  pairKey: string;
  sourceAId: string;
  sourceAName: string;
  sourceAKnowledge: DependencyKnowledge;
  sourceBId: string;
  sourceBName: string;
  sourceBKnowledge: DependencyKnowledge;
  sharedDependencies: DependencyDefinition[];
  onlyInA: DependencyDefinition[];
  onlyInB: DependencyDefinition[];
  category: PairwiseOverlapCategory;
  headline: string;
  caveat: string;
  assertionProvenance: string;
}

export type ComparisonOutcomeStatus =
  | 'disagreement'
  | 'consistent_report'
  | 'not_comparable';

export interface ObservationComparisonResult {
  id: string;
  observationA: DerivedObservationItem;
  sourceAName: string;
  observationB: DerivedObservationItem;
  sourceBName: string;
  outcome: ComparisonOutcomeStatus;
  headline: string;
  reason: string;
  comparisonRuleSummary: string;
  isHistoricalAtCurrentT: boolean;
  historicalAgeSec: number | null;
  historicalCaveat: string;
  sharedDependencies: DependencyDefinition[];
  dependencyCaveat: string;
}

export interface DerivedReplaySnapshot {
  currentT: number;
  heartbeatThreshold: number;
  comparisonTolerance: number;
  sources: DerivedSourceState[];
  sourceMap: Record<string, DerivedSourceState>;
  transitions: StateTransition[];
  causalEventsUpToT: ScenarioEvent[];
  futureEventsCount: number;
  dependencyOverlaps: PairwiseDependencyOverlap[];
  comparisons: ObservationComparisonResult[];
  activeDisagreements: ObservationComparisonResult[];
  nonComparablePairs: ObservationComparisonResult[];
  silentOrWaitingSourceIds: string[];
  causalNotes: ReviewerNote[];
  hiddenFutureNotesCount: number;
  allNotesNonCausal: ReviewerNote[];
  wasSortedFromOutOfOrderInput: boolean;
}

export interface StoredDerivedSummarySnapshot {
  atT: number;
  sourceStatuses: Record<string, HeartbeatStatus>;
  transitionCount: number;
  disagreementCount: number;
}

export interface ExportedReplayRecord {
  schemaVersion: typeof SCHEMA_VERSION;
  engineVersion: typeof ENGINE_VERSION;
  exportedByTool: typeof EXPORT_TOOL_NAME;
  exportedAtIso: string;
  explicitLabels: {
    dataProvenance: DataProvenance;
    isSyntheticOrUserProvided: true;
    notVerifiedHardwareOrFieldData: true;
    privacyAndSecurityWarning: string;
  };
  derivationRules: {
    timeUnit: 'seconds';
    causalRule: string;
    tieBreakOrder: string;
    exactThresholdRule: string;
    observationDoesNotResetHeartbeat: true;
    disagreementRule: string;
  };
  replayPositionT: number;
  scenario: ScenarioDefinition;
  syntheticConfig: SyntheticConfig;
  reviewerNotes: ReviewerNote[];
  derivedSnapshotAtExportT?: StoredDerivedSummarySnapshot;
}

export interface ValidationErrorItem {
  path: string;
  message: string;
}

export interface ValidationSuccess<T> {
  ok: true;
  value: T;
  warnings: string[];
}

export interface ValidationFailure {
  ok: false;
  errors: ValidationErrorItem[];
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;
