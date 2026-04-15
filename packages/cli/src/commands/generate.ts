import { generateCli } from "../codegen/generator";
import { generateTests } from "../codegen/test-generator";
import { parseClipSchema } from "../schema/parser";

/**
 * `clip generate [path]` — reads clip.yaml, generates CLI + tests.
 */
export async function generate(schemaPath: string): Promise<void> {
  const schema = await parseClipSchema(schemaPath);
  const outputDir = await generateCli(schema);
  await generateTests(schema, outputDir);
  console.log(`✅ CLI generated at ${outputDir}/`);
}
