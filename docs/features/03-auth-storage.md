# 03 — Auth Storage

## 1. Overview

clip stores API authentication credentials locally on disk, one credentials file per project alias. The generated CLI reads these credentials at runtime and injects them as HTTP headers into every API request.

## 2. Storage Design

### Location

```
$CLIP_HOME/<alias>/credentials.json
```

`CLIP_HOME` defaults to `~/.clip` when not set. Setting `CLIP_HOME` to a custom directory enables isolated testing.

Example for `alias: todo`:
```
~/.clip/todo/credentials.json
```

### File Format

```json
{
  "headerName": "X-API-Key",
  "headerValue": "sk-abc123..."
}
```

| Field | Type | Source |
|-------|------|--------|
| `headerName` | `string` | Copied from `clip.yaml` → `auth.headerName` |
| `headerValue` | `string` | User-provided via `clip auth set` |

### Security

- File permissions: **`0600`** (owner read/write only)
- Directory permissions: **`0700`** (owner only)
- Credential values are **never logged** to stdout/stderr
- `clip auth show` masks the key: `X-API-Key: sk-ab****23`

## 3. Auth Storage Module

### Module: `packages/cli/src/auth/storage.ts`

```typescript
import { readFile, writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { chmod } from "fs/promises";

const CLIP_DIR = process.env.CLIP_HOME || join(homedir(), ".clip");

export interface Credentials {
  headerName: string;
  headerValue: string;
}

export async function getCredentialsPath(alias: string): Promise<string> {
  return join(CLIP_DIR, alias, "credentials.json");
}

export async function saveCredentials(alias: string, creds: Credentials): Promise<void> {
  const dir = join(CLIP_DIR, alias);
  await mkdir(dir, { recursive: true });
  await chmod(dir, 0o700);

  const filePath = join(dir, "credentials.json");
  await writeFile(filePath, JSON.stringify(creds, null, 2));
  await chmod(filePath, 0o600);
}

export async function loadCredentials(alias: string): Promise<Credentials | null> {
  const filePath = await getCredentialsPath(alias);
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as Credentials;
  } catch {
    return null;
  }
}

export async function removeCredentials(alias: string): Promise<boolean> {
  const dir = join(CLIP_DIR, alias);
  try {
    await rm(dir, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

export function maskValue(value: string): string {
  if (value.length <= 4) return "****";
  return value.slice(0, 2) + "****" + value.slice(-2);
}
```

## 4. CLI Commands

### `clip auth set <alias>`

**Module**: `packages/cli/src/commands/auth.ts`

```
clip auth set <alias> [--key <value>] [--header <name>]
```

**Flow**:
1. Check if `clip.yaml` exists (to read `auth.headerName`) or accept `--header <name>` override
2. If `--key` not provided, prompt interactively (hide input):
   ```
   Enter API key for "todo" (X-API-Key): ****
   ```
3. Save credentials via `saveCredentials(alias, { headerName, headerValue })`
4. Print: `✓ Credentials saved for "todo"`

**Implementation details**:
- Uses Bun's built-in `prompt()` or `process.stdin` for interactive input
- The `headerName` is read from the `clip.yaml` `auth.headerName` field
- If no `clip.yaml` is found, require `--header <name>` flag

### `clip auth show <alias>`

```
clip auth show <alias>
```

**Flow**:
1. Load credentials via `loadCredentials(alias)`
2. If not found, print: `✗ No credentials found for "todo"`
3. If found, print:
   ```
   Alias:  todo
   Header: X-API-Key
   Value:  sk-ab****23
   Path:   ~/.clip/todo/credentials.json
   ```

### `clip auth remove <alias>`

```
clip auth remove <alias>
```

**Flow**:
1. Confirm with user: `Remove credentials for "todo"? (y/N)`
2. Call `removeCredentials(alias)`
3. Print: `✓ Credentials removed for "todo"` or `✗ No credentials found for "todo"`

## 5. Integration with Generated CLI

The generated `config.ts` reads credentials using the same file path convention:

```typescript
// Generated .clip-output/<alias>/src/config.ts
import { readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

export async function loadConfig() {
  const clipHome = process.env.CLIP_HOME ?? join(homedir(), ".clip");
  const credPath = join(clipHome, "<alias>", "credentials.json");
  try {
    const raw = await readFile(credPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    console.error("No credentials found. Run: clip auth set <alias>");
    process.exit(1);
  }
}
```

The generated `client.ts` injects the header:

```typescript
const config = await loadConfig();
headers[config.headerName] = config.headerValue;
```

## 6. Files to Create/Modify

| File Path | Action | Purpose |
|-----------|--------|---------|
| `packages/cli/src/auth/storage.ts` | Create | Credential CRUD operations |
| `packages/cli/src/commands/auth.ts` | Create | `clip auth set\|show\|remove` commands |
| `packages/cli/tests/unit/auth/storage.test.ts` | Create | Unit tests for storage module |
| `packages/cli/tests/unit/auth/commands.test.ts` | Create | Unit tests for auth commands |

## 7. Test Strategy

### Unit Tests — `packages/cli/tests/unit/auth/`

**`storage.test.ts`**:
- ✅ `saveCredentials` creates directory with 0700 permissions
- ✅ `saveCredentials` writes file with 0600 permissions
- ✅ `loadCredentials` returns credentials for existing alias
- ✅ `loadCredentials` returns null for nonexistent alias
- ✅ `removeCredentials` deletes the alias directory
- ✅ `removeCredentials` returns false for nonexistent alias
- ✅ `maskValue` masks middle of long strings
- ✅ `maskValue` returns `****` for very short strings

**`commands.test.ts`**:
- ✅ `auth set` saves credentials correctly
- ✅ `auth show` displays masked credentials
- ✅ `auth show` handles missing credentials
- ✅ `auth remove` deletes credentials after confirmation

> **Note**: Tests set `CLIP_HOME` to a temporary directory (`$TMPDIR/.clip-test/`) instead of using the real `~/.clip/` to avoid side effects.

### Atomic Commit Plan

1. `feat(auth): implement credential storage module`
2. `feat(auth): add mask utility for credential display`
3. `feat(auth): implement clip auth set command with interactive prompt`
4. `feat(auth): implement clip auth show command`
5. `feat(auth): implement clip auth remove command`
6. `test(auth): add unit tests for credential storage`
7. `test(auth): add unit tests for auth commands`
