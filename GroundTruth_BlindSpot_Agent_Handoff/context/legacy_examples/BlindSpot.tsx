"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Btn, fmtAge, type Tone } from "../ui";

type Mode = "ok" | "frozen" | "down";
type Feed = {
  id: string;
  name: string;
  interval: number;
  mode: Mode;
  lastAt: number;
  obs: string;
  cx: number;
  cy: number;
  r: number;
  uses: string;
};

type State = "NORMAL" | "DELAYED" | "UNAVAILABLE";

const FEEDS: Feed[] = [
  { id: "uav", name: "UAV-1 video + telemetry", interval: 2, mode: "ok", lastAt: 0, obs: "2 vehicles at gate, heading N", cx: 110, cy: 100, r: 70, uses: "gate overwatch" },
  { id: "seis", name: "Gate seismic sensor", interval: 5, mode: "ok", lastAt: 0, obs: "vibration 0.9 mg RMS (quiet)", cx: 270, cy: 70, r: 55, uses: "gate overwatch" },
  { id: "wind", name: "Wind feed (observation)", interval: 10, mode: "ok", lastAt: 0, obs: "7 m/s from 240°, gust 10", cx: 250, cy: 165, r: 50, uses: "launch go/no-go" },
];

function stateOf(f: Feed, t: number): State {
  if (f.mode === "down") return "UNAVAILABLE";
  const age = t - f.lastAt;
  if (age > f.interval * 8) return "UNAVAILABLE";
  if (age > f.interval * 2.5) return "DELAYED";
  return "NORMAL";
}

const TONE: Record<State, Tone> = { NORMAL: "ok", DELAYED: "warn", UNAVAILABLE: "bad" };
const ICON: Record<State, string> = { NORMAL: "●", DELAYED: "◐", UNAVAILABLE: "✕" };

export function BlindSpot() {
  const [t, setT] = useState(0);
  const [feeds, setFeeds] = useState<Feed[]>(FEEDS);
  const [conflict, setConflict] = useState(false);
  const [sel, setSel] = useState<string>("wind");
  const [log, setLog] = useState<{ t: number; text: string }[]>([]);
  const prev = useRef<Record<string, State>>({});

  useEffect(() => {
    const i = setInterval(() => setT((p) => p + 1), 1000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    setFeeds((p) => p.map((f) => (f.mode === "ok" && t % f.interval === 0 ? { ...f, lastAt: t } : f)));
  }, [t]);

  useEffect(() => {
    const entries: { t: number; text: string }[] = [];
    for (const f of feeds) {
      const s = stateOf(f, t);
      const before = prev.current[f.id];
      if (before && before !== s) entries.push({ t, text: `${f.name}: ${before} → ${s}` });
      prev.current[f.id] = s;
    }
    if (entries.length) setLog((l) => [...entries, ...l].slice(0, 8));
  }, [feeds, t]);

  const states = feeds.map((f) => stateOf(f, t));
  const degraded = feeds.filter((_, i) => states[i] !== "NORMAL");
  const affectedDecisions = Array.from(new Set(degraded.map((f) => f.uses)));
  const f = feeds.find((x) => x.id === sel) ?? feeds[0];
  const fs = stateOf(f, t);

  function setMode(id: string, mode: Mode) {
    setFeeds((p) => p.map((x) => (x.id === id ? { ...x, mode, lastAt: mode === "ok" ? t : x.lastAt } : x)));
    setLog((l) => [{ t, text: `Operator/test action: ${id} → ${mode === "ok" ? "restored" : mode === "frozen" ? "updates stopped" : "marked unavailable"}` }, ...l].slice(0, 8));
  }

  const explanation: Record<State, { know: string; dont: string; change: string }> = {
    NORMAL: {
      know: `${f.name} is reporting every ~${f.interval}s. Last value: ${f.obs}.`,
      dont: "Anything outside its coverage area (see the map).",
      change: `Decisions that use it (${f.uses}) rely on current data.`,
    },
    DELAYED: {
      know: `Last value, ${fmtAge(t - f.lastAt)} old: ${f.obs}.`,
      dont: "Whether that value is still true. The source has stopped updating but has not been declared down.",
      change: `${f.uses} now uses an aged input and shows reduced confidence.`,
    },
    UNAVAILABLE: {
      know: `The source is marked unavailable. Its last value (${f.obs}) was ${fmtAge(t - f.lastAt)} ago and is shown for reference only.`,
      dont: "Anything about its coverage area right now. Silence here is not ‘clear’.",
      change: `${f.uses} falls back to a conservative default and asks for confirmation.`,
    },
  };

  const ex = explanation[fs];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-800 bg-slate-950">
            <svg viewBox="0 0 360 230" className="w-full">
              <defs>
                <pattern id="hatch-bs" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="7" stroke="#f59e0b" strokeWidth="2" />
                </pattern>
              </defs>
              <rect width="360" height="230" fill="#0b1220" />
              {Array.from({ length: 9 }).map((_, i) => (
                <line key={i} x1={i * 45} y1="0" x2={i * 45} y2="230" stroke="#16223a" />
              ))}
              {Array.from({ length: 6 }).map((_, i) => (
                <line key={i} x1="0" y1={i * 45} x2="360" y2={i * 45} stroke="#16223a" />
              ))}
              <rect x="150" y="105" width="60" height="22" fill="#1e293b" stroke="#475569" />
              <text x="180" y="120" textAnchor="middle" fontSize="9" fill="#94a3b8">
                GATE
              </text>
              {feeds.map((x, i) => {
                const s = states[i];
                return (
                  <g key={x.id} onClick={() => setSel(x.id)} className="cursor-pointer">
                    <circle
                      cx={x.cx}
                      cy={x.cy}
                      r={x.r}
                      fill={s === "NORMAL" ? "rgba(34,197,94,0.08)" : "url(#hatch-bs)"}
                      fillOpacity={s === "NORMAL" ? 1 : s === "DELAYED" ? 0.35 : 0.7}
                      stroke={s === "NORMAL" ? "#22c55e" : s === "DELAYED" ? "#f59e0b" : "#ef4444"}
                      strokeWidth={sel === x.id ? 3 : 1.5}
                      strokeDasharray={s === "NORMAL" ? undefined : s === "DELAYED" ? "6 3" : "2 4"}
                    />
                    <text x={x.cx} y={x.cy + 3} textAnchor="middle" fontSize="10" fontWeight="700" fill="#e2e8f0">
                      {ICON[s]} {x.id.toUpperCase()}
                    </text>
                  </g>
                );
              })}
            </svg>
            <p className="border-t border-slate-800 px-3 py-1.5 text-[11px] text-slate-400">
              Hatched = coverage currently unknown (not ‘clear’). Dashed outline = delayed, dotted = unavailable.
            </p>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Timeline</p>
            <ul className="space-y-1 text-xs text-slate-300">
              {log.length === 0 && <li className="text-slate-500">Nothing yet. Break a feed.</li>}
              {log.map((l, i) => (
                <li key={i} className="font-mono">
                  <span className="text-slate-500">T+{l.t}s</span> {l.text}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-3">
          <div
            className={`rounded-lg border p-3 ${
              degraded.length === 0 && !conflict ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-500/50 bg-amber-500/10"
            }`}
          >
            <p className="text-sm font-semibold text-white">
              Picture: {feeds.length - degraded.length}/{feeds.length} feeds current
              {conflict && " · 1 conflict"}
            </p>
            <p className="text-xs text-slate-300">
              {affectedDecisions.length
                ? `Decisions affected: ${affectedDecisions.join(", ")}.`
                : "No decision currently depends on a degraded input."}
            </p>
          </div>

          {feeds.map((x, i) => (
            <div
              key={x.id}
              onClick={() => setSel(x.id)}
              className={`cursor-pointer rounded-lg border p-2.5 ${sel === x.id ? "border-cyan-500/60 bg-slate-800/60" : "border-slate-800 bg-slate-950/60"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-white">{x.name}</p>
                <Badge tone={TONE[states[i]]}>
                  {ICON[states[i]]} {states[i]}
                </Badge>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-slate-800">
                <div
                  className={states[i] === "NORMAL" ? "h-full bg-emerald-400" : states[i] === "DELAYED" ? "h-full bg-amber-400" : "h-full bg-red-500"}
                  style={{ width: `${Math.min(100, ((t - x.lastAt) / (x.interval * 8)) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                age {fmtAge(t - x.lastAt)} · expected every {x.interval}s
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
                <Btn onClick={() => setMode(x.id, "frozen")} disabled={x.mode === "frozen"}>
                  Stop updates
                </Btn>
                <Btn onClick={() => setMode(x.id, "down")} disabled={x.mode === "down"}>
                  Mark unavailable
                </Btn>
                <Btn tone="primary" onClick={() => setMode(x.id, "ok")} disabled={x.mode === "ok"}>
                  Restore
                </Btn>
              </div>
            </div>
          ))}

          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Gate occupancy reports</p>
              <Btn tone={conflict ? "primary" : "mute"} onClick={() => setConflict((c) => !c)}>
                {conflict ? "Clear conflict" : "Inject conflict"}
              </Btn>
            </div>
            {conflict ? (
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded border border-amber-500/40 p-2 text-slate-200">
                  <Badge tone="warn">≠ Conflict</Badge>
                  <p className="mt-1 font-semibold">UAV-1 video</p>
                  <p>2 vehicles at gate</p>
                </div>
                <div className="rounded border border-amber-500/40 p-2 text-slate-200">
                  <Badge tone="warn">≠ Conflict</Badge>
                  <p className="mt-1 font-semibold">Seismic</p>
                  <p>no vibration</p>
                </div>
                <p className="col-span-2 text-slate-400">Both are kept. Not merged. Open SignalCheck for the side-by-side review.</p>
              </div>
            ) : (
              <p className="mt-1 text-xs text-slate-500">Sources agree.</p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3">
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-cyan-300">
          Selected: {f.name} · <span className="text-white">{ICON[fs]} {fs}</span>
        </p>
        <div className="grid gap-3 text-sm md:grid-cols-3">
          <div>
            <p className="text-[11px] font-semibold uppercase text-slate-400">What we know</p>
            <p className="text-slate-100">{ex.know}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase text-slate-400">What we don’t know</p>
            <p className="text-slate-100">{ex.dont}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase text-slate-400">What this changes</p>
            <p className="text-slate-100">{ex.change}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
