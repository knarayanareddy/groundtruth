import type { CSSProperties, ReactNode } from "react";
import { STATE_LABEL } from "../engine/derive";
import type { ClockQuality, HeartbeatState } from "../engine/types";

export const fmtT = (t: number | null | undefined) => (t === null || t === undefined ? "—" : `t=${t} s`);
export const fmtAge = (a: number | null | undefined) => (a === null || a === undefined ? "unknown" : `${a} s`);

export const CLOCK_TEXT: Record<ClockQuality, string> = {
  synthetic_synchronized: "synthetic synchronized clock (simulated, not verified hardware time)",
  unverified: "unverified clock",
  unknown: "unknown clock quality",
};

const CHIP: Record<HeartbeatState, { glyph: string; cls: string; style?: CSSProperties }> = {
  FRESH_HEARTBEAT: { glyph: "✔", cls: "border-2 border-solid border-emerald-800 bg-emerald-50 text-emerald-950" },
  STALE_UNKNOWN: {
    glyph: "▲",
    cls: "border-2 border-dashed border-amber-800 text-amber-950",
    style: { backgroundImage: "repeating-linear-gradient(135deg,#fef3c7,#fef3c7 6px,#fde68a 6px,#fde68a 12px)" },
  },
  WAITING_UNKNOWN: { glyph: "?", cls: "border-2 border-dotted border-slate-600 bg-slate-100 text-slate-900" },
};

/** Status is conveyed by text, glyph, and border style — never by color alone. */
export function StateChip({ state, testId }: { state: HeartbeatState; testId?: string }) {
  const c = CHIP[state];
  return (
    <span data-testid={testId} data-state={state} style={c.style} className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-sm font-bold tracking-wide ${c.cls}`}>
      <span aria-hidden="true">{c.glyph}</span>
      {STATE_LABEL[state]}
    </span>
  );
}

export function Badge({ children, tone = "slate", testId }: { children: ReactNode; tone?: "slate" | "amber" | "sky" | "rose" | "violet"; testId?: string }) {
  const tones = {
    slate: "border-slate-500 bg-white text-slate-800",
    amber: "border-amber-700 bg-amber-50 text-amber-950",
    sky: "border-sky-700 bg-sky-50 text-sky-950",
    rose: "border-rose-700 bg-rose-50 text-rose-950",
    violet: "border-violet-700 bg-violet-50 text-violet-950",
  };
  return (
    <span data-testid={testId} className={`inline-block rounded border px-1.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Section({ id, title, children, hint }: { id: string; title: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="min-w-0 rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
      <h2 id={`${id}-h`} className="text-lg font-bold text-slate-900">
        {title}
      </h2>
      {hint ? <p className="mt-1 text-sm text-slate-700">{hint}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export const btn =
  "rounded border-2 border-slate-800 bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:border-slate-400 disabled:text-slate-500";
export const btnPrimary =
  "rounded border-2 border-slate-900 bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:opacity-50";
export const field =
  "rounded border-2 border-slate-700 bg-white px-2 py-1 text-sm text-slate-900 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-700";
