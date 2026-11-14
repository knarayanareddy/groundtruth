import { compareObservations } from "./disagreement";
import type {
  HeartbeatState,
  Model,
  ObservationEvent,
  ObservationView,
  Snapshot,
  SourceStatus,
  StateSegment,
  Transition,
  VisibleEvent,
} from "./types";

// Deliberately no Date, performance, Math.random or timers anywhere in src/engine (enforced by a test).

export const STATE_LABEL: Record<HeartbeatState, string> = {
  WAITING_UNKNOWN: "WAITING / UNKNOWN",
  FRESH_HEARTBEAT: "FRESH HEARTBEAT",
  STALE_UNKNOWN: "STALE / UNKNOWN",
};

export function observationView(ev: ObservationEvent, T: number, recency: number): ObservationView {
  const o = ev.observation;
  const receiveAge = T - ev.receivedAt;
  let timing: ObservationView["timing"];
  let observationAge: number | null = null;
  let receiveLag: number | null = null;
  let text: string;
  if (o.observedAt === "unknown") {
    timing = "unknown_time";
    text = "Source observation time unknown — observation age cannot be computed.";
  } else if (o.observedAt > ev.receivedAt) {
    timing = "clock_skew_future";
    text = `CLOCK SKEW: claimed observation time t=${o.observedAt} is after receipt t=${ev.receivedAt}. Flagged; age not computed; never treated as fresh or comparable.`;
  } else {
    observationAge = T - o.observedAt;
    receiveLag = ev.receivedAt - o.observedAt;
    if (o.clockQuality !== "synthetic_synchronized") {
      timing = "claimed_unverified_clock";
      text = `Claimed age ${observationAge} s on a clock marked "${o.clockQuality}". Not reliable; never labelled fresh.`;
    } else if (o.backfilled) {
      timing = "backfilled_historical";
      text = `Backfilled / historical: claimed source time t=${o.observedAt}, received t=${ev.receivedAt}. Claimed age ${observationAge} s. Not a current observation.`;
    } else if (observationAge < recency) {
      timing = "recent_claimed";
      text = `Claimed age ${observationAge} s (< ${recency} s) on a synthetic synchronized clock. Still a claim.`;
    } else {
      timing = "old_claimed";
      text = `Claimed age ${observationAge} s (>= ${recency} s). Older observation, not current.`;
    }
  }
  return {
    eventId: ev.id,
    sourceId: ev.sourceId,
    receivedAt: ev.receivedAt,
    receiveAge,
    observedAt: o.observedAt,
    observationAge,
    receiveLag,
    clockQuality: o.clockQuality,
    backfilled: o.backfilled,
    timing,
    timingText: text,
    value: o.value,
    comparisonKey: o.comparisonKey,
  };
}

/** Heartbeat state from the last received heartbeat time. */
export function heartbeatStateAt(lastHeartbeat: number | null, T: number, threshold: number): HeartbeatState {
  if (lastHeartbeat === null) return "WAITING_UNKNOWN";
  return T - lastHeartbeat >= threshold ? "STALE_UNKNOWN" : "FRESH_HEARTBEAT";
}

export function deriveAt(model: Model, T: number): Snapshot {
  const th = model.threshold;
  const visible = model.events.filter((e) => e.event.receivedAt <= T);
  const received = visible.filter((e) => !e.dropped);

  const visibleEvents: VisibleEvent[] = [];
  const allObsViews: ObservationView[] = [];
  for (const e of visible) {
    const base: VisibleEvent = {
      id: e.event.id,
      sourceId: e.event.sourceId,
      receivedAt: e.event.receivedAt,
      type: e.event.type,
      origin: e.origin,
      dropped: e.dropped,
      dropWindowId: e.dropWindowId,
    };
    if (e.event.type === "observation") {
      const v = observationView(e.event, T, model.recency);
      base.observation = v;
      allObsViews.push(v);
    }
    visibleEvents.push(base);
  }

  const sources: SourceStatus[] = [];
  const transitions: Transition[] = [];
  const segments: StateSegment[] = [];

  for (const s of model.scenario.sources) {
    const mine = received.filter((e) => e.event.sourceId === s.id);
    const hbs = mine.filter((e) => e.event.type === "heartbeat");
    const obs = allObsViews.filter((v) => v.sourceId === s.id);
    const last = mine.length ? mine[mine.length - 1].event : null;
    const lastHb = hbs.length ? hbs[hbs.length - 1].event : null;
    const lastHbAt = lastHb ? lastHb.receivedAt : null;
    const state = heartbeatStateAt(lastHbAt, T, th);

    // Exact-boundary transitions, computed analytically from received heartbeats at or before T.
    const mineTr: Transition[] = [];
    let prev: number | null = null;
    for (const h of hbs) {
      const hAt = h.event.receivedAt;
      if (prev === null) {
        mineTr.push({
          sourceId: s.id, sourceName: s.name, at: hAt, from: "WAITING_UNKNOWN", to: "FRESH_HEARTBEAT",
          cause: "first_heartbeat", eventId: h.event.id,
          description: `First heartbeat received (event ${h.event.id}). Waiting → fresh heartbeat.`,
        });
      } else if (hAt - prev > th) {
        mineTr.push({
          sourceId: s.id, sourceName: s.name, at: prev + th, from: "FRESH_HEARTBEAT", to: "STALE_UNKNOWN",
          cause: "heartbeat_timeout", eventId: null,
          description: `No heartbeat for ${th} s since the last one at t=${prev}. This means no recent heartbeat; the cause is not established.`,
        });
        mineTr.push({
          sourceId: s.id, sourceName: s.name, at: hAt, from: "STALE_UNKNOWN", to: "FRESH_HEARTBEAT",
          cause: "heartbeat_after_timeout", eventId: h.event.id,
          description: `Heartbeat received (event ${h.event.id}) after a gap. Recovery of heartbeat receipt only — not evidence that the sensor or the monitored area recovered.`,
        });
      }
      prev = hAt;
    }
    if (prev !== null && T - prev >= th) {
      mineTr.push({
        sourceId: s.id, sourceName: s.name, at: prev + th, from: "FRESH_HEARTBEAT", to: "STALE_UNKNOWN",
        cause: "heartbeat_timeout", eventId: null,
        description: `No heartbeat for ${th} s since the last one at t=${prev}. This means no recent heartbeat; the cause is not established.`,
      });
    }
    transitions.push(...mineTr);

    // State segments for the timeline (only up to T).
    let cur: HeartbeatState = "WAITING_UNKNOWN";
    let start = 0;
    for (const tr of mineTr) {
      if (tr.at > start) segments.push({ sourceId: s.id, from: start, to: tr.at, state: cur });
      cur = tr.to;
      start = tr.at;
    }
    if (T > start || segments.every((g) => g.sourceId !== s.id)) segments.push({ sourceId: s.id, from: start, to: T, state: cur });

    const claimed = obs
      .filter((v) => typeof v.observedAt === "number" && v.timing !== "clock_skew_future")
      .map((v) => v.observedAt as number);

    sources.push({
      sourceId: s.id,
      name: s.name,
      heartbeatState: state,
      lastPacketReceivedAt: last ? last.receivedAt : null,
      lastPacketEventId: last ? last.id : null,
      lastHeartbeatReceivedAt: lastHbAt,
      lastHeartbeatEventId: lastHb ? lastHb.id : null,
      heartbeatAge: lastHbAt === null ? null : T - lastHbAt,
      staleSince: state === "STALE_UNKNOWN" && lastHbAt !== null ? lastHbAt + th : null,
      heartbeatCount: hbs.length,
      droppedHeartbeatCount: visible.filter((e) => e.dropped && e.event.sourceId === s.id).length,
      observations: obs,
      lastObservationReceived: obs.length ? obs[obs.length - 1] : null,
      newestClaimedObservedAt: claimed.length ? Math.max(...claimed) : null,
    });
  }

  const order = model.sourceIndex;
  transitions.sort((a, b) => a.at - b.at || (order.get(a.sourceId) ?? 0) - (order.get(b.sourceId) ?? 0));

  const cmp = compareObservations(model, allObsViews);
  return {
    T,
    sources,
    visibleEvents,
    transitions,
    segments,
    comparisons: cmp.comparisons,
    comparisonsTruncated: cmp.truncated,
    noSharedKey: cmp.noSharedKey,
    sourcesWithoutObservations: cmp.withoutObservations,
  };
}
