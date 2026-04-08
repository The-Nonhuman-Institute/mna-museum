#!/usr/bin/env tsx
/**
 * MNA Steward Terminal — password hash generator.
 *
 * Usage:
 *   npm run hash-password
 *
 * Prompts for a password (input is hidden), hashes it with bcrypt at
 * cost factor 12, and prints the hash to stdout. Copy the hash into
 * terminal/.env as STEWARD_PASSWORD_HASH.
 *
 * This is a one-time setup tool. Run it once when installing the
 * terminal, and again only if you want to rotate the steward password.
 */
import bcrypt from "bcryptjs";
import readline from "readline";

function promptHidden(query: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Mute output by swapping write on the stdout stream referenced by rl
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const muted = (rl as unknown as { output: any }).output;
    const originalWrite = muted.write.bind(muted);
    muted.write = (chunk: string, ...rest: unknown[]) => {
      if (typeof chunk === "string" && chunk.includes(query)) {
        // Let the prompt render normally
        return originalWrite(chunk, ...rest);
      }
      // Suppress echoed characters while typing the password
      return true;
    };

    rl.question(query, (answer) => {
      muted.write = originalWrite;
      process.stdout.write("\n");
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  console.log("\nMNA Steward Terminal — password hash generator");
  console.log("───────────────────────────────────────────────");
  const password = await promptHidden("Steward password: ");

  if (!password || password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const confirm = await promptHidden("Confirm password: ");
  if (confirm !== password) {
    console.error("Passwords do not match.");
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);

  console.log("\nHash generated. Copy the line below into terminal/.env:\n");
  console.log(`STEWARD_PASSWORD_HASH='${hash}'`);
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
