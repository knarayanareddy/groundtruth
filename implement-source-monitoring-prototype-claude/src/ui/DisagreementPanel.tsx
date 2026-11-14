import type { Comparison, ObsRef, Snapshot } from "../engine/types";
import { Badge, CLOCK_TEXT } from "./shared";

function Claim({ r, unit }: { r: ObsRef; unit: string }) {
  return (
    <li className="text-sm">
      <strong>{r.sourceId}</strong> reports <strong>{r.value === null ? "(value missing)" : JSON.stringify(r.value)}</strong> [{unit}] · event <code>{r.eventId}</code> · received t={r.receivedAt} s · claims observed{" "}
      {r.observedAt === "unknown" ? "unknown time" : `t=${r.observedAt} s`} · {CLOCK_TEXT[r.clockQuality]} {r.backfilled ? <Badge tone="violet">BACKFILLED</Badge> : null}
    </li>
  );
}

function Card({ c }: { c: Comparison }) {
  const verdict =
    c.verdict === "reports_differ" ? (
      <Badge tone="rose">≠ REPORTS DIFFER — claims only; no winner is chosen</Badge>
    ) : c.verdict === "reports_match" ? (
      <Badge tone="sky">= REPORTS MATCH — a match does not verify either claim</Badge>
    ) : (
      <Badge tone="slate">∅ NOT COMPARABLE / INSUFFICIENT INFORMATION</Badge>
    );
  return (
    <li data-testid={`comparison-${c.id}`} data-verdict={c.verdict} className="rounded border-2 border-slate-400 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        {verdict} {c.historical ? <Badge tone="amber">HISTORICAL</Badge> : <Badge>within recency window (claimed)</Badge>}
      </div>
      <p className="mt-1 text-xs text-slate-700">
        Comparison key: subject <code>{c.key.subject}</code> · property <code>{c.key.property}</code> · context <code>{c.key.context}</code> · unit <code>{c.key.unitA}</code>
        {c.key.unitA !== c.key.unitB ? ` / ${c.key.unitB}` : ""}
      </p>
      <ul className="mt-1 list-disc pl-5">
        <Claim r={c.a} unit={c.key.unitA} />
        <Claim r={c.b} unit={c.key.unitB} />
      </ul>
      {c.reasons.length > 0 ? (
        <ul className="mt-1 list-disc pl-5 text-sm text-slate-900">
          {c.reasons.map((r, i) => (<li key={i}>{r}</li>))}
        </ul>
      ) : null}
      <p className="mt-1 text-xs text-slate-800">{c.historicalText}</p>
      <p className="mt-1 text-xs text-slate-800">
        <strong>Dependencies:</strong> {c.dependencyText}
      </p>
      <p className="mt-1 text-xs text-slate-600">
        <strong>Rule:</strong> {c.rule}
      </p>
    </li>
  );
}

export function DisagreementPanel({ snap }: { snap: Snapshot }) {
  return (
    <div className="space-y-3">
      {snap.comparisons.length === 0 ? (
        <p data-testid="no-comparisons" className="text-sm text-slate-800">No pair of received reports has been compared at T = {snap.T} s.</p>
      ) : (
        <ul className="space-y-2" data-testid="comparisons">
          {snap.comparisons.map((c) => (<Card key={c.id} c={c} />))}
        </ul>
      )}
      {snap.comparisonsTruncated ? <p className="text-sm font-semibold">Comparison list truncated at the display limit.</p> : null}
      {snap.noSharedKey.length > 0 ? (
        <ul className="list-disc pl-5 text-sm" data-testid="no-shared-key">
          {snap.noSharedKey.map((n) => (<li key={`${n.sourceA}-${n.sourceB}`}>{n.text}</li>))}
        </ul>
      ) : null}
      {snap.sourcesWithoutObservations.length > 0 ? (
        <p className="text-sm text-slate-800" data-testid="silent-sources">
          No observation received from: <strong>{snap.sourcesWithoutObservations.join(", ")}</strong>. A silent or unavailable source is not an opposing report and not evidence about the scene.
        </p>
      ) : null}
    </div>
  );
}
