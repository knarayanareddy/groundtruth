import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildModel } from "../../src/engine/model";
import { deriveAt } from "../../src/engine/derive";
import { validateScenario } from "../../src/engine/validate";
import type {
  ClockQuality,
  HeartbeatEvent,
  ObservationEvent,
  Scenario,
  SourceDef,
  UserSynthetic,
} from "../../src/engine/types";

export const root = join(__dirname, "..", "..");

export function loadFixtureRaw(name = "fixtures/reference-fixture.json"): unknown {
  return JSON.parse(readFileSync(join(root, name), "utf8"));
}

export function loadFixture(): Scenario {
  const r = validateScenario(loadFixtureRaw());
  if (!r.ok) throw new Error("fixture invalid: " + JSON.stringify(r.errors));
  return r.value;
}

export const srcDef = (id: string, deps: string[] = [], knowledge: SourceDef["dependencyKnowledge"] = "complete"): SourceDef => ({
  id,
  name: `Source ${id}`,
  dependencyKnowledge: knowledge,
  dependencyIds: deps,
  dependencyDeclaredBy: "test author",
});

export const hb = (id: string, sourceId: string, receivedAt: number): HeartbeatEvent => ({ id, sourceId, receivedAt, type: "heartbeat" });

export const ob = (
  id: string,
  sourceId: string,
  receivedAt: number,
  value: string | null,
  observedAt: number | "unknown",
  clockQuality: ClockQuality = "synthetic_synchronized",
  extra: { backfilled?: boolean; subject?: string; property?: string; unit?: string; context?: string } = {},
): ObservationEvent => ({
  id,
  sourceId,
  receivedAt,
  type: "observation",
  observation: {
    comparisonKey: {
      subject: extra.subject ?? "subj",
      property: extra.property ?? "prop",
      unit: extra.unit ?? "none",
      context: extra.context ?? "ctx",
    },
    value,
    observedAt,
    clockQuality,
    backfilled: extra.backfilled ?? false,
  },
});

export function scenario(over: Partial<Scenario> = {}): Scenario {
  return {
    schema: "groundtruth-blindspot-scenario",
    schemaVersion: 1,
    engineVersion: "1.0",
    meta: { title: "test", description: "", dataOrigin: "synthetic" },
    timeUnit: "seconds",
    durationSeconds: 60,
    heartbeatThresholdSeconds: 5,
    comparisonToleranceSeconds: 1,
    dependencies: [
      { id: "d1", name: "Dep 1" },
      { id: "d2", name: "Dep 2" },
      { id: "d3", name: "Dep 3" },
    ],
    sources: [srcDef("X"), srcDef("Y")],
    events: [],
    ...over,
  };
}

export const derive = (s: Scenario, T: number, user?: UserSynthetic) => deriveAt(buildModel(s, user), T);
export const state = (s: Scenario, id: string, T: number, user?: UserSynthetic) =>
  derive(s, T, user).sources.find((x) => x.sourceId === id)!.heartbeatState;

export const srcOf = (snap: ReturnType<typeof derive>, id: string) => snap.sources.find((x) => x.sourceId === id)!;
