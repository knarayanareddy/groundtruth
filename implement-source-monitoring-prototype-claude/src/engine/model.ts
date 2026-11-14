import type { EffectiveEvent, LogEvent, Model, Scenario, UserSynthetic } from "./types";

export const EMPTY_USER: UserSynthetic = { events: [], dropWindows: [] };

/** Stable total order: receivedAt ascending, then id by plain UTF-16 code-unit comparison (locale independent). */
export function compareEvents(a: LogEvent, b: LogEvent): number {
  if (a.receivedAt !== b.receivedAt) return a.receivedAt - b.receivedAt;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

export function buildModel(scenario: Scenario, user: UserSynthetic = EMPTY_USER): Model {
  const events: EffectiveEvent[] = [];
  for (const e of scenario.events) {
    let windowId: string | undefined;
    if (e.type === "heartbeat") {
      const w = user.dropWindows.find(
        (d) => d.sourceId === e.sourceId && e.receivedAt >= d.fromT && e.receivedAt < d.untilT,
      );
      windowId = w?.id;
    }
    events.push({ event: e, origin: "scenario", dropped: windowId !== undefined, dropWindowId: windowId });
  }
  for (const e of user.events) {
    events.push({ event: e, origin: "user_synthetic", dropped: false });
  }
  events.sort((x, y) => compareEvents(x.event, y.event));
  return {
    scenario,
    user,
    events,
    sourceIndex: new Map(scenario.sources.map((s, i) => [s.id, i])),
    threshold: scenario.heartbeatThresholdSeconds,
    recency: scenario.observationRecencySeconds ?? scenario.heartbeatThresholdSeconds,
    tolerance: scenario.comparisonToleranceSeconds,
  };
}
