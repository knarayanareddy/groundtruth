import { SPEEDS } from "../engine/constants";
import { replayStatus, type ReplayAction, type ReplayState } from "../engine/replay";
import { btn, btnPrimary, field } from "./shared";

export function ReplayControls({ replay, dispatch }: { replay: ReplayState; dispatch: (a: ReplayAction) => void }) {
  const status = replayStatus(replay);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Replay controls">
        <button type="button" className={btn} onClick={() => dispatch({ type: "restart" })} data-testid="btn-restart" aria-keyshortcuts="Home">
          ⏮ Restart (T=0)
        </button>
        <button type="button" className={btn} onClick={() => dispatch({ type: "step", delta: -1 })} disabled={replay.T <= 0} data-testid="btn-step-back" aria-keyshortcuts="ArrowLeft">
          ◀ Step −1 s
        </button>
        <button type="button" className={btnPrimary} onClick={() => dispatch({ type: "toggle" })} data-testid="btn-play" aria-keyshortcuts="Space">
          {replay.playing ? "⏸ Pause" : replay.T >= replay.duration ? "↻ Replay from start" : "▶ Play"}
        </button>
        <button type="button" className={btn} onClick={() => dispatch({ type: "step", delta: 1 })} disabled={replay.T >= replay.duration} data-testid="btn-step" aria-keyshortcuts="ArrowRight">
          Step +1 s ▶
        </button>
        <label className="ml-2 flex items-center gap-1 text-sm font-semibold">
          Speed
          <select className={field} value={replay.speed} onChange={(e) => dispatch({ type: "setSpeed", speed: Number(e.target.value) })} data-testid="speed">
            {SPEEDS.map((s) => (
              <option key={s} value={s}>{s}× (virtual s per real s)</option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex flex-1 items-center gap-2 text-sm font-semibold min-w-[14rem]">
          Seek
          <input
            type="range"
            className="h-3 w-full flex-1 accent-slate-900"
            min={0}
            max={replay.duration}
            step={1}
            value={replay.T}
            onChange={(e) => dispatch({ type: "seek", T: Number(e.target.value) })}
            aria-label="Seek virtual time in seconds"
            aria-valuetext={`T equals ${replay.T} seconds of ${replay.duration}`}
            data-testid="seek"
          />
        </label>
        <label className="flex items-center gap-1 text-sm font-semibold">
          T =
          <input
            type="number"
            className={`${field} w-20`}
            min={0}
            max={replay.duration}
            step={1}
            value={replay.T}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) dispatch({ type: "seek", T: n });
            }}
            aria-label="Virtual time T in seconds"
            data-testid="t-input"
          />
          s
        </label>
      </div>
      <p className="mt-2 text-base font-bold" data-testid="clock-status">
        <span data-testid="clock-T">Virtual clock T = {replay.T} s</span> of {replay.duration} s ·{" "}
        <span data-testid="clock-mode" className="rounded border-2 border-slate-800 px-1.5">{status}</span> · {replay.speed}× · replay of a log, not live
      </p>
      <p className="text-xs text-slate-700">
        Keyboard (when no field is focused): Space play/pause · ← → step · Home restart. Derived status depends only on T, never on how T was reached or on the real clock.
      </p>
    </div>
  );
}
