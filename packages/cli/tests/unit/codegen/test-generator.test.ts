import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateTests } from "../../../src/codegen/test-generator";
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
  tempDir = await mkdtemp(join(tmpdir(), "clip-testgen-test-"));
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("generateTests", () => {
  it("generates one test file per independent endpoint", async () => {
    const outputDir = join(tempDir, "independent-tests");
    await generateTests(SAMPLE_SCHEMA, outputDir);

    const { Glob } = await import("bun");
    const glob = new Glob("tests/*.test.ts");
    const testFiles: string[] = [];
    for await (const file of glob.scan({ cwd: outputDir })) {
      testFiles.push(file);
    }

    // list and create are independent; get/update/delete are CRUD-dependent
    expect(testFiles).toContain("tests/list.test.ts");
    expect(testFiles).toContain("tests/create.test.ts");
  });

  it("generates CRUD-sequence test for resource-dependent endpoints", async () => {
    const outputDir = join(tempDir, "crud-tests");
    await generateTests(SAMPLE_SCHEMA, outputDir);

    const { Glob } = await import("bun");
    const glob = new Glob("tests/*.test.ts");
    const testFiles: string[] = [];
    for await (const file of glob.scan({ cwd: outputDir })) {
      testFiles.push(file);
    }

    expect(testFiles).toContain("tests/crud-sequence.test.ts");
  });

  it("does not generate individual tests for get/update/delete", async () => {
    const outputDir = join(tempDir, "no-individual-crud");
    await generateTests(SAMPLE_SCHEMA, outputDir);

    const { Glob } = await import("bun");
    const glob = new Glob("tests/*.test.ts");
    const testFiles: string[] = [];
    for await (const file of glob.scan({ cwd: outputDir })) {
      testFiles.push(file);
    }

    // get, update, delete should NOT have individual test files
    expect(testFiles).not.toContain("tests/get.test.ts");
    expect(testFiles).not.toContain("tests/update.test.ts");
    expect(testFiles).not.toContain("tests/delete.test.ts");
  });

  it("generated tests use correct HTTP method", async () => {
    const outputDir = join(tempDir, "http-method-test");
    await generateTests(SAMPLE_SCHEMA, outputDir);

    const listContent = await readFile(
      join(outputDir, "tests/list.test.ts"),
      "utf-8",
    );
    expect(listContent).toContain('"GET"');

    const createContent = await readFile(
      join(outputDir, "tests/create.test.ts"),
      "utf-8",
    );
    expect(createContent).toContain('"POST"');
  });

  it("generated tests include auth header", async () => {
    const outputDir = join(tempDir, "auth-header-test");
    await generateTests(SAMPLE_SCHEMA, outputDir);

    const listContent = await readFile(
      join(outputDir, "tests/list.test.ts"),
      "utf-8",
    );
    expect(listContent).toContain("X-API-Key");
    expect(listContent).toContain("CLIP_TEST_API_KEY");
  });

  it("response shape validation handles object type", async () => {
    const outputDir = join(tempDir, "shape-object-test");
    await generateTests(SAMPLE_SCHEMA, outputDir);

    const createContent = await readFile(
      join(outputDir, "tests/create.test.ts"),
      "utf-8",
    );

    expect(createContent).toContain("typeof body");
    expect(createContent).toContain('"object"');
    expect(createContent).toContain("body.id");
    expect(createContent).toContain("body.title");
    expect(createContent).toContain("body.completed");
  });

  it("response shape validation handles array type", async () => {
    const outputDir = join(tempDir, "shape-array-test");
    await generateTests(SAMPLE_SCHEMA, outputDir);

    const listContent = await readFile(
      join(outputDir, "tests/list.test.ts"),
      "utf-8",
    );

    expect(listContent).toContain("Array.isArray(body)");
    expect(listContent).toContain("body.length > 0");
    expect(listContent).toContain("body[0]");
  });

  it("sample data generation uses correct types", async () => {
    const outputDir = join(tempDir, "sample-data-test");
    await generateTests(SAMPLE_SCHEMA, outputDir);

    const createContent = await readFile(
      join(outputDir, "tests/create.test.ts"),
      "utf-8",
    );

    // String type → "test-<name>"
    expect(createContent).toContain('"test-title"');
  });

  it("CRUD sequence test chains create → get → update → delete", async () => {
    const outputDir = join(tempDir, "crud-sequence-test");
    await generateTests(SAMPLE_SCHEMA, outputDir);

    const crudContent = await readFile(
      join(outputDir, "tests/crud-sequence.test.ts"),
      "utf-8",
    );

    // Should contain all four operations in order
    expect(crudContent).toContain("CRUD sequence");
    expect(crudContent).toContain('"POST"');
    expect(crudContent).toContain('"GET"');
    expect(crudContent).toContain('"PATCH"');
    expect(crudContent).toContain('"DELETE"');
    // Should chain the created resource ID
    expect(crudContent).toContain("createdId");
  });

  it("environment variable fallbacks work correctly", async () => {
    const outputDir = join(tempDir, "env-vars-test");
    await generateTests(SAMPLE_SCHEMA, outputDir);

    const listContent = await readFile(
      join(outputDir, "tests/list.test.ts"),
      "utf-8",
    );

    expect(listContent).toContain("CLIP_TEST_BASE_URL");
    expect(listContent).toContain("http://localhost:3000");
    expect(listContent).toContain("CLIP_TEST_API_KEY");
  });

  it("generated tests include query params in URL", async () => {
    const queryParamSchema: ClipSchema = {
      ...SAMPLE_SCHEMA,
      endpoints: [
        {
          name: "search",
          method: "GET",
          path: "/todos",
          description: "Search todos",
          params: {
            query: {
              q: { type: "string", required: true },
              limit: { type: "number" },
              completed: { type: "boolean" },
            },
          },
          response: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: "string",
                title: "string",
              },
            },
          },
        },
      ],
    };

    const outputDir = join(tempDir, "query-params-test");
    await generateTests(queryParamSchema, outputDir);

    const searchContent = await readFile(
      join(outputDir, "tests/search.test.ts"),
      "utf-8",
    );

    // Should include query params in URL
    expect(searchContent).toContain("q=test-q");
    expect(searchContent).toContain("limit=42");
    expect(searchContent).toContain("completed=true");
    // Should be appended after the path
    expect(searchContent).toContain("/todos?");
  });

  it("CRUD sequence uses dynamic path param name from schema", async () => {
    const customParamSchema: ClipSchema = {
      ...SAMPLE_SCHEMA,
      endpoints: [
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
              todoId: "string",
              title: "string",
            },
          },
        },
        {
          name: "get",
          method: "GET",
          path: "/todos/:todoId",
          description: "Get a todo by ID",
          params: {
            path: {
              todoId: { type: "string", required: true },
            },
          },
        },
        {
          name: "update",
          method: "PATCH",
          path: "/todos/:todoId",
          description: "Update a todo",
          params: {
            path: {
              todoId: { type: "string", required: true },
            },
            body: {
              title: { type: "string" },
            },
          },
        },
        {
          name: "delete",
          method: "DELETE",
          path: "/todos/:todoId",
          description: "Delete a todo",
          params: {
            path: {
              todoId: { type: "string", required: true },
            },
          },
        },
      ],
    };

    const outputDir = join(tempDir, "custom-param-test");
    await generateTests(customParamSchema, outputDir);

    const crudContent = await readFile(
      join(outputDir, "tests/crud-sequence.test.ts"),
      "utf-8",
    );

    // Should use created.todoId, not created.id
    expect(crudContent).toContain("created.todoId");
    expect(crudContent).not.toContain("created.id");
    // Path should be substituted with the dynamic param
    expect(crudContent).not.toContain(":todoId");
  });

  it("CRUD sequence includes query params in URL for resource endpoints", async () => {
    const crudWithQuerySchema: ClipSchema = {
      ...SAMPLE_SCHEMA,
      endpoints: [
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
            query: {
              fields: { type: "string" },
              verbose: { type: "boolean" },
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
            query: {
              force: { type: "boolean" },
            },
          },
        },
      ],
    };

    const outputDir = join(tempDir, "crud-query-params-test");
    await generateTests(crudWithQuerySchema, outputDir);

    const crudContent = await readFile(
      join(outputDir, "tests/crud-sequence.test.ts"),
      "utf-8",
    );

    // GET step should include query params
    expect(crudContent).toContain("fields=test-fields");
    expect(crudContent).toContain("verbose=true");
    // DELETE step should include query params
    expect(crudContent).toContain("force=true");
    // Update has no query params — its URL should not have a query string
    const updateBlock = crudContent
      .split("// Update")[1]
      ?.split("// Delete")[0];
    expect(updateBlock).toBeDefined();
    expect(updateBlock).not.toContain("?");
  });

  it("CRUD sequence includes query params in create step URL", async () => {
    const createWithQuerySchema: ClipSchema = {
      ...SAMPLE_SCHEMA,
      endpoints: [
        {
          name: "create",
          method: "POST",
          path: "/todos",
          description: "Create a new todo",
          params: {
            query: {
              tenant: { type: "string", required: true },
            },
            body: {
              title: { type: "string", required: true },
            },
          },
          response: {
            type: "object",
            properties: {
              id: "string",
              title: "string",
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

    const outputDir = join(tempDir, "crud-create-query-params-test");
    await generateTests(createWithQuerySchema, outputDir);

    const crudContent = await readFile(
      join(outputDir, "tests/crud-sequence.test.ts"),
      "utf-8",
    );

    // Create step should include query params in URL
    const createBlock = crudContent.split("// Create")[1]?.split("// Get")[0];
    expect(createBlock).toBeDefined();
    expect(createBlock).toContain("?");
    expect(createBlock).toContain("tenant=test-tenant");
    // Full URL should be /todos?tenant=test-tenant
    expect(crudContent).toContain("/todos?tenant=test-tenant");
  });

  it("does not generate CRUD test when no create endpoint exists", async () => {
    const noCrudSchema: ClipSchema = {
      ...SAMPLE_SCHEMA,
      endpoints: [
        {
          name: "list",
          method: "GET",
          path: "/todos",
          description: "List all todos",
        },
      ],
    };

    const outputDir = join(tempDir, "no-crud-test");
    await generateTests(noCrudSchema, outputDir);

    const { Glob } = await import("bun");
    const glob = new Glob("tests/*.test.ts");
    const testFiles: string[] = [];
    for await (const file of glob.scan({ cwd: outputDir })) {
      testFiles.push(file);
    }

    expect(testFiles).toContain("tests/list.test.ts");
    expect(testFiles).not.toContain("tests/crud-sequence.test.ts");
  });
});

describe("generateTests — OAuth schemas", () => {
  const OAUTH_SCHEMA: ClipSchema = {
    name: "OAuth API",
    alias: "oapi",
    version: "1.0.0",
    baseUrl: "https://api.example.com",
    auth: {
      type: "oauth",
      tokenParam: "api_key",
      loginPath: "/api/auth/cli",
      headerName: "Authorization",
      headerPrefix: "Bearer",
    },
    endpoints: [
      {
        name: "list",
        method: "GET",
        path: "/items",
        description: "List items",
      },
      {
        name: "create",
        method: "POST",
        path: "/items",
        description: "Create item",
        params: { body: { name: { type: "string", required: true } } },
      },
      {
        name: "get",
        method: "GET",
        path: "/items/:id",
        description: "Get item",
        params: { path: { id: { type: "string", required: true } } },
      },
      {
        name: "delete",
        method: "DELETE",
        path: "/items/:id",
        description: "Delete item",
        params: { path: { id: { type: "string", required: true } } },
      },
    ],
  };

  it("wraps API_KEY with the OAuth header prefix in standalone tests", async () => {
    const outputDir = join(tempDir, "oauth-standalone");
    await generateTests(OAUTH_SCHEMA, outputDir);

    const listContent = await readFile(
      join(outputDir, "tests/list.test.ts"),
      "utf-8",
    );

    // The header value is templated with the configured prefix
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal expected substring in generated source
    expect(listContent).toContain('"Authorization": `Bearer ${API_KEY}`');
    // The bare 'API_KEY' should not be used as the auth value verbatim
    expect(listContent).not.toMatch(/"Authorization":\s*API_KEY\b/);
  });

  it("wraps API_KEY with the OAuth header prefix in CRUD sequence tests", async () => {
    const outputDir = join(tempDir, "oauth-crud");
    await generateTests(OAUTH_SCHEMA, outputDir);

    const crudContent = await readFile(
      join(outputDir, "tests/crud-sequence.test.ts"),
      "utf-8",
    );

    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal expected substring in generated source
    expect(crudContent).toContain('"Authorization": `Bearer ${API_KEY}`');
    // Every step uses the prefixed header — no bare API_KEY as header value
    expect(crudContent).not.toMatch(/"Authorization":\s*API_KEY\b/);
  });

  it("emits a tests/README.md for OAuth schemas", async () => {
    const outputDir = join(tempDir, "oauth-readme");
    await generateTests(OAUTH_SCHEMA, outputDir);

    const readme = await readFile(join(outputDir, "tests/README.md"), "utf-8");

    expect(readme).toContain("OAuth");
    expect(readme).toContain("bunx oapi login");
    expect(readme).toContain("CLIP_TEST_API_KEY");
    expect(readme).toContain("Authorization: Bearer <token>");
  });

  it("does not emit a README.md for header-auth schemas", async () => {
    const outputDir = join(tempDir, "header-no-readme");
    await generateTests(SAMPLE_SCHEMA, outputDir);

    const { Glob } = await import("bun");
    const glob = new Glob("tests/*");
    const files: string[] = [];
    for await (const file of glob.scan({ cwd: outputDir })) {
      files.push(file);
    }

    expect(files).not.toContain("tests/README.md");
  });

  it("uses bare API_KEY when headerPrefix is empty", async () => {
    const noPrefixSchema: ClipSchema = {
      ...OAUTH_SCHEMA,
      auth: {
        type: "oauth",
        tokenParam: "api_key",
        loginPath: "/api/auth/cli",
        headerName: "X-Token",
        headerPrefix: "",
      },
    };

    const outputDir = join(tempDir, "oauth-no-prefix");
    await generateTests(noPrefixSchema, outputDir);

    const listContent = await readFile(
      join(outputDir, "tests/list.test.ts"),
      "utf-8",
    );

    expect(listContent).toContain('"X-Token": API_KEY');
  });
});
