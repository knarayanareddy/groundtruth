import { LIMITS } from "./constants";
import { dependencyPairs, pairKey } from "./dependencies";
import type { Comparison, Model, NoSharedKey, ObservationView, ObsRef } from "./types";

const NOT_COMPARABLE = "not comparable / insufficient information";

function ref(v: ObservationView): ObsRef {
  return {
    eventId: v.eventId,
    sourceId: v.sourceId,
    value: v.value,
    observedAt: v.observedAt,
    receivedAt: v.receivedAt,
    clockQuality: v.clockQuality,
    backfilled: v.backfilled,
  };
}

export function comparisonRule(tolerance: number): string {
  return (
    "Comparable only if: different sources; identical subject, property and context; identical unit string; both values present; " +
    `both clocks synthetic_synchronized with known observedAt that is not after receivedAt; |observedAt difference| <= ${tolerance} s. ` +
    "No winner is chosen."
  );
}

/**
 * Limited, deterministic disagreement cue over RECEIVED observations (views must already be causal).
 * Absent or silent sources are never an opposing observation. Same-source pairs are not compared.
 */
export function compareObservations(
  model: Model,
  views: ObservationView[],
): { comparisons: Comparison[]; truncated: boolean; noSharedKey: NoSharedKey[]; withoutObservations: string[] } {
  const rule = comparisonRule(model.tolerance);
  const pairInfo = new Map(
    dependencyPairs(model.scenario).map((p) => [pairKey(p.a, p.b, model.sourceIndex), p] as const),
  );

  const groups = new Map<string, ObservationView[]>();
  for (const v of views) {
    const k = JSON.stringify([v.comparisonKey.subject, v.comparisonKey.property, v.comparisonKey.context]);
    const g = groups.get(k);
    if (g) g.push(v);
    else groups.set(k, [v]);
  }

  const comparisons: Comparison[] = [];
  let truncated = false;
  const groupKeysBySource = new Map<string, Set<string>>();
  for (const [k, g] of groups) {
    for (const v of g) {
      let s = groupKeysBySource.get(v.sourceId);
      if (!s) groupKeysBySource.set(v.sourceId, (s = new Set()));
      s.add(k);
    }
  }

  outer: for (const [, g] of groups) {
    for (let i = 0; i < g.length; i++) {
      for (let j = i + 1; j < g.length; j++) {
        const x = g[i];
        const y = g[j];
        if (x.sourceId === y.sourceId) continue;
        if (comparisons.length >= LIMITS.maxComparisons) {
          truncated = true;
          break outer;
        }
        const reasons: string[] = [];
        if (x.comparisonKey.unit !== y.comparisonKey.unit) {
          reasons.push(`units not compatible ("${x.comparisonKey.unit}" vs "${y.comparisonKey.unit}")`);
        }
        if (x.value === null || y.value === null) reasons.push("a report value is missing");
        for (const v of [x, y]) {
          if (v.clockQuality !== "synthetic_synchronized") {
            reasons.push(`clock of ${v.sourceId} is ${v.clockQuality} (not verified)`);
          }
          if (v.timing === "unknown_time") reasons.push(`observation time unknown for ${v.sourceId}`);
          if (v.timing === "clock_skew_future") reasons.push(`clock skew flagged for ${v.sourceId} (observedAt after receivedAt)`);
        }
        const timesUsable =
          typeof x.observedAt === "number" &&
          typeof y.observedAt === "number" &&
          x.timing !== "clock_skew_future" &&
          y.timing !== "clock_skew_future";
        if (timesUsable) {
          const delta = Math.abs((x.observedAt as number) - (y.observedAt as number));
          if (delta > model.tolerance) {
            reasons.push(`observation times differ by ${delta} s, outside the declared tolerance of ${model.tolerance} s`);
          }
        }

        const verdict: Comparison["verdict"] =
          reasons.length > 0 ? "not_comparable" : x.value !== y.value ? "reports_differ" : "reports_match";

        const histReasons: string[] = [];
        for (const v of [x, y]) {
          if (v.backfilled) histReasons.push(`${v.sourceId} report is backfilled`);
          if (v.timing === "old_claimed") histReasons.push(`${v.sourceId} claimed age ${v.observationAge} s >= ${model.recency} s`);
          if (v.timing === "claimed_unverified_clock" || v.timing === "unknown_time" || v.timing === "clock_skew_future") {
            histReasons.push(`${v.sourceId} timing cannot be relied on`);
          }
        }
        const historical = histReasons.length > 0;
        const pi = pairInfo.get(pairKey(x.sourceId, y.sourceId, model.sourceIndex));
        comparisons.push({
          id: `${x.eventId}~${y.eventId}`,
          a: ref(x),
          b: ref(y),
          key: {
            subject: x.comparisonKey.subject,
            property: x.comparisonKey.property,
            context: x.comparisonKey.context,
            unitA: x.comparisonKey.unit,
            unitB: y.comparisonKey.unit,
          },
          verdict,
          reasons: verdict === "not_comparable" ? [NOT_COMPARABLE, ...reasons] : [],
          historical,
          historicalText: historical
            ? `HISTORICAL context — not a claim that these reports are current. ${histReasons.join("; ")}.`
            : "Both reports are within the recency window by their claimed times on a synthetic synchronized clock (still claims, not verified facts).",
          dependencyText: pi ? pi.text : "No dependency information.",
          sharedDependencies: pi ? pi.shared : [],
          rule,
        });
      }
    }
  }

  const sourceIds = [...model.sourceIndex.keys()];
  const noSharedKey: NoSharedKey[] = [];
  const withObs = sourceIds.filter((id) => groupKeysBySource.has(id));
  for (let i = 0; i < withObs.length; i++) {
    for (let j = i + 1; j < withObs.length; j++) {
      const a = groupKeysBySource.get(withObs[i])!;
      const b = groupKeysBySource.get(withObs[j])!;
      let shared = false;
      for (const k of a) if (b.has(k)) shared = true;
      if (!shared) {
        noSharedKey.push({
          sourceA: withObs[i],
          sourceB: withObs[j],
          text: `${NOT_COMPARABLE}: ${withObs[i]} and ${withObs[j]} have no observation with the same explicit subject, property and context.`,
        });
      }
    }
  }
  const withoutObservations = sourceIds.filter((id) => !groupKeysBySource.has(id));
  return { comparisons, truncated, noSharedKey, withoutObservations };
}
