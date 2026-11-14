"use client";

import { useMemo, useState } from "react";
import { Badge, Btn } from "../ui";

type Rep = {
  id: string;
  source: string;
  type: string;
  x: number; // metres east
  y: number;
  eventMin: number; // claimed event time (min after 14:00)
  arriveMin: number; // arrival time
  count: number;
  heading: string;
};

const REPS: Rep[] = [
  { id: "A", source: "Patrol radio", type: "vehicle", x: 0, y: 0, eventMin: 4, arriveMin: 6, count: 2, heading: "N" },
  { id: "B", source: "UAV-1 video", type: "vehicle", x: 260, y: 120, eventMin: 9, arriveMin: 9, count: 1, heading: "NE" },
  { id: "C", source: "Acoustic A-02", type: "vehicle", x: 640, y: 300, eventMin: 11, arriveMin: 21, count: 1, heading: "—" },
];

const hhmm = (m: number) => `14:${String(m).padStart(2, "0")}`;
const dist = (a: Rep, b: Rep) => Math.hypot(a.x - b.x, a.y - b.y);

export function SignalCheck() {
  const [win, setWin] = useState(8);
  const [rad, setRad] = useState(500);
  const [separated, setSeparated] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [notes, setNotes] = useState<string[]>([]);

  const pairs = useMemo(() => {
    const out: { a: Rep; b: Rep; rules: { name: string; ok: boolean; detail: string }[] }[] = [];
    for (let i = 0; i < REPS.length; i++)
      for (let j = i + 1; j < REPS.length; j++) {
        const a = REPS[i];
        const b = REPS[j];
        const d = dist(a, b);
        const dt = Math.abs(a.eventMin - b.eventMin);
        out.push({
          a,
          b,
          rules: [
            { name: "same type", ok: a.type === b.type, detail: `${a.type} / ${b.type}` },
            { name: `within ${rad} m`, ok: d <= rad, detail: `${Math.round(d)} m apart` },
            { name: `within ${win} min`, ok: dt <= win, detail: `${dt} min apart` },
          ],
        });
      }
    return out;
  }, [win, rad]);

  const linked = (aId: string, bId: string) => {
    if (separated.includes(aId) || separated.includes(bId)) return false;
    const p = pairs.find((x) => (x.a.id === aId && x.b.id === bId) || (x.a.id === bId && x.b.id === aId));
    return !!p && p.rules.every((r) => r.ok);
  };

  // union-find over three nodes
  const parent: Record<string, string> = { A: "A", B: "B", C: "C" };
  const find = (x: string): string => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (const p of pairs) if (linked(p.a.id, p.b.id)) parent[find(p.a.id)] = find(p.b.id);
  const groups: Record<string, Rep[]> = {};
  for (const r of REPS) (groups[find(r.id)] ||= []).push(r);
  const grouped = Object.values(groups).filter((g) => g.length > 1);

  const fields: { k: keyof Rep; label: string; fmt?: (v: never) => string }[] = [
    { k: "source", label: "Source" },
    { k: "eventMin", label: "Claimed event time" },
    { k: "arriveMin", label: "Arrived at" },
    { k: "count", label: "Count" },
    { k: "heading", label: "Heading" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm text-slate-300">
          Time window: <strong className="text-white">{win} min</strong>
          <input type="range" min={1} max={15} value={win} onChange={(e) => setWin(Number(e.target.value))} className="mt-1 w-full" />
        </label>
        <label className="text-sm text-slate-300">
          Distance: <strong className="text-white">{rad} m</strong>
          <input type="range" min={100} max={1000} step={50} value={rad} onChange={(e) => setRad(Number(e.target.value))} className="mt-1 w-full" />
        </label>
      </div>

      {grouped.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-sm text-slate-300">
          No reports are grouped under these rules. They remain three independent reports.
        </div>
      ) : (
        grouped.map((g) => (
          <div key={g.map((r) => r.id).join("")} className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="warn">Possibly related</Badge>
              <span className="text-sm font-semibold text-white">
                Reports {g.map((r) => r.id).join(" + ")} may describe the same event
              </span>
              <span className="text-xs text-slate-400">(hypothesis from simple rules, not proof)</span>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="text-[11px] uppercase text-slate-400">
                  <tr>
                    <th className="py-1 pr-3">Field</th>
                    {g.map((r) => (
                      <th key={r.id} className="px-2 py-1">
                        Report {r.id}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fields.map((f) => {
                    const vals = g.map((r) => String(r[f.k]));
                    const differs = new Set(vals).size > 1;
                    return (
                      <tr key={f.k} className="border-t border-slate-800">
                        <td className="py-1 pr-3 text-slate-400">{f.label}</td>
                        {g.map((r) => (
                          <td
                            key={r.id}
                            className={`px-2 py-1 ${differs ? "bg-amber-500/10 font-semibold text-amber-200" : "text-slate-200"}`}
                          >
                            {f.k === "eventMin" || f.k === "arriveMin" ? hhmm(r[f.k] as number) : String(r[f.k])}
                            {differs && <span className="ml-1 text-[10px]">≠</span>}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {g.map((r) => (
                <Btn key={r.id} onClick={() => setSeparated((s) => [...s, r.id])}>
                  Separate report {r.id}
                </Btn>
              ))}
            </div>
          </div>
        ))
      )}

      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Why they were (or weren’t) grouped</p>
        <div className="grid gap-2 md:grid-cols-3">
          {pairs.map((p) => {
            const hits = p.rules.filter((r) => r.ok).length;
            return (
              <div key={p.a.id + p.b.id} className="rounded border border-slate-800 p-2 text-xs">
                <p className="font-semibold text-white">
                  {p.a.id} ↔ {p.b.id}{" "}
                  <span className="font-normal text-slate-400">
                    ({hits} of 3 rules{separated.some((s) => s === p.a.id || s === p.b.id) ? ", separated by operator" : ""})
                  </span>
                </p>
                <ul className="mt-1 space-y-0.5">
                  {p.rules.map((r) => (
                    <li key={r.name} className={r.ok ? "text-emerald-300" : "text-slate-400"}>
                      {r.ok ? "✓" : "✗"} {r.name} <span className="text-slate-500">({r.detail})</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Report C arrived at {hhmm(REPS[2].arriveMin)} but claims {hhmm(REPS[2].eventMin)}: event time and arrival time are
          kept separate.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Operator note on grouping decision…"
          className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-white outline-none focus:border-cyan-500"
        />
        <Btn
          tone="primary"
          disabled={!note.trim()}
          onClick={() => {
            setNotes((n) => [note.trim(), ...n]);
            setNote("");
          }}
        >
          Add note
        </Btn>
        <Btn onClick={() => setSeparated([])} disabled={separated.length === 0}>
          Undo separations
        </Btn>
      </div>
      {notes.length > 0 && (
        <ul className="space-y-1 text-sm text-slate-200">
          {notes.map((n) => (
            <li key={n}>
              <Badge tone="info">Human note</Badge> {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
