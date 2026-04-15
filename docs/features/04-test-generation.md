# 04 — Test Generation

## 1. Overview

clip automatically generates a test suite alongside the CLI. Independent endpoints (e.g., `list`, `create`) each get their own test file. Resource-dependent endpoints (get, update, delete) are covered by a single CRUD-sequence test that runs create → get → update → delete in order against a real resource.

## 2. Generated Test Structure

For `alias: todo`, the generated tests live alongside the generated CLI:

```
.clip-output/todo/
├── src/            # Generated CLI source
├── tests/
│   ├── list.test.ts
│   ├── create.test.ts
│   └── crud-sequence.test.ts
└── package.json    # Includes test script
```

## 3. Test Generation Pipeline

### Module: `packages/cli/src/codegen/test-generator.ts`

```
ClipSchema AST
      │
      ▼
┌──────────────────────┐
│  test-generator       │
│  .generateTests()     │
├──────────────────────┤
│ For each independent  │
│ endpoint:             │
│ 1. Generate sample    │
│    request data       │
│ 2. Build test that:   │
│    a. Sends HTTP req  │
│    b. Checks 2xx      │
│    c. Validates shape │
│                       │
│ For resource-dependent│
│ endpoints (get,       │
│ update, delete):      │
│ → Generate CRUD-      │
│   sequence test       │
└──────────────────────┘
```

### Sample Data Generation

The test generator creates deterministic sample data based on parameter types:

| Param Type | Sample Value |
|-----------|-------------|
| `string` | `"test-<paramName>"` |
| `number` | `42` |
| `boolean` | `true` |

```typescript
// packages/cli/src/codegen/test-generator.ts

function sampleValue(paramName: string, type: string): string {
  switch (type) {
    case "string": return `"test-${paramName}"`;
    case "number": return "42";
    case "boolean": return "true";
    default: return `"test-${paramName}"`;
  }
}
```

### Response Shape Validation

Generated tests validate that the response body matches the declared `response` schema:

```typescript
function generateShapeValidator(schema: ResponseSchema, varName: string): string {
  switch (schema.type) {
    case "array":
      return `
  expect(Array.isArray(${varName})).toBe(true);
  if (${varName}.length > 0) {
    ${schema.items ? generateShapeValidator(schema.items, `${varName}[0]`) : ""}
  }`;
    case "object":
      return `
  expect(typeof ${varName}).toBe("object");
  ${Object.entries(schema.properties || {}).map(([key, propType]) => {
    const expectedType = typeof propType === "string" ? propType : "object";
    return `expect(typeof ${varName}.${key}).toBe("${expectedType}");`;
  }).join("\n  ")}`;
    default:
      return `expect(typeof ${varName}).toBe("${schema.type}");`;
  }
}
```

## 4. Generated Test Example

For the `create` endpoint:

```typescript
// Generated .clip-output/todo/tests/create.test.ts
import { describe, test, expect } from "bun:test";

const BASE_URL = process.env.CLIP_TEST_BASE_URL || "http://localhost:3000";
const API_KEY = process.env.CLIP_TEST_API_KEY || "";

describe("create", () => {
  test("POST /todos — Create a new todo", async () => {
    const response = await fetch(`${BASE_URL}/todos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      body: JSON.stringify({
        title: "test-title",
      }),
    });

    expect(response.ok).toBe(true);

    const body = await response.json();

    // Response shape validation
    expect(typeof body).toBe("object");
    expect(typeof body.id).toBe("string");
    expect(typeof body.title).toBe("string");
    expect(typeof body.completed).toBe("boolean");
  });
});
```

For the `list` endpoint:

```typescript
// Generated .clip-output/todo/tests/list.test.ts
import { describe, test, expect } from "bun:test";

const BASE_URL = process.env.CLIP_TEST_BASE_URL || "http://localhost:3000";
const API_KEY = process.env.CLIP_TEST_API_KEY || "";

describe("list", () => {
  test("GET /todos — List all todos", async () => {
    const response = await fetch(`${BASE_URL}/todos`, {
      method: "GET",
      headers: {
        "X-API-Key": API_KEY,
      },
    });

    expect(response.ok).toBe(true);

    const body = await response.json();

    // Response shape validation
    expect(Array.isArray(body)).toBe(true);
    if (body.length > 0) {
      expect(typeof body[0]).toBe("object");
      expect(typeof body[0].id).toBe("string");
      expect(typeof body[0].title).toBe("string");
      expect(typeof body[0].completed).toBe("boolean");
    }
  });
});
```

## 5. `clip test` Command

### Module: `packages/cli/src/commands/test.ts`

```
clip test <alias> [--base-url <url>] [--api-key <key>]
```

**Flow**:
1. Resolve the generated output directory: `.clip-output/<alias>/`
2. Load metadata from `.clip-output/<alias>/clip-metadata.json` (written during `clip generate`)
3. Verify tests exist (if not, suggest running `clip generate` first)
4. Load credentials via `loadCredentials(alias)` (resolves `$CLIP_HOME/<alias>/credentials.json`, where `CLIP_HOME` defaults to `~/.clip`)
5. Set environment variables:
   - `CLIP_TEST_BASE_URL` — from `--base-url` flag, or `CLIP_BASE_URL` env, or metadata's `baseUrl`
   - `CLIP_TEST_API_KEY` — from `--api-key` flag or stored credentials
6. Run `bun test` in the generated output directory
7. Report results

### Metadata File

During `clip generate`, a `clip-metadata.json` file is written to `.clip-output/<alias>/`:

```json
{
  "alias": "todo",
  "baseUrl": "http://localhost:3456",
  "auth": {
    "type": "header",
    "headerName": "X-API-Key"
  },
  "generatedAt": "2026-01-01T00:00:00.000Z"
}
```

This file allows `clip test` to resolve configuration without re-parsing the schema.

```typescript
// packages/cli/src/commands/test.ts
import { spawn } from "bun";
import { readFile } from "fs/promises";
import { loadCredentials } from "../auth/storage";

interface ClipMetadata {
  alias: string;
  baseUrl: string;
  auth: { type: string; headerName: string };
  generatedAt: string;
}

export async function testCommand(alias: string, options: TestOptions) {
  const outputDir = resolve(`.clip-output/${alias}`);
  const testDir = join(outputDir, "tests");

  // Check tests exist
  if (!existsSync(testDir)) {
    console.error(`No tests found. Run "clip generate" first.`);
    process.exit(1);
  }

  // Load metadata
  const metadataPath = join(outputDir, "clip-metadata.json");
  const metadata: ClipMetadata = JSON.parse(await readFile(metadataPath, "utf-8"));

  // Load credentials
  const creds = await loadCredentials(alias);

  const env = {
    ...process.env,
    CLIP_TEST_BASE_URL: options.baseUrl || process.env.CLIP_BASE_URL || metadata.baseUrl,
    CLIP_TEST_API_KEY: options.apiKey || creds?.headerValue || "",
  };

  const result = await spawn({
    cmd: ["bun", "test"],
    cwd: outputDir,
    env,
    stdout: "inherit",
    stderr: "inherit",
  });

  process.exit(result.exitCode);
}
```

## 6. Test Configuration

### Environment Variables

Generated tests read configuration from environment variables, making them flexible:

| Variable | Source | Fallback |
|----------|--------|----------|
| `CLIP_TEST_BASE_URL` | `--base-url` flag | `CLIP_BASE_URL` env → metadata `baseUrl` |
| `CLIP_TEST_API_KEY` | `--api-key` flag | `loadCredentials(alias)` → `$CLIP_HOME/<alias>/credentials.json` |

### Generated `package.json` Test Script

```jsonc
{
  "scripts": {
    "test": "bun test"
  }
}
```

## 7. Test Ordering

Resource-dependent endpoints (get, update, delete) require a previously created resource. The test generator handles this by making the **CRUD sequence test the primary test mode**:

1. **CRUD sequence test** (primary) — Runs create → get → update → delete in sequence using a real created resource. This is always generated when the schema contains endpoints for these operations.
2. **Independent endpoint tests** (optional) — Each test is self-contained with sample data. These are useful for endpoints that don't depend on prior state (e.g., `list`). For resource-dependent endpoints (get/update/delete), individual tests are **not generated** — use the CRUD sequence instead.

The CRUD sequence test is generated as `tests/crud-sequence.test.ts`:

```typescript
// Generated tests/crud-sequence.test.ts
describe("CRUD sequence", () => {
  let createdId: string;

  test("create → get → update → delete", async () => {
    // Create
    const createRes = await fetch(`${BASE_URL}/todos`, { method: "POST", ... });
    const created = await createRes.json();
    createdId = created.id;

    // Get
    const getRes = await fetch(`${BASE_URL}/todos/${createdId}`, { method: "GET", ... });
    expect(getRes.ok).toBe(true);

    // Update
    const updateRes = await fetch(`${BASE_URL}/todos/${createdId}`, { method: "PATCH", ... });
    expect(updateRes.ok).toBe(true);

    // Delete
    const deleteRes = await fetch(`${BASE_URL}/todos/${createdId}`, { method: "DELETE", ... });
    expect(deleteRes.ok).toBe(true);
  });
});
```

## 8. Files to Create/Modify

| File Path | Action | Purpose |
|-----------|--------|---------|
| `packages/cli/src/codegen/test-generator.ts` | Create | Test file generation from schema |
| `packages/cli/src/commands/test.ts` | Create | `clip test` command |
| `.clip-output/<alias>/clip-metadata.json` | Create (generated) | Metadata persisted during `clip generate` for use by `clip test` |
| `packages/cli/tests/unit/codegen/test-generator.test.ts` | Create | Unit tests for test generation |

## 9. Test Strategy

### Unit Tests — `packages/cli/tests/unit/codegen/`

**`test-generator.test.ts`**:
- ✅ Generates one test file per independent endpoint (list, create)
- ✅ Generates CRUD-sequence test for resource-dependent endpoints (get, update, delete)
- ✅ Generated tests use correct HTTP method
- ✅ Generated tests include auth header
- ✅ Response shape validation handles `object` type
- ✅ Response shape validation handles `array` type
- ✅ Response shape validation handles nested schemas
- ✅ Sample data generation uses correct types
- ✅ CRUD sequence test is generated when schema has create+get+update+delete
- ✅ Environment variable fallbacks work correctly

### Atomic Commit Plan

1. `feat(test-gen): implement sample data generation from param types`
2. `feat(test-gen): implement response shape validator generation`
3. `feat(test-gen): implement test file generation per endpoint`
4. `feat(test-gen): generate CRUD sequence integration test`
5. `feat(cli): implement clip test command`
6. `test(test-gen): add unit tests for test generation`
7. `test(cli): add unit tests for test command`
