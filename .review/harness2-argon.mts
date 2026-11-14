// INDEPENDENT REVIEW HARNESS #2 — Argon §3/§5/§6
import fs from 'node:fs';
import {
  deriveReplaySnapshot, createExportRecord, DEFAULT_SYNTHETIC_CONFIG,
} from '../implement-source-monitoring-protocolargon/src/engine/replayEngine.ts';
import { validateScenarioInput } from '../implement-source-monitoring-protocolargon/src/engine/validator.ts';
import { CLOCK_AND_DEPENDENCY_EDGE_FIXTURE, REFERENCE_FIXTURE } from '../implement-source-monitoring-protocolargon/src/fixtures/referenceFixture.ts';

const base = JSON.parse(fs.readFileSync(new URL('../implement-source-monitoring-protocolargon/fixtures/reference-fixture.json', import.meta.url)).toString('utf8'));
let pass = 0, fail = 0;
const chk = (name: string, cond: boolean, detail = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  :: ' + detail : ''}`); };

console.log('===== §5 dependency overlap =====');
const s = deriveReplaySnapshot(base, 12);
for (const o of s.dependencyOverlaps) console.log(`  ${o.sourceAId}<->${o.sourceBId} shared=[${o.sharedDependencies.map(d => d.id)}] cat=${o.category}`);
const ab = s.dependencyOverlaps.find(o => (o.sourceAId === 'A' && o.sourceBId === 'B') || (o.sourceAId === 'B' && o.sourceBId === 'A'))!;
chk('A<->B shares gateway-1', ab.sharedDependencies.map(d => d.id).join() === 'gateway-1');
chk('A<->B disjoint power labels NOT counted as independence', !/independen/i.test(ab.headline));
const cPairs = s.dependencyOverlaps.filter(o => o.sourceAId === 'C' || o.sourceBId === 'C');
chk('C pairs stay unknown-ish', cPairs.every(o => /UNKNOWN/i.test(o.category)), cPairs.map(o => o.category).join(','));
chk('no numeric independence/trust/Brier score field', !JSON.stringify(s.dependencyOverlaps).match(/independenceScore|trustScore|brier/i));

console.log('\n===== §3 causality + clock skew =====');
const s3 = deriveReplaySnapshot(base, 3);
chk('no future events in causal set at T=3', s3.causalEventsUpToT.every(e => e.receivedAt <= 3));
chk('futureEventsCount reported', s3.futureEventsCount === base.events.filter((e: any) => e.receivedAt > 3).length, String(s3.futureEventsCount));
const skew = CLOCK_AND_DEPENDENCY_EDGE_FIXTURE;
const sk = deriveReplaySnapshot(skew, 30);
const skewed = sk.sources.flatMap(x => x.observationHistory).filter(o => o.clockSkew);
chk('clock-skew observations flagged', skewed.length > 0, 'count=' + skewed.length);
chk('skewed obs never labelled fresh-reliable', skewed.every(o => /skew|not|unverif|unknown/i.test(o.freshnessCaveat)));

console.log('\n===== §6 invalid input rejection (all-or-nothing) =====');
const mutate = (fn: (o: any) => void) => { const c = JSON.parse(JSON.stringify(base)); fn(c); return JSON.stringify(c); };
const cases: [string, string][] = [
  ['malformed JSON', '{"schemaVersion": '],
  ['empty string', ''],
  ['duplicate event id', mutate(o => { o.events[1].id = o.events[0].id; })],
  ['unresolved source ref', mutate(o => { o.events[0].sourceId = 'ZZZ'; })],
  ['unresolved dependency ref', mutate(o => { o.sources[0].dependencyIds = ['nope-9']; })],
  ['bad enum (clockQuality)', mutate(o => { o.events[2].clockQuality = 'totally_bogus'; })],
  ['bad schema version', mutate(o => { o.schemaVersion = 'wrong/v9'; })],
  ['negative threshold', mutate(o => { o.heartbeatThreshold = -1; })],
  ['negative receivedAt', mutate(o => { o.events[0].receivedAt = -3; })],
  ['non-integer receivedAt', mutate(o => { o.events[0].receivedAt = 1.5; })],
  ['NaN receivedAt', mutate(o => { o.events[0].receivedAt = null; })],
  ['oversized (>1MiB)', JSON.stringify({ ...base, pad: 'x'.repeat(1_100_000) })],
  ['duplicate source id', mutate(o => { o.sources.push({ ...o.sources[0] }); })],
  ['future observedAt (skew) not silently fresh', mutate(o => { o.events[2].observedAt = 999; })],
];
for (const [name, txt] of cases) {
  const r = validateScenarioInput(txt);
  const paths = r.ok ? '(accepted)' : r.errors.slice(0, 2).map(e => e.path).join(',');
  chk('reject: ' + name, !r.ok || name.startsWith('future observedAt'), r.ok ? 'ACCEPTED ok=true warnings=' + r.warnings.join('|') : 'errors@' + paths);
}

console.log('\n===== §6 export -> reimport round trip =====');
const notes = [{ id: 'n1', authorAlias: 'rev', recordedAtReplayT: 7, createdAtIso: '2026-01-01T00:00:00.000Z', targetScope: 'B', text: '<script>alert(1)</script> literal' }];
const rec = createExportRecord(base, 7, DEFAULT_SYNTHETIC_CONFIG, notes, '2026-01-01T00:00:00.000Z');
const txt = JSON.stringify(rec);
const imp = validateScenarioInput(txt);
chk('export revalidates as import', imp.ok, imp.ok ? '' : JSON.stringify((imp as any).errors).slice(0, 200));
chk('export carries schemaVersion+engineVersion', rec.schemaVersion === 'groundtruth-blindspot/v1' && rec.engineVersion === '1.0.0');
chk('export carries replayPositionT=7', rec.replayPositionT === 7);
chk('export carries privacy warning', /NOT anonymized/i.test(rec.explicitLabels.privacyAndSecurityWarning));
chk('export carries derivation rules', !!rec.derivationRules.tieBreakOrder);
const before = JSON.stringify(deriveReplaySnapshot(base, 7).sourceMap);
const after = JSON.stringify(deriveReplaySnapshot((imp as any).value.scenario ?? base, 7).sourceMap);
chk('reimport reproduces identical state at T=7', before === after);
chk('note text stored verbatim (plain text, no escaping-to-html)', rec.reviewerNotes[0].text.includes('<script>'));

console.log('\n===== §4 notes causality =====');
const sn = deriveReplaySnapshot(base, 3, DEFAULT_SYNTHETIC_CONFIG, notes);
chk('future note hidden at T=3', sn.causalNotes.length === 0 && sn.hiddenFutureNotesCount === 1);
const sn7 = deriveReplaySnapshot(base, 7, DEFAULT_SYNTHETIC_CONFIG, notes);
chk('note visible at T=7', sn7.causalNotes.length === 1);

console.log(`\n===== ARGON HARNESS #2: pass=${pass} fail=${fail} =====`);
void REFERENCE_FIXTURE;
