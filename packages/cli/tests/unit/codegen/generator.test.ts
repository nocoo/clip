import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateCli } from "../../../src/codegen/generator";
import type { ClipSchema } from "../../../src/schema/types";

let tempDir: string;

const SAMPLE_SCHEMA: ClipSchema = {
  name: "Todo API",
  alias: "todo",
  version: "1.0.0",
  baseUrl: "http://localhost:3000",
  auth: {
    type: "header",
    headerName: "X-API-Key",
  },
  endpoints: [
    {
      name: "list",
      method: "GET",
      path: "/todos",
      description: "List all todos",
      response: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: "string",
            title: "string",
            completed: "boolean",
          },
        },
      },
    },
    {
      name: "create",
      method: "POST",
      path: "/todos",
      description: "Create a new todo",
      params: {
        body: {
          title: { type: "string", required: true },
        },
      },
      response: {
        type: "object",
        properties: {
          id: "string",
          title: "string",
          completed: "boolean",
        },
      },
    },
    {
      name: "get",
      method: "GET",
      path: "/todos/:id",
      description: "Get a todo by ID",
      params: {
        path: {
          id: { type: "string", required: true },
        },
      },
      response: {
        type: "object",
        properties: {
          id: "string",
          title: "string",
          completed: "boolean",
        },
      },
    },
    {
      name: "update",
      method: "PATCH",
      path: "/todos/:id",
      description: "Update a todo",
      params: {
        path: {
          id: { type: "string", required: true },
        },
        body: {
          title: { type: "string" },
          completed: { type: "boolean" },
        },
      },
      response: {
        type: "object",
        properties: {
          id: "string",
          title: "string",
          completed: "boolean",
        },
      },
    },
    {
      name: "delete",
      method: "DELETE",
      path: "/todos/:id",
      description: "Delete a todo",
      params: {
        path: {
          id: { type: "string", required: true },
        },
      },
    },
  ],
};

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "clip-codegen-test-"));
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("generateCli", () => {
  it("generates correct directory structure", async () => {
    const outputDir = join(tempDir, "structure-test");
    await generateCli(SAMPLE_SCHEMA, outputDir);

    const { Glob } = await import("bun");
    const glob = new Glob("**/*");
    const files: string[] = [];
    for await (const file of glob.scan({ cwd: outputDir })) {
      files.push(file);
    }

    expect(files).toContain("src/index.ts");
    expect(files).toContain("src/client.ts");
    expect(files).toContain("src/config.ts");
    expect(files).toContain("package.json");
    expect(files).toContain("tsconfig.json");
    expect(files).toContain("clip-metadata.json");
  });

  it("generates one command file per endpoint", async () => {
    const outputDir = join(tempDir, "commands-test");
    await generateCli(SAMPLE_SCHEMA, outputDir);

    const { Glob } = await import("bun");
    const glob = new Glob("src/commands/*.ts");
    const commandFiles: string[] = [];
    for await (const file of glob.scan({ cwd: outputDir })) {
      commandFiles.push(file);
    }

    expect(commandFiles).toContain("src/commands/list.ts");
    expect(commandFiles).toContain("src/commands/create.ts");
    expect(commandFiles).toContain("src/commands/get.ts");
    expect(commandFiles).toContain("src/commands/update.ts");
    expect(commandFiles).toContain("src/commands/delete.ts");
    expect(commandFiles).toHaveLength(5);
  });

  it("generated index.ts imports all commands", async () => {
    const outputDir = join(tempDir, "index-test");
    await generateCli(SAMPLE_SCHEMA, outputDir);

    const indexContent = await readFile(
      join(outputDir, "src/index.ts"),
      "utf-8",
    );

    expect(indexContent).toContain("#!/usr/bin/env bun");
    expect(indexContent).toContain('from "./commands/list"');
    expect(indexContent).toContain('from "./commands/create"');
    expect(indexContent).toContain('from "./commands/get"');
    expect(indexContent).toContain('from "./commands/update"');
    expect(indexContent).toContain('from "./commands/delete"');
    expect(indexContent).toContain("program.parse()");
  });

  it("generated client.ts uses correct baseUrl", async () => {
    const outputDir = join(tempDir, "client-test");
    await generateCli(SAMPLE_SCHEMA, outputDir);

    const clientContent = await readFile(
      join(outputDir, "src/client.ts"),
      "utf-8",
    );

    expect(clientContent).toContain(
      'process.env.CLIP_BASE_URL || "http://localhost:3000"',
    );
    expect(clientContent).toContain("loadConfig");
    expect(clientContent).toContain("config.headerName");
    expect(clientContent).toContain("config.headerValue");
  });

  it("generated config.ts reads correct alias path", async () => {
    const outputDir = join(tempDir, "config-test");
    await generateCli(SAMPLE_SCHEMA, outputDir);

    const configContent = await readFile(
      join(outputDir, "src/config.ts"),
      "utf-8",
    );

    expect(configContent).toContain('"todo"');
    expect(configContent).toContain("CLIP_HOME");
    expect(configContent).toContain("credentials.json");
  });

  it("path params are correctly substituted in command templates", async () => {
    const outputDir = join(tempDir, "path-params-test");
    await generateCli(SAMPLE_SCHEMA, outputDir);

    const getContent = await readFile(
      join(outputDir, "src/commands/get.ts"),
      "utf-8",
    );

    // Path params should be replaced in the path string
    expect(getContent).toContain('.replace(":id"');
    expect(getContent).toContain("args.id");
  });

  it("required params generate requiredOption in Commander", async () => {
    const outputDir = join(tempDir, "required-opts-test");
    await generateCli(SAMPLE_SCHEMA, outputDir);

    const indexContent = await readFile(
      join(outputDir, "src/index.ts"),
      "utf-8",
    );

    // The create endpoint has title as required body param
    expect(indexContent).toContain("requiredOption");
    expect(indexContent).toContain("--title");
  });

  it("optional params generate option in Commander", async () => {
    const outputDir = join(tempDir, "optional-opts-test");
    await generateCli(SAMPLE_SCHEMA, outputDir);

    const indexContent = await readFile(
      join(outputDir, "src/index.ts"),
      "utf-8",
    );

    // The update endpoint has title and completed as optional body params
    expect(indexContent).toContain('.option("--title');
    expect(indexContent).toContain('.option("--completed');
  });

  it("body params are sent as JSON in POST commands", async () => {
    const outputDir = join(tempDir, "body-test");
    await generateCli(SAMPLE_SCHEMA, outputDir);

    const createContent = await readFile(
      join(outputDir, "src/commands/create.ts"),
      "utf-8",
    );

    expect(createContent).toContain("body:");
    expect(createContent).toContain("title");
    expect(createContent).toContain('"POST"');
  });

  it("query params are appended to URL in GET commands", async () => {
    // Create a schema with query params
    const querySchema: ClipSchema = {
      ...SAMPLE_SCHEMA,
      endpoints: [
        {
          name: "search",
          method: "GET",
          path: "/todos",
          description: "Search todos",
          params: {
            query: {
              q: { type: "string" },
              limit: { type: "number" },
            },
          },
        },
      ],
    };

    const outputDir = join(tempDir, "query-test");
    await generateCli(querySchema, outputDir);

    const searchContent = await readFile(
      join(outputDir, "src/commands/search.ts"),
      "utf-8",
    );

    expect(searchContent).toContain("query:");
  });

  it("generates valid package.json with commander dependency", async () => {
    const outputDir = join(tempDir, "pkg-test");
    await generateCli(SAMPLE_SCHEMA, outputDir);

    const pkgContent = await readFile(join(outputDir, "package.json"), "utf-8");
    const pkg = JSON.parse(pkgContent);

    expect(pkg.name).toBe("todo");
    expect(pkg.bin).toBeDefined();
    expect(pkg.dependencies.commander).toBeDefined();
  });

  it("generates valid tsconfig.json", async () => {
    const outputDir = join(tempDir, "tsconfig-test");
    await generateCli(SAMPLE_SCHEMA, outputDir);

    const tsContent = await readFile(join(outputDir, "tsconfig.json"), "utf-8");
    const ts = JSON.parse(tsContent);

    expect(ts.compilerOptions).toBeDefined();
    expect(ts.compilerOptions.strict).toBe(true);
  });

  it("generates clip-metadata.json with correct content", async () => {
    const outputDir = join(tempDir, "metadata-test");
    await generateCli(SAMPLE_SCHEMA, outputDir);

    const metaContent = await readFile(
      join(outputDir, "clip-metadata.json"),
      "utf-8",
    );
    const meta = JSON.parse(metaContent);

    expect(meta.alias).toBe("todo");
    expect(meta.baseUrl).toBe("http://localhost:3000");
    expect(meta.auth.type).toBe("header");
    expect(meta.auth.headerName).toBe("X-API-Key");
    expect(meta.generatedAt).toBeDefined();
  });

  it("coerces number types in commands", async () => {
    const numSchema: ClipSchema = {
      ...SAMPLE_SCHEMA,
      endpoints: [
        {
          name: "get-page",
          method: "GET",
          path: "/items",
          description: "Get items",
          params: {
            query: {
              page: { type: "number" },
              active: { type: "boolean" },
            },
          },
        },
      ],
    };

    const outputDir = join(tempDir, "coerce-test");
    await generateCli(numSchema, outputDir);

    const cmdContent = await readFile(
      join(outputDir, "src/commands/get-page.ts"),
      "utf-8",
    );

    // Number params should be coerced from string
    expect(cmdContent).toContain("Number(");
    // Boolean params should have a coercion
    expect(cmdContent).toMatch(/true|=== "true"/);
  });
});
