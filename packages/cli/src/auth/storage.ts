import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface HeaderCredentials {
  type: "header";
  headerName: string;
  headerValue: string;
}

export interface OAuthCredentials {
  type: "oauth";
  token: string;
  email?: string;
  expiresAt?: string;
}

export type Credentials = HeaderCredentials | OAuthCredentials;

export function getClipHome(): string {
  return process.env.CLIP_HOME ?? join(homedir(), ".clip");
}

export async function getCredentialsPath(alias: string): Promise<string> {
  return join(getClipHome(), alias, "credentials.json");
}

export async function saveCredentials(
  alias: string,
  creds: Credentials,
): Promise<void> {
  const dir = join(getClipHome(), alias);
  await mkdir(dir, { recursive: true });
  await chmod(dir, 0o700);

  const filePath = join(dir, "credentials.json");
  await writeFile(filePath, JSON.stringify(creds, null, 2));
  await chmod(filePath, 0o600);
}

/**
 * Load credentials from disk.
 *
 * Backward compatibility: credentials saved before the discriminated-union
 * upgrade have no `type` field. They are treated as `HeaderCredentials`
 * provided they have `headerName` + `headerValue`.
 */
export async function loadCredentials(
  alias: string,
): Promise<Credentials | null> {
  const filePath = await getCredentialsPath(alias);
  try {
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.type === "oauth") {
      return parsed as unknown as OAuthCredentials;
    }
    if (parsed.type === "header") {
      return parsed as unknown as HeaderCredentials;
    }
    // Legacy file without `type` — assume header credentials.
    if (
      typeof parsed.headerName === "string" &&
      typeof parsed.headerValue === "string"
    ) {
      return {
        type: "header",
        headerName: parsed.headerName,
        headerValue: parsed.headerValue,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function removeCredentials(alias: string): Promise<boolean> {
  const dir = join(getClipHome(), alias);
  try {
    await rm(dir, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

export function maskValue(value: string): string {
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}****${value.slice(-2)}`;
}
