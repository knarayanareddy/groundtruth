import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildRecord, canonicalJson, parseImportText, visibleNotes, nextId } from "../../src/engine/record";
import { buildModel } from "../../src/engine/model";
import { deriveAt } from "../../src/engine/derive";
import { LIMITS } from "../../src/engine/constants";
import { validateScenario } from "../../src/engine/validate";
import { loadFixture, loadFixtureRaw, root } from "./helpers";
import type { ReviewerNote, UserSynthetic } from "../../src/engine/types";

const text = (name: string) => readFileSync(join(root, name), "utf8");
const fx = loadFixture();

describe("import validation: invalid input is rejected with path-specific errors (spec §6)", () => {
  const cases: [string, RegExp, RegExp][] = [
    ["fixtures/invalid/malformed.json", /^\$$/, /malformed JSON/],
    ["fixtures/invalid/duplicate-event-id.json", /^\$\.events\[1\]\.id$/, /duplicate event ID/],
    ["fixtures/invalid/unresolved-source-reference.json", /^\$\.events\[2\]\.sourceId$/, /unresolved reference/],
    ["fixtures/invalid/unresolved-dependency-reference.json", /^\$\.sources\[0\]\.dependencyIds\[2\]$/, /unresolved reference/],
    ["fixtures/invalid/unsupported-schema-version.json", /^\$\.schemaVersion$/, /unsupported schemaVersion/],
    ["fixtures/invalid/bad-enum.json", /^\$\.sources\[2\]\.dependencyKnowledge$/, /must be one of/],
    ["fixtures/invalid/bad-times.json", /^\$\.events\[0\]\.receivedAt$/, />= 0/],
    ["fixtures/invalid/bad-threshold.json", /^\$\.heartbeatThresholdSeconds$/, />= 1/],
  ];
  it.each(cases)("%s", (file, path, msg) => {
    const r = parseImportText(text(file));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => path.test(e.path) && msg.test(e.message))).toBe(true);
    expect(r).not.toHaveProperty("value"); // all-or-nothing: no partial result is returned
  });

  it("fractional times are rejected (integer virtual seconds only)", () => {
    const r = parseImportText(text("fixtures/invalid/bad-times.json"));
    if (r.ok) throw new Error("expected failure");
    expect(r.errors.some((e) => e.path === "$.events[1].receivedAt" && /integer/.test(e.message))).toBe(true);
  });

  it("rejects oversized input before parsing", () => {
    const r = parseImportText(" ".repeat(LIMITS.maxBytes + 1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].message).toMatch(/limit is 1048576 bytes/);
  });

  it("rejects too many events, non-object roots and unknown schema", () => {
    const raw = JSON.parse(text("fixtures/reference-fixture.json"));
    raw.events = Array.from({ length: LIMITS.maxEvents + 1 }, (_, i) => ({ id: `e${i}`, sourceId: "A", receivedAt: 0, type: "heartbeat" }));
    const r = validateScenario(raw);
    expect(r.ok).toBe(false);
    expect(parseImportText("[1,2]").ok).toBe(false);
    expect(parseImportText("null").ok).toBe(false);
    expect(parseImportText('{"schema":"something-else"}').ok).toBe(false);
  });

  it("rejects unknown fields (strict schema), receivedAt beyond duration, duplicate IDs for sources/dependencies/names, bad IDs", () => {
    const mut = (f: (r: any) => void) => {
      const r = JSON.parse(text("fixtures/reference-fixture.json"));
      f(r);
      return validateScenario(r);
    };
    expect(mut((r) => (r.extra = 1)).ok).toBe(false);
    expect(mut((r) => (r.events[0].receivedAt = 99)).ok).toBe(false);
    expect(mut((r) => (r.sources[1].id = "A")).ok).toBe(false);
    expect(mut((r) => (r.sources[1].name = r.sources[0].name.toUpperCase())).ok).toBe(false);
    expect(mut((r) => (r.dependencies[1].id = "gateway-1")).ok).toBe(false);
    expect(mut((r) => (r.sources[0].id = "bad id with spaces")).ok).toBe(false);
    expect(mut((r) => (r.events[3].observation.observedAt = "tomorrow")).ok).toBe(false);
    expect(mut((r) => (r.events[3].observation.clockQuality = "gps")).ok).toBe(false);
    expect(mut((r) => delete r.events[3].observation.comparisonKey.unit).ok).toBe(false);
    expect(mut((r) => (r.events[0].observation = {})).ok).toBe(false); // heartbeat must not carry an observation
    expect(mut((r) => (r.heartbeatThresholdSeconds = LIMITS.maxThreshold + 1)).ok).toBe(false);
    expect(mut((r) => (r.heartbeatThresholdSeconds = Number.NaN)).ok).toBe(false);
    expect(mut((r) => (r.engineVersion = "9.9")).ok).toBe(false);
    expect(mut((r) => (r.meta.dataOrigin = "live")).ok).toBe(false);
  });

  it("HTML in text fields is accepted as plain data and kept literally", () => {
    const r = parseImportText(text("fixtures/html-literal-test.json"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.scenario.sources[0].name).toBe("<img src=x onerror=alert(1)> Source A");
    expect(r.value.scenario.sources[1].name).toContain("<script>");
  });

  it("warns (does not reject) on out-of-order files, skewed clocks and same-content duplicates", () => {
    const raw = JSON.parse(text("fixtures/reference-fixture.json"));
    raw.events.reverse();
    raw.events.push({ ...raw.events[0], id: "dup-copy" });
    raw.events.push({ id: "skewed", sourceId: "A", receivedAt: 3, type: "observation", observation: { comparisonKey: { subject: "s", property: "p", unit: "none", context: "c" }, value: "x", observedAt: 9, clockQuality: "unknown" } });
    const r = parseImportText(JSON.stringify(raw));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const w = r.warnings.join("\n");
    expect(w).toMatch(/out of receivedAt order/);
    expect(w).toMatch(/possible duplicate delivery/);
    expect(w).toMatch(/clock skew/);
  });

  it("accepts the reference fixture file as a bare scenario import", () => {
    const r = parseImportText(text("fixtures/reference-fixture.json"));
    expect(r.ok).toBe(true);
    if (r.ok) expect([r.value.kind, r.value.T]).toEqual(["scenario", 0]);
  });
});

describe("export → import round trip (spec §6)", () => {
  const user: UserSynthetic = {
    events: [{ id: "syn-hb-1", sourceId: "C", receivedAt: 9, type: "heartbeat", synthetic: true, authoredAtT: 9 }],
    dropWindows: [{ id: "drop-1", sourceId: "A", fromT: 6, untilT: 9, authoredAtT: 5 }],
  };
  const notes: ReviewerNote[] = [
    { id: "note-1", text: "early <b>note</b>", authoredAtT: 2, alias: "reviewer-1" },
    { id: "note-2", text: "late note", authoredAtT: 10, alias: "reviewer-1" },
  ];
  const session = { scenario: fx, user, notes, T: 7, speed: 2 };

  it("re-import recomputes identical transitions and state at the saved T, and restores user data and notes", () => {
    const rec = buildRecord(session);
    const parsed = parseImportText(JSON.stringify(rec));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const v = parsed.value;
    expect(v.kind).toBe("record");
    expect(v.T).toBe(7);
    expect(v.speed).toBe(2);
    expect(v.notes).toEqual(notes);
    expect(v.user).toEqual(user);
    expect(v.snapshotMismatch).toBe(false);
    for (let T = 0; T <= 12; T++) {
      expect(deriveAt(buildModel(v.scenario, v.user), T)).toEqual(deriveAt(buildModel(fx, user), T));
    }
  });

  it("export carries versions, labels, rules, thresholds, events, config and an unsigned/unanonymised notice", () => {
    const rec = buildRecord(session, "2026-01-01T00:00:00Z") as any;
    expect(rec.schema).toBe("groundtruth-blindspot-record");
    expect(rec.tool).toEqual({ name: "groundtruth-blindspot", version: "1.0.0" });
    expect(rec.engineVersion).toBe("1.0");
    expect(rec.scenario.heartbeatThresholdSeconds).toBe(5);
    expect(rec.scenario.events).toHaveLength(fx.events.length);
    expect(rec.userSynthetic.events[0].id).toBe("syn-hb-1");
    expect(rec.labels.join(" ")).toMatch(/SYNTHETIC/);
    expect(rec.derivationRules.length).toBeGreaterThan(5);
    expect(rec.exportNotice).toMatch(/not anonymised, encrypted or signed/);
  });

  it("export is deterministic apart from the optional wall-clock stamp", () => {
    expect(canonicalJson(buildRecord(session))).toBe(canonicalJson(buildRecord(session)));
  });

  it("a tampered derivedSnapshot triggers a warning and recomputed values win", () => {
    const rec = buildRecord(session) as any;
    rec.derivedSnapshot.sources[0].heartbeatState = "FRESH_HEARTBEAT";
    rec.derivedSnapshot.sources[1].heartbeatState = "FRESH_HEARTBEAT";
    rec.derivedSnapshot.sources[2].heartbeatState = "FRESH_HEARTBEAT"; // claims C is fresh
    const parsed = parseImportText(JSON.stringify(rec));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.snapshotMismatch).toBe(true);
    expect(parsed.warnings.join(" ")).toMatch(/does not match/);
    const d = deriveAt(buildModel(parsed.value.scenario, parsed.value.user), parsed.value.T);
    expect(d.sources.find((s) => s.sourceId === "C")!.heartbeatState).toBe("WAITING_UNKNOWN");
  });

  it("record import is all-or-nothing: invalid notes, retroactive drop window, colliding synthetic ID", () => {
    const bad = (f: (r: any) => void) => {
      const rec = JSON.parse(JSON.stringify(buildRecord(session)));
      f(rec);
      return parseImportText(JSON.stringify(rec));
    };
    expect(bad((r) => (r.reviewerNotes[0].authoredAtT = 999)).ok).toBe(false);
    expect(bad((r) => (r.reviewerNotes[1].id = "note-1")).ok).toBe(false);
    expect(bad((r) => (r.userSynthetic.dropWindows[0].fromT = 5)).ok).toBe(false); // fromT must be > authoredAtT
    expect(bad((r) => (r.userSynthetic.events[0].id = "hb-A-0")).ok).toBe(false);
    expect(bad((r) => (r.replay.currentT = 13)).ok).toBe(false);
    expect(bad((r) => (r.replay.speed = 3)).ok).toBe(false);
    expect(bad((r) => (r.userSynthetic.events[0].sourceId = "nope")).ok).toBe(false);
    expect(bad((r) => (r.scenario.sources[0].dependencyIds = ["ghost"])).ok).toBe(false);
  });

  it("notes are a separate non-causal layer: future notes are not exposed during ordinary replay", () => {
    expect(visibleNotes(notes, 1, false)).toEqual([]);
    expect(visibleNotes(notes, 2, false).map((n) => n.id)).toEqual(["note-1"]);
    expect(visibleNotes(notes, 9, false).map((n) => n.id)).toEqual(["note-1"]);
    expect(visibleNotes(notes, 10, false)).toHaveLength(2);
    expect(visibleNotes(notes, 0, true)).toHaveLength(2); // explicit non-causal review layer
    // notes never enter derivation
    expect(JSON.stringify(deriveAt(buildModel(fx), 5))).not.toContain("early");
  });

  it("generated IDs avoid collisions", () => {
    expect(nextId("syn-hb-", new Set(["syn-hb-1", "syn-hb-2"]))).toBe("syn-hb-3");
  });

  it("the raw fixture file itself equals the scenario embedded in an export (no silent normalisation)", () => {
    const rec = buildRecord({ scenario: fx, user: { events: [], dropWindows: [] }, notes: [], T: 0, speed: 1 }) as any;
    expect(canonicalJson(rec.scenario)).toBe(canonicalJson(loadFixtureRaw()));
  });
});
