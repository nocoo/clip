/**
 * E2E proof: `clip install` installs a generated CLI's dependencies before
 * registering its global command.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runProcess } from "./support";

const ALIAS = "bookmarks";
const repoDir = process.cwd();
const schemaPath = join(repoDir, "packages", "demo-app", "clip.yaml");
const clipEntrypoint = join(repoDir, "packages", "cli", "src", "index.ts");

let workDir: string;
let bunInstallDir: string;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), "clip-e2e-install-work-"));
  bunInstallDir = await mkdtemp(join(tmpdir(), "clip-e2e-bun-install-"));
});

afterAll(async () => {
  await Promise.all([
    rm(workDir, { recursive: true, force: true }),
    rm(bunInstallDir, { recursive: true, force: true }),
  ]);
});

describe("e2e: clip install", () => {
  it("installs generated dependencies before linking the command", async () => {
    const env = { BUN_INSTALL: bunInstallDir };
    const installed = await runProcess(
      ["bun", "run", clipEntrypoint, "install", schemaPath],
      { cwd: workDir, env, timeoutMs: 30_000 },
    );

    if (installed.code !== 0) {
      throw new Error(
        `clip install failed (exit ${installed.code})\n--- stdout ---\n${installed.stdout}\n--- stderr ---\n${installed.stderr}`,
      );
    }

    const outputDir = join(workDir, ".clip-output", ALIAS);
    expect(
      await Bun.file(
        join(outputDir, "node_modules", "commander", "package.json"),
      ).exists(),
    ).toBe(true);
    expect(
      await Bun.file(
        join(outputDir, "node_modules", "@nocoo", "base-cli", "package.json"),
      ).exists(),
    ).toBe(true);

    const linked = await runProcess(
      [join(bunInstallDir, "bin", ALIAS), "--help"],
      {
        env,
        timeoutMs: 30_000,
      },
    );
    expect(linked.code).toBe(0);
    expect(linked.stdout).toContain("Usage: bookmarks");
  });
});
