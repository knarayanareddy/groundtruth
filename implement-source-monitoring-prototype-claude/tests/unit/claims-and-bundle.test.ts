import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { root } from "./helpers";

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const srcFiles = walk(join(root, "src")).filter((f) => /\.(ts|tsx|css)$/.test(f));
const read = (f: string) => readFileSync(f, "utf8");

// Tokens that only existed in the legacy scripted panel (see archive/legacy_scripted_panel/).
const LEGACY_TOKENS = ["SkyFortress", "SHAHED", "QUARANTINED_SYBIL", "brierScore", "commonCauseGroup", "anonymityTier", "THREAT_SHAHED", "SILENT_NODE", "BENCHMARK_DEFENSE_MAPPING"];

describe("legacy scripted panel is replaced, not wrapped (spec §1)", () => {
  it("no source file imports or defines BenchmarkTacticalView or other legacy views", () => {
    for (const f of srcFiles) expect(read(f), f).not.toMatch(/BenchmarkTacticalView|NexusTrustLineView|PhalanxSwarmView|ThermalClearHotView|MantaviaCableGuardView|UkraineFrontlineView|AuditAndMergerView/);
    expect(existsSync(join(root, "src/components/BenchmarkTacticalView.tsx"))).toBe(false);
  });
  it("no legacy scripted data tokens in src/", () => {
    for (const f of srcFiles) for (const t of LEGACY_TOKENS) expect(read(f), `${f} contains ${t}`).not.toContain(t);
  });
  it("the archived legacy panel is kept as non-compiled text for provenance only", () => {
    expect(existsSync(join(root, "archive/legacy_scripted_panel/BenchmarkTacticalView.tsx.txt"))).toBe(true);
    expect(srcFiles.some((f) => f.includes("archive"))).toBe(false);
  });
  const dist = join(root, "dist/index.html");
  it.runIf(existsSync(dist))("the built bundle (dist/index.html) contains no legacy tokens or legacy claims", () => {
    const html = read(dist);
    for (const t of LEGACY_TOKENS) expect(html, t).not.toContain(t);
    expect(html).not.toMatch(/Sybil|Brier|Kyiv|Chernihiv|Shahed|\bAtech\b/i);
  });
  it.runIf(existsSync(dist))("the built bundle makes no external URL references other than inert namespace strings", () => {
    const html = read(dist);
    const urls = [...html.matchAll(/https?:\/\/[^\s"'`)<>\\]+/g)].map((m) => m[0]);
    const allowed = /^https?:\/\/(www\.w3\.org|react\.dev|reactjs\.org|github\.com\/facebook\/react)/;
    const offenders = urls.filter((u) => !allowed.test(u));
    expect(offenders).toEqual([]);
    expect(html).not.toMatch(/<link[^>]+href=["']https?:/i);
    expect(html).not.toMatch(/<script[^>]+src=["']https?:/i);
    expect(html).not.toMatch(/<link[^>]+rel=["']modulepreload/i);
    // No network API of any kind. Vite's modulepreload polyfill (which contains a fetch call) is
    // disabled in vite.config.ts, because the single-file build emits no <link rel="modulepreload">
    // and the CSP blocks connect-src anyway. If it is ever re-enabled, the only tolerable fetch() is
    // one belonging to that polyfill — asserted structurally here so the check does not depend on
    // minifier-chosen variable names.
    for (const m of html.matchAll(/\bfetch\(/g)) {
      const at = m.index ?? 0;
      const before = html.slice(Math.max(0, at - 600), at);
      expect(before, "any fetch() in the bundle must belong to Vite's inert modulepreload polyfill").toMatch(/modulepreload/);
    }
    expect(html).not.toMatch(/XMLHttpRequest|WebSocket|sendBeacon|EventSource/);
  });
});

describe("source text does not make forbidden claims (spec §1)", () => {
  const forbidden: [string, RegExp][] = [
    ["claims independence", /\b(true(ly)? independent|sources? (are|is) independent|independent (groups?|sources?|power|networks?))\b/i],
    ["calibration/trust scores", /\b(brier|calibrat\w+ score|trust score|independence score|reliability score|confidence score)\b/i],
    ["Sybil", /sybil/i],
    ["sensor ok claims", /\b(sensor (is )?(ok|working|operating|healthy)|device (is )?(ok|healthy)|all clear|area (is )?(clear|safe)|scene (is )?clear|safe to proceed)\b/i],
    ["privacy/anonymity promise", /\b(privacy[- ]?(safe|protect\w*|preserving)|anonymi[sz]ed? by|scrubb\w+|redact\w+)\b/i],
    ["certification/field validation", /\b(certified|field[- ]validated|verified in the field)\b/i],
    ["detection claims", /\b(detects?|detection of|threat detected|target (identified|classified))\b/i],
    ["live claims", /\b(live feed|live sensor|connected to (a |the )?(device|hardware|sensor)|hardware connected)\b/i],
  ];
  // The app's own limitations text negates some phrases; those files are exempt only from the pattern they negate.
  it.each(forbidden)("no %s", (_name, re) => {
    const offenders = srcFiles.filter((f) => !f.endsWith("limits.ts") && re.test(read(f))).map((f) => f.replace(root + "/", ""));
    expect(offenders).toEqual([]);
  });
  it("source files make no network calls or analytics", () => {
    for (const f of srcFiles) {
      expect(read(f), f).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|navigator\.serial|navigator\.usb|dangerouslySetInnerHTML|innerHTML|eval\(|new Function\(/);
      expect(read(f), f).not.toMatch(/https?:\/\//);
    }
  });
});
