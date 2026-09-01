# clip

Reads `clip.yaml`, generates a human-editable commander TypeScript CLI, and stores API credentials under `~/.clip/<alias>/credentials.json` (mode 0600).
Profile: cli-library
Direction: [README.md](README.md). `docs/architecture/01-system-overview.md` omits `demo-app` and still describes old 90% L1. Frameworks must not rewrite this file.

## Sources of Truth

This file is the **contract**. Hooks, CI, and config are **enforcement**. If they disagree, raise enforcement; never lower this file.

| Fact | Where |
|---|---|
| Agent handbook | this file |
| Human docs | README.md, `docs/architecture/*`, `docs/features/*` |
| Version | root `package.json`; also `packages/cli/package.json` and hardcoded `.version()` in `packages/cli/src/index.ts` |
| Enforcement | `scripts/hooks/*`, `.github/workflows/ci.yml`, `vitest.config.ts` |
| Machine rules | global `AGENTS.md`, `rules/git-commit.md` |
| Accidents | [Retrospective.md](Retrospective.md) |
| Env files | omit (credentials live in `~/.clip`, never in the repo) |

## Project Invariants

- Scope is **auth storage** + **yaml→CLI codegen** only. No OpenAPI input, no output formatters, no pagination framework. Generated `templates.ts` output stays human-readable and hand-editable.
- Auth types: `header` / `browser-login` / `cf-access`. Do not revive `oauth`.
- Credentials: `~/.clip/<alias>/credentials.json` mode 0600. E2E must use `CLIP_HOME=<tmpdir>` and never touch the human `~/.clip`.
- Do not silently delete `clip.yaml` fields still used by consumers (grep bogo and others before changing `packages/cli/src/schema/validator.ts`).
- Hooks path is `git config core.hooksPath scripts/hooks` (`prepare`), not husky.

## Stack / Layout

| Component | Choice |
|---|---|
| Language | TypeScript 7 strict |
| Package manager | Bun workspaces |
| Runtime | Bun CLI (`packages/cli`); demo-app / example-api are fixtures |
| Lint | Biome `check . --error-on-warnings` |
| Tests | Vitest L1 ≥95% all four; Bun-runner L2 in `tests/e2e/` |
| Data | none (local credential files only) |

```
packages/cli           codegen + auth commands
packages/demo-app      L2 Bookmarks API
packages/example-api   small Hono fixture
packages/web           Astro docs site (no L3)
tests/e2e              real spawn + real HTTP
```

## Commands

```bash
bun run lint
bun run typecheck
bun run test:unit
bun run test:e2e
bun run quality:full
cd packages/demo-app && bun run dev
```

## Verification

Status: `enforced` | `planned` | `manual` | `N/A`. `enforced` Evidence = hook/CI/config/script.

Org gaps: index-snapshot pre-commit; stdin-range pre-push; `.skip`/`.only`; gitleaks on pre-commit.

Today: pre-commit lint + typecheck + `test:unit` on the working tree. pre-push `test:e2e` then gitleaks + osv (missing binary = fail). CI bun-quality `@aec4adc1a817c56790d1698329ef9398a15a754a` (v2026.5, bun 1.3.5): unit/lint/typecheck + G2 + L2 `test:e2e`.

| Change | Proof | Status | Evidence |
|---|---|---|---|
| Logic | L1 vitest ≥95% stmt/branch/func/line | enforced | pre-commit `test:unit`; `vitest.config.ts`; CI |
| API L2 | real spawn generated CLI + real HTTP | enforced | pre-push `test:e2e`; CI `enable-l2` |
| UI L3 | — | N/A | `packages/web` has no Playwright |
| Types / lint | tsc + Biome 0 warning | enforced | pre-commit + CI |
| G2 secrets | gitleaks | enforced | pre-push + CI bun-quality |
| G2 deps | osv-scanner `bun.lock` | enforced | pre-push + CI |
| Bundler | — | N/A | generate writes a project; no ship bundle gate |
| Docs | numbered doc if behavior changes | manual | human review |
| Release | version bump | planned | no release script in this repo |

Index-snapshot pre-commit and stdin-range pre-push are planned. `--no-verify` forbidden on commits and branch pushes. Tag-only may skip.

## Resources / Isolation

| Purpose | Port / resource | Isolation |
|---|---|---|
| Demo | 3100 `packages/demo-app` | local fixture API |
| L2 | random port | `startDemoApp()` + temp `CLIP_HOME`; never `~/.clip` |

E2E never uses production credentials.

## Operations / Release

- No CD. Bump root `package.json`, `packages/cli/package.json`, and `packages/cli/src/index.ts` `.version()` together. Who: npm publish rights if a package is shipped.
- Live-check: `bun run quality:full`.

## Retrospective

| Kind | Where |
|---|---|
| Accident narrative | [Retrospective.md](Retrospective.md) |
| Recurring project rule | one line here (cap ~10) |
| Checkable rule | hook or test |

- Scope is auth + yaml codegen only. No OpenAPI. No `oauth` type name.
- Generated CLI stays readable; do not magick `templates.ts`.
- E2E uses temp `CLIP_HOME`. Never `~/.clip`.
