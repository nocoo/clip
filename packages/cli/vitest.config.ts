import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "cli",
    allowOnly: false,
    passWithNoTests: false,
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
