import { useState } from "react";
import type { Scenario, UserSynthetic } from "../engine/types";
import { Badge, btn, field } from "./shared";

export function SyntheticPanel({
  scenario, user, T, onInject, onDrop, onClear,
}: {
  scenario: Scenario;
  user: UserSynthetic;
  T: number;
  onInject: (sourceId: string) => void;
  onDrop: (sourceId: string, seconds: number) => void;
  onClear: () => void;
}) {
  const [src, setSrc] = useState(scenario.sources[0].id);
  const [secs, setSecs] = useState(10);
  const srcId = scenario.sources.some((s) => s.id === src) ? src : scenario.sources[0].id;
  return (
    <div className="space-y-3">
      <p className="rounded border border-amber-700 bg-amber-50 p-2 text-sm text-amber-950">
        These controls add <strong>explicit synthetic entries</strong> to the record (they appear in the event log and in exports). They do not unplug or touch any device, and they never rewrite what was already replayed before their time.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-semibold">
          Source
          <select className={`${field} ml-1`} value={srcId} onChange={(e) => setSrc(e.target.value)} data-testid="syn-source">
            {scenario.sources.map((s) => (<option key={s.id} value={s.id}>{s.id} — {s.name}</option>))}
          </select>
        </label>
        <button type="button" className={btn} onClick={() => onInject(srcId)} data-testid="btn-inject">
          Inject synthetic heartbeat at T={T}
        </button>
        <label className="text-sm font-semibold">
          Drop for (s)
          <input type="number" min={1} max={3600} className={`${field} ml-1 w-20`} value={secs} onChange={(e) => setSecs(Number(e.target.value))} data-testid="syn-secs" />
        </label>
        <button type="button" className={btn} onClick={() => onDrop(srcId, secs)} data-testid="btn-drop">
          Drop original heartbeats from T+1 for {Number.isFinite(secs) ? secs : "?"} s
        </button>
        <button type="button" className={btn} onClick={onClear} disabled={user.events.length + user.dropWindows.length === 0} data-testid="btn-clear-synthetic">
          Remove all synthetic entries
        </button>
      </div>
      <ul className="space-y-1 text-sm" data-testid="synthetic-list">
        {user.events.length + user.dropWindows.length === 0 ? <li className="text-slate-700">No user-added synthetic entries.</li> : null}
        {user.events.map((e) => (
          <li key={e.id}><Badge tone="amber">SYNTHETIC HEARTBEAT</Badge> <code>{e.id}</code> source {e.sourceId} received t={e.receivedAt} s (authored at T={e.authoredAtT})</li>
        ))}
        {user.dropWindows.map((w) => (
          <li key={w.id}><Badge tone="amber">SYNTHETIC DROP WINDOW</Badge> <code>{w.id}</code> source {w.sourceId} heartbeats received in t={w.fromT}…{w.untilT - 1} s ignored (authored at T={w.authoredAtT})</li>
        ))}
      </ul>
    </div>
  );
}
