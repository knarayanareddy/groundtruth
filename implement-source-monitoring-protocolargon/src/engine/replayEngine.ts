import {
  ComparisonOutcomeStatus,
  DependencyDefinition,
  DerivedObservationItem,
  DerivedReplaySnapshot,
  DerivedSourceState,
  ENGINE_VERSION,
  EXPORT_TOOL_NAME,
  ExportedReplayRecord,
  HeartbeatEvent,
  HeartbeatStatus,
  ObservationComparisonResult,
  ObservationEvent,
  PairwiseDependencyOverlap,
  PairwiseOverlapCategory,
  ReviewerNote,
  SCHEMA_VERSION,
  ScenarioDefinition,
  ScenarioEvent,
  SourceDefinition,
  StateTransition,
  StoredDerivedSummarySnapshot,
  SyntheticConfig,
} from './types';

export const DEFAULT_SYNTHETIC_CONFIG: SyntheticConfig = {
  injectedEvents: [],
  droppedEventIds: [],
};

/**
 * Deterministic tie-breaker comparator: receivedAt ascending, then id ascending (code-unit order).
 */
export function compareEventsDeterministically(a: ScenarioEvent, b: ScenarioEvent): number {
  if (a.receivedAt !== b.receivedAt) {
    return a.receivedAt - b.receivedAt;
  }
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

/**
 * Applies explicit synthetic drop/inject configuration and sorts events by (receivedAt ASC, id ASC).
 * Also reports whether the input event stream had out-of-order arrival timestamps.
 */
export function normalizeEvents(
  baseEvents: ScenarioEvent[],
  syntheticConfig: SyntheticConfig = DEFAULT_SYNTHETIC_CONFIG
): { sortedEvents: ScenarioEvent[]; wasSortedFromOutOfOrderInput: boolean } {
  const droppedSet = new Set(syntheticConfig.droppedEventIds);
  const combined: ScenarioEvent[] = [
    ...baseEvents.filter((e) => !droppedSet.has(e.id)),
    ...syntheticConfig.injectedEvents.filter((e) => !droppedSet.has(e.id)),
  ];

  // Deduplicate by event ID deterministically (keep first seen if caller passed duplicate in raw call)
  const seenIds = new Set<string>();
  const uniqueEvents: ScenarioEvent[] = [];
  for (const ev of combined) {
    if (!seenIds.has(ev.id)) {
      seenIds.add(ev.id);
      uniqueEvents.push(ev);
    }
  }

  let wasOutOfOrder = false;
  for (let i = 1; i < uniqueEvents.length; i++) {
    if (compareEventsDeterministically(uniqueEvents[i - 1], uniqueEvents[i]) > 0) {
      wasOutOfOrder = true;
      break;
    }
  }

  const sortedEvents = [...uniqueEvents].sort(compareEventsDeterministically);
  return { sortedEvents, wasSortedFromOutOfOrderInput: wasOutOfOrder };
}

/**
 * Converts virtual seconds to milliseconds (documented conversion: 1s = 1000ms).
 */
export function secondsToMillis(sec: number): number {
  return Math.round(sec * 1000);
}

/**
 * Converts virtual milliseconds to seconds.
 */
export function millisToSeconds(ms: number): number {
  return ms / 1000;
}

/**
 * Derives observation item metadata at current virtual clock T.
 */
export function deriveObservationAtT(
  ev: ObservationEvent,
  currentT: number
): DerivedObservationItem {
  const receiveAge = currentT - ev.receivedAt;
  const clockSkew =
    typeof ev.observedAt === 'number' && ev.observedAt > ev.receivedAt;
  const isBackfill =
    Boolean(ev.isBackfill) ||
    (typeof ev.observedAt === 'number' && ev.observedAt < ev.receivedAt);

  let observationAge: number | 'unknown' | 'clock_skew';
  if (clockSkew) {
    observationAge = 'clock_skew';
  } else if (ev.observedAt === 'unknown' || ev.clockQuality !== 'synthetic_synchronized') {
    observationAge = 'unknown';
  } else {
    observationAge = currentT - ev.observedAt;
  }

  const isCurrentStepObservation =
    !clockSkew &&
    ev.clockQuality === 'synthetic_synchronized' &&
    typeof ev.observedAt === 'number' &&
    ev.observedAt === currentT &&
    ev.receivedAt === currentT;

  let freshnessCaveat: string;
  if (clockSkew) {
    freshnessCaveat = `CLOCK SKEW FLAGGED: claimed observedAt (T+${String(ev.observedAt)}s) is in the future relative to receivedAt (T+${ev.receivedAt}s). Not treated as fresh or comparable.`;
  } else if (ev.observedAt === 'unknown') {
    freshnessCaveat = `Source observation timestamp is unknown (received at T+${ev.receivedAt}s, receive age ${receiveAge}s). Cannot label observation as fresh.`;
  } else if (ev.clockQuality !== 'synthetic_synchronized') {
    freshnessCaveat = `Clock quality is "${ev.clockQuality}" (claimed observedAt T+${ev.observedAt}s, received T+${ev.receivedAt}s). Unverified/unknown source clock cannot be labelled reliably fresh.`;
  } else if (isBackfill) {
    freshnessCaveat = `HISTORICAL BACKFILL: observed at T+${ev.observedAt}s (observation age ${currentT - ev.observedAt}s at T+${currentT}s), received at T+${ev.receivedAt}s (receive age ${receiveAge}s). Does not reset heartbeat or establish current status.`;
  } else if (currentT === ev.observedAt) {
    freshnessCaveat = `Reported at current replay step T+${currentT}s (synthetic synchronized clock; observation age 0s, receive age ${receiveAge}s). Synthetic report only, not verified ground truth.`;
  } else {
    freshnessCaveat = `Historical observation from T+${ev.observedAt}s (observation age ${currentT - ev.observedAt}s at T+${currentT}s, receive age ${receiveAge}s). Preserved as history, not current state.`;
  }

  return {
    eventId: ev.id,
    sourceId: ev.sourceId,
    value: ev.value,
    comparisonKey: ev.comparisonKey,
    receivedAt: ev.receivedAt,
    receiveAge,
    observedAt: ev.observedAt,
    observationAge,
    clockQuality: ev.clockQuality,
    clockSkew,
    isBackfill,
    isCurrentStepObservation,
    freshnessCaveat,
  };
}

/**
 * Computes exact causal state transitions for a single source up to virtual time T.
 * Only heartbeat events affect heartbeat status transitions.
 * Exact threshold boundary rule:
 * - For a heartbeat arriving at exact threshold (h_{i} === prevHb + threshold), process the new event first:
 *   status at that timestamp remains FRESH HEARTBEAT without a spurious stale transition.
 * - If no heartbeat arrives by prevHb + threshold and prevHb + threshold <= T, record an exact
 *   FRESH HEARTBEAT -> STALE / UNKNOWN transition at prevHb + threshold even if replay jumps over it.
 */
export function deriveSourceTransitionsUpToT(
  source: SourceDefinition,
  heartbeatsUpToT: HeartbeatEvent[],
  threshold: number,
  currentT: number
): StateTransition[] {
  const transitions: StateTransition[] = [];
  if (heartbeatsUpToT.length === 0) {
    return transitions;
  }

  // Group heartbeats by exact receivedAt timestamp (keep first deterministic event at each timestamp)
  const distinctHbByTime: HeartbeatEvent[] = [];
  for (const hb of heartbeatsUpToT) {
    const last = distinctHbByTime[distinctHbByTime.length - 1];
    if (!last || last.receivedAt !== hb.receivedAt) {
      distinctHbByTime.push(hb);
    }
  }

  let currentStatus: HeartbeatStatus = 'WAITING / UNKNOWN';

  for (let i = 0; i < distinctHbByTime.length; i++) {
    const hb = distinctHbByTime[i];
    if (i === 0) {
      // First heartbeat transitions WAITING / UNKNOWN -> FRESH HEARTBEAT
      transitions.push({
        id: `tr-${source.id}-hb-${hb.receivedAt}-${hb.id}`,
        sourceId: source.id,
        sourceName: source.name,
        atT: hb.receivedAt,
        fromStatus: 'WAITING / UNKNOWN',
        toStatus: 'FRESH HEARTBEAT',
        triggerType: 'heartbeat_received',
        triggerEventId: hb.id,
        summary: `${source.name}: WAITING / UNKNOWN → FRESH HEARTBEAT at T+${hb.receivedAt}s (heartbeat ${hb.id})`,
        uncertaintyCaveat:
          'Heartbeat packet received. Indicates transport receipt only — does not prove calibrated sensor operation or a clear environment.',
      });
      currentStatus = 'FRESH HEARTBEAT';
    } else {
      const prevHb = distinctHbByTime[i - 1];
      const staleBoundary = prevHb.receivedAt + threshold;

      if (hb.receivedAt > staleBoundary) {
        // Source crossed threshold before this heartbeat arrived -> exact boundary transition to STALE / UNKNOWN
        transitions.push({
          id: `tr-${source.id}-stale-${staleBoundary}`,
          sourceId: source.id,
          sourceName: source.name,
          atT: staleBoundary,
          fromStatus: 'FRESH HEARTBEAT',
          toStatus: 'STALE / UNKNOWN',
          triggerType: 'threshold_timeout',
          triggerEventId: null,
          summary: `${source.name}: FRESH HEARTBEAT → STALE / UNKNOWN at T+${staleBoundary}s (threshold ${threshold}s elapsed since heartbeat ${prevHb.id} at T+${prevHb.receivedAt}s)`,
          uncertaintyCaveat:
            'No heartbeat received within threshold. Indicates missing recent telemetry — does not establish device failure cause, jamming, or that the monitored scene is safe.',
        });
        currentStatus = 'STALE / UNKNOWN';

        // Then at hb.receivedAt, recovers heartbeat receipt: STALE / UNKNOWN -> FRESH HEARTBEAT
        transitions.push({
          id: `tr-${source.id}-rec-${hb.receivedAt}-${hb.id}`,
          sourceId: source.id,
          sourceName: source.name,
          atT: hb.receivedAt,
          fromStatus: 'STALE / UNKNOWN',
          toStatus: 'FRESH HEARTBEAT',
          triggerType: 'heartbeat_recovery',
          triggerEventId: hb.id,
          summary: `${source.name}: STALE / UNKNOWN → FRESH HEARTBEAT at T+${hb.receivedAt}s (heartbeat receipt recovery via ${hb.id})`,
          uncertaintyCaveat:
            'Recovery of heartbeat packet receipt only. Does not prove that the physical sensor is calibrated/operating correctly or that the monitored area recovered.',
        });
        currentStatus = 'FRESH HEARTBEAT';
      } else {
        // hb.receivedAt <= staleBoundary (including exact threshold equality hb.receivedAt === staleBoundary):
        // New heartbeat is processed first at T = hb.receivedAt, so status stays FRESH HEARTBEAT.
        currentStatus = 'FRESH HEARTBEAT';
      }
    }
  }

  // Check if threshold expired after the last heartbeat up to currentT
  const lastHb = distinctHbByTime[distinctHbByTime.length - 1];
  const finalStaleBoundary = lastHb.receivedAt + threshold;
  if (currentStatus === 'FRESH HEARTBEAT' && currentT >= finalStaleBoundary) {
    transitions.push({
      id: `tr-${source.id}-stale-${finalStaleBoundary}`,
      sourceId: source.id,
      sourceName: source.name,
      atT: finalStaleBoundary,
      fromStatus: 'FRESH HEARTBEAT',
      toStatus: 'STALE / UNKNOWN',
      triggerType: 'threshold_timeout',
      triggerEventId: null,
      summary: `${source.name}: FRESH HEARTBEAT → STALE / UNKNOWN at T+${finalStaleBoundary}s (threshold ${threshold}s elapsed since heartbeat ${lastHb.id} at T+${lastHb.receivedAt}s)`,
      uncertaintyCaveat:
        'No heartbeat received within threshold. Indicates missing recent telemetry — does not establish device failure cause, jamming, or that the monitored scene is safe.',
    });
  }

  return transitions;
}

/**
 * Computes pairwise dependency overlap and explicit uncertainty caveats for all pairs of sources.
 */
export function deriveDependencyOverlaps(
  sources: SourceDefinition[],
  dependencies: DependencyDefinition[]
): PairwiseDependencyOverlap[] {
  const depMap = new Map<string, DependencyDefinition>();
  for (const d of dependencies) {
    depMap.set(d.id, d);
  }

  const results: PairwiseDependencyOverlap[] = [];
  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      const a = sources[i];
      const b = sources[j];
      const aSet = new Set(a.dependencyIds);
      const bSet = new Set(b.dependencyIds);

      const sharedIds = a.dependencyIds.filter((id) => bSet.has(id));
      const onlyAIds = a.dependencyIds.filter((id) => !bSet.has(id));
      const onlyBIds = b.dependencyIds.filter((id) => !aSet.has(id));

      const sharedDependencies = sharedIds
        .map((id) => depMap.get(id))
        .filter((d): d is DependencyDefinition => Boolean(d));
      const onlyInA = onlyAIds
        .map((id) => depMap.get(id))
        .filter((d): d is DependencyDefinition => Boolean(d));
      const onlyInB = onlyBIds
        .map((id) => depMap.get(id))
        .filter((d): d is DependencyDefinition => Boolean(d));

      const hasUnknownOrPartial =
        a.dependencyKnowledge !== 'complete' || b.dependencyKnowledge !== 'complete';

      let category: PairwiseOverlapCategory;
      let headline: string;
      let caveat: string;

      if (sharedDependencies.length > 0) {
        const sharedListText = sharedDependencies
          .map((d) => `${d.id} (${d.name})`)
          .join(', ');
        if (hasUnknownOrPartial) {
          category = 'DECLARED_OVERLAP_WITH_UNKNOWNS';
          headline = `Declared dependency overlap: [${sharedListText}] (+ partial/unknown declarations)`;
          caveat = `Sources ${a.id} and ${b.id} explicitly share [${sharedListText}]. Additionally, dependency knowledge is (${a.id}: ${a.dependencyKnowledge}, ${b.id}: ${b.dependencyKnowledge}), so further undeclared shared failure points may exist.`;
        } else {
          category = 'DECLARED_OVERLAP';
          headline = `Declared dependency overlap: [${sharedListText}]`;
          caveat = `Sources ${a.id} and ${b.id} both declare [${sharedListText}]. Even where other declared labels differ (${onlyInA.map((d) => d.id).join(', ') || 'none'} vs ${onlyInB.map((d) => d.id).join(', ') || 'none'}), they share a declared common dependency and are NOT independent.`;
        }
      } else if (hasUnknownOrPartial) {
        category = 'UNKNOWN_OR_PARTIAL_DECLARATIONS';
        headline = `Unknown / insufficient dependency information (${a.id}: ${a.dependencyKnowledge}, ${b.id}: ${b.dependencyKnowledge})`;
        caveat = `No shared dependency ID is listed, but dependency declarations are incomplete or unknown (${a.id}: ${a.dependencyKnowledge}, ${b.id}: ${b.dependencyKnowledge}). Unknown declarations remain unknown and NEVER establish independence.`;
      } else {
        category = 'NO_OVERLAP_DECLARED_NOT_PROVEN_INDEPENDENT';
        headline = `No overlap declared in metadata (independence NOT established)`;
        caveat = `Sources ${a.id} and ${b.id} list disjoint declared dependency IDs, but these are human-provided labels only. Different IDs or disjoint declarations do not prove independent power, network routing, hardware provenance, sensor modality, or failure modes.`;
      }

      results.push({
        pairKey: `${a.id}::${b.id}`,
        sourceAId: a.id,
        sourceAName: a.name,
        sourceAKnowledge: a.dependencyKnowledge,
        sourceBId: b.id,
        sourceBName: b.name,
        sourceBKnowledge: b.dependencyKnowledge,
        sharedDependencies,
        onlyInA,
        onlyInB,
        category,
        headline,
        caveat,
        assertionProvenance: `${a.id}: "${a.declarationProvenance}" · ${b.id}: "${b.declarationProvenance}"`,
      });
    }
  }

  return results;
}

/**
 * Evaluates comparability and disagreement between two received observations from distinct sources.
 */
export function evaluateObservationPair(
  obsA: DerivedObservationItem,
  sourceA: SourceDefinition,
  obsB: DerivedObservationItem,
  sourceB: SourceDefinition,
  tolerance: number,
  currentT: number,
  overlap: PairwiseDependencyOverlap | undefined
): ObservationComparisonResult {
  const sharedDependencies = overlap ? overlap.sharedDependencies : [];
  const dependencyCaveat = overlap
    ? overlap.caveat
    : 'Dependency relationship unknown; independence is not established.';

  const ruleSummary = `Rule: same contextId ("${obsA.comparisonKey.contextId}"), subject ("${obsA.comparisonKey.subject}"), property ("${obsA.comparisonKey.property}"), unit ("${obsA.comparisonKey.unit}"), synthetic_synchronized clocks without skew, and |observedAt_A - observedAt_B| <= ${tolerance}s tolerance.`;

  const fail = (reason: string): ObservationComparisonResult => ({
    id: `cmp-${obsA.eventId}-${obsB.eventId}`,
    observationA: obsA,
    sourceAName: sourceA.name,
    observationB: obsB,
    sourceBName: sourceB.name,
    outcome: 'not_comparable',
    headline: 'not comparable / insufficient information',
    reason: `not comparable / insufficient information — ${reason}`,
    comparisonRuleSummary: ruleSummary,
    isHistoricalAtCurrentT: true,
    historicalAgeSec: null,
    historicalCaveat:
      'Cannot form a valid synchronized comparison due to missing, incompatible, unverified, or out-of-window metadata.',
    sharedDependencies,
    dependencyCaveat,
  });

  if (!obsA.value.trim() || !obsB.value.trim()) {
    return fail('missing observation value on one or both reports.');
  }

  if (obsA.comparisonKey.contextId !== obsB.comparisonKey.contextId) {
    return fail(
      `different comparison context ("${obsA.comparisonKey.contextId}" vs "${obsB.comparisonKey.contextId}").`
    );
  }

  if (
    obsA.comparisonKey.subject !== obsB.comparisonKey.subject ||
    obsA.comparisonKey.property !== obsB.comparisonKey.property
  ) {
    return fail(
      `different subject/property ("${obsA.comparisonKey.subject}.${obsA.comparisonKey.property}" vs "${obsB.comparisonKey.subject}.${obsB.comparisonKey.property}").`
    );
  }

  if (
    !obsA.comparisonKey.unit.trim() ||
    !obsB.comparisonKey.unit.trim() ||
    obsA.comparisonKey.unit !== obsB.comparisonKey.unit
  ) {
    return fail(
      `incompatible or missing units ("${obsA.comparisonKey.unit}" vs "${obsB.comparisonKey.unit}").`
    );
  }

  if (obsA.clockSkew || obsB.clockSkew) {
    return fail(
      'clock skew detected (claimed observedAt is in the future relative to receivedAt).'
    );
  }

  if (typeof obsA.observedAt !== 'number' || typeof obsB.observedAt !== 'number') {
    return fail('missing or unknown source observation timestamp (observedAt is "unknown").');
  }

  if (
    obsA.clockQuality !== 'synthetic_synchronized' ||
    obsB.clockQuality !== 'synthetic_synchronized'
  ) {
    return fail(
      `unverified or unknown source clock quality (${sourceA.id}: "${obsA.clockQuality}", ${sourceB.id}: "${obsB.clockQuality}").`
    );
  }

  const delta = Math.abs(obsA.observedAt - obsB.observedAt);
  if (delta > tolerance) {
    return fail(
      `observation times (T+${obsA.observedAt}s vs T+${obsB.observedAt}s, |Δt| = ${delta}s) exceed declared tolerance of ${tolerance}s.`
    );
  }

  const refObservedAt = Math.min(obsA.observedAt, obsB.observedAt);
  const historicalAgeSec = currentT - refObservedAt;
  const isHistoricalAtCurrentT = historicalAgeSec > 0;

  const historicalCaveat = isHistoricalAtCurrentT
    ? `HISTORICAL COMPARISON (observed at T+${refObservedAt}s, observation age ${historicalAgeSec}s at T+${currentT}s; synthetic synchronized clock). Kept visible as historical context — NOT a claim that the observation at T+${refObservedAt}s remains current.`
    : `Current-step comparison at T+${currentT}s (observation age 0s on synthetic synchronized clock).`;

  const outcome: ComparisonOutcomeStatus =
    obsA.value !== obsB.value ? 'disagreement' : 'consistent_report';

  const headline =
    outcome === 'disagreement'
      ? `Comparable Report Disagreement: ${sourceA.id} reports "${obsA.value}" vs ${sourceB.id} reports "${obsB.value}" (No Winner Selected)`
      : `Comparable Reports Match: ${sourceA.id} and ${sourceB.id} both report "${obsA.value}" (Not Proof of Ground Truth)`;

  const reason =
    outcome === 'disagreement'
      ? `Both observations share context "${obsA.comparisonKey.contextId}", subject "${obsA.comparisonKey.subject}", property "${obsA.comparisonKey.property}", unit "${obsA.comparisonKey.unit}", and synchronized observation time T+${obsA.observedAt}s (|Δt| = ${delta}s <= ${tolerance}s). Conflicting values are shown side-by-side without selecting a winner.`
      : `Both observations match on comparison key and observation time (|Δt| = ${delta}s <= ${tolerance}s). Agreement between synthetic or shared-dependency sources does not establish ground truth.`;

  return {
    id: `cmp-${obsA.eventId}-${obsB.eventId}`,
    observationA: obsA,
    sourceAName: sourceA.name,
    observationB: obsB,
    sourceBName: sourceB.name,
    outcome,
    headline,
    reason,
    comparisonRuleSummary: ruleSummary,
    isHistoricalAtCurrentT,
    historicalAgeSec,
    historicalCaveat,
    sharedDependencies,
    dependencyCaveat,
  };
}

/**
 * Derives all pairwise observation comparisons among received observations up to T.
 */
export function deriveObservationComparisons(
  sources: DerivedSourceState[],
  dependencyOverlaps: PairwiseDependencyOverlap[],
  tolerance: number,
  currentT: number
): ObservationComparisonResult[] {
  const overlapMap = new Map<string, PairwiseDependencyOverlap>();
  for (const ov of dependencyOverlaps) {
    overlapMap.set(`${ov.sourceAId}::${ov.sourceBId}`, ov);
    overlapMap.set(`${ov.sourceBId}::${ov.sourceAId}`, ov);
  }

  const comparisons: ObservationComparisonResult[] = [];
  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      const srcA = sources[i];
      const srcB = sources[j];
      const overlap = overlapMap.get(`${srcA.source.id}::${srcB.source.id}`);

      for (const obsA of srcA.observationHistory) {
        for (const obsB of srcB.observationHistory) {
          comparisons.push(
            evaluateObservationPair(
              obsA,
              srcA.source,
              obsB,
              srcB.source,
              tolerance,
              currentT,
              overlap
            )
          );
        }
      }
    }
  }

  return comparisons;
}

/**
 * Pure, deterministic derivation of the entire dashboard state at virtual replay time T.
 * Never reads wall-clock time (Date.now / performance.now).
 * Strictly causal: only events with receivedAt <= currentT can influence any derived field.
 */
export function deriveReplaySnapshot(
  scenario: ScenarioDefinition,
  rawCurrentT: number,
  syntheticConfig: SyntheticConfig = DEFAULT_SYNTHETIC_CONFIG,
  reviewerNotes: ReviewerNote[] = []
): DerivedReplaySnapshot {
  const currentT = Math.max(0, rawCurrentT);
  const { sortedEvents, wasSortedFromOutOfOrderInput } = normalizeEvents(
    scenario.events,
    syntheticConfig
  );

  // Strict causal filter: only events with receivedAt <= currentT
  const causalEventsUpToT = sortedEvents.filter((ev) => ev.receivedAt <= currentT);
  const futureEventsCount = sortedEvents.length - causalEventsUpToT.length;

  const depMap = new Map<string, DependencyDefinition>();
  for (const d of scenario.dependencies) {
    depMap.set(d.id, d);
  }

  const derivedSources: DerivedSourceState[] = [];
  const sourceMap: Record<string, DerivedSourceState> = {};
  const allTransitions: StateTransition[] = [];

  for (const src of scenario.sources) {
    const srcEvents = causalEventsUpToT.filter((ev) => ev.sourceId === src.id);
    const srcHeartbeats = srcEvents.filter(
      (ev): ev is HeartbeatEvent => ev.type === 'heartbeat'
    );
    const srcObservations = srcEvents.filter(
      (ev): ev is ObservationEvent => ev.type === 'observation'
    );

    const lastPacket = srcEvents.length > 0 ? srcEvents[srcEvents.length - 1] : null;
    const lastHeartbeat =
      srcHeartbeats.length > 0 ? srcHeartbeats[srcHeartbeats.length - 1] : null;

    let status: HeartbeatStatus;
    let statusExplanation: string;

    if (!lastHeartbeat) {
      status = 'WAITING / UNKNOWN';
      statusExplanation =
        srcEvents.length === 0
          ? `No packets or heartbeats received by T+${currentT}s. Source availability and monitored condition are unknown (never treated as fresh or clear).`
          : `Observation packet received at T+${lastPacket!.receivedAt}s, but zero heartbeats received by T+${currentT}s. Status remains WAITING / UNKNOWN.`;
    } else {
      const hbAge = currentT - lastHeartbeat.receivedAt;
      if (hbAge >= 0 && hbAge < scenario.heartbeatThreshold) {
        status = 'FRESH HEARTBEAT';
        statusExplanation = `Heartbeat ${lastHeartbeat.id} received at T+${lastHeartbeat.receivedAt}s (age ${hbAge}s < ${scenario.heartbeatThreshold}s threshold). Only establishes recent heartbeat receipt — not sensor calibration or scene safety.`;
      } else {
        status = 'STALE / UNKNOWN';
        statusExplanation = `Last heartbeat (${lastHeartbeat.id}) was at T+${lastHeartbeat.receivedAt}s (age ${hbAge}s >= ${scenario.heartbeatThreshold}s threshold). Silence means no recent heartbeat; it does not establish device failure cause or a clear area.`;
      }
    }

    const observationHistory = srcObservations.map((obs) =>
      deriveObservationAtT(obs, currentT)
    );
    const lastObservation =
      observationHistory.length > 0
        ? observationHistory[observationHistory.length - 1]
        : null;

    const resolvedDependencies = src.dependencyIds
      .map((id) => depMap.get(id))
      .filter((d): d is DependencyDefinition => Boolean(d));

    const sourceState: DerivedSourceState = {
      source: src,
      resolvedDependencies,
      status,
      statusExplanation,
      lastPacketReceivedAt: lastPacket ? lastPacket.receivedAt : null,
      lastPacketReceiveAge: lastPacket ? currentT - lastPacket.receivedAt : null,
      lastPacketEventId: lastPacket ? lastPacket.id : null,
      lastHeartbeatReceivedAt: lastHeartbeat ? lastHeartbeat.receivedAt : null,
      lastHeartbeatAge: lastHeartbeat ? currentT - lastHeartbeat.receivedAt : null,
      lastHeartbeatEventId: lastHeartbeat ? lastHeartbeat.id : null,
      lastObservation,
      observationHistory,
    };

    derivedSources.push(sourceState);
    sourceMap[src.id] = sourceState;

    const srcTransitions = deriveSourceTransitionsUpToT(
      src,
      srcHeartbeats,
      scenario.heartbeatThreshold,
      currentT
    );
    allTransitions.push(...srcTransitions);
  }

  // Sort transitions chronologically by atT ASC, then sourceId ASC, then id ASC
  allTransitions.sort((a, b) => {
    if (a.atT !== b.atT) return a.atT - b.atT;
    if (a.sourceId !== b.sourceId) return a.sourceId < b.sourceId ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const dependencyOverlaps = deriveDependencyOverlaps(
    scenario.sources,
    scenario.dependencies
  );

  const comparisons = deriveObservationComparisons(
    derivedSources,
    dependencyOverlaps,
    scenario.comparisonTolerance,
    currentT
  );

  const activeDisagreements = comparisons.filter((c) => c.outcome === 'disagreement');
  const nonComparablePairs = comparisons.filter((c) => c.outcome === 'not_comparable');

  const silentOrWaitingSourceIds = derivedSources
    .filter((s) => s.observationHistory.length === 0)
    .map((s) => s.source.id);

  // Causal filtering of reviewer notes: only notes with recordedAtReplayT <= currentT appear in causal replay
  const sortedNotes = [...reviewerNotes].sort((a, b) => {
    if (a.recordedAtReplayT !== b.recordedAtReplayT) {
      return a.recordedAtReplayT - b.recordedAtReplayT;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const causalNotes = sortedNotes.filter((n) => n.recordedAtReplayT <= currentT);
  const hiddenFutureNotesCount = sortedNotes.length - causalNotes.length;

  return {
    currentT,
    heartbeatThreshold: scenario.heartbeatThreshold,
    comparisonTolerance: scenario.comparisonTolerance,
    sources: derivedSources,
    sourceMap,
    transitions: allTransitions,
    causalEventsUpToT,
    futureEventsCount,
    dependencyOverlaps,
    comparisons,
    activeDisagreements,
    nonComparablePairs,
    silentOrWaitingSourceIds,
    causalNotes,
    hiddenFutureNotesCount,
    allNotesNonCausal: sortedNotes,
    wasSortedFromOutOfOrderInput,
  };
}

/**
 * Computes the compact summary snapshot for export verification.
 */
export function buildSummarySnapshot(
  snapshot: DerivedReplaySnapshot
): StoredDerivedSummarySnapshot {
  const sourceStatuses: Record<string, HeartbeatStatus> = {};
  for (const s of snapshot.sources) {
    sourceStatuses[s.source.id] = s.status;
  }
  return {
    atT: snapshot.currentT,
    sourceStatuses,
    transitionCount: snapshot.transitions.length,
    disagreementCount: snapshot.activeDisagreements.length,
  };
}

/**
 * Generates a reproducible, versioned JSON export record.
 */
export function createExportRecord(
  scenario: ScenarioDefinition,
  replayPositionT: number,
  syntheticConfig: SyntheticConfig = DEFAULT_SYNTHETIC_CONFIG,
  reviewerNotes: ReviewerNote[] = [],
  exportedAtIso: string = new Date().toISOString()
): ExportedReplayRecord {
  const derived = deriveReplaySnapshot(
    scenario,
    replayPositionT,
    syntheticConfig,
    reviewerNotes
  );

  return {
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    exportedByTool: EXPORT_TOOL_NAME,
    exportedAtIso,
    explicitLabels: {
      dataProvenance: scenario.dataProvenance,
      isSyntheticOrUserProvided: true,
      notVerifiedHardwareOrFieldData: true,
      privacyAndSecurityWarning:
        'WARNING: This export contains plain-text scenario data, local reviewer notes, and unauthenticated local aliases. It is NOT anonymized, scrubbed, encrypted, or cryptographically signed. Do not enter or distribute sensitive personal or operational information.',
    },
    derivationRules: {
      timeUnit: 'seconds',
      causalRule:
        'At virtual clock T, only events with receivedAt <= T affect source statuses, observations, transitions, or comparisons.',
      tieBreakOrder: 'receivedAt ascending, then event.id ascending (code-unit order).',
      exactThresholdRule:
        'Heartbeats at receivedAt <= T are applied before evaluating staleness: 0 <= T - lastHeartbeatReceivedAt < heartbeatThreshold is FRESH HEARTBEAT; T - lastHeartbeatReceivedAt >= heartbeatThreshold is STALE / UNKNOWN.',
      observationDoesNotResetHeartbeat: true,
      disagreementRule:
        'Observations from distinct sources are comparable only when contextId, subject, property, and unit match, both have numeric non-skewed observedAt with clockQuality="synthetic_synchronized", and |observedAt_A - observedAt_B| <= comparisonTolerance.',
    },
    replayPositionT: derived.currentT,
    scenario,
    syntheticConfig,
    reviewerNotes,
    derivedSnapshotAtExportT: buildSummarySnapshot(derived),
  };
}
