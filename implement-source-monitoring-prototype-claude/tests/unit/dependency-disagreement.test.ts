import { describe, expect, it } from "vitest";
import { dependencyIndex, dependencyPairs } from "../../src/engine/dependencies";
import { derive, hb, ob, scenario, srcDef as src } from "./helpers";

describe("declared dependency overlap (spec §5)", () => {
  const s = scenario({
    sources: [
      src("X", ["d1", "d2"], "complete"),
      src("Y", ["d2", "d3"], "complete"),
      src("Z", ["d1", "d2", "d3"], "partial"),
      src("U", [], "unknown"),
      src("V", [], "complete"),
    ],
  });
  const pairs = dependencyPairs(s);
  const P = (a: string, b: string) => pairs.find((p) => p.a === a && p.b === b)!;

  it("real intersection, including multi-dependency overlap", () => {
    expect(P("X", "Y").shared.map((d) => d.id)).toEqual(["d2"]);
    expect(P("X", "Z").shared.map((d) => d.id)).toEqual(["d1", "d2"]);
    expect(P("Y", "Z").shared.map((d) => d.id)).toEqual(["d2", "d3"]);
    expect(P("X", "Y").status).toBe("declared_overlap");
  });
  it("overlap is pairwise and overlapping, not a single mutually exclusive group", () => {
    expect(dependencyIndex(s).find((d) => d.id === "d2")!.sourceIds).toEqual(["X", "Y", "Z"]);
    expect(dependencyIndex(s).find((d) => d.id === "d1")!.sourceIds).toEqual(["X", "Z"]);
  });
  it("shows the matching ID and who asserted it; overlap with partial knowledge says others may exist", () => {
    expect(P("X", "Z").text).toMatch(/d1 \(Dep 1\), d2 \(Dep 2\)/);
    expect(P("X", "Z").text).toMatch(/test author/);
    expect(P("X", "Z").text).toMatch(/other shared dependencies may exist/);
    expect(P("X", "Z").assertions).toHaveLength(2);
  });
  it("unknown / partial knowledge stays unknown; no claim of independence", () => {
    expect(P("X", "U").status).toBe("unknown_or_partial");
    expect(P("U", "V").status).toBe("unknown_or_partial");
    expect(P("U", "V").text).toMatch(/nothing can be concluded/);
  });
  it("disjoint declared lists (both complete) are only 'no overlap declared', never 'independent'", () => {
    const d = dependencyPairs(scenario({ sources: [src("P", ["d1"]), src("Q", ["d3"])] }))[0];
    expect(d.status).toBe("no_overlap_declared");
    expect(d.text).toMatch(/No overlap declared/);
    expect(d.text).toMatch(/does not establish independence/);
    expect(d.text).not.toMatch(/\bindependent\b/i);
    expect(d.shared).toEqual([]);
  });
  it("missing labels do not imply independence", () => {
    const d = dependencyPairs(scenario({ sources: [src("P", [], "partial"), src("Q", [], "unknown")] }))[0];
    expect(d.status).toBe("unknown_or_partial");
    expect(JSON.stringify(d)).not.toMatch(/\bindependent\b/i);
  });
  it("no numeric score is produced", () => {
    for (const p of pairs) expect(Object.keys(p).sort()).toEqual(["a", "assertions", "b", "shared", "status", "text"]);
  });
});

describe("limited disagreement cue (spec §5)", () => {
  const T = 20;
  const cmp = (events: ReturnType<typeof ob>[], tol = 1) =>
    derive(scenario({ comparisonToleranceSeconds: tol, events: [hb("h", "X", 0), ...events] }), T).comparisons;

  it("same context, differing values, synchronized clocks, within tolerance: reports differ, no winner", () => {
    const c = cmp([ob("a", "X", 5, "on", 5), ob("b", "Y", 5, "off", 5)]);
    expect(c).toHaveLength(1);
    expect(c[0].verdict).toBe("reports_differ");
    expect(Object.keys(c[0])).not.toContain("winner");
    expect(c[0].rule).toMatch(/No winner is chosen/);
    expect(c[0].a.value).toBe("on");
    expect(c[0].b.value).toBe("off");
  });
  it("same values: reports match (not a verification)", () => {
    expect(cmp([ob("a", "X", 5, "on", 5), ob("b", "Y", 5, "on", 5)])[0].verdict).toBe("reports_match");
  });
  it("time-window boundary: delta == tolerance is comparable; tolerance+1 is not", () => {
    expect(cmp([ob("a", "X", 5, "on", 5), ob("b", "Y", 6, "off", 6)], 1)[0].verdict).toBe("reports_differ");
    const out = cmp([ob("a", "X", 5, "on", 5), ob("b", "Y", 7, "off", 7)], 1)[0];
    expect(out.verdict).toBe("not_comparable");
    expect(out.reasons[0]).toBe("not comparable / insufficient information");
    expect(out.reasons.join(" ")).toMatch(/outside the declared tolerance of 1 s/);
  });
  it("different context: no pairing at all (listed as not comparable)", () => {
    const d = derive(scenario({ events: [ob("a", "X", 5, "on", 5, "synthetic_synchronized", { context: "c1" }), ob("b", "Y", 5, "off", 5, "synthetic_synchronized", { context: "c2" })] }), T);
    expect(d.comparisons).toHaveLength(0);
    expect(d.noSharedKey[0].text).toMatch(/not comparable \/ insufficient information/);
  });
  it("different subject or property: not paired", () => {
    for (const x of [{ subject: "other" }, { property: "other" }]) {
      const d = derive(scenario({ events: [ob("a", "X", 5, "on", 5), ob("b", "Y", 5, "off", 5, "synthetic_synchronized", x)] }), T);
      expect(d.comparisons).toHaveLength(0);
      expect(d.noSharedKey).toHaveLength(1);
    }
  });
  it("incompatible units: not comparable", () => {
    const c = cmp([ob("a", "X", 5, "on", 5), ob("b", "Y", 5, "off", 5, "synthetic_synchronized", { unit: "celsius" })]);
    expect(c[0].verdict).toBe("not_comparable");
    expect(c[0].reasons.join(" ")).toMatch(/units not compatible/);
  });
  it("unverified / unknown clock, unknown observation time, skew, or missing value: not comparable", () => {
    const cases: [ReturnType<typeof ob>, RegExp][] = [
      [ob("b", "Y", 5, "off", 5, "unverified"), /not verified/],
      [ob("b", "Y", 5, "off", 5, "unknown"), /not verified/],
      [ob("b", "Y", 5, "off", "unknown"), /time unknown/],
      [ob("b", "Y", 5, "off", 9), /clock skew/],
      [ob("b", "Y", 5, null, 5), /value is missing/],
    ];
    for (const [b, re] of cases) {
      const c = cmp([ob("a", "X", 5, "on", 5), b]);
      expect(c[0].verdict).toBe("not_comparable");
      expect(c[0].reasons.join(" ")).toMatch(re);
    }
  });
  it("an absent or silent source is not an opposing observation", () => {
    const d = derive(scenario({ events: [hb("h", "X", 0), ob("a", "X", 5, "on", 5)] }), T);
    expect(d.comparisons).toHaveLength(0);
    expect(d.sourcesWithoutObservations).toEqual(["Y"]);
  });
  it("a source's own successive reports are not a disagreement between sources", () => {
    expect(cmp([ob("a", "X", 5, "on", 5), ob("b", "X", 6, "off", 6)])).toHaveLength(0);
  });
  it("only received observations are compared (causal)", () => {
    const s = scenario({ events: [ob("a", "X", 5, "on", 5), ob("b", "Y", 9, "off", 5, "synthetic_synchronized", { backfilled: true })] });
    expect(derive(s, 8).comparisons).toHaveLength(0);
    expect(derive(s, 9).comparisons).toHaveLength(1);
  });
  it("old comparisons are marked historical with timestamps and clock caveats", () => {
    const s = scenario({ events: [ob("a", "X", 5, "on", 5), ob("b", "Y", 5, "off", 5)] });
    expect(derive(s, 9).comparisons[0].historical).toBe(false);
    const old = derive(s, 10).comparisons[0];
    expect(old.historical).toBe(true);
    expect(old.historicalText).toMatch(/HISTORICAL/);
    const unverified = derive(scenario({ events: [ob("a", "X", 5, "on", 5, "unverified"), ob("b", "Y", 5, "off", 5, "unverified")] }), 6).comparisons[0];
    expect(unverified.historical).toBe(true);
    expect(unverified.historicalText).toMatch(/cannot be relied on/);
  });
  it("comparison surfaces dependency overlap text for the pair", () => {
    const s = scenario({ sources: [src("X", ["d1"]), src("Y", ["d1"])], events: [ob("a", "X", 5, "on", 5), ob("b", "Y", 5, "off", 5)] });
    const c = derive(s, 5).comparisons[0];
    expect(c.sharedDependencies.map((d) => d.id)).toEqual(["d1"]);
    expect(c.dependencyText).toMatch(/Declared shared dependency: d1/);
  });
});
