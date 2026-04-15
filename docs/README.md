# clip Documentation Index

This directory contains all design documents for the clip (CLI Protocol) project.

## Architecture

High-level system design, dependency graphs, and cross-cutting concerns.

| # | Document | Description |
|---|----------|-------------|
| 01 | [System Overview](./architecture/01-system-overview.md) | MonoRepo structure, data flow, technology choices, 6DQ quality system |

## Features

Detailed design for each feature area, including implementation paths and commit plans.

| # | Document | Description |
|---|----------|-------------|
| 01 | [Schema Definition](./features/01-schema-definition.md) | `clip.yaml` format, Zod validation, parser design |
| 02 | [CLI Codegen](./features/02-cli-codegen.md) | Code generation from schema AST to working CLI |
| 03 | [Auth Storage](./features/03-auth-storage.md) | Credential storage, `clip auth` commands |
| 04 | [Test Generation](./features/04-test-generation.md) | Automatic test suite generation from schema |
| 05 | [Example API](./features/05-example-api.md) | Hono-based Todo App for dogfooding |
| 06 | [Marketing Website](./features/06-marketing-website.md) | Astro static site for docs and marketing |

## Reading Order

For a complete understanding of the system, read the documents in this order:

1. Architecture → 01 System Overview
2. Features → 01 Schema Definition
3. Features → 02 CLI Codegen
4. Features → 03 Auth Storage
5. Features → 04 Test Generation
6. Features → 05 Example API
7. Features → 06 Marketing Website
