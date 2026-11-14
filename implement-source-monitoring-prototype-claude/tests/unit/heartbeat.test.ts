import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildModel } from "../../src/engine/model";
import { deriveAt } from "../../src/engine/derive";
import { initialReplay, replayReducer, replayStatus, type ReplayState } from "../../src/engine/replay";
import { derive, hb, ob, root, scenario, srcOf as src, state } from "./helpers";
import type { UserSynthetic } from "../../src/engine/types";

describe("heartbeat state machine", () => {
  it("no data at all: every source WAITING / UNKNOWN, never fresh", () => {
    const s = scenario();
    for (const T of [0, 1, 30, 60]) {
      const d = derive(s, T);
      expect(d.sources.every((x) => x.heartbeatState === "WAITING_UNKNOWN")).toBe(true);
      expect(d.transitions).toEqual([]);
      expect(d.visibleEvents).toEqual([]);
    }
  });

  it("threshold equality: stale exactly at last+threshold, fresh one second before", () => {
    const s = scenario({ events: [hb("h1", "X", 10)] });
    expect(state(s, "X", 9)).toBe("WAITING_UNKNOWN");
    expect(state(s, "X", 10)).toBe("FRESH_HEARTBEAT");
    expect(state(s, "X", 14)).toBe("FRESH_HEARTBEAT");
    expect(state(s, "X", 15)).toBe("STALE_UNKNOWN");
    expect(state(s, "X", 60)).toBe("STALE_UNKNOWN");
  });

  it("heartbeat exactly at the threshold is processed first: fresh, and no stale transition is recorded", () => {
    const s = scenario({ events: [hb("h1", "X", 0), hb("h2", "X", 5)] });
    expect(state(s, "X", 5)).toBe("FRESH_HEARTBEAT");
    expect(derive(s, 5).transitions.map((t) => t.to)).toEqual(["FRESH_HEARTBEAT"]);
    // one second later than the threshold: stale in between, recorded at the exact boundary
    const s2 = scenario({ events: [hb("h1", "X", 0), hb("h2", "X", 6)] });
    expect(derive(s2, 6).transitions.map((t) => `${t.to}@${t.at}`)).toEqual(["FRESH_HEARTBEAT@0", "STALE_UNKNOWN@5", "FRESH_HEARTBEAT@6"]);
  });

  it("observations (including recently received backfill) never reset heartbeat freshness", () => {
    const s = scenario({
      events: [hb("h1", "X", 0), ob("o1", "X", 8, "v", 8), ob("o2", "X", 9, "v", 1, "synthetic_synchronized", { backfilled: true })],
    });
    expect(state(s, "X", 8)).toBe("STALE_UNKNOWN");
    expect(state(s, "X", 9)).toBe("STALE_UNKNOWN");
    const x = src(derive(s, 9), "X");
    expect(x.lastPacketReceivedAt).toBe(9);
    expect(x.lastHeartbeatReceivedAt).toBe(0);
    expect(derive(s, 9).transitions.map((t) => t.to)).toEqual(["FRESH_HEARTBEAT", "STALE_UNKNOWN"]);
  });

  it("a source that only sends observations stays WAITING / UNKNOWN", () => {
    const s = scenario({ events: [ob("o1", "X", 3, "v", 3)] });
    expect(state(s, "X", 3)).toBe("WAITING_UNKNOWN");
  });

  it("recovery transition appears only when a heartbeat arrives", () => {
    const s = scenario({ events: [hb("h1", "X", 0), ob("o1", "X", 9, "v", 9), hb("h2", "X", 12)] });
    const t11 = derive(s, 11).transitions;
    expect(t11.some((t) => t.cause === "heartbeat_after_timeout")).toBe(false);
    expect(derive(s, 12).transitions.some((t) => t.cause === "heartbeat_after_timeout" && t.at === 12)).toBe(true);
  });

  it("large forward jump captures the threshold transition at its exact boundary; same list as stepping", () => {
    const s = scenario({ events: [hb("h1", "X", 0), hb("h2", "X", 3), hb("h3", "X", 20)] });
    const jumped = derive(s, 40).transitions.map((t) => `${t.to}@${t.at}`);
    expect(jumped).toEqual(["FRESH_HEARTBEAT@0", "STALE_UNKNOWN@8", "FRESH_HEARTBEAT@20", "STALE_UNKNOWN@25"]);
    // accumulate transitions by stepping one second at a time and de-duplicating by identity
    const seen: string[] = [];
    for (let T = 0; T <= 40; T++) {
      for (const t of derive(s, T).transitions) {
        const k = `${t.to}@${t.at}`;
        if (!seen.includes(k)) seen.push(k);
      }
    }
    expect(seen).toEqual(jumped);
  });

  it("long outage before recovery is reported as a stale→fresh transition (not as plain fresh)", () => {
    const s = scenario({ durationSeconds: 3600, events: [hb("h1", "X", 0), hb("h2", "X", 2400)] });
    const t = derive(s, 2400).transitions;
    expect(t.map((x) => `${x.from}>${x.to}@${x.at}`)).toEqual([
      "WAITING_UNKNOWN>FRESH_HEARTBEAT@0",
      "FRESH_HEARTBEAT>STALE_UNKNOWN@5",
      "STALE_UNKNOWN>FRESH_HEARTBEAT@2400",
    ]);
  });

  it("repeated derivation never creates duplicate transitions and is pure", () => {
    const s = scenario({ events: [hb("h1", "X", 0), hb("h2", "X", 9)] });
    const model = buildModel(s);
    const a = deriveAt(model, 20);
    const b = deriveAt(model, 20);
    const c = deriveAt(model, 20);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    const keys = a.transitions.map((t) => `${t.sourceId}${t.at}${t.to}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("ordering: same-time, delayed, duplicate, out-of-order", () => {
  it("same-time events: all packets at T apply before state at T; order is (receivedAt, id), plain code units", () => {
    const s = scenario({ events: [hb("b", "X", 4), hb("B", "X", 4), hb("a", "Y", 4), hb("a0", "Y", 4)] });
    const ids = derive(s, 4).visibleEvents.map((e) => e.id);
    expect(ids).toEqual(["B", "a", "a0", "b"]); // uppercase sorts before lowercase: code-unit order, not locale
    expect(derive(s, 4).sources.every((x) => x.heartbeatState === "FRESH_HEARTBEAT")).toBe(true);
    expect(src(derive(s, 4), "X").lastPacketEventId).toBe("b");
  });

  it("out-of-order file order yields the same replay as sorted order, and nothing is visible before its receivedAt", () => {
    const evs = [hb("h3", "X", 12), hb("h1", "X", 0), hb("h2", "X", 6)];
    const shuffled = scenario({ events: evs });
    const sorted = scenario({ events: [...evs].sort((a, b) => a.receivedAt - b.receivedAt) });
    for (let T = 0; T <= 20; T++) expect(derive(shuffled, T)).toEqual(derive(sorted, T));
    expect(JSON.stringify(derive(shuffled, 5))).not.toContain('"h3"');
  });

  it("a delayed (late-arriving) heartbeat does not rewrite earlier states", () => {
    const withLate = scenario({ events: [hb("h1", "X", 0), hb("late", "X", 20)] });
    const without = scenario({ events: [hb("h1", "X", 0)] });
    for (let T = 0; T < 20; T++) expect(derive(withLate, T)).toEqual(derive(without, T));
  });

  it("duplicate heartbeats with the same receivedAt are separate events and idempotent for freshness", () => {
    const s = scenario({ events: [hb("h1", "X", 0), hb("h2", "X", 0)] });
    expect(src(derive(s, 0), "X").heartbeatCount).toBe(2);
    expect(derive(s, 0).transitions).toHaveLength(1);
  });
});

describe("observation timing and clocks", () => {
  it("separates transport age, heartbeat age and observation age", () => {
    const s = scenario({ events: [hb("h", "X", 0), ob("o", "X", 10, "v", 6)] });
    const x = src(derive(s, 13), "X");
    expect(x.heartbeatAge).toBe(13);
    expect(x.lastPacketReceivedAt).toBe(10);
    const o = x.lastObservationReceived!;
    expect([o.receiveAge, o.observationAge, o.receiveLag]).toEqual([3, 7, 4]);
  });

  it("unverified and unknown clocks are never labelled fresh/recent", () => {
    for (const q of ["unverified", "unknown"] as const) {
      const s = scenario({ events: [ob("o", "X", 5, "v", 5, q)] });
      const o = src(derive(s, 5), "X").observations[0];
      expect(o.timing).toBe("claimed_unverified_clock");
      expect(o.timing).not.toBe("recent_claimed");
      expect(o.timingText).toMatch(/never labelled fresh/);
    }
  });

  it("unknown observation time: age is null", () => {
    const s = scenario({ events: [ob("o", "X", 5, "v", "unknown")] });
    const o = src(derive(s, 5), "X").observations[0];
    expect(o.timing).toBe("unknown_time");
    expect(o.observationAge).toBeNull();
  });

  it("future observedAt (clock skew) is flagged deterministically, not fresh, age not computed, excluded from newest time", () => {
    const s = scenario({ events: [ob("o", "X", 5, "v", 9)] });
    const x = src(derive(s, 9), "X");
    expect(x.observations[0].timing).toBe("clock_skew_future");
    expect(x.observations[0].observationAge).toBeNull();
    expect(x.newestClaimedObservedAt).toBeNull();
    expect(x.observations[0].timingText).toMatch(/CLOCK SKEW/);
  });

  it("synchronized recent vs old claimed age uses the declared recency window", () => {
    const s = scenario({ events: [ob("o", "X", 5, "v", 5)] });
    expect(src(derive(s, 9), "X").observations[0].timing).toBe("recent_claimed");
    expect(src(derive(s, 10), "X").observations[0].timing).toBe("old_claimed");
  });

  it("historical observations are kept with their times, not overwritten", () => {
    const s = scenario({ events: [ob("o1", "X", 2, "a", 2), ob("o2", "X", 6, "b", 6)] });
    const x = src(derive(s, 10), "X");
    expect(x.observations.map((o) => [o.eventId, o.value, o.observedAt])).toEqual([["o1", "a", 2], ["o2", "b", 6]]);
  });
});

describe("user synthetic events and drop windows", () => {
  const base = scenario({ events: [hb("h1", "X", 0), hb("h2", "X", 5), hb("h3", "X", 10)] });
  it("an injected synthetic heartbeat is an explicit event and makes the source fresh at its receivedAt", () => {
    const user: UserSynthetic = { events: [{ id: "syn-hb-1", sourceId: "Y", receivedAt: 3, type: "heartbeat", synthetic: true, authoredAtT: 3 }], dropWindows: [] };
    expect(state(base, "Y", 2, user)).toBe("WAITING_UNKNOWN");
    expect(state(base, "Y", 3, user)).toBe("FRESH_HEARTBEAT");
    expect(derive(base, 3, user).visibleEvents.find((e) => e.id === "syn-hb-1")!.origin).toBe("user_synthetic");
  });
  it("a drop window removes only original-log heartbeats in its range; they are shown as dropped, not received", () => {
    const user: UserSynthetic = { events: [], dropWindows: [{ id: "drop-1", sourceId: "X", fromT: 4, untilT: 7, authoredAtT: 3 }] };
    expect(state(base, "X", 5, user)).toBe("STALE_UNKNOWN");
    const d = derive(base, 5, user);
    expect(d.visibleEvents.find((e) => e.id === "h2")!.dropped).toBe(true);
    expect(src(d, "X").lastHeartbeatReceivedAt).toBe(0);
    expect(src(d, "X").droppedHeartbeatCount).toBe(1);
    expect(state(base, "X", 10, user)).toBe("FRESH_HEARTBEAT");
    // states before the window are unchanged
    for (let T = 0; T < 4; T++) expect(derive(base, T, user)).toEqual(derive(base, T));
  });
});

describe("replay clock: step / play / seek equivalence", () => {
  const s = scenario({ durationSeconds: 30, events: [hb("h1", "X", 0), hb("h2", "X", 3), hb("h3", "X", 20), ob("o1", "Y", 4, "v", 4)] });
  const model = buildModel(s);
  const run = (r: ReplayState, ...actions: Parameters<typeof replayReducer>[1][]) => actions.reduce(replayReducer, r);

  it("reaching T by stepping, seeking, or playing gives identical derived state", () => {
    for (const T of [0, 1, 4, 5, 8, 19, 20, 25, 30]) {
      let stepped = initialReplay(30);
      for (let i = 0; i < T; i++) stepped = replayReducer(stepped, { type: "step", delta: 1 });
      const sought = run(initialReplay(30), { type: "seek", T });
      let played = run(initialReplay(30), { type: "play" });
      // irregular timer ticks (throttled tab): 700 ms, 2300 ms, etc., totalling T seconds at 1x
      let remaining = T * 1000;
      const ticks = [700, 2300, 150, 4850, 90, 12000, 30000];
      let k = 0;
      while (remaining > 0) {
        const w = Math.min(remaining, ticks[k++ % ticks.length]);
        played = replayReducer(played, { type: "advance", wallMs: w });
        remaining -= w;
      }
      expect(stepped.T).toBe(T);
      expect(sought.T).toBe(T);
      expect(played.T).toBe(T);
      const ref = deriveAt(model, T);
      expect(deriveAt(model, stepped.T)).toEqual(ref);
      expect(deriveAt(model, sought.T)).toEqual(ref);
      expect(deriveAt(model, played.T)).toEqual(ref);
    }
  });

  it("a huge throttled tick jumps forward, clamps at the end and stops", () => {
    const r = run(initialReplay(30), { type: "play" }, { type: "advance", wallMs: 3_600_000 });
    expect(r.T).toBe(30);
    expect(r.playing).toBe(false);
    expect(replayStatus(r)).toBe("STOPPED (end of log)");
    expect(deriveAt(model, r.T).transitions.some((t) => t.at === 8)).toBe(true);
  });

  it("speed scales virtual time; sub-second remainder is carried", () => {
    let r = run(initialReplay(30), { type: "setSpeed", speed: 2 }, { type: "play" });
    r = replayReducer(r, { type: "advance", wallMs: 400 });
    expect(r.T).toBe(0);
    r = replayReducer(r, { type: "advance", wallMs: 400 });
    expect(r.T).toBe(1); // 800 ms wall × 2 = 1.6 s virtual
  });

  it("pause stops advancing; seeking back then replaying reproduces the same transitions", () => {
    let r = run(initialReplay(30), { type: "play" }, { type: "advance", wallMs: 9000 });
    const forward = deriveAt(model, r.T);
    r = replayReducer(r, { type: "pause" });
    expect(replayStatus(r)).toBe("PAUSED");
    expect(replayReducer(r, { type: "advance", wallMs: 5000 }).T).toBe(9);
    r = replayReducer(r, { type: "seek", T: 2 });
    expect(deriveAt(model, r.T).transitions).toEqual(forward.transitions.filter((t) => t.at <= 2));
    r = run(r, { type: "play" }, { type: "advance", wallMs: 7000 });
    expect(deriveAt(model, r.T)).toEqual(forward);
  });

  it("play at the end restarts from 0; restart pauses at 0; seek clamps", () => {
    let r = run(initialReplay(30, 30), { type: "play" });
    expect([r.T, r.playing]).toEqual([0, true]);
    r = run(r, { type: "restart" });
    expect([r.T, r.playing]).toEqual([0, false]);
    expect(run(r, { type: "seek", T: 999 }).T).toBe(30);
    expect(run(r, { type: "seek", T: -5 }).T).toBe(0);
    expect(run(r, { type: "step", delta: -1 }).T).toBe(0);
  });
});

describe("determinism: no wall clock or randomness in the engine", () => {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".ts")) files.push(p);
    }
  };
  walk(join(root, "src/engine"));
  const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  it.each(files.map((f) => [f.replace(root + "/", ""), f]))("%s has no Date/performance/Math.random/timers", (_n, f) => {
    const code = strip(readFileSync(f, "utf8"));
    expect(code).not.toMatch(/\bDate\b|performance\.|Math\.random|setTimeout|setInterval|requestAnimationFrame|crypto\.|localStorage/);
  });
});
