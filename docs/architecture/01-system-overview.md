# 01 — System Overview

## 1. MonoRepo Structure

clip uses a **Bun workspace** MonoRepo with four packages:

```
clip/
├── packages/
│   ├── cli/              # @clip/cli — Core CLI tool
│   │   ├── src/
│   │   │   ├── index.ts              # Entry point, top-level command router
│   │   │   ├── commands/
│   │   │   │   ├── generate.ts       # clip generate — schema → CLI codegen
│   │   │   │   ├── install.ts        # clip install — generate + global link
│   │   │   │   ├── auth.ts           # clip auth set|login|show|remove
│   │   │   │   └── test.ts           # clip test <alias> — run generated tests
│   │   │   ├── schema/
│   │   │   │   ├── parser.ts         # YAML → raw object
│   │   │   │   ├── validator.ts      # Zod schema validation
│   │   │   │   └── types.ts          # TypeScript types derived from Zod schemas
│   │   │   ├── codegen/
│   │   │   │   ├── generator.ts      # AST → TypeScript source files
│   │   │   │   ├── templates.ts      # Template-literal templates (human-readable)
│   │   │   │   └── test-generator.ts # Schema → test file generation
│   │   │   └── auth/
│   │   │       └── storage.ts        # Read/write $CLIP_HOME/<alias>/credentials.json
│   │   ├── tests/
│   │   │   ├── unit/
│   │   │   │   ├── schema/
│   │   │   │   │   ├── parser.test.ts
│   │   │   │   │   └── validator.test.ts
│   │   │   │   ├── codegen/
│   │   │   │   │   ├── generator.test.ts
│   │   │   │   │   └── test-generator.test.ts
│   │   │   │   ├── commands/
│   │   │   │   │   ├── generate.test.ts
│   │   │   │   │   └── auth.test.ts
│   │   │   │   ├── auth/
│   │   │   │   │   └── storage.test.ts
│   │   │   │   └── setup.test.ts
│   │   │   └── integration/
│   │   │       └── .gitkeep            # Empty placeholder; L2 lives at tests/e2e/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── web/              # @clip/web — Marketing site + docs
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   │   ├── index.astro       # Landing page
│   │   │   │   ├── docs/             # Documentation pages
│   │   │   │   └── about.astro       # About page
│   │   │   ├── layouts/
│   │   │   ├── components/
│   │   │   └── styles/
│   │   ├── public/
│   │   ├── astro.config.mjs
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── example-api/      # @clip/example-api — Hono Todo App (small fixture)
│   │   ├── src/
│   │   │   ├── index.ts              # Server entry, Hono app setup
│   │   │   ├── routes/
│   │   │   │   └── todos.ts          # CRUD route handlers
│   │   │   ├── middleware/
│   │   │   │   └── auth.ts           # X-API-Key header validation
│   │   │   └── store.ts              # In-memory todo storage
│   │   ├── clip.yaml                 # Schema for dogfooding
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── demo-app/         # @clip/demo-app — L2 Bookmarks API fixture
│       ├── src/
│       │   ├── index.ts              # Server entry, Hono Bookmarks API
│       │   └── store.ts              # In-memory bookmark storage
│       ├── tests/
│       ├── clip.yaml                 # Schema used by L2 e2e
│       ├── package.json
│       └── vitest.config.ts
│
├── tests/
│   └── e2e/              # L2 — real spawn + real HTTP
│       ├── browser-login.test.ts
│       ├── cli-install.test.ts
│       ├── demo-app.test.ts
│       └── support.ts                # startDemoApp(), temp CLIP_HOME helpers
│
├── docs/                 # Design documents (this directory)
├── README.md             # Project README
├── package.json          # Root workspace config
├── bunfig.toml           # Bun configuration
├── biome.json            # Biome linter/formatter config
└── tsconfig.base.json    # Shared TypeScript base config
```

### Workspace Configuration

**`package.json`** (root):
```jsonc
{
  "name": "clip",
  "private": true,
  "workspaces": ["packages/*"]
}
```

**`bunfig.toml`** (root):
```toml
[install]
peer = false
```

## 2. Package Dependency Graph

```
┌──────────────────────────────────────────────────────────────┐
│                        clip MonoRepo                          │
│                                                               │
│  ┌──────────┐  ┌──────────┐  ┌─────────────┐  ┌────────────┐ │
│  │ @clip/cli│  │ @clip/web│  │@clip/example│  │@clip/demo- │ │
│  │          │  │          │  │    -api     │  │    app     │ │
│  └──────────┘  └──────────┘  └─────────────┘  └────────────┘ │
│       │             │               │                │        │
│  No cross-package dependencies at build time                  │
│  L2 e2e uses demo-app as live HTTP fixture; example-api is a  │
│  small fixture (unit-tested, not the L2 server)               │
└──────────────────────────────────────────────────────────────┘
```

**Key principle**: Each package is independently buildable. There are **no cross-package build-time dependencies**.

| Package | Build Dependencies | Runtime/Test Dependencies |
|---------|-------------------|--------------------------|
| `@clip/cli` | Zod, yaml (npm) | None cross-package |
| `@clip/web` | Astro, framework deps | None cross-package |
| `@clip/example-api` | Hono | None cross-package |
| `@clip/demo-app` | Hono | None cross-package |

The only cross-package relationship at **test time** is L2 e2e: repo-root `tests/e2e/` starts `@clip/demo-app` as a live HTTP fixture (temp `CLIP_HOME`). `@clip/example-api` remains a small Hono fixture with its own unit tests.

## 3. Data Flow

### Schema → CLI Generation Pipeline

```
clip.yaml                          .clip-output/<alias>/
    │                                      │
    ▼                                      ▼
┌─────────┐    ┌───────────┐    ┌────────────────┐    ┌──────────────┐
│  YAML   │───▶│   Zod     │───▶│   Code Gen     │───▶│  Generated   │
│  Parser │    │ Validator  │    │   Engine        │    │  CLI + Tests │
└─────────┘    └───────────┘    └────────────────┘    └──────────────┘
                    │                    │
              Validated AST        Template rendering
              (ClipSchema)         per endpoint
```

**Step-by-step flow**:

1. **Parse** — `packages/cli/src/schema/parser.ts`
   - Reads `clip.yaml` from disk using `fs.readFile`
   - Parses YAML string into a raw JavaScript object via the `yaml` npm package
   - Returns untyped `unknown` object

2. **Validate** — `packages/cli/src/schema/validator.ts`
   - Takes raw parsed object
   - Validates against the Zod schema (`ClipSchemaZod`)
   - Returns strongly-typed `ClipSchema` AST or throws `ZodError` with detailed path info
   - Performs additional semantic checks (unique endpoint names, valid HTTP methods, no duplicate paths)

3. **Generate** — `packages/cli/src/codegen/generator.ts`
   - Takes validated `ClipSchema` AST
   - Creates output directory `.clip-output/<alias>/`
   - Renders TypeScript source files from templates in `packages/cli/src/codegen/templates.ts`:
     - `src/index.ts` — command router mapping endpoint names to command files
     - `src/commands/<name>.ts` — one file per endpoint, handles arg parsing + HTTP call
     - `src/client.ts` — HTTP client with auth header injection
     - `src/config.ts` — reads `$CLIP_HOME/<alias>/credentials.json` (`CLIP_HOME` defaults to `~/.clip`)
   - Renders `package.json` and `tsconfig.json` for the generated project

4. **Test Generate** — `packages/cli/src/codegen/test-generator.ts`
   - Takes validated `ClipSchema` AST
   - Generates `tests/<name>.test.ts` for independent endpoints (e.g., `list.test.ts`, `create.test.ts`) and `tests/crud-sequence.test.ts` for resource-dependent endpoints
   - Each test sends a request with sample data and validates response shape

### Auth Flow

```
┌──────────────────┐     ┌──────────────────────────────┐
│ clip auth set     │────▶│ $CLIP_HOME/<alias>/           │
│    <alias>       │     │   credentials.json            │
└──────────────────┘     │   { headerName, headerValue } │
                         └──────────────┬───────────────┘
                                        │
                                        ▼
                         ┌──────────────────────────────┐
                         │ Generated CLI (client.ts)     │
                         │ Reads credentials.json        │
                         │ Injects header into requests  │
                         └──────────────────────────────┘
```

`CLIP_HOME` defaults to `~/.clip` when not set. Setting `CLIP_HOME` to a custom directory enables isolated testing.

1. User runs `clip auth set <alias>` → interactive prompt collects the API key
2. Credentials written to `$CLIP_HOME/<alias>/credentials.json` with `0600` permissions
3. Generated CLI's `config.ts` reads this file at runtime (resolving `CLIP_HOME` with `~/.clip` fallback)
4. Generated CLI's `client.ts` injects the header (`headerName: headerValue`) into every HTTP request

## 4. Technology Choices

| Choice | Technology | Rationale |
|--------|-----------|-----------|
| **Runtime** | Bun | Fast startup, built-in TypeScript support, native test runner, workspace support |
| **Language** | TypeScript (strict) | Type safety, IDE support, aligns with Bun's native TS |
| **Schema Validation** | Zod | Runtime type checking, excellent error messages, TypeScript type inference |
| **YAML Parsing** | `yaml` npm package | Full YAML 1.2 spec, good error reporting with line numbers |
| **Example API** | Hono | Lightweight, fast, TypeScript-first, works well with Bun |
| **Demo App** | Hono | L2 Bookmarks API fixture used by e2e tests |
| **Marketing Site** | Astro | Static-first, fast builds, great for docs sites, MD/MDX support |
| **Linting/Formatting** | Biome | All-in-one linter + formatter, fast (Rust-based), replaces ESLint + Prettier |
| **Testing** | Vitest (L1) + Bun-runner L2 | Vitest for unit tests; Bun-runner L2 in `tests/e2e/` (real spawn + real HTTP) |
| **CLI Framework** | Commander.js | Mature, well-documented, handles subcommands and arg parsing |

## 5. 6DQ Quality System

The 6DQ (6-Dimension Quality) system ensures code quality through layered automated checks.

### L1 — Unit Tests

- **Tool**: Vitest (projects for `@clip/cli`, `@clip/example-api`, and `@clip/demo-app`)
- **Coverage threshold**: 95% lines / functions / branches / statements (`vitest.config.ts`)
- **Scope**: Individual functions and modules in isolation
- **Location**: `packages/*/tests/unit/`
- **Run command**: `bun run test:unit`
- **Configuration** in root `package.json` / `vitest.config.ts`:
  ```jsonc
  {
    "scripts": {
      "test:unit": "vitest run --coverage"
    }
  }
  ```

### L2 — End-to-End Tests

- **Tool**: Bun-runner e2e (real process spawn + real HTTP)
- **Scope**: End-to-end flows using `@clip/demo-app` as a live test server
- **Location**: `tests/e2e/` (`browser-login.test.ts`, `cli-install.test.ts`, `demo-app.test.ts`, `support.ts`)
- **Note**: `packages/cli/tests/integration/` holds only `.gitkeep` (empty placeholder). Real L2 lives at repo-root `tests/e2e/`.
- **Flow**:
  1. Start `@clip/demo-app` on a random port (`startDemoApp()`)
  2. Use a temp `CLIP_HOME` (never the human `~/.clip`)
  3. Spawn the CLI against live HTTP and assert behavior
  4. Tear down server
- **Run command**: `bun run test:e2e`

### G1 — Static Analysis

- **Tool**: Biome (`biome check --error-on-warnings`) + TypeScript compiler (`tsc --noEmit`)
- **Scope**: All TypeScript source files across all packages
- **Configuration** in `biome.json` (root):
  ```jsonc
  {
    "linter": {
      "enabled": true,
      "rules": { "recommended": true }
    },
    "formatter": {
      "enabled": true,
      "indentStyle": "space",
      "indentWidth": 2
    }
  }
  ```
- **Run command**: `biome check . --error-on-warnings && tsc --noEmit` (via `bun run lint` and `bun run typecheck`)

### G2 — Security Scanning

- **Tool**: `gitleaks` (secret detection) + `osv-scanner` (dependency vulnerability scanning)
- **Scope**: Entire repository
- **Run commands**:
  - `gitleaks detect --source .`
  - `osv-scanner --lockfile bun.lock`

### Git Hooks

#### Hook Installation

Git hooks are committed to the repository under `scripts/hooks/` and installed automatically via a `prepare` script:

**`package.json`** (root):
```jsonc
{
  "scripts": {
    "prepare": "git config core.hooksPath scripts/hooks"
  }
}
```

Running `bun install` triggers the `prepare` script, which configures Git to use `scripts/hooks/` as the hooks directory. This ensures all developers share the same hooks without manual setup.

**Repository layout:**
```
scripts/hooks/
├── pre-commit       # L1 + G1 checks (fast, local)
└── pre-push         # L2 + G2 checks (thorough)
```

> **Note:** Hook files are committed to the repo (not gitignored) and must be executable (`chmod +x`).

#### Coverage Thresholds

| Package | Coverage Threshold | Rationale |
|---------|-------------------|-----------|
| `@clip/cli` | 95% lines/functions/branches/statements | Core logic, must be well-tested |
| `@clip/example-api` | 95% lines/functions/branches/statements | Small fixture, validates the clip workflow |
| `@clip/demo-app` | 95% lines/functions/branches/statements | L2 Bookmarks API fixture |
| `@clip/web` | Excluded from coverage | Static site with no business logic |

**Pre-commit hook** — `scripts/hooks/pre-commit` (fast, local checks):
```bash
#!/bin/bash
set -e
# G1 — Static analysis
bun run lint
bun run typecheck
# L1 — Unit tests
bun run test:unit
```

**Pre-push hook** — `scripts/hooks/pre-push` (thorough checks):
```bash
#!/bin/bash
set -e
# L2 — End-to-end behavior proofs (real spawn, real HTTP)
bun run test:e2e
# G2 — Security scanning
gitleaks detect --source .
osv-scanner --lockfile bun.lock
```

### Quality Gate Summary

| Dimension | Tool | Trigger | Threshold |
|-----------|------|---------|-----------|
| L1 Unit | Vitest | pre-commit | 95% lines/functions/branches/statements |
| L2 E2E | Bun-runner (`tests/e2e/`) | pre-push | All pass |
| G1 Static | Biome + tsc | pre-commit | Zero warnings |
| G2 Security | gitleaks + osv-scanner | pre-push | Zero findings |

## 6. Key Design Decisions

| Decision | Choice | Alternatives Considered |
|----------|--------|------------------------|
| Output directory | `.clip-output/<alias>/` in project root | `~/.clip/output/`, `dist/` — project-local is more intuitive |
| Schema format | YAML | JSON, TOML — YAML is most readable for API definitions |
| Generated CLI lang | TypeScript (compiled by Bun) | JavaScript — TS gives type safety in generated code |
| Auth storage | File-based JSON | Keychain, env vars — file-based is portable and simple |
| Template engine | Template literals | Handlebars, EJS — template literals have zero deps, good for TS |

### Atomic Commit Plan

1. `chore: initialize bun monorepo with workspace config`
2. `chore: add root tsconfig.base.json and biome.json`
3. `chore: scaffold packages/cli package structure`
4. `chore: scaffold packages/example-api package structure`
5. `chore: scaffold packages/web package structure`
6. `chore: add git hooks for 6DQ quality gates`
