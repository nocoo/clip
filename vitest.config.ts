import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    allowOnly: false,
    passWithNoTests: false,
    projects: ["packages/cli/vitest.config.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
      include: ["packages/cli/src/**/*.ts"],
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/tests/**",
        "**/*.d.ts",
        "**/*.config.ts",
        "packages/cli/src/index.ts",
        "packages/cli/src/commands/install.ts",
        "packages/cli/src/commands/test.ts",
        "packages/cli/src/schema/types.ts",
        // Local Hono E2E fixture apps — exercised by test:e2e
        "packages/example-api/**",
        "packages/demo-app/**",
        "packages/web/**",
      ],
    },
  },
});
