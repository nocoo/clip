# 02 — CLI Codegen

## 1. Overview

The code generation engine is the core of clip. It takes a validated `ClipSchema` AST and produces a complete, runnable TypeScript CLI project. The generated CLI is self-contained — it can be linked globally via `bun link` and used as a standalone command-line tool.

## 2. Generated CLI Structure

For a schema with `alias: todo`, the generator produces:

```
.clip-output/todo/
├── src/
│   ├── index.ts          # Entry point — command router
│   ├── commands/          # One file per endpoint
│   │   ├── list.ts
│   │   ├── create.ts
│   │   ├── get.ts
│   │   ├── update.ts
│   │   └── delete.ts
│   ├── client.ts          # HTTP client with auth injection
│   └── config.ts          # Reads $CLIP_HOME/<alias>/credentials.json
├── package.json           # Generated package manifest
└── tsconfig.json          # TypeScript config for generated code
```

## 3. Code Generation Pipeline

### Module: `packages/cli/src/codegen/generator.ts`

```
ClipSchema AST
      │
      ▼
┌─────────────┐
│  generator   │
│  .generate() │
├─────────────┤
│ 1. Create output dir (.clip-output/<alias>/)
│ 2. Generate package.json
│ 3. Generate tsconfig.json
│ 4. Generate src/config.ts (credential reader)
│ 5. Generate src/client.ts (HTTP client)
│ 6. For each endpoint:
│    └── Generate src/commands/<name>.ts
│ 7. Generate src/index.ts (command router)
└─────────────┘
```

### Key Design: Template Rendering

Templates use tagged template literals (zero external dependencies):

```typescript
// packages/cli/src/codegen/templates/command.ts.tpl.ts

export function renderCommand(endpoint: Endpoint, schema: ClipSchema): string {
  const pathParams = extractPathParams(endpoint.path);
  const queryParams = Object.keys(endpoint.params?.query || {});
  const bodyParams = Object.keys(endpoint.params?.body || {});

  return `
import { client } from "../client";

export async function ${endpoint.name}Command(args: Record<string, string>) {
  ${pathParams.map(p => `const ${p} = args["${p}"];`).join("\n  ")}
  ${queryParams.map(p => `const ${p} = args["${p}"];`).join("\n  ")}

  const path = "${endpoint.path}"${pathParams.map(p => `.replace(":${p}", ${p})`).join("")};

  const response = await client.request({
    method: "${endpoint.method}",
    path,
    ${queryParams.length > 0 ? `query: { ${queryParams.join(", ")} },` : ""}
    ${bodyParams.length > 0 ? `body: { ${bodyParams.map(p => `${p}: args["${p}"]`).join(", ")} },` : ""}
  });

  console.log(JSON.stringify(response, null, 2));
}
`;
}
```

## 4. Generated File Details

### `src/index.ts` — Entry Point

The entry point parses CLI arguments and routes to the correct command handler.

```typescript
// Generated src/index.ts
#!/usr/bin/env bun
import { program } from "commander";
import { listCommand } from "./commands/list";
import { createCommand } from "./commands/create";
// ... one import per endpoint

program
  .name("todo")
  .version("1.0.0")
  .description("Todo API");

program
  .command("list")
  .description("List all todos")
  .action(async () => {
    await listCommand({});
  });

program
  .command("create")
  .description("Create a new todo")
  .requiredOption("--title <title>", "title (required)")
  .action(async (opts) => {
    await createCommand(opts);
  });

// ... one command block per endpoint

program.parse();
```

**Generator logic** for `index.ts`:
- Import all command modules
- Register each endpoint as a Commander subcommand
- Map `params.path` → positional arguments
- Map `params.query` + `params.body` → `--flag` options
- Mark `required: true` params as `requiredOption`

### `src/client.ts` — HTTP Client

```typescript
// Generated src/client.ts
import { loadConfig } from "./config";

interface RequestOptions {
  method: string;
  path: string;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
}

export const client = {
  async request(options: RequestOptions) {
    const config = await loadConfig();
    const baseUrl = process.env.CLIP_BASE_URL || "${baseUrl}";
    const url = new URL(options.path, baseUrl);

    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined) url.searchParams.set(key, value);
      }
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    headers[config.headerName] = config.headerValue;

    const response = await fetch(url.toString(), {
      method: options.method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    return response.json();
  },
};
```

### `src/config.ts` — Credential Reader

```typescript
// Generated src/config.ts
import { readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

interface Credentials {
  headerName: string;
  headerValue: string;
}

export async function loadConfig(): Promise<Credentials> {
  const clipHome = process.env.CLIP_HOME ?? join(homedir(), ".clip");
  const credPath = join(clipHome, "${alias}", "credentials.json");
  try {
    const raw = await readFile(credPath, "utf-8");
    return JSON.parse(raw) as Credentials;
  } catch {
    console.error("No credentials found. Run: clip auth set ${alias}");
    process.exit(1);
  }
}
```

### `src/commands/<name>.ts` — Command Handlers

Each command file follows the same pattern:

1. Parse arguments from Commander options
2. Build the request path (substitute path params)
3. Call `client.request()` with method, path, query, body
4. Print the JSON response to stdout

## 5. clip CLI Commands

### `clip generate`

**Module**: `packages/cli/src/commands/generate.ts`

```
clip generate [--schema <path>] [--output <dir>]
```

1. Resolve schema path (default: `./clip.yaml`)
2. Parse and validate schema via `parseClipSchema()`
3. Create output directory (default: `.clip-output/<alias>/`)
4. Run code generation pipeline
5. Print success message with output path

### `clip install`

**Module**: `packages/cli/src/commands/install.ts`

```
clip install [--schema <path>]
```

1. Run `clip generate` internally
2. Run `bun link` in the output directory to make the CLI globally available
3. Print success message: `✓ Installed "${alias}" command globally`

## 6. Files to Create/Modify

| File Path | Action | Purpose |
|-----------|--------|---------|
| `packages/cli/src/codegen/generator.ts` | Create | Main code generation orchestrator |
| `packages/cli/src/codegen/templates/index.ts.tpl.ts` | Create | Template for generated entry point |
| `packages/cli/src/codegen/templates/command.ts.tpl.ts` | Create | Template for generated command files |
| `packages/cli/src/codegen/templates/client.ts.tpl.ts` | Create | Template for generated HTTP client |
| `packages/cli/src/codegen/templates/config.ts.tpl.ts` | Create | Template for generated config reader |
| `packages/cli/src/codegen/templates/package-json.tpl.ts` | Create | Template for generated package.json |
| `packages/cli/src/codegen/templates/tsconfig.tpl.ts` | Create | Template for generated tsconfig.json |
| `packages/cli/src/commands/generate.ts` | Create | `clip generate` command implementation |
| `packages/cli/src/commands/install.ts` | Create | `clip install` command implementation |
| `packages/cli/package.json` | Modify | Add `commander` dependency |

## 7. Test Strategy

### Unit Tests — `packages/cli/tests/unit/codegen/`

**`generator.test.ts`**:
- ✅ Generates correct directory structure for a valid schema
- ✅ Generates one command file per endpoint
- ✅ Generated index.ts imports all commands
- ✅ Generated client.ts uses correct baseUrl
- ✅ Generated config.ts reads correct alias path
- ✅ Path params are correctly substituted in command templates
- ✅ Required params generate `requiredOption` in Commander
- ✅ Optional params generate `option` in Commander
- ✅ Body params are sent as JSON in POST/PATCH/PUT commands
- ✅ Query params are appended to URL in GET commands

**`templates.test.ts`**:
- ✅ Each template function returns valid TypeScript
- ✅ Templates handle edge cases (no params, no response schema)

### Atomic Commit Plan

1. `feat(codegen): add template rendering functions for generated CLI`
2. `feat(codegen): implement code generation orchestrator`
3. `feat(codegen): generate package.json and tsconfig.json for output`
4. `feat(cli): implement clip generate command`
5. `feat(cli): implement clip install command with bun link`
6. `test(codegen): add unit tests for template rendering`
7. `test(codegen): add unit tests for generation orchestrator`
8. `test(cli): add unit tests for generate command`
