/**
 * E2E proof: browser-login persists a token, generated CLI uses it.
 *
 * Strategy: we inject a fake performLogin that simulates the loopback
 * leg (it fetches /api/auth/cli with a known callback URL, parses the
 * redirect Location, and hands the token to clip's onSaveToken). This
 * sidesteps cli-base's CSRF state machinery (which is its own concern,
 * not clip's) while still proving:
 *   1. clip wires the schema → performLogin correctly
 *   2. clip persists the received token to CLIP_HOME with 0600/0700
 *   3. the generated CLI reads that token and sends it on subsequent calls
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { authLogin } from "../../packages/cli/src/commands/auth";
import {
  type DemoAppHandle,
  makeTempClipHome,
  runGenerate,
  runGenerated,
  startDemoApp,
} from "./support";

const ALIAS = "bookmarks";
const LOGIN_TOKEN = "browser-login-token-789";

let demo: DemoAppHandle | undefined;
let workDir: string | undefined;
let generatedDir: string | undefined;
let clipHomeDir: string | undefined;
let cleanupHome: (() => Promise<void>) | undefined;
let originalCwd: string;
let originalClipHome: string | undefined;
let cwdChanged = false;

beforeAll(async () => {
  originalCwd = process.cwd();
  originalClipHome = process.env.CLIP_HOME;

  demo = await startDemoApp({ loginToken: LOGIN_TOKEN });

  workDir = await mkdtemp(join(tmpdir(), "clip-e2e-bl-work-"));
  const baseYaml = await Bun.file("packages/demo-app/clip.yaml").text();
  await writeFile(
    join(workDir, "clip.yaml"),
    baseYaml.replace(
      'baseUrl: "http://localhost:3100"',
      `baseUrl: "${demo.baseUrl}"`,
    ),
  );

  generatedDir = await mkdtemp(join(tmpdir(), "clip-e2e-bl-gen-"));
  await runGenerate(join(workDir, "clip.yaml"), generatedDir);

  const home = await makeTempClipHome();
  clipHomeDir = home.path;
  cleanupHome = home.cleanup;

  process.env.CLIP_HOME = clipHomeDir;
  process.chdir(workDir);
  cwdChanged = true;
}, 30_000);

afterAll(async () => {
  if (cwdChanged) process.chdir(originalCwd);
  if (originalClipHome === undefined) {
    delete process.env.CLIP_HOME;
  } else {
    process.env.CLIP_HOME = originalClipHome;
  }
  if (demo) await demo.stop().catch(() => {});
  if (cleanupHome) await cleanupHome().catch(() => {});
  if (generatedDir)
    await rm(generatedDir, { recursive: true, force: true }).catch(() => {});
  if (workDir)
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
});

describe("e2e: browser-login full round trip", () => {
  it("authLogin → demo-app callback → token saved to CLIP_HOME with 0600", async () => {
    // Fake performLogin: simulate the loopback leg by fetching /api/auth/cli
    // with a sentinel callback URL, parsing the redirect Location header,
    // and handing the extracted api_key to clip's onSaveToken.
    const fakePerformLogin: typeof import("@nocoo/cli-base").performLogin =
      async (opts) => {
        const sentinel = "http://e2e.local/cb";
        const url = new URL(opts.loginPath, opts.apiUrl);
        url.searchParams.set("callback", sentinel);
        const r = await fetch(url.toString(), { redirect: "manual" });
        const loc = r.headers.get("location") || "";
        const tokenParam = opts.tokenParam ?? "api_key";
        const parsed = new URL(loc);
        const token = parsed.searchParams.get(tokenParam) || "";
        opts.onSaveToken?.(token);
        return { success: true, email: "demo@example.com" };
      };

    const openBrowser = async (_url: string): Promise<void> => {
      // Not used by fakePerformLogin; satisfies the dep injection contract.
    };

    await authLogin(ALIAS, {
      openBrowser,
      performLogin: fakePerformLogin,
      timeoutMs: 5_000,
    });

    const credPath = join(clipHomeDir as string, ALIAS, "credentials.json");
    const raw = await readFile(credPath, "utf-8");
    const creds = JSON.parse(raw);
    expect(creds.type).toBe("browser-login");
    expect(creds.token).toBe(LOGIN_TOKEN);
    expect(creds.email).toBe("demo@example.com");

    const st = await stat(credPath);
    expect(st.mode & 0o777).toBe(0o600);

    const dirSt = await stat(join(clipHomeDir as string, ALIAS));
    expect(dirSt.mode & 0o777).toBe(0o700);
  });

  it("generated CLI uses the saved token on subsequent requests", async () => {
    const r = await runGenerated(generatedDir as string, ["me"], {
      CLIP_HOME: clipHomeDir as string,
      CLIP_BASE_URL: (demo as DemoAppHandle).baseUrl,
    });
    expect(r.code).toBe(0);
    const body = JSON.parse(r.stdout) as { token: string; email: string };
    expect(body.token).toBe(LOGIN_TOKEN);
  });
});
