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
${imports}

program
  .name("${schema.alias}")
  .version("${schema.version}")
  .description("${schema.name}");

${commands}

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
  query?: Record<string, string>;
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
    };

    headers[config.headerName] = config.headerValue;

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
 */
export function renderConfig(schema: ClipSchema): string {
  return `import { readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

interface Credentials {
  headerName: string;
  headerValue: string;
}

export async function loadConfig(): Promise<Credentials> {
  const clipHome = process.env.CLIP_HOME ?? join(homedir(), ".clip");
  const credPath = join(clipHome, "${schema.alias}", "credentials.json");
  try {
    const raw = await readFile(credPath, "utf-8");
    return JSON.parse(raw) as Credentials;
  } catch {
    console.error("No credentials found. Run: clip auth set ${schema.alias}");
    process.exit(1);
  }
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
    dependencies: {
      commander: "^14.0.0",
    },
  };

  return `${JSON.stringify(pkg, null, 2)}\n`;
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
