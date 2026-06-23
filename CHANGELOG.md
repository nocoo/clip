# Changelog

## [1.1.0] - 2026-06-23

Minor: redirect-friendly login for self-hosted deployments.

### Added
- `CLIP_BASE_URL` environment variable now overrides the apiUrl used
  by **both** generated business calls (already supported) and the
  generated `<alias> login` flow (previously hardcoded at codegen
  time). The same override also affects `clip auth login` so the
  dev-facing wrapper agrees. Users of a self-hosted SaaS can now
  redirect every CLI call — login included — with one env var, no
  rebuild required.

## [1.0.0] - 2026-06-21

First stable release. Project scope locked to two problems: credential
management and CLI generation from a `clip.yaml` schema.

### Breaking
- Auth shape `oauth` renamed to `browser-login` across `ClipSchema`,
  generated config/templates, stored credentials (`OAuthCredentials` →
  `BrowserLoginCredentials`), and CLI commands. The old name was
  misleading — the flow is a custom browser-callback handshake, not
  RFC 6749 OAuth 2.0. Hard switch; no compat shim. Existing
  `~/.clip/<alias>/credentials.json` files with `type: "oauth"` must be
  re-issued (`clip auth login <alias>`).
- Dropped backward-compat for legacy header credentials files (those
  without a `type` field). All credentials must now carry an explicit
  discriminator.

### Added
- MIT license — `LICENSE` at repo root, `"license": "MIT"` on all four
  workspace `package.json` files.
- GitHub repo metadata: description + topics (`cli`, `codegen`,
  `typescript`, `bun`, `api-client`, `developer-tools`, `schema-driven`).
- Hero `logo.png` (2048×2048 RGBA) committed to repo root.

### Fixed
- `clip generate` no longer crashes for cf-access schemas — the test
  generator now skips with an informational log instead of throwing, so
  codegen completes and the CLI is emitted.
- Generated CLI now type-checks under `tsc --strict` — `RequestOptions.query`
  widened to `Record<string, string | undefined>` so unspecified flags
  pass through cleanly.

### Changed
- README rewritten in Chinese around the two core problems, with hero
  logo, ASCII data-flow diagram, full command surface, and source-install
  instructions. No more aspirational claims.

### Docs
- Added then dropped `docs/features/07-openapi-input.md`: a multi-round
  exploration of an OpenAPI 3.x adapter, intentionally cut from v1 scope
  after concluding the work belongs out-of-tree (see commit `812ec38`).

### Dependencies
- `@biomejs/biome` 2.4.14 → 2.5.0 (config migrated)
- `hono` 4.12.23 → 4.12.26 (CVE fixes)
- `astro` 6.4.3 → 6.4.8
- `vitest` + `@vitest/coverage-v8` → 4.1.9
- `commander` → 15.0.0, `zod` → 4.4.3, `yaml` → 2.9.0
- `@types/bun` → 1.3.14
- Pinned overrides: `vite` 7.3.5, `js-yaml` >=4.2.0, `esbuild` >=0.28.1
  (CVE-driven).
- CI: pinned `base-ci` reusable workflow to v2026.5 SHA.

## [0.0.2] - 2026-05-29

### Added
- New `cf-access` auth type in clip schemas — generates a CLI that authenticates
  to a Cloudflare Access-protected API via service tokens (two headers:
  `CF-Access-Client-Id` + `CF-Access-Client-Secret`, both header names
  configurable).
- `clip auth set <alias>` accepts `--client-id` and `--client-secret` flags
  (or prompts interactively) for cf-access aliases. Credentials persist as
  `CFAccessCredentials` in `~/.clip/<alias>/credentials.json`.
- `clip auth show` displays cf-access credentials with both client id and
  secret masked.

### Changed
- Generated `loadConfig()` now returns `{ headers: Record<string, string> }`
  instead of `{ headerName, headerValue }`. Each auth variant contributes one
  or many request headers; existing header/oauth flows behave identically.
- Root `package.json` now carries `"version": "0.0.2"` as the single source
  of truth.
