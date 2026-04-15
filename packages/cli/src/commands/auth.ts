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
    const answer = await promptInput(
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
 * Prompt for secret input from stdin (hides typed characters).
 */
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
