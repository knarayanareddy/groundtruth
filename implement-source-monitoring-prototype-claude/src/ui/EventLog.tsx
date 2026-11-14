import type { Snapshot } from "../engine/types";
import { Badge, CLOCK_TEXT } from "./shared";

/** Only events with receivedAt <= T are listed (causal). All text is rendered as plain text. */
export function EventLog({ snap }: { snap: Snapshot }) {
  if (snap.visibleEvents.length === 0) return <p className="text-sm text-slate-700">No events received at T = {snap.T} s.</p>;
  return (
    <div className="overflow-x-auto">
      <table data-testid="event-log" className="w-full min-w-[40rem] border-collapse text-left text-sm">
        <caption className="sr-only">Events received up to T = {snap.T} seconds, ordered by received time then event ID</caption>
        <thead>
          <tr className="border-b-2 border-slate-600 text-xs uppercase text-slate-700">
            <th scope="col" className="py-1 pr-2">Received</th>
            <th scope="col" className="py-1 pr-2">Event ID</th>
            <th scope="col" className="py-1 pr-2">Source</th>
            <th scope="col" className="py-1 pr-2">Type</th>
            <th scope="col" className="py-1">Details (claims, not verified facts)</th>
          </tr>
        </thead>
        <tbody>
          {snap.visibleEvents.map((e) => (
            <tr key={e.id} data-testid={`event-${e.id}`} className="border-b border-slate-200 align-top">
              <td className="py-1 pr-2 whitespace-nowrap">t={e.receivedAt} s</td>
              <td className="py-1 pr-2"><code>{e.id}</code></td>
              <td className="py-1 pr-2">{e.sourceId}</td>
              <td className="py-1 pr-2">{e.type}</td>
              <td className="py-1">
                {e.origin === "user_synthetic" ? <Badge tone="amber">USER-ADDED SYNTHETIC</Badge> : null}{" "}
                {e.dropped ? <Badge tone="rose">DROPPED by synthetic rule {e.dropWindowId} — treated as not received</Badge> : null}
                {e.type === "heartbeat" && !e.dropped ? <span>heartbeat received (says only that a message arrived)</span> : null}
                {e.observation ? (
                  <span>
                    {e.observation.comparisonKey.subject} / {e.observation.comparisonKey.property} [{e.observation.comparisonKey.unit}] in {e.observation.comparisonKey.context} ={" "}
                    <strong>{e.observation.value === null ? "(missing)" : JSON.stringify(e.observation.value)}</strong> · claims source time{" "}
                    {e.observation.observedAt === "unknown" ? "unknown" : `t=${e.observation.observedAt} s`} · {CLOCK_TEXT[e.observation.clockQuality]}{" "}
                    {e.observation.backfilled ? <Badge tone="violet">BACKFILLED</Badge> : null}
                    <div className="text-xs text-slate-700">
                      receive age {e.observation.receiveAge} s · observation age {e.observation.observationAge === null ? "not computed" : `${e.observation.observationAge} s (claimed)`} — {e.observation.timingText}
                    </div>
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
