# clip

Generate a readable commander TypeScript CLI from `clip.yaml`, with private local credential storage.
Profile: cli-library, with a bundled Astro documentation site.
Direction: [README.md](README.md); architecture docs may describe older coverage/layout. Frameworks must not rewrite this file.

## Scope and instruction sources

- This file is the only project handbook; nested files do not compete with it. Do not create a `CLAUDE.md` alias or copy.
- This file is the contract; `scripts/hooks/`, `.github/workflows/ci.yml` and `vitest.config.ts` enforce it. Raise weaker enforcement instead of lowering this contract.
- Human docs: [README.md](README.md), `docs/architecture/`, `docs/features/`. Version: root and `packages/cli/package.json`, plus `.version()` in `packages/cli/src/index.ts`. Credentials: user-owned `~/.clip/<alias>/credentials.json`, never tracked. Machine rules/accidents: global `AGENTS.md` and `rules/`; [Retrospective.md](Retrospective.md).

## Project invariants

- Scope is auth storage and YAML-to-CLI generation. Do not reintroduce OpenAPI input, an output-formatting abstraction or a pagination framework.
- Auth names are `header`, `browser-login`, `cf-access`; do not revive the misleading `oauth` name.
- Credential files use mode `0600`. E2E always sets a temporary `CLIP_HOME`, never writes the human's `~/.clip`, and never uses production credentials.
- Generated `templates.ts` output remains readable and hand-editable. Before removing YAML fields, inspect actual consumers such as Bogo and preserve compatibility.
- Hooks are installed at `scripts/hooks` by `prepare`; do not replace this with Husky or assume ignored Husky wrappers are the entrypoint.

## Setup and commands

TypeScript 7 on Bun workspaces; CI pins Bun 1.3.5. TypeScript/Biome static checks; Vitest/V8 and Bun process/HTTP tests. `packages/cli/` holds the generator, schema and auth commands and executes source without a bundle; `packages/demo-app/` and `packages/example-api/` are local API fixtures; `packages/web/` is an Astro documentation site with its own build; `tests/e2e/` and `scripts/` hold real subprocess/HTTP journeys and hooks. No production service or secret is needed. Gitleaks and OSV Scanner are required by pre-push.

```bash
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run test:unit
bun run test:e2e
bun run --cwd packages/web build
bun run quality:full
bun run --cwd packages/demo-app dev
```

`test:e2e` uses Bun's runner with file concurrency 1; it owns fixture servers and generated CLI processes. `test:integration` is only an echo placeholder and proves no behavior. The CLI ships source; the Astro site still requires an actual bundle build.

## Testing and quality contract

6DQ keeps its name with unified L1, L2/L3, G2 and D1; the owner merged former G1 into L1 on 2026-09-21. Statuses: `enforced`, `planned`, `manual`, `N/A`.

| Dimension | Required proof | Status | Current enforcement / gap |
|---|---|---|---|
| L1 pre-commit quality | Statements, branches, functions and lines each ≥95%; no `.skip`/`.only`; strict types and check-only lint with zero errors/warnings | planned | Commit/CI `test:unit` enforces four 95% thresholds; install/test commands, CLI entry and docs-site source are excluded, and the skip/focus gate is incomplete. Commit/CI typecheck and Biome cover static subchecks; index-snapshot/timing/rejection unverified |
| L2 API | Real HTTP over the local fixture/auth endpoint-method surface | planned | Push/CI E2E uses real HTTP; a complete endpoint/method inventory is not enforced |
| L3 CLI | Generate/install/login/use real CLI processes | enforced | `test:e2e` runs generated commands and browser-login callbacks with real subprocesses |
| L3 docs UI | Critical docs navigation/browser behavior | planned | Astro site has no browser acceptance runner |
| G2 security | Dependency and secret scans; missing scanner fails | enforced | Pre-push checks tool presence then Gitleaks/OSV on `bun.lock`; CI shared scanners |
| D1 isolation | Per-run local files/servers and guards before cleanup | planned | Tests allocate temp schema/working/credential directories and random ports; common target/cleanup guards and a docs-browser harness remain incomplete |
| Build | Bundled Astro docs site | planned | `packages/web` has `build`, but root hooks/CI do not run it |
| Docs / release | YAML compatibility and synchronized version review | manual | Human review; no release script or CD |

| Hook | Current behavior | Required follow-up |
|---|---|---|
| pre-commit | Working-tree lint, typecheck, coverage | Unified L1 on an index snapshot, <30s |
| pre-push | Serial real E2E, repository Gitleaks, lockfile OSV | Applicable integration+G2 on stdin push refs, <3min |

Hooks are check-only; never use `--no-verify` on commits or branch pushes. CI uses `base-ci/quality.yml@ad43150de3a2be2fa464b5cd2f921dc4fa9f8f0f` with L2 enabled.

## Resources and isolation

Manual demo development uses port 3100. Automated tests allocate random loopback ports and a fresh `CLIP_HOME`, then stop their own processes and delete only their allocated directories. No cloud database, account or remote `-test` deployment is needed.

## Operations / release

There is no automated release or CD. For an authorized version change, update root/package version and the embedded CLI `.version()` together, then run normal gates and publish only the intended artifact with the maintainer's rights.
Use `bun run quality:full` for behavioral/security validation and separately build the docs site when its code changes.

## Retrospective

Narratives stay in [Retrospective.md](Retrospective.md); keep only recurring rules here, cross-project lessons in global rules/nmem and deterministic requirements in hooks/tests.
