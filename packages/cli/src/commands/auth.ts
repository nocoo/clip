import { createInterface } from "node:readline";
import {
  getCredentialsPath,
  loadCredentials,
  maskValue,
  removeCredentials,
  saveCredentials,
} from "../auth/storage";

/**
 * `clip auth set <alias>` — save API key credentials.
 */
export async function authSet(
  alias: string,
  options: { key?: string; header?: string },
): Promise<void> {
  let headerName = options.header;

  // Try to read headerName from clip.yaml if not provided
  if (!headerName) {
    try {
      const { parseClipSchema } = await import("../schema/parser");
      const schema = await parseClipSchema("clip.yaml");
      headerName = schema.auth.headerName;
    } catch {
      // No clip.yaml found, require --header
    }
  }

  if (!headerName) {
    console.error(
      '❌ No clip.yaml found. Please provide --header <name> (e.g. --header "X-API-Key")',
    );
    process.exit(1);
  }

  let headerValue = options.key;

  if (!headerValue) {
    // Interactive prompt
    headerValue = await promptSecret(
      `Enter API key for "${alias}" (${headerName}): `,
    );
  }

  if (!headerValue) {
    console.error("❌ No API key provided");
    process.exit(1);
  }

  await saveCredentials(alias, { headerName, headerValue });
  console.log(`✅ Credentials saved for "${alias}"`);
}

/**
 * `clip auth show <alias>` — display masked credentials.
 */
export async function authShow(alias: string): Promise<void> {
  const creds = await loadCredentials(alias);
  if (!creds) {
    console.error(`❌ No credentials found for "${alias}"`);
    process.exit(1);
  }

  const credPath = await getCredentialsPath(alias);
  console.log(`Alias:  ${alias}`);
  console.log(`Header: ${creds.headerName}`);
  console.log(`Value:  ${maskValue(creds.headerValue)}`);
  console.log(`Path:   ${credPath}`);
}

/**
 * `clip auth remove <alias>` — delete credentials after confirmation.
 */
export async function authRemove(
  alias: string,
  options: { force?: boolean },
): Promise<void> {
  if (!options.force) {
    const answer = await promptSecret(
      `Remove credentials for "${alias}"? (y/N) `,
    );
    if (answer?.toLowerCase() !== "y") {
      console.log("Cancelled.");
      return;
    }
  }

  const removed = await removeCredentials(alias);
  if (removed) {
    console.log(`✅ Credentials removed for "${alias}"`);
  } else {
    console.error(`❌ No credentials found for "${alias}"`);
  }
}

/**
 * Prompt for secret input from stdin.
 */
async function promptSecret(prompt: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}
