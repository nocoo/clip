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
- Supporting every OpenAPI feature — see Section 5 for what is dropped
- Multi-document specs split across files beyond what the resolver handles transparently

### Default emit policy

The adapter writes a `clip.yaml` to the output directory **by default**. This avoids three follow-on problems:

1. `clip auth set <alias>` reads the local `clip.yaml` to infer the auth shape (header name, cf-access headers). Without an emitted yaml, users would be forced to pass `--header` / `--client-id` / `--client-secret` for every auth command.
2. The emitted yaml is the artifact users hand-edit when adapter mapping is lossy (Section 5).
3. It gives version control a checked-in record of what the OpenAPI spec resolved to.

`--no-emit-yaml` is provided as an escape hatch for ad-hoc one-shot generation. Users opting out accept that `clip auth set` will require explicit `--header` flags — this trade-off is documented in `--help` output.

## 2. CLI Surface

### New flags on `clip generate`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--from <path>` | string | No | Path to an OpenAPI 3.x document (`.json` or `.yaml`). When set, `clip.yaml` and the positional `[path]` / `--schema` are not read for schema input. |
| `--alias <alias>` | string | Yes (with `--from`) | Required whenever `--from` is used. Must match `/^[a-z][a-z0-9-]*$/`. OpenAPI has no notion of an alias, so the adapter cannot derive one. |
| `--base-url <url>` | string | No | Overrides `servers[0].url` from the spec. Required when the spec has no `servers` entry. |
| `--no-emit-yaml` | boolean | No | Skip writing `clip.yaml` (default emits). |
| `--emit-yaml-path <path>` | string | No | Override the output path for the emitted yaml (defaults to `<output>/clip.yaml`). |

### Precedence and conflicts

The existing `generate` command already accepts a positional `[path]` and a `--schema <path>` flag (`packages/cli/src/index.ts:15`). The interaction with the new `--from` is:

1. **`--from` is exclusive with `[path]` and `--schema`.** Passing both is a hard error: `clip generate clip.yaml --from openapi.json` exits non-zero with `error: --from is mutually exclusive with [path] and --schema`. We refuse to silently pick one.
2. If `--from` is set, no `clip.yaml` is read from the working directory regardless of presence.
3. If `--from` is omitted, current behavior is preserved.

The adapter runs before validation; the resulting `ClipSchema` is then passed through `validateSemantics` for the same guarantees as a hand-written schema.

## 3. Architecture

```
openapi.json (3.0 or 3.1)
        │
        ▼
┌──────────────────────────┐
│ swagger-parser           │  validate + dereference $refs
│ .dereference()           │
└──────────┬───────────────┘
           │  OpenAPIV3.Document | OpenAPIV3_1.Document
           ▼
┌──────────────────────────┐
│ openapi-normalizer       │  collapse 3.1 differences (type arrays,
│                          │  exclusiveMinimum-as-number, etc.) into
│                          │  a single internal NormalizedDocument
└──────────┬───────────────┘
           │  NormalizedDocument
           ▼
┌──────────────────────────┐
│ openapi-to-clip adapter  │  pure function, no I/O
│ packages/cli/src/schema/ │
│   openapi-adapter.ts     │
└──────────┬───────────────┘
           │  ClipSchema  (+ optional yaml emission)
           ▼
┌──────────────────────────┐
│ existing pipeline        │
│  - validateSemantics()   │
│  - codegen               │
│  - test generation       │
└──────────────────────────┘
```

### New module: `packages/cli/src/schema/openapi-loader.ts`

Wraps `@apidevtools/swagger-parser` for I/O + dereference. Returns the raw 3.0 or 3.1 typed document so the normalizer can branch on version.

```typescript
import type { OpenAPIV3, OpenAPIV3_1 } from "openapi-types";

export type AnyOpenApiDocument = OpenAPIV3.Document | OpenAPIV3_1.Document;

export async function loadOpenApiDocument(path: string): Promise<{
  doc: AnyOpenApiDocument;
  version: "3.0" | "3.1";
}>;
```

### New module: `packages/cli/src/schema/openapi-normalizer.ts`

Collapses 3.0 and 3.1 differences into a single internal shape used by the adapter:

- `nullable: true` (3.0) and `type: ["string", "null"]` (3.1) both → `{ type: "string", nullable: true }`
- `exclusiveMinimum`/`exclusiveMaximum` numbers (3.1) vs booleans (3.0) → drop (clip has no constraint surface)
- `examples` keyword variants → drop

```typescript
export interface NormalizedDocument {
  // identical shape to OpenAPIV3.Document but with all 3.1-only constructs
  // either rewritten to 3.0-equivalent or stripped.
}

export function normalize(input: AnyOpenApiDocument, version: "3.0" | "3.1"): NormalizedDocument;
```

### New module: `packages/cli/src/schema/openapi-adapter.ts`

```typescript
import type { ClipSchema } from "./types";
import type { NormalizedDocument } from "./openapi-normalizer";
import type { AdapterWarning } from "./openapi-warnings";

export interface OpenApiAdapterOptions {
  alias: string;                  // required
  baseUrlOverride?: string;       // overrides servers[0].url
  defaultResponseStatus?: string; // default "200", falls back to first 2xx
}

export interface OpenApiAdapterResult {
  schema: ClipSchema;
  warnings: AdapterWarning[];
}

export function openapiToClipSchema(
  doc: NormalizedDocument,
  opts: OpenApiAdapterOptions,
): OpenApiAdapterResult;
```

Pure (no fs, no network). Returns warnings alongside the schema so the CLI layer decides how to surface them.

## 4. Mapping Rules

### 4.1 Top-level fields

| ClipSchema field | OpenAPI source | Notes |
|------------------|----------------|-------|
| `name` | `info.title` | Trimmed; required by OpenAPI spec so always present |
| `version` | `info.version` | If not semver, normalized to `0.0.0` with a warning |
| `alias` | `opts.alias` (CLI flag) | Not derivable from OpenAPI; user must supply via `--alias` |
| `baseUrl` | `opts.baseUrlOverride` ?? `servers[0].url` | Hard error if neither is set; multi-server specs use `servers[0]` only with a warning |
| `auth` | `components.securitySchemes` (see 4.4) | Picks the first scheme that maps cleanly |
| `endpoints` | `paths` × `method` (see 4.2) | Flattened into an array |

### 4.2 Endpoints

For each `(path, method)` pair where method is `get|post|put|patch|delete`:

| Endpoint field | OpenAPI source |
|----------------|----------------|
| `name` | `slugify(operation.operationId)` if present, else `deriveName(method, path)` (see 4.3) |
| `method` | The HTTP method, uppercased |
| `path` | OpenAPI path with `{id}` rewritten to `:id`. Path parameter names (between braces) are also slugified — see 4.7 |
| `description` | `operation.summary` ?? `operation.description` ?? `"<METHOD> <path>"` |
| `params.path` | **Path-Item-level `parameters`** merged with **operation-level `parameters`** filtered to `in === "path"`. Operation-level entries override path-item entries with the same `name`. |
| `params.query` | Same merge rule, filtered to `in === "query"` |
| `params.body` | `operation.requestBody.content["application/json"].schema.properties` (object schemas only — see 4.5 for non-object body handling) |
| `response` | `operation.responses[status].content["application/json"].schema` for first 2xx status (see 4.6) |

OpenAPI specifies that path-item-level parameters apply to every operation under that path unless an operation-level parameter with the same `name` + `in` overrides them. The adapter performs this merge before slicing into `path/query/header/cookie`. Without this, common specs like `paths: { "/users/{id}": { parameters: [{ name: id, in: path, required: true }], get: {...}, delete: {...} } }` would fail Clip's "every `:param` must be declared" semantic check.

`head`, `options`, `trace` operations are skipped with a warning.

### 4.3 Endpoint name derivation and normalization

Clip enforces `/^[a-z][a-z0-9-]*$/` on endpoint names (`packages/cli/src/schema/validator.ts:5`). OpenAPI `operationId` has no such constraint — `getUser`, `users.get`, `Users_get`, `用户_获取` are all valid.

Algorithm `slugify(name)`:

1. Lowercase
2. Replace any run of non-`[a-z0-9]` characters with a single `-`
3. Trim leading and trailing `-`
4. If the result is empty or starts with a digit, prefix `op-`
5. If the result differs from the input, emit a warning recording `(originalOperationId, slug)` so the user can correlate

If `operationId` is missing, fall back to `deriveName(method, path)`:

1. Strip leading `/`
2. Replace `{param}` segments with `by-<slugify(param)>`
3. Replace `/` with `-`
4. Prepend a verb based on method: `GET → list` (collection) or `get` (item — i.e., last path segment is a `{param}`), `POST → create`, `PUT → replace`, `PATCH → update`, `DELETE → delete`
5. Run through `slugify` to collapse any residue

Examples:
- `GET /users` → `list-users`
- `GET /users/{id}` → `get-users-by-id`
- `POST /users/{id}/posts` → `create-users-by-id-posts`
- `DELETE /users/{id}` → `delete-users-by-id`
- `operationId: getUserById` → `getuserbyid` (warning emitted)
- `operationId: users.list` → `users-list` (warning emitted)

**Collision handling**: after slugify + derive, if a name collides with another endpoint's name, append `-2`, `-3`, ... and emit a warning recommending the user add or fix `operationId` in the spec.

### 4.4 Auth mapping

The adapter scans `components.securitySchemes` in the order they appear and picks the first scheme it can map. All others are dropped with a warning.

| OpenAPI scheme | ClipSchema `auth` |
|----------------|-------------------|
| `type: apiKey, in: header, name: X` | `{ type: "header", headerName: "X" }` |
| `type: http, scheme: bearer` | `{ type: "header", headerName: "Authorization" }` **plus** an emitted note that the user must store the credential value as `Bearer <token>` (see below) |
| `type: oauth2`, flow `authorizationCode` | `{ type: "oauth", ... }` using clip's existing oauth shape (default `headerPrefix: "Bearer"`) |
| `type: apiKey, in: query` | Skipped (clip has no query-auth surface today) |
| `type: apiKey, in: cookie` | Skipped |
| `type: http, scheme: basic` | Skipped |
| `type: openIdConnect` | Skipped |
| `type: mutualTLS` | Skipped |

**Bearer caveat**: Clip's runtime header auth (`packages/cli/src/codegen/templates.ts:193-198`) writes the stored credential value verbatim into the header. It does **not** prefix `Bearer ` — that prefix capability exists only on the `oauth` auth shape (`headerPrefix`, `validator.ts:91`). Three options were considered for v1:

- **(A) Map bearer → existing `header` auth, document the `Bearer ` prefix requirement.** The emitted yaml `auth.headerName: Authorization` makes the storage shape obvious; the CLI prints a one-time hint after generation telling the user to run `clip auth set <alias>` and supply the value as `Bearer <token>`. **Chosen for v1.**
- (B) Add an optional `headerPrefix` field to `header` auth and prefix at runtime. Cleaner for users but expands the auth surface and requires a migration of `header` credentials. Tracked as a follow-up.
- (C) Introduce a new `bearer` auth variant. Symmetric with (B) in cost; rejected because (B) generalizes better.

**Hard failure**: if the spec has at least one `securitySchemes` entry but **none** map cleanly, the adapter raises a hard error: `error: no supported security scheme in <path>; supported: apiKey-header, http-bearer, oauth2-authorizationCode`. We do **not** fall back to a placeholder — silently producing a CLI with broken auth is worse than failing fast.

If the spec has **zero** `securitySchemes`, that is itself an error: `auth` is required by `ClipSchema`. The user must either fix the spec or add auth manually after generation.

cf-access (the discriminated-union variant added recently) is intentionally **not** auto-detected from OpenAPI. Users add it post-generation with `clip auth set --client-id ... --client-secret ...`. Documented in the emitted CLI's `--help`.

### 4.5 Type mapping for **request parameters** (path / query / body)

Clip's `ParamDef` (`validator.ts:10`) supports: `string | number | boolean | array`, with `enum`, `nullable`, `required`, `description`, and `items` (for arrays). It does **not** support nested objects.

| JSON Schema | ParamDef |
|-------------|----------|
| `string` | `string` (drops `format`, `pattern`) |
| `integer`, `number` | `number` |
| `boolean` | `boolean` |
| `array` | `array` with `items` recursed by these same rules |
| `object` (path/query) | Skipped with a warning — no such API in the wild for path/query, but rejected explicitly to avoid silent loss |
| `object` (body, top-level) | Flattened: each property becomes a `params.body` entry |
| `object` (body, nested inside another object) | Property collapses to `string` with a warning that the user passes a JSON string at the CLI |
| `enum` (any primitive type) | Set as `enum: [...]` |
| `nullable: true` (post-normalize) | `nullable: true` |
| `oneOf` / `anyOf` / `allOf` | First branch only, with a warning |

Required-ness:
- For path/query: `parameter.required === true`
- For body: parent object schema's `required: [...]` array

Bodies that are not `application/json` object schemas (e.g. an array body, a top-level string body) are dropped with a warning recommending the user hand-edit the emitted yaml.

### 4.6 Type mapping for **responses**

Clip's `ResponseSchema` (`validator.ts:21`) is structurally different from `ParamDef` — it supports `object` (with `properties`), `array` (with `items`), and the three primitives, but it does **not** carry `enum`, `nullable`, `required`, or `description`. Section 4.5's rules **do not** apply directly.

| JSON Schema | ResponseSchema |
|-------------|----------------|
| `string` / `number` / `integer` / `boolean` | The matching primitive variant; `integer` collapses to `number` |
| `array` | `{ type: "array", items: <recurse> }` |
| `object` | `{ type: "object", properties: { k: <PropertyDef> } }` where each value is one of `"string"`, `"number"`, `"boolean"` (the `PropertyDef` shorthand) or a nested `ResponseSchema` |
| `nullable` / `required` properties | Information dropped; warning emitted if `nullable: true` is present (since clip cannot represent it in responses) |
| `enum` | Type collapses to the underlying primitive; `enum` value list dropped with a warning |
| `oneOf` / `anyOf` / `allOf` | First branch only, with a warning |

For the first 2xx response with `content["application/json"]`:
- Apply the rules above
- Non-JSON content types are dropped with a warning
- Missing 2xx response → omit `response` field (allowed by `ClipSchema`)

Until `ResponseSchema` is enriched with optional `nullable` / `enum` / `required` (out of scope for v1), the warnings here are the user's signal that the generated CLI's response handling is best-effort.

### 4.7 Parameter name normalization

OpenAPI parameter names (`name` field on a `parameter` object, property keys on body schemas) can contain characters that are not valid JavaScript identifiers — e.g. `user-id`, `X-Trace-Id`, `filter[active]`. Codegen emits these names directly into JS identifiers and `args.<name>` accesses (`packages/cli/src/codegen/templates.ts:215, 218, 222, 229, 235`), so an unsanitized `user-id` would produce broken TypeScript.

Strategy:

1. Run each parameter name through `slugify` (4.3 algorithm).
2. If the slug differs from the original, the adapter records a `sourceName → slug` mapping in an internal table.
3. The slug is what lands in `ClipSchema`. The source name is preserved by emitting `description: "Source: <originalName>"` so users have an audit trail in the emitted yaml.
4. **Wire-format preservation is a known v1 gap**: codegen currently uses the param key as the wire name (query string key, JSON body key, path placeholder). After slugification, the wire name diverges from what the API expects. Two fixes are possible:
   - (a) Extend `ParamDef` with an optional `sourceName` field that codegen prefers for the wire when present. Small change to `templates.ts`.
   - (b) Reject specs with non-identifier parameter names and require manual yaml editing.
   - **Chosen for v1: (a).** Emit a warning and add `sourceName` to the emitted yaml; if `sourceName` is absent from existing schemas the codegen falls back to the key as today (no behavior change for hand-written yaml).
5. If slugification produces a collision within the same parameter group (e.g. two query params `user-id` and `user_id` both slug to `user-id`), raise a hard error referencing both source names.

This is a `ParamDef` extension; it is the only schema change introduced by this feature and is fully backward-compatible.

## 5. What Is Dropped (with warnings)

Each of the following emits a single-line warning to stderr referencing the offending location:

1. Header and cookie parameters (`in: header` / `in: cookie`) — clip has no surface for them yet
2. Content types other than `application/json` (multipart, form-urlencoded, octet-stream)
3. Non-2xx response bodies
4. `oneOf` / `anyOf` / `allOf` past the first branch
5. `format` modifiers (`date-time`, `uuid`, `email`) — type collapses to `string`
6. Multiple `servers` entries past index 0
7. Multiple `securitySchemes` past the first supported one
8. Webhooks, callbacks, links, examples — entirely ignored
9. Response `enum` / `nullable` / `required` (response schema lossiness, see 4.6)

Warnings are aggregated and printed once at the end of `clip generate` so the user sees the full lossiness of the conversion. Hard errors (Section 4.4 unsupported-only auth, Section 4.7 slug collisions, missing `baseUrl`) abort generation before any files are written.

## 6. Files to Create / Modify

| File Path | Action | Purpose |
|-----------|--------|---------|
| `packages/cli/src/schema/openapi-loader.ts` | Create | I/O + `$ref` dereference via swagger-parser; returns versioned doc |
| `packages/cli/src/schema/openapi-normalizer.ts` | Create | Collapse 3.0/3.1 differences into a single internal shape |
| `packages/cli/src/schema/openapi-adapter.ts` | Create | Pure mapping `NormalizedDocument → ClipSchema + warnings` |
| `packages/cli/src/schema/openapi-warnings.ts` | Create | `AdapterWarning` type + collector helper |
| `packages/cli/src/schema/openapi-slugify.ts` | Create | Shared slugify + collision-resolution utility (used for endpoint names + param names) |
| `packages/cli/src/schema/validator.ts` | Modify | Add optional `sourceName?: string` to `ParamDef` Zod + TS shape |
| `packages/cli/src/codegen/templates.ts` | Modify | Use `sourceName` for query/body/path wire names when present; identifier still uses key |
| `packages/cli/src/commands/generate.ts` | Modify | Wire `--from` / `--alias` / `--base-url` / `--no-emit-yaml` / `--emit-yaml-path`; reject conflicts with `[path]` / `--schema` |
| `packages/cli/src/index.ts` | Modify | Register the new flags on `generate` |
| `packages/cli/package.json` | Modify | Add `@apidevtools/swagger-parser`, `openapi-types` |
| `packages/cli/tests/unit/schema/openapi-slugify.test.ts` | Create | Unit tests for slugify + collision rules |
| `packages/cli/tests/unit/schema/openapi-normalizer.test.ts` | Create | 3.0 ↔ 3.1 normalization tests |
| `packages/cli/tests/unit/schema/openapi-adapter.test.ts` | Create | Unit tests against fixture specs |
| `packages/cli/tests/integration/openapi-generate.test.ts` | Create | End-to-end: spec → generate → tsc passes |
| `packages/cli/tests/fixtures/openapi/petstore-3.0.json` | Create | Standard fixture |
| `packages/cli/tests/fixtures/openapi/petstore-3.1.json` | Create | 3.1 fixture (`type: ["string", "null"]`) |
| `packages/cli/tests/fixtures/openapi/no-operation-ids.json` | Create | Exercises `deriveName` |
| `packages/cli/tests/fixtures/openapi/path-item-parameters.json` | Create | Exercises path-item parameter merge (Issue #2 of review) |
| `packages/cli/tests/fixtures/openapi/non-identifier-names.json` | Create | Exercises slugify + `sourceName` (Issue #8 of review) |
| `packages/cli/tests/fixtures/openapi/bearer-auth.json` | Create | Exercises bearer mapping + `Bearer ` storage hint (Issue #3 of review) |
| `docs/features/07-openapi-input.md` | Update | This document |
| `docs/features/README.md` | Already updated | Row 07 |

## 7. Test Strategy

### Unit — `openapi-slugify.test.ts`

- ✅ `getUser` → `getuser` with warning recording original
- ✅ `users.list` → `users-list`
- ✅ `Users_get` → `users-get`
- ✅ `用户_获取` → `op-` prefix fallback when no `[a-z0-9]` survives
- ✅ Empty / digit-leading inputs get `op-` prefix
- ✅ Collision resolution: `["userId", "user-id", "user_id"]` → `user-id`, `user-id-2`, `user-id-3` with warnings

### Unit — `openapi-normalizer.test.ts`

- ✅ 3.1 `type: ["string", "null"]` → `{ type: "string", nullable: true }`
- ✅ 3.0 `nullable: true` preserved
- ✅ 3.1 `exclusiveMinimum: 0` (number) handled without crash
- ✅ Round-trip stability: normalizing an already-3.0 doc is the identity

### Unit — `openapi-adapter.test.ts`

- ✅ Maps a minimal 3.0 spec with one `GET` endpoint
- ✅ Honors `operationId` after slugify
- ✅ Falls back to `deriveName` when `operationId` is missing
- ✅ Resolves derived-name collisions with a numeric suffix + warning
- ✅ Rewrites `{id}` to `:id`
- ✅ Merges path-item-level `parameters` with operation-level, with operation-level overriding (Issue #2)
- ✅ Maps `apiKey` (header) auth
- ✅ Maps `http bearer` auth to `Authorization` header and emits the `Bearer ` storage hint warning (Issue #3)
- ✅ Hard-fails when the spec has security schemes but none map (Issue #5)
- ✅ Hard-fails when the spec has zero security schemes
- ✅ Maps `enum` and `nullable` parameter constraints
- ✅ Drops `enum` / `nullable` on response schemas with a warning (Issue #6)
- ✅ Drops non-JSON content types with a warning
- ✅ Emits a warning for `oneOf` / `anyOf` / `allOf`
- ✅ Falls back to first 2xx response when `200` is absent
- ✅ Errors when no `servers` entry and no `--base-url` override
- ✅ Slugifies non-identifier parameter names and records `sourceName` (Issue #8)
- ✅ Hard-fails on intra-group parameter slug collisions

### Integration — `openapi-generate.test.ts`

- ✅ `clip generate --from petstore-3.0.json --alias petstore` produces a project that `tsc --noEmit` passes
- ✅ Same for `petstore-3.1.json`
- ✅ Generated CLI's `--help` lists all derived commands
- ✅ Default emit writes `clip.yaml` to the output directory and re-parses cleanly via existing `parseClipSchema`
- ✅ Re-parsing the emitted YAML produces a `ClipSchema` deep-equal to the in-memory adapter output (round-trip stability)
- ✅ `--no-emit-yaml` skips file emission
- ✅ Missing `--alias` exits with a clear error
- ✅ `clip generate clip.yaml --from openapi.json` exits with a clear conflict error (Issue #10)
- ✅ `clip generate --from openapi.json --schema clip.yaml --alias x` exits with a clear conflict error
- ✅ After generation with bearer auth fixture, `clip auth set <alias>` reads the emitted yaml and prompts for the value with the documented `Bearer ` hint (Issues #3, #4)

### Atomic Commit Plan

1. `feat(schema): add openapi-types + swagger-parser dependencies`
2. `feat(schema): add slugify utility with collision resolution`
3. `feat(schema): add ParamDef.sourceName for wire-name preservation`
4. `feat(codegen): use ParamDef.sourceName in generated wire calls when present`
5. `feat(schema): implement openapi-loader with $ref dereferencing`
6. `feat(schema): implement openapi-normalizer for 3.0 ↔ 3.1 differences`
7. `feat(schema): implement openapi-adapter mapping (paths, params, response)`
8. `feat(schema): merge path-item-level parameters into operation parameters`
9. `feat(schema): map OpenAPI security schemes to ClipSchema auth (hard-fail on unmappable)`
10. `feat(schema): derive endpoint names when operationId is missing`
11. `feat(schema): aggregate and report adapter warnings`
12. `feat(commands): wire --from / --alias / --base-url / --no-emit-yaml on generate (with conflict checks)`
13. `feat(commands): default-emit clip.yaml so auth set keeps working`
14. `test(schema): unit tests for slugify, normalizer, adapter`
15. `test(integration): end-to-end generate from petstore + bearer + path-item-params + non-identifier-names fixtures`
16. `docs(features): add 07-openapi-input`

## 8. Open Questions

1. **`headerPrefix` on the `header` auth variant** — Option (B) from Section 4.4. If we add it, bearer mapping becomes lossless and the documented `Bearer ` storage hint goes away. The cost is a small migration of existing `header` credentials and a new field on the discriminated union. Tracked as a follow-up; not blocking v1.
2. **Hono `@hono/zod-openapi` direct integration** — A thin `clip generate --from-hono ./src/app.ts` could import the app and call its `getOpenAPIDocument()`. Out of scope for v1 but a natural follow-up — the adapter is the prerequisite.
3. **Header / cookie parameters** — Adding `params.header` / `params.cookie` to `ClipSchema` unblocks a large class of real APIs but is a separate feature; tracked outside this doc.
4. **Response schema enrichment** — Adding optional `nullable` / `enum` / `required` to `ResponseSchema` would close most of Section 4.6's lossiness. Independent feature.
