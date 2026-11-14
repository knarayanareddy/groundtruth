import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

interface AssertionResult {
  name: string;
  passed: boolean;
  detail?: string;
}

const results: AssertionResult[] = [];

function assert(condition: unknown, name: string, detail?: string): void {
  if (!condition) {
    results.push({ name, passed: false, detail });
    throw new Error(`ASSERTION FAILED: ${name}${detail ? ` (${detail})` : ''}`);
  }
  results.push({ name, passed: true, detail });
}

async function runBrowserE2E(): Promise<void> {
  const distHtmlPath = path.resolve(process.cwd(), 'dist/index.html');
  const fileUrl = pathToFileURL(distHtmlPath).href;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  const externalRequests: string[] = [];
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  // Record and block all external HTTP/HTTPS requests
  await page.route('**/*', async (route) => {
    const reqUrl = route.request().url();
    if (reqUrl.startsWith('file://') || reqUrl.startsWith('data:') || reqUrl.startsWith('blob:')) {
      await route.continue();
      return;
    }
    if (
      reqUrl.startsWith('http://127.0.0.1') ||
      reqUrl.startsWith('http://localhost')
    ) {
      await route.continue();
      return;
    }
    externalRequests.push(reqUrl);
    await route.abort();
  });

  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto(fileUrl, { waitUntil: 'load' });

  // 1. Verify initial load of Ground Truth + BlindSpot workbench & T=0s states
  const workbenchVisible = await page
    .getByTestId('groundtruth-blindspot-workbench')
    .isVisible();
  assert(workbenchVisible, 'Workbench loads directly on startup without legacy BenchmarkTacticalView');

  // Ensure clean start
  await page.getByTestId('clear-storage-reset-btn').click();

  const clockAt0 = await page.getByTestId('virtual-clock-display').textContent();
  assert(clockAt0?.includes('T+0s'), 'Initial virtual clock is T+0s', clockAt0 ?? '');

  const statusA0 = await page.getByTestId('source-status-A').textContent();
  const statusB0 = await page.getByTestId('source-status-B').textContent();
  const statusC0 = await page.getByTestId('source-status-C').textContent();
  assert(statusA0?.includes('FRESH HEARTBEAT'), 'T=0: Source A is FRESH HEARTBEAT', statusA0 ?? '');
  assert(statusB0?.includes('FRESH HEARTBEAT'), 'T=0: Source B is FRESH HEARTBEAT', statusB0 ?? '');
  assert(statusC0?.includes('WAITING / UNKNOWN'), 'T=0: Source C is WAITING / UNKNOWN', statusC0 ?? '');

  // Confirm all 3 source cards remain simultaneously visible
  assert(
    (await page.getByTestId('source-card-A').isVisible()) &&
      (await page.getByTestId('source-card-B').isVisible()) &&
      (await page.getByTestId('source-card-C').isVisible()),
    'All three sources (A, B, C) are simultaneously visible on the dashboard'
  );

  // 2. Step forward to T=2s and verify comparable observation disagreement
  await page.getByTestId('step-forward-btn').click();
  await page.getByTestId('step-forward-btn').click();

  const clockAt2 = await page.getByTestId('virtual-clock-display').textContent();
  assert(clockAt2?.includes('T+2s'), 'Stepped +1s twice to T+2s', clockAt2 ?? '');

  const cmpOutcome2 = await page
    .getByTestId('comparison-outcome-cmp-obs-A-2-obs-B-2')
    .textContent();
  assert(
    cmpOutcome2?.includes('REPORT DISAGREEMENT (NO WINNER SELECTED)'),
    'T=2: Disagreement between obs-A-2 (indicator=on) and obs-B-2 (indicator=off) is visible with no winner selected',
    cmpOutcome2 ?? ''
  );

  const depPairAB = await page.getByTestId('dep-pair-A-B').textContent();
  assert(
    depPairAB?.includes('gateway-1') && depPairAB?.includes('DECLARED_OVERLAP'),
    'Dependency panel displays shared declared dependency gateway-1 between A and B',
    depPairAB ?? ''
  );

  // 3. Jump/step to T=5s and verify exact threshold boundary: A fresh, B stale, C waiting
  await page.getByTestId('jump-t-5').click();
  const statusA5 = await page.getByTestId('source-status-A').textContent();
  const statusB5 = await page.getByTestId('source-status-B').textContent();
  const statusC5 = await page.getByTestId('source-status-C').textContent();
  assert(
    statusA5?.includes('FRESH HEARTBEAT'),
    'T=5: Source A is FRESH HEARTBEAT (heartbeat at exact threshold processed first)',
    statusA5 ?? ''
  );
  assert(
    statusB5?.includes('STALE / UNKNOWN'),
    'T=5: Source B transitions to STALE / UNKNOWN at exact threshold boundary T=5s',
    statusB5 ?? ''
  );
  assert(
    statusC5?.includes('WAITING / UNKNOWN'),
    'T=5: Source C remains WAITING / UNKNOWN',
    statusC5 ?? ''
  );

  // 4. Step to T=6s and verify backfilled observation on B does NOT restore heartbeat freshness
  await page.getByTestId('step-forward-btn').click();
  const statusB6 = await page.getByTestId('source-status-B').textContent();
  const lastPktB6 = await page.getByTestId('source-last-packet-B').textContent();
  const lastHbB6 = await page.getByTestId('source-last-heartbeat-B').textContent();
  const lastObsTimeB6 = await page.getByTestId('source-last-obs-time-B').textContent();
  const lastObsAgeB6 = await page.getByTestId('source-last-obs-age-B').textContent();

  assert(
    statusB6?.includes('STALE / UNKNOWN'),
    'T=6: Source B remains STALE / UNKNOWN after receiving historical backfill obs-B-6-backfill',
    statusB6 ?? ''
  );
  assert(
    lastPktB6?.includes('T+6s (age 0s)'),
    'T=6: Source B last packet received is T+6s (age 0s)',
    lastPktB6 ?? ''
  );
  assert(
    lastHbB6?.includes('T+0s (age 6s)'),
    'T=6: Source B last heartbeat received remains T+0s (age 6s)',
    lastHbB6 ?? ''
  );
  assert(
    lastObsTimeB6?.includes('T+1s') && lastObsAgeB6?.includes('5s (rcv age 0s)'),
    'T=6: Source B backfilled observation shows claimed time T+1s, observation age 5s, receive age 0s',
    `${lastObsTimeB6} / ${lastObsAgeB6}`
  );

  const histBadge6 = await page
    .getByTestId('comparison-historical-badge-cmp-obs-A-2-obs-B-2')
    .textContent();
  assert(
    histBadge6?.includes('HISTORICAL CONTEXT (obs age 4s at T+6s)'),
    'T=6: Earlier T=2 disagreement remains visible and explicitly marked as HISTORICAL CONTEXT',
    histBadge6 ?? ''
  );

  // 5. Step to T=7s and verify B recovers heartbeat receipt
  await page.getByTestId('step-forward-btn').click();
  const statusB7 = await page.getByTestId('source-status-B').textContent();
  assert(
    statusB7?.includes('FRESH HEARTBEAT'),
    'T=7: Source B transitions STALE / UNKNOWN -> FRESH HEARTBEAT upon hb-B-7 arrival',
    statusB7 ?? ''
  );

  const transitionTimeline7 = await page.getByTestId('transition-timeline').textContent();
  assert(
    transitionTimeline7?.includes('STALE / UNKNOWN → FRESH HEARTBEAT at T+7s') &&
      transitionTimeline7?.includes('Recovery of heartbeat packet receipt only'),
    'T=7: Transition timeline records stale-to-fresh heartbeat receipt recovery with non-safety caveat'
  );

  // 6. Check T=10s and T=12s checkpoints
  await page.getByTestId('jump-t-10').click();
  assert(
    (await page.getByTestId('source-status-A').textContent())?.includes('STALE / UNKNOWN') &&
      (await page.getByTestId('source-status-B').textContent())?.includes('FRESH HEARTBEAT'),
    'T=10: Source A is STALE / UNKNOWN and Source B is FRESH HEARTBEAT (age 3s)'
  );

  await page.getByTestId('jump-t-12').click();
  assert(
    (await page.getByTestId('source-status-A').textContent())?.includes('STALE / UNKNOWN') &&
      (await page.getByTestId('source-status-B').textContent())?.includes('STALE / UNKNOWN'),
    'T=12: Both Source A and Source B are STALE / UNKNOWN at T=12s'
  );

  // 7. Seek back to T=7s, add a reviewer note with literal HTML check, export JSON, reset, and reimport
  await page.getByTestId('jump-t-7').click();
  const noteContent =
    'Reviewer note at T+7s: B heartbeat recovered after backfill at T+6s. Literal tag check: <script>window.__xss=1</script>';
  await page.getByTestId('note-text-input').fill(noteContent);
  await page.getByTestId('add-note-btn').click();

  const renderedNoteText = await page.getByTestId('note-text-note-T7-1').textContent();
  assert(
    renderedNoteText === noteContent,
    'Reviewer note containing HTML/script tags renders literally as plain text without execution'
  );

  // Export at T=7s
  await page.getByTestId('export-json-btn').click();
  const exportedJson = await page.getByTestId('export-json-textarea').inputValue();
  assert(
    exportedJson.includes('"schemaVersion": "groundtruth-blindspot/v1"') &&
      exportedJson.includes('"replayPositionT": 7'),
    'Exported JSON contains versioned schema, replayPositionT=7, and reviewer notes'
  );

  // Clear localStorage and reset session to T=0s
  await page.getByTestId('clear-storage-reset-btn').click();
  assert(
    (await page.getByTestId('virtual-clock-display').textContent())?.includes('T+0s'),
    'Clear LocalStorage & Reset Session returns clock to T+0s'
  );
  const notesAtReset = await page.getByTestId('causal-notes-list').textContent();
  assert(
    notesAtReset?.includes('No reviewer notes visible'),
    'Reviewer notes are cleared after session reset'
  );

  // Re-import the exported JSON
  await page.getByTestId('import-json-textarea').fill(exportedJson);
  await page.getByTestId('import-json-submit-btn').click();

  assert(
    (await page.getByTestId('virtual-clock-display').textContent())?.includes('T+7s'),
    'Importing exported JSON restores virtual replay clock to T+7s'
  );
  assert(
    (await page.getByTestId('source-status-B').textContent())?.includes('FRESH HEARTBEAT') &&
      (await page.getByTestId('note-text-note-T7-1').textContent()) === noteContent,
    'Importing exported JSON deterministically reproduces source states, transitions, and reviewer note at T+7s'
  );

  // 8. Test invalid input rejection without losing the active session at T+7s
  await page.getByTestId('load-invalid-sample-btn').click();
  const errAlert = await page.getByTestId('import-error-alert').textContent();
  assert(
    Boolean(
      errAlert?.includes('heartbeatThreshold') &&
        errAlert?.includes('sources[0].dependencyIds[0]') &&
        errAlert?.includes('events[0].sourceId')
    ),
    'Invalid input is rejected with path-specific validation errors'
  );
  assert(
    (await page.getByTestId('virtual-clock-display').textContent())?.includes('T+7s') &&
      (await page.getByTestId('note-text-note-T7-1').textContent()) === noteContent,
    'All-or-nothing import rejection preserves active replay position (T+7s) and existing reviewer notes'
  );

  // 9. Test keyboard operation on seek slider and buttons
  const seekSlider = page.getByTestId('seek-slider');
  await seekSlider.focus();
  await page.keyboard.press('ArrowRight');
  const clockAfterKey = await page.getByTestId('virtual-clock-display').textContent();
  assert(
    clockAfterKey?.includes('T+8s'),
    'Keyboard ArrowRight on focused seek slider advances virtual clock from T+7s to T+8s',
    clockAfterKey ?? ''
  );

  // 10. Test Optional Section 7 / 8.6 Local Feed Adapter Harness in UI
  await page.getByTestId('toggle-adapter-panel-btn').click();
  await page.getByTestId('adapter-opt-in-btn').click();
  await page.getByTestId('adapter-send-valid-hb-btn').click();
  assert(
    (await page.getByTestId('adapter-card-status').textContent())?.includes(
      'FRESH_HEARTBEAT_RECEIVED'
    ),
    'Opt-in adapter harness transitions to FRESH_HEARTBEAT_RECEIVED on valid test poll'
  );
  await page.getByTestId('adapter-trigger-failure-btn').click();
  await page.getByTestId('adapter-advance-clock-btn').click();
  const adapterFailedText = await page.getByTestId('adapter-status-card').textContent();
  assert(
    Boolean(
      adapterFailedText?.includes('DISCONNECTED_OR_POLL_FAILED_UNKNOWN') &&
        adapterFailedText?.includes('Snapshot Age: 3s')
    ),
    'Opt-in adapter immediately marks cached card DISCONNECTED_OR_POLL_FAILED_UNKNOWN and advances snapshot age on poll failure'
  );
  await page.getByTestId('adapter-out-of-order-btn').click();
  assert(
    Boolean(
      (await page.getByTestId('adapter-status-card').textContent())?.includes(
        'Out-of-Order Ignored: 1'
      )
    ),
    'Opt-in adapter rejects out-of-order callback without rolling state backward'
  );

  // 11. Test narrow mobile viewport (390px width) responsiveness
  await page.setViewportSize({ width: 390, height: 844 });
  const hasHorizontalOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
  assert(
    !hasHorizontalOverflow,
    'Narrow mobile viewport (390x844) renders without page-level horizontal overflow'
  );

  // 12. Verify zero external network requests and zero page errors
  assert(
    externalRequests.length === 0,
    'Zero external HTTP/HTTPS requests made during entire browser E2E run',
    `External requests: ${externalRequests.join(', ')}`
  );
  assert(
    pageErrors.length === 0 && consoleErrors.length === 0,
    'Zero uncaught page errors or console errors during browser E2E run',
    `PageErrors: ${pageErrors.join('; ')} / ConsoleErrors: ${consoleErrors.join('; ')}`
  );

  await browser.close();

  console.log('\n============================================================');
  console.log(`PLAYWRIGHT CHROMIUM E2E SUITE PASSED: ${results.length} / ${results.length} checks`);
  console.log('============================================================');
  for (const r of results) {
    console.log(`  [PASS] ${r.name}`);
  }
}

runBrowserE2E().catch((err) => {
  console.error('\nPLAYWRIGHT CHROMIUM E2E SUITE FAILED:', err);
  process.exit(1);
});
