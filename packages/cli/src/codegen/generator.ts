import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ClipSchema } from "../schema/types";
import {
  renderClient,
  renderCommand,
  renderConfig,
  renderIndex,
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

  // Generate all files in parallel
  await Promise.all([
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
          auth: {
            type: schema.auth.type,
            headerName: schema.auth.headerName,
          },
          generatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    ),
  ]);

  return dir;
}
