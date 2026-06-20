/**
 * E2E harness helpers — boot the demo-app on a random port, run the clip CLI,
 * exec the generated CLI, and clean up after each test.
 *
 * These are real-process tests: nothing is mocked. Tests prove that
 *   clip generate → install-free `bun run <generated>/src/index.ts <cmd>`
 *   → HTTP request → demo-app
 * produces the expected behavior end-to-end.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "bun";

export interface DemoAppHandle {
  port: number;
  baseUrl: string;
  loginToken: string;
  /** Kill the demo-app process. */
  stop: () => Promise<void>;
}

/**
 * Boot demo-app on a random port. Resolves once the server answers /health.
 */
export async function startDemoApp(
  opts: { loginToken?: string } = {},
): Promise<DemoAppHandle> {
  const port = await pickFreePort();
  const loginToken = opts.loginToken ?? "e2e-token-default";

  const proc = spawn({
    cmd: ["bun", "run", "packages/demo-app/src/index.ts"],
    env: {
      ...process.env,
      PORT: String(port),
      DEMO_LOGIN_TOKEN: loginToken,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const baseUrl = `http://localhost:${port}`;
  await waitForHealth(baseUrl, 5000);

  return {
    port,
    baseUrl,
    loginToken,
    stop: async () => {
      // SIGTERM is ignored by Bun.serve, so go straight to SIGKILL —
      // we don't want stray demo-app processes outliving the test run.
      proc.kill("SIGKILL");
      await proc.exited;
    },
  };
}

/**
 * Pick a free TCP port by binding to :0 and reading what the OS assigned.
 */
async function pickFreePort(): Promise<number> {
  const server = Bun.serve({ port: 0, fetch: () => new Response("ok") });
  const port = server.port;
  server.stop(true);
  return port;
}

async function waitForHealth(
  baseUrl: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${baseUrl}/health`);
      if (r.ok) return;
    } catch {
      // not yet listening
    }
    await sleep(50);
  }
  throw new Error(`demo-app did not become healthy at ${baseUrl}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Make a temporary CLIP_HOME for tests so they don't touch the user's ~/.clip.
 */
export async function makeTempClipHome(): Promise<{
  path: string;
  cleanup: () => Promise<void>;
}> {
  const path = await mkdtemp(join(tmpdir(), "clip-e2e-home-"));
  return {
    path,
    cleanup: async () => rm(path, { recursive: true, force: true }),
  };
}

/**
 * Run `clip generate` on a yaml at `schemaPath`, writing output to a temp dir.
 * Returns the absolute output dir (containing src/index.ts).
 */
export async function runGenerate(
  schemaPath: string,
  outputDir: string,
): Promise<void> {
  const proc = spawn({
    cmd: [
      "bun",
      "run",
      "packages/cli/src/index.ts",
      "generate",
      schemaPath,
      "--output",
      outputDir,
    ],
    env: { ...process.env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const code = await proc.exited;
  if (code !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`clip generate failed (exit ${code}): ${stderr}`);
  }
}

export interface RunGeneratedResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Exec the generated CLI's index.ts with args, returning code + captured streams.
 */
export async function runGenerated(
  generatedDir: string,
  args: string[],
  env: Record<string, string>,
): Promise<RunGeneratedResult> {
  const proc = spawn({
    cmd: ["bun", "run", join(generatedDir, "src", "index.ts"), ...args],
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stdout, stderr };
}

/**
 * Pre-seed a credentials.json for an alias under the given CLIP_HOME, with
 * the discriminated-union shape the runtime expects.
 */
export async function seedCredentials(
  clipHome: string,
  alias: string,
  creds:
    | { type: "header"; headerName: string; headerValue: string }
    | { type: "browser-login"; token: string; email?: string }
    | {
        type: "cf-access";
        clientId: string;
        clientSecret: string;
        clientIdHeader: string;
        clientSecretHeader: string;
      },
): Promise<void> {
  const { mkdir, writeFile, chmod } = await import("node:fs/promises");
  const dir = join(clipHome, alias);
  await mkdir(dir, { recursive: true });
  await chmod(dir, 0o700);
  const credPath = join(dir, "credentials.json");
  await writeFile(credPath, JSON.stringify(creds, null, 2));
  await chmod(credPath, 0o600);
}
