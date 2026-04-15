# clip — CLI Protocol

**clip** turns your API schema into a fully working CLI tool and test suite.

Define your API in a `clip.yaml` file, and clip automatically generates:

1. A **CLI tool** (named after your project alias) that wraps your RESTful API
2. A **test suite** to verify the CLI works correctly against a live API

## Quick Start

```bash
# Install clip
bun install -g @clip/cli

# Define your API schema
cat clip.yaml

# Generate the CLI
clip generate

# Set up authentication
clip auth set <alias>

# Install the generated CLI globally
clip install

# Run generated tests
clip test <alias>
```

## Project Structure

```
clip/
├── packages/
│   ├── cli/          # Core CLI — schema parser, code generator, auth storage, test generator
│   ├── web/          # Marketing site + documentation (Astro)
│   └── example-api/  # Hono-based Todo App for dogfooding/integration testing
├── docs/             # Design documents
├── README.md
├── package.json
└── bunfig.toml
```

## Documentation

All design and architecture documents live in [`docs/`](./docs/README.md):

- **[Architecture](./docs/architecture/README.md)** — System overview, dependency graph, data flow
- **[Features](./docs/features/README.md)** — Detailed design for each feature area

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Bun](https://bun.sh) |
| Language | TypeScript (strict mode) |
| Schema Validation | [Zod](https://zod.dev) |
| Example API | [Hono](https://hono.dev) |
| Marketing Site | [Astro](https://astro.build) |
| Linting | [Biome](https://biomejs.dev) |
| Testing | Bun test / Vitest |

## License

Private — All rights reserved.
