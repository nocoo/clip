#!/usr/bin/env bun
/**
 * Run L2 end-to-end tests.
 *
 * E2E specs use Bun's spawn() to boot demo-app and exec the generated CLI,
 * so we run them with `bun test` (native Bun runner) rather than vitest —
 * vitest's node-mode worker can't resolve the "bun" import.
 *
 * --concurrency=1 keeps test files serial so two parallel demo-app
 * instances don't race for ports or process.chdir().
 *
 * Each test file starts/stops its own demo-app on a random port in
 * beforeAll/afterAll, so there's nothing to start/stop here.
 */

import { spawn } from "bun";

const args = process.argv.slice(2);
const proc = spawn({
  cmd: [
    "bun",
    "test",
    "tests/e2e",
    "--concurrency=1",
    "--timeout",
    "30000",
    ...args,
  ],
  stdout: "inherit",
  stderr: "inherit",
});
const code = await proc.exited;
process.exit(code);
