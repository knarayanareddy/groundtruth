import { defineConfig } from "vitest/config";

// Unit tests only. Kept separate from vite.config.ts (the supplied app config is untouched).
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
    environment: "node",
    reporters: ["default"],
  },
});
