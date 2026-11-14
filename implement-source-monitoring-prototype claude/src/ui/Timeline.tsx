import type { HeartbeatState, Scenario, Snapshot } from "../engine/types";
import { STATE_LABEL } from "../engine/derive";
import { Badge } from "./shared";

const pct = (t: number, d: number) => `${(t / d) * 100}%`;

const SEG: Record<HeartbeatState, string> = {
  FRESH_HEARTBEAT: "bg-emerald-600 border-emerald-900",
  STALE_UNKNOWN: "border-dashed border-amber-900",
  WAITING_UNKNOWN: "bg-slate-200 border-dotted border-slate-600",
};

export function Timeline({ scenario, snap }: { scenario: Scenario; snap: Snapshot }) {
  const d = scenario.durationSeconds;
  const step = Math.max(1, Math.ceil(d / 12));
  const ticks: number[] = [];
  for (let t = 0; t <= d; t += step) ticks.push(t);
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2 text-xs text-slate-800" aria-label="Timeline legend">
        <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-6 border-2 border-emerald-900 bg-emerald-600" /> ✔ fresh heartbeat</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-6 border-2 border-dashed border-amber-900" style={{ backgroundImage: "repeating-linear-gradient(135deg,#fef3c7,#fef3c7 3px,#f59e0b 3px,#f59e0b 6px)" }} /> ▲ stale / unknown</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-6 border-2 border-dotted border-slate-600 bg-slate-200" /> ? waiting / unknown</span>
        <span>◆ heartbeat received</span>
        <span>■ observation received</span>
        <span>□ backfilled observation received</span>
        <span>○ claimed source time of an observation</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-6 border border-slate-500 bg-white" style={{ backgroundImage: "repeating-linear-gradient(90deg,#fff,#fff 2px,#cbd5e1 2px,#cbd5e1 3px)" }} /> not yet replayed (nothing known)</span>
      </div>
      <div aria-hidden="true" data-testid="timeline-visual" className="overflow-x-auto">
        <div className="min-w-[34rem] px-2">
          {snap.sources.map((s) => {
            const segs = snap.segments.filter((g) => g.sourceId === s.sourceId);
            const events = snap.visibleEvents.filter((e) => e.sourceId === s.sourceId && !e.dropped);
            const dropped = snap.visibleEvents.filter((e) => e.sourceId === s.sourceId && e.dropped);
            return (
              <div key={s.sourceId} className="mb-3 grid grid-cols-[4.5rem_1fr] items-center gap-2" data-testid={`lane-${s.sourceId}`}>
                <div className="text-sm font-bold">{s.sourceId}</div>
                <div className="relative mx-3">
                  <div className="relative h-7 border border-slate-400 bg-white" style={{ backgroundImage: "repeating-linear-gradient(90deg,#fff,#fff 2px,#cbd5e1 2px,#cbd5e1 3px)" }}>
                    {segs.map((g, i) => (
                      <div
                        key={i}
                        title={`${s.sourceId}: ${STATE_LABEL[g.state]} from t=${g.from} to t=${g.to}`}
                        className={`absolute top-0 h-full border-2 ${SEG[g.state]}`}
                        data-state={g.state}
                        style={{
                          left: pct(g.from, d),
                          width: pct(g.to - g.from, d),
                          ...(g.state === "STALE_UNKNOWN" ? { backgroundImage: "repeating-linear-gradient(135deg,#fef3c7,#fef3c7 3px,#f59e0b 3px,#f59e0b 6px)" } : {}),
                        }}
                      />
                    ))}
                    {events.map((e) => (
                      <span
                        key={e.id}
                        title={`${e.id} (${e.type}) received t=${e.receivedAt}`}
                        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm font-black leading-none text-slate-950 [text-shadow:0_0_2px_#fff,0_0_2px_#fff]"
                        style={{ left: pct(e.receivedAt, d) }}
                      >
                        {e.type === "heartbeat" ? "◆" : e.observation?.backfilled ? "□" : "■"}
                      </span>
                    ))}
                    {dropped.map((e) => (
                      <span key={e.id} title={`${e.id} dropped by synthetic rule`} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm font-black leading-none text-rose-800" style={{ left: pct(e.receivedAt, d) }}>
                        ✕
                      </span>
                    ))}
                  </div>
                  <div className="relative h-4">
                    {events
                      .filter((e) => e.observation && typeof e.observation.observedAt === "number" && e.observation.timing !== "clock_skew_future")
                      .map((e) => (
                        <span key={e.id} title={`${e.id}: claimed source time t=${e.observation!.observedAt}`} className="absolute top-0 -translate-x-1/2 text-[11px] leading-4 text-slate-800" style={{ left: pct(e.observation!.observedAt as number, d) }}>
                          ○
                        </span>
                      ))}
                  </div>
                </div>
              </div>
            );
          })}
          <div className="grid grid-cols-[4.5rem_1fr] gap-2">
            <div className="text-xs font-bold text-slate-600">T (s)</div>
            <div className="relative mx-3 h-6 border-t-2 border-slate-700">
              {ticks.map((t) => (
                <span key={t} className="absolute top-0 -translate-x-1/2 text-[11px] text-slate-800" style={{ left: pct(t, d) }}>
                  | {t}
                </span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-[4.5rem_1fr] gap-2">
            <div />
            <div className="relative mx-3 h-5">
              <span className="absolute -translate-x-1/2 rounded bg-slate-900 px-1.5 text-[11px] font-bold text-white" style={{ left: pct(snap.T, d) }}>
                T={snap.T}
              </span>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-700">The visual lanes duplicate the text below; the transitions list and event log are the accessible equivalents. The region after T is blank because it has not been replayed.</p>

      <h3 className="mt-4 text-sm font-bold text-slate-900">Heartbeat state transitions up to T = {snap.T} s</h3>
      {snap.transitions.length === 0 ? (
        <p data-testid="no-transitions" className="text-sm text-slate-700">No transitions yet. Sources with no heartbeat remain WAITING / UNKNOWN and have no transition.</p>
      ) : (
        <ol data-testid="transitions" className="mt-1 space-y-1">
          {snap.transitions.map((t, i) => (
            <li key={`${t.sourceId}-${t.at}-${t.to}-${i}`} data-testid={`transition-${t.sourceId}-${t.at}-${t.to}`} className="rounded border border-slate-300 bg-slate-50 p-2 text-sm">
              <span className="font-bold">t={t.at} s</span> · <strong>{t.sourceId}</strong> · {STATE_LABEL[t.from]} → <strong>{STATE_LABEL[t.to]}</strong>{" "}
              {t.cause === "heartbeat_after_timeout" ? <Badge tone="sky">RECOVERY OF HEARTBEAT RECEIPT</Badge> : null}
              {t.cause === "heartbeat_timeout" ? <Badge tone="amber">TIMEOUT (cause not established)</Badge> : null}
              <div className="text-xs text-slate-700">{t.description}</div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
