# Feature Documents

Detailed design documents for each feature area of clip.

| # | Document | Description |
|---|----------|-------------|
| 01 | [Schema Definition](./01-schema-definition.md) | `clip.yaml` format specification, Zod validation schema, YAML parser |
| 02 | [CLI Codegen](./02-cli-codegen.md) | Code generation pipeline from schema AST to working CLI tool |
| 03 | [Auth Storage](./03-auth-storage.md) | Credential storage in `$CLIP_HOME/` (defaults to `~/.clip/`), `clip auth` command family |
| 04 | [Test Generation](./04-test-generation.md) | Automatic test suite generation from schema definitions |
| 05 | [Example API](./05-example-api.md) | Hono-based Todo App for dogfooding and integration testing |
| 06 | [Marketing Website](./06-marketing-website.md) | Astro static site for marketing and documentation |
| 07 | [OpenAPI Input](./07-openapi-input.md) | `clip generate --from openapi.json` adapter — eliminates hand-written `clip.yaml` when an OpenAPI 3.x spec is available |
