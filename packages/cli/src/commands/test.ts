import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadCredentials } from "../auth/storage";

interface ClipMetadata {
  alias: string;
  baseUrl: string;
  auth: { type: string; headerName: string };
  generatedAt: string;
}

interface TestOptions {
  baseUrl?: string;
  apiKey?: string;
}

/**
 * `clip test <alias>` — run generated tests against a live API.
 */
export async function testCommand(
  alias: string,
  options: TestOptions,
): Promise<void> {
  const outputDir = resolve(`.clip-output/${alias}`);
  const testDir = join(outputDir, "tests");

  // Check tests exist
  if (!existsSync(testDir)) {
    console.error('❌ No tests found. Run "clip generate" first.');
    process.exit(1);
  }

  // Load metadata
  const metadataPath = join(outputDir, "clip-metadata.json");
  if (!existsSync(metadataPath)) {
    console.error('❌ No clip-metadata.json found. Run "clip generate" first.');
    process.exit(1);
  }

  const metadata: ClipMetadata = JSON.parse(
    await readFile(metadataPath, "utf-8"),
  );

  // Load credentials
  const creds = await loadCredentials(alias);

  // Extract a token-like value to expose as CLIP_TEST_API_KEY for both
  // header-based and OAuth-based generated tests.
  let credValue = "";
  if (creds?.type === "header") credValue = creds.headerValue;
  else if (creds?.type === "oauth") credValue = creds.token;

  const env = {
    ...process.env,
    CLIP_TEST_BASE_URL:
      options.baseUrl || process.env.CLIP_BASE_URL || metadata.baseUrl,
    CLIP_TEST_API_KEY: options.apiKey || credValue,
  };

  const proc = Bun.spawn(["bun", "test"], {
    cwd: outputDir,
    env,
    stdout: "inherit",
    stderr: "inherit",
  });

  const exitCode = await proc.exited;
  process.exit(exitCode);
}
