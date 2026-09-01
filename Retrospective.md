# Retrospective

Accident narratives for this repo.

Routing: narrative stays here. A project-specific rule that will recur may become one line in `CLAUDE.md`. Cross-project lessons go to nmem or a global rule. If it can be checked by a machine, add a hook or test instead of prose.

## OpenAPI input was removed

- **What:** An OpenAPI adapter expanded scope beyond yaml→CLI.
- **Why:** clip only owns auth storage + `clip.yaml` codegen.
- **Follow-up:** `docs/features/07-openapi-input.md` deleted in `812ec38`. Do not restore.

## `oauth` renamed to `browser-login`

- **What:** Auth type `oauth` implied RFC 6749.
- **Why:** The flow is loopback browser login, not OAuth.
- **Follow-up:** schema name is `browser-login` only.
