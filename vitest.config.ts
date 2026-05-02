import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/cli/vitest.config.ts",
      "packages/example-api/vitest.config.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95,
      },
      include: ["packages/*/src/**/*.ts"],
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
        "packages/example-api/src/index.ts",
        "packages/web/**",
      ],
    },
  },
});
