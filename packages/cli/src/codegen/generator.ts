import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ClipSchema } from "../schema/types";
import {
  renderClient,
  renderCommand,
  renderConfig,
  renderIndex,
  renderLoginCommand,
  renderPackageJson,
  renderTsconfig,
} from "./templates";

/**
 * Generates a complete CLI project from a validated ClipSchema.
 * Output goes to `outputDir` (default: `.clip-output/<alias>/`).
 */
export async function generateCli(
  schema: ClipSchema,
  outputDir?: string,
): Promise<string> {
  const dir = outputDir ?? join(".clip-output", schema.alias);

  // Create directory structure
  await mkdir(join(dir, "src", "commands"), { recursive: true });

  const auth = schema.auth;
  const isOAuth = auth.type === "oauth";

  const writes: Promise<void>[] = [
    // package.json
    writeFile(join(dir, "package.json"), renderPackageJson(schema)),
    // tsconfig.json
    writeFile(join(dir, "tsconfig.json"), renderTsconfig()),
    // src/config.ts
    writeFile(join(dir, "src", "config.ts"), renderConfig(schema)),
    // src/client.ts
    writeFile(join(dir, "src", "client.ts"), renderClient(schema)),
    // src/index.ts
    writeFile(join(dir, "src", "index.ts"), renderIndex(schema)),
    // src/commands/<name>.ts — one per endpoint
    ...schema.endpoints.map((ep) =>
      writeFile(
        join(dir, "src", "commands", `${ep.name}.ts`),
        renderCommand(ep),
      ),
    ),
    // clip-metadata.json
    writeFile(
      join(dir, "clip-metadata.json"),
      JSON.stringify(
        {
          alias: schema.alias,
          baseUrl: schema.baseUrl,
          auth:
            auth.type === "oauth"
              ? {
                  type: "oauth",
                  headerName: auth.headerName,
                  headerPrefix: auth.headerPrefix,
                  loginPath: auth.loginPath,
                  tokenParam: auth.tokenParam,
                  ...(auth.loginUrl ? { loginUrl: auth.loginUrl } : {}),
                }
              : {
                  type: auth.type,
                  headerName: auth.headerName,
                },
          generatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    ),
  ];

  if (isOAuth) {
    writes.push(
      writeFile(
        join(dir, "src", "commands", "_login.ts"),
        renderLoginCommand(schema),
      ),
    );
  }

  await Promise.all(writes);

  return dir;
}
