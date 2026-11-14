# Five-minute local demo (synthetic data, no hardware, no network)

Open `dist/index.html` (or `npm run serve` → http://127.0.0.1:4173/). All values below are from the bundled synthetic reference fixture, verified by `tests/e2e/app.spec.ts`.

**0:00 – Empty state.** Nothing is loaded, so no source has a status. Note the banner: synthetic, replay, not live.

**0:30 – Load.** Click **Load reference fixture**. Replay is **PAUSED at T = 0 s**. A and B: `✔ FRESH HEARTBEAT`; C: `? WAITING / UNKNOWN` (it never reports).

**1:00 – Step to T = 2** (click **Step +1 s** twice). In *Report disagreement*: A reports `"on"`, B reports `"off"` for the same subject/property/context, both on a synthetic synchronized clock, claimed time 2 → **REPORTS DIFFER — no winner is chosen**, with event IDs, times, rule and the shared declared dependency `gateway-1`. C: "no observation received… not an opposing report".

**1:45 – Step to T = 5.** A is still fresh (its heartbeat arrived exactly at the threshold and is processed first). **B turns `▲ STALE / UNKNOWN` exactly now** (last heartbeat at 0). The transitions list shows `t=5 B FRESH → STALE (cause not established)`.

**2:15 – Step to T = 6.** B receives a *backfilled* observation (claims source time 1). B **stays stale**: *last packet* t=6 but *last heartbeat* t=0; *receive age* 0 s vs *observation age* 5 s (claimed). Newest claimed time is still t=2.

**2:45 – Step to T = 7.** B gets a heartbeat → `✔ FRESH HEARTBEAT` and a **RECOVERY OF HEARTBEAT RECEIPT** transition (it says this is not evidence that the sensor or area recovered).

**3:15 – Seek to T = 10, then 12** (type in the T box or drag the slider). T=10: A stale (last heartbeat 5), B fresh age 3. T=12: B stale again (last heartbeat 7); the clock shows **STOPPED (end of log)**. Try **Play** at 4× speed from T=0; you reach the same screen. Seek back to 7 and compare with stepping: identical.

**3:45 – Inspect dependencies.** *Declared dependencies*: A↔B **DECLARED OVERLAP** `gateway-1` (asserted by the fixture author); A↔C and B↔C **UNKNOWN**. Different power labels (`power-1` / `power-2`) are not shown as independence.

**4:00 – Note, synthetic injection, export.** Seek to T = 3, add a reviewer note. Seek to T = 9, add another. Optionally inject a synthetic heartbeat for C (explicit synthetic event). Seek to T = 7 and click **Export record**. At T = 7 only the first note is visible (notes are causal-filtered; tick "show all" to see both).

**4:30 – Clear and re-import.** Click **Clear session** (empty state again), then **Import JSON file…** and choose the exported file. It returns to T = 7 with identical transitions and notes (status recomputed from events).

**4:50 – Invalid input.** With a session loaded, import `fixtures/invalid/duplicate-event-id.json`. A red error box shows `$.events[1].id — duplicate event ID…` and the existing session is unchanged. (Also try `fixtures/invalid/malformed.json` and `fixtures/html-literal-test.json`, whose HTML-like names render as literal text.)
