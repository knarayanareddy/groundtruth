import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ART, DIST, expect, importFile, loadRef, open, ROOT, setT, st, stepTo, test } from "./base";

const FX = (n: string) => join(ROOT, "fixtures", n);

test("initial state: no scenario, no data shown as fresh; banner and title are honest", async ({ page }) => {
  await open(page);
  await expect(page).toHaveTitle(/Ground Truth \+ BlindSpot/);
  await expect(page.getByTestId("banner")).toContainText("NOT LIVE");
  await expect(page.getByTestId("banner")).toContainText("Silence is not a clear scene");
  await expect(page.locator("[data-testid^=source-]")).toHaveCount(0);
  await expect(page.getByTestId("btn-export")).toBeDisabled();
  await expect(page.getByTestId("limitations")).toContainText("does not show that a sensor is working");
});

test("reference fixture: exact §4 states via stepping, with recovery, dependencies and disagreement", async ({ page }) => {
  await open(page);
  await loadRef(page);
  // T=0
  await expect(st(page, "A")).toHaveAttribute("data-state", "FRESH_HEARTBEAT");
  await expect(st(page, "B")).toHaveAttribute("data-state", "FRESH_HEARTBEAT");
  await expect(st(page, "C")).toHaveAttribute("data-state", "WAITING_UNKNOWN");
  await expect(st(page, "C")).toContainText("WAITING / UNKNOWN");
  await expect(page.getByTestId("clock-mode")).toHaveText("PAUSED");

  // T=2 — both reports + disagreement, C unknown
  await page.getByTestId("btn-step").click();
  await page.getByTestId("btn-step").click();
  await expect(page.getByTestId("obs-A")).toContainText("obs-A-2");
  await expect(page.getByTestId("obs-B")).toContainText("obs-B-2");
  const diff = page.locator('[data-verdict="reports_differ"]');
  await expect(diff).toHaveCount(1);
  await expect(diff).toContainText("no winner is chosen");
  await expect(diff).toContainText("gateway-1");
  await expect(diff).toContainText("synthetic_synchronized");
  await expect(page.getByTestId("silent-sources")).toContainText("C");
  await expect(page.getByTestId("silent-sources")).toContainText("not an opposing report");

  // T=5
  for (let i = 0; i < 3; i++) await page.getByTestId("btn-step").click();
  await expect(st(page, "A")).toHaveAttribute("data-state", "FRESH_HEARTBEAT");
  await expect(st(page, "B")).toHaveAttribute("data-state", "STALE_UNKNOWN");
  await expect(st(page, "B")).toContainText("STALE / UNKNOWN");
  await expect(st(page, "C")).toHaveAttribute("data-state", "WAITING_UNKNOWN");
  await expect(page.getByTestId("transition-B-5-STALE_UNKNOWN")).toBeVisible();
  await expect(page.getByTestId("transition-B-5-STALE_UNKNOWN")).toContainText("cause is not established");

  // T=6 — backfill does not restore freshness; distinct times
  await page.getByTestId("btn-step").click();
  await expect(st(page, "B")).toHaveAttribute("data-state", "STALE_UNKNOWN");
  await expect(page.getByTestId("packet-B")).toContainText("t=6 s");
  await expect(page.getByTestId("hb-B")).toContainText("t=0 s");
  await expect(page.getByTestId("obs-B")).toContainText("BACKFILLED");
  await expect(page.getByTestId("obsage-B")).toContainText("5 s (claimed)");
  await expect(page.getByTestId("source-B")).toContainText("Receive age");
  await expect(page.getByTestId("source-B")).toContainText("0 s (since that packet arrived)");
  await expect(page.locator('[data-testid^="transition-B-6-"]')).toHaveCount(0);

  // T=7 — recovery of heartbeat receipt
  await page.getByTestId("btn-step").click();
  await expect(st(page, "B")).toHaveAttribute("data-state", "FRESH_HEARTBEAT");
  const rec = page.getByTestId("transition-B-7-FRESH_HEARTBEAT");
  await expect(rec).toContainText("RECOVERY OF HEARTBEAT RECEIPT");
  await expect(rec).toContainText("not evidence that the sensor or the monitored area recovered");

  // T=10, T=12
  for (let i = 0; i < 3; i++) await page.getByTestId("btn-step").click();
  await expect(st(page, "A")).toHaveAttribute("data-state", "STALE_UNKNOWN");
  await expect(st(page, "B")).toHaveAttribute("data-state", "FRESH_HEARTBEAT");
  await expect(page.getByTestId("hbage-B")).toContainText("3 s");
  await expect(st(page, "C")).toHaveAttribute("data-state", "WAITING_UNKNOWN");
  await page.getByTestId("btn-step").click();
  await page.getByTestId("btn-step").click();
  await expect(st(page, "B")).toHaveAttribute("data-state", "STALE_UNKNOWN");
  await expect(page.getByTestId("clock-mode")).toHaveText("STOPPED (end of log)");
  await expect(page.getByTestId("btn-step")).toBeDisabled();

  // Dependencies
  const ab = page.getByTestId("pair-A-B");
  await expect(ab).toContainText("DECLARED OVERLAP");
  await expect(ab).toContainText("gateway-1");
  await expect(ab).toContainText("Fixture author");
  await expect(page.getByTestId("pair-A-C")).toContainText("UNKNOWN");
  await expect(page.getByTestId("pair-B-C")).toContainText("UNKNOWN");
  await expect(page.locator("#dependencies")).not.toContainText(/\bindependent\b/i);
  await page.screenshot({ path: join(ART, "screenshot-reference-T12.png"), fullPage: true });
});

test("play with real timers reaches stale and recovery; play/step/seek give identical text", async ({ page }) => {
  await open(page);
  await loadRef(page);
  await page.getByTestId("speed").selectOption("4");
  await page.getByTestId("btn-play").click();
  await expect(page.getByTestId("clock-mode")).toHaveText("PLAYING");
  await expect(page.getByTestId("clock-mode")).toHaveText("STOPPED (end of log)", { timeout: 15_000 });
  const played = await page.locator("#sources, #timeline").allInnerTexts();
  await expect(page.getByTestId("transition-B-5-STALE_UNKNOWN")).toBeVisible();
  await expect(page.getByTestId("transition-B-7-FRESH_HEARTBEAT")).toBeVisible();

  await stepTo(page, 12);
  const stepped = await page.locator("#sources, #timeline").allInnerTexts();
  await setT(page, 0);
  await setT(page, 12);
  const sought = await page.locator("#sources, #timeline").allInnerTexts();
  expect(stepped).toEqual(played);
  expect(sought).toEqual(played);

  // seek back (rewind) then compare a mid state with stepping
  await setT(page, 7);
  const seek7 = await page.locator("#sources, #timeline, #disagreement").allInnerTexts();
  await stepTo(page, 7);
  expect(await page.locator("#sources, #timeline, #disagreement").allInnerTexts()).toEqual(seek7);
  // pause/restart
  await page.getByTestId("btn-play").click();
  await page.getByTestId("btn-play").click();
  await expect(page.getByTestId("clock-mode")).toHaveText("PAUSED");
  await page.getByTestId("btn-restart").click();
  await expect(page.getByTestId("clock-T")).toContainText("T = 0 s");
  await expect(page.getByTestId("no-transitions")).toHaveCount(0); // A and B have a first-heartbeat transition at 0
});

test("causal replay: nothing from the future is visible before it is received", async ({ page }) => {
  await open(page);
  await loadRef(page);
  await setT(page, 1);
  const body = await page.locator("main").innerText();
  for (const id of ["obs-A-2", "obs-B-2", "hb-A-5", "obs-B-backfill-6", "hb-B-7"]) expect(body).not.toContain(id);
  await expect(page.getByTestId("no-comparisons")).toBeVisible();
});

test("export → clear → import reproduces state, transitions, synthetic entries and notes; HTML note stays literal", async ({ page }) => {
  await open(page);
  await loadRef(page);
  await setT(page, 3);
  await page.getByTestId("note-alias").fill("reviewer-one");
  await page.getByTestId("note-text").fill("early <b>bold?</b> <img src=x onerror=\"window.__pwned=1\">");
  await page.getByTestId("btn-add-note").click();
  await setT(page, 9);
  await page.getByTestId("note-text").fill("late note authored at nine");
  await page.getByTestId("btn-add-note").click();
  await page.getByTestId("syn-source").selectOption("C");
  await page.getByTestId("btn-inject").click();
  await expect(st(page, "C")).toHaveAttribute("data-state", "FRESH_HEARTBEAT");
  await setT(page, 7);
  // notes at T=7: early only; body text is literal
  await expect(page.getByTestId("note-body")).toHaveCount(1);
  await expect(page.getByTestId("note-body")).toContainText("<b>bold?</b>");
  await expect(page.locator("[data-testid=notes-list] b")).toHaveCount(0);
  await expect(page.locator("[data-testid=notes-list] img")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__pwned)).toBeUndefined();

  const before = await page.locator("#sources, #timeline, #disagreement, #events").allInnerTexts();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("btn-export").click()]);
  const file = join(ART, "e2e-export.json");
  await dl.saveAs(file);
  expect(dl.suggestedFilename()).toBe("groundtruth-blindspot-record-T7.json");
  await expect(page.getByTestId("message")).toContainText("not anonymised, encrypted or signed");
  const rec = JSON.parse(readFileSync(file, "utf8"));
  expect(rec.schema).toBe("groundtruth-blindspot-record");
  expect(rec.replay.currentT).toBe(7);
  expect(rec.reviewerNotes).toHaveLength(2);
  expect(rec.userSynthetic.events[0].sourceId).toBe("C");
  expect(rec.scenario.events).toHaveLength(7);

  // clear / reset
  await page.getByTestId("btn-reset").click();
  await expect(page.getByTestId("empty-state")).toBeVisible();
  await expect(page.locator("[data-testid^=source-]")).toHaveCount(0);

  // clean import
  await importFile(page, file);
  await expect(page.getByTestId("clock-T")).toContainText("T = 7 s");
  const after = await page.locator("#sources, #timeline, #disagreement, #events").allInnerTexts();
  expect(after).toEqual(before);
  // the synthetic heartbeat for C was authored at T=9, so at T=7 C is still waiting; it becomes fresh at T=9
  await expect(st(page, "C")).toHaveAttribute("data-state", "WAITING_UNKNOWN");
  await expect(page.getByTestId("synthetic-list")).toContainText("syn-hb-1");
  await setT(page, 9);
  await expect(st(page, "C")).toHaveAttribute("data-state", "FRESH_HEARTBEAT");
  await setT(page, 7);
  await expect(page.getByTestId("note-body")).toHaveCount(1);
  await page.getByTestId("show-all-notes").check();
  await expect(page.getByTestId("note-body")).toHaveCount(2);
  await expect(page.getByTestId("notes-list")).toContainText("reviewer-one");
  await expect(page.getByTestId("notes-list")).toContainText("unauthenticated");
});

test("tampered snapshot in an imported record shows a warning and recomputed state wins", async ({ page }) => {
  await open(page);
  await loadRef(page);
  await setT(page, 5);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("btn-export").click()]);
  const file = join(ART, "e2e-export-tamper-src.json");
  await dl.saveAs(file);
  const rec = JSON.parse(readFileSync(file, "utf8"));
  for (const s of rec.derivedSnapshot.sources) s.heartbeatState = "FRESH_HEARTBEAT";
  const tampered = join(ART, "e2e-export-tampered.json");
  writeFileSync(tampered, JSON.stringify(rec));
  await page.getByTestId("btn-reset").click();
  await importFile(page, tampered);
  await expect(page.getByTestId("import-warnings")).toContainText("does not match");
  await expect(st(page, "C")).toHaveAttribute("data-state", "WAITING_UNKNOWN");
  await expect(st(page, "B")).toHaveAttribute("data-state", "STALE_UNKNOWN");
});

test("invalid, malformed and oversized imports are rejected with path-specific errors and the session is untouched", async ({ page }) => {
  await open(page);
  await loadRef(page);
  await setT(page, 5);
  const snapshotText = async () => page.locator("#sources, #timeline").allInnerTexts();
  const before = await snapshotText();

  const cases: [string, RegExp, RegExp][] = [
    ["invalid/malformed.json", /\$ — malformed JSON/, /Unexpected end of JSON input|malformed JSON/],
    ["invalid/duplicate-event-id.json", /\$\.events\[1\]\.id/, /duplicate event ID/],
    ["invalid/unresolved-source-reference.json", /\$\.events\[2\]\.sourceId/, /unresolved reference/],
    ["invalid/unresolved-dependency-reference.json", /dependencyIds\[2\]/, /unresolved reference/],
    ["invalid/unsupported-schema-version.json", /\$\.schemaVersion/, /unsupported schemaVersion/],
    ["invalid/bad-enum.json", /dependencyKnowledge/, /must be one of/],
    ["invalid/bad-times.json", /receivedAt/, /(>= 0|integer)/],
    ["invalid/bad-threshold.json", /heartbeatThresholdSeconds/, />= 1/],
  ];
  for (const [f, path, msg] of cases) {
    await importFile(page, FX(f));
    const box = page.getByTestId("import-errors");
    await expect(box).toBeVisible();
    await expect(box).toContainText("current session is unchanged");
    await expect(box).toContainText(path);
    await expect(box).toContainText(msg);
    await expect(page.getByTestId("clock-T")).toContainText("T = 5 s");
    expect(await snapshotText()).toEqual(before);
  }

  // oversize (> 1 MiB)
  await page.getByTestId("file-input").setInputFiles({ name: "huge.json", mimeType: "application/json", buffer: Buffer.alloc(1_048_577, 32) });
  await expect(page.getByTestId("import-errors")).toContainText("limit is 1048576 bytes");
  expect(await snapshotText()).toEqual(before);
  await expect(st(page, "B")).toHaveAttribute("data-state", "STALE_UNKNOWN");
});

test("imported HTML/script/link text renders literally; nothing executes or is fetched", async ({ page, net }) => {
  await open(page);
  await importFile(page, FX("html-literal-test.json"));
  await expect(page.getByTestId("clock-T")).toContainText("T = 0 s");
  await expect(page.getByTestId("source-A")).toContainText("<img src=x onerror=alert(1)> Source A");
  await expect(page.getByTestId("source-B")).toContainText("<script>window.__pwned = true</script> Source B");
  await expect(page.locator("main img")).toHaveCount(0);
  await expect(page.locator("main script")).toHaveCount(0);
  await expect(page.locator('main a[href*="example.invalid"]')).toHaveCount(0);
  await expect(page.locator("#dependencies")).toContainText('<a href="https://example.invalid/should-not-be-fetched">gateway</a>');
  await expect(page.getByTestId("scenario-meta")).toContainText("<b>bold?</b>");
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__pwned)).toBeUndefined();
  expect(net.requests.some((u) => u.includes("example.invalid"))).toBe(false);
});

test("synthetic controls: injected heartbeat and drop window are explicit events and affect derived state", async ({ page }) => {
  await open(page);
  await loadRef(page);
  await page.getByTestId("syn-source").selectOption("C");
  await page.getByTestId("btn-inject").click();
  await expect(st(page, "C")).toHaveAttribute("data-state", "FRESH_HEARTBEAT");
  await expect(page.getByTestId("event-syn-hb-1")).toContainText("USER-ADDED SYNTHETIC");
  await expect(page.getByTestId("synthetic-list")).toContainText("SYNTHETIC HEARTBEAT");
  await setT(page, 5);
  await expect(st(page, "C")).toHaveAttribute("data-state", "STALE_UNKNOWN"); // syn heartbeat at 0, threshold 5
  // drop A's heartbeats from T+1 for 20 s (authored at T=0)
  await setT(page, 0);
  await page.getByTestId("syn-source").selectOption("A");
  await page.getByTestId("syn-secs").fill("20");
  await page.getByTestId("btn-drop").click();
  await setT(page, 5);
  await expect(st(page, "A")).toHaveAttribute("data-state", "STALE_UNKNOWN");
  await expect(page.getByTestId("event-hb-A-5")).toContainText("DROPPED by synthetic rule drop-1");
  await expect(page.getByTestId("source-A")).toContainText("treated as not received by a synthetic drop window");
  await page.getByTestId("btn-clear-synthetic").click();
  await expect(st(page, "A")).toHaveAttribute("data-state", "FRESH_HEARTBEAT");
});

test("keyboard operation: Enter/Space on buttons, shortcuts, labelled controls, visible focus", async ({ page }) => {
  await open(page);
  await page.getByTestId("btn-load-ref").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("clock-T")).toContainText("T = 0 s");
  await page.getByTestId("btn-step").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("clock-T")).toContainText("T = 1 s");
  await page.keyboard.press("Space"); // activates the focused button once (no double handling by the global shortcut)
  await expect(page.getByTestId("clock-T")).toContainText("T = 2 s");
  // shortcuts when nothing is focused
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("clock-T")).toContainText("T = 3 s");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("clock-T")).toContainText("T = 2 s");
  await page.keyboard.press("Space");
  await expect(page.getByTestId("clock-mode")).toHaveText("PLAYING");
  await page.keyboard.press("Space");
  await expect(page.getByTestId("clock-mode")).toHaveText("PAUSED");
  await page.keyboard.press("Home");
  await expect(page.getByTestId("clock-T")).toContainText("T = 0 s");
  // the seek slider is keyboard operable
  await page.getByTestId("seek").focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("clock-T")).toContainText("T = 5 s");
  await expect(st(page, "B")).toHaveAttribute("data-state", "STALE_UNKNOWN");
  // tab order reaches the main controls in sequence
  await page.getByTestId("btn-restart").focus();
  const seen: string[] = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    seen.push(await page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? document.activeElement?.tagName ?? ""));
  }
  expect(seen.slice(0, 4)).toEqual(["btn-step-back", "btn-play", "btn-step", "speed"]);
  // controls have accessible names
  for (const id of ["seek", "t-input", "speed", "file-input"]) {
    const name = await page.getByTestId(id).evaluate((el) => (el as HTMLInputElement).labels?.[0]?.textContent || el.getAttribute("aria-label") || "");
    expect(name.length, id).toBeGreaterThan(3);
  }
  // a focus indicator exists (outline set by :focus-visible)
  await page.getByTestId("btn-step").focus();
  const outline = await page.getByTestId("btn-step").evaluate((el) => getComputedStyle(el).outlineStyle + " " + getComputedStyle(el).outlineWidth);
  expect(outline).not.toMatch(/^none/);
});

test("status is legible without color: text label, glyph and border style differ per state", async ({ page }) => {
  await open(page);
  await loadRef(page);
  await setT(page, 5);
  const style = async (id: string) => page.getByTestId(`state-${id}`).evaluate((el) => ({ text: el.textContent, border: getComputedStyle(el).borderTopStyle }));
  const a = await style("A"), b = await style("B"), c = await style("C");
  expect(a.text).toContain("FRESH HEARTBEAT");
  expect(b.text).toContain("STALE / UNKNOWN");
  expect(c.text).toContain("WAITING / UNKNOWN");
  expect(new Set([a.border, b.border, c.border]).size).toBe(3);
  expect(a.text).toContain("✔");
  expect(b.text).toContain("▲");
  expect(c.text).toContain("?");
});

test("narrow viewport (375 px): no horizontal page overflow, controls reachable", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await open(page);
  await loadRef(page);
  await setT(page, 6);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  for (const id of ["btn-play", "btn-step", "btn-step-back", "seek", "t-input"]) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box, id).not.toBeNull();
    expect(box!.x + box!.width, id).toBeLessThanOrEqual(376);
    expect(box!.x, id).toBeGreaterThanOrEqual(-1);
  }
  await expect(st(page, "B")).toBeVisible();
  await page.screenshot({ path: join(ART, "screenshot-narrow-375.png"), fullPage: true });
});

test("optional browser storage: explicit save, restore, delete; denied/quota errors are reported truthfully", async ({ page, context }) => {
  await open(page);
  await expect(page.getByTestId("storage-status")).toContainText("Nothing is saved");
  await expect(page.getByTestId("btn-save-local")).toBeDisabled();
  await loadRef(page);
  await setT(page, 7);
  // nothing is stored until Save is pressed
  expect(await page.evaluate(() => window.localStorage.length)).toBe(0);
  await page.getByTestId("btn-save-local").click();
  await expect(page.getByTestId("storage-msg")).toContainText("confirmed by read-back");
  expect(await page.evaluate(() => window.localStorage.length)).toBe(1);
  await page.reload();
  await expect(page.getByTestId("storage-status")).toContainText("A saved copy exists");
  await page.getByTestId("btn-restore-local").click();
  await expect(page.getByTestId("clock-T")).toContainText("T = 7 s");
  await expect(st(page, "B")).toHaveAttribute("data-state", "FRESH_HEARTBEAT");
  await page.getByTestId("btn-delete-local").click();
  await expect(page.getByTestId("storage-msg")).toContainText("deleted");
  expect(await page.evaluate(() => window.localStorage.length)).toBe(0);
  await expect(page.getByTestId("btn-restore-local")).toBeDisabled();

  // quota / denied
  const p2 = await context.newPage();
  await p2.addInitScript(() => {
    Storage.prototype.setItem = () => {
      const e = new Error("quota");
      e.name = "QuotaExceededError";
      throw e;
    };
  });
  await open(p2);
  await loadRef(p2);
  await p2.getByTestId("btn-save-local").click();
  await expect(p2.getByTestId("storage-msg")).toContainText("NOT saved: Browser storage quota exceeded");
  await expect(p2.getByTestId("storage-status")).toContainText("Nothing is saved");
});

test("built bundle: legacy scripted panel absent, CSP present, no external references", async ({ page }) => {
  const html = readFileSync(DIST, "utf8");
  for (const t of ["SkyFortress", "SHAHED", "QUARANTINED_SYBIL", "brierScore", "commonCauseGroup", "anonymityTier"]) expect(html).not.toContain(t);
  expect(html).toContain("Content-Security-Policy");
  expect(html).toContain("connect-src 'none'");
  await open(page);
  await loadRef(page);
  const text = (await page.locator("body").innerText()).toLowerCase();
  for (const bad of ["sybil", "brier", "atech", "quarantine", "kyiv", "shahed", "privacy tier", "scrub"]) expect(text).not.toContain(bad);
});
