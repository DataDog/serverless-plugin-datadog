import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["snapshot_tests/**/*.spec.ts"],
    clearMocks: true,
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["lcov", "text-summary"],
      include: ["src/**/*.ts"],
    },
  },
});
