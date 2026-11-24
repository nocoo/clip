# clip

Generate a readable Commander TypeScript CLI from `clip.yaml`, with private local credential storage, plus a bundled Astro documentation site.
Docs: [README.md](README.md) · [Architecture](docs/architecture/README.md) · [Features](docs/features/README.md) · [Retrospective](Retrospective.md) (older docs may reflect earlier coverage/layout)

## Commands

Run from root with Bun workspaces and TypeScript 7 (CI pins Bun `1.3.5`). No production service, cloud DB, or secret is needed; `pre-push` requires local `gitleaks` and `osv-scanner`.

- `packages/cli/` — generator, schema, and auth commands; executes source directly without a bundle.
- `packages/demo-app/` & `packages/example-api/` — local Hono API fixtures (`demo-app` manual dev listens on port `3100`).
- `packages/web/` — Astro documentation site with its own bundle build; `tests/e2e/` and `scripts/` hold subprocess/HTTP journeys and hooks.

```sh
bun install --frozen-lockfile
bun run typecheck                 # S1
bun run lint                      # S2 check-only, 0 warnings
bun run test:unit                 # L1 Vitest >= 95% (statements/branches/functions/lines)
bun run test:e2e                  # L3 Bun runner (--concurrency=1), fixture server + generated CLI
bun run --cwd packages/web build  # B1 Astro docs site bundle
bun run quality:full              # lint + typecheck + test:unit + test:e2e + gitleaks + osv-scanner
bun run --cwd packages/demo-app dev
```

`test:integration` is only an echo placeholder and proves no behavior. The CLI ships source; build `packages/web` separately whenever docs site code changes.

## Invariants

- **Contract**: Sole project handbook enforced by `scripts/hooks/`, `.github/workflows/`, and `vitest.config.ts`. Raise weaker enforcement instead of lowering this contract; frameworks must not rewrite it.
- **Scope**: Own auth storage and `clip.yaml`-to-CLI generation only. Do not reintroduce OpenAPI input, an output-formatting abstraction, or a pagination framework.
- **Auth names**: Canonical auth types are `header`, `browser-login`, and `cf-access`; do not revive the misleading `oauth` name.
- **Credentials**: User-owned `~/.clip/<alias>/credentials.json` uses mode `0600` and is never tracked. E2E sets a temporary `CLIP_HOME` and never writes `~/.clip` or uses prod credentials.
- **Test isolation**: Automated tests allocate random loopback ports and a fresh `CLIP_HOME`, stop their own processes, and delete only their allocated directories; no remote `-test` deployment is needed.
- **Codegen compatibility**: Generated `templates.ts` output stays readable and hand-editable. Inspect actual consumers (such as Bogo) and preserve compatibility before removing `clip.yaml` fields.
- **Hooks entrypoint**: Hooks live in `scripts/hooks/` and install via `prepare` (`core.hooksPath`); do not replace with Husky or treat ignored Husky wrappers as the entrypoint.
- **Version & release**: No automated release/CD. Authorized version bumps update root `package.json`, `packages/cli/package.json`, and `.version()` in `packages/cli/src/index.ts` together.
- **Publish check**: Before an authorized publish with maintainer rights, run `bun run quality:full` and build `packages/web` if docs changed; publish only the intended artifact.

## Quality & Local Gates

Follows `system1-quality`; CI runs `.github/workflows/ci.yml` -> `.github/workflows/quality-slots.yml` (`quality / Z1: Gate` required on `main`). Status vocabulary: `enforced`, `planned`, `manual`, `N/A`.

- **Enforced in CI**: `S1` typecheck, `S2` Biome, `S3` actionlint + 40-char SHA pins, `G1` Gitleaks (`.gitleaks.toml`), `G2` OSV Scanner (`bun.lock`), `L1` Vitest coverage, `L3` `test:e2e`, `Z1: Gate`.
- **Coverage boundary**: `L1` enforces >= 95% on `packages/cli` (`packages/demo-app/**`, `packages/example-api/**` E2E fixtures, `packages/web/**`, and thin CLI entrypoints excluded in `vitest.config.ts`).
- **Exceptions / gaps**: `B1 Build` is `planned` (`packages/web` build not yet wired into CI); `L2 Runtime` (`N/A`, non-Worker), `L4 E2E` (`N/A`, no Playwright runner), `P1 Package` (`N/A`, private packages).
- **Pre-commit**: Installed via `bun run prepare` (`scripts/hooks/`, check-only; no `--no-verify`). Checks staged index snapshot (lockfile matches worktree): `S1`, `S2` + `.only`/`.skip`, `L1` (< 30s warm).
- **Pre-push**: Runs serial `test:e2e` (`L3`), repo `gitleaks` (`G1`), and `osv-scanner --lockfile bun.lock` (`G2`); scoping to stdin push refs is `planned` (target < 3m).

## Retrospective

Record incident narratives in [Retrospective.md](Retrospective.md); promote recurring project constraints to `Invariants` above and enforceable safeguards to tests/hooks.
