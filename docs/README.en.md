<p align="center">
  <img src="../logo.png" width="128" height="128" alt="clip logo" />
</p>
<h1 align="center">clip</h1>
<p align="center">Generate an editable TypeScript CLI from clip.yaml and manage API credentials by tool name.</p>
<p align="center"><a href="../README.md">简体中文</a></p>

## What it does

clip is for developers who need a command-line client for an HTTP API. It reads endpoints and authentication settings from `clip.yaml` and generates a Bun CLI built with commander. Each endpoint becomes a command and a separate TypeScript file you can edit.

`clip auth` manages credentials separately. Generated commands read those credentials at runtime and add the request headers, so rotating a key does not require regenerating code. The generator targets APIs that return JSON and uses the project's own `clip.yaml` input format.

## Features

- Validate schema fields, command names, path parameters, and duplicate endpoint definitions.
- Turn path parameters into positional arguments and query or JSON body fields into options, with required arguments and basic number and boolean conversion.
- Generate the CLI entry point, HTTP client, credential reader, separate command files, and project configuration.
- Support single-header API keys, browser-login tokens, and Cloudflare Access service tokens with two headers.
- Select another service with `CLIP_BASE_URL` and another credential directory with `CLIP_HOME`.
- Generate API tests for header and browser-login configurations. `cf-access` currently generates the CLI without this test suite.

You can modify the generated code. Regenerating overwrites files with the same names, so save your changes first. Array parameters, non-JSON responses, and similar API-specific behavior require adjustments to the generated code.

## Usage

### Install from source

Bun is required. The CLI package is marked private in this repository; install it from source:

```bash
git clone https://github.com/nocoo/clip.git
cd clip
bun install --frozen-lockfile
cd packages/cli
bun link
cd ../..
clip --help
```

Ensure Bun's executable directory is on `PATH`. You can also replace `clip` with `bun packages/cli/src/index.ts` from the repository root to avoid registering a global command.

### Try the local example

Start the in-memory Todo API in one terminal at the repository root:

```bash
bun packages/example-api/src/index.ts
```

It defaults to `http://localhost:3456`. In another terminal, return to the repository root and run:

```bash
clip auth set todo --header X-API-Key
clip install packages/example-api/clip.yaml
todo list
todo create --title 'Try clip'
todo list
```

The first command prompts for a key. The local example defaults to `test-api-key`; if you set `API_KEY` when starting the server, enter that value instead. `clip install` generates the project, installs its dependencies, and registers the `todo` command with `bun link`.

For your own API, copy the [example schema](../packages/example-api/clip.yaml) and update `name`, `alias`, `baseUrl`, `auth`, and `endpoints`. To generate files without installing, run `clip generate path/to/clip.yaml`. Output defaults to `.clip-output/<alias>/`; use `--output` for another directory.

### Authentication and credentials

| Auth type | Usage |
| --- | --- |
| `header` | Run `clip auth set <alias>` in a directory containing `clip.yaml` to read the header name, or supply `--header` |
| `browser-login` | Run `clip auth login <alias>` beside the matching `clip.yaml`; the generated CLI also has a `login` command |
| `cf-access` | Run `clip auth set <alias>` beside the matching `clip.yaml` and enter the Client ID and Client Secret when prompted |

Browser login requires a server that implements the login and local callback protocol used by `@nocoo/base-cli`. The default endpoint is `/api/auth/cli`. An arbitrary website login page does not provide this protocol automatically.

Credentials default to `~/.clip/<alias>/credentials.json`. Directory permissions are `0700` and file permissions are `0600`; the contents are plaintext JSON. Use interactive input for real credentials to keep values out of shell history. `clip auth show <alias>` displays masked values, and `clip auth remove <alias>` deletes them.

`clip test <alias>` runs generated tests against the configured API. Tests may call create, update, or delete endpoints, so use a dedicated test service and data.

## Development

From the repository root:

```bash
bun install --frozen-lockfile
bun run typecheck
bun run lint
```

The documentation site lives in `packages/web/`. Its Astro toolchain needs a supported Node.js version; Node.js 24 or newer is recommended.

```bash
bun run --cwd packages/web dev
bun run --cwd packages/web build
```

| Path | Contents |
| --- | --- |
| `packages/cli/` | Schema, code generation, and credential management |
| `packages/example-api/` | Todo API and example schema |
| `packages/demo-app/` | Bookmarks API and login test service |
| `packages/web/` | Static Astro documentation site |
| `tests/e2e/` | Real CLI process and HTTP integration tests |

## Tests

```bash
bun run test:unit
bun run test:e2e
```

The first command runs Vitest unit tests and writes a coverage report. The second starts temporary API services and executes generated CLIs to check requests, browser-login callbacks, and installation. Tests use temporary credential directories, separate ports, and an isolated Bun installation directory; production credentials are not needed.

## Stack

| Technology | Role |
| --- | --- |
| Bun, TypeScript | CLI runtime and workspaces |
| commander | Generated command routing and argument parsing |
| Zod, yaml | Schema parsing and validation |
| `@nocoo/base-cli` | Browser login and local callback |
| Hono | Local example and test APIs |
| Astro | Static documentation site |
| Vitest, Bun test | Unit and process / HTTP integration tests |

## Documentation

- [Documentation index and design background](README.md)
- [Current schema definition](../packages/cli/src/schema/validator.ts)
- [Todo API example](../packages/example-api/clip.yaml)
- [Code generation templates](../packages/cli/src/codegen/templates.ts)

## License

[MIT](../LICENSE)
