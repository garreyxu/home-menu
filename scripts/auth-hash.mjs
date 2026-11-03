#!/usr/bin/env node
// Read a password from stdin and print a bcrypt hash.
// The password is never taken from argv and is not written to stdout.
import bcrypt from "bcryptjs";

const BCRYPT_COST = 12;

if (process.argv.length > 2) {
  process.stderr.write(
    "Refusing to read a password from arguments. Run pnpm auth:hash and type it at the prompt, or pipe it on stdin.\n",
  );
  process.exit(1);
}

function readPipedPassword() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on("data", (chunk) => {
      chunks.push(chunk);
    });
    process.stdin.on("error", reject);
    process.stdin.on("end", () => {
      const text = Buffer.concat(chunks)
        .toString("utf8")
        .replace(/\r?\n$/, "");
      resolve(text);
    });
  });
}

function readTtyPassword() {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stderr;
    stdout.write("Password: ");
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let password = "";
    let skippingEscape = false;
    let settled = false;

    const cleanup = () => {
      stdin.off("data", onData);
      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.pause();
    };

    const finish = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      stdout.write("\n");
      resolve(value);
    };

    const onData = (chunk) => {
      const text = String(chunk);
      for (const char of text) {
        if (skippingEscape) {
          if (/[A-Za-z~]/.test(char)) skippingEscape = false;
          continue;
        }
        if (char === "\u0003") {
          cleanup();
          stdout.write("\n");
          process.exit(130);
        }
        if (char === "\u001b") {
          skippingEscape = true;
          continue;
        }
        if (char === "\r" || char === "\n") {
          finish(password);
          return;
        }
        if (char === "\u007f" || char === "\b") {
          password = password.slice(0, -1);
          continue;
        }
        if (char.charCodeAt(0) < 32) continue;
        password += char;
      }
    };

    stdin.on("data", onData);
  });
}

const password = process.stdin.isTTY
  ? await readTtyPassword()
  : await readPipedPassword();

if (!password) {
  process.stderr.write("No password provided.\n");
  process.exit(1);
}

try {
  const hash = await bcrypt.hash(password, BCRYPT_COST);
  process.stdout.write(`${hash}\n`);
} catch {
  process.stderr.write("Could not hash the password.\n");
  process.exit(1);
}
