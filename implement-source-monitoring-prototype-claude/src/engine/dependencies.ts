import type { DependencyPair, Scenario } from "./types";

/**
 * Pairwise comparison of DECLARED dependency lists. These are human-provided metadata.
 * This module never reports independence, never computes a score.
 */
export function dependencyPairs(scenario: Scenario): DependencyPair[] {
  const depName = new Map(scenario.dependencies.map((d) => [d.id, d.name]));
  const out: DependencyPair[] = [];
  const src = scenario.sources;
  for (let i = 0; i < src.length; i++) {
    for (let j = i + 1; j < src.length; j++) {
      const a = src[i];
      const b = src[j];
      const bSet = new Set(b.dependencyIds);
      const shared = a.dependencyIds
        .filter((id) => bSet.has(id))
        .map((id) => ({ id, name: depName.get(id) ?? id }));
      const assertions = [
        { sourceId: a.id, declaredBy: a.dependencyDeclaredBy },
        { sourceId: b.id, declaredBy: b.dependencyDeclaredBy },
      ];
      let status: DependencyPair["status"];
      let text: string;
      if (shared.length > 0) {
        status = "declared_overlap";
        text =
          `Declared shared dependency: ${shared.map((s) => `${s.id} (${s.name})`).join(", ")}. ` +
          `Declared by: ${a.id} — ${a.dependencyDeclaredBy}; ${b.id} — ${b.dependencyDeclaredBy}. ` +
          `This is human-provided metadata, not verified.` +
          (a.dependencyKnowledge !== "complete" || b.dependencyKnowledge !== "complete"
            ? ` Dependency knowledge is ${a.dependencyKnowledge} / ${b.dependencyKnowledge}, so other shared dependencies may exist.`
            : ` Even with lists marked complete, further overlap may exist that nobody declared.`);
      } else if (a.dependencyKnowledge === "complete" && b.dependencyKnowledge === "complete") {
        status = "no_overlap_declared";
        text =
          "No overlap declared. Both lists are marked complete by their authors, but that is human-provided metadata. " +
          "It does not establish independence of power, networks, provenance, modalities or failure modes. Different labels do not prove independence.";
      } else {
        status = "unknown_or_partial";
        text =
          `Unknown. Dependency knowledge is ${a.dependencyKnowledge} / ${b.dependencyKnowledge}. ` +
          "No overlap is declared among the IDs that are listed, but nothing can be concluded about independence.";
      }
      out.push({ a: a.id, b: b.id, shared, assertions, status, text });
    }
  }
  return out;
}

export interface DependencyIndexEntry {
  id: string;
  name: string;
  sourceIds: string[];
}

/** For each declared dependency: which sources list it. */
export function dependencyIndex(scenario: Scenario): DependencyIndexEntry[] {
  return scenario.dependencies.map((d) => ({
    id: d.id,
    name: d.name,
    sourceIds: scenario.sources.filter((s) => s.dependencyIds.includes(d.id)).map((s) => s.id),
  }));
}

export function pairKey(a: string, b: string, order: Map<string, number>): string {
  const ia = order.get(a) ?? 0;
  const ib = order.get(b) ?? 0;
  return ia <= ib ? `${a}|${b}` : `${b}|${a}`;
}
