import { useMemo, useState } from "react";
import {
  ADAPTER_PROTOCOL,
  advanceAdapterClock,
  createAdapterState,
  deriveAdapterView,
  handlePollFailure,
  handlePollSuccess,
  makeSimulatedPacket,
  setOptIn,
  type AdapterState,
} from "../engine/adapter";
import type { Scenario } from "../engine/types";
import { Badge, btn, btnPrimary, field } from "./shared";

const CARD_STYLE: Record<string, { glyph: string; cls: string }> = {
  OPT_IN_DISABLED: { glyph: "○", cls: "border-2 border-dotted border-slate-600 bg-slate-100 text-slate-900" },
  WAITING_FOR_FIRST_PACKET: { glyph: "?", cls: "border-2 border-dotted border-slate-600 bg-slate-100 text-slate-900" },
  FRESH_HEARTBEAT_RECEIVED: { glyph: "✔", cls: "border-2 border-solid border-emerald-800 bg-emerald-50 text-emerald-950" },
  DISCONNECTED_OR_POLL_FAILED_UNKNOWN: { glyph: "✖", cls: "border-2 border-solid border-rose-800 bg-rose-50 text-rose-950" },
  STALE_THRESHOLD_EXCEEDED_UNKNOWN: { glyph: "▲", cls: "border-2 border-dashed border-amber-800 text-amber-950" },
};

/**
 * Optional §7 harness. It is deliberately outside the replay engine and outside the exported record:
 * the buttons below generate synthetic frames, and no port, device or network is involved.
 */
export function AdapterPanel({ scenario }: { scenario: Scenario }) {
  const [state, setState] = useState<AdapterState>(() => createAdapterState(scenario.heartbeatThresholdSeconds));
  const [sourceId, setSourceId] = useState(scenario.sources[0]?.id ?? "A");
  const view = useMemo(() => deriveAdapterView(state), [state]);
  const chip = CARD_STYLE[view.cardStatus];

  const send = () =>
    setState((s) => handlePollSuccess(s, s.highestCallbackSeq + 1, makeSimulatedPacket(sourceId, (s.lastSequenceNumber ?? 0) + 1)));
  const fail = () => setState((s) => handlePollFailure(s, s.highestCallbackSeq + 1, "simulated disconnect"));
  const late = () => setState((s) => handlePollSuccess(s, Math.max(1, s.highestCallbackSeq - 1), makeSimulatedPacket(sourceId, 1)));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="adapter-status-line">
        <strong>Test feed adapter</strong>
        <Badge tone="rose">{state.hardwareStatusLabel}</Badge>
        <span className="text-xs text-slate-700">protocol {ADAPTER_PROTOCOL} · threshold {state.thresholdSec} s · local t={state.clockSec} s</span>
      </div>

      <p className="text-sm text-slate-700">
        A separate, optional harness for practising the transitions an adapter must handle. The buttons produce
        <strong> synthetic frames in this tab</strong>; nothing is read from a port, a device or a network. This
        state is not part of the exported record — the record contains the replayed event log.
      </p>

      <label className="flex items-center gap-2 text-sm font-semibold" data-testid="adapter-optin-label">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={state.optedIn}
          data-testid="adapter-optin"
          onChange={(e) => setState((s) => setOptIn(s, e.target.checked))}
        />
        Opt in to the simulated test feed
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm font-semibold" htmlFor="adapter-source">
          Source
        </label>
        <select id="adapter-source" className={field} value={sourceId} data-testid="adapter-source" onChange={(e) => setSourceId(e.target.value)}>
          {scenario.sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id} — {s.name}
            </option>
          ))}
        </select>
        <button type="button" className={btnPrimary} disabled={!state.optedIn} onClick={send} data-testid="adapter-send">
          Simulate a valid heartbeat
        </button>
        <button type="button" className={btn} disabled={!state.optedIn} onClick={fail} data-testid="adapter-fail">
          Simulate a poll failure
        </button>
        <button type="button" className={btn} disabled={!state.optedIn} onClick={late} data-testid="adapter-late" title="Sends a callback with a lower sequence number than one already processed.">
          Simulate a late out-of-order callback
        </button>
        <button type="button" className={btn} onClick={() => setState((s) => advanceAdapterClock(s, 1))} data-testid="adapter-advance">
          Advance local clock 1 s
        </button>
        <button type="button" className={btn} onClick={() => setState(createAdapterState(scenario.heartbeatThresholdSeconds))} data-testid="adapter-reset">
          Reset adapter
        </button>
      </div>

      <div className={`rounded p-3 ${chip.cls}`} data-testid="adapter-card" data-status={view.cardStatus}>
        <div className="flex items-center gap-2 text-sm font-extrabold">
          <span aria-hidden="true">{chip.glyph}</span>
          {view.headline}
        </div>
        <p className="mt-1 text-sm">{view.detail}</p>
        <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs" data-testid="adapter-ages">
          <div>
            <dt className="inline font-semibold">heartbeat age: </dt>
            <dd className="inline">{view.heartbeatAgeSec === null ? "unknown" : `${view.heartbeatAgeSec} s`}</dd>
          </div>
          <div>
            <dt className="inline font-semibold">cached snapshot age: </dt>
            <dd className="inline">{view.snapshotAgeSec === null ? "unknown" : `${view.snapshotAgeSec} s`}</dd>
          </div>
          <div>
            <dt className="inline font-semibold">out-of-order callbacks ignored: </dt>
            <dd className="inline">{state.ignoredOutOfOrderCallbacks}</dd>
          </div>
        </dl>
      </div>

      <details className="text-sm" data-testid="adapter-log-details">
        <summary className="cursor-pointer font-semibold">Adapter log ({state.log.length} most recent entries)</summary>
        <ul className="mt-2 space-y-1" data-testid="adapter-log">
          {state.log.map((l, i) => (
            <li key={i} className="rounded bg-slate-50 px-2 py-1 text-xs">
              {l}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
