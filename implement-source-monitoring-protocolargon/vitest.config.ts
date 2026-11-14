import { defineConfig } from "vitest/config";

// `tests/browser-e2e.spec.ts` is a standalone Playwright script run with
// `npx tsx tests/browser-e2e.spec.ts` (see README step 5), not a Vitest suite. Excluding it here
// keeps a bare `npx vitest run` green instead of failing with "No test suite found in file".
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/dist/**", "tests/browser-e2e.spec.ts"],
    environment: "jsdom",
    reporters: ["default"],
  },
});
