import type { ReactNode } from "react";
import { heartbeatCaveat } from "../engine/limits";
import type { Scenario, Snapshot } from "../engine/types";
import { Badge, CLOCK_TEXT, fmtAge, fmtT, StateChip } from "./shared";

function Row({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div className="grid grid-cols-[11rem_1fr] gap-x-2 py-0.5 max-sm:grid-cols-1">
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-600">{label}</dt>
      <dd data-testid={testId} className="text-sm text-slate-900">
        {children}
      </dd>
    </div>
  );
}

export function SourceCards({ scenario, snap, threshold }: { scenario: Scenario; snap: Snapshot; threshold: number }) {
  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3" aria-label="Source status cards">
      {snap.sources.map((s) => {
        const def = scenario.sources.find((d) => d.id === s.sourceId)!;
        const last = s.lastObservationReceived;
        return (
          <li key={s.sourceId} data-testid={`source-${s.sourceId}`} className="min-w-0 rounded-lg border-2 border-slate-400 bg-white p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900">{s.name}</h3>
                <p className="text-xs text-slate-600">
                  source ID <code>{s.sourceId}</code>
                </p>
              </div>
              <StateChip state={s.heartbeatState} testId={`state-${s.sourceId}`} />
            </div>
            <p className="mt-2 rounded bg-slate-100 p-2 text-xs text-slate-800">{heartbeatCaveat(s.heartbeatState)}</p>
            <dl className="mt-2">
              <Row label="Last packet received" testId={`packet-${s.sourceId}`}>
                {s.lastPacketReceivedAt === null ? "none" : `${fmtT(s.lastPacketReceivedAt)} (event ${s.lastPacketEventId}, any type)`}
              </Row>
              <Row label="Last heartbeat received" testId={`hb-${s.sourceId}`}>
                {s.lastHeartbeatReceivedAt === null ? "none" : `${fmtT(s.lastHeartbeatReceivedAt)} (event ${s.lastHeartbeatEventId})`}
              </Row>
              <Row label="Heartbeat age" testId={`hbage-${s.sourceId}`}>
                {s.heartbeatAge === null ? "unknown (no heartbeat)" : `${s.heartbeatAge} s`} · threshold {threshold} s
                {s.staleSince !== null ? ` · stale since ${fmtT(s.staleSince)}` : ""}
              </Row>
              <Row label="Observations received">{s.observations.length}</Row>
              {last ? (
                <>
                  <Row label="Last observation received" testId={`obs-${s.sourceId}`}>
                    <code>{last.eventId}</code> at {fmtT(last.receivedAt)} · {last.comparisonKey.property} = <strong>{last.value === null ? "(missing)" : JSON.stringify(last.value)}</strong>
                    {last.backfilled ? (
                      <>
                        {" "}
                        <Badge tone="violet">BACKFILLED / HISTORICAL</Badge>
                      </>
                    ) : null}
                  </Row>
                  <Row label="Receive age">{fmtAge(last.receiveAge)} (since that packet arrived)</Row>
                  <Row label="Source-claimed time">
                    {last.observedAt === "unknown" ? "unknown" : `t=${last.observedAt} s`} · <span>{CLOCK_TEXT[last.clockQuality]}</span>
                  </Row>
                  <Row label="Observation age" testId={`obsage-${s.sourceId}`}>
                    {last.observationAge === null ? "not computed" : `${last.observationAge} s (claimed)`}
                    {last.receiveLag !== null ? ` · received ${last.receiveLag} s after claimed time` : ""}
                  </Row>
                  <Row label="Timing note">{last.timingText}</Row>
                  <Row label="Newest claimed time">{s.newestClaimedObservedAt === null ? "none valid" : `t=${s.newestClaimedObservedAt} s (among all received observations)`}</Row>
                </>
              ) : (
                <Row label="Observations">None received. A silent source is not an opposing report and not a clear scene.</Row>
              )}
              <Row label="Declared dependencies">
                {def.dependencyIds.length ? def.dependencyIds.join(", ") : "none listed"} <Badge>knowledge: {def.dependencyKnowledge}</Badge>
              </Row>
              {s.droppedHeartbeatCount > 0 ? (
                <Row label="Synthetic drops">
                  <Badge tone="amber">{s.droppedHeartbeatCount} original heartbeat(s) treated as not received by a synthetic drop window</Badge>
                </Row>
              ) : null}
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
