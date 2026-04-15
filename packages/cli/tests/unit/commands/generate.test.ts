import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tempDir: string;

const MINIMAL_CLIP_YAML = `
name: "Test API"
alias: testapi
version: "1.0.0"
baseUrl: "http://localhost:3000"
auth:
  type: header
  headerName: "X-API-Key"
endpoints:
  - name: list
    method: GET
    path: /items
    description: "List all items"
    response:
      type: array
      items: { type: object, properties: { id: string, name: string } }
  - name: create
    method: POST
    path: /items
    description: "Create an item"
    params:
      body:
        name: { type: string, required: true }
    response:
      type: object
      properties: { id: string, name: string }
`;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "clip-cmd-gen-test-"));
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("generate command", () => {
  it("reads schema and produces CLI output directory", async () => {
    const schemaPath = join(tempDir, "clip.yaml");
    await writeFile(schemaPath, MINIMAL_CLIP_YAML);

    // Save original cwd and change to temp dir so .clip-output goes there
    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      const { generate } = await import("../../../src/commands/generate");
      await generate(schemaPath);

      const outputDir = join(tempDir, ".clip-output", "testapi");
      expect(existsSync(outputDir)).toBe(true);
      expect(existsSync(join(outputDir, "package.json"))).toBe(true);
      expect(existsSync(join(outputDir, "src", "index.ts"))).toBe(true);
      expect(existsSync(join(outputDir, "src", "client.ts"))).toBe(true);
      expect(existsSync(join(outputDir, "src", "config.ts"))).toBe(true);
      expect(existsSync(join(outputDir, "clip-metadata.json"))).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("generates command files for each endpoint", async () => {
    const schemaPath = join(tempDir, "clip-commands.yaml");
    await writeFile(schemaPath, MINIMAL_CLIP_YAML);

    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      // Clean output to avoid stale state
      const outputDir = join(tempDir, ".clip-output", "testapi");
      await rm(outputDir, { recursive: true, force: true }).catch(() => {});

      const { generate } = await import("../../../src/commands/generate");
      await generate(schemaPath);

      expect(existsSync(join(outputDir, "src", "commands", "list.ts"))).toBe(
        true,
      );
      expect(existsSync(join(outputDir, "src", "commands", "create.ts"))).toBe(
        true,
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("generates test files alongside CLI output", async () => {
    const schemaPath = join(tempDir, "clip-tests.yaml");
    await writeFile(schemaPath, MINIMAL_CLIP_YAML);

    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      const outputDir = join(tempDir, ".clip-output", "testapi");
      await rm(outputDir, { recursive: true, force: true }).catch(() => {});

      const { generate } = await import("../../../src/commands/generate");
      await generate(schemaPath);

      const testsDir = join(outputDir, "tests");
      expect(existsSync(testsDir)).toBe(true);
      expect(existsSync(join(testsDir, "list.test.ts"))).toBe(true);
      expect(existsSync(join(testsDir, "create.test.ts"))).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("exits with error for invalid schema path", async () => {
    const { generate } = await import("../../../src/commands/generate");

    try {
      await generate("/nonexistent/clip.yaml");
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeDefined();
    }
  });
});
