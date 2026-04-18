import { generateCli } from "../codegen/generator";
import { generateTests } from "../codegen/test-generator";
import { parseClipSchema } from "../schema/parser";

/**
 * `clip generate [path]` — reads clip.yaml, generates CLI + tests.
 *
 * Optionally accepts an explicit `outputDir` to override the default
 * `.clip-output/<alias>/` location.
 */
export async function generate(
  schemaPath: string,
  outputDir?: string,
): Promise<void> {
  const schema = await parseClipSchema(schemaPath);
  const dir = await generateCli(schema, outputDir);
  await generateTests(schema, dir);
  console.log(`✅ CLI generated at ${dir}/`);
}
