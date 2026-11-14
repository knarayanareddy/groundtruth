import { ScenarioDefinition } from '../engine/types';
import rawReferenceFixture from '../../fixtures/reference-fixture.json';

export const REFERENCE_FIXTURE: ScenarioDefinition = rawReferenceFixture as ScenarioDefinition;

/**
 * Additional synthetic scenario demonstrating clock skew (observedAt > receivedAt),
 * unverified clocks, partial dependency metadata, and multi-dependency overlap.
 */
export const CLOCK_AND_DEPENDENCY_EDGE_FIXTURE: ScenarioDefinition = {
  schemaVersion: 'groundtruth-blindspot/v1',
  scenarioId: 'synthetic-clock-skew-and-multi-overlap',
  title: 'Synthetic Diagnostic Fixture — Unverified Clocks, Clock Skew & Multi-Dependency Overlap',
  description:
    'Synthetic scenario illustrating future observedAt clock skew, unverified source clocks, incompatible units, and partial multi-dependency overlap.',
  dataProvenance: 'synthetic',
  timeUnit: 'seconds',
  virtualDuration: 15,
  heartbeatThreshold: 5,
  comparisonTolerance: 1,
  dependencies: [
    {
      id: 'gateway-1',
      name: 'Shared Field Telemetry Gateway 1',
      category: 'network_gateway',
      declaredBy: 'Synthetic manifest (unverified)',
    },
    {
      id: 'ups-rack-a',
      name: 'UPS Battery Rack A',
      category: 'power',
      declaredBy: 'Synthetic manifest (unverified)',
    },
    {
      id: 'backhaul-switch-2',
      name: 'Backhaul Switch 2',
      category: 'network_switch',
      declaredBy: 'Synthetic manifest (unverified)',
    },
  ],
  sources: [
    {
      id: 'S1',
      name: 'Source S1 (Multi-Dep Node 1)',
      dependencyIds: ['gateway-1', 'ups-rack-a'],
      dependencyKnowledge: 'complete',
      declarationProvenance: 'Synthetic manifest',
    },
    {
      id: 'S2',
      name: 'Source S2 (Multi-Dep Node 2 · Partial)',
      dependencyIds: ['gateway-1', 'ups-rack-a', 'backhaul-switch-2'],
      dependencyKnowledge: 'partial',
      declarationProvenance: 'Synthetic manifest (partial upstream survey)',
    },
    {
      id: 'S3',
      name: 'Source S3 (Unverified Clock Node)',
      dependencyIds: ['backhaul-switch-2'],
      dependencyKnowledge: 'unknown',
      declarationProvenance: 'Synthetic manifest (unknown full chain)',
    },
  ],
  events: [
    { id: 'hb-s1-0', sourceId: 'S1', receivedAt: 0, type: 'heartbeat' },
    { id: 'hb-s2-0', sourceId: 'S2', receivedAt: 0, type: 'heartbeat' },
    {
      id: 'obs-s1-3',
      sourceId: 'S1',
      receivedAt: 3,
      type: 'observation',
      value: 'relay=closed',
      comparisonKey: {
        contextId: 'ctx-relay-bay',
        subject: 'relay-1',
        property: 'contact_state',
        unit: 'state',
      },
      observedAt: 3,
      clockQuality: 'synthetic_synchronized',
    },
    {
      id: 'obs-s2-3-skew',
      sourceId: 'S2',
      receivedAt: 3,
      type: 'observation',
      value: 'relay=open',
      comparisonKey: {
        contextId: 'ctx-relay-bay',
        subject: 'relay-1',
        property: 'contact_state',
        unit: 'state',
      },
      observedAt: 9, // Future observedAt > receivedAt -> Clock Skew!
      clockQuality: 'synthetic_synchronized',
    },
    {
      id: 'obs-s3-4-unverified',
      sourceId: 'S3',
      receivedAt: 4,
      type: 'observation',
      value: 'relay=open',
      comparisonKey: {
        contextId: 'ctx-relay-bay',
        subject: 'relay-1',
        property: 'contact_state',
        unit: 'state',
      },
      observedAt: 3,
      clockQuality: 'unverified',
    },
  ],
};
