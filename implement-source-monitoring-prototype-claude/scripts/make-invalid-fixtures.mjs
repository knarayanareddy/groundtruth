// Regenerates fixtures/invalid/*.json and the HTML-literal fixture from the reference fixture.
// Run: node scripts/make-invalid-fixtures.mjs   (deterministic; no network, no clock)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = JSON.parse(readFileSync(join(root, "fixtures/reference-fixture.json"), "utf8"));
const clone = () => JSON.parse(JSON.stringify(base));
const out = (name, v, raw = false) =>
  writeFileSync(join(root, "fixtures", name), raw ? v : JSON.stringify(v, null, 2) + "\n");
mkdirSync(join(root, "fixtures/invalid"), { recursive: true });

out("invalid/malformed.json", '{ "schema": "groundtruth-blindspot-scenario", "events": [ ', true);

let s = clone();
s.events[1].id = s.events[0].id;
out("invalid/duplicate-event-id.json", s);

s = clone();
s.events[2].sourceId = "Z-not-defined";
out("invalid/unresolved-source-reference.json", s);

s = clone();
s.sources[0].dependencyIds.push("power-99");
out("invalid/unresolved-dependency-reference.json", s);

s = clone();
s.schemaVersion = 2;
out("invalid/unsupported-schema-version.json", s);

s = clone();
s.sources[2].dependencyKnowledge = "mostly";
out("invalid/bad-enum.json", s);

s = clone();
s.events[0].receivedAt = -3;
s.events[1].receivedAt = 1.5;
out("invalid/bad-times.json", s);

s = clone();
s.heartbeatThresholdSeconds = 0;
out("invalid/bad-threshold.json", s);

// Valid file whose text fields contain HTML; must render literally.
s = clone();
s.meta.title = "HTML literal test <b>bold?</b>";
s.sources[0].name = "<img src=x onerror=alert(1)> Source A";
s.sources[1].name = "<script>window.__pwned = true</script> Source B";
s.dependencies[0].name = '<a href="https://example.invalid/should-not-be-fetched">gateway</a>';
out("html-literal-test.json", s);

console.log("fixtures written");
