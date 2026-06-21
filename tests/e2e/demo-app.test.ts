/**
 * E2E proof: clip generate → run the generated CLI → assert real HTTP behavior
 * against a live demo-app. Nothing mocked.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type DemoAppHandle,
  makeTempClipHome,
  runGenerate,
  runGenerated,
  seedCredentials,
  startDemoApp,
} from "./support";

const ALIAS = "bookmarks";
const TOKEN = "e2e-token-123";

let demo: DemoAppHandle | undefined;
let generatedDir: string | undefined;
let clipHomeDir: string | undefined;
let cleanupHome: (() => Promise<void>) | undefined;
let bookmarksSchemaPath: string;
let tmpSchemaDir: string | undefined;

beforeAll(async () => {
  demo = await startDemoApp({ loginToken: TOKEN });

  // Write a clip.yaml pointed at the running demo-app's random port.
  tmpSchemaDir = await mkdtemp(join(tmpdir(), "clip-e2e-schema-"));
  bookmarksSchemaPath = join(tmpSchemaDir, "clip.yaml");
  const baseYaml = await Bun.file("packages/demo-app/clip.yaml").text();
  await writeFile(
    bookmarksSchemaPath,
    baseYaml.replace(
      'baseUrl: "http://localhost:3100"',
      `baseUrl: "${demo.baseUrl}"`,
    ),
  );

  generatedDir = await mkdtemp(join(tmpdir(), "clip-e2e-gen-"));
  await runGenerate(bookmarksSchemaPath, generatedDir);

  const home = await makeTempClipHome();
  clipHomeDir = home.path;
  cleanupHome = home.cleanup;

  await seedCredentials(clipHomeDir, ALIAS, {
    type: "browser-login",
    token: TOKEN,
  });
}, 30_000);

afterAll(async () => {
  // Each step is guarded so a partial beforeAll failure still drains the rest.
  if (demo) await demo.stop().catch(() => {});
  if (cleanupHome) await cleanupHome().catch(() => {});
  if (generatedDir)
    await rm(generatedDir, { recursive: true, force: true }).catch(() => {});
  if (tmpSchemaDir)
    await rm(tmpSchemaDir, { recursive: true, force: true }).catch(() => {});
});

function envForGenerated(): Record<string, string> {
  if (!clipHomeDir || !demo) throw new Error("e2e setup did not complete");
  return { CLIP_HOME: clipHomeDir, CLIP_BASE_URL: demo.baseUrl };
}

describe("e2e: clip generate → generated CLI hits demo-app", () => {
  it("generates a directory with the expected files", async () => {
    const files = await Promise.all(
      [
        "src/index.ts",
        "src/client.ts",
        "src/config.ts",
        "src/commands/list.ts",
        "src/commands/get.ts",
        "src/commands/create.ts",
        "src/commands/update.ts",
        "src/commands/delete.ts",
        "src/commands/archive.ts",
        "src/commands/tags.ts",
        "src/commands/me.ts",
        "src/commands/health.ts",
        "src/commands/_login.ts",
        "package.json",
        "tsconfig.json",
      ].map((p) => Bun.file(join(generatedDir, p)).exists()),
    );
    expect(files.every(Boolean)).toBe(true);
  });

  it("--help lists every endpoint command + the login subcommand", async () => {
    const r = await runGenerated(generatedDir, ["--help"], envForGenerated());
    expect(r.code).toBe(0);
    for (const name of [
      "health",
      "me",
      "list",
      "get",
      "create",
      "update",
      "delete",
      "archive",
      "tags",
      "login",
    ]) {
      expect(r.stdout).toContain(name);
    }
  });

  it("list returns seeded bookmarks as JSON", async () => {
    const r = await runGenerated(generatedDir, ["list"], envForGenerated());
    expect(r.code).toBe(0);
    const body = JSON.parse(r.stdout);
    expect(body).toHaveLength(3);
    expect(body[0]).toMatchObject({ id: "bm_1", title: "Bun" });
  });

  it("list passes query params through to the server (--tag, --archived, --limit)", async () => {
    const r = await runGenerated(
      generatedDir,
      ["list", "--tag", "js", "--archived", "false", "--limit", "1"],
      envForGenerated(),
    );
    expect(r.code).toBe(0);
    const body = JSON.parse(r.stdout) as Array<{ tags: string[] }>;
    expect(body).toHaveLength(1);
    expect(body[0].tags).toContain("js");
  });

  it("get <id> reads the path param and returns one bookmark", async () => {
    const r = await runGenerated(
      generatedDir,
      ["get", "bm_2"],
      envForGenerated(),
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ id: "bm_2", title: "Hono" });
  });

  it("create POSTs a JSON body the server accepts", async () => {
    const r = await runGenerated(
      generatedDir,
      [
        "create",
        "--url",
        "https://e2e.example",
        "--title",
        "E2E created",
        "--notes",
        "from-test",
      ],
      envForGenerated(),
    );
    expect(r.code).toBe(0);
    const body = JSON.parse(r.stdout);
    expect(body).toMatchObject({
      url: "https://e2e.example",
      title: "E2E created",
      notes: "from-test",
    });
    expect(body.id).toMatch(/^bm_/);
  });

  it("update <id> PATCHes only the provided fields", async () => {
    const r = await runGenerated(
      generatedDir,
      ["update", "bm_1", "--title", "Bun (updated)"],
      envForGenerated(),
    );
    expect(r.code).toBe(0);
    const body = JSON.parse(r.stdout);
    expect(body.title).toBe("Bun (updated)");
    expect(body.url).toBe("https://bun.sh");
  });

  it("archive <id> POSTs to the archive subroute", async () => {
    const r = await runGenerated(
      generatedDir,
      ["archive", "bm_2"],
      envForGenerated(),
    );
    expect(r.code).toBe(0);
    const body = JSON.parse(r.stdout);
    expect(body.archived).toBe(true);
  });

  it("delete <id> removes a bookmark and the server confirms", async () => {
    // bm_3 starts as a tag-validation fixture; delete it now.
    const r = await runGenerated(
      generatedDir,
      ["delete", "bm_3"],
      envForGenerated(),
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ deleted: true });

    // Verify by trying to fetch it back — should error with HTTP 404.
    const after = await runGenerated(
      generatedDir,
      ["get", "bm_3"],
      envForGenerated(),
    );
    expect(after.code).not.toBe(0);
    expect(after.stderr).toContain("HTTP 404");
  });

  it("tags returns the distinct sorted tag list", async () => {
    const r = await runGenerated(generatedDir, ["tags"], envForGenerated());
    expect(r.code).toBe(0);
    const tags = JSON.parse(r.stdout) as string[];
    expect(tags).toContain("js");
    expect([...tags].sort()).toEqual(tags);
  });

  it("me proves the generated CLI is sending Authorization: Bearer <token>", async () => {
    const r = await runGenerated(generatedDir, ["me"], envForGenerated());
    expect(r.code).toBe(0);
    const body = JSON.parse(r.stdout) as { token: string; email: string };
    expect(body.token).toBe(TOKEN);
    expect(body.email).toBe("demo@example.com");
  });

  it("missing credentials → CLI exits non-zero with a clear hint", async () => {
    const emptyHome = await mkdtemp(join(tmpdir(), "clip-e2e-empty-home-"));
    try {
      const r = await runGenerated(generatedDir, ["list"], {
        CLIP_HOME: emptyHome,
        CLIP_BASE_URL: demo.baseUrl,
      });
      expect(r.code).not.toBe(0);
      expect(r.stderr).toContain("No credentials found");
    } finally {
      await rm(emptyHome, { recursive: true, force: true });
    }
  });

  it("bad token → server returns 401 and CLI propagates HTTP 401", async () => {
    const badHome = await mkdtemp(join(tmpdir(), "clip-e2e-bad-home-"));
    try {
      // Seed an empty bearer (server rejects "Bearer ").
      await seedCredentials(badHome, ALIAS, {
        type: "browser-login",
        token: "",
      });
      const r = await runGenerated(generatedDir, ["me"], {
        CLIP_HOME: badHome,
        CLIP_BASE_URL: demo.baseUrl,
      });
      expect(r.code).not.toBe(0);
      expect(r.stderr).toContain("HTTP 401");
    } finally {
      await rm(badHome, { recursive: true, force: true });
    }
  });
});
