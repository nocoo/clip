import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "cli",
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
