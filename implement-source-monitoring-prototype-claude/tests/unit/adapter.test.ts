/**
 * Spec §8.6 — the optional adapter. Every test here exercises the SIMULATED feed: the frames are
 * built in-process by makeSimulatedPacket. No test in this file involves a physical device, a serial
 * port or a network, and none should be described as hardware-in-the-loop.
 */
import { describe, expect, it } from "vitest";
import {
  ADAPTER_PROTOCOL,
  HARDWARE_STATUS_LABEL,
  advanceAdapterClock,
  createAdapterState,
  deriveAdapterView,
  handlePollFailure,
  handlePollSuccess,
  makeSimulatedPacket,
  setOptIn,
  type AdapterState,
} from "../../src/engine/adapter";

const pkt = (seq: number, sourceId = "A") => makeSimulatedPacket(sourceId, seq);
const ok = (s: AdapterState, n = 1, sourceId = "A") => handlePollSuccess(s, s.highestCallbackSeq + n, pkt((s.lastSequenceNumber ?? 0) + n, sourceId));
const bad = (s: AdapterState, n = 1) => handlePollFailure(s, s.highestCallbackSeq + n, "simulated disconnect");

describe("adapter starts honest and inert", () => {
  it("is opt-in disabled, caches nothing, and carries the untested-hardware label", () => {
    const s = createAdapterState(5);
    const v = deriveAdapterView(s);
    expect(s.optedIn).toBe(false);
    expect(s.hardwareStatusLabel).toBe(HARDWARE_STATUS_LABEL);
    expect(HARDWARE_STATUS_LABEL).toMatch(/UNTESTED/);
    expect(v.cardStatus).toBe("OPT_IN_DISABLED");
    expect(v.cachedDataIsStaleOrDisconnected).toBe(false);
    expect(v.heartbeatAgeSec).toBeNull();
  });

  it("ignores frames and failures entirely while opt-in is off", () => {
    const s = createAdapterState(5);
    expect(handlePollSuccess(s, 1, pkt(1))).toEqual(s);
    expect(handlePollFailure(s, 1, "x")).toEqual(s);
  });

  it("does not fall back to a bogus threshold", () => {
    expect(createAdapterState(0).thresholdSec).toBe(5);
    expect(createAdapterState(Number.NaN).thresholdSec).toBe(5);
    expect(createAdapterState(-3).thresholdSec).toBe(5);
    expect(createAdapterState(7).thresholdSec).toBe(7);
  });
});

describe("§8.6 success → failure/disconnect → visibly stale → recovery", () => {
  it("a valid frame makes the card fresh, with ages at zero", () => {
    const v = deriveAdapterView(ok(setOptIn(createAdapterState(5), true)));
    expect(v.cardStatus).toBe("FRESH_HEARTBEAT_RECEIVED");
    expect(v.heartbeatAgeSec).toBe(0);
    expect(v.snapshotAgeSec).toBe(0);
    expect(v.cachedDataIsStaleOrDisconnected).toBe(false);
  });

  it("a poll failure immediately removes the fresh card — it never lingers as current", () => {
    let s = setOptIn(createAdapterState(5), true);
    s = ok(s);
    expect(deriveAdapterView(s).cardStatus).toBe("FRESH_HEARTBEAT_RECEIVED");
    s = bad(s);
    const v = deriveAdapterView(s);
    expect(v.cardStatus).toBe("DISCONNECTED_OR_POLL_FAILED_UNKNOWN");
    expect(v.cachedDataIsStaleOrDisconnected).toBe(true);
    expect(v.headline).toMatch(/NOT FRESH/);
    expect(s.consecutiveFailures).toBe(1);
  });

  it("the local snapshot age keeps advancing after a disconnect, and never reads as fresh", () => {
    let s = setOptIn(createAdapterState(5), true);
    s = ok(s);
    s = bad(s);
    const ages: number[] = [];
    for (let i = 0; i < 6; i++) {
      s = advanceAdapterClock(s, 1);
      const v = deriveAdapterView(s);
      expect(v.cardStatus).toBe("DISCONNECTED_OR_POLL_FAILED_UNKNOWN");
      expect(v.cachedDataIsStaleOrDisconnected).toBe(true);
      ages.push(v.snapshotAgeSec as number);
    }
    expect(ages).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("repeated failures accumulate and keep the card unknown", () => {
    let s = setOptIn(createAdapterState(5), true);
    s = ok(s);
    s = bad(s);
    s = bad(s);
    s = bad(s);
    expect(s.consecutiveFailures).toBe(3);
    expect(deriveAdapterView(s).cardStatus).toBe("DISCONNECTED_OR_POLL_FAILED_UNKNOWN");
  });

  it("an uninterrupted gap past the threshold goes stale even with no error", () => {
    let s = setOptIn(createAdapterState(5), true);
    s = ok(s);
    s = advanceAdapterClock(s, 4);
    expect(deriveAdapterView(s).cardStatus).toBe("FRESH_HEARTBEAT_RECEIVED");
    s = advanceAdapterClock(s, 1);
    const v = deriveAdapterView(s);
    expect(v.cardStatus).toBe("STALE_THRESHOLD_EXCEEDED_UNKNOWN");
    expect(v.heartbeatAgeSec).toBe(5);
    expect(v.cachedDataIsStaleOrDisconnected).toBe(true);
  });

  it("recovery after an outage is reported as receipt only, with the gap measured", () => {
    let s = setOptIn(createAdapterState(5), true);
    s = ok(s);
    s = advanceAdapterClock(s, 3);
    s = bad(s);
    s = advanceAdapterClock(s, 4);
    s = ok(s);
    const v = deriveAdapterView(s);
    expect(v.cardStatus).toBe("FRESH_HEARTBEAT_RECEIVED");
    expect(s.recoveredAfterOutageSec).toBe(7);
    expect(v.headline).toMatch(/RESUMED AFTER A 7s GAP/);
    // The note must not persist indefinitely as if the outage were recent.
    s = ok(s);
    expect(s.recoveredAfterOutageSec).toBeNull();
  });

  it("turning opt-in off discards the cache instead of leaving stale data behind", () => {
    let s = setOptIn(createAdapterState(5), true);
    s = ok(s);
    s = bad(s);
    s = setOptIn(s, false);
    expect(s.lastHeartbeatAtSec).toBeNull();
    expect(s.consecutiveFailures).toBe(0);
    expect(deriveAdapterView(s).cardStatus).toBe("OPT_IN_DISABLED");
  });
});

describe("§8.6 out-of-order callbacks cannot roll state backward", () => {
  it("a late success callback after a newer one is ignored and counted", () => {
    let s = setOptIn(createAdapterState(5), true);
    s = ok(s);
    s = ok(s);
    const before = s;
    // Callback sequence lower than the highest already processed.
    s = handlePollSuccess(s, 1, pkt(99, "B"));
    expect(s.ignoredOutOfOrderCallbacks).toBe(1);
    expect(s.lastSourceId).toBe(before.lastSourceId);
    expect(s.lastSequenceNumber).toBe(before.lastSequenceNumber);
  });

  it("a late failure callback cannot mark a newer healthy state as failed", () => {
    let s = setOptIn(createAdapterState(5), true);
    s = ok(s);
    s = ok(s);
    s = handlePollFailure(s, 1, "stale error");
    expect(s.consecutiveFailures).toBe(0);
    expect(deriveAdapterView(s).cardStatus).toBe("FRESH_HEARTBEAT_RECEIVED");
    expect(s.ignoredOutOfOrderCallbacks).toBe(1);
  });

  it("an equal sequence number is treated as a replay, not a new event", () => {
    let s = setOptIn(createAdapterState(5), true);
    s = handlePollSuccess(s, 5, pkt(1));
    s = handlePollSuccess(s, 5, pkt(2));
    expect(s.highestCallbackSeq).toBe(5);
    expect(s.lastSequenceNumber).toBe(1);
    expect(s.ignoredOutOfOrderCallbacks).toBe(1);
  });

  it("a non-integer callback sequence is refused", () => {
    let s = setOptIn(createAdapterState(5), true);
    s = handlePollSuccess(s, 1.5, pkt(1));
    expect(s.ignoredOutOfOrderCallbacks).toBe(1);
    expect(s.lastHeartbeatAtSec).toBeNull();
  });
});

describe("frame validation", () => {
  const cases: [string, unknown][] = [
    ["null payload", null],
    ["non-object payload", "heartbeat"],
    ["wrong protocol", { protocol: "some-other-protocol", sequenceNumber: 1, sourceId: "A" }],
    ["missing protocol", { sequenceNumber: 1, sourceId: "A" }],
    ["negative sequenceNumber", { protocol: ADAPTER_PROTOCOL, sequenceNumber: -1, sourceId: "A" }],
    ["non-numeric sequenceNumber", { protocol: ADAPTER_PROTOCOL, sequenceNumber: "1", sourceId: "A" }],
    ["NaN sequenceNumber", { protocol: ADAPTER_PROTOCOL, sequenceNumber: Number.NaN, sourceId: "A" }],
    ["empty sourceId", { protocol: ADAPTER_PROTOCOL, sequenceNumber: 1, sourceId: "  " }],
    ["missing sourceId", { protocol: ADAPTER_PROTOCOL, sequenceNumber: 1 }],
  ];
  it.each(cases)("%s is rejected and reported as a failure, not accepted as a heartbeat", (_name, payload) => {
    let s = setOptIn(createAdapterState(5), true);
    s = handlePollSuccess(s, 1, payload);
    expect(s.lastHeartbeatAtSec).toBeNull();
    expect(s.consecutiveFailures).toBe(1);
    expect(deriveAdapterView(s).cardStatus).toBe("DISCONNECTED_OR_POLL_FAILED_UNKNOWN");
  });

  it("falls back to sourceId when no label is supplied", () => {
    const s = ok(setOptIn(createAdapterState(5), true), 1, "C");
    expect(s.lastSourceLabel).toBe("C");
    const s2 = handlePollSuccess(setOptIn(createAdapterState(5), true), 1, { ...pkt(1), sourceLabel: "Charlie" });
    expect(s2.lastSourceLabel).toBe("Charlie");
  });
});

describe("clock handling", () => {
  it("ignores non-positive and non-finite deltas", () => {
    const s = createAdapterState(5);
    expect(advanceAdapterClock(s, 0)).toEqual(s);
    expect(advanceAdapterClock(s, -4)).toEqual(s);
    expect(advanceAdapterClock(s, Number.NaN)).toEqual(s);
    expect(advanceAdapterClock(s, Number.POSITIVE_INFINITY)).toEqual(s);
  });
  it("truncates fractional deltas so ages stay whole seconds", () => {
    expect(advanceAdapterClock(createAdapterState(5), 1.9).clockSec).toBe(1);
  });
});

describe("no hardware or network surface", () => {
  it("exposes no serial/usb/network API and reads no wall clock", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../../src/engine/adapter.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/navigator\.serial|navigator\.usb|fetch\(|XMLHttpRequest|WebSocket|new Date|performance\.now|Date\.now/);
  });
  it("is a pure function of its state: the same input always gives the same view", () => {
    const s = advanceAdapterClock(ok(setOptIn(createAdapterState(5), true)), 2);
    expect(JSON.stringify(deriveAdapterView(s))).toBe(JSON.stringify(deriveAdapterView(s)));
  });
});
