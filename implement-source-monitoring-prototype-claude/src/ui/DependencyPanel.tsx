import { dependencyIndex, dependencyPairs } from "../engine/dependencies";
import type { Scenario } from "../engine/types";
import { Badge } from "./shared";

const STATUS_TEXT = {
  declared_overlap: "DECLARED OVERLAP",
  no_overlap_declared: "NO OVERLAP DECLARED (not proof of independence)",
  unknown_or_partial: "UNKNOWN (declarations partial or unknown)",
} as const;

export function DependencyPanel({ scenario }: { scenario: Scenario }) {
  const pairs = dependencyPairs(scenario);
  const index = dependencyIndex(scenario);
  return (
    <div className="space-y-4">
      <p className="rounded border border-slate-300 bg-slate-50 p-2 text-sm text-slate-800">
        Everything here is <strong>declared metadata</strong> typed by a person. It is not measured, not verified, and not time-dependent. No score is computed.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left text-sm" data-testid="dependency-sources">
          <caption className="sr-only">Declared dependencies per source</caption>
          <thead>
            <tr className="border-b-2 border-slate-600 text-xs uppercase text-slate-700">
              <th scope="col" className="py-1 pr-2">Source</th>
              <th scope="col" className="py-1 pr-2">Declared dependency IDs</th>
              <th scope="col" className="py-1 pr-2">Knowledge</th>
              <th scope="col" className="py-1">Assertion made by</th>
            </tr>
          </thead>
          <tbody>
            {scenario.sources.map((s) => (
              <tr key={s.id} className="border-b border-slate-200 align-top">
                <th scope="row" className="py-1 pr-2 font-semibold">{s.id}</th>
                <td className="py-1 pr-2">{s.dependencyIds.length ? s.dependencyIds.join(", ") : "none listed"}</td>
                <td className="py-1 pr-2"><Badge>{s.dependencyKnowledge}</Badge></td>
                <td className="py-1">{s.dependencyDeclaredBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="text-sm font-bold">Declared dependencies and the sources that list them</h3>
        <ul className="mt-1 space-y-1 text-sm" data-testid="dependency-index">
          {index.map((d) => (
            <li key={d.id}>
              <code>{d.id}</code> — {d.name}: {d.sourceIds.length ? d.sourceIds.join(", ") : "no source lists it"}
              {d.sourceIds.length > 1 ? <> <Badge tone="amber">shared by {d.sourceIds.length} sources</Badge></> : null}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-sm font-bold">Pairwise overlap</h3>
        <ul className="mt-1 space-y-2" data-testid="dependency-pairs">
          {pairs.map((p) => (
            <li key={`${p.a}-${p.b}`} data-testid={`pair-${p.a}-${p.b}`} className="rounded border border-slate-300 p-2 text-sm">
              <div className="font-bold">
                {p.a} ↔ {p.b} <Badge tone={p.status === "declared_overlap" ? "amber" : "slate"}>{STATUS_TEXT[p.status]}</Badge>
              </div>
              {p.shared.length > 0 ? (
                <div>
                  Matching IDs: {p.shared.map((s) => (<code key={s.id} className="mr-2">{s.id}</code>))}
                </div>
              ) : null}
              <div className="text-slate-800">{p.text}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
