import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import type { ClipSchema } from "./types";
import { ClipSchemaError } from "./types";
import { ClipSchemaZod, validateSemantics } from "./validator";

export async function parseClipSchema(filePath: string): Promise<ClipSchema> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch (err) {
    throw new Error(
      `Failed to read schema file: ${filePath} — ${(err as Error).message}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new Error(`Invalid YAML in ${filePath}: ${(err as Error).message}`);
  }

  const validated = ClipSchemaZod.parse(parsed);
  const semanticErrors = validateSemantics(validated);

  if (semanticErrors.length > 0) {
    throw new ClipSchemaError(semanticErrors);
  }

  return validated;
}
