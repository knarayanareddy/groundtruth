// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  createExportRecord,
  DEFAULT_SYNTHETIC_CONFIG,
  deriveDependencyOverlaps,
  deriveObservationComparisons,
  deriveReplaySnapshot,
  millisToSeconds,
  normalizeEvents,
  secondsToMillis,
} from '../src/engine/replayEngine';
import {
  ADAPTER_PROTOCOL_VERSION,
  advanceAdapterClock,
  createInitialAdapterState,
  deriveAdapterView,
  handleAdapterPollFailure,
  handleAdapterPollSuccess,
  setAdapterOptIn,
} from '../src/engine/localFeedAdapter';
import {
  clearSessionFromLocalStorage,
  loadSessionFromLocalStorage,
  saveSessionToLocalStorage,
} from '../src/engine/localStorageSession';
import {
  MAX_IMPORT_BYTES,
  ReviewerNote,
  ScenarioDefinition,
  ScenarioEvent,
} from '../src/engine/types';
import { serializeExportRecord, validateScenarioInput } from '../src/engine/validator';
import {
  CLOCK_AND_DEPENDENCY_EDGE_FIXTURE,
  REFERENCE_FIXTURE,
} from '../src/fixtures/referenceFixture';
import { GroundTruthBlindSpotView } from '../src/components/GroundTruthBlindSpotView';

describe('Section 8.1 — Deterministic Reference Fixture & Expected Snapshots (Section 4)', () => {
  it('verifies exact expected source states and timing separation at T=0, 2, 5, 6, 7, 10, 12', () => {
    // T = 0: A and B FRESH HEARTBEAT, C WAITING / UNKNOWN
    const s0 = deriveReplaySnapshot(REFERENCE_FIXTURE, 0);
    expect(s0.sourceMap['A'].status).toBe('FRESH HEARTBEAT');
    expect(s0.sourceMap['B'].status).toBe('FRESH HEARTBEAT');
    expect(s0.sourceMap['C'].status).toBe('WAITING / UNKNOWN');
    expect(s0.sourceMap['A'].lastHeartbeatReceivedAt).toBe(0);
    expect(s0.sourceMap['B'].lastHeartbeatReceivedAt).toBe(0);
    expect(s0.sourceMap['C'].lastHeartbeatReceivedAt).toBeNull();
    expect(s0.activeDisagreements).toHaveLength(0);

    // T = 2: Both original observation values (indicator=on vs indicator=off) and disagreement visible; C remains WAITING / UNKNOWN
    const s2 = deriveReplaySnapshot(REFERENCE_FIXTURE, 2);
    expect(s2.sourceMap['A'].status).toBe('FRESH HEARTBEAT');
    expect(s2.sourceMap['B'].status).toBe('FRESH HEARTBEAT');
    expect(s2.sourceMap['C'].status).toBe('WAITING / UNKNOWN');
    expect(s2.sourceMap['A'].lastObservation?.value).toBe('indicator=on');
    expect(s2.sourceMap['A'].lastObservation?.eventId).toBe('obs-A-2');
    expect(s2.sourceMap['B'].lastObservation?.value).toBe('indicator=off');
    expect(s2.sourceMap['B'].lastObservation?.eventId).toBe('obs-B-2');
    expect(s2.activeDisagreements).toHaveLength(1);
    const dis2 = s2.activeDisagreements[0];
    expect(dis2.observationA.value).toBe('indicator=on');
    expect(dis2.observationB.value).toBe('indicator=off');
    expect(dis2.isHistoricalAtCurrentT).toBe(false);
    expect(dis2.sharedDependencies.map((d) => d.id)).toEqual(['gateway-1']);

    // T = 5: A is FRESH HEARTBEAT (hb-A-5 at exact threshold 5 processed first); B is STALE / UNKNOWN (since lastHb=0, 5-0 >= 5); C unknown
    const s5 = deriveReplaySnapshot(REFERENCE_FIXTURE, 5);
    expect(s5.sourceMap['A'].status).toBe('FRESH HEARTBEAT');
    expect(s5.sourceMap['A'].lastHeartbeatReceivedAt).toBe(5);
    expect(s5.sourceMap['A'].lastHeartbeatAge).toBe(0);
    expect(s5.sourceMap['B'].status).toBe('STALE / UNKNOWN');
    expect(s5.sourceMap['B'].lastHeartbeatReceivedAt).toBe(0);
    expect(s5.sourceMap['B'].lastHeartbeatAge).toBe(5);
    expect(s5.sourceMap['C'].status).toBe('WAITING / UNKNOWN');
    // Verify B transitioned to STALE / UNKNOWN at exact boundary T=5, and A did NOT transition to stale at T=5
    const bStaleAt5 = s5.transitions.find(
      (t) => t.sourceId === 'B' && t.atT === 5 && t.toStatus === 'STALE / UNKNOWN'
    );
    expect(bStaleAt5).toBeDefined();
    const aStaleAt5 = s5.transitions.find(
      (t) => t.sourceId === 'A' && t.atT === 5 && t.toStatus === 'STALE / UNKNOWN'
    );
    expect(aStaleAt5).toBeUndefined();

    // T = 6: B receives historical backfill (obs-B-6-backfill, observedAt=1, receivedAt=6), remains STALE / UNKNOWN!
    const s6 = deriveReplaySnapshot(REFERENCE_FIXTURE, 6);
    expect(s6.sourceMap['B'].status).toBe('STALE / UNKNOWN');
    expect(s6.sourceMap['B'].lastPacketReceivedAt).toBe(6);
    expect(s6.sourceMap['B'].lastPacketReceiveAge).toBe(0);
    expect(s6.sourceMap['B'].lastHeartbeatReceivedAt).toBe(0);
    expect(s6.sourceMap['B'].lastHeartbeatAge).toBe(6);
    expect(s6.sourceMap['B'].lastObservation?.eventId).toBe('obs-B-6-backfill');
    expect(s6.sourceMap['B'].lastObservation?.observedAt).toBe(1);
    expect(s6.sourceMap['B'].lastObservation?.observationAge).toBe(5); // 6 - 1 = 5s
    expect(s6.sourceMap['B'].lastObservation?.receiveAge).toBe(0); // 6 - 6 = 0s
    expect(s6.sourceMap['B'].lastObservation?.isBackfill).toBe(true);
    // Earlier observation obs-B-2 is preserved in history, not overwritten
    expect(s6.sourceMap['B'].observationHistory.map((o) => o.eventId)).toEqual([
      'obs-B-2',
      'obs-B-6-backfill',
    ]);
    // Disagreement from T=2 remains visible as historical context (age 4s at T=6)
    expect(s6.activeDisagreements).toHaveLength(1);
    expect(s6.activeDisagreements[0].isHistoricalAtCurrentT).toBe(true);
    expect(s6.activeDisagreements[0].historicalAgeSec).toBe(4);

    // T = 7: B recovers heartbeat receipt via hb-B-7 -> FRESH HEARTBEAT
    const s7 = deriveReplaySnapshot(REFERENCE_FIXTURE, 7);
    expect(s7.sourceMap['B'].status).toBe('FRESH HEARTBEAT');
    expect(s7.sourceMap['B'].lastHeartbeatReceivedAt).toBe(7);
    expect(s7.sourceMap['B'].lastHeartbeatAge).toBe(0);
    const bRecAt7 = s7.transitions.find(
      (t) =>
        t.sourceId === 'B' &&
        t.atT === 7 &&
        t.fromStatus === 'STALE / UNKNOWN' &&
        t.toStatus === 'FRESH HEARTBEAT' &&
        t.triggerType === 'heartbeat_recovery'
    );
    expect(bRecAt7).toBeDefined();
    expect(bRecAt7?.uncertaintyCaveat).toContain('Recovery of heartbeat packet receipt only');

    // T = 10: A becomes STALE / UNKNOWN (last heartbeat at 5, 10 - 5 = 5 >= 5); B is FRESH HEARTBEAT (age 3); C WAITING / UNKNOWN
    const s10 = deriveReplaySnapshot(REFERENCE_FIXTURE, 10);
    expect(s10.sourceMap['A'].status).toBe('STALE / UNKNOWN');
    expect(s10.sourceMap['A'].lastHeartbeatAge).toBe(5);
    expect(s10.sourceMap['B'].status).toBe('FRESH HEARTBEAT');
    expect(s10.sourceMap['B'].lastHeartbeatAge).toBe(3);
    expect(s10.sourceMap['C'].status).toBe('WAITING / UNKNOWN');

    // T = 12: B also becomes STALE / UNKNOWN (last heartbeat at 7, 12 - 7 = 5 >= 5)
    const s12 = deriveReplaySnapshot(REFERENCE_FIXTURE, 12);
    expect(s12.sourceMap['A'].status).toBe('STALE / UNKNOWN');
    expect(s12.sourceMap['B'].status).toBe('STALE / UNKNOWN');
    expect(s12.sourceMap['B'].lastHeartbeatAge).toBe(5);
    expect(s12.sourceMap['C'].status).toBe('WAITING / UNKNOWN');
  });

  it('enforces strict causality: future events and future reviewer notes never leak into replay at T', () => {
    const snapAt1 = deriveReplaySnapshot(REFERENCE_FIXTURE, 1);
    expect(snapAt1.causalEventsUpToT.map((e) => e.id)).toEqual(['hb-A-0', 'hb-B-0']);
    expect(snapAt1.futureEventsCount).toBe(5);
    expect(snapAt1.sourceMap['A'].observationHistory).toHaveLength(0);
    expect(snapAt1.activeDisagreements).toHaveLength(0);

    // Perturbing future events (receivedAt > 4) cannot change any derived field at T=4
    const modifiedScenario: ScenarioDefinition = {
      ...REFERENCE_FIXTURE,
      events: [
        ...REFERENCE_FIXTURE.events,
        {
          id: 'future-hb-C-9',
          sourceId: 'C',
          receivedAt: 9,
          type: 'heartbeat',
        },
      ],
    };
    const origAt4 = deriveReplaySnapshot(REFERENCE_FIXTURE, 4);
    const modAt4 = deriveReplaySnapshot(modifiedScenario, 4);
    expect(modAt4.sourceMap).toEqual(origAt4.sourceMap);
    expect(modAt4.transitions).toEqual(origAt4.transitions);
    expect(modAt4.comparisons).toEqual(origAt4.comparisons);

    // Future reviewer notes (recordedAtReplayT > T) are filtered out of causalNotes
    const notes: ReviewerNote[] = [
      {
        id: 'n-early',
        authorAlias: 'tester',
        recordedAtReplayT: 2,
        createdAtIso: '2026-11-14T00:00:00Z',
        targetScope: 'general',
        text: 'Early note at T=2',
      },
      {
        id: 'n-future',
        authorAlias: 'tester',
        recordedAtReplayT: 8,
        createdAtIso: '2026-11-14T00:01:00Z',
        targetScope: 'general',
        text: 'Future note at T=8',
      },
    ];
    const snapNotesAt3 = deriveReplaySnapshot(
      REFERENCE_FIXTURE,
      3,
      DEFAULT_SYNTHETIC_CONFIG,
      notes
    );
    expect(snapNotesAt3.causalNotes.map((n) => n.id)).toEqual(['n-early']);
    expect(snapNotesAt3.hiddenFutureNotesCount).toBe(1);
  });

  it('flags future observedAt > receivedAt as clock skew and handles unknown/unverified clocks', () => {
    const snap = deriveReplaySnapshot(CLOCK_AND_DEPENDENCY_EDGE_FIXTURE, 5);
    const s2Obs = snap.sourceMap['S2'].lastObservation!;
    expect(s2Obs.clockSkew).toBe(true);
    expect(s2Obs.observationAge).toBe('clock_skew');
    expect(s2Obs.freshnessCaveat).toContain('CLOCK SKEW FLAGGED');

    const s3Obs = snap.sourceMap['S3'].lastObservation!;
    expect(s3Obs.clockQuality).toBe('unverified');
    expect(s3Obs.observationAge).toBe('unknown');
    expect(s3Obs.freshnessCaveat).toContain('Unverified/unknown source clock');

    // Neither skewed S2 nor unverified S3 can produce a valid comparison with S1
    expect(snap.activeDisagreements).toHaveLength(0);
    expect(snap.nonComparablePairs.length).toBeGreaterThanOrEqual(2);
    for (const nc of snap.nonComparablePairs) {
      expect(nc.reason).toContain('not comparable / insufficient information');
    }
  });
});

describe('Section 8.2 — Step/Play/Seek Equivalence, Out-of-Order Events & Deterministic Ordering', () => {
  it('produces identical snapshots and transitions whether T is reached by stepping, jumping, or rewinding', () => {
    // 1. Step 0 -> 1 -> 2 -> ... -> 10
    let steppedSnap = deriveReplaySnapshot(REFERENCE_FIXTURE, 0);
    for (let t = 1; t <= 10; t++) {
      steppedSnap = deriveReplaySnapshot(REFERENCE_FIXTURE, t);
    }

    // 2. Direct jump 0 -> 10
    const jumpedSnap = deriveReplaySnapshot(REFERENCE_FIXTURE, 10);

    // 3. Seek forward to 12, then rewind to 10
    const _at12 = deriveReplaySnapshot(REFERENCE_FIXTURE, 12);
    expect(_at12.currentT).toBe(12);
    const rewoundSnap = deriveReplaySnapshot(REFERENCE_FIXTURE, 10);

    expect(steppedSnap).toEqual(jumpedSnap);
    expect(rewoundSnap).toEqual(jumpedSnap);

    // Large jump to T=12 captures all 6 exact transitions (A@0, B@0, B stale@5, B rec@7, A stale@10, B stale@12)
    expect(_at12.transitions.map((tr) => `${tr.sourceId}@${tr.atT}:${tr.toStatus}`)).toEqual([
      'A@0:FRESH HEARTBEAT',
      'B@0:FRESH HEARTBEAT',
      'B@5:STALE / UNKNOWN',
      'B@7:FRESH HEARTBEAT',
      'A@10:STALE / UNKNOWN',
      'B@12:STALE / UNKNOWN',
    ]);
  });

  it('sorts out-of-order and same-timestamp events deterministically by (receivedAt ASC, id ASC)', () => {
    const scrambledEvents: ScenarioEvent[] = [
      ...REFERENCE_FIXTURE.events.slice().reverse(),
    ];
    const { sortedEvents, wasSortedFromOutOfOrderInput } = normalizeEvents(scrambledEvents);
    expect(wasSortedFromOutOfOrderInput).toBe(true);
    expect(sortedEvents.map((e) => e.id)).toEqual([
      'hb-A-0',
      'hb-B-0',
      'obs-A-2',
      'obs-B-2',
      'hb-A-5',
      'obs-B-6-backfill',
      'hb-B-7',
    ]);

    const scrambledScenario: ScenarioDefinition = {
      ...REFERENCE_FIXTURE,
      events: scrambledEvents,
    };
    expect(deriveReplaySnapshot(scrambledScenario, 6).sourceMap).toEqual(
      deriveReplaySnapshot(REFERENCE_FIXTURE, 6).sourceMap
    );
  });

  it('converts virtual seconds and milliseconds consistently', () => {
    expect(secondsToMillis(5)).toBe(5000);
    expect(millisToSeconds(5000)).toBe(5);
  });

  it('starts in WAITING / UNKNOWN when no heartbeat has arrived at T=0 and never relies on wall-clock time', () => {
    const delayedStartScenario: ScenarioDefinition = {
      ...REFERENCE_FIXTURE,
      events: [{ id: 'hb-A-3', sourceId: 'A', receivedAt: 3, type: 'heartbeat' }],
    };
    const at0 = deriveReplaySnapshot(delayedStartScenario, 0);
    expect(at0.sourceMap['A'].status).toBe('WAITING / UNKNOWN');
    expect(at0.sourceMap['B'].status).toBe('WAITING / UNKNOWN');
    expect(at0.sourceMap['C'].status).toBe('WAITING / UNKNOWN');
    expect(at0.transitions).toHaveLength(0);

    // Repeated derivations at the same T never duplicate transitions
    const firstAt7 = deriveReplaySnapshot(REFERENCE_FIXTURE, 7);
    const secondAt7 = deriveReplaySnapshot(REFERENCE_FIXTURE, 7);
    expect(firstAt7.transitions).toEqual(secondAt7.transitions);
    expect(firstAt7.transitions).toHaveLength(4);
  });

  it('includes explicit synthetic injected/dropped heartbeats in export and reproduces state on reimport', () => {
    const synConfig = {
      injectedEvents: [
        {
          id: 'syn-hb-B-6',
          sourceId: 'B',
          receivedAt: 6,
          type: 'heartbeat' as const,
          syntheticInjected: true,
        },
      ],
      droppedEventIds: ['hb-A-5'],
    };
    const snapAt6 = deriveReplaySnapshot(REFERENCE_FIXTURE, 6, synConfig, []);
    // Because hb-A-5 was synthetically dropped, A is STALE / UNKNOWN at T=6; because syn-hb-B-6 was injected at T=6, B is FRESH HEARTBEAT at T=6
    expect(snapAt6.sourceMap['A'].status).toBe('STALE / UNKNOWN');
    expect(snapAt6.sourceMap['B'].status).toBe('FRESH HEARTBEAT');

    const exported = createExportRecord(REFERENCE_FIXTURE, 6, synConfig, []);
    const validated = validateScenarioInput(serializeExportRecord(exported));
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      const reimportedSnap = deriveReplaySnapshot(
        validated.value.scenario,
        validated.value.replayPositionT,
        validated.value.syntheticConfig,
        validated.value.reviewerNotes
      );
      expect(reimportedSnap).toEqual(snapAt6);
    }
  });
});

describe('Section 8.3 — Dependency Overlap & Comparable Observation Disagreement Rules', () => {
  it('computes multi-dependency intersection, partial/unknown metadata, and never claims independence from disjoint labels', () => {
    const refOverlaps = deriveDependencyOverlaps(
      REFERENCE_FIXTURE.sources,
      REFERENCE_FIXTURE.dependencies
    );
    const ab = refOverlaps.find((o) => o.pairKey === 'A::B')!;
    expect(ab.category).toBe('DECLARED_OVERLAP');
    expect(ab.sharedDependencies.map((d) => d.id)).toEqual(['gateway-1']);
    expect(ab.caveat).toContain('NOT independent');

    const ac = refOverlaps.find((o) => o.pairKey === 'A::C')!;
    expect(ac.category).toBe('UNKNOWN_OR_PARTIAL_DECLARATIONS');
    expect(ac.caveat).toContain('NEVER establish independence');

    // Test disjoint complete declarations -> NO_OVERLAP_DECLARED_NOT_PROVEN_INDEPENDENT
    const disjointOverlaps = deriveDependencyOverlaps(
      [
        {
          id: 'X',
          name: 'Source X',
          dependencyIds: ['power-1'],
          dependencyKnowledge: 'complete',
          declarationProvenance: 'test',
        },
        {
          id: 'Y',
          name: 'Source Y',
          dependencyIds: ['power-2'],
          dependencyKnowledge: 'complete',
          declarationProvenance: 'test',
        },
      ],
      REFERENCE_FIXTURE.dependencies
    );
    expect(disjointOverlaps[0].category).toBe(
      'NO_OVERLAP_DECLARED_NOT_PROVEN_INDEPENDENT'
    );
    expect(disjointOverlaps[0].caveat).toContain(
      'Different IDs or disjoint declarations do not prove independent power'
    );

    // Multi-dependency overlap in diagnostic fixture
    const multiOverlaps = deriveDependencyOverlaps(
      CLOCK_AND_DEPENDENCY_EDGE_FIXTURE.sources,
      CLOCK_AND_DEPENDENCY_EDGE_FIXTURE.dependencies
    );
    const s1s2 = multiOverlaps.find((o) => o.pairKey === 'S1::S2')!;
    expect(s1s2.sharedDependencies.map((d) => d.id)).toEqual(['gateway-1', 'ups-rack-a']);
    expect(s1s2.category).toBe('DECLARED_OVERLAP_WITH_UNKNOWNS');
  });

  it('checks context, subject, property, unit, tolerance boundary, and unknown clocks for observation comparison', () => {
    const makeScenarioWithObs = (
      obsBOverrides: Partial<ScenarioEvent & { type: 'observation' }>,
      tolerance = 1
    ): ScenarioDefinition => ({
      ...REFERENCE_FIXTURE,
      comparisonTolerance: tolerance,
      events: [
        {
          id: 'obs-1',
          sourceId: 'A',
          receivedAt: 2,
          type: 'observation',
          value: 'val-A',
          comparisonKey: {
            contextId: 'ctx-1',
            subject: 'sub-1',
            property: 'prop-1',
            unit: 'unit-1',
          },
          observedAt: 2,
          clockQuality: 'synthetic_synchronized',
        },
        {
          id: 'obs-2',
          sourceId: 'B',
          receivedAt: 2,
          type: 'observation',
          value: 'val-B',
          comparisonKey: {
            contextId: 'ctx-1',
            subject: 'sub-1',
            property: 'prop-1',
            unit: 'unit-1',
          },
          observedAt: 2,
          clockQuality: 'synthetic_synchronized',
          ...obsBOverrides,
        },
      ],
    });

    // Within tolerance (|2 - 3| = 1 <= 1) -> comparable disagreement
    const withinTol = deriveReplaySnapshot(
      makeScenarioWithObs({ observedAt: 3, receivedAt: 3 }, 1),
      3
    );
    expect(withinTol.activeDisagreements).toHaveLength(1);

    // Outside tolerance (|2 - 4| = 2 > 1) -> not_comparable
    const outsideTol = deriveReplaySnapshot(
      makeScenarioWithObs({ observedAt: 4, receivedAt: 4 }, 1),
      4
    );
    expect(outsideTol.activeDisagreements).toHaveLength(0);
    expect(outsideTol.nonComparablePairs[0].reason).toContain(
      'not comparable / insufficient information'
    );

    // Different contextId -> not_comparable
    const diffCtx = deriveReplaySnapshot(
      makeScenarioWithObs({
        comparisonKey: {
          contextId: 'ctx-OTHER',
          subject: 'sub-1',
          property: 'prop-1',
          unit: 'unit-1',
        },
      }),
      2
    );
    expect(diffCtx.nonComparablePairs[0].reason).toContain('different comparison context');

    // Different unit -> not_comparable
    const diffUnit = deriveReplaySnapshot(
      makeScenarioWithObs({
        comparisonKey: {
          contextId: 'ctx-1',
          subject: 'sub-1',
          property: 'prop-1',
          unit: 'incompatible-unit',
        },
      }),
      2
    );
    expect(diffUnit.nonComparablePairs[0].reason).toContain('incompatible or missing units');

    // Unknown observedAt -> not_comparable
    const unknownObsAt = deriveReplaySnapshot(
      makeScenarioWithObs({ observedAt: 'unknown' }),
      2
    );
    expect(unknownObsAt.nonComparablePairs[0].reason).toContain(
      'missing or unknown source observation timestamp'
    );
  });
});

describe('Section 8.4 — Input Validation, All-or-Nothing Import, Snapshot Verification & Literal Plain-Text Rendering', () => {
  it('rejects malformed JSON, duplicate IDs, unresolved references, invalid enums, invalid times, oversized payloads, and invalid thresholds', () => {
    // 1. Malformed JSON
    const rMalformed = validateScenarioInput('{ bad json ');
    expect(rMalformed.ok).toBe(false);
    if (!rMalformed.ok) {
      expect(rMalformed.errors[0].path).toBe('root');
    }

    // 2. Oversized payload (> 1 MiB)
    const hugeString = 'x'.repeat(MAX_IMPORT_BYTES + 100);
    const rOversized = validateScenarioInput(hugeString);
    expect(rOversized.ok).toBe(false);
    if (!rOversized.ok) {
      expect(rOversized.errors[0].message).toContain('exceeds maximum limit');
    }

    // 3. Duplicate IDs, unresolved references, invalid threshold, invalid enum, negative time
    const badObj = {
      ...REFERENCE_FIXTURE,
      schemaVersion: 'wrong-version',
      heartbeatThreshold: 0,
      dependencies: [
        { id: 'dup-dep', name: 'Dep 1', declaredBy: 't' },
        { id: 'dup-dep', name: 'Dep 2', declaredBy: 't' },
      ],
      sources: [
        {
          id: 'A',
          name: 'Source A',
          dependencyIds: ['unresolved-dep-id'],
          dependencyKnowledge: 'invalid_enum',
          declarationProvenance: 't',
        },
        {
          id: 'A',
          name: 'Duplicate Source A',
          dependencyIds: [],
          dependencyKnowledge: 'complete',
          declarationProvenance: 't',
        },
      ],
      events: [
        {
          id: 'ev-1',
          sourceId: 'NON_EXISTENT_SRC',
          receivedAt: -5,
          type: 'heartbeat',
        },
        {
          id: 'ev-1',
          sourceId: 'A',
          receivedAt: 1,
          type: 'heartbeat',
        },
      ],
    };
    const rBad = validateScenarioInput(badObj);
    expect(rBad.ok).toBe(false);
    if (!rBad.ok) {
      const paths = rBad.errors.map((e) => e.path);
      expect(paths).toContain('schemaVersion');
      expect(paths).toContain('heartbeatThreshold');
      expect(paths).toContain('dependencies[1].id');
      expect(paths).toContain('sources[0].dependencyKnowledge');
      expect(paths).toContain('sources[0].dependencyIds[0]');
      expect(paths).toContain('sources[1].id');
      expect(paths).toContain('events[0].sourceId');
      expect(paths).toContain('events[0].receivedAt');
      expect(paths).toContain('events[1].id');
    }
  });

  it('recomputes state on import and flags a warning when derivedSnapshotAtExportT is tampered with', () => {
    const exported = createExportRecord(
      REFERENCE_FIXTURE,
      6,
      DEFAULT_SYNTHETIC_CONFIG,
      []
    );
    // Tamper with the stored snapshot to claim Source B is FRESH HEARTBEAT at T=6
    exported.derivedSnapshotAtExportT!.sourceStatuses['B'] = 'FRESH HEARTBEAT';
    const res = validateScenarioInput(serializeExportRecord(exported));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.snapshotMismatchWarning).toContain(
        'STORED SNAPSHOT MISMATCH DETECTED'
      );
      const recomputed = deriveReplaySnapshot(
        res.value.scenario,
        res.value.replayPositionT
      );
      expect(recomputed.sourceMap['B'].status).toBe('STALE / UNKNOWN');
    }
  });

  it('renders HTML/script strings in reviewer notes literally as plain text without executing', () => {
    window.localStorage.clear();
    render(<GroundTruthBlindSpotView />);

    const xssPayload = '<script>window.__xssExecuted = true;</script><img src=x onerror=alert(1)>';
    const noteInput = screen.getByTestId('note-text-input');
    fireEvent.change(noteInput, { target: { value: xssPayload } });
    fireEvent.click(screen.getByTestId('add-note-btn'));

    const noteTextEl = screen.getByTestId('note-text-note-T0-1');
    expect(noteTextEl.textContent).toBe(xssPayload);
    expect((window as unknown as Record<string, unknown>).__xssExecuted).toBeUndefined();
    expect(noteTextEl.querySelector('script')).toBeNull();
    expect(noteTextEl.querySelector('img')).toBeNull();
  });

  it('handles localStorage save, load, clear, and quota/access errors gracefully', () => {
    const failingStorage = {
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      getItem: () => {
        throw new Error('SecurityError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    const saveRes = saveSessionToLocalStorage(
      REFERENCE_FIXTURE,
      0,
      DEFAULT_SYNTHETIC_CONFIG,
      [],
      failingStorage
    );
    expect(saveRes.state).toBe('unavailable_or_denied');
    expect(saveRes.message).toContain('QuotaExceededError');

    const loadRes = loadSessionFromLocalStorage(failingStorage);
    expect(loadRes.bundle).toBeNull();
    expect(loadRes.status.state).toBe('unavailable_or_denied');

    const clearRes = clearSessionFromLocalStorage(failingStorage);
    expect(clearRes.state).toBe('unavailable_or_denied');
  });
});

describe('Section 8.6 — Separate Opt-In Local Feed Adapter State Machine (Simulated Harness)', () => {
  it('transitions from valid feed -> poll failure (immediately stale/unknown, advancing age, never falsely fresh) -> out-of-order rejection -> recovery', () => {
    let state = createInitialAdapterState(5);
    expect(deriveAdapterView(state).cardStatus).toBe('OPT_IN_DISABLED');

    state = setAdapterOptIn(state, true);
    expect(deriveAdapterView(state).cardStatus).toBe('WAITING_FOR_FIRST_PACKET');

    // 1. Successful poll at T=0 (seq 1)
    state = handleAdapterPollSuccess(state, 1, {
      protocol: ADAPTER_PROTOCOL_VERSION,
      sequenceNumber: 101,
      sourceId: 'NODE-1',
      sourceLabel: 'Test Node 1',
    });
    expect(deriveAdapterView(state).cardStatus).toBe('FRESH_HEARTBEAT_RECEIVED');
    expect(deriveAdapterView(state).snapshotAgeSec).toBe(0);

    // 2. Advance clock +2s and fail poll (seq 2) -> must immediately stop showing FRESH!
    state = advanceAdapterClock(state, 2);
    state = handleAdapterPollFailure(state, 2, 'HTTP 500 timeout');
    const failedView = deriveAdapterView(state);
    expect(failedView.cardStatus).toBe('DISCONNECTED_OR_POLL_FAILED_UNKNOWN');
    expect(failedView.isCachedDataStaleOrDisconnected).toBe(true);
    expect(failedView.snapshotAgeSec).toBe(2);

    // 3. Advance clock +4s -> snapshot age advances locally to 6s
    state = advanceAdapterClock(state, 4);
    expect(deriveAdapterView(state).snapshotAgeSec).toBe(6);

    // 4. Out-of-order callback (seq 1 <= highestCallbackSeq 2) cannot roll state backward to fresh!
    state = handleAdapterPollSuccess(state, 1, {
      protocol: ADAPTER_PROTOCOL_VERSION,
      sequenceNumber: 100,
      sourceId: 'NODE-1',
    });
    expect(state.ignoredOutOfOrderCallbacks).toBe(1);
    expect(deriveAdapterView(state).cardStatus).toBe(
      'DISCONNECTED_OR_POLL_FAILED_UNKNOWN'
    );

    // 5. Valid recovery callback (seq 3) at T=6s -> recovers and records 6s outage duration
    state = handleAdapterPollSuccess(state, 3, {
      protocol: ADAPTER_PROTOCOL_VERSION,
      sequenceNumber: 102,
      sourceId: 'NODE-1',
      sourceLabel: 'Test Node 1',
    });
    const recoveredView = deriveAdapterView(state);
    expect(recoveredView.cardStatus).toBe('FRESH_HEARTBEAT_RECEIVED');
    expect(state.recoveredAfterOutageDurationSec).toBe(6);
    expect(recoveredView.statusHeadline).toContain('RECOVERED AFTER 6s OUTAGE');
  });
});
