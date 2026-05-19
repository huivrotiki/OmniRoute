#!/usr/bin/env node

/**
 * Password Reset CLI — T-38
 *
 * Usage:
 *   node bin/reset-password.mjs
 *   npx omniroute reset-password
 *
 * Resets the admin password for OmniRoute.
 * Prompts for a new password and updates the database directly.
 *
 * @module bin/reset-password
 */

import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import bcrypt from "bcryptjs";

const APP_NAME = "omniroute";
const BCRYPT_SALT_ROUNDS = 12;

function resolveDataDir() {
  const configured = process.env.DATA_DIR?.trim();
  if (configured) return resolve(configured);

  const homeDir = homedir();
  if (platform() === "win32") {
    const appData = process.env.APPDATA || resolve(homeDir, "AppData", "Roaming");
    return resolve(appData, APP_NAME);
  }

  const xdgConfigHome = process.env.XDG_CONFIG_HOME?.trim();
  if (xdgConfigHome) return resolve(xdgConfigHome, APP_NAME);

  return resolve(homeDir, `.${APP_NAME}`);
}

const DATA_DIR = resolveDataDir();
const DB_PATH = resolve(DATA_DIR, "storage.sqlite");

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function generateSecretDigest(input) {
  return bcrypt.hashSync(input, BCRYPT_SALT_ROUNDS);
}

console.log("\n🔑 OmniRoute — Password Reset\n");

async function main() {
  // Check if database exists
  if (!existsSync(DB_PATH)) {
    console.error(`❌ Database not found at: ${DB_PATH}`);
    console.error(`   Make sure OmniRoute has been started at least once.`);
    console.error(`   Or set DATA_DIR env var to your data directory.\n`);
    process.exit(1);
  }

  let Database;
  try {
    Database = (await import("better-sqlite3")).default;
  } catch {
    console.error("❌ better-sqlite3 not installed. Run: npm install");
    process.exit(1);
  }

  const db = new Database(DB_PATH);

  // Check current settings
  const row = db
    .prepare("SELECT value FROM key_value WHERE namespace = 'settings' AND key = 'password'")
    .get();

  if (row) {
    console.log("ℹ️  A password is currently set.");
  } else {
    console.log("ℹ️  No password is currently set.");
  }

  const password = await ask("Enter new password (min 8 chars): ");

  if (!password || password.length < 8) {
    console.error("\n❌ Password must be at least 8 characters.\n");
    db.close();
    rl.close();
    process.exit(1);
  }

  const confirm = await ask("Confirm new password: ");

  if (password !== confirm) {
    console.error("\n❌ Passwords do not match.\n");
    db.close();
    rl.close();
    process.exit(1);
  }

  const hashed = generateSecretDigest(password);

  const upsert = db.prepare(
    "INSERT OR REPLACE INTO key_value (namespace, key, value) VALUES ('settings', ?, ?)"
  );
  const tx = db.transaction(() => {
    upsert.run("password", JSON.stringify(hashed));
    upsert.run("requireLogin", JSON.stringify(true));
    upsert.run("setupComplete", JSON.stringify(true));
  });
  tx();

  db.close();
  rl.close();

  console.log("\n✅ Password reset successfully!");
  console.log("   Restart OmniRoute for changes to take effect.\n");
}

main().catch((err) => {
  console.error(`\n❌ Error: ${err.message}\n`);
  rl.close();
  process.exit(1);
});
