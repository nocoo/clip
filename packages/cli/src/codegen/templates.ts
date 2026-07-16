import type { ClipSchema } from "../schema/types";

/**
 * Renders the generated CLI entry point (index.ts) with commander routing.
 */
export function renderIndex(schema: ClipSchema): string {
  const imports = schema.endpoints
    .map(
      (ep) =>
        `import { ${toCamelCase(ep.name)}Command } from "./commands/${ep.name}";`,
    )
    .join("\n");

  const commands = schema.endpoints
    .map((ep) => {
      const pathParams = extractPathParams(ep.path);
      const queryParams = Object.entries(ep.params?.query ?? {});
      const bodyParams = Object.entries(ep.params?.body ?? {});

      const argsDef = pathParams.map((p) => `<${p}>`).join(" ");
      const cmdDef = argsDef
        ? `  .command("${ep.name} ${argsDef}")`
        : `  .command("${ep.name}")`;

      const options: string[] = [];
      for (const [name, def] of queryParams) {
        const flag = `--${name} <${name}>`;
        const desc = def.description ?? name;
        if (def.required) {
          options.push(`  .requiredOption("${flag}", "${desc}")`);
        } else {
          options.push(`  .option("${flag}", "${desc}")`);
        }
      }
      for (const [name, def] of bodyParams) {
        const flag = `--${name} <${name}>`;
        const desc = def.description ?? name;
        if (def.required) {
          options.push(`  .requiredOption("${flag}", "${desc}")`);
        } else {
          options.push(`  .option("${flag}", "${desc}")`);
        }
      }

      const actionArgs =
        pathParams.length > 0 ? `${pathParams.join(", ")}, opts` : "opts";

      return `program
${cmdDef}
  .description("${ep.description}")
${options.join("\n")}
  .action(async (${actionArgs}) => {
    await ${toCamelCase(ep.name)}Command(${pathParams.length > 0 ? `{ ${pathParams.map((p) => `${p}`).join(", ")}, ...opts }` : "opts"});
  });`;
    })
    .join("\n\n");

  return `#!/usr/bin/env bun
import { program } from "commander";
${imports}${schema.auth.type === "browser-login" ? '\nimport { loginCommand } from "./commands/_login";' : ""}

program
  .name("${schema.alias}")
  .version("${schema.version}")
  .description("${schema.name}");

${
  schema.auth.type === "browser-login"
    ? `program
  .command("login")
  .description("Authenticate via browser-based login flow")
  .action(async () => {
    await loginCommand();
  });

`
    : ""
}${commands}

program.parse();
`;
}

/**
 * Renders the HTTP client module with auth injection.
 */
export function renderClient(schema: ClipSchema): string {
  return `import { loadConfig } from "./config";

interface RequestOptions {
  method: string;
  path: string;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
}

export const client = {
  async request(options: RequestOptions) {
    const config = await loadConfig();
    const baseUrl = process.env.CLIP_BASE_URL || "${schema.baseUrl}";
    const url = new URL(options.path, baseUrl);

    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined) url.searchParams.set(key, value);
      }
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...config.headers,
    };

    const response = await fetch(url.toString(), {
      method: options.method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(\`HTTP \${response.status}: \${text}\`);
    }

    return response.json();
  },
};
`;
}

/**
 * Renders the config module that reads credentials from disk.
 *
 * The generated `loadConfig()` returns `{ headers: Record<string, string> }`,
 * a map of HTTP headers to inject into every request. The shape supports:
 * - "header" credentials → single header
 * - "browser-login" credentials → single Authorization-style header
 * - "cf-access" credentials → two headers (Client-Id and Client-Secret)
 */
export function renderConfig(schema: ClipSchema): string {
  const auth = schema.auth;
  const isBrowserLogin = auth.type === "browser-login";
  const browserLoginHeaderName = isBrowserLogin
    ? auth.headerName
    : "Authorization";
  const browserLoginHeaderPrefix = isBrowserLogin
    ? auth.headerPrefix
    : "Bearer";
  const loginHint =
    auth.type === "browser-login"
      ? `${schema.alias} login`
      : auth.type === "cf-access"
        ? `clip auth set ${schema.alias} --client-id <id> --client-secret <secret>`
        : `clip auth set ${schema.alias}`;

  return `import { readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

interface ResolvedConfig {
  headers: Record<string, string>;
}

export async function loadConfig(): Promise<ResolvedConfig> {
  const clipHome = process.env.CLIP_HOME ?? join(homedir(), ".clip");
  const credPath = join(clipHome, "${schema.alias}", "credentials.json");
  let raw: string;
  try {
    raw = await readFile(credPath, "utf-8");
  } catch {
    console.error("No credentials found. Run: ${loginHint}");
    process.exit(1);
  }

  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (parsed.type === "browser-login") {
    const token = String(parsed.token ?? "");
    const prefix = "${browserLoginHeaderPrefix}";
    return {
      headers: {
        "${browserLoginHeaderName}": prefix ? prefix + " " + token : token,
      },
    };
  }
  if (parsed.type === "cf-access") {
    return {
      headers: {
        [String(parsed.clientIdHeader ?? "CF-Access-Client-Id")]: String(
          parsed.clientId ?? "",
        ),
        [String(parsed.clientSecretHeader ?? "CF-Access-Client-Secret")]:
          String(parsed.clientSecret ?? ""),
      },
    };
  }
  return {
    headers: {
      [String(parsed.headerName ?? "")]: String(parsed.headerValue ?? ""),
    },
  };
}
`;
}

/**
 * Renders a single command handler file for the given endpoint.
 */
export function renderCommand(
  endpoint: ClipSchema["endpoints"][number],
): string {
  const pathParams = extractPathParams(endpoint.path);
  const queryParams = Object.entries(endpoint.params?.query ?? {});
  const bodyParams = Object.entries(endpoint.params?.body ?? {});

  // Generate type coercion
  const coercions: string[] = [];
  for (const [name, def] of [...queryParams, ...bodyParams]) {
    if (def.type === "number") {
      coercions.push(
        `  const ${name}Value = args.${name} !== undefined ? Number(args.${name}) : undefined;`,
      );
    } else if (def.type === "boolean") {
      coercions.push(
        `  const ${name}Value = args.${name} !== undefined ? args.${name} === "true" : undefined;`,
      );
    }
  }

  // Build the request options
  const pathReplacements = pathParams
    .map((p) => `.replace(":${p}", args.${p})`)
    .join("");

  const queryObj = queryParams
    .map(([p, def]) => {
      if (def.type === "number" || def.type === "boolean") {
        return `${p}: ${p}Value !== undefined ? String(${p}Value) : undefined`;
      }
      return `${p}: args.${p}`;
    })
    .join(", ");

  const bodyObj = bodyParams
    .map(([p, def]) => {
      if (def.type === "number") return `${p}: ${p}Value`;
      if (def.type === "boolean") return `${p}: ${p}Value`;
      return `${p}: args.${p}`;
    })
    .join(", ");

  return `import { client } from "../client";

export async function ${toCamelCase(endpoint.name)}Command(args: Record<string, string>) {
${coercions.length > 0 ? `${coercions.join("\n")}\n` : ""}  const path = "${endpoint.path}"${pathReplacements};

  const response = await client.request({
    method: "${endpoint.method}",
    path,${queryParams.length > 0 ? `\n    query: { ${queryObj} },` : ""}${bodyParams.length > 0 ? `\n    body: { ${bodyObj} },` : ""}
  });

  console.log(JSON.stringify(response, null, 2));
}
`;
}

/**
 * Renders the generated package.json.
 */
export function renderPackageJson(schema: ClipSchema): string {
  const dependencies: Record<string, string> = {
    commander: "^15.0.0",
  };
  if (schema.auth.type === "browser-login") {
    dependencies["@nocoo/base-cli"] = "^0.3.0";
  }
  const pkg = {
    name: schema.alias,
    version: schema.version,
    type: "module",
    bin: {
      [schema.alias]: "src/index.ts",
    },
    scripts: {
      test: "bun test",
    },
    dependencies,
  };

  return `${JSON.stringify(pkg, null, 2)}\n`;
}

/**
 * Renders the browser-login subcommand for the generated CLI.
 *
 * The generated `login` command opens the configured auth URL in a
 * browser, waits for the loopback callback with the api token, and saves
 * the result as BrowserLoginCredentials under `~/.clip/<alias>/credentials.json`.
 */
export function renderLoginCommand(schema: ClipSchema): string {
  /* v8 ignore start -- defensive guard; caller already checks auth.type */
  if (schema.auth.type !== "browser-login") {
    throw new Error("renderLoginCommand requires auth.type === browser-login");
  }
  /* v8 ignore stop */
  const a = schema.auth;
  const apiUrl = a.loginUrl ? new URL(a.loginUrl).origin : schema.baseUrl;
  const loginPath = a.loginUrl
    ? (() => {
        const u = new URL(a.loginUrl);
        return `${u.pathname}${u.search}${u.hash}`;
      })()
    : a.loginPath;
  const tokenParam = a.tokenParam;

  return `import { performLogin, openBrowser } from "@nocoo/base-cli";
import { chmod, mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

export async function loginCommand(): Promise<void> {
  const alias = "${schema.alias}";
  const clipHome = process.env.CLIP_HOME ?? join(homedir(), ".clip");
  const dir = join(clipHome, alias);
  const credPath = join(dir, "credentials.json");

  // Honour CLIP_BASE_URL the same way client.ts does, so a single env var
  // overrides BOTH business calls and the login endpoint. This lets users
  // of self-hosted deployments redirect every request without rebuilding
  // the CLI; default falls back to the URL baked in at codegen time.
  const apiUrl = process.env.CLIP_BASE_URL ?? "${apiUrl}";

  console.log(\`🔐 Opening browser to log in to "\${alias}"...\`);

  let savedToken: string | null = null;
  const result = await performLogin({
    apiUrl,
    loginPath: "${loginPath}",
    tokenParam: "${tokenParam}",
    timeoutMs: 5 * 60 * 1000,
    openBrowser,
    onSaveToken: (token: string) => {
      savedToken = token;
    },
    log: (msg: string) => console.log(msg),
  });

  if (!result.success || !savedToken) {
    console.error(\`❌ Login failed: \${result.error ?? "no token received"}\`);
    process.exit(1);
  }

  await mkdir(dir, { recursive: true });
  await chmod(dir, 0o700);
  await writeFile(
    credPath,
    JSON.stringify(
      {
        type: "browser-login",
        token: savedToken,
        ...(result.email ? { email: result.email } : {}),
      },
      null,
      2,
    ),
  );
  await chmod(credPath, 0o600);

  console.log(
    \`✅ Logged in to "\${alias}"\${result.email ? \` as \${result.email}\` : ""}\`,
  );
}
`;
}

/**
 * Renders the generated tsconfig.json.
 */
export function renderTsconfig(): string {
  const config = {
    compilerOptions: {
      target: "ESNext",
      module: "ESNext",
      moduleResolution: "bundler",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      outDir: "dist",
      rootDir: "src",
      types: ["@types/bun"],
    },
    include: ["src/**/*.ts", "tests/**/*.ts"],
  };

  return `${JSON.stringify(config, null, 2)}\n`;
}

// --- Utilities ---

function extractPathParams(path: string): string[] {
  return (path.match(/:([a-zA-Z0-9_]+)/g) || []).map((p) => p.slice(1));
}

function toCamelCase(name: string): string {
  return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
