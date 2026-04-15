import { resolve } from "node:path";
import { generate } from "./generate";

/**
 * `clip install [path]` — generate + bun link the generated CLI.
 */
export async function install(schemaPath: string): Promise<void> {
  const schema = await (await import("../schema/parser")).parseClipSchema(
    schemaPath,
  );
  await generate(schemaPath);

  const outputDir = resolve(`.clip-output/${schema.alias}`);

  const proc = Bun.spawn(["bun", "link"], {
    cwd: outputDir,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    console.error("❌ bun link failed");
    process.exit(exitCode);
  }

  console.log(`✅ Installed "${schema.alias}" command globally`);
}
