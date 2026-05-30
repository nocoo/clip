# Changelog

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
