import {
  getCredentialsPath,
  loadCredentials,
  maskValue,
  removeCredentials,
  saveCredentials,
} from "../auth/storage";
import type { ClipSchema } from "../schema/types";

/**
 * `clip auth login <alias>` — perform browser-based OAuth login flow.
 *
 * Reads the local `clip.yaml` to discover OAuth configuration, runs
 * `performLogin()` from `@nocoo/cli-base`, and stores the received token
 * as OAuthCredentials.
 */
export async function authLogin(
  alias: string,
  deps: {
    parseSchema?: (path: string) => Promise<ClipSchema>;
    performLogin?: typeof import("@nocoo/cli-base").performLogin;
    openBrowser?: typeof import("@nocoo/cli-base").openBrowser;
    timeoutMs?: number;
  } = {},
): Promise<void> {
  /* v8 ignore start -- production fallbacks; tests inject all deps */
  const parseSchema =
    deps.parseSchema ??
    (async (p: string) =>
      (await import("../schema/parser")).parseClipSchema(p));
  /* v8 ignore stop */

  let schema: ClipSchema;
  try {
    schema = await parseSchema("clip.yaml");
  } catch (err) {
    console.error(
      `❌ Failed to read clip.yaml — ${(err as Error).message}\n` +
        "   The login command must run in a directory containing a clip.yaml.",
    );
    process.exit(1);
  }

  if (schema.auth.type !== "oauth") {
    console.error(
      `❌ This CLI uses ${schema.auth.type} authentication. Run: clip auth set ${alias}`,
    );
    process.exit(1);
  }

  const oauth = schema.auth;
  // Resolve the SaaS apiUrl: either the absolute loginUrl, or the baseUrl
  // (loginPath is appended by performLogin via its `loginPath` option).
  const apiUrl = oauth.loginUrl
    ? new URL(oauth.loginUrl).origin
    : schema.baseUrl;
  const loginPath = oauth.loginUrl
    ? new URL(oauth.loginUrl).pathname
    : oauth.loginPath;

  const cliBase = await import("@nocoo/cli-base");
  /* v8 ignore start -- production fallbacks; tests inject mocks */
  const performLogin = deps.performLogin ?? cliBase.performLogin;
  const openBrowser = deps.openBrowser ?? cliBase.openBrowser;
  /* v8 ignore stop */

  console.log(`🔐 Opening browser to log in to "${alias}"...`);

  let savedToken: string | null = null;
  const result = await performLogin({
    apiUrl,
    loginPath,
    tokenParam: oauth.tokenParam,
    timeoutMs: deps.timeoutMs ?? 5 * 60 * 1000,
    openBrowser,
    onSaveToken: (token: string) => {
      savedToken = token;
    },
    /* v8 ignore next -- production logger; mocks supply their own */
    log: (msg: string) => console.log(msg),
  });

  if (!result.success || !savedToken) {
    console.error(`❌ Login failed: ${result.error ?? "no token received"}`);
    process.exit(1);
  }

  await saveCredentials(alias, {
    type: "oauth",
    token: savedToken,
    email: result.email,
  });

  console.log(
    `✅ Logged in to "${alias}"${result.email ? ` as ${result.email}` : ""}`,
  );
}

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
      if (schema.auth.type === "oauth") {
        console.error(
          `❌ This CLI uses OAuth authentication. Run: clip auth login ${alias}`,
        );
        process.exit(1);
      }
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

  /* v8 ignore start -- interactive secret prompt, not unit-testable */
  if (!headerValue) {
    headerValue = await promptSecret(
      `Enter API key for "${alias}" (${headerName}): `,
    );
  }

  if (!headerValue) {
    console.error("❌ No API key provided");
    process.exit(1);
  }
  /* v8 ignore stop */

  await saveCredentials(alias, { type: "header", headerName, headerValue });
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
  if (creds.type === "oauth") {
    console.log("Type:   oauth");
    if (creds.email) console.log(`Email:  ${creds.email}`);
    if (creds.expiresAt) console.log(`Expires: ${creds.expiresAt}`);
    console.log(`Token:  ${maskValue(creds.token)}`);
  } else {
    console.log("Type:   header");
    console.log(`Header: ${creds.headerName}`);
    console.log(`Value:  ${maskValue(creds.headerValue)}`);
  }
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
    /* v8 ignore start */
    const answer = await promptInput(
      `Remove credentials for "${alias}"? (y/N) `,
    );
    if (answer?.toLowerCase() !== "y") {
      console.log("Cancelled.");
      return;
    }
    /* v8 ignore stop */
  }

  const removed = await removeCredentials(alias);
  if (removed) {
    console.log(`✅ Credentials removed for "${alias}"`);
  } else {
    console.error(`❌ No credentials found for "${alias}"`);
  }
}

/**
 * Prompt for secret input from stdin (hides typed characters).
 */
/* v8 ignore start -- interactive stdin/TTY helpers, not unit-testable */
async function promptSecret(prompt: string): Promise<string> {
  const { stdin, stdout } = process;
  stdout.write(prompt);

  if (!stdin.isTTY) {
    // Non-interactive: fall back to reading a line from stdin
    return readLine(stdin);
  }

  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf-8");

  return new Promise<string>((resolve) => {
    let input = "";
    const onData = (ch: string) => {
      const code = ch.charCodeAt(0);
      if (ch === "\r" || ch === "\n") {
        // Enter
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        stdout.write("\n");
        resolve(input);
      } else if (code === 3) {
        // Ctrl-C
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        stdout.write("\n");
        process.exit(130);
      } else if (code === 127 || code === 8) {
        // Backspace
        if (input.length > 0) {
          input = input.slice(0, -1);
          stdout.write("\b \b");
        }
      } else if (code >= 32) {
        // Printable char — echo a mask character
        input += ch;
        stdout.write("*");
      }
    };
    stdin.on("data", onData);
  });
}

/**
 * Prompt for non-secret input (visible) from stdin.
 */
async function promptInput(prompt: string): Promise<string> {
  const { createInterface } = await import("node:readline");
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

/**
 * Read a single line from a readable stream.
 */
async function readLine(stream: NodeJS.ReadStream): Promise<string> {
  const { createInterface } = await import("node:readline");
  const rl = createInterface({ input: stream });
  return new Promise((resolve) => {
    rl.on("line", (line: string) => {
      rl.close();
      resolve(line);
    });
  });
}
/* v8 ignore stop */
