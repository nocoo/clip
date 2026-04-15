import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Credentials {
  headerName: string;
  headerValue: string;
}

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

export async function loadCredentials(
  alias: string,
): Promise<Credentials | null> {
  const filePath = await getCredentialsPath(alias);
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as Credentials;
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
