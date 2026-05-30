# 07 — OpenAPI Input

## 1. Overview

Today users must hand-author `clip.yaml` even when the target API already exposes its contract via Zod, Hono, or another framework. This is a derived-artifact-as-source-of-truth violation: route changes drift between the API definition and `clip.yaml` with no tooling to detect divergence.

This feature introduces an **OpenAPI 3.x adapter** so users can run:

```bash
clip generate --from openapi.json --alias bogo
```

The adapter converts an OpenAPI spec into the in-memory `ClipSchema` AST that the existing codegen pipeline already consumes, eliminating the need for a hand-written `clip.yaml` when an OpenAPI document is available.

### Goals

- Accept OpenAPI 3.0.x and 3.1.0, in JSON or YAML
- Produce a valid `ClipSchema` that passes existing Zod + semantic validation
- Reuse the existing codegen and test-generation pipelines unchanged
- Resolve `$ref` references before mapping (downstream code sees inlined schemas only)

### Non-Goals (v1)

- Swagger 2.0 input (users can convert with `swagger2openapi` first)
- Round-tripping OpenAPI → clip.yaml → OpenAPI
- Emitting `clip.yaml` to disk by default (in-memory only; file emit behind a flag)
- Supporting every OpenAPI feature — see Section 5 for what is dropped
- Multi-document specs split across files beyond what the resolver handles transparently

## 2. CLI Surface

### New flag on `clip generate`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--from <path>` | string | No | Path to an OpenAPI 3.x document (`.json` or `.yaml`). When set, `clip.yaml` is not read. |
| `--alias <alias>` | string | Conditional | Required when `--from` is used and the spec does not encode an alias (see Section 4.1). Must match `/^[a-z][a-z0-9-]*$/`. |
| `--base-url <url>` | string | No | Overrides `servers[0].url` from the spec. Required when the spec has no `servers` entry. |
| `--emit-yaml <path>` | string | No | Also write the converted `ClipSchema` to a YAML file for inspection or version control. |

### Behavior

- If `--from` is omitted, current behavior is preserved (read `clip.yaml`).
- If both `--from` and a `clip.yaml` exist in the working directory, `--from` wins and a warning is printed.
- The adapter runs before validation; the resulting `ClipSchema` is then passed through `validateSemantics` for the same guarantees as a hand-written schema.

## 3. Architecture

```
openapi.json
     │
     ▼
┌──────────────────────────┐
│ swagger-parser           │  validate + dereference $refs
│ .dereference()           │
└──────────┬───────────────┘
           │  OpenAPIV3.Document (no $ref)
           ▼
┌──────────────────────────┐
│ openapi-to-clip adapter  │  pure function, no I/O
│ packages/cli/src/schema/ │
│   openapi-adapter.ts     │
└──────────┬───────────────┘
           │  ClipSchema
           ▼
┌──────────────────────────┐
│ existing pipeline        │
│  - validateSemantics()   │
│  - codegen               │
│  - test generation       │
└──────────────────────────┘
```

### New module: `packages/cli/src/schema/openapi-adapter.ts`

```typescript
import type { OpenAPIV3 } from "openapi-types";
import type { ClipSchema, Endpoint, ParamDef, AuthConfig } from "./types";

export interface OpenApiAdapterOptions {
  alias: string;                // required at the call site
  baseUrlOverride?: string;     // overrides servers[0].url
  defaultResponseStatus?: string; // default "200", falls back to first 2xx
}

export function openapiToClipSchema(
  doc: OpenAPIV3.Document,
  opts: OpenApiAdapterOptions,
): ClipSchema;
```

The function is pure (no fs, no network) so it is trivial to unit-test against fixture specs.

### New module: `packages/cli/src/schema/openapi-loader.ts`

Wraps `@apidevtools/swagger-parser` for I/O + dereference, returning `OpenAPIV3.Document`. Separate from the adapter so the adapter stays I/O-free and unit-testable.

```typescript
export async function loadOpenApiDocument(path: string): Promise<OpenAPIV3.Document>;
```

## 4. Mapping Rules

### 4.1 Top-level fields

| ClipSchema field | OpenAPI source | Notes |
|------------------|----------------|-------|
| `name` | `info.title` | Trimmed; required by OpenAPI spec so always present |
| `version` | `info.version` | If not semver, normalized to `0.0.0` with a warning |
| `alias` | `opts.alias` (CLI flag) | Not derivable from OpenAPI; user must supply |
| `baseUrl` | `opts.baseUrlOverride` ?? `servers[0].url` | Error if neither is set; multi-server specs use `servers[0]` only |
| `auth` | `components.securitySchemes` (see 4.4) | Picks the first scheme that maps cleanly |
| `endpoints` | `paths` × `method` (see 4.2) | Flattened into an array |

### 4.2 Endpoints

For each `(path, method)` pair where method is `get|post|put|patch|delete`:

| Endpoint field | OpenAPI source |
|----------------|----------------|
| `name` | `operation.operationId` if present, else `deriveName(method, path)` (see 4.3) |
| `method` | The HTTP method, uppercased |
| `path` | OpenAPI path with `{id}` rewritten to `:id` |
| `description` | `operation.summary` ?? `operation.description` ?? `"<METHOD> <path>"` |
| `params.path` | `operation.parameters` where `in === "path"` |
| `params.query` | `operation.parameters` where `in === "query"` |
| `params.body` | `operation.requestBody.content["application/json"].schema.properties` (object schemas only) |
| `response` | `operation.responses[status].content["application/json"].schema` for first 2xx status |

Other HTTP methods (`head`, `options`, `trace`) are skipped with a warning.

### 4.3 Name derivation (when `operationId` is missing)

Algorithm `deriveName(method, path)`:

1. Strip leading `/`.
2. Replace `{param}` segments with `by-<param>`.
3. Replace `/` with `-`.
4. Prepend a verb based on method: `GET → list` (collection) or `get` (item), `POST → create`, `PUT → replace`, `PATCH → update`, `DELETE → delete`.
5. Lowercase + collapse runs of `-`.

Examples:
- `GET /users` → `list-users`
- `GET /users/{id}` → `get-user-by-id`
- `POST /users/{id}/posts` → `create-user-by-id-posts`
- `DELETE /users/{id}` → `delete-user-by-id`

If the derived name collides with another endpoint, append `-<n>` and emit a warning recommending the user add `operationId` to the spec.

### 4.4 Auth mapping

Pick the first `securitySchemes` entry whose mapping is supported. Drop the rest with a warning.

| OpenAPI scheme | ClipSchema `auth` |
|----------------|-------------------|
| `type: apiKey, in: header, name: X` | `{ type: "header", headerName: "X" }` |
| `type: http, scheme: bearer` | `{ type: "header", headerName: "Authorization" }` (token is prefixed `Bearer ` at runtime — existing auth storage handles this) |
| `type: oauth2` | `{ type: "oauth", ... }` if clip's oauth path supports the flow; else skip |
| `type: apiKey, in: query` | Skipped (not modeled in clip today) |
| `type: http, scheme: basic` | Skipped |

If no scheme is supported, fall back to a placeholder header auth and emit a clear error directing the user to add auth manually post-conversion.

cf-access (the recently-added discriminated-union variant) is not auto-detected from OpenAPI — users add it with `clip auth set --client-id ... --client-secret ...` after generation.

### 4.5 Type mapping (JSON Schema → ParamDef)

| JSON Schema | ClipSchema `ParamDef.type` |
|-------------|----------------------------|
| `string` | `string` (drops `format`, `pattern`) |
| `integer`, `number` | `number` |
| `boolean` | `boolean` |
| `array` | `array` (with `items` recursed) |
| `object` (in body) | Flattened to `params.body` keys; nested objects emit a warning + are typed as `string` (json-string) |
| `enum` (any primitive) | Set as `enum: [...]` on the `ParamDef` |
| `nullable: true` (3.0) / `type: ["string", "null"]` (3.1) | `nullable: true` |
| `oneOf` / `anyOf` / `allOf` | First branch only, with a warning |

Required-ness:
- For path/query: `parameter.required === true`
- For body: parent object schema's `required: [...]` array

### 4.6 Response mapping

For the first 2xx response with `content["application/json"]`:
- Map `schema` to `ResponseSchema` with the same JSON Schema rules as 4.5
- Non-JSON content types are dropped with a warning
- Missing 2xx response → omit `response` field (allowed by ClipSchema)

## 5. What Is Dropped (with warnings)

Each of the following emits a single-line warning to stderr referencing the offending location:

1. Headers and cookies parameters (`in: header` / `in: cookie`) — clip has no surface for them yet
2. Content types other than `application/json` (multipart, form-urlencoded, octet-stream)
3. Non-2xx response bodies
4. `oneOf` / `anyOf` / `allOf` past the first branch
5. `format` modifiers (`date-time`, `uuid`, `email`) — type collapses to `string`
6. Multiple `servers` entries past index 0
7. Multiple `securitySchemes` past the first supported one
8. Webhooks, callbacks, links, examples — entirely ignored

Warnings are aggregated and printed once at the end of `clip generate` so the user sees the full lossiness of the conversion.

## 6. Files to Create / Modify

| File Path | Action | Purpose |
|-----------|--------|---------|
| `packages/cli/src/schema/openapi-loader.ts` | Create | I/O + `$ref` dereference via swagger-parser |
| `packages/cli/src/schema/openapi-adapter.ts` | Create | Pure mapping `OpenAPIV3.Document → ClipSchema` |
| `packages/cli/src/schema/openapi-warnings.ts` | Create | Warning collector used by adapter |
| `packages/cli/src/commands/generate.ts` | Modify | Wire `--from` / `--alias` / `--base-url` / `--emit-yaml` flags |
| `packages/cli/package.json` | Modify | Add `@apidevtools/swagger-parser`, `openapi-types` |
| `packages/cli/tests/unit/schema/openapi-adapter.test.ts` | Create | Unit tests against fixture specs |
| `packages/cli/tests/integration/openapi-generate.test.ts` | Create | End-to-end: spec → generate → tsc passes |
| `packages/cli/tests/fixtures/openapi/petstore-3.0.json` | Create | Standard fixture |
| `packages/cli/tests/fixtures/openapi/petstore-3.1.json` | Create | 3.1 fixture (nullable, no `nullable` keyword) |
| `packages/cli/tests/fixtures/openapi/no-operation-ids.json` | Create | Exercises `deriveName` |
| `docs/features/07-openapi-input.md` | Create | This document |
| `docs/features/README.md` | Modify | Add row 07 |

## 7. Test Strategy

### Unit — `openapi-adapter.test.ts`

- ✅ Maps a minimal 3.0 spec with one `GET` endpoint
- ✅ Maps a minimal 3.1 spec (nullable via `type: ["string", "null"]`)
- ✅ Honors `operationId` when present
- ✅ `deriveName` produces expected names for collection / item / nested paths
- ✅ Resolves collisions in derived names with a numeric suffix + warning
- ✅ Rewrites `{id}` to `:id`
- ✅ Maps `apiKey` (header) auth
- ✅ Maps `http bearer` auth to `Authorization` header
- ✅ Skips unsupported auth schemes with a warning
- ✅ Maps `enum` and `nullable` parameter constraints
- ✅ Drops non-JSON content types with a warning
- ✅ Emits a warning for `oneOf` / `anyOf` / `allOf`
- ✅ Falls back to first 2xx response when `200` is absent
- ✅ Errors when no `servers` entry and no `--base-url` override

### Integration — `openapi-generate.test.ts`

- ✅ `clip generate --from petstore-3.0.json --alias petstore` produces a project that `tsc --noEmit` passes
- ✅ Generated CLI's `--help` lists all derived commands
- ✅ `--emit-yaml out.yaml` writes a file that re-parses cleanly via existing `parseClipSchema`
- ✅ Re-parsing the emitted YAML produces a `ClipSchema` deep-equal to the in-memory adapter output (round-trip stability)
- ✅ Missing `--alias` exits with a clear error

### Atomic Commit Plan

1. `feat(schema): add openapi-types + swagger-parser dependencies`
2. `feat(schema): implement openapi-loader with $ref dereferencing`
3. `feat(schema): implement openapi-adapter mapping (paths, params, response)`
4. `feat(schema): map OpenAPI security schemes to ClipSchema auth`
5. `feat(schema): derive endpoint names when operationId is missing`
6. `feat(schema): aggregate and report adapter warnings`
7. `feat(commands): wire --from / --alias / --base-url / --emit-yaml on generate`
8. `test(schema): unit tests for openapi-adapter`
9. `test(integration): end-to-end generate from petstore spec`
10. `docs(features): add 07-openapi-input`

## 8. Open Questions

1. **Should `--emit-yaml` be on by default?** Pro: gives users a checked-in artifact and an escape hatch to hand-edit. Con: encourages drift between spec and yaml. **Proposal**: off by default, recommend in docs as a one-time bootstrap aid.
2. **Hono `@hono/zod-openapi` direct integration?** A thin `clip generate --from-hono ./src/app.ts` could import the app and call its `getOpenAPIDocument()`. Out of scope for v1 but a natural follow-up — the adapter is the prerequisite.
3. **Header / cookie parameters** — adding `params.header` / `params.cookie` to ClipSchema unblocks a large class of real APIs but is a separate feature; tracked outside this doc.
