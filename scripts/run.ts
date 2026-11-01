import { spawnSync } from "node:child_process";

import { redactSecrets } from "./redact";

export function runCommand(
  command: string,
  args: string[],
  options?: { redact?: boolean },
): void {
  const result = spawnSync(command, args, {
    env: process.env,
    encoding: "utf8",
    stdio: options?.redact ? ["inherit", "pipe", "pipe"] : "inherit",
  });

  if (options?.redact) {
    if (result.stdout) process.stdout.write(redactSecrets(result.stdout));
    if (result.stderr) process.stderr.write(redactSecrets(result.stderr));
  }

  if (result.error) {
    console.error(redactSecrets(result.error.message));
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
