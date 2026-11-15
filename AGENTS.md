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

Quality follows `system1-quality` (v1.3.0) with 12 canonical slots (`impl`, `todo`, `na`) and `nocoo/base-ci` v2026.15 (`777bbe4f9bacab8a91d8c01974480a6ee23d28e0`) in native mode (`quality-slots.yml`).

| Slot | Required proof | Status | Current enforcement / gap |
|---|---|---|---|
| S1: Types | Strict TypeScript (`bun run typecheck`) | enforced | `scripts/hooks/pre-commit` index snapshot & CI `s1-types` |
| S2: Lint | Biome check-only (`bun run lint`), no `.skip`/`.only` | enforced | `scripts/hooks/pre-commit` index snapshot & CI `s2-lint` |
| S3: Workflow | `actionlint` + 40-char SHA pinning | enforced | CI `s3-workflow` |
| G1: Secrets | Gitleaks scan (`.gitleaks.toml`) | enforced | `pre-push` & CI `g1-secrets` |
| G2: Dependencies | `osv-scanner` on `bun.lock` | enforced | `pre-push` & CI `g2-dependencies` |
| B1: Build | Bundled Astro docs site | planned (`todo`) | `packages/web` has `build`, not yet wired into root CI |
| L1: Unit | Vitest unit tests ≥95% statements/branches/functions/lines | enforced | `scripts/hooks/pre-commit` (`test:unit`) & CI `l1-unit` |
| L2: Runtime | Cloudflare Worker / platform runtime bindings | N/A (`na`) | Not a Cloudflare Worker project |
| L3: Integration | Real HTTP + generated CLI subprocesses (`test:e2e`) | enforced | `pre-push` & CI `l3-integration` |
| L4: E2E | Browser acceptance runner for Astro docs site | N/A (`na`) | No Playwright browser E2E runner |
| P1: Package | npm package validation | N/A (`na`) | Root `package.json` is private |
| Z1: Gate | Aggregate all `impl` slots & SHA consistency | enforced | CI `z1-gate` (`quality / Z1: Gate`) |

| Hook | Current behavior | Required follow-up |
|---|---|---|
| pre-commit | Index snapshot: typecheck, Biome, coverage, skip/only scan; staged lockfile must match worktree | Maintain \<30s on warm cache; prove rejection when staged tree is broken |
| pre-push | Serial real E2E, repository Gitleaks, lockfile OSV | Applicable integration+G2 on stdin push refs, <3min |

Hooks are check-only; never use `--no-verify` on commits or branch pushes. CI runs `.github/workflows/ci.yml` -> `./.github/workflows/quality-slots.yml` (`v2026.15` composite actions), gated on `quality / Z1: Gate`.

## Resources and isolation

Manual demo development uses port 3100. Automated tests allocate random loopback ports and a fresh `CLIP_HOME`, then stop their own processes and delete only their allocated directories. No cloud database, account or remote `-test` deployment is needed.

## Operations / release

There is no automated release or CD. For an authorized version change, update root/package version and the embedded CLI `.version()` together, then run normal gates and publish only the intended artifact with the maintainer's rights.
Use `bun run quality:full` for behavioral/security validation and separately build the docs site when its code changes.

## Retrospective

Narratives stay in [Retrospective.md](Retrospective.md); keep only recurring rules here, cross-project lessons in global rules/nmem and deterministic requirements in hooks/tests.
