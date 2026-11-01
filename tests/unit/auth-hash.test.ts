import { spawn } from "node:child_process";
import { compare } from "bcryptjs";
import { describe, expect, it } from "vitest";

function runHash(
  args: string[],
  input?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/auth-hash.mjs", ...args], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
    if (input === undefined) child.stdin.end();
    else child.stdin.end(input);
  });
}

describe("auth:hash", () => {
  it("hashes stdin and does not print the password", async () => {
    const password = "stdin-fixture-password";
    const result = await runHash([], password);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.includes(password)).toBe(false);
    const hash = result.stdout.trim();
    expect(hash.startsWith("$2")).toBe(true);
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
    await expect(compare(password, hash)).resolves.toBe(true);
    await expect(compare("other-password", hash)).resolves.toBe(false);
  }, 20_000);

  it("refuses a password passed as an argument", async () => {
    const result = await runHash(["do-not-pass-this"]);
    expect(result.code).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/argument/i);
    expect(result.stderr).not.toContain("do-not-pass-this");
  });

  it("rejects an empty password", async () => {
    const result = await runHash([], "");
    expect(result.code).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/No password/);
  });
});
