import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { parseClipSchema } from "../../../src/schema/parser";
import { ClipSchemaError } from "../../../src/schema/types";

// --- Helpers ---

let tempDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "clip-parser-test-"));
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function writeYaml(name: string, content: string): Promise<string> {
  const filePath = join(tempDir, name);
  await writeFile(filePath, content, "utf-8");
  return filePath;
}

const VALID_YAML = `
name: "Todo API"
alias: todo
version: "1.0.0"
baseUrl: "http://localhost:3000"
auth:
  type: header
  headerName: "X-API-Key"
endpoints:
  - name: list
    method: GET
    path: /todos
    description: "List all todos"
    response:
      type: array
      items:
        type: object
        properties:
          id: string
          title: string
          completed: boolean
  - name: create
    method: POST
    path: /todos
    description: "Create a new todo"
    params:
      body:
        title: { type: string, required: true }
    response:
      type: object
      properties:
        id: string
        title: string
        completed: boolean
  - name: get
    method: GET
    path: "/todos/:id"
    description: "Get a todo by ID"
    params:
      path:
        id: { type: string, required: true }
    response:
      type: object
      properties:
        id: string
        title: string
        completed: boolean
`;

describe("parseClipSchema", () => {
  it("parses a valid clip.yaml into ClipSchema", async () => {
    const filePath = await writeYaml("valid.yaml", VALID_YAML);
    const schema = await parseClipSchema(filePath);

    expect(schema.name).toBe("Todo API");
    expect(schema.alias).toBe("todo");
    expect(schema.version).toBe("1.0.0");
    expect(schema.baseUrl).toBe("http://localhost:3000");
    expect(schema.auth.type).toBe("header");
    expect(schema.auth.headerName).toBe("X-API-Key");
    expect(schema.endpoints).toHaveLength(3);
    expect(schema.endpoints[0].name).toBe("list");
    expect(schema.endpoints[1].name).toBe("create");
    expect(schema.endpoints[2].name).toBe("get");
  });

  it("throws on non-existent file", async () => {
    const filePath = join(tempDir, "nonexistent.yaml");
    await expect(parseClipSchema(filePath)).rejects.toThrow(
      /Failed to read schema file/,
    );
  });

  it("throws on invalid YAML syntax", async () => {
    const filePath = await writeYaml(
      "bad-yaml.yaml",
      "name: [unclosed bracket\n  alias: test",
    );
    await expect(parseClipSchema(filePath)).rejects.toThrow(/Invalid YAML/);
  });

  it("throws ZodError on missing required fields", async () => {
    const filePath = await writeYaml(
      "missing-fields.yaml",
      `
name: "Test"
alias: test
`,
    );
    await expect(parseClipSchema(filePath)).rejects.toThrow(ZodError);
  });

  it("throws ZodError on invalid field types", async () => {
    const filePath = await writeYaml(
      "bad-types.yaml",
      `
name: "Test"
alias: test
version: "1.0.0"
baseUrl: "http://localhost:3000"
auth:
  type: header
  headerName: "Key"
endpoints:
  - name: 123
    method: GET
    path: /test
    description: "test"
`,
    );
    await expect(parseClipSchema(filePath)).rejects.toThrow(ZodError);
  });

  it("throws ClipSchemaError on semantic errors (duplicate names)", async () => {
    const filePath = await writeYaml(
      "dup-names.yaml",
      `
name: "Test API"
alias: test
version: "1.0.0"
baseUrl: "http://localhost:3000"
auth:
  type: header
  headerName: "Key"
endpoints:
  - name: list
    method: GET
    path: /a
    description: "A"
  - name: list
    method: POST
    path: /b
    description: "B"
`,
    );
    await expect(parseClipSchema(filePath)).rejects.toThrow(ClipSchemaError);
  });

  it("throws ClipSchemaError on undeclared path params", async () => {
    const filePath = await writeYaml(
      "undeclared-param.yaml",
      `
name: "Test API"
alias: test
version: "1.0.0"
baseUrl: "http://localhost:3000"
auth:
  type: header
  headerName: "Key"
endpoints:
  - name: get
    method: GET
    path: "/items/:id"
    description: "Get item"
`,
    );
    await expect(parseClipSchema(filePath)).rejects.toThrow(ClipSchemaError);
  });

  it("ClipSchemaError contains meaningful error messages", async () => {
    const filePath = await writeYaml(
      "error-messages.yaml",
      `
name: "Test API"
alias: test
version: "1.0.0"
baseUrl: "http://localhost:3000"
auth:
  type: header
  headerName: "Key"
endpoints:
  - name: get
    method: GET
    path: "/items/:id"
    description: "Get item"
    params:
      path:
        slug: { type: string, required: true }
`,
    );

    try {
      await parseClipSchema(filePath);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ClipSchemaError);
      const schemaErr = err as ClipSchemaError;
      expect(schemaErr.errors.length).toBeGreaterThanOrEqual(2);
      // Should report both undeclared :id and orphan slug
      const messages = schemaErr.errors.map((e) => e.message).join("; ");
      expect(messages).toContain(":id not declared");
      expect(messages).toContain("slug not found in path");
    }
  });

  it("parses schema with enum and nullable params", async () => {
    const filePath = await writeYaml(
      "enum-nullable.yaml",
      `
name: "Test API"
alias: test
version: "1.0.0"
baseUrl: "http://localhost:3000"
auth:
  type: header
  headerName: "Key"
endpoints:
  - name: search
    method: GET
    path: /search
    description: "Search"
    params:
      query:
        status: { type: string, enum: [active, done] }
        tag: { type: string, nullable: true }
`,
    );
    const schema = await parseClipSchema(filePath);
    const queryParams = schema.endpoints[0].params?.query;
    expect(queryParams?.status.enum).toEqual(["active", "done"]);
    expect(queryParams?.tag.nullable).toBe(true);
  });

  it("parses schema with array params", async () => {
    const filePath = await writeYaml(
      "array-param.yaml",
      `
name: "Test API"
alias: test
version: "1.0.0"
baseUrl: "http://localhost:3000"
auth:
  type: header
  headerName: "Key"
endpoints:
  - name: batch
    method: POST
    path: /batch
    description: "Batch"
    params:
      body:
        ids: { type: array, items: { type: string } }
`,
    );
    const schema = await parseClipSchema(filePath);
    const body = schema.endpoints[0].params?.body;
    expect(body?.ids.type).toBe("array");
    expect(body?.ids.items?.type).toBe("string");
  });
});
