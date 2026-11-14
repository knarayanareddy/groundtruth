"use client";

import { useEffect, useState } from "react";
import { Badge, Btn, fmtAge } from "../ui";

type Dev = {
  id: string;
  name: string;
  kind: string;
  prop: string;
  unit: string;
  period: number;
  online: boolean;
  lastAt: number;
  value: string;
};

type Note = { at: number; dev: string; text: string };

const INIT: Dev[] = [
  { id: "S-01", name: "Seismic geophone, north fence", kind: "seismic", prop: "ground vibration (RMS)", unit: "mg", period: 5, online: true, lastAt: 0, value: "0.8" },
  { id: "A-02", name: "Acoustic node, gate", kind: "acoustic", prop: "sound level 1–2 kHz", unit: "dB", period: 10, online: true, lastAt: 0, value: "41" },
  { id: "M-03", name: "PIR motion, track junction", kind: "motion", prop: "motion events / min", unit: "count", period: 15, online: true, lastAt: 0, value: "0" },
];

function gen(d: Dev): string {
  if (d.kind === "seismic") return (0.5 + Math.random() * 1.2).toFixed(1);
  if (d.kind === "acoustic") return String(Math.round(38 + Math.random() * 10));
  return String(Math.random() > 0.7 ? 1 : 0);
}

function statusOf(d: Dev, t: number): { label: "LIVE" | "LATE" | "UNAVAILABLE"; tone: "ok" | "warn" | "bad"; icon: string } {
  const age = t - d.lastAt;
  if (age <= d.period * 1.5) return { label: "LIVE", tone: "ok", icon: "●" };
  if (age <= d.period * 3.5) return { label: "LATE", tone: "warn", icon: "◐" };
  return { label: "UNAVAILABLE", tone: "bad", icon: "✕" };
}

export function SensorBridge() {
  const [t, setT] = useState(0);
  const [devs, setDevs] = useState<Dev[]>(INIT);
  const [sel, setSel] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const i = setInterval(() => {
      setT((p) => p + 1);
    }, 1000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    setDevs((prev) =>
      prev.map((d) => (d.online && t > 0 && t % d.period === 0 ? { ...d, lastAt: t, value: gen(d) } : d)),
    );
  }, [t]);

  const stats = devs.map((d) => statusOf(d, t));
  const live = stats.filter((s) => s.label === "LIVE").length;
  const unavailable = stats.filter((s) => s.label === "UNAVAILABLE").length;
  const selected = devs.find((d) => d.id === sel) ?? null;

  const bannerTone =
    live === devs.length ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-500/50 bg-amber-500/10";

  return (
    <div className="space-y-4">
      <div className={`rounded-lg border p-3 ${bannerTone}`}>
        <p className="text-sm font-semibold text-white">
          SITE: {live} of {devs.length} sensors reporting
          {live < devs.length && <span className="text-amber-300"> · PARTIAL COVERAGE</span>}
        </p>
        <p className="text-xs text-slate-300">
          {live === devs.length
            ? "All sensors are reporting. Quiet readings are real readings."
            : `This is not an all-clear. ${unavailable} sensor(s) cannot currently tell you anything; their last readings are shown frozen.`}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-900 text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2">Device</th>
              <th className="px-3 py-2">Observed property</th>
              <th className="px-3 py-2">Last observation</th>
              <th className="px-3 py-2">Age</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Test</th>
            </tr>
          </thead>
          <tbody>
            {devs.map((d, i) => {
              const s = stats[i];
              return (
                <tr
                  key={d.id}
                  onClick={() => setSel(d.id)}
                  className={`cursor-pointer border-t border-slate-800 hover:bg-slate-800/50 ${sel === d.id ? "bg-slate-800/60" : ""}`}
                >
                  <td className="px-3 py-2">
                    <p className="font-semibold text-white">{d.id}</p>
                    <p className="text-xs text-slate-400">{d.name}</p>
                  </td>
                  <td className="px-3 py-2 text-slate-300">{d.prop}</td>
                  <td className={`px-3 py-2 font-mono ${s.label === "UNAVAILABLE" ? "text-slate-500 line-through decoration-slate-600" : "text-white"}`}>
                    {d.value} {d.unit}
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-300">{fmtAge(t - d.lastAt)}</td>
                  <td className="px-3 py-2">
                    <Badge tone={s.tone}>
                      {s.icon} {s.label}
                    </Badge>
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <Btn
                      tone={d.online ? "danger" : "primary"}
                      onClick={() =>
                        setDevs((p) =>
                          p.map((x) => (x.id === d.id ? { ...x, online: !x.online, lastAt: x.online ? x.lastAt : t } : x)),
                        )
                      }
                    >
                      {d.online ? "Kill device" : "Restore"}
                    </Btn>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Record, SensorThings-style (simulated)
            </p>
            <pre className="overflow-x-auto text-xs leading-relaxed text-cyan-100">
{JSON.stringify(
  {
    Thing: { name: selected.name, id: selected.id, properties: { simulated: true } },
    Sensor: { name: `${selected.kind} node` },
    ObservedProperty: { name: selected.prop },
    Datastream: { unitOfMeasurement: selected.unit, expectedIntervalSec: selected.period },
    Observation: {
      result: selected.value,
      phenomenonTime: `T+${selected.lastAt}s`,
      resultTime: `T+${selected.lastAt}s`,
      ageNowSec: t - selected.lastAt,
      state: statusOf(selected, t).label,
    },
  },
  null,
  2,
)}
            </pre>
            <p className="mt-2 text-xs text-slate-400">
              What this does <em>not</em> tell you: whether anything is happening outside this sensor’s range, or what
              caused the reading.
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Operator notes for {selected.id}
            </p>
            <div className="flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="e.g. checked on camera, nothing seen"
                className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-white outline-none focus:border-cyan-500"
              />
              <Btn
                tone="primary"
                disabled={!draft.trim()}
                onClick={() => {
                  setNotes((p) => [{ at: t, dev: selected.id, text: draft.trim() }, ...p]);
                  setDraft("");
                }}
              >
                Add note
              </Btn>
            </div>
            <ul className="mt-3 space-y-1.5">
              {notes
                .filter((n) => n.dev === selected.id)
                .map((n) => (
                  <li key={n.at + n.text} className="rounded border border-slate-800 p-2 text-sm text-slate-200">
                    <Badge tone="info">Human note</Badge> <span className="font-mono text-xs text-slate-400">T+{n.at}s</span>
                    <p className="mt-1">{n.text}</p>
                  </li>
                ))}
              {notes.filter((n) => n.dev === selected.id).length === 0 && (
                <li className="text-xs text-slate-500">No notes yet.</li>
              )}
            </ul>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-400">Select a device to see its record and add a note.</p>
      )}
    </div>
  );
}
