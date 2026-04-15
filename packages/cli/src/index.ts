#!/usr/bin/env bun
import { program } from "commander";
import { authRemove, authSet, authShow } from "./commands/auth";
import { generate } from "./commands/generate";
import { install } from "./commands/install";
import { testCommand } from "./commands/test";

program
  .name("clip")
  .version("0.0.1")
  .description("Generate CLIs from API schemas");

// clip generate [path]
program
  .command("generate [path]")
  .description("Generate CLI from clip.yaml schema")
  .action(async (path?: string) => {
    await generate(path ?? "clip.yaml");
  });

// clip install [path]
program
  .command("install [path]")
  .description("Generate and link CLI globally")
  .action(async (path?: string) => {
    await install(path ?? "clip.yaml");
  });

// clip auth
const auth = program.command("auth").description("Manage API credentials");

auth
  .command("set <alias>")
  .description("Save API key credentials")
  // Known limitation: --key flag exposes the value in shell history.
  // Acceptable for MVP; recommend using the interactive prompt (omit --key) for production use.
  .option(
    "--key <value>",
    "API key value (Warning: key may be visible in shell history. Use interactive prompt for sensitive keys)",
  )
  .option("--header <name>", "Auth header name")
  .action(async (alias: string, opts: { key?: string; header?: string }) => {
    await authSet(alias, opts);
  });

auth
  .command("show <alias>")
  .description("Display masked credentials")
  .action(async (alias: string) => {
    await authShow(alias);
  });

auth
  .command("remove <alias>")
  .description("Remove stored credentials")
  .option("-f, --force", "Skip confirmation prompt")
  .action(async (alias: string, opts: { force?: boolean }) => {
    await authRemove(alias, opts);
  });

// clip test <alias>
program
  .command("test <alias>")
  .description("Run generated tests against a live API")
  .option("--base-url <url>", "Override base URL")
  .option("--api-key <key>", "Override API key")
  .action(
    async (alias: string, opts: { baseUrl?: string; apiKey?: string }) => {
      await testCommand(alias, opts);
    },
  );

program.parse();
