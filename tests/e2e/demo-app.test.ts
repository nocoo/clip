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
  requireSetup,
  runCleanups,
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
let tmpSchemaDir: string | undefined;

beforeAll(async () => {
  demo = await startDemoApp({ loginToken: TOKEN });

  // Write a clip.yaml pointed at the running demo-app's random port.
  tmpSchemaDir = await mkdtemp(join(tmpdir(), "clip-e2e-schema-"));
  const bookmarksSchemaPath = join(tmpSchemaDir, "clip.yaml");
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
  await runCleanups([
    { name: "stop demo-app", fn: async () => demo?.stop() },
    { name: "remove CLIP_HOME", fn: async () => cleanupHome?.() },
    {
      name: "remove generated dir",
      fn: async () => {
        if (generatedDir)
          await rm(generatedDir, { recursive: true, force: true });
      },
    },
    {
      name: "remove tmp schema dir",
      fn: async () => {
        if (tmpSchemaDir)
          await rm(tmpSchemaDir, { recursive: true, force: true });
      },
    },
  ]);
});

function getGenDir(): string {
  return requireSetup(generatedDir, "generatedDir");
}

function getDemoBaseUrl(): string {
  return requireSetup(demo, "demo").baseUrl;
}

function envForGenerated(): Record<string, string> {
  return {
    CLIP_HOME: requireSetup(clipHomeDir, "clipHomeDir"),
    CLIP_BASE_URL: getDemoBaseUrl(),
  };
}

describe("e2e: clip generate → generated CLI hits demo-app", () => {
  it("generates a directory with the expected files", async () => {
    const dir = getGenDir();
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
      ].map((p) => Bun.file(join(dir, p)).exists()),
    );
    expect(files.every(Boolean)).toBe(true);
  });

  it("--help lists every endpoint command + the login subcommand", async () => {
    const r = await runGenerated(getGenDir(), ["--help"], envForGenerated());
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
    const r = await runGenerated(getGenDir(), ["list"], envForGenerated());
    expect(r.code).toBe(0);
    const body = JSON.parse(r.stdout) as Array<{ id: string; title: string }>;
    expect(body).toHaveLength(3);
    expect(body[0]).toMatchObject({ id: "bm_1", title: "Bun" });
  });

  it("list passes query params through to the server (--tag, --archived, --limit)", async () => {
    const r = await runGenerated(
      getGenDir(),
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
      getGenDir(),
      ["get", "bm_2"],
      envForGenerated(),
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ id: "bm_2", title: "Hono" });
  });

  it("create POSTs a JSON body the server accepts", async () => {
    const r = await runGenerated(
      getGenDir(),
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
    const body = JSON.parse(r.stdout) as {
      id: string;
      url: string;
      title: string;
      notes: string;
    };
    expect(body).toMatchObject({
      url: "https://e2e.example",
      title: "E2E created",
      notes: "from-test",
    });
    expect(body.id).toMatch(/^bm_/);
  });

  it("update <id> PATCHes only the provided fields", async () => {
    const r = await runGenerated(
      getGenDir(),
      ["update", "bm_1", "--title", "Bun (updated)"],
      envForGenerated(),
    );
    expect(r.code).toBe(0);
    const body = JSON.parse(r.stdout) as { title: string; url: string };
    expect(body.title).toBe("Bun (updated)");
    expect(body.url).toBe("https://bun.sh");
  });

  it("archive <id> POSTs to the archive subroute", async () => {
    const r = await runGenerated(
      getGenDir(),
      ["archive", "bm_2"],
      envForGenerated(),
    );
    expect(r.code).toBe(0);
    const body = JSON.parse(r.stdout) as { archived: boolean };
    expect(body.archived).toBe(true);
  });

  it("delete <id> removes a bookmark and the server confirms", async () => {
    const dir = getGenDir();
    const env = envForGenerated();
    const r = await runGenerated(dir, ["delete", "bm_3"], env);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ deleted: true });

    // Verify by trying to fetch it back — should error with HTTP 404.
    const after = await runGenerated(dir, ["get", "bm_3"], env);
    expect(after.code).not.toBe(0);
    expect(after.stderr).toContain("HTTP 404");
  });

  it("tags returns the distinct sorted tag list", async () => {
    const r = await runGenerated(getGenDir(), ["tags"], envForGenerated());
    expect(r.code).toBe(0);
    const tags = JSON.parse(r.stdout) as string[];
    expect(tags).toContain("js");
    expect([...tags].sort()).toEqual(tags);
  });

  it("me proves the generated CLI is sending Authorization: Bearer <token>", async () => {
    const r = await runGenerated(getGenDir(), ["me"], envForGenerated());
    expect(r.code).toBe(0);
    const body = JSON.parse(r.stdout) as { token: string; email: string };
    expect(body.token).toBe(TOKEN);
    expect(body.email).toBe("demo@example.com");
  });

  it("missing credentials → CLI exits non-zero with a clear hint", async () => {
    const emptyHome = await mkdtemp(join(tmpdir(), "clip-e2e-empty-home-"));
    try {
      const r = await runGenerated(getGenDir(), ["list"], {
        CLIP_HOME: emptyHome,
        CLIP_BASE_URL: getDemoBaseUrl(),
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
      const r = await runGenerated(getGenDir(), ["me"], {
        CLIP_HOME: badHome,
        CLIP_BASE_URL: getDemoBaseUrl(),
      });
      expect(r.code).not.toBe(0);
      expect(r.stderr).toContain("HTTP 401");
    } finally {
      await rm(badHome, { recursive: true, force: true });
    }
  });
});
