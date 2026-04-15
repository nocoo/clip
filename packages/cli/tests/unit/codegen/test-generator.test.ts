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
