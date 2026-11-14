import { defineConfig } from "@playwright/test";

// Browser tests run against the BUILT single-file app (dist/index.html via file://), i.e. the offline mode.
// Run `npm run build` first (npm run test:all does it).
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  outputDir: "test-results/playwright-artifacts",
  reporter: [["list"], ["json", { outputFile: "test-results/playwright-report.json" }]],
  use: {
    browserName: "chromium",
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
  },
});
