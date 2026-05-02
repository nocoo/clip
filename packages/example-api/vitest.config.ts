import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "example-api",
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
