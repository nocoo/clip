# 04 — Test Generation

## 1. Overview

clip automatically generates a test suite alongside the CLI. Each API endpoint in the schema gets a corresponding test file that validates the endpoint is reachable, returns the correct status code, and the response body matches the declared schema shape.

## 2. Generated Test Structure

For `alias: todo`, the generated tests live alongside the generated CLI:

```
.clip-output/todo/
├── src/            # Generated CLI source
├── tests/
│   ├── list.test.ts
│   ├── create.test.ts
│   ├── get.test.ts
│   ├── update.test.ts
│   └── delete.test.ts
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
│ For each endpoint:    │
│ 1. Generate sample    │
│    request data       │
│ 2. Build test that:   │
│    a. Sends HTTP req  │
│    b. Checks status   │
│    c. Validates shape │
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
1. Resolve the generated test directory: `.clip-output/<alias>/tests/`
2. Verify tests exist (if not, suggest running `clip generate` first)
3. Load credentials from `~/.clip/<alias>/credentials.json` for the API key
4. Set environment variables:
   - `CLIP_TEST_BASE_URL` — from `--base-url` flag or schema's `baseUrl`
   - `CLIP_TEST_API_KEY` — from `--api-key` flag or stored credentials
5. Run `bun test` in the generated output directory
6. Report results

```typescript
// packages/cli/src/commands/test.ts
import { spawn } from "bun";
import { loadCredentials } from "../auth/storage";

export async function testCommand(alias: string, options: TestOptions) {
  const outputDir = resolve(`.clip-output/${alias}`);
  const testDir = join(outputDir, "tests");

  // Check tests exist
  if (!existsSync(testDir)) {
    console.error(`No tests found. Run "clip generate" first.`);
    process.exit(1);
  }

  // Load credentials
  const creds = await loadCredentials(alias);

  const env = {
    ...process.env,
    CLIP_TEST_BASE_URL: options.baseUrl || schema.baseUrl,
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
| `CLIP_TEST_BASE_URL` | `--base-url` flag | Schema `baseUrl` |
| `CLIP_TEST_API_KEY` | `--api-key` flag | `~/.clip/<alias>/credentials.json` |

### Generated `package.json` Test Script

```jsonc
{
  "scripts": {
    "test": "bun test"
  }
}
```

## 7. Test Ordering

Some endpoints have natural dependencies (e.g., `create` before `get`, `get` before `delete`). The test generator handles this by:

1. **Independent tests** — Each test is self-contained and creates its own test data
2. **No shared state** — Tests do not depend on each other's side effects
3. **CRUD sequence test** — An optional integration-style test that runs create → get → update → delete in sequence

The CRUD sequence test is generated as `tests/_crud-sequence.test.ts`:

```typescript
// Generated tests/_crud-sequence.test.ts
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
| `packages/cli/tests/unit/codegen/test-generator.test.ts` | Create | Unit tests for test generation |

## 9. Test Strategy

### Unit Tests — `packages/cli/tests/unit/codegen/`

**`test-generator.test.ts`**:
- ✅ Generates one test file per endpoint
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
