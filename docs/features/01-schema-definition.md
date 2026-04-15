# 01 — Schema Definition

## 1. Overview

The `clip.yaml` file is the single source of truth for a clip project. It defines the target API's endpoints, authentication method, and response shapes. The clip CLI reads this file, validates it, and uses it to generate a working CLI tool and test suite.

## 2. Schema Format Specification

### Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Human-readable project name (e.g. `"Todo API"`) |
| `alias` | `string` | Yes | Short identifier used for CLI name and file paths. Must match `/^[a-z][a-z0-9-]*$/` |
| `version` | `string` | Yes | Semver version string (e.g. `"1.0.0"`) |
| `baseUrl` | `string` | Yes | Base URL for all API requests (e.g. `"http://localhost:3000"`) |
| `auth` | `AuthConfig` | Yes | Authentication configuration |
| `endpoints` | `Endpoint[]` | Yes | Array of API endpoint definitions (minimum 1) |

### AuthConfig

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"header"` | Yes | Authentication type. Currently only `header` is supported |
| `headerName` | `string` | Yes | HTTP header name (e.g. `"X-API-Key"`, `"Authorization"`) |

### Endpoint

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Unique command name. Must match `/^[a-z][a-z0-9-]*$/` |
| `method` | `string` | Yes | HTTP method: `GET`, `POST`, `PUT`, `PATCH`, `DELETE` |
| `path` | `string` | Yes | URL path, supports `:param` placeholders (e.g. `/todos/:id`) |
| `description` | `string` | Yes | Human-readable description shown in CLI help |
| `params` | `ParamsConfig` | No | Parameter definitions for path, query, and body |
| `response` | `ResponseSchema` | No | Expected response shape for validation |

### ParamsConfig

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | `Record<string, ParamDef>` | No | Path parameters (must match `:param` in `path`) |
| `query` | `Record<string, ParamDef>` | No | Query string parameters |
| `body` | `Record<string, ParamDef>` | No | Request body fields (sent as JSON) |

### ParamDef

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"string" \| "number" \| "boolean"` | Yes | Parameter type |
| `required` | `boolean` | No | Whether the parameter is required (default: `false`) |
| `description` | `string` | No | Parameter description for CLI help |

### ResponseSchema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"object" \| "array" \| "string" \| "number" \| "boolean"` | Yes | Response type |
| `properties` | `Record<string, PropertyDef>` | Conditional | Required when `type` is `"object"` |
| `items` | `ResponseSchema` | Conditional | Required when `type` is `"array"` |

### PropertyDef

A shorthand type reference: `string`, `number`, or `boolean`. Can also be a full `ResponseSchema` for nested objects/arrays.

## 3. Example Schema

```yaml
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
      items: { type: object, properties: { id: string, title: string, completed: boolean } }
  - name: create
    method: POST
    path: /todos
    description: "Create a new todo"
    params:
      body:
        title: { type: string, required: true }
    response:
      type: object
      properties: { id: string, title: string, completed: boolean }
  - name: get
    method: GET
    path: "/todos/:id"
    description: "Get a todo by ID"
    params:
      path:
        id: { type: string, required: true }
    response:
      type: object
      properties: { id: string, title: string, completed: boolean }
  - name: update
    method: PATCH
    path: "/todos/:id"
    description: "Update a todo"
    params:
      path:
        id: { type: string, required: true }
      body:
        title: { type: string }
        completed: { type: boolean }
    response:
      type: object
      properties: { id: string, title: string, completed: boolean }
  - name: delete
    method: DELETE
    path: "/todos/:id"
    description: "Delete a todo"
    params:
      path:
        id: { type: string, required: true }
```

## 4. Zod Validation Schema

### Module: `packages/cli/src/schema/validator.ts`

The Zod schema mirrors the format specification above with additional semantic validation.

```typescript
import { z } from "zod";

const aliasPattern = /^[a-z][a-z0-9-]*$/;
const endpointNamePattern = /^[a-z][a-z0-9-]*$/;
const httpMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

const ParamDefSchema = z.object({
  type: z.enum(["string", "number", "boolean"]),
  required: z.boolean().optional(),
  description: z.string().optional(),
});

const PropertyDefSchema: z.ZodType<PropertyDef> = z.lazy(() =>
  z.union([
    z.enum(["string", "number", "boolean"]),
    ResponseSchemaZod,
  ])
);

const ResponseSchemaZod: z.ZodType<ResponseSchema> = z.lazy(() =>
  z.object({
    type: z.enum(["object", "array", "string", "number", "boolean"]),
    properties: z.record(PropertyDefSchema).optional(),
    items: ResponseSchemaZod.optional(),
  })
);

const EndpointSchema = z.object({
  name: z.string().regex(endpointNamePattern),
  method: z.enum(httpMethods),
  path: z.string().startsWith("/"),
  description: z.string(),
  params: z.object({
    path: z.record(ParamDefSchema).optional(),
    query: z.record(ParamDefSchema).optional(),
    body: z.record(ParamDefSchema).optional(),
  }).optional(),
  response: ResponseSchemaZod.optional(),
});

export const ClipSchemaZod = z.object({
  name: z.string().min(1),
  alias: z.string().regex(aliasPattern),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  baseUrl: z.string().url(),
  auth: z.object({
    type: z.literal("header"),
    headerName: z.string().min(1),
  }),
  endpoints: z.array(EndpointSchema).min(1),
});

export type ClipSchema = z.infer<typeof ClipSchemaZod>;
```

### Semantic Validation (post-Zod)

After Zod structural validation passes, perform these additional checks in `validator.ts`:

1. **Unique endpoint names** — No two endpoints share the same `name`
2. **Path param consistency** — Every `:param` in `path` has a matching key in `params.path`
3. **No orphan path params** — Every key in `params.path` exists as `:key` in the `path` string
4. **Unique method+path combos** — No two endpoints share the same `method` + `path`

```typescript
// packages/cli/src/schema/validator.ts

export function validateSemantics(schema: ClipSchema): ValidationError[] {
  const errors: ValidationError[] = [];

  // 1. Unique endpoint names
  const names = new Set<string>();
  for (const ep of schema.endpoints) {
    if (names.has(ep.name)) {
      errors.push({ path: `endpoints.${ep.name}`, message: `Duplicate endpoint name: ${ep.name}` });
    }
    names.add(ep.name);
  }

  // 2-3. Path param consistency
  for (const ep of schema.endpoints) {
    const pathParams = (ep.path.match(/:([a-zA-Z0-9_]+)/g) || []).map(p => p.slice(1));
    const declaredParams = Object.keys(ep.params?.path || {});

    for (const p of pathParams) {
      if (!declaredParams.includes(p)) {
        errors.push({ path: `endpoints.${ep.name}.path`, message: `Path param :${p} not declared in params.path` });
      }
    }
    for (const p of declaredParams) {
      if (!pathParams.includes(p)) {
        errors.push({ path: `endpoints.${ep.name}.params.path.${p}`, message: `Declared param ${p} not found in path` });
      }
    }
  }

  // 4. Unique method+path
  const methodPaths = new Set<string>();
  for (const ep of schema.endpoints) {
    const key = `${ep.method} ${ep.path}`;
    if (methodPaths.has(key)) {
      errors.push({ path: `endpoints.${ep.name}`, message: `Duplicate method+path: ${key}` });
    }
    methodPaths.add(key);
  }

  return errors;
}
```

## 5. YAML Parser

### Module: `packages/cli/src/schema/parser.ts`

```typescript
import { readFile } from "fs/promises";
import { parse as parseYaml } from "yaml";
import { ClipSchemaZod } from "./validator";

export async function parseClipSchema(filePath: string): Promise<ClipSchema> {
  const raw = await readFile(filePath, "utf-8");
  const parsed = parseYaml(raw);
  const validated = ClipSchemaZod.parse(parsed);
  const semanticErrors = validateSemantics(validated);

  if (semanticErrors.length > 0) {
    throw new ClipSchemaError(semanticErrors);
  }

  return validated;
}
```

**Error handling strategy**:
- YAML syntax errors → caught by `yaml` package, re-thrown with file path context
- Zod validation errors → `ZodError` with detailed field paths and messages
- Semantic errors → custom `ClipSchemaError` aggregating all issues

### Module: `packages/cli/src/schema/types.ts`

Re-exports the inferred TypeScript types from the Zod schemas:

```typescript
import type { z } from "zod";
import type { ClipSchemaZod, EndpointSchema, ParamDefSchema } from "./validator";

export type ClipSchema = z.infer<typeof ClipSchemaZod>;
export type Endpoint = z.infer<typeof EndpointSchema>;
export type ParamDef = z.infer<typeof ParamDefSchema>;

export interface ValidationError {
  path: string;
  message: string;
}
```

## 6. Files to Create/Modify

| File Path | Action | Purpose |
|-----------|--------|---------|
| `packages/cli/src/schema/parser.ts` | Create | YAML file reader + parser |
| `packages/cli/src/schema/validator.ts` | Create | Zod schema + semantic validation |
| `packages/cli/src/schema/types.ts` | Create | TypeScript type exports |
| `packages/cli/package.json` | Modify | Add `yaml` and `zod` dependencies |
| `packages/cli/tests/unit/schema/parser.test.ts` | Create | Unit tests for parser |
| `packages/cli/tests/unit/schema/validator.test.ts` | Create | Unit tests for Zod schema + semantic checks |

## 7. Test Strategy

### Unit Tests — `packages/cli/tests/unit/schema/`

**`parser.test.ts`**:
- ✅ Parses valid clip.yaml into ClipSchema
- ✅ Throws on invalid YAML syntax
- ✅ Throws on missing required fields
- ✅ Throws on invalid field types

**`validator.test.ts`**:
- ✅ Validates a correct schema
- ✅ Rejects invalid alias format (uppercase, spaces)
- ✅ Rejects invalid endpoint names
- ✅ Rejects unsupported HTTP methods
- ✅ Rejects duplicate endpoint names
- ✅ Rejects path params not declared in params.path
- ✅ Rejects orphan declared params not in path
- ✅ Rejects duplicate method+path combinations
- ✅ Validates nested response schemas (array of objects)

### Atomic Commit Plan

1. `feat(schema): add Zod validation schema and TypeScript types`
2. `feat(schema): implement YAML parser with error reporting`
3. `feat(schema): add semantic validation (unique names, path param consistency)`
4. `test(schema): add unit tests for Zod schema validation`
5. `test(schema): add unit tests for YAML parser`
6. `test(schema): add unit tests for semantic validation`
