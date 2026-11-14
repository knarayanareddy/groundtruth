// INDEPENDENT REVIEW HARNESS — drives the shipped Argon engine directly.
import fs from 'node:fs';
import { deriveReplaySnapshot } from '../implement-source-monitoring-protocolargon/src/engine/replayEngine.ts';
import { validateScenarioInput } from '../implement-source-monitoring-protocolargon/src/engine/validator.ts';
import type { ScenarioDefinition } from '../implement-source-monitoring-protocolargon/src/engine/types.ts';

const raw = fs.readFileSync(
  new URL('../implement-source-monitoring-protocolargon/fixtures/reference-fixture.json', import.meta.url)
).toString('utf8');
const json = JSON.parse(raw);
const v = validateScenarioInput(raw);
console.log('validator on shipped fixture: ok=' + v.ok + (v.ok ? ' warnings=' + JSON.stringify(v.warnings) : ''));

const scenario: ScenarioDefinition = json;

// Spec §4 expected snapshots
const expected: Record<number, Record<string, string>> = {
  0:  { A: 'FRESH HEARTBEAT', B: 'FRESH HEARTBEAT', C: 'WAITING / UNKNOWN' },
  2:  { A: 'FRESH HEARTBEAT', B: 'FRESH HEARTBEAT', C: 'WAITING / UNKNOWN' },
  5:  { A: 'FRESH HEARTBEAT', B: 'STALE / UNKNOWN', C: 'WAITING / UNKNOWN' },
  6:  { A: 'FRESH HEARTBEAT', B: 'STALE / UNKNOWN', C: 'WAITING / UNKNOWN' },
  7:  { A: 'FRESH HEARTBEAT', B: 'FRESH HEARTBEAT', C: 'WAITING / UNKNOWN' },
  10: { A: 'STALE / UNKNOWN', B: 'FRESH HEARTBEAT', C: 'WAITING / UNKNOWN' },
  12: { A: 'STALE / UNKNOWN', B: 'STALE / UNKNOWN', C: 'WAITING / UNKNOWN' },
};

let fails = 0;
console.log('\nT   A                    B                    C                    hbAgeA hbAgeB disagreements transitions');
for (const T of [0, 2, 5, 6, 7, 10, 12]) {
  const s = deriveReplaySnapshot(scenario, T);
  const got: Record<string, string> = {};
  const age: Record<string, number | null> = {};
  for (const src of s.sources) { got[src.source.id] = src.status; age[src.source.id] = src.lastHeartbeatAge; }
  const exp = expected[T];
  const bad = Object.keys(exp).filter((k) => got[k] !== exp[k]);
  if (bad.length) { fails++; }
  console.log(
    String(T).padEnd(4) +
    String(got.A).padEnd(21) + String(got.B).padEnd(21) + String(got.C).padEnd(21) +
    String(age.A).padEnd(7) + String(age.B).padEnd(7) +
    String(s.activeDisagreements.length).padEnd(14) + String(s.transitions.length) +
    (bad.length ? '   <-- MISMATCH: ' + bad.map((k) => `${k} expected ${exp[k]} got ${got[k]}`).join('; ') : '   OK')
  );
}

// Extra spec assertions
const s2 = deriveReplaySnapshot(scenario, 2);
console.log('\n--- T=2 detail ---');
console.log('comparisons:', s2.comparisons.length, 'disagreements:', s2.activeDisagreements.length);
for (const c of s2.comparisons) console.log('  outcome=' + c.outcome + ' rule=' + c.comparisonRuleSummary.slice(0, 80));
const s6 = deriveReplaySnapshot(scenario, 6);
const b6 = s6.sourceMap['B'];
console.log('\n--- T=6 B backfill detail ---');
console.log('lastHeartbeatReceivedAt=' + b6.lastHeartbeatReceivedAt + ' (must be 0, NOT 6)');
console.log('lastPacketReceivedAt=' + b6.lastPacketReceivedAt + ' (must be 6)');
console.log('lastObservation.observationAge=' + JSON.stringify(b6.lastObservation?.observationAge) + ' receiveAge=' + b6.lastObservation?.receiveAge + ' isBackfill=' + b6.lastObservation?.isBackfill);
const s7 = deriveReplaySnapshot(scenario, 7);
console.log('\n--- transitions through T=7 ---');
for (const t of s7.transitions) console.log(`  ${t.sourceId} @T=${t.atT} ${t.fromStatus} -> ${t.toStatus} (${t.triggerType})`);
const s12 = deriveReplaySnapshot(scenario, 12);
console.log('\n--- transitions through T=12 (count=' + s12.transitions.length + ') ---');
for (const t of s12.transitions) console.log(`  ${t.sourceId} @T=${t.atT} ${t.fromStatus} -> ${t.toStatus} (${t.triggerType})`);

// Determinism: play vs seek equivalence — same T reached differently must match
const a = deriveReplaySnapshot(scenario, 10);
const b = deriveReplaySnapshot(scenario, 5);
const b2 = deriveReplaySnapshot(scenario, 10);
console.log('\nseek-vs-seek equality at T=10:', JSON.stringify(a.sourceMap) === JSON.stringify(b2.sourceMap));
console.log('no wall-clock dependency (two runs identical):', JSON.stringify(a) === JSON.stringify(b2));
void b;

console.log('\nFAILURES: ' + fails);
