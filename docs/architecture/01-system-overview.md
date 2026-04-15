# 01 — System Overview

## 1. MonoRepo Structure

clip uses a **Bun workspace** MonoRepo with three packages:

```
clip/
├── packages/
│   ├── cli/              # @clip/cli — Core CLI tool
│   │   ├── src/
│   │   │   ├── index.ts              # Entry point, top-level command router
│   │   │   ├── commands/
│   │   │   │   ├── generate.ts       # clip generate — schema → CLI codegen
│   │   │   │   ├── install.ts        # clip install — generate + global link
│   │   │   │   ├── auth.ts           # clip auth set|show|remove
│   │   │   │   └── test.ts           # clip test <alias> — run generated tests
│   │   │   ├── schema/
│   │   │   │   ├── parser.ts         # YAML → raw object
│   │   │   │   ├── validator.ts      # Zod schema validation
│   │   │   │   └── types.ts          # TypeScript types derived from Zod schemas
│   │   │   ├── codegen/
│   │   │   │   ├── generator.ts      # AST → TypeScript source files
│   │   │   │   ├── templates/        # Template-literal templates
│   │   │   │   │   ├── index.ts.tpl
│   │   │   │   │   ├── command.ts.tpl
│   │   │   │   │   ├── client.ts.tpl
│   │   │   │   │   └── config.ts.tpl
│   │   │   │   └── test-generator.ts # Schema → test file generation
│   │   │   ├── auth/
│   │   │   │   └── storage.ts        # Read/write ~/.clip/<alias>/credentials.json
│   │   │   └── utils/
│   │   │       ├── fs.ts             # File system helpers (mkdir, write, chmod)
│   │   │       └── logger.ts         # Structured console output
│   │   ├── tests/
│   │   │   ├── unit/
│   │   │   │   ├── schema/
│   │   │   │   │   ├── parser.test.ts
│   │   │   │   │   └── validator.test.ts
│   │   │   │   ├── codegen/
│   │   │   │   │   ├── generator.test.ts
│   │   │   │   │   └── test-generator.test.ts
│   │   │   │   └── auth/
│   │   │   │       └── storage.test.ts
│   │   │   └── integration/
│   │   │       ├── generate.test.ts    # End-to-end generate flow
│   │   │       └── auth.test.ts        # End-to-end auth flow
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
│   └── example-api/      # @clip/example-api — Hono Todo App
│       ├── src/
│       │   ├── index.ts              # Server entry, Hono app setup
│       │   ├── routes/
│       │   │   └── todos.ts          # CRUD route handlers
│       │   ├── middleware/
│       │   │   └── auth.ts           # X-API-Key header validation
│       │   └── store.ts              # In-memory todo storage
│       ├── clip.yaml                 # Schema for dogfooding
│       ├── package.json
│       └── tsconfig.json
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
┌─────────────────────────────────────────────────┐
│                   clip MonoRepo                  │
│                                                  │
│  ┌──────────┐   ┌──────────┐   ┌─────────────┐  │
│  │ @clip/cli│   │ @clip/web│   │@clip/example │  │
│  │          │   │          │   │    -api      │  │
│  └──────────┘   └──────────┘   └─────────────┘  │
│       │              │               │           │
│       │              │               │           │
│  No cross-package dependencies at build time     │
│  example-api is used at test time by cli         │
└─────────────────────────────────────────────────┘
```

**Key principle**: Each package is independently buildable. There are **no cross-package build-time dependencies**.

| Package | Build Dependencies | Runtime/Test Dependencies |
|---------|-------------------|--------------------------|
| `@clip/cli` | Zod, yaml (npm) | None cross-package |
| `@clip/web` | Astro, framework deps | None cross-package |
| `@clip/example-api` | Hono | None cross-package |

The only cross-package relationship is at **integration test time**: `@clip/cli` integration tests start `@clip/example-api` as a test fixture server.

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
   - Renders TypeScript source files from templates:
     - `src/index.ts` — command router mapping endpoint names to command files
     - `src/commands/<name>.ts` — one file per endpoint, handles arg parsing + HTTP call
     - `src/client.ts` — HTTP client with auth header injection
     - `src/config.ts` — reads `~/.clip/<alias>/credentials.json`
   - Renders `package.json` and `tsconfig.json` for the generated project

4. **Test Generate** — `packages/cli/src/codegen/test-generator.ts`
   - Takes validated `ClipSchema` AST
   - Generates `tests/<name>.test.ts` for each endpoint
   - Each test sends a request with sample data and validates response shape

### Auth Flow

```
┌──────────────────┐     ┌──────────────────────────────┐
│ clip auth set     │────▶│ ~/.clip/<alias>/              │
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

1. User runs `clip auth set <alias>` → interactive prompt collects the API key
2. Credentials written to `~/.clip/<alias>/credentials.json` with `0600` permissions
3. Generated CLI's `config.ts` reads this file at runtime
4. Generated CLI's `client.ts` injects the header (`headerName: headerValue`) into every HTTP request

## 4. Technology Choices

| Choice | Technology | Rationale |
|--------|-----------|-----------|
| **Runtime** | Bun | Fast startup, built-in TypeScript support, native test runner, workspace support |
| **Language** | TypeScript (strict) | Type safety, IDE support, aligns with Bun's native TS |
| **Schema Validation** | Zod | Runtime type checking, excellent error messages, TypeScript type inference |
| **YAML Parsing** | `yaml` npm package | Full YAML 1.2 spec, good error reporting with line numbers |
| **Example API** | Hono | Lightweight, fast, TypeScript-first, works well with Bun |
| **Marketing Site** | Astro | Static-first, fast builds, great for docs sites, MD/MDX support |
| **Linting/Formatting** | Biome | All-in-one linter + formatter, fast (Rust-based), replaces ESLint + Prettier |
| **Testing** | Bun test + Vitest | Bun test for unit tests, Vitest for integration tests needing richer features |
| **CLI Framework** | Commander.js | Mature, well-documented, handles subcommands and arg parsing |

## 5. 6DQ Quality System

The 6DQ (6-Dimension Quality) system ensures code quality through layered automated checks.

### L1 — Unit Tests

- **Tool**: `bun test` (for `@clip/cli` and `@clip/example-api`)
- **Coverage threshold**: 90% line coverage minimum
- **Scope**: Individual functions and modules in isolation
- **Location**: `packages/*/tests/unit/`
- **Run command**: `bun test --coverage`
- **Configuration** in `package.json`:
  ```jsonc
  {
    "scripts": {
      "test:unit": "bun test tests/unit --coverage"
    }
  }
  ```

### L2 — Integration Tests

- **Tool**: Vitest (for complex async test scenarios)
- **Scope**: End-to-end flows using `@clip/example-api` as a live test server
- **Location**: `packages/cli/tests/integration/`
- **Flow**:
  1. Start `@clip/example-api` on a random port
  2. Run `clip generate` against the example `clip.yaml`
  3. Run generated tests against the live server
  4. Tear down server
- **Run command**: `bun run test:integration`

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
- **Run command**: `biome check . --error-on-warnings && tsc --noEmit`

### G2 — Security Scanning

- **Tool**: `gitleaks` (secret detection) + `osv-scanner` (dependency vulnerability scanning)
- **Scope**: Entire repository
- **Run commands**:
  - `gitleaks detect --source .`
  - `osv-scanner --lockfile bun.lockb`

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
| `@clip/cli` | 90% line coverage | Core logic, must be well-tested |
| `@clip/example-api` | 90% line coverage | Reference implementation, validates the clip workflow |
| `@clip/web` | Excluded from coverage | Static site with no business logic |

**Pre-commit hook** — `scripts/hooks/pre-commit` (fast, local checks):
```bash
#!/bin/bash
set -e
# L1 — Unit tests
bun run test:unit
# G1 — Static analysis
biome check . --error-on-warnings
tsc --noEmit
```

**Pre-push hook** — `scripts/hooks/pre-push` (thorough checks):
```bash
#!/bin/bash
set -e
# L2 — Integration tests
bun run test:integration
# G2 — Security scanning
gitleaks detect --source .
osv-scanner --lockfile bun.lockb
```

### Quality Gate Summary

| Dimension | Tool | Trigger | Threshold |
|-----------|------|---------|-----------|
| L1 Unit | bun test | pre-commit | 90% coverage |
| L2 Integration | Vitest | pre-push | All pass |
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
