import { describe, expect, it } from "vitest";
import { buildModel } from "../../src/engine/model";
import { deriveAt } from "../../src/engine/derive";
import { derive, loadFixture, loadFixtureRaw } from "./helpers";
import { validateScenario } from "../../src/engine/validate";

const fx = loadFixture();
const S = (T: number) => derive(fx, T);
const src = (T: number, id: string) => S(T).sources.find((x) => x.sourceId === id)!;

describe("spec §4 reference fixture: exact shape", () => {
  it("validates and has duration >= 12, threshold 5, three sources", () => {
    expect(validateScenario(loadFixtureRaw()).ok).toBe(true);
    expect(fx.durationSeconds).toBeGreaterThanOrEqual(12);
    expect(fx.heartbeatThresholdSeconds).toBe(5);
    expect(fx.sources.map((s) => s.id)).toEqual(["A", "B", "C"]);
  });
  it("declares the specified dependencies", () => {
    const d = (id: string) => fx.sources.find((s) => s.id === id)!;
    expect(d("A").dependencyIds.sort()).toEqual(["gateway-1", "power-1"]);
    expect(d("B").dependencyIds.sort()).toEqual(["gateway-1", "power-2"]);
    expect(d("A").dependencyKnowledge).toBe("complete");
    expect(d("B").dependencyKnowledge).toBe("complete");
    expect(d("C").dependencyKnowledge).toBe("unknown");
    expect(fx.dependencies.every((x) => x.name.length > 0)).toBe(true);
  });
  it("has exactly the heartbeats A@0, B@0, A@5, B@7 with unique IDs", () => {
    const hbs = fx.events.filter((e) => e.type === "heartbeat").map((e) => `${e.sourceId}@${e.receivedAt}`);
    expect(hbs).toEqual(["A@0", "B@0", "A@5", "B@7"]);
    const ids = fx.events.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(fx.events.some((e) => e.sourceId === "C")).toBe(false);
  });
  it("has two comparable observations at t=2 and one B backfill observed 1 / received 6", () => {
    const obs = fx.events.filter((e) => e.type === "observation");
    expect(obs).toHaveLength(3);
    const a = obs.find((e) => e.sourceId === "A" && e.type === "observation")!;
    const b2 = obs.find((e) => e.id === "obs-B-2")!;
    const bf = obs.find((e) => e.id === "obs-B-backfill-6")!;
    if (a.type !== "observation" || b2.type !== "observation" || bf.type !== "observation") throw new Error();
    expect([a.receivedAt, a.observation.observedAt, a.observation.value, a.observation.clockQuality]).toEqual([2, 2, "on", "synthetic_synchronized"]);
    expect([b2.receivedAt, b2.observation.observedAt, b2.observation.value, b2.observation.clockQuality]).toEqual([2, 2, "off", "synthetic_synchronized"]);
    expect(a.observation.comparisonKey).toEqual(b2.observation.comparisonKey);
    expect([bf.receivedAt, bf.observation.observedAt, bf.observation.backfilled]).toEqual([6, 1, true]);
  });
});

describe("spec §4 expected snapshots", () => {
  it("T=0: A and B FRESH, C WAITING", () => {
    expect(src(0, "A").heartbeatState).toBe("FRESH_HEARTBEAT");
    expect(src(0, "B").heartbeatState).toBe("FRESH_HEARTBEAT");
    expect(src(0, "C").heartbeatState).toBe("WAITING_UNKNOWN");
    expect(src(0, "A").heartbeatAge).toBe(0);
  });

  it("T=2: both original values and their disagreement are visible with IDs and provenance; C unknown", () => {
    const s = S(2);
    const a = src(2, "A").observations[0];
    const b = src(2, "B").observations[0];
    expect([a.eventId, a.value, a.observedAt, a.clockQuality]).toEqual(["obs-A-2", "on", 2, "synthetic_synchronized"]);
    expect([b.eventId, b.value, b.observedAt, b.clockQuality]).toEqual(["obs-B-2", "off", 2, "synthetic_synchronized"]);
    expect(s.comparisons).toHaveLength(1);
    const c = s.comparisons[0];
    expect(c.verdict).toBe("reports_differ");
    expect([c.a.sourceId, c.a.value, c.b.sourceId, c.b.value]).toEqual(["A", "on", "B", "off"]);
    expect(c.sharedDependencies.map((d) => d.id)).toEqual(["gateway-1"]);
    expect(src(2, "C").heartbeatState).toBe("WAITING_UNKNOWN");
    expect(s.sourcesWithoutObservations).toContain("C");
    expect(Object.keys(c)).not.toContain("winner");
    expect(JSON.stringify(c.reasons)).not.toMatch(/correct|true value/i);
  });

  it("T=5: A fresh (event at exact threshold processed first); B stale exactly now; C unknown", () => {
    expect(src(5, "A").heartbeatState).toBe("FRESH_HEARTBEAT");
    expect(src(5, "A").heartbeatAge).toBe(0);
    expect(src(5, "A").lastHeartbeatEventId).toBe("hb-A-5");
    expect(src(5, "B").heartbeatState).toBe("STALE_UNKNOWN");
    expect(src(5, "B").heartbeatAge).toBe(5);
    expect(src(5, "B").staleSince).toBe(5);
    expect(src(5, "C").heartbeatState).toBe("WAITING_UNKNOWN");
    expect(src(4, "B").heartbeatState).toBe("FRESH_HEARTBEAT");
    expect(S(5).transitions.filter((t) => t.sourceId === "B").map((t) => [t.at, t.to])).toEqual([[0, "FRESH_HEARTBEAT"], [5, "STALE_UNKNOWN"]]);
    expect(S(5).transitions.filter((t) => t.sourceId === "A")).toHaveLength(1); // no stale transition for A
  });

  it("T=6: B stays stale despite the backfilled observation; packet time and heartbeat time differ; observation age and receive age differ", () => {
    const b = src(6, "B");
    expect(b.heartbeatState).toBe("STALE_UNKNOWN");
    expect(b.lastPacketReceivedAt).toBe(6);
    expect(b.lastPacketEventId).toBe("obs-B-backfill-6");
    expect(b.lastHeartbeatReceivedAt).toBe(0);
    const bf = b.lastObservationReceived!;
    expect(bf.eventId).toBe("obs-B-backfill-6");
    expect(bf.observedAt).toBe(1);
    expect(bf.backfilled).toBe(true);
    expect(bf.receiveAge).toBe(0);
    expect(bf.observationAge).toBe(5);
    expect(bf.receiveLag).toBe(5);
    expect(bf.timing).toBe("backfilled_historical");
    expect(b.newestClaimedObservedAt).toBe(2); // the backfill does not become "the newest observation"
    expect(S(6).transitions.filter((t) => t.sourceId === "B")).toHaveLength(2); // no recovery at 6
    // Backfill is outside the declared tolerance of 0 s against A's report: not comparable, not a second disagreement.
    const withBackfill = S(6).comparisons.find((c) => c.b.eventId === "obs-B-backfill-6" || c.a.eventId === "obs-B-backfill-6")!;
    expect(withBackfill.verdict).toBe("not_comparable");
    expect(withBackfill.reasons.join(" ")).toMatch(/outside the declared tolerance/);
    // original disagreement is still visible as history
    expect(S(6).comparisons.some((c) => c.verdict === "reports_differ")).toBe(true);
  });

  it("T=7: B FRESH again because a new heartbeat arrived; recovery is of heartbeat receipt only", () => {
    expect(src(7, "B").heartbeatState).toBe("FRESH_HEARTBEAT");
    expect(src(7, "B").heartbeatAge).toBe(0);
    const rec = S(7).transitions.find((t) => t.sourceId === "B" && t.to === "FRESH_HEARTBEAT" && t.at === 7)!;
    expect(rec.from).toBe("STALE_UNKNOWN");
    expect(rec.cause).toBe("heartbeat_after_timeout");
    expect(rec.eventId).toBe("hb-B-7");
    expect(rec.description).toMatch(/not evidence that the sensor or the monitored area recovered/);
    // the earlier disagreement is now flagged historical (claimed age 5 >= 5)
    expect(S(7).comparisons.find((c) => c.verdict === "reports_differ")!.historical).toBe(true);
  });

  it("T=10: A stale since its heartbeat at 5; B fresh age 3; C unknown", () => {
    expect(src(10, "A").heartbeatState).toBe("STALE_UNKNOWN");
    expect(src(10, "A").lastHeartbeatReceivedAt).toBe(5);
    expect(src(10, "A").staleSince).toBe(10);
    expect(src(10, "B").heartbeatState).toBe("FRESH_HEARTBEAT");
    expect(src(10, "B").heartbeatAge).toBe(3);
    expect(src(10, "C").heartbeatState).toBe("WAITING_UNKNOWN");
    expect(src(9, "A").heartbeatState).toBe("FRESH_HEARTBEAT");
  });

  it("T=12: B also stale (last heartbeat 7, exact threshold rule); A stays stale; C still unknown", () => {
    expect(src(11, "B").heartbeatState).toBe("FRESH_HEARTBEAT");
    expect(src(12, "B").heartbeatState).toBe("STALE_UNKNOWN");
    expect(src(12, "B").staleSince).toBe(12);
    expect(src(12, "A").heartbeatState).toBe("STALE_UNKNOWN");
    expect(src(12, "C").heartbeatState).toBe("WAITING_UNKNOWN");
  });

  it("the complete transition list at T=12 is exactly the specified one, with no fabricated initial or recovery entries", () => {
    expect(S(12).transitions.map((t) => `${t.sourceId}:${t.from}>${t.to}@${t.at}`)).toEqual([
      "A:WAITING_UNKNOWN>FRESH_HEARTBEAT@0",
      "B:WAITING_UNKNOWN>FRESH_HEARTBEAT@0",
      "B:FRESH_HEARTBEAT>STALE_UNKNOWN@5",
      "B:STALE_UNKNOWN>FRESH_HEARTBEAT@7",
      "A:FRESH_HEARTBEAT>STALE_UNKNOWN@10",
      "B:FRESH_HEARTBEAT>STALE_UNKNOWN@12",
    ]);
  });

  it("C never reports: no packet, no heartbeat, no transition at any T", () => {
    for (let T = 0; T <= 12; T++) {
      const c = src(T, "C");
      expect(c.heartbeatState).toBe("WAITING_UNKNOWN");
      expect(c.lastPacketReceivedAt).toBeNull();
      expect(c.lastHeartbeatReceivedAt).toBeNull();
      expect(c.observations).toHaveLength(0);
      expect(S(T).transitions.some((t) => t.sourceId === "C")).toBe(false);
    }
  });
});

describe("causality: nothing derived from the future", () => {
  it("snapshot at T is identical to the snapshot from a log truncated at T (all T)", () => {
    for (let T = 0; T <= 12; T++) {
      const truncated = { ...fx, events: fx.events.filter((e) => e.receivedAt <= T) };
      expect(deriveAt(buildModel(fx), T)).toEqual(deriveAt(buildModel(truncated), T));
    }
  });
  it("future event IDs and values never appear in the snapshot before their receivedAt", () => {
    for (const e of fx.events) {
      for (let T = 0; T < e.receivedAt; T++) {
        expect(JSON.stringify(S(T))).not.toContain(`"${e.id}"`);
      }
    }
  });
  it("changing future events does not change earlier snapshots", () => {
    const mutated = JSON.parse(JSON.stringify(fx));
    for (const e of mutated.events) {
      if (e.receivedAt > 3) {
        e.receivedAt = 11;
        if (e.type === "observation") e.observation.value = "tampered";
      }
    }
    for (let T = 0; T <= 3; T++) expect(deriveAt(buildModel(mutated), T)).toEqual(S(T));
  });
  it("transitions at T are a prefix of transitions at T+1 (no rewriting of earlier results)", () => {
    for (let T = 0; T < 12; T++) {
      const a = S(T).transitions;
      const b = S(T + 1).transitions;
      expect(b.slice(0, a.length)).toEqual(a);
    }
  });
});
